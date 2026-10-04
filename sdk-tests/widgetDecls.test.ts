/**
 * R71 (ruled 2026-09-24): a package declares its widgets, each optionally
 * scoped to genres; a genre withholds any package's widgets by value and
 * ships its layouts. Every refusal names the fix.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	declarationFindings,
	defineExtension,
	genre,
	genreLayoutFindings,
	layout,
	ownWidgets,
	use,
	widget,
	widgetOwner,
	widgetRef,
	type SessionLayoutV1,
} from '../sdk/src/index.js'
import { coreWidgets } from '../core-catalog/src/index.js'
import { genreLayouts } from '../cli/src/compiler.js'

const all = { top: true, bottom: true, left: true, right: true }

/** A session layout placing one widget, filling the middle. */
const middle = (id: string): SessionLayoutV1 => ({
	widgetGrid: { version: 1, cell: 44, widgets: [{ id, zone: 'middle', order: 0, size: { w: 'grow', h: 'grow' }, anchor: all }] },
	widgetSettings: { [id]: { zoom: 'fit' } },
})

/** …and one placing it in the right column only. */
const right = (id: string): SessionLayoutV1 => ({
	zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: [id] } } },
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

	test('the primary floor: omitting the conversation needs a layout that places what stands in for it', () => {
		assert.throws(
			() => genre('r71g.pkg:genre/g', { name: 'G', family: 'test', omitWidgets: [coreWidgets.conversation] }),
			/omits the conversation — ship a layout/,
		)
		assert.throws(
			() =>
				genre('r71g2.pkg:genre/g', {
					name: 'G2',
					family: 'test',
					omitWidgets: [coreWidgets.conversation],
					layouts: [layout({ slug: 'default', name: 'G2', preset: {} })],
				}),
			/omits the conversation — ship a layout/,
			'a layout that draws nothing places nothing',
		)
		const ok = genre('r71h.pkg:genre/h', {
			name: 'H',
			family: 'test',
			omitWidgets: [coreWidgets.conversation],
			layouts: [layout({ slug: 'default', name: 'H', preset: middle('board') })],
		})
		assert.equal(ok.layouts?.[0]?.slug, 'default')
		// Placement is free: the widget standing in may sit in a side.
		const side = genre('r71h2.pkg:genre/h', {
			name: 'H2',
			family: 'test',
			omitWidgets: [coreWidgets.conversation],
			layouts: [layout({ slug: 'default', name: 'H2', preset: right('board') })],
		})
		assert.equal(side.layouts?.[0]?.slug, 'default')
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
		// A copy of an omitted widget is still that widget.
		assert.throws(
			() =>
				genre('r71i2.pkg:genre/i', {
					name: 'I2',
					family: 'test',
					omitWidgets: [coreWidgets.worldState],
					layouts: [layout({ slug: 'default', name: 'I2', preset: right('world-state#2') })],
				}),
			/places 'world-state#2', which the genre omits/,
		)
		// A layout is a session layout, checked where it is declared.
		assert.throws(() => layout({ slug: 'x', name: 'X', preset: { widgetGrid: { version: 2 } } as never }), /layout 'x' preset: widgetGrid/)
		assert.throws(
			() => layout({ slug: 'x', name: 'X', preset: right('Board') }),
			/'Board' is not a widget instance id/,
		)
		// …and a retired LayoutDoc v2 is not one: no back-compat reader.
		assert.throws(
			() => layout({ slug: 'x', name: 'X', preset: { layout: { version: 2, zones: {} } } as never }),
			/a retired layout document \(LayoutDoc v2: layout\)/,
		)
	})

	test('a widget may cap its instances; the cap is a positive whole number', () => {
		assert.equal(widget({ id: 'bus', title: 'Bus', component: 'bus', maxInstances: 1 }).maxInstances, 1)
		assert.throws(() => widget({ id: 'bus', title: 'Bus', component: 'bus', maxInstances: 0 }), /maxInstances: a positive whole number/)
		assert.throws(() => widget({ id: 'bus', title: 'Bus', component: 'bus', maxInstances: 1.5 }), /maxInstances/)
	})
})

describe('the packager', () => {
	test("puts the package's own widgets under its namespace in the layouts it ships — the widget half of an instance id only", () => {
		const board = widget({ id: 'board', title: 'Board', component: 'board' })
		const map = widget({ id: 'map', title: 'Map', component: 'map' })
		const g = genre('r71k.pkg:genre/k', {
			name: 'K',
			family: 'test',
			layouts: [
				layout({
					slug: 'default',
					name: 'K',
					preset: {
						zoneLayout: {
							version: 1,
							zones: {
								left: { kind: 'side', side: 'left', widgets: ['map#north', 'stats'] },
								right: { kind: 'side', side: 'right', widgets: ['messages#sanctum'] },
							},
						},
						widgetGrid: {
							version: 1,
							cell: 44,
							widgets: [
								{ id: 'board', zone: 'middle', order: 0, size: { w: 'grow', h: 'grow' }, anchor: all, group: 'g:board+world-state' },
								{ id: 'world-state', zone: 'middle', order: 1, size: { w: 'grow', h: 'fixed' }, anchor: {}, group: 'g:board+world-state' },
							],
						},
						arrangedGrid: {
							left: {
								cols: 1,
								rows: 4,
								items: [
									{ id: 'map#north', x: 0, y: 0, w: 1, h: 2, group: 'g:map#north+stats' },
									{ id: 'stats', x: 0, y: 2, w: 1, h: 2, group: 'g:map#north+stats' },
								],
							},
						},
						widgetSettings: { board: { zoom: 'fit' }, 'map#north': { floor: 1 }, stats: { compact: true }, 'messages#sanctum': { channel: 'sanctum' } },
						widgetStyles: { 'map#north': { slug: 'map:parchment' }, stats: { slug: 'stats:default' } },
					},
				}),
			],
		})
		// The packager reads a built extension; a genre with no create pipeline
		// would not get this far, and the layouts are all this test is about.
		const e = { slug: 'r71k.pkg', widgets: [board, map], genres: [g] } as unknown as Parameters<typeof genreLayouts>[0]
		const [out] = genreLayouts(e)
		assert.equal(out?.genreId, 'r71k.pkg:genre/k')
		const p = out!.preset
		assert.deepEqual(p.zoneLayout?.zones.left?.widgets, ['r71k.pkg:map#north', 'stats'])
		assert.deepEqual(p.zoneLayout?.zones.right?.widgets, ['messages#sanctum'], "core's copies are never namespaced")
		assert.deepEqual(
			p.widgetGrid?.widgets.map((w) => [w.id, w.group]),
			[
				['r71k.pkg:board', 'g:r71k.pkg:board+world-state'],
				['world-state', 'g:r71k.pkg:board+world-state'],
			],
		)
		assert.deepEqual(
			p.arrangedGrid?.left?.items.map((i) => [i.id, i.group]),
			[
				['r71k.pkg:map#north', 'g:r71k.pkg:map#north+stats'],
				['stats', 'g:r71k.pkg:map#north+stats'],
			],
		)
		assert.deepEqual(Object.keys(p.widgetSettings ?? {}), ['r71k.pkg:board', 'r71k.pkg:map#north', 'stats', 'messages#sanctum'])
		assert.deepEqual(Object.keys(p.widgetStyles ?? {}), ['r71k.pkg:map#north', 'stats'])
		// The genre's own declaration is untouched: the manifest carries the copy.
		assert.deepEqual(g.layouts?.[0]?.preset.zoneLayout?.zones.left?.widgets, ['map#north', 'stats'])
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

	test("the package pass: a genre withholding the conversation draws its package's role: 'primary' widget", () => {
		const omitting = (id: string, preset: SessionLayoutV1) =>
			genre(`r71n.pkg:genre/${id}`, {
				name: id,
				family: 'test',
				omitWidgets: [coreWidgets.conversation],
				layouts: [layout({ slug: 'default', name: id, preset })],
			})
		const board = widget({ id: 'board', title: 'Board', component: 'board', role: 'primary' })
		const tray = widget({ id: 'tray', title: 'Tray', component: 'tray' })
		const widgets = [board, tray]
		// genre() alone lets a layout that draws only `stats` through …
		const statsOnly = omitting('stats-only', right('stats'))
		// … and the package, which holds the declarations, refuses it.
		const refused = genreLayoutFindings([statsOnly], widgets, 'r71n.pkg')
		assert.equal(refused.errors.length, 1)
		assert.match(
			refused.errors[0]!,
			/omits the conversation, and its layout 'default' draws none of this package's role: 'primary' widgets \(it draws 'stats'\)/,
		)
		assert.equal(genreLayoutFindings([omitting('tray', middle('tray'))], widgets, 'r71n.pkg').errors.length, 1, 'a secondary widget is no stand-in')
		// The primary, anywhere, under either spelling — or a copy of it.
		for (const [n, preset] of [middle('board'), right('board#2'), right('r71n.pkg:board')].entries())
			assert.deepEqual(genreLayoutFindings([omitting(`ok-${n}`, preset)], widgets, 'r71n.pkg').errors, [], JSON.stringify(preset))
		// Another package's widget is that package's to declare.
		assert.deepEqual(genreLayoutFindings([omitting('foreign', right('other.pkg:board'))], widgets, 'r71n.pkg').errors, [])
		// A package that states no widgets is not judged.
		assert.deepEqual(genreLayoutFindings([statsOnly], undefined, 'r71n.pkg').errors, [])
	})

	test('the package pass warns what a shipped layout draws otherwise — its widget over maxInstances included', () => {
		const bus = widget({ id: 'bus', title: 'Bus', component: 'bus', maxInstances: 1 })
		const g = genre('r71o.pkg:genre/o', {
			name: 'O',
			family: 'test',
			layouts: [
				layout({
					slug: 'default',
					name: 'O',
					preset: {
						...middle('messages'),
						zoneLayout: { version: 1, zones: { right: { kind: 'side', side: 'right', widgets: ['bus', 'bus#2', 'stats', 'stats#2'] } } },
					},
				}),
			],
		})
		const found = declarationFindings({ ns: 'r71o.pkg', genres: [g], widgets: [bus] })
		assert.deepEqual(found.warnings, [
			"r71o.pkg:genre/o layout 'default': 'bus' is placed 2 times, over its maxInstances (1) — readers draw the first 1",
		])
		// Placed but never drawn, with no widget declared at all.
		const shadowed = genre('r71p.pkg:genre/p', {
			name: 'P',
			family: 'test',
			layouts: [
				layout({
					slug: 'default',
					name: 'P',
					preset: { ...middle('messages'), arrangedGrid: { middle: { cols: 1, rows: 1, items: [{ id: 'stats', x: 0, y: 0, w: 1, h: 1 }] } } },
				}),
			],
		})
		assert.deepEqual(genreLayoutFindings([shadowed], undefined, 'r71p.pkg').warnings, [
			"r71p.pkg:genre/p layout 'default': 'messages' is placed in the middle but never drawn — the middle's arrangement draws there, and it does not place 'messages'",
		])
	})

	test('one owner registry per process, whatever copy of the SDK asks', () => {
		const shared = (globalThis as Record<symbol, { owners: WeakMap<object, string> }>)[Symbol.for('serene-pub.widget-owners')]
		assert.equal(shared?.owners.get(coreWidgets.stats), 'core')
	})
})
