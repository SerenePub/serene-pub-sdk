/**
 * PLAN-layering D4/D5 (lane 1, 2026-10-20) — exposure cascades (A10, R1,
 * R32), model plumbing is never exposed (ruled 10-12), and the value
 * cascade's layers evolve in place (R38: `config` retires to `preset`).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	resolveExposure,
	exposureFindings,
	settingValueOf,
	setting,
	isSettingDecision,
	isModelPlumbing,
	genre,
	describeTaskDefinition,
	S,
	SCOPE_ORDER,
	scopeKindOf,
	resolveConfigSources,
	mayWrite,
	type FieldDecl,
} from '@serene-pub/sdk'

const fields: Record<string, FieldDecl> = {
	tone: { type: 'enum', of: ['gentle', 'grim'], default: 'gentle', reach: 'owner' },
	rigour: {
		type: 'enum',
		of: ['prose', 'scripts'],
		default: 'prose',
		reach: 'owner',
		fixedAtStart: true,
	},
	depth: { type: 'integer', default: 3 },
	prompts: { type: 'text', reach: 'admin' },
}

describe('A10 · a setting value, and what a layer decides about the layers below', () => {
	test('a plain value reads as itself; { value, lock?, askAtStart? } reads out', () => {
		assert.deepEqual(settingValueOf('grim'), { value: 'grim', lock: false, askAtStart: false })
		assert.deepEqual(settingValueOf({ value: 'grim', lock: true }), {
			value: 'grim',
			lock: true,
			askAtStart: false,
		})
		assert.deepEqual(settingValueOf({ value: { a: 1 } }), {
			value: { a: 1 },
			lock: false,
			askAtStart: false,
		})
		assert.deepEqual(setting('grim', { askAtStart: true }), { value: 'grim', askAtStart: true })
		assert.equal(isSettingDecision({ value: 1, other: 2, lock: true }), false)
	})
})

describe('A10 · resolveExposure — one cascade for the value and who sees it', () => {
	test('values follow the chain; the owner sees an owner-reach setting nobody locked', () => {
		const r = resolveExposure(fields, [
			{ layer: 'genre', values: { tone: 'grim' } },
			{ layer: 'preset', values: {} },
			{ layer: 'session', values: { tone: 'gentle', depth: 5 } },
		])
		assert.equal(r.tone!.value, 'gentle')
		assert.equal(r.tone!.from, 'session')
		assert.equal(r.tone!.ownerSees, true)
		assert.equal(r.depth!.value, 5)
		assert.equal(r.depth!.ownerSees, false, "a pipeline's setting reaches admins by default")
	})

	test('a lock stops every layer below; a locked setting is the admin’s to read', () => {
		const r = resolveExposure(fields, [
			{ layer: 'genre', values: {} },
			{ layer: 'preset', values: { tone: { value: 'grim', lock: true } } },
			{ layer: 'session', values: { tone: 'gentle' } },
		])
		assert.equal(r.tone!.value, 'grim')
		assert.equal(r.tone!.lockedAt, 'preset')
		assert.equal(r.tone!.ownerSees, false)
	})

	test('askAtStart is a placement a layer makes; a fixed-at-start setting is asked at start, read-only after (R32)', () => {
		const layers = [
			{ layer: 'preset', values: { tone: { value: 'gentle', askAtStart: true } } },
		]
		const atStart = resolveExposure(fields, layers, { stage: 'start' })
		assert.equal(atStart.tone!.askAtStart, true)
		assert.equal(
			atStart.rigour!.askAtStart,
			true,
			'fixed at start and open to the owner: always asked',
		)
		const running = resolveExposure(fields, layers)
		assert.equal(running.rigour!.ownerSees, false)
		assert.equal(running.rigour!.fixed, true)
		assert.equal(running.rigour!.askAtStart, false)
	})

	test("defaultReach: a genre's fields reach the owner unless they say otherwise", () => {
		assert.equal(
			resolveExposure({ x: { type: 'string' } }, [], { defaultReach: 'owner' }).x!.ownerSees,
			true,
		)
		assert.equal(resolveExposure({ x: { type: 'string' } }, []).x!.ownerSees, false)
	})

	test('model plumbing never reaches the owner, whatever is declared', () => {
		const r = resolveExposure({ prompts: { type: 'text', reach: 'owner' } }, [])
		assert.equal(r.prompts!.ownerSees, false)
	})
})

describe('R1 · model plumbing is never exposed (ruled 10-12)', () => {
	test('exposureFindings refuses reach: owner on plumbing, by key or by a connection source', () => {
		assert.equal(isModelPlumbing('sampling'), true)
		assert.equal(isModelPlumbing('voice', { from: 'connection.voices' }), true)
		assert.equal(isModelPlumbing('tone'), false)
		const found = exposureFindings({
			sampling: { type: 'string', reach: 'owner' },
			voice: { type: 'enum', from: 'connection.voices', reach: 'owner' },
			tone: { type: 'string', reach: 'owner' },
			bad: { type: 'string', reach: 'everyone' as never },
		})
		assert.equal(found.length, 3)
	})

	test("genre() and a node's declaration refuse it where the author is", () => {
		assert.throws(
			() =>
				genre('lane1:genre/exposed', {
					name: 'Exposed',
					family: 'x',
					shape: { fields: { loadout: { type: 'string', reach: 'owner' } } } as never,
				}),
			/model plumbing/,
		)
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'test:task/lane1-exposed@1',
					timeoutMs: 1000,
					ports: { in: { a: S.json }, out: { main: S.json } },
					slots: {
						params: {
							kind: 'parameters',
							schema: { template: { type: 'text', reach: 'owner' } },
						},
					},
				}),
			/model plumbing/,
		)
		assert.doesNotThrow(() =>
			describeTaskDefinition({
				id: 'test:task/lane1-open@1',
				timeoutMs: 1000,
				ports: { in: { a: S.json }, out: { main: S.json } },
				slots: {
					params: {
						kind: 'parameters',
						schema: { depth: { type: 'integer', default: 3, reach: 'owner' } },
					},
				},
			}),
		)
	})
})

describe('R38 · the value cascade: session · preset · genre · defaults · author', () => {
	test('the order, and the retired config word read as preset (⏳)', () => {
		assert.deepEqual(SCOPE_ORDER, ['session', 'preset', 'genre', 'defaults', 'author'])
		assert.equal(scopeKindOf('config'), 'preset')
		assert.equal(scopeKindOf('genre'), 'genre')
		assert.equal(mayWrite('connection', 'session'), false)
		assert.equal(
			mayWrite('connection', 'genre'),
			false,
			"a genre's defaults name no one's compute",
		)
		assert.equal(
			mayWrite('connection', 'config'),
			true,
			'a stored config row still writes where it did',
		)
		assert.equal(mayWrite('prompts', 'genre'), true)
	})

	test('a stored config row resolves at preset, under the session and over the genre, and says where it came from', () => {
		const sources = resolveConfigSources(
			{
				overrides: [
					{ nodeKey: 'n', slot: 'params', path: 'a', value: 'genre', scopeKind: 'genre' },
					{
						nodeKey: 'n',
						slot: 'params',
						path: 'a',
						value: 'config',
						scopeKind: 'config',
					},
					{ nodeKey: 'n', slot: 'params', path: 'b', value: 'genre', scopeKind: 'genre' },
					{
						nodeKey: 'n',
						slot: 'params',
						path: 'b',
						value: 'defaults',
						scopeKind: 'defaults',
					},
					{
						nodeKey: 'n',
						slot: 'params',
						path: 'c',
						value: 'session',
						scopeKind: 'session',
					},
					{
						nodeKey: 'n',
						slot: 'params',
						path: 'c',
						value: 'preset',
						scopeKind: 'preset',
					},
				],
				samplingConfigs: [],
				connections: [],
				activeConnection: {},
				authorDefaults: { n: { params: { d: 'author' } } },
			},
			['n'],
		)
		const p = sources.n!.params!
		assert.deepEqual(p.a, { value: 'config', scopeKind: 'config' })
		assert.deepEqual(p.b, { value: 'genre', scopeKind: 'genre' })
		assert.deepEqual(p.c, { value: 'session', scopeKind: 'session' })
		assert.deepEqual(p.d, { value: 'author', scopeKind: 'author' })
	})
})
