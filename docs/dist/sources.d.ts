export interface LoadMarkdownDirOptions {
    /** Prepended to every page path, e.g. `'api'` → `'api/index.md'`. */
    prefix?: string;
}
/**
 * Every `.md` under `dir`, recursively, as pages a `DocsSource` accepts.
 *
 * Paths are relative to `dir`, `/`-separated whatever the platform, and sorted
 * — the reading order a source's `order` then overrides.
 */
export declare function loadMarkdownDir(dir: string, options?: LoadMarkdownDirOptions): Promise<{
    path: string;
    markdown: string;
}[]>;
//# sourceMappingURL=sources.d.ts.map