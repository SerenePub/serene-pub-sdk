/**
 * R71 (ruled 2026-09-24): a package declares its widgets, each optionally
 * scoped to genres; a genre withholds any package's widgets by value and
 * ships its layouts. Every refusal names the fix.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	defineExtension,
	genre,
	layout,
	ownWidgets,
	use,
	widget,
	widgetOwner,
	widgetRef,
	type LayoutPreset,
} from '../sdk/src/index.js'
import { coreWidgets } from '../core-catalog/src/index.js'
import { genreLayouts } from '../cli/src/compiler.js'

const middle = (id: string): LayoutPreset => ({
	layout: {
		version: 2,
		zones: {
			middle: {
				rows: ['grow'],
				cols: ['grow'],
				units: [{ kind: 'widget', key: id, widget: id, row: { start: 1, span: 1 }, col: { start: 1, span: 1 } }],
			},
		},
	},
	widgetSettings: { [id]: { zoom: 'fit' } },
})

describe('widget()', () => {
	test('reads genre values down to ids, and refuses a bare string', () => {
		const g = genre('r71a.pkg:genre/a', { name: 'A', family: 'test' })
		const w = widget({ id: 'tray', title: 'Tray', component: 'tray', genres: [g, use('core:genre/chat')] })
		assert.deepEqual(w.genres, ['r71a.pkg:genre/a', 'core:genre/chat'])
		assert.throws(() => widget({ id: 'tray', title: 'Tray', component: 'tray', genres: ['core:genre/chat' as never] }), /genre value/)
		assert.throws(() => widget({ id: 'Not An Id', title: 'x', component: 'x' }), /not a widget id/)
		assert.equal(widget({ id: 'loose', title: 'Loose', component: 'loose' }).genres, undefined)
	})
})

describe('whose a widget is', () => {
	test("core's are bare, a plugin's sit under its package, and an unowned one is refused by name", () => {
		// World State, not Inventory: R79 removed that widget for now.
		assert.equal(widgetRef(coreWidgets.worldState), 'world-state')
		const mine = widget({ id: 'board', title: 'Board', component: 'board' })
		assert.throws(() => widgetRef(mine), /belongs to no package yet/)
		defineExtension({
			slug: 'r71b.pkg',
			name: 'B',
			version: '1.0.0',
			widgets: [mine],
			components: [{ __decl: 'component', slug: 'board', label: 'Board', entry: 'components/board.ts', framework: 'svelte' }],
		})
		assert.equal(widgetOwner(mine), 'r71b.pkg')
		assert.equal(widgetRef(mine), 'r71b.pkg:board')
		assert.throws(() => ownWidgets('someone.else', [mine]), /already r71b\.pkg's/)
	})

	test('a package widget names a component the package declares, once', () => {
		const w = widget({ id: 'lone', title: 'Lone', component: 'missing' })
		assert.throws(
			() => defineExtension({ slug: 'r71c.pkg', name: 'C', version: '1.0.0', widgets: [w, w] }),
			(e: Error) => /two widgets are 'lone'/.test(e.message) && /component 'missing'.*does not declare/.test(e.message),
		)
	})
})

describe("a genre's omitWidgets and layouts", () => {
	test('withholds by value and stores the ids the page knows', () => {
		const g = genre('r71d.pkg:genre/d', { name: 'D', family: 'test', omitWidgets: [coreWidgets.worldState, coreWidgets.stats] })
		assert.deepEqual(g.omitWidgets, ['world-state', 'stats'])
	})

	test('refuses a string, and a widget no package has declared', () => {
		assert.throws(() => genre('r71e.pkg:genre/e', { name: 'E', family: 'test', omitWidgets: ['world-state' as never] }), /is a string/)
		const stray = widget({ id: 'stray', title: 'Stray', component: 'stray' })
		assert.throws(() => genre('r71f.pkg:genre/f', { name: 'F', family: 'test', omitWidgets: [stray] }), /belongs to no package yet/)
	})

	test('never leaves the middle empty: omitting the conversation needs a layout that places something there', () => {
		assert.throws(
			() => genre('r71g.pkg:genre/g', { name: 'G', family: 'test', omitWidgets: [coreWidgets.conversation] }),
			/omits the conversation — ship a layout/,
		)
		const ok = genre('r71h.pkg:genre/h', {
			name: 'H',
			family: 'test',
			omitWidgets: [coreWidgets.conversation],
			layouts: [layout({ slug: 'default', name: 'H', preset: middle('board') })],
		})
		assert.equal(ok.layouts?.[0]?.slug, 'default')
	})

	test('a layout may not place what the genre omits, and slugs are unique', () => {
		assert.throws(
			() =>
				genre('r71i.pkg:genre/i', {
					name: 'I',
					family: 'test',
					omitWidgets: [coreWidgets.worldState],
					layouts: [layout({ slug: 'default', name: 'I', preset: middle('world-state') })],
				}),
			/places 'world-state', which the genre omits/,
		)
		assert.throws(
			() =>
				genre('r71j.pkg:genre/j', {
					name: 'J',
					family: 'test',
					layouts: [
						layout({ slug: 'default', name: 'J', preset: middle('messages') }),
						layout({ slug: 'default', name: 'J2', preset: middle('messages') }),
					],
				}),
			/two layouts are 'default'/,
		)
		assert.throws(() => layout({ slug: 'x', name: 'X', preset: { layout: { version: 1 } } as never }), /not a layout document/)
	})
})

describe('the packager', () => {
	test("puts the package's own widgets under its namespace in the layouts it ships, and leaves core's alone", () => {
		const board = widget({ id: 'board', title: 'Board', component: 'board' })
		const g = genre('r71k.pkg:genre/k', {
			name: 'K',
			family: 'test',
			layouts: [
				layout({
					slug: 'default',
					name: 'K',
					preset: {
						layout: {
							version: 2,
							zones: {
								middle: {
									rows: ['grow'],
									cols: ['grow'],
									units: [
										{ kind: 'widget', key: 'board', widget: 'board', row: { start: 1, span: 1 }, col: { start: 1, span: 1 } },
										{
											kind: 'group',
											key: 'side',
											members: [{ widget: 'stats', key: 'stats' }],
											row: { start: 1, span: 1 },
											col: { start: 1, span: 1 },
										},
									],
								},
							},
						},
						widgetSettings: { board: { zoom: 'fit' }, stats: { compact: true } },
					},
				}),
			],
		})
		// The packager reads a built extension; a genre with no create pipeline
		// would not get this far, and the layouts are all this test is about.
		const e = { slug: 'r71k.pkg', widgets: [board], genres: [g] } as unknown as Parameters<typeof genreLayouts>[0]
		const [out] = genreLayouts(e)
		assert.equal(out?.genreId, 'r71k.pkg:genre/k')
		const units = out!.preset.layout.zones.middle.units as unknown as Array<Record<string, unknown>>
		assert.equal(units[0]!.widget, 'r71k.pkg:board')
		assert.equal(units[0]!.key, 'r71k.pkg:board')
		assert.deepEqual(units[1]!.members, [{ widget: 'stats', key: 'stats' }])
		assert.deepEqual(Object.keys(out!.preset.widgetSettings ?? {}), ['r71k.pkg:board', 'stats'])
	})
})

describe('review fixes', () => {
	test("a package widget may not take core's widget's id", () => {
		const clash = widget({ id: 'stats', title: 'Stats', component: 'stats' })
		assert.throws(
			() =>
				defineExtension({
					slug: 'r71l.pkg',
					name: 'L',
					version: '1.0.0',
					widgets: [clash],
					components: [{ __decl: 'component', slug: 'stats', label: 'S', entry: 'components/s.ts', framework: 'svelte' }],
				}),
			/is core's widget's id/,
		)
	})

	test("the first layout a genre ships is its default", () => {
		assert.throws(
			() => genre('r71m.pkg:genre/m', { name: 'M', family: 'test', layouts: [layout({ slug: 'classic', name: 'C', preset: middle('messages') })] }),
			/give it slug 'default'/,
		)
	})

	test('one owner registry per process, whatever copy of the SDK asks', () => {
		const shared = (globalThis as Record<symbol, { owners: WeakMap<object, string> }>)[Symbol.for('serene-pub.widget-owners')]
		assert.equal(shared?.owners.get(coreWidgets.stats), 'core')
	})
})
