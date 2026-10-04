/**
 * 24 hypothetical use cases.
 *
 * Each one maps to a Fixed Ledger law or a documented behaviour, and is named with
 * the reference so a failure points at the doc it violates.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, fragment, SLOT_VALUE, SCOPE_ORDER } from '@serene-pub/sdk'
import {
	compile,
	canonical,
	canonicalHash,
	importDocument,
	resolveDownstreamOracle,
} from '@serene-pub/sdk'
import { validate } from '@serene-pub/sdk'
import { run, replay, ok, halt, err, seededRandom } from '@serene-pub/sdk'
import { renderReceipt } from '@serene-pub/sdk'
import { resolveConfig, resolveConfigSources, assertWritable, mayWrite } from '@serene-pub/sdk'
import { slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as T from './fixtures.js'
import {
	publish,
	findings,
	errorsFor,
	bindings,
	world,
	withEmbeddings,
	fakeClock,
} from './helpers.js'

// ── 01 · Minimal chat turn ──────────────────────────────────────────────────
describe('01 · a minimal chat turn runs end to end', () => {
	const s = () =>
		spec('demo:minimal@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.task('prompt', () => C.assemble.v2())
			.oracle('generate', ($) =>
				C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
			)
			.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

	test('publishes and runs', async () => {
		const doc = publish(s())
		const r = await run(doc, { input: { text: 'hi' }, bindings: bindings(), world })
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(
			r.nodes.map((n) => n.nodeKey),
			['input', 'history', 'prompt', 'generate', 'save'],
		)
	})

	test('the kind is named at every step, and mismatches cannot compile (04 §4a)', () => {
		// The `@ts-expect-error` is the real assertion: as of the typed-scope pass this is
		// rejected by tsc, not merely thrown at authoring time. `npm run typecheck` fails
		// if the error stops happening. The runtime throw is kept as the JS-consumer
		// backstop and because the message teaches the fix.
		assert.throws(
			() =>
				spec('demo:bad@1', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					// @ts-expect-error — a Provider constructor handed to .query()
					.query('x', C.generateText.v1()),
			/use \.oracle\(\) instead/,
		)
	})
})

// ── 02 · Exactly one Input, positionally first (01 §2) ──────────────────────
describe('02 · exactly one Input, positionally first', () => {
	test('a second .inlet() throws at authoring time', () => {
		assert.throws(
			() =>
				spec('demo:two-inputs@1', { version: '1.0.0' })
					.inlet('a', C.userMessage.v1())
					.inlet('b', C.userMessage.v1()),
			/exactly one inlet/,
		)
	})
	test('.inlet() after another node throws', () => {
		assert.throws(
			() =>
				spec('demo:late-input@1', { version: '1.0.0' })
					.task('t', C.gate.v1())
					.inlet('a', C.userMessage.v1()),
			/must be the first node/,
		)
	})
})

// ── 03 · One live row; other writes and emits unlimited (F7, W1) ────────────
describe('03 · one live row, other outlets unlimited', () => {
	test('two reply rows is an error naming the alternative', () => {
		const b = spec('demo:two-writes@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('save', C.createMessage.v1({ text: '', generating: true }))
			.outlet('save2', C.createMessage.v1({ text: '', generating: true }))
		const e = errorsFor(b, 'F7')
		assert.ok(e.some((x) => /as many as you like/.test(x.fix)))
	})

	test('one write plus many emits is fine, and the chain continues past the write', async () => {
		const doc = publish(
			spec('demo:emits@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
				.outlet('stream', ($) =>
					T.emitSocket.v1({ handle: 'chat:reply', from: $.generate.text }),
				)
				.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))
				.outlet('done', ($) =>
					T.emitSocket.v1({ handle: 'chat:complete', from: $.save.messageId }),
				),
		)
		const r = await run(doc, { input: {}, bindings: bindings(), world })
		assert.equal(r.outcome, 'ok')
		// row ids flowed downstream (F7)
		assert.equal(r.nodes.find((n) => n.nodeKey === 'done')!.result, 'ok')
	})
})

// ── 04 · No branching (F25) ─────────────────────────────────────────────────
describe('04 · no branching', () => {
	test('there is no branch method to call', () => {
		const b: any = spec('demo:nobranch@1', { version: '1.0.0' }).inlet(
			'input',
			C.userMessage.v1(),
		)
		assert.equal(typeof b.branch, 'undefined')
		assert.equal(typeof b.if, 'undefined')
	})
	test('fan-in from an earlier node is legal — it is a reference, not a branch', () => {
		const doc = publish(
			spec('demo:fanin@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
				.task('merge', ($) =>
					C.mergeCandidates.v1({ sources: [$.history.band, $.lore.hits] }),
				),
		)
		assert.equal(validate(doc).filter((f) => f.severity === 'error').length, 0)
	})
})

// ── 05 · Halt is not an error (01 §5) ───────────────────────────────────────
describe('05 · halt stops the run and records why', () => {
	test('a Task that halts ends the run as halt, not err', async () => {
		const doc = publish(
			spec('demo:halt@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('gate', ($) => C.gate.v1({ main: $.input.main }))
				.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
		)
		const r = await run(doc, {
			input: { modeId: 'dungeon' },
			world,
			bindings: bindings({
				'test:task/gate@1': async () => halt('chat type not applicable to this pipeline'),
			}),
		})
		assert.equal(r.outcome, 'halt')
		assert.equal(r.haltNodeKey, 'gate')
		assert.match(r.haltReason!, /not applicable/)
		// downstream never ran
		assert.equal(
			r.nodes.find((n) => n.nodeKey === 'generate'),
			undefined,
		)
	})
})

// ── 06 · Seeded randomness keeps Tasks pure and replay exact (F11) ──────────
describe('06 · dice rolls are seeded, so they replay', () => {
	const doc = () =>
		publish(
			spec('chariot.dice:roll@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('roll', C.roll.v1({ notation: '1d20' }))
				.oracle('narrate', C.generateText.v1({ connection: slot.connection() }))
				.outlet('save', ($) => C.createMessage.v1({ text: $.narrate.text })),
		)

	test('same seed, same roll', async () => {
		const a = await run(doc(), { input: {}, bindings: bindings(), world, seed: 'seed:abc' })
		const b = await run(doc(), { input: {}, bindings: bindings(), world, seed: 'seed:abc' })
		assert.deepEqual(
			a.nodes.find((n) => n.nodeKey === 'roll')!.output,
			b.nodes.find((n) => n.nodeKey === 'roll')!.output,
		)
	})

	test('different seed, different roll (usually) — and the seed is in the receipt', async () => {
		const a = await run(doc(), { input: {}, bindings: bindings(), world, seed: 'seed:1' })
		const b = await run(doc(), { input: {}, bindings: bindings(), world, seed: 'seed:99' })
		assert.equal(a.seed, 'seed:1')
		assert.notEqual(a.seed, b.seed)
	})

	test('a Task without declaresRandomness gets no random handle (F11)', async () => {
		const doc2 = publish(
			spec('demo:purity@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('gate', C.gate.v1()),
		)
		let sawRandom: boolean | undefined
		await run(doc2, {
			input: {},
			world,
			bindings: bindings({
				'test:task/gate@1': async (_i, ctx: any) => {
					sawRandom = typeof ctx.random === 'function'
					return ok({ main: 1 })
				},
			}),
		})
		assert.equal(sawRandom, false)
	})
})

// ── 07 · Queries have no network handle (16 §1) ─────────────────────────────
test('07 · a Query is handed no fetch, so it cannot reach the network', async () => {
	const doc = publish(
		spec('demo:querypurity@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('n', C.network.v1()),
	)
	const r = await run(doc, { input: {}, bindings: bindings(), world })
	assert.equal(r.outcome, 'ok')
	assert.equal(
		(r.nodes.find((n) => n.nodeKey === 'n')!.output as any).main,
		'no network handle available',
	)
})

// ── 08 · Async block, and forced-sequential equivalence (F26) ───────────────
describe('08 · async block equivalence', () => {
	const build = () =>
		spec('demo:gather@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('history', ($) =>
							C.sessionHistory.v1({ scope: $.input.sessionScope }),
						),
					)
					.chain('keyword', (c) =>
						c.query('triggers', ($) => C.lorebookTriggers.v1({ text: $.input.text })),
					)
					.chain('semantic', (c) =>
						c
							.oracle('embed', ($) =>
								C.embedText.v1({
									text: $.input.text,
									connection: slot.connection(),
								}),
							)
							.query('vsearch', ($) =>
								C.vectorSearch.v1({ vector: $.gather.semantic.embed.vector }),
							),
					),
			)
			.task('merge', ($) =>
				C.mergeCandidates.v1({
					sources: [
						$.gather.semantic.vsearch.hits,
						$.gather.keyword.triggers.hits,
						$.gather.history.history.band,
					],
				}),
			)

	test('parallel and forced-sequential produce identical results', async () => {
		const doc = publish(build())
		const par = await run(doc, { input: { text: 'hi' }, bindings: bindings(), world })
		const seq = await run(doc, {
			input: { text: 'hi' },
			bindings: bindings(),
			world,
			forceSequential: true,
		})
		const norm = (r: typeof par) =>
			r.nodes
				.map((n) => `${n.nodeKey}:${n.result}:${JSON.stringify(n.output)}`)
				.sort()
				.join('\n')
		assert.equal(norm(par), norm(seq))
		assert.equal(
			par.nodes.find((n) => n.nodeKey === 'gather.history.history')!.blockMode,
			'parallel',
		)
		assert.equal(
			seq.nodes.find((n) => n.nodeKey === 'gather.history.history')!.blockMode,
			'sequential',
		)
	})

	test('a write-class consumer inside a gather is allowed (01 §4, W1)', () => {
		const b = spec('demo:blockwrite@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.gather('blk', {}, (bb) =>
				bb.chain('c', (c) => c.outlet('save', C.createMessage.v1({ text: 'x' }))),
			)
		assert.deepEqual(errorsFor(b, '01 §4'), [])
	})
})

// ── 09 · Map, bounded, with equivalence (01 §4, F26) ────────────────────────
describe('09 · map over chunks', () => {
	const build = (max = 64) =>
		spec('demo:summarize@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('chunks', ($) => T.chunkText.v1({ text: $.input.text }))
			.each('summarize', { over: ($) => $.chunks.items, max, mode: 'parallel' }, (m) =>
				m.oracle('sum', C.generateText.v1({ connection: slot.connection() })),
			)
			.task('collect', ($) => T.toCandidates.v1({ items: $.summarize.values }))
			.task('prompt', ($) => C.assemble.v2({ candidates: $.collect.candidates }))

	test('publishes with a declared max', () => {
		assert.doesNotThrow(() => publish(build()))
	})

	test('an unbounded map is an error that says why', () => {
		const e = errorsFor(build(0), '01 §4')
		assert.equal(e.length, 1)
		assert.match(e[0]!.fix, /surprise bill/)
	})
})

// ── 10 · Streaming: static compatibility and declared early exit (01 §11) ───
describe('10 · streaming', () => {
	test('whether an edge streams is decided at publish and readable off the document', () => {
		const doc = publish(
			spec('demo:stream@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
				.task('first', ($) => T.firstJson.v1({ main: $.generate.text })),
		)
		const edge = doc.edges.find((e) => e.from === 'generate' && e.to === 'first')!
		assert.equal(edge.streaming, true, 'the document says this edge streams')
		const settled = doc.edges.find((e) => e.from === 'inlet')
		assert.notEqual(settled?.streaming, true)
	})

	test('earlyExit on a settled input is a warning — there is nothing to exit early from', () => {
		const b = spec('demo:pointless-early@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('text', ($) => T.messageText.v1({ messageId: $.input.main }))
			.task('first', ($) => T.firstJson.v1({ main: $.text.plain }))
		const f = findings(b).filter((x) => x.law === 'F22')
		assert.equal(f.length, 1)
		assert.match(f[0]!.fix, /nothing to exit early from/)
	})
})

// ── 11 · Timeouts bound execution, never waiting (F36) ──────────────────────
describe('11 · timeouts', () => {
	test('a hook that overruns yields a routable err(timeout), recorded with the limit', async () => {
		const doc = publish(
			spec('demo:timeout@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('slow', C.slow.v1()),
		)
		const r = await run(doc, { input: {}, bindings: bindings(), world })
		const n = r.nodes.find((x) => x.nodeKey === 'slow')!
		assert.equal(r.outcome, 'err')
		assert.equal(n.timedOut, true)
		assert.equal(n.timeoutMsApplied, 30)
		assert.match(n.reason!, /timeout after 30ms/)
	})

	test('the admin ceiling wins over a descriptor default', async () => {
		const doc = publish(
			spec('demo:ceiling@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('h', C.sessionHistory.v1()),
		)
		const r = await run(doc, { input: {}, bindings: bindings(), world, timeoutCeilingMs: 5 })
		assert.equal(r.nodes.find((n) => n.nodeKey === 'h')!.timeoutMsApplied, 5)
	})

	test('waiting is not execution — a long simulated wait does not trip a timeout', async () => {
		const clock = fakeClock()
		const doc = publish(
			spec('demo:park@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('gate', C.gate.v1()),
		)
		const r = await run(doc, {
			input: {},
			world,
			now: clock.now,
			bindings: bindings({
				'test:task/gate@1': async () => {
					clock.advance(1000 * 60 * 60 * 24 * 7) // a week parked at a review gate
					return ok({ main: 'approved' })
				},
			}),
		})
		assert.equal(r.outcome, 'ok')
		assert.equal(r.nodes.find((n) => n.nodeKey === 'gate')!.timedOut, undefined)
	})
})

// ── 12 · Budgets meter consumption, never waiting (F13) ─────────────────────
describe('12 · budgets', () => {
	test('a token budget trips on consumption', async () => {
		const doc = publish(
			spec('demo:budget@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle('a', C.generateText.v1({ connection: slot.connection() }))
				.oracle('b', C.generateText.v1({ connection: slot.connection() })),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world,
			budget: { tokens: 300 },
		})
		assert.equal(r.outcome, 'err')
		assert.match(r.haltReason!, /token budget exceeded/)
	})

	test('a long wait consumes nothing', async () => {
		const clock = fakeClock()
		const doc = publish(
			spec('demo:waitfree@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('gate', C.gate.v1()),
		)
		const r = await run(doc, {
			input: {},
			world,
			now: clock.now,
			budget: { tokens: 1 },
			bindings: bindings({
				'test:task/gate@1': async () => {
					clock.advance(999_999)
					return ok({ main: 1 })
				},
			}),
		})
		assert.equal(r.outcome, 'ok')
		assert.equal(r.consumption.tokens, 0)
	})
})

// ── 13 · Config scope chain, per slot (12 §2, F20; R-10) ────────────────────
describe('13 · configuration resolves per slot through four layers', () => {
	test('session beats preset beats defaults, path by path', () => {
		const resolved = resolveConfig(
			{
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: 'temperature',
						value: 0.2,
						scopeKind: 'defaults',
					},
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: 'temperature',
						value: 0.7,
						scopeKind: 'config',
					},
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: 'temperature',
						value: 1.1,
						scopeKind: 'session',
						scopeId: 991,
					},
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: 'top_p',
						value: 0.9,
						scopeKind: 'config',
					},
				],
			},
			['generate'],
		)
		assert.equal(resolved['generate']!['sampling']!['temperature'], 1.1)
		assert.equal(resolved['generate']!['sampling']!['top_p'], 0.9)
	})

	test("a session's prompt override does not shadow the config's connection (F20)", () => {
		const resolved = resolveConfig(
			{
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'prompts',
						path: 'system',
						value: 'be terse',
						scopeKind: 'session',
						scopeId: 42,
					},
					{
						nodeKey: 'generate',
						slot: 'connection',
						path: SLOT_VALUE,
						value: 'ollama-local',
						scopeKind: 'config',
					},
				],
			},
			['generate'],
		)
		assert.equal(resolved['generate']!['prompts']!['system'], 'be terse')
		assert.equal(resolved['generate']!['connection']![SLOT_VALUE], 'ollama-local')
	})

	test('the chain is exactly session · config · defaults · author (R-10)', () => {
		// `user` and `instance` were in the list and pushed by nothing; the
		// config an admin edits IS the instance's configuration (ruled
		// 2026-08-24, folded 2026-09-16). A scope the SDK does not know is not a
		// scope a host may write at.
		assert.deepEqual(SCOPE_ORDER, ['session', 'config', 'defaults', 'author'])
		assert.equal(mayWrite('connection', 'defaults'), false)
		assert.equal(mayWrite('connection', 'config'), true)
		assert.equal(mayWrite('prompts', 'session'), true)
		assert.equal(mayWrite('template', 'session'), false)
		assert.throws(() => assertWritable('connection', 'defaults'), /admin-only/)
	})

	test('a session names no connection; its sampling is its own (ruled 2026-09-30)', () => {
		assert.equal(mayWrite('connection', 'session'), false)
		assert.throws(
			() => assertWritable('connection', 'session'),
			/A session never picks its own connection/,
		)
		assert.equal(mayWrite('sampling', 'session'), true)
		assert.doesNotThrow(() => assertWritable('sampling', 'session'))
	})

	test('resolution reports which layer won, and agrees with the plain resolver', () => {
		// The UI needs the label, not only the value: "I changed this and nothing
		// happened" is answerable only if the resolver says an admin pinned it.
		// Asserting the two agree is what stops the labelled path becoming a second
		// implementation that drifts from the one execution uses.
		const w = {
			...world,
			authorDefaults: { generate: { params: { stopSequences: [] } } },
			overrides: [
				{
					nodeKey: 'generate',
					slot: 'sampling',
					path: 'temperature',
					value: 0.2,
					scopeKind: 'defaults' as const,
				},
				{
					nodeKey: 'generate',
					slot: 'sampling',
					path: 'temperature',
					value: 0.7,
					scopeKind: 'session' as const,
					scopeId: 42,
				},
				{
					nodeKey: 'generate',
					slot: 'prompts',
					path: 'system',
					value: 'be terse',
					scopeKind: 'config' as const,
				},
			],
		}
		const sourced = resolveConfigSources(w, ['generate'])
		assert.equal(sourced['generate']!['sampling']!['temperature']!.scopeKind, 'session')
		assert.equal(sourced['generate']!['sampling']!['temperature']!.scopeId, 42)
		assert.equal(sourced['generate']!['prompts']!['system']!.scopeKind, 'config')
		assert.equal(sourced['generate']!['params']!['stopSequences']!.scopeKind, 'author')

		const plain = resolveConfig(w, ['generate'])
		for (const [slot, paths] of Object.entries(sourced['generate']!))
			for (const [path, resolved] of Object.entries(paths))
				assert.deepEqual(
					plain['generate']![slot]?.[path],
					resolved.value,
					`${slot}.${path}`,
				)
	})

	test('a path containing a space resolves as itself (12 §2)', () => {
		// Paths were grouped by joining slot and path with a space and splitting
		// back, so a declared field named 'opening line' resolved against the path
		// 'opening' — matching nothing, silently, for whoever declared it. No core
		// field has a space; nothing stops a plugin's from having one.
		const resolved = resolveConfig(
			{
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'prompts',
						path: 'opening line',
						value: 'Once upon',
						scopeKind: 'session' as const,
					},
				],
			},
			['generate'],
		)
		assert.equal(resolved['generate']!['prompts']!['opening line'], 'Once upon')
	})
})

// ── 14 · Sampling: referenced, overridable, and honestly reported (12 §2) ───
describe('14 · sampling', () => {
	test('a referenced config is delivered, a single field can be overridden on top', async () => {
		const doc = publish(
			spec('demo:sampling@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle(
					'generate',
					C.generateText.v1({ connection: slot.connection(), sampling: slot.sampling() }),
				),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world: {
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_creative',
						scopeKind: 'config',
					},
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: 'temperature',
						value: 0.5,
						scopeKind: 'session',
						scopeId: 991,
					},
				],
			},
		})
		const n = r.nodes.find((x) => x.nodeKey === 'generate')!
		assert.equal(n.samplingApplied!['temperature'], 0.5) // chat override wins
		assert.equal(n.samplingApplied!['top_p'], 0.95) // from the referenced preset
	})

	test("a config's switched-off samplers do not reach the provider", async () => {
		// The direct path has always applied the switchboard; slot resolution did
		// not, because the world had nowhere to carry it. A sampler turned off in
		// the sidebar went on being sent whenever a pipeline was what asked, and
		// the only symptom was generation not matching the settings on screen.
		const doc = publish(
			spec('demo:switched@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle(
					'generate',
					C.generateText.v1({ connection: slot.connection(), sampling: slot.sampling() }),
				),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world: {
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_switched',
						scopeKind: 'config',
					},
				],
			},
		})
		const n = r.nodes.find((x) => x.nodeKey === 'generate')!
		// Two different reasons a sampler can be absent from `samplingApplied`,
		// and reporting both exists precisely because they are not the same
		// thing: delivered-but-unhonoured is the connection's limitation and gets
		// recorded, while never-delivered is the user's choice and leaves no trace.
		assert.equal(n.samplingApplied!['temperature'], 0.4) // on, stored value
		assert.ok(
			n.samplingIgnored!.includes('topP'),
			'on with no stored value: its declared default is still delivered, and ' +
				'this fixture connection happens not to honour it',
		)
		assert.equal('topK' in n.samplingApplied!, false)
		assert.equal(
			n.samplingIgnored!.includes('topK'),
			false,
			'switched off: never sent, so there is nothing to report ignoring',
		)
	})

	test('a node override sits above the switchboard, not under it', async () => {
		// Switching a sampler off says "do not send my stored value"; a spec
		// naming one for this node is stating it outright. The second has to win,
		// or a pipeline could never set a parameter its chosen config had off.
		const doc = publish(
			spec('demo:switched-override@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle(
					'generate',
					C.generateText.v1({ connection: slot.connection(), sampling: slot.sampling() }),
				),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world: {
				...world,
				// A connection that honours topK, so the delivered VALUE is
				// visible in `samplingApplied` rather than just its key in the
				// ignored list — the value is the half this test is about.
				connections: world.connections.map((c) =>
					c.id === 'ollama-local'
						? {
								...c,
								metadata: {
									...c.metadata,
									supportedSamplers: ['temperature', 'topK'],
								},
							}
						: c,
				),
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_switched',
						scopeKind: 'config',
					},
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: 'topK',
						value: 12,
						scopeKind: 'session',
						scopeId: 991,
					},
				],
			},
		})
		// Delivered despite being switched off in the config — which is exactly
		// what "above the switchboard" means. The switchboard winning would have
		// left topK out entirely.
		const n = r.nodes.find((x) => x.nodeKey === 'generate')!
		assert.equal(n.samplingApplied!['topK'], 12)
	})

	test('a world with no switchboard at all is still read as all-on', async () => {
		// Every config written before `enabled` existed, and every plugin-supplied
		// world that has not learned about it.
		const doc = publish(
			spec('demo:legacy-sampling@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle(
					'generate',
					C.generateText.v1({ connection: slot.connection(), sampling: slot.sampling() }),
				),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world: {
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_creative',
						scopeKind: 'config',
					},
				],
			},
		})
		const applied = r.nodes.find((x) => x.nodeKey === 'generate')!.samplingApplied!
		assert.equal(applied['temperature'], 0.92)
		assert.equal(applied['top_p'], 0.95)
	})

	test('samplers the adapter cannot honour are recorded as ignored, not dropped silently', async () => {
		const doc = publish(
			spec('demo:ignored@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle(
					'generate',
					C.generateText.v1({ connection: slot.connection(), sampling: slot.sampling() }),
				),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world: {
				...world,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_creative',
						scopeKind: 'config',
					},
				],
			},
		})
		assert.deepEqual(r.nodes.find((x) => x.nodeKey === 'generate')!.samplingIgnored, [
			'mirostat_tau',
		])
	})
})

// ── 15 · Connection material never leaves core (01 §10, F18) ────────────────
test('15 · a node sees connection metadata but never material', async () => {
	const doc = publish(
		spec('demo:material@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
	)
	let seen: any
	const r = await run(doc, {
		input: {},
		world,
		bindings: bindings({
			'core:oracle/generate-text@1': async (i: any) => {
				seen = i.connection
				return ok({ main: 'x', text: 'x' })
			},
		}),
	})
	assert.equal(seen.metadata.contextLength, 4096)
	assert.equal(seen.material, undefined)
	assert.equal(JSON.stringify(r).includes('SECRET-DO-NOT-LEAK'), false)
})

// ── 16 · Budget as forward-flowing data + publish-time resolution (F35) ─────
describe('16 · the context budget flows forward', () => {
	const build = () =>
		spec('demo:budgetflow@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('budget', C.contextBudget.v1({ connection: slot.downstreamOracle() }))
			.query('history', ($) => C.sessionHistory.v1({ budget: $.budget.available }))
			.task('prompt', ($) =>
				C.assemble.v2({ budget: $.budget.available }),
			)
			.oracle('generate', C.generateText.v1({ connection: slot.connection() }))

	test('downstreamOracle resolves at publish and is stored explicitly', () => {
		const doc = publish(build())
		const budgetNode = doc.nodes.find((n) => n.key === 'budget')!
		assert.equal(budgetNode.resolvedRefs!['connection'], 'generate')
	})

	test('the resolved metadata reaches the query as data', async () => {
		const doc = publish(build())
		const r = await run(doc, { input: {}, bindings: bindings(), world })
		assert.equal(
			(r.nodes.find((n) => n.nodeKey === 'budget')!.output as any).available,
			4096 - 512,
		)
	})

	test('no Provider downstream is a publish error naming the fix', () => {
		const b = spec('demo:noprovider@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('budget', C.contextBudget.v1({ connection: slot.downstreamOracle() }))
		assert.throws(() => compile(b.build()), /no Provider downstream|oracleRef/)
	})
})

// ── 17 · Queries declare, Assemble resolves (16 §5a) ────────────────────────
test('17 · assemble reads declared weights off its inputs, so adding a source needs no edit', async () => {
	const doc = publish(
		spec('demo:alloc@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
			.task('merge', ($) =>
				C.mergeCandidates.v1({ sources: [$.history.band, $.lore.hits] }),
			)
			.task('prompt', ($) => C.assemble.v2({ candidates: $.merge.candidates })),
	)
	const r = await run(doc, { input: { text: 'hi' }, bindings: bindings(), world })
	const alloc = (r.nodes.find((n) => n.nodeKey === 'prompt')!.output as any).main.alloc
	const lore = alloc.find((a: any) => a.sourceKey === 'lore')
	assert.equal(lore.weight, 0.35)
	assert.ok(lore.included >= lore.minInclude, 'minimum inclusion honoured')
})

// ── 18 · RAG vs keyword: strategy is a policy, not a branch (16 §2) ─────────
describe('18 · retrieval strategy', () => {
	const build = () =>
		spec('demo:strategy@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('embed', ($) =>
				C.embedText.v1({ text: $.input.text, connection: slot.connection() }),
			)
			.query('vsearch', ($) => C.vectorSearch.v1({ vector: $.embed.vector }))
			.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
			.task('merge', ($) => C.mergeCandidates.v1({ sources: [$.vsearch.hits, $.lore.hits] }))

	test('no embeddings connection: embed returns null, auto resolves to keyword, nothing is skipped', async () => {
		const doc = publish(build())
		const r = await run(doc, { input: { text: 'hi' }, bindings: bindings(), world })
		const embed = r.nodes.find((n) => n.nodeKey === 'embed')!
		assert.equal(embed.result, 'ok')
		assert.equal((embed.output as any).vector, null)
		assert.match(embed.notes!.join(), /no active embeddings connection/)
		assert.equal(
			(r.nodes.find((n) => n.nodeKey === 'merge')!.output as any).strategyResolved,
			'keyword',
		)
	})

	test('with an embeddings connection, auto resolves to vector', async () => {
		const doc = publish(build())
		const r = await run(doc, {
			input: { text: 'hi' },
			bindings: bindings(),
			world: withEmbeddings(),
		})
		assert.equal(
			(r.nodes.find((n) => n.nodeKey === 'merge')!.output as any).strategyResolved,
			'vector',
		)
	})
})

// ── 19 · Ranking is swappable because it is a node (16 §5c) ─────────────────
test('19 · a plugin ranker substitutes for core with no other change', async () => {
	const build = (ranker: any) =>
		publish(
			spec('demo:rank@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text }))
				.task('rank', ($) => ranker.v1({ candidates: $.lore.hits })),
		)
	for (const ranker of [C.rankHybrid, C.rankRecall]) {
		const r = await run(build(ranker), { input: { text: 'x' }, bindings: bindings(), world })
		assert.equal(r.outcome, 'ok')
	}
})

// ── 20 · Fragments expand at publish, keys namespaced (16 §3a) ──────────────
test('20 · an included fragment expands to flat, namespaced rows', () => {
	const ctxInfill = fragment('core:fragment/context-infill@2', (f) =>
		f
			.query('history', C.sessionHistory.v1())
			.query('lore', C.lorebookTriggers.v1())
			.task('merge', C.mergeCandidates.v1()),
	)
	const doc = publish(
		spec('demo:fragment@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.include('ctx', ctxInfill)
			.task('prompt', ($) => C.assemble.v2({ candidates: $.ctx.merge.candidates })),
	)
	assert.deepEqual(
		doc.nodes.map((n) => n.key),
		['input', 'ctx.history', 'ctx.lore', 'ctx.merge', 'prompt'],
	)
	assert.equal(doc.includes[0]!.fragmentId, 'core:fragment/context-infill@2')
})

// ── 21 · Document round-trip identity (F3) ──────────────────────────────────
test('21 · import(export(rows)) is identity, and the hash is stable', () => {
	const doc = publish(
		spec('demo:roundtrip@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.outlet('save', C.createMessage.v1({ text: 'x' })),
	)
	const round = importDocument(doc)
	assert.equal(canonical(round), canonical(doc))
	assert.equal(canonicalHash(round), canonicalHash(doc))
})

// ── 22 · Only core emits events (F8) ────────────────────────────────────────
describe('22 · events', () => {
	test('core emits because a write happened; the node declares nothing', async () => {
		const doc = publish(
			spec('demo:event@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('save', C.createMessage.v1({ text: 'hello' })),
		)
		const r = await run(doc, {
			input: {},
			bindings: bindings(),
			world,
			subscribers: { 'core:event/message-created@1': 1 },
		})
		assert.deepEqual(r.emitted, [
			{ event: 'core:event/message-created@1', cause: 'save', subscribers: 1 },
		])
	})

	test('a node declaring emits is rejected, and the error explains the model', () => {
		const b = spec('demo:emit@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('save', C.createMessage.v1({ text: 'x', emits: ['whatever'] }))
		const e = errorsFor(b, 'F8')
		assert.equal(e.length, 1)
		assert.match(e[0]!.fix, /no node emits: a write causes the event its outlet declares/)
	})
})

// ── 23 · Replay is deterministic and never re-infers (F16) ──────────────────
test('23 · replay reproduces the run from the receipt without calling the provider', async () => {
	const doc = publish(
		spec('demo:replay@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
			.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text })),
	)
	const first = await run(doc, { input: {}, bindings: bindings(), world, seed: 'seed:xyz' })

	let called = 0
	const replayed = await replay(
		doc,
		first,
		bindings({
			'core:oracle/generate-text@1': async () => {
				called++
				return ok({ main: 'DIFFERENT', text: 'DIFFERENT' })
			},
		}),
	)
	assert.equal(called, 0, 'the provider must not be called during replay')
	assert.equal(
		(replayed.nodes.find((n) => n.nodeKey === 'generate')!.output as any).text,
		'the reply text',
	)
	assert.equal(replayed.seed, 'seed:xyz')
})

// ── 24 · Provider-agnostic: three modalities, one structure (17 §1) ─────────
describe('24 · modality agnosticism', () => {
	test('a TTS pipeline is structurally identical to a chat turn', async () => {
		const doc = publish(
			spec('chariot.tts:speak-reply@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('text', ($) => T.messageText.v1({ messageId: $.input.messageId }))
				.oracle('audio', ($) =>
					T.speak.v1({
						text: $.text.plain,
						connection: slot.connection(),
						sampling: slot.sampling(),
					}),
				)
				.outlet('attach', ($) => C.attachAudio.v1({ audio: $.audio.audio })),
		)
		const r = await run(doc, {
			input: { messageId: 'm1' },
			bindings: bindings(),
			world,
			triggerSource: 'event',
			triggerRef: 'core:event/message-created@1',
		})
		assert.equal(r.outcome, 'ok')
		assert.equal(r.triggerSource, 'event')
	})

	test('an image-gen pipeline uses the same four slots on a plugin Provider', async () => {
		const doc = publish(
			spec('chariot.comfy:illustrate@1', { version: '2.1.0' })
				.inlet('input', C.userMessage.v1())
				.task('scene', C.assemble.v2({ candidates: [] }))
				.oracle('render', ($) =>
					C.renderImage.v1({
						context: $.scene.context,
						connection: slot.connection(),
						sampling: slot.sampling(),
					}),
				)
				.outlet('attach', ($) => C.attachImage.v1({ image: $.render.image })),
		)
		// attachImage declares reviewDefault: 'on', so the gate fires here too — the
		// author raised the floor and nothing about image-gen made that a special case.
		const r = await run(doc, {
			input: { messageId: 'm1' },
			bindings: bindings(),
			world,
			reviewer: async () => ({ action: 'approve', by: 'jody', at: 1 }),
		})
		assert.equal(r.outcome, 'ok')
		assert.equal(r.reviews!.find((x) => x.nodeKey === 'attach')!.position, 'on')
	})

	test('an MCP tool is an oracle, effectful, and gateable like any other', async () => {
		const doc = publish(
			spec('demo:mcp@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle(
					'tool',
					T.mcpTool.v1({ args: { path: '/tmp/x' }, connection: slot.connection() }),
				),
		)
		const r = await run(doc, { input: {}, bindings: bindings(), world })
		assert.equal(r.outcome, 'ok')
		// effects: 'external' is what the review gate keys on (01 §7), not the kind
		assert.equal(r.nodes.find((n) => n.nodeKey === 'tool')!.kind, 'oracle')
	})
})

// ── Cross-cutting: every error names an alternative (15 §1.3) ───────────────
test('every validation error states what to do instead', () => {
	const specs = [
		spec('x:1@1', { version: '1' })
			.inlet('i', C.userMessage.v1())
			.outlet('a', C.createMessage.v1())
			.outlet('b', C.createMessage.v1()),
		spec('x:2@1', { version: '1' })
			.inlet('i', C.userMessage.v1())
			.gather('b', {}, (bb) => bb.chain('c', (c) => c.outlet('w', C.createMessage.v1()))),
		spec('x:3@1', { version: '1' })
			.inlet('i', C.userMessage.v1())
			.each('m', { over: [], max: 0 }, (c) => c.task('t', C.gate.v1())),
		spec('x:4@1', { version: '1' })
			.inlet('i', C.userMessage.v1())
			.outlet('e', C.createMessage.v1({ emits: ['x'] })),
		spec('x:5@1', { version: '1' })
			.inlet('i', C.userMessage.v1())
			.task('t', C.badToggleable.v1()),
	]
	for (const s of specs) {
		for (const f of findings(s).filter((x) => x.severity === 'error')) {
			assert.ok(
				f.fix && f.fix.length > 20,
				`[${f.law}] "${f.message}" has no usable fix text`,
			)
		}
	}
})

// ── Documentation: what a receipt actually looks like ───────────────────────
test('a full chat turn renders a legible receipt', async () => {
	const doc = publish(
		spec('core:spec/chat-turn@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('budget', C.contextBudget.v1({ connection: slot.downstreamOracle() }))
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('history', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								budget: $.budget.available,
							}),
						),
					)
					.chain('keyword', (c) =>
						c.query('triggers', ($) => C.lorebookTriggers.v1({ text: $.input.text })),
					)
					.chain('semantic', (c) =>
						c
							.oracle('embed', ($) =>
								C.embedText.v1({
									text: $.input.text,
									connection: slot.connection(),
								}),
							)
							.query('vsearch', ($) =>
								C.vectorSearch.v1({ vector: $.gather.semantic.embed.vector }),
							),
					),
			)
			.task('merge', ($) =>
				C.mergeCandidates.v1({
					sources: [
						$.gather.semantic.vsearch.hits,
						$.gather.keyword.triggers.hits,
						$.gather.history.history.band,
					],
				}),
			)
			.task('rank', ($) => C.rankHybrid.v1({ candidates: $.merge.candidates }))
			.task('prompt', ($) =>
				C.assemble.v2({ candidates: $.rank.candidates, budget: $.budget.available }),
			)
			.oracle('generate', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
				}),
			)
			.outlet('stream', ($) =>
				T.emitSocket.v1({ handle: 'chat:reply', from: $.generate.text }),
			)
			.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))
			.outlet('done', ($) =>
				T.emitSocket.v1({ handle: 'chat:complete', from: $.save.messageId }),
			),
	)

	const r = await run(doc, {
		input: { text: 'where is my sister', sessionScope: 'chat:991' },
		bindings: bindings(),
		world: {
			...world,
			overrides: [
				{
					nodeKey: 'generate',
					slot: 'sampling',
					path: SLOT_VALUE,
					value: 'cfg_creative',
					scopeKind: 'config',
				},
			],
		},
		seed: 'seed:demo',
		actorUserId: '42',
		subscribers: { 'core:event/message-created@1': 1 },
	})

	assert.equal(r.outcome, 'ok')
	assert.equal(r.nodes.length, 13)
	const rendered = renderReceipt(r)
	assert.match(rendered, /no active embeddings connection/)
	assert.match(rendered, /ignored samplers: mirostat_tau/)
	assert.match(rendered, /core emitted core:event\/message-created@1/)
	if (process.env.SHOW_RECEIPT) console.log('\n' + rendered + '\n')
})
