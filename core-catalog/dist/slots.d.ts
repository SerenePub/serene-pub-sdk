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
 * carries it (`SheetSlotEntry.appliesTo`): Adventure, Lair and Whodunit put it
 * on the world, where the scene is; a genre whose characters split up puts it
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
 * The stats widget still shows it to the person: a person's view follows the
 * data audience, not earshot.
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
/**
 * How far the detective doubts one suspect, 0 to 10.
 *
 * ⚠ **It is the detective's reading, not the fiction's fact.** Nothing in this
 * genre couples suspicion to guilt — the culprit may end the case at 1 and an
 * innocent at 9 — and the state keeper is told to move it from what the scene
 * showed, never from what it knows. A slot that tracked guilt would be the
 * answer on a bar.
 * @internal
 */
export declare const suspicionSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * How much of the case the detective has turned up — the Search action's own
 * counter, raised by the state keeper when a search actually finds something.
 * @internal
 */
export declare const cluesFoundSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * Whether the case is still open — **the one slot the state keeper may not
 * touch.**
 *
 * `open` until somebody accuses, then `solved` or `failed` for good. Only
 * `core:spec/whodunit-verdict` writes it, and it writes it once: a keeper that
 * could set this would be a model ending the game between two messages, and
 * *Accuse*'s `enabledWhen` reads it precisely so the button goes quiet the
 * moment a verdict lands.
 *
 * ⚠ **The bare noun, and it is deliberate** (R3 asks for a qualifier). The
 * values are what make it read — *the case is open*, *the case is solved* —
 * and `case-status` would name the column rather than the thing. It is
 * declared once, in one genre, and the enum is its whole vocabulary. Ruled
 * 2026-09-17, in the same breath as the genre's `difficulty` → `candour`
 * rename: the bare noun is accepted **here**, on the strength of the enum, and
 * that ruling is about this slot and nothing else.
 * @internal
 */
export declare const caseSlot: import("@serene-pub/sdk").AttributeSlotDecl;
/**
 * Whodunit's four: the suspects' suspicion, then the scene, the count and the
 * verdict.
 *
 * `location` is Adventure's, reused verbatim — a mystery moves between the
 * study and the terrace exactly as an adventure moves between towns, and every
 * prompt in this genre renders `{{location}}`, which is read off this slot
 * before it falls back to the planner's hint.
 * @internal
 */
export declare const WHODUNIT_SLOTS: readonly [import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl, import("@serene-pub/sdk").AttributeSlotDecl];
/** The same four as one named bundle — `ADVENTURE_SHEET`'s reasoning, applied. @internal */
export declare const WHODUNIT_SHEET: import("@serene-pub/sdk").AttributeSheetDecl;
//# sourceMappingURL=slots.d.ts.map