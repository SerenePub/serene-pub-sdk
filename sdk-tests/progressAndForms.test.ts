/**
 * Use cases 110–111 — inherent progress, and forms from data.
 *
 * Progress is a property of *running a pipeline*, not of any particular
 * trigger: `onNode` fires for every invocation with identity and never a
 * payload (F34), so any surface can show "step 3 of 7" without knowing what
 * the pipeline does. And a review pause's form is 100% defined by the data
 * the node received — `inferSchema` is the same field language extensions
 * declare settings in, rendered by the same renderer.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec, slot, run, ok } from '@serene-pub/sdk'
import { inferSchema, valuesForForm, applyFormValues, type NodeEvent } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { publish, bindings, world } from './helpers.js'

const simple = () =>
	spec('demo:progress@1', { version: '1.0.0' })
		.input('input', C.userMessage.v1())
		.provider('generate', C.generateText.v1({ connection: slot.connection() }))
		.consume('save', ($) => C.createMessage.v1({ text: $.generate.text }))

describe('110 · progress is inherent to the run', () => {
	test('every invocation announces itself — start and settle, in order', async () => {
		const events: NodeEvent[] = []
		const r = await run(publish(simple()), {
			input: {},
			world,
			onNode: (e) => events.push(e),
			bindings: bindings(),
		})
		assert.equal(r.outcome, 'ok')

		// One start and one end per node, ends carrying the result.
		const keys = [...new Set(events.map((e) => e.nodeKey))]
		assert.deepEqual(keys, ['input', 'generate', 'save'])
		for (const key of keys) {
			const mine = events.filter((e) => e.nodeKey === key)
			assert.deepEqual(
				mine.map((e) => e.phase),
				['start', 'end'],
			)
			assert.equal(mine[1]!.result, 'ok')
		}
		// `declared` is the document's floor, present on every event.
		assert.ok(events.every((e) => e.declared === 3))
	})

	test('events carry identity, never the payload', async () => {
		const events: NodeEvent[] = []
		await run(publish(simple()), {
			input: { text: 'SECRET PROMPT TEXT' },
			world,
			onNode: (e) => events.push(e),
			bindings: bindings(),
		})
		assert.ok(
			!JSON.stringify(events).includes('SECRET'),
			'a progress event carrying values is a second receipt nobody audits (F34)',
		)
	})

	test('an observer that throws is its own problem — the run finishes', async () => {
		const r = await run(publish(simple()), {
			input: {},
			world,
			onNode: () => {
				throw new Error('broken progress bar')
			},
			bindings: bindings(),
		})
		assert.equal(r.outcome, 'ok')
	})
})

describe('111 · a review form is defined by the data the node received', () => {
	const payload = {
		name: 'The Sealed Gate',
		content:
			'The gate was sealed with old iron, so they went under it rather than through it. ' +
			'What waited below had been waiting a long time.',
		pinned: false,
		priority: 3,
		tags: ['gate', 'underworld'],
		cast: { participants: [1, 2], mentioned: [] },
	}

	test('every field of the payload is editable — nothing is silently hidden', () => {
		const schema = inferSchema(payload)
		assert.deepEqual(Object.keys(schema), [
			'name',
			'content',
			'pinned',
			'priority',
			'tags',
			'cast',
		])
		assert.equal(schema['name']!.type, 'string')
		assert.equal(schema['content']!.type, 'text')
		assert.equal(schema['pinned']!.type, 'boolean')
		assert.equal(schema['priority']!.type, 'integer')
		assert.equal(schema['tags']!.type, 'string[]')
		// Structure a form cannot decompose arrives as JSON rather than being
		// dropped — an edit surface that hides part of the payload is a gate a
		// write can sneak past.
		assert.equal(schema['cast']!.type, 'text')
		assert.equal(schema['cast']!.format, 'json')
	})

	test('values round-trip: form out, edits folded back in', () => {
		const schema = inferSchema(payload)
		const values = valuesForForm(schema, payload)
		assert.equal(values['name'], 'The Sealed Gate')
		assert.match(String(values['cast']), /participants/)

		const edited = applyFormValues(schema, payload, {
			...values,
			name: 'The Gate Below',
			priority: '5',
			cast: '{"participants":[1],"mentioned":[2]}',
		}) as any
		assert.equal(edited.name, 'The Gate Below')
		assert.equal(edited.priority, 5)
		assert.deepEqual(edited.cast, { participants: [1], mentioned: [2] })
		// Untouched fields keep their originals — a form is an edit surface,
		// never a filter.
		assert.equal(edited.content, payload.content)
		assert.deepEqual(edited.tags, payload.tags)
	})

	test('approving without editing returns the payload unchanged', () => {
		// The identity case, and the one a review gate actually rests on:
		// open a payload in the form, touch nothing, approve. Every other test
		// here edits something, so a round-trip that quietly coerced an
		// untouched field — an empty string, a zero, a null, a key with a
		// space — would pass all of them and corrupt the write.
		//
		// Worth asserting explicitly because this module was once destroyed by
		// a `git checkout` in an uncommitted tree and rebuilt from a
		// transcript. Code reconstructed from a description compiles and
		// satisfies tests written from the same description; this checks the
		// behaviour instead.
		const nasty = {
			name: 'The Sealed Gate',
			content: 'a long line\nwith a "quote" and a tab\there',
			pinned: false,
			zero: 0,
			ratio: 0.5,
			empty: '',
			// Deliberately padded. Without it a `.trim()` slipped into the
			// string branch survives every assertion here, which is exactly
			// how an untouched field gets quietly rewritten.
			padded: '  leading and trailing  ',
			tags: ['gate', 'underworld'],
			noTags: [] as string[],
			cast: { participants: [1, 2], mentioned: [], nested: { deep: 'ok' } },
			nothing: null,
			emoji: '🜏 non-BMP',
			spaced: { 'extra lore': 'a key with a space' },
		}
		const schema = inferSchema(nasty)
		const back = applyFormValues(schema, nasty, valuesForForm(schema, nasty))
		assert.deepEqual(back, nasty)
	})

	test('unparseable JSON refuses with the field named, instead of committing a string', () => {
		const schema = inferSchema(payload)
		assert.throws(
			() =>
				applyFormValues(schema, payload, {
					cast: '{not json',
				}),
			/'cast' is not valid JSON/,
		)
	})

	test('a non-object payload gets a one-field form and comes back the same shape', () => {
		const schema = inferSchema('just a string')
		assert.deepEqual(Object.keys(schema), ['value'])
		const out = applyFormValues(schema, 'just a string', {
			value: 'edited',
		})
		assert.equal(out, 'edited')
	})
})

describe('112 · a shared prompts slot — authored once, read everywhere', () => {
	// 13 §12 finding (i): three nodes each demanding the same system prompt is
	// the defect; `slot.prompts({node})` closes it. The downstream node reads
	// the owner's authored text, and the panel has one box to render.
	const shared = () =>
		spec('demo:shared-prompt@1', { version: '1.0.0' })
			.input('input', C.userMessage.v1())
			.provider(
				'author',
				C.generateText.v1({ connection: slot.connection(), prompts: slot.prompts() }),
			)
			.provider(
				'reader',
				C.generateText.v1({
					connection: slot.connection(),
					prompts: slot.prompts({ node: 'author' }),
				}),
			)

	test('the reader receives the owner’s configured prompts', async () => {
		const seen: unknown[] = []
		const withPrompt = {
			...world,
			overrides: [
				{
					nodeKey: 'author',
					slot: 'prompts',
					path: 'system',
					value: 'ONE AUTHORED TEXT',
					scopeKind: 'user' as const,
				},
			],
		}
		const r = await run(publish(shared()), {
			input: {},
			world: withPrompt,
			bindings: bindings({
				'core:provider/generate-text@1': async (i: any) => {
					seen.push(i.prompts)
					return ok({ main: 'x', text: 'x' })
				},
			}),
		})
		assert.equal(r.outcome, 'ok')
		assert.equal(seen.length, 2)
		// The owner reads its own; the reader reads the owner's — the same
		// object of authored fields, configured exactly once.
		assert.deepEqual(seen[0], { system: 'ONE AUTHORED TEXT' })
		assert.deepEqual(seen[1], { system: 'ONE AUTHORED TEXT' })
	})

	test('without a target, a prompts slot still reads its own node', async () => {
		const seen: unknown[] = []
		const withBoth = {
			...world,
			overrides: [
				{
					nodeKey: 'author',
					slot: 'prompts',
					path: 'system',
					value: 'A',
					scopeKind: 'user' as const,
				},
				{
					nodeKey: 'reader',
					slot: 'prompts',
					path: 'system',
					value: 'B',
					scopeKind: 'user' as const,
				},
			],
		}
		const own = () =>
			spec('demo:own-prompt@1', { version: '1.0.0' })
				.input('input', C.userMessage.v1())
				.provider(
					'author',
					C.generateText.v1({ connection: slot.connection(), prompts: slot.prompts() }),
				)
				.provider(
					'reader',
					C.generateText.v1({
						connection: slot.connection(),
						prompts: slot.prompts(),
					}),
				)
		const r = await run(publish(own()), {
			input: {},
			world: withBoth,
			bindings: bindings({
				'core:provider/generate-text@1': async (i: any) => {
					seen.push(i.prompts)
					return ok({ main: 'x', text: 'x' })
				},
			}),
		})
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(seen[0], { system: 'A' })
		assert.deepEqual(seen[1], { system: 'B' })
	})
})
