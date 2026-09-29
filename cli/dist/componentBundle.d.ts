import type { ComponentBuiltAgainst } from '@serene-pub/sdk';
/** @experimental */
export interface ComponentBundle {
    /** Third-party packages inlined into the module, by name. */
    bundled: string[];
    /** Said, not fatal: a `<style>` dropped, and the like. */
    warnings: string[];
    /** Every source file the module was built from, absolute — what a host watches to rebuild it. */
    inputs: string[];
    /** The host contract the module was built against (F1), as the packager records it on the manifest entry. */
    builtAgainst: ComponentBuiltAgainst;
}
/**
 * The disk front door of the one component compiler (`componentCompile.ts`):
 * the package's files are read where they sit, built in `package` mode, and
 * the module written to `outfile`. Throws esbuild's failure as the build did.
 * @experimental
 */
export declare function bundleComponent(opts: {
    /** The component's source, absolute. */
    entry: string;
    /** Where the built module is written. */
    outfile: string;
    /** The package the component belongs to; its nearest `package.json` above `entry` when omitted. */
    root?: string;
    /**
     * Path aliases the source is written against (`{ $lib: '/abs/src/lib' }`),
     * as its own build resolves them: `$lib/x` → `<target>/x`. Core's widgets
     * are built this way; a plugin's are relative.
     */
    alias?: Record<string, string>;
}): Promise<ComponentBundle>;
/** The directory of the nearest `package.json` above `file`. */
export declare function packageRoot(file: string): Promise<string>;
//# sourceMappingURL=componentBundle.d.ts.map