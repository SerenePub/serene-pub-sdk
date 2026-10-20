/**
 * 🚧 The small builders a genre's specs share (moved here from
 * `genres/dungeon-crawler/calls.ts` on 2026-10-19, when the Story genre's
 * reckoning and sweep became their second user): a script step by seed key,
 * a part of a document read as JSON or as text, and one model call (context
 * → transcript → prompt → oracle). Each records what its spec's author preset
 * must name — the script, the prompt row, the read path, the Background
 * sampling — on a `Wiring`, and `applyWiring` writes them all into the
 * preset, so a builder used twice names its rows twice, under each place's
 * own node keys.
 *
 * Node keys are absolute: a builder is handed the prefix of the branch it
 * sits in (`route.sheet.`) and reads its own outputs through it, the way
 * the Lair's branches read `$.via.turn.channel.sanctum.*`.
 */

import { handlebars, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { READ_PATH_SCRIPT } from '../genres/dungeon-crawler/scripts.js'

/** What a spec's author preset names, collected as the graph is built. @internal */
export interface Wiring {
	scripts: Array<[node: string, seedKey: string]>
	prompts: Array<[node: string, seedKey: string]>
	params: Array<[node: string, value: Record<string, unknown>]>
	/** Model calls that answer JSON: they run on the Background sampling. */
	background: string[]
	/**
	 * Prompt steps laid out by a genre template, each with its source:
	 * {@link BRIEF_TURN_TEMPLATE} for a call whose brief is its
	 * last user turn, a genre's own for its narrator (Dungeon Crawler's
	 * `DUNGEON_CRAWLER_NARRATE_TEMPLATE`).
	 */
	templates: Array<[node: string, source: string]>
}

/** @internal */
export const wiring = (): Wiring => ({ scripts: [], prompts: [], params: [], background: [], templates: [] })

/**
 * 🚧 The assembly template of a call whose brief is its **last user turn**
 * (`briefTurn`, 2026-10-16) — the answer-form pattern (`factories/answerForm.ts`):
 * the shipped layout's system block, the transcript, then the prompt row's
 * post-history text as the user's turn — in Dungeon Crawler's rows, the brief
 * (`{{turnDirection}}`) and the reminder under it, sent whatever the
 * Session Prompt's trigger, since the call has nothing to answer without it.
 * A call nobody's line asks for — the class offer, the sheet, the world, the
 * opening, a new goal — went out as one system message, or ended on the
 * Narrator's line, and a chat-completion model answered nothing.
 * Triple-stashed: prose going to a model, not markup going to a browser.
 * @experimental
 */
export const BRIEF_TURN_TEMPLATE = `{{#systemBlock}}
{{#if instructions}}
{{{instructions}}}
{{/if}}

{{#if characters}}
{{{characters}}}
{{/if}}

{{#if personas}}
{{{personas}}}
{{/if}}

{{#if scenario}}
{{{scenario}}}
{{/if}}
{{/systemBlock}}

{{#each sessionMessages as |sessionMessage msgIndex|}}
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
{{/each}}

{{#if postHistoryInstructions}}
{{#userBlock}}
{{{postHistoryInstructions}}}
{{/userBlock}}
{{/if}}`

/** Everything a `Wiring` collected, written into an author preset. @internal */
export const applyWiring = (p: any, w: Wiring): any => {
	let out = p
	for (const [node, seedKey] of w.scripts) out = out.scripts(node, [{ seedKey }])
	for (const [node, seedKey] of w.prompts) out = out.prompts(node, { seedKey })
	for (const [node, value] of w.params) out = out.params(node, value)
	for (const node of w.background) out = out.sampling(node, { seedKey: 'sampling-background' })
	for (const [node, source] of w.templates) out = out.template(node, { source, engine: handlebars.id })
	return out
}

/** `$` read by a dotted node path (`route.sheet.sheetWrite`). @internal */
export const at = ($: any, path: string): any => path.split('.').reduce((o, k) => o[k], $)

/**
 * A script step: `core:task/run-script@1` over `input`, its chain the seeded
 * row `seedKey`. Publishes the script's return on `main`. Every step here
 * takes a `label`: the panel heads a step by it, and two steps of one
 * pipeline must never read alike. A `status` is the step's declared status
 * (`expose.status`): what the run says from the step's start — on the
 * progress card, and on a waiting reply's row before the reply's own row
 * exists. @internal
 */
export const scriptStep = (
	c: any,
	w: Wiring,
	prefix: string,
	key: string,
	seedKey: string,
	input: ($: any) => unknown,
	label: string,
	status?: string,
) => {
	w.scripts.push([`${prefix}${key}`, seedKey])
	return c.task(key, ($: any) => C.runScript.v1({ input: input($) as any, params: slot.params() }), {
		expose: status ? { label, status } : { label },
	})
}

/** A JSON part of a document (`core:script/read-path`), on `main`. @internal */
export const jsonPart = (
	c: any,
	w: Wiring,
	prefix: string,
	key: string,
	from: ($: any) => unknown,
	path: string,
	label: string,
) => scriptStep(c, w, prefix, key, READ_PATH_SCRIPT.seedKey, ($) => ({ from: from($), path }), label)

/** A text part of a document (`join-text@1`'s `path`), on `text`. @internal */
export const textPart = (
	c: any,
	w: Wiring,
	prefix: string,
	key: string,
	from: ($: any) => unknown,
	path: string,
	label: string,
) => {
	w.params.push([`${prefix}${key}`, { path, separator: '' }])
	return c.task(key, ($: any) => C.joinText.v1({ items: [from($)] as any, params: slot.params() }), {
		expose: { label },
	})
}

/** One model call's terms. @internal */
export interface CallTerms {
	/** Who speaks: the envoy reference whose `{{char}}` the prompt names. Absent: no speaker (a call nobody voices — the Story genre's reckoning and sweep). */
	speaker?: string
	/** The seeded prompt row the context step starts on. */
	prompt: string
	/** The brief, as text — `{{turnDirection}}`. */
	brief: ($: any) => unknown
	/** The Planner's crib, as text — `{{scratchpad}}`. */
	crib?: ($: any) => unknown
	cast: ($: any) => unknown
	/** Transcript rows (`session-history@1`) the model reads as the conversation. */
	history: ($: any) => unknown
	/**
	 * Transcript rows read as background, not turns — `{{recentStory}}`:
	 * the story's newest rows for a call whose conversation is a Planner
	 * lane (`parley.ts`).
	 */
	recentStory?: ($: any) => unknown
	/**
	 * 🚧 Named prompt fields (`build-template-context@1`'s `fields`) — the
	 * story turn's ruleset blocks (`{{rulesetSheet}}` …), each placed by name
	 * in the prompt row.
	 */
	fields?: ($: any) => unknown
	/** A JSON schema: the call answers JSON. Absent: prose. */
	schema?: object
	/**
	 * 🚧 The brief is the call's **last user turn** (2026-10-16), after the
	 * transcript ({@link BRIEF_TURN_TEMPLATE}) — for a call nobody's
	 * line asks for (the class offer, the sheet, the world, the opening, a new
	 * goal). Its prompt row keeps only the standing rules in the system
	 * prompt.
	 */
	briefTurn?: boolean
	expose: { status: string; label: string; purpose: string; stream?: boolean }
}

/**
 * One model call, four steps: `<key>Context` (`build-template-context@1`,
 * the speaker and its prompt row), `<key>Lines` (the transcript as prose),
 * `<key>Prompt` (`assemble@2`) and `<key>Write` (`generate-json@1` with a
 * schema, `generate-text@1` without); with `briefTurn`, the prompt step is
 * laid out by {@link BRIEF_TURN_TEMPLATE}, the brief last. Publishes the oracle's ports on
 * `<key>Write`. All four declare the call's status. @internal
 */
export const modelCall = (c: any, w: Wiring, prefix: string, key: string, t: CallTerms) => {
	const ctx = `${prefix}${key}Context`
	const write = `${prefix}${key}Write`
	w.prompts.push([ctx, t.prompt])
	if (t.schema) w.background.push(write)
	// The call's one status from its first step: the context, transcript
	// and prompt steps say what the oracle will (in place of the handlers'
	// generic *{speaker} is thinking* / *is composing*), so a call reads as
	// one stage, not three voices.
	const said = { expose: { status: t.expose.status } }
	if (t.briefTurn) w.templates.push([`${prefix}${key}Prompt`, BRIEF_TURN_TEMPLATE])
	return c
		.task(`${key}Context`, ($: any) =>
			C.buildTemplateContext.v1({
				cast: t.cast($) as any,
				...(t.speaker ? { speaker: t.speaker as any } : {}),
				turnDirection: t.brief($) as any,
				...(t.crib ? { scratchpad: t.crib($) as any } : {}),
				...(t.recentStory ? { recentStory: t.recentStory($) as any } : {}),
				...(t.fields ? { fields: t.fields($) as any } : {}),
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
			said,
		)
		.task(
			`${key}Lines`,
			($: any) =>
				C.proseTranscript.v1({
					messages: t.history($) as any,
					cast: t.cast($) as any,
					templateContext: at($, ctx).templateContext,
				}),
			said,
		)
		.task(`${key}Prompt`, ($: any) =>
			C.assemble.v2({
				messages: at($, `${prefix}${key}Lines`).messages,
				templateContext: at($, ctx).templateContext,
				template: slot.template(),
				prompts: slot.prompts({ node: ctx }),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf(write),
			}),
			said,
		)
		.oracle(
			`${key}Write`,
			($: any) =>
				t.schema
					? C.generateJson.v1({
							context: at($, `${prefix}${key}Prompt`).context,
							schema: t.schema as any,
							connection: slot.connection(),
							sampling: slot.sampling(),
							params: slot.params(),
						})
					: C.generateText.v1({
							context: at($, `${prefix}${key}Prompt`).context,
							connection: slot.connection(),
							sampling: slot.sampling(),
							params: slot.params(),
						}),
			{ expose: t.expose },
		)
}
