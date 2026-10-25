/**
 * 🚧 **Values** — what a number or a word is and how it keeps (lane A2,
 * 2026-10-23): a number between a floor and a most, a pool that refills when
 * something happens, a tally, rungs a number climbs, a word that stands for
 * where things are — and core's reserved readings of the shape before
 * sections: a worked-out value and typed bonuses (`rulesetSections`).
 *
 * The engine keeps storage and bounds (D3); these say what the model reads,
 * and the few that compute say it in a body.
 */
import { CORE_FUNCTION_IDS, defineFunction, NUMBER_ATTRIBUTE_KINDS, SCENE_CLOSED_EVENT, type FieldDecl } from "@serene-pub/sdk"
import { BASICS_JS, body } from "./body.js"

/** Display text as a locale map — a worked-out value's row words. */
const wordsOption = (label: string, description: string): FieldDecl => ({
	type: "object",
	label: { en: label },
	description: { en: description },
	fields: { en: { type: "string", label: { en: "English" } } }
})

/**
 * 🚧 **A number between a floor and a most** — the value never passes
 * either (the engine holds it to its attribute's bounds); the model reads
 * that it is bounded.
 * @experimental
 */
export const boundedNumberFunction = defineFunction("core:function/bounded-number@1", {
	name: { en: "A number between a floor and a most" },
	meaning: { en: "A number that rises and falls but never passes its floor or its most." },
	kind: "value",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "The number" } } },
	prose: "{{what}} rises and falls with what happens, and never passes its floor or its most.",
	schema: {
		who: { type: "string", required: true, label: { en: "Whose" } },
		by: { type: "integer", required: true, label: { en: "By" }, description: { en: "How much it moves — negative to lower it." } }
	}
})

/**
 * 🚧 **A pool that refills** — spent down, and filled back when an event
 * happens (a scene closes, a rest is taken): to its most, or by an amount.
 * @experimental
 */
export const refillingPoolFunction = defineFunction("core:function/refilling-pool@1", {
	name: { en: "A pool that refills" },
	meaning: { en: "Something spent down and filled back when a moment comes round — a scene's end, a night's sleep." },
	kind: "value",
	bindings: { pool: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, label: { en: "The pool" } } },
	prose: "{{pool}} is spent as it is used and comes back when the moment comes round.",
	form: {
		on: {
			type: "string",
			default: SCENE_CLOSED_EVENT,
			label: { en: "Refills when" },
			description: { en: "The event it refills on, by id — a scene closing, a rest taken." }
		},
		by: { type: "integer", min: 1, label: { en: "By" }, description: { en: "How much comes back. Left out: all of it." } }
	},
	phases: ["effects"],
	body: body(
		BASICS_JS,
		`
export function effects(input) {
	var o = input.options || {}, ev = input.event, pool = attrOf((input.bindings || {}).pool);
	if (!ev || !pool || ev.id !== (o.on || "${SCENE_CLOSED_EVENT}")) return {};
	if (typeof o.by === "number") return { deltas: [{ owner: ownerKey(input), attribute: pool.id, op: "add", value: o.by, reason: "refilled" }] };
	if (typeof pool.max !== "number" || pool.value === pool.max) return {};
	return { deltas: [{ owner: ownerKey(input), attribute: pool.id, op: "set", value: pool.max, reason: "refilled" }] };
}
`
	)
})

/**
 * 🚧 **A tally** — a number modifiers add up on and nothing rolls (a damage
 * bonus). Reserved: what a tally selector of the shape before sections reads
 * as. Header-only.
 * @experimental
 */
export const tallyFunction = defineFunction(CORE_FUNCTION_IDS.tally, {
	name: { en: "A tally" },
	meaning: { en: "A number bonuses add up on — a damage bonus — that nothing is ever rolled for." },
	kind: "value",
	prose: "A tally adds up what is laid on it; nothing is rolled for it, and it says how much more a blow or an effort carries."
})

/**
 * 🚧 **Rungs** — a number read as the rung it has reached (_Stranger_ from
 * 0, _Friend_ from 4, _Confidant_ from 8): what the model reads instead of
 * the number, worked out per owner.
 *
 * 🚧 Bound to an **entry's number field** (`entryFields`, ties T3,
 * 2026-10-23) — `bond.affection` — it is worked out per held entry, a tie's
 * per side; with `into`, the rung's words are kept in that field of the same
 * entry (a zone ask `set`), where a field that reads onto the lorebook
 * carries them to the graph (Romance's _Standing_ from _Affection_).
 * @experimental
 */
export const rungsFunction = defineFunction("core:function/rungs@1", {
	name: { en: "Rungs" },
	meaning: { en: "A number read as the named rung it has reached — Stranger, Friend, Confidant." },
	kind: "value",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, entryFields: true, label: { en: "The number" } } },
	prose: "{{what}} is read as the rung it has reached; speak of the rung, never the number.",
	form: {
		rungs: {
			type: "list",
			required: true,
			min: 1,
			label: { en: "Rungs" },
			description: { en: "Each rung's words and the least number it starts at, lowest first." },
			item: { type: "object", fields: { from: { type: "integer", required: true, label: { en: "From" } }, words: { type: "string", required: true, label: { en: "Words" } } } }
		},
		into: {
			type: "string",
			label: { en: "Kept in" },
			description: { en: "For an entry's number: the field of the same entry that keeps the rung's words — worked out, never set by hand. Left out, the model reads the rung." }
		}
	},
	phases: ["derived"],
	body: body(
		BASICS_JS,
		`
export function derived(input) {
	var o = input.options || {}, b = (input.bindings || {}).what;
	var rungs = (o.rungs || []).slice().sort(function (a, b) { return a.from - b.from; });
	function rungOf(n) { var at = null; for (var i = 0; i < rungs.length; i++) if (n >= rungs[i].from) at = rungs[i]; return at; }
	var who = input.owner && input.owner.name ? input.owner.name : "";
	var fields = b && b.fields;
	if (fields) {
		var deltas = [], lines = [];
		for (var sel in fields) {
			var f = fields[sel], es = f.entries || [];
			for (var j = 0; j < es.length; j++) {
				var e = es[j], v = e.fields ? e.fields[f.field] : undefined, at = typeof v === "number" ? rungOf(v) : null;
				if (!at) continue;
				if (!o.into) lines.push((who ? who + " → " : "") + e.name + ": " + at.words);
				else if (e.fields[o.into] !== at.words)
					deltas.push({ op: "set", owner: ownerKey(input), entry: e.fields.towards ? { entryType: e.entryType, towards: e.fields.towards } : { entryType: e.entryType, name: e.name }, field: o.into, value: at.words, reason: "worked out" });
			}
		}
		return { deltas: deltas, lines: lines };
	}
	var what = attrOf(b);
	if (!what || typeof what.value !== "number") return {};
	var at = rungOf(what.value);
	if (!at) return {};
	return { lines: [(who ? who + ": " : "") + at.words] };
}
`
	)
})

/**
 * 🚧 **A word that stands for where things are** — one of its attribute's
 * words (_calm_ · _wary_ · _hostile_), moved by naming another; with
 * `stepwise`, only to a neighbour.
 * @experimental
 */
export const wordValueFunction = defineFunction("core:function/word-value@1", {
	name: { en: "A word for where things are" },
	meaning: { en: "One of a few words — calm, wary, hostile — that says where things stand, moved by naming another." },
	kind: "value",
	bindings: { what: { to: "attribute", kinds: ["label", "text"], label: { en: "The word" } } },
	prose: "{{what}} is one of its words and says where things stand; it moves when something earns the change.",
	schema: {
		who: { type: "string", required: true, label: { en: "Whose" } },
		to: { type: "string", required: true, label: { en: "To" }, description: { en: "The word it moves to." } }
	},
	form: { stepwise: { type: "boolean", default: false, label: { en: "A word at a time" }, description: { en: "It moves only to a neighbouring word." } } }
})

/**
 * 🚧 **A worked-out value** — computed from others (`from`) by the ruleset's
 * own script, never stored; `onSheet` puts it on the sheet under `label`.
 * Reserved: what a derived selector of the shape before sections reads as.
 * Header-only.
 * @experimental
 */
export const workedOutFunction = defineFunction(CORE_FUNCTION_IDS.workedOut, {
	name: { en: "A worked-out value" },
	meaning: { en: "A value worked out from others — armour from agility — never stored, always current." },
	kind: "value",
	prose: "Some values are worked out from others and always current; read them as given.",
	form: {
		from: { type: "string[]", label: { en: "From" }, description: { en: "The values it is worked out from." } },
		onSheet: { type: "boolean", label: { en: "On the sheet" }, description: { en: "Shown on the sheet beside the values it is worked out from." } },
		label: wordsOption("Words", "What the sheet calls it.")
	}
})

/**
 * 🚧 **Typed bonuses** — the kinds a bonus may be (_gear_, _status_), how they
 * stack (the best of each, or all of them), and the kind read as an edge.
 * Reserved: what `conventions.bonuses` reads as. Header-only — the engine
 * stacks them.
 * @experimental
 */
export const typedBonusesFunction = defineFunction(CORE_FUNCTION_IDS.typedBonuses, {
	name: { en: "Typed bonuses" },
	meaning: { en: "Bonuses come in kinds; only the best of each kind counts — or they all add up." },
	kind: "value",
	prose: "Bonuses come in kinds, and of each kind only the best one counts; an edge rolls twice and keeps the better.",
	form: {
		types: { type: "string[]", required: true, label: { en: "Kinds" }, description: { en: "The kinds a bonus may be — gear, status, circumstance." } },
		stacking: {
			type: "enum",
			required: true,
			of: ["highest-per-type", "sum"],
			members: [
				{ key: "highest-per-type", label: { en: "Only the best of each kind counts" } },
				{ key: "sum", label: { en: "They all add up" } }
			],
			label: { en: "Stacking" }
		},
		edge: { type: "string", label: { en: "Edge" }, description: { en: "The kind read as an edge: net one rolls twice and keeps the better." } }
	}
})

/** 🚧 Core's value functions. @experimental */
export const VALUE_FUNCTIONS = Object.freeze([
	boundedNumberFunction,
	refillingPoolFunction,
	tallyFunction,
	rungsFunction,
	wordValueFunction,
	workedOutFunction,
	typedBonusesFunction
])
