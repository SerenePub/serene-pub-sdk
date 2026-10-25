/**
 * 🚧 Core's **ruleset templates** (2026-10-22, PLAN-rulesets-authoring D3,
 * ruling R2): the archetypes the admin's _New ruleset_ starts from — core's four
 * archetypes (`../archetypes/`), then d20-style, a dice pool, diceless pools — in the seven sections over core's functions
 * since 2026-10-23 (lane A2), each declaring its own attributes. Declaring one
 * registers it in the template registry (never the ruleset registry), so this
 * module and its three are named in core-catalog's `sideEffects`; ⏳ the slots
 * they carried before (`slots.ts`) stay registered for copies made then.
 *
 * Never offered under Rules: `defineRuleset` refuses a template, a genre may
 * not name one, and a copy (`reidRulesetDocument`) is a ruleset to play.
 */
import type { RulesetTemplate } from "@serene-pub/sdk"
// 🚧 The archetypes first (2026-10-23, D8/D9): _New ruleset_ offers them before the dice templates.
import { ARCHETYPE_TEMPLATES } from "../archetypes/index.js"
import "./slots.js"
import { d20StyleTemplate } from "./d20Style.js"
import { dicePoolTemplate } from "./dicePool.js"
import { dicelessPoolsTemplate } from "./dicelessPools.js"

export * from "./slots.js"
export * from "./d20Style.js"
export * from "./dicePool.js"
export * from "./dicelessPools.js"

/**
 * 🚧 Core's ruleset templates, in the order _New ruleset_ offers them: the four of
 * `../archetypes/` (romance, slice of life, workplace, card game), then d20-style, a dice pool
 * and diceless pools. @experimental
 */
export const RULESET_TEMPLATES: readonly RulesetTemplate[] = Object.freeze([...ARCHETYPE_TEMPLATES, d20StyleTemplate, dicePoolTemplate, dicelessPoolsTemplate])
