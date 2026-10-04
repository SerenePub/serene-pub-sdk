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
 * published once per shipped genre — one each for chat, adventure, guide
 * and lair. Chat and Guide reuse the same authored prompt row; a plugin
 * genre publishes its own through the same builder, naming its own row.
 *
 * ⚠ **Every shipped genre binds one, whatever its own forms look like**
 * (ruled 2026-09-17). A genre cannot promise that no pipeline — its own, one
 * a person attaches, or a plugin's — will ever put a form to a participant
 * the AI portrays, and a form nobody can answer is a stuck session. So the
 * event is declared optional on every genre and bound on every shipped
 * preset; a genre whose forms are all owner-addressed today (the Lair)
 * binds this for the day one is not.
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
import { lairGenre } from './genres.js';
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
/** Every answer pipeline core ships, by the genre it serves. @internal */
export const ANSWER_FORM_SPEC_IDS = Object.freeze({
    [chatGenre.id]: ANSWER_FORM_CHAT_SPEC_ID,
    [adventureGenre.id]: ANSWER_FORM_ADVENTURE_SPEC_ID,
    [guideGenre.id]: ANSWER_FORM_GUIDE_SPEC_ID,
    [lairGenre.id]: ANSWER_FORM_LAIR_SPEC_ID,
});
/**
 * The assembly template. Triple-stashed like every shipped context template:
 * prose going to a model, not markup going to a browser. Each line renders its
 * placed files after its text (`{{{attachments}}}`, 2026-10-03) — empty on a
 * line with none, so a transcript without files renders as it always did.
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
{{{name}}}: {{{message}}}{{{attachments}}}
{{/assistantBlock}}
{{/if}}
{{#if (eq role "user")}}
{{#userBlock}}
{{{name}}}: {{{message}}}{{{attachments}}}
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
export const answerFormSpec = (id, genre, options = {}) => compile(spec(id, {
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
    /**
     * 🚧 **The transcript's files, placed** (attachments follow-ups,
     * owner ruling 2026-10-03) — `respond`'s two steps: the files the
     * rows show, then per line what `generate` receives. An image the
     * call can read rides its own turn; otherwise it is named
     * (`[image: cat.png]`). A transcript with no files passes through
     * untouched, so the prompt is byte for byte what it was.
     */
    .query('attachments', ($) => C.historyAttachments.v1({
    messages: $.gather.history.read.messages,
    params: slot.params(),
}))
    .task('attached', ($) => C.placeAttachments.v1({
    messages: $.lines.messages,
    attachments: $.attachments.attachments,
    connection: slot.connectionOf('generate'),
    params: slot.params(),
}))
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('generate'),
    connection: slot.connectionOf('generate'),
    params: slot.params(),
}))
    .task('prompt', ($) => C.assemble.v2({
    budget: $.contextBudget.available,
    messages: $.attached.messages,
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
    .preset('answer-form', { label: 'Answer a form', default: true }, (p) => {
    const templated = p.template('prompt', {
        source: ANSWER_FORM_TEMPLATE,
        engine: handlebars.id,
    });
    return options.prompt ? templated.prompts('context', options.prompt) : templated;
})
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
//# sourceMappingURL=answerForm.js.map