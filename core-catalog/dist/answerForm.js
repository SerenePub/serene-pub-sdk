/**
 * The built-in **answer pipeline** (plans/29 R-15 *Forms*; R-21 (5); 09-B B9,
 * F39; built 2026-09-17 as 30 §U5d).
 *
 * A **form** is an action still awaiting its answer — a `choices` or `form`
 * block a message carries, addressed to a participant. Elara asks Tom "will
 * you come to the festival?"; if a person portrays Tom tonight, the block
 * waits for their click. If the AI portrays Tom, core records
 * `core:event/form-addressed@1` once the asking run's receipt is saved, and
 * the genre's binding for that event runs THIS pipeline as a child of the
 * asking run: the inlet carries the form and the addressee, a gather reads
 * the addressee's card and the conversation, the context builder compiles
 * the card as it would a speaker's, `form-context` lays the question and the
 * options into the prompt and derives the JSON Schema, an oracle with the
 * `json` capability answers against it, and `answer-form` commits the answer
 * **exactly as a click would** — the block's action fires through the same
 * server path a press takes, as the addressee, receipted, gate-eligible,
 * and recorded as `form-answered` in the session's changes for the next
 * reply's inlet. Tom answers *Maybe*, and the next turn sees it as an event.
 *
 * ## One graph, one spec per genre
 *
 * A spec has one inlet lock and a preset binds a spec whose lock names the
 * preset's genre (24 §4), so the pipeline is declared once here and
 * published once per shipped genre — one each for chat, adventure, guide,
 * lair, writing room and whodunit. Chat and Guide reuse the same authored
 * prompt row; a plugin genre publishes its own through the same builder.
 *
 * ⚠ **Every shipped genre binds one, whatever its own forms look like**
 * (ruled 2026-09-17). A genre cannot promise that no pipeline — its own, one
 * a person attaches, or a plugin's — will ever put a form to a participant
 * the AI portrays, and a form nobody can answer is a stuck session. So the
 * event is declared optional on every genre and bound on every shipped
 * preset; the three genres whose forms are all owner-addressed today bind
 * this for the day one is not.
 *
 * ## What it deliberately does not do
 *
 * It answers **fiction** only. A `world` action — one whose result touches
 * cards, lore, settings, permissions — can never be named by a block (the
 * write refuses it), and `answer-form` refuses it again at the commit: the
 * effects line is drawn by effects, not by who asked. And it never confirms
 * or reviews: a pipeline sees the request and the result; the review gate
 * stays the owner's.
 *
 * ## The template, inline
 *
 * As the tool loop's: a reference whose prompt lives in a database row is one
 * you cannot read. The character's instructions (`systemPrompt`, on the
 * context builder's pool) are seeded prose a person edits in the panel; this
 * file holds the layout alone — the card, the transcript, then the question
 * and its options as the last user turn, so the model's one JSON object is
 * an answer to a question it has just been asked.
 */
import { compile, handlebars, slot, spec, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { adventureGenre, chatGenre, guideGenre } from './genres.js';
import { lairGenre, whodunitGenre, writingRoomGenre } from './genres.js';
/** @internal */
export const ANSWER_FORM_VERSION = '1.0.0';
/** The one spec id prefix every answer pipeline core ships shares. @internal */
export const ANSWER_FORM_SPEC_PREFIX = 'core:spec/answer-form-';
/** @internal */
export const ANSWER_FORM_CHAT_SPEC_ID = `${ANSWER_FORM_SPEC_PREFIX}chat`;
/** @internal */
export const ANSWER_FORM_ADVENTURE_SPEC_ID = `${ANSWER_FORM_SPEC_PREFIX}adventure`;
/** @internal */
export const ANSWER_FORM_GUIDE_SPEC_ID = `${ANSWER_FORM_SPEC_PREFIX}guide`;
/** @internal */
export const ANSWER_FORM_LAIR_SPEC_ID = `${ANSWER_FORM_SPEC_PREFIX}lair`;
/** @internal */
export const ANSWER_FORM_WRITING_ROOM_SPEC_ID = `${ANSWER_FORM_SPEC_PREFIX}writing-room`;
/** @internal */
export const ANSWER_FORM_WHODUNIT_SPEC_ID = `${ANSWER_FORM_SPEC_PREFIX}whodunit`;
/** Every answer pipeline core ships, by the genre it serves. @internal */
export const ANSWER_FORM_SPEC_IDS = Object.freeze({
    [chatGenre.id]: ANSWER_FORM_CHAT_SPEC_ID,
    [adventureGenre.id]: ANSWER_FORM_ADVENTURE_SPEC_ID,
    [guideGenre.id]: ANSWER_FORM_GUIDE_SPEC_ID,
    [lairGenre.id]: ANSWER_FORM_LAIR_SPEC_ID,
    [writingRoomGenre.id]: ANSWER_FORM_WRITING_ROOM_SPEC_ID,
    [whodunitGenre.id]: ANSWER_FORM_WHODUNIT_SPEC_ID,
});
/**
 * The assembly template. Triple-stashed like every shipped context template:
 * prose going to a model, not markup going to a browser.
 * @experimental
 */
export const ANSWER_FORM_TEMPLATE = `{{#systemBlock}}
{{#if instructions}}
{{{instructions}}}
{{/if}}

{{#if characters}}
{{{characters}}}
{{/if}}

{{#if personas}}
{{{personas}}}
{{/if}}

{{#if scenario}}
{{{scenario}}}
{{/if}}
{{/systemBlock}}

{{#each sessionMessages as |sessionMessage msgIndex|}}
{{#if (eq role "assistant")}}
{{#assistantBlock}}
{{{name}}}: {{{message}}}
{{/assistantBlock}}
{{/if}}
{{#if (eq role "user")}}
{{#userBlock}}
{{{name}}}: {{{message}}}
{{/userBlock}}
{{/if}}
{{/each}}

{{#userBlock}}
{{{formQuestion}}}
{{#if formOptions}}

{{{formOptions}}}
{{/if}}
{{/userBlock}}`;
/**
 * The pipeline, for one genre. Exported so a plugin genre can publish its own
 * answer pipeline from the same graph rather than restating it.
 * @experimental
 */
export const answerFormSpec = (id, genre) => compile(spec(id, {
    version: ANSWER_FORM_VERSION,
    taxonomy: { role: 'action' },
})
    .inlet('input', C.formAddressed.v1(), {
    genre,
    event: sessionEvents.formAddressed,
})
    .gather('gather', { mode: 'parallel' }, (b) => b
    .chain('history', (c) => c.query('read', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
})))
    .chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))))
    /**
     * The addressee's card, compiled where a speaker's would be: a
     * character by `currentCharacterId`, an envoy by `speaker` (the
     * builder reads the envoy's declaration off the cast bundle).
     * The instructions are the pool row `answer-form-default`.
     */
    .task('context', ($) => C.buildTemplateContext.v1({
    cast: $.gather.cast.read.cast,
    currentCharacterId: $.input.characterId,
    speaker: $.input.addressee,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    .task('form', ($) => C.formContext.v1({
    form: $.input.form,
    templateContext: $.context.templateContext,
}))
    /**
     * Prose, and no seed: the addressee is answering a question, not
     * taking a turn, so the transcript ends with nobody's name on an
     * open line — the question is the last user turn instead.
     */
    .task('lines', ($) => C.proseTranscript.v1({
    messages: $.gather.history.read.messages,
    cast: $.gather.cast.read.cast,
    templateContext: $.form.templateContext,
}))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('generate'),
    connection: slot.connectionOf('generate'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    budget: $.contextBudget.available,
    messages: $.lines.messages,
    templateContext: $.form.templateContext,
    template: slot.template(),
    prompts: slot.prompts({ node: 'context' }),
    variables: slot.variables(),
    params: slot.params(),
    connection: slot.connectionOf('generate'),
}))
    /** The one oracle: JSON against the form's schema (R-15). */
    .oracle('generate', ($) => C.generateJson.v1({
    context: $.prompt.context,
    schema: $.form.schema,
    connection: slot.connection(),
    sampling: slot.sampling(),
    params: slot.params(),
}), { expose: { status: 'Choosing an answer' } })
    .outlet('answer', ($) => C.answerForm.v1({
    form: $.input.form,
    answer: $.generate.json,
    messageId: $.input.messageId,
    blockId: $.input.blockId,
    addressee: $.input.addressee,
}))
    .preset('answer-form', { label: 'Answer a form', default: true }, (p) => p.template('prompt', {
    source: ANSWER_FORM_TEMPLATE,
    engine: handlebars.id,
}))
    .build());
/** @internal */
export const answerFormChatSpec = () => answerFormSpec(ANSWER_FORM_CHAT_SPEC_ID, chatGenre);
/** @internal */
export const answerFormAdventureSpec = () => answerFormSpec(ANSWER_FORM_ADVENTURE_SPEC_ID, adventureGenre);
/** @internal */
export const answerFormGuideSpec = () => answerFormSpec(ANSWER_FORM_GUIDE_SPEC_ID, guideGenre);
/**
 * Lair's, on the same terms as the other three (one graph, published once per
 * shipped genre because a preset binds a spec whose inlet lock names its
 * genre). Its forms are addressed to the **owner**, which is a person, so this
 * pipeline is what waits for the day a Lair session seats an AI in a seat a
 * form is put to — core records `form-addressed` only when the resolver says
 * the AI portrays the addressee, and `owner` never resolves that way.
 * @internal
 */
export const answerFormLairSpec = () => answerFormSpec(ANSWER_FORM_LAIR_SPEC_ID, lairGenre);
/**
 * The Writing Room's, on the same terms (ruled 2026-09-17). Every form the
 * genre ships today is the author's own, but the scribe is an **envoy the AI
 * portrays** — a companion that puts a question to the author's co-writer, or
 * a plugin that puts one to the scribe, resolves to the AI and records
 * `form-addressed`. The binding is what makes that answerable instead of
 * stuck.
 * @internal
 */
export const answerFormWritingRoomSpec = () => answerFormSpec(ANSWER_FORM_WRITING_ROOM_SPEC_ID, writingRoomGenre);
/**
 * Whodunit's, and the genre with the most obvious use for it: a narrator
 * putting a yes/no to a **suspect** is a form addressed to somebody the AI
 * portrays, and every suspect in this genre is. The forms it ships today are
 * the detective's — *Question*, *Accuse* — so nothing reaches this pipeline
 * yet; the binding is the promise that the day one does, it is answered
 * rather than left waiting.
 * @internal
 */
export const answerFormWhodunitSpec = () => answerFormSpec(ANSWER_FORM_WHODUNIT_SPEC_ID, whodunitGenre);
//# sourceMappingURL=answerForm.js.map