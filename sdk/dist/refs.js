/**
 * References — edges as data (04 §4), and config references (F35).
 *
 * $ref creates a *data* edge and compiles 1:1 to a pipeline_edges row.
 * slot.* creates a *config* reference, which is resolved before execution and is
 * therefore not an edge and creates no dependency in the graph.
 */
export function $ref(node, port = 'main') {
    return { __ref: 'data', node, port };
}
const addr = (n) => (typeof n === 'object' ? n.node : n);
export const slot = {
    connection: (ofNode) => ({
        __ref: 'slot',
        slot: 'connection',
        ofNode: addr(ofNode),
    }),
    sampling: (ofNode) => ({
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
    prompts: (ofNode) => ({
        __ref: 'slot',
        slot: 'prompts',
        ofNode: addr(ofNode),
    }),
    template: () => ({ __ref: 'slot', slot: 'template' }),
    params: () => ({ __ref: 'slot', slot: 'params' }),
    /**
     * With a target, the slot is *shared* — the same reading as `prompts`. A node
     * that consumes another's rendered variables reads that node's selections
     * rather than declaring a parallel set nobody would think to keep in step.
     */
    variables: (ofNode) => ({
        __ref: 'slot',
        slot: 'variables',
        ofNode: addr(ofNode),
    }),
    /** Explicit provider reference — always unambiguous. */
    providerRef: (node) => ({
        __ref: 'slot',
        slot: 'connection',
        ofNode: addr(node),
    }),
    connectionOf: (node) => ({
        __ref: 'slot',
        slot: 'connection',
        ofNode: addr(node),
    }),
    samplingOf: (node) => ({
        __ref: 'slot',
        slot: 'sampling',
        ofNode: addr(node),
    }),
    /**
     * Resolves at publish to the first Provider reachable forward. Compiles to the
     * explicit form, so nothing implicit survives into rows (16 §5b-i).
     */
    downstreamProvider: () => ({
        __ref: 'slot',
        slot: 'connection',
        resolveDownstreamProvider: true,
    }),
};
export const isDataRef = (v) => typeof v === 'object' && v !== null && v.__ref === 'data';
export const isSlotRef = (v) => typeof v === 'object' && v !== null && v.__ref === 'slot';
/** Walk a config object and collect every data ref, with the key path it sat at. */
export function collectDataRefs(config, path = []) {
    if (isDataRef(config))
        return [{ path, ref: config }];
    if (Array.isArray(config))
        return config.flatMap((v, i) => collectDataRefs(v, [...path, String(i)]));
    if (config && typeof config === 'object' && !isSlotRef(config)) {
        return Object.entries(config).flatMap(([k, v]) => collectDataRefs(v, [...path, k]));
    }
    return [];
}
export function collectSlotRefs(config) {
    if (isSlotRef(config))
        return [config];
    if (Array.isArray(config))
        return config.flatMap(collectSlotRefs);
    if (config && typeof config === 'object')
        return Object.values(config).flatMap(collectSlotRefs);
    return [];
}
//# sourceMappingURL=refs.js.map