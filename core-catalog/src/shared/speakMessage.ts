/**
 * 🚧 **Read a message aloud** (PLAN-speech-build lane D, D4; ★1 follow-up
 * 2026-10-28) — the manual trigger of speech (design §10): a person presses
 * **Read aloud** on a line and it is cued, spoken and attached to the message,
 * REPLACING the audio an earlier press made, so pressing twice leaves ONE
 * spoken part. **Say it as…** is the same run with a collected *How should it
 * sound?*: the line is spoken the way the person describes instead of the way
 * it was recorded.
 *
 * One core spec, offered to every core genre by its defaults
 * (`genres/defaults.ts` registers every action this spec contributes): a
 * message's ⋮, the item rule for the audience (whoever the message belongs
 * to). The session's *Read aloud* setting is the automatic trigger's; these
 * work whatever it says.
 *
 *   inlet (messageId, text) → message-line (the row's words, speaker and
 *   inflection; `say` = the collected text) → junction on there being words →
 *   cue → speak → attach-audio (`replace: true`).
 *
 * The line is spoken with **its own speaker** (the character's voice for
 * dialogue, the narrator's for narration) and **its recorded inflection** —
 * the sprite shown on it — unless *Say it as…* says otherwise
 * (`core:query/message-line@1`). A hidden or still-written row reads as no
 * words, so the junction fires nothing and nothing is written.
 * @experimental
 */
import { compile, slot, spec, INFLECTION_LABELS, NEUTRAL_INFLECTION_LABEL } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { applyWiring, wiring } from './calls.js'

/** @experimental */
export const SPEAK_MESSAGE_SPEC_ID = 'core:spec/speak-message'
/** @internal */
export const SPEAK_MESSAGE_VERSION = '1.0.0'

/** The verbs' keys — a message's ⋮ lists them under these. @experimental */
export const SPEAK_MESSAGE_ACTION_KEYS = { readAloud: 'read-aloud', sayItAs: 'say-it-as' } as const

/** Both verbs: whoever the message belongs to acts (the item rule); any member sees them. */
const AUDIENCE = { see: ['participant'], act: ['item'] } as const

/** Both verbs: greyed on a hidden row or one still being written. */
const ENABLED_WHEN = [
	{ on: 'item.hidden', equals: false, reason: { en: 'unhide it first' } },
	{ on: 'item.generating', equals: false, reason: { en: 'wait for the message to finish' } },
] as const

/**
 * The moods *Say it as…* offers as chips: `INFLECTION_LABELS` less `neutral`
 * (the speech vocabulary), each with a lucide glyph; the common row first.
 */
const MOOD_GLYPHS: Record<string, [string, boolean]> = {
	joy: ['smile', true], sadness: ['frown', true], anger: ['flame', true], fear: ['ghost', true],
	surprise: ['zap', true], love: ['heart', true], amusement: ['laugh', false], admiration: ['star', false],
	approval: ['thumbs-up', false], caring: ['hand-heart', false], confusion: ['circle-help', false],
	curiosity: ['search', false], desire: ['flower-2', false], disappointment: ['cloud-rain', false],
	disapproval: ['thumbs-down', false], disgust: ['angry', false], embarrassment: ['eye-off', false],
	excitement: ['party-popper', false], gratitude: ['hand-heart', false], grief: ['cloud-drizzle', false],
	nervousness: ['activity', false], optimism: ['sun', false], pride: ['award', false],
	realization: ['lightbulb', false], relief: ['wind', false], remorse: ['heart-crack', false],
	annoyance: ['meh', false],
}
const MOOD_SUGGESTIONS = INFLECTION_LABELS.filter((l) => l !== NEUTRAL_INFLECTION_LABEL)
	.map((value) => ({
		value,
		label: value.charAt(0).toUpperCase() + value.slice(1),
		icon: MOOD_GLYPHS[value]?.[0] ?? 'smile',
		common: MOOD_GLYPHS[value]?.[1] ?? false,
	}))
	.sort((a, b) => Number(b.common) - Number(a.common))

/** @experimental */
export const speakMessageSpec = () => {
	const w = wiring()
	/** Re-speaking swaps the line's spoken part: ONE audio part per line. */
	w.params.push(['spoken.words.attach', { replace: true }])
	const head = spec(SPEAK_MESSAGE_SPEC_ID, {
		version: SPEAK_MESSAGE_VERSION,
		taxonomy: { role: 'action' },
		contributes: {
			actions: [
				{
					key: SPEAK_MESSAGE_ACTION_KEYS.readAloud,
					venue: { kind: 'message' },
					icon: 'volume-2',
					quick: true,
					audience: { see: [...AUDIENCE.see], act: [...AUDIENCE.act] },
					enabledWhen: ENABLED_WHEN.map((c) => ({ ...c })),
					label: { en: 'Read aloud' },
					description: {
						en: 'Make this message into speech. Pressing it again replaces the earlier recording.',
					},
				},
				{
					key: SPEAK_MESSAGE_ACTION_KEYS.sayItAs,
					venue: { kind: 'message' },
					icon: 'drama',
					quick: true,
					/** How it should sound, in the person's words — `message-line@1`'s `say`. */
					collects: {
						text: {
							need: 'required',
							label: { en: 'How should it sound?' },
							placeholder: { en: 'angrily, with a sigh, whispered' },
							suggestions: MOOD_SUGGESTIONS.map((m) => ({
								value: m.value,
								label: { en: m.label },
								icon: m.icon,
								...(m.common ? { common: true } : {}),
							})),
							remember: 'session',
							preview: { en: '“{subject}” — said with {value}' },
						},
					},
					audience: { see: [...AUDIENCE.see], act: [...AUDIENCE.act] },
					enabledWhen: ENABLED_WHEN.map((c) => ({ ...c })),
					label: { en: 'Say it as…' },
					description: {
						en: 'Read this message aloud the way you describe. It replaces any earlier recording of the message.',
					},
				},
			],
		},
	})
		.inlet('input', C.userMessage.v1(), { suits: [] })
		/**
		 * The row the press was made on — its words, whose line it is and how it
		 * was said; `say` is *Say it as…*'s collected text (empty on *Read aloud*).
		 * Hidden or still being written reads as no words.
		 */
		.query('line', ($) =>
			C.messageLine.v1({
				scope: $.input.sessionScope,
				messageId: $.input.messageId,
				say: $.input.text,
			}),
		)
	return compile(
		head
			/** Nothing to say (the row is hidden, still written, or empty): nothing runs, nothing is written. */
			.junction('spoken', { on: ($) => $.line.text }, (j: any) =>
				j.when('words', { truthy: true }, (b: any) =>
					b
						.task(
							'cue',
							($: any) =>
								C.cueLines.v1({
									text: $.line.text,
									speaker: $.line.speaker,
									inflection: $.line.inflection,
									cast: $.input.session,
									params: slot.params(),
								}),
							{ expose: { label: 'Cue the line for speech' } },
						)
						.oracle(
							'speak',
							($: any) =>
								C.speak.v1({
									cues: $.cue.cues,
									speaker: $.line.speaker,
									template: slot.template(),
									prompts: slot.prompts(),
									variables: slot.variables(),
									params: slot.params(),
								}),
							{ expose: { label: 'Speak the line', status: 'Speaking' } },
						)
						.outlet(
							'attach',
							($: any) =>
								C.attachAudio.v1({
									target: $.input.messageId,
									audio: $.speak.audio,
									meta: $.speak.meta,
									params: slot.params(),
								}),
							{ expose: { label: 'Attach the speech to the line' } },
						),
				),
			)
			.defaults((p: any) => applyWiring(p, w))
			.build(),
	)
}
