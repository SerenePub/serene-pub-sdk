/**
 * The bridge from a compiled pipeline to a drawing of it.
 *
 * Two claims are worth holding still here, and they are both about what the
 * docs compiler is handed rather than about how it draws: a graph's edges
 * must only ever name nodes that graph has — ELK's error for a dangling
 * endpoint is unreadable and arrives from inside a layout nobody asked for —
 * and the announcement has to be enough on its own, because it is what a
 * package ships and what a docs build has.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { pipelineResolver, specGraphOf } from '@serene-pub/cli'
import { coreAnnouncement } from '@serene-pub/core-catalog'

describe('a pipeline as a graph', () => {
	test('a core spec becomes nodes and edges that close over themselves', () => {
		const { document } = coreAnnouncement()
		const respond = document.pipelines.find((spec) => spec.id === 'core:spec/respond')
		assert.ok(respond, 'core:spec/respond is announced')

		const graph = specGraphOf(respond)
		assert.equal(graph.id, 'core:spec/respond')
		assert.ok(graph.nodes.length >= 5, `${graph.nodes.length} nodes`)
		assert.ok(graph.edges.length > 0)

		const keys = new Set(graph.nodes.map((node) => node.key))
		for (const edge of graph.edges) {
			assert.ok(keys.has(edge.from), `edge from unknown key \`${edge.from}\``)
			assert.ok(keys.has(edge.to), `edge to unknown key \`${edge.to}\``)
		}

		// The key is what the page and every error message calls the step;
		// the definition id rides underneath it.
		const input = graph.nodes.find((node) => node.kind === 'inlet')
		assert.ok(input)
		assert.equal(input.label, input.key)
		assert.ok(input.sublabel?.startsWith('core:'))

		// One line per pair, however many refs made it: a spec's edges are
		// 1:1 with rows, and rows repeat where a drawing must not.
		const pairs = new Set(graph.edges.map((edge) => `${edge.from}\u0000${edge.to}`))
		assert.equal(pairs.size, graph.edges.length)
	})

	test('the resolver answers for what the announcement carries, and null for the rest', () => {
		const resolve = pipelineResolver(coreAnnouncement().document)
		const graph = resolve('core:spec/respond')
		assert.ok(graph)
		assert.equal(graph.id, 'core:spec/respond')
		assert.equal(graph.title, 'core:spec/respond')
		assert.equal(resolve('nope'), null)
	})
})
