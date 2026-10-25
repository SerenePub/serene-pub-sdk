/**
 * 🚧 **Vis Itineris in the seven sections** (lane A2, 2026-10-23;
 * PLAN-rulesets-functions D2, D9) — the ruleset rebuilt over core's
 * functions, its parts as before: the attributes it carries (core's level,
 * class and health borrowed, then its own); one way to decide (core's die
 * against a target — a d20, its difficulties, a natural 20 or 1 moving the
 * result a step); its checks, worked-out values and the damage tally as
 * references to core's `check`, `worked-out` and `tally`; typed bonuses;
 * its own four modules (levelling and carrying forked from core's, the
 * worked-out values and heightening its own), their bodies its seeded
 * scripts; 🚧 core's rest and fall rule (lane G3, 2026-10-23: `rest@1`,
 * `at-zero-health@1`, the numbers its own); its entry types (its repertoires, piece rules carried); four
 * degrees; rounds of six seconds; its compendium as its library; its
 * settings as options.
 *
 * What it plays by is unchanged — `sdk-tests/catalogueParity.test.ts` reads
 * it beside the declaration before sections and proves every reading equal.
 * `registry/rulesets.ts` declares it, adding the shared vocabulary it plays.
 */
import { slotSlug, type FunctionRef, type RulesetAttributeDecl, type RulesetProps } from "@serene-pub/sdk"
import { characterClassSlot, hpSlot, levelSlot } from "../../registry/slots.js"
import { carryingLimitFunction, experienceLevelsFunction, restFunction, tallyFunction, typedBonusesFunction, workedOutFunction } from "../../functions/index.js"
import { atZeroHealthFunction } from "../../functions/atZeroHealth.js"
import { checkRef, entryTypeOf, optionsOf, outcomesOf, ownModuleRef, wayRef, workedOutRef } from "../sections.js"
import { VIS_ITINERIS_ABILITIES, VIS_ITINERIS_OWN_SLOTS, VIS_ITINERIS_SKILLS } from "./slots.js"
import {
	VIS_ITINERIS_AT_ZERO_HEALTH_RULE,
	VIS_ITINERIS_CONVENTIONS,
	VIS_ITINERIS_DIE_METHOD,
	VIS_ITINERIS_FOURFOLD_DEGREES,
	VIS_ITINERIS_PRESETS,
	VIS_ITINERIS_SETTINGS,
	VIS_ITINERIS_VOICE
} from "./conventions.js"
import { VIS_ITINERIS_REPERTOIRES } from "./repertoires.js"
import { VIS_ITINERIS_COMPENDIUM } from "./compendium/index.js"
import { VIS_ITINERIS_FROM_FREEFORM, VIS_ITINERIS_RULESET_ID } from "./index.js"

const ID = VIS_ITINERIS_RULESET_ID
const C = VIS_ITINERIS_CONVENTIONS
/** Its longest rest — the one a night's sleep is (`time.rests`): what the rest it offers takes. */
const LONG_REST = [...(C.rest ?? [])].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))[0]!.id

/** Core's level, class and health, borrowed (every genre reads them); then its own, which it owns by listing. */
const ATTRIBUTES: RulesetAttributeDecl[] = [
	// 🚧 Tagged (RF fix 8): what a genre plays best with is found by tag — health, a level, a calling.
	{ id: slotSlug(levelSlot.id), slot: levelSlot.id, borrowed: true, config: { min: 1, max: 20 }, tags: ["level"] },
	{ id: slotSlug(characterClassSlot.id), slot: characterClassSlot.id, borrowed: true, tags: ["class"] },
	{ id: slotSlug(hpSlot.id), slot: hpSlot.id, borrowed: true, start: 10, config: { min: 0, max: 999 }, tags: ["health"] },
	...VIS_ITINERIS_OWN_SLOTS.map((s) => ({ id: slotSlug(s.id), slot: s.id }))
]

/** A key as a person reads it: `sleight-of-hand` → "Sleight of hand". */
const spelledOut = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " ")

/**
 * Each ability: its modifier (worked out), its save, its plain ability check
 * (counted within `check`) — 🚧 each check in its own words (GM 2026-10-23,
 * G2 ★1: *Strength save*, *Strength*), what a roll form offers.
 */
const abilityRefs = (a: (typeof VIS_ITINERIS_ABILITIES)[number]): FunctionRef[] => [
	workedOutRef(`${a}-mod`, { from: [`itineris-${a}`] }),
	checkRef(`save.${a}`, { base: `${a}-mod`, label: { en: `${spelledOut(a)} save` } }),
	checkRef(`ability.${a}`, { base: `${a}-mod`, within: "check", label: { en: spelledOut(a) } })
]

/**
 * Every function it uses, the way to decide first. The worked-out values the
 * derive script computes (proficiency from level, armour on the sheet, …);
 * every check rolls with its ability's modifier, proficiency arriving as a
 * bonus where it applies; `attack`, `check` and `save` are families.
 */
const FUNCTIONS: FunctionRef[] = [
	wayRef("die", VIS_ITINERIS_DIE_METHOD, { naturalShift: VIS_ITINERIS_FOURFOLD_DEGREES.naturalShift }),
	...VIS_ITINERIS_ABILITIES.flatMap(abilityRefs),
	workedOutRef("proficiency", { from: ["level"] }),
	workedOutRef("casting-mod", { from: ["intelligence-mod", "wisdom-mod", "charisma-mod"] }),
	workedOutRef("armour-class", { from: ["dexterity-mod"], onSheet: true, label: { en: "Armour class" } }),
	workedOutRef("spell-points-max", { from: ["level"], label: { en: "Spell points at most" } }),
	workedOutRef("passive-perception", { from: ["wisdom-mod", "proficiency"] }),
	workedOutRef("carried-load", { from: ["itineris-strength"] }),
	workedOutRef("spell-dc", { from: ["casting-mod", "proficiency"] }),
	checkRef("initiative", { base: "dexterity-mod", within: "check", label: { en: "Initiative" } }),
	checkRef("attack.melee", { base: "strength-mod", label: { en: "Melee attack" } }),
	checkRef("attack.ranged", { base: "dexterity-mod", label: { en: "Ranged attack" } }),
	checkRef("attack.spell", { base: "casting-mod", label: { en: "Spell attack" } }),
	{ ref: tallyFunction.id, key: "damage" },
	checkRef("focus", { base: "constitution-mod", label: { en: "Focus" } }),
	...Object.entries(VIS_ITINERIS_SKILLS).map(([skill, a]) => checkRef(`skill.${skill}`, { base: `${a}-mod`, within: "check", label: { en: spelledOut(skill) } })),
	{ ref: typedBonusesFunction.id, key: "typed-bonuses", options: { ...C.bonuses! } },
	// 🚧 A rest a person may take — its long rest, health back to its most —
	// raising `rest-taken` for whatever answers it (lane G3, 2026-10-23, S3:
	// the rules action Rest; a genre's own effects on the event).
	{ ref: restFunction.id, key: "rest", bindings: { restores: [slotSlug(hpSlot.id)] }, options: { rest: LONG_REST } },
	// 🚧 What happens at zero health: one roll at death's door, or death saves
	// by its `dying` option — core's fall rule, its numbers here (★I).
	{ ref: atZeroHealthFunction.id, key: "at-zero-health", bindings: { health: slotSlug(hpSlot.id) }, options: { ...VIS_ITINERIS_AT_ZERO_HEALTH_RULE } },
	ownModuleRef(ID, "core:script/vis-itineris-level-up", {
		name: { en: "Vis Itineris: gain a level" },
		meaning: { en: "A level gained: health by the class's die, proficiency, spell slots — or spell points — by the class's table." },
		kind: "progression",
		prose: "A level gained raises health by the class's die and Constitution, proficiency at its steps, and a caster's spells by the class's table.",
		phase: "effects",
		forkedFrom: experienceLevelsFunction
	}),
	ownModuleRef(ID, "core:script/vis-itineris-derive", {
		name: { en: "Vis Itineris: worked-out values" },
		meaning: { en: "Ability modifiers, proficiency, armour, passive perception and the spell save, worked out from the sheet." },
		kind: "value",
		prose: "Modifiers, proficiency, armour, passive perception and the spell save are worked out from the sheet; read them as given.",
		phase: "derived",
		forkedFrom: workedOutFunction
	}),
	ownModuleRef(ID, "core:script/vis-itineris-bulk", {
		name: { en: "Vis Itineris: carried load" },
		meaning: { en: "What someone carries against fifteen pounds a point of Strength: light, burdened, or over." },
		kind: "value",
		prose: "Carrying more than half of what Strength allows burdens and slows someone; carrying more than all of it nearly stops them.",
		phase: "derived",
		forkedFrom: carryingLimitFunction
	}),
	ownModuleRef(ID, "core:script/vis-itineris-heighten-spell", {
		name: { en: "Vis Itineris: heighten a spell" },
		meaning: { en: "A spell cast from a higher slot, or a cantrip at a higher level, deals more." },
		kind: "changing",
		prose: "A spell cast from a higher slot, or a cantrip at a higher level, grows stronger by its own steps.",
		phase: "before"
	})
]

/**
 * 🚧 **Vis Itineris** — the force of the journey, in the seven sections.
 * `registry/rulesets.ts` declares `core:ruleset/vis-itineris@1` from it.
 * @experimental
 */
export const VIS_ITINERIS_RULESET: RulesetProps = Object.freeze({
	name: { en: "Vis Itineris" },
	description: {
		en: "Vis Itineris — the force of the journey. Heroes whose deeds move the world. Built on the System Reference Document 5.2, licensed CC-BY-4.0; see Licences."
	},
	voice: VIS_ITINERIS_VOICE,
	attributes: ATTRIBUTES,
	functions: FUNCTIONS,
	entryTypes: VIS_ITINERIS_REPERTOIRES.map((r) => entryTypeOf(r, r.entryable === true)),
	outcomes: outcomesOf(VIS_ITINERIS_FOURFOLD_DEGREES),
	time: { ...C.time, turns: C.actions!, rests: C.rest! },
	library: VIS_ITINERIS_COMPENDIUM,
	options: optionsOf(VIS_ITINERIS_SETTINGS, VIS_ITINERIS_PRESETS, [VIS_ITINERIS_FROM_FREEFORM])
}) as RulesetProps
