/**
 * Attribute slots — the declaration registry and what a value has to satisfy.
 *
 * Core owns the five types and nobody adds one; a genre composes definitions
 * from them. These are the two halves that make that safe: a declaration that
 * cannot describe itself is refused at the author, and a value is checked
 * against the configuration in force for *its own owner* rather than against
 * the declaration's base.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	checkSlotValue,
	defineAttributeSlot,
	definePluginAttributeSlot,
	derivations,
	getAttributeSlot,
	resolveSlotConfig,
	slotAppliesTo,
	attributeSlots,
	_clearAttributeSlots,
} from '@serene-pub/sdk'

const hp = () =>
	defineAttributeSlot('core:slot/hp@1', {
		type: 'integer',
		label: { en: 'Health' },
		descriptor: 'How much punishment they can still take.',
		appliesTo: ['cast'],
		config: { min: 0, max: 20 },
		default: 20,
	})

const mood = () =>
	defineAttributeSlot('core:slot/mood@1', {
		type: 'enum',
		descriptor: 'How they are feeling right now.',
		appliesTo: ['cast'],
		config: { of: ['calm', 'wary', 'furious'] },
	})

describe('the registry', () => {
	test('declares, reads back, and lists', () => {
		_clearAttributeSlots()
		const decl = hp()
		assert.equal(getAttributeSlot('core:slot/hp@1'), decl)
		assert.deepEqual(
			attributeSlots().map((d) => d.id),
			['core:slot/hp@1'],
		)
	})

	test('refuses an id that is not an address', () => {
		_clearAttributeSlots()
		assert.throws(
			() =>
				defineAttributeSlot('hp', {
					type: 'integer',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/not a valid attribute slot id/,
		)
	})

	test('an identical re-declaration is a no-op; a different one throws', () => {
		_clearAttributeSlots()
		hp()
		assert.doesNotThrow(hp)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/hp@1', {
					type: 'integer',
					descriptor: 'Something else entirely.',
					appliesTo: ['cast'],
					config: { min: 0, max: 20 },
					default: 20,
				}),
			/duplicate attribute slot id/,
		)
	})

	test('copyediting the label is free; editing the descriptor is not', () => {
		_clearAttributeSlots()
		hp()
		assert.doesNotThrow(() =>
			defineAttributeSlot('core:slot/hp@1', {
				type: 'integer',
				label: { en: 'Hit points' },
				descriptor: 'How much punishment they can still take.',
				appliesTo: ['cast'],
				config: { min: 0, max: 20 },
				default: 20,
			}),
		)
	})

	test("a plugin may not claim core's namespace", () => {
		_clearAttributeSlots()
		assert.throws(
			() =>
				definePluginAttributeSlot('acme/rp', 'core:slot/hp@1', {
					type: 'integer',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/reserved/,
		)
	})

	test('a declaration that cannot describe itself is refused', () => {
		_clearAttributeSlots()
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/hp@1', {
					type: 'integer',
					descriptor: '  ',
					appliesTo: ['cast'],
				}),
			/declares no descriptor/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/mood@1', {
					type: 'enum',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/enum with no options/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/age@1', {
					type: 'derived',
					descriptor: 'x',
					appliesTo: ['cast'],
					config: { derivation: 'core:derive/vibes@1' },
				}),
			/not one of core's/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/age@1', {
					type: 'derived',
					descriptor: 'x',
					appliesTo: ['cast'],
					config: { derivation: derivations.age.id },
				}),
			/declare config\.from/,
		)
	})
})

describe('validation', () => {
	test('an integer is checked against the config in force, not the declaration', () => {
		_clearAttributeSlots()
		const decl = hp()
		assert.equal(checkSlotValue(decl, 12), null)
		assert.match(String(checkSlotValue(decl, 35)), /does not go above 20/)
		// This character's cap is 40 — the whole point of attaching a slot.
		const attached = resolveSlotConfig(decl, { max: 40 })
		assert.equal(checkSlotValue(decl, 35, attached), null)
	})

	test('an enum takes only what its owner declares', () => {
		_clearAttributeSlots()
		const decl = mood()
		assert.equal(checkSlotValue(decl, 'wary'), null)
		assert.match(String(checkSlotValue(decl, 'smug')), /is not/)
	})

	test('null is always legal — it is how a layer says "inherit again"', () => {
		_clearAttributeSlots()
		assert.equal(checkSlotValue(hp(), null), null)
	})

	test('a derived slot has no value to set', () => {
		_clearAttributeSlots()
		hp()
		const age = defineAttributeSlot('core:slot/age@1', {
			type: 'derived',
			descriptor: 'How old they are.',
			appliesTo: ['cast'],
			config: { derivation: derivations.age.id, from: 'core:slot/hp@1' },
		})
		assert.match(String(checkSlotValue(age, 30)), /is derived/)
	})

	test('deviations merge; a later layer does not drop an earlier key', () => {
		_clearAttributeSlots()
		const decl = hp()
		assert.deepEqual(resolveSlotConfig(decl, { max: 40 }, { min: -5 }), {
			min: -5,
			max: 40,
		})
	})

	test('appliesTo collapses the five owner kinds to the two a declaration knows', () => {
		_clearAttributeSlots()
		assert.equal(slotAppliesTo(hp(), 'cast'), true)
		assert.equal(slotAppliesTo(hp(), 'world'), false)
	})
})
