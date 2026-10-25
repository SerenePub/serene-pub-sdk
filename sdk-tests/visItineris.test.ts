/**
 * 🚧 Vis Itineris (`core:ruleset/vis-itineris@1`) — rulesets programme W2-B: the
 * declaration passes every finding, every compendium row is a piece of its
 * repertoire, settings and presets round-trip, voices fit their budget,
 * derived entry type ids are valid, and the seeded scripts compute.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import {
	checkPiece,
	getAttributeSlot,
	getGenre,
	getRepertoire,
	getRuleset,
	isEntryTypeId,
	rulesetConventionsFor,
	rulesetEntryable,
	rulesetEntryTypeId,
	rulesetFindings,
	rulesetPresetOf,
	rulesetSelectorFamily,
	rulesetSettingValues,
	slotRulesetOwners,
	_rulesetDeclOf,
	CORE_FUNCTION_IDS,
	functionRefKey,
	presetsOf,
	rulesetSections,
	settingsOf,
	type RulesetProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const E = cat.visItinerisRuleset
/** 🚧 Its sections (2026-10-23): the registry declares it in them (`VIS_ITINERIS_RULESET`). */
const S = rulesetSections(E)
/** A function reference by its key. */
const ref = (key: string) => S.functions!.find((f) => functionRefKey(f) === key)
/**
 * 🚧 Vis Itineris as the shape before the sections named it, built from the parts the
 * sections are built from (`catalogueParity` proves the two read equal). What these tests
 * read of its selectors, conventions, settings, repertoires and compendium as the shape
 * before, they read here; what the declaration says, they read through its sections.
 */
const L = _rulesetDeclOf(E.id, {
	name: E.name,
	description: E.description,
	voice: cat.VIS_ITINERIS_VOICE,
	conventions: cat.VIS_ITINERIS_CONVENTIONS,
	settings: cat.VIS_ITINERIS_SETTINGS,
	presets: cat.VIS_ITINERIS_PRESETS,
	stats: [
		{ id: cat.levelSlot.id, config: { min: 1, max: 20 }, borrowed: true },
		{ id: cat.characterClassSlot.id, borrowed: true },
		{ id: cat.hpSlot.id, config: { min: 0, max: 999 }, default: 10, borrowed: true },
		...cat.VIS_ITINERIS_OWN_SLOTS.map((s) => ({ id: s.id })),
	],
	selectors: cat.VIS_ITINERIS_SELECTORS,
	repertoires: cat.VIS_ITINERIS_REPERTOIRES,
	compendium: cat.VIS_ITINERIS_COMPENDIUM,
	scripts: [
		{ phase: 'derived', priority: 10, seedKey: 'core:script/vis-itineris-derive' },
		{ phase: 'derived', priority: 20, seedKey: 'core:script/vis-itineris-bulk' },
		{ phase: 'pre-roll', priority: 10, seedKey: 'core:script/vis-itineris-heighten-spell' },
		{ phase: 'effects', priority: 90, seedKey: 'core:script/vis-itineris-level-up' },
	],
	conversions: [cat.VIS_ITINERIS_FROM_FREEFORM],
	plays: [cat.commonVocabulary],
})
const DIR = path.join(import.meta.dirname, '../core-catalog/src/rulesets/vis-itineris/compendium')
const runScript = (seedRow: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', seedRow.source)(JSON.parse(JSON.stringify(value)))
const reasons = (fs: readonly string[]) => fs.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1])

describe('Vis Itineris — the declaration', () => {
	test('registers under its id and passes every finding', () => {
		assert.equal(E.id, 'core:ruleset/vis-itineris@1')
		assert.equal(getRuleset(E.id), E)
		assert.deepEqual(rulesetFindings(E.id, E), [])
		assert.match(String((E.description as { en: string }).en), /System Reference Document 5\.2, licensed CC-BY-4\.0; see Licences\./)
	})

	// 🚧 Twelve since 2026-10-21 (Lair rewrite D9): the classes, with their
	// starting kits, moved here from the Dungeon Crawler — not entryable.
	test('twelve repertoires; eight entryable', () => {
		assert.deepEqual(
			S.entryTypes!.map((r) => r.id),
			['weapons', 'armour', 'gear', 'consumables', 'spells', 'spell-slots', 'features', 'feats', 'conditions', 'exits', 'creatures', 'classes'],
		)
		assert.deepEqual(rulesetEntryable(E), ['weapons', 'armour', 'gear', 'consumables', 'spells', 'feats', 'conditions', 'creatures'])
		const exits = getRepertoire(`${E.id}#exits`)!
		assert.equal(exits.relational, true)
		assert.deepEqual(exits.appliesTo, ['location'])
	})

	test('stats reuse core slots and add its own', () => {
		const ids = S.attributes!.map((a) => a.slot!)
		for (const reused of ['core:slot/level@1', 'core:slot/character-class@1', 'core:slot/hp@1']) assert.ok(ids.includes(reused), reused)
		assert.equal(ids.length, 24)
		assert.equal(new Set(ids).size, ids.length)
		assert.ok(ids.every((id) => id.startsWith('core:slot/itineris-') || ['core:slot/level@1', 'core:slot/character-class@1', 'core:slot/hp@1'].includes(id)))
	})

	test('time in rounds of 6 s, short and long rests, defaults are Vis Itineris\'s own', () => {
		assert.deepEqual(rulesetConventionsFor(E).time, { unit: 'round', roundSeconds: 6 })
		assert.deepEqual(rulesetConventionsFor(E).rest!.map((r) => [r.id, r.minutes]), [['short', 60], ['long', 480]])
		assert.deepEqual(rulesetSettingValues(E), { degrees: 'fourfold', actions: 'three', bonuses: 'typed', dying: 'dying-1-4', focus: 'sustain', casting: 'slots' })
	})

	test('voices: one per rigour, within 240 characters', () => {
		for (const r of ['prose', 'mechanics', 'scripts'] as const) {
			assert.ok(E.voice![r], r)
			assert.ok(E.voice![r]!.length <= 240, `${r}: ${E.voice![r]!.length}`)
		}
	})

	test('derived entry type ids are valid entry type ids (the dot is admitted)', () => {
		for (const rep of rulesetEntryable(E)) {
			const id = rulesetEntryTypeId(E.id, rep)
			assert.equal(id, `core:entry/vis-itineris.${rep}@1`)
			assert.ok(isEntryTypeId(id), id)
		}
		assert.ok(isEntryTypeId('core:entry/world-lore@1'))
		assert.ok(!isEntryTypeId('core:entry/vis-itineris.weapons.extra@1'))
	})

	test('scripts name seeded rows; conversion from Story is an empty id map', () => {
		const seeded = new Set(cat.CORE_SCRIPTS.map((s) => s.seedKey))
		// 🚧 Its own modules carry the seeded scripts (2026-10-23).
		const own = S.functions!.filter((f) => f.module).map((f) => f.module!.seedKey!)
		assert.equal(own.length, 4)
		for (const k of own) assert.ok(seeded.has(k), k)
		assert.deepEqual(E.options!.conversions, [{ from: 'core:ruleset/freeform@1', to: E.id, idMap: [] }])
		assert.deepEqual(cat.VIS_ITINERIS_PLUGIN_ID_MAP, [])
	})

	test('owns its own slots by listing them; borrows core health, level and class (2026-10-17)', () => {
		for (const { slot, borrowed } of S.attributes!) {
			const s = { id: slot!, borrowed }
			const shared = ['core:slot/level@1', 'core:slot/character-class@1', 'core:slot/hp@1'].includes(s.id)
			assert.equal(s.borrowed, shared ? true : undefined, s.id)
			// No slot spells what listing already says.
			assert.equal(getAttributeSlot(s.id)!.rulesetOwned, undefined, s.id)
			assert.deepEqual(slotRulesetOwners(getAttributeSlot(s.id)!), shared ? [] : [E.id], s.id)
		}
	})

	test('every check rolls with a modifier; attack and check are families; damage is a tally (audit D)', () => {
		// 🚧 In the sections (2026-10-23): a check is a reference to core's `check`; damage to its `tally`.
		for (const f of S.functions!) if (f.ref === CORE_FUNCTION_IDS.check) assert.ok((f.options as { base?: string } | undefined)?.base, `${f.key} names its modifier`)
		assert.equal(ref('attack'), undefined)
		assert.equal(ref('check'), undefined)
		assert.deepEqual(ref('damage'), { ref: CORE_FUNCTION_IDS.tally, key: 'damage' })
		// 🚧 …each check in its own words (GM 2026-10-23, G2 ★1): what a roll form reads.
		assert.deepEqual(ref('attack.spell'), { ref: CORE_FUNCTION_IDS.check, key: 'attack.spell', options: { base: 'casting-mod', label: { en: 'Spell attack' } } })
		for (const f of S.functions!) if (f.ref === CORE_FUNCTION_IDS.check) assert.ok((f.options as { label?: { en?: string } } | undefined)?.label?.en, `${f.key} has its words`)
		assert.deepEqual(rulesetSelectorFamily(E, 'attack.melee'), ['attack.melee', 'attack'])
		assert.deepEqual(rulesetSelectorFamily(E, 'skill.stealth'), ['skill.stealth', 'skill', 'check'])
		assert.deepEqual(rulesetSelectorFamily(E, 'ability.strength'), ['ability.strength', 'ability', 'check'])
		assert.deepEqual(rulesetSelectorFamily(E, 'save.dexterity'), ['save.dexterity', 'save'])
		assert.ok(rulesetSelectorFamily(E, 'initiative').includes('check'))
		assert.ok(!rulesetSelectorFamily(E, 'attack.melee').includes('check'), 'a condition on checks does not reach an attack')
	})

	test('repertoires: earshot and gmOnly, one activation list, damageType, no traits a field already says', () => {
		const rep = (id: string) => getRepertoire(`${E.id}#${id}`)!
		assert.equal(rep('spell-slots').earshot, 'holder')
		assert.equal(rep('creatures').gmOnly, true)
		assert.equal(rep('spells').earshot, undefined)
		const acts = (id: string) => rep(id).piece.fields!.activation!.of
		assert.deepEqual(acts('spells'), acts('consumables'))
		assert.deepEqual(acts('spells'), acts('features'))
		for (const id of ['spells', 'features', 'consumables']) assert.equal(rep(id).piece.fields!.actions, undefined, id)
		assert.equal(rep('spells').piece.fields!.actionCost?.type, 'integer')
		assert.equal(rep('spells').piece.fields!.castingTime, undefined)
		for (const id of ['weapons', 'consumables', 'spells']) {
			assert.ok(rep(id).piece.fields!.damageType, id)
			assert.equal((rep(id).piece.fields!.damage as { fields: object }).fields.hasOwnProperty('type'), false, id)
		}
		assert.equal(rep('conditions').piece.fields!.value, undefined)
		assert.ok(rep('conditions').piece.fields!.duration, 'the universal part')
		assert.equal(rep('spells').piece.fields!.effectDuration?.type, 'object')
		const dup = /^(simple|martial|two-handed|versatile|school-.+|attack)$/
		for (const [repId, rows] of Object.entries(E.library!.rows))
			for (const r of rows) {
				for (const t of r.piece.traits ?? []) assert.ok(!dup.test(t), `${repId}/${r.id} trait ${t}`)
				if (repId === 'armour') assert.equal(r.piece.traits, undefined, r.id)
				if (r.piece.damageType) assert.ok(!(r.piece.traits ?? []).includes(r.piece.damageType as string), `${r.id} repeats its damage type`)
				assert.ok(!JSON.stringify(r).includes('null'), `${repId}/${r.id} carries no explicit null`)
			}
		assert.ok(rulesetConventionsFor(E).bonuses!.types.includes('gear'))
		assert.ok(!rulesetConventionsFor(E).bonuses!.types.includes('item'))
		assert.deepEqual(getAttributeSlot('core:slot/itineris-spell-points@1')!.label, { en: 'Spell points' })
		assert.deepEqual(rep('spell-slots').label, { en: 'Spell slots' })
	})
})

describe('🚧 Vis Itineris — item effects the handler executes (owner ruling ★4, 2026-10-18)', () => {
	const mech = (rep: string) => getRepertoire(`${E.id}#${rep}`)!.mechanics ?? []
	test('a weapon: finesse or ranged rolls with Strength or Dexterity; a hit harms by its dice plus the check\'s modifier', () => {
		const w = mech('weapons')
		const roll = w.find((m) => m.verb === 'rollWith') as { on: string; target: string; from: readonly string[] }
		assert.deepEqual([roll.on, roll.target, roll.from], ['hit', 'attack', ['strength-mod', 'dexterity-mod']])
		// 🚧 An amount (2026-10-22, M3), never the ⏳ `dice: 'piece.damage'`.
		const harm = w.find((m) => m.verb === 'harm') as { on: string; amount: unknown; dice?: string; plus: string; stat: string }
		assert.deepEqual([harm.on, harm.amount, harm.plus, harm.stat], ['hit', { selector: 'piece.damage' }, 'check', 'hp'])
		assert.equal(harm.dice, undefined)
		// The rider that only said so (and read on the table's line as done) is gone.
		assert.ok(!w.some((m) => m.verb === 'rider' && /roll the weapon's damage/.test((m as { text: string }).text)))
	})
	test('a consumable: spent on use, landed or not; heals, harms or cures by its fields', () => {
		const c = mech('consumables')
		assert.deepEqual(c.filter((m) => m.verb === 'consume').map((m) => m.on).sort(), ['hit', 'use'])
		assert.ok(c.some((m) => m.verb === 'heal' && JSON.stringify((m as { amount?: unknown }).amount) === JSON.stringify({ selector: 'piece.heals' })))
		const cure = c.find((m) => m.verb === 'cure') as { traits: readonly string[] }
		assert.deepEqual(cure.traits, ['condition-poisoned', 'condition-envenomed'])
		assert.ok(!c.some((m) => m.verb === 'rider'), 'no rider says what the handler does')
	})
	test('a spell heals with the caster\'s spellcasting modifier; gear spends a use only when it counts them', () => {
		assert.deepEqual((mech('spells').find((m) => m.verb === 'heal') as { plus: readonly string[] }).plus, ['casting-mod'])
		assert.deepEqual(mech('gear').find((m) => m.verb === 'consume')?.predicate, { path: 'piece.uses', truthy: true })
	})
})

describe('Vis Itineris — settings and presets', () => {
	test('each preset round-trips through values and back to its id', () => {
		for (const p of presetsOf(E)) {
			const values = rulesetSettingValues(E, { preset: p.id })
			assert.deepEqual(values, { ...rulesetSettingValues(E), ...p.values })
			assert.equal(rulesetPresetOf(E, values), p.id)
		}
		assert.equal(rulesetPresetOf(E, { degrees: 'classic' }), undefined, 'a mix is no preset')
	})

	test('casting: slots or spell points (ours); Classic plays slots', () => {
		assert.deepEqual(settingsOf(E).casting!.choices.map((c) => c.id), ['slots', 'points'])
		assert.equal(settingsOf(E).casting!.default, 'slots')
		assert.equal(rulesetSettingValues(E, { preset: 'classic' }).casting, 'slots')
		assert.equal(rulesetSettingValues(E, { values: { casting: 'points' } }).casting, 'points')
		assert.ok(S.attributes!.some((a) => a.slot === 'core:slot/itineris-spell-points@1'))
	})

	test('Classic restores the printed rules in the conventions', () => {
		const classic = rulesetConventionsFor(E, rulesetSettingValues(E, { preset: 'classic' }))
		assert.equal(classic.actions!.perTurn, 1)
		assert.deepEqual(classic.bonuses, { types: ['edge'], stacking: 'sum', edge: 'edge' })
		assert.equal(classic.degrees!.naturalShift, undefined)
		assert.deepEqual(classic.degrees!.natural?.high, { from: 20, band: 'critical' })
		assert.ok(!classic.degrees!.bands.some((b) => b.five === 'partial'))
		const own = rulesetConventionsFor(E)
		assert.equal(own.actions!.perTurn, 3)
		assert.deepEqual(own.degrees!.naturalShift, { high: 20, low: 1 })
		assert.deepEqual(own.degrees!.bands.map((b) => b.from), [undefined, -9, 0, 10])
		assert.deepEqual(own.time, classic.time, 'settings never move time')
	})

	test('unknown settings and choices read as the layer beneath', () => {
		assert.equal(rulesetSettingValues(E, { values: { degrees: 'sevenfold', nope: 'x' } as never }).degrees, 'fourfold')
		assert.equal(rulesetSettingValues(E, { preset: 'classic', values: { focus: 'sustain' } }).focus, 'sustain')
	})

	test('setting findings are named', () => {
		// The shape before the sections (`L`): a section beside its old shape is refused as such (`legacy-beside-section`).
		const props = L as unknown as RulesetProps
		const f = (over: Partial<RulesetProps>) => reasons(rulesetFindings('acme.e:ruleset/e@1', { ...props, ...over }))
		assert.ok(f({ presets: [{ id: 'x', label: { en: 'X' }, values: { degrees: 'nope' } }] }).includes('bad-preset'))
		assert.ok(f({ settings: { ...L.settings, focus: { label: { en: 'F' }, default: 'a', choices: [{ id: 'a', label: { en: 'A' } }] } } }).includes('bad-setting'))
		assert.ok(
			f({ settings: { ...L.settings, again: { label: { en: 'Again' }, default: 'a', choices: [{ id: 'a', label: { en: 'A' }, conventions: { actions: { perTurn: 2 } } }, { id: 'b', label: { en: 'B' } }] } } }).includes('setting-overlap'),
		)
		assert.ok(f({ conventions: { ...L.conventions!, bonuses: { types: ['item'], stacking: 'sum', edge: 'edge' } } }).includes('bad-bonuses'))
	})
})

describe('Vis Itineris — the compendium slice', () => {
	const rows = E.library!.rows

	// 🚧 57 since 2026-10-21 (Lair rewrite D9): the six classes, moved from the
	// Dungeon Crawler's kits. Entryable rows are still 51 (primers.test.ts).
	test('57 rows: 12 weapons, 6 armour, 8 gear, 4 consumables, 12 spells, 4 feats, 5 conditions, 6 classes', () => {
		const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]))
		assert.deepEqual(counts, { weapons: 12, armour: 6, gear: 8, consumables: 4, spells: 12, feats: 4, conditions: 5, classes: 6 })
		assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 57)
	})

	test('every row validates as a piece of its repertoire, with version and source', () => {
		for (const [rep, list] of Object.entries(rows)) {
			const r = getRepertoire(`${E.id}#${rep}`)!
			for (const row of list) {
				const { id, version, source, piece, ...rest } = row
				assert.deepEqual(Object.keys(rest).filter((k) => k !== 'lang'), [], `${rep}/${id}: bookkeeping beside, the piece nested`)
				assert.equal(version, cat.VIS_ITINERIS_COMPENDIUM_VERSION, id)
				const ours = id === 'envenomed'
				assert.deepEqual(source, ours ? { document: 'Vis Itineris', licence: 'Apache-2.0' } : { document: 'SRD 5.2.1', licence: 'CC-BY-4.0' }, id)
				assert.equal(checkPiece(r, { kind: 'inline', ...piece } as never, { timeUnit: 'round' }), null, `${rep}/${id}`)
				assert.equal(checkPiece(r, { kind: 'compendium', compendiumId: E.id, pieceId: id, version } as never), null, `${rep}/${id} by reference`)
				assert.ok(String(piece.description).split(/\s+/).length <= 40, `${rep}/${id} description is short`)
			}
		}
		const sword = rows.weapons.find((r) => r.id === 'longsword')!
		assert.deepEqual(sword.piece.damage, { dice: 1, die: 'd8' })
		assert.equal(sword.piece.damageType, 'slashing')
	})

	test('Envenomed (ours): three rounds, health −1 each round, ended by a Constitution save or antitoxin', () => {
		const row = rows.conditions.find((r) => r.id === 'envenomed')!
		assert.deepEqual(row.piece.duration, { units: 'round', value: 3, expiry: 'elapsed' })
		assert.deepEqual(row.piece.traits, ['condition-envenomed'])
		const mech = getRepertoire(`${E.id}#conditions`)!.mechanics!.filter((m) => JSON.stringify(m.predicate ?? {}).includes('condition-envenomed'))
		assert.deepEqual(
			mech.find((m) => m.verb === 'modify'),
			{ verb: 'modify', on: 'elapsed', every: 1, target: 'hp', value: -1, predicate: { traits: { all: ['condition-envenomed'] } } },
		)
		const rider = mech.find((m) => m.verb === 'rider') as { text: string } | undefined
		assert.match(rider?.text ?? '', /Constitution save/)
		assert.match(rider?.text ?? '', /antitoxin/)
		assert.ok(rows.consumables.some((r) => r.id === 'antitoxin'))
	})

	test('spells span levels 0–3', () => {
		assert.deepEqual([...new Set(rows.spells.map((s) => s.piece.level as number))].sort(), [0, 1, 2, 3])
	})

	test('the licence notice sits beside the data, and names nothing else', () => {
		const files = readdirSync(DIR)
		assert.ok(files.includes('LICENSE-CC-BY-4.0.md'))
		const notice = readFileSync(path.join(DIR, 'LICENSE-CC-BY-4.0.md'), 'utf8').trim()
		assert.match(notice, /^This work includes material from the System Reference Document 5\.2\.1/)
		const [required, ours, ...more] = notice.split(/\n\n/)
		assert.match(required!, /creativecommons\.org\/licenses\/by\/4\.0\/legalcode\.$/)
		assert.equal(required!.split('\n').length, 1, 'the required statement, on one line')
		// Then which rows are ours, not the SRD's (2026-10-17).
		assert.match(ours ?? '', /Envenomed/)
		assert.match(ours ?? '', /not .*SRD|Not every row/i)
		assert.deepEqual(more, [])
	})

	test('the licensor is named in the notice and nowhere in the rows', () => {
		const notice = readFileSync(path.join(DIR, 'LICENSE-CC-BY-4.0.md'), 'utf8')
		const licensor = /\) by (.+?) LLC/.exec(notice)?.[1]
		assert.ok(licensor, 'the notice names its licensor')
		for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json')))
			assert.ok(!readFileSync(path.join(DIR, f), 'utf8').toLowerCase().includes(licensor!.toLowerCase()), f)
	})

	test('the generation script is a skeleton that fetches nothing', () => {
		const p = path.join(import.meta.dirname, '../scripts/vis-itineris-compendium.mjs')
		assert.ok(existsSync(p))
		assert.ok(!/fetch\(|https?:\/\//.test(readFileSync(p, 'utf8')))
	})
})

describe('Vis Itineris — the seeded scripts', () => {
	test('derive: modifiers, proficiency, armour class, passive perception', () => {
		const out = runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, {
			abilities: { strength: 16, dexterity: 14, constitution: 14, intelligence: 8, wisdom: 12, charisma: 10 },
			level: 5,
			armour: [
				{ name: 'Chain shirt', category: 'medium', acBase: 13, dexCap: 2 },
				{ name: 'Shield', category: 'shield', acBase: 2 },
			],
			saves: ['strength', 'constitution'],
			trained: ['perception', 'athletics'],
			expert: ['athletics'],
		})
		assert.equal(out.mods.strength, 3)
		assert.equal(out.mods.intelligence, -1)
		assert.equal(out.proficiency, 3)
		assert.equal(out.armourClass, 17)
		assert.equal(out.saves.strength, 6)
		assert.equal(out.skills.athletics, 9)
		assert.equal(out.passivePerception, 14)
		assert.equal(runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, {}).armourClass, 10)
		// The casting modifier: the named ability's, else the best mental one.
		assert.equal(out.castingMod, 1)
		assert.equal(runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, { abilities: { intelligence: 18 }, casting: 'charisma' }).castingMod, 0)
		const env = runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, { values: { 'itineris-wisdom': 16, level: 1 }, pieces: {} })
		assert.equal(env.values['casting-mod'], 3)
		assert.equal(env.values['spell-dc'], 13)
		assert.ok(env.modifies.some((m: { target: string; value: number }) => m.target === 'attack.spell' && m.value === 2), 'proficiency on a spell attack')
	})

	test('heighten: fireball at 5 is 10d6; magic missile at 3 adds darts; cantrips grow with level', () => {
		const spell = (id: string) => E.library!.rows.spells.find((s) => s.id === id)!.piece
		assert.equal(runScript(cat.VIS_ITINERIS_HEIGHTEN_SCRIPT, { spell: spell('fireball'), slotLevel: 5 }).formula, '10d6')
		assert.equal(runScript(cat.VIS_ITINERIS_HEIGHTEN_SCRIPT, { spell: spell('magic-missile'), slotLevel: 3 }).formula, '5d4+5')
		assert.equal(runScript(cat.VIS_ITINERIS_HEIGHTEN_SCRIPT, { spell: spell('fire-bolt'), characterLevel: 11 }).formula, '3d10')
		assert.equal(runScript(cat.VIS_ITINERIS_HEIGHTEN_SCRIPT, { spell: spell('fireball'), slotLevel: 2 }).formula, null)
	})

	test('level-up: health by the class die, proficiency, slots by caster table', () => {
		const fighter = runScript(cat.VIS_ITINERIS_LEVEL_UP_SCRIPT, { class: 'Fighter', level: 2, conMod: 2 })
		assert.deepEqual([fighter.hitDie, fighter.hpGain, fighter.proficiency, fighter.slots], ['d10', 8, 2, []])
		const wizard = runScript(cat.VIS_ITINERIS_LEVEL_UP_SCRIPT, { class: 'wizard', level: 5, conMod: 0 })
		assert.deepEqual(wizard.slots, [{ level: 1, max: 4 }, { level: 2, max: 3 }, { level: 3, max: 2 }])
		assert.equal(wizard.proficiency, 3)
		assert.equal(runScript(cat.VIS_ITINERIS_LEVEL_UP_SCRIPT, { class: 'wizard', level: 1, conMod: -3 }).hpGain, 3)
		// Spell points (ours): 4 at level 1 for a full caster, half for a half caster, none otherwise.
		assert.equal(runScript(cat.VIS_ITINERIS_LEVEL_UP_SCRIPT, { class: 'wizard', level: 1 }).spellPoints, 4)
		assert.equal(wizard.spellPoints, 12)
		assert.equal(runScript(cat.VIS_ITINERIS_LEVEL_UP_SCRIPT, { class: 'paladin', level: 1 }).spellPoints, 2)
		assert.equal(fighter.spellPoints, 0)
	})

	test('🚧 derive at a spell-points table: the pool\'s maximum by class and level; never at a slots one (P2-4)', () => {
		const env = (settings: Record<string, string>, cls: string, level: number) =>
			runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, { values: { 'character-class': cls, level }, pieces: {}, settings })
		assert.equal(env({ casting: 'points' }, 'Wizard', 1).values['spell-points-max'], 4)
		assert.equal(env({ casting: 'points' }, 'cleric', 3).values['spell-points-max'], 8)
		assert.equal(env({ casting: 'points' }, 'Ranger', 1).values['spell-points-max'], 2)
		assert.equal(env({ casting: 'points' }, 'Fighter', 1).values['spell-points-max'], 0)
		assert.equal(env({ casting: 'slots' }, 'Wizard', 1).values['spell-points-max'], undefined)
		assert.equal(env({}, 'Wizard', 1).values['spell-points-max'], undefined)
		// The derive script, the level-up script and a genre's kit read one pool rule.
		for (const cls of ['wizard', 'cleric', 'bard', 'paladin', 'ranger', 'fighter', 'rogue', ''])
			for (const level of [1, 2, 5, 20])
				assert.equal(runScript(cat.VIS_ITINERIS_LEVEL_UP_SCRIPT, { class: cls, level }).spellPoints, cat.spellPointsFor(cls, level), `${cls} ${level}`)
	})

	test('🚧 armour class is one rule: the derive script and the shared source agree (P2-3)', () => {
		// eslint-disable-next-line no-new-func
		const armourClassOf = new Function(`${cat.VIS_ITINERIS_ARMOUR_CLASS_JS}; return armourClassOf`)()
		assert.equal(armourClassOf(2, [{ category: 'heavy', acBase: 16, dexCap: 0 }, { category: 'shield', acBase: 2 }]).ac, 18)
		assert.equal(armourClassOf(3, [{ category: 'medium', acBase: 13, dexCap: 2 }]).ac, 15)
		assert.equal(armourClassOf(1, []).ac, 11)
		const env = runScript(cat.VIS_ITINERIS_DERIVE_SCRIPT, {
			values: { 'itineris-dexterity': 14 },
			pieces: { armour: [{ category: 'light', acBase: 11 }, { category: 'shield', acBase: 2 }] },
		})
		assert.equal(env.values['armour-class'], 15)
		// Armour class and the spell-point pool are on the sheet.
		const sels = (k: string) => ref(k)!.options as { onSheet?: boolean; label?: { en: string } }
		assert.deepEqual([sels('armour-class').onSheet, sels('armour-class').label?.en], [true, 'Armour class'])
		// 🚧 Not on the sheet (PLAN-dc-after-walk2 Q1-6): the pool's own row is bounded by it — one row, never two.
		assert.equal(sels('spell-points-max').onSheet, undefined)
	})

	test('bulk: capacity Strength × 15; burdened past half', () => {
		const out = runScript(cat.VIS_ITINERIS_BULK_SCRIPT, { strength: 10, items: [{ weight: 55 }, { weight: 2, count: 10 }] })
		assert.deepEqual([out.carried, out.capacity, out.load, out.speedPenalty], [75, 150, 'light', 0])
		assert.equal(runScript(cat.VIS_ITINERIS_BULK_SCRIPT, { strength: 8, items: [{ weight: 70 }] }).load, 'burdened')
		assert.equal(runScript(cat.VIS_ITINERIS_BULK_SCRIPT, { strength: 8, items: [{ weight: 130 }] }).load, 'over')
	})
})

describe('Vis Itineris — genre hooks', () => {
	test('Dungeon Crawler recommends Vis Itineris; the Lair and Story recommend Freeform, Vis Itineris and Wherewithal; rigour defaults per genre', () => {
		const g = (id: string) => getGenre(id)!
		// 🚧 2026-10-21 (the Lair's rewrite, D8): Freeform by default, Vis Itineris — the Dungeon Crawler's — for rules and dice;
		// 🚧 2026-10-23 (AUDIT-core-genres Lair 2): and Wherewithal, as Story does.
		assert.deepEqual(g('core:genre/lair').rulesets, {
			recommended: ['core:ruleset/freeform@1', E.id, 'core:ruleset/wherewithal@1'],
			default: 'core:ruleset/freeform@1',
		})
		assert.deepEqual(g('core:genre/dungeon-crawler').rulesets, { recommended: [E.id], default: E.id })
		// 🚧 2026-10-19: Story (the roleplay Chat and Adventure) plays in words by default;
		// 🚧 2026-10-22 (M3): and recommends Wherewithal, core's diceless ruleset.
		assert.deepEqual(g('core:genre/story').rulesets, {
			recommended: ['core:ruleset/freeform@1', E.id, 'core:ruleset/wherewithal@1'],
			default: 'core:ruleset/freeform@1',
		})
		assert.equal(g('core:genre/lair').rigour!.default, 'mechanics')
		assert.equal(g('core:genre/dungeon-crawler').rigour!.default, 'scripts')
		assert.deepEqual(g('core:genre/story').rigour, { options: ['prose', 'mechanics', 'scripts'], default: 'prose' })
		// Chat, the assistant, plays no ruleset: it declares no rigour (prose only, unread).
		assert.equal(g('core:genre/chat').rigour, undefined)
	})
})

test('a piece field may not take a held piece\'s form keys', async () => {
	const { defineRepertoire, RulesetError } = await import('@serene-pub/sdk')
	assert.throws(
		() => defineRepertoire('bad', { label: { en: 'Bad' }, prose: 'Bad.', piece: { type: 'object', fields: { kind: { type: 'string', label: { en: 'Kind' } } } } }),
		(e: unknown) => e instanceof RulesetError && e.findings.some((f) => f.startsWith('[piece-reserved-field]')),
	)
})

// ── 🚧 Check methods (PLAN-rulesets-authoring D1, 2026-10-22): Vis Itineris declares its own (M3) ──

/**
 * Vis Itineris before M3 (2026-10-22) — the shape a stored copy made before
 * check methods still holds: `conventions.dice`, the top-level bands, the
 * old harm/heal spelling, no tags. Built from today's declaration by putting
 * the ⏳ spellings back, so it is exactly what a copy written then carries.
 */
/** The words the dying, focus and casting choices said before M3 gave them the rules' numbers. */
const PRE_M3_WORDS: Record<string, Record<string, string>> = {
	dying: {
		'dying-1-4': 'At zero health one roll decides: back up on 1 health, or down for good — dead, or taken out at a gentle table.',
		'death-saves': 'At zero health a roll each round: three passes and they are stable, three failures and they die. Healing brings them back.',
	},
	focus: {
		sustain: 'Spend an action each turn to keep a spell going; stop and it ends.',
		concentration: 'One spell held at a time; taking harm calls for a save to keep it.',
	},
}
const legacyCopy = (decl: typeof L, words = false) => {
	const { methods: _m, defaultMethod: _d, ...conventions } = decl.conventions!
	const { bands, kind: _k, label: _l, ...die } = decl.conventions!.methods!.die as { bands: unknown; kind: string; label: unknown; sides: number }
	// With `words`, the settings as they read before M3 too: no casting pool, the old choice words.
	const settings = !words
		? decl.settings
		: Object.fromEntries(
				Object.entries(decl.settings ?? {}).map(([k, set]) => [
					k,
					{
						...set,
						choices: set.choices.map(({ conventions: patch, ...c }) => ({
							...c,
							...(patch && !('casting' in patch) ? { conventions: patch } : {}),
							...(PRE_M3_WORDS[k]?.[c.id] ? { description: { en: PRE_M3_WORDS[k]![c.id]! } } : {}),
						})),
					},
				]),
			)
	return {
		...decl,
		settings,
		conventions: { ...conventions, dice: die },
		difficultyBands: bands,
		repertoires: decl.repertoires.map(({ tags: _t, ...r }) => ({
			...r,
			mechanics: r.mechanics?.map((m) =>
				(m.verb === 'harm' || m.verb === 'heal') && m.amount && typeof m.amount === 'object' ? (({ amount, ...rest }) => ({ ...rest, dice: (amount as { selector: string }).selector }))(m) : m,
			),
		})),
	}
}

describe('🚧 Vis Itineris declares its check method, its tags and its amounts (M3, 2026-10-22)', () => {
	test('one die-target method, `die`, holding its bands — no `dice`, no top-level bands, nothing to warn of', async () => {
		const { normaliseRuleset, rulesetCheckMethod, rulesetProvides, rulesetWarnings, defaultDifficultyBand, rulesetDifficultyBands } = await import('@serene-pub/sdk')
		// 🚧 Read through the sections (2026-10-23): its way to decide is a reference to core's die-target, keyed `die`.
		const conv = rulesetConventionsFor(E)
		assert.equal(conv.dice, undefined)
		assert.equal(E.difficultyBands, undefined)
		assert.deepEqual(Object.keys(conv.methods ?? {}), ['die'])
		assert.equal(conv.defaultMethod, 'die')
		const die = conv.methods!.die as { kind: string; sides: number; bands: readonly { id: string }[]; modifierOf?: string }
		assert.deepEqual([die.kind, die.sides, die.modifierOf], ['die-target', 20, undefined])
		assert.deepEqual(die.bands.map((b) => b.id), ['very-easy', 'easy', 'medium', 'hard', 'very-hard', 'nearly-impossible'])
		assert.equal(rulesetCheckMethod(E, 'skill.stealth').key, 'die')
		assert.equal(defaultDifficultyBand(E)?.id, 'medium')
		assert.deepEqual(rulesetDifficultyBands(E, 'die'), die.bands)
		assert.deepEqual(normaliseRuleset(E).conventions!.degrees, conv.degrees)
		const p = rulesetProvides(E)
		assert.deepEqual(p.methods, ['die-target'])
		assert.ok(p.dice && p.chance && p.conditions && p.casting && p.tagged)
		assert.deepEqual(rulesetWarnings(E), [])
		// A session's settings are laid over first: Hit or miss reads as its own degrees.
		const classic = normaliseRuleset(E, rulesetSettingValues(E, { preset: 'classic' }))
		assert.equal(classic.conventions.degrees.natural?.high?.band, 'critical')
		assert.equal(classic.conventions.methods.die!.kind, 'die-target')
	})

	test('a tag on every repertoire — spells cast, spell slots are a resource, never casting', () => {
		const tags = Object.fromEntries(S.entryTypes!.map((r) => [r.id, r.tags]))
		assert.deepEqual(tags, {
			weapons: ['weapon'],
			armour: ['armour'],
			gear: ['gear'],
			consumables: ['consumable'],
			spells: ['casting'],
			'spell-slots': ['resource'],
			features: ['feature'],
			feats: ['feat'],
			conditions: ['condition'],
			exits: ['exit'],
			creatures: ['creature'],
			classes: ['class'],
		})
	})

	test('spell points are declared on the `casting: points` choice; the dying and focus choices read the rules\' numbers', () => {
		const casting = settingsOf(E).casting!.choices.find((c) => c.id === 'points')!.conventions!.casting
		assert.deepEqual(casting, { pool: 'itineris-spell-points', cost: 'level', repertoire: 'spells', refill: 'long', max: 'spell-points-max' })
		assert.equal(settingsOf(E).casting!.choices.find((c) => c.id === 'slots')!.conventions, undefined)
		assert.deepEqual(rulesetConventionsFor(E, { casting: 'points' }).casting, casting)
		assert.equal(rulesetConventionsFor(E, {}).casting, undefined)
		// The long rest the pool refills on is declared, in minutes.
		assert.equal(rulesetConventionsFor(E).rest!.find((r) => r.id === 'long')!.minutes, 480)
		const words = (setting: string, id: string) => (settingsOf(E)[setting]!.choices.find((c) => c.id === id)!.description as { en: string }).en
		// 🚧 Its fall rule's reference's numbers (core:function/at-zero-health@1; lane G3, 2026-10-23, ★I).
		const z = cat.VIS_ITINERIS_AT_ZERO_HEALTH_RULE
		assert.match(words('dying', 'dying-1-4'), new RegExp(`${z.door.target} or more .* ${z.door.upOn} health`))
		assert.match(words('dying', 'death-saves'), new RegExp(`${z.saves!.passes} passes .* ${z.saves!.failures} failures`))
		assert.match(words('focus', 'concentration'), new RegExp(`against ${cat.VIS_ITINERIS_FOCUS.concentration.target}`))
	})

	test('a stored copy written before check methods reads as this declaration — through the aliases, with its warnings', async () => {
		const { normaliseRuleset, rulesetWarnings, rulesetFindings: findings } = await import('@serene-pub/sdk')
		const old = legacyCopy(L) as never
		// The legacy copy is still a valid declaration, and still warned.
		assert.deepEqual(findings(E.id, old), [])
		const warned = reasons(rulesetWarnings(old))
		for (const r of ['legacy-dice', 'legacy-difficulty-bands', 'legacy-amount', 'untagged-repertoires']) assert.ok(warned.includes(r), `${r} in ${warned.join(', ')}`)
		// Read through the aliases, its method is today's (less the label it never had), under the same key.
		const n = normaliseRuleset(old)
		const { label: _l, ...today } = L.conventions!.methods!.die as Record<string, unknown>
		assert.deepEqual(n.conventions.methods, { die: today })
		assert.equal(n.conventions.defaultMethod, 'die')
		// Its harm/heal amounts read as today's.
		const amounts = (r: { repertoires: readonly { mechanics?: readonly unknown[] }[] }) =>
			r.repertoires.flatMap((x) => (x.mechanics ?? []).filter((m) => ['harm', 'heal'].includes((m as { verb: string }).verb)))
		assert.deepEqual(amounts(n as never), amounts(L))
	})

	test("its document's hash moved, deliberately: the method, tags, amounts, the casting pool and the numbered choices", async () => {
		const { canonicalize, rulesetDocumentOf } = await import('@serene-pub/sdk')
		const { createHash } = await import('node:crypto')
		const digest = createHash('sha256').update(canonicalize(rulesetDocumentOf(E) as never)).digest('hex').slice(0, 16)
		// Moved 2026-10-22 (M3): `conventions.dice` + top-level `difficultyBands` →
		// `methods.die` (+ label) and `defaultMethod`; tags on all twelve
		// repertoires; harm/heal `dice` → `amount`; `casting: points` lays
		// `conventions.casting`; the dying and focus choices' words read the
		// rules' numbers. Proven: today's declaration with exactly those put back
		// (legacyCopy with its words) hashes to the pin before M3.
		const before = createHash('sha256').update(canonicalize(rulesetDocumentOf(legacyCopy(L, true) as never) as never)).digest('hex').slice(0, 16)
		assert.equal(before, '0d26c4585600ae11')
		// 🚧 Moved again 2026-10-23: the same rules in the seven sections (`catalogueParity`); the shape before them still hashes as it did.
		assert.equal(createHash('sha256').update(canonicalize(rulesetDocumentOf(L) as never)).digest('hex').slice(0, 16), 'b07a6e3b8fe47be0')
		// Moved again 2026-10-23 (genres GM): core's rest and fall rule referenced (G3, S3, ★I), each check in its words (G2 ★1).
		// 🚧 Moved again 2026-10-23 (RF fix 8): its borrowed level, class and health say their tags (`level`,
		// `class`, `health`) for what a genre plays best with. Proven: with those three tags taken off, it
		// hashes to '75f4c4c69cd43155'. Recomputed after the final build.
		assert.equal(digest, '17daa8bfe5339da9') // was '75f4c4c69cd43155', before that '4ade3f8c8d3caf8b', before that 'b07a6e3b8fe47be0'
	})
})
