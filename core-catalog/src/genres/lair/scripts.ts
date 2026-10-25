/**
 * 🚧 The Lair's script steps (rewrite, 2026-10-21): what the graph language
 * cannot say on its own — which attempts are risky at this table, the roll
 * forms and dice blocks, who of the party a person plays, a room draft's
 * ways out as links — as `core:script:data/transform@1` rows a
 * `core:task/run-script@1` step runs, seeded from `CORE_SCRIPTS` and named by
 * seed key in each spec's author preset (the Dungeon Crawler's pattern).
 *
 * Each returns ONE document; a spec reads its parts with
 * `core:script/read-path` (`jsonPart`) or `join-text@1`'s `path` (`textPart`)
 * and branches on the rest at a junction. A part that is absent is `null`,
 * never an empty list a junction would take as present. Plain ES5.
 *
 * **What the rules decide** is the inlet's `ruleset` alone (S4, 2026-10-23):
 * the row the host reads off the session's ruleset (`lairRulesRow` — its
 * checks, difficulties, usual difficulty, ways and outcome words) beside its
 * id and rigour. No table is baked in: core's rulesets, a plugin's and one
 * made on the pub are read alike, and a ruleset the host carries no row for
 * decides nothing here — the risky moment is told in words.
 */

import { seedScript, type CoreScriptSeed } from '../../shared/scriptSeed.js'

/**
 * The Lair scripts' one preamble: the readers (`own`, `text`, `num`), the
 * inlet's rules (`rulesOf`), the people the settings document seats
 * (`peopleOf` — `{ ref, name, plays }`, a person's seat `plays`), the name
 * rule a delver is found by, and the check and band a word names.
 */
const LAIR_PREAMBLE = () => `
var v = value || {};
function own(o) { var out = {}; if (o && typeof o === "object" && !Array.isArray(o)) for (var k in o) out[k] = o[k]; return out; }
function text(x) { return typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : ""; }
function num(x, d) { var n = Number(x); return x !== null && x !== "" && isFinite(n) ? n : d; }
function list(x) { return Array.isArray(x) ? x : []; }
// The session's ruleset as the scripts read it: what the inlet carries —
// its rigour, and the row the host read off its declaration.
function rulesOf(ruleset) {
	var r = own(ruleset);
	return { id: text(r.id), rigour: text(r.rigour) || "prose", checks: list(r.checks), bands: list(r.bands), band: text(r.band), dice: !!r.dice, methods: list(r.methods), outcomes: list(r.outcomes) };
}
// The ruleset's own word for how a check came out: by its outcome id, else
// by its step on the five; empty when it names none.
function outcomeWord(rules, c) {
	var os = rules.outcomes, id = text(c.band), five = text(c.five);
	for (var i = 0; i < os.length; i++) if (id && text(own(os[i]).id) === id) return text(own(os[i]).label);
	for (var j = 0; j < os.length; j++) if (five && text(own(os[j]).five) === five) return text(own(os[j]).label);
	return "";
}
// Why a roll form cannot be put, politely: rules that decide nothing, or
// rules that decide checks with no difficulty to pick (a pool, a spend).
function noRollWords(rules) {
	var ms = list(rules.methods);
	for (var i = 0; i < ms.length; i++) if (text(ms[i]) && text(ms[i]) !== "none") return "This table's rules decide checks without a difficulty to pick, so there is no roll to call for: tell it in words.";
	return "This table's rules roll nothing: tell it in words.";
}
// An outcome block (the handler's, any check method) as the row's line:
// what was checked, how it was decided, how it went.
function outcomeLine(b) {
	var m = text(b.method) || "die-target", how = text(b.outcome).replace(/[.!]+$/, "") || "It is done";
	var vs = typeof b.against === "number" ? " against " + b.against : "";
	var said = "";
	if (m === "dice-pool" && b.pool) said = b.pool.successes + (b.pool.successes === 1 ? " success" : " successes") + " on " + b.pool.size + (b.pool.size === 1 ? " die" : " dice");
	else if (m === "card-draw") {
		var cs = list(b.cards), names = [];
		for (var k = 0; k < cs.length; k++) names.push(text(own(cs[k]).label));
		said = (names.length ? "drew " + names.join(", ") + ", " : "") + (typeof b.rolled === "number" ? b.rolled : "") + vs;
	} else if (m === "compare") said = (typeof b.rolled === "number" ? String(b.rolled) : "") + (b.compare && text(own(b.compare).versus) ? " against " + text(own(b.compare).versus) + (typeof b.against === "number" ? " (" + b.against + ")" : "") : vs);
	else if (m === "bid") said = typeof b.rolled === "number" ? "spent " + b.rolled : "";
	else if (m !== "none") said = (typeof b.rolled === "number" ? String(b.rolled) : "") + vs;
	return text(b.stat) + ": " + (said ? said + ". " : "") + how + ".";
}
// A name compared as a person reads it: case, spacing and a leading article aside.
function nameKey(x) { return text(x).toLowerCase().replace(/^(the|a|an)\\s+/, "").replace(/\\s+/g, " "); }
// Everyone seated and switched on: { ref, name, plays } — a persona seat or a
// card-less seat is somebody a person plays.
function peopleOf(doc) {
	var cast = own(own(doc).cast), out = [];
	var cs = list(cast.sessionCharacters);
	for (var i = 0; i < cs.length; i++) {
		var s = own(cs[i]), ch = own(s.character);
		if (s.enabled === false || s.removedAt || ch.id === undefined) continue;
		out.push({ ref: "character:" + ch.id, name: text(ch.name), nick: text(ch.nickname), plays: false, at: num(s.position, out.length) });
	}
	var ps = list(cast.sessionPersonas);
	for (var j = 0; j < ps.length; j++) {
		var p = own(ps[j]), pe = p.persona ? own(p.persona) : null;
		if (p.enabled === false || p.removedAt) continue;
		if (pe && pe.id !== undefined) out.push({ ref: "character:" + pe.id, name: text(pe.name), nick: "", plays: true, seat: "persona:" + pe.id });
		else if (p.seatId !== undefined) out.push({ ref: "player-seat:" + p.seatId, name: text(p.seatName) || "a player", nick: "", plays: true, seat: "player-seat:" + p.seatId });
	}
	return out;
}
function personNamed(people, name) {
	var k = nameKey(name);
	if (!k) return null;
	for (var i = 0; i < people.length; i++) if (nameKey(people[i].name) === k || (people[i].nick && nameKey(people[i].nick) === k)) return people[i];
	return null;
}
function personRef(people, ref) {
	var r = text(ref);
	for (var i = 0; i < people.length; i++) if (people[i].ref === r || people[i].seat === r) return people[i];
	return null;
}
// The words a name may be given in: itself, and — as the table lists them to
// the planner, "Strength (ability.strength)", "Hard (20)" — what is in its
// brackets, then what is before them.
function wordsOf(word) {
	var t = text(word), out = [t];
	var m = /^(.*?)\\s*\\(([^()]*)\\)\\s*$/.exec(t);
	if (m) { out.push(text(m[2])); out.push(text(m[1])); }
	return out;
}
// The check a word names: its key, or its words, ignoring case — else the
// last part of a key, when it names one check alone ("Athletics" for
// skill.athletics; "Strength" naming two is nobody's).
function checkOf(rules, word) {
	var ws = wordsOf(word);
	for (var w = 0; w < ws.length; w++) {
		var k = ws[w].toLowerCase();
		if (!k) continue;
		for (var i = 0; i < rules.checks.length; i++) { var c = own(rules.checks[i]); if (text(c.key).toLowerCase() === k || text(c.label).toLowerCase() === k) return c; }
	}
	for (var w2 = 0; w2 < ws.length; w2++) {
		var tail = ws[w2].toLowerCase().replace(/-/g, " "), hit = null, count = 0;
		if (!tail) continue;
		for (var j = 0; j < rules.checks.length; j++) {
			var c2 = own(rules.checks[j]), parts = text(c2.key).toLowerCase().split(".");
			if (parts[parts.length - 1].replace(/-/g, " ") === tail) { hit = c2; count++; }
		}
		if (count === 1) return hit;
	}
	return null;
}
// The band a word names, by its id or its words; else the ruleset's usual one.
function bandOf(rules, word) {
	var ws = wordsOf(word), usual = null;
	for (var w = 0; w < ws.length; w++) {
		var k = ws[w].toLowerCase();
		if (!k) continue;
		for (var i = 0; i < rules.bands.length; i++) { var b = own(rules.bands[i]); if (text(b.id).toLowerCase() === k || text(b.label).toLowerCase() === k) return b; }
	}
	for (var j = 0; j < rules.bands.length; j++) { var u = own(rules.bands[j]); if (text(u.id) === rules.band) usual = u; }
	return usual || (rules.bands.length ? own(rules.bands[0]) : null);
}
function checkLabel(rules, key) { var c = checkOf(rules, key); return c ? text(c.label) : text(key); }
`

const lairSeed = (seedKey: string, name: string, body: string): CoreScriptSeed =>
	seedScript(seedKey, name, `${LAIR_PREAMBLE()}\n${body}`)

/**
 * 🚧 `core:script/lair-table`: what this table rolls, and who of the party a
 * person plays — read before the plan. Handed `{ ruleset, session }`.
 * Returns `{ fields, mode }`:
 *
 *  - `fields` — the session's genre fields, with the planner's named
 *    variables beside them: `checks` (the checks this table rolls, each with
 *    its key; empty when nothing is rolled), `bands` (how hard, in words,
 *    the usual one marked), `players` (the delvers people play);
 *  - `mode` — how a risky attempt is decided this turn: `ask` (the Oracle
 *    puts a roll form to the GM, and the turn waits), `auto` (rolled at once:
 *    rigour `scripts` with *Decide checks at once* on) or `none` (told in words: prose
 *    rigour, a ruleset with no dice or bands, or *Ask me before each check* off
 *    without auto roll).
 * @experimental
 */
export const LAIR_TABLE_SCRIPT = lairSeed(
	'core:script/lair-table',
	'Lair: what this table rolls',
	`
var doc = own(v.session), f = own(doc.fields), rules = rulesOf(v.ruleset);
var counted = rules.rigour === "mechanics" || rules.rigour === "scripts";
var dice = counted && rules.dice && rules.bands.length > 0 && rules.checks.length > 0;
var auto = dice && rules.rigour === "scripts" && f.autoRoll === true;
var ask = dice && !auto && f.askBeforeRolling !== false;
var mode = auto ? "auto" : ask ? "ask" : "none";
var fields = own(f);
var checks = [], bands = [];
if (mode !== "none") {
	for (var i = 0; i < rules.checks.length; i++) { var c = own(rules.checks[i]); checks.push(text(c.label) + " (" + text(c.key) + ")"); }
	for (var j = 0; j < rules.bands.length; j++) {
		var b = own(rules.bands[j]);
		bands.push(text(b.label) + (typeof b.target === "number" ? " (" + b.target + ")" : "") + (text(b.id) === rules.band ? ", the usual" : ""));
	}
}
var people = peopleOf(doc), players = [];
for (var p = 0; p < people.length; p++) if (people[p].plays) players.push(people[p].name);
fields.checks = checks.join(", ");
fields.bands = bands.join("; ");
fields.players = players.join(", ");
fields.roomsLayer = f.roomsLayer !== false;
return { fields: fields, mode: mode };
`,
)

/**
 * 🚧 `core:script/lair-turn`: the plan, made into the turn. Handed
 * `{ plan, table, session, ruleset, action }` — the Castellan's plan, the
 * table (`lair-table`: its `mode`), the settings document, the inlet's ruleset and
 * the roll action (`{ id, fn }`, the identity a roll form fires). Returns:
 *
 *  - `plan` — the plan as the turn plays it: the planner's, with
 *    `speakers` filled when it named nobody in the party (lair fix 2,
 *    2026-10-22): the GM asked for a turn, so every AI delver takes one, in
 *    cast order — a party of one answered `speakers: []` to a GM line and
 *    nothing was written. Who is unconscious or gone is the planner's to
 *    say, by naming the others; naming nobody is read as an omission;
 *  - `beats` — the plan's beats as a markdown list (the Sanctum row's
 *    body); when it has none but somebody speaks, one line each, so the
 *    plan row still posts and hands the turns on; null when nobody does;
 *  - `waits` — the speakers a person plays (`character:<id>` or
 *    `player-seat:<id>`): their turns wait for them — the host's to honour;
 *  - `askForms` · `askText` — `mode: ask`: one roll form per risky attempt,
 *    addressed to the owner (the GM), the check and difficulty the plan
 *    proposed (or the ruleset's usual band), the delver by name as its
 *    `referent` and the attempt as its `vantage` — what the roll action reads
 *    back; and the Oracle's line above them;
 *  - `autoDeltas` · `autoOwners` — `mode: auto`: one check per risky
 *    attempt for the ruleset handler (`use`, the check, against the band's
 *    target); an attempt whose check the ruleset does not know is told in
 *    words.
 * @experimental
 */
export const LAIR_TURN_SCRIPT = lairSeed(
	'core:script/lair-turn',
	'Lair: the plan, made into the turn',
	`
var j = own(v.plan), doc = own(v.session), rules = rulesOf(v.ruleset), act = own(v.action);
var mode = text(own(v.table).mode);
var people = peopleOf(doc);
var waits = [], sp = list(j.speakers), heard = 0;
for (var s = 0; s < sp.length; s++) { var who0 = personNamed(people, own(sp[s]).name); if (!who0) continue; heard++; if (who0.plays && waits.indexOf(who0.ref) < 0) waits.push(who0.ref); }
// Nobody in the party named (an empty list, or names the party lacks): every
// AI delver takes a turn, in cast order — the GM asked for one.
if (!heard) {
	var ai = [];
	for (var a = 0; a < people.length; a++) if (!people[a].plays) ai.push(people[a]);
	ai.sort(function (x, y) { return x.at - y.at; });
	sp = [];
	for (var a2 = 0; a2 < ai.length && a2 < 6; a2++) sp.push({ name: ai[a2].name, intent: "" });
}
var plan = own(j);
plan.speakers = sp;
var beats = [], rb = list(j.beats);
for (var i = 0; i < rb.length && beats.length < 6; i++) { var t = text(rb[i]); if (t) beats.push("- " + t); }
if (!beats.length) for (var e = 0; e < sp.length; e++) { var sn = text(own(sp[e]).name), si = text(own(sp[e]).intent); if (sn) beats.push("- " + sn + (si ? ": " + si : " takes a turn.")); }
var forms = [], asks = [], deltas = [], owners = [], risks = list(j.risks);
for (var r = 0; r < risks.length && r < 4; r++) {
	var risk = own(risks[r]), who = personNamed(people, risk.who);
	if (!who) continue;
	var attempt = text(risk.attempt) || "try it";
	var check = checkOf(rules, risk.check), band = bandOf(rules, risk.difficulty);
	if (!band) continue;
	if (mode === "ask") {
		var first = check || own(rules.checks[0]);
		if (!text(first.key)) continue;
		var offered = [];
		for (var k = 0; k < rules.checks.length; k++) { var c = own(rules.checks[k]); offered.push({ key: text(c.key), label: text(c.label) }); }
		var bands = [];
		for (var b = 0; b < rules.bands.length; b++) { var bb = own(rules.bands[b]); var row = { id: text(bb.id), label: text(bb.label) }; if (typeof bb.target === "number") row.target = bb.target; bands.push(row); }
		forms.push({
			kind: "roll",
			fn: text(act.fn),
			action: text(act.id),
			addressee: "owner",
			question: who.name + ": " + attempt + ". Roll for it?",
			referent: who.name,
			vantage: attempt,
			stat: text(first.key),
			stats: offered,
			bands: bands,
			band: text(band.id),
			by: who.ref
		});
		asks.push(who.name + " — " + attempt);
	} else if (mode === "auto" && check && typeof band.target === "number") {
		deltas.push({ owner: who.ref, op: "use", check: text(check.key), against: band.target, reason: attempt });
		if (owners.indexOf(who.ref) < 0) owners.push(who.ref);
	}
}
return {
	plan: plan,
	beats: beats.length ? beats.join("\\n") : null,
	waits: waits.length ? waits : null,
	askForms: forms.length ? forms : null,
	askText: forms.length ? "The rules call for " + (forms.length === 1 ? "a roll: " : "rolls: ") + asks.join("; ") + "." : null,
	autoDeltas: deltas.length ? deltas : null,
	autoOwners: owners.length ? owners : null
};
`,
)

/**
 * 🚧 `core:script/lair-dice`: what the ruleset handler decided, as outcome
 * blocks under the Oracle (D3; any check method since 2026-10-22). Handed
 * `{ outcomes, explain, ruleset, session }` — the handler's `apply` answer.
 * Returns `{ blocks, text }`: one outcome block (stored kind `dice`) per
 * check — the handler's own (`outcome.block`: dice, a pool, cards, a
 * comparison, a spend or a judgement), named by the table's words for the
 * check, how it came out in the ruleset's own outcome words when the handler
 * gave none — and the same in words, a line each: the row's text the party read
 * (the host leaves the numbers out of their prompts while *Show outcomes* is
 * off). Null blocks when nothing was decided (the ruleset refused the
 * check), and a line saying so.
 * @experimental
 */
export const LAIR_DICE_SCRIPT = lairSeed(
	'core:script/lair-dice',
	'Lair: the dice, as blocks',
	`
var rules = rulesOf(v.ruleset), people = peopleOf(own(v.session));
var outs = list(v.outcomes), ex = list(v.explain);
var blocks = [], lines = [];
for (var i = 0; i < outs.length; i++) {
	var o = own(outs[i]), c = own(o.check), given = o.block && typeof o.block === "object" ? own(o.block) : null;
	if (text(o.kind) !== "check" || (!given && typeof c.total !== "number")) continue;
	var roller = text(c.actor) || text(o.owner);
	var known = checkOf(rules, c.selector);
	var stat = known ? text(known.label) : (given && text(given.stat)) || text(c.selector);
	var block;
	if (given) {
		block = given;
		block.kind = "dice";
		block.stat = stat;
	} else {
		var outcome = text(c.label) || outcomeWord(rules, c) || (typeof c.against === "number" ? (c.total >= c.against ? "Success" : "Failure") : "Rolled");
		block = { kind: "dice", stat: stat, rolled: c.total, outcome: outcome };
		if (typeof c.natural === "number") block.faces = [c.natural];
		if (typeof c.against === "number") block.against = c.against;
		if (text(c.five)) block.five = text(c.five);
		for (var e = 0; e < ex.length; e++) { var x = own(ex[e]); if (text(x.target) === roller + "." + text(c.selector) && text(x.text)) { block.explain = text(x.text); break; } }
	}
	if (!block.by && /^(character|player-seat):\\d+$/.test(roller)) block.by = roller;
	blocks.push(block);
	var who = personRef(people, roller);
	lines.push((who ? who.name + " — " : "") + outcomeLine(block));
}
return { blocks: blocks.length ? blocks : null, text: lines.length ? lines.join("\\n") : "Nothing was rolled: it goes as the story says." };
`,
)

/**
 * 🚧 `core:script/lair-roll`: a roll form's answer, made into the check (D3).
 * Handed `{ payload, referent, vantage, session, ruleset }` — the fire's
 * `{ check, stat, band, target? }`, the delver the form named (its
 * `referent`) and what they attempt (its `vantage`). Returns, flat (a text
 * part reads one key): `rolled` — true for a check to roll, else null; then
 * `deltas` and `owners` (one `use` against the band's target) and `rigour`
 * (`mechanics`, or the table's own when higher); or `said`, the Oracle's line
 * for *No check* — it goes as the story says.
 * @experimental
 */
export const LAIR_ROLL_SCRIPT = lairSeed(
	'core:script/lair-roll',
	'Lair: the roll, as the GM called it',
	`
var pay = own(v.payload), rules = rulesOf(v.ruleset), people = peopleOf(own(v.session));
var who = personNamed(people, v.referent);
var attempt = text(v.vantage);
var check = checkOf(rules, pay.stat), band = bandOf(rules, pay.band);
var name = who ? who.name : (text(v.referent) || "They");
if (pay.check !== true || !who || !check) return { rolled: null, deltas: null, owners: null, rigour: null, said: name + (attempt ? " — " + attempt : "") + ": no roll. It goes as the story says." };
var against = typeof pay.target === "number" ? pay.target : band && typeof band.target === "number" ? band.target : null;
var d = { owner: who.ref, op: "use", check: text(check.key), reason: attempt };
if (against !== null) d.against = against;
return { rolled: true, deltas: [d], owners: [who.ref], rigour: rules.rigour === "scripts" ? "scripts" : "mechanics", said: null };
`,
)

/**
 * 🚧 `core:script/lair-call-roll`: the GM's own roll (the `roll` action from
 * the composer): one roll form per delver they picked, addressed to the GM,
 * the ruleset's checks and bands offered, its usual band proposed. Handed
 * `{ recipients, text, session, ruleset, action }`. Returns `{ forms, text }`,
 * or `{ forms: null, text }` saying why there is nothing to roll.
 * @experimental
 */
export const LAIR_CALL_ROLL_SCRIPT = lairSeed(
	'core:script/lair-call-roll',
	'Lair: a roll the GM calls for',
	`
var rules = rulesOf(v.ruleset), people = peopleOf(own(v.session)), act = own(v.action);
var what = text(v.text) || "a roll";
if (!rules.dice || !rules.bands.length || !rules.checks.length) return { forms: null, text: noRollWords(rules) };
var offered = [], bands = [];
for (var k = 0; k < rules.checks.length; k++) { var c = own(rules.checks[k]); offered.push({ key: text(c.key), label: text(c.label) }); }
for (var b = 0; b < rules.bands.length; b++) { var bb = own(rules.bands[b]); var row = { id: text(bb.id), label: text(bb.label) }; if (typeof bb.target === "number") row.target = bb.target; bands.push(row); }
var usual = bandOf(rules, "");
var refs = list(v.recipients), forms = [], names = [];
for (var i = 0; i < refs.length && forms.length < 8; i++) {
	var who = personRef(people, refs[i]);
	if (!who) continue;
	forms.push({
		kind: "roll",
		fn: text(act.fn),
		action: text(act.id),
		addressee: "owner",
		question: who.name + ": " + what + ". Which check, and how hard?",
		referent: who.name,
		vantage: what,
		stat: text(offered[0].key),
		stats: offered,
		bands: bands,
		band: usual ? text(usual.id) : text(bands[0].id),
		by: who.ref
	});
	names.push(who.name);
}
return forms.length ? { forms: forms, text: "The Dungeon Master calls for " + (forms.length === 1 ? "a roll" : "rolls") + ": " + names.join(", ") + " — " + what + "." } : { forms: null, text: "Nobody seated to roll for." };
`,
)

/**
 * 🚧 `core:script/lair-room`: a room draft made into the write (D2, D10).
 * Handed `{ draft, name, rooms, here }` — the drafted JSON
 * (`LAIR_ROOM_DRAFT_SCHEMA`), the room's name, the rooms the book holds and
 * the room the party stand in (its id, linked by the knock's own step).
 * Returns `{ name, content, fields, links }`: the body with an *Exits:* line
 * naming every way out (the room's own words, as an older room reads), its
 * typed fields as drafted, and **one link per way out to a room the book
 * holds** — written in the entry's own commit (`create-lore-entry@1`'s
 * `links`); a way to a room nobody built yet stays words.
 * @experimental
 */
export const LAIR_ROOM_SCRIPT = lairSeed(
	'core:script/lair-room',
	'Lair: a room draft, made into the write',
	`
var d = own(v.draft), name = text(v.name);
var rooms = list(v.rooms), known = {};
for (var i = 0; i < rooms.length; i++) { var r = own(rooms[i]); var k = nameKey(r.name); if (k && typeof r.id === "number") known[k] = r; }
var here = num(v.here, null);
var said = [], links = [], seen = {};
var exits = list(d.exits);
for (var e = 0; e < exits.length && e < 6; e++) {
	var x = own(exits[e]), way = text(x.way), to = text(x.to);
	if (!to || nameKey(to) === nameKey(name)) continue;
	said.push((way ? way + " → " : "") + to);
	var there = known[nameKey(to)];
	if (!there || there.id === here || seen[there.id]) continue;
	seen[there.id] = true;
	links.push({ to: there.id, linkType: way ? "leads " + way + " to" : "leads to", reverseLinkType: "leads to" });
}
var content = text(d.content);
if (said.length) content = (content ? content + "\\n\\n" : "") + "Exits: " + said.join(", ");
return { name: name, content: content, fields: own(d.fields), links: links };
`,
)

/**
 * 🚧 `core:script/lair-welcome`: somebody new at the table (D5). Handed
 * `{ payload, session }` — the `member-added` change (`ref`) and the settings
 * document. A seat a person plays — a persona, or a card-less seat — is
 * told to the GM in the Sanctum; anybody else (a delver the GM added, an
 * envoy) is nobody to announce: `text` null.
 * @experimental
 */
export const LAIR_WELCOME_SCRIPT = lairSeed(
	'core:script/lair-welcome',
	'Lair: somebody new at the table',
	`
var who = personRef(peopleOf(own(v.session)), own(v.payload).ref);
if (!who || !who.plays) return { text: null };
return { text: who.name + " has joined the table and plays their own part. When the plan gives them a turn, the party wait for their line." };
`,
)

/** The Lair's scripts, in seed order. @experimental */
export const LAIR_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	LAIR_TABLE_SCRIPT,
	LAIR_TURN_SCRIPT,
	LAIR_DICE_SCRIPT,
	LAIR_ROLL_SCRIPT,
	LAIR_CALL_ROLL_SCRIPT,
	LAIR_ROOM_SCRIPT,
	LAIR_WELCOME_SCRIPT,
])
