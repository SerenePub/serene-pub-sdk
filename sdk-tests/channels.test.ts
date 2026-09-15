/**
 * Channels and lanes (ruling 2026-09-09).
 *
 * A **channel** is an organizational bucket the genre declares by slug. A
 * **lane** under that slug is runtime and open-ended — it exists because a
 * pipeline wrote to it. `main` is always the default channel and lane 1 is
 * always the default lane, so a bare slug *is* lane 1 and every row written
 * before lanes existed is already canonical.
 *
 * The claim under test is that a plugin parses a channel string **the same way
 * core does**. The parser lives here rather than in core precisely so the two
 * cannot drift: a frame reading `message:created` off the port and the host
 * writing the row have to agree on what `text-messages:3` means, and an
 * agreement maintained by two implementations is not one.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	DEFAULT_CHANNEL,
	DEFAULT_LANE,
	formatChannel,
	isSameChannel,
	parseChannel,
} from '@serene-pub/sdk'

describe('parsing a channel', () => {
	test('a bare slug is lane 1, and did not ask for a lane', () => {
		assert.deepEqual(parseChannel('text-messages'), {
			slug: 'text-messages',
			lane: 1,
			explicit: false,
		})
	})

	test('main is the default channel and lane 1 the default lane', () => {
		assert.equal(DEFAULT_CHANNEL, 'main')
		assert.equal(DEFAULT_LANE, 1)
		for (const absent of [undefined, null, '', '   ', 42, {}])
			assert.deepEqual(
				parseChannel(absent),
				{ slug: 'main', lane: 1, explicit: false },
				'an absent channel is the default channel, not a union',
			)
	})

	test('`slug:n` names a lane, and `slug:1` names the default one on purpose', () => {
		assert.deepEqual(parseChannel('text-messages:3'), {
			slug: 'text-messages',
			lane: 3,
			explicit: true,
		})
		// The distinction the read semantics rest on: a bare slug is the whole
		// channel, `slug:1` is the default lane of it.
		assert.deepEqual(parseChannel('text-messages:1'), {
			slug: 'text-messages',
			lane: 1,
			explicit: true,
		})
		assert.deepEqual(parseChannel('main:2'), {
			slug: 'main',
			lane: 2,
			explicit: true,
		})
	})

	test('surrounding whitespace is not part of the name', () => {
		assert.deepEqual(parseChannel('  text-messages : 3 '), {
			slug: 'text-messages',
			lane: 3,
			explicit: true,
		})
	})

	test('an unreadable lane degrades to lane 1 and says so — it never throws', () => {
		for (const raw of [
			'phone:0',
			'phone:-1',
			'phone:1.5',
			'phone:abc',
			'phone:',
			'phone:01x',
		]) {
			const ref = parseChannel(raw)
			assert.equal(ref.slug, 'phone', raw)
			assert.equal(ref.lane, 1, raw)
			assert.equal(ref.explicit, false, raw)
			assert.match(
				ref.warning ?? '',
				/lane/,
				`${raw} degraded silently — a read that quietly changed lanes is indistinguishable from a lane with no history`,
			)
		}
	})

	test('a lane with no slug in front of it is the default channel', () => {
		const ref = parseChannel(':3')
		assert.equal(ref.slug, DEFAULT_CHANNEL)
		assert.equal(ref.lane, 1)
		assert.match(ref.warning ?? '', /channel/)
	})

	test('a readable channel carries no warning', () => {
		assert.equal(parseChannel('main').warning, undefined)
		assert.equal(parseChannel('phone:2').warning, undefined)
	})
})

describe('formatting a channel', () => {
	test('lane 1 is written as the bare slug — that is the canonical form', () => {
		assert.equal(formatChannel({ slug: 'main', lane: 1 }), 'main')
		assert.equal(formatChannel({ slug: 'text-messages', lane: 1 }), 'text-messages')
		assert.equal(formatChannel({ slug: 'text-messages' }), 'text-messages')
	})

	test('lane 2 and up carry the number', () => {
		assert.equal(formatChannel({ slug: 'text-messages', lane: 5 }), 'text-messages:5')
		assert.equal(formatChannel({ slug: 'main', lane: 2 }), 'main:2')
	})

	test('a missing or unreadable slug formats as the default channel', () => {
		assert.equal(formatChannel({ slug: '' }), 'main')
		assert.equal(formatChannel({ slug: '  ', lane: 4 }), 'main:4')
	})

	test('an unreadable lane formats as the default lane', () => {
		assert.equal(formatChannel({ slug: 'phone', lane: 0 }), 'phone')
		assert.equal(formatChannel({ slug: 'phone', lane: -3 }), 'phone')
		assert.equal(formatChannel({ slug: 'phone', lane: 2.7 }), 'phone')
	})
})

describe('round-tripping', () => {
	test('format ∘ parse is the canonical form, and it is a fixed point', () => {
		const cases: Array<[string, string]> = [
			['main', 'main'],
			['main:1', 'main'],
			['text-messages', 'text-messages'],
			['text-messages:1', 'text-messages'],
			['text-messages:3', 'text-messages:3'],
			['  phone : 2 ', 'phone:2'],
			['phone:0', 'phone'],
		]
		for (const [raw, canonical] of cases) {
			assert.equal(formatChannel(parseChannel(raw)), canonical, raw)
			assert.equal(
				formatChannel(parseChannel(canonical)),
				canonical,
				`${canonical} is not a fixed point — normalising twice moved the row`,
			)
		}
	})

	test('every row written before lanes existed is already canonical', () => {
		// The whole reason there is no migration: `main` in the column parses
		// to lane 1 and formats back to `main`, byte for byte.
		assert.equal(formatChannel(parseChannel('main')), 'main')
	})
})

describe('comparing channels', () => {
	test('the slug is the reference and the number is multiplicity', () => {
		assert.ok(isSameChannel('main', 'main:1'))
		assert.ok(isSameChannel('phone:2', ' phone:2 '))
		assert.ok(!isSameChannel('phone', 'phone:2'))
		assert.ok(!isSameChannel('phone:2', 'map:2'))
		// An absent channel is `main`, so it equals `main`.
		assert.ok(isSameChannel(undefined, 'main'))
	})
})
