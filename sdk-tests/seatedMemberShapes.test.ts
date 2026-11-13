/**
 * Seat-cast S3: the SDK shapes that name a seated cast member. Pinned here so a
 * later edit cannot drop them — `seated-member:<castMemberId>` as a seat
 * reference, `castMemberId` / `cardId` beside the old card fields, the
 * `seated_member` owner kind, and `set-chosen-image` taking `memberRef` as well
 * as the ⏳ `characterRef`. Every new field is optional, so a host that
 * predates S3 (the second `SessionCharacterV1` below) still type-checks. The
 * fixtures are types — the suite runs `tsc --noEmit` first, so a shape that
 * drifts fails there; the runtime asserts only read the fixtures back.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type {
	ConversationCastV1,
	MessageV1,
	OwnerRefV1,
	SessionCharacterV1,
	SessionStateOwnerV1,
	WidgetRequests,
} from '@serene-pub/sdk'

const base = {
	isPersona: false,
	mine: false,
	face: null,
	sprite: null,
	spriteSets: [] as string[],
	spriteSet: null,
	canChangeSpriteSet: false,
}

describe('seated cast member shapes (seat-cast S3)', () => {
	test('a character carries its cast member and active card; a card-less member has a null card', () => {
		const cardless = {
			...base,
			ref: 'seated-member:5',
			characterId: 0,
			castMemberId: 5,
			cardId: null,
			name: 'Mira',
		} satisfies SessionCharacterV1
		assert.equal(cardless.ref, 'seated-member:5')
		assert.equal(cardless.cardId, null)
	})

	test('an old host fills none of the new fields', () => {
		const old = {
			...base,
			ref: 'character:3',
			characterId: 3,
			name: 'Ada',
		} satisfies SessionCharacterV1
		assert.equal('castMemberId' in old, false)
	})

	test('a state owner names its seat ref and cast member', () => {
		const owner = {
			kind: 'seated_member',
			id: 5,
			key: '5',
			label: 'Mira',
			configs: {},
			ref: 'seated-member:5',
			castMemberId: 5,
		} satisfies SessionStateOwnerV1
		assert.equal(owner.castMemberId, 5)
	})

	test('an owner reference may be a seated member', () => {
		const owner = { kind: 'seated_member', id: 5 } satisfies OwnerRefV1
		assert.equal(owner.kind, 'seated_member')
	})

	test('a message carries the speaker cast member', () => {
		const message = { castMemberId: 5 } satisfies Pick<MessageV1, 'castMemberId'>
		assert.equal(message.castMemberId, 5)
	})

	test('the conversation cast rows carry ref and cast member', () => {
		const cast = {
			sessionPersonas: [
				{ personaId: 1, persona: { userId: 2 }, ref: 'player-seat:2', castMemberId: null },
			],
			sessionCharacters: [{ characterId: 3, ref: 'seated-member:5', castMemberId: 5 }],
		} satisfies ConversationCastV1
		assert.equal(cast.sessionCharacters[0]!.castMemberId, 5)
	})

	test('set-chosen-image takes memberRef, and the old characterRef still', () => {
		type Params = WidgetRequests['set-chosen-image']['params']
		const byMember = { memberRef: 'seated-member:5', mediaRef: 'media:1' } satisfies Params
		const byCard = { characterRef: 'character:3', mediaRef: null } satisfies Params
		assert.equal(byMember.memberRef, 'seated-member:5')
		assert.equal(byCard.characterRef, 'character:3')
	})
})
