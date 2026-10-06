/**
 * The Lair's **Whisper** action. The genre's actions are introduced in
 * `index.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { lairGenre } from '../../registry/genres.js'

/** @internal */
export const LAIR_WHISPER_SPEC_ID = 'core:spec/lair-whisper'
/** @internal */
export const LAIR_WHISPER_VERSION = '1.0.0'

/**
 * **Whisper**: a private instruction to the delvers the master picks, which
 * writes no message (lair re-plan R10, owner ruling 5, 2026-09-28).
 *
 * The press collects **who hears it** (`collects.recipients`, the session's
 * enabled cast, validated by the host) and **what it says**
 * (`collects.text`), and the run writes that line on
 * `core:slot/whisper@1` of each recipient — `resolve-state-changes@1`'s
 * `owners` port makes the one change once per recipient. **Pure:** no model
 * call. The model step that read a name off the typed line ("Verity: hold
 * the line") and its "Lair whisper" prompt row are retired: the modal asks
 * who, so nothing has to guess.
 *
 * **Heard by the recipients alone** (earshot, lair pass R1): the slot
 * declares `earshot: 'holder'`, so each recipient's own voice reads it and no
 * other prompt does — not another delver's, and none of the Castellan's
 * (planner, keeper, narration, Sanctum talk). A whispered delver acts on it
 * when they next speak; **Pick who speaks** gives them the floor now.
 *
 * ⚠ One standing note per delver, not a queue: a slot holds one value, so a
 * new whisper REPLACES a recipient's old one, and a delver it does not name
 * keeps theirs. The modal shows each delver's current whisper
 * (`recipients.overwrites`), so the overwrite is visible before it happens.
 * @internal
 */
export const lairWhisperSpec = () =>
	compile(
		spec(LAIR_WHISPER_SPEC_ID, {
			version: LAIR_WHISPER_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'whisper',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'ear',
						/** Who hears it and what it says (R3, R10): nothing to do without either. */
						collects: {
							recipients: {
								label: { en: 'Who hears it' },
								min: 1,
								overwrites: 'core:slot/whisper@1',
							},
							text: { need: 'required', label: { en: 'What do you whisper?' } },
						},
						label: { en: 'Whisper' },
						description: {
							en: 'Tell the delvers you pick something only they hear. Nobody else does — not the rest of the party, and not the Castellan.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: lairGenre,
				event: sessionEvents.sessionAction,
			})
			.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
			/**
			 * One change naming no owner, made once per recipient: the
			 * `owners` port is what turns `character:<id>` into that seated
			 * delver's row, and the slot's own validation is what refuses a
			 * line longer than it accepts, with a sentence.
			 */
			.query('resolve', ($) =>
				C.resolveStateChanges.v1({
					changes: [{ slot: 'whisper', value: $.input.text }] as any,
					owners: $.input.recipients,
					scope: $.input.sessionScope,
					base: $.state.version,
				}),
			)
			/** Applied rather than proposed — the master's own instruction; see Nudge. */
			.task('apply', ($) =>
				C.setState.v1({
					changes: $.resolve.changes,
					scope: $.input.sessionScope,
					base: $.state.version,
					params: slot.params(),
				}),
			)
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p.params('apply', { mode: 'apply' }),
			)
			.build(),
	)
