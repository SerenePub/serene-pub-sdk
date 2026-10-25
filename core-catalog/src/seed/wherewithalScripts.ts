/**
 * 🚧 Wherewithal's seeded scripts (`core:script:data/transform@1`, 2026-10-22,
 * M3), run by the ruleset handler at the phases `core:ruleset/wherewithal@1`
 * declares — one each for `derived`, `effects` and `render`, so the diceless
 * ruleset proves every phase a ruleset may script. Each takes one `value` (the
 * handler's envelope for its phase) and returns one document; pure, plain ES5.
 *
 * The handler owns the spends and the contest (the `bid` and `compare` check
 * methods); these compute what the conventions cannot say: mettle, the
 * strain of many troubles, and the price list the model reads.
 */
import { slotSlug } from "@serene-pub/sdk"
import { DATA_TRANSFORM_KIND, type CoreScriptSeed } from "../shared/scriptSeed.js"
import {
	WHEREWITHAL_COSTS,
	WHEREWITHAL_DEGREES,
	WHEREWITHAL_SCRIPT_KEYS,
	wherewithalFavourSlot,
	wherewithalNerveSlot,
	wherewithalProvisionsSlot
} from "../rulesets/wherewithal/index.js"

const seed = (seedKey: string, name: string, source: string): CoreScriptSeed =>
	Object.freeze({
		typeId: DATA_TRANSFORM_KIND,
		seedKey,
		name,
		source: source.trim(),
		varsIn: Object.freeze(["value"]),
		varsOut: Object.freeze(["value"])
	})

/** The pools as the scripts read them: `[selector, the word]`, from the slots. */
const POOLS = JSON.stringify(
	[wherewithalNerveSlot, wherewithalFavourSlot, wherewithalProvisionsSlot].map((s) => [slotSlug(s.id), String((s.label as { en: string }).en).toLowerCase()])
)

/**
 * **derived** — mettle and the reserve. In (the handler's envelope):
 * `{ owner, values: { selector: value }, pieces: { bonds: [{ footing }] } }`.
 * Out: `{ values: { mettle, reserve }, explain }` — mettle is the best of the
 * three pools plus one for each steady bond, at most two.
 * @experimental
 */
export const WHEREWITHAL_DERIVE_SCRIPT = seed(
	WHEREWITHAL_SCRIPT_KEYS.derive,
	"Wherewithal: mettle and reserve",
	`
var POOLS = ${POOLS};
var v = value || {};
var sv = v.values || {}, held = v.pieces || {};
function n(x) { return typeof x === "number" && isFinite(x) ? x : 0; }
var best = 0, reserve = 0;
for (var i = 0; i < POOLS.length; i++) { var p = n(sv[POOLS[i][0]]); reserve += p; if (p > best) best = p; }
var bonds = held.bonds || [], steady = 0;
for (var j = 0; j < bonds.length; j++) if (bonds[j] && bonds[j].footing === "steady") steady++;
var backing = Math.min(2, steady);
return { values: { mettle: best + backing, reserve: reserve }, explain: "mettle " + best + " (best pool)" + (backing ? " + " + backing + " (steady bonds)" : "") + "; reserve " + reserve };
`
)

/**
 * **effects** — the strain of many troubles. In: `{ owner, values, pieces:
 * { troubles }, events }`. Out: two or more troubles step every contest down
 * a degree with a rider (_worn thin_); a pool at zero is a rider too.
 * @experimental
 */
export const WHEREWITHAL_STRAIN_SCRIPT = seed(
	WHEREWITHAL_SCRIPT_KEYS.strain,
	"Wherewithal: troubles wear people thin",
	`
var POOLS = ${POOLS};
var v = value || {};
var sv = v.values || {}, held = v.pieces || {};
var who = v.owner && v.owner.name ? v.owner.name : "They";
var troubles = held.troubles || [];
var out = { adjust: [], riders: [] };
if (troubles.length >= 2) {
	out.adjust.push({ target: "contest", by: -1 });
	out.riders.push(who + " is worn thin: " + troubles.length + " troubles weigh on every contest.");
}
for (var i = 0; i < POOLS.length; i++)
	if (sv[POOLS[i][0]] === 0) out.riders.push(who + " is out of " + POOLS[i][1] + ": none can be spent until it is restored.");
out.explain = troubles.length + " trouble" + (troubles.length === 1 ? "" : "s") + " held";
return out;
`
)

/** The price list in words, from the declared costs and degrees (derive, don't spell). */
const PRICES = JSON.stringify(
	"What a spend buys: " +
		WHEREWITHAL_COSTS.filter((c) => c.spend > 0)
			.map((c) => `${c.spend}, ${String((WHEREWITHAL_DEGREES.bands.find((b) => b.id === c.band)!.label as { en: string }).en).toLowerCase()}`)
			.join("; ") +
		"."
)

/**
 * **render** — what the model reads: the price list laid after the voice,
 * so a proposal can say how much to spend. In: `{ blocks, outcomes }`. Out:
 * `{ blocks: { voice } }`, or nothing when no voice block renders.
 * @experimental
 */
export const WHEREWITHAL_RENDER_SCRIPT = seed(
	WHEREWITHAL_SCRIPT_KEYS.render,
	"Wherewithal: the price list",
	`
var v = value || {};
var b = v.blocks || {};
if (typeof b.voice !== "string" || !b.voice) return null;
return { blocks: { voice: b.voice + " " + ${PRICES} }, explain: "price list after the voice" };
`
)

/** 🚧 Wherewithal's scripts, in seed order. @experimental */
export const WHEREWITHAL_SCRIPTS: readonly CoreScriptSeed[] = Object.freeze([
	WHEREWITHAL_DERIVE_SCRIPT,
	WHEREWITHAL_STRAIN_SCRIPT,
	WHEREWITHAL_RENDER_SCRIPT
])
