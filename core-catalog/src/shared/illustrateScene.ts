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
 * Ruled 2026-10-12: one press, one picture. The *review-on* author preset
 * retired with configurations (R38, 2026-10-20): a registration's values
 * park the picture step (`{ draw: { settings: { review: 'on' } } }`).
 *
 * ## Loadouts
 *
 * The quiet call runs on **Scene prompt**, the picture on **Scene**; each
 * falls back to Reply and Images when unfilled.
 *
 * ## One graph, two ways to fire it
 *
 * The Scene action (`core:spec/story-illustrate-scene`, a press) and, since
 * 2026-10-20, *Picture each new scene* (`core:spec/story-illustrate-new-scene`,
 * a routine fired when a scene opens) both call `illustrateSceneGraph` with
 * their own id and version; the graph is written once, and the two differ
 * only in identity and inlet. Neither names a genre: the Story genre's
 * defaults register them.
 * Both use the narrator builder (the scene prompt rows live in its pool and
 * it lays out `{{likenesses}}`), not Adventure Look's scene builder: the
 * picture is drawn from the last lines and the cast's looks, not the lore.
 */
import { compile, spec, sessionEvents, slot, coreEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../loadouts.js'
import type { GenreDecl, OutPortsOf, SpecBuilder } from '@serene-pub/sdk'

/** The action's key — `<scene spec>#illustrate-scene`. @experimental */
export const ILLUSTRATE_SCENE_ACTION_KEY = 'illustrate-scene'

/** The step keys a host or a test reads by name. @internal */
export const STORY_ILLUSTRATE_SCENE_NODES = {
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
export const STORY_ILLUSTRATE_SCENE_PROMPT_SEED_KEYS = {
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

/** What a genre's Scene spec passes in: its identity, and how it is fired. @internal */
export interface IllustrateSceneOptions {
	id: string
	version: string
	/** ⏳ Kept for callers; a pipeline names no genre since 2026-10-20 (`{ suits }`). */
	genre?: GenreDecl
	/**
	 * 🚧 `action` (the default): the Scene action, a person's press. `routine`
	 * (2026-10-20): the same graph as a routine — *Picture each new scene*,
	 * fired when a scene opens (`core:inlet/routine@1`), with no action and no
	 * payload, so the step's own `placement` decides.
	 */
	fired?: 'action' | 'routine'
}

/**
 * Either inlet's ports, read as one: the routine's and a press's — what the
 * graph after the inlet reads is on both (`sessionScope`), and the press's
 * `payload` is read only when it is a press.
 */
type SceneInlet = OutPortsOf<ReturnType<typeof C.routine.v1>> & OutPortsOf<ReturnType<typeof C.userMessage.v1>>

/** The Scene action's graph, for one genre's spec. @internal */
export const illustrateSceneGraph = ({ id, version, fired = 'action' }: IllustrateSceneOptions) => {
	const routine = fired === 'routine'
	const head = (routine
		? spec(id, { version, taxonomy: { role: 'maintenance' } }).inlet('input', C.routine.v1(), {
				suits: [coreEvents.sceneOpened],
			})
		: spec(id, {
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
			.inlet('input', C.userMessage.v1(), { suits: [] })) as SpecBuilder<{ input: SceneInlet }>
	return compile(
		head
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
					prompts: slot.prompts($.context),
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
					// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
					speechSampling: slot.speechSampling(),
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
				C.picturePlacement.v1({ ...(routine ? {} : { payload: $.input.payload }), params: slot.params() }),
			)
			.junction('toMessage', { on: ($) => $.placement.message }, (j) =>
				j.when('yes', { truthy: true }, (c) =>
					c.outlet('post', ($) =>
						C.createMessage.v1({
							text: $.draw.caption,
							media: $.draw.media,
						}),
					),
				),
			)
			.junction('toBackdrop', { on: ($) => $.placement.backdrop }, (j) =>
				j.when('yes', { truthy: true }, (c) =>
					c.outlet('set', ($) => C.setBackdrop.v1({ media: $.draw.media })),
				),
			)
			/** Review OFF (ruled 2026-10-12): one press, one picture. */
			.defaults((p) =>
				p
					.params('gather.history.read', { limit: LOOKBACK })
					.params('draw', { ...DRAW_PARAMS })
					.loadout('write', slot.loadout(CORE_LOADOUT.scenePrompt))
					.loadout('draw', slot.loadout(CORE_LOADOUT.scene)),
			)
			.build(),
	)
}
