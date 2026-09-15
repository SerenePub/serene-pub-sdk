/**
 * Declared UI surfaces, and the preview manifest the harness reads from them
 * (10, 20 §12, 21 §7). Two properties are worth a suite of their own:
 *
 *   1. The harness renders what a package **announces**, so a surface visible
 *      in `serene-pub ui` is a surface an instance would be offered. If these
 *      two lists could disagree, the harness would be a second source of truth
 *      — which is the failure the whole declaration discipline exists to stop.
 *   2. Reading is **tolerant**. A half-typed entry path is a problem beside the
 *      list, never an exception that empties it. The app reads stored manifests
 *      the same way, and a dev tool that dies on a keystroke gets closed.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	announce,
	AnnouncementError,
	component,
	defineExtension,
	genre,
	isServableEntry,
	isServablePanelId,
	previewManifest,
	sessionEvents,
	spec,
	ENTRY_CANDIDATES,
	FRAME_PROTOCOL,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const dice = () => announce({ ns: 'acme.dice', author: 'acme', title: 'Dice Tray' })

const withSurfaces = () =>
	dice().surfaces({
		'session-view': { entry: 'ui/session.html', title: 'Crawl view' },
		page: { entry: 'ui/index.html', title: 'Dashboard' },
		panels: [
			{ id: 'tray', entry: 'ui/tray.html', title: 'Dice tray', channels: ['dice'] },
			{ id: 'log', entry: 'ui/log.html', title: 'Roll log' },
		],
	})

describe('announce().surfaces (20 §12, 21 §7)', () => {
	test('frame surfaces ride the announcement document', () => {
		const { document } = withSurfaces().build()
		assert.equal(document.surfaces?.['session-view']?.entry, 'ui/session.html')
		assert.equal(document.surfaces?.panels?.length, 2)
		assert.deepEqual(document.surfaces?.panels?.[0]?.channels, ['dice'])
	})

	test('the keys are spelled the way the instance reads them', () => {
		// A regression pin, not a tautology. `sessionView` compiled, previewed
		// and installed cleanly, and then never mounted: the app's
		// `frameHost.surfacesOf` reads `raw['session-view']`, and because the
		// announcement IS the manifest (24 §6) there is no layer in between to
		// translate. If this test fails, check `surfacesOf` before changing it.
		const { document } = withSurfaces().build()
		assert.deepEqual(Object.keys(document.surfaces ?? {}).sort(), [
			'page',
			'panels',
			'session-view',
		])
		assert.equal((document.surfaces as Record<string, unknown>).sessionView, undefined)
	})

	test('a package with no UI carries no surfaces key at all', () => {
		const { document } = dice().build()
		assert.equal(document.surfaces, undefined)
		assert.deepEqual(document.components, [])
	})

	test('two panels with one id refuse — the id is the layout key', () => {
		assert.throws(
			() =>
				dice()
					.surfaces({
						panels: [
							{ id: 'tray', entry: 'a.html' },
							{ id: 'tray', entry: 'b.html' },
						],
					})
					.build(),
			(e: unknown) =>
				e instanceof AnnouncementError && /duplicate panel id 'tray'/.test(e.message),
		)
	})

	test('a surface with no document refuses at authoring time', () => {
		assert.throws(
			() =>
				dice()
					.surfaces({ page: { entry: '' } })
					.build(),
			/surfaces.page has no entry document/,
		)
		assert.throws(
			() =>
				dice()
					.surfaces({ panels: [{ id: 'x', entry: '' }] })
					.build(),
			/surfaces.panels\[0\] has no entry document/,
		)
	})

	test('components are validated on the same terms as defineExtension', () => {
		const ok = component({
			surface: 'core:surface/settings-section@1',
			slug: 'dice-settings',
			label: 'Dice settings',
			framework: 'svelte',
			entry: 'src/Settings.svelte',
		})
		assert.equal(dice().components(ok).build().document.components.length, 1)
		assert.throws(
			() =>
				dice()
					.components(ok, { ...ok })
					.build(),
			/duplicate component slug 'dice-settings'/,
		)
		assert.throws(
			() =>
				dice()
					.components({ ...ok, entry: '' })
					.build(),
			/has no entry/,
		)
	})
})

describe('previewManifest — what the harness renders', () => {
	test('reads an announce builder without the author compiling first', () => {
		const m = previewManifest(withSurfaces())
		assert.equal(m.id, 'acme.dice')
		assert.equal(m.title, 'Dice Tray')
		assert.deepEqual(
			m.targets.map((t) => t.id),
			['session-view', 'page', 'panel-tray', 'panel-log'],
		)
		assert.deepEqual(m.problems, [])
	})

	test('reads a compiled document identically — the harness does not care which', () => {
		const built = previewManifest(withSurfaces().build().document)
		const fromBuilder = previewManifest(withSurfaces())
		assert.deepEqual(built.targets, fromBuilder.targets)
	})

	test('a panel carries its id and its lanes, because the host scopes on them', () => {
		const tray = previewManifest(withSurfaces()).targets.find((t) => t.id === 'panel-tray')
		assert.equal(tray?.kind, 'frame')
		assert.equal(tray?.point, 'panel')
		assert.equal(tray?.panelId, 'tray')
		assert.deepEqual(tray?.channels, ['dice'])
		assert.equal(tray?.source, 'surfaces')
	})

	test('components come through with their point and framework', () => {
		const m = previewManifest(
			dice().components(
				component({
					surface: 'core:surface/settings-section@1',
					slug: 'dice-settings',
					label: 'Dice settings',
					framework: 'svelte',
					entry: 'src/Settings.svelte',
				}),
			),
		)
		assert.deepEqual(m.targets, [
			{
				id: 'dice-settings',
				label: 'Dice settings',
				kind: 'component',
				point: 'core:surface/settings-section@1',
				entry: 'src/Settings.svelte',
				framework: 'svelte',
				settings: undefined,
				source: 'components',
			},
		])
	})

	test('a defineExtension entry works too — one harness, both authoring surfaces', () => {
		const ext = defineExtension({
			slug: 'acme.dice',
			name: 'Dice Tray',
			version: '1.2.0',
			components: [
				component({
					surface: 'core:surface/composer-action@1',
					slug: 'roll',
					label: 'Roll',
					framework: 'vanilla',
					entry: 'dist/ui/roll.js',
				}),
			],
		})
		const m = previewManifest(ext)
		assert.equal(m.id, 'acme.dice')
		assert.equal(m.version, '1.2.0')
		assert.equal(m.targets[0]?.framework, 'vanilla')
	})

	test('a frame panel declared by a genre shape is a surface too (21 §6)', () => {
		const g = genre('acme.dice:genre/crawl', {
			name: { en: 'Crawl' },
			family: 'chat',
			shape: {
				panels: [
					{
						id: 'map',
						title: 'Map',
						surface: { kind: 'frame', pluginId: 'acme.dice', entry: 'ui/map.html' },
						channels: ['map'],
					},
					{ id: 'log', title: 'Log', surface: { kind: 'native', component: 'log' } },
				],
			},
		})
		const built = dice()
			.genres({ crawl: g })
			.pipelines(
				spec('acme.dice:spec/create', { version: '1.0.0' })
					.input('input', C.userMessage.v1(), {
						genre: g,
						event: sessionEvents.sessionCreated,
					})
					.build(),
			)
		const m = previewManifest(built)
		assert.deepEqual(
			m.targets.map((t) => [t.id, t.source, t.entry]),
			[['panel-map', 'genre-shape', 'ui/map.html']],
		)
		assert.deepEqual(m.targets[0]?.channels, ['map'])
	})
})

describe('previewManifest reads tolerantly', () => {
	test('a malformed declaration is a problem, not a thrown harness', () => {
		// Hand-built rather than announced: announce() refuses these at
		// authoring time, and this is the second line — someone hand-edits an
		// announcement.json, and the harness still has to open.
		const m = previewManifest({
			schemaVersion: 1,
			identity: { ns: 'acme.dice', title: 'Dice' },
			genres: [],
			components: [{ slug: 'no-entry', label: 'x', surface: 's', framework: 'svelte' }],
			surfaces: {
				page: {},
				panels: [{ entry: 'ui/a.html' }, { id: 'ok', entry: 'ui/b.html' }],
			},
		})
		assert.deepEqual(
			m.targets.map((t) => t.id),
			['panel-ok'],
		)
		assert.equal(m.problems.length, 3)
		assert.match(m.problems.join('\n'), /surfaces.page: no entry/)
		assert.match(m.problems.join('\n'), /surfaces.panels\[0\]: no id/)
		assert.match(m.problems.join('\n'), /components\[0\]: no entry/)
	})

	test('an announcement that refuses to build still opens the harness', () => {
		const m = previewManifest(dice().surfaces({ panels: [{ id: 'a', entry: '' }] }))
		assert.deepEqual(m.targets, [])
		assert.equal(m.id, 'acme.dice')
		assert.match(m.problems[0] ?? '', /announcement refused/)
	})

	test('a null in the middle of a hand-edited document is survivable', () => {
		// The tolerance contract is not "most shapes": a null genre or a null
		// panel is what a half-finished hand edit of announcement.json looks
		// like, and dereferencing one used to throw straight through the
		// harness. The problems list may be empty here — nothing is claimed
		// about *reporting* nulls, only about surviving them.
		const m = previewManifest({
			schemaVersion: 1,
			identity: { ns: 'acme.dice', title: 'Dice' },
			genres: [null, { id: 'acme.dice:genre/x', shape: { panels: [null] } }],
			components: [null],
			surfaces: { panels: [null, { id: 'ok', entry: 'ui/ok.html' }] },
		})
		assert.deepEqual(
			m.targets.map((t) => t.id),
			['panel-ok'],
		)
	})

	test('an unrecognised default export says what to export', () => {
		const m = previewManifest({ hello: 'world' })
		assert.deepEqual(m.targets, [])
		assert.match(m.problems[0] ?? '', /no default export this harness recognises/)
	})

	test('colliding ids are disambiguated rather than silently dropped', () => {
		// Both ids are ones an instance accepts; they only collide once
		// slugified for the URL, and the harness must still show both.
		const m = previewManifest({
			schemaVersion: 1,
			identity: { ns: 'acme.dice', title: 'Dice' },
			genres: [],
			components: [],
			surfaces: {
				panels: [
					{ id: 'tray-x', entry: 'a.html' },
					{ id: 'tray_x', entry: 'b.html' },
				],
			},
		})
		assert.deepEqual(
			m.targets.map((t) => t.id),
			['panel-tray-x', 'panel-tray-x-2'],
		)
	})

	test('what an instance would drop is reported, not previewed', () => {
		// The whole point of the harness is that these two lists agree. Core
		// refuses these *silently* — `surfacesOf` just skips the surface — so
		// showing them would be the harness inventing a surface that cannot
		// exist. Grammar mirrored from the app's `isSafeUiPath` and its
		// panel-id test.
		const m = previewManifest({
			schemaVersion: 1,
			identity: { ns: 'acme.dice', title: 'Dice' },
			genres: [],
			components: [],
			surfaces: {
				page: { entry: '/absolute.html' },
				panels: [
					{ id: 'ok', entry: 'ui/fine.html' },
					{ id: 'Shouty', entry: 'ui/a.html' },
					{ id: 'escape', entry: '../outside.html' },
				],
			},
		})
		assert.deepEqual(
			m.targets.map((t) => t.id),
			['panel-ok'],
		)
		const said = m.problems.join('\n')
		assert.match(said, /'\/absolute\.html' is not a path an instance will serve/)
		assert.match(said, /panel id 'Shouty' is not one an instance accepts/)
		assert.match(said, /'\.\.\/outside\.html' is not a path an instance will serve/)
	})

	test('the grammar is exported so a packager can ask the same question', () => {
		assert.equal(isServableEntry('ui/map.html'), true)
		assert.equal(isServableEntry('a/b/c.js'), true)
		assert.equal(isServableEntry('/leading.html'), false)
		assert.equal(isServableEntry('../up.html'), false)
		assert.equal(isServableEntry('a/./b.html'), false)
		assert.equal(isServablePanelId('map_2-b'), true)
		assert.equal(isServablePanelId('Map'), false)
		assert.equal(isServablePanelId('map panel'), false)
	})
})

describe('one toolchain, one set of conventions', () => {
	test('the entry search order is shared, not re-listed per tool', () => {
		// `serene-pub build` and the harness look in the same places, in the
		// same order — "the harness found my plugin but the packager didn't"
		// is not a bug anyone should be able to have.
		assert.deepEqual(
			[...ENTRY_CANDIDATES],
			['dist/index.js', 'src/index.ts', 'index.ts', 'index.js'],
		)
	})

	test('the frame protocol version is declared once', () => {
		// 2 since the frame → host direction gained error, request and
		// save-state. A v1 frame is still valid: it simply never sends them,
		// and `init` accepts either version — the number says what a frame
		// *may* send, not what it must.
		assert.equal(FRAME_PROTOCOL, 2)
	})
})
