/**
 * Adventure's turn order: `turnOrderSpec` (`factories/turnOrder.ts`) for
 * Adventure.
 */

import * as C from '@serene-pub/contracts'
import { adventureGenre } from '../../registry/genres.js'
import { type TurnPoolParams, type TurnOrderHandle, TURN_ORDER_NARRATOR_EVENTS, turnOrderSpec, turnStrategyNode } from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'

/** @experimental */
export const ADVENTURE_TURN_ORDER_SPEC_ID = 'core:spec/adventure-turn-order'
/** The planner genres: nobody is seated — the one entry is the pipeline's own voice. */
const NOBODY: TurnPoolParams = { characters: 'none', envoys: 'none' }

/** Adventure's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const adventureTurnOrder: TurnOrderHandle = {
	genre: adventureGenre,
	spec: ADVENTURE_TURN_ORDER_SPEC_ID,
	events: TURN_ORDER_NARRATOR_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: ADVENTURE_TURN_ORDER_SPEC_ID,
			genre: adventureGenre,
			events: TURN_ORDER_NARRATOR_EVENTS,
			strategy: C.turnNarrator,
			pool: NOBODY,
		})),
	strategyNode: turnStrategyNode({}),
}
