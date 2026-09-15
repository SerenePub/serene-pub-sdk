/**
 * A `sampling` slot with no pick resolves to the instance default.
 *
 * ⚠ It resolved to `{}`, and the gap was invisible for as long as nothing read
 * the values. A host applies the same instance default at *dispatch* — so the
 * call went out against that window while the executor handed the node nothing —
 * and every Provider merely forwards its sampling (a host reduces it back to a
 * row id before calling), so no existing node could tell the two apart.
 *
 * The node that can tell is one that has to FIT something into that window.
 * `core:task/batch-messages@1` cuts a transcript into batches a model can hold;
 * with `{}` it clamped against nothing on every install that had never picked a
 * sampling config per step, which is the first-run state.
 *
 * `connection` has had this fallback all along (`world.activeConnection`), and
 * these tests are shaped like `slotAddress.test.ts`'s: the default is always a
 * DIFFERENT config from the one a test picks, so a fixture cannot pass by having
 * them be the same row.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { run, ok, slot, spec as makeSpec, SLOT_VALUE } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

/** `cfg_precise` is the instance default; `cfg_creative` is never the default. */
const withDefaultSampling = {
	...world,
	activeSampling: { 'core:shape/text-gen@1': 'cfg_precise' },
}

const doc = () =>
	publish(
		makeSpec('demo:sampling-fallback@1', { version: '1.0.0' })
			.input('input', C.userMessage.v1())
			.provider('generate', C.generateText.v1({ sampling: slot.sampling() })),
	)

function capturing() {
	const seen: { sampling?: any } = {}
	return {
		seen,
		bindings: bindings({
			'core:provider/generate-text@1': async (i: any, ctx: any) => {
				seen.sampling = i.sampling
				ctx.reportSampling({}, [])
				return ok({ main: 'x', text: 'x' })
			},
		}),
	}
}

describe('an unpicked sampling slot falls back to the instance default', () => {
	test("the default's values arrive when nothing was picked", async () => {
		const { seen, bindings: b } = capturing()
		await run(doc(), { input: {}, bindings: b, world: withDefaultSampling })
		assert.equal((seen.sampling as any)?.temperature, 0.2)
	})

	test('a pick still wins over the default', async () => {
		const { seen, bindings: b } = capturing()
		await run(doc(), {
			input: {},
			bindings: b,
			world: {
				...withDefaultSampling,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'sampling',
						path: SLOT_VALUE,
						value: 'cfg_creative',
						scopeKind: 'instance' as const,
					},
				],
			},
		})
		assert.equal((seen.sampling as any)?.temperature, 0.92)
	})

	test('a host that publishes no default behaves exactly as before', async () => {
		const { seen, bindings: b } = capturing()
		await run(doc(), { input: {}, bindings: b, world })
		assert.deepEqual(seen.sampling, {})
	})

	test('a Task with no modality gets no default — there is nothing to look one up by', async () => {
		// `core:task/context-budget@1` names its own `sampling` slot and is a
		// Task, so it declares no shape. Handing it the text default would be
		// guessing, and it is the node whose whole output is a token budget.
		const seen: { sampling?: any } = {}
		const budgetDoc = publish(
			makeSpec('demo:sampling-fallback-task@1', { version: '1.0.0' })
				.input('input', C.userMessage.v1())
				.task('budget', C.contextBudget.v1({ sampling: slot.sampling() })),
		)
		await run(budgetDoc, {
			input: {},
			bindings: bindings({
				'core:task/context-budget@1': async (i: any) => {
					seen.sampling = i.sampling
					return ok({ main: {}, available: {} })
				},
			}),
			world: withDefaultSampling,
		})
		assert.deepEqual(seen.sampling, {})
	})
})
