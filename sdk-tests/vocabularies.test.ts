/**
 * Vocabularies (lane 2, A19, R27–R30): members ARE attribute slot
 * declarations; rulesets `plays` vocabularies and `map` members onto their
 * own stats (objects both sides, stored by id); a ruleset is itself a
 * vocabulary of its own stats; `resolveAttributeRef` — object by identity,
 * string by slug (own → each played, common last; two matches warn and take
 * the ruleset's own; absent → null with a reason); string references warn,
 * never refuse. The common vocabulary object itself is core-catalog's (lane
 * 3) — this suite declares a test one under `COMMON_VOCABULARY_ID`.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	attributeRefWarnings,
	COMMON_VOCABULARY_ID,
	definePluginAttributeSlot,
	definePluginRuleset,
	getRuleset,
	getVocabulary,
	isVocabulary,
	genre,
	resolveAttributeRef,
	rulesetFindings,
	sessionOf,
	rulesetVocabulary,
	stat,
	vocabulary,
	type RulesetProps,
} from '@serene-pub/sdk'

const slot = (slug: string, appliesTo: ('cast' | 'world' | 'location')[] = ['cast']) =>
	definePluginAttributeSlot('voc', `voc:slot/${slug}@1`, { type: 'integer', descriptor: `${slug}.`, appliesTo })

const health = slot('health')
const mood = slot('mood')
const weather = slot('weather', ['world'])
const shields = slot('shields')
const vigour = slot('vigour')
const spellPoints = slot('spell-points')
const scifiMood = slot('ship-mood')

// The common words — core-catalog declares the real one (lane 3).
const common = vocabulary(COMMON_VOCABULARY_ID, { world: { weather }, cast: { health, mood } })
const scifi = vocabulary('voc:vocabulary/ships@1', { cast: { shields, mood: scifiMood } })

const props = (over: Partial<RulesetProps> = {}): RulesetProps => ({
	name: 'Vocab test',
	voice: { prose: 'Short and plain.' },
	conventions: {
		degrees: {
			bands: [
				{ id: 'fails', label: 'It fails', five: 'fail' },
				{ id: 'works', label: 'It works', five: 'success' },
			],
		},
		time: { unit: 'scene' },
	},
	stats: [{ id: vigour.id }, { id: spellPoints.id }],
	repertoires: [],
	...over,
})

const ruleset = definePluginRuleset('voc', 'voc:ruleset/test@1', props({ plays: [scifi, common], map: [[health, vigour]] }))

describe('vocabulary() — members ARE slot declarations', () => {
	test('the object holds the declarations themselves, grouped by owner', () => {
		assert.ok(isVocabulary(common))
		assert.equal(common.cast.health, health)
		assert.equal(common.world.weather, weather)
		assert.deepEqual(Object.keys(common.location), [])
		assert.equal(getVocabulary(COMMON_VOCABULARY_ID), common)
	})

	test('an identical re-declaration is a no-op; a different one under the id throws', () => {
		assert.doesNotThrow(() => vocabulary('voc:vocabulary/ships@1', { cast: { shields, mood: scifiMood } }))
		assert.throws(() => vocabulary('voc:vocabulary/ships@1', { cast: { shields } }), /duplicate vocabulary id/)
	})

	test('a wrapper, a string, a wrong owner and a bad id are refused, each by name', () => {
		assert.throws(() => vocabulary('voc:vocabulary/bad@1', { cast: { hp: 'voc:slot/health@1' as never } }), /IS an attribute slot declaration/)
		assert.throws(() => vocabulary('voc:vocabulary/bad@1', { world: { health } }), /does not attach to the world/)
		assert.throws(() => vocabulary('voc:vocabulary/bad@1', { stats: { health } } as never), /groups by owner/)
		assert.throws(() => vocabulary('not an id', { cast: { health } }), /not a vocabulary id/)
	})

	test('a ruleset is itself a vocabulary of its own stats', () => {
		const own = rulesetVocabulary(ruleset)
		assert.ok(isVocabulary(own))
		assert.equal(own.id, ruleset.id)
		assert.equal((own.cast as Record<string, unknown>).vigour, vigour)
		assert.equal((own.cast as Record<string, unknown>).spellPoints, spellPoints, 'spell-points reads as spellPoints')
	})
})

describe('rulesets play vocabularies — stored by id', () => {
	test('plays and map are stored as ids, in order', () => {
		assert.deepEqual(ruleset.plays, [scifi.id, COMMON_VOCABULARY_ID])
		assert.deepEqual(ruleset.map, [[health.id, vigour.id]])
		assert.equal(getRuleset(ruleset.id), ruleset)
		assert.deepEqual(rulesetFindings(ruleset.id, ruleset), [], 'a declaration read back passes')
	})

	test('a ruleset that plays nothing stores neither key — its hash does not move', () => {
		const plain = definePluginRuleset('voc', 'voc:ruleset/plain@1', props())
		assert.equal('plays' in plain, false)
		assert.equal('map' in plain, false)
	})

	test('a map onto something not its own, or from something it does not play, is refused', () => {
		const f = rulesetFindings('voc:ruleset/x@1', props({ plays: [scifi], map: [[health, shields]] }))
		assert.ok(f.some((x) => x.startsWith('[bad-map]') && x.includes('not one of')), f.join('\n'))
		assert.ok(f.some((x) => x.startsWith('[bad-map]') && x.includes('no vocabulary')), f.join('\n'))
		const g = rulesetFindings('voc:ruleset/x@1', props({ plays: ['voc:vocabulary/nowhere@1' as never] }))
		assert.ok(g.some((x) => x.startsWith('[unknown-vocabulary]')), g.join('\n'))
	})
})

describe('resolveAttributeRef — object by identity, string by slug', () => {
	test('an object: own stat, mapped member, played member, or absent', () => {
		assert.deepEqual(resolveAttributeRef(vigour, ruleset), { slot: vigour, via: 'own', warnings: [] })
		const mapped = resolveAttributeRef(health, ruleset)
		assert.equal(mapped.slot, vigour, 'common health is the ruleset’s vigour')
		assert.equal((mapped as { via: string }).via, 'map')
		const played = resolveAttributeRef(shields, ruleset)
		assert.equal(played.slot, shields)
		assert.equal((played as { vocabulary?: string }).vocabulary, scifi.id)
		const absent = resolveAttributeRef(slot('not-played'), ruleset)
		assert.equal(absent.slot, null)
		assert.match((absent as { reason: string }).reason, /does not play/)
	})

	test('a string: the ruleset’s own first, then each played vocabulary, the common one last', () => {
		assert.equal(resolveAttributeRef('spell-points', ruleset).slot, spellPoints)
		assert.equal(resolveAttributeRef(stat('spellPoints'), ruleset).slot, spellPoints, 'either spelling of the slug')
		assert.equal(resolveAttributeRef('shields', ruleset).slot, shields)
		assert.equal(resolveAttributeRef('health', ruleset).slot, vigour, 'a played member the ruleset maps')
		// `mood` is both scifi's (ship-mood) and the common one: scifi comes first, common last.
		const m = resolveAttributeRef('mood', ruleset)
		assert.equal(m.slot, scifiMood)
		assert.equal(m.warnings.length, 1, 'two matches warn')
	})

	test('two matches take the ruleset’s own', () => {
		const own = definePluginRuleset('voc', 'voc:ruleset/owns-shields@1', props({ stats: [{ id: shields.id }], plays: [scifi] }))
		const r = resolveAttributeRef('ship-mood', own)
		assert.equal(r.slot, scifiMood)
		const both = resolveAttributeRef('shields', own)
		assert.equal(both.slot, shields)
		assert.equal((both as { via: string }).via, 'own')
	})

	test('absent is null with a reason, never a throw', () => {
		const r = resolveAttributeRef('nothing-like-it', ruleset)
		assert.equal(r.slot, null)
		assert.match((r as { reason: string }).reason, /nothing voc:ruleset\/test@1 plays is called 'nothing-like-it'/)
	})

	test('with no ruleset an object is itself and a string reads the common vocabulary', () => {
		assert.equal(resolveAttributeRef(shields, null).slot, shields)
		assert.equal(resolveAttributeRef('weather', null).slot, weather)
		assert.equal(resolveAttributeRef('shields', null).slot, null)
	})
})

describe('string references warn, never refuse (R30)', () => {
	test('a string nothing installed declares warns; a declared one and an object do not', () => {
		assert.deepEqual(attributeRefWarnings('shields'), [])
		assert.deepEqual(attributeRefWarnings(health), [])
		const w = attributeRefWarnings('warp-core', 'when')
		assert.equal(w.length, 1)
		assert.match(w[0]!, /nothing installed declares an attribute called 'warp-core'/)
	})

	test('stat() refuses only what can never be a slug', () => {
		assert.equal(stat('shields'), 'shields')
		assert.throws(() => stat('two words'), /a slug/)
	})
})

describe('sessionOf reads a declared ruleset: its own stats and what it plays', () => {
	test('own stats, played vocabularies and the common words land on the view', () => {
		const g = genre('voc:genre/table', { name: 'Table', family: 'story' })
		const s = sessionOf(g, { ruleset })
		const cast = s.cast.any as Record<string, { path: string }>
		assert.equal(cast.vigour?.path, 'state.cast.byId.*.vigour')
		assert.equal(cast.spellPoints?.path, 'state.cast.byId.*.spell-points')
		assert.equal(cast.shields?.path, 'state.cast.byId.*.shields')
		assert.equal(cast.mood?.path, 'state.cast.byId.*.ship-mood', 'the vocabulary played first wins the word')
		assert.equal(cast.health?.path, 'state.cast.byId.*.vigour', 'common health, mapped onto the ruleset’s vigour')
		assert.equal((s.world as Record<string, { path: string }>).weather?.path, 'state.world.weather')
	})
})
