/**
 * Reading order.
 *
 * A docs site's nav is an editorial decision, not an alphabetical accident —
 * which is why `order` is explicit and why a page missing from it is a WARNING
 * rather than a silent tail entry. The app learned this the expensive way:
 * `indexOf` returns -1 for an unlisted doc, so "android" and "troubleshooting"
 * sorted *ahead* of "getting-started" and that is what a new reader saw first.
 */
import type { DocsSource } from './types.js';
export interface SourcePage {
    source: DocsSource;
    /** Path inside the source, posix, e.g. 'pipelines/core_spec_respond.md'. */
    path: string;
    /** Slug without the source's prefix — what `order` is written in. */
    bareSlug: string;
    /** Full slug, prefix included. */
    slug: string;
    markdown: string;
    /** Absolute path on disk for a `dir` source; images resolve against its folder. */
    file?: string;
}
export declare function navOrder(source: DocsSource, pages: SourcePage[]): {
    ordered: SourcePage[];
    warnings: string[];
};
//# sourceMappingURL=manifest.d.ts.map