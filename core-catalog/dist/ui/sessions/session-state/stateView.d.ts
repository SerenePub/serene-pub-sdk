/**
 * What core's two state widgets draw (R21), from the `session_state` section
 * and their settings — the reading the native World State and Stats widgets
 * did against the page's store, as plain functions over the section, so the
 * remote widgets and their tests share one answer.
 *
 * A value is looked up by its slot's QUALIFIED key (every value is filed
 * under it; the bare key is the first claimant's display name), and an owner
 * carries a slot exactly when the slot's id is a key of its `configs`.
 */
import type { SessionStateOwnerV1, SessionStateSlotV1, SessionStateV1, SlotListItem } from '@serene-pub/sdk';
import { type BarBounds } from './barMath.js';
/**
 * A value a person may write: `null` clears the session's layer, so the read
 * inherits again. A list is written whole, its items in order.
 * @experimental
 */
export type SlotWriteValue = number | string | boolean | null | readonly SlotListItem[];
/** One slot as a widget draws it for one owner: what it is, its bounds, its value. @experimental */
export interface ShownSlot {
    slot: SessionStateSlotV1;
    /** The configuration in force for this owner — a bar's bounds, a chip's options. */
    config: Record<string, unknown>;
    /** The resolved value; `undefined` when no layer answers. */
    value: unknown;
}
/** A settings list of names (`pickSlots`, `pickMembers`): trimmed, lower-cased, blanks dropped. @experimental */
export declare function pickedNames(raw: unknown): string[];
/** The slots an owner may carry, in declaration order. @experimental */
export declare function slotsFor(state: SessionStateV1, owner: SessionStateOwnerV1): SessionStateSlotV1[];
/** One owner's value for one slot, by the slot's qualified key. @experimental */
export declare function valueOf(state: SessionStateV1, owner: SessionStateOwnerV1, slot: SessionStateSlotV1): unknown;
/** Does this owner have any value at all — is it in play? @experimental */
export declare function hasAnyValue(state: SessionStateV1, owner: SessionStateOwnerV1): boolean;
/**
 * 🚧 One location drawn under the world (attributes phase 4): a
 * `session_location` owner and the slots it shows.
 * @experimental
 */
export interface WorldStatePlace {
    owner: SessionStateOwnerV1;
    slots: ShownSlot[];
}
/**
 * The World State widget's drawing. `loading` until the first read lands
 * (empty then means "not yet", never "nothing"); `failed` when that first
 * read was refused — the section's error says why, and nothing is coming, so
 * no loading line may stay beside it; `empty` says which of two
 * sentences — `none-declared` (nothing in the session declares a stat at all)
 * or `none-shown` (stats exist, none of them the world's, or none picked).
 * `not-granted` when the host said the widget does not hold `session:state`
 * (`granted === false`): the section will never come, so it is said rather
 * than waited for.
 * @experimental
 */
export type WorldStateView = {
    status: 'not-granted';
    layout: 'strip' | 'list';
} | {
    status: 'loading';
    layout: 'strip' | 'list';
} | {
    status: 'failed';
    layout: 'strip' | 'list';
} | {
    status: 'empty';
    layout: 'strip' | 'list';
    reason: 'none-declared' | 'none-shown';
} | {
    status: 'shown';
    layout: 'strip' | 'list';
    owner: SessionStateOwnerV1;
    slots: ShownSlot[];
    /**
     * 🚧 Each location in play — one with a value in a slot this
     * widget shows — under the world's own slots (phase 4). A place
     * nothing has been said about is not drawn: an empty card is not
     * a stat.
     */
    places: WorldStatePlace[];
};
/** @experimental */
export declare function worldStateView(state: SessionStateV1 | undefined, settings: Record<string, unknown>, 
/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
granted?: boolean): WorldStateView;
/** One cast member's card. @experimental */
export interface StatsMember {
    owner: SessionStateOwnerV1;
    slots: ShownSlot[];
}
/**
 * The Stats widget's drawing: `loading` before the first read; `failed`
 * when that first read was refused (the section's error is the whole story);
 * `none-declared` when no slot is declared at all; `no-members` when nobody
 * the `members` setting admits is left (`pick` says so differently);
 * `not-granted` when the host said the widget does not hold `session:state`.
 * @experimental
 */
export type StatsView = {
    status: 'not-granted';
    density: 'compact' | 'full';
} | {
    status: 'loading';
    density: 'compact' | 'full';
} | {
    status: 'failed';
    density: 'compact' | 'full';
} | {
    status: 'none-declared';
    density: 'compact' | 'full';
} | {
    status: 'no-members';
    density: 'compact' | 'full';
    members: 'scene' | 'all' | 'pick';
} | {
    status: 'shown';
    density: 'compact' | 'full';
    members: StatsMember[];
};
/** @experimental */
export declare function statsView(state: SessionStateV1 | undefined, settings: Record<string, unknown>, 
/** Does the widget hold `session:state` — `undefined` until the host says (`ctx.granted`). */
granted?: boolean): StatsView;
/**
 * Can a person write this slot? A derived slot is computed on every read and
 * has nothing to write; a retired one still resolves and takes nothing new.
 * @experimental
 */
export declare const slotWritable: (slot: SessionStateSlotV1) => boolean;
/**
 * An integer field's draft as a write: empty clears (`null`), a number is
 * truncated and held inside the bounds in force, anything else writes
 * nothing (`undefined`). A number field's bound value is a number, or null
 * when empty.
 * @experimental
 */
export declare function numberDraftValue(draft: unknown, config: BarBounds): number | null | undefined;
/**
 * A text field's draft as a write: blank clears (`null`); otherwise the text,
 * cut to the configuration's `maxLength` — the field cannot carry the limit
 * itself (a remote's `input` takes no `maxlength`).
 * @experimental
 */
export declare function textDraftValue(draft: unknown, config: {
    maxLength?: unknown;
}): string | null;
/** An enum slot's **enum values** — the bare stored values its configuration closes (not `EnumOption`s). @experimental */
export declare function enumValues(config: Record<string, unknown>): string[];
/**
 * A value as a person reads it, in the widget's language: the words
 * (`cleared`, `on`, `off`) through `t`, a number or a text as itself.
 * @experimental
 */
export declare function slotValueText(value: unknown, t: (source: string) => string): string;
//# sourceMappingURL=stateView.d.ts.map