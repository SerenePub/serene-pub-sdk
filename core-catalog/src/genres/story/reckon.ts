/**
 * 🚧 What happens **around** a Story reply (PLAN-genre-restructure §4, R4,
 * ruled 2026-10-19): the tail of `core:spec/story-respond`, after the reply
 * is saved, its sprite shown and the reply tick taken.
 *
 *  1. `tasks` — `core:task/resolve-tasks@1`: the genre's `STORY_TASKS`, each
 *     at the session's mode, else its preset's, else the default. The host
 *     decides when a sweep is due (`sweep`), and the spec only reads what
 *     this step publishes. A task that is **Off** is skipped at its branch —
 *     one pipeline, never one per toggle (owner ruling 2026-10-19).
 *  2. `reckon` — **the reckoning**, ONE JSON call after the reply when any
 *     task of the `reckoning` group is on (the Dungeon Crawler's Planner
 *     pattern: read the reply, emit deltas). Its crib is the cast's sheets,
 *     the reply and the ruleset's voice; its answer is the delta grammar
 *     (`STORY_RECKON_SCHEMA`). At `scripts` rigour the ruleset handler
 *     resolves the deltas (`core:task/ruleset-resolve@1`, `apply` — the DC
 *     pattern, `parley.ts`, `rest.ts`); otherwise the changes are written in
 *     words: resolved by name (`resolve-state-changes@1`) and applied when
 *     *Keep the sheets* is **Full**, held as proposals when it is **Review**.
 *     The clock moves by the reply's own time when *Move the clock* is Full;
 *     on Review the move is a proposal like any change.
 *  3. `sweep` — **the sweep**, ONE batched JSON call every few turns (or after
 *     each scene) when any `sweep` task is on and one is due: its prompt asks
 *     only for what the enabled tasks write, and each answer lands through
 *     the writes core already has — a history entry for the summary, lore,
 *     people and places as lorebook entries (Full: written; Review: held at
 *     the write's review gate), the world's state as changes (applied or
 *     proposed), the goals as the session's note.
 *
 * Minimal pins every task Off, so nothing after the tick runs: one call a
 * turn. Living and Rule Based pin the defaults: two calls a turn, plus the
 * sweep every few turns.
 *
 * 🚧 Lane 2 (2026-10-19) wired the rest, each where its event is:
 *
 *  - the `reply` group is the reply's own (`respond.ts`): the `tasks` step
 *    moved to its head, *Read the lorebook* is the `retrieval` junction
 *    before `rank`, *Read the scene* the `scene` gate before `context`;
 *  - the reckoning carries every change on Review as a proposal (the
 *    handler's `propose` mode) instead of dropping its pieces, checks a
 *    lorebook item's supply (phase 3b), and files the place a move reached
 *    (*Describe new places*, `place`);
 *  - the sweep proposes how the characters stand on the Graph's review
 *    screen (`relationships`, `core:outlet/graph-proposal@1`), and keeps the
 *    goals as a checklist the host reads for *Mark goals reached*;
 *  - the host owns *End what runs out* (the ruleset handler's expiry),
 *    *Mark goals reached* (the annex write), *Picture each new scene* (a
 *    scene opening) and the voices group (`core:task/turn-unprompted@1` in
 *    the turn-order spec).
 *
 * Retired from the declaration in lane 2: *Route whispers* (no path
 * delivers a line to some characters only — the reply reads no state and
 * the transcript has one audience) and *Let the storyteller lead* (Story
 * seats no envoy).
 */

import { slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { STORY_PROMPT_KEYS } from '../../seed/prompts.js'
import { seedScript, type CoreScriptSeed } from '../dungeon-crawler/preamble.js'
import { at, jsonPart, modelCall, scriptStep, textPart, type Wiring } from '../../shared/calls.js'
import { DELTA_OF_JS } from '../../shared/deltas.js'
import { STORY_GENRE_ID } from '../../registry/genres.js'
import { STORY_GOALS_KEY } from '../../shared/annexField.js'

/**
 * 🚧 One change the reckoning may propose — the Dungeon Crawler's delta
 * grammar (`DUNGEON_CRAWLER_DELTA_SCHEMA`), **open**: `op`, `slot`,
 * `repertoire` and `check` are whatever the session's ruleset provides
 * (`GenreDecl.uses.verbs: 'any'`), so they are words here, not enums, and
 * the prompt names what this table offers. Every member required (the
 * grammar-compiling families); empty text and `0` say "none".
 * @experimental
 */
export const STORY_DELTA_SCHEMA = Object.freeze({
	type: 'object',
	properties: {
		owner: { type: 'string', description: 'Whose: a reference from the crib, or world.' },
		op: { type: 'string', description: 'add, spend, set or remove — or a verb the rules name.' },
		slot: { type: 'string', description: 'The value changed (hp, mood, location …), or empty for a piece.' },
		repertoire: { type: 'string', description: 'The list a piece is kept on (things, conditions …), or empty.' },
		piece: { type: 'string', description: 'The piece by its name, or empty.' },
		value: { type: 'string', description: 'An amount (add, spend), or the new value (set). Empty when none.' },
		check: { type: 'string', description: 'A check the rules roll for it, or empty.' },
		against: { type: 'integer', description: 'The difficulty a check is against; 0 when none.' },
		reason: { type: 'string' },
	},
	required: ['owner', 'op', 'slot', 'repertoire', 'piece', 'value', 'check', 'against', 'reason'],
	additionalProperties: false,
})

/**
 * 🚧 The reckoning's answer: the **deltas** the reply made true, and how
 * much story time it took (`clock`, a list so the grammar can say none —
 * Adventure's keeper `clock`, kept). Was `ADVENTURE_KEEPER_SCHEMA`'s place:
 * the keeper's `{ values, inventory, clock }` became the delta grammar.
 * @experimental
 */
export const STORY_RECKON_SCHEMA = {
	type: 'object',
	properties: {
		deltas: { type: 'array', maxItems: 12, items: STORY_DELTA_SCHEMA },
		clock: {
			type: 'array',
			maxItems: 1,
			items: {
				type: 'object',
				properties: {
					by: { type: 'integer' },
					unit: { type: 'string', enum: ['minutes', 'hours', 'days', 'months', 'years'] },
				},
				required: ['by', 'unit'],
				additionalProperties: false,
			},
		},
		/**
		 * 🚧 *Describe new places* (`places-on-move`, lane 2): when the reply
		 * moved the story somewhere the lorebook has not described — the
		 * place, what it is like, and the places its ways out lead to.
		 * Empty when nothing moved, or the task is off.
		 */
		place: {
			type: 'array',
			maxItems: 1,
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					content: { type: 'string' },
					ways: { type: 'array', maxItems: 6, items: { type: 'string' } },
				},
				required: ['name', 'content', 'ways'],
				additionalProperties: false,
			},
		},
	},
	required: ['deltas', 'clock', 'place'],
	additionalProperties: false,
} as const

const NAMED = {
	type: 'object',
	properties: { name: { type: 'string' }, content: { type: 'string' } },
	required: ['name', 'content'],
	additionalProperties: false,
} as const

/**
 * 🚧 The sweep's answer — one member per `sweep` task, each empty when its
 * task is off or nothing changed: the story so far (`summary`), new lore,
 * new people (`cast`), the world's state, how the characters stand
 * (`relationships`), the places used (`scenes`) and the running goals.
 * @experimental
 */
export const STORY_SWEEP_SCHEMA = {
	type: 'object',
	properties: {
		summary: NAMED,
		lore: { type: 'array', maxItems: 6, items: NAMED },
		cast: { type: 'array', maxItems: 4, items: NAMED },
		worldState: {
			type: 'array',
			maxItems: 6,
			items: {
				type: 'object',
				properties: { slot: { type: 'string' }, value: { type: 'string' } },
				required: ['slot', 'value'],
				additionalProperties: false,
			},
		},
		relationships: {
			type: 'array',
			maxItems: 6,
			items: {
				type: 'object',
				properties: { from: { type: 'string' }, to: { type: 'string' }, how: { type: 'string' } },
				required: ['from', 'to', 'how'],
				additionalProperties: false,
			},
		},
		scenes: { type: 'array', maxItems: 4, items: NAMED },
		goals: { type: 'string' },
	},
	required: ['summary', 'lore', 'cast', 'worldState', 'relationships', 'scenes', 'goals'],
	additionalProperties: false,
} as const

/**
 * The Story scripts' one preamble: the readers `deltaOf` needs (`own`,
 * `text`, `num`, `ucSlotName`, an empty `NOT_FOR_DELTAS` — every slot may
 * move here), `deltaOf` itself (`shared/deltas.ts`), the state key a
 * reference reads under, the cast as the settings document seats it, and a
 * task's mode. Plain ES5 so any sandbox runs it.
 */
const STORY_PREAMBLE = `
var v = value || {};
function own(o) { var out = {}; if (o && typeof o === "object" && !Array.isArray(o)) for (var k in o) out[k] = o[k]; return out; }
function text(x) { return typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : ""; }
function num(x, d) { var n = Number(x); return x !== null && x !== "" && isFinite(n) ? n : d; }
function ucSlotName(id) { return String(id).replace(/^core:slot\\//, "").replace(/@\\d+$/, ""); }
var NOT_FOR_DELTAS = [];
${DELTA_OF_JS}
function stateKeyOf(ref) {
	var r = String(ref);
	var m = /^player-seat:(\\d+)$/.exec(r);
	if (m) return "player_seat:" + m[1];
	var c = /^character:(\\d+)$/.exec(r);
	return c ? c[1] : r;
}
// Everyone seated and switched on: { ref, name, plays } — a persona seat
// is somebody a person plays.
function peopleOf(doc) {
	var cast = own(own(doc).cast), out = [];
	var cs = Array.isArray(cast.sessionCharacters) ? cast.sessionCharacters : [];
	for (var i = 0; i < cs.length; i++) {
		var s = own(cs[i]), ch = own(s.character);
		if (s.enabled === false || s.removedAt || ch.id === undefined) continue;
		out.push({ ref: "character:" + ch.id, name: text(ch.name), plays: false });
	}
	var ps = Array.isArray(cast.sessionPersonas) ? cast.sessionPersonas : [];
	for (var j = 0; j < ps.length; j++) {
		var p = own(ps[j]), pe = p.persona ? own(p.persona) : null;
		if (p.enabled === false || p.removedAt) continue;
		if (pe && pe.id !== undefined) out.push({ ref: "character:" + pe.id, name: text(pe.name), plays: true });
		else if (p.seatId !== undefined) out.push({ ref: "player-seat:" + p.seatId, name: text(p.seatName) || "a player", plays: true });
	}
	return out;
}
function modeOf(modes, key) { var m = text(own(modes)[key]); return m === "full" || m === "review" ? m : "off"; }
function bagLine(bag) {
	var parts = [];
	for (var k in bag) {
		var x = bag[k];
		if (x === null || x === undefined || x === "") continue;
		if (Array.isArray(x)) { var names = []; for (var i = 0; i < x.length; i++) { var t = x[i] && typeof x[i] === "object" ? text(x[i].name || x[i].text) : text(x[i]); if (t) names.push(t); } if (names.length) parts.push(k + ": " + names.join(", ")); }
		else if (typeof x === "object") continue;
		else parts.push(k + ": " + text(x));
	}
	return parts.join("; ");
}
`

const storySeed = (seedKey: string, name: string, body: string): CoreScriptSeed =>
	seedScript(seedKey, name, `${STORY_PREAMBLE}\n${body}`)

/**
 * 🚧 `core:script/story-reckon-crib`: what the reckoning reads. Handed
 * `{ session, state, reply, blocks, ruleset, modes }` — the settings
 * document, the session's state, the reply just written, the ruleset
 * handler's `resolve` blocks, the inlet's ruleset and the resolved task
 * modes. Returns `{ crib, brief, owners, fields }`: the crib (the world and
 * each seated person's sheet, by reference), the brief (the reply, and what
 * to answer), the owners the handler resolves, and the prompt's named
 * fields — `rulesetVoice`, `rulesetSheet`, `rigourLine`, `canChange`,
 * `difficulty`.
 * @experimental
 */
export const STORY_RECKON_CRIB_SCRIPT = storySeed(
	'core:script/story-reckon-crib',
	'Story: what the reckoning reads',
	`
var doc = own(v.session), state = own(v.state), modes = own(v.modes);
var people = peopleOf(doc);
var lines = [];
// 🚧 The places the lorebook already describes (lane 2: *Describe new places*).
var placeNames = [];
var placeRows = Array.isArray(v.places) ? v.places : [];
for (var pl = 0; pl < placeRows.length && placeNames.length < 40; pl++) { var pn = text(own(placeRows[pl]).name); if (pn) placeNames.push(pn); }
var world = bagLine(own(state.world));
lines.push("The world [world]: " + (world || "nothing tracked yet") + ".");
var byId = own(own(state.cast).byId);
for (var i = 0; i < people.length; i++) {
	var p = people[i];
	var sheet = bagLine(own(byId[stateKeyOf(p.ref)]));
	lines.push("- " + (p.name || "someone") + " [" + p.ref + "]" + (p.plays ? " (played by a person)" : "") + ": " + (sheet || "nothing tracked yet") + ".");
}
var owners = ["session:" + text(doc.sessionId)];
for (var o = 0; o < people.length; o++) owners.push(people[o].ref);
var blocks = own(v.blocks);
function blockText(b) { return b && typeof b === "object" ? text(b.text) : text(b); }
var rigour = text(own(v.ruleset).rigour) || "prose";
var counted = rigour === "mechanics" || rigour === "scripts";
var can = [];
if (modeOf(modes, "attributes") !== "off") can.push("a value the reply changed — health, mood, where someone is, what they carry (slot; op set with the new value, or add or spend with an amount)");
if (modeOf(modes, "conditions") !== "off") can.push("a condition put on or taken off — hurt, tired, poisoned, inspired (repertoire conditions; op add or remove; piece the condition in a word or two)");
if (modeOf(modes, "attributes") !== "off") can.push("a thing gained, lost or used up (repertoire things; op add, remove or spend; piece its name)");
if (modeOf(modes, "time") !== "off") can.push("how much story time the reply took, when it took meaningful time (clock)");
if (modeOf(modes, "places-on-move") !== "off") can.push("the place the reply moved the story to, when the lorebook does not describe it yet (place: its name, what it is like, and the places its ways out lead to)" + (placeNames.length ? " — the lorebook already describes: " + placeNames.join(", ") : ""));
var reply = text(v.reply);
return {
	crib: lines.join("\\n"),
	brief: "The reply just written:\\n" + (reply || "(empty)") + "\\n\\nWhat did it change?",
	owners: owners,
	fields: {
		rulesetVoice: blockText(blocks.voice),
		rulesetSheet: blockText(blocks.sheet),
		rigourLine: counted
			? "The table's rules decide the numbers: propose changes, never totals, and a check (with what it is against) for anything risky."
			: "Nothing is rolled at this table: propose no checks, and say a change in words where no number is kept.",
		canChange: can.length ? can.join("; ") : "nothing",
		difficulty: text(own(doc.fields).difficulty) || "normal"
	}
};
`,
)

/**
 * 🚧 `core:script/story-reckon`: the reckoning's answer, sorted. Handed
 * `{ json, modes, state, ruleset, supply }`. Each delta read one way
 * (`deltaOf`, `shared/deltas.ts`); a value change kept only while *Keep the
 * sheets* is on, a condition only while *Track conditions* is, the clock
 * only while *Move the clock* is — and each kept by its own task's mode,
 * Full or Review (lane 2, 2026-10-19: Review used to drop the pieces).
 * Returns:
 *
 *  - `scripts` · `scriptsReview` — the deltas, when the table resolves by
 *    script: the ruleset handler applies the Full ones and files the Review
 *    ones for review (its `propose` mode);
 *  - `pieces` · `piecesReview` — at a table of words, the piece deltas
 *    (things, conditions), the same way round;
 *  - `words` — at a table of words, the value changes made whole — a set as
 *    it is, an add or a spend counted from what the state holds now — and
 *    🚧 a thing the session's lorebook keeps as an item (`supply`, the
 *    `core:query/item-supply@1` answer) as an item line `{ owner, entryId,
 *    delta }`, so `resolve-state-changes@1` checks its supply (phase 3b: a
 *    unique item held is not handed out again), for
 *    `resolve-state-changes@1`;
 *  - `owners` — whose rules the deltas touch;
 *  - `clock` — `{ by, unit }` to move now (time Full), else null;
 *    `clockReview` — `{ clock: [{ by, unit }] }` to propose (time Review),
 *    else `{ clock: [] }`.
 * @experimental
 */
export const STORY_RECKON_SCRIPT = storySeed(
	'core:script/story-reckon',
	'Story: what the reply changed',
	`
var j = own(v.json), modes = own(v.modes), state = own(v.state);
var raw = Array.isArray(j.deltas) ? j.deltas : [];
function taskOf(d) { return text(d.repertoire) === "conditions" ? "conditions" : "attributes"; }
var deltas = [], owners = [], seen = {};
for (var i = 0; i < raw.length; i++) {
	var d = deltaOf(raw[i]);
	if (!d) continue;
	if (modeOf(modes, taskOf(d)) === "off") continue;
	deltas.push(d);
	if (!seen[d.owner]) { seen[d.owner] = true; owners.push(d.owner); }
}
var rigour = text(own(v.ruleset).rigour);
var byScript = rigour === "scripts";
function nowOf(owner, slot) {
	var bag = owner === "world" ? own(state.world) : own(own(own(state.cast).byId)[stateKeyOf(owner)]);
	return bag[ucSlotName(slot)];
}
// The session's lorebook items, by name (phase 3b): a thing one names is an
// item line, so its supply is checked before it changes hands.
var supply = Array.isArray(v.supply) ? v.supply : [];
function itemNamed(name) {
	var n = text(name).toLowerCase();
	if (!n) return null;
	for (var s = 0; s < supply.length; s++) {
		var row = own(supply[s]);
		if (typeof row.entryId === "number" && text(row.name).toLowerCase() === n) return row;
	}
	return null;
}
var scripts = [], scriptsReview = [], pieces = [], piecesReview = [], words = [];
for (var k = 0; k < deltas.length; k++) {
	var x = deltas[k];
	var full = modeOf(modes, taskOf(x)) === "full";
	if (byScript) { (full ? scripts : scriptsReview).push(x); continue; }
	if (x.repertoire) {
		var item = text(x.repertoire) !== "conditions" ? itemNamed(x.piece) : null;
		if (item && (x.op === "add" || x.op === "remove" || x.op === "spend")) {
			var many = Math.max(1, Math.round(Math.abs(num(x.value, 1))));
			words.push({ owner: x.owner, entryId: item.entryId, delta: x.op === "add" ? many : -many });
			continue;
		}
		(full ? pieces : piecesReview).push(x);
		continue;
	}
	{
		if (!x.slot) continue;
		if (x.op === "set") { words.push({ owner: x.owner, slot: x.slot, value: x.value }); continue; }
		if (x.op === "add" || x.op === "spend") {
			var now = num(nowOf(x.owner, x.slot), null), by = num(x.value, null);
			if (now === null || by === null) continue;
			words.push({ owner: x.owner, slot: x.slot, value: x.op === "add" ? now + by : now - by });
		}
	}
}
var c = Array.isArray(j.clock) && j.clock.length ? own(j.clock[0]) : null;
var move = c && Math.round(num(c.by, 0)) > 0 ? { by: Math.round(num(c.by, 0)), unit: text(c.unit) || "minutes" } : null;
var time = modeOf(modes, "time");
// 🚧 *Describe new places* (lane 2): a new place is an entry, its ways out
// links to the places the book knows (a way to an unknown place is said in
// its text — a link to nothing would refuse the whole entry). A place the
// book already holds is left as written.
var placeMode = modeOf(modes, "places-on-move");
var known = {};
var placeList = Array.isArray(v.places) ? v.places : [];
for (var q = 0; q < placeList.length; q++) { var row = own(placeList[q]); var nm = text(row.name).toLowerCase(); if (nm && typeof row.id === "number") known[nm] = row; }
var newPlace = null;
var pr = placeMode !== "off" && Array.isArray(j.place) && j.place.length ? own(j.place[0]) : null;
if (pr && text(pr.name)) {
	var pname = text(pr.name), here = known[pname.toLowerCase()] || null;
	var said = [], links = [];
	var wl = Array.isArray(pr.ways) ? pr.ways : [];
	for (var z = 0; z < wl.length && z < 6; z++) {
		var wn = text(wl[z]);
		if (!wn || wn.toLowerCase() === pname.toLowerCase()) continue;
		var there = known[wn.toLowerCase()];
		if (there) links.push({ to: there.id, linkType: "leads to", reverseLinkType: "leads to" });
		else said.push(wn);
	}
	if (!here && text(pr.content))
		newPlace = { name: pname, content: text(pr.content) + (said.length ? "\\n\\nWays out: " + said.join(", ") + "." : ""), links: links };
}
return {
	placeFull: newPlace && placeMode === "full" ? newPlace : null,
	placeReview: newPlace && placeMode === "review" ? newPlace : null,
	scripts: scripts.length ? scripts : null,
	scriptsReview: scriptsReview.length ? scriptsReview : null,
	pieces: pieces.length ? pieces : null,
	piecesReview: piecesReview.length ? piecesReview : null,
	words: words.length || (move && time === "review") ? words : null,
	owners: owners,
	clock: move && time === "full" ? move : null,
	clockReview: { clock: move && time === "review" ? [move] : [] }
};
`,
)

/**
 * 🚧 `core:script/story-sweep-crib`: what the sweep is asked. Handed
 * `{ session, state, modes }`. Returns `{ crib, brief, fields }`: the crib
 * (the world as it stands and who is seated), the brief (each enabled
 * sweep task's question, and that every other member stays empty) and the
 * prompt's named fields (`difficulty`).
 * @experimental
 */
export const STORY_SWEEP_CRIB_SCRIPT = storySeed(
	'core:script/story-sweep-crib',
	'Story: what the sweep is asked',
	`
var doc = own(v.session), state = own(v.state), modes = own(v.modes);
// The goals noted so far (the annex's \`story-goals\`), so the sweep ticks
// and adds rather than rewrites (lane 2: *Mark goals reached* reads a tick).
var goalsNow = text(own(own(doc.annex).core)["story-goals"]);
var people = peopleOf(doc), names = [];
for (var i = 0; i < people.length; i++) if (people[i].name) names.push(people[i].name);
var world = bagLine(own(state.world));
var asks = [];
if (modeOf(modes, "summary") !== "off") asks.push("summary: what happened since the last summary, as a history entry — { name: a short title, content: a few plain sentences }");
if (modeOf(modes, "lore") !== "off") asks.push("lore: facts about the world the story established that are worth remembering — places' histories, customs, objects — each { name, content }");
if (modeOf(modes, "cast") !== "off") asks.push("cast: people the story introduced who are not seated (" + (names.length ? "seated: " + names.join(", ") : "nobody is seated") + "), each { name, content: who they are, in a sentence or two }");
if (modeOf(modes, "world-state") !== "off") asks.push("worldState: what changed about the world — where the story is (slot location), the time of day (time-of-day), the weather — each { slot, value }");
if (modeOf(modes, "relationships") !== "off") asks.push("relationships: how two characters now stand with each other, each { from, to, how }");
if (modeOf(modes, "scenes") !== "off") asks.push("scenes: each place the story used, each { name, content: what it is like }");
if (modeOf(modes, "goals") !== "off") asks.push("goals: what the characters are after now, as a checklist — one goal a line, '- [ ] the goal' while it is open and '- [x] the goal' once the story has reached it; keep the goals already noted (" + (goalsNow ? "below" : "none yet") + "), tick the ones reached, add new ones");
return {
	crib: "The world: " + (world || "nothing tracked yet") + "." + (names.length ? "\\nSeated: " + names.join(", ") + "." : "") + (goalsNow && modeOf(modes, "goals") !== "off" ? "\\nThe goals so far:\\n" + goalsNow : ""),
	brief: "Look back over the story so far and answer only these:\\n- " + asks.join("\\n- ") + "\\n\\nEvery other member stays empty: an empty list, or empty text.",
	fields: { difficulty: text(own(doc.fields).difficulty) || "normal" }
};
`,
)

/**
 * 🚧 `core:script/story-sweep`: the sweep's answer, sorted by task and mode.
 * Handed `{ json, modes }`. Each list lands under `<member>Full` or
 * `<member>Review` by its task's mode — absent when the task is off or the
 * answer empty — so a junction reads which write runs: `summaryFull`,
 * `summaryReview` (one `{ name, content }`), `loreFull` · `loreReview`,
 * `castFull` · `castReview`, `scenesFull` · `scenesReview` (lists),
 * `worldFull` · `worldReview` (changes on the world: `{ owner: 'world',
 * slot, value }`), `goals` (text — a note, so Review writes it too) and
 * `relationships` (`{ from, to, how }` — a proposal either way: the graph
 * never applies itself, so Full and Review both file it on the Graph's
 * review screen, lane 2).
 * @experimental
 */
export const STORY_SWEEP_SCRIPT = storySeed(
	'core:script/story-sweep',
	'Story: what the sweep found',
	`
var j = own(v.json), modes = own(v.modes);
function named(x) { x = own(x); var n = text(x.name), c = text(x.content); return n && c ? { name: n, content: c } : null; }
function namedList(xs, max) { var out = []; if (!Array.isArray(xs)) return out; for (var i = 0; i < xs.length && out.length < max; i++) { var n = named(xs[i]); if (n) out.push(n); } return out; }
var out = {};
function put(member, task, value) {
	var m = modeOf(modes, task);
	if (m === "off" || !value || (Array.isArray(value) && !value.length)) return;
	out[member + (m === "full" ? "Full" : "Review")] = value;
}
put("summary", "summary", named(j.summary));
put("lore", "lore", namedList(j.lore, 6));
put("cast", "cast", namedList(j.cast, 4));
put("scenes", "scenes", namedList(j.scenes, 4));
var world = [];
if (Array.isArray(j.worldState)) for (var w = 0; w < j.worldState.length && world.length < 6; w++) {
	var s = own(j.worldState[w]);
	if (text(s.slot) && text(s.value)) world.push({ owner: "world", slot: text(s.slot), value: text(s.value) });
}
put("world", "world-state", world);
if (modeOf(modes, "goals") !== "off" && text(j.goals)) out.goals = text(j.goals);
if (modeOf(modes, "relationships") !== "off" && Array.isArray(j.relationships)) {
	var ties = [];
	for (var r = 0; r < j.relationships.length && ties.length < 6; r++) {
		var t = own(j.relationships[r]);
		if (text(t.from) && text(t.to) && text(t.how) && text(t.from).toLowerCase() !== text(t.to).toLowerCase())
			ties.push({ from: text(t.from), to: text(t.to), how: text(t.how) });
	}
	if (ties.length) out.relationships = ties;
}
return out;
`,
)

/**
 * 🚧 `core:script/story-scene-reading`: *Read the scene* (`scene-reading`,
 * lane 2, 2026-10-19), the gate on what the reply's context builder is
 * handed. Handed `{ modes, state, places }` — the resolved task modes, the
 * session's state and the lorebook's places with their ways out. On, it
 * passes the two on, and the builder makes `{{locationEntry}}` (the place
 * the world's `location` names: its name, what it is like, the ways from
 * here) and `{{knownLocations}}` — the variables a Story prompt row places
 * after its instructions. Off, it hands on nothing (`state: null`,
 * `places: []`), so the builder makes neither and the prompt is the bytes it
 * was. Writes nothing.
 * @experimental
 */
export const STORY_SCENE_READING_SCRIPT = storySeed(
	'core:script/story-scene-reading',
	'Story: read the scene',
	`
var on = modeOf(own(v.modes), "scene-reading") !== "off";
return on
	? { state: v.state && typeof v.state === "object" ? v.state : null, places: Array.isArray(v.places) ? v.places : [] }
	: { state: null, places: [] };
`,
)

/** 🚧 The Story scripts core seeds, in seed order. @experimental */
export const STORY_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	STORY_RECKON_CRIB_SCRIPT,
	STORY_RECKON_SCRIPT,
	STORY_SWEEP_CRIB_SCRIPT,
	STORY_SWEEP_SCRIPT,
	STORY_SCENE_READING_SCRIPT,
])

/** What the reckoning and the sweep read of the reply graph. @internal */
export interface StoryTasksTerms {
	cast: ($: any) => unknown
	history: ($: any) => unknown
}

/** The reckoning — `reckon.on.*`. */
const reckonBranch = (r: any, w: Wiring, terms: StoryTasksTerms, review: string[]) => {
	const R = 'reckon.on.'
	const crib = ($: any) => at($, `${R}crib`).main
	const reckoned = ($: any) => at($, `${R}reckoned`).main
	const read = r
		.query('state', ($: any) => C.sessionState.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'The sheets as the reply left them', status: 'Noting what changed' },
		})
		/** The ruleset's labelled blocks — its voice and the sheet — for the crib; no dice, no writes. */
		.task(
			'rules',
			($: any) =>
				C.rulesetResolve.v1({
					scope: $.input.sessionScope,
					mode: 'resolve',
				}),
			{ expose: { label: "Read the table's rules", status: 'Noting what changed' } },
		)
		/**
		 * 🚧 The session's lorebook items and how many are left (phase 3b,
		 * restored lane 2): a thing the reckoning names that the book keeps as
		 * an item becomes an item line, and its supply is checked.
		 */
		.query('supply', ($: any) => C.itemSupply.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'How many of each item are left', status: 'Noting what changed' },
		})
		/** 🚧 The places the lorebook describes, with their ways out (*Describe new places*, lane 2). */
		.query('places', ($: any) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The places the lorebook knows', status: 'Noting what changed' },
		})
	const cribbed = jsonPart(
		jsonPart(
			textPart(
				textPart(
					scriptStep(read, w, R, 'crib', STORY_RECKON_CRIB_SCRIPT.seedKey, ($) => ({
						session: $.input.session,
						state: at($, `${R}state`).state,
						reply: $.generate.text,
						blocks: at($, `${R}rules`).blocks,
						ruleset: $.input.ruleset,
						modes: $.tasks.modes,
						places: at($, `${R}places`).entries,
					}), 'What the reckoning reads', 'Noting what changed'),
					w,
					R,
					'cribText',
					crib,
					'crib',
					'The sheets, as text',
				),
				w,
				R,
				'brief',
				crib,
				'brief',
				'The reply, and the question',
			),
			w,
			R,
			'owners',
			crib,
			'owners',
			'Whose sheets',
		),
		w,
		R,
		'fields',
		crib,
		'fields',
		"The rules, for the reckoning's prompt",
	)
	const asked = modelCall(cribbed, w, R, 'reckon', {
		prompt: STORY_PROMPT_KEYS.reckon,
		brief: ($) => at($, `${R}brief`).text,
		crib: ($) => at($, `${R}cribText`).text,
		fields: ($) => at($, `${R}fields`).main,
		cast: terms.cast,
		history: terms.history,
		schema: STORY_RECKON_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'Noting what changed',
			label: 'What the reply changed',
			purpose:
				'Reads the finished reply and notes what it made true — health, conditions, belongings, the place, the time — for the sheets.',
		},
	})
	const sorted = scriptStep(asked, w, R, 'reckoned', STORY_RECKON_SCRIPT.seedKey, ($) => ({
		json: at($, `${R}reckonWrite`).json,
		modes: $.tasks.modes,
		state: at($, `${R}state`).state,
		ruleset: $.input.ruleset,
		supply: at($, `${R}supply`).supply,
		places: at($, `${R}places`).entries,
	}), 'What the reply changed, sorted', 'Noting what changed')
	const C1 = `${R}commit.`
	/**
	 * One arm through the ruleset handler: `apply` for a task on Full,
	 * `propose` for one on Review (lane 2: the handler files every change
	 * for review instead of dropping it).
	 */
	const handlerArm = (k: any, arm: string, member: string, mode: 'apply' | 'propose', what: string, label: string) =>
		jsonPart(k, w, `${C1}${arm}.`, 'deltas', reckoned, member, what).task(
			mode,
			($: any) =>
				C.rulesetResolve.v1({
					scope: $.input.sessionScope,
					owners: at($, `${R}owners`).main,
					deltas: at($, `${C1}${arm}.deltas`).main,
					mode,
				}),
			{ expose: { label, status: 'Noting what changed' } },
		)
	const committed = sorted.junction('commit', { on: reckoned }, (j: any) =>
		j
			/** At `scripts` rigour: the ruleset handler validates, rolls and applies every delta. */
			.when('scripts', { path: 'scripts', truthy: true }, (k: any) =>
				handlerArm(k, 'scripts', 'scripts', 'apply', 'The changes, for the rules', 'Apply the rules'),
			)
			/** At `scripts` rigour, a task on Review: validated and rolled the same, filed for review. */
			.when('scriptsHeld', { path: 'scriptsReview', truthy: true }, (k: any) =>
				handlerArm(k, 'scriptsHeld', 'scriptsReview', 'propose', 'The changes, for review', 'Propose by the rules'),
			)
			/** At a table of words: the pieces (things, conditions) through the handler, at the session's rigour. */
			.when('pieces', { path: 'pieces', truthy: true }, (k: any) =>
				handlerArm(k, 'pieces', 'pieces', 'apply', 'The pieces gained and lost', 'Keep the pieces'),
			)
			/** The same, for a task on Review: offered, never dropped. */
			.when('piecesHeld', { path: 'piecesReview', truthy: true }, (k: any) =>
				handlerArm(k, 'piecesHeld', 'piecesReview', 'propose', 'The pieces, for review', 'Propose the pieces'),
			)
			/** At a table of words: the values, by name; applied on Full, held for review otherwise. */
			.when('words', { path: 'words', truthy: true }, (k: any) => {
				const Wd = `${C1}words.`
				return jsonPart(
					jsonPart(k, w, Wd, 'changes', reckoned, 'words', 'The values changed'),
					w,
					Wd,
					'clockAsk',
					reckoned,
					'clockReview',
					'A clock move to propose',
				)
					.query('resolve', ($: any) =>
						C.resolveStateChanges.v1({
							changes: at($, `${Wd}changes`).main,
							clock: at($, `${Wd}clockAsk`).main,
							base: at($, `${R}state`).version,
							scope: $.input.sessionScope,
							// 🚧 Phase 3b, restored: an item line past its supply is a sentence.
							supply: at($, `${R}supply`).supply,
						}),
					)
					.junction('mode', { on: ($: any) => $.tasks.modes }, (m: any) =>
						m
							.when('applied', { path: 'attributes', equals: 'full' }, (a: any) =>
								a.task(
									'apply',
									($: any) =>
										C.setState.v1({
											changes: at($, `${Wd}resolve`).changes,
											scope: $.input.sessionScope,
											base: at($, `${R}state`).version,
											worldRow: $.save.messageId,
											params: slot.params(),
										}),
									{ expose: { label: 'Apply the changes' } },
								),
							)
							.otherwise('held', (a: any) =>
								a.task(
									'propose',
									($: any) =>
										C.setState.v1({
											changes: at($, `${Wd}resolve`).changes,
											scope: $.input.sessionScope,
											base: at($, `${R}state`).version,
											worldRow: $.save.messageId,
											params: slot.params(),
										}),
									{ expose: { label: 'Propose the changes' } },
								),
							),
					)
			}),
	)
	w.params.push([`${C1}words.mode.applied.apply`, { mode: 'apply' }])
	w.params.push([`${R}places`, { entryTypes: ['core:entry/location'], withLinks: true }])
	/**
	 * 🚧 *Describe new places* (`places-on-move`, lane 2): a new place, filed
	 * with its ways out to the places the book knows — each link both ways, so
	 * the place the party came from leads to it too; on Review, held at the
	 * review gate. ⏳ A place the book already holds is left as written: no
	 * outlet rewrites an entry, and a link between two standing places takes
	 * an id the reckoning cannot hand over (the Dungeon Crawler's same gap).
	 */
	const placed = committed
		.junction('place', { on: reckoned }, (j: any) => {
			const arm = (b: any, mode: 'full' | 'review') => {
				const X = `${R}place.${mode}.`
				w.params.push([`${X}write`, { entryType: 'core:entry/location' }])
				if (mode === 'review') review.push(`${X}write`)
				const doc = ($: any) => at($, `${X}doc`).main
				const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
				return jsonPart(
					textPart(
						textPart(jsonPart(b, w, X, 'doc', reckoned, mode === 'full' ? 'placeFull' : 'placeReview', rv('The new place')), w, X, 'name', doc, 'name', rv("The place's name")),
						w,
						X,
						'content',
						doc,
						'content',
						rv('What the place is like'),
					),
					w,
					X,
					'links',
					doc,
					'links',
					rv('Its ways out'),
				).outlet(
					'write',
					($: any) =>
						C.createLoreEntry.v1({
							name: at($, `${X}name`).text,
							content: at($, `${X}content`).text,
							links: at($, `${X}links`).main,
							params: slot.params(),
						}),
					{ expose: { label: mode === 'full' ? 'File the place' : 'Hold the place for review' } },
				)
			}
			return j
				.when('full', { path: 'placeFull', truthy: true }, (b: any) => arm(b, 'full'))
				.when('review', { path: 'placeReview', truthy: true }, (b: any) => arm(b, 'review'))
		})
	return placed.junction('time', { on: reckoned }, (j: any) =>
		j.when('moves', { path: 'clock', truthy: true }, (k: any) => {
			const T = `${R}time.moves.`
			return jsonPart(k, w, T, 'step', reckoned, 'clock', 'The time the reply took')
				.task('decided', ($: any) =>
					C.clockStep.v1({
						step: at($, `${T}step`).main,
						unless: $.input.continuationPrefill,
						params: slot.params(),
					}),
				)
				.junction('clock', { on: ($: any) => at($, `${T}decided`).moves }, (c: any) =>
					c.when('moves', { truthy: true }, (o: any) =>
						o.outlet(
							'advance',
							($: any) =>
								C.advanceStoryClock.v1({
									by: at($, `${T}decided`).by,
									unit: at($, `${T}decided`).unit,
									cause: 'keeper',
									onRefusal: 'skip',
									params: slot.params(),
								}),
							{ expose: { label: 'Move the story clock' } },
						),
					),
				)
		}),
	)
}

/** Lorebook entries from a list, Full and Review alike — `<prefix><key>.full.*` / `.review.*`. */
const entryWrites = (
	c: any,
	w: Wiring,
	review: string[],
	S: string,
	swept: ($: any) => unknown,
	key: string,
	member: string,
	entryType: string,
	noun: string,
	max: number,
) =>
	c.junction(key, { on: swept }, (j: any) => {
		const arm = (b: any, mode: 'full' | 'review') => {
			const X = `${S}${key}.${mode}.`
			const M = `${X}entry.item.`
			w.params.push([`${M}write`, { entryType }])
			if (mode === 'review') review.push(`${M}write`)
			const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
			return jsonPart(b, w, X, 'list', swept, `${member}${mode === 'full' ? 'Full' : 'Review'}`, rv(`The ${noun}s`)).each(
				'entry',
				{ over: ($: any) => at($, `${X}list`).main, max },
				(m: any) => {
					const item = ($: any) => at($, M.slice(0, -1))
					return textPart(
						textPart(m, w, M, 'name', item, 'name', rv(`The ${noun}'s name`)),
						w,
						M,
						'content',
						item,
						'content',
						rv(`What the ${noun} says`),
					).outlet(
						'write',
						($: any) =>
							C.createLoreEntry.v1({
								name: at($, `${M}name`).text,
								content: at($, `${M}content`).text,
								params: slot.params(),
							}),
						{ expose: { label: mode === 'full' ? `File the ${noun}` : `Hold the ${noun} for review` } },
					)
				},
			)
		}
		return j
			.when('full', { path: `${member}Full`, truthy: true }, (b: any) => arm(b, 'full'))
			.when('review', { path: `${member}Review`, truthy: true }, (b: any) => arm(b, 'review'))
	})

/** The sweep — `sweep.due.*`. Returns the chain and the write steps the preset holds at the review gate. */
const sweepBranch = (s: any, w: Wiring, terms: StoryTasksTerms, review: string[]) => {
	const S = 'sweep.due.'
	const crib = ($: any) => at($, `${S}crib`).main
	const swept = ($: any) => at($, `${S}swept`).main
	const read = s.query('state', ($: any) => C.sessionState.v1({ scope: $.input.sessionScope }), {
		expose: { label: 'The world as it stands', status: 'Looking back over the story' },
	})
	const cribbed = jsonPart(
		textPart(
			textPart(
				scriptStep(read, w, S, 'crib', STORY_SWEEP_CRIB_SCRIPT.seedKey, ($) => ({
					session: $.input.session,
					state: at($, `${S}state`).state,
					modes: $.tasks.modes,
				}), 'What the sweep is asked', 'Looking back over the story'),
				w,
				S,
				'cribText',
				crib,
				'crib',
				'The world, as text',
			),
			w,
			S,
			'brief',
			crib,
			'brief',
			'What to look for',
		),
		w,
		S,
		'fields',
		crib,
		'fields',
		"The sweep's prompt fields",
	)
	const asked = modelCall(cribbed, w, S, 'sweep', {
		prompt: STORY_PROMPT_KEYS.sweep,
		brief: ($) => at($, `${S}brief`).text,
		crib: ($) => at($, `${S}cribText`).text,
		fields: ($) => at($, `${S}fields`).main,
		cast: terms.cast,
		history: terms.history,
		schema: STORY_SWEEP_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'Looking back over the story',
			label: 'Look back over the story',
			purpose:
				'Every few turns, looks back over the story and files what is worth keeping: a summary, new lore and people, the world as it now stands.',
		},
	})
	const sorted = scriptStep(asked, w, S, 'swept', STORY_SWEEP_SCRIPT.seedKey, ($) => ({
		json: at($, `${S}sweepWrite`).json,
		modes: $.tasks.modes,
	}), 'What the sweep found, sorted', 'Looking back over the story')
	/** The summary — one history entry. */
	const summarized = sorted.junction('summary', { on: swept }, (j: any) => {
		const arm = (b: any, mode: 'full' | 'review') => {
			const X = `${S}summary.${mode}.`
			const member = mode === 'full' ? 'summaryFull' : 'summaryReview'
			w.params.push([`${X}write`, { entryType: 'core:entry/history' }])
			if (mode === 'review') review.push(`${X}write`)
			const doc = ($: any) => at($, `${X}doc`).main
			const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
			return textPart(
				textPart(jsonPart(b, w, X, 'doc', swept, member, rv('The summary, as written')), w, X, 'name', doc, 'name', rv("The summary's title")),
				w,
				X,
				'content',
				doc,
				'content',
				rv('The summary'),
			).outlet(
				'write',
				($: any) =>
					C.createLoreEntry.v1({
						name: at($, `${X}name`).text,
						content: at($, `${X}content`).text,
						params: slot.params(),
					}),
				{ expose: { label: mode === 'full' ? 'File the summary' : 'Hold the summary for review' } },
			)
		}
		return j
			.when('full', { path: 'summaryFull', truthy: true }, (b: any) => arm(b, 'full'))
			.when('review', { path: 'summaryReview', truthy: true }, (b: any) => arm(b, 'review'))
	})
	const lored = entryWrites(summarized, w, review, S, swept, 'lore', 'lore', 'core:entry/world-lore', 'lore entry', 6)
	const peopled = entryWrites(lored, w, review, S, swept, 'cast', 'cast', 'core:entry/character-lore', 'person', 4)
	const placed = entryWrites(peopled, w, review, S, swept, 'scenes', 'scenes', 'core:entry/location', 'location', 4)
	/** The world's state — changes on the world, applied on Full, proposed on Review. */
	const worlded = placed.junction('world', { on: swept }, (j: any) => {
		const arm = (b: any, mode: 'full' | 'review') => {
			const X = `${S}world.${mode}.`
			if (mode === 'full') w.params.push([`${X}apply`, { mode: 'apply' }])
			return jsonPart(b, w, X, 'changes', swept, mode === 'full' ? 'worldFull' : 'worldReview', mode === 'review' ? "The world's changes (for review)" : "The world's changes")
				.query('resolve', ($: any) =>
					C.resolveStateChanges.v1({
						changes: at($, `${X}changes`).main,
						base: at($, `${S}state`).version,
						scope: $.input.sessionScope,
					}),
				)
				.task(
					mode === 'full' ? 'apply' : 'propose',
					($: any) =>
						C.setState.v1({
							changes: at($, `${X}resolve`).changes,
							scope: $.input.sessionScope,
							base: at($, `${S}state`).version,
							worldRow: $.save.messageId,
							params: slot.params(),
						}),
					{ expose: { label: mode === 'full' ? "Keep the world's state" : "Propose the world's state" } },
				)
		}
		return j
			.when('full', { path: 'worldFull', truthy: true }, (b: any) => arm(b, 'full'))
			.when('review', { path: 'worldReview', truthy: true }, (b: any) => arm(b, 'review'))
	})
	/**
	 * 🚧 How the characters stand (lane 2, 2026-10-19): the ties the sweep
	 * found, filed as a graph proposal on the lorebook's Graph review screen
	 * — the existing relationship proposal path. A proposal on Full and on
	 * Review alike: the graph never applies itself.
	 */
	const tied = worlded.junction('relationships', { on: swept }, (j: any) =>
		j.when('proposed', { path: 'relationships', truthy: true }, (b: any) =>
			jsonPart(b, w, `${S}relationships.proposed.`, 'ties', swept, 'relationships', 'How they stand').outlet(
				'propose',
				($: any) => C.graphProposal.v1({ proposal: at($, `${S}relationships.proposed.ties`).main }),
				{ expose: { label: 'Propose how they stand' } },
			),
		),
	)
	/** The goals — the session's running note (`annex.core['story-goals']`). */
	return tied.junction('goals', { on: swept }, (j: any) =>
		j.when('noted', { path: 'goals', truthy: true }, (b: any) =>
			textPart(b, w, `${S}goals.noted.`, 'text', swept, 'goals', 'The goals, as text').outlet(
				'write',
				($: any) =>
					C.setSessionAnnex.v1({
						value: { [STORY_GOALS_KEY]: at($, `${S}goals.noted.text`).text } as any,
						params: slot.params(),
					}),
				{ expose: { label: 'Keep the goals' } },
			),
		),
	)
}

/**
 * 🚧 The tail: the reckoning and the sweep behind their junctions, on what
 * the reply's head resolved — its `tasks` step (`respond.ts`, moved there in
 * lane 2 so the reply group obeys its own tasks). `review` collects the
 * write steps the spec's preset puts behind the review gate
 * (`settings(node, { review: 'on' })`).
 * @internal
 */
export const storyTasksTail = (c: any, w: Wiring, terms: StoryTasksTerms, review: string[]) =>
	c
		.junction('reckon', { on: ($: any) => $.tasks.reckoning }, (j: any) =>
			j.when('on', { truthy: true }, (r: any) => reckonBranch(r, w, terms, review)),
		)
		.junction('sweep', { on: ($: any) => $.tasks.sweep }, (j: any) =>
			j.when('due', { truthy: true }, (s: any) => sweepBranch(s, w, terms, review)),
		)
