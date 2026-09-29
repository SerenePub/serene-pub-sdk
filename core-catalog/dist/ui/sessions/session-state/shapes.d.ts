/**
 * Drawing and editing a stat by its SHAPE (phase 2 of the attributes plan):
 * what kind of control a slot gets, and the pure arithmetic behind each —
 * a list's add, remove and reorder, a story time's draft. Shared by core's
 * World State and Stats (through `SlotControl`) and by the scene portraits'
 * bars, so every surface reads one answer to "what is this value".
 *
 * The kind comes from the slot's field (`SessionStateSlotV1.field`), and from
 * its `type` when a host predates shapes — never from the value, because an
 * empty list and a blank line look the same and must not be drawn the same.
 */
import { type FieldDecl, type SessionStateSlotV1, type SlotListItem, type SlotLoreRef, type StatShapeKind, type StoryCalendar } from '@serene-pub/sdk';
import { type BarBounds } from './barMath.js';
/** What a slot is drawn as: a stat shape's kind, or `derived` — computed, never edited. @experimental */
export type SlotKind = StatShapeKind | 'derived';
/** The field a slot's value is declared as: the host's, or its type's. @experimental */
export declare const slotFieldOf: (slot: Pick<SessionStateSlotV1, 'type' | 'field'>) => FieldDecl | undefined;
/**
 * The kind of control a slot gets. A field core cannot keep as a stat (a
 * host newer than this build) is drawn as a line of text — shown, never
 * refused.
 * @experimental
 */
export declare function slotKind(slot: Pick<SessionStateSlotV1, 'type' | 'field'>): SlotKind;
/** Is a number slot whole — `integer`, the catalogue's — or does it take fractions? @experimental */
export declare const slotIsWhole: (slot: Pick<SessionStateSlotV1, 'type' | 'field'>) => boolean;
/**
 * A number field's draft as a write: empty clears (`null`), a number is held
 * inside the bounds in force — truncated first when the slot is whole —
 * anything else writes nothing (`undefined`).
 * @experimental
 */
export declare function numberDraftFor(draft: unknown, config: BarBounds, whole: boolean): number | null | undefined;
/** A list slot's items, whatever was stored: a list, or nothing. @experimental */
export declare function listItemsOf(value: unknown): SlotListItem[];
/** One item as a person reads it: a word as itself, a lore entry by its title. @experimental */
export declare function listItemText(item: SlotListItem, t?: (source: string) => string): string;
/** A stable key for an item in a keyed `#each` — its position AND identity, since a list may repeat. @experimental */
export declare const listItemKeyOf: (item: SlotListItem, index: number) => string;
/** What a list edit writes: the new list, or why it was not made. @experimental */
export interface ListEdit {
    /** The whole list to write, as stored (lore references down to their ids). */
    value: SlotListItem[];
    /** Why nothing is written; `null` when the edit stands. */
    refusal: string | null;
}
/**
 * The list with one typed item added at the end — through the SDK's own
 * list op, so `unique` and `maxItems` refuse here exactly as the write gate
 * would. A blank line adds nothing (`value` is `null` then — nothing to write).
 * @experimental
 */
export declare function listWithAdded(value: unknown, text: string, config: Record<string, unknown>): ListEdit | null;
/** The list without the item at `index`. @experimental */
export declare function listWithout(value: unknown, index: number): SlotListItem[];
/** The list with the item at `index` moved one place up (`-1`) or down (`1`); unchanged at an end. @experimental */
export declare function listMoved(value: unknown, index: number, by: -1 | 1): SlotListItem[];
/**
 * 🚧 The item entry type's bare id — what a `session-entries` row's `typeId`
 * says (the version is a column of its own). Stated here because this module
 * loads without the catalogue; `itemsPicker.test.ts` holds it to
 * `itemEntryType.id`.
 * @experimental
 */
export declare const ITEM_ENTRY_TYPE_ID = "core:entry/item";
/**
 * Whether a list takes lore references at all: one closed over words (`of`)
 * holds only those words, so it is offered no picker.
 * @experimental
 */
export declare const slotTakesLoreRefs: (config: Record<string, unknown>) => boolean;
/** 🚧 One entry a list's picker offers. @experimental */
export interface PickableEntry {
    entryId: number;
    title: string;
    typeId: string;
    /** An item entry (`core:entry/item`) — offered first. */
    item: boolean;
    /** How many of it this list already holds; 0 when none. */
    held: number;
}
/** A list item's lore reference, or null for a word — what a held item's steppers key on. @experimental */
export declare const listItemRef: (item: SlotListItem) => SlotLoreRef | null;
/**
 * The picker's offer: item entries first, then the rest of the book, each
 * entry once and in the order its page answered. `held` is read off the list
 * being edited, so the picker can say "held ×2" beside a thing already in it.
 * @experimental
 */
export declare function pickableEntries(value: unknown, pages: ReadonlyArray<ReadonlyArray<{
    id: number;
    typeId: string;
    title: string;
}>>): PickableEntry[];
/**
 * A count field's draft as a count: a whole number of at least 1, or
 * `undefined` for anything else (the editor says why and writes nothing).
 * @experimental
 */
export declare function countDraftFor(draft: unknown): number | undefined;
/**
 * The list with `count` of one lore entry added — summed onto what is held
 * (an uncounted holding is one), or a new reference at the end — through the
 * SDK's own list op, so `maxItems` refuses here exactly as the write gate
 * would. A count of one is stored bare (`{ entryId }`), since absent is one.
 * @experimental
 */
export declare function listWithRefAdded(value: unknown, entryId: number, count: number, config: Record<string, unknown>): ListEdit;
/**
 * The list with one more (`1`) or one fewer (`-1`) of a referenced entry; one
 * fewer than one takes the reference out.
 * @experimental
 */
export declare function listWithRefStep(value: unknown, entryId: number, by: 1 | -1): SlotListItem[];
/** A story time's editor fields, as the text each input holds. @experimental */
export interface StoryTimeDraft {
    year: string;
    month: string;
    day: string;
    /** `hh:mm`, or blank for a date with no time of day. */
    time: string;
}
/** The fields a stored story time opens with; blanks for one not set. @experimental */
export declare function storyTimeDraftOf(value: unknown): StoryTimeDraft;
/**
 * The editor's fields as a write: a blank year clears (`null`); fields that
 * spell a story time write its canonical line; anything else — a day with no
 * month, a month of 13 is fine (free-form), a time of `25:00` is not —
 * writes nothing (`undefined`) and the editor says why.
 * @experimental
 */
export declare function storyTimeDraftValue(draft: StoryTimeDraft): string | null | undefined;
/**
 * A slot's value as a person reads it, by its kind: a story time through the
 * book's calendar (free-form when none is given), a list as its items, everything else as `slotValueText` says.
 * @experimental
 */
export declare function shownValueText(slot: Pick<SessionStateSlotV1, 'type' | 'field'>, value: unknown, t: (source: string) => string, 
/** The book's declared calendar; absent or `null` spells free-form. */
calendar?: StoryCalendar | null): string;
//# sourceMappingURL=shapes.d.ts.map