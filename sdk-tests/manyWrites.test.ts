/**
 * PLAN-turn-order R44 / §8 (24), unit W1: pipelines are not limited to one
 * write. What the old law (F7 / C21, "one write per pipeline, and no write
 * inside a clause") protected is kept by a narrower rule:
 *
 * - at most ONE LIVE ROW per run — a `liveRow` outlet's write that is still
 *   being written (`generating`, or a claimed `row`): the row a stream lands
 *   in and Stop finalises — and any number of other writes, complete
 *   messages included;
 * - writes are allowed inside clauses, bounded by the clause's `max`; a
 *   live-row outlet inside an `each` or a `loop` is refused (N live rows);
 * - a second MESSAGE write on the live row's channel is refused (owner ruled
 *   2026-09-23) — the racing-rows failure C21 named.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { spec, run, ok, S, pin, describeOutletDefinition, describeTaskDefinition, slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { findings, publish, bindings, world } from './helpers.js'

const errorsOf = (b: any, law?: string) =>
	findings(b).filter((f: any) => f.severity === 'error' && (!law || f.law === law))

describe('W1 · many writes, one live row', () => {
	test('a reply plus an annex write in one run is fine — two writes, one live row', () => {
		const b = spec('w1:spec/reply-and-annex', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', ($) => C.createMessage.v1({ text: $.input.text }))
			.outlet('remember', ($) => C.setSessionAnnex.v1({ value: { clock: 1 } as never }))
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('two live rows are refused once, naming both and the fix — even on different channels', () => {
		const b = spec('w1:spec/two-live', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('first', ($) => C.createMessage.v1({ text: '', generating: true }))
			.outlet('second', ($) => C.createMessage.v1({ text: '', generating: true, channel: 'notes' as never }))
		const f7 = errorsOf(b, 'F7')
		assert.equal(f7.length, 1, f7.map((f: any) => f.message).join('\n'))
		assert.match(f7[0]!.message, /at most one live row; found 2 \(first, second\)/)
		assert.ok((f7[0]!.fix ?? '').length > 10)
	})

	/**
	 * Amended 2026-09-28 (lair pass R8): one live row per EXECUTION PATH, as
	 * the streaming law reads (W2). Two live-row outlets in mutually exclusive
	 * branches of one junction never run in one execution, so each is that
	 * path's one live row; a `truthy` beside a different `truthy` could both
	 * fire, and is still refused.
	 */
	test('live rows in exclusive branches are one per path; branches that could both fire are refused', () => {
		const exclusive = spec('w1:spec/live-per-path', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.junction('via', { on: ($: any) => $.input.via }, (v) =>
				v
					.when('narrate', { equals: 'narrate' }, (n) =>
						n.outlet('row', () => C.createMessage.v1({ text: '', generating: true })),
					)
					.otherwise('turn', (t) =>
						t.outlet('row', () => C.createMessage.v1({ text: '', generating: true })),
					),
			)
		assert.deepEqual(errorsOf(exclusive, 'F7'), [])
		const both = spec('w1:spec/live-both', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.junction('a', { on: ($: any) => $.input.text }, (j) =>
				j.when('one', { truthy: true }, (c) =>
					c.outlet('row', () => C.createMessage.v1({ text: '', generating: true })),
				),
			)
			.junction('b', { on: ($: any) => $.input.channel }, (j) =>
				j.when('two', { truthy: true }, (c) =>
					c.outlet('row', () => C.createMessage.v1({ text: '', generating: true })),
				),
			)
		const f7 = errorsOf(both, 'F7')
		assert.equal(f7.length, 1)
		assert.match(f7[0]!.message, /at most one live row; found 2 \(a\.one\.row, b\.two\.row\)/)
	})

	test('a complete message on the live row\'s channel in an exclusive branch races nothing', () => {
		const b = spec('w1:spec/exclusive-beside', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.junction('via', { on: ($: any) => $.input.via }, (v) =>
				v
					.when('narrate', { equals: 'narrate' }, (n) =>
						n.outlet('row', () => C.createMessage.v1({ text: '', generating: true })),
					)
					.otherwise('turn', (t) => t.outlet('line', ($) => C.createMessage.v1({ text: $.input.text }))),
			)
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('two live rows on one channel are one finding, not two', () => {
		const b = spec('w1:spec/two-live-main', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('first', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('second', () => C.createMessage.v1({ text: '', generating: true }))
		assert.equal(errorsOf(b, 'F7').length, 1)
	})

	test('a complete message on another channel beside the reply row is an ordinary write', () => {
		// The guide's board game: the opponent speaks on main, the board is
		// posted whole on `board`, in one run.
		const b = spec('w1:spec/reply-and-board', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('placeholder', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('board', ($) => C.createMessage.v1({ text: $.input.text, channel: 'board' as never }))
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('two complete messages are two ordinary writes — no live row, nothing to race', () => {
		const b = spec('w1:spec/two-complete', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('first', ($) => C.createMessage.v1({ text: $.input.text }))
			.outlet('second', ($) => C.createMessage.v1({ text: $.input.text, channel: 'notes' as never }))
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('an update of the live row is the same row, not a second one', () => {
		const b = spec('w1:spec/placeholder-save', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('placeholder', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('save', ($) => C.updateMessage.v1({ target: $.placeholder.main, text: $.input.text } as never))
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('a second message on the live row\'s channel is refused — both unset means both main', () => {
		const b = spec('w1:spec/two-on-main', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('greet', () => C.seedGreetings.v1({}))
		const f7 = errorsOf(b, 'F7')
		assert.ok(
			f7.some((f: any) => /'greet' writes a message on channel 'main', the live row's channel/.test(f.message)),
			f7.map((f: any) => f.message).join('\n'),
		)
	})

	test('a complete message on the live row\'s channel is refused too, and channels compare canonically', () => {
		const b = spec('w1:spec/complete-on-main', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('aside', ($) => C.createMessage.v1({ text: $.input.text, channel: 'main:1' as never }))
		const f7 = errorsOf(b, 'F7')
		assert.equal(f7.length, 1, f7.map((f: any) => f.message).join('\n'))
		assert.match(f7[0]!.message, /'aside' writes a message on channel 'main'/)
	})

	/**
	 * Amended 2026-09-27 (lair pass B16, owner D1a): a message races the live
	 * row only while the row is still being written. After the write that
	 * finishes it, a message on its channel lands after it — the Lair's
	 * narrator row, then a row per speaking delver.
	 */
	test('a message after the write that finishes the live row is fine — spine and each alike', () => {
		const b = spec('w1:spec/after-the-finish', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('save', ($) => C.updateMessage.v1({ target: $.reply.messageId, text: $.input.text }))
			.outlet('aside', ($) => C.createMessage.v1({ text: $.input.text }))
			.each('e', { over: [1, 2], max: 4 }, (c) =>
				c.outlet('line', ($: any) => C.createMessage.v1({ text: $.input.text })),
			)
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('a message between the live row and its finish still races it', () => {
		const b = spec('w1:spec/before-the-finish', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('aside', ($) => C.createMessage.v1({ text: $.input.text }))
			.outlet('save', ($) => C.updateMessage.v1({ target: $.reply.messageId, text: $.input.text }))
		const f7 = errorsOf(b, 'F7')
		assert.equal(f7.length, 1, f7.map((f: any) => f.message).join('\n'))
		assert.match(f7[0]!.message, /'aside' writes a message on channel 'main'/)
	})

	test('a message in a branch beside the finishing write is not after it', () => {
		const b = spec('w1:spec/beside-the-finish', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', () => C.createMessage.v1({ text: '', generating: true }))
			.gather('g', { mode: 'parallel' }, (g) =>
				g
					.chain('a', (c) =>
						c.outlet('save', ($: any) =>
							C.updateMessage.v1({ target: $.reply.messageId, text: $.input.text }),
						),
					)
					.chain('b', (c) =>
						c.outlet('aside', ($: any) => C.createMessage.v1({ text: $.input.text })),
					),
			)
		const f7 = errorsOf(b, 'F7')
		assert.equal(f7.length, 1, f7.map((f: any) => f.message).join('\n'))
	})

	test('a message on another channel beside the live row is fine', () => {
		const b = spec('w1:spec/other-channel', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('reply', () => C.createMessage.v1({ text: '', generating: true }))
			.outlet('greet', () => C.seedGreetings.v1({ channel: 'notes' as never }))
		assert.deepEqual(errorsOf(b, 'F7'), [])
	})

	test('writes inside a gather and an each are allowed when none is the live row', () => {
		const b = spec('w1:spec/writes-in-clauses', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.gather('g', {}, (g) =>
				g.chain('a', (c) => c.outlet('save', () => C.setSessionAnnex.v1({ value: { clock: 1 } as never }))),
			)
			.each('e', { over: [1, 2], max: 4 }, (c) =>
				c.outlet('note', () => C.setSessionAnnex.v1({ value: { clock: 1 } as never })),
			)
		assert.deepEqual(errorsOf(b).filter((f: any) => ['F7', '01 §4'].includes(f.law)), [])
	})

	test('a complete message inside an each is an ordinary write, one per pass', () => {
		const b = spec('w1:spec/complete-in-each', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.each('e', { over: [1, 2], max: 4 }, (c) =>
				c.outlet('note', () => C.createMessage.v1({ text: 'x', channel: 'notes' as never })),
			)
		assert.deepEqual(errorsOf(b).filter((f: any) => ['F7', '01 §4'].includes(f.law)), [])
	})

	test('a live-row outlet inside an each is refused — it would be N live rows', () => {
		const b = spec('w1:spec/live-in-each', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.each('e', { over: [1, 2], max: 4 }, (c) =>
				c.outlet('reply', () => C.createMessage.v1({ text: '', generating: true })),
			)
		const errs = errorsOf(b, '01 §4')
		assert.ok(
			errs.some((f: any) => /live-row outlet 'e\.item\.reply' is inside each 'e'/.test(f.message) || /live-row outlet .*reply' is inside each 'e'/.test(f.message)),
			errs.map((f: any) => f.message).join('\n'),
		)
	})
})

describe('W1 · the run: every write lands, in order, each causing its event', () => {
	const annexed = spec('w1:spec/two-writes-run', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.outlet('reply', ($) => C.createMessage.v1({ text: $.input.text }))
		.outlet('remember', ($) => C.setSessionAnnex.v1({ value: { clock: 1 } as never }))

	const annexBindings = bindings({
		'core:outlet/set-session-annex@1': async (i: any, ctx: any) => {
			const r = await ctx.commit({ value: i.value })
			return ok({ main: r, annex: i.value })
		},
	} as never)

	test('both commits happen, and each outlet\'s event is on the receipt', async () => {
		const commits: string[] = []
		const receipt: any = await run(publish(annexed), {
			world,
			input: { text: 'hi', payload: { clock: 1 } },
			seed: 's',
			triggerSource: 'event',
			host: {
				commit: async (_p: any, n: any) => {
					commits.push(n.key)
					return { id: commits.length, written: true }
				},
			} as any,
			bindings: annexBindings,
		})
		assert.equal(receipt.outcome, 'ok', JSON.stringify(receipt.nodes?.map((n: any) => [n.nodeKey, n.result, n.reason])))
		assert.deepEqual(commits, ['reply', 'remember'])
		assert.deepEqual(
			receipt.emitted.map((e: any) => e.event),
			['core:event/message-created@1', 'core:event/annex-changed@1'],
		)
	})

	test('a write that reports written: false causes no event on the receipt', async () => {
		const receipt: any = await run(publish(annexed), {
			world,
			input: { text: 'hi', payload: { clock: 1 } },
			seed: 's',
			triggerSource: 'event',
			host: {
				commit: async (_p: any, n: any) =>
					n.key === 'remember' ? { written: false } : { id: 1, written: true },
			} as any,
			bindings: annexBindings,
		})
		assert.deepEqual(receipt.emitted.map((e: any) => e.event), ['core:event/message-created@1'])
	})
})

describe('W1 · the run: the live row is the placeholder, whatever else is written', () => {
	const hostCounting = (log: string[], failOn?: string) =>
		({
			commit: async (_p: any, n: any) => {
				if (n.key === failOn) throw new Error(`${n.key} could not be written`)
				log.push(n.key)
				return { id: log.length, written: true }
			},
		}) as any

	test('a complete message after the placeholder is written, and the live row stays the placeholder', async () => {
		const doc = publish(
			spec('w1:spec/placeholder-then-aside', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('placeholder', () => C.createMessage.v1({ text: '', generating: true }))
				.outlet('aside', ($) => C.createMessage.v1({ text: $.input.text, channel: 'notes' as never })),
		)
		const log: string[] = []
		let liveRow: unknown
		const receipt: any = await run(doc, {
			world,
			input: { text: 'hi' },
			seed: 's',
			host: hostCounting(log),
			bindings: bindings(),
			onRunEnd: (end: any) => {
				liveRow = end.liveRow
			},
		} as any)
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(log, ['placeholder', 'aside'])
		assert.equal(liveRow, 1, 'the placeholder (row 1) is the live row, not the aside written after it')
	})

	test('a write inside an each lands once per item', async () => {
		const doc = publish(
			spec('w1:spec/note-per-item', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.each('e', { over: [1, 2, 3], max: 4 }, (c) =>
					c.outlet('note', () => C.createMessage.v1({ text: 'x', channel: 'notes' as never })),
				),
		)
		const log: string[] = []
		const receipt: any = await run(doc, { world, input: { text: 'hi' }, seed: 's', host: hostCounting(log), bindings: bindings() } as any)
		assert.equal(receipt.outcome, 'ok', JSON.stringify(receipt.nodes?.map((n: any) => [n.nodeKey, n.result, n.reason])))
		assert.equal(log.length, 3)
	})

	test('a failed second write fails the run, and the first stands, receipted', async () => {
		const doc = publish(
			spec('w1:spec/second-fails', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('first', ($) => C.createMessage.v1({ text: $.input.text }))
				.outlet('second', ($) => C.createMessage.v1({ text: $.input.text, channel: 'notes' as never })),
		)
		const log: string[] = []
		const receipt: any = await run(doc, { world, input: { text: 'hi' }, seed: 's', host: hostCounting(log, 'second'), bindings: bindings() } as any)
		assert.notEqual(receipt.outcome, 'ok')
		assert.deepEqual(log, ['first'])
		const byKey = Object.fromEntries(receipt.nodes.map((n: any) => [n.nodeKey, n.result]))
		assert.equal(byKey.first, 'ok')
		assert.notEqual(byKey.second, 'ok')
	})
})

// ── W1b · writes in a parallel clause commit in declaration order ──────────

/** A task that takes `ms` to finish — a stand-in for a model call. */
const delay = pin(
	describeTaskDefinition({
		id: 'w1b:task/delay@1',
		timeoutMs: 5000,
		ports: { in: { ms: S.json, tag: S.json }, out: { main: S.json } },
	}),
)
/** A write whose own timeout is far shorter than a sibling's delay. */
const quickWrite = pin(
	describeOutletDefinition({
		id: 'w1b:outlet/quick-write@1',
		effects: 'write',
		review: { fields: ['value'] },
		timeoutMs: 50,
		ports: { in: { value: S.json }, out: { main: S.writeResult } },
	}),
)

describe('W1b · a parallel clause commits its writes in declaration order', () => {
	const setup = () => {
		const log: string[] = []
		const b = bindings({
			'w1b:task/delay@1': async (i: any) => {
				if (i.tag) log.push(String(i.tag))
				await new Promise((r) => setTimeout(r, Number(i.ms ?? 0)))
				return ok({ main: i.ms })
			},
			'w1b:outlet/quick-write@1': async (i: any, ctx: any) => {
				const r = await ctx.commit({ value: i.value })
				return ok({ main: r })
			},
		} as never)
		const host = {
			commit: async (p: any) => {
				log.push(String(p.value))
				return { id: log.length, written: true }
			},
		} as any
		return { log, b, host }
	}

	const racing = () =>
		publish(
			spec('w1b:spec/racing-chains', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.gather('g', { mode: 'parallel' }, (g) =>
					g
						.chain('slow', (c) =>
							c.task('think', () => delay.v1({ ms: 150 } as never)).outlet('write', () => quickWrite.v1({ value: 'slow' } as never)),
						)
						.chain('fast', (c) =>
							c.task('read', () => delay.v1({ ms: 0, tag: 'fast-read' } as never)).outlet('write', () => quickWrite.v1({ value: 'fast' } as never)),
						),
				),
		)

	test('the slow chain declared first commits first; the fast chain\'s read still ran at once', async () => {
		const { log, b, host } = setup()
		const receipt: any = await run(racing(), { world, input: { text: 'hi' }, seed: 's', host, bindings: b } as any)
		assert.equal(receipt.outcome, 'ok', JSON.stringify(receipt.nodes?.map((n: any) => [n.nodeKey, n.result, n.reason])))
		// The fast chain's read did not wait; only its write did.
		assert.deepEqual(log, ['fast-read', 'slow', 'fast'])
	})

	test('the wait is not execution: a 50 ms write timeout survives a 150 ms sibling (F36)', async () => {
		const { b, host } = setup()
		const receipt: any = await run(racing(), { world, input: { text: 'hi' }, seed: 's', host, bindings: b } as any)
		const writes = receipt.nodes.filter((n: any) => n.nodeKey.endsWith('write'))
		assert.equal(writes.length, 2)
		assert.ok(writes.every((n: any) => n.result === 'ok'), JSON.stringify(writes.map((n: any) => [n.nodeKey, n.reason])))
	})

	test('parallel and forced-sequential leave the same commits (the equivalence law)', async () => {
		const par = setup()
		await run(racing(), { world, input: { text: 'hi' }, seed: 's', host: par.host, bindings: par.b } as any)
		const seq = setup()
		await run(racing(), { world, input: { text: 'hi' }, seed: 's', host: seq.host, bindings: seq.b, forceSequential: true } as any)
		assert.deepEqual(
			par.log.filter((x) => x !== 'fast-read'),
			seq.log.filter((x) => x !== 'fast-read'),
		)
	})

	test('an each commits per item in index order, whichever item finishes first', async () => {
		const { log, b, host } = setup()
		const doc = publish(
			spec('w1b:spec/each-order', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.each('e', { over: [120, 0, 60], max: 4 }, (c) =>
					c
						.task('think', ($: any) => delay.v1({ ms: $.e.item } as never))
						.outlet('write', ($: any) => quickWrite.v1({ value: $.e.item } as never)),
				),
		)
		const receipt: any = await run(doc, { world, input: { text: 'hi' }, seed: 's', host, bindings: b } as any)
		assert.equal(receipt.outcome, 'ok', JSON.stringify(receipt.nodes?.map((n: any) => [n.nodeKey, n.result, n.reason])))
		assert.deepEqual(log, ['120', '0', '60'])
	})

	test('nested: a write inside an inner gather also waits for the outer chains declared before it', async () => {
		const { log, b, host } = setup()
		const doc = publish(
			spec('w1b:spec/nested-order', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.gather('outer', { mode: 'parallel' }, (g) =>
					g
						.chain('first', (c) =>
							c.task('think', () => delay.v1({ ms: 120 } as never)).outlet('write', () => quickWrite.v1({ value: 'outer-first' } as never)),
						)
						.chain('second', (c) =>
							c.gather('inner', { mode: 'parallel' }, (h) =>
								h
									.chain('a', (d) => d.task('think', () => delay.v1({ ms: 40 } as never)).outlet('write', () => quickWrite.v1({ value: 'inner-a' } as never)))
									.chain('b', (d) => d.outlet('write', () => quickWrite.v1({ value: 'inner-b' } as never))),
							),
						),
				),
		)
		const receipt: any = await run(doc, { world, input: { text: 'hi' }, seed: 's', host, bindings: b } as any)
		assert.equal(receipt.outcome, 'ok', JSON.stringify(receipt.nodes?.map((n: any) => [n.nodeKey, n.result, n.reason])))
		assert.deepEqual(log, ['outer-first', 'inner-a', 'inner-b'])
	})
})
