/**
 * 🚧 The Lair's **Time passes…** — `core:spec/lair-advance-time` (live scenes
 * §6, 2026-10-13). The graph is `shared/timePasses.ts`, shared with Chat's.
 */
import { lairGenre } from '../../registry/genres.js'
import { timePassesGraph } from '../../shared/timePasses.js'

/** @experimental */
export const LAIR_ADVANCE_TIME_SPEC_ID = 'core:spec/lair-advance-time'
/** @internal */
export const LAIR_ADVANCE_TIME_VERSION = '1.0.0'

/** Move the story clock by an amount the person picks. @experimental */
export const lairAdvanceTimeSpec = () =>
	timePassesGraph({
		id: LAIR_ADVANCE_TIME_SPEC_ID,
		version: LAIR_ADVANCE_TIME_VERSION,
		genre: lairGenre,
	})
