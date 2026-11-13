/**
 * Variable layouts, SDK half: the template check reads `layout` calls
 * (Handlebars helper, Liquid filter) and `variableLayoutCalls` lists them.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { checkTemplateSource, variableLayoutCalls } from '@serene-pub/sdk/template-check'
import type { TemplateCheckOptions, TemplateScope } from '@serene-pub/sdk'

const HBS = 'core:template/handlebars@1'
const LIQUID = 'core:template/liquid@1'

const SCOPE: TemplateScope = {
	characters: {
		type: 'list',
		of: { type: 'object', fields: { name: { type: 'string' } } },
		laidOutBy: 'core:var/characters@1',
	},
	personas: {
		type: 'list',
		of: { type: 'object', fields: { name: { type: 'string' } } },
		laidOutBy: 'core:var/personas@1',
	},
	sessionMessages: { type: 'list', of: { type: 'object', fields: { name: { type: 'string' } } } },
	scenario: { type: 'string' },
}

const OFFERS: TemplateCheckOptions['variableLayoutOffers'] = {
	'core:var/characters@1': [
		{ reference: 'core/json@1', label: 'JSON' },
		{ reference: 'core/prose@1', label: 'Prose' },
	],
	'core:var/personas@1': [],
}
const WITH: TemplateCheckOptions = { variableLayoutOffers: OFFERS }

const hbs = (src: string, options: TemplateCheckOptions = WITH) =>
	checkTemplateSource(HBS, src, SCOPE, options)
const liq = (src: string, options: TemplateCheckOptions = WITH) =>
	checkTemplateSource(LIQUID, src, SCOPE, options)

describe('layout calls: valid', () => {
	test('a valid call has no findings, in both engines', () => {
		assert.deepEqual(hbs('{{{layout characters "core/json@1"}}}'), [])
		assert.deepEqual(liq('{{ characters | layout: "core/json@1" }}'), [])
	})
	test('layout is known when helpers omit it', () => {
		assert.deepEqual(hbs('{{{layout characters "core/json@1"}}}', { ...WITH, helpers: [] }), [])
	})
	test('blocks and assign are checked in place', () => {
		assert.deepEqual(hbs('{{#if scenario}}{{{layout characters "core/json@1"}}}{{/if}}'), [])
		assert.deepEqual(liq('{% assign x = characters | layout: "core/json@1" %}{{ x }}'), [])
	})
})

describe('layout calls: the key', () => {
	test('a key no variable layout writes out', () => {
		const f = hbs('{{{layout sessionMessages "core/json@1"}}}')
		assert.equal(f.length, 1)
		assert.equal(f[0]!.kind, 'layout-argument')
		assert.equal(f[0]!.severity, 'error')
		assert.match(f[0]!.message, /"sessionMessages" is not written out by a variable layout/)
		assert.match(f[0]!.message, /Write \{\{\{sessionMessages\}\}\}\./)
		assert.deepEqual(f[0]!.available, ['characters', 'personas'])
		const l = liq('{{ scenario | layout: "core/json@1" }}')
		assert.equal(l.length, 1)
		assert.equal(l[0]!.kind, 'layout-argument')
		assert.match(l[0]!.message, /Write \{\{ scenario \}\}\./)
	})
	test('a missing key is one unknown-name, not two', () => {
		for (const f of [
			hbs('{{{layout nothing "core/json@1"}}}'),
			liq('{{ nothing | layout: "core/json@1" }}'),
		]) {
			assert.equal(f.length, 1)
			assert.equal(f[0]!.kind, 'unknown-name')
		}
	})
	test('a Liquid local is not a laid-out variable', () => {
		const f = liq('{% assign x = 1 %}{{ x | layout: "core/json@1" }}')
		assert.equal(f.length, 1)
		assert.equal(f[0]!.kind, 'layout-argument')
	})
})

describe('layout calls: shape', () => {
	test('a path for a key', () => {
		const f = hbs('{{{layout characters.name "core/json@1"}}}').filter(
			(x) => x.kind === 'layout-argument',
		)
		assert.equal(f.length, 1)
		assert.equal(f[0]!.kind, 'layout-argument')
		assert.match(f[0]!.message, /layout takes a variable in scope/)
	})
	test('a non-literal reference: path and subexpression', () => {
		for (const src of [
			'{{{layout characters scenario}}}',
			'{{{layout characters (lower scenario)}}}',
		]) {
			const f = hbs(src, { ...WITH, helpers: ['lower'] })
			assert.equal(f.length, 1, src)
			assert.equal(f[0]!.kind, 'layout-argument')
			assert.match(f[0]!.message, /second argument is a layout reference in quotes/)
		}
		const l = liq('{{ characters | layout: scenario }}')
		assert.equal(l.length, 1)
		assert.equal(l[0]!.kind, 'layout-argument')
	})
	test('wrong arity', () => {
		for (const src of [
			'{{{layout characters}}}',
			'{{{layout characters "core/json@1" 2}}}',
			'{{{layout}}}',
		])
			assert.equal(hbs(src)[0]!.kind, 'layout-argument', src)
		for (const src of [
			'{{ characters | layout }}',
			'{{ characters | layout: "core/json@1", "core/prose@1" }}',
		])
			assert.equal(liq(src)[0]!.kind, 'layout-argument', src)
	})
	test('hash and keyword arguments', () => {
		const f = hbs('{{{layout characters "core/json@1" as="x"}}}')
		assert.equal(f[0]!.kind, 'layout-argument')
		const l = liq('{{ characters | layout: as: "core/json@1" }}')
		assert.equal(l.length, 1)
		assert.equal(l[0]!.kind, 'layout-argument')
	})
	test('block form', () => {
		const f = hbs('{{#layout characters "core/json@1"}}x{{/layout}}')
		assert.equal(f.length, 1)
		assert.equal(f[0]!.kind, 'layout-argument')
	})
	test('Liquid: not first, or not straight after a bare name', () => {
		for (const src of [
			'{{ characters | upcase | layout: "core/json@1" }}',
			'{{ characters.name | layout: "core/json@1" }}',
			'{{ "x" | layout: "core/json@1" }}',
			'{{ (1..3) | layout: "core/json@1" }}',
		]) {
			const f = liq(src).filter((x) => x.kind === 'layout-argument')
			assert.equal(f.length, 1, src)
			assert.match(f[0]!.message, /layout comes straight after the variable's name/)
		}
	})
	test('layout inside a subexpression is checked', () => {
		const opts = { ...WITH, helpers: ['pad'] }
		assert.deepEqual(hbs('{{pad (layout characters "core/json@1") 2}}', opts), [])
		const f = hbs('{{pad (layout characters "nope") 2}}', opts)
		assert.equal(f.length, 1)
		assert.equal(f[0]!.kind, 'unknown-layout')
	})
})

describe('layout calls: the reference', () => {
	test('a malformed reference is an error even without offers', () => {
		for (const f of [
			hbs('{{{layout characters "json"}}}', {}),
			liq('{{ characters | layout: "json" }}', {}),
		]) {
			assert.equal(f.length, 1)
			assert.equal(f[0]!.kind, 'unknown-layout')
			assert.equal(f[0]!.severity, 'error')
			assert.match(f[0]!.message, /"json" isn't a layout reference/)
		}
	})
	test('an unknown reference with offers: error, suggestion, exact span', () => {
		for (const [src, f] of [
			['{{{layout characters "core/json@2"}}}', hbs('{{{layout characters "core/json@2"}}}')],
			[
				'{{ characters | layout: "core/json@2" }}',
				liq('{{ characters | layout: "core/json@2" }}'),
			],
		] as const) {
			assert.equal(f.length, 1)
			const x = f[0]!
			assert.equal(x.kind, 'unknown-layout')
			assert.equal(x.severity, 'error')
			assert.equal(x.suggestion, 'core/json@1')
			assert.match(x.message, /Did you mean "core\/json@1"\?/)
			assert.deepEqual(x.available, ['core/json@1', 'core/prose@1'])
			assert.equal(src.slice(x.start, x.end), 'core/json@2')
			assert.equal(x.name, 'core/json@2')
			assert.equal(x.line, 1)
			assert.equal(x.column, x.start! + 1)
			assert.ok(x.tag && src.slice(x.tag.start, x.tag.end).includes('layout'))
		}
	})
	test('positions on a later line', () => {
		const src = 'a\nb {{{layout characters "core/jsn@1"}}}'
		const x = hbs(src)[0]!
		assert.equal(src.slice(x.start, x.end), 'core/jsn@1')
		assert.equal(x.line, 2)
		const l = 'a\nb {{ characters | layout: "core/jsn@1" }}'
		const y = liq(l)[0]!
		assert.equal(l.slice(y.start, y.end), 'core/jsn@1')
		assert.equal(y.line, 2)
	})
	test('a variable that offers none', () => {
		const f = hbs('{{{layout personas "core/json@1"}}}')
		assert.equal(f[0]!.kind, 'unknown-layout')
		assert.equal(f[0]!.fix, 'personas offers no layouts here')
	})
	test('without offers a well-formed reference passes', () => {
		for (const f of [
			hbs('{{{layout characters "core/json@1"}}}', {}),
			liq('{{ characters | layout: "core/json@1" }}', {}),
		]) {
			assert.equal(f.length, 0)
		}
	})
})

describe('variableLayoutCalls', () => {
	test('Handlebars: order, duplicates, nesting, ungrammatical references', () => {
		const src =
			'{{{layout characters "core/json@1"}}}{{#if x}}{{{layout personas "bad"}}}{{/if}}' +
			'{{{layout characters "core/json@1"}}}{{pad (layout characters "a/b@2") 1}}'
		assert.deepEqual(variableLayoutCalls(HBS, src, { helpers: ['pad'] }), [
			{ key: 'characters', reference: 'core/json@1' },
			{ key: 'personas', reference: 'bad' },
			{ key: 'characters', reference: 'core/json@1' },
			{ key: 'characters', reference: 'a/b@2' },
		])
	})
	test('Liquid: order, duplicates, nesting, assign', () => {
		const src =
			'{{ characters | layout: "core/json@1" }}{% if x %}{% for a in b %}{{ personas | layout: "bad" }}{% endfor %}{% endif %}' +
			'{% assign y = characters | layout: "core/json@1" %}'
		assert.deepEqual(variableLayoutCalls(LIQUID, src), [
			{ key: 'characters', reference: 'core/json@1' },
			{ key: 'personas', reference: 'bad' },
			{ key: 'characters', reference: 'core/json@1' },
		])
	})
	test('shape errors are not listed', () => {
		assert.deepEqual(
			variableLayoutCalls(
				HBS,
				'{{{layout characters.name "a/b@1"}}}{{{layout characters scenario}}}{{{layout characters}}}{{{layout characters "a/b@1" 2}}}',
			),
			[],
		)
		assert.deepEqual(
			variableLayoutCalls(
				LIQUID,
				'{{ characters | upcase | layout: "a/b@1" }}{{ characters.name | layout: "a/b@1" }}{{ characters | layout: x }}{{ characters | layout }}',
			),
			[],
		)
	})
	test('a source that does not parse, or an unknown engine, lists nothing', () => {
		assert.deepEqual(variableLayoutCalls(HBS, '{{{layout characters "a/b@1"'), [])
		assert.deepEqual(variableLayoutCalls(LIQUID, '{{ characters | layout: "a/b@1"'), [])
		assert.deepEqual(
			variableLayoutCalls('acme:template/other@1', '{{{layout characters "a/b@1"}}}'),
			[],
		)
	})
})
