import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { rulesetFit, rulesetProvides, ratingGroupOf, RULESET_RATINGS } from '@serene-pub/sdk'

const diceRuleset: any = {
	id: 'acme:ruleset/dice@1',
	stats: [{ id: 'core:slot/hp@1' }, { id: 'core:slot/crawl-conditions@1' }, { id: 'core:slot/spell-slots@1' }],
	repertoires: [
		{ id: 'weapons', mechanics: [{ verb: 'harm' }, { verb: 'rollWith', target: 'x', from: ['a'] }] },
		{ id: 'conditions', piece: {} },
		{ id: 'spells', mechanics: [{ verb: 'consume' }] },
	],
	conventions: { dice: { die: 20 } },
}
const cardsRuleset: any = {
	id: 'acme:ruleset/cards@1',
	stats: [{ id: 'core:slot/hp@1' }],
	repertoires: [{ id: 'weapons', mechanics: [{ verb: 'harm' }, { verb: 'heal' }] }],
	conventions: {},
}

describe('rulesetProvides', () => {
	test('derives slots, verbs, pieces, conditions, casting and dice from a declaration', () => {
		const p = rulesetProvides(diceRuleset)
		assert.deepEqual([...p.slots].sort(), ['crawl-conditions', 'hp', 'spell-slots'])
		assert.deepEqual([...p.verbs].sort(), ['consume', 'harm', 'rollWith'])
		assert.equal(p.conditions, true)
		assert.equal(p.casting, true)
		assert.equal(p.dice, true)
	})
	test('a missing declaration provides nothing', () => {
		const p = rulesetProvides(null)
		assert.equal(p.slots.size, 0)
		assert.equal(p.dice, false)
	})
})

describe('rulesetFit', () => {
	test('a genre with no uses rates every ruleset Great', () => {
		assert.equal(rulesetFit({}, diceRuleset).rating, 'great')
		assert.equal(rulesetFit(null, cardsRuleset).rating, 'great')
	})
	test('everything native is Perfect; dice never count unless required', () => {
		const genre = { uses: { verbs: ['harm'], slots: ['hp'], conditions: true, dice: 'optional' as const } }
		assert.equal(rulesetFit(genre, diceRuleset).rating, 'perfect')
		// Diceless cards: conditions resolve in words — one words row ⇒ Good.
		const f = rulesetFit(genre, cardsRuleset)
		assert.equal(f.rating, 'good')
		assert.match(f.reason, /conditions resolve/)
	})
	test('a required slot the ruleset lacks is Incompatible, with the reason named', () => {
		const genre = { uses: { verbs: ['harm'], slots: ['hp', 'sanity'] } }
		const f = rulesetFit(genre, diceRuleset)
		assert.equal(f.rating, 'incompatible')
		assert.equal(f.group, 0)
		assert.match(f.reason, /sanity slot/)
	})
	test('optional uses never move the rating; unused extras are listed neutrally', () => {
		const genre = { uses: { verbs: ['harm'], optional: { slots: ['sanity'], casting: true } } }
		const f = rulesetFit(genre, diceRuleset)
		assert.equal(f.rating, 'perfect')
		assert.ok(f.rows.some((r) => r.key === 'sanity' && !r.required && r.met === 'missing'))
		assert.ok(f.unused.includes('conditions'))
	})
	test('an open grammar takes whatever the ruleset provides', () => {
		const f = rulesetFit({ uses: { verbs: 'any', dice: 'optional' } }, cardsRuleset)
		assert.equal(f.rating, 'perfect')
		assert.deepEqual(f.unused, [])
	})
	test('mostly words is Poor', () => {
		const genre = { uses: { verbs: ['harm', 'cure', 'consume'], conditions: true } }
		const f = rulesetFit(genre, cardsRuleset)
		assert.equal(f.rating, 'poor')
		assert.equal(ratingGroupOf('poor'), 1)
	})
	test('the six ratings and their four bands', () => {
		assert.deepEqual([...RULESET_RATINGS], ['incompatible', 'poor', 'ok', 'good', 'great', 'perfect'])
		assert.deepEqual(RULESET_RATINGS.map(ratingGroupOf), [0, 1, 2, 2, 3, 3])
	})
})
