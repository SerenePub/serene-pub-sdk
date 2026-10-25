/**
 * 🚧 Dungeon Crawler's **death** (PLAN-dungeon-crawler-2026-10-14, feature 13,
 * D9, D12): what the story turn's books do with each death's-door roll
 * (`dice.ts` rolls it).
 *
 *  - **survives** — back up on the health the session's fall rule says
 *    (`core:function/at-zero-health@1`, read off the inlet; ★I), and the
 *    Narrator is told they pulled through;
 *  - **taken out** (Gentle — 🚧 or any table whose ruleset keeps no fall
 *    rule, where nothing is rolled) — the seat's `fate` is `taken-out`:
 *    down, alive, out of the fight until a Rest brings them back;
 *  - **dead** (Fair, Brutal) — the seat's `fate` is `dead`, a **cairn** is
 *    raised in the session's own lorebook (a `core:entry/history` entry: the
 *    epitaph, where they fell — `lore.ts`), and the player's Planner lane
 *    gets a line with *Make a new character* — a form that re-enters the
 *    character half of the interview (`referent: new-character`). The
 *    newcomer is owed an **arrival** (`progress.arrivals`: who, the fallen's
 *    name, where, two rounds left), which the next Planner calls read until
 *    it is spent. 🚧 The form is answered only while the seat's `fate` row
 *    says dead (AUDIT A8, the interview script): a retake that undid the
 *    death leaves the line in the lane, and its press is refused.
 *
 * 🚧 **Death saves** (owner ruling ★7, 2026-10-18; `dice.ts` rolls them):
 * a seat still **dying** keeps 0 health and its tally in
 * `progress.deathSaves` (`{ [ref]: { passed, failed } }`), and the Narrator
 * hears that a heal would bring them back; **stable** is taken out (down
 * until a Rest); a tally whose seat is up again, or out, is dropped.
 *
 * Why a `fate` slot rather than the seat's `removed_at`: the seat must stay
 * (it is the player's place at the table and the new character's), and a
 * slot is state — anchored to the turn's row, so retaking the turn undoes
 * the death with everything else it wrote; the cairn is an entry anchored to
 * the same row, and goes with it.
 *
 * Not a script of its own: the fragment below runs inside the story turn's
 * books (`core:script/dungeon-crawler-ledger`, `story.ts`), over its
 * variables — `progress`, `changes`, `told`, `laneLines`, `fallenNew`, `d`
 * (death's door), `doc` (the session), `b` (the books), `seatFor`,
 * `seatsNow` (the seats as the turn's changes left them).
 */

import { DUNGEON_CRAWLER_INTERVIEW_ACTION, DUNGEON_CRAWLER_QUESTIONS } from './scripts.js'

/**
 * The fate slot's values, as the slot declares them — 🚧 `dying` while death
 * saves run (PLAN-dc-after-walk2 Q3-8). @experimental
 */
export const DUNGEON_CRAWLER_FATES = Object.freeze(['alive', 'dying', 'taken-out', 'dead'] as const)

/** How many rounds a newcomer's arrival is owed for. @experimental */
export const DUNGEON_CRAWLER_ARRIVAL_ROUNDS = 2

/** @internal */
export const DUNGEON_CRAWLER_DEATH_JS = `
// ── Death's door, applied (death.ts) ──
var INTERVIEW_ACTION = ${JSON.stringify(DUNGEON_CRAWLER_INTERVIEW_ACTION)};
var NEW_CHARACTER = ${JSON.stringify(DUNGEON_CRAWLER_QUESTIONS.newCharacter)};
// The ruleset's numbers (Lair rewrite D9; its fall rule since 2026-10-23,
// ★I): what a survivor is back up on rides on the roll (\`dd.upOn\`), and the
// death saves' rule in words is read off the session's fall rule.
var SAVES_RULE = b.fall ? deathSavesRule(b.fall, false) : "";
var deathsList = Array.isArray(d.deaths) ? d.deaths : [];
// An owed arrival counts down only once the newcomer is made (their hero
// carries a new name): the Planner brings them in within its rounds. 🚧 One
// whose death a retake undid (AUDIT A8: the fallen's seat alive again by its
// fate row, still under the fallen's name) is owed to nobody, and goes.
if (plan && Array.isArray(progress.arrivals)) {
	var owed = [];
	var heroesNow = own(progress.heroes);
	for (var ai = 0; ai < progress.arrivals.length; ai++) {
		var a = own(progress.arrivals[ai]);
		var made = text(own(heroesNow[a.who]).name);
		var undone = false;
		for (var us = 0; us < seatsNow.length; us++)
			if ("user:" + seatsNow[us].user === a.who && seatsNow[us].fate === "alive" && seatsNow[us].name === text(a.fallen)) undone = true;
		if (undone) continue;
		if (made && made !== text(a.fallen)) a.left = num(a.left, 0) - 1;
		if (num(a.left, 0) > 0) owed.push(a);
	}
	progress.arrivals = owed;
}
// 🚧 The death-save tallies (★7): one whose seat is up again, out of the
// round, or gone is dropped; this turn's saves below write theirs.
var saveBook = own(copy(progress.deathSaves));
for (var sk in saveBook) {
	var sNow = null;
	for (var sn0 = 0; sn0 < seatsNow.length; sn0++) if (seatsNow[sn0].ref === sk) sNow = seatsNow[sn0];
	if (!sNow || (sNow.fate !== "alive" && sNow.fate !== "dying") || (sNow.hp !== null && sNow.hp > 0)) delete saveBook[sk];
}
// 🚧 The sheet says it (PLAN-dc-after-walk2 Q3-8, the walk's N15: Fate read
// Alive while death saves ran): a seat lies **dying** — its fate, and its
// tally in words beside it — until it is up, stable or gone. Only at a table
// keeping death saves, where the tally's stat is tracked.
var doorSeats = {};
for (var dq = 0; dq < deathsList.length; dq++) doorSeats[deathsList[dq].seat] = true;
function tallyOut(ref, words, had) {
	if (!b.deathSaves) return;
	if (words === text(had)) return;
	changes.push({ owner: ref, slot: SL.deathSaves, value: words });
}
// Healed while dying (a potion, a spell): up again — alive, the tally gone.
for (var sh0 = 0; sh0 < seatsNow.length; sh0++) {
	var up = seatsNow[sh0];
	if (up.fate !== "dying" || doorSeats[up.ref] || up.hp === null || up.hp <= 0) continue;
	changes.push({ owner: up.ref, slot: SL.fate, value: "alive" });
	tallyOut(up.ref, "", up.tally);
}
for (var di = 0; di < deathsList.length; di++) {
	var dd = deathsList[di];
	var ds = seatFor(dd.seat) || { name: dd.name, ref: dd.seat, user: dd.user, level: 1 };
	var wasDying = ds.fate === "dying";
	if (dd.saves) {
		if (dd.outcome === "dying") saveBook[dd.seat] = { passed: num(dd.passed, 0), failed: num(dd.failed, 0) };
		else delete saveBook[dd.seat];
	}
	// One change per (owner, slot) lands — the first written — so death's
	// door replaces whatever the turn set this seat's health to.
	var others = [];
	for (var oc = 0; oc < changes.length; oc++) if (!(changes[oc].owner === dd.seat && changes[oc].slot === SL.hp)) others.push(changes[oc]);
	changes = others;
	if (dd.outcome === "survives") {
		changes.push({ owner: dd.seat, slot: SL.hp, value: num(dd.upOn, 1) });
		if (wasDying) changes.push({ owner: dd.seat, slot: SL.fate, value: "alive" });
		if (dd.saves) tallyOut(dd.seat, "", ds.tally);
		told.push(ds.name + " was at death's door and pulled through, on their last breath.");
		continue;
	}
	changes.push({ owner: dd.seat, slot: SL.hp, value: 0 });
	if (dd.outcome === "dying") {
		if (!wasDying) changes.push({ owner: dd.seat, slot: SL.fate, value: "dying" });
		tallyOut(dd.seat, deathSaveWords(num(dd.passed, 0), num(dd.failed, 0)), ds.tally);
		told.push(ds.name + " lies dying at death's door, " + deathSaveWords(num(dd.passed, 0), num(dd.failed, 0)) + " so far: " + SAVES_RULE + " — and healing now brings them back. They can do nothing until then. Tell it with care.");
		continue;
	}
	if (dd.saves) tallyOut(dd.seat, "", ds.tally);
	if (dd.outcome === "stable") {
		changes.push({ owner: dd.seat, slot: SL.fate, value: "taken-out" });
		told.push(ds.name + " is stable: alive but senseless, out of the fight until the party rests. Tell it with care.");
		continue;
	}
	changes.push({ owner: dd.seat, slot: SL.fate, value: dd.outcome });
	if (dd.outcome === "taken-out") {
		told.push(ds.name + (dd.words ? " fell" : " is taken out") + ": down and out of the fight, alive, of no use to the party until they rest. Tell it with care.");
		continue;
	}
	var where = text(ds.location);
	fallenNew.push({
		name: ds.name,
		content: "Here lies " + ds.name + ((ds["class"] ? ", " + ds["class"] : "") + ", level " + num(ds.level, 1)) + ", who fell" + (where ? " in " + where : "") + "."
	});
	told.push(ds.name + " is dead: the dice decided it at death's door. Show the death plainly and with weight; nothing undoes it.");
	if (ds.user != null) {
		var arrivals = Array.isArray(progress.arrivals) ? progress.arrivals.slice() : [];
		arrivals.push({ who: "user:" + ds.user, fallen: ds.name, where: where, left: ${DUNGEON_CRAWLER_ARRIVAL_ROUNDS} });
		progress.arrivals = arrivals;
		var deadLane = laneOf(doc, ds.user);
		if (deadLane && b.fresh) laneLines.push({
			lane: deadLane,
			text: ds.name + " has fallen" + (where ? " in " + where : "") + ". I'm sorry. Their cairn stands in the world now, and the story goes on without them. When you're ready, make a new character: they will arrive near where " + ds.name + " fell, within a couple of rounds.",
			blocks: [{
				kind: "choices", addressee: "user:" + ds.user, referent: NEW_CHARACTER, question: "Make a new character?",
				actions: [{ fn: "answer", action: INTERVIEW_ACTION, choice: NEW_CHARACTER, label: "Make a new character" }]
			}]
		});
	}
}
var savesLeft = false;
for (var sl0 in saveBook) savesLeft = true;
if (savesLeft) progress.deathSaves = saveBook;
else if (progress.deathSaves) delete progress.deathSaves;
`
