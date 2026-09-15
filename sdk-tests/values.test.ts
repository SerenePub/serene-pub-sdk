/**
 * The value-type system (24 §8): toolkit factories emit frozen single-key
 * declarations, the key is a versioned type id, validation reads the same
 * declarations server-side, unknown kinds refuse, and custom kinds only mint
 * namespaced through a package-bound toolkit.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	v,
	makeValueToolkit,
	valueKind,
	validateValue,
	valueValidators,
	shippedValueKinds,
	todo,
	isTodo,
	assertValueTypeId,
} from '@serene-pub/sdk'

describe('single-key serialization', () => {
	test('the declaration is one key — the versioned type id — and frozen', () => {
		const d = v.integer({ min: 0, max: 10 })
		assert.deepEqual(d, { 'integer@1': { min: 0, max: 10 } })
		assert.equal(valueKind(d), 'integer@1')
		assert.ok(Object.isFrozen(d))
		assert.ok(Object.isFrozen(d['integer@1']))
	})

	test('undefined props are dropped — canonical JSON has no undefined holes', () => {
		const d = v.text({ maxLength: 5, pattern: undefined })
		assert.deepEqual(Object.keys(d['text@1']!), ['maxLength'])
	})

	test('valueKind refuses a malformed declaration', () => {
		assert.throws(() => valueKind({ 'a@1': {}, 'b@1': {} } as any), /exactly one key/)
	})

	test('type-id syntax is enforced', () => {
		assertValueTypeId('integer@1')
		assertValueTypeId('acme.dice:roll@3')
		assert.throws(() => assertValueTypeId('Integer@1'))
		assert.throws(() => assertValueTypeId('integer'))
	})
})

describe('custom kinds', () => {
	test('the bare toolkit refuses custom kinds; a bound one namespaces them', () => {
		assert.throws(() => v.custom('roll', 1, {}), /package context/)
		const bound = makeValueToolkit('acme.dice')
		assert.deepEqual(bound.custom('roll', 1, { sides: 20 }), {
			'acme.dice:roll@1': { sides: 20 },
		})
	})
})

describe('eager construction checks', () => {
	test('weights: author defaults must satisfy the pinned total', () => {
		assert.throws(() => v.weights({ parts: { a: 50, b: 40 }, total: 100 }), /sum to 90/)
		const ok = v.stackedBar({ parts: { a: 60, b: 40 }, total: 100 })
		assert.equal(valueKind(ok), 'weights@1')
		assert.equal(ok['weights@1']!.control, 'stacked-bar')
	})

	test('text: a bad pattern throws at the author line', () => {
		assert.throws(() => v.text({ pattern: '[' }))
	})

	test('fraction sugar pins [0,1] with a 0.01 step', () => {
		assert.deepEqual(v.fraction(), { 'number@1': { min: 0, max: 1, step: 0.01 } })
	})
})

describe('validation — the server-side half', () => {
	test('weights: unknown parts, bounds, and the pinned sum', () => {
		const d = v.weights({ parts: { a: 50, b: 50 }, total: 100, min: 0 })
		assert.deepEqual(validateValue(d, { a: 60, b: 40 }), [])
		assert.match(validateValue(d, { a: 60, b: 30 })[0]!, /sum to 90/)
		assert.match(validateValue(d, { a: 60, b: 40, c: 0 })[0]!, /unknown part 'c'/)
		assert.match(validateValue(d, { a: -1, b: 101 }).join(' '), /below min/)
	})

	test('integer vs number', () => {
		assert.deepEqual(validateValue(v.integer({ min: 1 }), 3), [])
		assert.match(validateValue(v.integer(), 3.5)[0]!, /integer/)
		assert.deepEqual(validateValue(v.number(), 3.5), [])
	})

	test('select and ranking read their declared options', () => {
		assert.deepEqual(validateValue(v.select(['a', 'b']), 'a'), [])
		assert.match(validateValue(v.select(['a', 'b']), 'c')[0]!, /one of/)
		assert.deepEqual(validateValue(v.ranking(['x', 'y']), ['y', 'x']), [])
		assert.match(validateValue(v.ranking(['x', 'y']), ['x'])[0]!, /permutation/)
	})

	test('unknown type ids refuse the write', () => {
		assert.match(
			validateValue({ 'acme.dice:roll@1': {} }, 6)[0]!,
			/unknown value type .* refusing/,
		)
	})
})

describe('todo() — the named hole (24 §7)', () => {
	test('serializes as its own kind, detectable, and refused by validation', () => {
		const hole = todo('pick a prompt')
		assert.ok(isTodo(hole))
		assert.equal(isTodo({ x: 1 }), false)
		assert.match(validateValue(v.text(), hole).join(' '), /string/)
	})
})

describe('the registry the canary checks', () => {
	test('every shipped kind has a validator', () => {
		for (const kind of shippedValueKinds) assert.ok(valueValidators[kind], kind)
		// The factories emit only registered kinds.
		for (const d of [
			v.integer(),
			v.number(),
			v.fraction(),
			v.weights({ parts: { a: 1 } }),
			v.select(['a']),
			v.ranking(['a']),
			v.text(),
			v.boolean(),
			v.prompt(),
		])
			assert.ok(shippedValueKinds.includes(valueKind(d)), valueKind(d))
	})
})

describe('the four-way registry (24 §8) — the canary', () => {
	test('every shipped kind has a validator AND a control entry', async () => {
		const { CONTROL_REGISTRY } = await import('@serene-pub/controls/registry')
		for (const kind of shippedValueKinds) {
			assert.ok(valueValidators[kind], `${kind} has no validator`)
			assert.ok(CONTROL_REGISTRY[kind], `${kind} has no control entry`)
		}
		// And no control claims a kind nothing validates — a dangling editor
		// is a control that renders values the host refuses to accept.
		for (const kind of Object.keys(CONTROL_REGISTRY))
			assert.ok(valueValidators[kind], `control for unvalidated '${kind}'`)
	})

	test('the settings-schema bridge lands on shipped kinds only', async () => {
		const { valueDeclOf } = await import('@serene-pub/sdk')
		const samples = [
			{ type: 'integer', default: 3, min: 0 },
			{ type: 'number', default: 0.5 },
			{ type: 'boolean', default: true },
			{ type: 'string', default: 'x' },
			{ type: 'enum', of: ['a', 'b'], default: 'a' },
			{
				type: 'share',
				members: [{ key: 'a' }, { key: 'b' }],
				default: { a: 0.6, b: 0.4 },
			},
			{
				type: 'perMember',
				members: [{ key: 'a' }, { key: 'b' }],
				default: { a: 3, b: 5 },
			},
		]
		for (const s of samples) {
			const d = valueDeclOf(s)
			assert.ok(d, `${s.type} bridged to nothing`)
			assert.ok(
				shippedValueKinds.includes(valueKind(d!)),
				`${s.type} bridged to unshipped ${valueKind(d!)}`,
			)
		}
		assert.equal(valueDeclOf({ type: 'mystery' }), null)
	})
})
