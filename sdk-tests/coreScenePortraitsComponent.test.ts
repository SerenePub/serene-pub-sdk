/**
 * Core's Scene Portraits as the component it ships as (R21): the BUILT module
 * (`core-catalog/dist/components/scene-portraits.js`), run in a worker and
 * mirrored through the host-element vocabulary, in core's box, with the
 * sections the page posts it — `characters` (cast over card, R76, the page's
 * pins riding along) and `session_state` (its bars) — and no log.
 *
 * What it proves: who, picture and arrangement (W6) draw what the sections
 * say; a scoped push redraws; the sprite-set menu is offered only where the
 * viewer may switch (R77) and every switch goes through `ctx.request`; a
 * chosen image is found by paging `character-images`, and ⋯ opens the
 * member's gallery, where a tile chooses that image (`set-chosen-image`,
 * F2) and *Use the avatar* takes it away; the persona is the viewer's
 * (`mine`, R77);
 * a refusal is this widget's own line.
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

test("core's scene portraits (W6): a pinned instance reads as a stage of chosen images; ⋯ opens the member's gallery, a tile chooses (F2)", { timeout: 120_000 }, async () => {
	const gallery = {
		images: [
			{ ref: 'u-1', src: face(7) },
			{ ref: 'u-2', src: face(8) },
		],
		nextCursor: 'p2',
	}
	const view = await mount(
		{ source: 'pinned', bars: true, pickMembers: ['Ada', 'Wee', 'Bo'], chosenImages: ['character:3=u-2'] },
		(kind, params) => {
			if (kind !== 'character-images') return undefined
			return params.cursor === 'p2' ? { images: [{ ref: 'u-3', src: face(9) }] } : gallery
		},
	)
	try {
		assert.deepEqual(view.refused, [])
		// ⏳ `source: pinned` is who: pick, face: chosen, arrangement: stage — the first two picked, large.
		assert.equal(view.query('[data-widget-part~="scene-portraits.root"]')?.getAttribute('data-arrangement'), 'stage')
		assert.ok(view.query('[data-widget-part~="scene-portraits.stage"]'))
		assert.deepEqual(
			view.queryAll('[data-scene-member]').map((n) => n.getAttribute('data-scene-member')),
			['character:3', 'persona:9'],
		)
		// Ada's chosen image, found by paging her gallery; Wee has none chosen: her avatar.
		assert.deepEqual(
			view.queryAll('img').map((i) => [i.getAttribute('alt'), i.getAttribute('src')]),
			[['Ada', face(8)], ['Wee', face(6)]],
		)
		assert.deepEqual(view.requested.filter((r) => r.kind === 'character-images'), [
			{ kind: 'character-images', params: { characterId: 3 } },
		])
		// Ada's bars ride under her face on the stage.
		assert.deepEqual(view.queryAll('[data-widget-part~="scene-portraits.bar"]').map((b) => b.getAttribute('aria-label')), ['HP 14/20'])
		// No sprite-set menu on a chosen face; ⋯ instead.
		assert.equal(view.queryAll('sp-popover').length, 0)
		await view.click('button[aria-label="Choose an image for Ada"]')
		assert.equal(text(view.query('[data-widget-part~="scene-portraits.chooser-head"]')), "Ada's images")
		assert.deepEqual(
			view.queryAll('[data-widget-part~="scene-portraits.chooser-tile"]').map((b) => [b.querySelector('img')?.getAttribute('src'), b.getAttribute('aria-current')]),
			[[face(7), null], [face(8), 'true']],
		)
		// The next page, on asking.
		await view.click('[data-widget-part~="scene-portraits.chooser-more"]')
		assert.equal(view.queryAll('[data-widget-part~="scene-portraits.chooser-tile"]').length, 3)
		assert.equal(view.query('[data-widget-part~="scene-portraits.chooser-more"]'), null)
		// The chosen one pressed again changes nothing: the chooser just closes.
		const asked = view.requested.length
		await view.click(view.queryAll('[data-widget-part~="scene-portraits.chooser-tile"]')[1]!)
		assert.equal(view.query('[data-widget-part~="scene-portraits.chooser"]'), null)
		assert.equal(view.requested.length, asked)
		// Another tile chooses it (F2): the chooser closes at once.
		await view.click('button[aria-label="Choose an image for Ada"]')
		assert.equal(
			view.queryAll('[data-widget-part~="scene-portraits.chooser-tile"]')[0]?.getAttribute('aria-label'),
			'Show image 1 for Ada',
		)
		await view.click(view.queryAll('[data-widget-part~="scene-portraits.chooser-tile"]')[2]!)
		assert.deepEqual(view.requested.at(-1), {
			kind: 'set-chosen-image',
			params: { characterRef: 'character:3', mediaRef: 'u-3' },
		})
		assert.equal(view.query('[data-widget-part~="scene-portraits.chooser"]'), null)
		// The settings come back: the face shows it.
		await view.push('settings', { source: 'pinned', bars: true, pickMembers: ['Ada', 'Wee', 'Bo'], chosenImages: ['character:3=u-3'] })
		assert.equal(view.query('[data-scene-member="character:3"] img')?.getAttribute('src'), face(9))
		// Use the avatar takes the choice away; the chooser offers it only while one is chosen.
		await view.click('button[aria-label="Choose an image for Ada"]')
		await view.click('[data-widget-part~="scene-portraits.chooser-clear"]')
		assert.deepEqual(view.requested.at(-1), {
			kind: 'set-chosen-image',
			params: { characterRef: 'character:3', mediaRef: null },
		})
		await view.push('settings', { source: 'pinned', bars: true, pickMembers: ['Ada', 'Wee', 'Bo'], chosenImages: [] })
		await view.click('button[aria-label="Choose an image for Ada"]')
		assert.equal(view.query('[data-widget-part~="scene-portraits.chooser-clear"]'), null)
		// Closing goes back to the faces; nothing asked to clear a pin or to view.
		await view.click('[data-widget-part~="scene-portraits.chooser-close"]')
		assert.equal(view.query('[data-widget-part~="scene-portraits.chooser"]'), null)
		assert.equal(view.requested.some((r) => r.kind === 'clear-scene-image' || r.kind === 'view-image'), false)
	} finally {
		await view.unmount()
	}
})

test("core's scene portraits (W6): whoever spoke last, ranked; a row; nobody yet is said", { timeout: 120_000 }, async () => {
	const spoke = characters()
	spoke.members[0] = { ...spoke.members[0]!, lastSpokeAt: 100 }
	spoke.members[1] = { ...spoke.members[1]!, lastSpokeAt: 200 }
	const view = await mount({ who: 'recent', recentTurns: 1, arrangement: 'row' }, () => undefined)
	try {
		await view.push('scoped', { characters: spoke })
		assert.equal(view.query('[data-widget-part~="scene-portraits.root"]')?.getAttribute('data-arrangement'), 'row')
		assert.deepEqual(view.queryAll('[data-scene-member]').map((n) => n.getAttribute('data-scene-member')), ['character:4'])
		assert.equal(text(view.query('[data-widget-part~="scene-portraits.recent-rank"]')), '1')
		await view.push('scoped', { characters: characters() })
		assert.equal(
			text(view.query('[data-widget-part~="scene-portraits.empty"]')),
			'Nobody has spoken yet. Faces show up here as the cast speaks.',
		)
	} finally {
		await view.unmount()
	}
})

test("core's scene portraits: before the characters section arrives, no who says nothing is here", { timeout: 120_000 }, async () => {
	for (const settings of [{ who: 'pick', pickMembers: ['Ada'] }, { who: 'scene' }, { who: 'recent' }]) {
		const source = settings.who
		const view = await mountComponent({
			...(await coreComponentEntry('scene-portraits', { root: CORE_CATALOG, entry: 'dist/components/scene-portraits.js' })),
			owner: 'core',
			timeoutMs: 60_000,
			context: {
				session: { id: 1, name: 'Proof' },
				settings,
				viewer: { userId: 1, isAdmin: false, isGuest: false },
				scoped: { session_state: sessionState(14) },
			},
		})
		try {
			assert.deepEqual(view.refused, [])
			assert.equal(view.query('[data-widget-part~="scene-portraits.empty"]') === null, true, source)
			assert.equal(view.queryAll('img').length, 0, source)
			// Once it arrives, the widget draws it (nobody has spoken: recent says so).
			await view.push('scoped', { characters: characters() })
			if (source === 'recent') assert.ok(view.query('[data-widget-part~="scene-portraits.empty"]'), source)
			else assert.equal(view.queryAll('img').length > 0, true, source)
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
