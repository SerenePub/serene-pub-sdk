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
	ADVENTURE_LAYOUT_V2,
	LAIR_LAYOUT_V2,
	WHODUNIT_LAYOUT_V2,
	WRITING_ROOM_LAYOUT_V2
} from "./ui/sessions/layouts.js"
import type { AttributeSlotDecl, FieldDecl } from "@serene-pub/sdk"
import { ADVENTURE_SHEET, ADVENTURE_SLOTS } from "./slots.js"
import { LAIR_SHEET, LAIR_SLOTS } from "./slots.js"
/* ── Whodunit (plans/genres §4; U4) ──────────────────────────────────── */
import { WHODUNIT_SHEET, WHODUNIT_SLOTS } from "./slots.js"

/**
 * Auto-advance (PLAN-turn-order §4.6, R16): whether the head turn fires by
 * itself after a send, and how far.
 *
 * ONE `FieldDecl`, declared here and placed in a genre's `fields` — not a
 * column, not a metadata key, not a bespoke control. It is read from the
 * settings document like any other field, rendered by the session settings
 * form like any other field, and stored in `sessions.genre_fields` like any
 * other field. Core's layer of the cascade (§4.13) is `next`; chat
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

/** The one id every default session carries (was the create spec's slug). @experimental */
export const CHAT_GENRE_ID = "core:genre/chat"

/** @public */
export const chatGenre = genre(CHAT_GENRE_ID, {
	name: { en: "Chat" },
	family: "chat",
	description: {
		en: "The standard roleplay chat — bring characters and personas in any mix, attach a lorebook if you like, and type to talk."
	},
	/**
	 * The standard chat's shape (19 §1) — today's behaviour, stated. Both
	 * participant systems optional and unbounded above, lorebooks attach when
	 * wanted, the composer is a text box, the seed line carries the speaking
	 * character's name, and a new chat seeds the cast's greetings on `main`.
	 */
	shape: {
		characters: { min: 0 },
		personas: { min: 0 },
		lorebook: "optional",
		composer: "text",
		voice: "character",
		greeting: { enabled: true, channel: "main" },
		// No `turnOrder` here (retired 2026-09-23, R28): the Turn order
		// control is `core:spec/chat-turn-order`'s `strategy` node and the
		// swaps it declares (turnOrder.ts), like any other swappable node.

		/** The session settings form's own sections (§4.11): declared, never automatic. */
		scenario: true,
		tags: true,
		/**
		 * Chat defaults to **`round`** (R16): a send runs the whole round —
		 * every prepared turn in order — rather than one reply. The other
		 * core genres declare no control and resolve to core's `next`
		 * through the cascade (§4.13).
		 */
		fields: {
			autoAdvance: { ...AUTO_ADVANCE_FIELD, default: "round" },
			// Chat's turn order has the model path (R41, M4): rules by default.
			turnMode: TURN_MODE_FIELD,
			characterDetail: CHARACTER_DETAIL_FIELD
		}
	},
	/**
	 * The event surface (24 §5): which session events exist for this genre
	 * and which a preset must bind. `session-created` is implicitly required
	 * for every genre.
	 */
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
	}
})

/* ── Adventure ──────────────────────────────────────────────────────────── */

/**
 * The flagship genre (DESIGN-adventure-genre.md): chat with a **narrator who
 * plans, a cast who speak for themselves, and a state-keeper who writes the
 * numbers down.** Four agents, one turn, one receipt.
 *
 * The one-LLM-call rule is Chat's, not this one's. Everything a player sees on
 * screen — bars, the world strip, the ledger under a reply — is a
 * consequence of the state-keeper's proposals, never of prose parsing.
 * @experimental
 */
export const ADVENTURE_GENRE_ID = "core:genre/adventure"

/** @experimental */
export const adventureGenre = genre(ADVENTURE_GENRE_ID, {
	name: { en: "Adventure" },
	family: "adventure",
	description: {
		en: "A narrated world with a cast that acts on its own, stats and an inventory that change as you play, and a story clock that moves."
	},
	shape: {
		/** The settings form's sections (PLAN-turn-order §4.11): declared, never automatic. */
		scenario: true,
		tags: true,
		/**
		 * At least one of each, unlike Chat. A world with nobody in it has no
		 * cast for the voices step to give a turn to, and no persona means
		 * nothing for the planner to plan around.
		 */
		characters: { min: 1 },
		personas: { min: 1 },
		/**
		 * Required, and it is the one hard requirement this genre adds. The
		 * world lives in the lorebook: places, the items an inventory
		 * references, the history the timeline is read from. An adventure without one
		 * is a narrator describing nothing.
		 */
		lorebook: "required",
		composer: "text",
		/**
		 * The seed line carries the narrator, not a character. A turn here is
		 * scene prose first and speech second, and the cast get their own
		 * generate calls in the voices step rather than owning the reply.
		 */
		voice: "narrator",
		greeting: { enabled: true, channel: "main" },
		// No turn-order swaps: the planner decides who speaks, so no Turn order
		// control renders (PLAN-turn-order §4.5) — the narrator turn-order
		// spec seats one narrator entry per send.
		/**
		 * Session-level fields, and deliberately few. Each one is read by a
		 * shipped prompt or by the spec's own wiring — a field nothing reads is
		 * a control that looks configured and is not.
		 */
		fields: {
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
			difficulty: {
				type: "enum",
				label: { en: "Difficulty" },
				description: {
					en: "How hard the world pushes back. The planner reads it when it decides what a scene costs."
				},
				of: ["story", "normal", "hard"],
				members: [
					{ key: "story", label: { en: "Story" } },
					{ key: "normal", label: { en: "Normal" } },
					{ key: "hard", label: { en: "Hard" } }
				],
				default: "normal",
				quick: true
			},
			trustNarrator: {
				type: "boolean",
				label: { en: "Trust the narrator" },
				description: {
					en: "Apply the state-keeper's changes as they are made, instead of holding each one for you to accept. Off is the safe default: a model that can set a number silently can rewrite the fiction between two messages."
				},
				default: false,
				quick: true
			},
			// Read by the voices step and the narrator's context alike: every
			// prompt built through `build-template-context@1` trims the cast's
			// cards by it.
			characterDetail: CHARACTER_DETAIL_FIELD
		}
	},
	/**
	 * The declarations, not ids (`GenreDecl.slots`): a genre that named a slot
	 * nothing declared would be a session whose stats validate against nothing.
	 */
	slots: ADVENTURE_SLOTS as unknown as AttributeSlotDecl[],
	/**
	 * The same eight again, as the one bundle an owner can be given in a
	 * gesture. `genreSlots` dedups the union by id, so declaring both changes
	 * nothing a session has — it is what lets the sheet arrive without the
	 * list above it changing shape.
	 */
	sheets: [ADVENTURE_SHEET],
	// Its sessions may carry in their world's attributes and add their own.
	customAttributes: 'allow',
	/**
	 * No enabled-when defaults (plans/29 R-15; U5e). A `look` default over
	 * `state.world.location` was shipped and withdrawn the same day (review
	 * W8): Look is the opening scene of a fresh session, and a location
	 * slot with no default meant every new session began with its opening
	 * button grey. The mechanism stands (`GenreDecl.enabledWhen`); a genre
	 * that wants one declares it.
	 */
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
		/** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
		[sessionEvents.formAddressed]: {}
	},
	/** The layout this genre ships (R71): its default. */
	layouts: [layout({ slug: "default", name: { en: "Adventure" }, preset: ADVENTURE_LAYOUT_V2 })],
})

/* ── Guide ──────────────────────────────────────────────────────────────── */

/**
 * The **pure user/assistant session type** (plans/29 R-18; 09-B B10; built
 * 2026-09-16 as U5g): one envoy, no characters, at most one persona. A
 * person talks; Serene Pub's guide answers about the app and its docs. It
 * is the structural successor of the deprecated *Assistant Chat*, whose code
 * is not reused — an envoy is a cast member, so the reply road, the turn
 * strategies, the resolver and the inspector all work unchanged.
 *
 * ⏳ The mascot is named plainly "Guide" and wears a placeholder glyph: its
 * name and art are the project owner's to set. Neither is load-bearing —
 * the key `mascot` is the address, and the name and image are display text.
 * @experimental
 */
export const GUIDE_GENRE_ID = "core:genre/guide"

/** The guide's key — the slug `envoy:mascot` and the config address `envoy:mascot`. @internal */
export const GUIDE_MASCOT_KEY = "mascot"

/**
 * A placeholder glyph, inline. No package ships binary assets today
 * (`EnvoyDecl.image`), so the placeholder is a data: URI the client renders
 * as an `<img>` — a compass rose on a plain disc, deliberately generic.
 */
const GUIDE_MASCOT_IMAGE =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
			'<circle cx="32" cy="32" r="30" fill="#e8e4f3" stroke="#6b5cb8" stroke-width="2"/>' +
			'<polygon points="32,8 37,27 56,32 37,37 32,56 27,37 8,32 27,27" fill="#6b5cb8"/>' +
			'<circle cx="32" cy="32" r="5" fill="#e8e4f3"/>' +
			"</svg>"
	)

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
	"You are the Guide, Serene Pub's built-in helper. You help the person you are talking to use Serene Pub: setting up connections to AI services, creating characters and personas, writing lorebooks, starting and tuning sessions, writing plugins, and understanding what the app is doing.",
	"You cannot browse, search or open the documentation yourself. What you have instead is a set of documentation excerpts retrieved for the person's latest question and supplied with this conversation, each headed by its page and section and starting with the page's path. Those excerpts are the only thing you know about Serene Pub; your general knowledge of other apps does not apply to it. If you are asked what you can access, say exactly this.",
	"Answer only from the excerpts. After the answer, name the page you used by copying its path exactly as the excerpt gives it, as \"See: \" followed by the path. Never write a page, path, file name, command, code, API or quotation that does not appear in an excerpt, and never quote an excerpt you were not given.",
	"When the excerpts do not answer the question, or none were supplied, say plainly: \"I couldn't find that in the docs.\" Then suggest rephrasing the question, or browsing the documentation at /docs. Do not fill the gap with a guess. If the person questions an earlier answer, check it against the excerpts and correct it when they do not support it.",
	"Answer plainly and briefly. Ask one clarifying question when the request is ambiguous. You are not a character in a story: do not roleplay and do not narrate."
].join("\n\n")

/** @experimental */
export const guideGenre = genre(GUIDE_GENRE_ID, {
	name: { en: "Guide" },
	family: "assistant",
	description: {
		en: "Talk to Serene Pub's guide about the app itself — no characters, no story; just questions and answers grounded in the docs."
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
		/** Nothing to greet with — no character carries a greeting here. */
		greeting: { enabled: false },
		// No turn-order swaps: one in-turn envoy and no characters, nothing to choose between.
	},
	envoys: [
		{
			key: GUIDE_MASCOT_KEY,
			name: { en: "Guide" },
			description: {
				en: "Serene Pub's built-in helper. Answers questions about using the app from the documentation excerpts it is given."
			},
			image: GUIDE_MASCOT_IMAGE,
			prompts: { systemPrompt: GUIDE_MASCOT_SYSTEM_PROMPT },
			default: true,
			// A line nobody claims here is this envoy's (ruled 2026-09-26).
			fallback: true,
			speaks: "in-turn"
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
	}
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
	description: {
		en: "You are the dungeon. Build the rooms, point the party at them, and watch an AI delve into what you made."
	},
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
		// No turn-order swaps: the planner decides who speaks — see Adventure's note.
		fields: {
			/**
			 * The Lair's own levers. It has no turn-style field any more (R12,
			 * owner 2026-09-28): the Lair is cast only, so every turn runs one
			 * voice call per character the planner named. A stored
			 * `turnStyle` from before is an undeclared key, and undeclared
			 * keys are not fields.
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
	layouts: [layout({ slug: "default", name: { en: "Lair" }, preset: LAIR_LAYOUT_V2 })],
})

/* ── Writing Room ───────────────────────────────────────────────────────── */

/**
 * The **co-writing session** (plans/genres §2): two channels with different
 * prompt roles, which is the one lever no other genre has.
 *
 * `main` is the conversation with the companion — what to write next, what is
 * wrong with the last page, who this character really is. `manuscript` is the
 * story itself: a `folio` channel, so its rows fold into ONE block of text in
 * time order with no speaker names, placed ahead of the conversation, and a
 * turn triggered there carries `voice: 'none'` — no seed line at all, which is
 * the extend-prefill posture a manuscript wants. A page has no speaker to
 * announce.
 *
 * `messageVerbs: { delete: false }` on the manuscript and nowhere else: losing
 * a paragraph of the conversation costs a question, losing a paragraph of the
 * book costs the book. Edit is the floor and stays the main verb; a swipe is an
 * alternate continuation and a branch is a draft.
 *
 * ## The scribe, and the character who replaces it
 *
 * `characters: { min: 0, max: 1 }` with one envoy. Both, deliberately: with no
 * card seated the companion is the `scribe` envoy — a plain writing partner
 * with no fiction of its own — and seating a library character makes the
 * companion *that* person, whose card, voice and example dialogue the reply
 * pipeline compiles exactly as any speaker's. The envoy is `default: true`, so
 * a session with no card still has somebody to answer; the turn's speaker is
 * the trigger's pick, and a seated character is the pick the moment there is
 * one.
 *
 * ⏳ The scribe is named plainly "Scribe" and wears a placeholder glyph, on the
 * same terms as the guide's mascot: its name and art are the project owner's to
 * set, and neither is load-bearing — the key `scribe` is the address.
 *
 * ## Why it may write lore
 *
 * `writes: { lore: true, scenes: false }` (R-B). The story bible IS a lorebook,
 * and *Add to bible* is the action that grows it — a genre whose loop writes
 * lore has to declare it or the write site refuses it. Scenes are off: a
 * manuscript is one text, and a scene break is a paragraph rather than a row in
 * another table.
 * @experimental
 */
export const WRITING_ROOM_GENRE_ID = "core:genre/writing-room"

/** The companion's key — the slug `envoy:scribe` and the config address `envoy:scribe`. @internal */
export const WRITING_ROOM_SCRIBE_KEY = "scribe"

/** The manuscript's channel slug — the folio this genre is built around. @internal */
export const MANUSCRIPT_CHANNEL = "manuscript"

/**
 * A placeholder glyph, inline — a nib on a plain disc, on the same terms and
 * in the same palette as the guide's compass rose. No package ships binary
 * assets today (`EnvoyDecl.image`), so it is a data: URI the client renders as
 * an `<img>`.
 */
const WRITING_ROOM_SCRIBE_IMAGE =
	"data:image/svg+xml;utf8," +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
			'<circle cx="32" cy="32" r="30" fill="#e8e4f3" stroke="#6b5cb8" stroke-width="2"/>' +
			'<path d="M20 46 L30 22 L34 22 L44 46 L40 46 L37 38 L27 38 L24 46 Z" fill="#6b5cb8"/>' +
			'<path d="M28.5 34 L32 24 L35.5 34 Z" fill="#e8e4f3"/>' +
			'<rect x="20" y="49" width="24" height="3" rx="1.5" fill="#6b5cb8"/>' +
			"</svg>"
	)

/** @internal */
export const WRITING_ROOM_SCRIBE_SYSTEM_PROMPT = [
	"You are the writer's companion in a writing room. The person you are talking to is the author; the manuscript is theirs, and your job is to help them write it.",
	"When the manuscript is provided with the conversation, read it before you answer: continuity, voice and the promises the last page made are your responsibility to notice. Refer to what is actually on the page rather than to what you would have written.",
	"Answer plainly and briefly. Offer options rather than verdicts, ask one question when the request is ambiguous, and do not rewrite the manuscript in the conversation — the author asks for prose on the manuscript, not here."
].join("\n\n")

/** @experimental */
export const writingRoomGenre = genre(WRITING_ROOM_GENRE_ID, {
	name: { en: "Writing Room" },
	/**
	 * A family of its own. `chat`, `adventure` and `assistant` each name what a
	 * session *is*, and a co-writing room is none of the three: nobody is
	 * playing anybody, there is no world to adventure in, and the companion is
	 * not answering questions about the app. The value is an open string read
	 * only for grouping in the picker (24 §3).
	 */
	family: "writing",
	description: {
		en: "Write a story with a companion — talk it through on one channel, and grow the manuscript itself on the other."
	},
	shape: {
		/** The settings form's sections (PLAN-turn-order §4.11): declared, never automatic. */
		scenario: false,
		tags: true,
		/**
		 * At most one, and none is fine. None means the `scribe` envoy answers;
		 * one means that card does, in its own voice. Two would be a writers'
		 * room rather than a writing room — a second companion has nothing to
		 * do on a turn the first one took.
		 */
		characters: { min: 0, max: 1 },
		/**
		 * **Nobody plays a person here.** The author is the author: what they
		 * type on `main` is direction and what they type on `manuscript` is
		 * prose, and a persona would put them in a story they are writing
		 * rather than living.
		 */
		personas: { min: 0, max: 0 },
		/** The story bible — places, people, rules, the things that must stay true. */
		lorebook: "optional",
		/**
		 * Written on purpose (R-B): *Add to bible* adds a lore entry, which is
		 * the whole point of attaching one here. Scenes are off — a manuscript
		 * is one text in chunks, and this genre opens none.
		 */
		writes: { lore: true, scenes: false },
		composer: "text",
		/** The companion speaks under its own name on `main`; the manuscript overrides it. */
		voice: "character",
		/** Nothing to greet with: a blank page does not welcome anybody. */
		greeting: { enabled: false },
		// No turn-order swaps: at most one companion and the scribe behind it, nothing to choose between.
		channels: [
			"main",
			{
				slug: MANUSCRIPT_CHANNEL,
				role: "folio",
				voice: "none",
				messageVerbs: { delete: false }
			}
		],
		fields: {
			pov: {
				type: "enum",
				label: { en: "Point of view" },
				description: {
					en: "Whose eyes the manuscript is written through. Interpolated into the manuscript's own instructions."
				},
				of: ["first", "close-third", "omniscient"],
				members: [
					{ key: "first", label: { en: "First person" } },
					{ key: "close-third", label: { en: "Close third person" } },
					{ key: "omniscient", label: { en: "Omniscient" } }
				],
				default: "close-third",
				quick: true
			},
			tense: {
				type: "enum",
				label: { en: "Tense" },
				description: {
					en: "Whether the manuscript is written in the past or the present."
				},
				of: ["past", "present"],
				members: [
					{ key: "past", label: { en: "Past" } },
					{ key: "present", label: { en: "Present" } }
				],
				default: "past",
				quick: true
			},
			chunkLength: {
				type: "integer",
				label: { en: "Chunk length" },
				description: {
					en: "Roughly how many words a continuation adds. A chunk is what you read before you decide, so a short one is usually a better one."
				},
				min: 50,
				max: 2000,
				default: 300,
				quick: true
			},
			authorsNote: {
				type: "text",
				label: { en: "Author's note" },
				description: {
					en: "Standing instructions for the manuscript — tone, what to avoid, where this chapter is going. Read on every turn, so keep it short."
				},
				default: "",
				quick: true
			}
		}
	},
	envoys: [
		{
			key: WRITING_ROOM_SCRIBE_KEY,
			name: { en: "Scribe" },
			description: {
				en: "The writer's companion. Reads the manuscript, talks the next page through, and writes when you ask it to."
			},
			image: WRITING_ROOM_SCRIBE_IMAGE,
			prompts: { systemPrompt: WRITING_ROOM_SCRIBE_SYSTEM_PROMPT },
			default: true,
			// A line nobody claims here is this envoy's (ruled 2026-09-26).
			fallback: true,
			speaks: "in-turn"
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
		/**
		 * Optional on the surface and **bound by the shipped preset** (ruled
		 * 2026-09-17). Every form this genre ships today is addressed to the
		 * **owner** — the review gate on *Add to bible* is the author's, not a
		 * character's — but the scribe is an envoy the AI portrays, and no
		 * genre can promise that no pipeline will ever put a question to a
		 * participant the AI answers for. A declared event nothing answers is
		 * a form that waits for ever.
		 */
		[sessionEvents.formAddressed]: {}
	},
	/** The layout this genre ships (R71): its default. */
	layouts: [layout({ slug: "default", name: { en: "Writing Room" }, preset: WRITING_ROOM_LAYOUT_V2 })],
})

/* ── Whodunit ───────────────────────────────────────────────────────────── */

/**
 * The **mystery** (plans/genres §4): a case, a room of suspects, and one
 * detective — the person at the keyboard — who questions them, searches the
 * scene and eventually names somebody.
 *
 * ## What this genre proves, and what it costs
 *
 * Adventure gives every voice its own call; Whodunit asks what those calls are
 * *allowed to know*. A suspect who answers out of the whole case file is not a
 * suspect, and the genre lives or dies on that — which is why its respond
 * pipeline is the one multi-agent turn in core that wires **no character-lore
 * lane at all** (`whodunit.ts`, "What a voice may know"). The private half of
 * the case reaches exactly one prompt in the whole genre: the judge's, at the
 * accusation.
 *
 * ## The detective is a persona, and exactly one
 *
 * `personas: { min: 1, max: 1 }` — unlike every other genre here, the person IS
 * in the scene, and they are the only one who is. Two detectives would be two
 * people the suspects have to be addressed by, and none would leave the
 * questions unasked. `characters: { min: 2 }` because a room with one suspect
 * has no mystery in it: the answer is the only name on the list.
 *
 * ## The narrator is `voice`, not an envoy
 *
 * Declared exactly as Adventure's and Lair's are — `voice: 'narrator'` is the
 * whole declaration, and the narrator's instructions live in the
 * `core:task/build-scene-context@1` prompt row this genre ships. An envoy is a
 * cast member with a card and a turn; the narrator here is whose name the reply
 * is written under.
 *
 * ## It writes scenes and never lore
 *
 * `writes: { lore: false, scenes: true }` (R-B). The case file is a *reference*
 * — the author wrote it before the first turn and nothing in the loop may add
 * to it, because a pipeline that could write the lorebook could write itself an
 * alibi. Scenes are on: a mystery moves from the library to the terrace.
 * @experimental
 */
export const WHODUNIT_GENRE_ID = "core:genre/whodunit"

/** @experimental */
export const whodunitGenre = genre(WHODUNIT_GENRE_ID, {
	name: { en: "Whodunit" },
	/**
	 * Adventure's family: a narrated world with a cast who act on their own and
	 * a ledger that moves is what this is, and the picker groups it there. The
	 * value is an open string read only for grouping (24 §3).
	 */
	family: "adventure",
	description: {
		en: "A case, a room of suspects and one detective. Question them, search the scene, and name the culprit when you are sure — each suspect answers from what they alone know."
	},
	shape: {
		/** The settings form's sections (PLAN-turn-order §4.11): declared, never automatic. */
		scenario: true,
		tags: true,
		/** The suspects. One suspect is not a mystery; it is an arrest. */
		characters: { min: 2 },
		/**
		 * The detective, and there is exactly one. The only genre in core that
		 * *requires* a persona and caps it at one: the whole session is one
		 * person asking questions, and a second would be a second interrogator
		 * the cast have to keep track of.
		 */
		personas: { min: 1, max: 1 },
		/**
		 * Required, and it is the case: the scene, the timeline, the
		 * statements, and one private entry per suspect saying what that
		 * person knows and will not volunteer. A Whodunit with no lorebook is
		 * a room of strangers with nothing to be guilty of.
		 */
		lorebook: "required",
		/**
		 * Written on purpose in one half only (R-B). The case file is authored
		 * before the first turn and the loop never adds to it — a genre whose
		 * pipelines could write lore could write an alibi into evidence — while
		 * scenes are ordinary: an interview moves to the study.
		 */
		writes: { lore: false, scenes: true },
		composer: "text",
		/** The seed line carries the narrator; the suspects get their own calls. */
		voice: "narrator",
		/** Adventure's: a case opens with whatever the cast greet the detective with. */
		greeting: { enabled: true, channel: "main" },
		// No turn-order swaps: the planner decides who reacts — see Adventure's note.
		fields: {
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
			 * The genre's own lever: **how much a suspect volunteers**.
			 *
			 * `open` — a suspect answers what they were actually asked, and a
			 * direct question about something they know gets a direct answer
			 * unless they have a reason to lie. `guarded` — they answer the
			 * narrowest reading of the question and volunteer nothing, so the
			 * detective has to know what to ask.
			 *
			 * ⚠ **It was `difficulty` until 2026-09-17, and that was one word
			 * for two things** (R1). Adventure owns `difficulty` over
			 * `story | normal | hard` — how hard the world pushes back — and
			 * nothing collides at run time, because a genre field is read out
			 * of the session's own `fields` bag; what collided was the reading.
			 * How forthcoming a suspect is is not how hard a session is, and a
			 * person who has met Adventure's field arrives here expecting the
			 * world to push back. `candour` names what the lever actually
			 * moves, and the values say it in the suspect's own terms.
			 */
			candour: {
				type: "enum",
				label: { en: "Candour" },
				description: {
					en: "How much a suspect volunteers. When they are open they answer what you asked; when they are guarded they answer the narrowest reading of it and nothing more."
				},
				of: ["open", "guarded"],
				members: [
					{ key: "open", label: { en: "Open" } },
					{ key: "guarded", label: { en: "Guarded" } }
				],
				default: "open",
				quick: true
			},
			/**
			 * Adventure's, restated rather than dropped: the two genres should
			 * behave the same way about a model that can set a number, and a
			 * detective who is not asked to accept a suspicion score is a
			 * detective whose notes a model rewrote between two messages.
			 */
			trustNarrator: {
				type: "boolean",
				label: { en: "Trust the narrator" },
				description: {
					en: "Apply the state-keeper's changes as they are made, instead of holding each one for you to accept. Off is the safe default: a model that can set a number silently can rewrite the fiction between two messages."
				},
				default: false,
				quick: true
			}
		}
	},
	/** Suspicion per suspect, and the scene, the count and the verdict. */
	slots: WHODUNIT_SLOTS as unknown as AttributeSlotDecl[],
	sheets: [WHODUNIT_SHEET],
	// Its sessions may carry in their world's attributes and add their own.
	customAttributes: 'allow',
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
		 * Optional on the surface and **bound by the shipped preset**, on the
		 * Writing Room's terms (ruled 2026-09-17). Every form this genre ships
		 * today is addressed to the **owner** — the detective is the one
		 * choosing who to question and who to accuse — but a narrator putting
		 * a yes/no to a *suspect* is a form addressed to somebody the AI
		 * portrays, and every suspect here is. A declared event nothing
		 * answers is a form that waits for ever.
		 */
		[sessionEvents.formAddressed]: {}
	},
	/** The layout this genre ships (R71): its default. */
	layouts: [layout({ slug: "default", name: { en: "Whodunit" }, preset: WHODUNIT_LAYOUT_V2 })],
})
