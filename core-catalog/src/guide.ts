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
 *  - **The docs are the lore.** `core:query/docs-search@1` scores the compiled
 *    documentation's sections against the recent messages and publishes the
 *    best in the `worldLore` band, so the ranker budgets them and assembly
 *    lays them out under the section's title, exactly as it would a lorebook's
 *    entries. Three lore lanes, four graph reads and two embedding arms are
 *    not here because a guide session has no lorebook and no cast to bind one
 *    to; a person who attaches one gets it on `respond`, not here.
 */
import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { GUIDE_MASCOT_KEY, guideGenre } from './genres.js'

export const CREATE_GUIDE_SPEC_ID = 'core:spec/create-guide'
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
 */
export const createGuideSpec = () =>
	compile(
		spec(CREATE_GUIDE_SPEC_ID, {
			version: CREATE_GUIDE_VERSION,
			taxonomy: { role: 'create', genre: guideGenre.id },
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

export const GUIDE_RESPOND_SPEC_ID = 'core:spec/guide-respond'
export const GUIDE_RESPOND_VERSION = '1.0.0'

/** The guide's reply: the envoy answers, grounded in the docs. */
export const guideRespondSpec = () =>
	compile(
		spec(GUIDE_RESPOND_SPEC_ID, {
			version: GUIDE_RESPOND_VERSION,
			taxonomy: { role: 'primary', genre: guideGenre.id },
		})
			.inlet('input', C.userMessage.v1(), {
				genre: guideGenre,
				event: sessionEvents.messageRespond,
			})
			/**
			 * The reply row (R-17), created by the pipeline that fills it.
			 * `speaker` is the envoy's reference — the row's only identity,
			 * since `characterId` is null for a speaker with no row.
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
					 * The one mechanism. Takes the scope and reads the newest
					 * rows itself rather than `history`'s output, because
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
			/**
			 * Who speaks: the trigger's pick — `envoy:mascot` — always wins,
			 * and `turn-manual` records it. Seated as the genre's default,
			 * the envoy is the only in-turn candidate a strategy could find
			 * here anyway.
			 */
			.task('speaker', ($) =>
				C.turnManual.v1({
					cast: $.gather.cast.read.cast,
					messages: $.gather.history.read.messages,
					speaker: $.input.speaker,
					characterId: $.input.characterId,
				}),
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
					currentCharacterId: $.speaker.characterId,
					speaker: $.speaker.speaker,
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
					currentCharacterId: $.speaker.characterId,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
			)
			.outlet('save', ($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.generate.text,
					thinking: $.generate.thinking,
				}),
			)
			.build(),
	)
