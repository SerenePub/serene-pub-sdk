/**
 * ⏳ The attribute slots the three dice templates carried before the seven
 * sections (2026-10-22, M3) — kept registered, byte for byte, for one
 * release so a ruleset copied from a template then still reads its values.
 * The templates themselves now declare their own attributes (2026-10-23,
 * lane A2): a copy files its values under slots derived from the copy
 * (`rulesetAttributeSlotId`). Owned by their template (`rulesetOwned`), so no
 * session offers them.
 */
import { defineAttributeSlot } from "@serene-pub/sdk"
import { numberStatShape } from "../../registry/statShapes.js"

const slot = (id: string, owner: string, label: string, description: string, descriptor: string, min: number, max: number, start: number) =>
	defineAttributeSlot(id, {
		shape: numberStatShape.id,
		label: { en: label },
		description: { en: description },
		descriptor,
		appliesTo: ["cast"],
		config: { min, max },
		default: start,
		rulesetOwned: owner
	})

const d20 = (key: string, label: string, means: string) =>
	slot(`core:slot/d20-${key}@1`, "core:ruleset/template-d20-style@1", label, `${label}, a modifier from −3 to +5.`, `${label}: a modifier from −3 to +5, added to a d20 when a check calls for it. ${means}`, -3, 5, 0)
const pool = (key: string, label: string, means: string) =>
	slot(`core:slot/pool-${key}@1`, "core:ruleset/template-dice-pool@1", label, `${label}: how many dice a check with it rolls, 1 to 5.`, `${label}: how many six-sided dice a check with it rolls, from 1 to 5. ${means}`, 1, 5, 2)
const diceless = (key: string, label: string, means: string) =>
	slot(`core:slot/diceless-${key}@1`, "core:ruleset/template-diceless-pools@1", label, `${label} left to spend, 0 to 5.`, `${label}: a pool from 0 to 5, spent to carry a risk. ${means} Spent is gone until rest.`, 0, 5, 3)

/** ⏳ @experimental */ export const d20MightSlot = d20("might", "Might", "Strength and force.")
/** ⏳ @experimental */ export const d20GraceSlot = d20("grace", "Grace", "Speed, aim and balance.")
/** ⏳ @experimental */ export const d20WitsSlot = d20("wits", "Wits", "Noticing, reasoning and keeping one's head.")
/** ⏳ @experimental */ export const poolBodySlot = pool("body", "Body", "Strength, speed and stamina.")
/** ⏳ @experimental */ export const poolMindSlot = pool("mind", "Mind", "Knowing, noticing, working things out.")
/** ⏳ @experimental */ export const poolHeartSlot = pool("heart", "Heart", "Charm, nerve and will.")
/** ⏳ @experimental */ export const dicelessGritSlot = diceless("grit", "Grit", "Toughness and daring.")
/** ⏳ @experimental */ export const dicelessPullSlot = diceless("pull", "Pull", "Charm, standing and who owes you.")
