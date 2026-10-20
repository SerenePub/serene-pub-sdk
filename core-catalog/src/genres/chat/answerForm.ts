/**
 * 🚧 Chat's answer pipeline — `core:spec/assistant-answer-form`
 * (2026-10-19): `answerFormSpec` (`factories/answerForm.ts`), published for
 * Chat. Forms are universal: a question put to the Assistant is answered
 * here.
 */

import { chatGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @internal */
export const ASSISTANT_ANSWER_FORM_SPEC_ID = 'core:spec/assistant-answer-form'

/** @internal */
export const answerFormAssistantSpec = () => answerFormSpec(ASSISTANT_ANSWER_FORM_SPEC_ID, chatGenre)
