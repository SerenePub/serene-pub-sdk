/** @experimental */
export declare const TOOL_LOOP_SPEC_ID = "core:spec/tool-loop";
/** @internal */
export declare const TOOL_LOOP_VERSION = "1.0.0";
/**
 * The assembly template, inline.
 *
 * Every other shipped spec points its `template` slot at a seeded
 * `pipeline_context_templates` row, which is right for a pipeline a person
 * customises and wrong for a reference: an example whose prompt lives in a
 * database row is an example you cannot read. Written here, the whole
 * pipeline — what it asks, what it offers and how it repeats — is one file.
 *
 * ⚠ The instructions it opens and closes with are NOT here. `system` and
 * `postHistory` are the `prompts` slot `tools.item.prompt` owns, seeded from
 * `CORE_PROMPTS` like every other shipped step's prompt — so a person edits
 * the wording in the panel and this file holds the layout alone. Written into
 * the template as literal prose they would be a second copy of text the pool
 * already ships, and the panel's box would edit the copy nobody reads.
 *
 * Triple-stashed throughout, like every shipped context template: a prompt is
 * prose going to a model, not markup going to a browser, and Handlebars' HTML
 * escaping turns the fenced tool convention into `&#x60;&#x60;&#x60;` — an
 * advertisement the model cannot follow and the parser cannot read back.
 * @experimental
 */
export declare const TOOL_LOOP_TEMPLATE = "{{{system}}}\n\n{{{advertisement}}}\n\n{{#if results}}\n# What your tools have returned so far\n{{{results}}}\n{{/if}}\n\n{{#if chatMessages}}\n# The conversation\n{{{chatMessages}}}\n{{/if}}\n\n{{#if postHistory}}\n{{{postHistory}}}\n{{/if}}";
/** @experimental */
export declare const toolLoopSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=toolLoop.d.ts.map