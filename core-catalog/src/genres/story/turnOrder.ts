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

/**
 * 🚧 What Story's composer says while nobody is seated who could reply
 * (owner ruling 2026-11-08: refuse the line, never answer it with silence).
 * Set by the turn order (`emptyCast`) and at create (`createStorySpec`);
 * lifted by the turn order once a character, persona or envoy is seated.
 * @experimental
 */
export const STORY_NOBODY_TO_REPLY = 'No one is here to reply yet. Add a character or a persona to the session first.'

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
			// *Narrator's turn*, after the round; the narrator's line is Narrate.
			unprompted: { narrate: narrateSpec().actions.narrate.identity },
			emptyCast: { reason: STORY_NOBODY_TO_REPLY },
		})),
	strategyNode: turnStrategyNode({ advise: C.turnAdvise }),
}
