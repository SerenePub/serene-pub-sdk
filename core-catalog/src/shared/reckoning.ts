/**
 * 🚧 **A reckoning routine** — the graph, the scripts and the delta grammar
 * every reckoning shares (moved here from `genres/story/reckoning.ts` and
 * `genres/story/reckon.ts` on 2026-10-23, PLAN-genres-seams S5): Story's
 * `core:spec/story-reckoning` and the Lair's `core:spec/lair-keeper` are this
 * graph under their own id, prompt row and duty defaults. The old paths
 * re-export every name; the seed keys and every document are byte for byte
 * what they were.
 *
 * After a round of the story (or a turn — the cadence an administrator picks,
 * R36), ONE JSON call reads the story's newest lines and notes what they made
 * true — health, conditions, belongings, the place, the time — and files it:
 * applied on **Full**, held for review on **Review** (each duty's mode, read
 * from the routine's, `$.input.routine`). Its duties — *Keep the sheets*,
 * *Track conditions*, *Move the clock*, *Describe new places*, *End what runs
 * out* — are its own settings, a switch each (`core:task/reckoning-duties@1`);
 * with none on, nothing is asked. Its crib is the cast's sheets, those lines
 * and the ruleset's voice.
 *
 * 🚧 **One change grammar** (PLAN-genres-seams S1, ★C, 2026-10-23): its
 * answer's `changes` are the session's rules' own — `ruleset-resolve`'s
 * `replySchema`, the grammar a reply that carries changes answers in (an
 * attribute's value, an entry gained or lost; owner, op, value, name,
 * reason) — written in the subset every backend compiles (empty text for
 * none), with the sheets' own words beside the rules' attributes. What the
 * rules keep — their attributes, their entry types — goes through the
 * ruleset handler (`core:task/ruleset-resolve@1`, `apply` on Full, `propose`
 * on Review); what they keep nothing of — the sheet's values in words, and
 * everything under rules that decide nothing (Freeform) — is written in
 * words: resolved by name (`resolve-state-changes@1`), applied on **Full**,
 * held as proposals on **Review**. It proposes no check: the lines already
 * said how things went. Was the delta grammar (`STORY_DELTA_SCHEMA`: slot,
 * repertoire, piece, check, against — retired). The clock moves by the
 * story's own time; a new place is filed with its ways out.
 *
 * It reads only the session — the history, the cast and the state through
 * queries — so it fits any cadence (R4, R12).
 * @internal
 */
import { compile, slot, spec, coreEvents, type ChainBuilder, type OutPortsOf } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../loadouts.js'
import {
	applyWiring,
	heldForReview,
	jsonPart,
	modelCall,
	on,
	scriptStep,
	textPart,
	wiring,
	type BranchOf,
	type ChainNodes,
	type NodeOn,
	type Plus,
	type ReadOn,
	type Wiring,
} from './calls.js'
import { DELTA_OF_JS } from './deltas.js'
import { seedScript, type CoreScriptSeed } from './scriptSeed.js'
import { bareEntryTypeId, locationEntryType } from '../registry/entries.js'

/**
 * 🚧 **One change the reckoning may note, open** (S1, 2026-10-23): the reply
 * schema's change (`ruleset-resolve`'s `replySchema` — `owner`, `changes`
 * (`attribute` or `entry`), `attribute`, `entryType`, `op`, `value`, `name`,
 * `reason`) in the subset every backend compiles: no nulls — empty text says
 * "none", as the grammar-compiling families need. The crib fills its words
 * at run time from the session's rules and sheets (`owner`'s references, the
 * attributes and entry types the rules keep, the sheets' own words); this
 * open form is what it asks when the rules are not installed. Replaces the
 * delta grammar (`STORY_DELTA_SCHEMA`, retired with its `slot` · `repertoire`
 * · `piece` · `check` · `against`).
 * @experimental
 */
export const RECKON_CHANGE_SCHEMA = Object.freeze({
	type: 'object',
	properties: {
		owner: { type: 'string', description: 'Whose: a reference from the sheets, or world.' },
		changes: { type: 'string', enum: ['attribute', 'entry'], description: 'A value changed, or an entry gained or lost.' },
		attribute: { type: 'string', description: 'The value changed, by the word the sheets use; empty for an entry.' },
		entryType: { type: 'string', description: 'The kind of entry gained or lost; empty for a value.' },
		op: { type: 'string', enum: ['add', 'spend', 'set', 'remove'] },
		value: { type: 'string', description: 'An amount (add, spend), or the new value (set); empty for an entry.' },
		name: { type: 'string', description: "The entry's name; empty for a value." },
		reason: { type: 'string', description: 'Why, in a few words from the lines.' },
	},
	required: ['owner', 'changes', 'attribute', 'entryType', 'op', 'value', 'name', 'reason'],
	additionalProperties: false,
})

/** 🚧 How much story time the lines took — a list, so the grammar can say none (Adventure's keeper `clock`, kept). @internal */
const RECKON_CLOCK_SCHEMA = {
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
} as const

/**
 * 🚧 *Describe new places* (`places-on-move`, lane 2): when the lines moved
 * the story somewhere the lorebook has not described — the place, what it is
 * like, and the places its ways out lead to. Empty when nothing moved, or the
 * duty is off. @internal
 */
const RECKON_PLACE_SCHEMA = {
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
} as const

/**
 * 🚧 The reckoning's answer: the **changes** the lines made true (one change
 * grammar, S1 — `RECKON_CHANGE_SCHEMA`, its words the session's), how much
 * story time they took (`clock`), and a new place (`place`). This open form
 * is the envelope; the crib hands the call the session's own
 * (`STORY_RECKON_CRIB_SCRIPT`'s `schema`), every member required as here.
 * @experimental
 */
export const STORY_RECKON_SCHEMA = {
	type: 'object',
	properties: {
		changes: { type: 'array', maxItems: 12, items: RECKON_CHANGE_SCHEMA },
		clock: RECKON_CLOCK_SCHEMA,
		place: RECKON_PLACE_SCHEMA,
	},
	required: ['changes', 'clock', 'place'],
	additionalProperties: false,
} as const

/**
 * The Story scripts' one preamble: the readers `deltaOf` needs (`own`,
 * `text`, `num`, `ucSlotName`, an empty `NOT_FOR_DELTAS` — every slot may
 * move here), `deltaOf` itself (`shared/deltas.ts`), the state key a
 * reference reads under, the cast as the settings document seats it, and a
 * duty's mode. Plain ES5 so any sandbox runs it. The sweep's scripts
 * (`genres/story/reckon.ts`) open on it too.
 * @internal
 */
export const STORY_PREAMBLE = `
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
 * 🚧 What the session's rules keep, as the reckoning's two scripts read it
 * (S1): `rulesOf(schema, ruleset, state)` — from `ruleset-resolve`'s
 * `replySchema` (its attribute and entry-type words) and the inlet's
 * `ruleset` (its own `attributes` — never one it only borrows: the sheets
 * keep that, as the reply schema leaves it out — and its `entryTypes` with
 * their tags): `ruled` (attribute id → true),
 * `entryTypes`, `condition(id)` (an entry type tagged `condition`; with no
 * tags known, the one named `conditions`) and `words` — what the sheets keep
 * that the rules do not (`state.slots`: a value a model may write, never a
 * list, a derived value, a retired one or one only its holder hears). ES5,
 * spliced after the preamble.
 * @internal
 */
const RULES_OF_JS = `
function wordsOf(list) { var out = []; if (Array.isArray(list)) for (var i = 0; i < list.length; i++) if (typeof list[i] === "string" && list[i]) out.push(list[i]); return out; }
function rulesOf(schema, ruleset, state) {
	var item = own(own(own(own(schema).properties).changes).items), given = own(item.properties);
	var r = own(ruleset), ruled = {}, ruledList = [], entryTypes = [], tags = {}, seen = {};
	function rule(id) { if (id && !ruled[id]) { ruled[id] = true; ruledList.push(id); } }
	var named = wordsOf(own(given.attribute).enum);
	for (var a = 0; a < named.length; a++) rule(named[a]);
	var ra = Array.isArray(r.attributes) ? r.attributes : [];
	// The rules' own attributes — never one they only borrow (the sheets keep it, as the reply schema says).
	for (var b = 0; b < ra.length; b++) if (own(ra[b]).borrowed !== true) rule(text(own(ra[b]).id));
	var en = wordsOf(own(given.entryType).enum);
	var re = Array.isArray(r.entryTypes) ? r.entryTypes : [];
	for (var c = 0; c < re.length; c++) {
		var et = own(re[c]), id = text(et.id);
		if (!id) continue;
		tags[id] = Array.isArray(et.tags) ? et.tags : [];
		// No reply schema (the rules not installed): the inlet's entryable types.
		if (!item.properties && et.entryable !== false) en.push(id);
	}
	for (var d = 0; d < en.length; d++) if (!seen[en[d]]) { seen[en[d]] = true; entryTypes.push(en[d]); }
	function condition(id) { var t = tags[id]; return t ? t.indexOf("condition") >= 0 : id === "conditions"; }
	var words = [], slots = Array.isArray(own(state).slots) ? own(state).slots : [];
	for (var s = 0; s < slots.length; s++) {
		var row = own(slots[s]), key = text(row.key), type = text(row.type);
		if (!key || ruled[key] || row.retired || row.earshot === "holder") continue;
		if (type !== "integer" && type !== "enum" && type !== "text" && type !== "boolean") continue;
		if (words.indexOf(key) < 0) words.push(key);
	}
	return { ruled: ruled, ruledList: ruledList, entryTypes: entryTypes, condition: condition, words: words, given: given };
}
`

/**
 * 🚧 `core:script/story-reckon-crib`: what the reckoning reads. Handed
 * `{ session, state, history, blocks, ruleset, modes, places, schema }` — the
 * settings document, the session's state, the history (the story's lines
 * since the newest person's line are what it reads for changes; a `reply`,
 * when handed one, wins), the ruleset handler's `resolve` blocks, the
 * inlet's ruleset, the duties' modes, the lorebook's places and 🚧 the
 * rules' change grammar (`ruleset-resolve`'s `replySchema`, S1). Returns
 * `{ crib, brief, owners, fields, schema }`: the crib (the world and each
 * seated person's sheet, by reference — never a value only its holder hears,
 * `earshot: 'holder'`), the brief (the reply, and what to answer), the owners
 * the handler resolves, the prompt's named fields — `rulesetVoice`,
 * `rulesetSheet`, `rigourLine`, `canChange`, `difficulty` — and 🚧 the call's
 * `schema`: `STORY_RECKON_SCHEMA` with the session's words in its `changes`
 * (the owners by reference, the attributes and entry types the duties on may
 * note, the sheets' own words beside the rules').
 * @experimental
 */
export const STORY_RECKON_CRIB_SCRIPT = storySeed(
	'core:script/story-reckon-crib',
	'Story: what the reckoning reads',
	`${RULES_OF_JS}
var doc = own(v.session), state = own(v.state), modes = own(v.modes);
var people = peopleOf(doc);
var lines = [];
// 🚧 The places the lorebook already describes (lane 2: *Describe new places*).
var placeNames = [];
var placeRows = Array.isArray(v.places) ? v.places : [];
for (var pl = 0; pl < placeRows.length && placeNames.length < 40; pl++) { var pn = text(own(placeRows[pl]).name); if (pn) placeNames.push(pn); }
// A value only its holder's own voice hears (a slot whose state row says
// earshot "holder": the Lair's whisper) never reaches the crib, which is
// nobody's voice. A bag holds it under its bare key and its qualified one.
var held = {};
var slotRows = Array.isArray(state.slots) ? state.slots : [];
for (var si = 0; si < slotRows.length; si++) {
	var sr = own(slotRows[si]);
	if (sr.earshot !== "holder" || typeof sr.id !== "string") continue;
	if (text(sr.key)) held[text(sr.key)] = true;
	held[sr.id.replace(/@\\d+$/, "").replace(/:slot\\//, "_").replace(/[.\\-]/g, "_")] = true;
}
function heard(bag) { var out = {}; for (var k in bag) if (!held[k]) out[k] = bag[k]; return out; }
var world = bagLine(heard(own(state.world)));
lines.push("The world [world]: " + (world || "nothing tracked yet") + ".");
var byId = own(own(state.cast).byId);
for (var i = 0; i < people.length; i++) {
	var p = people[i];
	var sheet = bagLine(heard(own(byId[stateKeyOf(p.ref)])));
	lines.push("- " + (p.name || "someone") + " [" + p.ref + "]" + (p.plays ? " (played by a person)" : "") + ": " + (sheet || "nothing tracked yet") + ".");
}
var owners = ["session:" + text(doc.sessionId)];
for (var o = 0; o < people.length; o++) owners.push(people[o].ref);
var blocks = own(v.blocks);
function blockText(b) { return b && typeof b === "object" ? text(b.text) : text(b); }
var rigour = text(own(v.ruleset).rigour) || "prose";
var counted = rigour === "mechanics" || rigour === "scripts";
// 🚧 S1: what the duties on may note, in the session's rules' words.
var rules = rulesOf(v.schema, v.ruleset, state);
var sheetsOn = modeOf(modes, "attributes") !== "off", condsOn = modeOf(modes, "conditions") !== "off";
var values = sheetsOn ? rules.ruledList.concat(rules.words) : [];
var conds = [], things = [];
for (var e = 0; e < rules.entryTypes.length; e++) (rules.condition(rules.entryTypes[e]) ? conds : things).push(rules.entryTypes[e]);
var entries = (sheetsOn ? things : []).concat(condsOn ? conds : []);
var can = [];
if (values.length) can.push("a value the lines changed — " + values.join(", ") + " (changes attribute; op set with the new value, or add or spend with an amount)");
if (sheetsOn && things.length) can.push("a thing gained, lost or used up — kept as " + things.join(", ") + " (changes entry; op add or remove; name it)");
if (condsOn && conds.length) can.push("a condition put on or taken off — kept as " + conds.join(", ") + " (changes entry; op add or remove; the condition in a word or two)");
if (modeOf(modes, "time") !== "off") can.push("how much story time the reply took, when it took meaningful time (clock)");
if (modeOf(modes, "places-on-move") !== "off") can.push("the place the reply moved the story to, when the lorebook does not describe it yet (place: its name, what it is like, and the places its ways out lead to)" + (placeNames.length ? " — the lorebook already describes: " + placeNames.join(", ") : ""));
// 🚧 The call's schema: the one change grammar, its words this session's.
function pinned(list) { return list.length ? list.concat([""]) : [""]; }
var kinds = [];
if (values.length) kinds.push("attribute");
if (entries.length) kinds.push("entry");
var ops = [];
function op(x) { if (ops.indexOf(x) < 0) ops.push(x); }
var givenOps = wordsOf(own(rules.given.op).enum);
for (var g = 0; g < givenOps.length; g++) op(givenOps[g]);
if (values.length) { op("set"); op("add"); op("spend"); }
if (entries.length) { op("add"); op("remove"); }
var refs = ["world"];
for (var q = 0; q < people.length; q++) refs.push(people[q].ref);
// The rules' attributes as their schema describes them (kind, bounds, ops); the sheets' by their words.
var rulesSaid = text(own(rules.given.attribute).description).replace(/^The attribute — /, "").replace(/\\.$/, "");
var attributeSaid = "The value changed";
if (sheetsOn && rules.ruledList.length) attributeSaid += " — by the rules: " + (rulesSaid || rules.ruledList.join(", "));
if (sheetsOn && rules.words.length) attributeSaid += (rules.ruledList.length ? "; in the sheets' words: " : " — in the sheets' words: ") + rules.words.join(", ");
var change = {
	type: "object",
	properties: {
		owner: { type: "string", enum: refs, description: "Whose: a reference from the sheets, or world." },
		changes: { type: "string", enum: kinds.length ? kinds : ["attribute"], description: "A value changed, or an entry gained or lost." },
		attribute: { type: "string", enum: pinned(values), description: attributeSaid + "; empty for an entry." },
		entryType: { type: "string", enum: pinned(entries), description: "The kind of entry gained or lost" + (entries.length ? " — " + entries.join(", ") : "") + "; empty for a value." },
		op: { type: "string", enum: ops.length ? ops : ["set"] },
		value: { type: "string", description: "An amount (add, spend), or the new value (set); empty for an entry." },
		name: { type: "string", description: "The entry's name; empty for a value." },
		reason: { type: "string", description: "Why, in a few words from the lines." }
	},
	required: ["owner", "changes", "attribute", "entryType", "op", "value", "name", "reason"],
	additionalProperties: false
};
// The story's newest lines — everything said since the newest person's line
// (a turn, or a round of them): what the reckoning reads for what changed.
var reply = text(v.reply);
if (!reply) {
	var hist = Array.isArray(v.history) ? v.history : [], said = [];
	for (var h = hist.length - 1; h >= 0; h--) {
		var row = own(hist[h]);
		if (row.role === "user") break;
		var said1 = text(row.content) || text(row.message);
		if (said1 && (!row.channel || text(row.channel) === "main")) said.unshift(said1);
	}
	reply = said.join("\\n\\n");
}
return {
	crib: lines.join("\\n"),
	brief: "The reply just written:\\n" + (reply || "(empty)") + "\\n\\nWhat did it change?",
	owners: owners,
	fields: {
		rulesetVoice: blockText(blocks.voice),
		rulesetSheet: blockText(blocks.sheet),
		rigourLine: counted
			? "The table's rules keep the numbers: note each change as an amount (add or spend) or a new value (set), never a total you worked out. The lines already said how things went — propose no check."
			: "Nothing is rolled at this table: note what the lines made true, in the sheets' own words where no number is kept.",
		canChange: can.length ? can.join("; ") : "nothing",
		difficulty: text(own(doc.fields).difficulty) || "normal"
	},
	schema: {
		type: "object",
		properties: { changes: { type: "array", maxItems: 12, items: change }, clock: ${JSON.stringify(RECKON_CLOCK_SCHEMA)}, place: ${JSON.stringify(RECKON_PLACE_SCHEMA)} },
		required: ["changes", "clock", "place"],
		additionalProperties: false
	}
};
`,
)

/**
 * 🚧 `core:script/story-reckon`: the reckoning's answer, sorted. Handed
 * `{ json, modes, state, ruleset, supply, places, schema }`. Each change read
 * one way (S1: the one change grammar — `changeOf`, empty text for none); a
 * value or a thing kept only while *Keep the sheets* is on, a condition only
 * while *Track conditions* is, the clock only while *Move the clock* is — and
 * each kept by its own duty's mode, Full or Review (lane 2, 2026-10-19:
 * Review used to drop the pieces). Returns:
 *
 *  - `ruled` · `ruledHeld` — what the rules keep (an attribute of theirs, an
 *    entry of a type of theirs), in the reply schema's own form
 *    (`{ owner, changes, attribute | entryType, op, value?, name?, reason }`):
 *    the ruleset handler applies the Full ones and files the Review ones for
 *    review (its `propose` mode);
 *  - `words` — what the rules keep nothing of, made whole: a sheet's value by
 *    its word — a set as it is, an add or a spend counted from what the state
 *    holds now — and 🚧 a thing the session's lorebook keeps as an item
 *    (`supply`, the `core:query/item-supply@1` answer) as an item line
 *    `{ owner, entryId, delta }`, so `resolve-state-changes@1` checks its
 *    supply (phase 3b: a unique item held is not handed out again);
 *  - `owners` — whose rules the changes touch;
 *  - `clock` — `{ by, unit }` to move now (time Full), else null;
 *    `clockReview` — `{ clock: [{ by, unit }] }` to propose (time Review),
 *    else `{ clock: [] }`.
 * @experimental
 */
export const STORY_RECKON_SCRIPT = storySeed(
	'core:script/story-reckon',
	'Story: what the reply changed',
	`${RULES_OF_JS}
var j = own(v.json), modes = own(v.modes), state = own(v.state);
var rules = rulesOf(v.schema, v.ruleset, state);
// One change, read one way (S1): empty text says none; an amount reads as a number.
function changeOf(raw) {
	var d = own(raw), owner = text(d.owner), op = text(d.op), attribute = text(d.attribute), entryType = text(d.entryType);
	if (!owner || !op) return null;
	var c = { owner: owner, op: op };
	if (entryType && (text(d.changes) === "entry" || !attribute)) {
		var nm = text(d.name);
		if (!nm) return null;
		c.changes = "entry"; c.entryType = entryType; c.name = nm;
	} else if (attribute) {
		c.changes = "attribute"; c.attribute = attribute;
		var val = text(d.value);
		if (val) c.value = /^-?\\d+(\\.\\d+)?$/.test(val) ? Number(val) : val;
	} else return null;
	if (text(d.reason)) c.reason = text(d.reason);
	return c;
}
function dutyOf(c) { return c.entryType && rules.condition(c.entryType) ? "conditions" : "attributes"; }
function nowOf(owner, word) {
	var bag = owner === "world" ? own(state.world) : own(own(own(state.cast).byId)[stateKeyOf(owner)]);
	return bag[word];
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
var raw = Array.isArray(j.changes) ? j.changes : [];
var ruled = [], ruledHeld = [], words = [], owners = [], seen = {};
for (var i = 0; i < raw.length; i++) {
	var x = changeOf(raw[i]);
	if (!x) continue;
	var mode = modeOf(modes, dutyOf(x));
	if (mode === "off") continue;
	var full = mode === "full";
	if (x.entryType) {
		var item = !rules.condition(x.entryType) ? itemNamed(x.name) : null;
		if (item && (x.op === "add" || x.op === "remove" || x.op === "spend")) {
			words.push({ owner: x.owner, entryId: item.entryId, delta: x.op === "add" ? 1 : -1 });
			continue;
		}
	} else if (!rules.ruled[x.attribute]) {
		// What the rules keep nothing of: a sheet's value, by its word.
		if (x.op === "set") { if (x.value !== undefined) words.push({ owner: x.owner, slot: x.attribute, value: x.value }); continue; }
		if (x.op === "add" || x.op === "spend") {
			var now = num(nowOf(x.owner, x.attribute), null), by = num(x.value, null);
			if (now === null || by === null) continue;
			words.push({ owner: x.owner, slot: x.attribute, value: x.op === "add" ? now + by : now - by });
		}
		continue;
	}
	(full ? ruled : ruledHeld).push(x);
	if (!seen[x.owner]) { seen[x.owner] = true; owners.push(x.owner); }
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
	ruled: ruled.length ? ruled : null,
	ruledHeld: ruledHeld.length ? ruledHeld : null,
	words: words.length || (move && time === "review") ? words : null,
	owners: owners,
	clock: move && time === "full" ? move : null,
	clockReview: { clock: move && time === "review" ? [move] : [] }
};
`,
)

/**
 * The routine's head: its inlet, its duties, and what the reckoning reads the
 * story through. `id`, `version` and the duties card's title are the
 * routine's own.
 */
const reckoningHead = (id: string, version: string, dutiesTitle: string) =>
	spec(id, {
		version,
		taxonomy: { role: 'maintenance' },
	})
		/** A routine (D2): the session, where it resides, what its event carried. */
		.inlet('input', C.routine.v1(), { suits: [coreEvents.roundEnded, coreEvents.turnEnded] })
		/** Its duties — a switch each, the owner's — at the routine's mode. No model call. */
		.task('duties', ($) => C.reckoningDuties.v1({ routine: $.input.routine, params: slot.params() }), {
			expose: { session: true, label: dutiesTitle },
		})
		/** What the reckoning reads the story through: the newest lines, and who is seated. */
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The story so far', status: 'Noting what changed' },
		})
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'Who is seated', status: 'Noting what changed' },
		})

/** The chain the reckoning's branch extends — `reckon.on`, after the head. @internal */
export type ReckonOn = ChainBuilder<ChainNodes<ReturnType<typeof reckoningHead>>, 'reckon.on'>

/**
 * 🚧 What the reckoning's sort hands its junctions (`core:script/story-reckon`):
 * each write's list or move, present only when it runs — so a branch reads
 * which by a typed path (`(v: Reckoned) => v.scripts`). @internal
 */
interface Reckoned {
	readonly placeFull: unknown
	readonly placeReview: unknown
	/** 🚧 S1: what the rules keep, on Full and on Review. */
	readonly ruled: unknown
	readonly ruledHeld: unknown
	readonly words: unknown
	readonly owners: unknown
	readonly clock: unknown
	readonly clockReview: unknown
}

/** The reckoning's duties as its junctions read them (`core:task/reckoning-duties@1`'s `modes`). @internal */
interface ReckoningModes {
	readonly attributes: string
	readonly conditions: string
	readonly time: string
	readonly 'places-on-move': string
	readonly 'timed-expiry': string
}

/**
 * 🚧 What a reckoning is asked by, beside its graph (2026-10-21, the Lair's
 * keeper reuses this branch): the prompt row it starts on, and where it reads
 * the session's ruleset — the inlet's (`$.input.ruleset`, Story's and the
 * Lair keeper's alike since 2026-10-23: the crib counts `mechanics` and
 * `scripts` alike, so no genre sorts by a ruleset of its own). Story's are
 * `STORY_RECKON_TERMS` (`genres/story/reckon.ts`).
 * @internal
 */
export interface ReckonTerms {
	prompt: string
	ruleset: ReadOn<ReckonOn>
}

/** The reckoning's branch — `reckon.on.*`, on the routine's head (below). @internal */
export const reckonBranch = (
	r: ReckonOn,
	w: Wiring,
	review: NodeOn[],
	terms: ReckonTerms,
): Plus<ReckonOn, 'reckonWrite', OutPortsOf<ReturnType<typeof C.generateJson.v1>>> => {
	const read = r
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'The sheets as the reply left them', status: 'Noting what changed' },
		})
		/**
		 * The ruleset's labelled blocks — its voice and the sheet — for the
		 * crib, and 🚧 its change grammar (`replySchema`, S1: what a reply that
		 * carries changes answers in); no dice, no writes.
		 */
		.task(
			'rules',
			($) =>
				C.rulesetResolve.v1({
					params: slot.params(),
					scope: $.input.sessionScope,
					mode: 'resolve',
					actions: { replyShape: true } as any,
				}),
			{ expose: { label: "Read the table's rules", status: 'Noting what changed' } },
		)
		/**
		 * 🚧 The session's lorebook items and how many are left (phase 3b,
		 * restored lane 2): a thing the reckoning names that the book keeps as
		 * an item becomes an item line, and its supply is checked.
		 */
		.query('supply', ($) => C.itemSupply.v1({ scope: $.input.sessionScope }), {
			expose: { label: 'How many of each item are left', status: 'Noting what changed' },
		})
		/** 🚧 The places the lorebook describes, with their ways out (*Describe new places*, lane 2). */
		.query('places', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The places the lorebook knows', status: 'Noting what changed' },
		})
	const cribbed = jsonPart(
		jsonPart(
			jsonPart(
				textPart(
					textPart(
						scriptStep(read, w, 'crib', STORY_RECKON_CRIB_SCRIPT.seedKey, ($) => ({
							session: $.input.session,
							state: $.state.state,
							history: $.history.messages,
							blocks: $.rules.blocks,
							ruleset: terms.ruleset($),
							modes: $.duties.modes,
							places: $.places.entries,
							// 🚧 S1: the rules' change grammar.
							schema: $.rules.replySchema,
						}), 'What the reckoning reads', 'Noting what changed'),
						w,
						'cribText',
						($) => $.crib.main,
						'crib',
						'The sheets, as text',
					),
					w,
					'brief',
					($) => $.crib.main,
					'brief',
					'The reply, and the question',
				),
				w,
				'owners',
				($) => $.crib.main,
				'owners',
				'Whose sheets',
			),
			w,
			'fields',
			($) => $.crib.main,
			'fields',
			"The rules, for the reckoning's prompt",
		),
		w,
		'schema',
		($) => $.crib.main,
		'schema',
		'What the reckoning may note, as a schema',
	)
	const asked = modelCall(cribbed, w, 'reckon', {
		prompt: terms.prompt,
		brief: ($) => $.brief.text,
		crib: ($) => $.cribText.text,
		fields: ($) => $.fields.main,
		cast: ($) => $.cast.cast,
		history: ($) => $.history.messages,
		// 🚧 S1: the session's rules' change grammar, as the crib wrote it this run.
		schema: ($) => $.schema.main,
		briefTurn: true,
		expose: {
			status: 'Noting what changed',
			label: 'What the reply changed',
			purpose:
				'Reads the finished reply and notes what it made true — health, conditions, belongings, the place, the time — for the sheets.',
		},
	})
	const sorted = scriptStep(asked, w, 'reckoned', STORY_RECKON_SCRIPT.seedKey, ($) => ({
		json: $.reckonWrite.json,
		modes: $.duties.modes,
		state: $.state.state,
		ruleset: terms.ruleset($),
		supply: $.supply.supply,
		places: $.places.entries,
		schema: $.rules.replySchema,
	}), 'What the reply changed, sorted', 'Noting what changed')
	const committed = sorted.junction('commit', { on: ($) => $.reckoned.main }, (j) => {
		/**
		 * One arm through the ruleset handler: `apply` for a duty on Full,
		 * `propose` for one on Review (lane 2: the handler files every change
		 * for review instead of dropping it). 🚧 S1: the changes go as the
		 * reply schema answers them (`attribute` / `entryType`) — the handler
		 * reads them as a reply's (`replyChangesAsDeltas`).
		 */
		const handlerArm = (
			k: BranchOf<typeof j, 'ruled' | 'ruledHeld'>,
			member: keyof Reckoned,
			mode: 'apply' | 'propose',
			what: string,
			label: string,
		) =>
			jsonPart(k, w, 'deltas', ($) => $.reckon.on.reckoned.main, member, what).task(
				mode,
				($) =>
					C.rulesetResolve.v1({
						params: slot.params(),
						scope: $.input.sessionScope,
						owners: $.reckon.on.owners.main,
						deltas: $.deltas.main,
						mode,
					}),
				{ expose: { label, status: 'Noting what changed' } },
			)
		return (
			j
				/** What the rules keep — their attributes, their entries: validated and applied by the handler. */
				.when('ruled', { path: (v: Reckoned) => v.ruled, truthy: true }, (k) =>
					handlerArm(k, 'ruled', 'apply', 'The changes, for the rules', 'Apply the rules'),
				)
				/** The same, for a duty on Review: filed for review, never dropped. */
				.when('ruledHeld', { path: (v: Reckoned) => v.ruledHeld, truthy: true }, (k) =>
					handlerArm(k, 'ruledHeld', 'propose', 'The changes, for review', 'Propose by the rules'),
				)
				/** What the rules keep nothing of: the sheets' values, by name; applied on Full, held for review otherwise. */
				.when('words', { path: (v: Reckoned) => v.words, truthy: true }, (k) =>
					jsonPart(
						jsonPart(k, w, 'changes', ($) => $.reckon.on.reckoned.main, 'words', 'The values changed'),
						w,
						'clockAsk',
						($) => $.reckon.on.reckoned.main,
						'clockReview',
						'A clock move to propose',
					)
						.query('resolve', ($) =>
							C.resolveStateChanges.v1({
								changes: $.changes.main,
								clock: $.clockAsk.main,
								base: $.reckon.on.state.version,
								scope: $.input.sessionScope,
								// 🚧 Phase 3b, restored: an item line past its supply is a sentence.
								supply: $.reckon.on.supply.supply,
							}),
						)
						.junction('mode', { on: ($) => $.duties.modes }, (m) =>
							m
								.when('applied', { path: (v: ReckoningModes) => v.attributes, equals: 'full' }, (a) => {
									w.params.push([on(a, 'apply'), { mode: 'apply' }])
									return a.task(
										'apply',
										($) =>
											C.setState.v1({
												changes: $.reckon.on.commit.words.resolve.changes,
												scope: $.input.sessionScope,
												base: $.reckon.on.state.version,
												params: slot.params(),
											}),
										{ expose: { label: 'Apply the changes' } },
									)
								})
								.otherwise('held', (a) =>
									a.task(
										'propose',
										($) =>
											C.setState.v1({
												changes: $.reckon.on.commit.words.resolve.changes,
												scope: $.input.sessionScope,
												base: $.reckon.on.state.version,
												params: slot.params(),
											}),
										{ expose: { label: 'Propose the changes' } },
									),
								),
						),
				)
		)
	})
	w.params.push([on(r, 'places'), { entryTypes: [bareEntryTypeId(locationEntryType)], withLinks: true }])
	/**
	 * 🚧 *Describe new places* (`places-on-move`, lane 2): a new place, filed
	 * with its ways out to the places the book knows — each link both ways, so
	 * the place the party came from leads to it too; on Review, held at the
	 * review gate. ⏳ A place the book already holds is left as written: no
	 * outlet rewrites an entry, and a link between two standing places takes
	 * an id the reckoning cannot hand over (the Dungeon Crawler's same gap).
	 */
	const placed = committed.junction('place', { on: ($) => $.reckoned.main }, (j) => {
		const arm = (b: BranchOf<typeof j, 'full' | 'review'>, mode: 'full' | 'review') => {
			w.params.push([on(b, 'write'), { entryType: bareEntryTypeId(locationEntryType) }])
			if (mode === 'review') review.push(on(b, 'write'))
			const rv = (s: string) => (mode === 'review' ? `${s} (for review)` : s)
			return jsonPart(
				textPart(
					textPart(
						jsonPart(b, w, 'doc', ($) => $.reckon.on.reckoned.main, mode === 'full' ? 'placeFull' : 'placeReview', rv('The new place')),
						w,
						'name',
						($) => $.doc.main,
						'name',
						rv("The place's name"),
					),
					w,
					'content',
					($) => $.doc.main,
					'content',
					rv('What the place is like'),
				),
				w,
				'links',
				($) => $.doc.main,
				'links',
				rv('Its ways out'),
			).outlet(
				'write',
				($) =>
					C.createLoreEntry.v1({
						name: $.name.text,
						content: $.content.text,
						links: $.links.main,
						params: slot.params(),
					}),
				{ expose: { label: mode === 'full' ? 'File the place' : 'Hold the place for review' } },
			)
		}
		return j
			.when('full', { path: (v: Reckoned) => v.placeFull, truthy: true }, (b) => arm(b, 'full'))
			.when('review', { path: (v: Reckoned) => v.placeReview, truthy: true }, (b) => arm(b, 'review'))
	})
	return placed.junction('time', { on: ($) => $.reckoned.main }, (j) =>
		j.when('moves', { path: (v: Reckoned) => v.clock, truthy: true }, (k) =>
			jsonPart(k, w, 'step', ($) => $.reckon.on.reckoned.main, 'clock', 'The time the reply took')
				.task('decided', ($) =>
					C.clockStep.v1({
						step: $.step.main,
						params: slot.params(),
					}),
				)
				.junction('clock', { on: ($) => $.decided.moves }, (c) =>
					c.when('moves', { truthy: true }, (o) =>
						o.outlet(
							'advance',
							($) =>
								C.advanceStoryClock.v1({
									by: $.reckon.on.time.moves.decided.by,
									unit: $.reckon.on.time.moves.decided.unit,
									cause: 'keeper',
									onRefusal: 'skip',
									params: slot.params(),
								}),
							{ expose: { label: 'Move the story clock' } },
						),
					),
				),
		),
	)
}

/**
 * 🚧 **A reckoning routine** (2026-10-21): the reckoning's graph under a
 * genre's id and prompt — Story's (`storyReckoningSpec`,
 * `genres/story/reckoning.ts`) and the Lair's keeper
 * (`genres/lair/keeper.ts`): this graph with its own prompt row and its own
 * duty defaults (the Lair's `before` step, `tableRules`, retired 2026-10-23).
 * @internal
 */
export interface ReckoningRoutineTerms {
	id: string
	version: string
	/**
	 * 🚧 The title of the routine's duties card — the routine's own name, as
	 * `CORE_SPECS` names it (PLAN-genres-seams S7, 2026-10-23): members read
	 * the UI name, never the internal word (*reckoning*).
	 */
	dutiesTitle: string
	terms: ReckonTerms
	/** The duties' author defaults, by duty key (`placesOnMove: false`). */
	duties?: Readonly<Record<string, boolean>>
}

/** @internal */
export const reckoningRoutineSpec = (t: ReckoningRoutineTerms) => {
	const w = wiring()
	/** The writes the declared defaults hold at the review gate — the places held for review. */
	const review: NodeOn[] = []
	return compile(
		reckoningHead(t.id, t.version, t.dutiesTitle)
			.junction('reckon', { on: ($) => $.duties.any }, (j) =>
				j.when('on', { truthy: true }, (r) => reckonBranch(r, w, review, t.terms)),
			)
			/** On Extraction (I12); what its steps name; the places held for review behind the gate. */
			.defaults((p) => {
				const withDuties = t.duties ? p.params('duties', { ...t.duties }) : p
				return heldForReview(applyWiring(withDuties.loadout('reckon.on.reckonWrite', slot.loadout(CORE_LOADOUT.extraction)), w), review)
			})
			.build(),
	)
}
