/**
 * @serene-pub/core-catalog — core's announcement (24 §9).
 *
 * The genres, pipelines and hook declarations Serene Pub ships, as a
 * publishable package: SP core boot-seeds from it (the app's
 * `src/lib/server/pipelines/specs/*` are thin re-exports of this package),
 * conformance consumes it as fixtures, and modders import it for typed
 * references — `import { storyGenre, storyTurnOrder } from "@serene-pub/core-catalog"`.
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
 *  - `genres/<genre>/` — every pipeline of that genre (create, reply,
 *    actions, routines, answer form, turn order), one per file, and any
 *    widget only that genre offers (Story's Author's note, under
 *    `genres/story/ui/`); `genres/defaults.ts`, each genre's defaults — the
 *    registrations that mount those pipelines (2026-10-20: pipelines name no
 *    genre; inlet locks retired).
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
 * The widgets' Svelte sources mirror it under `../components/` (`genres/story/`,
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
import { coreGenres } from './genres/defaults.js'
import { DUNGEON_CRAWLER_CREATE_SPEC_ID, DUNGEON_CRAWLER_WELCOME_SPEC_ID, dungeonCrawlerCreateSpec, dungeonCrawlerWelcomeSpec } from './genres/dungeon-crawler/create.js'
import { DUNGEON_CRAWLER_RESPOND_SPEC_ID, dungeonCrawlerRespondSpec } from './genres/dungeon-crawler/respond.js'
import { DUNGEON_CRAWLER_INTERVIEW_SPEC_ID, dungeonCrawlerInterviewSpec } from './genres/dungeon-crawler/interview.js'
import { DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID, answerFormDungeonCrawlerSpec } from './genres/dungeon-crawler/answerForm.js'
import { DUNGEON_CRAWLER_REVEAL_SPEC_ID, dungeonCrawlerRevealSpec } from './genres/dungeon-crawler/reveal.js'
import { DUNGEON_CRAWLER_AFTER_REST_SPEC_ID, DUNGEON_CRAWLER_REST_SPEC_ID, dungeonCrawlerAfterRestSpec, dungeonCrawlerRestSpec } from './genres/dungeon-crawler/rest.js'
import { DUNGEON_CRAWLER_GOAL_SPEC_ID, dungeonCrawlerGoalSpec } from './genres/dungeon-crawler/goal.js'
import { STORY_CREATE_SPEC_ID, createStorySpec } from './genres/story/create.js'
import { ASSISTANT_CREATE_SPEC_ID, createAssistantSpec } from './genres/chat/create.js'
import { ASSISTANT_RESPOND_SPEC_ID, assistantRespondSpec } from './genres/chat/respond.js'
import { ASSISTANT_ANSWER_FORM_SPEC_ID, answerFormAssistantSpec } from './genres/chat/answerForm.js'
import { GUIDE_CREATE_SPEC_ID, createGuideSpec } from './genres/guide/create.js'
import { GUIDE_RESPOND_SPEC_ID, guideRespondSpec } from './genres/guide/respond.js'
import { STORY_LOOK_SPEC_ID, storyLookSpec } from './genres/story/look.js'
import { STORY_REST_SPEC_ID, storyRestSpec } from './genres/story/rest.js'
import { STORY_AFTER_REST_SPEC_ID, storyAfterRestSpec } from './genres/story/afterRest.js'
import { STORY_ASK_SPEC_ID, storyAskSpec } from './genres/story/ask.js'
import { STORY_ANSWER_SPEC_ID, storyAnswerSpec } from './genres/story/answer.js'
import { STORY_ANSWER_FORM_SPEC_ID, answerFormStorySpec } from './genres/story/answerForm.js'
import { GUIDE_ANSWER_FORM_SPEC_ID, answerFormGuideSpec } from './genres/guide/answerForm.js'
import { LAIR_ANSWER_FORM_SPEC_ID, answerFormLairSpec } from './genres/lair/answerForm.js'
import { LAIR_CREATE_SPEC_ID, lairCreateSpec } from './genres/lair/create.js'
import { LAIR_REPLY_SPEC_ID, lairReplySpec } from './genres/lair/reply.js'
import { LAIR_WELCOME_SPEC_ID, lairWelcomeSpec } from './genres/lair/welcome.js'
import { LAIR_KEEPER_SPEC_ID, lairKeeperSpec } from './genres/lair/keeper.js'
import { LAIR_SCRATCHPAD_SPEC_ID, lairScratchpadSpec } from './genres/lair/scratchpad.js'
import { LAIR_FILE_CURRENT_ROOM_SPEC_ID, lairFileCurrentRoomSpec } from './genres/lair/fileCurrentRoom.js'
import { LAIR_ROLL_SPEC_ID, lairRollSpec } from './genres/lair/roll.js'
import { LAIR_ROLL_ANSWER_SPEC_ID, lairRollAnswerSpec } from './genres/lair/rollAnswer.js'
import { LAIR_BUILD_ROOM_SPEC_ID, lairBuildRoomSpec } from './genres/lair/buildRoom.js'
import { LAIR_ROOM_ANSWER_SPEC_ID, lairRoomAnswerSpec } from './genres/lair/roomAnswer.js'
import { LAIR_FILE_ROOM_SPEC_ID, lairFileRoomSpec } from './genres/lair/fileRoom.js'
import { LAIR_NUDGE_SPEC_ID, lairNudgeSpec } from './genres/lair/nudge.js'
import { LAIR_WHISPER_SPEC_ID, lairWhisperSpec } from './genres/lair/whisper.js'
import { LAIR_TRAP_SPEC_ID, lairTrapSpec } from './genres/lair/trap.js'
import { LAIR_REVEAL_SPEC_ID, lairRevealSpec } from './genres/lair/reveal.js'
import { STORY_RESPOND_SPEC_ID, storyRespondSpec } from './genres/story/respond.js'
import { STORY_RECKONING_SPEC_ID, storyReckoningSpec } from './genres/story/reckoning.js'
import { STORY_SWEEP_SPEC_ID, storySweepSpec } from './genres/story/sweep.js'
import { ASSISTANT_MEMORY_SPEC_ID, assistantMemorySpec } from './genres/chat/memory.js'
import { TURN_ORDER_BY_GENRE } from './genres/index.js'
import { STORY_NARRATE_SPEC_ID, narrateSpec } from './genres/story/narrate.js'
import { STORY_SIDE_CHARACTER_SPEC_ID, narrateCharacterSpec } from './genres/story/narrateCharacter.js'
import { CORE_ANNEX_FIELDS, SET_ANNEX_FIELD_SPEC_ID, setAnnexFieldSpec } from './shared/annexField.js'
import { SAVE_MESSAGE_SPEC_ID, saveMessageSpec } from './shared/saveMessage.js'
import { BUILTIN_DELETE_SPEC_ID, builtinDeleteSpec } from './shared/builtins/delete.js'
import { BUILTIN_HIDE_SPEC_ID, builtinHideSpec } from './shared/builtins/hide.js'
import { BUILTIN_EDIT_SPEC_ID, builtinEditSpec } from './shared/builtins/edit.js'
import { BUILTIN_SWIPE_SPEC_ID, builtinSwipeSpec } from './shared/builtins/swipe.js'
import { BUILTIN_BRANCH_SPEC_ID, builtinBranchSpec } from './shared/builtins/branch.js'
import { SHOW_SPRITE_SPEC_ID, showSpriteSpec } from './shared/sprites.js'
import { SPRITE_SET_FILL_SPEC_ID, spriteSetFillSpec } from './shared/spriteFill.js'
import { RULES_ACTION_SPEC_ID, rulesActionSpec } from './rulesets/rulesAction.js'
import { CHARACTER_PORTRAIT_SPEC_ID, characterPortraitSpec } from './shared/portrait.js'
import { DESCRIBE_LIKENESS_SPEC_ID, describeLikenessSpec } from './shared/describeLikeness.js'
import { STORY_GENERATE_IMAGE_SPEC_ID, generateImageSpec } from './genres/story/generateImage.js'
import {
	STORY_ILLUSTRATE_NEW_SCENE_SPEC_ID,
	STORY_ILLUSTRATE_SCENE_SPEC_ID,
	illustrateNewSceneSpec,
	illustrateSceneSpec,
} from './genres/story/illustrateScene.js'
import { STORY_ADVANCE_TIME_SPEC_ID, storyAdvanceTimeSpec } from './genres/story/advanceTime.js'
import { GRAPH_BUILD_SPEC_ID, graphBuildSpec } from './shared/graphBuild.js'
import { SUMMARIZE_WORLD_SPEC_ID, summarizeWorldSpec } from './shared/summarize/world.js'
import { SUMMARIZE_CHARACTER_SPEC_ID, summarizeCharacterSpec } from './shared/summarize/character.js'
import { SUMMARIZE_SCENE_SPEC_ID, summarizeSceneSpec } from './shared/summarize/scene.js'
import { SUMMARIZE_HISTORY_SPEC_ID, summarizeHistorySpec } from './shared/summarize/history.js'
import {
	GUIDE_SUMMARIZE_SCENE_SPEC_ID,
	LAIR_SUMMARIZE_SCENE_SPEC_ID,
	STORY_SUMMARIZE_SCENE_SPEC_ID,
} from './shared/summarize/sceneIds.js'
import { storySummarizeSceneSpec } from './genres/story/summarizeScene.js'
import { guideSummarizeSceneSpec } from './genres/guide/summarizeScene.js'
import { lairSummarizeSceneSpec } from './genres/lair/summarizeScene.js'

export * from './registry/genres.js'
/** 🚧 What the host keeps for core's genres beside the rules' attributes (RF fix 8): registered on import. */
export * from './registry/hostState.js'
/** 🚧 What core retired and renamed (2026-10-19) — data for the host's cull and migration. */
export * from './registry/retired.js'
/**
 * The attribute slots core declares (🚧 since RF fix 8 no genre brings any:
 * the rulesets borrow them, and the host keeps some for core's genres).
 *
 * ⚠ A load-bearing re-export, on the same terms as `./registry/entries.js` below:
 * declaring a slot REGISTERS it, and nothing imports these by value. Without
 * the module being reached, a ruleset borrowing health would name a
 * declaration this process has never heard of.
 */
/** Core's catalogue of stat shapes — declared before the slots that name them. */
export * from './registry/statShapes.js'
export * from './registry/slots.js'
/**
 * 🚧 Core's rulesets — Freeform, Vis Itineris and (2026-10-22) Wherewithal, the
 * diceless one. Load-bearing on the same terms: declaring a ruleset (or its
 * slots) registers it, and `sideEffects` names the modules.
 */
export * from './registry/rulesets.js'
export * from './rulesets/vis-itineris/index.js'
export * from './rulesets/wherewithal/index.js'
/**
 * 🚧 Core's ruleset templates (2026-10-22) — the archetypes _New ruleset_
 * starts from (`RULESET_TEMPLATES`). Declaring one registers it in the
 * template registry and its slots, so `sideEffects` names its modules.
 */
export * from './rulesets/templates/index.js'
/**
 * 🚧 Core's archetypes (PLAN-rulesets-functions D9, 2026-10-23) — romance,
 * slice of life, workplace, card game — that lead `RULESET_TEMPLATES`.
 * Registering on import, on the same terms; named in `sideEffects`.
 */
export * from './rulesets/archetypes/index.js'
/**
 * 🚧 **Core's function catalogue** (PLAN-rulesets-functions D1, D3, D4;
 * 2026-10-23) — the function modules a ruleset references, by group. Declaring
 * one registers it, so `sideEffects` names each group's module.
 */
export * from './functions/index.js'
/**
 * 🚧 The builders core's rulesets are written in the seven sections with, and
 * Vis Itineris and Wherewithal in them (`registry/rulesets.ts` declares both).
 */
export * from './rulesets/sections.js'
export * from './rulesets/vis-itineris/ruleset.js'
export * from './rulesets/wherewithal/ruleset.js'
/** 🚧 A ruleset's action — the one generic `core:spec/rules-action` pipeline (D6). */
export * from './rulesets/rulesAction.js'
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
/**
 * 🚧 Core's primers — Vis Itineris's starter world and Freeform's blank. Registers on
 * import (after the entry types its entries are checked against); named in
 * `sideEffects` on the same terms.
 */
export * from './registry/primers.js'
export * from './rulesets/vis-itineris/primer/index.js'
export * from './seed/prompts.js'
export * from './seed/presets.js'
// 🚧 The scripts core seeds by key (2026-10-15).
export * from './seed/scripts.js'
export * from './seed/visItinerisScripts.js'
export * from './seed/wherewithalScripts.js'
// The core loadouts (I12): declarations the instance seeds unfilled by id.
export * from './loadouts.js'
/** Every genre's pipelines, a folder each, and the lists that span them. */
export * from './genres/index.js'
/** The builders a genre calls once per genre — core's and a plugin genre's alike. */
export * from './factories/answerForm.js'
export * from './factories/turnOrder.js'
/** What more than one genre runs. */
export * from './shared/annexField.js'
export * from './shared/saveMessage.js'
export * from './shared/builtins/index.js'
export * from './shared/sprites.js'
export * from './shared/spriteFill.js'
export * from './shared/portrait.js'
export * from './shared/describeLikeness.js'
export { fileLore, rememberNote } from './shared/lore.js'
export * from './shared/timePasses.js'
export * from './shared/toolLoop.js'
export * from './shared/graphBuild.js'
export * from './shared/summarize/index.js'
export { closeOutAction } from './shared/summarize/summarizeSpec.js'
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
 * is what a person calls the thing; a list showing `core:spec/story-respond` is a
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
	/**
	 * 🚧 The Story genre (2026-10-19: the roleplay Chat and Adventure, folded),
	 * create first; its reply, then the actions it took over from Adventure.
	 */
	{ slug: STORY_CREATE_SPEC_ID, name: 'Create session', build: createStorySpec },
	{ slug: STORY_RESPOND_SPEC_ID, name: 'Reply', build: storyRespondSpec },
	{ slug: STORY_LOOK_SPEC_ID, name: 'Look', build: storyLookSpec },
	{ slug: STORY_REST_SPEC_ID, name: 'Rest', build: storyRestSpec },
	// 🚧 GM 2026-10-23 (G1 ★5, S3): Story's own effect after the rules' Rest — the clock moves by it.
	{ slug: STORY_AFTER_REST_SPEC_ID, name: 'After a rest', build: storyAfterRestSpec },
	/** The worked form (R-15 *Forms*; U5d): the narrator asks, the cast answers. */
	{ slug: STORY_ASK_SPEC_ID, name: 'Ask', build: storyAskSpec },
	{ slug: STORY_ANSWER_SPEC_ID, name: 'Answer', build: storyAnswerSpec },
	/**
	 * 🚧 Story's routines (PLAN-layering §4, 2026-10-20) — the reckoning and
	 * the sweep that left the reply, and the picture of each new scene.
	 */
	{ slug: STORY_RECKONING_SPEC_ID, name: 'Note what changed', build: storyReckoningSpec },
	{ slug: STORY_SWEEP_SPEC_ID, name: 'Look back over the story', build: storySweepSpec },
	{ slug: STORY_ILLUSTRATE_NEW_SCENE_SPEC_ID, name: 'Picture each new scene', build: illustrateNewSceneSpec },
	/** 🚧 Chat — the plain assistant (2026-10-19), create first for the same reason. */
	{ slug: ASSISTANT_CREATE_SPEC_ID, name: 'Create session', build: createAssistantSpec },
	{ slug: ASSISTANT_RESPOND_SPEC_ID, name: 'Reply', build: assistantRespondSpec },
	/** 🚧 Chat's routine (PLAN-layering §4, 2026-10-20): *Remember things*, every few turns, Off by default. */
	{ slug: ASSISTANT_MEMORY_SPEC_ID, name: 'Remember things', build: assistantMemorySpec },
	/**
	 * The Lair genre (rewritten 2026-10-21), create first for the reason
	 * above: the genre's declaration rides `meta.genre` on the create spec's
	 * version row. Then its reply (the plan, the checks, the voices), the
	 * welcome of a seated guest, its routines and its actions.
	 */
	{ slug: LAIR_CREATE_SPEC_ID, name: 'Create session', build: lairCreateSpec },
	{ slug: LAIR_REPLY_SPEC_ID, name: 'Reply', build: lairReplySpec },
	{ slug: LAIR_WELCOME_SPEC_ID, name: 'Welcome a newcomer', build: lairWelcomeSpec },
	/** 🚧 The Lair's routines (D7): the books after each round, the Castellan's notes, filing the current room. */
	{ slug: LAIR_KEEPER_SPEC_ID, name: 'Keep the books', build: lairKeeperSpec },
	{ slug: LAIR_SCRATCHPAD_SPEC_ID, name: 'Keep the scratchpad', build: lairScratchpadSpec },
	{ slug: LAIR_FILE_CURRENT_ROOM_SPEC_ID, name: 'File the current room', build: lairFileCurrentRoomSpec },
	{ slug: LAIR_BUILD_ROOM_SPEC_ID, name: 'Build room', build: lairBuildRoomSpec },
	/** What the knock's option fires — in no listing; see `genres/lair/roomAnswer.ts`. */
	{ slug: LAIR_ROOM_ANSWER_SPEC_ID, name: 'Answer the door', build: lairRoomAnswerSpec },
	/** A room described in a message, filed through review (R11) — on a message's ⋮. */
	{ slug: LAIR_FILE_ROOM_SPEC_ID, name: 'File as a room', build: lairFileRoomSpec },
	{ slug: LAIR_WHISPER_SPEC_ID, name: 'Whisper', build: lairWhisperSpec },
	{ slug: LAIR_NUDGE_SPEC_ID, name: 'Nudge', build: lairNudgeSpec },
	{ slug: LAIR_TRAP_SPEC_ID, name: 'Trigger trap', build: lairTrapSpec },
	{ slug: LAIR_REVEAL_SPEC_ID, name: 'Reveal', build: lairRevealSpec },
	/** 🚧 The dice (D3): the GM's own Roll, and what a roll form fires — in no listing. */
	{ slug: LAIR_ROLL_SPEC_ID, name: 'Roll', build: lairRollSpec },
	{ slug: LAIR_ROLL_ANSWER_SPEC_ID, name: 'Answer a roll', build: lairRollAnswerSpec },
	/**
	 * 🚧 Dungeon Crawler (PLAN-dungeon-crawler-2026-10-14), create first for
	 * the reason above. The welcome opens a newcomer's Planner lane; the
	 * interview's answers, Just play and genesis are one action (`answer`,
	 * the `form` venue).
	 */
	{ slug: DUNGEON_CRAWLER_CREATE_SPEC_ID, name: 'Create session', build: dungeonCrawlerCreateSpec },
	{ slug: DUNGEON_CRAWLER_RESPOND_SPEC_ID, name: 'Reply', build: dungeonCrawlerRespondSpec },
	{ slug: DUNGEON_CRAWLER_WELCOME_SPEC_ID, name: 'Welcome a newcomer', build: dungeonCrawlerWelcomeSpec },
	{ slug: DUNGEON_CRAWLER_INTERVIEW_SPEC_ID, name: 'Answer the Planner', build: dungeonCrawlerInterviewSpec },
	{ slug: DUNGEON_CRAWLER_REVEAL_SPEC_ID, name: 'Reveal the planning notes', build: dungeonCrawlerRevealSpec },
	{ slug: DUNGEON_CRAWLER_REST_SPEC_ID, name: 'Rest', build: dungeonCrawlerRestSpec },
	// 🚧 lane G3 (2026-10-23, S3): the crawl's own effects after the rules' Rest — GM: CORE_SPECS row.
	{ slug: DUNGEON_CRAWLER_AFTER_REST_SPEC_ID, name: 'After a rest', build: dungeonCrawlerAfterRestSpec },
	{ slug: DUNGEON_CRAWLER_GOAL_SPEC_ID, name: 'After the goal', build: dungeonCrawlerGoalSpec },
	/**
	 * The guide genre (R-18, U5g): create first, for the reason above; its
	 * reply answers as the genre's envoy.
	 */
	{ slug: GUIDE_CREATE_SPEC_ID, name: 'Create session', build: createGuideSpec },
	{ slug: GUIDE_RESPOND_SPEC_ID, name: 'Reply', build: guideRespondSpec },
	/**
	 * The answer pipelines (R-15 *Forms*; U5d): one graph, published once
	 * per shipped genre because a preset binds a spec locked to its genre.
	 * After every genre's create spec, for the reason those come first.
	 */
	{ slug: STORY_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormStorySpec },
	{ slug: ASSISTANT_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormAssistantSpec },
	{ slug: GUIDE_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormGuideSpec },
	{ slug: LAIR_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormLairSpec },
	{ slug: DUNGEON_CRAWLER_ANSWER_FORM_SPEC_ID, name: 'Answer a form', build: answerFormDungeonCrawlerSpec },
	{ slug: STORY_NARRATE_SPEC_ID, name: 'Narrate', build: narrateSpec },
	// The other half of the narrator split (ruling 2026-09-07). A NEW spec,
	// not a bump: the 0.6 freeze forbids moving an existing semver and says
	// nothing about publishing a new slug.
	{
		slug: STORY_SIDE_CHARACTER_SPEC_ID,
		name: 'Side character',
		build: narrateCharacterSpec,
	},
	/** Every annex field's write (2026-09-26) — contributes no action; the host's door runs it. */
	{ slug: SET_ANNEX_FIELD_SPEC_ID, name: 'Set annex field', build: setAnnexFieldSpec },
	/**
	 * 🚧 A person's message, saved through the pipeline (owner ruling
	 * 2026-10-15): core's default answer to `message-offered`, every genre.
	 * Every preset binds it unless it binds its own (`preset()`).
	 */
	{ slug: SAVE_MESSAGE_SPEC_ID, name: 'Save message', build: saveMessageSpec },
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
		slug: STORY_GENERATE_IMAGE_SPEC_ID,
		name: 'Generate image',
		build: generateImageSpec,
	},
	/**
	 * 🚧 The Scene action (DESIGN-image-generation §6.4, I9): a picture of
	 * the session as it stands, posted and/or set as the backdrop.
	 */
	{
		slug: STORY_ILLUSTRATE_SCENE_SPEC_ID,
		name: 'Illustrate scene',
		build: illustrateSceneSpec,
	},
	/**
	 * 🚧 Time passes… (live scenes §6): the story clock moved by an amount
	 * the person picks, no model. One graph (`shared/timePasses.ts`), one
	 * spec per genre (Adventure's keeper version retired with it, 2026-10-19;
	 * the Lair's with its rewrite, 2026-10-21).
	 */
	{ slug: STORY_ADVANCE_TIME_SPEC_ID, name: 'Time passes', build: storyAdvanceTimeSpec },
	/**
	 * 🚧 Draw a card's sprites from its likeness (image generation I5) — a
	 * card action from the Sprites tab, bound to no genre and no session.
	 */
	{
		slug: SPRITE_SET_FILL_SPEC_ID,
		name: 'Fill sprites',
		build: spriteSetFillSpec,
	},
	/**
	 * 🚧 Portrait (DESIGN-image-generation §6.2, I8): a few pictures of a
	 * card offered to its gallery — a card action from the Gallery tab.
	 */
	{
		slug: CHARACTER_PORTRAIT_SPEC_ID,
		name: 'Portrait',
		build: characterPortraitSpec,
	},
	/**
	 * 🚧 Describe a likeness (§5, follow-up D1): a card's likeness prompt
	 * written from its likeness image — a card action from the Likeness tab.
	 */
	{
		slug: DESCRIBE_LIKENESS_SPEC_ID,
		name: 'Describe a likeness',
		build: describeLikenessSpec,
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
	/**
	 * 🚧 The genre-owned summarize-scene specs (live scenes §13–§14): each
	 * core genre's, built by `summarizeScene()` and named by the genre's
	 * `summarize.scene`. `core:spec/summarize-scene` above stays the
	 * fallback for a genre that names none.
	 */
	{ slug: STORY_SUMMARIZE_SCENE_SPEC_ID, name: 'Summarize scene', build: storySummarizeSceneSpec },
	{ slug: GUIDE_SUMMARIZE_SCENE_SPEC_ID, name: 'Summarize scene', build: guideSummarizeSceneSpec },
	{ slug: LAIR_SUMMARIZE_SCENE_SPEC_ID, name: 'Summarize scene', build: lairSummarizeSceneSpec },
	{
		slug: GRAPH_BUILD_SPEC_ID,
		name: 'Build the story graph',
		build: graphBuildSpec,
	},
	/**
	 * 🚧 A ruleset's action (PLAN-rulesets-functions D6, 2026-10-23): the one
	 * generic pipeline every invokable function of a session's ruleset runs,
	 * registered per function by the host. No genre, no lock.
	 */
	{ slug: RULES_ACTION_SPEC_ID, name: 'A ruleset action', build: rulesActionSpec },
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
		// 🚧 Each with its defaults (PLAN-layering D4, 2026-10-20) — built on first use.
		genres: [...coreGenres()],
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
