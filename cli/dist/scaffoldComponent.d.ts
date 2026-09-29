export declare class ComponentScaffoldError extends Error {
}
export interface ComponentScaffoldOptions {
    slug: string;
    vanilla?: boolean;
    widget?: boolean;
    embedDocument?: boolean;
}
/** @experimental */
export interface ScaffoldedFile {
    path: string;
    text: string;
}
export declare function componentFiles(o: ComponentScaffoldOptions): {
    files: ScaffoldedFile[];
    declarations: string;
};
/** Write the files into `dir`, refusing to overwrite any. */
export declare function writeComponentScaffold(dir: string, o: ComponentScaffoldOptions): Promise<{
    files: ScaffoldedFile[];
    declarations: string;
}>;
//# sourceMappingURL=scaffoldComponent.d.ts.map