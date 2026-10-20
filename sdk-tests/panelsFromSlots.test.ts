/**
 * `panelsFromSlots` — the ⏳ old slots (`zoneLayout`, `widgetGrid`,
 * `arrangedGrid`) read as panels (PLAN-session-panels §2): the ONE normaliser
 * the SDK owns, so the compiler, plugin manifests in the wild, these goldens
 * and the app's boot pass all get one answer. Core's three layouts are read
 * from their OLD old-slot literals (`fixtures/core-layouts-old-slots.ts`, what a
 * stored 0.6 layout carries) and must convert to the `panels` literals the
 * catalogue now ships.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	panelsFromSlots,
	panelsOf,
	validateSessionLayout,
	type PanelLayoutV1,
	type PanelV1,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'
import { STORY_WORLD_LAYOUT, STORY_LAYOUT, LAIR_LAYOUT } from '../core-catalog/src/registry/layouts.js'
import { lairGenre } from '../core-catalog/src/registry/genres.js'
import { OLD_ADVENTURE_LAYOUT, OLD_CHAT_LAYOUT, OLD_LAIR_LAYOUT } from './fixtures/core-layouts-old-slots.js'

const grow = { w: 'grow', h: 'grow' } as const
const all = { top: true, bottom: true, left: true, right: true }

/** A zone's panels as `[tabs, pinned?, height?]`, keys left out. */
const shape = (list: readonly PanelV1[]) =>
	list.map((p) => [
		p.tabs,
		...(p.pinned === false ? ['rail'] : []),
		...(p.height ? [p.height] : []),
	])

/** A converted layout is a valid one: no errors, nothing undrawn, nothing unknown. */
function assertValid(layout: SessionLayoutV1) {
	const panels = panelsFromSlots(layout)
	const v = validateSessionLayout(
		{ panels, widgetSettings: layout.widgetSettings ?? {} },
		{ widgets: CORE_WIDGETS, unknownWidgets: 'warn' },
	)
	assert.deepEqual(v, { ok: true, errors: [], warnings: [] })
}

describe("core's three layouts, from their old-slot literals", () => {
	test('each converts to the panels literal the catalogue ships, key for key', () => {
		for (const [old, now] of [
			[OLD_CHAT_LAYOUT, STORY_LAYOUT],
			[OLD_ADVENTURE_LAYOUT, STORY_WORLD_LAYOUT],
			[OLD_LAIR_LAYOUT, LAIR_LAYOUT],
		] as const) {
			// The converter discards geometry, so a shipped literal may add `height` by hand
			// (the Lair's 4/2/6 right column); everything else must match key for key.
			const stripHeights = (zone: PanelV1[]) => zone.map(({ height: _h, ...p }) => p)
			const shipped = {
				...now.panels!,
				left: stripHeights(now.panels!.left),
				right: stripHeights(now.panels!.right),
			}
			assert.deepEqual(panelsFromSlots(old), shipped)
			assert.deepEqual(now.widgetSettings, old.widgetSettings, 'the settings travel unchanged')
			for (const slot of ['zoneLayout', 'widgetGrid', 'arrangedGrid'])
				assert.equal(slot in now, false, `the catalogue literal carries no ${slot}`)
		}
	})

	test("Chat: the conversation, and the Author's note in the right rail", () => {
		const p = panelsFromSlots(OLD_CHAT_LAYOUT)
		assert.deepEqual(p, {
			version: 1,
			left: [],
			middle: { above: [], primary: { key: 'p1', tabs: ['messages'] }, below: [] },
			right: [{ key: 'p2', tabs: ['authors-note'], pinned: false }],
		} satisfies PanelLayoutV1)
		assertValid(OLD_CHAT_LAYOUT)
	})

	test('Adventure: World State a strip above, Scene Portraits and Stats docked right, Chronicle and Lore in the left rail', () => {
		const p = panelsFromSlots(OLD_ADVENTURE_LAYOUT)
		assert.deepEqual(shape(p.middle.above), [[['stats#world'], 'fit']])
		assert.deepEqual(p.middle.primary, { key: 'p1', tabs: ['messages'] })
		assert.deepEqual(p.middle.below, [])
		assert.deepEqual(shape(p.right), [[['scene-portraits']], [['stats']]])
		assert.deepEqual(shape(p.left), [
			[['chronicle'], 'rail'],
			[['lore-entries'], 'rail'],
		])
		// Keys in discovery order: the primary, above, below, left, right.
		assert.deepEqual(
			[p.middle.primary, ...p.middle.above, ...p.left, ...p.right].map((x) => x.key),
			['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
		)
		assertValid(OLD_ADVENTURE_LAYOUT)
	})

	test('Lair: Stats docked left; Places, the scratchpad and the Sanctum docked right — the Sanctum its own panel', () => {
		const p = panelsFromSlots(OLD_LAIR_LAYOUT)
		assert.deepEqual(p.middle.primary, { key: 'p1', tabs: ['messages'] })
		assert.deepEqual(shape(p.left), [[['stats']]])
		assert.deepEqual(shape(p.right), [
			[['places']],
			[['annex#castellan']],
			[['messages#sanctum']],
		])
		assertValid(OLD_LAIR_LAYOUT)
	})

	test("the Lair's Sanctum stays where lairSanctumPanel puts it: the right column, its settings under its own id", () => {
		const preset = lairGenre.layouts![0]!.preset
		const p = panelsOf(preset)
		const holder = p.right.find((x) => x.tabs.includes('messages#sanctum'))
		assert.ok(holder, 'a right-column panel holds the Sanctum')
		assert.equal(holder!.pinned, undefined, 'docked')
		assert.equal(holder, p.right.at(-1), 'at the bottom of the column')
		assert.ok(
			!p.middle.primary.tabs.includes('messages#sanctum'),
			'the story alone in the middle',
		)
		assert.deepEqual(preset.widgetSettings?.['messages#sanctum'], {
			channel: 'sanctum',
			composer: 'minimal',
		})
	})
})

describe('the side rules', () => {
	test('a scattered group is one panel, its tabs in cell order; panels by their top-left, top-anchored first, bottom-anchored last', () => {
		const layout: SessionLayoutV1 = {
			arrangedGrid: {
				right: {
					cols: 2,
					rows: 12,
					items: [
						{ id: 'end', x: 0, y: 0, w: 2, h: 1, anchor: { bottom: true } },
						{ id: 'b', x: 0, y: 3, w: 2, h: 2 },
						{ id: 'c', x: 1, y: 7, w: 1, h: 2, group: 'g' },
						{ id: 'a', x: 0, y: 1, w: 1, h: 2, group: 'g' },
						{ id: 'd', x: 0, y: 7, w: 1, h: 2 },
						{ id: 'head', x: 0, y: 10, w: 2, h: 2, anchor: { top: true } },
					],
				},
			},
		}
		assert.deepEqual(shape(panelsFromSlots(layout).right), [
			[['head']],
			[['a', 'c']],
			[['b']],
			[['d']],
			[['end']],
		])
	})

	test('a group is docked unless every member was unpinned', () => {
		const items = (pins: Array<boolean | undefined>) =>
			pins.map((pinned, n) => ({
				id: `w${n}`,
				x: 0,
				y: n,
				w: 1,
				h: 1,
				group: 'g',
				...(pinned === undefined ? {} : { pinned }),
			}))
		const right = (pins: Array<boolean | undefined>) =>
			panelsFromSlots({ arrangedGrid: { right: { cols: 1, rows: 4, items: items(pins) } } })
				.right
		assert.equal(right([false, undefined])[0]!.pinned, undefined)
		assert.equal(right([false, false])[0]!.pinned, false)
	})

	test('a zone with pinned: false and no arrangement puts every panel in the rail; an arrangement keeps its own pins', () => {
		const zoneLayout: SessionLayoutV1['zoneLayout'] = {
			version: 1,
			zones: {
				left: {
					kind: 'side',
					side: 'left',
					pinned: false,
					widgets: ['chronicle', 'lore-entries', 'world-state'],
				},
			},
		}
		const listed = panelsFromSlots({ zoneLayout })
		assert.deepEqual(shape(listed.left), [
			[['chronicle'], 'rail'],
			[['lore-entries'], 'rail'],
			// An alias stays the id as placed: its settings live under it.
			[['world-state'], 'rail'],
		])
		const arranged = panelsFromSlots({
			zoneLayout,
			arrangedGrid: {
				left: { cols: 1, rows: 2, items: [{ id: 'chronicle', x: 0, y: 0, w: 1, h: 2 }] },
			},
		})
		assert.deepEqual(shape(arranged.left), [[['chronicle']]])
	})

	test('a retired widget is dropped; an instance is kept once, where the old readers drew it first', () => {
		const p = panelsFromSlots({
			zoneLayout: {
				version: 1,
				zones: {
					left: { kind: 'side', side: 'left', widgets: ['stats', 'inventory'] },
					right: { kind: 'side', side: 'right', widgets: ['stats', 'composer', 'notes'] },
				},
			},
		})
		assert.deepEqual(shape(p.left), [[['stats']]])
		assert.deepEqual(shape(p.right), [[['notes']]])
	})
})

describe('the middle rules', () => {
	test('items side by side with the primary go above, rows over it above, rows under it below', () => {
		const p = panelsFromSlots({
			arrangedGrid: {
				middle: {
					cols: 4,
					rows: 10,
					items: [
						{ id: 'notes', x: 0, y: 8, w: 4, h: 2 },
						{ id: 'map', x: 3, y: 2, w: 1, h: 6 },
						{ id: 'messages', x: 0, y: 2, w: 3, h: 6 },
						{ id: 'banner', x: 0, y: 0, w: 4, h: 2 },
					],
				},
			},
		})
		assert.deepEqual(p.middle.primary.tabs, ['messages'])
		assert.deepEqual(shape(p.middle.above), [
			[['banner'], 'fit'],
			[['map'], 'fit'],
		])
		assert.deepEqual(shape(p.middle.below), [[['notes'], 'fit']])
	})

	test("strips come first in their area; the grid's middle entries by order around the primary", () => {
		const p = panelsFromSlots({
			zoneLayout: {
				version: 1,
				zones: {
					top: { kind: 'strip', area: 'top', widgets: ['banner'] },
					bottom: { kind: 'strip', area: 'bottom', widgets: ['ticker', 'clock'] },
				},
			},
			widgetGrid: {
				version: 1,
				cell: 44,
				widgets: [
					{ id: 'after', zone: 'middle', order: 2, size: grow, anchor: {} },
					{ id: 'messages', zone: 'middle', order: 1, size: grow, anchor: all },
					{ id: 'before', zone: 'middle', order: 0, size: grow, anchor: {} },
				],
			},
		})
		assert.deepEqual(shape(p.middle.above), [
			[['banner'], 'fit'],
			[['before'], 'fit'],
		])
		assert.deepEqual(shape(p.middle.below), [
			[['ticker', 'clock'], 'fit'],
			[['after'], 'fit'],
		])
	})

	test("the primary: the largest conversation, its group's members as tabs; it stays the open tab", () => {
		const p = panelsFromSlots({
			arrangedGrid: {
				middle: {
					cols: 4,
					rows: 8,
					items: [
						{ id: 'messages#aside', x: 0, y: 0, w: 1, h: 8, group: 'g' },
						{ id: 'messages', x: 1, y: 0, w: 3, h: 8, group: 'g' },
						{ id: 'messages#small', x: 0, y: 0, w: 1, h: 1 },
					],
				},
			},
		})
		assert.deepEqual(p.middle.primary, {
			key: 'p1',
			tabs: ['messages#aside', 'messages'],
			open: 'messages',
		})
		assert.deepEqual(shape(p.middle.above), [[['messages#small'], 'fit']])
	})

	test("no conversation in the middle: a role: 'primary' widget when told, else the first item", () => {
		const layout: SessionLayoutV1 = {
			widgetGrid: {
				version: 1,
				cell: 44,
				widgets: [
					{ id: 'tray', zone: 'middle', order: 0, size: grow, anchor: {} },
					{ id: 'acme.x:board', zone: 'middle', order: 1, size: grow, anchor: all },
				],
			},
		}
		assert.deepEqual(panelsFromSlots(layout).middle.primary.tabs, ['tray'])
		const told = panelsFromSlots(layout, { primaryWidgetIds: ['acme.x:board'] })
		assert.deepEqual(told.middle.primary.tabs, ['acme.x:board'])
		assert.deepEqual(shape(told.middle.above), [[['tray'], 'fit']])
	})

	test('nothing in the middle: the side panel holding the bare conversation moves there', () => {
		const p = panelsFromSlots({
			zoneLayout: {
				version: 1,
				zones: {
					right: {
						kind: 'side',
						side: 'right',
						pinned: false,
						widgets: ['stats', 'messages'],
					},
				},
			},
		})
		assert.deepEqual(p.middle.primary, { key: 'p1', tabs: ['messages'] })
		assert.deepEqual(shape(p.right), [[['stats'], 'rail']])
	})
})

describe('total, deterministic and idempotent', () => {
	test('a layout with no widgets at all is still a valid panel layout: the conversation as the primary', () => {
		const empty: PanelLayoutV1 = {
			version: 1,
			left: [],
			middle: { above: [], primary: { key: 'p1', tabs: ['messages'] }, below: [] },
			right: [],
		}
		for (const junk of [
			{},
			null,
			7,
			[],
			{ zoneLayout: 3, widgetGrid: { widgets: 'no' }, arrangedGrid: [] },
		])
			assert.deepEqual(panelsFromSlots(junk as never), empty, JSON.stringify(junk))
		assert.deepEqual(validateSessionLayout({ panels: panelsFromSlots({}) }), {
			ok: true,
			errors: [],
			warnings: [],
		})
	})

	test('the same layout, the same panels; panelsOf returns stored panels as they are', () => {
		for (const layout of [OLD_CHAT_LAYOUT, OLD_ADVENTURE_LAYOUT, OLD_LAIR_LAYOUT]) {
			const once = panelsFromSlots(layout)
			assert.deepEqual(panelsFromSlots(structuredClone(layout)), once)
			assert.deepEqual(panelsOf(layout), once, 'with no panels, panelsOf converts')
			const stored: SessionLayoutV1 = { ...layout, panels: once }
			assert.equal(panelsOf(stored), once, 'with panels, they are the whole truth')
			assert.deepEqual(
				panelsFromSlots(stored),
				once,
				'the converter reads the old slots only',
			)
		}
	})
})
