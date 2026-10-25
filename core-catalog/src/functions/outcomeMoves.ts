/**
 * 🚧 **An outcome moves a number** (ties T3, 2026-10-23) — how a check came
 * out moves a value by the amount its outcome word says: a confession that
 * lands warms, one that falls flat cools. Bound to an attribute, it moves
 * that attribute of whoever it names; bound to an **entry's number field**
 * (`entryFields`, `bond.affection`), it moves a tie's side — by default the
 * side the one aimed at holds, towards the one who checked ("how they feel
 * about you"), as a check reads it — through the zone ask `set` with `by`.
 *
 * An `after` handler: it reads the check as it came out (its key, its
 * outcome word, who made it and at whom) and answers deltas, never a write
 * (R8). ⚠ Not `margins` (which reads a margin as an outcome word): this
 * reads the outcome word and moves something by it.
 */
import { defineFunction, NUMBER_ATTRIBUTE_KINDS } from "@serene-pub/sdk"
import { BASICS_JS, body } from "./body.js"

/** 🚧 @experimental */
export const outcomeMovesFunction = defineFunction("core:function/outcome-moves@1", {
	name: { en: "An outcome moves a number" },
	meaning: { en: "How a check comes out moves a number — a confession that lands warms, one that falls flat cools." },
	kind: "changing",
	bindings: { what: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, entryFields: true, label: { en: "The number" } } },
	prose: "{{what}} moves with how a check comes out: further for an outcome that lands, back for one that falls flat.",
	form: {
		check: { type: "string", required: true, label: { en: "The check" }, description: { en: "The check whose outcome moves it, by its key — confess." } },
		moves: {
			type: "list",
			required: true,
			min: 1,
			label: { en: "Moves" },
			description: { en: "How far each outcome moves it: the outcome word's id and an amount, negative to lower it." },
			item: { type: "object", fields: { outcome: { type: "string", required: true, label: { en: "Outcome" } }, by: { type: "integer", required: true, label: { en: "By" } } } }
		},
		whose: {
			type: "enum",
			of: ["aimed-at", "checker"],
			default: "aimed-at",
			members: [
				{ key: "aimed-at", label: { en: "Whoever it was aimed at — their side, towards the one checking" } },
				{ key: "checker", label: { en: "Whoever made the check — their side, towards whoever it was aimed at" } }
			],
			label: { en: "Whose" }
		}
	},
	// 🚧 RF fix 8 (RF fix 6 ★3): `check` names one of the ruleset's checks by key — refused as `unknown-way` when it names none.
	optionRoles: { check: { names: "function" } },
	phases: ["after"],
	body: body(
		BASICS_JS,
		`
export function after(input) {
	var o = input.options || {}, c = input.check || {}, b = (input.bindings || {}).what;
	if (!o.check || !(c.selector === o.check || (!c.selector && c.method && c.method.key === o.check))) return {};
	var id = c.degree && c.degree.id, by = null, ms = o.moves || [];
	if (!id) return {};
	for (var i = 0; i < ms.length; i++) if (ms[i] && ms[i].outcome === id) by = ms[i].by;
	if (typeof by !== "number" || !by) return {};
	var checker = c.by || ownerKey(input), aimed = typeof c.aimedAt === "string" ? c.aimedAt : "";
	var mine = o.whose === "checker", owner = mine ? checker : aimed, other = mine ? aimed : checker;
	var why = "how " + o.check + " came out";
	if (!owner) return {};
	var f = b && b.fields, sel = b && b.ids ? b.ids[0] : "";
	if (f && f[sel]) {
		if (!other) return {};
		return { deltas: [{ op: "set", owner: owner, entry: { entryType: f[sel].entryType, towards: other }, field: f[sel].field, by: by, reason: why }] };
	}
	var what = attrOf(b);
	if (!what) return {};
	return { deltas: [{ owner: owner, attribute: what.id, op: "add", value: by, reason: why }] };
}
`
	)
})
