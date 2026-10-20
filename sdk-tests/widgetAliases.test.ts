/**
 * Widget id aliases (PLAN-core-widgets W7, 2026-10-11): `world-state` is
 * Stats now — an alias, not a retirement — so a layout, preset or
 * arrangement that places it keeps drawing what it drew: a copy of `stats`,
 * under the id it was placed by (its stored settings and style pin are
 * keyed by it), with `{ owners: 'world', arrangement: 'strip' }` implied
 * under its own settings, and core's own `title: 'World State'` so it keeps
 * its name. Core's shipped layouts place `stats#world` by name instead. (A genre omitting World State still refuses a
 * layout placing it: `widgetDecls.test.ts`.)
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	drawnInstances,
	drawnWidgetIds,
	instanceNameOf,
	isInstanceOf,
	resolveDrawn,
	resolveWidgetAlias,
	RETIRED_WIDGET_IDS,
	validateSessionLayout,
	WIDGET_ID_ALIASES,
	widgetOfInstance,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { STORY_WORLD_LAYOUT, LAIR_LAYOUT } from '../core-catalog/src/registry/layouts.js'
import { CORE_WIDGETS } from '../core-catalog/src/registry/widgets.js'

const IMPLIED = { owners: 'world', arrangement: 'strip', title: 'World State' }

/** Core owns these settings for every widget (`WidgetDecl.settings`: reserved). */
const CORE_OWNED = new Set(['title', 'lane'])

/** Adventure's middle as it shipped before W7: World State a strip above the messages. */
const STRIP_BEFORE_W7: SessionLayoutV1 = {
	widgetGrid: {
		version: 1,
		cell: 44,
		widgets: [
			{ id: 'world-state', zone: 'middle', order: 0, size: { w: 'grow', h: 'fixed' }, anchor: { top: true } },
			{ id: 'messages', zone: 'middle', order: 1, size: { w: 'grow', h: 'grow' }, anchor: {} },
		],
	},
}

/** Lair's sides as they shipped before W7: Stats left, World State over the Sanctum right. */
const RIGHT_BEFORE_W7: SessionLayoutV1 = {
	zoneLayout: {
		version: 1,
		zones: {
			left: { kind: 'side', side: 'left', pinned: true, widgets: ['stats'] },
			right: { kind: 'side', side: 'right', pinned: true, widgets: ['world-state', 'messages#sanctum'] },
		},
	},
}

describe('WIDGET_ID_ALIASES', () => {
	test("world-state is Stats with the world as a strip; every implied key is a Stats setting or core's own", () => {
		assert.deepEqual(Object.keys(WIDGET_ID_ALIASES), ['world-state'])
		const alias = WIDGET_ID_ALIASES['world-state']!
		assert.equal(alias.id, 'stats')
		assert.deepEqual(alias.settings, IMPLIED)
		const stats = CORE_WIDGETS.find((w) => w.id === 'stats')!
		for (const [key, value] of Object.entries(alias.settings)) {
			if (CORE_OWNED.has(key)) continue
			const field = stats.settings?.[key]
			assert.ok(field, `'${key}' is a Stats setting`)
			assert.ok(
				field.of?.includes(value as string),
				`'${String(value)}' is one of ${key}'s values`,
			)
		}
	})
	test('an alias is neither retired nor a widget id of its own', () => {
		for (const id of Object.keys(WIDGET_ID_ALIASES))
			assert.equal(RETIRED_WIDGET_IDS.has(id), false)
	})
})

describe('resolveWidgetAlias', () => {
	test('world-state reads as stats#world, its copies as stats#world-<name>', () => {
		assert.deepEqual(resolveWidgetAlias('world-state'), {
			widgetId: 'stats',
			instanceId: 'stats#world',
			impliedSettings: IMPLIED,
			aliasedFrom: 'world-state',
		})
		assert.equal(resolveWidgetAlias('world-state#2').instanceId, 'stats#world-2')
		assert.equal(resolveWidgetAlias('world-state#north').instanceId, 'stats#world-north')
		assert.deepEqual(resolveWidgetAlias('world-state#2').impliedSettings, IMPLIED)
	})
	test('an id that is no alias answers itself, its widget and nothing implied', () => {
		for (const id of ['stats', 'stats#world', 'messages#sanctum', 'acme.maps:map#north'])
			assert.deepEqual(resolveWidgetAlias(id), {
				widgetId: id.split('#')[0],
				instanceId: id,
				impliedSettings: {},
				aliasedFrom: null,
			})
	})
	test('collision-safe given what is placed, and stable without it', () => {
		assert.equal(
			resolveWidgetAlias('world-state', ['stats', 'stats#world']).instanceId,
			'stats#world-2',
		)
		assert.equal(
			resolveWidgetAlias('world-state', ['stats#world', 'stats#world-2']).instanceId,
			'stats#world-3',
		)
		// Its own id among the placed is not a collision.
		assert.equal(
			resolveWidgetAlias('world-state', ['world-state', 'stats']).instanceId,
			'stats#world',
		)
		assert.equal(resolveWidgetAlias('world-state').instanceId, 'stats#world')
	})
	test('a long instance name is cut to a valid one', () => {
		const long = `world-state#${'a'.repeat(32)}`
		const name = instanceNameOf(resolveWidgetAlias(long).instanceId)!
		assert.ok(name.length <= 32 && /^[a-z0-9][a-z0-9-]{0,31}$/.test(name), name)
	})
	test('widgetOfInstance and instanceNameOf read through it', () => {
		assert.equal(widgetOfInstance('world-state'), 'stats')
		assert.equal(widgetOfInstance('world-state#2'), 'stats')
		assert.equal(instanceNameOf('world-state'), 'world')
		assert.equal(instanceNameOf('world-state#2'), 'world-2')
		assert.ok(isInstanceOf('world-state', 'stats'))
		assert.equal(widgetOfInstance('stats#world'), 'stats')
		assert.equal(instanceNameOf('stats'), null)
	})
})

describe('resolveDrawn through the alias', () => {
	test('a middle strip and a right column placing it draw Stats, under the placed id, with the implied settings', () => {
		const drawn = resolveDrawn(STRIP_BEFORE_W7, { inline: 1300 })
		const strip = drawn.middle.instances.find((i) => i.instanceId === 'world-state')!
		assert.equal(strip.widgetId, 'stats')
		assert.deepEqual(strip.impliedSettings, IMPLIED)
		const lair = resolveDrawn(RIGHT_BEFORE_W7, { inline: 1300 })
		const right = lair.right.instances.find((i) => i.instanceId === 'world-state')!
		assert.equal(right.widgetId, 'stats')
		assert.deepEqual(right.impliedSettings, IMPLIED)
		// The plain Stats beside it is plain Stats: nothing implied.
		const left = lair.left.instances.find((i) => i.instanceId === 'stats')!
		assert.equal(left.widgetId, 'stats')
		assert.equal('impliedSettings' in left, false)
	})
	test('a copy, world-state#2, in a list, a grid and a strip', () => {
		const layout: SessionLayoutV1 = {
			zoneLayout: {
				version: 1,
				zones: {
					right: { kind: 'side', side: 'right', widgets: ['world-state#2'] },
					top: { kind: 'strip', area: 'top', widgets: ['world-state#3'] },
				},
			},
			widgetGrid: {
				version: 1,
				cell: 44,
				widgets: [
					{
						id: 'messages',
						zone: 'middle',
						order: 1,
						size: { w: 'grow', h: 'grow' },
						anchor: {},
					},
					{
						id: 'world-state',
						zone: 'middle',
						order: 0,
						size: { w: 'grow', h: 'fixed' },
						anchor: {},
					},
				],
			},
		}
		const every = drawnInstances(resolveDrawn(layout, { inline: 1300 }))
		assert.deepEqual(
			every.map((i) => [i.instanceId, i.widgetId, i.impliedSettings ?? null]),
			// The top strip is the first panel above the conversation, then the
			// grid's middle entry ordered before it; the right column last.
			[
				['world-state#3', 'stats', IMPLIED],
				['world-state', 'stats', IMPLIED],
				['messages', 'messages', null],
				['world-state#2', 'stats', IMPLIED],
			],
		)
		assert.deepEqual(drawnWidgetIds(layout), [
			'world-state#3',
			'world-state',
			'messages',
			'world-state#2',
		])
	})
})

describe("core's shipped layouts", () => {
	test('place the world as stats#world by name, never the alias', () => {
		for (const layout of [STORY_WORLD_LAYOUT, LAIR_LAYOUT])
			assert.equal(drawnWidgetIds(layout).includes('world-state'), false)
		const strip = resolveDrawn(STORY_WORLD_LAYOUT, { inline: 1300 }).middle.instances[0]!
		assert.equal(strip.instanceId, 'stats#world')
		assert.equal(strip.widgetId, 'stats')
		assert.equal('impliedSettings' in strip, false)
		assert.deepEqual(STORY_WORLD_LAYOUT.widgetSettings?.['stats#world'], IMPLIED)
	})
})

describe('validateSessionLayout through the alias', () => {
	const known = CORE_WIDGETS.map((w) => ({ id: w.id, maxInstances: w.maxInstances }))
	test('accepts a layout placing world-state, and warns of nothing unknown or retired', () => {
		for (const layout of [STRIP_BEFORE_W7, RIGHT_BEFORE_W7]) {
			const v = validateSessionLayout(layout, { widgets: known, unknownWidgets: 'warn' })
			assert.equal(v.ok, true, v.errors.join('; '))
			assert.deepEqual(
				v.warnings.filter((w) => w.includes('world-state')),
				[],
			)
		}
	})
	test('an aliased id with only Stats declared is still known', () => {
		const v = validateSessionLayout(
			{
				zoneLayout: {
					version: 1,
					zones: { right: { kind: 'side', side: 'right', widgets: ['world-state#2'] } },
				},
			},
			{ widgets: [{ id: 'stats' }], unknownWidgets: 'warn' },
		)
		assert.deepEqual(v, { ok: true, errors: [], warnings: [] })
	})
	test('counted against the widget it became', () => {
		const v = validateSessionLayout(
			{
				zoneLayout: {
					version: 1,
					zones: {
						right: { kind: 'side', side: 'right', widgets: ['stats', 'world-state'] },
					},
				},
			},
			{ widgets: [{ id: 'stats', maxInstances: 1 }] },
		)
		assert.ok(v.warnings.some((w) => w.includes("'stats' is placed 2 times")))
	})
})
