/**
 * 🚧 The Dungeon Crawler reads what exists from its ruleset (Lair rewrite D9,
 * PROPOSAL-lair-rewrite R2, 2026-10-21): rolls and content follow the
 * ruleset, never the genre — the genre is the example of it. 🚧 Since
 * 2026-10-23 (lane G3, PLAN-genres-seams S4, ★H/★I) the **session's**
 * ruleset, read at run time through the inlet (`rulesetGistOf`), never the
 * build's Vis Itineris:
 *
 *  - a lint: no file of `core-catalog/src/genres/dungeon-crawler/` names a
 *    content literal its ruleset declares — a compendium row by id or name,
 *    a class's other names, a class feature — nor a number of a fall, a rest
 *    or a level (the genre's numbers: `HP_PER_LEVEL` retired), nor reads Vis
 *    Itineris's fall, rest, die or kits at build;
 *  - the kits are the ruleset's class rows (its entry type tagged `class`),
 *    and a class's kit can name only rows the library holds;
 *  - death's door, death saves and a rest are the session's ruleset's — Vis
 *    Itineris's reference to core's fall rule; none under a ruleset without;
 *  - the interview's and genesis's drafts read the declarations they draft
 *    (`jsonSchemaOf`) where they once spelled them;
 *  - the dice ruleset the Lair recommends (Vis Itineris, the crawl's own)
 *    declares difficulty bands and provides the verbs the crawl uses.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { checkPiece, defaultDifficultyBand, getRepertoire, getRuleset, jsonSchemaOf, rulesetDifficultyBands, rulesetProvides, rulesetSections, type CompendiumRow } from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'
import { atZeroHealthFunction } from '../core-catalog/src/functions/atZeroHealth.js'

const DC_DIR = path.join(import.meta.dirname, '../core-catalog/src/genres/dungeon-crawler')
const RULESET = cat.visItinerisRuleset
const ROWS = RULESET.compendium!.rows as Readonly<Record<string, readonly CompendiumRow[]>>
const CLASSES = ROWS[cat.visItinerisClasses.id] ?? []
/** Vis Itineris as a session reads it at run time (S4): its gist, under its defaults. */
const GIST = cat.rulesetGistOf(RULESET)
const KITS = GIST.kits!

/** Every DC source file, by name. */
const sources = (): Array<[string, string]> =>
	readdirSync(DC_DIR)
		.filter((f) => f.endsWith('.ts'))
		.map((f) => [f, readFileSync(path.join(DC_DIR, f), 'utf8')])

/**
 * The content literals the ruleset declares: every compendium row's id and
 * name, each class's other names and its features' names — in lower case.
 */
function declaredTerms(): Map<string, string> {
	const terms = new Map<string, string>()
	for (const [rep, rows] of Object.entries(ROWS))
		for (const r of rows) {
			terms.set(r.id.toLowerCase(), `${rep} row id`)
			terms.set(String(r.piece.name).toLowerCase(), `${rep} row name`)
		}
	for (const r of CLASSES) {
		for (const w of (r.piece.alsoCalled as readonly string[] | undefined) ?? []) terms.set(w.toLowerCase(), `${r.id} is also called`)
		for (const f of (r.piece.features as ReadonlyArray<{ name: string }> | undefined) ?? []) terms.set(f.name.toLowerCase(), `${r.id}'s feature`)
	}
	return terms
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('the Dungeon Crawler names nothing its ruleset declares (lint)', () => {
	test('no compendium row, class name or class feature is spelled in genres/dungeon-crawler/*', () => {
		const terms = declaredTerms()
		assert.ok(terms.size > 60, `the ruleset declares its content (${terms.size} terms)`)
		const hits: string[] = []
		for (const [file, text] of sources()) {
			const lines = text.split('\n')
			for (const [term, what] of terms) {
				// A word on its own: not inside a longer word or a dashed id, and
				// not a code member (`.oracle(` is the builder's method, not a class).
				const re = new RegExp(`(?<![a-z0-9.\\-])${escape(term)}(?![a-z0-9\\-])`, 'i')
				lines.forEach((line, i) => {
					if (re.test(line)) hits.push(`${file}:${i + 1} names '${term}' (${what})`)
				})
			}
		}
		assert.deepEqual(hits, [], 'read it from the ruleset instead')
	})

	test('no number of a fall, a rest or a level is spelled: death\'s door, death saves, the rest length and a level\'s gain are read', () => {
		const hits: string[] = []
		for (const [file, text] of sources()) {
			if (/\b(gentle|fair|brutal)\s*:\s*-?(\d{2,}|[2-9])\b/.test(text)) hits.push(`${file}: a door by difficulty`)
			if (/(DEATH_SAVE_DC|REST_MINUTES|SURVIVES_ON)\s*=\s*\d/.test(text)) hits.push(`${file}: a numeric constant`)
			if (/(three|3) (passes|failures)/.test(text)) hits.push(`${file}: the death saves' tallies in words`)
			if (/eight hours|\b480\b/.test(text)) hits.push(`${file}: the rest's length`)
			// 🚧 The genre's numbers (lane G3, 2026-10-23, D9): what a level brings is the rules'.
			if (/HP_PER_LEVEL\s*=|PER_LEVEL\s*=\s*\d/.test(text)) hits.push(`${file}: a level's gain`)
			if (/\bd20\b|sides:\s*20\b/.test(text)) hits.push(`${file}: a die assumed`)
			if (/5 easy to 25|25 nearly impossible/.test(text)) hits.push(`${file}: the difficulties spelled`)
			if (/attack\.(melee|ranged)/.test(text)) hits.push(`${file}: a check named by the ruleset's key`)
		}
		assert.deepEqual(hits, [])
	})

	test("🚧 S4: the fall, the rest, the die, the kits, the conditions and the grammar are never read from Vis Itineris at build", () => {
		// What may still read it at build, and why (⏳, each named): the sheet's
		// ruleset fields (the genre's sheet declarations — Sprint B's B5 retires
		// them), and the armour-class line and the spell-point pool rule (Vis
		// Itineris's own ES5, said at a table that plays it).
		const ALLOWED: Record<string, RegExp> = {
			'sheet.ts': /./,
			'preamble.ts': /VIS_ITINERIS_ARMOUR_CLASS_JS|VIS_ITINERIS_SPELL_POINTS_JS|VIS_ITINERIS_COMPENDIUM|VIS_ITINERIS_RULESET_ID/,
		}
		const hits: string[] = []
		for (const [file, text] of sources())
			for (const [i, line] of text.split('\n').entries()) {
				if (!/rulesets\/vis-itineris|VIS_ITINERIS_|visItineris[A-Z]/.test(line) || /^\s*(\*|\/\/)/.test(line)) continue
				if (ALLOWED[file]?.test(line.trim()) || ALLOWED[file]?.test(line)) continue
				hits.push(`${file}:${i + 1}: ${line.trim()}`)
			}
		assert.deepEqual(hits, [], 'read it from the session\'s ruleset (rulesetGistOf) instead')
	})
})

describe("the kits are the session's ruleset's classes (S4)", () => {
	test('one kit per class row, in its order; the first is the fallback', () => {
		assert.deepEqual(KITS.order, CLASSES.map((r) => r.id))
		assert.equal(cat.kitKeyFor(KITS, 'Somebody of no known calling'), CLASSES[0]!.id)
		assert.deepEqual(KITS.order.map((k) => KITS.byId[k]!.label), CLASSES.map((r) => r.piece.name))
		assert.equal(cat.classListOf(KITS), `${CLASSES.slice(0, -1).map((r) => r.piece.name).join(', ')} or ${CLASSES.at(-1)!.piece.name}`)
		// Found by its tag, never by Vis Itineris's id for it.
		assert.ok((rulesetSections(RULESET).entryTypes ?? []).find((e) => e.id === cat.visItinerisClasses.id)!.tags!.includes('class'))
	})

	test("a kit is its row, read: hit die, scores, skills, starting kit, slots, features, other names", () => {
		for (const r of CLASSES) {
			const kit = KITS.byId[r.id]!
			const p = r.piece as Record<string, any>
			assert.equal(kit.label, p.name)
			assert.equal(`d${kit.hitDie}`, p.hitDie)
			// Each score on the ruleset's attribute named for it.
			assert.deepEqual(Object.fromEntries(kit.abilities.map((a) => [a.slot.replace(/^core:slot\/itineris-/, '').replace(/@1$/, ''), a.value])), p.abilities)
			assert.deepEqual(kit.skills, (p.skills ?? []).length ? [{ slot: cat.visItinerisSkillTrainingSlot.id, value: p.skills }] : [])
			for (const rep of cat.VIS_ITINERIS_KIT_REPERTOIRES)
				assert.deepEqual(kit.pieces.filter((x) => x.entryType === rep).map((x) => x.id), p.startingKit?.[rep] ?? [], `${r.id}.${rep}`)
			assert.deepEqual(kit.spellSlots ?? [], p.spellSlots ?? [])
			assert.deepEqual(kit.features, p.features ?? [])
			// Full health: the die's most and the Constitution modifier; a later level, half the die and one.
			const con = Math.floor((p.abilities.constitution - 10) / 2)
			assert.equal(kit.maxHp, Math.max(1, kit.hitDie + con))
			assert.equal(kit.levelHp, Math.max(1, Math.floor(kit.hitDie / 2) + 1 + con))
			for (const w of p.alsoCalled ?? []) assert.ok(kit.words.includes(w), `${r.id} answers to ${w}`)
			// The class's other names pick its kit.
			for (const w of p.alsoCalled ?? []) assert.equal(cat.kitKeyFor(KITS, `The ${w}`), CLASSES.find((c) => [String(c.piece.name).toLowerCase(), ...((c.piece.alsoCalled as string[]) ?? [])].includes(w))!.id)
		}
		// The features and spell slots are kept in the entry types tagged for them.
		assert.equal(KITS.featureType, cat.visItinerisFeatures.id)
		assert.equal(KITS.slotType, cat.visItinerisSpellSlots.id)
	})

	test('a starting kit names only rows the compendium holds — refused at the declaration', () => {
		const rep = getRepertoire(`${RULESET.id}#${cat.visItinerisClasses.id}`)!
		const fighter = CLASSES[0]!.piece
		assert.equal(checkPiece(rep, { kind: 'inline', ...fighter } as never), null)
		const bad = { ...fighter, startingKit: { weapons: ['a-sword-nobody-wrote'] } }
		assert.match(String(checkPiece(rep, { kind: 'inline', ...bad } as never)), /a-sword-nobody-wrote|weapons/)
	})

	test('classes are a character option, not lore: never a derived entry type', () => {
		assert.ok(!cat.visItinerisClasses.entryable)
		assert.ok(!(RULESET.entryable ?? []).includes(cat.visItinerisClasses.id))
	})

	test('a ruleset with no class entry type has no kits: Wherewithal, Freeform', () => {
		for (const id of ['core:ruleset/wherewithal@1', 'core:ruleset/freeform@1']) assert.equal(cat.rulesetGistOf(getRuleset(id)!).kits, null, id)
	})
})

describe("a fall and a rest are the session's ruleset's numbers (S4, ★I)", () => {
	const Z = cat.VIS_ITINERIS_AT_ZERO_HEALTH_RULE
	test("Vis Itineris references core's fall rule with its own numbers, bound to health", () => {
		const ref = (rulesetSections(RULESET).functions ?? []).find((f) => f.ref === atZeroHealthFunction.id)!
		assert.ok(ref, 'Vis Itineris references core:function/at-zero-health@1')
		assert.deepEqual(ref.bindings, { health: 'hp' })
		assert.deepEqual(ref.options, { ...Z })
		// Its die is its way's; its saves play under its option `dying: death-saves`.
		assert.equal(Z.sides, cat.VIS_ITINERIS_DIE_METHOD.sides)
		assert.deepEqual(Z.savesWhen, { option: 'dying', is: 'death-saves' })
	})
	test('the gist carries the reference, and whether its saves play under the session\'s options', () => {
		assert.equal(cat.rulesetGistOf(RULESET, { dying: 'dying-1-4' }).atZeroHealth!.playsSaves, false)
		assert.equal(cat.rulesetGistOf(RULESET, { dying: 'death-saves' }).atZeroHealth!.playsSaves, true)
		const { playsSaves: _p, ...options } = GIST.atZeroHealth!
		assert.deepEqual(options, { ...Z })
	})
	test("death's door and death saves: the rule is core's, the numbers the reference's — never the door script's", () => {
		const src = cat.DUNGEON_CRAWLER_DOOR_SCRIPT.source
		assert.match(src, /function atZeroHealthOf\(o, face, tally, saves, steps\)/)
		assert.match(src, /var FALL = b\.fall/)
		assert.doesNotMatch(src, /var SAVES = \{|var DOOR = \{|"target":10/)
		// The genre's own dial: steps, never numbers.
		assert.deepEqual(cat.DUNGEON_CRAWLER_DIFFICULTY_STEPS, { gentle: -1, fair: 0, brutal: 1 })
	})
	test("a ruleset without a fall rule assumes no die: Wherewithal and Freeform", () => {
		for (const id of ['core:ruleset/wherewithal@1', 'core:ruleset/freeform@1']) assert.equal(cat.rulesetGistOf(getRuleset(id)!).atZeroHealth, null, id)
	})
	test("a rest is the session's ruleset's: its rests, longest first; the rest script reads them at run time", () => {
		const long = cat.VIS_ITINERIS_CONVENTIONS.rest!.find((r) => r.id === 'long')!
		assert.deepEqual(GIST.rests[0], { id: 'long', label: 'Long rest', minutes: long.minutes })
		assert.match(cat.DUNGEON_CRAWLER_REST_SCRIPT.source, /taken = nightRest\(v\.ruleset\)/)
		assert.doesNotMatch(cat.DUNGEON_CRAWLER_REST_SCRIPT.source, /addMinutes\(was, \d+\)/)
		// Vis Itineris offers its long rest as the rules' Rest (S3).
		const rest = (rulesetSections(RULESET).functions ?? []).find((f) => f.ref === cat.restFunction.id)!
		assert.deepEqual(rest.options, { rest: 'long' })
		assert.ok(cat.rulesetOffersRest(RULESET))
		assert.ok(!cat.rulesetOffersRest(getRuleset('core:ruleset/freeform@1')))
	})
	test('counted play iff the rules decide: Vis Itineris and Wherewithal count, Freeform keeps words', () => {
		assert.equal(GIST.decides, true)
		assert.equal(cat.rulesetGistOf(getRuleset('core:ruleset/wherewithal@1')!).decides, true)
		assert.equal(cat.rulesetGistOf(getRuleset('core:ruleset/freeform@1')!).decides, false)
		// A check is asked by the rules' own keys: Vis Itineris's checks, Wherewithal's ways.
		assert.ok(GIST.decidingKeys.includes('attack.melee') && GIST.decidingKeys.includes('skill.athletics'))
		assert.deepEqual([...cat.rulesetGistOf(getRuleset('core:ruleset/wherewithal@1')!).decidingKeys].sort(), ['contest', 'dare', 'make-do', 'sway'])
	})
	test('level gain: where the rules reference experience levels (Vis Itineris forks it); none elsewhere', () => {
		assert.equal(GIST.levels, true)
		assert.equal(cat.rulesetGistOf(getRuleset('core:ruleset/wherewithal@1')!).levels, false)
		assert.equal((cat as Record<string, unknown>).DUNGEON_CRAWLER_HP_PER_LEVEL, undefined)
	})
})

describe('the drafts read the declarations they draft (jsonSchemaOf)', () => {
	test("the sheet's class, difficulty and goal are their slots' own schemas, '' for not asked", () => {
		const p = cat.DUNGEON_CRAWLER_SHEET_SCHEMA.properties as Record<string, any>
		assert.deepEqual(p.difficulty.enum, ['', ...cat.difficultySlot.config!.of!])
		assert.equal(p.difficulty.description, cat.difficultySlot.descriptor)
		assert.deepEqual(p.goalMode.enum, ['', ...cat.goalModeSlot.config!.of!])
		assert.equal(p.class.description, cat.characterClassSlot.descriptor)
	})
	test("a way out's kinds, standings and trap condition are the session's rules' exit entry type's — at run time (S4)", () => {
		const piece = jsonSchemaOf(cat.visItinerisExits).properties as Record<string, any>
		// The gist carries the rules' way out: the entry type tagged `exit`, its fields as a model writes them.
		assert.equal(GIST.exits!.entryType, cat.visItinerisExits.id)
		assert.deepEqual(GIST.exits!.fields, piece)
		const shape = (ruleset: unknown, want = 'genesis') => new Function('value', cat.DUNGEON_CRAWLER_SHAPE_SCRIPT.source)({ shape: null, ruleset, want }) as any
		const exitOf = (ruleset: unknown) => shape(ruleset).properties.rooms.items.properties.exits.items
		const p = exitOf({ id: RULESET.id, ...GIST }).properties
		assert.deepEqual(p.way, piece.way)
		assert.deepEqual(p.state, piece.state)
		assert.ok(p.trapCondition.description.startsWith(piece.trap.properties.condition.description))
		// A table whose rules decide nothing drops the numbers, never the kinds.
		const words = exitOf({ id: RULESET.id, ...GIST, decides: false })
		assert.deepEqual(words.properties.way, piece.way)
		for (const k of ['lockDc', 'trapDc', 'trapDamage', 'trapCondition']) assert.equal(words.properties[k], undefined, k)
		// Rules with no way out of their own: free words, no numbers (Wherewithal decides, but keeps none).
		const ww = exitOf({ id: 'core:ruleset/wherewithal@1', ...cat.rulesetGistOf(getRuleset('core:ruleset/wherewithal@1')!) })
		assert.equal(ww.properties.way.enum, undefined)
		assert.equal(ww.properties.lockDc, undefined)
		// Genesis's world is laid the same way: its places, no changes.
		assert.equal(shape({ id: RULESET.id, ...GIST }).properties.deltas, undefined)
	})
	test("the class offer and Just play name the session's ruleset's classes, at run time", () => {
		assert.match(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT.source, /var CLASS_LINE = KIT_LABELS\.length \? "Each class is one of the ruleset's — " \+ classList\(\)/)
		assert.match(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT.source, /Offer three to five classes that fit this world, each a short name\. " \+ CLASS_LINE/)
		assert.doesNotMatch(cat.DUNGEON_CRAWLER_INTERVIEW_SCRIPT.source, new RegExp(escape(cat.classListOf(KITS))))
	})
})

describe('the dice ruleset the Lair recommends: Vis Itineris, the crawl\'s own', () => {
	test('it declares difficulty bands, one the default an automatic roll is made against', () => {
		// 🚧 On its `die` check method since 2026-10-22 (M3), never top-level.
		assert.equal(RULESET.difficultyBands, undefined)
		assert.ok(rulesetDifficultyBands(RULESET, 'die').length >= 2)
		assert.equal(defaultDifficultyBand(RULESET)?.id, 'medium')
	})
	test("it provides every verb the crawl uses and everything it plays best with; the crawl recommends it", () => {
		const g = cat.dungeonCrawlerGenre
		const provides = rulesetProvides(RULESET)
		for (const v of g.uses!.verbs as readonly string[]) assert.ok(provides.verbs.has(v), v)
		// 🚧 RF fix 8: what it plays best with is by tag — every one met by Vis Itineris.
		for (const e of g.uses!.entryTypes ?? []) assert.ok(provides.tags.has(e.tag), e.tag)
		for (const e of g.uses!.attributes ?? []) assert.ok(provides.attributeTags.has(e.tag), e.tag)
		assert.ok(g.rulesets && 'recommended' in g.rulesets)
		assert.deepEqual(g.rulesets.recommended, [RULESET.id])
	})
})
