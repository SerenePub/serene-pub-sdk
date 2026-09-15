/**
 * The attribute slots core's own genres bring.
 *
 * A slot is declared once and attached where it is true (`defineAttributeSlot`,
 * SDK attributes.ts); a genre carries the declarations it wants so that a
 * session of that genre has a vocabulary and a session of any other genre has
 * none. The standard Chat genre declares nothing here on purpose — the
 * one-LLM-call rule holding at the surface, so a newcomer never sees a bar.
 *
 * ## `descriptor` is the contract; `label` and `description` are not
 *
 * `descriptor` is the sentence the MODEL reads in the state block a template
 * renders, so it is inside the content hash: editing one changes generation
 * everywhere the slot appears and is an `@N+1`, not a copyedit. `label` is what
 * a person reads on a bar and is stripped from the hash. The two are written
 * differently on purpose — a descriptor says what the number MEANS to somebody
 * writing the scene, a label just names it.
 *
 * ## Why the bounds live in `config` rather than in the type
 *
 * Every layer stores deviations only, so a declaration's `config` is the floor
 * a card, a lorebook or a session departs from. `max: 20` on health is core's
 * opening offer, not a rule: a card saying "Health, maximum 40" is one stored
 * key, and raising the declared default later reaches every owner who never
 * overrode it.
 */
import { defineAttributeSlot } from "@serene-pub/sdk"

/* ── Cast slots ─────────────────────────────────────────────────────────── */

export const hpSlot = defineAttributeSlot("core:slot/hp@1", {
	type: "integer",
	label: { en: "Health" },
	description: { en: "How much harm this character can still take before they are in real trouble." },
	descriptor:
		"Health, as a number out of a maximum. Low health means visible injury and a body that is failing; at zero they are down and out of the scene.",
	appliesTo: ["cast"],
	config: { min: 0, max: 20 },
	default: 20,
})

export const staminaSlot = defineAttributeSlot("core:slot/stamina@1", {
	type: "integer",
	label: { en: "Stamina" },
	description: { en: "How much effort is left in them before they have to stop and rest." },
	descriptor:
		"Stamina, as a number out of a maximum. It falls with exertion, a forced march or a long fight, and comes back with rest. At zero they can act only slowly and badly.",
	appliesTo: ["cast"],
	config: { min: 0, max: 10 },
	default: 10,
})

export const moodSlot = defineAttributeSlot("core:slot/mood@1", {
	type: "enum",
	label: { en: "Mood" },
	description: { en: "How this character is feeling right now." },
	descriptor:
		"Their current mood. It colours how they speak and what they are willing to do, and it changes with what the scene does to them.",
	appliesTo: ["cast"],
	config: { of: ["calm", "wary", "afraid", "angry", "hopeful"] },
	default: "calm",
})

export const trustSlot = defineAttributeSlot("core:slot/trust@1", {
	type: "integer",
	label: { en: "Trust" },
	description: { en: "How far this character trusts the player, from hostile to loyal." },
	descriptor:
		"How far they trust the player, from -5 (hostile, expecting betrayal) through 0 (a stranger) to 5 (loyal, will take a risk for them). It moves when the player earns or spends it, never on its own.",
	appliesTo: ["cast"],
	config: { min: -5, max: 5 },
	default: 0,
})

/* ── World slots ────────────────────────────────────────────────────────── */

export const locationSlot = defineAttributeSlot("core:slot/location@1", {
	type: "text",
	label: { en: "Location" },
	description: { en: "Where the scene is happening." },
	descriptor:
		"Where the scene is happening, by the name the world knows it by. It changes when the party travels, and everything described should belong to it.",
	appliesTo: ["world"],
	config: { maxLength: 120 },
})

export const timeOfDaySlot = defineAttributeSlot("core:slot/time-of-day@1", {
	type: "enum",
	label: { en: "Time of day" },
	description: { en: "Where the story clock has got to." },
	descriptor:
		"Where the story clock has got to. It governs light, who is awake and what is open, and it moves forward with travel, rest and long work.",
	appliesTo: ["world"],
	config: { of: ["morning", "day", "dusk", "night"] },
	default: "morning",
})

export const weatherSlot = defineAttributeSlot("core:slot/weather@1", {
	type: "enum",
	label: { en: "Weather" },
	description: { en: "What the sky is doing." },
	descriptor:
		"What the sky is doing. It belongs in the description of any scene out of doors, and it makes travel and visibility easier or harder.",
	appliesTo: ["world"],
	config: { of: ["clear", "fog", "rain", "storm", "snow"] },
	default: "clear",
})

/**
 * The seven, in the order a genre declares them: the cast's four, then the
 * world's three. A genre that wants only some of them names those.
 */
export const ADVENTURE_SLOTS = [
	hpSlot,
	staminaSlot,
	moodSlot,
	trustSlot,
	locationSlot,
	timeOfDaySlot,
	weatherSlot,
] as const
