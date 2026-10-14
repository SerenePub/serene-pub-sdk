/**
 * 🚧 Adventure's **Scene** action — `core:spec/adventure-illustrate-scene`
 * (DESIGN-image-generation §16 follow-up D3, 2026-10-12). Chat's Scene graph
 * (`shared/illustrateScene.ts`) with Adventure's inlet: an inlet is locked to
 * one genre, so each genre ships its own spec over the one graph.
 */
import { adventureGenre } from '../../registry/genres.js'
import { illustrateSceneGraph } from '../../shared/illustrateScene.js'

/** @experimental */
export const ADVENTURE_ILLUSTRATE_SCENE_SPEC_ID = 'core:spec/adventure-illustrate-scene'
/** @internal */
export const ADVENTURE_ILLUSTRATE_SCENE_VERSION = '1.0.0'

/** @experimental */
export const adventureIllustrateSceneSpec = () =>
	illustrateSceneGraph({
		id: ADVENTURE_ILLUSTRATE_SCENE_SPEC_ID,
		version: ADVENTURE_ILLUSTRATE_SCENE_VERSION,
		genre: adventureGenre,
	})
