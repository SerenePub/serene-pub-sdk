/**
 * The event map's two laws (PLAN-turn-order §B3) as functions: C28's
 * uncaused genre events and C29's loops with no termination policy. The
 * conformance kit judges hosts with them; these pin the judgement itself.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defineEvent, sessionEvents, uncausedGenreEvents, unterminatedCycles } from '@serene-pub/sdk'

test('the six declared roots are caused by nobody and still pass C28', () => {
	const roots = [
		sessionEvents.sessionCreated,
		sessionEvents.messageRespond,
		sessionEvents.sessionAction,
		sessionEvents.memberAdded,
		sessionEvents.memberRemoved,
		sessionEvents.castChanged,
	]
	const events = Object.fromEntries(roots.map((e) => [e, {}]))
	assert.deepEqual(uncausedGenreEvents({ id: 'test:genre/roots', events }), [])
})

test('C28 refuses an uncaused event that is not a root, and an undeclared one', () => {
	const found = uncausedGenreEvents({
		id: 'test:genre/bad',
		events: { 'core:event/message-stopped@1': {}, 'acme:event/ghost@1': {} },
	})
	assert.equal(found.length, 2)
	assert.match(found[0]!.sentence, /not a declared root/)
	assert.match(found[1]!.sentence, /no one declares/)
})

test('a declared root may not also declare causedBy', () => {
	assert.throws(
		() =>
			defineEvent({
				slug: 'test-root-with-cause',
				version: 1,
				family: 'data',
				affectsUser: false,
				declaredRoot: true,
				causedBy: ['core:outlet/create-message'],
				description: 'x',
			}),
		/declared root and declares causedBy/,
	)
})

test('C29: a loop needs one member with a termination policy; a chain needs none', () => {
	const edges = [
		{ from: 'e1', to: 's1', kind: 'binds' as const },
		{ from: 's1', to: 'e2', kind: 'causes' as const },
		{ from: 'e2', to: 'l1', kind: 'listens' as const },
		{ from: 'l1', to: 'e1', kind: 'causes' as const },
		{ from: 'e3', to: 's2', kind: 'binds' as const },
	]
	const graph = { nodes: [], edges }
	const loose = unterminatedCycles(graph, () => undefined)
	assert.equal(loose.length, 1)
	assert.deepEqual(loose[0]!.members, ['e1', 'e2', 'l1', 's1'])
	assert.deepEqual(unterminatedCycles(graph, (id) => (id === 'l1' ? 'a cap' : undefined)), [])
	// A spec that causes the event it binds is a loop of two.
	const self = unterminatedCycles(
		{
			nodes: [],
			edges: [
				{ from: 'e', to: 's', kind: 'binds' },
				{ from: 's', to: 'e', kind: 'causes' },
			],
		},
		() => undefined,
	)
	assert.equal(self.length, 1)
})
