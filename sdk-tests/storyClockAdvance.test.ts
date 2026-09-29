/**
 * Advancing a story clock (DESIGN-story-time P3, §5 `advance(n, unit)`).
 *
 * By a declared calendar the step carries — minutes into hours into days into
 * months into years, the leap day included. Free-form has no unit lengths, so
 * a step changes only the part it names (the smallest-part rule): nothing
 * rolls into a month or a year, and a time of day carries into the day.
 * A result that does not land is refused with a sentence, never clamped.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	advanceStoryTime,
	storyDayIndex,
	storyTimeOfDayIndex,
	type StoryCalendar,
} from '@serene-pub/sdk'

const THAW: StoryCalendar = {
	months: [
		{ name: 'Thaw', days: 30 },
		{ name: 'Bloom', days: 31 },
		{ name: 'Ember', days: 28 },
	],
	leap: { every: 4, month: 3 },
}

describe('advance — by a declared calendar', () => {
	test('days carry through month ends and year ends, the leap day included', () => {
		assert.deepEqual(advanceStoryTime({ year: 3, month: 1, day: 29 }, 3, 'days', THAW), {
			time: { year: 3, month: 2, day: 2 },
		})
		// Year 4 is a leap year: Ember has 29 days.
		assert.deepEqual(advanceStoryTime({ year: 4, month: 3, day: 28 }, 1, 'days', THAW), {
			time: { year: 4, month: 3, day: 29 },
		})
		assert.deepEqual(advanceStoryTime({ year: 3, month: 3, day: 28 }, 1, 'days', THAW), {
			time: { year: 4, month: 1, day: 1 },
		})
		// Backwards, across a year.
		assert.deepEqual(advanceStoryTime({ year: 4, month: 1, day: 1 }, -1, 'days', THAW), {
			time: { year: 3, month: 3, day: 28 },
		})
	})

	test('hours and minutes carry into the day, and the day by the calendar', () => {
		assert.deepEqual(advanceStoryTime({ year: 3, month: 1, day: 30, hour: 22, minute: 30 }, 2, 'hours', THAW), {
			time: { year: 3, month: 2, day: 1, hour: 0, minute: 30 },
		})
		assert.deepEqual(advanceStoryTime({ year: 3, month: 1, day: 5, hour: 23, minute: 59 }, 1, 'minutes', THAW), {
			time: { year: 3, month: 1, day: 6, hour: 0, minute: 0 },
		})
		// A clock with no time of day reads as the start of its day.
		assert.deepEqual(advanceStoryTime({ year: 3, month: 1, day: 5 }, 90, 'minutes', THAW), {
			time: { year: 3, month: 1, day: 5, hour: 1, minute: 30 },
		})
	})

	test('months carry into years; a year-only clock steps years', () => {
		assert.deepEqual(advanceStoryTime({ year: 3, month: 3 }, 2, 'months', THAW), {
			time: { year: 4, month: 2 },
		})
		assert.deepEqual(advanceStoryTime({ year: 3 }, 10, 'years', THAW), { time: { year: 13 } })
	})

	test('refused when the result does not land — never clamped', () => {
		// Thaw 30 + one month is Bloom 30: lands. Bloom 31 + one month is Ember 31: does not.
		const r = advanceStoryTime({ year: 3, month: 2, day: 31 }, 1, 'months', THAW)
		assert.ok(r.problem)
		assert.match(r.problem!, /Ember has 28 days/)
		// The leap day a year later.
		assert.ok(advanceStoryTime({ year: 4, month: 3, day: 29 }, 1, 'years', THAW).problem)
	})

	test('refused when the clock lacks the part the unit counts', () => {
		assert.match(advanceStoryTime({ year: 3 }, 1, 'days', THAW).problem!, /no day/)
		assert.match(advanceStoryTime({ year: 3 }, 1, 'months', THAW).problem!, /no month/)
	})

	test('a step of nothing is refused, not a silent no-op', () => {
		assert.ok(advanceStoryTime({ year: 3 }, 0, 'years', THAW).problem)
		assert.ok(advanceStoryTime({ year: 3 }, 1.5, 'years', THAW).problem)
		assert.ok(advanceStoryTime({ year: 3 }, 1, 'weeks' as any, THAW).problem)
	})

	test('storyTimeOfDayIndex inverts storyDayIndex, far out and before year 1', () => {
		for (const t of [
			{ year: 1, month: 1, day: 1 },
			{ year: 4, month: 3, day: 29 },
			{ year: -7, month: 2, day: 13 },
			{ year: 40_000, month: 3, day: 28 },
		]) {
			const i = storyDayIndex(t, THAW)!
			assert.deepEqual(storyTimeOfDayIndex(i, THAW), t)
		}
	})
})

describe('advance — free-form, the smallest-part rule', () => {
	test('a step changes only the part it names; nothing rolls over', () => {
		assert.deepEqual(advanceStoryTime({ year: 3, month: 1, day: 31 }, 5, 'days'), {
			time: { year: 3, month: 1, day: 36 },
		})
		assert.deepEqual(advanceStoryTime({ year: 3, month: 12, day: 2 }, 3, 'months'), {
			time: { year: 3, month: 15, day: 2 },
		})
		assert.deepEqual(advanceStoryTime({ year: 3, month: 12 }, 2, 'years', null), {
			time: { year: 5, month: 12 },
		})
	})

	test('a time of day carries into the day, and the day does not roll', () => {
		assert.deepEqual(advanceStoryTime({ year: 3, month: 1, day: 31, hour: 23, minute: 0 }, 2, 'hours'), {
			time: { year: 3, month: 1, day: 32, hour: 1, minute: 0 },
		})
	})

	test('refused when it would land before day or month 1, or carry with no day', () => {
		assert.ok(advanceStoryTime({ year: 3, month: 1, day: 2 }, -2, 'days').problem)
		assert.ok(advanceStoryTime({ year: 3, month: 1 }, -1, 'months').problem)
		assert.match(advanceStoryTime({ year: 3, hour: 23, minute: 0 }, 2, 'hours').problem!, /no day/)
		// Within the day is fine with no day at all.
		assert.deepEqual(advanceStoryTime({ year: 3, hour: 20, minute: 0 }, 2, 'hours'), {
			time: { year: 3, hour: 22, minute: 0 },
		})
	})
})
