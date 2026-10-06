/**
 * The **guide** genre's two pipelines (plans/29 R-18; 09-B B10; built
 * 2026-09-16 as U5g): the create pipeline that is the genre's required
 * member (`create.ts`), and the reply that answers as the genre's envoy (this
 * file).
 *
 * ## What `guide-respond` is
 *
 * `core:spec/chat-respond` with the lore machinery replaced by one mechanism. A
 * reply here is inlet → placeholder → (history, cast, docs) → speaker →
 * budget → rank → context → lines → assemble → generate → save: the same
 * spine, the same nodes, the same story string — so the parity of a reply
 * row, a stream, a Stop and a receipt is by construction, not by a second
 * road. What differs is *who speaks* and *what is retrieved*:
 *
 *  - **The speaker is the envoy.** The inlet's `speaker` port carries
 *    `envoy:mascot` (R-18 (3)); `turn-manual` passes it through; the context
 *    builder takes it on its own `speaker` port and compiles the envoy's card
 *    — name and description off the genre's declaration the cast read carries
 *    — where a character's card would be; the placeholder stores it on the row
 *    as `metadata.speaker` with no `character_id`, since there is no row for
 *    one to name.
 *  - **The instructions are the envoy's, as configuration.** The context
 *    builder's `prompts` slot reads `slot.prompts({ envoy: 'mascot' })`
 *    (R-18 (2)): the genre's declared `prompts` are the author default at
 *    the address `envoy:mascot`, an administrator tunes them in the Pipelines
 *    panel as deviations, and `assemble` reads the same text by reference —
 *    one authored text, one place to edit it, no second schema.
 *  - **The docs are its knowledge.** `core:query/docs-search@1` ranks
 *    the compiled documentation's sections — the app's guides and the SDK's —
 *    against the person's latest questions and publishes the relevant ones in
 *    its own declared band, `docsExcerpts`, which the ranker budgets and the
 *    guide's own template (`GUIDE_RESPOND_TEMPLATE`, the spec's default
 *    preset) places under a heading that says what they are — or, when
 *    nothing matched, says that instead.
 *  - **And the lorebook, when the session has one.** The genre declares an
 *    optional lorebook as "the documentation it answers out of … read every
 *    turn and never added to" (`guideGenre`), so the reply reads it every
 *    turn: `core:query/world-lore@1`, by keyword, in its own `worldLore`
 *    band, which the template frames as the person's own reference notes.
 *    World lore only — a guide session seats no character, so there is no
 *    private lore to read and no timeline to place — and no graph reads or
 *    embedding arms: a keyword read costs no model call, and nothing here is
 *    capped at one call per turn the way Chat's reply is.
 */
import { compile, handlebars, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { GUIDE_MASCOT_KEY, guideGenre, POST_HISTORY_TOKEN_TRIGGER } from '../../registry/genres.js'

/** @internal */
export const GUIDE_RESPOND_SPEC_ID = 'core:spec/guide-respond'
// 1.1.0: the `speaker` node moved to `core:spec/turn-order` — see
// `CHAT_RESPOND_VERSION`, same change, same reason.
// 1.2.0 (2026-09-27): the guide's own template, as the spec's default preset
// — the docs arrive in their declared `docsExcerpts` band, framed as the only
// source of truth, with an explicit line for a turn nothing matched. The
// shared Default template rendered them as anonymous `worldLore` JSON.
// 1.2.0, edited in place (lorebooks C2, 2026-10-02): an `eligible` step
// (`core:task/eligibility@1`) between `lore` and `rank`. Content-addressed;
// `specHashes.test.ts` records the move.
// ⚠ Edited in place (2026-10-03, history window) — content-addressed;
// `specHashes.test.ts` records the move. `contextBudget` runs before the
// reads and the history read takes its `budget`: about twice the window's
// worth of the newest rows (never more than 2000) instead of the newest 100,
// so the transcript fit decides where the conversation starts.
// ⚠ Edited in place (2026-10-05, sprites in-pipeline) — content-addressed;
// `specHashes.test.ts` records the move. The sprite step is written out after
// `save` (`spritePick`, `spriteShow`) where the retired `withSpriteTail`
// wrapper appended nodes this source never named.
/** @internal */
export const GUIDE_RESPOND_VERSION = '1.2.0'

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
export const GUIDE_RESPOND_TEMPLATE = `{{#systemBlock}}
{{#if instructions}}
{{{instructions}}}
{{/if}}

{{#if characters}}
{{{characters}}}
{{/if}}

{{#if personas}}
{{{personas}}}
{{/if}}

{{#if docsExcerpts}}
Documentation excerpts retrieved for the person's latest question. These are the only Serene Pub documentation you have. Each key is the page and section; each value starts with the page's path.
{{{docsExcerpts}}}
Answer only from these excerpts{{#if worldLore}} and the lorebook entries below{{/if}}, and end with the path of the page you used, copied exactly. If they do not answer the question, say "I couldn't find that in the docs."
{{else if worldLore}}
No documentation excerpts matched the person's latest question. Answer only from the lorebook entries below; if they do not answer it either, say "I couldn't find that in the docs." and suggest rephrasing the question or browsing /docs. Do not answer from memory.
{{else}}
No documentation excerpts matched the person's latest question. You have no documentation for it: say "I couldn't find that in the docs." and suggest rephrasing the question or browsing /docs. Do not answer from memory.
{{/if}}
{{#if worldLore}}

From the lorebook attached to this session: reference notes the person keeps, retrieved for their latest question. Each key is the entry's name. When you answer from one, say which entry you used.
{{{worldLore}}}
{{/if}}
{{/systemBlock}}

{{#each sessionMessages as |sessionMessage msgIndex|}}
{{#each (lookup ../injectionsByIndex msgIndex)}}
{{#if (eq this.role "assistant")}}
{{#assistantBlock}}
{{{this.content}}}
{{/assistantBlock}}
{{else if (eq this.role "user")}}
{{#userBlock}}
{{{this.content}}}
{{/userBlock}}
{{else}}
{{#systemBlock}}
{{{this.content}}}
{{/systemBlock}}
{{/if}}
{{/each}}
{{#with ../postHistory}}
{{#if (and (eq msgIndex targetIndex) hasContent)}}
{{#systemBlock}}
{{#if instructions}}
Response reminder:
\`\`\`text
{{{instructions}}}
\`\`\`
{{/if}}
{{#if charInstructions}}
Character reminder:
\`\`\`text
{{{charInstructions}}}
\`\`\`
{{/if}}
{{/systemBlock}}
{{/if}}
{{/with}}
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
{{/each}}`

/** The guide's reply: the envoy answers, grounded in the docs. @internal */
export const guideRespondSpec = () =>
	compile(
		spec(GUIDE_RESPOND_SPEC_ID, {
			version: GUIDE_RESPOND_VERSION,
			taxonomy: { role: 'primary'},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: guideGenre,
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
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					characterId: $.input.characterId,
					speaker: $.input.speaker,
					row: $.input.messageId,
				}),
			)
			// Before the reads (history window, 2026-10-03): the history read
			// is sized by this budget, so it is computed first. It reads only
			// config, never a step, so moving it changes no value.
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('generate'),
					connection: slot.connectionOf('generate'),
					params: slot.params(),
				}),
			)
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c
							.query('read', ($) =>
								C.sessionHistory.v1({
									scope: $.input.sessionScope,
									// Sized by the window (history window, 2026-10-03).
									budget: $.contextBudget.available,
									params: slot.params(),
								}),
							)
							// 🚧 The files those rows show (PLAN-composer-attachments §3.5).
							.query('attachments', ($) =>
								C.historyAttachments.v1({
									messages: $.gather.history.read.messages,
									params: slot.params(),
								}),
							),
					)
					.chain('cast', (c) =>
						c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
					)
					/**
					 * The one mechanism: the `docsExcerpts` band. Takes the
					 * scope and reads the newest rows itself rather than
					 * `history`'s output, because
					 * chains of a parallel gather cannot see each other and a
					 * read of a few rows is cheaper than the block a second
					 * pass would cost.
					 */
					.chain('docs', (c) =>
						c.query('read', ($) =>
							C.docsSearch.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/**
					 * The session's lorebook, which the genre declares as the
					 * documentation it answers out of, read every turn: world
					 * lore by keyword. A session with no book reads none.
					 */
					.chain('worldLore', (c) =>
						c.query('read', ($) =>
							C.worldLore.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					),
			)
			/**
			 * The pool: the conversation's band intent first, then the docs,
			 * then the lorebook. `concat` keeps the intents at the head, which
			 * is what lets the ranker reserve the transcript's slice before the
			 * docs and the book divide the rest.
			 */
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [
						$.gather.history.read.band,
						$.gather.docs.read.main,
						$.gather.worldLore.read.main,
					] as any,
				}),
			)
			/**
			 * The hard gates before the ranker (C2, R2) — every spec that ranks
			 * passes its pool through one. Here only the book's own selective
			 * logic can rule an entry out; the guide reads no cast, so no
			 * presence or secrecy rule has anything to judge.
			 */
			.task('eligible', ($) =>
				C.eligibility.v1({
					candidates: $.lore.candidates,
					exclusions: $.gather.worldLore.read.exclusions,
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.eligible.candidates,
					budget: $.contextBudget.available,
					params: slot.params(),
				}),
			)
			/**
			 * The envoy's card and instructions. `speaker` is what tells the
			 * builder it is compiling an envoy rather than a cast row;
			 * `prompts` is the envoy's own configuration (R-18 (2)).
			 */
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					currentCharacterId: $.input.characterId,
					speaker: $.input.speaker,
					prompts: slot.prompts({ envoy: GUIDE_MASCOT_KEY }),
					variables: slot.variables(),
				}),
			)
			.task('lines', ($) =>
				C.processMessages.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
					seedName: $.context.seedName,
					continuationPrefill: $.input.continuationPrefill,
				}),
			)
			// 🚧 Each line's attachments, placed on `generate`'s pair (§3.5).
			.task('attached', ($) =>
				C.placeAttachments.v1({
					messages: $.lines.messages,
					attachments: $.gather.history.attachments.attachments,
					connection: slot.connectionOf('generate'),
					params: slot.params(),
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.attached.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					// The same construction `respond` uses — and NOT how the
					// mascot's text reaches `{{systemPrompt}}`. A node
					// reference resolves ONE hop: this slot reads the config
					// stored at `context`'s own `prompts` address, and the
					// builder's slot is addressed at `envoy:mascot`, not at
					// `context`, so this read finds nothing there. The
					// mascot's text arrives through `templateContext`: the
					// builder resolved it, and `assemble` spreads the context
					// over the raw slot (U5g review, S1).
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('generate'),
				}),
			)
			.oracle('generate', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					currentCharacterId: $.input.characterId,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { stream: true, status: '{speaker} is typing' } },
			)
			.outlet('save', ($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.generate.text,
					reasoning: $.generate.reasoning,
				}),
			)
			/**
			 * The line's face (DESIGN-sprites §5) — see `respond`. The Guide
			 * seats no characters and its mascot is an envoy with no card, so
			 * today this picks nothing: the step is written in like every reply
			 * spec's, and costs nothing until a speaker has sprites.
			 */
			.oracle(
				'spritePick',
				($) =>
					C.pickSprite.v1({
						text: $.generate.text,
						speaker: $.input.speaker,
						scope: $.input.sessionScope,
						params: slot.params(),
					}),
				{ expose: { session: true } },
			)
			.outlet('spriteShow', ($) =>
				C.showSprite.v1({
					target: $.save.messageId,
					pick: $.spritePick.main,
					source: 'picker',
				}),
			)
			/** The guide's own template (1.2.0) — see `GUIDE_RESPOND_TEMPLATE`. */
			.preset('guide', { label: 'Guide', default: true }, (p) =>
				p
					.template('prompt', {
						source: GUIDE_RESPOND_TEMPLATE,
						engine: handlebars.id,
					})
					.params('prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER }),
			)
			.build(),
	)
