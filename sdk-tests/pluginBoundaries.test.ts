/**
 * The plugin boundaries K1a draws: a plugin's code cannot stand in for a node
 * that uses a connection (R53), whatever the fit.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	checkSchema,
	compile,
	defineExtension,
	forOwningHookSplit,
	secretHandle,
	describeOracleDefinition,
	describeTaskDefinition,
	handler,
	ok,
	spec,
	swapFitFinding,
	use,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const pinned = {
	id: 'core:oracle/advise@1',
	kind: 'oracle' as const,
	ports: { in: { context: 'core:shape/json@1' }, out: { main: 'core:shape/json@1' } },
	slots: { connection: { kind: 'connection' } },
}

describe('R53 · a plugin never stands in for a node that uses a connection', () => {
	test("a plugin's oracle with the exact fit is refused, naming the reason", () => {
		const finding = swapFitFinding('advise', pinned as never, { ...pinned, id: 'acme.rp:oracle/advise@1' } as never)
		assert.match(finding!, /uses a connection.*R53/)
	})

	test("core's own stand-in is judged on fit alone", () => {
		assert.equal(swapFitFinding('advise', pinned as never, { ...pinned, id: 'core:oracle/other@1' } as never), undefined)
	})
})

describe('R62 and R53 at build: a swap contribution is judged where it is written', () => {
	const talk = compile(
		spec('other:spec/talk', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: use('core:genre/chat'), event: 'core:event/message-respond@1' })
			.task('merge', ($) => C.concatCandidates.v1({ sources: [$.input.text] as never }))
			.oracle('speak', () => C.generateText.v1({} as never))
			.build(),
	)
	const merge = describeTaskDefinition({ ...(C.concatCandidates as any).descriptor, id: 'acme.rp:task/merge@1' })
	const speak = describeOracleDefinition({ ...(C.generateText as any).descriptor, id: 'acme.rp:oracle/speak@1' })
	const ext = (swaps: unknown[], handlers: unknown[]) => () =>
		defineExtension({ slug: 'acme.rp', name: 'RP', version: '1.0.0', swaps, handlers } as never)
	const fn = async () => ok({})

	test('a contributed node must be public: a swap runs it in another package’s pipeline', () => {
		assert.throws(
			ext([{ spec: talk, node: 'merge', definition: merge }], [handler(merge, fn)]),
			/whose handler is private.*visibility: 'public'/,
		)
		ext([{ spec: talk, node: 'merge', definition: merge }], [handler(merge, fn, { visibility: 'public' })])()
	})

	test('a node that uses a connection takes no plugin stand-in, refused at build (R53)', () => {
		assert.throws(
			ext([{ spec: talk, node: 'speak', definition: speak }], [handler(speak, fn, { visibility: 'public' })]),
			/uses a connection.*R53/,
		)
	})
})

describe('R63 · a secret reaches plugin code as a handle', () => {
	const schema = {
		apiKey: { type: 'secret', scope: 'instance', side: 'extension' },
		shared: { type: 'secret', scope: 'instance', side: 'extension', lend: true },
		region: { type: 'string', default: 'eu' },
	} as const
	test('the hook gets handles; the host keeps the values and knows what is lent', () => {
		const stored = {
			apiKey: { $secret: true, value: 'c1' },
			shared: { $secret: true, value: 'c2' },
			region: 'us',
		}
		const r = forOwningHookSplit(schema as never, stored, (c) => (c === 'c1' ? 'sk-one' : 'sk-two'), 'n0')
		assert.deepEqual(r.settings, { apiKey: secretHandle('apiKey', 'n0'), shared: secretHandle('shared', 'n0'), region: 'us' })
		assert.deepEqual(r.secrets, { apiKey: 'sk-one', shared: 'sk-two' })
		assert.deepEqual(r.lent, ['shared'])
		assert.doesNotMatch(JSON.stringify(r.settings), /sk-/)
	})

	test('a value stored before the field became a secret is handled as one', () => {
		const r = forOwningHookSplit(schema as never, { apiKey: 'sk-legacy' }, () => '', 'n0')
		assert.equal(r.settings.apiKey, secretHandle('apiKey', 'n0'))
		assert.equal(r.secrets.apiKey, 'sk-legacy')
	})

	test('a secret is named so a handle can carry it', () => {
		const f = checkSchema({ 'api key!': { type: 'secret', scope: 'instance', side: 'extension' } } as never)
		assert.match(f.find((x) => x.field === 'api key!')!.message, /a handle cannot carry/)
	})

	test("only a secret can be lent", () => {
		const f = checkSchema({ region: { type: 'string', lend: true } } as never)
		assert.match(f.find((x) => x.field === 'region')!.message, /only a secret has/)
	})
})
