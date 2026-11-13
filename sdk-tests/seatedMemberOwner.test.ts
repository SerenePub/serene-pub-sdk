/**
 * The turn lock for a seated cast member (`openAnchorFor`, `isAnchorOpen` in
 * `@serene-pub/sdk`, seat-cast S3). A card id and a cast member id share one
 * number range, so a `seated_member` owner must match a row on its
 * `castMemberId` and never on `speakerId` — comparing them would silently
 * anchor to the wrong person. What is pinned: that match, with a card id
 * that collides numerically with the member id on a different row; a
 * `session_cast` owner (the card, removed in S5) still matches `speakerId`;
 * a member with no row has no anchor, and `null` is open.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { isAnchorOpen, openAnchorFor } from '@serene-pub/sdk'
import type { TurnMessage, TurnOwner } from '@serene-pub/sdk'

// Row 3's card is numbered 42, the same number as member 42, who spoke on row 2.
const messages: TurnMessage[] = [
	{ id: 1, speakerId: 7, castMemberId: 70 },
	{ id: 2, speakerId: 8, castMemberId: 42 },
	{ id: 3, speakerId: 42, castMemberId: 43 },
	{ id: 4, speakerId: 9, castMemberId: 90 },
]
const member: TurnOwner = { kind: 'seated_member', id: 42 }

describe('turn lock · seated_member owner', () => {
	test('anchors to the latest row whose castMemberId matches, not whose speakerId does', () => {
		assert.equal(openAnchorFor(messages, member), 2)
	})

	test('a speakerId that collides with the member id is not a match', () => {
		const onlyCard: TurnMessage[] = [
			{ id: 1, speakerId: 42, castMemberId: 5 },
			{ id: 2, speakerId: 42 },
		]
		assert.equal(openAnchorFor(onlyCard, member), null)
	})

	test('the member keeps its row open while others speak; a sealed row is not open', () => {
		assert.equal(isAnchorOpen(messages, member, 2), true)
		assert.equal(isAnchorOpen(messages, member, 4), false)
		assert.equal(isAnchorOpen(messages, member, null), false)
	})

	test('a member with no matching row has no anchor, and null is open', () => {
		const stranger: TurnOwner = { kind: 'seated_member', id: 999 }
		assert.equal(openAnchorFor(messages, stranger), null)
		assert.equal(isAnchorOpen(messages, stranger, null), true)
		assert.equal(isAnchorOpen(messages, stranger, 2), false)
	})
})

describe('turn lock · session_cast owner is unchanged', () => {
	test('still matches speakerId', () => {
		assert.equal(openAnchorFor(messages, { kind: 'session_cast', id: 42 }), 3)
		assert.equal(openAnchorFor(messages, { kind: 'session_cast', id: 8 }), 2)
	})

	test('the world is still the newest row', () => {
		assert.equal(openAnchorFor(messages, { kind: 'session', id: 1 }), 4)
	})
})
