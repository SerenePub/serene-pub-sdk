/**
 * Location is a modular premade stat (owner ruling 2026-09-26): "Location
 * shouldn't be built in, other than a premade field. World location state
 * isn't a default. One genre might want characters in different places."
 *
 * `core:slot/location@1` attaches to the world AND the cast, reads right on
 * either, and holds free text OR a reference to a place entry
 * (`{ entryId }`, the lore-reference value items use). A genre opts in by
 * putting it on a sheet, and the sheet entry says which owner(s) carry it
 * (`appliesTo`, a narrowing of the declaration's). Places get no stat.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	checkSlotValue,
	defineAttributeSheet,
	defineAttributeSlot,
	getGenre,
	genreSheets,
	sheetSlotAppliesTo,
	slotListItemText,
	slotValueForStorage,
} from '@serene-pub/sdk'
import {
	ADVENTURE_SHEET,
	LAIR_SHEET,
	locationSlot,
	adventureGenre,
	lairGenre,
} from '@serene-pub/core-catalog'
import { formatSlotValue } from '@serene-pub/core-catalog/session-state'

describe('location is a premade stat, not a built-in', () => {
	test('it attaches to the world and the cast, and never to a place', () => {
		assert.deepEqual([...locationSlot.appliesTo].sort(), ['cast', 'world'])
		// Places get no default stats (owner, 2026-09-26).
		assert.equal(locationSlot.appliesTo.includes('location'), false)
	})

	test('its words read right on either owner', () => {
		const d = locationSlot.description
		const said = `${typeof d === 'string' ? d : d?.en} ${locationSlot.descriptor}`
		// Not the world-only line it was: "Where the scene is happening."
		assert.doesNotMatch(said, /^Where the scene is happening\./)
		assert.match(said, /character/i)
		assert.match(said, /world/i)
	})

	test('it takes free text or a reference to a place entry', () => {
		assert.deepEqual(locationSlot.config?.entryTypes, ['core:entry/location'])
		assert.equal(checkSlotValue(locationSlot, 'the harbour'), null)
		assert.equal(checkSlotValue(locationSlot, { entryId: 12 }), null)
		// A read fills the title in; it is a legal value to hand back.
		assert.equal(checkSlotValue(locationSlot, { entryId: 12, name: 'The Harbour' }), null)
		// A place is where somebody is, once: no held count.
		assert.match(checkSlotValue(locationSlot, { entryId: 12, count: 2 }) ?? '', /place|entry/i)
		assert.match(checkSlotValue(locationSlot, 7) ?? '', /text/)
		assert.match(checkSlotValue(locationSlot, 'x'.repeat(121)) ?? '', /120/)
	})

	test('a text slot that names no entry types still refuses a reference', () => {
		const note = defineAttributeSlot('test:slot/loc-note@1', {
			type: 'text',
			label: { en: 'Note' },
			descriptor: 'A note.',
			appliesTo: ['world'],
		})
		assert.match(checkSlotValue(note, { entryId: 3 }) ?? '', /text/)
	})

	test('a single reference is stored as its entry id alone, and reads by its title', () => {
		assert.deepEqual(slotValueForStorage({ entryId: 12, name: 'The Harbour' }), { entryId: 12 })
		assert.equal(slotListItemText({ entryId: 12, name: 'The Harbour' }), 'The Harbour')
		assert.equal(formatSlotValue({ entryId: 12, name: 'The Harbour' }), 'The Harbour')
		assert.equal(formatSlotValue({ entryId: 12 }), 'entry 12')
	})
})

describe('a sheet says which owner carries a slot', () => {
	test('Adventure and Lair keep location on the world, explicitly', () => {
		for (const sheet of [ADVENTURE_SHEET, LAIR_SHEET]) {
			const entry = sheet.slots.find((s) => s.id === locationSlot.id)
			assert.ok(entry, sheet.id)
			assert.deepEqual(entry?.appliesTo, ['world'], sheet.id)
			assert.deepEqual(sheetSlotAppliesTo(entry!, locationSlot), ['world'])
		}
		// …and the genres carry those sheets, so nothing they had moved.
		for (const g of [adventureGenre, lairGenre]) {
			const held = genreSheets(g.id).flatMap((s) => s.slots).find((s) => s.id === locationSlot.id)
			assert.deepEqual(held?.appliesTo, ['world'], g.id)
			assert.ok(getGenre(g.id))
		}
	})

	test('no narrowing means the declaration’s own owners', () => {
		assert.deepEqual([...sheetSlotAppliesTo({}, locationSlot)].sort(), ['cast', 'world'])
	})

	test('a genre may put location on the cast instead', () => {
		const sheet = defineAttributeSheet('test:sheet/wanderers@1', {
			label: { en: 'Wanderers' },
			slots: [{ id: locationSlot.id, appliesTo: ['cast'] }],
		})
		assert.deepEqual(sheetSlotAppliesTo(sheet.slots[0]!, locationSlot), ['cast'])
	})

	test('a sheet may only narrow, never widen or empty', () => {
		assert.throws(
			() =>
				defineAttributeSheet('test:sheet/bad-place@1', {
					label: { en: 'Bad' },
					slots: [{ id: locationSlot.id, appliesTo: ['location'] }],
				}),
			/location/,
		)
		assert.throws(
			() =>
				defineAttributeSheet('test:sheet/bad-empty@1', {
					label: { en: 'Bad' },
					slots: [{ id: locationSlot.id, appliesTo: [] }],
				}),
			/owner/i,
		)
	})
})
