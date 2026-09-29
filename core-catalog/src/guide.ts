/**
 * The **guide** genre's two pipelines (plans/29 R-18; 09-B B10; built
 * 2026-09-16 as U5g): the create pipeline that is the genre's required
 * member, and the reply that answers as the genre's envoy.
 *
 * ## What `guide-respond` is
 *
 * `core:spec/respond` with the lore machinery replaced by one mechanism. A
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
 *  - **The docs are its only knowledge.** `core:query/docs-search@1` ranks
 *    the compiled documentation's sections — the app's guides and the SDK's —
 *    against the person's latest questions and publishes the relevant ones in
 *    its own declared band, `docsExcerpts`, which the ranker budgets and the
 *    guide's own template (`GUIDE_RESPOND_TEMPLATE`, the spec's default
 *    preset) places under a heading that says what they are — or, when
 *    nothing matched, says that instead. Three lore lanes, four graph reads
 *    and two embedding arms are not here because a guide session has no
 *    lorebook and no cast to bind one to; a person who attaches one gets it
 *    on `respond`, not here.
 */
import { compile, handlebars, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { withSpriteTail } from './sprites.js'
import { GUIDE_MASCOT_KEY, guideGenre } from './genres.js'

/** @internal */
export const CREATE_GUIDE_SPEC_ID = 'core:spec/create-guide'
/** @internal */
export const CREATE_GUIDE_VERSION = '1.0.0'

/**
 * The guide's create pipeline — the genre's one required member (24 §3).
 *
 * The same two nodes as `create-chat`, and with no characters to greet with
 * they write nothing: creation is still a run, with a receipt saying so, and
 * a genre that later seats a greeting-bearing envoy has the node to do it in.
 * The genre's declaration — envoys included — rides `meta.genre` on the
 * version row, which is where the host reads "which speakers does this genre
 * bring" from (`listSessionGenres`).
 * @internal
 */
export const createGuideSpec = () =>
	compile(
		spec(CREATE_GUIDE_SPEC_ID, {
			version: CREATE_GUIDE_VERSION,
			taxonomy: { role: 'create'},
			genre: {
				name: guideGenre.name,
				family: guideGenre.family,
				description: guideGenre.description,
				shape: guideGenre.shape,
				events: guideGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>,
				envoys: guideGenre.envoys,
			},
		})
			.inlet('input', C.sessionCreated.v1(), {
				genre: guideGenre,
				event: sessionEvents.sessionCreated,
			})
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: guideGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			.build(),
	)

/** @internal */
export const GUIDE_RESPOND_SPEC_ID = 'core:spec/guide-respond'
// 1.1.0: the `speaker` node moved to `core:spec/turn-order` — see
// `RESPOND_VERSION`, same change, same reason.
// 1.2.0 (2026-09-27): the guide's own template, as the spec's default preset
// — the docs arrive in their declared `docsExcerpts` band, framed as the only
// source of truth, with an explicit line for a turn nothing matched. The
// shared Default template rendered them as anonymous `worldLore` JSON.
/** @internal */
export const GUIDE_RESPOND_VERSION = '1.2.0'

/**
 * The guide's context template (2026-09-27).
 *
 * Structure plus the one sentence each branch of the docs band needs, and
 * nothing a story template carries: no scenario, no lore, no relationships —
 * a guide session has none. The transcript loop is the shipped Default's,
 * unchanged, so injections, the post-history reminder and the envoy's open
 * seed line render exactly as they do in any other reply.
 *
 * `{{#if docsExcerpts}} … {{else}} … {{/if}}` is the grounding: an excerpt
 * turn says the excerpts are the only documentation the model has and asks
 * for the path it used; an empty turn says nothing matched, in so many words,
 * so a model is never left to decide for itself whether it was given docs.
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
Answer only from these excerpts, and end with the path of the page you used, copied exactly. If they do not answer the question, say "I couldn't find that in the docs."
{{else}}
No documentation excerpts matched the person's latest question. You have no documentation for it: say "I couldn't find that in the docs." and suggest rephrasing the question or browsing /docs. Do not answer from memory.
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
{{{name}}}: {{{message}}}
{{/assistantBlock}}
{{/if}}
{{#if (eq role "user")}}
{{#userBlock}}
{{{name}}}: {{{message}}}
{{/userBlock}}
{{/if}}
{{/each}}`

/** The guide's reply: the envoy answers, grounded in the docs. @internal */
export const guideRespondSpec = () =>
	compile(
		// The sprite tail (DESIGN-sprites §5): after `save`, choose the line's face.
		withSpriteTail(
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
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
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
					),
			)
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('generate'),
					connection: slot.connectionOf('generate'),
					params: slot.params(),
				}),
			)
			/**
			 * The pool: the conversation's band intent first, then the docs.
			 * `concat` keeps the intents at the head, which is what lets the
			 * ranker reserve the transcript's slice before the docs divide the
			 * rest.
			 */
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [$.gather.history.read.band, $.gather.docs.read.main] as any,
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.lore.candidates,
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
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
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
					thinking: $.generate.thinking,
				}),
			)
		)
			/** The guide's own template (1.2.0) — see `GUIDE_RESPOND_TEMPLATE`. */
			.preset('guide', { label: 'Guide', default: true }, (p) =>
				p.template('prompt', {
					source: GUIDE_RESPOND_TEMPLATE,
					engine: handlebars.id,
				}),
			)
			.build(),
	)
