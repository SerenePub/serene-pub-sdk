/**
 * The Writing Room's actions (plans/genres §2; U2) — the small pipelines an
 * author fires from the composer and from a chunk of the manuscript.
 *
 * `session-action` is an OPEN event: any number of pipelines may serve it, and
 * which ones a session offers is the preset's `actions.include`. Six actions in
 * three shapes, and the shapes are what the file is organised by:
 *
 *  - **the manuscript's verbs** — *Continue*, *Rewrite*, *Expand*, *Tighten*.
 *    One graph, four sets of instructions. Each reads the manuscript as a folio
 *    and writes prose back to the manuscript; *Continue* adds a chunk, the
 *    other three take the chunk they were pressed on and replace it.
 *  - **the conversation's** — *Brainstorm* and *Critique this passage*. The
 *    companion answers on `main`, with the manuscript as context.
 *  - **the two that are neither** — *Add to bible*, which asks a model for one
 *    lore entry and lands it behind the review gate, and *Export*, which makes
 *    no model call at all.
 *
 * ## Why each verb is its own spec
 *
 * A shipped prompt is resolved per (node definition, slot) per spec, so four
 * verbs sharing one spec would ship four verbs one set of instructions. Four
 * specs is what gives *Tighten* its own wording and *Expand* its own, in the
 * same pool, each editable without touching the other — the reasoning
 * `adventureActions.ts` records for Rest and Advance time, applied to prose.
 *
 * ## The subject: the chunk that was pressed
 *
 * *Rewrite*, *Expand*, *Tighten* and *Critique* are **message-venue** actions:
 * a press carries `messageId`, and `create-message`'s `row` port takes it, so
 * the chunk the author pressed is the row the rewrite lands in. They are
 * offered only on the newest row of the manuscript (`enabledWhen`), which is
 * also the last passage of the folio the model is shown — so "this passage" and
 * "the end of the manuscript above" are the same passage by construction.
 *
 * ⚠ **A sub-passage selection cannot ride along.** A fire carries a message and
 * a payload, and the payload is a form's answer or a widget's `invoke` args —
 * nothing in the client sends a text range. So the unit is the chunk, which is
 * why the genre has a chunk length at all.
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { MANUSCRIPT_CHANNEL, writingRoomGenre } from './genres.js';
/**
 * Offered only on the newest chunk of the manuscript.
 *
 * Two predicates, both over the message venue's published `item` document: the
 * row is its channel's head, and its channel is the manuscript. The second is
 * what keeps *Rewrite* off the conversation — `venue.channel` would be the
 * declared way to say it, and it cannot be relied on yet: a listing is built
 * for ONE channel and the client asks for none, so a channel-scoped venue is
 * dropped before it is ever offered.
 */
const ON_THE_LAST_CHUNK = [
    {
        on: 'item.isNewest',
        truthy: true,
        reason: {
            en: 'The manuscript has moved on — this works on the last passage.',
        },
    },
    {
        on: 'item.channel',
        equals: MANUSCRIPT_CHANNEL,
        reason: { en: 'This works on the manuscript, not on the conversation.' },
    },
];
/* ── the manuscript's verbs ─────────────────────────────────────────────── */
/**
 * One graph, four sets of instructions.
 *
 * The placeholder takes `row: $.input.messageId`, which is the whole of the
 * difference between adding a chunk and replacing one: *Continue* is pressed in
 * the composer, carries no message, and inserts; the other three are pressed on
 * a chunk, carry it, and reuse that row.
 *
 * `prose-transcript` rather than `process-messages`: a fired action names no
 * channel, so the channel's declared `voice: 'none'` does not reach the run and
 * the seed decision would fall back to whichever channel spoke last. This node
 * is `process-messages` with the seed switched off, which is the deterministic
 * answer — the manuscript never wants a trailing `Verity:`.
 */
const manuscriptVerb = (id, version, trigger) => compile(spec(id, {
    version,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: trigger.key,
                venue: { kind: trigger.venue },
                quick: trigger.quick ?? false,
                icon: trigger.icon,
                label: { en: trigger.label },
                description: { en: trigger.description },
                ...(trigger.venue === 'message'
                    ? { enabledWhen: ON_THE_LAST_CHUNK }
                    : {}),
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: writingRoomGenre,
    event: sessionEvents.sessionAction,
})
    /**
     * The chunk, created or claimed. `channel` is named rather than
     * left to the default because the press came from wherever the
     * author was standing and the prose belongs on the manuscript
     * whatever that was.
     */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    row: $.input.messageId,
    channel: MANUSCRIPT_CHANNEL,
}))
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('bible', (c) => c.query('read', ($) => C.lorebookTriggers.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('write'),
    connection: slot.connectionOf('write'),
    params: slot.params(),
}))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [$.gather.history.read.band, $.gather.bible.read.main],
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.lore.candidates,
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    /**
     * The genre's fields on the template context, so this verb's
     * instructions can write `{{pov}}`, `{{tense}}`, `{{chunkLength}}`
     * and `{{authorsNote}}` — see `writingRoom.ts` for why this type
     * is the one that carries them.
     */
    .task('context', ($) => C.buildPlannerContext.v1({
    cast: $.gather.cast.read.cast,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.lines.messages,
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
}), { expose: { stream: true, status: 'Writing' } })
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.placeholder.messageId,
    text: $.write.text,
    thinking: $.write.thinking,
}))
    /** Every channel in one read — see `writingRoom.ts`'s preset. */
    .preset('writing-room', { label: 'Writing Room', default: true }, (p) => p.params('gather.history.read', { channel: '*' }))
    .build());
/** @internal */
export const WRITING_ROOM_CONTINUE_SPEC_ID = 'core:spec/writing-room-continue';
/** @internal */
export const WRITING_ROOM_REWRITE_SPEC_ID = 'core:spec/writing-room-rewrite';
/** @internal */
export const WRITING_ROOM_EXPAND_SPEC_ID = 'core:spec/writing-room-expand';
/** @internal */
export const WRITING_ROOM_TIGHTEN_SPEC_ID = 'core:spec/writing-room-tighten';
// 1.1.0: the `speaker` node went with the strategies' re-port
// (PLAN-turn-order §4.4). It was pinned to `turn-manual`, whose whole job
// here was recording the action's explicit pick — and an explicit pick
// never enters a strategy any more; it arrives on the inlet and the
// downstream nodes read it there.
/** @internal */
export const WRITING_ROOM_ACTION_VERSION = '1.1.0';
/** The one quick verb: another chunk, at the length the session asked for. @internal */
export const writingRoomContinueSpec = () => manuscriptVerb(WRITING_ROOM_CONTINUE_SPEC_ID, WRITING_ROOM_ACTION_VERSION, {
    key: 'continue-manuscript',
    icon: 'pen-line',
    label: 'Continue',
    description: 'Write the next chunk of the manuscript.',
    venue: 'composer',
    quick: true,
});
/** @internal */
export const writingRoomRewriteSpec = () => manuscriptVerb(WRITING_ROOM_REWRITE_SPEC_ID, WRITING_ROOM_ACTION_VERSION, {
    key: 'rewrite',
    icon: 'refresh-cw',
    label: 'Rewrite',
    description: 'Write this passage again, differently.',
    venue: 'message',
});
/** @internal */
export const writingRoomExpandSpec = () => manuscriptVerb(WRITING_ROOM_EXPAND_SPEC_ID, WRITING_ROOM_ACTION_VERSION, {
    key: 'expand',
    icon: 'maximize-2',
    label: 'Expand',
    description: 'Give this passage more room — more detail, more beats.',
    venue: 'message',
});
/** @internal */
export const writingRoomTightenSpec = () => manuscriptVerb(WRITING_ROOM_TIGHTEN_SPEC_ID, WRITING_ROOM_ACTION_VERSION, {
    key: 'tighten',
    icon: 'minimize-2',
    label: 'Tighten',
    description: 'Cut this passage back to what it needs.',
    venue: 'message',
});
/* ── the conversation's ─────────────────────────────────────────────────── */
/**
 * The companion answers on `main`, with the manuscript in front of it.
 *
 * No `row`: a talk action always writes a NEW line in the conversation, even
 * when it was pressed on a chunk of the manuscript — *Critique this passage*
 * reads a chunk and answers beside it, never over it.
 */
const talkAction = (id, version, trigger) => compile(spec(id, {
    version,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: trigger.key,
                venue: { kind: trigger.venue },
                quick: false,
                icon: trigger.icon,
                label: { en: trigger.label },
                description: { en: trigger.description },
                ...(trigger.venue === 'message'
                    ? { enabledWhen: ON_THE_LAST_CHUNK }
                    : {}),
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: writingRoomGenre,
    event: sessionEvents.sessionAction,
})
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    speaker: $.input.speaker,
    characterId: $.input.characterId,
    channel: 'main',
}))
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    .chain('bible', (c) => c.query('read', ($) => C.lorebookTriggers.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('say'),
    connection: slot.connectionOf('say'),
    params: slot.params(),
}))
    .task('lore', ($) => C.concatCandidates.v1({
    sources: [$.gather.history.read.band, $.gather.bible.read.main],
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.lore.candidates,
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    currentCharacterId: $.input.characterId,
    speaker: $.input.speaker,
    /**
     * The action's OWN pool, not the envoy's address.
     *
     * `writing-room-respond` reads `envoy:scribe`, because
     * there the companion is simply being itself. Here it has
     * been given a job — brainstorm, critique — and a job is
     * instructions, which is a row in this node's pool that an
     * author can edit without touching who the scribe is. The
     * card still arrives on `speaker`, so it is the same
     * companion doing the work.
     */
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext,
    seedName: $.context.seedName,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('say'),
}))
    .oracle('say', ($) => C.generateText.v1({
    context: $.prompt.context,
    currentCharacterId: $.input.characterId,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { stream: true, status: 'Considering the draft' } })
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.placeholder.messageId,
    text: $.say.text,
    thinking: $.say.thinking,
}))
    .preset('writing-room', { label: 'Writing Room', default: true }, (p) => p.params('gather.history.read', { channel: '*' }))
    .build());
/** @internal */
export const WRITING_ROOM_BRAINSTORM_SPEC_ID = 'core:spec/writing-room-brainstorm';
/** @internal */
export const WRITING_ROOM_CRITIQUE_SPEC_ID = 'core:spec/writing-room-critique';
/** @internal */
export const writingRoomBrainstormSpec = () => talkAction(WRITING_ROOM_BRAINSTORM_SPEC_ID, WRITING_ROOM_ACTION_VERSION, {
    key: 'brainstorm',
    icon: 'lightbulb',
    label: 'Brainstorm',
    description: 'Ask the companion for options for what happens next.',
    venue: 'composer',
});
/** @internal */
export const writingRoomCritiqueSpec = () => talkAction(WRITING_ROOM_CRITIQUE_SPEC_ID, WRITING_ROOM_ACTION_VERSION, {
    key: 'critique',
    icon: 'message-square-quote',
    label: 'Critique this passage',
    description: 'Ask the companion what is and is not working in this passage.',
    venue: 'message',
});
/* ── add to bible ───────────────────────────────────────────────────────── */
/** @internal */
export const WRITING_ROOM_ADD_TO_BIBLE_SPEC_ID = 'core:spec/writing-room-add-to-bible';
/**
 * The genre's declared lore write (R-B), and the one action on the **world**
 * side of the effects line: a lore entry is a row in a book that outlives the
 * session, so the action is `world`, its audience is the owner, and no message
 * block may ever name it.
 *
 * ## The form is the review gate, not a `form` block
 *
 * The plan asked for "a form: name, content". It is one — it is just not a
 * block in a message. `core:outlet/create-lore-entry@1` declares
 * `review: { fields: ['name', 'content'] }`, which means core holds the write
 * at the gate and shows the author **those two fields, editable**, before
 * anything lands. A `form` block could not have done it: a world action is
 * exactly what a block may not name, which is the rule that stops a character
 * asking a question that rewrites a lorebook.
 *
 * So the model proposes and the author confirms, in the surface the app already
 * has for "a pipeline wants to write something".
 *
 * ## Two readings of one document
 *
 * A data reference is `{node, port}` with no sub-path, so the entry's name and
 * its content cannot come off one node. The proposal is read twice at two
 * paths, each one pure and costing a millisecond — the same construction Lair's
 * knock uses for its question.
 * @internal
 */
export const WRITING_ROOM_BIBLE_SCHEMA = {
    type: 'object',
    required: ['name', 'content'],
    properties: {
        name: {
            type: 'string',
            description: "The entry's name — the thing itself, as the manuscript calls it.",
        },
        content: {
            type: 'string',
            description: 'What is true about it, in a few sentences. Facts the story must keep, not a summary of what has happened.',
        },
    },
};
/** @internal */
export const writingRoomAddToBibleSpec = () => compile(spec(WRITING_ROOM_ADD_TO_BIBLE_SPEC_ID, {
    version: WRITING_ROOM_ACTION_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'add-to-bible',
                venue: { kind: 'composer' },
                quick: false,
                icon: 'book-plus',
                label: { en: 'Add to bible' },
                description: {
                    en: 'Take something the manuscript has established and write it into the story bible.',
                },
                /** Outside the fiction: a lorebook outlives the session. */
                effects: 'world',
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: writingRoomGenre,
    event: sessionEvents.sessionAction,
})
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('propose'),
    connection: slot.connectionOf('propose'),
    params: slot.params(),
}))
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.gather.history.read.band,
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    .task('context', ($) => C.buildPlannerContext.v1({
    cast: $.gather.cast.read.cast,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /** A question, not a turn — no line to continue. */
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.context.templateContext,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('propose'),
}))
    .oracle('propose', ($) => C.generateJson.v1({
    context: $.prompt.context,
    schema: WRITING_ROOM_BIBLE_SCHEMA,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'Drafting a bible entry' } })
    .task('entryName', ($) => C.parseJson.v1({ text: $.propose.text, params: slot.params() }))
    .task('entryContent', ($) => C.parseJson.v1({ text: $.propose.text, params: slot.params() }))
    /**
     * ⚠ **Two more nodes, and they are a type conversion.**
     *
     * `parse-json` publishes `value` as `json` — it has no idea what
     * the path it read holds — and `create-lore-entry` takes `text`.
     * The law refuses the wire (01 §3), rightly: a shape mismatch here
     * is an object landing in a lorebook's name column. `join-text`
     * over the one-element `items` list, with `path` empty so it reads
     * each entry itself, is the declared way to say "this is a
     * string" — and it costs a millisecond each.
     */
    .task('entryNameText', ($) => C.joinText.v1({ items: $.entryName.items, params: slot.params() }))
    .task('entryContentText', ($) => C.joinText.v1({ items: $.entryContent.items, params: slot.params() }))
    .outlet('write', ($) => C.createLoreEntry.v1({
    name: $.entryNameText.text,
    content: $.entryContentText.text,
    // The bible is world lore, which is the declared default —
    // named so the control is live rather than rendered and
    // unread (L3).
    params: slot.params(),
}))
    .preset('writing-room', { label: 'Writing Room', default: true }, (p) => p
    // Where each half of the proposal is in the document the
    // model wrote. Both differ from the declared default (the
    // whole document), so both have to be a choice something
    // made.
    .params('entryName', { path: 'name' })
    .params('entryContent', { path: 'content' })
    // The entry itself, not a key off it — see the two nodes.
    .params('entryNameText', { path: '' })
    .params('entryContentText', { path: '' })
    /**
     * ON, and this is the one action where that is not a
     * preference. The outlet declares `name` and `content` as
     * reviewable fields; with the gate open they arrive as an
     * editable form before the entry lands, which is the whole
     * of what "a form: name, content" means here.
     */
    .settings('write', { review: 'on' })
    // A proposal nobody reads as prose: low temperature, a short
    // window, no reasoning trace.
    .sampling('propose', { seedKey: 'sampling-background' }))
    .build());
/* ── export ─────────────────────────────────────────────────────────────── */
/** @internal */
export const WRITING_ROOM_EXPORT_SPEC_ID = 'core:spec/writing-room-export';
/**
 * The manuscript, compiled to Markdown — **as a message, not as a file.**
 *
 * ⚠ **There is no download path for a session's own content**, and this is the
 * gap rather than a preference. `pipeline_run_artifacts` stores pointers and no
 * bytes; the one outlet that reaches document-capable storage is
 * `attach-audio@1`, whose contract says audio; `Sockets.Sessions.ExportLogs` is
 * a type with no handler, no event and no caller. A `.md` file would have had
 * to be invented — a new outlet, a new shape and a route — so it is not.
 *
 * What this does instead is the nearest supported thing: one `md` block on
 * `main`, which the log renders as Markdown and a person can select and copy.
 *
 * ⚠ A block's text is capped at 64 KiB (`MESSAGE_BLOCK_LIMITS.maxText`), so a
 * long manuscript is refused at the write rather than truncated. That cap is
 * the second half of the same gap: a card is not a document.
 *
 * No model call anywhere in it — a compile is a join.
 * @internal
 */
export const writingRoomExportSpec = () => compile(spec(WRITING_ROOM_EXPORT_SPEC_ID, {
    version: WRITING_ROOM_ACTION_VERSION,
    taxonomy: { role: 'action' },
    contributes: {
        actions: [
            {
                key: 'export',
                venue: { kind: 'composer' },
                quick: false,
                icon: 'file-down',
                label: { en: 'Export' },
                description: {
                    en: 'Post the whole manuscript as one Markdown block you can copy out.',
                },
            },
        ],
    },
})
    .inlet('input', C.userMessage.v1(), {
    genre: writingRoomGenre,
    event: sessionEvents.sessionAction,
})
    /** The manuscript alone — the preset scopes this read to it. */
    .query('manuscript', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))
    /**
     * The chunks, in order, as one text. `path: 'content'` is the row's
     * own column, and the blank line between chunks is what makes the
     * result read as paragraphs rather than as a wall.
     */
    .task('compile', ($) => C.joinText.v1({
    items: $.manuscript.messages,
    params: slot.params(),
}))
    /**
     * One message, one block. The row's own text names what it is; the
     * manuscript rides in the block, where the log renders it as
     * Markdown instead of as a paragraph of somebody's dialogue.
     */
    .outlet('post', ($) => C.createMessage.v1({
    text: 'Export — the manuscript, as Markdown.',
    channel: 'main',
    blocks: [{ kind: 'md', text: $.compile.text }],
}))
    .preset('writing-room', { label: 'Writing Room', default: true }, (p) => p
    // The manuscript, whole: this read is the export, so its
    // window is the book rather than a prompt's recent slice.
    .params('manuscript', { channel: MANUSCRIPT_CHANNEL, limit: 1000 })
    .params('compile', { path: 'content', separator: '\n\n' }))
    .build());
/** Every action pipeline the Writing Room ships. @internal */
export const WRITING_ROOM_ACTION_SPECS = [
    writingRoomContinueSpec,
    writingRoomRewriteSpec,
    writingRoomExpandSpec,
    writingRoomTightenSpec,
    writingRoomBrainstormSpec,
    writingRoomCritiqueSpec,
    writingRoomAddToBibleSpec,
    writingRoomExportSpec,
];
//# sourceMappingURL=writingRoomActions.js.map