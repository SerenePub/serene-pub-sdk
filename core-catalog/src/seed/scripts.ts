/**
 * 🚧 Core's shipped scripts (2026-10-15): the `pipeline_scripts` rows core
 * seeds, matched on `seedKey` — never on id or name — the way the shipped
 * prompts are (`seed/prompts.ts`). Immutable once seeded: an admin duplicates
 * one to change it. A spec names a row in its author preset by seed key
 * (`PresetBuilder.scripts`), and the host writes the seeded row's id into the
 * shipped config, so no document carries an instance's row id.
 *
 * The seed pass refreshes a row whose source, name or declared reads drifted
 * from the catalogue, and inserts the rest. A script removed here stays on the
 * install as an ordinary row.
 */
import { DUNGEON_CRAWLER_ROUND_SCRIPT } from '../genres/dungeon-crawler/roundScript.js'
import { DUNGEON_CRAWLER_SCRIPTS } from '../genres/dungeon-crawler/scripts.js'
import { READ_PATH_SCRIPT, type CoreScriptSeed } from '../shared/scriptSeed.js'
import { DUNGEON_CRAWLER_SECRETS_SCRIPT } from '../genres/dungeon-crawler/secrets.js'
import { DUNGEON_CRAWLER_REVEAL_SCRIPT } from '../genres/dungeon-crawler/reveal.js'
import {
	DUNGEON_CRAWLER_BOOKS_SCRIPT,
	DUNGEON_CRAWLER_LEDGER_SCRIPT,
	DUNGEON_CRAWLER_PLAN_SCRIPT,
	DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT,
	DUNGEON_CRAWLER_TURN_SCRIPT,
} from '../genres/dungeon-crawler/story.js'
import { DUNGEON_CRAWLER_DOOR_SCRIPT } from '../genres/dungeon-crawler/dice.js'
import { DUNGEON_CRAWLER_GOAL_SCRIPT } from '../genres/dungeon-crawler/goal.js'
import { DUNGEON_CRAWLER_REST_SCRIPT } from '../genres/dungeon-crawler/rest.js'
import { DUNGEON_CRAWLER_SHAPE_SCRIPT } from '../genres/dungeon-crawler/shape.js'
import { VIS_ITINERIS_SCRIPTS } from './visItinerisScripts.js'
import { WHEREWITHAL_SCRIPTS } from './wherewithalScripts.js'
import { STORY_SCRIPTS } from '../genres/story/reckon.js'
import { UNPROMPTED_MODES_SCRIPT } from '../factories/turnOrder.js'
import { LAIR_SCRIPTS } from '../genres/lair/scripts.js'

export type { CoreScriptSeed }

/** Every script core ships, in seed order. @experimental */
export const CORE_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	READ_PATH_SCRIPT,
	DUNGEON_CRAWLER_ROUND_SCRIPT,
	...DUNGEON_CRAWLER_SCRIPTS,
	DUNGEON_CRAWLER_SECRETS_SCRIPT,
	DUNGEON_CRAWLER_REVEAL_SCRIPT,
	// 🚧 The story turn, Rest and the goal (`story.ts`, `dice.ts`, `rest.ts`, `goal.ts`):
	// the checks are the ruleset handler's since 2026-10-16, so the genre's own
	// dice script is gone (its seeded row stays on an install, unused).
	DUNGEON_CRAWLER_BOOKS_SCRIPT,
	DUNGEON_CRAWLER_RULESET_FIELDS_SCRIPT,
	// 🚧 The Planner's grammar, laid over the session's rules (S1, 2026-10-23).
	DUNGEON_CRAWLER_SHAPE_SCRIPT,
	DUNGEON_CRAWLER_PLAN_SCRIPT,
	DUNGEON_CRAWLER_TURN_SCRIPT,
	DUNGEON_CRAWLER_DOOR_SCRIPT,
	DUNGEON_CRAWLER_LEDGER_SCRIPT,
	DUNGEON_CRAWLER_REST_SCRIPT,
	DUNGEON_CRAWLER_GOAL_SCRIPT,
	// 🚧 Vis Itineris's (`core:ruleset/vis-itineris@1`, `seed/visItinerisScripts.ts`): derive, heighten, level-up, bulk.
	...VIS_ITINERIS_SCRIPTS,
	// 🚧 Wherewithal's (`core:ruleset/wherewithal@1`, `seed/wherewithalScripts.ts`, 2026-10-22): derive, strain, render.
	...WHEREWITHAL_SCRIPTS,
	// 🚧 Story's routines (`genres/story/reckon.ts`; the reply's background tasks until 2026-10-20): the reckoning's and the sweep's.
	...STORY_SCRIPTS,
	// 🚧 The voices a turn-order spec reads off the genre's settings (2026-10-20).
	UNPROMPTED_MODES_SCRIPT,
	// 🚧 The Lair's (rewrite, 2026-10-21): what a table rolls, the turn, the dice,
	// the rolls, a room draft's links, a seated guest (the keeper's rules retired 2026-10-23).
	...LAIR_SCRIPTS,
])
