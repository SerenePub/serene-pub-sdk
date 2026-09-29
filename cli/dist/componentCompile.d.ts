/**
 * The component compiler (§3.5, C6 P0): ONE build a component's source goes
 * through, whether it is a package's files on disk (`serene-pub build`,
 * `bundleComponent`, core's own components) or an admin's files in memory
 * (the app's in-app authoring). Two front doors, one compiler — the CLI and
 * the app cannot drift.
 *
 * - The bundler and Svelte's compiler are INJECTED: this module imports
 *   neither at run time, so a host picks its own esbuild (native, or wasm
 *   later) and its own Svelte, and the fingerprint says which.
 * - Authored files live in a virtual namespace: nothing the author wrote is
 *   ever read from disk, and nothing is written (`write: false`).
 * - `mode: 'in-app'` is the strict one. A specifier with a `.`/`..` segment
 *   past its relative prefix, a backslash, a NUL, a URL or scheme, an
 *   absolute path or an import attribute is refused; a relative import stays
 *   inside the virtual root; a bare one must be on `COMPONENT_IMPORTS` and
 *   RESOLVE to a file of that package's own directory (realpath, no nested
 *   `node_modules`); every file loaded is `.svelte`, `.ts`, `.js` or `.mjs`.
 *   Every refusal names the list.
 * - In every mode nothing resolves into `@remote-dom` (the host's renderer)
 *   or the component client's worker runtime.
 */
import type * as Esbuild from 'esbuild';
import { type ComponentBuiltAgainst } from '@serene-pub/sdk';
import { COMPONENT_COMPILE_LIMITS } from './componentSource.js';
export { COMPONENT_COMPILE_LIMITS, isSafeComponentPath, componentSourceHash, builtAgainstOfFingerprint } from './componentSource.js';
/** @internal The parts of esbuild the compiler calls — native esbuild satisfies it. */
export type ComponentBundler = Pick<typeof Esbuild, 'build' | 'transform' | 'version'>;
/** @internal The parts of `svelte/compiler` the compiler calls. */
export type ComponentSvelteCompiler = Pick<typeof import('svelte/compiler'), 'compile' | 'compileModule' | 'VERSION'>;
/**
 * Bumped whenever this compiler's output for the same input can change —
 * a host recompiles every stored component whose fingerprint differs.
 * @internal
 */
export declare const COMPONENT_COMPILER_REVISION = 1;
/** @internal The virtual namespace authored files live in. */
export declare const COMPONENT_SOURCE_NAMESPACE = "sp-component";
/** @internal Where the authored source comes from: the virtual files, or a package on disk. */
export type ComponentSourceHost = {
    kind: 'virtual';
    files: ReadonlyMap<string, string>;
    resolveFrom: string;
} | {
    kind: 'disk';
    /** The package the component belongs to. */
    root: string;
    /** Path aliases (`{ $lib: '/abs/src/lib' }`), as the package's own build resolves them. */
    alias?: Record<string, string>;
};
/** @internal One file a split build wrote (in memory): its name relative to `outdir`, and what it imports. */
export interface ComponentBuildOutput {
    /** Relative to `outdir`, forward slashes (`stats.js`, `shared-AB12CD34.js`). */
    file: string;
    code: string;
    /** The entry's name when this file is an entry's module. */
    entry?: string;
    /** The other outputs it imports, relative to `outdir`, and how. */
    imports: Array<{
        file: string;
        kind: Esbuild.ImportKind | 'file-loader';
    }>;
}
/** @internal The one build both front doors run. Throws esbuild's failure as-is. */
export declare function runComponentBuild(opts: {
    host: ComponentSourceHost;
    /**
     * Absolute on disk; the virtual path in memory. A map of name → absolute
     * entry is a SPLIT build: every entry in one run, what they share in
     * `shared-<hash>.js` chunks they import relatively — core's own
     * components only (one owner's worker loads them all); disk and
     * `package` mode only, with `outdir`.
     */
    entry: string | Record<string, string>;
    mode: 'in-app' | 'package';
    framework?: 'svelte' | 'vanilla';
    esbuild: ComponentBundler;
    svelte?: ComponentSvelteCompiler;
    /** Disk only: the path the module will be written to (esbuild names inputs relative to it). */
    outfile?: string;
    /** A split build only: the directory its outputs are named for (nothing is written). */
    outdir?: string;
}): Promise<{
    code: string;
    bundled: string[];
    warnings: string[];
    inputs: string[];
    /** A split build's every output (entries and chunks), in esbuild's order. */
    outputs?: ComponentBuildOutput[];
    /** A split build's entries → every source file each reaches, absolute and sorted. */
    entryInputs?: Record<string, string[]>;
}>;
/** @internal A split build's shared chunk file name. */
export declare const COMPONENT_CHUNK_FILE: RegExp;
/** @internal */
export interface ComponentSetBuild {
    /**
     * Served name → code: an entry by its name (`stats`), a chunk by its file
     * (`shared-….js`). Only what an entry reaches by a static `import` is
     * here; a chunk esbuild left for a dynamic `import()` it then shook out
     * (which nothing loads) is not.
     */
    modules: Record<string, string>;
    /** Entry → every source file it was built from, absolute and sorted — its own single build's inputs. */
    inputs: Record<string, string[]>;
    /** Third-party packages inlined into the set, by name. */
    bundled: string[];
    /** Said, not fatal (Svelte's warnings, a dropped `<style>`). */
    warnings: string[];
}
/**
 * Build a set of ONE owner's components together (core's, C7 unit M): each
 * entry one module, what they share in `shared-<hash>.js` chunks the entries
 * import relatively, so the owner's one UI worker loads Svelte's runtime and
 * the helpers once. The same build, guard and loaders as every other
 * component (`package` mode); nothing is written — the caller writes
 * `modules` into `outdir`.
 *
 * Every served module is judged as a host judges it (`componentModuleFindings`)
 * and may reach another only by a static `import`; a finding, a run-time
 * `import(…)` or an output that is neither an entry nor a chunk throws.
 *
 * Never for a plugin or an authored component: their modules stay
 * self-contained, and nothing here is loaded by another owner's worker (R35).
 * @internal
 */
export declare function buildComponentSet(opts: {
    /** The package the components belong to. */
    root: string;
    /** Name → the entry's source, absolute. A name is what serves it (`/core-ui/<name>`). */
    entries: Record<string, string>;
    /** The directory the modules will be served from (output names are relative to it). */
    outdir: string;
    esbuild: ComponentBundler;
    svelte?: ComponentSvelteCompiler;
    alias?: Record<string, string>;
}): Promise<ComponentSetBuild>;
/**
 * What a compiled component depends on besides its source: the compiler's
 * revision, the bundler, Svelte's compiler, and the runtime packages inlined
 * into every module (Svelte, the SDK, the component client, the controls),
 * as resolved from `resolveFrom`. A host stores it beside each artifact and
 * recompiles wherever it differs.
 * @internal
 */
export declare function toolchainFingerprint(opts?: {
    esbuild?: Pick<ComponentBundler, 'version'>;
    svelte?: Pick<ComponentSvelteCompiler, 'VERSION'> | null;
    resolveFrom?: string;
}): string;
/**
 * @internal The packager and the in-app compile record it; read it off their output.
 *
 * What a module built from `resolveFrom` is built against (F1): the widget
 * protocol and host-element vocabulary of the SDK the CLI runs (the one the
 * component client it bundles was released with), and the SDK and
 * component-client versions as resolved from `resolveFrom`, for the reader.
 * The packager writes it on each manifest component entry; the in-app
 * compile returns it (and the fingerprint carries it).
 */
export declare function componentBuiltAgainst(resolveFrom?: string): ComponentBuiltAgainst;
/** @internal Where a compile error sits in the AUTHORED file: line 1-based, column 0-based (esbuild's). */
export interface ComponentCompileError {
    file: string;
    line: number;
    column: number;
    text: string;
}
/** @internal */
export interface ComponentCompileResult {
    /** The self-contained ES module; `''` when `errors` is not empty. */
    code: string;
    /** SHA-256 of `code`, hex; `''` when `errors` is not empty. */
    hash: string;
    /** Said, not fatal: a `<style>` dropped, a run-time `import()`, Svelte's own warnings. Sorted. */
    warnings: string[];
    errors: ComponentCompileError[];
    /** `toolchainFingerprint()` of the toolchain that built it. */
    fingerprint: string;
    /** The host contract it was built against (F1) — what a host judges before mounting it. */
    builtAgainst: ComponentBuiltAgainst;
}
/** @internal */
export interface CompileComponentSourceOptions {
    /** Relative path → source. Paths follow `isSafeComponentPath`. */
    files: Record<string, string>;
    /** One of `files`' keys. */
    entry: string;
    framework: 'svelte' | 'vanilla';
    /**
     * `in-app`: imports held to `COMPONENT_IMPORTS`, confined as the module
     * header says. `package`: a CLI build's rules — other packages may be
     * bundled (and are listed in warnings).
     */
    mode: 'in-app' | 'package';
    /** The bundler, injected (`import * as esbuild from 'esbuild'`). */
    esbuild: ComponentBundler;
    /** Svelte's compiler, injected; loaded from this package's own `svelte` when omitted. */
    svelte?: ComponentSvelteCompiler;
    /** Where `svelte` and the allowlisted packages resolve from (absolute); `process.cwd()` when omitted. */
    resolveFrom?: string;
    /** A host may LOWER `COMPONENT_COMPILE_LIMITS`; a higher value is ignored. */
    limits?: Partial<Record<keyof typeof COMPONENT_COMPILE_LIMITS, number>>;
}
/** @internal Compile a component from in-memory source. Never throws for the author's mistakes: they come back in `errors`. */
export declare function compileComponentSource(opts: CompileComponentSourceOptions): Promise<ComponentCompileResult>;
//# sourceMappingURL=componentCompile.d.ts.map