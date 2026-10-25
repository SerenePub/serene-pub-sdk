/**
 * 🚧 What the story turn's scripts share (PLAN-dungeon-crawler-2026-10-14,
 * features 5–14): the genre's ONE preamble (`preamble.ts`, AUDIT C7) and the
 * story turn's own rules on top of it — the round's declarations, who is out
 * of it, the clock, the leads and the Planner's answer checked — so
 * `story.ts`, `dice.ts`, `rest.ts` and `goal.ts` read one document one way.
 * No imports from those files (they import this), so no cycle.
 */

import { DUNGEON_CRAWLER_LEAD_WORDS } from './names.js'
import { DUNGEON_CRAWLER_NOT_FOR_DELTAS, DUNGEON_CRAWLER_PREAMBLE, seedScript } from './preamble.js'
export { DUNGEON_CRAWLER_NOT_FOR_DELTAS } from './preamble.js'
import { DUNGEON_CRAWLER_EXITS_JS } from './lore.js'

export { DUNGEON_CRAWLER_LEAD_WORDS }

/** A seeded data-transform row, reading and returning `value`. @internal */
export const storySeed = seedScript

/**
 * 🚧 How many round summaries the Planner's crib keeps (feature 5): the
 * newest forty lines of the Journal folio (`travelogue`), which already
 * holds one line a round — the crib reads them, it keeps no copy.
 * @experimental
 */
export const DUNGEON_CRAWLER_CRIB_ROUNDS = 40


/**
 * 🚧 The ops a delta may carry — the handler's (`set`, `add`, `spend`,
 * `remove`) and its checks (`hit`, `use`, `traverse`: the model asks for a
 * check, the handler rolls it). @internal
 */
export const DUNGEON_CRAWLER_DELTA_OPS = Object.freeze(['add', 'spend', 'set', 'remove', 'hit', 'use', 'traverse'] as const)

/**
 * The story turn's rules over the preamble: `CRIB_ROUNDS` (⏳ `HP_PER_LEVEL`
 * retired 2026-10-23: what a level brings is the session's rules', the
 * books' `levelHp`);
 * `sinceReply(msgs)` — this round's declarations; `fatesAfter` /
 * `keepFates` — who is out of the round; the clock (`addMinutes`,
 * `clockLabel`); `hooks` — the open leads; the exit model
 * (`DUNGEON_CRAWLER_EXITS_JS`); and `checkPlan(raw)` — the Planner's answer
 * normalised, or `null` when it is unusable (no `narratorBrief`), its deltas
 * read from the session's rules' grammar (`asDelta`, S1) into the handler's.
 * The JSON schema is trusted for every enum (AUDIT C7): no op, attribute or
 * entry type is re-validated here. @internal
 */
export const DUNGEON_CRAWLER_STORY_PREAMBLE = `${DUNGEON_CRAWLER_PREAMBLE}
${DUNGEON_CRAWLER_EXITS_JS}
var CRIB_ROUNDS = ${DUNGEON_CRAWLER_CRIB_ROUNDS};
// This round's declarations — DUNGEON_CRAWLER_DECLARED_RULE (names.ts), read
// exactly as the host reads it for the round script (\`selection.sentSinceReply\`):
// the person lines after Story's newest visible reply. Hidden rows and
// narration (\`isNarratorResponse\`, a side note) neither end the window nor
// count in it. Oldest first.
function sinceReply(msgs) {
	var out = [];
	for (var i = (Array.isArray(msgs) ? msgs.length : 0) - 1; i >= 0; i--) {
		var m = msgs[i];
		if (!m || m.isHidden || m.isNarratorResponse) continue;
		if (m.role !== "user") break;
		out.unshift(m);
	}
	return out;
}
// The seats out of the round: every seat whose fate is not \`alive\` once
// \`changes\` land — the dead, and the taken out (down until a Rest) — by ref,
// read off the state rows (\`seats\`, \`seatsOf\`) and this turn's changes.
function fatesAfter(seats, changes) {
	var out = {};
	for (var i = 0; i < seats.length; i++) if (seats[i].fate && seats[i].fate !== "alive") out[seats[i].ref] = seats[i].fate;
	for (var j = 0; j < changes.length; j++) {
		var c = changes[j];
		if (!c || c.slot !== SL.fate) continue;
		if (c.value === "alive") delete out[c.owner]; else out[c.owner] = c.value;
	}
	return out;
}
// ⏳ The round script's mirror of \`fatesAfter\` (\`progress.fates\`), until its
// select point is handed the state and reads the fate rows itself
// (\`roundScript.ts\`). Rewritten from the state every turn and every Rest, so
// a retake that undid a death is righted by the next one; never an empty key.
function keepFates(progress, seats, changes) {
	var f = fatesAfter(seats, changes);
	for (var k in f) { progress.fates = f; return; }
	if (progress.fates) progress.fates = f;
}
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function pad(n) { return n < 10 ? "0" + n : String(n); }
function addMinutes(clock, minutes) {
	var m = /^(-?\\d+)-(\\d{1,2})-(\\d{1,2})(?:[ T](\\d{1,2}):(\\d{2}))?$/.exec(text(clock));
	if (!m || !(minutes > 0)) return text(clock) || null;
	var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
	var t = (m[4] ? Number(m[4]) : 0) * 60 + (m[5] ? Number(m[5]) : 0) + Math.round(minutes);
	d += Math.floor(t / 1440);
	t = t % 1440;
	while (d > MONTH_DAYS[(mo - 1) % 12]) { d -= MONTH_DAYS[(mo - 1) % 12]; mo++; if (mo > 12) { mo = 1; y++; } }
	return y + "-" + pad(mo) + "-" + pad(d) + " " + pad(Math.floor(t / 60)) + ":" + pad(t % 60);
}
// The crawl's clock as the table reads it: the day counted from the
// adventure's first (\`DUNGEON_CRAWLER_EPOCH\` is day 1), and the time —
// "Day 3, 16:30". Stored as the story-time line; said this way.
function clockLabel(clock) {
	var m = /^(-?\\d+)-(\\d{1,2})-(\\d{1,2})(?:[ T](\\d{1,2}):(\\d{2}))?$/.exec(text(clock));
	if (!m) return text(clock);
	var y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]) + (y - 1) * 365;
	for (var i = 0; i < mo - 1; i++) day += MONTH_DAYS[i % 12];
	return "Day " + day + (m[4] ? ", " + pad(Number(m[4])) + ":" + m[5] : "");
}
// The open leads, as hooks: a lead is a short hook the party could follow
// ("Find the scepter's second fragment"), never what happened. Anything over
// the word cap (DUNGEON_CRAWLER_LEAD_WORDS, the number the prompt says), or
// the round's own summary, is not a lead and is dropped.
function hooks(v0, summary) {
	var said = text(summary).toLowerCase();
	var out = [];
	var all = list(v0, 6);
	for (var i = 0; i < all.length; i++) {
		var lead = all[i];
		if (lead.split(/\\s+/).length > ${DUNGEON_CRAWLER_LEAD_WORDS}) continue;
		if (said && lead.toLowerCase() === said) continue;
		out.push(lead);
	}
	return out;
}
function checkPlan(raw) {
	if (Array.isArray(raw)) {
		for (var a = 0; a < raw.length; a++) { var p = checkPlan(raw[a]); if (p) return p; }
		return null;
	}
	if (raw && typeof raw === "object" && raw.narratorBrief === undefined) {
		if (raw.json !== undefined) return checkPlan(raw.json);
		if (raw.main !== undefined) return checkPlan(raw.main);
	}
	if (!raw || typeof raw !== "object") return null;
	var brief = text(raw.narratorBrief);
	if (!brief) return null;
	// The deltas, in the handler's shape (core:task/ruleset-resolve@1): what
	// the model proposes, never a total (\`deltaOf\`, the preamble's).
	var deltas = [];
	var rd = Array.isArray(raw.deltas) ? raw.deltas : [];
	for (var i = 0; i < rd.length && deltas.length < 16; i++) { var d = deltaOf(asDelta(rd[i])); if (d) deltas.push(d); }
	var w = own(raw.world);
	var npcs = [];
	var rn = Array.isArray(w.npcs) ? w.npcs : [];
	for (var n = 0; n < rn.length && npcs.length < 6; n++) {
		var npc = own(rn[n]);
		if (text(npc.name)) npcs.push({ name: text(npc.name), description: text(npc.description), mood: text(npc.mood) });
	}
	var secrets = [];
	var rs = Array.isArray(raw.secrets) ? raw.secrets : [];
	for (var s = 0; s < rs.length && secrets.length < 8; s++) {
		var sec = own(rs[s]);
		if (text(sec.seat) && text(sec.text)) secrets.push({ seat: text(sec.seat), text: text(sec.text) });
	}
	return {
		deltas: deltas,
		world: { rooms: roomsOf(w.rooms, 6), npcs: npcs, leads: hooks(w.leads, raw.roundSummary), goalProgress: text(w.goalProgress) || "none", notes: text(w.notes) },
		clock: { minutes: clamp(Math.round(num(raw.clock && raw.clock.minutes, 10)), 0, 4320) },
		narratorBrief: brief, roundSummary: text(raw.roundSummary), secrets: secrets
	};
}
`
