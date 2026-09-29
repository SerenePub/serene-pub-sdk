/**
 * Configuration resolution (12 §2). Four layers, first hit wins, evaluated
 * independently per path — which is what makes an admin's connection change reach a
 * user who has customized their prompts (F20).
 *
 * ## The chain (R-10, ruled 2026-09-15; 09-B B8)
 *
 * **`session · config · defaults · author`.**
 *
 *  - `session` — a session's own override of a value (the *chat override* of
 *    12 §2's "pipeline → config → chat override").
 *  - `config` — the rows of the **selected config**: the config IS the
 *    instance's tuning. An administrator's edit lands in the config (ruled
 *    2026-08-24), so there is no separate `instance` layer for it to be shadowed
 *    by, and no `user` layer — a preference that differs per user is a session's
 *    to hold.
 *  - `defaults` — values a host *projects* rather than values anyone decided:
 *    system settings, connection defaults, a legacy layer. Nothing interactive
 *    writes here (it appears in no write matrix row).
 *  - `author` — the definition's declared parameter defaults; the floor.
 *
 * `user` and `instance` stood in this list until 2026-09-16 and were pushed by
 * nothing: `world.ts` never projected a row at either (plans/29a §3). Their
 * semantics fold into `config` — the config an admin edits is the instance's
 * configuration — which is the 2026-08-24 ruling stated as a constant.
 *
 * Resolved run-wide *before* execution, which is why referencing another node's
 * config is not a data edge (F35).
 *
 * ## `config`, not `preset` (R1)
 *
 * Two other things are called a preset — a **session preset** (the bundle a
 * session is born on) and an author's `.preset(…)` on a spec — and neither is
 * this layer, so the scope takes the canon's word for what it holds: the
 * **config**.
 */

import type { CapabilitySet } from './capabilities.js'

/** @experimental */
export type ScopeKind = 'session' | 'config' | 'defaults' | 'author'

/** @internal */
export const SCOPE_ORDER: ScopeKind[] = ['session', 'config', 'defaults', 'author']

/**
 * A row's scope kind. Anything that is not a `ScopeKind` is `undefined` — a
 * row at a scope nobody resolves at, which resolution skips rather than
 * guesses about.
 * @experimental 🚧
 */
export function scopeKindOf(raw: unknown): ScopeKind | undefined {
	return (SCOPE_ORDER as readonly unknown[]).includes(raw) ? (raw as ScopeKind) : undefined
}

/** @experimental */
export interface OverrideRow {
	nodeKey: string
	slot: string
	path: string
	value: unknown
	scopeKind: ScopeKind
	scopeId?: string | number
}

/**
 * The path a REF slot's single value lives at.
 *
 * A `connection` or `sampling` slot holds exactly one thing — the id of a row in
 * its own table — so it has no sub-paths and its address is the empty one.
 *
 * This constant exists because that fact was written down three different ways
 * and the three never met. The panel wrote `''`, the app's legacy projection
 * wrote `'ref'`, and this file's own executor read `'$ref'`; resolution below is
 * exact-match on `(nodeKey, slot, path)`, so the three were unrelated addresses
 * that could never collide and never warn. A pick made in the config panel was
 * saved, shown back, and read by nobody — for as long as the feature has existed.
 *
 * `''` is the winner because it is what the writer already emits, so it is what
 * is already in every user's `pipeline_config_values`. Any other choice would
 * migrate live data to match a convention only the reader believed in.
 *
 * @internal
 */
export const SLOT_VALUE = '' as const

/** @experimental */
export interface SamplingConfig {
	id: string
	name: string
	/** Which vocabulary `values` speaks — a `SAMPLING_SCHEMAS` key (sampling.ts). */
	shape: string
	values: Record<string, unknown>
	/**
	 * Which of `values` is actually switched on.
	 *
	 * Without this the world could carry a config's values but not its
	 * switchboard, so slot resolution had no choice but to hand every stored
	 * value to the provider — including the ones a person had switched off. A
	 * sampler turned off in the sidebar went on being sent, and the only symptom
	 * was generation that did not match the settings on screen.
	 *
	 * Absent (as opposed to empty) means a world that predates the distinction:
	 * every value is treated as on, which is what resolution did before.
	 */
	enabled?: string[]
}

/** @experimental */
export interface ConnectionRecord {
	id: string
	name: string
	kind: string
	/** Readable — not a credential (01 §10). */
	metadata: {
		contextLength?: number
		tokenizer?: string
		model?: string
		supportedSamplers?: string[]
	}
	/** Never readable by any node. Injected per call by the executor. */
	material: Record<string, string>
	/**
	 * What this connection can actually do (capabilities.ts), resolved.
	 *
	 * Readable, and on the same side of the line as `metadata`: a binding asking
	 * whether it may send an image is asking about the wire protocol, not about a
	 * credential. Absent or empty means **undetermined** — what a connection
	 * nobody has tested yet looks like — and never "this connection can do
	 * nothing"; a caller that reads it as a denial will hide working connections.
	 */
	capabilities?: CapabilitySet
	enabled?: boolean
}

/**
 * What a `connection` slot STORES at {@link SLOT_VALUE} — one endpoint, and
 * optionally one of the models that endpoint reaches.
 *
 * A pick is a **pair**, not an id. The endpoint says where the compute is; the
 * model says which of the several things behind it answers. The two halves
 * travel together or the second is lost, and losing it is silent — the request
 * still goes to the right server and comes back from a different model.
 *
 * The shape lives here, beside the constant that names its address, because the
 * executor and every host that writes a pick have to agree on it and there is
 * nowhere else both can see. It was spelled twice and the two spellings
 * disagreed: this file's executor compared the *whole stored value* with a
 * connection id, so an object pair stringified to `[object Object]`, matched no
 * connection, and fell through to the instance default. No error, no log line,
 * and on most installs the default is the very connection that was picked — so
 * the pick appeared to work right up until it didn't.
 *
 * ⚠ **Backward compatible by construction.** Every value written before the
 * pair existed is one of `12`, `'12'`, `{ref: 12}` or `{id: 12}`, and all four
 * still mean the same thing: this endpoint, no model named. A pair adds one
 * key. So nothing stored needs migrating and no reader needs a version check.
 *
 * ⚠ Naming **no** model is not naming a *default* model. An endpoint has no
 * model it is presumed to mean; what a host does with a half-named pair —
 * resolve a default of its own, or refuse it as unconfigured — is the host's
 * ruling. This type's only job is to say which half is absent.
 * @internal
 */
export type ConnectionSlotValue =
	| string
	| number
	| {
			ref?: string | number
			id?: string | number
			modelId?: string | number | null
	  }

/**
 * The endpoint half of a connection slot's value, or null when it names none.
 *
 * Returns the id **exactly as stored** — a string stays a string, a number
 * stays a number. Row ids belong to the host, and this package has no business
 * ruling that they are one or the other; the string/number divide is reconciled
 * where the comparison happens, not here.
 * @internal
 */
export function slotConnectionId(value: unknown): string | number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value === 'string') return value === '' ? null : value
	if (value && typeof value === 'object') {
		const o = value as { ref?: unknown; id?: unknown }
		const inner = o.ref ?? o.id
		if (typeof inner === 'number') return Number.isFinite(inner) ? inner : null
		if (typeof inner === 'string') return inner === '' ? null : inner
	}
	return null
}

/**
 * The model half of a connection slot's value, or null when it names no model.
 *
 * Null for every value written before the pair existed, which is the whole
 * compatibility story — and null is *absence*, never a model the endpoint is
 * taken to mean. Same id-type rule as {@link slotConnectionId}: stored as
 * given, back as stored.
 * @internal
 */
export function slotConnectionModelId(value: unknown): string | number | null {
	if (!value || typeof value !== 'object') return null
	const inner = (value as { modelId?: unknown }).modelId
	if (typeof inner === 'number') return Number.isFinite(inner) ? inner : null
	if (typeof inner === 'string') return inner === '' ? null : inner
	return null
}

/**
 * A resolved `connection` slot, as a binding receives it.
 *
 * `metadata` only — `material` is a credential and is injected by the executor
 * at call time (01 §10), so no node ever sees it.
 *
 * `modelId` is the model half of the pair the slot named, carried through so a
 * host can honour the pick instead of reducing it to an endpoint. Null means
 * the slot named no model, and that **includes** the case where nothing was
 * picked at all and `activeConnection` answered: that map is keyed by shape and
 * holds an endpoint id alone, so there is no model half here to carry. A host
 * whose own defaults are pairs resolves that half for itself, from the store
 * the default came out of.
 * @experimental
 */
export interface ResolvedConnection {
	id: string
	kind: string
	metadata: ConnectionRecord['metadata']
	modelId: string | number | null
	/**
	 * The named model's own context window, when the host records one
	 * (`ConfigWorld.models`); null when the slot named no model or the model
	 * states none, in which case the sampling config's window decides.
	 *
	 * Carried here so the ONE window computation (R-8) can read it off the
	 * same resolved slot the request is sent with — a budget sized to the
	 * sampling config's window while the request went to a model with a
	 * smaller one was wrong in the direction that truncates.
	 */
	contextWindow: number | null
}

/** @experimental */
export interface ConfigWorld {
	overrides: OverrideRow[]
	samplingConfigs: SamplingConfig[]
	connections: ConnectionRecord[]
	/**
	 * The models the host knows per connection, for the facts a resolved pair
	 * carries beyond the endpoint's metadata — today only the context window.
	 * Optional: a host that publishes none resolves every pair with
	 * `contextWindow: null`, exactly as before this existed.
	 */
	models?: Array<{ id: string; connectionId: string; contextWindow?: number | null }>
	/** Singleton kinds, e.g. embeddings (01 §10). */
	activeConnection: Record<string, string | null>
	/**
	 * The instance's default sampling config per kind — the same keys
	 * `activeConnection` uses, and the same job.
	 *
	 * ⚠ Its absence was an asymmetry, not a decision. A `connection` slot with
	 * no pick falls through to `activeConnection[kind]` here *and* falls through
	 * to the instance default at dispatch, so the two agree. A `sampling` slot
	 * with no pick resolved to `{}` here while dispatch still sent the instance
	 * default's window — so a node that READS the resolved values (the batch
	 * cutter, which has to fit a prompt into that window) computed against
	 * nothing while the prompt went out against something. A budget computed
	 * against one window and a prompt sent against another is wrong in the
	 * direction that truncates, silently.
	 *
	 * Optional, so a host that does not publish it behaves exactly as before.
	 */
	activeSampling?: Record<string, string | null>
	authorDefaults?: Record<string, Record<string, Record<string, unknown>>>
}

/** @experimental */
export type ResolvedConfig = Record<string, Record<string, Record<string, unknown>>>

/**
 * A resolved value **and the layer it won at**.
 *
 * The layer is not decoration. *"I changed this and nothing happened"* is the
 * most common support question this system can produce, and it is unanswerable
 * from the value alone — the answer is always "something above you set it too",
 * and only this says which something.
 * @experimental
 */
export interface ResolvedSource {
	value: unknown
	/** Which layer won. `author` means the declared default was never overridden. */
	scopeKind: ScopeKind | 'author'
	/** The user or chat the winning row belonged to, where one applies. */
	scopeId?: string | number
}

/** @experimental */
export type ResolvedConfigSources = Record<string, Record<string, Record<string, ResolvedSource>>>

/**
 * Effective config **with provenance** = base ⊕ overrides, per (nodeKey, slot, path).
 *
 * This is the primitive; `resolveConfig` is derived from it rather than written
 * beside it. Two implementations of a five-layer walk are two implementations
 * that eventually disagree about which layer wins — and the one that disagrees
 * silently is whichever one the UI is not using.
 * @internal
 */
export function resolveConfigSources(
	world: ConfigWorld,
	nodeKeys: string[],
): ResolvedConfigSources {
	const out: ResolvedConfigSources = {}
	for (const nodeKey of nodeKeys) {
		const node: Record<string, Record<string, ResolvedSource>> = {}
		out[nodeKey] = node

		const author = world.authorDefaults?.[nodeKey] ?? {}
		for (const [slot, paths] of Object.entries(author))
			for (const [path, value] of Object.entries(paths)) {
				node[slot] ??= {}
				node[slot]![path] = { value, scopeKind: 'author' }
			}

		const rows = world.overrides.filter((o) => o.nodeKey === nodeKey)

		// Addressed by the pair itself, and keyed on a separator no path can
		// contain. Grouping on `${slot} ${path}` and splitting the pair back out
		// made a declared field named `opening line` resolve against the path
		// `opening`, so it matched nothing — silently, for whoever declared it.
		// No core path has a space in it; nothing stops a plugin's from having one.
		//
		// `\u0000` as an escape, deliberately, rather than the raw NUL byte the
		// first fix used: a literal NUL in a source file makes git classify it as
		// binary, so `git diff` emits "Binary files differ" and a patch generated
		// without `--binary` carries no content at all. That is how the previous
		// version of this fix was lost in transit.
		const SEP = '\u0000'
		const addresses = new Map<string, [string, string]>()
		for (const r of rows) addresses.set(`${r.slot}${SEP}${r.path}`, [r.slot, r.path])

		for (const [slot, path] of addresses.values()) {
			const candidates = rows.filter(
				(r) => r.slot === slot && r.path === path,
			)
			for (const scope of SCOPE_ORDER) {
				const hit = candidates.find((c) => scopeKindOf(c.scopeKind) === scope)
				if (hit) {
					node[slot] ??= {}
					node[slot]![path] = {
						value: hit.value,
						scopeKind: scope,
						...(hit.scopeId !== undefined ? { scopeId: hit.scopeId } : {}),
					}
					break
				}
			}
		}
	}
	return out
}

/** Effective config = base ⊕ overrides, per (nodeKey, slot, path). @internal */
export function resolveConfig(world: ConfigWorld, nodeKeys: string[]): ResolvedConfig {
	const out: ResolvedConfig = {}
	for (const [nodeKey, slots] of Object.entries(resolveConfigSources(world, nodeKeys))) {
		const node: Record<string, Record<string, unknown>> = {}
		out[nodeKey] = node
		for (const [slot, paths] of Object.entries(slots)) {
			node[slot] = {}
			for (const [path, resolved] of Object.entries(paths)) node[slot]![path] = resolved.value
		}
	}
	return out
}

/**
 * Which scopes may write which slot (12 §4). The admin cascade needs no mechanism:
 * connection has no writable scope below the config for a non-admin, so an
 * admin's choice reaches everyone automatically.
 *
 * `config` here is the selected config — the one place an administrator's
 * edit lands (R-10 folded `instance` into it, 2026-09-16). A slot a session may
 * not write is a slot only the config carries.
 * @internal
 */
export const WRITE_MATRIX: Record<string, ScopeKind[]> = {
	// `session` added 2026-08-26 so a session may point at its own connection —
	// the per-session connection 0.5 had. Still admin-only in practice:
	// `visibleTo` shows the slot to admins alone and `resolveWriteScope`
	// refuses a non-admin every non-prompt write, so "credentials and compute
	// stay under admin control" holds by a different gate than the matrix.
	// ⚠ An AUTHOR preset (12 §3a, `PresetBuilder`) still may not carry a
	// connection — it does not export — which is F20's actual concern; that
	// refusal is `PresetBuilder`'s deliberate absence of `.connection()`.
	connection: ['session', 'config'],
	sampling: ['session', 'config'],
	template: ['config'],
	// How a context variable is presented is a property of the instance's
	// configuration, not a personal preference: two users whose characters render
	// differently are two users whose bug reports cannot be compared. Same
	// scopes as `template`, which is the same decision one level up.
	variables: ['config'],
	prompts: ['session', 'config'],
	params: ['session', 'config'],
	settings: ['session', 'config'],
	// A chain changes what every run of the pipeline sends — the `variables`
	// argument one tier up: two users whose chains differ are two users whose
	// reports cannot be compared. Same scopes as `template`; widening to
	// session later is one entry here, additively (18 §4a).
	scripts: ['config'],
}

/** @internal */
export function mayWrite(slot: string, scope: ScopeKind): boolean {
	const kind = scopeKindOf(scope)
	return kind !== undefined && (WRITE_MATRIX[slot] ?? []).includes(kind)
}

/** Reject a write the matrix forbids, with the reason (15 §1.3). @experimental */
export function assertWritable(slot: string, scope: ScopeKind): void {
	if (!mayWrite(slot, scope)) {
		throw new Error(
			`scope '${scope}' may not write slot '${slot}'. ` +
				`Allowed: ${(WRITE_MATRIX[slot] ?? ['(none)']).join(', ')}. ` +
				(slot === 'connection'
					? 'Connections are admin-only so credentials and compute stay under admin control (12 §4).'
					: ''),
		)
	}
}
