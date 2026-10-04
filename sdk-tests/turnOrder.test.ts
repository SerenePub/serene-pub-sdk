/**
 * PLAN-turn-order §5 A1 — the SDK half of turn order as event-driven state:
 * the four events and their payload shapes, `EventCause`, the inlet lock
 * over several events, the node `expose` mark, the turn-order and
 * settings documents, and `SessionShape.turnOrder` in place of
 * `speakerStrategies`.
 *
 * Nothing here runs a pipeline. A1 is declarations: what a later unit
 * builds against must exist, be registered, and refuse the one thing the
 * plan says it must refuse (a genre binding the turn-order write's own
 * event).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	CORE_EVENTS,
	EMPTY_TURN_ORDER,
	S,
	allEvents,
	compile,
	genre,
	getShape,
	lockAnswers,
	lockedEvents,
	readTurnOrder,
	sessionEvents,
	spec,
	_clearGenres,
} from '@serene-pub/sdk'
import type {
	CastChangePayload,
	EventCause,
	SessionCastV1,
	SessionChangePayload,
	SessionSettingsV1,
	TurnCandidateV1,
	TurnEntryV1,
	TurnOrderChangedPayload,
	TurnOrderV1,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre, guideGenre, adventureGenre } from '@serene-pub/core-catalog'

// ── §4.1 · Events ────────────────────────────────────────────────────────────

describe('A1 · the four events (§4.1)', () => {
	const ids = () => new Set(allEvents().map((e) => `core:event/${e.slug}@${e.version}`))

	test('message-completed, cast-changed, session-updated and turn-order-changed are registered, data family, affectsUser', () => {
		for (const e of [
			CORE_EVENTS.messageCompleted,
			CORE_EVENTS.castChanged,
			CORE_EVENTS.sessionUpdated,
			CORE_EVENTS.turnOrderChanged,
		]) {
			assert.equal(e.family, 'data')
			assert.equal(e.affectsUser, true)
			assert.equal(e.version, 1)
			assert.ok(ids().has(`core:event/${e.slug}@1`))
		}
	})

	test('each carries the payload shape §4.1 names', () => {
		assert.equal(CORE_EVENTS.messageCompleted.payload, S.sessionChange)
		assert.equal(CORE_EVENTS.sessionUpdated.payload, S.sessionChange)
		assert.equal(CORE_EVENTS.castChanged.payload, S.castChange)
		assert.equal(CORE_EVENTS.turnOrderChanged.payload, S.turnOrderChanged)
	})

	test('causedBy: message-completed by the three writes; turn-order-changed by set-turn-order; cast-changed by nothing; session-updated by advance-story-clock (and socket writes)', () => {
		assert.deepEqual(CORE_EVENTS.messageCompleted.causedBy, [
			'core:outlet/create-message',
			'core:outlet/seed-greetings',
			'core:outlet/update-message',
		])
		assert.deepEqual(CORE_EVENTS.turnOrderChanged.causedBy, ['core:outlet/set-turn-order'])
		assert.equal(CORE_EVENTS.castChanged.causedBy, undefined)
		assert.deepEqual(CORE_EVENTS.sessionUpdated.causedBy, ['core:outlet/advance-story-clock'])
	})

	test('the registry grew by exactly four — every other event is where it was', () => {
		// 22 before A1 (2026-09-21 baseline); the four of §4.1 make 26, and
		// the modder pass's `annex-changed` (R30, 2026-09-23) makes 27, and
		// sprites' `sprite-shown` (DESIGN-sprites §5, 2026-09-24) makes 28.
		assert.equal(allEvents().length, 28)
	})

	test('sessionEvents names every event a genre may bind the turn-order spec to, by registered id', () => {
		const registered = ids()
		for (const key of [
			'messageCompleted',
			'messageEdited',
			'messageDeleted',
			'messageHidden',
			'castChanged',
			'sessionUpdated',
			'sessionBranched',
			'turnOrderChanged',
		] as const) {
			assert.ok(
				registered.has(sessionEvents[key]),
				`${key} → ${sessionEvents[key]} not registered`,
			)
		}
		assert.equal(sessionEvents.messageCompleted, 'core:event/message-completed@1')
		assert.equal(sessionEvents.turnOrderChanged, 'core:event/turn-order-changed@1')
	})

	test('the payload types compile with a cause and the additive keys', () => {
		const cause: EventCause = { kind: 'run', runId: 'r1', auto: true }
		const custom: EventCause = { kind: 'acme.tick' }
		const change: SessionChangePayload = {
			event: sessionEvents.sessionUpdated,
			sessionId: 1,
			at: 1,
			cause: { kind: 'settings', userId: 3 },
			changed: ['name', 'scenario'],
		}
		const cast: CastChangePayload = {
			event: sessionEvents.castChanged,
			sessionId: 1,
			at: 1,
			cause,
			ref: 'character:11',
			change: 'enabled',
			value: false,
		}
		const written: TurnOrderChangedPayload = {
			event: sessionEvents.turnOrderChanged,
			sessionId: 1,
			at: 1,
			cause: custom,
			runId: null,
			turnOrder: EMPTY_TURN_ORDER,
		}
		assert.equal(change.changed?.length, 2)
		assert.equal(cast.change, 'enabled')
		assert.equal(written.turnOrder.v, 1)
	})
})

describe('A1 · turn-order-changed is core-internal', () => {
	test('genre() refuses it in `events` with a sentence naming the alternative', () => {
		_clearGenres()
		assert.throws(
			() =>
				genre('acme:genre/loop', {
					name: { en: 'Loop' },
					family: 'chat',
					events: { [sessionEvents.turnOrderChanged]: {} },
				}),
			/core-internal.*message-completed/s,
		)
	})

	test('the other new events bind like any session event', () => {
		_clearGenres()
		const g = genre('acme:genre/talk', {
			name: { en: 'Talk' },
			family: 'chat',
			events: {
				[sessionEvents.messageCompleted]: {},
				[sessionEvents.castChanged]: {},
				[sessionEvents.sessionUpdated]: {},
			},
		})
		assert.deepEqual(g.events[sessionEvents.messageCompleted], {})
		assert.deepEqual(g.events[sessionEvents.castChanged], {})
	})
})

// ── §4.1 · Shapes ────────────────────────────────────────────────────────────

describe('A1 · the six shapes', () => {
	test('registered under the ids §4.1 names', () => {
		assert.equal(S.castChange, 'core:shape/cast-change@1')
		assert.equal(S.turnOrderChanged, 'core:shape/turn-order-changed@1')
		assert.equal(S.turnOrder, 'core:shape/turn-order@1')
		assert.equal(S.turnCandidates, 'core:shape/turn-candidates@1')
		assert.equal(S.turnEntries, 'core:shape/turn-entries@1')
		assert.equal(S.sessionSettings, 'core:shape/session-settings@1')
		for (const id of [
			S.castChange,
			S.turnOrderChanged,
			S.turnOrder,
			S.turnCandidates,
			S.turnEntries,
			S.sessionSettings,
		])
			assert.ok(getShape(id), `${id} not in the registry`)
	})

	test('none streams and none is assignable to anything but json', () => {
		for (const id of [S.turnOrder, S.turnCandidates, S.turnEntries, S.sessionSettings]) {
			const def = getShape(id)!
			assert.equal(def.streaming, undefined)
			assert.equal(def.assignableTo, undefined)
		}
	})
})

// ── §4.1 · The inlet lock over several events ────────────────────────────────

describe('A1 · inlet lock: { genre, events }', () => {
	const nine = [
		sessionEvents.messageCompleted,
		sessionEvents.messageEdited,
		sessionEvents.messageDeleted,
		sessionEvents.messageHidden,
		sessionEvents.memberAdded,
		sessionEvents.memberRemoved,
		sessionEvents.castChanged,
		sessionEvents.sessionUpdated,
		sessionEvents.sessionBranched,
	]

	test('lands as input.events, in order, and compiles into the document', () => {
		const built = spec('acme:spec/order', { version: '1.0.0' })
			// session-event@1: the inlet that reads every one of the nine's
			// payloads (R33 refuses an `events` lock on one that does not).
			.inlet('event', C.sessionEvent.v1(), { genre: chatGenre, events: nine })
			.build()
		assert.deepEqual(built.input, { genre: chatGenre.id, events: nine })
		assert.deepEqual(compile(built).input, { genre: chatGenre.id, events: nine })
	})

	test('the one-event form is byte-for-byte what it was', () => {
		const built = spec('acme:spec/one', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), {
				genre: chatGenre,
				event: sessionEvents.messageRespond,
			})
			.build()
		assert.deepEqual(built.input, { genre: chatGenre.id, event: sessionEvents.messageRespond })
		assert.equal('events' in built.input!, false)
	})

	test('an empty or repeating list is refused at the declaration', () => {
		assert.throws(
			() =>
				spec('acme:spec/empty', { version: '1.0.0' }).inlet('e', C.userMessage.v1(), {
					genre: chatGenre,
					events: [],
				}),
			/lists them/,
		)
		assert.throws(
			() =>
				spec('acme:spec/dup', { version: '1.0.0' }).inlet('e', C.userMessage.v1(), {
					genre: chatGenre,
					events: [sessionEvents.messageCompleted, sessionEvents.messageCompleted],
				}),
			/each event once/,
		)
	})

	test('lockedEvents / lockAnswers read both forms as one question', () => {
		assert.deepEqual(lockedEvents({ event: 'a' }), ['a'])
		assert.deepEqual(lockedEvents({ events: ['a', 'b'] }), ['a', 'b'])
		assert.deepEqual(lockedEvents(undefined), [])
		assert.equal(lockAnswers({ events: nine }, sessionEvents.castChanged), true)
		assert.equal(lockAnswers({ events: nine }, sessionEvents.messageRespond), false)
		assert.equal(lockAnswers({ event: 'a' }, 'a'), true)
	})
})

// ── §4.11 · The expose mark ──────────────────────────────────────────────────

describe('A1 · node expose: { session: true }', () => {
	test('lands on the built node and in the document only when stated', () => {
		const built = spec('acme:spec/marked', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), {
				genre: chatGenre,
				event: sessionEvents.messageRespond,
			})
			.query('history', C.sessionHistory.v1({ scope: { $ref: 'input.sessionScope' } as any }))
			.task('strategy', C.turnRoundRobin.v1({}), { expose: { session: true } })
			.build()
		const history = built.nodes.find((n) => n.key === 'history')!
		const strategy = built.nodes.find((n) => n.key === 'strategy')!
		assert.equal('expose' in history, false)
		assert.deepEqual(strategy.expose, { session: true })
		const doc = compile(built)
		assert.equal('expose' in doc.nodes.find((n) => n.key === 'history')!, false)
		assert.deepEqual(doc.nodes.find((n) => n.key === 'strategy')!.expose, { session: true })
	})
})

// ── §4.2 · readTurnOrder ─────────────────────────────────────────────────────

describe('A1 · readTurnOrder', () => {
	const valid: TurnOrderV1 = {
		v: 1,
		order: [
			{ ref: 'character:11', via: 'strategy' },
			{ ref: null, via: 'voice', channel: 'main' },
		],
		candidates: [{ ref: 'character:11', kind: 'character', name: 'Ann', position: 0 }],
		basedOnAt: 10,
		computedAt: 11,
		runId: 'r1',
		event: sessionEvents.messageCompleted,
		strategy: 'core:task/turn-round-robin@1',
	}

	test('missing → EMPTY_TURN_ORDER', () => {
		assert.equal(readTurnOrder(undefined), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder(null), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder({}), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder({ other: 1 }), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder('turnOrder'), EMPTY_TURN_ORDER)
	})

	test('invalid → EMPTY_TURN_ORDER, never a throw', () => {
		assert.equal(readTurnOrder({ turnOrder: null }), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder({ turnOrder: 'x' }), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder({ turnOrder: { ...valid, v: 2 } }), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder({ turnOrder: { ...valid, order: 'no' } }), EMPTY_TURN_ORDER)
		assert.equal(
			readTurnOrder({ turnOrder: { ...valid, order: [{ ref: 'x' }] } }),
			EMPTY_TURN_ORDER,
		)
		assert.equal(
			readTurnOrder({ turnOrder: { ...valid, candidates: [{ ref: 'character:1' }] } }),
			EMPTY_TURN_ORDER,
		)
		assert.equal(readTurnOrder({ turnOrder: { ...valid, basedOnAt: '10' } }), EMPTY_TURN_ORDER)
		assert.equal(readTurnOrder({ turnOrder: { ...valid, runId: 7 } }), EMPTY_TURN_ORDER)
	})

	test('valid → the document as stored, extra keys included', () => {
		const stored = { turnOrder: { ...valid, extra: true } }
		const read = readTurnOrder(stored)
		assert.equal(read, stored.turnOrder)
		assert.equal(read.order.length, 2)
		assert.equal(read.order[1].ref, null)
		assert.equal(read.strategy, 'core:task/turn-round-robin@1')
	})

	test('EMPTY_TURN_ORDER is frozen and empty', () => {
		assert.ok(Object.isFrozen(EMPTY_TURN_ORDER))
		assert.equal(EMPTY_TURN_ORDER.order.length, 0)
		assert.equal(EMPTY_TURN_ORDER.candidates.length, 0)
		assert.equal(EMPTY_TURN_ORDER.runId, null)
		assert.equal(EMPTY_TURN_ORDER.event, null)
		assert.equal(EMPTY_TURN_ORDER.strategy, null)
	})
})

// ── §4.12 · The settings document compiles ───────────────────────────────────

describe('A1 · SessionSettingsV1 / SessionCastV1 / the turn types compile', () => {
	test('a full document type-checks and reads back', () => {
		const cast: SessionCastV1 = {
			sessionCharacters: [
				{
					character: { id: 11, name: 'Ann', nickname: null, userId: 1 },
					enabled: true,
					position: 0,
					removedAt: null,
					absorbedAliases: [],
				},
			],
			sessionPersonas: [
				{
					persona: { id: 7, name: 'Bob' },
					enabled: true,
					position: 0,
					removedAt: null,
					absorbedAliases: [],
				},
			],
			envoys: [
				{
					slug: 'mascot',
					key: 'mascot',
					origin: 'genre',
					name: { en: 'Guide' },
					speaks: 'in-turn',
					default: true,
					position: 1,
					removedAt: null,
				},
			],
			sessionScenario: null,
			isGroup: false,
			currentCharacterId: null,
		}
		const candidate: TurnCandidateV1 = {
			ref: 'envoy:mascot',
			kind: 'envoy',
			name: 'Guide',
			position: 1,
			mentioned: true,
		}
		const entry: TurnEntryV1 = {
			ref: 'character:11',
			via: 'strategy',
			channel: 'phone:3',
			subject: 'acme:spec/roll#roll',
		}
		const doc: SessionSettingsV1 = {
			v: 1,
			sessionId: 1,
			title: 'A session',
			guests: [2],
			genreId: chatGenre.id,
			presetId: null,
			fields: { autoAdvance: 'round' },
			scenario: null,
			lorebookId: null,
			tags: [],
			channels: ['main'],
			cast,
			pipelines: {
				'core:spec/turn-order': {
					rebinds: { strategy: 'core:task/turn-manual@1' },
					params: {},
				},
			},
			// The state only since R28: the choice is pipelines[slug].rebinds.
			turnOrder: { ...EMPTY_TURN_ORDER, order: [entry], candidates: [candidate] },
			metadata: {},
			annex: {},
		}
		assert.equal(doc.turnOrder.order[0].channel, 'phone:3')
		assert.equal(doc.cast.envoys[0].speaks, 'in-turn')
		assert.equal(doc.guests.length, 1)
	})
})

// ── §4.5 · SessionShape.turnOrder — retired by R28 (the modder pass) ─────────

describe('A1 · SessionShape.turnOrder (retired 2026-09-23, R28)', () => {
	test('no core shape declares turnOrder or speakerStrategies — the control is the spec node’s swaps', () => {
		for (const g of [chatGenre, guideGenre, adventureGenre]) {
			assert.equal('turnOrder' in (g.shape ?? {}), false, `${g.id} declares no turnOrder`)
			assert.equal('speakerStrategies' in (g.shape ?? {}), false, `${g.id} declares no speakerStrategies`)
		}
	})
})
