/**
 * 🚧 The genre-owned summarize-scene spec ids (live scenes §13–§14,
 * 2026-10-13), on their own so a genre declaration can name its spec
 * (`genre(…, { summarize: { scene } })`) without importing the spec — which
 * imports the genre. One id per core genre, genre first (NOMENCLATURE §24.7).
 */

/** @experimental */
export const STORY_SUMMARIZE_SCENE_SPEC_ID = 'core:spec/story-summarize-scene'
/** @experimental */
export const GUIDE_SUMMARIZE_SCENE_SPEC_ID = 'core:spec/guide-summarize-scene'
/** @experimental */
export const LAIR_SUMMARIZE_SCENE_SPEC_ID = 'core:spec/lair-summarize-scene'

/** The version every core genre's summarize-scene spec ships at. @internal */
export const GENRE_SUMMARIZE_SCENE_VERSION = '1.0.0'
