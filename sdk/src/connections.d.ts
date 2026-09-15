/**
 * What an import has to wire before it can run — the ruling on 13 §10a.
 *
 * The question was whether connection bindings deserve their own table, so that an
 * export could state *structurally* that connections were excluded rather than relying
 * on the exporter to strip them.
 *
 * **Ruled: no table.** A second table implies a second lifecycle — its own ids, its own
 * ownership rules, its own migration — and there isn't one. A connection binding is a
 * config value at instance scope, which 12's five-layer chain already owns.
 *
 * The guarantee people wanted from the table is available without it, and stronger. A
 * table could only ever report the connections the exporting instance had *filled in*,
 * so a spec exported before anyone configured it would claim to need nothing and the
 * importer would find out at the first run. Slots are declared on the **type**, so
 * deriving the requirement from descriptors is complete by construction — independent of
 * what the exporter did, and independent of whether the exporter was even configured.
 */
import type { SpecDocument } from './document.js';
import { type CapabilityId, type CapabilitySet, type Verdict } from './capabilities.js';
export interface ConnectionRequirement {
    nodeKey: string;
    slot: string;
    /** Which connection kind satisfies it — the produced shape (F17). */
    kind?: string;
    typeId: string;
    /** What the connection must be able to do. Unmet is a hard failure at bind. */
    requires?: readonly CapabilityId[];
    /** What it would use if available. The binding handles absence either way. */
    optional?: readonly CapabilityId[];
}
/** Every connection this document needs, derived from its types. */
export declare function requiredConnections(doc: SpecDocument): ConnectionRequirement[];
/**
 * What is still unwired, given what the importing instance has bound so far.
 *
 * Feeds `needs-configuration` (12 §6), which is deliberately not `broken`. A spec nobody
 * has given a connection is not damaged, it is unfinished — and the difference decides
 * whether a user files a bug or opens settings.
 */
export declare function unwiredConnections(doc: SpecDocument, bound: ReadonlyArray<{
    nodeKey: string;
    slot: string;
}>): ConnectionRequirement[];
/**
 * The line an import screen shows.
 *
 * Names the capability in the words the connection form used — "needs a
 * connection that supports Image generation" — rather than a shape id. Somebody
 * reading this is deciding which of their connections to point at it, and
 * `core:shape/image-gen@1` does not help them decide anything.
 *
 * `supports`, not `can`: every capability label is a noun phrase ("Vision",
 * "Embeddings", "Image generation"), so `can` only reads for the handful that
 * happen to start with a verb and gives "a connection that can Embeddings" for
 * the rest.
 */
export declare const renderRequirement: (r: ConnectionRequirement) => string;
/** One slot, checked against what the connection bound to it can actually do. */
export interface UnsatisfiedConnection extends ConnectionRequirement {
    verdict: Verdict;
}
/**
 * Which bound connections cannot do what their slot asks.
 *
 * Distinct from `unwiredConnections`, and the distinction is the whole point of
 * the capability model: *unwired* means nobody chose yet, *unsatisfied* means
 * somebody chose and the choice will not work. The first is an unfinished setup;
 * the second is a setup that looks finished and fails at the first run.
 *
 * Takes the resolved capability set per slot rather than a connection id, so
 * this stays pure — the caller does the lookup it was going to do anyway.
 */
export declare function unsatisfiedConnections(doc: SpecDocument, boundCapabilities: ReadonlyArray<{
    nodeKey: string;
    slot: string;
    capabilities: CapabilitySet;
}>): UnsatisfiedConnection[];
