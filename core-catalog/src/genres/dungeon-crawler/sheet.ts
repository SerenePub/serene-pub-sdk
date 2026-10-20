/**
 * 🚧 Dungeon Crawler's **ruleset sheet** (rulesets W3-B, 2026-10-16): the
 * list fields that hold Vis Itineris's pieces — what a character fights with,
 * carries and casts, what ails them, the ways out of a place, and the
 * world's burning fuses — each a field whose config names the repertoire
 * it holds (`config.repertoire`, `core:ruleset/vis-itineris@1#weapons`).
 *
 * Vis Itineris is the genre's recommended ruleset (PLAN-rulesets §13 amendment),
 * so the fields name Vis Itineris's repertoires; a session on another ruleset
 * keeps what they hold, parked and unread (the handler renders only the
 * session's own ruleset's repertoires). The handler reads and writes them
 * (`core:task/ruleset-resolve@1`); the story turn's Planner proposes changes
 * to them as deltas, never strings.
 *
 * ⚠ These are declared here, beside the genre that uses them; the genre's
 * slot list and sheet (`registry/slots.ts`, `DUNGEON_CRAWLER_SLOTS` and
 * `DUNGEON_CRAWLER_SHEET`) must name `DUNGEON_CRAWLER_RULESET_SLOTS` for a
 * session to track them.
 */

import { defineAttributeSlot, repertoireAddress, type AttributeSlotProps } from '@serene-pub/sdk'
import {
	visItinerisCharismaSlot,
	visItinerisConstitutionSlot,
	visItinerisDexteritySlot,
	visItinerisIntelligenceSlot,
	visItinerisSkillTrainingSlot,
	visItinerisSpellPointsSlot,
	visItinerisStrengthSlot,
	visItinerisWisdomSlot,
} from '../../rulesets/vis-itineris/slots.js'
import { VIS_ITINERIS_COMPENDIUM } from '../../rulesets/vis-itineris/compendium/index.js'

/** The ruleset whose repertoires these fields hold. @internal */
const VIS_ITINERIS = 'core:ruleset/vis-itineris@1'

const pieces = (
	key: string,
	repertoire: string,
	label: string,
	description: string,
	descriptor: string,
	appliesTo: readonly ('cast' | 'world' | 'location')[],
	extra: Pick<AttributeSlotProps, 'whenRulesetSetting'> = {},
) =>
	defineAttributeSlot(`core:slot/crawl-${key}@1`, {
		// A list of pieces (inline, compendium or lore): not the text-list stat
		// shape, whose items are strings.
		type: 'list',
		label: { en: label },
		description: { en: description },
		descriptor,
		appliesTo: [...appliesTo],
		config: { repertoire: repertoireAddress(VIS_ITINERIS, repertoire) },
		...extra,
	})

/** 🚧 What a character fights with. @experimental */
export const crawlWeaponsSlot = pieces(
	'weapons',
	'weapons',
	'Weapons',
	'What this character fights with.',
	'The weapons they carry, each one a piece of the rules: how it is used and the harm it does.',
	['cast'],
)
/** 🚧 What a character wears to turn blows. @experimental */
export const crawlArmourSlot = pieces(
	'armour',
	'armour',
	'Armour',
	'What this character wears or carries to turn blows aside.',
	'The armour and shield they wear.',
	['cast'],
)
/** 🚧 Tools and kit. @experimental */
export const crawlGearSlot = pieces(
	'gear',
	'gear',
	'Gear',
	'Tools, lights and kit this character packs.',
	'Their tools, lights and kit. Anything not listed, they do not have.',
	['cast'],
)
/** 🚧 Things used up — potions, rations. @experimental */
export const crawlConsumablesSlot = pieces(
	'consumables',
	'consumables',
	'Consumables',
	'Potions, food and other things this character uses up.',
	'What they carry that is used up, with how many uses are left.',
	['cast'],
)
/** 🚧 Magic known or prepared. @experimental */
export const crawlSpellsSlot = pieces(
	'spells',
	'spells',
	'Spells',
	'The magic this character knows.',
	'The spells they know or have prepared.',
	['cast'],
)
/**
 * 🚧 The casting a character has left at each level (PLAN-sheet-widget-redesign
 * §8, 2026-10-17): Vis Itineris's `spell-slots`, one piece a level — how many,
 * how many spent, what rest gives them back. The kits of the casting classes
 * bestow them (`kits.ts`); the Planner's `spend` marks one used and a long
 * rest returns them. The holder's own row (`audience: holder` on the
 * repertoire). Tracked only at a table playing `casting: slots`
 * (`whenRulesetSetting`, 2026-10-18): a spell-points table keeps no slots.
 * @experimental
 */
export const crawlSpellSlotsSlot = pieces(
	'spell-slots',
	'spell-slots',
	'Spell slots',
	'How many spells of each level this character can still cast before resting.',
	'The spell slots they have left at each level, and what rest brings them back.',
	['cast'],
	{ whenRulesetSetting: { ruleset: VIS_ITINERIS, setting: 'casting', is: ['slots'] } },
)
/** 🚧 What training and nature let a character do. @experimental */
export const crawlFeaturesSlot = pieces(
	'features',
	'features',
	'Features',
	"What this character's training and nature let them do.",
	'What their class and nature let them do, and how often.',
	['cast'],
)
/** 🚧 What ails a character, and for how long. @experimental */
export const crawlConditionsSlot = pieces(
	'conditions',
	'conditions',
	'Conditions',
	'What ails or hinders this character, and for how long.',
	'What ails or hinders them now, and when it ends.',
	['cast'],
)
/** 🚧 The ways out of a place: door, passage, road; lock, trap, travel time. @experimental */
export const crawlExitsSlot = pieces(
	'exits',
	'exits',
	'Ways out',
	'The doors, passages and roads out of this place, and what crossing each takes.',
	'The ways out of this place: how each stands — open, locked, hidden — and what crossing it takes.',
	['location'],
)
/**
 * 🚧 The world's **fuses**: something that will happen at a story time unless
 * the party stops it — a condition on the world whose duration runs out
 * (`expiry: elapsed`); the handler fires it when the time passes.
 * @experimental
 */
export const crawlFusesSlot = pieces(
	'fuses',
	'conditions',
	'Fuses',
	'What will happen in the world, and when, unless somebody stops it.',
	'Countdowns burning in the world: what happens, and when.',
	['world'],
)

/** 🚧 The genre's ruleset fields, in sheet order. @experimental */
export const DUNGEON_CRAWLER_RULESET_SLOTS = Object.freeze([
	crawlWeaponsSlot,
	crawlArmourSlot,
	crawlGearSlot,
	crawlConsumablesSlot,
	crawlSpellsSlot,
	crawlSpellSlotsSlot,
	crawlFeaturesSlot,
	crawlConditionsSlot,
	crawlExitsSlot,
	crawlFusesSlot,
] as const)

/**
 * 🚧 The repertoire each field holds, by the repertoire id the Planner's
 * deltas name — what the story turn sends to the handler as `repertoire`.
 * `fuses` names Vis Itineris's `conditions` on the world owner.
 * @internal
 */
export const DUNGEON_CRAWLER_REPERTOIRE_SLOTS = Object.freeze({
	weapons: crawlWeaponsSlot.id,
	armour: crawlArmourSlot.id,
	gear: crawlGearSlot.id,
	consumables: crawlConsumablesSlot.id,
	spells: crawlSpellsSlot.id,
	'spell-slots': crawlSpellSlotsSlot.id,
	features: crawlFeaturesSlot.id,
	conditions: crawlConditionsSlot.id,
	exits: crawlExitsSlot.id,
} as const)

/**
 * 🚧 Vis Itineris's six ability scores, tracked by the genre (walk
 * 2026-10-17: the dice line read "strength-mod 0" — the handler reads a
 * stat only where the session tracks it). The class's kit writes them when
 * the sheet is made (`kits.ts`, `kitAbilityChanges`); the derive script
 * turns them into modifiers.
 * @experimental
 */
export const DUNGEON_CRAWLER_ABILITY_SLOTS = Object.freeze([
	visItinerisStrengthSlot,
	visItinerisDexteritySlot,
	visItinerisConstitutionSlot,
	visItinerisIntelligenceSlot,
	visItinerisWisdomSlot,
	visItinerisCharismaSlot,
] as const)

/**
 * 🚧 Vis Itineris's trained skills, tracked by the genre (PLAN-dc-after-walk3,
 * owner ruling ★4: the rogue picked a lock with Sleight of hand and no
 * proficiency): the class's kit writes them when the sheet is made
 * (`kitSkillChanges`), and the derive script adds proficiency to a check of a
 * trained skill — "+ 2 (proficiency)" on the pick.
 * @experimental
 */
export const DUNGEON_CRAWLER_SKILL_SLOTS = Object.freeze([visItinerisSkillTrainingSlot] as const)

/**
 * 🚧 Vis Itineris's spell-point pool, tracked by the genre (2026-10-18, P2-4,
 * owner ruling ★7): at a table playing `casting: points` a cast spends its
 * level from it (the handler), the sheet step fills it to the class's pool
 * (`kitSpellPoints`) and a Rest — eight hours, a long rest — refills it to
 * the derive script's `spell-points-max`. Unused at a slots table.
 * @experimental
 */
export const DUNGEON_CRAWLER_POOL_SLOTS = Object.freeze([visItinerisSpellPointsSlot] as const)

/**
 * 🚧 A dying character's **death-save tally**, in words — "1 pass, 0
 * failures" — beside Fate's *Dying* (PLAN-dc-after-walk2 Q3-8, the walk's
 * N15). The story turn's books write it each round a seat lies dying and
 * empty it once they are up, stable or gone (`death.ts`); the books' own
 * reckoning stays `progress.deathSaves`. Drawn only while it holds something
 * (`shownWhenSet`), kept only at a table playing Vis Itineris's _At zero
 * health: Death saves_. ⚠ Not Vis Itineris's own *Death saves passed* /
 * *failed* numbers, which the crawl does not keep.
 * @experimental
 */
export const crawlDeathSavesSlot = defineAttributeSlot('core:slot/crawl-death-saves@1', {
	type: 'text',
	label: { en: 'Death saves' },
	description: { en: 'The death saves a dying character has passed and failed.' },
	descriptor:
		'While the character lies dying at death\'s door: the death saves passed and failed so far. Three failures and they die; three passes and they are stable.',
	appliesTo: ['cast'],
	config: { maxLength: 60 },
	pickable: false,
	shownWhenSet: true,
	whenRulesetSetting: { ruleset: VIS_ITINERIS, setting: 'dying', is: ['death-saves'] },
})

/** 🚧 The genre's death-save tally (Q3-8), tracked beside Fate. @experimental */
export const DUNGEON_CRAWLER_DYING_SLOTS = Object.freeze([crawlDeathSavesSlot] as const)

/**
 * 🚧 The genre's **retired** fields (walk 2026-10-17): `abilities` and
 * `inventory`, lists of words that Vis Itineris's repertoires replaced
 * (features, weapons, armour, gear, consumables, spells — the fields above);
 * and `stat-mode` (AUDIT C7), the numbers question the session's rigour
 * replaced. Still tracked, so an older session reads what they hold; never
 * on the genre's sheet, and nothing writes them. A widget hides one that
 * holds nothing.
 * @experimental
 */
export const DUNGEON_CRAWLER_RETIRED_SLOT_IDS = Object.freeze([
	'core:slot/abilities@1',
	'core:slot/inventory@1',
	'core:slot/stat-mode@1',
] as const)

/**
 * A compendium row's own name: under its `piece` (the nested row metadata,
 * AUDIT A18), or beside its id (the flat rows before it), else its id.
 * @internal
 */
export const rowName = (r: any): string => String(r?.piece?.name ?? r?.name ?? r?.id ?? '')

/**
 * 🚧 The conditions the Planner may put on someone, by the compendium row's
 * own name (PLAN-sheet-widget-redesign §7, 2026-10-17) — built from the rows
 * of Vis Itineris's `conditions` at genre build, never typed twice: a new
 * row is named to the Planner the day it ships. Read into the story turn's
 * prompt by its ruleset-fields script (`{{conditionsLine}}`, `story.ts`) —
 * at a Vis Itineris table only (P2-6).
 * @experimental
 */
export const DUNGEON_CRAWLER_CONDITION_NAMES: readonly string[] = Object.freeze(
	(VIS_ITINERIS_COMPENDIUM.rows.conditions ?? []).map((r: any) => rowName(r)),
)

/**
 * 🚧 Each condition's name and how long it lasts, in words, by its compendium
 * id and by its name in lower case — what the table's line says when one
 * lands ("Ann: Poisoned, 1 hour") — and its gloss at a table of words. From
 * the rows, never typed twice; a condition that lasts until removed says no
 * time. @internal
 */
export const DUNGEON_CRAWLER_CONDITION_ROWS: Readonly<Record<string, { name: string; lasts: string; gloss: string }>> = Object.freeze(
	Object.fromEntries(
		(VIS_ITINERIS_COMPENDIUM.rows.conditions ?? []).flatMap((r: any) => {
			const d = r.piece?.duration ?? r.duration ?? {}
			const n = Number(d.value)
			const units = String(d.units ?? '')
			const lasts = n > 0 && units && units !== 'until-removed' ? `${n} ${units}${n === 1 ? '' : 's'}` : ''
			// 🚧 The words a table that keeps no numbers says of it (Q2-3, the
			// walk's N12): the row's description up to its rule — "Sick and
			// shaky", never "attacks and checks come harder".
			const said = String(r.piece?.description ?? r.description ?? '').split(':')[0]!.trim().replace(/[.]$/, '')
			const row = { name: rowName(r), lasts, gloss: said ? `${said}.` : '' }
			return [
				[String(r.id), row],
				[row.name.toLowerCase(), row],
			]
		}),
	),
)
