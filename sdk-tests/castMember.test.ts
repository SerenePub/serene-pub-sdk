/**
 * 🚧 The character profile and the cast member (lane cv-sdk, 2026-11-06):
 * the field list, `core:query/cast-member@1`, `core:outlet/update-cast-member@1`,
 * and `update-character@1` keeping its ports.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { getDefinition, CHARACTER_PROFILE_FIELDS } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

describe('the character profile', () => {
	test('CHARACTER_PROFILE_FIELDS is the 17 names in order, without duplicates', () => {
		assert.deepEqual(
			[...CHARACTER_PROFILE_FIELDS],
			[
				'name',
				'nickname',
				'aliases',
				'summary',
				'description',
				'personality',
				'scenario',
				'greetings',
				'exampleDialogues',
				'postHistoryInstructions',
				'creatorNotes',
				'strokes',
				'faceMediaId',
				'likeness',
				'timbre',
				'spriteSet',
				'extensions',
			],
		)
		assert.equal(new Set(CHARACTER_PROFILE_FIELDS).size, CHARACTER_PROFILE_FIELDS.length)
	})
})

describe('the cast member declarations', () => {
	test('core:query/cast-member@1: scope and member in, main out', () => {
		assert.equal(C.castMember.id, 'core:query/cast-member@1')
		const d = getDefinition('core:query/cast-member@1')!
		assert.ok(d, 'registered')
		assert.equal(d.kind, 'query')
		assert.deepEqual(Object.keys(d.ports.in ?? {}).sort(), ['member', 'scope'])
		assert.deepEqual(Object.keys(d.ports.out ?? {}), ['main'])
	})

	test('core:outlet/update-cast-member@1: a write, review on changes, member and changes in', () => {
		assert.equal(C.updateCastMember.id, 'core:outlet/update-cast-member@1')
		const d = getDefinition('core:outlet/update-cast-member@1')!
		assert.ok(d, 'registered')
		assert.equal(d.kind, 'outlet')
		assert.equal(d.effects, 'write')
		assert.deepEqual(d.review?.fields, ['changes'])
		assert.deepEqual(Object.keys(d.ports.in ?? {}).sort(), ['changes', 'member'])
		assert.deepEqual(Object.keys(d.ports.out ?? {}).sort(), ['castVersionId', 'main'])
	})

	test('core:outlet/update-character@1 keeps its ports and review (the rename is the host’s)', () => {
		const d = getDefinition('core:outlet/update-character@1')!
		assert.ok(d, 'registered')
		assert.deepEqual(Object.keys(d.ports.in ?? {}).sort(), ['changes', 'characterId'])
		assert.deepEqual(Object.keys(d.ports.out ?? {}).sort(), ['characterId', 'main'])
		assert.deepEqual(d.review?.fields, ['changes'])
	})
})
