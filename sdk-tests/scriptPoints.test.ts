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

// ── D2 · one read path (PLAN-script-placement 2026-10-10) ───────────────────
//
// `applyChainsAt` and `ctx.scripts.apply` now both go through `applyAtSeam`.
// Pinned: the site each origin is handed (now carrying `at`) and the records
// each lands on the receipt are what they were; the per-origin behaviour the
// plan keeps — port path absorbs an engine throw, interior path lets it reach
// the binding — and the new `outcome.halt` (D4) halting the run.

describe('D2 · one read path, per-origin behaviour kept', () => {
	const hooked = pin(
		describeOracleDefinition({
			id: 'test:oracle/drafter-with-seams@1',
			shape: S.textGen,
			ports: { in: { text: S.text }, out: { main: S.text } },
			slots: {
				hook: {
					kind: 'scripts',
					accepts: [TEXT],
					port: 'text',
					phase: 'before',
					extras: ['speakerName'],
				},
			},
			scriptPoints: [{ key: 'draft', accepts: [TEXT] }],
		}),
	)

	const doc = compile(
		spec('test:spec/seams-one-path', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('draft', ($: any) => hooked.v1({ text: $.input.text }))
			.build(),
	)

	const go = async (
		applyScripts: ScriptChainApplier,
		opts: { chains?: boolean; binding?: (i: any, ctx: any) => Promise<any> } = {},
	) =>
		await run(doc, {
			world: {
				...world,
				overrides:
					opts.chains === false
						? []
						: [
								{ nodeKey: 'draft', slot: 'hook', path: '', value: [3], scopeKind: 'session' as const },
								{ nodeKey: 'draft', slot: 'scripts', path: 'draft', value: [7], scopeKind: 'session' as const },
							],
			},
			input: { text: 'hi' },
			seed: 'seams',
			triggerSource: 'ui',
			applyScripts,
			bindings: {
				'core:inlet/user-message@1': async (i: any) => ok(i),
				[hooked.id]:
					opts.binding ??
					(async (i: any, ctx: any) => ok({ main: await ctx.scripts.applyText('draft', i.text) })),
			},
		})

	/** A fake host applier: upper-cases at the port, appends at the point, one record per link. */
	const recording = (sites: ScriptHookSite[]): ScriptChainApplier => async (site, chain, value) => {
		sites.push(site)
		const ids = Array.isArray(chain) ? (chain as number[]) : []
		return {
			value:
				site.nodeKey !== 'draft' || typeof value !== 'string'
					? value
					: site.origin === 'binding'
						? `${value}!`
						: value.toUpperCase(),
			applications: ids.map((id) => ({
				scriptId: id,
				name: `#${id}`,
				scriptKind: TEXT,
				phase: site.phase,
				appliedBy: site.origin ?? 'substrate',
				result: 'ok' as const,
			})),
		}
	}

	test('golden: the port hook and the interior point yield the sites and records they did, plus `at`', async () => {
		const sites: ScriptHookSite[] = []
		const receipt: any = await go(recording(sites))
		assert.equal(receipt.outcome, 'ok')
		const drafts = sites.filter((s) => s.nodeKey === 'draft')
		assert.deepEqual(drafts, [
			{
				nodeKey: 'draft',
				definitionId: hooked.id,
				at: 'in:text',
				slot: 'hook',
				phase: 'before',
				port: 'text',
				accepts: [TEXT],
				extras: ['speakerName', 'session'],
			},
			{
				nodeKey: 'draft',
				definitionId: hooked.id,
				at: 'draft',
				slot: 'scripts',
				phase: 'before',
				port: 'draft',
				accepts: [TEXT],
				extras: ['session'],
				origin: 'binding',
			},
		])
		const node = receipt.nodes.find((n: any) => n.nodeKey === 'draft')
		assert.deepEqual(node.scripts, [
			{ scriptId: 3, name: '#3', scriptKind: TEXT, phase: 'before', appliedBy: 'substrate', result: 'ok' },
			{ scriptId: 7, name: '#7', scriptKind: TEXT, phase: 'before', appliedBy: 'binding', result: 'ok' },
		])
		// The port rewrite reached the binding; the point's rewrite reached its output.
		assert.equal(node.output.main, 'HI!')
		// The inlet's own out:text seam is offered as before, now named.
		const inlet = sites.find((s) => s.nodeKey === 'input')!
		assert.equal(inlet.at, 'out:text')
		assert.equal(inlet.phase, 'after')
	})

	test('an empty/absent chain still reaches the applier at a port seam', async () => {
		const seen: Array<{ at: string; chain: unknown }> = []
		await go(
			async (site, chain, value) => {
				seen.push({ at: site.at, chain })
				return { value, applications: [] }
			},
			{ chains: false },
		)
		const port = seen.find((s) => s.at === 'in:text')
		assert.ok(port, 'the port seam was offered with no chain configured')
		assert.equal(port!.chain, undefined)
		assert.ok(seen.some((s) => s.at === 'out:text'), 'the inlet seam too')
	})

	test('port path: an applier throw is absorbed into an (engine) err record and the value passes through', async () => {
		const receipt: any = await go(async (site, _chain, value) => {
			if (site.nodeKey === 'draft' && site.origin !== 'binding') throw new Error('sandbox down')
			return { value, applications: [] }
		})
		assert.equal(receipt.outcome, 'ok')
		const node = receipt.nodes.find((n: any) => n.nodeKey === 'draft')
		assert.deepEqual(node.scripts, [
			{
				scriptId: -1,
				name: '(engine)',
				scriptKind: '',
				phase: 'before',
				appliedBy: 'substrate',
				result: 'err',
				reason: 'sandbox down',
			},
		])
		assert.equal(node.output.main, 'hi')
	})

	test('interior path: an applier throw reaches the binding (no absorption)', async () => {
		const receipt: any = await go(async (site, _chain, value) => {
			if (site.origin === 'binding') throw new Error('point engine down')
			return { value, applications: [] }
		})
		assert.equal(receipt.outcome, 'err')
		const node = receipt.nodes.find((n: any) => n.nodeKey === 'draft')
		assert.equal(node.result, 'err')
		assert.equal(node.reason, 'point engine down')
		assert.equal(node.scripts, undefined)
	})

	test('outcome.halt at an in: seam halts the run before the binding, with its reason', async () => {
		let invoked = false
		const receipt: any = await go(
			async (site, _chain, value) =>
				site.at === 'in:text' && site.nodeKey === 'draft'
					? {
							value,
							applications: [
								{ scriptId: 9, name: 'guard', scriptKind: 'core:script:text/stop@1', phase: 'before', appliedBy: 'substrate', result: 'skip', reason: 'unplaced' },
							],
							halt: { reason: 'stop guard "guard" has no place to run on step draft' },
						}
					: { value, applications: [] },
			{
				binding: async () => {
					invoked = true
					return ok({ main: 'x' })
				},
			},
		)
		assert.equal(invoked, false)
		assert.equal(receipt.outcome, 'halt')
		assert.equal(receipt.haltReason, 'stop guard "guard" has no place to run on step draft')
		assert.equal(receipt.haltNodeKey, 'draft')
		const node = receipt.nodes.find((n: any) => n.nodeKey === 'draft')
		assert.equal(node.result, 'halt')
		assert.equal(node.scripts[0].name, 'guard')
	})

	test('outcome.halt at an out: seam (the inlet’s) halts the run there', async () => {
		const receipt: any = await go(async (site, _chain, value) =>
			site.at === 'out:text' ? { value, applications: [], halt: { reason: 'lost guard' } } : { value, applications: [] },
		)
		assert.equal(receipt.outcome, 'halt')
		assert.equal(receipt.haltReason, 'lost guard')
		assert.equal(receipt.haltNodeKey, 'input')
		assert.ok(!receipt.nodes.some((n: any) => n.nodeKey === 'draft'), 'nothing downstream ran')
	})

	test('outcome.halt at an interior point halts the node even if the binding catches the throw', async () => {
		const receipt: any = await go(
			async (site, _chain, value) =>
				site.origin === 'binding' ? { value, applications: [], halt: { reason: 'point lost' } } : { value, applications: [] },
			{
				binding: async (i: any, ctx: any) => {
					try {
						await ctx.scripts.applyText('draft', i.text)
					} catch {
						/* a binding swallowing it does not un-halt the node */
					}
					return ok({ main: i.text })
				},
			},
		)
		assert.equal(receipt.outcome, 'halt')
		assert.equal(receipt.haltReason, 'point lost')
		assert.equal(receipt.haltNodeKey, 'draft')
	})
})
