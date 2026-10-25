/**
 * 🚧 **The reckoning** — `core:spec/story-reckoning`, a **routine**
 * (PLAN-layering §4, R5, R37; 2026-10-20): after a round of the story (or a
 * turn — the cadence an administrator picks, R36), ONE JSON call reads the
 * story's newest lines and notes what they made true — health, conditions,
 * belongings, the place, the time — and files it: applied on **Full**, held
 * for the owner on **Review** (the routine's mode, `$.input.routine`).
 *
 * Was the `reckon` junction at the tail of `core:spec/story-respond`, behind
 * the retired background tasks. It reads only the session — the history,
 * the cast and the state through queries — so it fits any cadence (R4, R12):
 * `afterEachRound()` in the Story genre's defaults (today's *wait for
 * everyone*), `afterEachTurn()` when an administrator swaps it.
 *
 * Its duties — *Keep the sheets*, *Track conditions*, *Move the clock*,
 * *Describe new places*, *End what runs out* — are its own settings, a switch
 * each (`core:task/reckoning-duties@1`); with none on, nothing is asked. At
 * `scripts` rigour the ruleset handler resolves the deltas (the Dungeon
 * Crawler's pattern). The graph, its scripts and its branches are a
 * reckoning routine's (`shared/reckoning.ts`, S5); this is Story's.
 * @experimental
 */
import { reckoningRoutineSpec } from '../../shared/reckoning.js'
import { STORY_RECKON_TERMS } from './reckon.js'

// 🚧 A reckoning routine's graph is every reckoning's (`shared/reckoning.ts`, 2026-10-23,
// PLAN-genres-seams S5: the Lair's keeper is the same graph); re-exported from its old home.
export { reckoningRoutineSpec, type ReckonOn, type ReckoningRoutineTerms } from '../../shared/reckoning.js'

/** @experimental */
export const STORY_RECKONING_SPEC_ID = 'core:spec/story-reckoning'
/** @internal */
export const STORY_RECKONING_VERSION = '1.0.0'

/** @experimental */
export const storyReckoningSpec = () =>
	reckoningRoutineSpec({
		id: STORY_RECKONING_SPEC_ID,
		version: STORY_RECKONING_VERSION,
		// The routine's name (`CORE_SPECS`) titles its duties card (S7).
		dutiesTitle: 'Note what changed',
		terms: STORY_RECKON_TERMS,
	})
