/**
 * Document compilation (04 §5a, F3, F6).
 *
 * The builder chain is an *authoring format only*. SP imports the document and
 * never the JS — there is no importer path that evaluates a builder chain.
 *
 * Edges are derived here, 1:1 with pipeline_edges rows: the linear chain carries a
 * default edge, and every $ref becomes an explicit one.
 */
import type { BuiltSpec } from './builder.js';
import { type ConnectionRequirement } from './connections.js';
export interface DocEdge {
    from: string;
    fromPort: string;
    to: string;
    toPort: string;
    shape?: string;
    streaming?: boolean;
    /** true when derived from chain order rather than an explicit $ref */
    implicit?: boolean;
}
export interface DocNode {
    key: string;
    kind: string;
    definitionId: string;
    definitionVersion: number;
    config: Record<string, unknown>;
    clauseId?: string;
    clauseKind?: string;
    clauseChain?: string;
    position: number;
    /** Config references resolved at publish and stored explicitly (16 §5b-i). */
    resolvedRefs?: Record<string, string>;
}
export interface SpecDocument {
    schemaVersion: 1;
    id: string;
    version: string;
    /** The genre declaration a create pipeline carries (24 §3). Replaces `mode` (24 §2). */
    genre?: unknown;
    /** @deprecated pre-rename documents only; compile never writes it. */
    mode?: unknown;
    /** Contributed surfaces (19 §3–§4) — content like `genre`, hashed with the document. */
    contributes?: unknown;
    /** Catalogue claims (ruled 2026-08-27) — content like the two above, hashed with the document. */
    taxonomy?: unknown;
    /**
     * The usage lock (24 §4): { genre, event } the inlet declared. Hashed with
     * the document. **The only subscription** (R-4) — `subscribes` was deleted
     * 2026-09-16 with `.on()`.
     */
    input?: {
        genre?: string;
        event?: string;
    };
    includes: Array<{
        key: string;
        fragmentId: string;
    }>;
    /** Author-shipped presets. Execution-affecting, so they round-trip (F4). */
    presets: BuiltSpec['presets'];
    nodes: DocNode[];
    edges: DocEdge[];
    clauses: BuiltSpec['clauses'];
}
export declare function compile(built: BuiltSpec): SpecDocument;
/**
 * Follow the spine forward from `fromKey` to the first oracle. Linearity is what
 * makes this well-defined (F25). Ambiguity or absence is a publish error that names
 * the candidates — the teaching-error pattern (15 §1.3).
 */
export declare function resolveDownstreamOracle(built: BuiltSpec, fromKey: string): string;
/**
 * Canonical form — stable key order, for hashing and round-trip identity (F3).
 *
 * The sort and the digest below moved to `hash.ts` unchanged, because the type
 * registries now need the same two and a document and a declaration must not
 * disagree about what identical content is. Same bytes in, same string out.
 */
export declare function canonical(doc: SpecDocument): string;
/** Cheap deterministic content hash — stands in for the real canonical_hash (02 §3). */
export declare function canonicalHash(doc: SpecDocument): string;
/** Import: document → the same in-memory form. `import(export(x))` is identity (F3). */
export declare function importDocument(doc: SpecDocument): SpecDocument;
export interface ExportOptions {
    /**
     * Which presets travel. The app lets a user choose; SDK compile has no instance to
     * choose from, so it ships everything the author wrote.
     */
    presets?: 'all' | 'none' | string[];
    /**
     * How preset bindings travel — the same explicit fork pipeline export already offers
     * (02 §6), never decided silently.
     *
     * - `base` keeps `$ref` references by slug. Portable only where the target is itself a
     *   seeded, slugged row; a reference to something a user made locally resolves to
     *   nothing on the far side.
     * - `flattened` inlines the values. Always portable, and it forks the config — the
     *   importing instance can no longer swap the named thing in one place.
     */
    bindings?: 'base' | 'flattened';
    /** Resolve a `$ref` when flattening. Absent values are dropped and reported. */
    resolve?: (slot: string, ref: string) => unknown;
}
export interface ExportResult {
    doc: SpecDocument;
    /** What did not travel, and why — so an export is never quietly lossy. */
    omitted: Array<{
        what: string;
        reason: string;
    }>;
    /**
     * Every connection the importing instance must wire, derived from the types rather
     * than from what this instance happened to have configured (13 §10a). Complete even
     * when the exporter never set one up.
     */
    requires: ConnectionRequirement[];
}
/**
 * Export a document, with the presets a user selected (12 §7).
 *
 * **A filtered export is a different document, not a lossy copy of the same one**, so its
 * canonical hash legitimately differs from the source's. F3's identity law is about a
 * given export round-tripping — `import(export(x)) === export(x)` — and that still holds
 * exactly.
 */
export declare function exportDocument(doc: SpecDocument, opts?: ExportOptions): ExportResult;
/**
 * The envoy config addresses a document references — every `resolvedRefs`
 * target spelled `envoy:<key>`, once each. The executor resolves config for
 * these beside the nodes and clauses; the host projects the genre's
 * declaration at exactly these keys.
 */
export declare function envoyConfigKeysOf(doc: {
    nodes: ReadonlyArray<{
        resolvedRefs?: Record<string, string>;
    }>;
}): string[];
//# sourceMappingURL=document.d.ts.map