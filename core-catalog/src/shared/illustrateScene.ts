/**
 * 🚧 The **Scene action** — illustrate the scene as it stands
 * (DESIGN-image-generation §6.4, unit I9, 2026-10-12).
 *
 * Not the §9 *scene* (a bounded stretch of a session that a summary files):
 * this pipeline draws ONE picture of where the session is right now. Every
 * word for it is qualified — *the Scene action*, *illustrate scene*.
 *
 *   input       (session action)         one press; no form
 *   gather      (history + cast)         the last few lines, who is here
 *   likeness    (likeness-images)        everyone on stage's likeness image
 *   context     (narrator builder)       the **scene prompt** row, `{{likenesses}}`
 *   write       (generate-text)          a quiet call: a tag list, not a line
 *   clean       (clean-image-prompt)     the reply as one prompt line
 *   draw        (generate-image)         landscape, the likenesses as references
 *   placement   (picture-placement)      message, backdrop or both
 *   post / set  (create-message, set-backdrop), each behind its own junction
 *
 * ## The quiet call
 *
 * Adventure's Ask, without its JSON: the narrator builder (no speaker, so no
 * seed line a character would continue), a prose transcript of the last
 * `limit` lines (6), and the shipped row **Scene prompt from the last lines**
 * asking for a comma-separated tag list — setting, time of day, weather, who
 * is present by their likeness tags, composition, no names. **Scene prompt,
 * prose** is the second row, for a
 * hosted picture model that reads sentences. Nothing it writes reaches the
 * transcript; the run's card shows it.
 *
 * ## Placement
 *
 * `placement` (`message` · `backdrop` · `both`, default `both`) is a
 * parameter on its own step, so an admin changes it in Admin › Pipelines;
 * the Backdrop widget's *Illustrate* fires this action with
 * `{ placement: 'backdrop' }` in its payload, which wins.
 *
 * ## Review: off
 *
 * Ruled 2026-10-12: one press, one picture. `review-on` parks the picture
 * step with the cleaned prompt for a person who wants to see it first.
 *
 * ## Loadouts
 *
 * The quiet call runs on **Scene prompt**, the picture on **Scene**; each
 * falls back to Reply and Images when unfilled.
 *
 * ## One graph, one spec per genre
 *
 * An inlet is locked to one genre, so each genre that offers Scene ships its
 * own spec — `core:spec/chat-illustrate-scene` and
 * `core:spec/adventure-illustrate-scene` (2026-10-12) — and both call
 * `illustrateSceneGraph` here with their own id, version and genre. The
 * graph is written once; the two specs differ only in identity and inlet.
 * Both use the narrator builder (the scene prompt rows live in its pool and
 * it lays out `{{likenesses}}`), not Adventure Look's scene builder: the
 * picture is drawn from the last lines and the cast's looks, not the lore.
 */
import { compile, spec, sessionEvents, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../loadouts.js'
import type { adventureGenre, chatGenre } from '../registry/genres.js'

/** The action's key — `<scene spec>#illustrate-scene`. @experimental */
export const ILLUSTRATE_SCENE_ACTION_KEY = 'illustrate-scene'

/** The step keys a host or a test reads by name. @internal */
export const CHAT_ILLUSTRATE_SCENE_NODES = {
	history: 'gather.history.read',
	likeness: 'likeness',
	write: 'write',
	clean: 'clean',
	draw: 'draw',
	placement: 'placement',
	post: 'toMessage.yes.post',
	backdrop: 'toBackdrop.yes.set',
} as const

/** The scene prompt's two rows' seed keys. @internal */
export const CHAT_ILLUSTRATE_SCENE_PROMPT_SEED_KEYS = {
	tags: 'pipeline-prompt:core:task/build-narrator-context:prompts:scene-prompt-tags',
	prose: 'pipeline-prompt:core:task/build-narrator-context:prompts:scene-prompt-prose',
} as const

/** How many recent lines the scene prompt reads. */
const LOOKBACK = 6

/** The picture step's parameters, in both presets. */
const DRAW_PARAMS = {
	orientation: 'landscape',
	references: 'preferred',
} as const

/** What a genre's Scene spec passes in: its identity and its inlet's genre. @internal */
export interface IllustrateSceneOptions {
	id: string
	version: string
	genre: typeof chatGenre | typeof adventureGenre
}

/** The Scene action's graph, for one genre's spec. @internal */
export const illustrateSceneGraph = ({ id, version, genre }: IllustrateSceneOptions) =>
	compile(
		spec(id, {
			version,
			taxonomy: { role: 'action' },
			contributes: {
				actions: [
					{
						key: ILLUSTRATE_SCENE_ACTION_KEY,
						venue: { kind: 'composer' },
						quick: true,
						icon: 'mountain',
						label: { en: 'Scene' },
						description: {
							en: 'Draw the scene as it stands, from the last few lines, and set it as the backdrop.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre,
				event: sessionEvents.sessionAction,
			})
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('cast', (c) =>
						c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
					),
			)
			/** Everyone on stage's likeness image, in the order `{{likenesses}}` lists them. */
			.query('likeness', ($) => C.likenessImages.v1({ scope: $.input.sessionScope }))
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('write'),
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			/** The narrator builder: no speaker, and `{{likenesses}}` for the cast's looks. */
			.task('context', ($) =>
				C.buildNarratorContext.v1({
					cast: $.gather.cast.read.cast,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/** Prose and no seed — a description is asked for, not a turn taken. */
			.task('lines', ($) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('write'),
				}),
			)
			/** The **scene prompt**: a quiet call, never a line of the session. */
			.oracle('write', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Describing the scene', label: 'Scene prompt', purpose: 'Turns the last few lines into a picture description.' } },
			)
			.task('clean', ($) => C.cleanImagePrompt.v1({ text: $.write.text }))
			.oracle('draw', ($) =>
				C.generateImage.v1({
					prompt: $.clean.prompt,
					references: $.likeness.references,
					connection: slot.connection(),
					sampling: slot.sampling(),
					workflow: slot.workflow(),
					prompts: slot.prompts(),
					params: slot.params(),
				}),
				{ expose: { status: 'Drawing the scene', label: 'Picture', purpose: 'Draws the described scene, with the cast as reference.' } },
			)
			.task('placement', ($) =>
				C.picturePlacement.v1({ payload: $.input.payload, params: slot.params() }),
			)
			.junction('toMessage', { on: ($: any) => $.placement.message }, (j) =>
				j.when('yes', { truthy: true }, (c) =>
					c.outlet('post', ($: any) =>
						C.createMessage.v1({
							text: $.draw.caption,
							media: $.draw.media,
						}),
					),
				),
			)
			.junction('toBackdrop', { on: ($: any) => $.placement.backdrop }, (j) =>
				j.when('yes', { truthy: true }, (c) =>
					c.outlet('set', ($: any) => C.setBackdrop.v1({ media: $.draw.media })),
				),
			)
			/** Review OFF (ruled 2026-10-12): one press, one picture. */
			.preset('default', { label: 'Default', default: true }, (p) =>
				p
					.params('gather.history.read', { limit: LOOKBACK })
					.params('draw', { ...DRAW_PARAMS })
					.loadout('write', slot.loadout(CORE_LOADOUT.scenePrompt))
					.loadout('draw', slot.loadout(CORE_LOADOUT.scene)),
			)
			/** Opt-in: park at the picture step with the cleaned prompt. */
			.preset('review-on', { label: 'Review the prompt before drawing' }, (p) =>
				p
					.params('gather.history.read', { limit: LOOKBACK })
					.params('draw', { ...DRAW_PARAMS })
					.settings('draw', { review: 'on' })
					.loadout('write', slot.loadout(CORE_LOADOUT.scenePrompt))
					.loadout('draw', slot.loadout(CORE_LOADOUT.scene)),
			)
			.build(),
	)
