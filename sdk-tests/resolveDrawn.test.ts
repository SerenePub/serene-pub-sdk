/**
 * `resolveDrawn` — the ONE reader of what a session layout draws, and where
 * (PLAN-widget-system-consolidation C5, F3). The three slots (`zoneLayout`,
 * `widgetGrid`, `arrangedGrid`) are its inputs; the precedence between them,
 * the one pin rule and the width ladder are its, and every "is it drawn"
 * reader (`drawnWidgetIds`, `primaryPlaced`) is its answer as ids.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	DEFAULT_SIDE_RULES,
	drawnInstances,
	drawnWidgetIds,
	isInstanceOf,
	pinnedOf,
	primaryPlaced,
	resolveDrawn,
	RETIRED_WIDGET_IDS,
	widgetOfInstance,
	zoneRungAt,
	type DrawnLayout,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { ADVENTURE_LAYOUT, CHAT_LAYOUT, LAIR_LAYOUT } from '../core-catalog/src/registry/layouts.js'

const grow = { w: 'grow', h: 'grow' } as const
const all = { top: true, bottom: true, left: true, right: true }
const WIDTHS = [0, 500, 800, 1300, 2000, 2600]

/** The ids one zone draws. */
const ids = (z: { instances: { instanceId: string }[] }) => z.instances.map((i) => i.instanceId)

/** Total, places the primary, drops retired ids, one boolean pin per instance, each instance once. */
function assertSound(name: string, layout: SessionLayoutV1, primary: string) {
	for (const inline of WIDTHS) {
		const drawn: DrawnLayout = resolveDrawn(layout, { inline, block: 900 })
		const every = drawnInstances(drawn)
		assert.ok(
			every.some((i) => isInstanceOf(i.instanceId, primary)),
			`${name} @${inline}: the primary (${primary}) is drawn`,
		)
		for (const i of every) {
			assert.equal(typeof i.pinned, 'boolean', `${name} @${inline}: '${i.instanceId}' has one boolean pin`)
			assert.ok(!RETIRED_WIDGET_IDS.has(widgetOfInstance(i.instanceId)), `${name}: '${i.instanceId}' is not retired`)
			assert.equal(i.widgetId, widgetOfInstance(i.instanceId))
		}
		const list = every.map((i) => i.instanceId)
		assert.equal(new Set(list).size, list.length, `${name} @${inline}: each instance is drawn once`)
		assert.deepEqual(drawnWidgetIds(layout), list, `${name}: drawnWidgetIds is resolveDrawn's answer`)
		for (const z of [drawn.left, drawn.middle, drawn.right])
			assert.equal(typeof z.pinned, 'boolean', `${name} @${inline}: the ${z.zone} has one zone pin`)
	}
	assert.equal(primaryPlaced(layout, primary), true)
}

describe('every shipped genre layout', () => {
	test('core: Chat, Adventure and Lair', () => {
		assertSound('CHAT_LAYOUT', CHAT_LAYOUT, 'messages')
		assertSound('ADVENTURE_LAYOUT', ADVENTURE_LAYOUT, 'messages')
		assertSound('LAIR_LAYOUT', LAIR_LAYOUT, 'messages')
	})

	test('what each one draws, where', () => {
		const chat = resolveDrawn(CHAT_LAYOUT, { inline: 1300 })
		assert.equal(chat.middle.drawnFrom, 'grid')
		assert.deepEqual(ids(chat.middle), ['messages'])
		assert.equal(chat.right.drawnFrom, 'arrangement')
		assert.deepEqual(chat.right.instances, [
			{ instanceId: 'authors-note', widgetId: 'authors-note', cells: { x: 0, y: 0, w: 1, h: 12 }, pinned: false },
		])

		const adventure = resolveDrawn(ADVENTURE_LAYOUT, { inline: 1300 })
		// The world strip is a copy of Stats placed by name (W7), not the alias.
		assert.deepEqual(ids(adventure.middle), ['stats#world', 'messages'])
		assert.equal(adventure.middle.instances[0].widgetId, 'stats')
		assert.deepEqual(adventure.middle.instances[0].size, { w: 'grow', h: 'fixed' })
		assert.equal(adventure.right.drawnFrom, 'arrangement')
		assert.deepEqual(adventure.right.arrangement, { cols: 1, rows: 12 })
		assert.deepEqual(ids(adventure.right), ['scene-portraits', 'stats'])
		assert.ok(adventure.right.instances.every((i) => i.pinned), 'no `pinned` field: both open')
		// The unpinned left rail: Chronicle and Lore entries, NOT arranged (an
		// arranged side counts its docked width toward the tuck threshold even
		// unpinned) — the ladder, an icon strip once it would dock.
		assert.equal(adventure.left.drawnFrom, 'ladder')
		assert.deepEqual(ids(adventure.left), ['chronicle', 'lore-entries'])
		assert.ok(adventure.left.instances.every((i) => !i.pinned), 'an unpinned zone: both icons')
		assert.equal(adventure.left.pinned, false)
		assert.equal(adventure.left.rung?.mode, 'icons')
		assert.equal(resolveDrawn(ADVENTURE_LAYOUT, { inline: 800 }).left.rung?.mode, 'drawer')

		const lair = resolveDrawn(LAIR_LAYOUT, { inline: 1300 })
		assert.deepEqual(ids(lair.left), ['stats'])
		assert.deepEqual(ids(lair.right), ['places', 'annex#castellan', 'messages#sanctum'])
		assert.deepEqual(
			lair.right.instances.map((i) => i.widgetId),
			['places', 'annex', 'messages'],
		)
		assert.ok(lair.right.instances.every((i) => i.pinned), 'the right column opens whole')
		assert.equal(lair.left.zoneKey, 'left')
	})

	// The showcase plugins live in sibling repositories; their layouts are
	// plain data (`import type` only), so they are read when checked out.
	for (const [repo, file, name] of [
		['serene-pub-plugin-whodunit', 'src/layout.ts', 'WHODUNIT_LAYOUT'],
		['serene-pub-plugin-writing-room', 'src/layout.ts', 'WRITING_ROOM_LAYOUT'],
	] as const) {
		const path = join(import.meta.dirname, '..', '..', repo, file)
		test(`plugin: ${name}`, { skip: existsSync(path) ? false : `${repo} is not checked out beside the SDK` }, async () => {
			const mod = (await import(pathToFileURL(path).href)) as Record<string, SessionLayoutV1>
			assert.ok(mod[name], `${file} exports ${name}`)
			assertSound(name, mod[name], 'messages')
		})
	}
})

describe('the precedence, side by side', () => {
	const zones = (right: string[], pinned?: boolean): SessionLayoutV1['zoneLayout'] => ({
		version: 1,
		zones: { right: { kind: 'side', side: 'right', widgets: right, ...(pinned === undefined ? {} : { pinned }) } },
	})
	const frame = (...items: { id: string; y: number; pinned?: boolean }[]) => ({
		cols: 1,
		rows: 12,
		items: items.map((i) => ({ x: 0, w: 1, h: 2, ...i })),
	})

	test('a list only: the ladder draws the zone, its instances take its pin', () => {
		const d = resolveDrawn({ zoneLayout: zones(['notes', 'stats'], false) }, { inline: 1300 })
		assert.equal(d.right.drawnFrom, 'ladder')
		assert.deepEqual(ids(d.right), ['notes', 'stats'])
		assert.ok(d.right.instances.every((i) => i.pinned === false && i.cells === undefined))
		assert.equal(d.right.rung?.mode, 'icons')
		assert.equal(resolveDrawn({ zoneLayout: zones(['notes']) }, { inline: 1300 }).right.rung?.mode, 'rail')
	})

	test('an arrangement only: drawn from it, in reading order, each instance its own pin', () => {
		const d = resolveDrawn({ arrangedGrid: { right: frame({ id: 'b', y: 4, pinned: false }, { id: 'a', y: 0 }) } }, { inline: 1300 })
		assert.equal(d.right.drawnFrom, 'arrangement')
		assert.deepEqual(ids(d.right), ['a', 'b'])
		assert.deepEqual(
			d.right.instances.map((i) => i.pinned),
			[true, false],
		)
		assert.deepEqual(d.right.instances[1].cells, { x: 0, y: 4, w: 1, h: 2 })
		// No zone declared: the side's default ladder, pinned.
		assert.equal(d.right.zoneKey, null)
		assert.equal(d.right.pinned, true)
		assert.equal(d.right.rung?.width, 248, 'the 1200–1440 rung')
		assert.equal(resolveDrawn({ arrangedGrid: { right: frame({ id: 'a', y: 0 }) } }, { inline: 1600 }).right.rung?.width, 264)
	})

	test('both: the arrangement wins, and what only the list names is not drawn', () => {
		const layout: SessionLayoutV1 = { zoneLayout: zones(['notes', 'stats']), arrangedGrid: { right: frame({ id: 'stats', y: 0 }) } }
		const d = resolveDrawn(layout, { inline: 1300 })
		assert.equal(d.right.drawnFrom, 'arrangement')
		assert.deepEqual(ids(d.right), ['stats'])
		assert.deepEqual(drawnWidgetIds(layout), ['stats'])
		// An arrangement that places nothing live is not one: the list draws.
		const leftover = resolveDrawn({ ...layout, arrangedGrid: { right: frame({ id: 'inventory', y: 0 }) } }, { inline: 1300 })
		assert.equal(leftover.right.drawnFrom, 'ladder')
		assert.deepEqual(ids(leftover.right), ['notes', 'stats'])
	})

	test('neither: nothing drawn, and the width ladder still says how the side presents', () => {
		const d = resolveDrawn({}, { inline: 500 })
		for (const z of [d.left, d.right]) {
			assert.equal(z.drawnFrom, 'ladder')
			assert.deepEqual(z.instances, [])
			assert.equal(z.rung?.mode, 'drawer')
		}
		const wide = resolveDrawn({}, { inline: 900 })
		assert.equal(wide.right.rung?.mode, 'rail', 'the right docks from 760')
		assert.equal(wide.left.rung?.mode, 'drawer', 'the left from 1200')
		assert.deepEqual(resolveDrawn({}, { inline: 2600 }).right.rung, { mode: 'rail', width: 344, columns: 2 })
		assert.deepEqual(drawnInstances(d), [])
	})

	test('the middle: its arrangement whenever it has one — an emptied one stays empty — else the grid', () => {
		const grid: SessionLayoutV1['widgetGrid'] = {
			version: 1,
			cell: 44,
			widgets: [
				{ id: 'messages', zone: 'middle', order: 1, size: grow, anchor: all },
				{ id: 'map', zone: 'middle', order: 0, size: { w: 'grow', h: 'fixed' }, anchor: { top: true } },
			],
		}
		const fromGrid = resolveDrawn({ widgetGrid: grid }, { inline: 1300 })
		assert.equal(fromGrid.middle.drawnFrom, 'grid')
		assert.deepEqual(ids(fromGrid.middle), ['map', 'messages'])
		const arranged = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: frame({ id: 'messages', y: 0 }) } }, { inline: 1300 })
		assert.equal(arranged.middle.drawnFrom, 'arrangement')
		assert.deepEqual(ids(arranged.middle), ['messages'])
		const emptied = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, { inline: 1300 })
		assert.deepEqual(ids(emptied.middle), [])
		assert.equal(primaryPlaced({ widgetGrid: grid, arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, 'messages'), false)
		// A frame the page cannot draw (no cell grid) is not an arrangement.
		const junk = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: { items: [] } as never } }, { inline: 1300 })
		assert.equal(junk.middle.drawnFrom, 'grid')
	})

	test('a grid entry naming a side is folded into its first zone — and drawn nowhere without one', () => {
		const entry = { id: 'notes', zone: 'right' as const, order: 0, size: grow, anchor: {}, pinned: false }
		const withZone = resolveDrawn(
			{ zoneLayout: zones(['stats']), widgetGrid: { version: 1, cell: 44, widgets: [entry] } },
			{ inline: 1300 },
		)
		assert.deepEqual(ids(withZone.right), ['stats', 'notes'])
		assert.equal(withZone.right.instances[1].pinned, true, "a listed instance takes its zone's pin")
		const without = resolveDrawn({ widgetGrid: { version: 1, cell: 44, widgets: [entry] } }, { inline: 1300 })
		assert.deepEqual(ids(without.right), [])
	})

	test('an instance is drawn once, where it is first read: middle, left, right, strips', () => {
		const layout: SessionLayoutV1 = {
			zoneLayout: {
				version: 1,
				zones: {
					left: { kind: 'side', side: 'left', widgets: ['stats'] },
					right: { kind: 'side', side: 'right', widgets: ['stats', 'messages'] },
					top: { kind: 'strip', area: 'top', widgets: ['banner', 'stats'] },
				},
			},
			widgetGrid: { version: 1, cell: 44, widgets: [{ id: 'messages', zone: 'middle', order: 0, size: grow, anchor: all }] },
		}
		const d = resolveDrawn(layout, { inline: 1300 })
		assert.deepEqual(ids(d.middle), ['messages'])
		assert.deepEqual(ids(d.left), ['stats'])
		assert.deepEqual(ids(d.right), [])
		assert.deepEqual(d.strips.map((s) => [s.zoneKey, s.area, s.rung.mode, ids(s)]), [['top', 'top', 'row', ['banner']]])
		assert.deepEqual(drawnWidgetIds(layout), ['messages', 'stats', 'banner'])
	})

	test('a side zone is read by its side, never its key', () => {
		const d = resolveDrawn(
			{ zoneLayout: { version: 1, zones: { l: { kind: 'side', side: 'left', widgets: ['tasks'] }, x: { widgets: ['notes'] } as never } } },
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.left), ['tasks'])
		assert.equal(d.left.zoneKey, 'l')
		assert.deepEqual(ids(d.right), ['notes'], 'a zone that states nothing is a right side')
	})
})

describe('retired widgets', () => {
	test('dropped from every slot — a copy of one included', () => {
		const d = resolveDrawn(
			{
				zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['inventory', 'notes', 'inventory#2'] } } },
				arrangedGrid: {
					middle: {
						cols: 4,
						rows: 8,
						items: [
							{ id: 'messages', x: 0, y: 0, w: 4, h: 6 },
							{ id: 'composer', x: 0, y: 6, w: 4, h: 2 },
						],
					},
				},
			},
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.middle), ['messages'])
		assert.deepEqual(ids(d.right), ['notes'])
	})
})

describe('the one pin rule', () => {
	test('pinnedOf: absent means pinned; only `false` unpins', () => {
		assert.equal(pinnedOf({}), true)
		assert.equal(pinnedOf({ pinned: true }), true)
		assert.equal(pinnedOf({ pinned: false }), false)
		assert.equal(pinnedOf({ pinned: 'no' }), true)
		assert.equal(pinnedOf(undefined), true)
		assert.equal(pinnedOf(null), true)
	})

	test('an arranged item, a grid entry and a zone read it alike', () => {
		const d = resolveDrawn(
			{
				zoneLayout: {
					version: 1,
					zones: {
						left: { kind: 'side', side: 'left', widgets: ['a'] },
						right: { kind: 'side', side: 'right', pinned: false, widgets: ['b'] },
					},
				},
				widgetGrid: {
					version: 1,
					cell: 44,
					widgets: [
						{ id: 'messages', zone: 'middle', order: 0, size: grow, anchor: all },
						{ id: 'strip', zone: 'middle', order: 1, size: grow, anchor: all, pinned: false },
					],
				},
			},
			{ inline: 1300 },
		)
		assert.deepEqual(
			d.middle.instances.map((i) => [i.instanceId, i.pinned]),
			[
				['messages', true],
				['strip', false],
			],
		)
		assert.equal(d.left.pinned, true)
		assert.equal(d.left.instances[0].pinned, true)
		assert.equal(d.right.pinned, false)
		assert.equal(d.right.instances[0].pinned, false)
	})
})

describe('zoneRungAt — the one ladder walk', () => {
	test('ascending and cumulative: each rule states only what changes', () => {
		const def = {
			kind: 'side' as const,
			side: 'right' as const,
			widgets: [],
			rules: [
				{ min: 1500, columns: 2 },
				{ min: 0, mode: 'drawer' as const, width: 300 },
				{ min: 900, mode: 'rail' as const },
			],
		}
		assert.deepEqual(zoneRungAt(def, 500), { mode: 'drawer', width: 300, columns: 1 })
		assert.deepEqual(zoneRungAt(def, 1000), { mode: 'rail', width: 300, columns: 1 })
		assert.deepEqual(zoneRungAt(def, 1600), { mode: 'rail', width: 300, columns: 2 })
		assert.equal(zoneRungAt({ ...def, pinned: false }, 1000).mode, 'icons', 'an unpinned rail is an icon strip')
		assert.equal(zoneRungAt({ ...def, pinned: false }, 500).mode, 'drawer', 'the pin refines a rail only')
	})

	test('a strip is a row unless a rule hides it; a zone with no rules walks the default for its side', () => {
		assert.equal(zoneRungAt({ kind: 'strip', widgets: [] }, 900).mode, 'row')
		assert.equal(zoneRungAt({ kind: 'strip', widgets: [], rules: [{ min: 0, mode: 'hidden' }] }, 900).mode, 'hidden')
		assert.equal(zoneRungAt({ kind: 'strip', widgets: [], rules: [{ min: 0, mode: 'rail' }] }, 900).mode, 'row')
		assert.equal(DEFAULT_SIDE_RULES.left[1].min, 1200)
		assert.equal(zoneRungAt({ kind: 'side', side: 'left', widgets: [] }, 1000).mode, 'drawer')
		assert.equal(zoneRungAt({ kind: 'side', side: 'left', widgets: [] }, 1200).mode, 'rail')
	})

	test('the default side ladder: 248 from 1200 to 1440, where both sides dock, then 264', () => {
		const at = (side: 'left' | 'right', inline: number) => zoneRungAt({ kind: 'side', side, widgets: [] }, inline)
		// Below 1200 every rung is as it was: the right alone docks, at 264.
		assert.deepEqual(at('right', 760), { mode: 'rail', width: 264, columns: 1 })
		assert.deepEqual(at('right', 1199), { mode: 'rail', width: 264, columns: 1 })
		assert.equal(at('left', 1199).mode, 'drawer')
		for (const side of ['left', 'right'] as const) {
			assert.deepEqual(at(side, 1200), { mode: 'rail', width: 248, columns: 1 }, `${side} @1200`)
			assert.deepEqual(at(side, 1216), { mode: 'rail', width: 248, columns: 1 }, `${side} @1216`)
			assert.deepEqual(at(side, 1439), { mode: 'rail', width: 248, columns: 1 }, `${side} @1439`)
			assert.deepEqual(at(side, 1440), { mode: 'rail', width: 264, columns: 1 }, `${side} @1440`)
			assert.deepEqual(at(side, 1900), { mode: 'rail', width: 300, columns: 1 }, `${side} @1900`)
			assert.deepEqual(at(side, 2400), { mode: 'rail', width: 344, columns: 2 }, `${side} @2400`)
		}
	})

	test('a 1216px session box (a 1280 window): the Lair docks both sides beside a readable middle', () => {
		const lair = resolveDrawn(LAIR_LAYOUT, { inline: 1216 })
		for (const z of [lair.left, lair.right]) {
			assert.ok(z.instances.length > 0, `the ${z.zone} draws`)
			assert.equal(z.pinned, true, `the ${z.zone} is pinned`)
			assert.ok(z.instances.every((i) => i.pinned), `the ${z.zone}'s instances are docked`)
			assert.deepEqual(z.rung, { mode: 'rail', width: 248, columns: 1 }, `the ${z.zone} is a docked 248px rail`)
		}
		// Two docked columns, a body gap each and the stage's 696px measure.
		const need = lair.left.rung!.width + lair.right.rung!.width + 2 * 8 + (40 + 3.5) * 16
		assert.equal(need, 1208)
		assert.ok(need <= 1216, 'fits the box, so neither side tucks')
	})
})

describe('total', () => {
	test('any value reads, and what cannot be read places nothing', () => {
		for (const junk of [undefined, null, 7, 'x', [], { zoneLayout: 3, widgetGrid: { widgets: 'no' }, arrangedGrid: [] }]) {
			const d = resolveDrawn(junk as never, { inline: NaN })
			assert.deepEqual(drawnInstances(d), [])
			assert.equal(d.middle.drawnFrom, 'grid')
		}
	})
})
