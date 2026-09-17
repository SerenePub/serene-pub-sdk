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
 * published once per shipped genre — `answer-form-chat`,
 * `answer-form-adventure`, `answer-form-guide`. Chat and Guide reuse the
 * same authored prompt row; a plugin genre publishes its own through the
 * same builder, or binds nothing and leaves an AI-addressed form waiting.
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
export declare const ANSWER_FORM_VERSION = "1.0.0";
/** The one spec id prefix every answer pipeline core ships shares. */
export declare const ANSWER_FORM_SPEC_PREFIX = "core:spec/answer-form-";
export declare const ANSWER_FORM_CHAT_SPEC_ID = "core:spec/answer-form-chat";
export declare const ANSWER_FORM_ADVENTURE_SPEC_ID = "core:spec/answer-form-adventure";
export declare const ANSWER_FORM_GUIDE_SPEC_ID = "core:spec/answer-form-guide";
/** Every answer pipeline core ships, by the genre it serves. */
export declare const ANSWER_FORM_SPEC_IDS: Readonly<Record<string, string>>;
/**
 * The assembly template. Triple-stashed like every shipped context template:
 * prose going to a model, not markup going to a browser.
 */
export declare const ANSWER_FORM_TEMPLATE = "{{#systemBlock}}\n{{#if instructions}}\n{{{instructions}}}\n{{/if}}\n\n{{#if characters}}\n{{{characters}}}\n{{/if}}\n\n{{#if personas}}\n{{{personas}}}\n{{/if}}\n\n{{#if scenario}}\n{{{scenario}}}\n{{/if}}\n{{/systemBlock}}\n\n{{#each sessionMessages as |sessionMessage msgIndex|}}\n{{#if (eq role \"assistant\")}}\n{{#assistantBlock}}\n{{{name}}}: {{{message}}}\n{{/assistantBlock}}\n{{/if}}\n{{#if (eq role \"user\")}}\n{{#userBlock}}\n{{{name}}}: {{{message}}}\n{{/userBlock}}\n{{/if}}\n{{/each}}\n\n{{#userBlock}}\n{{{formQuestion}}}\n{{#if formOptions}}\n\n{{{formOptions}}}\n{{/if}}\n{{/userBlock}}";
/**
 * The pipeline, for one genre. Exported so a plugin genre can publish its own
 * answer pipeline from the same graph rather than restating it.
 */
export declare const answerFormSpec: (id: string, genre: GenreDecl) => import("@serene-pub/sdk").SpecDocument;
export declare const answerFormChatSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const answerFormAdventureSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const answerFormGuideSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=answerForm.d.ts.map