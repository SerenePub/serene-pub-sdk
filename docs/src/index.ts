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
export { compileDocs } from './compile.js'
export { renderDocsGraph } from './graph.js'
export { specGraphOf } from './specGraph.js'
export { createDocsHighlighter, type DocsHighlighter } from './highlight.js'
export { AssetConverter, type ConvertedAsset, type ImageConvertOptions } from './images.js'
export { navOrder, type SourcePage } from './manifest.js'
export { loadMarkdownDir, type LoadMarkdownDirOptions } from './sources.js'
export {
	docTitle,
	escapeHtml,
	renderMarkdown,
	resolveDocLink,
	rewriteDocHref,
	slugifyHeading,
	stripInlineMarkdown,
	type AdmonitionKind,
	type DocHeading,
	type DocHrefContext,
	type DocImageAsset,
	type DocLinkRef,
	type RenderedMarkdown,
	type RenderMarkdownOptions,
	type ResolvedDocLink,
} from './dialect.js'
export {
	DEFAULT_ASSET_BUDGET_BYTES,
	DEFAULT_DOC_LANGUAGES,
	DEFAULT_LINK_BASE,
	DEFAULT_MAX_WIDTH,
	DEFAULT_QUALITY,
	type CompileDocsOptions,
	type CompileDocsReport,
	type DocsManifest,
	type DocsOrderGroup,
	type DocsGraph,
	type DocsGraphEdge,
	type DocsGraphNode,
	type DocsPageMeta,
	type DocsSearchEntry,
	type DocsSource,
} from './types.js'
