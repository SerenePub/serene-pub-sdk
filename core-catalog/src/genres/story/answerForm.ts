/**
 * Story's answer pipeline: `answerFormSpec` (`factories/answerForm.ts`), published
 * for Story.
 */

import { storyGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @internal */
export const STORY_ANSWER_FORM_SPEC_ID = 'core:spec/story-answer-form'

/** @internal */
export const answerFormStorySpec = () => answerFormSpec(STORY_ANSWER_FORM_SPEC_ID, storyGenre)
