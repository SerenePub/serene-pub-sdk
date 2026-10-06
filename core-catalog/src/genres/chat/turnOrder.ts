/**
 * Chat's turn order: `turnOrderSpec` (`factories/turnOrder.ts`) for Chat.
 */

import * as C from '@serene-pub/contracts'
import { chatGenre } from '../../registry/genres.js'
import { type TurnOrderHandle, TURN_ORDER_EVENTS, turnOrderSpec, turnStrategyNode } from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'

/** @experimental */
export const CHAT_TURN_ORDER_SPEC_ID = 'core:spec/chat-turn-order'

/** Every core turn strategy but round robin, in the order chat's control lists them. */
const CHAT_SWAPS = [C.turnUserSplit, C.turnRandom, C.turnScripted, C.turnManual, C.turnNarrator]

/** Chat's turn order, by value — hand `build()` and `strategyNode` to `swaps` (R26). @experimental */
export const chatTurnOrder: TurnOrderHandle = {
	genre: chatGenre,
	spec: CHAT_TURN_ORDER_SPEC_ID,
	events: TURN_ORDER_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: CHAT_TURN_ORDER_SPEC_ID,
			genre: chatGenre,
			events: TURN_ORDER_EVENTS,
			strategy: C.turnRoundRobin,
			swaps: CHAT_SWAPS,
			// The optional model path (R41, M4): chat declares `turnMode`.
			advise: C.turnAdvise,
		})),
	strategyNode: turnStrategyNode({ advise: C.turnAdvise }),
}
