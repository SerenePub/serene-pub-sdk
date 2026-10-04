import type { FieldDecl } from "@serene-pub/sdk";
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
export declare const AUTO_ADVANCE_FIELD: FieldDecl;
/**
 * Which path a turn-order spec with a model path takes (PLAN-turn-order R41,
 * M4): `rules`, the strategy node, or `model`, the `advise` oracle asking a
 * model who speaks. A genre field like auto-advance — declared, cascading
 * (§4.13), read by the spec's `decide` junction off the settings document.
 * Only a genre whose turn-order spec has a model path declares it.
 * @experimental
 */
export declare const TURN_MODE_FIELD: FieldDecl;
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
export declare const CHARACTER_DETAIL_FIELD: FieldDecl;
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
export declare const AUTHORS_NOTE_FIELD: FieldDecl;
/** The one id every default session carries (was the create spec's slug). @experimental */
export declare const CHAT_GENRE_ID = "core:genre/chat";
/** @public */
export declare const chatGenre: import("@serene-pub/sdk").GenreDecl;
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
export declare const ADVENTURE_GENRE_ID = "core:genre/adventure";
/** @experimental */
export declare const adventureGenre: import("@serene-pub/sdk").GenreDecl;
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
export declare const GUIDE_GENRE_ID = "core:genre/guide";
/** The guide's key — the slug `envoy:mascot` and the config address `envoy:mascot`. @internal */
export declare const GUIDE_MASCOT_KEY = "mascot";
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
export declare const GUIDE_MASCOT_SYSTEM_PROMPT: string;
/**
 * Serene's greeting: the first line of every new Guide session, on `main`.
 * Declared, not generated (`EnvoyDecl.greeting`), so a new session opens
 * instantly with no model call. `{{char}}` is Serene.
 * @internal
 */
export declare const GUIDE_MASCOT_GREETING = "Hi, I'm {{char}}, your guide to Serene Pub. What would you like to talk about? How can I help you?";
/** @experimental */
export declare const guideGenre: import("@serene-pub/sdk").GenreDecl;
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
export declare const LAIR_GENRE_ID = "core:genre/lair";
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
export declare const POST_HISTORY_TOKEN_TRIGGER = 3000;
/** The Lair envoy's key — the address `envoy:castellan` (R6). @internal */
export declare const LAIR_CASTELLAN_KEY = "castellan";
/** The Lair's out-of-fiction channel slug (R6). @internal */
export declare const SANCTUM_CHANNEL = "sanctum";
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
export declare const LAIR_CASTELLAN_SYSTEM_PROMPT: string;
/**
 * The Castellan's greeting (R6, owner F1 2026-09-28): the first line of every
 * new Lair session, on the Sanctum. It introduces the reverse dungeon, says
 * who narrates, what the Castellan does and what the Sanctum is for, and
 * invites the person to start. Declared, not generated — see
 * `EnvoyDecl.greeting`. `{{char}}` is the Castellan; the party may be empty
 * at creation, hence the `{{#if}}`.
 * @internal
 */
export declare const LAIR_CASTELLAN_GREETING: string;
/** @experimental */
export declare const lairGenre: import("@serene-pub/sdk").GenreDecl;
//# sourceMappingURL=genres.d.ts.map