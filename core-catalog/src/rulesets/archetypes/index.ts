/**
 * 🚧 Core's **archetype rulesets** (PLAN-rulesets-functions D9, 2026-10-23): four small saved
 * rulesets over core's functions, each ≤ 60 lines with a playtest scene — _New ruleset_ offers them
 * beside From scratch. Declaring one registers it in the template registry (never the ruleset
 * registry), so this module and its four are named in core-catalog's `sideEffects`; they lead
 * `RULESET_TEMPLATES`, the dice templates after them.
 */
import type { RulesetTemplate } from "@serene-pub/sdk"
import { romanceTemplate } from "./romance.js"
import { sliceOfLifeTemplate } from "./sliceOfLife.js"
import { workplaceTemplate } from "./workplace.js"
import { cardGameTemplate } from "./cardGame.js"

export * from "./functionIds.js"
export * from "./romance.js"
export * from "./sliceOfLife.js"
export * from "./workplace.js"
export * from "./cardGame.js"

/** 🚧 The archetypes, in the order _New ruleset_ offers them. @experimental */
export const ARCHETYPE_TEMPLATES: readonly RulesetTemplate[] = Object.freeze([romanceTemplate, sliceOfLifeTemplate, workplaceTemplate, cardGameTemplate])
