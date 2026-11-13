/**
 * 🚧 The **character profile** (plan §32 §2, §33.1; owner ruling 2026-11-05
 * late, _"Character profile?"_): the one shape a character version holds,
 * card and cast alike. A card version holds a whole profile; a cast version
 * holds its own values and names in `follows` the fields it reads from its
 * parent card version.
 *
 * Always qualified (R3): a bare _profile_ stays the export, docs,
 * image-generation and evidence profiles.
 *
 * Owner: "Reconcile what we have for character cards. API should start with
 * the same shape, can update both with what's best. We should also make sure
 * we merge together any fields where there's an arbitrary duplicate like
 * greeting and additional greetings." — so the opener, the alternate
 * greetings and the group-only greetings are ONE list (`greetings`), and the
 * creator notes and their translations are one field (`creatorNotes`).
 *
 * Mirrors the app's `shared/characters/profile.ts` field for field — an edit
 * to one is an edit to both. Types and the field list only: the host fills
 * them; nothing here reads or writes a character.
 */
import type { Stroke } from './strokes.js'

/**
 * 🚧 One greeting. `groupOnly` marks one a group session uses.
 * @experimental
 */
export interface CharacterGreeting {
	text: string
	groupOnly?: boolean
}

/**
 * 🚧 The creator's notes: the main text, its language when known, and other languages' texts.
 * @experimental
 */
export interface CharacterCreatorNotes {
	text: string
	/** ISO 639-1 code of `text`, when known. */
	lang?: string
	/** Other languages' notes by ISO 639-1 code; never one identical to `text`. */
	variants: Record<string, string>
}

/**
 * 🚧 The character profile. Nullable fields hold no value; lists are never null.
 * @experimental
 */
export interface CharacterProfileV1 {
	name: string | null
	nickname: string | null
	aliases: string[]
	/** A separate optional one-liner; readers fall back to the description's first sentence (§33.1). */
	summary: string | null
	description: string | null
	personality: string | null
	scenario: string | null
	/** Merged: the opener first, then the alternates (empty ones kept: today's swipes), the group-only ones marked. */
	greetings: CharacterGreeting[]
	exampleDialogues: string[]
	postHistoryInstructions: string | null
	creatorNotes: CharacterCreatorNotes | null
	strokes: Stroke[]
	/** The face (a card's avatar, a member's face): a `files` row. */
	faceMediaId: number | null
	/** The likeness for image generation; every part optional. */
	likeness: {
		/** The likeness image's `files` row; absent means "use the avatar". */
		imageMediaId?: number
		/** The likeness prompt — a tag line of the character's look. */
		prompt?: string
		/** The likeness negative — what to keep out of the picture. */
		negative?: string
	} | null
	/** How the character sounds when its lines are spoken; every part optional. */
	timbre: {
		/** "a warm low alto, slight Irish lilt, unhurried" — portable prose. */
		description?: string
		/** A voicebank entry's slug on THIS pub. Dropped on card export. */
		voice?: string
		/** The voicebank slug that reads the prose AROUND this character's lines. Pub-local; dropped on card export. */
		narrationVoice?: string
		/** ISO 639-1 code the character speaks (`en`, `ja`). */
		language?: string
		settings?: {
			/** Speaking rate multiplier, 1 = the voice's own pace. */
			speed?: number
			/** 0–1, ElevenLabs-style. */
			stability?: number
			/** 0–1, ElevenLabs-style. */
			similarity?: number
			/** 0–1, ElevenLabs-style. */
			style?: number
			/** The voice seed: on a voice-designing model it picks which person the description becomes. */
			seed?: number
			/** ElevenLabs-style speaker boost: on emphasises the original speaker. */
			speakerBoost?: boolean
		}
		/** `true`: this character's lines are never spoken. Absent is spoken. */
		silent?: boolean
	} | null
	/** A sprite set's name; null = the default set. */
	spriteSet: string | null
	/** The card's remaining extension keys (likeness and timbre lifted out). */
	extensions: Record<string, unknown>
}

/**
 * 🚧 Every character profile field, in display order. A cast version's `follows` holds only these.
 * @experimental
 */
export const CHARACTER_PROFILE_FIELDS = [
	'name',
	'nickname',
	'aliases',
	'summary',
	'description',
	'personality',
	'scenario',
	'greetings',
	'exampleDialogues',
	'postHistoryInstructions',
	'creatorNotes',
	'strokes',
	'faceMediaId',
	'likeness',
	'timbre',
	'spriteSet',
	'extensions',
] as const satisfies readonly (keyof CharacterProfileV1)[]

/**
 * 🚧 One character profile field name.
 * @experimental
 */
export type CharacterProfileField = (typeof CHARACTER_PROFILE_FIELDS)[number]

/**
 * 🚧 One cast member as a session reads them (`core:query/cast-member@1`'s `main`).
 * @experimental
 */
export interface CastMemberV1 {
	/** The member (the host's `lorebook_bindings.id`). */
	castMemberId: number
	/** The card the member is drawn with on this reading (its version in force's parent card); null when card-less. */
	cardId: number | null
	/** That parent card version; null when card-less. */
	cardVersion: { id: number; number: number; label: string | null } | null
	cardless: boolean
	/** The parent card version is below the card's current (highest) version: the card has moved on since. */
	behindCard: boolean
	/** The profile fields read from the parent card version; [] when card-less. */
	follows: CharacterProfileField[]
	/** The profile as the session reads it, followed fields already filled from the card. */
	profile: CharacterProfileV1
}
