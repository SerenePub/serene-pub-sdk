/**
 * Law `assemble wiring`: an `assemble@2` that builds the prompt a model call
 * sends wires its `template` slot and the connection it writes for.
 *
 * Two halves. The builder supplies both when a spec leaves them out
 * (`template: slot.template()`, `connection: slot.connectionOf(<model call>)`),
 * so a built spec compiles to the same document as one wired by hand. And
 * `validate()` still warns on a document that did not come through the
 * builder, naming the helper: unwired, both pass every fixture host and fail
 * on a real instance ("assemble has no template", or a chat wire-mode
 * connection handed a prompt with no messages; F3 docs gate, stalls 12 and 14).
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	canonicalHash,
	canonicalize,
	compile,
	sessionEvents,
	slot,
	spec,
	use,
	validate,
} from '@serene-pub/sdk'
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

const WIRED = { template: slot.template(), connection: slot.connectionOf('generate') }

/** A document nobody built through the builder: compiled fully wired, then the keys deleted. */
const handWritten = (drop: Array<'template' | 'connection'>) => {
	const doc = JSON.parse(JSON.stringify(compile(reply(WIRED).build())))
	const prompt = doc.nodes.find((n: { key: string }) => n.key === 'prompt')
	for (const k of drop) {
		delete prompt.config[k]
		if (k === 'connection') delete prompt.resolvedRefs?.connection
	}
	return doc
}

const findings = (doc: any) => validate(doc).filter((f) => f.law === LAW)

describe('law · assemble wiring', () => {
	test('a hand-written assemble feeding a model call with neither wired is refused twice, each fix naming its helper', () => {
		const f = findings(handWritten(['template', 'connection']))
		assert.equal(f.length, 2)
		assert.ok(f.every((x) => x.severity === 'warning' && x.nodeKey === 'prompt'))
		assert.match(f[0]!.fix, /template: slot\.template\(\)/)
		assert.match(f[0]!.message, /assemble has no template/)
		assert.match(f[1]!.fix, /connection: slot\.connectionOf\('generate'\)/)
	})

	test('wiring one leaves the other refused', () => {
		const onlyTemplate = findings(handWritten(['connection']))
		assert.deepEqual(
			onlyTemplate.map((x) => x.fix.includes("slot.connectionOf('generate')")),
			[true],
		)
		const onlyConnection = findings(handWritten(['template']))
		assert.deepEqual(
			onlyConnection.map((x) => x.fix.includes('slot.template()')),
			[true],
		)
	})

	test('wired as core wires it, the document is clean', () => {
		assert.deepEqual(findings(handWritten([])), [])
	})

	test('an assemble that feeds no model call is not judged', () => {
		const b = spec('acme.greeter:draft', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.task('prompt', ($) => C.assemble.v2({ messages: $.history.messages }))
		assert.deepEqual(findings(compile(b.build())), [])
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

describe('the builder wires a prompt step', () => {
	const hash = (b: { build(): any }) => canonicalHash(compile(b.build()))
	const canon = (b: { build(): any }) => canonicalize(compile(b.build()) as never)
	const wired = reply(WIRED)

	test('leaving out both keys compiles to the document wired by hand', () => {
		assert.equal(canon(reply({})), canon(wired))
		assert.equal(hash(reply({})), hash(wired))
	})

	test('leaving out only one key compiles to the document wired by hand', () => {
		for (const part of [
			{ template: slot.template() },
			{ connection: slot.connectionOf('generate') },
		]) {
			assert.equal(canon(reply(part)), canon(wired))
			assert.equal(hash(reply(part)), hash(wired))
		}
	})

	test('a spec built with neither key has no assemble wiring finding', () => {
		assert.deepEqual(findings(compile(reply({}).build())), [])
	})

	test('a key the spec states is kept as written', () => {
		const built = reply({ connection: slot.connectionOf('other') }).build()
		const prompt = built.nodes.find((n) => n.key === 'prompt')!
		assert.deepEqual(prompt.config.connection, slot.connectionOf('other'))
		assert.deepEqual(prompt.config.template, slot.template())
	})

	test('build() called twice yields the same canonical document', () => {
		const b = reply({})
		const first = canonicalize(compile(b.build()) as never)
		assert.equal(canonicalize(compile(b.build()) as never), first)
	})

	test('an assemble that feeds no model call gains no template or connection key', () => {
		const built = spec('acme.greeter:draft', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.task('prompt', ($) => C.assemble.v2({ messages: $.history.messages }))
			.build()
		const prompt = built.nodes.find((n) => n.key === 'prompt')!
		assert.equal('template' in prompt.config, false)
		assert.equal('connection' in prompt.config, false)
	})
})
