/**
 * 🚧 Vis Itineris — core's rigorous d20 ruleset, in parts: slots (registering),
 * conventions and settings, repertoires, the compendium slice, conversions.
 * `registry/rulesets.ts` declares `core:ruleset/vis-itineris@1` from these.
 */
import type { ConversionDecl, ConversionIdMap } from "@serene-pub/sdk"

export * from "./slots.js"
export * from "./conventions.js"
export * from "./repertoires.js"
export * from "./compendium/index.js"
export * from "./rules.js"

/** @experimental */
export const VIS_ITINERIS_RULESET_ID = "core:ruleset/vis-itineris@1"

/**
 * 🚧 Freeform → Vis Itineris: nothing maps by id (Freeform keeps no numbers), so every
 * piece arrives as prose for review. Vis Itineris → Freeform needs no declaration:
 * Freeform takes any ruleset's pieces by prose carry.
 * @experimental
 */
export const VIS_ITINERIS_FROM_FREEFORM: ConversionDecl = Object.freeze({
	from: "core:ruleset/freeform@1",
	to: VIS_ITINERIS_RULESET_ID,
	idMap: Object.freeze([])
})

/**
 * 🚧 The id map toward a future plugin ruleset that shares Vis Itineris's
 * reference rules (`'weapons/longsword'` → its own reference). Empty until
 * that ruleset exists; the conversion is then declared by the ruleset it
 * converts to, with these rows as its `idMap`.
 * @experimental
 */
export const VIS_ITINERIS_PLUGIN_ID_MAP: readonly ConversionIdMap[] = Object.freeze([])
