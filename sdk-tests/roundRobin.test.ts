/**
 * Round robin as ONE public rule (`roundRobinOrder`, `spokenRefsSince`,
 * `countedTurns` in `@serene-pub/sdk`). Core's `core:task/turn-round-robin@1`
 * binding and a plugin's own strategy both run this code, so the cases here
 * reproduce the app's `speakerRotation.test.ts` and `turnStrategies.test.ts`
 * round-robin cases over the candidate vocabulary.
 *
 * What is pinned: once per turn of the person's — every candidate in order
 * after a user message, nobody when all have spoken, a fresh round on the
 * next send; a manual out-of-turn trigger counts for the round; hidden and
 * narrator rows are outside the rotation; an envoy's reply marks no
 * character and is read off `speaker` or `metadata.speaker`; a persona's own
 * send consumes its turn; every entry is `via: 'strategy'`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { countedTurns, roundRobinOrder, senderRefOf, spokenRefsSince } from '@serene-pub/sdk'
import type { ParticipantRef, TurnCandidateV1, TurnHistoryMessage } from '@serene-pub/sdk'
import { itemSpeakerOf } from '../core-catalog/src/shared/ui/conversation/index.js'

const cand = (ref: string, position: number, kind = 'character', ownerUserId = 1): TurnCandidateV1 =>
	({ ref, kind, name: ref, position, ownerUserId }) as TurnCandidateV1
const alice = cand('character:11', 0)
const bram = cand('character:22', 1)
const cleo = cand('character:33', 2)

const user = (personaId?: number): TurnHistoryMessage => ({ role: 'user', ...(personaId ? { personaId } : {}) })
const reply = (characterId: number): TurnHistoryMessage => ({ role: 'assistant', characterId })
const refs = (c: readonly TurnCandidateV1[], m: readonly TurnHistoryMessage[]) => roundRobinOrder(c, m).map((e) => e.ref)
const due = (c: readonly TurnCandidateV1[], m: readonly TurnHistoryMessage[]) => refs(c, m)[0] ?? null

describe('round robin · once per turn of the person', () => {
	test('seats every character once, in order, after a user message', () => {
		const seats = [alice, bram, cleo]
		const history: TurnHistoryMessage[] = [user()]
		assert.equal(due(seats, history), 'character:11')
		history.push(reply(11))
		assert.equal(due(seats, history), 'character:22')
		history.push(reply(22))
		assert.equal(due(seats, history), 'character:33')
		history.push(reply(33))
		assert.deepEqual(roundRobinOrder(seats, history), [])
	})

	test('starts a fresh round on the next user message', () => {
		assert.equal(due([alice, bram], [user(), reply(11), reply(22), user()]), 'character:11')
	})

	test("an out-of-turn trigger counts as that seat's turn for the round", () => {
		const seats = [alice, bram, cleo]
		const history = [user(), reply(33)]
		assert.deepEqual(refs(seats, history), ['character:11', 'character:22'])
		history.push(reply(11))
		assert.deepEqual(refs(seats, history), ['character:22'])
		history.push(reply(22))
		assert.deepEqual(refs(seats, history), [])
	})

	test('two sends in a row open a new round', () => {
		assert.equal(due([alice, bram], [user(), reply(11), user(), user()]), 'character:11')
	})

	test('hidden rows and narrator responses are outside the rotation', () => {
		const history: TurnHistoryMessage[] = [
			user(),
			{ role: 'assistant', characterId: 11, isHidden: true },
			{ role: 'assistant', characterId: null, isNarratorResponse: true },
		]
		assert.equal(due([alice, bram], history), 'character:11')
		assert.equal(countedTurns(history).length, 1)
	})

	test("an envoy's reply marks no character as having spoken", () => {
		const history: TurnHistoryMessage[] = [
			user(),
			{ role: 'assistant', characterId: null, metadata: { speaker: 'envoy:mascot' } },
		]
		assert.equal(due([alice], history), 'character:11')
	})

	test('before the person has spoken, a greeting counts and its absence does not', () => {
		assert.equal(due([alice, bram], []), 'character:11')
		assert.equal(due([alice, bram], [reply(11)]), 'character:22')
		assert.deepEqual(roundRobinOrder([alice, bram], [reply(11), reply(22)]), [])
	})

	test('an empty candidate list is an empty order, not a halt', () => {
		assert.deepEqual(roundRobinOrder([], [user()]), [])
	})
})

describe('round robin · the candidate vocabulary', () => {
	const pool = [
		cand('character:11', 0, 'character', 1),
		cand('character:12', 1, 'character', 2),
		cand('character:7', 0, 'persona', 1),
	]

	test('lists everyone who has not spoken since the person did, in candidate order', () => {
		assert.deepEqual(refs(pool, [user()]), ['character:11', 'character:12', 'character:7'])
	})

	test('drops a character that has already replied this round', () => {
		assert.deepEqual(refs(pool, [user(), reply(11)]), ['character:12', 'character:7'])
	})

	test("a persona's own send consumes its turn (R15)", () => {
		assert.deepEqual(refs(pool, [user(7)]), ['character:11', 'character:12'])
	})

	test("🚧 a card-less player seat's send consumes its turn, read off the line's `player-seat:` speaker", () => {
		const withSeat = [...pool, cand('player-seat:4', 1, 'persona', 2)]
		const seatLine: TurnHistoryMessage = { role: 'user', personaId: null, metadata: { speaker: 'player-seat:4' } }
		assert.deepEqual(refs(withSeat, [seatLine]), ['character:11', 'character:12', 'character:7'])
		assert.ok(spokenRefsSince([{ role: 'user', speaker: 'player-seat:4' }]).has('player-seat:4'))
		// A persona line names its persona, never a seat it might also carry.
		assert.deepEqual([...spokenRefsSince([{ role: 'user', personaId: 7, speaker: 'player-seat:4' }])], ['character:7'])
		// Only a person's opening line names a seat; a reply's `player-seat:` is not read.
		assert.ok(!spokenRefsSince([user(), { role: 'assistant', speaker: 'player-seat:4' }]).has('player-seat:4'))
	})

	test('everyone having spoken is an empty order', () => {
		assert.deepEqual(roundRobinOrder(pool, [user(7), reply(11), reply(12)]), [])
	})

	test("an envoy's reply is recognised by its reference (metadata.speaker)", () => {
		const withEnvoy = [...pool, cand('envoy:scribe', 0, 'envoy')]
		const out = refs(withEnvoy, [user(), { role: 'assistant', metadata: { speaker: 'envoy:scribe' } }])
		assert.ok(!out.includes('envoy:scribe'))
	})

	test("an envoy's reply read off session-history's projected `speaker` (M3)", () => {
		const history: TurnHistoryMessage[] = [
			{ role: 'user', characterId: null, personaId: null },
			{ role: 'assistant', characterId: null, speaker: 'envoy:mascot' },
		]
		assert.ok(spokenRefsSince(history).has('envoy:mascot'))
		assert.deepEqual(roundRobinOrder([cand('envoy:mascot', 0, 'envoy')], history), [])
	})

	test('every entry says how it was decided, and carries nothing else', () => {
		for (const entry of roundRobinOrder(pool, [user()])) assert.deepEqual(Object.keys(entry).sort(), ['ref', 'via'])
		for (const entry of roundRobinOrder(pool, [user()])) assert.equal(entry.via, 'strategy')
	})
})

describe('round robin · missing rows are skipped, never a throw', () => {
	test('countedTurns drops null and undefined rows', () => {
		const rows = [user(), null, reply(11), undefined] as (TurnHistoryMessage | null | undefined)[]
		assert.equal(countedTurns(rows).length, 2)
	})

	test('spokenRefsSince and roundRobinOrder read past a missing row', () => {
		const rows = [reply(22), null, user(), undefined, reply(11)] as (TurnHistoryMessage | null | undefined)[]
		assert.deepEqual([...spokenRefsSince(rows)], ['character:11'])
		assert.deepEqual(refs([alice, bram, cleo], rows as TurnHistoryMessage[]), ['character:22', 'character:33'])
	})
})

describe('round robin · cast member ids (seat-cast S3)', () => {
	// The host's cast: a cast member id -> the seat's `ref`.
	const lookup = (castMemberId: number) =>
		(({ 101: 'seated-member:101', 102: 'seated-member:102', 900: 'player-seat:7' }) as const)[
			castMemberId as 101 | 102 | 900
		]

	test("today's shape: no castMemberId, no lookup, the same refs as before", () => {
		const history: TurnHistoryMessage[] = [user(5), reply(11), reply(22)]
		assert.deepEqual(
			[...spokenRefsSince(history)],
			['character:11', 'character:22', 'character:5'],
		)
		assert.deepEqual(refs([alice, bram, cleo], history), ['character:33'])
		assert.equal(senderRefOf(user(5)), 'character:5')
		assert.equal(senderRefOf(reply(11)), null)
	})

	test('a lookup given but rows lacking castMemberId still read today', () => {
		const history: TurnHistoryMessage[] = [user(5), reply(11), reply(22)]
		assert.deepEqual(
			[...spokenRefsSince(history, lookup)],
			['character:11', 'character:22', 'character:5'],
		)
		assert.deepEqual(
			roundRobinOrder([alice, bram, cleo], history, lookup).map((e) => e.ref),
			['character:33'],
		)
		assert.equal(senderRefOf(user(5), lookup), 'character:5')
	})

	test('castMemberId without a lookup is ignored: the card form is read', () => {
		const history: TurnHistoryMessage[] = [
			{ role: 'user', personaId: 5, castMemberId: 900 },
			{ role: 'assistant', characterId: 11, castMemberId: 101 },
		]
		assert.deepEqual([...spokenRefsSince(history)], ['character:11', 'character:5'])
	})

	describe('S4 shape', () => {
		const m101 = cand('seated-member:101', 0)
		const m102 = cand('seated-member:102', 1)
		const seat7 = cand('player-seat:7', 2, 'persona')
		const sender: TurnHistoryMessage = { role: 'user', personaId: 5, castMemberId: 900 }
		const history: TurnHistoryMessage[] = [
			sender,
			{ role: 'assistant', characterId: 11, castMemberId: 101 },
			// A card-less member's reply: no card, only the member.
			{ role: 'assistant', characterId: null, castMemberId: 102 },
		]

		test('spokenRefsSince returns member refs and the seat, never character:', () => {
			const spoken = [...spokenRefsSince(history, lookup)].sort()
			assert.deepEqual(spoken, ['player-seat:7', 'seated-member:101', 'seated-member:102'])
			assert.equal(
				spoken.some((r) => r.startsWith('character:')),
				false,
			)
		})

		test('roundRobinOrder skips them', () => {
			assert.deepEqual(roundRobinOrder([m101, m102, seat7], history, lookup), [])
			assert.deepEqual(
				roundRobinOrder([m101, m102, seat7], history.slice(0, 2), lookup).map((e) => e.ref),
				['seated-member:102'],
			)
		})

		test('senderRefOf names the seat for the user row and nobody for a reply', () => {
			assert.equal(senderRefOf(sender, lookup), 'player-seat:7')
			assert.equal(senderRefOf(history[1]!, lookup), null)
			assert.equal(senderRefOf(history[2]!, lookup), null)
		})

		test('a lookup that misses falls back to character:<id>', () => {
			const miss = () => undefined
			assert.deepEqual([...spokenRefsSince(history, miss)].sort(), [
				'character:11',
				'character:5',
			])
			assert.equal(senderRefOf(sender, miss), 'character:5')
			assert.equal(
				senderRefOf(sender, () => null),
				'character:5',
			)
		})
	})
})

describe('round robin · the seat-kind hint (one cast member, two seats)', () => {
	// Member 7 holds a character seat and a player seat; a lookup that honours the hint.
	const both: Record<'character-seat' | 'player-seat', ParticipantRef> = {
		'character-seat': 'seated-member:7',
		'player-seat': 'player-seat:4',
	}
	const honours = (id: number, seatKind?: 'character-seat' | 'player-seat'): ParticipantRef | null =>
		id === 7 ? both[seatKind ?? 'player-seat'] : null
	// A lookup that ignores the hint: today's one-argument shape, character seat first.
	const ignores = (id: number): ParticipantRef | null => (id === 7 ? 'seated-member:7' : null)
	const person = { role: 'user', personaId: 12, castMemberId: 7 } as const
	const replyRow = { role: 'assistant', characterId: 3, castMemberId: 7 } as const

	test('senderRefOf asks for the player seat', () => {
		assert.equal(senderRefOf(person, honours), 'player-seat:4')
	})

	test('spokenRefsSince: a reply is the character seat, the opening person the player seat', () => {
		assert.deepEqual([...spokenRefsSince([person, replyRow], honours)].sort(), ['player-seat:4', 'seated-member:7'])
	})

	test('a one-argument lookup keeps today’s answers', () => {
		assert.equal(senderRefOf(person, ignores), 'seated-member:7')
		assert.deepEqual([...spokenRefsSince([person, replyRow], ignores)], ['seated-member:7'])
	})

	test('itemSpeakerOf: a person’s row is the player seat, a reply the character seat', () => {
		assert.equal(itemSpeakerOf(person, honours), 'player-seat:4')
		assert.equal(itemSpeakerOf(replyRow, honours), 'seated-member:7')
	})

	test('today’s card-form data (both refs the same card) is unchanged', () => {
		const card = (id: number): ParticipantRef | null => (id === 7 ? 'character:12' : null)
		assert.equal(senderRefOf(person, card), 'character:12')
		assert.deepEqual([...spokenRefsSince([person, replyRow], card)], ['character:12'])
		assert.equal(itemSpeakerOf(person, card), 'character:12')
		assert.equal(itemSpeakerOf(replyRow, card), 'character:12')
	})
})
