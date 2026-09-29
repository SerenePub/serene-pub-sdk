/**
 * This is an image pipeline, and it is the reply pipeline with different shapes
 * on its edges: an inlet, a Query that reads, a Task that computes, an oracle
 * that calls out, an outlet that writes. The slots are the same slots, the
 * override model is the same override model, and the receipt reads the same
 * way.
 *
 * That is the claim worth executing rather than asserting: adding a modality
 * touches the executor, the config model, the lens view, export, permissions
 * and consent exactly zero times. If it ever does, the abstraction has leaked
 * and that is the thing to fix.
 *
 * It is also a pipeline nobody starts. It runs because a message appeared —
 * which the reply pipeline's own write caused — so the run is triggered by an
 * event, and the receipt records that rather than a person. The image lands on
 * that message: `attach-image` takes the row as `target`, the port the inlet
 * publishes as `messageId`.
 */

import { slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import type { Example } from '@serene-pub/cli'

import { bindings, world } from '../helpers.js'

const picturedReply = spec('example:pictured-reply', { version: '1.0.0' })
	// Shape-matches the event's payload: a message that already exists, carried
	// by its row id, and the text that was posted.
	.inlet('input', C.userMessage.v1())
	// Query: what the message brought to mind — the lore its words triggered.
	// Reads Serene Pub's own rows and cannot reach the network.
	.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
	// Task: pure. The triggered entries become the one line the image model is
	// asked for; the prompt is computed, never typed into the document.
	.task('prompt', ($) => C.joinText.v1({ items: $.lore.hits }))
	.oracle('render', ($) =>
		C.generateImage.v1({
			prompt: $.prompt.text,
			// An image connection and an image sampling config — steps, CFG,
			// size. The same two slots the text oracle declares; only the shape
			// differs, and the shape is what keeps a text connection out of
			// this picker.
			connection: slot.connection(),
			sampling: slot.sampling(),
		}),
	)
	// `attach-image` defaults review ON — an author raising the floor for
	// their own outlet (F14) — so the run below carries a reviewer.
	.outlet('attach', ($) =>
		C.attachImage.v1({ target: $.input.messageId, image: $.render.image }),
	)

export const example: Example = {
	slug: 'pictured-reply',
	title: 'The same structure, a different modality',
	summary:
		'An image pipeline: four kinds, one structure, and identical authoring to the reply chain.',
	build: () => picturedReply.build(),
	run: (ctx) =>
		ctx.run({
			input: { messageId: 'msg:88213', text: 'my sister and the elf, at the castle' },
			bindings: bindings(),
			// The suite's world, plus the one thing it lacks: an image server
			// for the `render` node's connection slot to resolve to.
			world: {
				...world,
				connections: [
					...world.connections,
					{
						id: 'sd-local',
						name: 'Stable Diffusion',
						kind: 'core:shape/image-gen@1',
						metadata: { model: 'sdxl' },
						material: { apiKey: 'SECRET-IMG' },
					},
				],
				activeConnection: { ...world.activeConnection, 'core:shape/image-gen@1': 'sd-local' },
			},
			reviewer: async () => ({ action: 'approve', by: 'jody', at: 1 }),
			triggerSource: 'event',
			triggerRef: 'core:event/message-created@1',
		}),
}
