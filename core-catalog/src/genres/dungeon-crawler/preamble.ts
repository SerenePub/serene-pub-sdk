/**
 * 🚧 Dungeon Crawler's **one script preamble** (AUDIT-rulesets-dc-sheet C7,
 * 2026-10-17): the readers every data-transform script of the genre shares —
 * the interview, the sheet, genesis, the Planner's talk and the story turn —
 * so each reads the settings document, the state and the crawl's bookkeeping
 * ONE way. Two preambles once disagreed on `own` (arrays), `text` (numbers),
 * `progressOf` (whether an older session counted as built) and
 * `goalKeptSecret` (which goal mode it read); a seat's reference was built
 * seven ways, its state key four, its player four, a lane's `:1` three.
 *
 * No imports from the genre's spec files (they import this), so no cycle.
 * Plain ES5 so any sandbox runs it.
 */

import {
	DUNGEON_CRAWLER_ANNEX_KEYS as KEYS,
	DUNGEON_CRAWLER_RETIRED_WORLD_KEYS,
	DUNGEON_CRAWLER_SECRET_GOAL_LINE,
	PARLEY_CHANNEL,
	TRAVELOGUE_CHANNEL,
} from './names.js'
import { difficultySlot, fateSlot, goalModeSlot, hpSlot, levelSlot, standingOrderSlot } from '../../registry/slots.js'
import { VIS_ITINERIS_ARMOUR_CLASS_JS, VIS_ITINERIS_SPELL_POINTS_JS } from '../../rulesets/vis-itineris/rules.js'
import { VIS_ITINERIS_COMPENDIUM } from '../../rulesets/vis-itineris/compendium/index.js'
import { VIS_ITINERIS_RULESET_ID } from '../../rulesets/vis-itineris/index.js'
import { DELTA_OF_JS } from '../../shared/deltas.js'
import { AT_ZERO_HEALTH_JS } from '../../functions/atZeroHealth.js'
import { DUNGEON_CRAWLER_RULES_WORDS_JS } from './fromRuleset.js'

/**
 * 🚧 Vis Itineris's armour rows as the sheet line needs them (P2-3): each
 * row's id → `{ category, acBase, dexCap? }`, from the compendium, never
 * typed twice. ⏳ The armour-class line is Vis Itineris's own rule
 * (`rules.ts`), said only at a table that plays it (`rulesetOf().armour`) —
 * the one build-time reading of a ruleset the crawl keeps (lane G3,
 * 2026-10-23: not in S4's list; a ruleset's worked-out values reach the
 * Planner through the handler's sheet block). @internal
 */
const ARMOUR_ROWS: Record<string, { category: unknown; acBase: unknown; dexCap?: unknown }> = Object.fromEntries(
	(VIS_ITINERIS_COMPENDIUM.rows.armour ?? []).map((r) => {
		const p = r.piece as Record<string, unknown>
		return [r.id, { category: p.category, acBase: p.acBase, ...(p.dexCap !== undefined ? { dexCap: p.dexCap } : {}) }]
	}),
)

/**
 * 🚧 The fields a story turn's Planner may never change by a delta: the
 * standing order (the player's), the fate (death's door only), the table's
 * rules, and the clock (the turn's own `clock`). Left out of the delta
 * schema's `slot` enum, so the grammar never offers them — the one place
 * they are refused (AUDIT C7: the plan check no longer filters them twice).
 * @internal
 */
export const DUNGEON_CRAWLER_NOT_FOR_DELTAS = Object.freeze([
	'standing-order',
	'fate',
	'crawl-time',
	'difficulty',
	'stat-mode',
	'goal-mode',
] as const)

// 🚧 A seeded script row and its builder are every genre's (`shared/scriptSeed.ts`,
// 2026-10-23, PLAN-genres-seams S5); re-exported so this genre's files read them here as before.
export { DATA_TRANSFORM_KIND, seedScript, type CoreScriptSeed } from '../../shared/scriptSeed.js'

/**
 * The value a slot reads as when nothing is stored — its declared default —
 * for the slots the genre writes that declare one. What a no-op change is
 * judged against (`dropUnchanged`).
 * @internal
 */
export const DUNGEON_CRAWLER_SLOT_DEFAULTS: Readonly<Record<string, unknown>> = Object.freeze(
	Object.fromEntries(
		[hpSlot, levelSlot, fateSlot, standingOrderSlot, difficultySlot, goalModeSlot].map((s: any) => [s.id, s.default]),
	),
)

/**
 * 🚧 The preamble. Globals: `v` (the step's value), `doc` (the settings
 * document, `v.session`), `core` (its `annex.core`), `KEYS`, `SL` (slot ids),
 * the channels. Readers:
 *
 *  - `own` (a plain object's shallow copy, never an array's), `copy`, `text`
 *    (a string or a number, trimmed), `num`, `clamp`, `list`;
 *  - `userOf(seat)` · `seatRefOf(seat)` · `stateKeyOf(ref)` — THE seat
 *    reference, its `session-state@1` key and its player;
 *  - `liveSeats(doc)` (every seat not removed, named or not), `seatOf(doc,
 *    user)`, `seatNameOf(seat)`, `seatsOf(doc, state)` (every live, named seat
 *    with its sheet), `sheetOf(entry)`, `maxHpOf`, `healthText`;
 *  - `tablePeople(doc)` (the owner, the guests, the seats' players, by user
 *    id) and `manyAtTable(doc)` — the standing order's one rule (§14);
 *  - `progressOf(core)` (the crawl's bookkeeping), 🚧 `heroMade(progress,
 *    who)` (a person's character made, not merely named) and
 *    `keepsHeroes(progress)`, `goalKeptSecret(state, journal, core)`,
 *    `laneOf(doc, user)`, `laneWho(doc, lane)` (whose lane);
 *  - the session's own lorebook as listed: `entriesOf`, `placesOf`,
 *    `peopleOf`, `fallenOf`; the Journal folio: `logOf`;
 *  - `cribLines(...)` — the Planner's crib, one builder for its three readers;
 *  - `dropUnchanged(changes, state, ownerFor)` — no change that changes nothing;
 *  - 🚧 `rulesetOf(ruleset)` — the inlet's `ruleset` read (lane G3,
 *    2026-10-23, S4: the session's ruleset, through its gist —
 *    `rulesetGistOf`, `fromRuleset.ts`; nothing assumed when it says
 *    nothing): `decides` (counted play), `casting` and the pool's slot,
 *    `fall` (its fall rule, or null: told in words, no die) and
 *    `deathSaves`, `levels`, `rest` (a night's rest, or null), `armour`;
 *    `deathSaveWords(passed, failed)`; the words for the numbers
 *    (`DUNGEON_CRAWLER_RULES_WORDS_JS`) and the fall rule itself
 *    (`AT_ZERO_HEALTH_JS`, `atZeroHealthOf`); `armourClassOf(dexMod, worn)`
 *    (Vis Itineris's one rule, said at its table alone).
 * @internal
 */
export const DUNGEON_CRAWLER_PREAMBLE = `
var KEYS = ${JSON.stringify(KEYS)};
var PARLEY = ${JSON.stringify(PARLEY_CHANNEL)};
var TRAVELOGUE = ${JSON.stringify(TRAVELOGUE_CHANNEL)};
var SECRET_GOAL = ${JSON.stringify(DUNGEON_CRAWLER_SECRET_GOAL_LINE)};
var RETIRED = ${JSON.stringify(DUNGEON_CRAWLER_RETIRED_WORLD_KEYS)};
var SL = {
	hp: "core:slot/hp@1",
	level: "core:slot/level@1",
	fate: "core:slot/fate@1",
	clock: "core:slot/crawl-time@1",
	location: "core:slot/location@1",
	characterClass: "core:slot/character-class@1",
	difficulty: "core:slot/difficulty@1",
	goalMode: "core:slot/goal-mode@1",
	standingOrder: "core:slot/standing-order@1",
	// 🚧 A dying seat's death saves in words, beside Fate's Dying (Q3-8).
	deathSaves: "core:slot/crawl-death-saves@1"
};
// ⏳ The ruleset whose armour rule the sheet line says (P2-3), alone.
var ARMOUR_RULESET = ${JSON.stringify(VIS_ITINERIS_RULESET_ID)};
var ARMOUR_ROWS = ${JSON.stringify(ARMOUR_ROWS)};
${VIS_ITINERIS_ARMOUR_CLASS_JS}
${VIS_ITINERIS_SPELL_POINTS_JS}
var v = value || {};
function own(o) { var out = {}; if (o && typeof o === "object" && !Array.isArray(o)) for (var k in o) out[k] = o[k]; return out; }
function copy(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function text(x) { return typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : ""; }
function num(x, d) { var n = Number(x); return x !== null && x !== "" && isFinite(n) ? n : d; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function list(x, max) {
	var out = [];
	if (!Array.isArray(x)) return out;
	for (var i = 0; i < x.length && out.length < max; i++) { var t = text(x[i]); if (t) out.push(t); }
	return out;
}
var doc = own(v.session);
var core = own(own(doc.annex).core);
${DUNGEON_CRAWLER_RULES_WORDS_JS}
${AT_ZERO_HEALTH_JS}
// 🚧 The ruleset the session plays, as the inlet carries it — its gist
// (lane G3, 2026-10-23, S4: \`rulesetGistOf\`): whether it decides anything
// by its rules (counted play; a ruleset that says nothing keeps words), its
// casting pool (\`points\`, else \`slots\`) and that pool's stat and
// ceiling (a seat's own most is below it, the declared one says nothing:
// Q1-6), its fall rule (null: none — the fall is told in words and no die is
// rolled) and whether its death saves play, whether levels raise anything,
// a night's rest (null: none), and whether the armour rule is its own.
function rulesetOf(r) {
	r = own(r);
	var id = text(r.id);
	var decides = r.decides === true;
	var cast0 = own(r.casting);
	var fall = fallOf(r);
	return {
		id: id, rigour: text(r.rigour), decides: decides,
		casting: text(cast0.pool) ? "points" : "slots",
		pointsSlot: text(cast0.slot), pointsCeiling: num(cast0.ceiling, null),
		fall: fall, deathSaves: !!(fall && fall.playsSaves),
		levels: r.levels === true, rest: nightRest(r),
		armour: decides && id === ARMOUR_RULESET
	};
}
// "1 pass, 2 failures" — a dying character's death saves so far.
function deathSaveWords(passed, failed) {
	return passed + (passed === 1 ? " pass" : " passes") + ", " + failed + (failed === 1 ? " failure" : " failures");
}
// ── Seats: one reference, one state key, one player ──
function userOf(seat) {
	if (!seat) return null;
	if (seat.seatUserId != null) return Number(seat.seatUserId);
	return seat.persona && seat.persona.userId != null ? Number(seat.persona.userId) : null;
}
function seatRefOf(seat) { return seat.persona ? "character:" + seat.persona.id : "player-seat:" + seat.seatId; }
function stateKeyOf(ref) {
	var r = String(ref);
	var m = /^player-seat:(\\d+)$/.exec(r);
	if (m) return "player_seat:" + m[1];
	var c = /^character:(\\d+)$/.exec(r);
	return c ? c[1] : r;
}
function seatNameOf(seat) { return seat ? text(seat.seatName) || text(seat.persona && seat.persona.name) : ""; }
function liveSeats(d) {
	var seats = (own(d).cast && own(d).cast.sessionPersonas) || [];
	var out = [];
	for (var i = 0; i < seats.length; i++) if (seats[i] && !seats[i].removedAt) out.push(seats[i]);
	return out;
}
// A person's own seat: the card-less one first, else their first.
function seatOf(d, userId) {
	var seats = liveSeats(d);
	var mine = [];
	for (var i = 0; i < seats.length; i++) if (userOf(seats[i]) === userId) mine.push(seats[i]);
	for (var j = 0; j < mine.length; j++) if (!mine[j].persona) return mine[j];
	return mine[0] || null;
}
// 🚧 Who is at the table: the owner, every guest and every live seat's
// player, the owner first — each person once, by user id.
function tablePeople(d) {
	d = own(d);
	var out = [];
	function add(u) { if (u === null || u === undefined || u === "") return; u = Number(u); if (!isFinite(u)) return; if (out.indexOf(u) < 0) out.push(u); }
	add(d.ownerUserId);
	var gs = Array.isArray(d.guests) ? d.guests : [];
	for (var i = 0; i < gs.length; i++) add(gs[i]);
	var ss = liveSeats(d);
	for (var j = 0; j < ss.length; j++) add(userOf(ss[j]));
	return out;
}
// 🚧 The standing order's one rule (PLAN-sheet-widget-redesign §14): only
// at a table of more than one — a second seat, or a second person greeted
// whose seat is on its way (a guest makes theirs in the interview, after
// their lane opened). Solo has no round to sit out.
function manyAtTable(d) { return liveSeats(d).length > 1 || tablePeople(d).length > 1; }
function placeOf(x) { return typeof x === "string" ? x.trim() : x && typeof x === "object" ? text(x.name) : ""; }
function sheetOf(e) {
	e = own(e);
	return {
		hp: num(e.hp, null), level: num(e.level, 1), "class": text(e["character-class"]),
		standingOrder: text(e["standing-order"]) || "hold",
		location: placeOf(e.location), fate: text(e.fate) || "alive",
		// 🚧 The death-save tally the sheet shows while they lie dying (Q3-8).
		tally: text(e["crawl-death-saves"])
	};
}
// A seat's full health: the hp slot's max in force for that owner
// (\`state.configs\`, the bar's own number), or null when none is known.
function maxHpOf(state, ref) {
	var c = own(own(own(state).configs)[stateKeyOf(ref)])[SL.hp];
	return c && typeof c.max === "number" ? c.max : null;
}
// ", health 9/15" — the max only when one is known.
function healthText(hp, max) {
	var now = hp === null ? max : hp;
	return now === null ? "" : ", health " + now + (max !== null ? "/" + max : "");
}
// 🚧 Health in words, at a table that keeps no numbers (PLAN-dc-after-walk2
// Q2-3, owner ruling ★3): unhurt, hurt, badly hurt, at death's door — never
// "health 8/10".
function healthWords(hp, max) {
	var now = hp === null ? max : hp;
	if (now === null) return "";
	if (now <= 0) return ", at death's door";
	if (max === null || now >= max) return ", unhurt";
	return now * 2 > max ? ", hurt" : ", badly hurt";
}
// 🚧 How one seat stands, as a crib's head reads it: level and health at a
// table that counts; health in words, and no level, at one that keeps none.
function standingText(level, hp, max, rules) {
	var rl0 = rules && typeof rules === "object" ? rules : null;
	if (rl0 && rl0.decides === false) return healthWords(hp, max);
	return ", level " + level + healthText(hp, max);
}
function seatsOf(d, state) {
	var byId = own(own(own(state).cast).byId);
	var seats = liveSeats(d);
	var out = [];
	for (var i = 0; i < seats.length; i++) {
		var s = seats[i];
		var name = seatNameOf(s);
		if (!name) continue;
		var ref = seatRefOf(s);
		var sheet = sheetOf(byId[stateKeyOf(ref)]);
		sheet.ref = ref; sheet.name = name; sheet.user = userOf(s); sheet.maxHp = maxHpOf(state, ref);
		out.push(sheet);
	}
	return out;
}
// 🚧 The companions (P3-9, owner ruling 2026-10-18): the session's cast
// characters that are no player's seat — narrative only at this table:
// voiced by the Narrator, no sheet kept, never seated. \`[{ ref, name }]\`.
function companionsOf(d) {
	var cast = own(own(d).cast).characters;
	cast = Array.isArray(cast) ? cast : [];
	var seatRefs = {};
	var ss = liveSeats(d);
	for (var i = 0; i < ss.length; i++) seatRefs[seatRefOf(ss[i])] = true;
	var out = [];
	for (var c = 0; c < cast.length; c++) {
		var ch = cast[c];
		if (!ch || ch.id == null || !text(ch.name)) continue;
		if (seatRefs["character:" + ch.id]) continue;
		out.push({ ref: "character:" + ch.id, name: text(ch.name) });
	}
	return out;
}
function companionNames(d) {
	var cs = companionsOf(d), out = [];
	for (var i = 0; i < cs.length; i++) out.push(cs[i].name);
	return out;
}
// The kit's owner before the seat exists: the seat step fills it (P3-7).
var SEAT_TOKEN = "<seat>";
// ── The crawl's bookkeeping ──
// \`dungeon-crawler-progress\`: its own key, else — an older session — the
// bookkeeping fields of the world document it kept, never its world nor its
// undo snapshots. An older session whose world had places counts as built.
function progressOf(c0) {
	c0 = own(c0 === undefined ? core : c0);
	var p = c0[KEYS.progress];
	if (p && typeof p === "object" && !Array.isArray(p)) return own(p);
	var legacy = own(c0[KEYS.legacyWorld]);
	if (Array.isArray(legacy.rooms) && legacy.rooms.length) legacy.built = true;
	for (var r = 0; r < RETIRED.length; r++) delete legacy[RETIRED[r]];
	return legacy;
}
// 🚧 Whether a person's character is MADE — their sheet applied (the
// sheet script stamps \`made\`; an older session's hero carries the backstory
// the sheet wrote) — never merely named: a persona names a seat at
// creation, and the interview's name answer names it before the class
// (the 100-turn walk, B3/B15/B16). \`who\` is \`user:<id>\`.
function heroMade(progress, who) {
	var h = own(own(own(progress).heroes)[text(who)]);
	return h.made === true || (h.backstory !== undefined && !!text(h.name));
}
// Whether the crawl keeps heroes at all: an older session made before the
// interview kept none, and every named seat of it counts as made.
function keepsHeroes(progress) {
	var hs = own(own(progress).heroes);
	for (var k in hs) return true;
	return false;
}
// A seat whose character is made: the round waits for it, the story acts
// with it (P0-5). In a crawl that keeps no heroes, every named seat.
function seatMade(progress, seat) {
	if (!keepsHeroes(progress)) return true;
	var u = seat && seat.user !== undefined ? seat.user : userOf(seat);
	return u !== null && u !== undefined && heroMade(progress, "user:" + u);
}
// ── A piece and a sheet, in words (P1-3, P1-8) ──
// A piece's name as a person reads it: its own name, else its compendium id
// spelled out (dashes to spaces, the first letter raised).
function pieceWords(p) {
	function spelled(id) { return id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " "); }
	if (p && typeof p === "object") {
		if (text(p.name)) return text(p.name);
		var id0 = text(p.pieceId) || text(p.id);
		return id0 && id0 === id0.toLowerCase() ? spelled(id0) : id0;
	}
	var t = text(p);
	return t && t.indexOf("-") > 0 && t === t.toLowerCase() ? spelled(t) : t;
}
var SHEET_LISTS = [["crawl-weapons", "weapons"], ["crawl-armour", "armour"], ["crawl-gear", "gear"], ["crawl-consumables", "consumables"], ["crawl-spells", "spells"], ["crawl-features", "features"]];
// The spell slots a seat has left, level by level: "level 1: 1 of 2 left".
function slotWords(bag) {
	var held = Array.isArray(own(bag)["crawl-spell-slots"]) ? own(bag)["crawl-spell-slots"] : [];
	var out = [];
	for (var i = 0; i < held.length; i++) {
		var p = own(held[i]);
		var max = num(p.max, 0);
		if (max <= 0) continue;
		out.push("level " + num(p.level, 1) + ": " + Math.max(0, max - num(p.used, 0)) + " of " + max + " left");
	}
	return out;
}
// 🚧 A seat's armour class (P2-3): its armour pieces — library rows by id,
// written-out ones by their own fields — through Vis Itineris's one rule.
function armourOf(bag) {
	var held = Array.isArray(own(bag)["crawl-armour"]) ? own(bag)["crawl-armour"] : [];
	var out = [];
	for (var i = 0; i < held.length; i++) {
		var p = own(held[i]);
		var row = p.kind === "compendium" ? own(ARMOUR_ROWS[text(p.pieceId)]) : {};
		var o = own(p.overrides);
		var category = text(o.category) || text(p.category) || text(row.category);
		var acBase = num(o.acBase, num(p.acBase, num(row.acBase, null)));
		if (acBase === null) continue;
		var piece = { category: category, acBase: acBase };
		var cap = num(o.dexCap, num(p.dexCap, num(row.dexCap, null)));
		if (cap !== null) piece.dexCap = cap;
		out.push(piece);
	}
	return out;
}
function armourClassLine(bag) {
	var dex = num(own(bag)["itineris-dexterity"], 10);
	return armourClassOf(Math.floor((dex - 10) / 2), armourOf(bag)).ac;
}
// One seat's sheet as one line: health, armour class, conditions, what they
// hold, their spell slots or spell points — what the Planner's talk answers
// "how much health do I have left?" from, and what a refused spend is
// checked against. \`rules\` is \`rulesetOf\`'s (P2-3, P2-4): armour class
// where numbers count on the kits' ruleset, the pool at a points table.
function sheetLine(state, ref, name, rules) {
	var bag = own(own(own(own(state).cast).byId)[stateKeyOf(ref)]);
	var sh = sheetOf(bag);
	var parts = [];
	var rl = rules && typeof rules === "object" ? rules : rulesetOf(null);
	var ac = rl.armour && rl.rigour !== "prose" ? ", armour class " + armourClassLine(bag) : "";
	parts.push(name + " (" + ref + (sh["class"] ? ", " + sh["class"] : "") + standingText(sh.level, sh.hp, maxHpOf(state, ref), rl) + ac + (sh.fate !== "alive" ? ", " + sh.fate.replace("-", " ") : "") + (sh.location ? ", at " + sh.location : "") + ")");
	var conds = Array.isArray(bag["crawl-conditions"]) ? bag["crawl-conditions"] : [];
	var cn = [];
	for (var c = 0; c < conds.length; c++) { var w = pieceWords(conds[c]); if (w) cn.push(w); }
	if (cn.length) parts.push("conditions: " + cn.join(", "));
	for (var li = 0; li < SHEET_LISTS.length; li++) {
		var lst = Array.isArray(bag[SHEET_LISTS[li][0]]) ? bag[SHEET_LISTS[li][0]] : [];
		var names = [];
		for (var k = 0; k < lst.length; k++) {
			var pw = pieceWords(lst[k]);
			var uses = own(lst[k]).uses;
			if (pw) names.push(pw + (typeof uses === "number" ? " (" + uses + (uses === 1 ? " use" : " uses") + ")" : ""));
		}
		if (names.length) parts.push(SHEET_LISTS[li][1] + ": " + names.join(", "));
	}
	var slots = slotWords(bag);
	if (slots.length && rl.casting !== "points") parts.push("spell slots " + slots.join(", "));
	// 🚧 At a spell-points table (P2-4): the pool left, and its most — the
	// seat's own, never the stat's declared ceiling (Q1-6: "4 of 99"); a
	// seat whose pool is none casts nothing, and is said nothing of.
	var poolKey = rl.casting === "points" ? ucSlotName(rl.pointsSlot) : "";
	if (poolKey && bag[poolKey] !== undefined) {
		var poolMax = own(own(own(own(state).configs)[stateKeyOf(ref)])[rl.pointsSlot]).max;
		var ownMax = typeof poolMax === "number" && poolMax !== rl.pointsCeiling ? poolMax : null;
		if (ownMax !== 0) parts.push("spell points " + num(bag[poolKey], 0) + (ownMax !== null ? " of " + ownMax : "") + " left");
	}
	return parts.join("; ");
}
// The goal is secret while the table chose so (the world's \`goal-mode\`
// slot) and the notes are not out — or the journal was written as secret
// (the line, or the bare word an older session holds).
function goalKeptSecret(state, journal, c0) {
	if (text(own(c0 === undefined ? core : c0)[KEYS.planningNotesRevealed])) return false;
	// 🚧 A goal reached, or an adventure carried on past it or ended, keeps
	// no secret (P3-3): the journal shows the goal from then on.
	var pr0 = progressOf(c0 === undefined ? core : c0);
	if (pr0.goalReached || pr0.goalDone || pr0.ended) return false;
	var g = text(journal && journal.goal);
	return text(own(own(state).world)["goal-mode"]) === "secret" || g === "secret" || g === SECRET_GOAL;
}
// ── The Planner lanes: core's lane register, as the settings document
// carries it (\`channelLanes\`, owner ruling 2026-10-17) — \`parley\` is
// declared \`lanes: 'personal'\`, so core opens each person's lane
// (\`core:query/channel-lane@1\`) and sends it to them and the owner alone.
// A person's Planner lane (canonical: \`parley\` is lane 1), or null. ──
function laneOf(d, user) {
	var lanes = own(own(own(d).channelLanes)[PARLEY]);
	return text(lanes["user:" + user]) || null;
}
// Whose Planner lane \`lane\` is (\`user:<id>\`), a bare \`parley\` being lane 1.
function laneWho(d, lane) {
	var l = text(lane);
	var lanes = own(own(own(d).channelLanes)[PARLEY]);
	var bare = l === PARLEY + ":1" ? PARLEY : l;
	for (var k in lanes) if (lanes[k] === l || lanes[k] === bare) return k;
	return null;
}
// ── The world, as the session's own lorebook lists it ──
function entriesOf(listing) {
	var rows = listing && typeof listing === "object" && !Array.isArray(listing) ? (listing.entries || listing.main) : listing;
	return Array.isArray(rows) ? rows : [];
}
function placesOf(listing) {
	var rows = entriesOf(listing);
	var out = [];
	for (var i = 0; i < rows.length; i++) {
		var r = rows[i];
		if (!r || !text(r.name)) continue;
		var ways = [];
		var ls = Array.isArray(r.links) ? r.links : [];
		for (var j = 0; j < ls.length; j++) if (ls[j] && ls[j].to && text(ls[j].to.name)) ways.push(text(ls[j].to.name));
		out.push({ id: num(r.id, null), name: text(r.name), description: text(r.content), exits: ways });
	}
	return out;
}
// 🚧 A place's ways out as its exits list holds them: "Door to The Vault
// (locked)" — the way's own name and its state, and a trap the Planner keeps
// secret; never a difficulty (Q2-2). None when the place keeps no list.
function waysOutOf(state, placeId) {
	if (placeId === null || placeId === undefined) return [];
	var bag = own(own(own(own(state).locations).byId)[String(placeId)]);
	var held = Array.isArray(bag["crawl-exits"]) ? bag["crawl-exits"] : [];
	var out = [];
	for (var i = 0; i < held.length; i++) {
		var w0 = own(held[i]);
		var nm = text(w0.name) || pieceWords(held[i]);
		if (!nm) continue;
		var st0 = text(w0.state).toLowerCase();
		// The Planner keeps the books: the trap is theirs to know, never a
		// player's (the crib is the Planner's alone).
		var trap0 = w0.trap && typeof w0.trap === "object" ? text(w0.trap.name) : text(w0.trap);
		out.push(nm + " (" + (st0 || "open") + (trap0 ? "; trapped: " + trap0 : "") + ")");
	}
	return out;
}
function peopleOf(listing) {
	var rows = entriesOf(listing);
	var out = [];
	for (var i = 0; i < rows.length; i++) if (rows[i] && text(rows[i].name)) out.push({ id: num(rows[i].id, null), name: text(rows[i].name), description: text(rows[i].content) });
	return out;
}
function fallenOf(listing) {
	var rows = entriesOf(listing);
	var out = [];
	for (var i = 0; i < rows.length; i++) if (rows[i] && text(rows[i].content)) out.push(text(rows[i].content));
	return out;
}
// The Journal folio's newest lines, oldest first — the story so far.
function logOf(rows, max) {
	var out = [];
	var list0 = Array.isArray(rows) ? rows : [];
	for (var i = 0; i < list0.length; i++) {
		var m = list0[i];
		if (!m || m.isHidden) continue;
		var t = text(m.content);
		if (t) out.push(t);
	}
	return out.slice(Math.max(0, out.length - max));
}
// ── The Planner's crib: one builder, three readers (the story turn, its
// talk, a new goal). \`o\`: { state, places, people, fallen, log, detail } —
// \`detail\` lists each place with its reference and ways out (the story
// turn); without it places and people are names. ⚠ The Planner's alone:
// the goal and the notes are secrets the Narrator never reads.
function cribLines(progress, journal, o) {
	o = own(o);
	var lines = [];
	if (progress.shape) lines.push("The adventure is " + (progress.shape === "open-world" ? "an open world." : "a dungeon."));
	if (text(progress.goal)) lines.push("The goal: " + text(progress.goal) + (goalKeptSecret(o.state, journal) ? " (secret: the players do not know it)" : "") +
		(progress.goalDone ? " (reached; the party carries on without one)" : progress.goalReached ? " (reached)" : ""));
	var places = placesOf(o.places), people = peopleOf(o.people);
	if (o.detail) {
		if (places.length) {
			var rl = [];
			for (var ri = 0; ri < places.length; ri++) {
				// 🚧 Each way out by its own name and how it stands (PLAN-dc-after-walk2
				// Q2-2, the walk's N7): a traverse must name the way exactly
				// ("Door to The Vault"), and the crib named only where each went.
				var named = waysOutOf(o.state, places[ri].id);
				var wayList = named.length ? named.join("; ") : places[ri].exits.join(", ");
				rl.push("- " + places[ri].name + (places[ri].id !== null ? " [location:" + places[ri].id + "]" : "") + ": " + places[ri].description + (wayList ? " Ways out: " + wayList + "." : ""));
			}
			lines.push("Places:\\n" + rl.join("\\n"));
		}
		if (people.length) {
			var nl = [];
			for (var ni = 0; ni < people.length; ni++) nl.push("- " + people[ni].name + ": " + people[ni].description);
			lines.push("People:\\n" + nl.join("\\n"));
		}
	} else {
		var pn = [], hn = [];
		for (var a = 0; a < places.length; a++) pn.push(places[a].name);
		for (var b = 0; b < people.length; b++) hn.push(people[b].name);
		if (pn.length) lines.push("Places: " + pn.join(", ") + ".");
		if (hn.length) lines.push("People: " + hn.join(", ") + ".");
	}
	var leads = list(own(journal).leads, 6);
	if (leads.length) lines.push("Open leads: " + leads.join("; ") + ".");
	if (text(core[KEYS.planningNotes])) lines.push("Your notes: " + text(core[KEYS.planningNotes]));
	var fallen = fallenOf(o.fallen);
	if (fallen.length) lines.push("The fallen: " + fallen.join(" "));
	var log = Array.isArray(o.log) ? o.log : [];
	if (log.length) lines.push("The story so far, oldest first:\\n- " + log.join("\\n- "));
	return lines;
}
${DELTA_OF_JS}// 🚧 A change in the session's rules' grammar (S1, lane G3, 2026-10-23:
// \`ruleset-resolve\`'s \`replySchema\` — attribute · entryType · name — the
// one grammar a model is asked for changes in), read as the handler's (slot ·
// repertoire · piece) before \`deltaOf\`. One already in the handler's words
// passes as it is.
function asDelta(raw) {
	var d = own(raw);
	if (text(d.attribute) && !text(d.slot)) d.slot = text(d.attribute);
	if (text(d.entryType) && !text(d.repertoire)) d.repertoire = text(d.entryType);
	if (text(d.name) && !d.piece) d.piece = text(d.name);
	delete d.attribute; delete d.entryType; delete d.name; delete d.changes;
	return d;
}
// ── A refused change, in the table's words (P1-2, owner ruling 2026-10-18:
// a "Not changed: …" line every player sees — never a code). \`rj\` is one of
// the ruleset handler's \`rejected\` (\`{ delta, reason, why, proposalId }\`),
// or the genre's own \`{ delta, words }\`; \`names\` maps a reference to the
// name the table knows it by. ──
var SLOT_WORDS = { hp: "health", "core:slot/hp@1": "health", level: "level", "character-class": "class", location: "place" };
function slotWordOf(slot) {
	var k = text(slot);
	if (SLOT_WORDS[k]) return SLOT_WORDS[k];
	return k.replace(/^core:slot\\//, "").replace(/@\\d+$/, "").replace(/^itineris-/, "").replace(/-/g, " ").toLowerCase();
}
function refusalWords(rj, names) {
	rj = own(rj);
	if (text(rj.words)) return text(rj.words);
	var d = own(rj.delta);
	var ownerRef = text(d.owner);
	var who = (names && names[ownerRef]) || (ownerRef === "world" ? "the world" : /^[a-z-]+:\\d+$/.test(ownerRef) ? "someone" : ownerRef || "someone");
	var pieceName = d.piece && typeof d.piece === "object" ? text(d.piece.name) : pieceWords(d.piece);
	var piece = pieceName ? pieceName.charAt(0).toLowerCase() + pieceName.slice(1) : "";
	var slot = slotWordOf(d.slot);
	var op = text(d.op);
	var code = text(rj.reason);
	var filed = rj.proposalId !== undefined && rj.proposalId !== null;
	var said;
	if (code === "unknown-piece") {
		if (!piece) said = "nothing was named to give " + who;
		else if (op === "hit" || op === "use" || op === "traverse") said = who + " doesn't carry " + (/^(a|an|the) /.test(piece) ? piece : "a " + piece);
		else said = who + " doesn't have " + (/^(a|an|the) /.test(piece) ? piece : "a " + piece);
	} else if (code === "unknown-owner") said = (ownerRef ? who : "somebody nobody named") + " isn't anyone this round's changes can reach";
	// 🚧 A spell cast at a spell-points table with too few points (P2-4).
	else if (code === "not-enough" && text(d.repertoire) === "spells") said = who + " hasn't the spell points left to cast " + (piece || "that spell");
	else if (code === "not-enough") said = who + " hasn't " + (text(d.value) ? text(d.value) + " " : "enough ") + (slot || piece || "of that") + " to spend";
	else if (code === "set-on-ruleset-value") said = who + "'s " + (slot || "number") + " changes by an amount, never set outright" + (filed ? " — the change waits for the session owner's review" : "");
	else if (code === "derived-value") said = who + "'s " + (slot || "number") + " is worked out from the rest of the sheet";
	// 🚧 Full health asked for as a field (Q3-1, the walk's "has no hp max to
	// change"): it is no number a turn sets — a level raises it.
	else if (code === "unknown-slot" && /(health|hp) ?max|max(imum)? ?(health|hp)/.test(slot)) said = who + "'s full health is not something a turn changes: a new level raises it";
	else if (code === "unknown-slot") said = who + " has no " + (slot || "such thing") + " to change";
	else if (code === "unknown-repertoire") said = who + " can't hold " + (text(d.repertoire) || "that").replace(/-/g, " ");
	else if (code === "unknown-selector") said = "there is no " + (text(d.check) ? text(d.check).replace(/[.-]/g, " ") + " " : "") + "check to roll for that";
	else if (code === "bad-value") said = "'" + text(d.value) + "' isn't an amount";
	else if (code === "bad-piece") said = (pieceName || "that piece") + " can't be written on a sheet as it stands";
	// An older refusal said in words under \`reason\` reads as it was said.
	else said = text(rj.why) || (/\\s/.test(code) ? code : "") || "the table could not make that change";
	if (filed && code !== "set-on-ruleset-value") said += " — the change waits for the session owner's review";
	return "Not changed: " + said.charAt(0).toUpperCase() + said.slice(1) + (/[.!?]$/.test(said) ? "" : ".");
}
// ── No change that changes nothing (owner walkthrough 2026-10-15:
// "Difficulty fair → fair", "Level 1 → 1"): the changes whose value differs
// from what the slot reads as now (session-state@1's value, else the slot's
// declared default), compared as text (a list item by item). \`ownerFor\` is
// whose a change naming no owner is, or null. An empty list when nothing is
// left, never null. ──
var NOT_FOR_DELTAS = ${JSON.stringify(DUNGEON_CRAWLER_NOT_FOR_DELTAS)};
var UC_DEFAULTS = ${JSON.stringify(DUNGEON_CRAWLER_SLOT_DEFAULTS)};
function ucSlotName(id) { return String(id).replace(/^core:slot\\//, "").replace(/@\\d+$/, ""); }
function ucItem(it) {
	if (it === null || it === undefined) return "";
	if (typeof it === "object") return String(it.name || it.text || JSON.stringify(it)).trim();
	return String(it).trim();
}
function ucText(x) {
	if (Array.isArray(x)) { var o = []; for (var i = 0; i < x.length; i++) { var t = ucItem(x[i]); if (t) o.push(t); } return JSON.stringify(o); }
	return ucItem(x);
}
function ucNow(state, owner, slot) {
	var st = own(state);
	var bag = owner === "world" ? st.world : st.cast && st.cast.byId && owner ? st.cast.byId[stateKeyOf(owner)] : null;
	var val = bag && typeof bag === "object" ? bag[ucSlotName(slot)] : undefined;
	if (val === undefined || val === null || val === "" || (Array.isArray(val) && !val.length)) val = UC_DEFAULTS[slot];
	return val === undefined ? null : val;
}
function dropUnchanged(changes, state, ownerFor) {
	var out = [];
	if (!Array.isArray(changes)) return out;
	for (var i = 0; i < changes.length; i++) {
		var c = changes[i];
		if (!c) continue;
		var owner = c.owner ? String(c.owner) : ownerFor || null;
		var now = ucNow(state, owner, c.slot);
		if (now !== null && ucText(now) === ucText(c.value)) continue;
		out.push(c);
	}
	return out;
}
`
