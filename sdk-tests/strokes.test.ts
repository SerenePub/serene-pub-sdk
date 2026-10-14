/**
 * Card strokes — the one join rule, the explicit split, the fired stamp, the
 * validator, and the node and variable that carry them.
 *
 * Strokes are not lorebook entries: nothing here ranks or budgets. The SDK
 * never matches a keyword either — `resolveStrokes` is handed the host's
 * matcher, and these tests hand it a fake.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	compileStrokes,
	getVariable,
	resolveStrokes,
	splitIntoStrokes,
	strokeSlugFor,
	validateStrokes,
	STROKE_LIMITS,
	type ResolvedStroke,
	type Stroke,
	type VarField,
} from '@serene-pub/sdk'
import { cardStrokes } from '@serene-pub/contracts'

const always = { mode: 'always' } as const
const d = (text: string, extra: Partial<Stroke> = {}): Stroke => ({ kind: 'description', text, when: always, ...extra })
const p = (text: string, extra: Partial<Stroke> = {}): Stroke => ({ kind: 'personality', text, when: always, ...extra })
const kw = (keys: string[]) => ({ mode: 'keywords' as const, keys })

describe('compileStrokes — the join rule', () => {
	test('description strokes join by a blank line; a label compiles as "Label: text"', () => {
		const out = compileStrokes([d('A rider.'), d('green', { label: 'Eyes' }), p('Terse.')], 'description')
		assert.equal(out, 'A rider.\n\nEyes: green')
	})

	test('personality strokes join by newline when none is labelled', () => {
		assert.equal(compileStrokes([p('Terse.'), p('Loyal.')], 'personality'), 'Terse.\nLoyal.')
	})

	test('personality strokes join by "; " when any is labelled (PList-shaped)', () => {
		const out = compileStrokes([p('terse, loyal', { label: 'Manner' }), p('slow to trust')], 'personality')
		assert.equal(out, 'Manner: terse, loyal; slow to trust')
	})

	test('off strokes never compile; text and label are trimmed; empty text is nothing', () => {
		const out = compileStrokes(
			[d('  kept  ', { label: ' Hair ' }), d('hidden', { when: { mode: 'off' } }), d('   ')],
			'description',
		)
		assert.equal(out, 'Hair: kept')
	})

	test('null when nothing compiles', () => {
		assert.equal(compileStrokes([], 'description'), null)
		assert.equal(compileStrokes([p('x')], 'description'), null)
		assert.equal(compileStrokes([d('x', { when: { mode: 'off' } })], 'description'), null)
		assert.equal(compileStrokes(undefined, 'personality'), null)
	})

	test('keyword strokes compile unresolved — the cache and the no-step fallback lose nothing', () => {
		assert.equal(compileStrokes([d('a'), d('b', { when: kw(['sword']) })], 'description'), 'a\n\nb')
	})

	test('firedOnly: keyword strokes compile only when fired', () => {
		const resolved: ResolvedStroke[] = [
			{ ...d('a'), fired: true },
			{ ...d('b', { when: kw(['sword']) }), fired: false },
			{ ...d('c', { when: kw(['ring']) }), fired: true },
		]
		assert.equal(compileStrokes(resolved, 'description', { firedOnly: true }), 'a\n\nc')
	})

	test('firedOnly: an unresolved keyword stroke (no fired) is out', () => {
		assert.equal(compileStrokes([d('a'), d('b', { when: kw(['x']) })], 'description', { firedOnly: true }), 'a')
	})

	test('the "; " join counts only compiled strokes', () => {
		const resolved: ResolvedStroke[] = [
			{ ...p('x', { label: 'L', when: kw(['k']) }), fired: false },
			{ ...p('one'), fired: true },
			{ ...p('two'), fired: true },
		]
		assert.equal(compileStrokes(resolved, 'personality', { firedOnly: true }), 'one\ntwo')
	})
})

describe('resolveStrokes — the fired stamp', () => {
	test('always fired, off never, keywords as the matcher says; order kept', () => {
		const asked: string[][] = []
		const out = resolveStrokes(
			[d('a'), d('b', { when: { mode: 'off' } }), d('c', { when: kw(['sword']) }), d('e', { when: kw(['ring']) })],
			(when) => {
				asked.push(when.keys)
				return when.keys.includes('sword')
			},
		)
		assert.deepEqual(
			out.map((s) => [s.text, s.fired]),
			[
				['a', true],
				['b', false],
				['c', true],
				['e', false],
			],
		)
		assert.deepEqual(asked, [['sword'], ['ring']])
	})

	test('a matcher that throws leaves the stroke unfired', () => {
		const out = resolveStrokes([d('c', { when: kw(['(']) })], () => {
			throw new Error('bad pattern')
		})
		assert.equal(out[0]!.fired, false)
	})

	test('does not mutate its input', () => {
		const src = [d('a')]
		resolveStrokes(src, () => true)
		assert.equal('fired' in src[0]!, false)
	})
})

describe('splitIntoStrokes', () => {
	test('by paragraph: blank lines', () => {
		const out = splitIntoStrokes('First para.\nstill first.\n\n  Second.  \n\n\n', 'description', 'paragraph')
		assert.deepEqual(
			out.map((s) => s.text),
			['First para.\nstill first.', 'Second.'],
		)
		assert.ok(out.every((s) => s.kind === 'description' && s.when.mode === 'always' && !s.label))
	})

	test('by sentence: sentence ends and line breaks, closing quotes kept', () => {
		const out = splitIntoStrokes('She rides. Is she loyal? "Yes!" she says\nNew line', 'personality', 'sentence')
		assert.deepEqual(
			out.map((s) => s.text),
			['She rides.', 'Is she loyal?', '"Yes!"', 'she says', 'New line'],
		)
	})

	test('by plist: bracketed Key: value; segments become labelled strokes with slugs', () => {
		const out = splitIntoStrokes('[Ali: tall, kind; Eyes: green; Eyes: grey]', 'description', 'plist')
		assert.deepEqual(
			out.map((s) => [s.label, s.slug, s.text]),
			[
				['Ali', 'ali', 'tall, kind'],
				['Eyes', 'eyes', 'green'],
				['Eyes', 'eyes-2', 'grey'],
			],
		)
	})

	test('by plist: unbracketed lines, a colon inside a value, and an unlabelled segment', () => {
		const out = splitIntoStrokes("Hair: black;\nMotto: never: again\njust prose here", 'personality', 'plist')
		assert.deepEqual(
			out.map((s) => [s.label, s.text]),
			[
				['Hair', 'black'],
				['Motto', 'never: again'],
				[undefined, 'just prose here'],
			],
		)
	})

	test('empty text splits to nothing', () => {
		assert.deepEqual(splitIntoStrokes('  \n\n ', 'description', 'paragraph'), [])
		assert.deepEqual(splitIntoStrokes('', 'description', 'plist'), [])
	})

	test('a split result validates', () => {
		const out = splitIntoStrokes('[A: 1; B: 2; A: 3]', 'description', 'plist')
		assert.deepEqual(validateStrokes(out), [])
	})
})

describe('strokeSlugFor', () => {
	test('lower-cased, accents dropped, punctuation a dash', () => {
		assert.equal(strokeSlugFor('Eyes'), 'eyes')
		assert.equal(strokeSlugFor("Ali's Café — Habits!"), 'ali-s-cafe-habits')
		assert.equal(strokeSlugFor('  --  '), 'stroke')
	})

	test('64 at most, never ending in a dash', () => {
		const s = strokeSlugFor(`${'a'.repeat(63)} b`)
		assert.ok(s.length <= 64)
		assert.match(s, /^[a-z0-9][a-z0-9-]{0,63}$/)
		assert.ok(!s.endsWith('-'))
	})
})

describe('validateStrokes', () => {
	test('a good card is clean', () => {
		assert.deepEqual(
			validateStrokes([d('a', { slug: 'eyes', label: 'Eyes' }), p('b', { when: { mode: 'keywords', keys: ['x'], matchMode: 'word' } })]),
			[],
		)
	})

	test('slug unique per card, across kinds', () => {
		const f = validateStrokes([d('a', { slug: 'eyes' }), p('b', { slug: 'eyes' })])
		assert.equal(f.length, 1)
		assert.equal(f[0]!.path, 'strokes[1].slug')
	})

	test('slug grammar', () => {
		for (const bad of ['Eyes', '-eyes', 'eyes!', 'a'.repeat(65)])
			assert.equal(validateStrokes([d('a', { slug: bad })])[0]?.path, 'strokes[0].slug', bad)
	})

	test('text non-empty and under the limit', () => {
		assert.equal(validateStrokes([d('  ')])[0]!.path, 'strokes[0].text')
		assert.equal(validateStrokes([d('x'.repeat(STROKE_LIMITS.maxTextChars + 1))])[0]!.path, 'strokes[0].text')
	})

	test('keyword mode needs a key; keys capped in count and length', () => {
		assert.equal(validateStrokes([d('a', { when: kw([]) })])[0]!.path, 'strokes[0].when.keys')
		const many = Array.from({ length: STROKE_LIMITS.maxKeys + 1 }, (_, i) => `k${i}`)
		assert.equal(validateStrokes([d('a', { when: kw(many) })])[0]!.path, 'strokes[0].when.keys')
		assert.equal(
			validateStrokes([d('a', { when: kw(['x'.repeat(STROKE_LIMITS.maxKeyChars + 1)]) })])[0]!.path,
			'strokes[0].when.keys[0]',
		)
	})

	test('label length, kind, mode, matchMode', () => {
		assert.equal(validateStrokes([d('a', { label: 'L'.repeat(STROKE_LIMITS.maxLabelChars + 1) })])[0]!.path, 'strokes[0].label')
		assert.equal(validateStrokes([{ kind: 'scenario', text: 'a', when: always }])[0]!.path, 'strokes[0].kind')
		assert.equal(validateStrokes([{ kind: 'description', text: 'a', when: { mode: 'sometimes' } }])[0]!.path, 'strokes[0].when.mode')
		assert.equal(
			validateStrokes([d('a', { when: { mode: 'keywords', keys: ['x'], matchMode: 'fuzzy' as 'word' } })])[0]!.path,
			'strokes[0].when.matchMode',
		)
	})

	test('too many strokes; not a list', () => {
		const many = Array.from({ length: STROKE_LIMITS.maxStrokes + 1 }, () => d('a'))
		assert.equal(validateStrokes(many)[0]!.path, 'strokes')
		assert.equal(validateStrokes('nope')[0]!.path, 'strokes')
	})
})

describe('where strokes travel', () => {
	test('core:var/characters@1 carries an optional strokes list, widened in place', () => {
		const card = (getVariable('core:var/characters@1')!.scope.characters as VarField).of!
		const strokes = card.fields!.strokes!
		assert.equal(strokes.type, 'list')
		assert.equal(strokes.optional, true)
		assert.deepEqual(Object.keys(strokes.of!.fields!), ['kind', 'slug', 'label', 'text', 'fired'])
		assert.equal(strokes.of!.fields!.fired!.type, 'boolean')
	})

	test('core:task/card-strokes@1 — cast and messages in, cast out', () => {
		const desc = cardStrokes.descriptor
		assert.equal(desc.id, 'core:task/card-strokes@1')
		assert.equal(desc.kind, 'task')
		assert.deepEqual(Object.keys(desc.ports.in ?? {}), ['cast', 'messages'])
		assert.deepEqual(Object.keys(desc.ports.out ?? {}), ['main', 'cast'])
		assert.equal(desc.ports.out!.cast, desc.ports.in!.cast)
		assert.equal(desc.ports.in!.cast, 'core:shape/session-cast@1')
	})
})
