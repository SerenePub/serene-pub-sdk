/**
 * 🚧 **One delta, read one way** (moved from Dungeon Crawler's script
 * preamble on 2026-10-19, when the Story genre's reckoning became its second
 * reader): `deltaOf(raw)` turns a delta as a model writes it — every member
 * present, empty text and `0` saying "none" (the grammar-compiling
 * families) — into the ruleset handler's shape (`core:task/ruleset-resolve@1`'s
 * `deltas`), or `null` when it names nothing to change.
 *
 * ES5 source, spliced into a script preamble; the preamble supplies `own`,
 * `text`, `num`, `ucSlotName` and `NOT_FOR_DELTAS` (the slots no delta may
 * touch — an empty list where every slot may move). Byte for byte the text
 * Dungeon Crawler's preamble always carried, so its seeded scripts are the
 * sources they were.
 * @internal
 */
export const DELTA_OF_JS = `// ── A delta, as the story turn's Planner and the Planner's talk propose it
// (\`DUNGEON_CRAWLER_DELTA_SCHEMA\`), in the ruleset handler's shape, or null
// when it names nothing to change. The schema's enums say which ops, slots
// and repertoires there are (AUDIT C7: none is re-validated here); empty
// members are dropped. ──
var CHECK_OPS = ["hit", "use", "traverse"];
function deltaOf(raw) {
	var d = own(raw);
	var owner = text(d.owner), op = text(d.op);
	if (!owner || !op) return null;
	var out = { owner: owner, op: op };
	// The slots no delta may touch (the standing order, the fate, the
	// clock, the table's rules) are left out of the schema's enum — and
	// refused here too, since a backend that ignores the grammar is still a
	// backend (AUDIT C7 kept one guard, not two).
	if (text(d.slot) && NOT_FOR_DELTAS.indexOf(ucSlotName(text(d.slot))) >= 0) return null;
	if (text(d.slot)) out.slot = text(d.slot);
	if (text(d.repertoire)) out.repertoire = text(d.repertoire);
	if (text(d.piece)) out.piece = text(d.piece);
	if (text(d.value)) out.value = /^-?\\d+(\\.\\d+)?$/.test(text(d.value)) ? Number(text(d.value)) : text(d.value);
	if (text(d.check)) out.check = text(d.check);
	if (num(d.against, 0) > 0) out.against = Math.round(num(d.against, 0));
	// 🚧 Who a hit or a use is aimed at (P2-1).
	if (text(d.aimedAt)) out.aimedAt = text(d.aimedAt);
	if (text(d.reason)) out.reason = text(d.reason);
	if (!out.slot && !out.repertoire && !out.check && CHECK_OPS.indexOf(op) < 0) return null;
	return out;
}
`
