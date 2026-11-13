/**
 * `@serene-pub/core-catalog/session-runs` — the plain-TypeScript half of
 * core's Runs widget (lay-R, owner 2026-11-06): the words and rows it draws
 * from `session-runs` (an administrator's list of this session's pipeline
 * runs, newest first) and `session-run-steps` (one run's steps). The
 * widget's Svelte source lives in `components/shared/session-runs/` and
 * ships built; a host imports only this half, which carries no Svelte
 * runtime.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker. A
 * sentence that names a person (`Started by {name}`) is returned as a
 * template with the name apart, never glued here.
 *
 * ⚠ Not While you were away (routines, for everyone), not the progress card
 * (a run in flight), not the Pipelines view's Runs tab (every session, by
 * pipeline).
 *
 * 🚧 Provisional with the widget.
 */
import type { SessionRunStepV1, SessionRunV1 } from '@serene-pub/sdk'

/** How many runs the widget asks for first. @experimental */
export const SESSION_RUNS_FIRST = 25
/** The most it ever asks for (the host's ceiling). @experimental */
export const SESSION_RUNS_MOST = 100

/** A run's outcome in words: Finished · Stopped · Failed · Cancelled; an unknown word as it came. @experimental */
export function runOutcomeWords(outcome: string): string {
	switch (outcome) {
		case 'ok':
			return 'Finished'
		case 'halt':
			return 'Stopped'
		case 'err':
			return 'Failed'
		case 'cancelled':
			return 'Cancelled'
		default:
			return outcome
	}
}

/** How long it took: `820 ms`, `4.2 s`, `1 min 5 s`. @experimental */
export function runDurationWords(ms: number): string {
	const n = Math.max(0, ms)
	if (n < 1000) return `${Math.round(n)} ms`
	if (n < 60_000) {
		const s = Math.round(n / 100) / 10
		if (s >= 60) return '1 min'
		return `${Number.isInteger(s) ? s : s.toFixed(1)} s`
	}
	const total = Math.round(n / 1000)
	const m = Math.floor(total / 60)
	const s = total % 60
	return s === 0 ? `${m} min` : `${m} min ${s} s`
}

/**
 * What started a run, as English source: `source` is the sentence (or, with
 * a `name`, the template `Started by {name}`); the widget passes it through
 * `t()` and fills `{name}` itself.
 * @experimental
 */
export interface RunStartedBy {
	source: string
	name?: string
}

/** Who or what started a run — its registration's family first, then the receipt's source. @experimental */
export function runStartedByParts(
	run: Pick<SessionRunV1, 'triggerFamily' | 'triggerSource' | 'userId' | 'username'>,
	viewerId: number | null,
): RunStartedBy {
	switch (run.triggerFamily) {
		case 'routine':
			return { source: 'Started by a routine' }
		case 'action':
			return { source: 'Started by an action' }
		case 'event':
			return { source: 'Started by an event' }
	}
	switch (run.triggerSource) {
		case 'schedule':
			return { source: 'Started by a schedule' }
		case 'event':
			return { source: 'Started by an event' }
		case 'ui':
			if (run.userId != null && run.userId === viewerId) return { source: 'Started by you' }
			if (run.username) return { source: 'Started by {name}', name: run.username }
			return { source: 'Started by a person' }
		case 'input':
			return { source: 'Started by hand' }
		case 'hook':
			return { source: 'Started by a hook' }
		default:
			return { source: 'Started by {name}', name: run.triggerSource }
	}
}

/** `runStartedByParts` in English, filled — the form the rows carry and tests pin. @experimental */
export function runStartedByWords(
	run: Pick<SessionRunV1, 'triggerFamily' | 'triggerSource' | 'userId' | 'username'>,
	viewerId: number | null,
): string {
	const p = runStartedByParts(run, viewerId)
	return p.name === undefined ? p.source : p.source.replace('{name}', p.name)
}

/** Where a run stopped, when it did not finish: `at {node}: {reason}`, `at {node}`, `{reason}`; else null. @experimental */
export function runStoppedAtWords(
	run: Pick<SessionRunV1, 'outcome' | 'haltNodeKey' | 'haltReason'>,
): string | null {
	if (run.outcome === 'ok') return null
	const node = run.haltNodeKey
	const reason = run.haltReason
	if (node && reason) return `at ${node}: ${reason}`
	if (node) return `at ${node}`
	return reason || null
}

/** Tokens in words (`1 token`, `1234 tokens`); null for none. @experimental */
export function runTokensWords(n: number | null): string | null {
	if (!n) return null
	return n === 1 ? '1 token' : `${n} tokens`
}

/** When, as "… ago": just now · N minutes ago · N hours ago (under 48) · N days ago. @experimental */
export function runAgoWords(at: number, now: number): string {
	const s = Math.max(0, Math.round((now - at) / 1000))
	if (s < 60) return 'just now'
	const m = Math.round(s / 60)
	if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`
	const h = Math.round(m / 60)
	if (h < 48) return h === 1 ? '1 hour ago' : `${h} hours ago`
	const d = Math.round(h / 24)
	return `${d} days ago`
}

/** One run as the widget draws it. @experimental */
export interface SessionRunRow {
	runId: string
	pipeline: string
	/** The raw outcome word — rides on `data-outcome`. */
	outcome: string
	outcomeWords: string
	startedBy: string
	when: string
	duration: string
	tokens: string | null
	stoppedAt: string | null
	preview: boolean
	depth: number
	promptMessageId: number | null
}

/** The rows, in the host's order (newest first). @experimental */
export function sessionRunRows(
	runs: readonly SessionRunV1[],
	viewerId: number | null,
	now: number,
): SessionRunRow[] {
	return runs.map((r) => ({
		runId: r.runId,
		pipeline: r.pipeline,
		outcome: r.outcome,
		outcomeWords: runOutcomeWords(r.outcome),
		startedBy: runStartedByWords(r, viewerId),
		when: runAgoWords(r.endedAt || r.startedAt, now),
		duration: runDurationWords(r.elapsedMs),
		tokens: runTokensWords(r.tokens),
		stoppedAt: runStoppedAtWords(r),
		preview: r.isPreview,
		depth: r.depth,
		promptMessageId: r.promptMessageId,
	}))
}

/** One step as the widget draws it. @experimental */
export interface SessionRunStepRow {
	seq: number
	key: string
	kind: string
	result: string
	reason: string | null
	duration: string
	tokens: string | null
}

/** A run's step rows, in step order. @experimental */
export function sessionRunStepRows(steps: readonly SessionRunStepV1[]): SessionRunStepRow[] {
	return [...steps]
		.sort((a, b) => a.seq - b.seq)
		.map((s) => ({
			seq: s.seq,
			key: s.key,
			kind: s.kind,
			result: s.result,
			reason: s.reason,
			duration: runDurationWords(s.elapsedMs),
			tokens: runTokensWords(s.tokens),
		}))
}

/** Whether Show more is offered: the list filled its limit and the limit can still grow. @experimental */
export function canShowMoreRuns(shown: number, limit: number): boolean {
	return shown >= limit && limit < SESSION_RUNS_MOST
}
