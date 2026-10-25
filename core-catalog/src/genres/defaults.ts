/**
 * 🚧 **The genre's defaults** of core's five genres (PLAN-layering D4, R2,
 * R22, R24; 2026-10-20): which pipeline answers which event, which actions
 * each genre offers, and which routines run on which cadence — as
 * registrations, objects throughout (`register(trigger, pipeline)`; A8,
 * R30). Every preset is one set of changes on top of these
 * (`seed/presets.ts`).
 *
 * ## What they hold
 *
 * Exactly what a session saw before registrations existed — the inlet locks
 * and the companion rule, made explicit: the create pipeline, core's
 * default save on `message-offered`, the reply, the answer form, the turn
 * order on every event it recomputes on, and **every action the genre's own
 * pipelines contribute** (the companion rule offered them all, whatever a
 * preset's include list said, because no core preset row ever carried one).
 * Plus, new, the **routines** that replaced Story's and Chat's background
 * tasks: Story's reckoning after each round, its sweep every five turns and
 * its picture of each new scene (Off), Chat's *Remember things* (Off).
 *
 * ## Built lazily
 *
 * A registration names its pipeline, and naming a core pipeline by value
 * compiles it — which resolves type pins against the registry, which boot
 * syncs first (`CoreSpec.build`). So each genre's defaults are built on
 * first use, once, and `withGenreDefaults` puts the genre carrying them in
 * the registry in place of the bare declaration (`coreGenres()`, which
 * `coreExtension()` declares). A host that reads a genre's defaults calls
 * `coreGenres()` (or `coreExtension()`) first.
 * @experimental
 * @ruling R2, R22, R24, R30, D4
 */
import {
	afterEachRound,
	coreEvents,
	eventById,
	everyNTurns,
	isTrue,
	not,
	onEvent,
	register,
	sessionOf,
	withGenreDefaults,
	type ConditionDecl,
	type EventDef,
	type GenreDecl,
	type RegistrationDecl,
	type SessionHostFacts,
	type SpecDocument,
	type ActionHandle,
} from '@serene-pub/sdk'
import { restFunction } from '../functions/time.js'
import { chatGenre, dungeonCrawlerGenre, guideGenre, lairGenre, SANCTUM_CHANNEL, storyGenre } from '../registry/genres.js'
import { CASTELLAN } from './lair/names.js'
import { rulesets } from '../registry/rulesets.js'
import type { TurnOrderHandle } from '../factories/turnOrder.js'
import { saveMessageSpec } from '../shared/saveMessage.js'
import { createStorySpec } from './story/create.js'
import { storyRespondSpec } from './story/respond.js'
import { answerFormStorySpec } from './story/answerForm.js'
import { storyTurnOrder } from './story/turnOrder.js'
import { narrateSpec } from './story/narrate.js'
import { narrateCharacterSpec } from './story/narrateCharacter.js'
import { generateImageSpec } from './story/generateImage.js'
import { illustrateNewSceneSpec, illustrateSceneSpec } from './story/illustrateScene.js'
import { storyAdvanceTimeSpec } from './story/advanceTime.js'
import { storyLookSpec } from './story/look.js'
import { storyRestSpec } from './story/rest.js'
import { storyAfterRestSpec } from './story/afterRest.js'
import { storyAskSpec } from './story/ask.js'
import { storyAnswerSpec } from './story/answer.js'
import { storyReckoningSpec } from './story/reckoning.js'
import { storySweepSpec } from './story/sweep.js'
import { createAssistantSpec } from './chat/create.js'
import { assistantRespondSpec } from './chat/respond.js'
import { answerFormAssistantSpec } from './chat/answerForm.js'
import { assistantTurnOrder } from './chat/turnOrder.js'
import { assistantMemorySpec } from './chat/memory.js'
import { createGuideSpec } from './guide/create.js'
import { guideRespondSpec } from './guide/respond.js'
import { answerFormGuideSpec } from './guide/answerForm.js'
import { guideTurnOrder } from './guide/turnOrder.js'
import { lairCreateSpec } from './lair/create.js'
import { lairReplySpec } from './lair/reply.js'
import { lairWelcomeSpec } from './lair/welcome.js'
import { answerFormLairSpec } from './lair/answerForm.js'
import { lairTurnOrder } from './lair/turnOrder.js'
import { lairBuildRoomSpec } from './lair/buildRoom.js'
import { lairFileRoomSpec } from './lair/fileRoom.js'
import { lairNudgeSpec } from './lair/nudge.js'
import { lairRevealSpec } from './lair/reveal.js'
import { lairRoomAnswerSpec } from './lair/roomAnswer.js'
import { lairTrapSpec } from './lair/trap.js'
import { lairWhisperSpec } from './lair/whisper.js'
import { lairRollSpec } from './lair/roll.js'
import { lairRollAnswerSpec } from './lair/rollAnswer.js'
import { lairKeeperSpec } from './lair/keeper.js'
import { lairScratchpadSpec } from './lair/scratchpad.js'
import { lairFileCurrentRoomSpec } from './lair/fileCurrentRoom.js'
import { dungeonCrawlerCreateSpec, dungeonCrawlerWelcomeSpec } from './dungeon-crawler/create.js'
import { dungeonCrawlerRespondSpec } from './dungeon-crawler/respond.js'
import { answerFormDungeonCrawlerSpec } from './dungeon-crawler/answerForm.js'
import { dungeonCrawlerTurnOrder } from './dungeon-crawler/turnOrder.js'
import { dungeonCrawlerGoalSpec } from './dungeon-crawler/goal.js'
import { dungeonCrawlerInterviewSpec } from './dungeon-crawler/interview.js'
import { dungeonCrawlerAfterRestSpec, dungeonCrawlerRestSpec } from './dungeon-crawler/rest.js'
import { dungeonCrawlerRevealSpec } from './dungeon-crawler/reveal.js'
import { summarizeCharacterSpec } from '../shared/summarize/character.js'
import { summarizeHistorySpec } from '../shared/summarize/history.js'
import { summarizeSceneSpec } from '../shared/summarize/scene.js'
import { summarizeWorldSpec } from '../shared/summarize/world.js'
import { storySummarizeSceneSpec } from './story/summarizeScene.js'
import { guideSummarizeSceneSpec } from './guide/summarizeScene.js'
import { lairSummarizeSceneSpec } from './lair/summarizeScene.js'

/** Built on first use, once: a registration compiles the pipeline it names. */
const lazy = <T>(build: () => T): (() => T) => {
	let value: T | undefined
	return () => (value ??= build())
}

/** A core event by the id a turn-order handle lists — the declared object, never the string (R30). */
const eventOf = (id: string): EventDef => {
	const e = eventById(id)
	if (!e) throw new Error(`core-catalog: '${id}' is not a declared event`)
	return e
}

/** One registration per event a genre's turn-order spec recomputes on (R24): one document, N registrations. */
const turnOrderRegistrations = (h: TurnOrderHandle): RegistrationDecl[] => {
	const doc = h.build()
	return h.events.map((id) => register(eventOf(id), doc))
}

/**
 * Every action a pipeline contributes, each registered on its handle — the
 * companion rule made explicit (D3: an action's genre comes from the
 * registrations that include it, never from a lock).
 */
const actionRegistrations = (...docs: Array<SpecDocument & { readonly actions: Readonly<Record<string, ActionHandle>> }>) =>
	docs.flatMap((doc) => Object.values(doc.actions).map((handle) => register(handle, doc)))

/**
 * 🚧 **The genre's own action, unless the rules offer theirs** (PLAN-genres-seams
 * S3, 2026-10-23): a registration `when` that holds while the session's
 * rules use no invokable `fn` (`s.rules.invokable(fn)`, the host's fact) —
 * so Story's Rest, and the Dungeon Crawler's, step aside for the rules
 * action Rest (`core:function/rest@1`) and a session never offers two. Read
 * through any session view's host facts (`sessionOf(genre)`); the function by
 * its declaration, never its id typed.
 * @experimental
 */
export const unlessRulesOffer = (s: SessionHostFacts, fn: { readonly id: string }): ConditionDecl => not(isTrue(s.rules.invokable(fn)))

/**
 * 🚧 The summaries a genre's sessions make (R50, 2026-10-21): the world and
 * character summaries, the history compile and the genre's own
 * summarize-scene (core's when it names none), each registered on its
 * summarize action (`summarizeAction`: `summarize-world`, …) — so a summary's values are set
 * where every pipeline's are (the genre's defaults, a preset, the session),
 * never by a selected configuration. The host's summarize path still fires
 * them; nothing lists the action.
 */
const summaries = (scene: SpecDocument & { readonly actions: Readonly<Record<string, ActionHandle>> }) =>
	Object.freeze(actionRegistrations(summarizeWorldSpec(), summarizeCharacterSpec(), summarizeHistorySpec(), scene))

/** What every genre's defaults hold on the session's own events. */
const spine = (o: { create: SpecDocument; reply: SpecDocument; answerForm: SpecDocument }) => ({
	create: register(coreEvents.sessionCreated, o.create),
	/** A person's message is always saved through a pipeline (owner ruling 2026-10-15). */
	save: register(coreEvents.messageOffered, saveMessageSpec()),
	reply: register(coreEvents.messageRespond, o.reply),
	/** A form put to a participant the AI portrays is answered by the genre's answer pipeline (R-15 *Forms*). */
	answerForm: register(coreEvents.formAddressed, o.answerForm),
})

/* ── Story ──────────────────────────────────────────────────────────────── */

/**
 * 🚧 Story's registrations, by what they are — what the genre's defaults
 * hold and what its presets drop or change.
 * @experimental
 */
export const storyRegistrations = lazy(() => {
	const respond = storyRespondSpec()
	return Object.freeze({
		...spine({ create: createStorySpec(), reply: respond, answerForm: answerFormStorySpec() }),
		turnOrder: Object.freeze(turnOrderRegistrations(storyTurnOrder)),
		/**
		 * The nine actions the companion rule offered: Narrate, Side character,
		 * Image, Scene, Time passes, Look, Rest, Ask, Answer. 🚧 Rest only while
		 * the rules offer no Rest of their own (S3: `unlessRulesOffer`).
		 */
		actions: Object.freeze([
			...actionRegistrations(
				narrateSpec(),
				narrateCharacterSpec(),
				generateImageSpec(),
				illustrateSceneSpec(),
				storyAdvanceTimeSpec(),
				storyLookSpec(),
			),
			...(() => {
				const rest = storyRestSpec()
				return Object.values(rest.actions).map((handle) =>
					register(handle, rest, { when: unlessRulesOffer(storySession(), restFunction) }),
				)
			})(),
			...actionRegistrations(storyAskSpec(), storyAnswerSpec()),
		]),
		/**
		 * The reckoning after each round — today's *wait for everyone* (the
		 * retired tasks' `waitForRound`, on by default); an administrator
		 * swaps it for `afterEachTurn()` (R36).
		 */
		reckoning: register(afterEachRound(), storyReckoningSpec()),
		/** The sweep every five turns (the retired tasks' shared N). */
		sweep: register(everyNTurns({ n: 5 }), storySweepSpec()),
		/** A picture of each new scene — Off until the owner turns it on (R8): it costs a picture model call. */
		illustrate: register(onEvent(coreEvents.sceneOpened), illustrateNewSceneSpec(), { mode: 'off' }),
		/**
		 * 🚧 **After a rest** (GM 2026-10-23, G1 ★5; S3): once the rules' Rest is
		 * taken, the story clock moves by the rest they raised — no model call.
		 */
		afterRest: register(onEvent(coreEvents.restTaken), storyAfterRestSpec()),
		/** The summaries (R50): world, character, history, Story's summarize-scene. */
		summaries: summaries(storySummarizeSceneSpec()),
	})
})

/* ── Chat ───────────────────────────────────────────────────────────────── */

/** 🚧 Chat's registrations, by what they are. @experimental */
export const chatRegistrations = lazy(() =>
	Object.freeze({
		...spine({ create: createAssistantSpec(), reply: assistantRespondSpec(), answerForm: answerFormAssistantSpec() }),
		turnOrder: Object.freeze(turnOrderRegistrations(assistantTurnOrder)),
		/** *Remember things* every five turns — Off (★J: lore writes are never on unasked). */
		memory: register(everyNTurns({ n: 5 }), assistantMemorySpec(), { mode: 'off' }),
		/** The summaries (R50): world, character, history, core's summarize-scene. */
		summaries: summaries(summarizeSceneSpec()),
	}),
)

/* ── Guide ──────────────────────────────────────────────────────────────── */

/** Guide's registrations, by what they are. No actions a person presses: a guide session is questions and answers. @experimental */
export const guideRegistrations = lazy(() =>
	Object.freeze({
		...spine({ create: createGuideSpec(), reply: guideRespondSpec(), answerForm: answerFormGuideSpec() }),
		turnOrder: Object.freeze(turnOrderRegistrations(guideTurnOrder)),
		/** The summaries (R50): world, character, history, the Guide's summarize-scene. */
		summaries: summaries(guideSummarizeSceneSpec()),
	}),
)

/* ── Lair ───────────────────────────────────────────────────────────────── */

/**
 * 🚧 The Lair's registrations (rewrite D7, 2026-10-21), by what they are —
 * what its defaults hold and what its presets (*Words only*, *Rules*, *Rules
 * and dice*) drop or change:
 *
 *  - the spine — create (the Castellan's greeting on the Sanctum), save, the
 *    reply (the plan, the checks, the voices), the answer form;
 *  - **welcome** on `member-added`: a seat a person plays, told to the GM;
 *  - the turn order on the four events it recomputes on;
 *  - the **actions** — Nudge, Whisper, Trigger trap, Reveal (the Castellan's
 *    and the GM's steering), Build room, Answer the door, File as a room (the
 *    rooms layer) and Roll (the rules layer); Narrate and Pick who speaks are
 *    core's turn controls, answered by the reply;
 *  - the **routines** — the keeper after each round, at **Review** (the old
 *    *Apply the Castellan's stat changes without asking*, off); the
 *    Castellan's scratchpad after each of its Sanctum replies; filing the
 *    current room when a scene opens, **Off** (R3: nothing unprompted);
 *  - the summaries.
 * @experimental
 */
export const lairRegistrations = lazy(() =>
	Object.freeze({
		...spine({ create: lairCreateSpec(), reply: lairReplySpec(), answerForm: answerFormLairSpec() }),
		/** A seat a person plays: the Castellan tells the GM in the Sanctum (D5). */
		welcome: register(coreEvents.memberAdded, lairWelcomeSpec()),
		turnOrder: Object.freeze(turnOrderRegistrations(lairTurnOrder)),
		/** The GM's steering: Nudge, Whisper, Trigger trap, Reveal. */
		actions: Object.freeze(actionRegistrations(lairNudgeSpec(), lairWhisperSpec(), lairTrapSpec(), lairRevealSpec())),
		/** The rooms layer's three: Build room, File as a room, the knock's answer. */
		buildRoom: Object.freeze(actionRegistrations(lairBuildRoomSpec())),
		fileRoom: Object.freeze(actionRegistrations(lairFileRoomSpec())),
		roomAnswer: Object.freeze(actionRegistrations(lairRoomAnswerSpec())),
		/** The rules layer: the GM's own Roll, and a roll form's answer. */
		roll: Object.freeze(actionRegistrations(lairRollSpec(), lairRollAnswerSpec())),
		/** The books after each round — Review: each change waits for the GM (the old `trustNarrator: false`). */
		keeper: register(afterEachRound(), lairKeeperSpec(), { mode: 'review' }),
		/**
		 * The Castellan's notes, after each of its replies in the Sanctum —
		 * a reply (`liveRow`, the host's fact on `message-completed`: a run's
		 * live row finished), never a row written whole there (its greeting,
		 * a plan row, a welcome note), which would rewrite the notes every
		 * turn (L4, 2026-10-21).
		 */
		scratchpad: register(
			onEvent(coreEvents.messageCompleted, {
				where: {
					all: [
						{ on: 'channel', equals: SANCTUM_CHANNEL },
						{ on: 'speaker', equals: CASTELLAN },
						{ on: 'liveRow', equals: true },
					],
				},
			}),
			lairScratchpadSpec(),
		),
		/** A room described only in prose, filed when the party walk in — Off until the GM turns it on (R3). */
		fileCurrentRoom: register(onEvent(coreEvents.sceneOpened), lairFileCurrentRoomSpec(), { mode: 'off' }),
		/** The summaries (R50): world, character, history, the Lair's summarize-scene. */
		summaries: summaries(lairSummarizeSceneSpec()),
	}),
)

/* ── Dungeon Crawler ────────────────────────────────────────────────────── */

/** The Dungeon Crawler's session view: its host facts for a registration's `when` (S3). */
const dungeonCrawlerSession = lazy(() => sessionOf(dungeonCrawlerGenre))

/** The Dungeon Crawler's registrations, by what they are. @experimental */
export const dungeonCrawlerRegistrations = lazy(() =>
	Object.freeze({
		...spine({
			create: dungeonCrawlerCreateSpec(),
			reply: dungeonCrawlerRespondSpec(),
			answerForm: answerFormDungeonCrawlerSpec(),
		}),
		/** A newcomer's welcome: their Planner lane opens when they join. */
		welcome: register(coreEvents.memberAdded, dungeonCrawlerWelcomeSpec()),
		turnOrder: Object.freeze(turnOrderRegistrations(dungeonCrawlerTurnOrder)),
		/**
		 * The four: the interview's answer, the owner's reveal, Rest and what
		 * follows the goal. 🚧 Rest only while the rules offer no Rest of their
		 * own (lane G3, 2026-10-23, S3: `unlessRulesOffer`).
		 */
		actions: Object.freeze([
			...actionRegistrations(dungeonCrawlerInterviewSpec(), dungeonCrawlerRevealSpec()),
			...(() => {
				const rest = dungeonCrawlerRestSpec()
				return Object.values(rest.actions).map((handle) =>
					register(handle, rest, { when: unlessRulesOffer(dungeonCrawlerSession(), restFunction) }),
				)
			})(),
			...actionRegistrations(dungeonCrawlerGoalSpec()),
		]),
		/**
		 * 🚧 **After a rest** (S3): the crawl's own effects once the rules' Rest is
		 * taken — the party healed and up, the tallies gone, the slots back, the
		 * clock moved, the journal's line — on the event the rules raise.
		 */
		afterRest: register(onEvent(coreEvents.restTaken), dungeonCrawlerAfterRestSpec()),
		/** The summaries (R50): world, character, history, core's summarize-scene. */
		summaries: summaries(summarizeSceneSpec()),
	}),
)

/** A genre's registrations as one list, in the order the object names them. */
const listOf = (r: Readonly<Record<string, RegistrationDecl | readonly RegistrationDecl[]>>): RegistrationDecl[] =>
	Object.values(r).flatMap((x) => (Array.isArray(x) ? [...x] : [x as RegistrationDecl]))

/**
 * 🚧 Each core genre's registrations, flat — what its defaults hold — keyed
 * by genre id. @experimental
 */
export const coreGenreRegistrations = lazy(
	(): Readonly<Record<string, readonly RegistrationDecl[]>> =>
		Object.freeze({
			[storyGenre.id]: Object.freeze(listOf(storyRegistrations())),
			[chatGenre.id]: Object.freeze(listOf(chatRegistrations())),
			[guideGenre.id]: Object.freeze(listOf(guideRegistrations())),
			[lairGenre.id]: Object.freeze(listOf(lairRegistrations())),
			[dungeonCrawlerGenre.id]: Object.freeze(listOf(dungeonCrawlerRegistrations())),
		}),
)

/**
 * 🚧 Core's five genres **with their defaults** (`withGenreDefaults`), in the
 * order `coreExtension()` declares them — Chat, Story, Guide, Lair, Dungeon
 * Crawler. Built once; registers each in place of its bare declaration.
 * Chat's defaults set its tools (none — Basic); the others' settings are
 * their fields' declared defaults.
 * @experimental
 */
export const coreGenres = lazy((): readonly GenreDecl[] => {
	const all = coreGenreRegistrations()
	return Object.freeze([
		withGenreDefaults(chatGenre, { registrations: all[chatGenre.id]!, settings: { tools: [] } }),
		withGenreDefaults(storyGenre, { registrations: all[storyGenre.id]! }),
		withGenreDefaults(guideGenre, { registrations: all[guideGenre.id]! }),
		withGenreDefaults(lairGenre, { registrations: all[lairGenre.id]! }),
		withGenreDefaults(dungeonCrawlerGenre, { registrations: all[dungeonCrawlerGenre.id]! }),
	])
})

/**
 * 🚧 Story's session, typed — what a registration's `when` tests (A5, lane
 * 2's `sessionOf`): the genre's slots, sheets and fields, and the shared
 * vocabulary (`rulesets.common`), which `sessionOf` does not add by itself.
 * `when: isTrue(storySession().fields.sideCast)`. Built on first use.
 * @experimental
 */
export const storySession = lazy(() => sessionOf(storyGenre, { vocabularies: [rulesets.common] }))
