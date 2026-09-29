/**
 * 20 §10 — the `junction` clause (was `route`): branches selected by declared predicates over a
 * value on the spine. Any subset fires (one, several, none) plus an optional
 * `otherwise` that fires exactly when nothing else did; the receipt records
 * every predicate's evaluation; skipped branches are stated outcomes, never
 * failures; a fired branch's error is the clause's error. The loop clause's
 * whole argument — declaration, not back-edge, not code in the executor —
 * applied to fan-out.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, run, ok, err, S, pin, describeTaskDefinition } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, errorsFor, world } from './helpers.js'

const decide = pin(
	describeTaskDefinition({
		id: 'demo:task/decide@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.json, call: S.json } },
	}),
)
const act = pin(
	describeTaskDefinition({
		id: 'demo:task/act@1',
		timeoutMs: 500,
		ports: { in: { what: S.json }, out: { main: S.json } },
	}),
)

/** decide → route on the decision: dice and lore may both fire; otherwise narrates. */
const routed = () =>
	spec('demo:routed', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.task('decide', ($: any) => decide.v1({ text: $.input.text }))
		.junction('fan', { on: ($: any) => $.decide.call }, (r) =>
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
		const notes = (receipt.notes ?? []).filter((n: string) => n.startsWith("junction 'fan'"))
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
			.inlet('input', C.userMessage.v1())
			.junction('fan', { on: undefined as any }, (r) =>
				r.when('a', { truthy: true }, (c) => c.task('go', () => act.v1({ what: 1 }))),
			)
		assert.ok(
			errorsFor(noOn as any, '20 §10').some((f) => f.message.includes('no value to branch on')),
		)

		// Two defaults.
		const twoDefaults = spec('demo:r2', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('decide', ($: any) => decide.v1({ text: $.input.text }))
			.junction('fan', { on: ($: any) => $.decide.call }, (r) =>
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

/**
 * The two-port compare on a junction (D-4a, ruled 2026-09-17).
 *
 * `equals` takes a literal, so a branch could ask *is the accused Vell?* and
 * never *is the accused the culprit?* — and a genre that DERIVES its hidden
 * fact (Whodunit's, over `core:task/pick-by-hash@1`) has no other question to
 * ask. The predicate shape gained `equalsPath` in `predicates.ts`; what is
 * pinned here is the junction half of it:
 *
 *  · the routed value is the scope, so both sides come off ONE document;
 *  · either side absent fires **nothing** — two unwired ports comparing equal
 *    would route the branch that means *you got it right*;
 *  · the receipt says which two paths were compared, as it says the literal;
 *  · `validate()` accepts a branch stating it, and still refuses one stating
 *    no condition at all.
 */
describe('20 §10 · the two-port compare', () => {
	/** decide publishes the accusation and the derived culprit; the junction compares them. */
	const verdict = () =>
		spec('demo:verdict', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('decide', ($: any) => decide.v1({ text: $.input.text }))
			.junction('adjudicate', { on: ($: any) => $.decide.call }, (r) =>
				r
					.when('right', { path: 'accused', equalsPath: 'culprit' }, (c) =>
						c.task('go', ($: any) => act.v1({ what: 'solved' })),
					)
					.otherwise('wrong', (c) => c.task('go', ($: any) => act.v1({ what: 'unsolved' }))),
			)

	const adjudicate = async (call: unknown) =>
		run(publish(verdict()), {
			world,
			input: { text: 'x' },
			seed: 's',
			triggerSource: 'event',
			bindings: scripted(call),
		})

	const firedOf = (receipt: any) =>
		receipt.nodes
			.filter((n: any) => n.nodeKey?.startsWith('adjudicate.'))
			.map((n: any) => n.nodeKey)

	test('the branch fires when the two paths carry the same value', async () => {
		const receipt: any = await adjudicate({
			accused: 'character:12',
			culprit: 'character:12',
		})
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(firedOf(receipt), ['adjudicate.right.go'])
	})

	test('and not when they differ — the otherwise takes it', async () => {
		const receipt: any = await adjudicate({
			accused: 'character:12',
			culprit: 'character:13',
		})
		assert.equal(receipt.outcome, 'ok')
		assert.deepEqual(firedOf(receipt), ['adjudicate.wrong.go'])
	})

	test('either side absent fires nothing — an unwired port is not a match', async () => {
		// The dangerous case and the reason this is not plain `===`: the
		// branch that fires means *the accused IS the culprit*, so two ports
		// that carried nothing must not route it.
		for (const call of [
			{ culprit: 'character:12' },
			{ accused: 'character:12' },
			{},
		]) {
			const receipt: any = await adjudicate(call)
			assert.deepEqual(
				firedOf(receipt),
				['adjudicate.wrong.go'],
				JSON.stringify(call),
			)
		}
	})

	test('the receipt names both paths, as it names a literal', async () => {
		const receipt: any = await adjudicate({
			accused: 'character:12',
			culprit: 'character:12',
		})
		const notes = (receipt.notes ?? []).filter((n: string) =>
			n.startsWith("junction 'adjudicate'"),
		)
		assert.equal(notes.length, 2)
		assert.ok(
			notes.some((n: string) =>
				n.includes("'right' fired (accused equals the value at culprit)"),
			),
			notes.join('\n'),
		)
	})

	test('validate() accepts it, and still refuses a branch stating no condition', async () => {
		// One list answers both doors (`PREDICATE_CONDITION_KEYS`): before
		// this, `equalsPath` was legal in an action's enabled-when and refused
		// here as "states no conditions" — one predicate meaning two things.
		assert.deepEqual(errorsFor(verdict() as any, '20 §10'), [])

		const stateless = spec('demo:verdict-bare', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('decide', ($: any) => decide.v1({ text: $.input.text }))
			.junction('adjudicate', { on: ($: any) => $.decide.call }, (r) =>
				r.when('right', { path: 'accused' } as any, (c) =>
					c.task('go', ($: any) => act.v1({ what: 'solved' })),
				),
			)
		const bare = errorsFor(stateless as any, '20 §10')
		assert.ok(
			bare.some((f) => f.message.includes('states no conditions')),
			bare.map((f) => f.message).join('\n'),
		)
		// And the sentence is counted off the same list, so it can never again
		// name a condition the evaluator does not read.
		assert.ok(
			bare.some((f) => /equals \/ equalsPath \/ truthy \/ default/.test(f.fix)),
			bare.map((f) => f.fix).join('\n'),
		)
	})
})
