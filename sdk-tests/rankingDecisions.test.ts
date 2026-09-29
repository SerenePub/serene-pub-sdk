/**
 * Ranking decisions (PLAN-sdk-1.0 §3.9, R64): the shape a ranker publishes
 * to be recorded, and the helper a custom ranker builds one with.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DECISIONS_SHAPE, S, decision, subjectKindFindings, assignable, getDefinition } from '@serene-pub/sdk'
import '@serene-pub/contracts'

test("core's ranker publishes the decisions shape, which still flows into any json port", () => {
	assert.equal(S.decisions, DECISIONS_SHAPE)
	const out = (getDefinition('core:task/rank-hybrid@1') as { ports: { out: Record<string, string> } }).ports.out
	assert.equal(out.decisions, DECISIONS_SHAPE)
	assert.equal(assignable(DECISIONS_SHAPE, S.json), true)
})

test('a subject kind is lore-entry or a package-namespaced kind', () => {
	assert.equal(subjectKindFindings('lore-entry'), undefined)
	assert.equal(subjectKindFindings('acme.dice:roll'), undefined)
	assert.match(subjectKindFindings('roll')!, /not a subject kind/)
	assert.match(subjectKindFindings('Acme:Roll')!, /not a subject kind/)
})

test('decision() checks what a custom ranker states', () => {
	const d = decision({ subject: { kind: 'acme.dice:roll', id: 7 }, included: true, reason: 'acme.dice:high', why: 'Rolled a 19.' })
	assert.equal(d.included, true)
	assert.throws(() => decision({ subject: { kind: 'roll', id: 1 }, included: true, reason: 'x' }), /not a subject kind/)
	assert.throws(() => decision({ included: true, reason: '' }), /reason code/)
})
