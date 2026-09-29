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
/** One settled nav group: a heading and its pages, in reading order. */
export interface SettledGroup {
    group: string;
    pages: SourcePage[];
}
/**
 * Settle a source's reading order: its pages in order, and the nav groups
 * they fall into.
 *
 * A flat `order` (or none) gives one group headed `source.group`. A grouped
 * `order` gives one group per declared group, in declaration order; a group
 * none of whose pages exist is left out of the nav (each missing slug still
 * warns). Unlisted pages are appended alphabetically, with a warning, to the
 * group headed `source.group` — a declared one of that name, or a new
 * trailing one — so they land at the end and say so.
 */
export declare function navOrder(source: DocsSource, pages: SourcePage[]): {
    ordered: SourcePage[];
    groups: SettledGroup[];
    warnings: string[];
};
//# sourceMappingURL=manifest.d.ts.map