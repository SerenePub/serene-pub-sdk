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
        [sessionEvents.memberRemoved]: {}
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
        [sessionEvents.memberRemoved]: {}
    }
});
//# sourceMappingURL=genres.js.map