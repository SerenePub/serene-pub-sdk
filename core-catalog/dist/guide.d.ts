/** @internal */
export declare const CREATE_GUIDE_SPEC_ID = "core:spec/create-guide";
/** @internal */
export declare const CREATE_GUIDE_VERSION = "1.1.0";
/**
 * The guide's create pipeline — the genre's one required member (24 §3).
 *
 * The same two nodes as `create-chat` — which, with no characters to greet
 * with, write nothing — then Serene's declared greeting (`EnvoyDecl.greeting`),
 * read through `core:query/envoy-greeting@1` and interpolated for this
 * session, written on `main` under her name: only when it has text, which it
 * lacks when she is not seated. No model call: a person is waiting on a
 * create, so the welcome is declared, instant and translatable.
 * The genre's declaration — envoys included — rides `meta.genre` on the
 * version row, which is where the host reads "which speakers does this genre
 * bring" from (`listSessionGenres`).
 * @internal
 */
export declare const createGuideSpec: () => import("@serene-pub/sdk").SpecDocument;
/** @internal */
export declare const GUIDE_RESPOND_SPEC_ID = "core:spec/guide-respond";
/** @internal */
export declare const GUIDE_RESPOND_VERSION = "1.2.0";
/**
 * The guide's context template (2026-09-27).
 *
 * Structure plus the one sentence each branch of the docs band needs, and
 * nothing a story template carries: no scenario, no relationships — a guide
 * session has none. The transcript loop is the shipped Default's, unchanged,
 * so injections, the post-history reminder and the envoy's open seed line
 * render exactly as they do in any other reply.
 *
 * `{{#if docsExcerpts}} … {{else}} … {{/if}}` is the grounding: an excerpt
 * turn says the excerpts are the only documentation the model has and asks
 * for the path it used; an empty turn says nothing matched, in so many words,
 * so a model is never left to decide for itself whether it was given docs.
 * The session's lorebook (`{{{worldLore}}}`, when an entry matched) comes
 * after, framed as the person's own notes: an answer may come from it, and
 * names the entry rather than a docs path it does not have.
 *
 * Each line renders its placed files after its text (`{{{attachments}}}`,
 * 2026-10-03). The `attached` step has placed them since phase 4, but this
 * template never rendered the key, so the guide's model received none of
 * them — not even their names. Empty on a line with no files.
 * @internal
 */
export declare const GUIDE_RESPOND_TEMPLATE = "{{#systemBlock}}\n{{#if instructions}}\n{{{instructions}}}\n{{/if}}\n\n{{#if characters}}\n{{{characters}}}\n{{/if}}\n\n{{#if personas}}\n{{{personas}}}\n{{/if}}\n\n{{#if docsExcerpts}}\nDocumentation excerpts retrieved for the person's latest question. These are the only Serene Pub documentation you have. Each key is the page and section; each value starts with the page's path.\n{{{docsExcerpts}}}\nAnswer only from these excerpts{{#if worldLore}} and the lorebook entries below{{/if}}, and end with the path of the page you used, copied exactly. If they do not answer the question, say \"I couldn't find that in the docs.\"\n{{else if worldLore}}\nNo documentation excerpts matched the person's latest question. Answer only from the lorebook entries below; if they do not answer it either, say \"I couldn't find that in the docs.\" and suggest rephrasing the question or browsing /docs. Do not answer from memory.\n{{else}}\nNo documentation excerpts matched the person's latest question. You have no documentation for it: say \"I couldn't find that in the docs.\" and suggest rephrasing the question or browsing /docs. Do not answer from memory.\n{{/if}}\n{{#if worldLore}}\n\nFrom the lorebook attached to this session: reference notes the person keeps, retrieved for their latest question. Each key is the entry's name. When you answer from one, say which entry you used.\n{{{worldLore}}}\n{{/if}}\n{{/systemBlock}}\n\n{{#each sessionMessages as |sessionMessage msgIndex|}}\n{{#each (lookup ../injectionsByIndex msgIndex)}}\n{{#if (eq this.role \"assistant\")}}\n{{#assistantBlock}}\n{{{this.content}}}\n{{/assistantBlock}}\n{{else if (eq this.role \"user\")}}\n{{#userBlock}}\n{{{this.content}}}\n{{/userBlock}}\n{{else}}\n{{#systemBlock}}\n{{{this.content}}}\n{{/systemBlock}}\n{{/if}}\n{{/each}}\n{{#with ../postHistory}}\n{{#if (and (eq msgIndex targetIndex) hasContent)}}\n{{#systemBlock}}\n{{#if instructions}}\nResponse reminder:\n```text\n{{{instructions}}}\n```\n{{/if}}\n{{#if charInstructions}}\nCharacter reminder:\n```text\n{{{charInstructions}}}\n```\n{{/if}}\n{{/systemBlock}}\n{{/if}}\n{{/with}}\n{{#if (eq role \"assistant\")}}\n{{#assistantBlock}}\n{{{name}}}: {{{message}}}{{{attachments}}}\n{{/assistantBlock}}\n{{/if}}\n{{#if (eq role \"user\")}}\n{{#userBlock}}\n{{{name}}}: {{{message}}}{{{attachments}}}\n{{/userBlock}}\n{{/if}}\n{{/each}}";
/** The guide's reply: the envoy answers, grounded in the docs. @internal */
export declare const guideRespondSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=guide.d.ts.map