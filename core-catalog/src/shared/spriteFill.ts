/**
 * 🚧 **Sprite set fill** — draw a card's sprites from its likeness
 * (DESIGN-image-generation §6.3, unit I5, 2026-10-12).
 *
 * Pressed on the card's Sprites tab (*Fill empty sprites*, a tile's *Redo*,
 * *Redo all*): a card action, so it runs with no session. Five steps, every
 * input written out:
 *
 *   input   (card action)            the card, its likeness, the form's set + labels
 *   series  (task build-sprite-series) one picture per label, each with its phrase
 *   draw    (oracle generate-image)  the series, the likeness image as reference
 *   cutOut  (task cut-out)           the background removed where the model left one
 *   attach  (outlet attach-sprite)   each keyed picture filed under its label
 *
 * ## One spec, three packings
 *
 * The spec says WHAT pictures it wants. How many calls that costs is the
 * host's packing from the pair's drawing sheet (§4.7): a keyed ComfyUI graph
 * draws the set in a few calls with the reference loaded once; a hosted API
 * or KoboldCpp loops one call per label. Nothing here knows which.
 *
 * ## Why it looks alike
 *
 * The same likeness image on every item (`references`) and one seed for the
 * whole run (`seed: per-run`). On an edit-class model the reference does the
 * work; on an SD-class model the shared seed and prompt do. A model that takes
 * no reference image draws from the likeness prompt alone, and the action's
 * form says so before the run (`references: preferred`).
 *
 * ## Review
 *
 * Off: a review form per run would be one form for 28 pictures, and the
 * Sprites tab's contact sheet is where the person looks at what came back
 * (Keep / Redo per tile). `review-on` stays as the opt-in.
 *
 * Genre-less (`core:spec/<what>`, NOMENCLATURE §24 rule 7): a card belongs to
 * no genre.
 */
import { CORE_LOADOUT } from '../loadouts.js'
import { compile, spec, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

/** @experimental */
export const SPRITE_SET_FILL_SPEC_ID = 'core:spec/sprite-set-fill'
/** @internal */
export const SPRITE_SET_FILL_VERSION = '1.0.0'

/** The step keys a host reads by name (the preview, the run's progress). @internal */
export const SPRITE_SET_FILL_NODES = {
	series: 'series',
	draw: 'draw',
	cutOut: 'cutOut',
	attach: 'attach',
} as const

/** @experimental */
export const spriteSetFillSpec = () =>
	compile(
		spec(SPRITE_SET_FILL_SPEC_ID, {
			version: SPRITE_SET_FILL_VERSION,
			taxonomy: { role: 'action' },
		})
			/** The card action: the card, resolved once by the host, and the form's answers. */
			.inlet('input', C.cardAction.v1())
			/** One series item per label, with its phrase from the *Sprite label phrases* row. */
			.task('series', ($) =>
				C.buildSpriteSeries.v1({
					labels: $.input.labels,
					likeness: $.input.likeness,
					likenessNegative: $.input.likenessNegative,
					prompts: slot.prompts(),
				}),
			)
			/**
			 * The pictures. The connection, sampling and prompt rows are the
			 * admin's to set in the panel; the Default config draws upright,
			 * transparent when possible, one seed for the run.
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
			/** The background removed where the model could not leave it transparent. */
			.task('cutOut', ($) =>
				C.cutOut.v1({
					media: $.draw.media,
					params: slot.params(),
				}),
			)
			/** Each keyed picture filed under its sprite label; unkeyed ones ignored. */
			.outlet('attach', ($) =>
				C.attachSprite.v1({
					media: $.cutOut.media,
					characterId: $.input.characterId,
					setName: $.input.setName,
					series: $.series.series,
				}),
			)
			.defaults((p) =>
				p
					.params('draw', {
						orientation: 'portrait',
						cutOut: 'native-or-task',
						references: 'preferred',
						seed: 'per-run',
					})
					.params('cutOut', { mode: 'auto' })
					.loadout('draw', slot.loadout(CORE_LOADOUT.sprites)),
			)
			.build(),
	)
