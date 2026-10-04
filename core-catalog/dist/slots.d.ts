/**
 * The sprite set a cast member is shown in **for this session only**
 * (DESIGN-sprites §2.3) — "she changed clothes in this scene", which is play,
 * not canon. A set NAME on the speaker's card; the sprite tail reads it first,
 * before the cast member's `spriteSet` amendment and the card's default set.
 *
 * ⚠ Declared, and deliberately attached to NO genre's vocabulary: it is read
 * and written by core's sprite code (`valueOf` / `setValue` need only the
 * declaration), so it never appears as a bar, never renders in a state block
 * and never lights up a Chat session's state panel. Anchored to a message like
 * every value, so a branch or a swipe behind the change reads the old outfit.
 * @experimental
 */
export declare const spriteSetSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const hpSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const staminaSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const moodSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const trustSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * Where somebody or something is — a **premade stat**, not a built-in (owner
 * ruling 2026-09-26: "Location shouldn't be built in, other than a premade
 * field. World location state isn't a default. One genre might want
 * characters in different places.").
 *
 * It attaches to the world AND the cast, and a genre's sheet says which one
 * carries it (`SheetSlotEntry.appliesTo`): Adventure and Lair put it on the
 * world, where the scene is; a genre whose characters split up puts it
 * on each cast member. Nothing in core reads a location the sheet did not
 * declare.
 *
 * The value is words (`'the harbour'`) or a reference to a place entry of the
 * session's lorebook (`{ entryId }`, the lore reference items use, with no
 * held count), which a read names by the entry's title. ⚠ Not on a place:
 * a location is not somewhere else, and places get no default stat.
 * @experimental
 */
export declare const locationSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const timeOfDaySlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const weatherSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * 🚧 What somebody is carrying — or, on the world, what is lying about; on a
 * location, what is lying in that place (attributes phase 3a, 2026-09-26;
 * locations phase 4).
 *
 * ⚠ **Not a feature** (owner ruling 2026-09-25): a list-shaped stat with the
 * slug `inventory`, which a genre pipeline addresses on an owner and manages
 * however it likes. Items are words or references to lore entries — usually
 * `core:entry/item@1` ones — and a reference carries a held count
 * (`{ entryId, count }`). Nothing here enforces an item's supply; a pipeline
 * reads `core:query/item-supply@1` and decides.
 *
 * Seeded, and a genre opts in by listing it: Adventure and Lair carry it on
 * their sheets (phase 3b, which retired possessions-as-edges onto it), and a
 * session whose genre allows custom attributes may pick it. Chat does neither.
 * @experimental
 */
export declare const inventorySlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * The eight, in the order a genre declares them: the cast's four, then the
 * world's three, then the inventory both carry (phase 3b). A genre that wants
 * only some of them names those.
 * @internal
 */
export declare const ADVENTURE_SLOTS: readonly [import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl];
/**
 * The same eight as a **sheet** — one named bundle a genre points at, instead
 * of a list it repeats.
 *
 * Declared below the slots because a sheet gathers declarations that already
 * exist, and refuses an id nothing declares. It names them and no more: each
 * slot's own `config` and `default` are already the opening offer every layer
 * deviates from, and restating them here would be a second place to edit the
 * moment one of them moves.
 *
 * The adventure genre carries both this and `ADVENTURE_SLOTS`, which changes
 * nothing about what a session has — `genreSlots` dedups the union by id — and
 * is how the sheet arrives without anything that reads the list changing shape.
 * @internal
 */
export declare const ADVENTURE_SHEET: import("@serene-pub/sdk").AttributeSheetDecl;
/** @internal */
export declare const floorSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/** @experimental */
export declare const goldSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * The dungeon master's standing note — **the Nudge action's carriage**.
 *
 * A directive that produces no message has to land somewhere the next planner
 * call reads, and a session has exactly three such places: the transcript (a
 * message, which Nudge is defined not to write), the lorebook (a fact about
 * the world, which a nudge is not) and the state. So it is a world slot: the
 * planner takes `state` on its own port and the state block is in its prompt,
 * which makes the note a *read* control rather than a second store nothing
 * walks.
 *
 * ⏳ It is a note and not a queue: a second Nudge replaces the first, because
 * a slot holds one value. That is the honest shape for "what the master wants
 * next" and the wrong shape for a list of standing orders.
 * @internal
 */
export declare const directionSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * What one character has been told privately — **the Whisper action's
 * carriage**, on the same argument as `direction` above.
 *
 * **Heard by its holder alone** (`earshot: 'holder'`, lair pass R1,
 * 2026-09-28). `session-state@1` still carries every member's whisper, but the
 * host builds each prompt from the state as that prompt's speaker may hear
 * it: the whispered delver's own voice reads it, and no other prompt does —
 * not another delver's voice, not the planner, the scene or the state-keeper.
 * A person's view follows the data audience, not earshot: the stats widget
 * shows it to the session's owner and to whoever plays the whispered
 * character, and to nobody else.
 * @internal
 */
export declare const whisperSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * Lair's ten, in the order a genre declares them: the cast's four and the
 * whisper, then the world's location, floor, gold and direction, then the
 * inventory both carry (phase 3b).
 *
 * `timeOfDay` and `weather` are deliberately absent. A dungeon has neither —
 * a genre that declared them would draw two chips nothing under this floor can
 * change, and the state block would teach the narrator to describe a sky.
 * @internal
 */
export declare const LAIR_SLOTS: readonly [import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl];
/** The same ten as one named bundle — `ADVENTURE_SHEET`'s reasoning, applied. @internal */
export declare const LAIR_SHEET: import("@serene-pub/sdk").AttributeSheetDecl;
//# sourceMappingURL=slots.d.ts.map