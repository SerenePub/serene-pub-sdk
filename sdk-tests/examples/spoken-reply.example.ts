/**
 * This is a text-to-speech pipeline, and it is the reply pipeline with
 * different shapes on its edges: an inlet, a Query that reads, an oracle that
 * calls out, an outlet that writes. The slots are the same slots, the override
 * model is the same override model, and the receipt reads the same way.
 *
 * That is the claim worth executing rather than asserting: adding a modality
 * touches the executor, the config model, the lens view, export, permissions
 * and consent exactly zero times. If it ever does, the abstraction has leaked
 * and that is the thing to fix.
 *
 * It is also a pipeline nobody starts. It runs because a message appeared —
 * which the reply pipeline's own write caused — so the run is triggered by an
 * event, and the receipt records that rather than a person.
 */

import { slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import type { Example } from '@serene-pub/cli'

import { bindings, world } from '../helpers.js'

const spokenReply = spec('example:spoken-reply', { version: '1.0.0' })
	// Shape-matches the event's payload: a message that already exists, carried
	// by its row id.
	.inlet('input', C.userMessage.v1())
	.query('text', ($) => C.messageText.v1({ messageId: $.input.messageId }))
	.oracle('audio', ($) =>
		C.speak.v1({
			text: $.text.plain,
			// A TTS connection and a TTS sampling config — voice, speed, pitch.
			// The same two slots the text oracle declares; only the shape
			// differs, and the shape is what keeps a text connection out of
			// this picker.
			connection: slot.connection(),
			sampling: slot.sampling(),
		}),
	)
	.outlet('attach', ($) => C.attachAudio.v1({ audio: $.audio.audio }))

export const example: Example = {
	slug: 'spoken-reply',
	title: 'The same structure, a different modality',
	summary:
		'A text-to-speech pipeline: four nodes, four kinds, and identical authoring to the reply chain.',
	build: () => spokenReply.build(),
	run: (ctx) =>
		ctx.run({
			input: { messageId: 'msg:88213' },
			bindings: bindings(),
			world,
			triggerSource: 'event',
			triggerRef: 'core:event/message-created@1',
		}),
}
