/**
 * Seams (PLAN-script-placement-and-catalogue 2026-10-10, D1 + D6).
 *
 * A seam is a place a script chain may run — a `scripts` slot's port hook or
 * an interior point — and its address is the one spelling of it: `in:<port>`,
 * `out:<port>`, `<pointKey>`. Pinned here: the address grammar and its
 * round-trip, `seamsOf`'s run order (in → points → out), a slot's own extras
 * passing through while a point has none (the ambient set is the
 * executor's), `register()` refusing a scripts slot nothing could reach, and
 * every shipped definition passing that check with the address it has today.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	seamAddressOf,
	parseSeamAddress,
	seamsOf,
	allDefinitions,
	describeOracleDefinition,
	S,
} from '@serene-pub/sdk'
import '@serene-pub/contracts'

const TEXT = 'core:script:text/transform@1'
const STOP = 'core:script:text/stop@1'

describe('seam addresses', () => {
	test('a slot is in:/out: by phase, defaulting to main and before', () => {
		assert.equal(seamAddressOf({ port: 'text', phase: 'before' }), 'in:text')
		assert.equal(seamAddressOf({ port: 'cast', phase: 'after' }), 'out:cast')
		assert.equal(seamAddressOf({}), 'in:main')
		assert.equal(seamAddressOf({ phase: 'after' }), 'out:main')
	})

	test('a point is its bare key', () => {
		assert.equal(seamAddressOf({ key: 'each-draft' }), 'each-draft')
	})

	test('parse round-trips every form', () => {
		for (const at of ['in:text', 'out:cast', 'each-draft', 'select'])
			assert.equal(
				(() => {
					const p = parseSeamAddress(at)
					return p.kind === 'point' ? p.name : `${p.kind}:${p.name}`
				})(),
				at,
			)
		assert.deepEqual(parseSeamAddress('in:text'), { kind: 'in', name: 'text' })
		assert.deepEqual(parseSeamAddress('out:main'), { kind: 'out', name: 'main' })
		assert.deepEqual(parseSeamAddress('each-draft'), { kind: 'point', name: 'each-draft' })
	})

	test('malformed input throws with the grammar spelled out', () => {
		for (const bad of ['', 'in:', 'out:', 'mid:text', 'in:a:b', 'has space', 'in: text'])
			assert.throws(() => parseSeamAddress(bad), /is not a valid seam address\. The grammar is 'in:<port>'/)
		assert.throws(() => seamAddressOf({ key: 'in:text' }), /not a valid seam address/)
		assert.throws(() => seamAddressOf({ port: 'text', phase: 'during' }), /'before' or 'after'/)
	})
})

describe('seamsOf', () => {
	const d = {
		slots: {
			lateA: { kind: 'scripts', accepts: [TEXT], port: 'main', phase: 'after', extras: ['speakerName'] },
			early: {
				kind: 'scripts',
				accepts: [TEXT, STOP],
				port: 'text',
				phase: 'before',
				extras: ['castNames'],
				description: { en: 'Early' },
			},
			prompt: { kind: 'template' },
			lateB: { kind: 'scripts', accepts: [TEXT], port: 'aux', phase: 'after' },
			defaulted: { kind: 'scripts', accepts: [TEXT] },
		},
		scriptPoints: [
			{ key: 'first', accepts: [TEXT], description: { en: 'First point' } },
			{ key: 'second', accepts: [STOP] },
		],
	}

	test('in: seams, then points, then out: seams, each in declaration order', () => {
		assert.deepEqual(
			seamsOf(d).map((s) => s.at),
			['in:text', 'in:main', 'first', 'second', 'out:main', 'out:aux'],
		)
	})

	test('a slot carries its own extras; a point carries none (ambient is the executor’s)', () => {
		const byAt = Object.fromEntries(seamsOf(d).map((s) => [s.at, s]))
		assert.deepEqual(byAt['in:text']!.extras, ['castNames'])
		assert.deepEqual(byAt['out:main']!.extras, ['speakerName'])
		assert.deepEqual(byAt['out:aux']!.extras, [])
		assert.deepEqual(byAt['first']!.extras, [])
		assert.ok(!seamsOf(d).some((s) => s.extras.includes('session')))
	})

	test('each seam names its slot/port or none, its accepts and description', () => {
		const [inText, , first] = seamsOf(d)
		assert.deepEqual(inText, {
			at: 'in:text',
			kind: 'in',
			slot: 'early',
			port: 'text',
			accepts: [TEXT, STOP],
			extras: ['castNames'],
			description: { en: 'Early' },
		})
		assert.deepEqual(first, {
			at: 'first',
			kind: 'point',
			accepts: [TEXT],
			extras: [],
			description: { en: 'First point' },
		})
	})

	test('a definition with no seams has none', () => {
		assert.deepEqual(seamsOf({ slots: { prompt: { kind: 'template' } } }), [])
		assert.deepEqual(seamsOf({}), [])
	})
})

describe('register() refuses a scripts slot nothing could reach (D6)', () => {
	const declare = (id: string, slot: Record<string, unknown>) =>
		describeOracleDefinition({
			id,
			shape: S.textGen,
			ports: { in: { text: S.text }, out: { main: S.text } },
			slots: { scripts: { kind: 'scripts', ...slot } as any },
		})

	test('a before-phase slot on an undeclared in-port', () => {
		assert.throws(
			() => declare('test:oracle/seam-no-in-port@1', { accepts: [TEXT], port: 'main', phase: 'before' }),
			/test:oracle\/seam-no-in-port@1: scripts slot 'scripts' hooks in-port 'main' \(phase 'before'\), which the definition does not declare — declared in-ports: text;/,
		)
	})

	test('an after-phase slot on an undeclared out-port', () => {
		assert.throws(
			() => declare('test:oracle/seam-no-out-port@1', { accepts: [TEXT], port: 'text', phase: 'after' }),
			/hooks out-port 'text' \(phase 'after'\).*declared out-ports: main/,
		)
	})

	test('the default port is main, the default phase before', () => {
		assert.throws(
			() => declare('test:oracle/seam-defaults@1', { accepts: [TEXT] }),
			/hooks in-port 'main' \(phase 'before'\)/,
		)
	})

	test('a malformed kind id', () => {
		assert.throws(
			() =>
				declare('test:oracle/seam-bad-kind@1', {
					accepts: [TEXT, 'text/transform'],
					port: 'text',
					phase: 'before',
				}),
			/scripts slot 'scripts' accepts 'text\/transform', which is not a script kind id/,
		)
	})

	test('empty accepts', () => {
		assert.throws(
			() => declare('test:oracle/seam-empty@1', { accepts: [], port: 'text', phase: 'before' }),
			/scripts slot 'scripts' accepts no script kind/,
		)
	})

	test('a reachable slot registers', () => {
		const d = declare('test:oracle/seam-ok@1', { accepts: [TEXT], port: 'main', phase: 'after' })
		assert.deepEqual(seamsOf(d).map((s) => s.at), ['out:main'])
	})
})

describe('every shipped definition passes, at the address it has today', () => {
	// Registered on import of @serene-pub/contracts, so each one already went
	// through `register()` and its `checkScriptsSlots`. Declarations are
	// unchanged by D1/D6; this pins the addresses they now read as.
	const expected: Record<string, string[]> = {
		'core:inlet/user-message@1': ['out:text'],
		'core:inlet/side-character-turn@1': ['out:text'],
		'core:outlet/create-message@1': ['in:text'],
		'core:outlet/update-message@1': ['in:text'],
		'core:oracle/extract-cast@1': ['in:content', 'out:cast'],
		'core:task/rank-hybrid@1': ['in:candidates'],
		'core:task/build-template-context@1': ['out:main'],
		'core:task/build-narrator-context@1': ['out:main'],
		'core:task/build-side-character-context@1': ['out:main'],
		'core:task/build-planner-context@1': ['out:main'],
		'core:task/build-scene-context@1': ['out:main'],
		'core:task/build-keeper-context@1': ['out:main'],
		'core:task/process-messages@1': ['out:main'],
		'core:task/turn-scripted@1': ['select'],
		'core:task/run-script@1': ['out:main'],
		'core:oracle/summarize-batch@1': ['each-draft'],
	}

	for (const [id, ats] of Object.entries(expected))
		test(id, () => {
			const d = allDefinitions().find((x) => x.id === id)
			assert.ok(d, `${id} is registered`)
			assert.deepEqual(
				seamsOf(d!).map((s) => s.at),
				ats,
			)
		})

	test('the side-character inlet’s extras pass through as declared', () => {
		const d = allDefinitions().find((x) => x.id === 'core:inlet/side-character-turn@1')!
		assert.deepEqual(seamsOf(d)[0]!.extras, [
			'speakerName',
			'speakerCharacterId',
			'speakerIsKnown',
			'castNames',
		])
	})

	test('no other core definition declares a seam the list above misses', () => {
		const withSeams = allDefinitions()
			.filter((d) => d.id.startsWith('core:') && seamsOf(d).length > 0)
			.map((d) => d.id)
			.sort()
		assert.deepEqual(withSeams, Object.keys(expected).sort())
	})
})
