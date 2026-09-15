/**
 * A bounded agentic turn, written out (20 §9, 01 §4a) — the reference every
 * tool-using pipeline is a variation of.
 *
 * ## What it is for
 *
 * Two things, and it earns its place as either one alone. It is the shape an
 * author copies: the adventure genre's multi-agent workflows are this spec
 * with a bigger prompt and more tools, and "read the reference pipeline" is a
 * better answer than a paragraph describing one. And it is what the
 * integration suite runs — the loop block, the three tool nodes and the carry
 * all exercised end to end against a seeded database, rather than asserted
 * about in isolation where a wiring mistake cannot show.
 *
 * **Deliberately bound to no genre.** It declares no `genre` in its taxonomy
 * and no lock on its input, so it is not offered on Chat sessions and does not
 * compete with the reply pipeline: an example that appeared in a person's
 * composer would be a demo shipped as a feature.
 *
 * ## The shape
 *
 *   gather ─ advertise ─ loop( prompt → generate → parse → tool ) ─ answer ─ save
 *
 * `loop` repeats while `parse.call` is non-null, which is exactly "the model
 * asked for a tool" — a null call is the model answering instead, and it is
 * the loop's exit rather than an error (see `parse-tool-call`). `max` is
 * mandatory and is the only thing between a model that never stops asking and
 * a run that never ends.
 *
 * ## The carry, and why the prompt node is INSIDE the loop
 *
 * Each iteration needs a prompt that has the previous iterations' tool results
 * in it — a loop whose prompt never changed would ask the same question until
 * it hit its ceiling. A body node cannot reference one declared after it (F9:
 * the scope makes a back-edge unwritable), so the results arrive by the one
 * address that IS declared before the body: `$.agent.values`, the block's own
 * accumulating output. `results` joins them, and the assembly template renders
 * them above the transcript.
 *
 * ## Where the answer comes from
 *
 * `run-tool` publishes `answer` only on the iteration that called no tool —
 * the one where the model stopped working and replied — so joining every
 * iteration's `answer` is the turn's reply and nothing else. That is why the
 * write is a single `create-message` on the spine: a write inside the loop
 * would be N writes, which `validate.ts` refuses (F7), and correctly.
 */
import { compile, handlebars, slot, spec } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

export const TOOL_LOOP_SPEC_ID = 'core:spec/tool-loop'
export const TOOL_LOOP_VERSION = '1.0.0'

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
 * `postHistory` are the `prompts` slot `agent.item.prompt` owns, seeded from
 * `CORE_PROMPTS` like every other shipped step's prompt — so a person edits
 * the wording in the panel and this file holds the layout alone. Written into
 * the template as literal prose they would be a second copy of text the pool
 * already ships, and the panel's box would edit the copy nobody reads.
 *
 * Triple-stashed throughout, like every shipped context template: a prompt is
 * prose going to a model, not markup going to a browser, and Handlebars' HTML
 * escaping turns the fenced tool convention into `&#x60;&#x60;&#x60;` — an
 * advertisement the model cannot follow and the parser cannot read back.
 */
export const TOOL_LOOP_TEMPLATE = `{{{system}}}

{{{advertisement}}}

{{#if results}}
# What your tools have returned so far
{{{results}}}
{{/if}}

{{#if chatMessages}}
# The conversation
{{{chatMessages}}}
{{/if}}

{{#if postHistory}}
{{{postHistory}}}
{{/if}}`

export const toolLoopSpec = () =>
	compile(
		spec(TOOL_LOOP_SPEC_ID, {
			version: TOOL_LOOP_VERSION,
			/**
			 * No `genre`, on purpose — see the header. `action` because a
			 * person invokes it; `session` because it reads one.
			 */
			taxonomy: { zone: 'session', role: 'action' },
		})
			.on('core:event/ui-action@1')
			.input('input', C.userMessage.v1())
			.query('history', ($) =>
				C.sessionHistory.v1({
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			/**
			 * What this install can offer, resolved at run time rather than
			 * listed here: which extensions are enabled is not a property of
			 * the spec, and a hand-written list would advertise a tool that was
			 * uninstalled and refuse one that was added.
			 */
			.query('tools', ($) =>
				C.availableTools.v1({
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			/**
			 * `style` defaults to `prompt`, the tier that works on every
			 * backend. A connection whose adapter grades `tools` natively is
			 * switched to `native` in the panel, and only the wire changes:
			 * `parse-tool-call` reads the structured field the adapter surfaced
			 * instead of the fenced block, and everything downstream is the
			 * same.
			 */
			.task('advertise', ($) =>
				C.advertiseTools.v1({
					tools: $.tools.tools,
					params: slot.params(),
				}),
			)
			.task('lines', ($) =>
				C.processMessages.v1({ messages: $.history.messages }),
			)
			.loop(
				'agent',
				{ repeatWhile: ($: any) => $.agent.item.parse.call, max: 6 },
				(l) =>
					l
						/** The carry — see the header. Empty on the first pass. */
						.task('results', ($: any) =>
							C.joinText.v1({
								items: $.agent.values,
								// `path` defaults to `text`, which is the
								// tool-result block — what the next prompt
								// carries. Named so the control is live rather
								// than stored and never read.
								params: slot.params(),
							}),
						)
						.task('prompt', ($: any) =>
							C.assemble.v2({
								messages: $.lines.messages,
								templateContext: {
									advertisement: $.advertise.prompt,
									results: $.agent.item.results.text,
								},
								/**
								 * The slot, with the shipped text in the preset
								 * below.
								 *
								 * Not a literal here, though the text is
								 * authored a few lines up: a literal forms the
								 * config key but is not a *selection*, so the
								 * panel's template picker on this node would
								 * render above a value nobody picked. The
								 * preset is how an author ships a default that
								 * a person can then change.
								 */
								template: slot.template(),
								// Owned here: `generate` reads nothing from
								// its own `prompts` slot (the binding never
								// forwards it), so this is the one place the
								// text is authored and the panel offers one
								// box, not two. The pool's shipped row is
								// `CORE_PROMPTS`' tool-loop entry, which is
								// what the template's `system` and
								// `postHistory` render.
								prompts: slot.prompts(),
								variables: slot.variables(),
								params: slot.params(),
								// The connection this prompt is WRITTEN for is
								// the one that will receive it — a prompt
								// wrapped for one endpoint and sent to another
								// is wrong silently. Named by its QUALIFIED key:
								// a slot reference is to a node key, and inside
								// a block that key carries the block and chain.
								connection: slot.connectionOf(
									'agent.item.generate',
								),
							}),
						)
						.provider('generate', ($: any) =>
							C.generateText.v1({
								context: $.agent.item.prompt.context,
								connection: slot.connection(),
								sampling: slot.sampling(),
								params: slot.params(),
								// Shared from `prompt`, which owns it — see
								// the comment there. Left unwired, the
								// contract's own `prompts` slot renders a
								// control `resolveInput` never reads.
								prompts: slot.prompts({
									node: 'agent.item.prompt',
								}),
							}),
						)
						.task('parse', ($: any) =>
							C.parseToolCall.v1({
								text: $.agent.item.generate.text,
								tools: $.tools.tools,
							}),
						)
						/**
						 * The one impure step. A tool that fails answers the
						 * model rather than ending the run, so a bad call costs
						 * one iteration of the six instead of the turn.
						 */
						.provider('tool', ($: any) =>
							C.runTool.v1({
								call: $.agent.item.parse.call,
								tools: $.tools.tools,
								text: $.agent.item.parse.text,
							}),
						),
			)
			.task('answer', ($: any) =>
				C.joinText.v1({
					items: $.agent.values,
					// `path: 'answer'` — the iteration that answered instead of
					// asking. Shipped in the preset rather than written here for
					// the same reason the template is: a literal is a value
					// nobody chose, and this one differs from the declared
					// default, so it has to be a choice something made.
					params: slot.params(),
				}),
			)
			.consume('save', ($: any) =>
				C.createMessage.v1({ text: $.answer.text }),
			)
			/**
			 * What the reference ships, and the only place its two authored
			 * values live.
			 *
			 * `default: true` so an install boots with the pipeline working
			 * rather than with two empty pickers above a prompt that advertises
			 * nothing.
			 */
			.preset(
				'tool-loop',
				{ label: 'Tool loop', default: true },
				(p) =>
					p
						.template('agent.item.prompt', {
							source: TOOL_LOOP_TEMPLATE,
							engine: handlebars.id,
						})
						.params('answer', { path: 'answer' }),
			)
			.build(),
	)
