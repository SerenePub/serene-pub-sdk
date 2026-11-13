/**
 * `keepOnRetell` on an annex field (2026-11-11, S2): the value stays when its
 * turn is replaced. The host's half is the app's `state/write.ts` and
 * `sessions/annexChanges.ts`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { annexField } from '@serene-pub/sdk'
import { CORE_ANNEX_FIELDS } from '@serene-pub/core-catalog'

describe('annexField keepOnRetell', () => {
	test('true is carried onto the declaration', () => {
		const f = annexField({ key: 'plan', shape: { type: 'string' }, keepOnRetell: true })
		assert.equal(f.keepOnRetell, true)
	})

	test('absent stays absent', () => {
		const f = annexField({ key: 'plan', shape: { type: 'string' } })
		assert.equal('keepOnRetell' in f, false)
	})

	test('false is refused with its sentence', () => {
		assert.throws(
			() => annexField({ key: 'plan', shape: { type: 'string' }, keepOnRetell: false as unknown as true }),
			/keepOnRetell: true or absent — the value stays when its turn is told again/,
		)
	})

	test("a 'user' field is refused with its sentence", () => {
		assert.throws(
			() => annexField({ key: 'plan', shape: { type: 'string' }, scope: 'user', keepOnRetell: true }),
			/keepOnRetell: a user-scoped field is not taken back with a turn, so there is nothing to keep/,
		)
	})

	test("a 'lorebook' field is refused with its sentence", () => {
		assert.throws(
			() => annexField({ key: 'plan', shape: { type: 'string' }, scope: 'lorebook', keepOnRetell: true }),
			/keepOnRetell: a session-scope field only — a lorebook-scope field's change is a lorebook write/,
		)
	})
})

describe('core annex fields', () => {
	test('the four Dungeon Crawler plan fields keep on a re-telling and no other core field does', () => {
		const kept = CORE_ANNEX_FIELDS.filter((f) => f.keepOnRetell === true).map((f) => String(f.key))
		assert.equal(kept.length, 4)
		for (const f of CORE_ANNEX_FIELDS)
			if (kept.includes(String(f.key))) assert.match(String(f.key), /progress|planning-notes|journal/)
		assert.ok(CORE_ANNEX_FIELDS.some((f) => f.key === 'retake-quietly' && f.keepOnRetell === undefined))
	})
})
