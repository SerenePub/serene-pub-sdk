/**
 * Chat's answer pipeline: `answerFormSpec` (`factories/answerForm.ts`), published
 * for Chat.
 */

import { chatGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @internal */
export const CHAT_ANSWER_FORM_SPEC_ID = 'core:spec/chat-answer-form'

/** @internal */
export const answerFormChatSpec = () => answerFormSpec(CHAT_ANSWER_FORM_SPEC_ID, chatGenre)
