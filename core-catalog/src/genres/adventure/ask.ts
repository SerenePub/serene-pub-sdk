/**
 * Adventure's **Ask** action: the narrator asks, the cast answers (`answer.ts`).
 * The genre's actions are introduced in `index.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { adventureGenre } from '../../registry/genres.js'
import { ADVENTURE_ANSWER_SPEC_ID } from './answer.js'

/* ── ask / answer: the worked form (plans/29 R-15 *Forms*; 30 §U5d) ──────── */

/** @internal */
export const ADVENTURE_ASK_SPEC_ID = 'core:spec/adventure-ask'
/** @internal */
export const ADVENTURE_ASK_VERSION = '1.0.0'

/**
 * What the narrator's question comes back as, from `generate-json@1`.
 *
 * The addressee is a **name** rather than a participant reference: the
 * model reads names off the transcript, and `make-choices@1` resolves
 * the name — against the cast first, then the members' presences, by
 * name or nickname — into `character:<id>` at the write. A name that
 * resolves to nobody leaves the block unaddressed; a press on an
 * unaddressed block is answered as the presser (their presence when
 * they hold one, else their own line).
 * @internal
 */
export const ADVENTURE_ASK_SCHEMA = {
	type: 'object',
	properties: {
		addressee: { type: 'string' },
		question: { type: 'string' },
		options: {
			type: 'array',
			minItems: 2,
			maxItems: 4,
			items: {
				type: 'object',
				properties: { key: { type: 'string' }, label: { type: 'string' } },
				required: ['key', 'label'],
				additionalProperties: false,
			},
		},
	},
	required: ['addressee', 'question', 'options'],
	additionalProperties: false,
} as const

/**
 * **Ask**: the narrator puts a question with options to one of the cast.
 *
 * The worked form of R-15: the oracle writes `{ addressee, question, options }`,
 * `make-choices` turns it into a `choices` block addressed to that cast
 * member (`character:<id>`) whose options fire `answer`, and the narration
 * row carries it. The host stamps the block with this spec's `answer` action
 * and an id at the write; if the run's pinned portrayals say the AI portrays
 * the addressee, it records `form-addressed` and the genre's answer pipeline
 * (`core:spec/adventure-answer-form`) answers as them — else the block waits
 * for the person portraying them to click. Either way the click, real or
 * committed, runs `adventure-answer` below.
 *
 * Two actions on one spec, each its own thing to the venue model: `ask` is
 * the composer's chip and `/ask`; `answer` is what the block's options fire,
 * declared here so the block has an identity to be stamped with. `answer`
 * is offered to any participant — the form's **addressee** is who may
 * actually press it, decided per block at the fire.
 * @internal
 */
export const adventureAskSpec = () =>
	compile(
		spec(ADVENTURE_ASK_SPEC_ID, {
			version: ADVENTURE_ASK_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'ask',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'message-circle-question',
						label: { en: 'Ask' },
						description: { en: 'The narrator puts a question, with choices, to one of the cast.' },
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: adventureGenre,
				event: sessionEvents.sessionAction,
			})
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('cast', (c) =>
						c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
					),
			)
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('write'),
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			.task('context', ($) =>
				C.buildNarratorContext.v1({
					cast: $.gather.cast.read.cast,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/** Prose and no seed — a question is asked, not a turn taken (see the keeper actions). */
			.task('lines', ($) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
				}),
			)
			/**
			 * 🚧 **The transcript's files, placed** (attachments follow-ups, owner
			 * ruling 2026-10-03) — `respond`'s two steps: the files the rows show,
			 * then per line what `write` receives (an image it can read rides its
			 * own turn; otherwise its name). A transcript with no files passes
			 * through untouched, so the prompt is byte for byte what it was.
			 */
			.query('attachments', ($) =>
				C.historyAttachments.v1({
					messages: $.gather.history.read.messages,
					params: slot.params(),
				}),
			)
			.task('attached', ($) =>
				C.placeAttachments.v1({
					messages: $.lines.messages,
					attachments: $.attachments.attachments,
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					budget: $.contextBudget.available,
					messages: $.attached.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('write'),
				}),
			)
			.oracle('write', ($) =>
				C.generateJson.v1({
					context: $.prompt.context,
					schema: ADVENTURE_ASK_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Posing a question' } },
			)
			.task('choices', ($) =>
				C.makeChoices.v1({
					json: $.write.json,
					fn: 'answer',
					// Answer is the other spec's declaration, named on purpose:
					// the host holds the options to THAT action's audience —
					// the block's addressee — and runs THAT spec on a press.
					action: `${ADVENTURE_ANSWER_SPEC_ID}#answer`,
					cast: $.gather.cast.read.cast,
				}),
			)
			.outlet('save', ($) =>
				C.createMessage.v1({
					narration: true,
					text: $.choices.text,
					blocks: $.choices.blocks,
				}),
			)
			.build(),
	)
