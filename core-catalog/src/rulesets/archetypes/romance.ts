/** 🚧 **Romance** archetype: bonds that warm or cool, affection kept on each side of them (its standing worked out from it, moved by a confession), nerve spent to be brave, mood words. Nothing is rolled. */
import { defineRulesetTemplate } from "@serene-pub/sdk"
import { ARCHETYPE_FUNCTIONS as F, row } from "./functionIds.js"

/** @experimental */
export const ROMANCE_ID = "core:ruleset/template-romance@1"
const band = (id: string, label: string, target: number, d = false) => ({ id, label: { en: label }, target, ...(d ? { default: true } : {}) })

/** 🚧 @experimental */
export const romanceTemplate = defineRulesetTemplate(ROMANCE_ID, {
	label: { en: "Romance" },
	about: { en: "Bonds that warm or cool, with affection kept on each side, and nerve you spend to be brave. A confession weighs how they feel about you against a line; nothing is rolled." },
	goodFor: { en: "Slow burns, love triangles and small-town hearts, where feeling should matter more than luck." },
	ruleset: {
		template: true,
		name: { en: "Romance" },
		description: { en: "Affection, nerve and mood; confessions compare, nerve is spent, bonds keep score." },
		attributes: [
			{ id: "nerve", name: { en: "Nerve" }, kind: "pool", bounds: { max: 5 }, start: 3, carriedBy: ["cast"], tags: ["resource"], shownAs: "bar", changedBy: ["rules"], prose: "Nerve: courage held in reserve, 0 to 5. It is spent to do something brave and comes back each morning." },
			{ id: "mood", name: { en: "Mood" }, kind: "label", of: ["guarded", "warm", "giddy", "hurt", "restless"], start: "guarded", carriedBy: ["cast"], shownAs: "words", prose: "Mood: how someone is carrying themselves today. It colours their words and shifts after a confession." }
		],
		entryTypes: [
			{ id: "bond", name: { en: "Bond" }, relational: true, farEnd: "person", tags: ["relationship"], shownAs: "ties", readsOnto: { standing: "relationship-type" }, prose: "Bonds: what two people are to each other. Each holds their own side, with their affection for the other, 0 to 10: above 7 they say so unprompted; below 3 they avoid that person. The standing is worked out from it, cold, wary, warm or close; a confession moves the other's: cooled -1, warmed +1, confessed +2.", fields: { affection: { type: "integer", min: 0, max: 10, default: 3, label: { en: "Affection" } }, standing: { type: "enum", of: ["cold", "wary", "warm", "close"], default: "wary", label: { en: "Standing" } } } },
			{ id: "keepsake", name: { en: "Keepsake" }, holders: ["cast"], tags: ["item"], prose: "Keepsakes: small things kept because of someone, a note or a pressed flower. They say what a person holds on to." }
		],
		zoneTypes: [
			{ id: "pocket", name: { en: "Pocket" }, owners: ["cast"], holds: ["keepsake"], visibility: "holder", limit: 5, prose: "Pocket: the keepsakes someone carries close. Only they know what is in it, until they show it." },
			{ id: "bonds", name: { en: "Bonds" }, owners: ["cast"], holds: ["bond"], visibility: "holder", shownAs: "ties", prose: "Bonds: each person's own side of their ties. How much they feel is theirs to show; the standing is what others see." }
		],
		functions: [
			{ ref: F.compare, key: "confess", options: { modifierOf: "bond.affection", bands: [band("low", "Hopeful", 4), band("even", "Even", 7, true), band("high", "Bold", 9)] } },
			{ ref: F.outcomeMoves, key: "confess-moves", bindings: { what: "bond.affection" }, options: { check: "confess", moves: [{ outcome: "cooled", by: -1 }, { outcome: "warmed", by: 1 }, { outcome: "confessed", by: 2 }] } },
			{ ref: F.rungs, key: "standing-from-affection", bindings: { what: "bond.affection" }, options: { into: "standing", rungs: [{ from: 0, words: "cold" }, { from: 3, words: "wary" }, { from: 6, words: "warm" }, { from: 8, words: "close" }] } },
			{ ref: F.spend, key: "be-brave", options: { resource: "nerve", costs: [{ spend: 0, band: "cooled" }, { spend: 1, band: "awkward" }, { spend: 2, band: "warmed" }] } },
			{ ref: F.judge, key: "read-the-room" },
			{ ref: F.recurring, key: "steady-nerves", bindings: { what: "nerve" }, options: { every: "day", by: 2 } }
		],
		outcomes: [
			{ id: "cooled", label: { en: "Cooled" }, five: "fail" },
			{ id: "awkward", label: { en: "Awkward" }, five: "partial", from: -2 },
			{ id: "warmed", label: { en: "Warmed" }, five: "success", from: 0 },
			{ id: "confessed", label: { en: "Confessed" }, five: "crit", from: 3 }
		],
		time: { unit: "day" },
		library: { source: { document: "Romance archetype (Serene Pub)", licence: "Apache-2.0" }, rows: { keepsake: [row("pressed-flower", { name: "Pressed flower", description: "Kept between two pages since the fair." }), row("folded-note", { name: "Folded note", description: "Read so often the creases have gone soft." })] } }
	},
	playtest: {
		party: [
			{ name: "Wren", stats: { nerve: 3, mood: "guarded" }, pieces: { keepsake: ["pressed-flower"] }, ties: { bond: { Mara: { affection: 7, standing: "warm" } } } },
			{ name: "Mara", stats: { nerve: 2, mood: "warm" }, pieces: {}, ties: { bond: { Wren: { affection: 8, standing: "close" } } } }
		],
		situation: { en: "The pier at dusk. Wren has been working up to it all day." },
		change: { owner: "Wren", op: "use", check: "confess", aimedAt: "Mara", against: 7 }
	}
})
