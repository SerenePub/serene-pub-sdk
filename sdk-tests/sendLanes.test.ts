/**
 * 🚧 M1 fix: a widget (or a session-view frame) that declares a channel may write to that channel's lanes —
 * `phone:12` is `phone`'s, as the host's own send door already read it — and the write grant is the channel's.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { widgetRequestRefusal } from '@serene-pub/sdk'

describe('send to a lane of a declared channel', () => {
	const from = { owner: 'acme.phone', channels: ['main', 'phone'], grants: ['channel:main:write', 'channel:phone:write'] }
	const send = (channel: unknown, f: Parameters<typeof widgetRequestRefusal>[1] = from) =>
		widgetRequestRefusal('send', f, { content: 'hi', personaId: null, channel })

	test('a declared channel covers its lanes, with the channel’s grant', () => {
		assert.equal(send('phone:12'), null)
		assert.equal(send('phone'), null)
		assert.equal(send('main:2'), null)
	})

	test('a lane of an undeclared channel is still refused', () => {
		assert.match(send('ooc:2')!, /'ooc:2', which is not one of this widget's channels/)
	})

	test('a lane needs its channel’s write grant', () => {
		const readOnly = { ...from, grants: ['channel:main:write'] }
		assert.match(send('phone:12', readOnly)!, /not granted the write grant 'channel:phone:write'/)
	})
})
