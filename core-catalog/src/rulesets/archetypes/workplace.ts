/** 🚧 **Workplace** archetype: a job, pay and reputation; tasks with deadlines in an inbox; footing with a place, held on the grapevine (a one-sided tie, the world's); a pitch compares; a missed deadline costs. */
import { defineRulesetTemplate } from "@serene-pub/sdk"
import { ARCHETYPE_FUNCTIONS as F, dueField, row } from "./functionIds.js"

/** @experimental */
export const WORKPLACE_ID = "core:ruleset/template-workplace@1"
const band = (id: string, label: string, target: number, d = false) => ({ id, label: { en: label }, target, ...(d ? { default: true } : {}) })

/** 🚧 @experimental */
export const workplaceTemplate = defineRulesetTemplate(WORKPLACE_ID, {
	label: { en: "Workplace" },
	about: { en: "A job, pay, standing with the people around you and footing with the places you work, and tasks with deadlines. A pitch weighs your reputation against the ask; a deadline passing has a cost." },
	goodFor: { en: "Office dramas, startups and shop-floor stories, where work is the stage and ambition the plot." },
	ruleset: {
		template: true,
		name: { en: "Workplace" },
		description: { en: "Job, pay, reputation and focus; tasks with deadlines." },
		attributes: [
			{ id: "job", name: { en: "Job" }, kind: "label", of: ["intern", "associate", "lead", "director"], start: "associate", carriedBy: ["cast"], shownAs: "badge", prose: "Job: the role someone holds, from intern to director. It decides what is theirs to ask for and whose orders they take." },
			{ id: "pay", name: { en: "Pay" }, kind: "tally", bounds: { min: 0 }, start: 100, carriedBy: ["cast"], shownAs: "count", changedBy: ["rules", "gm"], prose: "Pay: what someone earned this week. A missed deadline docks it; a landed pitch raises it." },
			{ id: "reputation", name: { en: "Reputation" }, kind: "number", bounds: { min: -5, max: 5 }, start: 0, tags: ["towards"], shownAs: "pips", prose: "Reputation: how a colleague is thought of by one particular person, -5 to 5. High, they are trusted with more; low, they are left off the list." },
			{ id: "focus", name: { en: "Focus" }, kind: "pool", bounds: { max: 5 }, start: 4, carriedBy: ["cast"], tags: ["resource"], shownAs: "bar", prose: "Focus: attention left for the day, 0 to 5. Hard work and long meetings spend it; a night away from the desk restores it." }
		],
		entryTypes: [
			{ id: "task", name: { en: "Task" }, holders: ["cast", "location"], tags: ["task"], prose: "Tasks: work someone has been given, with a day it is due. One that passes its due day unfinished counts against its owner.", fields: { due: dueField("The story date it is due by."), done: { type: "boolean", default: false, label: { en: "Done" }, description: { en: "Finished and handed in." } } } },
			// 🚧 Standing with a place (ties ★6): a one-sided tie, the world's to hold — in the grapevine.
			{ id: "footing", name: { en: "Footing" }, relational: true, farEnd: "place", tags: ["relationship"], prose: "Footing: how a place regards someone who works there, the floor, the office or a client's site, from -3, unwelcome, to 3, one of their own. It opens doors there, or shuts them.", fields: { regard: { type: "integer", min: -3, max: 3, default: 0, label: { en: "Regard" } } } }
		],
		zoneTypes: [
			{ id: "inbox", name: { en: "Inbox" }, owners: ["location"], holds: ["task"], visibility: F.samePlace, prose: "Inbox: the tasks waiting at a desk or in a room. Anyone in the room can see what is piled there." },
			{ id: "grapevine", name: { en: "Grapevine" }, owners: ["world"], holds: ["footing"], visibility: "everyone", prose: "Grapevine: what each place says about the people who work in it. Everyone hears it sooner or later." }
		],
		functions: [
			{ ref: F.compare, key: "pitch", options: { modifierOf: "reputation", bands: [band("modest", "A modest ask", 1), band("fair", "A fair ask", 2, true), band("bold", "A bold ask", 4)] } },
			{ ref: F.spend, key: "crunch", options: { resource: "focus", costs: [{ spend: 0, band: "shot-down" }, { spend: 1, band: "lukewarm" }, { spend: 2, band: "approved" }] } },
			{ ref: F.obligation, key: "missed-deadline", bindings: { owed: "task" } },
			{ ref: F.recurring, key: "fresh-start", bindings: { what: "focus" }, options: { every: "day", by: 2 } }
		],
		outcomes: [
			{ id: "shot-down", label: { en: "Shot down" }, five: "fail" },
			{ id: "lukewarm", label: { en: "Lukewarm" }, five: "partial", from: -1 },
			{ id: "approved", label: { en: "Approved" }, five: "success", from: 0 },
			{ id: "championed", label: { en: "Championed" }, five: "crit", from: 3 }
		],
		time: { unit: "day" },
		library: { source: { document: "Workplace archetype (Serene Pub)", licence: "Apache-2.0" }, rows: { task: [row("quarterly-deck", { name: "Quarterly deck", description: "Twelve slides and a story about growth.", due: { year: 1, month: 1, day: 5 } }), row("onboarding-guide", { name: "Onboarding guide", description: "Nobody has updated it since the move.", due: { year: 1, month: 1, day: 9 } })] } }
	},
	playtest: {
		party: [{ name: "Priya", stats: { job: "associate", pay: 100, reputation: 2, focus: 4 }, pieces: { task: ["quarterly-deck"] } }, { name: "Mr Okafor", stats: { job: "director", reputation: 3, focus: 2 }, pieces: {} }],
		situation: { en: "Priya corners her director after the all-hands to pitch a promotion." },
		change: { owner: "Priya", op: "use", check: "pitch", aimedAt: "Mr Okafor", against: 2 }
	}
})
