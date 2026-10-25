/**
 * 🚧 The **diceless pools** ruleset template (2026-10-22; in the seven sections over core's functions since
 * 2026-10-23, lane A2): nothing is rolled — a risk is bought by spending grit or pull, a face-off weighs
 * grit against grit, and the table judges the rest. Two pools, ties to other people and marks, two sample
 * rows each and a playtest scene. Copied, never played.
 */
import { defineRulesetTemplate } from "@serene-pub/sdk"
import { compareFunction, judgeFunction, spendFunction } from "../../functions/index.js"
/** @experimental */ export const DICELESS_POOLS_TEMPLATE_ID = "core:ruleset/template-diceless-pools@1"
const en = (en: string) => ({ en })
const pool = (id: string, name: string, means: string) =>
	({ id, name: en(name), kind: "pool", bounds: { min: 0, max: 5 }, start: 3, tags: ["resource"], prose: `${name}: a pool from 0 to 5, spent to carry a risk. ${means} Spent is gone until rest.` }) as const
const COSTS = [{ spend: 0, band: "short" }, { spend: 1, band: "cost" }, { spend: 2, band: "done" }]
const row = (id: string, piece: Record<string, unknown>) => ({ id, version: "1.0.0", piece: piece as never })
/** 🚧 @experimental */
export const dicelessPoolsTemplate = defineRulesetTemplate(DICELESS_POOLS_TEMPLATE_ID, {
	label: en("Diceless pools"),
	about: en("Nothing is rolled. To carry a risk, spend from a pool — one point holds at a cost, two gets it done — and spent is gone until rest. A face-off weighs grit against grit; anything else, the table judges. Who you are tied to backs you."),
	goodFor: en("Drama, intrigue and slice of life, where choices and relationships should matter more than luck."),
	ruleset: {
		template: true,
		name: en("Diceless pools"),
		description: en("Spend grit or pull to carry a risk; face-offs weigh grit; ties and marks move the scales."),
		voice: {
			prose: "No dice: people carry risks on grit, on pull and on who they are tied to. Outcomes follow what they spend and what the scene makes likely.",
			mechanics: "The rules decide by spending: one point holds at a cost, two gets it done; a face-off weighs grit against grit. Narrate what was spent.",
			scripts: "Propose who spends which pool and how much, or who faces off with whom — never results; the rules weigh them."
		},
		attributes: [pool("grit", "Grit", "Toughness and daring."), pool("pull", "Pull", "Charm, standing and who owes you.")],
		functions: [
			// The table's judgement is the default way; each spend and the face-off is a check by its own name.
			{ ref: judgeFunction.id, key: "call", options: { label: en("The table judges") } },
			{ ref: spendFunction.id, key: "push", options: { label: en("Spend grit"), resource: "grit", costs: COSTS } },
			{ ref: spendFunction.id, key: "lean", options: { label: en("Spend pull"), resource: "pull", costs: COSTS } },
			{ ref: compareFunction.id, key: "face-off", options: { label: en("Grit against grit"), base: "grit", opposedBy: "grit", bands: [{ id: "low", label: en("Low"), target: 2 }, { id: "even", label: en("Even"), target: 3, default: true }, { id: "high", label: en("High"), target: 4 }] } }
		],
		entryTypes: [
			{ id: "ties", name: en("Ties"), description: en("Who someone is tied to, and whether the tie runs warm or cold."), tags: ["relationship"], relational: true, fields: { leans: { type: "enum", of: ["warm", "cold"], default: "warm", label: en("Leans"), description: en("A warm tie backs them in a face-off.") } }, prose: "Ties: the people someone is tied to. A warm tie backs them; a cold one is a grudge waiting.", mechanics: [{ verb: "modify", target: "face-off", value: 1, predicate: { path: "piece.leans", equals: "warm" } }] },
			{ id: "marks", name: en("Marks"), description: en("What the story has left on someone."), tags: ["condition"], prose: "Marks: what the story has left on someone — a bruise, a debt — until it is dealt with. Each weighs on a face-off.", mechanics: [{ verb: "modify", target: "face-off", value: -1 }], renderDepth: "summary" }
		],
		outcomes: [{ id: "short", label: en("Falls short"), five: "fail" }, { id: "cost", label: en("At a cost"), five: "partial", from: 0 }, { id: "done", label: en("Done"), five: "success", from: 1 }],
		time: { unit: "scene", rests: [{ id: "rest", label: en("A rest") }] },
		library: {
			source: { document: "Diceless-pools template (Serene Pub)", licence: "Apache-2.0" },
			rows: {
				ties: [row("old-friend", { name: "Old friend", description: "Someone who remembers them before all this.", leans: "warm" }), row("grudge", { name: "Grudge", description: "Someone they wronged, who has not forgotten.", leans: "cold" })],
				marks: [row("bruised", { name: "Bruised", description: "Sore from the last scrape." }), row("in-debt", { name: "In debt", description: "Owes money to the wrong people." })]
			}
		}
	},
	playtest: {
		party: [
			{ name: "Mara", stats: { grit: 3, pull: 2 }, pieces: { ties: ["old-friend"], marks: [] } },
			{ name: "Teo", stats: { grit: 2, pull: 3 }, pieces: { ties: [], marks: ["in-debt"] } }
		],
		situation: en("Mara needs the ferryman to wait one more hour, and leans on an old friendship to ask."),
		change: { owner: "Mara", op: "use", check: "lean", value: 2 }
	}
})
