/**
 * 🚧 **Welcome** — `core:spec/lair-welcome` (rewrite D5, 2026-10-21):
 * somebody new at the table (`member-added`). Guests join a Lair as
 * participants (R4): a person's seat — a persona, or a card-less seat — is a
 * delver they play, whose turns wait for them. The Castellan tells the GM in
 * the Sanctum, where only the GM reads it; nothing is written on the story,
 * so no open form there is overtaken. A delver the GM added, or an envoy,
 * is nobody to announce. No model call.
 * @experimental
 */
import { compile, coreEvents, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { SANCTUM_CHANNEL } from '../../registry/genres.js'
import { applyWiring, scriptStep, textPart, wiring } from '../../shared/calls.js'
import { CASTELLAN } from './names.js'
import { LAIR_WELCOME_SCRIPT } from './scripts.js'

/** @experimental */
export const LAIR_WELCOME_SPEC_ID = 'core:spec/lair-welcome'
/** @internal */
export const LAIR_WELCOME_VERSION = '1.0.0'

/** @experimental */
export const lairWelcomeSpec = () => {
	const w = wiring()
	const head = spec(LAIR_WELCOME_SPEC_ID, {
		version: LAIR_WELCOME_VERSION,
		taxonomy: { role: 'maintenance' },
	}).inlet('event', C.sessionEvent.v1(), { suits: [coreEvents.memberAdded] })
	const said = textPart(
		scriptStep(
			head,
			w,
			'who',
			LAIR_WELCOME_SCRIPT.seedKey,
			($) => ({ payload: $.event.payload, session: $.event.session }),
			'Who joined the table',
		),
		w,
		'line',
		($) => $.who.main,
		'text',
		"The Castellan's note",
	)
	return compile(
		said
			.junction('told', { on: ($) => $.line.text }, (j) =>
				j.when('seated', { truthy: true }, (k) =>
					k.outlet('write', ($) =>
						C.createMessage.v1({
							text: $.line.text,
							channel: SANCTUM_CHANNEL,
							speaker: CASTELLAN,
						}),
						{ expose: { label: 'Tell the Dungeon Master who joined' } },
					),
				),
			)
			.defaults((p) => applyWiring(p, w))
			.build(),
	)
}
