/**
 * 🚧 Vis Itineris's primer — the starter lorebook core ships with Vis Itineris, written
 * in our own words: one region (Brackenvale) and its starting town (Lantern
 * Ford), ten places joined by exits, three factions and the premise as world
 * lore, seven cast members with Vis Itineris sheets and their relationships, a
 * calendar with a starting clock, and five leads. Its compendium mode is
 * `derived`: every Vis Itineris compendium row is materialised as an entry of its
 * derived entry type when a lorebook is created from it.
 *
 * The data is the JSON beside this file; `registry/primers.ts` declares it.
 */
import type { PrimerContent, PrimerProps, StoryCalendar, StoryTime } from "@serene-pub/sdk"
import entries from "./entries.json" with { type: "json" }
import places from "./places.json" with { type: "json" }
import cast from "./cast.json" with { type: "json" }
import relationships from "./relationships.json" with { type: "json" }
import leads from "./leads.json" with { type: "json" }
import time from "./calendar.json" with { type: "json" }

/** @experimental */
export const VIS_ITINERIS_PRIMER_ID = "core:primer/vis-itineris@1"

/** 🚧 @experimental */
export const VIS_ITINERIS_PRIMER: PrimerProps = Object.freeze({
	ruleset: "core:ruleset/vis-itineris@1",
	compendiumMode: "derived",
	name: { en: "Brackenvale" },
	description: {
		en: "A river vale, a market town ringed by failing lanterns, a mire full of fog and a mine gone quiet. Ten places, seven people, five leads — and every Vis Itineris compendium row as an entry."
	},
	content: Object.freeze({
		entries,
		places,
		cast,
		relationships,
		leads,
		calendar: time.calendar as StoryCalendar,
		clock: time.clock as StoryTime
	}) as unknown as PrimerContent
}) as PrimerProps
