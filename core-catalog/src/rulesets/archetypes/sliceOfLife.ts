/** 🚧 **Slice of life** archetype: energy, money and the time of day; routines each morning; a late night costs tomorrow; plans. */
import { defineRulesetTemplate } from "@serene-pub/sdk"
import { ARCHETYPE_FUNCTIONS as F, dueField, row } from "./functionIds.js"

/** @experimental */
export const SLICE_OF_LIFE_ID = "core:ruleset/template-slice-of-life@1"

/** 🚧 @experimental */
export const sliceOfLifeTemplate = defineRulesetTemplate(SLICE_OF_LIFE_ID, {
	label: { en: "Slice of life" },
	about: { en: "Energy, money and the time of day. Routines run each morning, a late night costs tomorrow, and plans wait on the calendar. The rules keep the calendar; the story is yours." },
	goodFor: { en: "Everyday stories, cozy towns and quiet drama, where the days themselves are the plot." },
	ruleset: {
		template: true,
		name: { en: "Slice of life" },
		description: { en: "Energy, money and time of day, with routines and plans." },
		attributes: [
			{ id: "energy", name: { en: "Energy" }, kind: "pool", bounds: { max: 10 }, start: 8, carriedBy: ["cast"], tags: ["resource"], shownAs: "bar", prose: "Energy: what someone has left for the day, 0 to 10. Errands and effort spend it; a night's sleep brings it back, less if they stayed up late." },
			{ id: "money", name: { en: "Money" }, kind: "tally", bounds: { min: 0 }, start: 40, carriedBy: ["cast"], shownAs: "count", prose: "Money: coins in hand. It is spent on meals, rent and treats, earned by work, and never goes below nothing." },
			{ id: "time-of-day", name: { en: "Time of day" }, kind: "label", of: ["morning", "afternoon", "evening", "late night"], start: "morning", carriedBy: ["world"], shownAs: "words", changedBy: ["rules"], prose: "Time of day: where the day has got to. Scenes should fit it, and a late night leaves everyone tired tomorrow." }
		],
		entryTypes: [
			{ id: "plan", name: { en: "Plan" }, holders: ["cast"], tags: ["plan"], prose: "Plans: things someone means to do and when, a market on Saturday or a call to a friend. A plan not kept is remembered.", fields: { when: { type: "enum", of: ["morning", "afternoon", "evening"], default: "afternoon", label: { en: "When" }, description: { en: "The part of the day it is planned for." } }, due: dueField("The day it is planned for; once that day has gone by, the plan was missed.") } },
			{ id: "routine", name: { en: "Routine" }, holders: ["cast"], tags: ["routine"], prose: "Routines: what someone does without thinking each morning, a run, a coffee, feeding the cat. They cost little and keep a person steady." }
		],
		zoneTypes: [{ id: "diary", name: { en: "Diary" }, owners: ["cast"], holds: ["plan", "routine"], ordered: true, visibility: "holder", prose: "Diary: the plans and routines someone keeps, in the order they fall." }],
		functions: [
			{ ref: F.judge, key: "how-it-goes" },
			{ ref: F.recurring, key: "morning-routine", bindings: { what: "energy" }, options: { every: "day", by: 4 } },
			{ ref: F.obligation, key: "plan-missed", bindings: { owed: "plan" } }
		],
		outcomes: [
			{ id: "rough", label: { en: "A rough one" }, five: "fail" },
			{ id: "fine", label: { en: "Fine" }, five: "partial" },
			{ id: "good", label: { en: "Good" }, five: "success" },
			{ id: "lovely", label: { en: "Lovely" }, five: "crit" }
		],
		time: { unit: "day" },
		library: { source: { document: "Slice of life archetype (Serene Pub)", licence: "Apache-2.0" }, rows: { plan: [row("saturday-market", { name: "Saturday market", description: "Fresh bread, if you get there early.", when: "morning", due: { year: 1, month: 1, day: 6 } }), row("call-home", { name: "Call home", description: "Promised on Sunday, put off twice.", when: "evening", due: { year: 1, month: 1, day: 7 } })], routine: [row("morning-run", { name: "Morning run", description: "Three laps of the green, rain or not." })] } }
	},
	playtest: {
		party: [{ name: "Ines", stats: { energy: 4, money: 22, "time-of-day": "late night" }, pieces: { plan: ["call-home"], routine: ["morning-run"] } }, { name: "Theo", stats: { energy: 8, money: 55 }, pieces: {} }],
		situation: { en: "Ines stayed up late finishing a mural and has a market to reach at dawn." },
		change: { owner: "Ines", op: "use", check: "how-it-goes", aimedAt: "Theo" }
	}
})
