/**
 * Dungeon Crawler's answer pipeline: `answerFormSpec` (`factories/answerForm.ts`),
 * published for the genre — what answers a form put to a participant the AI
 * portrays (a companion asked something in play). The interview's forms are
 * put to people (`user:<id>`), so they wait for a press.
 */

import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @experimental */
export const DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID = 'core:spec/dungeon-crawler-answer-form'
/** @experimental */
export const answerFormDungeonCrawlerSpec = () => answerFormSpec(DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID, dungeonCrawlerGenre)
