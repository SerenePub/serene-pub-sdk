/**
 * 🚧 The plain half of **While you were away** (PLAN-layering A7, R23;
 * lane 7, 2026-10-21): what the routine log's answer reads as — the runs
 * since anyone last played set apart from the earlier ones, each line's
 * outcome and what it wrote in words, and when, relative to now. The
 * component draws; this decides the words, so they can be read without a
 * host.
 */
import type { RoutineLogEntryV1, RoutineLogV1 } from '@serene-pub/sdk/component'

/** The widget's settings, defaults filled. */
export interface RoutineLogSettings {
	limit: number
	skipped: boolean
}

export const ROUTINE_LOG_DEFAULTS: RoutineLogSettings = Object.freeze({ limit: 20, skipped: true })

/** The instance's settings as the host posted them, defaults filled and bounds held. */
export function readRoutineLogSettings(raw: unknown): RoutineLogSettings {
	const r = (raw ?? {}) as Partial<Record<keyof RoutineLogSettings, unknown>>
	const limit = typeof r.limit === 'number' && Number.isFinite(r.limit) ? Math.min(100, Math.max(5, Math.round(r.limit))) : ROUTINE_LOG_DEFAULTS.limit
	return { limit, skipped: typeof r.skipped === 'boolean' ? r.skipped : ROUTINE_LOG_DEFAULTS.skipped }
}

const OUTCOME: Record<RoutineLogEntryV1['kind'], string> = {
	ran: 'Ran',
	skipped: 'Skipped',
	paused: 'Paused',
	failed: 'Failed',
	stopped: 'Stopped',
}

/** "1 entry", "2 messages" — what a run wrote, counted by kind. */
export function wroteWords(wrote: RoutineLogEntryV1['wrote']): string {
	const counts = new Map<string, number>()
	for (const w of wrote) counts.set(w.kind, (counts.get(w.kind) ?? 0) + 1)
	return [...counts]
		.map(([kind, n]) => {
			const word = kind.replace(/_/g, ' ')
			const plural = n === 1 ? word : word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`
			return `${n} ${plural}`
		})
		.join(', ')
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago". */
export function agoWords(at: number, now: number): string {
	const s = Math.max(0, Math.round((now - at) / 1000))
	if (s < 60) return 'just now'
	const m = Math.round(s / 60)
	if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`
	const h = Math.round(m / 60)
	if (h < 48) return h === 1 ? '1 hour ago' : `${h} hours ago`
	const d = Math.round(h / 24)
	return `${d} days ago`
}

/** One line as the widget draws it. */
export interface RoutineLogLine {
	runId: string
	name: string
	kind: RoutineLogEntryV1['kind']
	/** "Ran", "Skipped: already waiting", "Paused after 12 runs in a row". */
	outcome: string
	/** "wrote 2 entries" — a run's, when it wrote anything. */
	wrote: string | null
	when: string
	runNow: boolean
}

/** A reason that is already its own sentence ("Skipped: …", "Paused …") is the outcome. */
function outcomeOf(e: RoutineLogEntryV1): string {
	const base = OUTCOME[e.kind] ?? e.kind
	const reason = e.reason?.trim()
	if (!reason) return base
	if (/^(skipped|paused)\b/i.test(reason)) return reason
	return `${base}: ${reason}`
}

export interface RoutineLogView {
	/** The runs since anyone last played — "while you were away". */
	away: RoutineLogLine[]
	/** The runs before. */
	earlier: RoutineLogLine[]
	/** Nothing to show, in words; null when there is. */
	empty: string | null
}

/** The answer, split around the last time anyone played, skipped lines kept or not. */
export function routineLogView(answer: RoutineLogV1 | null, settings: RoutineLogSettings, now: number): RoutineLogView {
	if (!answer) return { away: [], earlier: [], empty: null }
	const entries = answer.entries.filter((e) => settings.skipped || e.kind === 'ran' || e.kind === 'failed' || e.kind === 'stopped')
	const line = (e: RoutineLogEntryV1): RoutineLogLine => ({
		runId: e.runId,
		name: e.name,
		kind: e.kind,
		outcome: outcomeOf(e),
		wrote: e.kind === 'ran' && e.wrote.length ? `wrote ${wroteWords(e.wrote)}` : null,
		when: agoWords(e.endedAt || e.startedAt, now),
		runNow: !!e.runNow,
	})
	const since = answer.lastInteractionAt
	const away = since == null ? [] : entries.filter((e) => e.startedAt > since).map(line)
	const earlier = (since == null ? entries : entries.filter((e) => e.startedAt <= since)).map(line)
	return {
		away,
		earlier,
		empty: entries.length ? null : 'No routine has run in this session yet.',
	}
}
