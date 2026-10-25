/**
 * Core's shipped session presets (24 T6b) — declared here, seeded by SP.
 *
 * The announcement carries the full `preset()` declaration (validated
 * against the genre's event surface like any package's); `corePresetSeeds()`
 * is the same fact in the shape SP's seed pass writes, with the idempotence
 * keys existing installs already carry. The two are one list mapped, so they
 * cannot disagree.
 */
import {
	effectiveRegistrations,
	i18nText,
	preset,
	setting,
	type PresetDecl,
	type PresetInput,
	type PresetRegistrationChanges,
} from "@serene-pub/sdk"
import { chatGenre, guideGenre, storyGenre } from "../registry/genres.js"
import { dungeonCrawlerGenre, lairGenre } from "../registry/genres.js"
import { coreGenreRegistrations, lairRegistrations, storyRegistrations } from "../genres/defaults.js"
import { CHAT_TOOL_KINDS } from "../registry/genres.js"
import {
	DUNGEON_CRAWLER_NARRATOR_KEY,
	DUNGEON_CRAWLER_PLANNER_KEY
} from "../genres/dungeon-crawler/names.js"

/*
 * 🚧 **Presets as changes** (PLAN-layering D4, R2, R22; 2026-10-20). Every
 * preset is one set of changes on top of its genre's defaults
 * (`genres/defaults.ts`): the registrations it drops or changes, by the
 * registration objects themselves, and the setting values it sets — never
 * a list of every pipeline again, and never another preset (one level). A
 * preset that changes nothing IS the genre's defaults; the one marked
 * `default: true` is the genre's default preset (R22, A18).
 *
 * `callsPerTurn` is still stated for the card the app prints (⏳ until the
 * host derives it, lane 5b); `sdk-tests/coreGenreDefaults.test.ts` asserts it
 * equals what the registrations imply.
 */

/* ── Story: Minimal · Living · Rule Based ──────────────────────────────── */

/**
 * 🚧 **Minimal** — the roleplay Chat's preset until 2026-10-19 (the app's
 * migration re-keys `core-chat-default` to it, so a migrated Chat session is
 * born of it): one call a turn, nothing changes unless the person changes
 * it, and a story may start with nobody in it. Story's defaults with the
 * three routines dropped, the reply not reading the scene (it adds to the
 * prompt; *Read the lorebook* stays on — it costs no call, and a migrated
 * session read its lorebook into every reply), and — with no reckoning to
 * follow — a press's changes held for the person to accept (R55).
 */
const storyMinimalPreset = (): PresetInput => {
	const r = storyRegistrations()
	return {
		slug: "story-minimal",
		genre: storyGenre,
		label: "Minimal",
		description: "Just the story: one model call a turn, and nothing changes unless you change it.",
		drop: [r.reckoning, r.sweep, r.illustrate],
		change: [{ of: r.reply, values: { reading: { params: { scene: false } } } }],
		callsPerTurn: 1,
		cast: { characters: 0, personas: 0 },
		enabled: true
	}
}

/**
 * 🚧 **Living** — the genre's default (Adventure's preset until 2026-10-19;
 * the app's migration re-keys `core-adventure-default` to it): Story's
 * defaults as they stand. The world keeps itself in words — the replies,
 * then the reckoning after each round that notes what they changed (R52);
 * the sweep every few turns files what happened.
 */
const storyLivingPreset = (): PresetInput => ({
	slug: "story-living",
	genre: storyGenre,
	label: "Living",
	description: "The world keeps itself in words: after each round it notes what changed, and every few turns it files what happened.",
	default: true,
	defaults: { genreFields: { tone: "grounded", difficulty: "normal" } },
	callsPerTurn: 2,
	enabled: true
})

/**
 * 🚧 **Rule Based** — Living, with the session's ruleset resolving the
 * numbers by script: rigour `scripts`, locked (the reckoning routes its
 * deltas to the ruleset handler). ⚠ `rigour` is the session's own
 * `sessions.rigour` column, not a genre field — the host applies the
 * preset's value when a session starts from (or switches to) it. Under a
 * ruleset that decides nothing (Freeform, every session's default) it plays
 * as Living (the reckoning's words branch).
 */
const storyRuleBasedPreset = (): PresetInput => ({
	slug: "story-rule-based",
	genre: storyGenre,
	label: "Rule Based",
	description: "Living, with the session's rules deciding the numbers. Under rules that decide nothing (Freeform), it plays as Living.",
	defaults: { genreFields: { tone: "grounded", difficulty: "normal" } },
	callsPerTurn: 2,
	settings: { rigour: setting("scripts", { lock: true }) },
	enabled: true
})

/* ── Chat: Basic · Agentic ──────────────────────────────────────────────── */

/** 🚧 **Basic** — Chat's default: its defaults as they stand — the model, no tools, one call a turn. */
const chatBasicPreset = (): PresetInput => ({
	slug: "chat-basic",
	genre: chatGenre,
	label: "Basic",
	description: "The model as itself: no tools, one call a turn.",
	default: true,
	callsPerTurn: 1,
	enabled: true
})

/**
 * 🚧 **Agentic** — the same reply with tools: web search, your lorebooks,
 * pictures, the date, a calculator and the conversation's own history. One
 * change: the tools. Lorebook writes stay off (★J): a person switches them
 * on per session.
 */
const chatAgenticPreset = (): PresetInput => ({
	slug: "chat-agentic",
	genre: chatGenre,
	label: "Agentic",
	description: "The model with tools: it can search the web, read your lorebooks, make pictures and do sums. Each tool it uses is another call.",
	callsPerTurn: 1,
	settings: { tools: CHAT_TOOL_KINDS.filter((k) => k !== "lorebook-write") },
	enabled: true
})

/**
 * The guide genre's shipped preset (R-18; U5g), its defaults as they stand.
 * Enabled: the create path runs end to end with no model call, and the
 * genre's one envoy is seated by its own `default: true` — the preset names
 * nothing a session must choose.
 */
const guideDefaultPreset = (): PresetInput => ({
	slug: "guide-default",
	genre: guideGenre,
	label: "Guide",
	description:
		"Ask Serene Pub's guide about the app itself — questions and answers grounded in the docs, no characters or story.",
	default: true,
	enabled: true
})

/* ── Lair: Words only · Rules · The rules decide (rewrite D7, 2026-10-21) ─ */

/**
 * 🚧 **Words only** — the Lair at its plainest: the party and the GM, told in
 * words. Nothing is rolled (rigour `prose`, locked: no roll forms, and Roll
 * dropped), the rooms layer is off (`roomsLayer`, locked: nothing knocks, and
 * Build room, File as a room, the knock's answer and filing the current room
 * dropped — R10), and the keeper is Off (one call a turn besides the voices;
 * switched on, it keeps the books in words, its ruleset path closed by the
 * rigour). ⏳ The Places panel stays in the layout: a preset names no
 * layout yet.
 */
const lairWordsOnlyPreset = (): PresetInput => {
	const r = lairRegistrations()
	return {
		slug: "lair-words-only",
		genre: lairGenre,
		label: "Words only",
		description:
			"The party and you, in words: no checks, no rooms to build. One model call a turn, and one for each delver who speaks.",
		drop: [...r.roll, ...r.buildRoom, ...r.fileRoom, ...r.roomAnswer, r.fileCurrentRoom],
		change: [{ of: r.keeper, mode: "off" }],
		defaults: { genreFields: { tone: "grounded" } },
		settings: {
			rigour: setting("prose", { lock: true }),
			roomsLayer: setting(false, { lock: true })
		},
		callsPerTurn: 1,
		enabled: true
	}
}

/**
 * 🚧 **Rules** — the genre's default, its defaults as they stand: the rooms
 * layer on, the ruleset's rules deciding (rigour `mechanics`), the Oracle
 * asking the GM to call each roll when the ruleset plays dice, and the keeper
 * after each round at Review. Was `lair-default`; the seed key stays, so a
 * Lair session started before the rewrite keeps its preset.
 */
const lairRulesPreset = (): PresetInput => ({
	slug: "lair-rules",
	genre: lairGenre,
	label: "Rules",
	description:
		"You are the dungeon: build the rooms, call each check when the rules want one, and watch the party delve into what you made.",
	default: true,
	defaults: { genreFields: { tone: "grounded" } },
	callsPerTurn: 2,
	enabled: true
})

/**
 * 🚧 **The rules decide** (was _Rules and dice_ until 2026-10-22, M3: no
 * "dice" in a rigour's name — the slug and seed key stay) — Rules at rigour
 * `scripts`, locked: every check the plan calls for is the ruleset's, and the
 * GM may turn *Decide checks at once* (`autoRoll`) on (off here). ★F (ruled
 * 2026-10-23): no ruleset is locked — the rules follow the session, never the
 * genre (R2, D8) — so the start form picks rules that decide, as Story's
 * Rule Based does (the first recommended that plays `scripts`); under rules
 * that decide nothing, risky moments are told in words. The description
 * names no ruleset and no die.
 * ⚠ `rigour` is the session's own column, not a genre field: the host
 * applies the preset's value when a session starts from it.
 */
const lairRulesAndDicePreset = (): PresetInput => ({
	slug: "lair-rules-and-dice",
	genre: lairGenre,
	label: "The rules decide",
	description:
		"Every risky moment is the rules' to decide: you call each check — or let them all be decided at once.",
	defaults: { genreFields: { tone: "grounded", autoRoll: false } },
	settings: { rigour: setting("scripts", { lock: true }) },
	callsPerTurn: 2,
	enabled: true
})

/**
 * 🚧 Dungeon Crawler's shipped preset (PLAN-dungeon-crawler-2026-10-14), its
 * defaults as they stand: create, the reply, the welcome (`member-added`),
 * the turn order (on its six), the answer form and its four actions.
 *
 * `defaults.envoys` seats BOTH envoys: the Narrator is the genre's default and
 * is seated regardless, and the Planner is seated here — the create spec
 * writes its greeting only while it is seated, and its talk needs its seat.
 */
const dungeonCrawlerDefaultPreset = (): PresetInput => ({
	slug: "dungeon-crawler-default",
	genre: dungeonCrawlerGenre,
	label: "Dungeon Crawler",
	description:
		"The AI is the whole Dungeon Master. Make a character, walk into a world it generates, and play only your own part — alone or with friends.",
	default: true,
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
	lairWordsOnlyPreset(),
	lairRulesPreset(),
	lairRulesAndDicePreset(),
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
	 * ⏳ Event → spec, as a binding row reads it — derived from the preset's
	 * **effective registrations** (the genre's defaults ⊕ its changes), the
	 * first registration on each event. Kept so a host still on bindings runs
	 * exactly what the registrations say (to lane 5a's resolver).
	 */
	bindings: Record<string, { spec: string }>
	/**
	 * 🚧 The preset's changes on its genre's defaults (`PresetDecl.registrations`)
	 * — absent when it changes no registration. What a host stores as the
	 * preset's registration rows (PLAN-layering D7).
	 */
	registrations?: PresetRegistrationChanges
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
	 * ⚠ **`includedActions` is deliberately not here.** The column reads NULL
	 * as "the companion rule", and that rule is what every core preset ran on
	 * — so the genre's defaults now register exactly those actions
	 * (`genres/defaults.ts`), and a preset drops or adds actions as
	 * registrations. A host still reading the column keeps reading NULL.
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

/** The effective registrations' events → spec: the first registration on each event. */
const bindingsOf = (decl: PresetDecl): Record<string, { spec: string }> => {
	const out: Record<string, { spec: string }> = {}
	for (const r of effectiveRegistrations(coreGenreRegistrations()[decl.genre], decl.registrations))
		if (r.trigger.family === "event" && !out[r.trigger.event]) out[r.trigger.event] = { spec: r.pipeline }
	return out
}

/** One declaration, in the shape SP's seed pass writes. */
const seedOf = (decl: PresetDecl, seedKey: string): CorePresetSeed => ({
	seedKey,
	// The row columns are text: the declaration's display text resolved to
	// `en` (R-20 — a bare string is itself). The label is required, so the
	// seed key is a fallback the type makes unreachable.
	name: i18nText(decl.label) ?? seedKey,
	description: i18nText(decl.description) ?? "",
	genreId: decl.genre,
	bindings: bindingsOf(decl),
	...(decl.registrations ? { registrations: decl.registrations } : {}),
	...(decl.defaults
		? { defaults: decl.defaults as Record<string, unknown> }
		: {}),
	...(decl.enabled === undefined ? {} : { enabled: decl.enabled }),
	// 🚧 The preset layer of the cascade and the card's numbers (2026-10-19):
	// the row columns `settings`, `calls_per_turn` and `cast_floor`.
	...(decl.settings ? { settings: decl.settings as Record<string, unknown> } : {}),
	...(decl.callsPerTurn !== undefined ? { callsPerTurn: decl.callsPerTurn } : {}),
	...(decl.cast ? { castFloor: decl.cast } : {}),
	isDefault: decl.default === true,
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
	seedOf(stored("story-minimal"), "core-story-minimal"),
	seedOf(stored("story-living"), "core-story-living"),
	seedOf(stored("story-rule-based"), "core-story-rule-based"),
	/** 🚧 Chat's two (2026-10-19): Basic is its default. */
	seedOf(stored("chat-basic"), "core-chat-basic"),
	seedOf(stored("chat-agentic"), "core-chat-agentic"),
	/** Offered, not assumed — the same footing as Adventure. */
	seedOf(stored("guide-default"), "core-guide-default"),
	/**
	 * 🚧 The Lair's three (rewrite, 2026-10-21): Rules keeps `core-lair-default`,
	 * the key the Lair's one preset carried, so every session born of it stays
	 * on it; Words only and The rules decide (`lair-rules-and-dice`) are new rows.
	 */
	seedOf(stored("lair-words-only"), "core-lair-words-only"),
	seedOf(stored("lair-rules"), "core-lair-default"),
	seedOf(stored("lair-rules-and-dice"), "core-lair-rules-and-dice"),
	/** 🚧 Offered in the picker, never assumed — Lair's footing. */
	seedOf(stored("dungeon-crawler-default"), "core-dungeon-crawler-default")
	]
})
