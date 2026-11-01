/**
 * Session creation modes (M0, F5): the declarations that let a
 * `next-chapter` session seed from the one it follows, and a genre propose how
 * its sessions start. The host's half is
 * `src/lib/server/sockets/sessions.creationModes.int.test.ts`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { annexField, genre } from '@serene-pub/sdk'

describe('annexField nextChapter', () => {
	test('true is carried onto the declaration', () => {
		const f = annexField({ key: 'rank', shape: { type: 'string' }, nextChapter: true })
		assert.equal(f.nextChapter, true)
	})

	test('absent stays absent', () => {
		const f = annexField({ key: 'rank', shape: { type: 'string' } })
		assert.equal('nextChapter' in f, false)
	})

	test('false is refused with its sentence', () => {
		assert.throws(
			() => annexField({ key: 'rank', shape: { type: 'string' }, nextChapter: false as unknown as true }),
			/nextChapter: true or absent — the value follows the player into the next chapter/,
		)
	})
})

describe('a genre proposes a creation mode', () => {
	test('{ propose: next-chapter } passes', () => {
		assert.doesNotThrow(() =>
			genre('acme.chapters:genre/saga', {
				name: 'Saga',
				family: 'chat',
				shape: { creationMode: { propose: 'next-chapter' } },
			}),
		)
	})

	test('{ propose: sequel } is refused with its sentence', () => {
		assert.throws(
			() =>
				genre('acme.chapters:genre/sequel', {
					name: 'Sequel',
					family: 'chat',
					shape: { creationMode: { propose: 'sequel' as 'new' } },
				}),
			/proposes creation mode \{"propose":"sequel"\}\. A genre may propose one of 'new', 'new-world', 'branch' or 'next-chapter'/,
		)
	})
})
