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
	adventureGenre,
	chatGenre,
	guideGenre
} from "../registry/genres.js"
import {
	lairGenre
} from "../registry/genres.js"
import {
	createChatSpec
} from "../genres/chat/create.js"
import { createGuideSpec } from "../genres/guide/create.js"
import { guideRespondSpec } from "../genres/guide/respond.js"
import {
	respondSpec
} from "../genres/chat/respond.js"
import {
	narrateSpec
} from "../genres/chat/narrate.js"
import { adventureCreateSpec } from "../genres/adventure/create.js"
import { adventureRespondSpec } from "../genres/adventure/respond.js"
import { adventureAdvanceTimeSpec } from "../genres/adventure/advanceTime.js"
import { adventureAnswerSpec } from "../genres/adventure/answer.js"
import { adventureAskSpec } from "../genres/adventure/ask.js"
import { adventureLookSpec } from "../genres/adventure/look.js"
import { adventureRestSpec } from "../genres/adventure/rest.js"
import { answerFormAdventureSpec } from "../genres/adventure/answerForm.js"
import { answerFormChatSpec } from "../genres/chat/answerForm.js"
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

/** A genre's turn-order spec, as a value (R27, R48). */
const turnOrderFor = (genre: GenreDecl) => TURN_ORDER_BY_GENRE.find((t) => t.genre === genre)!.build()

/*
 * A preset binds spec values: each is bound on every event its inlet lock
 * answers, so a genre's turn-order spec — locked over the events it
 * recomputes on — is one entry like any other. One document serves one
 * genre: the preset check refuses a spec whose lock names another genre
 * (plans/24 §4), which is why there are four turn-order specs.
 */

const chatDefaultPreset = (): PresetInput => ({
	slug: "chat-default",
	genre: chatGenre,
	label: "Chat",
	description: "The standard roleplay chat, everything default.",
	bindings: [
		// Turn order as state (PLAN-turn-order §4.5).
		turnOrderFor(chatGenre),
		createChatSpec(),
		respondSpec(),
		// A form put to a participant the AI portrays is answered by the
		// genre's answer pipeline (R-15 *Forms*; U5d). Optional in the
		// surface; bound here so it works out of the box.
		answerFormChatSpec(),
	],
	// By identity (W-A): the declaration, not the spec — `narrate` is the
	// narrate spec's one action.
	actions: { include: [{ spec: narrateSpec(), key: "narrate" }] }
})

/**
 * The Adventure genre's shipped preset.
 *
 * ## It ships ENABLED
 *
 * The condition set for this lane was "enabled if the create path runs end to
 * end in tests", and it does: creating an Adventure session publishes the
 * create spec, seeds the cast's greetings and resolves the genre's seven
 * attribute slots, with no model call anywhere in it. The turn itself needs a
 * connection like every other turn does.
 *
 * ## What `defaults` says, and what it deliberately does not
 *
 * `genreFields` is the creation pre-fill for the three fields the genre
 * declares. `trustNarrator: false` is restated here rather than left to the
 * declaration's default because it is the one field with a safety meaning: a
 * preset is what a person starts from, and the answer to "does the model get to
 * change my character's health without asking" should be visible in the thing
 * that decided it.
 *
 * No `lorebookId`: the genre requires a lorebook and has no opinion about
 * which, and a preset naming one would name a row that exists on the machine it
 * was written on.
 */
const adventureDefaultPreset = (): PresetInput => ({
	slug: "adventure-default",
	genre: adventureGenre,
	label: "Adventure",
	description:
		"A narrated world with a cast that acts on its own, stats and an inventory that change as you play, and a story clock that moves.",
	bindings: [
		// Turn order as state (PLAN-turn-order §4.5).
		turnOrderFor(adventureGenre),
		adventureCreateSpec(),
		adventureRespondSpec(),
		answerFormAdventureSpec(),
	],
	actions: {
		include: [
			{ spec: adventureLookSpec(), key: "look" },
			{ spec: adventureRestSpec(), key: "rest" },
			{ spec: adventureAdvanceTimeSpec(), key: "advance-time" },
			// The worked form (U5d): Ask puts a question to the cast, Answer
			// is what its options fire — by a click, or by the answer
			// pipeline committing an oracle's choice.
			{ spec: adventureAskSpec(), key: "ask" },
			{ spec: adventureAnswerSpec(), key: "answer" }
		]
	},
	defaults: {
		genreFields: {
			tone: "grounded",
			difficulty: "normal",
			trustNarrator: false
		}
	},
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

/** Built on first use: a preset binds spec values, and core's specs compile lazily. */
const once = <T>(build: () => T): (() => T) => {
	let value: T | undefined
	return () => (value ??= build())
}

/** Core's presets as authored — what the announcement declares (R48). @internal */
export const corePresetInputs = once((): PresetInput[] => [
	chatDefaultPreset(),
	adventureDefaultPreset(),
	guideDefaultPreset(),
	lairDefaultPreset()
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
	isDefault,
	isImmutable: true
})

/** The seed rows, in the order the seed pass writes them. @internal */
export const corePresetSeeds = once((): CorePresetSeed[] => {
	const stored = (slug: string) => corePresets().find((p) => p.slug === slug)!
	return [
	// ⚠ The seed keys never change spelling — existing installs match on them.
	seedOf(stored("chat-default"), "core-chat-default", true),
	/**
	 * ⚠ `isDefault: false`. "Default" here means *the preset a session with no
	 * preset falls back to*, and there is exactly one of those on an instance.
	 * Adventure is offered, not assumed.
	 */
	seedOf(stored("adventure-default"), "core-adventure-default", false),
	/** Offered, not assumed — the same footing as Adventure. */
	seedOf(stored("guide-default"), "core-guide-default", false),
	/** The same footing again: Lair is offered in the picker, never assumed. */
	seedOf(stored("lair-default"), "core-lair-default", false)
	]
})
