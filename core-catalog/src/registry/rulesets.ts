/**
 * 🚧 The rulesets core ships.
 *
 * **Freeform** (`core:ruleset/freeform@1`; _Story_ until 2026-10-19, when
 * the name went to the Story genre) is the prose ruleset: every lorebook's
 * default and the landing place for anything another ruleset cannot read.
 * It keeps no numbers and rolls no dice — what people carry, what ails them,
 * the ways out of a place and what is worth remembering are pieces told in
 * words. Its degrees exist only as the words a scene may use for how things
 * went, and it keeps time by the scene.
 *
 * **Wherewithal** (`core:ruleset/wherewithal@1`, 2026-10-22) is the
 * diceless one: pools spent, mettle weighed, bonds and troubles — original
 * to Serene Pub; its parts in `rulesets/wherewithal/`.
 *
 * **Vis Itineris** (`core:ruleset/vis-itineris@1`) is the rigorous d20 ruleset, built
 * on the System Reference Document 5.2 (CC-BY-4.0) with its own options as
 * ruleset settings and a _Classic_ preset; its parts live in
 * `rulesets/vis-itineris/`, its licence notice beside its compendium data.
 *
 * Declared through the same `defineRuleset` a plugin uses: nothing in core
 * keys on these ids.
 */
import { COMMON_VOCABULARY_ID, defineRepertoire, defineRuleset, vocabulary, type AttributeSlotDecl } from "@serene-pub/sdk"
// The slots first: a ruleset naming a stat nothing declares is refused.
import {
	characterClassSlot,
	conditionsSlot,
	currencySlot,
	hpSlot,
	inventorySlot,
	levelSlot,
	locationSlot,
	moodSlot,
	notesSlot,
	relationshipsSlot,
	timeOfDaySlot,
	waysOutSlot,
	weatherSlot
} from "./slots.js"
import {
	visItinerisBackgroundSlot,
	visItinerisCharismaSlot,
	visItinerisConstitutionSlot,
	visItinerisDeathFailuresSlot,
	visItinerisDeathSuccessesSlot,
	visItinerisDexteritySlot,
	visItinerisDyingSlot,
	visItinerisHeroPointsSlot,
	visItinerisHitDiceSlot,
	visItinerisHpMaxSlot,
	visItinerisIntelligenceSlot,
	visItinerisSaveTrainingSlot,
	visItinerisSkillExpertiseSlot,
	visItinerisSkillTrainingSlot,
	visItinerisSpeciesSlot,
	visItinerisSpeedSlot,
	visItinerisSpellPointsSlot,
	visItinerisStrengthSlot,
	visItinerisTempHpSlot,
	visItinerisWisdomSlot,
	visItinerisWoundedSlot
} from "../rulesets/vis-itineris/slots.js"
import { VIS_ITINERIS_RULESET_ID } from "../rulesets/vis-itineris/index.js"
import { WHEREWITHAL_RULESET_ID, wherewithalFavourSlot, wherewithalNerveSlot, wherewithalProvisionsSlot } from "../rulesets/wherewithal/index.js"
// 🚧 Both in the seven sections over core's functions (2026-10-23, lane A2); importing them registers the functions first.
import { VIS_ITINERIS_RULESET } from "../rulesets/vis-itineris/ruleset.js"
import { WHEREWITHAL_RULESET } from "../rulesets/wherewithal/ruleset.js"

/**
 * 🚧 **The shared vocabulary** — `core:vocabulary/common@1` (A19, R27, R28;
 * 2026-10-20): the words core's rulesets share, as one declared object whose
 * members ARE the attribute slot declarations, grouped by the owner they
 * attach to. Built from what Freeform and Vis Itineris already share
 * (health, mood, level, class — the borrowed stats) plus the common lists
 * and currency and relationships (R28), and the world's and a place's own.
 * Both core rulesets play it (`plays`), so a reference to
 * `rulesets.common.cast.health` fits either — and Freeform can hold things
 * and conditions.
 *
 * ⚠ Not the host's per-session vocabulary of tracked slots (the app's
 * `vocabularyFor`): this one is a shared set of words to reference — say
 * "the shared vocabulary" where the two could meet.
 * @experimental
 * @ruling A19, R27, R28
 */
export const commonVocabulary = vocabulary(COMMON_VOCABULARY_ID, {
	world: { location: locationSlot, time: timeOfDaySlot, weather: weatherSlot },
	cast: {
		health: hpSlot,
		mood: moodSlot,
		level: levelSlot,
		class: characterClassSlot,
		currency: currencySlot,
		things: inventorySlot,
		conditions: conditionsSlot,
		relationships: relationshipsSlot
	},
	location: { waysOut: waysOutSlot, notes: notesSlot }
})

/** 🚧 What a character carries or a place holds. @experimental */
export const freeformThings = defineRepertoire("things", {
	tags: ["gear"],
	label: { en: "Things" },
	description: { en: "What a character carries, or what lies in a place." },
	prose:
		"Things held: what someone has on them or what lies about a place. Having a thing makes some actions possible and others easier; losing it takes that away.",
	entryable: true,
	appliesTo: ["cast", "location"]
})

/** 🚧 What ails or marks someone, for as long as it lasts. @experimental */
export const freeformConditions = defineRepertoire("conditions", {
	tags: ["condition"],
	label: { en: "Conditions" },
	description: { en: "What ails or marks a character — hurt, tired, inspired — and for how long." },
	piece: {
		type: "object",
		fields: {
			lasts: {
				type: "string",
				label: { en: "Lasts" },
				description: { en: "How long it lasts, in story time — “until morning”, “three days”." }
			}
		}
	},
	prose:
		"Conditions on someone: states that shape what they can do and how they feel until they pass. Honour them in what the character attempts and how it goes.",
	entryable: true,
	renderDepth: "summary"
})

/** 🚧 The ways out of a place, held by the place they lead from. @experimental */
export const freeformExits = defineRepertoire("exits", {
	tags: ["exit"],
	label: { en: "Exits" },
	description: { en: "The ways out of a place — a door, a path, a stair — and how each one stands." },
	piece: {
		type: "object",
		fields: {
			state: {
				type: "enum",
				of: ["open", "closed", "locked", "hidden", "broken"],
				members: [
					{ key: "open", label: { en: "Open" } },
					{ key: "closed", label: { en: "Closed" } },
					{ key: "locked", label: { en: "Locked" } },
					{ key: "hidden", label: { en: "Hidden" } },
					{ key: "broken", label: { en: "Broken" } }
				],
				label: { en: "State" }
			}
		}
	},
	prose:
		"Exits from this place: how each way out looks and stands. A closed or locked way is not crossed without dealing with it; a hidden one is not known until found.",
	relational: true,
	appliesTo: ["location"],
	renderDepth: "index"
})

/** 🚧 What is worth remembering, in a line or two. @experimental */
export const freeformNotes = defineRepertoire("notes", {
	tags: ["note"],
	label: { en: "Notes" },
	description: { en: "Anything worth remembering about a character or a place." },
	prose: "Notes: things worth remembering. Keep them in mind; they are not instructions.",
	renderDepth: "index"
})

/**
 * 🚧 Freeform — the prose ruleset. No numbers, no dice; pieces in words.
 * Was `core:ruleset/story@1` ("Story") until 2026-10-19: the word went to
 * the Story genre (NOMENCLATURE R1), and the app's migration re-keys the
 * stored ids (`FREEFORM_RENAMED_FROM`).
 * @experimental
 */
export const freeformRuleset = defineRuleset("core:ruleset/freeform@1", {
	name: { en: "Freeform" },
	description: {
		en: "No numbers: words only, the narrator decides."
	},
	voice: {
		prose:
			"Freeform keeps no numbers. What people carry, what ails them, the ways out of a place and what is worth remembering are told in words; outcomes follow what the scene makes likely, and nothing is rolled.",
		mechanics:
			"Freeform has nothing to compute. Read the sheet as description: a condition shapes what someone can do, a thing in hand makes some actions possible, and a closed exit stays closed until the story opens it.",
		scripts:
			"Freeform runs no scripts and rolls no dice. Decide outcomes from the fiction: what is established, what the characters are trying, what it costs. Say plainly when something goes badly."
	},
	conventions: {
		degrees: {
			bands: [
				{ id: "disaster", label: { en: "It goes badly wrong" }, five: "crit-fail" },
				{ id: "setback", label: { en: "It fails" }, five: "fail" },
				{ id: "cost", label: { en: "It works, at a cost" }, five: "partial" },
				{ id: "works", label: { en: "It works" }, five: "success" },
				{ id: "triumph", label: { en: "It goes better than hoped" }, five: "crit" }
			]
		},
		time: { unit: "scene" }
	},
	// 🚧 No attributes (RF fix 8, owner 2026-10-23): words only — a session on
	// Freeform says "This session's rules declare no attributes". Mood was
	// borrowed here once; a value it held is carried into the session's notes.
	stats: [],
	repertoires: [freeformThings, freeformConditions, freeformExits, freeformNotes],
	// 🚧 The shared vocabulary (A19, 2026-10-20): health, things, conditions … as common words.
	plays: [commonVocabulary]
})

/**
 * 🚧 Vis Itineris — the force of the journey: heroes whose deeds move the
 * world. Its stats: core's health, level and class (borrowed — every genre
 * reads them), then its own (`rulesets/vis-itineris/slots.ts`), which it
 * owns by listing them: pickable only in its sessions.
 * @experimental
 */
export const visItinerisRuleset = defineRuleset(VIS_ITINERIS_RULESET_ID, {
	// 🚧 In the seven sections (2026-10-23): what it plays by is unchanged (`catalogueParity`).
	...VIS_ITINERIS_RULESET,
	// 🚧 The shared vocabulary (A19, 2026-10-20). It keeps no currency stat of its own, so there is nothing to retitle.
	plays: [commonVocabulary]
})

/**
 * 🚧 **Wherewithal** — core's diceless ruleset (2026-10-22, PLAN-rulesets-
 * authoring D3, ruling R3): nothing is rolled. A risk is carried by spending
 * nerve, favour or provisions (`bid`), a contest weighs mettle against mettle
 * (`compare`), and the rest is the table's judgement (`none`, the default).
 * Bonds steady mettle, troubles weigh on it, boons restore a pool. Its own
 * pools, then core's mood (borrowed); its parts in `rulesets/wherewithal/`.
 * @experimental
 */
export const wherewithalRuleset = defineRuleset(WHEREWITHAL_RULESET_ID, {
	// 🚧 In the seven sections (2026-10-23): what it plays by is unchanged (`catalogueParity`).
	...WHEREWITHAL_RULESET,
	// 🚧 The shared vocabulary (A19): mood, things, conditions … as common words.
	plays: [commonVocabulary]
})

/**
 * 🚧 Every ruleset core ships, in the order a picker lists them — what a
 * shipped catalogue names (conformance C38) and the Lair's rules table reads.
 * Never a template (`RULESET_TEMPLATES`).
 * @experimental
 */
export const CORE_RULESETS = Object.freeze([freeformRuleset, visItinerisRuleset, wherewithalRuleset])

/**
 * 🚧 The ruleset id Freeform carried before 2026-10-19 — what the app's
 * migration re-keys stored rows from (lorebooks, sessions, entry types
 * `core:entry/story.<repertoire>@1` → `core:entry/freeform.<repertoire>@1`,
 * repertoire addresses `core:ruleset/story@1#things`). Never registered.
 * @experimental
 */
export const FREEFORM_RENAMED_FROM = Object.freeze({
	ruleset: "core:ruleset/story@1",
	primer: "core:primer/story@1",
	entryTypePrefix: "core:entry/story.",
} as const)

/**
 * A ruleset read as words: the shared vocabulary it plays, with its own
 * stats beside them — each member the slot declaration itself, typed.
 */
const wordsOf = <Own extends Record<string, AttributeSlotDecl>>(id: string, ownCast: Own) =>
	Object.freeze({
		id,
		world: commonVocabulary.world,
		cast: Object.freeze({ ...commonVocabulary.cast, ...ownCast }) as typeof commonVocabulary.cast & Own,
		location: commonVocabulary.location
	})

/**
 * 🚧 **Core's rulesets as vocabulary objects** (A19, R27; 2026-10-20) — the
 * way core's own code, and an author's, names an attribute: by its
 * declaration, typed, never by a string (R30).
 *
 * ```ts
 * rulesets.common.cast.health                  // the shared health slot — fits any ruleset that plays it
 * rulesets.core.visItineris.cast.spellPoints   // Vis Itineris's own — ruleset-specific
 * rulesets.core.freeform.cast.things           // what Freeform plays for things (the shared one)
 * ```
 *
 * `common` is the shared vocabulary (`core:vocabulary/common@1`); each core
 * ruleset reads as the shared words it plays plus its own stats.
 * @experimental
 * @ruling A19, R27, R30
 */
export const rulesets = Object.freeze({
	common: commonVocabulary,
	core: Object.freeze({
		freeform: wordsOf(freeformRuleset.id, {}),
		wherewithal: wordsOf(wherewithalRuleset.id, {
			nerve: wherewithalNerveSlot,
			favour: wherewithalFavourSlot,
			provisions: wherewithalProvisionsSlot
		}),
		visItineris: wordsOf(visItinerisRuleset.id, {
			strength: visItinerisStrengthSlot,
			dexterity: visItinerisDexteritySlot,
			constitution: visItinerisConstitutionSlot,
			intelligence: visItinerisIntelligenceSlot,
			wisdom: visItinerisWisdomSlot,
			charisma: visItinerisCharismaSlot,
			healthMax: visItinerisHpMaxSlot,
			tempHealth: visItinerisTempHpSlot,
			species: visItinerisSpeciesSlot,
			background: visItinerisBackgroundSlot,
			speed: visItinerisSpeedSlot,
			trainedSaves: visItinerisSaveTrainingSlot,
			trainedSkills: visItinerisSkillTrainingSlot,
			expertSkills: visItinerisSkillExpertiseSlot,
			hitDice: visItinerisHitDiceSlot,
			dying: visItinerisDyingSlot,
			wounded: visItinerisWoundedSlot,
			deathSuccesses: visItinerisDeathSuccessesSlot,
			deathFailures: visItinerisDeathFailuresSlot,
			spellPoints: visItinerisSpellPointsSlot,
			heroPoints: visItinerisHeroPointsSlot
		})
	})
})
