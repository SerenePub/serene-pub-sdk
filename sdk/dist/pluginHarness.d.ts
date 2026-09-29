/**
 * The **plugin sandbox's context, in the author's harness** (plans 29 §14 D-3).
 *
 * The SDK's executor builds a node's context itself — `{ signal, progress,
 * status, log, countTokens }`, plus `read` for a Query, `call` for an Oracle and
 * `commit` for an Outlet. That is the context a **core** handler runs against,
 * and it is *not* the one a **plugin's** handler ever sees. At install a
 * plugin's node handlers do not go through that path at all: the app's
 * `pipelines/runtime/pluginBindings.ts` calls `RuntimeManager.callHook`, which
 * runs the hook inside the plugin's sandbox against a context the sandbox
 * builds — `{ random, now, log, storage, fetch, signal }` — and commits its rows
 * afterwards.
 *
 * Two packages paid for that gap before it was written down:
 *
 *  - **Twenty Questions shipped a dead Query.** Its `ctx.read` worked in the
 *    harness, because the executor endows `read` for every Query whoever wrote
 *    it. No sandbox endows it, so the query would have read nothing at install.
 *  - **Battleship had to write its own fake store.** Nothing in the harness
 *    endows `ctx.storage`, so a package whose whole point is that one handler
 *    reads back what another wrote could not run its own handlers without
 *    hand-wrapping every binding.
 *
 * So this module endows the *sandbox's* surface, and endows **only** that: a
 * plugin Query's `ctx.read` is `undefined` here exactly as it is at install, and
 * a test written against it fails the way the install would. The executor's own
 * conveniences — `progress`, `status`, `countTokens`, `iteration`, `scripts` —
 * are absent for the same reason: no sandbox has ever defined them.
 *
 * ⚠ **Not the real sandbox.** No opaque origin, no worker, no QuickJS, no
 * membrane; the handler runs in this process with ordinary references. What is
 * reproduced is the *shape* — which members exist, which are withheld, what a
 * refusal says, and where the randomness and the clock come from — because that
 * is what a handler can be written against and get wrong.
 */
import { type Bindings, type Result } from './executor.js';
import type { HookFetchInit, HookFetchResponse } from './hooks.js';
import type { ExtensionStorage } from './storage.js';
import { type HookCtxGrants, type HookCtxKind } from './hookGrants.js';
export { HOOK_CTX_KINDS, hookCtxGrants, hookCtxKeysFor, isHookCtxKind, type HookCtxGrants, type HookCtxKind } from './hookGrants.js';
/**
 * The sandbox's RNG — xfnv1a over the seed label, then mulberry32.
 *
 * ⚠ **Not `seededRandom`.** The executor's RNG (executor.ts) is a different
 * algorithm over a different seed, and the two produce different streams from
 * the same word. That is a fact about the two codebases, not a design: a plugin
 * handler's rolls come from the *sandbox's* stream, so a golden over a handler
 * that rolls is only reproducible against this one. Kept byte-for-byte in step
 * with `buildProgram` in the app's `QuickJsSandbox.ts` / `SesWorkerSandbox.ts`.
 * @experimental
 */
export declare function pluginSeededRandom(label: string): () => number;
/**
 * djb2 over the serialized input — the app's per-call address, so the seed
 * label a harness composes is the label an install composes (`pluginBindings.ts`).
 * @experimental
 */
export declare function inputDigest(v: unknown): string;
/**
 * The seed label a plugin node handler's RNG is derived from, as the app
 * composes it: the run seed, the pin, and a digest of the exact input — so
 * replays roll the same and two same-typed nodes in one run (or one node under
 * `each`) get distinct streams without depending on completion order.
 * @experimental
 */
export declare const nodeSeedLabel: (seed: string, pin: string, input: unknown) => string;
/** The prelude's `__fmtLog`: `[level] message detail…`, or `[log] …`. @experimental */
export declare function formatHookLog(args: unknown[]): string;
/**
 * The row half of the grant, as a fraction of it — mirrors `rowQuotaFor` in the
 * app's `storageHost.ts`, which is the arithmetic the sandbox actually applies.
 * Rows live in the database and files on disk; one budget is what an author can
 * reason about, and the sub-cap is what stops a plugin putting megabytes in the
 * database.
 * @experimental
 */
export declare function rowQuotaFor(quotaBytes: number): number;
/** The grant a sandbox falls back to when the manifest declares none. @experimental */
export declare const DEFAULT_STORAGE_QUOTA_BYTES: number;
/**
 * The clock this harness pins when a caller names none.
 *
 * Deliberately the same instant as `EXAMPLE_CLOCK` in `testing.ts`, so a
 * handler run inside an executed example and the same handler run in a unit
 * test report the same `ctx.now()` — a golden that moved between the two would
 * be a golden nobody keeps. Defined here rather than imported because
 * `testing.ts` re-exports this module, and a test pins that the two agree.
 * @experimental
 */
export declare const HARNESS_CLOCK = 1700000000000;
/** @experimental */
export interface MemoryStorageOptions {
    /** The grant, in bytes. The sandbox's own fallback by default. */
    quotaBytes?: number;
    /** The sub-cap on the row half. Derived from `quotaBytes` by default. */
    rowQuotaBytes?: number;
    /** Rows to start with, for a test that wants a game already in progress. */
    seed?: Record<string, unknown>;
    /**
     * The call's pinned clock, which is what stamps a row's `updatedAt`.
     *
     * Pinned, not ticking, because that is what install does: the sandbox stamps
     * every row a call writes with the run's clock, so rows written in one call
     * share a timestamp and `query({ order: 'newest' })` falls back to key order
     * among them. A test that wants distinct stamps supplies a clock that moves.
     */
    now?: () => number;
}
/** @experimental */
export interface MemoryStorage extends ExtensionStorage {
    /** Every key currently held with its value, key-sorted — for asserting on the shape of the store. */
    snapshot(): Record<string, unknown>;
    /** How many times `put` has been called. A cheap way to pin "this handler wrote once". */
    readonly writes: number;
}
/**
 * An in-memory `ExtensionStorage` — the half the SDK's harness cannot otherwise
 * supply, with the refusals install actually makes.
 *
 * Faithful in the ways a handler can depend on: `get` answers `undefined` for a
 * key nobody wrote; a row costs its key as well as its value; a write past the
 * row budget or the whole grant comes back as `err` rather than throwing, and
 * comes back **whole** so a handler that prunes and retries can; a key that is
 * not a key, and a value JSON cannot carry, throw with the sandbox's sentence.
 *
 * ⚠ Not faithful about: transactions (install commits a call's rows together,
 * this writes as it goes), the database, and the bytes a row costs on disk.
 * What it does reproduce is the one property a package like Battleship exists
 * to demonstrate — a row one handler writes is a row the next handler reads.
 *
 * **Isolation is structural.** One call is one namespace; two plugins get two
 * calls and neither can name the other's keys, because there is no shared map
 * to name them in.
 * @experimental
 */
export declare function memoryStorage(opts?: MemoryStorageOptions): MemoryStorage;
/** What `ctx.fetch` answers with once the allowlist has let a call through. @experimental */
export type HookFetchAnswer = (url: string, init?: HookFetchInit) => HookFetchResponse | Promise<HookFetchResponse>;
/**
 * What a plugin's handler is handed — the sandbox's six, no more.
 *
 * `storage` and `fetch` are optional here for the reason they are absent there:
 * a member a kind is not granted is **absent**, not a stub that refuses, so
 * `Object.keys(ctx)` says exactly what the hook may reach.
 * @experimental
 */
export interface PluginHandlerContext {
    /** Seeded from the run seed (`pluginSeededRandom`). Never `Math.random`. */
    random(): number;
    /** The run's clock, pinned. Two calls in one run return the same number. */
    now(): number;
    log(...args: unknown[]): void;
    storage?: ExtensionStorage;
    fetch?(url: string, init?: HookFetchInit): Promise<HookFetchResponse>;
    signal: AbortSignal;
}
/** @experimental */
export interface PluginHandlerContextOptions {
    /** The extension's address, for the sentences a refusal writes. */
    pluginId: string;
    /**
     * The RNG's seed label. `pluginNodeBindings` composes the app's
     * (`nodeSeedLabel`); a test calling this directly passes whatever it wants
     * to be able to reproduce.
     */
    seed?: string;
    /** The hook kind, which decides the grants (R-3). Omitted: both granted. */
    kind?: HookCtxKind;
    /** Override the kind's grants — for pinning what a handler does without one. */
    grants?: Partial<HookCtxGrants>;
    /** The extension's store. A fresh `memoryStorage()` when the grant holds and none is given. */
    storage?: ExtensionStorage;
    /** The pinned clock, in milliseconds. */
    now?: number;
    signal?: AbortSignal;
    /** The hosts the manifest declares under `permissions.network.hosts`. */
    network?: readonly string[];
    /** What an allowed call answers with. Absent: an allowed call still refuses, and says so. */
    fetch?: HookFetchAnswer;
    /** Where `ctx.log` lines land, formatted as the sandbox prelude formats them. */
    logs?: string[];
}
/**
 * Build the context a plugin's handler runs against at install.
 *
 * The one-liner `examples/fixtures.ts` in a plugin repo should not have to
 * write: pass it to a handler and the handler sees what the sandbox gives it,
 * including the absences.
 * @experimental
 */
export declare function pluginHandlerContext(opts: PluginHandlerContextOptions): PluginHandlerContext;
/** A plugin's node handler: `(input, ctx)`, with the sandbox's ctx. @experimental */
export type PluginNodeHandler = (input: any, ctx: PluginHandlerContext) => Result | Promise<Result>;
/** @experimental */
export interface PluginNodeBindingOptions {
    /** The extension's address — one store, one seed namespace, one set of grants. */
    pluginId: string;
    /** `definitionId@version` → the handler the manifest's `nodeDefinitions` names. */
    handlers: Record<string, PluginNodeHandler>;
    /**
     * The extension's store, shared by every handler below — which is the whole
     * point: one plugin is one namespace, so a row `place` writes is a row
     * `fire` reads. A fresh `memoryStorage()` when none is given.
     */
    storage?: ExtensionStorage;
    /** The run seed the RNG labels derive from. */
    seed?: string;
    /** The pinned clock. */
    now?: number;
    network?: readonly string[];
    fetch?: HookFetchAnswer;
    logs?: string[];
    /**
     * The hook ctx kind per pin, for a definition this process has not
     * registered. A registered one is read off its descriptor, which is the
     * answer install reads off the registry row.
     */
    kinds?: Record<string, HookCtxKind>;
}
/**
 * Project a plugin's handlers into executor bindings that run them against the
 * **sandbox's** context — the harness's counterpart of the app's
 * `pluginNodeBindings` (`pipelines/runtime/pluginBindings.ts`), which does the
 * same projection over a real sandbox.
 *
 * The executor's own context reaches the handler in exactly one respect: its
 * `signal`, because at install the host fires the sandbox's abort from the same
 * place. Everything else it built — `read`, `call`, `commit`, `progress`,
 * `status`, `countTokens` — is dropped, because no sandbox has ever endowed it.
 * A plugin Query reaching for `ctx.read` therefore fails here exactly as it
 * fails at install, which is the whole reason this exists (G13).
 * @experimental
 */
export declare function pluginNodeBindings(opts: PluginNodeBindingOptions): Bindings;
//# sourceMappingURL=pluginHarness.d.ts.map