#!/usr/bin/env node
/**
 * 🚧 Vis Itineris's compendium pipeline — a SKELETON. It documents how rows beyond
 * the hand-written v1 slice are to be produced; it fetches nothing and
 * writes nothing yet. Running it prints the plan and exits.
 *
 * Source → rows, in four stages, each its own step so a run is reviewable:
 *
 *  1. **Snapshot** (separate, rate-limited, run by hand): the reference
 *     document's mechanics, saved once as JSON pages under a pinned
 *     `--snapshot <dir>` with a `manifest.json` (fetch date, source URL,
 *     per-category counts). The build below never touches the network.
 *     Only the System Reference Document 5.2.1 (CC-BY-4.0) is admitted; any
 *     row from another document is dropped at this stage.
 *  2. **Map** mechanics to Vis Itineris's piece fields: damage `"1d8"` → `damage
 *     { dice: 1, die: 'd8', type }`; weapon properties → `traits` (mastery as
 *     `mastery-<name>`); prices → copper pieces; weights → pounds; spell
 *     level, school, casting time, components, range, area, duration, focus,
 *     ritual, save, attack, damage and per-level scaling → the `spells`
 *     piece; conditions → `condition-<id>` traits. Ids: the source key with
 *     any document prefix stripped (`longsword`), unique per repertoire.
 *  3. **Write in our voice**: every `description` (and any `prose`) is
 *     drafted fresh — one sentence, at most 40 words — never the source's
 *     descriptive text; drafts are reviewed by hand before they ship.
 *  4. **Emit** one JSON file per repertoire into
 *     `core-catalog/src/rulesets/vis-itineris/compendium/`, each row with
 *     `version` and `source { document: 'SRD 5.2.1', licence: 'CC-BY-4.0' }`,
 *     leaving `LICENSE-CC-BY-4.0.md` untouched. `sdk-tests/visItineris.test.ts`
 *     then validates every row as a piece of its repertoire.
 *
 * Changing an existing row bumps its `version` and the ruleset's changelog;
 * a row is never removed, only retired (rulesets plan §23).
 */

const STAGES = ['snapshot', 'map', 'write', 'emit']

console.log('vis-itineris-compendium: skeleton only — nothing is fetched or written.')
console.log(`stages: ${STAGES.join(' → ')}`)
process.exit(0)
