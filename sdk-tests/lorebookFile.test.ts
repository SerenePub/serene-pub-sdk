/** `lorebookFileFindings`: the one validator the packager and the app's importer share (M2c). */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lorebookFileFindings, LOREBOOK_FILE_LIMITS } from '@serene-pub/sdk'

const book = (entries: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'W', entries, ...extra })

describe('lorebookFileFindings', () => {
	test('a plain book, a bare list, a card and a SillyTavern index object are fine', () => {
		assert.deepEqual(lorebookFileFindings(book([{ keys: ['a'], content: 'x' }])), [])
		assert.deepEqual(lorebookFileFindings(JSON.stringify([{ keys: ['a'], content: 'x' }])), [])
		assert.deepEqual(lorebookFileFindings(JSON.stringify({ data: { character_book: { entries: [{ keys: [], content: '' }] } } })), [])
		assert.deepEqual(lorebookFileFindings(JSON.stringify({ entries: { 0: { key: ['a'], content: 'x' } } })), [])
	})
	test('not JSON, not an object, too deep', () => {
		assert.match(lorebookFileFindings('{nope')[0]!, /isn't valid JSON/)
		assert.match(lorebookFileFindings('3')[0]!, /must be an object/)
		assert.match(lorebookFileFindings('['.repeat(LOREBOOK_FILE_LIMITS.maxDepth + 1))[0]!, /nested more than/)
	})
	test('an entry that is not an object, and the per-entry ceilings', () => {
		assert.match(lorebookFileFindings(book([3]))[0]!, /Entry 1 isn't an object/)
		const long = 'x'.repeat(LOREBOOK_FILE_LIMITS.maxTextChars + 1)
		assert.match(lorebookFileFindings(book([{ keys: ['a'], content: long, name: 'Dragon' }]))[0]!, /Entry 1 \(“Dragon”\)'s content is/)
		assert.match(lorebookFileFindings(book([{ keys: ['a'.repeat(LOREBOOK_FILE_LIMITS.maxKeyChars + 1)], content: '' }]))[0]!, /a key .* characters long/)
	})
	test('too many entries; a name over the ceiling', () => {
		const many = Array.from({ length: LOREBOOK_FILE_LIMITS.maxEntries + 1 }, () => ({ keys: [], content: '' }))
		assert.match(lorebookFileFindings(book(many))[0]!, /too many entries/)
		assert.match(lorebookFileFindings(JSON.stringify({ name: 'n'.repeat(LOREBOOK_FILE_LIMITS.maxNameChars + 1), entries: [] }))[0]!, /name is/)
	})
})
