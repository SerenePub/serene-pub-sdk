/**
 * Typed templates P4 (2026-09-27): `checkTemplateSource` — the one checker for
 * Handlebars and Liquid source, moved out of the host.
 *
 * Parse-only, conservative: an unknown root or a contradicted path is a
 * finding with its name, where it is, what exists instead and the nearest of
 * those; `'any'` roots, record keys and dynamic lookups are never guessed at.
 * The host's helpers are an input. Where the scope has untyped sources
 * (`templateScopeReport().untyped`), name findings are warnings.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	checkTemplateSource,
	checkTemplateSourceReport,
	canCheckTemplateEngine,
} from '@serene-pub/sdk/template-check'
import {
	handlebarsPath,
	nearestName,
	resolveHandlebarsPath,
	rootHandlebarsReach,
	enterHandlebarsBlock,
} from '@serene-pub/sdk'
import type { TemplateScope } from '@serene-pub/sdk'

const HBS = 'core:template/handlebars@1'
const LIQUID = 'core:template/liquid@1'

const SCOPE: TemplateScope = {
	scenario: { type: 'string' },
	anything: 'any',
	characters: {
		type: 'list',
		of: {
			type: 'object',
			fields: {
				name: { type: 'string' },
				nickname: { type: 'string', optional: true },
				'extra lore': { type: 'record', of: { type: 'string' } },
			},
		},
	},
	postHistory: { type: 'object', fields: { instructions: { type: 'string' } } },
}

const HOST = {
	helpers: ['eq', 'and', 'json', 'isSet', 'systemBlock'],
	liquid: {
		blockTags: ['systemBlock', 'assistantBlock'],
		filters: ['json', 'pad'],
		refusedTags: { include: "'include' is not available" },
	},
}

const kinds = (engine: string, src: string, scope = SCOPE, opts = {}) =>
	checkTemplateSource(engine, src, scope, { ...HOST, ...opts }).map(
		(f) => `${f.kind}:${f.path ?? f.name}`,
	)

describe('unknown names, in both engines', () => {
	test('Handlebars: an unknown root is named, with its position and what exists', () => {
		const src = 'a\n{{#if scenario}}{{{scenaro}}}{{/if}}'
		const [f, ...rest] = checkTemplateSource(HBS, src, SCOPE, HOST)
		assert.equal(rest.length, 0)
		assert.equal(f!.kind, 'unknown-name')
		assert.equal(f!.severity, 'error')
		assert.equal(f!.name, 'scenaro')
		assert.equal(f!.line, 2)
		assert.equal(src.slice(f!.start, f!.end), 'scenaro')
		assert.deepEqual(src.slice(f!.tag!.start, f!.tag!.end), '{{{scenaro}}}')
		assert.ok(f!.available!.includes('scenario'))
		assert.match(
			f!.message,
			/"scenaro" isn't a recognized field at this scope, so it renders as nothing/,
		)
	})

	test('Liquid: an unknown root is named, with its position', () => {
		const src = 'a\n{% if scenario %}{{ scenaro }}{% endif %}'
		const [f, ...rest] = checkTemplateSource(LIQUID, src, SCOPE, HOST)
		assert.equal(rest.length, 0)
		assert.equal(f!.kind, 'unknown-name')
		assert.equal(f!.name, 'scenaro')
		assert.equal(f!.line, 2)
		assert.equal(src.slice(f!.start, f!.end), 'scenaro')
	})

	test('a typed path the declaration contradicts is caught in both engines', () => {
		assert.deepEqual(kinds(HBS, '{{postHistory.instructons}}'), [
			'unknown-path:postHistory.instructons',
		])
		assert.deepEqual(kinds(LIQUID, '{{ postHistory.instructons }}'), [
			'unknown-path:postHistory.instructons',
		])
		assert.deepEqual(kinds(HBS, '{{characters.name}}'), ['unknown-path:characters.name'])
	})

	test('Liquid answers size/first/last on a list without a declaration', () => {
		assert.deepEqual(
			kinds(
				LIQUID,
				'{{ characters.size }}{{ characters.first.name }}{{ characters.last.nmae }}',
			),
			['unknown-path:characters.last.nmae'],
		)
	})

	test('a syntax error is the only finding, and carries the engine position', () => {
		const h = checkTemplateSource(HBS, 'a\nb\n{{#if x}}{{/each}}', SCOPE, HOST)
		assert.equal(h.length, 1)
		assert.equal(h[0]!.kind, 'syntax')
		assert.equal(h[0]!.line, 3)
		const l = checkTemplateSource(LIQUID, 'x\n{% include "y" %}', SCOPE, HOST)
		assert.equal(l[0]!.kind, 'syntax')
		assert.match(l[0]!.message, /'include' is not available/)
		assert.equal(l[0]!.line, 2)
		assert.match(
			checkTemplateSource(LIQUID, '{{ x | jsonvalue }}', SCOPE, HOST)[0]!.message,
			/undefined filter: jsonvalue/,
		)
	})

	test("an engine it cannot read is 'not checked', never clean", () => {
		assert.equal(canCheckTemplateEngine('acme.x:template/mustache@1'), false)
		assert.deepEqual(
			checkTemplateSourceReport('acme.x:template/mustache@1', '{{ nope }}', SCOPE),
			{
				checked: false,
				findings: [],
			},
		)
	})
})

describe('did you mean', () => {
	test('the nearest name rides on the finding and in the message', () => {
		const [root] = checkTemplateSource(HBS, '{{characterz}}', SCOPE, HOST)
		assert.equal(root!.suggestion, 'characters')
		assert.match(root!.message, /Did you mean "characters"\?/)
		const [path] = checkTemplateSource(
			HBS,
			'{{#each characters}}{{this.nickanme}}{{/each}}',
			SCOPE,
			HOST,
		)
		assert.equal(path!.suggestion, 'nickname')
		assert.match(path!.message, /'this\.nickanme' does not exist/)
		assert.match(path!.message, /Did you mean "nickname"\?/)
	})

	test('nothing near enough adds no guess', () => {
		const [f] = checkTemplateSource(HBS, '{{completelyUnrelated}}', SCOPE, HOST)
		assert.equal(f!.suggestion, undefined)
		assert.doesNotMatch(f!.message, /Did you mean/)
	})

	test('nearestName is tight and stable', () => {
		assert.equal(nearestName('nickanme', ['name', 'nickname']), 'nickname')
		assert.equal(nearestName('abcd', ['name']), undefined)
		assert.equal(nearestName('ab', ['ax', 'bb']), 'ax')
	})
})

describe('what stays unchecked', () => {
	test("an 'any' root, a record key and a dynamic lookup are never guessed at", () => {
		assert.deepEqual(
			kinds(HBS, '{{anything.deep.path}}{{#each anything}}{{this.whatever}}{{/each}}'),
			[],
		)
		assert.deepEqual(
			kinds(
				LIQUID,
				'{{ anything.deep.path }}{% for x in anything %}{{ x.whatever }}{% endfor %}',
			),
			[],
		)
		assert.deepEqual(
			kinds(HBS, '{{#each characters}}{{this.[extra lore].whoever}}{{/each}}'),
			[],
		)
		assert.deepEqual(
			kinds(
				HBS,
				'{{#each characters as |c i|}}{{#each (lookup ../characters i)}}{{this.x}}{{/each}}{{/each}}',
			),
			[],
		)
		assert.deepEqual(kinds(LIQUID, '{% assign k = "name" %}{{ postHistory[k] }}'), [])
	})

	test('loop bindings, locals, @data and forloop are never scope names', () => {
		assert.deepEqual(
			kinds(
				HBS,
				'{{#each characters as |c i|}}{{c.name}}{{i}}{{@index}}{{@root.scenario}}{{/each}}',
			),
			[],
		)
		assert.deepEqual(
			kinds(
				LIQUID,
				'{% for c in characters %}{{ c.name }}{{ forloop.index0 }}{% endfor %}{% assign z = scenario %}{{ z }}',
			),
			[],
		)
	})
})

describe('each/with element scopes', () => {
	test('inside an each, a bare name and this.x resolve against the element', () => {
		assert.deepEqual(kinds(HBS, '{{#each characters}}{{name}}{{this.nickname}}{{/each}}'), [])
		assert.deepEqual(kinds(HBS, '{{#each characters}}{{nmae}}{{/each}}'), ['unknown-path:nmae'])
	})

	test('a block param is bound to the element, the second to nothing checkable', () => {
		assert.deepEqual(
			kinds(HBS, '{{#each characters as |c i|}}{{c.name}}{{i.whatever}}{{/each}}'),
			[],
		)
		assert.deepEqual(kinds(HBS, '{{#each characters as |c|}}{{c.nmae}}{{/each}}'), [
			'unknown-path:c.nmae',
		])
	})

	test('with narrows; ../ climbs back out; an else branch is back outside', () => {
		assert.deepEqual(
			kinds(HBS, '{{#with postHistory}}{{instructions}}{{instrctions}}{{/with}}'),
			['unknown-path:instrctions'],
		)
		assert.deepEqual(kinds(HBS, '{{#each characters}}{{../scenario}}{{../scenaro}}{{/each}}'), [
			'unknown-name:../scenaro',
		])
		assert.deepEqual(
			kinds(HBS, '{{#each characters}}{{name}}{{else}}{{scenario}}{{name}}{{/each}}'),
			['unknown-name:name'],
		)
	})

	test('if keeps the reach it was opened in', () => {
		assert.deepEqual(kinds(HBS, '{{#if scenario}}{{postHistory.instructions}}{{/if}}'), [])
		assert.deepEqual(
			kinds(HBS, '{{#each characters}}{{#if name}}{{nickname}}{{/if}}{{/each}}'),
			[],
		)
	})

	test('the shared reach reads a path as Handlebars does', () => {
		const reach = enterHandlebarsBlock(rootHandlebarsReach(), 'each', SCOPE.characters, ['c'])
		assert.equal(resolveHandlebarsPath(handlebarsPath('c.name'), reach, SCOPE).kind, 'resolved')
		// `this.c` is scoped: never the block param, so it reads the element.
		const scoped = resolveHandlebarsPath(handlebarsPath('this.c'), reach, SCOPE)
		assert.equal(scoped.kind === 'resolved' && scoped.resolution.ok, false)
		assert.equal(
			resolveHandlebarsPath(handlebarsPath('../../x'), reach, SCOPE).kind,
			'unchecked',
		)
	})
})

describe('untyped sources → warnings, never errors', () => {
	const untyped = ["'planner' (core:task/plan@1).templateContext"]

	test('an unknown name is a warning that says who might supply it', () => {
		for (const [engine, src] of [
			[HBS, '{{{mystery}}}'],
			[LIQUID, '{{ mystery }}'],
		] as const) {
			const [f] = checkTemplateSource(engine, src, SCOPE, { ...HOST, untyped })
			assert.equal(f!.severity, 'warning', engine)
			assert.match(f!.message, /It may still come from 'planner'/)
		}
	})

	test('a contradicted path is a warning too; a syntax error stays an error', () => {
		assert.equal(
			checkTemplateSource(HBS, '{{characters.name}}', SCOPE, { untyped })[0]!.severity,
			'warning',
		)
		assert.equal(
			checkTemplateSource(HBS, '{{#if x}}', SCOPE, { untyped })[0]!.severity,
			'error',
		)
	})

	test('with no untyped source the same finding is an error', () => {
		assert.equal(
			checkTemplateSource(HBS, '{{{mystery}}}', SCOPE, { untyped: [] })[0]!.severity,
			'error',
		)
	})
})

describe('helpers are the host’s input', () => {
	test('a helper the host passes is a helper; its arguments are still checked', () => {
		assert.deepEqual(kinds(HBS, '{{{json characters 2}}}{{#if (isSet scenario)}}x{{/if}}'), [])
		assert.deepEqual(kinds(HBS, '{{{json characterz 2}}}'), ['unknown-name:characterz'])
		assert.deepEqual(kinds(HBS, '{{#if (and scenario somethingElse)}}x{{/if}}'), [
			'unknown-name:somethingElse',
		])
	})

	test('without the host’s list, its helpers are unknown — nothing app-specific is hard-coded', () => {
		const f = checkTemplateSource(
			HBS,
			'{{{json scenario 2}}}{{#systemBlock}}x{{/systemBlock}}',
			SCOPE,
		)
		assert.deepEqual(
			f.map((x) => `${x.kind}:${x.name}`),
			['unknown-helper:json', 'unknown-helper:systemBlock'],
		)
		assert.match(f[1]!.message, /"systemBlock" isn't a recognized helper/)
	})

	test('a misspelled block helper suggests the registered one', () => {
		const [f] = checkTemplateSource(HBS, '{{#esch characters}}{{/esch}}', SCOPE, HOST)
		assert.equal(f!.kind, 'unknown-helper')
		assert.equal(f!.suggestion, 'each')
	})

	test('Liquid block tags and filters the host passes parse; their arguments are read', () => {
		assert.deepEqual(
			kinds(LIQUID, '{% systemBlock %}{{ scenario | json }}{% endsystemBlock %}'),
			[],
		)
		assert.deepEqual(
			kinds(LIQUID, '{% assistantBlock id: mistery %}x{% endassistantBlock %}'),
			['unknown-name:mistery'],
		)
		assert.equal(
			checkTemplateSource(LIQUID, '{% systemBlock %}x{% endsystemBlock %}', SCOPE)[0]!.kind,
			'syntax',
		)
	})
})
