/**
 * 🚧 Chat's **Time passes…** — `core:spec/chat-advance-time` (live scenes §6,
 * 2026-10-13). The graph is `shared/timePasses.ts`, shared with the Lair's.
 */
import { chatGenre } from '../../registry/genres.js'
import { timePassesGraph } from '../../shared/timePasses.js'

/** @experimental */
export const CHAT_ADVANCE_TIME_SPEC_ID = 'core:spec/chat-advance-time'
/** @internal */
export const CHAT_ADVANCE_TIME_VERSION = '1.0.0'

/** Move the story clock by an amount the person picks. @experimental */
export const chatAdvanceTimeSpec = () =>
	timePassesGraph({
		id: CHAT_ADVANCE_TIME_SPEC_ID,
		version: CHAT_ADVANCE_TIME_VERSION,
		genre: chatGenre,
	})
