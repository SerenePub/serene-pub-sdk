/**
 * The guide's turn order: `turnOrderSpec` (`factories/turnOrder.ts`) for the
 * guide genre.
 */

import * as C from '@serene-pub/contracts'
import { guideGenre } from '../../registry/genres.js'
import { type TurnPoolParams, type TurnOrderHandle, TURN_ORDER_EVENTS, turnOrderSpec, turnStrategyNode } from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'

/** @experimental */
export const GUIDE_TURN_ORDER_SPEC_ID = 'core:spec/guide-turn-order'

/** Guide: its one in-turn envoy is the whole order. */
const ENVOY_ONLY: TurnPoolParams = { characters: 'none', envoys: 'in-turn' }

/** Guide's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const guideTurnOrder: TurnOrderHandle = {
	genre: guideGenre,
	spec: GUIDE_TURN_ORDER_SPEC_ID,
	events: TURN_ORDER_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: GUIDE_TURN_ORDER_SPEC_ID,
			genre: guideGenre,
			events: TURN_ORDER_EVENTS,
			strategy: C.turnRoundRobin,
			pool: ENVOY_ONLY,
		})),
	strategyNode: turnStrategyNode({}),
}
