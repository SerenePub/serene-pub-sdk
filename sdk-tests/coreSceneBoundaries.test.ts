/**
 * 🚧 **The scenes routine's spec** (sense-scn, 2026-11-12): `core:spec/scene-boundaries`
 * is a code-only maintenance routine on the routine inlet — one query, then one
 * `propose-scene-cue@1` per boundary it found, sequentially, in line order — and the
 * outlet's optional `trigger` in-port.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getDefinition } from '@serene-pub/sdk'
import { CORE_SPECS, sceneBoundariesSpec, SCENE_BOUNDARIES_SPEC_ID } from '@serene-pub/core-catalog'

const doc: any = sceneBoundariesSpec()
const node = (key: string) => doc.nodes.find((n: any) => n.key === key)
const ref = (n: string, port: string) => ({ __ref: 'data', node: n, port })

describe('the scenes routine spec', () => {
	test('a maintenance routine on the routine inlet, in the catalogue, with no model call', () => {
		assert.equal(doc.id, SCENE_BOUNDARIES_SPEC_ID)
		assert.deepEqual(doc.taxonomy, { role: 'maintenance' })
		assert.equal(node('input').definitionId, 'core:inlet/routine')
		assert.deepEqual(doc.suits, ['core:event/round-ended@1'])
		assert.ok(CORE_SPECS.some((s: any) => s.slug === SCENE_BOUNDARIES_SPEC_ID))
		assert.ok(
			!doc.nodes.some((n: any) => String(n.definitionId).startsWith('core:oracle/')),
			'no model call',
		)
	})

	test('its query reads the scope and the routine off the inlet, and waits two rounds', () => {
		const find = node('find')
		assert.equal(find.definitionId, 'core:query/scene-boundaries')
		assert.deepEqual(find.config.scope, ref('input', 'sessionScope'))
		assert.deepEqual(find.config.routine, ref('input', 'routine'))
		const schema = (getDefinition('core:query/scene-boundaries@1')!.slots as any).params.schema
		assert.equal(schema.depth.default, 2)
		assert.ok(find.expose.label && find.expose.status)
		// The purpose is allowed because the whole spec calls no model.
		assert.equal(find.expose.purpose, 'Finds where one scene ends and the next begins. Calls no model.')
	})

	test("its outlet places each boundary in a sequential each clause over the query's main", () => {
		const clause = doc.clauses.find((c: any) => c.id === 'boundary')
		assert.equal(clause.kind, 'each')
		assert.equal(clause.mode, 'sequential')
		assert.deepEqual(clause.over, ref('find', 'main'))
		const place = node('boundary.item.place')
		assert.equal(place.definitionId, 'core:outlet/propose-scene-cue')
		assert.equal(place.clauseId, 'boundary')
		assert.deepEqual(place.config.at, ref('boundary.item.at', 'main'))
		assert.deepEqual(place.config.reason, ref('boundary.item.reason', 'text'))
		assert.deepEqual(place.config.trigger, ref('boundary.item.trigger', 'text'))
		assert.equal(place.config.channel, 'main')
	})
})

describe("the scene boundaries query and the outlet's trigger in-port", () => {
	test('the outlet gained one optional text in-port and kept the rest', () => {
		const ins = (getDefinition('core:outlet/propose-scene-cue@1') as any).ports.in
		assert.deepEqual(Object.keys(ins).sort(), ['at', 'channel', 'reason', 'trigger'])
		for (const k of ['at', 'channel', 'reason']) assert.ok(ins[k], k)
		assert.equal(
			ins.trigger.shape ?? ins.trigger.id ?? ins.trigger,
			ins.channel.shape ?? ins.channel.id ?? ins.channel,
		)
	})
})
