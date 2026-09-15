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

import { describeEntryType } from "@serene-pub/sdk"

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
 * The `parent` column, shared by all three.
 *
 * Declared even though nothing hangs off it yet: an amendment is an entry whose
 * parent is the base entry, and the alternative to declaring it now is
 * declaring it later — which, since the shape is hashed, costs `@2` on all
 * three types to state a column that already exists.
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
	i18n: { en: "Priority" },
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
			i18n: { en: "Category" },
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
	// Not a variable of its own: qualifying entries are folded into their bound
	// character's object under an "extra lore" key, which is why declaring a
	// layout for `characterLore` would offer a setting that changes nothing.
	render: { into: "character-card" },
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
		embedText: [CONTENT],
		parent: PARENT
	},
	fields: {
		year: {
			type: "integer",
			i18n: { en: "Year" },
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
		month: {
			type: "integer",
			i18n: { en: "Month" },
			description: { en: "Optional. Entries without one sort after those with." },
			min: 1,
			max: 12,
			queryable: true,
			sortable: true,
			embedded: false,
			injected: true
		},
		day: {
			type: "integer",
			i18n: { en: "Day" },
			description: { en: "Optional, and only meaningful beside a month." },
			min: 1,
			max: 31,
			queryable: true,
			sortable: true,
			embedded: false,
			injected: true
		},
		isCompleted: {
			type: "boolean",
			i18n: { en: "Completed" },
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
			i18n: { en: "Graphed" },
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
 * The three, in the order the tabs read.
 *
 * A list for the readers that want one; the *registration* happened when this
 * module loaded, which is the same fact-about-the-code route node types take.
 */
export const CORE_ENTRY_TYPES = [
	worldLoreEntryType,
	characterLoreEntryType,
	historyEntryType
]
