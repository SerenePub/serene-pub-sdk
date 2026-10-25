/**
 * 🚧 **Progression and economy** — growing and trading (lane A2, 2026-10-23):
 * experience that raises a level, money spent at a price, a standing that
 * opens a door, a limited supply that runs out.
 *
 * ⚠ _Limited supply_ is an item's **supply** in its one meaning (how many of a
 * thing exist — `ITEM_SUPPLY_MODES`' `limited`), never Wherewithal's
 * _provisions_.
 */
import { defineFunction, NUMBER_ATTRIBUTE_KINDS } from "@serene-pub/sdk"
import { BASICS_JS, body } from "./body.js"

/** The event a level reached raises. */
const LEVEL_EVENT = "core:event/level-reached@1"

/**
 * 🚧 **Experience raises a level** — experience gathered past a threshold
 * raises its holder's level (to the highest threshold reached, never down);
 * `level-reached` is raised for whatever answers a new level.
 * @experimental
 */
export const experienceLevelsFunction = defineFunction("core:function/experience-levels@1", {
	name: { en: "Experience raises a level" },
	meaning: { en: "Experience gathered past a threshold raises a level, and a new level brings what it brings." },
	kind: "progression",
	bindings: {
		experience: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Experience" } },
		level: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Level" } }
	},
	adds: { events: [{ id: LEVEL_EVENT, name: { en: "A level was reached" } }] },
	prose: "{{experience}} gathers with what is done and survived; past each threshold {{level}} rises.",
	form: {
		thresholds: {
			type: "list",
			required: true,
			min: 1,
			label: { en: "Thresholds" },
			description: { en: "The experience each level after the first starts at, lowest first: the second level's, the third's…" },
			item: { type: "integer", min: 1 }
		},
		first: { type: "integer", default: 1, label: { en: "First level" } }
	},
	emits: [LEVEL_EVENT],
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var b = input.bindings || {}, xp = attrOf(b.experience), level = attrOf(b.level), o = input.options || {};
	if (!xp || !level || typeof xp.value !== "number") return {};
	var steps = (o.thresholds || []).slice().sort(function (a, c) { return a - c; });
	var reached = num(o.first, 1);
	for (var i = 0; i < steps.length; i++) if (xp.value >= steps[i]) reached = num(o.first, 1) + i + 1;
	var now = num(level.value, num(o.first, 1));
	if (reached <= now) return {};
	var who = ownerKey(input);
	return {
		deltas: [{ owner: who, attribute: level.id, op: "set", value: reached, reason: "experience" }],
		emits: [{ event: "${LEVEL_EVENT}", payload: { owner: who, level: reached } }],
		lines: [(input.owner && input.owner.name ? input.owner.name : who) + " reaches level " + reached + "."]
	};
}
`
	)
})

/**
 * 🚧 **Money and prices** — things cost money; a person may **Buy** (D6): the
 * price comes off their money and the thing is theirs, and nobody buys what
 * they cannot pay for.
 * @experimental
 */
export const pricesFunction = defineFunction("core:function/prices@1", {
	name: { en: "Money and prices" },
	meaning: { en: "Things cost money; what is bought is paid for, and nobody buys what they cannot afford." },
	kind: "progression",
	bindings: {
		money: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Money" } },
		goods: { to: "entry-type", label: { en: "What is sold" } }
	},
	prose: "{{goods}} cost {{money}}; what is bought is paid for, and nobody spends what they do not have.",
	schema: {
		who: { type: "string", required: true, label: { en: "Who buys" } },
		entry: { type: "string", required: true, label: { en: "What" } },
		price: { type: "integer", min: 0, required: true, label: { en: "Price" } }
	},
	invokable: {
		label: { en: "Buy" },
		form: { entry: { type: "string", required: true, label: { en: "What" } }, price: { type: "integer", min: 0, required: true, label: { en: "Price" } } }
	},
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, b = input.bindings || {}, money = attrOf(b.money), goods = idOf(b.goods);
	if (!a || !money || !goods || !a.entry) return {};
	var price = Math.max(0, Math.floor(num(a.price, 0))), who = whoOf(input);
	if (typeof money.value === "number" && money.value < price) return { lines: [who + " has " + money.value + ", not the " + price + " " + a.entry + " costs."] };
	return {
		deltas: [
			{ owner: who, attribute: money.id, op: "add", value: -price, reason: "bought " + a.entry },
			{ owner: who, op: "add", entry: { name: a.entry, entryType: goods }, zone: "carried", reason: "bought" }
		]
	};
}
`
	)
})

/**
 * 🚧 **A standing that opens a door** — once someone's standing reaches a
 * mark, something opens to them (the guild hall, the queen's ear); the model
 * reads which side of it they are on.
 * @experimental
 */
export const reputationGateFunction = defineFunction("core:function/reputation-gate@1", {
	name: { en: "A standing that opens a door" },
	meaning: { en: "Once someone is well enough thought of, a door opens to them — the guild hall, the queen's ear." },
	kind: "progression",
	bindings: { standing: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Standing" } } },
	prose: "Some doors open only to those whose {{standing}} is high enough.",
	form: {
		at: { type: "integer", required: true, label: { en: "At" }, description: { en: "The standing it opens at." } },
		opens: { type: "string", required: true, label: { en: "Opens" }, description: { en: "What opens, in a few words." } }
	},
	phases: ["derived"],
	body: body(
		BASICS_JS,
		`
export function derived(input) {
	var o = input.options || {}, s = attrOf((input.bindings || {}).standing);
	if (!s || typeof s.value !== "number" || !o.opens) return {};
	var who = input.owner && input.owner.name ? input.owner.name : "They";
	return { lines: [s.value >= o.at ? who + " is welcome: " + o.opens + "." : who + " is not yet welcome: " + o.opens + " opens at " + o.at + " " + s.id + "."] };
}
`
	)
})

/**
 * 🚧 **A limited supply** — only so many of a thing are to be had (the
 * world's stock); taking one draws it down, and when none are left none can
 * be had. A person may **Take one** (D6).
 * @experimental
 */
export const limitedSupplyFunction = defineFunction("core:function/limited-supply@1", {
	name: { en: "A limited supply" },
	meaning: { en: "Only so many of a thing are to be had; each one taken leaves fewer, and none can be had once they are gone." },
	kind: "progression",
	bindings: {
		stock: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "How many are left" } },
		goods: { to: "entry-type", label: { en: "Of what" } }
	},
	prose: "Only so many {{goods}} are to be had; once they are gone, they are gone.",
	form: { holder: { type: "string", default: "world", label: { en: "Kept by" }, description: { en: "Whose value counts what is left — the world's, by default." } } },
	invokable: { label: { en: "Take one" }, form: { entry: { type: "string", required: true, label: { en: "What" } } } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, b = input.bindings || {}, stock = attrOf(b.stock), goods = idOf(b.goods);
	if (!a || !stock || !goods || !a.entry) return {};
	if (typeof stock.value === "number" && stock.value <= 0) return { lines: ["There is no " + a.entry + " left to be had."] };
	var who = whoOf(input);
	return {
		deltas: [
			{ owner: (input.options || {}).holder || "world", attribute: stock.id, op: "add", value: -1, reason: "taken by " + who },
			{ owner: who, op: "add", entry: { name: a.entry, entryType: goods }, zone: "carried", reason: "taken" }
		]
	};
}
`
	)
})

/** 🚧 Core's progression-and-economy functions. @experimental */
export const PROGRESSION_FUNCTIONS = Object.freeze([experienceLevelsFunction, pricesFunction, reputationGateFunction, limitedSupplyFunction])
