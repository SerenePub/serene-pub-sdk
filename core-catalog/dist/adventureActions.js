/**
 * The Adventure genre's actions — the small pipelines a player fires from the
 * composer (DESIGN-adventure-genre.md, "Actions").
 *
 * `session-action` is an OPEN event: any number of pipelines may serve it, and
 * which ones a session offers is the preset's `actions.include`. So these are
 * the E-series "events are all optional" made concrete — each is two or three
 * nodes, each contributes its own button, and removing one from a preset takes
 * the button with it and breaks nothing.
 *
 * ## Two shapes, three specs
 *
 * `adventure-look` writes a message and changes nothing. The other two change
 * state and write no message at all, which is worth stating plainly because it
 * looks like a bug the first time you see a run with no reply: pressing Rest
 * produces a ledger under the last message, not a new one. A pipeline may
 * write as often as it likes and is not obliged to write at all (F7).
 *
 * ## Why `adventure-inventory` is not here
 *
 * The design lists a fourth action: a prose inventory check with no model call.
 * Two things say it should not be a pipeline. What somebody carries is their
 * `inventory` stat (phase 3b), already in the state block every prompt reads,
 * so a pipeline would only restate it. And the question it answers was the one
 * the **Inventory widget** answered continuously, in the session, with the item
 * prose on hover. A button that writes a worse copy of a panel already on
 * screen is a feature competing with itself. (R79 removed that widget for now;
 * the first reason still stands on its own, so the action stays out.)
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { ADVENTURE_KEEPER_SCHEMA } from './adventure.js';
import { adventureGenre, POST_HISTORY_TOKEN_TRIGGER } from './genres.js';
/* ── look ───────────────────────────────────────────────────────────────── */
/** @internal */
export const ADVENTURE_LOOK_SPEC_ID = 'core:spec/adventure-look';
/**
 * 1.0.0, edited in place (lorebooks C2, 2026-10-02): a `presences` read and an
 * `eligible` step before `rank`. Content-addressed; `specHashes.test.ts`
 * records the move.
 *
 * Edited in place again (owner ruling 2026-10-03): the context step is the
 * SCENE builder, with the places listing — see `adventureLookSpec`.
 *
 * And again (history window, 2026-10-03): `contextBudget` runs before the
 * reads and `gather.history.read` takes its `budget`, so the transcript fit,
 * not the newest 100 rows, decides where the conversation starts.
 * @internal
 */
export const ADVENTURE_LOOK_VERSION = '1.0.0';
/**
 * The narrator describes where you are, from the lore and the world state, and
 * changes nothing.
 *
 * It is also the opening scene: the create pipeline deliberately makes no model
 * call, so this is the button a new Adventure session is meant to start with.
 *
 * **Built on the scene builder** (`core:task/build-scene-context@1`, owner
 * ruling 2026-10-03), the context Adventure's own narrator reads, so Look is
 * shown what the narrator is shown: `{{location}}`, the clock and the weather,
 * the place the scene is in with its ways on (`{{locationEntry}}`) and every
 * place the world holds (`{{knownLocations}}`), off the same `rooms` listing
 * and the same room rule as `adventure-respond`. It was built on
 * `build-template-context@1`, which computes no scene variables, so Look
 * described a place it had never been shown. No `plan`: nothing is planned,
 * so `{{beats}}` is empty and the builder anchors on the world state alone.
 * The builder also resolves the step as nobody, so the line the model
 * continues is the narrator's rather than the session's last speaker's.
 *
 * Its prompt row moved with it, from the `build-template-context` pool into
 * the `build-scene-context` pool (migration `0111` re-keys the row in place,
 * so a configuration pointing at it keeps pointing at it).
 * @internal
 */
export const adventureLookSpec = () => compile(spec(ADVENTURE_LOOK_SPEC_ID, {
    version: ADVENTURE_LOOK_VERSION,
    taxonomy: {
        role: 'action',
    },
    contributes: {
        actions: [
            {
                key: 'look',
                venue: { kind: 'composer' },
                quick: true,
                icon: 'eye',
                label: { en: 'Look' },
                description: { en: 'Have the narrator describe where you are and what you can see.' },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionAction,
})
    // Before the reads (history window, 2026-10-03): the history read
    // is sized by this budget, so it is computed first. It reads only
    // config, never a step, so moving it changes no value.
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('write'),
    // The other half of the same pair, for the model's own
    // window (0114) — see `respond`.
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
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })))
    // Every place the world holds, by listing (the places plan
    // A28, as `adventure-respond` reads them): location entries
    // with their ways on (the preset), for `{{locationEntry}}`
    // and `{{knownLocations}}`.
    .chain('rooms', (c) => c.query('read', ($) => C.lorebookEntries.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    // Who is in the world at the session's moment (R4), for `eligible`.
    .chain('presences', (c) => c.query('read', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))))
    // The pool the ranker reads: the conversation's band intent (R-7
    // P5 — `session-history` ranks nothing, but its `share` reserves the
    // transcript's slice of the window) ahead of the keyword scan's
    // candidates, which open with the scan's own three intents
    // (`lorebook-triggers` declares one per band it produces). A concat
    // rather than the scan's port straight into `rank`, because a
    // ranker takes one list and the intent needs a seat in it.
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [$.gather.history.read.band, $.gather.lore.read.main],
}))
    // The hard gates before the ranker (C2; R2, R4): the scan's own
    // exclusions, and the presence gate.
    .task('eligible', ($) => C.eligibility.v1({
    candidates: $.lore.candidates,
    exclusions: $.gather.lore.read.exclusions,
    presences: $.gather.presences.read.main,
    at: $.gather.presences.read.at,
}))
    // The room the place slot shows (the room rule, as in
    // `adventure-respond`): the world's `location` resolved against
    // the places, so the ranker leaves that room to
    // `{{locationEntry}}` rather than spending lore budget on it twice.
    .task('place', ($) => C.undescribedName.v1({
    name: $.gather.state.read.state,
    locationEntries: $.gather.rooms.read.entries,
    params: slot.params(),
}), { expose: { label: 'The current place' } })
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.eligible.candidates,
    budget: $.contextBudget.available,
    shownElsewhere: $.place.entryId,
    params: slot.params(),
}))
    // The narrator's context (owner ruling 2026-10-03): the scene
    // builder, with no plan. The key stays `context`, so a stored
    // value at `context#prompts` keeps its address.
    .task('context', ($) => C.buildSceneContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    fields: $.input.fields,
    locationEntries: $.gather.rooms.read.entries,
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
    // No `prompts` on the generating step — see `respond.ts`
    // (culled 2026-09-16, R-12).
}), { expose: { stream: true, status: 'Looking around' } })
    .outlet('save', ($) => C.createMessage.v1({ text: $.write.text }))
    /**
     * What this step ships with: the post-history reminder's trigger
     * (`POST_HISTORY_TOKEN_TRIGGER`), because the prompt renders the
     * session's growing history and the reminder only earns its place
     * once there is enough of it to drift from; and the places and the
     * room rule as `adventure-respond` ships them — preset values on
     * new nodes, so they reach an install through a re-projection
     * (0111).
     */
    .preset('default', { label: 'Default', default: true }, (p) => p
    .params('prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
    .params('gather.rooms.read', {
    entryTypes: ['core:entry/location'],
    withLinks: true,
})
    .params('place', { path: 'world.location' }))
    .build());
/* ── the two keeper-only actions ────────────────────────────────────────── */
/**
 * Rest and Advance time are one graph with two sets of instructions, and saying
 * so in a builder is more honest than writing it twice.
 *
 * Both read the state, ask the keeper what changes, resolve the names it used
 * and land the result as proposals — or as writes, when the session trusts the
 * narrator. Neither writes a message: a clock tick is a ledger line, not a
 * paragraph, and the narrator has its own button for the paragraph.
 *
 * They are separate SPECS rather than one spec with a parameter because a
 * shipped prompt is resolved per (pool, spec): two specs is what gives Rest its
 * own instructions and Advance time its own, in the same pool, each editable
 * without touching the other.
 */
const keeperAction = (id, version, trigger) => compile(spec(id, {
    version,
    taxonomy: {
        role: 'action',
    },
    contributes: {
        actions: [
            {
                key: trigger.key,
                venue: { kind: 'composer' },
                quick: true,
                icon: trigger.icon,
                label: { en: trigger.label },
                description: { en: trigger.description },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionAction,
})
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('write'),
    // The other half of the same pair, for the model's own
    // window (0114) — see `respond`.
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .task('context', ($) => C.buildKeeperContext.v1({
    cast: $.gather.cast.read.cast,
    state: $.gather.state.read.state,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /**
     * Prose, and no turn to continue — the respond pipeline's
     * reasoning, applied to the two actions it left behind. A step
     * that is asking a question must not be handed a line with
     * somebody's name on the end of it, and must not be shown the
     * JSON an earlier turn left in the session.
     */
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
    budget: $.contextBudget.available,
    messages: $.attached.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('write'),
}))
    /**
     * The keeper's own shape, asked for as a shape.
     *
     * ⚠ **A moved pin**: asking for a document rather than parsing one
     * out of a prefilled reply moves both spec hashes, recorded in the
     * app's `boot/specHashes.test.ts`. Both slugs are new in this
     * release, which is what makes a moved pin a recorded change here
     * rather than a break.
     *
     * The respond pipeline's keeper schema, deliberately: a Rest
     * reporting in one shape and a turn reporting in another would
     * be two vocabularies for one ledger, and the resolver reads one.
     */
    .oracle('write', ($) => C.generateJson.v1({
    context: $.prompt.context,
    schema: ADVENTURE_KEEPER_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'Updating the world' } })
    .query('resolve', ($) => C.resolveStateChanges.v1({
    changes: $.write.items,
    scope: $.input.sessionScope,
    // The version this run read — see `respond`'s keeperResolve.
    base: $.gather.state.read.version,
}))
    .junction('commit', { on: ($) => $.input.fields }, (r) => r
    .when('trusted', { path: 'trustNarrator', truthy: true }, (c) => c.task('apply', ($) => C.setState.v1({
    changes: $.resolve.changes,
    scope: $.input.sessionScope,
    base: $.gather.state.read.version,
    params: slot.params(),
}), { expose: { label: 'Apply the changes' } }))
    .otherwise('reviewed', (c) => c.task('propose', ($) => C.setState.v1({
    changes: $.resolve.changes,
    scope: $.input.sessionScope,
    base: $.gather.state.read.version,
    params: slot.params(),
}), { expose: { label: 'Propose the changes' } })))
    .preset('adventure', { label: 'Adventure', default: true }, (p) => p
    // The keeper's two arms, joined into the one list
    // the resolver takes.
    .params('write', { path: 'values,inventory' })
    .params('commit.trusted.apply', { mode: 'apply' }))
    .build());
/** @internal */
export const ADVENTURE_REST_SPEC_ID = 'core:spec/adventure-rest';
/** @internal */
export const ADVENTURE_REST_VERSION = '1.0.0';
/** Stop and recover: stamina and health back, and the clock moves on. @internal */
export const adventureRestSpec = () => keeperAction(ADVENTURE_REST_SPEC_ID, ADVENTURE_REST_VERSION, {
    key: 'rest',
    icon: 'bed',
    label: 'Rest',
    description: 'Stop to recover stamina and health while time moves on.',
});
/** @internal */
export const ADVENTURE_ADVANCE_TIME_SPEC_ID = 'core:spec/adventure-advance-time';
/** @internal */
export const ADVENTURE_ADVANCE_TIME_VERSION = '1.0.0';
/** Let time pass: the world clock steps on, and the weather may turn with it. @internal */
export const adventureAdvanceTimeSpec = () => keeperAction(ADVENTURE_ADVANCE_TIME_SPEC_ID, ADVENTURE_ADVANCE_TIME_VERSION, {
    key: 'advance-time',
    icon: 'clock',
    label: 'Time passes',
    description: 'Let time pass in the world; the weather may change with it.',
});
/* ── ask / answer: the worked form (plans/29 R-15 *Forms*; 30 §U5d) ──────── */
/** @internal */
export const ADVENTURE_ASK_SPEC_ID = 'core:spec/adventure-ask';
/** @internal */
export const ADVENTURE_ASK_VERSION = '1.0.0';
/** @internal */
export const ADVENTURE_ANSWER_SPEC_ID = 'core:spec/adventure-answer';
/** @internal */
export const ADVENTURE_ANSWER_VERSION = '1.0.0';
/**
 * What the narrator's question comes back as, from `generate-json@1`.
 *
 * The addressee is a **name** rather than a participant reference: the
 * model reads names off the transcript, and `make-choices@1` resolves
 * the name — against the cast first, then the members' presences, by
 * name or nickname — into `character:<id>` at the write. A name that
 * resolves to nobody leaves the block unaddressed; a press on an
 * unaddressed block is answered as the presser (their presence when
 * they hold one, else their own line).
 * @internal
 */
export const ADVENTURE_ASK_SCHEMA = {
    type: 'object',
    properties: {
        addressee: { type: 'string' },
        question: { type: 'string' },
        options: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
                type: 'object',
                properties: { key: { type: 'string' }, label: { type: 'string' } },
                required: ['key', 'label'],
                additionalProperties: false,
            },
        },
    },
    required: ['addressee', 'question', 'options'],
    additionalProperties: false,
};
/**
 * **Ask**: the narrator puts a question with options to one of the cast.
 *
 * The worked form of R-15: the oracle writes `{ addressee, question, options }`,
 * `make-choices` turns it into a `choices` block addressed to that cast
 * member (`character:<id>`) whose options fire `answer`, and the narration
 * row carries it. The host stamps the block with this spec's `answer` action
 * and an id at the write; if the run's pinned portrayals say the AI portrays
 * the addressee, it records `form-addressed` and the genre's answer pipeline
 * (`core:spec/answer-form-adventure`) answers as them — else the block waits
 * for the person portraying them to click. Either way the click, real or
 * committed, runs `adventure-answer` below.
 *
 * Two actions on one spec, each its own thing to the venue model: `ask` is
 * the composer's chip and `/ask`; `answer` is what the block's options fire,
 * declared here so the block has an identity to be stamped with. `answer`
 * is offered to any participant — the form's **addressee** is who may
 * actually press it, decided per block at the fire.
 * @internal
 */
export const adventureAskSpec = () => compile(spec(ADVENTURE_ASK_SPEC_ID, {
    version: ADVENTURE_ASK_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'ask',
                venue: { kind: 'composer' },
                quick: true,
                icon: 'message-circle-question',
                label: { en: 'Ask' },
                description: { en: 'The narrator puts a question, with choices, to one of the cast.' },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionAction,
})
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('write'),
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .task('context', ($) => C.buildNarratorContext.v1({
    cast: $.gather.cast.read.cast,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /** Prose and no seed — a question is asked, not a turn taken (see the keeper actions). */
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
    budget: $.contextBudget.available,
    messages: $.attached.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('write'),
}))
    .oracle('write', ($) => C.generateJson.v1({
    context: $.prompt.context,
    schema: ADVENTURE_ASK_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'Posing a question' } })
    .task('choices', ($) => C.makeChoices.v1({
    json: $.write.json,
    fn: 'answer',
    // Answer is the other spec's declaration, named on purpose:
    // the host holds the options to THAT action's audience —
    // the block's addressee — and runs THAT spec on a press.
    action: `${ADVENTURE_ANSWER_SPEC_ID}#answer`,
    cast: $.gather.cast.read.cast,
}))
    .outlet('save', ($) => C.createMessage.v1({
    narration: true,
    text: $.choices.text,
    blocks: $.choices.blocks,
}))
    .build());
/**
 * **Answer**: what a form's option fires — the addressee's line, as the
 * addressee. `read-answer` takes the press apart (the chosen option's label,
 * who answered and their character row) and `create-message` posts the
 * label as that participant's message. A person portraying the addressee
 * clicks and the row is theirs; the answer pipeline commits an oracle's
 * choice and the row is the AI's — same spec, same row, either way, which
 * is the whole of "exactly as a click would".
 *
 * Declared on its own spec rather than folded into `ask`: a spec has one
 * inlet and one graph, and asking and answering are two graphs.
 * @internal
 */
export const adventureAnswerSpec = () => compile(spec(ADVENTURE_ANSWER_SPEC_ID, {
    version: ADVENTURE_ANSWER_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'answer',
                /**
                 * Carried by a block in a message and pressed from that
                 * block alone: the `form` venue (U5d review, S1) is the
                 * one no listing offers, so *Answer* is in no message's
                 * overflow and no composer menu — a question is answered
                 * where it was asked. The block's fire still resolves it.
                 */
                venue: { kind: 'form' },
                audience: { see: ['participant'], act: ['participant'] },
                icon: 'message-circle-reply',
                label: { en: 'Answer' },
                description: { en: 'Answer a question the narrator put to you.' },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: adventureGenre,
    event: sessionEvents.sessionAction,
})
    .task('answer', ($) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
    .outlet('save', ($) => C.createMessage.v1({
    text: $.answer.label,
    characterId: $.answer.characterId,
    speaker: $.answer.addressee,
}))
    .build());
//# sourceMappingURL=adventureActions.js.map