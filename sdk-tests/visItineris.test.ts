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
	type RulesetProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const E = cat.visItinerisRuleset
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

	test('eleven repertoires; eight entryable', () => {
		assert.deepEqual(
			E.repertoires.map((r) => r.id),
			['weapons', 'armour', 'gear', 'consumables', 'spells', 'spell-slots', 'features', 'feats', 'conditions', 'exits', 'creatures'],
		)
		assert.deepEqual(rulesetEntryable(E), ['weapons', 'armour', 'gear', 'consumables', 'spells', 'feats', 'conditions', 'creatures'])
		const exits = getRepertoire(`${E.id}#exits`)!
		assert.equal(exits.relational, true)
		assert.deepEqual(exits.appliesTo, ['location'])
	})

	test('stats reuse core slots and add its own', () => {
		const ids = E.stats.map((s) => s.id)
		for (const reused of ['core:slot/level@1', 'core:slot/character-class@1', 'core:slot/hp@1']) assert.ok(ids.includes(reused), reused)
		assert.equal(ids.length, 24)
		assert.equal(new Set(ids).size, ids.length)
		assert.ok(ids.every((id) => id.startsWith('core:slot/itineris-') || ['core:slot/level@1', 'core:slot/character-class@1', 'core:slot/hp@1'].includes(id)))
	})

	test('time in rounds of 6 s, short and long rests, defaults are Vis Itineris\'s own', () => {
		assert.deepEqual(E.conventions.time, { unit: 'round', roundSeconds: 6 })
		assert.deepEqual(E.conventions.rest!.map((r) => [r.id, r.minutes]), [['short', 60], ['long', 480]])
		assert.deepEqual(rulesetSettingValues(E), { degrees: 'fourfold', actions: 'three', bonuses: 'typed', dying: 'dying-1-4', focus: 'sustain', casting: 'slots' })
	})

	test('voices: one per rigour, within 240 characters', () => {
		for (const r of ['prose', 'mechanics', 'scripts'] as const) {
			assert.ok(E.voice[r], r)
			assert.ok(E.voice[r]!.length <= 240, `${r}: ${E.voice[r]!.length}`)
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
		for (const s of E.scripts ?? []) assert.ok(seeded.has(s.seedKey), s.seedKey)
		assert.deepEqual(E.conversions, [{ from: 'core:ruleset/freeform@1', to: E.id, idMap: [] }])
		assert.deepEqual(cat.VIS_ITINERIS_PLUGIN_ID_MAP, [])
	})

	test('owns its own slots by listing them; borrows core health, level and class (2026-10-17)', () => {
		for (const s of E.stats) {
			const shared = ['core:slot/level@1', 'core:slot/character-class@1', 'core:slot/hp@1'].includes(s.id)
			assert.equal(s.borrowed, shared ? true : undefined, s.id)
			// No slot spells what listing already says.
			assert.equal(getAttributeSlot(s.id)!.rulesetOwned, undefined, s.id)
			assert.deepEqual(slotRulesetOwners(getAttributeSlot(s.id)!), shared ? [] : [E.id], s.id)
		}
	})

	test('every check rolls with a modifier; attack and check are families; damage is a tally (audit D)', () => {
		const sel = E.selectors!
		for (const [name, d] of Object.entries(sel)) if (d.kind === 'check') assert.ok(d.base, `${name} names its modifier`)
		assert.equal(sel.attack, undefined)
		assert.equal(sel.check, undefined)
		assert.deepEqual(sel.damage, { kind: 'tally' })
		assert.deepEqual(sel['attack.spell'], { kind: 'check', base: 'casting-mod' })
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
		for (const [repId, rows] of Object.entries(E.compendium!.rows))
			for (const r of rows) {
				for (const t of r.piece.traits ?? []) assert.ok(!dup.test(t), `${repId}/${r.id} trait ${t}`)
				if (repId === 'armour') assert.equal(r.piece.traits, undefined, r.id)
				if (r.piece.damageType) assert.ok(!(r.piece.traits ?? []).includes(r.piece.damageType as string), `${r.id} repeats its damage type`)
				assert.ok(!JSON.stringify(r).includes('null'), `${repId}/${r.id} carries no explicit null`)
			}
		assert.ok(E.conventions.bonuses!.types.includes('gear'))
		assert.ok(!E.conventions.bonuses!.types.includes('item'))
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
		const harm = w.find((m) => m.verb === 'harm') as { on: string; dice: string; plus: string; stat: string }
		assert.deepEqual([harm.on, harm.dice, harm.plus, harm.stat], ['hit', 'piece.damage', 'check', 'hp'])
		// The rider that only said so (and read on the table's line as done) is gone.
		assert.ok(!w.some((m) => m.verb === 'rider' && /roll the weapon's damage/.test((m as { text: string }).text)))
	})
	test('a consumable: spent on use, landed or not; heals, harms or cures by its fields', () => {
		const c = mech('consumables')
		assert.deepEqual(c.filter((m) => m.verb === 'consume').map((m) => m.on).sort(), ['hit', 'use'])
		assert.ok(c.some((m) => m.verb === 'heal' && (m as { dice: string }).dice === 'piece.heals'))
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
		for (const p of E.presets ?? []) {
			const values = rulesetSettingValues(E, { preset: p.id })
			assert.deepEqual(values, { ...rulesetSettingValues(E), ...p.values })
			assert.equal(rulesetPresetOf(E, values), p.id)
		}
		assert.equal(rulesetPresetOf(E, { degrees: 'classic' }), undefined, 'a mix is no preset')
	})

	test('casting: slots or spell points (ours); Classic plays slots', () => {
		assert.deepEqual(E.settings!.casting!.choices.map((c) => c.id), ['slots', 'points'])
		assert.equal(E.settings!.casting!.default, 'slots')
		assert.equal(rulesetSettingValues(E, { preset: 'classic' }).casting, 'slots')
		assert.equal(rulesetSettingValues(E, { values: { casting: 'points' } }).casting, 'points')
		assert.ok(E.stats.some((s) => s.id === 'core:slot/itineris-spell-points@1'))
	})

	test('Classic restores the printed rules in the conventions', () => {
		const classic = rulesetConventionsFor(E, rulesetSettingValues(E, { preset: 'classic' }))
		assert.equal(classic.actions!.perTurn, 1)
		assert.deepEqual(classic.bonuses, { types: ['edge'], stacking: 'sum', edge: 'edge' })
		assert.equal(classic.degrees.naturalShift, undefined)
		assert.deepEqual(classic.degrees.natural?.high, { from: 20, band: 'critical' })
		assert.ok(!classic.degrees.bands.some((b) => b.five === 'partial'))
		const own = rulesetConventionsFor(E)
		assert.equal(own.actions!.perTurn, 3)
		assert.deepEqual(own.degrees.naturalShift, { high: 20, low: 1 })
		assert.deepEqual(own.degrees.bands.map((b) => b.from), [undefined, -9, 0, 10])
		assert.deepEqual(own.time, classic.time, 'settings never move time')
	})

	test('unknown settings and choices read as the layer beneath', () => {
		assert.equal(rulesetSettingValues(E, { values: { degrees: 'sevenfold', nope: 'x' } as never }).degrees, 'fourfold')
		assert.equal(rulesetSettingValues(E, { preset: 'classic', values: { focus: 'sustain' } }).focus, 'sustain')
	})

	test('setting findings are named', () => {
		const props = E as unknown as RulesetProps
		const f = (over: Partial<RulesetProps>) => reasons(rulesetFindings('acme.e:ruleset/e@1', { ...props, ...over }))
		assert.ok(f({ presets: [{ id: 'x', label: { en: 'X' }, values: { degrees: 'nope' } }] }).includes('bad-preset'))
		assert.ok(f({ settings: { ...E.settings, focus: { label: { en: 'F' }, default: 'a', choices: [{ id: 'a', label: { en: 'A' } }] } } }).includes('bad-setting'))
		assert.ok(
			f({ settings: { ...E.settings, again: { label: { en: 'Again' }, default: 'a', choices: [{ id: 'a', label: { en: 'A' }, conventions: { actions: { perTurn: 2 } } }, { id: 'b', label: { en: 'B' } }] } } }).includes('setting-overlap'),
		)
		assert.ok(f({ conventions: { ...E.conventions, bonuses: { types: ['item'], stacking: 'sum', edge: 'edge' } } }).includes('bad-bonuses'))
	})
})

describe('Vis Itineris — the compendium slice', () => {
	const rows = E.compendium!.rows

	test('51 rows: 12 weapons, 6 armour, 8 gear, 4 consumables, 12 spells, 4 feats, 5 conditions', () => {
		const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]))
		assert.deepEqual(counts, { weapons: 12, armour: 6, gear: 8, consumables: 4, spells: 12, feats: 4, conditions: 5 })
		assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 51)
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
		const spell = (id: string) => E.compendium!.rows.spells.find((s) => s.id === id)!.piece
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
		const sels = E.selectors as Record<string, { kind: string; onSheet?: boolean; label?: { en: string } }>
		assert.deepEqual([sels['armour-class']!.onSheet, sels['armour-class']!.label?.en], [true, 'Armour class'])
		// 🚧 Not on the sheet (PLAN-dc-after-walk2 Q1-6): the pool's own row is bounded by it — one row, never two.
		assert.equal(sels['spell-points-max']!.onSheet, undefined)
	})

	test('bulk: capacity Strength × 15; burdened past half', () => {
		const out = runScript(cat.VIS_ITINERIS_BULK_SCRIPT, { strength: 10, items: [{ weight: 55 }, { weight: 2, count: 10 }] })
		assert.deepEqual([out.carried, out.capacity, out.load, out.speedPenalty], [75, 150, 'light', 0])
		assert.equal(runScript(cat.VIS_ITINERIS_BULK_SCRIPT, { strength: 8, items: [{ weight: 70 }] }).load, 'burdened')
		assert.equal(runScript(cat.VIS_ITINERIS_BULK_SCRIPT, { strength: 8, items: [{ weight: 130 }] }).load, 'over')
	})
})

describe('Vis Itineris — genre hooks', () => {
	test('Lair and Dungeon Crawler recommend Vis Itineris; Story recommends Freeform then Vis Itineris; rigour defaults per genre', () => {
		const g = (id: string) => getGenre(id)!
		assert.deepEqual(g('core:genre/lair').rulesets, { recommended: [E.id], default: E.id })
		assert.deepEqual(g('core:genre/dungeon-crawler').rulesets, { recommended: [E.id], default: E.id })
		// 🚧 2026-10-19: Story (the roleplay Chat and Adventure) plays in words by default.
		assert.deepEqual(g('core:genre/story').rulesets, { recommended: ['core:ruleset/freeform@1', E.id], default: 'core:ruleset/freeform@1' })
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
