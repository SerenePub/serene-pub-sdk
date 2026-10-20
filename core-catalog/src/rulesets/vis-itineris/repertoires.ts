/**
 * 🚧 Vis Itineris's repertoires — the kinds of piece its owners hold. Pure
 * declarations: a repertoire registers through the ruleset that lists it.
 *
 * Piece fields are plain English. A trait says only what no field does — a
 * weapon's properties (finesse, thrown, a mastery), a condition's common id;
 * what a field already says (training, hands, school, damage type) a
 * predicate tests on the field (`piece.versatileDie`), never twice as a
 * trait (audit D, 2026-10-17). How long a piece lasts on its holder is the
 * universal `duration` part, never a field here; whether it is worn or
 * wielded, the universal `equipped`.
 * Prices are in copper pieces (1 gp = 100 cp); weights in pounds.
 */
import { defineRepertoire, type FieldDecl } from "@serene-pub/sdk"

const choice = (label: string, options: ReadonlyArray<readonly [string, string]>, extra: Partial<FieldDecl> = {}): FieldDecl => ({
	type: "enum",
	of: options.map(([k]) => k),
	members: options.map(([key, l]) => ({ key, label: { en: l } })),
	label: { en: label },
	...extra
})
const int = (label: string, extra: Partial<FieldDecl> = {}): FieldDecl => ({ type: "integer", label: { en: label }, ...extra })
const num = (label: string, extra: Partial<FieldDecl> = {}): FieldDecl => ({ type: "number", label: { en: label }, ...extra })
const str = (label: string, extra: Partial<FieldDecl> = {}): FieldDecl => ({ type: "string", label: { en: label }, ...extra })
const bool = (label: string, extra: Partial<FieldDecl> = {}): FieldDecl => ({ type: "boolean", label: { en: label }, ...extra })
const obj = (label: string, fields: Record<string, FieldDecl>, extra: Partial<FieldDecl> = {}): FieldDecl => ({
	type: "object",
	label: { en: label },
	fields,
	...extra
})

/** @internal */
export const DAMAGE_TYPES: ReadonlyArray<readonly [string, string]> = [
	["acid", "Acid"],
	["bludgeoning", "Bludgeoning"],
	["cold", "Cold"],
	["fire", "Fire"],
	["force", "Force"],
	["lightning", "Lightning"],
	["necrotic", "Necrotic"],
	["piercing", "Piercing"],
	["poison", "Poison"],
	["psychic", "Psychic"],
	["radiant", "Radiant"],
	["slashing", "Slashing"],
	["thunder", "Thunder"]
]
const DIE: ReadonlyArray<readonly [string, string]> = [
	["d4", "d4"],
	["d6", "d6"],
	["d8", "d8"],
	["d10", "d10"],
	["d12", "d12"]
]
const ABILITY: ReadonlyArray<readonly [string, string]> = [
	["strength", "Strength"],
	["dexterity", "Dexterity"],
	["constitution", "Constitution"],
	["intelligence", "Intelligence"],
	["wisdom", "Wisdom"],
	["charisma", "Charisma"]
]
/**
 * What using a thing takes — one list for spells, consumables and features
 * (audit D: `actions` was an integer on spells and a choice on features).
 */
const ACTIVATION: ReadonlyArray<readonly [string, string]> = [
	["action", "An action"],
	["bonus-action", "A bonus action"],
	["reaction", "A reaction"],
	["free", "Free"],
	["passive", "Always on"],
	["minute", "A minute"],
	["ten-minutes", "Ten minutes"],
	["hour", "An hour"]
]
const activation = (fallback: string) => choice("Takes", ACTIVATION, { default: fallback })

/**
 * 🚧 A piece field holds something (2026-10-18): the predicate the effects
 * executed on use say "only where the piece has it" with.
 */
const has = (field: string) => ({ path: `piece.${field}`, truthy: true }) as const
/** A finesse blade or a weapon that shoots (P2-2): Strength or Dexterity, whichever is higher. */
const FINESSE_OR_RANGED = { traits: { any: ["finesse", "ammunition"] } } as const
/** A spell that rolls an attack or calls for a save: resolved by its own roll, never taken whole on a cast. */
const SPELL_RESISTED = {
	any: [
		{ path: "piece.attack", equals: "melee" },
		{ path: "piece.attack", equals: "ranged" },
		...ABILITY.map(([k]) => ({ path: "piece.save", equals: k }))
	]
}
const damageType = (extra: Partial<FieldDecl> = {}) => choice("Damage type", DAMAGE_TYPES, extra)
const weight = num("Weight", { min: 0, description: { en: "In pounds." } })
const cost = int("Price", { min: 0, description: { en: "In copper pieces; 100 make a gold piece." } })

/** 🚧 @experimental */
export const visItinerisWeapons = defineRepertoire("weapons", {
	label: { en: "Weapons" },
	description: { en: "Blades, bows and clubs: what a character fights with." },
	piece: obj("Weapon", {
		category: choice("Training needed", [["simple", "Simple"], ["martial", "Martial"]], { required: true }),
		damage: obj("Damage", { dice: int("Dice", { min: 1, required: true }), die: choice("Die", DIE, { required: true }) }, { required: true }),
		damageType: damageType(),
		versatileDie: choice("Two-handed damage", DIE),
		range: obj("Range", { normal: int("Normal", { min: 5, required: true }), long: int("Long", { min: 5 }) }, { description: { en: "In feet; thrown or shot." } }),
		hands: int("Hands", { min: 1, max: 2, default: 1 }),
		weight,
		cost
	}),
	prose:
		"Weapons: how each one handles decides how it is used. Light ones pair, heavy ones need strength, finesse ones reward a quick hand, and a ranged one needs room and ammunition. A hit deals the weapon's damage plus the wielder's Strength — Dexterity for a finesse or ranged weapon, if higher.",
	// 🚧 Executed by the handler (2026-10-18, owner ruling ★4, P2-1/P2-2):
	// the attack of a finesse or ranged weapon rolls with the better of
	// Strength and Dexterity, and a hit takes the weapon's dice plus that
	// same modifier off the target's health. The rider that only said so
	// (and showed on the table's line as if it had happened) is gone.
	mechanics: [
		{ verb: "rollWith", on: "hit", target: "attack", from: ["strength-mod", "dexterity-mod"], predicate: FINESSE_OR_RANGED },
		{ verb: "harm", on: "hit", dice: "piece.damage", plus: "check", stat: "hp" },
		{ verb: "rider", on: "hit", text: "Wielded in two hands, a versatile weapon rolls its two-handed die instead.", predicate: { path: "piece.versatileDie", truthy: true } }
	],
	entryable: true,
	renderDepth: "summary"
})

/** 🚧 @experimental */
export const visItinerisArmour = defineRepertoire("armour", {
	label: { en: "Armour" },
	description: { en: "What a character wears or carries to turn blows aside." },
	piece: obj("Armour", {
		category: choice("Armour type", [["light", "Light"], ["medium", "Medium"], ["heavy", "Heavy"], ["shield", "Shield"]], { required: true }),
		acBase: int("Armour value", { min: 0, required: true, description: { en: "Armour class it gives; for a shield, what it adds." } }),
		dexCap: int("Dexterity limit", { min: 0, description: { en: "The most Dexterity adds to it; absent, no limit." } }),
		strength: int("Strength needed", { min: 1, max: 30 }),
		noisy: bool("Noisy", { default: false, description: { en: "Hard to sneak in." } }),
		weight,
		cost
	}),
	prose: "Armour sets how hard someone is to hit. Heavy armour slows the weak and is never quiet; a shield adds to whatever is worn.",
	mechanics: [
		{ verb: "modify", on: "equip", target: "skill.stealth", value: -1, bonusType: "edge", predicate: { path: "piece.noisy", truthy: true } },
		{ verb: "rider", on: "equip", text: "Worn armour sets armour class to its value plus Dexterity, up to its limit; a shield adds its value. Below the Strength it needs, speed drops by 10 feet." }
	],
	entryable: true,
	renderDepth: "summary"
})

/** 🚧 @experimental */
export const visItinerisGear = defineRepertoire("gear", {
	label: { en: "Gear" },
	description: { en: "Tools, kits and everything else an adventurer packs." },
	piece: obj("Gear", {
		sort: choice("Sort", [["tool", "Tool"], ["container", "Container"], ["light", "Light source"], ["camp", "Camp"], ["kit", "Kit"], ["other", "Other"]], { default: "other" }),
		uses: int("Uses", { min: 1 }),
		weight,
		cost
	}),
	prose: "Gear: having the right tool makes a task possible or easier; lacking it makes some tasks impossible. Lights, rope and tools matter in dark and awkward places.",
	mechanics: [
		{ verb: "rider", on: "use", text: "A tool suited to the task removes a handicap a bare-handed attempt would have." },
		// 🚧 Gear that counts its uses spends one each time (2026-10-18, P2-1).
		{ verb: "consume", on: "use", predicate: has("uses") }
	],
	entryable: true,
	renderDepth: "index"
})

/** 🚧 @experimental */
export const visItinerisConsumables = defineRepertoire("consumables", {
	label: { en: "Consumables" },
	description: { en: "Potions, food and other things used up." },
	piece: obj("Consumable", {
		uses: int("Uses", { min: 1, default: 1, required: true }),
		activation: activation("action"),
		heals: str("Heals", { description: { en: "Dice it heals, as '2d4+2'." } }),
		damage: obj("Damage", { formula: str("Dice", { required: true }) }),
		damageType: damageType(),
		weight,
		cost
	}),
	prose: "Consumables: each use spends one; when none remain the thing is gone. Drinking or throwing one takes time in a fight. A healing draught heals by its dice, a thrown one harms by them, and an antitoxin ends poison.",
	// 🚧 Executed by the handler (2026-10-18, owner ruling ★4, P2-1): a use
	// spends one, landed or not; a draught heals its dice on the one who
	// drinks it (or the one it is given to); a thrown flask harms its target;
	// an antitoxin (`poison-ward`) ends Poisoned and Envenomed and keeps them
	// off for the rest of the turn.
	mechanics: [
		{ verb: "consume", on: "use" },
		{ verb: "consume", on: "hit" },
		{ verb: "heal", on: "use", dice: "piece.heals", stat: "hp", predicate: has("heals") },
		{ verb: "harm", on: "use", dice: "piece.damage", stat: "hp", predicate: has("damage") },
		{ verb: "harm", on: "hit", dice: "piece.damage", stat: "hp", predicate: has("damage") },
		{ verb: "cure", on: "use", traits: ["condition-poisoned", "condition-envenomed"], predicate: { traits: { all: ["poison-ward"] } } }
	],
	entryable: true,
	renderDepth: "index"
})

/** 🚧 @experimental */
export const visItinerisSpells = defineRepertoire("spells", {
	label: { en: "Spells" },
	description: { en: "Magic a character knows or has prepared." },
	piece: obj("Spell", {
		level: int("Spell level", { min: 0, max: 9, required: true, description: { en: "0 is a cantrip." } }),
		school: choice(
			"School",
			[
				["abjuration", "Abjuration"],
				["conjuration", "Conjuration"],
				["divination", "Divination"],
				["enchantment", "Enchantment"],
				["evocation", "Evocation"],
				["illusion", "Illusion"],
				["necromancy", "Necromancy"],
				["transmutation", "Transmutation"]
			],
			{ required: true }
		),
		activation: activation("action"),
		actionCost: int("Actions", { min: 1, max: 3, description: { en: "With three actions a turn, how many it takes." } }),
		components: obj("Components", { verbal: bool("Spoken"), somatic: bool("Gestures"), material: bool("Material"), materials: str("Materials") }),
		range: obj("Range", {
			kind: choice("Kind", [["self", "Self"], ["touch", "Touch"], ["feet", "Feet"], ["sight", "Sight"]], { required: true }),
			feet: int("Feet", { min: 5 })
		}),
		area: obj("Area", { shape: choice("Shape", [["sphere", "Sphere"], ["cone", "Cone"], ["cube", "Cube"], ["line", "Line"], ["emanation", "Emanation"]], { required: true }), size: int("Size", { min: 5, required: true }) }),
		// How long the spell's effect lasts once cast — not the universal
		// `duration`, which would count a known spell down and take it away.
		effectDuration: obj("Lasts", {
			units: choice("Units", [["instant", "Instant"], ["round", "Rounds"], ["minute", "Minutes"], ["hour", "Hours"], ["day", "Days"], ["until-dispelled", "Until ended"]], { required: true }),
			value: int("How many", { min: 1 })
		}),
		focus: bool("Needs focus", { default: false, description: { en: "Held by sustaining or by concentration, per the table's setting." } }),
		ritual: bool("Can be a ritual", { default: false }),
		save: choice("Resisted by", [["none", "Nothing"], ...ABILITY], { default: "none" }),
		attack: choice("Spell attack", [["none", "None"], ["melee", "Melee"], ["ranged", "Ranged"]], { default: "none" }),
		damage: obj("Damage", { formula: str("Dice", { required: true }) }),
		damageType: damageType(),
		heals: str("Heals", { description: { en: "Dice it heals; the caster's spellcasting modifier is added." } }),
		heighten: obj("Stronger with a higher slot", { perLevel: str("Per level", { required: true, description: { en: "Dice added per slot level above the spell's." } }) }),
		cantripScaling: obj("Grows with the caster", { add: str("Adds", { required: true, description: { en: "Dice added at character levels 5, 11 and 17." } }) })
	}),
	prose:
		"Spells: casting one spends a slot of its level or higher until a long rest (or, at a table playing spell points, points equal to its level); cantrips cost nothing, and a higher slot strengthens a spell that says so. A spell that needs focus ends when the caster stops holding it.",
	// 🚧 Executed by the handler (2026-10-18, P2-1): a healing spell heals its
	// dice plus the caster's spellcasting modifier on its target; a spell
	// attack that hits deals its dice; a damage spell that neither rolls an
	// attack nor calls for a save (Magic Missile) deals them on a cast. What
	// it costs — a slot, or spell points — is its own change (`spend`), as
	// the prose says; the rider that repeated it read on the table's line as
	// if it had happened, and is gone.
	mechanics: [
		{ verb: "rider", on: "use", text: "A focus spell ends any other focus spell the caster holds.", predicate: { path: "piece.focus", truthy: true } },
		{ verb: "heal", on: "use", dice: "piece.heals", plus: ["casting-mod"], stat: "hp", predicate: has("heals") },
		{ verb: "harm", on: "hit", dice: "piece.damage", stat: "hp", predicate: has("damage") },
		{ verb: "harm", on: "use", dice: "piece.damage", stat: "hp", predicate: { all: [has("damage"), { not: SPELL_RESISTED }] } }
	],
	entryable: true,
	renderDepth: "summary",
	// Pieces stored before 2026-10-17 still read. `duration` is not renamed:
	// it is now every piece's universal part.
	renames: { castingTime: "activation", actions: "actionCost" }
})

/** 🚧 @experimental */
export const visItinerisSpellSlots = defineRepertoire("spell-slots", {
	label: { en: "Spell slots" },
	description: { en: "How many spells of each level a caster can still cast before resting." },
	piece: obj("Spell slots", {
		level: int("Level", { min: 1, max: 9, required: true }),
		max: int("Slots", { min: 0, required: true }),
		used: int("Spent", { min: 0, default: 0 }),
		recharge: choice("Comes back on", [["long", "A long rest"], ["short", "A short rest"]], { default: "long" })
	}),
	prose: "Spell slots: the casting a character has left at each level. Spent slots return on the rest they name.",
	mechanics: [{ verb: "rider", on: "rest", text: "A long rest restores every spent slot; a short rest restores only slots that recharge on a short rest." }],
	renderDepth: "index",
	earshot: "holder"
})

/** 🚧 @experimental */
export const visItinerisFeatures = defineRepertoire("features", {
	label: { en: "Features" },
	description: { en: "What a character's training and nature let them do." },
	piece: obj("Feature", {
		source: choice("From", [["class", "Class"], ["species", "Species"], ["background", "Background"]], { required: true }),
		levelGained: int("Gained at", { min: 1, max: 20 }),
		activation: activation("passive"),
		usesMax: int("Uses", { min: 1 }),
		usesSpent: int("Uses spent", { min: 0, default: 0 }),
		recharge: choice("Comes back on", [["short", "A short rest"], ["long", "A long rest"], ["none", "Never"]], { default: "long" })
	}),
	prose: "Features: what training and nature let a character do. A limited one comes back on the rest it names.",
	mechanics: [{ verb: "rider", on: "rest", text: "A feature's spent uses return on the rest it names: a long rest returns both kinds." }],
	renderDepth: "index",
	renames: { actions: "activation" }
})

/** 🚧 @experimental */
export const visItinerisFeats = defineRepertoire("feats", {
	label: { en: "Feats" },
	description: { en: "Talents a character chose to learn." },
	piece: obj("Feat", {
		category: choice("Sort", [["origin", "Origin"], ["general", "General"], ["fighting-style", "Fighting style"], ["epic", "Epic"]], { required: true }),
		prerequisite: str("Needs"),
		repeatable: bool("Can be taken again", { default: false })
	}),
	prose: "Feats: talents a character chose. Each changes what they are good at, always, without being spent.",
	mechanics: [
		{ verb: "modify", target: "attack.ranged", value: 2, predicate: { traits: { all: ["feat-archery"] } } },
		{ verb: "modify", target: "initiative", value: 2, predicate: { traits: { all: ["feat-alert"] } } },
		{ verb: "rider", target: "itineris-hp-max", text: "Tough: health maximum rises by 2 for every level.", predicate: { traits: { all: ["feat-tough"] } } }
	],
	entryable: true,
	renderDepth: "index"
})

/** 🚧 @experimental */
export const visItinerisConditions = defineRepertoire("conditions", {
	label: { en: "Conditions" },
	description: { en: "What ails or hinders someone, and for how long." },
	// No fields of its own: how long a condition lasts is the universal
	// `duration`; the severity field no row ever filled was dropped (audit D).
	prose: "Conditions: states that hinder what someone can do until they pass. Honour them in what the character attempts and how it goes.",
	mechanics: [
		{ verb: "modify", target: "attack", value: -1, bonusType: "edge", predicate: { traits: { any: ["condition-poisoned", "condition-prone", "condition-restrained", "condition-frightened"] } } },
		{ verb: "modify", target: "check", value: -1, bonusType: "edge", predicate: { traits: { any: ["condition-poisoned", "condition-frightened"] } } },
		{ verb: "modify", target: "save.dexterity", value: -1, bonusType: "edge", predicate: { traits: { all: ["condition-restrained"] } } },
		{ verb: "rider", on: "turn", text: "At the end of the holder's turn, a timed condition counts down; at zero it ends. A frightened creature may not move closer to what frightens it." },
		// Envenomed — ours, not the SRD's (PLAN-sheet-widget-redesign §7): the
		// SRD's Poisoned harms nothing, so a venom that bites each round is a
		// condition of its own.
		{ verb: "modify", on: "elapsed", every: 1, target: "hp", value: -1, predicate: { traits: { all: ["condition-envenomed"] } } },
		{
			verb: "rider",
			on: "turn",
			text: "Envenomed: health drops by 1 every round it lasts. At the end of each of their turns the holder may make a Constitution save against the venom (difficulty 12 unless it says otherwise); a success, or a dose of antitoxin, ends it.",
			predicate: { traits: { all: ["condition-envenomed"] } }
		}
	],
	entryable: true,
	renderDepth: "summary",
	retired: ["value"]
})

/** 🚧 The ways out of a place, held by the place they lead from. @experimental */
export const visItinerisExits = defineRepertoire("exits", {
	label: { en: "Exits" },
	description: { en: "Doors, passages and roads out of a place, and what crossing each takes." },
	piece: obj("Exit", {
		way: choice("Way", [["door", "Door"], ["passage", "Passage"], ["road", "Road"], ["stair", "Stair"], ["bridge", "Bridge"], ["gate", "Gate"], ["portal", "Portal"]], { required: true }),
		state: choice("State", [["open", "Open"], ["closed", "Closed"], ["locked", "Locked"], ["hidden", "Hidden"], ["broken", "Broken"]], { default: "open" }),
		lockDc: int("Lock difficulty", { min: 1, max: 30 }),
		forceDc: int("Force difficulty", { min: 1, max: 30 }),
		noticeDc: int("Notice difficulty", { min: 1, max: 30, description: { en: "To find it while hidden." } }),
		// 🚧 A trap carries its own effect (PLAN-dc-after-walk3 R2-1, owner
		// ruling ★2): the dice in `damage`, and a `condition` it leaves — both
		// rolled and laid by the table on whoever springs it.
		trap: obj("Trap", {
			name: str("Name", { required: true }),
			dc: int("Difficulty", { min: 1, max: 30, required: true }),
			damage: str("Damage"),
			condition: str("Condition", { description: { en: "A condition it leaves on whoever springs it: poisoned, prone, restrained, frightened." } })
		}),
		travelMinutes: int("Travel time", { min: 0, description: { en: "Minutes to cross or follow it." } })
	}),
	prose: "Exits from this place: how each way out stands and what crossing it takes. A locked way needs picking or forcing; a hidden one is not known until found.",
	mechanics: [
		{ verb: "rider", on: "traverse", text: "Crossing a locked way takes a check against its lock difficulty to pick, or its force difficulty to break. A trap springs unless noticed or disarmed: it deals its damage and leaves its condition on whoever tried." }
	],
	relational: true,
	appliesTo: ["location"],
	renderDepth: "index"
})

/** 🚧 A creature's stat block, as one piece. @experimental */
export const visItinerisCreatures = defineRepertoire("creatures", {
	label: { en: "Creatures" },
	description: { en: "Beasts, monsters and foes, each with a short stat block." },
	piece: obj("Creature", {
		level: int("Threat", { min: 0, max: 30, required: true, description: { en: "A benchmark: a fair fight for a party of this level." } }),
		size: choice("Size", [["tiny", "Tiny"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"], ["huge", "Huge"], ["gargantuan", "Gargantuan"]], { default: "medium" }),
		ac: int("Armour class", { min: 1, max: 30, required: true }),
		hp: int("Health", { min: 1, required: true }),
		speed: int("Speed", { min: 0, default: 30 }),
		abilities: obj("Abilities", Object.fromEntries(ABILITY.map(([k, l]) => [k, int(l, { min: 1, max: 30 })]))),
		attacks: {
			type: "list",
			label: { en: "Attacks" },
			item: obj("Attack", {
				name: str("Name", { required: true }),
				bonus: int("Attack bonus", { required: true }),
				damage: str("Damage", { required: true }),
				damageType: damageType(),
				reach: int("Reach or range", { min: 5 })
			})
		}
	}),
	prose: "Creatures: what a foe is and how dangerous. Its threat says how hard a fight it is; its attacks say how it hurts people.",
	mechanics: [{ verb: "rider", on: "hit", text: "A creature attacks with the bonus and damage its stat block lists." }],
	appliesTo: ["cast", "location"],
	entryable: true,
	renderDepth: "summary",
	gmOnly: true
})

/** Every Vis Itineris repertoire, in sheet order. @internal */
export const VIS_ITINERIS_REPERTOIRES = Object.freeze([
	visItinerisWeapons,
	visItinerisArmour,
	visItinerisGear,
	visItinerisConsumables,
	visItinerisSpells,
	visItinerisSpellSlots,
	visItinerisFeatures,
	visItinerisFeats,
	visItinerisConditions,
	visItinerisExits,
	visItinerisCreatures
])
