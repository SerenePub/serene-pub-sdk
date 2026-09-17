/**
 * `@serene-pub/docs` — the docs compiler.
 *
 * One reading order over documentation that comes from more than one place:
 * the markdown a human wrote in the app repo, and the pages
 * `@serene-pub/cli`'s `renderAnnouncementDocs()` renders out of a package's
 * announcement. The compiler emits an article body per page, a manifest that
 * is the nav, and a flat search index — and refuses to emit any of it while a
 * link, an anchor or an image is broken.
 *
 * The heavy end of this package (marked, shiki, jimp, a wasm webp encoder) is
 * build-time only. A consumer serves the output; it never imports this.
 */
export { compileDocs } from './compile.js';
export { renderDocsGraph } from './graph.js';
export { specGraphOf } from './specGraph.js';
export { createDocsHighlighter } from './highlight.js';
export { AssetConverter } from './images.js';
export { navOrder } from './manifest.js';
export { loadMarkdownDir } from './sources.js';
export { docTitle, escapeHtml, renderMarkdown, resolveDocLink, rewriteDocHref, slugifyHeading, stripInlineMarkdown, } from './dialect.js';
export { DEFAULT_ASSET_BUDGET_BYTES, DEFAULT_DOC_LANGUAGES, DEFAULT_LINK_BASE, DEFAULT_MAX_WIDTH, DEFAULT_QUALITY, } from './types.js';
//# sourceMappingURL=index.js.map