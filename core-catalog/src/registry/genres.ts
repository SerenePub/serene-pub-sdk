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
	ADVENTURE_LAYOUT,
	CHAT_LAYOUT,
	LAIR_LAYOUT
} from "./layouts.js"
import type { AttributeSlotDecl, FieldDecl } from "@serene-pub/sdk"
import { ADVENTURE_SHEET, ADVENTURE_SLOTS } from "./slots.js"
import { LAIR_SHEET, LAIR_SLOTS } from "./slots.js"
import { GUIDE_MASCOT_IMAGE } from "../seed/guideMascotImage.js"
import { coreWidgets } from "./widgets.js"

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

/**
 * 🚧 The **author's note** (2026-10-02, AN1; Chat only, owner ruling) — the
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
		// swaps it declares (genres/chat/turnOrder.ts), like any other swappable node.

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
			characterDetail: CHARACTER_DETAIL_FIELD,
			// Chat only (owner ruling 2026-10-02): the person's own note.
			authorsNote: AUTHORS_NOTE_FIELD
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
	},
	/**
	 * The layout this genre ships (R71): its default — the conversation, and
	 * the Author's note tucked in the right rail (owner ruling 2026-10-03).
	 */
	layouts: [layout({ slug: "default", name: { en: "Chat" }, preset: CHAT_LAYOUT })]
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
	/** The author's note is Chat's alone (owner ruling 2026-10-02, AN1). */
	omitWidgets: [coreWidgets.authorsNote],
	layouts: [layout({ slug: "default", name: { en: "Adventure" }, preset: ADVENTURE_LAYOUT })],
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
	/** The author's note is Chat's alone (owner ruling 2026-10-02, AN1). */
	omitWidgets: [coreWidgets.authorsNote]
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
	/** The author's note is Chat's alone (owner ruling 2026-10-02, AN1). */
	omitWidgets: [coreWidgets.authorsNote],
	layouts: [layout({ slug: "default", name: { en: "Lair" }, preset: LAIR_LAYOUT })],
})
