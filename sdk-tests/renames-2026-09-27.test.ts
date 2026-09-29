/**
 * Two owner renames of 2026-09-27 (NOMENCLATURE R1 — one word, one meaning):
 *
 *  1. A template slot's accepted languages are `acceptedEngines`.
 *  2. The stat-trail query is `core:query/stat-trail@1`, its output port `trail`.
 *
 * Pre-1.0 and undistributed, both are edited in place with no alias (owner
 * ruling 2026-09-27): only the current spelling exists.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { describeTaskDefinition, getDefinition } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { handlebars, liquid } from '@serene-pub/sdk'

describe('a template slot names its languages `acceptedEngines`', () => {
	test('a slot declared with `acceptedEngines` registers and keeps the order', () => {
		describeTaskDefinition({
			id: 'test:task/accepted-engines-ok@1',
			timeoutMs: 100,
			slots: {
				template: { kind: 'template', acceptedEngines: [liquid.id, handlebars.id], variables: {} },
			},
			ports: { in: {}, out: {} },
		} as any)
		const d = getDefinition('test:task/accepted-engines-ok@1')!
		assert.deepEqual((d.slots!.template as any).acceptedEngines, [liquid.id, handlebars.id])
	})

	test("Assemble's template slot declares both of core's engines, Handlebars first", () => {
		const slots = getDefinition(C.assemble.id)!.slots as any
		assert.deepEqual(slots.template.acceptedEngines, [handlebars.id, liquid.id])
	})
})

describe('the stat trail', () => {
	test('the contract is published under `core:query/stat-trail@1` with a `trail` port', () => {
		assert.equal(C.statTrail.id, 'core:query/stat-trail@1')
		const d = getDefinition('core:query/stat-trail@1')!
		assert.ok(d)
		assert.ok(d.ports.out?.trail)
	})
})
