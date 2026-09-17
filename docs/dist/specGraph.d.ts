/**
 * The bridge from a compiled pipeline to a drawing of it.
 *
 * This package lays graphs out and knows nothing about pipelines; the SDK
 * compiles pipelines and knows nothing about drawings. This is the one place
 * the two vocabularies meet, and it translates rather than merges: a
 * `DocsGraphNode`'s kind travels as an opaque token the page styles, and an
 * edge's ports do not travel at all.
 *
 * It lives here rather than in `@serene-pub/cli` — which is where it was
 * written and which still re-exports it — because it is pure and the browser
 * playground needs it: the cli is Node-only, and a `DocsGraph` is the only
 * thing `renderDocsGraph` accepts. The `SpecDocument` import is type-only, so
 * nothing about the one-way arrow in `types.ts` changes — at runtime this file
 * imports nothing at all.
 */
import type { SpecDocument } from '@serene-pub/sdk';
import type { DocsGraph } from './types.js';
/**
 * One compiled spec → the flat graph the docs compiler draws.
 *
 * Node labels are the keys, because the key is what the rest of the page and
 * every error message calls that step; the type id rides underneath it.
 *
 * Edges are de-duplicated by endpoint pair. A spec's `edges` are 1:1 with
 * `pipeline_edges` rows, so two `$ref`s from the same upstream node into two
 * different config paths are two rows and the same line — drawn twice, it is
 * the same line, slightly fatter, for no reader's benefit.
 */
export declare function specGraphOf(doc: SpecDocument, opts?: {
    title?: string;
}): DocsGraph;
//# sourceMappingURL=specGraph.d.ts.map