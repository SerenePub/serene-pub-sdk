/**
 * The guide's answer pipeline: `answerFormSpec` (`factories/answerForm.ts`),
 * published for the guide genre.
 */

import { guideGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @internal */
export const GUIDE_ANSWER_FORM_SPEC_ID = 'core:spec/guide-answer-form'
/** @internal */
export const answerFormGuideSpec = () => answerFormSpec(GUIDE_ANSWER_FORM_SPEC_ID, guideGenre)
