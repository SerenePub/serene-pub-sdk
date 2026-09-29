/**
 * `@serene-pub/docs` — the contract.
 *
 * The compiler takes documentation from more than one place — a directory of
 * markdown a human wrote, and pages `@serene-pub/cli` rendered out of an
 * announcement — and emits ONE reading order over all of it. Keeping the
 * contract in its own module is what lets the consumer pin against these
 * shapes without importing the compiler (and the marked/shiki/jimp weight
 * behind it).
 */
/**
 * This package does not import `@serene-pub/cli`, and cannot: the CLI now
 * imports `DocsGraph` from here (it renders the ` ```pipeline ` fence the
 * compiler resolves), and two packages whose emitted `.d.ts` files reference
 * each other cannot both be built — whichever goes second reads the other's
 * declarations, which read its own, and `tsc` refuses to overwrite an input.
 * So the arrow points one way, docs → cli is gone, and `DocsSource.pages`
 * states the shape it accepts structurally.
 *
 * The claim that shape IS what `renderAnnouncementDocs()` returns has not
 * gone anywhere — it moved to `sdk-tests/docsSource.assert.ts`, which sees
 * both packages' SOURCE and so proves it against the CLI as written rather
 * than against the CLI as last built.
 */
export interface DocsSource {
    /** 'app' | 'sdk' | any id. Recorded per page; drives banners. */
    id: string;
    /**
     * Nav group heading shown to readers — the source's ONE group when `order`
     * is flat, and the heading of the trailing group that catches pages a
     * grouped `order` does not list.
     */
    group: string;
    /** Either a directory of markdown files… */
    dir?: string;
    /** …or pre-rendered markdown pages (e.g. from @serene-pub/cli renderAnnouncementDocs). `path` is like 'pipelines/core_spec_respond.md'. */
    pages?: {
        path: string;
        markdown: string;
    }[];
    /** Slug prefix for every page of this source, e.g. 'sdk' → slug 'sdk/pipelines/core_spec_respond'. Omit for none. */
    prefix?: string;
    /**
     * Explicit reading order of slugs (without prefix). A page absent from it is
     * appended alphabetically AND reported as a warning.
     *
     * Either flat — one nav group, headed `group` — or a list of **order
     * groups**, each its own nav group headed by its own name, so one source
     * can fill several sections of the nav without its files moving. A grouped
     * order's unlisted pages land in a trailing group headed `group` (merged
     * into a declared group of that name, if there is one).
     */
    order?: string[] | DocsOrderGroup[];
    /** Prepended to every page of this source as <aside class="doc-banner" role="note">. */
    banner?: string;
    /** Optional repo link and commit shown in the manifest for this source. */
    repo?: {
        url: string;
        commit?: string;
    };
}
/**
 * One **order group**: a named run of a source's reading order, which becomes
 * one nav group of its own. Names are unique within a source; a slug belongs
 * to at most one group.
 */
export interface DocsOrderGroup {
    /** Nav group heading shown to readers. */
    group: string;
    /** Slugs (without prefix), in reading order. */
    pages: string[];
}
/**
 * One box in a drawing the compiler lays out but does not understand.
 *
 * `kind` is an opaque token — `inlet`, `query`, `task`, `oracle`, `outlet`,
 * whatever the resolver calls it — that reaches the page as the class suffix
 * `doc-graph-node-{kind}` and nothing more. Knowing a query from an oracle is
 * the resolver's job, which is what keeps this package free of a dependency
 * on `@serene-pub/sdk`.
 */
export interface DocsGraphNode {
    key: string;
    /** inlet | query | task | oracle | outlet | … */
    kind: string;
    label: string;
    sublabel?: string;
}
export interface DocsGraphEdge {
    /** A node `key`. An edge naming a key no node has is dropped. */
    from: string;
    to: string;
    label?: string;
}
/** What a ` ```pipeline <id> ` fence resolves to. */
export interface DocsGraph {
    /** The fence's id. Also slugged into every id the emitted SVG defines. */
    id: string;
    /** The `<figcaption>` and the SVG's accessible name. Defaults to `id`. */
    title?: string;
    nodes: DocsGraphNode[];
    edges: DocsGraphEdge[];
    /** ELK's layout direction. Default 'DOWN'. */
    direction?: 'DOWN' | 'RIGHT';
}
export interface CompileDocsOptions {
    /** Product version recorded in the manifest. */
    version: string;
    sources: DocsSource[];
    /** Where pages/*.html, manifest.json, search.json go. Created/emptied. */
    out: string;
    /** Where converted image assets go (a directory). Created/emptied. */
    assetsOut: string;
    /** URL base the emitted <img src> uses, e.g. '/docs/assets'. */
    assetsBase: string;
    /** URL base for page links, default '/docs'. rewriteDocHref('./x.md#a') → `${linkBase}/x#a`. */
    linkBase?: string;
    /** Max image width in px (default 1200) and webp quality (default 80). */
    image?: {
        maxWidth?: number;
        quality?: number;
    };
    /** Fails the compile if converted assets exceed this. Default 6 * 1024 * 1024. */
    assetBudgetBytes?: number;
    /** Shiki languages to load. Default: ['ts','js','json','bash','yaml','html','css','svelte','markdown','liquid','sql']. */
    languages?: string[];
    /**
     * Content the compiler renders but cannot know: `pipeline` answers a
     * ` ```pipeline <id> ` fence with the graph to draw. Returning null — or
     * not supplying the resolver at all — fails the compile, naming the page
     * and the id, in the same offender listing as a broken link.
     */
    resolvers?: {
        pipeline?: (id: string) => DocsGraph | null;
    };
}
export interface DocsManifest {
    version: string;
    /** ISO. */
    generatedAt: string;
    linkBase: string;
    sources: Record<string, {
        group: string;
        banner?: string;
        repo?: {
            url: string;
            commit?: string;
        };
    }>;
    /**
     * Nav groups, in reading order; slugs within each, in reading order. A
     * source with a grouped `order` contributes several consecutive groups,
     * so `source` is NOT unique here — key a group by `source` + `group`.
     */
    nav: {
        group: string;
        source: string;
        pages: string[];
    }[];
    pages: Record<string, DocsPageMeta>;
    assets: {
        count: number;
        bytes: number;
        budgetBytes: number;
    };
}
export interface DocsPageMeta {
    /** 'getting-started' or 'sdk/pipelines/core_spec_respond'. */
    slug: string;
    /** First H1, else slug. */
    title: string;
    /** First paragraph after H1, inline markdown stripped, ≤200 chars. */
    description: string;
    source: string;
    /** Position within its source's nav. */
    order: number;
    headings: {
        id: string;
        text: string;
        depth: number;
    }[];
    /** Size of pages/<slug>.html. */
    bytes: number;
}
/** search.json: flat array, one entry per heading, mirroring the app's existing DocSection. */
export interface DocsSearchEntry {
    slug: string;
    anchor: string;
    title: string;
    depth: number;
    preview: string;
    /** The section's body as plain text, ≤1200 chars — searched, never shown. */
    text: string;
}
export interface CompileDocsReport {
    manifest: DocsManifest;
    /** e.g. slug missing from `order`. */
    warnings: string[];
    pagesWritten: number;
    assetsWritten: number;
}
/** Shiki grammars loaded when `languages` is not given. */
export declare const DEFAULT_DOC_LANGUAGES: string[];
export declare const DEFAULT_LINK_BASE = "/docs";
export declare const DEFAULT_MAX_WIDTH = 1200;
export declare const DEFAULT_QUALITY = 80;
export declare const DEFAULT_ASSET_BUDGET_BYTES: number;
//# sourceMappingURL=types.d.ts.map