/**
 * 🚧 Chat's reply — `core:spec/assistant-respond` (2026-10-19,
 * PLAN-genre-restructure §1, R4): the Assistant answers as itself.
 *
 * The spine is the Guide's — placeholder, budget, (history, cast, the
 * lorebook), rank, context, lines — with the Assistant as the speaker and
 * its instructions read through the envoy (`slot.prompts({ envoy:
 * 'assistant' })`), so an administrator tunes them in the Pipelines panel as
 * deviations. Then one junction on the session's **tools** field:
 *
 *  - `basic` (no tools — the Basic preset, and any session that switched them
 *    all off): assemble, generate once, streamed, save. **One call a turn.**
 *  - `agentic` (any tool on — the Agentic preset): the reference tool loop
 *    (`shared/toolLoop.ts`) locked to Chat — the tools the session switched
 *    on (`available-tools@1`'s `kinds`), advertised; up to four passes of
 *    prompt → generate → parse → tool (★D: the cap is 4); the answer the loop
 *    settled on, saved. R53 holds: no tool sees a connection.
 *
 * A fresh spec id: the roleplay Chat's reply (`core:spec/chat-respond`) is
 * Story's (`story-respond`), and config rows follow a spec id (§2-7 a).
 *
 * 🚧 *Read the lorebook* (2026-10-20, PLAN-layering §4, A6) is a reply
 * setting: the lorebook's lane (`gather.worldLore.read`, an optional query)
 * is switched on or off in session settings, and off it asks for nothing —
 * no excerpt reaches the prompt and the call count holds. *Remember things*
 * (★K) left the reply: it is a routine of its own
 * (`core:spec/assistant-memory`, `memory.ts`), registered Off in Chat's
 * defaults. Was Chat's background tasks (`CHAT_TASKS`, retired).
 * @experimental
 */

import { compile, handlebars, slot, spec, sessionEvents, coreEvents, type SessionOf } from '@serene-pub/sdk'
import { CORE_LOADOUT } from '../../loadouts.js'
import * as C from '@serene-pub/contracts'
import { ASSISTANT_ENVOY_KEY, chatGenre, POST_HISTORY_TOKEN_TRIGGER } from '../../registry/genres.js'
import { applyWiring, jsonPart, wiring } from '../../shared/calls.js'

/** @experimental */
export const ASSISTANT_RESPOND_SPEC_ID = 'core:spec/assistant-respond'
/** @internal */
// ⚠ Edited in place (2026-10-21, omni O5/O7/O9) — content-addressed;
// `specHashes.test.ts` records the move. A `heard` step (transcribe-audio)
// before placement; Basic's `generate` names its speech sampling and its
// `save` writes the reply's media parts in order.
export const ASSISTANT_RESPOND_VERSION = '1.0.0'

/** The most tool passes one turn may take (★D, ruled 2026-10-19). @experimental */
export const ASSISTANT_TOOL_PASSES = 4

/**
 * 🚧 Basic's assembly template: the Assistant's instructions, the lorebook
 * excerpts when any were retrieved, then the conversation — the Guide's
 * layout without the docs. Triple-stashed: prose going to a model.
 * @experimental
 */
export const ASSISTANT_RESPOND_TEMPLATE = `{{#systemBlock}}
{{#if instructions}}
{{{instructions}}}
{{/if}}
{{#if worldLore}}

From the lorebook attached to this session: the person's own reference notes, retrieved for their latest message. Each key is the entry's name. When you answer from one, say which entry you used.
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
{{{instructions}}}
{{/if}}
{{/systemBlock}}
{{/if}}
{{/with}}
{{#if (eq role "assistant")}}
{{#assistantBlock}}
{{{message}}}{{{attachments}}}
{{/assistantBlock}}
{{/if}}
{{#if (eq role "user")}}
{{#userBlock}}
{{{message}}}{{{attachments}}}
{{/userBlock}}
{{/if}}
{{/each}}`

/**
 * 🚧 Agentic's assembly template: the loop's own opening text (`system`, the
 * `assistant-agentic` row), the tools advertised, the lorebook excerpts, the
 * tools' results so far, the conversation, and the closing reminder
 * (`postHistory`). Triple-stashed, as every shipped context template.
 * @experimental
 */
export const ASSISTANT_AGENTIC_TEMPLATE = `{{#systemBlock}}
{{{system}}}

{{{advertisement}}}
{{#if worldLore}}

From the lorebook attached to this session: the person's own reference notes, retrieved for their latest message. Each key is the entry's name.
{{{worldLore}}}
{{/if}}
{{#if results}}

What your tools have returned so far:
{{{results}}}
{{/if}}
{{/systemBlock}}

{{#each sessionMessages}}
{{#if (eq role "assistant")}}
{{#assistantBlock}}
{{{message}}}{{{attachments}}}
{{/assistantBlock}}
{{/if}}
{{#if (eq role "user")}}
{{#userBlock}}
{{{message}}}{{{attachments}}}
{{/userBlock}}
{{/if}}
{{/each}}

{{#if postHistory}}
{{#systemBlock}}
{{{postHistory}}}
{{/systemBlock}}
{{/if}}`

/** @experimental */
export const assistantRespondSpec = () => {
	const w = wiring()
	return compile(
		spec(ASSISTANT_RESPOND_SPEC_ID, {
			version: ASSISTANT_RESPOND_VERSION,
			taxonomy: { role: 'primary' },
		})
			/** The usage lock (24 §4): this spec answers Chat's primary turn. */
			.inlet('input', C.userMessage.v1(), { suits: [coreEvents.messageRespond] })
			/** The reply row, made first (PLAN-turn-order §4.4) — the Assistant's, from the inlet's speaker. */
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					characterId: $.input.characterId,
					speaker: $.input.speaker,
					row: $.input.messageId,
				}),
			)
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('mode.basic.generate'),
					connection: slot.connectionOf('mode.basic.generate'),
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
									budget: $.contextBudget.available,
									params: slot.params(),
								}),
							)
							.query('attachments', ($) =>
								C.historyAttachments.v1({
									messages: $.gather.history.read.messages,
									params: slot.params(),
								}),
							),
					)
					.chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
					/**
					 * The lorebook, when the session has one: by keyword, its own
					 * band — no model call. 🚧 *Read the lorebook* (2026-10-20): an
					 * optional query, so a session switches it off in its settings
					 * and it asks for nothing (`settings.enabled`).
					 */
					.chain('worldLore', (c) =>
						c.query(
							'read',
							($) =>
								C.worldLore.v1({
									scope: $.input.sessionScope,
									params: slot.params(),
								}),
							{ expose: { session: true, label: 'Read the lorebook' } },
						),
					),
			)
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [$.gather.history.read.band, $.gather.worldLore.read.main] as any,
				}),
			)
			/** The hard gates; with the lorebook's lane off, the conversation's band alone. */
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
			/** The Assistant's card and instructions — the envoy's, by address (`envoy:assistant`). */
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					currentCharacterId: $.input.characterId,
					speaker: $.input.speaker,
					prompts: slot.prompts({ envoy: ASSISTANT_ENVOY_KEY }),
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
			/**
			 * 🚧 Audio the reply cannot hear, heard first (O9): the
			 * Transcription loadout's model writes down what it says, cached on
			 * the file; placement then names it with its words. Nothing to hear
			 * — no audio, a reply that hears it itself — sends nothing. No
			 * declared status: a declared one shows whenever the step runs,
			 * and the step's own *listening* is said only when it hears.
			 */
			.oracle(
				'heard',
				($) =>
					C.transcribeAudio.v1({
						messages: $.lines.messages,
						attachments: $.gather.history.attachments.attachments,
						hears: $.contextBudget.reads,
						connection: slot.connection(),
						params: slot.params(),
					}),
				{ expose: { label: 'Transcribe audio' } },
			)
			.task('attached', ($) =>
				C.placeAttachments.v1({
					messages: $.lines.messages,
					attachments: $.heard.attachments,
					connection: slot.connectionOf('mode.basic.generate'),
					params: slot.params(),
				}),
			)
			/**
			 * Basic or Agentic — the session's **tools** field, never a node
			 * parameter: no tool on is Basic, one call; any on is the loop.
			 */
			.junction('mode', { on: ($) => $.input.fields }, (j) =>
				j
					.when('agentic', { path: (v: SessionOf<typeof chatGenre>['fields']) => v.tools, truthy: true }, (a) =>
						jsonPart(a, w, 'kinds', ($) => $.input.fields, 'tools', 'The tools this session switched on')
							/** The tools the session switched on, as this install serves them. */
							.query('available', ($) =>
								C.availableTools.v1({
									scope: $.input.sessionScope,
									kinds: $.kinds.main,
									params: slot.params(),
								}),
							)
							.task('advertise', ($) =>
								C.advertiseTools.v1({
									tools: $.available.tools,
									params: slot.params(),
								}),
							)
							.loop(
								'tools',
								{ max: ASSISTANT_TOOL_PASSES },
								(l) =>
									l
										/** The carry — the results so far; empty on the first pass. */
										.task(
											'results',
											($) =>
												C.joinText.v1({
													items: $.mode.agentic.tools.values,
													params: slot.params(),
												}),
											{ expose: { label: 'Carry the tool results' } },
										)
										.task('prompt', ($) =>
											C.assemble.v2({
												candidates: $.rank.candidates,
												decisions: $.rank.decisions,
												groups: $.rank.groups,
												budget: $.contextBudget.available,
												messages: $.attached.messages,
												templateContext: {
													advertisement: $.mode.agentic.advertise.prompt,
													results: $.results.text,
												} as any,
												template: slot.template(),
												prompts: slot.prompts(),
												variables: slot.variables(),
												params: slot.params(),
												connection: slot.connectionOf('mode.agentic.tools.item.generate'),
											}),
										)
										.oracle(
											'generate',
											($) =>
												C.generateText.v1({
													context: $.prompt.context,
													connection: slot.connection(),
													sampling: slot.sampling(),
													params: slot.params(),
													// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
													speechSampling: slot.speechSampling(),
												}),
											{
												expose: {
													status: '{speaker} is thinking',
													label: 'Reply with tools',
													purpose: 'Answers, calling a tool when it needs one, up to four times a turn (Agentic).',
												},
											},
										)
										.task('parse', ($) =>
											C.parseToolCall.v1({
												text: $.generate.text,
												tools: $.mode.agentic.available.tools,
											}),
										)
										/** The one impure step: a failed tool answers the model, never ends the turn. */
										.oracle(
											'tool',
											($) =>
												C.runTool.v1({
													call: $.parse.call,
													tools: $.mode.agentic.available.tools,
													text: $.parse.text,
												}),
											{ expose: { status: 'Using a tool' } },
										)
										/** Another pass while the model called a tool. */
										.repeatWhile(($) => $.parse.call),
							)
							.task(
								'answer',
								($) =>
									C.joinText.v1({
										items: $.tools.values,
										params: slot.params(),
									}),
								{ expose: { label: 'Take the answer' } },
							)
							.outlet(
								'save',
								($) =>
									C.updateMessage.v1({
										target: $.placeholder.messageId,
										text: $.answer.text,
									}),
								{ expose: { label: 'Save the answer' } },
							),
					)
					.otherwise('basic', (b) =>
						b
							.task('prompt', ($) =>
								C.assemble.v2({
									candidates: $.rank.candidates,
									decisions: $.rank.decisions,
									groups: $.rank.groups,
									budget: $.contextBudget.available,
									messages: $.attached.messages,
									templateContext: $.context.templateContext,
									template: slot.template(),
									prompts: slot.prompts($.context),
									variables: slot.variables(),
									params: slot.params(),
									connection: slot.connectionOf('mode.basic.generate'),
								}),
							)
							.oracle(
								'generate',
								($) =>
									C.generateText.v1({
										context: $.prompt.context,
										currentCharacterId: $.input.characterId,
										connection: slot.connection(),
										sampling: slot.sampling(),
										speechSampling: slot.speechSampling(),
										params: slot.params(),
									}),
								{
									expose: {
										stream: true,
										status: '{speaker} is typing',
										label: 'Reply',
										purpose: 'Answers in one call, with no tools (Basic).',
									},
								},
							)
							.outlet(
								'save',
								($) =>
									C.updateMessage.v1({
										target: $.placeholder.messageId,
										text: $.generate.text,
										reasoning: $.generate.reasoning,
										parts: $.generate.parts,
									}),
								{ expose: { label: 'Save the reply' } },
							),
					),
			)
			/**
			 * What Chat ships with: the two layouts inline (a reference you
			 * can read), the reminder's trigger, the answer's path, and the
			 * loadouts — Reply for Basic, Tool calling for the loop (I12).
			 */
			.defaults((p) =>
				applyWiring(
					p
						.template('mode.basic.prompt', { source: ASSISTANT_RESPOND_TEMPLATE, engine: handlebars.id })
						.template('mode.agentic.tools.item.prompt', { source: ASSISTANT_AGENTIC_TEMPLATE, engine: handlebars.id })
						.params('mode.basic.prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						// Agentic answers the same person as Basic: the same post-history trigger (lane 3 finding).
						.params('mode.agentic.tools.item.prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						.params('mode.agentic.answer', { path: 'answer' })
						.loadout('mode.basic.generate', slot.loadout(CORE_LOADOUT.reply))
						.loadout('heard', slot.loadout(CORE_LOADOUT.transcription))
						.loadout('mode.agentic.tools.item.generate', slot.loadout(CORE_LOADOUT.toolCalling)),
					w,
				),
			)
			.build(),
	)
}
