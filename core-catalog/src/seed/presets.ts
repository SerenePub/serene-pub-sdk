/**
 * Core's shipped session presets (24 T6b) — declared here, seeded by SP.
 *
 * The announcement carries the full `preset()` declaration (validated
 * against the genre's event surface like any package's); `corePresetSeeds()`
 * is the same fact in the shape SP's seed pass writes, with the idempotence
 * keys existing installs already carry. The two are one list mapped, so they
 * cannot disagree.
 */
import { i18nText, preset, type GenreDecl, type PresetDecl, type PresetInput } from "@serene-pub/sdk"
import {
	chatGenre,
	guideGenre,
	STORY_TASKS,
	storyGenre
} from "../registry/genres.js"
import {
	dungeonCrawlerGenre,
	lairGenre
} from "../registry/genres.js"
import { createStorySpec } from "../genres/story/create.js"
import { storyRespondSpec } from "../genres/story/respond.js"
import { narrateSpec } from "../genres/story/narrate.js"
import { answerFormStorySpec } from "../genres/story/answerForm.js"
import { storyAnswerSpec } from "../genres/story/answer.js"
import { storyAskSpec } from "../genres/story/ask.js"
import { storyLookSpec } from "../genres/story/look.js"
import { storyRestSpec } from "../genres/story/rest.js"
import { createAssistantSpec } from "../genres/chat/create.js"
import { assistantRespondSpec } from "../genres/chat/respond.js"
import { answerFormAssistantSpec } from "../genres/chat/answerForm.js"
import { createGuideSpec } from "../genres/guide/create.js"
import { guideRespondSpec } from "../genres/guide/respond.js"
import { answerFormGuideSpec } from "../genres/guide/answerForm.js"
import { answerFormLairSpec } from "../genres/lair/answerForm.js"
import { lairCreateSpec } from "../genres/lair/create.js"
import { lairRespondSpec } from "../genres/lair/respond.js"
import { lairBuildRoomSpec } from "../genres/lair/buildRoom.js"
import { lairFileRoomSpec } from "../genres/lair/fileRoom.js"
import { lairNudgeSpec } from "../genres/lair/nudge.js"
import { lairRevealSpec } from "../genres/lair/reveal.js"
import { lairRoomAnswerSpec } from "../genres/lair/roomAnswer.js"
import { lairTrapSpec } from "../genres/lair/trap.js"
import { lairWhisperSpec } from "../genres/lair/whisper.js"
import { TURN_ORDER_BY_GENRE } from "../genres/index.js"
import {
	DUNGEON_CRAWLER_NARRATOR_KEY,
	DUNGEON_CRAWLER_PLANNER_KEY
} from "../genres/dungeon-crawler/names.js"
import {
	dungeonCrawlerCreateSpec,
	dungeonCrawlerWelcomeSpec
} from "../genres/dungeon-crawler/create.js"
import { dungeonCrawlerRespondSpec } from "../genres/dungeon-crawler/respond.js"
import { dungeonCrawlerInterviewSpec } from "../genres/dungeon-crawler/interview.js"
import { dungeonCrawlerRevealSpec } from "../genres/dungeon-crawler/reveal.js"
import { dungeonCrawlerRestSpec } from "../genres/dungeon-crawler/rest.js"
import { dungeonCrawlerGoalSpec } from "../genres/dungeon-crawler/goal.js"
import { answerFormDungeonCrawlerSpec } from "../genres/dungeon-crawler/answerForm.js"

/** A genre's turn-order spec, as a value (R27, R48). */
const turnOrderFor = (genre: GenreDecl) => TURN_ORDER_BY_GENRE.find((t) => t.genre === genre)!.build()

/*
 * A preset binds spec values: each is bound on every event its inlet lock
 * answers, so a genre's turn-order spec — locked over the events it
 * recomputes on — is one entry like any other. One document serves one
 * genre: the preset check refuses a spec whose lock names another genre
 * (plans/24 §4), which is why there are five turn-order specs.
 */

/* ── Story: Minimal · Living · Rule Based ──────────────────────────────── */

/**
 * 🚧 The background tasks at their declared defaults — what Living and Rule
 * Based pin (`TaskSettingsV1`). Lorebook writes (`lore`, `world-state`) are
 * Full here (★J, ruled 2026-10-19).
 */
const STORY_TASKS_DEFAULT = Object.freeze({
	v: 1 as const,
	tasks: Object.fromEntries(STORY_TASKS.map((t) => [t.key, { mode: t.default }]))
})

/**
 * 🚧 Every task Off — what Minimal pins: nothing after the reply runs, so one
 * call a turn; lorebook writes Off (★J). All but *Read the lorebook*, which
 * stays Full (lane 2, 2026-10-19): it costs no call, and a session migrated
 * from the roleplay Chat read its lorebook into every reply — Minimal
 * replies exactly as before (R). *Read the scene* stays Off: it adds to the
 * prompt.
 */
const STORY_TASKS_OFF = Object.freeze({
	v: 1 as const,
	tasks: Object.fromEntries(
		STORY_TASKS.map((t) => [t.key, { mode: t.key === "lore-retrieval" ? ("full" as const) : ("off" as const) }])
	)
})

/** Story's spine, the same for its three presets — one pipeline that branches on the tasks. */
const storyBindings = () => [
	// Turn order as state (PLAN-turn-order §4.5).
	turnOrderFor(storyGenre),
	createStorySpec(),
	storyRespondSpec(),
	// A form put to a participant the AI portrays is answered by the
	// genre's answer pipeline (R-15 *Forms*; U5d).
	answerFormStorySpec()
]

/**
 * 🚧 **Minimal** — the roleplay Chat's preset until 2026-10-19 (the app's
 * migration re-keys `core-chat-default` to it, so a migrated Chat session is
 * born of it): one call a turn, nothing changes unless the person changes
 * it, and a story may start with nobody in it. Only Narrate comes along, as
 * it did on Chat.
 */
const storyMinimalPreset = (): PresetInput => ({
	slug: "story-minimal",
	genre: storyGenre,
	label: "Minimal",
	description: "Just the story: one model call a turn, and nothing changes unless you change it.",
	bindings: storyBindings(),
	// By identity (W-A): the declaration, not the spec — `narrate` is the
	// narrate spec's one action.
	actions: { include: [{ spec: narrateSpec(), key: "narrate" }] },
	callsPerTurn: 1,
	cast: { characters: 0, personas: 0 },
	settings: { tasks: STORY_TASKS_OFF },
	enabled: true
})

/** The actions a world that keeps itself offers: Narrate, and Adventure's Look, Rest, Ask and its Answer. */
const storyWorldActions = () => ({
	include: [
		{ spec: narrateSpec(), key: "narrate" },
		{ spec: storyLookSpec(), key: "look" },
		{ spec: storyRestSpec(), key: "rest" },
		// The worked form (U5d): Ask puts a question to the cast, Answer
		// is what its options fire — by a click, or by the answer
		// pipeline committing an oracle's choice.
		{ spec: storyAskSpec(), key: "ask" },
		{ spec: storyAnswerSpec(), key: "answer" }
	]
})

/**
 * 🚧 **Living** — the genre's default (Adventure's preset until 2026-10-19;
 * the app's migration re-keys `core-adventure-default` to it): the world
 * keeps itself in words — the reply, then one call that notes what it
 * changed; a sweep every few turns files what happened.
 */
const storyLivingPreset = (): PresetInput => ({
	slug: "story-living",
	genre: storyGenre,
	label: "Living",
	description: "The world keeps itself in words: after each reply it notes what changed, and every few turns it files what happened.",
	bindings: storyBindings(),
	actions: storyWorldActions(),
	defaults: { genreFields: { tone: "grounded", difficulty: "normal" } },
	callsPerTurn: 2,
	settings: { tasks: STORY_TASKS_DEFAULT },
	enabled: true
})

/**
 * 🚧 **Rule Based** — Living, with the session's ruleset resolving the
 * numbers by script. ⚠ `rigour` is not a genre field: it is the session's
 * own `sessions.rigour` column. It is pinned here as the preset's value for
 * the host to apply when a session starts from (or switches to) this preset
 * — the app lane's to honour. With no ruleset picked it plays as Living (the
 * reckoning's words branch), and the form says so.
 */
const storyRuleBasedPreset = (): PresetInput => ({
	slug: "story-rule-based",
	genre: storyGenre,
	label: "Rule Based",
	description: "Living, with the ruleset's rules deciding the numbers. With no ruleset picked it plays as Living.",
	bindings: storyBindings(),
	actions: storyWorldActions(),
	defaults: { genreFields: { tone: "grounded", difficulty: "normal" } },
	callsPerTurn: 2,
	settings: { tasks: STORY_TASKS_DEFAULT, rigour: "scripts" },
	enabled: true
})

/* ── Chat: Basic · Agentic ──────────────────────────────────────────────── */

const chatBindings = () => [
	turnOrderFor(chatGenre),
	createAssistantSpec(),
	assistantRespondSpec(),
	answerFormAssistantSpec()
]

/** 🚧 **Basic** — Chat's default: the model, no tools, one call a turn. */
const chatBasicPreset = (): PresetInput => ({
	slug: "chat-basic",
	genre: chatGenre,
	label: "Basic",
	description: "The model as itself: no tools, one call a turn.",
	bindings: chatBindings(),
	callsPerTurn: 1,
	settings: { tools: [] },
	enabled: true
})

/**
 * 🚧 **Agentic** — the same reply with tools: web search, your lorebooks, pictures, the
 * date, a calculator and the conversation's own history. Lorebook writes
 * are off (★J): a person switches them on per session.
 */
const chatAgenticPreset = (): PresetInput => ({
	slug: "chat-agentic",
	genre: chatGenre,
	label: "Agentic",
	description: "The model with tools: it can search the web, read your lorebooks, make pictures and do sums. Each tool it uses is another call.",
	bindings: chatBindings(),
	callsPerTurn: 1,
	settings: { tools: ["web", "lore", "image", "clock", "calculator", "history"] },
	enabled: true
})

/**
 * The guide genre's shipped preset (R-18; U5g). Enabled: the create path
 * runs end to end with no model call, and the genre's one envoy is seated
 * by its own `default: true` — the preset names nothing a session must
 * choose. No actions come along: a guide session is questions and answers.
 */
const guideDefaultPreset = (): PresetInput => ({
	slug: "guide-default",
	genre: guideGenre,
	label: "Guide",
	description:
		"Ask Serene Pub's guide about the app itself — questions and answers grounded in the docs, no characters or story.",
	bindings: [
		createGuideSpec(),
		guideRespondSpec(),
		turnOrderFor(guideGenre),
		answerFormGuideSpec(),
	],
	enabled: true
})

/**
 * The Lair genre's shipped preset (plans/genres §3).
 *
 * ## It ships ENABLED, on Adventure's condition
 *
 * Creating a Lair session publishes the create spec and resolves the genre's
 * nine attribute slots with no model call anywhere in it. The turn itself needs
 * a connection like every other turn does.
 *
 * ## Every event the surface declares is bound
 *
 * `session-created` and `message-respond` because they are required, and
 * `form-addressed` because this genre puts forms to people on purpose — the
 * knock is one. The binding is what answers a form when the AI is the one it
 * was addressed to; a Lair form addressed to `owner` still waits for a click.
 *
 * ## What `defaults` says
 *
 * `trustNarrator: false`, restated rather than left to the declaration for
 * the reason Adventure restates it: a preset is what a
 * person starts from, and the answer to "does the model get to change my
 * party's health without asking" should be visible in the thing that decided
 * it.
 *
 * No `lorebookId`: the genre requires a lorebook and has no opinion about
 * which, and a preset naming one would name a row that exists on the machine
 * it was written on.
 */
const lairDefaultPreset = (): PresetInput => ({
	slug: "lair-default",
	genre: lairGenre,
	label: "Lair",
	description:
		"You are the dungeon. Build the rooms, point the party at them, and watch an AI delve into what you made.",
	bindings: [
		lairCreateSpec(),
		lairRespondSpec(),
		turnOrderFor(lairGenre),
		answerFormLairSpec(),
	],
	actions: {
		include: [
			{ spec: lairBuildRoomSpec(), key: "build-room" },
			// On a message's ⋮ (R11): the person's or the Castellan's row.
			{ spec: lairFileRoomSpec(), key: "file" },
			{ spec: lairWhisperSpec(), key: "whisper" },
			{ spec: lairNudgeSpec(), key: "nudge" },
			{ spec: lairTrapSpec(), key: "trap" },
			{ spec: lairRevealSpec(), key: "reveal" },
			// The knock's answer: in no listing (the `form` venue), declared
			// here so the block the respond spec writes has an identity the
			// host can hold a press to.
			{ spec: lairRoomAnswerSpec(), key: "room" }
		]
	},
	defaults: {
		genreFields: {
			tone: "grounded",
			trustNarrator: false
		}
	},
	enabled: true
})

/**
 * 🚧 Dungeon Crawler's shipped preset (PLAN-dungeon-crawler-2026-10-14).
 *
 * Every event the genre declares that a pipeline answers is bound: create,
 * the reply, the welcome (`member-added`), the turn order (on its six) and
 * the answer form. The interview's one action (`answer`, the `form` venue)
 * comes along by identity, so the blocks its questions carry have something
 * to fire.
 *
 * `defaults.envoys` seats BOTH envoys: the Narrator is the genre's default and
 * is seated regardless, and the Planner is seated here — the create spec
 * writes its greeting only while it is seated, and its talk needs its seat.
 *
 * Offered, not assumed, and enabled: creating a session runs no model call.
 */
const dungeonCrawlerDefaultPreset = (): PresetInput => ({
	slug: "dungeon-crawler-default",
	genre: dungeonCrawlerGenre,
	label: "Dungeon Crawler",
	description:
		"The AI is the whole Dungeon Master. Make a character, walk into a world it generates, and play only your own part — alone or with friends.",
	bindings: [
		dungeonCrawlerCreateSpec(),
		dungeonCrawlerRespondSpec(),
		dungeonCrawlerWelcomeSpec(),
		turnOrderFor(dungeonCrawlerGenre),
		answerFormDungeonCrawlerSpec()
	],
	actions: {
		include: [
			{ spec: dungeonCrawlerInterviewSpec(), key: "answer" },
			// 🚧 The owner's one-way reveal (feature 15, D8).
			{ spec: dungeonCrawlerRevealSpec(), key: "reveal" },
			// 🚧 The story turn's two: Rest (composer), and what follows the goal (its form).
			{ spec: dungeonCrawlerRestSpec(), key: "rest" },
			{ spec: dungeonCrawlerGoalSpec(), key: "goal" }
		]
	},
	defaults: {
		envoys: [DUNGEON_CRAWLER_PLANNER_KEY, DUNGEON_CRAWLER_NARRATOR_KEY]
	},
	enabled: true
})

/** Built on first use: a preset binds spec values, and core's specs compile lazily. */
const once = <T>(build: () => T): (() => T) => {
	let value: T | undefined
	return () => (value ??= build())
}

/** Core's presets as authored — what the announcement declares (R48). @internal */
export const corePresetInputs = once((): PresetInput[] => [
	storyMinimalPreset(),
	storyLivingPreset(),
	storyRuleBasedPreset(),
	chatBasicPreset(),
	chatAgenticPreset(),
	guideDefaultPreset(),
	lairDefaultPreset(),
	dungeonCrawlerDefaultPreset()
])

/** Core's presets in their stored form, every reference read down to its id. @experimental */
export const corePresets = once((): PresetDecl[] => corePresetInputs().map(preset))

/** The seed-pass shape: idempotence key + the row fields SP writes. @internal */
export interface CorePresetSeed {
	/** Never change spelling — existing installs match on this. */
	seedKey: string
	name: string
	description: string
	genreId: string
	/**
	 * Event → spec, from the declaration. Config references stay absent here
	 * (= the spec's shipped default): a config id is an instance fact.
	 */
	bindings: Record<string, { spec: string }>
	/**
	 * The creation pre-fill, from the declaration's `defaults` (23 §9).
	 * Written verbatim into the row's `defaults` column, so a declared
	 * pre-fill reaches the create form without an extra carrier. Absent on
	 * every core preset today — core ships no opinion about a new session's
	 * name or scenario — and present the moment one declares it.
	 *
	 * Loosely typed on purpose: `PresetDefaults` is the SDK's *authoring*
	 * shape, and this is the row shape, which is a JSON column the create form
	 * reads key by key.
	 */
	defaults?: Record<string, unknown>
	/**
	 * ⚠ **`includedActions` is deliberately not here**, though every core
	 * preset declares `actions.include`.
	 *
	 * The column reads NULL as "the companion rule" — every action a spec
	 * contributed for this genre comes along, enabled by default when it is in
	 * the genre owner's own namespace — and an array as "exactly these". Core's
	 * actions ARE in core's namespace for core's genres, so the two answers are
	 * the same list and NULL is the one that keeps being right when a later
	 * release adds a fourth. The declaration still carries the list, because an
	 * announcement states what a package offers; the row states what an
	 * administrator curated, and nobody has curated anything yet.
	 */
	/**
	 * Whether the instance offers it the moment it is seeded.
	 *
	 * The column defaults to true and every core preset has always been
	 * offered, so this is written only where a declaration says so. It is a
	 * SEED-time value: an administrator who later disables a preset keeps that
	 * decision, because the seed pass never touches a row it did not create.
	 */
	enabled?: boolean
	/** 🚧 What the preset pins (`PresetDecl.settings`) — the `settings` column. */
	settings?: Record<string, unknown>
	/** 🚧 The card's model calls a turn (`PresetDecl.callsPerTurn`) — `calls_per_turn`. */
	callsPerTurn?: number
	/** 🚧 The cast floor (`PresetDecl.cast`) — `cast_floor`. */
	castFloor?: { characters?: number; personas?: number }
	isDefault: boolean
	isImmutable: boolean
}

/** One declaration, in the shape SP's seed pass writes. */
const seedOf = (
	decl: PresetDecl,
	seedKey: string,
	isDefault: boolean
): CorePresetSeed => ({
	seedKey,
	// The row columns are text: the declaration's display text resolved to
	// `en` (R-20 — a bare string is itself). The label is required, so the
	// seed key is a fallback the type makes unreachable.
	name: i18nText(decl.label) ?? seedKey,
	description: i18nText(decl.description) ?? "",
	genreId: decl.genre,
	bindings: Object.fromEntries(
		Object.entries(decl.bindings).map(([event, b]) => [
			event,
			{ spec: b.spec }
		])
	),
	...(decl.defaults
		? { defaults: decl.defaults as Record<string, unknown> }
		: {}),
	...(decl.enabled === undefined ? {} : { enabled: decl.enabled }),
	// 🚧 The preset layer of the cascade and the card's numbers (2026-10-19):
	// the row columns `settings`, `calls_per_turn` and `cast_floor`.
	...(decl.settings ? { settings: decl.settings as Record<string, unknown> } : {}),
	...(decl.callsPerTurn !== undefined ? { callsPerTurn: decl.callsPerTurn } : {}),
	...(decl.cast ? { castFloor: decl.cast } : {}),
	isDefault,
	isImmutable: true
})

/** The seed rows, in the order the seed pass writes them. @internal */
export const corePresetSeeds = once((): CorePresetSeed[] => {
	const stored = (slug: string) => corePresets().find((p) => p.slug === slug)!
	return [
	// ⚠ The seed keys never change spelling — existing installs match on them.
	/**
	 * 🚧 Story's three (2026-10-19). Living is the genre's default — one
	 * default per genre (owner ruling 2026-10-02). `core-story-minimal` and
	 * `core-story-living` are the keys the app's migration re-keys
	 * `core-chat-default` and `core-adventure-default` to, so a 0.6 install
	 * keeps those rows (and every session's `preset_id`) under the new names.
	 */
	seedOf(stored("story-minimal"), "core-story-minimal", false),
	seedOf(stored("story-living"), "core-story-living", true),
	seedOf(stored("story-rule-based"), "core-story-rule-based", false),
	/** 🚧 Chat's two (2026-10-19): Basic is its default. */
	seedOf(stored("chat-basic"), "core-chat-basic", true),
	seedOf(stored("chat-agentic"), "core-chat-agentic", false),
	/** Offered, not assumed — the same footing as Adventure. */
	seedOf(stored("guide-default"), "core-guide-default", false),
	/** The same footing again: Lair is offered in the picker, never assumed. */
	seedOf(stored("lair-default"), "core-lair-default", false),
	/** 🚧 Offered in the picker, never assumed — Lair's footing. */
	seedOf(stored("dungeon-crawler-default"), "core-dungeon-crawler-default", false)
	]
})
