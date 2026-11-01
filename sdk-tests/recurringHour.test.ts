import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { FunctionDecl } from '@serene-pub/sdk'
import * as F from '../core-catalog/src/functions/index.js'

type Handler = (input: Record<string, unknown>) => any
const loaded = new Map<string, Record<string, Handler>>()
async function handlers(decl: FunctionDecl): Promise<Record<string, Handler>> {
	if (!decl.body) throw new Error(`${decl.id} has no body`)
	if (!loaded.has(decl.id)) loaded.set(decl.id, (await import('data:text/javascript;base64,' + Buffer.from(decl.body).toString('base64'))) as Record<string, Handler>)
	return loaded.get(decl.id)!
}

describe('recurring@1 every hour (M0, lane T1)', () => {
	const owner = { key: 'character:1', name: 'Mara' }
	const what = { id: 'hunger', value: 1 }
	const clock = (from: object, to: object, hours?: number) => ({
		id: 'core:event/story-clock-moved@1',
		payload: { clock: { from, to, ...(hours === undefined ? {} : { hours }) } }
	})
	const from = { year: 1, month: 1, day: 1, hour: 8 }
	const to = { year: 1, month: 1, day: 1, hour: 11 }

	test('three marks crossed: one delta, by x 3', async () => {
		const { effects } = await handlers(F.recurringFunction)
		assert.deepEqual(effects!({ owner, bindings: { what }, options: { every: 'hour', by: 2 }, event: clock(from, to, 3) }).deltas, [
			{ owner: 'character:1', attribute: 'hunger', op: 'add', value: 6, reason: 'each hour' }
		])
	})
	test('no whole mark crossed, or no hours on the event: nothing', async () => {
		const { effects } = await handlers(F.recurringFunction)
		const half = clock({ year: 1, month: 1, day: 1, hour: 0, minute: 30 }, { year: 1, month: 1, day: 1, hour: 0, minute: 50 }, 0)
		assert.deepEqual(effects!({ owner, bindings: { what }, options: { every: 'hour', by: 1 }, event: half }), {})
		assert.deepEqual(effects!({ owner, bindings: { what }, options: { every: 'hour', by: 1 }, event: clock(from, to) }), {})
	})
	test('awakeOnly skips while the session sleeps, for every period', async () => {
		const { effects } = await handlers(F.recurringFunction)
		const asleep = { asleep: true }
		assert.deepEqual(effects!({ owner, bindings: { what }, options: { every: 'hour', by: 1, awakeOnly: true }, event: clock(from, to, 3), session: asleep }), {})
		assert.deepEqual(effects!({ owner, bindings: { what }, options: { every: 'round', by: 1, awakeOnly: true }, event: { id: 'core:event/round-ended@1' }, session: asleep }), {})
		assert.equal(effects!({ owner, bindings: { what }, options: { every: 'hour', by: 1, awakeOnly: true }, event: clock(from, to, 3), session: { asleep: false } }).deltas[0].value, 3)
	})
	test('every day is unchanged', async () => {
		const { effects } = await handlers(F.recurringFunction)
		assert.equal(effects!({ owner, bindings: { what }, options: { every: 'day', by: 1 }, event: clock({ year: 1, month: 1, day: 1, hour: 8 }, { year: 1, month: 1, day: 2 }) }).deltas[0].value, 1)
		assert.deepEqual(effects!({ owner, bindings: { what }, options: { every: 'day', by: 1 }, event: clock(from, to, 3) }), {})
	})
})
