/**
 * Seat-cast S3, core-catalog's view-models: they read the identity the host
 * fills in (`ref`, `castMemberId`, `cardId`; owners' `ref`, `castMemberId`,
 * kind `seated_member`) and fall back to today's card form only when a field
 * is absent. Every switched reader is proved on four shapes:
 *
 * - **today** — a host before S3: no `ref`, `castMemberId` or `cardId`;
 * - **S3-filled** — the host fills them, still in the card form
 *   (`character:3`, cast member 7, card 3): output as before;
 * - **S4** — member refs `seated-member:<id>`, a carded player seat
 *   `player-seat:<id>`, member-keyed owners;
 * - **the collision** — a card id and a cast member id share one number
 *   range and may be different people: never the other person.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type {
	AttendeeV1,
	ParticipantRef,
	SessionCharacterV1,
	SessionCharactersV1,
	SessionStateOwnerV1,
	SessionStateV1,
} from '@serene-pub/sdk'
import {
	canAnswerForm,
	itemSpeakerOf,
	itemValuesOf,
	type FormSession,
} from '../core-catalog/src/shared/ui/conversation/index.js'
import {
	attendanceView,
	ATTENDANCE_DEFAULTS,
} from '../core-catalog/src/shared/ui/attendance/index.js'
import { LOCATION_SLOT_ID, placesPresence } from '../core-catalog/src/shared/ui/places/index.js'
import {
	SCENE_PORTRAITS_DEFAULTS,
	chosenImagesOf,
	pinnedPortraitsOf,
	sceneFiguresOf,
	scenePortraitMembersOf,
	scenePortraitsOf,
	stateOwnerKeyOf,
	type ScenePortraitsSettings,
} from '../core-catalog/src/shared/ui/scene-portraits/index.js'
import { plainRefusal, statsView } from '../core-catalog/src/shared/ui/session-state/index.js'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'

// ─── conversation: item.speaker / item.characterLine ────────────────────────

/** A cast lookup over `member id → ref`. */
const lookup =
	(table: Record<number, ParticipantRef>) =>
	(id: number): ParticipantRef | null =>
		table[id] ?? null

describe('itemSpeakerOf / itemValuesOf read the cast member', () => {
	test('today: no castMemberId, no lookup — the card form, unchanged', () => {
		assert.equal(itemSpeakerOf({ characterId: 3 }), 'character:3')
		assert.equal(itemSpeakerOf({ personaId: 3 }), 'character:3')
		assert.equal(itemSpeakerOf({ metadata: { speaker: 'player-seat:4' } }), 'player-seat:4')
		assert.equal(itemSpeakerOf({ metadata: { speaker: 'envoy:castellan' } }), 'envoy:castellan')
		assert.equal(itemSpeakerOf({}), null)
		const reply = itemValuesOf(
			{ id: 1, role: 'assistant', characterId: 3 },
			{ isNewest: true, mine: false },
		)
		assert.deepEqual([reply.speaker, reply.characterLine], ['character:3', true])
		const mine = itemValuesOf(
			{ id: 2, role: 'user', personaId: 3 },
			{ isNewest: false, mine: true },
		)
		assert.deepEqual([mine.speaker, mine.characterLine], ['character:3', false])
	})

	test('S3-filled card form: the lookup answers the card ref — output as before', () => {
		const refOfMember = lookup({ 7: 'character:3' })
		assert.equal(itemSpeakerOf({ characterId: 3, castMemberId: 7 }, refOfMember), 'character:3')
		const v = itemValuesOf(
			{ id: 1, role: 'assistant', characterId: 3, castMemberId: 7 },
			{ isNewest: true, mine: false, refOfMember },
		)
		assert.deepEqual([v.speaker, v.characterLine], ['character:3', true])
	})

	test('S4: the row names its cast member; the lookup gives the seat’s ref', () => {
		const refOfMember = lookup({ 7: 'seated-member:7', 8: 'player-seat:4' })
		const reply = itemValuesOf(
			{ id: 1, role: 'assistant', characterId: 3, castMemberId: 7 },
			{ isNewest: true, mine: false, refOfMember },
		)
		assert.deepEqual([reply.speaker, reply.characterLine], ['seated-member:7', true])
		// A carded player seat's own line: the person’s, never a character’s.
		const mine = itemValuesOf(
			{ id: 2, role: 'user', personaId: 3, castMemberId: 8 },
			{ isNewest: false, mine: true, refOfMember },
		)
		assert.deepEqual([mine.speaker, mine.characterLine], ['player-seat:4', false])
		// A row with no card at all still has a speaker.
		assert.equal(itemSpeakerOf({ castMemberId: 7 }, refOfMember), 'seated-member:7')
	})

	test('a miss, or no lookup, falls back to the card; an envoy still wins', () => {
		const refOfMember = lookup({ 7: 'seated-member:7' })
		assert.equal(itemSpeakerOf({ characterId: 3, castMemberId: 9 }, refOfMember), 'character:3')
		assert.equal(itemSpeakerOf({ characterId: 3, castMemberId: 7 }), 'character:3')
		assert.equal(
			itemSpeakerOf(
				{ characterId: 3, castMemberId: 7, metadata: { speaker: 'envoy:castellan' } },
				refOfMember,
			),
			'envoy:castellan',
		)
	})

	test('collision: member 3 and card 3 are different people — a row of card 3 is never member 3', () => {
		const refOfMember = lookup({ 3: 'seated-member:3', 7: 'seated-member:7' })
		// Card 3, spoken by member 7: member 7, not member 3.
		assert.equal(
			itemSpeakerOf({ characterId: 3, castMemberId: 7 }, refOfMember),
			'seated-member:7',
		)
		// Card 3 and no cast member on the row: the card form — the lookup is never asked for 3.
		assert.equal(itemSpeakerOf({ characterId: 3 }, refOfMember), 'character:3')
	})
})

// ─── conversation: canAnswerForm ────────────────────────────────────────────

const viewer = (userId: number, isOwner = false) => ({ userId, isOwner })

describe('canAnswerForm', () => {
	const todayCast: FormSession = {
		sessionPersonas: [
			{ id: 4, userId: 5, personaId: 3, persona: { userId: 5 } },
			{ id: 5, userId: 6, personaId: null, persona: null },
		],
		sessionCharacters: [{ characterId: 9 }],
	}

	test('today: character, card-less seat, envoy, user — unchanged', () => {
		assert.equal(canAnswerForm('character:3', viewer(5), todayCast), true)
		assert.equal(canAnswerForm('character:3', viewer(6), todayCast), false)
		assert.equal(canAnswerForm('character:9', viewer(1, true), todayCast), false)
		assert.equal(canAnswerForm('character:77', viewer(1, true), todayCast), true)
		assert.equal(canAnswerForm('character:77', viewer(2), todayCast), false)
		assert.equal(canAnswerForm('player-seat:5', viewer(6), todayCast), true)
		assert.equal(canAnswerForm('player-seat:5', viewer(5), todayCast), false)
		assert.equal(canAnswerForm('envoy:castellan', viewer(1, true), todayCast), false)
		assert.equal(canAnswerForm('user:5', viewer(5), todayCast), true)
		assert.equal(canAnswerForm(undefined, viewer(5), todayCast), true)
	})

	test('★27-3: a carded player seat answers its own form, with or without refs on the rows', () => {
		// Today’s data — seat 4 has a card (3).
		assert.equal(canAnswerForm('player-seat:4', viewer(5), todayCast), true)
		assert.equal(canAnswerForm('player-seat:4', viewer(6), todayCast), false)
		// A seat that does not exist is nobody’s.
		assert.equal(canAnswerForm('player-seat:44', viewer(5), todayCast), false)
	})

	const s3Cast: FormSession = {
		sessionPersonas: [
			{
				id: 4,
				userId: 5,
				personaId: 3,
				persona: { userId: 5 },
				ref: 'character:3',
				castMemberId: 7,
			},
		],
		sessionCharacters: [{ characterId: 9, ref: 'character:9', castMemberId: 8 }],
	}

	test('S3-filled card form: as before', () => {
		assert.equal(canAnswerForm('character:3', viewer(5), s3Cast), true)
		assert.equal(canAnswerForm('character:3', viewer(6), s3Cast), false)
		assert.equal(canAnswerForm('character:9', viewer(1, true), s3Cast), false)
		assert.equal(canAnswerForm('character:77', viewer(1, true), s3Cast), true)
		assert.equal(canAnswerForm('player-seat:4', viewer(5), s3Cast), true)
		// The member form reaches the same people by cast member.
		assert.equal(canAnswerForm('seated-member:7', viewer(5), s3Cast), true)
		assert.equal(canAnswerForm('seated-member:7', viewer(6), s3Cast), false)
		assert.equal(canAnswerForm('seated-member:8', viewer(1, true), s3Cast), false)
	})

	const s4Cast: FormSession = {
		sessionPersonas: [
			// A carded player seat: keyed `player-seat:<id>`, its cast member 7, its card 3.
			{
				id: 4,
				userId: 5,
				personaId: 3,
				persona: { userId: 5 },
				ref: 'player-seat:4',
				castMemberId: 7,
			},
			// A card-less player seat.
			{
				id: 6,
				userId: 8,
				personaId: null,
				persona: null,
				ref: 'player-seat:6',
				castMemberId: 12,
			},
		],
		sessionCharacters: [{ characterId: 9, ref: 'seated-member:8', castMemberId: 8 }],
	}

	test('S4: seats by their own ref; a carded player seat is answerable by its person', () => {
		assert.equal(canAnswerForm('player-seat:4', viewer(5), s4Cast), true)
		assert.equal(canAnswerForm('player-seat:4', viewer(6), s4Cast), false)
		assert.equal(canAnswerForm('player-seat:6', viewer(8), s4Cast), true)
		assert.equal(canAnswerForm('seated-member:7', viewer(5), s4Cast), true)
		assert.equal(canAnswerForm('seated-member:7', viewer(8), s4Cast), false)
		// A non-player member is the AI’s, even for the owner.
		assert.equal(canAnswerForm('seated-member:8', viewer(1, true), s4Cast), false)
		// Nobody’s: the owner’s.
		assert.equal(canAnswerForm('seated-member:99', viewer(1, true), s4Cast), true)
		assert.equal(canAnswerForm('seated-member:99', viewer(5), s4Cast), false)
	})

	test('collision: card 3 and member 3 are different people — never the other', () => {
		const cast: FormSession = {
			sessionPersonas: [
				// Person 5 plays member 7, whose card is 3.
				{
					id: 4,
					userId: 5,
					personaId: 3,
					persona: { userId: 5 },
					ref: 'seated-member:7',
					castMemberId: 7,
				},
			],
			// Member 3 is somebody else — the AI’s — and their card is 11.
			sessionCharacters: [{ characterId: 11, ref: 'seated-member:3', castMemberId: 3 }],
		}
		// Member 3 is the AI’s: person 5 does not answer for it, though their card is 3.
		assert.equal(canAnswerForm('seated-member:3', viewer(5), cast), false)
		assert.equal(canAnswerForm('seated-member:3', viewer(1, true), cast), false)
		assert.equal(canAnswerForm('seated-member:7', viewer(5), cast), true)
		// A row with a ref of its own is never matched by its card id from a member address.
		assert.equal(canAnswerForm('seated-member:11', viewer(1, true), cast), true)
	})
})

// ─── attendance ─────────────────────────────────────────────────────────────

describe('attendanceView reads each persona’s card off the member', () => {
	const member = (
		over: Partial<SessionCharacterV1> &
			Pick<SessionCharacterV1, 'ref' | 'characterId' | 'name'>,
	) =>
		({
			isPersona: true,
			mine: false,
			face: null,
			sprite: null,
			spriteSets: [],
			spriteSet: null,
			canChangeSpriteSet: false,
			...over,
		}) satisfies SessionCharacterV1
	const person = (personaRefs: ParticipantRef[]): AttendeeV1 => ({
		userId: 2,
		name: 'Marco',
		role: 'guest',
		personaRefs,
		typing: false,
		lastSeenAt: 1,
		here: true,
	})
	const view = (members: SessionCharacterV1[], personaRefs: ParticipantRef[]) =>
		attendanceView({
			attendance: { v: 1, people: [person(personaRefs)] },
			characters: { members, sceneImages: { left: null, right: null } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			settings: ATTENDANCE_DEFAULTS,
			now: 2,
			t: (s) => s,
		}).here[0]!.personas.map((p) => [p.ref, p.characterId, p.name])

	test('today, and S3-filled card form: the card id, as before', () => {
		assert.deepEqual(
			view([member({ ref: 'character:8', characterId: 8, name: 'Kit' })], ['character:8']),
			[['character:8', 8, 'Kit']],
		)
		assert.deepEqual(
			view(
				[
					member({
						ref: 'character:8',
						characterId: 8,
						castMemberId: 7,
						cardId: 8,
						name: 'Kit',
					}),
				],
				['character:8'],
			),
			[['character:8', 8, 'Kit']],
		)
	})

	test('S4: the ref is a member’s or a seat’s; what opens is the member’s card', () => {
		const members = [
			member({
				ref: 'seated-member:7',
				characterId: 7,
				castMemberId: 7,
				cardId: 8,
				name: 'Kit',
			}),
			member({
				ref: 'player-seat:4',
				characterId: 99,
				castMemberId: 9,
				cardId: 12,
				name: 'Sable',
			}),
			// Card-less: ⏳ `characterId` is all there is.
			member({
				ref: 'seated-member:10',
				characterId: 10,
				castMemberId: 10,
				cardId: null,
				name: 'Wren',
			}),
		]
		assert.deepEqual(view(members, ['seated-member:7', 'player-seat:4', 'seated-member:10']), [
			['seated-member:7', 8, 'Kit'],
			['player-seat:4', 12, 'Sable'],
			['seated-member:10', 10, 'Wren'],
		])
	})

	test('collision: member 3 and card 3 — a ref finds only the member that carries it; one the cast lacks is left out', () => {
		const members = [
			member({
				ref: 'seated-member:3',
				characterId: 3,
				castMemberId: 3,
				cardId: 12,
				name: 'Third',
			}),
			member({
				ref: 'seated-member:7',
				characterId: 7,
				castMemberId: 7,
				cardId: 3,
				name: 'Seventh',
			}),
		]
		assert.deepEqual(view(members, ['seated-member:7']), [['seated-member:7', 3, 'Seventh']])
		assert.deepEqual(view(members, ['character:3']), [])
	})
})

// ─── places ─────────────────────────────────────────────────────────────────

describe('placesPresence puts a cast owner’s face on its place by the owner’s ref', () => {
	const place = (id: number, name: string) => ({
		id,
		name,
		category: null,
		tint: null,
		linked: [],
	})
	const places = [place(1, 'The Guardroom'), place(2, 'The Hall')]
	const owner = (
		o: Partial<SessionStateOwnerV1> &
			Pick<SessionStateOwnerV1, 'key' | 'kind' | 'id' | 'label'>,
	) => ({
		configs: { [LOCATION_SLOT_ID]: {} },
		...o,
	})
	const stateOf = (owners: SessionStateOwnerV1[]): SessionStateV1 => ({
		sessionId: 1,
		loaded: true,
		error: null,
		resolved: {
			world: { 'core.location': { entryId: 1 } },
			cast: Object.fromEntries(
				owners
					.filter((o) => o.kind !== 'session')
					.map((o) => [o.key, { 'core.location': { entryId: 2 } }]),
			),
		},
		slots: [
			{
				slotId: LOCATION_SLOT_ID,
				key: 'location',
				qualifiedKey: 'core.location',
				label: 'Location',
				type: 'text',
				appliesTo: ['world', 'cast'],
			},
		] as SessionStateV1['slots'],
		owners: [owner({ key: 'world', kind: 'session', id: 1, label: 'World' }), ...owners],
	})
	const hall = (s: SessionStateV1) => placesPresence(s, places as never).present.get(2)

	test('today: a card owner with no ref — `character:<card>`, as before', () => {
		assert.deepEqual(
			hall(stateOf([owner({ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira' })])),
			[{ ref: 'character:11', name: 'Mira' }],
		)
	})

	test('S3-filled: the owner’s own ref wins', () => {
		assert.deepEqual(
			hall(
				stateOf([
					owner({
						key: 'mira',
						kind: 'session_cast',
						id: 11,
						label: 'Mira',
						ref: 'character:11',
						castMemberId: 7,
					}),
				]),
			),
			[{ ref: 'character:11', name: 'Mira' }],
		)
	})

	test('S4: a seated member places a face by its member ref, with or without the host’s ref', () => {
		assert.deepEqual(
			hall(
				stateOf([
					owner({
						key: 'mira',
						kind: 'seated_member',
						id: 7,
						label: 'Mira',
						ref: 'seated-member:7',
						castMemberId: 7,
					}),
					owner({ key: 'bram', kind: 'seated_member', id: 8, label: 'Bram' }),
				]),
			),
			[
				{ ref: 'seated-member:7', name: 'Mira' },
				{ ref: 'seated-member:8', name: 'Bram' },
			],
		)
	})

	test('collision: card 3 and member 3 place distinct faces', () => {
		assert.deepEqual(
			hall(
				stateOf([
					owner({ key: 'a', kind: 'session_cast', id: 3, label: 'Card three' }),
					owner({
						key: 'b',
						kind: 'seated_member',
						id: 3,
						label: 'Member three',
						ref: 'seated-member:3',
						castMemberId: 3,
					}),
				]),
			),
			[
				{ ref: 'character:3', name: 'Card three' },
				{ ref: 'seated-member:3', name: 'Member three' },
			],
		)
	})
})

// ─── scene portraits ────────────────────────────────────────────────────────

const faceOf = (
	over: Partial<SessionCharacterV1> & Pick<SessionCharacterV1, 'ref' | 'characterId' | 'name'>,
): SessionCharacterV1 => ({
	isPersona: false,
	mine: false,
	face: `/media/${over.name}`,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	canChangeSpriteSet: false,
	...over,
})
const castOf = (...members: SessionCharacterV1[]): SessionCharactersV1 => ({
	members,
	sceneImages: { left: null, right: null },
})
const portraitSettings = (over: Partial<ScenePortraitsSettings> = {}): ScenePortraitsSettings => ({
	...SCENE_PORTRAITS_DEFAULTS,
	face: 'chosen',
	...over,
})
const ownerOf = (
	o: Partial<SessionStateOwnerV1> & Pick<SessionStateOwnerV1, 'key' | 'kind' | 'id' | 'label'>,
): SessionStateOwnerV1 => ({ configs: {}, ...o })
const stateWith = (...owners: SessionStateOwnerV1[]): SessionStateV1 => ({
	sessionId: 1,
	loaded: true,
	error: null,
	resolved: { world: {}, cast: {} },
	slots: [],
	owners,
})

describe('chosenImagesOf', () => {
	test('reads `seated-member:<id>` and ⏳ `character:<id>` lines; anything else is skipped', () => {
		const got = chosenImagesOf([
			'seated-member:7=u-7',
			'character:3=u-3',
			'player-seat:4=nope',
			'seated-member:x=nope',
			'seated-member:7=second-ignored',
		])
		assert.deepEqual(
			[...got],
			[
				['seated-member:7', 'u-7'],
				['character:3', 'u-3'],
			],
		)
	})
})

describe('scenePortraitsOf: a member’s chosen image and state owner', () => {
	const portrait = (members: SessionCharacterV1[], chosen: string[], state?: SessionStateV1) =>
		scenePortraitsOf(castOf(...members), state, portraitSettings({ chosenImages: chosen }))[0]!

	test('today: keyed by `character:<id>`, owner by the card — as before', () => {
		const p = portrait(
			[faceOf({ ref: 'character:3', characterId: 3, name: 'Ada' })],
			['character:3=u-3'],
			stateWith(ownerOf({ key: 'ada', kind: 'session_cast', id: 3, label: 'Ada' })),
		)
		assert.deepEqual(
			[p.key, p.characterId, p.castMemberId, p.cardId, p.chosenRef, p.ownerKey],
			['character:3', 3, null, null, 'u-3', 'ada'],
		)
	})

	test('S3-filled card form: the line under the ref, or the one under the cast member; owner by ref', () => {
		const m = faceOf({
			ref: 'character:3',
			characterId: 3,
			castMemberId: 7,
			cardId: 3,
			name: 'Ada',
		})
		const state = stateWith(
			ownerOf({
				key: 'ada',
				kind: 'session_cast',
				id: 3,
				label: 'Ada',
				ref: 'character:3',
				castMemberId: 7,
			}),
		)
		const a = portrait([m], ['character:3=u-3'], state)
		assert.deepEqual([a.castMemberId, a.cardId, a.chosenRef, a.ownerKey], [7, 3, 'u-3', 'ada'])
		// The store rekeyed (S4) while the host still sends the card ref: the cast member’s line.
		assert.equal(portrait([m], ['seated-member:7=u-7'], state).chosenRef, 'u-7')
		// Both: the member’s own ref wins.
		assert.equal(
			portrait([m], ['seated-member:7=u-7', 'character:3=u-3'], state).chosenRef,
			'u-3',
		)
	})

	test('S4: a member ref, a seated_member owner, a carded player seat', () => {
		const state = stateWith(
			ownerOf({
				key: 'ada',
				kind: 'seated_member',
				id: 7,
				label: 'Ada',
				ref: 'seated-member:7',
				castMemberId: 7,
			}),
		)
		const p = portrait(
			[
				faceOf({
					ref: 'seated-member:7',
					characterId: 3,
					castMemberId: 7,
					cardId: 3,
					name: 'Ada',
				}),
			],
			['seated-member:7=u-7'],
			state,
		)
		assert.deepEqual([p.key, p.chosenRef, p.ownerKey], ['seated-member:7', 'u-7', 'ada'])
		const seat = portrait(
			[
				faceOf({
					ref: 'player-seat:4',
					characterId: 3,
					castMemberId: 7,
					cardId: 3,
					name: 'Ada',
				}),
			],
			['seated-member:7=u-7'],
			state,
		)
		assert.deepEqual([seat.key, seat.chosenRef, seat.ownerKey], ['player-seat:4', 'u-7', 'ada'])
	})

	test('collision: card 3 and member 3 — never the other person’s line or owner', () => {
		// Member 7 (card 3). Member 3 is somebody else, with a line and an owner of their own.
		const m = faceOf({
			ref: 'seated-member:7',
			characterId: 3,
			castMemberId: 7,
			cardId: 3,
			name: 'Ada',
		})
		const state = stateWith(
			ownerOf({
				key: 'other',
				kind: 'seated_member',
				id: 3,
				label: 'Other',
				ref: 'seated-member:3',
				castMemberId: 3,
			}),
		)
		const p = portrait([m], ['seated-member:3=u-other', 'character:7=u-card-7'], state)
		assert.deepEqual([p.chosenRef, p.ownerKey], [null, null])
		// A card-form member (no castMemberId, a host before S3) never matches an owner that names itself.
		const old = portrait(
			[faceOf({ ref: 'character:3', characterId: 3, name: 'Ada' })],
			[],
			state,
		)
		assert.equal(old.ownerKey, null)
	})

	test('pick: a `seated-member:<id>` line finds its member whatever form the member’s ref takes; card 3 is not member 3', () => {
		const bee = faceOf({
			ref: 'character:3',
			characterId: 3,
			name: 'Bee',
			castMemberId: 7,
			cardId: 3,
		})
		const cy = faceOf({
			ref: 'character:4',
			characterId: 4,
			name: 'Cy',
			castMemberId: 3,
			cardId: 4,
		})
		const today = faceOf({ ref: 'character:5', characterId: 5, name: 'Dee' })
		const picked = (lines: string[]) =>
			scenePortraitMembersOf(
				castOf(bee, cy, today),
				portraitSettings({ who: 'pick', pickMembers: lines }),
			).map((m) => m.name)
		assert.deepEqual(picked(['seated-member:7']), ['Bee'])
		assert.deepEqual(picked(['seated-member:3']), ['Cy'])
		assert.deepEqual(picked(['character:5', 'Bee']), ['Dee', 'Bee'])
	})

	test('sceneFiguresOf shows a seat held by a seated member', () => {
		const state = stateWith(
			ownerOf({
				key: 'ash',
				kind: 'seated_member',
				id: 7,
				label: 'Ash',
				seat: true,
				ref: 'seated-member:7',
			}),
		)
		const figs = sceneFiguresOf(castOf(), state, {
			...SCENE_PORTRAITS_DEFAULTS,
			playerSeats: true,
		})
		assert.deepEqual(
			figs.map((f) => [f.key, f.kind]),
			[['ash', 'player-seat']],
		)
	})
})

describe('stateOwnerKeyOf', () => {
	const today = stateWith(ownerOf({ key: 'ada', kind: 'session_cast', id: 3, label: 'Ada' }))

	test('today: the card id, with or without a member', () => {
		assert.equal(stateOwnerKeyOf(today, 3), 'ada')
		assert.equal(stateOwnerKeyOf(today, 4), null)
		assert.equal(stateOwnerKeyOf(today, 3, { ref: 'character:3', castMemberId: 7 }), 'ada')
		assert.equal(stateOwnerKeyOf(undefined, 3), null)
	})

	test('S3-filled and S4: by the owner’s ref or cast member', () => {
		const s3 = stateWith(
			ownerOf({
				key: 'ada',
				kind: 'session_cast',
				id: 3,
				label: 'Ada',
				ref: 'character:3',
				castMemberId: 7,
			}),
		)
		assert.equal(stateOwnerKeyOf(s3, 3, { ref: 'character:3', castMemberId: 7 }), 'ada')
		assert.equal(
			stateOwnerKeyOf(s3, 3),
			null,
			'an owner that names itself is not matched by a bare card id',
		)
		const s4 = stateWith(
			ownerOf({
				key: 'ada',
				kind: 'seated_member',
				id: 7,
				label: 'Ada',
				ref: 'seated-member:7',
				castMemberId: 7,
			}),
		)
		assert.equal(stateOwnerKeyOf(s4, 3, { ref: 'seated-member:7', castMemberId: 7 }), 'ada')
		assert.equal(stateOwnerKeyOf(s4, 3, { castMemberId: 7 }), 'ada')
		assert.equal(stateOwnerKeyOf(s4, 3, { ref: 'character:3' }), null)
	})

	test('collision: owner of member 3 is not card 3’s', () => {
		const s = stateWith(
			ownerOf({
				key: 'a',
				kind: 'seated_member',
				id: 3,
				label: 'A',
				ref: 'seated-member:3',
				castMemberId: 3,
			}),
			ownerOf({
				key: 'b',
				kind: 'seated_member',
				id: 7,
				label: 'B',
				ref: 'seated-member:7',
				castMemberId: 7,
			}),
		)
		assert.equal(stateOwnerKeyOf(s, 3, { ref: 'seated-member:7', castMemberId: 7 }), 'b')
		assert.equal(stateOwnerKeyOf(s, 3), null)
	})
})

describe('pinnedPortraitsOf (⏳ deprecated)', () => {
	const pinned = (state: SessionStateV1 | undefined, ref: ParticipantRef | null) =>
		pinnedPortraitsOf(
			{ members: [], sceneImages: { left: { src: '/media/pin', ref }, right: null } },
			state,
		)[0]!.ownerKey

	test('today: the pin’s card ref finds the card owner', () => {
		assert.equal(
			pinned(
				stateWith(ownerOf({ key: 'ada', kind: 'session_cast', id: 3, label: 'Ada' })),
				'character:3',
			),
			'ada',
		)
		assert.equal(pinned(undefined, 'character:3'), null)
		assert.equal(
			pinned(
				stateWith(ownerOf({ key: 'ada', kind: 'session_cast', id: 3, label: 'Ada' })),
				null,
			),
			null,
		)
	})

	test('S3-filled and S4: the pin’s ref against the owners’ refs', () => {
		const s3 = stateWith(
			ownerOf({ key: 'ada', kind: 'session_cast', id: 3, label: 'Ada', ref: 'character:3' }),
		)
		assert.equal(pinned(s3, 'character:3'), 'ada')
		const s4 = stateWith(
			ownerOf({
				key: 'ada',
				kind: 'seated_member',
				id: 7,
				label: 'Ada',
				ref: 'seated-member:7',
			}),
		)
		assert.equal(pinned(s4, 'seated-member:7'), 'ada')
	})

	test('collision: a card pin never lands on member 3’s owner', () => {
		const s = stateWith(
			ownerOf({ key: 'a', kind: 'seated_member', id: 3, label: 'A', ref: 'seated-member:3' }),
		)
		assert.equal(pinned(s, 'character:3'), null)
	})
})

// ─── session state ──────────────────────────────────────────────────────────

describe('statsView: a seated member is a cast member', () => {
	const hp = {
		slotId: 'core:slot/hp@1',
		key: 'hp',
		qualifiedKey: 'core.hp',
		label: 'HP',
		type: 'integer',
		appliesTo: ['cast'],
	}
	const cfg = { 'core:slot/hp@1': { min: 0, max: 20 } }
	const state = (owners: SessionStateOwnerV1[]): SessionStateV1 => ({
		sessionId: 1,
		loaded: true,
		error: null,
		resolved: {
			world: {},
			cast: Object.fromEntries(owners.map((o) => [o.key, { 'core.hp': 5 }])),
		},
		slots: [hp] as SessionStateV1['slots'],
		owners,
	})
	const keysOf = (v: ReturnType<typeof statsView>) =>
		v.status === 'shown'
			? v.groups.flatMap((g) => g.owners.map((o) => o.owner.key))
			: [v.status]

	test('today: session_cast owners are the cast, picked by label or key', () => {
		const s = state([
			{ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira', configs: cfg },
			{ key: 'bram', kind: 'session_cast', id: 12, label: 'Bram', configs: cfg },
		])
		assert.deepEqual(keysOf(statsView(s, { castScope: 'all' })), ['mira', 'bram'])
		assert.deepEqual(keysOf(statsView(s, { owners: 'pick', pickOwners: ['Bram'] })), ['bram'])
	})

	test('S4: seated_member owners are drawn, found by `mine` and `seats`, and picked by their ref', () => {
		const s = state([
			{
				key: 'mira',
				kind: 'seated_member',
				id: 7,
				label: 'Mira',
				ref: 'seated-member:7',
				castMemberId: 7,
				seat: true,
				mine: true,
				configs: cfg,
			} as never,
			{
				key: 'bram',
				kind: 'seated_member',
				id: 8,
				label: 'Bram',
				ref: 'seated-member:8',
				castMemberId: 8,
				configs: cfg,
			},
		])
		assert.deepEqual(keysOf(statsView(s, { castScope: 'all' })), ['mira', 'bram'])
		assert.deepEqual(keysOf(statsView(s, { owners: 'mine' })), ['mira'])
		assert.deepEqual(keysOf(statsView(s, { owners: 'seats' })), ['mira'])
		assert.deepEqual(
			keysOf(statsView(s, { owners: 'pick', pickOwners: ['Seated-Member:8'] })),
			['bram'],
		)
	})

	test('collision: picking member 3 by ref never picks the owner whose card is 3', () => {
		const s = state([
			{ key: 'a', kind: 'session_cast', id: 3, label: 'A', configs: cfg },
			{
				key: 'b',
				kind: 'seated_member',
				id: 3,
				label: 'B',
				ref: 'seated-member:3',
				castMemberId: 3,
				configs: cfg,
			},
		])
		assert.deepEqual(
			keysOf(statsView(s, { owners: 'pick', pickOwners: ['seated-member:3'] })),
			['b'],
		)
	})

	test('a refusal that names the machinery is worded plainly, `seated_member` and `seated-member` too', () => {
		for (const said of ['No owner of kind seated_member', 'Nobody seated-member 7 here'])
			assert.deepEqual(plainRefusal(said), {
				text: "You can't change this right now.",
				detail: said,
			})
		assert.deepEqual(plainRefusal('Your sheet is kept by the Narrator.'), {
			text: 'Your sheet is kept by the Narrator.',
			detail: null,
		})
	})
})

// ─── Scene Portraits help text ──────────────────────────────────────────────

describe('Scene Portraits copy (★S3-8)', () => {
	const settings = CORE_WIDGETS.find((w) => w.id === 'scene-portraits')!.settings as Record<
		string,
		{ description?: string }
	>
	test('the chosen-images description is a picker sentence with no raw ref', () => {
		assert.equal(
			settings.chosenImages!.description,
			"Pick each character's image on its face in the widget. A character with none shows its avatar.",
		)
	})
	test('the members description stays ref-free', () => {
		assert.equal(/\w+:\d|<id>/.test(settings.pickMembers!.description ?? ''), false)
	})
})

describe('S4: a player seat owner is found by its ref only', () => {
	const seat = stateWith(
		ownerOf({
			key: 'player_seat:4',
			kind: 'player_seat',
			id: 4,
			label: 'Mira',
			ref: 'player-seat:4',
			castMemberId: 7,
		}),
	)

	test('stateOwnerKeyOf: by ref; never by the cast member id a character seat shares', () => {
		assert.equal(
			stateOwnerKeyOf(seat, 9, { ref: 'player-seat:4', castMemberId: 7 }),
			'player_seat:4',
		)
		assert.equal(stateOwnerKeyOf(seat, 9, { ref: 'seated-member:7', castMemberId: 7 }), null)
		assert.equal(stateOwnerKeyOf(seat, 9, { castMemberId: 7 }), null)
	})

	test('pinnedPortraitsOf: a pin with the seat’s ref finds its owner', () => {
		const cast: SessionCharactersV1 = {
			members: [],
			sceneImages: { left: { src: '/m/x', ref: 'player-seat:4' }, right: null },
		}
		assert.equal(pinnedPortraitsOf(cast, seat)[0]!.ownerKey, 'player_seat:4')
	})
})

describe('S4: a stored `character:<cardId>=` line and a pick still reach the member (⏳ until S5)', () => {
	const m = faceOf({
		ref: 'seated-member:7',
		characterId: 3,
		castMemberId: 7,
		cardId: 3,
		name: 'Ada',
	})
	const chosenOf = (lines: string[]) =>
		scenePortraitsOf(castOf(m), undefined, portraitSettings({ chosenImages: lines }))[0]!
			.chosenRef

	test('the card’s line is read; a line of the member’s own number is another card’s', () => {
		assert.equal(chosenOf(['character:3=u-3']), 'u-3')
		assert.equal(chosenOf(['character:7=u-x']), null)
		assert.equal(chosenOf(['character:3=u-3', 'seated-member:7=u-7']), 'u-7')
	})

	test('pick: `character:<cardId>` finds the member; `character:<castMemberId>` does not', () => {
		const picked = (line: string) =>
			scenePortraitMembersOf(
				castOf(m),
				portraitSettings({ who: 'pick', pickMembers: [line] }),
			).length
		assert.equal(picked('character:3'), 1)
		assert.equal(picked('character:7'), 0)
	})
})
