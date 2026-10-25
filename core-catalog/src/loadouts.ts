/**
 * Core's shipped **loadouts** (I12; DESIGN-image-generation §13).
 *
 * Declarations, never pairs: the instance seeds each as a row by its id (the
 * seed key) with an empty pair — **unfilled** — and a node naming an unfilled
 * loadout runs on its transform's default loadout. Everything runs on one
 * model until somebody specialises; the wizard fills Reply and Images.
 *
 * `sampling` names a seeded sampling preset by seed key, never by id.
 */
import type { LoadoutDecl } from '@serene-pub/sdk'

/** Core's loadout ids, as values — what a spec's Default config names. @experimental */
export const CORE_LOADOUT = {
	reply: 'core:loadout/reply@1',
	toolCalling: 'core:loadout/tool-calling@1',
	extraction: 'core:loadout/extraction@1',
	scenePrompt: 'core:loadout/scene-prompt@1',
	images: 'core:loadout/images@1',
	portrait: 'core:loadout/portrait@1',
	sprites: 'core:loadout/sprites@1',
	scene: 'core:loadout/scene@1',
	tts: 'core:loadout/tts@1',
	transcription: 'core:loadout/transcription@1',
	spokenReply: 'core:loadout/spoken-reply@1',
	embeddings: 'core:loadout/embeddings@1',
	entities: 'core:loadout/entities@1',
} as const

/** @experimental */
export type CoreLoadoutId = (typeof CORE_LOADOUT)[keyof typeof CORE_LOADOUT]

/**
 * The core set. `defaultFor` marks the ones that become their transform's
 * default the first time that default is set (a fresh install has none set).
 * @experimental
 */
export const CORE_LOADOUTS: ReadonlyArray<LoadoutDecl & { id: CoreLoadoutId; defaultFor?: true }> = [
	{
		id: CORE_LOADOUT.reply,
		name: 'Reply',
		description: 'Writes replies in sessions and answers forms. The model most people pick first.',
		transform: 'text->text',
		sampling: 'sampling-default',
		defaultFor: true,
	},
	{
		id: CORE_LOADOUT.toolCalling,
		name: 'Tool calling',
		description: 'Runs the tool loop. Best on a model with native tool calls.',
		transform: 'text->text',
		sampling: 'sampling-default',
	},
	{
		id: CORE_LOADOUT.extraction,
		name: 'Extraction',
		description:
			'Summaries and the state keeper: reads a passage and answers in a fixed shape. ' +
			'Best on a model with a schema door, at low temperature.',
		transform: 'text->text',
		sampling: 'sampling-extraction',
	},
	{
		id: CORE_LOADOUT.scenePrompt,
		name: 'Scene prompt',
		description: "Writes the picture description for Scene. Short answers at low temperature.",
		transform: 'text->text',
		sampling: 'sampling-extraction',
	},
	{
		id: CORE_LOADOUT.images,
		name: 'Images',
		description: 'Draws pictures for the Image action.',
		transform: 'text->image',
		sampling: 'sampling-image-default',
		defaultFor: true,
	},
	{
		id: CORE_LOADOUT.portrait,
		name: 'Portrait',
		description: "Draws a character's portrait. Best on a model that takes reference pictures.",
		transform: 'text->image',
		sampling: 'sampling-image-default',
		tier: 'best',
	},
	{
		id: CORE_LOADOUT.sprites,
		name: 'Sprites',
		description:
			"Fills a character's sprite set. Best on a model that takes reference pictures and draws " +
			'on a transparent background.',
		transform: 'text->image',
		sampling: 'sampling-image-default',
	},
	{
		id: CORE_LOADOUT.scene,
		name: 'Scene',
		description: "Draws Scene's picture. A fast model is enough.",
		transform: 'text->image',
		sampling: 'sampling-image-default',
		tier: 'fast',
	},
	{
		id: CORE_LOADOUT.tts,
		name: 'Narration',
		description: 'Reads text aloud.',
		transform: 'text->audio',
		defaultFor: true,
	},
	/**
	 * 🚧 O12 (2026-10-21): the model that HEARS — the transcribe step's, for
	 * audio a reply cannot hear itself. Arrives unfilled, like every loadout.
	 */
	{
		id: CORE_LOADOUT.transcription,
		name: 'Transcription',
		description: 'Hears audio a reply cannot, and writes down what it says — voice notes, spoken replies.',
		transform: 'audio->text',
		defaultFor: true,
	},
	/**
	 * 🚧 O12 (2026-10-21): one model writing a reply AND speaking it — the
	 * reply step when its outputs ask for audio. Arrives unfilled.
	 */
	{
		id: CORE_LOADOUT.spokenReply,
		name: 'Spoken reply',
		description: 'Writes a reply and speaks it in the same call. Needs a model that writes audio.',
		transform: 'text->text+audio',
		sampling: 'sampling-default',
		defaultFor: true,
	},
	{
		id: CORE_LOADOUT.embeddings,
		name: 'Embeddings',
		description: 'Turns text into vectors for retrieval and the sprite picker.',
		transform: 'text->embedding',
		defaultFor: true,
	},
	{
		id: CORE_LOADOUT.entities,
		name: 'Entities',
		description: 'Finds the people, places and things a passage names, for lorebook indexing.',
		transform: 'text->entities',
		defaultFor: true,
	},
]
