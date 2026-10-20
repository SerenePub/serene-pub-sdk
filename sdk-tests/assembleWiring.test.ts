/**
 * Law `assemble wiring`: an `assemble@2` that builds the prompt a model call
 * sends wires its `template` slot and the connection it writes for.
 *
 * Unwired, both pass every fixture host and fail on a real instance: the run
 * halts with "assemble has no template", and once the template is wired a
 * chat wire-mode connection is handed a prompt with no messages. The F3 docs
 * gate found both only by reading core's compiled specs (stalls 12 and 14),
 * so `validate()` refuses them where the author is, naming the helper.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { compile, sessionEvents, slot, spec, use, validate } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_SPECS } from '@serene-pub/core-catalog'

const LAW = 'assemble wiring'

const reply = (prompt: Record<string, unknown>) =>
	spec('acme.greeter:reply', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), {
			genre: use('core:genre/story'),
			event: sessionEvents.messageRespond,
		})
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
		.task('prompt', () => C.assemble.v2(prompt as never))
		.oracle('generate', ($) =>
			C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
		)
		.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

const findings = (b: { build(): any }) => validate(compile(b.build())).filter((f) => f.law === LAW)

describe('law · assemble wiring', () => {
	test('an assemble feeding a model call with neither wired is refused twice, each fix naming its helper', () => {
		const f = findings(reply({}))
		assert.equal(f.length, 2)
		assert.ok(f.every((x) => x.severity === 'warning' && x.nodeKey === 'prompt'))
		assert.match(f[0]!.fix, /template: slot\.template\(\)/)
		assert.match(f[0]!.message, /assemble has no template/)
		assert.match(f[1]!.fix, /connection: slot\.connectionOf\('generate'\)/)
	})

	test('wiring one leaves the other refused', () => {
		const onlyTemplate = findings(reply({ template: slot.template() }))
		assert.deepEqual(
			onlyTemplate.map((x) => x.fix.includes("slot.connectionOf('generate')")),
			[true],
		)
		const onlyConnection = findings(reply({ connection: slot.connectionOf('generate') }))
		assert.deepEqual(
			onlyConnection.map((x) => x.fix.includes('slot.template()')),
			[true],
		)
	})

	test('wired as core wires it, the spec is clean', () => {
		assert.deepEqual(
			findings(reply({ template: slot.template(), connection: slot.connectionOf('generate') })),
			[],
		)
	})

	test('an assemble that feeds no model call is not judged', () => {
		const b = spec('acme.greeter:draft', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.task('prompt', ($) => C.assemble.v2({ messages: $.history.messages }))
		assert.deepEqual(findings(b), [])
	})

	test('no spec core ships trips it', () => {
		const hits = CORE_SPECS.flatMap((s) =>
			validate(compile(s.build()))
				.filter((f) => f.law === LAW)
				.map((f) => `${s.slug} ${f.nodeKey}: ${f.message}`),
		)
		assert.deepEqual(hits, [])
	})
})
