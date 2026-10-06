/**
 * Adventure's **Rest** action. The genre's actions are introduced in `index.ts`.
 */

import { keeperAction } from './keeperAction.js'

/** @internal */
export const ADVENTURE_REST_SPEC_ID = 'core:spec/adventure-rest'
/** @internal */
export const ADVENTURE_REST_VERSION = '1.0.0'

/** Stop and recover: stamina and health back, and the clock moves on. @internal */
export const adventureRestSpec = () =>
	keeperAction(ADVENTURE_REST_SPEC_ID, ADVENTURE_REST_VERSION, {
		key: 'rest',
		icon: 'bed',
		label: 'Rest',
		description: 'Stop to recover stamina and health while time moves on.',
	})
