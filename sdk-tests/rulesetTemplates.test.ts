/**
 * 🚧 Ruleset templates, the casting pool and the ruleset laws (2026-10-22,
 * PLAN-rulesets-authoring D3, lane M3):
 *
 *  · core's three archetypes — d20-style, dice pool, diceless pools — are
 *    complete, small (≤ 60 lines each, in the seven sections over core's
 *    functions since 2026-10-23, lane A2) and checked, each with a playtest
 *    scene; copied, never played: never registered, never named by a genre,
 *    and a copy is no template;
 *  · `conventions.casting` is checked where it is authored;
 *  · `rulesetCatalogueFindings` — what conformance C38 holds a catalogue to.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
	checkMethodKind,
	defineRuleset,
	genreRulesetFindings,
	getAttributeSlot,
	genres,
	getRuleset,
	getRulesetTemplate,
	isRulesetTemplateId,
	normaliseRuleset,
	playtestFindings,
	reidRulesetDocument,
	rulesetCatalogueFindings,
	rulesetDocumentOf,
	rulesetFindings,
	rulesetProvides,
	rulesetTemplateFindings,
	rulesetTemplates,
	slotPickableIn,
	type RulesetProps,
	type RulesetTemplateProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const reasons = (fs: readonly string[]) => fs.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1])
/** 🚧 d20-style, a dice pool, diceless pools; the four of `archetypes/` lead `RULESET_TEMPLATES` since 2026-10-23 (`archetypes.test`). */
const T = [cat.d20StyleTemplate, cat.dicePoolTemplate, cat.dicelessPoolsTemplate]
const DIR = path.join(import.meta.dirname, '../core-catalog/src/rulesets/templates')
/** Vis Itineris in the shape before the sections, from its parts — what `conventions.casting` is authored against. */
const VI_LEGACY = {
	name: { en: 'Vis Itineris' },
	conventions: cat.VIS_ITINERIS_CONVENTIONS,
	settings: cat.VIS_ITINERIS_SETTINGS,
	presets: cat.VIS_ITINERIS_PRESETS,
	stats: [
		{ id: cat.levelSlot.id, config: { min: 1, max: 20 }, borrowed: true as const },
		{ id: cat.characterClassSlot.id, borrowed: true as const },
		{ id: cat.hpSlot.id, config: { min: 0, max: 999 }, default: 10, borrowed: true as const },
		...cat.VIS_ITINERIS_OWN_SLOTS.map((s) => ({ id: s.id })),
	],
	selectors: cat.VIS_ITINERIS_SELECTORS,
	repertoires: cat.VIS_ITINERIS_REPERTOIRES,
	compendium: cat.VIS_ITINERIS_COMPENDIUM,
} as unknown as RulesetProps
const propsOf = (t: (typeof T)[number]): RulesetTemplateProps => ({
	label: t.label,
	about: t.about,
	goodFor: t.goodFor,
	ruleset: t.ruleset as unknown as RulesetTemplateProps['ruleset'],
	playtest: t.playtest,
})

describe('core’s ruleset templates', () => {
	test('three templates after the four of archetypes/, in the order New ruleset offers them, each checked and small', () => {
		assert.deepEqual(
			T.map((t) => t.id),
			['core:ruleset/template-d20-style@1', 'core:ruleset/template-dice-pool@1', 'core:ruleset/template-diceless-pools@1'],
		)
		assert.deepEqual(cat.RULESET_TEMPLATES.map((t) => t.id), [...cat.ARCHETYPE_TEMPLATES, ...T].map((t) => t.id))
		assert.deepEqual(rulesetTemplates().map((t) => t.id), cat.RULESET_TEMPLATES.map((t) => t.id))
		for (const [t, file] of T.map((t, i) => [t, ['d20Style', 'dicePool', 'dicelessPools'][i]!] as const)) {
			assert.equal(t.ruleset.template, true, t.id)
			assert.deepEqual(rulesetTemplateFindings(t.id, propsOf(t)), [], t.id)
			for (const k of ['label', 'about', 'goodFor'] as const) assert.ok((t[k] as { en: string }).en.length > 5, `${t.id} ${k}`)
			const lines = readFileSync(path.join(DIR, `${file}.ts`), 'utf8').trimEnd().split('\n').length
			assert.ok(lines <= 60, `${file}.ts is ${lines} lines — a template stays readable in one sitting`)
			// Copied, never played.
			assert.equal(getRuleset(t.id), undefined, t.id)
			assert.equal(getRulesetTemplate(t.id), t)
			assert.ok(isRulesetTemplateId(t.id))
			// In the seven sections: its own attributes, each with a sentence; a tag on every entry type; a voice per rigour.
			// What it says — its ⏳ read-back in the shape before them is unenumerated (`_rulesetDeclOf`, 2026-10-23).
			const said = { ...t.ruleset } as unknown as Record<string, unknown[]>
			for (const k of ['stats', 'repertoires', 'conventions', 'selectors', 'compendium'] as const)
				assert.ok(!said[k]?.length, `${t.id} says no ${k}`)
			for (const a of t.ruleset.attributes!) assert.ok(a.slot || a.prose, `${t.id} ${a.id}`)
			for (const e of t.ruleset.entryTypes!) assert.ok(e.tags?.length, `${t.id} ${e.id}`)
			assert.deepEqual(Object.keys(t.ruleset.voice!).sort(), ['mechanics', 'prose', 'scripts'])
		}
	})

	test('each archetype decides its own way: one die against a target; a pool counting fives; spends, a face-off and judgement', () => {
		const [d20, pool, diceless] = T.map((t) => rulesetProvides(t.ruleset))
		assert.deepEqual([d20!.methods, d20!.dice, d20!.chance], [['die-target'], true, true])
		assert.deepEqual([pool!.methods, pool!.dice], [['dice-pool'], true])
		const p = normaliseRuleset(T[1]!.ruleset).conventions.methods.pool as { successOn: number; sides: number }
		assert.deepEqual([p.sides, p.successOn], [6, 5])
		assert.deepEqual([[...diceless!.methods].sort(), diceless!.chance], [['bid', 'compare', 'none'], false])
		assert.equal(normaliseRuleset(T[2]!.ruleset).conventions.defaultMethod, 'call')
		// The d20-style: three stats of its own, weapons and conditions, six sample rows.
		const d = T[0]!.ruleset
		assert.equal(d.attributes!.filter((a) => !a.borrowed).length, 3)
		assert.deepEqual(d.entryTypes!.map((e) => e.id), ['weapons', 'conditions'])
		assert.equal(Object.values(d.library!.rows).flat().length, 6)
		// The dice pool: three entry types. The diceless one: pools and relationships.
		assert.equal(T[1]!.ruleset.entryTypes!.length, 3)
		assert.ok(T[2]!.ruleset.entryTypes!.some((e) => e.relational && e.tags?.includes('relationship')))
		assert.deepEqual(T[2]!.ruleset.attributes!.map((a) => [a.id, a.kind, a.bounds?.max]), [['grit', 'pool', 5], ['pull', 'pool', 5]])
		for (const t of T)
			for (const m of Object.values(normaliseRuleset(t.ruleset).conventions.methods)) assert.ok(checkMethodKind(m.kind), `${t.id} ${m.kind}`)
	})

	test('each preloads a playtest scene: a party, a situation, one change by one of them', () => {
		for (const t of T) {
			const pt = t.playtest
			assert.ok(pt.party.length >= 2, t.id)
			assert.ok(pt.party.some((m) => m.name === pt.change.owner), t.id)
			assert.ok((pt.situation as { en: string }).en.length > 10, t.id)
		}
		assert.deepEqual(T[0]!.playtest.change, { owner: 'Bryn', op: 'hit', check: 'attack.melee', repertoire: 'weapons', piece: 'longsword', against: 13, aimedAt: 'Bandit' })
		assert.deepEqual(T[2]!.playtest.change, { owner: 'Mara', op: 'use', check: 'lean', value: 2 })
	})

	test('a playtest that names what the ruleset lacks is refused, in words', () => {
		const t = T[0]!
		const bad = (over: Record<string, unknown>) => reasons(playtestFindings(t.id, t.ruleset as unknown as RulesetProps, { ...t.playtest, ...over }))
		assert.deepEqual(bad({ change: { ...t.playtest.change, owner: 'Nobody' } }), ['bad-playtest'])
		assert.deepEqual(bad({ change: { ...t.playtest.change, piece: 'halberd' } }), ['bad-playtest'])
		assert.deepEqual(bad({ change: { ...t.playtest.change, check: 'attack.psychic' } }), ['bad-playtest'])
		assert.deepEqual(bad({ party: [{ name: 'Bryn', pieces: { weapons: ['halberd'] } }] }), ['bad-playtest', 'bad-playtest'])
		assert.deepEqual(bad({ situation: undefined }), ['display-text'])
	})

	test('never played: defineRuleset refuses a template, a genre may not name one, a copy is no template', () => {
		const t = T[2]!
		const { id: _id, ...props } = t.ruleset
		assert.throws(() => defineRuleset('acme:ruleset/pools@1', props as unknown as RulesetProps), /template-not-played/)
		const { template: _t, ...played } = props
		assert.throws(() => defineRuleset(t.id, played as unknown as RulesetProps), /template-not-played/)
		assert.deepEqual(reasons(genreRulesetFindings('acme:genre/x', { rulesets: { recommended: [t.id], default: t.id } })), ['template-ruleset'])
		const copy = reidRulesetDocument(rulesetDocumentOf(t.ruleset), 'acme:ruleset/pools@1')
		assert.equal((copy as { template?: unknown }).template, undefined)
		assert.deepEqual(reasons(rulesetFindings(copy.id, copy as unknown as RulesetProps)), [])
		// ⏳ The slots it carried before the sections stay its own: no session's picker offers them.
		for (const s of [cat.dicelessGritSlot, cat.dicelessPullSlot]) {
			assert.equal(getAttributeSlot(s.id)?.rulesetOwned, t.id, s.id)
			assert.equal(slotPickableIn(getAttributeSlot(s.id)!, 'core:ruleset/freeform@1'), false, s.id)
		}
		assert.equal(slotPickableIn(cat.dicelessGritSlot, cat.wherewithalRuleset.id), false)
	})
})

describe('🚧 conventions.casting — a casting pool, checked where it is authored', () => {
	const vi = VI_LEGACY
	const withCasting = (casting: unknown) =>
		reasons(rulesetFindings('test.m3:ruleset/casting@1', { ...vi, conventions: { ...vi.conventions, casting } } as unknown as RulesetProps)).filter(
			(r) => r !== 'conversion-not-ours',
		)
	test("Vis Itineris's spell points pass; so does the slot id for the pool and piece.level for the cost", () => {
		assert.deepEqual(withCasting(cat.VIS_ITINERIS_SPELL_POINTS), [])
		assert.deepEqual(withCasting({ pool: cat.visItinerisSpellPointsSlot.id, cost: 'piece.level', repertoire: 'spells' }), [])
		// No repertoire named: every repertoire tagged `casting` (spells) — spell slots are not.
		assert.deepEqual(withCasting({ pool: 'itineris-spell-points', cost: 'level' }), [])
	})
	test('a pool that is no stat, a cost no piece has, a rest or a repertoire it lacks — each refused with its reason', () => {
		assert.deepEqual(withCasting({ pool: 'spell-dc', cost: 'level' }), ['bad-casting'])
		assert.deepEqual(withCasting({ pool: 'mana', cost: 'level' }), ['unknown-selector'])
		assert.deepEqual(withCasting({ pool: 'itineris-spell-points', cost: 'price', repertoire: 'spells' }), ['bad-casting'])
		assert.deepEqual(withCasting({ pool: 'itineris-spell-points', cost: 'level', repertoire: 'scrolls' }), ['unknown-repertoire'])
		assert.deepEqual(withCasting({ pool: 'itineris-spell-points', cost: 'level', refill: 'nap' }), ['bad-casting'])
		assert.deepEqual(withCasting({ pool: 'itineris-spell-points', cost: 'level', max: 'nowhere' }), ['unknown-selector'])
		assert.deepEqual(withCasting({ pool: 'itineris-spell-points', cost: 'level', mana: true }), ['bad-casting'])
		assert.deepEqual(withCasting('points'), ['bad-casting'])
	})
})

describe('🚧 the ruleset laws (conformance C38)', () => {
	const catalogue = () => ({ rulesets: cat.CORE_RULESETS, templates: T, genres: genres() })
	test("core's catalogue keeps them", () => {
		assert.deepEqual(rulesetCatalogueFindings(catalogue()), [])
	})
	test('chance with nothing to roll against or read as; an untagged repertoire; a template recommended or played', () => {
		const vi = { ...VI_LEGACY, id: cat.VIS_ITINERIS_RULESET_ID }
		const { bands: _b, ...bare } = vi.conventions!.methods!.die as Record<string, unknown>
		const { degrees: _d, ...noDegrees } = vi.conventions!
		const chancy = { ...vi, conventions: { ...noDegrees, methods: { die: bare } } }
		const untagged = { ...cat.freeformRuleset, repertoires: cat.freeformRuleset.repertoires.map(({ tags: _t, ...r }) => r) }
		const t = T[0]!
		const story = genres().find((g) => g.id === 'core:genre/story')!
		const offering = { ...story, rulesets: { recommended: [...(story.rulesets as { recommended: readonly string[] }).recommended, t.id], default: 'core:ruleset/freeform@1' } }
		const found = reasons(
			rulesetCatalogueFindings({ rulesets: [chancy as never, untagged as never, t.ruleset], templates: T, genres: [offering] }),
		)
		assert.deepEqual(found.sort(), ['chance-without-degrees', 'template-recommended', 'template-registered', 'untagged-repertoire', 'untagged-repertoire', 'untagged-repertoire', 'untagged-repertoire'].sort())
		// A degree mapping of its own is enough without bands; a pool's count is one.
		assert.deepEqual(rulesetCatalogueFindings({ rulesets: [{ ...vi, conventions: { ...vi.conventions, methods: { die: bare } } } as never] }), [])
	})
})
