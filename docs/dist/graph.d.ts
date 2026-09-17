/**
 * A graph, drawn: ELK's layered layout emitted as inline SVG.
 *
 * The geometry is deliberately the app's. The same documents are laid out in
 * the pipeline workspace's map (`flow/layout.ts`) with layered ELK, 220×58
 * cards and the same three spacings, so a reader who has seen the map reads
 * the same shape here rather than a second, differently-proportioned picture
 * of the same pipeline. What this does NOT copy is the app's compound blocks:
 * a `DocsGraph` is flat by construction, because a printed page has no
 * collapsing and a nested frame that cannot be opened is just a smaller box.
 *
 * Nothing here emits a colour. Every stroke and fill is `currentColor` or
 * `none`, and the classes — `doc-graph-node-{kind}` above all — are the whole
 * of the styling surface, because the app and the standalone site theme these
 * pages differently and an SVG with `#4459c9` baked into it is a drawing that
 * is wrong in one of them.
 *
 * elkjs is dynamic-imported: it is ~1.4MB of transpiled Java, and a compile
 * with no `pipeline` fence in it should never pay for that.
 */
import type { DocsGraph } from './types.js';
/**
 * One `DocsGraph` → one `<figure class="doc-graph">` holding an inline SVG.
 *
 * Every id the SVG defines is prefixed with a slug of the graph's id, so two
 * graphs on one page do not share a marker or an `aria-labelledby` target. A
 * page embedding the SAME graph twice would, which is why the fence's id is
 * the thing that has to be unique on a page rather than merely present.
 */
export declare function renderDocsGraph(graph: DocsGraph): Promise<string>;
//# sourceMappingURL=graph.d.ts.map