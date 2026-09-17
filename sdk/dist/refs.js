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
const isEnvoyAddress = (n) => typeof n === 'object' && n !== null && typeof n.envoy === 'string';
/**
 * The address an envoy's config lives at in the resolved config — the
 * synthetic node key `envoy:<key>`. One spelling, shared by the compiler
 * (`resolvedRefs`), the executor (`resolveConfig`'s key list) and the host's
 * projection, so the three cannot disagree about where a mascot's prompt is.
 */
export const ENVOY_CONFIG_PREFIX = 'envoy:';
export const envoyConfigKey = (key) => `${ENVOY_CONFIG_PREFIX}${key}`;
export const isEnvoyConfigKey = (key) => key.startsWith(ENVOY_CONFIG_PREFIX);
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
    prompts: (of) => isEnvoyAddress(of)
        ? { __ref: 'slot', slot: 'prompts', ofEnvoy: of.envoy }
        : {
            __ref: 'slot',
            slot: 'prompts',
            ofNode: addr(of),
        },
    template: () => ({ __ref: 'slot', slot: 'template' }),
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
    params: (ofNode) => ({
        __ref: 'slot',
        slot: 'params',
        ofNode: addr(ofNode),
    }),
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
    /** Explicit oracle reference — always unambiguous. */
    oracleRef: (node) => ({
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
     * Resolves at publish to the first oracle reachable forward. Compiles to the
     * explicit form, so nothing implicit survives into rows (16 §5b-i).
     */
    downstreamOracle: () => ({
        __ref: 'slot',
        slot: 'connection',
        resolveDownstreamOracle: true,
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