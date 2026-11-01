/**
 * The Jinja filter seam of `render` (speech build seam S3): a host hands
 * `render` its filters; the engine owns only the syntax.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { render, checkTemplate, extractRefs, type JinjaFilter } from '@serene-pub/sdk'

const upper: JinjaFilter = (v) => String(v).toUpperCase()
const excl: JinjaFilter = (v) => `${v}!`
const evens: JinjaFilter = (v) => (Array.isArray(v) ? v.filter((_, i) => i % 2 === 0) : [])
const scopeAware: JinjaFilter = (_v, scope) => String(scope.who)
const filters = { upper, excl, evens, scopeAware }

describe('render with filters', () => {
	test('a known filter is applied', () => {
		assert.equal(render('{{ a | upper }}', { a: 'hi' }, { filters }), 'HI')
	})
	test('filters chain left to right', () => {
		assert.equal(render('{{ a | upper | excl }}', { a: 'hi' }, { filters }), 'HI!')
		assert.equal(render('{{a|excl|upper}}', { a: 'hi' }, { filters }), 'HI!')
	})
	test('a filter is handed the render scope', () => {
		assert.equal(render('{{ a | scopeAware }}', { a: 'x', who: 'ann' }, { filters }), 'ann')
	})
	test('an unknown filter yields nothing, never its input', () => {
		assert.equal(render('[{{ a | nope }}]', { a: 'hi' }, { filters }), '[]')
		assert.equal(render('[{{ a | upper | nope }}]', { a: 'hi' }, { filters }), '[]')
	})
	test('a filter that was not handed at all yields nothing', () => {
		assert.equal(render('[{{ a | upper }}]', { a: 'hi' }), '[]')
		assert.equal(render('[{{ a | upper }}]', { a: 'hi' }, {}), '[]')
	})
	test('an unknown filter in a loop header yields an empty loop', () => {
		assert.equal(render('[{% for c in xs | nope %}{{ c }}{% endfor %}]', { xs: [1, 2] }, { filters }), '[]')
	})
	test('{% for c in xs | f %} iterates the filter output', () => {
		assert.equal(render('{% for c in xs | evens %}{{ c }},{% endfor %}', { xs: [1, 2, 3, 4, 5] }, { filters }), '1,3,5,')
	})
	test('a filter inside a loop body sees the loop item', () => {
		assert.equal(
			render('{% for c in xs %}{{ c.t | upper }};{% endfor %}', { xs: [{ t: 'a' }, { t: 'b' }] }, { filters }),
			'A;B;',
		)
	})
	test('a missing value gives the filter undefined, and an empty string out when it returns nothing', () => {
		const seen: unknown[] = []
		render('{{ missing | probe }}', {}, { filters: { probe: (v) => (seen.push(v), undefined) } })
		assert.deepEqual(seen, [undefined])
		assert.equal(render('[{{ missing | probe }}]', {}, { filters: { probe: () => undefined } }), '[]')
	})
	test('output is byte-identical to the no-filter path when the source has no pipe', () => {
		const sources = [
			'plain text',
			'{{ a }} and {{ b.c }}',
			'{% for x in xs %}<{{ x }}>{% endfor %}',
			"{% if a == 'b' %}yes{% else %}{% endif %}{% if a %}t{% endif %}",
			'{% set n = 3 %}{{ n }}',
			'{{ missing }}|{{ a }}',
		]
		const scope = { a: 'b', b: { c: 'cc' }, xs: [1, 2, 3] }
		for (const src of sources)
			assert.equal(render(src, scope, { filters }), render(src, scope), src)
	})
})

describe('static checks strip filters', () => {
	test('checkTemplate is clean on `a.b | f`', () => {
		assert.deepEqual(checkTemplate('{{ a.b | f }}', { a: { type: 'object', fields: { b: { type: 'string' } } } as never }), [])
		assert.deepEqual(checkTemplate('{% for c in xs | f %}{{ c }}{% endfor %}', { xs: 'any' }), [])
	})
	test('checkTemplate still catches an unknown name behind a filter', () => {
		const findings = checkTemplate('{{ ghost | f }}', { a: 'any' })
		assert.ok(findings.some((f) => f.severity === 'error' && /ghost/.test(f.message)), JSON.stringify(findings))
	})
	test('extractRefs reports the path before the pipe', () => {
		const refs = extractRefs('{{ a.b | f | g }}')
		assert.deepEqual(refs.map((r) => [r.root, r.path]), [['a', ['b']]])
		const loop = extractRefs('{% for c in xs.ys | f %}{{ c }}{% endfor %}')
		assert.ok(loop.some((r) => r.root === 'xs' && r.path.join('.') === 'ys'))
		assert.ok(refs.every((r) => !r.dynamic))
	})
})
