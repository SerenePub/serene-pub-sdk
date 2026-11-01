/**
 * 🚧 **A routine that writes as a character** — `core:spec/character-reaches-out`
 * (M0, lane T5; SHAPES L7): when a cadence comes due, `speaker` writes a
 * line of its own on `channel`, from `brief`. An EXAMPLE spec: it is built
 * with its terms and registered by whoever wants it (it is not in any shipped
 * list), e.g. `register(afterEachDay(), characterReachesOutSpec({ speaker:
 * 'character:7', brief: 'Write a short note to the player about your day.' }))`.
 *
 * The sequence is the Planner's parley (`dungeon-crawler/parley.ts`) and the
 * side character's (`story/narrateCharacter.ts`): a placeholder row that is
 * generating, spoken by the character; ONE streamed model call with that
 * character's card in context (`buildTemplateContext`'s `speaker`); then the
 * row filled with the text.
 *
 * ⏳ SHAPES says `create-message@1 { content }`; the port is `text` (R5: the
 * SHAPES word is reconciled here). The call uses the install's default prompt
 * (the speaker's own), so no seeded prompt row is named.
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { applyWiring, modelCall, wiring } from './calls.js'

/** @experimental */
export const CHARACTER_REACHES_OUT_SPEC_ID = 'core:spec/character-reaches-out'
/** @internal */
export const CHARACTER_REACHES_OUT_VERSION = '1.0.0'

/** @experimental */
export const characterReachesOutSpec = (o: {
	/** A participant reference, `character:<id>`. */
	speaker: string
	/** The channel the line is written on; default `main`. */
	channel?: string
	/** What the character is asked to write, as text. */
	brief: string
}) => {
	const w = wiring()
	const channel = o.channel ?? 'main'
	const opened = spec(CHARACTER_REACHES_OUT_SPEC_ID, {
		version: CHARACTER_REACHES_OUT_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		.inlet('input', C.routine.v1(), { suits: [coreEvents.turnEnded] })
		.outlet(
			'placeholder',
			() => C.createMessage.v1({ generating: true, channel, speaker: o.speaker as any }),
			{ expose: { label: 'Open the line' } },
		)
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The conversation', status: 'Thinking' },
		})
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'Who is here', status: 'Thinking' },
		})
	const called = modelCall(opened, w, 'reach', {
		speaker: o.speaker,
		prompt: '',
		brief: () => o.brief,
		cast: ($) => $.cast.cast,
		history: ($) => $.history.messages,
		briefTurn: true,
		expose: {
			stream: true,
			status: 'Thinking',
			label: 'The character writes',
			purpose: 'A character writes a line of their own, unprompted.',
		},
	})
	// The default prompt (the speaker's own): `modelCall` registered an empty seed key, dropped here.
	w.prompts.length = 0
	const filled = called.outlet(
		'save',
		($) =>
			C.updateMessage.v1({
				target: $.placeholder.messageId,
				text: $.reachWrite.text,
				reasoning: $.reachWrite.reasoning,
			}),
		{ expose: { label: 'Fill the line' } },
	)
	return compile(filled.defaults((p) => applyWiring(p, w)).build())
}
