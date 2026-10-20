/**
 * Core's session genres (24 §3) — first-class declared objects with their own
 * ids. The genre owns its id (`core:genre/chat`); the create pipeline is its
 * required member, not its identity. Every session-event spec references the
 * genre object here, so the id is typed once and cannot be mistyped per spec.
 *
 * T6 moves this into `@serene-pub/core-catalog` with the specs; today it is
 * the in-repo half of that package.
 */
import { genre, layout, sessionEvents } from "@serene-pub/sdk"
import {
	DUNGEON_CRAWLER_LAYOUT,
	LAIR_LAYOUT,
	STORY_LAYOUT,
	STORY_WORLD_LAYOUT
} from "./layouts.js"
import type { AttributeSlotDecl, FieldDecl, TaskDecl } from "@serene-pub/sdk"
import { STORY_SHEET, STORY_SLOTS } from "./slots.js"
import { LAIR_SHEET, LAIR_SLOTS } from "./slots.js"
import { DUNGEON_CRAWLER_SHEET, DUNGEON_CRAWLER_SLOTS } from "./slots.js"
import {
	DUNGEON_CRAWLER_GENRE_ID,
	DUNGEON_CRAWLER_NARRATOR_KEY,
	DUNGEON_CRAWLER_PLANNER_KEY,
	PARLEY_CHANNEL,
	TRAVELOGUE_CHANNEL
} from "../genres/dungeon-crawler/names.js"
import { GUIDE_MASCOT_IMAGE } from "../seed/guideMascotImage.js"
// 🚧 The rulesets first: a genre recommending one nothing declares is refused.
import { freeformRuleset, visItinerisRuleset } from "./rulesets.js"
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

/* ── Background tasks ───────────────────────────────────────────────────── */

/**
 * 🚧 The session field that holds a session's **background tasks**
 * (`TaskSettingsV1`, `@serene-pub/sdk`'s `tasks.ts`): one grouped control the
 * host renders from the genre's `tasks`, grouped by when each runs. A preset
 * pins its values (`PresetDecl.settings.tasks`); the genre's pipelines branch
 * on what `core:task/resolve-tasks@1` resolves from it.
 * @experimental
 */
export const TASKS_FIELD: FieldDecl = {
	type: "tasks",
	label: { en: "What happens around a reply" },
	description: {
		en: "What the model does besides the reply: read the lorebook into it, note what it changed, file what happened every few turns. Each one is Full, Review (held for you to accept) or Off."
	}
}

/**
 * 🚧 The **Story** genre's background tasks (PLAN-genre-restructure §4,
 * ruled 2026-10-19), by trigger group. Keys are what a session stores its
 * choice under and what `core:spec/story-respond` branches on — never
 * respelled. Living's and Rule Based's defaults are these defaults; Minimal
 * pins every one off.
 * @experimental
 */
export const STORY_TASKS: readonly TaskDecl[] = Object.freeze([
	// ── In the reply: no extra call. ──
	{
		key: "lore-retrieval",
		group: "reply",
		kind: "prose",
		default: "full",
		reviewable: false,
		label: { en: "Read the lorebook" },
		description: { en: "Finds the lorebook entries the scene calls for and puts them in the reply's context." }
	},
	{
		key: "scene-reading",
		group: "reply",
		kind: "prose",
		default: "full",
		reviewable: false,
		label: { en: "Read the scene" },
		description: {
			en: "Puts where the story is — the place, what it is like, the ways out — into the reply's context. Writes nothing."
		}
	},
	// ── After each turn: one extra call when anything here is on. ──
	{
		key: "attributes",
		group: "reckoning",
		kind: "both",
		default: "full",
		label: { en: "Keep the sheets" },
		description: { en: "Notes what the reply changed about health, mood, belongings and the place, and updates the sheets." }
	},
	{
		key: "time",
		group: "reckoning",
		kind: "prose",
		default: "full",
		label: { en: "Move the clock" },
		description: { en: "Moves the story clock by as much time as the reply took." }
	},
	{
		key: "conditions",
		group: "reckoning",
		kind: "script",
		default: "full",
		label: { en: "Track conditions" },
		description: { en: "Puts conditions on and takes them off: hurt, tired, poisoned, inspired." }
	},
	// ── Every few turns: one batched call. ──
	{
		key: "summary",
		group: "sweep",
		kind: "prose",
		default: "full",
		label: { en: "Summarize the story" },
		description: { en: "Files a summary of what happened in the lorebook's history." }
	},
	{
		key: "lore",
		group: "sweep",
		kind: "prose",
		default: "full",
		label: { en: "Add to the lore" },
		description: { en: "Files new facts the story established as lorebook entries." }
	},
	{
		key: "cast",
		group: "sweep",
		kind: "prose",
		default: "full",
		label: { en: "Note new people" },
		description: { en: "Files the people the story introduced as lorebook entries." }
	},
	{
		key: "relationships",
		group: "sweep",
		kind: "prose",
		default: "off",
		label: { en: "Track relationships" },
		description: { en: "Proposes how the characters now stand with each other, for you to look over." }
	},
	{
		key: "world-state",
		group: "sweep",
		kind: "prose",
		default: "full",
		label: { en: "Keep the world" },
		description: { en: "Updates the world's state from what happened: where the story is, the time of day, the weather." }
	},
	{
		key: "scenes",
		group: "sweep",
		kind: "prose",
		default: "off",
		label: { en: "File the places" },
		description: { en: "Files each place the story used as a place in the lorebook." }
	},
	{
		key: "goals",
		group: "sweep",
		kind: "prose",
		default: "off",
		label: { en: "Track goals" },
		description: { en: "Keeps a running note of what the characters are after and how close they are." }
	},
	// ── On an event. ──
	{
		key: "image-on-scene",
		group: "events",
		kind: "prose",
		default: "off",
		// A picture is drawn or it is not: nothing to hold for review (lane 2).
		reviewable: false,
		label: { en: "Picture each new scene" },
		description: { en: "Draws a picture when the scene changes, with the Scene action." }
	},
	{
		key: "places-on-move",
		group: "events",
		kind: "both",
		default: "full",
		label: { en: "Describe new places" },
		description: { en: "When the story moves somewhere new, files the place and its ways out." }
	},
	{
		key: "timed-expiry",
		group: "events",
		kind: "script",
		default: "full",
		label: { en: "End what runs out" },
		description: { en: "Ends conditions and effects when their time is up." }
	},
	{
		key: "goal-reached",
		group: "events",
		kind: "prose",
		default: "off",
		// Saying so is news, not a change to accept (lane 2).
		reviewable: false,
		label: { en: "Mark goals reached" },
		description: { en: "When a goal in the goals note is ticked, says so in the story and tells everyone in the session." }
	},
	// ── Extra voices: more replies per turn. ──
	{
		key: "side-cast",
		group: "voices",
		kind: "prose",
		default: "off",
		reviewable: false,
		label: { en: "Let others speak up" },
		description: {
			en: "After everyone has had their turn, one more character may speak up on their own before it is yours again."
		}
	},
	{
		key: "narrator-interjections",
		group: "voices",
		kind: "prose",
		default: "off",
		reviewable: false,
		label: { en: "Narrator asides" },
		description: { en: "After everyone has had their turn, the narrator may add a line of its own before it is yours again." }
	}
])

/** 🚧 Every Story task key, in declaration order — what a preset pins. @experimental */
export const STORY_TASK_KEYS: readonly string[] = Object.freeze(STORY_TASKS.map((t) => t.key))

/* ── Story ──────────────────────────────────────────────────────────────── */

/**
 * 🚧 **Story** (PLAN-genre-restructure R4, 2026-10-19): the roleplay Chat and
 * Adventure folded into one genre. Its reply is today's Chat reply, byte for
 * byte — the prompts, the context template and the variable templates
 * (ruled) — and the world keeps itself behind it as far as the session's
 * **preset** says: Minimal (one call, nothing moves), Living (one after-turn
 * call keeps the sheets, the clock and the conditions; a sweep every few
 * turns files what happened) and Rule Based (Living, with the ruleset's
 * scripts resolving the numbers). One pipeline, branching on the session's
 * background tasks (`STORY_TASKS`, `core:task/resolve-tasks@1`).
 *
 * Adventure's own reply — a planner, a narrator, a voice per cast member and a
 * state keeper, four calls and more a turn — was retired with the genre: its
 * Look, Rest, Ask and Answer actions moved here.
 * @experimental
 */
export const STORY_GENRE_ID = "core:genre/story"

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
			"Who drives: you do. On Living the world keeps itself: after each reply it notes what changed — health, time, conditions — and every few turns it files what happened in your lorebook.",
			"What it costs: one model call a turn on Minimal; two on Living and Rule Based (the reply, then a short look at what changed), plus a summary every few turns.",
			"Required: nothing. Optional: a lorebook for the world, and a ruleset if you want rules and numbers.",
			"Pick Chat to talk to the model as itself, the Lair to run the game yourself, or the Dungeon Crawler to let the AI run it.",
			"Minimal: just the story, nothing tracked. Living: the world keeps itself, in words. Rule Based: Living, with a ruleset's rules deciding the numbers."
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
		optional: { slots: ["hp", "conditions"], conditions: true, casting: true }
	},
	tasks: STORY_TASKS,
	/** 🚧 Freeform first and by default; Vis Itineris for numbers and dice; any ruleset allowed. */
	rulesets: { recommended: [freeformRuleset.id, visItinerisRuleset.id], default: freeformRuleset.id },
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
		 * difficulty under Advanced, and the background tasks. Adventure's
		 * *Trust the narrator* is gone: its meaning is a task's **Review**
		 * mode now.
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
					en: "How hard the world pushes back. Read when the world keeps the sheets after each reply."
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
			tasks: TASKS_FIELD
		}
	},
	/** Adventure's eight, as the sheet a session may track (`STORY_SHEET`). */
	slots: STORY_SLOTS as unknown as AttributeSlotDecl[],
	sheets: [STORY_SHEET],
	// Its sessions may carry in their world's attributes and add their own.
	customAttributes: "allow",
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
 * connection. Not offered: code execution, a shell, app administration —
 * those are the Guide's, and the Guide stays solo.
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

/** 🚧 Chat's background tasks: the lorebook read into the reply, and a memory it may keep (off; ★K). @experimental */
export const CHAT_TASKS: readonly TaskDecl[] = Object.freeze([
	{
		key: "lore-retrieval",
		group: "reply",
		kind: "prose",
		default: "full",
		reviewable: false,
		label: { en: "Read the lorebook" },
		description: { en: "Finds the lorebook entries your message calls for and puts them in the reply's context." }
	},
	{
		key: "memory",
		group: "sweep",
		kind: "prose",
		default: "off",
		label: { en: "Remember things" },
		description: { en: "Every few turns, keeps notes of what you told it in a notes lorebook, so it remembers next time." }
	}
])

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
	tasks: CHAT_TASKS,
	shape: {
		/** Nobody from the library sits here: the one speaker is the Assistant (§1-8). */
		characters: { min: 0, max: 0 },
		/** No persona either: the person speaks as themselves (a cardless seat). */
		personas: { min: 0, max: 0 },
		lorebook: "optional",
		composer: "text",
		voice: "character",
		/**
		 * Lore writes only through the `memory` task or the `lorebook-write`
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
			},
			tasks: TASKS_FIELD
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
	 * 🚧 Solo (R2 ruling 3, 2026-10-19): never a group session — the Guide's
	 * tools reach the app, so guests, invites and lanes are refused for it.
	 */
	members: "solo",
	description: {
		en: "Talk to Serene, Serene Pub's guide, about the app itself — no characters, no story; just questions and answers grounded in the docs."
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
		 * 🚧 The tools Serene may use (2026-10-19): the web tool alone, on by
		 * default. Web search is offered to the Guide and Chat and to no other
		 * genre (R4).
		 */
		fields: {
			tools: {
				type: "string[]",
				label: { en: "Tools" },
				description: { en: "What Serene may use while she answers." },
				of: ["web"],
				members: [{ key: "web", label: { en: "Search the web" } }],
				default: ["web"]
			}
		}
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
 * The **reverse dungeon crawler** (plans/genres §3): the person at the keyboard
 * *is* the dungeon. They build the rooms, they steer the narration, and an AI
 * party delves into what they made.
 *
 * ## The one new posture, and where it lives
 *
 * The composer's text is **direction, not a line**. Nothing in the shape says
 * so and nothing needs to: `personas: { max: 0 }` already means the user is
 * prose rather than a participant, and what that prose *means* is the respond
 * spec's to decide — its planner reads `$.input.text` as instructions from the
 * dungeon's master and the seed line never carries the user. A shape value for
 * it would be a fourth way to say what two existing ones already say.
 *
 * ## The pipeline's own voice is the Castellan's (R5, R6, owner 2026-09-28)
 *
 * `voice: 'narrator'` stays: the turn order's null entry, `carryOnEntry`, the
 * Narrate press and the seed line all key on it. It no longer means a
 * narrator writes each turn — **the person is the narrator** here. The voice
 * is named by the genre's **fallback envoy**, the **Castellan**, the
 * dungeon's steward: every line nobody claims, and the null entry itself,
 * carry its name (`ownVoiceName`), seated or not.
 *
 * ## The Sanctum (R6)
 *
 * A second channel, `sanctum`: the table outside the story, where the
 * Castellan and the Dungeon Master talk — ideas, corrections, the map ahead.
 * Its composer offers Continue and Narrate but neither Pick who speaks nor
 * Regenerate the last turn (a Castellan reply there is one row, which keeps
 * the row regenerate with swipes). The Castellan greets every new session
 * there with a declared line (`LAIR_CASTELLAN_GREETING`), written by
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

/** The Lair's out-of-fiction channel slug (R6). @internal */
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

/**
 * The Castellan's instructions for **Sanctum talk** (R6) — out of the
 * fiction, with the {{playerLabel}}. Interpolated by the envoy road's
 * context builder: `{{char}}` is the Castellan, `{{knownLocations}}` /
 * `{{locationEntry}}` are the rooms the listing holds and the one the party
 * stand in, `{{recentStory}}` is the story's latest rows as prose. Asked to
 * narrate, it says what it would play and points at **Narrate** (the plan's
 * QA (a)): the person, not the model, decides when the story moves.
 * `{{sanctumSteers}}` (the genre field, R13) says whether this talk shapes
 * the next turn, and `{{scratchpad}}` is its own running notes (the annex
 * field `castellan-scratchpad`, R13).
 * @internal
 */
export const LAIR_CASTELLAN_SYSTEM_PROMPT = [
	"You are {{char}}, the steward of a dungeon, talking with the {{playerLabel}}: the person who built this dungeon and narrates it. This conversation is the Sanctum, your table outside the story. Nothing said here happens in the dungeon, and the party never hear it.",
	"The party delving the dungeon: {{characterNames}}. They speak and act for themselves.",
	"Your work: you run the dungeon's side of each turn. You plan the party's moves, keep the books on their health, their haul and where they stand, and knock when they reach a room nobody has built yet. The {{playerLabel}} narrates: what they write in the story is what the dungeon does. You suggest; the {{playerLabel}} decides.",
	"Here you help them run their dungeon: brainstorm rooms, traps and treasure, plan what lies ahead, answer questions about the party and the story so far, and take corrections without argument.",
	"{{#if knownLocations}}The rooms the dungeon holds: {{knownLocations}}.{{else}}The dungeon holds no rooms yet.{{/if}} Name only these as rooms that exist. Anything else is an idea until the {{playerLabel}} builds it.{{#if locationEntry}}\n\nThe room the party are in:\n{{locationEntry}}{{/if}}{{#if recentStory}}\n\nThe story so far, most recent last:\n{{recentStory}}{{/if}}",
	"{{#if sanctumSteers}}What you two settle here shapes the next turn.{{else}}This is brainstorming. Nothing here reaches the story unless they Nudge, file a room, or press Narrate here.{{/if}}{{#if scratchpad}}\n\nYour scratchpad, the running notes you keep here (rooms planned, intentions, corrections):\n{{scratchpad}}{{/if}}",
	"Never write a line for any of the party, and never narrate the story here. If the {{playerLabel}} asks you to narrate what happens next, say in a sentence or two what you would play, and tell them that pressing Narrate will play it.",
	"Talk plainly, out of character, and briefly: a few sentences unless you are asked for more."
].join("\n\n")

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
	"I run the dungeon's side of each turn. I plan the party's moves, keep the books on their health and their haul, and when they reach a room you haven't built yet, I'll knock and ask you to describe it.",
	"This is the Sanctum, our table outside the story. The party never hear what we say here. Use it to brainstorm, plan rooms before they're needed, fix a mistake, or ask me to narrate what happens next.",
	"To begin, describe where the party stands in the story, or press **Continue** there and I'll bring them in."
].join("\n\n")

/** @experimental */
export const lairGenre = genre(LAIR_GENRE_ID, {
	name: { en: "Lair" },
	family: "adventure",
	members: "group",
	/**
	 * 🚧 What the Lair uses of a ruleset (PLAN-genre-restructure §11): nothing
	 * it cannot do without — its keeper sets values and moves items itself,
	 * and the ruleset's health, conditions and casting are read where they
	 * exist.
	 */
	uses: {
		verbs: [],
		dice: "optional",
		optional: { slots: ["hp"], conditions: true, casting: true }
	},
	description: {
		en: "You are the dungeon. Build the rooms, point the party at them, and watch an AI delve into what you made."
	},
	/** 🚧 Vis Itineris recommended, any ruleset allowed; rules without dice by default (rulesets plan §13). */
	rulesets: { recommended: [visItinerisRuleset.id], default: visItinerisRuleset.id },
	rigour: { options: ["prose", "mechanics", "scripts"], default: "mechanics" },
	shape: {
		/** The settings form's sections (PLAN-turn-order §4.11): declared, never automatic. */
		scenario: true,
		tags: true,
		/** The party. One delver is a thin game; none is no game at all. */
		characters: { min: 1 },
		/**
		 * **Nobody plays a person here**, and that is the genre. The dungeon's
		 * master is not in the scene: what they type is direction, and a persona
		 * would put them on the floor with the party they are supposed to be
		 * hunting.
		 */
		personas: { min: 0, max: 0 },
		/**
		 * Required, and it is the dungeon itself: one entry per location, each
		 * naming the ways out of it. A Lair with no lorebook is a party in an
		 * empty room with no doors.
		 */
		lorebook: "required",
		/**
		 * Written on purpose (R-B), and the one genre so far that says so. The
		 * *Build room* action adds a location entry, and a room the party finds
		 * that nobody built becomes one. A genre whose loop writes lore has to
		 * declare it, or the write site refuses it.
		 */
		writes: { lore: true, scenes: true },
		composer: "text",
		/** The seed line carries the narrator; the cast get their own calls. */
		voice: "narrator",
		/**
		 * No prefill extend (lair pass D4): a composed plan-narrate-voices
		 * reply cannot be extended mid-sentence, and the respond spec has no
		 * extend tail. The composer's Continue — the turn control that
		 * fires the next turn (`turnControls.advance`) — stays on.
		 */
		messageVerbs: { extend: false },
		/**
		 * The turn controls (lair pass B8, owner rulings D2/D3; R12): Continue,
		 * Pick who speaks and Narrate, all always present. The Lair is cast
		 * only (owner 2026-09-28): the party speak for themselves, so there is
		 * always somebody to pick, and the pipeline's own voice can be fired
		 * on its own.
		 *
		 * And **Regenerate the last turn** (`retake`, R2, owner 2026-09-28): a
		 * Lair turn writes several rows — the planner's, then each delver's —
		 * so the composer's Regenerate deletes that turn's yield and takes it
		 * again, rather than rewriting its last row alone.
		 */
		turnControls: {
			advance: true,
			pick: true,
			narrate: true,
			retake: true
		},
		/**
		 * The story on `main`, and the **Sanctum** beside it (R6): the table
		 * outside the story, where the Castellan talks with the person. A
		 * Castellan reply there is one row, so it keeps the ordinary row
		 * regenerate and offers no retake; and Pick who speaks has nobody to
		 * pick at a table the party never sit at. Continue answers a pending
		 * Sanctum line; Narrate stays, because it is how the person asks the
		 * Castellan to play what they just talked through.
		 *
		 * ⚠ **No `voice` of its own.** The genre's `narrator` voice seeds
		 * under the own voice's name, which IS the Castellan, so the seed is
		 * right either way; and a channel whose voice differed from the
		 * genre's would make the Lair shape channels (`channelShapingOf`),
		 * stamping `main`'s voice on every regenerate and seeding a delver's
		 * re-voice under the Castellan. `main` stays byte-identical.
		 */
		channels: [
			"main",
			{
				slug: SANCTUM_CHANNEL,
				label: { en: "Sanctum" },
				role: "conversation",
				turnControls: { pick: false, retake: false }
			}
		],
		/**
		 * Nobody to greet with from the cards: a dungeon does not welcome the
		 * party. Its steward welcomes its master — the Castellan's declared
		 * greeting (`EnvoyDecl.greeting`), written on the Sanctum by
		 * `lair-create`.
		 */
		greeting: { enabled: false },
		/**
		 * 🚧 Where the story is (live scenes §15 G2): the room the party stand
		 * in, the world's `location` — Adventure's place, for the same reason.
		 * The Lair's own boundary trigger (a new floor) rides its
		 * summarize-scene spec (`genres/lair/summarizeScene.ts`, ★9).
		 */
		scenes: { place: { stateKey: "location" } },
		// No turn-order swaps: the planner decides who speaks — see Adventure's note.
		fields: {
			/**
			 * The Lair's own levers. It has no turn-style field (R12, owner
			 * 2026-09-28): the Lair is cast only, so the party speak every
			 * turn — how, is `partySpeech`. A stored `turnStyle` is an
			 * undeclared key, and undeclared keys are not fields.
			 */
			tone: {
				type: "enum",
				label: { en: "Tone" },
				description: {
					en: "How the narrator writes. Interpolated into the narrator's own instructions."
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
			 * **How the party speak** (owner ruling 2026-09-30) — the
			 * Lair's party speech, read by `lair-respond`'s `speech`
			 * junction:
			 *
			 *  · `each` (the default) — each delver speaks: every delver
			 *    the plan names takes a **character turn** of their own, in
			 *    the plan's order — a run each, fired off the turn order,
			 *    streaming their line, reading only their own private lore
			 *    and keeping only their own stats. Pick who speaks gives the
			 *    picked delver that same turn.
			 *  · `castellan` — the Castellan speaks for the party: one call
			 *    writes every named delver's lines for the turn, reading
			 *    only lore everyone may know and hearing no whisper. Pick
			 *    who speaks asks it for that delver's line alone.
			 *
			 * Nobody leads: the planner's order is the order they speak in.
			 */
			partySpeech: {
				type: "enum",
				label: { en: "How the party speak" },
				description: {
					en: "Each delver speaks: every delver the Castellan plans to speak takes a turn of their own, in their own voice, knowing only what they know. Castellan speaks for the party: one call writes the whole party's lines, knowing only what everyone may know — fewer calls, one voice."
				},
				of: ["each", "castellan"],
				members: [
					{ key: "each", label: { en: "Each delver speaks" } },
					{ key: "castellan", label: { en: "Castellan speaks for the party" } }
				],
				default: "each",
				quick: true
			},
			/**
			 * Whose bookkeeping is trusted (relabelled 2026-09-28, lair re-plan
			 * R8 follow-up): the person is the narrator here, so the field
			 * never meant trusting a narrator — it is whether the Castellan's
			 * stat changes land without asking. The key stays `trustNarrator`:
			 * it is the stored per-session value, and Adventure's and
			 * Whodunit's keeper junctions read the same key.
			 */
			trustNarrator: {
				type: "boolean",
				label: { en: "Apply the Castellan's stat changes without asking" },
				description: {
					en: "The Castellan keeps the books after each turn: health, the haul, where the party stand. On, its changes land as it makes them. Off, each one waits for you to accept it. Off is the safe default: a model that can set a number silently can rewrite the story between two messages."
				},
				default: false,
				quick: true
			},
			/**
			 * **Sanctum talk steers the story** (lair re-plan R13, owner F3 and
			 * QB 2026-09-28): on by default. On, the Castellan's planner and
			 * its narration read the Sanctum talk since the story's last line
			 * — and its scratchpad — as plans, not facts. Off, the Sanctum is
			 * for brainstorming, and only the explicit crossings reach the
			 * story: Nudge, a filed room, and Narrate pressed in the Sanctum
			 * (which plays that talk once, switch or no switch).
			 */
			sanctumSteers: {
				type: "boolean",
				label: { en: "Sanctum talk steers the story" },
				description: {
					en: "When on, what you and the Castellan discuss since the last turn shapes the next one. When off, the Sanctum is for brainstorming: only Nudge, a filed room, and Narrate pressed in the Sanctum reach the story."
				},
				default: true,
				quick: true
			}
		}
	},
	/** Adventure's cast four plus the whisper, and the dungeon's own four. */
	slots: LAIR_SLOTS as unknown as AttributeSlotDecl[],
	sheets: [LAIR_SHEET],
	// Its sessions may carry in their world's attributes and add their own.
	customAttributes: 'allow',
	/**
	 * What the person's own lines are called (R4, owner ruling 3,
	 * 2026-09-28): the person is the narrator here, and nobody plays a
	 * persona, so their lines carry this name in the log and in every prompt.
	 * A session may rename it ("Game Master").
	 */
	playerLabel: { en: "Dungeon Master" },
	/**
	 * The **Castellan** (R6, owner F1/F2 2026-09-28): the dungeon's steward.
	 * It runs the dungeon's turns, narrates when fired, and talks with its
	 * master in the Sanctum. The **fallback** envoy, so the pipeline's own
	 * voice and every line nobody claims carry its name, seated or not
	 * (`ownVoiceName`). Seated by default, and never a Pick candidate: the
	 * turn-order pool is `NOBODY`, so its turns come from the strategy's
	 * null entry and its narrations from Narrate.
	 */
	envoys: [
		{
			key: LAIR_CASTELLAN_KEY,
			name: { en: "Castellan" },
			description: {
				en: "The dungeon's steward. Plans the party's moves, keeps the books, knocks at rooms you haven't built, and talks the dungeon through with you in the Sanctum."
			},
			image: LAIR_CASTELLAN_IMAGE,
			prompts: { systemPrompt: LAIR_CASTELLAN_SYSTEM_PROMPT },
			default: true,
			fallback: true,
			speaks: "in-turn",
			greeting: { channel: SANCTUM_CHANNEL, text: { en: LAIR_CASTELLAN_GREETING } }
		}
	],
	events: {
		/**
		 * The turn-order events (§4.5). Four, not nine: this genre's order
		 * is one narrator entry or none, decided by whether the newest
		 * visible row is a person's, so only a row landing or leaving
		 * (deleted, hidden, shown) and a branch move it. A cast change or a
		 * settings save cannot (lair pass B9).
		 */
		[sessionEvents.messageCompleted]: {},
		[sessionEvents.messageDeleted]: {},
		[sessionEvents.messageHidden]: {},
		[sessionEvents.sessionBranched]: {},
		[sessionEvents.messageRespond]: { required: true },
		[sessionEvents.sessionAction]: { open: true },
		[sessionEvents.memberAdded]: {},
		[sessionEvents.memberRemoved]: {},
		/**
		 * Bound here, unlike Adventure's optional use of it, because this genre
		 * puts a form to the **owner** when the party knocks at a room that does
		 * not exist. A form addressed to a person waits for their click; this
		 * event is the other arm, for the day a Lair session seats an AI in a
		 * seat a form is addressed to.
		 */
		[sessionEvents.formAddressed]: {}
	},
	/** The layout this genre ships (R71): its default. */
	/** The author's note is Story's alone (Chat's until 2026-10-19; owner ruling 2026-10-02, AN1). */
	omitWidgets: [coreWidgets.authorsNote],
	layouts: [layout({ slug: "default", name: { en: "Lair" }, preset: LAIR_LAYOUT })],
	/** 🚧 The spec this genre's scenes are summarized with — the one that reads the Sanctum (live scenes §13). */
	summarize: { scene: LAIR_SUMMARIZE_SCENE_SPEC_ID }
})

/* ── Dungeon Crawler 🚧 ─────────────────────────────────────────────────────
 *
 * PLAN-dungeon-crawler-2026-10-14. A light, self-running table where the AI is
 * the whole Dungeon Master and each person only ever plays their character.
 * The world is generated, not written: no lorebook, nothing added to anybody's
 * library. Foundation only so far — the declaration, its names, its slots, its
 * layout and its turn order. ⚠ Not yet in `coreExtension().genres` nor in
 * `TURN_ORDER_BY_GENRE`: a genre is listed from its published create spec, and
 * a turn-order spec cannot be published before it, so the create lane adds
 * both, with a preset, in the same change.
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
	 * harm, heal, cure, consume — and the repertoires its kits hand pieces
	 * out of (`DUNGEON_CRAWLER_REPERTOIRE_SLOTS`, ways out excepted: a way out
	 * is written inside its place). Health, level and class are the genre's
	 * own slots, read from the ruleset where it has them.
	 */
	uses: {
		verbs: ["harm", "heal", "cure", "consume"],
		pieces: ["weapons", "armour", "gear", "consumables", "spells", "features", "conditions"],
		conditions: true,
		dice: "optional",
		optional: { slots: ["hp", "level", "character-class"], casting: true }
	},
	description: {
		en: "The AI is the whole Dungeon Master. Make a character, walk into a world it generates, and play only your own part — alone or with friends."
	},
	/** 🚧 Vis Itineris recommended, any ruleset allowed; rules and dice by default (rulesets plan §13). */
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
			/**
			 * 🚧 **Honour mode** (owner ruling 2026-10-15). A key core reads,
			 * the way it reads `autoAdvance`: a genre that declares it keeps
			 * its story turns — an older turn on a channel that offers the
			 * retake is never deleted (retake from the latest instead), and
			 * the latest is deleted by the session owner alone, only while
			 * this is on (`turnDeleteVerdict`, app `messages/verbs.ts`). The
			 * retake is the owner's whatever it says. 🚧 And (2026-10-16) a
			 * player edits their own sheet by hand only while this is on; the
			 * host always may, and the pipeline is untouched
			 * (`assertSessionOwner`, app `state/write.ts`).
			 */
			honorMode: {
				type: "boolean",
				label: { en: "Honour mode" },
				description: { en: "Lets the host delete the latest turn, and lets players edit their own sheets by hand. Off: turns can only be retaken." },
				default: false
			}
		},
	},
	slots: DUNGEON_CRAWLER_SLOTS as unknown as AttributeSlotDecl[],
	sheets: [DUNGEON_CRAWLER_SHEET],
	customAttributes: "allow",
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
	/** No lorebook, so nothing that reads one; and the Author's note is Chat's. */
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
