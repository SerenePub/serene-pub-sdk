/**
 * Adventure's **Time passes** action. The genre's actions are introduced in
 * `index.ts`.
 */

import { keeperAction } from './keeperAction.js'

/** @internal */
export const ADVENTURE_ADVANCE_TIME_SPEC_ID = 'core:spec/adventure-advance-time'
/** @internal */
export const ADVENTURE_ADVANCE_TIME_VERSION = '1.0.0'

/** Let time pass: the world clock steps on, and the weather may turn with it. @internal */
export const adventureAdvanceTimeSpec = () =>
	keeperAction(ADVENTURE_ADVANCE_TIME_SPEC_ID, ADVENTURE_ADVANCE_TIME_VERSION, {
		key: 'advance-time',
		icon: 'clock',
		label: 'Time passes',
		description: 'Let time pass in the world; the weather may change with it.',
	})
