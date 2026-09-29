/**
 * The pipeline owns its row (09-B B4, R-17, R-21 (1)(2)) — the executor's half.
 *
 * Three laws, each with the thing that would be broken if it failed:
 *
 *  · a **dry run** performs no writes — without it the token estimate (C13)
 *    would leave a placeholder row behind every time somebody typed;
 *  · the run has a **live row** the host is told on every oracle call — the
 *    oracle stays blind to messages, and streaming still lands somewhere;
 *  · the host hears the run **end**, once, with that row — Stop is a
 *    run-level guarantee, and no node can keep a promise after it was
 *    cancelled.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { run, ok, halt, spec, slot, type HostServices, type RunEnd } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

/** The reply's shape: inlet → placeholder → oracle → update. */
const reply = () =>
	spec('demo:owns-its-row@1', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.outlet('placeholder', ($) =>
			C.createMessage.v1({ generating: true, characterId: $.input.characterId }),
		)
		.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
		.outlet('save', ($) =>
			C.updateMessage.v1({ target: $.placeholder.messageId, text: $.generate.text }),
		)

/** A host that records what it was asked, and hands out row ids. */
function recordingHost() {
	const commits: Array<{ node: string; payload: unknown }> = []
	const calls: Array<{ node: string; liveRow: unknown; dry: boolean }> = []
	let nextId = 41
	const host: HostServices = {
		async commit(payload, node) {
			commits.push({ node: node.key, payload })
			return { id: ++nextId }
		},
		async call(_payload, node, run) {
			calls.push({ node: node.key, liveRow: run.liveRow, dry: run.dry })
			return { text: 'streamed reply' }
		},
	}
	return { host, commits, calls }
}

/** The app's two message outlets: the binding describes, the host performs. */
const withUpdate = (over: Parameters<typeof bindings>[0] = {}) =>
	bindings({
		'core:outlet/create-message@1': async (i: any, ctx: any) => ok(await ctx.commit(i)),
		'core:outlet/update-message@1': async (i: any, ctx: any) => ok(await ctx.commit(i)),
		...over,
	})

// ── the live row ────────────────────────────────────────────────────────────
describe('the run has a live row, and the host is told on every call', () => {
	test('the placeholder commits, and the oracle after it is called with its row', async () => {
		const { host, commits, calls } = recordingHost()
		const r = await run(publish(reply()), { input: {}, world, bindings: withUpdate(), host })
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(
			commits.map((c) => c.node),
			['placeholder', 'save'],
		)
		assert.deepEqual(calls, [{ node: 'generate', liveRow: 42, dry: false }])
	})

	test('the update targets the row the placeholder made — one primary row', async () => {
		const { host, commits } = recordingHost()
		await run(publish(reply()), { input: {}, world, bindings: withUpdate(), host })
		const save = commits.find((c) => c.node === 'save')!.payload as { target: any }
		// A write result, whose ids ARE row ids by the time this node runs —
		// `write-result@1` is assignable to `row-ids@1` (09-B B4).
		assert.equal(save.target.status, 'committed')
		assert.equal(save.target.ids.id, 42)
	})

	test('an oracle before any placeholder is told there is no live row', async () => {
		const { host, calls } = recordingHost()
		const s = spec('demo:no-row@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
			.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))
		await run(publish(s), { input: {}, world, bindings: bindings(), host })
		assert.deepEqual(calls, [{ node: 'generate', liveRow: undefined, dry: false }])
	})

	test('only an outlet that declares liveRow sets it', () => {
		assert.equal(C.createMessage.descriptor.liveRow, true)
		assert.equal(
			C.seedGreetings.descriptor.liveRow,
			undefined,
			"N greetings are nobody's placeholder",
		)
		assert.equal(C.updateMessage.descriptor.liveRow, undefined)
	})
})

// ── dry runs ────────────────────────────────────────────────────────────────
describe('a dry run performs no writes (R-21 (1), F36)', () => {
	test('outlets return synthetic ids, the host is never asked to commit, and the receipt says so', async () => {
		const { host, commits, calls } = recordingHost()
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withUpdate(),
			host,
			dry: true,
		})
		assert.equal(r.outcome, 'ok', 'a dry run still runs to the end')
		assert.deepEqual(commits, [], 'nothing reached the host')
		// The oracle still ran — a dry run is not a stand-in for the model —
		// and was told both facts: the synthetic row, and that it is dry.
		assert.deepEqual(calls, [{ node: 'generate', liveRow: 'dry:placeholder', dry: true }])
		for (const key of ['placeholder', 'save']) {
			const n = r.nodes.find((n) => n.nodeKey === key)!
			assert.equal(n.dry, true, `${key} is marked dry`)
			assert.equal(n.result, 'ok')
		}
		const save = r.nodes.find((n) => n.nodeKey === 'save')!.output as any
		assert.equal(save.ids.id, 'dry:save')
	})

	test('the events the writes would have caused are recorded flagged dry, never as emitted', async () => {
		const { host } = recordingHost()
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withUpdate(),
			host,
			dry: true,
			subscribers: { 'core:event/message-created@1': 3 },
		})
		assert.deepEqual(
			r.emitted.map((e) => ({ event: e.event, dry: e.dry })),
			[
				{ event: 'core:event/message-created@1', dry: true },
				{ event: 'core:event/message-updated@1', dry: true },
			],
		)
	})

	test('a preview is a dry run — the placeholder before the halt commits nothing', async () => {
		const { host, commits } = recordingHost()
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withUpdate(),
			host,
			preview: true,
		})
		assert.equal(r.outcome, 'halt')
		assert.ok(r.preview, 'the preview report is still produced')
		assert.deepEqual(commits, [], 'the placeholder ran before the halt and wrote nothing')
		assert.equal(r.nodes.find((n) => n.nodeKey === 'placeholder')!.dry, true)
	})

	test('a real run is not dry, and `dry: false` on a preview is honoured as asked', async () => {
		const { host, commits } = recordingHost()
		await run(publish(reply()), {
			input: {},
			world,
			bindings: withUpdate(),
			host,
			preview: true,
			dry: false,
		})
		assert.deepEqual(
			commits.map((c) => c.node),
			['placeholder'],
		)
	})
})

// ── the run ends ────────────────────────────────────────────────────────────
describe('the host hears the run end, once, with the live row', () => {
	const ends = async (opts: Parameters<typeof run>[1]) => {
		const seen: RunEnd[] = []
		const r = await run(publish(reply()), {
			...opts,
			onRunEnd: (end) => {
				seen.push(end)
			},
		})
		return { r, seen }
	}

	test('ok', async () => {
		const { host } = recordingHost()
		const { seen } = await ends({ input: {}, world, bindings: withUpdate(), host })
		assert.equal(seen.length, 1)
		assert.equal(seen[0]!.kind, 'ok')
		assert.equal(seen[0]!.liveRow, 42)
		assert.equal(seen[0]!.dry, false)
	})

	test('err after the placeholder — the row is named so the host can fail it', async () => {
		const { host } = recordingHost()
		const { r, seen } = await ends({
			input: {},
			world,
			bindings: withUpdate({
				'core:oracle/generate-text@1': async () => {
					throw new Error('the service fell over')
				},
			}),
			host,
		})
		assert.equal(r.outcome, 'err')
		assert.equal(seen[0]!.kind, 'err')
		assert.equal(seen[0]!.liveRow, 42)
	})

	test('cancelled mid-call — an oracle that halts on its abort is a cancelled run, not a halted one', async () => {
		const { host } = recordingHost()
		let stopped = false
		const { r, seen } = await ends({
			input: {},
			world,
			bindings: withUpdate({
				// The app's oracle returns `halt` when its adapter was aborted;
				// the executor only ever pauses between nodes, so without the
				// conversion this would file a person's Stop as the pipeline's
				// own decision.
				'core:oracle/generate-text@1': async () => {
					stopped = true
					return halt('generation was aborted before the model finished')
				},
			}),
			host,
			cancelSignal: () =>
				stopped ? { by: 'user:7', reason: 'the run was cancelled' } : undefined,
		})
		assert.equal(r.outcome, 'cancelled')
		assert.equal(r.cancelledBy, 'user:7')
		assert.equal(seen[0]!.kind, 'cancelled')
		assert.equal(seen[0]!.liveRow, 42, 'the row Stop has to finalise')
		// The node's own row keeps its own reason (13 §3).
		assert.equal(r.nodes.find((n) => n.nodeKey === 'generate')!.result, 'halt')
		assert.equal(
			r.nodes.some((n) => n.nodeKey === 'save'),
			false,
			'nothing ran after the stop',
		)
	})

	test('a run that THROWS still ends — the hook fires as err with the error, then the throw continues', async () => {
		// A host seam failing outside any binding's try: the reviewer, which
		// the app implements as a socket push. Before the hook ran in the
		// run's tail unconditionally, this propagated past it and the row the
		// placeholder had made stayed generating with nobody left to finish it.
		const { host, commits } = recordingHost()
		const seen: RunEnd[] = []
		const boom = new Error('the reviewer could not reach anybody')
		await assert.rejects(
			run(publish(reply()), {
				input: {},
				world: {
					...world,
					overrides: [
						...world.overrides,
						{
							scopeKind: 'config',
							nodeKey: 'save',
							slot: 'settings',
							path: 'review',
							value: 'on',
						},
					],
				},
				bindings: withUpdate(),
				host,
				reviewer: async () => {
					throw boom
				},
				onRunEnd: (end) => {
					seen.push(end)
				},
			}),
			(e: unknown) => e === boom,
			'the throw still reaches the caller — the hook is a stop on the way out, not a catch',
		)
		assert.equal(seen.length, 1, 'once')
		assert.equal(seen[0]!.kind, 'err')
		assert.equal(seen[0]!.error, boom, 'the thrown object, for a host whose redaction needs the class')
		assert.equal(seen[0]!.liveRow, 42, 'the row the host has to fail')
		assert.equal(seen[0]!.receipt.outcome, 'err')
		assert.match(seen[0]!.receipt.haltReason ?? '', /could not reach anybody/)
		assert.deepEqual(
			commits.map((c) => c.node),
			['placeholder'],
			'the placeholder committed; the save never ran',
		)
	})

	test('a slot that will not resolve is the same shape of end', async () => {
		// `resolveSlot` reads `world.connections` for a connection slot; a
		// world that cannot answer throws out of `resolveInput`, before any
		// binding is reached. The hook still hears it.
		const { host } = recordingHost()
		const seen: RunEnd[] = []
		await assert.rejects(
			run(publish(reply()), {
				input: {},
				world: { ...world, connections: undefined as never },
				bindings: withUpdate(),
				host,
				onRunEnd: (end) => {
					seen.push(end)
				},
			}),
		)
		assert.equal(seen.length, 1)
		assert.equal(seen[0]!.kind, 'err')
		assert.ok(seen[0]!.error instanceof Error)
		assert.equal(seen[0]!.liveRow, 42)
	})

	test('a throwing hook is absorbed and noted — the receipt survives the host', async () => {
		const { host } = recordingHost()
		const r = await run(publish(reply()), {
			input: {},
			world,
			bindings: withUpdate(),
			host,
			onRunEnd: () => {
				throw new Error('finalising the row failed')
			},
		})
		assert.equal(r.outcome, 'ok')
		assert.ok(r.notes?.some((n) => /run-end hook failed/.test(n)))
	})
})
