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
import type { I18n } from './descriptors.js';
import type { FieldDecl } from './settings.js';
import { type StatShapeId, type StatShapeKind } from './statShapes.js';
/** `owner:slot/name@N` — `core:slot/hp@1`, `acme.rp:slot/tension@1`. @experimental */
export type SlotId = string;
/** @experimental */
export declare function assertSlotId(id: string): void;
/** Who declared it: `core`, a plugin's id, or the username frozen in at authoring. @internal */
export declare const slotOwner: (id: string) => string;
/** The slug — the data key a value is filed under for the life of the card carrying it. @experimental */
export declare const slotSlug: (id: string) => string;
/** The major. `@N+1` is a different slot, not an edit to this one. @experimental */
export declare const slotVersion: (id: string) => number;
/** @internal */
export declare function reserveAttributeOwner(segment: string): void;
/** @internal */
export declare const isReservedAttributeOwner: (segment: string) => boolean;
/** Back to `core` alone — for tests, and for a host tearing an install down. @internal */
export declare function _clearReservedAttributeOwners(): void;
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
export type SlotType = 'integer' | 'enum' | 'text' | 'boolean' | 'list' | 'derived';
/**
 * Which owners a slot may attach to: a cast member, the world, a location
 * (🚧 attributes phase 4 — a `core:entry/location` lore entry holding state
 * of its own: what is lying in the place, how it stands), or several.
 * @experimental
 */
export type SlotAppliesTo = 'cast' | 'world' | 'location';
/**
 * The computations a `derived` slot may name. Closed and core-owned for the
 * same reason `SlotType` is: each one is code core runs.
 *
 * The SDK declares the *name* and what it needs; the host implements the
 * arithmetic, because the inputs (the session's story date) are the host's.
 * @experimental
 */
export interface DerivationDecl {
    id: string;
    /** The slot whose value this derivation reads, named in the slot's config as `from`. */
    requiresFrom: boolean;
    description: string;
}
/** @experimental */
export declare const derivations: Readonly<{
    /**
     * How old someone is: a `birthdate` value on the same owner, against the
     * session's story date. Absent — not zero — when either is missing, which
     * is the whole reason age is derived and not typed in.
     */
    readonly age: Readonly<{
        id: "core:derive/age@1";
        requiresFrom: true;
        description: "A birthdate slot on the same owner, read against the session's story date.";
    }>;
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
    readonly liquid: Readonly<{
        id: "core:derive/liquid@1";
        requiresFrom: false;
        description: "A LiquidJS expression on the declaration, evaluated over the state pinned at run start.";
    }>;
}>;
/** @experimental */
export type DerivationId = (typeof derivations)[keyof typeof derivations]['id'];
/** @experimental */
export declare const getDerivation: (id: string) => DerivationDecl | undefined;
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
    min?: number;
    max?: number;
    /** `enum`: the values this owner may take. */
    of?: readonly string[];
    /** `text`: how long a line may be. `list`: how long each free-text item may be. */
    maxLength?: number;
    /**
     * `list`: the ceiling on how many items it holds. A refusal and never a
     * trim (`applyListOp`) — silently dropping the sword somebody just picked
     * up is how an inventory starts lying about itself.
     */
    maxItems?: number;
    /**
     * `list`: whether the same item twice is two items. **True unless stated**,
     * because the common case is a set — conditions, known facts, keys on a
     * ring — where a repeat is a bug in whatever wrote it. Say `false` for the
     * case where it is not one (three rations).
     */
    unique?: boolean;
    /**
     * 🚧 `text`: the lore entry types a value may instead be a **reference**
     * to — `['core:entry/location']` — as `{ entryId }` (the lore reference
     * items use, without a held count). Absent, the slot holds words only.
     * Which entry a reference names, and whether it is one of these types in
     * the session's own lorebook, is the host's check at the write: the SDK
     * sees an id and nothing behind it (owner ruling 2026-09-26, location as a
     * premade stat).
     */
    entryTypes?: readonly string[];
    /** `derived`: which computation, and the slot it reads. */
    derivation?: string;
    from?: SlotId;
    [key: string]: unknown;
}
/**
 * One stored thing. `null` is "explicitly cleared", absent is "inherit".
 *
 * Wider than any one type's legal values on purpose: this is what the column
 * holds, and the declaration is what narrows it (`checkSlotValue`).
 * @experimental
 */
export type SlotScalar = number | string | boolean | null;
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
    entryId: number;
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
    count?: number;
    /** The entry's title as of the read. Filled by the host; never stored. */
    name?: string;
}
/** One item of a `list`: a word, or a lore reference. @experimental */
export type SlotListItem = SlotScalar | SlotLoreRef;
/**
 * A stored attribute value: one thing, or — for a `list` — several. One thing
 * may be a lore reference only on a `text` slot whose config names
 * `entryTypes` (🚧 2026-09-26: a location is words or a place entry).
 * @experimental
 */
export type SlotValue = SlotScalar | SlotLoreRef | readonly SlotListItem[];
/** Is this list item a lore reference? @experimental */
export declare const isSlotLoreRef: (item: unknown) => item is SlotLoreRef;
/** 🚧 How many of its entry a reference holds: its `count`, or one when it states none. @experimental */
export declare const slotLoreRefCount: (ref: SlotLoreRef) => number;
/**
 * 🚧 How many of one entry a stored value holds — the held count summed over
 * every reference to it (a valid list has at most one). A word never counts,
 * and a value that is not a list holds nothing. The reader a pipeline's supply
 * check sums across owners (phase 3a).
 * @experimental
 */
export declare function heldCountIn(value: unknown, entryId: number): number;
/**
 * 🚧 One list item as a person or a prompt reads it: a word as itself, a lore
 * reference by its title (the one a read filled in, else `entry N`) with its
 * held count when it holds more than one — `Rusty key ×2`. The one spelling a
 * state block, a ledger line and a widget share, so none of them shows a
 * `{ entryId }` object.
 * @experimental
 */
export declare function slotListItemText(item: SlotListItem): string;
/**
 * A value as it is STORED: every lore reference down to its `entryId` and its
 * held `count` (the `name` a read filled in is dropped; a count of one is
 * dropped too — one held is spelled bare). Everything else is itself.
 * @experimental
 */
export declare function slotValueForStorage(value: SlotValue): SlotValue;
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
    when?: string;
    /** The new value. */
    set?: string;
    /** `list`: items to put in. `integer`: a **signed delta** — `-1` takes one off. */
    add?: string;
    /** `list`: items to take out. An item that is not there is not an error. */
    remove?: string;
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
    state: Record<string, unknown>;
    /** What the slot should come out as. */
    expect: SlotValue;
}
/** @experimental */
export interface AttributeSlotProps {
    /**
     * What the value is, in core's closed set. Optional when `shape` is
     * given: the shape's field decides it (`slotTypeForKind`), and stating
     * both is allowed only when they agree. `derived` has no shape.
     */
    type?: SlotType;
    /**
     * 🚧 The value's **stat shape**: a catalogue shape's id
     * (`'core:stat-shape/number@1'`, `statShapes.ts`) or a `FieldDecl` of the
     * slot's own. What the shape bounds is the floor `config` deviates from.
     * Absent, the shape is read off `type` (`fieldForSlotType`) — every slot
     * declared before shapes existed keeps meaning what it meant.
     *
     * Inside the content hash: it is what the value IS.
     */
    shape?: StatShapeId | FieldDecl;
    /** The name a person reads. Display text: stripped from the content hash. */
    label?: I18n;
    /** What it is, shown where it is attached. Display text: stripped. */
    description?: I18n;
    /**
     * How the **model** is told what this is, in the state block a template
     * renders.
     *
     * ⚠ Inside the content hash, unlike `label` and `description`. Editing it
     * changes generation everywhere the slot appears, so it is a version bump
     * and not a copyedit.
     */
    descriptor: string;
    /** Which owner kinds may carry it. */
    appliesTo: readonly SlotAppliesTo[];
    /** The base configuration every attachment starts from. */
    config?: SlotConfig;
    /** The value a read falls back to when no layer has one. */
    default?: SlotValue;
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
    derive?: string;
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
    rules?: readonly SlotRule[];
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
    scripts?: readonly string[];
    /** Worked cases the host's tests execute. Stripped from the hash — see `SlotExample`. */
    examples?: readonly SlotExample[];
    /**
     * 🚧 `false` for a slot a **mechanism** keeps rather than a stat a person
     * tracks — the session's sprite set: never offered as an attribute a
     * session may add, never carried in from its world, and refused as a
     * pick (ruled 2026-09-25). A genre may still list it in its baseline.
     * Absent is pickable. Inside the content hash when stated.
     */
    pickable?: false;
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
     * one read), and a person's view follows the data audience, not earshot,
     * so the stats widget still draws it.
     *
     * `'holder'` is refused unless `appliesTo` is exactly `['cast']` — a world
     * or a place has no voice to hold it. `'all'` is dropped at registration,
     * so saying the default and saying nothing are one declaration and one
     * hash. Inside the content hash when `'holder'`: it decides which prompts
     * the value reaches.
     */
    earshot?: SlotEarshot;
}
/** 🚧 Which prompts may read a slot: every agent's, or only its holder's own voice. @experimental */
export type SlotEarshot = 'all' | 'holder';
/** 🚧 The earshots a slot may declare. @experimental */
export declare const SLOT_EARSHOTS: readonly SlotEarshot[];
/** 🚧 A slot's earshot, the default read in: `'holder'` only when it says so. @experimental */
export declare const slotEarshot: (decl: Pick<AttributeSlotProps, 'earshot'>) => SlotEarshot;
/** 🚧 May a session pick this slot as an attribute of its own or carry it in from its world? @experimental */
export declare const slotPickable: (decl: Pick<AttributeSlotProps, 'pickable'>) => boolean;
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
export type SlotOrigin = 'code' | 'stored';
/** @experimental */
export interface AttributeSlotDecl extends AttributeSlotProps {
    readonly id: SlotId;
    /** Always present on a registered declaration: stated, or read off its `shape`. */
    readonly type: SlotType;
    readonly origin: SlotOrigin;
    /**
     * `stored` only: who wrote the row. The id already froze the author's
     * username as its owner segment; this is the account the row belongs to,
     * which is a different question the moment somebody is renamed.
     */
    readonly authorUserId?: number | string;
    /**
     * Retired: nothing new is written to it, everything already written stays.
     * `stored` only — a code slot leaves with its package instead.
     */
    readonly retired?: boolean;
}
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
export declare const SLOT_DISPLAY_KEYS: {
    readonly display: readonly ['label', 'examples'];
};
/**
 * Declare an attribute slot in code.
 *
 * The same two refusals every registry here makes: an id has exactly one owner,
 * and an identical re-declaration is a no-op (a dev-server reload re-running a
 * module must not throw). A *different* declaration under a claimed id throws
 * with both hashes named.
 * @internal
 */
export declare function defineAttributeSlot(id: SlotId, props: AttributeSlotProps): AttributeSlotDecl;
/**
 * The plugin-facing door — same registration, minus the ability to claim core's
 * namespace. A plugin that could redefine `core:slot/hp@1` would change what
 * every character's health means on the instance without appearing anywhere.
 * @experimental
 */
export declare function definePluginAttributeSlot(pluginId: string, id: SlotId, props: AttributeSlotProps): AttributeSlotDecl;
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
export declare function defineStoredAttributeSlot(id: SlotId, props: AttributeSlotProps, meta: {
    userId: number | string;
}): AttributeSlotDecl;
/** @internal */
export declare const getAttributeSlot: (id: SlotId) => AttributeSlotDecl | undefined;
/** @internal */
export declare const attributeSlots: () => AttributeSlotDecl[];
/** @internal */
export declare function _clearAttributeSlots(): void;
/**
 * Withdraw a package's slot declaration (plugin disabled, uninstalled or
 * upgraded). Values stay where they are and read as opaque data; a write is
 * refused as undeclared until the package declares it again. Only a code
 * declaration outside `core:` is withdrawn — a stored slot is somebody's and
 * leaves by retirement, and core's leave with the build.
 * @internal
 */
export declare function _withdrawAttributeSlot(id: SlotId): boolean;
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
export declare function retireAttributeSlot(id: SlotId): AttributeSlotDecl;
/** Undo a retirement. Writes are taken again; nothing about the stored values changed either way. @internal */
export declare function reviveAttributeSlot(id: SlotId): AttributeSlotDecl;
/**
 * The display-text findings of one slot declaration (R-20): `label` and
 * `description`, both optional — a slot may be listed by its id — but a blank
 * one is a label that draws nothing where the author meant to say something.
 * Run by the code door here and by the host's **write** door for an authored
 * slot (the app's `declareSlot` / `updateSlot`), never by a reload.
 * @internal
 */
export declare function attributeSlotDisplayFindings(id: SlotId, props: AttributeSlotProps): string[];
/** The `SlotType` each stat kind is stored and checked as. @experimental */
export declare function slotTypeForKind(kind: StatShapeKind): Exclude<SlotType, 'derived'>;
/**
 * The field a slot declared by `type` alone is read as — how every slot from
 * before stat shapes means what it always meant. `derived` has none: it is
 * computed, and what it computes is not declared as a field.
 * @experimental
 */
export declare function fieldForSlotType(type: SlotType): FieldDecl | undefined;
/** The shape a slot's value takes, as a field: its catalogue shape's, its own inline one, or its type's. @experimental */
export declare function slotField(decl: Pick<AttributeSlotProps, 'type' | 'shape'>): FieldDecl | undefined;
/** The catalogue shape a slot names, when it names one (an inline `FieldDecl` names none). @experimental */
export declare const slotStatShapeId: (decl: Pick<AttributeSlotProps, 'shape'>) => StatShapeId | undefined;
/** Which kind of stat a slot is; `undefined` for a derived slot, which is computed rather than kept. @experimental */
export declare const slotStatShapeKind: (decl: Pick<AttributeSlotProps, 'type' | 'shape'>) => StatShapeKind | undefined;
/**
 * What a field bounds, as the configuration keys a layer deviates from: a
 * number's `min`/`max`; a choice's options (`of`, or its `members`' keys); a
 * list's item count (`max` → `maxItems`), its items' closed set and length; a
 * line's length (`max` → `maxLength`).
 * @experimental
 */
export declare function fieldSlotConfig(field: FieldDecl | undefined): SlotConfig;
/**
 * The configuration in force for one owner: the declaration's own config with
 * each layer's deviations laid over it, nearest layer last.
 *
 * Merging keys rather than replacing objects is what makes "deviations only"
 * real — a session that raised a cap must not silently drop the enum options
 * the lorebook declared beside it.
 * @internal
 */
export declare function resolveSlotConfig(decl: AttributeSlotDecl, ...layers: readonly (SlotConfig | null | undefined)[]): SlotConfig;
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
export declare function checkSlotValue(decl: AttributeSlotDecl, value: SlotValue, config?: SlotConfig): string | null;
/** What a change does to the value already there. @experimental */
export type SlotChangeOp = 'set' | 'add' | 'remove';
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
    value: readonly SlotListItem[];
    /** Why the op did not apply, or `null` if it did. */
    refusal: string | null;
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
export declare function applyListOp(current: readonly SlotListItem[] | null | undefined, op: SlotChangeOp, items: readonly SlotListItem[], config?: SlotConfig): SlotListOpResult;
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
export declare const slotAppliesTo: (decl: AttributeSlotDecl, owner: SlotAppliesTo) => boolean;
/**
 * Which derivation computes this slot, or `undefined` when nothing does.
 *
 * One reader, because the question now has two spellings: an expression on the
 * declaration means `core:derive/liquid@1`, one of core's computations names
 * itself in `config`. A host, a client and a receipt each working that out for
 * themselves is how the three start disagreeing about which one ran.
 * @experimental
 */
export declare const slotDerivation: (decl: AttributeSlotDecl) => string | undefined;
//# sourceMappingURL=attributes.d.ts.map