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
		// 🚧 S1 (2026-10-23): the call's schema is the crib's — the session's
		// rules' change grammar, built each run — around the same clock list.
		const doc = await shipped('core:spec/story-reckoning')
		assert.deepEqual(node(doc, 'reckon.on.reckonWrite').config.schema, ref('reckon.on.schema', 'main'))
		const { STORY_RECKON_SCHEMA, STORY_RECKON_CRIB_SCRIPT } = await import('@serene-pub/core-catalog')
		const schema = STORY_RECKON_SCHEMA as any
		assert.deepEqual(schema.properties.clock, { ...CLOCK, maxItems: 1 })
		assert.ok(schema.required.includes('clock'))
		// The crib writes the same list into the schema it hands the call.
		assert.ok((STORY_RECKON_CRIB_SCRIPT as any).source.includes(`clock: ${JSON.stringify(schema.properties.clock)}`))
	})

	test("Rest's keeper asks for the same list", async () => {
		const doc = await shipped('core:spec/story-rest')
		const schema = node(doc, 'write').config.schema
		assert.deepEqual(schema.properties.clock, CLOCK)
		// 🚧 S3: what a rest brings back by the rules — the attributes they tag `resource`, off the inlet.
		const restores = node(doc, 'restores')
		assert.deepEqual(restores.config.input, { ruleset: ref('input', 'ruleset'), fields: ref('input', 'fields') })
		assert.deepEqual(node(doc, 'context').config.fields, ref('restores', 'main'))
		const authored = doc.presets.find((p: any) => p.default)
		assert.deepEqual(authored.values.find((v: any) => v.nodeKey === 'restores' && v.slot === 'scripts')?.value, [{ seedKey: 'core:script/story-rest-crib' }])
		const preset = doc.presets.find((p: any) => p.default)
		assert.deepEqual(preset.values.find((v: any) => v.nodeKey === 'write')?.value, { path: 'values,inventory' })
	})

	test('resolve-state-changes@1 takes the keeper answer on `clock` and publishes the move on `clock`', () => {
		const ports = (C.resolveStateChanges.descriptor as any).ports
		assert.ok('clock' in ports.in)
		assert.ok('clock' in ports.out)
	})

	test('core:spec/story-rest: its changes apply at its own mode, and the keeper moves the clock', async () => {
		const doc = await shipped('core:spec/story-rest')
		assert.deepEqual(node(doc, 'resolve').config.clock, ref('write', 'json'))
		assert.deepEqual(node(doc, 'keeperStep').config.step, ref('resolve', 'clock'))
		const writers = doc.nodes.filter((n: any) => n.definitionId === 'core:outlet/advance-story-clock')
		assert.deepEqual(writers.map((n: any) => n.key), ['keeperClock.moves.advance'])
		assert.equal(writers[0].config.cause, 'keeper')
		assert.equal(writers[0].config.onRefusal, 'skip')
		// 🚧 GM 2026-10-23 (G1 ★3): the press applies at its own action's mode — an action
		// registration carries no mode (R37), so Full — never the reckoning routine's by spec id.
		assert.equal(doc.clauses.find((c: any) => c.id === 'commit'), undefined)
		assert.ok(!JSON.stringify(doc).includes('routineModes'))
		assert.deepEqual(node(doc, 'apply').config.changes, ref('resolve', 'changes'))
		const preset = doc.presets.find((p: any) => p.default)
		assert.deepEqual(preset.values.find((v: any) => v.nodeKey === 'apply' && v.slot === 'params')?.value, { mode: 'apply' })
	})

	test("core:spec/story-reckoning: the reckoning's move, Full, goes through Advance story clock", async () => {
		// 🚧 A routine since 2026-10-20 (PLAN-layering §4): it runs after the
		// turn has settled and re-drives no row, so nothing marks an extend.
		const doc = await shipped('core:spec/story-reckoning')
		const step = node(doc, 'reckon.on.time.moves.decided')
		assert.deepEqual(step.config.step, ref('reckon.on.time.moves.step', 'main'))
		assert.equal(step.config.unless, undefined)
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
			'core:spec/story-respond': [['tick', 'skip']],
			'core:spec/story-reckoning': [['keeper', 'skip']],
			'core:spec/story-advance-time': [['action', 'skip']],
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

	/**
	 * The Lair gets no model-driven time. Since its rewrite (2026-10-21) its
	 * books are the keeper routine — Story's reckoning graph — with the
	 * reckoning's *Move the clock* duty off by its own defaults, and its
	 * reply moves no clock at all.
	 */
	test('the Lair gets no model-driven time', async () => {
		const keeper = await shipped('core:spec/lair-keeper')
		const preset = keeper.presets.find((p: any) => p.default)
		assert.equal(preset.values.find((v: any) => v.nodeKey === 'duties' && v.slot === 'params')?.value?.time, false)
		const reply = await shipped('core:spec/lair-reply')
		assert.ok(!reply.nodes.some((n: any) => n.definitionId === 'core:outlet/advance-story-clock'))
		for (const n of reply.nodes.filter((n: any) => n.definitionId === 'core:query/resolve-state-changes'))
			assert.ok(!('clock' in n.config), n.key)
	})

	test("the keeper prompts say when to use the clock; the Lair's says nothing of it", async () => {
		const { CORE_PROMPTS } = await import('@serene-pub/core-catalog')
		const row = (key: string) =>
			JSON.stringify((CORE_PROMPTS as any[]).find((p) => p.seedKey.endsWith(`:prompts:${key}`))!.fields)
		assert.match(row('story-reckon'), /clock: one entry \{ by, unit \} for how much story time the reply took/)
		assert.match(row('story-reckon'), /Empty for ordinary talk/)
		assert.match(row('story-rest'), /- clock: one entry saying how long the rest took/)
		assert.match(row('story-rest'), /\{\{#if restores\}\}What a rest brings back at this table: \{\{restores\}\}/)
		assert.doesNotMatch(row('lair-keeper'), /clock: one entry/)
		assert.match(row('lair-keeper'), /clock and place: always empty/)
	})
})
