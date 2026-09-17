/**
 * Core's session genres (24 §3) — first-class declared objects with their own
 * ids. The genre owns its id (`core:genre/chat`); the create pipeline is its
 * required member, not its identity. Every session-event spec references the
 * genre object here, so the id is typed once and cannot be mistyped per spec.
 *
 * T6 moves this into `@serene-pub/core-catalog` with the specs; today it is
 * the in-repo half of that package.
 */
import { genre, sessionEvents } from "@serene-pub/sdk";
import { ADVENTURE_SLOTS } from "./slots.js";
/** The one id every default session carries (was the create spec's slug). */
export const CHAT_GENRE_ID = "core:genre/chat";
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
        greeting: { enabled: true, channel: "main" }
    },
    /**
     * The event surface (24 §5): which session events exist for this genre
     * and which a preset must bind. `session-created` is implicitly required
     * for every genre.
     */
    events: {
        [sessionEvents.messageRespond]: { required: true },
        [sessionEvents.sessionAction]: { open: true },
        [sessionEvents.memberAdded]: {},
        [sessionEvents.memberRemoved]: {},
        /** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
        [sessionEvents.formAddressed]: {}
    }
});
/* ── Adventure ──────────────────────────────────────────────────────────── */
/**
 * The flagship genre (DESIGN-adventure-genre.md): chat with a **narrator who
 * plans, a cast who speak for themselves, and a state-keeper who writes the
 * numbers down.** Four agents, one turn, one receipt.
 *
 * The one-LLM-call rule is Chat's, not this one's. Everything a player sees on
 * screen — bars, inventory, the world strip, the ledger under a reply — is a
 * consequence of the state-keeper's proposals, never of prose parsing.
 */
export const ADVENTURE_GENRE_ID = "core:genre/adventure";
export const adventureGenre = genre(ADVENTURE_GENRE_ID, {
    name: { en: "Adventure" },
    family: "adventure",
    description: {
        en: "A narrated world with a cast that acts on its own, stats and an inventory that change as you play, and a story clock that moves."
    },
    shape: {
        /**
         * At least one of each, unlike Chat. A world with nobody in it has no
         * cast for the voices stage to give a turn to, and no persona means
         * nothing for the planner to plan around.
         */
        characters: { min: 1 },
        personas: { min: 1 },
        /**
         * Required, and it is the one hard requirement this genre adds. The
         * world lives in the lorebook: places, items a possession edge points
         * at, the history the timeline is read from. An adventure without one
         * is a narrator describing nothing.
         */
        lorebook: "required",
        composer: "text",
        /**
         * The seed line carries the narrator, not a character. A turn here is
         * scene prose first and speech second, and the cast get their own
         * generate calls in the voices stage rather than owning the reply.
         */
        voice: "narrator",
        greeting: { enabled: true, channel: "main" },
        /**
         * The planner decides who speaks, so nothing round-robins. The value is
         * read by surfaces that ask "whose turn is it" — the respond spec is
         * what actually decides, in its `plan` stage.
         */
        nextSpeaker: "planner",
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
            }
        }
    },
    /**
     * The declarations, not ids (`GenreDecl.slots`): a genre that named a slot
     * nothing declared would be a session whose stats validate against nothing.
     */
    slots: ADVENTURE_SLOTS,
    events: {
        [sessionEvents.messageRespond]: { required: true },
        [sessionEvents.sessionAction]: { open: true },
        [sessionEvents.memberAdded]: {},
        [sessionEvents.memberRemoved]: {},
        /** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
        [sessionEvents.formAddressed]: {}
    }
});
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
 */
export const GUIDE_GENRE_ID = "core:genre/guide";
/** The guide's key — the slug `envoy:mascot` and the config address `envoy:mascot`. */
export const GUIDE_MASCOT_KEY = "mascot";
/**
 * A placeholder glyph, inline. No package ships binary assets today
 * (`EnvoyDecl.image`), so the placeholder is a data: URI the client renders
 * as an `<img>` — a compass rose on a plain disc, deliberately generic.
 */
const GUIDE_MASCOT_IMAGE = "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<circle cx="32" cy="32" r="30" fill="#e8e4f3" stroke="#6b5cb8" stroke-width="2"/>' +
        '<polygon points="32,8 37,27 56,32 37,37 32,56 27,37 8,32 27,27" fill="#6b5cb8"/>' +
        '<circle cx="32" cy="32" r="5" fill="#e8e4f3"/>' +
        "</svg>");
export const GUIDE_MASCOT_SYSTEM_PROMPT = [
    "You are the Guide, Serene Pub's built-in helper. You help the person you are talking to use Serene Pub: setting up connections to AI services, creating characters and personas, writing lorebooks, starting and tuning sessions, and understanding what the app is doing.",
    "You know Serene Pub's documentation. When documentation excerpts are provided with the conversation, ground your answer in them and name the page they came from; when they are not, say what you know and suggest where in the app to look.",
    "Answer plainly and briefly. Ask one clarifying question when the request is ambiguous. You are not a character in a story: do not roleplay, do not narrate, and do not invent features the app does not have."
].join("\n\n");
export const guideGenre = genre(GUIDE_GENRE_ID, {
    name: { en: "Guide" },
    family: "assistant",
    description: {
        en: "Talk to Serene Pub's guide about the app itself — no characters, no story; just questions and answers grounded in the docs."
    },
    shape: {
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
        /** Nothing to greet with — no character carries a greeting here. */
        greeting: { enabled: false }
    },
    envoys: [
        {
            key: GUIDE_MASCOT_KEY,
            name: { en: "Guide" },
            description: {
                en: "Serene Pub's built-in helper. Knows the app and its documentation; answers questions about using it."
            },
            image: GUIDE_MASCOT_IMAGE,
            prompts: { systemPrompt: GUIDE_MASCOT_SYSTEM_PROMPT },
            default: true,
            speaks: "in-turn"
        }
    ],
    events: {
        [sessionEvents.messageRespond]: { required: true },
        [sessionEvents.sessionAction]: { open: true },
        [sessionEvents.memberAdded]: {},
        [sessionEvents.memberRemoved]: {},
        /** A form put to a participant the AI portrays (R-15 *Forms*; U5d). Optional. */
        [sessionEvents.formAddressed]: {}
    }
});
//# sourceMappingURL=genres.js.map