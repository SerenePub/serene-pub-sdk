/**
 * The catalogue claims (ruled 2026-08-27; genre rename 24 §2): `taxonomy` is
 * declared metadata — zone, role, one genre — never encoded into the id. It
 * rides the document like `genre` and `contributes` do: hashed with it
 * (changing a claim is a content change), round-tripping through import (F3),
 * and absent without complaint (an undeclared spec still lists, it just sorts
 * under "unclassified"). The pre-rename `mode` spelling is accepted as a
 * deprecated alias and normalized at construction — documents only ever
 * carry `genre`.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, compile, canonicalHash, importDocument } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const built = (taxonomy?: any) =>
	spec('demo:spec/taxed', { version: '1.0.0', ...(taxonomy ? { taxonomy } : {}) })
		.inlet('input', C.userMessage.v1())
		.build()

describe('spec taxonomy', () => {
	test('rides the document and round-trips (F3)', () => {
		const doc = compile(
			built({
				role: 'action',
				genre: 'core:genre/chat',
			}),
		)
		assert.deepEqual(doc.taxonomy, {
			role: 'action',
			genre: 'core:genre/chat',
		})
		const back = importDocument(doc)
		assert.deepEqual(back.taxonomy, doc.taxonomy)
		assert.equal(canonicalHash(back), canonicalHash(doc))
	})

	test('a changed claim is a content change — the hash moves', () => {
		const a = compile(built({ role: 'primary' }))
		const b = compile(built({ role: 'action' }))
		assert.notEqual(canonicalHash(a), canonicalHash(b))
	})

	test('the deprecated `mode` spelling normalizes to `genre` (24 §2)', () => {
		const doc = compile(built({ mode: 'core:genre/chat' }))
		assert.deepEqual(doc.taxonomy, { genre: 'core:genre/chat' })
		// meta.mode likewise: the document carries `genre`, never `mode`.
		const metaAliased = compile(
			spec('demo:spec/aliased', {
				version: '1.0.0',
				mode: { name: { en: 'Chat' }, family: 'chat' },
			})
				.inlet('input', C.userMessage.v1())
				.build(),
		)
		assert.equal(metaAliased.mode, undefined)
		assert.deepEqual(metaAliased.genre, { name: { en: 'Chat' }, family: 'chat' })
	})

	test('a create spec carries its genre declaration — name, family, shape (24 §3)', () => {
		const doc = compile(
			spec('demo:spec/create-crawl', {
				version: '1.0.0',
				taxonomy: { role: 'create' },
				genre: {
					name: { en: 'Dungeon Crawl' },
					family: 'adventure',
					shape: {
						composer: 'text',
						greeting: { enabled: true, channel: 'main' },
						channels: ['map'],
					},
				},
			})
				.inlet('input', C.userMessage.v1())
				.build(),
		)
		assert.equal((doc.taxonomy as any).role, 'create')
		assert.deepEqual((doc.genre as any).shape.channels, ['map'])
		// The shape is content: reshaping the genre moves the hash (republish).
		const reshaped = compile(
			spec('demo:spec/create-crawl', {
				version: '1.0.0',
				taxonomy: { role: 'create' },
				genre: {
					name: { en: 'Dungeon Crawl' },
					family: 'adventure',
					shape: { composer: 'none' },
				},
			})
				.inlet('input', C.userMessage.v1())
				.build(),
		)
		assert.notEqual(canonicalHash(reshaped), canonicalHash(doc))
	})

	test('absent taxonomy is fine and hashes distinctly from declared', () => {
		const bare = compile(built())
		assert.equal(bare.taxonomy, undefined)
		const claimed = compile(built({ zone: 'session' }))
		assert.notEqual(canonicalHash(bare), canonicalHash(claimed))
	})
})
