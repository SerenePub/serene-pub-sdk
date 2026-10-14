/**
 * Adventure's **Time passes…** action. The genre's actions are introduced in
 * `index.ts`.
 *
 * 🚧 Since live scenes §6 (2026-10-13) the press collects the amount on the
 * stepper every genre's *Time passes…* shares (`TIME_PASSES_COLLECTS`), so
 * how much time passes is the player's: the state-keeper still reports what
 * the world does (the time of day, the weather), and then the session's story
 * clock moves by the step (`keeperAction`'s `clock` option). Edited in place:
 * the document changed, so its hash moves (`specHashes.test.ts`).
 */

import { keeperAction } from './keeperAction.js'

/** @internal */
export const ADVENTURE_ADVANCE_TIME_SPEC_ID = 'core:spec/adventure-advance-time'
/** @internal */
export const ADVENTURE_ADVANCE_TIME_VERSION = '1.0.0'

/** Let time pass: the story clock moves by the player's amount, and the weather may turn with it. @internal */
export const adventureAdvanceTimeSpec = () =>
	keeperAction(
		ADVENTURE_ADVANCE_TIME_SPEC_ID,
		ADVENTURE_ADVANCE_TIME_VERSION,
		{
			key: 'advance-time',
			icon: 'clock',
			label: 'Time passes…',
			description: 'Let an amount of time you choose pass in the world; the weather may change with it.',
		},
		{ clock: true },
	)
