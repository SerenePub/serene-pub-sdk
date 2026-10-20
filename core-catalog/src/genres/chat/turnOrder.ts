/**
 * 🚧 Chat's turn order — `core:spec/assistant-turn-order` (2026-10-19):
 * `turnOrderSpec` (`factories/turnOrder.ts`) over a pool of the genre's one
 * in-turn envoy, the Assistant, and no characters — the Guide's shape. One
 * speaker: the order is written once and kept (canon A9), never re-decided.
 */

import * as C from '@serene-pub/contracts'
import { chatGenre } from '../../registry/genres.js'
import { type TurnPoolParams, type TurnOrderHandle, TURN_ORDER_EVENTS, turnOrderSpec, turnStrategyNode } from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'

/** @experimental */
export const ASSISTANT_TURN_ORDER_SPEC_ID = 'core:spec/assistant-turn-order'

/** The Assistant alone: no characters sit here. */
const ASSISTANT_ONLY: TurnPoolParams = { characters: 'none', envoys: 'in-turn' }

/** Chat's turn order, by value (R26). @experimental */
export const assistantTurnOrder: TurnOrderHandle = {
	genre: chatGenre,
	spec: ASSISTANT_TURN_ORDER_SPEC_ID,
	events: TURN_ORDER_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: ASSISTANT_TURN_ORDER_SPEC_ID,
			genre: chatGenre,
			events: TURN_ORDER_EVENTS,
			strategy: C.turnRoundRobin,
			pool: ASSISTANT_ONLY,
		})),
	strategyNode: turnStrategyNode({}),
}
