/**
 * announce() — the serializer behind `defineExtension()` (R48, T1b). A package
 * is authored with `defineExtension()`; `announcementOf()` compiles that to the
 * announcement document this builder produces. Kept exported for core's and
 * the CLI's use, and for one release of packages still exporting a builder.
 *
 * Was: "the ONE authoring surface" (24 §6).
 *
 * A package is an announcement: identity first, then everything it declares —
 * genres, hook declarations, pipelines, configs, presets. Plugins compile the
 * announcement via the CLI (the announcement IS the manifest); SP core
 * authors the same announcement in-repo and compiles it at boot/seed. One
 * validator, one document shape, one hash discipline.
 *
 * The builder hands authors a **context-bound toolkit**: value kinds, genres
 * and hooks minted through it are namespaced under the package id, so
 * collision with core or another package is impossible by construction.
 *
 * Cross-package references are ids with the referenced thing's owner in them
 * (`use()` handles compile down to these). Referencing something external is
 * allowed and recorded; what the instance enforces at install is the
 * requirement, not the bundle (24 §10).
 */
import type { BuiltSpec } from './builder.js'
import { compile, type SpecDocument } from './document.js'

/** announce() accepts pipelines built or already compiled — one shape lands. @experimental */
export type AnnouncedSpec = BuiltSpec | SpecDocument

const isDocument = (s: AnnouncedSpec): s is SpecDocument => 'schemaVersion' in s

/**
 * A reference to something another package ships (24 §10): an id plus an
 * optional semver range. `use()` handles compile to references in the
 * document and requirements in the manifest — never a bundle. The
 * fully-typed form (option autocomplete off the published declaration
 * artifact's generated .d.ts) rides the artifact work; this is the
 * reference primitive both share.
 * @experimental
 */
export interface ExternalRef {
	readonly kind: 'external-ref'
	/** The referenced id, range stripped — what documents store. */
	readonly id: string
	/** The semver range the manifest requires, e.g. '^2'. */
	readonly range?: string
}

/**
 * An external reference carrying its target's option space in the type —
 * what the generated typings (`serene-pub types`) produce, so a config over
 * another package's pipeline autocompletes node → slot → field (24 T7b).
 * The phantom never exists at runtime; the document still stores the id.
 * @experimental
 */
export interface TypedExternalRef<T> extends ExternalRef {
	readonly __options?: T
}

/** Three-level partial: node → slot → fields, all optional — deltas only. @experimental */
export type PartialValues<T> = {
	[N in keyof T]?: {
		[S in keyof T[N]]?: T[N][S] extends Record<string, unknown> ? Partial<T[N][S]> : T[N][S]
	}
}

/** @public */
export function use(ref: string): ExternalRef {
	const m = /^(.*?)@([~^]?\d[^@]*)$/.exec(ref)
	return Object.freeze(
		m
			? { kind: 'external-ref' as const, id: m[1]!, range: m[2] }
			: { kind: 'external-ref' as const, id: ref },
	)
}

/**
 * A spec as a declaration names it: one this package ships, built or
 * compiled, or another package's, through `use()`. Never a bare id — a string
 * is a typo waiting for an install to find it.
 * @experimental
 */
export type SpecRef = AnnouncedSpec | ExternalRef

const isExternalRef = (v: unknown): v is ExternalRef =>
	!!v && typeof v === 'object' && (v as ExternalRef).kind === 'external-ref'

/** The id a `SpecRef` names; a bare string is refused with the fix. @experimental */
export function specIdOf(v: unknown, where: string): string {
	if (typeof v === 'string')
		throw new Error(
			`${where} names the spec '${v}' as a string — pass the spec value you built, ` +
				`or use('${v}') for another package's`,
		)
	if (!v || typeof v !== 'object' || typeof (v as { id?: unknown }).id !== 'string')
		throw new Error(
			`${where} names no spec — pass the spec value you built, or use('<spec id>') for another package's`,
		)
	return (v as { id: string }).id
}

/** The events a spec's inlet lock answers; undefined for another package's (`use()`). */
const lockEventsOf = (v: SpecRef): string[] | undefined => {
	if (isExternalRef(v)) return undefined
	const lock = (v as { input?: { event?: string; events?: string[] } }).input
	return lock?.events ? [...lock.events] : lock?.event ? [lock.event] : []
}

/** The action keys a spec contributes; undefined for another package's (`use()`). */
const actionKeysOf = (v: SpecRef): string[] | undefined => {
	if (isExternalRef(v)) return undefined
	const contributes = 'meta' in v ? v.meta.contributes : (v as SpecDocument).contributes
	return actionsOf({ id: v.id, contributes }).map((a) => a.key)
}
import { genre as makeGenre, genreIdOf, sessionEvents, type GenreDecl, type GenreProps } from './genres.js'
import { eventById, isEventId, isSessionEventDecl, type SessionEventDecl } from './events.js'
import { makeValueToolkit, type ValueToolkit } from './values.js'
import { ACTION_IDENTITY, actionsOf } from './actions.js'
import type { ComponentDecl, Extension } from './extension.js'
import type { SurfacesDecl } from './surfaces.js'
import { i18nFindings, type I18n } from './i18n.js'
import {
	declarationFindings,
	labelFindings,
	storedSwap,
	subjectsOf,
	swapInputFindings,
	type StoredSwapContribution,
	type SwapContribution,
} from './declarations.js'

/** @experimental */
export interface PackageIdentity {
	/** The package namespace every declared id lives under — `core`, `acme.dice`. */
	ns: string
	author: string
	/** What the package is called where it is listed — a string or a locale map with `en` (R-20). */
	title: I18n
	repo?: string
	summary?: I18n
	description?: I18n
}

/**
 * A hook *declaration* (24 §11): identity, event, contract, ordering. The
 * implementation lives with its capabilities — core's in core, a plugin's in
 * its sandboxed bundle — and boot/install binds implementation to declared id
 * with a completeness check.
 * @experimental
 */
export interface HookDeclaration {
	event: string
	description?: unknown
	/** Ordering constraints against other hook ids. */
	before?: string[]
	after?: string[]
}

/**
 * A shipped prompt (24 T6b): authored prose for one NODE's prompts slot,
 * selectable wherever that node is used. The slug is the stable identity an
 * instance's seed pass matches on; the label is display.
 *
 * Keyed by the node rather than by a spec, because a prompt follows the node it
 * was written for: a pipeline that reuses somebody's summarize step inherits
 * the prompts written for it, and one built from other nodes is offered none of
 * them. Spec scoping said the same thing less precisely and cost the reuse.
 * @experimental
 */
export interface PromptDecl {
	/**
	 * The pool: an UNVERSIONED node type id (`core:task/build-template-context`),
	 * which may belong to another package. Unversioned so a node's @1 → @2 does
	 * not strand the prose written for it.
	 */
	nodeType: string
	/**
	 * The pool's second half — which prompts slot on that node. A type may
	 * declare more than one, each with its own field set.
	 */
	slot: string
	slug: string
	/** The name a picker lists it by — a string or a locale map with `en` (R-20). */
	label: I18n
	/** Field name → prose, exactly as that slot declares them. */
	fields: Record<string, string>
}

/** A named configuration: a typed delta over a spec's author defaults (24 §7). @experimental */
export interface ConfigDecl {
	/** The spec it configures — may be external (another package's id). */
	spec: string
	slug: string
	/** The name a picker lists it by — a string or a locale map with `en` (R-20). */
	label: I18n
	description?: I18n
	/** nodeKey → slot → value. Only deviations; everything else inherits. */
	values: Record<string, Record<string, unknown>>
}

/**
 * A config as authored: the spec it configures is a value, so a
 * preset binding can check that the config it names was made for the spec
 * it binds. `config()` makes one; the entry stores it as a `ConfigDecl`.
 * @experimental
 */
export interface ConfigInput<T = Record<string, Record<string, unknown>>> {
	readonly spec: SpecRef | TypedExternalRef<T>
	slug: string
	label: I18n
	description?: I18n
	values: PartialValues<T>
}

/**
 * Author a config against a spec value, or another package's through `use()`.
 * With a spec value the node keys are checked at build; through `use()` they
 * are recorded and checked by the instance that has the spec.
 * @experimental
 */
export function config<T = Record<string, Record<string, unknown>>>(
	spec: SpecRef | TypedExternalRef<T>,
	slug: string,
	meta: { label: I18n; description?: I18n },
	values: PartialValues<T>,
): ConfigInput<T> {
	assertDisplayText(`config '${slug}'`, meta)
	specIdOf(spec, `config '${slug}'`)
	return { spec, slug, label: meta.label, description: meta.description, values }
}

/** The stored form of a config — the spec read down to its id. @experimental */
export function storedConfig(c: ConfigInput<any>): ConfigDecl {
	return {
		spec: specIdOf(c?.spec, `config '${c?.slug}'`),
		slug: c.slug,
		label: c.label,
		...(c.description !== undefined ? { description: c.description } : {}),
		values: c.values as Record<string, Record<string, unknown>>,
	}
}

/**
 * The display text rule (R-20) as a throw for `config()` / `preset()`, where
 * the author is. `build()` collects the same findings instead, through the
 * shared declaration pass.
 */
function assertDisplayText(at: string, meta: { label?: unknown; description?: unknown }): void {
	const findings = labelFindings(at, meta)
	if (findings.length)
		throw new Error(`${at} declares display text a publish refuses (R-20):\n · ${findings.join('\n · ')}`)
}

/** One event slot's binding: which pipeline answers, with which config. @experimental */
export interface PresetBinding {
	spec: string
	/** A config slug of that spec. Absent = the spec's shipped default. */
	config?: string
}

/**
 * What a preset pre-fills the creation form with (23 §9).
 *
 * Every key optional and every key advisory: the form applies the ones it
 * recognises, type-checks each, and ignores the rest — so a preset written
 * against a newer genre than the instance has can still be started, and a
 * genre's own fields ride along in `genreFields` rather than growing this
 * shape a key at a time.
 * @experimental
 */
export interface PresetDefaults {
	name?: string
	scenario?: string
	/**
	 * Swaps to seat the session with (R40): for each, a definition the named
	 * spec offers on the named node — its pin or one of its `expose.swaps`,
	 * or an enabled contribution. The same shape a package contributes with
	 * (`SwapContribution`), stored with ids:
	 * `{ spec: chatTurnOrder, node: 'decide.rules.strategy', definition: C.turnManual }`.
	 * Written as the session's rebinds at create; an entry the node does not
	 * offer is refused there, logged, and the session starts on the pin.
	 * Replaced `speakerStrategy` (2026-09-23), which named one node.
	 */
	swaps?: StoredSwapContribution[]
	lorebookId?: number | null
	tags?: string[]
	/** The genre's declared fields, by key. */
	genreFields?: Record<string, unknown>
	/**
	 * Envoys to seat on creation, by slug (R-18; U5g) — beside the genre's
	 * `default: true` ones, which are seated with no choice. A slug the
	 * genre (or an installed action) does not declare is ignored, on the
	 * same advisory terms as every other key here.
	 */
	envoys?: string[]
}

/**
 * A preset populates a genre's event slots (24 §1): for each event the genre
 * declares, which pipeline variant answers it, with which config.
 * @experimental
 */
export interface PresetDecl {
	slug: string
	genre: string
	/** The name the picker lists it by — a string or a locale map with `en` (R-20). */
	label: I18n
	description?: I18n
	bindings: Record<string, PresetBinding>
	/**
	 * For the open `session-action` slot: which actions come along, each by
	 * its **identity** — `<spec slug>#<key>` (U5c review, W-A). A preset
	 * curates declarations, never functions: two specs contributing one
	 * function are two entries, and including one says nothing about the
	 * other. Absent means the host's companion rule (every action from the
	 * genre owner's own namespace).
	 */
	actions?: { include: string[] }
	/** What starting from this preset pre-fills the creation form with. */
	defaults?: PresetDefaults
	/**
	 * Whether the instance should offer this preset the moment the package is
	 * enabled. **Absent means no**, and that is the interesting half.
	 *
	 * A preset is what a non-admin picks from, so a package that installed one
	 * straight into everybody's picker would be deciding, on the administrator's
	 * behalf, what this instance offers. So the projection lands it disabled and
	 * an administrator switches it on — the same shape as a declared permission,
	 * which is also announced by the package and granted by the instance.
	 *
	 * Setting it is a request, not a grant: an instance is free to ignore it,
	 * and an administrator who has already disabled a preset keeps that decision
	 * across upgrades.
	 */
	enabled?: boolean
}

/**
 * One binding in a preset: a spec value, bound on every event its inlet
 * lock answers, or `{ spec, config?, events? }`. `events` narrows a lock over
 * several events, and is required for another package's spec (`use()`),
 * whose lock this build cannot read. The stored form is keyed by event.
 * @experimental
 */
export type BindingEntry =
	| AnnouncedSpec
	| { spec: SpecRef; config?: ConfigInput<any>; events?: string[] }

/**
 * An action a preset brings along: a spec value, for every action it
 * contributes, or `{ spec, key }` for one of them. Stored as the action
 * identity, `<spec slug>#<key>`.
 * @experimental
 */
export type ActionPick = AnnouncedSpec | { spec: SpecRef; key: string }

/**
 * Who may record a package's event, as authored: a binding subject — an
 * event id of the genre (`sessionEvents.messageRespond`), an action pick
 * (`{ spec, key }`), or a spec value, which stands for every subject its
 * inlet lock serves.
 * @experimental
 */
export type RecordedByEntry = string | ActionPick

/** A package's event and its recording scope, as authored in `defineExtension({ events })`. @experimental */
export interface EventDeclarationInput {
	event: SessionEventDecl
	genre: GenreDecl | ExternalRef
	/** The subjects whose pipelines may record it, or `'any'` for every spec. */
	recordedBy: readonly RecordedByEntry[] | 'any'
}

/** An event declaration as stored in the manifest and the announcement: ids throughout. @experimental */
export interface StoredEventDeclaration {
	event: string
	payload: string
	name: I18n
	description: I18n
	domain: 'session'
	genre: string
	/** Event ids and action identities (`<spec slug>#<key>`), or `'any'`. */
	recordedBy: string[] | 'any'
}

/** The stored form of an event declaration; throws the first mistake, with the fix. @experimental */
export function storedEventDeclaration(d: EventDeclarationInput): StoredEventDeclaration {
	const where = `event '${(d?.event as { id?: string } | undefined)?.id ?? '?'}'`
	if (!isSessionEventDecl(d?.event))
		throw new Error(`${where}: 'event' is the value defineSessionEvent() returned, not an id`)
	if (typeof d.genre === 'string')
		throw new Error(`${where} names its genre as a string — pass the genre value, or use('${d.genre}')`)
	const genre = isExternalRef(d.genre) ? d.genre.id : genreIdOf(d.genre)
	let recordedBy: string[] | 'any'
	if (d.recordedBy === 'any') recordedBy = 'any'
	else {
		if (!Array.isArray(d.recordedBy) || !d.recordedBy.length)
			throw new Error(
				`${where} names nothing that may record it — list the subjects whose pipelines record it, or 'any'`,
			)
		recordedBy = d.recordedBy.flatMap((entry, n): string[] => {
			const at = `${where} recordedBy ${n + 1}`
			if (typeof entry === 'string') {
				if (!isEventId(entry) || !eventById(entry))
					throw new Error(`${at}: '${entry}' is not a declared event id — pass an event of the genre, a spec, or { spec, key }`)
				if (entry === sessionEvents.sessionAction)
					throw new Error(
						`${at}: the action event serves each action on its own — pick the action: { spec, key }, or pass the spec`,
					)
				return [entry]
			}
			if (isBindingObject(entry)) {
				const { spec: ref, key } = entry as { spec: SpecRef; key?: unknown }
				const id = specIdOf(ref, at)
				if (typeof key !== 'string') throw new Error(`${at} picks from '${id}' without a key — { spec, key }`)
				const keys = actionKeysOf(ref)
				if (keys && !keys.includes(key))
					throw new Error(`${at} picks '${key}' from '${id}', which contributes ${keys.map((k) => `'${k}'`).join(', ') || 'no actions'}`)
				return [`${id}#${key}`]
			}
			specIdOf(entry, at)
			const subjects = subjectsOf(entry as AnnouncedSpec)
			if (!subjects.length) throw new Error(`${at}: '${(entry as AnnouncedSpec).id}' has no inlet lock — it serves no subject`)
			return subjects
		})
	}
	return {
		event: d.event.id,
		payload: d.event.payload,
		name: d.event.name,
		description: d.event.description,
		domain: d.event.domain,
		genre,
		recordedBy,
	}
}

/** `PresetDefaults` as authored: swaps name their spec by value. @experimental */
export type PresetDefaultsInput = Omit<PresetDefaults, 'swaps'> & { swaps?: SwapContribution[] }

/**
 * A preset as authored: the genre, the bound specs, their configs and
 * the included actions are values. The entry (`defineExtension`,
 * `announce().presets`) stores it as a `PresetDecl`, which is unchanged.
 * @experimental
 */
export interface PresetInput {
	slug: string
	genre: GenreDecl | ExternalRef
	/** The name the picker lists it by — a string or a locale map with `en` (R-20). */
	label: I18n
	description?: I18n
	bindings: BindingEntry[]
	/** Absent means the host's companion rule — see `PresetDecl.actions`. */
	actions?: { include: ActionPick[] }
	defaults?: PresetDefaultsInput
	/** Ask the instance to offer this preset immediately. See `PresetDecl.enabled`. */
	enabled?: boolean
}

const isBindingObject = (v: unknown): v is { spec: SpecRef; config?: ConfigInput<any>; events?: string[] } =>
	!!v && typeof v === 'object' && 'spec' in v

/**
 * The stored form of a preset. Every reference is read down to its id and
 * checked against what the value says: a binding's events against its spec's
 * lock, a config against the spec it was made for, an action key against
 * the keys the spec declares. Throws the first mistake, with the fix.
 * @experimental
 */
export function preset(input: PresetInput): PresetDecl {
	const where = `preset '${input?.slug}'`
	assertDisplayText(where, input)
	if (typeof input.genre === 'string')
		throw new Error(
			`${where} names its genre as a string — pass the genre value (import it), or use('${input.genre}')`,
		)
	const genre = isExternalRef(input.genre) ? input.genre.id : genreIdOf(input.genre)

	const bindings: Record<string, PresetBinding> = {}
	if (!Array.isArray(input.bindings))
		throw new Error(
			`${where}: bindings is a list of specs — [createSession, { spec: respond, config: tuned }]; ` +
				`each is bound on the events its inlet lock answers`,
		)
	for (const [i, raw] of input.bindings.entries()) {
		const entry = isBindingObject(raw) ? raw : { spec: raw as SpecRef }
		const at = `${where} binding ${i + 1}`
		const id = specIdOf(entry.spec, at)
		const locked = lockEventsOf(entry.spec)
		let events = entry.events
		if (events === undefined) {
			if (!locked)
				throw new Error(
					`${at} binds '${id}', another package's spec — name the events it answers: ` +
						`{ spec: use('${id}'), events: [ … ] }`,
				)
			if (!locked.length)
				throw new Error(
					`${at} binds '${id}', which has no inlet lock — a preset binds a spec on the events its lock answers`,
				)
			events = locked
		} else if (!events.length) {
			throw new Error(`${at} binds '${id}' on no events — drop \`events\` to bind every event its lock answers`)
		} else if (locked) {
			const outside = events.filter((e) => !locked.includes(e))
			if (outside.length)
				throw new Error(
					`${at} binds '${id}' on ${outside.map((e) => `'${e}'`).join(', ')}, which its inlet lock ` +
						`does not answer (${locked.join(', ') || 'no lock'})`,
				)
		}
		let configSlug: string | undefined
		if (entry.config !== undefined) {
			const configured = specIdOf(entry.config?.spec, `${at} config`)
			if (configured !== id)
				throw new Error(
					`${at} binds '${id}' with config '${entry.config.slug}', which was made for '${configured}'`,
				)
			configSlug = entry.config.slug
		}
		for (const event of events) {
			if (bindings[event])
				throw new Error(`${where} binds '${event}' twice — to '${bindings[event]!.spec}' and to '${id}'`)
			bindings[event] = { spec: id, ...(configSlug !== undefined ? { config: configSlug } : {}) }
		}
	}

	const include = (pick: ActionPick, n: number): string[] => {
		const at = `${where} action ${n + 1}`
		if (typeof pick === 'string')
			throw new Error(
				`${at} names '${pick}' as a string — pass the spec value (every action it contributes) ` +
					`or { spec, key } for one`,
			)
		if (isBindingObject(pick)) {
			const { spec: ref, key } = pick as { spec: SpecRef; key?: unknown }
			const id = specIdOf(ref, at)
			if (typeof key !== 'string' || !ACTION_IDENTITY.test(`${id}#${key}`))
				throw new Error(`${at} picks from '${id}' without a valid key — { spec, key: '<action key>' }`)
			const keys = actionKeysOf(ref)
			if (keys && !keys.includes(key))
				throw new Error(
					`${at} picks '${key}' from '${id}', which contributes ${keys.length ? keys.map((k) => `'${k}'`).join(', ') : 'no actions'}`,
				)
			return [`${id}#${key}`]
		}
		const id = specIdOf(pick, at)
		const keys = actionKeysOf(pick as SpecRef)
		if (!keys)
			throw new Error(
				`${at} includes '${id}', another package's spec — name the action: { spec: use('${id}'), key: '<action key>' }`,
			)
		if (!keys.length)
			throw new Error(`${at} includes '${id}', which contributes no actions — nothing to bring along`)
		return keys.map((k) => `${id}#${k}`)
	}

	const swapsOf = (swaps: SwapContribution[]): StoredSwapContribution[] => {
		const faults = swapInputFindings(swaps)
		if (faults.length) throw new Error(`${where} defaults.swaps: ${faults.join('; ')}`)
		return swaps.map((c) => storedSwap(c))
	}

	return {
		slug: input.slug,
		genre,
		label: input.label,
		description: input.description,
		bindings,
		...(input.actions ? { actions: { include: input.actions.include.flatMap(include) } } : {}),
		...(input.defaults
			? {
					defaults: {
						...input.defaults,
						...(input.defaults.swaps ? { swaps: swapsOf(input.defaults.swaps) } : {}),
					} as PresetDefaults,
				}
			: {}),
		// Omitted rather than defaulted to `false`, so a declaration that says
		// nothing hashes as it always did — the announcement is content-hashed
		// like every other declaration here.
		...(input.enabled === undefined ? {} : { enabled: input.enabled }),
	}
}

/** The compiled announcement — the package's declaration artifact (24 §10). @experimental */
export interface AnnouncementDocument {
	schemaVersion: 1
	identity: PackageIdentity
	genres: GenreDecl[]
	/** Fully-qualified hook id → declaration. */
	hooks: Record<string, HookDeclaration>
	pipelines: SpecDocument[]
	prompts: PromptDecl[]
	configs: ConfigDecl[]
	presets: PresetDecl[]
	/**
	 * Frame surfaces this package ships (20 §12, 21 §7) — the documents an
	 * instance mounts in opaque-origin iframes. Absent means the package has
	 * no UI of its own, which is the common case.
	 */
	surfaces?: SurfacesDecl
	/** In-document components (10 §2, virtual tier). */
	components: ComponentDecl[]
	/**
	 * Definitions this package offers on other packages' swappable nodes
	 * (R29), definitions as ids. Absent when the package contributes none, so
	 * a package that declares no swap announces exactly what it did before.
	 */
	swaps?: StoredSwapContribution[]
	/**
	 * Events this package declares, with who may record them. Absent
	 * when it declares none, so a package without events announces exactly
	 * what it did before.
	 */
	events?: StoredEventDeclaration[]
	/** Ids referenced but not declared here — the instance enforces these at install. */
	requires: string[]
}

/** One event slot's standing in a preset, for the coverage report (24 §7). @experimental */
export interface CoverageSlot {
	event: string
	required: boolean
	binding?: PresetBinding
	/**
	 * `bound` — filled and verified against the announced spec's input lock;
	 * `bound-external` — filled by a reference this package cannot verify
	 * (the instance will); `unbound` — an optional slot left empty;
	 * `MISSING` — a required slot left empty (also a build error).
	 */
	status: 'bound' | 'bound-external' | 'unbound' | 'MISSING'
}

/** @experimental */
export interface CoverageReport {
	presets: Array<{ preset: string; genre: string; slots: CoverageSlot[] }>
	/** Deliberate holes: `todo()` sentinels found in config values. */
	todos: Array<{ path: string; note: string }>
}

const NS = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

/** @internal The builder behind `announcementOf()`; author a package with `defineExtension()`. */
export class AnnouncementBuilder {
	/** The context-bound value toolkit — custom kinds mint under this package. */
	readonly v: ValueToolkit

	private _genres = new Map<string, GenreDecl>()
	private _hooks: Record<string, HookDeclaration> = {}
	private _pipelines: AnnouncedSpec[] = []
	private _configs: ConfigDecl[] = []
	private _presets: PresetDecl[] = []
	private _prompts: PromptDecl[] = []
	private _surfaces: SurfacesDecl | undefined
	private _components: ComponentDecl[] = []
	private _swaps: Array<SwapContribution | StoredSwapContribution> = []
	private _events: StoredEventDeclaration[] = []

	constructor(readonly identity: PackageIdentity) {
		if (!NS.test(identity.ns))
			throw new Error(
				`'${identity.ns}' is not a valid package namespace — lowercase, digits, hyphens, dots`,
			)
		this.v = makeValueToolkit(identity.ns)
	}

	/** Context sugar: mints `${ns}:genre/${name}` so the id cannot be mistyped. */
	genre(name: string, props: GenreProps): GenreDecl {
		const decl = makeGenre(`${this.identity.ns}:genre/${name}`, props)
		this._genres.set(decl.id, decl)
		return decl
	}

	genres(map: Record<string, GenreDecl>): this {
		for (const decl of Object.values(map)) {
			const owner = decl.id.slice(0, decl.id.indexOf(':'))
			if (owner !== this.identity.ns)
				throw new Error(
					`genre '${decl.id}' is owned by '${owner}' — a package declares only its own ` +
						`genres; referencing another's is done from a spec's input binding`,
				)
			this._genres.set(decl.id, decl)
		}
		return this
	}

	/** Declarations only — implementations bind by id per trust domain (24 §11). */
	hooks(map: Record<string, HookDeclaration>): this {
		for (const [key, decl] of Object.entries(map))
			this._hooks[`${this.identity.ns}:hook/${key}`] = decl
		return this
	}

	pipelines(...specs: AnnouncedSpec[]): this {
		this._pipelines.push(...specs)
		return this
	}

	configs(...configs: ConfigInput<any>[]): this {
		this._configs.push(...configs.map(storedConfig))
		return this
	}

	prompts(...prompts: PromptDecl[]): this {
		this._prompts.push(...prompts)
		return this
	}

	presets(...presets: PresetInput[]): this {
		this._presets.push(...presets.map(preset))
		return this
	}

	/**
	 * The frame surfaces this package ships (20 §12): documents mounted in
	 * opaque-origin iframes. Declared, never discovered — an instance renders
	 * what the manifest says and `serene-pub preview` renders the same list,
	 * so a surface a modder previewed is a surface an instance will offer.
	 */
	surfaces(decl: SurfacesDecl): this {
		this._surfaces = { ...this._surfaces, ...decl }
		return this
	}

	/** In-document components (10 §2, virtual tier) — code trust at install. */
	components(...components: ComponentDecl[]): this {
		this._components.push(...components)
		return this
	}

	/**
	 * Offer this package's definitions on another package's swappable nodes:
	 * `.swaps({ spec: chatTurnOrder, node: 'decide.rules.strategy', definition: myStrategy })`,
	 * the spec a value you imported, or `use('<spec id>')`. For a node of this package's own spec, list
	 * the swap on the node itself with `expose.swaps` instead.
	 */
	swaps(...contributions: SwapContribution[]): this {
		const faults = swapInputFindings(contributions)
		if (faults.length) throw new Error(`swaps:\n · ${faults.join('\n · ')}`)
		this._swaps.push(...contributions)
		return this
	}

	/**
	 * Validate the announcement as a whole and compile it to the document.
	 * Errors carry exact paths — the teaching-error pattern (15 §1.3).
	 */
	build(): { document: AnnouncementDocument; coverage: CoverageReport } {
		const errors: string[] = []
		const ns = this.identity.ns

		// The display text (R-20, U5i): the package's own title, summary and
		// description. Every prompt's, config's and preset's label is checked
		// by the shared declaration pass below, so a hand-built document gets
		// the same answer the constructor gives.
		errors.push(...i18nFindings(this.identity.title, 'identity.title', { required: true }))
		errors.push(...i18nFindings(this.identity.summary, 'identity.summary'))
		errors.push(...i18nFindings(this.identity.description, 'identity.description'))

		// Every announced id lives under the package namespace. Kept here rather
		// than in the shared pass because `defineExtension` refuses the same
		// thing in its own words, naming the plugin slug (D-1).
		for (const s of this._pipelines) {
			const owner = s.id.includes(':') ? s.id.slice(0, s.id.indexOf(':')) : undefined
			if (owner !== ns)
				errors.push(`pipeline '${s.id}' is not under this package's namespace '${ns}'`)
		}

		// Everything else a package declares — genres, the input lock, create
		// pipelines, actions, prompts, configs, presets, surfaces, components —
		// is checked by the pass `defineExtension` runs too (D-1), so one
		// mistake gets one sentence wherever it was written.
		const found = declarationFindings({
			ns,
			genres: [...this._genres.values()],
			pipelines: this._pipelines,
			prompts: this._prompts,
			configs: this._configs,
			presets: this._presets,
			surfaces: this._surfaces,
			components: this._components,
			swaps: this._swaps,
			events: this._events,
		})
		errors.push(...found.errors)
		const coverage = found.coverage

		if (errors.length) throw new AnnouncementError(errors, coverage)

		return {
			document: {
				schemaVersion: 1,
				identity: this.identity,
				genres: [...this._genres.values()],
				hooks: this._hooks,
				pipelines: this._pipelines.map((s) => (isDocument(s) ? s : compile(s))),
				prompts: this._prompts,
				configs: this._configs,
				presets: this._presets,
				...(this._surfaces ? { surfaces: this._surfaces } : {}),
				components: this._components,
				...(this._swaps.length ? { swaps: this._swaps.map(storedSwap) } : {}),
				...(this._events.length ? { events: this._events } : {}),
				requires: found.requires,
			},
			coverage,
		}
	}
}

/** Build refusal that still carries the coverage — the report is the error's context. @experimental */
export class AnnouncementError extends Error {
	constructor(
		readonly errors: string[],
		readonly coverage: CoverageReport,
	) {
		super(`announcement refused:\n  - ${errors.join('\n  - ')}`)
		this.name = 'AnnouncementError'
	}
}

/** @internal Author a package with `defineExtension()`; this is the serializer behind it. */
export function announce(identity: PackageIdentity): AnnouncementBuilder {
	return new AnnouncementBuilder(identity)
}

/**
 * The announcement document a `defineExtension()` declaration compiles to —
 * what a host syncs and what the coverage report reads. Core declares itself
 * with `defineExtension()` like any package and is announced through this.
 *
 * @internal Author a package with `defineExtension()`; this is the host's
 * view of it.
 */
export function announcementOf(e: Extension): { document: AnnouncementDocument; coverage: CoverageReport } {
	const builder = announce({
		ns: e.slug,
		author: e.author ?? e.slug,
		title: e.name,
		...(e.repo !== undefined ? { repo: e.repo } : {}),
		...(e.description !== undefined ? { summary: e.description } : {}),
	})
	if (e.hooks && Object.keys(e.hooks).length) builder.hooks(e.hooks)
	if (e.genres?.length) builder.genres(Object.fromEntries(e.genres.map((g) => [g.id, g])))
	if (e.pipelines?.length) builder.pipelines(...e.pipelines)
	if (e.prompts?.length) builder.prompts(...e.prompts)
	if (e.surfaces) builder.surfaces(e.surfaces)
	if (e.components?.length) builder.components(...e.components)
	// Already read down to ids by `defineExtension()`: the stored shapes go in as they are.
	const stored = builder as unknown as {
		_configs: ConfigDecl[]
		_presets: PresetDecl[]
		_swaps: Array<SwapContribution | StoredSwapContribution>
	}
	stored._configs.push(...(e.configs ?? []))
	stored._presets.push(...(e.presets ?? []))
	stored._swaps.push(...(e.swaps ?? []))
	;(builder as unknown as { _events: StoredEventDeclaration[] })._events.push(...(e.events ?? []))
	return builder.build()
}
