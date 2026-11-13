/**
 * `panelsV2Of` — version 1 panels and the old slots read as version 2: the ONE
 * converter every reader reuses. Pure, total, idempotent; it flattens the
 * middle, drops the pin, and inserts the turn line and composer the split of
 * Messages needs (2026-11-05), planning the settings it moves and the style
 * pins it copies.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	conversationSplitIds,
	LEGACY_SLOT_DROPPED,
	panelsOf,
	panelsV2Of,
	RETIRED_WIDGET_IDS,
	resolveDrawn,
	drawnWidgetIds,
	type PanelLayoutV1,
	type PanelLayoutV2,
	type SessionLayoutV1,
} from '../sdk/src/index.js'

/** A version 1 layout around a primary, with optional sides and settings. */
const v1 = (
	primary: object,
	extra: { above?: object[]; below?: object[]; left?: object[]; right?: object[] } = {},
	rest: Partial<SessionLayoutV1> = {},
): SessionLayoutV1 => ({
	panels: {
		version: 1,
		left: (extra.left ?? []) as PanelLayoutV1['left'],
		middle: {
			above: (extra.above ?? []) as PanelLayoutV1['middle']['above'],
			primary: primary as PanelLayoutV1['middle']['primary'],
			below: (extra.below ?? []) as PanelLayoutV1['middle']['below'],
		},
		right: (extra.right ?? []) as PanelLayoutV1['right'],
	},
	...rest,
})

/** A zone's panels as `[key, tabs]`. */
const keyed = (list: readonly { key: string; tabs: string[] }[]) => list.map((p) => [p.key, p.tabs])

describe('a stored version 2', () => {
	const stored: SessionLayoutV1 = {
		panels: {
			version: 2,
			left: [{ key: 'p1', tabs: ['stats'] }],
			middle: [{ key: 'p2', tabs: ['messages'] }],
			right: [],
			gap: 'tight',
		},
		widgetSettings: { messages: { composer: 'x' } },
	}

	test('is returned as the same object, with nothing to move', () => {
		const out = panelsV2Of(stored)
		assert.equal(out.panels, stored.panels)
		assert.deepEqual(out.settingsMoves, [])
		assert.deepEqual(out.styleCopies, [])
		assert.equal(panelsOf(stored), stored.panels)
	})

	test('a converted layout converts to itself', () => {
		const first = panelsV2Of(v1({ key: 'p1', tabs: ['messages'] }))
		const again = panelsV2Of({ panels: first.panels })
		assert.equal(again.panels, first.panels)
		assert.deepEqual(again.settingsMoves, [])
		assert.deepEqual(again.styleCopies, [])
	})
})

describe('flattening version 1', () => {
	test('left, the middle top to bottom (above, primary, below), right — the pin dropped', () => {
		const layout = v1(
			{ key: 'p3', tabs: ['messages'], open: 'messages' },
			{
				above: [{ key: 'p1', tabs: ['scene'], height: 'fit', title: 'Top' }],
				below: [{ key: 'p2', tabs: ['notes'] }],
				left: [{ key: 'p4', tabs: ['stats'], pinned: false, stray: 1 }],
				right: [{ key: 'p5', tabs: ['world', 7, 'cast'] }],
			},
			{ widgetSettings: { messages: { showComposer: false } } },
		)
		const before = JSON.stringify(layout)
		const { panels } = panelsV2Of(layout)
		assert.equal(JSON.stringify(layout), before, 'the input is not mutated')
		assert.equal(panels.version, 2)
		assert.deepEqual(panels.middle, [
			{ key: 'p1', tabs: ['scene'], height: 'fit', title: 'Top' },
			{ key: 'p3', tabs: ['messages'], open: 'messages' },
			{ key: 'p2', tabs: ['notes'] },
		])
		assert.deepEqual(panels.left, [{ key: 'p4', tabs: ['stats'] }])
		assert.deepEqual(panels.right, [{ key: 'p5', tabs: ['world', 'cast'] }])
		assert.ok(
			!('backing' in panels) && !('opacity' in panels) && !('gap' in panels),
			'no look is written',
		)
	})
})

describe('the composer and turn line', () => {
	test('go right after the panel: [panel, turn-line, composer]', () => {
		const { panels } = panelsV2Of(v1({ key: 'p1', tabs: ['messages'] }))
		assert.deepEqual(panels.middle, [
			{ key: 'p1', tabs: ['messages'] },
			{ key: 'p2', tabs: ['turn-line'], height: 'fit' },
			{ key: 'p3', tabs: ['composer'], height: 'fit' },
		])
	})

	test("composerPosition 'top' puts the pair before the panel: [turn-line, composer, panel]", () => {
		const { panels } = panelsV2Of(
			v1(
				{ key: 'p1', tabs: ['messages'] },
				{},
				{ widgetSettings: { messages: { composerPosition: 'top' } } },
			),
		)
		assert.deepEqual(keyed(panels.middle), [
			['p2', ['turn-line']],
			['p3', ['composer']],
			['p1', ['messages']],
		])
	})

	test("nextUp 'hidden' — and the legacy showNudge: false — insert no turn line", () => {
		for (const settings of [{ nextUp: 'hidden' }, { showNudge: false }]) {
			const { panels } = panelsV2Of(
				v1(
					{ key: 'p1', tabs: ['messages'] },
					{},
					{ widgetSettings: { messages: settings } },
				),
			)
			assert.deepEqual(keyed(panels.middle), [
				['p1', ['messages']],
				['p2', ['composer']],
			])
		}
	})

	test("an unknown nextUp reads as 'head'; a list stays a turn line", () => {
		for (const nextUp of ['list', 'bogus']) {
			const { panels } = panelsV2Of(
				v1(
					{ key: 'p1', tabs: ['messages'] },
					{},
					{ widgetSettings: { messages: { nextUp } } },
				),
			)
			assert.equal(panels.middle.length, 3)
		}
	})

	test('showComposer: false is a reading pane — no pair', () => {
		const { panels, settingsMoves } = panelsV2Of(
			v1(
				{ key: 'p1', tabs: ['messages'] },
				{},
				{ widgetSettings: { messages: { showComposer: false, composer: 'x' } } },
			),
		)
		assert.deepEqual(keyed(panels.middle), [['p1', ['messages']]])
		assert.deepEqual(settingsMoves, [
			{ drop: 'messages', key: 'composer' },
			{ drop: 'messages', key: 'showComposer' },
		])
	})

	test('a copy keeps its name: messages#journal → composer#journal, turn-line#journal', () => {
		const { panels } = panelsV2Of(v1({ key: 'p1', tabs: ['messages#journal'] }))
		assert.deepEqual(keyed(panels.middle), [
			['p1', ['messages#journal']],
			['p2', ['turn-line#journal']],
			['p3', ['composer#journal']],
		])
	})

	test('two composing panels each get their own pair; keys run middle → left → right', () => {
		const { panels } = panelsV2Of(
			v1(
				{ key: 'p1', tabs: ['messages'] },
				{ right: [{ key: 'p2', tabs: ['messages#aside'] }] },
			),
		)
		assert.deepEqual(keyed(panels.middle), [
			['p1', ['messages']],
			['p3', ['turn-line']],
			['p4', ['composer']],
		])
		assert.deepEqual(keyed(panels.right), [
			['p2', ['messages#aside']],
			['p5', ['turn-line#aside']],
			['p6', ['composer#aside']],
		])
	})

	test("a panel's FIRST composing Messages tab names the pair", () => {
		const { panels } = panelsV2Of(
			v1({ key: 'p1', tabs: ['messages#parley', 'messages', 'annex#planning-notes'] }),
		)
		assert.deepEqual(keyed(panels.middle), [
			['p1', ['messages#parley', 'messages', 'annex#planning-notes']],
			['p2', ['turn-line#parley']],
			['p3', ['composer#parley']],
		])
		// A first tab that is a reading pane gives way to the next one.
		const next = panelsV2Of(
			v1(
				{ key: 'p1', tabs: ['messages#parley', 'messages'] },
				{},
				{ widgetSettings: { 'messages#parley': { showComposer: false } } },
			),
		)
		assert.deepEqual(next.panels.middle[2]!.tabs, ['composer'])
	})

	test('a composer written into version 1 is slot-era: dropped, and the split still runs', () => {
		const { panels, settingsMoves } = panelsV2Of(
			v1(
				{ key: 'p1', tabs: ['messages'] },
				{ below: [{ key: 'p2', tabs: ['composer#elsewhere'] }] },
				{
					widgetSettings: { messages: { composer: 'x', nextUp: 'list' } },
				},
			),
		)
		assert.deepEqual(keyed(panels.middle), [
			['p1', ['messages']],
			['p2', ['turn-line']],
			['p3', ['composer']],
		])
		assert.deepEqual(settingsMoves, [
			{ from: 'messages', to: 'composer', key: 'composer', value: 'x' },
			{ from: 'messages', to: 'turn-line', key: 'nextUp', value: 'list' },
		])
	})

	test('a version 2 layout that already places composer is kept as written', () => {
		const stored: SessionLayoutV1 = {
			panels: {
				version: 2,
				left: [],
				middle: [
					{ key: 'p1', tabs: ['messages'] },
					{ key: 'p2', tabs: ['composer#elsewhere'] },
				],
				right: [],
			} as PanelLayoutV2,
		}
		assert.equal(panelsV2Of(stored).panels, stored.panels)
	})

	test('keys continue above the highest p<n>, whatever order the layout holds them in', () => {
		const { panels } = panelsV2Of(
			v1({ key: 'p9', tabs: ['messages'] }, { left: [{ key: 'p2', tabs: ['stats'] }] }),
		)
		assert.deepEqual(
			panels.middle.map((p) => p.key),
			['p9', 'p10', 'p11'],
		)
	})

	test('opts.widgetSettings layers over the layout’s own, per key', () => {
		const layout = v1(
			{ key: 'p1', tabs: ['messages'] },
			{},
			{ widgetSettings: { messages: { nextUp: 'hidden' } } },
		)
		assert.equal(panelsV2Of(layout).panels.middle.length, 2)
		assert.equal(
			panelsV2Of(layout, { widgetSettings: { messages: { showComposer: false } } }).panels
				.middle.length,
			1,
		)
		// The layout's own nextUp still counts when the caller passes nothing for it.
		assert.equal(panelsV2Of(layout, { widgetSettings: {} }).panels.middle.length, 2)
		// A key the caller passes wins.
		assert.equal(
			panelsV2Of(layout, { widgetSettings: { messages: { nextUp: 'list' } } }).panels.middle
				.length,
			3,
		)
	})

	test('a reading pane the LAYOUT declares stays a reading pane when the caller passes rows', () => {
		const layout = v1(
			{ key: 'p1', tabs: ['messages'] },
			{ right: [{ key: 'p2', tabs: ['messages#journal'] }] },
			{ widgetSettings: { 'messages#journal': { showComposer: false } } },
		)
		const { panels } = panelsV2Of(layout, { widgetSettings: { messages: { nextUp: 'head' } } })
		assert.deepEqual(panels.right.map((p) => p.tabs), [['messages#journal']])
	})

	test('the legacy showNudge is dropped from a Messages copy', () => {
		const { settingsMoves } = panelsV2Of(
			v1({ key: 'p1', tabs: ['messages'] }, {}, { widgetSettings: { messages: { showNudge: false } } }),
		)
		assert.deepEqual(settingsMoves, [{ drop: 'messages', key: 'showNudge' }])
	})
})

describe('settingsMoves', () => {
	test('moves and drops, in the fixed key order; hostCard on every widget, Messages keys only on Messages', () => {
		const layout = v1(
			{ key: 'p1', tabs: ['messages'] },
			{ right: [{ key: 'p2', tabs: ['stats', 'messages#reading'] }] },
			{
				widgetSettings: {
					// Written in a scrambled order on purpose.
					messages: {
						backingMode: 'x',
						hostCard: true,
						showMessages: false,
						showComposer: true,
						composerPosition: 'bottom',
						nextUp: 'list',
						showActions: true,
						otherTabsComposer: true,
						composer: 'rich',
						title: 'Talk',
					},
					stats: { showMessages: 'a plugin’s own', hostCard: false, owners: 'world' },
					'messages#reading': { showComposer: false, composer: 'y', nextUp: 'head' },
				},
			},
		)
		assert.deepEqual(panelsV2Of(layout).settingsMoves, [
			{ from: 'messages', to: 'composer', key: 'composer', value: 'rich' },
			{ from: 'messages', to: 'composer', key: 'otherTabsComposer', value: true },
			{ from: 'messages', to: 'composer', key: 'showActions', value: true },
			{ from: 'messages', to: 'turn-line', key: 'nextUp', value: 'list' },
			{ drop: 'messages', key: 'composerPosition' },
			{ drop: 'messages', key: 'showComposer' },
			{ drop: 'messages', key: 'showMessages' },
			{ drop: 'messages', key: 'hostCard' },
			{ drop: 'messages', key: 'backingMode' },
			{ drop: 'stats', key: 'hostCard' },
			{ drop: 'messages#reading', key: 'composer' },
			{ drop: 'messages#reading', key: 'nextUp' },
			{ drop: 'messages#reading', key: 'showComposer' },
		])
	})

	test('a hidden turn line drops nextUp; a present key counts whatever its value', () => {
		const out = panelsV2Of(
			v1(
				{ key: 'p1', tabs: ['messages'] },
				{},
				{ widgetSettings: { messages: { nextUp: 'hidden', composer: undefined } } },
			),
		)
		assert.deepEqual(out.settingsMoves, [
			{ from: 'messages', to: 'composer', key: 'composer', value: undefined },
			{ drop: 'messages', key: 'nextUp' },
		])
	})
})

describe('styleCopies', () => {
	test('only when the Messages copy has a pin and the new id has none', () => {
		const base = v1({ key: 'p1', tabs: ['messages'] })
		assert.deepEqual(panelsV2Of(base).styleCopies, [])
		assert.deepEqual(
			panelsV2Of({ ...base, widgetStyles: { messages: { slug: 'novel' } } }).styleCopies,
			[
				{ from: 'messages', to: 'turn-line' },
				{ from: 'messages', to: 'composer' },
			],
		)
		assert.deepEqual(
			panelsV2Of({
				...base,
				widgetStyles: { messages: { slug: 'novel' }, composer: { slug: 'mine' } },
			}).styleCopies,
			[{ from: 'messages', to: 'turn-line' }],
		)
		assert.deepEqual(panelsV2Of(base, { widgetStyles: { messages: 3 } }).styleCopies, [
			{ from: 'messages', to: 'turn-line' },
			{ from: 'messages', to: 'composer' },
		])
		assert.deepEqual(
			panelsV2Of(
				{ ...base, widgetStyles: { messages: { slug: 'novel' } } },
				{ widgetStyles: { messages: null } },
			).styleCopies,
			[],
		)
	})
})

describe('the old slots', () => {
	const slots: SessionLayoutV1 = {
		zoneLayout: {
			version: 1,
			zones: { right: { kind: 'side', side: 'right', widgets: ['stats', 'composer'] } },
		},
	}

	test('go through panelsFromSlots; a slot-era composer is not revived; the floor’s conversation gets its pair', () => {
		const { panels } = panelsV2Of(slots)
		assert.deepEqual(keyed(panels.middle), [
			['p1', ['messages']],
			['p3', ['turn-line']],
			['p4', ['composer']],
		])
		assert.deepEqual(keyed(panels.right), [['p2', ['stats']]])
		// Keys stay unique across the whole layout.
		const all = [...panels.left, ...panels.middle, ...panels.right].map((p) => p.key)
		assert.equal(new Set(all).size, all.length)
	})

	test('the floor’s pair are floor panels: drawn, but never counted as placed', () => {
		const drawn = resolveDrawn(slots, { inline: 1000 })
		assert.deepEqual(
			drawn.middle.panels.map((p) => [p.key, p.floor === true]),
			[
				['p1', true],
				['p3', true],
				['p4', true],
			],
		)
		assert.deepEqual(drawnWidgetIds(slots), ['stats'])
	})

	test('a slot layout that places the conversation gets its pair, counted as drawn', () => {
		const placed: SessionLayoutV1 = {
			zoneLayout: {
				version: 1,
				zones: { right: { kind: 'side', side: 'right', widgets: ['stats'] } },
			},
			widgetGrid: {
				version: 1,
				cell: 40,
				widgets: [
					{
						id: 'messages',
						zone: 'middle',
						order: 0,
						size: { w: 'grow', h: 'grow' },
						anchor: {},
					},
				],
			},
		}
		assert.deepEqual(drawnWidgetIds(placed), ['messages', 'turn-line', 'composer', 'stats'])
	})
})

describe('ids', () => {
	test('conversationSplitIds names the pair of a copy', () => {
		assert.deepEqual(conversationSplitIds('messages'), {
			composer: 'composer',
			turnLine: 'turn-line',
		})
		assert.deepEqual(conversationSplitIds('messages#x'), {
			composer: 'composer#x',
			turnLine: 'turn-line#x',
		})
	})

	test('composer is a widget again; only the old slots drop it', () => {
		assert.equal(RETIRED_WIDGET_IDS.has('composer'), false)
		assert.equal(RETIRED_WIDGET_IDS.has('inventory'), true)
		assert.equal(LEGACY_SLOT_DROPPED.has('composer'), true)
	})
})

describe('total on junk', () => {
	test('never throws, always a version 2', () => {
		const junk: unknown[] = [
			null,
			undefined,
			7,
			'x',
			[],
			{},
			{ panels: 7 },
			{ panels: null },
			{ panels: { version: 9 } },
			{ panels: { version: 1 } },
			{ panels: { version: 1, middle: 3 } },
			{
				panels: {
					version: 1,
					left: 'x',
					middle: { above: 4, primary: { tabs: 3 }, below: {} },
					right: [null, 1],
				},
			},
			{ widgetSettings: 4, widgetStyles: [] },
			{
				widgetSettings: { messages: 5, 'bad id': null },
				widgetStyles: { messages: undefined },
			},
		]
		for (const layout of junk) {
			const out = panelsV2Of(layout as SessionLayoutV1)
			assert.equal(out.panels.version, 2)
			assert.ok(
				Array.isArray(out.panels.middle) &&
					Array.isArray(out.settingsMoves) &&
					Array.isArray(out.styleCopies),
			)
			assert.doesNotThrow(() => resolveDrawn(layout as SessionLayoutV1, { inline: 0 }))
			assert.doesNotThrow(() => drawnWidgetIds(layout as SessionLayoutV1))
		}
		// An unreadable v1 reads as absent: the old slots, i.e. the floor.
		const odd = panelsV2Of({ panels: { version: 9 } } as unknown as SessionLayoutV1)
			.panels as PanelLayoutV2
		assert.deepEqual(odd.middle[0]!.tabs, ['messages'])
	})
})

describe('resolveDrawn on version 2', () => {
	const layout: SessionLayoutV1 = {
		panels: {
			version: 2,
			left: [
				{ key: 'p1', tabs: ['stats'], priority: 'low' },
				{ key: 'p2', tabs: ['inventory'] },
			],
			middle: [
				{ key: 'p3', tabs: ['messages'], height: { share: 9 } },
				{ key: 'p4', tabs: ['composer'], height: { share: 99 } },
			],
			right: [
				{ key: 'p5', tabs: ['notes', 'stats'], open: 'notes', priority: 'bogus' as never },
			],
			backing: 'glass',
			opacity: 140,
			gap: 'spacious',
		},
	}
	const widgets = [
		{ id: 'composer', panel: { height: 'fit', priority: 'high' } },
		{ id: 'notes', panel: { priority: 'low' } },
	] as const

	test('every panel is open; a retired tab is dropped and its empty panel not drawn', () => {
		const d = resolveDrawn(layout, { inline: 1000 }, { widgets })
		assert.deepEqual(
			d.left.panels.map((p) => p.key),
			['p1'],
		)
		assert.ok(
			[d.left, d.middle, d.right].every(
				(z) => z.pinned && z.panels.every((p) => p.pinned && p.tabs.every((t) => t.pinned)),
			),
		)
		assert.ok(!('rung' in d.left) && !('zoneKey' in d.left))
	})

	test('height and priority: stored, else the open tab’s declaration, else fill / normal', () => {
		const d = resolveDrawn(layout, { inline: 1000 }, { widgets })
		const by = (key: string) =>
			[...d.left.panels, ...d.middle.panels, ...d.right.panels].find((p) => p.key === key)!
		assert.deepEqual([by('p1').height, by('p1').priority], ['fill', 'low'])
		assert.deepEqual([by('p3').height, by('p3').priority], [{ share: 9 }, 'normal'])
		assert.deepEqual([by('p4').height, by('p4').priority], ['fit', 'high'])
		assert.deepEqual([by('p5').height, by('p5').priority], ['fill', 'low'])
		const bare = resolveDrawn(layout, { inline: 1000 })
		assert.deepEqual(
			[bare.middle.panels[1]!.height, bare.middle.panels[1]!.priority],
			['fill', 'normal'],
		)
	})

	test('the look is read and clamped; version 1 and the slots read the default', () => {
		assert.deepEqual(resolveDrawn(layout, { inline: 0 }).look, {
			backing: 'glass',
			opacity: 100,
			gap: 'spacious',
			behind: 'background',
			behindDim: 0,
			gapPx: 24,
		})
		assert.deepEqual(resolveDrawn(v1({ key: 'p1', tabs: ['messages'] }), { inline: 0 }).look, {
			backing: 'card',
			opacity: 100,
			gap: 'comfortable',
			behind: 'background',
			behindDim: 0,
			gapPx: 12,
		})
		const low = {
			panels: {
				...(layout.panels as PanelLayoutV2),
				opacity: -5,
				backing: 'x' as never,
				gap: 'x' as never,
			},
		}
		assert.deepEqual(resolveDrawn(low, { inline: 0 }).look, {
			backing: 'card',
			opacity: 0,
			gap: 'comfortable',
			behind: 'background',
			behindDim: 0,
			gapPx: 12,
		})
	})
})
