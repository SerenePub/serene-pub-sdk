/**
 * A genre's `shape.castFromLorebook` and the `create-session` request's `persona`
 * (M3b, lane D; rulings ★M3-4 and ★M3-3).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	genre,
	CREATE_SESSION_PERSONA_NAME_MAX,
	CREATE_SESSION_PERSONA_DESCRIPTION_MAX,
	type SessionShape,
	type WidgetRequests,
} from '@serene-pub/sdk'

const base = (shape: unknown) => ({ name: { en: 'X' }, family: 'test', shape }) as any
const fields = {
	examples: { type: 'boolean', default: true, label: { en: 'Examples' } },
	title: { type: 'string', default: '' },
}

describe('a genre’s shape.castFromLorebook', () => {
	test('accepted with no field, and survives genre() unchanged', () => {
		const declared = { lorebook: 'optional', characters: { min: 0 }, castFromLorebook: {} }
		const g = genre('test.cast:genre/nofield', base(declared))
		assert.deepEqual(g.shape?.castFromLorebook, {})
	})
	test('accepted with a boolean field, and survives genre() unchanged', () => {
		const g = genre(
			'test.cast:genre/field',
			base({
				lorebook: 'optional',
				characters: { min: 0, max: 8 },
				fields,
				castFromLorebook: { field: 'examples' },
			}),
		)
		assert.deepEqual(g.shape?.castFromLorebook, { field: 'examples' })
	})
	test('a field missing from shape.fields is refused', () => {
		assert.throws(
			() =>
				genre(
					'test.cast:genre/missing',
					base({
						lorebook: 'optional',
						characters: { min: 0 },
						fields,
						castFromLorebook: { field: 'nope' },
					}),
				),
			/test\.cast:genre\/missing\.shape\.castFromLorebook\.field must name a boolean field of this shape; 'nope' is not declared in shape\.fields/,
		)
	})
	test('a field of another type is refused', () => {
		assert.throws(
			() =>
				genre(
					'test.cast:genre/type',
					base({
						lorebook: 'optional',
						characters: { min: 0 },
						fields,
						castFromLorebook: { field: 'title' },
					}),
				),
			/test\.cast:genre\/type\.shape\.castFromLorebook\.field must name a boolean field of this shape; 'title' is a string field/,
		)
	})
	test('an empty or non-string field is refused', () => {
		for (const field of ['', '  ', 3]) {
			assert.throws(
				() =>
					genre(
						'test.cast:genre/badfield',
						base({
							lorebook: 'optional',
							characters: { min: 0 },
							fields,
							castFromLorebook: { field },
						}),
					),
				/test\.cast:genre\/badfield\.shape\.castFromLorebook\.field must be the name of a boolean field/,
			)
		}
	})
	test('without a lorebook it is refused', () => {
		assert.throws(
			() =>
				genre(
					'test.cast:genre/nobook',
					base({ characters: { min: 0 }, castFromLorebook: {} }),
				),
			/test\.cast:genre\/nobook\.shape\.castFromLorebook needs shape\.lorebook/,
		)
	})
	test('without a characters capability it is refused', () => {
		assert.throws(
			() =>
				genre(
					'test.cast:genre/noseats',
					base({ lorebook: 'optional', castFromLorebook: {} }),
				),
			/test\.cast:genre\/noseats\.shape\.castFromLorebook needs character seats: shape\.characters is absent/,
		)
	})
	test('characters with max 0 is refused', () => {
		assert.throws(
			() =>
				genre(
					'test.cast:genre/zero',
					base({
						lorebook: 'optional',
						characters: { min: 0, max: 0 },
						castFromLorebook: {},
					}),
				),
			/test\.cast:genre\/zero\.shape\.castFromLorebook needs character seats: shape\.characters is max: 0/,
		)
	})
	test('a non-object is refused', () => {
		for (const bad of [true, 'examples', null, ['examples']]) {
			assert.throws(
				() =>
					genre(
						'test.cast:genre/obj',
						base({
							lorebook: 'optional',
							characters: { min: 0 },
							castFromLorebook: bad,
						}),
					),
				/test\.cast:genre\/obj\.shape\.castFromLorebook must be an object/,
			)
		}
	})
})

describe('the create-session request’s persona', () => {
	test('the declaration compiles on the shape and on the request', () => {
		const shape: SessionShape = {
			lorebook: 'optional',
			characters: { min: 0 },
			castFromLorebook: { field: 'examples' },
		}
		const params: WidgetRequests['create-session']['params'] = {
			genre: 'acme.life:genre/life',
			fields: { examples: true },
			lorebookId: 3,
			persona: { name: 'Ada', description: 'A cartographer.' },
		}
		const nameOnly: WidgetRequests['create-session']['params'] = {
			genre: 'g',
			persona: { name: 'Ada' },
		}
		assert.equal(shape.castFromLorebook?.field, 'examples')
		assert.equal(params.persona?.name, 'Ada')
		assert.equal(nameOnly.persona?.description, undefined)
	})
	test('the two limits are final', () => {
		assert.equal(CREATE_SESSION_PERSONA_NAME_MAX, 80)
		assert.equal(CREATE_SESSION_PERSONA_DESCRIPTION_MAX, 2000)
	})
})
