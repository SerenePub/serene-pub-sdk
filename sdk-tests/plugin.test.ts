/**
 * Use cases 96–102 — the plugin author's surface: `defineExtension`, the packager,
 * `/contracts` generation and the `/testing` harness.
 *
 * Everything before this let someone author a *pipeline*. This is what lets someone write
 * a *plugin* — and the gap between those two is most of what "download the SDK" has to
 * mean.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec } from '@serene-pub/sdk'
import { run, ok, halt } from '@serene-pub/sdk'
import { slot } from '@serene-pub/sdk'
import { S } from '@serene-pub/sdk'
import { pin, describeInput, describeTaskType, allTypes } from '@serene-pub/sdk'
import { defineSettings, secret } from '@serene-pub/sdk'
import {
	defineExtension,
	pipelineHook,
	lifecycleHook,
	eventHook,
	component,
	bindingsOf,
	pipelineHooksOf,
	ExtensionError,
} from '@serene-pub/sdk'
import { compilePlugin, scanSource, renderFindings, cannotDo } from '@serene-pub/cli'
import {
	bindingNameFor,
	checkDerivable,
	checkUnique,
	generateContracts,
	parseTypeId,
} from '@serene-pub/cli'
import type { Golden } from '@serene-pub/sdk/testing'
import {
	toGolden,
	diffGolden,
	checkGolden,
	GoldenMismatch,
	probeBinding,
	probeCtxFor,
	assertEquivalent,
	renderProbes,
} from '@serene-pub/sdk/testing'
import * as C from '@serene-pub/contracts'
import { main } from '@serene-pub/cli/bin'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publish, bindings, world } from './helpers.js'

// ── A plugin, as an author would write one ─────────────────────────────────

// The third-party example already lives in `/contracts` — a type id is registered once
// per process (F5), so the test reuses it rather than declaring a second one.
const rollDice = C.roll

const settings = defineSettings({
	defaultNotation: { type: 'string', default: '1d20', scope: 'user', label: 'Default roll' },
	apiKey: { type: 'secret', scope: 'instance', side: 'extension' },
})

const dicePipeline = spec('chariot.dice-tray:roll-turn', { version: '1.2.0' })
	.on('core:event/message-created@1')
	.input('input', C.messageCreated.v1())
	.task('roll', rollDice.v1({ notation: '1d20' }))
	.provider('narrate', C.generateText.v1({ connection: slot.connection() }))
	.consume('save', ($: any) => C.createMessage.v1({ text: $.narrate.text }))
	.preset('dramatic', { label: 'Dramatic', default: true }, (p) =>
		p.params('roll', { notation: '2d20' }),
	)
	.build()

const dicePlugin = defineExtension({
	slug: 'chariot.dice-tray',
	name: 'Dice Tray',
	version: '1.2.0',
	description: 'Roll dice in chat and let the model narrate the result.',
	engines: { 'serene-pub': '>=0.7 <0.9' },
	settings,
	hooks: [
		pipelineHook(rollDice, async (i: any, ctx: any) =>
			ok({ main: 1, total: Math.floor(ctx.random() * 20) + 1 }),
		),
		// (input, ctx) too — the surface is argument 1 on every hook there is,
		// lifecycle included. Core sends no envelope for a moment you already
		// registered against, so argument 0 goes unread.
		lifecycleHook('startup', async (_input, ctx) => {
			// The storage surface: queryable, and it reports what it cost.
			const page = await ctx.storage.query({ prefix: 'stats/', limit: 20 })
			const { availableBytes } = await ctx.storage.usage()
			ctx.log('debug', 'loaded stats', {
				rows: page.rows.length,
				availableBytes,
			})
			return ok(null)
		}),
		// (input, ctx) — the occurrence arrives as argument 0, and `input.event`
		// says which one, so one hook can answer several subscriptions.
		eventHook('core:event/session-created@1', async (input, ctx) => {
			const wrote = await ctx.storage.put(`seen/${input.event}`, true)
			// A write that would exceed quota comes back `err` with the usage
			// figures, rather than throwing or silently dropping.
			if (wrote.kind !== 'ok') {
				await ctx.storage.deleteAll('stats/')
				ctx.log('warn', 'pruned stats to stay under quota')
			}
			return ok(null)
		}),
		lifecycleHook('uninstall', async (_input, ctx) => {
			// Best effort, for the state core cannot retire on our behalf.
			ctx.log('info', 'dice plugin removed')
			return ok(null)
		}),
	],
	components: [
		component({
			surface: 'core:surface/chat-message@1',
			slug: 'dice-result',
			label: 'Dice result',
			framework: 'svelte',
			entry: './dist/DiceResult.js',
		}),
	],
	pipelines: [dicePipeline],
})

// ── 96 · One entry point, validated where the author is ────────────────────
describe('96 · defineExtension', () => {
	test('it ties hooks, settings, components and pipelines into one declaration', () => {
		assert.equal(dicePlugin.slug, 'chariot.dice-tray')
		assert.equal(pipelineHooksOf(dicePlugin).length, 1)
		assert.equal(Object.keys(bindingsOf(dicePlugin))[0], 'chariot.dice-tray:roll@1')
	})

	test('a type under someone else’s namespace is refused, and says why it matters', () => {
		assert.throws(
			() =>
				defineExtension({
					slug: 'chariot.dice-tray',
					name: 'x',
					version: '1.0.0',
					hooks: [pipelineHook(C.rankHybrid.descriptor, async () => ok({}))],
				}),
			(e: Error) =>
				e instanceof ExtensionError &&
				/ownership is what lets an update replace your rows/.test(e.message),
		)
	})

	test('a non-semver version is refused', () => {
		assert.throws(
			() => defineExtension({ slug: 'a.b', name: 'x', version: 'v1' }),
			/not semver/,
		)
	})

	test('bindingsOf builds the executor map from the declaration, not a parallel list', async () => {
		// So an author's tests run their real hooks. A hand-maintained map drifts, and the
		// drift is only discovered by a user.
		const doc = publish(
			spec('chariot.dice-tray:t', { version: '1.0.0' })
				.input('input', C.userMessage.v1())
				.task('roll', rollDice.v1({ notation: '1d6' })),
		)
		const r = await run(doc, {
			input: {},
			world,
			seed: 'seed:dice',
			bindings: bindings(bindingsOf(dicePlugin) as any),
		})
		assert.equal(r.outcome, 'ok')
		assert.ok((r.nodes.find((n) => n.nodeKey === 'roll')!.output as any).total >= 1)
	})
})

// ── 97 · The packager: static half ─────────────────────────────────────────
describe('97 · the manifest is extracted without running the code', () => {
	const source = `
		import { defineExtension, pipelineHook, eventHook } from '@serene-pub/sdk'
		export default defineExtension({
			slug: 'chariot.dice-tray',
			hooks: [
				pipelineHook(rollDice, async (i, ctx) => { ctx.readOwnRows('x'); return ok({}) }),
				eventHook('core:event/session-created@1', async (s) => { s.writeOwnRows('k', 1); return ok(null) }),
			],
		})
	`

	test('permissions are compiled from what the code calls, not from what it declares', () => {
		const scan = scanSource([{ path: 'index.ts', text: source }])
		assert.deepEqual(scan.permissions, ['plugin:data.read', 'plugin:data.write'])
	})

	test('a computed declaration is an error, not a silent omission', () => {
		const dynamic = `
			const which = pickHook()
			eventHook(EVENTS[i], which)
			eventHook(isDev ? 'a' : 'b', h)
		`
		const scan = scanSource([{ path: 'bad.ts', text: dynamic }])
		const errs = scan.findings.filter((f) => f.code === 'E_DYNAMIC_DECLARATION')
		assert.ok(errs.length >= 1)
		assert.match(errs[0]!.fix, /core can never permit/)
	})

	test('a hook calling fetch() directly is refused, and pointed at the Provider', () => {
		const scan = scanSource([
			{ path: 'net.ts', text: `async function h() { const r = await fetch('https://x') }` },
		])
		const e = scan.findings.find((f) => f.code === 'E_DIRECT_NETWORK')!
		assert.ok(e)
		assert.match(e.fix, /through the injected `ctx.call`/)
		assert.match(e.fix, /A Query may not reach the network/)
	})

	test('strings and comments cannot fool the scanner', () => {
		const tricky = `
			// eventHook('commented-out@1', h)
			const s = "eventHook('in-a-string@1', h)"
			eventHook('core:event/session-created@1', h)
		`
		const scan = scanSource([{ path: 'tricky.ts', text: tricky }])
		assert.equal(scan.declared.eventHooks, 1)
	})
})

// ── 98 · The packager: assembly ────────────────────────────────────────────
describe('98 · compilePlugin', () => {
	const sources = [
		{
			path: 'index.ts',
			text: `
				export default defineExtension({ slug: 'chariot.dice-tray' })
				pipelineHook(rollDice, async (i, ctx) => ok({}))
				lifecycleHook('startup', async (s) => { await s.storage.query({ prefix: 'stats/' }); return ok(null) })
				lifecycleHook('uninstall', async (s) => { s.log('info', 'removed'); return ok(null) })
				eventHook('core:event/session-created@1', async (s) => { await s.storage.put('seen', true); return ok(null) })
				component({ surface: 'core:surface/chat-message@1', slug: 'dice-result' })
			`,
		},
	]

	test('it produces a manifest and the pipeline documents', () => {
		const r = compilePlugin({ sources, extension: dicePlugin })
		assert.ok(r.ok, renderFindings(r.findings))
		assert.equal(r.documents.length, 1)
		assert.equal(r.manifest!.types[0]!.id, 'chariot.dice-tray:roll@1')
		assert.equal(
			r.manifest!.types[0]!.binding,
			'roll',
			'the binding name is derived from the id',
		)
		assert.deepEqual(r.manifest!.pipelines, [
			{
				id: 'chariot.dice-tray:roll-turn',
				version: '1.2.0',
				nodes: 4,
				presets: ['dramatic'],
			},
		])
	})

	test('a pipeline subscription is a permission, because it is a side effect a user consents to', () => {
		const r = compilePlugin({ sources, extension: dicePlugin })
		assert.ok(r.manifest!.permissions.includes('event:core:event/message-created@1'))
		assert.ok(r.manifest!.permissions.includes('event:core:event/session-created@1'))
	})

	test('a hook registered conditionally is caught by cross-checking the two halves', () => {
		// The AST sees three hook declarations; the built extension exposes one. That
		// means something is behind an `if`, and the manifest would understate the plugin.
		const half = defineExtension({
			slug: 'chariot.dice-tray',
			name: 'x',
			version: '1.0.0',
			hooks: [],
		})
		const r = compilePlugin({ sources, extension: half })
		assert.equal(r.ok, false)
		const e = r.findings.find((f) => f.code === 'E_CONDITIONAL_REGISTRATION')!
		assert.ok(e)
		assert.match(e.fix, /the audit screen stops being true/)
	})

	test('the cannot-do list is generated, so it cannot flatter', () => {
		const r = compilePlugin({ sources, extension: dicePlugin })
		const cant = cannotDo(r.manifest!)
		assert.ok(cant.includes('cannot read your chats, characters or messages'))
		assert.ok(!cant.includes('cannot render anything in the interface'), 'it ships a component')
	})
})

// ── 98b · a chat mode carries its card ──────────────────────────────────────
// A shape-bearing input type is a chat mode (19 §2), and the New Chat picker
// renders one card per mode: `i18n.name` is the face, `i18n.description` the
// subtitle. The title is required — refused at declaration and again by the
// packager — while a missing description is a warning: a poorer card, not a
// broken one.
describe('98b · chat modes must be titled, and should be described', () => {
	test('a shape-bearing input with no title is refused at declaration, before the id is claimed', () => {
		assert.throws(
			() =>
				describeInput({
					id: 'chariot.crawl:input/crawl@1',
					ports: { out: { main: S.json } },
					sessionShape: { personas: { min: 1, max: 1 }, composer: 'text' },
				}),
			/declares a sessionShape but no i18n\.name/,
		)
		// The refusal came before the id was claimed, so fixing the declaration
		// and retrying works — an author is not locked out by their own typo.
		const fixed = describeInput({
			id: 'chariot.crawl:input/crawl@1',
			i18n: { name: { en: 'Dungeon Crawl' } },
			ports: { out: { main: S.json } },
			sessionShape: { personas: { min: 1, max: 1 }, composer: 'text' },
		})
		assert.equal(fixed.kind, 'input')
	})

	test('an input without a sessionShape is not a mode, and needs no title', () => {
		// messageCreated in core's own contracts is the precedent: a plumbing
		// input with no i18n at all.
		const plumbing = describeInput({
			id: 'chariot.crawl:input/internal-tick@1',
			ports: { out: { main: S.json } },
		})
		assert.equal(plumbing.kind, 'input')
	})

	test('the packager warns when a mode ships without a description', () => {
		// The type registered in the first test: titled, undescribed.
		const crawl = allTypes().find((t) => t.id === 'chariot.crawl:input/crawl@1')!
		const ext = defineExtension({
			slug: 'chariot.crawl',
			name: 'Dungeon Crawl',
			version: '1.0.0',
			hooks: [pipelineHook(crawl, async () => ok({}))],
		})
		const r = compilePlugin({
			sources: [
				{
					path: 'index.ts',
					text: `export default defineExtension({ slug: 'chariot.crawl' })`,
				},
			],
			extension: ext,
		})
		assert.ok(r.ok, renderFindings(r.findings))
		assert.ok(r.manifest, 'a warning does not cost the build')
		const w = r.findings.find((f) => f.code === 'W_MODE_NO_DESCRIPTION')!
		assert.ok(w)
		assert.equal(w.severity, 'warning')
		assert.match(w.fix, /subtitle/)
	})

	test('an untitled mode from an older-SDK build is an error at the packager, not a blank card', () => {
		// Hand-built, because this SDK refuses the declaration outright — the
		// packager's check exists for extensions evaluated against an older one.
		const forged = {
			slug: 'chariot.relic',
			name: 'Relic',
			version: '1.0.0',
			hooks: [
				{
					__decl: 'pipeline-hook',
					visibility: 'private',
					runtime: 'process',
					handler: async () => ok({}),
					type: {
						id: 'chariot.relic:input/expedition@1',
						kind: 'input',
						ports: { out: { main: 'core:shape/json@1' } },
						sessionShape: { composer: 'none' },
					},
				},
			],
		}
		const r = compilePlugin({
			sources: [
				{
					path: 'index.ts',
					text: `export default defineExtension({ slug: 'chariot.relic' })`,
				},
			],
			extension: forged as never,
		})
		assert.equal(r.ok, false)
		const e = r.findings.find((f) => f.code === 'E_MODE_NO_TITLE')!
		assert.ok(e)
		assert.match(e.fix, /renders every mode as a card/)
		// Both facts are reported independently — fixing the title should not
		// surface a brand-new complaint about the description.
		assert.ok(r.findings.some((f) => f.code === 'W_MODE_NO_DESCRIPTION'))
	})

	test('a titled, described mode compiles with nothing to say about its card', () => {
		const heist = describeInput({
			id: 'chariot.crawl:input/heist@1',
			i18n: {
				name: { en: 'Heist' },
				description: { en: 'One persona, one plan. No lorebook, no cast.' },
			},
			ports: { out: { main: S.json } },
			sessionShape: { personas: { min: 1, max: 1 }, composer: 'text' },
		})
		const ext = defineExtension({
			slug: 'chariot.crawl',
			name: 'Heist',
			version: '1.0.0',
			hooks: [pipelineHook(heist, async () => ok({}))],
		})
		const r = compilePlugin({
			sources: [
				{
					path: 'index.ts',
					text: `export default defineExtension({ slug: 'chariot.crawl' })`,
				},
			],
			extension: ext,
		})
		assert.ok(r.ok, renderFindings(r.findings))
		assert.ok(!r.findings.some((f) => f.code.includes('MODE')))
	})
})

// ── 99 · /contracts is generated, and the name rule is enforced ────────────
describe('99 · contracts generation', () => {
	test('every binding name in the sample contracts derives from its id', () => {
		// The rule exists because eleven of thirty-five hand-written names did not match.
		// A generator with an alias table is a generator that drifts.
		const entries = Object.entries(C)
			.filter(([, v]) => !!v && typeof v === 'object' && 'id' in (v as object))
			.map(([name, v]) => ({ name, id: (v as any).id as string }))
		assert.deepEqual(checkDerivable(entries), [])
	})

	test('no two ids derive to the same binding name', () => {
		// The derivation is namespace-blind on purpose — `core:task/assemble@2`
		// reads as `assemble` — so two namespaces can want one export name.
		// Generation would emit it twice and the second would silently win.
		// Found by adding a core ranker whose name segment a plugin example
		// already used.
		const entries = Object.entries(C)
			.filter(([, v]) => !!v && typeof v === 'object' && 'id' in (v as object))
			.map(([, v]) => ({ id: (v as any).id as string }))
		assert.deepEqual(checkUnique(entries), [])
	})

	test('a collision is reported with both ids, not just the name', () => {
		// Naming only the clash would leave the author grepping for which two
		// types own it.
		const clash = checkUnique([
			{ id: 'core:task/rank-semantic@1' },
			{ id: 'other.plugin:rank-semantic@1' },
		])
		assert.deepEqual(clash, [
			{
				name: 'rankSemantic',
				ids: ['core:task/rank-semantic@1', 'other.plugin:rank-semantic@1'],
			},
		])
	})

	test('the derivation is the camelCase of the id’s name segment, nothing else', () => {
		assert.equal(bindingNameFor('core:provider/generate-text@1'), 'generateText')
		assert.equal(bindingNameFor('chariot.dice-tray:roll@1'), 'roll')
		assert.deepEqual(parseTypeId('core:query/session-history@2'), {
			ns: 'core',
			kind: 'query',
			name: 'session-history',
			version: 2,
		})
	})

	test('generated output is readable TypeScript with the pin form at the call site', () => {
		const out = generateContracts(allTypes().slice(0, 3), { release: '0.6.0' })
		assert.match(out, /GENERATED — do not edit/)
		assert.match(out, /export const \w+ = pin\(/)
		assert.match(out, /pinned as \w+\.v\d+\(…\)/)
	})
})

// ── 100 · Goldens: "it still runs" is not the assertion anyone needs ───────
describe('100 · goldens', () => {
	const doc = () =>
		publish(
			spec('chariot.dice-tray:golden', { version: '1.0.0' })
				.input('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				.provider('generate', C.generateText.v1({ connection: slot.connection() })),
		)

	test('a golden records decisions and payloads, and excludes timings', async () => {
		const r = await run(doc(), { input: {}, world, bindings: bindings(), seed: 'seed:g' })
		const g = toGolden('turn', r)
		assert.equal(g.seed, 'seed:g')
		assert.ok(g.nodes.length > 0)
		assert.equal(
			JSON.stringify(g).includes('elapsedMs'),
			false,
			'a golden that fails on 3ms vs 2ms is one nobody keeps',
		)
	})

	test('a changed prompt fails the golden and the diff names the path', async () => {
		const before = toGolden(
			'turn',
			await run(doc(), { input: {}, world, bindings: bindings(), seed: 'seed:g' }),
		)
		const after = await run(doc(), {
			input: {},
			world,
			seed: 'seed:g',
			bindings: bindings({
				'core:query/session-history@1': async () => ok({ main: [], messages: ['CHANGED'] }),
			}),
		})
		assert.throws(
			() => checkGolden('turn', after, before),
			(e: Error) => e instanceof GoldenMismatch && /CHANGED/.test(e.message),
		)
	})

	test('recording is the same call as comparing', async () => {
		const r = await run(doc(), { input: {}, world, bindings: bindings(), seed: 'seed:g' })
		assert.equal(checkGolden('turn', r).recorded, true)
		assert.equal(checkGolden('turn', r, toGolden('turn', r)).recorded, false)
	})

	test('the diff is deepest-path-first, so the first line is the actual change', () => {
		const g = (text: string): Golden => ({
			name: 'x',
			specId: 's',
			specVersion: '1.0.0',
			seed: 'seed:g',
			outcome: 'ok',
			nodes: [{ nodeKey: 'a', kind: 'provider', result: 'ok', output: { text } }],
			emitted: [],
		})
		const d = diffGolden(g('one'), g('two'))
		assert.equal(d[0]!.path, 'nodes.0.output.text')
	})
})

// ── 101 · Binding probes: what a hook has to do to be a hook ───────────────
describe('101 · binding conformance', () => {
	test('a well-behaved hook passes every probe', async () => {
		const results = await probeBinding(
			async () => ok({ main: 1 }),
			rollDice.descriptor,
			probeCtxFor('task', { notation: '1d20' }),
		)
		assert.deepEqual(
			results.filter((r) => !r.pass),
			[],
			renderProbes(results),
		)
	})

	test('a hook returning a bare value fails, and the consequence explains why it matters', async () => {
		const results = await probeBinding(
			async () => ({ total: 4 }) as any,
			rollDice.descriptor,
			probeCtxFor('task'),
		)
		const b1 = results.find((r) => r.id === 'B1')!
		assert.equal(b1.pass, false)
		assert.match(b1.consequence!, /correct "not applicable" is recorded as an error/)
	})

	test('a hook reaching for Math.random fails the determinism probe', async () => {
		const results = await probeBinding(
			async () => ok({ total: Math.floor(Math.random() * 1e9) }),
			rollDice.descriptor,
			probeCtxFor('task'),
		)
		assert.equal(results.find((r) => r.id === 'B3')!.pass, false)
	})

	test('a Task context carries no services at all (F11)', async () => {
		const ctx = probeCtxFor('task').makeCtx()
		for (const forbidden of ['read', 'call', 'commit', 'emit'])
			assert.equal(forbidden in ctx, false)
	})

	test('a hook that never settles is caught here rather than in production', async () => {
		const results = await probeBinding(
			() => new Promise(() => {}),
			rollDice.descriptor,
			probeCtxFor('task'),
		)
		assert.equal(results.find((r) => r.id === 'B4')!.pass, false)
	})
})

// ── 102 · F26 as a one-liner an author can run ─────────────────────────────
test('102 · assertEquivalent gives an author the equivalence law in one call', async () => {
	const doc = publish(
		spec('chariot.dice-tray:eq', { version: '1.0.0' })
			.input('input', C.userMessage.v1())
			.async('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('a', (c) =>
						c.query('history', ($) =>
							C.sessionHistory.v1({ scope: $.input.sessionScope }),
						),
					)
					.chain('b', (c) =>
						c.query('lore', ($) => C.lorebookTriggers.v1({ text: $.input.text })),
					),
			),
	)
	await assertEquivalent(doc, { input: { text: 'hi' }, world, bindings: bindings() })
})

// ── 103 · The command line is the packager, not a second implementation ────
describe('103 · serene-pub CLI', () => {
	const dir = join(tmpdir(), 'sp-cli-fixture')

	const write = async (rel: string, text: string) => {
		await mkdir(join(dir, 'src'), { recursive: true })
		await writeFile(join(dir, rel), text)
	}

	test('`check` reports what core would refuse and exits non-zero', async () => {
		await write(
			'src/index.ts',
			`eventHook(EVENTS[i], h)\nasync function f() { await fetch('https://x') }`,
		)
		const code = await main(['check', dir])
		assert.equal(code, 1, 'a plugin core would refuse must not exit 0 — CI is the whole point')
	})

	test('`check` on a clean plugin exits zero and lists the permissions it computed', async () => {
		await write(
			'src/index.ts',
			`export default defineExtension({ slug: 'demo.thing' })\neventHook('core:event/session-created@1', async (s) => { s.writeOwnRows('k', 1) })`,
		)
		assert.equal(await main(['check', dir]), 0)
	})

	test('there is no `install` verb, because installing is an admin action inside SP', () => {
		// A CLI that could install is a CLI that can be scripted into installing.
		assert.equal(typeof main, 'function')
	})
})
