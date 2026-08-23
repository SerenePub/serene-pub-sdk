/**
 * Variable schemas — a declaration you can walk, and a sample that cannot lie
 * about it.
 *
 * `TemplateScope` used to be `Record<string, 'any' | string[]>`: field *names*,
 * no types, no nesting. An editor built on that can offer a list of six words
 * and nothing else, and — the reason this test exists — nothing could check
 * whether those six words were true. Two of `characters`' six were not.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	allVariables,
	checkScopeSample,
	checkTemplate,
	checkValue,
	checkVariableSamples,
	getVariable,
	resolvePath,
	sampleValues,
} from '@serene-pub/sdk'
import type { VarField } from '@serene-pub/sdk'

// ── every core sample validates against its own scope ───────────────────────
//
// The one test this slice is for. A sample is what the layout editor renders a
// live preview against, so a sample whose shape is wrong shows the author a
// preview that works and a chat that doesn't.
describe('core declarations', () => {
	test('every sample matches the schema it is declared beside', () => {
		assert.deepEqual(checkVariableSamples(), [])
	})

	test('every core variable declares a real schema rather than a legacy form', () => {
		const legacy = allVariables()
			.filter((v) => v.id.startsWith('core:'))
			.flatMap((v) =>
				Object.entries(v.scope)
					.filter(([, d]) => d === 'any' || Array.isArray(d))
					.map(([k]) => `${v.id}.${k}`),
			)
		assert.deepEqual(legacy, [])
	})

	// The two lies, pinned. Both were wrong in the direction that hurts: they
	// named a field an author could write and get nothing back from, and empty
	// is indistinguishable from "this character has no bound lore".
	test('a character card names "extra lore", not "lore"', () => {
		const fields = (getVariable('core:var/characters@1')!.scope.characters as VarField).of!.fields!
		assert.ok(fields['extra lore'], 'the key attachCharacterLoreToCharacters actually writes')
		assert.equal(fields.lore, undefined, 'never written by anything')
	})

	test('a character card does not claim an exampleDialogue field', () => {
		const fields = (getVariable('core:var/characters@1')!.scope.characters as VarField).of!.fields!
		assert.equal(fields.exampleDialogue, undefined)
		// It is a top-level variable, resolved from the speaking character.
		assert.ok(getVariable('core:var/example-dialogue@1'))
	})

	test('characterNames is a string, because joinWithAnd already ran', () => {
		assert.deepEqual(getVariable('core:var/character-names@1')!.scope.characterNames, {
			type: 'string',
		})
	})
})

// ── the value check ─────────────────────────────────────────────────────────
describe('checkValue', () => {
	const card: VarField = {
		type: 'object',
		fields: {
			name: { type: 'string' },
			nickname: { type: 'string', optional: true },
			lore: { type: 'record', of: { type: 'string' }, optional: true },
		},
	}

	test('a matching value passes', () => {
		assert.deepEqual(checkValue({ name: 'Ash', lore: { a: 'b' } }, card), [])
	})

	test('a missing required field is named', () => {
		const f = checkValue({ nickname: 'Ash' }, card, 'characters[0]')
		assert.equal(f.length, 1)
		assert.match(f[0]!, /characters\[0\]\.name: declared but missing/)
	})

	test('an optional field may be absent, or present and null', () => {
		assert.deepEqual(checkValue({ name: 'Ash' }, card), [])
		assert.deepEqual(checkValue({ name: 'Ash', nickname: null }, card), [])
	})

	// An incomplete schema is a completion list missing an entry the author
	// needs, silently — which is how `lore` survived as long as it did.
	test('a field the sample carries and the schema omits is an error', () => {
		const f = checkValue({ name: 'Ash', personality: 'terse' }, card)
		assert.equal(f.length, 1)
		assert.match(f[0]!, /personality: present in the sample but not declared/)
	})

	test('a wrong scalar type says what it got', () => {
		const f = checkValue({ name: 42 }, card)
		assert.equal(f.length, 1)
		assert.match(f[0]!, /expected a string, got a number/)
	})

	test('a list checks each element, and reports the index', () => {
		const list: VarField = { type: 'list', of: card }
		const f = checkValue([{ name: 'Ash' }, { nickname: 'Bran' }], list, 'characters')
		assert.equal(f.length, 1)
		assert.match(f[0]!, /characters\[1\]\.name/)
	})

	test('an object where a list is declared is caught', () => {
		const f = checkValue({ name: 'Ash' }, { type: 'list', of: card })
		assert.equal(f.length, 1)
		assert.match(f[0]!, /expected a list, got a object/)
	})

	test('a record checks its values and reports the key', () => {
		const f = checkValue({ 'The Gate': 3 }, { type: 'record', of: { type: 'string' } }, 'worldLore')
		assert.equal(f.length, 1)
		assert.match(f[0]!, /worldLore\.The Gate: expected a string, got a number/)
	})

	test('a list is not a record', () => {
		const f = checkValue([], { type: 'record', of: { type: 'string' } })
		assert.equal(f.length, 1)
		assert.match(f[0]!, /expected a record, got a list/)
	})
})

// ── scope-level checking, and the legacy forms ──────────────────────────────
describe('checkScopeSample', () => {
	test('a key with no sampled value is reported', () => {
		const f = checkScopeSample({}, { characters: { type: 'list', of: { type: 'string' } } })
		assert.equal(f.length, 1)
		assert.match(f[0]!, /characters: declared in scope but the sample supplies no value/)
	})

	// Unchecked by definition, and a bare list of names carries no types to
	// check against. Failing an honest declaration that predates the schema
	// would make the upgrade break plugins to buy nothing.
	test("legacy 'any' and string[] declarations are skipped, not failed", () => {
		assert.deepEqual(checkScopeSample({ a: 1, b: 2 }, { a: 'any', b: ['x', 'y'] }), [])
	})

	test('the label prefixes every finding, so a failure names the declaration', () => {
		const f = checkScopeSample({ x: 1 }, { x: { type: 'string' } }, 'core:var/thing@1')
		assert.match(f[0]!, /^core:var\/thing@1 x: expected a string/)
	})
})

// ── how a sample spreads across its scope ───────────────────────────────────
describe('sampleValues', () => {
	test('a single-key scope takes the sample whole', () => {
		assert.deepEqual(sampleValues({ scope: { characters: 'any' }, sample: [1, 2] }), {
			characters: [1, 2],
		})
	})

	test('a multi-key scope reads one key per entry', () => {
		assert.deepEqual(
			sampleValues({ scope: { a: 'any', b: 'any' }, sample: { a: 1, b: 2 } }),
			{ a: 1, b: 2 },
		)
	})

	test('a multi-key scope with no object sample yields undefined per key', () => {
		assert.deepEqual(sampleValues({ scope: { a: 'any', b: 'any' }, sample: 'oops' }), {
			a: undefined,
			b: undefined,
		})
	})
})

// ── what checkTemplate does with the new form ───────────────────────────────
//
// Still root-only: the context-tracking path walk is the next slice. What
// changes here is only which declarations can answer "is this a field?".
describe('checkTemplate over a schema', () => {
	test('an object schema checks first-level fields, as string[] always did', () => {
		const scope = {
			entry: { type: 'object', fields: { title: { type: 'string' }, content: { type: 'string' } } },
		} as const
		assert.deepEqual(checkTemplate('{{ entry.title }}', scope), [])
		const f = checkTemplate('{{ entry.nope }}', scope)
		assert.equal(f.length, 1)
		assert.match(f[0]!.fix, /title, content/)
	})

	// `characters` is a list, so `path[0]` is an index and there is no field
	// name to compare against. The old declaration flattened the element's
	// fields onto the root, which made `{{ characters.name }}` pass and
	// `{{ characters.0.name }}` fail — both backwards.
	test('a list root has no first-level field names to check', () => {
		const scope = { characters: { type: 'list' as const, of: { type: 'string' as const } } }
		assert.deepEqual(checkTemplate('{{ characters.0 }}', scope), [])
	})

	test('an unknown root is still caught whatever the form', () => {
		const f = checkTemplate('{{ nope }}', { entry: { type: 'string' as const } })
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /'nope' is not available/)
	})
})

// ── slice 2 · walking a path against the schema ─────────────────────────────
//
// The reason the schema was worth widening. Before this, a reference through a
// loop variable went entirely unchecked — and a loop body is the only place a
// template writes a nested path at all, so "unchecked inside loops" meant
// "unchecked wherever the typos are".
describe('resolvePath', () => {
	const characters: VarField = {
		type: 'list',
		of: {
			type: 'object',
			fields: {
				name: { type: 'string' },
				'extra lore': { type: 'record', of: { type: 'string' } },
			},
		},
	}

	test('a correct path resolves and reports its type', () => {
		const r = resolvePath(characters, ['0', 'name'])
		assert.equal(r.ok, true)
		assert.deepEqual(r.field, { type: 'string' })
	})

	test('a misspelled field is caught, and the message names the full path', () => {
		const r = resolvePath(characters, ['0', 'nickanme'], 'characters')
		assert.equal(r.ok, false)
		assert.match(r.message!, /'characters\.0\.nickanme' does not exist/)
		assert.deepEqual(r.available, ['name', 'extra lore'])
	})

	// The old flattened `string[]` accepted exactly this and rejected
	// `characters.0.name`. Both backwards, and this is the correction.
	test('reading a field off a list says to loop over it instead', () => {
		const r = resolvePath(characters, ['name'], 'characters')
		assert.equal(r.ok, false)
		assert.match(r.message!, /is a list, so it is reached by position/)
		assert.match(r.message!, /Loop over it and read 'name' from each entry/)
	})

	test('a list answers length', () => {
		assert.equal(resolvePath(characters, ['length']).ok, true)
	})

	test('a path into a scalar is a category error, and says which', () => {
		const r = resolvePath({ type: 'string' }, ['name'], 'scenario')
		assert.equal(r.ok, false)
		assert.match(r.message!, /'scenario' is a string/)
	})

	// A record's keys are chosen by whoever wrote the data. Any key is
	// plausible, none is verifiable, and flagging one would put a squiggle
	// under a working template.
	test("a record accepts any key and keeps walking the value's type", () => {
		const r = resolvePath(characters, ['0', 'extra lore', 'The Ashguard brand'])
		assert.equal(r.ok, true)
		assert.deepEqual(r.field, { type: 'string' })
	})

	test('what cannot be checked is not reported', () => {
		for (const decl of ['any' as const, undefined])
			assert.equal(resolvePath(decl, ['anything', 'at', 'all']).ok, true)
		// A legacy `string[]` is the in-between case: it can still answer for
		// its own first segment, and nothing deeper.
		assert.equal(resolvePath(['name'], ['name', 'deep', 'deeper']).ok, true)
	})

	test('a legacy string[] still answers for its own first segment', () => {
		const r = resolvePath(['title', 'content'], ['nope'], 'entry')
		assert.equal(r.ok, false)
		assert.deepEqual(r.available, ['title', 'content'])
	})
})

describe('checkTemplate through a loop', () => {
	const scope = {
		characters: {
			type: 'list' as const,
			of: {
				type: 'object' as const,
				fields: {
					name: { type: 'string' as const },
					lore: { type: 'record' as const, of: { type: 'string' as const } },
				},
			},
		},
	}

	test('a correct nested path through a loop is not flagged', () => {
		assert.deepEqual(checkTemplate('{% for c in characters %}{{ c.name }}{% endfor %}', scope), [])
	})

	test('a misspelled path through a loop is caught', () => {
		const f = checkTemplate('{% for c in characters %}{{ c.nmae }}{% endfor %}', scope)
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /'c\.nmae' does not exist/)
		assert.match(f[0]!.fix, /'c' has: name, lore/)
	})

	test('a nested loop resolves through its parent binding', () => {
		const src =
			'{% for c in characters %}{% for l in c.lore %}{{ l.length }}{% endfor %}{% endfor %}'
		assert.deepEqual(checkTemplate(src, scope), [])
	})

	test('a misspelling in the inner loop of a nested pair is caught', () => {
		const src = '{% for c in characters %}{% for l in c.loer %}{{ l }}{% endfor %}{% endfor %}'
		const f = checkTemplate(src, scope)
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /'c\.loer' does not exist/)
	})

	// Not a template anyone means to write, but one somebody can type. A lint
	// that hangs the editor is worse than the typo it was looking for.
	test('a self-referential binding terminates rather than recursing', () => {
		assert.deepEqual(checkTemplate('{% for x in x %}{{ x.a }}{% endfor %}', scope), [])
	})

	test('looping an unchecked declaration leaves its body unchecked', () => {
		assert.deepEqual(
			checkTemplate('{% for e in entry %}{{ e.whatever.deep }}{% endfor %}', { entry: 'any' }),
			[],
		)
	})
})
