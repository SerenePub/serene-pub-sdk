/**
 * D-3 §4 — **the laws the showcase lanes hit, checked where an author will see
 * them.**
 *
 * Battleship and Twenty Questions each worked around a law rather than an
 * accident, and in every case the workaround was right. What was missing was a
 * refusal an author meets at publish instead of at the write — or, where the
 * refusal genuinely cannot be made at publish, a statement of *why* so the next
 * author does not go looking for a flag.
 *
 * Four laws, in the order the findings list them (plan §12 G8–G13, §14 D-3):
 *
 *  1. **The effects line at a block (F41).** `form` is the one venue a block
 *     reaches, so a `world` action declaring it is a block-carried world action
 *     and `validate()` refuses it. The residue — a block naming the function of
 *     a `composer`-venue world action — is invisible at publish and named here.
 *  2. **No pipeline triggers another.** There is no trigger outlet, no hook
 *     surface that carries one, and no way for a node to emit. The one path is
 *     the event a write causes.
 *  3. **One write-class outlet per pipeline (F7)** — and its consequence for a
 *     plugin: a run cannot post to two channels (G10).
 *  4. **No write inside a clause (01 §4).**
 *
 * 3 and 4 were believed present. They are, and this file is the confirmation
 * the brief asked for rather than a second implementation.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	LISTED_VENUE_KINDS,
	VENUE_KINDS,
	WORLD_ACTION_VENUES,
	allDefinitions,
	assertHookSurface,
	compile,
	effectsOf,
	sessionEvents,
	spec,
	validate,
	worldBlockFunctions,
	type MessageBlock,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '@serene-pub/core-catalog'

import { errorsFor } from './helpers.js'

const CHAT = chatGenre.id

const action = (over: Record<string, unknown> = {}) => ({
	key: 'grant',
	venue: { kind: 'composer' },
	label: { en: 'Grant' },
	description: { en: 'What the grant action does.' },
	...over,
})

const actionSpec = (id: string, actions: Array<Record<string, unknown>>) =>
	spec(id, { version: '1.0.0', contributes: { actions: actions as any } })
		.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: sessionEvents.sessionAction })
		.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))

// ── 1 · The effects line, at a block ───────────────────────────────────────

describe('F41 · a block may not carry a world action, and publish says so', () => {
	test("`form` is the only venue a block reaches — so a 'world' action declaring it is refused at publish", () => {
		// The venue exists for exactly one purpose: an action carried by a
		// `choices` or `form` block and pressed from that block alone. It is
		// listed nowhere else, which is what makes this refusal the publish-time
		// form of the host's `worldBlockFunctions`.
		assert.equal(VENUE_KINDS.includes('form'), true)
		assert.equal(LISTED_VENUE_KINDS.includes('form' as never), false)
		assert.equal(WORLD_ACTION_VENUES.includes('form'), false)

		// Refused where the author is, first: the builder never lets such a
		// declaration become a document.
		assert.throws(
			() => actionSpec('core:spec/grant-by-form', [action({ effects: 'world', venue: { kind: 'form' } })]),
			/a 'world' action may not appear in the 'form' venue/,
		)

		// And again in `validate()`, for a document from any other source — an
		// import, a hand-written JSON, a stored document that predates the rule.
		const doc = compile(actionSpec('core:spec/grant-by-form', [action({ venue: { kind: 'form' } })]).build())
		const patched = {
			...doc,
			contributes: {
				actions: [{ ...(doc.contributes as any).actions[0], effects: 'world' }],
			} as any,
		}
		const findings = validate(patched).filter((f) => f.law === 'F41' && f.severity === 'error')
		assert.equal(findings.length, 1)
		assert.match(findings[0]!.message, /may not appear in the 'form' venue/)
		assert.match(findings[0]!.message, /never where a character could be asked to answer it/)
		// `message` since 2026-09-28: a row's own ⋮ is the owner's (lair re-plan R11).
		assert.match(findings[0]!.fix, /composer, message, session-settings, admin, review/)
		// Labelled F41, never R-15 — the conformance kit's C20 keys on the label.
		assert.equal(validate(patched).filter((f) => f.law === 'R-15' && f.severity === 'error').length, 0)
	})

	test('the same declaration on the fiction side of the line publishes clean', () => {
		const doc = compile(
			actionSpec('core:spec/ask-by-form', [
				action({ key: 'answer', venue: { kind: 'form' } }),
			]).build(),
		)
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
		assert.equal(effectsOf({}), 'fiction')
	})

	/**
	 * The residue, stated rather than left to be discovered.
	 *
	 * A `world` action in the `composer` venue is legal — that is the venue the
	 * line puts it in — and a node is free to publish a `choices` block naming
	 * its *function*. `validate()` cannot see that: a block tree is a node's
	 * runtime **output**, and no spec document carries one. So the host refuses
	 * it at the write (`worldBlockFunctions`, the app's
	 * `pipelines/runtime/host.ts`), and a plugin author gets the same refusal
	 * before that by running the same exported function over the blocks their
	 * handler produced — which is what this test demonstrates.
	 */
	test('a block naming a composer-side world action is the host’s refusal, and an author can run it', () => {
		const doc = compile(
			actionSpec('core:spec/grant-by-composer', [action({ effects: 'world' })]).build(),
		)
		assert.deepEqual(validate(doc).filter((f) => f.severity === 'error'), [])
		const blocks: MessageBlock[] = [
			{
				kind: 'choices',
				question: 'Give them the keys?',
				actions: [{ fn: 'grant', label: 'Yes', choice: 'yes' }],
			} as MessageBlock,
		]
		assert.deepEqual(worldBlockFunctions(blocks, doc), ['grant'])
	})
})

// ── 2 · No pipeline triggers another ───────────────────────────────────────

describe('G8 · no pipeline can name another as a trigger', () => {
	test('no published definition is a trigger outlet — the registry is the evidence', () => {
		const triggers = allDefinitions().filter(
			(d) => d.kind === 'outlet' && /trigger|dispatch|invoke|run-(spec|pipeline)/i.test(d.id),
		)
		assert.deepEqual(triggers.map((d) => d.id), [])
	})

	test('no hook surface may carry one either (F10/F32)', () => {
		const found = assertHookSurface('event', { storage: {}, log: () => {}, trigger: () => {} })
		assert.equal(found.ok, false)
		assert.deepEqual((found as { found: string[] }).found, ['trigger'])
		assert.equal(assertHookSurface('event', { storage: {}, log: () => {} }).ok, true)
	})

	test('and a node cannot emit its way there: F8 refuses it, naming the one path', () => {
		const b = spec('demo:emitter@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('save', C.createMessage.v1({ text: 'x' }))
		const doc = compile(b.build())
		// Patched after the builder saw it — an import, a hand-written JSON.
		const patched = {
			...doc,
			nodes: doc.nodes.map((n) => (n.key === 'save' ? { ...n, config: { ...n.config, emits: 'go' } } : n)),
		}
		const f8 = validate(patched).filter((f) => f.law === 'F8')
		assert.equal(f8.length, 1)
		assert.match(f8[0]!.fix, /a write causes the event its outlet declares, and a package records its own declared event with record-event/)
	})
})

// ── 3 · One live row per run (F7, as restated by R44 / W1) ─────────────────

describe('F7 · one live row; other writes unlimited (W1)', () => {
	test('two reply rows are refused, and the fix names what to do instead', () => {
		const b = spec('demo:two-rows@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('speak', C.createMessage.v1({ text: '', generating: true }))
			.outlet('board', C.createMessage.v1({ text: '', generating: true }))
		const e = errorsFor(b, 'F7')
		assert.ok(e.some((x) => /at most one live row/.test(x.message)))
		assert.ok(e.some((x) => /update the first through its target|write anything else beside it/.test(x.fix)))
	})

	test('a second pipeline is no longer the only way to write twice — a reply and a lore write in one run are fine', () => {
		const b = spec('demo:reply-and-note@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('speak', C.createMessage.v1({ text: 'a' }))
			.outlet('note', C.setSessionAnnex.v1({ value: { seen: true } as never }))
		assert.deepEqual(errorsFor(b, 'F7'), [])
	})

	test('an update whose target is an earlier write is the same row, not a second', () => {
		const b = spec('demo:placeholder@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('placeholder', C.createMessage.v1({ text: '' }))
			.outlet('fill', ($: any) => C.updateMessage.v1({ target: $.placeholder.messageId, text: 'done' }))
		assert.deepEqual(errorsFor(b, 'F7'), [])
	})

	test('emit-class outlets are unlimited beside the one write', () => {
		const b = spec('demo:emits-many@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('save', C.createMessage.v1({ text: 'a' }))
			.outlet('hide', ($: any) => C.hideMessage.v1({ target: $.save.messageId }))
		assert.deepEqual(errorsFor(b, 'F7'), [])
	})
})

// ── 4 · Writes in clauses (01 §4, as restated by W1) ───────────────────────

describe('01 §4 · writes may sit in clauses; the live row may not repeat (W1)', () => {
	test('a write inside a gather clause is allowed — even the reply row, which is still one', () => {
		const b = spec('demo:gather-write@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.gather('reads', {}, (g) => g.chain('c', (c) => c.outlet('save', C.createMessage.v1({ text: 'x' }))))
		assert.deepEqual(errorsFor(b, '01 §4'), [])
	})

	test('the live row inside a repeating clause would be N live rows, and is refused', () => {
		const b = spec('demo:each-write@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.each('per', { over: ($: any) => $.input.items, max: 4 }, (m) =>
				m.outlet('save', C.createMessage.v1({ text: '', generating: true })),
			)
		const e = errorsFor(b, '01 §4')
		assert.equal(e.length, 1)
		assert.match(e[0]!.message, /live-row outlet .* is inside each 'per'/)
		assert.match(e[0]!.fix, /open the reply row on the spine/)
	})
})
