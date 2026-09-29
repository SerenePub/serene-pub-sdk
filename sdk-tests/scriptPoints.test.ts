/**
 * R-11 (ruled 2026-09-15, built 2026-09-16): an interior script point
 * declares what it accepts (18 §4e).
 *
 * Until now the broker hardcoded `text/transform` for every point, so a
 * point could not be anything but a text hook however it was declared. What
 * is pinned: the declaration is read in one place and folds the two
 * deprecated spellings; the executor hands the *point's* list to the applier
 * (the applier is the host's and does the refusing — core's test is the
 * "a kind this hook does not accept" skip); and the shipped point says
 * text/transform out loud.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	scriptPointsOf,
	snapshotRegistry,
	describeOracleDefinition,
	pin,
	S,
	spec,
	compile,
	run,
	ok,
	type ScriptChainApplier,
	type ScriptHookSite,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { world } from './helpers.js'

const TEXT = 'core:script:text/transform@1'
const FILTER = 'core:script:candidates/filter@1'

describe('R-11 · a point declares what it accepts', () => {
	test('the full shape is read as declared', () => {
		const [p] = scriptPointsOf({
			scriptPoints: [{ key: 'draft', accepts: [FILTER], label: { en: 'Draft' } }],
		})
		assert.deepEqual(p, { key: 'draft', accepts: [FILTER], label: { en: 'Draft' } })
	})

	test('a point accepting nothing is refused where the author is (U4 residual)', () => {
		assert.throws(
			() =>
				describeOracleDefinition({
					id: 'test:oracle/accepts-nothing@1',
					shape: S.textGen,
					ports: { in: { text: S.text }, out: { main: S.text } },
					scriptPoints: [{ key: 'draft', accepts: [] }],
				}),
			/script point 'draft' accepting no script kind/,
		)
	})

	test('the copies are copies', () => {
		const accepts = [FILTER]
		const d = { scriptPoints: [{ key: 'draft', accepts }] }
		const [p] = scriptPointsOf(d)
		p!.accepts.push(TEXT)
		assert.deepEqual(accepts, [FILTER])
	})

	test('the shipped point says text/transform itself', () => {
		const [p] = scriptPointsOf(C.summarizeBatch.descriptor)
		assert.equal(p!.key, 'each-draft')
		assert.deepEqual(p!.accepts, [TEXT])
		// And the row carries the full shape, so a panel reading rows needs
		// no fallback of its own.
		const [row] = snapshotRegistry([C.summarizeBatch.descriptor], { release: 'test' })
		assert.deepEqual(row!.scriptPoints, [
			{
				key: 'each-draft',
				accepts: [TEXT],
				label: { en: 'Each draft' },
				description: {
					en: 'Runs over every intermediate draft this step produces, before synthesis reads them.',
				},
			},
		])
	})
})

describe('R-11 · the executor hands the applier the point’s own list', () => {
	const drafter = pin(
		describeOracleDefinition({
			id: 'test:oracle/drafter-with-points@1',
			shape: S.textGen,
			ports: { in: { text: S.text }, out: { main: S.text } },
			scriptPoints: [
				{ key: 'candidates', accepts: [FILTER], label: { en: 'Candidates' } },
				{ key: 'draft', accepts: [TEXT] },
			],
		}),
	)

	const doc = compile(
		spec('test:spec/points-accepts', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('draft', ($: any) => drafter.v1({ text: $.input.text }))
			.build(),
	)

	const go = async (applyScripts: ScriptChainApplier, point: string) =>
		await run(doc, {
			world: {
				...world,
				overrides: [
					{ nodeKey: 'draft', slot: 'scripts', path: point, value: [7], scopeKind: 'session' as const },
				],
			},
			input: { text: 'hi' },
			seed: 'points',
			triggerSource: 'ui',
			applyScripts,
			bindings: {
				'core:inlet/user-message@1': async (i: any) => ok(i),
				[drafter.id]: async (i: any, ctx: any) =>
					ok({ main: await ctx.scripts.applyText(point, i.text) }),
			},
		})

	test('a point declaring candidates/filter is offered to the applier as exactly that', async () => {
		const sites: ScriptHookSite[] = []
		const applier: ScriptChainApplier = async (site, _chain, value) => {
			sites.push(site)
			return { value, applications: [] }
		}
		const receipt: any = await go(applier, 'candidates')
		assert.equal(receipt.outcome, 'ok')
		// The inlet's own `text` hook is a substrate site and is offered too;
		// the point is the one the binding asked for.
		const interior = sites.filter((s) => s.origin === 'binding')
		assert.equal(interior.length, 1)
		assert.deepEqual(interior[0]!.accepts, [FILTER])
		assert.equal(interior[0]!.port, 'candidates')
		assert.equal(interior[0]!.nodeKey, 'draft')
	})

	test('the bare-string point is offered as a text-transform point', async () => {
		const sites: ScriptHookSite[] = []
		const applier: ScriptChainApplier = async (site, _chain, value) => {
			sites.push(site)
			return { value, applications: [] }
		}
		await go(applier, 'draft')
		const interior = sites.filter((s) => s.origin === 'binding')
		assert.deepEqual(interior[0]!.accepts, [TEXT])
	})

	test('what the applier refuses on that list lands on the receipt as its skip', async () => {
		// The refusal itself is the host applier's (core: "a kind this hook
		// does not accept"); what the substrate owes it is the list and a
		// place for the record. A fake applier standing in for core's does
		// what core's does with a text link on a candidates point.
		const applier: ScriptChainApplier = async (site, chain, value) => ({
			value,
			applications: (Array.isArray(chain) ? (chain as number[]) : []).map((id) => ({
				scriptId: id,
				name: `#${id}`,
				scriptKind: TEXT,
				phase: site.phase,
				appliedBy: site.origin ?? 'substrate',
				result: site.accepts.includes(TEXT) ? 'ok' : 'skip',
				...(site.accepts.includes(TEXT) ? {} : { reason: 'a kind this hook does not accept' }),
			})),
		})
		const refused: any = await go(applier, 'candidates')
		const node = refused.nodes.find((n: any) => n.nodeKey === 'draft')
		assert.equal(node.scripts[0].result, 'skip')
		assert.equal(node.scripts[0].reason, 'a kind this hook does not accept')
		assert.equal(node.scripts[0].appliedBy, 'binding')

		const accepted: any = await go(applier, 'draft')
		assert.equal(accepted.nodes.find((n: any) => n.nodeKey === 'draft').scripts[0].result, 'ok')
	})

	test('an undeclared point still throws, naming what is declared', async () => {
		const applier: ScriptChainApplier = async (_s, _c, value) => ({ value, applications: [] })
		const receipt: any = await go(applier, 'nope')
		assert.equal(receipt.outcome, 'err')
		const node = receipt.nodes.find((n: any) => n.nodeKey === 'draft')
		assert.match(node.reason, /'nope' is not a script point/)
		assert.match(node.reason, /candidates, draft/)
	})
})
