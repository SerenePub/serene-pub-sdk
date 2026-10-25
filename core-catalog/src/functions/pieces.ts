/**
 * 🚧 **Pieces and zones** — entries people hold and where they sit (lane A2,
 * 2026-10-23; PLAN-rulesets-functions D5): a thing held, a condition that
 * lasts, a standing on a tie, an obligation with a deadline, a deck with a
 * hand and a discard pile, a carrying limit.
 *
 * An entry held is a copy stamped from its lorebook entry (`stampHeldEntry`);
 * a zone is one owner's instance of a zone type. These read the entries their
 * bindings hand them and answer with deltas, lines and events — never a write.
 */
import { defineFunction, NUMBER_ATTRIBUTE_KINDS, SCENE_CLOSED_EVENT, STORY_CLOCK_MOVED_EVENT, TURN_ENDED_EVENT } from "@serene-pub/sdk"
import { BASICS_JS, body, STORY_TIME_JS } from "./body.js"

/**
 * 🚧 **A thing held** — what someone carries: having it makes some actions
 * possible or easier, losing it takes that away. Header-only: the model
 * reads it, and a give or a take moves it.
 * @experimental
 */
export const heldThingFunction = defineFunction("core:function/held-thing@1", {
	name: { en: "A thing held" },
	meaning: { en: "What someone carries makes some things possible or easier, and losing it takes that away." },
	kind: "pieces",
	bindings: { things: { to: "entry-type", tags: ["gear"], many: true, label: { en: "Things" } } },
	prose: "{{things}} are carried: having one makes some actions possible or easier, and losing it takes that away."
})

/** The events a condition's expiry runs out on. */
const EXPIRES_ON: Readonly<Record<string, string>> = Object.freeze({ "turn-end": TURN_ENDED_EVENT, "scene-end": SCENE_CLOSED_EVENT })

/**
 * 🚧 **A condition that lasts** — what ails someone for as long as its
 * duration says: each turn's or scene's end it ends on counts it down, and
 * once it has run its course it is lifted.
 * @experimental
 */
export const lastingConditionFunction = defineFunction("core:function/lasting-condition@1", {
	name: { en: "A condition that lasts" },
	meaning: { en: "What ails someone stays for as long as it lasts — a turn, a scene — and is lifted when it has run its course." },
	kind: "pieces",
	bindings: { conditions: { to: "entry-type", tags: ["condition"], many: true, label: { en: "Conditions" } } },
	prose: "{{conditions}} shape what someone can do while they last, and pass when their time is up.",
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
var EXPIRES_ON = ${JSON.stringify(EXPIRES_ON)};
export function effects(input) {
	var ev = input.event;
	if (!ev) return {};
	var out = { deltas: [], lines: [] }, es = entriesOf((input.bindings || {}).conditions);
	for (var i = 0; i < es.length; i++) {
		var e = es[i], d = (e.fields && e.fields.duration) || e.duration;
		if (!d || EXPIRES_ON[d.expiry] !== ev.id) continue;
		var left = typeof d.value === "number" ? d.value - (typeof d.spent === "number" ? d.spent : 0) : 1;
		if (left > 1) continue;
		out.deltas.push({ owner: ownerKey(input), op: "remove", entry: e.name, zone: e.zone || "carried", reason: "ran its course" });
		out.lines.push(e.name + " has passed.");
	}
	return out.deltas.length ? out : {};
}
`
	)
})

/**
 * 🚧 **A standing on a tie** — an entry on the tie between two people (a
 * bond, a rivalry, a debt): how it stands colours what one will do for the
 * other, and it shifts with what they do to each other. Header-only.
 * @experimental
 */
export const tieStandingFunction = defineFunction("core:function/tie-standing@1", {
	name: { en: "A standing on a tie" },
	meaning: { en: "How two people stand with each other colours what one will do for the other, and shifts with what they do." },
	kind: "pieces",
	bindings: { ties: { to: "entry-type", tags: ["relationship"], many: true, label: { en: "Ties" } } },
	prose: "{{ties}} sit between two people: how one stands with another colours what they will do for each other, and it shifts with what they do.",
	schema: {
		who: { type: "string", required: true, label: { en: "Whose" } },
		towards: { type: "string", required: true, label: { en: "Towards" } },
		standing: { type: "string", required: true, label: { en: "Stands" }, description: { en: "How it stands now, in the tie's own words." } }
	}
})

/** The event an obligation coming due raises. */
const CAME_DUE = "core:event/obligation-came-due@1"

/**
 * 🚧 **An obligation with a deadline** — an entry owed by a story time (a
 * debt, a promise, a delivery): when the story clock passes it, it has come
 * due — a line, and `obligation-came-due` raised for whatever answers it.
 * @experimental
 */
export const obligationFunction = defineFunction("core:function/obligation@1", {
	name: { en: "An obligation with a deadline" },
	meaning: { en: "Something owed by a certain time — a debt, a promise, a delivery — comes due when the time passes." },
	kind: "pieces",
	bindings: { owed: { to: "entry-type", label: { en: "Owed" } } },
	adds: { events: [{ id: CAME_DUE, name: { en: "An obligation came due" }, description: { en: "The story clock passed what an obligation was owed by." } }] },
	prose: "{{owed}} are owed by a certain time; when the time passes they have come due, and that has consequences.",
	form: { field: { type: "string", default: "due", label: { en: "Owed by" }, description: { en: "The field of the entry that holds when it is owed by." } } },
	emits: [CAME_DUE],
	phases: ["effects"],
	body: body(
		BASICS_JS,
		STORY_TIME_JS,
		`
export function effects(input) {
	var ev = input.event;
	if (!ev || ev.id !== "${STORY_CLOCK_MOVED_EVENT}") return {};
	var clock = payloadOf(ev).clock, field = (input.options || {}).field || "due";
	var out = { lines: [], emits: [] }, es = entriesOf((input.bindings || {}).owed);
	for (var i = 0; i < es.length; i++) {
		var due = es[i].fields ? es[i].fields[field] : undefined;
		if (!due || typeof due !== "object" || !crossed(clock, due)) continue;
		out.lines.push(es[i].name + " has come due.");
		out.emits.push({ event: "${CAME_DUE}", payload: { owner: ownerKey(input), entry: es[i].name } });
	}
	return out.lines.length ? out : {};
}
`
	)
})

/**
 * 🚧 **A deck, a hand and a discard pile** — cards (entries of one kind)
 * shuffled into a deck the world keeps, drawn into a hand only its holder
 * sees, played or thrown onto a discard pile everyone sees. Adds the three
 * zone types; a person may **Draw** (D6).
 * @experimental
 */
export const deckFunction = defineFunction("core:function/deck@1", {
	name: { en: "A deck, a hand and a discard pile" },
	meaning: { en: "Cards are drawn from a deck into a hand only its holder sees, and played onto a discard pile everyone sees." },
	kind: "zones",
	bindings: {
		deck: { to: "zone-type", label: { en: "Deck" } },
		hand: { to: "zone-type", label: { en: "Hand" } }
	},
	adds: {
		zoneTypes: [
			{ id: "deck", name: { en: "Deck" }, owners: ["world"], holds: "*", ordered: true, visibility: "gm", prose: "The deck: face down, in order; nobody knows what comes next.", shownAs: "count" },
			{ id: "hand", name: { en: "Hand" }, owners: ["cast"], holds: "*", visibility: "holder", prose: "A hand of cards only its holder sees.", shownAs: "fan" },
			{ id: "discard", name: { en: "Discard pile" }, owners: ["world"], holds: "*", visibility: "everyone", prose: "What has been played or thrown away, face up.", shownAs: "list" }
		]
	},
	prose: "Cards are drawn from {{deck}} into {{hand}}; nobody sees another's hand, and what is played is seen by all.",
	form: { draws: { type: "integer", min: 1, default: 1, label: { en: "Draw" }, description: { en: "How many cards a draw takes." } } },
	invokable: { label: { en: "Draw" }, form: { count: { type: "integer", min: 1, label: { en: "How many" } } } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, b = input.bindings || {}, deck = zoneOf(b.deck), hand = idOf(b.hand);
	if (!a || !deck || !hand) return {};
	var count = Math.max(1, Math.floor(num(a.count, num((input.options || {}).draws, 1)))), es = deck.entries || [];
	if (!es.length) return { lines: ["The deck is empty."] };
	var who = whoOf(input), out = { deltas: [] };
	for (var i = 0; i < Math.min(count, es.length); i++)
		out.deltas.push({ owner: "world", op: "move", entry: es[i].name, zone: deck.id, to: hand, toOwner: who, reason: "drawn" });
	if (count > es.length) out.lines = ["The deck held only " + es.length + "."];
	return out;
}
`
	)
})

/**
 * 🚧 **A carrying limit** — someone carries at most so many things (a
 * number, or as many as one of their values says); over it, they are
 * burdened, in words.
 * @experimental
 */
export const carryingLimitFunction = defineFunction("core:function/carrying-limit@1", {
	name: { en: "A carrying limit" },
	meaning: { en: "Someone carries only so much — a number, or as much as their strength says — and is burdened past it." },
	kind: "zones",
	bindings: {
		zone: { to: "zone-type", label: { en: "Carried in" } },
		most: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, pick: true, label: { en: "As much as" } }
	},
	prose: "Nobody carries more than they can; past their limit they are burdened and slowed.",
	form: { most: { type: "integer", min: 1, label: { en: "At most" }, description: { en: "How many things, when no value says." } } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var b = input.bindings || {}, zone = zoneOf(b.zone), most = attrOf(b.most);
	if (!zone) return {};
	var limit = most && typeof most.value === "number" ? most.value : num((input.options || {}).most, num(zone.limit, NaN));
	if (!isFinite(limit)) return {};
	var es = zone.entries || [], n = 0;
	for (var i = 0; i < es.length; i++) n += typeof es[i].count === "number" ? es[i].count : 1;
	if (n <= limit) return {};
	var who = input.owner && input.owner.name ? input.owner.name : "They";
	return { lines: [who + " carries " + n + " things, more than the " + limit + " they can: burdened and slowed."] };
}
`
	)
})

/** 🚧 Core's pieces-and-zones functions. @experimental */
export const PIECE_FUNCTIONS = Object.freeze([
	heldThingFunction,
	lastingConditionFunction,
	tieStandingFunction,
	obligationFunction,
	deckFunction,
	carryingLimitFunction
])
