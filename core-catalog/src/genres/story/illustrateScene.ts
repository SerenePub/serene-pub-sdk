/**
 * 🚧 The **Scene action** for Story — `core:spec/story-illustrate-scene`
 * (DESIGN-image-generation §6.4, unit I9, 2026-10-12). The graph is
 * `shared/illustrateScene.ts`, one spec per genre that offers it.
 */
import { storyGenre } from '../../registry/genres.js'
import { illustrateSceneGraph } from '../../shared/illustrateScene.js'

export {
	ILLUSTRATE_SCENE_ACTION_KEY,
	STORY_ILLUSTRATE_SCENE_NODES,
	STORY_ILLUSTRATE_SCENE_PROMPT_SEED_KEYS,
} from '../../shared/illustrateScene.js'

/** @experimental */
export const STORY_ILLUSTRATE_SCENE_SPEC_ID = 'core:spec/story-illustrate-scene'
/** @internal */
export const STORY_ILLUSTRATE_SCENE_VERSION = '1.0.0'

/** @experimental */
export const illustrateSceneSpec = () =>
	illustrateSceneGraph({
		id: STORY_ILLUSTRATE_SCENE_SPEC_ID,
		version: STORY_ILLUSTRATE_SCENE_VERSION,
		genre: storyGenre,
	})
