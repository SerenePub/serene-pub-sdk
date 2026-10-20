/**
 * Core's five genres, a folder each (`story`, `chat`, `guide`, `lair`,
 * `dungeon-crawler`): every pipeline a genre is locked to, one per file, and
 * any widget only that genre offers. What more than one genre uses lives in
 * `../shared`; the builders a genre calls (answer form, turn order) in
 * `../factories`; the genres' declarations themselves in `../registry`.
 *
 * Below, the two lists that span the five.
 */
import { chatGenre, dungeonCrawlerGenre, guideGenre, lairGenre, storyGenre } from '../registry/genres.js'
import type { TurnOrderHandle } from '../factories/turnOrder.js'
import { STORY_ANSWER_FORM_SPEC_ID } from './story/answerForm.js'
import { ASSISTANT_ANSWER_FORM_SPEC_ID } from './chat/answerForm.js'
import { GUIDE_ANSWER_FORM_SPEC_ID } from './guide/answerForm.js'
import { LAIR_ANSWER_FORM_SPEC_ID } from './lair/answerForm.js'
import { storyTurnOrder } from './story/turnOrder.js'
import { assistantTurnOrder } from './chat/turnOrder.js'
import { guideTurnOrder } from './guide/turnOrder.js'
import { lairTurnOrder } from './lair/turnOrder.js'
import { DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID } from './dungeon-crawler/answerForm.js'
import { dungeonCrawlerTurnOrder } from './dungeon-crawler/turnOrder.js'

// 🚧 Story (the roleplay Chat and Adventure, folded 2026-10-19) and Chat (the assistant).
export * from './story/index.js'
export * from './chat/index.js'
export * from './guide/index.js'
export * from './lair/index.js'
// 🚧 PLAN-dungeon-crawler-2026-10-14.
export * from './dungeon-crawler/index.js'

/** Every answer pipeline core ships, by the genre it serves. @internal */
export const ANSWER_FORM_SPEC_IDS: Readonly<Record<string, string>> = Object.freeze({
	[storyGenre.id]: STORY_ANSWER_FORM_SPEC_ID,
	[chatGenre.id]: ASSISTANT_ANSWER_FORM_SPEC_ID,
	[guideGenre.id]: GUIDE_ANSWER_FORM_SPEC_ID,
	[lairGenre.id]: LAIR_ANSWER_FORM_SPEC_ID,
	[dungeonCrawlerGenre.id]: DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID,
})

/**
 * Core's five (§4.14's table): which genre gets which spec, on which events —
 * what the presets bind and what `CORE_SPECS` publishes.
 * @experimental
 */
export const TURN_ORDER_BY_GENRE: ReadonlyArray<TurnOrderHandle> = [
	storyTurnOrder,
	assistantTurnOrder,
	guideTurnOrder,
	lairTurnOrder,
	dungeonCrawlerTurnOrder,
]
