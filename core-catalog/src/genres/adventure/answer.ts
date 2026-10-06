/**
 * Adventure's **Answer**: what an option of `ask.ts`'s question fires. The genre's
 * actions are introduced in `index.ts`.
 */

import { compile, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { adventureGenre } from '../../registry/genres.js'

/** @internal */
export const ADVENTURE_ANSWER_SPEC_ID = 'core:spec/adventure-answer'
/** @internal */
export const ADVENTURE_ANSWER_VERSION = '1.0.0'

/**
 * **Answer**: what a form's option fires — the addressee's line, as the
 * addressee. `read-answer` takes the press apart (the chosen option's label,
 * who answered and their character row) and `create-message` posts the
 * label as that participant's message. A person portraying the addressee
 * clicks and the row is theirs; the answer pipeline commits an oracle's
 * choice and the row is the AI's — same spec, same row, either way, which
 * is the whole of "exactly as a click would".
 *
 * Declared on its own spec rather than folded into `ask`: a spec has one
 * inlet and one graph, and asking and answering are two graphs.
 * @internal
 */
export const adventureAnswerSpec = () =>
	compile(
		spec(ADVENTURE_ANSWER_SPEC_ID, {
			version: ADVENTURE_ANSWER_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'answer',
						/**
						 * Carried by a block in a message and pressed from that
						 * block alone: the `form` venue (U5d review, S1) is the
						 * one no listing offers, so *Answer* is in no message's
						 * overflow and no composer menu — a question is answered
						 * where it was asked. The block's fire still resolves it.
						 */
						venue: { kind: 'form' },
						audience: { see: ['participant'], act: ['participant'] },
						icon: 'message-circle-reply',
						label: { en: 'Answer' },
						description: { en: 'Answer a question the narrator put to you.' },
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: adventureGenre,
				event: sessionEvents.sessionAction,
			})
			.task('answer', ($) =>
				C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }),
			)
			.outlet('save', ($) =>
				C.createMessage.v1({
					text: $.answer.label,
					characterId: $.answer.characterId,
					speaker: $.answer.addressee,
				}),
			)
			.build(),
	)
