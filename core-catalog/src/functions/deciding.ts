/**
 * 🚧 **Deciding** — how a moment that could go either way is decided (lane A2,
 * 2026-10-23; PLAN-rulesets-functions D3): the ways (one die against a
 * target, a pool of dice, cards from a deck, a comparison, a spend, judgement
 * in words, a roll on a table), the named **check** that is decided by one of
 * them, and what shapes a decision around it — an edge, margins read as the
 * author's own outcome words, natural faces.
 *
 * The ways are core's reserved ids (`CORE_FUNCTION_IDS`), so a ruleset in the
 * shape before sections reads as references to them (`rulesetSections`), and
 * their options are the check methods' options (`CHECK_METHOD_KINDS`) — plus
 * what rides on a way's reference: its words (`label`, `description`), its
 * difficulty bands, natural faces on a die, and a check named as its way's
 * `base` and `within`. A way's body is the ruleset handler's resolver, byte
 * for byte in what it computes (the app's `rulesets/methods.ts`): its
 * `decide` handler, listed under `after` (`body.ts`).
 *
 * `judge` and `check` are header-only: the first is judged in words, the
 * second is decided by the way it names — neither decides by itself
 * (`functionRefDecides`).
 */
import { CHECK_METHOD_KINDS, CORE_FUNCTION_IDS, defineFunction, type FieldDecl, type SettingsSchema } from "@serene-pub/sdk"
import { BASICS_JS, body, DEGREES_JS, DICE_JS, SEEDED_JS } from "./body.js"

// ── What rides on every way's reference ─────────────────────────────────────

/** A display text option: a locale map (`{ en }`) — the words a way, a band or a check is read by. */
const wordsOption = (label: string, description: string): FieldDecl => ({
	type: "object",
	label: { en: label },
	description: { en: description },
	fields: { en: { type: "string", label: { en: "English" } } }
})

/**
 * The options every way takes beside its own: its words, and — for a check
 * named as its way (Wherewithal's `dare`) — the check's `base` and `within`.
 */
const WAY_OPTIONS: SettingsSchema = {
	label: wordsOption("Words", "What a person reads for this way — “Roll a d20”."),
	description: wordsOption("About", "A sentence on how it works."),
	base: {
		type: "string",
		label: { en: "Reads" },
		description: { en: "The value a check named as this way reads — its modifier, its pool, what it compares." }
	},
	within: {
		type: "string",
		label: { en: "Counts within" },
		description: { en: "The family a check named as this way counts within, so a bonus on the family reaches it." }
	}
}

/**
 * Difficulty bands — the targets a check may be made against. A band's own
 * words are display text, read but never checked here (a string or a locale
 * map).
 */
const BANDS_OPTION: FieldDecl = {
	type: "list",
	label: { en: "Difficulties" },
	description: { en: "The targets a check may be made against, easiest first; exactly one is the default." },
	item: {
		type: "object",
		fields: {
			id: { type: "string", required: true, label: { en: "Id" } },
			target: { type: "integer", required: true, label: { en: "Target" } },
			default: { type: "boolean", label: { en: "Default" } }
		}
	}
}

/** Natural faces that set the outcome outright, and faces that move it a step. */
const NATURAL_OPTIONS: SettingsSchema = {
	natural: {
		type: "object",
		label: { en: "Natural faces set it" },
		description: { en: "A face at or above a number reads as one outcome; at or below another as another." },
		fields: {
			high: { type: "object", fields: { from: { type: "integer", required: true }, band: { type: "string", required: true } } },
			low: { type: "object", fields: { to: { type: "integer", required: true }, band: { type: "string", required: true } } }
		}
	},
	naturalShift: {
		type: "object",
		label: { en: "Natural faces move it" },
		description: { en: "A face at or above one number moves the outcome a step up; at or below another, a step down." },
		fields: { high: { type: "integer" }, low: { type: "integer" } }
	}
}

/** A way's form: its check method kind's options, then what rides on its reference. */
const wayForm = (kind: keyof typeof CHECK_METHOD_KINDS, extra: SettingsSchema = {}): SettingsSchema => ({
	...CHECK_METHOD_KINDS[kind].options,
	...extra,
	...WAY_OPTIONS
})

/**
 * 🚧 The options of a way that name a value it reads (RF fix 8 — RF fix 6
 * ★2): a check's `base`, and whichever of `modifierOf`, `poolOf`,
 * `opposedBy` and `resource` its kind takes — each a number, never a word
 * or free text where it is counted (`optionRoles`, judged where the ruleset is).
 */
const VALUE_OPTIONS = ["base", "modifierOf", "poolOf", "opposedBy", "resource"] as const
const wayOptionRoles = (form: SettingsSchema): Record<string, { names: "value" }> =>
	Object.fromEntries(VALUE_OPTIONS.filter((k) => Object.prototype.hasOwnProperty.call(form, k)).map((k) => [k, { names: "value" as const }]))

/** What a reply that proposes a check says: who makes it, and against what. */
const CHECK_SCHEMA: SettingsSchema = {
	who: { type: "string", required: true, label: { en: "Who" }, description: { en: "Who makes the check." } },
	against: { type: "integer", label: { en: "Against" }, description: { en: "The target, when one is named." } },
	aimedAt: { type: "string", label: { en: "Aimed at" }, description: { en: "Whom it is aimed at, when anyone." } }
}

// ── The ways ────────────────────────────────────────────────────────────────

/**
 * 🚧 **Judge in words** (`none`) — nothing resolves it: the game master or
 * the model says how it went, in the ruleset's outcome words. Header-only:
 * it decides nothing by the rules.
 * @experimental
 */
export const judgeFunction = defineFunction(CORE_FUNCTION_IDS.judge, {
	name: { en: "Judge in words" },
	meaning: { en: "Nothing is rolled or spent: whoever runs the game says how it went, in the rules' own words." },
	kind: "deciding",
	prose: "Nothing is rolled for this: judge how it goes from the scene — what is established, what is tried, what it costs — and say it in the rules' outcome words.",
	schema: {
		who: CHECK_SCHEMA.who!,
		judged: { type: "string", required: true, label: { en: "How it went" }, description: { en: "One of the outcome words, or words of its own." } }
	},
	form: { ...WAY_OPTIONS },
	optionRoles: wayOptionRoles({ ...WAY_OPTIONS })
})

/**
 * 🚧 **One die against a target** (`die-target`) — one die (twice under an
 * edge, the better or worse kept) plus the check's terms against its
 * target; the margin reads through the outcome words, a natural face
 * through `natural` / `naturalShift`.
 * @experimental
 */
export const dieTargetFunction = defineFunction(CORE_FUNCTION_IDS.dieTarget, {
	name: { en: "One die against a target" },
	meaning: { en: "Roll one die, add a modifier, and meet or beat a target; how far over or under says how well it went." },
	kind: "deciding",
	prose: "Risky moments are decided by one die plus a modifier against a target; how far over or under says how well it went. Propose the attempt, never the roll.",
	form: wayForm("die-target", { bands: BANDS_OPTION, ...NATURAL_OPTIONS }),
	optionRoles: wayOptionRoles(wayForm("die-target", { bands: BANDS_OPTION, ...NATURAL_OPTIONS })),
	phases: ["after"],
	chance: true,
	rollsDice: true,
	body: body(
		BASICS_JS,
		DEGREES_JS,
		DICE_JS,
		`
export function decide(input, ctx) {
	var o = input.options || {}, c = input.check || {}, random = rngOf(input, ctx);
	if (cameOut(c)) return {};
	var sides = o.sides, edge = c.edge || 0;
	var first = face(sides, random);
	var second = edge !== 0 ? face(sides, random) : undefined;
	var natural = second === undefined ? first : edge > 0 ? Math.max(first, second) : Math.min(first, second);
	var terms = [{
		value: natural,
		label: second === undefined ? "d" + sides : "d" + sides + " (" + first + ", " + second + ", " + (edge > 0 ? "edge" : "against the edge") + ")",
		origin: { kind: "roll", ref: "d" + sides }
	}].concat(c.terms || []);
	var total = sumTerms(terms);
	return decided({ terms: terms, total: total, natural: natural, faces: [natural], degree: degreeOf(input.degrees, { total: total, natural: natural, against: c.against, adjust: c.adjust || 0 }) });
}
`
	)
})

/** The most dice a pool rolls, however large its value — a typo of 9000 is never 9000 dice. @experimental */
export const POOL_MAX = 40

/**
 * 🚧 **A pool of dice** (`dice-pool`) — as many dice as the check's terms add
 * up to (plus a `before` handler's extra dice, plus one a side for an edge;
 * never fewer than none, never more than `POOL_MAX`); each face at or above
 * `successOn` a success; the count read through `countToDegree`.
 * @experimental
 */
export const dicePoolFunction = defineFunction(CORE_FUNCTION_IDS.dicePool, {
	name: { en: "A pool of dice" },
	meaning: { en: "Roll as many dice as a value says and count the ones that come up high enough; more successes, a better outcome." },
	kind: "deciding",
	prose: "Risky moments are decided by a pool of dice, as many as the relevant value; each high face is a success, and more successes go better. Propose the attempt, never the roll.",
	form: wayForm("dice-pool"),
	optionRoles: wayOptionRoles(wayForm("dice-pool")),
	phases: ["after"],
	chance: true,
	rollsDice: true,
	body: body(
		BASICS_JS,
		DEGREES_JS,
		DICE_JS,
		`
var POOL_MAX = ${POOL_MAX};
export function decide(input, ctx) {
	var o = input.options || {}, c = input.check || {}, random = rngOf(input, ctx);
	if (cameOut(c)) return {};
	var terms = c.terms || [], edge = c.edge || 0, extra = c.extra || 0;
	var size = Math.max(0, Math.min(POOL_MAX, Math.floor(sumTerms(terms)) + Math.trunc(extra) + Math.sign(edge)));
	var faces = [];
	for (var i = 0; i < size; i++) faces.push(face(o.sides, random));
	var successOn = o.successOn, successes = 0;
	for (var j = 0; j < faces.length; j++) if (faces[j] >= successOn) successes++;
	var steps = o.countToDegree && o.countToDegree.length ? o.countToDegree : [];
	var degree;
	if (steps.length) {
		var step = null;
		for (var k = 0; k < steps.length; k++) if (successes >= steps[k].from) step = steps[k];
		degree = (step ? degreeNamed(input.degrees, step.band, c.adjust || 0) : null) || degreeOfFive(input.degrees, "fail", c.adjust || 0);
	} else degree = degreeOfFive(input.degrees, successes > 0 ? "success" : "fail", c.adjust || 0);
	var parts = [];
	for (var t = 0; t < terms.length; t++) parts.push(terms[t].value + " " + terms[t].label);
	if (extra) parts.push(extra + " more");
	if (edge) parts.push(edge > 0 ? "1 for the edge" : "\\u22121 against the edge");
	var sizeWords = terms.length > 1 || extra || edge ? " (" + parts.join(", ") + ")" : "";
	var explain = "pool " + size + sizeWords + " \\u2014 " + size + "d" + o.sides + " (" + (faces.join(", ") || "no dice") + "): " + successes + " " + (successes === 1 ? "success" : "successes") + " at " + successOn + "+";
	return decided({ terms: terms, total: successes, faces: faces, pool: { size: size, successes: successes, successOn: successOn }, degree: degree, explain: explain });
}
`
	)
})

/**
 * 🚧 **Draw cards** (`card-draw`) — `draw` cards from the way's deck
 * (`ranks` × `suits`, shuffled anew each scene or when it runs out, its
 * order the seed's), their ranks plus the check's terms against its target,
 * read as a die's margin is. The deck's state comes back on the outcome
 * (`deck`) for the host to keep.
 * @experimental
 */
export const cardDrawFunction = defineFunction(CORE_FUNCTION_IDS.cardDraw, {
	name: { en: "Draw cards" },
	meaning: { en: "Draw from a shuffled deck and add a modifier against a target; the deck remembers what has been drawn." },
	kind: "deciding",
	prose: "Risky moments are decided by cards drawn from a deck that remembers what has gone; their ranks plus a modifier meet a target or miss it. Propose the attempt, never the draw.",
	form: wayForm("card-draw", { bands: BANDS_OPTION }),
	optionRoles: wayOptionRoles(wayForm("card-draw", { bands: BANDS_OPTION })),
	phases: ["after"],
	chance: true,
	body: body(
		BASICS_JS,
		DEGREES_JS,
		SEEDED_JS,
		`
var RANK_WORDS = ["Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"];
var SUIT_WORDS = ["hearts", "diamonds", "clubs", "spades"];
function cardWords(rank, suit, ranks, suits) {
	var r = ranks === RANK_WORDS.length ? RANK_WORDS[rank - 1] : String(rank);
	if (suits <= 1) return r;
	return suits === SUIT_WORDS.length ? r + " of " + SUIT_WORDS[suit] : r + " of suit " + (suit + 1);
}
function deckOrder(label, size) {
	var random = seeded(label), cards = [];
	for (var i = 0; i < size; i++) cards.push(i);
	for (var j = size - 1; j > 0; j--) {
		var k = Math.floor(random() * (j + 1));
		var x = cards[j]; cards[j] = cards[k]; cards[k] = x;
	}
	return cards;
}
export function decide(input) {
	var o = input.options || {}, c = input.check || {};
	if (cameOut(c)) return {};
	var deck = c.deck || {};
	var key = (input.function && input.function.key) || input.key || "cards", seed = deck.seed || "ruleset", scene = deck.scene === undefined ? null : deck.scene;
	var suits = o.suits === undefined ? 4 : o.suits;
	var size = Math.max(1, o.ranks * suits);
	var eachScene = (o.reshuffle || "each-scene") === "each-scene";
	var st = deck.state;
	var now = !st || (eachScene && st.scene !== scene) ? { scene: scene, shuffle: 0, drawn: 0 } : { scene: st.scene, shuffle: st.shuffle, drawn: st.drawn };
	function labelOf(n) { return seed + ":" + key + ":" + (n.scene === null || n.scene === undefined ? "session" : n.scene) + ":" + n.shuffle; }
	var order = deckOrder(labelOf(now), size);
	var count = Math.max(1, o.draw === undefined ? 1 : o.draw), drawn = [];
	for (var i = 0; i < count; i++) {
		if (now.drawn >= size) {
			now = { scene: now.scene, shuffle: now.shuffle + 1, drawn: 0 };
			order = deckOrder(labelOf(now), size);
		}
		drawn.push(order[now.drawn]);
		now = { scene: now.scene, shuffle: now.shuffle, drawn: now.drawn + 1 };
	}
	var cards = [], ranks = 0, names = [];
	for (var d = 0; d < drawn.length; d++) {
		var rank = (drawn[d] % o.ranks) + 1, suit = Math.floor(drawn[d] / o.ranks);
		var card = { label: cardWords(rank, suit, o.ranks, suits), rank: rank };
		cards.push(card); ranks += rank; names.push(card.label);
	}
	var terms = [{ value: ranks, label: "drew " + names.join(", "), origin: { kind: "roll", ref: "cards" } }].concat(c.terms || []);
	var total = sumTerms(terms);
	return decided({ terms: terms, total: total, cards: cards, deck: now, degree: degreeOf(input.degrees, { total: total, natural: NaN, against: c.against, adjust: c.adjust || 0 }) });
}
`
	)
})

/**
 * 🚧 **Compare, no chance** (`compare`) — the check's terms against the other
 * side's value (the host reads `opposedBy` on whoever it is aimed at into the
 * target) or a target; the margin reads through the outcome words.
 * @experimental
 */
export const compareFunction = defineFunction(CORE_FUNCTION_IDS.compare, {
	name: { en: "Compare, no chance" },
	meaning: { en: "Set one value against another's, or against a target; the higher wins and nothing is rolled." },
	kind: "deciding",
	prose: "Contests are decided by comparing one value against another's, or against a target; nothing is rolled, and the wider the gap the clearer the outcome.",
	form: wayForm("compare", { bands: BANDS_OPTION }),
	optionRoles: wayOptionRoles(wayForm("compare", { bands: BANDS_OPTION })),
	phases: ["after"],
	body: body(
		BASICS_JS,
		DEGREES_JS,
		`
export function decide(input) {
	var c = input.check || {};
	if (cameOut(c)) return {};
	var terms = c.terms || [], total = sumTerms(terms);
	return decided({ terms: terms, total: total, degree: degreeOf(input.degrees, { total: total, natural: NaN, against: c.against, adjust: c.adjust || 0 }) });
}
`
	)
})

/**
 * 🚧 **Spend to succeed** (`bid`) — a spend from `resource` buys the outcome
 * its cost table says (the last row whose spend it reaches; under the first,
 * a failure). No amount asked: the price of success — the least spend that
 * buys a success or better, else the dearest row. A spend larger than what is
 * held is refused (`refused: 'not-enough'`); a spend made comes back as a
 * delta, never a write.
 * @experimental
 */
export const spendFunction = defineFunction(CORE_FUNCTION_IDS.spend, {
	name: { en: "Spend to succeed" },
	meaning: { en: "Spend from a resource; what is spent buys the outcome. Nothing is rolled, and nobody spends what they do not have." },
	kind: "deciding",
	prose: "Risks are carried by spending: the more spent, the better it goes, and nobody spends what they do not have. Propose who spends and how much, never the result.",
	schema: {
		who: CHECK_SCHEMA.who!,
		spend: { type: "integer", min: 0, label: { en: "Spend" }, description: { en: "How much is spent. Left out: the price of success." } }
	},
	form: wayForm("bid"),
	optionRoles: wayOptionRoles(wayForm("bid")),
	phases: ["after"],
	body: body(
		BASICS_JS,
		DEGREES_JS,
		`
function priceOfSuccess(costs, degrees) {
	var rows = costs.slice().sort(function (a, b) { return a.spend - b.spend; });
	for (var i = 0; i < rows.length; i++) {
		var five = null, bands = (degrees && degrees.bands) || [];
		for (var j = 0; j < bands.length; j++) if (bands[j].id === rows[i].band) { five = bands[j].five; break; }
		if (five !== null && FIVE_RANK[five] >= FIVE_RANK.success) return rows[i].spend;
	}
	return rows.length ? rows[rows.length - 1].spend : 0;
}
function bidDegree(costs, spend, degrees, adjust) {
	var rows = costs.slice().sort(function (a, b) { return a.spend - b.spend; }), row = null;
	for (var i = 0; i < rows.length; i++) if (spend >= rows[i].spend) row = rows[i];
	return (row ? degreeNamed(degrees, row.band, adjust) : null) || degreeOfFive(degrees, "fail", adjust);
}
export function decide(input) {
	var o = input.options || {}, c = input.check || {};
	if (cameOut(c)) return {};
	var costs = o.costs || [], held = c.held || { value: 0, label: o.resource || "" };
	var asked = typeof c.spend === "number" ? c.spend : NaN;
	var spend = isFinite(asked) ? Math.max(0, Math.floor(asked)) : priceOfSuccess(costs, input.degrees);
	if (spend > held.value) return { degree: null, result: { degree: null, refused: "not-enough", explain: "has " + held.value + " " + held.label + ", not the " + spend + " it would spend" } };
	var out = decided({
		terms: [{ value: spend, label: held.label + " spent", origin: { kind: "base", ref: held.ref || o.resource } }],
		total: spend,
		degree: bidDegree(costs, spend, input.degrees, c.adjust || 0),
		explain: "spent " + spend + " of " + held.value + " " + held.label + " (" + (held.value - spend) + " left)"
	});
	if (spend > 0) out.deltas = [{ owner: whoOf(input), attribute: o.resource, op: "spend", value: spend, reason: "spent" }];
	return out;
}
`
	)
})

/**
 * 🚧 **Roll on a table** — a dice expression thrown (`2d6`), and the row its
 * total falls in read out: its words for the model, and — when the row names
 * one — the outcome word it reads as.
 * @experimental
 */
export const tableFunction = defineFunction(CORE_FUNCTION_IDS.table, {
	name: { en: "Roll on a table" },
	meaning: { en: "Throw the dice and read the row the total lands on — what turns up, who answers, how the weather turns." },
	kind: "deciding",
	prose: "Some things are decided by a roll on a table: the dice are thrown and the row they land on is what happens. Take the row as given.",
	form: {
		dice: { type: "string", required: true, label: { en: "Dice" }, description: { en: "What is thrown — '2d6', 'd20'." } },
		rows: {
			type: "list",
			required: true,
			min: 1,
			label: { en: "Rows" },
			description: { en: "From which total each row starts, lowest first; a row runs until the next one starts." },
			item: {
				type: "object",
				fields: {
					from: { type: "integer", required: true, label: { en: "From" } },
					text: { type: "string", required: true, label: { en: "What happens" } },
					outcome: { type: "string", label: { en: "Reads as" }, description: { en: "One of the outcome words, by id." } }
				}
			}
		},
		...WAY_OPTIONS
	},
	optionRoles: wayOptionRoles({ ...WAY_OPTIONS }),
	phases: ["after"],
	chance: true,
	rollsDice: true,
	body: body(
		BASICS_JS,
		DEGREES_JS,
		DICE_JS,
		`
export function decide(input, ctx) {
	var o = input.options || {}, c = input.check || {};
	if (cameOut(c)) return {};
	var thrown = throwDice(o.dice, rngOf(input, ctx));
	if (!thrown) return { degree: null, result: { degree: null, refused: "bad-dice", explain: "'" + o.dice + "' is not a die" } };
	var rows = (o.rows || []).slice().sort(function (a, b) { return a.from - b.from; }), row = null;
	for (var i = 0; i < rows.length; i++) if (thrown.total >= rows[i].from) row = rows[i];
	if (!row && rows.length) row = rows[0];
	var to = null;
	for (var j = 0; j < rows.length; j++) if (row && rows[j].from > row.from) { to = rows[j].from - 1; break; }
	var result = {
		terms: [{ value: thrown.total, label: thrown.expr, origin: { kind: "roll", ref: thrown.expr } }],
		total: thrown.total,
		faces: thrown.faces,
		degree: row && row.outcome ? degreeNamed(input.degrees, row.outcome, c.adjust || 0) : null,
		explain: thrown.expr + " (" + thrown.faces.join(", ") + ") = " + thrown.total
	};
	if (row) result.row = to === null ? { from: row.from, text: row.text } : { from: row.from, to: to, text: row.text };
	var out = decided(result);
	out.lines = row ? [row.text] : [];
	if (row && row.outcome) out.outcome = row.outcome;
	return out;
}
`
	)
})

/**
 * 🚧 **A check** — something decided by one of the ruleset's ways: the value
 * it reads (`base`), the way (`way`; absent, the default), the family it
 * counts `within`. Header-only: the way it names decides.
 * @experimental
 */
export const checkFunction = defineFunction(CORE_FUNCTION_IDS.check, {
	name: { en: "A check" },
	meaning: { en: "Something worth deciding — a skill, a save, an attack — that reads one value and is decided by one of the ruleset's ways." },
	kind: "deciding",
	prose: "A check reads one value and is decided by the rules' way; propose who makes it and against what, and let the rules say how it went.",
	schema: CHECK_SCHEMA,
	form: {
		base: WAY_OPTIONS.base!,
		way: { type: "string", label: { en: "Decided by" }, description: { en: "One of the ruleset's ways, by key. Left out: its default way." } },
		within: WAY_OPTIONS.within!,
		// 🚧 A check's own words (GM 2026-10-23, G2 ★1): what a roll form and an outcome line call it.
		label: wordsOption("Words", "What a person reads for this check — “Strength save”, “Sleight of hand”.")
	},
	// 🚧 RF fix 8: `base` reads a number; `way` names one of the ruleset's ways.
	optionRoles: { base: { names: "value" }, way: { names: "function" } }
})

// ── Around a decision ───────────────────────────────────────────────────────

/**
 * 🚧 **An edge** — while its holder carries something tagged so (a blessing,
 * high ground) or bears a condition tagged so (frightened), a check rolls
 * with the edge (twice, the better kept) or against it; one of each cancels.
 * @experimental
 */
export const advantageFunction = defineFunction("core:function/advantage@1", {
	name: { en: "An edge" },
	meaning: { en: "Something carried or suffered tilts a roll: roll twice and keep the better — or, against it, the worse." },
	kind: "deciding",
	bindings: {
		helps: { to: "entry-type", tags: ["edge"], many: true, label: { en: "Rolls with the edge while holding" } },
		hinders: { to: "entry-type", tags: ["hindrance"], many: true, label: { en: "Rolls against it while holding" } }
	},
	prose: "Some things tilt a roll: with the edge the dice are thrown twice and the better kept; against it, the worse. One of each cancels.",
	phases: ["before"],
	body: body(
		BASICS_JS,
		`
export function before(input) {
	var b = input.bindings || {}, c = input.check || {};
	var up = entriesOf(b.helps).length > 0 ? 1 : 0, down = entriesOf(b.hinders).length > 0 ? 1 : 0;
	if (up === down) return {};
	return { edge: Math.sign((c.edge || 0) + up - down), lines: [up ? "with the edge" : "against the edge"] };
}
`
	)
})

/**
 * 🚧 **Margins read as outcome words** — how far over or under the target a
 * decided check landed, read as the author's own outcome words by their
 * `from` (the ruleset's outcomes): for words with no ladder onto the five
 * steps, which the ways' own reading cannot place.
 * @experimental
 */
export const marginsFunction = defineFunction("core:function/margins@1", {
	name: { en: "Margins read as outcome words" },
	meaning: { en: "How far over or under the target a check landed says which of the ruleset's own outcome words it reads as." },
	kind: "deciding",
	prose: "How far over or under the target a check lands decides which outcome it is: the wider the margin, the further along the words.",
	form: {
		words: {
			type: "list",
			required: true,
			min: 1,
			label: { en: "Outcome words" },
			description: { en: "Each outcome word and the least margin it starts at, lowest first." },
			item: { type: "object", fields: { outcome: { type: "string", required: true, label: { en: "Outcome" } }, from: { type: "integer", required: true, label: { en: "From" } } } }
		}
	},
	phases: ["after"],
	body: `
export function after(input) {
	var o = input.options || {}, c = input.check || {};
	var margin = typeof c.margin === "number" ? c.margin : typeof c.rolled === "number" && typeof c.against === "number" ? c.rolled - c.against : null;
	if (margin === null) return {};
	var words = (o.words || []).slice().sort(function (a, b) { return a.from - b.from; }), hit = null;
	for (var i = 0; i < words.length; i++) if (margin >= words[i].from) hit = words[i];
	if (!hit && words.length) hit = words[0];
	if (!hit) return {};
	var out = { outcomes: [hit.outcome], lines: ["margin " + margin + ": " + hit.outcome] };
	var bands = (input.degrees && input.degrees.bands) || [];
	for (var j = 0; j < bands.length; j++) if (bands[j].id === hit.outcome) out.degree = hit.outcome;
	return out;
}
`.trim()
})

/**
 * 🚧 **Natural faces** — a die's own face, before anything is added, decides
 * outright: at or above `high` it reads as one outcome, at or below `low` as
 * another (a critical, a fumble), whatever the total.
 * @experimental
 */
export const naturalResultsFunction = defineFunction("core:function/natural-results@1", {
	name: { en: "Natural faces" },
	meaning: { en: "The die's own face decides outright: the highest faces always go well, the lowest always go badly." },
	kind: "deciding",
	prose: "The die's own face can decide outright: the top face always goes well and the bottom face always goes badly, whatever was added.",
	form: {
		high: { type: "integer", label: { en: "At or above" }, description: { en: "The least face that reads as the high outcome." } },
		highOutcome: { type: "string", label: { en: "Reads as" }, description: { en: "The outcome a high face reads as, by id." } },
		low: { type: "integer", label: { en: "At or below" }, description: { en: "The most face that reads as the low outcome." } },
		lowOutcome: { type: "string", label: { en: "Reads as" }, description: { en: "The outcome a low face reads as, by id." } }
	},
	phases: ["after"],
	body: `
export function after(input) {
	var o = input.options || {}, c = input.check || {};
	if (typeof c.natural !== "number") return {};
	var id = null;
	if (typeof o.high === "number" && o.highOutcome && c.natural >= o.high) id = o.highOutcome;
	else if (typeof o.low === "number" && o.lowOutcome && c.natural <= o.low) id = o.lowOutcome;
	if (!id) return {};
	return { degree: id, outcomes: [id], lines: ["natural " + c.natural + ": " + id] };
}
`.trim()
})

/** 🚧 Core's deciding functions: the ways first (the reserved ids), then the check, then what shapes a decision. @experimental */
export const DECIDING_FUNCTIONS = Object.freeze([
	judgeFunction,
	dieTargetFunction,
	dicePoolFunction,
	cardDrawFunction,
	compareFunction,
	spendFunction,
	tableFunction,
	checkFunction,
	advantageFunction,
	marginsFunction,
	naturalResultsFunction
])
