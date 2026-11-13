/**
 * A clause's chains are written by the compile step in one order: the
 * member-holding chains in position order (the position of each chain's first
 * member, node or nested clause), then the member-less chains sorted by name.
 * A junction branch with no member is legal (taking it moves nothing, and it
 * keeps `otherwise` from firing), and the app's store rebuilds chains from
 * members and from the stored `branches` keys, so the compiler writes the
 * order the store can rebuild. The order never changes which branch runs.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, compile, canonicalHash, run, ok, S, pin, describeTaskDefinition } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

const mark = pin(
	describeTaskDefinition({
		id: 'demo:task/empty-branch-mark@1',
		timeoutMs: 500,
		ports: { in: { what: S.json }, out: { main: S.json } },
	}),
)
const step = ($: any) => mark.v1({ what: 'x' })

const chainsOf = (b: any, id: string): string[] => compile(b.build()).clauses.find((c) => c.id === id)!.chains

const base = () => spec('demo:empty-branch', { version: '1.0.0' }).inlet('input', C.userMessage.v1())
const T = { truthy: true }

describe('compile orders a clause\'s chains', () => {
	test('an empty branch declared first comes after the member-holding ones', () => {
		const b = base().junction('j', { on: ($: any) => $.input.text }, (r) =>
			r.when('e', T, (c) => c).when('a', T, (c) => c.task('go', step)).when('b', T, (c) => c.task('go', step)),
		)
		assert.deepEqual(chainsOf(b, 'j'), ['a', 'b', 'e'])
	})

	test('an empty branch declared in the middle comes after the member-holding ones', () => {
		const b = base().junction('j', { on: ($: any) => $.input.text }, (r) =>
			r.when('a', T, (c) => c.task('go', step)).when('e', T, (c) => c).when('b', T, (c) => c.task('go', step)),
		)
		assert.deepEqual(chainsOf(b, 'j'), ['a', 'b', 'e'])
	})

	test('an empty branch declared last stays last', () => {
		const b = base().junction('j', { on: ($: any) => $.input.text }, (r) =>
			r.when('a', T, (c) => c.task('go', step)).when('b', T, (c) => c.task('go', step)).when('e', T, (c) => c),
		)
		assert.deepEqual(chainsOf(b, 'j'), ['a', 'b', 'e'])
	})

	test('two empty branches declared out of name order come out by name, after the others', () => {
		const b = base().junction('j', { on: ($: any) => $.input.text }, (r) =>
			r.when('b', T, (c) => c).when('a', T, (c) => c).when('z', T, (c) => c.task('go', step)).otherwise('o', (c) => c.task('go', step)),
		)
		assert.deepEqual(chainsOf(b, 'j'), ['z', 'o', 'a', 'b'])
	})

	test('a branch whose only member is a nested junction keeps its position among the member-holding ones', () => {
		const b = base().junction('j', { on: ($: any) => $.input.text }, (r) =>
			r
				.when('a', T, (c) => c.task('go', step))
				.when('n', T, (c) => c.junction('inner', { on: ($: any) => $.input.text }, (i) => i.when('x', T, (d) => d.task('go', step))))
				.when('e', T, (c) => c)
				.when('b', T, (c) => c.task('go', step)),
		)
		assert.deepEqual(chainsOf(b, 'j'), ['a', 'n', 'b', 'e'])
	})

	test('a gather clause whose chains all hold a member is untouched', () => {
		const b = base().gather('g', {}, (g) =>
			g.chain('slow', (c) => c.task('go', step)).chain('fast', (c) => c.task('go', step)).chain('a', (c) => c.task('go', step)),
		)
		assert.deepEqual(chainsOf(b, 'g'), ['slow', 'fast', 'a'])
	})

	test('compiling an already-compiled document does not reorder it again', () => {
		const built = base()
			.junction('j', { on: ($: any) => $.input.text }, (r) =>
				r.when('b', T, (c) => c).when('a', T, (c) => c.task('go', step)),
			)
			.build()
		const once = compile(built)
		const twice = compile(once)
		assert.deepEqual(twice.clauses.find((c) => c.id === 'j')!.chains, ['a', 'b'])
		assert.equal(canonicalHash(twice), canonicalHash(once))
	})

	test('two empty branches declared first come after the one that holds a member, by name', () => {
		const b = base().junction('j', { on: ($: any) => $.input.text }, (r) =>
			r
				.when('review', { equals: 'review' }, (c) => c)
				.when('full', { equals: 'full' }, (c) => c)
				.otherwise('tick', (c) => c.task('go', step)),
		)
		assert.deepEqual(chainsOf(b, 'j'), ['tick', 'full', 'review'])
	})
})

describe('an empty branch runs as it always did', () => {
	const gated = () =>
		base()
			.junction('gate', { on: ($: any) => $.input.text }, (r) =>
				r.when('skip', { equals: 'skip' }, (c) => c).otherwise('rest', (c) => c.task('go', step)),
			)
	const exec = (text: string) => {
		const ran: unknown[] = []
		return run(publish(gated()), {
			world,
			input: { text },
			seed: 's',
			triggerSource: 'event',
			bindings: bindings({ 'demo:task/empty-branch-mark@1': async (i: any) => (ran.push(i), ok({ main: 'done' })) }),
		}).then((receipt: any) => ({ receipt, ran }))
	}

	test('when the empty branch holds it fired, the otherwise is skipped and nothing under it ran', async () => {
		const { receipt, ran } = await exec('skip')
		assert.equal(receipt.outcome, 'ok')
		const notes: string[] = receipt.notes ?? []
		assert.ok(notes.some((n) => n.includes("'skip' fired")), notes.join('\n'))
		assert.ok(notes.some((n) => n.includes("'rest' skipped")), notes.join('\n'))
		assert.equal(receipt.nodes.filter((n: any) => String(n.nodeKey).startsWith('gate.rest.')).length, 0)
		assert.equal(ran.length, 0)
	})

	test('when it does not hold, the otherwise runs its task', async () => {
		const { receipt, ran } = await exec('other')
		assert.equal(receipt.outcome, 'ok')
		assert.ok((receipt.notes ?? []).some((n: string) => n.includes("'rest' fired")))
		assert.equal(receipt.nodes.filter((n: any) => n.nodeKey === 'gate.rest.go').length, 1)
		assert.equal(ran.length, 1)
	})
})
