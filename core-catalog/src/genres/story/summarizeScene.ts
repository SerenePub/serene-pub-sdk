/**
 * 🚧 Story's **summarize-scene** (live scenes §13): the shared builder with
 * the Default transcript template, the story on `main` and no asides.
 */

import { summarizeScene } from '../../shared/summarize/summarizeScene.js'
import {
	STORY_SUMMARIZE_SCENE_SPEC_ID,
	GENRE_SUMMARIZE_SCENE_VERSION,
} from '../../shared/summarize/sceneIds.js'
import { storyGenre } from '../../registry/genres.js'


/** @experimental */
export const storySummarizeSceneSpec = () =>
	summarizeScene(STORY_SUMMARIZE_SCENE_SPEC_ID, {
		version: GENRE_SUMMARIZE_SCENE_VERSION,
		genre: storyGenre,
		channels: { story: 'main' },
	})
