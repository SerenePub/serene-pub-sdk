/**
 * Story's turn order: `turnOrderSpec` (`factories/turnOrder.ts`) for Story (Chat's
 * graph until 2026-10-19: round robin, with the model path).
 */

import * as C from '@serene-pub/contracts'
import { storyGenre } from '../../registry/genres.js'
import { type TurnOrderHandle, TURN_ORDER_EVENTS, turnOrderSpec, turnStrategyNode } from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'
import { narrateSpec } from './narrate.js'

/** @experimental */
export const STORY_TURN_ORDER_SPEC_ID = 'core:spec/story-turn-order'

/** Every core turn strategy but round robin, in the order Story's control lists them. */
const STORY_SWAPS = [C.turnUserSplit, C.turnRandom, C.turnScripted, C.turnManual, C.turnNarrator]

/** Story's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const storyTurnOrder: TurnOrderHandle = {
	genre: storyGenre,
	spec: STORY_TURN_ORDER_SPEC_ID,
	events: TURN_ORDER_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: STORY_TURN_ORDER_SPEC_ID,
			genre: storyGenre,
			events: TURN_ORDER_EVENTS,
			strategy: C.turnRoundRobin,
			swaps: STORY_SWAPS,
			// The optional model path (R41, M4): Story declares `turnMode`.
			advise: C.turnAdvise,
			// 🚧 The voices group (lane 2): *Let others speak up* and
			// *Narrator asides*, after the round; the narrator's line is Narrate.
			unprompted: { narrate: narrateSpec().actions.narrate.identity },
		})),
	strategyNode: turnStrategyNode({ advise: C.turnAdvise }),
}
