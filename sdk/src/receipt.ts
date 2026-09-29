/**
 * Receipts (01 §1, 02 §2). The first-class record of a run, and the thing the
 * whole design's explicability claim rests on.
 *
 * Deliberately absent: progress messages (F34, ephemeral) and raw embedding
 * vectors (16 §1a, recorded by reference).
 */

import { renderPreview } from './preview.js'
import { renderStatusText } from './status.js'
import type { ScopeKind } from './config.js'

/** @experimental */
export type Outcome = 'ok' | 'err' | 'cancelled' | 'halt'

/** @experimental */
export interface NodeReceipt {
	nodeKey: string
	seq: number
	kind: string
	definitionId: string
	result: Outcome
	startedAt: number
	endedAt: number
	elapsedMs: number
	input?: unknown
	output?: unknown
	/** halt/err detail — "why did nothing happen" is otherwise unanswerable (01 §5). */
	reason?: string
	attempts?: number
	cacheHit?: boolean
	blockMode?: 'sequential' | 'parallel'
	/** Which map iteration produced this entry (01 §4). */
	iteration?: number
	timeoutMsApplied?: number
	timedOut?: boolean
	/**
	 * The node failed, its type declares `optional`, and the run continued with
	 * an empty value. `result` and `reason` still say what happened — this is
	 * the flag that stops that reading as a success.
	 */
	recoveredAsEmpty?: boolean
	/** Which sampler fields the adapter honoured vs dropped (12 §2). */
	samplingApplied?: Record<string, unknown>
	samplingIgnored?: string[]
	/** Provider only — recorded verbatim (F16). */
	request?: unknown
	response?: unknown
	tokens?: number
	/**
	 * What the PROMPT cost, as the service counted it — not this app's estimate.
	 *
	 * Beside `tokens` rather than folded into it: `tokens` is what the run SPENT
	 * against its budget, and these three are what the provider REPORTED about
	 * one call. Nothing here is charged to anything.
	 */
	tokensPrompt?: number
	/**
	 * How much of that prompt the service served from a cached prefix.
	 *
	 * ⚠ **Absent is not zero.** "This connection does not report reuse" and
	 * "nothing was reused" are opposite findings, and a 0 written over the first
	 * tells a reader their cache is broken when the truth is that their service
	 * never says. Several do not.
	 */
	tokensCached?: number
	/** Tokens WRITTEN to the cache, where a service bills the two halves apart. */
	tokensCacheWrite?: number
	/** Resolved config reference, e.g. oracleRef → 'generate' (16 §5b-i). */
	resolvedRefs?: Record<string, string>
	/**
	 * Which layer each of this node's config values won at, per slot, per
	 * path: `configLayers.params.weight === 'session'`. The same answer the
	 * resolver computes (`ResolvedSource.scopeKind`) and the config panel shows,
	 * kept rather than discarded — *"I changed this and nothing happened"* is
	 * answered by the row that ran. Values only; the layer's owner
	 * (`scopeId`) is not recorded.
	 *
	 * Absent on a receipt written before 2026-09-26, and on a node with no
	 * resolved config at all. A path absent here was never resolved: the
	 * binding read its own fallback.
	 * @experimental 🚧
	 */
	configLayers?: Record<string, Record<string, ScopeKind>>
	/**
	 * Whether `definitionId` is the spec's **pin** or a **swap**, and who
	 * seated the swap. `null` — the pin ran. A `NodeSwap` — the host seated
	 * another definition (`RunOptions.swaps`) and `pin` names the one it
	 * replaced. Absent when the host did not say (`RunOptions.swaps` left
	 * out), which includes every receipt written before 2026-09-26.
	 * @experimental 🚧
	 */
	swap?: NodeSwap | null
	/**
	 * This outlet ran in a dry run and committed nothing (R-21 (1)). Its
	 * output carries a synthetic id, and the event it would have caused is
	 * flagged the same way in `emitted`.
	 */
	dry?: true
	notes?: string[]
	/**
	 * Script chains applied around this invocation (18 S5), one record per
	 * link, in application order. `appliedBy` distinguishes the substrate
	 * (executor-applied at a declared hook) from a binding invoking an
	 * interior point (18 §4e). "Which of my thirty filters ate that word" is
	 * answered here, per link.
	 */
	scripts?: ScriptApplicationRecord[]
}

/**
 * A swap a host seated on one node before the run (`RunOptions.swaps`): the
 * definition that ran is the receipt row's `definitionId`, this names the pin
 * it replaced and the scope whose choice it was.
 * @experimental 🚧
 */
export interface NodeSwap {
	/** The pin the spec names, `id@version`. */
	pin: string
	/** Whose swap: a session's choice, or the instance's. */
	by: 'session' | 'instance'
}

/**
 * How the host reached the spec it ran, when that is worth saying — today,
 * one fact: a session preset named a spec for this event that could not
 * serve, so a lower layer chose it (`via: 'fallback'`). Stamped by the host
 * (`RunOptions.meta`), never by the executor, which cannot know it.
 * @experimental 🚧
 */
export interface ReceiptPresetRoute {
	via: 'fallback'
	presetId: number
	/** The session preset's name. */
	preset: string
	event: string
	/** The spec the preset still names. */
	bound: string
	/** Why it does not resolve, as a sentence. */
	reason: string
}

/**
 * Host facts about how a run was reached (`Receipt.meta`). Open: a host may
 * record a further fact under its own key; `preset` is the one typed here.
 * @experimental 🚧
 */
export interface ReceiptMeta {
	preset?: ReceiptPresetRoute
	[key: string]: unknown
}

/**
 * One script link's application, as the receipt keeps it (18 S2/S4/S5).
 *
 * A failing link is tolerated, not hidden: `result: 'err'` with the reason,
 * and the chain continues — recorded exactly like an optional node's absorbed
 * failure. A stop script's `verdict` is its index; `won: true` marks the
 * earliest, which is the answer to "why did my reply cut off" (S4).
 * @internal
 */
export interface ScriptApplicationRecord {
	scriptId: number
	name: string
	/** The script kind the link was checked against — `core:script:text/transform@1`. */
	scriptKind: string
	phase: 'before' | 'after'
	appliedBy: 'substrate' | 'binding'
	/**
	 * Where the link came from when it was not the node's own chain — the
	 * provenance half of 18 §4c. `connection:KoboldCpp` marks a stop guard the
	 * connection carries (18 §4b), which every pipeline using that connection
	 * inherits; absent means the pipeline-resolved chain. "Reply ended by
	 * `connection:kobold / chatml-guard` at index 412" is this field plus S4.
	 */
	via?: string
	result: 'ok' | 'err' | 'skip'
	reason?: string
	/** `ctx.log` lines, in order. */
	logs?: string[]
	durationMs?: number
	/** Transforms only: whether the value actually moved. */
	changed?: boolean
	/** Verdict operations only: the stop index this link returned. */
	verdict?: number
	/** Verdict operations only: this link's verdict was the earliest and applied. */
	won?: boolean
}

/** @experimental */
export interface Receipt {
	runId: string
	specId: string
	specVersion: string
	schemaVersion: 1
	seed: string
	triggerSource: 'input' | 'event' | 'hook' | 'ui' | 'schedule'
	triggerRef?: string
	actorUserId?: string
	parentRunId?: string
	rootRunId?: string
	depth: number
	startedAt: number
	endedAt: number
	outcome: Outcome
	haltNodeKey?: string
	haltReason?: string
	/** Who stopped it, when an admin did (13 §3). `cancelled` is not `err`. */
	cancelledBy?: string
	/**
	 * Time spent in the admin-visible queue before dequeue (13 §3). Recorded and
	 * deliberately excluded from elapsed: queue wait consumes no budget (F13) and
	 * trips no timeout (F36).
	 */
	queuedMs?: number
	/**
	 * True when this run halted before any effectful node and the receipt was
	 * reduced to attribution only (13 §2). Default on for event-triggered runs,
	 * which is where the per-message multiplier lives.
	 */
	compact?: boolean
	/** How many node rows the compaction dropped — so the count is never a mystery. */
	compactedNodeCount?: number
	/**
	 * Present when this run was a preview: it stopped at the pre-call substrate and the
	 * report is what would have been sent. A preview receipt is **never compacted** — the
	 * preview *is* the payload.
	 */
	preview?: import('./preview.js').PreviewReport
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
	portrayals?: import('./participants.js').Portrayals
	/**
	 * What the run was doing when it ended badly (R-19, R-21 "optional,
	 * taken"): the last status a node set — *{speaker} is typing* — and the
	 * node that set it. Present only when the outcome is `halt`, `err` or
	 * `cancelled`; never on `ok`, never on a preview's halt, and never as a
	 * node row — statuses are ephemeral (F34) and this is the one exception.
	 * The host fills `{speaker}` before the receipt is stored; the client
	 * resolves the locale.
	 */
	lastStatus?: import('./status.js').LastStatus
	nodes: NodeReceipt[]
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
	notes?: string[]
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
		clauseId: string
		iterations: number
		/**
		 * `predicate` — the loop asked to stop. `ceiling` — the declared max
		 * ended it, so the work may be unfinished. `interrupted` — the body
		 * halted, errored or was cancelled, and the run's own outcome says
		 * which.
		 */
		stopped: 'predicate' | 'ceiling' | 'interrupted'
	}>
	/**
	 * Events core emitted as a consequence of writes in this run (01 §8).
	 * `dry` marks one a dry run recorded and never dispatched.
	 */
	emitted: Array<{ event: string; cause: string; subscribers: number; dry?: true }>
	/** Gate decisions enter provenance; replay honours them (F15). */
	reviews?: Array<{
		nodeKey: string
		position: string
		action: string
		originalHash: string
		editedHash?: string
		by?: string
		at?: number
	}>
	consumption: { tokens: number; nodeExecutions: number }
	/**
	 * How the host reached this run (`ReceiptMeta`) — which the executor
	 * cannot know, so it is recorded verbatim from `RunOptions.meta`.
	 * @experimental 🚧
	 */
	meta?: ReceiptMeta
}

/** Render a receipt the way the run inspector would (17 §4). Used in tests as documentation. @experimental */
export function renderReceipt(r: Receipt): string {
	const out: string[] = []
	out.push(`run ${r.runId}  spec ${r.specId} v${r.specVersion}   seed ${r.seed}`)
	out.push(
		`trigger ${r.triggerSource}${r.actorUserId ? ` · user ${r.actorUserId}` : ''}   ` +
			`${r.endedAt - r.startedAt} ms` +
			(r.queuedMs ? ` (+${r.queuedMs} ms queued, uncharged)` : '') +
			`   outcome ${r.outcome}` +
			(r.cancelledBy ? ` by ${r.cancelledBy}` : ''),
	)
	if (r.compact) {
		out.push(
			` ▸ compact: halted at ${r.haltNodeKey ?? '?'} before any effectful node — ` +
				`${r.compactedNodeCount ?? 0} node row(s) dropped (13 §2)`,
		)
		if (r.haltReason) out.push(`     reason: ${r.haltReason}`)
	}
	// The one status the receipt keeps (R-21): what the run was doing when it
	// ended badly. Rendered in `en` here; the inspector resolves the locale.
	if (r.lastStatus)
		out.push(
			` ▸ while: ${renderStatusText(r.lastStatus.text)} (status set by ${r.lastStatus.nodeKey})`,
		)
	if (r.preview) out.push(renderPreview(r.preview))
	for (const n of r.nodes) {
		out.push(
			` ▸ ${n.nodeKey.padEnd(24)} ${n.kind.padEnd(9)} ${n.result.padEnd(9)} ${String(n.elapsedMs).padStart(5)} ms` +
				(n.blockMode ? `  [${n.blockMode}]` : ''),
		)
		if (n.reason) out.push(`     reason: ${n.reason}`)
		for (const note of n.notes ?? []) out.push(`     ${note}`)
		if (n.samplingIgnored?.length)
			out.push(`     ignored samplers: ${n.samplingIgnored.join(', ')}`)
	}
	for (const rev of r.reviews ?? []) {
		if (rev.position === 'off') continue
		out.push(
			` ▸ review ${rev.nodeKey}: ${rev.position} → ${rev.action}` +
				(rev.editedHash ? ` (edited ${rev.originalHash} → ${rev.editedHash})` : '') +
				(rev.by ? ` by ${rev.by}` : ''),
		)
	}
	for (const l of r.loops ?? [])
		out.push(` ▸ loop ${l.clauseId}: ${l.iterations} iteration(s), stopped on ${l.stopped}`)
	for (const note of r.notes ?? []) out.push(` ▸ ${note}`)
	for (const e of r.emitted) {
		out.push(
			e.dry
				? ` ▸ core would emit ${e.event} (cause: ${e.cause}) — dry run, not dispatched`
				: ` ▸ core emitted ${e.event} (cause: ${e.cause}) → ${e.subscribers} subscriber(s)`,
		)
	}
	out.push(
		` consumption: ${r.consumption.tokens} tokens, ${r.consumption.nodeExecutions} node executions`,
	)
	return out.join('\n')
}
