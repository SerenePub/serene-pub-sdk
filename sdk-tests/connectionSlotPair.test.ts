/**
 * A connection slot names a PAIR, and both halves have to survive resolution.
 *
 * `slotAddress.test.ts` next door pins where the value lives and that its id is
 * compared by value. This file pins what the value *is*: since the endpoint and
 * the model became separate rows, a pick is `{ref, modelId}` — and the executor
 * was reading the whole object as though it were an id. `sameId` stringified it
 * to `[object Object]`, matched no connection, and `??` handed the miss to
 * `world.activeConnection` — so the pick was silently replaced by the instance
 * default. Every disguise `slotAddress.test.ts` describes applied again, one
 * layer up.
 *
 * Three facts are pinned here, and each of them failed differently:
 *
 *  1. **The endpoint half is read out of the pair.** Otherwise the request goes
 *     to a different server than the one on screen.
 *  2. **The model half is carried on the descriptor.** A host that only gets
 *     `{id, kind, metadata}` has nothing to read, so `modelId` at the host is
 *     `null` forever and the chosen model reaches no request — the endpoint is
 *     right, the answer comes from something else, and nothing says so.
 *  3. **An unresolvable pick resolves to NOTHING.** Falling back to the instance
 *     default when a slot named an endpoint this world does not have is how "you
 *     picked a connection that is gone" becomes "your reply came from somewhere
 *     else", with no error either way. Null is unconfigured, and unconfigured is
 *     something a host can say out loud.
 *
 * So, like its neighbour, every test here points the default at a connection it
 * never picks. A fixture whose default equalled the pick would pass against the
 * bug.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { run, ok, slot, spec as makeSpec, SLOT_VALUE } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

/** Two connections, with the instance default on the one we never pick. */
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

const spec = () => makeSpec('demo:connection-pair@1', { version: '1.0.0' })

const doc = () =>
	publish(
		spec()
			.inlet('input', C.userMessage.v1())
			.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
	)

/** Capture what the provider binding was handed as its connection. */
function capturing() {
	const seen: { connection?: any } = {}
	return {
		seen,
		bindings: bindings({
			'core:oracle/generate-text@1': async (i: any, ctx: any) => {
				seen.connection = i.connection
				ctx.reportSampling({}, [])
				return ok({ main: 'x', text: 'x' })
			},
		}),
	}
}

/** Run the one-provider doc with `value` stored at the connection slot. */
async function resolveWith(value: unknown) {
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
					value,
					scopeKind: 'config',
				},
			],
		},
	})
	return seen.connection
}

describe('a connection slot resolves both halves of the pair', () => {
	test('a {ref, modelId} pick resolves that endpoint AND carries the model', async () => {
		// Exactly what a picker commits once a model is chosen.
		const connection = await resolveWith({ ref: 'picked-one', modelId: 3 })

		assert.equal(connection?.id, 'picked-one', 'the picked endpoint, not the default')
		assert.notEqual(connection?.id, 'ollama-local')
		// The half that had nowhere to live: without it the host's own reader
		// returns null every time and the chosen model reaches no request.
		assert.equal(connection?.modelId, 3)
	})

	test('the {id, modelId} spelling resolves the same way', async () => {
		// `ref` and `id` have both been written by producers in this codebase's
		// history; neither may be the one that quietly stops working.
		const connection = await resolveWith({ id: 'picked-one', modelId: 9 })

		assert.equal(connection?.id, 'picked-one')
		assert.equal(connection?.modelId, 9)
	})

	test('a bare id resolves the endpoint with no model named', async () => {
		// Every value written before the split. `null` is ABSENCE — an endpoint
		// has no model it is presumed to mean, so what a host does with a
		// half-named pair is the host's own ruling to make, out loud.
		const connection = await resolveWith('picked-one')

		assert.equal(connection?.id, 'picked-one')
		assert.equal(connection?.modelId, null)
	})

	test('the instance default carries no model either', async () => {
		// Nothing picked, so `activeConnection` answers — and it is keyed by
		// shape and holds endpoint ids alone, so there is no model half here to
		// carry. Asserted rather than assumed: `undefined` would read as "this
		// SDK does not carry the key" to a host that checks for presence.
		const { seen, bindings: b } = capturing()
		await run(doc(), {
			input: {},
			bindings: b,
			world: { ...twoConnections, overrides: [] },
		})

		assert.equal(seen.connection?.id, 'ollama-local')
		assert.equal(seen.connection?.modelId, null)
	})
})

describe('a pick this world cannot resolve is unconfigured, never the default', () => {
	test('an unknown ref yields null', async () => {
		// The teeth of the whole file. `activeConnection['core:shape/text-gen@1']`
		// is `ollama-local` and would answer happily — which is the failure, not
		// the fix: a slot naming an endpoint that has been deleted must stop,
		// not quietly reroute to whatever the instance had set up.
		const connection = await resolveWith({ ref: 'no-such-endpoint', modelId: 3 })

		assert.equal(connection, null, 'unconfigured, not the instance default')
	})

	test('an unknown bare id yields null too', async () => {
		const connection = await resolveWith('no-such-endpoint')

		assert.equal(connection, null)
	})

	test('a pick naming a model and no endpoint yields null', async () => {
		// A model without its endpoint is not a partial selection, it is an
		// unresolvable one — and the object is present, so this must not be read
		// as "nothing was picked" and sent to the default.
		const connection = await resolveWith({ modelId: 3 })

		assert.equal(connection, null)
	})
})
