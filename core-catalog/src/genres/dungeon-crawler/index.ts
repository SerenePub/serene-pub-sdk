/**
 * 🚧 The **Dungeon Crawler** genre (PLAN-dungeon-crawler-2026-10-14) — the
 * one place its spec lanes import from: its names (genre id, channels,
 * envoys, annex keys), its declaration, its slots, its turn order, its
 * scripts and its pipelines — create and welcome (`create.ts`), the
 * interview with genesis at its end (`interview.ts`, `genesis.ts`), the
 * reply with the Planner's talk (`respond.ts`, `parley.ts`) and the answer
 * form.
 */
export * from './names.js'
export {
	dungeonCrawlerGenre,
	DUNGEON_CRAWLER_PLANNER_SYSTEM_PROMPT,
	DUNGEON_CRAWLER_PLANNER_GREETING,
	DUNGEON_CRAWLER_NARRATOR_SYSTEM_PROMPT,
} from '../../registry/genres.js'
export { DUNGEON_CRAWLER_LAYOUT } from '../../registry/layouts.js'
export {
	DUNGEON_CRAWLER_SLOTS,
	DUNGEON_CRAWLER_SHEET,
	levelSlot,
	characterClassSlot,
	abilitiesSlot,
	standingOrderSlot,
	fateSlot,
	crawlTimeSlot,
	difficultySlot,
	statModeSlot,
	goalModeSlot,
} from '../../registry/slots.js'
export * from './turnOrder.js'
export * from './roundScript.js'
export * from './scripts.js'
export * from './create.js'
export * from './interview.js'
export * from './genesis.js'
export * from './parley.js'
export * from './respond.js'
export * from './answerForm.js'
// 🚧 The genre's two prompt layouts: a brief as the last user turn, and the
// Narrator's round ending on its outcomes (owner ruling 2026-10-18).
export { DUNGEON_CRAWLER_BRIEF_TEMPLATE, DUNGEON_CRAWLER_NARRATE_TEMPLATE } from './calls.js'
// 🚧 The multiplayer half: rounds, secrets, the reveal.
export * from './round.js'
export * from './secrets.js'
export * from './reveal.js'
// 🚧 The story turn: the Planner's books, the ruleset handler's two calls,
// death's door, the goal, the journal, Rest; the world in the session's own
// lorebook; the ruleset fields and the starting kits.
export * from './storyScripts.js'
export * from './lore.js'
export * from './sheet.js'
export * from './kits.js'
export * from './story.js'
export * from './dice.js'
export * from './death.js'
export * from './goal.js'
export * from './journal.js'
export * from './rest.js'

import {
	abilitiesSlot,
	characterClassSlot,
	crawlTimeSlot,
	difficultySlot,
	goalModeSlot,
	hpSlot,
	inventorySlot,
	levelSlot,
	locationSlot,
	standingOrderSlot,
	statModeSlot,
	fateSlot,
} from '../../registry/slots.js'

/**
 * 🚧 The genre's slot ids by the sheet's names. `gear` is the premade
 * `inventory` (R1: what somebody carries already has a name). The first eight
 * are on the cast (player seats and companions), the last four on the world.
 * @experimental
 */
export const DUNGEON_CRAWLER_SLOT_IDS = Object.freeze({
	hp: hpSlot.id,
	level: levelSlot.id,
	characterClass: characterClassSlot.id,
	abilities: abilitiesSlot.id,
	gear: inventorySlot.id,
	standingOrder: standingOrderSlot.id,
	fate: fateSlot.id,
	location: locationSlot.id,
	clock: crawlTimeSlot.id,
	difficulty: difficultySlot.id,
	statMode: statModeSlot.id,
	goalMode: goalModeSlot.id,
} as const)
