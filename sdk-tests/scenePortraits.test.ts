/**
 * The Scene Portraits widget's plain half (`@serene-pub/core-catalog/scene-portraits`):
 * its settings, and the faces, pins and mini bar rows it reads off
 * `characters.v1` and `session_state.v1`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionCharacterV1, SessionCharactersV1, SessionStateV1 } from '@serene-pub/sdk'
import {
	SCENE_PORTRAITS_DEFAULTS,
	pinnedPortraitsOf,
	readScenePortraitsSettings,
	scenePortraitsOf,
	stateOwnerKeyOf,
	statBarsOf,
} from '../core-catalog/src/shared/ui/scene-portraits/index.js'

const member = (over: Partial<SessionCharacterV1> & Pick<SessionCharacterV1, 'characterId'>): SessionCharacterV1 => ({
	ref: `character:${over.characterId}`,
	isPersona: false,
	mine: false,
	name: `#${over.characterId}`,
	face: null,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	canChangeSpriteSet: false,
	...over,
})

const cast: SessionCharactersV1 = {
	members: [
		member({ characterId: 3, face: '/media/a', sprite: '/media/a-happy', spriteSets: ['Casual', 'Armor'], canChangeSpriteSet: true, spriteSetOverride: 'Armor' }),
		member({ characterId: 4, spriteSets: ['Day', 'Night'] }),
		member({ characterId: 5, spriteSets: ['Only'], canChangeSpriteSet: true }),
		member({ characterId: 10, isPersona: true, face: '/media/z' }),
		member({ characterId: 9, isPersona: true, mine: true, face: '/media/w', sprite: '/media/w-sprite' }),
	],
	sceneImages: { left: { src: '/media/pinned', ref: null }, right: { src: '/media/a', ref: 'character:3' } },
}

const state = (over: Partial<SessionStateV1> = {}): SessionStateV1 => ({
	sessionId: 1,
	loaded: true,
	error: null,
	resolved: { world: { day: 2 }, cast: { ada: { hp: 14, mp: 3, sp: 30, luck: 9 } } },
	slots: [
		{ slotId: 's/hp', key: 'hp', qualifiedKey: 'hp', label: 'HP', type: 'integer', appliesTo: ['cast'] },
		{ slotId: 's/mood', key: 'mood', qualifiedKey: 'mood', label: 'Mood', type: 'enum', appliesTo: ['cast'] },
		{ slotId: 's/mp', key: 'mp', qualifiedKey: 'mp', label: 'MP', type: 'integer', appliesTo: ['cast'] },
		{ slotId: 's/sp', key: 'sp', qualifiedKey: 'sp', label: 'SP', type: 'integer', appliesTo: ['cast'] },
		{ slotId: 's/luck', key: 'luck', qualifiedKey: 'luck', label: 'Luck', type: 'integer', appliesTo: ['cast'] },
		{ slotId: 's/day', key: 'day', qualifiedKey: 'day', label: 'Day', type: 'integer', appliesTo: ['world'] },
	],
	owners: [
		{ key: 'world', kind: 'session', id: 1, label: 'World', configs: { 's/day': { min: 0, max: 10 } } },
		{
			key: 'ada',
			kind: 'session_cast',
			id: 3,
			label: 'Ada',
			configs: {
				's/hp': { min: 0, max: 20 },
				's/mood': {},
				's/mp': { min: 0 },
				's/sp': { min: 0, max: 40 },
				's/luck': { min: 0, max: 10 },
			},
		},
	],
	...over,
})

describe('readScenePortraitsSettings', () => {
	test('the declared defaults fill whatever the instance leaves out, and a wrong type is the default', () => {
		assert.deepEqual(readScenePortraitsSettings(undefined), SCENE_PORTRAITS_DEFAULTS)
		assert.deepEqual(readScenePortraitsSettings({ source: 'scene', bars: true, persona: 'yes', sprites: false }), {
			source: 'scene',
			persona: false,
			bars: true,
			sprites: false,
		})
		assert.equal(readScenePortraitsSettings({ source: 'map' }).source, 'pinned')
	})
})

describe('scenePortraitsOf', () => {
	const on = { ...SCENE_PORTRAITS_DEFAULTS, source: 'scene' as const }

	test('the characters, in order; each current sprite over its face; the override', () => {
		const out = scenePortraitsOf(cast, state(), on)
		assert.deepEqual(out.map((p) => [p.key, p.src, p.ownerKey, p.spriteSetOverride]), [
			['character:3', '/media/a-happy', 'ada', 'Armor'],
			['character:4', null, null, null],
			['character:5', null, null, null],
		])
	})

	test('without sprites, faces — and no menu', () => {
		const out = scenePortraitsOf(cast, state(), { ...on, sprites: false })
		assert.equal(out[0]!.src, '/media/a')
		assert.ok(out.every((p) => !p.offersSpriteSets))
	})

	test('R77: the menu only where the viewer may switch and there is more than one set', () => {
		assert.deepEqual(
			scenePortraitsOf(cast, state(), on).map((p) => p.offersSpriteSets),
			[true, false, false],
		)
	})

	test("R77: the persona is the viewer's (mine), drawn by its face, with no bars and no menu", () => {
		const out = scenePortraitsOf(cast, state(), { ...on, persona: true })
		assert.deepEqual(out.at(-1), {
			key: 'character:9',
			characterId: 9,
			isPersona: true,
			name: '#9',
			src: '/media/w',
			ownerKey: null,
			spriteSets: [],
			spriteSetOverride: null,
			offersSpriteSets: false,
		})
		assert.equal(out.length, 4)
		// A viewer voicing no persona here: none is drawn.
		const theirs = { ...cast, members: cast.members.map((m) => ({ ...m, mine: false })) }
		assert.equal(scenePortraitsOf(theirs, state(), { ...on, persona: true }).length, 3)
	})

	test('a section not yet arrived is an empty scene', () => {
		assert.deepEqual(scenePortraitsOf(undefined, undefined, on), [])
	})
})

describe('pinnedPortraitsOf', () => {
	test('left then right; an owner only for a pin the host could name', () => {
		assert.deepEqual(pinnedPortraitsOf(cast, state()), [
			{ side: 'left', src: '/media/pinned', ownerKey: null },
			{ side: 'right', src: '/media/a', ownerKey: 'ada' },
		])
		assert.deepEqual(pinnedPortraitsOf(undefined, undefined), [
			{ side: 'left', src: null, ownerKey: null },
			{ side: 'right', src: null, ownerKey: null },
		])
	})
})

describe('stateOwnerKeyOf', () => {
	test("a cast owner by its character id; never the world's", () => {
		assert.equal(stateOwnerKeyOf(state(), 3), 'ada')
		assert.equal(stateOwnerKeyOf(state(), 1), null)
		assert.equal(stateOwnerKeyOf(undefined, 3), null)
	})
})

describe('statBarsOf', () => {
	test('only bounded slots are bars, in declaration order, at most three', () => {
		assert.deepEqual(
			statBarsOf(state(), 'ada').map((r) => [r.label, r.bar.label, r.bar.percent]),
			[
				['HP', '14/20', 70],
				['SP', '30/40', 75],
				['Luck', '9/10', 90],
			],
		)
		assert.equal(statBarsOf(state(), 'ada', 1).length, 1)
	})

	test("the world's bag for the world; nothing for an unknown owner or no state", () => {
		assert.deepEqual(statBarsOf(state(), 'world').map((r) => r.bar.label), ['2/10'])
		assert.deepEqual(statBarsOf(state(), 'nobody'), [])
		assert.deepEqual(statBarsOf(undefined, 'ada'), [])
	})

	test('a slot the owner does not carry is not drawn, even with a value filed', () => {
		const s = state()
		delete s.owners[1]!.configs['s/hp']
		assert.deepEqual(statBarsOf(s, 'ada').map((r) => r.label), ['SP', 'Luck'])
	})
})
