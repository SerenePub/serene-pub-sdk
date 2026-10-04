/**
 * Attribute slots — the declared vocabulary behind stats and states.
 *
 * ## Three levels, and only the middle one is new here
 *
 * A stat is three things, not one (entries plan Part 3): a **declaration**
 * ("Health is an integer with a max, and it attaches to cast members"), a
 * **configuration** ("this character's Health caps at 20"), and a **value**
 * ("health = 12, as of message 47"). This file owns the first. The other two
 * are rows in the host's `attribute_configs` and `attribute_values`, keyed by
 * the id declared here.
 *
 * ## Core owns the types; nobody owns them but core
 *
 * `SlotType` is a **closed set of six**, and it is closed because each member
 * is logic core implements: a bounded integer is a bar, an enum is a chip, a
 * list is a chip row, a derived slot is never written at all. Genres, plugins
 * and admins compose *definitions* from those types — `hp`, `gold`, `weather`,
 * `mood` — the same way a genre composes a session shape from declared fields.
 * A composed definition cannot introduce behaviour core does not already
 * understand, which is why authorship can be open here where it is not for the
 * types.
 *
 * ## One registry, two sources
 *
 * Node types project into `pipeline_definition_registry` rows because a *spec* has to
 * be able to reference one that this build does not declare. A slot has no such
 * consumer: every read of one goes through this registry in-process, and every
 * write is validated against it at write time.
 *
 * People author slots too, and theirs live in the host's
 * `attribute_declarations` table — but that table is a **source**, never a
 * second answer. The host loads every stored row into *this* registry, at boot
 * and again on every write (`defineStoredAttributeSlot`), and validation
 * consults nothing else: `getAttributeSlot` stays the only door, and `origin`
 * says which source an entry came through. A table a validator read directly
 * would be a second answer to "what is Health" that nothing reconciles, and the
 * two would drift the first time a row was written without this registry
 * hearing about it.
 *
 * A card or lorebook naming a slot this install lacks keeps its values as
 * opaque data — shown, not validated — which is the standing "never refuse,
 * fall back and say so" rule for a stale binding.
 *
 * ## The catch: two kinds of prose
 *
 * `label` and `description` are what a person reads, so they are stripped from
 * the content hash and copyediting one is free. **`descriptor` is what the
 * model reads**, so editing it changes every prompt the slot appears in — it is
 * contract, it is inside the hash, and changing it means `@N+1`. Conflating
 * the two would ship prompt-changing edits silently.
 *
 * `derive`, `rules` and `scripts` sit inside the hash beside `descriptor`, for
 * a plainer reason still: they are what the number *does* to itself, and that
 * is never a copyedit. `examples` are stripped along with the display text and
 * the reason is the inverse — an example is the *test* of a declaration rather
 * than part of it, and writing one down must not force an `@N+1` on everything
 * already storing values under the id.
 *
 * ⚠ **"Slot" here is not a pipeline slot.** NOMENCLATURE §"slot" is a declared
 * parameter address on a node type (`SlotDecl` in descriptors.ts). This is an
 * *attribute* slot, and prose says the qualified word. The two never meet: one
 * is a key on a descriptor, the other is an id in this registry.
 *
 * The exported API says the qualified word too — `defineAttributeSlot`,
 * `getAttributeSlot`, `attributeSlots` — because the unqualified names sat one
 * import line away from the pipeline `slot()` address helper, and a name that
 * reads correctly only if you know which module it came from is a name that
 * will be imported wrong. The *types* keep the short names (`SlotId`,
 * `SlotConfig`, `SlotValue`): they are only ever written next to this file's
 * functions, so they cannot be mistaken at a call site.
 */

import type { I18n } from './descriptors.js'
import { i18nFindings } from './i18n.js'
import { refuseUnlessIdentical } from './hash.js'
import type { FieldDecl } from './settings.js'
import { getStatShape, statShapeKindOf, type StatShapeId, type StatShapeKind } from './statShapes.js'
import { parseStoryTime } from './storyTime.js'

// ── Ids ─────────────────────────────────────────────────────────────────────

/** `owner:slot/name@N` — `core:slot/hp@1`, `acme.rp:slot/tension@1`. @experimental */
export type SlotId = string

const SLOT_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:slot\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** @experimental */
export function assertSlotId(id: string): void {
	if (!SLOT_ID.test(id))
		throw new Error(
			`'${id}' is not a valid attribute slot id. Use 'owner:slot/name@N' — ` +
				`'core:slot/hp@1', 'acme.rp:slot/tension@1'. The id is what a stored value ` +
				`is filed under for the life of the card that carries it; the display name ` +
				`lives in the declaration.`,
		)
}

/**
 * The parts of an attribute id, for the callers that need one of them.
 *
 * One regex for `slot` and `sheet` alike, because a sheet is addressed on the
 * same grammar as the slots it names (`sheets.ts`) and the owner segment is
 * what reservation is checked against for both. Two parsers would be two
 * chances to disagree about what `acme.rp` is.
 */
const ATTRIBUTE_ID =
	/^([a-z0-9]+(?:[.-][a-z0-9]+)*):(slot|sheet)\/([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/

/**
 * An id that is not an address answers with an empty owner and slug rather
 * than throwing. These three are read on display paths over *stored* rows —
 * a value filed under an id from a build that is not this one — where a stale
 * id has to render, not crash.
 */
const parts = (id: string): RegExpExecArray | null => ATTRIBUTE_ID.exec(id)

/** Who declared it: `core`, a plugin's id, or the username frozen in at authoring. @internal */
export const slotOwner = (id: string): string => parts(id)?.[1] ?? ''

/** The slug — the data key a value is filed under for the life of the card carrying it. @experimental */
export const slotSlug = (id: string): string => parts(id)?.[3] ?? ''

/** The major. `@N+1` is a different slot, not an edit to this one. @experimental */
export const slotVersion = (id: string): number => Number(parts(id)?.[4] ?? 0)

// ── Reserved owners ─────────────────────────────────────────────────────────

/**
 * Owner segments a person may not author under.
 *
 * `core` always, plus every installed plugin id — which is why this is a
 * mutable registry and not a constant. The SDK cannot know what is installed;
 * the host can, and calls `reserveAttributeOwner` as it installs. Reserving is
 * what stops somebody whose username happens to match a plugin's namespace
 * from authoring a slot that the next install silently redefines underneath
 * their stored values.
 *
 * Deliberately no grammar check on the segment. A plugin id is not always a
 * legal owner segment (`acme/rp` has a slash the id grammar forbids), and a
 * host reserving what it has installed must not have to filter the list first:
 * a reservation that can never match an id is harmless, while refusing one
 * would make the obvious loop the wrong thing to write.
 */
const reservedOwners = new Set<string>(['core'])

/** @internal */
export function reserveAttributeOwner(segment: string): void {
	if (!segment?.trim())
		throw new Error(
			`reserveAttributeOwner() was given an empty segment. Reserving nothing quietly ` +
				`succeeds, and the first user slug to collide with a plugin is the bug report.`,
		)
	reservedOwners.add(segment)
}

/** @internal */
export const isReservedAttributeOwner = (segment: string): boolean => reservedOwners.has(segment)

/** Back to `core` alone — for tests, and for a host tearing an install down. @internal */
export function _clearReservedAttributeOwners(): void {
	reservedOwners.clear()
	reservedOwners.add('core')
}

// ── The closed set of types ─────────────────────────────────────────────────

/**
 * What a slot's value *is*. Six, and no more without a core release.
 *
 *  - `integer` — a bounded number. `min`/`max` in the config make it a bar.
 *  - `enum` — one of a declared set. A chip.
 *  - `text` — a line of prose nobody computes with.
 *  - `boolean` — on or off.
 *  - `list` — several of something: a chip row. Its items come from `config.of`
 *    when there is one and are free text when there is not, which makes it the
 *    one type that is two shapes. The sixth, and added because an inventory, a
 *    set of conditions and a list of known facts were each being spelled as
 *    comma-separated `text` — a spelling no bar, no chip and no rule can read,
 *    and one nobody can add a single item to without rewriting the line.
 *  - `derived` — computed from other facts and a clock, and therefore **never
 *    stored**. Storing a derived value guarantees staleness, which is why
 *    derived-vs-stored is a property of the declaration rather than a habit.
 * @experimental
 */
export type SlotType = 'integer' | 'enum' | 'text' | 'boolean' | 'list' | 'derived'

/**
 * Which owners a slot may attach to: a cast member, the world, a location
 * (🚧 attributes phase 4 — a `core:entry/location` lore entry holding state
 * of its own: what is lying in the place, how it stands), or several.
 * @experimental
 */
export type SlotAppliesTo = 'cast' | 'world' | 'location'

/**
 * The computations a `derived` slot may name. Closed and core-owned for the
 * same reason `SlotType` is: each one is code core runs.
 *
 * The SDK declares the *name* and what it needs; the host implements the
 * arithmetic, because the inputs (the session's story date) are the host's.
 * @experimental
 */
export interface DerivationDecl {
	id: string
	/** The slot whose value this derivation reads, named in the slot's config as `from`. */
	requiresFrom: boolean
	description: string
}

/** @experimental */
export const derivations = Object.freeze({
	/**
	 * How old someone is: a `birthdate` value on the same owner, against the
	 * session's story date. Absent — not zero — when either is missing, which
	 * is the whole reason age is derived and not typed in.
	 */
	age: Object.freeze({
		id: 'core:derive/age@1',
		requiresFrom: true,
		description: "A birthdate slot on the same owner, read against the session's story date.",
	}),
	/**
	 * A LiquidJS expression written on the declaration itself (`derive`),
	 * evaluated over the state pinned at run start.
	 *
	 * It earns an id even though the *text* is the author's, because a derived
	 * slot always names the computation behind it: a receipt says which one
	 * produced a number, and "an expression" is an answer only if it is one
	 * declared thing rather than a hole in the set. What the author supplies is
	 * the expression; the evaluator is still core's.
	 *
	 * `requiresFrom: false` — the expression names whatever it reads, which is
	 * exactly the reason it is not `age`.
	 */
	liquid: Object.freeze({
		id: 'core:derive/liquid@1',
		requiresFrom: false,
		description:
			'A LiquidJS expression on the declaration, evaluated over the state pinned at run start.',
	}),
} as const) satisfies Readonly<Record<string, DerivationDecl>>

/** @experimental */
export type DerivationId = (typeof derivations)[keyof typeof derivations]['id']

/** @experimental */
export const getDerivation = (id: string): DerivationDecl | undefined =>
	Object.values(derivations).find((d) => d.id === id)

// ── Configuration ───────────────────────────────────────────────────────────

/**
 * What attaching a slot decides.
 *
 * One open shape rather than a union per type, because it is stored as JSON and
 * read back by code that has the declaration in hand: `checkSlotConfig` is what
 * says which keys mean anything for which type, and it says so in one place
 * instead of in a type the database cannot enforce anyway.
 *
 * Every layer stores **deviations only** — a card, a lorebook and a session each
 * hold the keys they change and nothing else, so raising a genre's default cap
 * reaches every owner who never overrode it.
 * @experimental
 */
export interface SlotConfig {
	/** `integer`: the floor and the ceiling. A bar needs both to be drawn as one. */
	min?: number
	max?: number
	/** `enum`: the values this owner may take. */
	of?: readonly string[]
	/** `text`: how long a line may be. `list`: how long each free-text item may be. */
	maxLength?: number
	/**
	 * `list`: the ceiling on how many items it holds. A refusal and never a
	 * trim (`applyListOp`) — silently dropping the sword somebody just picked
	 * up is how an inventory starts lying about itself.
	 */
	maxItems?: number
	/**
	 * `list`: whether the same item twice is two items. **True unless stated**,
	 * because the common case is a set — conditions, known facts, keys on a
	 * ring — where a repeat is a bug in whatever wrote it. Say `false` for the
	 * case where it is not one (three rations).
	 */
	unique?: boolean
	/**
	 * 🚧 `text`: the lore entry types a value may instead be a **reference**
	 * to — `['core:entry/location']` — as `{ entryId }` (the lore reference
	 * items use, without a held count). Absent, the slot holds words only.
	 * Which entry a reference names, and whether it is one of these types in
	 * the session's own lorebook, is the host's check at the write: the SDK
	 * sees an id and nothing behind it (owner ruling 2026-09-26, location as a
	 * premade stat).
	 */
	entryTypes?: readonly string[]
	/** `derived`: which computation, and the slot it reads. */
	derivation?: string
	from?: SlotId
	[key: string]: unknown
}

/**
 * One stored thing. `null` is "explicitly cleared", absent is "inherit".
 *
 * Wider than any one type's legal values on purpose: this is what the column
 * holds, and the declaration is what narrows it (`checkSlotValue`).
 * @experimental
 */
export type SlotScalar = number | string | boolean | null

/**
 * 🚧 A list item that points at a lore entry rather than naming something in
 * words — the companion who is a cast member's entry, the clue that is a
 * history entry, the sword that is an item.
 *
 * Stored as the entry's id alone. `name` is what the host fills in at READ
 * (the entry's title, now), so a template and a widget can say it; it is
 * never stored — `slotValueForStorage` drops it — because a copied title is a
 * second answer to "what is this called" that goes stale on the first rename.
 * @experimental
 */
export interface SlotLoreRef {
	entryId: number
	/**
	 * 🚧 The **held count** — how many of the entry this owner holds (phase 3a,
	 * owner ruling 2026-09-26: counts live on the holder AND on the item
	 * entry's supply). A whole number, at least 1; absent means one. Stored.
	 *
	 * A reference appears once per list whatever `unique` says, because the
	 * count is its multiplicity: two references to one entry would be two
	 * answers to "how many". ⚠ Not `quantity`, which was the retired
	 * possession edge's word (phase 3b).
	 */
	count?: number
	/** The entry's title as of the read. Filled by the host; never stored. */
	name?: string
}

/** One item of a `list`: a word, or a lore reference. @experimental */
export type SlotListItem = SlotScalar | SlotLoreRef

/**
 * A stored attribute value: one thing, or — for a `list` — several. One thing
 * may be a lore reference only on a `text` slot whose config names
 * `entryTypes` (🚧 2026-09-26: a location is words or a place entry).
 * @experimental
 */
export type SlotValue = SlotScalar | SlotLoreRef | readonly SlotListItem[]

/** Is this list item a lore reference? @experimental */
export const isSlotLoreRef = (item: unknown): item is SlotLoreRef =>
	!!item &&
	typeof item === 'object' &&
	!Array.isArray(item) &&
	Number.isInteger((item as SlotLoreRef).entryId) &&
	(item as SlotLoreRef).entryId > 0

/** 🚧 How many of its entry a reference holds: its `count`, or one when it states none. @experimental */
export const slotLoreRefCount = (ref: SlotLoreRef): number =>
	typeof ref.count === 'number' ? ref.count : 1

/**
 * 🚧 How many of one entry a stored value holds — the held count summed over
 * every reference to it (a valid list has at most one). A word never counts,
 * and a value that is not a list holds nothing. The reader a pipeline's supply
 * check sums across owners (phase 3a).
 * @experimental
 */
export function heldCountIn(value: unknown, entryId: number): number {
	if (!Array.isArray(value)) return 0
	let held = 0
	for (const item of value) if (isSlotLoreRef(item) && item.entryId === entryId) held += slotLoreRefCount(item)
	return held
}

/**
 * 🚧 One list item as a person or a prompt reads it: a word as itself, a lore
 * reference by its title (the one a read filled in, else `entry N`) with its
 * held count when it holds more than one — `Rusty key ×2`. The one spelling a
 * state block, a ledger line and a widget share, so none of them shows a
 * `{ entryId }` object.
 * @experimental
 */
export function slotListItemText(item: SlotListItem): string {
	if (isSlotLoreRef(item)) {
		const title = item.name?.trim() || `entry ${item.entryId}`
		const count = slotLoreRefCount(item)
		return count > 1 ? `${title} ×${count}` : title
	}
	if (item === null) return 'cleared'
	if (typeof item === 'boolean') return item ? 'on' : 'off'
	return String(item)
}

/**
 * A value as it is STORED: every lore reference down to its `entryId` and its
 * held `count` (the `name` a read filled in is dropped; a count of one is
 * dropped too — one held is spelled bare). Everything else is itself.
 * @experimental
 */
export function slotValueForStorage(value: SlotValue): SlotValue {
	// A single reference (a text slot's place): its entry, and nothing else.
	if (isSlotLoreRef(value)) return { entryId: value.entryId }
	if (!Array.isArray(value)) return value
	return (value as readonly SlotListItem[]).map((item) =>
		isSlotLoreRef(item)
			? // One held is stored bare (phase 4): `count: 1` and no count are
				// one value, and it has one spelling on disk.
				item.count === undefined || item.count === 1
				? { entryId: item.entryId }
				: { entryId: item.entryId, count: item.count }
			: item,
	)
}

/** The identity two list items are "the same item" by: a word by its text, a reference by its entry. */
const listItemKey = (item: SlotListItem): string =>
	isSlotLoreRef(item) ? `entry:${item.entryId}` : `${typeof item}:${String(item)}`

// ── Logic on the declaration ────────────────────────────────────────────────

/**
 * One rule on a declaration: when this holds, do this to the value.
 *
 * Every member is a **LiquidJS expression as text**, and this file never runs
 * one — the SDK has no evaluator and deliberately does not grow one. It
 * declares the shape; the host evaluates it at the one write gate, in a fixed
 * phase order (extraction scripts → rules → validation and the turn lock →
 * apply or propose). A rule that wrote a value itself would be a second door
 * into rows the gate exists to be the only door to.
 *
 * Exactly one of `set`, `add` or `remove`, refused at the declaration
 * otherwise: a rule that both set and added has no order anybody could read
 * off it. `when` absent means *always*.
 *
 * ⚠ Liquid has no parentheses and binds right to left, so `a and b or c` is
 * not what most people read. The editor says so and the docs say so; this file
 * cannot, because it never parses the string.
 * @experimental
 */
export interface SlotRule {
	/** The condition. Absent = always. */
	when?: string
	/** The new value. */
	set?: string
	/** `list`: items to put in. `integer`: a **signed delta** — `-1` takes one off. */
	add?: string
	/** `list`: items to take out. An item that is not there is not an error. */
	remove?: string
}

/**
 * A worked case the **host's** tests run against the declaration.
 *
 * Carried and shape-checked here, never executed: "given this state, this slot
 * comes out 12" is a sentence only something with an evaluator can check, and
 * that is the host. Stripped from the content hash — see the file header on
 * the two kinds of prose, and the third kind this is.
 * @experimental
 */
export interface SlotExample {
	/** The state to evaluate against, in the shape the host pins at run start. */
	state: Record<string, unknown>
	/** What the slot should come out as. */
	expect: SlotValue
}

// ── The declaration ─────────────────────────────────────────────────────────

/** @experimental */
export interface AttributeSlotProps {
	/**
	 * What the value is, in core's closed set. Optional when `shape` is
	 * given: the shape's field decides it (`slotTypeForKind`), and stating
	 * both is allowed only when they agree. `derived` has no shape.
	 */
	type?: SlotType
	/**
	 * 🚧 The value's **stat shape**: a catalogue shape's id
	 * (`'core:stat-shape/number@1'`, `statShapes.ts`) or a `FieldDecl` of the
	 * slot's own. What the shape bounds is the floor `config` deviates from.
	 * Absent, the shape is read off `type` (`fieldForSlotType`) — every slot
	 * declared before shapes existed keeps meaning what it meant.
	 *
	 * Inside the content hash: it is what the value IS.
	 */
	shape?: StatShapeId | FieldDecl
	/** The name a person reads. Display text: stripped from the content hash. */
	label?: I18n
	/** What it is, shown where it is attached. Display text: stripped. */
	description?: I18n
	/**
	 * How the **model** is told what this is, in the state block a template
	 * renders.
	 *
	 * ⚠ Inside the content hash, unlike `label` and `description`. Editing it
	 * changes generation everywhere the slot appears, so it is a version bump
	 * and not a copyedit.
	 */
	descriptor: string
	/** Which owner kinds may carry it. */
	appliesTo: readonly SlotAppliesTo[]
	/** The base configuration every attachment starts from. */
	config?: SlotConfig
	/** The value a read falls back to when no layer has one. */
	default?: SlotValue
	/**
	 * `derived` only: a LiquidJS expression computing the value, over the state
	 * pinned at run start.
	 *
	 * Written here rather than in `config.derivation` so that an author's
	 * derivation and one of core's look different at a glance. A slot with
	 * `derive` names `core:derive/liquid@1` implicitly (`slotDerivation`) and
	 * needs no `from`, because the expression says what it reads.
	 * `config.derivation` keeps working, and `age` is why: it reads a birthdate
	 * against the session's story date, which no expression can reach.
	 *
	 * ⚠ Inside the content hash: it is what the number *is*.
	 */
	derive?: string
	/**
	 * What happens to this slot on its own, at the write gate.
	 *
	 * A list although the product shows one. One rule per slot is today's
	 * answer and may not be tomorrow's, and a shape that already holds many is
	 * what keeps the second one from being a migration. Order is the order they
	 * are evaluated in.
	 *
	 * ⚠ Inside the content hash.
	 */
	rules?: readonly SlotRule[]
	/**
	 * Script rows that propose changes to this slot — extraction over the
	 * provider's text, ahead of the rules.
	 *
	 * Opaque strings on purpose: a script is a row in the host's tables, and
	 * the SDK has nothing to resolve one against. A list for the same reason
	 * `rules` is one.
	 *
	 * ⚠ Inside the content hash.
	 */
	scripts?: readonly string[]
	/** Worked cases the host's tests execute. Stripped from the hash — see `SlotExample`. */
	examples?: readonly SlotExample[]
	/**
	 * 🚧 `false` for a slot a **mechanism** keeps rather than a stat a person
	 * tracks — the session's sprite set: never offered as an attribute a
	 * session may add, never carried in from its world, and refused as a
	 * pick (ruled 2026-09-25). A genre may still list it in its baseline.
	 * Absent is pickable. Inside the content hash when stated.
	 */
	pickable?: false
	/**
	 * 🚧 **Earshot**: which prompts may read this slot's value (lair pass R1,
	 * 2026-09-28).
	 *
	 *  · `'all'` (the default) — every agent a run builds a prompt for: the
	 *    planner, the scene, the state-keeper, every voice.
	 *  · `'holder'` — only the **holder's own voice**: the prompt written in
	 *    the voice of the cast member who carries the value. Every other
	 *    prompt, another member's voice included, is built as if the value
	 *    were not there. The Lair's whisper is the first.
	 *
	 * Enforced by the host where state becomes a prompt, never in the state
	 * itself: `session-state@1` still carries the value (a run's voices share
	 * one read). A person's view follows the value's data audience, not
	 * earshot: the host gives a `'holder'` value the audience `owner` +
	 * `character:<holder>`, so the stats widget shows it to the session's
	 * owner and to whoever portrays the holder, and to nobody else.
	 *
	 * `'holder'` is refused unless `appliesTo` is exactly `['cast']` — a world
	 * or a place has no voice to hold it. `'all'` is dropped at registration,
	 * so saying the default and saying nothing are one declaration and one
	 * hash. Inside the content hash when `'holder'`: it decides which prompts
	 * the value reaches.
	 */
	earshot?: SlotEarshot
}

/** 🚧 Which prompts may read a slot: every agent's, or only its holder's own voice. @experimental */
export type SlotEarshot = 'all' | 'holder'

/** 🚧 The earshots a slot may declare. @experimental */
export const SLOT_EARSHOTS: readonly SlotEarshot[] = Object.freeze(['all', 'holder'] as const)

/** 🚧 A slot's earshot, the default read in: `'holder'` only when it says so. @experimental */
export const slotEarshot = (decl: Pick<AttributeSlotProps, 'earshot'>): SlotEarshot =>
	decl.earshot === 'holder' ? 'holder' : 'all'

/** 🚧 May a session pick this slot as an attribute of its own or carry it in from its world? @experimental */
export const slotPickable = (decl: Pick<AttributeSlotProps, 'pickable'>): boolean => decl.pickable !== false

/**
 * Which source a registry entry came through.
 *
 *  · `code` — a genre, a plugin or core declared it at module load. It arrives
 *    and leaves with the package that declares it, and is never retired by
 *    hand.
 *  · `stored` — a person authored it and the host loaded the row. One author,
 *    so re-loading an edited row is a replace rather than a conflict; and it
 *    is the only kind that can be retired.
 * @experimental
 */
export type SlotOrigin = 'code' | 'stored'

/** @experimental */
export interface AttributeSlotDecl extends AttributeSlotProps {
	readonly id: SlotId
	/** Always present on a registered declaration: stated, or read off its `shape`. */
	readonly type: SlotType
	readonly origin: SlotOrigin
	/**
	 * `stored` only: who wrote the row. The id already froze the author's
	 * username as its owner segment; this is the account the row belongs to,
	 * which is a different question the moment somebody is renamed.
	 */
	readonly authorUserId?: number | string
	/**
	 * Retired: nothing new is written to it, everything already written stays.
	 * `stored` only — a code slot leaves with its package instead.
	 */
	readonly retired?: boolean
}

const registry = new Map<SlotId, AttributeSlotDecl>()

/**
 * What is kept out of this registry's content hash beyond `i18n`/`description`.
 *
 * `label`, because renaming a bar is a copyedit. `examples`, because they are
 * the declaration's tests rather than its content — see `SlotExample`.
 *
 * `descriptor`, `derive`, `rules` and `scripts` are deliberately absent:
 * model-facing prose and behaviour are both content, and editing either means
 * `@N+1` rather than a quiet republish.
 * @experimental
 */
export const SLOT_DISPLAY_KEYS = { display: ['label', 'examples'] } as const

/** Why one source may not take an id the other holds — the same refusal, both ways round. */
const crossOriginRefusal = (id: SlotId, held: SlotOrigin): string =>
	held === 'code'
		? `'${id}' is declared in code by the package that owns it, so an authored slot may ` +
			`not claim it: the id would mean one thing or another depending on what is ` +
			`installed, and the values filed under it would change meaning with it. Author ` +
			`it under your own namespace instead.`
		: `'${id}' is already held by a slot somebody authored here. Code claiming it would ` +
			`silently take over the key their values are filed under — retire theirs first, ` +
			`or publish under a different id.`

/**
 * The one way into the registry, whichever door was knocked on.
 *
 * The two origins differ in exactly one rule and it is worth stating why. A
 * code entry keeps the hash comparison, because two *different* declarations
 * under one id there really are two packages disagreeing and one of them wins
 * by load order. A stored entry replaces, because the row **is** the
 * declaration and there is one author: an edited row re-loading is that person
 * finishing a sentence, not a second party arriving.
 */
function register(
	id: SlotId,
	rawProps: AttributeSlotProps,
	origin: SlotOrigin,
	authorUserId?: number | string,
): AttributeSlotDecl {
	assertSlotId(id)
	// The display text (R-20): refused where an author writes code; on a
	// stored row it is dropped with a warning — see `withDisplayTextTolerated`.
	const shown =
		origin === 'code' ? assertDisplayText(id, rawProps) : withDisplayTextTolerated(id, rawProps)
	const props = { ...shown, type: typeOfDeclaration(id, shown) }
	checkSlotDeclaration(id, props)
	// The default said aloud is the default: one declaration, one hash.
	if (props.earshot === 'all') delete props.earshot
	const decl: AttributeSlotDecl = Object.freeze({
		...props,
		id,
		origin,
		...(authorUserId === undefined ? {} : { authorUserId }),
	})
	const existing = registry.get(id)
	if (existing) {
		if (existing.origin !== origin)
			throw new Error(crossOriginRefusal(id, existing.origin))
		if (origin === 'code')
			refuseUnlessIdentical(
				existing,
				decl,
				`duplicate attribute slot id: ${id}`,
				SLOT_DISPLAY_KEYS,
			)
	}
	registry.set(id, decl)
	return decl
}

/**
 * Declare an attribute slot in code.
 *
 * The same two refusals every registry here makes: an id has exactly one owner,
 * and an identical re-declaration is a no-op (a dev-server reload re-running a
 * module must not throw). A *different* declaration under a claimed id throws
 * with both hashes named.
 * @internal
 */
export function defineAttributeSlot(id: SlotId, props: AttributeSlotProps): AttributeSlotDecl {
	return register(id, props, 'code')
}

/**
 * The plugin-facing door — same registration, minus the ability to claim core's
 * namespace. A plugin that could redefine `core:slot/hp@1` would change what
 * every character's health means on the instance without appearing anywhere.
 * @experimental
 */
export function definePluginAttributeSlot(
	pluginId: string,
	id: SlotId,
	props: AttributeSlotProps,
): AttributeSlotDecl {
	if (id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${id}': the 'core:' namespace is reserved. ` +
				`Publish it under your own namespace — a slot two parties can define is one ` +
				`where a stored value means different things depending on load order.`,
		)
	return defineAttributeSlot(id, props)
}

/**
 * The person-facing door: a slot somebody authored, loaded from the host's
 * `attribute_declarations` row.
 *
 * Every check `defineAttributeSlot` makes, plus one of its own — the owner
 * segment must not be reserved. `core` and every installed plugin id are off
 * limits, because a user slug that collided with one would be redefined the
 * next time that package loaded, underneath values already filed against it.
 *
 * It **replaces** rather than comparing hashes, which is the whole difference
 * between the two doors and is explained at `register`.
 * @internal
 */
export function defineStoredAttributeSlot(
	id: SlotId,
	props: AttributeSlotProps,
	meta: { userId: number | string },
): AttributeSlotDecl {
	assertSlotId(id)
	const owner = slotOwner(id)
	if (isReservedAttributeOwner(owner))
		throw new Error(
			`'${id}' is authored under the reserved owner '${owner}'. 'core' and every installed ` +
				`plugin id are reserved: a stored slot sharing one would be redefined the next ` +
				`time that package loaded, and the values filed under it would quietly change ` +
				`meaning. Author it under your own namespace.`,
		)
	return register(id, props, 'stored', meta.userId)
}

/** @internal */
export const getAttributeSlot = (id: SlotId): AttributeSlotDecl | undefined => registry.get(id)
/** @internal */
export const attributeSlots = (): AttributeSlotDecl[] => [...registry.values()]
/** @internal */
export function _clearAttributeSlots(): void {
	registry.clear()
}

/**
 * Withdraw a package's slot declaration (plugin disabled, uninstalled or
 * upgraded). Values stay where they are and read as opaque data; a write is
 * refused as undeclared until the package declares it again. Only a code
 * declaration outside `core:` is withdrawn — a stored slot is somebody's and
 * leaves by retirement, and core's leave with the build.
 * @internal
 */
export function _withdrawAttributeSlot(id: SlotId): boolean {
	const decl = registry.get(id)
	if (!decl || decl.origin !== 'code' || id.startsWith('core:')) return false
	return registry.delete(id)
}

/** The entry retire and revive are allowed to touch — a stored one, and only that. */
function storedSlot(id: SlotId, verb: 'retire' | 'revive'): AttributeSlotDecl {
	const decl = registry.get(id)
	if (!decl)
		throw new Error(
			`cannot ${verb} '${id}': no slot is declared under that id. There is nothing to ` +
				`${verb} — check the id, and that the row was loaded into the registry.`,
		)
	if (decl.origin !== 'stored')
		throw new Error(
			`'${id}' is declared in code, and code declarations are never retired by hand. A ` +
				`core or plugin slot arrives and leaves with the package that declares it: ` +
				`uninstall or upgrade that, and every value stays exactly where it is. Only a ` +
				`slot somebody authored here can be retired.`,
		)
	return decl
}

/**
 * Retire a stored slot: nothing new is written to it, everything already
 * written stays.
 *
 * Not a delete, and the difference is the point. Panels grey it with the label
 * it last had, the ledger and the charts keep every row, the prompt drops it,
 * and a write is refused with a sentence (`checkSlotValue`). A hard delete is a
 * separate, explicit purge *after* retirement that shows the counts first —
 * because what is being deleted is somebody's play, not a definition.
 * @internal
 */
export function retireAttributeSlot(id: SlotId): AttributeSlotDecl {
	const next: AttributeSlotDecl = Object.freeze({ ...storedSlot(id, 'retire'), retired: true })
	registry.set(id, next)
	return next
}

/** Undo a retirement. Writes are taken again; nothing about the stored values changed either way. @internal */
export function reviveAttributeSlot(id: SlotId): AttributeSlotDecl {
	const { retired: _wasRetired, ...rest } = storedSlot(id, 'revive')
	const next: AttributeSlotDecl = Object.freeze(rest)
	registry.set(id, next)
	return next
}

/**
 * The display-text findings of one slot declaration (R-20): `label` and
 * `description`, both optional — a slot may be listed by its id — but a blank
 * one is a label that draws nothing where the author meant to say something.
 * Run by the code door here and by the host's **write** door for an authored
 * slot (the app's `declareSlot` / `updateSlot`), never by a reload.
 * @internal
 */
export function attributeSlotDisplayFindings(id: SlotId, props: AttributeSlotProps): string[] {
	return [
		...i18nFindings(props.label, `${id} label`),
		...i18nFindings(props.description, `${id} description`),
	]
}

function assertDisplayText(id: SlotId, props: AttributeSlotProps): AttributeSlotProps {
	const display = attributeSlotDisplayFindings(id, props)
	if (display.length)
		throw new Error(
			`${id} declares display text a publish refuses (R-20):\n · ${display.join('\n · ')}`,
		)
	return props
}

/**
 * A stored row reloading at boot is never refused for its display text
 * (ruled 2026-09-17, U5i review): the gate is the write door, and a row that
 * was stored with a blank `description` would otherwise vanish from every
 * boot after. The offending field is dropped — a blank label reads as "listed
 * by id" — and a warning names the row and the finding, so the defect is
 * visible without the slot being lost.
 */
function withDisplayTextTolerated(id: SlotId, props: AttributeSlotProps): AttributeSlotProps {
	const findings = attributeSlotDisplayFindings(id, props)
	if (!findings.length) return props
	console.warn(
		`[attributes] stored slot '${id}' carries display text a publish refuses; ` +
			`dropped on reload, fix the row: ${findings.join('; ')}`,
	)
	const tolerated: AttributeSlotProps = { ...props }
	if (i18nFindings(props.label, 'label').length) delete tolerated.label
	if (i18nFindings(props.description, 'description').length) delete tolerated.description
	return tolerated
}

// ── Stat shapes on a slot ──────────────────────────────────────────────────

/** The `SlotType` each stat kind is stored and checked as. @experimental */
export function slotTypeForKind(kind: StatShapeKind): Exclude<SlotType, 'derived'> {
	switch (kind) {
		case 'number':
			return 'integer'
		case 'choice':
			return 'enum'
		case 'list':
			return 'list'
		case 'boolean':
			return 'boolean'
		case 'story-time':
		case 'text':
			return 'text'
	}
}

/**
 * The field a slot declared by `type` alone is read as — how every slot from
 * before stat shapes means what it always meant. `derived` has none: it is
 * computed, and what it computes is not declared as a field.
 * @experimental
 */
export function fieldForSlotType(type: SlotType): FieldDecl | undefined {
	switch (type) {
		case 'integer':
			return { type: 'integer' }
		case 'enum':
			return { type: 'enum' }
		case 'list':
			return { type: 'list', item: { type: 'string' } }
		case 'text':
			return { type: 'text' }
		case 'boolean':
			return { type: 'boolean' }
		case 'derived':
			return undefined
	}
}

/** The shape a slot's value takes, as a field: its catalogue shape's, its own inline one, or its type's. @experimental */
export function slotField(decl: Pick<AttributeSlotProps, 'type' | 'shape'>): FieldDecl | undefined {
	if (decl.type === 'derived') return undefined
	if (typeof decl.shape === 'string') return getStatShape(decl.shape)?.field
	if (decl.shape) return decl.shape
	return decl.type ? fieldForSlotType(decl.type) : undefined
}

/** The catalogue shape a slot names, when it names one (an inline `FieldDecl` names none). @experimental */
export const slotStatShapeId = (decl: Pick<AttributeSlotProps, 'shape'>): StatShapeId | undefined =>
	typeof decl.shape === 'string' ? decl.shape : undefined

/** Which kind of stat a slot is; `undefined` for a derived slot, which is computed rather than kept. @experimental */
export const slotStatShapeKind = (decl: Pick<AttributeSlotProps, 'type' | 'shape'>): StatShapeKind | undefined =>
	statShapeKindOf(slotField(decl))

/**
 * What a field bounds, as the configuration keys a layer deviates from: a
 * number's `min`/`max`; a choice's options (`of`, or its `members`' keys); a
 * list's item count (`max` → `maxItems`), its items' closed set and length; a
 * line's length (`max` → `maxLength`).
 * @experimental
 */
export function fieldSlotConfig(field: FieldDecl | undefined): SlotConfig {
	const out: SlotConfig = {}
	const kind = statShapeKindOf(field)
	if (!field || !kind) return out
	const options = (f: FieldDecl) => f.of ?? f.members?.map((m) => m.key)
	switch (kind) {
		case 'number':
			if (typeof field.min === 'number') out.min = field.min
			if (typeof field.max === 'number') out.max = field.max
			break
		case 'choice': {
			const of = options(field)
			if (of?.length) out.of = [...of]
			break
		}
		case 'list': {
			if (typeof field.max === 'number') out.maxItems = field.max
			const item = field.item
			if (item?.type === 'enum') {
				const of = options(item)
				if (of?.length) out.of = [...of]
			} else if (item && typeof item.max === 'number') out.maxLength = item.max
			break
		}
		case 'text':
			if (typeof field.max === 'number') out.maxLength = field.max
			break
	}
	return out
}

/**
 * The type a declaration is, from what it said: `type`, `shape`, or both
 * agreeing. Refused with a sentence when neither is said, when the shape is
 * one nothing declares or core cannot keep, and when the two disagree.
 */
function typeOfDeclaration(id: SlotId, props: AttributeSlotProps): SlotType {
	if (props.shape === undefined) {
		if (!props.type)
			throw new Error(
				`${id} declares neither a type nor a shape. Name a stat shape ` +
					`('core:stat-shape/number@1') or write the value's field — a slot has to say what it holds.`,
			)
		return props.type
	}
	if (props.type === 'derived')
		throw new Error(
			`${id} is derived and declares a shape. A derived slot is computed, never kept, so there is ` +
				`no stored value for a shape to describe. Drop the shape.`,
		)
	let field: FieldDecl | undefined
	if (typeof props.shape === 'string') {
		field = getStatShape(props.shape)?.field
		if (!field)
			throw new Error(
				`${id} names the stat shape '${props.shape}', which nothing declares. Shapes are declared ` +
					`above the slots that name them — a slot shaped like nothing validates against nothing.`,
			)
	} else field = props.shape
	const kind = statShapeKindOf(field)
	if (!kind)
		throw new Error(
			`${id} is shaped as a '${field?.type}' field, which is not a value core can keep as a stat. ` +
				`A stat is a number, a choice, a list of text, a story time, a line of text or a switch.`,
		)
	const type = slotTypeForKind(kind)
	if (props.type && props.type !== type)
		throw new Error(
			`${id} says it is '${props.type}' and is shaped as a ${kind}, which is stored as '${type}'. ` +
				`Say one of them — the shape is enough.`,
		)
	return type
}

/** What a declaration must satisfy before it is worth storing values against. */
function checkSlotDeclaration(id: SlotId, props: AttributeSlotProps & { type: SlotType }): void {
	if (props.pickable !== undefined && props.pickable !== false)
		throw new Error(`${id}.pickable: only \`false\` is said — a slot is pickable unless it says otherwise.`)
	if (props.earshot !== undefined && !SLOT_EARSHOTS.includes(props.earshot))
		throw new Error(
			`${id}.earshot is '${String(props.earshot)}'. A slot is heard by 'all' (the default) or ` +
				`by its 'holder' alone.`,
		)
	if (
		props.earshot === 'holder' &&
		!(props.appliesTo?.length === 1 && props.appliesTo[0] === 'cast')
	)
		throw new Error(
			`${id} declares earshot 'holder' and applies to ${
				props.appliesTo?.length ? props.appliesTo.map((o) => `'${o}'`).join(', ') : 'nothing'
			}. Only a cast member has a voice of their own to hold a value in — a world or a place ` +
				`has none, so a 'holder' slot there would reach no prompt at all. Apply it to ` +
				`['cast'] alone, or let everyone hear it.`,
		)
	if (!props.descriptor?.trim())
		throw new Error(
			`${id} declares no descriptor. It is the sentence the model reads about this ` +
				`slot; a slot without one reaches a prompt as a bare number.`,
		)
	if (!props.appliesTo?.length)
		throw new Error(
			`${id} declares no appliesTo. Say whether it attaches to 'cast', to 'world', to ` +
				`'location', or to several — a slot nothing may carry can never hold a value.`,
		)
	if (props.type === 'enum' && !(props.config?.of ?? fieldSlotConfig(slotField(props)).of)?.length)
		throw new Error(
			`${id} is an enum with no options. Declare config.of — the closed set is what ` +
				`makes it a chip rather than a text field.`,
		)
	if (props.derive !== undefined) {
		if (props.type !== 'derived')
			throw new Error(
				`${id} is a '${props.type}' slot and declares 'derive'. An expression that computes ` +
					`the value is what 'derived' means; on a stored slot it would overwrite what ` +
					`somebody wrote, every read. Declare type 'derived', or drop the expression.`,
			)
		if (!props.derive.trim())
			throw new Error(
				`${id} declares an empty 'derive'. A derived slot with no expression computes ` +
					`nothing and reads absent forever, which is a slot that is never there.`,
			)
		const named = props.config?.derivation
		if (named && named !== derivations.liquid.id)
			throw new Error(
				`${id} declares both 'derive' and config.derivation '${named}' — two answers to ` +
					`how one number is computed, and nothing to choose between them. An ` +
					`expression already means ${derivations.liquid.id}; drop the config key, or ` +
					`drop the expression.`,
			)
	}
	// An expression IS the derivation (`slotDerivation`), so the named-derivation
	// checks below are for the other spelling only.
	if (props.type === 'derived' && props.derive === undefined) {
		const derivation = props.config?.derivation
		const decl = derivation ? getDerivation(derivation) : undefined
		if (!decl)
			throw new Error(
				`${id} is derived but names ${derivation ? `'${derivation}'` : 'no derivation'}, ` +
					`which is not one of core's: ${Object.values(derivations)
						.map((d) => d.id)
						.join(', ')}. Derivations are core-owned logic, not composable.`,
			)
		if (decl.requiresFrom && !props.config?.from)
			throw new Error(
				`${id} names ${decl.id}, which reads another slot — declare config.from with ` +
					`that slot's id. ${decl.description}`,
			)
	}
	if (props.default !== undefined && props.type === 'derived')
		throw new Error(
			`${id} is derived and declares a default. A derived slot is computed or absent; a ` +
				`default would be a stored answer to a question whose whole point is that it ` +
				`must not be stored.`,
		)
	props.rules?.forEach((rule, i) => {
		const ops = (['set', 'add', 'remove'] as const).filter((k) => rule[k] !== undefined)
		if (ops.length !== 1)
			throw new Error(
				`${id} rule ${i} declares ${ops.length ? ops.join(' and ') : 'no operation'}. A ` +
					`rule does exactly one thing — set, add or remove — because a rule that did ` +
					`two has no order anybody could read off it.`,
			)
		if (ops[0] === 'add' && props.type !== 'list' && props.type !== 'integer')
			throw new Error(
				`${id} is a '${props.type}' slot and rule ${i} declares 'add'. Adding to a value ` +
					`means something only where the value has parts or arithmetic: a list, or an ` +
					`integer, where 'add' is a signed delta. Use 'set'.`,
			)
		if (ops[0] === 'remove' && props.type !== 'list')
			throw new Error(
				`${id} is a '${props.type}' slot and rule ${i} declares 'remove'. Only a list has ` +
					`items to take away; an integer that should go down is 'add' with a negative ` +
					`delta, and anything else is 'set'.`,
			)
	})
}

// ── Validation, at the write ────────────────────────────────────────────────

/**
 * The configuration in force for one owner: the declaration's own config with
 * each layer's deviations laid over it, nearest layer last.
 *
 * Merging keys rather than replacing objects is what makes "deviations only"
 * real — a session that raised a cap must not silently drop the enum options
 * the lorebook declared beside it.
 * @internal
 */
export function resolveSlotConfig(
	decl: AttributeSlotDecl,
	...layers: readonly (SlotConfig | null | undefined)[]
): SlotConfig {
	return layers.reduce<SlotConfig>(
		(acc, layer) => (layer ? { ...acc, ...layer } : acc),
		{ ...fieldSlotConfig(slotField(decl)), ...(decl.config ?? {}) },
	)
}

/**
 * Why this value may not be stored under this slot, or `null` if it may.
 *
 * A sentence rather than a boolean, because every caller — a socket handler, a
 * node, a review gate — has to tell a person what was wrong, and three callers
 * inventing three wordings for one rule is how a validator stops being one.
 *
 * ⚠ A value is checked against the configuration valid at **its own anchor**,
 * not against the current one (plan Part 3). Callers pass that config in; this
 * function never reaches for a current one, because doing so is precisely the
 * mistake that retroactively invalidates a legitimate historical value.
 * @internal
 */
export function checkSlotValue(
	decl: AttributeSlotDecl,
	value: SlotValue,
	config: SlotConfig = resolveSlotConfig(decl),
): string | null {
	// Retirement answers first. It is the newest fact about the slot and the
	// only one that explains why a write that worked last week does not now.
	if (decl.retired)
		return (
			`${decl.id} is retired, so nothing new is written to it. Everything already stored ` +
			`is kept and still shown — revive the slot to write to it again.`
		)
	if (decl.type === 'derived')
		return `${decl.id} is derived, so it has no value to set — it is computed ${
			decl.derive ? 'from its own expression' : `from ${config.from ?? 'another slot'}`
		} every time it is read.`
	// Clearing is always legal: it is how a layer says "inherit again", and a
	// cleared value must not have to satisfy a bound it is opting out of.
	if (value === null) return null

	switch (decl.type) {
		case 'integer': {
			// A shape declared as `number` takes fractions; everything else
			// stored as `integer` is a whole number, as it always was.
			if (slotField(decl)?.type === 'number') {
				if (typeof value !== 'number' || !Number.isFinite(value))
					return `${decl.id} is a number; '${String(value)}' is not one.`
			} else if (typeof value !== 'number' || !Number.isInteger(value))
				return `${decl.id} is a whole number; '${String(value)}' is not one.`
			if (typeof config.min === 'number' && value < config.min)
				return `${decl.id} does not go below ${config.min}.`
			if (typeof config.max === 'number' && value > config.max)
				return `${decl.id} does not go above ${config.max}.`
			return null
		}
		case 'enum': {
			const of = config.of ?? []
			if (typeof value !== 'string' || !of.includes(value))
				return `${decl.id} is one of ${of.join(', ') || '(nothing declared)'}; '${String(
					value,
				)}' is not.`
			return null
		}
		case 'text': {
			// 🚧 A reference to a lore entry, when the slot names the entry
			// types it may point at (`config.entryTypes`). Once, with no held
			// count: somebody is in one place, not two of it.
			if (isSlotLoreRef(value) && config.entryTypes?.length) {
				const extra = Object.keys(value).filter((k) => k !== 'entryId' && k !== 'name')
				if (extra.length || (value.name !== undefined && typeof value.name !== 'string'))
					return `${decl.id} is text or a reference to a lore entry as { entryId }; '${JSON.stringify(
						value,
					)}' is not one.`
				return null
			}
			if (typeof value !== 'string')
				return config.entryTypes?.length
					? `${decl.id} is text or a reference to a lore entry (${config.entryTypes.join(', ')}).`
					: `${decl.id} is text.`
			if (slotField(decl)?.format === 'story-time' && !parseStoryTime(value))
				return (
					`${decl.id} is a story time — a year, then optionally month, day and time, as ` +
					`'412-03-05 22:30'; '${value}' is not one.`
				)
			if (typeof config.maxLength === 'number' && value.length > config.maxLength)
				return `${decl.id} is at most ${config.maxLength} characters.`
			return null
		}
		case 'list': {
			if (!Array.isArray(value))
				return `${decl.id} holds a list of items; '${String(value)}' is one thing.`
			const items = value as readonly SlotListItem[]
			if (typeof config.maxItems === 'number' && items.length > config.maxItems)
				return `${decl.id} holds at most ${config.maxItems} items; this is ${items.length}.`
			const of = config.of
			const unique = config.unique !== false
			const seen = new Set<string>()
			for (const item of items) {
				// A lore reference is an item in its own right — unless the
				// list is closed over words, where only those words are.
				if (isSlotLoreRef(item)) {
					if (of)
						return `${decl.id} holds items from ${of.join(', ') || '(nothing declared)'}; a lore entry is not one of them.`
					const extra = Object.keys(item).filter((k) => k !== 'entryId' && k !== 'name' && k !== 'count')
					if (extra.length || (item.name !== undefined && typeof item.name !== 'string'))
						return `${decl.id} holds lore references as { entryId, count? }; '${JSON.stringify(item)}' is not one.`
					if (item.count !== undefined && !(Number.isInteger(item.count) && item.count >= 1))
						return `${decl.id} holds a lore entry with a whole count of at least 1; '${String(
							item.count,
						)}' is not one.`
					// Whatever `unique` says: the count is a reference's
					// multiplicity, so a second reference to the same entry is
					// a second answer to "how many".
					if (seen.has(listItemKey(item)))
						return `${decl.id} holds each lore entry once, with a count; lore entry ${item.entryId} is in it twice.`
					seen.add(listItemKey(item))
					continue
				}
				if (typeof item !== 'string')
					return `${decl.id} holds a list of text items and lore references; '${
						item && typeof item === 'object' ? JSON.stringify(item) : String(item)
					}' is neither.`
				if (of && !of.includes(item))
					return `${decl.id} holds items from ${of.join(', ') || '(nothing declared)'}; '${item}' is not one of them.`
				if (!of && typeof config.maxLength === 'number' && item.length > config.maxLength)
					return `${decl.id} holds items of at most ${config.maxLength} characters; '${item}' is longer.`
				if (unique && seen.has(listItemKey(item)))
					return `${decl.id} holds each item once; '${item}' is in it twice.`
				seen.add(listItemKey(item))
			}
			return null
		}
		case 'boolean':
			return typeof value === 'boolean' ? null : `${decl.id} is on or off.`
	}
}

// ── Changing a list ─────────────────────────────────────────────────────────

/** What a change does to the value already there. @experimental */
export type SlotChangeOp = 'set' | 'add' | 'remove'

/**
 * A list after an op, or the reason it stayed as it was.
 *
 * Two fields rather than a throw or a bare array, because both answers have to
 * reach somebody: the gate needs the list to store, a review card needs the
 * sentence to show. `refusal` mirrors `checkSlotValue` — a sentence, or `null`
 * when there is nothing to say — so one shape reads for both halves of a write.
 * @experimental
 */
export interface SlotListOpResult {
	/** The list as it now stands. Identical in content to `current` when `refusal` is set. */
	value: readonly SlotListItem[]
	/** Why the op did not apply, or `null` if it did. */
	refusal: string | null
}

/**
 * Apply one list op, purely.
 *
 * It shapes the list; it does not judge the items. `unique` and `maxItems` are
 * properties of the *list*, so they belong here — `add` dedups rather than
 * growing a set that is not one, and an overflow is refused rather than
 * trimmed, because silently dropping the sword somebody just picked up is how
 * an inventory starts lying. Whether `sword` is a legal item at all is
 * `checkSlotValue`'s question, asked of the result.
 *
 * `remove` of something that is not there is not an error: the state asked for
 * — it is not in the list — is the state afterwards, and refusing would make a
 * rule that fires twice fail the second time for having already worked.
 *
 * The refusal says "this list" rather than naming the slot, because the op is
 * given a config and not a declaration. The caller knows which slot it asked
 * about; only it can put the label in front.
 * @experimental
 */
export function applyListOp(
	current: readonly SlotListItem[] | null | undefined,
	op: SlotChangeOp,
	items: readonly SlotListItem[],
	config: SlotConfig = {},
): SlotListOpResult {
	const held = current ?? []
	const unique = config.unique !== false
	// A lore reference is deduped whatever `unique` says: its count is its
	// multiplicity (phase 3a), so the same entry twice is merged, never kept.
	const dedup = (list: readonly SlotListItem[]): SlotListItem[] => {
		const seen = new Set<string>()
		const out: SlotListItem[] = []
		for (const item of list) {
			if (!unique && !isSlotLoreRef(item)) {
				out.push(item)
				continue
			}
			const key = listItemKey(item)
			if (seen.has(key)) continue
			seen.add(key)
			out.push(item)
		}
		return out
	}
	// A count of one is spelled bare (phase 4): absent reads as one, so
	// `count: 1` would be a second spelling of the same holding.
	const withCount = (ref: SlotLoreRef, count: number): SlotLoreRef => ({
		entryId: ref.entryId,
		...(count === 1 ? {} : { count }),
		...(ref.name === undefined ? {} : { name: ref.name }),
	})

	let next: readonly SlotListItem[]
	switch (op) {
		case 'set':
			next = dedup(items)
			break
		case 'add': {
			// A reference that states a count adds that many to what is held
			// (an uncounted holding is one); one without a count is a set add —
			// "it is in the list" — exactly as before counts existed.
			const out = [...held]
			const rest: SlotListItem[] = []
			for (const item of items) {
				if (!isSlotLoreRef(item) || item.count === undefined) {
					rest.push(item)
					continue
				}
				const at = out.findIndex((h) => isSlotLoreRef(h) && h.entryId === item.entryId)
				if (at < 0) out.push(withCount(item, item.count))
				else out[at] = withCount(out[at] as SlotLoreRef, slotLoreRefCount(out[at] as SlotLoreRef) + item.count)
			}
			next = dedup([...out, ...rest])
			break
		}
		case 'remove': {
			// A counted reference takes that many and drops the item at zero;
			// an uncounted one (and every word) takes the item out entirely.
			const out = new Set(
				items.filter((item) => !isSlotLoreRef(item) || item.count === undefined).map(listItemKey),
			)
			const less = new Map<number, number>()
			for (const item of items)
				if (isSlotLoreRef(item) && item.count !== undefined)
					less.set(item.entryId, (less.get(item.entryId) ?? 0) + item.count)
			next = held.flatMap((item): SlotListItem[] => {
				if (out.has(listItemKey(item))) return []
				if (!isSlotLoreRef(item) || !less.has(item.entryId)) return [item]
				const left = slotLoreRefCount(item) - less.get(item.entryId)!
				return left > 0 ? [withCount(item, left)] : []
			})
			break
		}
	}

	if (typeof config.maxItems === 'number' && next.length > config.maxItems)
		return {
			value: Object.freeze([...held]),
			refusal:
				`this list holds at most ${config.maxItems} ` +
				`item${config.maxItems === 1 ? '' : 's'}, and that would make it ${next.length}. ` +
				`Take something out first — nothing was dropped to make room.`,
		}
	return { value: Object.freeze(next), refusal: null }
}

/**
 * Whether a slot may attach to this kind of owner.
 *
 * The owner *kinds* the host stores (`card`, `cast_member`, `lorebook`,
 * `session`, `session_cast`, `location`, `session_location`) collapse to the
 * three a declaration talks about: a lorebook and a session are the **world**,
 * a location entry and its session layer are a **location**, everything that
 * is somebody is the **cast**. A declaration should not have to know the
 * host's storage layout to say "this is a character stat".
 * @internal
 */
export const slotAppliesTo = (decl: AttributeSlotDecl, owner: SlotAppliesTo): boolean =>
	decl.appliesTo.includes(owner)

/**
 * Which derivation computes this slot, or `undefined` when nothing does.
 *
 * One reader, because the question now has two spellings: an expression on the
 * declaration means `core:derive/liquid@1`, one of core's computations names
 * itself in `config`. A host, a client and a receipt each working that out for
 * themselves is how the three start disagreeing about which one ran.
 * @experimental
 */
export const slotDerivation = (decl: AttributeSlotDecl): string | undefined =>
	decl.type !== 'derived'
		? undefined
		: decl.derive
			? derivations.liquid.id
			: decl.config?.derivation
