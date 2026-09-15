/**
 * Descriptors — the shared-scope declaration of a type (01 §1, 04 §3).
 *
 * A descriptor is data: it can be listed, rendered and validated without loading
 * the hook that implements it. That is what lets the plugin manager and the editor
 * work from rows (10 §10.2).
 */

import type { ShapeId } from './shapes.js'
import type { CapabilityId } from './capabilities.js'
import type { ReviewPosition } from './review.js'
import type { TemplateScope } from './template.js'
import type { SettingsSchema, FieldDecl, I18nText } from './settings.js'
import type { MediaCapability } from './media.js'
import { refuseUnlessIdentical, type DisplayKeys } from './hash.js'

/**
 * `entry` is the odd one out and deliberately so: the first five are **nodes**
 * — things a spec wires — and an entry type is a **row shape**, the declared
 * answer to "what kind of thing is this lorebook row". It is a Kind rather than
 * a registry of its own because everything downstream of a declaration is the
 * same machinery: one `snapshotRegistry`, one content hash, one boot sync, one
 * freeze rule (the argument 18 §2 makes for script types, one construct over).
 */
export type Kind = 'input' | 'query' | 'task' | 'provider' | 'consumer' | 'entry'

export type LocaleMap = { en: string } & Record<string, string>
/** One i18n type across the SDK — settings.ts owns it; this is the alias the
 *  descriptor surface has always exported. */
export type I18n = I18nText

/** Slot kinds (12 §2). Siblings; only two are ever cross-referenced. */
export type SlotKind =
	| 'connection'
	| 'sampling'
	| 'prompts'
	| 'template'
	| 'parameters'
	| 'wire'
	| 'variables'
	| 'scripts'

export interface SlotDecl {
	kind: SlotKind
	/**
	 * One of the few settings people actually change on this node.
	 *
	 * A panel that lists every declared setting equally makes the reader find
	 * the prompt among the thresholds every time. The author is the one who
	 * knows which three or four are reached for and which exist for the day
	 * somebody needs them, so the answer is declared rather than guessed from
	 * type or position — a client heuristic would be wrong differently on every
	 * plugin.
	 *
	 * Presentation, not permission: nothing is hidden by it, and everything
	 * unmarked is one disclosure away.
	 */
	quick?: boolean

	/** For connection/sampling: which shape's connections are eligible. */
	shape?: ShapeId

	/**
	 * What the connection in this slot must be able to do.
	 *
	 * Unmet is a hard failure at bind, naming the capability in the words a
	 * person saw when they configured it — never a 400 from a provider that was
	 * asked for something its API has no field for.
	 *
	 * On the SLOT rather than on the Descriptor because the requirement is about
	 * a *connection*, and a connection comes from a slot: a node with two
	 * connection slots needs to state two different things.
	 *
	 * This supersedes `shape` for connection slots. `shape` says "an image-gen
	 * connection"; this says "one that can do text→image", which is the same fact
	 * with the modality assumption removed.
	 */
	requires?: readonly CapabilityId[]

	/**
	 * What the binding will *use if present* and must cope without.
	 *
	 * The binding asks with `ctx.can(id)`, which is narrowed to exactly these
	 * ids — so an undeclared capability, or a typo, does not compile. The
	 * fallback path is the author's to write; declaring something optional is a
	 * promise that both branches exist.
	 *
	 * ⚠ Not the same `optional` as `Descriptor.optional` further down this file,
	 * which means "producing nothing is a legitimate outcome for this node". Two
	 * meanings, one word, one file — the objects differ so it compiles, and the
	 * reader is the one who pays. Named to match the ruling; if it is ever
	 * renamed, `prefers` is the word that was wanted.
	 */
	optional?: readonly CapabilityId[]
	/** What this slot is for, shown under its option. Display text — see ParamDecl. */
	description?: I18n
	/** Which lens renders it (05 §3). */
	facet?: string
	/** For prompts: the authored text fields. */
	fields?: Record<string, { type: 'text'; i18n?: I18n }>
	/** For parameters: the declared schema. Options may be sourced from the connection. */
	schema?: Record<string, FieldDecl>
	/**
	 * Which template language this slot's source is written in — a registry id, not a
	 * hardcoded literal (src/engines.ts). The value stored in the slot carries it too, so
	 * two slots in one spec may use different engines.
	 *
	 * The one-element spelling of `engines`, and permanently valid: a reader must
	 * resolve both, or every slot authored before the set existed silently widens to
	 * the host's default.
	 */
	engine?: string
	/**
	 * Every template language this slot accepts, most-preferred first.
	 *
	 * A template's pool is `(what it renders, which language)` and stays that way —
	 * a Liquid source and a Handlebars one are not interchangeable, and neither
	 * renders the other. What a set widens is the SLOT: a picker offers the union of
	 * the accepted pools, so a person may write the same layout in either language
	 * without the slot having to be re-declared.
	 *
	 * **Order is meaning.** The first entry is what a NEW template here is written
	 * in, so re-ordering this list changes what an untouched install produces —
	 * which is why it is content, hashed with the rest of the declaration.
	 *
	 * Supersedes `engine` when both are given; an empty array declares nothing.
	 */
	engines?: readonly string[]
	/**
	 * For `wire` slots: the format id this Provider defaults to. Overridable through the
	 * normal scope chain, and in core sourced from the connection's adapter metadata so
	 * picking Ollama gets the right instruct format without configuring anything
	 * (src/wire.ts).
	 */
	format?: string
	/**
	 * For template slots: the variables this template may reference.
	 *
	 * ⚠ Required, and 16 §4 is wrong to imply otherwise. A *source* template renders one
	 * item out of a collection, and the item's shape lives inside the port's payload
	 * rather than on the port — so typed ports alone cannot tell an author what
	 * `{{ entry.title }}` is allowed to be. See src/template.ts.
	 */
	variables?: TemplateScope
	/**
	 * For `scripts` slots: which script types this hook accepts (18 §4a).
	 *
	 * Pinned ids — `core:script:text/transform@1` — and **part of the content
	 * hash** (S3): widening or narrowing what a hook accepts changes what an
	 * untouched spec does, which is the `optional` lesson applied before it is
	 * re-learned. Plain strings rather than the `ScriptTypeId` alias, because
	 * scripts.ts already imports from this module and a type-only cycle is
	 * still a cycle.
	 *
	 * The value stored in a scripts slot is an ordered list of script row ids —
	 * a chain. Transform chains fold; verdict chains reduce (18 §5). The chain
	 * is configuration like any slot value: resolved through the scope chain,
	 * carried by presets, exported with the document.
	 */
	accepts?: string[]
	/**
	 * For `scripts` slots: where the chains apply, as (port, phase) — the
	 * substrate declaration of 18 §4a. `before` transforms a value entering the
	 * named in-port; `after` transforms what left the named out-port. The
	 * binding never sees a chain and cannot decline one; declaring is all a
	 * type does, which is what makes a plugin's hook trustworthy without
	 * trusting the plugin (03 §4 symmetry).
	 */
	port?: string
	phase?: 'before' | 'after'
	/**
	 * For `scripts` slots: read-only context this hook supplies beyond the
	 * port's own variables — a speaker's name, the cast list. In-only **by
	 * construction**: extras have no legal out declaration, so the general
	 * in-but-not-out rule (18 §6a) covers them with no special case. The
	 * editor offers exactly `ports + extras` as the fixed choices for a
	 * script's declared reads — never a freeform name, which would be a
	 * declaration nothing supplies.
	 */
	extras?: string[]
	/**
	 * For `variables` slots: which context variable each key renders.
	 *
	 * `{ characters: 'core:var/characters@1' }` says this node produces a value
	 * called `characters`, and how it is presented is the registered variable's
	 * business rather than this node's. Each key becomes one addressable setting
	 * pointing at a swappable template row — so a prose rendering written for one
	 * pipeline can be selected from any other pipeline that renders the same
	 * variable. That cross-pipeline reuse is the point, and it only works because
	 * the row is keyed by *what it renders* rather than by which spec it was
	 * authored in.
	 *
	 * Named `renders` rather than `variables` because the field above already
	 * owns that name for a different question — that one asks what a template
	 * *may reference*, this one asks what a slot *produces*.
	 */
	renders?: Record<string, string>
}

/**
 * One band of a `share` or `perMember` parameter.
 *
 * The client renders a bar with a label and a colour per band, and **none of
 * those may be written in the client**. A plugin that adds a sixth retrieval
 * source has to get a labelled band without anyone editing that screen, which
 * is the 1:1 rule applied to a control that would otherwise need a hardcoded
 * list of five.
 */
/**
 * The field language, re-exported from settings.ts — where it is now defined
 * once for node params, plugin settings, session-mode fields and message-block
 * forms alike.
 *
 * These used to be a second, subtly different declaration living here: it had
 * `share` and `perMember` where settings had `text`, keyed its label `i18n`
 * where settings said `label`, and nothing converted between the two. The
 * comment in settings.ts promising "the same shape node params use" was
 * describing an intention, not the code. It is the code now.
 */
export type { MemberDecl, ParamDecl, FieldDecl, FieldType } from './settings.js'
export { fieldLabel, fieldAccepts } from './settings.js'

export interface PortDecl {
	[port: string]: ShapeId
}

/**
 * `Out`/`In` are generic so the *port names* survive into the type system. That is what
 * lets the builder offer `$.history.messages` with autocomplete instead of
 * `$ref('history', 'messages')` with a string (see src/scope.ts). Both default to the
 * open `PortDecl`, so nothing that ignores the generics changes.
 */
/**
 * The chat-shape contract a mode-bearing input type carries (19 §1). See
 * `Descriptor.shape` for the rules; this is the vocabulary.
 *
 * Bounds omit `max` for "unlimited" and omit the whole capability for "does
 * not exist here". Every field is optional so the standard mode can state
 * today's behaviour exactly and a prose mode can state almost nothing.
 */
export interface SessionShape {
	/** The character system: toggles, ordering, pickers, cast rows. */
	characters?: { min: number; max?: number }
	/** The persona system. Absent or `max: 0`: the user is prose. */
	personas?: { min: number; max?: number }
	/** The lorebook attachment picker, and retrieval satisfiability. */
	lorebook?: 'optional' | 'required'
	/** What the send surface is. `none` for purely trigger-driven modes. */
	composer?: 'text' | 'none'
	/** Whose name the seed line carries (16's seedName rule, declared). */
	voice?: 'character' | 'narrator'
	/**
	 * Mode-declared per-session fields (`SettingsSchema` — the one field
	 * language). Rendered in session settings, stored on the session, supplied
	 * back through this input's published document.
	 */
	fields?: SettingsSchema
	/** Default next-speaker strategy (19 §5). Session scope may swap it. */
	nextSpeaker?: string
	/**
	 * Whether creating a chat of this mode seeds the cast's greeting messages,
	 * and on which channel (20 §7). Absent means the default — **on, on
	 * `main`** — so a custom input node gets the standard chat's welcoming
	 * behaviour for free and turns it off or redirects it only if it wants to.
	 * Core's `user-message` input declares it explicitly so the reusable case
	 * reads at a glance.
	 */
	greeting?: {
		/** Seed character greetings on creation. Default true. */
		enabled?: boolean
		/** Which channel the greetings land on. Default `main`. */
		channel?: string
	}
	/**
	 * Which message verbs sessions of this mode offer (20 §4). Absent means
	 * all on — the standard chat's posture. Core owns the mechanics and
	 * integrity rules; this only declares *availability*, checked server-side
	 * at the verb (presence is presentation, refusal is the law).
	 *
	 * **Delete and hide are deliberately unrepresentable here.** They are
	 * floors: the session owner can always delete and always hide their own
	 * data, and a mode that could forbid deletion would own the user. Retry
	 * and edit are legitimately forbiddable — a dice-are-final mode is a real
	 * design.
	 */
	messageVerbs?: {
		retry?: boolean
		continue?: boolean
		edit?: boolean
		stepBack?: boolean
	}
	/**
	 * Which surface renders sessions of this mode (20 §12). Absent means
	 * core's log — today's behaviour exactly. A plugin id (`acme/crawl`)
	 * names the plugin whose declared `session-view` frame surface replaces
	 * the whole message section: the total-conversion lane. The frame gets
	 * the session over the MessageChannel and returns actions as validated
	 * requests; it forfeits core's in-log chrome deliberately. "Restyle the
	 * standard chat" is blocks, never this.
	 */
	view?: string
	/**
	 * The session's channels beyond the implicit `main` (20 §7) — filter
	 * lanes inside one session. What renders a channel is the surface story
	 * (a frame subscribes to it); what *stores* it is `messages.channel`; and
	 * pipelines choose which lanes build their context through the history
	 * query's `channel` param. Declaring one here is what makes it exist for
	 * sessions of this mode.
	 *
	 * **Slugs, and only slugs (ruling 2026-09-09).** A channel is an
	 * organizational bucket this genre chooses arbitrarily and names here; the
	 * **lanes** under a slug are runtime and open-ended — a lane exists because
	 * a pipeline wrote to it, and this genre's pipelines allocate and manage
	 * them (one lane per agent with the agent↔lane map in extension data; five
	 * ongoing private conversations under `text-messages`, with a sixth later).
	 * **No lane count is declared**, here or anywhere. `main` is always the
	 * default channel and lane 1 always the default lane, so a bare slug is
	 * `slug:1`, `main` is `main:1`, and lane 1 is stored as the bare slug —
	 * lanes from 2 up store `slug:n`. The number is multiplicity and order,
	 * never identity: the slug is the reference. Lane metadata (title,
	 * participants, open or closed) is this genre's business and lives in its
	 * extension data — core stores a string. Parse and format one with
	 * `parseChannel` / `formatChannel`.
	 */
	channels?: string[]
	/**
	 * The panels a session of this mode offers in the surface grid (21). The
	 * grid is container-responsive: panels flow into tracks that appear and
	 * disappear with the *content box* width (not the viewport), so opening a
	 * sidebar cascades panels the same way shrinking the window would.
	 *
	 * Absent means the default — the standard chat's single primary panel (the
	 * log + composer). A mode declares extra panels by pushing `PanelDecl`s; a
	 * panel points either at a **native** surface (a core-registered component
	 * key, zero frontend code beyond registering it) or a **frame** (a plugin's
	 * `surfaces.panels[]` entry, opaque-origin iframe). Both wear identical
	 * chrome and both are *views onto channels* — a panel renders what a node
	 * writes to the channels it subscribes to. This is the "map / cell phone /
	 * mission list appears when the action is toggled on" lane: a node emits a
	 * `surface:open` intent naming a declared panel, and the grid flows it in.
	 *
	 * Exactly one panel should carry `role: 'primary'` — it is anchored, always
	 * placed, and never cascades to the drawer. Absent-panels defaults supply a
	 * primary log automatically, so a mode only lists what it adds.
	 */
	panels?: PanelDecl[]
}

/**
 * One panel offered by a session mode (21). Availability, not placement:
 * declaring a panel makes it *addable*; whether an instance is active and where
 * it sits is the per-user layout row's business. `defaultActive` seeds a fresh
 * session's layout; a node's `surface:open` intent activates one later.
 */
export interface PanelDecl {
	/** Stable id — layout rows and `surface:open` intents key on this. */
	id: string
	/** Human title shown in the panel's chrome and the "add panel" menu. */
	title: string
	/** Optional icon name (the app maps it to its icon set). */
	icon?: string
	/**
	 * The anchored conversation panel is `primary` — always placed, never
	 * drawered. Everything else is `secondary` (the default).
	 */
	role?: 'primary' | 'secondary'
	/** What renders inside. A native component key, or a plugin frame surface. */
	surface:
		| { kind: 'native'; component: string }
		| { kind: 'frame'; pluginId: string; entry: string }
	/** Which channels feed it (20 §4/§7). A panel is a view onto its channels. */
	channels?: string[]
	/** Layout hints the packer honours; all optional, all have sane floors. */
	layout?: {
		/** Ideal / min / max column span, in grid tracks. */
		span?: { ideal?: number; min?: number; max?: number }
		/** Inline (width) floor in px below which the panel un-spans or drawers. */
		minInline?: number
		/** Block (height) floor in px for stacked panels sharing a track. */
		minBlock?: number
		/** May the user collapse it to its title bar? Default true. */
		collapsible?: boolean
		/** May the user close/deactivate it? Primary is never closable. */
		closable?: boolean
		/** Where a freshly activated instance prefers to land. Default `grid`. */
		prefer?: 'grid' | 'drawer'
	}
	/** Seed this panel active in a new session's default layout. Default false. */
	defaultActive?: boolean
}

export interface Descriptor<
	Out extends PortDecl = PortDecl,
	In extends PortDecl = PortDecl,
	Id extends string = string,
> {
	/**
	 * `namespace:kind/name@N` — and the `@N` is the **type** version, which is a pin
	 * (01 §3). Distinct from a spec's semver, which is an upgrade key (src/identity.ts).
	 * Carried in the type so a pinned constructor can expose `.v1()` at the call site.
	 */
	id: Id
	kind: Kind
	i18n?: { name?: I18n; description?: I18n }
	slots?: Record<string, SlotDecl>
	ports: { in?: In; out?: Out }

	/** Provider/consumer only — the review gate keys on this, not on kind (01 §7). */
	effects?: 'none' | 'external' | 'write' | 'emit'
	/**
	 * An author may default review **on** for their own node. There is no value here
	 * that forbids it — that is the enforcement, not a rule someone checks (F14).
	 */
	reviewDefault?: ReviewPosition
	/** Connection kind for providers (== produced shape). */
	shape?: ShapeId
	/** May this node be switched off? Requires shape transparency (01 §14 F-toggleable). */
	toggleable?: boolean
	/**
	 * Producing nothing is a legitimate outcome, so failing is not the run's
	 * failure.
	 *
	 * An `err` — including a timeout — becomes an empty `ok` and the run
	 * continues. The receipt still records what went wrong: `result` stays
	 * `err`, `reason` keeps the message, and `recoveredAsEmpty` marks it, so
	 * this is *tolerated* rather than hidden. A node whose failure nobody can
	 * see is worse than one that stops the run.
	 *
	 * For enrichment a template already guards with `{{#if}}` — the narrative
	 * graph's relationship summary is the case this exists for: a slow read of
	 * an optional block should never cost somebody their reply. It does **not**
	 * license wiring a required input to an optional node; downstream still has
	 * to mean something when the value is absent, which is a property of the
	 * ports, not of this flag.
	 *
	 * Deliberately not `halt` or `cancelled`. A halt is a binding saying "stop
	 * here" on purpose (a preview, a review gate) and a cancellation is the
	 * user; neither is a failure to absorb.
	 */
	optional?: boolean
	/** Declares it consumes the run seed — keeps Tasks pure (F11). */
	declaresRandomness?: boolean
	/**
	 * Interior script points (18 §4e): named moments *inside* the binding's
	 * work where user text-transform chains may run — a drafting loop's
	 * intermediate texts. Declared here so "which nodes can run scripts, and
	 * where" is answerable from the document; the binding invokes one with
	 * `ctx.scripts.applyText(key, text)` and gets no `ctx.scripts` at all
	 * without a declaration. **Part of the hashed contract** — a point
	 * appearing or vanishing changes what an untouched spec's configuration
	 * can reach (S3's argument, one construct over). `i18n`/`description` are
	 * display text and stripped from the hash as everywhere.
	 */
	scriptPoints?: Array<{ key: string; i18n?: I18n; description?: I18n }>
	/**
	 * The chat-shape contract (19 §0–§1) — present **only on input types**,
	 * and its presence is what makes the input type a **chat mode**. The mode
	 * id is this type's id; any spec pinning it and matching the primary-write
	 * signature is in the mode's bucket, by construction.
	 *
	 * The core idea is **capability references**: the shape names the systems
	 * of core it uses, and declaring one is what enables that system's UI,
	 * storage and query satisfiability for chats of the mode. A capability the
	 * shape does not declare does not exist for the chat — no toggles, no
	 * rows, no budget spent retrieving for it. `personas` absent or `max: 0`
	 * means the user is prose: nameless text, no identity, a first-class
	 * state rather than an edge case.
	 *
	 * **Hashed contract** (display lives in `i18n` as everywhere): widening
	 * `characters.max` changes what existing sessions legally contain — the
	 * `optional` lesson, again. `fields` reuses `SettingsSchema` — the
	 * one-field-language rule — rendered in session settings and supplied back
	 * through this input's published document. Duties and triggers are
	 * deliberately NOT here: the shape is owner-only, and event functions
	 * beyond the intrinsic composer are contributed by the specs that serve
	 * them (19 §3–§4), so a mode never has to know its narrator exists.
	 *
	 * Named `sessionShape` because `shape` was already taken by the provider
	 * connection kind above — renaming *that* would re-hash every provider
	 * on the instance for a word.
	 */
	sessionShape?: SessionShape
	/** May finish before an upstream stream ends (01 §11). */
	earlyExit?: boolean
	/** Public pipeline hooks may be pinned by any spec (01 §9b). */
	public?: boolean
	/** F36 — every hook invocation is bounded. */
	timeoutMs?: number
	timeoutKind?: 'wall' | 'idle'
	/** Which core event a write causes. Declared here, never per spec (01 §8). */
	causesEvent?: string
	usage?: string
	/**
	 * Which media kinds this type can take in and give out.
	 *
	 * Declared rather than inferred from ports, because the ports are
	 * deliberately general: one `media-ref` shape carries every kind, so the
	 * port says *that* media flows here and this says *which*. That split is
	 * what keeps a new modality from being a new shape, new ports and a new
	 * branch in every wire adapter, while still letting a picker grey out a
	 * connection that cannot read PDFs.
	 *
	 * A **type** declaring `accepts` says the contract has somewhere to put
	 * media. Whether a given *connection* behind it actually does is a runtime
	 * capability the adapter reports — same shape, same field name, resolved
	 * against this at bind time. A spec that wires an image into a connection
	 * whose model is text-only should fail where the user can see it, not at
	 * the provider's HTTP call.
	 */
	media?: MediaCapability
	/**
	 * The entry-row contract — present **only on entry types**, and its
	 * presence is what makes one (`describeEntryType` is the only door that
	 * sets it).
	 *
	 * Named `entryShape` on the same terms as `sessionShape`: `shape` above is
	 * already the provider connection kind, and the two facts are unrelated.
	 * Hashed, whole — see the note on `EntryShape`.
	 */
	entryShape?: EntryShape
}

const types = new Map<string, Descriptor>()

/**
 * A descriptor's display text, beyond the `i18n`/`description` pair every
 * declaration carries.
 *
 * `label` is what settings.ts calls the canonical key for a field or a member
 * band — `i18n` there is its deprecated alias — and those sit two levels down
 * inside `slots[].schema` and `entryShape.fields`. Renaming "Top K" was
 * therefore a hash change, which is exactly the edit src/hash.ts promises will
 * not put the reload loop back.
 *
 * ⚠ `title` is deliberately absent. `PanelDecl.title` is a heading, but
 * `EntryRoles.title` is which field the engine reads as a row's title —
 * contract, and moving one is an `@N+1` on purpose. One word, two answers, both
 * reachable from here, so a key-name rule cannot have it both ways; the panel
 * heading stays hashed until one of them is renamed.
 *
 * ## Exported, and it has to be
 *
 * The re-declaration guard below is not the only thing that asks whether two
 * descriptors are the same content. Core projects every descriptor into a
 * `pipeline_type_registry` row and hashes it again there, and that hash decides
 * whether an upgrading install may republish a frozen type version. The two
 * disagreed: core stripped `i18n` and `description` and hashed `label`, so
 * renaming a parameter was free here and a boot-time `TypeRegistryConflictError`
 * there — which `bootstrapPipelines` catches by returning early, silently
 * stopping every pipeline on the install.
 *
 * So the list is one value both sides import rather than two lists that happen
 * to match today. Adding a word here re-hashes every affected type and needs a
 * re-projection migration in core, exactly as adding one to `UNIVERSAL_DISPLAY`
 * would.
 */
export const DESCRIPTOR_DISPLAY_KEYS: DisplayKeys = { display: ['label'] }

function register<D extends Descriptor<any, any, any>>(d: D): D {
	// Content, not arrival (src/hash.ts). Only computed when there is something
	// to compare against, so the ordinary path costs nothing.
	const existing = types.get(d.id)
	if (existing)
		refuseUnlessIdentical(
			existing,
			d,
			`duplicate type id: ${d.id}`,
			DESCRIPTOR_DISPLAY_KEYS,
		)
	checkWritePublishes(d as Descriptor)
	// Before the id is claimed, so a refused declaration can be fixed and retried.
	checkModeTitled(d as Descriptor)
	types.set(d.id, d as Descriptor)
	return d
}

/**
 * A gate-eligible write publishes `write-result@1`, never raw ids (13 §7j-b).
 *
 * Checked at registration rather than reviewed by hand, because the hand-written version
 * was already wrong: three core Consumers declared `row-ids@1` out ports while declaring
 * `effects: 'write'`. Each one was a spec that could wire a downstream foreign key to a
 * row a reviewer had not approved yet — and under `async` review that row may never exist.
 * The failure lands long after the run that caused it, which is the worst kind to find by
 * reading.
 */
function checkWritePublishes(d: Descriptor): void {
	if (d.effects !== 'write') return
	const bad = Object.entries(d.ports?.out ?? {}).filter(
		([, s]) => shapeIdOf(s) === 'core:shape/row-ids@1',
	)
	if (!bad.length) return
	throw new Error(
		`${d.id} declares effects: 'write' but publishes core:shape/row-ids@1 on ` +
			`${bad.map(([k]) => `'${k}'`).join(', ')}. A gate-eligible write publishes ` +
			`core:shape/write-result@1 — pending under async review, committed otherwise — so a ` +
			`downstream port wanting raw ids fails at publish instead of writing a foreign key ` +
			`that dangles when the reviewer rejects (13 §7j-b).`,
	)
}

const shapeIdOf = (s: unknown): string | undefined =>
	typeof s === 'string' ? s : ((s as { id?: string } | undefined)?.id ?? undefined)

/** Is there any locale with actual text in it? */
const hasDisplayText = (v: I18n | undefined): boolean =>
	typeof v === 'string'
		? v.trim().length > 0
		: !!v && Object.values(v).some((s) => typeof s === 'string' && s.trim().length > 0)

/**
 * A chat mode ships titled (19 §2).
 *
 * A shape-bearing input type *is* a chat mode, and the New Chat picker renders one card
 * per mode from rows — `i18n.name` is that card's face. An untitled mode could only
 * render as its type id, which is an address, not a name; refused here at declaration,
 * where the author is, rather than at install, where the admin is. A missing
 * `description` is a poorer card rather than a broken one, so the packager warns about
 * that instead of this throwing (cli/src/compiler.ts, W_MODE_NO_DESCRIPTION).
 */
function checkModeTitled(d: Descriptor): void {
	if (d.kind !== 'input' || !d.sessionShape) return
	if (hasDisplayText(d.i18n?.name)) return
	throw new Error(
		`${d.id} declares a sessionShape but no i18n.name. A shape-bearing input type is a ` +
			`session mode, and the New Session picker renders every mode as a card — give it a ` +
			`title: i18n: { name: { en: '…' } }. Add a description there too; the packager ` +
			`warns when a mode ships without one.`,
	)
}

export function getType(id: string): Descriptor | undefined {
	return types.get(id)
}
export function allTypes(): Descriptor[] {
	return [...types.values()]
}
export function _clearTypes(): void {
	types.clear()
}

// ── describe* — one per kind, same shape, no modality anywhere ───────────────

/**
 * ## Why every `describe*` is generic over its slots
 *
 * `Descriptor.slots` is the open `Record<string, SlotDecl>`, so a declaration
 * passed straight into it arrives with its **keys erased** — and with them the
 * `params` slot's `schema` keys, which is the entire declared parameter
 * vocabulary of the node. That erasure is what let `input.params.foo` be an
 * `any` lookup on a node whose schema has no `foo`: `topK` and `limit` were
 * both read that way for releases, off nodes that did declare them, at a
 * spelling nothing supplied.
 *
 * Capturing the argument in `S` keeps the literal keys, which is what
 * `InputOf` (src/nodeInput.ts) derives a handler's `input` type from.
 *
 * ⚠ **Type-level only.** `register()` still receives the same object and the
 * content hash is computed over the same runtime value, so nothing here moves a
 * declaration or re-hashes a type.
 *
 * ⚠ **`S` is constrained rather than `const`, and the difference is
 * deliberate.** `describeProvider` below needs the literal *values* — the
 * `optional: ['json_schema']` tuple `ctx.can()` narrows against — so it pays
 * for `const` with a validation done by intersection in the parameter. Names
 * are all `InputOf` needs, and an object literal keeps its own keys with or
 * without `const`; a `const` here would additionally freeze `accepts: [...]`
 * and `extras: [...]` into readonly tuples, which `SlotDecl` declares as
 * mutable `string[]` and which several core input and task types use.
 */
export const describeInput = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'input' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'input'; slots?: S }
export const describeQueryType = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'query' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'query'; slots?: S }
export const describeTaskType = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'task' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'task'; slots?: S }
/**
 * A Provider type.
 *
 * `const S` on the slots is what makes `ctx.can()` safe: without it,
 * `optional: ['json_schema']` widens to `CapabilityId[]` at the declaration and
 * the binding can only be told "some capability", which is no narrowing at all.
 * With it the literal tuple survives into `Pinned<D>` and out the other side, so
 * a binding asking about a capability its node never declared does not compile.
 */
export const describeProvider = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, unknown> = Record<string, never>,
>(
	// The slot validation lives in the PARAMETER, not in `S`'s constraint. A
	// constraint of `Record<string, SlotDecl>` widens each slot to SlotDecl's own
	// declared types, so `optional: ['json_schema']` arrives as
	// `readonly CapabilityId[]` and `ctx.can()` narrows to nothing. Intersecting
	// here validates just as strictly while leaving `S` the literal it was written
	// as — which is the whole basis of the typed probe.
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & {
		slots?: S & Record<string, SlotDecl>
	},
) =>
	register({ ...d, kind: 'provider' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'provider'; slots?: S }
export const describeConsumerTarget = <
	O extends PortDecl,
	I extends PortDecl,
	const Id extends string,
	const S extends Record<string, SlotDecl> = Record<string, SlotDecl>,
>(
	d: Omit<Descriptor<O, I, Id>, 'kind' | 'slots'> & { slots?: S },
) =>
	register({ ...d, kind: 'consumer' as const } as Descriptor<O, I, Id>) as Descriptor<
		O,
		I,
		Id
	> & { kind: 'consumer'; slots?: S }

// ── Entry types (Part 1) ────────────────────────────────────────────────────
//
// A lorebook row's *kind* is a declared, versioned type rather than the table
// it happens to sit in. Three near-identical tables collapse into one, and what
// used to be a schema fact — "world lore has a category, history has a year" —
// becomes a declaration the engine reads.
//
// What keeps that from turning into a swamp is the **field role**: the ranker asks
// the type which field is priority instead of reading `.priority`, so a fourth
// shape is a declaration and not a branch. Three constraints hold the line, and
// each is enforced here rather than reviewed by hand:
//
//  1. **No mini-DSLs.** `order` is an array of `{field, dir}`, never
//     `'date:year,month,day'`. A string the engine parses is code the type
//     ships with extra steps.
//  2. **A new behaviour may add a field role; a new type may not.** The vocabulary is
//     the frozen list below, and a conformance canary (`checkEntryTypes`)
//     watches both directions of it.
//  3. **Types never ship code.** Anything branchy is a *named, versioned,
//     core-owned policy* the type selects from a closed registry — mirroring
//     the deliberate absence of T3 validator code in values.ts.

/**
 * The field roles the engine reads. Frozen, and the reason it is frozen is rule 2
 * above: the list grows when a *behaviour* needs a new question answered, never
 * because a type has a field it would like consulted.
 */
export const ENTRY_ROLES = [
	/** Which field is this row's display title. */
	'title',
	/** How siblings sort among themselves — structured keys, never a string. */
	'order',
	/** Which field carries the manual 1..3 boost. Absent means **no bonus**. */
	'priority',
	/** Which reference column decides who may see this row, under which policy. */
	'anchor',
	/** Which fields make the text an embedding is computed over. */
	'embedText',
	/** Which field holds the trigger keys the keyword scan matches. */
	'key',
	/** Which reference column points at the row this one hangs under. */
	'parent',
] as const

export type EntryRole = (typeof ENTRY_ROLES)[number]

/**
 * The budget bands a candidate can compete in — the engine's `RetrievalBand`,
 * closed on purpose.
 *
 * ⚠ Closed because the failure of an open one is **silent**: the signal-weight
 * and share maps are total over this union, so an entry type declaring a band
 * nobody budgets has its candidates scored against `undefined` and dropped with
 * a green test suite. That is not hypothetical — history was absent from every
 * prompt for two spec versions exactly this way. A new shape picks the band it
 * competes in; it does not mint one.
 */
export const ENTRY_SOURCE_KINDS = [
	'messages',
	'worldLore',
	'characterLore',
	'history',
	'relationships',
] as const

export type EntrySourceKind = (typeof ENTRY_SOURCE_KINDS)[number]

/**
 * The short name this type's rows carry on the wire — `extensions.serenepub`
 * in a character-card book.
 *
 * Closed to the three names already written into exported files. A type outside
 * them simply declares nothing here: no marker is honest, where a marker no
 * importer reads is a file that round-trips into the wrong shape. Widening the
 * list is a deliberate act with an importer change beside it.
 */
export const ENTRY_EXPORT_KEYS = ['world', 'character', 'history'] as const

export type EntryExportKey = (typeof ENTRY_EXPORT_KEYS)[number]

/**
 * Visibility policies a type may select for its anchor.
 *
 * `core:policy/binding-visibility@1` is the four branches character lore
 * already has — character equality, persona membership, narrator-only when the
 * binding is unbound, invisible when the row is unanchored. That is *policy*,
 * so it is named, versioned and implemented by core; the type picks from this
 * list and never authors one (rule 3).
 */
export const ENTRY_ANCHOR_POLICIES = ['core:policy/binding-visibility@1'] as const

export type EntryAnchorPolicy = (typeof ENTRY_ANCHOR_POLICIES)[number]

/**
 * Where a type's rows land when they are not rendered as a variable of their
 * own — a closed vocabulary of destinations, not a free string.
 *
 * `character-card` is today's character lore: qualifying entries are folded
 * into their bound character's own object under an "extra lore" key rather than
 * reaching a template as a list. One member, because one destination exists;
 * the point of the closed list is that the second one is a decision somebody
 * makes here rather than a string somebody types in a catalog.
 */
export const ENTRY_RENDER_DESTINATIONS = ['character-card'] as const

export type EntryRenderDestination = (typeof ENTRY_RENDER_DESTINATIONS)[number]

/**
 * How this type reaches a prompt: the id of the variable whose layout renders
 * it (`core:var/world-lore@1`), or a destination it is folded into.
 */
export type EntryRender = string | { into: EntryRenderDestination }

/** One key of a sort, in an ordered list. Structured data — never a parsed string. */
export interface EntryOrderKey {
	/** A declared field, or a column the engine reads for every type. */
	field: string
	dir: 'asc' | 'desc'
	/**
	 * Where absent values sort. Optional because the two-key case (a year and
	 * a month that may be null) is the one that needs it, and most do not.
	 */
	nulls?: 'first' | 'last'
}

/** The reference column that decides who may see a row, and under which policy. */
export interface EntryAnchor {
	/**
	 * The column carrying the reference. A **real column with a real foreign
	 * key**, never a value inside `fields`: dangling and cross-tenant refs are
	 * a live threat here, which is why cross-ref validation exists at all.
	 */
	column: string
	policy: EntryAnchorPolicy
}

/**
 * Which field plays each field role for this type.
 *
 * Every field role is optional: a type answers the questions it has answers to,
 * and `checkEntryTypes` is what notices when a field role has stopped being
 * answered by anybody — so a dead field role is deleted rather than accreting.
 */
export interface EntryRoles {
	title?: string
	order?: readonly EntryOrderKey[]
	priority?: string
	anchor?: EntryAnchor
	embedText?: readonly string[]
	key?: string
	parent?: string
}

/**
 * The entry-row contract, as it sits on the descriptor and in the row.
 *
 * **Hashed, all of it.** Field roles, render, source kind, export key and the anchor
 * policy are what the engine reads to decide where a row competes, how it
 * sorts, who may see it and where it renders — so changing one changes what an
 * untouched install does while every pin keeps resolving, which is precisely
 * the silent behaviour change the freeze rule exists to stop. The consequence
 * is intended: **moving a field role forces `@N+1`.**
 *
 * `fields` is hashed too, and it has to be for a second reason: the declared
 * schema is projected into database CHECK constraints, so a schema change is a
 * constraint change. Display text inside it (`i18n`, `description`) is stripped
 * before hashing like everywhere else.
 */
export interface EntryShape {
	roles: EntryRoles
	/**
	 * The type-specific half of the row — what lands in `fields` jsonb, declared
	 * in the one field language (settings.ts), rendered by the one form
	 * renderer, and projected into constraints and indexes by one boot step.
	 *
	 * Only the **T1 declarative** subset projects into a constraint: required,
	 * type, min/max, enum. T2 predicates (`showIf`) are UI-level and depend on
	 * state a row does not carry.
	 */
	fields?: SettingsSchema
	render?: EntryRender
	sourceKind: EntrySourceKind
	exportKey?: EntryExportKey
	/**
	 * What an amendment to one of these rows means: `amend` layers onto the
	 * base, `replace` supersedes it.
	 *
	 * A **mode, not a per-amendment choice** — mixing both semantics in one
	 * assembled view makes the result unpredictable. Declared on the type with
	 * a per-row override, which is the nullable-with-fallback pattern
	 * `matchMode` already uses.
	 */
	amendMode?: 'amend' | 'replace'
}

/** What an author writes. Flat, because nesting the facets buys nothing here. */
export interface EntryTypeDecl<Id extends string = string> extends EntryShape {
	/** `core:entry/<name>@N`. The version is the pin, exactly as for node types. */
	id: Id
	i18n?: { name?: I18n; description?: I18n }
}

/** An entry type as it comes back out of the registry — the kind, narrowed. */
export type EntryDescriptor<Id extends string = string> = Descriptor<
	PortDecl,
	PortDecl,
	Id
> & { kind: 'entry'; entryShape: EntryShape }

const ENTRY_TYPE_ID = /^([a-z0-9][a-z0-9.-]*):entry\/([a-z0-9][a-z0-9-]*)@(\d+)$/

/**
 * Declare an entry type.
 *
 * The version lives in the id and therefore at every call site that names one,
 * which is the same convention `pin()` keeps for node types. What is
 * deliberately *not* here is a pinned constructor: `pin()` mints `v1()`, and
 * `v1()` builds a node a spec wires. An entry type is a row shape — there is
 * nothing to construct — so minting one would offer a call that can only ever
 * be a mistake.
 */
export const describeEntryType = <const Id extends string>(
	d: EntryTypeDecl<Id>,
): EntryDescriptor<Id> => {
	const { id, i18n, ...shape } = d
	// Before the id is claimed, so a refused declaration can be fixed and
	// retried — the same order `checkModeTitled` runs in.
	assertEntryShape(id, shape)
	return register({
		id,
		i18n,
		kind: 'entry' as const,
		// An entry type publishes nothing: it is not in the graph. Empty rather
		// than optional so `Descriptor` keeps meaning one thing for the five
		// kinds that are.
		ports: {},
		entryShape: shape,
	}) as EntryDescriptor<Id>
}

/** Every entry type this build declares. */
export const allEntryTypes = (): EntryDescriptor[] =>
	allTypes().filter((t): t is EntryDescriptor => t.kind === 'entry')

/**
 * Refusals at the author's line — an id, a namespace, and four closed
 * vocabularies.
 *
 * Throwing rather than collecting findings, because every one of these is a
 * typo or a decision somebody has to make, and none of them has a partial
 * answer worth keeping.
 */
function assertEntryShape(id: string, shape: EntryShape): void {
	if (!ENTRY_TYPE_ID.test(id))
		throw new Error(
			`'${id}' is not a valid entry type id. The grammar is ` +
				`'<namespace>:entry/<name>@<major>' — 'core:entry/world-lore@1'. The version ` +
				`is the pin, exactly as for node types.`,
		)
	/**
	 * Core is the sole author of entry types, and this line is the switch.
	 *
	 * Not a permanent property of the design — an entry type is data, and
	 * nothing about the projection cares who wrote it. What is missing is the
	 * rest of the story: a plugin-authored type needs its constraint projection
	 * gated, its `fields` reviewed and its rows owned. Until that exists the
	 * honest state is off, said out loud, in one place.
	 */
	if (!id.startsWith('core:'))
		throw new Error(
			`'${id}' cannot be declared: entry types are core-authored in this release. ` +
				`The row shape is data and nothing in the projection cares who wrote it, so ` +
				`this is a switch rather than a wall — but a plugin-owned type also owns a ` +
				`database constraint and the rows under it, and that half is not built.`,
		)

	const unknown = unknownRoles(shape)
	if (unknown.length)
		throw new Error(
			`${id} declares ${unknown.map((r) => `'${r}'`).join(', ')}, which no engine ` +
				`behaviour reads. The field roles are ${ENTRY_ROLES.join(', ')} — a new *behaviour* ` +
				`may add one, a new *type* may not, or the vocabulary is just a second name ` +
				`for the field.`,
		)

	if (!ENTRY_SOURCE_KINDS.includes(shape.sourceKind as EntrySourceKind))
		throw new Error(
			`${id} declares sourceKind '${shape.sourceKind}', which is not a budget band. ` +
				`Pick one of ${ENTRY_SOURCE_KINDS.join(', ')} — the weight and share maps are ` +
				`total over those five, so a sixth name is not a new band, it is candidates ` +
				`scored against undefined and dropped with nothing reporting it.`,
		)

	if (shape.exportKey && !ENTRY_EXPORT_KEYS.includes(shape.exportKey))
		throw new Error(
			`${id} declares exportKey '${shape.exportKey}', which no importer reads. The ` +
				`wire names are ${ENTRY_EXPORT_KEYS.join(', ')}; declare nothing to export ` +
				`without a marker.`,
		)

	const policy = shape.roles?.anchor?.policy
	if (policy && !ENTRY_ANCHOR_POLICIES.includes(policy))
		throw new Error(
			`${id} anchors under policy '${policy}', which core does not implement. Pick ` +
				`one of ${ENTRY_ANCHOR_POLICIES.join(', ')}. Types select policies; they ` +
				`never author them, which is what keeps a declaration from being code.`,
		)

	const render = shape.render
	if (typeof render === 'object' && !ENTRY_RENDER_DESTINATIONS.includes(render.into))
		throw new Error(
			`${id} renders into '${render.into}', which is not a destination. The ` +
				`destinations are ${ENTRY_RENDER_DESTINATIONS.join(', ')}; a variable id ` +
				`('core:var/world-lore@1') is the other legal value.`,
		)
	if (typeof render === 'string' && !/^[a-z0-9][a-z0-9.-]*:var\/[a-z0-9-]+@\d+$/.test(render))
		throw new Error(
			`${id} renders as '${render}', which is not a variable id. Name the variable ` +
				`whose layout renders these rows — 'core:var/world-lore@1' — or fold them ` +
				`into a destination with { into: … }.`,
		)
}

const unknownRoles = (shape: { roles?: EntryRoles }): string[] =>
	Object.keys(shape.roles ?? {}).filter(
		(r) => !(ENTRY_ROLES as readonly string[]).includes(r),
	)

/** A conformance finding. Every one names what to do, as everywhere here (15 §1.3). */
export interface EntryFinding {
	severity: 'error'
	code: 'E_UNKNOWN_ROLE' | 'E_DEAD_ROLE'
	message: string
	fix: string
	where?: string
}

/**
 * The conformance canary — the field role vocabulary checked in **both** directions
 * (the shape values.ts's four-way registry canary already has).
 *
 * Forward: nothing declares a field role the engine does not read.
 * `describeEntryType`
 * refuses that at the author's line, so this is the backstop for declarations
 * that did not come through the door — a row written by another build, a type
 * read back from the registry.
 *
 * Backward, and this is the direction that earns the canary: **every field role
 * the engine reads is declared by somebody.** A field role no type answers is a
 * question
 * the engine asks nothing, and the vocabulary is frozen precisely so that one
 * gets deleted rather than sitting there looking supported.
 */
export function checkEntryTypes(
	types: ReadonlyArray<{ id: string; entryShape?: EntryShape }>,
): EntryFinding[] {
	const findings: EntryFinding[] = []
	const declared = new Set<string>()

	for (const t of types) {
		const shape = t.entryShape
		if (!shape) continue
		for (const role of Object.keys(shape.roles ?? {})) declared.add(role)
		for (const role of unknownRoles(shape))
			findings.push({
				severity: 'error',
				code: 'E_UNKNOWN_ROLE',
				where: t.id,
				message: `declares field role '${role}', which no engine behaviour reads`,
				fix:
					`use one of ${ENTRY_ROLES.join(', ')}, or add the field role here and the ` +
					`behaviour that reads it in the same change. A field role only a declaration ` +
					`knows about is a field with a longer name.`,
			})
	}

	for (const role of ENTRY_ROLES)
		if (!declared.has(role))
			findings.push({
				severity: 'error',
				code: 'E_DEAD_ROLE',
				where: role,
				message: `no entry type declares '${role}', so nothing answers it`,
				fix:
					`declare it on the type it describes, or delete the field role. The vocabulary ` +
					`is frozen so that it stays small — an unanswered field role is one the engine ` +
					`asks and nobody hears.`,
			})

	return findings
}

/**
 * A pinned constructor. The builder method names the *kind*; this names the
 * *type and version* (04 §4b). Both are required — drop either and F21 or static
 * pin-checking goes with it.
 */
export interface NodeSpec<D extends Descriptor<any, any, any> = Descriptor> {
	readonly __node: true
	descriptor: D
	config: Record<string, unknown>
}

/** `'core:query/session-history@2'` → `'2'`. Absent means `1`. */
type VersionOf<S extends string> = S extends `${string}@${infer V}` ? V : '1'

export type NodeCtor<D extends Descriptor<any, any, any>> = (
	config?: Record<string, unknown>,
) => NodeSpec<D>

/**
 * A pinned constructor (04 §4b).
 *
 * The builder method names the **kind**; this names the **type and version**, and the
 * version sits at the call site — `generateText.v1({ … })` — for three reasons that a
 * version baked into the id cannot deliver:
 *
 *  - upgrading a pin is a **visible diff**, not an invisible change of meaning
 *  - two versions of a type can **coexist in one spec**, which a migration needs
 *  - a deprecated pin **strikes through** on `generateText.v1` precisely, because the
 *    key is what carries the version
 */
export type Pinned<D extends Descriptor<any, any, any>> = {
	readonly [K in `v${VersionOf<D['id']>}`]: NodeCtor<D>
} & {
	readonly id: D['id']
	readonly descriptor: D
}

export function pin<D extends Descriptor<any, any, any>>(descriptor: D): Pinned<D> {
	const version = /@(\d+)$/.exec(descriptor.id)?.[1] ?? '1'
	const ctor: NodeCtor<D> = (config: Record<string, unknown> = {}) => ({
		__node: true,
		descriptor,
		config,
	})
	return { [`v${version}`]: ctor, id: descriptor.id, descriptor } as Pinned<D>
}

/** The out-port map of whatever a pinned constructor produces — the scope's raw material. */
export type OutPortsOf<N> =
	N extends NodeSpec<infer D>
		? D extends Descriptor<infer O, any, any>
			? O
			: PortDecl
		: PortDecl
