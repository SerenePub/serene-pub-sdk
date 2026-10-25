/**
 * 🚧 **Wherewithal in the seven sections** (lane A2, 2026-10-23;
 * PLAN-rulesets-functions D2, D9) — the diceless ruleset rebuilt over core's
 * functions: its three pools and core's mood (borrowed); five ways to decide
 * — the table's judgement first (the default), three spends (core's spend:
 * a pool each, one cost table) and a contest (core's compare, mettle against
 * mettle, base riding on the way); mettle and the reserve worked out; its
 * own three modules (worked-out values, troubles' strain, the price list),
 * their bodies its seeded scripts; bonds, troubles and boons as entry types;
 * five outcome words; time by the scene and two rests; its library.
 *
 * What it plays by is unchanged — `sdk-tests/catalogueParity.test.ts` proves
 * every reading equal to the declaration before sections.
 * `registry/rulesets.ts` declares it, adding the shared vocabulary it plays.
 */
import { slotSlug, type CheckMethodDecl, type RulesetProps } from "@serene-pub/sdk"
import { moodSlot } from "../../registry/slots.js"
import { lastingConditionFunction, workedOutFunction } from "../../functions/index.js"
import { entryTypeOf, optionsOf, outcomesOf, ownModuleRef, wayRef, workedOutRef } from "../sections.js"
import {
	WHEREWITHAL_COMPENDIUM,
	WHEREWITHAL_CONVENTIONS,
	WHEREWITHAL_DEGREES,
	WHEREWITHAL_FROM_FREEFORM,
	WHEREWITHAL_OWN_SLOTS,
	WHEREWITHAL_REPERTOIRES,
	WHEREWITHAL_RULESET_ID,
	WHEREWITHAL_SCRIPT_KEYS,
	WHEREWITHAL_VOICE
} from "./index.js"

const C = WHEREWITHAL_CONVENTIONS
const M = C.methods as Readonly<Record<string, CheckMethodDecl>>
const POOLS = WHEREWITHAL_OWN_SLOTS.map((s) => slotSlug(s.id))

/**
 * 🚧 **Wherewithal** — no dice, in the seven sections. `registry/rulesets.ts`
 * declares `core:ruleset/wherewithal@1` from it.
 * @experimental
 */
export const WHEREWITHAL_RULESET: RulesetProps = Object.freeze({
	name: { en: "Wherewithal" },
	description: {
		en: "Wherewithal — no dice. Nerve, favour and provisions are spent to carry a risk, mettle is weighed in a contest, and the people someone is bound to steady them or cost them. Written for Serene Pub."
	},
	voice: WHEREWITHAL_VOICE,
	attributes: [...WHEREWITHAL_OWN_SLOTS.map((s) => ({ id: slotSlug(s.id), slot: s.id })), { id: slotSlug(moodSlot.id), slot: moodSlot.id, borrowed: true as const, tags: ["mood"] }],
	functions: [
		// The table's judgement is the default way; a check named as its way is that way's use.
		wayRef("judgement", M.judgement!),
		wayRef("dare", M.dare!),
		wayRef("sway", M.sway!),
		wayRef("make-do", M["make-do"]!),
		wayRef("contest", M.contest!, { base: "mettle" }),
		workedOutRef("mettle", { from: POOLS, onSheet: true, label: { en: "Mettle" } }),
		workedOutRef("reserve", { from: POOLS, label: { en: "Reserve" } }),
		ownModuleRef(WHEREWITHAL_RULESET_ID, WHEREWITHAL_SCRIPT_KEYS.strain, {
			name: { en: "Wherewithal: troubles wear people thin" },
			meaning: { en: "Two or more troubles step every contest down; a pool at nothing can be spent no more." },
			kind: "pieces",
			prose: "Troubles pile up: two or more wear a person thin and every contest goes worse; an empty pool can be spent no more.",
			phase: "effects",
			forkedFrom: lastingConditionFunction
		}),
		ownModuleRef(WHEREWITHAL_RULESET_ID, WHEREWITHAL_SCRIPT_KEYS.derive, {
			name: { en: "Wherewithal: mettle and reserve" },
			meaning: { en: "Mettle is the best pool, one more for each steady bond (two at most); the reserve is all three pools." },
			kind: "value",
			prose: "Mettle is someone's best pool, steadied by the bonds that hold; read it as given.",
			phase: "derived",
			forkedFrom: workedOutFunction
		}),
		ownModuleRef(WHEREWITHAL_RULESET_ID, WHEREWITHAL_SCRIPT_KEYS.render, {
			name: { en: "Wherewithal: the price list" },
			meaning: { en: "What a spend buys, said after the voice, so a proposal knows how much to spend." },
			kind: "value",
			prose: "What a spend buys is said plainly, so a proposal can say how much to spend.",
			phase: "render"
		})
	],
	entryTypes: WHEREWITHAL_REPERTOIRES.map((r) => entryTypeOf(r, r.entryable === true)),
	outcomes: outcomesOf(WHEREWITHAL_DEGREES),
	time: { ...C.time, rests: C.rest! },
	library: WHEREWITHAL_COMPENDIUM,
	options: optionsOf({}, undefined, [WHEREWITHAL_FROM_FREEFORM])
}) as RulesetProps
