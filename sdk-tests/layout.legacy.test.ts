/**
 * `fromLegacy` — reading a pre-v2 layout blob as a layout document.
 *
 * The blobs below are the historic shapes, lifted verbatim from the app's
 * `sessionLayout/arrangedGeometry.test.ts`: every arrangement that suite feeds
 * `loadArranged` is an arrangement some session out there is still storing, and
 * the claim under test is that **every one of them reads**. Total means total —
 * junk in, `null` out, never a throw and never a document that fails
 * `validateLayoutDoc`.
 *
 * The upgrade is deliberately lossy: holes and anchors do not survive. What
 * does survive is the reading order, the pins, the groups and the heights, and
 * those are the four things a person would notice.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	RETIRED_WIDGET_IDS,
	fromLegacy,
	resolve,
	validateLayoutDoc,
	type GroupUnit,
	type LayoutDoc,
	type LayoutPreset,
	type Zone,
} from '@serene-pub/sdk'
import { ADVENTURE_LAYOUT, ADVENTURE_LAYOUT_V2, CORE_LOOKS, CORE_WIDGETS } from '@serene-pub/core-catalog'

const DECLS = { widgets: CORE_WIDGETS, looks: CORE_LOOKS }

const pos = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h })

/**
 * Every arranged-geometry shape the app's suite exercises, as the `arrangedGrid`
 * half of a stored blob.
 */
const ARRANGEMENTS: Array<[string, unknown]> = [
	['an anchored, grouped item', { left: { cols: 9, rows: 37, items: [{ ...pos('map', 0, 8, 9, 3), anchor: { top: true }, group: 'g:map+notes' }] } }],
	[
		'malformed zones and malformed items',
		{
			left: { cols: 9, rows: 37, items: [pos('map', 0, 0, 9, 3), { id: 'x' }] },
			middle: { cols: 'wide', rows: 3, items: [] },
			right: null,
		},
	],
	['a retired widget beside a live one', { middle: { cols: 18, rows: 34, items: [pos('messages', 0, 0, 18, 31), pos('composer', 0, 31, 18, 3)] } }],
	['two stacked strips', { left: { cols: 9, rows: 37, items: [pos('map', 0, 8, 9, 3), pos('notes', 0, 12, 9, 3)] } }],
	['the chat and its strip', { middle: { cols: 18, rows: 34, items: [pos('messages', 0, 0, 18, 31), pos('world-state', 0, 31, 18, 3)] } }],
	['one tall card in a side', { left: { cols: 9, rows: 37, items: [pos('map', 0, 24, 9, 6)] } }],
	[
		'side-by-side cards over a full-width one',
		{ left: { cols: 9, rows: 12, items: [pos('map', 0, 0, 5, 4), pos('notes', 5, 0, 4, 4), pos('cast', 0, 4, 9, 8)] } },
	],
	[
		'a legacy arrangement with no pin field anywhere',
		{
			left: {
				cols: 9,
				rows: 12,
				items: [
					pos('map', 0, 0, 9, 4),
					{ ...pos('notes', 0, 4, 9, 4), group: 'g:notes+cast' },
					{ ...pos('cast', 0, 8, 9, 4), group: 'g:notes+cast' },
				],
			},
		},
	],
	['one card unpinned', { left: { cols: 9, rows: 12, items: [{ ...pos('map', 0, 0, 9, 4), pinned: false }, pos('notes', 0, 4, 9, 4)] } }],
	[
		'a group of mixed pins',
		{
			left: {
				cols: 9,
				rows: 12,
				items: [
					{ ...pos('notes', 0, 0, 5, 4), group: 'g' },
					{ ...pos('cast', 5, 0, 4, 4), group: 'g', pinned: false },
				],
			},
		},
	],
	['a zone that reported its cells and no items', { left: { cols: 4, rows: 4, items: [] } }],
	['every zone at once', {
		left: { cols: 9, rows: 12, items: [pos('map', 0, 0, 9, 6)] },
		middle: { cols: 18, rows: 34, items: [pos('messages', 0, 0, 18, 34)] },
		right: { cols: 9, rows: 12, items: [pos('stats', 0, 0, 9, 6), pos('lore-entries', 0, 6, 9, 6)] },
	}],
]

const zoneOf = (preset: LayoutPreset, id: 'left' | 'middle' | 'right'): Zone | undefined =>
	(preset.layout.zones as Record<string, Zone | undefined>)[id]

describe('fromLegacy — what is not a legacy blob', () => {
	test('junk yields null rather than a document nobody asked for', () => {
		for (const junk of [undefined, null, 7, 'nope', [], true, {}, { active: [] }, { tierSizeOverrides: {} }])
			assert.equal(fromLegacy(junk), null, JSON.stringify(junk))
	})

	test('a bare arrangement is not a blob — the arrangement lives UNDER `arrangedGrid`', () => {
		assert.equal(fromLegacy({ left: { cols: 9, rows: 12, items: [pos('map', 0, 0, 9, 4)] } }), null)
	})

	test('a v2 document, and a preset around one, pass straight through', () => {
		const doc = ADVENTURE_LAYOUT_V2.layout
		assert.deepEqual(fromLegacy(doc), { layout: doc })
		assert.equal(fromLegacy(ADVENTURE_LAYOUT_V2), ADVENTURE_LAYOUT_V2)
	})
})

describe('fromLegacy — total over every historic arrangement', () => {
	for (const [what, arrangedGrid] of ARRANGEMENTS)
		test(`reads ${what}`, () => {
			const out = fromLegacy({ arrangedGrid })
			assert.ok(out, 'a blob with an arrangement is a blob')
			const v = validateLayoutDoc(out!.layout, DECLS)
			assert.deepEqual(v.errors, [], `${what}: ${v.errors.join(' / ')}`)
			assert.ok(out!.layout.zones.middle, 'the middle always exists')
			// And it draws, at the narrowest box the contract promises.
			resolve(out!.layout, { width: 320, height: 640 }, DECLS)
		})

	test('deterministic: the same blob twice is the same document', () => {
		for (const [what, arrangedGrid] of ARRANGEMENTS)
			assert.equal(
				JSON.stringify(fromLegacy({ arrangedGrid })),
				JSON.stringify(fromLegacy({ arrangedGrid })),
				what,
			)
	})
})

describe('fromLegacy — the mapping, item by item', () => {
	test('a retired widget id is dropped, and the one beside it is kept', () => {
		assert.ok(RETIRED_WIDGET_IDS.has('composer'))
		const out = fromLegacy({ arrangedGrid: { middle: { cols: 18, rows: 34, items: [pos('messages', 0, 0, 18, 31), pos('composer', 0, 31, 18, 3)] } } })!
		assert.deepEqual(zoneOf(out, 'middle')!.units.map((u) => u.key), ['messages'])
	})

	test('inventory is retired (R79): a layout saved on Adventure or Lair opens without it, and without its band', () => {
		assert.ok(RETIRED_WIDGET_IDS.has('inventory'))
		const out = fromLegacy({
			zoneLayout: {
				version: 1,
				zones: { left: { kind: 'side', side: 'left', widgets: ['inventory'] }, right: { kind: 'side', side: 'right', widgets: ['stats', 'inventory'] } },
			},
			arrangedGrid: {
				right: { cols: 1, rows: 12, items: [pos('scene-portraits', 0, 0, 1, 4), pos('stats', 0, 4, 1, 4), pos('inventory', 0, 8, 1, 4)] },
			},
			widgetSettings: { inventory: { groupBy: 'item' } },
		})!
		assert.deepEqual(zoneOf(out, 'right')!.units.map((u) => u.key), ['scene-portraits', 'stats'])
		assert.deepEqual(zoneOf(out, 'right')!.rows, [{ cells: 4 }, { cells: 4 }], 'no row track is left for it')
		assert.deepEqual(zoneOf(out, 'left')?.units ?? [], [])
		assert.equal(out.widgetSettings, undefined, 'its stored settings are dropped with it')
		assert.deepEqual(validateLayoutDoc(out.layout, DECLS).warnings, [], 'nothing left to draw a placeholder for')
	})

	test('items sort by y then x, and y-bands become row tracks', () => {
		const out = fromLegacy({ arrangedGrid: { left: { cols: 9, rows: 37, items: [pos('notes', 0, 12, 9, 3), pos('map', 0, 8, 9, 3)] } } })!
		const left = zoneOf(out, 'left')!
		assert.deepEqual(left.units.map((u) => u.key), ['map', 'notes'])
		// The one-cell gap between the two cards is a band of its own, and a
		// one-cell band is `fit` — which collapses to nothing when nobody is in it.
		assert.deepEqual(left.rows, [{ cells: 3 }, 'fit', { cells: 3 }])
		assert.deepEqual(left.units.map((u) => u.row), [
			{ start: 1, span: 1 },
			{ start: 3, span: 1 },
		])
	})

	test('a one-cell band is `fit`, and the widget grid’s `grow` makes a band grow', () => {
		const out = fromLegacy({
			widgetGrid: {
				version: 1,
				cell: 44,
				widgets: [
					{ id: 'messages', zone: 'middle', order: 1, size: { w: 'grow', h: 'grow' } },
					{ id: 'world-state', zone: 'middle', order: 0, size: { w: 'grow', h: 'fixed' } },
				],
			},
			arrangedGrid: { middle: { cols: 18, rows: 34, items: [pos('messages', 0, 0, 18, 31), pos('ticker', 0, 31, 18, 1)] } },
		})!
		assert.deepEqual(zoneOf(out, 'middle')!.rows, ['grow', 'fit'])
	})

	test('x-extents become columns in twelfths, and a full-width zone collapses to one', () => {
		const twelfths = fromLegacy({
			arrangedGrid: { left: { cols: 9, rows: 12, items: [pos('map', 0, 0, 5, 4), pos('notes', 5, 0, 4, 4), pos('cast', 0, 4, 9, 8)] } },
		})!
		const left = zoneOf(twelfths, 'left')!
		assert.equal(left.cols.length, 12)
		assert.deepEqual(left.units.map((u) => [u.key, u.col.start, u.col.span]), [
			['map', 1, 7],
			['notes', 8, 5],
			['cast', 1, 12],
		])

		const single = fromLegacy({ arrangedGrid: { left: { cols: 9, rows: 12, items: [pos('map', 0, 0, 9, 4), pos('notes', 0, 4, 9, 4)] } } })!
		assert.deepEqual(zoneOf(single, 'left')!.cols, ['grow'], 'a rail is one column, not twelve')
	})

	test('a tab group becomes a GroupUnit at its members’ bounding box', () => {
		const out = fromLegacy({
			arrangedGrid: {
				left: {
					cols: 9,
					rows: 12,
					items: [
						pos('map', 0, 0, 9, 4),
						{ ...pos('notes', 0, 4, 9, 4), group: 'g:notes+cast' },
						{ ...pos('cast', 0, 8, 9, 4), group: 'g:notes+cast' },
					],
				},
			},
		})!
		const group = zoneOf(out, 'left')!.units.find((u) => u.kind === 'group') as GroupUnit | undefined
		assert.ok(group)
		assert.equal(group!.key, 'g:notes+cast')
		assert.deepEqual(group!.members.map((m) => m.widget), ['notes', 'cast'])
		assert.equal(group!.pinned, undefined, 'absent means pinned, as it always did')
	})

	test('pins carry, and a group reads as pinned unless EVERY member says otherwise', () => {
		const one = fromLegacy({ arrangedGrid: { left: { cols: 9, rows: 12, items: [{ ...pos('map', 0, 0, 9, 4), pinned: false }, pos('notes', 0, 4, 9, 4)] } } })!
		const units = zoneOf(one, 'left')!.units
		assert.equal(units.find((u) => u.key === 'map')!.pinned, false)
		assert.equal(units.find((u) => u.key === 'notes')!.pinned, undefined)

		const mixed = fromLegacy({
			arrangedGrid: {
				left: {
					cols: 9,
					rows: 12,
					items: [
						{ ...pos('notes', 0, 0, 5, 4), group: 'g' },
						{ ...pos('cast', 5, 0, 4, 4), group: 'g', pinned: false },
					],
				},
			},
		})!
		assert.equal(zoneOf(mixed, 'left')!.units[0]!.pinned, undefined, 'the default wins a mixed group')
	})

	test('anchors are dropped; top and bottom survive only as reading order', () => {
		const out = fromLegacy({
			arrangedGrid: {
				middle: {
					cols: 18,
					rows: 34,
					items: [
						{ ...pos('world-state', 0, 31, 18, 3), anchor: { bottom: true } },
						{ ...pos('messages', 0, 0, 18, 31), anchor: { top: true, left: true, right: true, bottom: true } },
					],
				},
			},
		})!
		assert.ok(!JSON.stringify(out).includes('anchor'))
		assert.deepEqual(zoneOf(out, 'middle')!.units.map((u) => u.key), ['messages', 'world-state'])
	})

	test('a missing arrangement falls back to the widget-grid order as rows', () => {
		const out = fromLegacy({
			widgetGrid: {
				version: 1,
				cell: 44,
				widgets: [
					{ id: 'messages', zone: 'middle', order: 1, size: { w: 'grow', h: 'grow' } },
					{ id: 'world-state', zone: 'middle', order: 0, size: { w: 'grow', h: 'fixed' } },
				],
			},
		})!
		const middle = zoneOf(out, 'middle')!
		assert.deepEqual(middle.units.map((u) => u.key), ['world-state', 'messages'])
		assert.deepEqual(middle.rows, ['fit', 'grow'])
		assert.deepEqual(middle.cols, ['grow'])
	})

	test('a side’s widget list and its pin come from the zone layout', () => {
		const out = fromLegacy({
			zoneLayout: {
				version: 1,
				zones: {
					left: { kind: 'side', side: 'left', pinned: false, widgets: [] },
					right: { kind: 'side', side: 'right', pinned: true, widgets: ['stats', 'lore-entries'] },
				},
			},
		})!
		assert.deepEqual(zoneOf(out, 'left')!.units, [], 'a declared, empty rail stays declared')
		assert.equal((zoneOf(out, 'left') as { pinned?: boolean }).pinned, false)
		assert.deepEqual(zoneOf(out, 'right')!.units.map((u) => u.key), ['stats', 'lore-entries'])
		assert.equal((zoneOf(out, 'right') as { pinned?: boolean }).pinned, undefined, 'absent means pinned')
	})

	test('a widget named in two places is placed once, the middle first', () => {
		const out = fromLegacy({
			widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'stats', zone: 'middle', order: 0, size: { w: 'grow', h: 'grow' } }] },
			zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['stats', 'lore-entries'] } } },
		})!
		assert.deepEqual(zoneOf(out, 'middle')!.units.map((u) => u.key), ['stats'])
		assert.deepEqual(zoneOf(out, 'right')!.units.map((u) => u.key), ['lore-entries'])
		assert.deepEqual(validateLayoutDoc(out.layout, DECLS).errors, [])
	})

	test('`widgetSettings` inside the blob is lifted onto the preset', () => {
		const out = fromLegacy({
			widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'messages', zone: 'middle', order: 0, size: { w: 'grow', h: 'grow' } }] },
			widgetSettings: { 'scene-portraits': { source: 'scene', bars: true }, composer: { skin: 'x' }, junk: 7 },
		})!
		assert.deepEqual(out.widgetSettings, { 'scene-portraits': { source: 'scene', bars: true } })
	})
})

describe("fromLegacy — Adventure's own shipped blob", () => {
	const out = fromLegacy(ADVENTURE_LAYOUT)!

	test('reads, validates and checks out', () => {
		assert.ok(out)
		assert.deepEqual(validateLayoutDoc(out.layout, DECLS).errors, [])
	})

	test('the world above the conversation, in two row tracks', () => {
		const middle = zoneOf(out, 'middle')!
		assert.deepEqual(middle.rows, ['fit', 'grow'])
		assert.deepEqual(middle.units.map((u) => u.key), ['world-state', 'messages'])
	})

	test('the party down the right, in the order it was arranged', () => {
		const right = zoneOf(out, 'right')!
		// Two six-cell bands (three four-cell ones until R79 removed Inventory).
		assert.deepEqual(right.units.map((u) => u.key), ['scene-portraits', 'stats'])
		assert.deepEqual(right.rows, [{ cells: 6 }, { cells: 6 }])
		assert.deepEqual(right.cols, ['grow'])
	})

	test('the lore rail on the left, unpinned and empty', () => {
		assert.deepEqual(zoneOf(out, 'left')!.units, [])
		assert.equal((zoneOf(out, 'left') as { pinned?: boolean }).pinned, false)
	})

	test('the pinned widget settings ride along', () => {
		assert.deepEqual(out.widgetSettings, { 'scene-portraits': { source: 'scene', bars: true } })
	})

	test('the hand-written v2 document places the same widgets in the same zones', () => {
		const legacyKeys = (id: 'left' | 'middle' | 'right') => (zoneOf(out, id)?.units ?? []).map((u) => u.key)
		const v2 = (id: 'left' | 'middle' | 'right') =>
			((ADVENTURE_LAYOUT_V2.layout.zones as Record<string, Zone | undefined>)[id]?.units ?? []).map((u) => u.key)
		for (const id of ['left', 'middle', 'right'] as const) assert.deepEqual(legacyKeys(id), v2(id), id)
	})
})

describe('fromLegacy — a read-upgraded document behaves like any other', () => {
	test('it round-trips through JSON and resolves the same', () => {
		for (const [what, arrangedGrid] of ARRANGEMENTS) {
			const doc = fromLegacy({ arrangedGrid })!.layout as LayoutDoc
			const text = JSON.stringify(doc)
			assert.equal(JSON.stringify(JSON.parse(text)), text, what)
			for (const box of [{ width: 390, height: 844 }, { width: 1440, height: 900 }])
				assert.equal(
					JSON.stringify(resolve(JSON.parse(text) as LayoutDoc, box, DECLS)),
					JSON.stringify(resolve(doc, box, DECLS)),
					what,
				)
		}
	})
})
