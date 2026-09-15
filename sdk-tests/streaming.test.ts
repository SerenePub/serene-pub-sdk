/**
 * `streaming` on the provider nodes: the author's per-node answer to whether a
 * request is sent as a stream.
 *
 * Two values, not three. `auto` is the CONNECTION's answer — every adapter
 * already has one, and the defaults differ per service — so the enum cannot
 * carry an `on`: an author who turned streaming on for a connection whose
 * adapter has no streaming branch would be asking for something the wire
 * cannot give, and the node would have no way to say so. `off` is the one
 * override that is always deliverable, because every adapter has a
 * single-request branch.
 *
 * The default is `auto` on all four, so a pipeline nobody has touched sends
 * exactly what it sent before the parameter existed.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import * as C from '@serene-pub/contracts'

/** The four nodes that dispatch to a backend and can therefore stream. */
const PROVIDERS = [
	['generate-text', C.generateText],
	['generate-with-tools', C.generateWithTools],
	['generate-json', C.generateJson],
	['generate-image', C.generateImage],
] as const

describe('every provider node declares how it wants to be sent', () => {
	for (const [name, pin] of PROVIDERS) {
		test(`${name} carries \`streaming\` on its params slot`, () => {
			const decl = (pin.descriptor.slots as any)?.params?.schema?.streaming
			assert.ok(decl, `${name} declares no \`streaming\` parameter`)
			assert.equal(decl.type, 'enum')
			assert.deepEqual([...decl.of], ['auto', 'off'])
			// `auto` and nothing else: a default of `off` would silently stop
			// every existing pipeline streaming, and an absent default leaves
			// the resolution to whoever reads it last.
			assert.equal(decl.default, 'auto')
			assert.ok(
				typeof decl.description === 'string' && decl.description.length > 20,
				`${name}'s \`streaming\` has no sentence a person can read`,
			)
		})
	}

	test('the image node gained a params slot to hold it', () => {
		// It had none at all, so this is the slot as well as the parameter —
		// and a slot with no `facet` renders under the node's own settings,
		// which is where a send-shape decision belongs.
		const slot = (C.generateImage.descriptor.slots as any)?.params
		assert.equal(slot.kind, 'parameters')
		assert.deepEqual(Object.keys(slot.schema), ['streaming'])
	})

	test('the three text nodes keep `stopSequences` beside it', () => {
		// The parameter is added to a published pin, so the slot's existing
		// contents are part of what must not move.
		for (const pin of [C.generateText, C.generateWithTools, C.generateJson])
			assert.equal((pin.descriptor.slots as any).params.schema.stopSequences.type, 'string[]')
	})
})
