/**
 * A minimal executor — enough to run a compiled document and produce a receipt.
 *
 * Not the real thing, but it enforces the laws the design says the executor owns:
 * discriminated results including halt, per-run seed, timeouts that bound execution
 * but never waiting, consumption budgets, per-kind injection, and core-emitted events.
 */
import type { SpecDocument } from './document.js';
import type { Receipt, ScriptApplicationRecord } from './receipt.js';
import { type ConfigWorld } from './config.js';
import type { CapabilityId, CapabilitySet, Grade, OptionalCapsOf } from './capabilities.js';
import { type Reviewer } from './review.js';
/**
 * The row a resolved ref slot's VALUES were read from.
 *
 * ## Why this exists
 *
 * `connection` and `sampling` are both ref slots, and `resolveSlot` returns two
 * different KINDS of thing for them: a connection resolves to a *reference*
 * (`{ id, kind, metadata }` — material is injected at call time), while sampling
 * resolves to the config's *values*, deliberately without an id, because the
 * nodes that read a sampling slot need the numbers. `core:task/context-budget@1`
 * derives the token budget from `contextTokens`, and the summarize batch cutter
 * fits a transcript into that same window.
 *
 * A host, however, does not send values — it sends a request built from a
 * `sampling_configs` ROW, so what it needs from this slot is the row id. It read
 * one off the connection slot's `{ id }` and found nothing on sampling's, which
 * a host cannot distinguish from "this node picked nothing" — so a per-node pick
 * moved the budget while the request went out on the capability default. The
 * budget was computed against one window and the prompt sent against another.
 *
 * ## Why a symbol, and why `Symbol.for`
 *
 * The values object is read by nodes, hashed into a plugin node's RNG label,
 * and written into the receipt. An ordinary key would show up in all three:
 * `Object.keys`, `JSON.stringify` and `for…in` skip symbol keys, so this is
 * invisible to every value reader while object spread — which copies own
 * enumerable symbol properties — still carries it to the host.
 *
 * `Symbol.for` rather than `Symbol()` because the registry is process-wide: two
 * copies of this module (a `dist` build and a source import, say) still agree on
 * the key. A `Symbol()` would differ between them and the reference would vanish
 * again, silently — which is the exact failure mode this whole mechanism exists
 * to end.
 *
 * ⚠ **It does not survive serialization**, by construction. That is safe only
 * because the one consumer — the host's `call` — runs in-process with the
 * binding that forwards it. Plugin node bindings receive their input across a
 * sandbox transport and get no `ctx.call`, so none of them can be on the reading
 * end today. If a plugin node ever gains the ability to dispatch, this reference
 * has to be re-projected at that transport rather than assumed to cross it.
 */
export declare const SLOT_REF: unique symbol;
/**
 * The row id carried alongside a resolved slot's values, if there is one.
 *
 * Absent means "this node named nothing" — never "the id was lost". Read through
 * this rather than by indexing the symbol, so a host never has to know how the
 * reference is attached.
 */
export declare function slotRef(value: unknown): string | number | null;
export type Result<T = unknown> = {
    kind: 'ok';
    value: T;
} | {
    kind: 'err';
    reason: string;
} | {
    kind: 'cancelled';
    reason?: string;
} | {
    kind: 'halt';
    reason: string;
};
export declare const ok: <T>(value: T) => Result<T>;
export declare const err: (reason: string) => Result<never>;
export declare const halt: (reason: string) => Result<never>;
export declare const cancelled: (reason: string) => Result<never>;
/**
 * One entry per branch, in **declaration order** — never completion order, which is
 * the same rule 11 §3 already applies to event dispatch, so the system has one
 * ordering rule rather than two.
 */
export interface BranchResult {
    branchKey: string;
    index: number;
    result: Result;
    /**
     * route blocks only (20 §10): whether this branch's predicate selected it.
     * A skipped branch publishes `halt('not selected')` with `fired: false`;
     * the union's `ok`/`values` read the fired branches. Absent on
     * async/map/loop, whose branches all ran by construction.
     */
    fired?: boolean;
}
/** What a block publishes. `main` aliases `branches` so `$ref(blockId)` works bare. */
export interface BranchResults {
    branches: BranchResult[];
    main: BranchResult[];
    /** The `ok` values in order — what a downstream fold actually wants. */
    values: unknown[];
    ok: boolean;
}
export type WriteResult = {
    status: 'committed';
    ids: Record<string, unknown>;
} | {
    status: 'pending';
    proposalId: string;
};
export declare const isCommitted: (w: WriteResult) => w is Extract<WriteResult, {
    status: 'committed';
}>;
import type { LogLevel } from './hooks.js';
export interface TaskCtx {
    /** Only present when the descriptor declares randomness — keeps Tasks pure (F11). */
    random?: () => number;
    signal: AbortSignal;
    progress(message: string): void;
    log(level: LogLevel, message: string, detail?: unknown): void;
    /**
     * This run's tokenizer, already loaded and therefore **synchronous**.
     *
     * The same function the wire measurement and the receipt use, so a binding
     * that counts a candidate and the executor that later checks whether the
     * formed payload fits are measuring with one instrument. That is the whole
     * reason it is granted rather than left to each binding: retrieval decides
     * a candidate's cost, ranking spends a budget in those units, and Assemble
     * allocates over the integers they produced — three stages that must agree,
     * and did not while each reached for `roughTokens` independently.
     *
     * Always present. It is `roughTokens` when no tokenizer was configured or
     * the configured one could not be loaded (`RunOptions.tokenizer`), never
     * absent, so a binding never needs a fallback of its own — a binding's own
     * fallback is how the two sides start disagreeing again.
     */
    countTokens(value: unknown): number;
    /**
     * The interior-point broker (18 §4e) — present **only** when the
     * descriptor declares `scriptPoints` and the host supplied an engine, the
     * `declaresRandomness` posture: which nodes can run scripts, and where, is
     * answerable from the document. The binding provides the *moment*; the
     * user's configuration provides the *content* — a point name is the only
     * thing that can be passed, never script ids, and an undeclared point
     * throws. v1 is text-only. Applications land in the receipt marked
     * `appliedBy: 'binding'`.
     */
    scripts?: {
        applyText(point: string, text: string): Promise<string>;
    };
}
export interface QueryCtx extends TaskCtx {
    read(table: string, q?: unknown): unknown;
}
export interface ProviderCtx<Caps extends CapabilityId = CapabilityId> extends TaskCtx {
    /** Material is injected here per call and never readable from config. */
    call(payload: unknown): Promise<unknown>;
    connectionMetadata: Record<string, unknown>;
    sampling: Record<string, unknown>;
    reportUsage(tokens: number): void;
    reportSampling(applied: Record<string, unknown>, ignored: string[]): void;
    /**
     * What the provider REPORTED about this call's prompt, as opposed to what
     * the run spent on it (`reportUsage`).
     *
     * ⚠ **Recording only.** Nothing here is charged to the budget, nothing is
     * reordered, and a binding that calls this has changed no request. It exists
     * so "is the prompt caching I am paying for actually happening" has an
     * answer on the receipt instead of nowhere.
     *
     * ⚠ **Pass only the numbers the service actually gave.** An absent field
     * stays absent on the receipt: "does not report reuse" and "reused nothing"
     * are opposite findings and a zero collapses them.
     *
     * Optional so that an older host, and every hand-built ctx in a test, is
     * still a `ProviderCtx` — the binding calls it as `ctx.reportCacheUsage?.()`.
     */
    reportCacheUsage?(usage: {
        prompt?: number;
        cached?: number;
        cacheWrite?: number;
    }): void;
    /**
     * Is this capability available on the connection actually bound?
     *
     * Returns the GRADE rather than a boolean, so a binding can tell "the API
     * does this itself" from "we are emulating it" — the two have different costs
     * and sometimes different output. `false` means no, and 0 never escapes as a
     * grade, so a plain truthiness test is correct.
     *
     * A grade is read against the capability's own bands (`topGrade(id)` is its
     * best), never against a global scale: `1` is a middling `tools` and the very
     * best `text->image` there is.
     *
     * **Only the ids this node declared `optional` are askable.** A `requires` id
     * is guaranteed by the time a binding runs — asking would be dead code — and
     * an undeclared id is a question the node has no business asking, so both are
     * compile errors when the binding is written through `providerBinding()`.
     *
     * The fallback is the author's to write. That is the ruling: the type system
     * makes absence impossible to *forget about*, and what to do instead is a
     * decision only the author can make.
     */
    can(id: Caps): Grade | false;
}
export interface ConsumerCtx extends TaskCtx {
    commit(payload: unknown): Promise<Record<string, unknown>>;
    emit(handle: string, payload: unknown): void;
}
export type Hook = (input: any, ctx: any) => Result | Promise<Result>;
/**
 * A Provider binding, with `ctx.can()` narrowed to what its own type declared.
 *
 * The one hop that matters. `pin` already carries the descriptor's literal type
 * through, so reading `optional` off it here is enough — there is no need to
 * thread capability generics through a catalog and a binding map, and every hop
 * that does not exist is a hop that cannot silently widen to `string` and take
 * the safety with it.
 *
 * ```ts
 * providerBinding(C.generateText, async (input, ctx) => {
 *   ctx.can('json_schema')   // ✅ declared optional on the connection slot
 *   ctx.can('grammar')       // ❌ compile error — this node never declared it
 * })
 * ```
 */
export declare function providerBinding<D extends {
    slots?: Record<string, {
        optional?: readonly CapabilityId[];
    }>;
}>(_type: {
    descriptor: D;
}): (fn: (input: any, ctx: ProviderCtx<OptionalCapsOf<D['slots']>>) => Result | Promise<Result>) => Hook;
export interface Bindings {
    [typeIdAtVersion: string]: Hook;
}
export declare function seededRandom(seed: string): () => number;
/**
 * One node invocation, starting or settling. Identity only — no payloads, no
 * values: this exists so a progress card can say "step 3 of 7 · drafting",
 * and anything richer belongs to the receipt.
 */
export interface NodeEvent {
    phase: 'start' | 'end';
    nodeKey: string;
    typeId: string;
    kind: string;
    /** Invocations begun so far — a done-count, monotonic within the run. */
    seq: number;
    /**
     * Nodes the document declares. A floor, not a total: map fan-out adds
     * invocations at runtime, so `seq` may legitimately pass it.
     */
    declared: number;
    iteration?: number;
    /** Present on `end`. */
    result?: Result['kind'];
}
/**
 * One declared hook, as the applier sees it: the address, the phase, and the
 * declaration's attachment rule. The executor computes this from the type's
 * `scripts` slot; the applier never reads a descriptor.
 */
export interface ScriptHookSite {
    nodeKey: string;
    typeId: string;
    slot: string;
    phase: 'before' | 'after';
    port: string;
    accepts: string[];
    extras: string[];
    /**
     * Who triggered the application: the executor at a declared port hook
     * (`substrate`, the default), or a binding invoking a declared interior
     * point through `ctx.scripts` (`binding`, 18 §4e). The applier records it
     * per link, so hook interiors letting user policy in stay visible.
     */
    origin?: 'substrate' | 'binding';
}
export interface ScriptChainOutcome {
    value: unknown;
    applications: ScriptApplicationRecord[];
}
/**
 * The host's script engine, behind a seam (18 §4a, §7).
 *
 * The executor owns *where* chains apply — the substrate placement that keeps
 * a binding unable to see or decline one — and the host owns *how* a script
 * runs, because the sandbox is an engine choice the SDK must not embed. The
 * contract the applier must keep is 18's law set: a failing link degrades
 * (S2 — skip it, record `err`, continue), transforms fold in order, verdicts
 * reduce to the earliest index, and every link comes back as an application
 * record whatever happened. A *thrown* applier is treated as engine failure:
 * the value passes through unchanged and the failure is recorded — a broken
 * engine must never cost somebody their reply, and must never vanish either.
 */
export type ScriptChainApplier = (site: ScriptHookSite, 
/** The resolved slot value — an ordered list of script row ids. */
chain: unknown, 
/** The current value at the site's port. */
value: unknown) => Promise<ScriptChainOutcome>;
export interface RunOptions {
    input: unknown;
    bindings: Bindings;
    world?: ConfigWorld;
    seed?: string;
    runId?: string;
    triggerSource?: Receipt['triggerSource'];
    triggerRef?: string;
    actorUserId?: string;
    /** Instance ceiling — config may not exceed it (F36). */
    timeoutCeilingMs?: number;
    /** Force every block sequential, as an admin may (01 §4). */
    forceSequential?: boolean;
    budget?: {
        tokens?: number;
        nodeExecutions?: number;
    };
    /** Which subscribers core would dispatch to, for the emitted record. */
    subscribers?: Record<string, number>;
    /** Simulated wait — never counted against a timeout (01 §5). */
    now?: () => number;
    /** Host-supplied review resolver. `sync` parks on it; waiting is free (F13). */
    reviewer?: Reviewer;
    /**
     * Host-supplied script engine (18 §4a). Absent means no chains apply —
     * a host that has not built the sandbox runs every spec exactly as before,
     * which is what makes this seam additive.
     */
    applyScripts?: ScriptChainApplier;
    /**
     * Node lifecycle observation, for progress display and nothing else.
     *
     * Fired as each node's invocation starts and again when it settles, with
     * enough identity to drive a progress card — never the payload. Progress is
     * not a second receipt: it carries no values, it is not recorded, and a
     * host that wants what ran reads the receipt afterwards (F34). Inherent to
     * every run rather than wired per trigger, which is what lets any UI show
     * "step 3 of 7" without knowing what the pipeline does.
     */
    onNode?: (event: NodeEvent) => void;
    /**
     * Time this run sat in the admin-visible queue before being dequeued (13 §3).
     * Recorded, and deliberately **not** added to any elapsed figure: queue wait
     * consumes no budget (F13) and trips no timeout (F36) — a run's clock starts
     * when it is dequeued.
     */
    queuedMs?: number;
    /**
     * Checked between nodes. Returning a value stops the run as `cancelled`, with the
     * actor recorded — so "an admin stopped it" stays distinguishable from "it broke",
     * which is why there are four result kinds rather than three (13 §3).
     */
    cancelSignal?: () => {
        by: string;
        reason: string;
    } | undefined;
    /**
     * Compact a receipt that halts before any effectful node: trigger, spec version,
     * halt node/reason and elapsed, with no payloads and no node rows (13 §2).
     *
     * Defaults to on **for event-triggered runs only**. That is where the multiplier
     * lives — a hot event × every subscribed pipeline × every message, where most
     * subscribers halt immediately and that is success (01 §5). A run someone started
     * by clicking happens once per click and keeps its full detail.
     */
    compactHaltReceipts?: boolean;
    /**
     * Debug mode in chat: run normally, then **halt at the pre-call substrate** instead of
     * invoking the Provider — after the input resolves and the payload is formed, so the
     * numbers shown are the numbers that would have been sent (src/preview.ts).
     *
     * `true` stops at the first Provider **on the spine**; pass `atNode` to override. The
     * preview costs whatever ran before it, including the embedding call inside the gather
     * block — a preview that skipped retrieval would show a context nobody would get.
     */
    preview?: boolean | {
        atNode?: string;
    };
    /**
     * Which tokenizer this run budgets with — an **id**, not a function.
     *
     * The id core stores on the connection (`connections.token_counter`), passed
     * through unchanged. `run` resolves it before the clock starts: loading is
     * asynchronous and happens once, here; counting is synchronous everywhere
     * after, which is what lets the allocation and wire-measurement loops stay
     * loops (see `src/tokenizers.ts` for why that split is the whole design).
     *
     * An id nobody registered a loader for, or one whose loader throws, degrades
     * to `roughTokens` and says so in `receipt.notes`. A tokenizer never fails a
     * run.
     */
    tokenizer?: string;
    /**
     * A counter supplied directly, bypassing `tokenizer`.
     *
     * Predates `tokenizer` and still honoured, because a test that wants a
     * deterministic count should not have to register a loader to get one — the
     * SDK's own preview suite passes a counter that returns 999_999 for objects
     * precisely to prove the wire measurement is what the receipt reports.
     *
     * **Wins when both are given.** An explicit function is a more specific
     * instruction than an id to look up, and the precedence has to be stated
     * somewhere rather than discovered. A host should pass `tokenizer`: an id is
     * a fact that lands in configuration and in the receipt, where a closure is
     * neither.
     */
    countTokens?: (v: unknown) => number;
    /**
     * The host's I/O, injected into the per-kind contexts (see `HostServices`).
     *
     * Absent, every service is the in-memory stand-in this draft has always used —
     * which is what keeps the SDK's own suite hermetic. Present, a Query's `read`
     * reaches a real database and a Consumer's `commit` writes a real row.
     */
    host?: HostServices;
}
/**
 * What only the host can do.
 *
 * The executor owns *sequencing*; it has never owned *I/O*, and the split is why the
 * same executor can run in an author's test with no database and in core against a
 * live one. Until this existed, core's only way to reach a database from a binding was
 * to close over a connection — which works, and quietly moves the effect outside the
 * substrate that the review gate, the budget and the receipt all sit in.
 *
 * So the shape here is deliberate: **a binding describes the effect and the host
 * performs it.** A Consumer returns what it wants written, and `commit` writes it. That
 * is already how a sidecar Consumer has to work (F19 — no DB channel across a process
 * boundary), and having in-process and out-of-process Consumers obey the same rule
 * means the review gate sees the same thing in both cases: a payload, before anything
 * happened.
 */
export interface HostServices {
    /** Scoped read for a Query. The node is passed so the host can enforce scope (F30). */
    read?(table: string, query: unknown, node: NodeRef): unknown | Promise<unknown>;
    /** Perform a Consumer's described write and return the row identity. */
    commit?(payload: unknown, node: NodeRef): Promise<Record<string, unknown>>;
    /** Dispatch a Provider call. Credentials are injected here and never readable (F18). */
    call?(payload: unknown, node: NodeRef): Promise<unknown>;
    /** Core emits; a node only names the handle (F8). */
    emit?(handle: string, payload: unknown, node: NodeRef): void;
    /**
     * Connection **metadata** for a Provider — readable. Material is never returned
     * here; it is applied inside `call` and never crosses into a binding (F18).
     */
    connection?(node: NodeRef): {
        metadata?: Record<string, unknown>;
        sampling?: Record<string, unknown>;
        /**
         * What the bound connection can actually do — the resolved set, never the
         * declaration. Readable like `metadata` and for the same reason: a binding
         * has to be able to take a different path when a capability is absent, and
         * it cannot do that from a fact it is not told.
         */
        capabilities?: CapabilitySet;
    };
}
export interface NodeRef {
    key: string;
    typeId: string;
    typeVersion: number;
    kind: string;
}
export declare function run(doc: SpecDocument, opts: RunOptions): Promise<Receipt>;
/** replay(receipt) — deterministic, never re-infers (F16). */
export declare function replay(doc: SpecDocument, receipt: Receipt, bindings: Bindings): Promise<Receipt>;
//# sourceMappingURL=executor.d.ts.map