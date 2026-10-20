/**
 * 🚧 Dungeon Crawler's turn order: `turnOrderSpec` (`factories/turnOrder.ts`)
 * with the **scripted** strategy, whose `select` point runs the round script
 * (`roundScript.ts`) — the story turn waits until everyone has declared, or
 * until Continue (feature 17).
 *
 * The round script is attached by seed key (`scripts.select`), and the
 * history reads every channel (`*`) so the selection's `voiceEntries` name
 * each Planner lane whose newest row is a person's: the script prepares the
 * Planner's reply there.
 */

import * as C from '@serene-pub/contracts'
import { sessionEvents } from '@serene-pub/sdk'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import {
	type TurnPoolParams,
	type TurnOrderHandle,
	TURN_ORDER_NARRATOR_EVENTS,
	turnOrderSpec,
	turnStrategyNode,
} from '../../factories/turnOrder.js'
import { once } from '../../factories/once.js'
import { DUNGEON_CRAWLER_ROUND_SCRIPT } from './roundScript.js'

/** @experimental */
export const DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID = 'core:spec/dungeon-crawler-turn-order'

/**
 * Nobody is seated: the story turn is the pipeline's own voice, and the round
 * script places it. Companions are voiced by the Narrator, players by players.
 */
const NOBODY: TurnPoolParams = { characters: 'none', personas: 'none', envoys: 'none' }

/**
 * The narrator four, plus a seat leaving (the round's "everyone") and the
 * annex moving (a declaration, a skip, a resolved round — and a lane
 * opening).
 *
 * ⚠ Not `member-added`: a preset binds one spec per event, and that one is
 * the welcome's (`create.ts`), which opens the newcomer's lane — an annex
 * write, so the order is recomputed on `annex-changed` all the same. A seat
 * a pipeline names (the interview) is no member event either; the annex
 * writes beside it recompute the order.
 * @experimental
 */
export const DUNGEON_CRAWLER_TURN_ORDER_EVENTS = [
	...TURN_ORDER_NARRATOR_EVENTS,
	sessionEvents.memberRemoved,
	sessionEvents.annexChanged,
] as const

/** Dungeon Crawler's turn order, by value. @experimental */
export const dungeonCrawlerTurnOrder: TurnOrderHandle = {
	genre: dungeonCrawlerGenre,
	spec: DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID,
	events: DUNGEON_CRAWLER_TURN_ORDER_EVENTS,
	build: once(() =>
		turnOrderSpec({
			id: DUNGEON_CRAWLER_TURN_ORDER_SPEC_ID,
			genre: dungeonCrawlerGenre,
			events: DUNGEON_CRAWLER_TURN_ORDER_EVENTS,
			strategy: C.turnScripted,
			pool: NOBODY,
			historyChannel: '*',
			scripts: { select: [{ seedKey: DUNGEON_CRAWLER_ROUND_SCRIPT.seedKey }] },
		}),
	),
	strategyNode: turnStrategyNode({}),
}
