/**
 * `defineExtension` — the one entry point a plugin author starts from (03, 09).
 *
 * Before this existed, the SDK could express a pipeline and nothing else. An author could
 * build a spec but had nowhere to say *"this is my plugin, here are its lifecycle
 * callbacks, its settings, its node definitions, its components, and the pipelines it
 * ships."* That is the
 * difference between authoring a pipeline and writing a plugin, and it is most of what
 * "download the SDK" has to mean.
 *
 * Since D-1 it says the rest of it too — the **genres**, **surfaces**, **presets**,
 * **configs**, **prompts** and declared **permissions** that were only sayable through
 * `announce()`. One declaration, one build: `serene-pub build` emits a single manifest
 * carrying both halves, and a package no longer has to choose which half of itself to
  * ship. It is the one authoring entry: a package with no code at all declares itself
 * here too — core's own catalog does — and `announcementOf()` compiles it to the
 * announcement document a host syncs.
 *
 * Everything here is a **literal declaration**, because the compiler extracts it from the
 * source without executing it (F6, 03 §3, 13/§30). A registration assembled at runtime is
 * a lint error rather than a silent omission — the manifest has to be a complete statement
 * of what a plugin can do, or the permission model is a guess.
 */

import type { WidgetDecl } from './layout.js'
import { ownWidgets } from './widgetDecls.js'
import { pluginRuleRef } from './pluginRuleRef.js'
import type { BuiltSpec } from './builder.js'
import type { Descriptor } from './descriptors.js'
import type { PluginSettings, SettingsSchema } from './settings.js'
import type { EventListener, LifecycleCallback, LifecycleMoment } from './hooks.js'
import type { Result } from './executor.js'
import { templateSeedProblems, type TemplateSeed } from './templateIds.js'
import { i18nFindings, type I18n } from './i18n.js'
import type { SpecDocument } from './document.js'
import { isSessionEventDecl, type SessionEventDecl } from './events.js'
import {
	preset,
	storedConfig,
	storedEventDeclaration,
	type EventDeclarationInput,
	type StoredEventDeclaration,
	type ConfigDecl,
	type ConfigInput,
	type PresetDecl,
	type HookDeclaration,
	type PresetInput,
	type PromptDecl,
} from './announce.js'
import type { GenreDecl } from './genres.js'
import { annexFieldListFindings, type AnnexFieldDecl } from './annexFields.js'
import type { SurfacesDecl } from './surfaces.js'
import { pluginVariableFindings, type VariableDecl } from './variables.js'
import {
	declarationFindings,
	storedSwap,
	swapInputFindings,
	type StoredSwapContribution,
	type SwapContribution,
} from './declarations.js'

// ── Callable declarations ───────────────────────────────────────────────────

/**
 * The **handler** implementing a node definition (R-1). Data in, expected shape out; the executor is the only caller
 * (01 §9). **Private** (the default) means only this extension's pipelines may use the
 * node — not another package's, not one a person authors; **public** means any may, which
 * is how peer composition happens — as a node on the spine, never a peer call mid-run
 * (F10). The node's visibility is this, and only this (R62): the definition does not
 * say `public` itself. Enforced at install, at publish and at the run.
 * @experimental
 */
export interface HandlerDecl<D extends Descriptor<any, any, any> = Descriptor> {
	readonly __decl: 'handler'
	type: D
	visibility: 'private' | 'public'
	handler: (input: any, ctx: any) => Result | Promise<Result>
	/**
	 * Always its own process. There is no in-process option, and that is a rule
	 * rather than a default.
	 *
	 * An extension hook running inside Serene Pub's process cannot be stopped —
	 * a runaway loop or a blocking call takes the whole application with it, and
	 * F36's promise that every hook invocation is bounded becomes unenforceable
	 * (13 §7h). It also shares the host's memory, so a crash is the host's crash
	 * and a leak is the host's leak.
	 *
	 * Kept as a field rather than dropped because the *value* still travels into
	 * the registry row, where install-time validation reads it without executing
	 * the plugin (F6). A manifest claiming anything else is refused there.
	 */
	runtime?: 'process'
}

/** @public */
export function handler<D extends Descriptor<any, any, any>>(
	definition: D | { descriptor: D },
	fn: HandlerDecl<D>['handler'],
	opts: { visibility?: 'private' | 'public' } = {},
): HandlerDecl<D> {
	const descriptor = ('descriptor' in definition ? definition.descriptor : definition) as D
	return {
		__decl: 'handler',
		type: descriptor,
		// The one knob (R62): a node is as public as its handler, private
		// unless its author says otherwise here.
		visibility: opts.visibility ?? 'private',
		handler: fn,
		// Not configurable. See the note on the field.
		runtime: 'process',
	}
}

/** @experimental */
export interface LifecycleCallbackDecl {
	readonly __decl: 'lifecycle-callback'
	moment: LifecycleMoment
	handler: LifecycleCallback
	timeoutMs?: number
}

/** @experimental */
export const lifecycleCallback = (
	moment: LifecycleMoment,
	handler: LifecycleCallback,
	opts: { timeoutMs?: number } = {},
): LifecycleCallbackDecl => ({ __decl: 'lifecycle-callback', moment, handler, ...opts })

/**
 * One subscription. **Many may register against one event** — several
 * extensions, and several of one extension's listeners — so this is an entry in a
 * list rather than a claim on a name.
 *
 * There is deliberately nothing here for ordering or for using your return
 * value, and both absences are the same absence. Delivery is fire-and-forget
 * (01 §9c, 11 §3): your return is dropped, and dispatch order is **declaration
 * order** — the order you wrote your own subscriptions in, tie-broken across
 * extensions by plugin id. A `priority` field would manufacture an ordering
 * guarantee core does not give, and be a collision of its own the moment two
 * extensions claimed the same number; a `kind: 'filter'` field would let one
 * extension rewrite what the next one is told. Neither is a thing you can ask
 * for, which is why neither is a thing you have to defend against.
 * @experimental
 */
export interface EventListenerDecl {
	readonly __decl: 'event-listener'
	/** The event heard — a core event id, or a package's declared event (stored as its id). */
	event: string
	handler: EventListener
	/**
	 * This subscription's own budget. Defaults to a small one, and is clamped by
	 * the host: an event's subscribers **share one budget** rather than each
	 * getting their own, so a long deadline here is a claim on how much of a
	 * shared ceiling you intend to spend, not a private allowance.
	 */
	timeoutMs?: number
}

/** @public */
export const eventListener = (
	event: string | SessionEventDecl,
	handler: EventListener,
	opts: { timeoutMs?: number } = {},
): EventListenerDecl => ({
	__decl: 'event-listener',
	event: isSessionEventDecl(event) ? event.id : event,
	handler,
	...opts,
})

// ── Components ──────────────────────────────────────────────────────────────

/**
 * The one unit of custom UI (§3.5, R25): a module the page's UI worker runs,
 * placing elements from the host vocabulary (`SP_HOST_ELEMENTS`), which the
 * host mirrors into the box it is mounted in. A {@link WidgetDecl} names one
 * by `component`; a page mount point will name one the same way.
 *
 * It runs in a worker, never in the host's document: one worker per owner
 * (core, or one plugin) per session page. Its only path to data is the
 * component client's port; it imports only `COMPONENT_IMPORTS`.
 * @experimental
 */
export interface ComponentDecl {
	readonly __decl: 'component'
	/** Unique within the package — a widget's `component` names it. */
	slug: string
	/** What an admin sees it called — a string or a locale map (R-20). */
	label: I18n
	/**
	 * The component's source — `.svelte`, `.ts` or `.js` — relative to the
	 * package root. `serene-pub build` compiles it into one module under
	 * `dist/plugin/components/`, and the manifest names that built file.
	 */
	entry: string
	/**
	 * Which adapter renders it (R35, R37): Svelte, compiled, and vanilla —
	 * plain DOM, which needs no compiler and proves the seam is not
	 * Svelte-shaped. Preact, and React on `preact/compat`, come after 1.0.
	 */
	framework: ComponentFramework
	/** Per-instance settings, delivered as a widget's are (`settings.v1`). */
	settings?: SettingsSchema
	/**
	 * A clone records its upstream, so an update can be offered (R-fork):
	 * the upstream component's slug, its package's version, and — experimental
	 * (C6) — the `sourceHash` of the source it was cloned from (core's
	 * `dist/components/<slug>.source.json` carries it), so "the upstream
	 * changed since you cloned" is a hash comparison, not a version guess.
	 */
	basedOn?: { component: string; version: string; sourceHash?: string }
}

/** The component frameworks SDK 1.0 ships (R35). The list grows; it never shrinks. @experimental */
export const COMPONENT_FRAMEWORKS = ['svelte', 'vanilla'] as const
/** @experimental */
export type ComponentFramework = (typeof COMPONENT_FRAMEWORKS)[number]

/** @public */
export const component = (d: Omit<ComponentDecl, '__decl'>): ComponentDecl => ({
	__decl: 'component',
	...d,
})

// ── Declared permissions ────────────────────────────────────────────────────

/**
 * The sandbox permissions a plugin declares, as against the ones the packager
 * compiles from its calls. Two axes only: **storage**, a private row/file store
 * with a quota, and **network**, an allowlist of hosts its Providers may reach.
 *
 * Nothing else belongs here. Resources and events are compiled — an event
 * subscription is a call site the packager reads, so declaring one would let a
 * manifest disagree with the code. A quota and a host cannot be read off a call
 * site, which is the whole reason these two are declared.
 * @experimental
 */
export interface DeclaredPermissions {
	storage?: { quotaBytes?: number }
	network?: { hosts?: string[] }
}

/** The quota band an author may ask for. An instance clamps into its own. @experimental */
export const MIN_STORAGE_QUOTA = 1024
/** @experimental */
export const MAX_STORAGE_QUOTA = 256 * 1024 * 1024

/**
 * A declared fetch host: an exact host, a `*.suffix` / bare `*` wildcard, each
 * with an optional `:port`. The instance enforces the match and the internal-IP
 * block at call time; this only pins the authoring vocabulary.
 */
const HOSTNAME = /^(?:\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::\d+)?$/i

/**
 * What is wrong with a declared permission set, in the same words the CLI's
 * sandbox-manifest compiler uses — a package that moves from a separate
 * manifest to this field gets the same answer to the same mistake.
 * @experimental
 */
export function permissionFindings(p: DeclaredPermissions | undefined): string[] {
	const out: string[] = []
	if (!p) return out
	if (p.storage) {
		const q = p.storage.quotaBytes
		if (
			q !== undefined &&
			(typeof q !== 'number' || !Number.isFinite(q) || q < MIN_STORAGE_QUOTA || q > MAX_STORAGE_QUOTA)
		)
			out.push(
				`permissions.storage.quotaBytes must be ${MIN_STORAGE_QUOTA}…${MAX_STORAGE_QUOTA}. ` +
					`A pub clamps whatever it is handed, so a number outside the band is not a ` +
					`bigger grant — it is a declaration that says something other than what you get.`,
			)
	}
	if (p.network) {
		const hosts = p.network.hosts ?? []
		if (!Array.isArray(hosts) || hosts.length === 0)
			out.push(
				`permissions.network requires a non-empty hosts allowlist — name the hosts you reach ` +
					`('api.example.com', '*.example.com'). A network request naming none reaches nothing.`,
			)
		else
			for (const host of hosts)
				if (typeof host !== 'string' || !HOSTNAME.test(host))
					out.push(
						`permissions.network host '${String(host)}' is not a valid host, wildcard, or host:port.`,
					)
	}
	return out
}

// ── Template engines a plugin ships ─────────────────────────────────────────

/**
 * @experimental What the host hands a plugin's template engine for one
 * render — data only; a render is a pure function of it.
 */
export interface TemplateEngineHookInput {
	/** The template source, in this engine's language. */
	template: string
	/** The variables the template renders against. */
	variables: Record<string, unknown>
	/** The prompt format key the render is for, or `null` where none applies. */
	promptFormat: string | null
	/**
	 * The completion template that format names, resolved — a prefix and a
	 * suffix per role — so an engine can wrap blocks the way core does.
	 * `null` where the caller had no row to resolve (a preview, an admin test).
	 */
	completionTemplate: Record<string, unknown> | null
}

/**
 * @experimental A plugin's template-engine render function: template and
 * variables in, the rendered string out. Declared under
 * `ExtensionDecl.templateEngines`, run in the sandbox as a task.
 */
export type TemplateEngineHook = (input: TemplateEngineHookInput) => string | Promise<string>

/** The template-engine id grammar — `<namespace>:template/<name>@<major>`. */
const TEMPLATE_ENGINE_ID = /^([a-z0-9][a-z0-9.-]*):template\/([a-z0-9][a-z0-9-]*)@(\d+)$/

// ── The extension ───────────────────────────────────────────────────────────

/** @experimental */
export interface ExtensionDecl {
	/** `vendor.plugin` — the owner segment of every id this plugin registers (F2). */
	slug: string
	/** What the plugin is called where it is listed — a string or a locale map with `en` (R-20). */
	name: I18n
	version: string
	description?: I18n
	/** Who publishes it, as the plugin list credits them. */
	author?: string
	/** Where its source lives, when it is public. */
	repo?: string
	/**
	 * Supported SP range, separate from the SDK range (09) — npm-style
	 * (`{ 'serene-pub': '>=0.7 <0.8' }`). Version ranges and nothing else: a
	 * template engine this plugin ships is `templateEngines` (R1).
	 */
	engines?: { 'serene-pub'?: string }
	/**
	 * Template engines this plugin ships, by engine id — each the function that
	 * renders a template in that language, run in the sandbox like every other
	 * hook (`{ 'acme.x:template/mustache@1': renderMustache }`).
	 *
	 * The id is `<slug>:template/<name>@<major>`, under this plugin's own
	 * namespace. The packager names each function's export and writes the map
	 * to the manifest's `templateEngines` as `{ '<engine id>': '<hook name>' }`;
	 * the host registers a forwarding renderer per entry. A render must be a
	 * pure function of its input — the host pins the clock and the RNG seed.
	 */
	templateEngines?: Record<string, TemplateEngineHook>
	settings?: PluginSettings<any>
	/**
	 * The code this plugin runs: node definitions with the handlers that
	 * implement them (`handler()`), lifecycle callbacks and event listeners.
	 */
	handlers?: Array<HandlerDecl<any> | LifecycleCallbackDecl | EventListenerDecl>
	/**
	 * The hooks this package defines — points where other authored code may
	 * run, by key (namespaced `<slug>:hook/<key>` in the announcement). Core
	 * declares its own here. A plugin's do not reach its manifest yet, so the
	 * packager refuses them until the manifest carries declared points.
	 */
	hooks?: Record<string, HookDeclaration>
	/**
	 * Events this package declares and who may record them: for each, the
	 * event (`defineSessionEvent(…)`), the genre it belongs to, and the
	 * subjects whose pipelines may record it — `{ spec, key }` picks, event
	 * ids of the genre, spec values, or `'any'`. A pipeline outside that list
	 * is refused when it records the event.
	 */
	events?: EventDeclarationInput[]
	components?: ComponentDecl[]
	/**
	 * The widgets this package offers (R71) — `widget({ … })` values, each
	 * naming one of `components` and optionally scoped to genres. A genre
	 * withholds any of them by value (`omitWidgets`); a session offers every
	 * widget scoped to its genre or to all. The instance knows each under this
	 * package's namespace (`<slug>:<id>`).
	 */
	widgets?: WidgetDecl[]
	/**
	 * This package's **annex declaration** (ruling 2026-09-26): every key it
	 * keeps in its session annex document, declared once with `annexField()`
	 * — the shape its value must have, who may see it (`see`) and, when a
	 * person may set it, who (`act`). The single source of truth: your
	 * pipelines' `set-session-annex` steps may write only these keys, and the
	 * audience stored with a value is the field's `see`. A field with `act`
	 * is set from a widget with `invoke(annexFieldAction('<slug>', key), {
	 * payload: { value } })` — core's one pipeline writes it. A field only for
	 * one genre's sessions takes `genre`.
	 * @experimental
	 */
	annexFields?: AnnexFieldDecl[]
	/**
	 * Context variables this package declares (`definePluginVariable()`
	 * values), for an instance to register. A variable a plugin defines exists
	 * only in the plugin's own process until it travels in the manifest — so a
	 * band whose variable an instance never heard of is refused at install.
	 *
	 * **You rarely list one here.** Every variable a band of your handlers'
	 * definitions declares (`Descriptor.bands`) is collected for you — a band
	 * is already a value holding its variable, and a list you had to keep in
	 * step with it would be the list that goes stale. Name a variable here
	 * when nothing's `bands` holds it: one a shipped layout or template renders
	 * on its own. Ids sit under this package's namespace (`<slug>:var/…`);
	 * `core:` and another package's namespace are refused.
	 *
	 * Additive: a package declaring none emits the manifest it did before.
	 * @experimental
	 */
	variables?: VariableDecl[]
	/** Pipelines shipped with the plugin — built specs, or documents already compiled. Compiled at build time (F6). */
	pipelines?: Array<BuiltSpec | SpecDocument>
	/**
	 * Genres this plugin declares (24 §3, D-1) — a genre is a package-level
	 * declaration like a pipeline, so it belongs where the package is declared.
	 *
	 * Before D-1 a genre could only be declared through `announce()`, and a
	 * package with both a genre and its own node definitions had to export two
	 * declarations and build only one of them: the artifact carried the genre
	 * and not the handlers, or the handlers and not the genre. Every genre
	 * plugin is that package.
	 *
	 * Ids sit under the plugin's slug on the same terms a definition id does —
	 * `showcase.battleship:genre/battleship`, never somebody else's namespace.
	 * Referencing another package's genre is done from a spec's input binding,
	 * which is a reference rather than a claim of ownership. And a genre needs
	 * exactly one create pipeline in `pipelines`, so the two fields are checked
	 * against each other rather than separately.
	 */
	genres?: GenreDecl[]
	/**
	 * Frame surfaces this plugin ships (20 §12, 21 §7): documents an instance
	 * mounts in opaque-origin iframes. Declared, never discovered — an instance
	 * renders what the manifest says and `serene-pub ui` renders the same list,
	 * so a surface a modder previewed is a surface an instance will offer.
	 *
	 * Distinct from `components`, and the difference is a trust decision: a
	 * frame gets a document and a MessageChannel, a component gets the host's
	 * own DOM.
	 */
	surfaces?: SurfacesDecl
	/** Named configurations over this plugin's specs — typed deltas (24 §7), made by `config()`. */
	configs?: ConfigInput<any>[]
	/**
	 * Presets: which pipelines a session of a genre runs. Each binds spec
	 * values on the events their inlet locks answer.
	 */
	presets?: PresetInput[]
	/** Authored prose for a node's prompts slot, shipped as rows (24 T6b). */
	prompts?: PromptDecl[]
	/**
	 * This plugin's definitions, offered on another package's swappable nodes —
	 * e.g. a turn strategy on chat's turn-order spec, node
	 * `decide.rules.strategy`. The node key is checked against a spec value
	 * here; the instance checks exposure and fit at install.
	 */
	swaps?: SwapContribution[]
	/**
	 * What this plugin asks the sandbox for (12 §6): a storage quota, a network
	 * allowlist. **Declared, because nothing else can compile them** — the
	 * packager derives the rest of the permission list from what the code
	 * actually calls, but a quota is a number and a host is a name, and neither
	 * appears in a call site.
	 *
	 * A declaration is a request, never a grant: an instance clamps the quota
	 * into its own band, an administrator may deny any single entry, and until
	 * somebody has looked at it the plugin runs with the grant refused. A
	 * declaration also cannot subtract — what the static scan compiled from the
	 * code is in the manifest whether this field mentions it or not.
	 *
	 * Folded in here so a package declares its permissions in the one place it
	 * declares everything else. The separate `ManifestInput` the CLI's sandbox
	 * compiler accepts still works for a package that has not moved.
	 */
	permissions?: DeclaredPermissions
	/**
	 * Template rows shipped with the plugin — prompts, context templates and
	 * variable layouts, each under an owner-namespaced **template id** (R19).
	 *
	 * Beside `pipelines` because that is the gap: a plugin could ship a spec
	 * whose configuration points at a prompt, and had no way to ship the prompt.
	 * The instance projects these the way it projects a `preset()` — created on
	 * enable, immutable to users, **marked withdrawn rather than deleted** when
	 * the plugin goes, because a pipeline's stored configuration holds the row's
	 * id and deleting it would leave that configuration pointing at nothing the
	 * moment somebody switched an extension off.
	 *
	 * A new major of a template is a NEW entry under a new id; the old id keeps
	 * resolving to the row every spec pinned to it was written against.
	 */
	templates?: readonly TemplateSeed[]
	/**
	 * Dependencies on **public handlers** other plugins expose. Definition-level pins
	 * only; runtime peer invocation is banned (F10, 01 §9b).
	 */
	peerTypes?: string[]
}

/**
 * What `defineExtension()` returns: the declaration with every reference read
 * down to its id — the shapes the packager writes into the manifest.
 * @experimental
 */
export interface Extension extends Omit<ExtensionDecl, 'configs' | 'presets' | 'swaps' | 'events'> {
	readonly __extension: true
	configs?: ConfigDecl[]
	presets?: PresetDecl[]
	swaps?: StoredSwapContribution[]
	events?: StoredEventDeclaration[]
}

/** @experimental */
export class ExtensionError extends Error {}

const SLUG = /^[a-z0-9]+([.-][a-z0-9]+)*$/

/**
 * Declare a plugin. Validated here rather than at install, because an error an author
 * sees while writing costs a minute and the same error at install costs a support thread.
 * @public
 */
export function defineExtension(d: ExtensionDecl): Extension {
	const problems: string[] = []
	if (!SLUG.test(d.slug)) {
		problems.push(
			`'${d.slug}' is not a valid plugin slug — lowercase letters, digits, dots and hyphens ` +
				`(e.g. 'chariot.dice-tray'). It is the namespace every id you register must sit under.`,
		)
	}
	if (!/^\d+\.\d+\.\d+/.test(d.version)) {
		problems.push(
			`'${d.version}' is not semver. A plugin upgrades by version comparison (12 §3b).`,
		)
	}
	// The display text (R-20): the name the plugin list shows and the
	// description under it. The packager and the install repeat this check
	// over the manifest, because a bundle may have been built against an
	// older SDK.
	problems.push(...i18nFindings(d.name, 'name', { required: true }))
	problems.push(...i18nFindings(d.description, 'description'))

	// `engines` is version ranges only (R1). A namespaced key there is a
	// template engine put in the wrong map — no host reads it as one, so it
	// would silently never register.
	for (const key of Object.keys((d.engines ?? {}) as Record<string, unknown>))
		if (key.includes(':'))
			problems.push(
				`engines['${key}'] is a template engine id — 'engines' holds Serene Pub version ` +
					`ranges only. Declare it under templateEngines: { '${key}': renderFn }.`,
			)
	// A template engine sits under this plugin's namespace, like every id it
	// registers — an engine two plugins could claim renders differently by
	// install order.
	for (const [id, fn] of Object.entries(d.templateEngines ?? {})) {
		const m = TEMPLATE_ENGINE_ID.exec(id)
		if (!m)
			problems.push(
				`templateEngines['${id}'] is not a template engine id. The grammar is ` +
					`'<slug>:template/<name>@<major>' — '${d.slug}:template/mustache@1'.`,
			)
		else if (m[1] !== d.slug)
			problems.push(
				`templateEngines['${id}'] is not in this plugin's namespace — declare it as ` +
					`'${d.slug}:template/${m[2]}@${m[3]}'.`,
			)
		if (typeof fn !== 'function')
			problems.push(`templateEngines['${id}'] must be the function that renders it.`)
	}

	// Every id a plugin registers must sit under its own namespace. `core:` is reserved
	// and the registry rejects it, but a plugin claiming *another plugin's* namespace
	// would be accepted and would break ownership-based updates (12 §3b).
	// `hooks` declares points; the code a plugin runs is `handlers` (R54).
	if (Array.isArray(d.hooks))
		problems.push(
			`'hooks' is a list — the code a plugin runs is declared under 'handlers' now: rename ` +
				`hooks: [handler(…), …] to handlers: [handler(…), …]. 'hooks' declares the points your ` +
				`package defines, by key.`,
		)
	for (const h of d.handlers ?? []) {
		if (h.__decl !== 'handler') continue
		const ns = h.type.id.split(':')[0]
		if (ns !== d.slug) {
			problems.push(
				`type '${h.type.id}' is registered by plugin '${d.slug}' but sits under namespace '${ns}'. ` +
					`Rename it to '${d.slug}:…' — ownership is what lets an update replace your rows and ` +
					`leave everyone else's alone.`,
			)
		}
	}

	for (const p of d.pipelines ?? []) {
		const ns = p.id.split(':')[0]
		if (p.id.includes(':') && ns !== d.slug) {
			problems.push(`pipeline '${p.id}' sits under namespace '${ns}', not '${d.slug}'.`)
		}
	}

	// Same ownership rule as a handler's definition id, one kind over, plus the
	// per-kind shape check — an author who ships a Liquid source with no engine
	// finds out while writing rather than when an instance renders `{% %}` at a
	// model. Duplicates are refused here because the id is the sync key: two
	// entries under one id would race to be the row on every enable.
	const templateIds = new Set<string>()
	for (const t of d.templates ?? []) {
		problems.push(...templateSeedProblems(t, d.slug))
		if (templateIds.has(t.id))
			problems.push(`duplicate template id '${t.id}' — the id is the sync key (12 §3b).`)
		templateIds.add(t.id)
	}

	problems.push(...permissionFindings(d.permissions))
	problems.push(...annexFieldListFindings(d.annexFields))
	// The variables an instance registers from the manifest — the declared
	// list and every band's own (typed templates, 2026-09-27).
	problems.push(...pluginVariableFindings(d.slug, variablesOf(d)))
	// Whose widgets these are (R71): recorded now, so a genre anywhere that
	// names one by value names the id the page knows it by.
	try {
		ownWidgets(d.slug, d.widgets ?? [])
	} catch (e) {
		problems.push((e as Error).message)
	}

	// References are values (R48): read each down to its id here, where a
	// mistake still names the author's own declaration.
	const stored = <T, S>(list: readonly T[] | undefined, fn: (t: T) => S): S[] | undefined => {
		if (!list) return undefined
		const out: S[] = []
		for (const item of list) {
			try {
				out.push(fn(item))
			} catch (e) {
				problems.push((e as Error).message)
			}
		}
		return out
	}
	problems.push(...swapInputFindings(d.swaps ?? []))
	// A swap runs the contributed node in another package's pipeline, so its
	// handler must be public (R62): a private one would be offered, picked,
	// and then refused on every turn.
	for (const c of d.swaps ?? []) {
		const id = typeof c?.definition === 'string' ? c.definition : c?.definition?.id
		const impl = (d.handlers ?? []).find(
			(h) => (h as { __decl?: string }).__decl === 'handler' && (h as HandlerDecl).type?.id === id,
		) as HandlerDecl | undefined
		if (impl && impl.visibility !== 'public')
			problems.push(
				`swap contributes '${id}', whose handler is private — a swap runs your node in another ` +
					`package's pipeline; write handler(definition, fn, { visibility: 'public' })` +
					pluginRuleRef('private-nodes'),
			)
	}
	const configs = stored(d.configs, storedConfig)
	const presets = stored(d.presets, preset)
	const events = stored(d.events, storedEventDeclaration)

	// Everything a package declares rather than implements — genres, the input
	// lock, create pipelines, contributed actions, prompts, configs, presets,
	// surfaces, components — is checked by the pass `announce()` runs too
	// (D-1), so one mistake gets one sentence wherever it was written. The
	// namespace rules above are the exception: a definition id and a pipeline id
	// are refused here in words that name the plugin slug.
	problems.push(
		...declarationFindings({
			ns: d.slug,
			genres: d.genres,
			pipelines: d.pipelines,
			prompts: d.prompts,
			configs,
			presets,
			surfaces: d.surfaces,
			components: d.components,
			widgets: d.widgets,
			swaps: d.swaps,
			events,
			// Declared nothing is `[]`: every key a pipeline of this package
			// writes to its own annex must be declared (ruling 2026-09-26).
			annexFields: d.annexFields ?? [],
		}).errors,
	)

	if (problems.length) {
		throw new ExtensionError(
			`invalid extension '${d.slug}':\n` + problems.map((p) => `  • ${p}`).join('\n'),
		)
	}
	return {
		__extension: true,
		...d,
		...(configs ? { configs } : {}),
		...(presets ? { presets } : {}),
		...(events ? { events } : {}),
		...(d.swaps ? { swaps: d.swaps.map(storedSwap) } : {}),
	} as Extension
}

// ── Derived views ───────────────────────────────────────────────────────────

/** @experimental */
export const handlersOf = (e: Extension) =>
	(e.handlers ?? []).filter((h): h is HandlerDecl<any> => h.__decl === 'handler')
/** @experimental */
export const lifecycleCallbacksOf = (e: Extension) =>
	(e.handlers ?? []).filter((h): h is LifecycleCallbackDecl => h.__decl === 'lifecycle-callback')
/** @experimental */
export const eventListenersOf = (e: Extension) =>
	(e.handlers ?? []).filter((h): h is EventListenerDecl => h.__decl === 'event-listener')

/**
 * Every variable a package declares, as its manifest carries them: the
 * `variables` list first, then each variable a band of its handlers'
 * definitions holds (`Descriptor.bands`) — a band is a value holding its
 * variable, so the author never lists it twice. One entry per distinct
 * declaration: the same variable reached twice (two definitions declaring
 * one band) is one entry; one id with two different contents stays two, and
 * `pluginVariableFindings` refuses it.
 * @experimental
 */
export function variablesOf(e: Pick<ExtensionDecl, 'variables' | 'handlers'>): VariableDecl[] {
	const out: VariableDecl[] = []
	const seen = new Set<string>()
	const add = (v: unknown) => {
		if (!v || typeof v !== 'object') return // a band naming its variable by id is a reference
		const sig = JSON.stringify(v)
		if (seen.has(sig)) return
		seen.add(sig)
		out.push(v as VariableDecl)
	}
	for (const v of e.variables ?? []) add(v)
	for (const h of e.handlers ?? []) {
		if ((h as { __decl?: string }).__decl !== 'handler') continue
		const bands = (h as HandlerDecl).type?.bands as Record<string, unknown> | undefined
		for (const v of Object.values(bands ?? {})) add(v)
	}
	return out
}

/**
 * The bindings map the executor wants, built from the declaration. So an author's tests
 * run their real handlers rather than a hand-maintained parallel map that drifts.
 * @experimental
 */
export function bindingsOf(e: Extension): Record<string, HandlerDecl<any>['handler']> {
	const out: Record<string, HandlerDecl<any>['handler']> = {}
	for (const h of handlersOf(e)) out[h.type.id] = h.handler
	return out
}
