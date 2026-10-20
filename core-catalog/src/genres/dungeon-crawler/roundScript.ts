/**
 * 🚧 Dungeon Crawler's round, as a `core:script:turn/select@1` script
 * (PLAN-dungeon-crawler-2026-10-14, feature 17, verification 1).
 *
 * The turn-order spec runs `core:task/turn-scripted@1` over an empty pool, so
 * the selection the chain is handed carries no entries of its own; this script
 * decides the whole order from the settings document (`ctx.session`, the
 * `session` extra every script point offers — declared in `varsIn`):
 *
 *  · **ready** when there is at least one live, named player seat and every
 *    one of them has **declared** — has a visible line on Story since the
 *    Story's newest reply (`selection.sentSinceReply.main`, the host's
 *    reading of the rows: the seat's `player-seat:<id>`, or `character:<id>`
 *    for a seat with a card). The hand-marked `round` annex key is gone
 *    (AUDIT C7): nothing ever wrote it but its own reset;
 *
 *  ⚠ **Why the rows, not the annex** (multiplayer lane, 2026-10-15): a
 *  declaration written to the annex lands as `annex-changed` under a run's
 *  cause, which auto-advance never fires on (R34) — the last player's line
 *  would leave the Narrator prepared but silent. Read off the rows, the
 *  recompute the line itself causes (a person's cause) is the one that
 *  finds the round complete, and fires it. It also resets itself: the
 *  Narrator's reply on Story is a reply, so the next round starts empty,
 *  and a deleted or hidden line un-declares. **Continue** needs no flag:
 *  the press fires the story turn itself (the owner's carry-on, or a
 *  declared player's — `sessions:fireTurn`);
 *  · ready → one entry in the pipeline's own voice on Story,
 *    `{ ref: null, via: 'voice' }`, exactly what the narrator strategy writes;
 *  · otherwise → `{ order: [] }`: nobody is due, which is an answer;
 *  · and, either way, **the Planner's talk**: one own-voice entry per
 *    `parley` lane whose newest visible row is a person's
 *    (`selection.voiceEntries`, what the narrator strategy would prepare over
 *    every channel) — a line in your Planner lane is answered there, round
 *    or no round.
 *
 * A seat with no name yet (a player still in the tavern) does not hold the
 * round up, and does not count towards it: with no named seat at all, only
 * Continue resolves a round. 🚧 Nor does a named seat whose character is not
 * made yet (`progress.heroes[user:<id>].made`, the sheet's stamp — the
 * 100-turn walk, B15/B16). 🚧 When every named seat is out of the fight and
 * one of them speaks, the round is played (P3-2): the story says why. Nor does a seat out of the fight — its `fate`
 * (`core:slot/fate@1`) `dead`, or `taken-out` until a Rest: the story turn
 * gives such a seat no action, so waiting on its line would hold the table
 * for nothing. 🚧 The fate is read off the state rows when the host hands
 * the select point the state (`ctx.state` — AUDIT A8: an annex copy does
 * not move back on a retake, so a solo death retaken left a round that never
 * fired). ⏳ Until the `select` point declares that extra (an SDK change),
 * the script reads the story turn's and Rest's mirror, `progress.fates`
 * (`{ <seat ref>: 'dead' | 'taken-out' }`, the living omitted), rewritten
 * from the state rows on every turn and Rest — so a retake is righted by the
 * next Continue.
 *
 * Seeded by the host from `CORE_SCRIPTS` (`seed/scripts.ts`) and attached
 * by seed key: the turn-order spec's author preset names it at the
 * `strategy` node's `select` point (`PresetBuilder.scripts`), and the host
 * writes the seeded row's id into the shipped config.
 * @experimental
 */

import { DUNGEON_CRAWLER_ANNEX_KEYS, PARLEY_CHANNEL } from './names.js'

/** @experimental */
export const DUNGEON_CRAWLER_ROUND_SCRIPT_KIND = 'core:script:turn/select@1'

/**
 * The script's body: a QuickJS function body with `selection` bound and the
 * settings document on `ctx.session`. Plain ES5 so any sandbox runs it.
 * @experimental
 */
export const DUNGEON_CRAWLER_ROUND_SCRIPT_SOURCE = `
var doc = (ctx && ctx.session) || {};
var core = (doc.annex && doc.annex.core) || {};
var sent = (selection.sentSinceReply && selection.sentSinceReply.main) || [];
var declared = Array.isArray(sent) ? sent.slice() : [];
// Who is out of the round: the seat's \`fate\` row, read off the state when the
// host hands it (\`ctx.state\`, session-state@1's document); ⏳ until then the
// story turn's mirror of those rows (\`progress.fates\`), rewritten from the
// state every turn and every Rest.
var state = ctx && ctx.state && typeof ctx.state === "object" ? ctx.state : null;
var byId = state && state.cast && state.cast.byId ? state.cast.byId : null;
var progress = core[${JSON.stringify(DUNGEON_CRAWLER_ANNEX_KEYS.progress)}] || core[${JSON.stringify(DUNGEON_CRAWLER_ANNEX_KEYS.legacyWorld)}] || {};
var mirror = (progress.fates && typeof progress.fates === "object") ? progress.fates : {};
function refOf(s) { return s.persona && s.persona.id != null ? "character:" + s.persona.id : "player-seat:" + s.seatId; }
function fateOf(s) {
	if (byId) {
		var key = s.persona && s.persona.id != null ? String(s.persona.id) : "player_seat:" + s.seatId;
		var row = byId[key];
		return row && typeof row.fate === "string" ? row.fate : "alive";
	}
	return mirror[refOf(s)];
}
// 🚧 A seat counts once its character is MADE — its sheet applied, never
// merely named (the 100-turn walk, B15/B16: a persona-named guest still in
// the interview held the round, then was pulled into it with no class). A
// crawl that keeps no heroes (made before the interview) counts every named
// seat.
var heroes = progress.heroes && typeof progress.heroes === "object" ? progress.heroes : null;
var keepsHeroes = false;
if (heroes) for (var hk in heroes) { keepsHeroes = true; break; }
function userOfSeat(s) { return s.seatUserId != null ? s.seatUserId : (s.persona ? s.persona.userId : null); }
function made(s) {
	if (!keepsHeroes) return true;
	var u = userOfSeat(s);
	var h = u != null ? heroes["user:" + u] : null;
	return !!h && (h.made === true || (h.backstory !== undefined && String(h.name || "").trim() !== ""));
}
var named = ((doc.cast && doc.cast.sessionPersonas) || []).filter(function (s) {
	if (!s || s.removedAt) return false;
	var name = s.seatName || (s.persona && s.persona.name) || "";
	return String(name).trim() !== "" && made(s);
});
var seats = named.filter(function (s) {
	var fate = fateOf(s);
	return fate !== "dead" && fate !== "taken-out";
});
function hasDeclared(s) {
	var user = userOfSeat(s);
	if (user != null && declared.indexOf("user:" + user) >= 0) return true;
	if (s.persona && s.persona.id != null && declared.indexOf("character:" + s.persona.id) >= 0) return true;
	return declared.indexOf("player-seat:" + s.seatId) >= 0;
}
// 🚧 Everyone out of the fight (taken out, or dead with no new character
// yet) and a line said on Story: the round is played anyway, and the story
// says why they cannot act (P3-2, the walk's B15: such a line started
// nothing and said nothing).
var outButSpoke = seats.length === 0 && named.length > 0 && named.some(hasDeclared);
var ready = (seats.length > 0 && seats.every(hasDeclared)) || outButSpoke;
var talk = (Array.isArray(selection.voiceEntries) ? selection.voiceEntries : []).filter(function (e) {
	return e && e.ref === null && typeof e.channel === "string" && /^${PARLEY_CHANNEL}(:\\d+)?$/.test(e.channel);
});
var out = {};
for (var k in selection) out[k] = selection[k];
out.order = (ready ? [{ ref: null, via: "voice" }] : []).concat(talk.map(function (e) {
	return { ref: null, via: "voice", channel: e.channel };
}));
return out;
`.trim()

/**
 * The row the create lane seeds (`pipeline_scripts`): its kind, a name, the
 * body, and what it reads — `selection` (the kind's subject) and `session`.
 * @experimental
 */
export const DUNGEON_CRAWLER_ROUND_SCRIPT = Object.freeze({
	typeId: DUNGEON_CRAWLER_ROUND_SCRIPT_KIND,
	seedKey: 'core:script/dungeon-crawler-round',
	name: 'Dungeon Crawler round',
	source: DUNGEON_CRAWLER_ROUND_SCRIPT_SOURCE,
	varsIn: Object.freeze(['selection', 'session']),
	varsOut: Object.freeze(['selection']),
})
