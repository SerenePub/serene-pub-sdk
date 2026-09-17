/**
 * A resolved `sampling` slot carries the ROW it came from, not only its values.
 *
 * ⚠ It did not, and the gap was invisible from inside the SDK. `resolveSlot`
 * returns two different KINDS of thing for the two ref slots: `connection`
 * resolves to a reference (`{ id, kind, metadata }`) and `sampling` resolves to
 * the config's VALUES with the id deliberately stripped, because the nodes that
 * read a sampling slot need the numbers — `core:task/context-budget@1` derives a
 * token budget from `contextTokens`, and the summarize batch cutter fits a
 * transcript into that same window.
 *
 * A host does not send values. It sends a request built from a `sampling_configs`
 * ROW, so what it needs from this slot is a row id — and it read one off the
 * connection slot's `{ id }` and found nothing on sampling's. Nothing is
 * indistinguishable from "this node picked nothing", so the request fell through
 * to the capability default while the budget moved with the pick. The prompt was
 * sized against one window and sent against another.
 *
 * `samplingFallback.test.ts` asserts the VALUES are right at the binding, which
 * is one layer short of where they were lost. This asserts the reference is
 * there beside them, and — just as load-bearing — that carrying it changed
 * nothing a value reader can see.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { run, ok, slot, spec as makeSpec, SLOT_VALUE, SLOT_REF, slotRef } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

/** `cfg_precise` is the instance default; `cfg_creative` is never the default. */
const withDefaultSampling = {
	...world,
	activeSampling: { 'core:shape/text-gen@1': 'cfg_precise' },
}

const doc = () =>
	publish(
		makeSpec('demo:sampling-ref@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('generate', C.generateText.v1({ sampling: slot.sampling() })),
	)

/** A pick, in the one address the panel actually writes. */
const pickOf = (value: string) => [
	{
		nodeKey: 'generate',
		slot: 'sampling',
		path: SLOT_VALUE,
		value,
		scopeKind: 'preset' as const,
	},
]

function capturing() {
	const seen: { sampling?: any } = {}
	return {
		seen,
		bindings: bindings({
			'core:oracle/generate-text@1': async (i: any, ctx: any) => {
				seen.sampling = i.sampling
				ctx.reportSampling({}, [])
				return ok({ main: 'x', text: 'x' })
			},
		}),
	}
}

const resolvedWith = async (w: any) => {
	const { seen, bindings: b } = capturing()
	await run(doc(), { input: {}, bindings: b, world: w })
	return seen.sampling
}

describe('a resolved sampling slot carries the row its values came from', () => {
	test("the pick's row id arrives beside the pick's values", async () => {
		// The whole defect in one assertion: both halves, from one resolution.
		// Either alone passed before — the values were right and the id was
		// absent, which is why nothing caught it.
		const sampling = await resolvedWith({
			...withDefaultSampling,
			overrides: pickOf('cfg_creative'),
		})
		assert.equal(sampling.temperature, 0.92)
		assert.equal(slotRef(sampling), 'cfg_creative')
	})

	test('no pick carries no reference, so the host keeps falling through', async () => {
		// The fallback resolves the INSTANCE DEFAULT's values, and the host reads
		// that same default for itself one tier down. Carrying it here would
		// relabel which tier answered while changing no value — a lie with no
		// upside, and it would make "the pipeline chose nothing" unsayable.
		const sampling = await resolvedWith(withDefaultSampling)
		assert.equal(sampling.temperature, 0.2)
		assert.equal(slotRef(sampling), null)
	})

	test('a pick naming a row this world does not carry carries no reference', async () => {
		// The id and the values must describe the SAME row or they are the
		// divergence this mechanism exists to end, pointed the other way: no
		// values resolved, so handing the host an id would send the request
		// against a window the budget above never saw.
		const sampling = await resolvedWith({
			...withDefaultSampling,
			overrides: pickOf('cfg_deleted'),
		})
		assert.deepEqual(sampling, {})
		assert.equal(slotRef(sampling), null)
	})

	test('the reference names the row the VALUES came from, never the request', async () => {
		// Mutation guard on the pairing itself. `cfg_switched` resolves through
		// the switchboard — `topK` is remembered but off — so its values are
		// distinctive; the id must be its id and not the default's.
		const sampling = await resolvedWith({
			...withDefaultSampling,
			overrides: pickOf('cfg_switched'),
		})
		assert.equal(sampling.temperature, 0.4)
		assert.equal(sampling.topK, undefined, 'the switchboard still applies')
		assert.equal(slotRef(sampling), 'cfg_switched')
	})
})

describe('carrying it is invisible to every reader of the values', () => {
	test('the keys a node sees are exactly the values, with nothing added', async () => {
		// `core:task/context-budget@1` and `core:task/batch-messages@1` read these
		// values directly and are correct today. A new ordinary key would show up
		// here, in `JSON.stringify`, and in the digest a plugin node's RNG label
		// is derived from — which is why the reference is a symbol.
		const sampling = await resolvedWith({
			...withDefaultSampling,
			overrides: pickOf('cfg_creative'),
		})
		assert.deepEqual(Object.keys(sampling).sort(), [
			'mirostat_tau',
			'temperature',
			'top_p',
		])
		assert.deepEqual(JSON.parse(JSON.stringify(sampling)), {
			temperature: 0.92,
			top_p: 0.95,
			mirostat_tau: 5,
		})
		for (const k in sampling)
			assert.notEqual(k, 'ref', 'a for-in reader must see no reference key')
	})

	test('spreading the object keeps the reference, because bindings forward by value', async () => {
		// A binding that writes `{ ...input.sampling }` on its way to `ctx.call`
		// must not drop it. Object spread copies own ENUMERABLE symbol
		// properties, so this is a property of how it is attached, not an
		// accident — assert it rather than trust it.
		const sampling = await resolvedWith({
			...withDefaultSampling,
			overrides: pickOf('cfg_creative'),
		})
		assert.equal(slotRef({ ...sampling }), 'cfg_creative')
	})

	test('the key is registry-global, so two copies of this module still agree', async () => {
		// `Symbol()` would differ between a `dist` build and a source import and
		// the reference would vanish again, silently — the exact failure this
		// mechanism exists to end. `Symbol.for` cannot.
		assert.equal(SLOT_REF, Symbol.for('@serene-pub/sdk:slot-ref'))
	})
})

describe('slotRef reads a reference and refuses everything else', () => {
	test('nothing carrying one reads as null, never as a guess', () => {
		for (const v of [null, undefined, 0, '', 'cfg_creative', {}, [], { id: 3 }])
			assert.equal(slotRef(v), null)
	})

	test('a non-id value under the key is refused rather than forwarded', () => {
		// The host turns whatever comes back into a row id. An object or a
		// boolean arriving there would be reduced to something meaningless
		// instead of read as "nothing was picked".
		assert.equal(slotRef({ [SLOT_REF]: { id: 3 } }), null)
		assert.equal(slotRef({ [SLOT_REF]: true }), null)
		assert.equal(slotRef({ [SLOT_REF]: 7 }), 7)
		assert.equal(slotRef({ [SLOT_REF]: '7' }), '7')
	})
})
