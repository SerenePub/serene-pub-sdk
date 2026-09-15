/**
 * The docs site shell (24 T9): the generated markdown, rendered as a
 * self-contained static site — no dependencies, no build step, open
 * index.html. The converter handles exactly the markdown `docs.ts` emits
 * (headings, tables, lists, fenced code, inline code, links, bold) — it is a
 * renderer for our own output, not a general markdown engine, which is what
 * keeps it a page of code instead of a dependency.
 *
 * Live controls join these pages when @serene-pub/controls exists (T6c);
 * until then the option tables are the reference.
 */
import type { AnnouncementDocument } from '@serene-pub/sdk';
import type { DocPage } from './docs.js';
export declare function markdownToHtml(md: string): string;
export interface SitePage {
    path: string;
    html: string;
}
export declare function renderSite(announcement: AnnouncementDocument, pages: DocPage[]): SitePage[];
//# sourceMappingURL=docsSite.d.ts.map