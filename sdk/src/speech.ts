/**
 * 🚧 **Speech** — the script a line is spoken from, and what speaking it
 * leaves behind (PLAN-speech-connections-and-timbre §10–§11; PLAN-speech-build
 * seam S3, 2026-10-28).
 *
 * One intermediate every speech service renders from, with no model between
 * the line and the request (owner ruling 2026-10-28: TTS shaping is universal
 * and deterministic):
 *
 *   line text ─ `core:task/cue-lines@1` (pure) ─▶ `Cue[]`
 *            ─ `core:oracle/speak@1` (groups by voice + inflection, renders
 *              each group through the line template, one call per group) ─▶
 *              audio + `CueMap` + `SpokenAs`
 *            ─ `core:outlet/attach-audio@1` (`meta: SpokenMeta`) ─▶ the line.
 *
 * Every word here is 🚧 (NOMENCLATURE R6): designed for this build, free to
 * move on contact. ⚠ A **cue** here is one run of a spoken line — never the
 * app's *scene cue* (the scene-break suggestion, `sceneSettings.ts`).
 * @ruling PLAN-speech-connections-and-timbre §11 (2026-10-28)
 */

import type { TemplateScope } from './template.js'
import { defineVariable } from './variables.js'

// ── Inflection ──────────────────────────────────────────────────────────────

/**
 * 🚧 The **inflection labels** core knows: the sprite standard set (go_emotions'
 * 28 labels, `neutral` among them — the app's `STANDARD_SPRITE_LABELS`), so the
 * sprite a line was given IS the inflection it is spoken with, with no second
 * model call. A starter vocabulary, never a closed one: a card's own sprite
 * labels pass through as inflections too, and a template or table that does not
 * know a label renders nothing for it.
 * @experimental
 */
export const INFLECTION_LABELS = [
	'admiration',
	'amusement',
	'anger',
	'annoyance',
	'approval',
	'caring',
	'confusion',
	'curiosity',
	'desire',
	'disappointment',
	'disapproval',
	'disgust',
	'embarrassment',
	'excitement',
	'fear',
	'gratitude',
	'grief',
	'joy',
	'love',
	'nervousness',
	'optimism',
	'pride',
	'realization',
	'relief',
	'remorse',
	'sadness',
	'surprise',
	'neutral',
] as const

/** 🚧 One of `INFLECTION_LABELS`. A stored label may be any string (see there). @experimental */
export type InflectionLabel = (typeof INFLECTION_LABELS)[number]

/** 🚧 The label that means "no particular inflection" — renders no tag and no sentence. @experimental */
export const NEUTRAL_INFLECTION_LABEL = 'neutral' satisfies InflectionLabel

/** 🚧 Is this one of core's known labels? @experimental */
export const isInflectionLabel = (value: unknown): value is InflectionLabel =>
	typeof value === 'string' && (INFLECTION_LABELS as readonly string[]).includes(value)

/**
 * 🚧 An expression the model wrote inline (`[laugh]`, `<sigh>`), lifted off the
 * text by the cue task, and where it stood.
 * @experimental
 */
export interface InflectionEvent {
	/** The marker as written, brackets stripped — `laugh`, `sigh`. */
	readonly marker: string
	/** Character offset into the line's text where the marker stood. */
	readonly at: number
}

/**
 * 🚧 **Inflection** — how a line (or a cue) is spoken: the recorded sprite
 * label, resolved, never guessed (§11.2). A record from day one (build
 * assumption A8) so intensity and events arrive without a new shape; phase 1
 * writes `label` only.
 * ⚠ Not a sprite pick: a sprite pick (`core:shape/sprite-pick@1`) is assignable
 * to an inflection port because it carries `label`; the reverse is not.
 * @experimental
 */
export interface Inflection {
	readonly label: string
	/** 0..1, how strongly. Absent = the label's ordinary strength. */
	readonly intensity?: number
	readonly events?: readonly InflectionEvent[]
}

// ── Cues ────────────────────────────────────────────────────────────────────

/** 🚧 What a run of a line is (§11.1). @experimental */
export const CUE_KINDS = ['dialogue', 'narration', 'action', 'aside'] as const
/** 🚧 @experimental */
export type CueKind = (typeof CUE_KINDS)[number]

/**
 * 🚧 Whose voice speaks a cue: the line's `speaker`, the session's `narrator`,
 * or nobody (`silent` — kept in the script, never sent).
 * @experimental
 */
export const CUE_VOICES = ['speaker', 'narrator', 'silent'] as const
/** 🚧 @experimental */
export type CueVoice = (typeof CUE_VOICES)[number]

/** 🚧 The emphasis a cue ended on, lifted off its punctuation. @experimental */
export type CueEmphasis = '!' | '?' | '…'

/**
 * 🚧 **A cue** — one run of a spoken line, the unit every speech template
 * renders and every speech service is called with (in groups). What
 * `core:task/cue-lines@1` publishes and `core:oracle/speak@1` reads.
 * ⚠ Not a *scene cue* (see the module header).
 * @experimental
 */
export interface Cue {
	/** The words to speak, markers and code removed. */
	readonly text: string
	readonly kind: CueKind
	readonly voice: CueVoice
	/**
	 * The cast name a `Name:` run switched to (multi-voice lines — the Lair,
	 * dialogue models). Absent = the line's own speaker.
	 */
	readonly speaker?: string
	/** The inflection label this cue is spoken with — its marker's, else the line's. */
	readonly inflection?: string
	/** Expression markers the model wrote inline, lifted off the text, never spoken as words. */
	readonly markers?: readonly string[]
	readonly emphasis?: CueEmphasis
}

/** 🚧 The cue task's `voices` param: which voice speaks each kind. @experimental */
export type CueVoices = Readonly<Record<CueKind, CueVoice>>

/** 🚧 The `voices` default (§11.1): dialogue is the speaker's, prose and action the narrator's, asides silent. @experimental */
export const DEFAULT_CUE_VOICES: CueVoices = Object.freeze({
	dialogue: 'speaker',
	narration: 'narrator',
	action: 'narrator',
	aside: 'silent',
})

/** 🚧 How the cue task reads `*…*` / `_…_` (its `asterisks` param). @experimental */
export const ASTERISK_READINGS = ['action', 'emphasis', 'ignore'] as const
/** 🚧 @experimental */
export type AsteriskReading = (typeof ASTERISK_READINGS)[number]

/**
 * 🚧 The quote styles that open dialogue, by default: each entry is the opening
 * mark then the closing mark (`""` is one style whose two marks are the same).
 * @experimental
 */
export const DEFAULT_QUOTE_STYLES: readonly string[] = Object.freeze(['""', '“”', '‘’', '«»', '「」', '『』'])

// ── What speaking leaves behind ─────────────────────────────────────────────

/** 🚧 One cue's place in the spoken audio. `cue` indexes the `Cue[]` spoken. @experimental */
export interface CueSpan {
	readonly cue: number
	readonly startMs: number
	readonly endMs: number
	/** The cue's words, kept so the spoken line can caption the cue that is playing (additive; older records lack it). */
	readonly text?: string
}

/**
 * 🚧 **The cue map** — where each cue sits in the audio, for highlighting as it
 * plays. `concatenated`: the host joined per-group audio and knows the group
 * edges; `service`: the service returned timings; `none`: nothing is known
 * (`spans` empty).
 * @experimental
 */
export interface CueMap {
	readonly source: 'concatenated' | 'service' | 'none'
	readonly spans: readonly CueSpan[]
}

/**
 * 🚧 Where a spoken voice came from, as the host's resolver names it (a copy of
 * its closed list, so a record reads without the host's code).
 * @experimental
 */
export type SpokenVoiceFrom =
	| 'timbre'
	| 'envoy'
	| 'narration-timbre'
	| 'envoy-narration'
	| 'session'
	| 'narration-default'
	| 'voicebank-default'
	| 'loadout'
	| 'service'

/**
 * 🚧 **What actually spoke** — the voice and model sent, and which request
 * keys the service honoured (`applied`) or could not (`ignored`), the same
 * discipline images use. No connection id: plugins are blind to connections
 * (R53); the host records its own.
 * @experimental
 */
export interface SpokenAs {
	/** The voice id sent for the first group spoken — the speaker's, normally. */
	readonly voice: string
	/** Every distinct voice id sent, in first-use order, when more than one spoke. */
	readonly voices?: readonly string[]
	readonly model: string
	/** The voicebank entry's name, when the voice came from one (additive; older records lack it). */
	readonly voiceName?: string
	/** Where the first voice came from in the resolver's chain (additive). `timbre` and `envoy` are the speaker's own. */
	readonly voiceFrom?: SpokenVoiceFrom
	readonly applied: readonly string[]
	readonly ignored: readonly string[]
}

/**
 * 🚧 **Spoken metadata** — the record a spoken line keeps per swipe beside its
 * audio part (seam S6: `metadata.spoken`). What `core:oracle/speak@1` publishes
 * on `meta` and `core:outlet/attach-audio@1` records.
 * @experimental
 */
export interface SpokenMeta {
	readonly spokenAs: SpokenAs
	readonly cueMap: CueMap
	/** The line's inflection as recorded when it was spoken, or null for none. */
	readonly inflection: Inflection | null
	/** The line template's id (`core:template/…@1`), or null when the node's inline source rendered. */
	readonly template: string | null
	/** ISO 8601, when it was spoken. */
	readonly at: string
}

// ── Templates ───────────────────────────────────────────────────────────────

/**
 * 🚧 The Jinja filters a speech template may use. Their bodies are the host's
 * (they read the resolved model's controls, which this package cannot see);
 * the names are fixed here so templates, the checker and the host agree.
 *  - `tag` — an inflection label → the resolved model's tag (`[sad]`), through
 *    `core:var/inflection-tag@1` and the model's tag vocabulary; empty when the
 *    model takes no tags or not that one.
 *  - `dialogue` / `narration` — a cue list → only its dialogue / its narration.
 *  - `strip_code` — text → text without code.
 *  - `spell_numbers` — text → numbers spelt out, where the service has no
 *    normalisation of its own.
 * @experimental
 */
export const SPEECH_JINJA_FILTERS = ['tag', 'dialogue', 'narration', 'strip_code', 'spell_numbers'] as const
/** 🚧 @experimental */
export type SpeechJinjaFilter = (typeof SPEECH_JINJA_FILTERS)[number]

/**
 * 🚧 What a **line template** (`core:oracle/speak@1`'s `template` slot) sees.
 * Rendered once per group of consecutive cues sharing a voice and an
 * inflection; what it renders is the text of one call.
 * @experimental
 */
export const SPOKEN_LINE_TEMPLATE_SCOPE = {
	cues: {
		type: 'list',
		description: 'The cues of this group, in order — each { text, kind, voice, speaker?, inflection?, markers?, emphasis? }.',
		of: {
			type: 'object',
			fields: {
				text: { type: 'string' },
				kind: { type: 'string', description: 'dialogue, narration, action or aside.' },
				voice: { type: 'string', description: 'speaker, narrator or silent.' },
				speaker: { type: 'string', optional: true },
				inflection: { type: 'string', optional: true },
				markers: { type: 'list', of: { type: 'string' }, optional: true },
				emphasis: { type: 'string', optional: true },
			},
		},
	},
	speaker: {
		type: 'object',
		description: 'Who the line belongs to.',
		fields: {
			ref: { type: 'string', description: 'The participant ref — character:12, user:3, narrator.' },
			name: { type: 'string', optional: true },
		},
	},
	voice: {
		type: 'string',
		description: "This group's voice — speaker or narrator. Never a service's voice id.",
	},
	controls: {
		type: 'object',
		description: 'What the resolved model takes: prose instruction, inline tags, several speakers.',
		fields: {
			instruction: { type: 'string', optional: true, description: "'prose' when the model takes a written direction." },
			tags: {
				type: 'object',
				optional: true,
				description: 'Present when the model takes inline tags.',
				fields: {
					syntax: { type: 'string' },
					vocabulary: { type: 'list', of: { type: 'string' }, optional: true, description: 'Absent when any tag is taken.' },
				},
			},
			multiSpeaker: { type: 'boolean', optional: true },
			language: { type: 'list', of: { type: 'string' }, optional: true },
		},
	},
} as const satisfies TemplateScope

/**
 * 🚧 The sentence that directs a voice for an inflection (§11.3) —
 * `sadness` → "Speak quietly, with restrained sadness." Rendered only for a
 * model that takes a written direction; the mapping is the layout row
 * (`core-catalog` `INFLECTION_SENTENCES`), so the wording is editable,
 * versioned text.
 * @experimental
 */
export const varInflectionSentence = defineVariable({
	id: 'core:var/inflection-sentence@1',
	i18n: { name: { en: 'Inflection sentence' } },
	description: {
		en: 'The inflection this group is spoken with, as a sentence that directs the voice. Empty for neutral or an unknown label.',
	},
	scope: {
		inflectionSentence: {
			type: 'object',
			fields: {
				label: { type: 'string' },
				intensity: { type: 'number', optional: true },
			},
		},
	},
	sample: { label: 'sadness', intensity: 0.5 },
})

/**
 * 🚧 The inline tag for an inflection label (§11.3) — `sadness` → `[sad]`.
 * What the `tag` filter renders through; the filter then drops a tag the
 * resolved model's vocabulary does not hold.
 * @experimental
 */
export const varInflectionTag = defineVariable({
	id: 'core:var/inflection-tag@1',
	i18n: { name: { en: 'Inflection tag' } },
	description: {
		en: 'An inflection label as the inline tag a tag-taking voice model reads. Empty for neutral or an unknown label.',
	},
	scope: { inflectionTag: { type: 'string' } },
	sample: 'sadness',
})
