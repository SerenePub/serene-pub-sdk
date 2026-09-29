/**
 * Attributes phase 3c — the arithmetic behind a list's lorebook picker and
 * its count steppers (`core-catalog/session-state` shapes): which entries
 * are offered and in what order, what a count field accepts, and what
 * adding and stepping a held reference writes. The component that draws
 * them is `coreStateWidgets.test.ts`'s.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { itemEntryType } from '@serene-pub/core-catalog'
import {
	ITEM_ENTRY_TYPE_ID,
	countDraftFor,
	listWithRefAdded,
	listWithRefStep,
	pickableEntries,
	slotTakesLoreRefs,
} from '@serene-pub/core-catalog/session-state'

describe('the lorebook picker (phase 3c)', () => {
	test("the item type id is the catalogue's, without its version", () => {
		assert.equal(ITEM_ENTRY_TYPE_ID, itemEntryType.id.replace(/@\d+$/, ''))
	})

	test('a list closed over words takes no lore references, so it is offered no picker', () => {
		assert.equal(slotTakesLoreRefs({}), true)
		assert.equal(slotTakesLoreRefs({ maxItems: 3 }), true)
		assert.equal(slotTakesLoreRefs({ of: ['a', 'b'] }), false)
	})

	test('items first, then the rest of the book; each entry once; what the list holds is said', () => {
		const held = ['rope', { entryId: 3, count: 2 }]
		const offered = pickableEntries(held, [
			[
				{ id: 3, typeId: ITEM_ENTRY_TYPE_ID, title: 'Rusty key' },
				{ id: 4, typeId: ITEM_ENTRY_TYPE_ID, title: '  ' },
			],
			[
				{ id: 9, typeId: 'core:entry/world-lore', title: 'Umber City' },
				{ id: 3, typeId: ITEM_ENTRY_TYPE_ID, title: 'Rusty key' },
				{ id: 5, typeId: ITEM_ENTRY_TYPE_ID, title: 'Lantern' },
			],
		])
		assert.deepEqual(
			offered.map((e) => [e.entryId, e.title, e.item, e.held]),
			[
				[3, 'Rusty key', true, 2],
				[4, '#4', true, 0],
				[5, 'Lantern', true, 0],
				[9, 'Umber City', false, 0],
			],
		)
	})

	test('a count is a whole number of at least one; anything else is refused', () => {
		assert.equal(countDraftFor(3), 3)
		assert.equal(countDraftFor('2'), 2)
		for (const bad of [0, -1, 1.5, '', null, undefined, 'x']) assert.equal(countDraftFor(bad), undefined, String(bad))
	})

	test('adding sums onto what is held, a new reference goes last, and one is stored bare', () => {
		assert.deepEqual(listWithRefAdded(['rope'], 7, 1, {}), { value: ['rope', { entryId: 7 }], refusal: null })
		assert.deepEqual(listWithRefAdded(['rope', { entryId: 7, name: 'Key' }], 7, 2, {}).value, ['rope', { entryId: 7, count: 3 }])
		assert.deepEqual(listWithRefAdded([], 7, 4, {}).value, [{ entryId: 7, count: 4 }])
		// Over the list's limit: refused, nothing dropped to make room.
		const full = listWithRefAdded(['a', 'b'], 7, 1, { maxItems: 2 })
		assert.deepEqual(full.value, ['a', 'b'])
		assert.match(full.refusal!, /at most 2 items/)
		// Adding more of something already held never grows the list, so it is never over.
		assert.deepEqual(listWithRefAdded(['a', { entryId: 7 }], 7, 1, { maxItems: 2 }).value, ['a', { entryId: 7, count: 2 }])
	})

	test('stepping: one more, one fewer, and one fewer than one takes it out', () => {
		const held = ['rope', { entryId: 7, count: 2, name: 'Key' }]
		assert.deepEqual(listWithRefStep(held, 7, 1), ['rope', { entryId: 7, count: 3 }])
		assert.deepEqual(listWithRefStep(held, 7, -1), ['rope', { entryId: 7 }])
		assert.deepEqual(listWithRefStep(['rope', { entryId: 7 }], 7, -1), ['rope'])
		assert.deepEqual(listWithRefStep(['rope', { entryId: 7 }], 7, 1), ['rope', { entryId: 7, count: 2 }])
	})
})
