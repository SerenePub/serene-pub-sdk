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
import { applyListOp, fieldForSlotType, heldCountIn, formatStoryTime, isSlotLoreRef, slotLoreRefCount, parseStoryTime, slotValueForStorage, statShapeKindOf, storyTimeText, } from '@serene-pub/sdk';
import { clampToBounds, formatSlotValue } from './barMath.js';
/** The field a slot's value is declared as: the host's, or its type's. @experimental */
export const slotFieldOf = (slot) => slot.type === 'derived' ? undefined : (slot.field ?? fieldForSlotType(slot.type));
/**
 * The kind of control a slot gets. A field core cannot keep as a stat (a
 * host newer than this build) is drawn as a line of text — shown, never
 * refused.
 * @experimental
 */
export function slotKind(slot) {
    if (slot.type === 'derived')
        return 'derived';
    return statShapeKindOf(slotFieldOf(slot)) ?? 'text';
}
/** Is a number slot whole — `integer`, the catalogue's — or does it take fractions? @experimental */
export const slotIsWhole = (slot) => slotFieldOf(slot)?.type !== 'number';
/**
 * A number field's draft as a write: empty clears (`null`), a number is held
 * inside the bounds in force — truncated first when the slot is whole —
 * anything else writes nothing (`undefined`).
 * @experimental
 */
export function numberDraftFor(draft, config, whole) {
    if (draft === null || draft === undefined || (typeof draft === 'string' && draft.trim() === ''))
        return null;
    const n = Number(draft);
    if (!Number.isFinite(n))
        return undefined;
    return clampToBounds(whole ? Math.trunc(n) : n, config);
}
// ─── Lists ──────────────────────────────────────────────────────────────────
/** A list slot's items, whatever was stored: a list, or nothing. @experimental */
export function listItemsOf(value) {
    if (Array.isArray(value))
        return value;
    if (value === undefined || value === null)
        return [];
    return [value];
}
/** One item as a person reads it: a word as itself, a lore entry by its title. @experimental */
export function listItemText(item, t = (s) => s) {
    if (isSlotLoreRef(item)) {
        const title = item.name?.trim() || t('Lore entry {id}').replace('{id}', String(item.entryId));
        const count = slotLoreRefCount(item);
        return count > 1 ? `${title} ×${count}` : title;
    }
    return formatSlotValue(item);
}
/** A stable key for an item in a keyed `#each` — its position AND identity, since a list may repeat. @experimental */
export const listItemKeyOf = (item, index) => `${index}:${isSlotLoreRef(item) ? `entry:${item.entryId}` : String(item)}`;
const stored = (items) => slotValueForStorage(items);
/**
 * The list with one typed item added at the end — through the SDK's own
 * list op, so `unique` and `maxItems` refuse here exactly as the write gate
 * would. A blank line adds nothing (`value` is `null` then — nothing to write).
 * @experimental
 */
export function listWithAdded(value, text, config) {
    const item = text.trim();
    if (!item)
        return null;
    const maxLength = config.maxLength;
    const cut = typeof maxLength === 'number' && Number.isInteger(maxLength) && maxLength >= 0 ? item.slice(0, maxLength) : item;
    const held = listItemsOf(value);
    const result = applyListOp(held, 'add', [cut], config);
    return { value: stored(result.value), refusal: result.refusal };
}
/** The list without the item at `index`. @experimental */
export function listWithout(value, index) {
    return stored(listItemsOf(value).filter((_, i) => i !== index));
}
/** The list with the item at `index` moved one place up (`-1`) or down (`1`); unchanged at an end. @experimental */
export function listMoved(value, index, by) {
    const items = [...listItemsOf(value)];
    const to = index + by;
    if (index < 0 || index >= items.length || to < 0 || to >= items.length)
        return stored(items);
    const [item] = items.splice(index, 1);
    items.splice(to, 0, item);
    return stored(items);
}
// ─── Lore references: picking an entry, and how many ────────────────────────
/**
 * 🚧 The item entry type's bare id — what a `session-entries` row's `typeId`
 * says (the version is a column of its own). Stated here because this module
 * loads without the catalogue; `itemsPicker.test.ts` holds it to
 * `itemEntryType.id`.
 * @experimental
 */
export const ITEM_ENTRY_TYPE_ID = 'core:entry/item';
/**
 * Whether a list takes lore references at all: one closed over words (`of`)
 * holds only those words, so it is offered no picker.
 * @experimental
 */
export const slotTakesLoreRefs = (config) => config.of === undefined;
/** A list item's lore reference, or null for a word — what a held item's steppers key on. @experimental */
export const listItemRef = (item) => (isSlotLoreRef(item) ? item : null);
/**
 * The picker's offer: item entries first, then the rest of the book, each
 * entry once and in the order its page answered. `held` is read off the list
 * being edited, so the picker can say "held ×2" beside a thing already in it.
 * @experimental
 */
export function pickableEntries(value, pages) {
    const seen = new Set();
    const out = [];
    for (const rows of pages)
        for (const row of rows) {
            if (seen.has(row.id))
                continue;
            seen.add(row.id);
            out.push({
                entryId: row.id,
                title: row.title?.trim() || `#${row.id}`,
                typeId: row.typeId,
                item: row.typeId === ITEM_ENTRY_TYPE_ID,
                held: heldCountIn(listItemsOf(value), row.id),
            });
        }
    return [...out.filter((e) => e.item), ...out.filter((e) => !e.item)];
}
/**
 * A count field's draft as a count: a whole number of at least 1, or
 * `undefined` for anything else (the editor says why and writes nothing).
 * @experimental
 */
export function countDraftFor(draft) {
    if (draft === null || draft === undefined || (typeof draft === 'string' && draft.trim() === ''))
        return undefined;
    const n = Number(draft);
    return Number.isInteger(n) && n >= 1 ? n : undefined;
}
/**
 * The list with `count` of one lore entry added — summed onto what is held
 * (an uncounted holding is one), or a new reference at the end — through the
 * SDK's own list op, so `maxItems` refuses here exactly as the write gate
 * would. A count of one is stored bare (`{ entryId }`), since absent is one.
 * @experimental
 */
export function listWithRefAdded(value, entryId, count, config) {
    const result = applyListOp(listItemsOf(value), 'add', [{ entryId, count }], config);
    return { value: stored(bareOnes(result.value)), refusal: result.refusal };
}
/**
 * The list with one more (`1`) or one fewer (`-1`) of a referenced entry; one
 * fewer than one takes the reference out.
 * @experimental
 */
export function listWithRefStep(value, entryId, by) {
    const op = by > 0 ? 'add' : 'remove';
    return stored(bareOnes(applyListOp(listItemsOf(value), op, [{ entryId, count: 1 }]).value));
}
/** A reference holding one is written without a count — absent is one. */
const bareOnes = (items) => items.map((item) => isSlotLoreRef(item) && item.count === 1
    ? item.name === undefined
        ? { entryId: item.entryId }
        : { entryId: item.entryId, name: item.name }
    : item);
/** The fields a stored story time opens with; blanks for one not set. @experimental */
export function storyTimeDraftOf(value) {
    const time = parseStoryTime(value);
    if (!time)
        return { year: '', month: '', day: '', time: '' };
    const pad = (n) => String(n).padStart(2, '0');
    return {
        year: String(time.year),
        month: time.month ? String(time.month) : '',
        day: time.day ? String(time.day) : '',
        time: typeof time.hour === 'number' ? `${pad(time.hour)}:${pad(time.minute ?? 0)}` : '',
    };
}
/**
 * The editor's fields as a write: a blank year clears (`null`); fields that
 * spell a story time write its canonical line; anything else — a day with no
 * month, a month of 13 is fine (free-form), a time of `25:00` is not —
 * writes nothing (`undefined`) and the editor says why.
 * @experimental
 */
export function storyTimeDraftValue(draft) {
    const field = (v) => (v === null || v === undefined ? '' : String(v).trim());
    const year = field(draft.year);
    const month = field(draft.month);
    const day = field(draft.day);
    const clock = field(draft.time);
    if (!year)
        return null;
    if (day && !month)
        return undefined;
    let line = year;
    if (month)
        line += `-${month}`;
    if (day)
        line += `-${day}`;
    if (clock)
        line += ` ${clock}`;
    const time = parseStoryTime(line);
    return time ? storyTimeText(time) : undefined;
}
/**
 * A slot's value as a person reads it, by its kind: a story time through the
 * book's calendar (free-form when none is given), a list as its items, everything else as `slotValueText` says.
 * @experimental
 */
export function shownValueText(slot, value, t, 
/** The book's declared calendar; absent or `null` spells free-form. */
calendar) {
    if (value === undefined)
        return '';
    if (value === null || typeof value === 'boolean')
        return t(formatSlotValue(value));
    const kind = slotKind(slot);
    if (kind === 'story-time') {
        const time = parseStoryTime(value);
        return time ? formatStoryTime(time, calendar) : formatSlotValue(value);
    }
    if (kind === 'list' || Array.isArray(value))
        return listItemsOf(value).map((i) => listItemText(i, t)).join(', ');
    return formatSlotValue(value);
}
//# sourceMappingURL=shapes.js.map