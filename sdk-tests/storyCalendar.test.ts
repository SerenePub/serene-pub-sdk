/**
 * The story calendar (DESIGN-story-time P5): a declared calendar spells, validates
 * and rolls dates over; free-form (no calendar) keeps today's spelling and never
 * rolls over; and one comparator orders both.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	compareStoryTimes,
	formatStoryTime,
	nextStoryTime,
	parseStoryCalendar,
	STORY_CALENDAR_PRESETS,
	storyCalendarProblems,
	storyDayIndex,
	storyDaysInMonth,
	storyTimeProblem,
	type StoryCalendar,
} from '@serene-pub/sdk'

const THAW: StoryCalendar = {
	months: [
		{ name: 'Thaw', days: 30 },
		{ name: 'Bloom', days: 31 },
		{ name: 'Ember', days: 28 },
	],
	weekdays: ['Moonday', 'Ashday', 'Restday'],
	firstWeekday: 0,
	yearLabel: 'Year',
	leap: { every: 4, month: 3 },
	eras: [
		{ name: 'BR', start: null, backwards: true },
		{ name: 'AR', start: 1 },
	],
}

describe('story calendar — the declared shape', () => {
	test('a well-formed calendar has no problems, and round-trips through parse', () => {
		assert.deepEqual(storyCalendarProblems(THAW), [])
		assert.deepEqual(parseStoryCalendar(JSON.parse(JSON.stringify(THAW))), THAW)
	})

	test('null and undefined are free-form, not errors', () => {
		assert.equal(parseStoryCalendar(null), null)
		assert.equal(parseStoryCalendar(undefined), null)
	})

	test('a calendar that cannot spell a date is refused with a reason', () => {
		assert.ok(storyCalendarProblems({ months: [] }).length > 0)
		assert.ok(storyCalendarProblems({ months: [{ name: '', days: 30 }] }).length > 0)
		assert.ok(storyCalendarProblems({ months: [{ name: 'A', days: 0 }] }).length > 0)
		assert.ok(storyCalendarProblems({ ...THAW, firstWeekday: 3 }).length > 0)
		assert.ok(storyCalendarProblems({ ...THAW, leap: { every: 0, month: 1 } }).length > 0)
		assert.ok(storyCalendarProblems({ ...THAW, leap: { every: 4, month: 9 } }).length > 0)
		// A backwards era counts down to the NEXT era's start, so it cannot be last.
		assert.ok(storyCalendarProblems({ ...THAW, eras: [{ name: 'BR', start: null, backwards: true }] }).length > 0)
		// Starts must rise.
		assert.ok(
			storyCalendarProblems({ ...THAW, eras: [{ name: 'A', start: 5 }, { name: 'B', start: 2 }] }).length > 0,
		)
		// parse refuses rather than repairs.
		assert.throws(() => parseStoryCalendar({ months: [] }))
	})

	test('every preset is well-formed', () => {
		assert.ok(STORY_CALENDAR_PRESETS.length > 0)
		for (const preset of STORY_CALENDAR_PRESETS) assert.deepEqual(storyCalendarProblems(preset.calendar), [])
	})
})

describe('story calendar — validation of a date', () => {
	test('free-form accepts any positive parts', () => {
		assert.equal(storyTimeProblem({ year: 3, month: 40, day: 250 }, null), null)
	})

	test('a declared calendar refuses a month or day that does not land', () => {
		assert.equal(storyTimeProblem({ year: 3, month: 2, day: 31 }, THAW), null)
		assert.match(storyTimeProblem({ year: 3, month: 4 }, THAW)!, /month/i)
		assert.match(storyTimeProblem({ year: 3, month: 1, day: 31 }, THAW)!, /Thaw/)
		// A day needs a month to be a day OF.
		assert.match(storyTimeProblem({ year: 3, day: 2 }, THAW)!, /month/i)
	})

	test('the leap rule adds its day only in a leap year', () => {
		assert.equal(storyDaysInMonth(4, 3, THAW), 29)
		assert.equal(storyDaysInMonth(5, 3, THAW), 28)
		assert.equal(storyTimeProblem({ year: 4, month: 3, day: 29 }, THAW), null)
		assert.ok(storyTimeProblem({ year: 5, month: 3, day: 29 }, THAW))
		// Negative and zero years follow the same rule.
		assert.equal(storyDaysInMonth(0, 3, THAW), 29)
		assert.equal(storyDaysInMonth(-4, 3, THAW), 29)
	})
})

describe('story calendar — rollover', () => {
	test('free-form never rolls over: the finest part steps', () => {
		assert.deepEqual(nextStoryTime({ year: 1, month: 1, day: 31 }), { year: 1, month: 1, day: 32 })
		assert.deepEqual(nextStoryTime({ year: 1, month: 12 }), { year: 1, month: 13, day: null })
		assert.deepEqual(nextStoryTime({ year: 1 }), { year: 2, month: null, day: null })
	})

	test('a declared calendar rolls day into month and month into year', () => {
		assert.deepEqual(nextStoryTime({ year: 1, month: 1, day: 29 }, THAW), { year: 1, month: 1, day: 30 })
		assert.deepEqual(nextStoryTime({ year: 1, month: 1, day: 30 }, THAW), { year: 1, month: 2, day: 1 })
		assert.deepEqual(nextStoryTime({ year: 1, month: 3, day: 28 }, THAW), { year: 2, month: 1, day: 1 })
		// The leap day is a day like any other.
		assert.deepEqual(nextStoryTime({ year: 4, month: 3, day: 28 }, THAW), { year: 4, month: 3, day: 29 })
		assert.deepEqual(nextStoryTime({ year: 4, month: 3, day: 29 }, THAW), { year: 5, month: 1, day: 1 })
		// Month precision stays month precision.
		assert.deepEqual(nextStoryTime({ year: 1, month: 3 }, THAW), { year: 2, month: 1, day: null })
		assert.deepEqual(nextStoryTime({ year: 1 }, THAW), { year: 2, month: null, day: null })
		// Across the era boundary the stored year simply counts on.
		assert.deepEqual(nextStoryTime({ year: 0, month: 3, day: 29 }, THAW), { year: 1, month: 1, day: 1 })
	})

	test('the next date always sorts after the one it came from', () => {
		for (const from of [
			{ year: 1, month: 1, day: 30 },
			{ year: 4, month: 3, day: 29 },
			{ year: -1, month: 3, day: 28 },
			{ year: 1, month: 3 },
		])
			assert.ok(compareStoryTimes(nextStoryTime(from, THAW), from) > 0)
	})
})

describe('story calendar — spelling', () => {
	test('free-form spells exactly as today (open decision #4)', () => {
		assert.equal(formatStoryTime({ year: 412, month: 3, day: 5 }), 'Year 412, Mo. 3, Day 5')
		assert.equal(formatStoryTime({ year: 412, month: 3, day: 5 }, null), 'Year 412, Mo. 3, Day 5')
		assert.equal(formatStoryTime({ year: 412, month: 3, day: 5, hour: 22, minute: 30 }), 'Year 412, Mo. 3, Day 5, 22:30')
	})

	test('a declared calendar names the weekday, the month and the era', () => {
		// Year 1, Thaw 1 is day index 0 and a Moonday.
		assert.equal(storyDayIndex({ year: 1, month: 1, day: 1 }, THAW), 0)
		assert.equal(formatStoryTime({ year: 1, month: 1, day: 1 }, THAW), 'Moonday, 1 Thaw, Year 1 AR')
		assert.equal(formatStoryTime({ year: 1, month: 1, day: 2 }, THAW), 'Ashday, 2 Thaw, Year 1 AR')
		assert.equal(formatStoryTime({ year: 1, month: 2 }, THAW), 'Bloom, Year 1 AR')
		assert.equal(formatStoryTime({ year: 7 }, THAW), 'Year 7 AR')
		assert.equal(formatStoryTime({ year: 1, month: 1, day: 1, hour: 6, minute: 5 }, THAW), 'Moonday, 1 Thaw, Year 1 AR, 06:05')
	})

	test('a backwards era counts down to the next one', () => {
		assert.equal(formatStoryTime({ year: 0 }, THAW), 'Year 1 BR')
		assert.equal(formatStoryTime({ year: -299 }, THAW), 'Year 300 BR')
		// The day before Year 1 AR, Thaw 1 is the last day of 1 BR, a Restday.
		assert.equal(storyDayIndex({ year: 0, month: 3, day: 29 }, THAW), -1)
		assert.equal(formatStoryTime({ year: 0, month: 3, day: 29 }, THAW), 'Restday, 29 Ember, Year 1 BR')
	})

	test('no year label and no eras spell the bare number', () => {
		const plain: StoryCalendar = { months: [{ name: 'One', days: 10 }], yearLabel: '' }
		assert.equal(formatStoryTime({ year: 3, month: 1, day: 4 }, plain), '4 One, 3')
	})

	test('a date that does not land is spelled free-form rather than guessed at', () => {
		assert.equal(formatStoryTime({ year: 3, month: 9, day: 4 }, THAW), 'Year 3, Mo. 9, Day 4')
	})
})

describe('story calendar — one comparator', () => {
	test('under a declared calendar, compareStoryTimes agrees with the day index', () => {
		const dates = [
			{ year: -2, month: 3, day: 1 },
			{ year: 0, month: 3, day: 29 },
			{ year: 1, month: 1, day: 1 },
			{ year: 1, month: 1, day: 30 },
			{ year: 1, month: 2, day: 1 },
			{ year: 4, month: 3, day: 29 },
			{ year: 5, month: 1, day: 1 },
		]
		for (const a of dates)
			for (const b of dates)
				assert.equal(
					Math.sign(compareStoryTimes(a, b)),
					Math.sign(storyDayIndex(a, THAW)! - storyDayIndex(b, THAW)!),
					`${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
				)
	})

	test('the calendar never reorders: the comparator takes no calendar', () => {
		assert.equal(compareStoryTimes.length, 2)
	})
})
