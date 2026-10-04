/**
 * The **Lair** genre's actions — what the dungeon's master does between turns
 * (plans/genres-and-showcase-plugins §3, "Room building").
 *
 * `session-action` is an OPEN event, so each of these is its own small
 * pipeline contributing its own button, and removing one from a preset takes
 * the button with it and breaks nothing. Three shapes:
 *
 *  - **Build room**, **Answer the door** and **File as a room** write a
 *    *lorebook entry*. They are the three actions here that reach outside the
 *    story, so they are the three declared `effects: 'world'` — owner-only,
 *    and never named by a block. *File as a room* lives on a message's ⋮ (the
 *    row it files is its subject, R11); the other two live in the composer
 *    and are nameable only by a message block **addressed to the owner**
 *    (R-15 *The line*; L1, ruled 2026-09-17). The knock's block is exactly
 *    that block, which is what makes its options real writes rather than
 *    narration.
 *  - **Whisper** and **Nudge** write *state* and no message: a standing
 *    instruction for the delvers the master picks (R10), and one for the
 *    Castellan. Neither calls a model. Pressing Nudge
 *    produces nothing visible in the log, which looks like a bug the first
 *    time you see it and is the same thing Adventure's Rest does.
 *  - **Trigger trap** and **Reveal** write a *message* and change nothing:
 *    the Castellan's turns with a fixed instruction, Adventure's Look with a
 *    different sentence in its prompt — one streamed row under the
 *    Castellan's name (lair pass B17, owner D7a; R8).
 *
 * ## Why the two steering actions write slots rather than messages
 *
 * A directive that produces no message still has to reach the next turn, and a
 * session has exactly three places a fact can live: the transcript, the
 * lorebook and the state. A nudge is not a line anybody said and not a fact
 * about the world, so it is state — `core:slot/direction@1` for the Castellan,
 * `core:slot/whisper@1` per delver — and the planner and the voices already
 * take `state` on a port, which makes the note a control something *reads*
 * rather than a second store nothing walks. (The planner reads the direction;
 * a whisper is heard by its holder's voice alone — earshot, R1.)
 *
 * ⚠ **The channel route was the other candidate and does not work.** A hidden
 * message on a `whispers` channel is one node to write and unreadable
 * afterwards: `core:query/session-history@1` reads exactly one channel, and no
 * core node merges two transcripts into the one `messages` port `assemble`
 * takes. It would have been a button wired to nothing.
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { LAIR_CASTELLAN_KEY, POST_HISTORY_TOKEN_TRIGGER, SANCTUM_CHANNEL, lairGenre } from './genres.js';
/**
 * The Castellan's reference — who says a room is already filed.
 *
 * ⚠ **A room draft reads the book's public half and nothing else** (plan
 * A28): the world-lore and history lanes, never character lore. A room entry
 * is public lore — every delver's voice reads it, and so does every session
 * on the book. Character lore is private whoever reads it: read with no
 * speaker it is the omniscient narrator's (a background member's entries and
 * every unbound one), and read as anybody it still carries the private lore
 * of a persona someone plays in the session, which every voice of that
 * session may read. Either way a secret keyed on the conversation could be
 * drafted into a room anybody reads, so the drafts read no character lore
 * at all. *Build room* reads world lore alone.
 */
const CASTELLAN = `envoy:${LAIR_CASTELLAN_KEY}`;
/* ── Build room ─────────────────────────────────────────────────────────── */
/** @internal */
export const LAIR_BUILD_ROOM_SPEC_ID = 'core:spec/lair-build-room';
// ⚠ Every Lair action that ranks (build room, answer the door, file as a
// room, and the Castellan's whisper/trap/reveal builder), edited in place
// (lorebooks C2, 2026-10-02): a `presences` read and an `eligible` step
// (`core:task/eligibility@1`) between `lore` and `rank`; and Build room,
// Answer the door and File as a room, which show the party's room under
// `{{locationEntry}}`, take the room rule — a `place` step wired into `rank`
// as `shownElsewhere`. Content-addressed; `specHashes.test.ts` records the
// moves.
/** @internal */
export const LAIR_BUILD_ROOM_VERSION = '1.0.0';
/**
 * The layout a drafted room's body takes — its `Exits:` line among it — and
 * why that line is still prose beside the graph.
 *
 * **The ways between rooms are relationships now** (places plan, 2026-09-29):
 * one `narrative_relationships` row per way, read both ways when it has a
 * reverse wording, drawn on the Places lens or in a place's own Links, and
 * written by a pipeline through `core:outlet/link-lore-entries@1`. The Lair's
 * rooms listing asks for them (`withLinks`), so `{{locationEntry}}` says a
 * room's ways out under its body as "From here:" — that, not this line, is
 * what the planner reads the ways on from. *Answer the door* links the room it
 * writes to the room the party stand in (B6).
 *
 * ⚠ **The drafted `Exits:` line stays** (plan §11; how the map should grow is
 * the owner's open Q4). A draft names ways out to rooms that may not exist
 * yet, and nothing in the bound catalogue turns a line of prose into a list
 * of names; parsing it at write time, with stub rooms for the names nothing
 * answers, would change what a knock means. So the line is the room's own
 * words — a reader still reads it, and an older room has only it — and the
 * master turns it into links by hand, or with the place editor's *Read links
 * from the Exits line* (B7). It stays a fixed line so a parser can take it
 * apart.
 * @internal
 */
export const LAIR_ROOM_CONTENT_SHAPE = [
    'Exits: <direction> → <room>, <direction> → <room>',
    'Contents: …',
    'Hazards: …',
    'Occupants: …',
].join('\n');
/**
 * **Build room**: the master writes a room into the dungeon.
 *
 * The collected text (R3) is the room's **name** — the one thing a person always
 * knows when they press this — and the model writes the body against the lore,
 * the party's position and the fixed layout above. The name reaches the draft
 * as `{{turnDirection}}`, and every room the dungeon already has as
 * `{{knownLocations}}` (the rooms listing, plan A28) — the prompt's "name only
 * rooms this dungeon already has" with the rooms in front of it. The world
 * lore it reads carries no private entries. The write then parks at the
 * review gate: `core:outlet/create-lore-entry@1` declares
 * `review: { fields: ['name', 'content'] }`, and the preset below turns the
 * gate ON — without that line `resolvePosition` defaults an undeclared position
 * to `off` and this docblock's promise would be false, which it was until
 * 2026-09-17. The gate IS the Build room form, with the name and the whole body
 * editable before anything lands.
 *
 * **The entry is a location** (L3, contracts batch 2, 2026-09-17): the preset
 * sets `entryType: 'core:entry/location'`, so a room files as a place rather
 * than as world lore whose content happens to be laid out, and "which rows are
 * the map" becomes a question a reader can ask. It is written with no links:
 * a room built ahead of the party stands nowhere yet, and its drafted `Exits:`
 * line is prose the master links by hand — see `LAIR_ROOM_CONTENT_SHAPE`.
 *
 * ⚠ **`effects: 'world'`** (R-15 *The line*): the result is lorebook data, so
 * this action is the owner's, lives in the composer, and no message block may
 * name it. That last rule is why the knock's form cannot save a room itself.
 * @internal
 */
export const lairBuildRoomSpec = () => compile(spec(LAIR_BUILD_ROOM_SPEC_ID, {
    version: LAIR_BUILD_ROOM_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'build-room',
                venue: { kind: 'composer' },
                quick: true,
                icon: 'hammer',
                /** The room's name is the whole instruction (R3): nothing to do without it. */
                collects: { text: { need: 'required', label: { en: 'Room name' } } },
                effects: 'world',
                /** The owner's, and stated rather than inherited — see the note above. */
                audience: { see: ['participant'], act: ['owner'] },
                label: { en: 'Build room' },
                description: {
                    en: "Write a room into the dungeon. Name it, and edit what the narrator drafts before it's saved.",
                },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionAction,
})
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    /** The world as the lore tells it, ranked against the conversation. */
    .chain('lore', (c) => c.query('read', ($) => C.worldLore.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })))
    /**
     * Every room the dungeon holds (location entries, the
     * preset), by listing rather than by rank — what this room
     * has to join onto, named to the draft whatever the
     * ranker admitted.
     */
    .chain('rooms', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('write'),
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [$.gather.history.read.band, $.gather.lore.read.main],
}))
    // The room `{{locationEntry}}` shows (the room rule, 2026-10-02):
    // the world's location at `world.location` (the preset's `path`),
    // by the one room rule; the ranker leaves it out of the lore.
    .task('place', ($) => C.undescribedName.v1({
    name: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    params: slot.params(),
}), { expose: { label: 'The current place' } })
    // Who is in the world at the session's moment (R4), for `eligible`.
    .query('presences', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))
    // The hard gates before the ranker (C2; R2, R4): selective-logic
    // exclusions from the keyword lanes, and the presence gate.
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.lore.candidates,
    exclusions: $.gather.lore.read.exclusions,
    presences: $.presences.main,
    at: $.presences.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.eligible.candidates,
    budget: $.contextBudget.available,
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}))
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    // The room's name, as the master typed it.
    turnDirection: $.input.text,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /** Prose and no seed: a room is drafted, not spoken. */
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext,
}))
    /**
     * 🚧 **The transcript's files, placed** (attachments follow-ups, owner
     * ruling 2026-10-03) — `respond`'s two steps: the files the rows show,
     * then per line what `write` receives (an image it can read rides its
     * own turn; otherwise its name). A transcript with no files passes
     * through untouched, so the prompt is byte for byte what it was.
     */
    .query('attachments', ($) => C.historyAttachments.v1({
    messages: $.gather.history.read.messages,
    params: slot.params(),
}))
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.lines.messages,
    attachments: $.attachments.attachments,
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.attached.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('write'),
}))
    .oracle('write', ($) => C.generateText.v1({
    context: $.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'Building the room' } })
    /**
     * The name is what the master typed, never what the model wrote: a
     * room the person named is a room they can find again, and the gate
     * lets them fix it if the composer was empty.
     */
    .outlet('save', ($) => C.createLoreEntry.v1({
    name: $.input.text,
    content: $.write.text,
    // Named so the entry-kind setting is live rather than
    // rendered and unread (L3); the preset below sets it to a
    // location. `links` is left unwired: a room built ahead of
    // the party joins nothing yet, and its drafted exits are
    // prose the master links (see `LAIR_ROOM_CONTENT_SHAPE`).
    params: slot.params(),
}))
    /**
     * ⚠ **The gate is the point, not a precaution** — and this preset is
     * what makes it true. `resolvePosition` defaults an undeclared review
     * position to `off`, so until this line the drafted room landed unseen
     * while the docblock above promised a form. *Answer the door* has
     * carried the same two lines since L1; this is the pair.
     */
    .preset('lair', { label: 'Lair', default: true }, (p) => p
    .settings('save', { review: 'on' })
    // A room is a place (L3) — bare id, the way a listing spells
    // them; the version is the row's own column.
    .params('save', { entryType: 'core:entry/location' })
    // The rooms the draft is shown: the dungeon's places.
    .params('gather.rooms.read', { entryTypes: ['core:entry/location'] })
    // The room the place slot shows (the room rule).
    .params('place', { path: 'world.location' }))
    .build());
/* ── The party knocks: the answer ───────────────────────────────────────── */
/** @internal */
export const LAIR_ROOM_ANSWER_SPEC_ID = 'core:spec/lair-room-answer';
/** @internal */
export const LAIR_ROOM_ANSWER_VERSION = '1.0.0';
/**
 * **What the knock's option fires** — the other half of the respond spec's
 * `door.knock` branch (R-15 *Forms*), and the composer's *Answer the door*
 * (`/room`) while a knock is open.
 *
 * **The knock asks for a description** (lair re-plan R9, owner rulings 2 + 6,
 * 2026-09-28). The action collects optional text (R3's collect modal, or S2's
 * slash argument — `/room <text>`), and a junction on it decides:
 *
 *  - **typed** — the text IS the room: a location entry named after the door
 *    the party knocked at, its content **the typed text, verbatim**, and **no
 *    review gate**. It is the master's own words; a gate would ask them to
 *    approve what they just typed.
 *  - **drafted** — nothing typed: the Castellan drafts the room in the
 *    dungeon's layout (`LAIR_ROOM_CONTENT_SHAPE`, the form *Build room* drafts
 *    into, the `lair-knock-build` prompt), and the master edits it at
 *    `create-lore-entry`'s **review gate** before it lands.
 *
 * Retired with the two-option knock: *I will build it* and *Let the Castellan
 * improvise it* (`KNOCK_OPTIONS`), and the improvise branch's narration
 * (its `lair-improvise` prompt row). An empty answer drafts and gates exactly
 * as either used to.
 *
 * **A rejected draft re-opens the knock** (owner F5; R9). Not this spec's
 * rule: a core one in the app's review gate — an answer rejected at review
 * that wrote nothing is no answer, so the form is not marked answered, its
 * row is re-announced and its open-form notification raised again. The room
 * is still undescribed, the story still waits, and *Describe <room>…* and
 * `/room` are offered again.
 *
 * Writing a lore entry is `effects: 'world'`, and the rule that used to stop a
 * block naming one is the effects line's one exception (L1, ruled 2026-09-17):
 * `worldBlockFunctions` refuses any block naming a world action **unless the
 * block is addressed to the owner**, and the knock's block is addressed to
 * `owner` precisely because the dungeon's master is the only person it could
 * sensibly be put to. So this action is declared `world` and lives in the
 * `composer` venue — the `form` venue stays fiction-only, because a venue is
 * declared and an addressee is decided at run time (see `sdk/src/actions.ts`).
 *
 * **The room's name travels on the block** (lair pass B12, 2026-09-27). The
 * knock's `choices` block carries the checked name as its `referent`,
 * `read-answer@1` hands it back, and it is the entry's `name`. A press that
 * carries no form never gets that far: `answer` halts (*nothing to answer*),
 * which is why the action is present only while a knock is open (W-GATE D3,
 * `presentWhen`), and a composer press while it is open is addressed to that
 * knock by the host.
 *
 * **The new room joins the room the party stand in** (places plan B6,
 * 2026-09-29). The party knocked from somewhere: the world's `location` stat,
 * else the room the knock's planner named (the block's `vantage`, plan A27).
 * `here` resolves it against the rooms the dungeon lists — the Lair's name
 * rule, `undescribed-name@1` reading the name at `world.location` inside the
 * session's state (a location set to a place entry is that entry, by id) —
 * and, once the room has landed, the `link` junction writes ONE relationship
 * from the new room to that one, `leads to` both ways
 * (`core:outlet/link-lore-entries@1`). The next turn's planner reads it under
 * the room as "From here:".
 *
 * ⚠ **Invariant: the door never fails because the party's location names no
 * room** (plan §3 #11). The location is usually words, and `create-lore-entry`'s
 * own `links` refuses a name nothing answers to inside the entry's transaction
 * — which would fail the room with it. So the link is its own write, after the
 * room's, in a junction that fires only when `here` found a room: otherwise
 * the room is saved unlinked. A rejected draft ends the run before either. The
 * link is not gated (the master judged the room; the way back to where the
 * party stand is not a second question) and the outlet is idempotent, so a
 * repeat stacks nothing.
 *
 * **Then the story goes on.** Once the room lands, the master's own line —
 * *The party go on into The Drowned Hall* — is written under their name, the
 * way a send is: the turn order prepares the Castellan's turn, auto-advance
 * fires it as it would after any send, and the planner, which now lists the
 * room, walks the party in. A rejected draft ends the run at the gate, so
 * nothing is said and the knock is open again.
 * @internal
 */
export const lairRoomAnswerSpec = () => compile(spec(LAIR_ROOM_ANSWER_SPEC_ID, {
    version: LAIR_ROOM_ANSWER_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'room',
                /**
                 * ⚠ **`composer`, and it was `form`** (changed
                 * 2026-09-17 with L1). This action writes a lorebook
                 * entry, which is `effects: 'world'`, and F41 refuses a
                 * world action in the `form` venue at construction —
                 * deliberately, because a venue is declared and an
                 * addressee is decided at run time, so that check can
                 * never see the one fact that makes this safe. The
                 * block still reaches it: an owner-addressed block may
                 * name a `composer`-venue world action, and the press is
                 * held to the addressee.
                 *
                 * **So it is present only while a knock is open** —
                 * `presentWhen` below, hidden rather than grey (W-GATE
                 * D3, 2026-09-27). The host publishes the session's open
                 * form as `session.openForm` (unanswered, not overtaken)
                 * with the action it is answered by; the knock's block
                 * names this one. Present is answerable: the host
                 * addresses a composer press of this action to the open
                 * knock (`fireAction`), so it walks the knock's own
                 * button road.
                 */
                venue: { kind: 'composer' },
                presentWhen: {
                    on: 'session.openForm.action',
                    equals: `${LAIR_ROOM_ANSWER_SPEC_ID}#room`,
                    /** Said only at the door: a listing hides it instead. */
                    reason: { en: 'There is no door to answer — the party have not knocked.' },
                },
                /**
                 * **The description** (R9): optional, because an empty
                 * answer has a meaning — the Castellan drafts the room
                 * for review. Typed, it is saved as written.
                 */
                collects: {
                    text: {
                        need: 'optional',
                        label: { en: 'Describe the room' },
                        ifEmpty: { en: 'The Castellan drafts it for you to review.' },
                    },
                },
                /**
                 * ⚠ Lore data, so the result is outside the story
                 * (R-15 *The line*) — the same declaration *Build
                 * room* carries, for the same write.
                 */
                effects: 'world',
                /**
                 * The dungeon's master answers this and nobody else —
                 * the block is addressed to `owner`, and the audience
                 * says the same thing where a listing would ask. It is
                 * also what a `world` action is allowed to say
                 * (`WORLD_ACTION_ACTORS`).
                 */
                audience: { see: ['participant'], act: ['owner'] },
                icon: 'door-open',
                label: { en: 'Answer the door' },
                description: {
                    en: 'Describe the room the party just found. What you write is saved as the room; leave it empty and the Castellan drafts it for you to edit before it is saved.',
                },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionAction,
})
    .task('answer', ($) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    /** The book's public half — world lore and history, never character lore (see the note on `CASTELLAN`). */
    .chain('worldLore', (c) => c.query('read', ($) => C.worldLore.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('historyEntries', (c) => c.query('read', ($) => C.historyEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params({ node: 'gather.worldLore.read' }),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })))
    /**
     * The rooms the dungeon holds (location entries, the
     * preset) — what `here` resolves the party's location
     * against (B6), and what the draft is told already exists
     * (plan A28).
     */
    .chain('rooms', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('room.drafted.write'),
    connection: slot.connectionOf('room.drafted.write'),
    params: slot.params(),
}))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [
        $.gather.history.read.band,
        $.gather.worldLore.read.main,
        $.gather.historyEntries.read.main,
    ],
}))
    // The room `{{locationEntry}}` shows (the room rule, 2026-10-02):
    // the world's location at `world.location` (the preset's `path`),
    // by the one room rule; the ranker leaves it out of the lore.
    .task('place', ($) => C.undescribedName.v1({
    name: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    params: slot.params(),
}), { expose: { label: 'The current place' } })
    // Who is in the world at the session's moment (R4), for `eligible`.
    .query('presences', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))
    // The hard gates before the ranker (C2; R2, R4): selective-logic
    // exclusions from the keyword lanes, and the presence gate.
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.lore.candidates,
    exclusions: [$.gather.worldLore.read.exclusions, $.gather.historyEntries.read.exclusions],
    presences: $.presences.main,
    at: $.presences.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.eligible.candidates,
    budget: $.contextBudget.available,
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}))
    /**
     * 🚧 **The files those rows show** (attachments follow-ups, owner
     * ruling 2026-10-03), read once on the spine; the drafting arm below
     * places them for `room.drafted.write` — an image it can read rides its own
     * turn, otherwise its name. No files, and the arm's prompt is byte for
     * byte what it was.
     */
    .query('attachments', ($) => C.historyAttachments.v1({
    messages: $.gather.history.read.messages,
    params: slot.params(),
}))
    /**
     * **Typed, or left to the Castellan** (R9). The model call is in
     * the branch that needs one: a typed room costs nothing. Each
     * branch files the room itself — a location (L3), set in the
     * preset below, exactly as *Build room* files one — named after
     * the door the party knocked at (the block's `referent`).
     *
     * `links` is unwired on purpose: it would fail the room with a
     * name nothing answers to. The way back to where the party stand
     * is the `link` junction below, after the room (B6); the drafted
     * `Exits:` line stays prose (`LAIR_ROOM_CONTENT_SHAPE`).
     */
    .junction('room', { on: ($) => $.input.text }, (r) => r
    .when('typed', { truthy: true }, (c) => c.outlet('save', ($) => C.createLoreEntry.v1({
    name: $.answer.referent,
    // The master's own words, as they wrote them.
    content: $.input.text,
    params: slot.params(),
}), { expose: { label: 'Save the room as typed' } }))
    /**
     * The room drafted in the dungeon's layout for the master
     * to finish (B12) — *Build room*'s layout, its own prompt
     * row: the room is the one the party just knocked at,
     * named by the last line of the conversation.
     */
    .otherwise('drafted', (c) => c
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.room.drafted.context.templateContext,
}))
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.room.drafted.lines.messages,
    attachments: $.attachments.attachments,
    connection: slot.connectionOf('room.drafted.write'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.room.drafted.attached.messages,
    templateContext: $.room.drafted.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'room.drafted.context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('room.drafted.write'),
}))
    .oracle('write', ($) => C.generateText.v1({
    context: $.room.drafted.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'The Castellan drafts the room' } })
    .outlet('save', ($) => C.createLoreEntry.v1({
    name: $.answer.referent,
    content: $.room.drafted.write.text,
    params: slot.params(),
}), { expose: { label: 'Save the drafted room' } })))
    /**
     * **Where the party stand** (B6): the world's `location`, read at
     * `world.location` inside the session's state (the preset's
     * `path`), else the knock's `vantage` — the room its planner said
     * the party stood in (A27) — resolved against the rooms by the
     * Lair's name rule. The world's value first and the plan's hint
     * second is the order `{{locationEntry}}` reads them in on a play
     * turn; the hint here is the knock turn's own, which no prompt in
     * that turn showed. A location set to a place entry is that entry.
     * `entryId` is the room, or null when nothing the dungeon lists
     * answers — words naming no room, or neither a location nor a hint.
     */
    .task('here', ($) => C.undescribedName.v1({
    name: $.gather.state.read.state,
    fallbackName: $.answer.vantage,
    locationEntries: $.gather.rooms.read.entries,
    params: slot.params(),
}))
    /**
     * **The way between them** (B6): one relationship from the room
     * just written to the room the party stand in, `leads to` both
     * ways (the preset) — only when `here` found one. The junction
     * publishes whichever `save` ran as `room.entryId`. Nothing fires
     * otherwise: the room stays saved, unlinked, and the story goes on.
     */
    .junction('link', { on: ($) => $.here.entryId }, (r) => r.when('resolved', { truthy: true }, (c) => c.outlet('write', ($) => C.linkLoreEntries.v1({
    from: $.room.entryId,
    to: $.here.entryId,
    params: slot.params(),
}))))
    /**
     * The master's line that sends the party on (B12) — after the
     * room's write, so it is said only once the room exists. Written
     * as the person who pressed (`presser`, `user:<id>`: a user row,
     * their own line), which is what makes it a send: the turn order
     * prepares the Castellan's turn and auto-advance takes it, as
     * after any send.
     */
    .task('onward', ($) => C.joinText.v1({
    items: ['The party go on into', $.answer.referent],
    params: slot.params(),
}))
    .outlet('resume', ($) => C.createMessage.v1({
    text: $.onward.text,
    speaker: $.input.presser,
}))
    /**
     * ⚠ **The draft's gate is the point, not a precaution.**
     * `create-lore-entry` declares `review: { fields: ['name',
     * 'content'] }` and `resolvePosition` defaults an undeclared
     * position to `off`, so without this line the Castellan's draft
     * would land unseen. On, the run parks and the master gets the
     * *Build room* form with the draft already in it. The typed room
     * is `off` by name: the master wrote it (R9).
     */
    .preset('lair', { label: 'Lair', default: true }, (p) => p
    .settings('room.typed.save', { review: 'off' })
    .settings('room.drafted.save', { review: 'on' })
    // A room is a place (L3), however it was written.
    .params('room.typed.save', { entryType: 'core:entry/location' })
    .params('room.drafted.save', { entryType: 'core:entry/location' })
    // Plain names, one sentence (B12).
    .params('onward', { path: '', separator: ' ' })
    // B6: the rooms, where the party stand, and the way
    // between — one row, read the same from either end.
    .params('gather.rooms.read', { entryTypes: ['core:entry/location'] })
    .params('here', { path: 'world.location' })
    // The room the place slot shows (the room rule) — the world's
    // location alone, where `here` also falls back to the vantage.
    .params('place', { path: 'world.location' })
    .params('link.resolved.write', { linkType: 'leads to', reverseLinkType: 'leads to' }))
    .build());
/* ── File as a room ─────────────────────────────────────────────────────── */
/** @internal */
export const LAIR_FILE_ROOM_SPEC_ID = 'core:spec/lair-file-room';
/** @internal */
export const LAIR_FILE_ROOM_VERSION = '1.0.0';
/**
 * **File as a room** — a room described in a message reaches the lorebook
 * (lair re-plan R11, 2026-09-28; owner ruling 1: the Sanctum is where the map
 * is laid out ahead of time, and a planned room reaches the lorebook only
 * through a review-gated write).
 *
 * The rooms worth filing are written in prose first: the master narrates the
 * party into one on `main` (the person is the narrator, F2), plans one with the
 * Castellan in the Sanctum, or the Castellan narrates one when it is fired. So
 * this lives on the **message** — a row's ⋮ — and acts on that row: its text is
 * read by id (`session-history@1`'s `messageId`, the inlet's), never sent by
 * the client.
 *
 * **Whose rows.** The person's and the Castellan's — any row that is not a
 * character's line (`item.characterLine equals false`, the grammar's one
 * condition: *the person's or the Castellan's* is exactly *not a delver's*). A
 * delver naming a door is not the dungeon's plan, which is the same rule the
 * room check applies to prose (`undescribed-name@1`, R7). Greyed there with
 * the sentence, and refused at the door with the same one.
 *
 * **The name is collected** (R3's collect modal): required, because it is what
 * the person can find the room by again (*Build room*'s rule), because a
 * message may describe more than one room and the name says which, and
 * because it is what the duplicate check runs on — before any model call, so
 * a room already in the book costs nothing. It stays editable at the review
 * gate, where the draft is.
 *
 * **Then, R9's drafted path.** A room already in the book by the SDK's name
 * rule (`undescribed-name@1` over the location entries, then the whole book;
 * no prose read — the row itself is prose) is not filed twice: the Castellan
 * says so on the Sanctum, and nothing is written. Otherwise the Castellan
 * drafts the entry from that one row in *Build room*'s layout
 * (`LAIR_ROOM_CONTENT_SHAPE`, `Exits:` when the message names them) and
 * `create-lore-entry`'s **review gate** holds it — even from the person's own
 * row, because the row may say more than the room. Approved, it lands as a
 * **location**; rejected, nothing is written.
 *
 * ⚠ **`effects: 'world'` in the `message` venue.** A row's ⋮ is the owner's
 * side of the effects line since this action (`WORLD_ACTION_VENUES`, R11):
 * the owner's own press, the row its subject. `act` stays `owner`; no block
 * names it; no answer pipeline presses it.
 * @internal
 */
export const lairFileRoomSpec = () => compile(spec(LAIR_FILE_ROOM_SPEC_ID, {
    version: LAIR_FILE_ROOM_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'file',
                venue: { kind: 'message' },
                icon: 'map',
                /** The room's name (R3): which room, what it is found by, what the duplicate check reads. */
                collects: {
                    text: {
                        need: 'required',
                        label: { en: 'Room name' },
                        placeholder: { en: 'The Sunken Vault' },
                    },
                },
                enabledWhen: [
                    {
                        on: 'item.characterLine',
                        equals: false,
                        reason: {
                            en: "a delver's line is theirs, not the dungeon's plan — file a room from your own lines or the Castellan's",
                        },
                    },
                    {
                        on: 'item.hidden',
                        equals: false,
                        reason: { en: 'unhide it first — a hidden message is left out of what the Castellan reads' },
                    },
                    { on: 'item.generating', equals: false, reason: { en: 'wait for the message to finish' } },
                ],
                /** Lorebook data: outside the story (R-15 *The line*), the owner's alone. */
                effects: 'world',
                audience: { see: ['participant'], act: ['owner'] },
                label: { en: 'File as a room' },
                description: {
                    en: 'Save the room this message describes to the lorebook. Name it; the Castellan drafts the entry from the message, and you edit it before it is saved.',
                },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionAction,
})
    .gather('gather', { mode: 'parallel' }, (b) => b
    /** The message the press was made on — one row, by id. */
    .chain('row', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    messageId: $.input.messageId,
    params: slot.params(),
})))
    /** The book's public half — world lore and history, never character lore (see the note on `CASTELLAN`). */
    .chain('worldLore', (c) => c.query('read', ($) => C.worldLore.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('historyEntries', (c) => c.query('read', ($) => C.historyEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params({ node: 'gather.worldLore.read' }),
})))
    /** The dungeon's rooms (location entries, the preset): checked first, and named to the draft. */
    .chain('rooms', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Rooms' } }))
    /** The whole book, any entry type — a room is filed when ANY entry answers to its name (R7). */
    .chain('lorebook', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))))
    /**
     * Is the name already in the book — the SDK's name rule, entries
     * only (`messages` unwired: the row being filed is prose, and would
     * describe the room it describes). `undescribed` is the name,
     * trimmed, when nothing answers to it.
     */
    .task('check', ($) => C.undescribedName.v1({
    name: $.input.text,
    locationEntries: $.gather.rooms.read.entries,
    entries: $.gather.lorebook.read.entries,
    params: slot.params(),
}))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('room.new.write'),
    connection: slot.connectionOf('room.new.write'),
    params: slot.params(),
}))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [
        $.gather.row.read.band,
        $.gather.worldLore.read.main,
        $.gather.historyEntries.read.main,
    ],
}))
    // The room `{{locationEntry}}` shows (the room rule, 2026-10-02):
    // the world's location at `world.location` (the preset's `path`),
    // by the one room rule; the ranker leaves it out of the lore.
    .task('place', ($) => C.undescribedName.v1({
    name: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    params: slot.params(),
}), { expose: { label: 'The current place' } })
    // Who is in the world at the session's moment (R4), for `eligible`.
    .query('presences', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))
    // The hard gates before the ranker (C2; R2, R4): selective-logic
    // exclusions from the keyword lanes, and the presence gate.
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.lore.candidates,
    exclusions: [$.gather.worldLore.read.exclusions, $.gather.historyEntries.read.exclusions],
    presences: $.presences.main,
    at: $.presences.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.eligible.candidates,
    budget: $.contextBudget.available,
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}))
    /**
     * 🚧 **The files those rows show** (attachments follow-ups, owner
     * ruling 2026-10-03), read once on the spine; the drafting arm below
     * places them for `room.new.write` — an image it can read rides its own
     * turn, otherwise its name. No files, and the arm's prompt is byte for
     * byte what it was.
     */
    .query('attachments', ($) => C.historyAttachments.v1({
    messages: $.gather.row.read.messages,
    params: slot.params(),
}))
    .junction('room', { on: ($) => $.check.undescribed }, (r) => r
    /**
     * Not in the book: the Castellan drafts it from the row, in
     * the dungeon's layout, and the master edits it at the gate.
     * The name is the one typed (trimmed); the other rooms are
     * named to the draft so its exits can point at them.
     */
    .when('new', { truthy: true }, (c) => c
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    turnDirection: $.check.undescribed,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /** The one row, as prose: the draft is written from it and nothing else said. */
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.row.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.room.new.context.templateContext,
}))
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.room.new.lines.messages,
    attachments: $.attachments.attachments,
    connection: slot.connectionOf('room.new.write'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.room.new.attached.messages,
    templateContext: $.room.new.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'room.new.context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('room.new.write'),
}))
    .oracle('write', ($) => C.generateText.v1({
    context: $.room.new.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'The Castellan drafts the room' } })
    .outlet('save', ($) => C.createLoreEntry.v1({
    name: $.check.undescribed,
    content: $.room.new.write.text,
    params: slot.params(),
})))
    /**
     * Already in the book: nothing is filed twice. The Castellan
     * says so at its own table — a plain line, no model call —
     * so the press is answered rather than silent.
     */
    .otherwise('exists', (c) => c
    .task('note', ($) => C.joinText.v1({
    items: [
        $.input.text,
        'is already in the lorebook, so nothing new was filed. Edit that entry to change it.',
    ],
    params: slot.params(),
}))
    .outlet('said', ($) => C.createMessage.v1({
    text: $.room.exists.note.text,
    speaker: CASTELLAN,
    channel: SANCTUM_CHANNEL,
}))))
    /**
     * ⚠ **The gate is the point** — `resolvePosition` defaults an
     * undeclared review position to `off`, so without this line the
     * draft would land unseen. A room is a place (L3).
     */
    .preset('lair', { label: 'Lair', default: true }, (p) => p
    .settings('room.new.save', { review: 'on' })
    .params('room.new.save', { entryType: 'core:entry/location' })
    .params('gather.rooms.read', { entryTypes: ['core:entry/location'] })
    .params('room.exists.note', { path: '', separator: ' ' })
    // The room the place slot shows (the room rule).
    .params('place', { path: 'world.location' }))
    .build());
/* ── The two steering actions that write state ──────────────────────────── */
/** @internal */
export const LAIR_NUDGE_SPEC_ID = 'core:spec/lair-nudge';
/** @internal */
export const LAIR_NUDGE_VERSION = '1.0.0';
/**
 * **Nudge**: a directive to the Castellan's planner that produces no message.
 *
 * The shortest pipeline in the catalog that does anything: no model call, no
 * retrieval, no transcript. The collected text (R3) becomes
 * `core:slot/direction@1` on the world, the planner takes `state` on its own
 * port, and the note is in the next turn's prompt.
 *
 * ⚠ **`apply`, not `propose`** — the one place in this genre where a state
 * write skips the review the state-keeper's changes get. The argument for
 * `propose` is that a *model* is not authoritative about the fiction
 * (`set-state`'s own header). Here the writer is the person who owns the
 * session, typing into their own composer, and asking them to accept their own
 * instruction would be a dialog asking "did you mean what you just typed".
 * @internal
 */
export const lairNudgeSpec = () => compile(spec(LAIR_NUDGE_SPEC_ID, {
    version: LAIR_NUDGE_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'nudge',
                venue: { kind: 'composer' },
                quick: true,
                icon: 'compass',
                /** The direction is the whole instruction (R3): nothing to do without it. */
                collects: {
                    text: { need: 'required', label: { en: 'Direction the party should feel' } },
                },
                label: { en: 'Nudge' },
                description: {
                    en: 'Tell the Castellan what you want next. It writes no message — the next turn just follows it.',
                },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionAction,
})
    .query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
    /**
     * A literal change with the collected text in it. A nested literal
     * is how one port takes a reference (`concat-candidates`' `sources`
     * is the same construction), and this node is here rather than
     * `set-state` alone because it is what turns the word `world` into
     * a row and `direction` into `core:slot/direction@1` — and what
     * refuses a note longer than the slot accepts, with a sentence.
     */
    .query('resolve', ($) => C.resolveStateChanges.v1({
    changes: [
        { owner: 'world', slot: 'direction', value: $.input.text },
    ],
    scope: $.input.sessionScope,
    base: $.state.version,
}))
    .task('apply', ($) => C.setState.v1({
    changes: $.resolve.changes,
    scope: $.input.sessionScope,
    base: $.state.version,
    params: slot.params(),
}))
    .preset('lair', { label: 'Lair', default: true }, (p) => p.params('apply', { mode: 'apply' }))
    .build());
/** @internal */
export const LAIR_WHISPER_SPEC_ID = 'core:spec/lair-whisper';
/** @internal */
export const LAIR_WHISPER_VERSION = '1.0.0';
/**
 * **Whisper**: a private instruction to the delvers the master picks, which
 * writes no message (lair re-plan R10, owner ruling 5, 2026-09-28).
 *
 * The press collects **who hears it** (`collects.recipients`, the session's
 * enabled cast, validated by the host) and **what it says**
 * (`collects.text`), and the run writes that line on
 * `core:slot/whisper@1` of each recipient — `resolve-state-changes@1`'s
 * `owners` port makes the one change once per recipient. **Pure:** no model
 * call. The model step that read a name off the typed line ("Verity: hold
 * the line") and its "Lair whisper" prompt row are retired: the modal asks
 * who, so nothing has to guess.
 *
 * **Heard by the recipients alone** (earshot, lair pass R1): the slot
 * declares `earshot: 'holder'`, so each recipient's own voice reads it and no
 * other prompt does — not another delver's, and none of the Castellan's
 * (planner, keeper, narration, Sanctum talk). A whispered delver acts on it
 * when they next speak; **Pick who speaks** gives them the floor now.
 *
 * ⚠ One standing note per delver, not a queue: a slot holds one value, so a
 * new whisper REPLACES a recipient's old one, and a delver it does not name
 * keeps theirs. The modal shows each delver's current whisper
 * (`recipients.overwrites`), so the overwrite is visible before it happens.
 * @internal
 */
export const lairWhisperSpec = () => compile(spec(LAIR_WHISPER_SPEC_ID, {
    version: LAIR_WHISPER_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'whisper',
                venue: { kind: 'composer' },
                quick: true,
                icon: 'ear',
                /** Who hears it and what it says (R3, R10): nothing to do without either. */
                collects: {
                    recipients: {
                        label: { en: 'Who hears it' },
                        min: 1,
                        overwrites: 'core:slot/whisper@1',
                    },
                    text: { need: 'required', label: { en: 'What do you whisper?' } },
                },
                label: { en: 'Whisper' },
                description: {
                    en: 'Tell the delvers you pick something only they hear. Nobody else does — not the rest of the party, and not the Castellan.',
                },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionAction,
})
    .query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
    /**
     * One change naming no owner, made once per recipient: the
     * `owners` port is what turns `character:<id>` into that seated
     * delver's row, and the slot's own validation is what refuses a
     * line longer than it accepts, with a sentence.
     */
    .query('resolve', ($) => C.resolveStateChanges.v1({
    changes: [{ slot: 'whisper', value: $.input.text }],
    owners: $.input.recipients,
    scope: $.input.sessionScope,
    base: $.state.version,
}))
    /** Applied rather than proposed — the master's own instruction; see Nudge. */
    .task('apply', ($) => C.setState.v1({
    changes: $.resolve.changes,
    scope: $.input.sessionScope,
    base: $.state.version,
    params: slot.params(),
}))
    .preset('lair', { label: 'Lair', default: true }, (p) => p.params('apply', { mode: 'apply' }))
    .build());
/* ── The Castellan's two turns ──────────────────────────────────────────── */
/**
 * Trigger trap and Reveal are one graph with two sets of instructions, and
 * saying so in a builder is more honest than writing it twice — Adventure's
 * `keeperAction` makes the same call for the same reason.
 *
 * Both are Adventure's *Look*: the Castellan describes something from the lore
 * and the world state, changes nothing, and writes one message. They are
 * separate SPECS rather than one spec with a parameter because a shipped
 * prompt is resolved per (pool, spec) — two specs is what gives the trap its
 * own instructions and the reveal its own, in the same pool, each editable
 * without touching the other.
 */
const castellanAction = (id, version, trigger) => compile(spec(id, {
    version,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: trigger.key,
                venue: { kind: 'composer' },
                quick: true,
                icon: trigger.icon,
                /** What the master says rides as the turn's instructions — or nothing, and the room decides (R3). */
                collects: {
                    text: { need: 'optional', label: { en: trigger.ask }, ifEmpty: { en: 'The room decides.' } },
                },
                label: { en: trigger.label },
                description: { en: trigger.description },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionAction,
})
    /**
     * The row, opened before anything is read — the Castellan's, by
     * name (R8, owner F2 2026-09-28: Trap and Reveal are the
     * Castellan's). Not `narration`: a trap is the Castellan taking a
     * turn, not a side note beside one. It streams while `write` runs
     * (`expose.stream`) and `save` finishes it. What the master typed
     * is stored beside it as the turn's instructions — never as its
     * text.
     */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    speaker: `envoy:${LAIR_CASTELLAN_KEY}`,
    instructions: $.input.text,
}))
    // Before the reads (history window, 2026-10-03): the history read
    // is sized by this budget, so it is computed first. It reads only
    // config, never a step, so moving it changes no value.
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('write'),
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    // Sized by the window (history window, 2026-10-03).
    budget: $.contextBudget.available,
    params: slot.params(),
})))
    .chain('lore', (c) => c.query('read', ($) => C.lorebookTriggers.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [$.gather.history.read.band, $.gather.lore.read.main],
}))
    // Who is in the world at the session's moment (R4), for `eligible`.
    .query('presences', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))
    // The hard gates before the ranker (C2; R2, R4): selective-logic
    // exclusions from the keyword lanes, and the presence gate.
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.lore.candidates,
    exclusions: $.gather.lore.read.exclusions,
    presences: $.presences.main,
    at: $.presences.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.eligible.candidates,
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    /**
     * `build-template-context@1` rather than the narrator builder,
     * builder, for the one port that decides it: `state`. A trap that
     * did not know which floor the party is on, and a reveal that did
     * not know where they are standing, would be describing a dungeon
     * in general.
     */
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    /**
     * What the master typed — *"the floor gives way"* — as
     * what to spring or reveal (B17). The prompt renders it as
     * `{{turnDirection}}`; blank, the room decides.
     */
    turnDirection: $.input.text,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext,
    seedName: $.context.seedName,
}))
    /**
     * 🚧 **The transcript's files, placed** (attachments follow-ups, owner
     * ruling 2026-10-03) — `respond`'s two steps: the files the rows show,
     * then per line what `write` receives (an image it can read rides its
     * own turn; otherwise its name). A transcript with no files passes
     * through untouched, so the prompt is byte for byte what it was.
     */
    .query('attachments', ($) => C.historyAttachments.v1({
    messages: $.gather.history.read.messages,
    params: slot.params(),
}))
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.lines.messages,
    attachments: $.attachments.attachments,
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.attached.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('write'),
}))
    .oracle('write', ($) => C.generateText.v1({
    context: $.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { stream: true, status: trigger.status } })
    /**
     * The placeholder, finished: the prose, and the Castellan's
     * reasoning folded as the row's Reasoning (the B5 pattern — absent
     * when the model gave none, and the port is skipped).
     */
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.placeholder.messageId,
    text: $.write.text,
    reasoning: $.write.reasoning,
}))
    /**
     * What this step ships with: the post-history reminder's trigger
     * (`POST_HISTORY_TOKEN_TRIGGER`), because the prompt renders the
     * session's growing history and the reminder only earns its place
     * once there is enough of it to drift from.
     */
    .preset('default', { label: 'Default', default: true }, (p) => p.params('prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER }))
    .build());
// ⚠ Trap and Reveal, edited in place (history window, 2026-10-03) —
// content-addressed; `specHashes.test.ts` records the move. The shared
// `castellanAction` computes `contextBudget` before the reads and its history
// read takes the `budget`, so the transcript fit, not the newest 100 rows,
// decides where the conversation starts.
/** @internal */
export const LAIR_TRAP_SPEC_ID = 'core:spec/lair-trap';
/** @internal */
export const LAIR_TRAP_VERSION = '1.0.0';
/** Spring something the party walked into. The Castellan tells them what it cost. @internal */
export const lairTrapSpec = () => castellanAction(LAIR_TRAP_SPEC_ID, LAIR_TRAP_VERSION, {
    key: 'trap',
    icon: 'zap',
    label: 'Trigger trap',
    description: 'Springs a trap in the room the party are in, and the Castellan tells what it cost them. Say what the trap is, or leave it to the room.',
    status: 'Springing a trap',
    ask: 'What is the trap?',
});
/** @internal */
export const LAIR_REVEAL_SPEC_ID = 'core:spec/lair-reveal';
/** @internal */
export const LAIR_REVEAL_VERSION = '1.0.0';
/** Show the party something that was already there. @internal */
export const lairRevealSpec = () => castellanAction(LAIR_REVEAL_SPEC_ID, LAIR_REVEAL_VERSION, {
    key: 'reveal',
    icon: 'eye',
    label: 'Reveal',
    description: 'Uncovers something hidden in the room the party are in — a detail that was there all along. Say what they notice, or leave it to the room.',
    status: 'Revealing',
    ask: 'What do they notice?',
});
//# sourceMappingURL=lairActions.js.map