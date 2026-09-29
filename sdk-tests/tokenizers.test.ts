/**
 * The tokenizer seam — an id in, a synchronous counter out, and never a failed run.
 *
 * The claim under test is the one that made `RunOptions.tokenizer` possible at
 * all: **the asynchronous part is loading, not counting.** A host names a
 * tokenizer with a string; `run` awaits the load once, before the clock starts;
 * every measurement after that is an ordinary synchronous call. If that split
 * ever breaks — if resolution starts happening per block, or if a load failure
 * starts propagating — one of the tests below fails rather than a user's reply
 * disappearing behind a merge table that would not parse.
 *
 * The degradation cases get as much attention as the happy one on purpose.
 * Budgeting with a worse estimate is a worse estimate; refusing to answer
 * because a tokenizer is missing is an outage, and the difference between the
 * two is entirely in this file.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, run, ok, roughTokens, slot, type Bindings } from '@serene-pub/sdk'
import {
	defineTokenizer,
	loadTokenizer,
	registeredTokenizers,
	ROUGH_TOKENIZER_ID,
	TOKENIZER_IDS,
} from '@serene-pub/sdk/tokenizers'
import * as C from '@serene-pub/contracts'
import { publish, bindings, withEmbeddings } from './helpers.js'

const world = withEmbeddings()

const chat = () =>
	spec('demo:tokenizer@1', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1())
		.task(
			'budget',
			C.contextBudget.v1({ connection: slot.downstreamOracle(), params: slot.params() }),
		)
		.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
		.task('merge', ($) => C.mergeCandidates.v1({ sources: [$.history.band] }))
		.task('prompt', ($) =>
			C.assemble.v2({ candidates: $.merge.candidates, budget: $.budget.available }),
		)
		.oracle('generate', ($) =>
			C.generateText.v1({ context: $.prompt.context, connection: slot.connection() }),
		)
		.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

const input = { text: 'where is my sister', sessionScope: { sessionId: 'c1' } }

/**
 * Registered at module scope, not inside the tests that use them.
 *
 * `node:test` runs a file's tests in declaration order, so registering inside
 * one test and reading in another would work today and break the first time
 * anybody reorders or filters. A registry is process state; state a test relies
 * on belongs where it cannot be skipped past.
 */
const loads = { counted: 0, broken: 0 }

defineTokenizer({
	id: 'test:counted-loads',
	load: async () => {
		loads.counted++
		await new Promise((r) => setTimeout(r, 5))
		return (v) => String(v).length
	},
})

defineTokenizer({
	id: 'test:broken',
	load: () => {
		loads.broken++
		throw new Error('merge table would not parse')
	},
})

defineTokenizer({ id: 'test:not-a-function', load: () => 42 as unknown as never })

// Deliberately absurd, for the same reason case 62 in preview.test.ts is: a
// counter this far from the estimate cannot be mistaken for it, so an assertion
// against it fails loudly if the id were dropped on the floor and `roughTokens`
// used instead.
defineTokenizer({
	id: 'test:enormous',
	load: () => (v) => (typeof v === 'object' && v !== null ? 999_999 : roughTokens(v)),
})

defineTokenizer({ id: 'test:fixed-7', load: () => () => 7 })

// ── Resolution ──────────────────────────────────────────────────────────────

describe('an id resolves to something that can count, always', () => {
	test('no id at all is not a degradation — it is the estimate, quietly', async () => {
		const t = await loadTokenizer(undefined)
		assert.equal(t.id, ROUGH_TOKENIZER_ID)
		assert.equal(t.degraded, undefined, 'a host that configured nothing has no problem')
		assert.equal(t.count('hello world'), roughTokens('hello world'))
	})

	test('a built-in ratio needs no host and no load', async () => {
		const t = await loadTokenizer('estimate')
		assert.equal(t.id, 'estimate')
		assert.equal(t.degraded, undefined)
		// 3.4 characters per token, not roughTokens' 4 — the point being that
		// picking "Estimate" and picking nothing are different measurements.
		const text = 'a'.repeat(34)
		assert.equal(t.count(text), 10)
		assert.notEqual(t.count(text), roughTokens(text))
	})

	test('an id nobody has heard of and an id nobody registered say different things', async () => {
		const nonsense = await loadTokenizer('not-a-tokenizer')
		const unregistered = await loadTokenizer('openai-gpt4o')

		assert.equal(nonsense.id, ROUGH_TOKENIZER_ID)
		assert.match(nonsense.degraded!, /not a tokenizer this build recognises/)

		assert.equal(unregistered.id, ROUGH_TOKENIZER_ID)
		assert.match(unregistered.degraded!, /no loader is registered/)
		assert.match(
			unregistered.degraded!,
			/defineTokenizer/,
			'a host wiring gap must name the thing the host is missing',
		)
	})

	test('the data-bearing ids are declared even though this package cannot satisfy them', () => {
		// The vocabulary is the SDK's; the merge tables are not. A host that has
		// registered nothing still gets a sentence naming the gap rather than
		// "unknown id", which is the difference between a wiring bug that gets
		// investigated and one that reads as a typo.
		for (const id of ['openai-gpt4o', 'llama3', 'mistral', 'cohere'])
			assert.ok(TOKENIZER_IDS.includes(id), `${id} is part of the vocabulary`)
		assert.equal(registeredTokenizers().includes('openai-gpt4o'), false)
	})
})

describe('loading happens once; counting happens synchronously', () => {
	test('concurrent resolutions share one load', async () => {
		const all = await Promise.all([
			loadTokenizer('test:counted-loads'),
			loadTokenizer('test:counted-loads'),
			loadTokenizer('test:counted-loads'),
		])
		await loadTokenizer('test:counted-loads')

		assert.equal(loads.counted, 1, 'sixty blocks must not be sixty model loads')
		for (const t of all) assert.equal(t.count('abcd'), 4)
	})

	test('a loader that throws degrades, says why, and is retried next time', async () => {
		const before = loads.broken
		const first = await loadTokenizer('test:broken')
		assert.equal(first.id, ROUGH_TOKENIZER_ID)
		assert.equal(first.requested, 'test:broken')
		assert.match(first.degraded!, /merge table would not parse/)

		await loadTokenizer('test:broken')
		assert.equal(loads.broken - before, 2, 'a cached failure would doom the process')
	})

	test('a loader that resolves to something that cannot count is a load failure', async () => {
		const t = await loadTokenizer('test:not-a-function')
		assert.equal(t.id, ROUGH_TOKENIZER_ID)
		assert.match(t.degraded!, /rather than a counting function/)
	})
})

// ── The executor honours the id ─────────────────────────────────────────────

describe('run(doc, { tokenizer })', () => {
	test('the id is what measures the payload — ignoring it changes the numbers', async () => {
		const doc = publish(chat())
		const withId = await run(doc, {
			input,
			world,
			bindings: bindings(),
			preview: true,
			tokenizer: 'test:enormous',
		})
		const without = await run(doc, { input, world, bindings: bindings(), preview: true })

		assert.ok(
			withId.preview!.totals.overBudgetBy! > 0,
			'the registered counter measured the formed payload',
		)
		assert.equal(
			without.preview!.totals.overBudgetBy,
			undefined,
			'and the same run without the id did not — so the id is what did it',
		)
		assert.notEqual(withId.preview!.context.tokens, without.preview!.context.tokens)
	})

	test('an unloadable tokenizer records a note and still produces a receipt', async () => {
		const r = await run(publish(chat()), {
			input,
			world,
			bindings: bindings(),
			preview: true,
			tokenizer: 'test:broken',
		})
		assert.equal(r.outcome, 'halt', 'the preview halt, not a failure')
		assert.ok(
			r.notes?.some((n) => /could not be loaded/.test(n)),
			'a run that silently budgeted with an estimate is the failure this prevents',
		)
	})

	test('a run with a working tokenizer records no note about it', async () => {
		const r = await run(publish(chat()), {
			input,
			world,
			bindings: bindings(),
			preview: true,
			tokenizer: 'estimate',
		})
		assert.ok(
			!r.notes?.some((n) => /tokenizer/.test(n)),
			'nothing degraded, so nothing to report',
		)
	})

	test('countTokens still works and still wins — existing hosts are not broken', async () => {
		const doc = publish(chat())
		const r = await run(doc, {
			input,
			world,
			bindings: bindings(),
			preview: true,
			tokenizer: 'estimate',
			countTokens: (v) => (typeof v === 'object' && v !== null ? 999_999 : roughTokens(v)),
		})
		assert.ok(
			r.preview!.totals.overBudgetBy! > 0,
			'the explicit function outranks the id it was passed beside',
		)
	})
})

// ── The bindings measure with the same instrument ───────────────────────────

test('every binding is handed the run’s counter, not one of its own', async () => {
	const seen: number[] = []
	const spy: Bindings = {
		'core:query/session-history@1': async (i: any, ctx: any) => {
			seen.push(ctx.countTokens('anything at all'))
			return ok({
				main: 'history',
				messages: {
					sourceKey: 'history',
					items: ['a', 'b'],
					weight: 0.4,
					minInclude: 1,
				},
			})
		},
	}

	await run(publish(chat()), {
		input,
		world,
		bindings: bindings(spy),
		preview: true,
		tokenizer: 'test:fixed-7',
	})

	assert.deepEqual(seen, [7], 'retrieval, ranking and assembly must agree about a token')
})
