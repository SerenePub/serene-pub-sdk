/**
 * 🚧 **Core's function catalogue** (PLAN-rulesets-functions D1, D3, D4;
 * lane A2, 2026-10-23) — the small rules a ruleset is built from, as function
 * modules: a header (name, meaning, kind, function bindings, prose, a schema
 * fragment for JSON replies, an options form, phases, events, whether a
 * person may invoke it) and, where it computes, a body (`body.ts` holds the
 * contract every body keeps and the helpers they splice in).
 *
 * Declaring one registers it (`defineFunction`; an identical re-declaration
 * is a no-op), so these modules are side-effectful. A ruleset references
 * them — `{ ref: dieTargetFunction.id, key: 'd20', options }` — and pins the
 * version in the id; editing a body forks it into the ruleset
 * (`forkFunction`).
 *
 * The catalogue, by group (`CORE_FUNCTION_GROUPS`), in the order it was
 * published:
 *
 *  1. **values** · **deciding** · **changing** · **scopes** — the first batch;
 *  2. **pieces and zones** · **time and order** · **progression and economy**
 *     · **asking** (header-only until B1).
 *
 * Every id core reserved (`CORE_FUNCTION_IDS`) is declared here with the
 * kind it was reserved as, and the ways' options are the check methods'
 * (`CHECK_METHOD_KINDS`), so a ruleset in the shape before sections reads as
 * references to these (`rulesetSections`) and checks clean.
 * @experimental
 */
import type { FunctionDecl } from "@serene-pub/sdk"
import { VALUE_FUNCTIONS } from "./values.js"
import { DECIDING_FUNCTIONS } from "./deciding.js"
import { CHANGING_FUNCTIONS } from "./changing.js"
import { SCOPE_FUNCTIONS } from "./scopes.js"
import { PIECE_FUNCTIONS } from "./pieces.js"
import { TIME_FUNCTIONS } from "./time.js"
import { PROGRESSION_FUNCTIONS } from "./progression.js"
import { ASKING_FUNCTIONS } from "./asking.js"
import { atZeroHealthFunction } from "./atZeroHealth.js"
import { outcomeMovesFunction } from "./outcomeMoves.js"

export * from "./body.js"
export * from "./values.js"
export * from "./deciding.js"
export * from "./changing.js"
export * from "./scopes.js"
export * from "./pieces.js"
export * from "./time.js"
export * from "./progression.js"
export * from "./asking.js"
export * from "./atZeroHealth.js"
export * from "./outcomeMoves.js"

/** 🚧 The catalogue's groups, in the editor's order — what its drawer lists under each heading. @experimental */
export const CORE_FUNCTION_GROUPS = Object.freeze({
	// 🚧 …and the fall rule, bound to health (lane G3, 2026-10-23, ★I): `atZeroHealth.ts`.
	values: Object.freeze([...VALUE_FUNCTIONS, atZeroHealthFunction]),
	deciding: DECIDING_FUNCTIONS,
	// 🚧 …and an outcome that moves a number — a tie's side among them (ties T3, 2026-10-23): `outcomeMoves.ts`.
	changing: Object.freeze([...CHANGING_FUNCTIONS, outcomeMovesFunction]),
	scopes: SCOPE_FUNCTIONS,
	"pieces-and-zones": PIECE_FUNCTIONS,
	"time-and-order": TIME_FUNCTIONS,
	"progression-and-economy": PROGRESSION_FUNCTIONS,
	asking: ASKING_FUNCTIONS
} as const)

/** 🚧 The first batch published (values, deciding, changing, scopes) — what the archetypes are built over first. @experimental */
export const CORE_FUNCTIONS_FIRST_BATCH: readonly FunctionDecl[] = Object.freeze([...VALUE_FUNCTIONS, ...DECIDING_FUNCTIONS, ...CHANGING_FUNCTIONS, ...SCOPE_FUNCTIONS])

/** 🚧 Every function core ships, group by group. @experimental */
export const CORE_FUNCTIONS: readonly FunctionDecl[] = Object.freeze(Object.values(CORE_FUNCTION_GROUPS).flat())
