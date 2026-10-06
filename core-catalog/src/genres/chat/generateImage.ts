/**
 * Generate an image and post it, from a button in the composer.
 *
 * The end-to-end case for local image generation, and deliberately the smallest
 * spec that is one: a person presses the button, the run parks at the provider
 * for them to write the prompt, the image is rendered and stored, and a message
 * carrying it is posted. Three nodes, no queries, no assembled context.
 *
 * ## Why the review gate is the prompt entry
 *
 * There is no bespoke "SD prompt" modal, and there should not be. The provider is
 * `effects: 'external'`, which makes it gate-eligible, and the shipped default
 * preset turns its review ON — so the executor parks there and infers a form from
 * the node's own payload. The prompt fields a person fills in ARE the payload the
 * run resumes with.
 *
 * The consequence worth stating: the modal is generated from the contract, so a
 * parameter added to the provider appears in it with no client change, and there
 * is no second place for the prompt to live and drift.
 *
 * ## Why `caption` becomes the message text
 *
 * The rendered prompt is the honest description of what was made, and a message
 * with an image and no text reads as broken in every client that shows a preview.
 * A spec that wanted something else would wire `text` from somewhere else; this
 * one has nowhere else to get it from.
 */
import { compile, spec, sessionEvents, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '../../registry/genres.js'

/** @experimental */
export const CHAT_GENERATE_IMAGE_SPEC_ID = 'core:spec/chat-generate-image'
/** @internal */
export const CHAT_GENERATE_IMAGE_VERSION = '1.0.0'

/** @experimental */
export const generateImageSpec = () =>
	compile(
		spec(CHAT_GENERATE_IMAGE_SPEC_ID, {
			version: CHAT_GENERATE_IMAGE_VERSION,
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
			.inlet('input', C.userMessage.v1(), {
				genre: chatGenre,
				event: sessionEvents.sessionAction,
			})
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
			 * Review ON by default, because this is where the prompt is written.
			 * Turning it off is a legitimate choice for a spec driven by an
			 * upstream text node instead of by a person — which is why it is a
			 * preset rather than a hardcoded setting.
			 */
			.preset('review-on', { label: 'Ask for the prompt', default: true }, (p) =>
				p.settings('render', { review: 'on' }),
			)
			.build(),
	)
