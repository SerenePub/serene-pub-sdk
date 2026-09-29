import { escapeHtml } from './escape.js';
/** Re-exported: it was this module's export first, and every caller names it here. */
export { escapeHtml };
export interface DocHeading {
    id: string;
    text: string;
    depth: number;
}
/**
 * One link a page makes that the compile can prove lands: a relative `.md`
 * href, or a bare `#anchor`, which points at the page that wrote it.
 */
export interface DocLinkRef {
    /** The href as written. */
    href: string;
    /** Slug it points at, prefix included. A bare `#anchor`'s own page. */
    slug: string;
    /** Anchor without the '#', or '' when it has none. */
    anchor: string;
}
/** A converted image, as the compiler hands it back to the renderer. */
export interface DocImageAsset {
    /** File name inside the assets directory, e.g. '3f2a…c1.webp'. */
    file: string;
    width?: number;
    height?: number;
}
export interface DocHrefContext {
    /** Path of the page inside its source, e.g. 'pipelines/core_spec_respond.md'. */
    path: string;
    /** Slug prefix of the page's source, e.g. 'sdk'. */
    prefix?: string;
    /** URL base for page links. Default '/docs'. */
    linkBase?: string;
}
export interface ResolvedDocLink {
    slug: string;
    anchor: string;
    href: string;
}
export interface RenderMarkdownOptions extends DocHrefContext {
    /**
     * Renders one fenced code block. Returning null falls back to an escaped
     * `<pre><code>`, which is also what an unknown language gets.
     */
    highlight?: (code: string, lang: string) => string | null;
    /**
     * Resolves an image reference against the page it was written on.
     * Returning null leaves the reference pointing at the href as written —
     * the compiler uses that for offsite images, and for the ones it is about
     * to fail the compile over.
     */
    resolveImage?: (href: string) => Promise<DocImageAsset | null>;
    /**
     * Renders a ` ```pipeline <id> ` fence into the HTML that replaces it.
     * Resolved BEFORE the parse, exactly like an image's asset: laying a graph
     * out is asynchronous and marked's parse is not. Returning null leaves the
     * fence as a plain code block — which only a compile that is already
     * failing over that same id ever sees.
     */
    resolvePipeline?: (id: string) => Promise<string | null>;
    /** URL base the emitted `<img src>` uses, e.g. '/docs/assets'. */
    assetsBase?: string;
    /** Prepended as `<aside class="doc-banner" role="note">`. */
    banner?: string;
}
export interface RenderedMarkdown {
    html: string;
    headings: DocHeading[];
    /** Previews by heading id — the body under that heading, ≤180 chars. */
    previews: Record<string, string>;
    /**
     * Search text by heading id — the same body, longer (≤1200 chars), so a
     * word further into a section than its preview still finds it.
     */
    sectionTexts: Record<string, string>;
    /** Every relative `.md` link and bare `#anchor`, in document order. */
    links: DocLinkRef[];
    /** Every image reference, in document order, as written. */
    images: string[];
    /** Every ` ```pipeline ` fence's id, in document order. */
    pipelines: string[];
    /** First H1, else undefined. */
    title?: string;
    /** First paragraph after the H1, inline markdown stripped, ≤200 chars. */
    description: string;
}
declare const ADMONITION_KINDS: readonly ['note', 'tip', 'warning'];
export type AdmonitionKind = (typeof ADMONITION_KINDS)[number];
/**
 * GitHub's heading-slug rule, via `github-slugger`.
 *
 * Not a choice about slugs so much as an admission of where the corpus comes
 * from: the guides lived on GitHub for a year and link each other with the
 * anchors GitHub gave them (`#portable--self-contained-setup`,
 * `#serene_pub_data_dir-is-the-one-exception`), and TypeDoc's markdown emits
 * the same shape (`#slot_value`, `#band_order`). Any other rule makes those
 * dead on arrival.
 *
 * It lowercases, drops the punctuation GitHub drops — `_` and `-` are not
 * punctuation to it, which is the whole of the `SERENE_PUB_DATA_DIR` case —
 * and turns EACH space into a `-`, so an `&` removed from between two spaces
 * leaves two: `Prompt Configs & Summarization Config` becomes
 * `prompt-configs--summarization-config`.
 *
 * This is the stateless single-heading form — a fresh slugger per call, so
 * nothing de-duplicates across calls. A page renders through ONE slugger (see
 * `renderMarkdown`), which is where the `-1`, `-2` suffixes come from.
 *
 * Nothing is trimmed or otherwise tidied on the way in. Heading text reaches
 * this already trimmed by the lexer, and normalisation GitHub does not do is a
 * slug GitHub's readers do not have.
 */
export declare function slugifyHeading(text: string): string;
/** The app's, character for character. Used for descriptions and previews. */
export declare function stripInlineMarkdown(text: string): string;
/**
 * Where a relative `.md` link lands, given the page that wrote it. Returns
 * null for anchor-only, offsite and non-markdown hrefs — those pass through
 * untouched, and are never validated.
 */
export declare function resolveDocLink(href: string, ctx: DocHrefContext): ResolvedDocLink | null;
/**
 * Rewrites a relative markdown link into the route it maps to.
 *
 * With no context this is the app's original one-argument function, kept
 * because the app still calls it that way: flat slugs only, `/docs` hardcoded.
 * With a context it understands nested paths and a source prefix, which is
 * what a catalog page linking `pipelines/core_spec_respond.md` needs.
 */
export declare function rewriteDocHref(href: string, ctx?: DocHrefContext): string;
/**
 * Markdown → the article body, with everything the compile needs to check
 * itself read off the same token tree.
 */
export declare function renderMarkdown(markdown: string, opts: RenderMarkdownOptions): Promise<RenderedMarkdown>;
/** The title rule: first H1 in the source, else the slug. */
export declare function docTitle(markdown: string, slug: string): string;
//# sourceMappingURL=dialect.d.ts.map