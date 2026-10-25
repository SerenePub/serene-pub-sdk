/**
 * Conditions (lane 2, A5 — PLAN-layering D6): the typed view `sessionOf(genre)`,
 * the builders that turn its properties into the stored `ConditionDecl`, and
 * the evaluator over the published values — "some cast member" (`*`) and
 * absence included. The compile-time half (a missing property, a wrong enum
 * member) is `sessionOf.assert.ts`.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	and,
	annexField,
	conditionFindings,
	conditionPropsOf,
	defineAttributeSlot,
	eq,
	evaluateCondition,
	genre,
	gt,
	gte,
	isConditionProp,
	isTrue,
	lt,
	lte,
	not,
	oneOf,
	or,
	same,
	sessionOf,
	vocabulary,
	type ConditionDecl,
} from '@serene-pub/sdk'

const weather = defineAttributeSlot('cond:slot/weather@1', {
	type: 'enum',
	descriptor: 'The weather.',
	appliesTo: ['world'],
	config: { of: ['clear', 'rain', 'storm'] },
})
const inCombat = defineAttributeSlot('cond:slot/in-combat@1', {
	type: 'boolean',
	descriptor: 'Whether a fight is on.',
	appliesTo: ['world'],
})
const hp = defineAttributeSlot('cond:slot/hp@1', {
	type: 'integer',
	descriptor: 'Health.',
	appliesTo: ['cast'],
})
const mood = defineAttributeSlot('cond:slot/mood@1', {
	type: 'enum',
	descriptor: 'Mood.',
	appliesTo: ['cast'],
	config: { of: ['calm', 'angry'] },
})
const danger = defineAttributeSlot('cond:slot/danger@1', {
	type: 'integer',
	descriptor: 'How dangerous a place is.',
	appliesTo: ['location'],
})
const shields = defineAttributeSlot('cond:slot/shields@1', {
	type: 'integer',
	descriptor: 'Shields.',
	appliesTo: ['cast'],
})

// 🚧 RF fix 8: a genre brings no slots — the table's words are a vocabulary its rules would play.
const g = genre('cond:genre/table', {
	name: 'Table',
	family: 'story',
	shape: { fields: { tone: { type: 'enum', of: ['grounded', 'grim'] }, tools: { type: 'boolean' } } },
})
const table = vocabulary('cond:vocabulary/table@1', { world: { weather, inCombat }, cast: { hp, mood }, location: { danger } })
const scifi = vocabulary('cond:vocabulary/ships@1', { cast: { shields } })
const roll = annexField({ key: 'last-roll', shape: { type: 'integer' } })
const s = sessionOf(g, { vocabularies: [table, scifi], annex: { 'cond.dice': [roll] } })

/** A published-values document shaped as the app builds it (`publishedValues.ts`). */
const doc = (over: Record<string, unknown> = {}) => ({
	session: { generating: false, fields: { tone: 'grim', tools: true }, openForm: null },
	state: {
		world: { weather: 'storm', 'in-combat': true },
		cast: {
			byId: { '1': { id: 1, key: 'verity', name: 'Verity', hp: 0, mood: 'calm' }, '2': { id: 2, key: 'ash', name: 'Ash', hp: 7, mood: 'angry', shields: 2 } },
			verity: { id: 1 },
			ash: { id: 2 },
		},
		locations: { byId: { '9': { id: 9, key: 'harbor', name: 'Harbor', danger: 3 } } },
		version: 4,
	},
	sprites: { byId: { '1': { set: 'default', label: 'armoured' } } },
	backdrop: { set: false, mediaId: null },
	annex: { cond_dice: { 'last-roll': 17 } },
	...over,
})

describe('sessionOf(genre) — the typed view, from declarations only', () => {
	test('each leaf is a condition property carrying its stored path and type', () => {
		assert.ok(isConditionProp(s.world.weather))
		assert.equal(s.world.weather.path, 'state.world.weather')
		assert.equal(s.world.weather.type, 'enum')
		assert.deepEqual(s.world.weather.members, ['clear', 'rain', 'storm'])
		assert.equal(s.world.weather.slot, weather.id)
		assert.equal(s.world.inCombat.path, 'state.world.in-combat')
		assert.equal(s.world.inCombat.type, 'boolean')
		assert.equal(s.cast.any.hp.path, 'state.cast.byId.*.hp')
		assert.equal(s.cast.any.hp.type, 'number')
		assert.equal(s.fields.tone.path, 'session.fields.tone')
		assert.deepEqual(s.fields.tone.members, ['grounded', 'grim'])
	})

	test('the vocabularies passed and annex fields are read too (RF fix 8: a genre brings no slots or sheets)', () => {
		assert.equal((s.locations.any as Record<string, { path: string }>).danger?.path, 'state.locations.byId.*.danger')
		assert.equal(s.cast.any.shields.path, 'state.cast.byId.*.shields')
		assert.equal(s.annex['cond.dice'].lastRoll.path, 'annex.cond_dice.last-roll')
	})

	test('the host’s fixed facts are there for every genre', () => {
		assert.equal(s.generating.path, 'session.generating')
		// 🚧 R51, R52: the story lane's turn, round and last speaker.
		assert.equal(s.turn.path, 'session.turn')
		assert.equal(s.round.path, 'session.round')
		assert.equal(s.lastSpeaker.path, 'session.lastSpeaker')
		assert.equal(evaluateCondition(gte(s.round, 2), { session: { round: 3 } }), true)
		assert.equal(evaluateCondition(eq(s.lastSpeaker, 'narrator'), { session: { lastSpeaker: 'character:4' } }), false)
		assert.equal(s.openForm.action.path, 'session.openForm.action')
		assert.equal(s.backdrop.set.path, 'backdrop.set')
		assert.equal(s.sprites.any.label.path, 'sprites.byId.*.label')
		assert.equal(s.message.isNewest.path, 'item.isNewest')
	})

	test('a property no declaration made is absent at run time too', () => {
		assert.equal((s.world as Record<string, unknown>).wind, undefined)
		assert.equal((s.world as Record<string, unknown>).hp, undefined, 'hp attaches to the cast')
		assert.throws(() => isTrue((s.world as any).wind), /condition property/)
	})

	test('conditionPropsOf lists every property by the name a picker shows', () => {
		const names = conditionPropsOf(s).map((p) => p.name)
		for (const n of ['world.weather', 'cast.any.hp', 'cast.any.shields', 'locations.any.danger', 'fields.tone', 'annex.cond.dice.lastRoll', 'message.speaker', 'sprites.any.set'])
			assert.ok(names.includes(n), n)
	})
})

describe('the builders produce the stored form', () => {
	test('each builder writes one leaf, the path only as the stored string', () => {
		assert.deepEqual(isTrue(s.world.inCombat), { on: 'state.world.in-combat', truthy: true })
		assert.deepEqual(eq(s.world.weather, 'storm'), { on: 'state.world.weather', equals: 'storm' })
		assert.deepEqual(gt(s.cast.any.hp, 0), { on: 'state.cast.byId.*.hp', gt: 0 })
		assert.deepEqual(gte(s.cast.any.hp, 1), { on: 'state.cast.byId.*.hp', gte: 1 })
		assert.deepEqual(lt(s.cast.any.hp, 5), { on: 'state.cast.byId.*.hp', lt: 5 })
		assert.deepEqual(lte(s.cast.any.hp, 5), { on: 'state.cast.byId.*.hp', lte: 5 })
		assert.deepEqual(oneOf(s.world.weather, ['rain', 'storm']), { on: 'state.world.weather', in: ['rain', 'storm'] })
		assert.deepEqual(same(s.cast.any.mood, s.fields.tone as never), { on: 'state.cast.byId.*.mood', equalsPath: 'session.fields.tone' })
	})

	test('and · or · not compose', () => {
		const c = and(eq(s.world.weather, 'storm'), or(gt(s.cast.any.hp, 0), not(isTrue(s.world.inCombat))))
		assert.deepEqual(c, {
			all: [
				{ on: 'state.world.weather', equals: 'storm' },
				{ any: [{ on: 'state.cast.byId.*.hp', gt: 0 }, { not: { on: 'state.world.in-combat', truthy: true } }] },
			],
		})
		assert.deepEqual(conditionFindings(c), [])
	})

	test('same refuses "any member" on its second side; numbers must be finite', () => {
		assert.throws(() => same(s.world.weather as never, s.cast.any.mood as never), /second property names one value/)
		assert.throws(() => gt(s.cast.any.hp, Number.NaN), /finite number/)
		assert.throws(() => oneOf(s.world.weather, []), /one or more/)
	})
})

describe('evaluateCondition — any cast member, absence', () => {
	test('a plain leaf reads its value', () => {
		assert.equal(evaluateCondition(eq(s.world.weather, 'storm'), doc()), true)
		assert.equal(evaluateCondition(eq(s.world.weather, 'rain'), doc()), false)
		assert.equal(evaluateCondition(isTrue(s.world.inCombat), doc()), true)
		assert.equal(evaluateCondition(eq(s.fields.tone, 'grim'), doc()), true)
		assert.equal(evaluateCondition(gt(s.annex['cond.dice'].lastRoll, 10), doc()), true)
	})

	test('`cast.any` holds when SOME member holds; its `not` when none does', () => {
		assert.equal(evaluateCondition(gt(s.cast.any.hp, 0), doc()), true, 'Ash stands')
		assert.equal(evaluateCondition(gt(s.cast.any.hp, 7), doc()), false)
		assert.equal(evaluateCondition(eq(s.cast.any.mood, 'angry'), doc()), true)
		assert.equal(evaluateCondition(not(gt(s.cast.any.hp, 7)), doc()), true, 'nobody above 7')
		assert.equal(evaluateCondition(lte(s.cast.any.shields, 2), doc()), true, 'one member has shields')
		assert.equal(evaluateCondition(gt((s.locations.any as any).danger, 2), doc()), true)
		assert.equal(evaluateCondition(eq(s.sprites.any.label, 'armoured'), doc()), true)
	})

	test('any-member compares against one other value', () => {
		const c = same(s.cast.any.mood, s.fields.tone as never)
		assert.equal(evaluateCondition(c, doc()), false)
		assert.equal(evaluateCondition(c, doc({ session: { generating: false, fields: { tone: 'calm' }, openForm: null } })), true)
	})

	test('absent is false — a missing world value, an empty cast, a message on an event', () => {
		const empty = doc({ state: { world: {}, cast: { byId: {} }, locations: { byId: {} }, version: 0 } })
		assert.equal(evaluateCondition(eq(s.world.weather, 'storm'), empty), false)
		assert.equal(evaluateCondition(gt(s.cast.any.hp, -100), empty), false)
		assert.equal(evaluateCondition(not(gt(s.cast.any.hp, -100)), empty), true)
		assert.equal(evaluateCondition(isTrue(s.message.isNewest), doc()), false, 'no item on an event')
		assert.equal(evaluateCondition(eq(s.message.isNewest, true), doc({ item: { isNewest: true } })), true)
		assert.equal(evaluateCondition(isTrue(s.openForm.action), doc()), false, 'openForm null')
	})

	test('a registration without when always runs; nothing throws on junk', () => {
		assert.equal(evaluateCondition(undefined, doc()), true)
		assert.equal(evaluateCondition({ on: 'state.cast.byId.*.__proto__', truthy: true } as ConditionDecl, doc()), false)
		assert.equal(evaluateCondition({ on: 'state.*.*.*', truthy: true } as ConditionDecl, null), false)
	})
})

describe('conditionFindings — the `*` segment', () => {
	test('`*` stands alone, in `on` only', () => {
		assert.deepEqual(conditionFindings({ on: 'state.cast.byId.*.hp', gt: 0 }), [])
		assert.match(conditionFindings({ on: 'state.cast.byId.h*.hp', gt: 0 })[0] ?? '', /stands alone/)
		assert.match(conditionFindings({ on: 'state.world.weather', equalsPath: 'state.cast.byId.*.mood' })[0] ?? '', /names one value/)
	})
})
