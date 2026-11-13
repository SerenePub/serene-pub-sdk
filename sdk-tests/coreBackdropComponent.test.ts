/**
 * Core's Backdrop chooser names each member's gallery the way the host reads
 * it (🚧 cast members in card actions, S4, 2026-11-08): a member with a card
 * is asked for by `characterId`; a card-less member by `castMemberId`, and
 * never both. The BUILT module runs in a worker, as the Scene Portraits one.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionCharacterV1, SessionCharactersV1 } from '@serene-pub/sdk'
import { mountComponent } from './harnessGuard.js'
import { coreComponentEntry } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

const member = (over: Partial<SessionCharacterV1> & Pick<SessionCharacterV1, 'characterId' | 'name' | 'ref'>): SessionCharacterV1 => ({
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

const characters: SessionCharactersV1 = {
	members: [
		member({ characterId: 0, name: 'Wisp', ref: 'seated-member:7', cardId: null, castMemberId: 7 }),
		member({ characterId: 3, name: 'Ada', ref: 'seated-member:8', cardId: 3, castMemberId: 8 }),
	],
	sceneImages: { left: null, right: null },
}

test("backdrop chooser: a card-less member is asked by castMemberId, a carded one by characterId", { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		...(await coreComponentEntry('backdrop', { root: CORE_CATALOG, entry: 'dist/components/backdrop.js' })),
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { characters },
		},
		requests: () => ({ images: [] }),
	})
	try {
		assert.deepEqual(view.refused, [])
		await view.click('[data-widget-part~="backdrop.change"]')
		assert.deepEqual(view.requested.filter((r) => r.kind === 'character-images'), [
			{ kind: 'character-images', params: { castMemberId: 7 } },
		])
		const buttons = view.queryAll('[data-widget-part~="backdrop.member"]')
		assert.equal(buttons.length, 2)
		await view.click('[data-widget-part~="backdrop.member"]:nth-of-type(2)')
		assert.deepEqual(view.requested.filter((r) => r.kind === 'character-images').at(-1), {
			kind: 'character-images',
			params: { characterId: 3 },
		})
	} finally {
		await view.unmount()
	}
})
