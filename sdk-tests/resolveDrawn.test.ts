/**
 * `resolveDrawn` — the ONE reader of what a session layout draws, and where
 * (PLAN-widget-system-consolidation C5, F3; PLAN-session-panels §1.2). It
 * reads `panelsOf`: the layout's panels as version 2 (version 1 converted by
 * `panelsV2Of`), else the ⏳ old slots through `panelsFromSlots` and the same
 * conversion. Panels v2 has no pin and no width ladder: every `pinned` is
 * `true`, and every "is it drawn" reader (`drawnWidgetIds`, `primaryPlaced`)
 * is its answer as ids. The converter itself is `panelsV2Of.test.ts`'s.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
	DEFAULT_PANEL_LOOK,
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
	type PanelLayoutV2,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { STORY_WORLD_LAYOUT, STORY_LAYOUT, LAIR_LAYOUT } from '../core-catalog/src/registry/layouts.js'
import {
	V1_DUNGEON_CRAWLER_LAYOUT,
	V1_LAIR_LAYOUT,
	V1_LAIR_PARTY_LAYOUT,
	V1_STORY_LAYOUT,
	V1_STORY_WORLD_LAYOUT,
} from './fixtures/core-layouts-old-slots.js'

const grow = { w: 'grow', h: 'grow' } as const
const all = { top: true, bottom: true, left: true, right: true }
const WIDTHS = [0, 500, 800, 1300, 2000, 2600]

/** The ids one zone draws (its panels' tabs, the floor's left out). */
const ids = (z: { instances: { instanceId: string }[] }) => z.instances.map((i) => i.instanceId)

/**
 * Total, draws the conversation in the middle and a composer somewhere, drops retired ids,
 * pins everything, never an empty panel, each instance once — whether the layout is version 1 or 2.
 */
function assertSound(name: string, layout: SessionLayoutV1, primary: string) {
	for (const inline of WIDTHS) {
		const drawn: DrawnLayout = resolveDrawn(layout, { inline, block: 900 })
		const every = drawnInstances(drawn)
		assert.ok(
			drawn.middle.instances.some((i) => isInstanceOf(i.instanceId, primary)),
			`${name} @${inline}: the conversation (${primary}) is drawn in the middle`,
		)
		assert.ok(
			every.some((i) => isInstanceOf(i.instanceId, 'composer')),
			`${name} @${inline}: a composer is drawn`,
		)
		for (const i of every) {
			assert.equal(i.pinned, true, `${name} @${inline}: '${i.instanceId}' is pinned`)
			assert.ok(!RETIRED_WIDGET_IDS.has(widgetOfInstance(i.instanceId)), `${name}: '${i.instanceId}' is not retired`)
			assert.equal(i.widgetId, widgetOfInstance(i.instanceId))
		}
		for (const z of [drawn.left, drawn.middle, drawn.right]) {
			assert.equal(z.pinned, true, `${name} @${inline}: the ${z.zone} is pinned`)
			assert.ok(
				z.panels.every((p) => p.tabs.length > 0 && p.pinned === true && p.floor === undefined),
				`${name} @${inline}: no empty panel, no floor panel — the layout placed it all`,
			)
		}
		const list = every.map((i) => i.instanceId)
		assert.equal(new Set(list).size, list.length, `${name} @${inline}: each instance is drawn once`)
		assert.deepEqual(drawnWidgetIds(layout), list, `${name}: drawnWidgetIds is resolveDrawn's answer`)
	}
	assert.equal(primaryPlaced(layout, primary), true)
}

describe('every shipped genre layout', () => {
	test('core: Story, Story with a world, and Lair — as the catalogue ships them now', () => {
		assertSound('STORY_LAYOUT', STORY_LAYOUT, 'messages')
		assertSound('STORY_WORLD_LAYOUT', STORY_WORLD_LAYOUT, 'messages')
		assertSound('LAIR_LAYOUT', LAIR_LAYOUT, 'messages')
	})

	test('core: the frozen version 1 literals draw soundly too', () => {
		assertSound('V1_STORY_LAYOUT', V1_STORY_LAYOUT, 'messages')
		assertSound('V1_STORY_WORLD_LAYOUT', V1_STORY_WORLD_LAYOUT, 'messages')
		assertSound('V1_LAIR_LAYOUT', V1_LAIR_LAYOUT, 'messages')
		assertSound('V1_LAIR_PARTY_LAYOUT', V1_LAIR_PARTY_LAYOUT, 'messages')
		assertSound('V1_DUNGEON_CRAWLER_LAYOUT', V1_DUNGEON_CRAWLER_LAYOUT, 'messages')
	})

	test('what each frozen version 1 literal draws, where', () => {
		const story = resolveDrawn(V1_STORY_LAYOUT, { inline: 1300 })
		assert.deepEqual(ids(story.middle), ['messages', 'turn-line', 'composer'])
		assert.deepEqual(
			story.middle.panels.map((p) => [p.key, p.height]),
			[
				['p1', 'fill'],
				['p3', 'fit'],
				['p4', 'fit'],
			],
		)
		assert.ok(story.middle.panels.every((p) => p.floor === undefined), 'the layout placed it')
		assert.deepEqual(story.right.panels, [
			{
				key: 'p2',
				tabs: [{ instanceId: 'authors-note', widgetId: 'authors-note', pinned: true }],
				open: 'authors-note',
				pinned: true,
				height: 'fill',
				priority: 'normal',
			},
		])
		assert.deepEqual(ids(story.left), [])

		const world = resolveDrawn(V1_STORY_WORLD_LAYOUT, { inline: 1300 })
		// The world strip is a copy of Stats placed by name (W7), not the alias:
		// a panel above the conversation, sized to fit.
		assert.deepEqual(ids(world.middle), ['stats#world', 'messages', 'turn-line', 'composer'])
		assert.deepEqual(
			world.middle.panels.map((p) => [p.tabs.map((t) => t.instanceId), p.height]),
			[
				[['stats#world'], 'fit'],
				[['messages'], 'fill'],
				[['turn-line'], 'fit'],
				[['composer'], 'fit'],
			],
		)
		assert.equal(world.middle.panels[0]!.tabs[0]!.widgetId, 'stats')
		assert.deepEqual(ids(world.right), ['scene-portraits', 'stats'])
		assert.equal(world.right.panels.length, 2, 'two panels, one tab each')
		assert.ok(world.right.panels.every((p) => p.height === 'fill'))
		assert.deepEqual(ids(world.left), ['chronicle', 'lore-entries'])
		assert.ok(world.left.panels.every((p) => p.pinned), 'the stored `pinned: false` is not read')

		const lair = resolveDrawn(V1_LAIR_LAYOUT, { inline: 1300 })
		assert.deepEqual(ids(lair.middle), ['messages', 'turn-line', 'composer'])
		assert.deepEqual(ids(lair.left), ['stats'])
		// 🚧 lair fix 2: the Sanctum is a tab of the story, not a panel here.
		assert.deepEqual(ids(lair.right), ['places', 'annex#castellan'])
		assert.deepEqual(
			lair.right.instances.map((i) => i.widgetId),
			['places', 'annex'],
		)
		assert.deepEqual(
			lair.right.panels.map((p) => p.height),
			[{ share: 3 }, { share: 2 }],
		)

		const party = resolveDrawn(V1_LAIR_PARTY_LAYOUT, { inline: 1300 })
		assert.deepEqual(ids(party.right), ['places', 'turn-order', 'attendance'])
		assert.deepEqual(
			party.right.panels.map((p) => [p.tabs.map((t) => t.instanceId), p.title ?? null]),
			[
				[['places'], null],
				[['turn-order', 'attendance'], 'Party'],
			],
		)

		const crawler = resolveDrawn(V1_DUNGEON_CRAWLER_LAYOUT, { inline: 1300 })
		// The pair is named by the panel's FIRST composing Messages tab.
		assert.deepEqual(ids(crawler.middle), [
			'messages#parley',
			'messages',
			'annex#planning-notes',
			'turn-line#parley',
			'composer#parley',
		])
		assert.deepEqual(ids(crawler.right), ['stats', 'annex#journal', 'messages#journal', 'messages#table'])
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

describe('panels v2: the whole truth when present', () => {
	const panels = (p: Partial<PanelLayoutV2>): SessionLayoutV1 => ({
		panels: { version: 2, left: [], middle: [{ key: 'p1', tabs: ['messages'] }], right: [], ...p },
	})

	test('tabs, the shown tab, a height and a priority per panel', () => {
		const d = resolveDrawn(
			panels({
				right: [
					{ key: 'p2', tabs: ['notes', 'stats'], open: 'stats', height: { share: 4 }, priority: 'high' },
					{ key: 'p3', tabs: ['map'], height: 'fit', priority: 'low', title: 'Where' },
					{ key: 'p4', tabs: ['tasks'] },
				],
			}),
			{ inline: 1300 },
		)
		assert.deepEqual(
			d.right.panels.map((p) => [p.key, p.tabs.map((t) => t.instanceId), p.open, p.height, p.priority, p.title ?? null]),
			[
				['p2', ['notes', 'stats'], 'stats', { share: 4 }, 'high', null],
				['p3', ['map'], 'map', 'fit', 'low', 'Where'],
				['p4', ['tasks'], 'tasks', 'fill', 'normal', null],
			],
		)
		assert.deepEqual(ids(d.right), ['notes', 'stats', 'map', 'tasks'])
		assert.ok(d.right.instances.every((i) => i.pinned === true))
		assert.ok(d.right.panels.every((p) => p.pinned === true))
		assert.deepEqual(d.middle.panels.map((p) => p.key), ['p1'], 'the middle is a plain stack')
	})

	test('the middle is a plain stack of panels, top to bottom', () => {
		const d = resolveDrawn(
			panels({
				middle: [
					{ key: 'p2', tabs: ['scene'], height: 'fit' },
					{ key: 'p1', tabs: ['messages'] },
					{ key: 'p3', tabs: ['turn-line'], height: 'fit' },
					{ key: 'p4', tabs: ['composer'], height: 'fit' },
				],
			}),
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.middle), ['scene', 'messages', 'turn-line', 'composer'])
		assert.deepEqual(d.middle.panels.map((p) => p.height), ['fit', 'fill', 'fit', 'fit'])
		assert.equal(d.middle.kind, 'middle')
		assert.equal(d.left.side, 'left')
		assert.equal(d.right.side, 'right')
	})

	test('a panels v2 draws as stored — panelsOf is the same object', () => {
		const layout = panels({ left: [{ key: 'p2', tabs: ['stats'] }] })
		assert.equal(panelsOf(layout), layout.panels)
		assert.deepEqual(drawnWidgetIds(layout), ['messages', 'stats'])
	})

	test('v2 stray keys are ignored: `pinned` on a panel, `above` and `primary` on the slot', () => {
		const d = resolveDrawn(
			{
				panels: {
					version: 2,
					left: [{ key: 'p2', tabs: ['notes'], pinned: false }],
					middle: [{ key: 'p1', tabs: ['messages'] }],
					right: [],
					above: [{ key: 'p8', tabs: ['banner'] }],
					primary: { key: 'p9', tabs: ['elsewhere'] },
				} as never,
			},
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.left), ['notes'])
		assert.equal(d.left.panels[0]!.pinned, true, 'a stored pin is not read')
		assert.deepEqual(ids(d.middle), ['messages'])
		assert.deepEqual(drawnInstances(d).map((i) => i.instanceId), ['messages', 'notes'])
	})

	test("a bad `open`, a junk height or priority and an empty panel read as the defaults; a dropped tab's panel is not drawn", () => {
		const d = resolveDrawn(
			panels({
				left: [
					{ key: 'p2', tabs: ['notes'], open: 'gone', height: { share: 13 }, priority: 'urgent' as never },
					{ key: 'p3', tabs: ['inventory'] },
					{ key: 'p4', tabs: [] },
					{ key: 'p5', tabs: ['map'], height: { share: 0 }, priority: 3 as never },
					{ key: 'p6', tabs: ['tasks'], height: { share: 2.5 } },
					{ key: 'p7', tabs: ['plan'], height: 'tall' as never },
				],
			}),
			{ inline: 1300 },
		)
		assert.deepEqual(
			d.left.panels.map((p) => [p.key, p.open, p.height, p.priority]),
			[
				['p2', 'notes', 'fill', 'normal'],
				['p5', 'map', 'fill', 'normal'],
				['p6', 'tasks', 'fill', 'normal'],
				['p7', 'plan', 'fill', 'normal'],
			],
		)
	})

	test("the declarations default a panel's height and priority, by its open tab's widget; what is stored wins", () => {
		const widgets = [
			{ id: 'notes', panel: { height: 'fit', priority: 'high' } },
			{ id: 'stats', panel: { priority: 'low' } },
			{ id: 'map', panel: { height: 'bogus', priority: 'bogus' } },
		] as never
		const d = resolveDrawn(
			panels({
				right: [
					{ key: 'p2', tabs: ['notes#2', 'stats'], open: 'notes#2' },
					{ key: 'p3', tabs: ['notes#a', 'stats#a'], open: 'stats#a' },
					{ key: 'p4', tabs: ['notes#b'], height: { share: 3 }, priority: 'normal' },
					{ key: 'p5', tabs: ['map'] },
					{ key: 'p6', tabs: ['tasks'] },
				],
			}),
			{ inline: 1300 },
			{ widgets },
		)
		assert.deepEqual(
			d.right.panels.map((p) => [p.key, p.height, p.priority]),
			[
				['p2', 'fit', 'high'],
				['p3', 'fill', 'low'],
				['p4', { share: 3 }, 'normal'],
				['p5', 'fill', 'normal'],
				['p6', 'fill', 'normal'],
			],
		)
		// Without the declarations: the plain defaults.
		const bare = resolveDrawn(panels({ right: [{ key: 'p2', tabs: ['notes'] }] }), { inline: 1300 })
		assert.deepEqual([bare.right.panels[0]!.height, bare.right.panels[0]!.priority], ['fill', 'normal'])
		// A declaration reaches an aliased tab through the widget it became.
		const aliased = resolveDrawn(
			panels({ right: [{ key: 'p2', tabs: ['world-state'] }] }),
			{ inline: 1300 },
			{ widgets: [{ id: 'stats', panel: { height: 'fit' } }] as never },
		)
		assert.equal(aliased.right.panels[0]!.height, 'fit')
	})

	test('the look: the default, a stored one, clamped, and junk', () => {
		const look = (p: object, opts: Partial<PanelLayoutV2> = {}) => resolveDrawn(panels({ ...opts, ...p } as never), { inline: 1300 }).look
		assert.deepEqual(look({}), { ...DEFAULT_PANEL_LOOK, gapPx: 12 })
		assert.deepEqual(look({ backing: 'glass', opacity: 40, gap: 'tight' }), { backing: 'glass', opacity: 40, gap: 'tight', behind: 'background', behindDim: 0, gapPx: 4 })
		assert.deepEqual(look({ backing: 'none', opacity: 0, gap: 'spacious' }), { backing: 'none', opacity: 0, gap: 'spacious', behind: 'background', behindDim: 0, gapPx: 24 })
		assert.equal(look({ opacity: 150 }).opacity, 100, 'clamped to 100')
		assert.equal(look({ opacity: -5 }).opacity, 0, 'clamped to 0')
		assert.equal(look({ opacity: 55.5 }).opacity, 55.5)
		for (const junk of ['x', null, NaN, Infinity, {}, []])
			assert.equal(look({ opacity: junk }).opacity, 100, `opacity ${String(junk)} reads as 100`)
		assert.equal(look({ backing: 'frosted' }).backing, 'card')
		assert.equal(look({ backing: 4 }).backing, 'card')
		assert.deepEqual(look({ gap: 'huge' }), { ...DEFAULT_PANEL_LOOK, gapPx: 12 })
		// 🚧 behind / behindDim: the default, a stored one, junk, clamped.
		assert.equal(look({}).behind, 'background')
		assert.equal(look({}).behindDim, 0)
		assert.deepEqual([look({ behind: 'backdrop', behindDim: 40 }).behind, look({ behind: 'backdrop', behindDim: 40 }).behindDim], ['backdrop', 40])
		assert.equal(look({ behind: 'wall' }).behind, 'background')
		assert.equal(look({ behind: 4 }).behind, 'background')
		assert.equal(look({ behindDim: 140 }).behindDim, 100, 'clamped to 100')
		assert.equal(look({ behindDim: -3 }).behindDim, 0, 'clamped to 0')
		for (const junk of ['5', Number.NaN, null]) assert.equal(look({ behindDim: junk }).behindDim, 0, `behindDim ${String(junk)} reads as 0`)
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

	test('neither panels nor slots: the floor — messages and its pair — which the id readers do not count', () => {
		const d = resolveDrawn({}, { inline: 500 })
		assert.deepEqual(
			d.middle.panels.map((p) => [p.tabs.map((t) => t.instanceId), p.height, p.floor]),
			[
				[['messages'], 'fill', true],
				[['turn-line'], 'fit', true],
				[['composer'], 'fit', true],
			],
		)
		assert.deepEqual(d.middle.instances, [], 'the floor is no instance the layout placed')
		for (const z of [d.left, d.right]) assert.deepEqual(z.panels, [])
		assert.deepEqual(drawnInstances(d), [])
		assert.deepEqual(drawnWidgetIds({}), [])
		assert.equal(primaryPlaced({}, 'messages'), false)
		assert.deepEqual(d.look, { ...DEFAULT_PANEL_LOOK, gapPx: 12 })
	})
})

describe('panels v1: drawn through the conversion', () => {
	const v1: SessionLayoutV1 = {
		panels: {
			version: 1,
			left: [{ key: 'p4', tabs: ['stats'], pinned: false }],
			middle: {
				above: [{ key: 'p1', tabs: ['scene'], height: 'fit', pinned: false }],
				primary: { key: 'p3', tabs: ['messages'] },
				below: [{ key: 'p2', tabs: ['notes'] }],
			},
			right: [{ key: 'p5', tabs: ['map'], pinned: false, height: { share: 4 } }],
		},
	}

	test('the middle is flattened, the turn line and composer follow the conversation, every pin is true', () => {
		const d = resolveDrawn(v1, { inline: 1300 })
		assert.deepEqual(ids(d.middle), ['scene', 'messages', 'turn-line', 'composer', 'notes'])
		assert.deepEqual(
			d.middle.panels.map((p) => p.height),
			['fit', 'fill', 'fit', 'fit', 'fill'],
		)
		assert.deepEqual(ids(d.left), ['stats'])
		assert.deepEqual(ids(d.right), ['map'])
		assert.deepEqual(d.right.panels[0]!.height, { share: 4 })
		for (const z of [d.left, d.middle, d.right]) {
			assert.equal(z.pinned, true)
			assert.ok(z.panels.every((p) => p.pinned === true && p.priority === 'normal' && p.floor === undefined))
			assert.ok(z.instances.every((i) => i.pinned === true))
			assert.equal('rung' in z, false, `the ${z.zone} has no rung`)
			assert.equal('zoneKey' in z, false, `the ${z.zone} has no zoneKey`)
		}
		assert.deepEqual(d.look, { ...DEFAULT_PANEL_LOOK, gapPx: 12 }, 'version 1 has the default look')
		assert.deepEqual(drawnWidgetIds(v1), ['scene', 'messages', 'turn-line', 'composer', 'notes', 'stats', 'map'])
	})

	test('a v1 look-like key is not a look; the box is not read', () => {
		const withKeys = { panels: { ...(v1.panels as PanelLayoutV1), gap: 'tight', opacity: 10, backing: 'glass' } } as SessionLayoutV1
		assert.deepEqual(resolveDrawn(withKeys, { inline: 1300 }).look, { ...DEFAULT_PANEL_LOOK, gapPx: 12 })
		const first = resolveDrawn(v1, { inline: 300 })
		for (const inline of WIDTHS) assert.deepEqual(resolveDrawn(v1, { inline, block: 40 }), first, `@${inline}`)
	})

	test('a conversation the layout hides the composer of draws no pair', () => {
		const reading: SessionLayoutV1 = { ...v1, widgetSettings: { messages: { showComposer: false } } }
		assert.deepEqual(ids(resolveDrawn(reading, { inline: 1300 }).middle), ['scene', 'messages', 'notes'])
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

	test('a list only: each item a panel — the layout names no conversation, so the middle is the floor', () => {
		const d = resolveDrawn({ zoneLayout: zones(['notes', 'stats'], false) }, { inline: 1300 })
		assert.deepEqual(ids(d.right), ['notes', 'stats'])
		assert.equal(d.right.panels.length, 2)
		assert.ok(d.right.panels.every((p) => p.pinned === true), 'the zone pin is not read')
		assert.equal(d.right.pinned, true)
		assert.deepEqual(d.middle.panels.map((p) => [p.tabs[0]!.instanceId, p.floor]), [
			['messages', true],
			['turn-line', true],
			['composer', true],
		])
		assert.deepEqual(drawnWidgetIds({ zoneLayout: zones(['notes', 'stats']) }), ['notes', 'stats'])
	})

	test('an arrangement only: in reading order, each panel drawn', () => {
		const d = resolveDrawn({ arrangedGrid: { right: frame({ id: 'b', y: 4, pinned: false }, { id: 'a', y: 0 }) } }, { inline: 1300 })
		assert.deepEqual(ids(d.right), ['a', 'b'])
		assert.deepEqual(
			d.right.panels.map((p) => p.pinned),
			[true, true],
		)
		assert.equal('zoneKey' in d.right, false)
		assert.equal('rung' in d.right, false)
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
		// The conversion puts the turn line and composer after the conversation's panel.
		const fromGrid = resolveDrawn({ widgetGrid: grid }, { inline: 1300 })
		assert.deepEqual(ids(fromGrid.middle), ['map', 'messages', 'turn-line', 'composer'])
		assert.deepEqual(fromGrid.middle.panels.map((p) => p.tabs[0]!.instanceId), ['map', 'messages', 'turn-line', 'composer'])
		const arranged = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: frame({ id: 'messages', y: 0 }) } }, { inline: 1300 })
		assert.deepEqual(ids(arranged.middle), ['messages', 'turn-line', 'composer'])
		const emptied = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, { inline: 1300 })
		assert.deepEqual(ids(emptied.middle), [])
		assert.deepEqual(
			emptied.middle.panels.map((p) => [p.tabs[0]!.instanceId, p.floor]),
			[
				['messages', true],
				['turn-line', true],
				['composer', true],
			],
		)
		assert.equal(primaryPlaced({ widgetGrid: grid, arrangedGrid: { middle: { cols: 1, rows: 1, items: [] } } }, 'messages'), false)
		// A frame the page cannot draw (no cell grid) is not an arrangement.
		const junk = resolveDrawn({ widgetGrid: grid, arrangedGrid: { middle: { items: [] } as never } }, { inline: 1300 })
		assert.deepEqual(ids(junk.middle), ['map', 'messages', 'turn-line', 'composer'])
	})

	test('a grid entry naming a side is folded into its first zone — and drawn nowhere without one', () => {
		const entry = { id: 'notes', zone: 'right' as const, order: 0, size: grow, anchor: {}, pinned: false }
		const withZone = resolveDrawn(
			{ zoneLayout: zones(['stats']), widgetGrid: { version: 1, cell: 44, widgets: [entry] } },
			{ inline: 1300 },
		)
		assert.deepEqual(ids(withZone.right), ['stats', 'notes'])
		assert.ok(withZone.right.instances.every((i) => i.pinned === true))
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
		// The strip is a panel above the conversation; its pair follows the conversation.
		assert.deepEqual(ids(d.middle), ['banner', 'messages', 'turn-line', 'composer'])
		assert.deepEqual(
			d.middle.panels.map((p) => [p.tabs.map((t) => t.instanceId), p.height]),
			[
				[['banner'], 'fit'],
				[['messages'], 'fill'],
				[['turn-line'], 'fit'],
				[['composer'], 'fit'],
			],
		)
		assert.deepEqual(ids(d.left), ['stats'])
		assert.deepEqual(ids(d.right), [])
		assert.deepEqual(drawnWidgetIds(layout), ['banner', 'messages', 'turn-line', 'composer', 'stats'])
	})

	test('a side zone is read by its side, never its key', () => {
		const d = resolveDrawn(
			{ zoneLayout: { version: 1, zones: { l: { kind: 'side', side: 'left', widgets: ['tasks'] }, x: { widgets: ['notes'] } as never } } },
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.left), ['tasks'])
		assert.equal('zoneKey' in d.left, false, 'no zone key is reported any more')
		assert.deepEqual(ids(d.right), ['notes'], 'a zone that states nothing is a right side')
	})
})

describe('retired widgets', () => {
	test('inventory is dropped from every slot — a copy of one included', () => {
		const d = resolveDrawn(
			{
				zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['inventory', 'notes', 'inventory#2'] } } },
				arrangedGrid: {
					middle: {
						cols: 4,
						rows: 8,
						items: [
							{ id: 'messages', x: 0, y: 0, w: 4, h: 6 },
							{ id: 'inventory#3', x: 0, y: 6, w: 4, h: 2 },
						],
					},
				},
			},
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.middle), ['messages', 'turn-line', 'composer'])
		assert.deepEqual(ids(d.right), ['notes'])
		assert.deepEqual([...RETIRED_WIDGET_IDS], ['inventory'])
	})

	test('inventory is dropped from panels too', () => {
		const d = resolveDrawn(
			{
				panels: {
					version: 2,
					left: [{ key: 'p2', tabs: ['inventory', 'inventory#2'] }],
					middle: [{ key: 'p1', tabs: ['messages', 'inventory#3'] }],
					right: [{ key: 'p3', tabs: ['inventory', 'notes'] }],
				},
			},
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.left), [])
		assert.deepEqual(ids(d.middle), ['messages'])
		assert.deepEqual(ids(d.right), ['notes'])
	})

	test('a slot-era composer is not drawn from the old slots — only the one the conversion makes', () => {
		const d = resolveDrawn(
			{
				zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['composer#aside', 'notes'] } } },
				arrangedGrid: {
					middle: {
						cols: 4,
						rows: 8,
						items: [
							{ id: 'messages', x: 0, y: 0, w: 4, h: 6 },
							{ id: 'composer#old', x: 0, y: 6, w: 4, h: 2 },
						],
					},
				},
			},
			{ inline: 1300 },
		)
		assert.deepEqual(ids(d.right), ['notes'], 'the right list lost its composer')
		assert.deepEqual(ids(d.middle), ['messages', 'turn-line', 'composer'], "the arrangement's composer#old is gone; the conversion's composer stays")
		assert.ok(!drawnWidgetIds({ zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['composer#aside'] } } } }).includes('composer#aside'))
	})

	test('a composer placed in panels v2 IS drawn, where it is put', () => {
		const layout: SessionLayoutV1 = {
			panels: {
				version: 2,
				left: [],
				middle: [{ key: 'p1', tabs: ['messages'] }],
				right: [{ key: 'p2', tabs: ['composer#aside', 'notes'], open: 'composer#aside' }],
			},
		}
		const d = resolveDrawn(layout, { inline: 1300 })
		assert.deepEqual(ids(d.right), ['composer#aside', 'notes'])
		assert.deepEqual(ids(d.middle), ['messages'])
		assert.equal(d.right.panels[0]!.open, 'composer#aside')
		assert.equal(d.right.instances[0]!.widgetId, 'composer')
		assert.deepEqual(drawnWidgetIds(layout), ['messages', 'composer#aside', 'notes'])
	})

	test('a composer placed in panels v1 is slot-era: dropped, and the conversion adds the pair', () => {
		const layout: SessionLayoutV1 = {
			panels: {
				version: 1,
				left: [],
				middle: { above: [], primary: { key: 'p1', tabs: ['messages'] }, below: [{ key: 'p2', tabs: ['composer'] }] },
				right: [],
			},
		}
		assert.deepEqual(ids(resolveDrawn(layout, { inline: 1300 }).middle), ['messages', 'turn-line', 'composer'])
	})
})

describe('no pin', () => {
	test('a stored pin — on a panel, a zone, a grid entry or an arranged item — is not read: every pinned is true', () => {
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
				['turn-line', true],
				['composer', true],
				['strip', true],
			],
		)
		assert.equal(d.left.pinned, true)
		assert.equal(d.left.instances[0]!.pinned, true)
		assert.equal(d.right.pinned, true)
		assert.equal(d.right.instances[0]!.pinned, true)
		assert.equal(d.right.panels[0]!.pinned, true)
	})
})

describe('⏳ pinnedOf — the one pin rule, deprecated but still exported', () => {
	test('absent means pinned; only `false` unpins', () => {
		assert.equal(pinnedOf({}), true)
		assert.equal(pinnedOf({ pinned: true }), true)
		assert.equal(pinnedOf({ pinned: false }), false)
		assert.equal(pinnedOf({ pinned: 'no' }), true)
		assert.equal(pinnedOf(undefined), true)
		assert.equal(pinnedOf(null), true)
	})
})

describe('⏳ zoneRungAt — the one ladder walk, deprecated but still exported', () => {
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
})

describe('total', () => {
	test('any value reads, and what cannot be read places nothing', () => {
		for (const junk of [
			undefined,
			null,
			7,
			'x',
			[],
			{ panels: 7 },
			{ panels: { version: 2, middle: 'x' } },
			{ panels: { version: 2, left: 3, middle: [null, 4, { tabs: 'x' }, { key: 'p1', tabs: [1, null] }], right: {} } },
			{ panels: { version: 1, middle: 'x' } },
			{ panels: { version: 9 } },
			{ zoneLayout: 3, widgetGrid: { widgets: 'no' }, arrangedGrid: [] },
		]) {
			for (const box of [{ inline: NaN }, { inline: 1300 }, undefined as never]) {
				const d = resolveDrawn(junk as never, box)
				assert.deepEqual(drawnInstances(d), [], JSON.stringify(junk))
				assert.ok(d.middle.panels.every((p) => p.floor === true), 'only the floor is drawn')
				assert.deepEqual(d.left.panels, [])
				assert.deepEqual(d.right.panels, [])
				assert.equal(d.look.gapPx, 12)
			}
			assert.deepEqual(drawnWidgetIds(junk as never), [])
		}
	})
})
