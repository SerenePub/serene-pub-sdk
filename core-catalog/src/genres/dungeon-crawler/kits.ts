/**
 * 🚧 Dungeon Crawler's **starting kits** (rulesets W3-B, 2026-10-16): what a
 * new character carries, by class — pieces of Vis Itineris's compendium by id
 * (a weapon, armour, gear, a potion, spells), plus the class's features
 * written out (Vis Itineris's slice has no feature rows). The sheet step picks the
 * kit by the class's name (`kitKeyFor`) and writes each repertoire's pieces
 * to the genre's ruleset fields (`sheet.ts`) — never a line of text.
 *
 * Six kits; a class no kit names takes the fighter's. Every compendium id
 * here is a row of the slice (`rulesets/vis-itineris/compendium/*.json`), which a
 * test holds.
 */

import { VIS_ITINERIS_COMPENDIUM_VERSION } from '../../rulesets/vis-itineris/compendium/index.js'
import { spellPointsFor } from '../../rulesets/vis-itineris/rules.js'
import { DUNGEON_CRAWLER_REPERTOIRE_SLOTS, rowName } from './sheet.js'
import { VIS_ITINERIS_COMPENDIUM } from '../../rulesets/vis-itineris/compendium/index.js'

/** One of Vis Itineris's six abilities. @internal */
type VisItinerisAbility = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

const scores = (strength: number, dexterity: number, constitution: number, intelligence: number, wisdom: number, charisma: number) =>
	Object.freeze({ strength, dexterity, constitution, intelligence, wisdom, charisma })

/** The ruleset the kits' pieces come from. @internal */
export const DUNGEON_CRAWLER_KIT_RULESET = 'core:ruleset/vis-itineris@1'
/** The compendium version the kits name. @internal */
export const DUNGEON_CRAWLER_KIT_VERSION = VIS_ITINERIS_COMPENDIUM_VERSION

/** One kit: compendium row ids by repertoire, and the features written out. @experimental */
export interface DungeonCrawlerKit {
	label: string
	/** Words in a class's name that pick this kit. */
	words: readonly string[]
	/**
	 * 🚧 The class's hit die (2026-10-17): full health at level 1 is its
	 * maximum plus the Constitution modifier (Vis Itineris's level-1 rule).
	 */
	hitDie: number
	/**
	 * 🚧 The six ability scores (2026-10-17): the standard array (15, 14,
	 * 13, 12, 10, 8) laid out for the class, its best score raised by one —
	 * the fighter's Strength 16. Written to Vis Itineris's ability fields
	 * (`core:slot/itineris-<ability>@1`), which the derive script reads.
	 */
	abilities: Readonly<Record<VisItinerisAbility, number>>
	/**
	 * 🚧 The skills the class is trained in (PLAN-dc-after-walk3, owner
	 * ruling ★4): Vis Itineris's skill keys, written to its trained-skills
	 * field (`core:slot/itineris-skill-training@1`), which the derive script
	 * reads — a trained skill's check adds proficiency (the rogue's Sleight of
	 * hand on a lock).
	 */
	skills: readonly string[]
	weapons: readonly string[]
	armour: readonly string[]
	gear: readonly string[]
	consumables: readonly string[]
	spells: readonly string[]
	/**
	 * 🚧 Spell slots at level 1 (PLAN-sheet-widget-redesign §8, 2026-10-17):
	 * the SRD's — a wizard, a cleric and a bard each start with two
	 * first-level slots. Written as Vis Itineris `spell-slots` pieces, one a
	 * level, `used` 0; the Planner's `spend` marks one used (`story.ts`'s
	 * turn script) and a long rest gives them back (`rest.ts`).
	 */
	spellSlots?: ReadonlyArray<{ level: number; max: number }>
	features: ReadonlyArray<{
		name: string
		description: string
		actions: 'action' | 'bonus-action' | 'reaction' | 'free' | 'passive'
		usesMax?: number
		recharge?: 'short' | 'long' | 'none'
	}>
}

/** 🚧 The six starting kits, by key. The first is the one a class no kit names takes. @experimental */
export const DUNGEON_CRAWLER_KITS: Readonly<Record<string, DungeonCrawlerKit>> = Object.freeze({
	fighter: {
		label: 'Fighter',
		words: ['fighter', 'warrior', 'knight', 'soldier', 'barbarian', 'paladin', 'guard', 'sellsword', 'mercenary', 'champion'],
		hitDie: 10,
		abilities: scores(16, 13, 14, 8, 12, 10),
		skills: ['athletics', 'perception'],
		weapons: ['longsword', 'handaxe'],
		armour: ['chain-mail', 'shield'],
		gear: ['backpack', 'rope', 'torch'],
		consumables: ['potion-of-healing'],
		spells: [],
		features: [
			{ name: 'Second wind', description: 'Catch your breath mid-fight and shake off some harm.', actions: 'bonus-action', usesMax: 1, recharge: 'short' },
		],
	},
	rogue: {
		label: 'Rogue',
		words: ['rogue', 'thief', 'scout', 'assassin', 'burglar', 'cutpurse', 'spy', 'smuggler'],
		hitDie: 8,
		abilities: scores(8, 16, 14, 13, 12, 10),
		skills: ['sleight-of-hand', 'stealth', 'acrobatics', 'perception'],
		weapons: ['rapier', 'dagger', 'shortbow'],
		armour: ['leather-armour'],
		gear: ['thieves-tools', 'crowbar', 'hooded-lantern'],
		consumables: ['potion-of-healing'],
		spells: [],
		features: [
			{ name: 'Sneak attack', description: 'Strike harder at a foe who is distracted or caught off guard.', actions: 'passive' },
		],
	},
	wizard: {
		label: 'Wizard',
		words: ['wizard', 'mage', 'sorcerer', 'warlock', 'witch', 'magician', 'arcanist', 'enchanter', 'necromancer', 'conjurer'],
		hitDie: 6,
		abilities: scores(8, 13, 14, 16, 12, 10),
		skills: ['arcana', 'history'],
		weapons: ['quarterstaff', 'dagger'],
		armour: [],
		gear: ['backpack', 'tinderbox', 'torch'],
		consumables: [],
		spells: ['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'detect-magic'],
		spellSlots: [{ level: 1, max: 2 }],
		features: [
			{ name: 'Arcane recovery', description: 'Recover a little spent magic during a short rest, once a day.', actions: 'free', usesMax: 1, recharge: 'long' },
		],
	},
	cleric: {
		label: 'Cleric',
		words: ['cleric', 'priest', 'priestess', 'healer', 'druid', 'monk', 'templar', 'acolyte', 'oracle', 'shaman'],
		hitDie: 8,
		abilities: scores(13, 10, 14, 8, 16, 12),
		skills: ['religion', 'medicine'],
		weapons: ['mace'],
		armour: ['chain-shirt', 'shield'],
		gear: ['backpack', 'bedroll'],
		consumables: ['antitoxin'],
		spells: ['sacred-flame', 'light', 'cure-wounds', 'detect-magic'],
		spellSlots: [{ level: 1, max: 2 }],
		features: [
			{ name: 'Turn the dead', description: 'Present your holy symbol and make the restless dead flee.', actions: 'action', usesMax: 1, recharge: 'short' },
		],
	},
	ranger: {
		label: 'Ranger',
		words: ['ranger', 'hunter', 'archer', 'tracker', 'woodsman', 'woodswoman', 'trapper', 'warden', 'outrider'],
		hitDie: 10,
		abilities: scores(12, 16, 14, 10, 13, 8),
		skills: ['survival', 'perception', 'stealth'],
		weapons: ['longbow', 'spear'],
		armour: ['studded-leather'],
		gear: ['rope', 'bedroll', 'tinderbox'],
		consumables: ['rations'],
		spells: [],
		features: [
			{ name: 'Wilderness wise', description: 'Never lost in the wild; find food, water and the trail.', actions: 'passive' },
		],
	},
	bard: {
		label: 'Bard',
		words: ['bard', 'minstrel', 'skald', 'singer', 'poet', 'performer', 'troubadour', 'storyteller', 'jester'],
		hitDie: 8,
		abilities: scores(8, 14, 13, 10, 12, 16),
		skills: ['performance', 'persuasion', 'deception'],
		weapons: ['rapier', 'light-crossbow'],
		armour: ['leather-armour'],
		gear: ['backpack', 'torch'],
		consumables: ['alchemists-fire'],
		spells: ['light', 'mage-hand', 'cure-wounds'],
		spellSlots: [{ level: 1, max: 2 }],
		features: [
			{ name: 'Inspiration', description: 'A word or a song that lends an ally your nerve.', actions: 'bonus-action', usesMax: 3, recharge: 'long' },
		],
	},
})

/**
 * 🚧 A kit as the changes a sheet step writes: one change per ruleset field
 * that holds something, its value the list of pieces (`{ kind: 'compendium',
 * compendiumId, pieceId, version }`, or a written-out feature). Owner-less:
 * the sheet step names the seat. Spelled in ES5 for the sheet script too
 * (`DUNGEON_CRAWLER_KIT_JS`).
 * @experimental
 */
export function kitChanges(key: string): Array<{ slot: string; value: unknown[] }> {
	const kit = DUNGEON_CRAWLER_KITS[key] ?? DUNGEON_CRAWLER_KITS.fighter!
	const out: Array<{ slot: string; value: unknown[] }> = []
	const ref = (pieceId: string) => ({
		kind: 'compendium',
		compendiumId: DUNGEON_CRAWLER_KIT_RULESET,
		pieceId,
		version: DUNGEON_CRAWLER_KIT_VERSION,
	})
	for (const rep of ['weapons', 'armour', 'gear', 'consumables', 'spells'] as const)
		if (kit[rep].length) out.push({ slot: DUNGEON_CRAWLER_REPERTOIRE_SLOTS[rep], value: kit[rep].map(ref) })
	if (kit.features.length)
		out.push({
			slot: DUNGEON_CRAWLER_REPERTOIRE_SLOTS.features,
			value: kit.features.map((f) => ({ kind: 'inline', source: 'class', ...f })),
		})
	return out
}

/**
 * 🚧 A kit as the deltas the ruleset handler applies (`core:task/ruleset-resolve@1`,
 * mode `apply`): one `add` per piece, on `owner` — a compendium piece by its
 * row id, a feature written out. The handler resolves the row, checks the
 * piece against its repertoire and writes it to the owner's field for that
 * repertoire (`sheet.ts`); a list of words is never written. Spelled in ES5
 * for the sheet script too (`kitDeltas` in `DUNGEON_CRAWLER_KIT_JS`).
 * @experimental
 */
export function kitDeltas(key: string, owner: string): Array<Record<string, unknown>> {
	const kit = DUNGEON_CRAWLER_KITS[key] ?? DUNGEON_CRAWLER_KITS.fighter!
	const out: Array<Record<string, unknown>> = []
	for (const rep of ['weapons', 'armour', 'gear', 'consumables', 'spells'] as const)
		for (const id of kit[rep]) out.push({ owner, repertoire: rep, op: 'add', piece: id, reason: `${kit.label}'s kit` })
	for (const f of kit.features)
		out.push({ owner, repertoire: 'features', op: 'add', piece: { kind: 'inline', source: 'class', ...f }, reason: `${kit.label}'s kit` })
	for (const slots of kit.spellSlots ?? [])
		out.push({ owner, repertoire: 'spell-slots', op: 'add', piece: spellSlotPiece(slots.level, slots.max, 0), reason: `${kit.label}'s kit` })
	return out
}

/**
 * 🚧 One level's spell slots as a written-out Vis Itineris `spell-slots`
 * piece, named by its level ("Level 1") — what the Planner's `spend` names
 * by the level alone ("1"). @experimental
 */
export function spellSlotPiece(level: number, max: number, used: number): Record<string, unknown> {
	return { kind: 'inline', name: `Level ${level}`, description: `Spell slots of level ${level}.`, level, max, used, recharge: 'long' }
}

/**
 * 🚧 A kit's ability scores as the changes a sheet step writes (2026-10-17):
 * one per ability, on Vis Itineris's own fields, naming no owner (the sheet
 * step names the seat). Spelled in ES5 for the sheet script too
 * (`kitAbilityChanges` in `DUNGEON_CRAWLER_KIT_JS`).
 * @experimental
 */
export function kitAbilityChanges(key: string): Array<{ slot: string; value: number }> {
	const kit = DUNGEON_CRAWLER_KITS[key] ?? DUNGEON_CRAWLER_KITS.fighter!
	return Object.entries(kit.abilities).map(([ability, score]) => ({ slot: `core:slot/itineris-${ability}@1`, value: score }))
}

/** 🚧 Vis Itineris's trained-skills field (★4). @internal */
export const DUNGEON_CRAWLER_SKILL_TRAINING_SLOT = 'core:slot/itineris-skill-training@1'

/**
 * 🚧 A kit's trained skills as the change a sheet step writes (owner ruling
 * ★4): one, on Vis Itineris's trained-skills field, naming no owner. Spelled
 * in ES5 for the sheet script too (`kitSkillChanges` in
 * `DUNGEON_CRAWLER_KIT_JS`). @experimental
 */
export function kitSkillChanges(key: string): Array<{ slot: string; value: string[] }> {
	const kit = DUNGEON_CRAWLER_KITS[key] ?? DUNGEON_CRAWLER_KITS.fighter!
	return kit.skills.length ? [{ slot: DUNGEON_CRAWLER_SKILL_TRAINING_SLOT, value: [...kit.skills] }] : []
}

/**
 * 🚧 A kit's full health at level 1 (2026-10-17): its hit die's maximum plus
 * the Constitution modifier, at least 1 — Vis Itineris's level-1 rule (the
 * level-up script's `level === 1` branch). @experimental
 */
export function kitMaxHp(key: string): number {
	const kit = DUNGEON_CRAWLER_KITS[key] ?? DUNGEON_CRAWLER_KITS.fighter!
	return Math.max(1, kit.hitDie + Math.floor((kit.abilities.constitution - 10) / 2))
}

/**
 * 🚧 A kit's spell-point pool at level 1, at a table playing spell points
 * (2026-10-18, P2-4): Vis Itineris's one pool rule (`spellPointsFor`, the
 * derive script's `spell-points-max`) for the kit's class — 4 for the
 * wizard, the cleric and the bard, none for a class that casts nothing.
 * @experimental
 */
export function kitSpellPoints(key: string): number {
	const kit = DUNGEON_CRAWLER_KITS[key] ?? DUNGEON_CRAWLER_KITS.fighter!
	return kit.spellSlots?.length ? spellPointsFor(kit.label, 1) : 0
}

/** The pool a spell-points table spends (`core:slot/itineris-spell-points@1`). @internal */
export const DUNGEON_CRAWLER_SPELL_POINTS_SLOT = 'core:slot/itineris-spell-points@1'

/**
 * The kit a class's name picks: the first kit one of whose words is a word
 * of the name, else the fighter's. @experimental
 */
export function kitKeyFor(className: string): string {
	const words = String(className || '')
		.toLowerCase()
		.split(/[^a-z]+/)
		.filter(Boolean)
	for (const [key, kit] of Object.entries(DUNGEON_CRAWLER_KITS)) if (kit.words.some((w) => words.includes(w))) return key
	return 'fighter'
}

/**
 * The compendium rows' own names for every piece a kit names, by
 * `<repertoire>:<id>` — the summary line's labels (AUDIT E: "Thieves tools").
 * @internal
 */
const KIT_PIECE_NAMES: Record<string, string> = Object.fromEntries(
	Object.entries(VIS_ITINERIS_COMPENDIUM.rows).flatMap(([rep, rows]) =>
		(rows as ReadonlyArray<{ id: string }>).map((r) => [`${rep}:${r.id}`, rowName(r)]),
	),
)

/**
 * The same functions in ES5, for the sheet script: `kitKeyFor(name)`,
 * `kitDeltas(key, owner)` (the kit is its deltas — AUDIT C7: no second copy
 * as changes), `kitAbilityChanges(key)`, 🚧 `kitSkillChanges(key)`, `kitMaxHp(key)`, 🚧
 * `kitSpellPoints(key)` and `pieceLabel(repertoire, piece)`, over the kits
 * as data. @internal
 */
export const DUNGEON_CRAWLER_KIT_JS = `
var KIT_WORDS = ${JSON.stringify(Object.fromEntries(Object.entries(DUNGEON_CRAWLER_KITS).map(([k, v]) => [k, v.words])))};
// 🚧 Each kit's class, by its label: what the table picks when Just play's
// sheet came back with no class (the 100-turn walk, B20).
var KIT_LABELS = ${JSON.stringify(Object.values(DUNGEON_CRAWLER_KITS).map((v) => v.label))};
function kitKeyFor(name) {
	var words = String(name || "").toLowerCase().split(/[^a-z]+/);
	for (var key in KIT_WORDS) {
		var kw = KIT_WORDS[key];
		for (var i = 0; i < kw.length; i++) for (var j = 0; j < words.length; j++) if (words[j] && words[j] === kw[i]) return key;
	}
	return "fighter";
}
var KIT_ABILITIES = ${JSON.stringify(Object.fromEntries(Object.keys(DUNGEON_CRAWLER_KITS).map((k) => [k, kitAbilityChanges(k)])))};
var KIT_MAX_HP = ${JSON.stringify(Object.fromEntries(Object.keys(DUNGEON_CRAWLER_KITS).map((k) => [k, kitMaxHp(k)])))};
// 🚧 Each kit's spell-point pool at level 1 (P2-4), and the slot it fills.
var KIT_SPELL_POINTS = ${JSON.stringify(Object.fromEntries(Object.keys(DUNGEON_CRAWLER_KITS).map((k) => [k, kitSpellPoints(k)])))};
var SPELL_POINTS_SLOT = ${JSON.stringify(DUNGEON_CRAWLER_SPELL_POINTS_SLOT)};
function kitSpellPoints(key) { return KIT_SPELL_POINTS[key] !== undefined ? KIT_SPELL_POINTS[key] : 0; }
function kitAbilityChanges(key) { return JSON.parse(JSON.stringify(KIT_ABILITIES[key] || KIT_ABILITIES.fighter)); }
// 🚧 Each kit's trained skills (★4): one change on the trained-skills field.
var KIT_SKILLS = ${JSON.stringify(Object.fromEntries(Object.keys(DUNGEON_CRAWLER_KITS).map((k) => [k, kitSkillChanges(k)])))};
function kitSkillChanges(key) { return JSON.parse(JSON.stringify(KIT_SKILLS[key] || KIT_SKILLS.fighter)); }
function kitMaxHp(key) { return KIT_MAX_HP[key] || KIT_MAX_HP.fighter; }
var KIT_DELTAS = ${JSON.stringify(Object.fromEntries(Object.keys(DUNGEON_CRAWLER_KITS).map((k) => [k, kitDeltas(k, '<owner>')])))};
function kitDeltas(key, owner) {
	var list0 = JSON.parse(JSON.stringify(KIT_DELTAS[key] || KIT_DELTAS.fighter));
	for (var i = 0; i < list0.length; i++) list0[i].owner = owner;
	return list0;
}
// A piece's name, for the summary line: the compendium row's own \`name\`
// ("Thieves' tools", never the id spelled out), or the written-out piece's.
var PIECE_NAMES = ${JSON.stringify(KIT_PIECE_NAMES)};
function pieceLabel(rep, p) {
	if (p && typeof p === "object") return String(p.name || "");
	return PIECE_NAMES[rep + ":" + p] || String(p || "");
}
`
