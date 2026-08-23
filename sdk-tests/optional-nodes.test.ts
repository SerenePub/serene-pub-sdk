/**
 * `Descriptor.optional` — a node whose failure the run survives.
 *
 * The case it exists for: enrichment. The narrative graph's relationship
 * summary is read by a Query, wrapped by the template in `{{#if}}`, and worth
 * nothing if it costs somebody their reply. Before this, a slow read halted the
 * turn — the timeout had to be set absurdly high not as a latency budget but
 * because exceeding it was fatal.
 *
 * The line these tests hold is that "tolerated" is not "hidden". A failure the
 * receipt does not record is strictly worse than one that stops the run,
 * because nobody can find it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { spec, compile, run, ok, err, halt, describeQueryType, describeTaskType, pin, S } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { world } from './helpers.js'

const flaky = pin(
	describeQueryType({
		id: 'test:query/flaky-optional@1',
		optional: true,
		timeoutMs: 50,
		ports: { out: { main: S.json } },
	}),
)

const required = pin(
	describeQueryType({
		id: 'test:query/flaky-required@1',
		timeoutMs: 50,
		ports: { out: { main: S.json } },
	}),
)

const doc = (which: typeof flaky | typeof required) =>
	compile(
		spec('test:spec/optional', { version: '1.0.0' })
			.on('core:event/message-created@1')
			.input('input', C.userMessage.v1())
			.query('enrich', () => (which as any).v1())
			.task('after', ($: any) => C.firstJson.v1({ main: $.enrich.main }))
			.build(),
	)

const go = async (which: any, hook: any) =>
	await run(doc(which), {
		world,
		input: { text: 'hi' },
		seed: 'optional',
		triggerSource: 'ui',
		bindings: {
			'core:input/user-message@1': async (i: any) => ok(i),
			[`${which.id}`]: hook,
			'core:task/first-json@1': async (i: any) => ok({ main: i?.main ?? null }),
		},
	})

const nodeFor = (receipt: any, key: string) =>
	receipt.nodes.find((n: any) => n.nodeKey === key)

test('an optional node that errors does not stop the run', async () => {
	const receipt: any = await go(flaky, async () => err('the graph is unreachable'))

	assert.equal(receipt.outcome, 'ok')
	const after = nodeFor(receipt, 'after')
	assert.ok(after, 'the downstream node never ran')
	assert.equal(after.result, 'ok')
})

test('the receipt still says it failed, and why', async () => {
	// The whole risk of this feature: a swallowed failure nobody can find.
	const receipt: any = await go(flaky, async () => err('the graph is unreachable'))

	const enrich = nodeFor(receipt, 'enrich')
	assert.equal(enrich.result, 'err')
	assert.equal(enrich.reason, 'the graph is unreachable')
	assert.equal(enrich.recoveredAsEmpty, true)
})

test('a timeout is absorbed the same way, and marked as one', async () => {
	const receipt: any = await go(
		flaky,
		async () => await new Promise((r) => setTimeout(() => r(ok({})), 500)),
	)

	assert.equal(receipt.outcome, 'ok')
	const enrich = nodeFor(receipt, 'enrich')
	assert.equal(enrich.timedOut, true)
	assert.equal(enrich.recoveredAsEmpty, true)
})

test('without the flag the same failure stops the run', async () => {
	// The control. If this ever passes, the flag is not what is doing the work.
	const receipt: any = await go(required, async () => err('the graph is unreachable'))

	assert.notEqual(receipt.outcome, 'ok')
	assert.equal(nodeFor(receipt, 'enrich').recoveredAsEmpty, undefined)
	assert.equal(nodeFor(receipt, 'after'), undefined)
})

test('a halt is not absorbed', async () => {
	// A halt is a binding saying "stop here" deliberately — a preview, a review
	// gate. Absorbing it would turn every intentional stop into a silent skip.
	const receipt: any = await go(flaky, async () => halt('stopping on purpose'))

	assert.notEqual(receipt.outcome, 'ok')
	const enrich = nodeFor(receipt, 'enrich')
	assert.equal(enrich.result, 'halt')
	assert.equal(enrich.recoveredAsEmpty, undefined)
})

test('downstream sees an empty value, not a missing one', async () => {
	const receipt: any = await go(flaky, async () => err('nope'))
	assert.deepEqual(nodeFor(receipt, 'enrich').output, {})
})
