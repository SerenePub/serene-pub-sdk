/**
 * 🚧 Scene Portraits' speaker focus as the component draws it
 * (PLAN-visual-novel-layout ★2): `data-speaking` on the speaker's face only;
 * `data-speaker-focus` on the root only with `speakerFocus` on and the
 * speaker on stage. Mounted from source (the built `dist` has not these), the
 * plain half aliased as `coreStatsTies` aliases session-state.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionCharacterV1, SessionCharactersV1 } from '@serene-pub/sdk'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const SOURCE = resolve(CORE_CATALOG, 'src', 'shared', 'ui', 'scene-portraits', 'index.ts')

const member = (id: number, name: string): SessionCharacterV1 => ({
	ref: `character:${id}`,
	characterId: id,
	isPersona: false,
	mine: false,
	name,
	face: null,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	spriteSetOverride: null,
	canChangeSpriteSet: false,
	lastSpokeAt: id * 100,
})

const characters = (speakerRef?: string | null): SessionCharactersV1 => ({
	members: [member(3, 'Ada'), member(4, 'Bo'), member(5, 'Cy')],
	sceneImages: { left: null, right: null },
	...(speakerRef === undefined ? {} : { speakerRef }),
})

async function mount(settings: Record<string, unknown>, speakerRef?: string | null) {
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/scene-portraits/scene-portraits.ts',
		alias: { '@serene-pub/core-catalog/scene-portraits': SOURCE },
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings: { who: 'scene', ...settings },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { characters: characters(speakerRef) },
		},
	} as never)
}

const speaking = (view: Awaited<ReturnType<typeof mount>>) =>
	view.queryAll('[data-speaking]').map((n) => n.getAttribute('data-scene-member'))
const focus = (view: Awaited<ReturnType<typeof mount>>) =>
	view.query('[data-widget-part~="scene-portraits.root"]')?.hasAttribute('data-speaker-focus')

test('speakerFocus on, the speaker on stage: the face and the root say so', { timeout: 120_000 }, async () => {
	const view = await mount({ speakerFocus: true }, 'character:4')
	try {
		assert.deepEqual(view.refused, [])
		assert.deepEqual(speaking(view), ['character:4'])
		assert.equal(focus(view), true)
	} finally {
		await view.unmount()
	}
})

test('speakerFocus off: the face is marked, the root is not', { timeout: 120_000 }, async () => {
	const view = await mount({ speakerFocus: false }, 'character:4')
	try {
		assert.deepEqual(speaking(view), ['character:4'])
		assert.equal(focus(view), false)
	} finally {
		await view.unmount()
	}
})

test('the speaker is not drawn, or there is none: nobody is dimmed', { timeout: 120_000 }, async () => {
	for (const ref of ['character:99', null, undefined]) {
		const view = await mount({ speakerFocus: true }, ref)
		try {
			assert.deepEqual(speaking(view), [], String(ref))
			assert.equal(focus(view), false, String(ref))
		} finally {
			await view.unmount()
		}
	}
})
