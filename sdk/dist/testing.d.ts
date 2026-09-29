/**
 * `@serene-pub/sdk/testing` — the harness a **plugin author** runs (03 §9, U11).
 *
 * Distinct from `src/conformance.ts`, which is what **SP Core** runs against its own
 * executor. Two different audiences and two different questions:
 *
 *   conformance.ts — "does this host obey the laws?"
 *   testing.ts     — "does my hook behave, and did my change alter what gets sent?"
 *
 * The second question is the one that keeps a plugin working across SP releases, and it
 * is answered by goldens: record a receipt now, compare later, and see the diff rather
 * than a pass/fail. **"It still runs" is not the assertion anyone needs** — a plugin that
 * runs and quietly changes the prompt is the failure mode that reaches users.
 */
import type { Receipt } from './receipt.js';
import type { SpecDocument } from './document.js';
import type { Bindings, RunOptions } from './executor.js';
import type { Descriptor } from './descriptors.js';
/**
 * The plugin sandbox's context, in this harness (plans 29 §14 D-3) — the half
 * the executor cannot supply, because a plugin's node handlers never run
 * against the executor's context at install. Re-exported here so an author's
 * one import is `@serene-pub/sdk/testing`.
 */
export * from './pluginHarness.js';
/** @experimental */
export interface Golden {
    name: string;
    specId: string;
    specVersion: string;
    seed: string;
    outcome: Receipt['outcome'];
    haltReason?: string;
    /** Per node: what went in and what came out. Timings are excluded on purpose. */
    nodes: Array<{
        nodeKey: string;
        kind: string;
        result: string;
        input?: unknown;
        output?: unknown;
    }>;
    emitted: Array<{
        event: string;
        cause: string;
    }>;
    /** The payload a preview run would have sent, when there is one. */
    wire?: unknown;
}
/**
 * Reduce a receipt to what a golden should hold.
 *
 * Timings, run ids and wall-clock are all excluded — a golden that fails because a run
 * took 3ms instead of 2ms is a golden nobody keeps. What is kept is every decision and
 * every payload, which is what actually changes when a plugin's behaviour changes.
 * @experimental
 */
export declare function toGolden(name: string, r: Receipt): Golden;
/** @experimental */
export interface GoldenDiff {
    path: string;
    before: unknown;
    after: unknown;
}
/** A structural diff, deepest-path-first, so the first line names the actual change. @experimental */
export declare function diffGolden(before: Golden, after: Golden): GoldenDiff[];
/** @experimental */
export declare function renderDiff(d: GoldenDiff[]): string;
/** @experimental */
export declare class GoldenMismatch extends Error {
    readonly name: string;
    readonly diff: GoldenDiff[];
    constructor(name: string, diff: GoldenDiff[]);
}
/** Record if absent, compare if present. The whole workflow in one call. @experimental */
export declare function checkGolden(name: string, r: Receipt, stored?: Golden): {
    golden: Golden;
    recorded: boolean;
};
/** @experimental */
export interface BindingProbe {
    id: string;
    title: string;
    consequence: string;
    check(hook: (input: any, ctx: any) => any, d: Descriptor, ctx: ProbeCtx): Promise<void> | void;
}
/** @experimental */
export interface ProbeCtx {
    sampleInput: unknown;
    /** A context object shaped like the one the executor injects for this kind. */
    makeCtx(over?: Record<string, unknown>): any;
}
/**
 * What a hook has to do to be a hook. Run these in your own tests — the executor assumes
 * all of it, and a hook that breaks one of them fails in a way that is hard to attribute.
 * @experimental
 */
export declare const BINDING_PROBES: BindingProbe[];
/** @experimental */
export interface ProbeResult {
    id: string;
    title: string;
    pass: boolean;
    error?: string;
    consequence?: string;
}
/** @experimental */
export declare function probeBinding(hook: (input: any, ctx: any) => any, descriptor: Descriptor, ctx: ProbeCtx): Promise<ProbeResult[]>;
/** A context shaped like the executor's, per kind — so a probe tests the real surface. @experimental */
export declare const probeCtxFor: (kind: Descriptor['kind'], sampleInput?: unknown) => ProbeCtx;
/**
 * The seed and the clock an executed example runs on.
 *
 * Fixed, and fixed *here* rather than per example: two runs of the same page
 * have to produce the same bytes or the golden is noise, and a seed chosen by
 * each example is a seed one of them forgets to choose. Everything a receipt
 * records that moves on its own — run id, timestamps, durations — is either
 * excluded by `toGolden` or never rendered by `renderRunSummary`.
 *
 * They live in the SDK rather than in the docs generator because the generator
 * is not the only thing that runs an example any more: the browser playground
 * runs the same module against the same seed, and a reader who compares what
 * they just ran against the page has to be comparing the same run.
 * @experimental
 */
export declare const EXAMPLE_SEED = "seed:example";
/** @experimental */
export declare const EXAMPLE_CLOCK = 1700000000000;
/** Everything `run` takes except the two things the harness decides. @experimental */
export type ExampleRunOptions = Omit<RunOptions, 'seed' | 'now'>;
/**
 * What an example's `run()` is handed: its own compiled document, and the way
 * to execute it deterministically. Deliberately small — the fixture host itself
 * (bindings, scope data) is the example's own import, because a reader of the
 * page has to be able to see which hooks answered.
 * @experimental
 */
export interface ExampleRunCtx {
    /** This example's document — already compiled from `build()` and validated. */
    doc: SpecDocument;
    /** The run seed. Passed for the example to show; `run` applies it regardless. */
    seed: string;
    /** The run clock, for the same reason. */
    now: () => number;
    /** Execute `doc` under this seed and clock. Everything else is the example's. */
    run(opts: ExampleRunOptions): Promise<Receipt>;
}
/** The context an executed example runs against. Seed and clock default to the fixed pair. @experimental */
export declare function makeExampleRunCtx(doc: SpecDocument, opts?: {
    seed?: string;
    now?: () => number;
}): ExampleRunCtx;
/**
 * A receipt as a page shows it: what ran, in order, and how each step ended.
 *
 * Not `renderReceipt`, which is the run inspector's rendering and carries the
 * run id, the elapsed times and the wall clock. Every one of those moves
 * between two identical runs, and a page that changed on every build would
 * teach a reader to ignore it. What is left is what the run DECIDED — which is
 * the only part worth pinning.
 * @experimental
 */
export declare function renderRunSummary(r: Receipt): string;
/**
 * F26 as a one-liner an author can run: parallel and forced-sequential must produce the
 * same result. If your hook has a hidden ordering dependency, this is where it shows up
 * — not in a user's chat at 2am under load.
 * @experimental
 */
export declare function assertEquivalent(doc: SpecDocument, opts: RunOptions): Promise<void>;
/** Run the same spec twice on one seed and assert nothing moved (F11). @experimental */
export declare function assertDeterministic(doc: SpecDocument, opts: RunOptions & {
    seed: string;
}): Promise<void>;
/** @experimental */
export declare function renderProbes(results: ProbeResult[]): string;
export type { Bindings };
//# sourceMappingURL=testing.d.ts.map