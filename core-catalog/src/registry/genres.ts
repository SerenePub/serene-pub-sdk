/**
 * Core's session genres (24 §3) — first-class declared objects with their own
 * ids. The genre owns its id (`core:genre/chat`); the create pipeline is its
 * required member, not its identity. Every session-event spec references the
 * genre object here, so the id is typed once and cannot be mistyped per spec.
 *
 * T6 moves this into `@serene-pub/core-catalog` with the specs; today it is
 * the in-repo half of that package.
 */
import { genre, layout, NUMBER_ATTRIBUTE_KINDS, sessionEvents, type UsesExpectation } from "@serene-pub/sdk"
import {
	DUNGEON_CRAWLER_LAYOUT,
	LAIR_LAYOUT,
	LAIR_PARTY_LAYOUT,
	STORY_LAYOUT,
	STORY_WORLD_LAYOUT
} from "./layouts.js"
import type { FieldDecl } from "@serene-pub/sdk"
import {
	DUNGEON_CRAWLER_GENRE_ID,
	DUNGEON_CRAWLER_NARRATOR_KEY,
	DUNGEON_CRAWLER_PLANNER_KEY,
	PARLEY_CHANNEL,
	TRAVELOGUE_CHANNEL
} from "../genres/dungeon-crawler/names.js"
import { GUIDE_MASCOT_IMAGE } from "../seed/guideMascotImage.js"
// 🚧 The rulesets first: a genre recommending one nothing declares is refused.
import { freeformRuleset, visItinerisRuleset, wherewithalRuleset } from "./rulesets.js"
import { coreWidgets } from "./widgets.js"
import {
	GUIDE_SUMMARIZE_SCENE_SPEC_ID,
	LAIR_SUMMARIZE_SCENE_SPEC_ID,
	STORY_SUMMARIZE_SCENE_SPEC_ID
} from "../shared/summarize/sceneIds.js"
import { TABLE_CHANNEL_DECL } from "../shared/ui/conversation/tableChannel.js"

/*
 * Widgets that read a lorebook — Chronicle, Places and Lore entries — are
 * offered wherever a session may have one (`lorebook` in the genre's shape):
 * optional in Story, Chat and the Guide, required in the Lair. So none omits
 * them, and each genre's `omitWidgets` stays the Author's note alone (Story's
 * own). A genre with no lorebook omits all three — Dungeon Crawler does
 * (PLAN-core-widgets §4).
 */

/**
 * Auto-advance (PLAN-turn-order §4.6, R16): whether the head turn fires by
 * itself after a send, and how far.
 *
 * ONE `FieldDecl`, declared here and placed in a genre's `fields` — not a
 * column, not a metadata key, not a bespoke control. It is read from the
 * settings document like any other field, rendered by the session settings
 * form like any other field, and stored in `sessions.genre_fields` like any
 * other field. Core's layer of the cascade (§4.13) is `next`; Story
 * overrides it to `round` (R16), and a genre that wants a silent `off`
 * pins `settings: { autoAdvance: 'off' }` and declares no control at all.
 *
 * ⚠ With `off`, a send produces no reply until Continue. That is the
 * feature, not a defect — the docs say so.
 * @experimental
 */
export const AUTO_ADVANCE_FIELD: FieldDecl = {
	// ⚠ `enum` + `members`, not the `select` + `options` §4.6 spells: there is
	// no `select` field type and no `options` key in the vocabulary (PLAN §8
	// (18)). `members` is the existing way to say "the stored values are not
	// what a person should read", and `of` derives from its keys — so this is
	// the same control, in the words the form renderer already speaks.
	type: "enum",
	label: { en: "Auto-advance" },
	members: [
		{ key: "off", label: { en: "Off" } },
		{ key: "next", label: { en: "Next turn" } },
		{ key: "round", label: { en: "Whole round" } }
	],
	default: "next",
	description: {
		en: "Fire the next turn automatically after you send."
	}
}

/**
 * Which path a turn-order spec with a model path takes (PLAN-turn-order R41,
 * M4): `rules`, the strategy node, or `model`, the `advise` oracle asking a
 * model who speaks. A genre field like auto-advance — declared, cascading
 * (§4.13), read by the spec's `decide` junction off the settings document.
 * Only a genre whose turn-order spec has a model path declares it.
 * @experimental
 */
export const TURN_MODE_FIELD: FieldDecl = {
	type: "enum",
	label: { en: "Who speaks next is decided by" },
	members: [
		{ key: "rules", label: { en: "The turn order rules" } },
		{ key: "model", label: { en: "The model" } }
	],
	default: "rules",
	description: {
		en: "The rules are free and instant; the model reads the conversation and costs a model call per turn."
	}
}

/**
 * How much of each character's card the model sees when that character is
 * not the one speaking (2026-09-27). Replaced the per-character *visibility*
 * switch on a cast seat (`session_characters.visibility`, retired the same
 * day): the same three levels and the same rules, now one setting for the
 * whole cast. Read by `core:task/build-template-context@1` off the cast read
 * (the host attaches the resolved value), never by a prompt row.
 *
 * - `full` — name, nickname, description and personality. The default, and
 *   what every card rendered before this existed, so a session that never
 *   touched the old switch renders byte for byte what it did.
 * - `brief` — name, nickname and description: who they are, not how they
 *   behave (the old *minimal*).
 * - `speaker-only` — no card for anyone but the speaker, and no names in
 *   `{{characterNames}}` at all (the old *hidden*, applied to everyone).
 *
 * The speaker's own card is always complete, whatever the level.
 * @experimental
 */
export const CHARACTER_DETAIL_FIELD: FieldDecl = {
	type: "enum",
	label: { en: "Character detail" },
	members: [
		{ key: "full", label: { en: "Everything" } },
		{ key: "brief", label: { en: "Name and description" } },
		{ key: "speaker-only", label: { en: "Only whoever is speaking" } }
	],
	default: "full",
	description: {
		en: "How much the model is told about each character who isn't speaking. Less detail leaves more room for the conversation; the speaker is always described in full."
	}
}

/**
 * 🚧 The **author's note** (2026-10-02, AN1; Story only — the roleplay Chat's until 2026-10-19) — the
 * person's own steering text for one session: what is true now, where the
 * story should lean. Placed in the conversation like an inject script —
 * `depth` messages back from the reply — and repeated every `interval`-th
 * reply, with **no** token trigger.
 *
 * **At the end by default** (owner ruling 2026-10-03): `depth` 0, right after
 * the newest message and before the reply — the same place the post-history
 * reminder defaults to, on both wires (folded into the newest user line on a
 * `midSystem: 'fold'` connection). It was 4. The end is also what keeps a
 * prompt an exact extension of the last one: a note four messages up moves
 * four messages' worth of the prompt every turn. A session that stored a depth
 * keeps it; only the default moved.
 *
 * ⚠ Not the **post-history reminder**: that is the pipeline's and the card's
 * "how to respond", gated by `postHistoryTokenTrigger` and placed by
 * `postHistoryDepth`. The two are separate blocks; at one index the note
 * renders first, then inject scripts, then the reminder (closest to the
 * reply). Not the Writing Room plugin's `authorsNote` either, which is a
 * plain text field its own prompts interpolate — core's resolution reads an
 * object only.
 *
 * ONE `FieldDecl`, like auto-advance: stored in `sessions.genre_fields`,
 * drawn by the settings form, supplied to a run by the inlet's `fields`. A
 * genre opts in by declaring it; core resolves it generically (the context
 * builder carries it, Assemble places it, the template renders it).
 * @experimental
 */
export const AUTHORS_NOTE_FIELD: FieldDecl = {
	type: "object",
	label: { en: "Author's note" },
	description: {
		en: "Your own note to the model for this session — what is true now, or where the story should go. It is placed right before the reply unless you move it, every reply or every few."
	},
	fields: {
		text: {
			type: "text",
			label: { en: "Note" },
			default: ""
		},
		depth: {
			type: "integer",
			label: { en: "Messages from the end" },
			description: {
				en: "How many messages before the reply the note goes. 0, the default, puts it right after the newest message."
			},
			min: 0,
			max: 1000,
			default: 0
		},
		interval: {
			type: "integer",
			label: { en: "Every how many replies" },
			description: {
				en: "1 adds it to every reply; 3 adds it to every third."
			},
			min: 1,
			max: 1000,
			default: 1
		},
		role: {
			type: "enum",
			label: { en: "Sent as" },
			members: [
				{ key: "system", label: { en: "System" } },
				{ key: "user", label: { en: "User" } },
				{ key: "assistant", label: { en: "Assistant" } }
			],
			default: "system",
			group: "Advanced"
		}
	},
	default: { text: "", depth: 0, interval: 1, role: "system" }
}

/* ── The voices: who may speak up unprompted ──────────────────────────── */

/**
 * 🚧 **Let others speak up** (2026-10-20 — the voices group of the retired
 * background tasks, now a genre setting, PLAN-layering §4): after everyone
 * has had their turn, one more character may speak up on their own before it
 * is the person's again. Read by the genre's turn-order spec
 * (`turnOrderSpec({ unprompted })`, `core:script/unprompted-modes`), which
 * puts the entry at the head of the order — canon A9, who speaks is state.
 * Each voice is another model call, so it is off by default. A genre opts in
 * by declaring it beside `NARRATOR_INTERJECTIONS_FIELD`.
 * @experimental
 */
export const SIDE_CAST_FIELD: FieldDecl = {
	type: "boolean",
	label: { en: "Let others speak up" },
	description: {
		en: "After everyone has had their turn, one more character may speak up on their own before it is yours again. Each is another model call."
	},
	default: false,
	reach: "owner"
}

/**
 * 🚧 **Narrator asides** (2026-10-20, the voices group's other half): after
 * everyone has had their turn, the narrator may add a line of its own before
 * it is the person's again. A genre setting read by the turn-order spec, as
 * `SIDE_CAST_FIELD` is. Off by default.
 * @experimental
 */
export const NARRATOR_INTERJECTIONS_FIELD: FieldDecl = {
	type: "boolean",
	label: { en: "Narrator asides" },
	description: {
		en: "After everyone has had their turn, the narrator may add a line of its own before it is yours again. Each is another model call."
	},
	default: false,
	reach: "owner"
}

/**
 * 🚧 **Honour mode** (owner ruling 2026-10-15) — a key core reads, the way it
 * reads `autoAdvance`, so any genre opts in by placing this object under
 * `honorMode` in its `fields` (PLAN-genres-seams S6, 2026-10-23; the Dungeon
 * Crawler's own until then). A genre that declares it keeps its story turns:
 * an older turn on a channel that offers the retake is never deleted (retake
 * from the latest instead), and the latest is deleted by the session owner
 * alone, only while this is on (`turnDeleteVerdict`, app `messages/verbs.ts`).
 * The retake is the owner's whatever it says. 🚧 And (2026-10-16) a player
 * edits their own sheet by hand only while this is on; the host always may,
 * and the pipeline is untouched (`assertSessionOwner`, app `state/write.ts`;
 * the key read by `app/server/sessions/settings.ts`).
 * @experimental
 */
export const HONOR_MODE_FIELD: FieldDecl = {
	type: "boolean",
	label: { en: "Honour mode" },
	// 🚧 RF fix 5 (owner ruling 2026-10-23): deleting needs a deletion
	// pipeline, which no core genre registers — so the delete half reads
	// "where deleting is on"; Back and Forward are the table's either way.
	description: { en: "Lets players edit their own sheets by hand, and the host delete the latest turn where deleting is on. Off: neither." },
	default: false
}

/**
 * 🚧 **Show outcomes** — whether a session's prompts carry the numbers of
 * how its checks came out; a key core reads (app `messages/diceWords.ts`), so
 * any genre opts in by placing this object under `showDice` in its `fields`
 * (PLAN-genres-seams S6, 2026-10-23; the Lair's own until then). ⏳ The key
 * `showDice` is kept — stored sessions hold it; no setting is named for dice
 * (2026-10-22), a ruleset may decide without them. How checks came out stays
 * in the story for everyone either way — dice, cards, a spend or a
 * judgement; off, the party read how things went and never the numbers (the
 * host leaves them out of every prompt).
 * @experimental
 */
export const SHOW_OUTCOMES_FIELD: FieldDecl = {
	type: "boolean",
	label: { en: "Show outcomes" },
	description: {
		en: "On, the party read how each check came out, numbers and all, as it landed. Off, the results still show in the story, but the party read only how things went, never the numbers."
	},
	default: true
}

/* ── Story ──────────────────────────────────────────────────────────────── */

/**
 * 🚧 **Story** (PLAN-genre-restructure R4, 2026-10-19): the roleplay Chat and
 * Adventure folded into one genre. Its reply is today's Chat reply, byte for
 * byte — the prompts, the context template and the variable templates
 * (ruled) — and the world keeps itself behind it as far as the session's
 * **preset** says: Minimal (one call, nothing moves), Living (one after-turn
 * call keeps the sheets, the clock and the conditions; a sweep every few
 * turns files what happened) and Rule Based (Living, with the ruleset's
 * scripts resolving the numbers). Since 2026-10-20 (PLAN-layering §4) the
 * world keeps itself by **routines** — the reckoning after each round, the
 * sweep every few turns, a picture of each new scene (off) — registered in
 * the genre's defaults (`genres/defaults.ts`); a preset is changes on them.
 *
 * Adventure's own reply — a planner, a narrator, a voice per cast member and a
 * state keeper, four calls and more a turn — was retired with the genre: its
 * Look, Rest, Ask and Answer actions moved here.
 * @experimental
 */
export const STORY_GENRE_ID = "core:genre/story"

/**
 * 🚧 **What a genre plays best with** (RF fix 8, owner ruling 2026-10-23:
 * "genres can expect certain attributes, shapes, zones … but we won't lock
 * someone into using their own conventions"): each thing by its tag, with
 * the label the picker lists and the sentence it says why. A genre brings no
 * attributes of its own; one the session's rules lack is played in words.
 * Member copy — never a word of the rules' machinery.
 */
const expectation = (tag: string, label: string, why: string, kinds?: readonly string[]): UsesExpectation =>
	Object.freeze({ tag, label, why, ...(kinds ? { kinds: Object.freeze([...kinds]) } : {}) })
/** A number someone can lose and win back: health. */
const HEALTH = expectation("health", "a health-like number", "Hits hurt and rests heal by it; without one, harm is told in words.", NUMBER_ATTRIBUTE_KINDS)
/** How someone feels, in a word. */
const MOOD = expectation("mood", "a mood word", "How each character feels colours how they speak; without one, it lives in the telling.")
/** What ails or marks someone for a while. */
const CONDITIONS = expectation("condition", "what ails someone", "Hurts, fears and blessings last until they pass; without them, they are remembered in words.")
/** Somewhere a character's things stay with them. */
const INVENTORY = expectation("inventory", "somewhere to keep what they carry", "What a character picks up stays with them from scene to scene.")

/** @experimental */
export const storyGenre = genre(STORY_GENRE_ID, {
	name: { en: "Story" },
	family: "story",
	description: {
		en: "Roleplay and adventure in one: bring characters and personas in any mix — or none — and tell a story together. The world can keep itself as you play."
	},
	about: {
		en: [
			"Tell a story with the model: roleplay with your characters, run an adventure, or just write together.",
			"Who's in the room: your characters and personas, in any mix. None are required: the model can tell the story on its own.",
			"Who drives: you do. On Living the world keeps itself: after each round it notes what changed — health, time, conditions — and every few turns it files what happened in your lorebook.",
			"What it costs: one model call a turn on Minimal; two on Living and Rule Based (the reply, then a short look at what changed), plus a summary every few turns.",
			"Required: nothing. Optional: a lorebook for the world, and rules that keep numbers if you want them.",
			"Pick Chat to talk to the model as itself, the Lair to run the game yourself, or the Dungeon Crawler to let the AI run it.",
			"Minimal: just the story, nothing tracked. Living: the world keeps itself, in words. Rule Based: Living, with the rules you pick deciding the numbers."
		].join("\n\n")
	},
	members: "group",
	/**
	 * 🚧 An **open** grammar (PLAN-genre-restructure §11): the after-turn
	 * reckoning takes whatever verbs the session's ruleset provides, so every
	 * ruleset fits; dice, health, conditions and casting are used where the
	 * ruleset has them and told in words where it does not.
	 */
	uses: {
		verbs: "any",
		dice: "optional",
		// 🚧 RF fix 8: what it plays best with, never what it needs — Freeform plays it all in words.
		optional: { attributes: [HEALTH, MOOD], entryTypes: [CONDITIONS], zoneTypes: [INVENTORY], conditions: true, casting: true }
	},
	/**
	 * 🚧 Freeform first and by default; Vis Itineris for numbers and a d20;
	 * 🚧 (2026-10-22) Wherewithal for rules with no dice — pools spent, bonds
	 * and troubles; any ruleset allowed.
	 */
	rulesets: { recommended: [freeformRuleset.id, visItinerisRuleset.id, wherewithalRuleset.id], default: freeformRuleset.id },
	/** 🚧 Words by default; a table may turn rules or scripts on (Rule Based pins `scripts`). */
	rigour: { options: ["prose", "mechanics", "scripts"], default: "prose" },
	shape: {
		/**
		 * Both participant systems optional and unbounded above — Chat's
		 * shape, kept: a Minimal story may start with nobody in it (the
		 * preset's `cast` floor says so on the card).
		 */
		characters: { min: 0 },
		personas: { min: 0 },
		lorebook: "optional",
		composer: "text",
		voice: "character",
		greeting: { enabled: true, channel: "main" },
		// No `turnOrder` here (retired 2026-09-23, R28): the Turn order
		// control is `core:spec/story-turn-order`'s `strategy` node and the
		// swaps it declares (genres/story/turnOrder.ts).
		/**
		 * 🚧 Where the story is (live scenes §15 G2, from Adventure): the
		 * world's `location`. A scene is named `Scene N · <place>` and *the
		 * place changed* fires when the party move.
		 */
		scenes: { place: { stateKey: "location" } },
		/** The session settings form's own sections (§4.11): declared, never automatic. */
		scenario: true,
		tags: true,
		/**
		 * Chat's four (auto-advance on `round`, R16; the turn-order model
		 * path; character detail; the author's note), Adventure's tone and
		 * difficulty under Advanced, and the two voices (2026-10-20: the
		 * voices group of the retired background tasks, genre settings now).
		 * Adventure's *Trust the narrator* is gone: its meaning is a
		 * routine's **Review** mode now.
		 */
		fields: {
			autoAdvance: { ...AUTO_ADVANCE_FIELD, default: "round" },
			turnMode: TURN_MODE_FIELD,
			characterDetail: CHARACTER_DETAIL_FIELD,
			authorsNote: AUTHORS_NOTE_FIELD,
			tone: {
				type: "enum",
				label: { en: "Tone" },
				description: {
					en: "How the story is told. Read by the prompts that name {{tone}}: the narrator's, Look's."
				},
				of: ["grounded", "pulpy", "grim", "whimsical"],
				members: [
					{ key: "grounded", label: { en: "Grounded" } },
					{ key: "pulpy", label: { en: "Pulpy" } },
					{ key: "grim", label: { en: "Grim" } },
					{ key: "whimsical", label: { en: "Whimsical" } }
				],
				default: "grounded",
				advanced: true
			},
			difficulty: {
				type: "enum",
				label: { en: "Difficulty" },
				description: {
					en: "How hard the world pushes back. Read when the world keeps the sheets after each round."
				},
				of: ["story", "normal", "hard"],
				members: [
					{ key: "story", label: { en: "Gentle" } },
					{ key: "normal", label: { en: "Normal" } },
					{ key: "hard", label: { en: "Hard" } }
				],
				default: "normal",
				advanced: true
			},
			sideCast: SIDE_CAST_FIELD,
			narratorInterjections: NARRATOR_INTERJECTIONS_FIELD
			// `applyActionChanges` (2026-10-20) is removed (R55, 2026-10-21);
			// since GM 2026-10-23 (G1 ★3) Rest applies at its own action's mode
			// (an action registration carries none: Full), never the reckoning's.
		}
	},
	// 🚧 No slots, no sheet (RF fix 8): the session's rules bring its attributes;
	// the host keeps where and when (the scene's place, the story clock).
	events: {
		/**
		 * The turn-order events (PLAN-turn-order §4.5) — Chat's nine: anything
		 * that can change whose turn it is.
		 */
		[sessionEvents.messageCompleted]: {},
		[sessionEvents.messageEdited]: {},
		[sessionEvents.messageDeleted]: {},
		[sessionEvents.messageHidden]: {},
		[sessionEvents.castChanged]: {},
		[sessionEvents.sessionUpdated]: {},
		[sessionEvents.sessionBranched]: {},
		[sessionEvents.messageRespond]: { required: true },
		[sessionEvents.sessionAction]: { open: true },
		[sessionEvents.memberAdded]: {},
		[sessionEvents.memberRemoved]: {},
		/** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
		[sessionEvents.formAddressed]: {}
	},
	/**
	 * The layouts this genre ships (R71): Chat's — the conversation, and the
	 * Author's note tucked in the right rail — first and by default;
	 * Adventure's world arrangement beside it, for a story that keeps sheets.
	 */
	layouts: [
		layout({ slug: "default", name: { en: "Story" }, preset: STORY_LAYOUT }),
		layout({ slug: "world", name: { en: "World" }, preset: STORY_WORLD_LAYOUT })
	],
	/** 🚧 The spec this genre's scenes are summarized with (live scenes §13). */
	summarize: { scene: STORY_SUMMARIZE_SCENE_SPEC_ID }
})

/* ── Chat (the assistant) ───────────────────────────────────────────────── */

/**
 * 🚧 **Chat** (PLAN-genre-restructure §1, R2, R4; 2026-10-19): the model as
 * itself — a plain assistant, no characters, no personas, no story, no
 * ruleset. The id kept its name with the new meaning (ruled: no alias); the
 * roleplay that answered to it until 2026-10-19 is the Story genre's, and the
 * app's migration moves those sessions there before this genre's specs are
 * seeded (§2-7). The only speaker is the **Assistant**, the genre's envoy.
 *
 * Solo (ruled ★I): never a group session. Two presets: Basic — one call, no
 * tools — and Agentic, the same reply with the session's tools.
 * @experimental
 */
export const CHAT_GENRE_ID = "core:genre/chat"

/** The Assistant's key — the address `envoy:assistant`. @internal */
export const ASSISTANT_ENVOY_KEY = "assistant"

/**
 * 🚧 The Assistant's instructions — the assistant register, never a branch
 * of the roleplay prompts (§1-1). Read through the envoy's `prompts` like
 * the Guide's Serene.
 * @internal
 */
export const ASSISTANT_SYSTEM_PROMPT = [
	"You are a helpful assistant, talking with the person directly and as yourself. You are not a character and this is not a story: do not roleplay and do not narrate.",
	"Be accurate. When you are not sure of something, say so plainly; never invent facts, figures, quotes, sources or links. If a question is ambiguous, ask one short clarifying question.",
	"When excerpts from the person's lorebook are supplied, treat them as their own reference notes: use them when they answer the question, and say which entry you used. When tool results are supplied, answer from them and say where a fact came from.",
	"Keep your answers as short as the question allows. Use lists, tables or code blocks only when they make the answer clearer."
].join("\n\n")

/**
 * 🚧 Chat's tool kinds (§1-8), each off or on per session through the
 * `tools` field: the host maps each kind onto the tools that serve it
 * (`core:query/available-tools@1`'s `kinds`). R53 holds: no tool sees a
 * connection. Not offered: code execution, a shell, app administration.
 * @experimental
 */
export const CHAT_TOOL_KINDS = Object.freeze([
	"web",
	"lore",
	"lorebook-write",
	"image",
	"clock",
	"calculator",
	"history"
] as const)


/** @public */
export const chatGenre = genre(CHAT_GENRE_ID, {
	name: { en: "Chat" },
	family: "assistant",
	description: {
		en: "The model as itself — a plain assistant, no characters or story. Add tools to let it search, read your lorebooks and make images."
	},
	about: {
		en: [
			"Talk to the model as itself: a plain assistant, with no characters and no story.",
			"Who's in the room: you and the Assistant. Chat is just for you; it is never a group session.",
			"What it costs: one model call a turn on Basic. On Agentic the Assistant may use tools — search the web, read your lorebooks, make a picture — and each tool it uses costs another call, a few at most.",
			"Required: nothing. Optional: a lorebook it reads from.",
			"Pick Story to roleplay or tell a story, or the Guide for help with Serene Pub itself.",
			"Basic: the model, no tools. Agentic: the model with the tools you switch on."
		].join("\n\n")
	},
	members: "solo",
	shape: {
		/** Nobody from the library sits here: the one speaker is the Assistant (§1-8). */
		characters: { min: 0, max: 0 },
		/** No persona either: the person speaks as themselves (a cardless seat). */
		personas: { min: 0, max: 0 },
		lorebook: "optional",
		composer: "text",
		voice: "character",
		/**
		 * Lore writes only through the *Remember things* routine (`core:spec/assistant-memory`) or the `lorebook-write`
		 * tool, each Review or Off unless the person turns it Full (★J); no
		 * scenes — a conversation with an assistant has none to open.
		 */
		writes: { lore: true, scenes: false },
		/** No greeting: a new Chat opens empty (★C). */
		greeting: { enabled: false },
		scenario: false,
		tags: true,
		fields: {
			tools: {
				type: "string[]",
				label: { en: "Tools" },
				description: {
					en: "What the Assistant may use while it answers. Each tool it uses is another model call; none means one call a turn."
				},
				of: [...CHAT_TOOL_KINDS],
				members: [
					{ key: "web", label: { en: "Search the web" } },
					{ key: "lore", label: { en: "Read your lorebooks" } },
					{ key: "lorebook-write", label: { en: "Write to a lorebook" } },
					{ key: "image", label: { en: "Make pictures" } },
					{ key: "clock", label: { en: "Date and time" } },
					{ key: "calculator", label: { en: "Calculator" } },
					{ key: "history", label: { en: "Search this conversation" } }
				],
				default: []
			}
		}
	},
	envoys: [
		{
			key: ASSISTANT_ENVOY_KEY,
			name: { en: "Assistant" },
			description: {
				en: "The model as itself: a plain, careful assistant that answers directly and says when it is unsure."
			},
			prompts: { systemPrompt: ASSISTANT_SYSTEM_PROMPT },
			default: true,
			// A line nobody claims here is the Assistant's.
			fallback: true,
			speaks: "in-turn"
		}
	],
	events: {
		/** The turn-order events (PLAN-turn-order §4.5): a one-speaker order, written once and kept (canon A9). */
		[sessionEvents.messageCompleted]: {},
		[sessionEvents.messageEdited]: {},
		[sessionEvents.messageDeleted]: {},
		[sessionEvents.messageHidden]: {},
		[sessionEvents.castChanged]: {},
		[sessionEvents.sessionUpdated]: {},
		[sessionEvents.sessionBranched]: {},
		[sessionEvents.messageRespond]: { required: true },
		[sessionEvents.sessionAction]: { open: true },
		[sessionEvents.memberAdded]: {},
		[sessionEvents.memberRemoved]: {},
		/** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
		[sessionEvents.formAddressed]: {}
	},
	/** No author's note: there is no story to steer (it is Story's). */
	omitWidgets: [coreWidgets.authorsNote]
})

/* ── Guide ──────────────────────────────────────────────────────────────── */

/**
 * The **pure user/assistant session type** (plans/29 R-18; 09-B B10; built
 * 2026-09-16 as U5g): one envoy, no characters, at most one persona. A
 * person talks; Serene, Serene Pub's guide, answers about the app and its docs. It
 * is the structural successor of the deprecated *Assistant Chat*, whose code
 * is not reused — an envoy is a cast member, so the reply road, the turn
 * strategies, the resolver and the inspector all work unchanged.
 *
 * The envoy is **Serene**, Serene Pub's mascot (owner, 2026-10-01): the
 * genre is the Guide, and Serene is who speaks in it. Neither her name nor
 * her face is load-bearing — the key `mascot` is the address, and the name
 * and image are display text.
 * @experimental
 */
export const GUIDE_GENRE_ID = "core:genre/guide"

/** The guide's key — the slug `envoy:mascot` and the config address `envoy:mascot`. @internal */
export const GUIDE_MASCOT_KEY = "mascot"

/**
 * The guide's instructions.
 *
 * ⚠ Rewritten 2026-09-27 after the guide invented a Python plugin system —
 * `manifest.json`, `on_load()`, a `/docs/plugins/…` page — and then a quote
 * from a page that does not exist to defend it. The old text said "You know
 * Serene Pub's documentation" and, when no excerpts came, "say what you
 * know": a licence to answer from a model's general knowledge, which knows
 * nothing about this app. The rule now is the excerpts or nothing, a path
 * copied rather than composed, and a plain sentence when the docs are silent.
 * The template (`GUIDE_RESPOND_TEMPLATE`) states per turn whether any
 * excerpts matched; this states what to do either way.
 * @internal
 */
export const GUIDE_MASCOT_SYSTEM_PROMPT = [
	"You are Serene, Serene Pub's guide. You help the person you are talking with use Serene Pub: setting up connections to AI services, creating characters and personas, writing lorebooks, starting and tuning sessions, writing plugins, and understanding what the app is doing.",
	"Your manner is calm and warm. You are patient with every question, never hurried, and gently reassuring when something has gone wrong. Your kindness shows in clear, careful answers, not in filler or flattery.",
	"You cannot browse, search or open the documentation yourself. What you have instead is a set of documentation excerpts retrieved for the person's latest question and supplied with this conversation, each headed by its page and section and starting with the page's path. Those excerpts are the only thing you know about Serene Pub; your general knowledge of other apps does not apply to it. If you are asked what you can access, say exactly this.",
	"Answer only from the excerpts. After the answer, name the page you used by copying its path exactly as the excerpt gives it, as \"See: \" followed by the path. Never write a page, path, file name, command, code, API or quotation that does not appear in an excerpt, and never quote an excerpt you were not given.",
	"When the excerpts do not answer the question, or none were supplied, say so honestly and kindly: \"I couldn't find that in the docs.\" Then offer to look again if they put the question another way, or point them to the documentation at /docs. Do not fill the gap with a guess. If the person questions an earlier answer, check it against the excerpts and correct it when they do not support it.",
	"Keep your answers short and plain. Ask one clarifying question when the request is ambiguous. You are not a character in a story: do not roleplay and do not narrate."
].join("\n\n")

/**
 * Serene's greeting: the first line of every new Guide session, on `main`.
 * Declared, not generated (`EnvoyDecl.greeting`), so a new session opens
 * instantly with no model call. `{{char}}` is Serene.
 * @internal
 */
export const GUIDE_MASCOT_GREETING =
	"Hi, I'm {{char}}, your guide to Serene Pub. What would you like to talk about? How can I help you?"

/** @experimental */
export const guideGenre = genre(GUIDE_GENRE_ID, {
	name: { en: "Guide" },
	family: "assistant",
	/**
	 * 🚧 Solo (R2 ruling 3, 2026-10-19): never a group session — one
	 * person's questions about the app, so guests, invites and lanes are
	 * refused for it. (Ruled while it declared a `tools` field that reached
	 * the app; the field is gone since 2026-10-23, the rule stays.)
	 */
	members: "solo",
	description: {
		en: "Talk to Serene, Serene Pub's guide, about the app itself — no characters, no story; just questions and answers grounded in the docs."
	},
	/** 🚧 The card's long copy (2026-10-23, PLAN-genres-seams S8): who is in the room, what it costs, when to pick Chat. */
	about: {
		en: [
			"Ask Serene, Serene Pub's guide, how to use the app: she answers from its documentation.",
			"Who's in the room: you and Serene. You may write as yourself or as one persona; there are no characters, and the Guide is just for you, never a group session.",
			"What it costs: one model call a turn. Serene can't browse: each question looks up the sections of the docs that match it, and she answers only from those, naming the page she used.",
			"Required: nothing. Optional: a lorebook of your own notes, which she reads beside the docs and never writes to.",
			"Pick Chat to talk to the model about anything else, or Story to play with characters."
		].join("\n\n")
	},
	shape: {
		/** The settings form's sections (PLAN-turn-order §4.11): declared, never automatic. */
		scenario: false,
		tags: true,
		/**
		 * The whole definition of a pure user/assistant session: no library
		 * character can join, and the one speaker is the genre's envoy.
		 */
		characters: { min: 0, max: 0 },
		/** Optional, and at most one: the person may speak as themselves or as a persona. */
		personas: { min: 0, max: 1 },
		lorebook: "optional",
		composer: "text",
		voice: "character",
		/**
		 * Guide never writes (R-A/R-B). Its lorebook is the documentation it
		 * answers out of — a reference, read every turn and never added to —
		 * and a session about how the app works has no scene to open. Stated
		 * here rather than left to whichever specs a preset happens to bind,
		 * which is the whole point of declaring writes.
		 */
		writes: { lore: false, scenes: false },
		/**
		 * The cards' greetings are off — no character sits here. Serene's own
		 * opening line is her envoy greeting (`EnvoyDecl.greeting`).
		 */
		greeting: { enabled: false },
		// No turn-order swaps: one in-turn envoy and no characters, nothing to choose between.
		/**
		 * 🚧 No fields (2026-10-23, PLAN-genres-seams S8, ★E): the `tools`
		 * field (*Search the web*, 2026-10-19) is dropped — `guide-respond`
		 * has no tool loop and Serene's instructions say she cannot browse,
		 * so the setting did nothing. Web search stays Chat's (Agentic).
		 */
	},
	envoys: [
		{
			key: GUIDE_MASCOT_KEY,
			name: { en: "Serene" },
			description: {
				en: "Serene Pub's mascot and guide. Calm and warm, she answers questions about using the app from the documentation excerpts she is given."
			},
			image: GUIDE_MASCOT_IMAGE,
			prompts: { systemPrompt: GUIDE_MASCOT_SYSTEM_PROMPT },
			default: true,
			// A line nobody claims here is this envoy's (ruled 2026-09-26).
			fallback: true,
			speaks: "in-turn",
			greeting: { text: { en: GUIDE_MASCOT_GREETING } }
		}
	],
	events: {
		/**
		 * The turn-order events (PLAN-turn-order §4.5): a genre that binds
		 * its turn-order spec (`core:spec/<genre>-turn-order`) lists every event it binds it to, all
		 * optional. Nine here — anything that can change whose turn it is.
		 */
		[sessionEvents.messageCompleted]: {},
		[sessionEvents.messageEdited]: {},
		[sessionEvents.messageDeleted]: {},
		[sessionEvents.messageHidden]: {},
		[sessionEvents.castChanged]: {},
		[sessionEvents.sessionUpdated]: {},
		[sessionEvents.sessionBranched]: {},
		[sessionEvents.messageRespond]: { required: true },
		[sessionEvents.sessionAction]: { open: true },
		[sessionEvents.memberAdded]: {},
		[sessionEvents.memberRemoved]: {},
		/** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
		[sessionEvents.formAddressed]: {}
	},
	/** The author's note is Story's alone (Chat's until 2026-10-19; owner ruling 2026-10-02, AN1). */
	omitWidgets: [coreWidgets.authorsNote],
	/** 🚧 The spec this genre's scenes are summarized with (live scenes §13). */
	summarize: { scene: GUIDE_SUMMARIZE_SCENE_SPEC_ID }
})

/* ── Lair ───────────────────────────────────────────────────────────────── */

/**
 * The **reverse dungeon crawl** (rewritten 2026-10-21, PROPOSAL-lair-rewrite
 * R1–R13): the person who starts a Lair is its **game master** — they are the
 * dungeon — and an AI party, perhaps with friends seated beside it, delves
 * into what they build.
 *
 * ## The loop is the party and the GM
 *
 * Direction → the Castellan's plan → checks → the voices → the books. The
 * GM's lines are direction, never a line somebody in the scene said; the
 * Castellan plans the party's turn (who acts, what they attempt, what is
 * risky); the session's ruleset decides what a check is and the Oracle asks
 * the GM to call it (or rolls it, on auto roll); each named AI delver takes a
 * character turn of their own, and a delver a person plays waits for them;
 * the keeper routine keeps the books after each round. Everything else is a
 * **layer**: the rules (the ruleset and the session's rigour), rooms
 * (`roomsLayer`), the table (seated guests), memory (routines).
 *
 * ## Unopinionated (D8)
 *
 * The Lair declares no stats, items or races: the party's attributes are
 * whatever the chosen ruleset declares (🚧 RF fix 8: a genre brings none),
 * and the host keeps only its GM's two tools for it — the standing direction
 * and the whisper. It recommends a
 * ruleset; it never says what exists.
 *
 * ## Two envoys (D4)
 *
 * The **Castellan**, the dungeon's steward — plans, narrates when asked,
 * talks with the GM in the Sanctum, drafts rooms — is the fallback: every
 * line nobody claims carries its name. The **Oracle** speaks only mechanics:
 * roll forms, dice, the knock's question. Its lines are blocks, so they stay
 * out of the story's prose except as results.
 *
 * ## The Sanctum (D6, R7)
 *
 * A second channel, `sanctum`, the GM's private table with the Castellan —
 * `audience: 'owner'`: guests never see it, and the host filters its rows,
 * pushes and composer switch for everyone but the owner. The Castellan
 * greets every new session there with a declared line, written by
 * `lair-create` without a model call.
 * @experimental
 */
export const LAIR_GENRE_ID = "core:genre/lair"

/**
 * The post-history reminder's token trigger core ships on every assemble step
 * whose prompt renders the session's growing history as prose: each genre's
 * respond pipeline, and the prose actions (narrate-character, Adventure's
 * Look, the Lair's Trap and Reveal). Below
 * this many tokens of history a session gets no reminder, because a
 * reinforcement note two messages after the system prompt is noise. The
 * declaration's own default is 0 (always add it), which is what the short
 * structured calls keep: their reminder is the output format, and it belongs
 * at the end of every prompt. `narrate` keeps it too, as 0.5.3's narrator
 * did: its reminder carries the press's direction beside the seed. 3000 is
 * what 0.5.3 seeded on every prompt config. @internal
 */
export const POST_HISTORY_TOKEN_TRIGGER = 3000

/** The Lair envoy's key — the address `envoy:castellan` (R6). @internal */
export const LAIR_CASTELLAN_KEY = "castellan"

/**
 * 🚧 The Lair's mechanical voice — the address `envoy:oracle` (D4, owner R11
 * 2026-10-21): the one who answers what the dice say. A label within one
 * genre; ⚠ not the SDK's node kind *oracle* (a model call), which is code
 * vocabulary. @experimental
 */
export const LAIR_ORACLE_KEY = "oracle"

/** The Lair's out-of-fiction channel slug (R6) — the GM's alone (D6). @internal */
export const SANCTUM_CHANNEL = "sanctum"

/**
 * The Castellan's glyph: a tower key on a plain disc, in the same palette and
 * on the same terms as the guide's and the scribe's (`EnvoyDecl.image`).
 */
const LAIR_CASTELLAN_IMAGE =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
			'<circle cx="32" cy="32" r="30" fill="#e8e4f3" stroke="#6b5cb8" stroke-width="2"/>' +
			'<circle cx="32" cy="22" r="8" fill="none" stroke="#6b5cb8" stroke-width="4"/>' +
			'<rect x="30" y="29" width="4" height="22" rx="1" fill="#6b5cb8"/>' +
			'<rect x="34" y="42" width="7" height="3.5" rx="1" fill="#6b5cb8"/>' +
			'<rect x="34" y="47" width="5" height="3.5" rx="1" fill="#6b5cb8"/>' +
			"</svg>"
	)

/** 🚧 The Oracle's glyph: a die's face on the same disc, in the same palette. */
const LAIR_ORACLE_IMAGE =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
			'<circle cx="32" cy="32" r="30" fill="#e8e4f3" stroke="#6b5cb8" stroke-width="2"/>' +
			'<rect x="18" y="18" width="28" height="28" rx="5" fill="none" stroke="#6b5cb8" stroke-width="4"/>' +
			'<circle cx="25" cy="25" r="2.6" fill="#6b5cb8"/>' +
			'<circle cx="32" cy="32" r="2.6" fill="#6b5cb8"/>' +
			'<circle cx="39" cy="39" r="2.6" fill="#6b5cb8"/>' +
			"</svg>"
	)

/**
 * The Castellan's instructions for **Sanctum talk** (R6) — out of the
 * fiction, with the {{playerLabel}}. Interpolated by the envoy road's
 * context builder: `{{char}}` is the Castellan, `{{knownLocations}}` /
 * `{{locationEntry}}` are the rooms the listing holds and the one the party
 * stand in, `{{recentStory}}` is the story's latest rows as prose. Asked to
 * narrate, it says what it would play and points at **Narrate** (the plan's
 * QA (a)): the person, not the model, decides when the story moves. That
 * boundary is the FIRST paragraph (lair fix 2, 2026-10-22): seventh, a 14B
 * model answered a GM line with the story itself. The reminder after the
 * talk repeats it (`LAIR_CASTELLAN_REMINDER`).
 * `{{sanctumSteers}}` (the genre field, R13) says whether this talk shapes
 * the next turn, and `{{scratchpad}}` is its own running notes (the annex
 * field `castellan-scratchpad`, R13).
 * @internal
 */
export const LAIR_CASTELLAN_SYSTEM_PROMPT = [
	"You are {{char}}, the steward of a dungeon, talking with the {{playerLabel}} in the Sanctum, your table outside the story. Here you never narrate the story, and you never write a line, an action or a thought for anyone in the party. If the {{playerLabel}} asks you to narrate, say in a sentence what you would play, and that pressing Narrate plays it.",
	"The {{playerLabel}} is the person who runs this dungeon and narrates it. Nothing said here happens in the dungeon, and nobody in the party ever hears it.",
	"The party delving the dungeon: {{characterNames}}. They speak and act for themselves.",
	"Your work: you plan the party's moves each turn, and when they reach a room nobody has built yet, the turn stops so the {{playerLabel}} can describe it. The {{playerLabel}} narrates: what they write in the story is what the dungeon does. When the rules call for a roll, the Oracle asks the {{playerLabel}} to call it; the dice are never yours. You suggest; the {{playerLabel}} decides.",
	"Here you help them run their dungeon: brainstorm rooms, traps and treasure, plan what lies ahead, answer questions about the party and the story so far, and take corrections without argument.",
	"{{#if knownLocations}}The rooms the dungeon holds: {{knownLocations}}.{{else}}The dungeon holds no rooms yet.{{/if}} Name only these as rooms that exist. Anything else is an idea until the {{playerLabel}} builds it.{{#if locationEntry}}\n\nThe room the party are in:\n{{locationEntry}}{{/if}}{{#if recentStory}}\n\nThe story so far, most recent last:\n{{recentStory}}{{/if}}",
	"{{#if sanctumSteers}}What you two settle here shapes the next turn.{{else}}This is brainstorming. Nothing here reaches the story unless they Nudge, file a room, or press Narrate here.{{/if}}{{#if scratchpad}}\n\nYour scratchpad, the running notes you keep here (rooms planned, intentions, corrections):\n{{scratchpad}}{{/if}}",
	"Talk plainly, out of character, and briefly: a few sentences unless you are asked for more."
].join("\n\n")

/**
 * The Castellan's **reminder** (lair fix 2, 2026-10-22): its
 * `postHistoryInstructions`, placed after the Sanctum talk, just before it
 * answers — the role boundary again, where a model reads it last. A GM line
 * such as *Suzume gets sucked into an underground dungeon* reads like a story
 * prompt, and a model two messages into a conversation answered it by
 * narrating, with the boundary only in the system prompt's seventh paragraph.
 * The Sanctum's assemble places it whatever the talk's length
 * (`postHistoryTokenTrigger` 0 there, `reply.ts`).
 * @internal
 */
export const LAIR_CASTELLAN_REMINDER =
	"Answer as {{char}}, out of the story: plainly and briefly. Do not narrate, and do not write for anyone in the party. Asked to narrate, say in a sentence what you would play, and that pressing Narrate plays it."

/**
 * The Castellan's greeting (R6, owner F1 2026-09-28): the first line of every
 * new Lair session, on the Sanctum. It introduces the reverse dungeon, says
 * who narrates, what the Castellan does and what the Sanctum is for, and
 * invites the person to start. Declared, not generated — see
 * `EnvoyDecl.greeting`. `{{char}}` is the Castellan; the party may be empty
 * at creation, hence the `{{#if}}`.
 * @internal
 */
export const LAIR_CASTELLAN_GREETING = [
	"Welcome, {{playerLabel}}. I am {{char}}, steward of this dungeon, and you are its master.",
	"This is a reverse dungeon crawl: you don't play the hero, you are the dungeon. {{#if characterNames}}{{characterNames}} have come to delve into it{{else}}A party will come to delve into it{{/if}}, and they speak and act for themselves. You are the narrator. Whatever you write in the story is what the dungeon does: a door grinds open, a torch gutters, something moves in the dark.",
	"Each turn I plan the party's moves and post the plan here. When they try something risky and the rules call for a roll, the Oracle asks you to call it. When they reach a room you haven't built yet, I'll stop and ask you to describe it.",
	"This is the Sanctum, our table outside the story. Only you see it: the party and anyone you invite never hear what we say here. Use it to brainstorm, plan rooms before they're needed, fix a mistake, or ask me what should happen next: I'll tell you what I would play, and pressing Narrate plays it. I never narrate here.",
	"To begin, describe where the party stands in the story, or press **Continue** there and I'll bring them in."
].join("\n\n")

/** @experimental */
export const lairGenre = genre(LAIR_GENRE_ID, {
	name: { en: "Lair" },
	family: "adventure",
	members: "group",
	/**
	 * 🚧 What the Lair uses of a ruleset (D8, PROPOSAL §6): nothing it cannot
	 * run without — its plan, voices and books work in words — and it plays
	 * better with dice, conditions and casting where the ruleset has them. So
	 * every ruleset fits, and a fit rating explains itself.
	 */
	uses: {
		verbs: [],
		dice: "optional",
		// 🚧 RF fix 8: the party's health, what ails them and what they carry, where the rules keep them.
		optional: { attributes: [HEALTH], entryTypes: [CONDITIONS], zoneTypes: [INVENTORY], conditions: true, casting: true }
	},
	description: {
		en: "You are the dungeon. Build it, direct it, and watch an AI party — and any friends you invite — delve into what you made."
	},
	/** 🚧 The card's long copy (2026-10-23, PLAN-genres-seams S8). */
	about: {
		en: [
			"You are the dungeon and its game master: build the rooms, direct what happens, and watch an AI party delve into what you made.",
			"Who's in the room: the party — at least one character the AI plays, and any friends you invite, each playing a delver of their own. You never appear in the story: what you write is what the dungeon does.",
			"Who drives: you do, with two helpers. The Castellan plans each turn and talks the dungeon through with you in the Sanctum, which only you see; the Oracle asks you to call each check the rules want, and says how it came out.",
			"What it costs: on Words only, one model call a turn and one for each delver who speaks; on Rules and The rules decide, one more after each round to keep the books.",
			"Required: at least one character for the party, and a lorebook — the dungeon itself, one entry per room. Optional: rules that decide checks, such as Vis Itineris or Wherewithal, and friends to fill the seats.",
			"Pick the Dungeon Crawler to let the AI run the dungeon while you play a character, or Story to tell a story without a game master's screen.",
			"Words only: the party and you, in words, with no checks and no rooms to build. Rules: rooms to build, and the books kept after each round. The rules decide: every risky moment is the rules' to decide, called by you or decided at once."
		].join("\n\n")
	},
	/**
	 * 🚧 Freeform by default, Vis Itineris for rules and a d20 — the ruleset
	 * the Dungeon Crawler plays (D8) — and (2026-10-23, AUDIT-core-genres Lair
	 * 2) Wherewithal for rules with no dice: pools spent, a contest weighed.
	 * Any ruleset allowed: the rules follow the ruleset, never the genre (R2).
	 */
	rulesets: { recommended: [freeformRuleset.id, visItinerisRuleset.id, wherewithalRuleset.id], default: freeformRuleset.id },
	/** 🚧 Rules by default (the preset *Rules*); *Words only* is `prose`, *The rules decide* `scripts` (was *Rules and dice*, 2026-10-22). */
	rigour: { options: ["prose", "mechanics", "scripts"], default: "mechanics" },
	shape: {
		/** The settings form's sections (PLAN-turn-order §4.11): declared, never automatic. */
		scenario: true,
		tags: true,
		/** The party. One delver is a thin game; none is no game at all. */
		characters: { min: 1 },
		/**
		 * 🚧 **Guests join as participants** (R4, D5): a person's seat is a
		 * delver they play — a persona, or a seat of their own — and its
		 * turns wait for them. The game master is never in the scene: the
		 * session's owner writes direction, labelled by `playerLabel`. None
		 * is preselected — a seat is a guest's, never the owner's.
		 */
		personas: { min: 0, preselectDefault: false },
		/**
		 * The dungeon itself: one entry per location, each naming the ways out
		 * of it. Offered, never required (RF fix 2, 2026-10-23; `'required'`
		 * is retired): every session has one — its phantom book when none is
		 * chosen (R9) — so the rooms layer is always available.
		 */
		lorebook: "optional",
		/**
		 * Written on purpose (R-B). *Build room*, the knock's answer and *File
		 * as a room* add place entries. A genre whose loop writes lore has to
		 * declare it, or the write site refuses it.
		 */
		writes: { lore: true, scenes: true },
		composer: "text",
		/** The seed line carries the Castellan; the party get their own turns. */
		voice: "narrator",
		/**
		 * No prefill extend (lair pass D4): a planned turn cannot be extended
		 * mid-sentence. The composer's Continue stays on.
		 */
		messageVerbs: { extend: false },
		/**
		 * The turn controls (R12): Continue, Pick who speaks, Narrate, and
		 * **Regenerate the last turn** (`retake`): a Lair turn writes several
		 * rows — the plan, the roll forms, each delver's line — so the
		 * composer's Regenerate takes that whole turn again.
		 */
		turnControls: {
			advance: true,
			pick: true,
			narrate: true,
			retake: true
		},
		/**
		 * The story on `main`, and the **Sanctum** beside it (R6, D6): the
		 * GM's table with the Castellan, `audience: 'owner'` — never a guest's.
		 * A Castellan reply there is one row, so it keeps the ordinary row
		 * regenerate and offers no retake; and Pick who speaks has nobody to
		 * pick at a table the party never sit at.
		 *
		 * ⚠ **No `voice` of its own** — a channel whose voice differed from
		 * the genre's would make the Lair shape channels (`channelShapingOf`).
		 */
		channels: [
			// 🚧 Labelled (lair fix 2): the story's channel tab reads *Story*
			// beside the *Sanctum* (`messages.channel-tabs`).
			{ slug: "main", label: { en: "Story" } },
			{
				slug: SANCTUM_CHANNEL,
				label: { en: "Sanctum" },
				role: "conversation",
				audience: "owner",
				turnControls: { pick: false, retake: false }
			}
		],
		/**
		 * Nobody to greet with from the cards: a dungeon does not welcome the
		 * party. Its steward welcomes its master — the Castellan's declared
		 * greeting, written on the Sanctum by `lair-create`.
		 */
		greeting: { enabled: false },
		/**
		 * 🚧 Where the story is (live scenes §15 G2): the room the party stand
		 * in, the world's `location`. *The place changes* follows it.
		 */
		scenes: { place: { stateKey: "location" } },
		// No turn-order swaps: the plan decides who speaks.
		fields: {
			tone: {
				type: "enum",
				label: { en: "Tone" },
				description: {
					en: "How the Castellan narrates, and how the party carry themselves."
				},
				of: ["grounded", "pulpy", "grim", "whimsical"],
				members: [
					{ key: "grounded", label: { en: "Grounded" } },
					{ key: "pulpy", label: { en: "Pulpy" } },
					{ key: "grim", label: { en: "Grim" } },
					{ key: "whimsical", label: { en: "Whimsical" } }
				],
				default: "grounded",
				quick: true
			},
			/**
			 * 🚧 **The rooms layer** (PROPOSAL §3, §11; R10): on, the party
			 * knock at a room nobody built and the GM builds and files rooms;
			 * off — *Words only* — the dungeon lives in the GM's words alone
			 * and nothing knocks. Rooms are optional context: the loop never
			 * depends on them.
			 */
			roomsLayer: {
				type: "boolean",
				label: { en: "Rooms" },
				description: {
					en: "Build the dungeon room by room: when the party reach a room nobody has built, the turn stops and asks you to describe it. Off, the dungeon lives in your words alone."
				},
				default: true,
				quick: true
			},
			/**
			 * **Sanctum talk steers the story** (lair re-plan R13): on, the
			 * Castellan's planner reads the Sanctum talk since the story's last
			 * line — and its scratchpad — as plans, not facts. Off, only the
			 * explicit crossings reach the story: Nudge, a filed room, and
			 * Narrate pressed in the Sanctum.
			 */
			sanctumSteers: {
				type: "boolean",
				label: { en: "Sanctum talk steers the story" },
				description: {
					en: "When on, what you and the Castellan discuss since the last turn shapes the next one. When off, the Sanctum is for brainstorming: only Nudge, a filed room, and Narrate pressed in the Sanctum reach the story."
				},
				default: true,
				quick: true
			},
			/**
			 * 🚧 **Ask me before each check** (D3, D7; was *Ask me before
			 * rolling* until 2026-10-23, PLAN-genres-seams — no setting is named
			 * for dice; the id `askBeforeRolling` kept ⏳, stored sessions hold
			 * it): when the ruleset decides checks and the plan calls a moment
			 * risky, the Oracle puts a roll form to the GM — which check, how
			 * hard, or No check — and the party's turns wait for the answers.
			 * Off (and *Decide checks at once* off): risky moments are told in
			 * words.
			 */
			askBeforeRolling: {
				type: "boolean",
				label: { en: "Ask me before each check" },
				description: {
					en: "When the rules call for a check, the Oracle asks you which check and how hard before it is decided, and the party wait for your answer. Off, risky moments are told in words, unless Decide checks at once is on."
				},
				default: true,
				quick: true
			},
			/**
			 * 🚧 **Decide checks at once** (D7; was *Auto roll* until
			 * 2026-10-23, PLAN-genres-seams — the id `autoRoll` kept ⏳): at a
			 * table where the rules decide (rigour `scripts`, *The rules
			 * decide* — was *Rules and dice*), every check the plan calls for is
			 * decided at once against the ruleset's usual difficulty — no form.
			 */
			autoRoll: {
				type: "boolean",
				label: { en: "Decide checks at once" },
				description: {
					en: "When the rules decide, every check the plan calls for is decided at once, against the rules' usual difficulty, without asking you first."
				},
				default: false
			},
			/** 🚧 **Show outcomes** (D3): the shared field (`SHOW_OUTCOMES_FIELD`), under its kept key ⏳ `showDice`. */
			showDice: SHOW_OUTCOMES_FIELD
		}
	},
	// 🚧 No slots, no sheet (RF fix 8): the session's rules bring the party's
	// attributes; the GM's whisper and standing direction are the host's tool
	// state for the Lair (`registry/hostState.ts`), the room the scene's place.
	/**
	 * What the GM's own lines are called (R4, owner ruling 3, 2026-09-28): the
	 * GM is the narrator here, never in the scene, so their lines carry this
	 * name in the log and in every prompt. A session may rename it.
	 */
	playerLabel: { en: "Dungeon Master" },
	/**
	 * The **Castellan** (R6, D4): the dungeon's steward — the default and the
	 * fallback, so the pipeline's own voice and every unclaimed line carry its
	 * name. The **Oracle** (D4, R11): mechanics only — roll forms, dice, the
	 * knock's question. Declared, never seated: a line under a declared envoy
	 * needs no seat, and the Oracle takes no turns (the turn order admits no
	 * envoy) and gives no greeting.
	 */
	envoys: [
		{
			key: LAIR_CASTELLAN_KEY,
			name: { en: "Castellan" },
			description: {
				en: "The dungeon's steward. Plans the party's moves, narrates when you ask, drafts rooms, and talks the dungeon through with you in the Sanctum."
			},
			image: LAIR_CASTELLAN_IMAGE,
			prompts: { systemPrompt: LAIR_CASTELLAN_SYSTEM_PROMPT, postHistoryInstructions: LAIR_CASTELLAN_REMINDER },
			default: true,
			fallback: true,
			speaks: "in-turn",
			greeting: { channel: SANCTUM_CHANNEL, text: { en: LAIR_CASTELLAN_GREETING } }
		},
		{
			key: LAIR_ORACLE_KEY,
			name: { en: "Oracle" },
			description: {
				en: "Answers what the dice say. Asks you to call the rolls, reports how they came out, and knocks when the party reach a room nobody built. Never narrates."
			},
			image: LAIR_ORACLE_IMAGE,
			speaks: "in-turn"
		}
	],
	events: {
		/**
		 * The turn-order events (§4.5): a row landing or leaving, and a branch
		 * move — what changes whose turn it is under a plan.
		 */
		[sessionEvents.messageCompleted]: {},
		[sessionEvents.messageDeleted]: {},
		[sessionEvents.messageHidden]: {},
		[sessionEvents.sessionBranched]: {},
		[sessionEvents.messageRespond]: { required: true },
		[sessionEvents.sessionAction]: { open: true },
		/** A seat taken — `lair-welcome` tells the GM in the Sanctum (D5). */
		[sessionEvents.memberAdded]: {},
		[sessionEvents.memberRemoved]: {},
		/**
		 * Bound, because this genre puts forms to the **owner**: the knock and
		 * the roll forms. A form addressed to a person waits for their click;
		 * this event is the other arm, for a form addressed to a seat the AI
		 * portrays.
		 */
		[sessionEvents.formAddressed]: {}
	},
	/** The author's note is Story's alone (Chat's until 2026-10-19; owner ruling 2026-10-02, AN1). */
	omitWidgets: [coreWidgets.authorsNote],
	/**
	 * The GM's layout (its default, R71) and the **party's** — a guest's view,
	 * and the layout a guest's first open copies (`forGuests`): the story and
	 * the sheets, the rooms and the Party panel, no Sanctum and no scratchpad
	 * (D6, lane L5).
	 */
	layouts: [
		layout({ slug: "default", name: { en: "Lair" }, preset: LAIR_LAYOUT }),
		layout({
			slug: "party",
			name: { en: "Party" },
			description: { en: "A player's view: the story, the party's sheets, the rooms, and who the turn waits for. No Sanctum." },
			preset: LAIR_PARTY_LAYOUT,
			forGuests: true
		})
	],
	/** 🚧 The spec this genre's scenes are summarized with — the one that reads the Sanctum (live scenes §13). */
	summarize: { scene: LAIR_SUMMARIZE_SCENE_SPEC_ID }
})

/* ── Dungeon Crawler 🚧 ─────────────────────────────────────────────────────
 *
 * PLAN-dungeon-crawler-2026-10-14 (v1 and multiplayer built 2026-10-15). A
 * light, self-running table where the AI is the whole Dungeon Master and each
 * person only ever plays their character. The world is generated, not
 * written: no lorebook, nothing added to anybody's library. Published with
 * its create spec, its preset and its turn order (`coreGenres()`,
 * `TURN_ORDER_BY_GENRE`).
 */

/** @experimental */
export { DUNGEON_CRAWLER_GENRE_ID }

/**
 * 🚧 The Planner's instructions — its out-of-character voice in each player's
 * Planner lane. Its hidden per-turn bookkeeping is the respond spec's prompt,
 * which the spec lane writes.
 * @experimental
 */
export const DUNGEON_CRAWLER_PLANNER_SYSTEM_PROMPT = [
	"You are {{char}}, the Planner at a dungeon crawler's table. The AI runs the whole game; each person at the table plays only their own character, and the Narrator tells the story.",
	"You talk with one player at a time, out of character, in their own private channel. Before play you interview them: the kind of adventure, how hard, whether the goal is shared or secret, and who their character is. During play you answer their questions, note what they ask the story for, adjust their character when they ask, and take their preferences — and, at a table of several, their standing order.",
	"You keep the secrets of the world. Never reveal planning notes, hidden rooms, a secret goal or another player's private business, unless the session's owner asks you to reveal the planning notes.",
	"Be brief, warm and practical. Ask one question at a time."
].join("\n\n")

/**
 * 🚧 The Planner's opening line on the Planner channel: the tavern, leading
 * into the first interview question (the form's own heading). Interpolated at create (`{{char}}`,
 * `{{playerLabel}}`).
 * @experimental
 */
export const DUNGEON_CRAWLER_PLANNER_GREETING = [
	"Welcome in, {{playerLabel}}. Pull up a stool by the fire. I'm the {{char}}, and I set up the adventure you're about to walk into: the Narrator tells the story, and I keep the books and hold the secrets.",
	// AUDIT E: the Planner never claims to roll (the table does), and typing
	// "just play" did nothing — the form's button is what skips.
	"This channel is just the two of us, out of character. Ask me anything here, now or once we're playing. If you'd rather skip the questions, press **Just play** and I'll choose everything.",
	// The question itself is the form's heading, under this line (round 2:
	// said twice, in prose and as the heading).
	"Let's start with the world."
].join("\n\n")

/**
 * 🚧 The Narrator's instructions. The two lines it must never cross are the
 * genre's (feature 4, feature 6): it never plays a person's character, and it
 * never kills one without a roll.
 * @experimental
 */
export const DUNGEON_CRAWLER_NARRATOR_SYSTEM_PROMPT = [
	"You are {{char}}, the Narrator of a dungeon crawl. You describe the world, the places, the dangers and everyone in it who is not a player's character, including the companions travelling with the party.",
	"Never decide what a player's character does, says, thinks or feels. Tell what happens around them and because of what they did, then stop where they would choose.",
	"Never kill a player's character unless death's door decided it. Show the stakes before a risky moment, and let the result land honestly.",
	"Keep the story moving: within a few turns of a quiet moment, the party should find, fight or meet something."
].join("\n\n")

/** @experimental */
export const dungeonCrawlerGenre = genre(DUNGEON_CRAWLER_GENRE_ID, {
	name: { en: "Dungeon Crawler" },
	family: "adventure",
	members: "group",
	/**
	 * 🚧 What the Dungeon Crawler uses of a ruleset (PLAN-genre-restructure
	 * §11), confirmed against its delta grammar (`story.ts`,
	 * `DUNGEON_CRAWLER_DELTA_OPS`: add · spend · set · remove · hit · use ·
	 * traverse). Those ops are the handler's own, not a ruleset's verbs: what
	 * a ruleset must provide is what a `hit` and a `use` resolve through —
	 * harm, heal, cure, consume — and (🚧 RF fix 8) what it plays best with by
	 * tag: a health and a level to count, and the kinds of kit its heroes
	 * carry. Rules that lack one play it in words; nothing is locked.
	 */
	uses: {
		verbs: ["harm", "heal", "cure", "consume"],
		conditions: true,
		dice: "optional",
		// 🚧 RF fix 8: by tag, never a ruleset's own lists — the crawl counts a
		// hero's health and level, and hands out kit of these kinds; rules that
		// lack one play it in words (Freeform, Wherewithal).
		attributes: [HEALTH, expectation("level", "a level", "Heroes grow as they survive; without one, growth is told in words.", NUMBER_ATTRIBUTE_KINDS)],
		entryTypes: [
			expectation("weapon", "weapons", "A blow does what the weapon in hand says; without them, fights are told in words."),
			expectation("armour", "armour", "What someone wears turns blows aside."),
			expectation("gear", "gear", "Tools and lights open doors and light the dark."),
			expectation("consumable", "things used up", "Potions and rations run out as they are used."),
			expectation("casting", "spells", "A caster's magic is counted and spent."),
			expectation("feature", "what training lets someone do", "Each hero has something only they can do."),
			CONDITIONS
		],
		optional: {
			attributes: [expectation("class", "a calling", "What a hero is trained for shapes how they solve things.")],
			entryTypes: [expectation("class", "callings with a starting kit", "A new hero starts with their calling's kit; without one, they start with nothing.")],
			casting: true
		}
	},
	description: {
		en: "The AI is the whole Dungeon Master. Make a character, walk into a world it generates, and play only your own part — alone or with friends."
	},
	/** 🚧 The card's long copy (2026-10-23, PLAN-genres-seams S8). */
	about: {
		en: [
			"The AI is the whole Dungeon Master: make a character, walk into a world it generates, and play only your own part.",
			"Who's in the room: you and your character, and any friends you invite, each with a character of their own; companions you add travel with the party. The Planner talks with each player in their own channel, out of character; the Narrator tells the story.",
			"Who drives: the table. Before play the Planner asks you what kind of adventure, how hard, whether the goal is shared or secret, and who your character is. Then each round everyone says what their character does, and the Narrator tells what happens.",
			"What it costs: several model calls a round — the Planner keeps the books, then the Narrator tells the story — and one each time you talk to the Planner.",
			"Required: nothing. Optional: a persona to start your character from, and companions. The world is made as you play and kept in the session; nothing is added to your lorebooks or your library.",
			"Pick the Lair to run the dungeon yourself, or Story to tell a story without a Dungeon Master."
		].join("\n\n")
	},
	/** 🚧 Vis Itineris recommended, any ruleset allowed; the rules decide by default (rigour `scripts`, rulesets plan §13). */
	rulesets: { recommended: [visItinerisRuleset.id], default: visItinerisRuleset.id },
	rigour: { options: ["prose", "mechanics", "scripts"], default: "scripts" },
	shape: {
		scenario: false,
		tags: true,
		/**
		 * The characters you add join as companions, for this session only.
		 * None is fine. 🚧 The form says so (`hint`, 2026-10-18, the 100-turn
		 * walk #26: "Add the characters you'll talk to." read wrong here).
		 */
		characters: {
			min: 0,
			hint: { en: "No companions yet. Characters you add travel with the party, in the story only." }
		},
		/**
		 * One player seat per person (feature 16) — ⚠ not expressible: `max`
		 * bounds the session's total, and the SDK has no "per person". Left
		 * unbounded; a person's one seat is the seat machinery's (a player
		 * opens their own), not the shape's.
		 *
		 * `preselectDefault: false` — a persona here is only a seed for the
		 * character the Planner builds ("from my persona / work it out with
		 * me / surprise me"); the player is the seat. The new-session form
		 * starts with no persona chosen, so none is attached unless picked.
		 */
		personas: { min: 0, preselectDefault: false },
		/**
		 * **No `lorebook`**: absent is "this genre has no lorebook" — the
		 * session forms show no picker and the validator refuses one
		 * (`sessionGenres.ts`). `'optional'` would offer the picker. The world
		 * is generated and kept in the annex (★A).
		 *
		 * `lore: true` (2026-10-17): the world now lives in the session's
		 * notes (the phantom lorebook), so the loop writes lore. No scenes.
		 */
		writes: { lore: true, scenes: false },
		composer: "text",
		voice: "narrator",
		turnControls: {
			/** Continue resolves the round — early, when not everyone has declared (features 17, ★verification 2). */
			advance: true,
			pick: false,
			narrate: false,
			/** A story turn writes the Planner's books and the Narrator's line; undo takes all of it back (feature 12). */
			retake: true
		},
		channels: [
			{
				slug: "main",
				label: { en: "Story" },
				role: "conversation",
				/**
				 * No row regenerate on Story (owner ruling 2026-10-15): a story
				 * turn is taken again whole — Regenerate in the composer, the
				 * retake, with a new plan and new dice. A swipe or an extend
				 * re-voices the Narrator alone on the stored plan and rolls.
				 */
				messageVerbs: { retry: false }
			},
			{
				slug: PARLEY_CHANNEL,
				label: { en: "Planner" },
				role: "conversation",
				turnControls: { pick: false, narrate: false, retake: false },
				/**
				 * 🚧 One lane per person, core's (owner ruling 2026-10-17): the
				 * host opens each person's lane on its first `channel-lane`
				 * ask (create, welcome) and sends it to that person and the
				 * session's owner alone.
				 */
				lanes: "personal"
			},
			{ slug: TRAVELOGUE_CHANNEL, label: { en: "Journal" }, role: "folio", voice: "none" },
			/**
			 * 🚧 The table (PLAN-rulesets §30): the rolls, the stakes and the
			 * rest's reckoning, each anchored to the Narrator's line it
			 * belongs to — never Story's history, which the Narrator reads.
			 * Story draws them inline (`interleave: "table"`, the layout).
			 */
			{ ...TABLE_CHANNEL_DECL }
		],
		/** No card greetings: the Planner opens the session on the Planner channel. */
		greeting: { enabled: false },
		fields: {
			/** 🚧 **Honour mode** (owner ruling 2026-10-15): the shared field (`HONOR_MODE_FIELD`), a key core reads. */
			honorMode: HONOR_MODE_FIELD
		},
	},
	// 🚧 No slots, no sheet (RF fix 8): the session's rules bring a hero's
	// attributes (Vis Itineris's abilities, skills and spell points among
	// them); the crawl's standing orders, fate, time and piece lists are the
	// host's tool state for it (`registry/hostState.ts`).
	/** A person's line before their character has a name. */
	playerLabel: { en: "Adventurer" },
	envoys: [
		{
			key: DUNGEON_CRAWLER_PLANNER_KEY,
			name: { en: "Planner" },
			description: {
				en: "Sets up the adventure with you, keeps the books every turn, holds the world's secrets, and talks with you out of character in your Planner channel."
			},
			prompts: { systemPrompt: DUNGEON_CRAWLER_PLANNER_SYSTEM_PROMPT },
			speaks: "in-turn",
			/**
			 * Written by the create spec only while the Planner is seated —
			 * the preset seats it (`defaults.envoys`); the Narrator is the one
			 * `default`.
			 */
			greeting: { channel: PARLEY_CHANNEL, text: { en: DUNGEON_CRAWLER_PLANNER_GREETING } }
		},
		{
			key: DUNGEON_CRAWLER_NARRATOR_KEY,
			name: { en: "Narrator" },
			description: {
				en: "Tells the story. Never decides what your character does, says or feels."
			},
			prompts: { systemPrompt: DUNGEON_CRAWLER_NARRATOR_SYSTEM_PROMPT },
			default: true,
			fallback: true,
			speaks: "in-turn"
		}
	],
	events: {
		[sessionEvents.messageCompleted]: {},
		[sessionEvents.messageDeleted]: {},
		[sessionEvents.messageHidden]: {},
		[sessionEvents.sessionBranched]: {},
		[sessionEvents.messageRespond]: { required: true },
		[sessionEvents.sessionAction]: { open: true },
		[sessionEvents.memberAdded]: {},
		[sessionEvents.memberRemoved]: {},
		/** The bookkeeping moving (who is out of the round) re-runs the turn order. */
		[sessionEvents.annexChanged]: {},
		/** The interview's questions are forms addressed to players. */
		[sessionEvents.formAddressed]: {}
	},
	/** No lorebook, so nothing that reads one; and the Author's note is Story's alone. */
	omitWidgets: [
		coreWidgets.authorsNote,
		coreWidgets.chronicle,
		coreWidgets.places,
		coreWidgets.loreEntries
	],
	layouts: [
		layout({ slug: "default", name: { en: "Dungeon Crawler" }, preset: DUNGEON_CRAWLER_LAYOUT })
	]
})
