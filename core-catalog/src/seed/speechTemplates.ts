/**
 * 🚧 Core's shipped **speech templates** (PLAN-speech-build seam S3, 2026-10-28;
 * PLAN-speech-connections-and-timbre §11.3): the three line templates
 * `core:oracle/speak@1`'s `template` slot offers, and the default layouts of
 * the two inflection variables. The catalog is the system of record; the app
 * seeds these rows (`pipeline_context_templates`, `pipeline_variable_templates`)
 * by `seedKey`, which must never change.
 *
 * Everything here is Jinja (`core:template/jinja2@1`) and pure: the same cues,
 * label and controls render the same text, byte for byte (owner ruling
 * 2026-10-28, TTS shaping is deterministic). The sources stay inside the
 * subset the SDK's engine renders — `{% for %}`, `{% if a == 'b' %}`,
 * `{{ path }}` — plus the host's speech filters (`SPEECH_JINJA_FILTERS`);
 * a host without the `tag` filter renders no tag, never the label as a word.
 *
 * The two mapping TABLES (label → sentence, label → tag) are the data; each
 * layout's source is generated from its table, and its code default reads the
 * same table, so the row and the floor cannot drift.
 */

import { INFLECTION_LABELS, jinja2, type InflectionLabel } from '@serene-pub/sdk'

/** The engine every speech template is written in. @internal */
export const SPEECH_TEMPLATE_ENGINE = jinja2.id

// ── The tables ──────────────────────────────────────────────────────────────

/**
 * 🚧 `core:var/inflection-sentence@1`'s table: the sentence that directs a
 * voice for each label. Serene Pub's own prose. `neutral` directs nothing.
 * @experimental
 */
export const INFLECTION_SENTENCES: Readonly<Record<InflectionLabel, string>> = Object.freeze({
	admiration: 'Speak warmly, with open admiration.',
	amusement: 'Speak lightly, amused, with a smile in the voice.',
	anger: 'Speak with controlled anger, clipped and firm.',
	annoyance: 'Speak with mild annoyance, a little short.',
	approval: 'Speak warmly and approvingly.',
	caring: 'Speak gently, with care and warmth.',
	confusion: 'Speak hesitantly, puzzled, as if working something out.',
	curiosity: 'Speak with lively curiosity.',
	desire: 'Speak low and longing, with quiet desire.',
	disappointment: 'Speak flatly, with quiet disappointment.',
	disapproval: 'Speak coolly, with clear disapproval.',
	disgust: 'Speak with distaste, as if recoiling.',
	embarrassment: 'Speak softly and awkwardly, embarrassed.',
	excitement: 'Speak quickly and brightly, excited.',
	fear: 'Speak tensely and quietly, afraid.',
	gratitude: 'Speak warmly and sincerely, grateful.',
	grief: 'Speak slowly and heavily, with deep grief.',
	joy: 'Speak brightly, with open joy.',
	love: 'Speak tenderly, with deep affection.',
	nervousness: 'Speak nervously, a little fast and unsteady.',
	optimism: 'Speak hopefully, with an upbeat lift.',
	pride: 'Speak with quiet pride, steady and assured.',
	realization: 'Speak as if something has just become clear.',
	relief: 'Speak with relief, as if letting out a breath.',
	remorse: 'Speak softly and haltingly, full of remorse.',
	sadness: 'Speak quietly, with restrained sadness.',
	surprise: 'Speak with sudden surprise.',
	neutral: '',
})

/**
 * 🚧 `core:var/inflection-tag@1`'s table: the tag word for each label, written
 * `[word]`. The host's `tag` filter then keeps it only when the resolved
 * model's tag vocabulary holds that word (or takes any tag). `neutral` tags
 * nothing.
 * @experimental
 */
export const INFLECTION_TAGS: Readonly<Record<InflectionLabel, string>> = Object.freeze({
	admiration: 'admiring',
	amusement: 'amused',
	anger: 'angry',
	annoyance: 'annoyed',
	approval: 'approving',
	caring: 'gentle',
	confusion: 'confused',
	curiosity: 'curious',
	desire: 'longing',
	disappointment: 'disappointed',
	disapproval: 'disapproving',
	disgust: 'disgusted',
	embarrassment: 'embarrassed',
	excitement: 'excited',
	fear: 'scared',
	gratitude: 'grateful',
	grief: 'sorrowful',
	joy: 'happy',
	love: 'tender',
	nervousness: 'nervous',
	optimism: 'hopeful',
	pride: 'proud',
	realization: 'thoughtful',
	relief: 'relieved',
	remorse: 'remorseful',
	sadness: 'sad',
	surprise: 'surprised',
	neutral: '',
})

const lookup = (table: Readonly<Record<string, string>>, label: unknown): string =>
	typeof label === 'string' && Object.hasOwn(table, label) ? table[label]! : ''

/** One `{% if root == 'label' %}text{% endif %}` per row that says something, unseparated. */
const tableSource = (path: string, table: Readonly<Record<string, string>>, wrap: (s: string) => string): string =>
	INFLECTION_LABELS.filter((l) => table[l])
		.map((l) => `{% if ${path} == '${l}' %}${wrap(table[l]!)}{% endif %}`)
		.join('')

// ── Variable layouts ────────────────────────────────────────────────────────

/** 🚧 One default layout core seeds for an inflection variable. @internal */
export interface ShippedSpeechVariableLayout {
	/** The app's seed key for a variable's bare row: `pipeline-variable-template:<variableId>:content`. */
	seedKey: string
	/** `coreTemplateIdFor(seedKey)` — the whole key slugified (R19). */
	templateId: string
	variableId: string
	/** The key it renders under on `speak@1`'s `variables` slot — also its scope root. */
	key: string
	name: string
	engine: string
	source: string
	/** The in-code floor this row reproduces byte for byte. */
	render: (value: unknown) => string
}

/** 🚧 The direction sentence: `{ label: 'sadness' }` → "Speak quietly, with restrained sadness." @experimental */
export const INFLECTION_SENTENCE_LAYOUT: ShippedSpeechVariableLayout = Object.freeze({
	seedKey: 'pipeline-variable-template:core:var/inflection-sentence@1:content',
	templateId: 'core:template/pipeline-variable-template-core-var-inflection-sentence-1-content@1',
	variableId: 'core:var/inflection-sentence@1',
	key: 'inflectionSentence',
	name: 'Sentence',
	engine: SPEECH_TEMPLATE_ENGINE,
	source: tableSource('inflectionSentence.label', INFLECTION_SENTENCES, (s) => s),
	render: (value: unknown) =>
		lookup(INFLECTION_SENTENCES, value && typeof value === 'object' ? (value as { label?: unknown }).label : undefined),
})

/** 🚧 The inline tag: `'sadness'` → `[sad]`. @experimental */
export const INFLECTION_TAG_LAYOUT: ShippedSpeechVariableLayout = Object.freeze({
	seedKey: 'pipeline-variable-template:core:var/inflection-tag@1:content',
	templateId: 'core:template/pipeline-variable-template-core-var-inflection-tag-1-content@1',
	variableId: 'core:var/inflection-tag@1',
	key: 'inflectionTag',
	name: 'Bracket tag',
	engine: SPEECH_TEMPLATE_ENGINE,
	source: tableSource('inflectionTag', INFLECTION_TAGS, (s) => `[${s}]`),
	render: (value: unknown) => {
		const word = lookup(INFLECTION_TAGS, value)
		return word ? `[${word}]` : ''
	},
})

/** 🚧 Every inflection layout core seeds, one per variable (each its variable's default). @experimental */
export const SHIPPED_SPEECH_VARIABLE_LAYOUTS: readonly ShippedSpeechVariableLayout[] = Object.freeze([
	INFLECTION_SENTENCE_LAYOUT,
	INFLECTION_TAG_LAYOUT,
])

// ── Line templates ──────────────────────────────────────────────────────────

/** The pool: speak's node definition, unversioned. */
const SPEAK_NODE_TYPE = 'core:oracle/speak'

/** A spoken cue, with its tag first when the model takes tags — the body every line template shares. */
const SPOKEN_CUE =
	"{% if cue.voice != 'silent' %}" +
	'{% if controls.tags %}{% if cue.inflection %}{{ cue.inflection | tag }} {% endif %}{% endif %}' +
	'{{ cue.text }} ' +
	'{% endif %}'

/** 🚧 One line template core seeds into `pipeline_context_templates`. @internal */
export interface ShippedSpokenLineTemplate {
	/** `pipeline-context-template:core:<name>` — never changes. */
	seedKey: string
	/** `coreTemplateIdFor(seedKey)` — the whole key slugified (R19). */
	templateId: string
	/** The pool: `core:oracle/speak`, unversioned. */
	nodeDefinitionId: string
	name: string
	engine: string
	source: string
	/** The pool's default row — what a fresh install's Read aloud speaks with. */
	isDefault: boolean
}

/**
 * 🚧 **Whole line** — every cue that has a voice, dialogue and prose alike.
 * The default. Output is the group's words with a space after each cue; the
 * host trims and collapses runs of spaces before the call.
 * @experimental
 */
export const SPOKEN_LINE_WHOLE: ShippedSpokenLineTemplate = Object.freeze({
	seedKey: 'pipeline-context-template:core:spoken-line-whole',
	templateId: 'core:template/pipeline-context-template-core-spoken-line-whole@1',
	nodeDefinitionId: SPEAK_NODE_TYPE,
	name: 'Whole line',
	engine: SPEECH_TEMPLATE_ENGINE,
	source: `{% for cue in cues %}${SPOKEN_CUE}{% endfor %}`,
	isDefault: true,
})

/** 🚧 **Dialogue only** — what is said in quotes, and nothing else. @experimental */
export const SPOKEN_LINE_DIALOGUE: ShippedSpokenLineTemplate = Object.freeze({
	seedKey: 'pipeline-context-template:core:spoken-line-dialogue',
	templateId: 'core:template/pipeline-context-template-core-spoken-line-dialogue@1',
	nodeDefinitionId: SPEAK_NODE_TYPE,
	name: 'Dialogue only',
	engine: SPEECH_TEMPLATE_ENGINE,
	source: `{% for cue in cues %}{% if cue.kind == 'dialogue' %}${SPOKEN_CUE}{% endif %}{% endfor %}`,
	isDefault: false,
})

/**
 * 🚧 **Narration only** — everything but the dialogue: the prose and the
 * actions (asides stay silent unless the cue task's `voices` says otherwise).
 * @experimental
 */
export const SPOKEN_LINE_NARRATION: ShippedSpokenLineTemplate = Object.freeze({
	seedKey: 'pipeline-context-template:core:spoken-line-narration',
	templateId: 'core:template/pipeline-context-template-core-spoken-line-narration@1',
	nodeDefinitionId: SPEAK_NODE_TYPE,
	name: 'Narration only',
	engine: SPEECH_TEMPLATE_ENGINE,
	source: `{% for cue in cues %}{% if cue.kind != 'dialogue' %}${SPOKEN_CUE}{% endif %}{% endfor %}`,
	isDefault: false,
})

/** 🚧 Every line template core seeds, the default first. @experimental */
export const SHIPPED_SPOKEN_LINE_TEMPLATES: readonly ShippedSpokenLineTemplate[] = Object.freeze([
	SPOKEN_LINE_WHOLE,
	SPOKEN_LINE_DIALOGUE,
	SPOKEN_LINE_NARRATION,
])

/**
 * 🚧 The line templates' ids by what they speak — what session setting
 * `speech.template` stores (seam S7; default `whole`).
 * @experimental
 */
export const SPOKEN_LINE_TEMPLATE_IDS = Object.freeze({
	whole: SPOKEN_LINE_WHOLE.templateId,
	dialogue: SPOKEN_LINE_DIALOGUE.templateId,
	narration: SPOKEN_LINE_NARRATION.templateId,
} as const)

/**
 * 🚧 The speak node's **direction**, seeded as a prompt row
 * (`pipeline-prompt:core:oracle/speak:prompts:speak-direction`, `fields.direction`).
 * The app's code default reads this same text, so the row and the floor cannot drift.
 * @experimental
 */
export const SPEAK_DIRECTION_SOURCE = '{{ timbreDescription }} {{ inflectionSentence }}'
