/**
 * 🚧 Dungeon Crawler's round (PLAN-dungeon-crawler-2026-10-14, features 16–17,
 * D4, D11) — the multiplayer half's names, beside the round script
 * (`roundScript.ts`) that decides it.
 *
 * **How a round goes, end to end** (no spec of its own — see why below):
 *
 *  1. A player says what their character does on Story. That line IS the
 *     declaration (`DUNGEON_CRAWLER_DECLARED_RULE`, `names.ts`): the
 *     `message-completed` it causes recomputes the turn order, and the round
 *     script places the story turn once every named, live player seat has a
 *     line since the Story's newest reply. Solo: one seat, one line, the turn.
 *  2. **Continue** resolves the round early. The `advance` control fires the
 *     story turn itself (`sessions:fireTurn`'s carry-on): the owner's press
 *     always may; a player's only once they have declared this round (D4) —
 *     anyone else is refused, as a guest with nothing prepared always was.
 *  3. The story turn gives every seat that did not declare its **standing
 *     order** (`core:slot/standing-order@1`: hold · follow · fight · flee,
 *     default hold — D11). A player sets theirs at the end of the interview
 *     (`standingOrderBlock` in the interview script) or by asking the Planner
 *     in their lane (`parley.ts`'s edits).
 *  4. The Narrator's reply on Story is a reply: the next round starts empty.
 *     A deleted or hidden line un-declares.
 *
 * ⚠ **Why no "declare" spec writing the annex.** A declaration written to
 * the annex would land as `annex-changed` under a run's cause,
 * which auto-advance never fires on (R34) — the last player's line would
 * prepare the Narrator and leave it silent. Read off the rows, the
 * recompute the line itself causes (a person's cause) finds the round
 * complete and fires it.
 */

/** The standing order's question, by the key its block carries as `referent`. @experimental */
export const STANDING_ORDER_QUESTION = 'standing-order'

/**
 * 🚧 The four standing orders, as the question offers them — the slot's
 * `config.of`, in its order, each with what the Planner says back.
 * @experimental
 */
export const DUNGEON_CRAWLER_STANDING_ORDERS = Object.freeze([
	Object.freeze({ key: 'hold', label: 'Hold position', says: 'hold their position' }),
	Object.freeze({ key: 'follow', label: 'Follow the party', says: 'follow the party' }),
	Object.freeze({ key: 'fight', label: 'Fight', says: 'fight whatever threatens them' }),
	Object.freeze({ key: 'flee', label: 'Flee', says: 'get out of danger' }),
] as const)
