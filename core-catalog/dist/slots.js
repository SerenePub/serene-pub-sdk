/**
 * The attribute slots core's own genres bring.
 *
 * A slot is declared once and attached where it is true (`defineAttributeSlot`,
 * SDK attributes.ts); a genre carries the declarations it wants so that a
 * session of that genre has a vocabulary and a session of any other genre has
 * none. The standard Chat genre declares nothing here on purpose — the
 * one-LLM-call rule holding at the surface, so a newcomer never sees a bar.
 *
 * ## `descriptor` is the contract; `label` and `description` are not
 *
 * `descriptor` is the sentence the MODEL reads in the state block a template
 * renders, so it is inside the content hash: editing one changes generation
 * everywhere the slot appears and is an `@N+1`, not a copyedit. `label` is what
 * a person reads on a bar and is stripped from the hash. The two are written
 * differently on purpose — a descriptor says what the number MEANS to somebody
 * writing the scene, a label just names it.
 *
 * ## Why the bounds live in `config` rather than in the type
 *
 * Every layer stores deviations only, so a declaration's `config` is the floor
 * a card, a lorebook or a session departs from. `max: 20` on health is core's
 * opening offer, not a rule: a card saying "Health, maximum 40" is one stored
 * key, and raising the declared default later reaches every owner who never
 * overrode it.
 */
import { defineAttributeSheet, defineAttributeSlot } from "@serene-pub/sdk";
// The catalogue first: a slot naming a stat shape nothing declares is refused.
import { choiceStatShape, listStatShape, numberStatShape } from "./statShapes.js";
/* ── Cast slots ─────────────────────────────────────────────────────────── */
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
export const spriteSetSlot = defineAttributeSlot("core:slot/sprite-set@1", {
    type: "text",
    label: { en: "Sprite set" },
    description: { en: "The sprite set this character is shown in, in this session." },
    descriptor: "The outfit or form this character is currently shown in, by the name of its sprite set.",
    appliesTo: ["cast"],
    // Core's sprite code keeps it; a session never picks it as a stat.
    pickable: false,
});
/** @experimental */
export const hpSlot = defineAttributeSlot("core:slot/hp@1", {
    shape: numberStatShape.id,
    label: { en: "Health" },
    description: { en: "How much harm this character can still take before they are in real trouble." },
    descriptor: "Health, as a number out of a maximum. Low health means visible injury and a body that is failing; at zero they are down and out of the scene.",
    appliesTo: ["cast"],
    config: { min: 0, max: 20 },
    default: 20,
});
/** @experimental */
export const staminaSlot = defineAttributeSlot("core:slot/stamina@1", {
    shape: numberStatShape.id,
    label: { en: "Stamina" },
    description: { en: "How much effort is left in them before they have to stop and rest." },
    descriptor: "Stamina, as a number out of a maximum. It falls with exertion, a forced march or a long fight, and comes back with rest. At zero they can act only slowly and badly.",
    appliesTo: ["cast"],
    config: { min: 0, max: 10 },
    default: 10,
});
/** @experimental */
export const moodSlot = defineAttributeSlot("core:slot/mood@1", {
    shape: choiceStatShape.id,
    label: { en: "Mood" },
    description: { en: "How this character is feeling right now." },
    descriptor: "Their current mood. It colours how they speak and what they are willing to do, and it changes with what the scene does to them.",
    appliesTo: ["cast"],
    config: { of: ["calm", "wary", "afraid", "angry", "hopeful"] },
    default: "calm",
});
/** @experimental */
export const trustSlot = defineAttributeSlot("core:slot/trust@1", {
    shape: numberStatShape.id,
    label: { en: "Trust" },
    description: { en: "How far this character trusts the player, from hostile to loyal." },
    descriptor: "How far they trust the player, from -5 (hostile, expecting betrayal) through 0 (a stranger) to 5 (loyal, will take a risk for them). It moves when the player earns or spends it, never on its own.",
    appliesTo: ["cast"],
    config: { min: -5, max: 5 },
    default: 0,
});
/* ── Premade, on whichever owner a sheet puts it ────────────────────────── */
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
export const locationSlot = defineAttributeSlot("core:slot/location@1", {
    type: "text",
    label: { en: "Location" },
    description: { en: "Where this is: on a character, where they are; on the world, where the scene is." },
    descriptor: "Where they are, by the name the world knows the place by — on a character, where that character is; on the world, where the scene is happening. It changes when they go somewhere else, and whatever is described of them should belong to it.",
    appliesTo: ["world", "cast"],
    config: { maxLength: 120, entryTypes: ["core:entry/location"] },
});
/* ── World slots ────────────────────────────────────────────────────────── */
/** @experimental */
export const timeOfDaySlot = defineAttributeSlot("core:slot/time-of-day@1", {
    shape: choiceStatShape.id,
    label: { en: "Time of day" },
    description: { en: "Where the story clock has got to." },
    descriptor: "Where the story clock has got to. It governs light, who is awake and what is open, and it moves forward with travel, rest and long work.",
    appliesTo: ["world"],
    config: { of: ["morning", "day", "dusk", "night"] },
    default: "morning",
});
/** @experimental */
export const weatherSlot = defineAttributeSlot("core:slot/weather@1", {
    shape: choiceStatShape.id,
    label: { en: "Weather" },
    description: { en: "What the sky is doing." },
    descriptor: "What the sky is doing. It belongs in the description of any scene out of doors, and it makes travel and visibility easier or harder.",
    appliesTo: ["world"],
    config: { of: ["clear", "fog", "rain", "storm", "snow"] },
    default: "clear",
});
/* ── Seeded, attached to no genre ───────────────────────────────────────── */
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
export const inventorySlot = defineAttributeSlot("core:slot/inventory@1", {
    shape: listStatShape.id,
    label: { en: "Inventory" },
    description: { en: "What this character is carrying, or what is lying about in the world or in a place." },
    descriptor: "What they are carrying, item by item, with how many of each when there is more than one. Anything not listed, they do not have. On the world, it is what is lying about for anybody to take; on a location, what is lying in that place.",
    // Phase 4 (2026-09-26): a location holds what is lying in it.
    appliesTo: ["cast", "world", "location"],
});
/**
 * The eight, in the order a genre declares them: the cast's four, then the
 * world's three, then the inventory both carry (phase 3b). A genre that wants
 * only some of them names those.
 * @internal
 */
export const ADVENTURE_SLOTS = [
    hpSlot,
    staminaSlot,
    moodSlot,
    trustSlot,
    locationSlot,
    timeOfDaySlot,
    weatherSlot,
    inventorySlot,
];
/**
 * A sheet entry for one slot — with `location` put on the WORLD, explicitly.
 *
 * `core:slot/location@1` attaches to the world and the cast alike (a premade
 * stat, 2026-09-26), so a sheet that means "where the scene is" has to say so:
 * these three genres always kept it on the world, and they still do, by
 * choice rather than by default.
 * @internal
 */
const onTheWorld = (id) => id === locationSlot.id ? { id, appliesTo: ["world"] } : { id };
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
export const ADVENTURE_SHEET = defineAttributeSheet("core:sheet/adventure@1", {
    label: { en: "Adventure" },
    description: {
        en: "What an adventuring character is carrying through a scene, and what the world is doing around them."
    },
    slots: ADVENTURE_SLOTS.map((slot) => onTheWorld(slot.id))
});
/* ── Lair ───────────────────────────────────────────────────────────────────
 *
 * The reverse crawler's own four, declared here beside Adventure's because a
 * slot is declared once and attached where it is true: Lair reuses the cast's
 * four and the world's `location` verbatim (a party is still a party) and adds
 * what a dungeon has that a road does not.
 */
/** @internal */
export const floorSlot = defineAttributeSlot("core:slot/floor@1", {
    shape: numberStatShape.id,
    label: { en: "Floor" },
    description: { en: "How deep into the dungeon the party has got." },
    descriptor: "How deep into the dungeon the party is, counting from 1 at the entrance. It goes up when they take a stair or a shaft down, and everything below is older, darker and less forgiving.",
    appliesTo: ["world"],
    config: { min: 1 },
    default: 1
});
/** @experimental */
export const goldSlot = defineAttributeSlot("core:slot/gold@1", {
    shape: numberStatShape.id,
    label: { en: "Gold" },
    description: { en: "What the party is carrying out with them." },
    descriptor: "What the party has taken from the dungeon so far, in coin. It rises when they loot something and falls when they spend or lose it; it never falls below nothing.",
    appliesTo: ["world"],
    config: { min: 0 },
    default: 0
});
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
export const directionSlot = defineAttributeSlot("core:slot/direction@1", {
    type: "text",
    label: { en: "Direction" },
    description: { en: "What the dungeon's master wants to happen next." },
    descriptor: "A standing instruction from whoever is running this place, addressed to the narrator and to nobody in the scene. Follow it when it can be followed, never quote it, and never let anybody in the scene notice it.",
    appliesTo: ["world"],
    config: { maxLength: 400 }
});
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
export const whisperSlot = defineAttributeSlot("core:slot/whisper@1", {
    type: "text",
    label: { en: "Whisper" },
    description: { en: "A private instruction from the dungeon's master to this character." },
    descriptor: "Something this character has been told privately, by a voice they cannot place. Act on it as if it were their own idea; never say it aloud, never explain it, and never attribute it to anybody.",
    appliesTo: ["cast"],
    config: { maxLength: 400 },
    earshot: "holder"
});
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
export const LAIR_SLOTS = [
    hpSlot,
    staminaSlot,
    moodSlot,
    trustSlot,
    whisperSlot,
    locationSlot,
    floorSlot,
    goldSlot,
    directionSlot,
    inventorySlot
];
/** The same ten as one named bundle — `ADVENTURE_SHEET`'s reasoning, applied. @internal */
export const LAIR_SHEET = defineAttributeSheet("core:sheet/lair@1", {
    label: { en: "Lair" },
    description: {
        en: "What a delving party is carrying through a dungeon, and what the dungeon's master has told them."
    },
    slots: LAIR_SLOTS.map((slot) => onTheWorld(slot.id))
});
/* ── Whodunit (plans/genres §4; U4) ──────────────────────────────────────────
 *
 * A mystery's ledger is small on purpose. Adventure's bars are absent and their
 * absence is the design: a suspect has no health, a drawing room has no
 * weather, and a genre that declared them would draw four chips nothing in a
 * conversation can move. What a detective actually tracks is who they doubt,
 * how much they have found, and whether the case is still open.
 */
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
export const suspicionSlot = defineAttributeSlot("core:slot/suspicion@1", {
    shape: numberStatShape.id,
    label: { en: "Suspicion" },
    description: { en: "How far the detective doubts this person, from cleared to all but certain." },
    descriptor: "How far the detective doubts them, from 0 (nothing points this way) through 5 (they have questions to answer) to 10 (all but named). It moves on what the scene actually showed — a contradiction, an alibi that held, something they were not supposed to know — and never on a hunch.",
    appliesTo: ["cast"],
    config: { min: 0, max: 10 },
    default: 0
});
/**
 * How much of the case the detective has turned up — the Search action's own
 * counter, raised by the state keeper when a search actually finds something.
 * @internal
 */
export const cluesFoundSlot = defineAttributeSlot("core:slot/clues-found@1", {
    shape: numberStatShape.id,
    label: { en: "Clues found" },
    description: { en: "How many pieces of the case the detective has turned up." },
    descriptor: "How many pieces of the case the detective has turned up so far. It rises by one when a scene genuinely produces something new — a letter, a contradiction, a witness who changes their story — and never for a search that came up empty.",
    appliesTo: ["world"],
    config: { min: 0 },
    default: 0
});
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
export const caseSlot = defineAttributeSlot("core:slot/case@1", {
    shape: choiceStatShape.id,
    label: { en: "Case" },
    description: { en: "Whether the case is still open, solved, or lost." },
    descriptor: "Whether the case is still open, solved or failed. It is open until the detective names somebody, and after that it is over: nothing in a scene changes it, and nobody in the scene decides it.",
    appliesTo: ["world"],
    config: { of: ["open", "solved", "failed"] },
    default: "open"
});
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
export const WHODUNIT_SLOTS = [
    suspicionSlot,
    locationSlot,
    cluesFoundSlot,
    caseSlot
];
/** The same four as one named bundle — `ADVENTURE_SHEET`'s reasoning, applied. @internal */
export const WHODUNIT_SHEET = defineAttributeSheet("core:sheet/whodunit@1", {
    label: { en: "Whodunit" },
    description: {
        en: "What the detective doubts, what they have found, and whether the case is still open."
    },
    slots: WHODUNIT_SLOTS.map((slot) => onTheWorld(slot.id))
});
//# sourceMappingURL=slots.js.map