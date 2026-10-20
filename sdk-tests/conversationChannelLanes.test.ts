/**
 * 🚧 A conversation copy's channel list and the rows it holds: a bare slug is
 * every lane of its channel, a listed lane (`parley:2`, `parley:1`) that lane
 * alone, and the no-lane marker nothing.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
	NO_LANE_CHANNEL,
	canonicalListedChannel,
	isNoLaneChannel,
	rowOnListedChannels,
} from '../core-catalog/src/shared/ui/conversation/index.js'

describe('rows on a copy\'s listed channels', () => {
	it('a bare slug holds every lane of its channel', () => {
		for (const row of ['parley', 'parley:2', 'parley:1'])
			assert.equal(rowOnListedChannels(['parley'], row), true)
		assert.equal(rowOnListedChannels(['parley'], 'main'), false)
	})

	it('an unset row channel is main', () => {
		assert.equal(rowOnListedChannels(['main'], undefined), true)
		assert.equal(rowOnListedChannels(['main'], ''), true)
	})

	it('a listed lane holds that lane alone, by canonical form', () => {
		assert.equal(rowOnListedChannels(['parley:2'], 'parley:2'), true)
		assert.equal(rowOnListedChannels(['parley:2'], 'parley'), false)
		assert.equal(rowOnListedChannels(['parley:2'], 'parley:3'), false)
		assert.equal(rowOnListedChannels(['parley:1'], 'parley'), true)
		assert.equal(rowOnListedChannels(['parley:1'], 'parley:1'), true)
		assert.equal(rowOnListedChannels(['parley:1'], 'parley:2'), false)
	})

	it('the no-lane marker holds nothing, and leaves the rest of the list working', () => {
		assert.equal(rowOnListedChannels([NO_LANE_CHANNEL], 'parley'), false)
		assert.equal(rowOnListedChannels([NO_LANE_CHANNEL], 'main'), false)
		assert.equal(rowOnListedChannels([NO_LANE_CHANNEL, 'main'], 'main'), true)
		assert.equal(isNoLaneChannel(NO_LANE_CHANNEL), true)
		assert.equal(isNoLaneChannel('parley'), false)
	})

	it('a listed channel is written in canonical form', () => {
		assert.equal(canonicalListedChannel('parley:1'), 'parley')
		assert.equal(canonicalListedChannel('parley:2'), 'parley:2')
		assert.equal(canonicalListedChannel('main'), 'main')
		assert.equal(canonicalListedChannel(NO_LANE_CHANNEL), NO_LANE_CHANNEL)
	})
})
