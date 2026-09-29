/**
 * Attributes phase 2 — stat shapes (DESIGN-attributes-shapes; owner answers
 * 2026-09-26): a slot's value is a `FieldDecl`, named from core's seeded
 * catalogue (number/bar, choice, list, story time) or written inline; each
 * shape validates and stores through the one `checkSlotValue` / `applyListOp`
 * gate; story time has one comparator.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	applyListOp,
	checkSlotValue,
	compareStoryTimes,
	defineAttributeSlot,
	defineStatShape,
	fieldForSlotType,
	fieldSlotConfig,
	formatStoryTime,
	getAttributeSlot,
	getStatShape,
	isSlotLoreRef,
	parseStoryTime,
	resolveSlotConfig,
	slotField,
	slotStatShapeId,
	slotStatShapeKind,
	slotValueForStorage,
	statShapeKindOf,
	statShapes,
	storyTimeText,
	type SlotValue,
} from '@serene-pub/sdk'
import {
	CORE_STAT_SHAPES,
	choiceStatShape,
	hpSlot,
	listStatShape,
	moodSlot,
	numberStatShape,
	storyTimeStatShape,
} from '@serene-pub/core-catalog'

let n = 0
/** A fresh slot id per declaration: the registry is process-wide. */
const nextId = (name: string) => `test:slot/${name}-${++n}@1`
const slot = (name: string, props: Record<string, unknown>) =>
	defineAttributeSlot(nextId(name), { descriptor: `The ${name}.`, appliesTo: ['cast', 'world'], ...props } as never)

describe("core's seeded catalogue", () => {
	test('four shapes, in picker order, each a FieldDecl core can keep', () => {
		assert.deepEqual(
			CORE_STAT_SHAPES.map((s) => s.id),
			['core:stat-shape/number@1', 'core:stat-shape/choice@1', 'core:stat-shape/list@1', 'core:stat-shape/story-time@1'],
		)
		assert.deepEqual(numberStatShape.field, { type: 'integer' })
		assert.deepEqual(choiceStatShape.field, { type: 'enum' })
		assert.deepEqual(listStatShape.field, { type: 'list', item: { type: 'string' } })
		assert.deepEqual(storyTimeStatShape.field, { type: 'string', format: 'story-time' })
		assert.deepEqual(
			CORE_STAT_SHAPES.map((s) => statShapeKindOf(s.field)),
			['number', 'choice', 'list', 'story-time'],
		)
		for (const s of CORE_STAT_SHAPES) assert.equal(getStatShape(s.id), s)
		assert.ok(statShapes().length >= 4)
	})

	test("core's own slots name catalogue shapes; the type is read off the shape", () => {
		assert.equal(slotStatShapeId(hpSlot), 'core:stat-shape/number@1')
		assert.equal(hpSlot.type, 'integer')
		assert.equal(slotStatShapeKind(hpSlot), 'number')
		assert.equal(slotStatShapeId(moodSlot), 'core:stat-shape/choice@1')
		assert.equal(moodSlot.type, 'enum')
		// The shape bounds nothing; the slot's config is the opening offer.
		assert.deepEqual(resolveSlotConfig(hpSlot), { min: 0, max: 20 })
		// The sprite set (a mechanism's) keeps its bare type, and reads as text.
		assert.equal(slotStatShapeKind(getAttributeSlot('core:slot/sprite-set@1')!), 'text')
	})
})

describe('declaring a stat shape', () => {
	test('refuses a bad id, missing display text and a field core cannot keep', () => {
		assert.throws(() => defineStatShape('test:shape/bar@1', { label: 'Bar', field: { type: 'integer' } }), /stat shape id/)
		assert.throws(() => defineStatShape('test:stat-shape/nameless@1', { label: '', field: { type: 'integer' } }), /R-20/)
		assert.throws(
			() => defineStatShape('test:stat-shape/split@1', { label: 'Split', field: { type: 'share' } }),
			/not a value core can keep as a stat/,
		)
		assert.throws(
			() => defineStatShape('test:stat-shape/grid@1', { label: 'Grid', field: { type: 'list', item: { type: 'object' } } }),
			/not a value core can keep/,
		)
	})

	test('an identical re-declaration is a no-op; a different one throws', () => {
		defineStatShape('test:stat-shape/meter@1', { label: 'Meter', field: { type: 'integer', min: 0, max: 10 } })
		defineStatShape('test:stat-shape/meter@1', { label: 'Meter (renamed)', field: { type: 'integer', min: 0, max: 10 } })
		assert.throws(
			() => defineStatShape('test:stat-shape/meter@1', { label: 'Meter', field: { type: 'integer', min: 0, max: 5 } }),
			/duplicate stat shape id/,
		)
	})

	test('the kinds core implements, and nothing else', () => {
		assert.equal(statShapeKindOf({ type: 'number' }), 'number')
		assert.equal(statShapeKindOf({ type: 'boolean' }), 'boolean')
		assert.equal(statShapeKindOf({ type: 'string' }), 'text')
		assert.equal(statShapeKindOf({ type: 'text', format: 'json' }), undefined)
		assert.equal(statShapeKindOf({ type: 'list', item: { type: 'enum', of: ['a'] } }), 'list')
		assert.equal(statShapeKindOf({ type: 'list', item: { type: 'integer' } }), undefined)
		assert.equal(statShapeKindOf({ type: 'media' }), undefined)
		assert.equal(statShapeKindOf(undefined), undefined)
	})
})

describe('a slot references a shape', () => {
	test('by catalogue id or inline FieldDecl; type is optional and must agree', () => {
		const gold = slot('gold', { shape: 'core:stat-shape/number@1', config: { min: 0 } })
		assert.equal(gold.type, 'integer')
		assert.deepEqual(slotField(gold), { type: 'integer' })
		const inline = slot('tension', { shape: { type: 'number', min: 0, max: 1 } })
		assert.equal(inline.type, 'integer')
		assert.equal(slotStatShapeId(inline), undefined)
		assert.equal(slotStatShapeKind(inline), 'number')
		// A slot stating both, agreeing, is fine.
		assert.equal(slot('both', { type: 'list', shape: 'core:stat-shape/list@1' }).type, 'list')
		assert.throws(() => slot('clash', { type: 'enum', shape: 'core:stat-shape/number@1' }), /Say one of them/)
		assert.throws(() => slot('ghost', { shape: 'core:stat-shape/nothing@1' }), /nothing declares/)
		assert.throws(() => slot('unkept', { shape: { type: 'media' } }), /not a value core can keep/)
		assert.throws(() => slot('nothing', {}), /neither a type nor a shape/)
		assert.throws(
			() => slot('computed', { type: 'derived', shape: 'core:stat-shape/number@1', derive: '1' }),
			/derived and declares a shape/,
		)
	})

	test('a choice needs options — from the slot, or the inline field', () => {
		assert.throws(() => slot('mood', { shape: 'core:stat-shape/choice@1' }), /enum with no options/)
		const inline = slot('weather', { shape: { type: 'enum', of: ['clear', 'rain'] } })
		assert.deepEqual(resolveSlotConfig(inline), { of: ['clear', 'rain'] })
		const members = slot('light', { shape: { type: 'enum', members: [{ key: 'day' }, { key: 'night' }] } })
		assert.deepEqual(resolveSlotConfig(members).of, ['day', 'night'])
	})

	test("what an inline field bounds is the floor every layer's config deviates from", () => {
		const meter = slot('meter', { shape: { type: 'integer', min: 0, max: 10 }, config: { max: 12 } })
		assert.deepEqual(resolveSlotConfig(meter), { min: 0, max: 12 })
		assert.deepEqual(resolveSlotConfig(meter, { max: 8 }), { min: 0, max: 8 })
		const bag = slot('bag', { shape: { type: 'list', max: 3, item: { type: 'string', max: 12 } } })
		assert.deepEqual(resolveSlotConfig(bag), { maxItems: 3, maxLength: 12 })
		assert.deepEqual(fieldSlotConfig({ type: 'text', max: 40 }), { maxLength: 40 })
	})

	test('a slot declared by type alone means what it always meant', () => {
		assert.deepEqual(fieldForSlotType('integer'), { type: 'integer' })
		assert.deepEqual(fieldForSlotType('list'), { type: 'list', item: { type: 'string' } })
		assert.equal(fieldForSlotType('derived'), undefined)
		const old = slot('old', { type: 'enum', config: { of: ['a', 'b'] } })
		assert.equal(slotStatShapeKind(old), 'choice')
		assert.equal(checkSlotValue(old, 'a'), null)
	})
})

describe('each shape validates and stores through the one gate', () => {
	test('number: whole by default; a `number` field takes fractions; bounds hold', () => {
		const hp = slot('hp', { shape: 'core:stat-shape/number@1', config: { min: 0, max: 20 } })
		assert.equal(checkSlotValue(hp, 12), null)
		assert.match(checkSlotValue(hp, 1.5)!, /whole number/)
		assert.match(checkSlotValue(hp, 21)!, /above 20/)
		const ratio = slot('ratio', { shape: { type: 'number', min: 0, max: 1 } })
		assert.equal(checkSlotValue(ratio, 0.25), null)
		assert.match(checkSlotValue(ratio, 1.5)!, /above 1/)
		assert.match(checkSlotValue(ratio, 'x' as never)!, /is a number/)
	})

	test('choice: one of the closed set', () => {
		const mood = slot('mood', { shape: 'core:stat-shape/choice@1', config: { of: ['calm', 'wary'] } })
		assert.equal(checkSlotValue(mood, 'wary'), null)
		assert.match(checkSlotValue(mood, 'giddy')!, /one of calm, wary/)
	})

	test('list: ordered text and lore references, unique by identity, bounded by count', () => {
		const bag = slot('inventory', { shape: 'core:stat-shape/list@1', config: { maxItems: 3 } })
		const value: SlotValue = ['rope', { entryId: 7 }, 'lamp']
		assert.equal(checkSlotValue(bag, value), null)
		// A name filled in at read is accepted on the way back in, and never stored.
		assert.equal(checkSlotValue(bag, [{ entryId: 7, name: 'The Sword' }]), null)
		assert.deepEqual(slotValueForStorage([{ entryId: 7, name: 'The Sword' }, 'rope']), [{ entryId: 7 }, 'rope'])
		assert.match(checkSlotValue(bag, [{ entryId: 7 }, { entryId: 7 }])!, /lore entry 7 is in it twice/)
		assert.match(checkSlotValue(bag, [{ entryId: 7, extra: 1 } as never])!, /as \{ entryId, count\? \}/)
		assert.match(checkSlotValue(bag, [{ entryId: 0 } as never])!, /neither/)
		assert.match(checkSlotValue(bag, ['a', 'b', 'c', 'd'])!, /at most 3/)
		// Order is the value: two orders are two different lists, both legal.
		assert.equal(checkSlotValue(bag, ['lamp', 'rope']), null)
		// A list closed over words takes only those words.
		const closed = slot('keys', { shape: { type: 'list', item: { type: 'enum', of: ['brass', 'iron'] } } })
		assert.equal(checkSlotValue(closed, ['iron']), null)
		assert.match(checkSlotValue(closed, [{ entryId: 3 }])!, /a lore entry is not one of them/)
		assert.equal(isSlotLoreRef({ entryId: 3 }), true)
		assert.equal(isSlotLoreRef('3'), false)
	})

	test('list ops treat a lore reference by its entry', () => {
		const added = applyListOp(['rope'], 'add', [{ entryId: 7 }, { entryId: 7, name: 'Sword' }])
		assert.deepEqual(added, { value: ['rope', { entryId: 7 }], refusal: null })
		const removed = applyListOp(['rope', { entryId: 7 }], 'remove', [{ entryId: 7 }])
		assert.deepEqual(removed.value, ['rope'])
		assert.match(applyListOp(['a'], 'add', ['b'], { maxItems: 1 }).refusal!, /at most 1 item/)
	})

	test('story time: the canonical line, and nothing else', () => {
		const clock = slot('clock', { shape: 'core:stat-shape/story-time@1' })
		assert.equal(clock.type, 'text')
		for (const ok of ['412', '412-03', '412-03-05', '412-03-05 22:30', '-12-01-02', '3-1-250'])
			assert.equal(checkSlotValue(clock, ok), null, ok)
		for (const bad of ['yesterday', '412-00', '412-03-05 25:00', '412-03-05 10:61', ''])
			assert.match(checkSlotValue(clock, bad)!, /story time/, bad)
		assert.match(checkSlotValue(clock, 412)!, /is text/)
	})
})

describe('story time', () => {
	test('parses, spells canonically, and reads through the free-form calendar', () => {
		assert.deepEqual(parseStoryTime('412-3-5 9:05'), { year: 412, month: 3, day: 5, hour: 9, minute: 5 })
		assert.deepEqual(parseStoryTime(412), { year: 412 })
		assert.equal(parseStoryTime('412--05'), null)
		assert.equal(storyTimeText({ year: 412, month: 3, day: 5, hour: 9, minute: 5 }), '412-03-05 09:05')
		assert.equal(storyTimeText({ year: -3, day: 5 }), '-3')
		assert.equal(formatStoryTime({ year: 412, month: 3, day: 5, hour: 22, minute: 30 }), 'Year 412, Mo. 3, Day 5, 22:30')
		assert.equal(formatStoryTime({ year: 2 }), 'Year 2')
	})

	test('one comparator: element-wise, correct past any radix, absent before present', () => {
		const sorted = ['5-1-50', '3-1-250', '3', '3-1-250 00:00', '-1-12-31', '3-1']
			.map((s) => parseStoryTime(s)!)
			.sort(compareStoryTimes)
			.map(storyTimeText)
		assert.deepEqual(sorted, ['-1-12-31', '3', '3-01', '3-01-250', '3-01-250 00:00', '5-01-50'])
	})
})
