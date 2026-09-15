/**
 * Sampling configs as `{shape, values, enabled}`.
 *
 * The point of the shape-keyed vocabulary is that text and image rows are the
 * same kind of object, so these tests mostly check that nothing about resolution
 * knows which modality it is looking at — and that the two categories of key that
 * survive in a row without being sent (switched off, or not in this vocabulary)
 * really do survive, because that is the property a naive filter would break.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	S,
	SAMPLING_SCHEMAS,
	DEFAULT_SAMPLING_SHAPE,
	textSamplingSchema,
	imageSamplingSchema,
	samplingSchemaFor,
	resolveSamplingValues,
	normalizeSamplingRow,
	allTypes,
} from '@serene-pub/sdk'
// Imported for its side effect: the contracts register the core descriptors, and
// the coverage test below has nothing to walk until they have.
import '@serene-pub/contracts'

describe('the vocabularies', () => {
	test('each shape has one, keyed by the shape id a provider declares', () => {
		assert.equal(SAMPLING_SCHEMAS[S.textGen], textSamplingSchema)
		assert.equal(SAMPLING_SCHEMAS[S.imageGen], imageSamplingSchema)
		assert.equal(samplingSchemaFor(S.imageGen), imageSamplingSchema)
	})

	test('a row with no shape reads as text — the only shape that existed before', () => {
		assert.equal(DEFAULT_SAMPLING_SHAPE, S.textGen)
		assert.equal(samplingSchemaFor(undefined), textSamplingSchema)
		assert.equal(samplingSchemaFor(null), textSamplingSchema)
	})

	test('an unknown shape is empty, not an exception', () => {
		// A row belonging to a plugin provider that is not installed must read as
		// "no parameters to offer" wherever it is loaded.
		assert.deepEqual(samplingSchemaFor('acme:shape/does-not-exist@1'), {})
	})

	test('every core type with a sampling slot has a vocabulary for it', () => {
		// The empty-schema fallback above is right for a shape nobody here knows,
		// and indistinguishable from a bug for a shape a shipped type declares a
		// slot on: resolution would drop every enabled key and report nothing.
		// `core:provider/speak@1` was exactly that for a while.
		const missing: string[] = []
		for (const d of allTypes()) {
			const slot = (d.slots as Record<string, { kind?: string; shape?: string }> | undefined)
				?.sampling
			if (slot?.kind !== 'sampling') continue
			const shape = slot.shape ?? d.shape
			// Third-party ids are not this repo's to vouch for.
			if (!shape || !d.id.startsWith('core:')) continue
			if (!SAMPLING_SCHEMAS[shape]) missing.push(`${d.id} -> ${shape}`)
		}
		assert.deepEqual(missing, [])
	})

	test('text declares reasoning as two ordinary samplers', () => {
		// Ordinary is the assertion. A reasoning setting that lives on the
		// CONNECTION cannot be chosen per stage and no config panel can show
		// it; declaring it here is what makes it a checkbox and a control like
		// every other sampler, and what lets one config say "this stage does
		// not think" while another beside it does.
		const level = textSamplingSchema.reasoning
		assert.equal(level?.type, 'enum')
		assert.deepEqual(level?.of, ['off', 'low', 'medium', 'high'])
		// No `default`/`auto` member: switching the field OFF is already how a
		// config says "leave it to the service".
		assert.ok(!(level?.of ?? []).includes('default'))

		const budget = textSamplingSchema.reasoningBudget
		assert.equal(budget?.type, 'integer')
		assert.equal(budget?.min, 0)
	})

	test('every declared default already satisfies its own min/max', () => {
		for (const [shape, schema] of Object.entries(SAMPLING_SCHEMAS)) {
			for (const [key, decl] of Object.entries(schema)) {
				if (typeof decl.default !== 'number') continue
				if (decl.min !== undefined)
					assert.ok(
						decl.default >= decl.min,
						`${shape}.${key}: default ${decl.default} below min ${decl.min}`
					)
				if (decl.max !== undefined)
					assert.ok(
						decl.default <= decl.max,
						`${shape}.${key}: default ${decl.default} above max ${decl.max}`
					)
			}
		}
	})
})

describe('resolution — what reaches the adapter', () => {
	test('only what is switched on', () => {
		const out = resolveSamplingValues({
			shape: S.textGen,
			values: { temperature: 0.8, topP: 0.9, topK: 40 },
			enabled: ['temperature'],
		})
		assert.deepEqual(out, { temperature: 0.8 })
	})

	test('enabled but unset falls back to the declared default', () => {
		const out = resolveSamplingValues({
			shape: S.textGen,
			values: {},
			enabled: ['temperature', 'contextTokens'],
		})
		assert.deepEqual(out, { temperature: 0.7, contextTokens: 4096 })
	})

	test('a stored null is treated as unset, not sent as null', () => {
		// The migration from typed columns produces these: a nullable column that
		// was never written arrives as null, and null is not a temperature.
		const out = resolveSamplingValues({
			shape: S.textGen,
			values: { temperature: null, topK: null },
			enabled: ['temperature', 'topK'],
		})
		assert.deepEqual(out, { temperature: 0.7, topK: 80 })
	})

	test('a switched-off key keeps its value in the row and stays off the wire', () => {
		// Turning a sampler off and back on must not lose what you had.
		const row = {
			shape: S.textGen,
			values: { temperature: 0.8, mirostat: 2 },
			enabled: ['temperature'],
		}
		assert.deepEqual(resolveSamplingValues(row), { temperature: 0.8 })
		assert.equal(row.values.mirostat, 2)
	})

	test('a key this build does not know is dropped on the way out, not out of the row', () => {
		// A row written by a newer build travelling through an older one.
		const row = {
			shape: S.textGen,
			values: { temperature: 0.8, futureSampler: 3 },
			enabled: ['temperature', 'futureSampler'],
		}
		assert.deepEqual(resolveSamplingValues(row), { temperature: 0.8 })
		assert.equal(row.values.futureSampler, 3)
	})

	test('UI-only flags never reach an adapter', () => {
		// `contextTokensUnlocked` is a control on a form, not a parameter. It lives
		// in `values` because that is where the row's memory is, and it is absent
		// from the schema, which is what keeps it off the wire.
		const out = resolveSamplingValues({
			shape: S.textGen,
			values: { contextTokens: 8192, contextTokensUnlocked: true },
			enabled: ['contextTokens', 'contextTokensUnlocked'],
		})
		assert.deepEqual(out, { contextTokens: 8192 })
	})

	test('an image row resolves by exactly the same rules', () => {
		const out = resolveSamplingValues({
			shape: S.imageGen,
			values: { steps: 30, sampler: 'dpmpp_2m' },
			enabled: ['steps', 'cfg', 'sampler'],
		})
		assert.deepEqual(out, { steps: 30, cfg: 5, sampler: 'dpmpp_2m' })
	})

	test('a text key enabled on an image row does not cross over', () => {
		// The shape is what makes a config safe to point at a connection.
		const out = resolveSamplingValues({
			shape: S.imageGen,
			values: { temperature: 0.8, steps: 30 },
			enabled: ['temperature', 'steps'],
		})
		assert.deepEqual(out, { steps: 30 })
	})

	test('nothing enabled resolves to nothing — the backend keeps its own defaults', () => {
		assert.deepEqual(
			resolveSamplingValues({ shape: S.imageGen, values: { steps: 30 }, enabled: [] }),
			{}
		)
	})

	test('an empty row is an empty result, not a crash', () => {
		assert.deepEqual(resolveSamplingValues({}), {})
		assert.deepEqual(resolveSamplingValues({ values: null, enabled: null }), {})
	})

	test('a key with neither stored value nor default is simply absent', () => {
		// `sampler` is a free string with no default: no backend-independent
		// answer exists, so "unset" has to mean "let the backend decide".
		assert.deepEqual(
			resolveSamplingValues({ shape: S.imageGen, values: {}, enabled: ['sampler'] }),
			{}
		)
	})

	test('the result is a plain object a caller can spread a per-run override onto', () => {
		// This is how dispatch applies a call-specific token budget.
		const resolved = resolveSamplingValues({
			shape: S.textGen,
			values: { temperature: 0.8 },
			enabled: ['temperature'],
		})
		assert.deepEqual({ ...resolved, maxTokens: 500 }, { temperature: 0.8, maxTokens: 500 })
	})
})

describe('normalization — what gets written', () => {
	test('form strings become the declared types', () => {
		const row = normalizeSamplingRow({
			shape: S.textGen,
			values: { temperature: '0.85', topK: '40', penalizeNewline: 'true' },
			enabled: ['temperature', 'topK', 'penalizeNewline'],
		})
		assert.deepEqual(row.values, {
			temperature: 0.85,
			topK: 40,
			penalizeNewline: true,
		})
	})

	test('an integer field rounds rather than storing a fraction', () => {
		const row = normalizeSamplingRow({
			shape: S.imageGen,
			values: { steps: 30.7 },
			enabled: ['steps'],
		})
		assert.equal(row.values.steps, 31)
	})

	test('out-of-range values clamp to the declared bounds', () => {
		const row = normalizeSamplingRow({
			shape: S.textGen,
			values: { temperature: 99, topP: -1 },
			enabled: ['temperature', 'topP'],
		})
		assert.equal(row.values.temperature, 2)
		assert.equal(row.values.topP, 0)
	})

	test('a value that cannot be its declared type is dropped, so the default applies', () => {
		// Better an unset parameter than NaN arriving as a temperature.
		const row = normalizeSamplingRow({
			shape: S.textGen,
			values: { temperature: 'hot' },
			enabled: ['temperature'],
		})
		assert.equal('temperature' in row.values, false)
		assert.deepEqual(resolveSamplingValues(row), { temperature: 0.7 })
	})

	test('a json-format field accepts either the parsed object or the textarea text', () => {
		assert.deepEqual(
			normalizeSamplingRow({
				shape: S.textGen,
				values: { logitBias: '{"123":-100}' },
				enabled: ['logitBias'],
			}).values.logitBias,
			{ '123': -100 }
		)
		assert.deepEqual(
			normalizeSamplingRow({
				shape: S.textGen,
				values: { logitBias: { '123': -100 } },
				enabled: ['logitBias'],
			}).values.logitBias,
			{ '123': -100 }
		)
	})

	test('a string[] field accepts a newline-separated textarea', () => {
		const row = normalizeSamplingRow({
			shape: S.textGen,
			values: { stop: 'END\n\n  ###  \n' },
			enabled: ['stop'],
		})
		assert.deepEqual(row.values.stop, ['END', '###'])
	})

	test('enabled is deduplicated and filtered to keys this shape declares', () => {
		const row = normalizeSamplingRow({
			shape: S.textGen,
			values: {},
			enabled: ['temperature', 'temperature', 'notAThing', 'steps'],
		})
		assert.deepEqual(row.enabled, ['temperature'])
	})

	test('values keeps keys the schema does not declare — enabled is the switchboard, values is the memory', () => {
		const row = normalizeSamplingRow({
			shape: S.textGen,
			values: { temperature: 0.8, contextTokensUnlocked: true, futureSampler: 3 },
			enabled: ['temperature', 'futureSampler'],
		})
		assert.equal(row.values.contextTokensUnlocked, true)
		assert.equal(row.values.futureSampler, 3)
		assert.deepEqual(row.enabled, ['temperature'])
	})

	test('a row with no shape normalizes to the default one', () => {
		assert.equal(normalizeSamplingRow({ values: {}, enabled: [] }).shape, S.textGen)
	})

	test('normalizing is idempotent', () => {
		const once = normalizeSamplingRow({
			shape: S.textGen,
			values: { temperature: '0.85', topK: '40', keptAsIs: 'x' },
			enabled: ['temperature', 'topK', 'nope'],
		})
		const twice = normalizeSamplingRow(once)
		assert.deepEqual(twice, once)
	})

	test('normalize then resolve is what the adapter would have received anyway', () => {
		const row = normalizeSamplingRow({
			shape: S.imageGen,
			values: { steps: '30', cfg: '7.5', width: '832', height: '1216' },
			enabled: ['steps', 'cfg', 'width', 'height', 'seed'],
		})
		assert.deepEqual(resolveSamplingValues(row), {
			steps: 30,
			cfg: 7.5,
			width: 832,
			height: 1216,
			seed: -1,
		})
	})
})
