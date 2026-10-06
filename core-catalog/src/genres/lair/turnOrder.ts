/**
 * The Lair's turn order: `turnOrderSpec` (`factories/turnOrder.ts`) for the Lair.
 */

import * as C from '@serene-pub/contracts'
import { lairGenre } from '../../registry/genres.js'
import { type TurnPoolParams, type TurnOrderHandle, TURN_ORDER_NARRATOR_EVENTS, turnOrderSpec, turnStrategyNode } from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'

/** @experimental */
export const LAIR_TURN_ORDER_SPEC_ID = 'core:spec/lair-turn-order'
/**
 * 🚧 The Lair: its active delvers are seated (owner ruling 2026-09-30, "they
 * are character turns"). The narrator strategy still seats nobody by rule;
 * what the pool admits is who a standing turn plan may prepare a character
 * turn for, since an entry naming somebody the pool did not admit is dropped
 * at the write. Envoys stay out: the Castellan's turns are the null entry's.
 */
const PARTY: TurnPoolParams = { characters: 'active', envoys: 'none' }

/** The Lair's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const lairTurnOrder: TurnOrderHandle = {
	genre: lairGenre,
	spec: LAIR_TURN_ORDER_SPEC_ID,
	events: TURN_ORDER_NARRATOR_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: LAIR_TURN_ORDER_SPEC_ID,
			genre: lairGenre,
			events: TURN_ORDER_NARRATOR_EVENTS,
			strategy: C.turnNarrator,
			// The delvers its plans name take character turns.
			pool: PARTY,
			// Every channel (R6): a line on the Sanctum prepares the
			// Castellan's reply there, as a line on `main` prepares its turn.
			historyChannel: '*',
		})),
	strategyNode: turnStrategyNode({}),
}
