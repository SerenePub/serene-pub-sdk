/**
 * 20 §10 — the `route` block: branches selected by declared predicates over a
 * value on the spine. Any subset fires (one, several, none) plus an optional
 * `otherwise` that fires exactly when nothing else did; the receipt records
 * every predicate's evaluation; skipped branches are stated outcomes, never
 * failures; a fired branch's error is the block's error. The loop block's
 * whole argument — declaration, not back-edge, not code in the executor —
 * applied to fan-out.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, run, ok, err, S, pin, describeTaskType } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, errorsFor, world } from './helpers.js'

const decide = pin(
	describeTaskType({
		id: 'demo:task/decide@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.json, call: S.json } },
	}),
)
const act = pin(
	describeTaskType({
		id: 'demo:task/act@1',
		timeoutMs: 500,
		ports: { in: { what: S.json }, out: { main: S.json } },
	}),
)

/** decide → route on the decision: dice and lore may both fire; otherwise narrates. */
const routed = () =>
	spec('demo:routed', { version: '1.0.0' })
		.input('input', C.userMessage.v1())
		.task('decide', ($: any) => decide.v1({ text: $.input.text }))
		.route('fan', { on: ($: any) => $.decide.call }, (r) =>
			r
				.when('dice', { path: 'tool', equals: 'roll_dice' }, (c) =>
					c.task('go', ($: any) => act.v1({ what: 'rolled' })),
				)
				.when('lore', { path: 'writeLore', truthy: true }, (c) =>
					c.task('go', ($: any) => act.v1({ what: 'wrote' })),
				)
				.otherwise('narrate', (c) =>
					c.task('go', ($: any) => act.v1({ what: 'narrated' })),
				),
		)

const scripted = (call: unknown, actImpl?: any) =>
	bindings({
		'demo:task/decide@1': async () => ok({ main: call, call }),
		'demo:task/act@1':
			actImpl ?? (async (i: any) => ok({ main: `did ${JSON.stringify(i.what)}` })),
	})

const exec = async (call: unknown, actImpl?: any) =>
	run(publish(routed()), {
		world,
		input: { text: 'x' },
		seed: 's',
		triggerSource: 'event',
		bindings: scripted(call, actImpl),
	})

const branchesOf = (receipt: any) => {
	const nodes = receipt.nodes.filter((n: any) => n.nodeKey?.startsWith('fan.'))
	return nodes.map((n: any) => n.nodeKey)
}

describe('20 §10 · routing', () => {
	test('a matching branch fires; the others are recorded as skipped', async () => {
		const receipt: any = await exec({ tool: 'roll_dice' })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(branchesOf(receipt), ['fan.dice.go'])
		// Every predicate's evaluation is in the receipt — fired and skipped.
		const notes = (receipt.notes ?? []).filter((n: string) => n.startsWith("route 'fan'"))
		assert.equal(notes.length, 3)
		assert.ok(notes.some((n: string) => n.includes("'dice' fired")))
		assert.ok(notes.some((n: string) => n.includes("'lore' skipped")))
		assert.ok(notes.some((n: string) => n.includes("'narrate' skipped")))
	})

	test('several branches may fire from one value — fan-out is the point', async () => {
		const receipt: any = await exec({ tool: 'roll_dice', writeLore: true })
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(branchesOf(receipt).sort(), ['fan.dice.go', 'fan.lore.go'])
	})

	test('otherwise fires exactly when nothing else did', async () => {
		const receipt: any = await exec(null)
		assert.deepEqual(branchesOf(receipt), ['fan.narrate.go'])
	})

	test('a fired branch error is the block error; a skipped branch never is', async () => {
		const receipt: any = await exec({ tool: 'roll_dice' }, async () => err('the dice exploded'))
		assert.equal(receipt.outcome, 'err')
		assert.equal(receipt.haltReason, 'the dice exploded')
	})

	test('the validator holds the table honest', async () => {
		// No routed value.
		const noOn = spec('demo:r1', { version: '1.0.0' })
			.input('input', C.userMessage.v1())
			.route('fan', { on: undefined as any }, (r) =>
				r.when('a', { truthy: true }, (c) => c.task('go', () => act.v1({ what: 1 }))),
			)
		assert.ok(
			errorsFor(noOn as any, '20 §10').some((f) => f.message.includes('no routed value')),
		)

		// Two defaults.
		const twoDefaults = spec('demo:r2', { version: '1.0.0' })
			.input('input', C.userMessage.v1())
			.task('decide', ($: any) => decide.v1({ text: $.input.text }))
			.route('fan', { on: ($: any) => $.decide.call }, (r) =>
				r
					.otherwise('a', (c) => c.task('go', () => act.v1({ what: 1 })))
					.otherwise('b', (c) => c.task('go', () => act.v1({ what: 2 }))),
			)
		assert.ok(
			errorsFor(twoDefaults as any, '20 §10').some((f) =>
				f.message.includes('2 default branches'),
			),
		)
	})
})
