import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	definePluginVariable,
	formatVariableLayoutReference,
	laidOutScope,
	parseVariableLayoutReference,
	templateSeedProblems,
	variableIdParts,
	variableLayout,
	variableLayoutOffersFor,
	type TemplateScope,
	type VariableDecl,
} from '@serene-pub/sdk'

describe('the layout reference grammar', () => {
	test('parses good references', () => {
		assert.deepEqual(parseVariableLayoutReference('core/json@1'), {
			owner: 'core',
			slug: 'json',
			major: 1,
		})
		assert.deepEqual(parseVariableLayoutReference('acme.dice/titled-json@12'), {
			owner: 'acme.dice',
			slug: 'titled-json',
			major: 12,
		})
	})

	test('refuses what is not one', () => {
		for (const bad of [
			'core/json',
			'core/json@0',
			'Core/json@1',
			'core/Json@1',
			'acme:template/omens-prose@1',
			'acme:json@1',
			'',
			1,
			null,
			undefined,
			{},
		])
			assert.equal(parseVariableLayoutReference(bad), null, String(bad))
	})

	test('format round-trips and throws per bad part', () => {
		const parts = { owner: 'acme.dice', slug: 'prose', major: 2 }
		assert.equal(formatVariableLayoutReference(parts), 'acme.dice/prose@2')
		assert.deepEqual(parseVariableLayoutReference(formatVariableLayoutReference(parts)), parts)
		assert.throws(() => formatVariableLayoutReference({ ...parts, owner: 'Acme' }), /owner/)
		assert.throws(() => formatVariableLayoutReference({ ...parts, slug: 'Prose' }), /slug/)
		assert.throws(() => formatVariableLayoutReference({ ...parts, major: 0 }), /major/)
		assert.throws(() => formatVariableLayoutReference({ ...parts, major: 1.5 }), /major/)
	})
})

describe('variableIdParts', () => {
	test('splits variable ids, tolerating camelCase names', () => {
		assert.deepEqual(variableIdParts('core:var/characters@1'), {
			owner: 'core',
			name: 'characters',
			major: 1,
		})
		assert.deepEqual(variableIdParts('acme.dice:var/rollLog@3'), {
			owner: 'acme.dice',
			name: 'rollLog',
			major: 3,
		})
	})
	test('refuses the rest', () => {
		for (const bad of ['core:template/x@1', 'core:var/x', 'core:var/x@', 'var/x@1', 4, null])
			assert.equal(variableIdParts(bad), null, String(bad))
	})
})

describe('laidOutScope', () => {
	const scope: TemplateScope = {
		characters: { type: 'list', description: 'cast' },
		any: 'any',
		names: ['a', 'b'],
		other: { type: 'string' },
	}
	const before = JSON.stringify(scope)
	const out = laidOutScope(scope, {
		characters: 'core:var/characters@1',
		any: 'x:var/any@1',
		names: 'x:var/names@1',
		ghost: 'x:var/ghost@1',
	})

	test('marks a VarField root and keeps its declaration', () => {
		assert.deepEqual(out.characters, {
			type: 'list',
			description: 'cast',
			laidOutBy: 'core:var/characters@1',
		})
	})
	test("an 'any' or string[] root becomes an optional string", () => {
		assert.deepEqual(out.any, { type: 'string', optional: true, laidOutBy: 'x:var/any@1' })
		assert.deepEqual(out.names, { type: 'string', optional: true, laidOutBy: 'x:var/names@1' })
	})
	test('skips a key that is not a root, leaves the rest, never mutates', () => {
		assert.equal('ghost' in out, false)
		assert.deepEqual(out.other, { type: 'string' })
		assert.equal(JSON.stringify(scope), before)
		assert.notEqual(out, scope)
	})
})

describe('variableLayoutOffersFor', () => {
	const scope = laidOutScope(
		{ characters: 'any', plain: { type: 'string' } },
		{ characters: 'core:var/characters@1' },
	)
	const offers = { 'core:var/characters@1': [{ reference: 'core/json@1', label: 'JSON' }] }
	test('returns the offers of the writing variable', () => {
		assert.deepEqual(
			variableLayoutOffersFor(scope, 'characters', offers),
			offers['core:var/characters@1'],
		)
	})
	test('empty when not laid out, no offers, unknown key, or variable has none', () => {
		assert.deepEqual(variableLayoutOffersFor(scope, 'plain', offers), [])
		assert.deepEqual(variableLayoutOffersFor(scope, 'characters', undefined), [])
		assert.deepEqual(variableLayoutOffersFor(scope, 'nope', offers), [])
		assert.deepEqual(variableLayoutOffersFor(scope, 'characters', { 'other:var/x@1': [] }), [])
	})
})

describe('variableLayout', () => {
	const rollLog = definePluginVariable('acme.dice', {
		id: 'acme.dice:var/rollLog@1',
		scope: { rollLog: 'any' },
		sample: [],
	})
	const input = {
		slug: 'prose',
		major: 1,
		label: 'Prose',
		engine: 'core:template/handlebars@1',
		source: '{{rollLog}}',
	}

	test('builds the seed for a plugin variable, kebabing a camelCase name', () => {
		const seed = variableLayout('acme.dice', rollLog, input)
		assert.deepEqual(seed, {
			id: 'acme.dice:template/roll-log-prose@1',
			kind: 'variables',
			variableId: 'acme.dice:var/rollLog@1',
			slug: 'prose',
			engine: 'core:template/handlebars@1',
			body: '{{rollLog}}',
			label: 'Prose',
		})
		assert.deepEqual(templateSeedProblems(seed, 'acme.dice'), [])
	})

	test("builds for another package's variable", () => {
		const characters = {
			id: 'core:var/characters@1',
			scope: { characters: 'any' },
			sample: [],
		} as VariableDecl
		const seed = variableLayout('acme.dice', characters, { ...input, slug: 'omens', major: 2 })
		assert.equal(seed.id, 'acme.dice:template/characters-omens@2')
		assert.equal(seed.variableId, 'core:var/characters@1')
	})

	test('refuses each bad part, naming plugin and variable', () => {
		const bad = (over: object, re: RegExp) =>
			assert.throws(
				() => variableLayout('acme.dice', rollLog, { ...input, ...over } as never),
				(e: Error) => {
					assert.match(e.message, /acme\.dice/)
					assert.match(e.message, /rollLog/)
					assert.match(e.message, re)
					return true
				},
			)
		bad({ slug: 'Prose' }, /slug/)
		bad({ major: 0 }, /major/)
		bad({ label: '' }, /label/)
		bad({ engine: '' }, /engine/)
		bad({ source: 3 }, /source/)
		assert.throws(
			() => variableLayout('acme.dice', { id: 'nope' } as never, input),
			/not a variable id/,
		)
	})

	test('surfaces a templateSeedProblems problem', () => {
		assert.throws(() => variableLayout('core', rollLog, input), /reserved|namespace/)
	})
})
