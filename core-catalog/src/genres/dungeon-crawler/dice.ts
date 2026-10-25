/**
 * 🚧 Dungeon Crawler's **death's door and the table's line**
 * (PLAN-dungeon-crawler-2026-10-14, feature 6; since 2026-10-16 the checks
 * are the ruleset handler's, PLAN-rulesets §25, §30).
 *
 * The genre rolls no check of its own any more: a check the Planner asks for
 * is a delta (`hit`, `use`, `traverse`), and the session's ruleset rolls it
 * in the handler's `apply` (`core:task/ruleset-resolve@1`), seeded, with its
 * own degrees. What stays the genre's is its own field, the **fate**
 * (`core:slot/fate@1`), and the rule that decides it:
 *
 * **Death's door.** Every living seat the turn leaves at 0 health or less —
 * and ONLY such a seat (AUDIT A7: the Planner once named whom it liked, and a
 * healthy character rolled for their life) — rolls a bare die of the
 * session's ruleset against its **fall rule** (`core:function/at-zero-health@1`,
 * the reference the inlet's ruleset carries — `rulesetGistOf`; lane G3,
 * 2026-10-23, ★I), the door moved a step by the difficulty
 * (`DUNGEON_CRAWLER_DIFFICULTY_STEPS`, the genre's dial): at or over, it
 * **survives** on the rule's health; under, it is **taken out** on Gentle
 * and **dead** on Fair and Brutal. No death without a roll — at every
 * rigour; at `prose` the line shows no numbers. 🚧 A ruleset with no fall
 * rule (Freeform, Wherewithal) rolls nothing and assumes no die: the seat is
 * **taken out**, told in words (`fell: "words"`).
 *
 * 🚧 **Death saves** (2026-10-18, owner ruling ★7): when the session's fall
 * rule plays its saves (`playsSaves`: Vis Itineris's _At zero health: Death
 * saves_), a seat at 0 health rolls one bare die a round instead, by the
 * rule's numbers: at or over its target a pass, under it a failure, its
 * lowest natural face more failures, its highest back up at once. Enough
 * passes and they are **stable** (down until the party rests); enough
 * failures and they are dead (taken out on Gentle). Between rolls they lie
 * **dying**, the tally kept in the crawl's bookkeeping
 * (`progress.deathSaves`, `death.ts`), and a heal brings them back. The
 * numbers are the ruleset's (Lair rewrite D9, 2026-10-21), never the
 * genre's; what one roll decides is the fall rule's (`atZeroHealthOf`).
 *
 * A seeded `core:script:data/transform@1` row (`core:script/dungeon-crawler-door`)
 * the story turn runs after the handler's `apply` (`story.ts`). The sandbox's
 * `Math.random` is the run's seeded stream, so a run replays to the same roll.
 *
 * **The table's line**: one row on the 🚧 **table** channel, anchored to the
 * Narrator's row (PLAN-rulesets §30) — each of the handler's outcomes
 * (`⚄ …`), a check's with its **explain** (how the number was reached:
 * `<die> 12 + dex 3 = 15 vs 14`) at the end of its line; 🚧 each condition the
 * turn put on or took off someone ("Ann: <the condition>, 1 hour" — PLAN
 * §7: an added condition once landed in silence); then death's door (`☠ …`). The
 * table's alone: never in a prompt.
 *
 * Returns `{ deaths, line }`.
 */

import { DUNGEON_CRAWLER_STORY_PREAMBLE, storySeed } from './storyScripts.js'
import { DUNGEON_CRAWLER_DIFFICULTY_STEPS } from './fromRuleset.js'

/** @experimental */
export const DUNGEON_CRAWLER_DOOR_SCRIPT = storySeed(
	'core:script/dungeon-crawler-door',
	"Dungeon Crawler: death's door, and the table's line",
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
// The genre's dial: how many steps the difficulty moves the ruleset's door.
var STEPS = ${JSON.stringify(DUNGEON_CRAWLER_DIFFICULTY_STEPS)};
// 🚧 The session's rules' conditions as the table says them (S4), off the books.
var CONDITIONS = own(own(own(v.books).conditions).rows);
var b = own(v.books);
var applied = own(v.applied);
var facts = own(applied.facts);
// The handler's rigour, else the session's (a round that applied no change).
var rig0 = text(facts.rigour) || text(b.rulesetRigour);
var counted = rig0 === "mechanics" || rig0 === "scripts";
// The plan as the plan step checked it (AUDIT C7: never checked again).
var plan = own(v.turn).plan || null;
var seats = Array.isArray(b.seats) ? b.seats : [];
var after = Object.keys(own(v.after)).length ? own(v.after) : own(v.state);
var seatsNow = seatsOf(doc, after);
function seatFor(list0, ref) {
	var r = text(ref);
	for (var i = 0; i < list0.length; i++) if (list0[i].ref === r) return list0[i];
	var lower = r.toLowerCase();
	for (var j = 0; j < list0.length; j++) if (text(list0[j].name).toLowerCase() === lower) return list0[j];
	return null;
}
// 🚧 The session's fall rule (★I), as the books read it off the inlet: its
// die, its door, its saves — or none, and then nothing is rolled.
var FALL = b.fall && typeof b.fall === "object" ? b.fall : null;
var SIDES = FALL ? num(FALL.sides, 0) : 0;
function roll() { return 1 + Math.floor(Math.random() * SIDES); }

var deaths = [];
if (b.fresh) {
	// Who stands at death's door: every seat alive when the turn began that
	// the turn's changes left at 0 health or less — and nobody else.
	var difficulty = STEPS[own(b.rules).difficulty] !== undefined ? own(b.rules).difficulty : "fair";
	var down = difficulty === "gentle" ? "taken-out" : "dead";
	for (var y = 0; y < seats.length; y++) {
		// 🚧 A seat lying dying rolls its death save again (Q3-8: its fate says so now).
		if (seats[y].fate && seats[y].fate !== "alive" && seats[y].fate !== "dying") continue;
		// Not in the round: a character not made yet never stands at the door.
		if (!seatMade(progressOf(core), seats[y])) continue;
		var now = seatFor(seatsNow, seats[y].ref);
		if (!now || now.hp === null || now.hp > 0) continue;
		if (!FALL) {
			// 🚧 No fall rule (a ruleset that keeps none): no die is assumed —
			// the seat is down and out of the fight, alive, told in words.
			deaths.push({ seat: seats[y].ref, name: seats[y].name, user: seats[y].user, words: true, outcome: "taken-out" });
			continue;
		}
		var dr = roll();
		// 🚧 One death save this round, on the tally the rounds before kept —
		// else the one roll at the door, moved by the difficulty's steps.
		var tally = b.deathSaves ? own(own(progressOf(core).deathSaves)[seats[y].ref]) : null;
		var fell = atZeroHealthOf(FALL, dr, tally, b.deathSaves === true, STEPS[difficulty]);
		var outcome = fell.outcome === "down" ? down : fell.outcome;
		var death = { seat: seats[y].ref, name: seats[y].name, user: seats[y].user, roll: dr, dc: fell.target, outcome: outcome };
		if (fell.outcome === "survives") death.upOn = num(fell.upOn, 1);
		if (fell.saves) { death.saves = true; death.passed = fell.passed; death.failed = fell.failed; }
		deaths.push(death);
	}
}

// This turn's numbers only — a roll, or a change the deltas made — never the
// whole sheet's derivations, which the handler explains on every pass.
function thisTurn(line) {
	var terms = Array.isArray(line.terms) ? line.terms : [];
	for (var t = 0; t < terms.length; t++) {
		var o = own(own(terms[t]).origin);
		if (o.kind === "roll" || o.ref === "delta") return true;
	}
	return false;
}
var ex = Array.isArray(applied.explain) ? applied.explain : [];
var explainOf = {};
for (var e = 0; e < ex.length; e++) if (ex[e] && text(ex[e].text) && thisTurn(ex[e])) explainOf[text(ex[e].target)] = text(ex[e].text);
// 🚧 The fold's head is what matters most (P4-7, the 100-turn walk #23):
// death's door first, then the rolls, then everything else — so a fold
// never opens on "Pip no longer has Level 1" while a death waits inside.
var said = [], checkLines = [], deathLines = [], placeLines = [];
var outcomes = Array.isArray(applied.outcomes) ? applied.outcomes : [];
// 🚧 A way out the turn wrote, as a player may read it (P3-8, owner ruling
// 2026-10-18): no difficulty and no trap shows before a check is made on it
// — "Door to The Vault, locked", never "(DC 15), trapped — needle (DC 12)".
// The handler's own line for the piece is rewritten from the piece itself.
var waysWritten = {};
var plannedAll = plan && Array.isArray(plan.deltas) ? plan.deltas : [];
for (var wd = 0; wd < plannedAll.length; wd++) {
	var wdl = plannedAll[wd];
	if (wdl.repertoire !== "exits" || wdl.op !== "add" || !wdl.piece || typeof wdl.piece !== "object") continue;
	waysWritten[text(wdl.owner) + "|" + text(wdl.piece.name).toLowerCase()] = wdl.piece;
}
// 🚧 A spell slot spent (P4-7): the turn script rewrites the level's piece
// with one more used — a remove and an add the handler reports as "no longer
// has Level 1" and "gains Level 1". The table says what happened instead:
// "Pip: Level 1 slots 2 → 1".
var slotSpends = {}, slotOrder = [];
for (var sd = 0; sd < plannedAll.length; sd++) {
	var sdl = plannedAll[sd];
	if (sdl.repertoire !== "spell-slots" || sdl.op !== "add" || !sdl.piece || typeof sdl.piece !== "object") continue;
	var sp0 = sdl.piece, lv0 = num(sp0.level, 0), mx0 = num(sp0.max, 0), us0 = num(sp0.used, 0);
	if (lv0 <= 0 || mx0 <= 0) continue;
	var sk = text(sdl.owner) + "|level " + lv0;
	if (!slotSpends[sk]) { slotSpends[sk] = { owner: text(sdl.owner), level: lv0, before: mx0 - us0 + 1, after: mx0 - us0 }; slotOrder.push(sk); }
	else { slotSpends[sk].after = mx0 - us0; }
}
function slotSpendLine(oc) {
	if (oc.check) return false;
	var t0 = text(oc.text).toLowerCase();
	for (var sk0 in slotSpends) {
		var s0 = slotSpends[sk0];
		if (text(oc.owner) !== s0.owner) continue;
		if (t0.indexOf(" no longer has level " + s0.level) >= 0 || t0.indexOf(" gains level " + s0.level) >= 0) return true;
	}
	return false;
}
// 🚧 The ways this turn tried to cross (Q2-1), and which a landed check opens.
var travD = Array.isArray(own(v.turn).traversals) ? own(v.turn).traversals : [];
function opensWay(oc) {
	var five = text(own(oc.check).five);
	if (five !== "success" && five !== "crit" && five !== "partial") return "";
	for (var tw0 = 0; tw0 < travD.length; tw0++) {
		var tw1 = own(travD[tw0]), wn = text(own(tw1.way).name);
		if (text(tw1.place) !== text(oc.owner) || !wn || text(oc.text).toLowerCase().indexOf(wn.toLowerCase()) < 0) continue;
		var st2 = text(own(tw1.way).state).toLowerCase();
		if (st2 === "locked" || num(own(tw1.way).lockDc, 0) > 0) return wn;
	}
	return "";
}
var placeNames = {};
var placesD = Array.isArray(b.places) ? b.places : [];
for (var pn0 = 0; pn0 < placesD.length; pn0++) if (placesD[pn0].id !== null) placeNames["location:" + placesD[pn0].id] = placesD[pn0].name;
function playerWayLine(owner, txt) {
	if (!/^location:/.test(owner)) return txt;
	for (var key in waysWritten) {
		if (key.indexOf(owner + "|") !== 0) continue;
		var way = waysWritten[key];
		if (txt.toLowerCase().indexOf(text(way.name).toLowerCase()) < 0) continue;
		var st0 = text(way.state).toLowerCase();
		return (placeNames[owner] || "A place") + ": " + text(way.name) + (st0 && st0 !== "open" && st0 !== "hidden" ? ", " + st0 : "");
	}
	// Any other line about a place keeps no number and no trap.
	return txt.replace(/ \\(DC \\d+\\)/g, "").replace(/,? trapped( \\u2014 [^,]*)?/g, "");
}
for (var l = 0; l < outcomes.length; l++) {
	var oc = own(outcomes[l]);
	if (!text(oc.text)) continue;
	if (slotSpendLine(oc)) continue;
	// A check shows how its number was reached, at the end of its line
	// (\`<die> 12 + dex 3 = 15 vs 14\`) — the table's, never the story's.
	// 🚧 A traverse is rolled by its actor (Q2-1): its working is filed under them.
	var how = !counted ? "" : oc.check ? explainOf[(text(own(oc.check).actor) || text(oc.owner)) + "." + text(own(oc.check).selector)] : text(oc.explainKey) ? explainOf[text(oc.explainKey)] || "" : "";
	// At \`prose\` no die: the line says what happened in words (walk 6, 2026-10-17).
	var line0 = oc.check ? text(oc.text) : playerWayLine(text(oc.owner), text(oc.text));
	// 🚧 A place's own line — a way written or rewritten — goes last (Q3-1):
	// the fold opens on what happened to people, never on a door.
	(oc.check ? checkLines : /^location:/.test(text(oc.owner)) ? placeLines : said).push((counted ? "⚄ " : "") + line0 + (how ? " — " + how : ""));
	// 🚧 A way crossed with a check that landed now stands open (Q2-1): said
	// in one line under its roll, never the rule's text.
	if (oc.check && opensWay(oc)) checkLines.push(opensWay(oc) + " now stands open.");
}
for (var so = 0; so < slotOrder.length; so++) {
	var ss = slotSpends[slotOrder[so]];
	var slotWho = seatFor(seats, ss.owner);
	said.push((counted ? "⚄ " : "") + (slotWho ? slotWho.name : ss.owner) + ": Level " + ss.level + " slots " + ss.before + " → " + ss.after);
}
// 🚧 A condition put on or taken off (PLAN §7): said in the table's words,
// unless the handler refused it.
var refused = {};
var rj = Array.isArray(applied.rejected) ? applied.rejected : [];
for (var q = 0; q < rj.length; q++) { var rd = own(own(rj[q]).delta); refused[text(rd.owner) + "|" + text(rd.piece).toLowerCase()] = true; }
var planned = plan && Array.isArray(plan.deltas) ? plan.deltas : [];
for (var c = 0; c < planned.length; c++) {
	var cd = planned[c];
	if (cd.repertoire !== "conditions" || (cd.op !== "add" && cd.op !== "remove")) continue;
	var pieceName = typeof cd.piece === "string" ? cd.piece : text(own(cd.piece).name);
	if (!pieceName || refused[text(cd.owner) + "|" + pieceName.toLowerCase()]) continue;
	var row0 = CONDITIONS[pieceName] || CONDITIONS[pieceName.toLowerCase()] || { name: pieceName, lasts: "" };
	var whoSeat = seatFor(seats, cd.owner);
	var whoName = whoSeat ? whoSeat.name : text(cd.owner);
	said.push(cd.op === "add" ? whoName + ": " + row0.name + (row0.lasts ? ", " + row0.lasts : "") : whoName + ": " + row0.name + " ends");
}
var WORD = { survives: "survives", "taken-out": "taken out", dead: "dead", stable: "stable", dying: "still dying" };
for (var m = 0; m < deaths.length; m++) {
	var dd = deaths[m];
	if (dd.words) {
		// 🚧 No fall rule: nothing rolled, nothing numbered.
		deathLines.push("☠ " + dd.name + " at death's door — " + WORD[dd.outcome]);
		continue;
	}
	if (dd.saves) {
		// 🚧 A death save (★7): the roll, and the tally where numbers show.
		deathLines.push("☠ " + dd.name + " at death's door" + (counted ? ": death save d" + SIDES + " " + dd.roll + " vs " + dd.dc : "") + " — " +
			(dd.outcome === "survives" ? "back up on " + dd.upOn + " health" : WORD[dd.outcome]) +
			(counted && dd.outcome !== "survives" ? " (" + deathSaveWords(dd.passed, dd.failed) + ")" : ""));
		continue;
	}
	deathLines.push("☠ " + dd.name + " at death's door" + (counted ? ": d" + SIDES + " " + dd.roll + " vs DC " + dd.dc : "") + " — " + WORD[dd.outcome]);
}
said = deathLines.concat(checkLines, said, placeLines);
// 🚧 Every change the turn proposed that did not happen, one line each, in
// the table's words (P1-2, owner ruling 2026-10-18: a "Not changed: …" line
// every player sees — a proposal also waits on the owner's review list).
// The genre's own refusals first (\`turn.refused\`: an overkill with nothing
// left, a spell with no slot), then the handler's. A refused condition the
// table never announced is still one: the Narrator must not tell it.
var names0 = {};
for (var nm = 0; nm < seats.length; nm++) names0[seats[nm].ref] = seats[nm].name;
var comps0 = companionsOf(doc);
for (var nc0 = 0; nc0 < comps0.length; nc0++) names0[comps0[nc0].ref] = comps0[nc0].name;
for (var np0 in placeNames) names0[np0] = placeNames[np0];
var refusedWords = [];
var own0 = Array.isArray(own(v.turn).refused) ? own(v.turn).refused : [];
for (var r0 = 0; r0 < own0.length; r0++) refusedWords.push(refusalWords(own0[r0], names0));
for (var r1 = 0; r1 < rj.length; r1++) refusedWords.push(refusalWords(rj[r1], names0));
for (var r2 = 0; r2 < refusedWords.length; r2++) said.push(refusedWords[r2]);
return { deaths: deaths, line: said.length ? said.join("\\n") : null, refused: refusedWords.length ? refusedWords : null };
`,
)
