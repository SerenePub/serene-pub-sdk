/**
 * 🚧 The Lair's **roll answer** — `core:spec/lair-roll-answer` (rewrite D3,
 * 2026-10-21): what a **roll form** fires, as *Answer the door* is what the
 * knock fires. The dice are the ruleset's (R2), the call is the GM's (R8),
 * and the voice that reports them is the Oracle's (D4).
 *
 * The plan's risky attempts arrive as roll forms addressed to the GM
 * (`reply.ts`, `play.checks.asked`; the GM's own *Roll*, `roll.ts`); the GM's
 * answer — a check and a difficulty, or *No check* — reaches this run as the
 * fire's payload (`{ check, stat, band, target? }`), the delver by name as
 * the form's `referent` and the attempt as its `vantage`. A check is rolled
 * by the session's ruleset (`core:task/ruleset-resolve@1`, `apply`, at
 * `mechanics` rigour or the table's own when higher) and the Oracle posts the
 * **dice** on `main`; *No check* is one Oracle line — it goes as the story
 * says. The host marks the row an answer (`metadata.answersForm`), so the
 * other forms on the roll row stay open; the party's turns wait until none
 * is.
 *
 * The `form` venue: no listing offers it, and the press is the addressee's —
 * the GM's.
 * @experimental
 */

import { actionIdentity, compile, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { applyWiring, jsonPart, scriptStep, textPart, wiring } from '../../shared/calls.js'
import { ORACLE } from './names.js'
import { LAIR_DICE_SCRIPT, LAIR_ROLL_SCRIPT } from './scripts.js'

/** @experimental */
export const LAIR_ROLL_ANSWER_SPEC_ID = 'core:spec/lair-roll-answer'
/** @internal */
export const LAIR_ROLL_ANSWER_VERSION = '1.0.0'

/** 🚧 The key a roll form fires — `<this spec>#answer`. @experimental */
export const LAIR_ROLL_ANSWER_KEY = 'answer'

/**
 * 🚧 The action identity every roll form names (`RollBlock.action`) — read
 * off the spec id and the key, never retyped.
 * @experimental
 */
export const LAIR_ROLL_ANSWER_ACTION = actionIdentity({ specSlug: LAIR_ROLL_ANSWER_SPEC_ID, key: LAIR_ROLL_ANSWER_KEY })

/** What `core:script/lair-roll` answers — the part a junction reads. */
interface RollCall {
	readonly rolled: unknown
}

/** @experimental */
export const lairRollAnswerSpec = () => {
	const w = wiring()
	const read = spec(LAIR_ROLL_ANSWER_SPEC_ID, {
		version: LAIR_ROLL_ANSWER_VERSION,
		taxonomy: { role: 'action' },
		contributes: {
			actions: [
				{
					key: LAIR_ROLL_ANSWER_KEY,
					venue: { kind: 'form' },
					audience: { see: ['participant'], act: ['owner'] },
					icon: 'dices',
					label: { en: 'Roll' },
					description: { en: 'Call the roll: which check, and how hard — or no check at all.' },
				},
			],
		},
	})
		.inlet('input', C.userMessage.v1(), { suits: [] })
		.task('answer', ($) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
	const called = scriptStep(
		read,
		w,
		'call',
		LAIR_ROLL_SCRIPT.seedKey,
		($) => ({
			payload: $.input.payload,
			referent: $.answer.referent,
			vantage: $.answer.vantage,
			session: $.input.session,
			ruleset: $.input.ruleset,
		}),
		'The roll, as called',
		'Deciding the check',
	)
	const built = called.junction('result', { on: ($) => $.call.main }, (r) =>
		r
			/** A check: rolled by the ruleset, reported by the Oracle as dice. */
			.when('rolled', { path: (v: RollCall) => v.rolled, truthy: true }, (k) => {
				const parts = textPart(
					jsonPart(
						jsonPart(k, w, 'deltas', ($) => $.call.main, 'deltas', 'The check'),
						w,
						'owners',
						($) => $.call.main,
						'owners',
						'Who rolls',
					),
					w,
					'rigour',
					($) => $.call.main,
					'rigour',
					'At what rigour',
				).task(
					'apply',
					($) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							scope: $.input.sessionScope,
							owners: $.result.rolled.owners.main,
							deltas: $.result.rolled.deltas.main,
							rigour: $.result.rolled.rigour.text,
							mode: 'apply',
						}),
					{ expose: { label: 'Roll the check', status: 'Deciding the check' } },
				)
				const diced = scriptStep(
					parts,
					w,
					'dice',
					LAIR_DICE_SCRIPT.seedKey,
					($) => ({
						outcomes: $.result.rolled.apply.outcomes,
						explain: $.result.rolled.apply.explain,
						ruleset: $.input.ruleset,
						session: $.input.session,
					}),
					'The dice, as blocks',
				)
				return jsonPart(
					textPart(diced, w, 'said', ($) => $.result.rolled.dice.main, 'text', 'The dice, in words'),
					w,
					'blocks',
					($) => $.result.rolled.dice.main,
					'blocks',
					'The dice blocks',
				).junction('shown', { on: ($) => $.result.rolled.blocks.main }, (s) =>
					s
						.when('dice', { truthy: true }, (d) =>
							d.outlet(
								'write',
								($) =>
									C.createMessage.v1({
										text: $.result.rolled.said.text,
										channel: 'main',
										speaker: ORACLE,
										blocks: $.result.rolled.blocks.main,
									}),
								{ expose: { label: 'Show the outcome' } },
							),
						)
						/** The ruleset rolled nothing for it (a check it refused): said so, in a line. */
						.otherwise('none', (d) =>
							d.outlet(
								'write',
								($) =>
									C.createMessage.v1({
										text: $.result.rolled.said.text,
										channel: 'main',
										speaker: ORACLE,
									}),
								{ expose: { label: 'Say nothing was rolled' } },
							),
						),
				)
			})
			/** *No check*: the attempt goes as the story says — one Oracle line. */
			.otherwise('told', (k) =>
				textPart(k, w, 'said', ($) => $.call.main, 'said', 'No check, in words').outlet(
					'write',
					($) =>
						C.createMessage.v1({
							text: $.result.told.said.text,
							channel: 'main',
							speaker: ORACLE,
						}),
					{ expose: { label: 'Say there is no roll' } },
				),
			),
	)
	return compile(built.defaults((p) => applyWiring(p, w)).build())
}
