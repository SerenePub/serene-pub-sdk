/**
 * 🚧 Vis Itineris's mechanics as data: the conventions it plays by, the settings a
 * table may flip (each choice laying its conventions over these), the
 * _Classic_ preset that restores the reference rules as printed, the
 * selectors its pieces may target, and its voice per rigour.
 *
 * The handler owns dice and bands: it reads the crosswalk below (margins,
 * natural faces), the bonus stacking and the action count, and never a
 * script for them.
 */
import { slotSlug } from "@serene-pub/sdk"
import type {
	DegreeCrosswalk,
	DieTargetMethod,
	DifficultyBand,
	RulesetCasting,
	RulesetConventions,
	RulesetPresetDecl,
	RulesetProps,
	RulesetSelectorDecl,
	RulesetSettingDecl
} from "@serene-pub/sdk"
import { VIS_ITINERIS_ABILITIES, VIS_ITINERIS_SKILLS, visItinerisSpellPointsSlot } from "./slots.js"
import { VIS_ITINERIS_FOCUS } from "./rules.js"
import type { AtZeroHealthOptions } from "../../functions/atZeroHealth.js"

/** Four degrees by margin (±10), a natural 20 or 1 moving the result one step. @internal */
export const VIS_ITINERIS_FOURFOLD_DEGREES: DegreeCrosswalk = Object.freeze({
	bands: [
		{ id: "critical-failure", label: { en: "Critical failure" }, five: "crit-fail" },
		{ id: "failure", label: { en: "Failure" }, five: "fail", from: -9 },
		{ id: "success", label: { en: "Success" }, five: "success", from: 0 },
		{ id: "critical-success", label: { en: "Critical success" }, five: "crit", from: 10 }
	],
	naturalShift: { high: 20, low: 1 }
}) as DegreeCrosswalk

/**
 * Meet the target or miss it; a natural 20 is a critical (its threat range
 * widened by lowering `natural.high.from`), a natural 1 always misses.
 * @internal
 */
export const VIS_ITINERIS_CLASSIC_DEGREES: DegreeCrosswalk = Object.freeze({
	bands: [
		{ id: "failure", label: { en: "Failure" }, five: "fail" },
		{ id: "success", label: { en: "Success" }, five: "success", from: 0 },
		{ id: "natural-one", label: { en: "Natural 1" }, five: "crit-fail" },
		{ id: "critical", label: { en: "Critical" }, five: "crit" }
	],
	natural: { high: { from: 20, band: "critical" }, low: { to: 1, band: "natural-one" } }
}) as DegreeCrosswalk

/**
 * 🚧 The difficulty bands a check is rolled against (Lair rewrite D3,
 * 2026-10-21) — the reference rules' typical difficulties, easiest first:
 * what a roll form offers the game master, and _Medium_ what an automatic
 * roll is made against. 🚧 Held by the `die` check method since 2026-10-22
 * (M3), never beside it.
 * @experimental
 */
export const VIS_ITINERIS_DIFFICULTY_BANDS: readonly DifficultyBand[] = Object.freeze<DifficultyBand[]>([
	{ id: "very-easy", label: { en: "Very easy" }, target: 5 },
	{ id: "easy", label: { en: "Easy" }, target: 10 },
	{ id: "medium", label: { en: "Medium" }, target: 15, default: true },
	{ id: "hard", label: { en: "Hard" }, target: 20 },
	{ id: "very-hard", label: { en: "Very hard" }, target: 25 },
	{ id: "nearly-impossible", label: { en: "Nearly impossible" }, target: 30 }
])

/**
 * 🚧 Vis Itineris's one **check method** (2026-10-22, M3): a d20 plus the
 * check's modifier against a target, its difficulty bands its own. Keyed
 * `die` — the key the ⏳ `conventions.dice` it replaces is read under
 * (`LEGACY_DIE_METHOD`), so a stored copy written before check methods reads
 * as this one, and an outcome block's method key never moves. No
 * `modifierOf`: every check names its `base`, and a bare roll (at death's
 * door) adds nothing.
 * @experimental
 */
export const VIS_ITINERIS_DIE_METHOD: DieTargetMethod = Object.freeze({
	kind: "die-target" as const,
	label: { en: "Roll a d20" },
	sides: 20,
	bands: VIS_ITINERIS_DIFFICULTY_BANDS
})

/** Vis Itineris's own conventions — its defaults; settings lay their choices over these. @internal */
export const VIS_ITINERIS_CONVENTIONS: RulesetConventions = Object.freeze({
	methods: { die: VIS_ITINERIS_DIE_METHOD },
	defaultMethod: "die",
	degrees: VIS_ITINERIS_FOURFOLD_DEGREES,
	time: { unit: "round", roundSeconds: 6 },
	actions: { perTurn: 3, reaction: true, kinds: ["action", "reaction", "free"] },
	rest: [
		{ id: "short", label: { en: "Short rest" }, minutes: 60, recharges: ["short"] },
		{ id: "long", label: { en: "Long rest" }, minutes: 480, recharges: ["short", "long"] }
	],
	bonuses: { types: ["gear", "status", "circumstance", "edge"], stacking: "highest-per-type", edge: "edge" }
}) as RulesetConventions

/**
 * 🚧 **What happens at zero health under Vis Itineris** — the options of its
 * reference to core's fall rule (`core:function/at-zero-health@1`; lane G3,
 * 2026-10-23, ★I), which replaced the module constant it was (`rules.ts`,
 * 2026-10-21): a bare roll of its own die (the `die` way's faces, no
 * modifier). _One roll at death's door_ (`dying: dying-1-4`): 10 or more,
 * back up on 1; a table that plays harsher or gentler moves the target by 2.
 * _Death saves_ (`dying: death-saves`, `savesWhen`): 10 or more a pass, three
 * passes stable, three failures down, a natural 1 two failures, a natural 20
 * back up on 1. Read by the `dying` setting's words below, and by a genre
 * that plays a fall from the session's ruleset — never imported by one.
 * @internal
 */
export const VIS_ITINERIS_AT_ZERO_HEALTH_RULE: AtZeroHealthOptions = Object.freeze({
	sides: VIS_ITINERIS_DIE_METHOD.sides,
	door: Object.freeze({ target: 10, step: 2, upOn: 1 }),
	saves: Object.freeze({
		target: 10,
		passes: 3,
		failures: 3,
		low: Object.freeze({ face: 1, failures: 2 }),
		high: Object.freeze({ face: VIS_ITINERIS_DIE_METHOD.sides, upOn: 1 })
	}),
	savesWhen: Object.freeze({ option: "dying", is: "death-saves" })
})

const DOOR = VIS_ITINERIS_AT_ZERO_HEALTH_RULE.door
const SAVES = VIS_ITINERIS_AT_ZERO_HEALTH_RULE.saves!
const HELD = VIS_ITINERIS_FOCUS.concentration

/**
 * 🚧 Spell points (`casting: points`, 2026-10-22, M3): a cast from `spells`
 * spends its level from the spell-point pool; a long rest fills the pool
 * back to the derive script's `spell-points-max`. The numbers the handler
 * read by setting id until now, declared (`RulesetCasting`).
 * @experimental
 */
export const VIS_ITINERIS_SPELL_POINTS: RulesetCasting = Object.freeze({
	pool: slotSlug(visItinerisSpellPointsSlot.id),
	cost: "level",
	repertoire: "spells",
	refill: "long",
	max: "spell-points-max"
})

/**
 * 🚧 The ruleset settings. `degrees`, `actions` and `bonuses` replace
 * conventions; 🚧 `casting: points` lays the spell-point pool
 * (`conventions.casting`, 2026-10-22). `dying` and `focus` are read by the
 * handler or a genre by choice id (which slots a zero-health character moves,
 * what ends a spell held) — their numbers live in the fall rule's reference
 * (`VIS_ITINERIS_AT_ZERO_HEALTH_RULE`, above; 🚧 2026-10-23, ★I) and
 * `rules.ts` (`VIS_ITINERIS_FOCUS`), and the choices' words read them.
 * @experimental
 */
export const VIS_ITINERIS_SETTINGS: Readonly<Record<string, RulesetSettingDecl>> = Object.freeze({
	degrees: {
		label: { en: "Degrees of success" },
		description: { en: "How a roll against a target reads." },
		default: "fourfold",
		choices: [
			{
				id: "fourfold",
				label: { en: "Four degrees" },
				description: { en: "Beat the target by 10 for a critical success, miss by 10 for a critical failure; a natural 20 or 1 moves the result a step." },
				conventions: { degrees: VIS_ITINERIS_FOURFOLD_DEGREES }
			},
			{
				id: "classic",
				label: { en: "Hit or miss" },
				description: { en: "Meet the target to succeed. A natural 20 is a critical, a natural 1 always fails." },
				conventions: { degrees: VIS_ITINERIS_CLASSIC_DEGREES }
			}
		]
	},
	actions: {
		label: { en: "Actions a turn" },
		default: "three",
		choices: [
			{
				id: "three",
				label: { en: "Three actions" },
				description: { en: "Three actions to spend as you like, plus a reaction." },
				conventions: { actions: { perTurn: 3, reaction: true, kinds: ["action", "reaction", "free"] } }
			},
			{
				id: "classic",
				label: { en: "Action, bonus action, move" },
				description: { en: "One action, a bonus action when something grants one, a move and a reaction." },
				conventions: { actions: { perTurn: 1, reaction: true, kinds: ["action", "bonus-action", "move", "reaction", "free"] } }
			}
		]
	},
	bonuses: {
		label: { en: "Bonuses" },
		default: "typed",
		choices: [
			{
				id: "typed",
				label: { en: "Typed" },
				description: { en: "Gear, status and circumstance bonuses: only the best of each kind counts. Edge rolls twice." },
				conventions: { bonuses: { types: ["gear", "status", "circumstance", "edge"], stacking: "highest-per-type", edge: "edge" } }
			},
			{
				id: "classic",
				label: { en: "Untyped" },
				description: { en: "Bonuses simply add. Edge rolls twice." },
				conventions: { bonuses: { types: ["edge"], stacking: "sum", edge: "edge" } }
			}
		]
	},
	// 🚧 Only what is played (PLAN-dc-after-walk3 R2-4, owner ruling ★1): the
	// single roll at death's door, or death saves — the Dungeon Crawler's two
	// (`genres/dungeon-crawler/dice.ts`). "Dying 1–4" was offered, and the
	// default, while nothing anywhere played a dying track. ⏳ The default's
	// id keeps its first name, `dying-1-4`: a stored choice still reads.
	dying: {
		label: { en: "At zero health" },
		default: "dying-1-4",
		choices: [
			{
				id: "dying-1-4",
				label: { en: "One roll at death's door" },
				description: {
					en: `At zero health one roll decides: ${DOOR.target} or more and they are back up on ${DOOR.upOn} health; under it, down for good — dead, or taken out at a gentle table.`
				}
			},
			{
				id: "death-saves",
				label: { en: "Death saves" },
				description: {
					en: `At zero health a roll each round, ${SAVES.target} or more a pass: ${SAVES.passes} passes and they are stable, ${SAVES.failures} failures and they die. A natural ${SAVES.low.face} counts ${SAVES.low.failures} failures; a natural ${SAVES.high.face} is back up on ${SAVES.high.upOn} health. Healing brings them back.`
				}
			}
		]
	},
	focus: {
		label: { en: "Holding a spell" },
		default: "sustain",
		choices: [
			{
				id: "sustain",
				label: { en: "Sustain" },
				description: {
					en: `Spend ${VIS_ITINERIS_FOCUS.sustain.actions === 1 ? "an action" : `${VIS_ITINERIS_FOCUS.sustain.actions} actions`} each turn to keep a spell going; stop and it ends.`
				}
			},
			{
				id: "concentration",
				label: { en: "Concentration" },
				description: {
					en: `${HELD.held === 1 ? "One spell" : `${HELD.held} spells`} held at a time; taking harm calls for a Constitution save against ${HELD.target}, or half the harm if that is more, to keep it.`
				}
			}
		]
	},
	// 🚧 2026-10-17 (PLAN-sheet-widget-redesign §8): spell points are our own
	// rule, not the SRD's. 🚧 Declared since 2026-10-22 (M3): under `points`
	// the choice lays its casting pool (`VIS_ITINERIS_SPELL_POINTS`) — a cast
	// spends its level from `itineris-spell-points` instead of a slot.
	casting: {
		label: { en: "Casting" },
		description: { en: "What a spell costs to cast." },
		default: "slots",
		choices: [
			{ id: "slots", label: { en: "Spell slots" }, description: { en: "A few slots of each level; a spell spends one of its level or higher." } },
			{
				id: "points",
				label: { en: "Spell points" },
				description: { en: "One pool of points; a spell costs its level in points, a cantrip nothing." },
				conventions: { casting: VIS_ITINERIS_SPELL_POINTS }
			}
		]
	}
})

/** 🚧 Vis Itineris as designed, and the reference rules as printed. @experimental */
export const VIS_ITINERIS_PRESETS: readonly RulesetPresetDecl[] = Object.freeze<RulesetPresetDecl[]>([
	{
		id: "vis-itineris",
		label: { en: "Vis Itineris" },
		description: { en: "Four degrees, three actions, typed bonuses, one roll at death's door, sustained spells." },
		values: { degrees: "fourfold", actions: "three", bonuses: "typed", dying: "dying-1-4", focus: "sustain" }
	},
	{
		id: "classic",
		label: { en: "Classic" },
		description: { en: "The reference rules as printed: hit or miss, action and bonus action, untyped bonuses, death saves, concentration, spell slots." },
		values: { degrees: "classic", actions: "classic", bonuses: "classic", dying: "death-saves", focus: "concentration", casting: "slots" }
	}
])

// Each ability gives a modifier, a save and a plain ability check; a save
// counts within `save` by its dotted name, an ability check within `check`.
const abilitySelectors = Object.fromEntries(
	VIS_ITINERIS_ABILITIES.flatMap((a) => [
		[`${a}-mod`, { kind: "derived", from: [`itineris-${a}`] }],
		[`save.${a}`, { kind: "check", base: `${a}-mod` }],
		[`ability.${a}`, { kind: "check", base: `${a}-mod`, within: "check" }]
	])
) as Record<string, RulesetSelectorDecl>

const skillSelectors = Object.fromEntries(
	Object.entries(VIS_ITINERIS_SKILLS).map(([skill, a]) => [`skill.${skill}`, { kind: "check", base: `${a}-mod`, within: "check" }])
) as Record<string, RulesetSelectorDecl>

/**
 * 🚧 Every name Vis Itineris's pieces may target beyond its stats: the six
 * modifiers, saves and ability checks, the eighteen skills, attacks, the
 * damage bonus, armour class, proficiency and the values the derive and
 * bulk scripts compute.
 *
 * Every check rolls with a modifier (audit D, 2026-10-17): its `base` is the
 * ability modifier, and proficiency arrives as a `modify` from the derive
 * script where it applies (attacks; trained saves and skills). There is no
 * bare `attack` or `check` to roll: they are families — `attack` covers
 * `attack.*`, `check` every skill and ability check (`within`), `save`
 * every save — so a condition's `modify` on `attack` still reaches each.
 * `damage` is a tally: a bonus added to the damage dice, never a d20.
 *
 * 🚧 One derived value is **on the sheet** (`onSheet`, 2026-10-18, P2-3):
 * armour class. The most spell points a caster holds (the derive script's
 * `spell-points-max`, which a long rest refills to) is no row of its own
 * (2026-10-19, Q1-6): it is the pool stat's ceiling, written on the seat, so
 * the sheet reads one row — "Spell points 3/4".
 * @experimental
 */
export const VIS_ITINERIS_SELECTORS: Readonly<Record<string, RulesetSelectorDecl>> = Object.freeze({
	...abilitySelectors,
	proficiency: { kind: "derived", from: ["level"] },
	// A caster's best mental modifier unless the sheet names the ability (the derive script).
	"casting-mod": { kind: "derived", from: ["intelligence-mod", "wisdom-mod", "charisma-mod"] },
	"armour-class": { kind: "derived", from: ["dexterity-mod"], onSheet: true, label: { en: "Armour class" } },
	// 🚧 The spell-point pool's maximum under `casting: points` (P2-4): by
	// class and level, reported by the derive script only at such a table.
	"spell-points-max": { kind: "derived", from: ["level"], label: { en: "Spell points at most" } },
	"passive-perception": { kind: "derived", from: ["wisdom-mod", "proficiency"] },
	"carried-load": { kind: "derived", from: ["itineris-strength"] },
	"spell-dc": { kind: "derived", from: ["casting-mod", "proficiency"] },
	initiative: { kind: "check", base: "dexterity-mod", within: "check" },
	"attack.melee": { kind: "check", base: "strength-mod" },
	"attack.ranged": { kind: "check", base: "dexterity-mod" },
	"attack.spell": { kind: "check", base: "casting-mod" },
	damage: { kind: "tally" },
	focus: { kind: "check", base: "constitution-mod" },
	...skillSelectors
})

/** 🚧 What a model reads about play under Vis Itineris, per rigour (≤ 240 characters each). @experimental */
export const VIS_ITINERIS_VOICE: RulesetProps["voice"] = Object.freeze({
	prose:
		"Vis Itineris is heroic fantasy where deeds carry. Risky acts meet fair odds; skill, gear and help tilt them. What the party does changes places, factions and people, and the world remembers. Keep numbers out of the story.",
	mechanics:
		"The rules decide outcomes and hand them to you: hit or miss, saved or failed, harm dealt. Narrate only what you are given, then let it reach outward: who saw, who owes, what a place or faction will not forget.",
	scripts:
		"Dice are rolled for you. Propose small steps — a strike, a spell and its slot, a door forced — never totals. Narrate results as given, and carry each into the world: a faction stirs, a place changes, someone remembers."
})
