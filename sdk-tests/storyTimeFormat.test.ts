/**
 * 🚧 A widget copy's `timeFormat` (owner ruling 2026-10-15: display formats
 * are widget settings, never SDK fields): the token language, the parts a
 * calendar names, and a change line rebuilt around it.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { StoryCalendar } from '@serene-pub/sdk'
import {
	formatStoryTimeAs,
	ledgerLineTextAs,
	shownValueText,
	storyTimePartsFrom,
	storyTimePartsOf,
} from '../core-catalog/src/shared/ui/session-state/index.js'

const calendar: StoryCalendar = {
	months: [
		{ name: 'Thaw', days: 30 },
		{ name: 'Bloom', days: 30 },
	],
	weekdays: ['Moonday', 'Sunday', 'Starday'],
}

describe('formatStoryTimeAs', () => {
	test('spells each token; an empty format is no format', () => {
		const t = { year: 412, month: 3, day: 5, hour: 8, minute: 5 }
		assert.equal(formatStoryTimeAs(t, 'Day {day}, {hh}:{mm}'), 'Day 5, 08:05')
		assert.equal(formatStoryTimeAs(t, '{year}-{month}-{day}'), '412-3-5')
		assert.equal(formatStoryTimeAs(t, ''), null)
		assert.equal(formatStoryTimeAs(t, '   '), null)
		assert.equal(formatStoryTimeAs(t, null), null)
	})
	test('a missing part reads as nothing and its dangling separators go; an unknown token stays', () => {
		assert.equal(formatStoryTimeAs({ year: 1, month: 1, day: 4 }, 'Day {day}, {hh}:{mm}'), 'Day 4')
		assert.equal(formatStoryTimeAs({ year: 1, month: 1, day: 4, hour: 9 }, '{hh}:{mm}'), '09:00')
		assert.equal(formatStoryTimeAs({ year: 1 }, 'Day {dya}'), 'Day {dya}')
	})
	test('names come through the calendar; free-form has none', () => {
		const parts = storyTimePartsOf({ year: 1, month: 1, day: 2, hour: 6, minute: 0 }, calendar)
		assert.equal(parts.monthName, 'Thaw')
		assert.equal(parts.dayName, 'Sunday')
		assert.equal(formatStoryTimeAs(parts, '{dayName} {day} {monthName}'), 'Sunday 2 Thaw')
		const free = storyTimePartsOf({ year: 1, month: 1, day: 2 })
		assert.equal(free.dayName, undefined)
		assert.equal(formatStoryTimeAs(free, '{monthName}'), '1')
	})
	test('parts off the wire are read defensively', () => {
		assert.equal(storyTimePartsFrom(null), null)
		assert.equal(storyTimePartsFrom({ month: 1 }), null)
		assert.deepEqual(storyTimePartsFrom({ year: 2, hour: 3, dayName: 7 }), {
			year: 2,
			month: null,
			day: null,
			hour: 3,
			minute: null,
			dayName: null,
			monthName: null,
		})
	})
})

describe('ledgerLineTextAs', () => {
	const clock = {
		text: 'Time passes: 30 minutes (Year 1, Mo. 1, Day 1, 08:00 → Year 1, Mo. 1, Day 1, 08:30)',
		storyTime: {
			kind: 'clock',
			head: 'Time passes: 30 minutes',
			from: { year: 1, month: 1, day: 1, hour: 8, minute: 0 },
			to: { year: 1, month: 1, day: 1, hour: 8, minute: 30 },
		},
	}
	test('no format, or no parts: the host words as they came', () => {
		assert.equal(ledgerLineTextAs(clock, ''), clock.text)
		assert.equal(ledgerLineTextAs({ text: 'hp 20 → 14' }, 'Day {day}'), 'hp 20 → 14')
	})
	test('a clock move and a story-time stat, spelled the copy way', () => {
		assert.equal(ledgerLineTextAs(clock, 'Day {day}, {hh}:{mm}'), 'Time passes: 30 minutes (Day 1, 08:00 → Day 1, 08:30)')
		const value = {
			text: 'Time Year 1, Mo. 1, Day 1, 08:00 → Year 1, Mo. 1, Day 1, 08:30',
			storyTime: {
				kind: 'value',
				label: 'Time',
				before: { year: 1, month: 1, day: 1, hour: 8, minute: 0 },
				after: { year: 1, month: 1, day: 1, hour: 8, minute: 30 },
			},
		}
		assert.equal(ledgerLineTextAs(value, 'Day {day}, {hh}:{mm}'), 'Time Day 1, 08:00 → Day 1, 08:30')
		assert.equal(
			ledgerLineTextAs({ ...value, storyTime: { ...value.storyTime, before: null } }, '{hh}:{mm}'),
			'Time → 08:30',
		)
	})
})

describe('shownValueText with a timeFormat', () => {
	const slot = { type: 'text', shape: 'core:stat-shape/story-time@1', field: { type: 'string', format: 'story-time' } } as Parameters<typeof shownValueText>[0]
	test('a story-time stat through the format; without one, through the calendar', () => {
		const t = (s: string) => s
		assert.equal(shownValueText(slot, '1-01-03 16:30', t, null, 'Day {day}, {hh}:{mm}'), 'Day 3, 16:30')
		assert.equal(shownValueText(slot, '1-01-03 16:30', t), 'Year 1, Mo. 1, Day 3, 16:30')
	})
})
