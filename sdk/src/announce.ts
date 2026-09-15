/**
 * announce() — the ONE authoring surface (24 §6).
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

/** announce() accepts pipelines built or already compiled — one shape lands. */
export type AnnouncedSpec = BuiltSpec | SpecDocument

const isDocument = (s: AnnouncedSpec): s is SpecDocument => 'schemaVersion' in s

/**
 * A reference to something another package ships (24 §10): an id plus an
 * optional semver range. `use()` handles compile to references in the
 * document and requirements in the manifest — never a bundle. The
 * fully-typed form (option autocomplete off the published declaration
 * artifact's generated .d.ts) rides the artifact work; this is the
 * reference primitive both share.
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
 */
export interface TypedExternalRef<T> extends ExternalRef {
	readonly __options?: T
}

/** Three-level partial: node → slot → fields, all optional — deltas only. */
export type PartialValues<T> = {
	[N in keyof T]?: {
		[S in keyof T[N]]?: T[N][S] extends Record<string, unknown> ? Partial<T[N][S]> : T[N][S]
	}
}

export function use(ref: string): ExternalRef {
	const m = /^(.*?)@([~^]?\d[^@]*)$/.exec(ref)
	return Object.freeze(
		m
			? { kind: 'external-ref' as const, id: m[1]!, range: m[2] }
			: { kind: 'external-ref' as const, id: ref },
	)
}

const refId = (v: BuiltSpec | ExternalRef | string): string =>
	typeof v === 'string'
		? v
		: 'kind' in v && v.kind === 'external-ref'
			? v.id
			: (v as BuiltSpec).id
import {
	genre as makeGenre,
	genreIdOf,
	sessionEvents,
	type GenreDecl,
	type GenreProps,
} from './genres.js'
import { makeValueToolkit, isTodo, type ValueToolkit } from './values.js'
import type { ComponentDecl } from './extension.js'
import { isServableEntry, isServablePanelId, type SurfacesDecl } from './surfaces.js'

export interface PackageIdentity {
	/** The package namespace every declared id lives under — `core`, `acme.dice`. */
	ns: string
	author: string
	title: string
	repo?: string
	summary?: string
	description?: string
}

/**
 * A hook *declaration* (24 §11): identity, event, contract, ordering. The
 * implementation lives with its capabilities — core's in core, a plugin's in
 * its sandboxed bundle — and boot/install binds implementation to declared id
 * with a completeness check.
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
	label: string
	/** Field name → prose, exactly as that slot declares them. */
	fields: Record<string, string>
}

/** A named configuration: a typed delta over a spec's author defaults (24 §7). */
export interface ConfigDecl {
	/** The spec it configures — may be external (another package's id). */
	spec: string
	slug: string
	label: string
	description?: string
	/** nodeKey → slot → value. Only deviations; everything else inherits. */
	values: Record<string, Record<string, unknown>>
}

/**
 * Author a config against a spec handle (announced or external). With a
 * BuiltSpec handle the node keys are validated at announce-compile; with a
 * bare id they are recorded and verified by the instance that has the spec.
 */
export function config<T = Record<string, Record<string, unknown>>>(
	spec: BuiltSpec | TypedExternalRef<T> | ExternalRef | string,
	slug: string,
	meta: { label: string; description?: string },
	values: PartialValues<T>,
): ConfigDecl {
	return {
		spec: refId(spec),
		slug,
		label: meta.label,
		description: meta.description,
		values: values as Record<string, Record<string, unknown>>,
	}
}

/** One event slot's binding: which pipeline answers, with which config. */
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
 */
export interface PresetDefaults {
	name?: string
	scenario?: string
	groupReplyStrategy?: string
	lorebookId?: number | null
	tags?: string[]
	/** The genre's declared fields, by key. */
	genreFields?: Record<string, unknown>
}

/**
 * A preset populates a genre's event slots (24 §1): for each event the genre
 * declares, which pipeline variant answers it, with which config.
 */
export interface PresetDecl {
	slug: string
	genre: string
	label: string
	description?: string
	bindings: Record<string, PresetBinding>
	/** For the open `session-action` slot: which actions come along. */
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

type BindingInput =
	BuiltSpec | ExternalRef | string | [BuiltSpec | ExternalRef | string, ConfigDecl | string]

export function preset(
	slug: string,
	props: {
		genre: GenreDecl | string
		label: string
		description?: string
		bindings: Record<string, BindingInput>
		actions?: { include: Array<BuiltSpec | ExternalRef | string> }
		defaults?: PresetDefaults
		/** Ask the instance to offer this preset immediately. See `PresetDecl.enabled`. */
		enabled?: boolean
	},
): PresetDecl {
	const bindings: Record<string, PresetBinding> = {}
	for (const [event, b] of Object.entries(props.bindings)) {
		const [specRef, configRef] = Array.isArray(b) ? b : ([b, undefined] as const)
		bindings[event] = {
			spec: refId(specRef),
			...(configRef !== undefined
				? { config: typeof configRef === 'string' ? configRef : configRef.slug }
				: {}),
		}
	}
	return {
		slug,
		genre: genreIdOf(props.genre),
		label: props.label,
		description: props.description,
		bindings,
		...(props.actions
			? {
					actions: {
						include: props.actions.include.map(refId),
					},
				}
			: {}),
		...(props.defaults ? { defaults: props.defaults } : {}),
		// Omitted rather than defaulted to `false`, so a declaration that says
		// nothing hashes as it always did — the announcement is content-hashed
		// like every other declaration here.
		...(props.enabled === undefined ? {} : { enabled: props.enabled }),
	}
}

/** The compiled announcement — the package's declaration artifact (24 §10). */
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
	/** Ids referenced but not declared here — the instance enforces these at install. */
	requires: string[]
}

/** One event slot's standing in a preset, for the coverage report (24 §7). */
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

export interface CoverageReport {
	presets: Array<{ preset: string; genre: string; slots: CoverageSlot[] }>
	/** Deliberate holes: `todo()` sentinels found in config values. */
	todos: Array<{ path: string; note: string }>
}

const NS = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

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

	configs(...configs: ConfigDecl[]): this {
		this._configs.push(...configs)
		return this
	}

	prompts(...prompts: PromptDecl[]): this {
		this._prompts.push(...prompts)
		return this
	}

	presets(...presets: PresetDecl[]): this {
		this._presets.push(...presets)
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
	 * Validate the announcement as a whole and compile it to the document.
	 * Errors carry exact paths — the teaching-error pattern (15 §1.3).
	 */
	build(): { document: AnnouncementDocument; coverage: CoverageReport } {
		const errors: string[] = []
		const ns = this.identity.ns
		const announcedSpecs = new Map(this._pipelines.map((s) => [s.id, s]))
		const requires = new Set<string>()

		// Every announced id lives under the package namespace.
		for (const s of this._pipelines) {
			const owner = s.id.includes(':') ? s.id.slice(0, s.id.indexOf(':')) : undefined
			if (owner !== ns)
				errors.push(`pipeline '${s.id}' is not under this package's namespace '${ns}'`)
		}

		// The input lock (24 §4): session-event specs verified; external genres recorded.
		const sessionEventSet = new Set<string>(Object.values(sessionEvents))
		for (const s of this._pipelines) {
			if (!s.input?.event) continue
			const genreId = s.input.genre
			if (!genreId) {
				// The builder refuses this at authoring time; a hand-built
				// document gets the same answer here.
				errors.push(`pipeline '${s.id}' answers '${s.input.event}' with no genre (24 §4)`)
				continue
			}
			if (!this._genres.has(genreId)) requires.add(genreId)
			if (
				!sessionEventSet.has(s.input.event) &&
				!s.input.event.includes(':') // custom events carry their namespace
			)
				errors.push(
					`pipeline '${s.id}' answers unknown event '${s.input.event}' — core events ` +
						`come from sessionEvents; custom ones are namespaced ('${ns}:your-event')`,
				)
		}

		// Exactly one create pipeline per declared genre (24 §3).
		for (const g of this._genres.values()) {
			const creates = this._pipelines.filter(
				(s) => s.input?.genre === g.id && s.input?.event === sessionEvents.sessionCreated,
			)
			if (creates.length === 0)
				errors.push(
					`genre '${g.id}' has no create pipeline — every genre needs exactly one ` +
						`spec answering '${sessionEvents.sessionCreated}' (24 §3)`,
				)
			if (creates.length > 1)
				errors.push(
					`genre '${g.id}' has ${creates.length} create pipelines ` +
						`(${creates.map((s) => s.id).join(', ')}) — exactly one (24 §3)`,
				)
		}

		// Prompts: slugs unique per POOL, which is `(node type, slot)`.
		//
		// Uniqueness is per pool and not global: `summarize-scene-default` names
		// a row in the batch, synth and naming pools, and they are three
		// different prompts that happen to have been split out of one bundle.
		//
		// A prompt for a node this package does not announce is deliberately NOT
		// recorded as a requirement, which is the one thing that changed here
		// besides the key. It is the whole point of node scoping that a package
		// may ship prose for somebody else's node, and a node type is neither a
		// genre nor a spec slug — the only two shapes an instance can check
		// (`requirements.ts`). Listing one would make every install of the
		// package fail permanently on a requirement nothing can ever satisfy,
		// where the real failure mode is mild and self-announcing: the row seeds
		// into a pool no installed pipeline offers, and is simply never shown.
		const seenPrompts = new Set<string>()
		for (const pr of this._prompts) {
			const pool = `${pr.nodeType}#${pr.slot}`
			const key = `${pool}#${pr.slug}`
			if (seenPrompts.has(key)) errors.push(`duplicate prompt '${pr.slug}' for '${pool}'`)
			seenPrompts.add(key)
		}

		// Configs: node keys verified for announced specs; slugs unique per spec.
		const configKey = (c: ConfigDecl) => `${c.spec}#${c.slug}`
		const seenConfigs = new Set<string>()
		for (const c of this._configs) {
			if (seenConfigs.has(configKey(c)))
				errors.push(`duplicate config '${c.slug}' for '${c.spec}'`)
			seenConfigs.add(configKey(c))
			const target = announcedSpecs.get(c.spec)
			if (!target) {
				requires.add(c.spec)
				continue
			}
			for (const nodeKey of Object.keys(c.values))
				if (!target.nodes.some((n) => n.key === nodeKey))
					errors.push(
						`config '${c.slug}' for '${c.spec}' addresses unknown node '${nodeKey}'`,
					)
		}

		// Presets: validated against the genre's event surface (24 §7).
		const coverage: CoverageReport = { presets: [], todos: [] }
		for (const p of this._presets) {
			const g = this._genres.get(p.genre)
			if (!g) requires.add(p.genre)
			const surface: Record<string, { required?: boolean; open?: boolean }> = g
				? { ...g.events }
				: {}
			// Slots the preset binds beyond the declared surface are errors when
			// the genre is ours to know; recorded when it is not.
			const slots: CoverageSlot[] = []
			const events = new Set([...Object.keys(surface), ...Object.keys(p.bindings)])
			for (const event of events) {
				const declared = surface[event]
				const binding = p.bindings[event]
				if (g && !declared && binding) {
					errors.push(
						`preset '${p.slug}' binds '${event}', which genre '${p.genre}' does not declare`,
					)
					continue
				}
				if (!binding) {
					const required = !!declared?.required
					if (required)
						errors.push(
							`preset '${p.slug}' leaves required slot '${event}' of '${p.genre}' unbound`,
						)
					slots.push({
						event,
						required,
						status: required ? 'MISSING' : 'unbound',
					})
					continue
				}
				const bound = announcedSpecs.get(binding.spec)
				if (!bound) {
					requires.add(binding.spec)
					slots.push({
						event,
						required: !!declared?.required,
						binding,
						status: 'bound-external',
					})
				} else {
					if (bound.input?.event !== event)
						errors.push(
							`preset '${p.slug}' binds '${bound.id}' to '${event}', but that spec ` +
								`answers '${bound.input?.event ?? 'nothing'}' (24 §4)`,
						)
					if (bound.input?.genre !== p.genre)
						errors.push(
							`preset '${p.slug}' (genre '${p.genre}') binds '${bound.id}', which ` +
								`serves '${bound.input?.genre ?? 'no genre'}' (24 §4)`,
						)
					if (
						binding.config &&
						!this._configs.some(
							(c) => c.spec === binding.spec && c.slug === binding.config,
						)
					)
						errors.push(
							`preset '${p.slug}' names config '${binding.config}' of ` +
								`'${binding.spec}', which this package does not declare`,
						)
					slots.push({
						event,
						required: !!declared?.required,
						binding,
						status: 'bound',
					})
				}
			}
			for (const a of p.actions?.include ?? []) if (!announcedSpecs.has(a)) requires.add(a)
			coverage.presets.push({ preset: p.slug, genre: p.genre, slots })
		}

		// Surfaces and components: an entry that does not exist at install is a
		// blank panel nobody can debug, so the shape is checked where the author
		// can still fix it. What is *at* the path is the packager's business.
		const panelIds = new Set<string>()
		for (const [i, p] of (this._surfaces?.panels ?? []).entries()) {
			if (!p?.id) errors.push(`surfaces.panels[${i}] has no id — a layout row keys on it`)
			else if (panelIds.has(p.id))
				errors.push(`duplicate panel id '${p.id}' — ids are the layout key (21 §6)`)
			else {
				panelIds.add(p.id)
				if (!isServablePanelId(p.id))
					errors.push(
						`panel id '${p.id}' is not one an instance accepts (lowercase letters, ` +
							`digits, '-' and '_') — it would be dropped silently at install`,
					)
			}
			if (!p?.entry) errors.push(`surfaces.panels[${i}] has no entry document`)
			else if (!isServableEntry(p.entry))
				errors.push(
					`surfaces.panels[${i}] entry '${p.entry}' is not a path an instance will ` +
						`serve — it would be dropped silently at install`,
				)
		}
		for (const [where, decl] of [
			['session-view', this._surfaces?.['session-view']],
			['page', this._surfaces?.page],
		] as const) {
			if (decl && !decl.entry) errors.push(`surfaces.${where} has no entry document`)
			else if (decl?.entry && !isServableEntry(decl.entry))
				errors.push(
					`surfaces.${where} entry '${decl.entry}' is not a path an instance will serve`,
				)
		}

		const componentSlugs = new Set<string>()
		for (const [i, c] of this._components.entries()) {
			if (!c?.slug)
				errors.push(`components[${i}] has no slug — slugs are the sync key (12 §3b)`)
			else if (componentSlugs.has(c.slug))
				errors.push(`duplicate component slug '${c.slug}' (12 §3b)`)
			else componentSlugs.add(c.slug)
			if (!c?.entry) errors.push(`components[${i}] ('${c?.slug ?? '?'}') has no entry`)
			if (!c?.surface)
				errors.push(`components[${i}] ('${c?.slug ?? '?'}') names no surface point`)
		}

		// Deliberate holes: todo() sentinels, listed with their paths (24 §7).
		for (const c of this._configs)
			for (const [nodeKey, slots] of Object.entries(c.values))
				for (const [slot, value] of Object.entries(slots))
					if (isTodo(value))
						coverage.todos.push({
							path: `${c.spec}#${c.slug} → ${nodeKey}.${slot}`,
							note: value['todo@1'].note,
						})

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
				requires: [...requires].sort(),
			},
			coverage,
		}
	}
}

/** Build refusal that still carries the coverage — the report is the error's context. */
export class AnnouncementError extends Error {
	constructor(
		readonly errors: string[],
		readonly coverage: CoverageReport,
	) {
		super(`announcement refused:\n  - ${errors.join('\n  - ')}`)
		this.name = 'AnnouncementError'
	}
}

export function announce(identity: PackageIdentity): AnnouncementBuilder {
	return new AnnouncementBuilder(identity)
}
