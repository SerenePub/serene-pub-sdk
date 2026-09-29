/**
 * The streaming step and step statuses are DECLARED (lair pass B3/B18, owner
 * D6 and D5, 2026-09-27).
 *
 * Which oracle's tokens become the reply's prose used to be inferred — the
 * spine oracle nearest the write — and the inference skipped anything inside a
 * clause, so the Lair streamed its planner's JSON into the row and never
 * streamed the narrator at all. Now a spec says so on the node
 * (`expose.stream`), and `validate()` refuses the one declaration that can
 * never be right: a JSON step streaming into a row.
 *
 * A step's status (`expose.status`) is the sentence the row and the progress
 * card show while it runs — *Planning the turn* — rather than a humanized
 * node key.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { compile, validate, type SpecDocument } from '@serene-pub/sdk'
import { CORE_SPECS } from '@serene-pub/core-catalog'

const doc = (slug: string): SpecDocument => compile(CORE_SPECS.find((s) => s.slug === slug)!.build())

const streamingOf = (d: SpecDocument) =>
	d.nodes.filter((n) => (n.expose as { stream?: boolean } | undefined)?.stream).map((n) => n.key)

const errors = (d: SpecDocument) =>
	validate(d).filter((f) => f.severity === 'error' && f.law === 'streaming step')

/** A copy of `d` with `key`'s expose replaced. */
const marked = (d: SpecDocument, key: string, expose: Record<string, unknown> | undefined) => {
	const copy = structuredClone(d)
	const node = copy.nodes.find((n) => n.key === key)!
	if (expose) node.expose = expose as never
	else delete node.expose
	return copy
}

describe('B3 · which step streams is declared', () => {
	// Changed 2026-09-27 (lair pass B15, owner D2a): a pick is the picked
	// delver's own turn, and their line streams — from the `pick` junction's
	// other branch, so the two are never on one execution path.
	// And 2026-09-28 (lair re-plan R6): the Castellan's Sanctum reply
	// streams, on the `channel` junction's other arm.
	// And 2026-09-28 (lair re-plan R8): nothing narrates a turn — the lead
	// delver's line streams, after the Sanctum's beats row; a Narrate press
	// streams the Castellan's narration, on the `via` junction's own arm.
	test("the Lair streams the Castellan's narration, its talk, a picked delver or the lead — never the planner", () => {
		assert.deepEqual(streamingOf(doc('core:spec/lair-respond')), [
			'via.narrate.say',
			'via.turn.channel.sanctum.say',
			'via.turn.channel.story.pick.picked.say',
			'via.turn.channel.story.pick.planned.door.play.lead.speaks.say',
		])
	})

	test('Adventure and Whodunit stream their scene, as before', () => {
		assert.deepEqual(streamingOf(doc('core:spec/adventure-respond')), ['scene'])
		assert.deepEqual(streamingOf(doc('core:spec/whodunit-respond')), ['scene'])
	})

	test('the single-step reply specs stream their generate', () => {
		for (const slug of ['core:spec/respond', 'core:spec/narrate', 'core:spec/narrate-character', 'core:spec/guide-respond'])
			assert.deepEqual(streamingOf(doc(slug)), ['generate'], slug)
	})

	test('no core spec declares a JSON step streaming, and every core spec validates', () => {
		for (const s of CORE_SPECS) assert.deepEqual(errors(compile(s.build())), [], s.slug)
	})

	test('a JSON step declared streaming is refused, and the finding names the fix', () => {
		const lair = doc('core:spec/lair-respond')
		const bad = marked(
			marked(lair, 'via.turn.channel.story.pick.planned.door.play.lead.speaks.say', undefined),
			'via.turn.channel.story.pick.planned.planWrite',
			{ stream: true },
		)
		const found = errors(bad)
		assert.equal(found.length, 1)
		assert.equal(found[0]!.nodeKey, 'via.turn.channel.story.pick.planned.planWrite')
		assert.match(found[0]!.message, /JSON/)
		assert.match(found[0]!.fix, /generate-text|prose/)
	})

	test('two streaming steps are refused — a run has one live row', () => {
		const adventure = doc('core:spec/adventure-respond')
		const bad = marked(adventure, 'voices.item.say', { stream: true })
		const found = errors(bad)
		assert.ok(found.length >= 1)
		assert.ok(found.some((f) => /one/.test(f.message)))
	})

	test('a streaming step inside an each is refused — it would run once per item into one row', () => {
		const adventure = doc('core:spec/adventure-respond')
		const bad = marked(marked(adventure, 'scene', undefined), 'voices.item.say', { stream: true })
		const found = errors(bad)
		assert.equal(found.length, 1)
		assert.equal(found[0]!.nodeKey, 'voices.item.say')
	})

	test('a spec that declares nothing streams nothing, and that is valid', () => {
		const d = marked(doc('core:spec/respond'), 'generate', undefined)
		assert.deepEqual(streamingOf(d), [])
		assert.deepEqual(errors(d), [])
	})
})

/**
 * At most one streaming step on any single execution path (W2, 2026-09-27).
 *
 * "One per spec" left the Writing Room streaming nothing: its prose is written
 * by one of two oracles in mutually exclusive branches of one junction, so only
 * one of them ever runs. Two steps that can never run in the same execution
 * may each stream; two that can still may not.
 */
describe('W2 · one streaming step per execution path', () => {
	const WR = 'core:spec/writing-room-respond'

	test("the Writing Room declares both branches' prose steps, and validates", () => {
		const d = doc(WR)
		assert.deepEqual(streamingOf(d).sort(), ['turn.manuscript.write', 'turn.talk.say'])
		assert.deepEqual(errors(d), [])
	})

	test('two `equals` branches on different literals are exclusive — both may stream', () => {
		const d = structuredClone(doc(WR))
		const junction = d.clauses.find((c) => c.id === 'turn')! as { branches?: Record<string, unknown> }
		junction.branches!.talk = { equals: 'main' }
		assert.deepEqual(errors(d), [])
	})

	test('two streaming steps on one branch are refused — the same path', () => {
		const d = structuredClone(doc(WR))
		const say = d.nodes.find((n) => n.key === 'turn.talk.say')!
		say.clauseChain = 'manuscript'
		const found = errors(d)
		assert.equal(found.length, 1)
		assert.match(found[0]!.message, /same execution path|one execution/)
	})

	test('branches that can both fire are not exclusive — refused', () => {
		for (const [manuscript, talk] of [
			[{ equals: 'manuscript' }, { truthy: true }],
			[{ equals: 'manuscript' }, { equals: 'manuscript' }],
			[{ path: 'a', equals: 1 }, { path: 'b', equals: 2 }],
		]) {
			const d = structuredClone(doc(WR))
			const junction = d.clauses.find((c) => c.id === 'turn')! as { branches?: Record<string, unknown> }
			junction.branches!.manuscript = manuscript
			junction.branches!.talk = talk
			assert.equal(errors(d).length, 1, JSON.stringify([manuscript, talk]))
		}
	})

	test('a spine step and a branch step share a path — refused', () => {
		const d = structuredClone(doc(WR))
		const say = d.nodes.find((n) => n.key === 'turn.talk.say')!
		delete say.clauseId
		delete say.clauseChain
		const found = errors(d)
		assert.equal(found.length, 1)
		assert.match(found[0]!.message, /same execution path|one execution/)
	})
})

describe('B18 · a step declares its status', () => {
	test("the Lair's planner reads as the Castellan planning the turn, its keeper as keeping the books (R8)", () => {
		const lair = doc('core:spec/lair-respond')
		const status = (key: string) =>
			(lair.nodes.find((n) => n.key === key)!.expose as { status?: unknown } | undefined)?.status
		assert.equal(status('via.turn.channel.story.pick.planned.planWrite'), 'The Castellan is planning the turn')
		assert.equal(status('keep.played.keeperWrite'), 'Keeping the books')
		assert.equal(status('via.narrate.say'), 'The Castellan narrates')
		assert.ok(status('via.turn.channel.story.pick.planned.door.play.lead.speaks.say'))
	})

	test('every model step of a multi-step core reply spec declares one', () => {
		for (const slug of ['core:spec/lair-respond', 'core:spec/adventure-respond', 'core:spec/whodunit-respond']) {
			const d = doc(slug)
			for (const n of d.nodes.filter((n) => n.kind === 'oracle'))
				assert.ok((n.expose as { status?: unknown } | undefined)?.status, `${slug} ${n.key}`)
		}
	})

	test('a status that is not display text is refused', () => {
		const bad = marked(doc('core:spec/respond'), 'generate', { stream: true, status: 42 })
		assert.ok(validate(bad).some((f) => f.severity === 'error' && f.nodeKey === 'generate' && /status/.test(f.message)))
	})
})
