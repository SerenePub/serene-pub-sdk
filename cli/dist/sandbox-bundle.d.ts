/**
 * The sandbox-plugin bundler preset (author-side), moved into the SDK toolchain.
 *
 * A sandbox plugin ships as one self-contained CJS bundle — its own code plus its
 * pure-JS dependencies inlined at build time, so the app never resolves a
 * node_modules or runs `npm install`. This is the esbuild preset that produces
 * it, and the guard that makes the sandbox contract legible at build time:
 * importing a Node builtin the sandbox withholds (`fs`, `net`, `http`,
 * `child_process`, …) is a **build error** pointing the author at `ctx` instead.
 * Pure-JS deps bundle normally; anything reaching for real OS/IO fails here
 * rather than at install.
 *
 * Output is `format: "cjs"` assigning `module.exports = { hooks, … }`, exactly
 * what the runtime evaluates. `target: es2021` stays inside QuickJS-ng's language
 * support so a bundle that avoids WASM/Intl runs on both backends.
 *
 * esbuild is the only dependency, matched to what the toolchain already carries
 * (declared a peerDependency so the host toolchain provides it).
 */
import * as esbuild from "esbuild";
/** The base esbuild options for a plugin bundle. */
export declare function pluginBundleOptions(): esbuild.BuildOptions;
export interface BundleInput {
    /** Inline entry source (for programmatic/test use). */
    source?: string;
    /** Or an entry file on disk. */
    entryFile?: string;
    /** Where to resolve the entry's imports from (defaults to cwd). */
    resolveDir?: string;
}
/** Bundle a plugin to a single self-contained CJS string. Throws on a build
 * error (including a forbidden capability import). */
export declare function bundlePlugin(input: BundleInput): Promise<string>;
//# sourceMappingURL=sandbox-bundle.d.ts.map