/**
 * Executed examples (15 §1.6, 07 §0-i) — pages whose code was RUN to make them.
 *
 * Every example on the docs site is a real module in `sdk-tests/examples`: it is
 * type-checked with the suite, built into a document, validated against the same
 * laws a published pipeline is, and executed against the fixture host. The page
 * shows that module verbatim and, under it, what the run actually produced. So
 * an example cannot claim a method that no longer exists, wire a port that no
 * longer accepts it, or print output the executor no longer emits — the page
 * fails to generate first.
 *
 * The output is held still by a **golden** per example (`toGolden` /
 * `checkGolden`, `@serene-pub/sdk/testing`). Drift is not a page that quietly
 * changes wording; it is a `GoldenMismatch` naming the example and the exact
 * path that moved, and re-recording it is a deliberate `--update-goldens`.
 *
 * ⚠ **Loading is the caller's.** The examples are `.ts`, because they belong to
 * the test suite that type-checks them, and nothing here compiles TypeScript.
 * Pass `load` — `(p) => import(p)` — from a runtime that can import a `.ts`
 * module (the suite runs under `tsx`; a host would register `tsx` first). The
 * default is a plain dynamic import, which is enough for `.js` examples and
 * for any runtime that already has a TypeScript loader installed.
 */
import { type BuiltSpec, type Receipt, type SpecDocument } from '@serene-pub/sdk';
import { type ExampleRunCtx, type ExampleRunOptions } from '@serene-pub/sdk/testing';
import type { DocPage } from './docs.js';
/**
 * The pieces an executed example runs on — the fixed seed and clock, the run
 * context, and the receipt rendering the page shows — now live in
 * `@serene-pub/sdk/testing`. They moved because the generator is no longer the
 * only thing that runs an example: the browser playground runs the same module
 * the same way, and it cannot import this file (it is Node).
 */
export type { ExampleRunCtx, ExampleRunOptions };
/** One `<slug>.example.ts` module's default-ish export. */
export interface Example {
    /** Matches the filename stem — it is the page's name and the golden's. */
    slug: string;
    title: string;
    /** One sentence. The page intro, when the file has no leading doc comment. */
    summary: string;
    build(): BuiltSpec | SpecDocument;
    run(ctx: ExampleRunCtx): Promise<Receipt>;
}
export interface ExampleGoldenReport {
    slug: string;
    /** There was no golden and `update` wrote the first one. */
    recorded: boolean;
    /** A golden existed, the run no longer matches it, and `update` rewrote it. */
    changed: boolean;
}
export interface ExampleDocsOptions {
    /** Directory holding `*.example.ts`. */
    dir: string;
    /** Directory holding `<slug>.golden.json`. */
    goldensDir: string;
    /** Record missing goldens and rewrite changed ones instead of failing. */
    update?: boolean;
    /** How to import an example module. See the note at the top of this file. */
    load?: (path: string) => Promise<unknown>;
}
/**
 * Build, validate, run and render every example in `dir`.
 *
 * Throws rather than reporting, in every case where a page would otherwise ship
 * a claim nobody checked: a module that exports no `example`, a slug that does
 * not match its filename, a document with a validation finding, or a run that
 * no longer matches its golden.
 */
export declare function renderExampleDocs(opts: ExampleDocsOptions): Promise<{
    pages: DocPage[];
    report: ExampleGoldenReport[];
}>;
//# sourceMappingURL=docsExamples.d.ts.map