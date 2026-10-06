import { compile, type SpecDocument } from '@serene-pub/sdk'
import { assertValid, validate, type Finding } from '@serene-pub/sdk'
import type { SpecBuilder } from '@serene-pub/sdk'
import { ok, halt, err, type Bindings, type Result } from '@serene-pub/sdk'
import type { ConfigWorld } from '@serene-pub/sdk'
// Registers the suite's own `test:` definitions (see the module's docblock),
// so every fixture host below carries a stand-in for each of them.
import './fixtures.js'

export function publish(b: SpecBuilder<any>): SpecDocument {
	const doc = compile(b.build())
	assertValid(doc)
	return doc
}

export function findings(b: SpecBuilder<any>): Finding[] {
	return validate(compile(b.build()))
}

export function errorsFor(b: SpecBuilder<any>, law: string): Finding[] {
	return findings(b).filter((f) => f.severity === 'error' && f.law === law)
}

/** A clock we control, so "waiting" can be simulated without real delay. */
export function fakeClock(start = 1_000_000) {
	let t = start
	return { now: () => t, advance: (ms: number) => (t += ms) }
}

export const world: ConfigWorld = {
	overrides: [],
	samplingConfigs: [
		{ id: 'cfg_creative', name: 'Creative', shape: 'core:shape/text-gen@1', values: { temperature: 0.92, top_p: 0.95, mirostat_tau: 5 } },
		{ id: 'cfg_precise', name: 'Precise', shape: 'core:shape/text-gen@1', values: { temperature: 0.2 } },
		{ id: 'cfg_voice', name: 'Aria', shape: 'core:shape/tts@1', values: { voice: 'aria', speed: 1 } },
		// Carries a switchboard, unlike the three above — which deliberately do
		// not, because a world with no `enabled` is the older shape and slot
		// resolution still has to read it as all-on. Here `topK` is remembered
		// but off, and `topP` is on with no stored value so its declared default
		// is what should arrive.
		{
			id: 'cfg_switched',
			name: 'Switched',
			shape: 'core:shape/text-gen@1',
			values: { temperature: 0.4, topK: 99 },
			enabled: ['temperature', 'topP'],
		},
	],
	connections: [
		{
			id: 'ollama-local',
			name: 'Ollama',
			kind: 'core:shape/text-gen@1',
			metadata: { contextLength: 4096, tokenizer: 'llama-bpe', model: 'llama3', supportedSamplers: ['temperature', 'top_p'] },
			material: { apiKey: 'SECRET-DO-NOT-LEAK' },
		},
		{
			id: 'tts-eleven',
			name: 'ElevenLabs',
			kind: 'core:shape/tts@1',
			metadata: { model: 'eleven-v2' },
			material: { apiKey: 'SECRET-TTS' },
		},
	],
	activeConnection: {
		'core:shape/text-gen@1': 'ollama-local',
		'core:shape/tts@1': 'tts-eleven',
		'core:shape/embeddings@1': null, // no embeddings connection — auto falls back to keyword
	},
	authorDefaults: {},
}

export function withEmbeddings(): ConfigWorld {
	return {
		...world,
		connections: [
			...world.connections,
			{
				id: 'embed-local',
				name: 'MiniLM',
				kind: 'core:shape/embeddings@1',
				metadata: { model: 'all-MiniLM-L6-v2' },
				material: { apiKey: 'SECRET-EMB' },
			},
		],
		activeConnection: { ...world.activeConnection, 'core:shape/embeddings@1': 'embed-local' },
	}
}

/**
 * The knobs the fixture host takes, beside the hooks themselves.
 *
 * `reply` scripts what the `generate-text` stand-in says: a string it answers
 * with, or a function called with that node's input so a reply can quote what
 * it was asked. Leave it out and the stand-in answers exactly as it always
 * has — every golden in this suite was recorded against that default, and none
 * of them may move because a new knob exists.
 *
 * Deliberately not random and never reads the clock. A scripted reply is
 * printed on a documentation page, and a page whose text changed between two
 * builds is a page a reader learns to skip.
 */
export interface FixtureOptions {
	reply?: string | ((input: unknown) => string)
	/**
	 * Whether the install has an embedding model set up. A host embeds
	 * through its one active embedding connection, never one a step names
	 * (`embed-text` declares no connection slot since 2026-10-05), so the
	 * `embed-text` stand-in answers from this rather than from its input.
	 * Off by default: every golden was recorded with no embedding model.
	 */
	embeddings?: boolean
}

/**
 * Default bindings — deterministic, so goldens are stable.
 *
 * Takes either hook overrides keyed by definition id, as it always has, or the
 * fixture knobs above. `reply` can never collide with an override: a
 * definition id is `slug:kind/name@version`, never a bare word.
 */
export function bindings(over: Bindings | FixtureOptions = {}): Bindings {
	const { reply, embeddings, ...hooks } = over as FixtureOptions & { [definitionId: string]: unknown }
	const say = (input: unknown): string =>
		reply === undefined ? 'the reply text' : typeof reply === 'function' ? reply(input) : reply

	const base: Bindings = {
		'core:inlet/user-message@1': async (i) => ok(i),
		'core:inlet/message-created@1': async (i) => ok(i),

		'core:query/session-history@1': async (i: any) =>
			ok({
				main: 'history',
				messages: {
					sourceKey: 'history',
					items: Array.from({ length: 12 }, (_, n) => `msg${n}`),
					weight: i.params?.weight ?? 0.4,
					minInclude: i.params?.minInclude ?? 6,
					priority: 'normal',
				},
				// The transcript's band intent alone — its slice of the window
				// with no items, which is what a spec concatenates in with the
				// lore (16 §5a). The rows above go to `process-messages`; the
				// stand-in keeps them on `messages` so a test can still read
				// what was fetched.
				band: {
					sourceKey: 'history',
					items: [],
					weight: i.params?.weight ?? 0.4,
					minInclude: i.params?.minInclude ?? 6,
					priority: 'normal',
				},
			}),

		'core:query/lorebook-triggers@1': async (i: any) =>
			ok({
				main: 'lore',
				hits: { sourceKey: 'lore', items: ['elf', 'sister', 'castle'], weight: i.params?.weight ?? 0.35, minInclude: 3, priority: 'high' },
			}),

		'core:query/vector-search@1': async (i: any) => {
			if (!i.vector) return ok({ main: 'vsearch', hits: { sourceKey: 'vector', items: [], weight: 0.3, minInclude: 0 } })
			return ok({ main: 'vsearch', hits: { sourceKey: 'vector', items: ['v1', 'v2'], weight: 0.3, minInclude: 0 } })
		},

		'test:query/persona-card@1': async () => ok({ main: 'persona', card: { sourceKey: 'persona', items: ['Mira'], weight: 0.25, minInclude: 0 } }),
		'test:query/message-text@1': async () => ok({ main: 'text', plain: 'the raw message text' }),

		'core:oracle/embed-text@1': async (i: any, ctx: any) => {
			const enabled = i.params?.enabled ?? 'auto'
			if (enabled === 'off') return ok({ main: null, vector: null })
			if (!embeddings) {
				ctx.log('info', 'no active embeddings connection, returned null')
				return ok({ main: null, vector: null })
			}
			return ok({ main: [0.1, 0.2, 0.3], vector: [0.1, 0.2, 0.3] })
		},

		// The sprite step every reply spec writes after `save` (2026-10-05).
		// The fixture's cards have no art, so the picker picks nothing — as a
		// host does for a speaker with no sprites — and the outlet, handed a
		// picker's null pick, writes nothing.
		'core:oracle/pick-sprite@1': async () => ok({ main: null, pick: null, choices: null }),
		'core:outlet/show-sprite@1': async (i: any, ctx: any) => {
			if ((i.pick ?? null) === null && i.source === 'picker')
				return ok({ main: i.target ?? null, messageId: i.target ?? null, sprite: null, kept: true })
			const row = await ctx.commit({ target: i.target, pick: i.pick, source: i.source })
			return ok({ main: row.id, messageId: row.id, sprite: i.pick ?? null, kept: false })
		},

		'core:task/context-budget@1': async (i: any) => {
			const ctxLen = i.connection?.metadata?.contextLength ?? 2048
			const reserve = i.params?.reserveForReply ?? 512
			return ok({ main: ctxLen - reserve, available: ctxLen - reserve, tokenizer: i.connection?.metadata?.tokenizer })
		},

		'core:task/merge-candidates@1': async (i: any) => {
			const sources = (i.sources ?? []).filter(Boolean)
			const hasVectors = sources.some((s: any) => s?.sourceKey === 'vector' && s.items.length > 0)
			const declared = i.params?.strategy ?? 'auto'
			const resolved = declared === 'auto' ? (hasVectors ? 'vector' : 'keyword') : declared
			const kept = sources.filter((s: any) =>
				resolved === 'vector' ? s.sourceKey !== 'lore' : resolved === 'keyword' ? s.sourceKey !== 'vector' : true,
			)
			return ok({ main: kept, candidates: kept, strategyResolved: resolved })
		},

		'core:task/rank-hybrid@1': async (i: any) => ok({ main: i.candidates, candidates: i.candidates }),
		'chariot.recall:rank-recall@1': async (i: any) => ok({ main: i.candidates, candidates: i.candidates }),
		'test:task/render-entries@1': async (i: any) => ok({ main: `rendered(${i.entries?.items?.length ?? 0})` }),
		'test:task/to-candidates@1': async (i: any) => {
			const items = Array.isArray(i.items) ? i.items : [i.items].filter(Boolean)
			const block = { sourceKey: 'summaries', items, weight: 0.5, minInclude: 0, priority: 'normal' }
			return ok({ main: block, candidates: block })
		},
		'core:outlet/attach-image@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ target: i.target, image: i.image })
			return ok({ main: row.id })
		},

		// 🚧 The attachment prompt path (PLAN-composer-attachments §3.5): no
		// files in a fixture transcript, and placement passes its lines through.
		'core:query/history-attachments@1': async () => ok({ main: {}, attachments: {} }),
		'core:task/place-attachments@1': async (i: any) =>
			ok({ main: i?.messages ?? [], messages: i?.messages ?? [], notes: [] }),

		'core:task/assemble@2': async (i: any) => {
			const budget = i.budget ?? i.params?.budget ?? 4096
			const raw = i.candidates ?? []
			const blocks = (Array.isArray(raw) ? raw : [raw]).filter(Boolean)
			const alloc = blocks.map((b: any) => ({
				sourceKey: b.sourceKey,
				weight: b.weight,
				minInclude: b.minInclude,
				included: Math.max(b.minInclude ?? 0, Math.floor(b.items.length * (b.weight ?? 0))),
				available: b.items.length,
			}))
			const dropped = alloc.reduce((n: number, a: any) => n + (a.available - a.included), 0)
			return ok({ main: { budget, alloc, dropped }, context: { budget, alloc, dropped } })
		},

		'core:task/join-text@1': async (i: any) => {
			const path = typeof i.params?.path === 'string' ? i.params.path : 'text'
			const separator = typeof i.params?.separator === 'string' ? i.params.separator : '\n\n'
			// The host hands this a list; the suite's queries publish a
			// candidates BLOCK whose `items` are plain strings, so both are
			// read — an item that is already a string is the entry itself.
			const entries: unknown[] = Array.isArray(i.items)
				? i.items
				: Array.isArray(i.items?.items)
					? i.items.items
					: []
			const text = entries
				.map((e) => (typeof e === 'string' ? e : path ? (e as any)?.[path] : e))
				.filter((t): t is string => typeof t === 'string' && t.length > 0)
				.join(separator)
			return ok({ main: text, text })
		},

		'test:task/chunk-text@1': async (i: any) => {
			const items = String(i.text ?? '').split('|')
			return ok({ main: items, items })
		},

		'chariot.dice-tray:roll@1': async (i: any, ctx: any) => {
			const n = Number(String(i.notation ?? '1d20').split('d')[1] ?? 20)
			const total = Math.floor(ctx.random() * n) + 1
			return ok({ main: total, total })
		},

		'core:oracle/generate-text@1': async (i: any, ctx: any) => {
			const supported = new Set(i.connection?.metadata?.supportedSamplers ?? [])
			const applied: Record<string, unknown> = {}
			const ignored: string[] = []
			for (const [k, v] of Object.entries(i.sampling ?? {})) {
				if (supported.size === 0 || supported.has(k)) applied[k] = v
				else ignored.push(k)
			}
			ctx.reportSampling(applied, ignored)
			ctx.reportUsage(214)
			await ctx.call({ context: i.context, sampling: applied })
			const text = say(i)
			return ok({ main: text, text })
		},

		'test:oracle/speak@1': async (_i: any, ctx: any) => {
			ctx.reportUsage(1)
			return ok({ main: 'audio:blob', audio: 'audio:blob' })
		},

		'core:oracle/generate-image@1': async (_i, ctx: any) => {
			ctx.reportUsage(1)
			return ok({ main: 'image:blob', image: 'image:blob' })
		},

		'chariot.comfy:render-image@1': async (_i, ctx: any) => {
			ctx.reportUsage(1)
			return ok({ main: 'image:blob', image: 'image:blob' })
		},

		'test:oracle/mcp-tool@1': async (i: any, ctx: any) => {
			ctx.reportUsage(1)
			await ctx.call(i.args)
			return ok({ main: { done: true }, result: { done: true } })
		},

		'test:task/first-json@1': async () => ok({ main: { early: true } }),
		'test:task/sloppy-stream@1': async () => ok({ main: { early: true } }),
		'test:task/gate@1': async () => ok({ main: 'passed' }),
		'test:task/passthrough@1': async (i: any) => ok({ main: i.main }),
		'test:task/bad-toggleable@1': async () => ok({ main: null }),
		'test:query/network@1': async (_i, ctx: any) => {
			if ('fetch' in ctx) return err('a Query reached the network')
			return ok({ main: 'no network handle available' })
		},
		'test:task/delay@1': async (i: any) => {
			await new Promise((r) => setTimeout(r, Number(i.ms ?? 0)))
			return ok({ main: i.ms ?? 0 })
		},
		'test:task/slow@1': async () => {
			await new Promise((r) => setTimeout(r, 200))
			return ok({ main: 'too late' })
		},

		'core:outlet/create-message@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ text: i.text })
			return ok({ main: row.id, messageId: row.id })
		},
		'core:outlet/attach-audio@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ target: i.target, audio: i.audio })
			return ok({ main: row.id })
		},
		'test:outlet/save-plugin-data@1': async (i: any, ctx: any) => {
			const row = await ctx.commit({ value: i.value })
			return ok({ main: row.id })
		},
		'test:outlet/emit-socket@1': async (i: any, ctx: any) => {
			ctx.emit(String(i.handle ?? 'unnamed'), i.from)
			return ok({ main: 'emitted' })
		},
	}
	return { ...base, ...(hooks as Bindings) }
}

export const H = { ok, halt, err }
export type { Result }
