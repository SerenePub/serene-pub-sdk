/**
 * The narrator's cadence (playtest ruling 2026-11-04, item 7): the
 * `narratorInterjections` field's four choices, and the seeded script that
 * reads them (and the old boolean) into `narrator-every`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { NARRATOR_INTERJECTIONS_FIELD, storyGenre } from '../core-catalog/src/registry/genres.js'
import { UNPROMPTED_MODES_SCRIPT } from '../core-catalog/src/factories/turnOrder.js'

const run = new Function(...UNPROMPTED_MODES_SCRIPT.varsIn, UNPROMPTED_MODES_SCRIPT.source) as (
	value: unknown
) => Record<string, unknown>
const withFields = (fields: Record<string, unknown>) => run({ session: { fields } })

describe('NARRATOR_INTERJECTIONS_FIELD', () => {
	test("is the Narrator's turn enum of four cadences, off by default, owner-reach, under Turns", () => {
		const f = NARRATOR_INTERJECTIONS_FIELD as any
		assert.equal(f.label.en, "Narrator's turn")
		assert.equal(f.type, 'enum')
		assert.deepEqual(f.of, ['off', 'every-round', 'every-2nd-round', 'every-3rd-round'])
		assert.deepEqual(
			f.members.map((m: { key: string }) => m.key),
			['off', 'every-round', 'every-2nd-round', 'every-3rd-round']
		)
		assert.equal(f.default, 'off')
		assert.equal(f.group, 'Turns')
		assert.equal(f.reach, 'owner')
		assert.ok(f.description.en.length > 0)
	})

	test("is the Story genre's narratorInterjections field", () => {
		assert.equal((storyGenre as any).shape.fields.narratorInterjections, NARRATOR_INTERJECTIONS_FIELD)
	})
})

describe('UNPROMPTED_MODES_SCRIPT', () => {
	test('a stored true reads as every round', () => {
		assert.deepEqual(withFields({ narratorInterjections: true }), {
			'side-cast': 'off',
			'narrator-interjections': 'full',
			'narrator-every': 1,
		})
	})

	test('false, absent, off and any other string are off, with no narrator-every', () => {
		for (const fields of [
			{ narratorInterjections: false },
			{},
			{ narratorInterjections: 'off' },
			{ narratorInterjections: 'constructor' },
		]) {
			const out = withFields(fields)
			assert.equal(out['narrator-interjections'], 'off')
			assert.equal('narrator-every' in out, false)
		}
	})

	test('the cadences map to 1, 2 and 3', () => {
		assert.equal(withFields({ narratorInterjections: 'every-round' })['narrator-every'], 1)
		assert.equal(withFields({ narratorInterjections: 'every-2nd-round' })['narrator-every'], 2)
		assert.equal(withFields({ narratorInterjections: 'every-3rd-round' })['narrator-every'], 3)
		assert.equal(withFields({ narratorInterjections: 'full' })['narrator-every'], 1)
		assert.equal(withFields({ narratorInterjections: 'review' })['narrator-every'], 1)
	})

	test('sideCast keeps its mapping', () => {
		assert.equal(withFields({ sideCast: true })['side-cast'], 'full')
		assert.equal(withFields({ sideCast: false })['side-cast'], 'off')
	})

	test('a non-object value turns both off', () => {
		for (const v of [null, undefined, 5, 'x']) {
			const out = run(v)
			assert.equal(out['side-cast'], 'off')
			assert.equal(out['narrator-interjections'], 'off')
		}
	})
})
