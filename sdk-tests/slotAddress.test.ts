/**
 * The address a ref slot's value lives at, and the type its id has.
 *
 * Two independent breaks made a connection picked in the config panel invisible
 * to the executor, and the second one hid the first:
 *
 *  1. **The address.** The panel wrote `path: ''`; this file's executor read
 *     `'$ref'`. Resolution is exact-match on `(nodeKey, slot, path)`, so those
 *     were unrelated addresses — no collision, no warning, no value.
 *  2. **The id type.** The panel commits a JSON *number*; a host projects
 *     connection ids as *strings*; the lookup used `===`. Always false.
 *
 * Break 2 is why break 1 could not be found by trying. When the lookup fails,
 * `resolveSlot` falls back to `activeConnection` — the instance default — which
 * on a real install is usually the very connection that was picked. Everything
 * looks right.
 *
 * So every test here points `activeConnection` at a DIFFERENT connection than the
 * one it picks, and asserts the picked one arrives. A fixture with one connection,
 * or with the default equal to the pick, would pass against both bugs.
 *
 * The suite's own use-case tests could not catch this: they write and read
 * through `resolveConfig` symmetrically, which passes at whatever address both
 * sides happen to agree on — they were green throughout, asserting a convention
 * no producer implemented.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { run, ok, slot, spec as makeSpec, SLOT_VALUE } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

/** A world with two connections, the default pointed at the one we do NOT pick. */
const twoConnections = {
	...world,
	connections: [
		...world.connections,
		{
			id: 'picked-one',
			name: 'The one that was picked',
			kind: 'core:shape/text-gen@1',
			metadata: { model: 'picked-model' },
			material: {},
		},
	],
	// `ollama-local` is the fixture's default; `picked-one` is never the default.
	activeConnection: { ...world.activeConnection },
}

const spec = () => makeSpec('demo:slot-address@1', { version: '1.0.0' })

const doc = () =>
	publish(
		spec()
			.input('input', C.userMessage.v1())
			.provider('generate', C.generateText.v1({ connection: slot.connection() })),
	)

/** Capture what the provider binding was handed as its connection. */
function capturing() {
	const seen: { connection?: any } = {}
	return {
		seen,
		bindings: bindings({
			'core:provider/generate-text@1': async (i: any, ctx: any) => {
				seen.connection = i.connection
				ctx.reportSampling({}, [])
				return ok({ main: 'x', text: 'x' })
			},
		}),
	}
}

describe('a ref slot resolves at one address, by value not identity', () => {
	test('a pick stored at SLOT_VALUE reaches the provider', async () => {
		const { seen, bindings: b } = capturing()
		await run(doc(), {
			input: {},
			bindings: b,
			world: {
				...twoConnections,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'connection',
						path: SLOT_VALUE,
						value: 'picked-one',
						scopeKind: 'instance',
					},
				],
			},
		})
		assert.equal(seen.connection?.id, 'picked-one')
	})

	test('a NUMERIC pick still matches a string id — the break that hid the other', async () => {
		// This is precisely what the panel commits: `set(option, Number(raw))`.
		// A host projecting `id: String(row.id)` then never matched it.
		const numericWorld = {
			...world,
			connections: [
				{
					id: '11',
					name: 'The instance default',
					kind: 'core:shape/text-gen@1',
					metadata: {},
					material: {},
				},
				{
					id: '22',
					name: 'The one that was picked',
					kind: 'core:shape/text-gen@1',
					metadata: {},
					material: {},
				},
			],
			activeConnection: { 'core:shape/text-gen@1': '11' },
		}
		const { seen, bindings: b } = capturing()
		await run(doc(), {
			input: {},
			bindings: b,
			world: {
				...numericWorld,
				overrides: [
					{
						nodeKey: 'generate',
						slot: 'connection',
						path: SLOT_VALUE,
						value: 22, // a NUMBER, as the panel writes it
						scopeKind: 'instance',
					},
				],
			},
		})
		assert.equal(seen.connection?.id, '22', 'the picked connection, not the default')
		assert.notEqual(seen.connection?.id, '11')
	})

	test('the legacy addresses are still read, so no stored row is stranded', async () => {
		// `'ref'` was written by the app's own legacy projection and `'$ref'` was
		// what this executor read. Both are folded to SLOT_VALUE at the single
		// resolution chokepoint, loudly, rather than silently resolving to nothing.
		for (const legacy of ['ref', '$ref']) {
			const { seen, bindings: b } = capturing()
			await run(doc(), {
				input: {},
				bindings: b,
				world: {
					...twoConnections,
					overrides: [
						{
							nodeKey: 'generate',
							slot: 'connection',
							path: legacy,
							value: 'picked-one',
							scopeKind: 'instance',
						},
					],
				},
			})
			assert.equal(seen.connection?.id, 'picked-one', `legacy path '${legacy}'`)
		}
	})

	test('with no pick at all it still falls back to the instance default', async () => {
		// The fallback is correct behaviour — the bug was that it was the ONLY
		// behaviour, which is exactly why it disguised the failure.
		const { seen, bindings: b } = capturing()
		await run(doc(), {
			input: {},
			bindings: b,
			world: { ...twoConnections, overrides: [] },
		})
		assert.equal(seen.connection?.id, 'ollama-local')
	})

	test('a sampling pick resolves at the same address', async () => {
		const seenSampling: { values?: any } = {}
		const b = bindings({
			'core:provider/generate-text@1': async (i: any, ctx: any) => {
				seenSampling.values = i.sampling
				ctx.reportSampling({}, [])
				return ok({ main: 'x', text: 'x' })
			},
		})
		await run(
			publish(
				spec()
					.input('input', C.userMessage.v1())
					.provider(
						'generate',
						C.generateText.v1({
							connection: slot.connection(),
							sampling: slot.sampling(),
						}),
					),
			),
			{
				input: {},
				bindings: b,
				world: {
					...twoConnections,
					overrides: [
						{
							nodeKey: 'generate',
							slot: 'sampling',
							path: SLOT_VALUE,
							value: 'cfg_precise',
							scopeKind: 'instance',
						},
					],
				},
			},
		)
		// `cfg_precise` is temperature 0.2; the creative preset is 0.92.
		assert.equal(seenSampling.values?.temperature, 0.2)
	})
})
