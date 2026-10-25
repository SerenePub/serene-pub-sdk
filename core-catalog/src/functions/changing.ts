/**
 * 🚧 **Changing** — what moves a value, an entry or a zone (lane A2,
 * 2026-10-23): reduce, restore, set, transfer, mark a tally; give and take
 * an entry; move one between zones, reveal one — and core's reserved
 * casting pool (`conventions.casting` read as a function).
 *
 * Each answers when a person invokes it (D6: its `effects` handler with the
 * `answer`), when a reply proposes it (its `schema`, R7), or — given `on` —
 * when an event comes round. None writes (R8): each returns deltas in the
 * ruleset handler's grammar, which the outlet applies or proposes under the
 * registration's mode.
 */
import { CORE_FUNCTION_IDS, defineFunction, NUMBER_ATTRIBUTE_KINDS, type SettingsSchema } from "@serene-pub/sdk"
import { BASICS_JS, body } from "./body.js"

/** Whose value it is, and why — what every change may say. */
const WHO: SettingsSchema = {
	who: { type: "string", required: true, label: { en: "Whose" }, description: { en: "Who it changes for." } },
	why: { type: "string", label: { en: "Why" }, description: { en: "What brought it about, in a few words." } }
}

/** The event a change also answers on, besides being invoked or proposed. */
const ON_OPTION: SettingsSchema = {
	on: { type: "string", label: { en: "Also when" }, description: { en: "An event it happens on by itself, by id — a turn ending, a scene closing." } }
}

/**
 * The guard every changing body opens with: an answer (invoked, proposed),
 * else the event it is set to answer on; else nothing.
 */
const WHEN_JS = `
function answering(input) {
	if (input.answer) return input.answer;
	var on = (input.options || {}).on;
	if (on && input.event && input.event.id === on) return {};
	return null;
}
function why(a, fallback) { return typeof a.why === "string" && a.why ? a.why : fallback; }
`

/**
 * 🚧 **Reduce** — a value goes down by an amount (harm, a cooling, a cost).
 * @experimental
 */
export const reduceFunction = defineFunction("core:function/reduce@1", {
	name: { en: "Reduce" },
	meaning: { en: "A value goes down by an amount — hurt taken, warmth lost, a price paid." },
	kind: "changing",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Reduce" } } },
	prose: "{{what}} goes down when something costs it.",
	schema: { ...WHO, by: { type: "integer", min: 1, required: true, label: { en: "By" } } },
	form: { by: { type: "integer", min: 1, default: 1, label: { en: "By" }, description: { en: "How much it goes down when nobody says." } }, ...ON_OPTION },
	invokable: { label: { en: "Reduce" }, form: { ...WHO, by: { type: "integer", min: 1, label: { en: "By" } } } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		WHEN_JS,
		`
export function effects(input) {
	var a = answering(input), what = attrOf((input.bindings || {}).what);
	if (!a || !what) return {};
	var by = num(a.by, num((input.options || {}).by, 1));
	return { deltas: [{ owner: whoOf(input), attribute: what.id, op: "add", value: -Math.abs(by), reason: why(a, "reduced") }] };
}
`
	)
})

/**
 * 🚧 **Restore** — a value comes back to its most (or where it started).
 * @experimental
 */
export const restoreFunction = defineFunction("core:function/restore@1", {
	name: { en: "Restore" },
	meaning: { en: "A value comes back to its most — or to where it started." },
	kind: "changing",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Restore" } } },
	prose: "{{what}} comes back when it is restored.",
	schema: WHO,
	form: {
		to: {
			type: "enum",
			of: ["most", "start"],
			members: [
				{ key: "most", label: { en: "Its most" } },
				{ key: "start", label: { en: "Where it started" } }
			],
			default: "most",
			label: { en: "Back to" }
		},
		...ON_OPTION
	},
	invokable: { label: { en: "Restore" }, form: WHO },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		WHEN_JS,
		`
export function effects(input) {
	var a = answering(input), what = attrOf((input.bindings || {}).what);
	if (!a || !what) return {};
	var to = (input.options || {}).to === "start" ? what.start : what.max;
	if (to === undefined || to === null) return { lines: [what.id + " has no " + ((input.options || {}).to === "start" ? "start" : "most") + " to come back to."] };
	return { deltas: [{ owner: whoOf(input), attribute: what.id, op: "set", value: to, reason: why(a, "restored") }] };
}
`
	)
})

/**
 * 🚧 **Set** — a value becomes what is named (a word, a number).
 * @experimental
 */
export const setValueFunction = defineFunction("core:function/set-value@1", {
	name: { en: "Set" },
	meaning: { en: "A value becomes what is named — a new word, a new number." },
	kind: "changing",
	bindings: { what: { to: "attribute", kinds: [...NUMBER_ATTRIBUTE_KINDS, "label", "text"], label: { en: "Set" } } },
	prose: "{{what}} becomes what the story makes it.",
	schema: { ...WHO, to: { type: "string", required: true, label: { en: "To" } } },
	form: { to: { type: "string", label: { en: "To" }, description: { en: "What it becomes when nobody says — on its event." } }, ...ON_OPTION },
	invokable: { label: { en: "Set" }, form: { ...WHO, to: { type: "string", required: true, label: { en: "To" } } } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		WHEN_JS,
		`
export function effects(input) {
	var a = answering(input), what = attrOf((input.bindings || {}).what);
	if (!a || !what) return {};
	var to = a.to !== undefined ? a.to : (input.options || {}).to;
	if (to === undefined || to === null || to === "") return {};
	if (typeof to === "string" && /^-?\\d+$/.test(to) && typeof what.value === "number") to = Number(to);
	return { deltas: [{ owner: whoOf(input), attribute: what.id, op: "set", value: to, reason: why(a, "set") }] };
}
`
	)
})

/**
 * 🚧 **Transfer** — an amount passes from one holder's value to another's
 * (coin paid, favour owed); refused, in words, when the giver holds less.
 * @experimental
 */
export const transferFunction = defineFunction("core:function/transfer@1", {
	name: { en: "Transfer" },
	meaning: { en: "An amount passes from one holder to another — coin paid, favour owed — and nobody gives what they do not have." },
	kind: "changing",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Transfer" } } },
	prose: "{{what}} passes between people; nobody gives more than they hold.",
	schema: {
		from: { type: "string", required: true, label: { en: "From" } },
		to: { type: "string", required: true, label: { en: "To" } },
		amount: { type: "integer", min: 1, required: true, label: { en: "How much" } }
	},
	invokable: {
		label: { en: "Give" },
		form: { to: { type: "string", required: true, label: { en: "To" } }, amount: { type: "integer", min: 1, required: true, label: { en: "How much" } } }
	},
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, what = attrOf((input.bindings || {}).what);
	if (!a || !what) return {};
	var from = typeof a.from === "string" && a.from ? a.from : (typeof input.actor === "string" && input.actor) || ownerKey(input), to = a.to;
	var amount = Math.floor(num(a.amount, 0));
	if (!from || !to || amount <= 0) return {};
	if (typeof what.value === "number" && what.value < amount) return { lines: [from + " holds " + what.value + " " + what.id + ", not the " + amount + " given."] };
	return {
		deltas: [
			{ owner: from, attribute: what.id, op: "add", value: -amount, reason: "given to " + to },
			{ owner: to, attribute: what.id, op: "add", value: amount, reason: "given by " + from }
		]
	};
}
`
	)
})

/**
 * 🚧 **Mark a tally** — a count goes up by one (or more): a mark of shame, a
 * debt remembered, a step towards something.
 * @experimental
 */
export const markTallyFunction = defineFunction("core:function/mark-tally@1", {
	name: { en: "Mark a tally" },
	meaning: { en: "A count goes up by one — a debt remembered, a step towards something." },
	kind: "changing",
	bindings: { tally: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "Mark" } } },
	prose: "{{tally}} is marked each time it is earned, and never goes down by itself.",
	schema: { ...WHO, marks: { type: "integer", min: 1, label: { en: "Marks" } } },
	form: { marks: { type: "integer", min: 1, default: 1, label: { en: "Marks" } }, ...ON_OPTION },
	invokable: { label: { en: "Mark" }, form: WHO },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		WHEN_JS,
		`
export function effects(input) {
	var a = answering(input), tally = attrOf((input.bindings || {}).tally);
	if (!a || !tally) return {};
	return { deltas: [{ owner: whoOf(input), attribute: tally.id, op: "add", value: Math.max(1, Math.floor(num(a.marks, num((input.options || {}).marks, 1)))), reason: why(a, "marked") }] };
}
`
	)
})

/** What every entry change names: whose, and which entry — by name or library row id. */
const ENTRY: SettingsSchema = {
	who: WHO.who!,
	entry: { type: "string", required: true, label: { en: "Which" }, description: { en: "The entry, by name or library row id." } }
}

/**
 * 🚧 **Give an entry** — someone comes to hold an entry of a kind (a
 * keepsake, a trouble, a card): a copy stamped from the entry.
 * @experimental
 */
export const addEntryFunction = defineFunction("core:function/add-entry@1", {
	name: { en: "Give an entry" },
	meaning: { en: "Someone comes to hold something new — a keepsake, a trouble, a card." },
	kind: "pieces",
	bindings: {
		kind: { to: "entry-type", label: { en: "Give" } },
		into: { to: "zone-type", pick: true, label: { en: "Into" } }
	},
	prose: "{{kind}} are come by in play: found, given, earned, suffered.",
	schema: ENTRY,
	invokable: { label: { en: "Give" }, form: ENTRY },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, kind = idOf((input.bindings || {}).kind), into = idOf((input.bindings || {}).into);
	if (!a || !kind || !a.entry) return {};
	return { deltas: [{ owner: whoOf(input), op: "add", entry: { name: a.entry, entryType: kind }, zone: into || "carried", reason: typeof a.why === "string" ? a.why : "given" }] };
}
`
	)
})

/**
 * 🚧 **Take an entry** — someone no longer holds an entry (spent, lost, lifted).
 * @experimental
 */
export const removeEntryFunction = defineFunction("core:function/remove-entry@1", {
	name: { en: "Take an entry" },
	meaning: { en: "Someone no longer holds something — spent, lost, lifted." },
	kind: "pieces",
	bindings: {
		kind: { to: "entry-type", label: { en: "Take" } },
		from: { to: "zone-type", pick: true, label: { en: "From" } }
	},
	prose: "{{kind}} are lost, spent or lifted in play, and gone once they are.",
	schema: ENTRY,
	invokable: { label: { en: "Take" }, form: ENTRY },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, kind = idOf((input.bindings || {}).kind), from = idOf((input.bindings || {}).from);
	if (!a || !kind || !a.entry) return {};
	return { deltas: [{ owner: whoOf(input), op: "remove", entry: a.entry, zone: from || "carried", reason: typeof a.why === "string" ? a.why : "taken" }] };
}
`
	)
})

/**
 * 🚧 **Move between zones** — an entry passes from one zone to another (hand
 * to table, pocket to shelf, one person's keeping to another's); who sees it
 * is its new zone's to say.
 * @experimental
 */
export const moveEntryFunction = defineFunction("core:function/move-entry@1", {
	name: { en: "Move between zones" },
	meaning: { en: "Something passes from one place it is kept to another — hand to table, pocket to shelf, one person to another." },
	kind: "zones",
	bindings: {
		from: { to: "zone-type", pick: true, label: { en: "From" } },
		to: { to: "zone-type", pick: true, label: { en: "To" } }
	},
	prose: "Things move between where they are kept, and who can see them follows where they are.",
	schema: {
		...ENTRY,
		from: { type: "string", required: true, label: { en: "From" }, description: { en: "The zone it leaves, by id." } },
		to: { type: "string", required: true, label: { en: "To" }, description: { en: "The zone it goes to, by id." } },
		toWhom: { type: "string", label: { en: "To whom" }, description: { en: "Whose zone it goes to, when not the same person's." } }
	},
	invokable: {
		label: { en: "Move" },
		form: { entry: ENTRY.entry!, toWhom: { type: "string", label: { en: "To whom" } } }
	},
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer, b = input.bindings || {};
	if (!a || !a.entry) return {};
	var from = typeof a.from === "string" && a.from ? a.from : idOf(b.from), to = typeof a.to === "string" && a.to ? a.to : idOf(b.to);
	if (!from || !to) return { lines: ["Say where " + a.entry + " moves from and to."] };
	var d = { owner: whoOf(input), op: "move", entry: a.entry, zone: from, to: to };
	if (typeof a.toWhom === "string" && a.toWhom) d.toOwner = a.toWhom;
	return { deltas: [d] };
}
`
	)
})

/**
 * 🚧 **Reveal** — its holder shows an entry beyond its zone's eyes (a card
 * turned face up, a secret told): the held copy is marked `exposed`.
 * @experimental
 */
export const revealFunction = defineFunction("core:function/reveal@1", {
	name: { en: "Reveal" },
	meaning: { en: "Someone shows what only they could see — a card turned up, a secret told." },
	kind: "zones",
	bindings: { zone: { to: "zone-type", pick: true, label: { en: "Kept in" } } },
	prose: "What someone keeps hidden stays hidden until they choose to show it; once shown, everyone present knows.",
	schema: { ...ENTRY, zone: { type: "string", label: { en: "Kept in" }, description: { en: "The zone it is kept in, by id." } } },
	invokable: { label: { en: "Reveal" }, form: { entry: ENTRY.entry! } },
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var a = input.answer;
	if (!a || !a.entry) return {};
	var d = { owner: whoOf(input), op: "reveal", entry: a.entry };
	var z = typeof a.zone === "string" && a.zone ? a.zone : idOf((input.bindings || {}).zone);
	if (z) d.zone = z;
	return { deltas: [d] };
}
`
	)
})

/**
 * 🚧 **A casting pool** — what a cast spends when the rules spend a pool for
 * it rather than the thing cast (spell points). Reserved: what
 * `conventions.casting` reads as. Header-only — the engine spends it
 * (`castingPoolOf`).
 * @experimental
 */
export const castingPoolFunction = defineFunction(CORE_FUNCTION_IDS.castingPool, {
	name: { en: "A casting pool" },
	meaning: { en: "Casting spends from one pool — its cost the spell's level — refilled by a rest." },
	kind: "changing",
	prose: "Casting spends from one pool, as much as the spell's level; a cantrip costs nothing, and a rest fills the pool again.",
	form: {
		pool: { type: "string", required: true, label: { en: "Spends from" }, description: { en: "The value a cast spends." } },
		cost: { type: "string", required: true, label: { en: "Costs" }, description: { en: "The field of what is cast whose value it costs — level." } },
		repertoire: { type: "string", label: { en: "Cast from" }, description: { en: "The one entry type casts come out of." } },
		refill: { type: "string", label: { en: "Refilled by" }, description: { en: "The rest that fills it back." } },
		max: { type: "string", label: { en: "Filled to" }, description: { en: "The value it fills back to." } }
	}
})

/** 🚧 Core's changing functions — values, entries, zones. @experimental */
export const CHANGING_FUNCTIONS = Object.freeze([
	reduceFunction,
	restoreFunction,
	setValueFunction,
	transferFunction,
	markTallyFunction,
	addEntryFunction,
	removeEntryFunction,
	moveEntryFunction,
	revealFunction,
	castingPoolFunction
])
