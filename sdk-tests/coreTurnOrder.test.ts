/**
 * The plain-TypeScript half of core's Turn order widget
 * (`@serene-pub/core-catalog/turn-order`, PLAN-core-widgets W1): its
 * declaration, its settings, the strategy names, and the view — the head
 * line in the composer line's words, the rows and their chips, and who may
 * press Continue and Pick who speaks.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as C from '@serene-pub/contracts'
import type {
	ActionsV1,
	SessionCharactersV1,
	TurnOrderV1,
	ViewerV1,
	WidgetAction,
} from '@serene-pub/sdk'
import {
	TURN_ORDER_DEFAULTS,
	TURN_STRATEGY_NAMES,
	readTurnOrderSettings,
	turnOrderView,
	turnStrategyName,
} from '../core-catalog/src/shared/ui/turn-order/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'

const en = (s: string) => s
const OWNER: ViewerV1 = { userId: 1, isAdmin: false, isGuest: false }
const GUEST: ViewerV1 = { userId: 2, isAdmin: false, isGuest: true }

const doc = (over: Partial<TurnOrderV1> = {}): TurnOrderV1 => ({
	v: 1,
	order: [],
	candidates: [
		{ ref: 'character:3', kind: 'character', name: 'Wren', position: 0, ownerUserId: 1 },
		{
			ref: 'character:4',
			kind: 'character',
			name: 'Bram',
			nickname: 'Bee',
			position: 1,
			ownerUserId: 1,
		},
		{ ref: 'character:8', kind: 'persona', name: 'Kit', position: 0, ownerUserId: 1 },
		{ ref: 'character:9', kind: 'persona', name: 'Sable', position: 1, ownerUserId: 3 },
	],
	basedOnAt: 1,
	computedAt: 2,
	runId: null,
	event: null,
	strategy: 'core:task/turn-round-robin@1',
	...over,
})

const cast: SessionCharactersV1 = {
	members: [
		{
			ref: 'character:3',
			characterId: 3,
			isPersona: false,
			mine: false,
			name: 'Wren',
			face: '/media/w',
			sprite: null,
			spriteSets: [],
			spriteSet: null,
			canChangeSpriteSet: false,
		},
		{
			ref: 'character:8',
			characterId: 8,
			isPersona: true,
			mine: true,
			name: 'Kit',
			face: null,
			sprite: null,
			spriteSets: [],
			spriteSet: null,
			canChangeSpriteSet: false,
		},
	],
	sceneImages: { left: null, right: null },
}

const view = (o: Partial<Parameters<typeof turnOrderView>[0]> = {}) =>
	turnOrderView({
		turnOrder: doc(),
		characters: cast,
		viewer: OWNER,
		settings: TURN_ORDER_DEFAULTS,
		t: en,
		...o,
	})

describe('the declaration', () => {
	test('turn-order: one per layout, every genre, the sections it reads and the cast it asks for', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'turn-order')!
		assert.ok(decl)
		assert.equal(coreWidgets.turnOrder, decl)
		assert.equal(decl.title, 'Turn order')
		assert.equal(decl.icon, 'ListOrdered')
		assert.equal(decl.maxInstances, 1)
		assert.equal(decl.genres, undefined)
		assert.deepEqual(decl.scopes, ['characters'])
		assert.deepEqual(decl.reads, ['turnOrder', 'viewer', 'actions', 'settings', 'locale'])
		assert.deepEqual(decl.layout, { span: { ideal: 1 }, minInline: 220 })
		assert.ok(
			CORE_COMPONENTS.some(
				(c) =>
					c.slug === 'turn-order' &&
					c.entry === 'components/shared/turn-order/turn-order.ts',
			),
		)
	})
	test("the declared defaults are the reader's", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'turn-order')!
		const s = decl.settings as Record<string, { default: unknown; group?: string }>
		assert.deepEqual(TURN_ORDER_DEFAULTS, {
			showStrategy: s.showStrategy!.default,
			faces: s.faces!.default,
			showBenched: s.showBenched!.default,
		})
		assert.equal(s.showStrategy!.group, 'Behaviour')
		assert.equal(s.showBenched!.group, 'Faces')
		assert.deepEqual(readTurnOrderSettings(undefined), TURN_ORDER_DEFAULTS)
		assert.deepEqual(readTurnOrderSettings({ faces: false, showStrategy: 'yes', showBenched: true }), {
			faces: false,
			showStrategy: true,
			showBenched: true,
		})
	})
})

describe('strategy names', () => {
	test("are the contracts' own names, so the two never drift", () => {
		const pins = [
			C.turnRoundRobin,
			C.turnUserSplit,
			C.turnRandom,
			C.turnScripted,
			C.turnManual,
			C.turnNarrator,
			C.turnAdvise,
		]
		for (const p of pins) {
			const bare = p.id.replace(/@\d+$/, '')
			const name = (p.descriptor as { i18n?: { name?: { en?: string } } }).i18n?.name?.en
			assert.equal(TURN_STRATEGY_NAMES[bare], name, p.id)
		}
		assert.equal(Object.keys(TURN_STRATEGY_NAMES).length, pins.length)
	})
	test('a stored id with or without its version; a plugin strategy by its slug; none when unnamed', () => {
		assert.equal(turnStrategyName('core:task/turn-manual@1', en), 'Manual')
		assert.equal(turnStrategyName('core:task/turn-manual@1@1', en), 'Manual')
		assert.equal(turnStrategyName('acme:task/dice@2', en), 'dice')
		assert.equal(turnStrategyName(null, en), null)
	})
})

describe('the view', () => {
	test('the head says what the composer line says; the head row is due, the rest follow', () => {
		const v = view({
			turnOrder: doc({
				order: [
					{ ref: 'character:3', via: 'strategy' },
					{ ref: 'character:4', via: 'strategy' },
				],
			}),
		})
		assert.equal(v.status, 'ordered')
		assert.equal(v.head, 'Wren is ready to continue')
		assert.equal(v.headFace, '/media/w')
		assert.deepEqual(
			v.rows.map((r) => [r.name, r.state, r.chip, r.face]),
			[
				['Wren', 'due', 'Due', '/media/w'],
				['Bee', 'then', 'Then', null],
			],
		)
		assert.deepEqual(v.continueTurn, {
			enabled: true,
			reason: null,
			label: 'Continue with Wren',
			channel: 'main',
		})
		assert.deepEqual(v.pick, { enabled: true, reason: null })
		assert.equal(v.strategy, 'Strategy: Round robin')
	})
	test("the viewer's persona is You, and its turn is taken by writing", () => {
		const v = view({
			turnOrder: doc({
				order: [
					{ ref: 'character:8', via: 'strategy' },
					{ ref: 'character:3', via: 'strategy' },
				],
			}),
		})
		assert.equal(v.head, 'Your turn')
		assert.deepEqual(
			v.rows.map((r) => r.state),
			['you', 'then'],
		)
		assert.equal(v.continueTurn.enabled, false)
		assert.equal(v.continueTurn.reason, "A person's turn is taken by writing.")
	})
	test("someone else's persona is their turn; a null ref is the narrator's", () => {
		assert.equal(
			view({ turnOrder: doc({ order: [{ ref: 'character:9', via: 'strategy' }] }) }).head,
			"Sable's turn",
		)
		const voice = view({
			turnOrder: doc({ order: [{ ref: null, via: 'voice', channel: 'sanctum' }] }),
		})
		assert.equal(voice.head, 'The narrator is ready to continue')
		assert.equal(voice.headIsVoice, true)
		assert.equal(voice.continueTurn.channel, 'sanctum')
	})
	test('nothing prepared: waiting with people to pick, else why it is empty', () => {
		const waiting = view()
		assert.equal(waiting.status, 'waiting')
		assert.equal(waiting.head, 'Waiting for a message — or pick who speaks next')
		assert.deepEqual(waiting.continueTurn, {
			enabled: false,
			reason: 'Nothing is prepared to take a turn.',
			label: 'Continue',
		})
		const never = view({ turnOrder: doc({ candidates: [], computedAt: 0 }) })
		assert.equal(never.status, 'empty')
		assert.equal(never.head, null)
		assert.match(never.empty!, /worked out after the next message/)
		assert.deepEqual(never.pick, { enabled: false, reason: 'Nobody is seated to pick.' })
	})
	test('faces off draws none; the strategy line hides with its setting', () => {
		const v = view({
			turnOrder: doc({ order: [{ ref: 'character:3', via: 'strategy' }] }),
			settings: { faces: false, showStrategy: false, showBenched: false },
		})
		assert.equal(v.headFace, null)
		assert.equal(v.rows[0]!.face, null)
		assert.equal(v.strategy, null)
	})
	test('W6: benched characters are listed under the order only with showBenched — never a persona', () => {
		const benched: SessionCharactersV1 = {
			...cast,
			members: [
				...cast.members,
				{ ...cast.members[0]!, ref: 'character:5', characterId: 5, name: 'Moss', face: '/media/m', benched: true },
			],
		}
		const order = doc({ order: [{ ref: 'character:3', via: 'strategy' }] })
		assert.deepEqual(view({ turnOrder: order, characters: benched }).benched, [])
		const on = view({ turnOrder: order, characters: benched, settings: { ...TURN_ORDER_DEFAULTS, showBenched: true } })
		assert.deepEqual(
			on.benched.map((r) => [r.ref, r.name, r.state, r.chip, r.face]),
			[['character:5', 'Moss', 'benched', 'Benched', '/media/m']],
		)
		// The order itself is unchanged: a benched character takes no turn.
		assert.deepEqual(on.rows.map((r) => r.ref), ['character:3'])
		const faceless = view({
			turnOrder: order,
			characters: benched,
			settings: { faces: false, showStrategy: true, showBenched: true },
		})
		assert.equal(faceless.benched[0]!.face, null)
	})
	test('a guest with no seat watches: both controls greyed with the reason; a guest with one may act', () => {
		const order = doc({ order: [{ ref: 'character:3', via: 'strategy' }] })
		const watching = view({
			turnOrder: order,
			viewer: GUEST,
			characters: { ...cast, members: [cast.members[0]!] },
		})
		assert.equal(watching.continueTurn.enabled, false)
		assert.match(watching.continueTurn.reason!, /^Guests without a seat/)
		assert.equal(watching.pick.enabled, false)
		const seated = view({
			turnOrder: order,
			viewer: { ...GUEST, userId: 3 },
			characters: { ...cast, members: [cast.members[0]!] },
		})
		assert.equal(seated.continueTurn.enabled, true)
	})
	test("a genre's own turn controls decide where it lists them", () => {
		const action = (key: string, over: Partial<WidgetAction> = {}): WidgetAction => ({
			key,
			specSlug: 'core',
			name: key,
			slash: key,
			quick: false,
			audience: { see: ['participant'], act: ['participant'] },
			venue: 'extra',
			origin: 'core',
			floor: false,
			canAct: true,
			itemGated: false,
			isNew: false,
			...over,
		})
		const actions: ActionsV1 = {
			extra: {
				primary: [
					action('advance', {
						enabled: false,
						reason: { i18n: { en: 'wait for the reply to finish' } },
					}),
					action('pick', { canAct: false }),
				],
				overflow: [],
			},
		}
		const v = view({
			turnOrder: doc({ order: [{ ref: 'character:3', via: 'strategy' }] }),
			actions,
		})
		assert.deepEqual(
			[v.continueTurn.enabled, v.continueTurn.reason],
			[false, 'Wait for the reply to finish'],
		)
		assert.deepEqual(v.pick, {
			enabled: false,
			reason: 'You may not move the turns on in this session.',
		})
		// Listed and enabled with nothing prepared: the owner carries on (a narrator turn).
		const carry = view({ actions: { extra: { primary: [action('advance')], overflow: [] } } })
		assert.equal(carry.continueTurn.enabled, true)
	})
})
