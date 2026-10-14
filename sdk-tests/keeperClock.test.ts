/**
 * 🚧 The keeper's clock proposal (PROPOSAL-live-scenes §6, ★3; lane F,
 * 2026-10-13): Adventure's state-keeper may PROPOSE a clock move, reviewed
 * like its other proposals, and never writes the clock itself — with Trust the
 * narrator on, the trusted arm moves it through *Advance story clock*, the
 * outlet *Time passes…* uses. Chat and the Lair get no model-driven time.
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

describe("the keeper's clock proposal", () => {
	test('the keeper schema asks for a `clock` list of `{ by, unit }`, required, empty on the ordinary turn', async () => {
		const doc = await shipped('core:spec/adventure-respond')
		const schema = node(doc, 'keeperWrite').config.schema
		assert.deepEqual(schema.properties.clock, {
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
		})
		// Every property required: the llama.cpp grammar cannot leave a key out.
		assert.ok(schema.required.includes('clock'))
		// The keeper's `path` is unchanged: the clock rides its own port, so an
		// install's written config needs no re-projection.
		const preset = doc.presets.find((p: any) => p.default)
		assert.deepEqual(preset.values.find((v: any) => v.nodeKey === 'keeperWrite')?.value, { path: 'values,inventory' })
	})

	test('resolve-state-changes@1 takes the keeper answer on `clock` and publishes the move on `clock`', () => {
		const ports = (C.resolveStateChanges.descriptor as any).ports
		assert.ok('clock' in ports.in)
		assert.ok('clock' in ports.out)
	})

	for (const [slug, resolve, write] of [
		['core:spec/adventure-respond', 'keeperResolve', 'keeperWrite'],
		['core:spec/adventure-rest', 'resolve', 'write'],
	] as const)
		test(`${slug}: the reviewed arm proposes the clock line; the trusted arm moves the clock through Advance story clock`, async () => {
			const doc = await shipped(slug)
			assert.deepEqual(node(doc, resolve).config.clock, ref(write, 'json'))
			assert.deepEqual(node(doc, 'keeperStep').config.step, ref(resolve, 'clock'))
			// The only clock writer is the trusted arm's outlet, behind a
			// junction on whether the keeper asked for a move at all.
			const writers = doc.nodes.filter((n: any) => n.definitionId === 'core:outlet/advance-story-clock')
			assert.deepEqual(
				writers.map((n: any) => n.key),
				['commit.trusted.keeperClock.moves.advance'],
			)
			assert.deepEqual(writers[0].config.by, ref('keeperStep', 'by'))
			assert.deepEqual(writers[0].config.unit, ref('keeperStep', 'unit'))
			// 🚧 §15 G4/G7: the keeper's move says so (a time action), and a
			// clock that cannot move skips rather than halting the turn.
			assert.equal(writers[0].config.cause, 'keeper')
			assert.equal(writers[0].config.onRefusal, 'skip')
			const junction = doc.clauses.find((c: any) => c.id === 'commit.trusted.keeperClock')
			assert.deepEqual(junction.on, ref('keeperStep', 'moves'))
			assert.equal(junction.clauseChain, 'trusted')
			// Both arms hand set-state the same list, the clock line in it:
			// `propose` holds it, `apply` passes it over.
			assert.deepEqual(node(doc, 'commit.reviewed.propose').config.changes, ref(resolve, 'changes'))
			assert.deepEqual(node(doc, 'commit.trusted.apply').config.changes, ref(resolve, 'changes'))
		})

	test('an extend never moves the clock twice; a regenerate or a swipe moves it anew', async () => {
		// 🚧 §15 G5: the old reply's move goes back with the old reply (it is
		// anchored and retracted like a value), so a regenerate or a swipe
		// re-asks the keeper; an extend continues the reply whose move stands.
		// Rest re-drives nothing.
		assert.deepEqual(
			node(await shipped('core:spec/adventure-respond'), 'keeperStep').config.unless,
			ref('input', 'continuationPrefill'),
		)
		assert.ok(!('unless' in node(await shipped('core:spec/adventure-rest'), 'keeperStep').config))
	})

	test('every core clock move says why it moves, and every one skips a story with no clock', async () => {
		// 🚧 §15 G12: Chat's tick and Chat's / the Lair's Time passes skip too,
		// so no core spec halts on a story with no clock (G7 was Adventure's).
		const causes: Record<string, [string, string | undefined]> = {
			'core:spec/chat-respond': ['tick', 'skip'],
			'core:spec/chat-advance-time': ['action', 'skip'],
			'core:spec/lair-advance-time': ['action', 'skip'],
			'core:spec/adventure-advance-time': ['action', 'skip'],
			'core:spec/adventure-rest': ['keeper', 'skip'],
			'core:spec/adventure-respond': ['keeper', 'skip'],
		}
		for (const [slug, [cause, onRefusal]] of Object.entries(causes)) {
			const writers = (await shipped(slug)).nodes.filter(
				(n: any) => n.definitionId === 'core:outlet/advance-story-clock',
			)
			assert.equal(writers.length, 1, slug)
			assert.equal(writers[0].config.cause, cause, slug)
			assert.equal(writers[0].config.onRefusal, onRefusal, slug)
		}
		const ports = (C.advanceStoryClock.descriptor as any).ports
		assert.ok('cause' in ports.in && 'onRefusal' in ports.in && 'skipped' in ports.out)
	})

	test("Time passes never reads the keeper's clock: the amount is the player's", async () => {
		const doc = await shipped('core:spec/adventure-advance-time')
		assert.ok(!('clock' in node(doc, 'resolve').config))
		assert.ok(!node(doc, 'keeperStep'))
		assert.deepEqual(
			doc.nodes.filter((n: any) => n.definitionId === 'core:outlet/advance-story-clock').map((n: any) => n.key),
			['clock.moves.advance'],
		)
		// 🚧 §15 G6: the keeper is told the player's span, and Rest is not.
		assert.deepEqual(node(doc, 'context').config.clockStep, ref('input', 'clockStep'))
		assert.ok(!('clockStep' in node(await shipped('core:spec/adventure-rest'), 'context').config))
		assert.ok('clockStep' in (C.buildKeeperContext.descriptor as any).ports.in)
	})

	test('Chat and the Lair get no model-driven time', async () => {
		for (const slug of ['core:spec/chat-respond', 'core:spec/lair-respond']) {
			const doc = await shipped(slug)
			for (const n of doc.nodes.filter((n: any) => n.definitionId === 'core:query/resolve-state-changes'))
				assert.ok(!('clock' in n.config), `${slug} ${n.key}`)
		}
	})

	test("Adventure's keeper prompts say when to use the clock; the Lair's says nothing of it", async () => {
		const { CORE_PROMPTS } = await import('@serene-pub/core-catalog')
		const row = (key: string) =>
			JSON.stringify((CORE_PROMPTS as any[]).find((p) => p.seedKey.endsWith(`:prompts:${key}`))!.fields)
		assert.match(row('adventure-keeper'), /- clock: only when the scene's events took meaningful time/)
		assert.match(row('adventure-keeper'), /Conversation takes no time worth recording/)
		assert.match(row('adventure-rest'), /- clock: one entry saying how long the rest took/)
		assert.match(row('adventure-clock'), /- clock: the player has already chosen how much time passes, so leave this empty/)
		// 🚧 §15 G6: the span is the player's, never one notch of the sky.
		assert.match(row('adventure-clock'), /Time passes\{\{#if clockStep\}\}: \{\{clockStep\}\}\{\{\/if\}\}/)
		assert.doesNotMatch(row('adventure-clock'), /one step/)
		assert.doesNotMatch(row('lair-keeper'), /clock:/)
	})
})
