/**
 * Core's Scene Portraits as the component it ships as (R21): the BUILT module
 * (`core-catalog/dist/components/scene-portraits.js`), run in a worker and
 * mirrored through the host-element vocabulary, in core's box, with the
 * sections the page posts it — `characters` (cast over card, R76, the page's
 * pins riding along) and `session_state` (its bars) — and no log.
 *
 * What it proves: the scene and the pinned sources draw what the sections
 * say; a scoped push redraws; the sprite-set menu is offered only where the
 * viewer may switch (R77) and every switch and clear goes through
 * `ctx.request` (the page answers, R77: a clear clears the PAGE's pin); the
 * persona is the viewer's (`mine`, R77); a refusal is this widget's own line.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionCharacterV1, SessionCharactersV1, SessionStateV1 } from '@serene-pub/sdk'
import { mountComponent } from './harnessGuard.js'
import { coreComponentEntry } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const face = (n: number) => `/media/00000000-0000-4000-8000-00000000000${n}?v=full&r=1`

const member = (over: Partial<SessionCharacterV1> & Pick<SessionCharacterV1, 'characterId' | 'name'>): SessionCharacterV1 => ({
	ref: `character:${over.characterId}`,
	isPersona: false,
	mine: false,
	face: null,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	spriteSetOverride: null,
	canChangeSpriteSet: false,
	...over,
})

const characters = (over: Partial<SessionCharactersV1> = {}): SessionCharactersV1 => ({
	members: [
		member({
			characterId: 3,
			name: 'Ada',
			face: face(1),
			sprite: face(3),
			spriteSets: ['Casual', 'Armor'],
			spriteSet: 'Casual',
			canChangeSpriteSet: true,
		}),
		// Two sets, but the viewer may not switch them: no menu (R77).
		member({ characterId: 4, name: 'Bo', spriteSets: ['Day', 'Night'], spriteSet: 'Day' }),
		// Listed first of the personas, and not the viewer's.
		member({ characterId: 10, name: 'Zed', isPersona: true, face: face(5) }),
		member({ characterId: 9, name: 'Wee', isPersona: true, mine: true, face: face(6) }),
	],
	sceneImages: { left: { src: face(1), ref: 'character:3' }, right: null },
	...over,
})

const sessionState = (hp: number): SessionStateV1 => ({
	sessionId: 1,
	loaded: true,
	error: null,
	resolved: { world: {}, cast: { ada: { hp, mood: 'wary' } } },
	slots: [
		{ slotId: 'core:slot/hp@1', key: 'hp', qualifiedKey: 'hp', label: 'HP', type: 'integer', appliesTo: ['cast'] },
		{ slotId: 'core:slot/mood@1', key: 'mood', qualifiedKey: 'mood', label: 'Mood', type: 'enum', appliesTo: ['cast'] },
	],
	owners: [
		{
			key: 'ada',
			kind: 'session_cast',
			id: 3,
			label: 'Ada',
			configs: { 'core:slot/hp@1': { min: 0, max: 20 }, 'core:slot/mood@1': { of: ['wary', 'calm'] } },
		},
	],
})

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()

async function mount(settings: Record<string, unknown>, requests?: (kind: string, params: Record<string, unknown>) => unknown) {
	return mountComponent({
		...(await coreComponentEntry('scene-portraits', { root: CORE_CATALOG, entry: 'dist/components/scene-portraits.js' })),
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings,
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { characters: characters(), session_state: sessionState(14) },
		},
		...(requests ? { requests } : {}),
	})
}

test("core's scene portraits: the cast, its bars, the sprite-set menu only where allowed, the viewer's persona", { timeout: 120_000 }, async () => {
	const view = await mount({ source: 'scene', bars: true, persona: true, sprites: true }, () => undefined)
	try {
		assert.deepEqual(view.refused, [])
		// The characters, then the VIEWER's persona (Wee) — never the first listed (Zed).
		assert.deepEqual(
			view.queryAll('[data-scene-member]').map((n) => n.getAttribute('data-scene-member')),
			['character:3', 'character:4', 'persona:9'],
		)
		assert.deepEqual(view.queryAll('[data-widget-part~="scene-portraits.face-name"]').map(text), ['Ada', 'Bo', 'Wee'])
		// Ada's current sprite, resolved by the host; Bo has no face; Wee's avatar.
		assert.deepEqual(
			view.queryAll('img').map((i) => [i.getAttribute('alt'), i.getAttribute('src')]),
			[['Ada', face(3)], ['Wee', face(6)]],
		)
		assert.equal(view.queryAll('[data-widget-part~="scene-portraits.face-img"][data-blank]').length, 1)

		// The menu: Ada's only (Bo's sets are not the viewer's to switch).
		const menus = view.queryAll('sp-popover')
		assert.equal(menus.length, 1)
		assert.ok(view.query('[data-scene-member="character:3"] sp-popover'))
		assert.equal(view.query('[data-scene-member="character:4"] sp-popover') === null, true)
		assert.equal(text(view.query('[data-widget-part~="scene-portraits.set"]')), 'Sprite set')
		assert.equal(view.query('[data-widget-part~="scene-portraits.set"]')?.getAttribute('aria-label'), "Change Ada's sprite set")
		assert.deepEqual(
			view.queryAll('[role="menuitemradio"]').map((b) => [text(b), b.getAttribute('aria-checked')]),
			[['Casual', 'false'], ['Armor', 'false'], ['As the story has it', 'true']],
		)

		// Ada's bar row: HP only (the enum is not a bar).
		assert.deepEqual(view.queryAll('[data-state-bars="ada"] [data-widget-part~="scene-portraits.bar"]').map((b) => b.getAttribute('aria-label')), ['HP 14/20'])
		assert.equal(view.query('[data-widget-part~="scene-portraits.bar-fill"]')?.getAttribute('style'), '--sp-fill: 70%')

		// A switch goes through the page.
		await view.click(view.queryAll('[role="menuitemradio"]')[1]!)
		assert.deepEqual(view.requested, [{ kind: 'set-sprite-set', params: { characterId: 3, set: 'Armor' } }])

		// A scoped push redraws: the pick lands, and the bar moves.
		const picked = characters()
		picked.members[0] = { ...picked.members[0]!, spriteSet: 'Armor', spriteSetOverride: 'Armor', sprite: face(4) }
		await view.push('scoped', { characters: picked, session_state: sessionState(5) })
		assert.equal(text(view.query('[data-widget-part~="scene-portraits.set"]')), 'Armor')
		assert.deepEqual(
			view.queryAll('[role="menuitemradio"]').map((b) => b.getAttribute('aria-checked')),
			['false', 'true', 'false'],
		)
		assert.equal(view.query('img')?.getAttribute('src'), face(4))
		assert.deepEqual(view.queryAll('[data-widget-part~="scene-portraits.bar"]').map((b) => b.getAttribute('aria-label')), ['HP 5/20'])
		assert.deepEqual(view.refused, [])
	} finally {
		await view.unmount()
	}
})

test("core's scene portraits: a refused switch is this widget's own line, and the next success clears it", { timeout: 120_000 }, async () => {
	let refuse = true
	const view = await mount({ source: 'scene' }, (kind) => {
		if (kind === 'set-sprite-set' && refuse) throw new Error("only the session's owner or Ada's owner can change Ada's sprite set")
		return undefined
	})
	try {
		assert.equal(view.query('[role="alert"]') === null, true)
		await view.click(view.queryAll('[role="menuitemradio"]')[0]!)
		assert.equal(text(view.query('[data-widget-part~="scene-portraits.alert-text"]')), "only the session's owner or Ada's owner can change Ada's sprite set")
		refuse = false
		await view.click(view.queryAll('[role="menuitemradio"]')[2]!)
		assert.equal(view.query('[role="alert"]') === null, true)
		assert.deepEqual(view.requested, [
			{ kind: 'set-sprite-set', params: { characterId: 3, set: 'Casual' } },
			{ kind: 'set-sprite-set', params: { characterId: 3, set: null } },
		])
		// Without sprites there is no menu at all, and the faces are avatars.
		await view.push('settings', { source: 'scene', sprites: false })
		assert.equal(view.queryAll('sp-popover').length, 0)
		assert.equal(view.query('img')?.getAttribute('src'), face(1))
	} finally {
		await view.unmount()
	}
})

test("core's scene portraits: the pinned source is the page's pins, cleared through the page", { timeout: 120_000 }, async () => {
	// The first clear is refused (R77: said here), the second lands.
	let refuse = true
	const view = await mount({ bars: true }, (kind) => {
		if (kind === 'clear-scene-image' && refuse) {
			refuse = false
			throw new Error('the scene image did not clear')
		}
		return undefined
	})
	try {
		assert.deepEqual(view.refused, [])
		assert.deepEqual(
			view.queryAll('img').map((i) => [i.getAttribute('alt'), i.getAttribute('src')]),
			[['left scene portrait', face(1)]],
		)
		// The pin pictures Ada (the host matched it), so her bars ride under it.
		assert.deepEqual(view.queryAll('[data-widget-part~="scene-portraits.bar"]').map((b) => b.getAttribute('aria-label')), ['HP 14/20'])
		assert.deepEqual(view.queryAll('[data-widget-part~="scene-portraits.pin"]').map((d) => text(d)), ['HP', 'Empty'])
		await view.click('button[aria-label="Clear left portrait"]')
		assert.equal(text(view.query('[data-widget-part~="scene-portraits.alert-text"]')), 'the scene image did not clear')
		await view.click('button[aria-label="Clear left portrait"]')
		assert.equal(view.query('[role="alert"]') === null, true)
		assert.deepEqual(view.requested, [
			{ kind: 'clear-scene-image', params: { side: 'left' } },
			{ kind: 'clear-scene-image', params: { side: 'left' } },
		])
		// The page clears its pin and pushes the section: the widget follows it.
		await view.push('scoped', { characters: characters({ sceneImages: { left: null, right: null } }) })
		assert.equal(
			text(view.query('[data-widget-part~="scene-portraits.empty"]')),
			"No scene portraits set. Click a character's avatar in the chat to pin one here.",
		)
		// A section not yet arrived is the empty scene, never a crash.
		await view.push('settings', { source: 'scene' })
		await view.push('scoped', { characters: { members: [], sceneImages: { left: null, right: null } } })
		assert.equal(
			text(view.query('[data-widget-part~="scene-portraits.empty"]')),
			'Nobody is in this scene yet. Add a character to the session and they show up here.',
		)
	} finally {
		await view.unmount()
	}
})

test("core's scene portraits: before the characters section arrives, neither source says nothing is here", { timeout: 120_000 }, async () => {
	for (const source of ['pinned', 'scene']) {
		const view = await mountComponent({
			...(await coreComponentEntry('scene-portraits', { root: CORE_CATALOG, entry: 'dist/components/scene-portraits.js' })),
			owner: 'core',
			timeoutMs: 60_000,
			context: {
				session: { id: 1, name: 'Proof' },
				settings: { source },
				viewer: { userId: 1, isAdmin: false, isGuest: false },
				scoped: { session_state: sessionState(14) },
			},
		})
		try {
			assert.deepEqual(view.refused, [])
			assert.equal(view.query('[data-widget-part~="scene-portraits.empty"]') === null, true, source)
			assert.equal(view.queryAll('img').length, 0, source)
			// Once it arrives, the widget draws it.
			await view.push('scoped', { characters: characters() })
			assert.equal(view.queryAll('img').length > 0, true, source)
		} finally {
			await view.unmount()
		}
	}
})

test("a clone of scene portraits in a box not granted `characters` says so — never a blank that waits forever", { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		...(await coreComponentEntry('scene-portraits', { root: CORE_CATALOG, entry: 'dist/components/scene-portraits.js' })),
		timeoutMs: 60_000,
		grants: [],
		context: {
			session: { id: 1, name: 'Proof' },
			settings: { source: 'scene' },
			scoped: { characters: characters(), session_state: sessionState(14) },
		},
	})
	try {
		assert.equal(view.query('[data-scope-not-granted]')?.getAttribute('data-scope-not-granted'), 'characters')
		assert.match(text(view.query('[data-scope-not-granted]'))!, /not been granted/)
		assert.equal(view.queryAll('[data-scene-member]').length, 0)
		assert.deepEqual(view.refused, [])
		// Granted at runtime: the notice goes, and the section, once posted, draws.
		await view.setGrants(['characters'])
		assert.equal(view.query('[data-scope-not-granted]'), null)
		await view.push('scoped', { characters: characters() })
		assert.ok(view.queryAll('[data-scene-member]').length > 0)
	} finally {
		await view.unmount()
	}
})
