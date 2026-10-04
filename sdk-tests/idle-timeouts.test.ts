/**
 * `timeoutKind` (F36) — what a definition's `timeoutMs` measures.
 *
 * The bug this file holds shut: the reply oracles declare
 * `timeoutMs: 120000, timeoutKind: 'idle'`, and the executor never read the
 * kind, so "idle" ran as a 120-second TOTAL over queue wait, model load,
 * prompt processing, reasoning and the body. A long reply that was streaming
 * steadily timed out mid-stream.
 *
 * The lines held here: an idle clock restarts on every pulse — from the
 * handler (`ctx.pulse`) or from the host's request (`CallHandles.pulse`); a
 * wall clock ignores pulses; the pub's ceiling bounds an idle node however
 * much it pulses; and a timeout aborts the signal the host's request listens
 * to, so a timed-out node does not leave its request running.
 *
 * Real timers with small numbers: the clock is plain `setTimeout`, and these
 * run in well under a second.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
	spec,
	compile,
	run,
	ok,
	describeOracleDefinition,
	pin,
	S,
	type CallHandles,
	type HostServices,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { world } from './helpers.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const oracle = (id: string, timeoutKind: 'wall' | 'idle' | undefined, timeoutMs = 60) =>
	pin(
		describeOracleDefinition({
			id,
			shape: S.textGen,
			effects: 'external',
			timeoutMs,
			...(timeoutKind ? { timeoutKind } : {}),
			ports: { in: {}, out: { main: S.text } },
		} as any),
	)

const idle = oracle('test:oracle/idle-clock@1', 'idle')
const wall = oracle('test:oracle/wall-clock@1', 'wall')
const unstated = oracle('test:oracle/unstated-clock@1', undefined)

const docFor = (which: { id: string }) =>
	compile(
		spec(`test:spec/clock-${which.id.split('/')[1]}`, { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('gen', () => (which as any).v1())
			.build(),
	)

const go = async (
	which: { id: string },
	hook: (input: unknown, ctx: any) => Promise<unknown>,
	opts: { host?: HostServices; timeoutCeilingMs?: number } = {},
) =>
	(await run(docFor(which), {
		world,
		input: { text: 'hi' },
		seed: 'clock',
		triggerSource: 'ui',
		...opts,
		bindings: {
			'core:inlet/user-message@1': async (i: any) => ok(i),
			[which.id]: hook as any,
		},
	})) as any

const gen = (receipt: any) => receipt.nodes.find((n: any) => n.nodeKey === 'gen')

/** A handler that pulses every `every` ms for `total` ms, then answers. */
const steady = (every: number, total: number) => async (_: unknown, ctx: any) => {
	for (let t = 0; t < total; t += every) {
		await sleep(every)
		ctx.pulse?.()
	}
	return ok({ main: 'done' })
}

test('an idle clock restarts on every pulse — a long, steady node finishes', async () => {
	// 60 ms idle window, pulsing every 15 ms for 240 ms: four windows long.
	const r = await go(idle, steady(15, 240))
	assert.equal(r.outcome, 'ok')
	assert.equal(gen(r).timedOut, undefined)
	assert.equal(gen(r).timeoutMsApplied, 60)
})

test('an idle clock still runs out on silence, and says it was silence', async () => {
	const r = await go(idle, async () => {
		await sleep(200)
		return ok({ main: 'late' })
	})
	assert.equal(r.outcome, 'err')
	assert.equal(gen(r).timedOut, true)
	assert.match(gen(r).reason, /timeout after 60ms without progress/)
})

test('a wall clock ignores pulses — the same steady node times out', async () => {
	const r = await go(wall, steady(15, 240))
	assert.equal(r.outcome, 'err')
	assert.equal(gen(r).timedOut, true)
	assert.match(gen(r).reason, /^timeout after 60ms$/)
})

test('a definition that states no kind is timed on the wall', async () => {
	const r = await go(unstated, steady(15, 240))
	assert.equal(gen(r).timedOut, true)
	assert.match(gen(r).reason, /^timeout after 60ms$/)
})

test("the pub's ceiling bounds an idle node however much it pulses", async () => {
	const r = await go(idle, steady(10, 1000), { timeoutCeilingMs: 150 })
	assert.equal(r.outcome, 'err')
	assert.equal(gen(r).timedOut, true)
	// The window stayed open (min(timeoutMs, ceiling) = 60 ms, pulsed every
	// 10); the ceiling is what ended it.
	assert.match(gen(r).reason, /timeout after 150ms \(the pub's ceiling\)/)
})

test("the host's pulse counts: a request the host performs keeps an idle node alive", async () => {
	let handed: CallHandles | undefined
	const host: HostServices = {
		async call(_p, _node, _run, handles) {
			handed = handles
			// A stream of 16 chunks, 15 ms apart — 240 ms against a 60 ms window.
			for (let i = 0; i < 16; i++) {
				await sleep(15)
				handles!.pulse()
			}
			return { text: 'streamed' }
		},
	}
	const r = await go(
		idle,
		async (_: unknown, ctx: any) => ok({ main: ((await ctx.call({})) as any).text }),
		{
			host,
		},
	)
	assert.equal(r.outcome, 'ok')
	assert.ok(handed, 'the host was handed the node’s handles')
	assert.equal(handed!.signal.aborted, false)
})

test("a timeout aborts the signal the host's request listens to", async () => {
	let handed: CallHandles | undefined
	let abortedAt: number | undefined
	const started = Date.now()
	const host: HostServices = {
		async call(_p, _node, _run, handles) {
			handed = handles
			handles!.signal.addEventListener('abort', () => (abortedAt = Date.now() - started))
			await sleep(300) // a request that never pulses
			return { text: 'too late' }
		},
	}
	const r = await go(idle, async (_: unknown, ctx: any) => ok({ main: await ctx.call({}) }), {
		host,
	})
	assert.equal(gen(r).timedOut, true)
	assert.equal(handed!.signal.aborted, true)
	assert.ok(
		abortedAt !== undefined && abortedAt < 250,
		`aborted at ${abortedAt}ms, not when the request ended`,
	)
})

test('the handler’s ctx.signal is the same signal the host is handed', async () => {
	let ctxSignal: AbortSignal | undefined
	let hostSignal: AbortSignal | undefined
	const host: HostServices = {
		async call(_p, _node, _run, handles) {
			hostSignal = handles!.signal
			return {}
		},
	}
	await go(
		idle,
		async (_: unknown, ctx: any) => {
			ctxSignal = ctx.signal
			await ctx.call({})
			return ok({ main: '' })
		},
		{ host },
	)
	assert.equal(ctxSignal, hostSignal)
})
