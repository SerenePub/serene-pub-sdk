/**
 * The attribute slots core declares.
 *
 * A slot is declared once and attached where it is true (`defineAttributeSlot`,
 * SDK attributes.ts). 🚧 Since RF fix 8 (owner ruling 2026-10-23) no genre
 * carries any: a session's attributes are its rules' (a ruleset borrows
 * core's — Vis Itineris its level, class and health), and the host keeps the
 * place, the time and a genre tool's own state beside them
 * (`registry/hostState.ts`). Every slot here stays declared, because a
 * stored value may name it and a ruleset may borrow it.
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
import { defineAttributeSlot } from "@serene-pub/sdk"
// The catalogue first: a slot naming a stat shape nothing declares is refused.
import { choiceStatShape, listStatShape, numberStatShape, storyTimeStatShape } from "./statShapes.js"

/**
 * 🚧 A choice whose options read as words (round 2, owner walkthrough
 * 2026-10-15: the sheet said "hold", "taken-out"): the catalogue's choice
 * field (`choiceStatShape`) with each option's label beside its stored key
 * (`FieldDecl.members`). `of` stays the stored values and their order; the
 * slot's `config.of` repeats it as the floor a layer departs from.
 */
const labelledChoice = (options: ReadonlyArray<readonly [key: string, label: string]>) =>
	({
		type: "enum",
		of: options.map(([key]) => key),
		members: options.map(([key, label]) => ({ key, label: { en: label } }))
	}) as const

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
	descriptor:
		"The outfit or form this character is currently shown in, by the name of its sprite set.",
	appliesTo: ["cast"],
	// Core's sprite code keeps it; a session never picks it as a stat.
	pickable: false,
})

/** @experimental */
export const hpSlot = defineAttributeSlot("core:slot/hp@1", {
	shape: numberStatShape.id,
	label: { en: "Health" },
	description: { en: "How much harm this character can still take before they are in real trouble." },
	descriptor:
		"Health, as a number out of a maximum. Low health means visible injury and a body that is failing; at zero they are down and out of the scene.",
	appliesTo: ["cast"],
	config: { min: 0, max: 20 },
	default: 20,
	// 🚧 At a table that keeps no numbers (PLAN-dc-after-walk2 Q2-3, owner
	// ruling ★3): health in words, never "10/10".
	words: [
		{ upTo: 0, label: { en: "At death's door" } },
		{ upTo: 0.5, label: { en: "Badly hurt" } },
		{ upTo: 0.999, label: { en: "Hurt" } },
		{ upTo: 1, label: { en: "Unhurt" } },
	],
})

/** @experimental */
export const staminaSlot = defineAttributeSlot("core:slot/stamina@1", {
	shape: numberStatShape.id,
	label: { en: "Stamina" },
	description: { en: "How much effort is left in them before they have to stop and rest." },
	descriptor:
		"Stamina, as a number out of a maximum. It falls with exertion, a forced march or a long fight, and comes back with rest. At zero they can act only slowly and badly.",
	appliesTo: ["cast"],
	config: { min: 0, max: 10 },
	default: 10,
})

/** @experimental */
export const moodSlot = defineAttributeSlot("core:slot/mood@1", {
	shape: choiceStatShape.id,
	label: { en: "Mood" },
	description: { en: "How this character is feeling right now." },
	descriptor:
		"Their current mood. It colours how they speak and what they are willing to do, and it changes with what the scene does to them.",
	appliesTo: ["cast"],
	config: { of: ["calm", "wary", "afraid", "angry", "hopeful"] },
	default: "calm",
})

/** @experimental */
export const trustSlot = defineAttributeSlot("core:slot/trust@1", {
	shape: numberStatShape.id,
	label: { en: "Trust" },
	description: { en: "How far this character trusts the player, from hostile to loyal." },
	descriptor:
		"How far they trust the player, from -5 (hostile, expecting betrayal) through 0 (a stranger) to 5 (loyal, will take a risk for them). It moves when the player earns or spends it, never on its own.",
	appliesTo: ["cast"],
	config: { min: -5, max: 5 },
	default: 0,
})

/* ── Premade, on whichever owner a sheet puts it ────────────────────────── */

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
export const locationSlot = defineAttributeSlot("core:slot/location@1", {
	type: "text",
	label: { en: "Location" },
	description: { en: "Where this is: on a character, where they are; on the world, where the scene is." },
	descriptor:
		"Where they are, by the name the world knows the place by — on a character, where that character is; on the world, where the scene is happening. It changes when they go somewhere else, and whatever is described of them should belong to it.",
	appliesTo: ["world", "cast"],
	config: { maxLength: 120, entryTypes: ["core:entry/location"] },
})

/* ── World slots ────────────────────────────────────────────────────────── */

/** @experimental */
export const timeOfDaySlot = defineAttributeSlot("core:slot/time-of-day@1", {
	shape: choiceStatShape.id,
	label: { en: "Time of day" },
	description: { en: "Where the story clock has got to." },
	descriptor:
		"Where the story clock has got to. It governs light, who is awake and what is open, and it moves forward with travel, rest and long work.",
	appliesTo: ["world"],
	config: { of: ["morning", "day", "dusk", "night"] },
	default: "morning",
})

/** @experimental */
export const weatherSlot = defineAttributeSlot("core:slot/weather@1", {
	shape: choiceStatShape.id,
	label: { en: "Weather" },
	description: { en: "What the sky is doing." },
	descriptor:
		"What the sky is doing. It belongs in the description of any scene out of doors, and it makes travel and visibility easier or harder.",
	appliesTo: ["world"],
	config: { of: ["clear", "fog", "rain", "storm", "snow"] },
	default: "clear",
})

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
	descriptor:
		"What they are carrying, item by item, with how many of each when there is more than one. Anything not listed, they do not have. On the world, it is what is lying about for anybody to take; on a location, what is lying in that place.",
	// Phase 4 (2026-09-26): a location holds what is lying in it.
	appliesTo: ["cast", "world", "location"],
})

/* ── The shared vocabulary's own (A19, R27, R28; 2026-10-20) ──────────── */

/**
 * 🚧 **Currency** — what a character has to spend, in whatever coin the
 * world uses (R28: the shared vocabulary adds it). A number, never below
 * nothing. A ruleset that calls it something else ("Gold") gives the member
 * its own title; the slug stays `currency`.
 * @experimental
 */
export const currencySlot = defineAttributeSlot("core:slot/currency@1", {
	shape: numberStatShape.id,
	label: { en: "Currency" },
	description: { en: "What this character has to spend, in whatever coin the world uses." },
	descriptor:
		"What they have to spend, counted in the world's own coin. It rises when they are paid or find some and falls when they buy, pay or lose; it never falls below nothing.",
	appliesTo: ["cast"],
	config: { min: 0 },
	default: 0,
})

/**
 * 🚧 **Conditions** — what ails or marks a character, as a list: hurt,
 * tired, poisoned, inspired, each in a word or two (A19: the shared
 * vocabulary's; a session may attach a ruleset's conditions repertoire to
 * it, `config.repertoire`). Not a ruleset's repertoire itself — that names
 * the pieces' shape; this is where a character's are kept.
 * @experimental
 */
export const conditionsSlot = defineAttributeSlot("core:slot/conditions@1", {
	shape: listStatShape.id,
	label: { en: "Conditions" },
	description: { en: "What ails or marks this character right now — hurt, tired, inspired." },
	descriptor:
		"What is true of them for now and will pass: hurt, tired, poisoned, inspired. Each shapes what they can do and how they feel until it ends.",
	appliesTo: ["cast"],
})

/**
 * 🚧 **Relationships** — how this character stands with the others, one
 * line each (R28: the shared vocabulary adds it). Words, not the story
 * graph: the graph is the lorebook's record of who knows whom; this is what
 * a sheet shows of it.
 * @experimental
 */
export const relationshipsSlot = defineAttributeSlot("core:slot/relationships@1", {
	shape: listStatShape.id,
	label: { en: "Relationships" },
	description: { en: "How this character stands with the others, one line each." },
	descriptor:
		"How they stand with the people around them, one line each: who they trust, who they owe, who they cannot stand. It changes when the story gives them reason.",
	appliesTo: ["cast"],
})

/**
 * 🚧 **Ways out** — the ways out of a place, as a list: a door, a path, a
 * stair, and how each stands (A19: the shared vocabulary's; a session may
 * attach a ruleset's exits repertoire to it).
 * @experimental
 */
export const waysOutSlot = defineAttributeSlot("core:slot/ways-out@1", {
	shape: listStatShape.id,
	label: { en: "Ways out" },
	description: { en: "The ways out of this place — a door, a path, a stair — and how each stands." },
	descriptor:
		"The ways out of this place and how each looks and stands. A closed or locked way is not crossed without dealing with it; a hidden one is not known until found.",
	appliesTo: ["location"],
})

/**
 * 🚧 **Notes** — anything worth remembering about a place, in words (A19:
 * the shared vocabulary's).
 * @experimental
 */
export const notesSlot = defineAttributeSlot("core:slot/notes@1", {
	type: "text",
	label: { en: "Notes" },
	description: { en: "Anything worth remembering about this place." },
	descriptor: "Things worth remembering about this place. Keep them in mind; they are not instructions.",
	appliesTo: ["location"],
	config: { maxLength: 2000 },
})

/*
 * 🚧 Retired (RF fix 8, 2026-10-23): `STORY_SLOTS` and `STORY_SHEET` — the
 * eight Story carried (health, stamina, mood, trust, location, time of day,
 * weather, inventory). A Story session's attributes are its rules'; the
 * place is the host's, the time its story clock. A value stored on one of
 * them is carried onto the rules' own attribute of the same tag, else into
 * the session's notes (data upgrade 0126).
 */

/* ── Lair ───────────────────────────────────────────────────────────────────
 *
 * The Lair plays the shared vocabulary (PROPOSAL-lair-rewrite D8, 2026-10-21)
 * and declares no stats of its own beyond its game master's two tools — the
 * standing direction (Nudge) and the whisper (heard by its holder alone).
 * `floor` and `gold` were the old Lair's own; they stay declared below, because
 * a stored value may still name them (the app's data upgrade carries them
 * forward), but no genre lists them.
 */

/** @internal */
export const floorSlot = defineAttributeSlot("core:slot/floor@1", {
	shape: numberStatShape.id,
	label: { en: "Floor" },
	description: { en: "How deep into the dungeon the party has got." },
	descriptor:
		"How deep into the dungeon the party is, counting from 1 at the entrance. It goes up when they take a stair or a shaft down, and everything below is older, darker and less forgiving.",
	appliesTo: ["world"],
	config: { min: 1 },
	default: 1
})

/** @experimental */
export const goldSlot = defineAttributeSlot("core:slot/gold@1", {
	shape: numberStatShape.id,
	label: { en: "Gold" },
	description: { en: "What the party is carrying out with them." },
	descriptor:
		"What the party has taken from the dungeon so far, in coin. It rises when they loot something and falls when they spend or lose it; it never falls below nothing.",
	appliesTo: ["world"],
	config: { min: 0 },
	default: 0
})

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
	descriptor:
		"A standing instruction from whoever is running this place, addressed to the narrator and to nobody in the scene. Follow it when it can be followed, never quote it, and never let anybody in the scene notice it.",
	appliesTo: ["world"],
	config: { maxLength: 400 }
})

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
export const whisperSlot = defineAttributeSlot("core:slot/whisper@1", {
	type: "text",
	label: { en: "Whisper" },
	description: { en: "A private instruction from the dungeon's master to this character." },
	descriptor:
		"Something this character has been told privately, by a voice they cannot place. Act on it as if it were their own idea; never say it aloud, never explain it, and never attribute it to anybody.",
	appliesTo: ["cast"],
	config: { maxLength: 400 },
	earshot: "holder"
})

/*
 * 🚧 Retired (RF fix 8): `LAIR_SLOTS` and `LAIR_SHEET`. The party's
 * attributes are the rules'; the whisper and the standing direction above
 * are the host's tool state for the Lair, the room the scene's place.
 */

/* ── Dungeon Crawler 🚧 ────────────────────────────────────────────────────
 *
 * PLAN-dungeon-crawler-2026-10-14. A player's character is a **player seat**
 * (`player_seat` owner, facet `cast`), so the sheet's character stats attach
 * to the cast — a companion carries them too. Health, location and what they
 * carry are the premade slots (`hp`, `location` on the cast — the party may
 * split — and `inventory`, which is the plan's "gear"); the rest are the
 * genre's own. The session's own four sit on the world: the genre keeps its
 * time in a slot rather than the lorebook calendar (★C), and the interview's
 * three answers are state so a retake undoes them like any write.
 */

/** 🚧 How experienced a character is. @experimental */
export const levelSlot = defineAttributeSlot("core:slot/level@1", {
	shape: numberStatShape.id,
	label: { en: "Level" },
	description: { en: "How experienced this character is. It rises as they survive and achieve things." },
	descriptor:
		"The character's level, from 1 for a beginner upward. A higher level means more skill, more health and abilities that do more; it rises only when the character has earned it.",
	appliesTo: ["cast"],
	config: { min: 1 },
	default: 1
})

/**
 * 🚧 What kind of adventurer a character is — fighter, scout, hedge-witch.
 * Qualified (`character-class`, R3): the bare word is a programming term.
 * @experimental
 */
export const characterClassSlot = defineAttributeSlot("core:slot/character-class@1", {
	type: "text",
	label: { en: "Class" },
	description: { en: "What kind of adventurer this character is." },
	descriptor:
		"The character's class or calling — what they are trained for and how they solve problems. It shapes which abilities they have and what they are good and bad at.",
	appliesTo: ["cast"],
	config: { maxLength: 60 }
})

/** 🚧 What a character can do that others cannot. @experimental */
export const abilitiesSlot = defineAttributeSlot("core:slot/abilities@1", {
	shape: listStatShape.id,
	label: { en: "Abilities" },
	description: { en: "The special things this character can do." },
	descriptor:
		"The character's abilities, one per line: spells, techniques, tricks and talents they can actually use. Anything not listed, they cannot do reliably.",
	appliesTo: ["cast"]
})

/**
 * 🚧 What a character does on a round its player skipped (feature 17, D11):
 * the Planner reads it for every seat that did not declare.
 * @experimental
 */
export const standingOrderSlot = defineAttributeSlot("core:slot/standing-order@1", {
	// Solo play never asks it (owner ruling 2026-10-17): one seat has no one to be away from.
	minSeats: 2,
	shape: labelledChoice([["hold", "Hold"], ["follow", "Follow"], ["fight", "Fight"], ["flee", "Flee"]]),
	label: { en: "Standing order" },
	description: { en: "What this character does on a round their player skips." },
	descriptor:
		"What this character does when their player has not said what they do this round: hold their position, follow the party, fight whatever threatens them, or flee from danger.",
	appliesTo: ["cast"],
	config: { of: ["hold", "follow", "fight", "flee"] },
	default: "hold"
})

/**
 * 🚧 Whether a character is still in the adventure (feature 13): **alive**,
 * **taken out** (down and out of the fight until a rest — Gentle's death's
 * door) or **dead** (Fair and Brutal's). Set only by the story turn's
 * death's-door roll and by Rest (`genres/dungeon-crawler/death.ts`,
 * `rest.ts`), never by the Planner directly — no death without a roll. A
 * slot rather than the seat's removal: the seat stays the player's, and a
 * retake of the turn takes the death back with everything else it wrote.
 * @experimental
 */
export const fateSlot = defineAttributeSlot("core:slot/fate@1", {
	// 🚧 `dying` (PLAN-dc-after-walk2 Q3-8, the walk's N15: the sheet said
	// Alive while death saves ran): at death's door, rolling death saves.
	shape: labelledChoice([["alive", "Alive"], ["dying", "Dying"], ["taken-out", "Taken out"], ["dead", "Dead"]]),
	label: { en: "Fate" },
	description: { en: "Whether this character is alive, dying, taken out, or dead." },
	descriptor:
		"Whether the character is still in the adventure. Alive: they act as usual. Dying: they lie at death's door rolling death saves, and can do nothing until healed. Taken out: they are down and out of the fight, alive, until the party rests. Dead: they are gone, and nobody plays them any more.",
	appliesTo: ["cast"],
	config: { of: ["alive", "dying", "taken-out", "dead"] },
	default: "alive"
})

/**
 * 🚧 The crawl's own time (★C): a story time on the world, advanced by the
 * Planner on a rest or a journey. Not the **story clock** — that one walks
 * the lorebook's calendar, and this genre has no lorebook.
 * @experimental
 */
export const crawlTimeSlot = defineAttributeSlot("core:slot/crawl-time@1", {
	shape: storyTimeStatShape.id,
	label: { en: "Time" },
	description: { en: "How much time has passed in the adventure." },
	descriptor:
		"The date and time the adventure has reached. It moves forward when the party rests, travels or waits, and never goes backward.",
	appliesTo: ["world"]
})

/** 🚧 How hard the world pushes back (feature 1). @experimental */
export const difficultySlot = defineAttributeSlot("core:slot/difficulty@1", {
	shape: labelledChoice([["gentle", "Gentle"], ["fair", "Fair"], ["brutal", "Brutal"]]),
	label: { en: "Difficulty" },
	description: { en: "How hard the world pushes back." },
	descriptor:
		"How hard the adventure is. Gentle: danger is real but forgiving, and a character at death's door is taken out rather than killed. Fair: choices have consequences and death needs a failed roll. Brutal: the world is dangerous and does not pull punches.",
	appliesTo: ["world"],
	config: { of: ["gentle", "fair", "brutal"] },
	default: "fair"
})

/** 🚧 Story only, or numbers and dice (feature 1). @experimental */
export const statModeSlot = defineAttributeSlot("core:slot/stat-mode@1", {
	shape: labelledChoice([["story", "Story only"], ["dice", "Numbers and dice"]]),
	// ⏳ Superseded 2026-10-17 by the session's strictness (How strict);
	// kept so older sessions still read. Never offered in a picker.
	label: { en: "Story or dice (older sessions)" },
	description: { en: "Set before strictness lived on the session; How strict decides now." },
	pickable: false,
	descriptor:
		"How outcomes are decided. Story: the story decides what happens, with no numbers shown. Dice: risky actions are rolled, the stakes are said before the roll, and the numbers count.",
	appliesTo: ["world"],
	config: { of: ["story", "dice"] },
	default: "dice"
})

/** 🚧 Whether the players know what they are after (feature 1). @experimental */
export const goalModeSlot = defineAttributeSlot("core:slot/goal-mode@1", {
	shape: labelledChoice([["shared", "Shared"], ["secret", "Secret"]]),
	label: { en: "Goal" },
	description: { en: "Whether the goal was shaped together or is kept secret." },
	descriptor:
		"Whether the players know the adventure's goal. Shared: they know it and it is written in the journal. Secret: only the planner knows it, and the players discover it through play.",
	appliesTo: ["world"],
	config: { of: ["shared", "secret"] },
	default: "shared"
})

/*
 * 🚧 Retired (RF fix 8): `DUNGEON_CRAWLER_SLOTS` and `DUNGEON_CRAWLER_SHEET`.
 * A hero's attributes are the rules' — Vis Itineris's health, level, class,
 * abilities, skills and spell points among them, never the genre's; the
 * crawl's standing order, fate, death saves, time, difficulty, goal and its
 * ⏳ piece lists are the host's tool state for it (`registry/hostState.ts`).
 * `abilities`, `inventory` and ⏳ `stat-mode` are no longer kept at all.
 */
