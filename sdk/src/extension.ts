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
 * Everything here is a **literal declaration**, because the compiler extracts it from the
 * source without executing it (F6, 03 §3, 13/§30). A registration assembled at runtime is
 * a lint error rather than a silent omission — the manifest has to be a complete statement
 * of what a plugin can do, or the permission model is a guess.
 */

import type { BuiltSpec } from './builder.js'
import type { Descriptor } from './descriptors.js'
import type { PluginSettings, SettingsSchema } from './settings.js'
import type { EventListener, LifecycleCallback, LifecycleMoment } from './hooks.js'
import type { Result } from './executor.js'

// ── Callable declarations ───────────────────────────────────────────────────

/**
 * The **handler** implementing a node definition (was `PipelineHookDecl` /
 * `pipelineHook()`, R-1). Data in, expected shape out; the executor is the only caller
 * (01 §9). **Private** means only this extension's specs may pin it; **public** means any
 * spec may, which is how peer composition happens — as a node on the spine, never a
 * peer call mid-run (F10).
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

export function handler<D extends Descriptor<any, any, any>>(
	definition: D | { descriptor: D },
	fn: HandlerDecl<D>['handler'],
	opts: { visibility?: 'private' | 'public' } = {},
): HandlerDecl<D> {
	const descriptor = ('descriptor' in definition ? definition.descriptor : definition) as D
	return {
		__decl: 'handler',
		type: descriptor,
		visibility: opts.visibility ?? (descriptor.public ? 'public' : 'private'),
		handler: fn,
		// Not configurable. See the note on the field.
		runtime: 'process',
	}
}

export interface LifecycleCallbackDecl {
	readonly __decl: 'lifecycle-callback'
	moment: LifecycleMoment
	/** For `scheduled`: how often. Model work belongs in a pipeline, not here (F32). */
	cadence?: string
	handler: LifecycleCallback
	timeoutMs?: number
}

export const lifecycleCallback = (
	moment: LifecycleMoment,
	handler: LifecycleCallback,
	opts: { cadence?: string; timeoutMs?: number } = {},
): LifecycleCallbackDecl => ({ __decl: 'lifecycle-callback', moment, handler, ...opts })

/**
 * One subscription. **Many may register against one event** — several
 * extensions, and several of one extension's hooks — so this is an entry in a
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
 */
export interface EventListenerDecl {
	readonly __decl: 'event-listener'
	/** A core event slug. Plugins cannot define events in SDK 1.0 (F8, 13 §7g). */
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

export const eventListener = (
	event: string,
	handler: EventListener,
	opts: { timeoutMs?: number } = {},
): EventListenerDecl => ({
	__decl: 'event-listener',
	event,
	handler,
	...opts,
})

// ── Components ──────────────────────────────────────────────────────────────

export interface ComponentDecl {
	readonly __decl: 'component'
	/** The surface it mounts into, e.g. `core:surface/chat-message@1` (10). */
	surface: string
	slug: string
	label: string
	/** Which adapter renders it. All three are framework-neutral against one ABI (10 §4). */
	framework: 'svelte' | 'react' | 'vanilla'
	/** Path to the built asset, relative to the plugin root. Resolved at install. */
	entry: string
	/** Component-side settings this component reads through `ctx` (12 §6). */
	settings?: SettingsSchema
}

export const component = (d: Omit<ComponentDecl, '__decl'>): ComponentDecl => ({
	__decl: 'component',
	...d,
})

// ── The extension ───────────────────────────────────────────────────────────

export interface ExtensionDecl {
	/** `vendor.plugin` — the owner segment of every id this plugin registers (F2). */
	slug: string
	name: string
	version: string
	description?: string
	/** Supported SP range, separate from the SDK range (09). */
	engines?: { 'serene-pub'?: string }
	settings?: PluginSettings<any>
	/**
	 * Node definitions this plugin registers with the handlers that implement
	 * them, plus its lifecycle callbacks and event listeners. Still keyed
	 * `hooks` — the field names the plugin's declared points, which is what a
	 * hook is (NOMENCLATURE §12).
	 */
	hooks?: Array<HandlerDecl<any> | LifecycleCallbackDecl | EventListenerDecl>
	components?: ComponentDecl[]
	/** Pipelines shipped with the plugin. Compiled to documents at build time (F6). */
	pipelines?: BuiltSpec[]
	/**
	 * Dependencies on **public handlers** other plugins expose. Definition-level pins
	 * only; runtime peer invocation is banned (F10, 01 §9b).
	 */
	peerTypes?: string[]
}

export interface Extension extends ExtensionDecl {
	readonly __extension: true
}

export class ExtensionError extends Error {}

const SLUG = /^[a-z0-9]+([.-][a-z0-9]+)*$/

/**
 * Declare a plugin. Validated here rather than at install, because an error an author
 * sees while writing costs a minute and the same error at install costs a support thread.
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

	// Every id a plugin registers must sit under its own namespace. `core:` is reserved
	// and the registry rejects it, but a plugin claiming *another plugin's* namespace
	// would be accepted and would break ownership-based updates (12 §3b).
	for (const h of d.hooks ?? []) {
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

	const seen = new Set<string>()
	for (const c of d.components ?? []) {
		if (seen.has(c.slug))
			problems.push(`duplicate component slug '${c.slug}' — slugs are the sync key (12 §3b).`)
		seen.add(c.slug)
	}

	if (problems.length) {
		throw new ExtensionError(
			`invalid extension '${d.slug}':\n` + problems.map((p) => `  • ${p}`).join('\n'),
		)
	}
	return { __extension: true, ...d }
}

// ── Derived views ───────────────────────────────────────────────────────────

export const handlersOf = (e: Extension) =>
	(e.hooks ?? []).filter((h): h is HandlerDecl<any> => h.__decl === 'handler')
export const lifecycleCallbacksOf = (e: Extension) =>
	(e.hooks ?? []).filter((h): h is LifecycleCallbackDecl => h.__decl === 'lifecycle-callback')
export const eventListenersOf = (e: Extension) =>
	(e.hooks ?? []).filter((h): h is EventListenerDecl => h.__decl === 'event-listener')

/**
 * The bindings map the executor wants, built from the declaration. So an author's tests
 * run their real handlers rather than a hand-maintained parallel map that drifts.
 */
export function bindingsOf(e: Extension): Record<string, HandlerDecl<any>['handler']> {
	const out: Record<string, HandlerDecl<any>['handler']> = {}
	for (const h of handlersOf(e)) out[h.type.id] = h.handler
	return out
}
