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
 * 🚧 Typed (A18, derive-don't-spell; lane 4, 2026-10-20): a builder is
 * handed the chain it extends and reads through that chain's scope — the
 * caller's reads (`($) => $.crib.main`) typed by the caller's chain, its own
 * nodes by the key it declared them under — and returns the chain with its
 * nodes added (`Plus`), so what follows reads them by name. Nothing is
 * spelled as a prefix and a key: a `Wiring` entry names a node on its chain
 * (`on(c, 'crib')`), and its full key is read off that chain when the
 * defaults are written (`chains.ts`).
 */

import { handlebars, slot, type NodeAccessor, type OutPortsOf, type PortDecl, type PresetBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { READ_PATH_SCRIPT } from './scriptSeed.js'
import { chainOf, keyOf, on, sibling, type Chain, type NodeOn, type Plus, type ReadOn } from './chains.js'

export * from './chains.js'

type PortsOf<F extends (...args: never[]) => unknown> = OutPortsOf<ReturnType<F>>

/** What a spec's author preset names, collected as the graph is built. @internal */
export interface Wiring {
	scripts: Array<[node: NodeOn | string, seedKey: string]>
	prompts: Array<[node: NodeOn | string, seedKey: string]>
	params: Array<[node: NodeOn | string, value: Record<string, unknown>]>
	/** Model calls that answer JSON: they run on the Background sampling. */
	background: Array<NodeOn | string>
	/**
	 * Prompt steps laid out by a genre template, each with its source:
	 * {@link BRIEF_TURN_TEMPLATE} for a call whose brief is its
	 * last user turn, a genre's own for its narrator (Dungeon Crawler's
	 * `DUNGEON_CRAWLER_NARRATE_TEMPLATE`).
	 */
	templates: Array<[node: NodeOn | string, source: string]>
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

/**
 * The helper's own node, by the key the helper declared it under — inside a
 * helper generic over its key, where the scope cannot name it by type.
 * derive-don't-spell: a helper generic in `K` reads `${K}Lines`; the key is
 * derived from the one the caller handed, never spelled. @internal
 */
const own = ($: unknown, key: string): NodeAccessor<PortDecl> => ($ as Record<string, NodeAccessor<PortDecl>>)[key]

/** Everything a `Wiring` collected, written into an author preset. @internal */
export const applyWiring = <P extends PresetBuilder<any>>(p: P, w: Wiring): P => {
	let out: PresetBuilder<any> = p
	for (const [node, seedKey] of w.scripts) out = out.scripts(keyOf(node), [{ seedKey }])
	for (const [node, seedKey] of w.prompts) out = out.prompts(keyOf(node), { seedKey })
	for (const [node, value] of w.params) out = out.params(keyOf(node), value)
	for (const node of w.background) out = out.sampling(keyOf(node), { seedKey: 'sampling-background' })
	for (const [node, source] of w.templates) out = out.template(keyOf(node), { source, engine: handlebars.id })
	return out as P
}

/**
 * A script step: `core:task/run-script@1` over `input`, its chain the seeded
 * row `seedKey`. Publishes the script's return on `main`. Every step here
 * takes a `label`: the panel heads a step by it, and two steps of one
 * pipeline must never read alike. A `status` is the step's declared status
 * (`expose.status`): what the run says from the step's start — on the
 * progress card, and on a waiting reply's row before the reply's own row
 * exists. @internal
 */
export const scriptStep = <B extends Chain, K extends string>(
	c: B,
	w: Wiring,
	key: K,
	seedKey: string,
	input: ReadOn<B>,
	label: string,
	status?: string,
): Plus<B, K, PortsOf<typeof C.runScript.v1>> => {
	w.scripts.push([on(c, key), seedKey])
	return chainOf(c).task(key, ($) => C.runScript.v1({ input: input($ as never) as any, params: slot.params() }), {
		expose: status ? { label, status } : { label },
	}) as never
}

/** A JSON part of a document (`core:script/read-path`), on `main`. @internal */
export const jsonPart = <B extends Chain, K extends string>(
	c: B,
	w: Wiring,
	key: K,
	from: ReadOn<B>,
	path: string,
	label: string,
) => scriptStep(c, w, key, READ_PATH_SCRIPT.seedKey, ($) => ({ from: from($), path }), label)

/** A text part of a document (`join-text@1`'s `path`), on `text`. @internal */
export const textPart = <B extends Chain, K extends string>(
	c: B,
	w: Wiring,
	key: K,
	from: ReadOn<B>,
	path: string,
	label: string,
): Plus<B, K, PortsOf<typeof C.joinText.v1>> => {
	w.params.push([on(c, key), { path, separator: '' }])
	return chainOf(c).task(key, ($) => C.joinText.v1({ items: [from($ as never)] as any, params: slot.params() }), {
		expose: { label },
	}) as never
}

/** One model call's terms, read off chain `B`'s scope. @internal */
export interface CallTerms<B> {
	/** Who speaks: the envoy reference whose `{{char}}` the prompt names. Absent: no speaker (a call nobody voices — the Story genre's reckoning and sweep). */
	speaker?: string
	/** The seeded prompt row the context step starts on. */
	prompt: string
	/** The brief, as text — `{{turnDirection}}`. */
	brief: ReadOn<B>
	/** The Planner's crib, as text — `{{scratchpad}}`. */
	crib?: ReadOn<B>
	cast: ReadOn<B>
	/** Transcript rows (`session-history@1`) the model reads as the conversation. */
	history: ReadOn<B>
	/**
	 * Transcript rows read as background, not turns — `{{recentStory}}`:
	 * the story's newest rows for a call whose conversation is a Planner
	 * lane (`parley.ts`).
	 */
	recentStory?: ReadOn<B>
	/**
	 * 🚧 Named prompt fields (`build-template-context@1`'s `fields`) — the
	 * story turn's ruleset blocks (`{{rulesetSheet}}` …), each placed by name
	 * in the prompt row.
	 */
	fields?: ReadOn<B>
	/**
	 * A JSON schema: the call answers JSON. Absent: prose. 🚧 Or a read of one
	 * (`($) => $.schema.main`, PLAN-genres-seams S1, 2026-10-23): a schema the
	 * run builds — the session's rules' change grammar — rather than one the
	 * spec spells.
	 */
	schema?: object | ReadOn<B>
	/**
	 * 🚧 The brief is the call's **last user turn** (2026-10-16), after the
	 * transcript ({@link BRIEF_TURN_TEMPLATE}) — for a call nobody's
	 * line asks for (the class offer, the sheet, the world, the opening, a new
	 * goal). Its prompt row keeps only the standing rules in the system
	 * prompt.
	 */
	briefTurn?: boolean
	expose: { status: string; label: string; purpose: string; stream?: true }
}

/** The four nodes `modelCall` adds; `<key>Write` answers JSON with a schema, prose without. @internal */
export type Called<B, K extends string, T> = Plus<
	Plus<
		Plus<
			Plus<B, `${K}Context`, PortsOf<typeof C.buildTemplateContext.v1>>,
			`${K}Lines`,
			PortsOf<typeof C.proseTranscript.v1>
		>,
		`${K}Prompt`,
		PortsOf<typeof C.assemble.v2>
	>,
	`${K}Write`,
	T extends { schema: object } ? PortsOf<typeof C.generateJson.v1> : PortsOf<typeof C.generateText.v1>
>

/**
 * One model call, four steps: `<key>Context` (`build-template-context@1`,
 * the speaker and its prompt row), `<key>Lines` (the transcript as prose),
 * `<key>Prompt` (`assemble@2`) and `<key>Write` (`generate-json@1` with a
 * schema, `generate-text@1` without); with `briefTurn`, the prompt step is
 * laid out by {@link BRIEF_TURN_TEMPLATE}, the brief last. Publishes the oracle's ports on
 * `<key>Write`. All four declare the call's status. @internal
 */
export const modelCall = <B extends Chain, K extends string, T extends CallTerms<B>>(
	c: B,
	w: Wiring,
	key: K,
	t: T,
): Called<B, K, T> => {
	const ctx = `${key}Context`
	const write = on(c, `${key}Write`)
	w.prompts.push([on(c, ctx), t.prompt])
	if (t.schema) w.background.push(write)
	// The call's one status from its first step: the context, transcript
	// and prompt steps say what the oracle will (in place of the handlers'
	// generic *{speaker} is thinking* / *is composing*), so a call reads as
	// one stage, not three voices.
	const said = { expose: { status: t.expose.status } }
	if (t.briefTurn) w.templates.push([on(c, `${key}Prompt`), BRIEF_TURN_TEMPLATE])
	const read = (f: ReadOn<B>, $: unknown) => f($ as never) as any
	return chainOf(c)
		.task(
			ctx,
			($) =>
				C.buildTemplateContext.v1({
					cast: read(t.cast, $),
					...(t.speaker ? { speaker: t.speaker as any } : {}),
					turnDirection: read(t.brief, $),
					...(t.crib ? { scratchpad: read(t.crib, $) } : {}),
					...(t.recentStory ? { recentStory: read(t.recentStory, $) } : {}),
					...(t.fields ? { fields: read(t.fields, $) } : {}),
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			said,
		)
		.task(
			`${key}Lines`,
			($) =>
				C.proseTranscript.v1({
					messages: read(t.history, $),
					cast: read(t.cast, $),
					templateContext: own($, ctx).templateContext,
				}),
			said,
		)
		.task(
			`${key}Prompt`,
			($) =>
				C.assemble.v2({
					messages: own($, `${key}Lines`).messages,
					templateContext: own($, ctx).templateContext,
					template: slot.template(),
					prompts: slot.prompts(own($, ctx)),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf(sibling(own($, ctx), `${key}Write`)),
				}),
			said,
		)
		.oracle(
			`${key}Write`,
			($) =>
				t.schema
					? C.generateJson.v1({
							context: own($, `${key}Prompt`).context,
							schema: (typeof t.schema === 'function' ? read(t.schema as ReadOn<B>, $) : t.schema) as any,
							connection: slot.connection(),
							sampling: slot.sampling(),
							params: slot.params(),
						})
					: C.generateText.v1({
							context: own($, `${key}Prompt`).context,
							connection: slot.connection(),
							sampling: slot.sampling(),
							params: slot.params(),
							// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
							speechSampling: slot.speechSampling(),
						}),
			{ expose: t.expose },
		) as never
}
