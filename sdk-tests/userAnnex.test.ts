/**
 * 🚧 M2b — the user annex, the SDK's half: limits, the pure key and document
 * checks, and the `scope: 'user'` annex field. Needs the built SDK.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	USER_ANNEX_LIMITS,
	annexField,
	annexFieldFindings,
	annexFieldsInGenre,
	userAnnexDocRefusal,
	userAnnexFieldFor,
	userAnnexKeyRefusal,
} from '@serene-pub/sdk'

describe('user annex limits', () => {
	test('are frozen and as ruled', () => {
		assert.ok(Object.isFrozen(USER_ANNEX_LIMITS))
		assert.deepEqual(
			{ ...USER_ANNEX_LIMITS },
			{ keyMaxLength: 128, bytesPerDoc: 65536, docsPerOwner: 256, bytesPerOwner: 1048576 },
		)
	})
})

describe('userAnnexKeyRefusal', () => {
	test('accepts plain keys', () => {
		for (const k of ['profile', 'saves/a-1', 'a.b_c/d', '0x']) assert.equal(userAnnexKeyRefusal(k), null, k)
	})
	test('refuses the rest, in words', () => {
		for (const k of ['', 'Profile', '/a', 'a/', 'a..b', 'a//b', '-a', 'a b', 'x'.repeat(129)])
			assert.equal(typeof userAnnexKeyRefusal(k), 'string', JSON.stringify(k))
		assert.equal(typeof userAnnexKeyRefusal(7), 'string')
	})
})

describe('userAnnexDocRefusal', () => {
	test('plain data passes', () => {
		for (const d of [null, 1, 'x', true, [1, { a: [] }], { a: { b: 'c' } }]) assert.equal(userAnnexDocRefusal(d), null)
	})
	test('non-data and oversize are refused', () => {
		const cyc: Record<string, unknown> = {}
		cyc.self = cyc
		for (const d of [undefined, () => 1, 1n, NaN, new Date(), cyc]) assert.equal(typeof userAnnexDocRefusal(d), 'string')
		assert.equal(typeof userAnnexDocRefusal('x'.repeat(USER_ANNEX_LIMITS.bytesPerDoc)), 'string')
		assert.equal(userAnnexDocRefusal('x'.repeat(USER_ANNEX_LIMITS.bytesPerDoc - 2)), null)
	})
	test('bytes are UTF-8, not characters', () => {
		assert.equal(typeof userAnnexDocRefusal('é'.repeat(USER_ANNEX_LIMITS.bytesPerDoc / 2)), 'string')
	})
})

describe("annex field scope 'user'", () => {
	const shape = { type: 'string' } as const
	test('an exact key and a family are fine', () => {
		assert.deepEqual(annexFieldFindings({ key: 'profile', shape, see: [], scope: 'user' }), [])
		assert.deepEqual(annexFieldFindings({ key: 'saves/', shape, see: [], scope: 'user' }), [])
		assert.equal(annexField({ key: 'saves/', shape, scope: 'user' }).scope, 'user')
	})
	test('act, see, genre are refused', () => {
		const f = annexFieldFindings({ key: 'p', shape, see: ['person'], act: ['person'], genre: 'a:genre/b', scope: 'user' })
		assert.ok(f.some((x) => x.includes('.act')))
		assert.ok(f.some((x) => x.includes('.see')))
		assert.ok(f.some((x) => x.includes('.genre')))
	})
	test('a bad key is refused; the session kebab rule is unchanged', () => {
		assert.ok(annexFieldFindings({ key: 'Bad/', shape, see: [], scope: 'user' }).length > 0)
		assert.ok(annexFieldFindings({ key: 'a/b', shape, see: [] }).length > 0)
	})
	test('a user field is in no session', () => {
		const u = annexField({ key: 'profile', shape, scope: 'user' })
		const s = annexField({ key: 'streak', shape })
		assert.deepEqual(annexFieldsInGenre([u, s]).map((f) => f.key), ['streak'])
	})
	test('userAnnexFieldFor: exact first, then the longest family; session fields never', () => {
		const a = annexField({ key: 'saves/', shape, scope: 'user' })
		const b = annexField({ key: 'saves/big/', shape: { type: 'integer' }, scope: 'user' })
		const c = annexField({ key: 'saves/pinned', shape: { type: 'boolean' }, scope: 'user' })
		const s = annexField({ key: 'profile', shape })
		const all = [a, b, c, s]
		assert.equal(userAnnexFieldFor(all, 'saves/pinned'), c)
		assert.equal(userAnnexFieldFor(all, 'saves/big/x'), b)
		assert.equal(userAnnexFieldFor(all, 'saves/x'), a)
		assert.equal(userAnnexFieldFor(all, 'profile'), undefined)
		assert.equal(userAnnexFieldFor(all, 'other'), undefined)
	})
})
