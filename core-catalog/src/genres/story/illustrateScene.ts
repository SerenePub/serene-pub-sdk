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

/**
 * 🚧 **Picture each new scene** — `core:spec/story-illustrate-new-scene`, a
 * **routine** (PLAN-layering §4, R5; 2026-10-20): the Scene action's graph
 * (`illustrateSceneGraph`), fired when a scene opens
 * (`onEvent(coreEvents.sceneOpened)`) instead of by a press. Registered in
 * the Story genre's defaults switched **Off** (R8: listed, for the owner to
 * turn on) — it costs a picture model call. Was the host's *Picture each new
 * scene* task lookup (`image-on-scene`).
 * @experimental
 */
export const STORY_ILLUSTRATE_NEW_SCENE_SPEC_ID = 'core:spec/story-illustrate-new-scene'
/** @internal */
export const STORY_ILLUSTRATE_NEW_SCENE_VERSION = '1.0.0'

/** @experimental */
export const illustrateNewSceneSpec = () =>
	illustrateSceneGraph({
		id: STORY_ILLUSTRATE_NEW_SCENE_SPEC_ID,
		version: STORY_ILLUSTRATE_NEW_SCENE_VERSION,
		fired: 'routine',
	})
