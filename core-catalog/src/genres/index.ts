/**
 * Core's four genres, a folder each (`chat`, `adventure`, `guide`, `lair`):
 * every pipeline a genre is locked to, one per file, and any widget only that
 * genre offers. What more than one genre uses lives in `../shared`; the
 * builders a genre calls (answer form, turn order) in `../factories`; the
 * genres' declarations themselves in `../registry`.
 *
 * Below, the two lists that span the four.
 */
import { adventureGenre, chatGenre, guideGenre, lairGenre } from '../registry/genres.js'
import type { TurnOrderHandle } from '../factories/turnOrder.js'
import { CHAT_ANSWER_FORM_SPEC_ID } from './chat/answerForm.js'
import { ADVENTURE_ANSWER_FORM_SPEC_ID } from './adventure/answerForm.js'
import { GUIDE_ANSWER_FORM_SPEC_ID } from './guide/answerForm.js'
import { LAIR_ANSWER_FORM_SPEC_ID } from './lair/answerForm.js'
import { chatTurnOrder } from './chat/turnOrder.js'
import { guideTurnOrder } from './guide/turnOrder.js'
import { adventureTurnOrder } from './adventure/turnOrder.js'
import { lairTurnOrder } from './lair/turnOrder.js'

export * from './chat/index.js'
export * from './guide/index.js'
export * from './adventure/index.js'
export * from './lair/index.js'



/** Every answer pipeline core ships, by the genre it serves. @internal */
export const ANSWER_FORM_SPEC_IDS: Readonly<Record<string, string>> = Object.freeze({
	[chatGenre.id]: CHAT_ANSWER_FORM_SPEC_ID,
	[adventureGenre.id]: ADVENTURE_ANSWER_FORM_SPEC_ID,
	[guideGenre.id]: GUIDE_ANSWER_FORM_SPEC_ID,
	[lairGenre.id]: LAIR_ANSWER_FORM_SPEC_ID,
})

/**
 * Core's four (§4.14's table): which genre gets which spec, on which events —
 * what the presets bind and what `CORE_SPECS` publishes.
 * @experimental
 */
export const TURN_ORDER_BY_GENRE: ReadonlyArray<TurnOrderHandle> = [
	chatTurnOrder,
	guideTurnOrder,
	adventureTurnOrder,
	lairTurnOrder,
]
