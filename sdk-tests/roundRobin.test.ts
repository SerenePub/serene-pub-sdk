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

import { countedTurns, roundRobinOrder, spokenRefsSince } from '@serene-pub/sdk'
import type { TurnCandidateV1, TurnHistoryMessage } from '@serene-pub/sdk'

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
