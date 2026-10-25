/**
 * 🚧 The **d20-style** ruleset template (2026-10-22; in the seven sections over core's functions since
 * 2026-10-23, lane A2): one die against a target — three stats, health, weapons that harm on a hit,
 * conditions that get in the way, six sample rows and a playtest scene. Copied, never played.
 */
import { defineRulesetTemplate } from "@serene-pub/sdk"
import { hpSlot } from "../../registry/slots.js"
import { dieTargetFunction, tallyFunction } from "../../functions/index.js"
import { checkRef, LASTS_FIELD } from "../sections.js"
/** @experimental */ export const D20_STYLE_TEMPLATE_ID = "core:ruleset/template-d20-style@1"
const en = (en: string) => ({ en })
const stat = (id: string, name: string, means: string) =>
	({ id, name: en(name), kind: "number", bounds: { min: -3, max: 5 }, start: 0, prose: `${name}: a modifier from −3 to +5, added to a d20 when a check calls for it. ${means}` }) as const
const row = (id: string, piece: Record<string, unknown>) => ({ id, version: "1.0.0", piece: piece as never })
const band = (id: string, label: string, target: number, def?: true) => ({ id, label: en(label), target, ...(def ? { default: def } : {}) })
/** 🚧 @experimental */
export const d20StyleTemplate = defineRulesetTemplate(D20_STYLE_TEMPLATE_ID, {
	label: en("d20-style"),
	about: en("Roll a twenty-sided die, add a modifier and meet a target: beat it by ten for a critical. Three stats, health, weapons that harm on a hit and conditions that get in the way — the familiar heroic shape, small enough to read in one sitting."),
	goodFor: en("Fights, dungeons and heroics, where one roll should feel decisive."),
	ruleset: {
		template: true,
		name: en("d20-style"),
		description: en("One d20 plus a modifier against a target; three stats, health, weapons and conditions."),
		voice: {
			prose: "Heroic and quick: risky acts meet fair odds, and a strong arm, a quick hand or a clear head tilts them. Keep numbers out of the story.",
			mechanics: "The rules roll and hand you the result: hit or miss, harm dealt. Narrate what you are given, never a number of your own.",
			scripts: "Dice are rolled for you. Propose small steps — a swing, a shot, a dodge — never totals; narrate results as given."
		},
		attributes: [stat("might", "Might", "Strength and force."), stat("grace", "Grace", "Speed, aim and balance."), stat("wits", "Wits", "Noticing, reasoning and keeping one's head."), { id: "hp", slot: hpSlot.id, borrowed: true, start: 10, config: { min: 0, max: 30 } }],
		functions: [
			{ ref: dieTargetFunction.id, key: "d20", options: { label: en("Roll a d20"), sides: 20, naturalShift: { high: 20, low: 1 }, bands: [band("easy", "Easy", 10), band("medium", "Medium", 13, true), band("hard", "Hard", 16), band("heroic", "Heroic", 20)] } },
			...(["might", "grace", "wits"] as const).map((s) => checkRef(`check.${s}`, { base: s })),
			checkRef("attack.melee", { base: "might" }),
			checkRef("attack.ranged", { base: "grace" }),
			{ ref: tallyFunction.id, key: "damage" }
		],
		entryTypes: [
			{ id: "weapons", name: en("Weapons"), description: en("What someone fights with, and the dice it deals."), tags: ["weapon"], fields: { damage: { type: "string", required: true, label: en("Damage"), description: en("Dice it deals — '1d8'.") } }, prose: "Weapons: what someone fights with. A hit deals the weapon's dice plus the attack's modifier off the target's health.", mechanics: [{ verb: "harm", on: "hit", amount: { selector: "piece.damage" }, plus: "check", stat: "hp" }] },
			{ id: "conditions", name: en("Conditions"), description: en("What ails someone until it passes."), tags: ["condition"], traits: true, fields: { duration: LASTS_FIELD }, prose: "Conditions: what ails someone until it passes. The frightened and the poisoned attack worse; the stunned lose their turn.", mechanics: [{ verb: "modify", target: "attack", value: -2, predicate: { traits: { any: ["frightened", "poisoned"] } } }, { verb: "rider", target: "hp", text: "Stunned: they lose their next turn.", predicate: { traits: { all: ["stunned"] } } }], renderDepth: "summary" }
		],
		outcomes: [{ id: "miss", label: en("Miss"), five: "fail" }, { id: "hit", label: en("Hit"), five: "success", from: 0 }, { id: "critical", label: en("Critical"), five: "crit", from: 10 }],
		time: { unit: "round", roundSeconds: 6, turns: { perTurn: 1, reaction: true }, rests: [{ id: "rest", label: en("A night's rest"), minutes: 480 }] },
		library: {
			source: { document: "d20-style template (Serene Pub)", licence: "Apache-2.0" },
			rows: {
				weapons: [row("longsword", { name: "Longsword", description: "A straight blade for one hand or two.", damage: "1d8" }), row("shortbow", { name: "Shortbow", description: "Light, quick, and quiet enough.", damage: "1d6" }), row("dagger", { name: "Dagger", description: "Easy to hide, easy to draw.", damage: "1d4" })],
				conditions: [row("frightened", { name: "Frightened", description: "Shaking; every swing goes wide.", traits: ["frightened"] }), row("poisoned", { name: "Poisoned", description: "Sick and slow until it wears off.", traits: ["poisoned"] }), row("stunned", { name: "Stunned", description: "Reeling, unable to act.", traits: ["stunned"], duration: { units: "round", value: 1, expiry: "turn-end" } })]
			}
		}
	},
	playtest: {
		party: [
			{ name: "Bryn", stats: { might: 3, grace: 1, hp: 12 }, pieces: { weapons: ["longsword"], conditions: [] } },
			{ name: "Bandit", stats: { might: 1, grace: 2, hp: 8 }, pieces: { weapons: ["dagger"], conditions: ["frightened"] } }
		],
		situation: en("A bandit blocks the bridge, already losing their nerve. Bryn swings first."),
		change: { owner: "Bryn", op: "hit", check: "attack.melee", repertoire: "weapons", piece: "longsword", against: 13, aimedAt: "Bandit" }
	}
})
