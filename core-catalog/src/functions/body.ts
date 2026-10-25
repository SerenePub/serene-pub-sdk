/**
 * 🚧 **The body contract** of core's function modules (PLAN-rulesets-functions
 * D1, D3, D4, D6; lane A2, 2026-10-23) — what a host hands a handler, what it
 * answers, and the plain-ES5 helpers the bodies splice in. It is the
 * contract the app's rules sandbox runs (`rulesets/functionRun.ts`).
 *
 * ## A body
 *
 * An ES module source exporting its handlers by name. Each is called with
 * **one envelope** (`export function decide(ctx) { … }`), whose `random()`
 * is the call's seeded stream and `log(text)` its trail; a body also takes a
 * second argument for both, so it runs where a host passes them apart. Plain
 * ES5 inside (`var`, `function`), never `Math.random`. A body never writes
 * (R8): it answers.
 *
 * The handlers: one per phase it lists (`FUNCTION_PHASES` — `effects`,
 * `derived`, `before`, `after`, `render`, in that order), plus three
 * outside the phases —
 *
 *  · `decide` — a **way** decides a check it is named by (listed under
 *    `after`, the boundary it sits on): handed the check's inputs, it
 *    throws, draws or weighs and answers `degree` (an outcome's id) and
 *    `result` (the numbers). A check that already came out (`rolled` or
 *    `degree` on it) is left as it came — a way never decides twice.
 *  · `members` — a **scope** answers who is in reach (listed under
 *    `derived`).
 *  · `invoke` — a function a person invokes (D6); absent, its `effects`
 *    handler is called with `answer` set — what every core function does.
 *
 * ## The envelope (what it reads)
 *
 * `phase`, `function { id, key, kind }`, `options` (the reference's, its
 * form's defaults the host's to fill), `owner { key, name, kind }`,
 * `bindings` (role → what it reaches: an attribute's `values` by id, an
 * entry type's `entries`, a zone type's `zones` by id, a scope's `members`
 * — each with the `ids` it is tied to; or the flat `{ id, value }` /
 * `{ id, entries }` a test hands), `event { id, payload }`, and by
 * handler: `check` (before, after, decide: `terms`, `edge`, `against`,
 * `method`, and after it came out `rolled`, `natural`, `faces`, `margin`,
 * `degree`), `degrees` (the outcome words in force as a crosswalk — what a
 * way reads its outcome through), `answer`, `actor` and `aimedAt`
 * (invoke), `blocks` (render), `subject`, `owners`, `ties` (members).
 *
 * ## The answer (what it returns)
 *
 * `deltas` — an attribute's change `{ attribute, op, value, owner?, reason }`
 * or an entry's `{ op: 'add' | 'remove' | 'move' | 'reveal', entry, zone?,
 * to?, toOwner?, owner? }` (an added entry written out as `{ name,
 * entryType }`); `lines` (sentences for the receipt and the model);
 * `outcomes` (outcome words, by id); `emits` (`{ event, payload }`, only
 * events its header says it emits); `asks`. By handler: `values` (derived:
 * worked-out values by attribute id), `edge` · `against` · `modifies`
 * (before), `degree` · `shift` · `riders` (after, decide), `result`
 * (decide), `members` (members), `blocks` (render).
 *
 * ⚠ Not a pipeline script's contract (a function body over `value`, 18 §6);
 * a ruleset's ⏳ seeded scripts (`seedKey`) keep that one.
 * @experimental
 */

/** 🚧 One term of a check: a number and the words for where it came from. @experimental */
export interface FunctionTerm {
	value: number
	label: string
	origin?: { kind: string; ref?: string }
}

/** 🚧 A deck as a card-drawing way leaves it: the scene it was shuffled for, how many shuffles, how many drawn. @experimental */
export interface DeckState {
	scene: number | null
	shuffle: number
	drawn: number
}

/**
 * 🚧 The check in hand as a way's `decide` reads it — beside the host's own
 * fields: degree steps to take after (`adjust`), a pool's extra dice
 * (`extra`), what a spend may draw on (`held`) and asks to spend (`spend`;
 * absent: the price of success), a deck's seed and state (`deck`).
 * @experimental
 */
export interface FunctionCheckInput {
	terms?: readonly FunctionTerm[]
	edge?: number
	adjust?: number
	against?: number
	extra?: number
	held?: { value: number; label: string; ref?: string }
	spend?: number
	deck?: { seed: string; scene: number | null; state?: DeckState }
	rolled?: number
	natural?: number
	margin?: number
	degree?: unknown
}

/** 🚧 What a way decided: the numbers, and the degree as the crosswalk reads it. @experimental */
export interface FunctionDecision {
	degree: { band: Record<string, unknown>; index: number; five: string } | null
	terms?: readonly FunctionTerm[]
	total?: number
	natural?: number
	faces?: readonly number[]
	pool?: { size: number; successes: number; successOn: number }
	cards?: readonly { label: string; rank: number }[]
	explain?: string
	deck?: DeckState
	row?: { from: number; to?: number; text: string }
	refused?: string
}

/** 🚧 An attribute's change, as a function answers it. @experimental */
export interface FunctionAttributeDelta {
	attribute: string
	op: string
	value?: unknown
	owner?: string
	reason?: string
}

/** 🚧 An entry's add, removal, move or reveal, as a function answers it. @experimental */
export interface FunctionEntryOp {
	op: "add" | "remove" | "move" | "reveal"
	entry: unknown
	zone?: string
	to?: string
	toOwner?: string
	owner?: string
	reason?: string
}

/** 🚧 What a handler returns — never a write (R8). @experimental */
export interface FunctionAnswer {
	deltas?: (FunctionAttributeDelta | FunctionEntryOp)[]
	lines?: string[]
	outcomes?: string[]
	emits?: { event: string; payload?: Record<string, unknown> }[]
	asks?: Record<string, unknown>[]
	values?: Record<string, unknown>
	edge?: number
	degree?: string | null
	result?: FunctionDecision
	members?: string[]
	order?: string[]
}

// ── The helpers the bodies splice in (plain ES5, one source of each) ────────

/**
 * The basics every body opens with: a number or a fallback, the first of a
 * list, the call's context (`ctx` or the envelope), what an attribute
 * binding reaches (either shape), what an entry type or a zone reaches, an
 * event's payload, and who a change lands on (the answer's `who`, else whom
 * it is aimed at, else the owner).
 * @internal
 */
export const BASICS_JS = `
function num(v, d) { return typeof v === "number" && isFinite(v) ? v : d; }
function one(b) { return b && typeof b === "object" && b.length !== undefined ? b[0] : b; }
function lists(b) { return b === undefined || b === null ? [] : typeof b === "object" && b.length !== undefined ? b : [b]; }
function rngOf(input, ctx) { return (ctx && ctx.random) || input.random; }
function attrsOf(b) {
	var out = [], xs = lists(b);
	for (var i = 0; i < xs.length; i++) {
		var x = xs[i];
		if (!x) continue;
		if (x.ids && x.values) {
			for (var j = 0; j < x.ids.length; j++) {
				var id = x.ids[j], bd = (x.bounds && x.bounds[id]) || {};
				out.push({ id: id, value: x.values[id], min: bd.min, max: bd.max, start: bd.start });
			}
		} else if (x.id) out.push(x);
	}
	return out;
}
function attrOf(b) { return attrsOf(b)[0] || null; }
function entriesOf(b) {
	var out = [], xs = lists(b);
	for (var i = 0; i < xs.length; i++) {
		var x = xs[i];
		if (!x) continue;
		if (x.entries) for (var j = 0; j < x.entries.length; j++) out.push(x.entries[j]);
		if (x.zones) for (var z in x.zones) for (var k = 0; k < x.zones[z].length; k++) out.push(x.zones[z][k]);
	}
	return out;
}
function zoneOf(b) {
	var x = one(b);
	if (!x) return null;
	if (x.zones && x.ids) { var id = x.ids[0]; return { id: id, entries: x.zones[id] || [], limit: x.limit }; }
	if (x.ids && !x.id) return { id: x.ids[0], entries: x.entries || [], limit: x.limit };
	return x.id ? { id: x.id, entries: x.entries || [], limit: x.limit } : null;
}
function idOf(b) { var x = one(b); return x ? x.id || (x.ids && x.ids[0]) || "" : ""; }
function payloadOf(ev) { return (ev && (ev.payload || ev.values)) || {}; }
function ownerKey(input) { return input.owner && input.owner.key ? input.owner.key : ""; }
function whoOf(input) {
	var a = input.answer || {};
	if (typeof a.who === "string" && a.who) return a.who;
	if (typeof input.actor === "string" && input.actor) return input.actor;
	if (input.aimedAt && typeof input.aimedAt === "object" && input.aimedAt.key) return input.aimedAt.key;
	return ownerKey(input);
}
`

/**
 * The degrees: a total read through a crosswalk — margins, natural faces,
 * steps by the five-band rank, never by declaration order. Byte for byte the
 * ruleset handler's `degreeOf` / `stepDegree` / `degreeNamed` /
 * `degreeOfFive` (the app's `rulesets/dice.ts`).
 * @internal
 */
export const DEGREES_JS = `
var FIVE_RANK = { "crit-fail": 0, fail: 1, partial: 2, success: 3, crit: 4 };
function rankOrder(bands) {
	var xs = [];
	for (var i = 0; i < bands.length; i++) xs.push({ i: i, rank: FIVE_RANK[bands[i].five] || 0, from: typeof bands[i].from === "number" ? bands[i].from : -Infinity });
	xs.sort(function (a, b) { return a.rank - b.rank || a.from - b.from || a.i - b.i; });
	var out = [];
	for (var j = 0; j < xs.length; j++) out.push(xs[j].i);
	return out;
}
function stepTo(order, from, by) {
	var at = order.indexOf(from) + by;
	return order[Math.max(0, Math.min(order.length - 1, at))];
}
function degreeAt(bands, index) { return { band: bands[index], index: index, five: bands[index].five }; }
function degreeOf(crosswalk, check) {
	var bands = (crosswalk && crosswalk.bands) || [];
	if (!bands.length || check.against === undefined || check.against === null) return null;
	var margin = check.total - check.against;
	var index, i;
	var margins = false;
	for (i = 0; i < bands.length; i++) if (typeof bands[i].from === "number") margins = true;
	if (margins) {
		index = 0;
		for (i = 0; i < bands.length; i++) if (typeof bands[i].from === "number" ? margin >= bands[i].from : i === 0) index = i;
	} else {
		var want = margin >= 0 ? "success" : "fail";
		index = -1;
		for (i = 0; i < bands.length; i++) if (index < 0 && bands[i].five === want) index = i;
		if (index < 0) index = margin >= 0 ? bands.length - 1 : 0;
	}
	var order = rankOrder(bands);
	var shift = crosswalk.naturalShift;
	if (shift && shift.high !== undefined && check.natural >= shift.high) index = stepTo(order, index, 1);
	if (shift && shift.low !== undefined && check.natural <= shift.low) index = stepTo(order, index, -1);
	var set = crosswalk.natural;
	function named(id) { for (var k = 0; k < bands.length; k++) if (bands[k].id === id) return k; return -1; }
	if (set && set.high && check.natural >= set.high.from && named(set.high.band) >= 0) index = named(set.high.band);
	else if (set && set.low && check.natural <= set.low.to && named(set.low.band) >= 0) index = named(set.low.band);
	if (check.adjust) index = stepTo(order, index, check.adjust);
	return degreeAt(bands, index);
}
function stepDegree(crosswalk, degree, by) {
	if (!by) return degree;
	var bands = crosswalk.bands, order = rankOrder(bands);
	var at = order.indexOf(degree.index);
	return degreeAt(bands, order[Math.max(0, Math.min(order.length - 1, (at < 0 ? 0 : at) + by))]);
}
function degreeNamed(crosswalk, id, adjust) {
	var bands = (crosswalk && crosswalk.bands) || [];
	for (var i = 0; i < bands.length; i++) if (bands[i].id === id) return stepDegree(crosswalk, degreeAt(bands, i), adjust || 0);
	return null;
}
function degreeOfFive(crosswalk, five, adjust) {
	var bands = (crosswalk && crosswalk.bands) || [];
	if (!bands.length) return null;
	var want = FIVE_RANK[five], index = -1, i;
	for (i = 0; i < bands.length; i++) if (index < 0 && bands[i].five === five) index = i;
	if (index < 0) {
		var order = rankOrder(bands), below = [];
		for (i = 0; i < order.length; i++) if (FIVE_RANK[bands[order[i]].five] <= want) below.push(order[i]);
		index = below.length ? below[below.length - 1] : order[0];
	}
	return stepDegree(crosswalk, degreeAt(bands, index), adjust || 0);
}
function sumTerms(terms) { var s = 0; for (var i = 0; i < terms.length; i++) s += terms[i].value; return s; }
function cameOut(c) { return c.rolled !== undefined || (c.degree !== undefined && c.degree !== null); }
function decided(result) { return { degree: result.degree ? result.degree.band.id : null, result: result }; }
`

/**
 * Dice: one face from the call's stream, and a dice expression (`d20`,
 * `2d6+1`) thrown — the ruleset handler's `rollDice` over `parseDice`.
 * @internal
 */
export const DICE_JS = `
function face(sides, random) { return Math.floor(random() * sides) + 1; }
function throwDice(expr, random) {
	var m = /^\\s*(\\d*)\\s*d\\s*(\\d+)\\s*(?:([+-])\\s*(\\d+))?\\s*$/i.exec(String(expr === undefined || expr === null ? "" : expr));
	if (!m) return null;
	var count = m[1] ? Number(m[1]) : 1, faces = Number(m[2]);
	var modifier = m[3] === "-" ? -Number(m[4]) : Number(m[4] || 0);
	if (faces < 1 || count < 1 || count > 100) return null;
	var out = [], total = modifier;
	for (var i = 0; i < count; i++) { var f = face(faces, random); out.push(f); total += f; }
	return { expr: String(expr).trim(), faces: out, modifier: modifier, total: total };
}
`

/**
 * A stream seeded by a label — the scripts host's one PRNG (18 §6), so a
 * deck shuffled here is the deck the ruleset handler shuffled
 * (`seededRandom`, `deckOrder`).
 * @internal
 */
export const SEEDED_JS = `
function seeded(label) {
	var h = 1779033703 ^ label.length;
	for (var i = 0; i < label.length; i++) {
		h = Math.imul(h ^ label.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	h = Math.imul(h ^ (h >>> 16), 2246822507);
	h = Math.imul(h ^ (h >>> 13), 3266489909);
	var a = (h ^= h >>> 16) >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		var t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
`

/**
 * Story times compared part by part (year, month, day, hour, minute) — the
 * ordering a calendar keeps (`compareDates`), a missing part as none. Needs
 * `BASICS_JS`.
 * @internal
 */
export const STORY_TIME_JS = `
function timeParts(t) {
	t = t || {};
	return [num(t.year, 0), num(t.month, 0), num(t.day, 0), num(t.hour, 0), num(t.minute, 0)];
}
function compareTimes(a, b) {
	var x = timeParts(a), y = timeParts(b);
	for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
	return 0;
}
function crossed(clock, at) { return !!clock && compareTimes(clock.from, at) < 0 && compareTimes(clock.to, at) >= 0; }
`

/** A body from its handlers and the helpers they use, trimmed. @internal */
export const body = (...parts: readonly string[]): string =>
	parts
		.map((p) => p.trim())
		.filter(Boolean)
		.join("\n\n")
