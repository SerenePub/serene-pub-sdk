/**
 * 🚧 The genre-owned summarize-scene (live scenes §13–§14, 2026-10-13): the
 * genre's `summarize` field, the `summarizeScene()` builder, and core's four
 * genres eating their own cooking. C34 (`conformance.test.ts`) runs the specs.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { genre, getGenre, genreSummarizeFindings, _registerPackageGenre, _withdrawGenre, validate } from '@serene-pub/sdk'
import {
	CORE_PROMPTS,
	CORE_SPECS,
	LAIR_TRANSCRIPT_TEMPLATE,
	DEFAULT_TRANSCRIPT_TEMPLATE,
	STORY_SUMMARIZE_SCENE_SPEC_ID,
	GUIDE_SUMMARIZE_SCENE_SPEC_ID,
	LAIR_SUMMARIZE_SCENE_SPEC_ID,
	summarizeScene,
	storyGenre,
	lairGenre,
} from '@serene-pub/core-catalog'

describe("a genre's summarize field", () => {
	test('carries a spec id, and a genre that says nothing hashes as it did', () => {
		const g = genre('test.sum:genre/with', {
			name: 'With',
			family: 'chat',
			summarize: { scene: 'test.sum:spec/summarize-scene' },
		})
		assert.deepEqual(g.summarize, { scene: 'test.sum:spec/summarize-scene' })
		const bare = genre('test.sum:genre/without', { name: 'Without', family: 'chat' })
		assert.equal('summarize' in bare, false)
	})

	test('refuses what is not an owned spec id, at the declaration', () => {
		assert.throws(
			() => genre('test.sum:genre/bad', { name: 'Bad', family: 'chat', summarize: { scene: 'Not An Id' } }),
			/summarize\.scene/,
		)
		assert.throws(
			() => genre('test.sum:genre/bare', { name: 'Bare', family: 'chat', summarize: { scene: 'summarize-scene' } }),
			/names no owner/,
		)
		assert.match(genreSummarizeFindings({ world: 'core:spec/x' }).join(' '), /only 'scene' is read/)
		assert.deepEqual(genreSummarizeFindings(undefined), [])
	})

	test('a stored genre with a broken summarize keeps registering, without it', () => {
		const g = _registerPackageGenre('test.stored', {
			id: 'test.stored:genre/old',
			name: 'Old',
			family: 'chat',
			events: {},
			summarize: { scene: 42 as never },
		})
		assert.equal(g.summarize, undefined)
		_withdrawGenre('test.stored:genre/old')
	})
})

describe('the summarizeScene builder', () => {
	test('refuses a channel the genre does not declare, and the story as an aside', () => {
		assert.throws(
			() => summarizeScene('test.sum:spec/s1', { version: '1.0.0', genre: storyGenre, channels: { story: 'main', asides: ['sanctum'] } }),
			/'sanctum' is not a channel core:genre\/story declares/,
		)
		assert.throws(
			() => summarizeScene('test.sum:spec/s2', { version: '1.0.0', genre: lairGenre, channels: { story: 'main', asides: ['main'] } }),
			/cannot also be an aside/,
		)
	})

	test('compiles to the explicit graph, with the keys the scenes socket reads', () => {
		const doc: any = summarizeScene('test.sum:spec/s3', {
			version: '1.0.0',
			genre: lairGenre,
			channels: { story: 'main', asides: ['sanctum'] },
		})
		assert.deepEqual(
			doc.nodes.map((n: any) => `${n.key}=${n.definitionId}@${n.definitionVersion}`),
			[
				'input=core:inlet/summarize-request@1',
				'source=core:query/summarize-source@2',
				'attachments=core:query/history-attachments@1',
				'asideAttachments=core:query/history-attachments@1',
				'roster=core:query/session-cast@1',
				'render=core:task/render-transcript@1',
				'batches=core:task/batch-messages@2',
				'drafting.item.draft=core:oracle/summarize-batch@1',
				'synth=core:oracle/summarize-synth@1',
				'naming=core:oracle/name-entry@1',
				'save=core:outlet/create-lore-entry@1',
			],
		)
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
		// The cast extraction stays on ice (ruled 2026-09-08) unless asked for.
		const withCast: any = summarizeScene('test.sum:spec/s4', {
			version: '1.0.0',
			genre: storyGenre,
			channels: { story: 'main' },
			extractsCast: true,
		})
		assert.ok(withCast.nodes.some((n: any) => n.key === 'cast'))
	})
})

describe("core's genres own their summarize-scene", () => {
	const ids = {
		'core:genre/story': STORY_SUMMARIZE_SCENE_SPEC_ID,
		'core:genre/guide': GUIDE_SUMMARIZE_SCENE_SPEC_ID,
		'core:genre/lair': LAIR_SUMMARIZE_SCENE_SPEC_ID,
	}

	test('each genre names its spec, and the catalogue publishes it', () => {
		for (const [g, spec] of Object.entries(ids)) {
			assert.equal(getGenre(g)?.summarize?.scene, spec, g)
			assert.ok(CORE_SPECS.some((s) => s.slug === spec), `${spec} is in CORE_SPECS`)
		}
	})

	test("the Lair's reads the Sanctum as asides, with its own template; the others read main alone", () => {
		const presetValues = (slug: string) => {
			const doc: any = CORE_SPECS.find((s) => s.slug === slug)!.build()
			return doc.presets.find((p: any) => p.default).values as Array<{ nodeKey: string; slot: string; value: any }>
		}
		const lair = presetValues(LAIR_SUMMARIZE_SCENE_SPEC_ID)
		assert.deepEqual(lair.find((v) => v.nodeKey === 'source' && v.slot === 'params')!.value, {
			channel: 'main',
			asides: ['sanctum'],
		})
		assert.equal(lair.find((v) => v.nodeKey === 'render')!.value.source, LAIR_TRANSCRIPT_TEMPLATE)
		for (const slug of [STORY_SUMMARIZE_SCENE_SPEC_ID, STORY_SUMMARIZE_SCENE_SPEC_ID, GUIDE_SUMMARIZE_SCENE_SPEC_ID]) {
			const v = presetValues(slug)
			assert.deepEqual(v.find((x) => x.nodeKey === 'source')!.value, { channel: 'main', asides: [] })
			assert.equal(v.find((x) => x.nodeKey === 'render')!.value.source, DEFAULT_TRANSCRIPT_TEMPLATE)
		}
		for (const t of [DEFAULT_TRANSCRIPT_TEMPLATE, LAIR_TRANSCRIPT_TEMPLATE])
			for (const section of ['preamble', 'line', 'aside']) assert.match(t, new RegExp(`\\{\\{#\\*inline "${section}"\\}\\}`))
		assert.match(LAIR_TRANSCRIPT_TEMPLATE, /Sanctum/)
	})

	test('every spec starts on a drafting row that places {{batch}}, and on the scene synth and naming rows', () => {
		for (const spec of Object.values(ids)) {
			const pools = CORE_PROMPTS.filter((p) => p.defaultForSpecs.includes(spec)).map((p) => p.nodeType).sort()
			assert.deepEqual(pools, ['core:oracle/name-entry', 'core:oracle/summarize-batch', 'core:oracle/summarize-synth'], spec)
			const drafting = CORE_PROMPTS.find((p) => p.nodeType === 'core:oracle/summarize-batch' && p.defaultForSpecs.includes(spec))!
			assert.match(drafting.fields.batch!, /\{\{batch\}\}/)
		}
		const lairDraft = CORE_PROMPTS.find((p) => p.seedKey.endsWith(':lair-summarize-scene'))!
		assert.match(lairDraft.fields.batch!, /Sanctum/)
	})
})

describe('🚧 the builder carries the genre\'s boundary triggers (★9, live scenes §15 G1)', () => {
	test('written onto the document as contributes.boundaryTriggers; absent when none, so the hash holds', () => {
		const floor = { key: 'newFloor', label: { en: 'the party reached a new floor' }, when: { channel: 'main', stateKey: 'floor' } }
		const doc: any = summarizeScene('test.sum:spec/b1', {
			version: '1.0.0',
			genre: lairGenre,
			channels: { story: 'main' },
			boundaries: [floor],
		})
		assert.deepEqual(doc.contributes, { boundaryTriggers: [floor] })
		assert.deepEqual(validate(doc).filter((f: any) => f.severity === 'error'), [])
		const bare: any = summarizeScene('test.sum:spec/b2', { version: '1.0.0', genre: lairGenre, channels: { story: 'main' } })
		assert.equal('contributes' in bare && bare.contributes !== undefined, false)
		const empty: any = summarizeScene('test.sum:spec/b3', { version: '1.0.0', genre: lairGenre, channels: { story: 'main' }, boundaries: [] })
		assert.equal(empty.contributes, undefined)
	})

	test('refused at the declaration: an unknown predicate, a channel the genre does not declare', () => {
		assert.throws(
			() =>
				summarizeScene('test.sum:spec/b4', {
					version: '1.0.0',
					genre: storyGenre,
					channels: { story: 'main' },
					boundaries: [{ key: 'sanctumTalk', label: 'x', when: { channel: 'sanctum' } }],
				}),
			/boundaries\[sanctumTalk\]\.when\.channel: 'sanctum' is not a channel the genre declares/,
		)
		assert.throws(
			() =>
				summarizeScene('test.sum:spec/b5', {
					version: '1.0.0',
					genre: storyGenre,
					channels: { story: 'main' },
					boundaries: [{ key: 'vibes', label: 'x', when: { mood: 'tense' } as never }],
				}),
			/when\.mood: not a predicate/,
		)
	})

	test("the Lair's declares one: a new floor on main", () => {
		const lair: any = CORE_SPECS.find((s: any) => s.slug === LAIR_SUMMARIZE_SCENE_SPEC_ID)!.build()
		assert.deepEqual(lair.contributes?.boundaryTriggers, [
			{ key: 'newFloor', label: { en: 'the party reached a new floor' }, when: { channel: 'main', stateKey: 'floor' } },
		])
		for (const id of [STORY_SUMMARIZE_SCENE_SPEC_ID, STORY_SUMMARIZE_SCENE_SPEC_ID, GUIDE_SUMMARIZE_SCENE_SPEC_ID]) {
			const doc: any = CORE_SPECS.find((s: any) => s.slug === id)!.build()
			assert.equal(doc.contributes, undefined, `${id} declares no trigger of its own`)
		}
	})
})
