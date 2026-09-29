/**
 * Attributes phase 3a — items (DESIGN-attributes-shapes; owner rulings
 * 2026-09-25/26): a lore entry type for things (`core:entry/item@1`) whose
 * SUPPLY is unique, limited to N, or unlimited; a list item that references
 * an entry carries a HELD COUNT (`{ entryId, count? }`); an `inventory` list
 * slot core seeds and no genre switches on for Chat. Counts live in both
 * places — the entry's supply and each holder's count — and the host never
 * enforces the supply: genre pipelines do, reading what the helpers here say.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	applyListOp,
	checkSlotValue,
	defineAttributeSlot,
	genreSlots,
	getGenre,
	heldCountIn,
	slotListItemText,
	slotLoreRefCount,
	slotValueForStorage,
	slotStatShapeId,
	slotPickable,
} from '@serene-pub/sdk'
import {
	CORE_ENTRY_TYPES,
	ITEM_SUPPLY_MODES,
	inventorySlot,
	itemEntryType,
	itemSupplyOf,
	listStatShape,
	remainingItemSupply,
} from '@serene-pub/core-catalog'
import { formatSlotValue, listItemText } from '@serene-pub/core-catalog/session-state'

const bag = defineAttributeSlot('test:slot/held-bag@1', {
	shape: 'core:stat-shape/list@1',
	label: { en: 'Bag' },
	descriptor: 'What they carry.',
	appliesTo: ['cast'],
})

describe('the item entry type', () => {
	test('is declared, registered and core-authored, with a supply and a limit', () => {
		assert.equal(itemEntryType.id, 'core:entry/item@1')
		assert.ok(CORE_ENTRY_TYPES.includes(itemEntryType))
		const fields = itemEntryType.entryShape.fields!
		assert.equal(fields.supply!.type, 'enum')
		assert.deepEqual((fields.supply as { of?: readonly string[] }).of, ['unique', 'limited', 'unlimited'])
		assert.deepEqual([...ITEM_SUPPLY_MODES], ['unique', 'limited', 'unlimited'])
		assert.equal(fields.supply!.default, 'unlimited')
		assert.equal(fields.supplyLimit!.type, 'integer')
		assert.equal(fields.supplyLimit!.min, 1)
		// World lore's band and layout: an item is a thing in the world.
		assert.equal(itemEntryType.entryShape.sourceKind, 'worldLore')
		assert.equal(itemEntryType.entryShape.render, 'core:var/world-lore@1')
		// No wire name, like a place: exported, it reads back as world lore.
		assert.equal(itemEntryType.entryShape.exportKey, undefined)
	})

	test('reads its supply off the entry fields, one reader for every mode', () => {
		assert.deepEqual(itemSupplyOf({ supply: 'unique' }), { mode: 'unique', limit: 1 })
		assert.deepEqual(itemSupplyOf({ supply: 'limited', supplyLimit: 3 }), { mode: 'limited', limit: 3 })
		assert.deepEqual(itemSupplyOf({ supply: 'unlimited', supplyLimit: 3 }), { mode: 'unlimited', limit: null })
		// Absent is the declared default; a limited supply with no number is
		// not a bound anybody could enforce, so it reads as unlimited.
		assert.deepEqual(itemSupplyOf({}), { mode: 'unlimited', limit: null })
		assert.deepEqual(itemSupplyOf({ supply: 'limited' }), { mode: 'unlimited', limit: null })
		assert.deepEqual(itemSupplyOf({ supply: 'bogus' }), { mode: 'unlimited', limit: null })
	})

	test('remaining supply = limit − Σ held, never below zero; unlimited is null', () => {
		assert.equal(remainingItemSupply({ mode: 'limited', limit: 5 }, 2), 3)
		assert.equal(remainingItemSupply({ mode: 'unique', limit: 1 }, 1), 0)
		// Over-held (a pipeline that did not check) reads as none left, not as debt.
		assert.equal(remainingItemSupply({ mode: 'limited', limit: 2 }, 5), 0)
		assert.equal(remainingItemSupply({ mode: 'unlimited', limit: null }, 40), null)
	})
})

describe('held counts on lore references', () => {
	test('a reference carries an optional whole count of at least one', () => {
		assert.equal(checkSlotValue(bag, [{ entryId: 7, count: 3 }, 'rope']), null)
		assert.equal(checkSlotValue(bag, [{ entryId: 7, count: 1, name: 'Key' }]), null)
		assert.match(checkSlotValue(bag, [{ entryId: 7, count: 0 }])!, /count of at least 1/)
		assert.match(checkSlotValue(bag, [{ entryId: 7, count: 1.5 }])!, /count of at least 1/)
		assert.match(checkSlotValue(bag, [{ entryId: 7, count: '2' } as never])!, /count of at least 1/)
		assert.equal(slotLoreRefCount({ entryId: 7 }), 1)
		assert.equal(slotLoreRefCount({ entryId: 7, count: 4 }), 4)
	})

	test('an entry is held once per list, whatever `unique` says — the count is the multiplicity', () => {
		const pile = defineAttributeSlot('test:slot/held-pile@1', {
			shape: 'core:stat-shape/list@1',
			label: { en: 'Pile' },
			descriptor: 'A pile.',
			appliesTo: ['world'],
			config: { unique: false },
		})
		// Words may still repeat in a non-unique list …
		assert.equal(checkSlotValue(pile, ['ration', 'ration']), null)
		// … but a reference twice is two answers to "how many".
		assert.match(checkSlotValue(pile, [{ entryId: 7 }, { entryId: 7, count: 2 }])!, /lore entry 7 is in it twice/)
	})

	test('storage keeps the count and drops the read-filled name', () => {
		assert.deepEqual(slotValueForStorage([{ entryId: 7, count: 2, name: 'Key' }, 'rope']), [
			{ entryId: 7, count: 2 },
			'rope',
		])
	})

	test('add with a count adds to what is held; add without one is a set add', () => {
		assert.deepEqual(applyListOp([{ entryId: 7, count: 2 }], 'add', [{ entryId: 7, count: 3 }]).value, [
			{ entryId: 7, count: 5 },
		])
		// An uncounted holding is one of it.
		assert.deepEqual(applyListOp([{ entryId: 7 }], 'add', [{ entryId: 7, count: 1 }]).value, [
			{ entryId: 7, count: 2 },
		])
		// No count: "it is in the list", exactly as before — a clue is not found twice.
		assert.deepEqual(applyListOp([{ entryId: 7, count: 2 }], 'add', [{ entryId: 7 }]).value, [
			{ entryId: 7, count: 2 },
		])
		assert.deepEqual(applyListOp(['rope'], 'add', [{ entryId: 9, count: 2 }]).value, ['rope', { entryId: 9, count: 2 }])
		// Even in a list that lets words repeat, a reference merges by entry.
		assert.deepEqual(
			applyListOp([{ entryId: 7 }], 'add', [{ entryId: 7 }], { unique: false }).value,
			[{ entryId: 7 }],
		)
	})

	test('remove with a count takes that many; to zero or below drops it; without one drops it', () => {
		assert.deepEqual(applyListOp([{ entryId: 7, count: 5 }], 'remove', [{ entryId: 7, count: 2 }]).value, [
			{ entryId: 7, count: 3 },
		])
		assert.deepEqual(applyListOp([{ entryId: 7, count: 2 }, 'rope'], 'remove', [{ entryId: 7, count: 2 }]).value, ['rope'])
		assert.deepEqual(applyListOp([{ entryId: 7, count: 2 }], 'remove', [{ entryId: 7, count: 9 }]).value, [])
		assert.deepEqual(applyListOp([{ entryId: 7, count: 5 }], 'remove', [{ entryId: 7 }]).value, [])
		// Not there: the state asked for is the state afterwards.
		assert.deepEqual(applyListOp(['rope'], 'remove', [{ entryId: 7, count: 1 }]).value, ['rope'])
	})

	// Phase 4 (2026-09-26): one held has ONE spelling. The 3b move stored a
	// single item bare while a remove down to one stored `count: 1`; the
	// canonical form is bare (`slotLoreRefCount` reads absent as 1), and every
	// writer — the list ops and the storage door — says it that way.
	test('a count of one is stored bare — the one spelling of a single item', () => {
		assert.deepEqual(applyListOp([{ entryId: 7, count: 3 }], 'remove', [{ entryId: 7, count: 2 }]).value, [
			{ entryId: 7 },
		])
		assert.deepEqual(applyListOp([], 'add', [{ entryId: 7, count: 1 }]).value, [{ entryId: 7 }])
		assert.deepEqual(applyListOp([{ entryId: 7, count: 2, name: 'Key' }], 'remove', [{ entryId: 7, count: 1 }]).value, [
			{ entryId: 7, name: 'Key' },
		])
		assert.deepEqual(slotValueForStorage([{ entryId: 7, count: 1, name: 'Key' }, 'rope']), [{ entryId: 7 }, 'rope'])
		assert.equal(heldCountIn(applyListOp([{ entryId: 7, count: 2 }], 'remove', [{ entryId: 7, count: 1 }]).value, 7), 1)
	})

	test('heldCountIn sums one entry across a value; a word never counts', () => {
		assert.equal(heldCountIn([{ entryId: 7, count: 3 }, 'rope', { entryId: 9 }], 7), 3)
		assert.equal(heldCountIn([{ entryId: 9 }], 9), 1)
		assert.equal(heldCountIn(['7'], 7), 0)
		assert.equal(heldCountIn(null, 7), 0)
		assert.equal(heldCountIn(4, 7), 0)
	})

	test('a reference reads as its title and its count, never as an object', () => {
		assert.equal(slotListItemText({ entryId: 7, count: 2, name: 'Rusty key' }), 'Rusty key ×2')
		assert.equal(slotListItemText({ entryId: 7, count: 1, name: 'Rusty key' }), 'Rusty key')
		assert.equal(slotListItemText({ entryId: 7, count: 3 }), 'entry 7 ×3')
		assert.equal(slotListItemText('rope'), 'rope')
		assert.equal(formatSlotValue(['rope', { entryId: 7, count: 2, name: 'Rusty key' }]), 'rope, Rusty key ×2')
		assert.equal(listItemText({ entryId: 7, count: 2, name: 'Rusty key' }), 'Rusty key ×2')
		assert.equal(listItemText({ entryId: 9, count: 2 }), 'Lore entry 9 ×2')
	})
})

describe('the inventory slot', () => {
	test('is a seeded list stat for a character, the world or a location, picked rather than forced', () => {
		assert.equal(inventorySlot.id, 'core:slot/inventory@1')
		assert.equal(slotStatShapeId(inventorySlot), listStatShape.id)
		assert.equal(inventorySlot.type, 'list')
		// Phase 4: a place holds what is lying in it, so a location carries it too.
		assert.deepEqual([...inventorySlot.appliesTo].sort(), ['cast', 'location', 'world'])
		assert.equal(slotPickable(inventorySlot), true)
	})

	// Phase 3b: Adventure and Lair carry it on their sheets (possessions-as-
	// edges retired onto it); every other genre still does not.
	test('Adventure and Lair carry it; no other genre switches it on — Chat above all', () => {
		for (const id of ['core:genre/adventure', 'core:genre/lair']) {
			assert.ok(genreSlots(id).some((s) => s.id === inventorySlot.id), id)
			const sheet = getGenre(id)!.sheets?.[0] as { slots?: Array<{ id: string }> } | undefined
			assert.ok(sheet?.slots?.some((s) => s.id === inventorySlot.id), `${id}'s sheet`)
		}
		for (const id of ['core:genre/chat', 'core:genre/whodunit', 'core:genre/guide', 'core:genre/writing-room']) {
			assert.ok(getGenre(id), id)
			assert.ok(!genreSlots(id).some((s) => s.id === inventorySlot.id), id)
		}
		// Chat denies custom attributes, so a Chat session cannot pick it either.
		assert.notEqual(getGenre('core:genre/chat')!.customAttributes, 'allow')
	})
})

// Phase 3b: supply is a genre pipeline's to enforce, and Adventure does — its
// respond spec reads the item supply into the keeper's resolver, which refuses
// an item line past what is left.
describe("Adventure enforces item supply (phase 3b)", () => {
	test('the respond spec wires core:query/item-supply@1 into keeperResolve.supply', async () => {
		const { coreAnnouncement } = await import('@serene-pub/core-catalog')
		const respond = (coreAnnouncement().document as any).pipelines.find(
			(p: any) => p.id === 'core:spec/adventure-respond',
		)
		const supplyNode = respond.nodes.find((n: any) => n.definitionId === 'core:query/item-supply')
		assert.ok(supplyNode, 'an item-supply query')
		const resolve = respond.nodes.find((n: any) => n.key === 'keeperResolve')
		assert.deepEqual(resolve.config.supply, { __ref: 'data', node: supplyNode.key, port: 'supply' })
	})
})

// 2026-09-27 (owner ruling): Lair checks item supply like Adventure — its
// keeper's resolver reads `core:query/item-supply@1` inside the `keep.played`
// branch, so a unique item already held is refused there too.
describe('Lair enforces item supply (2026-09-27)', () => {
	test('the respond spec wires core:query/item-supply@1 into keep.played.keeperResolve.supply', async () => {
		const { coreAnnouncement } = await import('@serene-pub/core-catalog')
		const respond = (coreAnnouncement().document as any).pipelines.find(
			(p: any) => p.id === 'core:spec/lair-respond',
		)
		const supplyNode = respond.nodes.find((n: any) => n.definitionId === 'core:query/item-supply')
		assert.ok(supplyNode, 'an item-supply query')
		const resolve = respond.nodes.find((n: any) => n.key === 'keep.played.keeperResolve')
		assert.ok(resolve, 'the keeper resolver')
		assert.deepEqual(resolve.config.supply, { __ref: 'data', node: supplyNode.key, port: 'supply' })
	})
})

// 2026-09-27 (owner ruling): the keeper's item arm is `inventory`, the stat it
// resolves onto — `possessions` is gone from every shipped schema, prompt and
// preset, with no alias (owner: the SDK is undistributed, keep it clean).
describe("the keeper's item arm is `inventory` (2026-09-27)", () => {
	const KEEPERS: Array<[slug: string, nodeKey: string]> = [
		['core:spec/adventure-respond', 'keeperWrite'],
		['core:spec/lair-respond', 'keep.played.keeperWrite'],
		['core:spec/whodunit-respond', 'keeperWrite'],
	]
	test('each keeper schema names `inventory`, required, and never `possessions`', async () => {
		const { coreAnnouncement } = await import('@serene-pub/core-catalog')
		const pipelines = (coreAnnouncement().document as any).pipelines
		for (const [slug, key] of KEEPERS) {
			const doc = pipelines.find((p: any) => p.id === slug)
			const node = doc.nodes.find((n: any) => n.key === key)
			const schema = node?.config?.schema
			assert.ok(schema?.properties?.inventory, `${slug} ${key}`)
			assert.ok(!('possessions' in schema.properties), slug)
			assert.deepEqual(schema.required, ['values', 'inventory'], slug)
		}
	})
	test('every shipped preset selects `values,inventory` and no JSON path names `possessions`', async () => {
		const { coreAnnouncement } = await import('@serene-pub/core-catalog')
		const pipelines = (coreAnnouncement().document as any).pipelines
		for (const [slug, key] of KEEPERS) {
			const doc = pipelines.find((p: any) => p.id === slug)
			const preset = doc.presets.find((p: any) => p.default)
			const value = preset.values.find((v: any) => v.nodeKey === key)?.value
			assert.deepEqual(value, { path: 'values,inventory' }, slug)
		}
		assert.ok(!JSON.stringify(pipelines).includes('possessions'), 'no shipped pipeline names possessions')
	})
	test('no shipped keeper prompt asks for `possessions`', async () => {
		const { CORE_PROMPTS } = await import('@serene-pub/core-catalog')
		// Every prompt that answers the two-armed document: the three keepers,
		// Adventure's Rest and Advance time, and Whodunit's search.
		const keepers = (CORE_PROMPTS as any[]).filter((p) => JSON.stringify(p.fields).includes('holding two lists'))
		assert.equal(keepers.length, 6)
		for (const p of keepers) {
			assert.ok(!JSON.stringify(p.fields).includes('possessions'), p.seedKey)
			assert.ok(JSON.stringify(p.fields).includes('- inventory:'), p.seedKey)
		}
	})
})
