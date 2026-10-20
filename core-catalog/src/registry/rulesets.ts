/**
 * 🚧 The rulesets core ships.
 *
 * **Freeform** (`core:ruleset/freeform@1`; _Story_ until 2026-10-19, when
 * the name went to the Story genre) is the prose ruleset: every lorebook's
 * default and the landing place for anything another ruleset cannot read.
 * It keeps no numbers and rolls no dice — what people carry, what ails them,
 * the ways out of a place and what is worth remembering are pieces told in
 * words. Its degrees exist only as the words a scene may use for how things
 * went, and it keeps time by the scene.
 *
 * **Vis Itineris** (`core:ruleset/vis-itineris@1`) is the rigorous d20 ruleset, built
 * on the System Reference Document 5.2 (CC-BY-4.0) with its own options as
 * ruleset settings and a _Classic_ preset; its parts live in
 * `rulesets/vis-itineris/`, its licence notice beside its compendium data.
 *
 * Declared through the same `defineRuleset` a plugin uses: nothing in core
 * keys on these ids.
 */
import { defineRepertoire, defineRuleset } from "@serene-pub/sdk"
// The slots first: a ruleset naming a stat nothing declares is refused.
import { characterClassSlot, hpSlot, levelSlot, moodSlot } from "./slots.js"
import {
	VIS_ITINERIS_COMPENDIUM,
	VIS_ITINERIS_CONVENTIONS,
	VIS_ITINERIS_FROM_FREEFORM,
	VIS_ITINERIS_OWN_SLOTS,
	VIS_ITINERIS_PRESETS,
	VIS_ITINERIS_REPERTOIRES,
	VIS_ITINERIS_RULESET_ID,
	VIS_ITINERIS_SELECTORS,
	VIS_ITINERIS_SETTINGS,
	VIS_ITINERIS_VOICE
} from "../rulesets/vis-itineris/index.js"

/** 🚧 What a character carries or a place holds. @experimental */
export const freeformThings = defineRepertoire("things", {
	label: { en: "Things" },
	description: { en: "What a character carries, or what lies in a place." },
	prose:
		"Things held: what someone has on them or what lies about a place. Having a thing makes some actions possible and others easier; losing it takes that away.",
	entryable: true,
	appliesTo: ["cast", "location"]
})

/** 🚧 What ails or marks someone, for as long as it lasts. @experimental */
export const freeformConditions = defineRepertoire("conditions", {
	label: { en: "Conditions" },
	description: { en: "What ails or marks a character — hurt, tired, inspired — and for how long." },
	piece: {
		type: "object",
		fields: {
			lasts: {
				type: "string",
				label: { en: "Lasts" },
				description: { en: "How long it lasts, in story time — “until morning”, “three days”." }
			}
		}
	},
	prose:
		"Conditions on someone: states that shape what they can do and how they feel until they pass. Honour them in what the character attempts and how it goes.",
	entryable: true,
	renderDepth: "summary"
})

/** 🚧 The ways out of a place, held by the place they lead from. @experimental */
export const freeformExits = defineRepertoire("exits", {
	label: { en: "Exits" },
	description: { en: "The ways out of a place — a door, a path, a stair — and how each one stands." },
	piece: {
		type: "object",
		fields: {
			state: {
				type: "enum",
				of: ["open", "closed", "locked", "hidden", "broken"],
				members: [
					{ key: "open", label: { en: "Open" } },
					{ key: "closed", label: { en: "Closed" } },
					{ key: "locked", label: { en: "Locked" } },
					{ key: "hidden", label: { en: "Hidden" } },
					{ key: "broken", label: { en: "Broken" } }
				],
				label: { en: "State" }
			}
		}
	},
	prose:
		"Exits from this place: how each way out looks and stands. A closed or locked way is not crossed without dealing with it; a hidden one is not known until found.",
	relational: true,
	appliesTo: ["location"],
	renderDepth: "index"
})

/** 🚧 What is worth remembering, in a line or two. @experimental */
export const freeformNotes = defineRepertoire("notes", {
	label: { en: "Notes" },
	description: { en: "Anything worth remembering about a character or a place." },
	prose: "Notes: things worth remembering. Keep them in mind; they are not instructions.",
	renderDepth: "index"
})

/**
 * 🚧 Freeform — the prose ruleset. No numbers, no dice; pieces in words.
 * Was `core:ruleset/story@1` ("Story") until 2026-10-19: the word went to
 * the Story genre (NOMENCLATURE R1), and the app's migration re-keys the
 * stored ids (`FREEFORM_RENAMED_FROM`).
 * @experimental
 */
export const freeformRuleset = defineRuleset("core:ruleset/freeform@1", {
	name: { en: "Freeform" },
	description: {
		en: "No numbers: words only, the narrator decides."
	},
	voice: {
		prose:
			"Freeform keeps no numbers. What people carry, what ails them, the ways out of a place and what is worth remembering are told in words; outcomes follow what the scene makes likely, and nothing is rolled.",
		mechanics:
			"Freeform has nothing to compute. Read the sheet as description: a condition shapes what someone can do, a thing in hand makes some actions possible, and a closed exit stays closed until the story opens it.",
		scripts:
			"Freeform runs no scripts and rolls no dice. Decide outcomes from the fiction: what is established, what the characters are trying, what it costs. Say plainly when something goes badly."
	},
	conventions: {
		degrees: {
			bands: [
				{ id: "disaster", label: { en: "It goes badly wrong" }, five: "crit-fail" },
				{ id: "setback", label: { en: "It fails" }, five: "fail" },
				{ id: "cost", label: { en: "It works, at a cost" }, five: "partial" },
				{ id: "works", label: { en: "It works" }, five: "success" },
				{ id: "triumph", label: { en: "It goes better than hoped" }, five: "crit" }
			]
		},
		time: { unit: "scene" }
	},
	// Mood is core's, read by every genre: Freeform borrows it, never owns it.
	stats: [{ id: moodSlot.id, borrowed: true }],
	repertoires: [freeformThings, freeformConditions, freeformExits, freeformNotes]
})

/**
 * 🚧 Vis Itineris — the force of the journey: heroes whose deeds move the
 * world. Its stats: core's health, level and class (borrowed — every genre
 * reads them), then its own (`rulesets/vis-itineris/slots.ts`), which it
 * owns by listing them: pickable only in its sessions.
 * @experimental
 */
export const visItinerisRuleset = defineRuleset(VIS_ITINERIS_RULESET_ID, {
	name: { en: "Vis Itineris" },
	description: {
		en: "Vis Itineris — the force of the journey. Heroes whose deeds move the world. Built on the System Reference Document 5.2, licensed CC-BY-4.0; see Licences."
	},
	voice: VIS_ITINERIS_VOICE,
	conventions: VIS_ITINERIS_CONVENTIONS,
	settings: VIS_ITINERIS_SETTINGS,
	presets: VIS_ITINERIS_PRESETS,
	stats: [
		{ id: levelSlot.id, config: { min: 1, max: 20 }, borrowed: true },
		{ id: characterClassSlot.id, borrowed: true },
		{ id: hpSlot.id, config: { min: 0, max: 999 }, default: 10, borrowed: true },
		...VIS_ITINERIS_OWN_SLOTS.map((s) => ({ id: s.id }))
	],
	selectors: VIS_ITINERIS_SELECTORS,
	repertoires: VIS_ITINERIS_REPERTOIRES,
	compendium: VIS_ITINERIS_COMPENDIUM,
	scripts: [
		{ phase: "derived", priority: 10, seedKey: "core:script/vis-itineris-derive" },
		{ phase: "derived", priority: 20, seedKey: "core:script/vis-itineris-bulk" },
		{ phase: "pre-roll", priority: 10, seedKey: "core:script/vis-itineris-heighten-spell" },
		{ phase: "effects", priority: 90, seedKey: "core:script/vis-itineris-level-up" }
	],
	conversions: [VIS_ITINERIS_FROM_FREEFORM]
})

/**
 * 🚧 The ruleset id Freeform carried before 2026-10-19 — what the app's
 * migration re-keys stored rows from (lorebooks, sessions, entry types
 * `core:entry/story.<repertoire>@1` → `core:entry/freeform.<repertoire>@1`,
 * repertoire addresses `core:ruleset/story@1#things`). Never registered.
 * @experimental
 */
export const FREEFORM_RENAMED_FROM = Object.freeze({
	ruleset: "core:ruleset/story@1",
	primer: "core:primer/story@1",
	entryTypePrefix: "core:entry/story.",
} as const)
