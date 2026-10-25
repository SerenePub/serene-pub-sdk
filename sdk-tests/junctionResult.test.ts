/**
 * PLAN-turn-order §4.14 (M4, decided 2026-09-23): a junction passes its
 * result on. Beside `main` / `values` / `branches` / `ok`, a junction
 * publishes under its id every out-port that the last node of every branch
 * publishes, taken from the branch that fired — so `$.decide.order` reads
 * like any node's port, and no fold node is needed. A ref to a clause port
 * not every branch publishes is refused at build.
 *
 * 🚧 RF fix 3 (2026-10-23): the branches' shapes AGREE when one of them takes
 * them all (`agreedShape`) — a model call's text-stream and a task's text
 * hand on a text, the way Story's reply hands its words to one shared save.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, run, ok, S, pin, describeTaskDefinition } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, findings, bindings, world } from './helpers.js'

const pick = pin(
	describeTaskDefinition({
		id: 'demo:task/pick-a@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text, word: S.text } },
	}),
)
const pickB = pin(
	describeTaskDefinition({
		id: 'demo:task/pick-b@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text, word: S.text } },
	}),
)
const other = pin(
	describeTaskDefinition({
		id: 'demo:task/pick-other@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text } },
	}),
)
/** 🚧 RF fix 3: a branch end whose `word` streams, beside `pick-a`'s plain text. */
const pickStream = pin(
	describeTaskDefinition({
		id: 'demo:task/pick-stream@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text, word: S.textStream } },
	}),
)
/** 🚧 RF fix 3: a branch end whose `word` is rows — no shape takes both it and a text. */
const pickRows = pin(
	describeTaskDefinition({
		id: 'demo:task/pick-rows@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text, word: S.rowIds } },
	}),
)
const read = pin(
	describeTaskDefinition({
		id: 'demo:task/read-word@1',
		timeoutMs: 500,
		ports: { in: { word: S.text }, out: { main: S.text } },
	}),
)

const branching = (b: typeof pickB | typeof other | typeof pickStream | typeof pickRows = pickB) =>
	spec('demo:spec/junction-result', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.junction('decide', { on: ($: any) => $.input.text }, (j) =>
			j
				.when('a', { equals: 'a' }, (c) => c.task('go', ($: any) => pick.v1({ text: $.input.text })))
				.otherwise('b', (c) => c.task('go', ($: any) => (b as any).v1({ text: $.input.text }))),
		)
		.task('after', ($: any) => read.v1({ word: $.decide.word }))

const exec = (text: string) =>
	run(publish(branching()), {
		world,
		input: { text },
		seed: 's',
		triggerSource: 'event',
		bindings: bindings({
			'demo:task/pick-a@1': async () => ok({ main: 'A', word: 'from-a' }),
			'demo:task/pick-b@1': async () => ok({ main: 'B', word: 'from-b' }),
			'demo:task/read-word@1': async (i: any) => ok({ main: i.word }),
		}),
	})

describe('M4 · a junction passes its result on', () => {
	test('the fired branch’s port reads as the clause’s own — either branch', async () => {
		const a: any = await exec('a')
		assert.equal(a.outcome, 'ok')
		assert.equal(a.nodes.find((n: any) => n.nodeKey === 'after').output.main, 'from-a')
		const b: any = await exec('zzz')
		assert.equal(b.nodes.find((n: any) => n.nodeKey === 'after').output.main, 'from-b')
	})

	test('the edge from a clause port carries the shape the branches agree on', () => {
		const doc = publish(branching())
		const edge = doc.edges.find((e: any) => e.from === 'decide' && e.fromPort === 'word')
		assert.equal(edge?.shape, S.text)
	})

	test('a port not every branch publishes is refused at build, naming the branch', () => {
		const errors = findings(branching(other)).filter((f: any) => f.severity === 'error')
		assert.ok(
			errors.some((f: any) =>
				/'decide\.word' is not published by every branch of junction 'decide' — 'b' ends in 'decide\.b\.go', which has no 'word'/.test(f.message),
			),
			errors.map((f: any) => f.message).join('\n'),
		)
	})

	test('🚧 a text-stream and a text agree on text: the edge carries text, does not stream, and the read is clean', async () => {
		const doc = publish(branching(pickStream))
		const edge = doc.edges.find((e: any) => e.from === 'decide' && e.fromPort === 'word')
		assert.equal(edge?.shape, S.text)
		assert.equal(edge?.streaming, false)
		assert.deepEqual(findings(branching(pickStream)).filter((f: any) => f.severity === 'error'), [])
		const r: any = await run(doc, {
			world,
			input: { text: 'zzz' },
			seed: 's',
			triggerSource: 'event',
			bindings: bindings({
				'demo:task/pick-a@1': async () => ok({ main: 'A', word: 'from-a' }),
				'demo:task/pick-stream@1': async () => ok({ main: 'S', word: 'from-stream' }),
				'demo:task/read-word@1': async (i: any) => ok({ main: i.word }),
			}),
		})
		assert.equal(r.nodes.find((n: any) => n.nodeKey === 'after').output.main, 'from-stream')
	})

	test('🚧 shapes no one of them takes are still refused, naming both', () => {
		const errors = findings(branching(pickRows)).filter((f: any) => f.severity === 'error')
		assert.ok(
			errors.some((f: any) => /publish 'word' as different shapes/.test(f.message)),
			errors.map((f: any) => f.message).join('\n'),
		)
	})

	test('a result port read from a junction with no otherwise is refused — it can fire nothing', () => {
		const noDefault = spec('demo:spec/junction-no-default', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.junction('decide', { on: ($: any) => $.input.text }, (j) =>
				j
					.when('a', { equals: 'a' }, (c) => c.task('go', ($: any) => pick.v1({ text: $.input.text })))
					.when('b', { equals: 'b' }, (c) => c.task('go', ($: any) => pickB.v1({ text: $.input.text }))),
			)
			.task('after', ($: any) => read.v1({ word: $.decide.word }))
		const errors = findings(noDefault).filter((f: any) => f.severity === 'error')
		assert.ok(errors.some((f: any) => /has no otherwise branch/.test(f.message)), errors.map((f: any) => f.message).join('\n'))
	})
})
