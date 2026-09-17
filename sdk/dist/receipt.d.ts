/**
 * Receipts (01 §1, 02 §2). The first-class record of a run, and the thing the
 * whole design's explicability claim rests on.
 *
 * Deliberately absent: progress messages (F34, ephemeral) and raw embedding
 * vectors (16 §1a, recorded by reference).
 */
export type Outcome = 'ok' | 'err' | 'cancelled' | 'halt';
export interface NodeReceipt {
    nodeKey: string;
    seq: number;
    kind: string;
    definitionId: string;
    result: Outcome;
    startedAt: number;
    endedAt: number;
    elapsedMs: number;
    input?: unknown;
    output?: unknown;
    /** halt/err detail — "why did nothing happen" is otherwise unanswerable (01 §5). */
    reason?: string;
    attempts?: number;
    cacheHit?: boolean;
    blockMode?: 'sequential' | 'parallel';
    /** Which map iteration produced this entry (01 §4). */
    iteration?: number;
    timeoutMsApplied?: number;
    timedOut?: boolean;
    /**
     * The node failed, its type declares `optional`, and the run continued with
     * an empty value. `result` and `reason` still say what happened — this is
     * the flag that stops that reading as a success.
     */
    recoveredAsEmpty?: boolean;
    /** Which sampler fields the adapter honoured vs dropped (12 §2). */
    samplingApplied?: Record<string, unknown>;
    samplingIgnored?: string[];
    /** Provider only — recorded verbatim (F16). */
    request?: unknown;
    response?: unknown;
    tokens?: number;
    /**
     * What the PROMPT cost, as the service counted it — not this app's estimate.
     *
     * Beside `tokens` rather than folded into it: `tokens` is what the run SPENT
     * against its budget, and these three are what the provider REPORTED about
     * one call. Nothing here is charged to anything.
     */
    tokensPrompt?: number;
    /**
     * How much of that prompt the service served from a cached prefix.
     *
     * ⚠ **Absent is not zero.** "This connection does not report reuse" and
     * "nothing was reused" are opposite findings, and a 0 written over the first
     * tells a reader their cache is broken when the truth is that their service
     * never says. Several do not.
     */
    tokensCached?: number;
    /** Tokens WRITTEN to the cache, where a service bills the two halves apart. */
    tokensCacheWrite?: number;
    /** Resolved config reference, e.g. oracleRef → 'generate' (16 §5b-i). */
    resolvedRefs?: Record<string, string>;
    /**
     * This outlet ran in a dry run and committed nothing (R-21 (1)). Its
     * output carries a synthetic id, and the event it would have caused is
     * flagged the same way in `emitted`.
     */
    dry?: true;
    notes?: string[];
    /**
     * Script chains applied around this invocation (18 S5), one record per
     * link, in application order. `appliedBy` distinguishes the substrate
     * (executor-applied at a declared hook) from a binding invoking an
     * interior point (18 §4e). "Which of my thirty filters ate that word" is
     * answered here, per link.
     */
    scripts?: ScriptApplicationRecord[];
}
/**
 * One script link's application, as the receipt keeps it (18 S2/S4/S5).
 *
 * A failing link is tolerated, not hidden: `result: 'err'` with the reason,
 * and the chain continues — recorded exactly like an optional node's absorbed
 * failure. A stop script's `verdict` is its index; `won: true` marks the
 * earliest, which is the answer to "why did my reply cut off" (S4).
 */
export interface ScriptApplicationRecord {
    scriptId: number;
    name: string;
    /** The script kind the link was checked against — `core:script:text/transform@1`. */
    scriptKind: string;
    phase: 'before' | 'after';
    appliedBy: 'substrate' | 'binding';
    /**
     * Where the link came from when it was not the node's own chain — the
     * provenance half of 18 §4c. `connection:KoboldCpp` marks a stop guard the
     * connection carries (18 §4b), which every pipeline using that connection
     * inherits; absent means the pipeline-resolved chain. "Reply ended by
     * `connection:kobold / chatml-guard` at index 412" is this field plus S4.
     */
    via?: string;
    result: 'ok' | 'err' | 'skip';
    reason?: string;
    /** `ctx.log` lines, in order. */
    logs?: string[];
    durationMs?: number;
    /** Transforms only: whether the value actually moved. */
    changed?: boolean;
    /** Verdict operations only: the stop index this link returned. */
    verdict?: number;
    /** Verdict operations only: this link's verdict was the earliest and applied. */
    won?: boolean;
}
export interface Receipt {
    runId: string;
    specId: string;
    specVersion: string;
    schemaVersion: 1;
    seed: string;
    triggerSource: 'input' | 'event' | 'hook' | 'ui' | 'schedule';
    triggerRef?: string;
    actorUserId?: string;
    parentRunId?: string;
    rootRunId?: string;
    depth: number;
    startedAt: number;
    endedAt: number;
    outcome: Outcome;
    haltNodeKey?: string;
    haltReason?: string;
    /** Who stopped it, when an admin did (13 §3). `cancelled` is not `err`. */
    cancelledBy?: string;
    /**
     * Time spent in the admin-visible queue before dequeue (13 §3). Recorded and
     * deliberately excluded from elapsed: queue wait consumes no budget (F13) and
     * trips no timeout (F36).
     */
    queuedMs?: number;
    /**
     * True when this run halted before any effectful node and the receipt was
     * reduced to attribution only (13 §2). Default on for event-triggered runs,
     * which is where the per-message multiplier lives.
     */
    compact?: boolean;
    /** How many node rows the compaction dropped — so the count is never a mystery. */
    compactedNodeCount?: number;
    /**
     * Present when this run was a preview: it stopped at the pre-call substrate and the
     * report is what would have been sent. A preview receipt is **never compacted** — the
     * preview *is* the payload.
     */
    preview?: import('./preview.js').PreviewReport;
    /**
     * Who portrays each participant this run asked about — resolved by the
     * host **once, at run start**, and pinned here like config (R-21 (4)).
     *
     * Keyed by participant reference (`character:12` → `{ by: 'ai' }`,
     * `character:7` → `{ by: 'person', userId: '3' }`, `owner` → …). The
     * host supplies it through `RunOptions.portrayals`, before the first
     * node; nothing in the run reads or rewrites it — a member joining
     * mid-run changes the next run's answer, never this one's.
     *
     * Present exactly when the host resolved it, which is when the answer
     * means something: a run **in a session** that is **not a pre-call
     * preview** — a reply, a summarize, an event subscriber. Absent on a run
     * with no session behind it and on a preview that halts before any
     * oracle (a token count, the inspector's debug preview): nobody speaks
     * on those, so there is nobody to portray.
     */
    portrayals?: import('./participants.js').Portrayals;
    /**
     * What the run was doing when it ended badly (R-19, R-21 "optional,
     * taken"): the last status a node set — *{speaker} is typing* — and the
     * node that set it. Present only when the outcome is `halt`, `err` or
     * `cancelled`; never on `ok`, never on a preview's halt, and never as a
     * node row — statuses are ephemeral (F34) and this is the one exception.
     * The host fills `{speaker}` before the receipt is stored; the client
     * resolves the locale.
     */
    lastStatus?: import('./status.js').LastStatus;
    nodes: NodeReceipt[];
    /**
     * Run-level notes — facts about the whole run that no node row can carry.
     *
     * Two so far, and both are things that must be visible or the receipt lies by
     * omission: "a loop reached its declared max," because a truncated loop that
     * returns `ok` otherwise looks like one that finished; and "the configured
     * tokenizer could not be loaded, so budgeting fell back to an estimate,"
     * because every token figure below is then a different measurement from the
     * one the connection asked for.
     */
    notes?: string[];
    /**
     * One row per loop block that ran, and why it stopped (01 §4a).
     *
     * The note above says the same thing for the ceiling case in a sentence,
     * and a sentence is not a fact anything can switch on: "did the agent
     * finish, or did it run out of turns" is the question a tool loop's caller
     * asks, and reading it back out of prose is how a caller ends up matching
     * on wording. `iterations` counts the bodies that ran, whatever ended them.
     */
    loops?: Array<{
        clauseId: string;
        iterations: number;
        /**
         * `predicate` — the loop asked to stop. `ceiling` — the declared max
         * ended it, so the work may be unfinished. `interrupted` — the body
         * halted, errored or was cancelled, and the run's own outcome says
         * which.
         */
        stopped: 'predicate' | 'ceiling' | 'interrupted';
    }>;
    /**
     * Events core emitted as a consequence of writes in this run (01 §8).
     * `dry` marks one a dry run recorded and never dispatched.
     */
    emitted: Array<{
        event: string;
        cause: string;
        subscribers: number;
        dry?: true;
    }>;
    /** Gate decisions enter provenance; replay honours them (F15). */
    reviews?: Array<{
        nodeKey: string;
        position: string;
        action: string;
        originalHash: string;
        editedHash?: string;
        by?: string;
        at?: number;
    }>;
    consumption: {
        tokens: number;
        nodeExecutions: number;
    };
}
/** Render a receipt the way the run inspector would (17 §4). Used in tests as documentation. */
export declare function renderReceipt(r: Receipt): string;
//# sourceMappingURL=receipt.d.ts.map