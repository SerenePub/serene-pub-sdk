/**
 * The Actions disclosure's close table (ruled 2026-09-17): its toggle and
 * Escape close it; focus leaving it never does. The suite runs on `node`
 * with no DOM, so the ruling is pinned on the pure table the composer
 * consults rather than on a mounted row — see `actionsDisclosure.ts` for
 * the first-press-does-nothing defect the focus-out close caused.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shouldCloseActions } from '../core-catalog/src/ui/sessions/conversation/actionsDisclosure.js'

describe('shouldCloseActions', () => {
	describe('focusout', () => {
		it('never closes the row, wherever focus went', () => {
			for (const focusInside of [true, false])
				for (const overflowOpen of [true, false])
					assert.deepEqual(
						shouldCloseActions({ reason: 'focusout', focusInside, overflowOpen }),
						{ close: false, returnFocus: false },
					)
		})
	})

	describe('escape', () => {
		it('closes and returns focus to the toggle when focus was inside', () => {
			assert.deepEqual(
				shouldCloseActions({
					reason: 'escape',
					focusInside: true,
					overflowOpen: false,
				}),
				{ close: true, returnFocus: true },
			)
		})

		it('closes without moving focus when focus was elsewhere', () => {
			assert.deepEqual(
				shouldCloseActions({
					reason: 'escape',
					focusInside: false,
					overflowOpen: false,
				}),
				{ close: true, returnFocus: false },
			)
		})

		it('leaves the key to the More menu while it is open', () => {
			for (const focusInside of [true, false])
				assert.deepEqual(
					shouldCloseActions({ reason: 'escape', focusInside, overflowOpen: true }),
					{ close: false, returnFocus: false },
				)
		})
	})

	describe('toggle', () => {
		it('always closes, and never moves focus off the toggle', () => {
			for (const overflowOpen of [true, false])
				assert.deepEqual(
					shouldCloseActions({ reason: 'toggle', focusInside: true, overflowOpen }),
					{ close: true, returnFocus: false },
				)
		})
	})
})
