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
import { type GenreDecl } from '@serene-pub/sdk';
/** @internal */
export declare const ANSWER_FORM_VERSION = "1.0.0";
/** The one spec id prefix every answer pipeline core ships shares. @internal */
export declare const ANSWER_FORM_SPEC_PREFIX = "core:spec/answer-form-";
/** @internal */
export declare const ANSWER_FORM_CHAT_SPEC_ID = "core:spec/answer-form-chat";
/** @internal */
export declare const ANSWER_FORM_ADVENTURE_SPEC_ID = "core:spec/answer-form-adventure";
/** @internal */
export declare const ANSWER_FORM_GUIDE_SPEC_ID = "core:spec/answer-form-guide";
/** @internal */
export declare const ANSWER_FORM_LAIR_SPEC_ID = "core:spec/answer-form-lair";
/** Every answer pipeline core ships, by the genre it serves. @internal */
export declare const ANSWER_FORM_SPEC_IDS: Readonly<Record<string, string>>;
/**
 * The assembly template. Triple-stashed like every shipped context template:
 * prose going to a model, not markup going to a browser. Each line renders its
 * placed files after its text (`{{{attachments}}}`, 2026-10-03) — empty on a
 * line with none, so a transcript without files renders as it always did.
 * @experimental
 */
export declare const ANSWER_FORM_TEMPLATE = "{{#systemBlock}}\n{{#if instructions}}\n{{{instructions}}}\n{{/if}}\n\n{{#if characters}}\n{{{characters}}}\n{{/if}}\n\n{{#if personas}}\n{{{personas}}}\n{{/if}}\n\n{{#if scenario}}\n{{{scenario}}}\n{{/if}}\n{{/systemBlock}}\n\n{{#each sessionMessages as |sessionMessage msgIndex|}}\n{{#if (eq role \"assistant\")}}\n{{#assistantBlock}}\n{{{name}}}: {{{message}}}{{{attachments}}}\n{{/assistantBlock}}\n{{/if}}\n{{#if (eq role \"user\")}}\n{{#userBlock}}\n{{{name}}}: {{{message}}}{{{attachments}}}\n{{/userBlock}}\n{{/if}}\n{{/each}}\n\n{{#userBlock}}\n{{{formQuestion}}}\n{{#if formOptions}}\n\n{{{formOptions}}}\n{{/if}}\n{{/userBlock}}";
/**
 * What a genre may say about its answer pipeline beyond its id and genre.
 * @experimental
 */
export interface AnswerFormOptions {
    /**
     * The prompt row the addressee's context step starts on, by template id
     * (`{ templateId: '<slug>:template/<name>@1' }`, a row the package ships in
     * `templates`). Absent, the step starts on the pool's shipped default —
     * core's `answer-form-default` row for core's genres.
     */
    prompt?: {
        templateId: string;
    };
}
/**
 * The pipeline, for one genre. Exported so a plugin genre can publish its own
 * answer pipeline from the same graph rather than restating it.
 * @experimental
 */
export declare const answerFormSpec: (id: string, genre: GenreDecl, options?: AnswerFormOptions) => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const answerFormChatSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const answerFormAdventureSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const answerFormGuideSpec: () => import("@serene-pub/sdk").SpecDocument;
/**
 * Lair's, on the same terms as the other three (one graph, published once per
 * shipped genre because a preset binds a spec whose inlet lock names its
 * genre). Its forms are addressed to the **owner**, which is a person, so this
 * pipeline is what waits for the day a Lair session seats an AI in a seat a
 * form is put to — core records `form-addressed` only when the resolver says
 * the AI portrays the addressee, and `owner` never resolves that way.
 * @internal
 */
export declare const answerFormLairSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=answerForm.d.ts.map