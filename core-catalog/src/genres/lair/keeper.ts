/**
 * 🚧 **The keeper** — `core:spec/lair-keeper`, a **routine** (rewrite D7,
 * 2026-10-21): after each round (or each turn — "When it runs", the cadence an
 * administrator or the owner swaps), ONE JSON call reads the round's lines and
 * notes what they made true — health, conditions, what the party carry, where
 * they stand — and files it: applied on **Full**, held for the GM on
 * **Review** (the routine's mode; Review by default, the old *Apply the
 * Castellan's stat changes without asking* off).
 *
 * It is a reckoning routine (`reckoningRoutineSpec`, `shared/reckoning.ts` —
 * Story's graph, the Dungeon Crawler's pattern underneath; reuse the
 * mechanics, not the opinions) under the Lair's id and prompt row, with three
 * differences that are the Lair's:
 *
 *  - **it reads the round's lines**, not one reply, on the Lair's prompt row
 *    (`LAIR_PROMPT_KEYS.keeper`), in the one change grammar the session's
 *    rules answer in (S1, `shared/reckoning.ts`): what the rules keep goes
 *    through the ruleset handler (`core:task/ruleset-resolve@1`, `apply` /
 *    `propose`), the sheets' own words are written in words — at `mechanics`
 *    and `scripts` alike, so the Lair needs no step of its own to sort by
 *    (its `core:script/lair-keeper-rules` lift and `before` step were retired
 *    2026-10-23, GM: G1's crib made them inert);
 *  - **it describes no new places** (`placesOnMove` off): the rooms are the
 *    GM's — the knock, *Build room*, *File as a room*;
 *  - **it moves no clock** (`time` off): the Lair gets no model-driven time
 *    (lane F, ★3) — the story clock is the GM's.
 *
 * Was the `keep` junction at the tail of `core:spec/lair-respond` and each
 * character turn's own books. It reads only the session, so it fits any
 * per-turn cadence.
 * @experimental
 */
import { LAIR_PROMPT_KEYS } from '../../seed/prompts.js'
import { reckoningRoutineSpec } from '../../shared/reckoning.js'

/** @experimental */
export const LAIR_KEEPER_SPEC_ID = 'core:spec/lair-keeper'
/** @internal */
export const LAIR_KEEPER_VERSION = '1.0.0'

/** @experimental */
export const lairKeeperSpec = () =>
	reckoningRoutineSpec({
		id: LAIR_KEEPER_SPEC_ID,
		version: LAIR_KEEPER_VERSION,
		// The routine's name (`CORE_SPECS`) titles its duties card (S7).
		dutiesTitle: 'Keep the books',
		terms: {
			prompt: LAIR_PROMPT_KEYS.keeper,
			// The session's ruleset, as the routine's inlet reads it (as Story's).
			ruleset: ($) => $.input.ruleset,
		},
		duties: { placesOnMove: false, time: false },
	})
