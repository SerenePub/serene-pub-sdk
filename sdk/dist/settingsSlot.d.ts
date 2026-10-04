/**
 * The `settings` slot — the one slot the substrate declares (R-9, ruled
 * 2026-09-15; 01 §1, 12 §2).
 *
 * Three switches have always been read by the executor off `config[key]
 * .settings.*` — `enabled` to skip an optional node, `review` to park a gated
 * one, `mode` to run a gather clause in turn — and until 2026-09-16 nothing
 * *declared* them: `settings` was not a `SlotKind`, and the configuration
 * panel synthesised the three controls by hand, wording and defaults included.
 * A control the executor honours and no declaration names is the shape 01
 * calls a substrate key and 12 §2 calls a slot; this file makes the second
 * word true.
 *
 * What is declared here is derived, never authored. A definition says
 * `optional: true` or `effects: 'write'` and the slot follows from that; a
 * clause says `gather` and its `mode` follows. The projection
 * (`snapshotRegistry`) writes the slot onto the registry row so the panel
 * reads it from rows like every other slot (F6), and the content hash leaves it
 * out — see `authoredSlots` — because a slot nobody authored cannot be a change
 * to what somebody authored; `optional` and `effects` are hashed already.
 *
 * The addresses are unchanged: `<nodeKey>.settings.enabled`,
 * `<nodeKey>.settings.review`, `<clauseId>.settings.mode`. Every stored row at
 * one of them is exactly as valid as it was.
 */
import type { FieldDecl } from './settings.js';
import type { SlotDecl } from './descriptors.js';
import { type ReviewPosition } from './review.js';
/** The reserved slot name. `register` refuses a descriptor that authors it. @experimental */
export declare const SETTINGS_SLOT: 'settings';
/**
 * `enabled` — may this optional node be switched off (`Descriptor.optional`).
 *
 * Off skips the node before its binding runs, which is the point: a starved
 * source is still queried; a switched-off one costs nothing. Only a node whose
 * contract says an empty result is fine may carry it — offering it anywhere
 * else would let somebody turn off a node whose output the next one requires.
 * @experimental
 */
export declare const ENABLED_FIELD: FieldDecl;
/**
 * `enabled` on an optional node that is not a source — a model call such as
 * the planner or the state keeper, or a task. The same switch at the same
 * address; only the words differ, because *Use this source* over a model call
 * says something untrue about it.
 * @experimental
 */
export declare const ENABLED_STEP_FIELD: FieldDecl;
/**
 * `review` — the gate's position on a node whose `effects` gate (01 §7).
 *
 * Declared per gated node from its `reviewDefault`, which an author may set
 * **on** and can never set to *never* — the declaration's `of` has no such
 * value, which is F14 enforced by the field language rather than by a check.
 * The two retired spellings (`sync`, `async`) are folded to `on` here exactly
 * as `resolvePosition` folds them at run time, so the panel's default and the
 * gate's agree.
 * @experimental
 */
export declare function reviewField(reviewDefault: ReviewPosition | undefined): FieldDecl;
/**
 * The substrate's `settings` slot for a definition, or nothing when the
 * definition has no switch to declare.
 *
 * `enabled` when the node is `optional` — worded as a source for a query, as a
 * step for anything else; `review` when its `effects` gate. A
 * node that is both (`embed-text`, `generate-json`) carries both fields on
 * the one slot — one address prefix, as the executor has always read it.
 * @experimental
 */
export declare function settingsSlotFor(d: {
    kind?: string;
    optional?: boolean;
    effects?: string;
    reviewDefault?: ReviewPosition;
}): SlotDecl | undefined;
/**
 * The substrate's `settings` slot for a clause, or nothing.
 *
 * A clause is not a node and has no registry row — it is a construct of the
 * substrate itself, the same in every document — so its declaration's home
 * is this function rather than a column: the row supplies `kind` and `mode`,
 * which are the document's, and the wording is `CLAUSE_MODE_DECL`'s. Only a
 * `gather` clause carries one: `each` and `loop` have a mode too, but theirs
 * is a property of what they iterate rather than a choice about concurrency,
 * and a junction's is the same story one construct over. The author's
 * declared mode is the default; the person's setting wins (`resolveClauseMode`).
 * @internal
 */
export declare function clauseSettingsSlotFor(clause: {
    kind: string;
    mode?: string | null;
}): SlotDecl | undefined;
/**
 * A row's slots minus the substrate's — what the content hash digests
 * (`definitionContract`).
 *
 * Not hashed, and deliberately: the slot is derived from `optional`,
 * `effects` and `reviewDefault`. The first two are contract and hashed on
 * their own terms, so digesting the slot again would move every optional and
 * every gated definition's pin for a projection change nobody authored;
 * `reviewDefault` is policy (plans/31 V6) and hashed nowhere. The name is
 * reserved (`checkNoAuthoredSettings`), so stripping by name can never strip
 * something an author wrote.
 * @experimental
 */
export declare function authoredSlots<T>(slots: Record<string, T> | undefined): Record<string, T>;
//# sourceMappingURL=settingsSlot.d.ts.map