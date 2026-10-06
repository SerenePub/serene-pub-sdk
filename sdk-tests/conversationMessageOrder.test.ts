/**
 * The order maths: the draw sequence and the conversation index agree with each
 * other, an autoscroll lands at the end the newest message is at, the older
 * page is pulled from the far end, and the restore keeps the reader in place.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	atOlderEdge,
	autoscrollTarget,
	conversationIndex,
	orderedMessages,
	restoredScrollTop,
} from '../core-catalog/src/shared/ui/conversation/index.js'

const messages = [1, 2, 3, 4]

describe('draw sequence', () => {
	it('hands back the same array under oldest-first', () => {
		assert.equal(orderedMessages(messages, 'oldest-first'), messages)
	})

	it('reverses a copy under newest-first', () => {
		assert.deepEqual(orderedMessages(messages, 'newest-first'), [4, 3, 2, 1])
		assert.deepEqual(messages, [1, 2, 3, 4])
	})

	it('indexes every row back to its place in the conversation', () => {
		for (const order of ['oldest-first', 'newest-first'] as const) {
			const drawn = orderedMessages(messages, order)
			drawn.forEach((msg, row) => {
				const index = conversationIndex(row, messages.length, order)
				assert.equal(messages[index], msg)
			})
		}
	})
})

describe('autoscroll target', () => {
	it('is the far end under oldest-first and the top under newest-first', () => {
		assert.equal(autoscrollTarget('oldest-first', { scrollHeight: 900 }), 900)
		assert.equal(autoscrollTarget('newest-first', { scrollHeight: 900 }), 0)
	})
})

describe('older-message edge', () => {
	const metrics = (scrollTop: number) => ({
		scrollTop,
		scrollHeight: 2000,
		clientHeight: 500,
	})

	it('is the top under oldest-first', () => {
		assert.equal(atOlderEdge('oldest-first', metrics(199)), true)
		assert.equal(atOlderEdge('oldest-first', metrics(201)), false)
	})

	it('is the bottom under newest-first', () => {
		// 2000 − 500 = 1500 is the bottom; 200px short of it is 1300.
		assert.equal(atOlderEdge('newest-first', metrics(1301)), true)
		assert.equal(atOlderEdge('newest-first', metrics(1299)), false)
	})

	it('takes a threshold of its own', () => {
		assert.equal(atOlderEdge('oldest-first', metrics(400), 500), true)
	})
})

describe('scroll restore after a prepend', () => {
	const anchor = { previousScrollTop: 120, previousScrollHeight: 2000 }

	it('moves down by the height added above under oldest-first', () => {
		assert.equal(restoredScrollTop('oldest-first', anchor, 3200), 1320)
	})

	it('stays put under newest-first, where the rows land below', () => {
		assert.equal(restoredScrollTop('newest-first', anchor, 3200), 120)
	})
})
