/**
 * Statuses set inside node execution (plans/29 R-19, R-21; 09-B B11; 30 U5h).
 *
 * The laws, each with what would be broken if it failed:
 *
 *  · `ctx.status` is on EVERY kind's ctx — a query saying *thinking* and an
 *    oracle saying *typing* is the whole point; a kind without it is a stage
 *    the person watching cannot hear from.
 *  · the host hears each CHANGE with the node key, and nothing else — six
 *    parallel reads all saying *thinking* are one status, not six frames.
 *  · a status persists until the next one or the run's end — nothing clears
 *    it between nodes, so the receipt's `lastStatus` can name what the run
 *    was doing when it died.
 *  · `lastStatus` is on the receipt for `halt` / `err` / `cancelled` and
 *    ABSENT on `ok` and on a preview's halt (R-21, "optional, taken").
 *  · F34 stays: no node row carries a status.
 *  · nothing moves on a definition — a status is not declared.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	run,
	ok,
	halt,
	err,
	spec,
	slot,
	fillStatusVars,
	renderStatusText,
	sameStatus,
	statusVarsMentioned,
	HOST_FILLED_STATUS_VARS,
	type StatusText,
	type Kind,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

const THINKING: StatusText = { i18n: { en: '{speaker} is thinking' } }
const COMPOSING: StatusText = { i18n: { en: '{speaker} is composing' } }
const TYPING: StatusText = { i18n: { en: '{speaker} is typing' } }

/** The reply's shape, every kind present: inlet · query · task · oracle · outlet. */
const reply = () =>
	spec('demo:statuses@1', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
		.task('prompt', ($) =>
			C.assemble.v2({
				candidates: $.history.messages,
				connection: slot.connection(),
				template: slot.template(),
			}),
		)
		.oracle('generate', ($) =>
			C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
		)
		.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

type Seen = Array<{ nodeKey: string; text: StatusText }>

const withStatuses = (over: Parameters<typeof bindings>[0] = {}) =>
	bindings({
		'core:query/session-history@1': async (_i: any, ctx: any) => {
			ctx.status(THINKING)
			return ok({ main: 'history', messages: [] })
		},
		'core:task/assemble@2': async (_i: any, ctx: any) => {
			ctx.status(COMPOSING)
			return ok({ main: 'ctx', context: { messages: [] } })
		},
		'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
			ctx.status(TYPING)
			return ok({ main: 'hello', text: 'hello' })
		},
		...over,
	})

describe('R-19 · ctx.status on every kind', () => {
	test('query, task, oracle and outlet can each set a status, and the host hears each with the node key', async () => {
		// The four kinds that RUN a handler. An inlet has no invocation to
		// wrap — the executor publishes the trigger's payload itself — so it
		// has no ctx and nothing to say; the run's first status is the first
		// handler's.
		const seen: Seen = []
		const kinds = new Set<Kind>()
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: bindings({
				'core:query/session-history@1': async (_i: any, ctx: any) => {
					ctx.status(THINKING)
					return ok({ main: 'history', messages: [] })
				},
				'core:task/assemble@2': async (_i: any, ctx: any) => {
					ctx.status(COMPOSING)
					return ok({ main: 'ctx', context: { messages: [] } })
				},
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					ctx.status(TYPING)
					return ok({ main: 'hello', text: 'hello' })
				},
				'core:outlet/create-message@1': async (i: any, ctx: any) => {
					ctx.status({ i18n: { en: 'saving' } })
					return ok(await ctx.commit(i))
				},
			}),
			onNode: (e) => kinds.add(e.kind),
			onStatus: (nodeKey, text) => seen.push({ nodeKey, text }),
		})
		assert.equal(r.outcome, 'ok')
		assert.deepEqual([...kinds].sort(), ['inlet', 'oracle', 'outlet', 'query', 'task'])
		assert.deepEqual(
			seen.map((s) => [s.nodeKey, s.text.i18n.en]),
			[
				['history', '{speaker} is thinking'],
				['prompt', '{speaker} is composing'],
				['generate', '{speaker} is typing'],
				['save', 'saving'],
			],
		)
	})

	test('the text reaches the host as the handler wrote it — unresolved, {speaker} unfilled', async () => {
		const seen: Seen = []
		await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses(),
			onStatus: (nodeKey, text) => seen.push({ nodeKey, text }),
		})
		const typing = seen.find((s) => s.nodeKey === 'generate')!
		assert.deepEqual(typing.text, TYPING)
		assert.equal(typing.text.vars, undefined, 'the host fills {speaker}, never the executor')
	})

	test('a status persists across nodes until replaced — a node that says nothing changes nothing', async () => {
		const seen: Seen = []
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses({
				// The task says nothing; the oracle says nothing and fails.
				'core:task/assemble@2': async () => ok({ main: 'ctx', context: { messages: [] } }),
				'core:oracle/generate-text@1': async () => err('the service fell over'),
			}),
			onStatus: (nodeKey, text) => seen.push({ nodeKey, text }),
		})
		assert.equal(r.outcome, 'err')
		assert.deepEqual(
			seen.map((s) => s.nodeKey),
			['history'],
		)
		// What it was doing when it died: the query's status, two nodes on.
		assert.deepEqual(r.lastStatus, { nodeKey: 'history', text: THINKING })
	})

	test('a repeated status is not a new status — six parallel reads saying thinking are one frame', async () => {
		const seen: Seen = []
		const doc = publish(
			spec('demo:statuses-gather@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.gather('gather', { mode: 'parallel' }, (b) =>
					b
						.chain('history', (c) =>
							c.query('read', ($) =>
								C.sessionHistory.v1({ scope: $.input.sessionScope }),
							),
						)
						.chain('lore', (c) =>
							c.query('read', ($) =>
								C.lorebookTriggers.v1({ scope: $.input.sessionScope }),
							),
						),
				)
				.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
		)
		const r = await run(doc, {
			input: {},
			world,
			bindings: bindings({
				'core:query/session-history@1': async (_i: any, ctx: any) => {
					ctx.status(THINKING)
					return ok({ main: 'history', messages: [] })
				},
				'core:query/lorebook-triggers@1': async (_i: any, ctx: any) => {
					ctx.status({ ...THINKING })
					return ok({ main: 'lore', hits: [] })
				},
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					ctx.status(TYPING)
					return ok({ main: 'hello', text: 'hello' })
				},
			}),
			onStatus: (nodeKey, text) => seen.push({ nodeKey, text }),
		})
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(
			seen.map((s) => s.text.i18n.en),
			['{speaker} is thinking', '{speaker} is typing'],
		)
	})

	test('a malformed status is dropped with a note, never a failed node', async () => {
		const seen: Seen = []
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses({
				'core:task/assemble@2': async (_i: any, ctx: any) => {
					ctx.status({ i18n: {} } as any)
					ctx.status('composing' as any)
					return ok({ main: 'ctx', context: { messages: [] } })
				},
			}),
			onStatus: (nodeKey, text) => seen.push({ nodeKey, text }),
		})
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(
			seen.map((s) => s.nodeKey),
			['history', 'generate'],
		)
		const prompt = r.nodes.find((n) => n.nodeKey === 'prompt')!
		assert.equal(prompt.result, 'ok')
		assert.ok(prompt.notes?.some((n) => n.startsWith('status ignored')))
	})

	test('an observer that throws is its own problem — the run finishes', async () => {
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses(),
			onStatus: () => {
				throw new Error('broken status display')
			},
		})
		assert.equal(r.outcome, 'ok')
	})
})

describe('R-21 · the last status on the receipt, and only when the run died', () => {
	test('ABSENT on ok', async () => {
		const r = await run(publish(reply()), { input: {}, world, bindings: withStatuses() })
		assert.equal(r.outcome, 'ok')
		assert.equal(r.lastStatus, undefined, 'a finished run was doing nothing when it ended')
	})

	test('present on halt, naming the node that set it', async () => {
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses({
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					ctx.status(TYPING)
					return halt('the model returned nothing')
				},
			}),
		})
		assert.equal(r.outcome, 'halt')
		assert.equal(r.haltNodeKey, 'generate')
		assert.deepEqual(r.lastStatus, { nodeKey: 'generate', text: TYPING })
	})

	test('present on err', async () => {
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses({
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					ctx.status(TYPING)
					throw new Error('the service fell over')
				},
			}),
		})
		assert.equal(r.outcome, 'err')
		assert.deepEqual(r.lastStatus, { nodeKey: 'generate', text: TYPING })
	})

	test('present on cancelled — Stop mid-typing reads "typing at generate"', async () => {
		let stopped = false
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses({
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					ctx.status(TYPING)
					stopped = true
					return halt('generation was aborted before the model finished')
				},
			}),
			cancelSignal: () =>
				stopped ? { by: 'user:7', reason: 'the run was cancelled' } : undefined,
		})
		assert.equal(r.outcome, 'cancelled')
		assert.deepEqual(r.lastStatus, { nodeKey: 'generate', text: TYPING })
	})

	test("ABSENT on a preview's halt — stopping where it was asked to is not dying", async () => {
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses(),
			preview: true,
		})
		assert.equal(r.outcome, 'halt')
		assert.ok(r.preview)
		assert.equal(r.lastStatus, undefined)
	})

	test('F34 · no node row carries a status', async () => {
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withStatuses({
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					ctx.status(TYPING)
					return halt('the model returned nothing')
				},
			}),
		})
		for (const n of r.nodes) {
			assert.ok(!('status' in n), `${n.nodeKey} carries a status row`)
			assert.ok(!('lastStatus' in n), `${n.nodeKey} carries a status row`)
			assert.ok(
				!JSON.stringify(n).includes('is typing') &&
					!JSON.stringify(n).includes('is thinking') &&
					!JSON.stringify(n).includes('is composing'),
				`${n.nodeKey}'s row carries status text`,
			)
		}
	})

	test('nothing moved on a definition — a status is not declared', () => {
		// The pinned contracts the reply spec uses: none declares a status
		// anywhere in its descriptor, and the executor grants `ctx.status`
		// without reading one. Pins are unchanged by this unit.
		for (const d of [
			C.userMessage.descriptor,
			C.sessionHistory.descriptor,
			C.assemble.descriptor,
			C.generateText.descriptor,
			C.createMessage.descriptor,
		] as any[]) {
			assert.ok(!JSON.stringify(d).includes('"status"'), `${d.id} declares a status`)
		}
	})
})

describe('ctx.iteration · identity for a counting status', () => {
	test('inside an each, index and count; outside, absent', async () => {
		const seen: Array<{ nodeKey: string; iteration: unknown }> = []
		const doc = publish(
			spec('demo:statuses-each@1', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('chunks', ($) => C.chunkText.v1({ text: $.input.text }))
				.each('summarize', { over: ($) => $.chunks.items, max: 8 }, (m) =>
					m.oracle('sum', C.generateText.v1({ connection: slot.connection() })),
				),
		)
		const statuses: Seen = []
		const r = await run(doc, {
			input: { text: 'a|b|c' },
			world,
			bindings: bindings({
				'core:task/chunk-text@1': async (i: any, ctx: any) => {
					seen.push({ nodeKey: 'chunks', iteration: ctx.iteration })
					const items = String(i.text ?? '').split('|')
					return ok({ main: items, items })
				},
				'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
					seen.push({ nodeKey: 'sum', iteration: ctx.iteration })
					ctx.status({
						i18n: { en: 'summarising part {n} of {total}' },
						vars: { n: ctx.iteration.index + 1, total: ctx.iteration.count },
					})
					return ok({ main: 'x', text: 'x' })
				},
			}),
			onStatus: (nodeKey, text) => statuses.push({ nodeKey, text }),
		})
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(seen[0], { nodeKey: 'chunks', iteration: undefined })
		assert.deepEqual(
			seen.filter((s) => s.nodeKey === 'sum').map((s) => s.iteration),
			[
				{ index: 0, count: 3 },
				{ index: 1, count: 3 },
				{ index: 2, count: 3 },
			],
		)
		assert.deepEqual(
			statuses.map((s) => renderStatusText(s.text)),
			['summarising part 1 of 3', 'summarising part 2 of 3', 'summarising part 3 of 3'],
		)
	})
})

describe('status text · rendering and the host-filled variable', () => {
	test('renders the requested locale, falls back to en, substitutes vars', () => {
		const text: StatusText = {
			i18n: { en: '{speaker} is typing', fr: '{speaker} écrit' },
			vars: { speaker: 'Jasmine' },
		}
		assert.equal(renderStatusText(text), 'Jasmine is typing')
		assert.equal(renderStatusText(text, 'fr'), 'Jasmine écrit')
		assert.equal(renderStatusText(text, 'de'), 'Jasmine is typing')
	})

	test('an unfilled LEADING {speaker} is dropped, not shown literally', () => {
		// A run with nobody to name (a summarize, a graph build) leaves
		// `speaker` unset by design — see `speakerDisplayName`, core's half.
		// "{speaker} is typing" then reads as "is typing", not as a visible
		// placeholder a person would report as broken.
		assert.equal(renderStatusText(TYPING), 'is typing')
	})

	test('an unfilled variable NOT in the leading {speaker} position stays visible', () => {
		const text: StatusText = { i18n: { en: 'summarising part {n} of {total}' } }
		assert.equal(renderStatusText(text), 'summarising part {n} of {total}')
		// Mid-sentence, not the leading token: `{speaker}` itself is not
		// special-cased away from anywhere but the front.
		const mid: StatusText = { i18n: { en: 'waiting on {speaker} to finish' } }
		assert.equal(renderStatusText(mid), 'waiting on {speaker} to finish')
	})

	test('a FILLED leading {speaker} renders normally — the strip only applies when unset', () => {
		assert.equal(
			renderStatusText({ ...TYPING, vars: { speaker: 'Jasmine' } }),
			'Jasmine is typing',
		)
	})

	test('fillStatusVars fills only what the text mentions and the handler did not set', () => {
		assert.deepEqual(HOST_FILLED_STATUS_VARS, ['speaker'])
		assert.deepEqual(statusVarsMentioned(TYPING), ['speaker'])
		const filled = fillStatusVars(TYPING, { speaker: 'Guide' })
		assert.deepEqual(filled, { i18n: TYPING.i18n, vars: { speaker: 'Guide' } })
		// The handler's own value wins.
		const own = { ...TYPING, vars: { speaker: 'Narrator' } }
		assert.equal(fillStatusVars(own, { speaker: 'Guide' }), own)
		// A text mentioning no variable is returned as it is.
		const plain: StatusText = { i18n: { en: 'loading the model' } }
		assert.equal(fillStatusVars(plain, { speaker: 'Guide' }), plain)
		// Nothing to fill with: unchanged, placeholder kept for the reader.
		assert.equal(fillStatusVars(TYPING, {}), TYPING)
	})

	test('sameStatus compares what would render, not identity', () => {
		assert.ok(sameStatus(TYPING, { i18n: { en: '{speaker} is typing' } }))
		assert.ok(!sameStatus(TYPING, THINKING))
		assert.ok(
			!sameStatus(
				{ ...TYPING, vars: { speaker: 'A' } },
				{ ...TYPING, vars: { speaker: 'B' } },
			),
		)
	})

	test('sameStatus compares i18n by sorted entries, like vars — key order is not a difference', () => {
		// Two locale maps with the same entries, built in different orders:
		// `JSON.stringify` would tell them apart; the map does not.
		const a: StatusText = { i18n: { en: 'hello', fr: 'bonjour' } }
		const b: StatusText = { i18n: { fr: 'bonjour', en: 'hello' } }
		assert.ok(sameStatus(a, b))
		assert.ok(!sameStatus(a, { i18n: { en: 'hello', fr: 'salut' } }))
		assert.ok(!sameStatus(a, { i18n: { en: 'hello' } }))
	})
})
