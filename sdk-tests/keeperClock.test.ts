/**
 * 🚧 The model-driven clock (PROPOSAL-live-scenes §6, ★3; lane F,
 * 2026-10-13; re-homed 2026-10-19, PLAN-genre-restructure R4): a model may
 * say how much story time passed — Story's reckoning after a reply, and
 * Rest's keeper — and the clock moves through *Advance story clock* only
 * when the session's task says Full; otherwise the move is a proposal,
 * reviewed like any change. The Lair gets no model-driven time.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import * as C from '@serene-pub/contracts'

const ref = (node: string, port: string) => ({ __ref: 'data', node, port })

async function shipped(slug: string): Promise<any> {
	const { coreAnnouncement } = await import('@serene-pub/core-catalog')
	return ((coreAnnouncement().document as any).pipelines as any[]).find((p) => p.id === slug)
}
const node = (doc: any, key: string) => doc.nodes.find((n: any) => n.key === key)
const CLOCK = {
	type: 'array',
	items: {
		type: 'object',
		properties: {
			by: { type: 'integer' },
			unit: { type: 'string', enum: ['minutes', 'hours', 'days', 'months', 'years'] },
		},
		required: ['by', 'unit'],
		additionalProperties: false,
	},
}

describe("the model's clock", () => {
	test("the reckoning asks for a `clock` list of `{ by, unit }`, required, empty on the ordinary turn", async () => {
		const doc = await shipped('core:spec/story-respond')
		const schema = node(doc, 'reckon.on.reckonWrite').config.schema
		assert.deepEqual(schema.properties.clock, { ...CLOCK, maxItems: 1 })
		assert.ok(schema.required.includes('clock'))
	})

	test("Rest's keeper asks for the same list", async () => {
		const doc = await shipped('core:spec/story-rest')
		const schema = node(doc, 'write').config.schema
		assert.deepEqual(schema.properties.clock, CLOCK)
		const preset = doc.presets.find((p: any) => p.default)
		assert.deepEqual(preset.values.find((v: any) => v.nodeKey === 'write')?.value, { path: 'values,inventory' })
	})

	test('resolve-state-changes@1 takes the keeper answer on `clock` and publishes the move on `clock`', () => {
		const ports = (C.resolveStateChanges.descriptor as any).ports
		assert.ok('clock' in ports.in)
		assert.ok('clock' in ports.out)
	})

	test('core:spec/story-rest: the reviewed arm proposes the clock line; the applied arm moves the clock', async () => {
		const doc = await shipped('core:spec/story-rest')
		assert.deepEqual(node(doc, 'resolve').config.clock, ref('write', 'json'))
		assert.deepEqual(node(doc, 'keeperStep').config.step, ref('resolve', 'clock'))
		const writers = doc.nodes.filter((n: any) => n.definitionId === 'core:outlet/advance-story-clock')
		assert.deepEqual(writers.map((n: any) => n.key), ['commit.applied.keeperClock.moves.advance'])
		assert.equal(writers[0].config.cause, 'keeper')
		assert.equal(writers[0].config.onRefusal, 'skip')
		// Applied when the session's *Keep the sheets* task is Full.
		const commit = doc.clauses.find((c: any) => c.id === 'commit')
		assert.deepEqual(commit.on, ref('tasks', 'modes'))
		assert.deepEqual(node(doc, 'commit.reviewed.propose').config.changes, ref('resolve', 'changes'))
		assert.deepEqual(node(doc, 'commit.applied.apply').config.changes, ref('resolve', 'changes'))
	})

	test("core:spec/story-respond: the reckoning's move, Full, goes through Advance story clock; an extend never moves it twice", async () => {
		const doc = await shipped('core:spec/story-respond')
		const step = node(doc, 'reckon.on.time.moves.decided')
		assert.deepEqual(step.config.step, ref('reckon.on.time.moves.step', 'main'))
		assert.deepEqual(step.config.unless, ref('input', 'continuationPrefill'))
		const advance = node(doc, 'reckon.on.time.moves.clock.moves.advance')
		assert.equal(advance.config.cause, 'keeper')
		assert.equal(advance.config.onRefusal, 'skip')
		// Review: the move rides the words branch's resolver, as a proposal.
		assert.deepEqual(
			node(doc, 'reckon.on.commit.words.resolve').config.clock,
			ref('reckon.on.commit.words.clockAsk', 'main'),
		)
	})

	test('every core clock move says why it moves, and every one skips a story with no clock', async () => {
		const causes: Record<string, Array<[string, string | undefined]>> = {
			'core:spec/story-respond': [
				['tick', 'skip'],
				['keeper', 'skip'],
			],
			'core:spec/story-advance-time': [['action', 'skip']],
			'core:spec/lair-advance-time': [['action', 'skip']],
			'core:spec/story-rest': [['keeper', 'skip']],
		}
		for (const [slug, want] of Object.entries(causes)) {
			const writers = (await shipped(slug)).nodes.filter(
				(n: any) => n.definitionId === 'core:outlet/advance-story-clock',
			)
			assert.deepEqual(
				writers.map((w: any) => [w.config.cause, w.config.onRefusal]),
				want,
				slug,
			)
		}
		const ports = (C.advanceStoryClock.descriptor as any).ports
		assert.ok('cause' in ports.in && 'onRefusal' in ports.in && 'skipped' in ports.out)
	})

	test('the Lair gets no model-driven time', async () => {
		const doc = await shipped('core:spec/lair-respond')
		for (const n of doc.nodes.filter((n: any) => n.definitionId === 'core:query/resolve-state-changes'))
			assert.ok(!('clock' in n.config), n.key)
	})

	test("the keeper prompts say when to use the clock; the Lair's says nothing of it", async () => {
		const { CORE_PROMPTS } = await import('@serene-pub/core-catalog')
		const row = (key: string) =>
			JSON.stringify((CORE_PROMPTS as any[]).find((p) => p.seedKey.endsWith(`:prompts:${key}`))!.fields)
		assert.match(row('story-reckon'), /clock: one entry \{ by, unit \} for how much story time the reply took/)
		assert.match(row('story-reckon'), /Empty for ordinary talk/)
		assert.match(row('story-rest'), /- clock: one entry saying how long the rest took/)
		assert.doesNotMatch(row('lair-keeper'), /clock:/)
	})
})
