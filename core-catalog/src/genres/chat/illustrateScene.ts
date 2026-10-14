/**
 * 🚧 The **Scene action** for Chat — `core:spec/chat-illustrate-scene`
 * (DESIGN-image-generation §6.4, unit I9, 2026-10-12). The graph is
 * `shared/illustrateScene.ts`, shared with Adventure's Scene.
 */
import { chatGenre } from '../../registry/genres.js'
import { illustrateSceneGraph } from '../../shared/illustrateScene.js'

export {
	ILLUSTRATE_SCENE_ACTION_KEY,
	CHAT_ILLUSTRATE_SCENE_NODES,
	CHAT_ILLUSTRATE_SCENE_PROMPT_SEED_KEYS,
} from '../../shared/illustrateScene.js'

/** @experimental */
export const CHAT_ILLUSTRATE_SCENE_SPEC_ID = 'core:spec/chat-illustrate-scene'
/** @internal */
export const CHAT_ILLUSTRATE_SCENE_VERSION = '1.0.0'

/** @experimental */
export const illustrateSceneSpec = () =>
	illustrateSceneGraph({
		id: CHAT_ILLUSTRATE_SCENE_SPEC_ID,
		version: CHAT_ILLUSTRATE_SCENE_VERSION,
		genre: chatGenre,
	})
