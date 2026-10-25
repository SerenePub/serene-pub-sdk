/**
 * 🚧 **Portrait** — a few pictures of a card to choose an avatar from
 * (DESIGN-image-generation §6.2, unit I8, 2026-10-12).
 *
 * Pressed on the card's Gallery tab (*Generate portrait*): a card action, so
 * it runs with no session. Four steps, every input written out:
 *
 *   input   (card action)            the card, its likeness, the form's count + style
 *   series  (task build-proofs)      `count` identical pictures (proofs), keyed 1…n
 *   draw    (oracle generate-image)  the series, the likeness image as reference
 *   offer   (outlet offer-media)     each picture put in the card's gallery
 *
 * Not the **Scene Portraits** widget (a session's row of cast pictures): this
 * pipeline makes pictures of ONE card, outside any session.
 *
 * ## One spec, two packings
 *
 * The series is *n* copies of one picture, so every item renders the same
 * prompt: a pair that draws several pictures per call (a hosted API's `n`, a
 * batch graph) packs them as ONE call; KoboldCpp and A1111 loop (§4.7).
 *
 * ## The prompt rows are the style switch
 *
 * *Portrait, tags* (the default — SD-class models read tag lines) and
 * *Portrait, prose* (a sentence — hosted models read prose). The form's
 * **Style** picks the row for the run; there is no new mechanism. Both rows
 * say `{{prompt}}`, which is the card's likeness as wired here — so an edit
 * made at review reaches the picture.
 *
 * ## Review: on
 *
 * A person is already in an editor, so the parked form showing the prompt
 * costs one click (SillyTavern's refine popup). `review-off` is the opt-out.
 *
 * Genre-less (`core:spec/<what>`, NOMENCLATURE §24 rule 7): a card belongs to
 * no genre.
 */
import { CORE_LOADOUT } from '../loadouts.js'
import { compile, spec, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** @experimental */
export const CHARACTER_PORTRAIT_SPEC_ID = 'core:spec/character-portrait'
/** @internal */
export const CHARACTER_PORTRAIT_VERSION = '1.0.0'

/** The step keys a host reads by name (the preview, the run's progress). @internal */
export const CHARACTER_PORTRAIT_NODES = {
	series: 'series',
	draw: 'draw',
	offer: 'offer',
} as const

/**
 * The two prompt rows' seed keys — what the form's **Style** picks between.
 * @internal
 */
export const CHARACTER_PORTRAIT_PROMPT_SEED_KEYS = {
	tags: 'pipeline-prompt:core:oracle/generate-image:prompts:portrait-tags',
	prose: 'pipeline-prompt:core:oracle/generate-image:prompts:portrait-prose',
} as const

/** The draw step's parameters, in both presets. */
const DRAW_PARAMS = {
	orientation: 'portrait',
	cutOut: 'off',
	references: 'preferred',
	seed: 'per-run',
} as const

/** @experimental */
export const characterPortraitSpec = () =>
	compile(
		spec(CHARACTER_PORTRAIT_SPEC_ID, {
			version: CHARACTER_PORTRAIT_VERSION,
			taxonomy: { role: 'action' },
		})
			/** The card action: the card, resolved once by the host, and the form's answers. */
			.inlet('input', C.cardAction.v1())
			/** `count` copies of one picture — proofs to choose from. */
			.task('series', ($) => C.buildProofs.v1({ count: $.input.count }))
			/**
			 * The pictures. The connection, sampling and prompt rows are the
			 * admin's to set in the panel; the Default config draws upright,
			 * one seed for the run, the likeness image as reference when the
			 * model takes one.
			 */
			.oracle('draw', ($) =>
				C.generateImage.v1({
					prompt: $.input.likeness,
					negative: $.input.likenessNegative,
					references: $.input.likenessImage,
					series: $.series.series,
					connection: slot.connection(),
					sampling: slot.sampling(),
					workflow: slot.workflow(),
					prompts: slot.prompts(),
					params: slot.params(),
				}),
			)
			/** Every picture into the card's gallery; nothing chosen for the person. */
			.outlet('offer', ($) =>
				C.offerMedia.v1({
					media: $.draw.media,
					characterId: $.input.characterId,
				}),
			)
			.defaults((p) =>
				p.params('draw', { ...DRAW_PARAMS }).settings('draw', { review: 'on' }).loadout('draw', slot.loadout(CORE_LOADOUT.portrait)),
			)
			.build(),
	)
