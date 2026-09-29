/**
 * `@serene-pub/sdk/testing` — the harness a **plugin author** runs (03 §9, U11).
 *
 * Distinct from `src/conformance.ts`, which is what **SP Core** runs against its own
 * executor. Two different audiences and two different questions:
 *
 *   conformance.ts — "does this host obey the laws?"
 *   testing.ts     — "does my hook behave, and did my change alter what gets sent?"
 *
 * The second question is the one that keeps a plugin working across SP releases, and it
 * is answered by goldens: record a receipt now, compare later, and see the diff rather
 * than a pass/fail. **"It still runs" is not the assertion anyone needs** — a plugin that
 * runs and quietly changes the prompt is the failure mode that reaches users.
 */

import type { Receipt, NodeReceipt } from './receipt.js'
import type { SpecDocument } from './document.js'
import type { Bindings, Result, RunOptions } from './executor.js'
import { run } from './executor.js'
import type { Descriptor } from './descriptors.js'

/**
 * The plugin sandbox's context, in this harness (plans 29 §14 D-3) — the half
 * the executor cannot supply, because a plugin's node handlers never run
 * against the executor's context at install. Re-exported here so an author's
 * one import is `@serene-pub/sdk/testing`.
 */
export * from './pluginHarness.js'

// ── Goldens ─────────────────────────────────────────────────────────────────

/** @experimental */
export interface Golden {
	name: string
	specId: string
	specVersion: string
	seed: string
	outcome: Receipt['outcome']
	haltReason?: string
	/** Per node: what went in and what came out. Timings are excluded on purpose. */
	nodes: Array<{ nodeKey: string; kind: string; result: string; input?: unknown; output?: unknown }>
	emitted: Array<{ event: string; cause: string }>
	/** The payload a preview run would have sent, when there is one. */
	wire?: unknown
}

/**
 * Reduce a receipt to what a golden should hold.
 *
 * Timings, run ids and wall-clock are all excluded — a golden that fails because a run
 * took 3ms instead of 2ms is a golden nobody keeps. What is kept is every decision and
 * every payload, which is what actually changes when a plugin's behaviour changes.
 * @experimental
 */
export function toGolden(name: string, r: Receipt): Golden {
	return {
		name,
		specId: r.specId,
		specVersion: r.specVersion,
		seed: r.seed,
		outcome: r.outcome,
		haltReason: r.haltReason,
		nodes: r.nodes.map((n) => ({
			nodeKey: n.nodeKey,
			kind: n.kind,
			result: n.result,
			input: n.input,
			output: n.output,
		})),
		emitted: r.emitted.map((e) => ({ event: e.event, cause: e.cause })),
		wire: r.preview?.context.rendered,
	}
}

/** @experimental */
export interface GoldenDiff {
	path: string
	before: unknown
	after: unknown
}

/** A structural diff, deepest-path-first, so the first line names the actual change. @experimental */
export function diffGolden(before: Golden, after: Golden): GoldenDiff[] {
	const out: GoldenDiff[] = []
	const walk = (a: unknown, b: unknown, path: string) => {
		if (JSON.stringify(a) === JSON.stringify(b)) return
		const both = a && b && typeof a === 'object' && typeof b === 'object'
		if (!both) return void out.push({ path, before: a, after: b })
		const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
		let pushed = false
		for (const k of keys) {
			const before = out.length
			walk((a as any)[k], (b as any)[k], path ? `${path}.${k}` : k)
			if (out.length > before) pushed = true
		}
		if (!pushed) out.push({ path, before: a, after: b })
	}
	walk(before, after, '')
	return out
}

/** @experimental */
export function renderDiff(d: GoldenDiff[]): string {
	if (!d.length) return 'identical'
	return d
		.map((x) => `  ${x.path}\n    before: ${JSON.stringify(x.before)}\n    after:  ${JSON.stringify(x.after)}`)
		.join('\n')
}

/** @experimental */
export class GoldenMismatch extends Error {
	constructor(
		readonly name: string,
		readonly diff: GoldenDiff[],
	) {
		super(`golden '${name}' changed:\n${renderDiff(diff)}`)
	}
}

/** Record if absent, compare if present. The whole workflow in one call. @experimental */
export function checkGolden(name: string, r: Receipt, stored?: Golden): { golden: Golden; recorded: boolean } {
	const golden = toGolden(name, r)
	if (!stored) return { golden, recorded: true }
	const diff = diffGolden(stored, golden)
	if (diff.length) throw new GoldenMismatch(name, diff)
	return { golden, recorded: false }
}

// ── Binding conformance ─────────────────────────────────────────────────────

/** @experimental */
export interface BindingProbe {
	id: string
	title: string
	consequence: string
	check(hook: (input: any, ctx: any) => any, d: Descriptor, ctx: ProbeCtx): Promise<void> | void
}

/** @experimental */
export interface ProbeCtx {
	sampleInput: unknown
	/** A context object shaped like the one the executor injects for this kind. */
	makeCtx(over?: Record<string, unknown>): any
}

const must = (cond: unknown, why: string) => {
	if (!cond) throw new Error(why)
}

const isResult = (v: unknown): v is Result =>
	!!v && typeof v === 'object' && ['ok', 'err', 'cancelled', 'halt'].includes((v as Result).kind)

/**
 * What a hook has to do to be a hook. Run these in your own tests — the executor assumes
 * all of it, and a hook that breaks one of them fails in a way that is hard to attribute.
 * @experimental
 */
export const BINDING_PROBES: BindingProbe[] = [
	{
		id: 'B1',
		title: 'returns a discriminated result, never a bare value',
		consequence:
			'The executor cannot tell success from a halt, so a correct "not applicable" is recorded as an error and the run inspector stops being trustworthy.',
		async check(hook, _d, ctx) {
			const r = await hook(ctx.sampleInput, ctx.makeCtx())
			must(isResult(r), `returned ${typeof r}; expected ok(…) / err(…) / halt(…) / cancelled(…)`)
		},
	},
	{
		id: 'B2',
		title: 'a Task reaches for no services',
		consequence:
			'Purity is what makes replay exact (F11). A Task that reads the clock or the network produces a run nobody can reproduce, and the receipt becomes a story rather than a record.',
		async check(hook, d, ctx) {
			if (d.kind !== 'task') return
			const surface = ctx.makeCtx()
			must(!('read' in surface), 'a Task context must not carry `read`')
			must(!('call' in surface), 'a Task context must not carry `call`')
			must(!('commit' in surface), 'a Task context must not carry `commit`')
			await hook(ctx.sampleInput, surface)
		},
	},
	{
		id: 'B3',
		title: 'randomness comes only from the run seed',
		consequence:
			'A dice roll nobody can replay is a dice roll nobody can dispute — and the seeded version is the whole reason SP can explain a probability roll where the incumbent cannot.',
		async check(hook, d, ctx) {
			if (!d.declaresRandomness) return
			const a = await hook(ctx.sampleInput, ctx.makeCtx({ random: seeded('probe') }))
			const b = await hook(ctx.sampleInput, ctx.makeCtx({ random: seeded('probe') }))
			must(
				JSON.stringify(a) === JSON.stringify(b),
				'two invocations with the same seeded RNG produced different output — something is reaching for Math.random',
			)
		},
	},
	{
		id: 'B4',
		title: 'it settles rather than hanging',
		consequence:
			'`runtime: node` abandons rather than kills (13 §7h), so a hook that never settles keeps burning CPU after the executor has moved on and eventually marks your plugin unhealthy.',
		async check(hook, _d, ctx) {
			const settled = await Promise.race([
				Promise.resolve(hook(ctx.sampleInput, ctx.makeCtx())).then(() => true),
				new Promise((res) => setTimeout(() => res(false), 250)),
			])
			must(settled, 'did not settle within 250ms in a probe with no I/O')
		},
	},
	{
		id: 'B5',
		title: 'it honours the abort signal',
		consequence:
			'The signal is the only cooperative way an in-process hook can be stopped. Ignoring it means an admin killing a run watches it keep going.',
		async check(hook, _d, ctx) {
			const c = new AbortController()
			c.abort()
			const r = await hook(ctx.sampleInput, ctx.makeCtx({ signal: c.signal }))
			must(isResult(r), 'an aborted invocation still has to return a result, not throw')
		},
	},
]

function seeded(seed: string): () => number {
	let h = 2166136261
	for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507)
		h = Math.imul(h ^ (h >>> 13), 3266489909)
		return ((h ^= h >>> 16) >>> 0) / 4294967296
	}
}

const PROBE_TIMEOUT_MS = 1000

/**
 * The timer is *not* unref'd and *is* cleared. A probe that awaits a hook which never
 * settles has to lose to a timer the event loop is still holding — otherwise the loop
 * drains, the await never resolves, and the author sees their test runner give up
 * instead of seeing "your hook never returned".
 */
function bounded<T>(p: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout>
	return Promise.race([
		p,
		new Promise<never>((_, rej) => {
			timer = setTimeout(
				() => rej(new Error(`probe did not settle within ${PROBE_TIMEOUT_MS}ms — the hook never returned`)),
				PROBE_TIMEOUT_MS,
			)
		}),
	]).finally(() => clearTimeout(timer))
}

/** @experimental */
export interface ProbeResult {
	id: string
	title: string
	pass: boolean
	error?: string
	consequence?: string
}

/** @experimental */
export async function probeBinding(
	hook: (input: any, ctx: any) => any,
	descriptor: Descriptor,
	ctx: ProbeCtx,
): Promise<ProbeResult[]> {
	const out: ProbeResult[] = []
	for (const p of BINDING_PROBES) {
		try {
			// Every probe is bounded. A probe that awaits a hook which never settles would
			// otherwise hang the author's whole test run — turning "your hook has a bug"
			// into "the SDK's harness is broken", which is the wrong lesson to teach.
			await bounded(Promise.resolve(p.check(hook, descriptor, ctx)))
			out.push({ id: p.id, title: p.title, pass: true })
		} catch (e) {
			out.push({ id: p.id, title: p.title, pass: false, error: (e as Error).message, consequence: p.consequence })
		}
	}
	return out
}

/** A context shaped like the executor's, per kind — so a probe tests the real surface. @experimental */
export const probeCtxFor = (kind: Descriptor['kind'], sampleInput: unknown = {}): ProbeCtx => ({
	sampleInput,
	makeCtx: (over = {}) => {
		const base: Record<string, unknown> = {
			signal: new AbortController().signal,
			progress: () => {},
			log: () => {},
		}
		if (kind === 'query') base.read = () => []
		if (kind === 'oracle') {
			base.call = async (p: unknown) => p
			base.connectionMetadata = {}
			base.sampling = {}
			base.reportUsage = () => {}
			base.reportSampling = () => {}
		}
		if (kind === 'outlet') {
			base.commit = async (p: any) => ({ id: 'row:probe', ...p })
			base.emit = () => {}
		}
		return { ...base, ...over }
	},
})

// ── Executed examples ───────────────────────────────────────────────────────

/**
 * The seed and the clock an executed example runs on.
 *
 * Fixed, and fixed *here* rather than per example: two runs of the same page
 * have to produce the same bytes or the golden is noise, and a seed chosen by
 * each example is a seed one of them forgets to choose. Everything a receipt
 * records that moves on its own — run id, timestamps, durations — is either
 * excluded by `toGolden` or never rendered by `renderRunSummary`.
 *
 * They live in the SDK rather than in the docs generator because the generator
 * is not the only thing that runs an example any more: the browser playground
 * runs the same module against the same seed, and a reader who compares what
 * they just ran against the page has to be comparing the same run.
 * @experimental
 */
export const EXAMPLE_SEED = 'seed:example'
/** @experimental */
export const EXAMPLE_CLOCK = 1_700_000_000_000

/** Everything `run` takes except the two things the harness decides. @experimental */
export type ExampleRunOptions = Omit<RunOptions, 'seed' | 'now'>

/**
 * What an example's `run()` is handed: its own compiled document, and the way
 * to execute it deterministically. Deliberately small — the fixture host itself
 * (bindings, scope data) is the example's own import, because a reader of the
 * page has to be able to see which hooks answered.
 * @experimental
 */
export interface ExampleRunCtx {
	/** This example's document — already compiled from `build()` and validated. */
	doc: SpecDocument
	/** The run seed. Passed for the example to show; `run` applies it regardless. */
	seed: string
	/** The run clock, for the same reason. */
	now: () => number
	/** Execute `doc` under this seed and clock. Everything else is the example's. */
	run(opts: ExampleRunOptions): Promise<Receipt>
}

/** The context an executed example runs against. Seed and clock default to the fixed pair. @experimental */
export function makeExampleRunCtx(
	doc: SpecDocument,
	opts: { seed?: string; now?: () => number } = {},
): ExampleRunCtx {
	const seed = opts.seed ?? EXAMPLE_SEED
	const now = opts.now ?? (() => EXAMPLE_CLOCK)
	return { doc, seed, now, run: (runOpts) => run(doc, { ...runOpts, seed, now }) }
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/** How much of a written text a summary line shows before it stops. */
const WROTE_LIMIT = 100

/**
 * Whether this outlet's published result is a write the host took (13 §7j-b).
 *
 * The verb on the line below is `wrote`, so it has to be earned. A write-effect
 * outlet publishes a discriminated `WriteResult` and the executor stamps
 * `committed` on it; an emit-class outlet publishes whatever its binding
 * returned, and `pending` is a write still sitting in review.
 */
const committed = (output: unknown): boolean =>
	!!output &&
	typeof output === 'object' &&
	(output as { status?: unknown }).status === 'committed'

/**
 * What an outlet was handed to write, if anything readable.
 *
 * `text` first, because that is the port the writing outlets in the core
 * catalog name. Then the first string-valued port, because an outlet is free
 * to name its own — `audio`, `value` — and a summary that understood one word
 * only would go quiet on exactly the outlets a plugin author wrote. A receipt
 * carries a node's input, not its port declarations, so the input object is
 * all there is to read here.
 */
function wroteText(input: unknown): string | undefined {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined
	const ports = input as Record<string, unknown>
	const value =
		typeof ports.text === 'string'
			? ports.text
			: Object.values(ports).find((v): v is string => typeof v === 'string')
	if (value === undefined) return undefined
	// One line, whatever the text did: a summary is a block of plain text, and a
	// reply with a paragraph break in it would otherwise break the column.
	const flat = value.replace(/\s+/g, ' ').trim()
	if (!flat) return undefined
	return flat.length > WROTE_LIMIT ? `${flat.slice(0, WROTE_LIMIT)}…` : flat
}

/**
 * A receipt as a page shows it: what ran, in order, and how each step ended.
 *
 * Not `renderReceipt`, which is the run inspector's rendering and carries the
 * run id, the elapsed times and the wall clock. Every one of those moves
 * between two identical runs, and a page that changed on every build would
 * teach a reader to ignore it. What is left is what the run DECIDED — which is
 * the only part worth pinning.
 * @experimental
 */
export function renderRunSummary(r: Receipt): string {
	const out: string[] = []
	out.push(`outcome ${r.outcome}${r.haltNodeKey ? ` · halted at ${r.haltNodeKey}` : ''}`)
	if (r.haltReason) out.push(`  reason: ${r.haltReason}`)
	for (const n of r.nodes) {
		out.push(` ▸ ${n.nodeKey.padEnd(22)} ${n.kind.padEnd(8)} ${n.result}`)
		if (n.reason) out.push(`     reason: ${n.reason}`)
		if (n.recoveredAsEmpty) out.push(`     recovered as empty — the run continued without it`)
		if (n.samplingIgnored?.length)
			out.push(`     ignored samplers: ${n.samplingIgnored.join(', ')}`)
	}
	// What actually reached the session. The node lines above say a write
	// happened; these say what it was, which is the half a reader came for.
	//
	// Only outlets that committed. An emit-class outlet is not a write (F7 —
	// there is exactly one of those), and a line for the streaming twin of the
	// write beside it would print the same sentence twice; a dry run committed
	// nothing at all and its line would name a row nobody has.
	for (const n of r.nodes) {
		if (n.kind !== 'outlet' || n.result !== 'ok' || n.dry || !committed(n.output)) continue
		const wrote = wroteText(n.input)
		if (wrote !== undefined) out.push(` ▸ ${n.nodeKey} wrote: “${wrote}”`)
	}
	for (const e of r.emitted)
		out.push(
			` ▸ core emitted ${e.event} (cause: ${e.cause}) → ${plural(e.subscribers, 'subscriber')}`,
		)
	out.push(
		` consumption: ${plural(r.consumption.tokens, 'token')}, ` +
			`${plural(r.consumption.nodeExecutions, 'node execution')}`,
	)
	return out.join('\n')
}

// ── Equivalence ─────────────────────────────────────────────────────────────

/**
 * F26 as a one-liner an author can run: parallel and forced-sequential must produce the
 * same result. If your hook has a hidden ordering dependency, this is where it shows up
 * — not in a user's chat at 2am under load.
 * @experimental
 */
export async function assertEquivalent(doc: SpecDocument, opts: RunOptions): Promise<void> {
	const norm = (r: Receipt) =>
		r.nodes
			.map((n: NodeReceipt) => `${n.nodeKey}:${n.result}:${JSON.stringify(n.output)}`)
			.sort()
			.join('\n')
	const par = await run(doc, opts)
	const seq = await run(doc, { ...opts, forceSequential: true })
	if (norm(par) !== norm(seq)) {
		throw new Error(
			'forced-sequential execution produced a different result (F26). Something in this spec ' +
				'depends on completion order — usually a hook mutating shared state rather than returning it.',
		)
	}
}

/** Run the same spec twice on one seed and assert nothing moved (F11). @experimental */
export async function assertDeterministic(doc: SpecDocument, opts: RunOptions & { seed: string }): Promise<void> {
	const a = await run(doc, opts)
	const b = await run(doc, opts)
	const diff = diffGolden(toGolden('a', a), toGolden('b', b))
	if (diff.length) throw new GoldenMismatch('determinism', diff)
}

/** @experimental */
export function renderProbes(results: ProbeResult[]): string {
	const lines = results.map((r) => `  ${r.pass ? '✓' : '✗'} ${r.id} ${r.title}`)
	for (const r of results.filter((x) => !x.pass)) {
		lines.push('', `✗ ${r.id} — ${r.error}`, `   what this breaks: ${r.consequence}`)
	}
	return lines.join('\n')
}

export type { Bindings }
