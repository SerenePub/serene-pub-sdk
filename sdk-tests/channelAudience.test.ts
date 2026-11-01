/**
 * A channel's `audience: { participants }` (M0, SHAPES L6; lane S4):
 * the declaration is accepted where it can mean what it says, refused with a
 * sentence where it cannot, and `channelAudience` hands the object back.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { channelAudience, genre } from '@serene-pub/sdk'

const declare = (id: string, channels: any) =>
	genre(id, { name: { en: 'X' }, family: 'test', shape: { channels } })


describe('a participants audience', () => {
	test('is accepted on a non-main channel, and with personal lanes', () => {
		assert.doesNotThrow(() =>
			declare('test.audience:genre/phone', [{ slug: 'phone', audience: { participants: ['user:1'] } }]),
		)
		assert.doesNotThrow(() =>
			declare('test.audience:genre/phone-lanes', [
				{ slug: 'phone', audience: { participants: ['user:1', 'character:2'] }, lanes: 'personal' },
			]),
		)
	})

	test('channelAudience returns the object (any lane of the slug), and all for the rest', () => {
		const shape = { channels: [{ slug: 'phone', audience: { participants: ['user:1'] } }, 'notes'] }
		assert.deepEqual(channelAudience(shape, 'phone'), { participants: ['user:1'] })
		assert.deepEqual(channelAudience(shape, 'phone:2'), { participants: ['user:1'] })
		assert.equal(channelAudience(shape, 'notes'), 'all')
		assert.equal(channelAudience({ channels: [{ slug: 'x', audience: { participants: [] } }] }, 'x'), 'all')
	})

	test('refused where it cannot mean what it says — a, b, c, d', () => {
		const sentence = (id: string, channels: any): string => {
			try {
				declare(id, channels)
			} catch (e) {
				return (e as Error).message
			}
			assert.fail('expected a refusal')
		}
		const a = sentence('test.audience:genre/a-empty', [{ slug: 'phone', audience: { participants: [] } }])
		assert.match(a, /declares audience \{"participants":\[\]\}\. A channel's audience is 'all', 'owner' or \{ participants: \[ … \] \} — every member, the session's owner alone, or the people named\.$/)
		const b = sentence('test.audience:genre/b-bad', [{ slug: 'phone', audience: { participants: ['nobody'] } }])
		assert.match(
			b,
			/declares audience participant 'nobody', which is not a participant reference — 'owner', 'user:<id>', 'character:<id>', 'player-seat:<id>' or 'envoy:<slug>'\.$/,
		)
		for (const r of ['ai', 'item', 'run-owner']) {
			const c = sentence(`test.audience:genre/c-${r}`, [{ slug: 'phone', audience: { participants: [r] } }])
			assert.match(
				c,
				new RegExp(
					`declares audience participant '${r}', which is never a person\\. Pipelines read every channel already; name the people who may read it\\.$`,
				),
			)
		}
		const d = sentence('test.audience:genre/d-main', [{ slug: 'main', audience: { participants: ['user:1'] } }])
		assert.match(
			d,
			/declares a participants audience\. 'main' is the channel every member reads; declare another channel for a conversation among a few\.$/,
		)
	})
})
