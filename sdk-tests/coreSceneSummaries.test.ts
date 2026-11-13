/**
 * 🚧 **The scene summaries routine's spec** (sense-sum, 2026-11-12): `core:spec/scene-summaries`
 * is a code-only maintenance routine on the routine inlet — one query for the scene due a
 * summary, then one `summarize-finished-scene@1` that reads the routine's `routine` port.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getDefinition, validate } from '@serene-pub/sdk'
import { CORE_SPECS, sceneSummariesSpec, SCENE_SUMMARIES_SPEC_ID } from '@serene-pub/core-catalog'

const doc: any = sceneSummariesSpec()
const node = (key: string) => doc.nodes.find((n: any) => n.key === key)
const ref = (n: string, port: string) => ({ __ref: 'data', node: n, port })

describe('the scene summaries routine spec', () => {
	test('a maintenance routine on the routine inlet, in the catalogue, with no model call', () => {
		assert.equal(doc.id, SCENE_SUMMARIES_SPEC_ID)
		assert.deepEqual(doc.taxonomy, { role: 'maintenance' })
		assert.equal(node('input').definitionId, 'core:inlet/routine')
		assert.deepEqual(doc.suits, ['core:event/round-ended@1'])
		assert.equal(
			CORE_SPECS.find((s: any) => s.slug === SCENE_SUMMARIES_SPEC_ID)?.name,
			'Summarize finished scenes',
		)
		assert.ok(
			!doc.nodes.some((n: any) => String(n.definitionId).startsWith('core:oracle/')),
			'no model call',
		)
	})

	test('its query reads the scope off the inlet, waits six rounds, and carries the first purpose', () => {
		const find = node('find')
		assert.equal(find.definitionId, 'core:query/scene-summary-due')
		assert.deepEqual(find.config.scope, ref('input', 'sessionScope'))
		const schema = (getDefinition('core:query/scene-summary-due@1')!.slots as any).params.schema
		assert.equal(schema.depth.default, 6)
		assert.ok(find.expose.label && find.expose.status && find.expose.purpose)
	})

	test("its outlet takes the query's main and the routine port", () => {
		const summarize = node('summarize')
		assert.equal(summarize.definitionId, 'core:outlet/summarize-finished-scene')
		assert.deepEqual(summarize.config.scene, ref('find', 'main'))
		assert.deepEqual(summarize.config.routine, ref('input', 'routine'))
	})

	test('validate() finds no error', () => {
		const errors = validate(doc).filter((f: any) => f.severity === 'error')
		assert.deepEqual(errors, [])
	})
})
