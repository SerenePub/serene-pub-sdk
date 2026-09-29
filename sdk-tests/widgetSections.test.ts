/**
 * R21 lane 0 (2026-09-25): the widget contract's shared seams.
 *
 *  - ONE table of scoped sections (C5 L3, design F3) — every other spelling
 *    derived from it, `session:state` (R72) among them, and the component
 *    wire's receiver taking what the table names;
 *  - `WidgetDecl.reads` (R75) — the base sections a widget reads, all of them
 *    when it names none, a name outside them refused where it is declared;
 *  - who may ask what (F9) — `WIDGET_REQUEST_ASKERS`, the marking a host
 *    enforces, with the five 🚧 kinds the state, portrait and lore widgets
 *    ask;
 *  - core's per-component surface switch — every core component still
 *    native, one entry to flip per port;
 *  - core's widgets declaring what their native versions read (R75) and the
 *    scopes their ports need, and reading their scoped sections through the
 *    shared widget ref, typed by the table.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { mountComponent } from './harnessGuard.js'
import {
	WIDGET_BASE_SECTIONS,
	WIDGET_REQUEST_ASKERS,
	WIDGET_REQUEST_KINDS,
	WIDGET_SCOPED_SECTIONS,
	component,
	createComponentContext,
	declarationFindings,
	isWidgetScopedSectionName,
	resolveWidgetSurface,
	widget,
	widgetDeclsFindings,
	widgetReads,
	widgetReadsFindings,
	widgetRequestRefusal,
	type ComponentPort,
	type ComponentSections,
	type SessionCharactersV1,
	type SessionStateV1,
	type WidgetData,
	type WidgetRequests,
	type WidgetScope,
	type WidgetScopedSectionName,
} from '../sdk/src/index.js'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'

// ── Types, held by the compiler (this file is in the suite's `tsc`) ─────────

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const typed = <T extends true>(_: T) => {}
typed<Same<WidgetScopedSectionName, 'session_full' | 'session_state' | 'persona' | 'characters' | 'lore'>>(true)
typed<Same<NonNullable<WidgetData['session_state']>, { v1: SessionStateV1 }>>(true)
typed<Same<NonNullable<WidgetData['characters']>, { v1: SessionCharactersV1 }>>(true)
typed<Same<ComponentSections['scoped']['session_state'], SessionStateV1 | undefined>>(true)
typed<Same<Extract<WidgetScope, 'session:state'>, 'session:state'>>(true)
typed<Same<WidgetRequests['set-entry-marks']['result'], { off: boolean; pinned: boolean }>>(true)
// The search box's words are `titleOrKey` — never `query`, which the node kind owns (a retired word).
typed<Same<keyof WidgetRequests['session-entries']['params'], 'titleOrKey' | 'sort' | 'filter' | 'typeIds' | 'offset' | 'limit'>>(true)

describe('the one table of scoped sections', () => {
	test('names each scope and the section it is posted as — session:state among them (R72)', () => {
		assert.deepEqual(WIDGET_SCOPED_SECTIONS, {
			'session:full': 'session_full',
			'session:state': 'session_state',
			persona: 'persona',
			characters: 'characters',
			lore: 'lore',
		})
		assert.ok(Object.isFrozen(WIDGET_SCOPED_SECTIONS))
	})

	test('a posted name is recognised; a scope key, a base section or junk is not', () => {
		for (const name of Object.values(WIDGET_SCOPED_SECTIONS)) assert.equal(isWidgetScopedSectionName(name), true, name)
		for (const other of ['session:full', 'session:state', 'messages', 'sessionFull', '', 7, null])
			assert.equal(isWidgetScopedSectionName(other), false, String(other))
	})

	test("the component wire's receiver takes every section the table names, and nothing else", () => {
		let deliver: ((e: { data: unknown }) => void) | null = null
		const port: ComponentPort = {
			set onmessage(fn: ((e: never) => void) | null) {
				deliver = fn as never
			},
			get onmessage() {
				return deliver as never
			},
			postMessage() {},
			close() {},
		}
		const ctx = createComponentContext(port)
		const heard: string[] = []
		ctx.subscribe((s) => heard.push(s))
		const state: SessionStateV1 = {
			sessionId: 3,
			loaded: true,
			error: null,
			resolved: { world: { 'core:weather': 'rain' }, cast: {} },
			slots: [],
			owners: [{ key: 'world', kind: 'session', id: 3, label: 'World', configs: {} }],
		}
		deliver!({ data: { t: 'scoped', section: 'session_state', value: state } })
		assert.deepEqual(ctx.scoped.session_state, state)
		// A name no table carries is not a section a widget can hold.
		deliver!({ data: { t: 'scoped', section: 'sessionFull', value: { x: 1 } } })
		assert.deepEqual(Object.keys(ctx.scoped), ['session_state'])
		// `null` withdraws it: the grant went away.
		deliver!({ data: { t: 'scoped', section: 'session_state', value: null } })
		assert.equal(ctx.scoped.session_state, undefined)
		assert.deepEqual(heard, ['scoped', 'scoped', 'scoped'])
		ctx.close()
	})

	test("the receiver takes the host's `grants`: unknown until said, then each declared scope granted or not, and a withdrawal heard", () => {
		let deliver: ((e: { data: unknown }) => void) | null = null
		const port: ComponentPort = {
			set onmessage(fn: ((e: never) => void) | null) {
				deliver = fn as never
			},
			get onmessage() {
				return deliver as never
			},
			postMessage() {},
			close() {},
		}
		const ctx = createComponentContext(port)
		const heard: string[] = []
		ctx.subscribe((s) => heard.push(s))
		// Before the host says, nobody knows: neither granted nor refused.
		assert.equal(ctx.grants, undefined)
		assert.equal(ctx.granted('session:state'), undefined)
		deliver!({ data: { t: 'grants', grants: ['session:state', 'widget:lore', 'nonsense', 7] } })
		// Only a scope the table names is kept — never a permission key, never a stranger.
		assert.deepEqual(ctx.grants, ['session:state'])
		assert.equal(ctx.granted('session:state'), true)
		assert.equal(ctx.granted('session:full'), false)
		// Withdrawn: an admin revoked it while the widget was open.
		deliver!({ data: { t: 'grants', grants: [] } })
		assert.deepEqual(ctx.grants, [])
		assert.equal(ctx.granted('session:state'), false)
		// A malformed message says nothing new.
		deliver!({ data: { t: 'grants', grants: 'session:state' } })
		assert.deepEqual(ctx.grants, [])
		assert.deepEqual(heard, ['grants', 'grants'])
		ctx.close()
	})
})

describe('reads (R75)', () => {
	test('the base sections are the envelope’s, in its order', () => {
		assert.deepEqual(WIDGET_BASE_SECTIONS, [
			'layout',
			'session',
			'channels',
			'messages',
			'props',
			'actions',
			'settings',
			'annex',
			'locale',
			'viewer',
			'turnOrder',
		])
	})

	test('a widget that names none reads every base section; one that names some reads those', () => {
		assert.deepEqual(widgetReads({}), WIDGET_BASE_SECTIONS)
		assert.deepEqual(widgetReads({ reads: ['settings'] }), ['settings'])
		assert.deepEqual(widgetReads({ reads: [] }), [])
	})

	test('what a host is told a widget reads is clamped to the base sections — an install stores `reads` verbatim', () => {
		// A scoped name, a prototype name, junk and a repeat never come back as base sections.
		const stored = { reads: ['session_full', '__proto__', 'messages', 7, 'settings', 'messages'] as never }
		assert.deepEqual(widgetReads(stored), ['messages', 'settings'])
		assert.deepEqual(widgetReads({ reads: ['session_state', 'lore'] as never }), [])
		// Not a list is not a declaration: absent, so all.
		assert.deepEqual(widgetReads({ reads: 'messages' as never }), WIDGET_BASE_SECTIONS)
	})

	test('a name outside the base sections is refused, a scoped one pointed at `scopes`', () => {
		assert.deepEqual(widgetReadsFindings(undefined, 'x'), [])
		assert.deepEqual(widgetReadsFindings(['settings', 'messages'], 'x'), [])
		const [unknown] = widgetReadsFindings(['mesages'], "widget 'w' reads")
		assert.match(unknown!, /^widget 'w' reads: 'mesages' is not a base section — one of 'layout', /)
		assert.match(widgetReadsFindings(['session_state'], 'x')[0]!, /'session_state' is a scoped section — ask for it in `scopes`/)
		assert.match(widgetReadsFindings('settings', 'x')[0]!, /a list of base section names/)
	})

	test('widget(), a genre panel and a package widget all refuse it', () => {
		assert.throws(
			() => widget({ id: 'tray', title: 'Tray', component: 'tray', reads: ['log' as never] }),
			/widget 'tray' reads: 'log' is not a base section/,
		)
		assert.doesNotThrow(() => widget({ id: 'tray', title: 'Tray', component: 'tray', reads: ['settings'] }))
		assert.match(
			widgetDeclsFindings([{ id: 'p', title: 'P', component: 'p', reads: ['log'] }], 'g.shape.panels').join(' '),
			/g\.shape\.panels\[p\]\.reads: 'log' is not a base section/,
		)
		const { errors } = declarationFindings({
			ns: 'acme.reads',
			components: [component({ slug: 'p', label: 'P', entry: 'dist/p.js', framework: 'vanilla' })],
			widgets: [{ id: 'p', title: 'P', component: 'p', reads: ['log' as never] }],
		})
		assert.ok(
			errors.some((e) => /widget 'p' reads: 'log' is not a base section/.test(e)),
			errors.join('\n'),
		)
	})
})

describe('who may ask what (F9)', () => {
	test('every kind says who may ask it — the five R21 kinds among them', () => {
		assert.deepEqual([...WIDGET_REQUEST_KINDS].sort(), Object.keys(WIDGET_REQUEST_ASKERS).sort())
		for (const kind of ['set-attribute-value', 'set-sprite-set', 'clear-scene-image', 'session-entries', 'set-entry-marks'])
			assert.ok(WIDGET_REQUEST_KINDS.includes(kind as never), kind)
		assert.equal(WIDGET_REQUEST_ASKERS['set-attribute-value'], 'core')
		assert.equal(WIDGET_REQUEST_ASKERS['set-sprite-set'], 'core')
		assert.equal(WIDGET_REQUEST_ASKERS['clear-scene-image'], 'core')
		assert.equal(WIDGET_REQUEST_ASKERS['set-entry-marks'], 'core')
		assert.deepEqual(WIDGET_REQUEST_ASKERS['session-entries'], { scope: 'lore' })
		// What the page already held to core's own widgets stays core's.
		for (const kind of ['send', 'draft', 'switch-persona', 'add-persona', 'fire-turn', 'decide-proposal', 'actions-seen', 'summarize'] as const)
			assert.equal(WIDGET_REQUEST_ASKERS[kind], 'core', kind)
		assert.equal(WIDGET_REQUEST_ASKERS.messages, 'any')
	})

	test("core's widgets may ask anything the host answers; a plugin's only what the table lets it", () => {
		assert.equal(widgetRequestRefusal('set-attribute-value', { owner: 'core' }), null)
		assert.equal(widgetRequestRefusal('session-entries', { owner: 'core' }), null)
		assert.equal(widgetRequestRefusal('messages', { owner: 'acme.dice' }), null)
		assert.equal(
			widgetRequestRefusal('set-attribute-value', { owner: 'acme.dice', grants: ['session:state'] }),
			"only core's own widgets ask 'set-attribute-value'",
		)
		assert.match(widgetRequestRefusal('session-entries', { owner: 'acme.dice' })!, /the 'lore' scope/)
		assert.match(widgetRequestRefusal('session-entries', { owner: 'acme.dice', grants: ['characters'] })!, /the 'lore' scope/)
		assert.equal(widgetRequestRefusal('session-entries', { owner: 'acme.dice', grants: ['lore'] }), null)
		// Grants are BARE scopes, as the app carries them: a permission key is not a grant.
		assert.match(widgetRequestRefusal('session-entries', { owner: 'acme.dice', grants: ['widget:lore'] })!, /the 'lore' scope/)
		// Grants that are not a list grant nothing — a stored string's `includes` would match a substring.
		for (const grants of ['widget:lore', 'xlorex', 'lore', { includes: () => true }])
			assert.match(
				widgetRequestRefusal('session-entries', { owner: 'acme.dice', grants: grants as never })!,
				/the 'lore' scope/,
				JSON.stringify(grants),
			)
		assert.equal(widgetRequestRefusal('transfer-possession', { owner: 'core' }), "'transfer-possession' is not something a host answers")
		// Not an own key of the table: a prototype name is not a kind.
		assert.match(widgetRequestRefusal('toString', { owner: 'core' })!, /is not something a host answers/)
	})
})

describe("every core widget is remote (R79)", () => {
	test("each names a component and resolves to core's remote — no switch, no native", () => {
		for (const w of CORE_WIDGETS) {
			assert.equal(typeof w.component, 'string', w.id)
			assert.deepEqual(resolveWidgetSurface(w, 'core'), { kind: 'remote', owner: 'core', component: w.component }, w.id)
		}
	})
})

describe("core's widgets declare what they read (R75) and what their ports need (R72, R76)", () => {
	const decl = (id: string) => CORE_WIDGETS.find((w) => w.id === id)!

	test('every declaration passes the SDK’s own check', () => {
		for (const w of CORE_WIDGETS) assert.deepEqual(widgetReadsFindings(w.reads, w.id), [], w.id)
		assert.deepEqual(widgetDeclsFindings(CORE_WIDGETS, 'core'), [])
	})

	test('stats and world state read their settings and the session state — never the log', () => {
		for (const id of ['stats', 'world-state']) {
			assert.deepEqual(decl(id).scopes, ['session:state'], id)
			assert.deepEqual(decl(id).reads, ['settings'], id)
		}
	})

	test('scene portraits: the cast and the state; its settings alone — the host resolves each current sprite, so never the log', () => {
		assert.deepEqual(decl('scene-portraits').scopes, ['characters', 'session:state'])
		assert.deepEqual(decl('scene-portraits').reads, ['settings'])
	})

	test('lore entries: the lore grant; its settings alone, as stats and world state — the page names the session', () => {
		assert.deepEqual(decl('lore-entries').scopes, ['lore'])
		assert.deepEqual(decl('lore-entries').reads, ['settings'])
	})

	test('the conversation reads what its source reads; every core widget declares its reads (R79 removed inventory, the one that did not)', () => {
		assert.deepEqual(decl('messages').reads, ['layout', 'messages', 'actions', 'settings', 'viewer', 'locale'])
		assert.equal(CORE_WIDGETS.find((w) => w.id === 'inventory'), undefined)
		for (const w of CORE_WIDGETS) assert.ok(Array.isArray(w.reads), `${w.id} declares what it reads`)
	})
})

describe("core's widgets read their scoped sections through the one table", () => {
	const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

	test('the shared widget ref hands a core widget every section the table names — session_state and characters among them', { timeout: 120_000 }, async () => {
		const entry = resolve(import.meta.dirname, 'fixtures', 'core-widget-ref', 'scoped.ts')
		const state: SessionStateV1 = {
			sessionId: 3,
			loaded: true,
			error: null,
			resolved: { world: {}, cast: {} },
			slots: [
				{ slotId: 'core:slot/hp@1', key: 'hp', qualifiedKey: 'core:hp', label: 'HP', type: 'integer', appliesTo: ['cast'] },
			],
			owners: [],
		}
		const mira = {
			ref: 'character:7' as const,
			characterId: 7,
			isPersona: false,
			mine: false,
			name: 'Mira',
			face: null,
			sprite: null,
			spriteSets: [],
			spriteSet: null,
			canChangeSpriteSet: false,
		}
		const cast: SessionCharactersV1 = {
			members: [mira, { ...mira, ref: 'character:8', characterId: 8, name: 'Oren' }],
			sceneImages: { left: null, right: null },
		}
		const view = await mountComponent({ root: CORE_CATALOG, entry, owner: 'core', timeoutMs: 60_000, context: {} })
		try {
			assert.equal(view.query('.state')?.textContent, 'no state')
			assert.equal(view.query('.cast')?.textContent, 'no cast')
			await view.push('scoped', { session_state: state, characters: cast })
			assert.equal(view.query('.state')?.textContent, 'session 3, 1 slots')
			assert.equal(view.query('.cast')?.textContent, 'Mira, Oren')
			// `null` withdraws one section — the grant went away — and leaves the other.
			await view.push('scoped', { session_state: null } as never)
			assert.equal(view.query('.state')?.textContent, 'no state')
			assert.equal(view.query('.cast')?.textContent, 'Mira, Oren')
			assert.deepEqual(view.errors, [])
		} finally {
			await view.unmount()
		}
	})

	test("no core widget casts its context to a hand-written shape naming a scoped section — the table's name is read typed", async () => {
		const names = Object.values(WIDGET_SCOPED_SECTIONS)
		const cast = new RegExp(`as\\s+(?:unknown\\s+as\\s+)?\\{[^}]*\\b(${names.join('|')})\\??\\s*:`)
		const found: string[] = []
		const walk = async (dir: string): Promise<void> => {
			for (const e of await readdir(dir, { withFileTypes: true })) {
				const at = join(dir, e.name)
				if (e.isDirectory()) await walk(at)
				else if (/\.(ts|svelte)$/.test(e.name)) {
					const m = cast.exec(await readFile(at, 'utf8'))
					if (m) found.push(`${at}: ${m[0]}`)
				}
			}
		}
		await walk(join(CORE_CATALOG, 'components'))
		assert.deepEqual(found, [])
	})
})
