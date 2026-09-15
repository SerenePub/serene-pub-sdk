/**
 * Core's entry types — the three shapes a lorebook row can be.
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
 */
export declare const historyEntryType: import("@serene-pub/sdk").EntryDescriptor<"core:entry/history@1">;
/**
 * The three, in the order the tabs read.
 *
 * A list for the readers that want one; the *registration* happened when this
 * module loaded, which is the same fact-about-the-code route node types take.
 */
export declare const CORE_ENTRY_TYPES: (import("@serene-pub/sdk").EntryDescriptor<"core:entry/character-lore@1"> | import("@serene-pub/sdk").EntryDescriptor<"core:entry/history@1"> | import("@serene-pub/sdk").EntryDescriptor<"core:entry/world-lore@1">)[];
//# sourceMappingURL=entries.d.ts.map