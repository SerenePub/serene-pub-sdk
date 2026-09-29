/**
 * Attribute sheets — a named, ordered bundle of attribute slots.
 *
 * A slot says what one value is; a sheet says which values a thing has, and in
 * what order they are read. *Adventure* is `hp`, `stamina`, `mood`, `trust`,
 * `location`, `time-of-day`, `weather` — declared once, named by a genre,
 * attached to an owner, and the same seven in the same order everywhere they
 * appear. Owners hold sheets; the vocabulary of an owner is the union of the
 * genre's sheets and the sheets down its chain, deduped by id.
 *
 * ## Why this is a registry of its own, beside the slots
 *
 * The two answer different questions. `attributes.ts` answers *may this value
 * be stored?* and everything in it is about one value — bounds, options, what
 * the model reads. This answers *what does this thing have?* and carries
 * nothing about any one value beyond the three things naming it on a sheet
 * decides. Folded into one registry, a single `get` would return two kinds of
 * thing and a single `retire` would mean two different things to the rows
 * underneath. The id grammar, the reserved owners and the origin rule are
 * shared — imported from there, not restated here, so there is one answer to
 * "who may claim this namespace" rather than two that agree today.
 *
 * ## Order is the declaration
 *
 * `slots` is a list and not a set. It is the order a panel draws, the order a
 * state block renders to the model, and the order rules are evaluated in.
 * Re-ordering a sheet is therefore a change to behaviour, inside the hash like
 * any other, which is why the union a genre computes preserves the order rather
 * than sorting it.
 *
 * ⚠ **Not a layout sheet.** §26 uses *sheet* for what a side zone becomes below
 * `roomy`, and *More sheet* for the mobile overflow; those are places on a
 * screen. Prose says the qualified word — *attribute sheet* — exactly as it
 * does for an attribute slot, and the exported API says it too.
 *
 * ⚠ Never an *attachment* (that is a message part) and never a *template*
 * (taken three times over already).
 */
import type { I18n } from './descriptors.js';
import { type AttributeSlotDecl, type SlotAppliesTo, type SlotConfig, type SlotId, type SlotOrigin, type SlotValue } from './attributes.js';
/** `owner:sheet/name@N` — `core:sheet/adventure@1`, `acme.rp:sheet/tension@1`. @experimental */
export type SheetId = string;
/** @experimental */
export declare function assertSheetId(id: string): void;
/**
 * One slot on a sheet, and the three things naming it here decides.
 *
 * Nothing else about the slot is restated: a sheet never says again what a
 * value *is*, only what it is on this sheet. `config` is a **deviation** like
 * every other layer's — the keys it changes and no others — so a sheet that
 * raises a cap does not silently drop the options declared beside it.
 * @experimental
 */
export interface SheetSlotEntry {
    id: SlotId;
    /**
     * A session of a genre carrying this sheet must have a value. With a
     * `default` that is automatic; without one, creation refuses, and an
     * upgrade that adds `required` with no default warns on the session rather
     * than breaking it.
     */
    required?: boolean;
    /**
     * What it starts at, as this sheet's deviation from the declaration's own
     * default. Checked against the slot when the sheet is declared: a default
     * nothing may store is a session nobody can create, and finding that out at
     * creation time means finding it out once per person.
     */
    default?: SlotValue;
    /** This sheet's deviations from the declaration's config. */
    config?: SlotConfig;
    /**
     * 🚧 Which owners carry the slot **on this sheet** — a narrowing of the
     * declaration's own `appliesTo`, never a widening. Absent, every owner
     * the declaration names. It is how a premade stat that fits more than
     * one owner is put where a genre wants it: `location` on the world in
     * Adventure, on each cast member in a genre whose characters can be in
     * different places (owner ruling 2026-09-26).
     */
    appliesTo?: readonly SlotAppliesTo[];
}
/**
 * 🚧 The owners a sheet entry puts its slot on: the entry's own narrowing, or
 * the declaration's `appliesTo` when it states none. The one reader, so a host
 * and a widget cannot disagree about whether a character carries it.
 * @experimental
 */
export declare const sheetSlotAppliesTo: (entry: Pick<SheetSlotEntry, 'appliesTo'>, decl: Pick<AttributeSlotDecl, 'appliesTo'>) => readonly SlotAppliesTo[];
/** @experimental */
export interface AttributeSheetProps {
    /** The name a person reads. Display text: stripped from the content hash. */
    label: I18n;
    /** What the bundle is for, shown where it is offered. Display text: stripped. */
    description?: I18n;
    /** The slots it gathers, **in order** — see the file header on why order is content. */
    slots: readonly SheetSlotEntry[];
}
/** @experimental */
export interface AttributeSheetDecl extends AttributeSheetProps {
    readonly id: SheetId;
    /** Which source it came through — the same two, on the same terms, as a slot's. */
    readonly origin: SlotOrigin;
    /** `stored` only: the account the row belongs to. */
    readonly authorUserId?: number | string;
    /** Retired: offered nowhere new, kept everywhere it already is. `stored` only. */
    readonly retired?: boolean;
}
/**
 * Display text this registry carries outside `i18n`/`description`.
 *
 * `label` only, and for once there is no model-facing counterpart to keep out:
 * a sheet ships no prose to a prompt. What the model reads is each slot's own
 * `descriptor`, hashed in that slot's declaration where it belongs.
 * @experimental
 */
export declare const SHEET_DISPLAY_KEYS: {
    readonly display: readonly ['label'];
};
/**
 * Declare an attribute sheet in code.
 *
 * Written **below** the slots it gathers, and that is not a style note: the
 * slots have to be in the registry already, because a sheet naming one nothing
 * declares is a vocabulary that validates against nothing.
 * @experimental
 */
export declare function defineAttributeSheet(id: SheetId, props: AttributeSheetProps): AttributeSheetDecl;
/** The plugin-facing door — same registration, minus the ability to claim core's namespace. @experimental */
export declare function definePluginAttributeSheet(pluginId: string, id: SheetId, props: AttributeSheetProps): AttributeSheetDecl;
/** The person-facing door, on the same reserved-owner terms as `defineStoredAttributeSlot`. @experimental */
export declare function defineStoredAttributeSheet(id: SheetId, props: AttributeSheetProps, meta: {
    userId: number | string;
}): AttributeSheetDecl;
/** @experimental */
export declare const getAttributeSheet: (id: SheetId) => AttributeSheetDecl | undefined;
/** @experimental */
export declare const attributeSheets: () => AttributeSheetDecl[];
/** @experimental */
export declare function _clearAttributeSheets(): void;
/**
 * Withdraw a package's sheet declaration — the sheet half of
 * `_withdrawAttributeSlot`, on the same terms.
 * @internal
 */
export declare function _withdrawAttributeSheet(id: SheetId): boolean;
/**
 * Retire a stored sheet: offered nowhere new, kept everywhere it already is.
 *
 * `stored` only, for the reason a slot is — a code sheet arrives and leaves
 * with its package, and retiring one by hand would leave the registry saying
 * something the installed code contradicts on the next boot.
 * @experimental
 */
export declare function retireAttributeSheet(id: SheetId): AttributeSheetDecl;
/** The reverse of `retireAttributeSheet`, with the same `stored`-only rule. @experimental */
export declare function reviveAttributeSheet(id: SheetId): AttributeSheetDecl;
/**
 * The display-text findings of one sheet declaration (R-20): a sheet is
 * offered by its `label`, so the label is required; the `description` is what
 * a person reads under the offer. Run by the code door here and by the host's
 * **write** door for an authored sheet, never by a reload.
 * @experimental
 */
export declare function attributeSheetDisplayFindings(id: SheetId, props: AttributeSheetProps): string[];
//# sourceMappingURL=sheets.d.ts.map