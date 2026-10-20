/**
 * 🚧 Vis Itineris's seeded scripts (`core:script:data/transform@1`), run by the
 * ruleset handler at the phases `core:ruleset/vis-itineris@1` declares. Each takes
 * one `value` and returns one document; pure and seeded, plain ES5 so any
 * sandbox (QuickJS in the app) runs them.
 *
 * The handler owns dice, degrees and bonus stacking; these compute what the
 * conventions cannot say: derived values, a spell cast in a higher slot, a
 * level gained by class table, and carried load.
 */
import { DATA_TRANSFORM_KIND, type CoreScriptSeed } from "../genres/dungeon-crawler/scripts.js"
import { VIS_ITINERIS_ARMOUR_CLASS_JS, VIS_ITINERIS_SPELL_POINTS_JS } from "../rulesets/vis-itineris/rules.js"

const seed = (seedKey: string, name: string, source: string): CoreScriptSeed =>
	Object.freeze({
		typeId: DATA_TRANSFORM_KIND,
		seedKey,
		name,
		source: source.trim(),
		varsIn: Object.freeze(["value"]),
		varsOut: Object.freeze(["value"])
	})

/**
 * Derived values. In: `{ abilities: { strength…charisma }, level, armour:
 * [{ category, acBase, dexCap? }] (equipped), saves: [ability], trained:
 * [skill], expert: [skill], casting?: ability }`. Out: `{ mods, proficiency,
 * castingMod, armourClass, saves, skills, passivePerception, spellDc,
 * explain }` — the casting modifier is the named ability's, else the best of
 * Intelligence, Wisdom and Charisma (2026-10-17: a spell attack rolls with it).
 *
 * 🚧 Run by the ruleset handler (W3-A, 2026-10-16) it is handed the
 * handler's envelope instead — `{ phase, values: { selector: value }, pieces:
 * { repertoire: [props] } }` — and answers in the handler's terms: `{ values:
 * { 'strength-mod', …, proficiency, 'casting-mod', 'armour-class',
 * 'passive-perception', 'spell-dc' }, modifies: [{ target, value, label }]
 * (proficiency on every attack, trained saves and skills), explain }`.
 * 🚧 At a table playing spell points (`settings.casting: 'points'`, P2-4)
 * its values carry `spell-points-max` too — by the character's class and
 * level — which a long rest refills the pool to.
 * @experimental
 */
export const VIS_ITINERIS_DERIVE_SCRIPT = seed(
	"core:script/vis-itineris-derive",
	"Vis Itineris: derived values",
	`
${VIS_ITINERIS_ARMOUR_CLASS_JS}
${VIS_ITINERIS_SPELL_POINTS_JS}
var v = value || {};
var envelope = !!(v.values && typeof v.values === "object");
var playsPoints = envelope && v.settings && v.settings.casting === "points";
var className = envelope ? v.values["character-class"] : v["class"];
if (envelope) {
	var sv = v.values, held = v.pieces || {};
	v = {
		abilities: { strength: sv["itineris-strength"], dexterity: sv["itineris-dexterity"], constitution: sv["itineris-constitution"], intelligence: sv["itineris-intelligence"], wisdom: sv["itineris-wisdom"], charisma: sv["itineris-charisma"] },
		level: sv.level,
		armour: held.armour || [],
		saves: sv["itineris-save-training"],
		trained: sv["itineris-skill-training"],
		expert: sv["itineris-skill-expertise"],
		casting: sv["itineris-casting"]
	};
}
var ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
var SKILLS = { "acrobatics": "dexterity", "animal-handling": "wisdom", "arcana": "intelligence", "athletics": "strength", "deception": "charisma", "history": "intelligence", "insight": "wisdom", "intimidation": "charisma", "investigation": "intelligence", "medicine": "wisdom", "nature": "intelligence", "perception": "wisdom", "performance": "charisma", "persuasion": "charisma", "religion": "intelligence", "sleight-of-hand": "dexterity", "stealth": "dexterity", "survival": "wisdom" };
function has(list, x) { if (!list) return false; for (var i = 0; i < list.length; i++) if (list[i] === x) return true; return false; }
var scores = v.abilities || {};
var mods = {};
for (var i = 0; i < ABILITIES.length; i++) {
	var s = typeof scores[ABILITIES[i]] === "number" ? scores[ABILITIES[i]] : 10;
	mods[ABILITIES[i]] = Math.floor((s - 10) / 2);
}
var level = typeof v.level === "number" && v.level >= 1 ? Math.floor(v.level) : 1;
var proficiency = 2 + Math.floor((level - 1) / 4);
var worn = armourClassOf(mods.dexterity, v.armour);
var body = worn.body, shield = worn.shield;
var armourClass = worn.ac;
var saves = {};
for (var j = 0; j < ABILITIES.length; j++) saves[ABILITIES[j]] = mods[ABILITIES[j]] + (has(v.saves, ABILITIES[j]) ? proficiency : 0);
var skills = {};
for (var k in SKILLS) {
	var rank = has(v.expert, k) ? 2 : has(v.trained, k) ? 1 : 0;
	skills[k] = mods[SKILLS[k]] + rank * proficiency;
}
var castingMod = v.casting && mods[v.casting] !== undefined ? mods[v.casting] : Math.max(mods.intelligence, mods.wisdom, mods.charisma);
var spellDc = 8 + proficiency + castingMod;
var explainText = "AC " + armourClass + " = " + (body ? body.name || "armour" : "10") + " + Dexterity" + (shield ? " + shield " + shield : "") + "; proficiency " + proficiency + " at level " + level;
if (envelope) {
	var values = { proficiency: proficiency, "casting-mod": castingMod, "armour-class": armourClass, "passive-perception": 10 + skills.perception, "spell-dc": spellDc };
	if (playsPoints) values["spell-points-max"] = spellPointsFor(className, level);
	for (var m = 0; m < ABILITIES.length; m++) values[ABILITIES[m] + "-mod"] = mods[ABILITIES[m]];
	var modifies = [
		{ target: "attack.melee", value: proficiency, label: "proficiency" },
		{ target: "attack.ranged", value: proficiency, label: "proficiency" },
		{ target: "attack.spell", value: proficiency, label: "proficiency" }
	];
	for (var t = 0; t < ABILITIES.length; t++)
		if (has(v.saves, ABILITIES[t])) modifies.push({ target: "save." + ABILITIES[t], value: proficiency, label: "proficiency" });
	for (var sk in SKILLS) {
		var r = has(v.expert, sk) ? 2 : has(v.trained, sk) ? 1 : 0;
		if (r) modifies.push({ target: "skill." + sk, value: r * proficiency, label: r === 2 ? "expertise" : "proficiency" });
	}
	return { values: values, modifies: modifies, explain: explainText };
}
return {
	mods: mods,
	proficiency: proficiency,
	castingMod: castingMod,
	armourClass: armourClass,
	saves: saves,
	skills: skills,
	passivePerception: 10 + skills.perception,
	spellDc: spellDc,
	explain: explainText
};
`
)

/**
 * A spell cast in a higher slot, or a cantrip at a higher character level.
 * In: `{ spell: { level, damage?: { formula }, heals?, heighten?: { perLevel },
 * cantripScaling?: { add } }, slotLevel?, characterLevel? }`. Out: `{ level,
 * formula, steps, explain }` — dice of one size added together (8d6 + 2×1d6
 * → 10d6), others joined with '+'.
 * @experimental
 */
export const VIS_ITINERIS_HEIGHTEN_SCRIPT = seed(
	"core:script/vis-itineris-heighten-spell",
	"Vis Itineris: heighten a spell",
	`
var v = value || {};
var spell = v.spell || {};
var base = (spell.damage && spell.damage.formula) || spell.heals || null;
var steps = 0, add = null, level = typeof spell.level === "number" ? spell.level : 0;
if (level === 0) {
	var cl = typeof v.characterLevel === "number" ? v.characterLevel : 1;
	steps = (cl >= 5 ? 1 : 0) + (cl >= 11 ? 1 : 0) + (cl >= 17 ? 1 : 0);
	add = spell.cantripScaling ? spell.cantripScaling.add : null;
} else {
	var slot = typeof v.slotLevel === "number" ? Math.floor(v.slotLevel) : level;
	if (slot < level) return { level: level, formula: null, steps: 0, explain: "A level " + level + " spell needs a slot of level " + level + " or higher." };
	level = slot;
	steps = slot - spell.level;
	add = spell.heighten ? spell.heighten.perLevel : null;
}
function parse(f) {
	var out = { dice: {}, flat: 0, order: [] };
	if (!f) return out;
	var parts = String(f).replace(/\\s+/g, "").split("+");
	for (var i = 0; i < parts.length; i++) {
		var m = /^(\\d*)d(\\d+)$/.exec(parts[i]);
		if (m) {
			var die = "d" + m[2];
			if (out.dice[die] === undefined) { out.dice[die] = 0; out.order.push(die); }
			out.dice[die] += m[1] === "" ? 1 : parseInt(m[1], 10);
		} else if (/^\\d+$/.test(parts[i])) out.flat += parseInt(parts[i], 10);
	}
	return out;
}
var total = parse(base);
if (add && steps > 0) {
	var extra = parse(add);
	for (var d = 0; d < extra.order.length; d++) {
		var die2 = extra.order[d];
		if (total.dice[die2] === undefined) { total.dice[die2] = 0; total.order.push(die2); }
		total.dice[die2] += extra.dice[die2] * steps;
	}
	total.flat += extra.flat * steps;
}
var bits = [];
for (var o = 0; o < total.order.length; o++) bits.push(total.dice[total.order[o]] + total.order[o]);
if (total.flat) bits.push(String(total.flat));
var formula = bits.length ? bits.join("+") : null;
return { level: level, formula: formula, steps: steps, explain: (spell.name || "Spell") + (steps ? " strengthened " + steps + " step" + (steps === 1 ? "" : "s") : "") + (formula ? ": " + formula : "") };
`
)

/**
 * A level gained. In: `{ class, level (the new level), conMod }`. Out: `{
 * level, hitDie, hpGain, hitDiceMax, proficiency, slots: [{ level, max }],
 * spellPoints, explain }` — health by the class die's fixed average (half the
 * die + 1) plus Constitution, at least 1; at level 1 the die's maximum
 * instead. Slots by the full- or half-caster table; an unknown class has a d8
 * and no slots.
 *
 * `spellPoints` is the pool's maximum under the setting `casting: points` —
 * our own rule, not the SRD's: a full caster has 2 + 2 × level (4 at level
 * 1), a half caster half of that rounded down, anyone else none.
 * @experimental
 */
export const VIS_ITINERIS_LEVEL_UP_SCRIPT = seed(
	"core:script/vis-itineris-level-up",
	"Vis Itineris: gain a level",
	`
var v = value || {};
${VIS_ITINERIS_SPELL_POINTS_JS}
var DIE = { barbarian: 12, fighter: 10, paladin: 10, ranger: 10, bard: 8, cleric: 8, druid: 8, monk: 8, rogue: 8, warlock: 8, sorcerer: 6, wizard: 6 };
var FULL = [[2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]];
var HALF = [[2],[2],[3],[3],[4,2],[4,2],[4,3],[4,3],[4,3,2],[4,3,2],[4,3,3],[4,3,3],[4,3,3,1],[4,3,3,1],[4,3,3,2],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]];
var cls = String(v["class"] || "").toLowerCase();
var level = Math.max(1, Math.min(20, typeof v.level === "number" ? Math.floor(v.level) : 1));
var die = DIE[cls] || 8;
var con = typeof v.conMod === "number" ? v.conMod : 0;
var hpGain = Math.max(1, (level === 1 ? die : die / 2 + 1) + con);
var table = CASTER[cls] === "full" ? FULL : CASTER[cls] === "half" ? HALF : null;
var slots = [];
if (table) for (var i = 0; i < table[level - 1].length; i++) slots.push({ level: i + 1, max: table[level - 1][i] });
var spellPoints = spellPointsFor(cls, level);
return {
	level: level,
	hitDie: "d" + die,
	hpGain: hpGain,
	hitDiceMax: level,
	proficiency: 2 + Math.floor((level - 1) / 4),
	slots: slots,
	spellPoints: spellPoints,
	explain: "Level " + level + (cls ? " " + cls : "") + ": +" + hpGain + " health (d" + die + (level === 1 ? " maximum" : " average") + (con ? (con > 0 ? " + " : " − ") + Math.abs(con) + " Constitution" : "") + ")"
};
`
)

/**
 * Carried load. In: `{ strength, items: [{ weight, count? }] }`. Out: `{
 * carried, capacity, load: 'light' | 'burdened' | 'over', speedPenalty,
 * explain }` — capacity Strength × 15 pounds; over half of it is burdened
 * (speed −10), over all of it is over (speed 5 at most).
 * @experimental
 */
export const VIS_ITINERIS_BULK_SCRIPT = seed(
	"core:script/vis-itineris-bulk",
	"Vis Itineris: carried load",
	`
var v = value || {};
var str = typeof v.strength === "number" ? v.strength : 10;
var items = v.items || [];
var carried = 0;
for (var i = 0; i < items.length; i++) {
	var it = items[i] || {};
	var w = typeof it.weight === "number" ? it.weight : 0;
	var n = typeof it.count === "number" && it.count >= 1 ? it.count : 1;
	carried += w * n;
}
carried = Math.round(carried * 100) / 100;
var capacity = str * 15;
var load = carried > capacity ? "over" : carried > capacity / 2 ? "burdened" : "light";
return {
	carried: carried,
	capacity: capacity,
	load: load,
	speedPenalty: load === "burdened" ? 10 : 0,
	explain: "Carrying " + carried + " of " + capacity + " lb: " + load
};
`
)

/** Vis Itineris's scripts, in seed order. @experimental */
export const VIS_ITINERIS_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	VIS_ITINERIS_DERIVE_SCRIPT,
	VIS_ITINERIS_HEIGHTEN_SCRIPT,
	VIS_ITINERIS_LEVEL_UP_SCRIPT,
	VIS_ITINERIS_BULK_SCRIPT
])
