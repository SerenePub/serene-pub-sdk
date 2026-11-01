/**
 * 🚧 M2b — `ctx.annex('user')` in the author's harness: the same semantics a
 * hook sees in the sandbox (base, caps, refusals, read-your-writes). Needs the
 * built SDK.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { USER_ANNEX_LIMITS, hookCtxKeysFor, userAnnexProjection } from '@serene-pub/sdk'
import { memoryUserAnnex, pluginHandlerContext } from '@serene-pub/sdk/testing'

const PLUGIN = 'acme.saves'

describe('ctx.annex in the harness', () => {
	test('is on the ctx of the kinds that get storage, in the table’s key order, and not on a task', () => {
		for (const kind of ['query', 'outlet', 'event', 'lifecycle', 'oracle'] as const) {
			const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind })
			assert.equal(typeof ctx.annex, 'function', kind)
			assert.deepEqual(Object.keys(ctx), hookCtxKeysFor(kind))
		}
		for (const kind of ['task', 'chain-link'] as const)
			assert.equal('annex' in pluginHandlerContext({ pluginId: PLUGIN, kind }), false, kind)
	})

	test('get / set / list / remove, with read-your-writes and base compared against the projection', async () => {
		const annex = memoryUserAnnex({ profile: 'hi' })
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'outlet', userAnnex: annex })
		const a = ctx.annex!('user')
		assert.deepEqual((await a.get('profile'))?.doc, 'hi')
		assert.equal(await a.get('nope'), null)
		assert.deepEqual(await a.set('saves/a', { n: 1 }), { ok: true, version: 1 })
		assert.deepEqual((await a.get('saves/a'))?.doc, { n: 1 })
		assert.deepEqual(await a.set('saves/a', { n: 2 }, { base: 1 }), { ok: true, version: 2 })
		const stale = await a.set('saves/a', { n: 3 }, { base: 1 })
		assert.equal(stale.ok, false)
		assert.ok('stale' in stale && stale.stale && stale.fresh?.version === 2)
		assert.deepEqual((await a.list('saves/')).map((r) => r.key), ['saves/a'])
		assert.deepEqual(await a.remove('profile', { base: 1 }), { ok: true, version: 1 })
		assert.equal(await a.get('profile'), null)
		// what the call would commit: the last word per key, base = the snapshot's version
		assert.deepEqual(annex.writes(), [
			{ key: 'saves/a', doc: { n: 2 }, base: 0 },
			{ key: 'profile', doc: null, base: 1 },
		])
	})

	test('refuses a bad key, a bad document, a bare null and the caps in words', async () => {
		const a = memoryUserAnnex()
		const bad = await a.set('Bad Key', 'x')
		assert.ok(!bad.ok && 'refused' in bad && /lowercase/.test(bad.refused))
		const big = await a.set('k', 'x'.repeat(USER_ANNEX_LIMITS.bytesPerDoc))
		assert.ok(!big.ok && 'refused' in big && /at most/.test(big.refused))
		const nul = await a.set('k', null)
		assert.ok(!nul.ok && 'refused' in nul && /bare null/.test(nul.refused))
		for (let i = 0; i < USER_ANNEX_LIMITS.docsPerOwner; i++) assert.equal((await a.set(`d${i}`, 1)).ok, true)
		const over = await a.set('one-more', 1)
		assert.ok(!over.ok && 'refused' in over && /at most 256 documents/.test(over.refused))
	})

	test('without a person every method rejects with one sentence; any other host throws', async () => {
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'query' })
		await assert.rejects(ctx.annex!('user').get('a'), /annex\('user'\): no person is acting for this call/)
		assert.throws(() => (ctx.annex as (h: string) => unknown)('session'), /a hook may name: 'user'/)
	})

	test('the projection is the one the harness wraps', async () => {
		const p = userAnnexProjection({ a: { doc: 1, version: 3, updatedAt: '2026-01-01T00:00:00.000Z' } })
		assert.deepEqual(await p.api.set('a', 2, { base: 3 }), { ok: true, version: 4 })
		assert.deepEqual(p.writes(), [{ key: 'a', doc: 2, base: 3 }])
	})
})
