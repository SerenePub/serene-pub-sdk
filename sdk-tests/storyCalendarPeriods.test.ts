/**
 * A calendar's periods and seasons (M0, lane T2; SHAPES F2): each fault
 * has its own sentence, a declaration may leave the months out, the parse
 * keeps both, and a genre declaring a bad `shape.calendar` is refused.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { genre, parseStoryCalendar, storyCalendarProblems } from '@serene-pub/sdk'

const MONTHS = [{ name: 'Thaw', days: 30 }]
const LABELS = ['Spring', 'Summer', 'Autumn', 'Winter']
const problems = (extra: Record<string, unknown>, opts?: { declaration?: boolean }) =>
	storyCalendarProblems({ months: MONTHS, ...extra }, opts)

describe('periods', () => {
	test('a well-formed list has no fault', () => {
		assert.deepEqual(
			problems({ periods: [{ id: 'first-light', label: 'First light', from: 4 }, { id: 'noon', label: { en: 'Noon' }, from: 12 }] }),
			[],
		)
	})
	test('not a list', () => {
		assert.deepEqual(problems({ periods: 'dawn' }), ['Periods must be a list.'])
	})
	test('an id of lowercase words joined by -', () => {
		assert.deepEqual(problems({ periods: [{ id: 'Dawn', label: 'Dawn', from: 4 }] }), [
			"Period 1 needs an id of lowercase words joined by '-'.",
		])
	})
	test('a label', () => {
		assert.deepEqual(problems({ periods: [{ id: 'dawn', label: '  ', from: 4 }] }), ['Period 1 needs a label.'])
	})
	test('a starting hour from 0 to 23', () => {
		assert.deepEqual(problems({ periods: [{ id: 'dawn', label: 'Dawn', from: 24 }] }), [
			'Period 1 needs a starting hour from 0 to 23.',
		])
	})
	test('in order', () => {
		assert.deepEqual(
			problems({ periods: [{ id: 'a', label: 'A', from: 6 }, { id: 'b', label: 'B', from: 6 }] }),
			['Period 2 must start after period 1.'],
		)
	})
	test('ids differ', () => {
		assert.deepEqual(
			problems({ periods: [{ id: 'a', label: 'A', from: 6 }, { id: 'a', label: 'B', from: 7 }] }),
			["Period ids must differ: 'a' is used twice."],
		)
	})
})

describe('seasons', () => {
	test('a well-formed one has no fault', () => {
		assert.deepEqual(problems({ seasons: { days: 90, labels: LABELS } }), [])
	})
	test('a length of 1 to 1000 days', () => {
		assert.deepEqual(problems({ seasons: { days: 0, labels: LABELS } }), ['Seasons need a length of 1 to 1000 days.'])
		assert.deepEqual(problems({ seasons: { days: 1001, labels: LABELS } }), ['Seasons need a length of 1 to 1000 days.'])
	})
	test('four labels, in order', () => {
		assert.deepEqual(problems({ seasons: { days: 90, labels: ['a', 'b', 'c'] } }), ['Seasons need four labels, in order.'])
		assert.deepEqual(problems({ seasons: { days: 90, labels: ['a', 'b', 'c', ''] } }), ['Seasons need four labels, in order.'])
	})
})

describe('a declaration', () => {
	test('may leave the months out; a calendar may not', () => {
		const decl = { periods: [{ id: 'dawn', label: 'Dawn', from: 4 }] }
		assert.deepEqual(storyCalendarProblems(decl, { declaration: true }), [])
		assert.deepEqual(storyCalendarProblems(decl), ['A calendar needs at least one month.'])
	})
})

describe('parse', () => {
	test('keeps periods and seasons, trimming the id', () => {
		const out = parseStoryCalendar({
			months: MONTHS,
			periods: [{ id: ' dawn ', label: 'Dawn', from: 4 }],
			seasons: { days: 30, labels: LABELS },
		})
		assert.deepEqual(out?.periods, [{ id: 'dawn', label: 'Dawn', from: 4 }])
		assert.deepEqual(out?.seasons, { days: 30, labels: LABELS })
	})
})

describe('a genre’s shape.calendar', () => {
	test('a bad one throws with the sentences', () => {
		assert.throws(
			() =>
				genre('test.calendar:genre/bad', {
					name: { en: 'X' },
					family: 'test',
					shape: { calendar: { periods: [{ id: 'Dawn', label: 'Dawn', from: 4 }] } },
				}),
			/test\.calendar:genre\/bad\.shape\.calendar: Period 1 needs an id of lowercase words joined by '-'\./,
		)
	})
	test('a good one without months is accepted', () => {
		genre('test.calendar:genre/good', {
			name: { en: 'X' },
			family: 'test',
			shape: { calendar: { periods: [{ id: 'dawn', label: 'Dawn', from: 4 }] } },
		})
	})
})
