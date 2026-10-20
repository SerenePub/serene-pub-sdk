/**
 * Core's Scene Portraits after its uplift (PLAN-core-widgets W6, 2026-10-11):
 * one setting per question — **who** (`who`), **which picture** (`face`),
 * **how laid out** (`arrangement`) — in its declaration and its plain half
 * (`@serene-pub/core-catalog/scene-portraits`): the old `source` and
 * `sprites` still read (⏳), whoever spoke last ranked by `lastSpokeAt`, a
 * picked member by name or reference, a chosen image looked up per member,
 * a stage cut to two, and a benched character never drawn.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionCharacterV1, SessionCharactersV1, SessionStateV1 } from '@serene-pub/sdk'
import { WIDGET_REQUEST_ASKERS } from '@serene-pub/sdk'
import {
	SCENE_PORTRAITS_DEFAULTS,
	chosenImagePair,
	chosenImagesOf,
	readScenePortraitsSettings,
	sceneFiguresOf,
	scenePortraitMembersOf,
	scenePortraitsOf,
	withChosenImage,
	type ScenePortraitsSettings,
} from '../core-catalog/src/shared/ui/scene-portraits/index.js'
import { CORE_WIDGETS, DUNGEON_CRAWLER_LAYOUT, coreWidgets } from '../core-catalog/src/index.js'

const member = (
	over: Partial<SessionCharacterV1> & Pick<SessionCharacterV1, 'characterId'>,
): SessionCharacterV1 => ({
	ref: `character:${over.characterId}`,
	isPersona: false,
	mine: false,
	name: `#${over.characterId}`,
	face: `/media/face-${over.characterId}`,
	sprite: null,
	spriteSets: [],
	spriteSet: null,
	canChangeSpriteSet: false,
	...over,
})

const cast: SessionCharactersV1 = {
	members: [
		member({ characterId: 3, name: 'Ada', sprite: '/media/ada-happy', lastSpokeAt: 300 }),
		member({ characterId: 4, name: 'Bo', lastSpokeAt: 500 }),
		member({ characterId: 5, name: 'Cy', lastSpokeAt: null }),
		member({ characterId: 6, name: 'Dee', lastSpokeAt: 900, benched: true }),
		member({ characterId: 7, name: 'Eli', lastSpokeAt: 100 }),
		member({ characterId: 9, name: 'Wee', isPersona: true, mine: true, lastSpokeAt: 700 }),
		member({ characterId: 10, name: 'Zed', isPersona: true, lastSpokeAt: 800 }),
	],
	sceneImages: { left: null, right: null },
}

const as = (over: Partial<ScenePortraitsSettings>): ScenePortraitsSettings => ({
	...SCENE_PORTRAITS_DEFAULTS,
	...over,
})
const refs = (ms: { ref?: string; key?: string }[]) => ms.map((m) => m.ref ?? m.key)

describe('the declaration (W6)', () => {
	const decl = CORE_WIDGETS.find((w) => w.id === 'scene-portraits')!
	const s = decl.settings as Record<
		string,
		{
			type: string
			default?: unknown
			of?: string[]
			showIf?: unknown
			group?: string
			min?: number
			max?: number
		}
	>

	test("three axes, their defaults the reader's; its own glyph", () => {
		assert.equal(coreWidgets.scenePortraits, decl)
		assert.equal(decl.icon, 'SquareUserRound')
		assert.deepEqual(s.who!.of, ['scene', 'recent', 'pick'])
		assert.deepEqual(s.face!.of, ['avatar', 'sprite', 'chosen'])
		assert.deepEqual(s.arrangement!.of, ['row', 'grid', 'column', 'stage'])
		assert.deepEqual(
			{
				who: s.who!.default,
				recentTurns: s.recentTurns!.default,
				pickMembers: s.pickMembers!.default,
				face: s.face!.default,
				chosenImages: s.chosenImages!.default,
				arrangement: s.arrangement!.default,
				persona: s.persona!.default,
				playerSeats: s.playerSeats!.default,
				metPeople: s.metPeople!.default,
				bars: s.bars!.default,
				// 🚧 Whose faces carry bars (PLAN-dc-after-walk3 R3-3).
				barsFor: s.barsFor!.default,
			},
			{ ...SCENE_PORTRAITS_DEFAULTS },
		)
		assert.deepEqual(s.barsFor!.of, ['everyone', 'seats'])
		assert.deepEqual(s.barsFor!.showIf, { field: 'bars', equals: true })
		assert.deepEqual([s.recentTurns!.min, s.recentTurns!.max], [1, 20])
		assert.deepEqual(s.recentTurns!.showIf, { field: 'who', equals: 'recent' })
		assert.deepEqual(s.pickMembers!.showIf, { field: 'who', equals: 'pick' })
		assert.deepEqual(s.chosenImages!.showIf, { field: 'face', equals: 'chosen' })
		assert.equal(s.chosenImages!.type, 'string[]')
		assert.deepEqual(decl.scopes, ['characters', 'session:state'])
		assert.deepEqual(decl.reads, ['settings'])
	})

	test('⏳ source and sprites stay declared with no default, behind a showIf no prune leaves true', () => {
		assert.equal(s.source!.default, undefined)
		assert.deepEqual(s.source!.showIf, { field: 'source', equals: 'pinned' })
		assert.equal(s.sprites!.default, undefined)
		assert.deepEqual(s.sprites!.showIf, { field: 'sprites', equals: false })
		assert.equal(s.source!.group, 'Who')
		assert.equal(s.sprites!.group, 'Look')
	})

	test('a gallery is asked by a widget granted the cast', () => {
		assert.deepEqual(WIDGET_REQUEST_ASKERS['character-images'], { scope: 'characters' })
	})
})

describe('⏳ the old keys read as the axes they meant', () => {
	test('source: pinned is pick · chosen · stage, wherever the new key is not written', () => {
		const pinned = readScenePortraitsSettings({ source: 'pinned', bars: true })
		assert.deepEqual(
			[pinned.who, pinned.face, pinned.arrangement, pinned.bars],
			['pick', 'chosen', 'stage', true],
		)
		const mixed = readScenePortraitsSettings({
			source: 'pinned',
			who: 'scene',
			arrangement: 'row',
		})
		assert.deepEqual([mixed.who, mixed.face, mixed.arrangement], ['scene', 'chosen', 'row'])
	})
	test('source: scene is the scene; sprites: false is the avatar, unless face is written', () => {
		assert.deepEqual(readScenePortraitsSettings({ source: 'scene' }), SCENE_PORTRAITS_DEFAULTS)
		assert.equal(readScenePortraitsSettings({ sprites: false }).face, 'avatar')
		assert.equal(readScenePortraitsSettings({ sprites: true }).face, 'sprite')
		assert.equal(readScenePortraitsSettings({ sprites: false, face: 'chosen' }).face, 'chosen')
	})
	test('recentTurns out of 1–20 or not an integer is the default; lists keep their strings', () => {
		assert.equal(readScenePortraitsSettings({ recentTurns: 0 }).recentTurns, 3)
		assert.equal(readScenePortraitsSettings({ recentTurns: 2.5 }).recentTurns, 3)
		assert.equal(readScenePortraitsSettings({ recentTurns: 20 }).recentTurns, 20)
		assert.deepEqual(
			readScenePortraitsSettings({ pickMembers: [' Ada ', '', 4] }).pickMembers,
			['Ada'],
		)
	})
})

describe('who', () => {
	test("scene: every unbenched character in order, then the viewer's persona when asked", () => {
		assert.deepEqual(refs(scenePortraitMembersOf(cast, as({}))), [
			'character:3',
			'character:4',
			'character:5',
			'character:7',
		])
		assert.deepEqual(
			refs(scenePortraitMembersOf(cast, as({ persona: true }))).at(-1),
			'character:9',
		)
	})
	test('recent: whoever spoke last first, up to N; one who never spoke is not recent; a benched one never', () => {
		assert.deepEqual(refs(scenePortraitMembersOf(cast, as({ who: 'recent' }))), [
			'character:4',
			'character:3',
			'character:7',
		])
		assert.deepEqual(
			refs(scenePortraitMembersOf(cast, as({ who: 'recent', recentTurns: 1 }))),
			['character:4'],
		)
		// The viewer's persona ranks by its own last line; another person's never shows.
		assert.deepEqual(
			refs(
				scenePortraitMembersOf(cast, as({ who: 'recent', persona: true, recentTurns: 2 })),
			),
			['character:9', 'character:4'],
		)
		// Ranks ride on the faces.
		assert.deepEqual(
			scenePortraitsOf(cast, undefined, as({ who: 'recent' })).map((p) => p.rank),
			[1, 2, 3],
		)
	})
	test('pick: by name (any case) or reference, in the order named, each once; a benched one never', () => {
		const picked = as({
			who: 'pick',
			pickMembers: ['bo', 'character:3', 'Bo', 'Dee', 'Zed', 'nobody'],
		})
		assert.deepEqual(refs(scenePortraitMembersOf(cast, picked)), [
			'character:4',
			'character:3',
			'character:10',
		])
		assert.deepEqual(scenePortraitMembersOf(cast, as({ who: 'pick' })), [])
	})
	test('a stage is the first two', () => {
		assert.deepEqual(refs(scenePortraitsOf(cast, undefined, as({ arrangement: 'stage' }))), [
			'character:3',
			'character:4',
		])
	})
})

describe('which picture', () => {
	test('sprite (the current one, else the avatar), avatar, and chosen (looked up, the avatar until then)', () => {
		const srcOf = (
			face: ScenePortraitsSettings['face'],
			extra: Partial<ScenePortraitsSettings> = {},
		) =>
			scenePortraitsOf(cast, undefined, as({ face, ...extra })).map((p) => [
				p.key,
				p.src,
				p.chosenRef,
			])
		assert.deepEqual(srcOf('sprite').slice(0, 2), [
			['character:3', '/media/ada-happy', null],
			['character:4', '/media/face-4', null],
		])
		assert.deepEqual(srcOf('avatar')[0], ['character:3', '/media/face-3', null])
		assert.deepEqual(
			srcOf('chosen', {
				chosenImages: ['character:4=uuid-b', 'character:4=uuid-c', 'junk'],
			}).slice(0, 2),
			[
				['character:3', '/media/face-3', null],
				['character:4', '/media/face-4', 'uuid-b'],
			],
		)
		// Only a chosen face carries a chosen ref.
		assert.equal(srcOf('sprite', { chosenImages: ['character:4=uuid-b'] })[1]![2], null)
	})
	test('the sprite-set menu only where sprites are shown', () => {
		const menu = {
			...cast,
			members: [member({ characterId: 3, spriteSets: ['A', 'B'], canChangeSpriteSet: true })],
		}
		assert.equal(scenePortraitsOf(menu, undefined, as({}))[0]!.offersSpriteSets, true)
		assert.equal(
			scenePortraitsOf(menu, undefined, as({ face: 'chosen' }))[0]!.offersSpriteSets,
			false,
		)
	})
})

describe('chosen images', () => {
	test('pairs read first-wins; a malformed entry is skipped', () => {
		assert.deepEqual(
			[
				...chosenImagesOf([
					'character:3=a',
					'character:3=b',
					'persona:4=c',
					'character:5=',
					' character:6 = d ',
				]),
			],
			[
				['character:3', 'a'],
				['character:6', 'd'],
			],
		)
	})
	test('withChosenImage sets one member, keeps the rest, and takes one out for null', () => {
		const list = ['character:3=a', 'character:4=b']
		assert.deepEqual(withChosenImage(list, 'character:3', 'z'), [
			'character:4=b',
			'character:3=z',
		])
		assert.deepEqual(withChosenImage(list, 'character:4', null), ['character:3=a'])
		assert.equal(chosenImagePair('character:7', 'u'), 'character:7=u')
	})
})

describe('🚧 the scene figures: player seats and the people met (PLAN-dc-after-walk2 Q3-5)', () => {
	const owner = (o: Record<string, unknown>) => ({ configs: {}, label: '', ...o })
	const state = {
		sessionId: 1,
		loaded: true,
		owners: [
			owner({ key: 'world', kind: 'session', id: 1, label: 'World' }),
			// A companion: cast, not a seat.
			owner({ key: '3', kind: 'session_cast', id: 3, label: 'Ada' }),
			// Another player's card, seated as a player seat.
			owner({ key: '10', kind: 'session_cast', id: 10, label: 'Zed', seat: true, face: { src: '/media/zed', mediaRef: null } }),
			// The viewer's card-less player seat.
			owner({ key: 'player_seat:4', kind: 'player_seat', id: 4, label: 'Ash Fenwick', seat: true, mine: true }),
		],
		metPeople: [
			{ entryId: 21, name: 'Moss' },
			{ entryId: 22, name: 'ada' },
			{ entryId: 23, name: 'Old Bram' },
		],
	} as unknown as SessionStateV1

	test('off by default: the cast alone, as before', () => {
		assert.deepEqual(sceneFiguresOf(cast, state, as({})), [])
	})

	test("every player seat, the viewer's own first, with its face and bars; then the people met by name, never one drawn already", () => {
		const figures = sceneFiguresOf(cast, state, as({ playerSeats: true, metPeople: true }))
		assert.deepEqual(
			figures.map((f) => [f.kind, f.name, f.src, f.ownerKey]),
			[
				['player-seat', 'Ash Fenwick', null, 'player_seat:4'],
				['player-seat', 'Zed', '/media/zed', '10'],
				['met', 'Moss', null, null],
				['met', 'Old Bram', null, null],
			],
		)
		// The viewer's persona is one of the seats: never drawn twice.
		const members = scenePortraitMembersOf(cast, as({ playerSeats: true, persona: true }))
		assert.ok(!members.some((m) => m.isPersona))
	})

	test('the scene only: the latest speakers and a pick name cast members', () => {
		assert.deepEqual(sceneFiguresOf(cast, state, as({ who: 'recent', playerSeats: true, metPeople: true })), [])
		assert.deepEqual(sceneFiguresOf(cast, state, as({ who: 'pick', playerSeats: true, metPeople: true })), [])
	})

	test('read from settings; Dungeon Crawler pins both on for whoever adds the widget', () => {
		const read = readScenePortraitsSettings({ playerSeats: true, metPeople: 'yes' })
		assert.equal(read.playerSeats, true)
		assert.equal(read.metPeople, false)
		const pinned = readScenePortraitsSettings(
			(DUNGEON_CRAWLER_LAYOUT.widgetSettings as Record<string, Record<string, unknown>>)['scene-portraits'],
		)
		assert.deepEqual([pinned.who, pinned.playerSeats, pinned.metPeople, pinned.bars], ['scene', true, true, true])
	})
})
