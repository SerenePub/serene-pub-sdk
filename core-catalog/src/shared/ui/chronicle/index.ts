/**
 * `@serene-pub/core-catalog/chronicle` — the plain-TypeScript half of core's
 * Chronicle widget (PLAN-core-widgets W3): its settings, the clock's step
 * and its *Move the clock…* form, and the one view it draws from the page's
 * `history-entries` answer — the clock head, the history entry the session
 * reads now, that entry's scenes, and the entries before it. The widget's
 * Svelte source lives in `components/shared/chronicle/` and ships built
 * (`dist/components/chronicle.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * **What it answers:** when are we in the story, and what has the lorebook
 * recorded of this session. Everything it shows is the page's answer; it
 * decides no date. The session's **story clock** is its own or follows its
 * line's present; the dates are spelled by the page through the book's
 * calendar.
 *
 * ⚠ Not a **history entry** (one dated row of a lorebook; the widget lists
 * them), not a **scene** (a captured run of a session's lines, filed under
 * an entry) and not the **story clock** (the session's present, which the
 * widget's head shows and moves). Not the lorebook's **moment bar** either:
 * that is a reader's view of the book and never moves a session.
 *
 * 🚧 Live scenes (PROPOSAL-live-scenes §7, lane D, 2026-10-13): the answer
 * also carries the session's **open scene** (`openScene`: name, since when,
 * lines, the proposed cast with its evidence), each scene's summary state
 * and the session's summary mode — so the view draws the *Open scene* card
 * (*Close scene*, *Close and summarize*), a dot per scene row with its
 * *Summarize*, and *Summarize all (N)*. Under the summary mode `never` no
 * Summarize is offered anywhere.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget.
 */
import type {
	HistoryEntriesV1,
	HistoryEntryV1,
	HistorySceneV1,
	StoryTime,
	StoryTimeUnit,
	ViewerV1,
} from '@serene-pub/sdk'

/** A translation: English source in, the viewer's words out. @experimental */
export type ChronicleT = (source: string) => string

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface ChronicleSettings {
	/** Draw the story clock at the head. */
	clock: boolean
	/** How many earlier history entries the folded list shows (5–50). */
	earlierCount: number
}

/** @experimental */
export const CHRONICLE_DEFAULTS: ChronicleSettings = Object.freeze({
	clock: true,
	earlierCount: 10,
})

/** The bounds of `earlierCount`, as the declaration states them. @experimental */
export const CHRONICLE_EARLIER_MIN = 5
/** @experimental */
export const CHRONICLE_EARLIER_MAX = 50

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readChronicleSettings(raw: Record<string, unknown> | undefined): ChronicleSettings {
	const v = raw ?? {}
	const n = v.earlierCount
	return {
		clock: typeof v.clock === 'boolean' ? v.clock : CHRONICLE_DEFAULTS.clock,
		earlierCount:
			typeof n === 'number' && Number.isInteger(n)
				? Math.min(CHRONICLE_EARLIER_MAX, Math.max(CHRONICLE_EARLIER_MIN, n))
				: CHRONICLE_DEFAULTS.earlierCount,
	}
}

/**
 * The clock's one-press step, as precise as its date — the lorebook's own
 * rule for **Next day**: a day when the present has one, else a month, else
 * a year. Null with no present: there is nothing to step from.
 * @experimental
 */
export function chronicleStep(
	present: StoryTime | null | undefined,
): { by: 1; unit: Extract<StoryTimeUnit, 'days' | 'months' | 'years'>; label: string } | null {
	if (!present) return null
	if (present.month != null && present.day != null)
		return { by: 1, unit: 'days', label: 'Next day' }
	if (present.month != null) return { by: 1, unit: 'months', label: 'Next month' }
	return { by: 1, unit: 'years', label: 'Next year' }
}

/** *Move the clock…*'s fields, as typed: each a string, empty where not given. @experimental */
export interface ChronicleClockDraft {
	year: string
	month: string
	day: string
	hour: string
	minute: string
}

/** The form's fields, filled from where the clock stands now. @experimental */
export function chronicleClockDraft(present: StoryTime | null | undefined): ChronicleClockDraft {
	const s = (v: number | null | undefined) => (v == null ? '' : String(v))
	return {
		year: s(present?.year),
		month: s(present?.month),
		day: present?.month != null ? s(present?.day) : '',
		hour: s(present?.hour),
		minute: present?.hour != null ? s(present?.minute) : '',
	}
}

/**
 * The form's fields as the time they name, or why they name none. Only the
 * shape is checked here — a whole year (it may be negative), whole parts, a
 * day only beside a month and a minute only beside an hour; the book's
 * calendar is the page's to apply, and it refuses in words.
 * @experimental
 */
export function chronicleClockFromDraft(
	draft: ChronicleClockDraft,
): { to: StoryTime; problem?: undefined } | { to?: undefined; problem: string } {
	const read = (raw: string): number | null | 'bad' => {
		const t = raw.trim()
		if (!t) return null
		return /^-?\d+$/.test(t) ? Number(t) : 'bad'
	}
	const year = read(draft.year)
	const month = read(draft.month)
	const day = read(draft.day)
	const hour = read(draft.hour)
	const minute = read(draft.minute)
	if (year === null) return { problem: 'Give the clock a year.' }
	if ([year, month, day, hour, minute].includes('bad'))
		return { problem: 'Write each part as a whole number.' }
	if (day !== null && month === null) return { problem: 'A day needs a month.' }
	if (minute !== null && hour === null) return { problem: 'A minute needs an hour.' }
	const to: StoryTime = { year: year as number }
	if (month !== null) to.month = month as number
	if (day !== null) to.day = day as number
	if (hour !== null) {
		to.hour = hour as number
		to.minute = (minute as number | null) ?? 0
	}
	return { to }
}

/** How many scene colours the swatch cycles through — the conversation's scene palette. @experimental */
export const CHRONICLE_SWATCHES = 8

/** The clock head, as drawn. @experimental */
export interface ChronicleClockView {
	/** The present, spelled — or that there is none yet. */
	date: string
	/** Whose clock it is: the session's own, or its line's present it follows. */
	note: string
	/** The chip when the session's own clock stands before its line's present; else null. */
	behind: string | null
	/** What the chip means, for its title. */
	behindTitle: string | null
	/** The one-press step (owner only); null when there is nothing to step from. */
	step: { by: 1; unit: StoryTimeUnit; label: string } | null
	/** *Follow the line's present* (owner only, with a clock of its own). */
	canFollow: boolean
	/** *Move the clock…* (owner only). */
	canMove: boolean
}

/** One history entry, as drawn. @experimental */
export interface ChronicleEntryView {
	id: number
	date: string
	/** Its first line, or that it says nothing yet. */
	firstLine: string
	/** True when `firstLine` stands in for an empty entry. */
	blank: boolean
	/** How many of this session's scenes are under it, in words. */
	scenes: string
}

/**
 * Where a scene's summary stands — its dot. 🚧 `review` (§15 G8): the run
 * finished and its result waits for the person's Apply. @experimental
 */
export type ChronicleSummaryStatus = 'none' | 'running' | 'review' | 'done' | 'failed'

/** One scene, as drawn. @experimental */
export interface ChronicleSceneView {
	id: number
	name: string
	/** How many lines it holds, in words. */
	span: string
	/** Which of the {@link CHRONICLE_SWATCHES} colours it is drawn in. */
	swatch: number
	summarized: boolean
	/** 🚧 Its summary state — the dot: `none` · `running` · `review` · `done` · `failed`. */
	status: ChronicleSummaryStatus
	/** 🚧 The dot's words, for its title and its label. */
	statusLabel: string
	/** 🚧 It is the open scene (no *Summarize* until it closes). */
	open: boolean
	/** 🚧 *Summarize* on its row: owner, not `never`, not open, and its summary not written, running or in review. */
	canSummarize: boolean
	/**
	 * 🚧 *Ready to review* on its row (§15 G8): its run finished and waits
	 * for the person — the owner opens that review (`summarize` naming it).
	 */
	canReview: boolean
}

/** 🚧 The open scene's card, as drawn (live scenes §7). @experimental */
export interface ChronicleOpenSceneView {
	id: number
	name: string
	/** *since Day 12*, or empty when it opened with no clock. */
	since: string
	/** How many lines it holds so far, in words. */
	span: string
	swatch: number
	/** The proposed cast, each with its evidence for the pill's title. */
	cast: Array<{ name: string; evidence: string }>
	/** *Close scene* (owner only). */
	canClose: boolean
	/**
	 * *Close and summarize* (owner only, summaries on request). Under *On
	 * close* the plain close summarizes anyway, and under *Never* nothing
	 * does, so neither offers it.
	 */
	canCloseAndSummarize: boolean
	/** Said under the card when closing summarizes by itself (*On close*); else null. */
	note: string | null
}

/** Everything the widget draws. @experimental */
export interface ChronicleView {
	/** `loading` until the first answer; `no-book` with no lorebook; else `ready`. */
	state: 'loading' | 'no-book' | 'ready'
	/** The one line said instead of the rest (no lorebook). */
	empty: string | null
	/** The clock head; null when the `clock` setting is off or before an answer. */
	clock: ChronicleClockView | null
	/** The viewer may write: the session's owner, never a guest seat. */
	canWrite: boolean
	/** Said to a viewer who is not the lorebook's owner, where the history would be. */
	ownerOnly: string | null
	/** The entry the session reads now. */
	now: ChronicleEntryView | null
	/** Said when there is no entry yet (the owner's view). */
	nowEmpty: string | null
	/** 🚧 The session's open scene, drawn under the clock; null when none is open. */
	openScene: ChronicleOpenSceneView | null
	/** That entry's scenes from this session, oldest first. */
	scenes: ChronicleSceneView[]
	/** *Summarize scene* (owner only, in a genre that captures scenes). */
	canSummarize: boolean
	/** 🚧 *Summarize all (N)*: the session's closed scenes with no summary yet (owner only, summaries not `never`). */
	summarizeAll: { count: number; label: string; title: string } | null
	/** Said under an entry with no scenes from this session. */
	scenesEmpty: string | null
	/** *Extend graph (N)*, when this session has scenes the graph has not read. */
	extend: { count: number; label: string; title: string } | null
	/** The entries before it, newest first, as many as `earlierCount`. */
	earlier: ChronicleEntryView[]
	/** The folded list's head: *Earlier (N)*. */
	earlierHead: string | null
	/** The entries past `earlierCount`, in words; null when none were cut. */
	earlierMore: string | null
}

const count = (n: number, one: string, many: string, t: ChronicleT) =>
	n === 1 ? t(one) : t(many).replace('{n}', String(n))

/** The dot's words, per summary state. @experimental */
export const CHRONICLE_SUMMARY_STATUS_LABELS: Readonly<Record<ChronicleSummaryStatus, string>> = Object.freeze({
	none: 'Not summarized',
	running: 'Summarizing…',
	review: 'Ready to review',
	done: 'Summarized',
	failed: 'The summary failed',
})

/** A scene's summary state, as the dot reads it: the row's own, else what `summarized` says. @experimental */
export function chronicleSummaryStatus(s: Pick<HistorySceneV1, 'summarized' | 'summaryStatus'>): ChronicleSummaryStatus {
	const st = s.summaryStatus
	if (st === 'running' || st === 'review' || st === 'failed') return st
	if (st === 'done' || s.summarized) return 'done'
	return 'none'
}

function entryView(e: HistoryEntryV1, t: ChronicleT): ChronicleEntryView {
	const line = e.firstLine.trim()
	return {
		id: e.id,
		date: e.label || String(e.date.year),
		firstLine: line || t('Nothing written yet'),
		blank: !line,
		scenes: count(e.sceneCount, '1 scene', '{n} scenes', t),
	}
}

/**
 * The one view of a `history-entries` answer (`null` before the first one).
 * Writes are offered to the session's owner only — `ownerOnly` off and not a
 * guest seat (`viewer`) — and the page refuses them to anyone else besides.
 * @experimental
 */
export function chronicleView(
	result: HistoryEntriesV1 | null | undefined,
	settings: ChronicleSettings,
	viewer: ViewerV1 | null | undefined,
	t: ChronicleT,
): ChronicleView {
	const none: ChronicleView = {
		state: 'loading',
		empty: null,
		clock: null,
		canWrite: false,
		ownerOnly: null,
		now: null,
		nowEmpty: null,
		openScene: null,
		scenes: [],
		canSummarize: false,
		summarizeAll: null,
		scenesEmpty: null,
		extend: null,
		earlier: [],
		earlierHead: null,
		earlierMore: null,
	}
	if (!result) return none
	if (result.lorebookId === null)
		return { ...none, state: 'no-book', empty: t('This session reads no lorebook.') }

	const canWrite = !result.ownerOnly && viewer?.isGuest !== true
	const c = result.clock
	const step = chronicleStep(c.present)
	const clock: ChronicleClockView | null = settings.clock
		? {
				date: c.present ? c.label || String(c.present.year) : t('No date yet'),
				note: c.own
					? t("This session's own clock")
					: c.present
						? t("Following the line's present")
						: t('Nothing on its line is dated, and no clock is set.'),
				behind:
					c.own && c.behind && c.linePresent
						? t('The line is at {date}').replace(
								'{date}',
								c.linePresentLabel || String(c.linePresent.year),
							)
						: null,
				behindTitle:
					c.own && c.behind
						? t("This session's own clock stands before its line's present.")
						: null,
				step: canWrite && step ? { ...step, label: t(step.label) } : null,
				canFollow: canWrite && c.own,
				canMove: canWrite,
			}
		: null

	if (result.ownerOnly)
		return {
			...none,
			state: 'ready',
			clock,
			ownerOnly: t(
				"This session's history entries and scenes are its lorebook owner's to read.",
			),
		}

	const now = result.current ? entryView(result.current, t) : null
	const earlier = result.earlier.slice(0, settings.earlierCount).map((e) => entryView(e, t))
	const cut = Math.max(0, result.earlierTotal - earlier.length)
	const swatchOf = (order: number) =>
		((order % CHRONICLE_SWATCHES) + CHRONICLE_SWATCHES) % CHRONICLE_SWATCHES
	// Live scenes (§5): `never` offers no Summarize anywhere; absent reads as
	// `onRequest`, a host's answer from before the field.
	const summaryMode = result.summaryMode ?? 'onRequest'
	const summarizes = canWrite && result.opensScenes && summaryMode !== 'never'
	const open = result.openScene ?? null
	const openScene: ChronicleOpenSceneView | null = open
		? {
				id: open.id,
				name: open.name?.trim() || t('Open scene'),
				since: open.since ? t('since {date}').replace('{date}', open.since) : '',
				span: count(open.lineCount, '1 line', '{n} lines', t),
				swatch: swatchOf(open.order),
				cast: open.cast.map((c) => ({ name: c.name, evidence: c.evidence })),
				canClose: canWrite && result.opensScenes,
				canCloseAndSummarize: summarizes && summaryMode === 'onRequest',
				note:
					summarizes && summaryMode === 'onClose'
						? t('Its summary runs when it closes.')
						: null,
			}
		: null
	const unsummarized = Math.max(0, result.unsummarizedScenes ?? 0)
	return {
		...none,
		state: 'ready',
		clock,
		canWrite,
		now,
		nowEmpty: now ? null : t('No history entries yet. Open the lorebook to write the first.'),
		openScene,
		scenes: now
			? result.scenes.map((s) => {
					const status = chronicleSummaryStatus(s)
					const isOpen = open?.id === s.id
					return {
						id: s.id,
						name: s.name?.trim() || t('Untitled scene'),
						span: count(s.lineCount, '1 line', '{n} lines', t),
						swatch: swatchOf(s.order),
						summarized: s.summarized,
						status,
						statusLabel: t(CHRONICLE_SUMMARY_STATUS_LABELS[status]),
						open: isOpen,
						canSummarize: summarizes && !isOpen && (status === 'none' || status === 'failed'),
						canReview: canWrite && status === 'review',
					}
				})
			: [],
		canSummarize: canWrite && result.opensScenes,
		summarizeAll:
			summarizes && unsummarized > 0
				? {
						count: unsummarized,
						label: t('Summarize all ({n})').replace('{n}', String(unsummarized)),
						title: count(
							unsummarized,
							"Summarize this session's 1 scene with no summary yet, in the background",
							"Summarize this session's {n} scenes with no summary yet, one after another, in the background",
							t,
						),
					}
				: null,
		scenesEmpty:
			now && !result.scenes.length ? t('No scenes from this session under it yet.') : null,
		extend:
			canWrite && result.ungraphedScenes > 0
				? {
						count: result.ungraphedScenes,
						label: t('Extend graph ({n})').replace(
							'{n}',
							String(result.ungraphedScenes),
						),
						title: count(
							result.ungraphedScenes,
							"Read this session's 1 ungraphed scene into the lorebook's graph",
							"Read this session's {n} ungraphed scenes into the lorebook's graph",
							t,
						),
					}
				: null,
		earlier,
		earlierHead: result.earlierTotal
			? t('Earlier ({n})').replace('{n}', String(result.earlierTotal))
			: null,
		earlierMore: cut
			? count(cut, '1 more in the lorebook', '{n} more in the lorebook', t)
			: null,
	}
}
