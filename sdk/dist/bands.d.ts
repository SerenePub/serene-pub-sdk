/**
 * Bands as template variables (typed templates P2, 2026-09-27).
 *
 * A **band** is the ranker's word for one source's slice of the context window
 * (`bandIntent`, candidates.ts). A source that puts its own band in the window
 * — Twenty Questions' secret entry — now also **declares** it: the key it
 * publishes and the registered variable that says how the band is laid out.
 *
 * ```ts
 * const varSecretEntry = definePluginVariable('showcase.twenty-questions', {
 *   id: 'showcase.twenty-questions:var/secret-entry@1',
 *   scope: { secretEntry: { type: 'record', of: { type: 'string' } } },
 *   sample: { 'The Brass Clock': 'A clock that rings when nobody winds it.' },
 * })
 * describeTaskDefinition({ …, bands: { secretEntry: varSecretEntry } })
 * // …and a context template places it as {{{secretEntry}}}.
 * ```
 *
 * Declared, a band is a **top-level template name**: Assemble exposes it as
 * `{{{secretEntry}}}`, rendered through the variable's selected layout (the
 * in-code fallback is the band as title-keyed minified JSON). So a band key is
 * an identifier, and it means one thing: two declarers naming the same key
 * with different variables, or a band shadowing a name core already renders,
 * is refused with both declarers named.
 *
 * Which bands a node renders is its own `variables` slot's `renders` plus —
 * when the slot says `rendersBands` — every band declared upstream of the
 * named in-port, followed through any node that takes candidates in
 * (concatenation, fusion, ranking). `rendersAt` is that answer.
 */
import { type Descriptor, type SlotDecl } from './descriptors.js';
import type { DocEdge, DocNode } from './document.js';
import { type VariableDecl, type VariableId } from './variables.js';
/** A band's key — a top-level template name, so an identifier. @experimental */
export type BandKey = string;
/** @experimental */
export declare const isBandKey: (key: string) => boolean;
/** `secret-entry` → `secretEntry`: the identifier a refusal suggests. @internal */
export declare function bandKeySuggestion(key: string): string;
/**
 * Names Assemble puts at the top of a context template that are not bands and
 * not registered variables — what a band key may never be.
 *
 * Assemble's own values. A band called `budget` would shadow the budget a
 * template reads, silently, on every turn.
 * @internal
 */
export declare const ASSEMBLE_OWN_TEMPLATE_NAMES: readonly string[];
/**
 * Refuse a definition's band declarations — at `describe…Definition`, where
 * the author is.
 *
 * - the key is an identifier (a band is a template name);
 * - the variable is registered (`defineVariable` / `definePluginVariable`) and
 *   its scope declares the key, because a layout renders `{ [key]: value }`;
 * - the key does not shadow a name core renders — Assemble's own, or a
 *   core variable's that is not this band's own variable;
 * - no other registered definition declares the key with a different variable.
 *
 * Each refusal names the fix.
 * @internal
 */
export declare function checkBandDeclarations(d: Descriptor, others: Iterable<Descriptor>): void;
/**
 * What `bandsReaching` needs from a node's definition: its in-ports and the
 * bands it declares. A `Descriptor` satisfies it, and so does a registry row
 * (whose policy carries the band ids, `DefinitionPolicy.bands`) — which is how
 * a host reading rows answers without loading a plugin (F6).
 * @experimental
 */
export interface BandSource {
    ports?: {
        in?: Record<string, unknown>;
    };
    bands?: Record<BandKey, VariableDecl | VariableId>;
    /**
     * The out-ports that carry a band (`Descriptor.bandPorts`); a band not
     * named here is carried on every out-port.
     */
    bandPorts?: Record<BandKey, readonly string[]>;
}
/** One declared band as it reaches a node. @experimental */
export interface ReachingBand {
    variable: VariableId;
    /** The node that declares it — `key (definitionId)`, for a refusal to name. */
    declarer: string;
}
/** Two declarers naming one band differently, or a band shadowing a name the node renders. @experimental */
export declare class BandCollisionError extends Error {
}
/**
 * Every band declared upstream of `nodeKey`'s in-port `port`.
 *
 * Walks the edges backwards from the port: each producer's declared `bands`
 * are collected, and the walk continues through every in-port the producer
 * declares as a candidates port — so a band declared at a source reaches a
 * ranker through a concatenation or a fusion, and Assemble through the ranker.
 * A producer declaring no candidates in-port is where the walk stops. A band
 * whose declarer names the out-ports carrying it (`bandPorts`) reaches only
 * through an edge from one of those ports.
 *
 * Throws `BandCollisionError`, naming both declarers, when two of them name
 * one key with different variables.
 * @experimental
 */
export declare function bandsReaching(doc: {
    nodes: readonly DocNode[];
    edges: readonly DocEdge[];
}, nodeKey: string, port: string, describe?: (node: DocNode) => BandSource | undefined): Record<BandKey, ReachingBand>;
/**
 * What a `variables` slot renders at one node of a document: its static
 * `renders`, plus — when it declares `rendersBands` — every band declared
 * upstream of that in-port, minus the ones it names `raw`.
 *
 * A band the static half already renders under the same variable is the same
 * name, not a collision (core's lore queries declare `worldLore`; Assemble
 * renders `worldLore`). One declared under a different variable, or shadowing
 * a name Assemble renders itself, is refused naming both.
 * @experimental
 */
export declare function rendersAt(doc: {
    nodes: readonly DocNode[];
    edges: readonly DocEdge[];
}, nodeKey: string, slot: Pick<SlotDecl, 'renders' | 'rendersBands'>, describe?: (node: DocNode) => BandSource | undefined): Record<string, VariableId>;
//# sourceMappingURL=bands.d.ts.map