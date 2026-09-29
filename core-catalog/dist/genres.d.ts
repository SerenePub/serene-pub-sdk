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
export declare const WRITING_ROOM_GENRE_ID = "core:genre/writing-room";
/** The companion's key — the slug `envoy:scribe` and the config address `envoy:scribe`. @internal */
export declare const WRITING_ROOM_SCRIBE_KEY = "scribe";
/** The manuscript's channel slug — the folio this genre is built around. @internal */
export declare const MANUSCRIPT_CHANNEL = "manuscript";
/** @internal */
export declare const WRITING_ROOM_SCRIBE_SYSTEM_PROMPT: string;
/** @experimental */
export declare const writingRoomGenre: import("@serene-pub/sdk").GenreDecl;
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
export declare const WHODUNIT_GENRE_ID = "core:genre/whodunit";
/** @experimental */
export declare const whodunitGenre: import("@serene-pub/sdk").GenreDecl;
//# sourceMappingURL=genres.d.ts.map