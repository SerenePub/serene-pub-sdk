/**
 * A genre's `shape.turnSeatChanges` and the `TurnSeatChange` list `turn-ended` and a
 * routine's `cause` carry (owner 2026-11-09, "Yes, a read genres opt into").
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	genre,
	type RoutineCause,
	type SessionChangePayload,
	type TurnSeatChange,
} from '@serene-pub/sdk'

const base = (shape: unknown) => ({ name: { en: 'X' }, family: 'test', shape }) as any

describe('a genre’s shape.turnSeatChanges', () => {
	test('true survives genre() unchanged', () => {
		const g = genre('test.seats:genre/on', base({ turnSeatChanges: true }))
		assert.equal(g.shape?.turnSeatChanges, true)
	})
	test('false survives genre() unchanged', () => {
		const g = genre('test.seats:genre/off', base({ turnSeatChanges: false }))
		assert.equal(g.shape?.turnSeatChanges, false)
	})
	test('absent stays absent', () => {
		const g = genre('test.seats:genre/absent', base({}))
		assert.equal(g.shape?.turnSeatChanges, undefined)
		assert.equal('turnSeatChanges' in (g.shape ?? {}), false)
	})
	for (const [name, value] of [
		['a string', 'yes'],
		['an object', {}],
	] as const)
		test(`${name} is refused with what to do instead`, () => {
			assert.throws(
				() => genre('test.seats:genre/bad', base({ turnSeatChanges: value })),
				/shape\.turnSeatChanges must be true or false\. Declare turnSeatChanges: true for turn-ended to carry the seats that changed, or leave it out\./,
			)
		})
})

describe('TurnSeatChange', () => {
	test('a typed list assigns to the cause and to the turn-ended payload', () => {
		const list: TurnSeatChange[] = [
			{ ref: 'seated-member:4', seatKind: 'character', castMemberId: 4, change: 'added' },
			{ ref: 'player-seat:2', seatKind: 'player', castMemberId: null, change: 'changed' },
		]
		const cause: RoutineCause = { at: 1, turnSeatChanges: list }
		const payload: Pick<SessionChangePayload, 'turnSeatChanges'> = { turnSeatChanges: list }
		assert.equal(cause.turnSeatChanges?.length, 2)
		assert.equal(payload.turnSeatChanges?.[1]?.change, 'changed')
	})
})
