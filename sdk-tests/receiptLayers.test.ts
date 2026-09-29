/**
 * F2 findings 1 and 2 (2026-09-26): a receipt says WHICH LAYER answered each
 * config value and WHETHER the definition that ran was the pin or a swap; and
 * the selected-config scope is spelled `config`, not `preset` (R1 — `preset`
 * is the session preset's word, and the spec's `.preset()`).
 *
 * The resolver always knew the layer (`ResolvedSource.scopeKind`); the
 * executor called the value-only `resolveConfig` and dropped it, so *"I
 * changed this and nothing happened"* could not be answered from the run.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	run,
	ok,
	slot,
	spec as makeSpec,
	resolveConfigSources,
	scopeKindOf,
	mayWrite,
	SCOPE_ORDER,
	type OverrideRow,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

const doc = () =>
	publish(
		makeSpec('demo:receipt-layers', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
	)

const b = () =>
	bindings({
		'core:oracle/generate-text@1': async (_i: any, ctx: any) => {
			ctx.reportSampling({}, [])
			return ok({ main: 'x', text: 'x' })
		},
	})

/** One value per layer, each at its own address, plus a path two layers hold. */
const overrides: OverrideRow[] = [
	{ nodeKey: 'generate', slot: 'prompts', path: 'system', value: 'mine', scopeKind: 'session', scopeId: 7 },
	{ nodeKey: 'generate', slot: 'prompts', path: 'system', value: 'theirs', scopeKind: 'config' },
	{ nodeKey: 'generate', slot: 'sampling', path: 'temperature', value: 0.7, scopeKind: 'config' },
	{ nodeKey: 'generate', slot: 'sampling', path: 'top_p', value: 0.9, scopeKind: 'defaults' },
]
const authorDefaults = { generate: { params: { maxTokens: 256 } } }

const nodeOf = (receipt: any, key: string) => receipt.nodes.find((n: any) => n.nodeKey === key)

describe('a receipt row records the layer each config value won at', () => {
	test('session override, selected config, instance defaults and node default each say so', async () => {
		const receipt = await run(doc(), {
			input: {},
			bindings: b(),
			world: { ...world, overrides, authorDefaults },
		})
		const layers = nodeOf(receipt, 'generate').configLayers
		assert.equal(layers.prompts.system, 'session', 'the session override beat the config')
		assert.equal(layers.sampling.temperature, 'config', 'the selected config')
		assert.equal(layers.sampling.top_p, 'defaults', 'instance defaults')
		assert.equal(layers.params.maxTokens, 'author', "the node definition's default")
	})

	test('it is exactly what resolveConfigSources says, not a second walk', async () => {
		const w = { ...world, overrides, authorDefaults }
		const receipt = await run(doc(), { input: {}, bindings: b(), world: w })
		const sources = resolveConfigSources(w, ['generate'])['generate']!
		for (const [slotName, paths] of Object.entries(sources))
			for (const [path, r] of Object.entries(paths))
				assert.equal(nodeOf(receipt, 'generate').configLayers[slotName][path], r.scopeKind)
	})

	test('a node with nothing resolved carries no configLayers', async () => {
		const receipt = await run(doc(), {
			input: {},
			bindings: b(),
			world: { ...world, overrides: [] },
		})
		assert.equal('configLayers' in nodeOf(receipt, 'input'), false)
	})
})

describe('a receipt row says whether the pin or a swap ran', () => {
	test('the pin: swap is null on every row when the host passes swaps', async () => {
		const receipt = await run(doc(), { input: {}, bindings: b(), world, swaps: {} })
		assert.equal(nodeOf(receipt, 'input').swap, null)
		assert.equal(nodeOf(receipt, 'generate').swap, null)
	})

	test('a session swap names the pin it replaced and who seated it', async () => {
		const receipt = await run(doc(), {
			input: {},
			bindings: b(),
			world,
			swaps: { generate: { pin: 'demo:oracle/the-pin@1', by: 'session' } },
		})
		const row = nodeOf(receipt, 'generate')
		assert.deepEqual(row.swap, { pin: 'demo:oracle/the-pin@1', by: 'session' })
		assert.equal(row.definitionId, 'core:oracle/generate-text@1', 'definitionId is what RAN')
		assert.equal(nodeOf(receipt, 'input').swap, null, 'the other node ran its pin')
	})

	test('a host that says nothing about swaps leaves the field off — never a guessed "pin"', async () => {
		const receipt = await run(doc(), { input: {}, bindings: b(), world })
		assert.equal('swap' in nodeOf(receipt, 'generate'), false)
	})
})

describe('the host stamps how the run was reached (Receipt.meta)', () => {
	test('meta.preset is recorded verbatim; no meta, no key', async () => {
		const preset = {
			via: 'fallback' as const,
			presetId: 3,
			preset: 'Cozy',
			event: 'core:event/reply',
			bound: 'gone:spec',
			reason: 'the spec is not published',
		}
		const withMeta = await run(doc(), { input: {}, bindings: b(), world, meta: { preset } })
		assert.deepEqual(withMeta.meta, { preset })
		const without = await run(doc(), { input: {}, bindings: b(), world })
		assert.equal('meta' in without, false)
	})
})

describe("the selected config's scope is `config` (R1)", () => {
	test('the chain and the matrix speak `config`', () => {
		assert.deepEqual(SCOPE_ORDER, ['session', 'config', 'defaults', 'author'])
		assert.equal(mayWrite('prompts', 'config'), true)
		assert.equal(mayWrite('template', 'config'), true)
	})

	test('scopeKindOf reads only a ScopeKind', () => {
		for (const k of SCOPE_ORDER) assert.equal(scopeKindOf(k), k)
		assert.equal(scopeKindOf('preset'), undefined)
		assert.equal(scopeKindOf('instance'), undefined)
		assert.equal(scopeKindOf('user'), undefined)
	})
})
