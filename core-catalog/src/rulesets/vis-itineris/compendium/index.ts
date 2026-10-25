/**
 * 🚧 Vis Itineris's compendium — the v1 slice: 57 rows written in our own words,
 * each `{ id, version, source { document, licence }, piece: { … } }` — the
 * row's bookkeeping beside, its piece nested (2026-10-17). The data is the
 * JSON beside this file; the licence's required notice is
 * `LICENSE-CC-BY-4.0.md`, also beside it, and says which rows are ours
 * rather than the SRD's (_Envenomed_, `source.document: 'Vis Itineris'`).
 * `scripts/vis-itineris-compendium.mjs` documents how later rows are
 * produced.
 *
 * 🚧 The six **classes** (2026-10-21, Lair rewrite D9) are rows too — each
 * with its starting kit, which names rows of the other files by id, so a kit
 * naming a row this slice lacks is refused when the ruleset is declared.
 * They moved here from the Dungeon Crawler, which read them as its own.
 *
 * Row ids are stable and unique within their repertoire; a row's full
 * address is the ruleset, the repertoire and the id
 * (`core:ruleset/vis-itineris@1#weapons` / `longsword`).
 */
import type { CompendiumDecl, CompendiumRow } from "@serene-pub/sdk"
import weapons from "./weapons.json" with { type: "json" }
import armour from "./armour.json" with { type: "json" }
import gear from "./gear.json" with { type: "json" }
import consumables from "./consumables.json" with { type: "json" }
import spells from "./spells.json" with { type: "json" }
import feats from "./feats.json" with { type: "json" }
import conditions from "./conditions.json" with { type: "json" }
import classes from "./classes.json" with { type: "json" }

/**
 * The version every row of this slice carries. 1.1.0 (2026-10-17): rows
 * nested, `damage.type` → `damageType`, spells' `castingTime`/`actions`/
 * `duration` → `activation`/`actionCost`/`effectDuration`, traits that
 * repeated a field dropped, _Envenomed_ added.
 * @internal
 */
export const VIS_ITINERIS_COMPENDIUM_VERSION = "1.1.0"

/** 🚧 @experimental */
export const VIS_ITINERIS_COMPENDIUM: CompendiumDecl = Object.freeze({
	source: { document: "SRD 5.2.1", licence: "CC-BY-4.0" },
	rows: Object.freeze({
		weapons: weapons as readonly CompendiumRow[],
		armour: armour as readonly CompendiumRow[],
		gear: gear as readonly CompendiumRow[],
		consumables: consumables as readonly CompendiumRow[],
		spells: spells as readonly CompendiumRow[],
		feats: feats as readonly CompendiumRow[],
		conditions: conditions as readonly CompendiumRow[],
		classes: classes as readonly CompendiumRow[]
	})
})
