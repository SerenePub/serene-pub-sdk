/**
 * Adventure's answer pipeline: `answerFormSpec` (`factories/answerForm.ts`),
 * published for Adventure.
 */

import { adventureGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @internal */
export const ADVENTURE_ANSWER_FORM_SPEC_ID = 'core:spec/adventure-answer-form'
/** @internal */
export const answerFormAdventureSpec = () =>
	answerFormSpec(ADVENTURE_ANSWER_FORM_SPEC_ID, adventureGenre)
