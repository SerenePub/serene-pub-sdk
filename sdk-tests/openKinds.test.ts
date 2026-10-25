/**
 * Open kinds and features (lane 2 — O1, LS4), reads keyed by kind (O2) and
 * requested outputs (O6).
 *
 * `MediaKind`, `IoKind` and `FeatureId` are the known values plus any string;
 * `MEDIA_KINDS` / `IO_KINDS` / `FEATURES` stay the KNOWN lists. A transform's
 * canonical order is the known kinds in today's order, then unknown kinds
 * alphabetically — so every id core stores today is unchanged.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	capabilityLabel,
	compareIoKinds,
	connectionReadsKind,
	FEATURES,
	IO_KINDS,
	IoKinds,
	isKnownIoKind,
	isMediaKind,
	MEDIA_KINDS,
	parseTransform,
	requirementForOutputs,
	tf,
	transformId,
	TRANSFORMS,
	type ConnectionReadsV1,
	type IoKind,
	type MediaKind,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

describe('O1 · kinds are open; the known lists stay the known lists', () => {
	test('MEDIA_KINDS / IO_KINDS / FEATURES are unchanged', () => {
		assert.deepEqual([...MEDIA_KINDS], ['image', 'audio', 'video', 'document'])
		assert.deepEqual([...IO_KINDS], ['text', 'image', 'audio', 'video', 'document', 'embedding', 'entities'])
		assert.ok(FEATURES.includes('json_schema'))
	})

	test('an unknown kind is a MediaKind / IoKind; isMediaKind still means "known"', () => {
		const hologram: MediaKind = 'hologram'
		const aroma: IoKind = 'aroma'
		assert.equal(isMediaKind(hologram), false)
		assert.equal(isMediaKind('audio'), true)
		assert.equal(isKnownIoKind(aroma), false)
		assert.equal(isKnownIoKind('entities'), true)
	})

	test('canonical order: known kinds in today’s order, then unknown alphabetically', () => {
		assert.deepEqual(['zeta', 'text', 'alpha', 'image'].sort(compareIoKinds), ['text', 'image', 'alpha', 'zeta'])
		assert.equal(transformId({ in: ['hologram', 'text', 'aroma', 'image'], out: ['text'] }), 'text+image+aroma+hologram->text')
		assert.equal(tf({ in: ['aroma', IoKinds.text], out: [IoKinds.audio, 'hologram'] }), 'text+aroma->audio+hologram')
		assert.deepEqual(parseTransform('text+aroma->audio'), { in: ['text', 'aroma'], out: ['audio'] })
	})

	test('every id core names today keeps its spelling', () => {
		for (const id of Object.keys(TRANSFORMS)) assert.equal(transformId(parseTransform(id as never)), id)
	})

	test('an unknown feature reads as its id; a known one keeps its label', () => {
		assert.equal(capabilityLabel('live'), 'live')
		assert.equal(capabilityLabel('json_schema'), 'JSON schema')
	})
})

describe('O6 · requested outputs', () => {
	test('requirementForOutputs swaps the output side, canonically', () => {
		assert.equal(requirementForOutputs('text->text', ['text', 'audio']), 'text->text+audio')
		assert.equal(requirementForOutputs('text->text', ['audio', 'text']), 'text->text+audio')
		assert.equal(requirementForOutputs('text+image->text', ['audio']), 'text+image->audio')
		assert.equal(requirementForOutputs('text->text', []), 'text->text')
		assert.equal(requirementForOutputs('text->text', undefined), 'text->text')
	})

	test('generate-text@1 asks for text unless told otherwise, and may emit audio', () => {
		const d = C.generateText.descriptor as unknown as {
			slots: { params: { schema: Record<string, { type: string; default?: unknown }> } }
			media: { accepts: string[]; emits: string[] }
		}
		assert.equal(d.slots.params.schema.outputs?.type, 'string[]')
		assert.deepEqual(d.slots.params.schema.outputs?.default, ['text'])
		assert.deepEqual(d.media.emits, ['image', 'audio'])
		// `audio` since O4 (2026-10-21): a voice note a pair that hears is sent.
		assert.deepEqual(d.media.accepts, ['image', 'document', 'audio'])
	})
})

describe('O2 · reads keyed by kind', () => {
	const reads: ConnectionReadsV1 = {
		kinds: {
			image: { reads: true, cost: { perItem: 1200 } },
			audio: { reads: false, why: 'This model does not hear audio.' },
			hologram: { reads: true },
		},
		image: true,
		pdf: false,
	}

	test('the kinds row answers, any kind included', () => {
		assert.deepEqual(connectionReadsKind(reads, 'image'), { reads: true, cost: { perItem: 1200 } })
		assert.deepEqual(connectionReadsKind(reads, 'audio'), { reads: false, why: 'This model does not hear audio.' })
		assert.deepEqual(connectionReadsKind(reads, 'hologram'), { reads: true })
		assert.deepEqual(connectionReadsKind(reads, 'video'), { reads: false }, 'no row: not read')
	})

	test('a value written before `kinds` reads through the ⏳ image/pdf fields', () => {
		const old = { image: true, pdf: false, why: { pdf: 'No PDFs here.' }, tokensPerImage: 1600 }
		assert.deepEqual(connectionReadsKind(old, 'image'), { reads: true, cost: { perItem: 1600 } })
		assert.deepEqual(connectionReadsKind(old, 'document'), { reads: false, why: 'No PDFs here.' })
		assert.deepEqual(connectionReadsKind(old, 'audio'), { reads: false })
		assert.deepEqual(connectionReadsKind(null, 'image'), { reads: false })
	})
})
