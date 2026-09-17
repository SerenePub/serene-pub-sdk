export interface DocsHighlighter {
    /** The highlighted block, or null when the grammar was not loaded. */
    render(code: string, lang: string): string | null;
    dispose(): void;
}
export declare function createDocsHighlighter(languages: string[]): Promise<DocsHighlighter>;
//# sourceMappingURL=highlight.d.ts.map