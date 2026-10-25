/**
 * 🚧 The **dice-pool** ruleset template (2026-10-22; in the seven sections over core's functions since
 * 2026-10-23, lane A2): roll as many six-sided dice as a stat says and count the fives and sixes — three
 * stats, gear that adds a die, conditions that take one away, talents, two sample rows each and a playtest
 * scene. Copied, never played.
 */
import { defineRulesetTemplate } from "@serene-pub/sdk"
import { dicePoolFunction } from "../../functions/index.js"
import { checkRef, LASTS_FIELD } from "../sections.js"
/** @experimental */ export const DICE_POOL_TEMPLATE_ID = "core:ruleset/template-dice-pool@1"
const en = (en: string) => ({ en })
const stat = (id: string, name: string, means: string) =>
	({ id, name: en(name), kind: "number", bounds: { min: 1, max: 5 }, start: 2, prose: `${name}: how many six-sided dice a check with it rolls, from 1 to 5. ${means}` }) as const
const row = (id: string, piece: Record<string, unknown>) => ({ id, version: "1.0.0", piece: piece as never })
/** 🚧 @experimental */
export const dicePoolTemplate = defineRulesetTemplate(DICE_POOL_TEMPLATE_ID, {
	label: en("Dice pool"),
	about: en("Roll as many six-sided dice as the stat says and count every five and six: none is a miss, one a mixed result, two a hit, four a triumph. Gear adds dice, conditions take them away — the more you bring, the better your odds, and nothing is ever certain."),
	goodFor: en("Gritty, swingy play where preparation and help visibly change the odds."),
	ruleset: {
		template: true,
		name: en("Dice pool"),
		description: en("A pool of d6 from a stat, success on 5 or 6; gear, conditions and talents move the pool."),
		voice: {
			prose: "Every risk is a handful of dice: the more someone brings to it, the better their odds, and a mixed result costs something. Keep numbers out of the story.",
			mechanics: "The rules roll the pool and hand you how it went — a miss, a mixed result, a hit or a triumph. Narrate that, and what a mixed result cost.",
			scripts: "Pools are rolled for you. Propose the roll — whose, which stat, which tool — never the count; narrate the result as given."
		},
		attributes: [stat("body", "Body", "Strength, speed and stamina."), stat("mind", "Mind", "Knowing, noticing, working things out."), stat("heart", "Heart", "Charm, nerve and will.")],
		functions: [
			{ ref: dicePoolFunction.id, key: "pool", options: { label: en("Roll the pool"), sides: 6, successOn: 5, countToDegree: [{ from: 0, band: "miss" }, { from: 1, band: "mixed" }, { from: 2, band: "hit" }, { from: 4, band: "triumph" }] } },
			...(["body", "mind", "heart"] as const).map((s) => checkRef(`roll.${s}`, { base: s }))
		],
		entryTypes: [
			{ id: "gear", name: en("Gear"), description: en("Tools and kit; the right one adds a die."), tags: ["gear"], prose: "Gear: the tools someone carries. Using the right one for the job adds a die to the roll.", mechanics: [{ verb: "modify", on: "use", target: "roll", value: 1 }] },
			{ id: "conditions", name: en("Conditions"), description: en("What holds someone back; each takes a die away."), tags: ["condition"], traits: true, fields: { duration: LASTS_FIELD }, prose: "Conditions: what holds someone back until it passes. A hurt or frightened character rolls a die fewer.", mechanics: [{ verb: "modify", target: "roll", value: -1, predicate: { traits: { any: ["hurt", "afraid"] } } }], renderDepth: "summary" },
			{ id: "talents", name: en("Talents"), description: en("What someone is unusually good at."), tags: ["talent"], traits: true, prose: "Talents: what someone does better than most. A talent that fits the roll adds a die.", mechanics: [{ verb: "modify", target: "roll.mind", value: 1, predicate: { traits: { all: ["scholar"] } } }, { verb: "modify", target: "roll.heart", value: 1, predicate: { traits: { all: ["silver-tongue"] } } }] }
		],
		outcomes: [{ id: "miss", label: en("Miss"), five: "fail" }, { id: "mixed", label: en("Mixed"), five: "partial" }, { id: "hit", label: en("Hit"), five: "success" }, { id: "triumph", label: en("Triumph"), five: "crit" }],
		time: { unit: "scene" },
		library: {
			source: { document: "Dice-pool template (Serene Pub)", licence: "Apache-2.0" },
			rows: {
				gear: [row("lockpicks", { name: "Lockpicks", description: "A roll of slim picks and a tension wrench." }), row("climbing-rope", { name: "Climbing rope", description: "Thirty feet of knotted rope and a hook." })],
				conditions: [row("hurt", { name: "Hurt", description: "Bleeding and slow.", traits: ["hurt"] }), row("afraid", { name: "Afraid", description: "Jumping at shadows.", traits: ["afraid"], duration: { units: "scene", expiry: "scene-end" } })],
				talents: [row("scholar", { name: "Scholar", description: "Has read more than is good for anyone.", traits: ["scholar"] }), row("silver-tongue", { name: "Silver tongue", description: "Could talk a cat off a fishmonger's cart.", traits: ["silver-tongue"] })]
			}
		}
	},
	playtest: {
		party: [
			{ name: "Wren", stats: { body: 2, mind: 3, heart: 2 }, pieces: { gear: ["lockpicks"], conditions: [], talents: ["scholar"] } },
			{ name: "Oskar", stats: { body: 3, mind: 1, heart: 2 }, pieces: { gear: ["climbing-rope"], conditions: ["hurt"], talents: [] } }
		],
		situation: en("Wren works the lock on the archive door while the guard's footsteps come closer."),
		change: { owner: "Wren", op: "use", check: "roll.mind", repertoire: "gear", piece: "lockpicks" }
	}
})
