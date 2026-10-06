/**
 * The Lair's **Reveal** action. The genre's actions are introduced in `index.ts`.
 */

import { castellanAction } from './castellanAction.js'

/** @internal */
export const LAIR_REVEAL_SPEC_ID = 'core:spec/lair-reveal'
/** @internal */
export const LAIR_REVEAL_VERSION = '1.0.0'

/** Show the party something that was already there. @internal */
export const lairRevealSpec = () =>
	castellanAction(LAIR_REVEAL_SPEC_ID, LAIR_REVEAL_VERSION, {
		key: 'reveal',
		icon: 'eye',
		label: 'Reveal',
		description:
			'Uncovers something hidden in the room the party are in — a detail that was there all along. Say what they notice, or leave it to the room.',
		status: 'Revealing',
		ask: 'What do they notice?',
	})
