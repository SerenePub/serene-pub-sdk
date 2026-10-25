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
		// Its own wire name, like a place: it travels as an item.
		assert.equal(itemEntryType.entryShape.exportKey, 'item')
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

	// 🚧 RF fix 8 (2026-10-23): no genre carries it — what someone holds is the
	// rules' entry types in the host's carried zone, which every session has.
	test('no genre carries it any more; a genre plays best with somewhere to keep what they carry', () => {
		for (const id of ['core:genre/story', 'core:genre/lair', 'core:genre/chat', 'core:genre/guide']) {
			const g = getGenre(id)!
			assert.ok(g, id)
			for (const key of ['slots', 'sheets', 'customAttributes']) assert.equal(key in g, false, `${id} has no ${key}`)
		}
		const zones = getGenre('core:genre/story')!.uses?.optional?.zoneTypes ?? []
		assert.ok(zones.some((z) => z.tag === 'inventory'), 'Story plays best with an inventory zone')
	})
})

// Phase 3b's supply check rode Adventure's keeper (`keeperResolve.supply`),
// retired with its reply on 2026-10-19: Story's reckoning hands a thing
// gained or lost to the ruleset handler as a piece, never an inventory line
// by entry id, so it has no item line to check. Rest's keeper writes none
// either. (Lane 1 report: supply for Story is the handler's, or a follow-up.)

// 2026-09-27 (owner ruling): Lair checks item supply. Since its rewrite
// (2026-10-21) its books are the keeper routine — Story's reckoning graph —
// whose words arm resolves its item lines against `core:query/item-supply@1`,
// so a unique item already held is refused there too.
describe('Lair enforces item supply (2026-09-27; the keeper routine since 2026-10-21)', () => {
	test("the keeper wires core:query/item-supply@1 into the words arm's resolver", async () => {
		const { coreAnnouncement } = await import('@serene-pub/core-catalog')
		const keeper = (coreAnnouncement().document as any).pipelines.find((p: any) => p.id === 'core:spec/lair-keeper')
		const supplyNode = keeper.nodes.find((n: any) => n.key === 'reckon.on.supply')
		assert.equal(supplyNode?.definitionId, 'core:query/item-supply')
		const resolve = keeper.nodes.find((n: any) => n.key === 'reckon.on.commit.words.resolve')
		assert.ok(resolve, 'the keeper resolver')
		assert.deepEqual(resolve.config.supply, { __ref: 'data', node: supplyNode.key, port: 'supply' })
		// The reply keeps no books of its own any more.
		const reply = (coreAnnouncement().document as any).pipelines.find((p: any) => p.id === 'core:spec/lair-reply')
		assert.ok(!reply.nodes.some((n: any) => n.definitionId === 'core:query/item-supply'))
	})
})

// 2026-09-27 (owner ruling): the keeper's item arm is `inventory`, the stat it
// resolves onto — `possessions` is gone from every shipped schema, prompt and
// preset, with no alias (owner: the SDK is undistributed, keep it clean).
describe("the keeper's item arm is `inventory` (2026-09-27)", () => {
	const KEEPERS: Array<[slug: string, nodeKey: string]> = [
		// Story's Rest (Adventure's keeper action until 2026-10-19). The Lair's
		// keeper answers in deltas since its rewrite (2026-10-21): no lists.
		['core:spec/story-rest', 'write'],
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
			// 🚧 S3 (2026-10-23): a value is named by the session's own words (`{{slots}}`), never a hard-coded list.
			assert.deepEqual(schema.properties.values.items.properties.slot.enum, undefined, slug)
			// 🚧 Rest's keeper also answers a `clock` list (live scenes ★3,
			// lane F, 2026-10-13); the Lair's does not.
			assert.deepEqual(
				schema.required,
				slug === 'core:spec/story-rest' ? ['values', 'inventory', 'clock'] : ['values', 'inventory'],
				slug,
			)
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
		// Every prompt that answers the keeper's document: Story's Rest (a
		// third list, `clock`, since live scenes ★3). Adventure's keeper and
		// Advance time left with it (2026-10-19); the Lair's keeper answers in
		// deltas since its rewrite (2026-10-21).
		const keepers = (CORE_PROMPTS as any[]).filter((p) =>
			/holding (two|three) lists/.test(JSON.stringify(p.fields)),
		)
		assert.equal(keepers.length, 1)
		for (const p of keepers) {
			assert.ok(!JSON.stringify(p.fields).includes('possessions'), p.seedKey)
			assert.ok(JSON.stringify(p.fields).includes('- inventory:'), p.seedKey)
		}
	})
})
