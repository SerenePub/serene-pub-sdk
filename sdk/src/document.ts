/**
 * Document compilation.
 *
 * The builder chain is an *authoring format only*. SP imports the document and
 * never the JS — there is no importer path that evaluates a builder chain.
 *
 * Edges are derived here, 1:1 with pipeline_edges rows: the linear chain carries a
 * default edge, and every $ref becomes an explicit one.
 * @ruling 04 §5a, F3, F6
 */

import type { BuiltSpec, BuiltNode, BuiltSpecWithActions } from './builder.js'
import { collectDataRefs, envoyConfigKey, isEnvoyConfigKey, isSlotRef, type SlotRef } from './refs.js'
import { getDefinition } from './descriptors.js'
import { getGenre } from './genres.js'
import { envoySlugOf, envoySlugOfRef } from './participants.js'

/** The message write whose `speaker` a document may name literally. */
const CREATE_MESSAGE_ID = 'core:outlet/create-message'
import { requiredConnections, type ConnectionRequirement } from './connections.js'
import { assignable, isStreaming } from './shapes.js'
import { canonicalize, contentHash } from './hash.js'
import { actionHandlesOf, type ActionHandle } from './registrations.js'
import type { I18n } from './i18n.js'

/** @experimental */
export interface DocEdge {
	from: string
	fromPort: string
	to: string
	toPort: string
	shape?: string
	streaming?: boolean
	/** true when derived from chain order rather than an explicit $ref */
	implicit?: boolean
}

/** @experimental */
export interface DocNode {
	key: string
	kind: string
	definitionId: string
	definitionVersion: number
	config: Record<string, unknown>
	clauseId?: string
	clauseKind?: string
	clauseChain?: string
	position: number
	/**
	 * Config references resolved at publish and stored explicitly.
	 * @ruling 16 §5b-i
	 */
	resolvedRefs?: Record<string, string>
	/**
	 * What the node shows beyond the admin panel — the session-settings mark,
	 * the streaming step and the step status, and the step label and step
	 * purpose the settings name it by — see `BuiltNode.expose`. Present
	 * only when stated.
	 * @ruling PLAN-turn-order §4.11, R28, lair pass B3/B18 (2026-09-27), 2026-09-30
	 */
	expose?: {
		session?: boolean
		swaps?: string[]
		stream?: true
		status?: I18n
		label?: I18n
		purpose?: I18n
		/** 🚧 R54: the session's owner chooses this step's prompt, among those not hidden. */
		promptReach?: 'owner'
	}
	/**
	 * What this placement's rendered keys **mean** (owner ruling 2026-10-13):
	 * a key its definition's `variables` slot renders, re-pointed at another
	 * registered variable — `{ characterLore: 'acme:var/ranked-lore@1' }`.
	 * The key stays the template's word; the variable decides which layouts
	 * the picker offers, the default row, the floor and the absence rule.
	 * Stated by the spec's author, hashed with the document, never by a
	 * config or a session. Present only when stated.
	 * @ruling PROPOSAL-variable-layout-accounting ★2, ★5
	 */
	renders?: Record<string, string>
}

/** @experimental */
export interface SpecDocument {
	schemaVersion: 1
	id: string
	version: string
	/**
	 * The genre declaration a create pipeline carries.
	 * @ruling 24 §3
	 */
	genre?: unknown
	/**
	 * Contributed surfaces — content like `genre`, hashed with the document.
	 * @ruling 19 §3–§4
	 */
	contributes?: unknown
	/**
	 * Catalogue claims — content like the two above, hashed with the document.
	 * @ruling ruled 2026-08-27
	 */
	taxonomy?: unknown
	/**
	 * The usage lock: the genre the inlet declared, and **either** one
	 * `event` **or** several `events` — never assume `event`: a
	 * `turnOrderSpec()` document is locked on `events` (every event it
	 * recomputes on). Read the first with `input.event ?? input.events?.[0]`.
	 * Hashed with the document. **The only subscription** — `subscribes` was
	 * deleted 2026-09-16 with `.on()`.
	 * @ruling 24 §4, R-4
	 */
	input?: { genre?: string; event?: string; events?: string[] }
	/**
	 * 🚧 The events the pipeline suits — hints for pickers only (PLAN-layering
	 * D3). Present only on a pipeline declared with `{ suits }` (no lock);
	 * a locked one's are its `input`'s (`suitsOf`). Hashed with the document.
	 */
	suits?: string[]
	/** 🚧 The events the pipeline emits (R6). Present only when stated. Hashed with the document. */
	emits?: string[]
	/**
	 * 🚧 D3 (2026-10-23): `false` — the events a ruleset's functions raise in
	 * this pipeline's resolve steps are reported on their facts and never
	 * emitted, whatever each step's own `emits` says. Absent: on. ⚠ Not
	 * `emits` (R6), the events the pipeline itself declares. Present only
	 * when stated, so a spec that says nothing hashes as it did.
	 */
	functionEvents?: false
	includes: Array<{ key: string; fragmentId: string }>
	/**
	 * Author-shipped presets. Execution-affecting, so they round-trip.
	 * @ruling F4
	 */
	presets: BuiltSpec['presets']
	nodes: DocNode[]
	edges: DocEdge[]
	clauses: BuiltSpec['clauses']
}

/**
 * A clause's own ports; a junction's fired-branch ports never shadow them.
 * @experimental
 * @ruling M4
 */
export const JUNCTION_CLAUSE_PORTS: ReadonlySet<string> = new Set(['main', 'values', 'branches', 'ok'])

/**
 * A junction's branch-end nodes: the last node of each chain, by
 * position. What a junction publishes beyond its clause ports is read off
 * these.
 * @experimental
 * @ruling M4
 */
export function junctionBranchEnds(
	nodes: ReadonlyArray<{ key: string; clauseId?: string; clauseChain?: string; position: number; definitionId: string; definitionVersion: number }>,
	clause: { id: string; chains: string[] },
	clauses: ReadonlyArray<{ id: string; clauseId?: string; clauseChain?: string; position: number }> = [],
): Array<{ chain: string; node?: { key: string; definitionId: string; definitionVersion: number } }> {
	return clause.chains.map((chain) => {
		const inChain = nodes.filter((n) => n.clauseId === clause.id && n.clauseChain === chain)
		const last = inChain.reduce<(typeof inChain)[number] | undefined>(
			(a, n) => (!a || n.position > a.position ? n : a),
			undefined,
		)
		// A branch that ends in a nested clause has no node end: what it
		// publishes is the clause's union, not a node's ports (M4 review).
		const nested = clauses.filter((c) => c.clauseId === clause.id && c.clauseChain === chain)
		const endsInClause = nested.some((c) => !last || c.position > last.position)
		return { chain, node: endsInClause ? undefined : last }
	})
}

/**
 * 🚧 The shape a junction's branches **agree** a result port has (M4; RF fix
 * 3, 2026-10-23): the one among theirs that every branch's shape is
 * assignable to — the same rule an edge is checked by. Alike shapes agree as
 * they always did; a model call's `text-stream` and a task's `text` agree on
 * `text` (Story's reply: the prose call's words, or the JSON answer's
 * `message`), so the step after the junction reads ONE port whichever branch
 * fired. Undefined when a branch publishes none, or no shape takes them all.
 * @internal
 */
export function agreedShape(shapes: ReadonlyArray<string | undefined>): string | undefined {
	if (!shapes.length || shapes.some((s) => !s)) return undefined
	const all = shapes as readonly string[]
	return all.find((to) => all.every((from) => assignable(from, to)))
}

/**
 * The shape every branch of junction `id` agrees `port` has (`agreedShape`), else undefined.
 * @ruling M4
 */
function junctionPortShape(built: BuiltSpec, id: string, port: string): string | undefined {
	const clause = built.clauses.find((c) => c.id === id)
	if (!clause || clause.kind !== 'junction' || JUNCTION_CLAUSE_PORTS.has(port))
		return undefined
	return agreedShape(
		junctionBranchEnds(built.nodes, clause, built.clauses).map(({ node }) =>
			node ? getDefinition(`${node.definitionId}@${node.definitionVersion}`)?.ports.out?.[port] : undefined,
		),
	)
}

/** Nodes that participate in the top-level sequential spine (not inside a clause). */
const spineOf = (nodes: BuiltNode[]) => nodes.filter((n) => !n.clauseId)

/**
 * Compile a built spec to the document a host stores. A document that is
 * already compiled (a helper such as `turnOrderSpec()` returns one) comes back
 * as a copy, so a list of pipelines can hold either; one written for another
 * document schema is refused. Its graph checks are the host's publish
 * `validate()`, which every stored document meets.
 * @experimental
 */
export function compile<A extends string>(built: BuiltSpecWithActions<A>): CompiledSpec<A>
export function compile(built: BuiltSpec | SpecDocument): CompiledSpec
export function compile(built: BuiltSpec | SpecDocument): CompiledSpec {
	if ('schemaVersion' in built) {
		if (built.schemaVersion !== 1)
			throw new Error(
				`spec '${built.id}' is a document for schema ${String(built.schemaVersion)} — this SDK compiles schema 1`,
			)
		return withActionHandles(importDocument(built))
	}
	return withActionHandles(compileBuilt(built))
}

/**
 * 🚧 A compiled document with its **action handles** — `doc.actions.<key>`
 * for every action it contributes, typed from the declarations when the
 * built spec carried them (`spec<const A>`): what `register()` takes to make
 * an action pipeline (derive, don't spell; A18). Non-enumerable, so nothing
 * that serializes, hashes or compares a document sees them (lane 3,
 * 2026-10-20: core's specs are compiled documents, and a registration of a
 * core action names it by handle).
 * @experimental
 * @ruling A18, D1
 */
export type CompiledSpec<A extends string = string> = SpecDocument & {
	readonly actions: Readonly<Record<A, ActionHandle>>
}

function withActionHandles(doc: SpecDocument): CompiledSpec {
	Object.defineProperty(doc, 'actions', {
		value: Object.freeze(actionHandlesOf(doc)),
		enumerable: false,
		configurable: true,
		writable: false,
	})
	return doc as CompiledSpec
}

function compileBuilt(built: BuiltSpec): SpecDocument {
	const nodes: DocNode[] = built.nodes.map((n) => ({
		key: n.key,
		kind: n.kind,
		definitionId: n.definitionId,
		definitionVersion: n.definitionVersion,
		config: n.config,
		clauseId: n.clauseId,
		clauseKind: n.clauseKind,
		clauseChain: n.clauseChain,
		position: n.position,
		...(n.expose ? { expose: n.expose } : {}),
		...(n.renders ? { renders: n.renders } : {}),
	}))

	const edges: DocEdge[] = []

	// Explicit $ref edges.
	for (const n of built.nodes) {
		for (const { path, ref } of collectDataRefs(n.config)) {
			const upstream = built.nodes.find((x) => x.key === ref.node)
			const outShape = upstream
				? getDefinition(`${upstream.definitionId}@${upstream.definitionVersion}`)?.ports.out?.[ref.port]
				: junctionPortShape(built, ref.node, ref.port)
			// Whether an edge streams is decided here, at publish — so it is readable
			// off the spec rather than discovered by running it (01 §11).
			edges.push({
				from: ref.node,
				fromPort: ref.port,
				to: n.key,
				toPort: path.join('.'),
				shape: outShape,
				streaming: outShape ? isStreaming(outShape) : undefined,
			})
		}
	}

	// Implicit chain edges along the spine.
	const spine = spineOf(built.nodes)
	for (let i = 1; i < spine.length; i++) {
		const prev = spine[i - 1]!
		const cur = spine[i]!
		const already = edges.some((e) => e.to === cur.key && e.from === prev.key)
		if (!already)
			edges.push({
				from: prev.key,
				fromPort: 'main',
				to: cur.key,
				toPort: 'main',
				implicit: true,
			})
	}

	// Resolve config references that were left to publish (16 §5b-i).
	for (const n of nodes) {
		const resolved: Record<string, string> = {}
		for (const [k, v] of Object.entries(n.config)) {
			if (!isSlotRef(v)) continue
			const ref = v as SlotRef
			if (ref.resolveDownstreamOracle) {
				const target = resolveDownstreamOracle(built, n.key)
				resolved[k] = target
			} else if (ref.ofEnvoy) {
				// An envoy's config (R-18 (2)): the genre the spec serves must
				// declare the key. Checked against the registry when the genre
				// is one this build declares; a genre this build has never
				// seen (a plugin's, declared elsewhere) cannot be checked here.
				// The host checks it where the document lands as rows
				// (`saveDocument`, U5g review W4): the genre's declaration and
				// each action's envoy are re-run through `envoysFindings` /
				// `envoyFindings`, and a reference to a key the genre's
				// published declaration does not carry is refused there.
				// ⏳ Today no plugin document reaches `saveDocument` — the app
				// publishes the core catalog only — so the host's check is
				// the boundary a plugin publish path will meet, not one any
				// plugin has met. The address is the synthetic node key the
				// executor resolves config for.
				const genreId = built.input?.genre
				const known = genreId ? getGenre(genreId) : undefined
				if (known && !known.envoys?.some((e) => e.key === ref.ofEnvoy))
					throw new Error(
						`node '${n.key}' references the prompts of envoy '${ref.ofEnvoy}', which ` +
							`'${genreId}' does not declare` +
							(known.envoys?.length
								? ` — it declares ${known.envoys.map((e) => `'${e.key}'`).join(', ')}`
								: ' — it declares no envoys'),
					)
				// 🚧 A pipeline mounted by registrations (the suits form, D3)
				// names no genre: the envoy is checked against the genre that
				// registers it, at the registration door and the host's
				// publish — not refused here.
				if (!genreId && !(built.suits && !built.input))
					throw new Error(
						`node '${n.key}' references the prompts of envoy '${ref.ofEnvoy}', but the spec ` +
							`serves no genre — an envoy is a genre's (or an action's), and the inlet lock ` +
							`names which (24 §4)`,
					)
				resolved[k] = envoyConfigKey(ref.ofEnvoy)
			} else if (ref.ofNode) {
				if (!built.nodes.some((x) => x.key === ref.ofNode)) {
					throw new Error(
						`node '${n.key}' references config of unknown node '${ref.ofNode}'`,
					)
				}
				resolved[k] = ref.ofNode
			}
		}
		if (Object.keys(resolved).length) n.resolvedRefs = resolved
	}

	// A message written as a named envoy (ruled 2026-09-26: everyone has a
	// name): a literal `speaker: 'envoy:<slug>'` on a message write must name
	// an envoy the served genre or this spec's own actions declare — refused
	// by name here, where the author is, because at the write it would be a
	// line under a name nothing declares. A genre this build has never seen
	// cannot be checked; the host refuses the write there.
	for (const n of built.nodes) {
		if (n.definitionId !== CREATE_MESSAGE_ID) continue
		const slug = envoySlugOfRef(n.config.speaker)
		if (slug === null) continue
		const genreId = built.input?.genre
		const known = genreId ? getGenre(genreId) : undefined
		const own = (built.meta.contributes?.actions ?? []).flatMap((a) =>
			a.envoy?.key ? [envoySlugOf({ action: { specId: built.id } }, a.envoy.key)] : [],
		)
		if (own.includes(slug)) continue
		if (genreId && !known) continue
		// 🚧 Unlocked (D3): the registering genre's envoys are checked where it registers.
		if (!genreId && built.suits && !built.input) continue
		if (known?.envoys?.some((e) => e.key === slug)) continue
		const declared = [...(known?.envoys ?? []).map((e) => e.key), ...own]
		throw new Error(
			`node '${n.key}' speaks as envoy '${slug}', which ` +
				(genreId ? `'${genreId}' and this spec's actions do not declare` : `nothing declares — the spec serves no genre`) +
				(declared.length ? ` — declared: ${declared.map((k) => `'${k}'`).join(', ')}` : ' — none are declared'),
		)
	}

	return {
		schemaVersion: 1,
		id: built.id,
		version: built.meta.version,
		genre: built.meta.genre,
		input: built.input,
		// 🚧 D3/R6: present only when stated in the new form, so a locked
		// spec — and every spec that states neither — hashes as it did.
		...(built.suits && !built.input ? { suits: [...built.suits] } : {}),
		...(built.emits?.length ? { emits: [...built.emits] } : {}),
		...(built.functionEvents === false ? { functionEvents: false as const } : {}),
		contributes: built.meta.contributes,
		taxonomy: built.meta.taxonomy,
		includes: built.includes,
		presets: built.presets,
		nodes,
		edges,
		clauses: built.clauses,
	}
}

/**
 * Follow the spine forward from `fromKey` to the first oracle. Linearity is what
 * makes this well-defined. Ambiguity or absence is a publish error that names
 * the candidates — the teaching-error pattern.
 * @experimental
 * @ruling F25, 15 §1.3
 */
export function resolveDownstreamOracle(built: BuiltSpec, fromKey: string): string {
	const ordered = built.nodes.slice().sort((a, b) => a.position - b.position)
	const start = ordered.findIndex((n) => n.key === fromKey)
	const after = ordered.slice(start + 1).filter((n) => n.kind === 'oracle')
	// Oracles inside a clause are per-chain; only spine oracles are unambiguous targets.
	const spineOracles = after.filter((n) => !n.clauseId)
	if (spineOracles.length === 0) {
		const candidates = after.map((n) => n.key)
		throw new Error(
			`slot.downstreamOracle() on '${fromKey}' found no oracle downstream on the spine. ` +
				(candidates.length
					? `Oracles exist inside clauses (${candidates.join(', ')}) — name one explicitly with slot.oracleRef('…').`
					: `Add an oracle, or use slot.oracleRef('…').`),
		)
	}
	return spineOracles[0]!.key
}

/**
 * Canonical form — stable key order, for hashing and round-trip identity.
 *
 * The sort and the digest below moved to `hash.ts` unchanged, because the type
 * registries now need the same two and a document and a declaration must not
 * disagree about what identical content is. Same bytes in, same string out.
 * @experimental
 * @ruling F3
 */
export function canonical(doc: SpecDocument): string {
	return canonicalize(doc)
}

/**
 * Cheap deterministic content hash — stands in for the real canonical_hash.
 * @experimental
 * @ruling 02 §3
 */
export function canonicalHash(doc: SpecDocument): string {
	return contentHash(doc)
}

/**
 * Import: document → the same in-memory form. `import(export(x))` is identity.
 * @experimental
 * @ruling F3
 */
export function importDocument(doc: SpecDocument): SpecDocument {
	return JSON.parse(JSON.stringify(doc)) as SpecDocument
}

/** @experimental */
export interface ExportOptions {
	/**
	 * Which presets travel. The app lets a user choose; SDK compile has no instance to
	 * choose from, so it ships everything the author wrote.
	 */
	presets?: 'all' | 'none' | string[]
	/**
	 * How preset bindings travel — the same explicit fork pipeline export already offers,
	 * never decided silently.
	 *
	 * - `base` keeps `$ref` references by slug. Portable only where the target is itself a
	 *   seeded, slugged row; a reference to something a user made locally resolves to
	 *   nothing on the far side.
	 * - `flattened` inlines the values. Always portable, and it forks the config — the
	 *   importing instance can no longer swap the named thing in one place.
	 * @ruling 02 §6
	 */
	bindings?: 'base' | 'flattened'
	/** Resolve a `$ref` when flattening. Absent values are dropped and reported. */
	resolve?: (slot: string, ref: string) => unknown
}

/** @experimental */
export interface ExportResult {
	doc: SpecDocument
	/** What did not travel, and why — so an export is never quietly lossy. */
	omitted: Array<{ what: string; reason: string }>
	/**
	 * Every connection the importing instance must wire, derived from the types rather
	 * than from what this instance happened to have configured. Complete even
	 * when the exporter never set one up.
	 * @ruling 13 §10a
	 */
	requires: ConnectionRequirement[]
}

/**
 * Export a document, with the presets a user selected.
 *
 * **A filtered export is a different document, not a lossy copy of the same one**, so its
 * canonical hash legitimately differs from the source's. The identity law is about a
 * given export round-tripping — `import(export(x)) === export(x)` — and that still holds
 * exactly.
 * @experimental
 * @ruling 12 §7, F3
 */
export function exportDocument(doc: SpecDocument, opts: ExportOptions = {}): ExportResult {
	const omitted: ExportResult['omitted'] = []
	const want = opts.presets ?? 'all'
	const keep = (p: SpecDocument['presets'][number]) =>
		want === 'all' ? true : want === 'none' ? false : want.includes(p.slug)

	const presets: SpecDocument['presets'] = []
	for (const p of doc.presets ?? []) {
		if (!keep(p)) {
			omitted.push({ what: `preset '${p.slug}'`, reason: 'not selected for export' })
			continue
		}
		const values: typeof p.values = []
		for (const v of p.values) {
			// Connection details never leave, whatever else was chosen (12 §7).
			if (v.slot === 'connection') {
				omitted.push({
					what: `${p.slug} → ${v.nodeKey}.connection`,
					reason: 'connection details never leave a pub',
				})
				continue
			}
			if (opts.bindings === 'flattened' && isRef(v.value)) {
				const resolved = opts.resolve?.(v.slot, (v.value as any).$ref)
				if (resolved === undefined) {
					omitted.push({
						what: `${p.slug} → ${v.nodeKey}.${v.slot}`,
						reason: `could not resolve '${(v.value as any).$ref}' to flatten`,
					})
					continue
				}
				values.push({ ...v, value: resolved })
				continue
			}
			values.push(v)
		}
		presets.push({ ...p, values })
	}

	// A preset with a default that did not travel would import as a spec with no default.
	if (presets.length && !presets.some((p) => p.default)) {
		const lost = (doc.presets ?? []).find((p) => p.default)
		if (lost)
			omitted.push({
				what: `default preset '${lost.slug}'`,
				reason: 'not selected; the import has no shipped default',
			})
	}

	return { doc: { ...doc, presets }, omitted, requires: requiredConnections(doc) }
}

const isRef = (v: unknown): v is { $ref: string } =>
	!!v && typeof v === 'object' && typeof (v as any).$ref === 'string'

/**
 * The envoy config addresses a document references — every `resolvedRefs`
 * target spelled `envoy:<key>`, once each. The executor resolves config for
 * these beside the nodes and clauses; the host projects the genre's
 * declaration at exactly these keys.
 * @internal
 */
export function envoyConfigKeysOf(doc: {
	nodes: ReadonlyArray<{ resolvedRefs?: Record<string, string> }>
}): string[] {
	const out = new Set<string>()
	for (const n of doc.nodes)
		for (const target of Object.values(n.resolvedRefs ?? {}))
			if (isEnvoyConfigKey(target)) out.add(target)
	return [...out]
}
