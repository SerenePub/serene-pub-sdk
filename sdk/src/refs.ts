/**
 * References — edges as data (04 §4), and config references (F35).
 *
 * $ref creates a *data* edge and compiles 1:1 to a pipeline_edges row.
 * slot.* creates a *config* reference, which is resolved before execution and is
 * therefore not an edge and creates no dependency in the graph.
 * @experimental
 */

export interface DataRef {
	readonly __ref: 'data'
	node: string
	port: string
}

/** @public */
export interface SlotRef {
	readonly __ref: 'slot'
	slot: 'connection' | 'sampling' | 'prompts' | 'template' | 'params' | 'variables'
	/** Whose config. Undefined = this node's own. */
	ofNode?: string
	/**
	 * An **envoy's** config (plans/29 R-18 (2); built 2026-09-16 as U5g):
	 * the genre-declared defaults for `envoy:<key>`, resolved through the
	 * config chain at the address `envoy:<key>` exactly as a node's are —
	 * the host projects the declaration at `author` and an admin's tuning
	 * sits above it. Compiles to `resolvedRefs[slot] = 'envoy:<key>'`
	 * after the genre the spec serves is checked for the key.
	 */
	ofEnvoy?: string
	/** Unresolved marker: resolve to the first oracle reachable forward (16 §5b-i). */
	resolveDownstreamOracle?: boolean
}

/** @experimental */
export function $ref(node: string, port = 'main'): DataRef {
	return { __ref: 'data', node, port }
}

/**
 * Config references accept a node accessor as well as a key, so a spec never has to
 * name a node twice in two different ways: `slot.connectionOf($.generate)` reads the
 * same as `$.generate.text` two lines below it.
 * @public
 */
export type NodeAddress = string | { node: string }
/** An envoy's config, by the genre-local key: `slot.prompts({ envoy: 'mascot' })`. @experimental */
export type EnvoyAddress = { envoy: string }
const addr = (n?: NodeAddress) => (typeof n === 'object' ? n.node : n)
const isEnvoyAddress = (n: unknown): n is EnvoyAddress =>
	typeof n === 'object' && n !== null && typeof (n as EnvoyAddress).envoy === 'string'

/**
 * The address an envoy's config lives at in the resolved config — the
 * synthetic node key `envoy:<key>`. One spelling, shared by the compiler
 * (`resolvedRefs`), the executor (`resolveConfig`'s key list) and the host's
 * projection, so the three cannot disagree about where a mascot's prompt is.
 * @internal
 */
export const ENVOY_CONFIG_PREFIX = 'envoy:'
/** @experimental */
export const envoyConfigKey = (key: string): string => `${ENVOY_CONFIG_PREFIX}${key}`
/** @internal */
export const isEnvoyConfigKey = (key: string): boolean => key.startsWith(ENVOY_CONFIG_PREFIX)

/** @public */
export const slot = {
	connection: (ofNode?: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'connection',
		ofNode: addr(ofNode),
	}),
	sampling: (ofNode?: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'sampling',
		ofNode: addr(ofNode),
	}),
	/**
	 * With a target, the slot is *shared*: the node reads the target's authored
	 * prompts and declares none of its own to configure. One authored text, one
	 * place to edit it — three nodes that each demanded the same system prompt
	 * is the defect this exists to close (13 §12 finding i).
	 */
	prompts: (of?: NodeAddress | EnvoyAddress): SlotRef =>
		isEnvoyAddress(of)
			? { __ref: 'slot', slot: 'prompts', ofEnvoy: of.envoy }
			: {
					__ref: 'slot',
					slot: 'prompts',
					ofNode: addr(of),
				},
	template: (): SlotRef => ({ __ref: 'slot', slot: 'template' }),
	/**
	 * With a target, the slot's **shared** fields resolve at the target — and
	 * only those (R-7 P2, refined 2026-09-16; `FieldDecl.shared`).
	 *
	 * A definition marks the `params` fields several nodes of one spec hold in
	 * common — the lore lanes' seven scan knobs, the embed pair's switch —
	 * `shared: true`; a spec then names ONE owner and the other nodes reference
	 * it here. A referencing node's *unmarked* fields stay its own and resolve
	 * at its own address through the same reference: each lore lane's share
	 * of the window is that lane's, while the scan depth they run on is one
	 * number. One reference, both halves, and the panel draws the same line.
	 *
	 * ⚠ It used to read the whole slot at the target, and its docblock argued
	 * for the ranker as the owner of "every query's minimums and weights". That
	 * is the per-source map on the ranker 16 §5a rejected; per-source intent
	 * lives on the source now (R-7 P5) and travels as candidate metadata, so
	 * nothing needs to read the ranker's params from a query any more.
	 */
	params: (ofNode?: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'params',
		ofNode: addr(ofNode),
	}),
	/**
	 * With a target, the slot is *shared* — the same reading as `prompts`. A node
	 * that consumes another's rendered variables reads that node's selections
	 * rather than declaring a parallel set nobody would think to keep in step.
	 */
	variables: (ofNode?: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'variables',
		ofNode: addr(ofNode),
	}),

	/** Explicit oracle reference — always unambiguous. */
	oracleRef: (node: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'connection',
		ofNode: addr(node),
	}),
	connectionOf: (node: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'connection',
		ofNode: addr(node),
	}),
	samplingOf: (node: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'sampling',
		ofNode: addr(node),
	}),

	/**
	 * Resolves at publish to the first oracle reachable forward. Compiles to the
	 * explicit form, so nothing implicit survives into rows (16 §5b-i).
	 */
	downstreamOracle: (): SlotRef => ({
		__ref: 'slot',
		slot: 'connection',
		resolveDownstreamOracle: true,
	}),
}

/** @experimental */
export const isDataRef = (v: unknown): v is DataRef =>
	typeof v === 'object' && v !== null && (v as DataRef).__ref === 'data'

/** @internal */
export const isSlotRef = (v: unknown): v is SlotRef =>
	typeof v === 'object' && v !== null && (v as SlotRef).__ref === 'slot'

/** Walk a config object and collect every data ref, with the key path it sat at. @experimental */
export function collectDataRefs(
	config: unknown,
	path: string[] = [],
): Array<{ path: string[]; ref: DataRef }> {
	if (isDataRef(config)) return [{ path, ref: config }]
	if (Array.isArray(config))
		return config.flatMap((v, i) => collectDataRefs(v, [...path, String(i)]))
	if (config && typeof config === 'object' && !isSlotRef(config)) {
		return Object.entries(config).flatMap(([k, v]) => collectDataRefs(v, [...path, k]))
	}
	return []
}

/** @experimental */
export function collectSlotRefs(config: unknown): SlotRef[] {
	if (isSlotRef(config)) return [config]
	if (Array.isArray(config)) return config.flatMap(collectSlotRefs)
	if (config && typeof config === 'object') return Object.values(config).flatMap(collectSlotRefs)
	return []
}
