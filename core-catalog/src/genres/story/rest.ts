/**
 * Story's **Rest** action (Adventure's until 2026-10-19). The genre's actions are introduced in `index.ts`.
 */

import { keeperAction } from './keeperAction.js'

/** @internal */
export const STORY_REST_SPEC_ID = 'core:spec/story-rest'
/** @internal */
export const STORY_REST_VERSION = '1.0.0'

/** Stop and recover: stamina and health back, and the clock moves on. @internal */
export const storyRestSpec = () =>
	keeperAction(STORY_REST_SPEC_ID, STORY_REST_VERSION, {
		key: 'rest',
		icon: 'bed',
		label: 'Rest',
		description: 'Stop to recover stamina and health while time moves on.',
	})
