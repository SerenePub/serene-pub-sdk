/**
 * 🚧 Time passes… and the reply tick (PROPOSAL-live-scenes §6, lane D,
 * 2026-10-13): the story clock moved by an amount a person picks, or by a
 * fixed tick a session sets — never a model. The collect modal's **clock
 * step** (`collects.clockStep`), the `core:task/clock-step@1` contract, every
 * genre's *Time passes…* spec, Adventure's keeper action with the same
 * stepper, and Chat's *Each reply advances the clock by …* — off by default.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	CLOCK_STEP_MAX,
	actionDocumentFindings,
	actionsOf,
	clockStepRefusal,
	collectsFindings,
	getDefinition,
	validate,
} from '@serene-pub/sdk'
import '@serene-pub/contracts'
import {
	ADVANCE_TIME_ACTION_KEY,
	TIME_PASSES_COLLECTS,
	storyAdvanceTimeSpec,
	storyRestSpec,
	storyGenre,
	coreSpec,
	storyRespondSpec,
} from '@serene-pub/core-catalog'

describe('the clock step a press collects', () => {
	test('a label, and a default going forward; anything else is refused in words', () => {
		assert.deepEqual(collectsFindings({ clockStep: { label: { en: 'How much time passes?' } } }, 'x'), [])
		assert.deepEqual(
			collectsFindings({ clockStep: { label: 'How long?', default: { by: 2, unit: 'days' } } }, 'x'),
			[],
		)
		const out = collectsFindings({ clockStep: { default: { by: -1, unit: 'days' }, step: 1 } }, 'x')
		assert.ok(out.some((m) => /x\.clockStep\.label is required/.test(m)), out.join('\n'))
		assert.ok(out.some((m) => /x\.clockStep: 'step' is not something an action collects here/.test(m)), out.join('\n'))
		assert.ok(out.some((m) => /x\.clockStep\.default\.by is above 0/.test(m)), out.join('\n'))
		assert.ok(
			collectsFindings({ clockStep: { label: 'x', default: { by: 1, unit: 'weeks' } } }, 'x').some((m) =>
				/counts in minutes, hours, days, months, years/.test(m),
			),
		)
	})

	test("the host's door: a whole number other than zero, signed, within the bound, in a unit", () => {
		assert.equal(clockStepRefusal({ by: 3, unit: 'hours' }), null)
		assert.equal(clockStepRefusal({ by: -2, unit: 'years' }), null)
		assert.match(clockStepRefusal({ by: 0, unit: 'hours' })!, /other than zero/)
		assert.match(clockStepRefusal({ by: 1.5, unit: 'hours' })!, /whole number/)
		assert.match(clockStepRefusal({ by: CLOCK_STEP_MAX + 1, unit: 'days' })!, /at most/)
		assert.match(clockStepRefusal({ by: 1, unit: 'weeks' })!, /counts in/)
		assert.match(clockStepRefusal('3 hours')!, /\{ by, unit \}/)
	})

	test('the inlet carries it, and the clock-step task decides it', () => {
		const inlet = getDefinition('core:inlet/user-message@1')!
		assert.ok('clockStep' in (inlet.ports.out as Record<string, unknown>))
		const step = getDefinition('core:task/clock-step@1')!
		assert.ok(step, 'registered')
		assert.deepEqual(Object.keys(step.ports.in ?? {}), ['step', 'unless'])
		assert.deepEqual(Object.keys(step.ports.out ?? {}), ['main', 'moves', 'by', 'unit'])
	})
})

describe('Time passes… — every genre, no model', () => {
	for (const [name, build, id] of [
		['Story', storyAdvanceTimeSpec, 'core:spec/story-advance-time'],
		// The Lair's left with its rewrite (2026-10-21): not one of its actions (D7).
	] as const)
		test(`${name}'s: the stepper, the step, and the clock behind a junction on whether it moves`, () => {
			const doc = build() as any
			assert.equal(doc.id, id)
			assert.deepEqual(validate(doc).filter((f: any) => f.severity === 'error'), [])
			const [a] = actionsOf(doc)
			assert.equal(a!.key, ADVANCE_TIME_ACTION_KEY)
			assert.equal(a!.quick, true)
			assert.deepEqual(a!.collects, TIME_PASSES_COLLECTS)
			// 🚧 No lock (PLAN-layering D3, 2026-10-20): judged as a document whose actions registrations offer.
			assert.deepEqual(actionDocumentFindings(doc), [])
			const kinds = doc.nodes.map((n: any) => `${n.key}:${n.definitionId}`)
			assert.deepEqual(kinds, [
				'input:core:inlet/user-message',
				'step:core:task/clock-step',
				'clock.moves.advance:core:outlet/advance-story-clock',
			])
			assert.ok(!doc.nodes.some((n: any) => n.kind === 'oracle'), 'no model')
			const junction = doc.clauses.find((c: any) => c.kind === 'junction')
			assert.ok(junction)
			assert.equal(coreSpec(id)?.name, 'Time passes')
		})

	// 🚧 2026-10-19: Adventure's keeper-run Time passes retired with the genre;
	// Story's is the shared stepper graph above. Rest still collects no step.
	test("Rest collects no step; its one clock move is its keeper's, after its changes apply", () => {
		const rest = storyRestSpec() as any
		assert.equal(actionsOf(rest)[0]!.collects, undefined)
		// 🚧 Rest's one clock move is its keeper's, after its changes apply
		// (★3, lane F) — at the action's own mode since GM 2026-10-23 (G1 ★3).
		assert.deepEqual(
			rest.nodes.filter((n: any) => n.definitionId === 'core:outlet/advance-story-clock').map((n: any) => n.key),
			['keeperClock.moves.advance'],
		)
	})
})

describe("Story's reply tick (the roleplay Chat's)", () => {
	test('a session setting, off by default (By 0), gating Advance story clock behind a junction', () => {
		const doc = storyRespondSpec() as any
		const tick = doc.nodes.find((n: any) => n.key === 'tick')
		assert.equal(tick.definitionId, 'core:task/clock-step')
		assert.equal(tick.expose?.session, true)
		assert.deepEqual(tick.expose?.label, 'Each reply advances the clock by')
		assert.ok(doc.nodes.some((n: any) => n.key === 'clock.moves.advance' && n.definitionId === 'core:outlet/advance-story-clock' && n.clauseId))
		const by = (getDefinition('core:task/clock-step@1')!.slots as any).params.schema.by
		assert.equal(by.default, 0, 'off unless the session sets it')
		// 🚧 No lock (PLAN-layering D3, 2026-10-20): Story's defaults register it on message-respond.
		assert.equal(doc.input, undefined)
		assert.deepEqual(doc.suits, ['core:event/message-respond@1'])
		void storyGenre
	})
})
