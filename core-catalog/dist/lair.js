/**
 * The **Lair** genre's two required pipelines: make a dungeon, and take a turn
 * inside it (plans/genres-and-showcase-plugins §3).
 *
 * ## The one idea
 *
 * Adventure asks *what does the world do to the player*. Lair asks the other
 * one: the person at the keyboard **is** the dungeon, and the party delving
 * into it is the AI. Everything structural follows from that inversion —
 * `personas.max: 0` (the master is not in the scene), `voice: 'narrator'` (the
 * pipeline has a voice of its own: the turn order's null entry, `carryOnEntry`,
 * the Narrate press and the seed line all name it — it does not mean a narrator
 * writes every turn) and, here in the spec, the one thing no shape value says:
 *
 * ## The composer's text is DIRECTION, not a line
 *
 * `$.input.text` reaches the planner as *instructions from whoever is running
 * this place*, never as a participant's turn — the planner's shipped prompt
 * says so in those words, and the seed line is the own voice's (the
 * Castellan's), so nothing the master types is ever continued as dialogue. That is a decision this pipeline
 * makes about prose the shape already declared nobody owns; a fourth shape
 * value for it would restate `personas: { max: 0 }` in a second vocabulary.
 *
 * ## A turn is the Castellan's (R8, owner F2/F4/F6 2026-09-28)
 *
 * The Lair is cast only, and **the person is the narrator**: their lines on
 * `main` are what the dungeon does. Nothing narrates a turn. A turn is one
 * run of the dungeon's steward, the Castellan (the turn order's pre-cast
 * entry, the pipeline's own voice):
 *
 *  1. the **planner** plans the party — who speaks, and why — never a dungeon
 *     event;
 *  2. then **either the knock** — one complete Castellan question on `main`,
 *     and nothing else — **or the play**:
 *     - the **beats row** in the Sanctum, first, whole (a list, nothing to
 *       stream), so the master reads the plan while the party speak;
 *     - the **party**, in the session's **party speech** (`partySpeech`,
 *       owner ruling 2026-09-30): while each delver speaks, the beats row
 *       is the **plan row** and carries the turns it plans (`turnPlan`) —
 *       nobody speaks in this run; while the Castellan speaks for the
 *       party, one streamed call writes every named delver's lines;
 *  3. the **keeper** keeps the **world's** books — and, while the Castellan
 *     speaks for the party, the books of the delvers it voiced: whoever
 *     writes a delver's line keeps that delver's stats. Its changes are
 *     filed at the beats row (`set-state`'s declared `worldRow`).
 *
 * ## Each delver's line is a character turn (owner ruling 2026-09-30)
 *
 * "They are character turns, not first delver, later delver." Each delver
 * the plan names takes a **character turn**: a run of this same spec whose
 * subject is that delver (`input.characterId`), fired off the session's
 * turn order. The Lair's turn-order strategy reads the standing plan off the
 * history and prepares one entry per turn not yet taken (`via: 'plan'`);
 * auto-advance fires them one after another. Each streams the delver's line
 * into their own row, reads only that delver's private lore and the stats
 * of their own place, and keeps only that delver's books. Every character
 * turn runs on ONE set of settings (the **Character turn** group): there is
 * no first and no later. Pick who speaks fires the same turn.
 *
 * **Narrate** (`core#narrate`, `via: 'narrate'`) is the other thing the
 * Castellan does: one streamed narration on `main`, whichever composer
 * fired it — it is fiction, and the party only ever hear `main`. It is
 * routed first, ahead of the Sanctum and the story.
 *
 * ## One live row per execution path (F7, amended 2026-09-28)
 *
 * Each branch opens the row it fills where it needs it — the Castellan's
 * narration, its Sanctum talk, the knock, a character turn's line, the
 * Castellan's lines for the party — and at most one of them runs in any
 * execution. A character turn is its own run, so every delver's line is
 * that run's live row and streams.
 *
 * ## Pick who speaks (B15, owner D2a 2026-09-27)
 *
 * A run whose subject is a delver — the `core#pick` turn control, a planned
 * character turn — takes the `pick.picked` branch: no planner, so no beats
 * and no Castellan keeper, and that delver is the one speaker the play hands
 * to the party speech — their character turn, or the Castellan asked for
 * their line alone — into their own row, streamed. The same branch re-voices
 * a delver's row on a regenerate or swipe.
 *
 * ## What folds
 *
 * The beats are the Sanctum row's BODY (the B5 Plan fold is retired, R8);
 * the delvers' rows carry only their lines; a narration keeps its
 * **Reasoning**. The planner's and keeper's traces stay on the receipt.
 *
 * ## Sanctum talk steers the story, when the person says so (R13)
 *
 * The genre field `sanctumSteers` (on by default, owner F3/QB 2026-09-28).
 * On, the planner reads the **unplayed talk** — the Sanctum rows since the
 * story's newest generated line, only people's lines and the Castellan's
 * replies to them (`session-history@1` `unplayedOnly`) — and the Castellan's
 * **scratchpad**, each as its own labelled block (`sideTalk`, `scratchpad`).
 * Off, it reads neither. The narration reads the talk while the switch is
 * on, or whenever Narrate was pressed in the Sanctum (`input.channel`).
 * The delvers and the keeper never read either. The Castellan rewrites its
 * scratchpad after each Sanctum reply (see `sanctumBranch`).
 *
 * ## The party knocks
 *
 * When the planner says the party is walking into a room nothing describes,
 * the turn **halts** and the Castellan asks the master to describe it instead
 * of playing a room nobody built. That is the U5d form machinery pointed at a
 * person rather than at a character: a `choices` block addressed to `owner`,
 * carried by the Castellan's question row on `main` (no beats, no voices, no
 * keeper — nothing was played), whose one option, *Describe <room>…*, fires
 * `core:spec/lair-room-answer`.
 *
 * **The knock asks for a description** (R9, owner rulings 2 + 6,
 * 2026-09-28). The option's press opens the collect modal: typed text is the
 * room, saved verbatim with no review (the master's own words); an empty
 * answer is the Castellan's draft, which the master edits at
 * `create-lore-entry`'s review gate before it lands. A draft **rejected** at
 * review re-opens the knock — a core rule in the app's review gate: an answer
 * rejected at review that wrote nothing is no answer. See `lairActions.ts`.
 *
 * Writing a lore entry is a `world` effect (R-15 *The line*) and
 * `worldBlockFunctions` refuses any block that names a `world` action —
 * **unless the block is addressed to the owner** (L1, ruled 2026-09-17),
 * which this one is, because the dungeon's master is the only person a
 * question about the dungeon could be put to.
 *
 * **Already described, no knock** (R7; R9, owner QC 2026-09-28): a room the
 * lorebook answers to, or one the master (or the Castellan) described in
 * prose — in the story on `main`, or formally in the Sanctum — is an open
 * door. The prose check reads both channels (`exitProse`, the union), and
 * the paragraph it found reaches the voices as `{{locationPassage}}`.
 *
 * ## Whether a room is new is the planner's guess, checked
 *
 * `unknownExit` is a field the planner fills; `undescribed-name@1` then
 * checks it against the book and recent prose (R7), so a wrong guess costs
 * nothing when the room is described, and one question when it is not.
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { LAIR_CASTELLAN_KEY, lairGenre, POST_HISTORY_TOKEN_TRIGGER, SANCTUM_CHANNEL } from './genres.js';
import { LAIR_ROOM_ANSWER_SPEC_ID } from './lairActions.js';
import { CASTELLAN_SCRATCHPAD_KEY } from './annexField.js';
/* ── create ─────────────────────────────────────────────────────────────── */
/** @internal */
export const LAIR_CREATE_SPEC_ID = 'core:spec/lair-create';
/** @internal */
export const LAIR_CREATE_VERSION = '1.0.0';
/** Where the Castellan's greeting lands — its declaration's channel, read at build like the cards' greeting channel. */
const CASTELLAN_GREETING_CHANNEL = lairGenre.envoys?.find((e) => e.key === LAIR_CASTELLAN_KEY)?.greeting?.channel ?? 'main';
/**
 * The genre's required member (24 §3): what happens when a Lair session is
 * created.
 *
 * **The dungeon welcomes nobody, but its steward welcomes its master** (R6,
 * owner F1 2026-09-28). The cards' greetings are off — the party are delvers
 * who have not arrived yet — so `collect` and `seed` still write nothing,
 * as the guide's do. Then the Castellan's declared greeting
 * (`EnvoyDecl.greeting`), read through `core:query/envoy-greeting@1` and
 * interpolated for this session, is written on the Sanctum under its name —
 * only when it has text, which it lacks when the Castellan is not seated.
 *
 * No model call, deliberately: creation is a synchronous action a person is
 * waiting on (see `adventure-create` for the argument at length). The
 * welcome is declared, so it is instant, translatable and reviewable; the
 * Castellan's first *reply* is where it tailors itself to the dungeon.
 * @internal
 */
export const lairCreateSpec = () => compile(spec(LAIR_CREATE_SPEC_ID, {
    version: LAIR_CREATE_VERSION,
    taxonomy: {
        role: 'create',
    },
    genre: {
        name: lairGenre.name,
        family: lairGenre.family,
        description: lairGenre.description,
        shape: lairGenre.shape,
        events: lairGenre.events,
        // R4: the host names the person's lines off this row.
        playerLabel: lairGenre.playerLabel,
        // R6: the Castellan — which speakers this genre brings is
        // read off this row, as the writing room's scribe is.
        envoys: lairGenre.envoys,
    },
})
    .inlet('input', C.sessionCreated.v1(), {
    genre: lairGenre,
    event: sessionEvents.sessionCreated,
})
    .query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
    .outlet('seed', ($) => C.seedGreetings.v1({
    greetings: $.collect.greetings,
    channel: lairGenre.shape?.greeting?.channel ?? 'main',
}))
    /** The Castellan's greeting, interpolated — empty when it is not seated. */
    .query('welcome', ($) => C.envoyGreeting.v1({ scope: $.input.sessionScope, params: slot.params() }))
    .junction('greet', { on: ($) => $.welcome.text }, (g) => g.when('greets', { truthy: true }, (c) => c.outlet('write', ($) => C.createMessage.v1({
    text: $.welcome.text,
    channel: CASTELLAN_GREETING_CHANNEL,
    speaker: `envoy:${LAIR_CASTELLAN_KEY}`,
}))))
    .preset('lair', { label: 'Lair', default: true }, (p) => p.params('welcome', { envoy: LAIR_CASTELLAN_KEY }))
    .build());
/* ── respond ────────────────────────────────────────────────────────────── */
/** @internal */
export const LAIR_RESPOND_SPEC_ID = 'core:spec/lair-respond';
/**
 * 1.0.0, edited in place (lorebooks C2/C3, 2026-10-02): the vector and entity
 * arms (R3) on the spine, per delver turn (the delver as `speaker`) and on
 * the party call (the Castellan as `speaker`: no member's private lore); a
 * `presences` read and an `eligible` step before every ranker; the room rule
 * — a `place` step (the room `{{locationEntry}}` shows) wired into every
 * ranker as `shownElsewhere` — and statuses on the two embeds.
 * Content-addressed; `specHashes.test.ts` records the move.
 *
 * Edited in place again (history window, 2026-10-03): `contextBudget` runs
 * before the reads; `gather.history.read` and the Sanctum's `talk` take its
 * `budget`, so the transcript fit, not the newest 100 rows, decides where
 * each conversation starts. The story's background rows, the unplayed talk
 * and the room check keep their counts. Content-addressed;
 * `specHashes.test.ts` records the move.
 * @internal
 */
export const LAIR_RESPOND_VERSION = '1.0.0';
/** The values the keeper may set, by the names the prompts use. */
const TRACKED_SLOTS = ['hp', 'stamina', 'mood', 'trust', 'location', 'floor', 'gold'];
/**
 * What the planner answers with.
 *
 * Adventure's schema with the sky taken out and the door put in. Every
 * property is required and every one is a string, an array or an object of
 * those, because the llama.cpp family compiles this to a GBNF grammar and
 * refuses anything outside that set rather than loosening it — see
 * `adventure.ts` for the full argument.
 *
 * `unknownExit` and `knockQuestion` are the halt: the first is the predicate
 * the `turn` junction reads, the second is what the master is asked. Both are
 * written on every turn, most of them empty, because a schema this strict has
 * no optional properties to offer.
 * @internal
 */
export const LAIR_PLAN_SCHEMA = {
    type: 'object',
    properties: {
        beats: { type: 'array', items: { type: 'string' } },
        speakers: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    intent: { type: 'string' },
                },
                required: ['name', 'intent'],
                additionalProperties: false,
            },
        },
        /**
         * The name the party is heading for that the dungeon does not hold an
         * entry for. Empty on every ordinary turn — which is most of them.
         */
        unknownExit: { type: 'string' },
        /** How the Castellan puts that to the dungeon's master. Empty with it. */
        knockQuestion: { type: 'string' },
        /**
         * Where this happens. One hint rather than Adventure's three: a
         * dungeon has no time of day and no weather, and a genre that asked
         * for them would teach its planner to plan a sky.
         */
        worldHints: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
            additionalProperties: false,
        },
    },
    required: ['beats', 'speakers', 'unknownExit', 'knockQuestion', 'worldHints'],
    additionalProperties: false,
};
/**
 * What the state-keeper answers with — Adventure's two lists over this genre's
 * vocabulary.
 *
 * ⚠ `direction` and `whisper` are **not** in `TRACKED_SLOTS`, and their
 * absence is the point: they hold what the dungeon's master told the narrator
 * and the cast, and a keeper that could rewrite them would be a model editing
 * its own instructions between two turns.
 * @internal
 */
export const LAIR_KEEPER_SCHEMA = {
    type: 'object',
    properties: {
        values: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    owner: { type: 'string' },
                    slot: { type: 'string', enum: TRACKED_SLOTS },
                    value: { type: 'string' },
                },
                required: ['owner', 'slot', 'value'],
                additionalProperties: false,
            },
        },
        inventory: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    owner: { type: 'string' },
                    entryId: { type: 'integer' },
                    delta: { type: 'integer' },
                },
                required: ['owner', 'entryId', 'delta'],
                additionalProperties: false,
            },
        },
    },
    required: ['values', 'inventory'],
    additionalProperties: false,
};
/**
 * The knock's one option's key (R9, owner rulings 2 + 6, 2026-09-28): the
 * knock asks the master to **describe** the room — *Describe The Drowned
 * Hall…*, the label built from the room's name at run time (`describeLabel`).
 * Its press opens the collect modal (`lair-room-answer#room` collects
 * optional text). Was `KNOCK_OPTIONS`, two options (build · improvise).
 */
const KNOCK_OPTION_KEY = 'describe';
/**
 * How many of the newest rows, across the story and the Sanctum, the knock's
 * prose check reads (R9) — the check's own `window` default, so the read
 * never holds fewer rows than the check would look at.
 */
const EXIT_PROSE_ROWS = 40;
/** How many of the story's newest rows the Castellan reads while it talks (R6). */
const SANCTUM_STORY_ROWS = 12;
/**
 * **The talk window** (R13): how much unplayed Sanctum talk the planner and
 * the narration read, newest kept. Each talk read's own `limit`, set by the
 * preset — never a second count beside it. (`session-history@1` marks no
 * param `shared`, so each read keeps its own.)
 */
const SANCTUM_TALK_ROWS = 12;
/** How many of the Sanctum's newest rows the scratchpad rewrite reads (R13): the exchange just had. */
const SCRATCHPAD_EXCHANGE_ROWS = 4;
/**
 * What the scratchpad rewrite answers with (R13): the whole scratchpad,
 * rewritten. One required string, for the grammar-compiling families — see
 * `LAIR_PLAN_SCHEMA`.
 * @internal
 */
export const LAIR_SCRATCHPAD_SCHEMA = {
    type: 'object',
    properties: { scratchpad: { type: 'string' } },
    required: ['scratchpad'],
    additionalProperties: false,
};
/** The Castellan, as a participant reference — the name every row it writes carries. */
const CASTELLAN = `envoy:${LAIR_CASTELLAN_KEY}`;
/** Where the story's who-speaks junction sits; the planner is its `planned` branch. */
const PICK = 'via.turn.channel.story.pick';
/** The knock-or-play junction, after it. */
const DOOR = 'via.turn.channel.story.door';
/** The play: the beats, then the party in the session's party speech. */
const PLAY = `${DOOR}.play`;
/** Each delver speaks (`partySpeech` unset or `each`): a character turn, on a run whose subject is a delver. */
const CHARACTER_TURN = `${PLAY}.speech.each.character.turn`;
/** The Castellan speaks for the party (`partySpeech: 'castellan'`). */
const PARTY = `${PLAY}.speech.castellan.party.speaks`;
/** The unplayed-talk reads (R13): the planner's, and the narration's two. */
const TALK_READS = [
    `${PICK}.planned.steer.on.talk`,
    'via.narrate.talk.pressed.read',
    'via.narrate.talk.steered.read',
];
/** The narration's read when nothing crosses (R13): a window of none. */
const NO_TALK_READ = 'via.narrate.talk.none.read';
/** Where the Sanctum branch sits. */
const SANCTUM = 'via.turn.channel.sanctum';
/**
 * **The Castellan talks in the Sanctum** (lair re-plan R6, owner F1/F2
 * 2026-09-28): a line on the `sanctum` channel gets one streamed reply there,
 * under the Castellan's name — out of the fiction, with the Dungeon Master.
 *
 * The Guide's envoy road: `build-template-context` with the Castellan as the
 * `speaker` (its card, `{{char}}`, the seed name; and the earshot filter, so a
 * whisper meant for a delver never reaches it) and its own instructions at
 * `envoy:castellan`. It reads, beside the shared ranked lore:
 *
 *  - every room the dungeon holds and the one the party stand in
 *    (`gather.rooms`, as `{{knownLocations}}` / `{{locationEntry}}`);
 *  - the state;
 *  - **the Sanctum's own history** as the conversation (`talk`);
 *  - **the story's newest 12 rows** as prose in its instructions
 *    (`story`, `{{recentStory}}`) — so it can discuss what happened without
 *    mistaking story lines for table talk.
 *
 * Its own row, opened here (R8: each branch opens the row it fills). Nothing
 * here plans, voices or keeps the books: those are the story's turn
 * (`channel.story`). The story's history read is `main`; what of this talk
 * steers the next turn is R13's (`planned.steer`, `via.narrate.talk`).
 *
 * **The scratchpad** (R13, owner QB 2026-09-28): the Castellan reads its own
 * running notes here (`{{scratchpad}}`), and **rewrites them after each
 * reply** — one Background JSON call over the exchange just had
 * (`padWrite`, the whole scratchpad back), written to the annex field
 * `castellan-scratchpad` only when the answer has text. A separate call
 * rather than a tail on the reply, because the reply streams: a notes block
 * at its end would stream into the person's view before a save could strip
 * it. The person may edit the notes by hand (the Session data panel).
 */
const sanctumBranch = (s) => s
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    channel: SANCTUM_CHANNEL,
    speaker: CASTELLAN,
    row: $.input.messageId,
}), { expose: { label: "Open the Castellan's Sanctum reply" } })
    // The Sanctum is the conversation here, so its read is sized by the
    // window like the story's (history window, 2026-10-03); the story's
    // own rows below keep their count — they are background.
    .query('talk', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    budget: $.contextBudget.available,
    params: slot.params(),
}), { expose: { label: 'Sanctum talk' } })
    // 🚧 The files the talk shows (PLAN-composer-attachments §3.5).
    .query('talkAttachments', ($) => C.historyAttachments.v1({
    messages: $.via.turn.channel.sanctum.talk.messages,
    params: slot.params(),
}))
    .query('story', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), { expose: { label: 'The story so far' } })
    /** Its scratchpad, as text (R13) — the key read off the gathered annex view. */
    .task('pad', ($) => C.joinText.v1({
    items: [$.gather.scratchpad.read.main],
    params: slot.params(),
}), { expose: { label: 'The scratchpad, as text' } })
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    speaker: CASTELLAN,
    state: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    recentStory: $.via.turn.channel.sanctum.story.messages,
    // Whether this talk steers (R13): `{{sanctumSteers}}`.
    fields: $.input.fields,
    scratchpad: $.via.turn.channel.sanctum.pad.text,
    prompts: slot.prompts({ envoy: LAIR_CASTELLAN_KEY }),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.via.turn.channel.sanctum.talk.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.turn.channel.sanctum.context.templateContext,
    seedName: $.via.turn.channel.sanctum.context.seedName,
}))
    // 🚧 This voice's attachments, placed on its own pair (§3.5).
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.via.turn.channel.sanctum.lines.messages,
    attachments: $.via.turn.channel.sanctum.talkAttachments.attachments,
    connection: slot.connectionOf('via.turn.channel.sanctum.say'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.turn.channel.sanctum.attached.messages,
    templateContext: $.via.turn.channel.sanctum.context.templateContext,
    template: slot.template(),
    // The envoy's text arrives through `templateContext` — see
    // the guide's `prompt` node for why this one-hop read is not
    // how it gets there.
    prompts: slot.prompts({ node: 'via.turn.channel.sanctum.context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('via.turn.channel.sanctum.say'),
}))
    /** This execution path's one streaming step. */
    .oracle('say', ($) => C.generateText.v1({
    context: $.via.turn.channel.sanctum.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        stream: true,
        status: 'Considering',
        label: 'Castellan in the Sanctum',
        purpose: 'The Castellan answers you in the Sanctum, as itself. Its instructions are its own; edit them here.',
    },
})
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.via.turn.channel.sanctum.placeholder.messageId,
    text: $.via.turn.channel.sanctum.say.text,
    reasoning: $.via.turn.channel.sanctum.say.reasoning,
}), { expose: { label: "Fill the Castellan's Sanctum reply" } })
    /* ── the scratchpad, rewritten after the reply (R13) ─────────────── */
    /** The exchange just had: the Sanctum's newest rows, the saved reply included. */
    .query('padExchange', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), { expose: { label: 'The Sanctum exchange just had' } })
    .task('padContext', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    speaker: CASTELLAN,
    state: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    scratchpad: $.via.turn.channel.sanctum.pad.text,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('padLines', ($) => C.proseTranscript.v1({
    messages: $.via.turn.channel.sanctum.padExchange.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.turn.channel.sanctum.padContext.templateContext,
}))
    .task('padPrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.turn.channel.sanctum.padLines.messages,
    templateContext: $.via.turn.channel.sanctum.padContext.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: `${SANCTUM}.padContext` }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf(`${SANCTUM}.padWrite`),
}))
    .oracle('padWrite', ($) => C.generateJson.v1({
    context: $.via.turn.channel.sanctum.padPrompt.context,
    schema: LAIR_SCRATCHPAD_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        status: 'The Castellan takes notes',
        label: "Castellan's scratchpad",
        purpose: 'After each Sanctum reply, the Castellan rewrites its private notes: rooms planned, intentions, corrections.',
    },
})
    /** The rewritten scratchpad, off its document (the preset's path). */
    .task('padText', ($) => C.parseJson.v1({
    text: $.via.turn.channel.sanctum.padWrite.text,
    params: slot.params(),
}), { expose: { label: 'Read the new scratchpad' } })
    /**
     * Written only when the answer has text: an empty or unreadable
     * answer leaves the scratchpad as it was. The key is declared in
     * `CORE_ANNEX_FIELDS` (audience: the Castellan alone).
     */
    .junction('padKeep', { on: ($) => $.via.turn.channel.sanctum.padText.value }, (j) => j.when('kept', { truthy: true }, (k) => k.outlet('write', ($) => C.setSessionAnnex.v1({
    value: {
        [CASTELLAN_SCRATCHPAD_KEY]: $.via.turn.channel.sanctum.padText.value,
    },
    params: slot.params(),
}))));
/**
 * **The Castellan narrates** (R8, owner F2 2026-09-28): the `core#narrate`
 * turn control, fired from either composer (`via: 'narrate'`). What the
 * dungeon does next, in the third person, on `main` — it is fiction, and the
 * party only ever hear `main`. No planner and no voices: the party answer on
 * the next turn. The keeper runs after it, on the spine (`keep`).
 *
 * The scene context's builder, under the Castellan's narration row (the
 * build-scene-context pool's Lair row), with no turn direction: Narrate is
 * "what happens next, with no new direction".
 *
 * **The unplayed talk** (R13): the narration reads the Sanctum talk since the
 * story's last line (`sideTalk`) when **Narrate was pressed in the Sanctum**
 * — that press is the person saying "play this", whatever the switch says —
 * or while the session's _Sanctum talk steers the story_ is on. The `talk`
 * junction routes on the pressed channel and the genre field side by side
 * (`asked`, a `pair`); every branch ends in the same read, and the
 * junction hands the fired one's rows on (`talk.messages`). Pressed in the
 * Sanctum with the switch on, both fire and the first answers; neither,
 * and the `otherwise` reads a window of none.
 */
const narrateBranch = (n) => n
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    channel: 'main',
    speaker: CASTELLAN,
    row: $.input.messageId,
}), { expose: { label: 'Open the narration' } })
    /** Where Narrate was pressed, beside the session's fields — one document to route on. */
    .task('asked', ($) => C.pair.v1({
    first: $.input.channel,
    second: $.input.fields,
    params: slot.params(),
}))
    .junction('talk', { on: ($) => $.via.narrate.asked.main }, (j) => j
    .when('pressed', { path: 'channel', equals: SANCTUM_CHANNEL }, (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Sanctum talk, Narrate pressed there' } }))
    .when('steered', { path: 'fields.sanctumSteers', truthy: true }, (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Sanctum talk, while it steers the story' } }))
    /**
     * Neither: nothing crosses. The same read with a window of
     * none (`limit: 0`), because a junction hands on a port only
     * when every branch — its `otherwise` too — publishes it.
     */
    .otherwise('none', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Sanctum talk, none crossing' } })))
    .task('context', ($) => C.buildSceneContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    fields: $.input.fields,
    locationEntries: $.gather.rooms.read.entries,
    sideTalk: $.via.narrate.talk.messages,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.narrate.context.templateContext,
    seedName: $.via.narrate.context.seedName,
}))
    // 🚧 This voice's attachments, placed on its own pair (§3.5).
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.via.narrate.lines.messages,
    attachments: $.gather.history.attachments.attachments,
    connection: slot.connectionOf('via.narrate.say'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.narrate.attached.messages,
    templateContext: $.via.narrate.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'via.narrate.context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('via.narrate.say'),
}))
    .oracle('say', ($) => C.generateText.v1({
    context: $.via.narrate.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        stream: true,
        status: 'The Castellan narrates',
        label: "Castellan's narration",
        purpose: 'When you press Narrate, the Castellan describes the scene in its own voice.',
    },
})
    /** The narration, and its reasoning folded as the row's Reasoning. */
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.via.narrate.placeholder.messageId,
    text: $.via.narrate.say.text,
    reasoning: $.via.narrate.say.reasoning,
}), { expose: { label: 'Fill the narration' } });
/**
 * **The knock** (B13; R8; R9): the planner says the party are walking into a
 * room nothing describes, so the Castellan asks the master to describe it
 * instead of playing. One complete question row on `main` under the
 * Castellan's name, carrying the question as a `choices` block with one
 * option — *Describe <room>…* — and no beats, no voices, no keeper: nothing
 * was played. On `main` because `openFormOf` is main-only, and a Sanctum form
 * would be staled by the next line of talk (owner QC, 2026-09-28: the
 * question stays on `main`).
 *
 * ⚠ **The row's own Regenerate is refused** (R9): re-driving it re-plans the
 * turn, and a plan that now plays would put a delver's line in the
 * Castellan's question row. The knock is the whole of its turn, so the
 * composer's Regenerate (`core#retake`) takes that turn again instead —
 * `retakeRowRefusal` in the app says so.
 */
const knockBranch = (c) => c
    /**
     * The planner's own document, read a second time at a different
     * path: a data reference is `{node, port}` with no sub-path, so the
     * speakers and the question cannot come off one node.
     */
    .task('question', ($) => C.parseJson.v1({
    text: $.via.turn.channel.story.pick.planned.planWrite.text,
    params: slot.params(),
}), { expose: { label: 'Read the knock question' } })
    /**
     * The one option's label, *Describe The Drowned Hall…* (R9): the
     * room's name with the ellipsis a press that asks for more carries,
     * then the verb before it — two joins, because a join has one
     * separator.
     */
    .task('named', ($) => C.joinText.v1({
    items: [$.via.turn.channel.story.pick.planned.exitCheck.undescribed, '…'],
    params: slot.params(),
}), { expose: { label: 'Name the room' } })
    .task('describeLabel', ($) => C.joinText.v1({
    items: ['Describe', $.via.turn.channel.story.door.knock.named.text],
    params: slot.params(),
}), { expose: { label: 'Label the option' } })
    /**
     * Where the planner says the party stand (plan A27): its
     * `worldHints.location` (the preset's path), the third read of its
     * document. Carried on the block as its `vantage`, so *Answer the
     * door* links the new room to the room this turn's planner named
     * when the world's `location` names nothing. The knock branch runs
     * no voice, so no prompt in this turn shows that room.
     */
    .task('vantage', ($) => C.parseJson.v1({
    text: $.via.turn.channel.story.pick.planned.planWrite.text,
    params: slot.params(),
}), { expose: { label: 'Read where the party stand' } })
    /**
     * The question as a `choices` block **addressed to the owner** (R-15
     * *Forms*). ⚠ `addressee: 'owner'` is load-bearing twice over since
     * L1: it decides who may press, AND it is the one thing that lets
     * these options name a `world` action at all.
     *
     * **One option** (R9): describe the room. Its press opens the collect
     * modal; typed text is the room, verbatim, and an empty answer is
     * the Castellan's draft behind review (`lairActions.ts`).
     */
    .task('choices', ($) => C.makeChoices.v1({
    json: {
        question: $.via.turn.channel.story.door.knock.question.value,
        options: [
            {
                key: KNOCK_OPTION_KEY,
                label: $.via.turn.channel.story.door.knock.describeLabel.text,
            },
        ],
    },
    fn: 'room',
    action: `${LAIR_ROOM_ANSWER_SPEC_ID}#room`,
    addressee: 'owner',
    cast: $.gather.cast.read.cast,
    // The room itself, carried to the answer's run on the block
    // (B12): *Answer the door* names the entry it writes from this.
    referent: $.via.turn.channel.story.pick.planned.exitCheck.undescribed,
    // And where the party stand, by the planner (A27).
    vantage: $.via.turn.channel.story.door.knock.vantage.value,
}))
    /** The question's row — this path's live row, never streamed. */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    channel: 'main',
    speaker: CASTELLAN,
    row: $.input.messageId,
}), { expose: { label: 'Open the knock question' } })
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.via.turn.channel.story.door.knock.placeholder.messageId,
    // The question as prose — `make-choices`' own `text`.
    text: $.via.turn.channel.story.door.knock.choices.text,
    blocks: $.via.turn.channel.story.door.knock.choices.blocks,
}), { expose: { label: 'Fill the knock question' } });
/**
 * **A character turn** (`partySpeech: 'each'`, the default; owner ruling
 * 2026-09-30: "they are character turns"): ONE delver, as themselves, in a
 * run of their own — fired with that delver as its subject
 * (`input.characterId`): by the turn order off the Castellan's standing plan
 * (`via: 'plan'`), by Pick who speaks, or by a regenerate or swipe of their
 * row. A planned turn runs no voice here: its plan row hands the turns on.
 *
 * One settings group, **Character turn**: one prompt, one model, one
 * sampling and one set of everything else, whoever the delver is — there is
 * nobody first and nobody later. The turn:
 *
 *  - reads the **standing plan** (`core:query/turn-plan@1`): where the scene
 *    is, and the prose describing a room nobody filed;
 *  - streams the delver's line into their own row, the run's one live row;
 *  - reads only this delver's own private lore (`character-lore@1` for the
 *    speaker), and the state as their voice hears it (their whisper alone,
 *    their own place's stats alone — the side-character builder);
 *  - **keeps this delver's own books**, and only theirs: the state-keeper's
 *    prompt, model and sampling (`keep.played.*`, by reference), over this
 *    line, with `keeps` naming this delver — so a change to the world, a
 *    place or another delver is refused on the receipt. The world's books
 *    are the Castellan's.
 */
const characterTurn = (e) => e.junction('character', { on: ($) => $.input.characterId }, (j) => j.when('turn', { truthy: true }, (t) => t
    /** The plan this turn plays from — absent when none stands. */
    .query('plan', ($) => C.turnPlan.v1({
    scope: $.input.sessionScope,
    messageId: $.input.messageId,
}), { expose: { label: 'The standing plan' } })
    .task('context', ($) => C.buildSideCharacterContext.v1({
    cast: $.gather.cast.read.cast,
    sideCharacter: $.via.turn.channel.story.pick.first,
    state: $.gather.state.read.state,
    plan: $.via.turn.channel.story.door.play.speech.each.character.turn.plan.plan,
    locationEntries: $.gather.rooms.read.entries,
    // A room described only in prose (R9): its paragraph.
    locationPassage: $.via.turn.channel.story.door.play.speech.each.character.turn.plan.locationPassage,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /** The delver's own row — re-voiced on a regenerate or swipe (`row`). */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    channel: 'main',
    speaker: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    row: $.input.messageId,
}), { expose: { label: "Open the delver's line" } })
    /** This delver's own private lore, and nobody else's (W1). */
    .query('lore', ($) => C.characterLore.v1({
    scope: $.input.sessionScope,
    speaker: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    params: slot.params({ node: 'gather.worldLore.read' }),
}), { expose: { label: "Character lore, the delver's own" } })
    /**
     * **This delver's own arms** (R3, 2026-10-02) — meaning and
     * name, with the delver as `speaker` (the C3 leak guard): the
     * Castellan's hits carry every member's private lore. The
     * meaning search reuses the turn's one embed.
     */
    .query('search', ($) => C.vectorSearch.v1({
    scope: $.input.sessionScope,
    vectors: $.semantic.arm.embed.vectors,
    speaker: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    params: slot.params(),
}), { expose: { label: "Semantic search, the delver's own" } })
    .query('entities', ($) => C.entitySearch.v1({
    scope: $.input.sessionScope,
    speaker: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    params: slot.params(),
}), { expose: { label: "Entity search, the delver's own" } })
    .task('pool', ($) => C.concatCandidates.v1({
    sources: [
        $.gather.history.read.band,
        $.gather.worldLore.read.main,
        $.gather.historyEntries.read.main,
        $.via.turn.channel.story.door.play.speech.each.character.turn.lore.main,
        $.via.turn.channel.story.door.play.speech.each.character.turn.entities.main,
        $.via.turn.channel.story.door.play.speech.each.character.turn.search.main,
    ],
}))
    /** The turn's descriptions, linked against what this delver may read. */
    .query('link', ($) => C.entityLink.v1({
    scope: $.input.sessionScope,
    candidates: $.via.turn.channel.story.door.play.speech.each.character.turn.pool.candidates,
    mentions: $.names.arm.mentions.mentions,
    vectors: $.names.arm.embed.vectors,
    speaker: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    params: slot.params(),
}), { expose: { label: "Entries called by a description, the delver's own" } })
    .task('poolLinked', ($) => C.concatCandidates.v1({
    sources: [$.via.turn.channel.story.door.play.speech.each.character.turn.link.main, $.via.turn.channel.story.door.play.speech.each.character.turn.pool.candidates],
}))
    /** The hard gates for this delver (C2): exclusions, secrecy, presence. */
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.via.turn.channel.story.door.play.speech.each.character.turn.poolLinked.candidates,
    exclusions: [
        $.gather.worldLore.read.exclusions,
        $.gather.historyEntries.read.exclusions,
        $.via.turn.channel.story.door.play.speech.each.character.turn.lore.exclusions,
    ],
    speaker: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    presences: $.gather.presences.read.main,
    at: $.gather.presences.read.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.via.turn.channel.story.door.play.speech.each.character.turn.eligible.candidates,
    budget: $.contextBudget.available,
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}), { expose: { label: "Rank hybrid, the delver's own" } })
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.turn.channel.story.door.play.speech.each.character.turn.context.templateContext,
    seedName: $.via.turn.channel.story.door.play.speech.each.character.turn.context.seedName,
}))
    // 🚧 This voice's attachments, placed on its own pair (§3.5).
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.via.turn.channel.story.door.play.speech.each.character.turn.lines.messages,
    attachments: $.gather.history.attachments.attachments,
    connection: slot.connectionOf(`${CHARACTER_TURN}.say`),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.via.turn.channel.story.door.play.speech.each.character.turn.rank.candidates,
    decisions: $.via.turn.channel.story.door.play.speech.each.character.turn.rank.decisions,
    groups: $.via.turn.channel.story.door.play.speech.each.character.turn.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.turn.channel.story.door.play.speech.each.character.turn.attached.messages,
    templateContext: $.via.turn.channel.story.door.play.speech.each.character.turn.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: `${CHARACTER_TURN}.context` }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf(`${CHARACTER_TURN}.say`),
}))
    /** This execution path's one streaming step: the delver's line. */
    .oracle('say', ($) => C.generateText.v1({
    context: $.via.turn.channel.story.door.play.speech.each.character.turn.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        stream: true,
        status: 'Taking a character turn',
        label: 'Character turn',
        purpose: 'While each delver speaks (the session default), every delver the Castellan plans to speak takes a turn of their own, one after another: as themselves, knowing only what they know, and keeping only their own stats. Pick who speaks gives the delver you pick the same turn.',
    },
})
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.via.turn.channel.story.door.play.speech.each.character.turn.placeholder.messageId,
    text: $.via.turn.channel.story.door.play.speech.each.character.turn.say.text,
    reasoning: $.via.turn.channel.story.door.play.speech.each.character.turn.say.reasoning,
}), { expose: { label: "Fill the delver's line" } })
    /* ── this delver's own books ─────────────────────────────── */
    .task('keeperContext', ($) => C.buildKeeperContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    reply: $.via.turn.channel.story.door.play.speech.each.character.turn.say.text,
    fields: $.input.fields,
    // The state-keeper's own instructions: one keeper prompt.
    prompts: slot.prompts({ node: 'keep.played.keeperContext' }),
    variables: slot.variables('keep.played.keeperContext'),
}), { expose: { label: "Keeper context, the delver's own" } })
    .task('keeperLines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperContext.templateContext,
}), { expose: { label: "Keeper transcript, the delver's own" } })
    .task('keeperPrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperLines.messages,
    templateContext: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperContext.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: `${CHARACTER_TURN}.keeperContext` }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('keep.played.keeperWrite'),
}), { expose: { label: "Keeper prompt layout, the delver's own" } })
    .oracle('keeperWrite', ($) => C.generateJson.v1({
    context: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperPrompt.context,
    schema: LAIR_KEEPER_SCHEMA,
    // The state-keeper's model and sampling, not a
    // second pair to keep in step.
    connection: slot.connection('keep.played.keeperWrite'),
    sampling: slot.sampling('keep.played.keeperWrite'),
    params: slot.params(),
}), {
    expose: {
        status: 'Keeping the books',
        label: "The delver's own books",
    },
})
    .query('itemSupply', ($) => C.itemSupply.v1({ scope: $.input.sessionScope }), { expose: { label: "Item supply, the delver's own" } })
    /** Names into rows — this delver's alone (`keeps`). */
    .query('keeperResolve', ($) => C.resolveStateChanges.v1({
    changes: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperWrite.items,
    base: $.gather.state.read.version,
    keeps: $.via.turn.channel.story.door.play.speech.each.character.turn.context.speaker,
    scope: $.input.sessionScope,
    supply: $.via.turn.channel.story.door.play.speech.each.character.turn.itemSupply.supply,
}), { expose: { label: "Resolve the delver's own changes" } })
    /** Propose, or apply — the session's own decision, as the Castellan's. Filed at this line. */
    .junction('commit', { on: ($) => $.input.fields }, (c) => c
    .when('trusted', { path: 'trustNarrator', truthy: true }, (a) => a.task('apply', ($) => C.setState.v1({
    changes: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperResolve.changes,
    scope: $.input.sessionScope,
    base: $.gather.state.read.version,
    params: slot.params(),
}), { expose: { label: "Apply the delver's own changes" } }))
    .otherwise('reviewed', (r) => r.task('propose', ($) => C.setState.v1({
    changes: $.via.turn.channel.story.door.play.speech.each.character.turn.keeperResolve.changes,
    scope: $.input.sessionScope,
    base: $.gather.state.read.version,
    params: slot.params(),
}), { expose: { label: "Propose the delver's own changes" } })))));
/**
 * **The Castellan speaks for the party** (`partySpeech: 'castellan'`; owner
 * ruling 2026-09-30): ONE call writes every named delver's lines for the
 * turn — the plan's speakers, or the one Pick who speaks named — as the
 * Castellan narrating the party, streamed.
 *
 * **Nobody's voice, so nobody's secrets.** Its context is the scene surface
 * (`build-scene-context@1`, nobody speaking): it hears no holder-only slot —
 * no delver's whisper — and its pool is the shared lore without any
 * character lore lane, so no delver's private lore reaches it. Its own
 * prompt row, *Lair Castellan speaks for the party*, named by the preset.
 *
 * **Whose row.** A planned turn's lines are one row under the Castellan's
 * name on `main`; a pick's is the picked delver's own row (`characterId`,
 * and the `row` a regenerate or swipe re-voices). The two placeholders sit
 * in exclusive branches, so each is that path's one live row (F7).
 */
const partyCall = (p) => p.junction('party', { on: ($) => $.via.turn.channel.story.pick.first }, (j) => j.when('speaks', { truthy: true }, (s) => s
    .junction('row', { on: ($) => $.input.characterId }, (r) => r
    .when('picked', { truthy: true }, (k) => k.outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    channel: 'main',
    characterId: $.input.characterId,
    row: $.input.messageId,
}), { expose: { label: "Open the picked delver's line" } }))
    .otherwise('turn', (t) => t.outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    channel: 'main',
    speaker: CASTELLAN,
    row: $.input.messageId,
}), { expose: { label: "Open the party's lines" } })))
    .task('context', ($) => C.buildSceneContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    plan: $.via.turn.channel.story.pick.planned.planWrite.json,
    fields: $.input.fields,
    locationEntries: $.gather.rooms.read.entries,
    // Who speaks, in order: the first and the rest.
    partySpeakers: [$.via.turn.channel.story.pick.first, $.via.turn.channel.story.pick.rest],
    // The party's reach: the room they stand in and the
    // rooms one way on — no other room's stats.
    placeSight: 'reach',
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /**
     * **The party's arms** (R3, 2026-10-02) — meaning and name, as
     * the Castellan: an envoy is nobody's holder, so they read world
     * lore and history and no member's private lore (the C3 rule
     * for a reference that is not a character). The spine's arms
     * carry every member's; this one call voices several. The
     * meaning search reuses the turn's one embed.
     */
    .query('search', ($) => C.vectorSearch.v1({
    scope: $.input.sessionScope,
    vectors: $.semantic.arm.embed.vectors,
    speaker: CASTELLAN,
    params: slot.params(),
}), { expose: { label: "Semantic search, the party's" } })
    .query('entities', ($) => C.entitySearch.v1({
    scope: $.input.sessionScope,
    speaker: CASTELLAN,
    params: slot.params(),
}), { expose: { label: "Entity search, the party's" } })
    /** The shared lore, the party's arms, and no character lore lane: nobody's secrets. */
    .task('pool', ($) => C.concatCandidates.v1({
    sources: [
        $.gather.history.read.band,
        $.gather.worldLore.read.main,
        $.gather.historyEntries.read.main,
        $.via.turn.channel.story.door.play.speech.castellan.party.speaks.entities.main,
        $.via.turn.channel.story.door.play.speech.castellan.party.speaks.search.main,
    ],
}))
    /** The hard gates (C2): exclusions and presence — no secrets in this pool. */
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.pool.candidates,
    exclusions: [
        $.gather.worldLore.read.exclusions,
        $.gather.historyEntries.read.exclusions,
    ],
    presences: $.gather.presences.read.main,
    at: $.gather.presences.read.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.eligible.candidates,
    budget: $.contextBudget.available,
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.context.templateContext,
    seedName: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.context.seedName,
}))
    // 🚧 This voice's attachments, placed on its own pair (§3.5).
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.lines.messages,
    attachments: $.gather.history.attachments.attachments,
    connection: slot.connectionOf(`${PARTY}.say`),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.rank.candidates,
    decisions: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.rank.decisions,
    groups: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.attached.messages,
    templateContext: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: `${PARTY}.context` }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf(`${PARTY}.say`),
}))
    /**
     * **Whose lines this call writes**, for the Castellan's keeper:
     * whoever writes a delver's line keeps that delver's stats
     * (owner ruling 2026-10-02), and no character turn runs while
     * the Castellan speaks for the party. The same speakers its
     * context names, first and the rest.
     */
    .task('speakers', ($) => C.splitFirst.v1({
    items: [$.via.turn.channel.story.pick.first, $.via.turn.channel.story.pick.rest],
}), { expose: { label: 'The delvers it voices' } })
    /** This execution path's one streaming step. */
    .oracle('say', ($) => C.generateText.v1({
    context: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        stream: true,
        status: 'The Castellan speaks for the party',
        label: 'Castellan speaks for the party',
        purpose: 'While the Castellan speaks for the party, one call writes the lines of every delver the Castellan plans to speak, knowing only what everyone may know: no whisper, no delver\'s private lore. Pick who speaks asks it for that delver\'s line alone.',
    },
})
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.row.messageId,
    text: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.say.text,
    reasoning: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.say.reasoning,
}), { expose: { label: "Fill the party's lines" } })));
/**
 * **The play** (R8): the beats in the Sanctum, then the party — in the
 * session's party speech. While each delver speaks, a planned turn voices
 * nobody: the beats row is the **plan row**, carrying the turns it hands on
 * (`turnPlan`), and each named delver then takes a character turn of their
 * own. While the Castellan speaks for the party, it writes their lines here.
 * A run whose subject is a delver (a planned character turn, Pick who
 * speaks, a re-voice) plays here too, with no plan of its own: no beats row
 * and no Castellan keeper — only that delver's turn.
 */
const playBranch = (c) => c
    /**
     * The beats as a markdown list — the Sanctum row's BODY (F4: beats
     * go to the Sanctum; the B5 Plan fold is retired). Empty on a pick.
     */
    .task('beats', ($) => C.listSection.v1({
    json: $.via.turn.channel.story.pick.planned.planWrite.json,
    params: slot.params(),
}))
    /**
     * **Which turns the plan row hands on** — the session's
     * `partySpeech` again, read before the row is written. Each delver
     * speaking: the planner's document (whose `speakers` are the turns,
     * in order) and the prose describing the room ahead. The Castellan
     * speaking for the party: none — it writes their lines in this run.
     * Both branches end in `split-first@1`, so the junction hands on
     * `first`: the turn plan, or nothing.
     */
    .junction('turns', { on: ($) => $.input.fields }, (j) => j
    .when('castellan', { path: 'partySpeech', equals: 'castellan' }, (p) => p.task('plan', ($) => C.splitFirst.v1({ items: [] }), {
    expose: { label: 'No turns to hand on' },
}))
    .otherwise('each', (e) => e.task('plan', ($) => C.splitFirst.v1({
    items: [
        {
            plan: $.via.turn.channel.story.pick.planned.planWrite.json,
            locationPassage: $.via.turn.channel.story.pick.planned.exitCheck.passage,
        },
    ],
}), { expose: { label: 'The turns to hand on' } })))
    /**
     * **The Castellan's beats row, first** — the plan row. Complete — a
     * list from the planner's JSON, nothing to stream — and on another
     * channel, so it is an ordinary write, never a live row. It lands
     * before any voice, so the master reads the plan while the party
     * speak, and it carries the turns the junction above hands on. A plan
     * with no beats posts nothing, and so plans no turns.
     */
    .junction('plan', { on: ($) => $.via.turn.channel.story.door.play.beats.text }, (j) => j.when('posted', { truthy: true }, (p) => p.outlet('write', ($) => C.createMessage.v1({
    text: $.via.turn.channel.story.door.play.beats.text,
    channel: SANCTUM_CHANNEL,
    speaker: CASTELLAN,
    turnPlan: $.via.turn.channel.story.door.play.turns.first,
}), { expose: { label: 'Post the beats in the Sanctum' } })))
    /**
     * **How the party speak** — the session's `partySpeech`. `castellan`
     * is the `when`, so a session that never set the field (and the
     * default, `each`) takes the `otherwise`: each delver speaks, a
     * character turn when this run's subject is a delver.
     */
    .junction('speech', { on: ($) => $.input.fields }, (j) => j
    .when('castellan', { path: 'partySpeech', equals: 'castellan' }, (p) => partyCall(p))
    .otherwise('each', (e) => characterTurn(e)))
    /**
     * What the Castellan's keeper reads — on a PLANNED turn only: a
     * character turn keeps its own delver's books, and a Castellan pick
     * keeps none (B15).
     */
    .junction('turn', { on: ($) => $.via.turn.channel.story.pick.planned.planWrite.text }, (j) => j.when('planned', { truthy: true }, (t) => t
    /** The Castellan's lines for the party — none while each delver speaks: their turns come after. */
    .task('partyLines', ($) => C.joinText.v1({
    items: [
        { text: $.via.turn.channel.story.door.play.speech.castellan.party.speaks.say.text },
    ],
    params: slot.params(),
}), { expose: { label: "Join the party's lines" } })
    /** The turn as the keeper reads it: the Castellan's beats, then the party. */
    .task('reply', ($) => C.joinText.v1({
    items: [
        { text: $.via.turn.channel.story.door.play.beats.text },
        { text: $.via.turn.channel.story.door.play.turn.planned.partyLines.text },
    ],
    params: slot.params(),
}), { expose: { label: 'Join the beats and the party' } })));
/**
 * The story's turn (the `otherwise` of the Sanctum).
 *
 * **Who speaks**, first (`pick`): the delver Pick who speaks named — no
 * planner — or the Castellan's plan. Each branch ends in `split-first@1`,
 * so the junction hands on `first` and `rest` whichever ran.
 *
 * **Then the knock, or the play** (`door`). The knock is the `when` and the
 * play the `otherwise` because the halt is the exceptional case, and
 * `otherwise` is what runs when the planner's document could not be read at
 * all — and on a pick, where no planner ran.
 */
const storyBranch = (st) => st
    .junction('pick', { on: ($) => $.input.characterId }, (who) => who
    /**
     * **A delver answers alone** — Pick who speaks, or a verb
     * re-voicing their row (B15, owner D2a 2026-09-27): no planner,
     * no beats, no keeper. The delver, by the id the pick named,
     * as the one speaker.
     */
    .when('picked', { truthy: true }, (d) => d.task('who', ($) => C.splitFirst.v1({
    items: [{ characterId: $.input.characterId }],
})))
    .otherwise('planned', (c) => c
    /* ── plan ─────────────────────────────────────────────────── */
    /**
     * **Sanctum talk steers the story** (R13, owner F3/QB
     * 2026-09-28): while the session's switch is on (the
     * default), the planner reads the talk since the story's
     * last line — only that, never older talk, the greeting or
     * a beats row (`unplayedOnly`) — and the Castellan's
     * scratchpad. Off, it reads neither: the Sanctum is for
     * brainstorming, and only Nudge and a filed room cross.
     */
    .junction('steer', { on: ($) => $.input.fields }, (j) => j.when('on', { path: 'sanctumSteers', truthy: true }, (on) => on
    .query('talk', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Sanctum talk, for the planner' } })
    .task('pad', ($) => C.joinText.v1({
    items: [$.gather.scratchpad.read.main],
    params: slot.params(),
}), { expose: { label: 'The scratchpad, for the planner' } })))
    .task('planContext', ($) => C.buildPlannerContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    fields: $.input.fields,
    // What the master just typed, as direction (B11) — the
    // composer is instructions here, never a line.
    turnDirection: $.input.text,
    // The rooms, always in view (B13).
    locationEntries: $.gather.rooms.read.entries,
    // The unplayed talk and the scratchpad (R13) —
    // absent while the switch is off.
    sideTalk: $.via.turn.channel.story.pick.planned.steer.on.talk.messages,
    scratchpad: $.via.turn.channel.story.pick.planned.steer.on.pad.text,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /** Prose, and no turn to continue — see `adventure.ts`. */
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.via.turn.channel.story.pick.planned.planContext.templateContext,
}))
    .task('planPrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.via.turn.channel.story.pick.planned.lines.messages,
    templateContext: $.via.turn.channel.story.pick.planned.planContext.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: `${PICK}.planned.planContext` }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf(`${PICK}.planned.planWrite`),
}))
    .oracle('planWrite', ($) => C.generateJson.v1({
    context: $.via.turn.channel.story.pick.planned.planPrompt.context,
    schema: LAIR_PLAN_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        status: 'The Castellan is planning the turn',
        label: 'Planner',
        purpose: "The Castellan plans the party's turn: the beats, who speaks, where the party are heading. It writes no prose, so a small, fast model is enough.",
    },
})
    /** The room the planner says nobody built, at `unknownExit` … */
    .task('exit', ($) => C.parseJson.v1({
    text: $.via.turn.channel.story.pick.planned.planWrite.text,
    params: slot.params(),
}), { expose: { label: 'Read the unknown exit' } })
    /**
     * The prose a room may be described in (R9, owner QC
     * 2026-09-28): the newest rows of **every** channel, so a
     * room the master described in the story OR in the Sanctum
     * counts. The story's own history read is `main` only; this
     * is the union (`channel: '*'`), and `exitCheck` keeps the
     * two channels it names.
     *
     * **Talk only** off `main` (`talkOnly`, R10's fold-in of the
     * R9 follow-up): the Sanctum's beats row is the Castellan's
     * own plan for a turn — an envoy row, so the check could not
     * tell it from talk, and a beats list naming a room in a dozen
     * words suppressed the knock. The read keeps a person's lines
     * and the replies fired on the Sanctum, and drops what a
     * story turn or the create run wrote there, by the creating
     * run's inlet channel — the fact the unplayed talk reads.
     */
    .query('exitProse', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Recent prose, every channel' } })
    /**
     * … kept only when nothing already describes it (B13; R7; R9):
     * an entry answering to its name or a key, or recent prose on
     * `main` or in the Sanctum by the master or the Castellan, is
     * an open door whatever the planner thought. Prose hands its
     * paragraph on (`passage`) — the room's text for the voices.
     */
    .task('exitCheck', ($) => C.undescribedName.v1({
    name: $.via.turn.channel.story.pick.planned.exit.value,
    locationEntries: $.gather.rooms.read.entries,
    entries: $.gather.lorebook.read.entries,
    messages: $.via.turn.channel.story.pick.planned.exitProse.messages,
    params: slot.params(),
}))
    /**
     * Who of the party speaks — the planner's `speakers`, read
     * off its document (the preset's path) — as the first and
     * the rest, in the plan's order.
     */
    .task('speaking', ($) => C.parseJson.v1({
    text: $.via.turn.channel.story.pick.planned.planWrite.text,
    params: slot.params(),
}), { expose: { label: 'Read who speaks' } })
    .task('who', ($) => C.splitFirst.v1({
    items: $.via.turn.channel.story.pick.planned.speaking.items,
}))))
    .junction('door', { on: ($) => $.via.turn.channel.story.pick.planned.exitCheck.undescribed }, (r) => r
    .when('knock', { truthy: true }, (k) => knockBranch(k))
    .otherwise('play', (p) => playBranch(p)));
/** @internal */
export const lairRespondSpec = () => compile(spec(LAIR_RESPOND_SPEC_ID, {
    version: LAIR_RESPOND_VERSION,
    taxonomy: {
        role: 'primary',
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: lairGenre,
    event: sessionEvents.messageRespond,
})
    /**
     * The window, taken from the step whose prose a person waits on —
     * a character turn's line. A config reference is resolved by node
     * key and creates no edge, so naming a node inside a branch costs
     * the graph nothing.
     *
     * Before the reads (history window, 2026-10-03): the history read
     * is sized by this budget, so it is computed first. It reads only
     * config, never a step, so moving it changes no value.
     */
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf(`${CHARACTER_TURN}.say`),
    connection: slot.connectionOf(`${CHARACTER_TURN}.say`),
    params: slot.params(),
}))
    /** One retrieval pass, shared by every agent below. See `adventure.ts`. */
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c
    .query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    // Sized by the window (history window, 2026-10-03).
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    // 🚧 The files those rows show (PLAN-composer-attachments
    // §3.5), read once for every voice that places them.
    .query('attachments', ($) => C.historyAttachments.v1({
    messages: $.gather.history.read.messages,
    params: slot.params(),
})))
    /**
     * The dungeon itself. `world-lore` is the lane the rooms
     * live on, because `core:outlet/create-lore-entry@1` writes
     * world-lore rows and has no port to say otherwise.
     */
    .chain('worldLore', (c) => c.query('read', ($) => C.worldLore.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('characterLore', (c) => c.query('read', ($) => C.characterLore.v1({
    scope: $.input.sessionScope,
    // One owner per setting per spec (R-7 P2) — the
    // three lanes declare the same seven knobs.
    params: slot.params({ node: 'gather.worldLore.read' }),
})))
    .chain('historyEntries', (c) => c.query('read', ($) => C.historyEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params({ node: 'gather.worldLore.read' }),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    /**
     * Every room the dungeon holds, by listing rather than by
     * rank (B13, 2026-09-27): the room the party are in —
     * exits and all — and every other room's name, in front
     * of the planner, the voices and the Castellan, and what
     * the knock is checked against. Location entries only (the
     * preset below).
     *
     * **With their links** (places plan B6, 2026-09-29): the
     * preset asks `withLinks`, so each room carries its ways
     * out said from the room, and `{{locationEntry}}` writes
     * them under its body as "From here:". The graph, not a
     * typed `Exits:` line, is where the ways on come from; an
     * older room's line is still its own words.
     */
    .chain('rooms', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}), { expose: { label: 'Rooms' } }))
    /**
     * The whole book, any entry type (R7, 2026-09-28): a room is
     * described when ANY entry answers to its name or a key, not
     * only a location entry. The rooms above are checked first.
     */
    .chain('lorebook', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    /**
     * The party's bars, the floor, the purse — and the two
     * slots the steering actions write: `direction`, the
     * master's standing note, and each delver's `whisper`.
     */
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })))
    /**
     * The Castellan's own view of the annex (R13): the AI view
     * for its reference, so it holds the scratchpad — whose
     * audience is the Castellan alone — and nothing a delver's
     * view would not. Read by the Castellan's steps only: the
     * Sanctum talk, its scratchpad rewrite, and the planner
     * while Sanctum talk steers. No delver's prompt is wired
     * to it (earshot, by the audience model).
     */
    .chain('scratchpad', (c) => c.query('read', ($) => C.sessionAnnex.v1({
    scope: $.input.sessionScope,
    view: 'ai',
    speaker: CASTELLAN,
    params: slot.params(),
})))
    /**
     * **The entity mechanism** (R3, 2026-10-02) — the
     * Castellan's read (the scope names nobody). A delver's
     * turn runs its own with the delver as speaker.
     */
    .chain('entities', (c) => c.query('read', ($) => C.entitySearch.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    /** Who is in the world at the session's moment (R4), for `eligible`. */
    .chain('presences', (c) => c.query('read', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))))
    /**
     * **Retrieval by meaning** (R3, 2026-10-02) — `respond`'s block.
     * One embed per turn; the Castellan searches here, a delver's turn
     * searches the same vectors as the delver.
     */
    .gather('semantic', { mode: 'parallel' }, (b) => b.chain('arm', (c) => c
    .task('queries', ($) => C.queryWindows.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    connection: slot.connectionOf('semantic.arm.embed'),
    params: slot.params(),
}))
    .oracle('embed', ($) => C.embedText.v1({
    texts: $.semantic.arm.queries.current,
    params: slot.params(),
}), { expose: { label: 'Embed the recent messages', status: 'Searching by meaning' } })
    .query('search', ($) => C.vectorSearch.v1({
    scope: $.input.sessionScope,
    vectors: $.semantic.arm.embed.vectors,
    params: slot.params(),
}))))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [
        $.gather.history.read.band,
        $.gather.worldLore.read.main,
        $.gather.characterLore.read.main,
        $.gather.historyEntries.read.main,
        // The two arms (R3), after the keyword lanes (`respond`'s order).
        $.gather.entities.read.main,
        $.semantic.arm.search.main,
    ],
}))
    /** **Retrieval by description** (R3) — `respond`'s names block; it only reorders. */
    .gather('names', { mode: 'parallel' }, (b) => b.chain('arm', (c) => c
    .query('mentions', ($) => C.mentionSpans.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))
    .oracle('embed', ($) => C.embedText.v1({
    texts: $.names.arm.mentions.texts,
    params: slot.params({ node: 'semantic.arm.embed' }),
}), { expose: { label: 'Embed the mentions', status: 'Searching by name' } })
    .query('link', ($) => C.entityLink.v1({
    scope: $.input.sessionScope,
    candidates: $.lore.candidates,
    mentions: $.names.arm.mentions.mentions,
    vectors: $.names.arm.embed.vectors,
    params: slot.params(),
}))))
    .task('loreLinked', ($) => C.concatCandidates.v1({
    sources: [$.names.arm.link.main, $.lore.candidates],
}))
    /**
     * The hard gates before the Castellan's ranker (C2; R2, R4):
     * selective-logic exclusions and the presence gate.
     */
    /**
     * **The room the place slot shows** (the room rule, 2026-10-02):
     * the world's `location`, read at `world.location` inside the
     * session's state (the preset's `path`), resolved against the
     * rooms by the one room rule (`undescribed-name@1`, the rule
     * `{{locationEntry}}` reads by). Every ranker in this spec takes
     * its `entryId` as `shownElsewhere`, so the room is read once,
     * under its own slot, and spends no lore budget. A turn whose
     * room only the planner has named still ranks it: the plan comes
     * after the spine's ranker.
     */
    .task('place', ($) => C.undescribedName.v1({
    name: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    params: slot.params(),
}), { expose: { label: 'The current place' } })
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.loreLinked.candidates,
    exclusions: [
        $.gather.worldLore.read.exclusions,
        $.gather.characterLore.read.exclusions,
        $.gather.historyEntries.read.exclusions,
    ],
    presences: $.gather.presences.read.main,
    at: $.gather.presences.read.at,
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.eligible.candidates,
    budget: $.contextBudget.available,
    // The room the place slot shows (the room rule).
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}))
    /* ── what was pressed, where it was pressed, and who takes it ─── */
    /**
     * **Narrate first** (R8): a fire `via: 'narrate'` is the Castellan
     * narrating on `main`, whichever composer pressed it — so it is
     * routed ahead of the channel. Every other fire is a turn.
     *
     * **The Sanctum, or the story** (R6). A turn fired on the Sanctum
     * is the Castellan talking with its master; every other turn is
     * the story's. Strict equality against the slug: the Lair
     * allocates no lanes, so `sanctum` is the whole stored string.
     *
     * Each branch opens its own row (F7 per execution path).
     */
    .junction('via', { on: ($) => $.input.via }, (v) => v
    .when('narrate', { equals: 'narrate' }, (n) => narrateBranch(n))
    .otherwise('turn', (t) => t.junction('channel', { on: ($) => $.input.channel }, (ch) => ch
    .when('sanctum', { equals: SANCTUM_CHANNEL }, (s) => sanctumBranch(s))
    .otherwise('story', (st) => storyBranch(st)))))
    /* ── keep the books ───────────────────────────────────────────── */
    /**
     * What the Castellan played this run, for its keeper to route on:
     * a narration, or a planned turn — its beats, and the party's
     * lines when it spoke for them. `join-text` drops what is absent,
     * so Sanctum talk, a character turn (which keeps its own books), a
     * Castellan pick and a knock all leave it empty, and this keeper
     * does not run.
     */
    .task('played', ($) => C.joinText.v1({
    items: [
        { text: $.via.narrate.say.text },
        { text: $.via.turn.channel.story.door.play.turn.planned.reply.text },
    ],
    params: slot.params(),
}), { expose: { label: 'What was played' } })
    /** … and what the keeper reads: the narration, or the beats and the party. */
    .task('reply', ($) => C.joinText.v1({
    items: [
        { text: $.via.narrate.say.text },
        { text: $.via.turn.channel.story.door.play.turn.planned.reply.text },
    ],
    params: slot.params(),
}), { expose: { label: 'What the state-keeper reads' } })
    /**
     * **The Castellan's keeper**, LAST, on the spine: every write in
     * the turn has landed by the time it runs (a level runs its items
     * in position order). It keeps the **world's** books (`keeps`,
     * owner rulings 2026-09-30 and 2026-10-02): the world's own stats
     * and its places'.
     * A delver's stats are kept by whoever wrote their line — their own
     * character turn, or, while the Castellan speaks for the party, this
     * keeper, for the delvers the party call voiced (`speakers`). **The world's changes are filed at the beats
     * row** — declared on `set-state`'s `worldRow`, never inferred — so
     * their ledger shows in the Sanctum beside the plan that made them.
     * A narration has no beats row, so its world changes file at the
     * newest message: the narration itself.
     */
    .junction('keep', { on: ($) => $.played.text }, (k) => k.when('played', { truthy: true }, (c) => c
    .task('keeperContext', ($) => C.buildKeeperContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    reply: $.reply.text,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.keep.played.keeperContext.templateContext,
}))
    .task('keeperPrompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.keep.played.lines.messages,
    templateContext: $.keep.played.keeperContext.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'keep.played.keeperContext' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('keep.played.keeperWrite'),
}))
    .oracle('keeperWrite', ($) => C.generateJson.v1({
    context: $.keep.played.keeperPrompt.context,
    schema: LAIR_KEEPER_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), {
    expose: {
        status: 'Keeping the books',
        label: 'State-keeper',
        purpose: "Reads what was played and records what changed: health, stamina, items, the room. The changes wait for your approval unless the session applies the Castellan's stat changes without asking.",
    },
})
    /**
     * 🚧 How many of each item are held and left — Lair checks
     * supply exactly as Adventure does (owner ruling
     * 2026-09-27).
     */
    .query('itemSupply', ($) => C.itemSupply.v1({
    scope: $.input.sessionScope,
}))
    /** Names into rows — see `adventure.ts`'s `keeperResolve`. */
    .query('keeperResolve', ($) => C.resolveStateChanges.v1({
    changes: $.keep.played.keeperWrite.items,
    base: $.gather.state.read.version,
    // The world and its places, and the delvers whose
    // lines the Castellan wrote this turn — absent
    // while each delver speaks, so then the world alone.
    keeps: [
        'world',
        $.via.turn.channel.story.door.play.speech.castellan.party.speaks.speakers.first,
        $.via.turn.channel.story.door.play.speech.castellan.party.speaks.speakers.rest,
    ],
    plan: $.via.turn.channel.story.pick.planned.planWrite.json,
    scope: $.input.sessionScope,
    supply: $.keep.played.itemSupply.supply,
}))
    /**
     * Propose, or apply — the session's own decision, read
     * from the genre field. The branch IS the decision and the
     * receipt records which predicate fired.
     */
    .junction('commit', { on: ($) => $.input.fields }, (j) => j
    .when('trusted', { path: 'trustNarrator', truthy: true }, (t) => t.task('apply', ($) => C.setState.v1({
    changes: $.keep.played.keeperResolve.changes,
    scope: $.input.sessionScope,
    base: $.gather.state.read.version,
    worldRow: $.via.turn.channel.story.door.play.plan.posted.write.messageId,
    params: slot.params(),
}), { expose: { label: 'Apply the changes' } }))
    .otherwise('reviewed', (t) => t.task('propose', ($) => C.setState.v1({
    changes: $.keep.played.keeperResolve.changes,
    scope: $.input.sessionScope,
    base: $.gather.state.read.version,
    worldRow: $.via.turn.channel.story.door.play.plan.posted.write.messageId,
    params: slot.params(),
}), { expose: { label: 'Propose the changes' } })))))
    /**
     * What the pipeline ships with — selections a person can change in
     * the panel, never literals welded into the document. See
     * `adventure.ts` for the three warnings that govern this block.
     */
    .preset('lair', { label: 'Lair', default: true }, (p) => p
    // Who speaks (the planner's speakers — a knock plays no
    // voice, so it reads them to no end), and where the
    // knock's question is in the planner's own document.
    .params(`${PICK}.planned.speaking`, { path: 'speakers' })
    .params(`${DOOR}.knock.question`, { path: 'knockQuestion' })
    // …and where it says the party stand, for the knock's block (A27).
    .params(`${DOOR}.knock.vantage`, { path: 'worldHints.location' })
    // The room the planner says nobody built (B13), checked
    // against every room the listing holds — location entries
    // only, bare id, the way a listing spells them.
    .params(`${PICK}.planned.exit`, { path: 'unknownExit' })
    // Described in the story or in the Sanctum (R9, owner QC
    // 2026-09-28): the union read, capped at the check's window,
    // and the two channels whose prose counts.
    .params(`${PICK}.planned.exitProse`, { channel: '*', limit: EXIT_PROSE_ROWS, talkOnly: true })
    .params(`${PICK}.planned.exitCheck`, { channels: ['main', SANCTUM_CHANNEL] })
    // The knock's option label: the name and its ellipsis, then
    // the verb (R9).
    .params(`${DOOR}.knock.named`, { path: '', separator: '' })
    .params(`${DOOR}.knock.describeLabel`, { path: '', separator: ' ' })
    // The rooms, each with its ways out said from it (B6) —
    // `{{locationEntry}}`'s "From here:" block.
    .params('gather.rooms.read', { entryTypes: ['core:entry/location'], withLinks: true })
    // The room the place slot shows (the room rule): the world's
    // location, inside the session's state. A preset value on a
    // new node, so it reaches an install through the room-rule
    // re-projection.
    .params('place', { path: 'world.location' })
    // The Castellan's Sanctum talk (R6): the Sanctum is the
    // conversation, the story's newest rows its background.
    .params('via.turn.channel.sanctum.talk', { channel: SANCTUM_CHANNEL })
    .params('via.turn.channel.sanctum.story', { channel: 'main', limit: SANCTUM_STORY_ROWS })
    // The unplayed Sanctum talk (R13): only since the story's
    // last line, capped by the talk window — the planner's
    // read and the narration's two.
    .params(TALK_READS[0], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
    .params(TALK_READS[1], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
    .params(TALK_READS[2], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
    .params(NO_TALK_READ, { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: 0 })
    // Where Narrate was pressed, beside the fields (R13).
    .params('via.narrate.asked', { firstKey: 'channel', secondKey: 'fields' })
    // The scratchpad, as text, off the Castellan's annex view.
    .params(`${PICK}.planned.steer.on.pad`, { path: CASTELLAN_SCRATCHPAD_KEY })
    .params(`${SANCTUM}.pad`, { path: CASTELLAN_SCRATCHPAD_KEY })
    // Its rewrite reads the exchange just had, and answers
    // the whole scratchpad at `scratchpad`.
    .params(`${SANCTUM}.padExchange`, {
    channel: SANCTUM_CHANNEL,
    limit: SCRATCHPAD_EXCHANGE_ROWS,
})
    .params(`${SANCTUM}.padText`, { path: 'scratchpad' })
    // The beats the Sanctum row lists (R8).
    .params(`${PLAY}.beats`, {
    path: 'beats',
    kind: 'plan',
    label: 'Plan',
})
    .params('keep.played.keeperWrite', { path: 'values,inventory' })
    .params(`${CHARACTER_TURN}.keeperWrite`, { path: 'values,inventory' })
    // The one branch that writes rather than asks — the
    // Castellan's, and a character turn's own.
    .params('keep.played.commit.trusted.apply', { mode: 'apply' })
    .params(`${CHARACTER_TURN}.commit.trusted.apply`, { mode: 'apply' })
    // What the keeper reads: the beats, then the party,
    // separated by a blank line.
    .params(`${PLAY}.turn.planned.partyLines`, { separator: '\n\n' })
    .params(`${PLAY}.turn.planned.reply`, { separator: '\n\n' })
    // The Castellan speaking for the party starts on its own
    // row in the scene pool, not on the narration's.
    .prompts(`${PARTY}.context`, {
    seedKey: 'pipeline-prompt:core:task/build-scene-context:prompts:lair-party',
})
    .params('reply', { separator: '\n\n' })
    // The post-history reminder's trigger, at every step that
    // assembles a prompt (`POST_HISTORY_TOKEN_TRIGGER`).
    .params('via.narrate.prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params(`${SANCTUM}.prompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params(`${SANCTUM}.padPrompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params(`${PICK}.planned.planPrompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params(`${PARTY}.prompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params(`${CHARACTER_TURN}.prompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params(`${CHARACTER_TURN}.keeperPrompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params('keep.played.keeperPrompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    // The two steps nobody reads run on Background — see
    // `adventure.ts` (a character turn's own books read the
    // keeper's). The narration and the character turn are
    // deliberately absent: those are the prose somebody is
    // waiting for.
    .sampling(`${PICK}.planned.planWrite`, { seedKey: 'sampling-background' })
    .sampling('keep.played.keeperWrite', {
    seedKey: 'sampling-background',
})
    // The scratchpad rewrite: nobody waits on it either (R13).
    .sampling(`${SANCTUM}.padWrite`, { seedKey: 'sampling-background' }))
    .build());
//# sourceMappingURL=lair.js.map