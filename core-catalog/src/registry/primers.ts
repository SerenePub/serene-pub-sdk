/**
 * 🚧 The primers core ships — the starter content a lorebook can be created
 * from (rulesets §21).
 *
 * **Vis Itineris** (`core:primer/vis-itineris@1`) is a starter world in our own words
 * with every Vis Itineris compendium row derived (`rulesets/vis-itineris/primer/`).
 * **Blank** (`core:primer/freeform@1`; `core:primer/story@1` until
 * 2026-10-19) is blank: a lorebook that plays Freeform,
 * with nothing in it yet.
 *
 * Declared after the rulesets and their derived entry types: a primer's
 * entries are checked against those types.
 */
import { definePrimer, EMPTY_PRIMER_CONTENT } from "@serene-pub/sdk"
// The derived entry types first: an entry of `core:entry/vis-itineris.gear@1`
// validates against the type that registry declares.
import "./entries.js"
import { VIS_ITINERIS_PRIMER, VIS_ITINERIS_PRIMER_ID } from "../rulesets/vis-itineris/primer/index.js"

/** 🚧 Freeform — blank: the ruleset chosen, nothing written. @experimental */
export const freeformPrimer = definePrimer("core:primer/freeform@1", {
	ruleset: "core:ruleset/freeform@1",
	compendiumMode: "referenced",
	name: { en: "Blank" },
	description: { en: "An empty lorebook that plays Freeform. Write the world yourself." },
	content: EMPTY_PRIMER_CONTENT
})

/** 🚧 Vis Itineris — Brackenvale, with every compendium row derived. @experimental */
export const visItinerisPrimer = definePrimer(VIS_ITINERIS_PRIMER_ID, VIS_ITINERIS_PRIMER)

/** 🚧 Core's primers, blank first. @experimental */
export const CORE_PRIMERS = Object.freeze([freeformPrimer, visItinerisPrimer])
