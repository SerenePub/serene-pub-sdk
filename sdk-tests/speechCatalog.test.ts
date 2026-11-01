/**
 * Speech in the catalogue (PLAN-speech-build lanes A + D, verified by lane V):
 * the shipped line templates and layouts, the direction prompt, the
 * `speak-message` spec and its registration in every core genre, the speech
 * tail on the reply specs, and the `speak@1` contract.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	EMULATABLE_VIA,
	INFLECTION_LABELS,
	FEATURES,
	closure,
	collectsFindings,
	compile,
	placeActions,
	genreDefaultsOf,
	getDefinition,
	render,
	slot,
	spec,
	topGrade,
	validate,
	type CapabilitySet,
	type JinjaFilter,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	CORE_PROMPTS,
	CORE_SPECS,
	INFLECTION_SENTENCES,
	INFLECTION_SENTENCE_LAYOUT,
	INFLECTION_TAGS,
	INFLECTION_TAG_LAYOUT,
	SHIPPED_SPEECH_VARIABLE_LAYOUTS,
	SHIPPED_SPOKEN_LINE_TEMPLATES,
	SPEAK_DIRECTION_SOURCE,
	SPEAK_MESSAGE_ACTION_KEYS,
	SPEAK_MESSAGE_SPEC_ID,
	SPEECH_FIELD_KEYS,
	SPOKEN_LINE_TEMPLATE_IDS,
	coreGenres,
} from '@serene-pub/core-catalog'

const LABELS = [...INFLECTION_LABELS] as string[]
/** An unknown label (a card's own sprite label) and a missing one. */
const ODD: unknown[] = ['with a sigh', null, undefined, '', 42]

describe('inflection labels', () => {
	test('there are 28, neutral among them, no duplicates', () => {
		assert.equal(LABELS.length, 28)
		assert.ok(LABELS.includes('neutral'))
		assert.equal(new Set(LABELS).size, 28)
	})
	test('every label has a sentence and a tag row; neutral says nothing', () => {
		assert.deepEqual(Object.keys(INFLECTION_SENTENCES).sort(), [...LABELS].sort())
		assert.deepEqual(Object.keys(INFLECTION_TAGS).sort(), [...LABELS].sort())
		assert.equal(INFLECTION_SENTENCES.neutral, '')
		assert.equal(INFLECTION_TAGS.neutral, '')
		for (const l of LABELS.filter((x) => x !== 'neutral')) {
			assert.ok(INFLECTION_SENTENCES[l as never], l)
			assert.ok(INFLECTION_TAGS[l as never], l)
		}
	})
})

describe('shipped layouts', () => {
	test('both layouts are the only two, one per variable, each with a distinct id', () => {
		assert.deepEqual(SHIPPED_SPEECH_VARIABLE_LAYOUTS, [INFLECTION_SENTENCE_LAYOUT, INFLECTION_TAG_LAYOUT])
		assert.equal(new Set(SHIPPED_SPEECH_VARIABLE_LAYOUTS.map((l) => l.templateId)).size, 2)
	})
	for (const layout of [INFLECTION_SENTENCE_LAYOUT, INFLECTION_TAG_LAYOUT]) {
		const value = (label: unknown) => (layout === INFLECTION_SENTENCE_LAYOUT ? { label } : label)
		test(`${layout.key}: the row's source renders the same as its code floor for all 28 labels`, () => {
			for (const label of LABELS)
				assert.equal(render(layout.source, { [layout.key]: value(label) }), layout.render(value(label)), label)
		})
		test(`${layout.key}: an unknown label, null and junk render nothing, in both`, () => {
			for (const label of ODD) {
				assert.equal(layout.render(value(label)), '', String(label))
				assert.equal(render(layout.source, { [layout.key]: value(label) }), '', String(label))
			}
			assert.equal(layout.render(undefined), '')
		})
	}
	test('neutral renders nothing; a standard label renders its table row', () => {
		assert.equal(INFLECTION_SENTENCE_LAYOUT.render({ label: 'neutral' }), '')
		assert.equal(INFLECTION_SENTENCE_LAYOUT.render({ label: 'sadness' }), INFLECTION_SENTENCES.sadness)
		assert.equal(INFLECTION_TAG_LAYOUT.render('sadness'), '[sad]')
		assert.equal(INFLECTION_TAG_LAYOUT.render('neutral'), '')
	})
	test('prototype keys are not labels', () => {
		assert.equal(INFLECTION_TAG_LAYOUT.render('constructor'), '')
		assert.equal(INFLECTION_SENTENCE_LAYOUT.render({ label: '__proto__' }), '')
	})
})

describe('shipped line templates', () => {
	const tag: JinjaFilter = (v, scope) => (scope.controls ? INFLECTION_TAG_LAYOUT.render(v) : '')
	const cue = (inflection: unknown, text = 'Hi.', kind = 'narration', voice = 'narrator') => ({
		text,
		kind,
		voice,
		...(inflection === undefined ? {} : { inflection }),
	})
	const run = (src: string, cues: unknown[], controls: unknown = {}) =>
		render(src, { cues, controls }, { filters: { tag } }).replace(/\s+/g, ' ').trim()

	test('three templates: whole (the default), dialogue, narration', () => {
		assert.deepEqual(
			SHIPPED_SPOKEN_LINE_TEMPLATES.map((t) => t.templateId),
			[SPOKEN_LINE_TEMPLATE_IDS.whole, SPOKEN_LINE_TEMPLATE_IDS.dialogue, SPOKEN_LINE_TEMPLATE_IDS.narration],
		)
		assert.deepEqual(SHIPPED_SPOKEN_LINE_TEMPLATES.map((t) => t.isDefault), [true, false, false])
		for (const t of SHIPPED_SPOKEN_LINE_TEMPLATES) assert.equal(t.nodeDefinitionId, 'core:oracle/speak')
	})
	for (const t of SHIPPED_SPOKEN_LINE_TEMPLATES) {
		test(`${t.name}: renders all 28 labels + unknown + null without throwing, deterministically`, () => {
			for (const label of [...LABELS, ...ODD]) {
				for (const controls of [{}, { tags: { syntax: 'bracket', vocabulary: 'open' } }]) {
					const cues = [cue(label), cue(label, 'Said.', 'dialogue', 'speaker')]
					const a = run(t.source, cues, controls)
					assert.equal(a, run(t.source, cues, controls), String(label))
				}
			}
		})
		test(`${t.name}: with no tag filter handed it never speaks a label as a word`, () => {
			const out = render(t.source, {
				cues: [cue('sadness'), cue('anger', 'Go.', 'dialogue', 'speaker')],
				controls: { tags: { syntax: 'bracket', vocabulary: 'open' } },
			})
			assert.doesNotMatch(out, /sadness|anger|\[/)
		})
		test(`${t.name}: a silent cue is never spoken`, () => {
			assert.doesNotMatch(run(t.source, [cue(null, 'psst', 'aside', 'silent'), cue(null, 'a', 'dialogue', 'speaker')]), /psst/)
		})
	}
	test('whole speaks everything voiced, dialogue only dialogue, narration the rest', () => {
		const cues = [cue(null, 'N1'), cue(null, 'D1', 'dialogue', 'speaker'), cue(null, 'A1', 'action')]
		const by = Object.fromEntries(SHIPPED_SPOKEN_LINE_TEMPLATES.map((t) => [t.templateId, run(t.source, cues)]))
		assert.equal(by[SPOKEN_LINE_TEMPLATE_IDS.whole], 'N1 D1 A1')
		assert.equal(by[SPOKEN_LINE_TEMPLATE_IDS.dialogue], 'D1')
		assert.equal(by[SPOKEN_LINE_TEMPLATE_IDS.narration], 'N1 A1')
	})
	test('tags go before the cue they belong to, only when the model takes tags', () => {
		const w = SHIPPED_SPOKEN_LINE_TEMPLATES[0]!
		const cues = [cue('sadness', 'Oh.')]
		assert.equal(run(w.source, cues, { tags: { vocabulary: 'open' } }), '[sad] Oh.')
		assert.equal(run(w.source, cues, {}), 'Oh.')
		assert.equal(run(w.source, [cue('neutral', 'Oh.')], { tags: { vocabulary: 'open' } }), 'Oh.')
	})
})

describe('the direction prompt row', () => {
	const rows = CORE_PROMPTS.filter((p) => p.nodeType === 'core:oracle/speak')
	test('exactly one speak-direction row, carrying the shared source', () => {
		assert.equal(rows.length, 1)
		const r = rows[0]!
		assert.equal(r.seedKey, 'pipeline-prompt:core:oracle/speak:prompts:speak-direction')
		assert.equal(r.slot, 'prompts')
		assert.equal((r.fields as { direction: string }).direction, SPEAK_DIRECTION_SOURCE)
	})
	test('it is the default for the six speech specs', () => {
		assert.deepEqual([...(rows[0]!.defaultForSpecs ?? [])].sort(), [...SPEECH_SPECS, SPEAK_MESSAGE_SPEC_ID].sort())
		assert.equal((rows[0]!.defaultForSpecs ?? []).length, 6)
	})
})

const SPEECH_SPECS = [
	'core:spec/story-respond',
	'core:spec/story-narrate',
	'core:spec/story-side-character',
	'core:spec/guide-respond',
	'core:spec/lair-reply',
]
const build = (slug: string): any => CORE_SPECS.find((s) => s.slug === slug)!.build()

describe('core:spec/speak-message', () => {
	const doc = build(SPEAK_MESSAGE_SPEC_ID)
	const actions = doc.contributes.actions as any[]
	test('is a core spec and validates with no error', () => {
		assert.ok(CORE_SPECS.some((s) => s.slug === SPEAK_MESSAGE_SPEC_ID))
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
	})
	test('two actions: read-aloud and say-it-as, on a message', () => {
		assert.deepEqual(actions.map((a) => a.key), ['read-aloud', 'say-it-as'])
		assert.deepEqual(SPEAK_MESSAGE_ACTION_KEYS, { readAloud: 'read-aloud', sayItAs: 'say-it-as' })
		for (const a of actions) assert.deepEqual(a.venue, [{ kind: 'message' }])
	})
	test('say-it-as collects required text, labelled "How should it sound?"; read-aloud collects nothing', () => {
		const [read, say] = actions
		assert.equal(read.collects, undefined)
		assert.equal(say.collects.text.need, 'required')
		assert.equal(say.collects.text.label.en, 'How should it sound?')
	})
	test('both share the audience and the greying', () => {
		const [read, say] = actions
		assert.deepEqual(read.audience, say.audience)
		assert.deepEqual(read.enabledWhen, say.enabledWhen)
		assert.ok(read.enabledWhen.length >= 2)
		assert.deepEqual(read.enabledWhen.map((c: any) => c.on).sort(), ['item.generating', 'item.hidden'])
	})
	test('runs message-line → cue → speak → attach, attach replacing', () => {
		const defs = doc.nodes.map((n: any) => n.definitionId)
		assert.deepEqual(defs, [
			'core:inlet/user-message',
			'core:query/message-line',
			'core:task/cue-lines',
			'core:oracle/speak',
			'core:outlet/attach-audio',
		])
	})
	test('every core genre registers both actions of it', () => {
		const genres = coreGenres()
		assert.equal(genres.length, 5)
		for (const g of genres) {
			const regs = genreDefaultsOf(g)!.registrations.filter((r) => r.pipeline === SPEAK_MESSAGE_SPEC_ID)
			assert.equal(regs.length, 2, g.id)
			assert.deepEqual(
				regs.map((r) => JSON.stringify(r.trigger)).sort().length,
				2,
				`${g.id}: two distinct triggers`,
			)
		}
	})
})

describe('the reply specs carry no speech tail (speech follow-ups A3)', () => {
	// Speech is its own run now (core:spec/speak-message, started once the reply settles):
	// a reply spec holds no cue, no speak and no attach step, and no read-aloud junction.
	for (const slug of SPEECH_SPECS) {
		test(`${slug}: validates, with no cue, speak, attach or read-aloud branch`, () => {
			const doc = build(slug)
			assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
			const ids = (doc.nodes as any[]).map((n) => n.definitionId)
			for (const gone of ['core:task/cue-lines', 'core:oracle/speak', 'core:outlet/attach-audio']) {
				assert.ok(!ids.includes(gone), `${slug} still holds ${gone}`)
			}
			assert.ok(!JSON.stringify(doc.clauses).includes(SPEECH_FIELD_KEYS.readAloud), `${slug} still reads Read aloud`)
		})
	}
})

describe('a hand-built speech chain', () => {
	test('sprite-pick → cue-lines → speak → attach-audio validates', () => {
		const head = spec('test:spec/speech-chain', { version: '1.0.0', taxonomy: { role: 'reply' } as never })
			.inlet('input', C.userMessage.v1(), { suits: [] })
			.oracle('spritePick', ($: any) =>
				C.pickSprite.v1({
					text: $.input.text,
					speaker: $.input.speaker,
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			.task('cue', ($: any) =>
				C.cueLines.v1({
					text: $.input.text,
					speaker: $.input.speaker,
					inflection: $.spritePick.main,
					cast: $.input.session,
					params: slot.params(),
				}),
			)
			.oracle('speak', ($: any) =>
				C.speak.v1({
					cues: $.cue.cues,
					speaker: $.input.speaker,
					template: slot.template(),
					prompts: slot.prompts(),
					variables: slot.variables(),
					params: slot.params(),
				}),
			)
			.outlet('attach', ($: any) =>
				C.attachAudio.v1({
					target: $.input.messageId,
					audio: $.speak.audio,
					meta: $.speak.meta,
					params: slot.params(),
				}),
			)
		const doc: any = compile((head as any).build())
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
		assert.deepEqual(
			doc.nodes.map((n: any) => n.definitionId),
			[
				'core:inlet/user-message',
				'core:oracle/pick-sprite',
				'core:task/cue-lines',
				'core:oracle/speak',
				'core:outlet/attach-audio',
			],
		)
	})
})

describe('contracts and capabilities', () => {
	test('speak@1 has a 180 s time-box', () => {
		assert.equal(getDefinition('core:oracle/speak@1')?.timeoutMs, 180000)
		assert.equal((C.speak as any).timeoutMs ?? 180000, 180000)
	})
	test('audio_streaming is emulated by core itself: no backend feature raises it', () => {
		assert.deepEqual(EMULATABLE_VIA.audio_streaming, [])
		assert.ok((FEATURES as readonly string[]).includes('audio_streaming'))
		const everything: CapabilitySet = {}
		for (const f of FEATURES) if (f !== 'audio_streaming') (everything as any)[f] = topGrade(f)
		assert.equal(closure(everything).audio_streaming, undefined)
		assert.equal(closure({}).audio_streaming, undefined)
	})
	test('an adapter that declares audio_streaming keeps its grade through closure', () => {
		const out = closure({ audio_streaming: 1 })
		assert.equal(out.audio_streaming, 1)
	})
})

describe('speech polish: the heading icons and the mood picker are declared', () => {
	const doc = build(SPEAK_MESSAGE_SPEC_ID)
	const [read, say] = doc.contributes.actions as any[]
	test('both speak verbs are quick, so the message heading carries them; each is still listed in the overflow-or-primary menu', () => {
		assert.equal(read.quick, true)
		assert.equal(say.quick, true)
		assert.equal(read.icon, 'volume-2')
		assert.equal(say.icon, 'drama')
		const { primary, overflow } = placeActions(doc.contributes.actions as any[])['message']
		assert.deepEqual(primary.map((a: any) => a.key), ['read-aloud', 'say-it-as'])
		assert.deepEqual(overflow, [])
	})
	test('say-it-as offers every inflection label but neutral as chips, a common row first, remembering per session', () => {
		const t = say.collects.text
		assert.deepEqual(
			t.suggestions.map((s: any) => s.value).sort(),
			INFLECTION_LABELS.filter((l) => l !== 'neutral').sort(),
		)
		assert.ok(t.suggestions.slice(0, 6).every((s: any) => s.common === true))
		assert.ok(t.suggestions.every((s: any) => typeof s.icon === 'string' && s.label.en))
		assert.equal(t.remember, 'session')
		assert.match(t.preview.en, /\{subject\}.*\{value\}/)
		assert.deepEqual(collectsFindings(say.collects, 'say-it-as.collects'), [])
	})
	test('collectsFindings refuses malformed suggestions, remember and preview', () => {
		const base = { need: 'required', label: { en: 'How?' } }
		const bad = (text: object) => collectsFindings({ text: { ...base, ...text } }, 'x.collects')
		assert.match(bad({ suggestions: [] }).join('\n'), /suggestions is a list/)
		assert.match(bad({ suggestions: [{ value: '', label: { en: 'A' } }] }).join('\n'), /value is the text/)
		assert.match(bad({ suggestions: [{ value: 'a', label: { en: 'A' }, icon: 'Not A Name' }] }).join('\n'), /lucide kebab/)
		assert.match(bad({ suggestions: [{ value: 'a', label: { en: 'A' }, extra: 1 }] }).join('\n'), /'extra'/)
		assert.match(bad({ remember: 'forever' }).join('\n'), /remember is one of session/)
		assert.deepEqual(bad({ suggestions: [{ value: 'a', label: { en: 'A' } }], remember: 'session', preview: { en: '{value}' } }), [])
	})
})
