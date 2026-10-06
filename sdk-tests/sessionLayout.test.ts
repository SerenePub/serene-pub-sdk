/**
 * The session layout (`SessionLayoutV1`) — the one layout format (plan
 * `PLAN-layout-one-format-2026-09-28`, brief 1): the instance id grammar, the
 * id readers, the validator a shipped layout goes through, and the four core
 * genres declaring the layouts they have always shipped.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	drawnWidgetIds,
	instanceNameOf,
	isInstanceOf,
	isWidgetInstanceId,
	layoutWidgetIds,
	middleWidgetIds,
	primaryPlaced,
	RETIRED_WIDGET_IDS,
	validateSessionLayout,
	widgetOfInstance,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'
import { adventureGenre, lairGenre } from '../core-catalog/src/registry/genres.js'

const grow = { w: 'grow', h: 'grow' } as const
const all = { top: true, bottom: true, left: true, right: true }

/** The floor's shape: the conversation alone, in the middle. */
const floor = (): SessionLayoutV1 => ({
	widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'messages', zone: 'middle', order: 0, size: grow, anchor: all }] },
})

describe('widget instance ids', () => {
	test('the widget half and the instance name', () => {
		assert.equal(widgetOfInstance('messages#sanctum'), 'messages')
		assert.equal(widgetOfInstance('messages'), 'messages')
		assert.equal(widgetOfInstance('acme.maps:map#dungeon'), 'acme.maps:map')
		assert.equal(instanceNameOf('messages#sanctum'), 'sanctum')
		assert.equal(instanceNameOf('messages'), null)
		assert.equal(instanceNameOf('messages#'), null)
		assert.equal(widgetOfInstance('#sanctum'), '#sanctum')
		assert.equal(isInstanceOf('messages#2', 'messages'), true)
		assert.equal(isInstanceOf('messages-log', 'messages'), false, 'a prefix is not a copy')
	})

	test('the grammar: a widget id, then optionally # and a short kebab name', () => {
		for (const ok of ['messages', 'world-state', 'messages#sanctum', 'messages#2', 'acme.maps:map', 'acme.maps:map#north'])
			assert.equal(isWidgetInstanceId(ok), true, ok)
		for (const bad of ['', 'Messages', 'messages#', 'messages#Sanctum', '#sanctum', 'a:b:c', `messages#${'x'.repeat(33)}`, 7])
			assert.equal(isWidgetInstanceId(bad), false, String(bad))
	})
})

describe('reading ids out of a layout', () => {
	const layout: SessionLayoutV1 = {
		zoneLayout: {
			version: 1,
			zones: {
				left: { kind: 'side', side: 'left', widgets: ['stats'] },
				right: { kind: 'side', side: 'right', widgets: ['world-state', 'messages#sanctum'] },
			},
		},
		widgetGrid: {
			version: 1,
			cell: 44,
			widgets: [
				{ id: 'messages', zone: 'middle', order: 1, size: grow, anchor: all },
				{ id: 'map', zone: 'middle', order: 0, size: { w: 'grow', h: 'fixed' }, anchor: { top: true } },
			],
		},
		arrangedGrid: {
			right: {
				cols: 1,
				rows: 12,
				items: [
					{ id: 'messages#sanctum', x: 0, y: 2, w: 1, h: 10 },
					{ id: 'world-state', x: 0, y: 0, w: 1, h: 2 },
				],
			},
		},
	}

	test('layoutWidgetIds names every id once; middleWidgetIds the middle by order', () => {
		assert.deepEqual(layoutWidgetIds(layout), ['stats', 'world-state', 'messages#sanctum', 'messages', 'map'])
		assert.deepEqual(middleWidgetIds(layout), ['map', 'messages'])
	})

	test('drawnWidgetIds reads the page: middle, left, right — an arrangement wins where it places anything', () => {
		assert.deepEqual(drawnWidgetIds(layout), ['map', 'messages', 'stats', 'world-state', 'messages#sanctum'])
		// An arranged middle draws itself, and an emptied one draws nothing.
		const emptied = { ...layout, arrangedGrid: { ...layout.arrangedGrid, middle: { cols: 1, rows: 1, items: [] } } }
		assert.deepEqual(drawnWidgetIds(emptied), ['stats', 'world-state', 'messages#sanctum'])
		// A zone that does not say it is a strip is a side, as the page reads it.
		assert.deepEqual(drawnWidgetIds({ zoneLayout: { version: 1, zones: { left: { side: 'left', widgets: ['stats'] } } } } as never), ['stats'])
		// A retired id is never drawn.
		assert.ok(RETIRED_WIDGET_IDS.has('inventory'))
		assert.deepEqual(drawnWidgetIds({ zoneLayout: { version: 1, zones: { right: { kind: 'side', widgets: ['inventory'] } } } }), [])
	})

	test('primaryPlaced: any drawn instance, in any zone', () => {
		assert.equal(primaryPlaced(layout, 'messages'), true)
		const sideOnly: SessionLayoutV1 = {
			zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['messages#story'] } } },
		}
		assert.equal(primaryPlaced(sideOnly, 'messages'), true, 'a copy in a side places the primary')
		assert.equal(primaryPlaced({}, 'messages'), false)
		// Named but shadowed by the middle's arrangement: not drawn, not placed.
		assert.equal(primaryPlaced({ ...floor(), arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, 'messages'), false)
	})
})

describe('validateSessionLayout', () => {
	test('the floor, and an empty layout, are valid', () => {
		assert.deepEqual(validateSessionLayout(floor()), { ok: true, errors: [], warnings: [] })
		assert.equal(validateSessionLayout({}).ok, true)
		assert.equal(validateSessionLayout(null).ok, false)
		assert.equal(validateSessionLayout([]).ok, false)
	})

	test('versions, zone keys and the grid entry shape', () => {
		const v = validateSessionLayout({
			zoneLayout: { version: 2, zones: {} },
			widgetGrid: {
				version: 1,
				cell: 0,
				widgets: [{ id: 'messages', zone: 'top', order: 0, size: grow, anchor: all }, { id: 'x', zone: 'left', order: 'a', size: { w: 'wide', h: 'grow' }, anchor: { up: true } }],
			},
			arrangedGrid: { top: { cols: 1, rows: 1, items: [] } },
		})
		assert.equal(v.ok, false)
		assert.ok(v.errors.some((e) => e.startsWith('zoneLayout:')), 'wrong zoneLayout version')
		assert.ok(v.errors.some((e) => e.includes('widgetGrid.cell')))
		assert.ok(v.errors.some((e) => e.includes("'top' is not a zone")))
		assert.ok(v.errors.some((e) => e.includes('widgetGrid.widgets[1].order')))
		assert.ok(v.errors.some((e) => e.includes('widgetGrid.widgets[1].size')))
		assert.ok(v.errors.some((e) => e.includes('widgetGrid.widgets[1].anchor')))
		assert.ok(v.errors.some((e) => e.includes('arrangedGrid.top')))
	})

	test('whole cells inside the zone', () => {
		const cells = (items: unknown[]) => validateSessionLayout({ arrangedGrid: { right: { cols: 2, rows: 4, items } } } as never)
		assert.equal(cells([{ id: 'stats', x: 0, y: 0, w: 2, h: 4 }]).ok, true)
		assert.equal(cells([{ id: 'stats', x: 1, y: 0, w: 2, h: 1 }]).ok, false, 'past the columns')
		assert.equal(cells([{ id: 'stats', x: 0, y: 3, w: 1, h: 2 }]).ok, false, 'past the rows')
		assert.equal(cells([{ id: 'stats', x: 0.5, y: 0, w: 1, h: 1 }]).ok, false, 'a fraction of a cell')
		assert.equal(cells([{ id: 'stats', x: 0, y: 0, w: 0, h: 1 }]).ok, false, 'no width')
		assert.equal(validateSessionLayout({ arrangedGrid: { right: { cols: 0, rows: 4, items: [] } } }).ok, false)
	})

	test('the instance id grammar, everywhere an id is placed or keyed', () => {
		const v = validateSessionLayout({
			zoneLayout: { version: 1, zones: { right: { kind: 'side', widgets: ['Stats', 'messages#'] } } },
			widgetSettings: { 'messages#Sanctum': {} },
			widgetStyles: { 'messages#sanctum': { slug: '' } },
		})
		assert.equal(v.ok, false)
		assert.ok(v.errors.some((e) => e.includes("'Stats' is not a widget instance id")))
		assert.ok(v.errors.some((e) => e.includes("'messages#' is not a widget instance id")))
		assert.ok(v.errors.some((e) => e.includes("widgetSettings: 'messages#Sanctum'")))
		assert.ok(v.errors.some((e) => e.includes('widgetStyles.messages#sanctum')))
		assert.equal(validateSessionLayout({ widgetStyles: { stats: { slug: 'stats:default' } } }).ok, true, 'a slug-only pin')
	})

	test('an instance lives in one zone, listed once — the three slots may each name it there', () => {
		// Listed on the right AND given cells there: one placement, three views.
		const sameZone = validateSessionLayout({
			zoneLayout: { version: 1, zones: { right: { kind: 'side', widgets: ['stats'] } } },
			widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'stats', zone: 'right', order: 0, size: grow, anchor: {} }] },
			arrangedGrid: { right: { cols: 1, rows: 2, items: [{ id: 'stats', x: 0, y: 0, w: 1, h: 2 }] } },
		})
		assert.deepEqual(sameZone.errors, [])
		const twoZones = validateSessionLayout({
			zoneLayout: { version: 1, zones: { left: { kind: 'side', side: 'left', widgets: ['stats'] } } },
			arrangedGrid: { right: { cols: 1, rows: 2, items: [{ id: 'stats', x: 0, y: 0, w: 1, h: 2 }] } },
		})
		assert.equal(twoZones.ok, false)
		assert.ok(twoZones.errors.some((e) => e.includes("'stats' is also placed in left")))
		const twice = validateSessionLayout({
			zoneLayout: { version: 1, zones: { right: { kind: 'side', widgets: ['stats', 'stats'] } } },
		})
		assert.ok(twice.errors.some((e) => e.includes("'stats' is listed twice")))
		// Two COPIES are two instances, and fine anywhere.
		const copies = validateSessionLayout({
			zoneLayout: { version: 1, zones: { left: { kind: 'side', side: 'left', widgets: ['stats'] }, right: { kind: 'side', widgets: ['stats#2'] } } },
		})
		assert.equal(copies.ok, true)
	})

	test('the retired layout document is refused by name, bare or wrapped', () => {
		const wrapped = validateSessionLayout({ layout: { version: 2, zones: { middle: {} } }, widgetSettings: {} })
		assert.equal(wrapped.ok, false)
		assert.match(wrapped.errors[0]!, /a retired layout document \(LayoutDoc v2: layout\)/)
		const bare = validateSessionLayout({ version: 2, zones: { middle: { rows: ['grow'], cols: ['grow'], units: [] } } })
		assert.match(bare.errors[0]!, /LayoutDoc v2: version, zones/)
		// Any other stranger is ignored, and said so.
		const extra = validateSessionLayout({ ...floor(), tierSizeOverrides: {} })
		assert.equal(extra.ok, true)
		assert.deepEqual(extra.warnings, ["'tierSizeOverrides' is not a slot of the session layout — readers ignore it"])
	})

	test('warnings: an unknown widget, a retired one, and one over its cap', () => {
		const widgets = [...CORE_WIDGETS, { id: 'acme.x:bus', maxInstances: 1 }]
		const v = validateSessionLayout(
			{
				zoneLayout: {
					version: 1,
					zones: {
						left: { kind: 'side', side: 'left', widgets: ['acme.x:bus', 'inventory'] },
						right: { kind: 'side', widgets: ['acme.x:bus#2', 'acme.y:map', 'messages#sanctum', 'messages#two'] },
					},
				},
			},
			{ widgets, unknownWidgets: 'warn' },
		)
		assert.equal(v.ok, true, 'warnings never refuse')
		assert.ok(v.warnings.some((w) => w.includes("'acme.y:map' names a widget this pub does not know")))
		assert.ok(v.warnings.some((w) => w.includes("'inventory' names a retired widget")))
		assert.ok(v.warnings.some((w) => w.includes("'acme.x:bus' is placed 2 times, over its maxInstances (1)")))
		assert.ok(!v.warnings.some((w) => w.includes("'messages'")), 'core sets no cap: copies of the conversation are fine')
	})

	test('a packager checks caps without knowing every widget: unknown ids are not warned about', () => {
		const v = validateSessionLayout(
			{ zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['bus', 'bus#2', 'messages#aside'] } } } },
			{ widgets: [{ id: 'bus', maxInstances: 1 }] },
		)
		assert.equal(v.ok, true)
		assert.deepEqual(v.warnings, ["'bus' is placed 2 times, over its maxInstances (1) — readers draw the first 1"])
	})

	test('a grid entry with no zone, or a zone that is not a string, is refused — and its id is still checked', () => {
		const entry = (zone: unknown, id = 'NOT A VALID ID') =>
			validateSessionLayout({
				widgetGrid: { version: 1, cell: 44, widgets: [{ id, ...(zone === undefined ? {} : { zone }), order: 0, size: grow, anchor: {} }] },
			})
		const missing = entry(undefined)
		assert.equal(missing.ok, false)
		assert.ok(missing.errors.includes('widgetGrid.widgets[0].zone: one of left, middle, right'))
		assert.ok(missing.errors.some((e) => e.includes("'NOT A VALID ID' is not a widget instance id")))
		const numbered = entry(3, 'stats')
		assert.equal(numbered.ok, false)
		assert.deepEqual(numbered.errors, ['widgetGrid.widgets[0].zone: one of left, middle, right'])
	})

	test("a zone is keyed by where the page draws it — its side, or a strip's area", () => {
		const zones = (z: Record<string, unknown>, extra: SessionLayoutV1 = {}) =>
			validateSessionLayout({ ...extra, zoneLayout: { version: 1, zones: z } } as never)
		// Keyed as drawn: a side by its side, a strip by its area.
		assert.equal(zones({ left: { kind: 'side', side: 'left', widgets: [] }, right: { kind: 'side', widgets: [] } }).ok, true)
		assert.equal(
			zones({ top: { kind: 'strip', area: 'top', widgets: ['stats'] }, bottom: { kind: 'strip', area: 'bottom', widgets: ['world-state'] } }).ok,
			true,
		)
		assert.equal(zones({ top: { kind: 'strip', widgets: [] } }).ok, true, 'a strip with no area is the top')
		// A side zone keyed 'middle' is drawn on the right …
		const middle = zones(
			{ middle: { kind: 'side', widgets: ['stats'] } },
			{ widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'stats', zone: 'middle', order: 0, size: grow, anchor: {} }] } },
		)
		assert.equal(middle.ok, false)
		assert.ok(middle.errors.some((e) => e.startsWith('zoneLayout.zones.middle: the page draws this side zone at the right')))
		assert.ok(middle.errors.some((e) => e.includes("'stats' is also placed in right")), 'two zones, as the page draws them')
		// … a strip keyed 'middle' is drawn at the top …
		const strip = zones(
			{ middle: { kind: 'strip', widgets: ['world-state'] } },
			{ widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'world-state', zone: 'middle', order: 0, size: grow, anchor: {} }] } },
		)
		assert.equal(strip.ok, false)
		assert.ok(strip.errors.some((e) => e.includes("'world-state' is also placed in top")))
		// … and a zone keyed 'left' that says right is on the right.
		const lying = zones(
			{ left: { kind: 'side', side: 'right', widgets: ['stats'] } },
			{ arrangedGrid: { left: { cols: 1, rows: 1, items: [{ id: 'stats', x: 0, y: 0, w: 1, h: 1 }] } } },
		)
		assert.equal(lying.ok, false)
		assert.ok(lying.errors.some((e) => e.includes("key it 'right', or set side: 'left'")))
		assert.ok(lying.errors.some((e) => e.includes("'stats' is also placed in right")))
		// A side zone keyed 'left' that names no side is the right one; a strip keyed 'bottom' with no area is the top.
		assert.ok(zones({ left: { kind: 'side', widgets: [] } }).errors.some((e) => e.includes('it states no side')))
		assert.ok(zones({ bottom: { kind: 'strip', widgets: [] } }).errors.some((e) => e.includes('it states no area')))
		assert.ok(zones({ top: { kind: 'strip', area: 'up', widgets: [] } }).errors.includes("zoneLayout.zones.top.area: 'top' or 'bottom'"))
	})

	test('warnings: placed but never drawn, and two items on one cell', () => {
		// A grid entry on a side the layout has no zone for.
		const noSide = validateSessionLayout({
			widgetGrid: {
				version: 1,
				cell: 44,
				widgets: [
					{ id: 'messages', zone: 'middle', order: 0, size: grow, anchor: all },
					{ id: 'stats', zone: 'right', order: 0, size: grow, anchor: {} },
				],
			},
		})
		assert.equal(noSide.ok, true)
		assert.deepEqual(noSide.warnings, [
			"'stats' is placed in the right but never drawn — the grid puts it on the right, where the layout has no side zone to draw it in",
		])
		// The middle's arrangement draws over the grid's middle: the conversation is not drawn.
		const shadowed = validateSessionLayout({
			...floor(),
			arrangedGrid: { middle: { cols: 1, rows: 1, items: [{ id: 'stats', x: 0, y: 0, w: 1, h: 1 }] } },
		})
		assert.deepEqual(shadowed.warnings, [
			"'messages' is placed in the middle but never drawn — the middle's arrangement draws there, and it does not place 'messages'",
		])
		// A side's arrangement draws over its list.
		const overList = validateSessionLayout({
			zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['stats', 'world-state'] } } },
			arrangedGrid: { right: { cols: 1, rows: 2, items: [{ id: 'stats', x: 0, y: 0, w: 1, h: 2 }] } },
		})
		assert.ok(overList.warnings.some((w) => w.startsWith("'world-state' is placed in the right but never drawn — the right's arrangement")))
		// Two boxes on one cell.
		const overlap = validateSessionLayout({
			arrangedGrid: {
				right: {
					cols: 2,
					rows: 2,
					items: [
						{ id: 'stats', x: 0, y: 0, w: 2, h: 1 },
						{ id: 'world-state', x: 1, y: 0, w: 1, h: 2 },
						{ id: 'map', x: 0, y: 1, w: 1, h: 1 },
					],
				},
			},
		})
		assert.equal(overlap.ok, true)
		assert.deepEqual(overlap.warnings, ["arrangedGrid.right: 'stats' and 'world-state' share cells — one draws over the other"])
	})
})

describe("core's genres declare the layouts they have always shipped", () => {
	/**
	 * The blobs each genre shipped before brief 1, verbatim — what the
	 * instance's `layout` column held. The genre now declares the same object;
	 * the one deliberate difference is the widget grid's retired `required`
	 * flag (brief 7a retired it; nothing has read it since), which brief 1
	 * dropped with the other catalog edits. Nothing else moved, byte for byte.
	 */
	const before = JSON.parse(readFileSync(join(import.meta.dirname, 'goldens/core-session-layouts.json'), 'utf8')) as Record<
		string,
		{ widgetGrid?: { widgets: Array<Record<string, unknown>> } }
	>
	const withoutRequired = (blob: (typeof before)[string]) => {
		const copy = structuredClone(blob)
		for (const w of copy.widgetGrid?.widgets ?? []) delete w.required
		return copy
	}

	for (const g of [adventureGenre, lairGenre])
		test(g.id, () => {
			const [shipped, ...others] = g.layouts ?? []
			assert.equal(others.length, 0)
			assert.equal(shipped?.slug, 'default')
			assert.ok(before[g.id], 'a golden for the genre')
			assert.equal(JSON.stringify(shipped!.preset), JSON.stringify(withoutRequired(before[g.id]!)))
			assert.equal(JSON.stringify(shipped!.preset).includes('"required"'), false)
			assert.deepEqual(validateSessionLayout(shipped!.preset, { widgets: CORE_WIDGETS, unknownWidgets: 'warn' }), {
				ok: true,
				errors: [],
				warnings: [],
			})
		})
})
