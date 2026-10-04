/**
 * The step label and the step purpose (config grouping, owner rulings
 * 2026-09-30, Q5).
 *
 * The settings group a spec's configurables by model call, derived from the
 * graph; the heading of each group is the model-call step's own `label`, else
 * its step status, else its definition's name. `purpose` is the sentence under
 * that heading. Both are optional display text on the node as placed
 * (`expose`), hashed with the document like `status` — so only a spec that
 * sets one moves.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { compile, contentHash, slot, spec, validate, type SpecDocument } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

type Expose = { label?: unknown; purpose?: unknown; status?: unknown }

/** A two-step reply: a context build (no model) and the model call. */
const reply = (assembleExpose?: Expose, generateExpose?: Expose) =>
	spec('test:spec/labelled', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
		.task('prompt', ($) => C.assemble.v2({ messages: $.history.messages }), assembleExpose ? { expose: assembleExpose as never } : undefined)
		.oracle(
			'generate',
			($) => C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
			generateExpose ? { expose: generateExpose as never } : undefined,
		)
		.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))
		.build()

const exposeOf = (doc: SpecDocument, key: string) => doc.nodes.find((n) => n.key === key)!.expose

/** A copy of `doc` with `key`'s expose replaced. */
const marked = (doc: SpecDocument, key: string, expose: Expose): SpecDocument => ({
	...doc,
	nodes: doc.nodes.map((n) => (n.key === key ? { ...n, expose: expose as never } : n)),
})

describe('step label and step purpose', () => {
	test('land on the node in the document, beside the step status, only when stated', () => {
		const doc = compile(reply(undefined, { label: 'Narrator', purpose: 'Writes the scene.', status: 'Narrating' }))
		assert.deepEqual(exposeOf(doc, 'generate'), { status: 'Narrating', label: 'Narrator', purpose: 'Writes the scene.' })
		assert.equal(exposeOf(doc, 'prompt'), undefined)
	})

	test('any step may carry a label', () => {
		const doc = compile(reply({ label: 'Build the prompt' }))
		assert.deepEqual(exposeOf(doc, 'prompt'), { label: 'Build the prompt' })
	})

	test('move the document hash only when set', () => {
		const plain = contentHash(compile(reply()))
		assert.equal(contentHash(compile(reply())), plain)
		assert.notEqual(contentHash(compile(reply(undefined, { label: 'Narrator' }))), plain)
		assert.notEqual(contentHash(compile(reply(undefined, { purpose: 'Writes the scene.' }))), plain)
	})

	test('a purpose on a step that calls no model is refused at construction, with the fix', () => {
		assert.throws(
			() => reply({ purpose: 'Builds the prompt.' }),
			/node 'prompt': expose\.purpose says what a model call is for, but core:task\/assemble@2 calls no model — put the purpose on the oracle that does, or give this step a label instead/,
		)
	})

	test('an empty label is refused at construction (R-20)', () => {
		assert.throws(() => reply(undefined, { label: '' }), /expose\.label/)
	})

	test('validate() refuses the same misplaced purpose in a stored document', () => {
		const doc = marked(compile(reply()), 'prompt', { purpose: 'Builds the prompt.' })
		const found = validate(doc).filter((f) => f.law === 'step purpose')
		assert.equal(found.length, 1)
		assert.equal(found[0]!.nodeKey, 'prompt')
		assert.equal(found[0]!.severity, 'error')
		assert.match(found[0]!.fix ?? '', /oracle whose model this step feeds/)
	})

	test('validate() refuses a label that is not display text (R-20)', () => {
		const doc = marked(compile(reply()), 'generate', { label: { fr: 'Narrateur' } })
		const found = validate(doc).filter((f) => f.law === 'R-20' && f.nodeKey === 'generate')
		assert.equal(found.length, 1)
		assert.match(found[0]!.message, /expose\.label/)
	})
})
