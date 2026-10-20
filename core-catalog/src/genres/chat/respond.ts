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
 * 🚧 Chat's background tasks (`CHAT_TASKS`, lane 2, 2026-10-19), resolved
 * at the head (`tasks`, `core:task/resolve-tasks@1`): *Read the lorebook*
 * gates the lorebook's excerpts (the `retrieval` junction before `rank`),
 * and *Remember things* (★K) runs one JSON call every few turns, after the
 * answer is saved, filing what the person told the Assistant as notes —
 * into the lorebook the person attached when they may write it (their
 * living memory bank), else the session's own notes, made on first use
 * (the host's lore-write routing, `lorebooks/phantom.ts`). Full files them;
 * Review holds each at the review gate.
 * @experimental
 */

import { compile, handlebars, slot, spec, sessionEvents } from '@serene-pub/sdk'
import { CORE_LOADOUT } from '../../loadouts.js'
import * as C from '@serene-pub/contracts'
import { ASSISTANT_ENVOY_KEY, chatGenre, POST_HISTORY_TOKEN_TRIGGER } from '../../registry/genres.js'
import { applyWiring, at, jsonPart, modelCall, textPart, wiring, type Wiring } from '../../shared/calls.js'
import { ASSISTANT_PROMPT_KEYS } from '../../seed/prompts.js'

/** @experimental */
export const ASSISTANT_RESPOND_SPEC_ID = 'core:spec/assistant-respond'
/** @internal */
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
	const A = 'mode.agentic.'
	const L = `${A}tools.item.`
	const graph = spec(ASSISTANT_RESPOND_SPEC_ID, {
		version: ASSISTANT_RESPOND_VERSION,
		taxonomy: { role: 'primary' },
	})
		/** The usage lock (24 §4): this spec answers Chat's primary turn. */
		.inlet('input', C.userMessage.v1(), {
			genre: chatGenre,
			event: sessionEvents.messageRespond,
		})
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
		/** 🚧 Chat's background tasks, resolved once at the head — no model call. */
		.task(
			'tasks',
			($) =>
				C.resolveTasks.v1({
					session: $.input.session,
					fields: $.input.fields,
					genre: chatGenre.id,
				}),
			{ expose: { label: 'What happens around a reply' } },
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
				/** The lorebook, when the session has one: by keyword, its own band — no model call. */
				.chain('worldLore', (c) =>
					c.query('read', ($) =>
						C.worldLore.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				),
		)
		.task('lore', ($) =>
			C.concatCandidates.v1({
				sources: [$.gather.history.read.band, $.gather.worldLore.read.main] as any,
			}),
		)
		/**
		 * 🚧 *Read the lorebook* (`lore-retrieval`, lane 2): Off, and the
		 * ranker is handed the conversation's band alone — no excerpt
		 * reaches the prompt. One step either way: the call count holds.
		 */
		.junction('retrieval', { on: ($: any) => $.tasks.modes }, (j) =>
			j
				.when('off', { path: 'lore-retrieval', equals: 'off' }, (b: any) =>
					b.task('eligible', ($: any) => C.eligibility.v1({ candidates: $.gather.history.read.band })),
				)
				.otherwise('on', (b: any) =>
					b.task('eligible', ($: any) =>
						C.eligibility.v1({
							candidates: $.lore.candidates,
							exclusions: $.gather.worldLore.read.exclusions,
						}),
					),
				),
		)
		.task('rank', ($: any) =>
			C.rankHybrid.v1({
				candidates: $.retrieval.candidates,
				budget: $.contextBudget.available,
				params: slot.params(),
			}),
		)
		/** The Assistant's card and instructions — the envoy's, by address (`envoy:assistant`). */
		.task('context', ($: any) =>
			C.buildTemplateContext.v1({
				cast: $.gather.cast.read.cast,
				currentCharacterId: $.input.characterId,
				speaker: $.input.speaker,
				prompts: slot.prompts({ envoy: ASSISTANT_ENVOY_KEY }),
				variables: slot.variables(),
			}),
		)
		.task('lines', ($: any) =>
			C.processMessages.v1({
				messages: $.gather.history.read.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.context.templateContext,
				seedName: $.context.seedName,
				continuationPrefill: $.input.continuationPrefill,
			}),
		)
		.task('attached', ($: any) =>
			C.placeAttachments.v1({
				messages: $.lines.messages,
				attachments: $.gather.history.attachments.attachments,
				connection: slot.connectionOf('mode.basic.generate'),
				params: slot.params(),
			}),
		)
		/**
		 * Basic or Agentic — the session's **tools** field, never a node
		 * parameter: no tool on is Basic, one call; any on is the loop.
		 */
		.junction('mode', { on: ($: any) => $.input.fields }, (j) =>
			j
				.when('agentic', { path: 'tools', truthy: true }, (a: any) =>
					jsonPart(a, w, A, 'kinds', ($: any) => $.input.fields, 'tools', 'The tools this session switched on')
						/** The tools the session switched on, as this install serves them. */
						.query('available', ($: any) =>
							C.availableTools.v1({
								scope: $.input.sessionScope,
								kinds: at($, `${A}kinds`).main,
								params: slot.params(),
							}),
						)
						.task('advertise', ($: any) =>
							C.advertiseTools.v1({
								tools: at($, `${A}available`).tools,
								params: slot.params(),
							}),
						)
						.loop(
							'tools',
							{ repeatWhile: ($: any) => at($, `${L}parse`).call, max: ASSISTANT_TOOL_PASSES },
							(l: any) =>
								l
									/** The carry — the results so far; empty on the first pass. */
									.task(
										'results',
										($: any) =>
											C.joinText.v1({
												items: at($, `${A}tools`).values,
												params: slot.params(),
											}),
										{ expose: { label: 'Carry the tool results' } },
									)
									.task('prompt', ($: any) =>
										C.assemble.v2({
											candidates: $.rank.candidates,
											decisions: $.rank.decisions,
											groups: $.rank.groups,
											budget: $.contextBudget.available,
											messages: $.attached.messages,
											templateContext: {
												advertisement: at($, `${A}advertise`).prompt,
												results: at($, `${L}results`).text,
											} as any,
											template: slot.template(),
											prompts: slot.prompts(),
											variables: slot.variables(),
											params: slot.params(),
											connection: slot.connectionOf(`${L}generate`),
										}),
									)
									.oracle(
										'generate',
										($: any) =>
											C.generateText.v1({
												context: at($, `${L}prompt`).context,
												connection: slot.connection(),
												sampling: slot.sampling(),
												params: slot.params(),
											}),
										{
											expose: {
												status: '{speaker} is thinking',
												label: 'Reply with tools',
												purpose: 'Answers, calling a tool when it needs one, up to four times a turn (Agentic).',
											},
										},
									)
									.task('parse', ($: any) =>
										C.parseToolCall.v1({
											text: at($, `${L}generate`).text,
											tools: at($, `${A}available`).tools,
										}),
									)
									/** The one impure step: a failed tool answers the model, never ends the turn. */
									.oracle(
										'tool',
										($: any) =>
											C.runTool.v1({
												call: at($, `${L}parse`).call,
												tools: at($, `${A}available`).tools,
												text: at($, `${L}parse`).text,
											}),
										{ expose: { status: 'Using a tool' } },
									),
						)
						.task(
							'answer',
							($: any) =>
								C.joinText.v1({
									items: at($, `${A}tools`).values,
									params: slot.params(),
								}),
							{ expose: { label: 'Take the answer' } },
						)
						.outlet(
							'save',
							($: any) =>
								C.updateMessage.v1({
									target: $.placeholder.messageId,
									text: at($, `${A}answer`).text,
								}),
							{ expose: { label: 'Save the answer' } },
						),
				)
				.otherwise('basic', (b: any) =>
					b
						.task('prompt', ($: any) =>
							C.assemble.v2({
								candidates: $.rank.candidates,
								decisions: $.rank.decisions,
								groups: $.rank.groups,
								budget: $.contextBudget.available,
								messages: $.attached.messages,
								templateContext: $.context.templateContext,
								template: slot.template(),
								prompts: slot.prompts({ node: 'context' }),
								variables: slot.variables(),
								params: slot.params(),
								connection: slot.connectionOf('mode.basic.generate'),
							}),
						)
						.oracle(
							'generate',
							($: any) =>
								C.generateText.v1({
									context: $.mode.basic.prompt.context,
									currentCharacterId: $.input.characterId,
									connection: slot.connection(),
									sampling: slot.sampling(),
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
							($: any) =>
								C.updateMessage.v1({
									target: $.placeholder.messageId,
									text: $.mode.basic.generate.text,
									reasoning: $.mode.basic.generate.reasoning,
								}),
							{ expose: { label: 'Save the reply' } },
						),
				),
		)
	/** The writes the preset holds at the review gate — *Remember things* on Review. */
	const review: string[] = []
	const remembered = (graph as any).junction('memory', { on: ($: any) => $.tasks.sweep }, (j: any) =>
		j.when('due', { truthy: true }, (m: any) => memoryBranch(m, w, review)),
	)
	return compile(
		remembered
			/**
			 * What Chat ships with: the two layouts inline (a reference you
			 * can read), the reminder's trigger, the answer's path, and the
			 * loadouts — Reply for Basic, Tool calling for the loop (I12),
			 * Extraction for the memory call — and every Review note behind
			 * the review gate.
			 */
			.preset('assistant', { label: 'Assistant', default: true }, (p: any) => {
				let out = applyWiring(
					p
						.template('mode.basic.prompt', { source: ASSISTANT_RESPOND_TEMPLATE, engine: handlebars.id })
						.template(`${L}prompt`, { source: ASSISTANT_AGENTIC_TEMPLATE, engine: handlebars.id })
						.params('mode.basic.prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						// Agentic answers the same person as Basic: the same post-history trigger (lane 3 finding).
						.params(`${L}prompt`, { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						.params(`${A}answer`, { path: 'answer' })
						.loadout('mode.basic.generate', slot.loadout(CORE_LOADOUT.reply))
						.loadout(`${L}generate`, slot.loadout(CORE_LOADOUT.toolCalling))
						.loadout('memory.due.memoryWrite', slot.loadout(CORE_LOADOUT.extraction)),
					w,
				)
				for (const node of review) out = out.settings(node, { review: 'on' })
				return out
			})
			.build(),
	)
}

/**
 * 🚧 What *Remember things* asks every few turns (★K, lane 2): what the
 * person told the Assistant that is worth keeping.
 * @experimental
 */
export const ASSISTANT_MEMORY_SCHEMA = {
	type: 'object',
	properties: {
		notes: {
			type: 'array',
			maxItems: 4,
			items: {
				type: 'object',
				properties: { name: { type: 'string' }, content: { type: 'string' } },
				required: ['name', 'content'],
				additionalProperties: false,
			},
		},
	},
	required: ['notes'],
	additionalProperties: false,
} as const

/** The memory brief: the question the call answers, last. */
const MEMORY_BRIEF =
	'Look back over this conversation and note what the person told you that is worth remembering next time: facts about them, what they prefer, what they are working on, what they asked you to remember. Each note { name: a short title, content: a sentence or two in plain words }. Only what the person said or decided — never what you said, never a guess. An empty list when there is nothing new.'

/**
 * *Remember things* — `memory.due.*`: one JSON call over the conversation,
 * then each note filed (`create-lore-entry@1`, world lore) — on Full as it
 * is, on Review held at the review gate. The host routes the write: the
 * attached lorebook when the session may write it, else the session's own
 * notes, made on first use.
 */
const memoryBranch = (m: any, w: Wiring, review: string[]) => {
	const M = 'memory.due.'
	const asked = modelCall(m, w, M, 'memory', {
		prompt: ASSISTANT_PROMPT_KEYS.memory,
		brief: () => MEMORY_BRIEF,
		cast: ($: any) => $.gather.cast.read.cast,
		history: ($: any) => $.gather.history.read.messages,
		schema: ASSISTANT_MEMORY_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'Taking notes',
			label: 'Remember things',
			purpose: 'Every few turns, notes what you told the Assistant, so it remembers next time.',
		},
	})
	return asked.junction('notes', { on: ($: any) => $.tasks.modes }, (j: any) => {
		const arm = (b: any, mode: 'full' | 'review') => {
			const X = `${M}notes.${mode}.`
			const N = `${X}note.item.`
			w.params.push([`${N}write`, { entryType: 'core:entry/world-lore' }])
			if (mode === 'review') review.push(`${N}write`)
			const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
			return jsonPart(b, w, X, 'list', ($: any) => at($, `${M}memoryWrite`).json, 'notes', rv('The notes')).each(
				'note',
				{ over: ($: any) => at($, `${X}list`).main, max: 4 },
				(e: any) => {
					const item = ($: any) => at($, N.slice(0, -1))
					return textPart(
						textPart(e, w, N, 'name', item, 'name', rv("The note's title")),
						w,
						N,
						'content',
						item,
						'content',
						rv('What the note says'),
					).outlet(
						'write',
						($: any) =>
							C.createLoreEntry.v1({
								name: at($, `${N}name`).text,
								content: at($, `${N}content`).text,
								params: slot.params(),
							}),
						{ expose: { label: mode === 'full' ? 'File the note' : 'Hold the note for review' } },
					)
				},
			)
		}
		return j
			.when('full', { path: 'memory', equals: 'full' }, (b: any) => arm(b, 'full'))
			.when('review', { path: 'memory', equals: 'review' }, (b: any) => arm(b, 'review'))
	})
}
