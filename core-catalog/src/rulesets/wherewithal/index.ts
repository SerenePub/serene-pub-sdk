/**
 * 🚧 **Wherewithal** (`core:ruleset/wherewithal@1`, 2026-10-22, PLAN-rulesets-
 * authoring D3, ruling R3) — core's diceless ruleset, original to Serene Pub:
 * nothing is rolled. A character carries a risk by **spending** from one of
 * three pools (nerve, favour, provisions — a `bid` check method each), weighs
 * **mettle** against mettle in a contest (`compare`), and leaves the rest to
 * the table's judgement (`none`, the default). The people they are bound to
 * (**bonds**, relational pieces) steady their mettle or cost them; **troubles**
 * (its conditions) weigh on it; **boons** restore a pool or lift a trouble.
 *
 * Its parts: the pool slots (`slots.ts`, registering), and here the
 * conventions, selectors, voice, repertoires and compendium;
 * `registry/rulesets.ts` declares the ruleset from them, and its three seeded
 * scripts (derived, effects, render) are `seed/wherewithalScripts.ts`.
 *
 * ⚠ Not **Bonds** (`core:ruleset/bonds@1`, the held name of a relational
 * add-on ruleset): Wherewithal is a whole ruleset whose `bonds` repertoire is
 * one of its parts — a bond here is what a bond is there, a relational piece
 * on the tie between two people.
 */
import {
	defineRepertoire,
	slotSlug,
	type BidCostRow,
	type CheckMethodDecl,
	type CompendiumDecl,
	type ConversionDecl,
	type DegreeCrosswalk,
	type DifficultyBand,
	type RulesetConventions,
	type RulesetProps,
	type RulesetSelectorDecl
} from "@serene-pub/sdk"
import { wherewithalFavourSlot, wherewithalNerveSlot, wherewithalProvisionsSlot } from "./slots.js"

export * from "./slots.js"

/** @experimental */
export const WHEREWITHAL_RULESET_ID = "core:ruleset/wherewithal@1"

const NERVE = slotSlug(wherewithalNerveSlot.id)
const FAVOUR = slotSlug(wherewithalFavourSlot.id)
const PROVISIONS = slotSlug(wherewithalProvisionsSlot.id)

/**
 * 🚧 Five degrees, in its own words. Margins (`from`) are read by a contest
 * (mettle against mettle); a spend buys its degree by the cost table.
 * @experimental
 */
export const WHEREWITHAL_DEGREES: DegreeCrosswalk = Object.freeze({
	bands: [
		{ id: "ruin", label: { en: "It comes apart" }, five: "crit-fail" },
		{ id: "short", label: { en: "It falls short" }, five: "fail", from: -2 },
		{ id: "cost", label: { en: "It holds, at a cost" }, five: "partial", from: 0 },
		{ id: "carried", label: { en: "It carries" }, five: "success", from: 1 },
		{ id: "clean", label: { en: "It carries clean" }, five: "crit", from: 3 }
	]
}) as DegreeCrosswalk

/** 🚧 What a spend from a pool buys: nothing, a cost, the risk carried (2), carried clean (3). @experimental */
export const WHEREWITHAL_COSTS: readonly BidCostRow[] = Object.freeze([
	{ spend: 0, band: "short" },
	{ spend: 1, band: "cost" },
	{ spend: 2, band: "carried" },
	{ spend: 3, band: "clean" }
])

/** 🚧 What a contest is weighed against when nobody stands opposite. @experimental */
export const WHEREWITHAL_CONTEST_BANDS: readonly DifficultyBand[] = Object.freeze<DifficultyBand[]>([
	{ id: "slight", label: { en: "Slight" }, target: 1 },
	{ id: "even", label: { en: "Even" }, target: 3, default: true },
	{ id: "steep", label: { en: "Steep" }, target: 5 },
	{ id: "towering", label: { en: "Towering" }, target: 7 }
])

const spend = (resource: string, label: string): CheckMethodDecl => ({ kind: "bid", label: { en: label }, resource, costs: WHEREWITHAL_COSTS })

/**
 * 🚧 Its conventions: five check methods — three spends, a contest and the
 * table's judgement (the default) — its degrees, time by the scene, two rests.
 * @experimental
 */
export const WHEREWITHAL_CONVENTIONS: RulesetConventions = Object.freeze({
	methods: {
		dare: spend(NERVE, "Spend nerve"),
		sway: spend(FAVOUR, "Spend favour"),
		"make-do": spend(PROVISIONS, "Spend provisions"),
		contest: { kind: "compare", label: { en: "Mettle against mettle" }, opposedBy: "mettle", bands: WHEREWITHAL_CONTEST_BANDS },
		judgement: { kind: "none", label: { en: "The table judges" } }
	},
	defaultMethod: "judgement",
	degrees: WHEREWITHAL_DEGREES,
	time: { unit: "scene" },
	rest: [
		{ id: "breather", label: { en: "A breather" }, recharges: ["scene"] },
		{ id: "night", label: { en: "A night's rest" }, recharges: ["scene", "night"] }
	]
}) as RulesetConventions

/**
 * 🚧 What its pieces may target beyond its stats: mettle (on the sheet — the
 * best pool, steadied by steady bonds, computed by the derive script), the
 * reserve (all three pools), and four checks — three spends and a contest.
 * @experimental
 */
export const WHEREWITHAL_SELECTORS: Readonly<Record<string, RulesetSelectorDecl>> = Object.freeze({
	mettle: { kind: "derived", from: [NERVE, FAVOUR, PROVISIONS], onSheet: true, label: { en: "Mettle" } },
	reserve: { kind: "derived", from: [NERVE, FAVOUR, PROVISIONS], label: { en: "Reserve" } },
	dare: { kind: "check", method: "dare" },
	sway: { kind: "check", method: "sway" },
	"make-do": { kind: "check", method: "make-do" },
	contest: { kind: "check", base: "mettle", method: "contest" }
})

/** 🚧 What a model reads about play under Wherewithal, per rigour (≤ 240 characters each). @experimental */
export const WHEREWITHAL_VOICE: RulesetProps["voice"] = Object.freeze({
	prose:
		"Wherewithal keeps no dice. People carry a risk on nerve, favour and provisions, and on those they are bound to. Outcomes follow what was spent and what the scene makes likely; a trouble stays until the story lifts it.",
	mechanics:
		"The rules decide by spending: a risk costs nerve, favour or provisions — two carries it, three carries it clean. A contest weighs mettle against mettle. Narrate what was spent and what it bought.",
	scripts:
		"Propose who spends which pool and how much, or who contests whom — never results; the rules weigh them. Honour every rider you are given: troubles pile up and wear people thin."
})

const has = (field: string) => ({ path: `piece.${field}`, truthy: true }) as const
const footing = (is: string) => ({ path: "piece.footing", equals: is }) as const

/** 🚧 The people someone is bound to, and how the tie stands. Relational: a bond points towards someone. @experimental */
export const wherewithalBonds = defineRepertoire("bonds", {
	tags: ["relationship"],
	label: { en: "Bonds" },
	description: { en: "The people someone is bound to — kin, friend, rival — and how the tie stands." },
	piece: {
		type: "object",
		fields: {
			tie: {
				type: "enum",
				of: ["kin", "friend", "rival", "mentor", "flame", "debt"],
				label: { en: "Tie" },
				description: { en: "What binds them — kin, friend, rival, mentor, flame or a debt." }
			},
			footing: {
				type: "enum",
				of: ["steady", "strained", "broken"],
				members: [
					{ key: "steady", label: { en: "Steady" } },
					{ key: "strained", label: { en: "Strained" } },
					{ key: "broken", label: { en: "Broken" } }
				],
				default: "steady",
				label: { en: "Footing" },
				description: { en: "How the tie stands now. Steady bonds lend mettle." }
			}
		}
	},
	prose:
		"Bonds: who someone is bound to and how it stands. A steady bond is someone who will stand with them; a strained one helps at a price; a broken one may hinder. Ties shift with what people do to each other.",
	mechanics: [
		{ verb: "rider", target: "mettle", text: "A steady bond: they stand with the holder when asked.", predicate: footing("steady") },
		{ verb: "rider", target: "mettle", text: "A strained bond: they help, and want something for it; a careless word breaks it.", predicate: footing("strained") },
		{ verb: "rider", target: "mettle", text: "A broken bond: they will not help, and may hinder.", predicate: footing("broken") }
	],
	relational: true,
	renderDepth: "summary"
})

/** 🚧 What weighs on someone — its conditions — for as long as it lasts. @experimental */
export const wherewithalTroubles = defineRepertoire("troubles", {
	tags: ["condition"],
	label: { en: "Troubles" },
	description: { en: "What weighs on someone — hurt, disgrace, a debt come due — light or heavy." },
	piece: {
		type: "object",
		fields: {
			weight: {
				type: "enum",
				of: ["light", "heavy"],
				members: [
					{ key: "light", label: { en: "Light" } },
					{ key: "heavy", label: { en: "Heavy" } }
				],
				default: "light",
				label: { en: "Weight" },
				description: { en: "A heavy trouble weighs on every contest." }
			}
		}
	},
	prose:
		"Troubles: what weighs on someone until the story lifts it. Honour them in what the character attempts and how it goes; two or more wear a person thin.",
	mechanics: [
		{ verb: "modify", target: "contest", value: -1, predicate: { path: "piece.weight", equals: "heavy" } },
		{ verb: "rider", target: "mettle", text: "A light trouble colours what they do, and costs nothing yet.", predicate: { path: "piece.weight", equals: "light" } }
	],
	entryable: true,
	renderDepth: "summary"
})

/** 🚧 Help on hand: a pool restored, a trouble lifted, a contest steadied. @experimental */
export const wherewithalBoons = defineRepertoire("boons", {
	tags: ["boon"],
	label: { en: "Boons" },
	description: { en: "Help on hand — a letter, a flask, a token — that restores a pool or lifts a trouble." },
	piece: {
		type: "object",
		fields: {
			restores: {
				type: "enum",
				of: ["nerve", "favour", "provisions"],
				label: { en: "Restores" },
				description: { en: "The pool it restores when used." }
			},
			amount: { type: "integer", min: 1, max: 3, label: { en: "By" }, description: { en: "How much it restores." } },
			uses: { type: "integer", min: 1, label: { en: "Uses" }, description: { en: "How many times it can be used before it is gone." } },
			steadies: { type: "boolean", label: { en: "Steadies" }, description: { en: "Carried ready, it lends a point of mettle in a contest." } }
		}
	},
	prose:
		"Boons: help on hand. Using one restores what it says or lifts a trouble, and spends a use; one carried ready may steady its holder. A boon used up is gone.",
	mechanics: [
		{ verb: "heal", on: "use", amount: { selector: "piece.amount" }, stat: NERVE, predicate: { path: "piece.restores", equals: "nerve" } },
		{ verb: "heal", on: "use", amount: { selector: "piece.amount" }, stat: FAVOUR, predicate: { path: "piece.restores", equals: "favour" } },
		{ verb: "heal", on: "use", amount: { selector: "piece.amount" }, stat: PROVISIONS, predicate: { path: "piece.restores", equals: "provisions" } },
		{ verb: "cure", on: "use", traits: ["shaken"], predicate: { traits: { all: ["steadying"] } } },
		{ verb: "consume", on: "use", predicate: has("uses") },
		{ verb: "modify", on: "equip", target: "contest", value: 1, predicate: has("steadies") }
	],
	entryable: true,
	renderDepth: "summary"
})

/** 🚧 Every repertoire, in sheet order. @internal */
export const WHEREWITHAL_REPERTOIRES = Object.freeze([wherewithalBonds, wherewithalTroubles, wherewithalBoons])

/** The version every row carries. @internal */
export const WHEREWITHAL_COMPENDIUM_VERSION = "1.0.0"

const row = (id: string, piece: Record<string, unknown>) => ({ id, version: WHEREWITHAL_COMPENDIUM_VERSION, piece: piece as never })

/**
 * 🚧 Its compendium: bonds to start from (who they point towards is said when
 * one is held), troubles and boons — written for Serene Pub, Apache-2.0.
 * @experimental
 */
export const WHEREWITHAL_COMPENDIUM: CompendiumDecl = Object.freeze({
	source: { document: "Wherewithal (Serene Pub)", licence: "Apache-2.0" },
	rows: Object.freeze({
		bonds: [
			row("sworn-friend", { name: "Sworn friend", description: "A friend who swore to stand by them, and has not yet been asked to prove it.", tie: "friend", footing: "steady" }),
			row("old-debt", { name: "Old debt", description: "Someone they owe — or who owes them — and neither of them forgets it.", tie: "debt", footing: "strained" }),
			row("rival", { name: "Rival", description: "Someone who wants what they want, and keeps score.", tie: "rival", footing: "strained" }),
			row("mentor", { name: "Mentor", description: "The one who taught them, and still expects better.", tie: "mentor", footing: "steady" }),
			row("estranged-kin", { name: "Estranged kin", description: "Family they no longer speak to. Blood still counts for something.", tie: "kin", footing: "broken" })
		],
		troubles: [
			row("shaken", { name: "Shaken", description: "Rattled: hands unsteady, voice thin.", traits: ["shaken"], weight: "light", duration: { units: "scene", expiry: "scene-end" } }),
			row("hurt", { name: "Hurt", description: "Wounded enough that every effort costs.", traits: ["hurt"], weight: "heavy" }),
			row("disgraced", { name: "Disgraced", description: "Their name is mud here; doors close before they knock.", traits: ["disgraced"], weight: "heavy" }),
			row("worn-out", { name: "Worn out", description: "Too tired to think straight until they have slept.", traits: ["worn-out"], weight: "light", duration: { units: "until-removed", expiry: "rest" } }),
			row("hunted", { name: "Hunted", description: "Someone is looking for them, and asking questions.", traits: ["hunted"], weight: "light" }),
			row("heartsick", { name: "Heartsick", description: "Grief or longing that colours everything they do.", traits: ["heartsick"], weight: "light" })
		],
		boons: [
			row("strong-drink", { name: "Strong drink", description: "A flask of something strong. It steadies the hands, if not the judgement.", traits: ["steadying"], restores: "nerve", amount: 1, uses: 1 }),
			row("letter-of-introduction", { name: "Letter of introduction", description: "A sealed letter from someone people listen to.", restores: "favour", amount: 2, uses: 1 }),
			row("travel-rations", { name: "Travel rations", description: "Hard bread, dried fruit and a little salt fish — enough for the road.", restores: "provisions", amount: 1, uses: 2 }),
			row("lucky-token", { name: "Lucky token", description: "A worn coin or a ribbon they will not go without.", steadies: true }),
			row("safe-house-key", { name: "Safe-house key", description: "A key to a door where nobody asks questions." })
		]
	})
}) as CompendiumDecl

/**
 * 🚧 Freeform → Wherewithal: nothing maps by id (Freeform keeps no numbers),
 * so every piece arrives as prose for review. Wherewithal → Freeform needs no
 * declaration: Freeform takes any ruleset's pieces by prose carry.
 * @experimental
 */
export const WHEREWITHAL_FROM_FREEFORM: ConversionDecl = Object.freeze({
	from: "core:ruleset/freeform@1",
	to: WHEREWITHAL_RULESET_ID,
	idMap: Object.freeze([])
})

/** 🚧 Its seeded scripts, by phase (`seed/wherewithalScripts.ts`). @experimental */
export const WHEREWITHAL_SCRIPT_KEYS = Object.freeze({
	derive: "core:script/wherewithal-derive",
	strain: "core:script/wherewithal-strain",
	render: "core:script/wherewithal-render"
} as const)
