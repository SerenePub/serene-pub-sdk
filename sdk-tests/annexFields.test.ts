/**
 * Annex fields (2026-09-26): a declared key a widget sets through core's one
 * pipeline — the declaration's refusals, the identity, and the value check
 * the host's door and the outlet both run.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	ANNEX_FIELD_SPEC_ID,
	annexField,
	annexFieldAction,
	annexFieldFindings,
	annexFieldValueRefusal,
	defineExtension,
	genre,
	parseAnnexFieldAction,
	isActionIdentity,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_SPECS, SET_ANNEX_FIELD_SPEC_ID } from '@serene-pub/core-catalog'

describe('annexField()', () => {
	test('defaults: pipelines-only data audience, and pipeline-written only (no act, ruling 2026-09-26)', () => {
		const f = annexField({ key: 'last-roll', shape: { type: 'integer', min: 1, max: 20 } })
		assert.deepEqual([...f.see], [])
		assert.equal('act' in f, false)
		assert.equal(f.__decl, 'annex-field')
		const settable = annexField({ key: 'last-roll', shape: { type: 'integer' }, act: ['owner'] })
		assert.deepEqual([...settable.act!], ['owner'])
	})

	test('refuses a secret anywhere in the shape (R61)', () => {
		assert.throws(() => annexField({ key: 'token', shape: { type: 'secret' } }), /secret/)
		assert.throws(
			() =>
				annexField({
					key: 'bag',
					shape: { type: 'object', fields: { key: { type: 'secret' } } },
				}),
			/secret/,
		)
	})

	test('refuses a key that is not a kebab token — a field never names an owner', () => {
		assert.throws(() => annexField({ key: 'other.pkg', shape: { type: 'string' } }), /lowercase kebab/)
		assert.throws(() => annexField({ key: 'lastRoll', shape: { type: 'string' } }), /lowercase kebab/)
	})

	test('refuses a data audience that fails dataAudienceFindings, and an act nobody can press', () => {
		assert.throws(() => annexField({ key: 'a', shape: { type: 'string' }, see: ['item'] }), /not an audience for a stored value/)
		assert.throws(() => annexField({ key: 'a', shape: { type: 'string' }, act: ['ai'] }), /cannot press/)
		assert.throws(() => annexField({ key: 'a', shape: { type: 'string' }, act: [] }), /non-empty/)
		assert.deepEqual(annexFieldFindings({ key: 'a', shape: { type: 'string' }, see: ['ai'], act: ['participant'] }), [])
	})

	test('refuses a shape its own schema check refuses', () => {
		assert.throws(() => annexField({ key: 'pick', shape: { type: 'enum' } }), /no options/)
	})
})

describe('the identity', () => {
	test('<owner>:annex#<key>, a valid action identity, and back', () => {
		const id = annexFieldAction('acme.dice', 'last-roll')
		assert.equal(id, 'acme.dice:annex#last-roll')
		assert.ok(isActionIdentity(id))
		assert.deepEqual(parseAnnexFieldAction(id), { owner: 'acme.dice', key: 'last-roll' })
		assert.equal(parseAnnexFieldAction('acme.dice:spec/roll#roll'), null)
		assert.equal(parseAnnexFieldAction(':annex#x'), null)
	})
})

describe('the value check', () => {
	const f = annexField({ key: 'last-roll', shape: { type: 'integer', min: 1, max: 20 } })
	test('a fitting value passes; a mismatch is the validator sentence', () => {
		assert.equal(annexFieldValueRefusal(f, { value: 7 }), null)
		assert.match(annexFieldValueRefusal(f, { value: 'seven' })!, /should be a number/)
		assert.match(annexFieldValueRefusal(f, { value: 21 })!, /above the maximum 20/)
		assert.match(annexFieldValueRefusal(f, {})!, /payload: \{ value \}/)
		assert.match(annexFieldValueRefusal(f, undefined)!, /payload: \{ value \}/)
	})
})

describe('placement', () => {
	test('on the extension: a key declared twice is refused', () => {
		const field = annexField({ key: 'note', shape: { type: 'string' } })
		const ok = defineExtension({ slug: 'acme.notes', name: 'Notes', version: '1.0.0', annexFields: [field] })
		assert.equal(ok.annexFields?.length, 1)
		assert.throws(
			() => defineExtension({ slug: 'acme.notes', name: 'Notes', version: '1.0.0', annexFields: [field, field] }),
			/declared twice/,
		)
	})

	test('scoped to a genre: the id is stored, by value or by id', () => {
		const g = genre('acme.fields:genre/table', { name: 'Table', family: 'chat' })
		assert.equal(annexField({ key: 'note', shape: { type: 'string' }, genre: g }).genre, 'acme.fields:genre/table')
		assert.equal(annexField({ key: 'note', shape: { type: 'string' }, genre: g.id }).genre, 'acme.fields:genre/table')
		assert.equal('genre' in annexField({ key: 'note', shape: { type: 'string' } }), false)
		assert.throws(() => annexField({ key: 'note', shape: { type: 'string' }, genre: 'table' }), /a genre/)
	})
})

describe("core's one pipeline", () => {
	test('is shipped, contributes no action, and writes through set-annex-field', () => {
		assert.equal(SET_ANNEX_FIELD_SPEC_ID, ANNEX_FIELD_SPEC_ID)
		const entry = CORE_SPECS.find((s) => s.slug === ANNEX_FIELD_SPEC_ID)
		assert.ok(entry, 'core ships core:spec/set-annex-field')
		const doc = entry!.build()
		assert.equal(doc.contributes?.actions?.length ?? 0, 0)
		assert.ok(doc.nodes.some((n: { definitionId: string }) => n.definitionId === 'core:outlet/set-annex-field'))
		assert.equal(C.setAnnexField.descriptor.causesEvent, 'core:event/annex-changed@1')
	})
})
