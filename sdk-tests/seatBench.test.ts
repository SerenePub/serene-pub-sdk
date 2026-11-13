/**
 * 🚧 `core:outlet/set-seat-bench@1` and the genre's `writes.seats` opt-in
 * (owner ruling 2026-11-10: a seat's status is managed by the genre, never by
 * core on its own). Absent is off.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { genre, getDefinition } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre, storyGenre } from '../core-catalog/src/index.js'

describe('core:outlet/set-seat-bench@1', () => {
	test('a write outlet with seat and benched in, and main, seat, seats out', () => {
		assert.equal(C.setSeatBench.id, 'core:outlet/set-seat-bench@1')
		const d = getDefinition('core:outlet/set-seat-bench@1')!
		assert.ok(d, 'registered')
		assert.equal(d.kind, 'outlet')
		assert.equal(d.effects, 'write')
		// R-15: an effectful definition declares its review fields; here approve-or-refuse.
		assert.deepEqual(d.review?.fields, [])
		assert.deepEqual(Object.keys(d.ports.in ?? {}).sort(), ['benched', 'seat'])
		assert.deepEqual(Object.keys(d.ports.out ?? {}).sort(), ['main', 'seat', 'seats'])
	})
})

describe('writes.seats at the declaration', () => {
	test('true and false are accepted', () => {
		assert.doesNotThrow(() =>
			genre('test.seatbench:genre/on', {
				name: { en: 'On' },
				family: 'test',
				shape: { writes: { seats: true } },
			}),
		)
		assert.doesNotThrow(() =>
			genre('test.seatbench:genre/off', {
				name: { en: 'Off' },
				family: 'test',
				shape: { writes: { seats: false } },
			}),
		)
	})

	test('a non-boolean is refused with a sentence naming the genre', () => {
		assert.throws(
			() =>
				genre('test.seatbench:genre/loose', {
					name: { en: 'Loose' },
					family: 'test',
					shape: { writes: { seats: 'yes' } } as any,
				}),
			/test\.seatbench:genre\/loose declares writes\.seats "yes"[\s\S]*boolean or absent/,
		)
	})
})

describe('who opts in', () => {
	test('Dungeon Crawler declares writes.seats; Story does not', () => {
		assert.equal(dungeonCrawlerGenre.shape?.writes?.seats, true)
		assert.equal(storyGenre.shape?.writes?.seats, undefined)
	})
})
