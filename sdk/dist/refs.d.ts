/**
 * References — edges as data (04 §4), and config references (F35).
 *
 * $ref creates a *data* edge and compiles 1:1 to a pipeline_edges row.
 * slot.* creates a *config* reference, which is resolved before execution and is
 * therefore not an edge and creates no dependency in the graph.
 * @experimental
 */
export interface DataRef {
    readonly __ref: 'data';
    node: string;
    port: string;
}
/** @public */
export interface SlotRef {
    readonly __ref: 'slot';
    slot: 'connection' | 'sampling' | 'prompts' | 'template' | 'params' | 'variables';
    /** Whose config. Undefined = this node's own. */
    ofNode?: string;
    /**
     * An **envoy's** config (plans/29 R-18 (2); built 2026-09-16 as U5g):
     * the genre-declared defaults for `envoy:<key>`, resolved through the
     * config chain at the address `envoy:<key>` exactly as a node's are —
     * the host projects the declaration at `author` and an admin's tuning
     * sits above it. Compiles to `resolvedRefs[slot] = 'envoy:<key>'`
     * after the genre the spec serves is checked for the key.
     */
    ofEnvoy?: string;
    /** Unresolved marker: resolve to the first oracle reachable forward (16 §5b-i). */
    resolveDownstreamOracle?: boolean;
}
/** @experimental */
export declare function $ref(node: string, port?: string): DataRef;
/**
 * Config references accept a node accessor as well as a key, so a spec never has to
 * name a node twice in two different ways: `slot.connectionOf($.generate)` reads the
 * same as `$.generate.text` two lines below it.
 * @public
 */
export type NodeAddress = string | {
    node: string;
};
/** An envoy's config, by the genre-local key: `slot.prompts({ envoy: 'mascot' })`. @experimental */
export type EnvoyAddress = {
    envoy: string;
};
/**
 * The address an envoy's config lives at in the resolved config — the
 * synthetic node key `envoy:<key>`. One spelling, shared by the compiler
 * (`resolvedRefs`), the executor (`resolveConfig`'s key list) and the host's
 * projection, so the three cannot disagree about where a mascot's prompt is.
 * @internal
 */
export declare const ENVOY_CONFIG_PREFIX = "envoy:";
/** @experimental */
export declare const envoyConfigKey: (key: string) => string;
/** @internal */
export declare const isEnvoyConfigKey: (key: string) => boolean;
/** @public */
export declare const slot: {
    connection: (ofNode?: NodeAddress) => SlotRef;
    sampling: (ofNode?: NodeAddress) => SlotRef;
    /**
     * With a target, the slot is *shared*: the node reads the target's authored
     * prompts and declares none of its own to configure. One authored text, one
     * place to edit it — three nodes that each demanded the same system prompt
     * is the defect this exists to close (13 §12 finding i).
     */
    prompts: (of?: NodeAddress | EnvoyAddress) => SlotRef;
    template: () => SlotRef;
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
    params: (ofNode?: NodeAddress) => SlotRef;
    /**
     * With a target, the slot is *shared* — the same reading as `prompts`. A node
     * that consumes another's rendered variables reads that node's selections
     * rather than declaring a parallel set nobody would think to keep in step.
     */
    variables: (ofNode?: NodeAddress) => SlotRef;
    /** Explicit oracle reference — always unambiguous. */
    oracleRef: (node: NodeAddress) => SlotRef;
    connectionOf: (node: NodeAddress) => SlotRef;
    samplingOf: (node: NodeAddress) => SlotRef;
    /**
     * Resolves at publish to the first oracle reachable forward. Compiles to the
     * explicit form, so nothing implicit survives into rows (16 §5b-i).
     */
    downstreamOracle: () => SlotRef;
};
/** @experimental */
export declare const isDataRef: (v: unknown) => v is DataRef;
/** @internal */
export declare const isSlotRef: (v: unknown) => v is SlotRef;
/** Walk a config object and collect every data ref, with the key path it sat at. @experimental */
export declare function collectDataRefs(config: unknown, path?: string[]): Array<{
    path: string[];
    ref: DataRef;
}>;
/** @experimental */
export declare function collectSlotRefs(config: unknown): SlotRef[];
//# sourceMappingURL=refs.d.ts.map