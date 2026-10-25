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
 * ⚠ These are declared here, beside the genre that uses them. 🚧 Since RF
 * fix 8 (2026-10-23) a genre brings no slots: the crawl's piece lists are
 * the host's ⏳ tool state for it (`registry/hostState.ts`) — what its
 * scripts keep pieces in until they read the session's zones — never the
 * rules' attributes, never on the sheet among them.
 */

import { defineAttributeSlot, repertoireAddress, type AttributeSlotProps } from '@serene-pub/sdk'
import { VIS_ITINERIS_RULESET_ID } from '../../rulesets/vis-itineris/index.js'

/** The ruleset whose repertoires these fields hold. @internal */
const VIS_ITINERIS = VIS_ITINERIS_RULESET_ID

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
	'What they wear and carry to turn blows aside.',
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
/** 🚧 Things used up — drunk, eaten, thrown. @experimental */
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

/*
 * 🚧 Retired (RF fix 8): `DUNGEON_CRAWLER_ABILITY_SLOTS`,
 * `DUNGEON_CRAWLER_SKILL_SLOTS` and `DUNGEON_CRAWLER_POOL_SLOTS` — Vis
 * Itineris's six ability scores, trained skills and spell-point pool, which
 * the genre tracked beside the rules. Vis Itineris's own attributes carry
 * them now, wherever it is played; the kits write and the derive script reads
 * them under the same slots.
 */

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
	// 🚧 No number of the rule (lane G3, 2026-10-23, D9): the session's fall rule says them.
	descriptor: "While the character lies dying at death's door: the death saves passed and failed so far, by the rules' tallies.",
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
 * replaced. 🚧 No longer kept at all (RF fix 8): what an older session held
 * on one is carried into the session's notes (data upgrade 0126).
 * @experimental
 */
export const DUNGEON_CRAWLER_RETIRED_SLOT_IDS = Object.freeze([
	// derive-don't-spell: `registry/slots.ts` loads this module first — the declarations are not yet made.
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
