/**
 * Core's entry types — the shapes a lorebook row can be.
 *
 * Serene Pub stored these in three near-identical tables with no discriminator
 * column anywhere: **the subtype was the table**. That is what these
 * declarations replace. What used to be a schema fact — world lore has a
 * category, history has a year — is a versioned type here, and the engine asks
 * the type rather than switching on which table a row came out of.
 *
 * Read three ways:
 *
 *  - **roles** are the questions the engine asks. *Which field is the title?
 *    Which is priority? What decides who may see this?* A ranker that asks
 *    `roles.priority` instead of reading `.priority` is a ranker a fourth shape
 *    does not have to be added to.
 *  - **fields** is the type-specific half of the row, in the one field
 *    language — the same declaration that renders a form, validates a write and
 *    projects a database constraint.
 *  - **facets** say where the type's rows compete for budget (`sourceKind`),
 *    where they render (`render`), and what they are called on the wire
 *    (`exportKey`).
 *
 * Core is the only author of entry types in this release. The switch is one
 * line in `describeEntryType` and it is off, because a plugin-owned type also
 * owns a database constraint and the rows under it, and that half is not built.
 */
/**
 * World lore — the agnostic shape, and the one a foreign lorebook lands in.
 *
 * No anchor: world lore is about the world, so there is nobody it could be
 * private from. That absence is the declaration doing its job — the visibility
 * policy is not "off" here, it is *not asked*.
 * @experimental
 */
export declare const worldLoreEntryType: import("@serene-pub/sdk").EntryDescriptor<"core:entry/world-lore@1">;
/**
 * Character lore — world lore plus the question of *whose knowledge this is*.
 *
 * The anchor is the whole difference. `core:policy/binding-visibility@1` is the
 * four branches this already has — the bound character may see it, personas in
 * the binding may see it, an unbound binding is the narrator's alone, and an
 * unanchored row is visible to nobody. Four branches is policy, and policy is
 * named, versioned and implemented by core; the type selects it and never
 * writes it, which is what keeps a declaration from being code.
 * @experimental
 */
export declare const characterLoreEntryType: import("@serene-pub/sdk").EntryDescriptor<"core:entry/character-lore@1">;
/**
 * History — dated entries recording earlier events.
 *
 * Two absences are the declaration, not an oversight:
 *
 *  - **no `priority`.** History has never had the column, and the semantic
 *    ranker excludes it from the priority boost for exactly that reason. Under
 *    one table every type has column-shaped access to everything, so the rule
 *    that used to be enforced by a missing column has to be enforced by a
 *    missing role — **absent means no bonus**, never "absent means 1 and gets
 *    the bonus".
 *  - **no `title`.** A history entry is not named; it is *dated*, and its
 *    heading is the date. That is what `order` carries.
 * @experimental
 */
export declare const historyEntryType: import("@serene-pub/sdk").EntryDescriptor<"core:entry/history@1">;
/**
 * A location — a place the story can be in, and can be walked out of (L3,
 * 2026-09-17).
 *
 * World lore's shape, because that is what a place is: agnostic, about the
 * world, private from nobody, competing in the `worldLore` band and rendered
 * by the world-lore variable's layout. What earns it a type of its own is not
 * a field — it is that a *place* is a thing other places are next to, and
 * "which rows are the map" is a question no reader could ask while a room was
 * just world lore with the word "room" somewhere in it.
 *
 * ## ⚠ There is no `exits` field, and there must not be
 *
 * A room's exits are **link rows** — `core:outlet/link-lore-entries@1`, the
 * same entry-ended edge the lorebook's own graph draws — and not a declared
 * field, for a reason that is structural rather than tasteful: `fields` is the
 * settings language, whose values land in a jsonb column and project into
 * CHECK constraints. It has no reference type. An `exits` field could only
 * ever hold *names*, with no foreign key, no cascade when the room it names is
 * deleted, and no second reader — which is precisely the parseable `Exits:`
 * line this type was declared to replace, moved one column over.
 *
 * So a location declares the world's fields and nothing else, and its shape
 * lives in the edges.
 *
 * ## No `exportKey`
 *
 * The wire names are `world`, `character` and `history`, and they are what
 * every lorebook Serene Pub has ever exported carries. A location declares
 * none: no marker is honest, where a marker no importer reads is a file that
 * round-trips into the wrong shape. A location exported today is read back as
 * world lore by any install, which is the correct degrade and the reason the
 * marker waits for an importer that knows the word.
 * @experimental
 */
export declare const locationEntryType: import("@serene-pub/sdk").EntryDescriptor<"core:entry/location@1">;
/**
 * 🚧 The three supplies an item can have (owner ruling 2026-09-25): one of it
 * in the world, a limited number, or as many as anybody likes.
 * @experimental
 */
export declare const ITEM_SUPPLY_MODES: readonly ["unique", "limited", "unlimited"];
/** @experimental */
export type ItemSupplyMode = (typeof ITEM_SUPPLY_MODES)[number];
/**
 * An item's supply, read: its mode and how many exist (`null` — no bound).
 * @experimental
 */
export interface ItemSupply {
    mode: ItemSupplyMode;
    limit: number | null;
}
/**
 * 🚧 An item — a thing in the world that somebody can hold (attributes phase
 * 3a, 2026-09-26).
 *
 * World lore's shape, like a place: agnostic, about the world, in the
 * `worldLore` band and rendered by the world-lore layout. What earns it a type
 * is its **supply** — how many of it the world has: `unique` (one), `limited`
 * (`supplyLimit` of them) or `unlimited`. The other half of the count is on
 * the holder: a list item that references this entry carries a **held count**
 * (`{ entryId, count }`, SDK `SlotLoreRef`), so "how many exist" and "how many
 * she carries" are two facts in two places (owner ruling: both).
 *
 * ⚠ **Core never enforces the supply.** A genre pipeline does, reading what
 * `core:query/item-supply@1` answers (remaining = limit − Σ held across the
 * session's owners). A host that refused a write over supply would be the
 * inventory feature the owner ruled out: inventory is an unopinionated list
 * a genre manages however it likes.
 *
 * No `exportKey`, on a place's reasoning: exported, an item reads back as
 * world lore anywhere that has not heard the word.
 * @experimental
 */
export declare const itemEntryType: import("@serene-pub/sdk").EntryDescriptor<"core:entry/item@1">;
/**
 * 🚧 An item entry's supply, read off its `fields` — the one reader, so a
 * pipeline, the host's supply query and a widget never disagree about it.
 *
 * `unique` is a limit of one. `limited` without a whole `supplyLimit` of at
 * least one is not a bound anybody could enforce, so it reads as unlimited
 * rather than as zero; so does a mode this build does not know.
 * @experimental
 */
export declare function itemSupplyOf(fields: Record<string, unknown> | null | undefined): ItemSupply;
/**
 * 🚧 How many of an item are left to hand out: its limit less what is held
 * across every owner, never below zero (over-held reads as none left, not as
 * debt). `null` for an unlimited supply. Pure — the pipeline decides what a
 * zero means.
 * @experimental
 */
export declare const remainingItemSupply: (supply: ItemSupply, held: number) => number | null;
/**
 * The five, in the order the tabs read.
 *
 * A list for the readers that want one; the *registration* happened when this
 * module loaded, which is the same fact-about-the-code route node types take.
 * @experimental
 */
export declare const CORE_ENTRY_TYPES: (import("@serene-pub/sdk").EntryDescriptor<"core:entry/character-lore@1"> | import("@serene-pub/sdk").EntryDescriptor<"core:entry/history@1"> | import("@serene-pub/sdk").EntryDescriptor<"core:entry/item@1"> | import("@serene-pub/sdk").EntryDescriptor<"core:entry/location@1"> | import("@serene-pub/sdk").EntryDescriptor<"core:entry/world-lore@1">)[];
//# sourceMappingURL=entries.d.ts.map