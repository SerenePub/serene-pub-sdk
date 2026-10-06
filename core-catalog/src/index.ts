/**
 * @serene-pub/core-catalog — core's announcement (24 §9).
 *
 * The genres, pipelines and hook declarations Serene Pub ships, as a
 * publishable package: SP core boot-seeds from it (the app's
 * `src/lib/server/pipelines/specs/*` are thin re-exports of this package),
 * conformance consumes it as fixtures, and modders import it for typed
 * references — `import { chatGenre, chatTurnOrder } from "@serene-pub/core-catalog"`.
 *
 * Moving the documents here is what makes core the first consumer of the
 * announce path rather than a special case: one validator, one document
 * shape, one hash discipline for core and plugins alike. The remaining
 * shipped prompts and the default preset ride the announcement too (T6b);
 * the shipped default configs stay derived (declarations + default author
 * preset + ref defaults) — there is no hand-authored config data to carry.
 *
 * ## Where things live
 *
 *  - `genres/<genre>/` — every pipeline locked to that genre (create, reply,
 *    actions, answer form, turn order), one per file, and any widget only that
 *    genre offers (Chat's Author's note, under `genres/chat/ui/`).
 *  - `shared/` — what more than one genre uses: the built-in writes, sprites,
 *    the annex field write, summarize, the story-graph build, and the shared
 *    widgets' typed sections (`shared/ui/`). Also the tool-loop reference,
 *    exported as an example and test fixture but not in `CORE_SPECS`.
 *  - `factories/` — the builders a genre calls once per genre (answer form,
 *    turn order), core's genres and a plugin's alike.
 *  - `registry/` — the modules that register on import (genres, slots, stat
 *    shapes, entry types, core's widgets) and the layouts the genres name.
 *  - `seed/` — the shipped prompts, presets and the guide's mascot image.
 *
 * The widgets' Svelte sources mirror it under `../components/` (`genres/chat/`,
 * `shared/`).
 */
import {
	announcementOf,
	defineExtension,
	type AnnouncementDocument,
	type CoverageReport,
	type Extension,
	type I18n,
} from '@serene-pub/sdk'
import { CORE_PROMPTS } from './seed/prompts.js'
import { corePresetInputs } from './seed/presets.js'
import { adventureGenre, chatGenre, guideGenre } from './registry/genres.js'
import { lairGenre } from './registry/genres.js'
import { CHAT_CREATE_SPEC_ID, createChatSpec } from './genres/chat/create.js'
import { GUIDE_CREATE_SPEC_ID, createGuideSpec } from './genres/guide/create.js'
import { GUIDE_RESPOND_SPEC_ID, guideRespondSpec } from './genres/guide/respond.js'
import { ADVENTURE_CREATE_SPEC_ID, adventureCreateSpec } from './genres/adventure/create.js'
import { ADVENTURE_RESPOND_SPEC_ID, adventureRespondSpec } from './genres/adventure/respond.js'
import { ADVENTURE_LOOK_SPEC_ID, adventureLookSpec } from './genres/adventure/look.js'
import { ADVENTURE_REST_SPEC_ID, adventureRestSpec } from './genres/adventure/rest.js'
import { ADVENTURE_ADVANCE_TIME_SPEC_ID, adventureAdvanceTimeSpec } from './genres/adventure/advanceTime.js'
import { ADVENTURE_ASK_SPEC_ID, adventureAskSpec } from './genres/adventure/ask.js'
import { ADVENTURE_ANSWER_SPEC_ID, adventureAnswerSpec } from './genres/adventure/answer.js'
import { CHAT_ANSWER_FORM_SPEC_ID, answerFormChatSpec } from './genres/chat/answerForm.js'
import { ADVENTURE_ANSWER_FORM_SPEC_ID, answerFormAdventureSpec } from './genres/adventure/answerForm.js'
import { GUIDE_ANSWER_FORM_SPEC_ID, answerFormGuideSpec } from './genres/guide/answerForm.js'
import { LAIR_ANSWER_FORM_SPEC_ID, answerFormLairSpec } from './genres/lair/answerForm.js'
import { LAIR_CREATE_SPEC_ID, lairCreateSpec } from './genres/lair/create.js'
import { LAIR_RESPOND_SPEC_ID, lairRespondSpec } from './genres/lair/respond.js'
import { LAIR_BUILD_ROOM_SPEC_ID, lairBuildRoomSpec } from './genres/lair/buildRoom.js'
import { LAIR_ROOM_ANSWER_SPEC_ID, lairRoomAnswerSpec } from './genres/lair/roomAnswer.js'
import { LAIR_FILE_ROOM_SPEC_ID, lairFileRoomSpec } from './genres/lair/fileRoom.js'
import { LAIR_NUDGE_SPEC_ID, lairNudgeSpec } from './genres/lair/nudge.js'
import { LAIR_WHISPER_SPEC_ID, lairWhisperSpec } from './genres/lair/whisper.js'
import { LAIR_TRAP_SPEC_ID, lairTrapSpec } from './genres/lair/trap.js'
import { LAIR_REVEAL_SPEC_ID, lairRevealSpec } from './genres/lair/reveal.js'
import { CHAT_RESPOND_SPEC_ID, respondSpec } from './genres/chat/respond.js'
import { TURN_ORDER_BY_GENRE } from './genres/index.js'
import { CHAT_NARRATE_SPEC_ID, narrateSpec } from './genres/chat/narrate.js'
import { CHAT_SIDE_CHARACTER_SPEC_ID, narrateCharacterSpec } from './genres/chat/narrateCharacter.js'
import { CORE_ANNEX_FIELDS, SET_ANNEX_FIELD_SPEC_ID, setAnnexFieldSpec } from './shared/annexField.js'
import { BUILTIN_DELETE_SPEC_ID, builtinDeleteSpec } from './shared/builtins/delete.js'
import { BUILTIN_HIDE_SPEC_ID, builtinHideSpec } from './shared/builtins/hide.js'
import { BUILTIN_EDIT_SPEC_ID, builtinEditSpec } from './shared/builtins/edit.js'
import { BUILTIN_SWIPE_SPEC_ID, builtinSwipeSpec } from './shared/builtins/swipe.js'
import { BUILTIN_BRANCH_SPEC_ID, builtinBranchSpec } from './shared/builtins/branch.js'
import { SHOW_SPRITE_SPEC_ID, showSpriteSpec } from './shared/sprites.js'
import { CHAT_GENERATE_IMAGE_SPEC_ID, generateImageSpec } from './genres/chat/generateImage.js'
import { GRAPH_BUILD_SPEC_ID, graphBuildSpec } from './shared/graphBuild.js'
import { SUMMARIZE_WORLD_SPEC_ID, summarizeWorldSpec } from './shared/summarize/world.js'
import { SUMMARIZE_CHARACTER_SPEC_ID, summarizeCharacterSpec } from './shared/summarize/character.js'
import { SUMMARIZE_SCENE_SPEC_ID, summarizeSceneSpec } from './shared/summarize/scene.js'
import { SUMMARIZE_HISTORY_SPEC_ID, summarizeHistorySpec } from './shared/summarize/history.js'

export * from './registry/genres.js'
/**
 * The attribute slots core's genres bring.
 *
 * ⚠ A load-bearing re-export, on the same terms as `./registry/entries.js` below:
 * declaring a slot REGISTERS it, and nothing imports these by value. Without
 * the module being reached, the Adventure genre would name seven declarations
 * that this process has never heard of.
 */
/** Core's catalogue of stat shapes — declared before the slots that name them. */
export * from './registry/statShapes.js'
export * from './registry/slots.js'
/**
 * Core's entry types (Part 1). Declaring one **registers** it, which is the
 * fact-about-the-code route node types take — so this re-export is what puts
 * them in `allDefinitions()` for the boot sync.
 *
 * ⚠ A load-bearing side effect. package.json's `sideEffects` names this
 * module, every other module that registers on import (stat shapes, slots,
 * genres, annex fields, core's widgets) — and this entry itself, because core
 * reaches all of them with a bare `import "@serene-pub/core-catalog"`. A pure
 * entry let a release build drop that import, and the server booted with every
 * entry type "declared by no module in this build". `sdk-tests/
 * coreCatalogSideEffects.test.ts` fails when a registering module is missing
 * from the list.
 */
export * from './registry/entries.js'
export * from './seed/prompts.js'
export * from './seed/presets.js'
/** Every genre's pipelines, a folder each, and the lists that span them. */
export * from './genres/index.js'
/** The builders a genre calls once per genre — core's and a plugin genre's alike. */
export * from './factories/answerForm.js'
export * from './factories/turnOrder.js'
/** What more than one genre runs. */
export * from './shared/annexField.js'
export * from './shared/builtins/index.js'
export * from './shared/sprites.js'
export * from './shared/toolLoop.js'
export * from './shared/graphBuild.js'
export * from './shared/summarize/index.js'
export * from './registry/widgets.js'
export * from './registry/layouts.js'

/** @experimental */
export interface CoreSpec {
	slug: string
	/** What a person calls the pipeline — a string or a locale map with `en` (R-20). */
	name: I18n
	/**
	 * Compiled lazily. Compiling resolves type pins against the registry, and
	 * boot syncs that registry first — building at module scope would run the
	 * compile before the sync, and before the conflict check that decides
	 * whether these types mean what this build thinks they mean.
	 */
	build: () => any
}

/**
 * The pipelines core ships — one registry rather than a list of builders
 * beside a map of display names (two collections that had to agree). `name`
 * is what a person calls the thing; a list showing `core:spec/chat-respond` is a
 * list of identifiers, not of things.
 *
 * A name says what the pipeline does and never which genre it serves (ruled
 * 2026-10-05): every list of several genres' pipelines shows the genre beside
 * it, so the four create pipelines are each "Create session" and the four
 * replies each "Reply". The slug is genre first, `core:spec/<genre>-<what>`;
 * one that serves every genre is `core:spec/<what>`.
 * @experimental
 */
export const CORE_SPECS: CoreSpec[] = [
	// First, deliberately: the genre's create pipeline must exist before
	// anything that declares itself for the genre (24 §3).
	{ slug: CHAT_CREATE_SPEC_ID, name: 'Create session', build: createChatSpec },
	/**
	 * The Adventure genre, in the same order and for the same reason: its
	 * create pipeline exists before anything that declares itself for it.
	 */
	{
		slug: ADVENTURE_CREATE_SPEC_ID,
		name: 'Create session',
		build: adventureCreateSpec,
	},
	{
		slug: ADVENTURE_RESPOND_SPEC_ID,
		name: 'Reply',
		build: adventureRespondSpec,
	},
	{ slug: ADVENTURE_LOOK_SPEC_ID, name: 'Look', build: adventureLookSpec },
	{ slug: ADVENTURE_REST_SPEC_ID, name: 'Rest', build: adventureRestSpec },
	{
		slug: ADVENTURE_ADVANCE_TIME_SPEC_ID,
		name: 'Time passes',
		build: adventureAdvanceTimeSpec,
	},
	/** The worked form (R-15 *Forms*; U5d): the narrator asks, the cast answers. */
	{ slug: ADVENTURE_ASK_SPEC_ID, name: 'Ask', build: adventureAskSpec },
	{ slug: ADVENTURE_ANSWER_SPEC_ID, name: 'Answer', build: adventureAnswerSpec },
	/**
	 * The Lair genre (plans/genres §3), create first for the reason above: the
	 * genre's declaration rides `meta.genre` on the create spec's version row,
	 * so nothing that declares itself for the genre can be published before the
	 * genre exists.
	 */
	{ slug: LAIR_CREATE_SPEC_ID, name: 'Create session', build: lairCreateSpec },
	{ slug: LAIR_RESPOND_SPEC_ID, name: 'Reply', build: lairRespondSpec },
	{ slug: LAIR_BUILD_ROOM_SPEC_ID, name: 'Build room', build: lairBuildRoomSpec },
	/** What the knock's options fire — in no listing; see `genres/lair/roomAnswer.ts`. */
	{ slug: LAIR_ROOM_ANSWER_SPEC_ID, name: 'Answer the door', build: lairRoomAnswerSpec },
	/** A room described in a message, filed through review (R11) — on a message's ⋮. */
	{ slug: LAIR_FILE_ROOM_SPEC_ID, name: 'File as a room', build: lairFileRoomSpec },
	{ slug: LAIR_WHISPER_SPEC_ID, name: 'Whisper', build: lairWhisperSpec },
	{ slug: LAIR_NUDGE_SPEC_ID, name: 'Nudge', build: lairNudgeSpec },
	{ slug: LAIR_TRAP_SPEC_ID, name: 'Trigger trap', build: lairTrapSpec },
	{ slug: LAIR_REVEAL_SPEC_ID, name: 'Reveal', build: lairRevealSpec },
	/**
	 * The guide genre (R-18, U5g): create first, for the reason above; its
	 * reply answers as the genre's envoy.
	 */
	{ slug: GUIDE_CREATE_SPEC_ID, name: 'Create session', build: createGuideSpec },
	{ slug: GUIDE_RESPOND_SPEC_ID, name: 'Reply', build: guideRespondSpec },
	{ slug: CHAT_RESPOND_SPEC_ID, name: 'Reply', build: respondSpec },
	/**
	 * The answer pipelines (R-15 *Forms*; U5d): one graph, published once
	 * per shipped genre because a preset binds a spec locked to its genre.
	 * After every genre's create spec, for the reason those come first.
	 */
	{ slug: CHAT_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormChatSpec },
	{
		slug: ADVENTURE_ANSWER_FORM_SPEC_ID,
		name: 'Answer a form',
		build: answerFormAdventureSpec,
	},
	{ slug: GUIDE_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormGuideSpec },
	{ slug: LAIR_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormLairSpec },
	{ slug: CHAT_NARRATE_SPEC_ID, name: 'Narrate', build: narrateSpec },
	// The other half of the narrator split (ruling 2026-09-07). A NEW spec,
	// not a bump: the 0.6 freeze forbids moving an existing semver and says
	// nothing about publishing a new slug.
	{
		slug: CHAT_SIDE_CHARACTER_SPEC_ID,
		name: 'Side character',
		build: narrateCharacterSpec,
	},
	/** Every annex field's write (2026-09-26) — contributes no action; the host's door runs it. */
	{ slug: SET_ANNEX_FIELD_SPEC_ID, name: 'Set annex field', build: setAnnexFieldSpec },
	/**
	 * The built-in writes (R-15): one one-node spec per message verb core
	 * implements, published like every other so a delete is a receipted,
	 * gate-eligible run pinning a hash. Bound to no genre — they serve all.
	 */
	{ slug: BUILTIN_DELETE_SPEC_ID, name: 'Delete message', build: builtinDeleteSpec },
	{ slug: BUILTIN_HIDE_SPEC_ID, name: 'Hide message', build: builtinHideSpec },
	{ slug: BUILTIN_EDIT_SPEC_ID, name: 'Edit message', build: builtinEditSpec },
	{ slug: BUILTIN_SWIPE_SPEC_ID, name: 'Swipe message', build: builtinSwipeSpec },
	{ slug: BUILTIN_BRANCH_SPEC_ID, name: 'Branch session', build: builtinBranchSpec },
	/**
	 * A person's pick of a line's sprite (DESIGN-sprites §6) — not a built-in
	 * (its outlet is also placed by the reply specs' sprite tail), but run the
	 * same way: one receipted action per press, emitting `sprite-shown`.
	 */
	{ slug: SHOW_SPRITE_SPEC_ID, name: 'Change sprite', build: showSpriteSpec },
	{
		slug: CHAT_GENERATE_IMAGE_SPEC_ID,
		name: 'Generate image',
		build: generateImageSpec,
	},
	{
		slug: SUMMARIZE_WORLD_SPEC_ID,
		name: 'Summarize world lore',
		build: summarizeWorldSpec,
	},
	{
		slug: SUMMARIZE_CHARACTER_SPEC_ID,
		name: 'Summarize character lore',
		build: summarizeCharacterSpec,
	},
	{
		slug: SUMMARIZE_SCENE_SPEC_ID,
		name: 'Summarize scene',
		build: summarizeSceneSpec,
	},
	{
		slug: SUMMARIZE_HISTORY_SPEC_ID,
		name: 'Summarize history entry',
		build: summarizeHistorySpec,
	},
	{
		slug: GRAPH_BUILD_SPEC_ID,
		name: 'Build the story graph',
		build: graphBuildSpec,
	},
	/**
	 * Turn order as state (PLAN-turn-order §4.5), one spec per genre (R27,
	 * §4.14): built by the public `turnOrderSpec()`, the same call a plugin
	 * genre makes. They run no model and write no message — five reads and a
	 * `jsonb_set` — and every surface that used to ask "who is next" renders
	 * what they wrote. Last, because each one's lock names its genre and a
	 * spec cannot be published before its genre's create pipeline (24 §3).
	 */
	...TURN_ORDER_BY_GENRE.map(({ spec, build }) => ({
		slug: spec,
		name: 'Turn order',
		build,
	})),
]

/** Lookup by slug, for a caller holding an id that wants the display name. @experimental */
export const coreSpec = (slug: string): CoreSpec | undefined =>
	CORE_SPECS.find((s) => s.slug === slug)

/**
 * Core's hook declarations (24 §11): identity, event, contract, ordering —
 * the referenceable half. Implementations live in SP core with their
 * capabilities (DB access, transactions) and bind to these ids at boot; the
 * boot completeness check refuses a declared hook with no implementation and
 * an implementation with no declaration.
 *
 * Empty today, deliberately: core's script *sites* are declared on the node
 * types in @serene-pub/contracts (`slots.scripts.accepts`), and core has no
 * in-process hook implementations yet. The first one added lands here and in
 * core's implementation registry in the same commit, or boot refuses.
 * @internal
 */
export const CORE_HOOK_DECLARATIONS: Record<
	string,
	{ event: string; description?: unknown; before?: string[]; after?: string[] }
> = {}

/**
 * The announcement — the whole package as one validated declaration (24 §6).
 * Compiled lazily for the same registry-sync reason as `CoreSpec.build`.
 * @experimental
 */
export function coreAnnouncement(): {
	document: AnnouncementDocument
	coverage: CoverageReport
} {
	return announcementOf(coreExtension())
}

/**
 * Core, declared the way any package declares itself — one `defineExtension`
 * call, every reference a value. Built on each call, never at module scope,
 * for the same registry-sync reason as `CoreSpec.build`.
 * @experimental
 */
export const coreExtension = (): Extension =>
	defineExtension({
		slug: 'core',
		name: 'Serene Pub core',
		// Required of every package; core's is not announced (it ships with the app).
		version: '0.6.0',
		description: 'The genres and pipelines Serene Pub ships.',
		author: 'Serene Pub',
		repo: 'https://github.com/doolijb/serene-pub',
		genres: [chatGenre, adventureGenre, guideGenre, lairGenre],
		pipelines: CORE_SPECS.map((s) => s.build()),
		prompts: CORE_PROMPTS.map((p) => ({
			nodeType: p.nodeType,
			slot: p.slot,
			// The announcement-level identity is the bare slug; the seed
			// pass's idempotence key wraps it (see seed/prompts.ts). Unique
			// within a pool, not globally — `summarize-scene-default`
			// names a row in three of them.
			slug: p.seedKey.split(':').at(-1)!,
			label: p.name,
			fields: p.fields,
		})),
		presets: corePresetInputs(),
		// Core's annex declaration (ruling 2026-09-26) — every key a core
		// pipeline keeps in `annex.core`. Not part of the announcement.
		annexFields: [...CORE_ANNEX_FIELDS],
		// The hooks core defines, by bare key: the announcement namespaces
		// them, so strip the prefix it will re-add.
		hooks: Object.fromEntries(
			Object.entries(CORE_HOOK_DECLARATIONS).map(([id, decl]) => [id.replace(/^core:hook\//, ''), decl]),
		),
	})
