/**
 * 🚧 The Dungeon Crawler's **summarize-scene** (live scenes §13), scenes first
 * (owner ruling 2026-11-10): the crawl turns scenes on, and a day's scenes
 * compile into its one history entry. One story channel, `main`, no asides,
 * and no transcript template of its own (the builder's default is used). A
 * death reaches the scene through the Narrator's own sentence.
 *
 * Registered in the Dungeon Crawler's defaults as its summarize-scene
 * (`summaries(dungeonCrawlerSummarizeSceneSpec())`).
 */

import { summarizeScene } from '../../shared/summarize/summarizeScene.js'
import { GENRE_SUMMARIZE_SCENE_VERSION } from '../../shared/summarize/sceneIds.js'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { DUNGEON_CRAWLER_STORY_CHANNEL, DUNGEON_CRAWLER_SUMMARIZE_SCENE_SPEC_ID } from './names.js'

/** @experimental */
export const dungeonCrawlerSummarizeSceneSpec = () =>
	summarizeScene(DUNGEON_CRAWLER_SUMMARIZE_SCENE_SPEC_ID, {
		version: GENRE_SUMMARIZE_SCENE_VERSION,
		genre: dungeonCrawlerGenre,
		channels: { story: DUNGEON_CRAWLER_STORY_CHANNEL },
	})
