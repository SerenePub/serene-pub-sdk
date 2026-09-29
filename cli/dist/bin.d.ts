#!/usr/bin/env node
/**
 * `serene-pub` — the plugin author's command line.
 *
 * Three verbs, and each one answers a question an author actually asks:
 *
 *   build     what will core see when it installs this? (manifest + documents)
 *   check     what am I doing that core will refuse, and why?
 *   contracts what types does this release give me to pin against?
 *
 * There is deliberately no `publish` and no `install`. Installing an extension is an
 * admin action inside SP, not something a build tool can do to somebody's instance —
 * a CLI that could install would be a CLI that could be scripted into installing.
 */
import { type SourceFile } from './compiler.js';
/**
 * The package's source, and what was left out of it.
 *
 * Two kinds of leaving-out, and they are not the same kind (D-2). A `--ignore`
 * glob drops the file: the author has said it is not the plugin. The default
 * list stops a file being read *as the plugin* — no permission, no hook count,
 * no sandbox refusal — while still linting it, because a `fetch()` in it is
 * still a `fetch()` in the package. Both halves of that were incidents: `check
 * .` answering `core:write · provider:call` off an example's fake ctx, and a
 * test's `for (const handler of …) await handler(…)` counted as eleven
 * registrations against an extension's ten.
 * @internal
 */
export declare function sourcesIn(dir: string, ignore?: readonly string[]): Promise<{
    sources: SourceFile[];
    ignored: string[];
}>;
/**
 * The frame documents a package declares, read off disk.
 *
 * The compiler never touches a filesystem — it is text in, findings out, which
 * is what lets a test state a document in three lines — so the paths are
 * resolved here. A document that is not there is not this pass's business:
 * the *shape* of an entry is `surfaceFindings`'s and a missing file is the
 * instance's, and inventing a third opinion would refuse a package mid-move.
 * @internal
 */
export declare function frameDocumentsIn(dir: string, entries: readonly string[], ignore?: readonly string[]): Promise<Array<{
    path: string;
    text: string;
}>>;
/** @internal */
export declare function main(argv?: string[]): Promise<number>;
/**
 * True when this module is the process entry point (`node bin.js …`), so `main()`
 * runs only when invoked as a script, not when imported (e.g. by tests).
 *
 * `process.argv[1]` is invoked through `node_modules/.bin/serene-pub` — a symlink —
 * for every `npx serene-pub …` and every package.json `"scripts"` entry, while
 * `import.meta.url` always resolves to the real file the symlink points at. Compared
 * raw, those never match, so the guard silently never fires: `main` never runs, and
 * the process exits 0 having done nothing. Both sides are realpath'd first so a
 * symlinked argv[1] still matches. Exported so the guard can be tested against a
 * symlink without spawning a process.
 * @internal
 */
export declare function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean;
//# sourceMappingURL=bin.d.ts.map