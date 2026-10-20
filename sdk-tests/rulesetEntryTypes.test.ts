/**
 * 🚧 Derived entry types (rulesets §21 amendment, W3-S 2026-10-16).
 *
 * Every entryable repertoire yields an entry type
 * `<creator>:entry/<ruleset>.<repertoire>@1` whose fields are the
 * repertoire's whole piece shape plus the universal entry parts core's types
 * declare. Core's five stay as they were; a plugin ruleset derives its own
 * under its namespace; a hand-written plugin type is still refused.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	allEntryTypes,
	definePluginRuleset,
	defineRepertoire,
	describeEntryType,
	derivedEntryTypeSource,
	getDefinition,
	rulesetEntryTypeDecls,
	RulesetError,
	type EntryDescriptor,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const ids = (ts: readonly { id: string }[]) => ts.map((t) => t.id)

describe('derived entry types — core rulesets', () => {
	test('Story derives things and conditions; Vis Itineris derives its eight', () => {
		assert.deepEqual(ids(cat.RULESET_ENTRY_TYPES), [
			'core:entry/freeform.things@1',
			'core:entry/freeform.conditions@1',
			'core:entry/vis-itineris.weapons@1',
			'core:entry/vis-itineris.armour@1',
			'core:entry/vis-itineris.gear@1',
			'core:entry/vis-itineris.consumables@1',
			'core:entry/vis-itineris.spells@1',
			'core:entry/vis-itineris.feats@1',
			'core:entry/vis-itineris.conditions@1',
			'core:entry/vis-itineris.creatures@1',
		])
		for (const t of cat.RULESET_ENTRY_TYPES) assert.equal(getDefinition(t.id)?.kind, 'entry', t.id)
	})

	test("each one's fields are its repertoire's piece shape plus the universal fields", () => {
		const universal = cat.ENTRY_UNIVERSAL_PARTS
		for (const t of cat.RULESET_ENTRY_TYPES) {
			const src = derivedEntryTypeSource(t.id)
			assert.ok(src, t.id)
			assert.deepEqual(t.entryShape.fields, { ...src.repertoire.piece.fields, ...universal.fields }, t.id)
			for (const k of ['name', 'description', 'prose', 'traits']) assert.ok(k in t.entryShape.fields!, `${t.id} ${k}`)
			assert.deepEqual(t.entryShape.roles, universal.roles, t.id)
			assert.equal(t.entryShape.sourceKind, universal.sourceKind)
			assert.equal(t.entryShape.render, universal.render)
			assert.equal(t.entryShape.amendMode, universal.amendMode)
			assert.equal(t.entryShape.exportKey, undefined, 'no importer reads a derived type yet')
		}
	})

	test('the universal parts are the ones core types declare, not a copy', () => {
		assert.equal(cat.ENTRY_UNIVERSAL_PARTS.fields.priority, cat.worldLoreEntryType.entryShape.fields!.priority)
		assert.equal(cat.ENTRY_UNIVERSAL_PARTS.fields.supply, cat.itemEntryType.entryShape.fields!.supply)
		assert.equal(cat.ENTRY_UNIVERSAL_PARTS.fields.supplyLimit, cat.itemEntryType.entryShape.fields!.supplyLimit)
		assert.deepEqual(cat.ENTRY_UNIVERSAL_PARTS.roles, cat.itemEntryType.entryShape.roles)
	})

	test("core's five are untouched", () => {
		const handWritten = allEntryTypes().filter((t) => !t.id.slice(t.id.indexOf('/') + 1).includes('.'))
		assert.deepEqual(ids(handWritten), [
			'core:entry/world-lore@1',
			'core:entry/character-lore@1',
			'core:entry/history@1',
			'core:entry/location@1',
			'core:entry/item@1',
		])
		assert.deepEqual(ids(cat.CORE_ENTRY_TYPES), ids(handWritten))
		assert.deepEqual(Object.keys(cat.itemEntryType.entryShape.fields!), ['category', 'priority', 'supply', 'supplyLimit'])
	})

	test('re-deriving is a no-op', () => {
		assert.deepEqual(ids(cat.deriveEntryTypes(cat.freeformRuleset)), ids(cat.RULESET_ENTRY_TYPES.slice(0, 2)))
	})
})

describe('derived entry types — a plugin ruleset', () => {
	const blades = defineRepertoire('blades', {
		label: { en: 'Blades' },
		piece: { type: 'object', fields: { reach: { type: 'integer', label: { en: 'Reach' } } } },
		prose: 'Blades: what a duellist fights with.',
		entryable: true,
	})
	const scars = defineRepertoire('scars', { label: { en: 'Scars' }, prose: 'Scars: what a duel leaves.' })
	const duel = definePluginRuleset('acme.duel', 'acme:ruleset/duel@1', {
		name: { en: 'Duel' },
		voice: { prose: 'Duels are fought in words and steel.' },
		conventions: {
			degrees: { bands: [{ id: 'miss', label: { en: 'Miss' }, five: 'fail' }, { id: 'hit', label: { en: 'Hit' }, five: 'success' }] },
			time: { unit: 'scene' },
		},
		stats: [],
		repertoires: [blades, scars],
	})

	test('derives its own under its namespace, only for entryable repertoires', () => {
		const types: EntryDescriptor[] = cat.deriveEntryTypes(duel)
		assert.deepEqual(ids(types), ['acme:entry/duel.blades@1'])
		assert.deepEqual(types[0]!.entryShape.fields, { ...blades.piece.fields, ...cat.ENTRY_UNIVERSAL_PARTS.fields })
		assert.equal(derivedEntryTypeSource('acme:entry/duel.blades@1')?.repertoire.id, 'blades')
		assert.equal(derivedEntryTypeSource('acme:entry/duel.scars@1'), undefined)
	})

	test('a hand-written plugin entry type is still refused, derived name or not', () => {
		assert.throws(() => describeEntryType({ id: 'acme:entry/duel.blades@1', roles: {}, sourceKind: 'worldLore' }), /deriveRulesetEntryTypes/)
	})

	test('a piece field named like a universal entry field is refused', () => {
		const ranked = defineRepertoire('ranked', {
			label: { en: 'Ranked' },
			piece: { type: 'object', fields: { priority: { type: 'integer', label: { en: 'Priority' } } } },
			prose: 'Ranked things.',
			entryable: true,
		})
		assert.throws(
			() => rulesetEntryTypeDecls({ id: 'acme:ruleset/ranked@1', repertoires: [ranked] }, cat.ENTRY_UNIVERSAL_PARTS),
			(e: unknown) => e instanceof RulesetError && e.findings.some((f) => f.startsWith('[entry-field-collision]')),
		)
	})
})
