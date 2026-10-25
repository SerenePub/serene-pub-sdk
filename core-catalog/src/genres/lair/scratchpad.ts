/**
 * 🚧 **The Castellan's scratchpad** — `core:spec/lair-scratchpad`, a
 * **routine** (rewrite D7, 2026-10-21): after each of the Castellan's replies
 * in the Sanctum (`onEvent(message-completed)` where the line landed on the
 * Sanctum under the Castellan's name), ONE Background JSON call over the
 * exchange just had rewrites its running notes — rooms planned, intentions,
 * corrections — into the annex field `castellan-scratchpad` (audience: the
 * Castellan and the owner). An empty or unreadable answer leaves the notes as
 * they were.
 *
 * Was the `channel.sanctum` tail of `core:spec/lair-respond` (R13): a
 * separate call rather than a tail on the reply, because the reply streams.
 * A routine now, so the reply is the Castellan's talk alone and the notes
 * can be switched Off.
 * @experimental
 */
import { compile, coreEvents, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_PROMPT_KEYS } from '../../seed/prompts.js'
import { CASTELLAN_SCRATCHPAD_KEY } from '../../shared/annexField.js'
import { SANCTUM_CHANNEL } from '../../registry/genres.js'
import { applyWiring, modelCall, on, textPart, wiring } from '../../shared/calls.js'
import { CASTELLAN, LAIR_SCRATCHPAD_SCHEMA } from './names.js'

/** @experimental */
export const LAIR_SCRATCHPAD_SPEC_ID = 'core:spec/lair-scratchpad'
/** @internal */
export const LAIR_SCRATCHPAD_VERSION = '1.0.0'

/** How many of the Sanctum's newest rows the rewrite reads (R13): the exchange just had. */
const SCRATCHPAD_EXCHANGE_ROWS = 4

/** @experimental */
export const lairScratchpadSpec = () => {
	const w = wiring()
	const head = spec(LAIR_SCRATCHPAD_SPEC_ID, {
		version: LAIR_SCRATCHPAD_VERSION,
		taxonomy: { role: 'maintenance' },
	})
		/** A routine (D2): the session, and the line whose landing it listened for. */
		.inlet('input', C.routine.v1(), { suits: [coreEvents.messageCompleted] })
		/** The Castellan's own view of the annex: its notes as they stand. */
		.query('annex', ($) =>
			C.sessionAnnex.v1({
				scope: $.input.sessionScope,
				view: 'ai',
				speaker: CASTELLAN,
				params: slot.params(),
			}),
			{ expose: { label: "The Castellan's notes", status: 'The Castellan takes notes' } },
		)
		/** The exchange just had: the Sanctum's newest rows, its reply included. */
		.query('talk', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The Sanctum exchange just had', status: 'The Castellan takes notes' },
		})
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'Who is seated', status: 'The Castellan takes notes' },
		})
	w.params.push([on(head, 'talk'), { channel: SANCTUM_CHANNEL, limit: SCRATCHPAD_EXCHANGE_ROWS }])
	const notes = textPart(head, w, 'pad', ($) => $.annex.main, CASTELLAN_SCRATCHPAD_KEY, 'The scratchpad, as text')
	const asked = modelCall(notes, w, 'notes', {
		speaker: CASTELLAN,
		prompt: LAIR_PROMPT_KEYS.scratchpad,
		brief: () => 'Rewrite the scratchpad from the exchange above.',
		crib: ($) => $.pad.text,
		cast: ($) => $.cast.cast,
		history: ($) => $.talk.messages,
		schema: LAIR_SCRATCHPAD_SCHEMA,
		expose: {
			status: 'The Castellan takes notes',
			label: "Castellan's scratchpad",
			purpose: 'After each Sanctum reply, the Castellan rewrites its private notes: rooms planned, intentions, corrections.',
		},
	})
	w.params.push([on(asked, 'notesWrite'), { path: 'scratchpad' }])
	return compile(
		asked
			/** Written only when the answer has text: an empty one leaves the notes as they were. */
			.junction('kept', { on: ($) => $.notesWrite.value }, (j) =>
				j.when('written', { truthy: true }, (k) =>
					k.outlet('write', ($) =>
						C.setSessionAnnex.v1({
							value: { [CASTELLAN_SCRATCHPAD_KEY]: $.notesWrite.value } as any,
							params: slot.params(),
						}),
						{ expose: { label: 'Keep the new notes' } },
					),
				),
			)
			.defaults((p) => applyWiring(p, w))
			.build(),
	)
}
