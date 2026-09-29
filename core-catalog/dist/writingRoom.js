/**
 * The **Writing Room** genre's two pipelines (plans/genres §2; U2): the create
 * pipeline that is the genre's required member, and the one reply that answers
 * on either channel.
 *
 * ## The one new thing, and where it lives
 *
 * `writing-room-respond` is a **junction on the channel the turn was triggered
 * on** (`$.input.channel`, R-C). Two postures, one document:
 *
 *  - **`manuscript`** — a continuation. The channel is a `folio`, so the host
 *    folds its rows into one block of text ahead of the conversation, and its
 *    declared `voice: 'none'` means `process-messages` writes **no seed row at
 *    all**: the prompt does not end `Verity:`, because a page has no speaker to
 *    announce. The instructions are the manuscript's own — point of view,
 *    tense, chunk length and the author's note, which arrive as the genre's
 *    `fields` and render as `{{pov}}`, `{{tense}}`, `{{chunkLength}}` and
 *    `{{authorsNote}}`.
 *  - **`main`** — the companion's reply, with the manuscript as context. The
 *    speaker is the seated character, or the `scribe` envoy when no card is
 *    seated, and the envoy's instructions are configuration at the address
 *    `envoy:scribe` exactly as the guide's mascot's are.
 *
 * The reply lands on the channel the trigger was on because the placeholder
 * carries `channel: $.input.channel` — one row, created once, on the spine, and
 * finished by whichever branch fired. Both branches read the bible through the
 * same keyword scan, and both are budgeted and ranked once, above the junction.
 *
 * ## Why the two branches use different context builders
 *
 * A shipped prompt is resolved per (node definition, slot) per spec, so two
 * nodes of the same type in one document land on the same authored row. The
 * manuscript's instructions and the companion's are not the same instructions,
 * so they cannot be the same type.
 *
 * ⚠ The manuscript arm therefore borrows `core:task/build-planner-context@1`,
 * which is the only shipped context surface that takes the genre's `fields` and
 * declares no speaker — both of which the manuscript needs. It is the right
 * SHAPE and the wrong NAME: the Pipelines panel labels the step "Build planner
 * context". A neutral `fields`-taking surface would be a new contract type, and
 * a new type is a contracts change core cannot see until that package is
 * rebuilt — so the borrow is deliberate and recorded here rather than smuggled.
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { withSpriteTail } from './sprites.js';
import { MANUSCRIPT_CHANNEL, WRITING_ROOM_SCRIBE_KEY, writingRoomGenre, } from './genres.js';
/** @internal */
export const WRITING_ROOM_CREATE_SPEC_ID = 'core:spec/writing-room-create';
/** @internal */
export const WRITING_ROOM_CREATE_VERSION = '1.0.0';
/**
 * The genre's one required member (24 §3) — and it writes **nothing**.
 *
 * Greeting is off, so there are no greetings to seed; a blank page is what a
 * writing room is meant to open on. There is no model call either, which is
 * what lets the preset ship enabled: creating a session publishes this
 * document, the run ends with a receipt saying it did, and the genre's
 * declaration — the scribe included — rides `meta.genre` on the version row,
 * which is where the host reads "which speakers does this genre bring" from.
 *
 * An inlet and no more is a valid document (`validate()` asks for one inlet,
 * not for an effect), and it is the honest one: a create pipeline that read the
 * cast's greetings and then declined to write them would be two nodes agreeing
 * to do nothing.
 * @internal
 */
export const writingRoomCreateSpec = () => compile(spec(WRITING_ROOM_CREATE_SPEC_ID, {
    version: WRITING_ROOM_CREATE_VERSION,
    taxonomy: { role: 'create' },
    genre: {
        name: writingRoomGenre.name,
        family: writingRoomGenre.family,
        description: writingRoomGenre.description,
        shape: writingRoomGenre.shape,
        events: writingRoomGenre.events,
        envoys: writingRoomGenre.envoys,
    },
})
    .inlet('input', C.sessionCreated.v1(), {
    genre: writingRoomGenre,
    event: sessionEvents.sessionCreated,
})
    .build());
/** @internal */
export const WRITING_ROOM_RESPOND_SPEC_ID = 'core:spec/writing-room-respond';
// 1.1.0: the `speaker` node moved to `core:spec/turn-order` — see
// `RESPOND_VERSION`, same change, same reason.
/** @internal */
export const WRITING_ROOM_RESPOND_VERSION = '1.1.0';
/** One reply, two postures — see the module note. @internal */
export const writingRoomRespondSpec = () => compile(
// The sprite tail (DESIGN-sprites §5): after `save`, choose the line's face.
withSpriteTail(spec(WRITING_ROOM_RESPOND_SPEC_ID, {
    version: WRITING_ROOM_RESPOND_VERSION,
    taxonomy: { role: 'primary' },
})
    .inlet('input', C.userMessage.v1(), {
    genre: writingRoomGenre,
    event: sessionEvents.messageRespond,
})
    /**
     * The reply row, created by the pipeline that fills it (R-17) —
     * **directly after the inlet** (PLAN-turn-order §4.4).
     *
     * It used to wait for the cast and history reads, because a
     * `speaker` node between them decided who the row was for. Turn
     * order is state now: the entry being fired names the speaker,
     * and it arrives on the inlet — so the row can be made in the
     * first milliseconds of the run, before anything costs a token.
     * This is the placeholder the composer shows while the turn runs,
     * the run's live row the oracle's stream lands in, and the row
     * Stop finalises with whatever had arrived. `save` at the end
     * updates it; the pair is one primary row. A regenerate, swipe or
     * extend hands its existing row in on `messageId` and this node
     * claims it instead of inserting.
     */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    characterId: $.input.characterId,
    speaker: $.input.speaker,
    row: $.input.messageId,
    channel: $.input.channel,
}))
    .gather('gather', { mode: 'parallel' }, (b) => b
    /**
     * **Every channel** — the author preset sets `channel: '*'`
     * on this node, which is what puts the manuscript and the
     * conversation in one read. The host then partitions them
     * by the role their channel declares: the folio folds into
     * one block, the conversation stays turns.
     */
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
    /**
     * The bible, by keyword. One mechanism rather than
     * `respond`'s five: a story bible is a book somebody wrote
     * on purpose, its entries carry the keys they should fire
     * on, and a writing room that ran three lore lanes and two
     * embedding arms on every keystroke would be paying for
     * retrieval it did not ask for. A person who wants the
     * whole machinery attaches the standard reply pipeline.
     */
    .chain('bible', (c) => c.query('read', ($) => C.lorebookTriggers.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))))
    /**
    /**
     * Sized for the manuscript's oracle, and the conversation's prompt
     * is rendered for it too — the same construction, and the same
     * caveat, as Lair's budget naming a node inside a branch. Two
     * oracles cannot both be the one this is measured against, and the
     * long-form one is the one whose window matters.
     */
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('turn.manuscript.write'),
    connection: slot.connectionOf('turn.manuscript.write'),
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
     * The junction, on the trigger's channel.
     *
     * ⚠ **Strict equality against the slug**, which is exact because
     * this genre allocates no lanes: lane 1 is stored as the bare slug,
     * every Writing Room row is on lane 1, and `manuscript` is
     * therefore the whole stored string. A pipeline that later opened
     * `manuscript:2` would fall to `talk`, and the honest fix then is a
     * node that reduces the channel to its slug — not a wider
     * predicate, which would be a second way to spell a channel.
     */
    .junction('turn', { on: ($) => $.input.channel }, (r) => r
    .when('manuscript', { equals: MANUSCRIPT_CHANNEL }, (c) => c
    /**
     * The manuscript's own instructions, with the
     * genre's fields on the template context — see the
     * module note for why this type and not the
     * standard one.
     */
    .task('context', ($) => C.buildPlannerContext.v1({
    cast: $.gather.cast.read.cast,
    fields: $.input.fields,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /**
     * No seed row, and nothing here says so: the
     * channel's declared `voice: 'none'` arrives on the
     * cast read and this node reads it off the same
     * bundle the context builder resolved the name
     * from. `continuationPrefill` is wired because the
     * *extend* verb is the same gesture as a
     * continuation — a partial chunk finished rather
     * than a new one begun.
     */
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.turn.manuscript.context.templateContext,
    seedName: $.turn.manuscript.context.seedName,
    continuationPrefill: $.input.continuationPrefill,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.turn.manuscript.lines.messages,
    templateContext: $.turn.manuscript.context.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'turn.manuscript.context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('turn.manuscript.write'),
}))
    /**
     * No `currentCharacterId`: nobody is speaking a
     * line here, so the stop composer has no speaker
     * labels to exclude and the continuation machinery
     * has no turn to key on.
     */
    .oracle('write', ($) => C.generateText.v1({
    context: $.turn.manuscript.prompt.context,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { stream: true, status: 'Writing' } }))
    .otherwise('talk', (c) => c
    /**
     * The companion's card and instructions. `speaker`
     * is what tells the builder it is compiling an
     * envoy rather than a cast row; with a character
     * seated the same port carries that character and
     * the scribe's prompts are simply not reached.
     */
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    currentCharacterId: $.input.characterId,
    speaker: $.input.speaker,
    prompts: slot.prompts({ envoy: WRITING_ROOM_SCRIBE_KEY }),
    variables: slot.variables(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.turn.talk.context.templateContext,
    seedName: $.turn.talk.context.seedName,
    continuationPrefill: $.input.continuationPrefill,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    groups: $.rank.groups,
    budget: $.contextBudget.available,
    messages: $.turn.talk.lines.messages,
    templateContext: $.turn.talk.context.templateContext,
    template: slot.template(),
    // The envoy's text arrives through
    // `templateContext`, not through this slot
    // — see `guide.ts` for the one-hop rule
    // this construction obeys.
    prompts: slot.prompts({ node: 'turn.talk.context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('turn.talk.say'),
}))
    .oracle('say', ($) => C.generateText.v1({
    context: $.turn.talk.prompt.context,
    currentCharacterId: $.input.characterId,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { stream: true, status: 'Considering the draft' } })))
    /**
     * The fired branch's text — the chunk, or the companion's reply.
     *
     * ⚠ **The write is here and not in the branches.** The reply is
     * the run's live row, which its placeholder opened before the
     * junction; the branches decide what it says, not where it goes.
     * So each branch ends on its oracle, the clause's
     * `values` carries whichever one fired, and `join-text` folds a
     * one-item list into the string the row takes. Exactly one branch
     * ever fires here, so the separator is never reached.
     *
     * ⚠ The reasoning trace is the price: `join-text` carries text and
     * a port takes one reference, so a two-branch reply stores no
     * `thinking`. Lair pays the same price for the same law; closing it
     * needs a fold that carries more than a string, which is a node
     * nobody has declared.
     */
    .task('turnText', ($) => C.joinText.v1({ items: $.turn.values, params: slot.params() }))
    /** The row the spine created, finished by whichever branch ran. */
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.placeholder.messageId,
    text: $.turnText.text,
}))
    /**
     * What the pipeline ships with — selections a person can change in
     * the panel, never literals welded into the document.
     */
    .preset('writing-room', { label: 'Writing Room', default: true }, (p) => p
    /**
     * The whole session, both channels, in one read. Without
     * it this node reads `main` — the declared default — and
     * the manuscript would never reach the prompt at all.
     */
    .params('gather.history.read', { channel: '*' })))
    .build());
//# sourceMappingURL=writingRoom.js.map