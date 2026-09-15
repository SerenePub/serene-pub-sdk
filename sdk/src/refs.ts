/**
 * References — edges as data (04 §4), and config references (F35).
 *
 * $ref creates a *data* edge and compiles 1:1 to a pipeline_edges row.
 * slot.* creates a *config* reference, which is resolved before execution and is
 * therefore not an edge and creates no dependency in the graph.
 */

export interface DataRef {
	readonly __ref: 'data'
	node: string
	port: string
}

export interface SlotRef {
	readonly __ref: 'slot'
	slot: 'connection' | 'sampling' | 'prompts' | 'template' | 'params' | 'variables'
	/** Whose config. Undefined = this node's own. */
	ofNode?: string
	/** Unresolved marker: resolve to the first Provider reachable forward (16 §5b-i). */
	resolveDownstreamProvider?: boolean
}

export function $ref(node: string, port = 'main'): DataRef {
	return { __ref: 'data', node, port }
}

/**
 * Config references accept a node accessor as well as a key, so a spec never has to
 * name a node twice in two different ways: `slot.connectionOf($.generate)` reads the
 * same as `$.generate.text` two lines below it.
 */
export type NodeAddress = string | { node: string }
const addr = (n?: NodeAddress) => (typeof n === 'object' ? n.node : n)

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
	prompts: (ofNode?: NodeAddress): SlotRef => ({
		__ref: 'slot',
		slot: 'prompts',
		ofNode: addr(ofNode),
	}),
	template: (): SlotRef => ({ __ref: 'slot', slot: 'template' }),
	/**
	 * With a target, the slot is *shared* — the same reading as `prompts`.
	 *
	 * This took no target until now, which was an oversight rather than a
	 * decision: cross-source policy has to live on one node and be read by the
	 * several that answer to it. Retrieval is the case — every query wants the
	 * ranker's floors and weights, and a copy per query is a set of numbers
	 * that agree until somebody edits one.
	 *
	 * The alternative was reordering the graph to put the policy node first,
	 * which puts a node named for ranking in front of everything it ranks.
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

	/** Explicit provider reference — always unambiguous. */
	providerRef: (node: NodeAddress): SlotRef => ({
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
	 * Resolves at publish to the first Provider reachable forward. Compiles to the
	 * explicit form, so nothing implicit survives into rows (16 §5b-i).
	 */
	downstreamProvider: (): SlotRef => ({
		__ref: 'slot',
		slot: 'connection',
		resolveDownstreamProvider: true,
	}),
}

export const isDataRef = (v: unknown): v is DataRef =>
	typeof v === 'object' && v !== null && (v as DataRef).__ref === 'data'

export const isSlotRef = (v: unknown): v is SlotRef =>
	typeof v === 'object' && v !== null && (v as SlotRef).__ref === 'slot'

/** Walk a config object and collect every data ref, with the key path it sat at. */
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

export function collectSlotRefs(config: unknown): SlotRef[] {
	if (isSlotRef(config)) return [config]
	if (Array.isArray(config)) return config.flatMap(collectSlotRefs)
	if (config && typeof config === 'object') return Object.values(config).flatMap(collectSlotRefs)
	return []
}
