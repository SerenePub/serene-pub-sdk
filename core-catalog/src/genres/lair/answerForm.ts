/**
 * The Lair's answer pipeline: `answerFormSpec` (`factories/answerForm.ts`),
 * published for the Lair.
 */

import { lairGenre } from '../../registry/genres.js'
import { answerFormSpec } from '../../factories/answerForm.js'

/** @internal */
export const LAIR_ANSWER_FORM_SPEC_ID = 'core:spec/lair-answer-form'

/**
 * Lair's, on the same terms as the other three (one graph, published once per
 * shipped genre because a preset binds a spec whose inlet lock names its
 * genre). Its forms are addressed to the **owner**, which is a person, so this
 * pipeline is what waits for the day a Lair session seats an AI in a seat a
 * form is put to — core records `form-addressed` only when the resolver says
 * the AI portrays the addressee, and `owner` never resolves that way.
 * @internal
 */
export const answerFormLairSpec = () => answerFormSpec(LAIR_ANSWER_FORM_SPEC_ID, lairGenre)
