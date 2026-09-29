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

import { spec, compile, canonicalHash, importDocument, use } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const built = (taxonomy?: any, lockGenre?: string) =>
	spec('demo:spec/taxed', { version: '1.0.0', ...(taxonomy ? { taxonomy } : {}) })
		.inlet(
			'input',
			C.userMessage.v1(),
			...((lockGenre ? [{ genre: use(lockGenre), event: 'core:event/message-respond@1' }] : []) as []),
		)
		.build()

describe('spec taxonomy', () => {
	test('rides the document and round-trips (F3) — its genre copied from the inlet lock (R48)', () => {
		const doc = compile(built({ role: 'action' }, 'core:genre/chat'))
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

	test('taxonomy never states a genre (R48)', () => {
		assert.throws(() => built({ genre: 'core:genre/chat' }), /states taxonomy.genre — drop it/)
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
		// A bare slug stays a bare slug in the document (R-C, 2026-09-17): the
		// element union added the long form, it did not normalise the short one
		// away, which is what keeps every genre written before it on its hash.
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

	test('a channel declared in full rides the document as written (R-C)', () => {
		const doc = compile(
			spec('demo:spec/create-room', {
				version: '1.0.0',
				taxonomy: { role: 'create' },
				genre: {
					name: { en: 'Writing Room' },
					family: 'writing',
					shape: {
						channels: ['main', { slug: 'manuscript', role: 'folio', voice: 'none' }],
					},
				},
			})
				.inlet('input', C.userMessage.v1())
				.build(),
		)
		assert.deepEqual((doc.genre as any).shape.channels, [
			'main',
			{ slug: 'manuscript', role: 'folio', voice: 'none' },
		])
		// Long form and short form are different declarations, so they hash
		// differently — the hash covers what was written, not what it resolves to.
		const short = compile(
			spec('demo:spec/create-room', {
				version: '1.0.0',
				taxonomy: { role: 'create' },
				genre: {
					name: { en: 'Writing Room' },
					family: 'writing',
					shape: { channels: ['main', 'manuscript'] },
				},
			})
				.inlet('input', C.userMessage.v1())
				.build(),
		)
		assert.notEqual(canonicalHash(short), canonicalHash(doc))
	})

	test('absent taxonomy is fine and hashes distinctly from declared', () => {
		const bare = compile(built())
		assert.equal(bare.taxonomy, undefined)
		const claimed = compile(built({ zone: 'session' }))
		assert.notEqual(canonicalHash(bare), canonicalHash(claimed))
	})
})
