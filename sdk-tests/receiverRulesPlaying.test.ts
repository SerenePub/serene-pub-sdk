// Host elements 1.8: `audio` takes `playing`, core's alone (heading audio control, 2026-10-29).
// Imports the source, not dist, so it holds before the SDK is rebuilt.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receiverAttribute } from '../sdk/src/receiverRules.js'

test('audio `playing` is core\'s alone', () => {
	assert.deepEqual(receiverAttribute('audio', 'playing', '', 'core'), { value: '' })
	assert.ok('refused' in receiverAttribute('audio', 'playing', '', 'some-plugin'))
	assert.deepEqual(receiverAttribute('audio', 'playing', null, 'core'), { value: null })
})

test('no other element takes `playing`', () => {
	assert.ok('refused' in receiverAttribute('div', 'playing', '', 'core'))
})
