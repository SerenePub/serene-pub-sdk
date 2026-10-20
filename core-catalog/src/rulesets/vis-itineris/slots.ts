/**
 * 🚧 Vis Itineris's own stat slots — the ones core's shared slots do not already
 * say. Declaring a slot registers it, so this module is named in
 * core-catalog's `sideEffects`.
 *
 * Reused, not redeclared: `core:slot/hp@1` (current health),
 * `core:slot/level@1`, `core:slot/character-class@1`, `core:slot/location@1`.
 * Ids carry the ruleset's name (`itineris-…`) so another ruleset's
 * *Strength* never shares a value with this one's.
 *
 * Derived values — ability modifiers, proficiency, armour class, passive
 * perception, saves — are the ruleset's **selectors**, computed by the
 * `core:script/vis-itineris-derive` script; nothing stores them.
 */
import { defineAttributeSlot } from "@serene-pub/sdk"
import { listStatShape, numberStatShape } from "../../registry/statShapes.js"

/*
 * Each slot here is pickable only in a Vis Itineris session, so its stats
 * never flood every session's picker — because the ruleset lists it under
 * its `stats` (owned by listing, 2026-10-17), not because the slot says so:
 * no slot below spells `rulesetOwned`.
 */

const ability = (key: string, label: string, means: string) =>
	defineAttributeSlot(`core:slot/itineris-${key}@1`, {
		shape: numberStatShape.id,
		label: { en: label },
		description: { en: `${label}, from 1 to 30; 10 is ordinary.` },
		descriptor: `${label}, a score from 1 to 30 where 10 is ordinary. ${means}`,
		appliesTo: ["cast"],
		config: { min: 1, max: 30 },
		default: 10
	})

/** 🚧 @experimental */
export const visItinerisStrengthSlot = ability("strength", "Strength", "It measures muscle: lifting, climbing, hitting hard.")
/** 🚧 @experimental */
export const visItinerisDexteritySlot = ability("dexterity", "Dexterity", "It measures quickness and balance: dodging, aiming, slipping past.")
/** 🚧 @experimental */
export const visItinerisConstitutionSlot = ability("constitution", "Constitution", "It measures toughness: enduring wounds, poison and long marches.")
/** 🚧 @experimental */
export const visItinerisIntelligenceSlot = ability("intelligence", "Intelligence", "It measures reasoning and memory: study, recall, working things out.")
/** 🚧 @experimental */
export const visItinerisWisdomSlot = ability("wisdom", "Wisdom", "It measures awareness and judgement: noticing, sensing motives, keeping calm.")
/** 🚧 @experimental */
export const visItinerisCharismaSlot = ability("charisma", "Charisma", "It measures force of personality: persuading, deceiving, commanding a room.")

/** 🚧 The ceiling `core:slot/hp@1` reads against. @experimental */
export const visItinerisHpMaxSlot = defineAttributeSlot("core:slot/itineris-hp-max@1", {
	shape: numberStatShape.id,
	label: { en: "Health maximum" },
	description: { en: "The most health this character can have." },
	descriptor: "The most health this character can have; healing never raises health above it. It rises when they gain a level.",
	appliesTo: ["cast"],
	config: { min: 1 },
	default: 10
})

/** 🚧 @experimental */
export const visItinerisTempHpSlot = defineAttributeSlot("core:slot/itineris-temp-hp@1", {
	shape: numberStatShape.id,
	label: { en: "Temporary health" },
	description: { en: "A cushion that takes harm before health does." },
	descriptor: "Temporary health: harm comes off it before real health. It does not add up from two sources (the higher stays) and it is gone after a long rest.",
	appliesTo: ["cast"],
	config: { min: 0 },
	default: 0
})

/** 🚧 @experimental */
export const visItinerisSpeciesSlot = defineAttributeSlot("core:slot/itineris-species@1", {
	type: "text",
	label: { en: "Species" },
	description: { en: "What people this character comes from." },
	descriptor: "The character's species — what people they were born to. It may give them senses or gifts others lack.",
	appliesTo: ["cast"],
	config: { maxLength: 60 }
})

/** 🚧 @experimental */
export const visItinerisBackgroundSlot = defineAttributeSlot("core:slot/itineris-background@1", {
	type: "text",
	label: { en: "Background" },
	description: { en: "What this character did before adventuring." },
	descriptor: "What the character did before adventuring. It explains what they know, who they know and the skills they picked up.",
	appliesTo: ["cast"],
	config: { maxLength: 60 }
})

/** 🚧 Feet a character moves in one move. @experimental */
export const visItinerisSpeedSlot = defineAttributeSlot("core:slot/itineris-speed@1", {
	shape: numberStatShape.id,
	label: { en: "Speed" },
	description: { en: "How far this character moves in one move, in feet." },
	descriptor: "How far the character moves in one move, in feet. Heavy loads, some armour and some conditions lower it.",
	appliesTo: ["cast"],
	config: { min: 0, max: 120 },
	default: 30
})

/** The abilities a save is made with, in order. @internal */
export const VIS_ITINERIS_ABILITIES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const

/** The skills, each with the ability it leans on. @internal */
export const VIS_ITINERIS_SKILLS: Readonly<Record<string, (typeof VIS_ITINERIS_ABILITIES)[number]>> = Object.freeze({
	acrobatics: "dexterity",
	"animal-handling": "wisdom",
	arcana: "intelligence",
	athletics: "strength",
	deception: "charisma",
	history: "intelligence",
	insight: "wisdom",
	intimidation: "charisma",
	investigation: "intelligence",
	medicine: "wisdom",
	nature: "intelligence",
	perception: "wisdom",
	performance: "charisma",
	persuasion: "charisma",
	religion: "intelligence",
	"sleight-of-hand": "dexterity",
	stealth: "dexterity",
	survival: "wisdom"
})

/** 🚧 @experimental */
export const visItinerisSaveTrainingSlot = defineAttributeSlot("core:slot/itineris-save-training@1", {
	shape: listStatShape.id,
	label: { en: "Trained saves" },
	description: { en: "The abilities this character is trained to resist with." },
	descriptor: "The abilities the character is trained to resist danger with. A trained save adds their proficiency.",
	appliesTo: ["cast"],
	config: { of: [...VIS_ITINERIS_ABILITIES] }
})

/** 🚧 Proficient: adds proficiency. @experimental */
export const visItinerisSkillTrainingSlot = defineAttributeSlot("core:slot/itineris-skill-training@1", {
	shape: listStatShape.id,
	label: { en: "Trained skills" },
	description: { en: "The skills this character is trained in." },
	descriptor: "The skills the character is trained in. A trained skill adds their proficiency to the check.",
	appliesTo: ["cast"],
	config: { of: Object.keys(VIS_ITINERIS_SKILLS) }
})

/** 🚧 Expertise: adds proficiency twice. @experimental */
export const visItinerisSkillExpertiseSlot = defineAttributeSlot("core:slot/itineris-skill-expertise@1", {
	shape: listStatShape.id,
	label: { en: "Expert skills" },
	description: { en: "The skills this character has mastered." },
	descriptor: "The skills the character has mastered. An expert skill adds their proficiency twice.",
	appliesTo: ["cast"],
	config: { of: Object.keys(VIS_ITINERIS_SKILLS) }
})

/** 🚧 Spent on a short rest to heal. @experimental */
export const visItinerisHitDiceSlot = defineAttributeSlot("core:slot/itineris-hit-dice@1", {
	shape: numberStatShape.id,
	label: { en: "Hit dice" },
	description: { en: "Dice left to spend on healing during a short rest." },
	descriptor: "Hit dice left: on a short rest the character may spend them to heal. They have one per level and get half back on a long rest.",
	appliesTo: ["cast"],
	config: { min: 0, max: 20 },
	default: 1
})

/** 🚧 Vis Itineris's dying track (setting `dying: dying-1-4`). @experimental */
export const visItinerisDyingSlot = defineAttributeSlot("core:slot/itineris-dying@1", {
	shape: numberStatShape.id,
	label: { en: "Dying" },
	description: { en: "How close to death a character at zero health is." },
	descriptor: "How close to death the character is, from 0 (not dying) to 4 (dead). It rises while they lie at zero health and falls when they are helped.",
	appliesTo: ["cast"],
	config: { min: 0, max: 4 },
	default: 0
})

/** 🚧 What dying leaves behind (setting `dying: dying-1-4`). @experimental */
export const visItinerisWoundedSlot = defineAttributeSlot("core:slot/itineris-wounded@1", {
	shape: numberStatShape.id,
	label: { en: "Wounded" },
	description: { en: "How many times this character has nearly died since their last long rest." },
	descriptor: "How many times the character has come back from dying since their last long rest. Each one makes the next fall start closer to death.",
	appliesTo: ["cast"],
	config: { min: 0, max: 3 },
	default: 0
})

/** 🚧 Classic dying (setting `dying: death-saves`). @experimental */
export const visItinerisDeathSuccessesSlot = defineAttributeSlot("core:slot/itineris-death-successes@1", {
	shape: numberStatShape.id,
	label: { en: "Death saves passed" },
	description: { en: "Passed rolls against death; three and they are stable." },
	descriptor: "Rolls against death the character has passed while at zero health. At three they stop dying.",
	appliesTo: ["cast"],
	config: { min: 0, max: 3 },
	default: 0
})

/** 🚧 Classic dying (setting `dying: death-saves`). @experimental */
export const visItinerisDeathFailuresSlot = defineAttributeSlot("core:slot/itineris-death-failures@1", {
	shape: numberStatShape.id,
	label: { en: "Death saves failed" },
	description: { en: "Failed rolls against death; three and they die." },
	descriptor: "Rolls against death the character has failed while at zero health. At three they die.",
	appliesTo: ["cast"],
	config: { min: 0, max: 3 },
	default: 0
})

/**
 * 🚧 The pool a caster spends under the setting `casting: points` — our own
 * rule, not the SRD's: a spell costs its level in points (a cantrip
 * nothing), and the pool refills on a long rest. Its maximum comes from
 * level (the level-up script's `spellPoints`: 4 at level 1 for a full
 * caster), set per character as the slot's `max` (`set-stat-config`); the
 * declared ceiling only bounds it. Unused under `casting: slots`, so a
 * session playing slots does not track it at all (`whenRulesetSetting`,
 * 2026-10-18: "Spell points 0" stood on every sheet).
 * @experimental
 */
export const visItinerisSpellPointsSlot = defineAttributeSlot("core:slot/itineris-spell-points@1", {
	shape: numberStatShape.id,
	label: { en: "Spell points" },
	description: { en: "Points left to cast with; a spell costs its level." },
	descriptor:
		"Spell points left: casting a spell spends as many points as the spell's level, and a cantrip spends none. They come back after a long rest.",
	appliesTo: ["cast"],
	config: { min: 0, max: 99 },
	default: 0,
	whenRulesetSetting: { ruleset: "core:ruleset/vis-itineris@1", setting: "casting", is: ["points"] }
})

/** 🚧 @experimental */
export const visItinerisHeroPointsSlot = defineAttributeSlot("core:slot/itineris-hero-points@1", {
	shape: numberStatShape.id,
	label: { en: "Hero points" },
	description: { en: "Spend one to roll a die again." },
	descriptor: "Hero points: spend one to roll a die again and keep the new result. The table awards them for bold or selfless play.",
	appliesTo: ["cast"],
	config: { min: 0, max: 3 },
	default: 1
})

/** Every slot this module declares, in sheet order. @internal */
export const VIS_ITINERIS_OWN_SLOTS = Object.freeze([
	visItinerisStrengthSlot,
	visItinerisDexteritySlot,
	visItinerisConstitutionSlot,
	visItinerisIntelligenceSlot,
	visItinerisWisdomSlot,
	visItinerisCharismaSlot,
	visItinerisHpMaxSlot,
	visItinerisTempHpSlot,
	visItinerisSpeciesSlot,
	visItinerisBackgroundSlot,
	visItinerisSpeedSlot,
	visItinerisSaveTrainingSlot,
	visItinerisSkillTrainingSlot,
	visItinerisSkillExpertiseSlot,
	visItinerisHitDiceSlot,
	visItinerisDyingSlot,
	visItinerisWoundedSlot,
	visItinerisDeathSuccessesSlot,
	visItinerisDeathFailuresSlot,
	visItinerisSpellPointsSlot,
	visItinerisHeroPointsSlot
])
