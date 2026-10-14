/**
 * 🚧 A story day as the conversation spells it, through the book's calendar
 * (PROPOSAL-live-scenes §15 G9): a scene divider's day, a day mark, a
 * history marker. The dossier carries the calendar (`storyCalendar`); the
 * spelling is the SDK's `formatStoryTime`, the time of day left off — a day
 * mark marks a day. A date the calendar cannot place, and a book with no
 * calendar, read free-form (*Year 412, Mo. 3, Day 5*), as `formatStoryTime`
 * falls back.
 */
import { formatStoryTime, type StoryCalendar, type StoryTime } from '@serene-pub/sdk'

/** A day's parts as a scene's clock, a line's stamp or a history entry carry them. @experimental */
export interface StoryDayLike {
	year: number
	month?: number | null
	day?: number | null
}

/** One story day, spelled through `calendar` (null: free-form), with no time of day. @experimental */
export function storyDayText(day: StoryDayLike, calendar?: StoryCalendar | null): string {
	const t: StoryTime = { year: Math.trunc(day.year) }
	if (typeof day.month === 'number' && day.month) {
		t.month = day.month
		if (typeof day.day === 'number' && day.day) t.day = day.day
	}
	return formatStoryTime(t, calendar ?? null)
}

/** The spelling `sceneMarks` takes as its `dayLabel`, for one calendar. @experimental */
export const storyDayLabelIn =
	(calendar?: StoryCalendar | null) =>
	(day: StoryDayLike): string =>
		storyDayText(day, calendar)
