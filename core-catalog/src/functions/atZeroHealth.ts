/**
 * 🚧 **At zero health** — the fall rule (lane G3, 2026-10-23; owner ruling
 * ★I of AUDIT-core-genres: "a catalogue function bound to the health
 * attribute holds the fall rule"). What happens when someone's health runs
 * out, decided by a bare roll of the ruleset's die — no modifier — one of two
 * ways, as the ruleset chooses in the reference's options:
 *
 *  · **one roll at death's door** (`door`): at or over its `target` they are
 *    back up on `upOn` health; under it they are down. A table that plays
 *    harsher moves the target up by `step` a step, a gentler one down;
 *  · **death saves** (`saves`): one roll a round against its `target` — a
 *    pass at or over it, a failure under it; its `low.face` counts
 *    `low.failures` failures, its `high.face` is back up on `high.upOn` at
 *    once. `passes` passes and they are stable; `failures` failures and they
 *    are down. Played instead of the door when the ruleset's option
 *    `savesWhen.option` is `savesWhen.is` (Vis Itineris's _At zero health:
 *    Death saves_).
 *
 * The numbers are the ruleset's (D9): a ruleset references this function
 * with its own (`{ ref: atZeroHealthFunction.id, key, bindings: { health },
 * options }`), and a genre that plays a fall reads that reference — the
 * Dungeon Crawler through its inlet's `ruleset` (`rulesetGistOf`). A ruleset
 * that does not reference it has no fall rule: the fall is told in words,
 * and no die is assumed.
 *
 * One rule, ES5 (`AT_ZERO_HEALTH_JS`, `atZeroHealthOf`): this module's body
 * splices it, and so does a genre script that plays the fall (the Dungeon
 * Crawler's death's door), so what the reference's numbers mean is said once.
 * The body answers when it is asked with the face rolled (`answer: { face,
 * tally?, saves?, steps? }`); it is not invokable — a fall is never a press
 * at the composer — so on its own it answers nothing.
 *
 * ⚠ Not Vis Itineris's _Dying 1–4_ track (`itineris-dying`), a slot nothing
 * plays; not the Dungeon Crawler's `fate` field, which the genre writes from
 * what this rule decided; not a **check** (a fall adds nothing to the roll).
 */
import { defineFunction, NUMBER_ATTRIBUTE_KINDS, type FieldDecl } from "@serene-pub/sdk"
import { BASICS_JS, body } from "./body.js"

/** 🚧 The id the fall rule is referenced by. @experimental */
export const AT_ZERO_HEALTH_FUNCTION_ID = "core:function/at-zero-health@1"

/**
 * 🚧 The fall rule's numbers, as a ruleset's reference says them
 * (`FunctionRef.options` of `core:function/at-zero-health@1`).
 * @experimental
 */
export interface AtZeroHealthOptions {
	/** The die a fall is rolled on, by its faces — the ruleset's own (Vis Itineris: its `die` way's 20). */
	readonly sides: number
	/** One roll at death's door: at or over `target`, back up on `upOn`; `step` what a harsher or gentler table moves the target by. */
	readonly door: { readonly target: number; readonly step: number; readonly upOn: number }
	/** Death saves, when the ruleset offers them. */
	readonly saves?: {
		readonly target: number
		readonly passes: number
		readonly failures: number
		readonly low: { readonly face: number; readonly failures: number }
		readonly high: { readonly face: number; readonly upOn: number }
	}
	/** Which of the ruleset's options, at which choice, plays death saves instead of the door. Absent: the door. */
	readonly savesWhen?: { readonly option: string; readonly is: string }
}

const int = (label: string, description?: string, min?: number): FieldDecl =>
	({
		type: "integer",
		required: true,
		...(min !== undefined ? { min } : {}),
		label: { en: label },
		...(description ? { description: { en: description } } : {})
	}) as FieldDecl

/** The options form: the die, the door, the saves, and which option plays the saves. */
const FORM: Readonly<Record<string, FieldDecl>> = Object.freeze({
	sides: int("Die", "The die a fall is rolled on, by its faces. Nothing is added to the roll.", 2),
	door: {
		type: "object",
		required: true,
		label: { en: "One roll at death's door" },
		fields: {
			target: int("Target", "At or over it, they pull through."),
			step: int("Step", "How far a harsher table raises the target, and a gentler one lowers it.", 0),
			upOn: int("Back up on", "The health someone who pulls through stands on.", 0)
		}
	} as FieldDecl,
	saves: {
		type: "object",
		label: { en: "Death saves" },
		description: { en: "A roll each round instead of one: enough passes and they are stable, enough failures and they are down." },
		fields: {
			target: int("Target", "At or over it, a pass; under it, a failure."),
			passes: int("Passes", "Passes that make them stable.", 1),
			failures: int("Failures", "Failures that put them down.", 1),
			low: {
				type: "object",
				required: true,
				label: { en: "Lowest face" },
				fields: { face: int("Face"), failures: int("Counts as failures", undefined, 1) }
			},
			high: {
				type: "object",
				required: true,
				label: { en: "Highest face" },
				fields: { face: int("Face"), upOn: int("Back up on", undefined, 0) }
			}
		}
	} as FieldDecl,
	savesWhen: {
		type: "object",
		label: { en: "Death saves when" },
		description: { en: "The ruleset option, and its choice, that plays death saves instead of the one roll." },
		fields: {
			option: { type: "string", required: true, label: { en: "Option" } },
			is: { type: "string", required: true, label: { en: "Choice" } }
		}
	} as FieldDecl
})

/**
 * 🚧 **The fall rule, ES5** — `atZeroHealthOf(options, face, tally, saves,
 * steps)`: what one bare roll `face` decides for someone whose health ran
 * out, under a reference's `options`. `saves` true plays the death saves (when
 * the options hold them) on the `tally` so far (`{ passed, failed }`);
 * `steps` moves the door's target that many steps (a harsher table +1, a
 * gentler −1). Answers `{ outcome, target, upOn?, passed?, failed?, saves? }`:
 * `outcome` is `survives` (back up on `upOn`), `stable` (three passes, say),
 * `dying` (the saves go on) or `down` (the door missed, or the failures ran
 * out — what down means is the genre's: dead, or taken out). Plain ES5, no
 * names outside it but its own two, so any script may splice it.
 * @experimental
 */
export const AT_ZERO_HEALTH_JS = `
function atZeroHealthCount(x) { return typeof x === "number" && isFinite(x) ? x : 0; }
function atZeroHealthOf(o, face, tally, saves, steps) {
	o = o || {};
	var door = o.door || {}, sv = o.saves || null;
	if (saves && sv) {
		var passed = atZeroHealthCount(tally && tally.passed), failed = atZeroHealthCount(tally && tally.failed);
		if (sv.high && face === sv.high.face) return { outcome: "survives", upOn: sv.high.upOn, target: sv.target, passed: passed, failed: failed, saves: true };
		if (sv.low && face === sv.low.face) failed += sv.low.failures;
		else if (face >= sv.target) passed += 1;
		else failed += 1;
		var said = failed >= sv.failures ? "down" : passed >= sv.passes ? "stable" : "dying";
		return { outcome: said, target: sv.target, passed: Math.min(passed, sv.passes), failed: Math.min(failed, sv.failures), saves: true };
	}
	var target = atZeroHealthCount(door.target) + atZeroHealthCount(steps) * atZeroHealthCount(door.step);
	return face >= target ? { outcome: "survives", upOn: door.upOn, target: target } : { outcome: "down", target: target };
}
`

/**
 * 🚧 **At zero health** — what happens when someone's health runs out: one
 * roll at death's door, or death saves, by the ruleset's numbers. Bound to
 * the health attribute.
 * @experimental
 */
export const atZeroHealthFunction = defineFunction(AT_ZERO_HEALTH_FUNCTION_ID, {
	name: { en: "At zero health" },
	meaning: { en: "When someone's health runs out, a bare roll decides whether they pull through — one roll at death's door, or a death save each round." },
	kind: "value",
	bindings: { health: { to: "attribute", kinds: NUMBER_ATTRIBUTE_KINDS, pick: true, label: { en: "Health" } } },
	prose: "When {{health}} runs out, nobody simply dies: a bare roll at death's door decides whether they pull through, are down, or — under death saves — hang on a round longer.",
	form: FORM,
	chance: true,
	rollsDice: true,
	phases: ["effects"],
	body: body(
		BASICS_JS,
		AT_ZERO_HEALTH_JS,
		`
export function effects(input) {
	var a = input.answer;
	if (!a || typeof a.face !== "number") return {};
	var h = attrOf((input.bindings || {}).health), who = whoOf(input);
	var f = atZeroHealthOf(input.options || {}, a.face, a.tally, a.saves === true, a.steps);
	var out = { lines: [] };
	if (f.outcome === "survives" && h) out.deltas = [{ owner: who, attribute: h.id, op: "set", value: f.upOn, reason: "pulled through" }];
	out.lines.push(f.outcome === "survives" ? "Pulled through at death's door." : f.outcome === "stable" ? "Stable at death's door." : f.outcome === "dying" ? "Still at death's door." : "Down at death's door.");
	return out;
}
`
	)
})

/** 🚧 The fall rule, as its group lists it. @experimental */
export const AT_ZERO_HEALTH_FUNCTIONS = Object.freeze([atZeroHealthFunction])
