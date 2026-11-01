/**
 * 🚧 M0, lane T3: the `flag` attribute kind, `scope` + `owner` (and
 * ⏳ `carriedBy` mapped onto them), a slot's `scope` check, and a `schedule`
 * field's JSON schema.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	_clearAttributeSlots,
	attributeKindsOfSlotType,
	checkValues,
	defineAttributeSlot,
	jsonSchemaOf,
	rulesetAttributeFindings,
	rulesetAttributeOwners,
	rulesetAttributeSlotProps,
	type RulesetAttributeDecl,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const flag = (over: Partial<RulesetAttributeDecl> = {}): RulesetAttributeDecl =>
	({ id: 'asleep', name: { en: 'Asleep' }, kind: 'flag', prose: 'Asleep: whether they are asleep.', ...over }) as RulesetAttributeDecl
const said = (a: RulesetAttributeDecl) => rulesetAttributeFindings(a, 'attributes[0]')

describe('a flag', () => {
	test('is a boolean slot that starts false', () => {
		assert.equal(rulesetAttributeSlotProps(flag())!.type, 'boolean')
		assert.equal(rulesetAttributeSlotProps(flag())!.default, false)
		assert.equal(rulesetAttributeSlotProps(flag({ start: true }))!.default, true)
		assert.deepEqual(attributeKindsOfSlotType('boolean'), ['flag'])
		assert.deepEqual(said(flag()), [])
	})

	test('has no bounds and names no words', () => {
		assert.ok(said(flag({ bounds: { min: 0 } })).some((f) => f.includes('attributes[0]: a flag is true or false; it has no bounds.')))
		assert.ok(said(flag({ of: ['a'] })).some((f) => f.includes('attributes[0]: a flag is true or false; it names no words.')))
	})
})

describe('scope and owner', () => {
	test('scope and owner say only their words', () => {
		assert.ok(said(flag({ scope: 'forever' as never })).some((f) => f.includes("attributes[0].scope is 'forever'. Say 'session' or 'world'.")))
		assert.ok(said(flag({ owner: 'moon' as never })).some((f) => f.includes("attributes[0].owner is 'moon'. Say 'player', 'cast', 'world' or 'location'.")))
		assert.deepEqual(said(flag({ scope: 'world', owner: 'world' })), [])
	})

	test('owner maps to the owners; carriedBy is the older spelling', () => {
		assert.deepEqual(rulesetAttributeOwners({ owner: 'player' }), ['cast'])
		assert.deepEqual(rulesetAttributeOwners({ owner: 'cast' }), ['cast'])
		assert.deepEqual(rulesetAttributeOwners({ owner: 'world' }), ['world'])
		assert.deepEqual(rulesetAttributeOwners({ owner: 'location' }), ['location'])
		assert.deepEqual(rulesetAttributeOwners({ carriedBy: ['world', 'location'] }), ['world', 'location'])
		assert.deepEqual(rulesetAttributeOwners({ carriedBy: [] }), ['cast'])
		assert.deepEqual(rulesetAttributeOwners({}), ['cast'])
		assert.deepEqual(rulesetAttributeSlotProps(flag({ carriedBy: ['world'] }))!.appliesTo, ['world'])
		assert.deepEqual(rulesetAttributeSlotProps(flag({ owner: 'location', scope: 'world' }))!.appliesTo, ['location'])
		assert.equal(rulesetAttributeSlotProps(flag({ scope: 'world' }))!.scope, 'world')
	})

	test('owner and carriedBy together are refused', () => {
		assert.ok(said(flag({ owner: 'cast', carriedBy: ['cast'] })).some((f) => f.includes('attributes[0] says both owner and carriedBy; say owner — carriedBy is the older spelling.')))
	})

	test('a holder-only attribute passes for player and cast, not for world', () => {
		assert.deepEqual(said(flag({ owner: 'player', visibility: 'holder' })), [])
		assert.deepEqual(said(flag({ owner: 'cast', visibility: 'holder' })), [])
		assert.ok(said(flag({ owner: 'world', visibility: 'holder' })).length > 0)
	})

	test('a slot says scope session or world', () => {
		_clearAttributeSlots()
		const props = (scope: string) => ({ type: 'boolean' as const, descriptor: 'x', appliesTo: ['cast' as const], scope: scope as 'world' })
		assert.throws(() => defineAttributeSlot('core:slot/t3-a@1', props('forever')), /declares scope 'forever'. Say 'session' — its values end with the session — or 'world' — they live on the book./)
		assert.doesNotThrow(() => defineAttributeSlot('core:slot/t3-b@1', props('world')))
		assert.doesNotThrow(() => defineAttributeSlot('core:slot/t3-c@1', props('session')))
	})

	test('every core ruleset attribute carries a scope', () => {
		for (const t of cat.RULESET_TEMPLATES)
			for (const a of ((t.ruleset as { attributes?: RulesetAttributeDecl[] }).attributes ?? [])) if (a.slot === undefined) assert.equal(a.scope, 'session', `${t.id} ${a.id}`)
	})
})

describe('a schedule field', () => {
	test('is an object of two lists of [hour, where] pairs', () => {
		const decl = { ...cat.locationEntryType.entryShape, id: 'core:entry/location@1', fields: { ...cat.locationEntryType.entryShape.fields, routine: { type: 'schedule' as const } } }
		const routine = (jsonSchemaOf(decl as never) as any).properties.routine
		assert.equal(routine.type, 'object')
		assert.deepEqual(Object.keys(routine.properties), ['weekday', 'weekend'])
		const pair = routine.properties.weekday.items
		assert.deepEqual(pair.prefixItems, [{ type: 'integer', minimum: 0, maximum: 23 }, { type: 'string', minLength: 1 }])
		assert.deepEqual([pair.minItems, pair.maxItems], [2, 2])
	})

	test('a value is a weekly routine, hours rising, each with a place', () => {
		const check = (v: unknown) => checkValues({ routine: { type: 'schedule' } }, { routine: v }).map((f) => f.message)
		assert.deepEqual(check({ weekday: [[7, 'work'], [18, 'home']], weekend: [[9, 'leisure']] }), [])
		assert.deepEqual(check({ weekday: [], weekend: [] }), [])
		assert.match(check('x')[0]!, /must be a weekly routine — \{ weekday, weekend \}, each a list of \[hour, where\]/)
		assert.match(check({ weekday: [] })[0]!, /must be a weekly routine/)
		for (const bad of [[[7, 'a'], [7, 'b']], [[24, 'a']], [[7.5, 'a']], [[7, '']], [[7]], [[8, 'a'], [7, 'b']]])
			assert.match(check({ weekday: bad, weekend: [] })[0]!, /needs, in each \[hour, where\], an hour from 0 to 23 in rising order and a place/)
	})
})
