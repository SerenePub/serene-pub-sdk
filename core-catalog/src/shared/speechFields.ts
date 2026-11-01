/**
 * 🚧 A session's **speech settings** (PLAN-speech-build seam S7, 2026-10-28):
 * four genre fields, stored in `sessions.genre_fields` like every genre
 * field, resolved by the session settings cascade into the settings
 * document's `fields` (`$.input.session.fields.<key>`), and drawn by the
 * settings form from these declarations. Declared by every core genre whose
 * reply carries the speech tail (story, guide, lair) by spreading
 * `SPEECH_FIELDS` into its `fields`.
 *
 * `reach: 'owner'`: the session's owner sees and changes them unless a layer
 * above locks one. The app's client-safe twin is
 * `src/lib/shared/sessions/speechSettings.ts` (same key table, as literals;
 * lane V pins the two equal).
 * @experimental
 */
import type { FieldDecl } from "@serene-pub/sdk"
import { SPOKEN_LINE_TEMPLATE_IDS } from "../seed/speechTemplates.js"

/** The keys, by the S7 name's short form (`narrateUser` is reserved, not declared). @experimental */
export const SPEECH_FIELD_KEYS = {
	readAloud: "speechReadAloud",
	template: "speechTemplate",
	narratorVoice: "speechNarratorVoice",
	// reserved — not declared until implemented (lead 2026-10-28)
	narrateUser: "speechNarrateUser",
	language: "sessionLanguage"
} as const

/** How a reply is read aloud: not at all, audio made, or made and played. @experimental */
export const READ_ALOUD_MODES = ["off", "make", "play"] as const

/** 🚧 **Read replies aloud**. @experimental */
export const SPEECH_READ_ALOUD_FIELD: FieldDecl = {
	type: "enum",
	label: { en: "Read replies aloud" },
	description: {
		en: "Whether each reply is spoken. Making audio is another call to a speech service per reply."
	},
	of: [...READ_ALOUD_MODES],
	members: [
		{ key: "off", label: { en: "Off" }, description: { en: "Replies stay text." } },
		{ key: "make", label: { en: "Make audio" }, description: { en: "Each reply gets audio you can play from it." } },
		{ key: "play", label: { en: "Make and play" }, description: { en: "Each reply gets audio and plays as it lands." } }
	],
	default: "off",
	reach: "owner"
}

/** 🚧 **What is read**: which part of a reply is spoken (a line template). @experimental */
export const SPEECH_TEMPLATE_FIELD: FieldDecl = {
	type: "enum",
	label: { en: "What is read" },
	description: {
		en: "Which part of each reply is spoken. Unset uses the pipeline's own line template (the whole line, as shipped)."
	},
	of: [SPOKEN_LINE_TEMPLATE_IDS.whole, SPOKEN_LINE_TEMPLATE_IDS.dialogue, SPOKEN_LINE_TEMPLATE_IDS.narration],
	members: [
		{
			key: SPOKEN_LINE_TEMPLATE_IDS.whole,
			label: { en: "Whole line" },
			description: { en: "Dialogue and narration, as written." }
		},
		{
			key: SPOKEN_LINE_TEMPLATE_IDS.dialogue,
			label: { en: "Dialogue only" },
			description: { en: "Only what the characters say." }
		},
		{
			key: SPOKEN_LINE_TEMPLATE_IDS.narration,
			label: { en: "Narration only" },
			description: { en: "Only the narration between the speech." }
		}
	],
	reach: "owner"
}

/** 🚧 **Narrator voice**: a voicebank slug; empty is none. @experimental */
export const SPEECH_NARRATOR_VOICE_FIELD: FieldDecl = {
	type: "string",
	label: { en: "Narrator voice" },
	description: {
		en: "The voice that reads narration, by its voicebank name. Empty uses the pub's default voice."
	},
	default: "",
	reach: "owner"
}

/** 🚧 **Language**: ISO 639-1; empty is none. @experimental */
export const SESSION_LANGUAGE_FIELD: FieldDecl = {
	type: "string",
	label: { en: "Language" },
	description: {
		en: "The language this session is spoken in, as a two-letter code such as en or fr. Empty uses the pub's default."
	},
	default: "",
	reach: "owner"
}

/** The four declared, by key, for spreading into a genre's `fields`. @experimental */
export const SPEECH_FIELDS: Record<string, FieldDecl> = {
	[SPEECH_FIELD_KEYS.readAloud]: SPEECH_READ_ALOUD_FIELD,
	[SPEECH_FIELD_KEYS.template]: SPEECH_TEMPLATE_FIELD,
	[SPEECH_FIELD_KEYS.narratorVoice]: SPEECH_NARRATOR_VOICE_FIELD,
	[SPEECH_FIELD_KEYS.language]: SESSION_LANGUAGE_FIELD
}
