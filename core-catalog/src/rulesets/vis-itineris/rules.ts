/**
 * 🚧 Vis Itineris's rules that more than one script reads, as ES5 source to
 * lay into each (2026-10-18): one armour-class rule, one spell-point pool.
 * A leaf module — no imports — so the ruleset's seeded scripts and the
 * Dungeon Crawler's preamble both take it without an import cycle.
 */

/**
 * 🚧 Armour class, one way (2026-10-18, P2-3): the best body armour's value
 * plus the Dexterity modifier up to its limit (10 + Dexterity with none),
 * every shield's value added. ES5, laid into the derive script and the
 * Dungeon Crawler's sheet line — so the sheet a player reads and the number
 * a roll is against are one function. `worn` is armour pieces' props
 * (`{ category, acBase, dexCap?, name? }`).
 * @internal
 */
export const VIS_ITINERIS_ARMOUR_CLASS_JS = `
function armourClassOf(dexMod, worn) {
	var body = null, shield = 0;
	worn = worn || [];
	for (var a = 0; a < worn.length; a++) {
		var p = worn[a] || {};
		if (p.category === "shield") shield += typeof p.acBase === "number" ? p.acBase : 0;
		else if (typeof p.acBase === "number" && (!body || p.acBase > body.acBase)) body = p;
	}
	var ac = body ? body.acBase + (typeof body.dexCap === "number" ? Math.min(dexMod, body.dexCap) : dexMod) : 10 + dexMod;
	return { ac: ac + shield, body: body, shield: shield };
}
`

/**
 * 🚧 The spell-point pool's maximum (2026-10-18, P2-4): a full caster's
 * 2 + 2 × level, a half caster's half of that rounded down, anyone else
 * none — our own rule, not the SRD's. ES5, laid into the derive script (what
 * a long rest refills to) and the level-up script, and mirrored by the
 * Dungeon Crawler's kits (their level-1 pool). @internal
 */
export const VIS_ITINERIS_SPELL_POINTS_JS = `
var CASTER = { bard: "full", cleric: "full", druid: "full", sorcerer: "full", wizard: "full", paladin: "half", ranger: "half" };
function spellPointsFor(cls, level) {
	var c = CASTER[String(cls || "").toLowerCase()];
	var lv = Math.max(1, Math.min(20, typeof level === "number" ? Math.floor(level) : 1));
	return c === "full" ? 2 + 2 * lv : c === "half" ? Math.floor((2 + 2 * lv) / 2) : 0;
}
`

/**
 * 🚧 The same pool rule in TypeScript, for a genre's kit data built at load
 * (the Dungeon Crawler's level-1 pools); a test holds it to the ES5 above.
 * @internal
 */
export function spellPointsFor(cls: string, level: number): number {
	const caster: Record<string, 'full' | 'half'> = { bard: 'full', cleric: 'full', druid: 'full', sorcerer: 'full', wizard: 'full', paladin: 'half', ranger: 'half' }
	const c = caster[String(cls || '').toLowerCase()]
	const lv = Math.max(1, Math.min(20, Math.floor(level)))
	return c === 'full' ? 2 + 2 * lv : c === 'half' ? Math.floor((2 + 2 * lv) / 2) : 0
}
