import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validate } from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const errors = (doc: any) => validate(doc).filter((f: any) => f.severity === 'error')

describe('household (slice-of-life)', () => {
	test('a relational entry type to a person, with the three roles', () => {
		const entryTypes = (cat.sliceOfLifeTemplate as any).ruleset.entryTypes as any[]
		const household = entryTypes.find((e) => e.id === 'household')
		assert.ok(household, 'the archetype declares household')
		assert.equal(household.relational, true)
		assert.equal(household.farEnd, 'person')
		assert.deepEqual(household.fields.role.of, ['head', 'member', 'guest'])
		assert.equal(household.fields.role.default, 'member')
	})
})

describe('the day\'s weather', () => {
	const pick = (value: unknown) => new Function('value', cat.WEATHER_PICK_SCRIPT.source)(value) as any[]
	const kinds = cat.weatherKinds()
	const day = (n: number) => ({ session: { sessionId: 7 }, kinds, clock: { from: { year: 1, month: 1, day: n }, to: { year: 1, month: 1, day: n + 1 } } })

	test('is listed, validates, and writes the world\'s weather through set-state in apply mode', () => {
		assert.ok(cat.CORE_SPECS.some((s) => s.slug === cat.WEATHER_SPEC_ID))
		const doc = cat.weatherSpec() as any
		assert.deepEqual(errors(doc), [])
		const values = doc.presets.find((p: any) => p.default).values
		assert.deepEqual(values.find((v: any) => v.nodeKey === 'apply' && v.slot === 'params').value, { mode: 'apply' })
	})
	test('the same (session, day) gives the same kind, and it is one of the slot\'s kinds', () => {
		const a = pick(day(3)), b = pick(day(3))
		assert.deepEqual(a, b)
		assert.equal(a.length, 1)
		assert.equal(a[0].owner, 'world')
		assert.equal(a[0].slot, 'core:slot/weather@1')
		assert.ok(kinds.includes(a[0].value))
		const seen = new Set(Array.from({ length: 40 }, (_, n) => pick(day(n + 1))[0].value))
		assert.ok(seen.size > 1, 'days differ')
	})
	test('writes nothing without a clock', () => {
		assert.deepEqual(pick({ session: { sessionId: 7 }, kinds, clock: null }), [])
		assert.deepEqual(pick({ session: { sessionId: 7 }, kinds, clock: { from: null } }), [])
	})
})

describe('a routine that writes as a character', () => {
	test('validates; opens a generating row for the speaker on the channel, then fills it with the model\'s text', () => {
		const doc = cat.characterReachesOutSpec({ speaker: 'character:7', channel: 'diary', brief: 'Write the player a note.' }) as any
		assert.deepEqual(errors(doc), [])
		const node = (key: string) => doc.nodes.find((n: any) => n.key === key)
		assert.deepEqual(node('placeholder').config, { generating: true, channel: 'diary', speaker: 'character:7' })
		assert.equal(node('save').config.target.node, 'placeholder')
		assert.equal(node('save').config.text.node, 'reachWrite')
		assert.equal(node('reachWrite').definitionId, 'core:oracle/generate-text')
		assert.ok(doc.nodes.findIndex((n: any) => n.key === 'placeholder') < doc.nodes.findIndex((n: any) => n.key === 'save'))
	})
	test('the channel defaults to main', () => {
		const doc = cat.characterReachesOutSpec({ speaker: 'character:7', brief: 'Hi' }) as any
		assert.equal(doc.nodes.find((n: any) => n.key === 'placeholder').config.channel, 'main')
	})
})
