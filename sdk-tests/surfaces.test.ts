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
	panelToWidgetDecl,
	parsePluginWidgetId,
	pluginWidgetId,
	WIDGET_PROTOCOL,
	type FrameHostMessage,
	type HostFrameMessage,
	type WidgetEvent,
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
				point: 'widget',
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
				],
			},
		})
		const built = dice()
			.genres({ crawl: g })
			.pipelines(
				spec('acme.dice:spec/create', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1(), {
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
			components: [{ slug: 'no-entry', label: 'x', framework: 'svelte' }],
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

describe('a panel IS a widget (panelToWidgetDecl)', () => {
	test('every field a panel declares has a home on the widget declaration', () => {
		const decl = panelToWidgetDecl('acme.dice', {
			id: 'tray',
			entry: 'ui/tray.html',
			title: 'Dice tray',
			channels: ['dice'],
			settings: { sides: { type: 'number', default: 6 } },
		})
		assert.deepEqual(decl, {
			id: 'tray',
			title: 'Dice tray',
			role: 'secondary',
			surface: { kind: 'frame', pluginId: 'acme.dice', entry: 'ui/tray.html' },
			channels: ['dice'],
			settings: { sides: { type: 'number', default: 6 } },
		})
	})

	test('an untitled panel is titled by its id, and declares no keys it was not given', () => {
		const decl = panelToWidgetDecl('acme.dice', { id: 'tray', entry: 'ui/tray.html' })
		assert.equal(decl.title, 'tray')
		// Absent, not empty: a host reading `channels` must be able to tell
		// "every lane" from "the lanes this panel named", and `[]` says the
		// second while meaning the first.
		assert.equal('channels' in decl, false)
		assert.equal('settings' in decl, false)
	})

	test('the declared channels are copied, never shared', () => {
		const channels = ['dice']
		const decl = panelToWidgetDecl('acme.dice', {
			id: 'tray',
			entry: 'ui/tray.html',
			channels,
		})
		channels.push('main')
		assert.deepEqual(decl.channels, ['dice'])
	})
})

describe('a plugin widget id is namespaced (pluginWidgetId / parsePluginWidgetId)', () => {
	test("the projection's bare id is the package's, the seated id is namespaced", () => {
		const decl = panelToWidgetDecl('acme.dice', { id: 'tray', entry: 'ui/tray.html' })
		// The two halves of the contract, in one test: the SDK projects what
		// the package wrote, and the host seats it under an id no other
		// package can also have written.
		assert.equal(decl.id, 'tray')
		assert.equal(pluginWidgetId('acme.dice', decl.id), 'acme.dice:tray')
	})

	test('a namespaced id round-trips, whichever legal shape either half takes', () => {
		for (const [pluginId, panelId] of [
			['acme.dice', 'tray'],
			['chariot.dice-tray', 'map'],
			['showcase.twenty-questions', 'tally_2'],
			['a', 'b'],
		]) {
			const id = pluginWidgetId(pluginId, panelId)
			assert.deepEqual(parsePluginWidgetId(id), { pluginId, panelId })
		}
	})

	test('an id no plugin could have produced is not read as one', () => {
		// Core and genre widgets keep plain ids and must come back null —
		// this is the test for "is this widget a plugin's", so a false
		// positive here seats a core widget against a plugin that does not
		// exist.
		for (const id of [
			'conversation',
			'scene-portraits',
			'',
			':tray',
			'acme.dice:',
			// Two colons: the second lands in the panel half, which refuses
			// it — a surprising panel is worse than no answer.
			'acme.dice:tray:extra',
			// A slash is the genre/type grammar, never a panel id.
			'core:genre/chat',
			// Neither half may carry case or spaces.
			'Acme.Dice:tray',
			'acme.dice:Tray',
			'acme dice:tray',
		])
			assert.equal(parsePluginWidgetId(id), null, id)
	})

	test('the halves it accepts are exactly the halves an instance serves', () => {
		// Pinned against the grammars the app drops a surface by, so the two
		// cannot drift into "the harness previewed it, the instance seated it
		// under something else".
		const parsed = parsePluginWidgetId('acme.dice:tray')!
		assert.equal(isServablePanelId(parsed.panelId), true)
		assert.equal(parsePluginWidgetId('acme.dice:tray!'), null)
	})
})

describe('the frame protocol is one union, exhaustively', () => {
	// A `switch` over `t` whose default asserts `never`. It compiles only while
	// every member is handled, so a member added to either union without a
	// reader here is a build failure rather than a message some host silently
	// drops.
	test('every host → frame member is accounted for', () => {
		const seen: string[] = []
		const read = (m: HostFrameMessage): string => {
			switch (m.t) {
				case 'init':
					return `init@${m.protocol}`
				case 'session':
					return `session#${m.session.id}`
				case 'messages':
				case 'channel':
					return `${m.t}:${m.messages.length}`
				case 'message':
					return `message#${m.message.id}`
				case 'props':
				case 'settings':
					return `${m.t}:${Object.keys(m.t === 'props' ? m.props : m.settings).length}`
				case 'style':
					return `style:${m.css.length}`
				case 'layout':
					return `layout:${m.layout.tier}`
				case 'event':
					return `event:${m.event.kind}`
				case 'actions':
					return `actions:${Object.keys(m.actions).length}`
				case 'theme':
					return `theme:${m.mode}`
				case 'suspend':
				case 'resume':
					return m.t
				case 'page':
					return `page:${m.rows.length}`
				case 'state':
					return `state:${Object.keys(m.state).length}`
				case 'annex':
					return `annex:${Object.keys(m.annex).length}`
				case 'locale':
					return `locale:${m.locale}`
				case 'response':
					return `response:${m.ok}`
				case 'strings':
					return `strings:${Object.keys(m.strings).length}`
				case 'viewer':
					return `viewer:${m.viewer.isAdmin}`
				case 'turn-order':
					return `turn-order:${m.turnOrder.order.length}`
				case 'scoped':
					return `scoped:${m.section}`
				case 'grants':
					return `grants:${m.grants.length}`
				default: {
					const never: never = m
					return String(never)
				}
			}
		}
		seen.push(read({ t: 'init', protocol: FRAME_PROTOCOL, surface: 'panel' }))
		seen.push(read({ t: 'session', session: { id: 7, name: null } }))
		seen.push(read({ t: 'suspend' }))
		assert.deepEqual(seen, ['init@2', 'session#7', 'suspend'])
	})

	test('every frame → host member is accounted for', () => {
		const read = (m: FrameHostMessage): string => {
			switch (m.t) {
				case 'ready':
					return 'ready'
				case 'action':
					return `action:${m.fn}`
				case 'invoke':
					return `invoke:${m.key}`
				case 'error':
					return `error:${m.message}`
				case 'request':
					return `request:${m.what}`
				case 'save-state':
					return `save-state:${Object.keys(m.state).length}`
				case 'translate':
					return `translate:${m.sources.length}`
				default: {
					const never: never = m
					return String(never)
				}
			}
		}
		assert.equal(read({ t: 'invoke', key: 'roll' }), 'invoke:roll')
		assert.equal(read({ t: 'ready' }), 'ready')
	})

	test('native and frame report ONE protocol number', () => {
		// Native is frame minus the iframe, so a second clock for the
		// in-document lane would be a second contract by accident.
		assert.equal(WIDGET_PROTOCOL, FRAME_PROTOCOL)
	})
})

describe('the widget event union narrows', () => {
	test('a custom kind is namespaced, and the union still discriminates', () => {
		const describeEvent = (e: WidgetEvent): string => {
			switch (e.kind) {
				// `messageId` is reachable here ONLY because the union still
				// discriminates — a bare `{ kind: string }` member widened it
				// back to "any string" and took every other member's narrowing
				// with it.
				case 'message:created':
					return `${e.channel}#${e.messageId} lane ${e.lane}`
				case 'layout:changed':
					return `layout ${e.layout.tier}`
				default:
					return e.kind
			}
		}
		assert.equal(
			describeEvent({
				kind: 'message:created',
				channel: 'dice',
				slug: 'dice',
				lane: 1,
				messageId: 3,
			}),
			'dice#3 lane 1',
		)
		assert.equal(describeEvent({ kind: 'custom:acme.rolled' }), 'custom:acme.rolled')
	})
})
