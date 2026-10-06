/**
 * The Lair's **Trigger trap** action. The genre's actions are introduced in
 * `index.ts`.
 */

import { castellanAction } from './castellanAction.js'

// ⚠ Trap and Reveal, edited in place (history window, 2026-10-03) —
// content-addressed; `specHashes.test.ts` records the move. The shared
// `castellanAction` computes `contextBudget` before the reads and its history
// read takes the `budget`, so the transcript fit, not the newest 100 rows,
// decides where the conversation starts.
/** @internal */
export const LAIR_TRAP_SPEC_ID = 'core:spec/lair-trap'
/** @internal */
export const LAIR_TRAP_VERSION = '1.0.0'

/** Spring something the party walked into. The Castellan tells them what it cost. @internal */
export const lairTrapSpec = () =>
	castellanAction(LAIR_TRAP_SPEC_ID, LAIR_TRAP_VERSION, {
		key: 'trap',
		icon: 'zap',
		label: 'Trigger trap',
		description:
			'Springs a trap in the room the party are in, and the Castellan tells what it cost them. Say what the trap is, or leave it to the room.',
		status: 'Springing a trap',
		ask: 'What is the trap?',
	})
