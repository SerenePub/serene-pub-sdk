/**
 * 🚧 The Lair's **Roll** — `core:spec/lair-roll` (rewrite D3, 2026-10-21):
 * the GM's own call for a roll, from the composer. The GM picks who rolls
 * and says what they attempt; the Oracle posts one **roll form** per delver,
 * addressed to the GM, the ruleset's checks and difficulties offered and its
 * usual difficulty proposed — and the GM answers it as any other roll form
 * (`lair-roll-answer`). So a manual roll is a called roll: the target and the
 * difficulty are chosen on the form, and the dice are the ruleset's.
 *
 * At a table whose rules roll nothing (no dice, no difficulties), or with
 * nobody seated by the names picked, the Castellan says so to the GM alone,
 * in the Sanctum — never on the story, where it would overtake an open form.
 * The owner's press; no model call.
 * @experimental
 */

import { compile, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { SANCTUM_CHANNEL } from '../../registry/genres.js'
import { applyWiring, jsonPart, scriptStep, textPart, wiring } from '../../shared/calls.js'
import { CASTELLAN, ORACLE } from './names.js'
import { LAIR_CALL_ROLL_SCRIPT } from './scripts.js'
import { LAIR_ROLL_ANSWER_ACTION, LAIR_ROLL_ANSWER_KEY } from './rollAnswer.js'

/** @experimental */
export const LAIR_ROLL_SPEC_ID = 'core:spec/lair-roll'
/** @internal */
export const LAIR_ROLL_VERSION = '1.0.0'

/** 🚧 The GM's own press — `<this spec>#roll`. @experimental */
export const LAIR_ROLL_KEY = 'roll'

/** @experimental */
export const lairRollSpec = () => {
	const w = wiring()
	const head = spec(LAIR_ROLL_SPEC_ID, {
		version: LAIR_ROLL_VERSION,
		taxonomy: { role: 'action' },
		contributes: {
			actions: [
				{
					key: LAIR_ROLL_KEY,
					venue: { kind: 'composer' },
					audience: { see: ['participant'], act: ['owner'] },
					icon: 'dices',
					/** Who rolls, and what for (R3's collect modal). */
					collects: {
						recipients: { label: { en: 'Who rolls' }, min: 1 },
						text: {
							need: 'optional',
							label: { en: 'What do they attempt?' },
							placeholder: { en: 'force the rusted gate' },
							ifEmpty: { en: 'A roll, for whatever comes next.' },
						},
					},
					label: { en: 'Roll' },
					description: {
						en: "Ask for a roll. Pick who rolls and say what they attempt; the Oracle asks you which check and how hard, then rolls it by the session's rules.",
					},
				},
			],
		},
	}).inlet('input', C.userMessage.v1(), { suits: [] })
	const asked = scriptStep(
		head,
		w,
		'forms',
		LAIR_CALL_ROLL_SCRIPT.seedKey,
		($) => ({
			recipients: $.input.recipients,
			text: $.input.text,
			session: $.input.session,
			ruleset: $.input.ruleset,
			action: { id: LAIR_ROLL_ANSWER_ACTION, fn: LAIR_ROLL_ANSWER_KEY },
		}),
		'The roll forms',
	)
	const read = jsonPart(
		textPart(asked, w, 'said', ($) => $.forms.main, 'text', 'The Oracle asks'),
		w,
		'blocks',
		($) => $.forms.main,
		'forms',
		'The roll forms, as blocks',
	)
	return compile(
		read
			.junction('posted', { on: ($) => $.blocks.main }, (p) =>
				p
					.when('asked', { truthy: true }, (k) =>
						k.outlet(
							'write',
							($) =>
								C.createMessage.v1({
									text: $.said.text,
									channel: 'main',
									speaker: ORACLE,
									blocks: $.blocks.main,
								}),
							{ expose: { label: 'Ask the Dungeon Master to call the roll' } },
						),
					)
					/** Nothing to roll: said to the GM alone, in the Sanctum. */
					.otherwise('none', (k) =>
						k.outlet(
							'write',
							($) =>
								C.createMessage.v1({
									text: $.said.text,
									channel: SANCTUM_CHANNEL,
									speaker: CASTELLAN,
								}),
							{ expose: { label: 'Say why there is nothing to roll' } },
						),
					),
			)
			.defaults((p) => applyWiring(p, w))
			.build(),
	)
}
