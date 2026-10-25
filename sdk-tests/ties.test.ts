/**
 * 🚧 Ties on the lorebook graph (PLAN-rulesets-functions "Ties on the graph",
 * rulings T1–T5, lane T2, 2026-10-23).
 *
 * A relational entry type says what its far end may be (person · place ·
 * entry); its sides are worked out from the ends — a person to a person is two
 * sides, each person holding their own; anything else one side, held by the
 * world. One per-field setting says which lorebook column a field reads onto,
 * validated against the owner kind; another what the model is told of it
 * (words on, the number off). Held tie sides carry their side's owner, and a
 * two-sided tie is stamped once per side. Romance keeps affection on the bond.
 */
import { test, describe, before } from 'node:test'
import assert from 'node:assert/strict'

import {
	CAST_STATE_WORDS,
	checkMessageBlocks,
	FAR_ENDS,
	READS_ONTO,
	READS_ONTO_BY_OWNER,
	modelShareOf,
	playtestFindings,
	rulesetAttributeFindings,
	rulesetEntryTypeFindings,
	entryFieldSelectors,
	functionFindings,
	rulesetSectionFindings,
	rulesetSections,
	stampHeldEntry,
	stampTieSides,
	tieFieldSelectors,
	tieHoldersOf,
	tieSidesOf,
	type RulesetAttributeDecl,
	type RulesetEntryTypeDecl,
	type RulesetTemplate,
} from '@serene-pub/sdk'

const reasons = (findings: readonly string[]): string[] => findings.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1] ?? f)
const has = (findings: readonly string[], reason: string) =>
	assert.ok(reasons(findings).includes(reason), `expected [${reason}] in:\n${findings.join('\n')}`)
const clean = (findings: readonly string[]) => assert.deepEqual(findings, [])

const BOND: RulesetEntryTypeDecl = {
	id: 'bond',
	name: 'Bond',
	relational: true,
	farEnd: 'person',
	prose: 'What two people are to each other.',
	fields: {
		affection: { type: 'integer', min: 0, max: 10, default: 3, label: 'Affection' },
		standing: { type: 'enum', of: ['cold', 'wary', 'warm', 'close'], default: 'wary', label: 'Standing' },
	},
	readsOnto: { standing: 'relationship-type' },
}
const ROAD: RulesetEntryTypeDecl = { id: 'road', name: 'Road', relational: true, farEnd: 'place', prose: 'A way between two places.', fields: { kind: { type: 'string', label: 'Kind' } } }
/** 🚧 The world's zone a one-sided tie is held in (★6). */
const ROADS = { id: 'roads', name: 'Roads', owners: ['world' as const], holds: ['road'], prose: 'The ways between places, as the world keeps them.' }
const KEEPSAKE: RulesetEntryTypeDecl = { id: 'keepsake', name: 'Keepsake', prose: 'A small thing kept.', fields: { worn: { type: 'enum', of: ['new', 'worn'], label: 'Worn' } } }

describe('the far end and the sides (T1)', () => {
	test('the far end words', () => assert.deepEqual([...FAR_ENDS], ['person', 'place', 'entry']))

	test('a person to a person held by people is two sides; anything else one, held by the world', () => {
		assert.equal(tieSidesOf(BOND), 2)
		assert.equal(tieSidesOf({ ...BOND, holders: ['cast'] }), 2)
		assert.equal(tieSidesOf(ROAD), 1)
		assert.equal(tieSidesOf({ ...ROAD, farEnd: 'entry' }), 1)
		assert.equal(tieSidesOf({ ...BOND, holders: ['world'] }), 1)
		assert.equal(tieSidesOf({ ...BOND, farEnd: undefined }), undefined, 'no far end: an untyped towards, as before')
		assert.equal(tieSidesOf(KEEPSAKE), undefined)
		assert.deepEqual(tieHoldersOf(BOND), ['cast'])
		assert.deepEqual(tieHoldersOf(ROAD), ['world'])
	})

	test('a bad far end, a far end on a type that is not relational, and holders against the sides are refused', () => {
		clean(rulesetEntryTypeFindings(BOND, 'bond'))
		clean(rulesetEntryTypeFindings({ ...ROAD, holders: ['world'] }, 'road'))
		has(rulesetEntryTypeFindings({ ...BOND, farEnd: 'planet' as never }, 'bond'), 'bad-far-end')
		has(rulesetEntryTypeFindings({ ...KEEPSAKE, farEnd: 'person' }, 'keepsake'), 'bad-far-end')
		has(rulesetEntryTypeFindings({ ...ROAD, holders: ['location'] }, 'road'), 'bad-holders')
		has(rulesetEntryTypeFindings({ ...BOND, holders: ['cast', 'location'] }, 'bond'), 'bad-holders')
	})
})

describe('reads onto the lorebook (T2)', () => {
	test('the columns, and which owner kind may read onto which', () => {
		assert.deepEqual([...READS_ONTO], ['relationship-type', 'relationship-name', 'entry-field', 'cast-state'])
		assert.deepEqual(READS_ONTO_BY_OWNER.tie, ['relationship-type', 'relationship-name'])
		assert.deepEqual(READS_ONTO_BY_OWNER.held, ['entry-field'])
		assert.deepEqual(READS_ONTO_BY_OWNER.world, [])
	})

	test("a tie's words field reads onto its relationship row; a number, an unknown field or a second feeder never", () => {
		clean(rulesetEntryTypeFindings({ ...BOND, readsOnto: { standing: 'relationship-type' } }, 'bond'))
		clean(rulesetEntryTypeFindings({ ...ROAD, readsOnto: { kind: 'relationship-name' } }, 'road'))
		has(rulesetEntryTypeFindings({ ...BOND, readsOnto: { affection: 'relationship-type' } }, 'bond'), 'bad-reads-onto')
		has(rulesetEntryTypeFindings({ ...BOND, readsOnto: { mood: 'relationship-type' } }, 'bond'), 'bad-reads-onto')
		has(rulesetEntryTypeFindings({ ...BOND, readsOnto: { standing: 'entry-field' } }, 'bond'), 'bad-reads-onto')
		has(rulesetEntryTypeFindings({ ...BOND, readsOnto: { standing: 'relationship-type', name: 'relationship-type' } }, 'bond'), 'bad-reads-onto')
		has(rulesetEntryTypeFindings({ ...BOND, readsOnto: { standing: 'onto-the-moon' as never } }, 'bond'), 'bad-reads-onto')
		has(rulesetEntryTypeFindings({ ...BOND, readsOnto: [] as never }, 'bond'), 'bad-reads-onto')
	})

	test("a held thing's field reads onto its own entry; a relational type with no far end reads onto nothing", () => {
		clean(rulesetEntryTypeFindings({ ...KEEPSAKE, readsOnto: { worn: 'entry-field' } }, 'keepsake'))
		has(rulesetEntryTypeFindings({ ...KEEPSAKE, readsOnto: { worn: 'relationship-type' } }, 'keepsake'), 'bad-reads-onto')
		has(rulesetEntryTypeFindings({ ...BOND, farEnd: undefined, readsOnto: { standing: 'relationship-type' } }, 'bond'), 'bad-reads-onto')
	})

	test('an attribute reads onto its owner kind: a cast state label, a place field, never the world', () => {
		const fate: RulesetAttributeDecl = { id: 'fate', name: 'Fate', kind: 'label', of: ['active', 'deceased'], carriedBy: ['cast'], prose: 'Whether they live.', readsOnto: 'cast-state' }
		clean(rulesetAttributeFindings(fate, 'fate'))
		clean(rulesetAttributeFindings({ ...fate, carriedBy: undefined }, 'fate'))
		has(rulesetAttributeFindings({ ...fate, of: ['active', 'sleepy'] }, 'fate'), 'bad-reads-onto')
		has(rulesetAttributeFindings({ ...fate, kind: 'number', of: undefined }, 'fate'), 'bad-reads-onto')
		has(rulesetAttributeFindings({ ...fate, readsOnto: 'entry-field' }, 'fate'), 'bad-reads-onto')
		clean(rulesetAttributeFindings({ id: 'mood', name: 'Mood', kind: 'label', carriedBy: ['location'], prose: 'How a place feels.', readsOnto: 'entry-field' }, 'mood'))
		has(rulesetAttributeFindings({ id: 'weather', name: 'Weather', kind: 'label', carriedBy: ['world'], prose: 'The sky.', readsOnto: 'entry-field' }, 'weather'), 'bad-reads-onto')
		has(rulesetAttributeFindings({ ...fate, carriedBy: ['cast', 'location'] }, 'fate'), 'bad-reads-onto')
		assert.ok(CAST_STATE_WORDS.includes('deceased'))
	})
})

describe('model share (T5)', () => {
	test('words on and the number off unless said', () => {
		assert.deepEqual(modelShareOf(undefined), { words: true, number: false })
		assert.deepEqual(modelShareOf({ number: true }), { words: true, number: true })
		assert.deepEqual(modelShareOf({ words: false }), { words: false, number: false })
	})

	test('a number is shared only of a number; the setting is { words?, number? }', () => {
		clean(rulesetEntryTypeFindings({ ...BOND, modelShare: { affection: { number: true }, standing: { words: true } } }, 'bond'))
		has(rulesetEntryTypeFindings({ ...BOND, modelShare: { standing: { number: true } } }, 'bond'), 'bad-model-share')
		has(rulesetEntryTypeFindings({ ...BOND, modelShare: { nothing: { words: true } } }, 'bond'), 'bad-model-share')
		has(rulesetEntryTypeFindings({ ...BOND, modelShare: { affection: { loud: true } as never } }, 'bond'), 'bad-model-share')
		clean(rulesetAttributeFindings({ id: 'nerve', name: 'Nerve', kind: 'pool', bounds: { max: 5 }, prose: 'Courage.', modelShare: { number: true } }, 'nerve'))
		has(rulesetAttributeFindings({ id: 'mood', name: 'Mood', kind: 'label', prose: 'How they carry it.', modelShare: { number: true } }, 'mood'), 'bad-model-share')
	})
})

describe('held tie sides (T1)', () => {
	test('a held entry carries its side owner', () => {
		const h = stampHeldEntry({ id: null, entryType: 'bond', name: 'Mara', fields: { affection: 6 } }, { towards: 'character:2' }, { sideOwner: 'character:1' })
		assert.equal(h.sideOwner, 'character:1')
		assert.deepEqual(h.fields, { affection: 6, towards: 'character:2' })
		assert.equal(stampHeldEntry({ id: 3, entryType: 'x', name: 'y' }).sideOwner, undefined)
	})

	test('a two-sided tie is stamped once per side, each held by its person, towards the other', () => {
		const sides = stampTieSides(BOND, { id: null, name: 'Bond' }, { from: 'character:1', towards: 'character:2', names: { from: 'Mara', towards: 'Wren' } }, { from: { affection: 7 } })
		assert.equal(sides.length, 2)
		assert.deepEqual(
			sides.map((s) => [s.holder, s.held.sideOwner, s.held.name, s.held.fields.towards, s.held.fields.affection, s.held.fields.standing]),
			[
				['character:1', 'character:1', 'Mara', 'character:2', 7, 'wary'],
				['character:2', 'character:2', 'Wren', 'character:1', 3, 'wary'],
			],
		)
		assert.ok(sides.every((s) => s.held.entryType === 'bond' && s.held.entryId === null))
	})

	test('a one-sided tie is one held entry, held by the world, its near end its side owner', () => {
		const [only, ...rest] = stampTieSides(ROAD, { id: 9, name: 'The coast road' }, { from: 'location:4', towards: 'location:5' })
		assert.deepEqual(rest, [])
		assert.equal(only!.holder, 'world')
		assert.equal(only!.held.sideOwner, 'location:4')
		assert.equal(only!.held.fields.towards, 'location:5')
		assert.equal(only!.held.entryId, 9)
		assert.deepEqual(stampTieSides(KEEPSAKE, { id: null, name: 'x' }, { from: 'a', towards: 'b' }), [])
	})

	test('a tie field selector per number field of a tie', () => {
		assert.deepEqual(tieFieldSelectors([BOND, ROAD, KEEPSAKE]), ['bond.affection'])
	})

	test("a ruleset's sections say all of it with no findings", () => {
		clean(rulesetSectionFindings('jody:ruleset/hollow-hearts@1', { name: 'Hollow Hearts', entryTypes: [BOND, ROAD, KEEPSAKE], zoneTypes: [ROADS] }))
	})

	test('🚧 ★6: a one-sided tie the world holds needs a zone type of the world\'s that holds it — the finding names the fix', () => {
		const findings = rulesetSectionFindings('jody:ruleset/hollow-hearts@1', { name: 'Hollow Hearts', entryTypes: [BOND, ROAD] })
		has(findings, 'unheld-tie')
		assert.match(findings.join('\n'), /owners: \['world'\], holds: \['road'\]/)
		// A zone type of the world's that holds anything holds it too; a two-sided tie needs none.
		clean(rulesetSectionFindings('jody:ruleset/hollow-hearts@1', { name: 'Hollow Hearts', entryTypes: [BOND, ROAD], zoneTypes: [{ ...ROADS, holds: '*' }] }))
		clean(rulesetSectionFindings('jody:ruleset/hollow-hearts@1', { name: 'Hollow Hearts', entryTypes: [BOND] }))
	})

	test('🚧 ★2: an entry field selector per number field of any entry type; an `entryFields` role may name one', async () => {
		await import('../core-catalog/src/functions/index.js')
		assert.deepEqual(entryFieldSelectors([BOND, ROAD, KEEPSAKE]), ['bond.affection'])
		const rungs = (what: string) => ({
			name: 'Hollow Hearts',
			entryTypes: [BOND],
			functions: [{ ref: 'core:function/rungs@1', key: 'standing-from-affection', bindings: { what }, options: { into: 'standing', rungs: [{ from: 0, words: 'cold' }] } }],
		})
		clean(rulesetSectionFindings('jody:ruleset/hollow-hearts@1', rungs('bond.affection')))
		// 🚧 A word field where a number is taken is a field of the wrong kind (RF fix 6).
		has(rulesetSectionFindings('jody:ruleset/hollow-hearts@1', rungs('bond.standing')), 'bad-binding-kind')
		has(rulesetSectionFindings('jody:ruleset/hollow-hearts@1', rungs('bond.nothing')), 'bad-function-binding')
		// Only an attribute role may be filled so; a role that does not say it takes attributes only.
		has(
			functionFindings('jody:function/x@1', { name: 'X', meaning: 'X.', kind: 'value', prose: 'X is read.', bindings: { what: { to: 'entry-type', entryFields: true } } } as never),
			'bad-function-binding',
		)
		has(
			rulesetSectionFindings('jody:ruleset/hollow-hearts@1', {
				name: 'Hollow Hearts',
				entryTypes: [BOND],
				functions: [{ ref: 'core:function/reduce@1', key: 'cool', bindings: { what: 'bond.affection' } }],
			}),
			'bad-function-binding',
		)
	})
})

describe('the playtest seats ties', () => {
	const ruleset = { name: 'Hollow Hearts', entryTypes: [BOND, KEEPSAKE] }
	const scene = (ties: unknown) => ({
		party: [{ name: 'Wren', ties }, { name: 'Mara' }],
		situation: 'The pier at dusk.',
		change: { owner: 'Wren', op: 'use', check: 'bond.affection', aimedAt: 'Mara' },
	})
	test("a member's side of a tie, towards another member, in its own fields", () => {
		clean(playtestFindings('jody:ruleset/hollow-hearts@1', ruleset as never, scene({ bond: { Mara: { affection: 6, standing: 'warm' } } })))
		has(playtestFindings('jody:ruleset/hollow-hearts@1', ruleset as never, scene({ keepsake: { Mara: {} } })), 'bad-playtest')
		has(playtestFindings('jody:ruleset/hollow-hearts@1', ruleset as never, scene({ bond: { Dov: { affection: 1 } } })), 'bad-playtest')
		has(playtestFindings('jody:ruleset/hollow-hearts@1', ruleset as never, scene({ bond: { Wren: { affection: 1 } } })), 'bad-playtest')
		has(playtestFindings('jody:ruleset/hollow-hearts@1', ruleset as never, scene({ bond: { Mara: { towards: 'x' } } })), 'bad-playtest')
	})
})

describe('an outcome tells the lorebook rows that followed (screen 4)', () => {
	test("an outcome block's follows are sentences, at most a list's rows", () => {
		const dice = { kind: 'dice', method: 'compare', stat: 'Confess', rolled: 8, against: 7, outcome: 'Warmed' }
		assert.deepEqual(checkMessageBlocks([{ ...dice, follows: ["Lorebook: Wren's side of the tie with Mara now reads close"] }]), [])
		assert.ok(checkMessageBlocks([{ ...dice, follows: [3] }]).some((f) => f.path.endsWith('.follows')))
		assert.ok(checkMessageBlocks([{ ...dice, follows: 'close' }]).some((f) => f.path.endsWith('.follows')))
	})
})

describe('the romance archetype keeps affection on the bond', () => {
	let romance: RulesetTemplate
	before(async () => {
		await import('../core-catalog/src/functions/index.js')
		romance = (await import('../core-catalog/src/rulesets/archetypes/romance.js')).romanceTemplate
	})
	test('the bond: far end a person, two sides, affection and standing its fields, standing onto the relationship type', () => {
		const s = rulesetSections(romance.ruleset)
		assert.ok(!(s.attributes ?? []).some((a) => a.id === 'affection'), 'affection is no attribute any more')
		const bond = s.entryTypes!.find((e) => e.id === 'bond')!
		assert.equal(bond.farEnd, 'person')
		assert.equal(tieSidesOf(bond), 2)
		assert.deepEqual(Object.keys(bond.fields ?? {}), ['affection', 'standing'])
		assert.deepEqual(bond.readsOnto, { standing: 'relationship-type' })
		assert.equal(s.zoneTypes!.find((z) => z.id === 'bonds')!.visibility, 'holder')
		const confess = s.functions!.find((f) => f.key === 'confess')!
		assert.equal((confess.options as { modifierOf?: string }).modifierOf, 'bond.affection')
		assert.deepEqual(romance.playtest.party.map((m) => m.ties), [{ bond: { Mara: { affection: 7, standing: 'warm' } } }, { bond: { Wren: { affection: 8, standing: 'close' } } }])
		clean(rulesetSectionFindings(romance.id, romance.ruleset))
		clean(playtestFindings(romance.id, romance.ruleset as never, romance.playtest))
	})

	test('🚧 ★2: the standing is worked out from affection by rungs, kept in the side and read onto the row', async () => {
		const s = rulesetSections(romance.ruleset)
		const rungs = s.functions!.find((f) => f.ref === 'core:function/rungs@1')!
		assert.deepEqual(rungs.bindings, { what: 'bond.affection' })
		assert.equal((rungs.options as { into?: string }).into, 'standing')
		const { rungsFunction } = await import('../core-catalog/src/functions/index.js')
		const mod = await import(`data:text/javascript,${encodeURIComponent(rungsFunction.body!)}`)
		const side = (affection: number, standing: string, towards = 'character:2') => ({ name: 'Mara', entryType: 'bond', fields: { affection, standing, towards } })
		const env = (entries: unknown[]) => ({
			options: rungs.options,
			owner: { key: 'character:1', name: 'Wren' },
			bindings: { what: { to: 'attribute', ids: ['bond.affection'], values: {}, bounds: {}, fields: { 'bond.affection': { entryType: 'bond', field: 'affection', entries } } } },
		})
		// cold 0–2 · wary 3–5 · warm 6–7 · close 8–10
		for (const [n, words] of [[0, 'cold'], [2, 'cold'], [3, 'wary'], [5, 'wary'], [6, 'warm'], [7, 'warm'], [8, 'close'], [10, 'close']] as const)
			assert.deepEqual(mod.derived(env([side(n, 'none')])).deltas, [
				{ op: 'set', owner: 'character:1', entry: { entryType: 'bond', towards: 'character:2' }, field: 'standing', value: words, reason: 'worked out' },
			])
		// A side whose standing already says its rung is left as it is.
		assert.deepEqual(mod.derived(env([side(7, 'warm')])), { deltas: [], lines: [] })
		// Bound to an attribute, it reads as before: the owner's rung, a line.
		assert.deepEqual(mod.derived({ options: { rungs: [{ from: 0, words: 'cold' }, { from: 5, words: 'warm' }] }, owner: { key: 'character:1', name: 'Wren' }, bindings: { what: { ids: ['nerve'], values: { nerve: 6 } } } }), { lines: ['Wren: warm'] })
	})

	test('🚧 a confession moves the other side: cooled -1, warmed +1, confessed +2 — the zone ask set, by', async () => {
		const s = rulesetSections(romance.ruleset)
		const moves = s.functions!.find((f) => f.ref === 'core:function/outcome-moves@1')!
		assert.deepEqual(moves.bindings, { what: 'bond.affection' })
		const { outcomeMovesFunction } = await import('../core-catalog/src/functions/index.js')
		const mod = await import(`data:text/javascript,${encodeURIComponent(outcomeMovesFunction.body!)}`)
		const env = (degree: string | null, check = 'confess') => ({
			options: moves.options,
			owner: { key: 'character:1', name: 'Wren' },
			bindings: { what: { to: 'attribute', ids: ['bond.affection'], values: {}, bounds: {}, fields: { 'bond.affection': { entryType: 'bond', field: 'affection', entries: [] } } } },
			check: { selector: check, by: 'character:1', aimedAt: 'character:2', degree: degree ? { id: degree } : null },
		})
		const by = (degree: string) => mod.after(env(degree)).deltas?.[0]?.by
		assert.equal(by('cooled'), -1)
		assert.equal(by('warmed'), 1)
		assert.equal(by('confessed'), 2)
		assert.deepEqual(mod.after(env('awkward')), {})
		assert.deepEqual(mod.after(env('warmed', 'be-brave')), {})
		// The side the one aimed at holds, towards the one who confessed.
		assert.deepEqual(mod.after(env('warmed')).deltas, [
			{ op: 'set', owner: 'character:2', entry: { entryType: 'bond', towards: 'character:1' }, field: 'affection', by: 1, reason: 'how confess came out' },
		])
		assert.match(romance.ruleset.entryTypes!.find((e) => e.id === 'bond')!.prose, /cooled -1, warmed \+1, confessed \+2/)
	})
})

describe('🚧 ★6: the workplace holds footing with a place on the grapevine', () => {
	test('a one-sided tie, the world\'s, in a zone type the world owns', async () => {
		await import('../core-catalog/src/functions/index.js')
		const workplace = (await import('../core-catalog/src/rulesets/archetypes/workplace.js')).workplaceTemplate
		const s = rulesetSections(workplace.ruleset)
		const footing = s.entryTypes!.find((e) => e.id === 'footing')!
		assert.equal(footing.farEnd, 'place')
		assert.equal(tieSidesOf(footing), 1)
		assert.deepEqual(tieHoldersOf(footing), ['world'])
		const grapevine = s.zoneTypes!.find((z) => z.id === 'grapevine')!
		assert.deepEqual([grapevine.owners, grapevine.holds], [['world'], ['footing']])
		clean(rulesetSectionFindings(workplace.id, workplace.ruleset))
		has(rulesetSectionFindings(workplace.id, { ...workplace.ruleset, zoneTypes: s.zoneTypes!.filter((z) => z.id !== 'grapevine') }), 'unheld-tie')
	})
})
