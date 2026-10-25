/**
 * Generate an image and post it, from a button in the composer.
 *
 * The end-to-end case for local image generation, and deliberately the smallest
 * spec that is one: a person presses the button, the action's own form asks what
 * the image should show, the image is rendered and stored, and a message
 * carrying it is posted. Three nodes, no queries, no assembled context.
 *
 * ## Where the prompt is written
 *
 * The action's `collects` form is the one place the prompt is entered. The
 * provider is `effects: 'external'`, which makes it gate-eligible, and a preset
 * can turn its review ON so the executor parks there with a form inferred from
 * the node's own payload. That is a second look at the same prompt, so it ships
 * OFF (owner ruling 2026-10-11: a prompt the person just typed is not asked for
 * again). A spec driven by an upstream text node instead of a person is the case
 * that wants the review on.
 *
 * ## Why `caption` becomes the message text
 *
 * The rendered prompt is the honest description of what was made, and a message
 * with an image and no text reads as broken in every client that shows a preview.
 * A spec that wanted something else would wire `text` from somewhere else; this
 * one has nowhere else to get it from.
 */
import { compile, spec, sessionEvents, slot } from '@serene-pub/sdk'
import { CORE_LOADOUT } from '../../loadouts.js'
import * as C from '@serene-pub/contracts'
import { storyGenre } from '../../registry/genres.js'

/** @experimental */
export const STORY_GENERATE_IMAGE_SPEC_ID = 'core:spec/story-generate-image'
/** @internal */
export const STORY_GENERATE_IMAGE_VERSION = '1.1.0'

/** @experimental */
export const generateImageSpec = () =>
	compile(
		spec(STORY_GENERATE_IMAGE_SPEC_ID, {
			version: STORY_GENERATE_IMAGE_VERSION,
			/** A person-invoked action on chats (23 §2), same as narrate. */
			taxonomy: {
				role: 'action',
			},
			/**
			 * The contributed action (19 §4; R-15, U5c): offers the
			 * `generate-image` function on standard-mode sessions from the
			 * composer's primary row (`quick`) and as `/generate-image`. Same
			 * namespace as the genre owner, so it lands as a companion — present
			 * by default — and renders itself with no client code.
			 */
			contributes: {
				actions: [
					{
						key: 'generate-image',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'image',
						/** The prompt is the whole instruction (lair pass R3): nothing to render without it. */
						collects: { text: { need: 'required', label: { en: 'What should the image show?' } } },
						label: { en: 'Image' },
						description: { en: 'Describe an image, make it and post it in the session.' },
					},
				],
			},
		})
			// Manually triggered — a person presses the button; no message drives it.
			/** The usage lock (24 §4): a person-invoked action on Chat sessions. */
			.inlet('input', C.userMessage.v1(), { suits: [] })
			/**
			 * The render. Its slots are references rather than values so that the
			 * connection, the sampling config, the prompt templates and the
			 * node's own parameters are all things an admin edits in the panel —
			 * the spec says WHICH slots exist, never what is in them.
			 */
			.oracle('render', ($) =>
				C.generateImage.v1({
					prompt: $.input.text,
					connection: slot.connection(),
					sampling: slot.sampling(),
					workflow: slot.workflow(),
					prompts: slot.prompts(),
					params: slot.params(),
				}),
			)
			/**
			 * The write. One node, not a create followed by an attach: a message
			 * created inside a run cannot be the target of a later node, so
			 * posting an image as a NEW message has to be a single write.
			 */
			.outlet('post', ($) =>
				C.createMessage.v1({
					text: $.render.caption,
					media: $.render.media,
				}),
			)
			/**
			 * Review OFF by default: the prompt was just typed into the action's
			 * form, and asking again was the "two dialogs for one image" confusion
			 * (2026-10-11). The *review-on* author preset retired with
			 * configurations (R38, 2026-10-20): a registration's values turn the
			 * review on (`{ render: { settings: { review: 'on' } } }`). The render
			 * runs on the Images loadout (I12).
			 */
			.defaults((p) =>
				p.loadout('render', slot.loadout(CORE_LOADOUT.images)),
			)
			.build(),
	)
