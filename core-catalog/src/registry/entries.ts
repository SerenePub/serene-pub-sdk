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

import { describeEntryType, STORY_TIME_PART_RANGES } from "@serene-pub/sdk"

/**
 * The keys every entry type answers with, spelled once.
 *
 * `keys`, `content`, `title`, `anchorEntryId` and the matcher set are **tier
 * one** — real columns, because they are what the engine reads for every type
 * without consulting a declaration. A role naming one of them is not
 * indirection for its own sake: it is the type saying *this column is the one
 * that plays that part for me*, which is the sentence a fourth shape needs to
 * be able to write.
 */
const KEYS = "keys"
const CONTENT = "content"
const TITLE = "title"

/**
 * The `parent` column: the entry this one is filed under (Part of), or none.
 *
 * A type that declares it may be filed; a type that does not is never filed
 * under anything, and the app asks this field role — never a type id — before
 * it files one (the editor's Part of, the re-parent, a dated re-parent, the
 * import). Every core type declares it except a place (places plan B2,
 * 2026-09-29) — places join other places by relationships instead — and a
 * history entry (owner, 2026-10-02): history is always top level relative to
 * other lore, scoped only by its line and its date.
 *
 * ⚠ Not how an amendment finds its base: amendments are their own table
 * (`entry_amendments`), keyed by the entry they amend.
 */
const PARENT = "anchorEntryId"

/**
 * What the model gets to see, and what it never does.
 *
 * `injected` is on `priority` per the design ruling, and it is worth naming the
 * consequence: today's assembly renders a lore block as title → content and
 * puts no priority anywhere, so honouring this flag is a change to what a
 * prompt contains. Nothing reads the flag yet; the parity gate at the assembly
 * collapse is where it meets the prompt, deliberately.
 */
const priorityField = {
	type: "integer",
	label: { en: "Priority" },
	description: {
		en: "A manual 1–3 boost. Higher wins ties against entries that scored the same."
	},
	min: 1,
	max: 3,
	default: 1,
	queryable: true,
	sortable: true,
	embedded: false,
	injected: true
} as const

/**
 * World lore — the agnostic shape, and the one a foreign lorebook lands in.
 *
 * No anchor: world lore is about the world, so there is nobody it could be
 * private from. That absence is the declaration doing its job — the visibility
 * policy is not "off" here, it is *not asked*.
 * @experimental
 */
export const worldLoreEntryType = describeEntryType({
	id: "core:entry/world-lore@1",
	i18n: {
		name: { en: "World lore" },
		description: {
			en: "Lorebook entries about the world — places, factions, events, things."
		}
	},
	roles: {
		title: TITLE,
		key: KEYS,
		priority: "priority",
		// Title first, then content — the order the vectorizer already
		// concatenates them in, stated rather than hardcoded.
		embedText: [TITLE, CONTENT],
		parent: PARENT
	},
	fields: {
		category: {
			type: "string",
			label: { en: "Category" },
			description: {
				en: "Free text. Used to group entries, and to screen non-people out of the narrative graph."
			},
			// Filtered on, never sorted by, and a bare word contributes nothing
			// to a cosine while diluting what does.
			queryable: true,
			sortable: false,
			embedded: false,
			injected: false
		},
		priority: priorityField
	},
	render: "core:var/world-lore@1",
	sourceKind: "worldLore",
	exportKey: "world",
	amendMode: "amend"
})

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
export const characterLoreEntryType = describeEntryType({
	id: "core:entry/character-lore@1",
	i18n: {
		name: { en: "Character lore" },
		description: {
			en: "Lorebook entries bound to a character — what they know, what is true of them."
		}
	},
	roles: {
		title: TITLE,
		key: KEYS,
		priority: "priority",
		anchor: {
			column: "anchorBindingId",
			policy: "core:policy/binding-visibility@1"
		},
		embedText: [TITLE, CONTENT],
		parent: PARENT
	},
	fields: {
		priority: priorityField
	},
	// Assemble's `characterLore`: the admitted rows, each with the cast member
	// it is bound to, placed by the context template like world lore.
	render: "core:var/character-lore@1",
	sourceKind: "characterLore",
	exportKey: "character",
	amendMode: "amend"
})

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
 *  - **no `parent`.** History is never filed under another entry (owner,
 *    2026-10-02): it is always top level relative to other lore, scoped by
 *    its line and its date. Other lore may still be filed under it, and its
 *    scenes hang off it by their own column.
 * @experimental
 */
export const historyEntryType = describeEntryType({
	id: "core:entry/history@1",
	i18n: {
		name: { en: "History entries" },
		description: {
			en: "Dated entries recording earlier events, ordered by when they happened."
		}
	},
	roles: {
		key: KEYS,
		/**
		 * Newest first, absent parts last — today's assembly sort, stated as
		 * data.
		 *
		 * Structured keys and not `"date:year,month,day"`: a string the engine
		 * parses is code the type ships with extra steps, and a parser is the
		 * thing that has to learn every new calendar. `position` is not here —
		 * it is a real column the engine reads for every type, and a type that
		 * declared it would be answering a question nobody asked.
		 */
		order: [
			{ field: "year", dir: "desc", nulls: "last" },
			{ field: "month", dir: "desc", nulls: "last" },
			{ field: "day", dir: "desc", nulls: "last" }
		],
		// Content alone — a history entry has no title to prepend, which is
		// what the vectorizer already does by having no name column to read.
		embedText: [CONTENT]
		// ⚠ No `parent`: history is never filed under anything (see above).
	},
	fields: {
		year: {
			type: "integer",
			label: { en: "Year" },
			description: { en: "The story year this happened in." },
			default: 1,
			required: true,
			queryable: true,
			sortable: true,
			embedded: false,
			// The date is the block's heading in the assembled prompt — the one
			// declared field here that the model actually reads.
			injected: true
		},
		// The range is the story-time rule itself, not a Gregorian one (A15):
		// a floor of 1 and no ceiling, because a book may count thirteen
		// months, or days of the year. This range becomes the database's
		// CHECK, so a copied 1–12 / 1–31 refused dates the book's calendar
		// allows. Whether a date fits THIS book's calendar is checked at entry
		// (`assertDateLands`), where the calendar is known.
		month: {
			type: "integer",
			label: { en: "Month" },
			description: { en: "Optional. Entries without one sort after those with." },
			...STORY_TIME_PART_RANGES.month,
			queryable: true,
			sortable: true,
			embedded: false,
			injected: true
		},
		day: {
			type: "integer",
			label: { en: "Day" },
			description: { en: "Optional, and only meaningful beside a month." },
			...STORY_TIME_PART_RANGES.day,
			// A day needs a month — the story-time rule, declared so the
			// projected CHECK holds it too.
			narrows: "month",
			queryable: true,
			sortable: true,
			embedded: false,
			injected: true
		},
		isCompleted: {
			type: "boolean",
			label: { en: "Completed" },
			description: {
				en: "The entry has been written up and is no longer being appended to."
			},
			default: false,
			// Read per row and written by the compile flow; nothing filters on
			// it in SQL, so nothing asks for an index it would not use.
			queryable: false,
			sortable: false,
			embedded: false,
			injected: false
		},
		graphed: {
			type: "boolean",
			label: { en: "Graphed" },
			description: {
				en: "The narrative graph has already taken this entry into account."
			},
			default: false,
			// This one *is* a predicate: the graph builder's work list is
			// "entries with content, no scenes, not yet graphed".
			queryable: true,
			sortable: false,
			embedded: false,
			injected: false
		}
	},
	render: "core:var/history@1",
	sourceKind: "history",
	exportKey: "history",
	amendMode: "amend"
})

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
 * ## Never filed under anything; its shape is its relationships
 *
 * A place declares **no `parent`** field role (places plan B2, owner ruling
 * 2026-09-29): it is never filed under another entry (Part of), because places
 * join by **relationships** — a door between two rooms, a road between two
 * towns, "is inside" / "holds" between a room and its tavern — each one row
 * with its own name and its wording from both ends. Containment is words, not
 * a tree: a place may be inside two things, and deleting one takes nothing
 * with it. A way big enough to stand in (a long road, a bridge with a toll
 * house on it) is a place of its own, joined to the places at its ends by two
 * relationships.
 *
 * ## ⚠ There is no `exits` field, and there must not be
 *
 * A room's ways out are **lore links** — `core:outlet/link-lore-entries@1`,
 * the same entry-ended relationship the lorebook's own graph draws — and not a
 * declared field, for a reason that is structural rather than tasteful:
 * `fields` is the settings language, whose values land in a jsonb column and
 * project into CHECK constraints. It has no reference type. An `exits` field
 * could only ever hold *names*, with no foreign key, no cascade when the room
 * it names is deleted, and no second reader — which is precisely the parseable
 * `Exits:` line this type was declared to replace, moved one column over.
 *
 * So a location declares the world's fields and nothing else, and its shape
 * lives in its relationships.
 *
 * ## `exportKey: "location"`
 *
 * A place travels as a place (lorebooks plan A26). Written as world lore, it
 * reads back as world lore, without the rooms listing, its stats or the
 * meaning of its links. An install that does not know the word reads it back
 * as world lore, which is still the correct degrade.
 * @experimental
 */
export const locationEntryType = describeEntryType({
	id: "core:entry/location@1",
	i18n: {
		// **Places**, not "Locations" (R1, 2026-09-17): the app already calls
		// the concept places everywhere a person reads it, and one word per
		// meaning is the rule. The id keeps `location` — a type id is not a
		// label, and renaming one is a migration.
		name: { en: "Places" },
		description: {
			en: "Places the story happens in — rooms, streets, halls — linked to the places they lead to."
		}
	},
	roles: {
		title: TITLE,
		key: KEYS,
		priority: "priority",
		// World lore's order, and for its reason: the vectorizer already
		// concatenates title then content.
		embedText: [TITLE, CONTENT]
		// ⚠ No `parent`: a place is never filed under anything (see above).
	},
	fields: {
		category: {
			type: "string",
			label: { en: "Category" },
			description: {
				en: "Free text. Used to group places — a floor, a district, a wing."
			},
			queryable: true,
			sortable: false,
			embedded: false,
			injected: false
		},
		priority: priorityField
	},
	render: "core:var/world-lore@1",
	// The band a place competes in. `worldLore` and not a sixth name: the
	// weight and share maps are total over the five, and a band nobody budgets
	// is candidates scored against `undefined` and dropped with a green suite.
	sourceKind: "worldLore",
	exportKey: "location",
	amendMode: "amend"
})

/**
 * 🚧 The three supplies an item can have (owner ruling 2026-09-25): one of it
 * in the world, a limited number, or as many as anybody likes.
 * @experimental
 */
export const ITEM_SUPPLY_MODES = ["unique", "limited", "unlimited"] as const

/** @experimental */
export type ItemSupplyMode = (typeof ITEM_SUPPLY_MODES)[number]

/**
 * An item's supply, read: its mode and how many exist (`null` — no bound).
 * @experimental
 */
export interface ItemSupply {
	mode: ItemSupplyMode
	limit: number | null
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
 * `exportKey: "item"`, on a place's reasoning: an item travels as an item,
 * supply and all, and reads back as world lore anywhere that has not heard
 * the word.
 * @experimental
 */
export const itemEntryType = describeEntryType({
	id: "core:entry/item@1",
	i18n: {
		name: { en: "Items" },
		description: {
			en: "Things in the world somebody can hold — a key, a sword, a letter — and how many of each exist."
		}
	},
	roles: {
		title: TITLE,
		key: KEYS,
		priority: "priority",
		embedText: [TITLE, CONTENT],
		parent: PARENT
	},
	fields: {
		category: {
			type: "string",
			label: { en: "Category" },
			description: {
				en: "Free text. Used to group items — weapons, keys, letters."
			},
			queryable: true,
			sortable: false,
			embedded: false,
			injected: false
		},
		priority: priorityField,
		supply: {
			type: "enum",
			of: ITEM_SUPPLY_MODES,
			label: { en: "Supply" },
			description: {
				en: "How many of it the world has: one, a limited number, or as many as anybody likes."
			},
			default: "unlimited",
			// A genre asks "which items are unique"; nobody sorts by it, and a
			// word contributes nothing to a cosine.
			queryable: true,
			sortable: false,
			embedded: false,
			injected: false
		},
		supplyLimit: {
			type: "integer",
			label: { en: "How many exist" },
			description: {
				en: "For a limited supply: how many of it the world has. Ignored otherwise."
			},
			min: 1,
			queryable: false,
			sortable: false,
			embedded: false,
			injected: false
		}
	},
	render: "core:var/world-lore@1",
	sourceKind: "worldLore",
	exportKey: "item",
	amendMode: "amend"
})

/**
 * 🚧 An item entry's supply, read off its `fields` — the one reader, so a
 * pipeline, the host's supply query and a widget never disagree about it.
 *
 * `unique` is a limit of one. `limited` without a whole `supplyLimit` of at
 * least one is not a bound anybody could enforce, so it reads as unlimited
 * rather than as zero; so does a mode this build does not know.
 * @experimental
 */
export function itemSupplyOf(fields: Record<string, unknown> | null | undefined): ItemSupply {
	const mode = fields?.supply
	if (mode === "unique") return { mode: "unique", limit: 1 }
	const limit = fields?.supplyLimit
	if (mode === "limited" && typeof limit === "number" && Number.isInteger(limit) && limit >= 1)
		return { mode: "limited", limit }
	return { mode: "unlimited", limit: null }
}

/**
 * 🚧 How many of an item are left to hand out: its limit less what is held
 * across every owner, never below zero (over-held reads as none left, not as
 * debt). `null` for an unlimited supply. Pure — the pipeline decides what a
 * zero means.
 * @experimental
 */
export const remainingItemSupply = (supply: ItemSupply, held: number): number | null =>
	supply.limit === null ? null : Math.max(0, supply.limit - held)

/**
 * The five, in the order the tabs read.
 *
 * A list for the readers that want one; the *registration* happened when this
 * module loaded, which is the same fact-about-the-code route node types take.
 * @experimental
 */
export const CORE_ENTRY_TYPES = [
	worldLoreEntryType,
	characterLoreEntryType,
	historyEntryType,
	locationEntryType,
	itemEntryType
]
