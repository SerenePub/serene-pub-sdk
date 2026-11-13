/**
 * Core's Scene Portraits names each member's gallery the way the host reads
 * it (🚧 cast members in card actions, S4, 2026-11-08): a member with a card
 * is asked for by `characterId`; a card-less member by `castMemberId`, and
 * never both; galleries are keyed by the member's `ref`, so a card-less
 * member's chosen image is found. The BUILT module runs in a worker.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionCharacterV1, SessionCharactersV1 } from '@serene-pub/sdk'
import { mountComponent } from './harnessGuard.js'
import { coreComponentEntry } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const face = (n: number) => `/media/00000000-0000-4000-8000-00000000000${n}?v=full&r=1`

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
		member({ characterId: 0, name: 'Wisp', ref: 'seated-member:7', cardId: null, castMemberId: 7, face: face(1) }),
		member({ characterId: 3, name: 'Ada', ref: 'seated-member:8', cardId: 3, castMemberId: 8, face: face(2) }),
	],
	sceneImages: { left: null, right: null },
}

test("scene portraits: a card-less member is asked by castMemberId, a carded one by characterId, and its chosen image is found", { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		...(await coreComponentEntry('scene-portraits', { root: CORE_CATALOG, entry: 'dist/components/scene-portraits.js' })),
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings: { source: 'pinned', pickMembers: ['Wisp', 'Ada'], chosenImages: ['seated-member:7=u-2', 'seated-member:8=u-5'] },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { characters },
		},
		requests: (kind, params) =>
			kind === 'character-images'
				? 'castMemberId' in params
					? { images: [{ ref: 'u-1', src: face(7) }, { ref: 'u-2', src: face(8) }] }
					: { images: [{ ref: 'u-5', src: face(9) }] }
				: undefined,
	})
	try {
		assert.deepEqual(view.refused, [])
		const asked = view.requested.filter((r) => r.kind === 'character-images')
		assert.equal(asked.length, 2)
		assert.deepEqual(asked.find((r) => 'castMemberId' in r.params), { kind: 'character-images', params: { castMemberId: 7 } })
		assert.deepEqual(asked.find((r) => 'characterId' in r.params), { kind: 'character-images', params: { characterId: 3 } })
		// Each face shows its chosen image, found in its own gallery.
		assert.deepEqual(
			view.queryAll('img').map((i) => [i.getAttribute('alt'), i.getAttribute('src')]),
			[['Wisp', face(8)], ['Ada', face(9)]],
		)
	} finally {
		await view.unmount()
	}
})
