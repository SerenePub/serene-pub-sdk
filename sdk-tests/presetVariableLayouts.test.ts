import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { genre, preset, presetVariableLayoutFindings, sessionEvents } from '@serene-pub/sdk'

const g = genre('vl:genre/story', {
	name: 'Story',
	family: 'story',
	events: { [sessionEvents.messageRespond]: { required: true } },
})
const base = { slug: 'tidy', genre: g, label: 'Tidy' }

describe('preset variableLayouts', () => {
	test('stores the map as a fresh copy', () => {
		const map = { 'core:var/characters@1': 'core/json@1' }
		const p = preset({ ...base, variableLayouts: map })
		assert.deepEqual(p.variableLayouts, map)
		assert.notEqual(p.variableLayouts, map)
	})

	test('omits it when absent or empty', () => {
		assert.equal('variableLayouts' in preset(base), false)
		assert.equal('variableLayouts' in preset({ ...base, variableLayouts: {} }), false)
	})

	test('refuses a bad key, naming the preset and the key', () => {
		assert.throws(
			() => preset({ ...base, variableLayouts: { characters: 'core/json@1' } }),
			/preset 'tidy'.*'characters'/,
		)
	})

	test('refuses a bad reference, naming the preset, key and value', () => {
		assert.throws(
			() => preset({ ...base, variableLayouts: { 'core:var/characters@1': 'json' } }),
			/preset 'tidy'.*'core:var\/characters@1'.*'json'/,
		)
	})

	test('accepts a reference to a layout nobody installed', () => {
		const p = preset({
			...base,
			variableLayouts: { 'core:var/characters@1': 'ghost.plugin/nothing@9' },
		})
		assert.equal(p.variableLayouts?.['core:var/characters@1'], 'ghost.plugin/nothing@9')
	})
})

describe('presetVariableLayoutFindings', () => {
	test('clean or absent is empty', () => {
		assert.deepEqual(presetVariableLayoutFindings(undefined), [])
		assert.deepEqual(presetVariableLayoutFindings({ slug: 's' }), [])
		assert.deepEqual(
			presetVariableLayoutFindings({
				slug: 's',
				variableLayouts: { 'core:var/characters@1': 'core/json@1' },
			}),
			[],
		)
	})
	test('a non-object gives one sentence with the shape', () => {
		for (const bad of ['x', 3, null, ['a']]) {
			const f = presetVariableLayoutFindings({ slug: 's', variableLayouts: bad })
			assert.equal(f.length, 1)
			assert.match(f[0]!, /^preset 's'/)
			assert.match(f[0]!, /core:var\/characters@1.*core\/json@1/)
		}
	})
	test('bad key and bad value each get a sentence', () => {
		const f = presetVariableLayoutFindings({
			slug: 's',
			variableLayouts: { nope: 'core/json@1', 'core:var/characters@1': 'core/json' },
		})
		assert.equal(f.length, 2)
		assert.match(f[0]!, /^preset 's'.*'nope'/)
		assert.match(f[1]!, /^preset 's'.*'core:var\/characters@1'.*'core\/json'/)
	})
})
