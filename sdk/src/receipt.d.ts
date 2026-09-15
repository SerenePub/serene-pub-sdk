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
    typeId: string;
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
    /** Resolved config reference, e.g. providerRef → 'generate' (16 §5b-i). */
    resolvedRefs?: Record<string, string>;
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
    typeId: string;
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
    nodes: NodeReceipt[];
    /**
     * Run-level notes — currently only "a loop reached its declared max," which must be
     * visible: a truncated loop that returns `ok` otherwise looks like one that finished.
     */
    notes?: string[];
    /** Events core emitted as a consequence of writes in this run (01 §8). */
    emitted: Array<{
        event: string;
        cause: string;
        subscribers: number;
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
