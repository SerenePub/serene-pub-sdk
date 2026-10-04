/**
 * `core:query/lorebook-entries@1` — the **listing** door (plans/genres §10
 * G13/G14, §11 L4).
 *
 * Every other entries-shaped definition is the same keyword scan over the
 * conversation, and admits an entry only on a key, on `admitThreshold`, or
 * because it declared itself `constant`. On a **create** run there is no
 * conversation, so the window is empty and only always-on entries come back —
 * which leaves a genre that needs to *see the book* (pick a secret, check
 * whether a room exists, list the suspects) with no door at all.
 *
 * What these tests pin is the thing most easily lost: **this is a listing, not
 * a retrieval.** If the out-ports ever become `context-candidates@1`, a spec
 * could wire a whole lorebook into the ranker as if a mechanism had found it,
 * and every number the receipt prints about *why this entry is in your prompt*
 * would be about rows nothing proposed.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
	compile,
	describeTaskDefinition,
	getDefinition,
	ok,
	pin,
	run,
	S,
	slot,
	spec,
	validate,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { world } from './helpers.js'

/**
 * A reader of the list, declared here rather than taken from `fixtures.ts`
 * because no fixture task has a `json` in-port — which is itself the shape of
 * this node's output being new.
 */
const pickOne = pin(
	describeTaskDefinition({
		id: 'test:task/pick-one@1',
		timeoutMs: 1000,
		ports: { in: { entries: S.json }, out: { main: S.json } },
	}),
)

const decl = () => getDefinition('core:query/lorebook-entries@1') as any

test('it is a query, and it is registered', () => {
	const d = decl()
	assert.ok(d, 'core:query/lorebook-entries@1 is not registered')
	assert.equal(d.kind, 'query')
})

test('it publishes a bare list, never candidates', () => {
	// The load-bearing assertion. `S.candidates` here would let a spec hand an
	// entire lorebook to `select` as if a mechanism had proposed it.
	const d = decl()
	assert.equal(d.ports.out.main, S.json)
	assert.equal(d.ports.out.entries, S.json)
	assert.notEqual(d.ports.out.main, S.candidates)
	// Both ports, same value: `main` is what an unrefined `$.entries` resolves
	// to and `entries` is what a spec names when it wants to say so.
	assert.deepEqual(Object.keys(d.ports.out).sort(), ['entries', 'main'])
})

test('the session is the only thing it is told, and there is no text to match', () => {
	const d = decl()
	assert.deepEqual(d.ports.in, { scope: S.sessionScope })
})

test('it is not optional — an empty book and a failed read must not be one value', () => {
	// The contrast is the point: the three lore lanes are `optional: true`
	// because a chat with no world lore is an ordinary chat. A genre that picked
	// its secret from this list cannot be handed an empty one and carry on.
	assert.equal(decl().optional, undefined)
	assert.equal((getDefinition('core:query/world-lore@1') as any).optional, true)
})

test('four parameters, and the ceiling is declared as well as enforced', () => {
	const schema = decl().slots.params.schema
	assert.deepEqual(Object.keys(schema).sort(), ['entryTypes', 'limit', 'name', 'withLinks'])

	// Open by construction: an install with a plugin entry type has more ids
	// than core's three, and an enum frozen into the content hash could not grow.
	assert.equal(schema.entryTypes.type, 'list')
	assert.equal(schema.entryTypes.item.type, 'text')

	assert.equal(schema.name.type, 'text')

	assert.equal(schema.limit.type, 'integer')
	assert.equal(schema.limit.default, 500)
	assert.equal(schema.limit.min, 1)
	assert.equal(schema.limit.max, 2000)
})

test('withLinks asks for each row’s lore links, and is off unless asked (places plan B2)', () => {
	// Drizzle's `with: { … }` in spirit: the listing stays a listing, and a
	// reader that wants the ways out of a room says so. Off by default, so
	// every spec written before it reads exactly the rows it always did.
	const schema = decl().slots.params.schema
	assert.equal(schema.withLinks.type, 'boolean')
	assert.equal(schema.withLinks.default, false)
})

/** The spec every showcase genre writes: list the book, hand it to a task. */
const listing = () =>
	compile(
		spec('test:spec/lorebook-listing', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('entries', ($: any) =>
				C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }),
			)
			.task('pick', ($: any) => pickOne.v1({ entries: $.entries.main }))
			.build(),
	)

test('a spec wiring $.entries.main into a task builds and validates', () => {
	const doc = listing()
	assert.deepEqual(
		validate(doc).filter((f) => f.severity === 'error'),
		[],
	)
})

test('the rows reach the task, and the declared default arrives with them', async () => {
	const rows = [
		{ id: 1, source: 'worldLore', name: 'The Cellar', content: 'Damp.' },
		{ id: 2, source: 'characterLore', name: 'Verity', content: 'Lies.' },
	]
	let seen: any
	const receipt: any = await run(listing(), {
		world,
		input: { text: 'hi' },
		seed: 'listing',
		triggerSource: 'ui',
		bindings: {
			'core:inlet/user-message@1': async (i: any) => ok(i),
			'core:query/lorebook-entries@1': async (i: any) => {
				seen = i?.params
				return ok({ main: rows, entries: rows })
			},
			'test:task/pick-one@1': async (i: any) => ok({ main: i?.entries ?? null }),
		},
	})

	assert.equal(receipt.outcome, 'ok')
	// The slot is named by the spec, so the declared default is what a run with
	// no stored configuration takes — the failure mode `paramsSlotWiring` exists
	// for is a control the panel renders and no run consults.
	assert.equal(seen?.limit, 500)
	assert.deepEqual(
		receipt.nodes.find((n: any) => n.nodeKey === 'pick')?.output?.main,
		rows,
	)
})
