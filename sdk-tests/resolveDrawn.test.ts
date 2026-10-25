/**
 * `resolveDrawn` — the ONE reader of what a session layout draws, and where
 * (PLAN-widget-system-consolidation C5, F3; PLAN-session-panels §1.2). It
 * reads `panelsOf`: the layout's panels, else the ⏳ old slots through
 * `panelsFromSlots`. The one pin rule and the width ladder are its, and every
 * "is it drawn" reader (`drawnWidgetIds`, `primaryPlaced`) is its answer as ids.
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
	panelsOf,
	pinnedOf,
	primaryPlaced,
	resolveDrawn,
	RETIRED_WIDGET_IDS,
	widgetOfInstance,
	zoneRungAt,
	type DrawnLayout,
	type PanelLayoutV1,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { STORY_WORLD_LAYOUT, STORY_LAYOUT, LAIR_LAYOUT } from '../core-catalog/src/registry/layouts.js'

const grow = { w: 'grow', h: 'grow' } as const
const all = { top: true, bottom: true, left: true, right: true }
const WIDTHS = [0, 500, 800, 1300, 2000, 2600]

/** The ids one zone draws (its panels' tabs, the floor's left out). */
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
		assertSound('STORY_LAYOUT', STORY_LAYOUT, 'messages')
		assertSound('STORY_WORLD_LAYOUT', STORY_WORLD_LAYOUT, 'messages')
		assertSound('LAIR_LAYOUT', LAIR_LAYOUT, 'messages')
	})

	test('what each one draws, where', () => {
		const chat = resolveDrawn(STORY_LAYOUT, { inline: 1300 })
		assert.deepEqual(ids(chat.middle), ['messages'])
		assert.equal(chat.middle.primary.floor, undefined, 'the layout placed it')
		assert.deepEqual(chat.right.panels, [
			{
				key: 'p2',
				tabs: [{ instanceId: 'authors-note', widgetId: 'authors-note', pinned: false }],
				open: 'authors-note',
				pinned: false,
				height: 'fill',
			},
		])
		assert.equal(chat.right.pinned, false, 'every panel in the rail: the side takes rail width')
		assert.equal(chat.right.rung?.mode, 'icons')

		const adventure = resolveDrawn(STORY_WORLD_LAYOUT, { inline: 1300 })
		// The world strip is a copy of Stats placed by name (W7), not the alias:
		// a panel above the conversation, sized to fit.
		assert.deepEqual(ids(adventure.middle), ['stats#world', 'messages'])
		assert.deepEqual(
			adventure.middle.above.map((p) => [p.tabs.map((t) => t.instanceId), p.height]),
			[[['stats#world'], 'fit']],
		)
		assert.equal(adventure.middle.above[0]!.tabs[0]!.widgetId, 'stats')
		assert.deepEqual(adventure.middle.primary.tabs.map((t) => t.instanceId), ['messages'])
		assert.deepEqual(adventure.middle.below, [])
		assert.deepEqual(ids(adventure.right), ['scene-portraits', 'stats'])
		assert.equal(adventure.right.panels.length, 2, 'two panels, one tab each')
		assert.ok(adventure.right.panels.every((p) => p.pinned && p.height === 'fill'), 'no `pinned` field: both docked')
		// The unpinned left: Chronicle and Lore entries, each a panel in the rail.
		assert.deepEqual(ids(adventure.left), ['chronicle', 'lore-entries'])
		assert.ok(adventure.left.panels.every((p) => !p.pinned), 'an unpinned zone: both in the rail')
		assert.equal(adventure.left.pinned, false)
		assert.equal(adventure.left.rung?.mode, 'icons')
		assert.equal(resolveDrawn(STORY_WORLD_LAYOUT, { inline: 800 }).left.rung?.mode, 'drawer')

		const lair = resolveDrawn(LAIR_LAYOUT, { inline: 1300 })
		assert.deepEqual(ids(lair.left), ['stats'])
		// 🚧 lair fix 2: the Sanctum is a tab of the story, not a panel here.
		assert.deepEqual(ids(lair.right), ['places', 'annex#castellan'])
		assert.deepEqual(
			lair.right.instances.map((i) => i.widgetId),
			['places', 'annex'],
		)
		assert.ok(lair.right.panels.every((p) => p.pinned), 'the right column opens whole')
		assert.equal(lair.left.zoneKey, null, 'panels only: no ⏳ zoneLayout zone names the side')
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

describe('panels: the whole truth when present', () => {
	const panels = (p: Partial<PanelLayoutV1>): SessionLayoutV1 => ({
		panels: { version: 1, left: [], right: [], middle: { above: [], primary: { key: 'p1', tabs: ['messages'] }, below: [] }, ...p },
	})

	test('tabs, the shown tab, one pin and a height per panel', () => {
		const d = resolveDrawn(
			panels({
				right: [
					{ key: 'p2', tabs: ['notes', 'stats'], open: 'stats', height: { share: 4 } },
					{ key: 'p3', tabs: ['map'], pinned: false, height: 'fit', title: 'Where' },
				],
			}),
			{ inline: 1300 },
		)
		assert.deepEqual(
			d.right.panels.map((p) => [p.key, p.tabs.map((t) => t.instanceId), p.open, p.pinned, p.height, p.title ?? null]),
			[
				['p2', ['notes', 'stats'], 'stats', true, { share: 4 }, null],
				['p3', ['map'], 'map', false, 'fit', 'Where'],
			],
		)
		assert.deepEqual(
			d.right.instances.map((i) => [i.instanceId, i.pinned]),
			[
				['notes', true],
				['stats', true],
				['map', false],
			],
		)
		assert.equal(d.right.pinned, true, 'a docked panel docks the side')
		assert.equal(d.right.rung?.mode, 'rail')
		assert.equal(d.right.zoneKey, null)
		assert.equal(d.right.rung?.width, 248, 'the 1200–1440 rung')
	})

	test('the old slots are not read beside panels', () => {
		const layout: SessionLayoutV1 = {
			...panels({}),
			zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['stats'] } } },
			arrangedGrid: { left: { cols: 1, rows: 1, items: [{ id: 'notes', x: 0, y: 0, w: 1, h: 1 }] } },
		}
		assert.deepEqual(drawnWidgetIds(layout), ['messages'])
		assert.equal(panelsOf(layout), layout.panels)
	})

	test("a bad `open`, a junk height and an empty panel read as the defaults; a dropped tab's panel is not drawn", () => {
		const d = resolveDrawn(
			panels({
				left: [
					{ key: 'p2', tabs: ['notes'], open: 'gone', height: { share: 13 } },
					{ key: 'p3', tabs: ['inventory'] },
					{ key: 'p4', tabs: [] },
				],
			}),
			{ inline: 1300 },
		)
		assert.deepEqual(
			d.left.panels.map((p) => [p.key, p.open, p.height]),
			[['p2', 'notes', 'fill']],
		)
	})

	test('a middle panel never pins out, whatever it says', () => {
		const d = resolveDrawn(
			panels({ middle: { above: [{ key: 'p2', tabs: ['banner'], pinned: false }], primary: { key: 'p1', tabs: ['messages'] }, below: [] } }),
			{ inline: 1300 },
		)
		assert.equal(d.middle.above[0]!.pinned, true)
		assert.deepEqual(
			d.middle.panels.map((p) => p.key),
			['p2', 'p1'],
		)
	})

	test('neither panels nor slots: the floor, which the id readers do not count, and the ladder still says how a side presents', () => {
		const d = resolveDrawn({}, { inline: 500 })
		assert.equal(d.middle.primary.floor, true)
		assert.deepEqual(d.middle.primary.tabs.map((t) => t.instanceId), ['messages'])
		assert.deepEqual(d.middle.instances, [])
		for (const z of [d.left, d.right]) {
			assert.deepEqual(z.panels, [])
			assert.equal(z.rung?.mode, 'drawer')
		}
		const wide = resolveDrawn({}, { inline: 900 })
		assert.equal(wide.right.rung?.mode, 'rail', 'the right docks from 760')
		assert.equal(wide.left.rung?.mode, 'drawer', 'the left from 1200')
		assert.deepEqual(resolveDrawn({}, { inline: 2600 }).right.rung, { mode: 'rail', width: 344, columns: 2 })
		assert.deepEqual(drawnInstances(d), [])
		assert.equal(primaryPlaced({}, 'messages'), false)
	})
})

describe('the old slots, through panelsFromSlots', () => {
	const zones = (right: string[], pinned?: boolean): SessionLayoutV1['zoneLayout'] => ({
		version: 1,
		zones: { right: { kind: 'side', side: 'right', widgets: right, ...(pinned === undefined ? {} : { pinned }) } },
	})
	const frame = (...items: { id: string; y: number; pinned?: boolean }[]) => ({
		cols: 1,
		rows: 12,
		items: items.map((i) => ({ x: 0, w: 1, h: 2, ...i })),
	})

	test('a list only: each item a panel, taking its zone pin', () => {
		const d = resolveDrawn({ zoneLayout: zones(['notes', 'stats'], false) }, { inline: 1300 })
		assert.deepEqual(ids(d.right), ['notes', 'stats'])
		assert.ok(d.right.panels.every((p) => p.pinned === false))
		assert.equal(d.right.rung?.mode, 'icons')
		assert.equal(resolveDrawn({ zoneLayout: zones(['notes']) }, { inline: 1300 }).right.rung?.mode, 'rail')
	})

	test('an arrangement only: in reading order, each panel its own pin', () => {
		const d = resolveDrawn({ arrangedGrid: { right: frame({ id: 'b', y: 4, pinned: false }, { id: 'a', y: 0 }) } }, { inline: 1300 })
		assert.deepEqual(ids(d.right), ['a', 'b'])
		assert.deepEqual(
			d.right.panels.map((p) => p.pinned),
			[true, false],
		)
		assert.equal(d.right.zoneKey, null)
		assert.equal(d.right.pinned, true)
		assert.equal(resolveDrawn({ arrangedGrid: { right: frame({ id: 'a', y: 0 }) } }, { inline: 1600 }).right.rung?.width, 264)
	})

	test('both: the arrangement wins, and what only the list names is not drawn', () => {
		const layout: SessionLayoutV1 = { zoneLayout: zones(['notes', 'stats']), arrangedGrid: { right: frame({ id: 'stats', y: 0 }) } }
		assert.deepEqual(ids(resolveDrawn(layout, { inline: 1300 }).right), ['stats'])
		assert.deepEqual(drawnWidgetIds(layout), ['stats'])
		// An arrangement that places nothing live is not one: the list draws.
		const leftover = resolveDrawn({ ...layout, arrangedGrid: { right: frame({ id: 'inventory', y: 0 }) } }, { inline: 1300 })
		assert.deepEqual(ids(leftover.right), ['notes', 'stats'])
	})

	test('the middle: its arrangement whenever it has one — an emptied one draws only the floor — else the grid', () => {
		const grid: SessionLayoutV1['widgetGrid'] = {
			version: 1,
			cell: 44,
			widgets: [
				{ id: 'messages', zone: 'middle', order: 1, size: grow, anchor: all },
				{ id: 'map', zone: 'middle', order: 0, size: { w: 'grow', h: 'fixed' }, anchor: { top: true } },
			],
		}
		const fromGrid = resolveDrawn({ widgetGrid: grid }, { inline: 1300 })
		assert.deepEqual(ids(fromGrid.middle), ['map', 'messages'])
		assert.deepEqual(fromGrid.middle.above.map((p) => p.tabs[0]!.instanceId), ['map'])
		const arranged = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: frame({ id: 'messages', y: 0 }) } }, { inline: 1300 })
		assert.deepEqual(ids(arranged.middle), ['messages'])
		const emptied = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, { inline: 1300 })
		assert.deepEqual(ids(emptied.middle), [])
		assert.equal(emptied.middle.primary.floor, true)
		assert.equal(primaryPlaced({ widgetGrid: grid, arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, 'messages'), false)
		// A frame the page cannot draw (no cell grid) is not an arrangement.
		const junk = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: { items: [] } as never } }, { inline: 1300 })
		assert.deepEqual(ids(junk.middle), ['map', 'messages'])
	})

	test('a grid entry naming a side is folded into its first zone — and drawn nowhere without one', () => {
		const entry = { id: 'notes', zone: 'right' as const, order: 0, size: grow, anchor: {}, pinned: false }
		const withZone = resolveDrawn(
			{ zoneLayout: zones(['stats']), widgetGrid: { version: 1, cell: 44, widgets: [entry] } },
			{ inline: 1300 },
		)
		assert.deepEqual(ids(withZone.right), ['stats', 'notes'])
		assert.equal(withZone.right.instances[1]!.pinned, true, "a listed instance takes its zone's pin")
		const without = resolveDrawn({ widgetGrid: { version: 1, cell: 44, widgets: [entry] } }, { inline: 1300 })
		assert.deepEqual(ids(without.right), [])
	})

	test('an instance is drawn once, where the old readers drew it first: middle, left, right, strips', () => {
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
		assert.deepEqual(ids(d.middle), ['banner', 'messages'])
		assert.deepEqual(
			d.middle.above.map((p) => [p.tabs.map((t) => t.instanceId), p.height]),
			[[['banner'], 'fit']],
		)
		assert.deepEqual(ids(d.left), ['stats'])
		assert.deepEqual(ids(d.right), [])
		assert.deepEqual(drawnWidgetIds(layout), ['banner', 'messages', 'stats'])
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

	test('an arranged item, a grid entry and a zone read it alike — as their panel', () => {
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
		// The middle never pins out: a grid entry's `pinned: false` there means nothing.
		assert.deepEqual(
			d.middle.instances.map((i) => [i.instanceId, i.pinned]),
			[
				['messages', true],
				['strip', true],
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
			assert.ok(z.panels.every((p) => p.pinned), `the ${z.zone}'s panels are docked`)
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
			assert.equal(d.middle.primary.floor, true)
		}
	})
})
