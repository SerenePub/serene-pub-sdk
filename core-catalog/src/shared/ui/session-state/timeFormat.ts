/**
 * 🚧 A story time drawn through a widget copy's **time format** — the
 * `timeFormat` setting of core's Messages and Stats widgets (owner ruling
 * 2026-10-15: a display format is a widget setting, never a field on a
 * genre, channel or slot declaration).
 *
 * The format is a line with tokens in braces:
 *
 * | token        | reads as                                        |
 * | ------------ | ----------------------------------------------- |
 * | `{year}`     | the year, as stored (`412`, `-12`)              |
 * | `{month}`    | the month's number (`3`)                        |
 * | `{monthName}`| the month's name, when a calendar names it      |
 * | `{day}`      | the day's number (`5`)                          |
 * | `{dayName}`  | the weekday, when a calendar has a week         |
 * | `{hh}`       | the hour, two digits (`08`)                     |
 * | `{mm}`       | the minute, two digits (`30`)                   |
 *
 * A token whose part the time does not have reads as nothing, and the
 * separators left dangling at either end are trimmed — `Day {day}, {hh}:{mm}`
 * on a date with no time of day reads `Day 5`. An unknown token is left as
 * written, so a typo shows rather than vanishing. An empty format is no
 * format: the caller keeps its own spelling (`formatStoryTime`, through the
 * book's calendar), which is what every genre that pins none still sees.
 * @experimental
 */
import { storyDayIndex, type StoryCalendar, type StoryTime } from '@serene-pub/sdk'

/**
 * 🚧 A story time's parts as a time format reads them: the stored parts, and
 * the names a declared calendar gives them (absent free-form). The structured
 * value a host sends beside a pre-spelled line, so a widget copy can spell it
 * its own way.
 * @experimental
 */
export interface StoryTimeParts extends StoryTime {
	/** The weekday, when the book's calendar has a week. */
	dayName?: string | null
	/** The month's name, when the book's calendar names its months. */
	monthName?: string | null
}

const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)
const pad = (n: number) => String(n).padStart(2, '0')
const mod = (a: number, b: number) => ((a % b) + b) % b

/**
 * A story time's parts, named through the book's calendar where it can name
 * them — what a host sends a widget beside the line it spelled.
 * @experimental
 */
export function storyTimePartsOf(time: StoryTime, calendar?: StoryCalendar | null): StoryTimeParts {
	const out: StoryTimeParts = { year: time.year }
	if (has(time.month)) out.month = time.month
	if (has(time.day)) out.day = time.day
	if (has(time.hour)) {
		out.hour = time.hour
		out.minute = has(time.minute) ? time.minute : 0
	}
	if (calendar && has(time.month)) {
		const month = calendar.months[time.month - 1]
		if (month) out.monthName = month.name
		const week = calendar.weekdays ?? []
		if (week.length && has(time.day)) {
			const index = storyDayIndex(time, calendar)
			if (index !== null) out.dayName = week[mod(index + (calendar.firstWeekday ?? 0), week.length)] ?? null
		}
	}
	return out
}

/** Read defensively: parts off the wire, or `null` when they are not a story time. @experimental */
export function storyTimePartsFrom(value: unknown): StoryTimeParts | null {
	if (!value || typeof value !== 'object') return null
	const v = value as Record<string, unknown>
	if (!has(v.year as number)) return null
	const num = (k: string) => (has(v[k] as number) ? (v[k] as number) : null)
	const str = (k: string) => (typeof v[k] === 'string' && (v[k] as string) ? (v[k] as string) : null)
	return {
		year: v.year as number,
		month: num('month'),
		day: num('day'),
		hour: num('hour'),
		minute: num('minute'),
		dayName: str('dayName'),
		monthName: str('monthName'),
	}
}

/** The tokens a time format reads (see the module's table). @experimental */
export const STORY_TIME_FORMAT_TOKENS = ['year', 'month', 'monthName', 'day', 'dayName', 'hh', 'mm'] as const

/** Separators a missing part can leave dangling at either end of the line. */
const DANGLING = /^[\s,:;·/-]+|[\s,:;·/-]+$/g

/**
 * A story time spelled through a time format, or `null` when `format` is
 * empty (no format: the caller keeps its own spelling).
 * @experimental
 */
export function formatStoryTimeAs(time: StoryTimeParts, format: string | null | undefined): string | null {
	const f = typeof format === 'string' ? format : ''
	if (!f.trim()) return null
	const hasClock = has(time.hour)
	const token = (name: string): string | undefined => {
		switch (name) {
			case 'year':
				return String(Math.trunc(time.year))
			case 'month':
				return has(time.month) ? String(time.month) : ''
			case 'monthName':
				return time.monthName ?? (has(time.month) ? String(time.month) : '')
			case 'day':
				return has(time.day) ? String(time.day) : ''
			case 'dayName':
				return time.dayName ?? ''
			case 'hh':
				return hasClock ? pad(time.hour as number) : ''
			case 'mm':
				return hasClock ? pad(has(time.minute) ? time.minute : 0) : ''
			default:
				return undefined
		}
	}
	const out = f.replace(/\{(\w+)\}/g, (whole, name: string) => token(name) ?? whole)
	return out.replace(DANGLING, '').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',')
}

/**
 * 🚧 The structured half of a story-time **change line** (the transcript
 * ledger): what the host spelled into the line's `text`, as parts, so a
 * Messages copy with a `timeFormat` can spell it its own way. `value`: a
 * story-time stat moved (`Time 08:00 → 08:30`); `clock`: the session's story
 * clock moved (`Time passes: 30 minutes (… → …)`). Rides on the line beside
 * `text` — additive: a widget that knows nothing of it draws `text`.
 * @experimental
 */
export type LedgerStoryTime =
	| { kind: 'value'; label: string; before: StoryTimeParts | null; after: StoryTimeParts | null }
	| { kind: 'clock'; head: string; from: StoryTimeParts; to: StoryTimeParts }

/**
 * A change line's words through a copy's time format: the host's `text` when
 * the format is empty or the line carries no story time, else the line
 * rebuilt around the format's spelling — the same sentence, the times
 * spelled the copy's way.
 * @experimental
 */
export function ledgerLineTextAs(
	line: { text: string; storyTime?: unknown },
	format: string | null | undefined,
): string {
	const st = line.storyTime as LedgerStoryTime | undefined
	if (!st || typeof st !== 'object') return line.text
	const spell = (v: unknown) => {
		const parts = storyTimePartsFrom(v)
		return parts ? formatStoryTimeAs(parts, format) : null
	}
	if (st.kind === 'clock') {
		const from = spell(st.from)
		const to = spell(st.to)
		return from !== null && to !== null && typeof st.head === 'string' ? `${st.head} (${from} → ${to})` : line.text
	}
	if (st.kind === 'value') {
		const after = st.after ? spell(st.after) : null
		if (after === null || typeof st.label !== 'string') return line.text
		const before = st.before ? spell(st.before) : null
		return before === null ? `${st.label} → ${after}` : `${st.label} ${before} → ${after}`
	}
	return line.text
}
