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
import { CLAUSE_MODE_DECL } from './clauses.js';
import { POSITIONS, resolvePosition } from './review.js';
/** The reserved slot name. `register` refuses a descriptor that authors it. */
export const SETTINGS_SLOT = 'settings';
/**
 * `enabled` — may this optional node be switched off (`Descriptor.optional`).
 *
 * Off skips the node before its binding runs, which is the point: a starved
 * source is still queried; a switched-off one costs nothing. Only a node whose
 * contract says an empty result is fine may carry it — offering it anywhere
 * else would let somebody turn off a node whose output the next one requires.
 */
export const ENABLED_FIELD = Object.freeze({
    type: 'boolean',
    default: true,
    quick: true,
    label: { en: 'Use this source' },
    description: {
        en: 'Off skips the step entirely rather than fetching and discarding it — cheaper than starving it with a zero share.',
    },
});
/**
 * `review` — the gate's position on a node whose `effects` gate (01 §7).
 *
 * Declared per gated node from its `reviewDefault`, which an author may set
 * **on** and can never set to *never* — the declaration's `of` has no such
 * value, which is F14 enforced by the field language rather than by a check.
 * The two retired spellings (`sync`, `async`) are folded to `on` here exactly
 * as `resolvePosition` folds them at run time, so the panel's default and the
 * gate's agree.
 */
export function reviewField(reviewDefault) {
    return {
        type: 'enum',
        of: POSITIONS,
        default: resolvePosition(reviewDefault, undefined),
        label: { en: 'Review' },
        description: { en: 'Pause this step for approval before it takes effect.' },
        facet: 'review',
    };
}
/**
 * The substrate's `settings` slot for a definition, or nothing when the
 * definition has no switch to declare.
 *
 * `enabled` when the node is `optional`; `review` when its `effects` gate. A
 * node that is both (`embed-text`, `generate-json`) carries both fields on
 * the one slot — one address prefix, as the executor has always read it.
 */
export function settingsSlotFor(d) {
    const schema = {};
    if (d.optional === true)
        schema.enabled = ENABLED_FIELD;
    if (d.effects === 'write' || d.effects === 'external')
        schema.review = reviewField(d.reviewDefault);
    if (!Object.keys(schema).length)
        return undefined;
    return { kind: 'settings', facet: 'settings', schema };
}
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
 */
export function clauseSettingsSlotFor(clause) {
    if (clause.kind !== 'gather')
        return undefined;
    return {
        kind: 'settings',
        facet: 'settings',
        schema: {
            [CLAUSE_MODE_DECL.path]: {
                type: 'enum',
                of: CLAUSE_MODE_DECL.of,
                default: clause.mode === 'sequential' ? 'sequential' : 'parallel',
                label: CLAUSE_MODE_DECL.i18n,
                description: CLAUSE_MODE_DECL.description,
            },
        },
    };
}
/**
 * A row's slots minus the substrate's — what the content hash digests.
 *
 * Not hashed, and deliberately: the slot is derived from `optional`,
 * `effects` and `reviewDefault`, the first two of which are hashed on their
 * own terms already, so digesting it again would move every optional and
 * every gated definition's pin for a projection change nobody authored.
 * `reviewDefault` was not hashed before either; whether an author's default
 * gate position is contract is a separate ruling, not a side effect of this
 * one. The name is reserved (`checkNoAuthoredSettings`), so stripping by name
 * can never strip something an author wrote.
 */
export function authoredSlots(slots) {
    if (!slots || !(SETTINGS_SLOT in slots))
        return slots ?? {};
    const { [SETTINGS_SLOT]: _substrate, ...authored } = slots;
    return authored;
}
//# sourceMappingURL=settingsSlot.js.map