/**
 * Data audiences (R57, R59, R60; unit V1b): who besides pipelines may see a
 * stored value, said as a literal list of participant references on the write
 * that stores it; one merged view per reader; and a warning when the whole
 * annex — secrets included — feeds a prompt.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	aiHolds,
	compile,
	dataAudienceFindings,
	spec,
	use,
	validate,
	visibleTo,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

describe('the vocabulary', () => {
	test('person and ai are references; the AI view holds ai, participant and its speaker', () => {
		assert.equal(dataAudienceFindings(['person', 'ai', 'participant', 'owner', 'character:7', 'envoy:mascot']), undefined)
		assert.equal(dataAudienceFindings(undefined), undefined)
		assert.equal(dataAudienceFindings([]), undefined)
		assert.match(dataAudienceFindings('ai')!, /a list of participant references/)
		assert.match(dataAudienceFindings(['item'])!, /not an audience for a stored value/)
		assert.match(dataAudienceFindings(['character:'])!, /no readable id/)

		assert.equal(aiHolds(['ai']), true)
		assert.equal(aiHolds(['participant']), true)
		assert.equal(aiHolds(['person']), false)
		assert.equal(aiHolds(['character:7']), false)
		assert.equal(aiHolds(['character:7'], 'character:7'), true)
		assert.equal(aiHolds([]), false)
		// Spellings do not matter: a reference is compared in its one canonical form.
		assert.equal(aiHolds([' character:7' as never], 'character:7 ' as never), true)
		assert.equal(aiHolds(['not a ref' as never]), false)
	})

	test('one merged view per reader: unlisted keys are pipelines only (R59)', () => {
		const values = { 'acme.rp': { culprit: 'the butler', clue: 'a glove', hand: ['ace'] }, other: { x: 1 } }
		const audiences = { 'acme.rp': { clue: ['participant' as const], hand: ['character:7' as const] } }
		assert.deepEqual(visibleTo(values, audiences, (refs) => aiHolds(refs, 'character:7')), {
			'acme.rp': { clue: 'a glove', hand: ['ace'] },
		})
		assert.deepEqual(visibleTo(values, audiences, (refs) => aiHolds(refs)), { 'acme.rp': { clue: 'a glove' } })
		assert.deepEqual(visibleTo(values, audiences, () => false), {})
	})
})

describe('validate()', () => {
	const base = () =>
		spec('acme.rp:spec/keep', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
			genre: use('core:genre/chat'),
			event: 'core:event/message-respond@1',
		})

	test('the whole annex feeding a prompt is warned; the AI view is not (R60)', () => {
		const withView = (view?: string) =>
			compile(
				base()
					.query('annex', ($) =>
						C.sessionAnnex.v1({ scope: $.input.sessionScope, ...(view ? { view: view as never } : {}) }),
					)
					.task('prompt', ($) => C.assemble.v2({ templateContext: $.annex.main as never }))
					.build(),
			)
		const whole = validate(withView()).filter((f) => f.law === 'R60')
		assert.equal(whole.length, 1)
		assert.equal(whole[0]!.severity, 'warning')
		assert.match(whole[0]!.fix, /view: 'ai'/)
		assert.deepEqual(
			validate(withView('ai')).filter((f) => f.law === 'R60'),
			[],
		)
	})

	test("the settings document off an inlet is the whole annex too (R60)", () => {
		const doc = compile(
			base()
				.task('prompt', ($) => C.assemble.v2({ templateContext: $.input.session as never }))
				.build(),
		)
		assert.equal(validate(doc).filter((f) => f.law === 'R60').length, 1)
	})
})
