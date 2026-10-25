/**
 * Typed branching builders (lane 2, A18) — the run-time half: every typed form
 * stores exactly what its string form stored, so the typing is types-only and
 * no spec hash moves (`coreCatalog.test.ts`'s golden and the app's
 * `specHashes` / `registryHashes` are the catalogue-wide proof). The compile-
 * time half is `typedBuilders.assert.ts`.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { compile, canonicalHash, describeTaskDefinition, nodeAt, pin, S, spec, isDataRef } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const pick = pin(
	describeTaskDefinition({
		id: 'typedb:task/pick@1',
		timeoutMs: 500,
		ports: { in: { text: S.text }, out: { main: S.text, word: S.text } },
	}),
)
const read = pin(
	describeTaskDefinition({
		id: 'typedb:task/read@1',
		timeoutMs: 500,
		ports: { in: { word: S.text }, out: { main: S.text, call: S.json } },
	}),
)

interface Decided {
	call: { tool: string }
	culprit: string
	accused: string
}

const junctionWith = (form: 'string' | 'typed') =>
	spec('typedb:spec/junction', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.junction('decide', { on: ($) => $.input.text }, (j) =>
			j
				.when(
					'a',
					form === 'string'
						? { path: 'call.tool', equals: 'roll' }
						: { path: (v: Decided) => v.call.tool, equals: 'roll' },
					(c) => c.task('go', ($) => pick.v1({ text: $.input.text })).task('next', ($) => read.v1({ word: $.go.word })),
				)
				.when(
					'b',
					form === 'string'
						? { path: 'accused', equalsPath: 'culprit' }
						: { path: (v: Decided) => v.accused, equalsPath: (v: Decided) => v.culprit },
					(c) => c.task('go', ($) => pick.v1({ text: $.input.text })),
				)
				.otherwise('z', (c) => c.task('go', ($) => pick.v1({ text: $.input.text }))),
		)
		.task('after', ($) => read.v1({ word: $.decide.a.next.main }))
		.build()

const loopWith = (form: 'options' | 'body') =>
	spec('typedb:spec/loop', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.loop(
			'tools',
			form === 'options' ? { repeatWhile: ($: any) => $.tools.item.parse.call, max: 4 } : { max: 4 },
			(l) => {
				const body = l.task('parse', ($) => read.v1({ word: $.input.text }))
				return form === 'body' ? body.repeatWhile(($) => $.parse.call) : body
			},
		)
		.task('after', ($) => read.v1({ word: $.tools.main }))
		.build()

describe('A18 · typed forms store the string forms’ documents', () => {
	test('a typed junction path records the dotted string — same document, same hash', () => {
		const a = compile(junctionWith('string'))
		const b = compile(junctionWith('typed'))
		assert.deepEqual(b.clauses, a.clauses)
		assert.equal(canonicalHash(b), canonicalHash(a))
		const branches = a.clauses.find((c) => c.id === 'decide')!.branches!
		assert.deepEqual(branches.a, { path: 'call.tool', equals: 'roll' })
		assert.deepEqual(branches.b, { path: 'accused', equalsPath: 'culprit' })
	})

	test('a branch node named by its short key compiles to its full key', () => {
		const doc = compile(junctionWith('typed'))
		const next = doc.nodes.find((n) => n.key === 'decide.a.next')!
		assert.deepEqual(next.config.word, { __ref: 'data', node: 'decide.a.go', port: 'word' })
		const after = doc.nodes.find((n) => n.key === 'after')!
		assert.deepEqual(after.config.word, { __ref: 'data', node: 'decide.a.next', port: 'main' })
	})

	test('a typed path that does more than read properties is refused, naming the form', () => {
		assert.throws(
			() =>
				spec('typedb:spec/bad-path', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.junction('d', { on: ($) => $.input.text }, (j) =>
						j.when('a', { path: (v: Decided) => String(v.call.tool).length, truthy: true }, (c) => c),
					),
			/a typed path reads one chain of properties/,
		)
	})

	test('.repeatWhile() at the end of the body stores what the options form stores', () => {
		const a = compile(loopWith('options'))
		const b = compile(loopWith('body'))
		assert.deepEqual(b.clauses, a.clauses)
		assert.equal(canonicalHash(b), canonicalHash(a))
		assert.deepEqual(a.clauses[0]!.repeatWhile, { __ref: 'data', node: 'tools.item.parse', port: 'call' })
	})

	test('.repeatWhile() twice, or outside a loop body, is refused', () => {
		assert.throws(
			() =>
				spec('typedb:spec/twice', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.loop('l', { repeatWhile: ($) => $.input.text, max: 2 }, (l) =>
						l.task('p', ($) => read.v1({ word: $.input.text })).repeatWhile(($) => $.p.call),
					),
			/states repeatWhile twice/,
		)
		assert.throws(
			() =>
				spec('typedb:spec/outside', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.task('p', ($) => read.v1({ word: $.input.text }))
					.repeatWhile(($) => $.p.call),
			/call it at the end of the loop's body/,
		)
	})

	test('nodeAt($, key) is the property chain’s DataRef', () => {
		let viaAt: unknown
		let viaChain: unknown
		spec('typedb:spec/at', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.junction('decide', { on: ($) => $.input.text }, (j) =>
				j.when('a', { truthy: true }, (c) => c.task('go', ($) => pick.v1({ text: $.input.text }))),
			)
			.task('after', ($) => {
				viaAt = nodeAt($, 'decide.a.go').word
				viaChain = $.decide.a.go.word
				return read.v1({ word: viaAt as never })
			})
			.build()
		assert.ok(isDataRef(viaAt))
		assert.deepEqual(JSON.parse(JSON.stringify(viaAt)), JSON.parse(JSON.stringify(viaChain)))
		assert.deepEqual(JSON.parse(JSON.stringify(viaAt)), { __ref: 'data', node: 'decide.a.go', port: 'word' })
	})
})
