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

import { spec, sessionEvents, use } from '@serene-pub/sdk'
import { run, ok, halt } from '@serene-pub/sdk'
import { slot } from '@serene-pub/sdk'
import { S } from '@serene-pub/sdk'
import {
	pin,
	describeInletDefinition,
	describeTaskDefinition,
	allDefinitions,
} from '@serene-pub/sdk'
import { defineSettings, secret } from '@serene-pub/sdk'
import {
	defineExtension,
	handler,
	lifecycleCallback,
	eventListener,
	component,
	widget,
	bindingsOf,
	handlersOf,
	ExtensionError,
} from '@serene-pub/sdk'
import { compilePlugin, scanSource, renderFindings, cannotDo } from '@serene-pub/cli'
import { hookBindingsFor, pluginEntrySource } from '@serene-pub/cli'
import {
	bindingNameFor,
	checkDerivable,
	checkUnique,
	generateContracts,
	parseDefinitionId,
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
import { main, isEntryPoint } from '@serene-pub/cli/bin'
import { mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { publish, bindings, world } from './helpers.js'

// ── A plugin, as an author would write one ─────────────────────────────────

// The third-party example already lives in `/contracts` — a type id is registered once
// per process (F5), so the test reuses it rather than declaring a second one.
const rollDice = C.roll

const settings = defineSettings({
	defaultNotation: { type: 'string', default: '1d20', scope: 'user', label: 'Default roll' },
	apiKey: { type: 'secret', scope: 'pub', side: 'extension' },
})

const dicePipeline = spec('chariot.dice-tray:roll-turn', { version: '1.2.0' })
	// The inlet lock is the pipeline's one subscription (R-4): answering the
	// standard genre's primary turn is what the manifest lists as a permission.
	.inlet('input', C.userMessage.v1(), {
		genre: use('core:genre/chat'),
		event: sessionEvents.messageRespond,
	})
	.task('roll', rollDice.v1({ notation: '1d20' }))
	.oracle('narrate', C.generateText.v1({ connection: slot.connection() }))
	.outlet('save', ($: any) => C.createMessage.v1({ text: $.narrate.text }))
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
	handlers: [
		handler(rollDice, async (i: any, ctx: any) =>
			ok({ main: 1, total: Math.floor(ctx.random() * 20) + 1 }),
		),
		// (input, ctx) too — the surface is argument 1 on every hook there is,
		// lifecycle included. Core sends no envelope for a moment you already
		// registered against, so argument 0 goes unread.
		lifecycleCallback('startup', async (_input, ctx) => {
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
		eventListener('core:event/session-created@1', async (input, ctx) => {
			const wrote = await ctx.storage.put(`seen/${input.event}`, true)
			// A write that would exceed quota comes back `err` with the usage
			// figures, rather than throwing or silently dropping.
			if (wrote.kind !== 'ok') {
				await ctx.storage.deleteAll('stats/')
				ctx.log('warn', 'pruned stats to stay under quota')
			}
			return ok(null)
		}),
		lifecycleCallback('uninstall', async (_input, ctx) => {
			// Best effort, for the state core cannot retire on our behalf.
			ctx.log('info', 'dice plugin removed')
			return ok(null)
		}),
	],
	components: [
		component({
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
		assert.equal(handlersOf(dicePlugin).length, 1)
		assert.equal(Object.keys(bindingsOf(dicePlugin))[0], 'chariot.dice-tray:roll@1')
	})

	test('a type under someone else’s namespace is refused, and says why it matters', () => {
		assert.throws(
			() =>
				defineExtension({
					slug: 'chariot.dice-tray',
					name: 'x',
					version: '1.0.0',
					handlers: [handler(C.rankHybrid.descriptor, async () => ok({}))],
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
				.inlet('input', C.userMessage.v1())
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
		import { defineExtension, handler, eventListener } from '@serene-pub/sdk'
		export default defineExtension({
			slug: 'chariot.dice-tray',
			handlers: [
				handler(rollDice, async (i, ctx) => { ctx.readCore('x'); return ok({}) }),
				eventListener('core:event/session-created@1', async (s) => { s.emit('k', 1); return ok(null) }),
			],
		})
	`

	test('permissions are compiled from what the code calls, not from what it declares', () => {
		const scan = scanSource([{ path: 'index.ts', text: source }])
		assert.deepEqual(scan.permissions, ['core:read', 'socket:emit'])
	})

	test('a computed declaration is an error, not a silent omission', () => {
		const dynamic = `
			const which = pickHook()
			eventListener(EVENTS[i], which)
			eventListener(isDev ? 'a' : 'b', h)
		`
		const scan = scanSource([{ path: 'bad.ts', text: dynamic }])
		const errs = scan.findings.filter((f) => f.code === 'E_DYNAMIC_DECLARATION')
		assert.ok(errs.length >= 1)
		assert.match(errs[0]!.fix, /core can never permit/)
	})

	test('a hook calling fetch() directly is refused, and pointed at an oracle\'s ctx.fetch', () => {
		const scan = scanSource([
			{ path: 'net.ts', text: `async function h() { const r = await fetch('https://x') }` },
		])
		const e = scan.findings.find((f) => f.code === 'E_DIRECT_NETWORK')!
		assert.ok(e)
		assert.match(e.fix, /from an oracle, through `ctx\.fetch`/)
		assert.match(e.fix, /A task or a query may not reach the network/)
		assert.match(e.fix, /plugin-permissions\.md#kind-oracle/)
	})

	test('strings and comments cannot fool the scanner', () => {
		const tricky = `
			// eventListener('commented-out@1', h)
			const s = "eventListener('in-a-string@1', h)"
			eventListener('core:event/session-created@1', h)
		`
		const scan = scanSource([{ path: 'tricky.ts', text: tricky }])
		assert.equal(scan.declared.eventListeners, 1)
	})
})

// ── 98 · The packager: assembly ────────────────────────────────────────────
describe('98 · compilePlugin', () => {
	const sources = [
		{
			path: 'index.ts',
			text: `
				export default defineExtension({ slug: 'chariot.dice-tray' })
				handler(rollDice, async (i, ctx) => ok({}))
				lifecycleCallback('startup', async (s) => { await s.storage.query({ prefix: 'stats/' }); return ok(null) })
				lifecycleCallback('uninstall', async (s) => { s.log('info', 'removed'); return ok(null) })
				eventListener('core:event/session-created@1', async (s) => { await s.storage.put('seen', true); return ok(null) })
				component({ slug: 'dice-result' })
			`,
		},
	]

	test("a node is as public as its handler — private by default, never said on the definition (R62)", () => {
		const withHandler = (h: ReturnType<typeof handler>) =>
			compilePlugin({
				sources: [
					{
						path: 'index.ts',
						text: `
							export default defineExtension({ slug: 'chariot.dice-tray' })
							handler(rollDice, async (i, ctx) => ok({}))
						`,
					},
				],
				extension: defineExtension({ slug: 'chariot.dice-tray', name: 'Dice', version: '1.0.0', handlers: [h] }),
			})
		const fn = async () => ok({ main: 1, total: 1 })
		const priv = withHandler(handler(rollDice, fn))
		assert.ok(priv.ok, renderFindings(priv.findings))
		assert.equal(priv.manifest!.nodeDefinitions[0]!.public, undefined)
		const pub = withHandler(handler(rollDice, fn, { visibility: 'public' }))
		assert.ok(pub.ok, renderFindings(pub.findings))
		assert.equal(pub.manifest!.nodeDefinitions[0]!.public, true)
		assert.equal((pub.manifest!.nodeDefinitions[0]!.declaration as any).public, true)
		const base = (rollDice as any).descriptor ?? rollDice
		const said = withHandler(handler({ ...base, public: true } as never, fn))
		assert.equal(said.ok, false)
		assert.equal(said.findings[0]!.code, 'E_PUBLIC_ON_DEFINITION')
		assert.match(said.findings[0]!.fix!, /visibility: 'public'/)
	})

	test('it produces a manifest and the pipeline documents', () => {
		const r = compilePlugin({ sources, extension: dicePlugin })
		assert.ok(r.ok, renderFindings(r.findings))
		assert.equal(r.documents.length, 1)
		assert.equal(r.manifest!.nodeDefinitions[0]!.id, 'chariot.dice-tray:roll@1')
		assert.equal(
			r.manifest!.nodeDefinitions[0]!.binding,
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

	test('every callable is named, and the manifest and the bundle name the same one', () => {
		// The name a hook is called by is the one thing an author never writes:
		// `handler(def, fn)` names a definition and a function, not an export.
		// So the manifest's names and the generated entry's exports come from
		// one derivation — asserted together here, because the failure they
		// exist to prevent is the two disagreeing (D-6b).
		const r = compilePlugin({ sources, extension: dicePlugin })
		assert.ok(r.ok, renderFindings(r.findings))
		assert.deepEqual(r.manifest!.hooks.nodeHandlers, {
			'chariot.dice-tray:roll@1': 'roll',
		})
		assert.deepEqual(r.manifest!.hooks.eventListeners, [
			{ event: 'core:event/session-created@1', hook: 'onSessionCreated' },
		])
		// A lifecycle callback's name is its moment and nothing else: the host
		// calls `startup` by that word, so a derived name would never run.
		const bindings = hookBindingsFor(dicePlugin.handlers)
		assert.deepEqual(
			bindings.filter((b) => b.kind === 'lifecycle-callback').map((b) => b.hookName),
			['startup', 'uninstall'],
		)
		const entry = pluginEntrySource(bindings, './index.js')
		for (const b of bindings) assert.match(entry, new RegExp(`"${b.hookName}":`))
	})

	test('a pipeline subscription is a permission, because it is a side effect a user consents to', () => {
		// The pipeline's inlet lock and the listener's event both surface — since
		// R-4 the lock IS the pipeline's subscription (`.on()` is gone).
		const r = compilePlugin({ sources, extension: dicePlugin })
		assert.ok(r.manifest!.permissions.includes('event:core:event/message-respond@1'))
		assert.ok(r.manifest!.permissions.includes('event:core:event/session-created@1'))
	})

	test('a locked pipeline alone yields `event:<inlet lock>` — no listener needed (R-4)', () => {
		// Before R-4 only `.on()` subscriptions surfaced as permissions; a
		// pipeline that ran on every primary turn listed nothing. The lock IS
		// the subscription now, so a package with no hooks at all still says
		// what it runs in response to (plans/30 §U3 review, W7).
		const lockedOnly = defineExtension({
			slug: 'chariot.dice-tray',
			name: 'Dice Tray',
			version: '1.2.0',
			handlers: [],
			pipelines: [dicePipeline],
		})
		const r = compilePlugin({
			sources: [
				{
					path: 'index.ts',
					text: `export default defineExtension({ slug: 'chariot.dice-tray' })`,
				},
			],
			extension: lockedOnly,
		})
		assert.ok(r.ok, renderFindings(r.findings))
		assert.deepEqual(
			r.manifest!.permissions.filter((p) => p.startsWith('event:')),
			['event:core:event/message-respond@1'],
		)
		assert.equal(r.manifest!.hooks.eventListeners.length, 0)
		// …and the consent screen's negative list agrees: it CAN run in
		// response to something you do.
		assert.ok(!cannotDo(r.manifest!).includes('cannot run in response to anything you do'))
	})

	test('a hook registered conditionally is caught by cross-checking the two halves', () => {
		// The AST sees three hook declarations; the built extension exposes one. That
		// means something is behind an `if`, and the manifest would understate the plugin.
		const half = defineExtension({
			slug: 'chariot.dice-tray',
			name: 'x',
			version: '1.0.0',
			handlers: [],
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
		assert.ok(!cant.includes('cannot render anything in the interface'), 'it ships a component')
		// A widget is shown its session's messages, so a plugin that renders
		// reads them — the list may not say otherwise.
		assert.ok(!cant.includes('cannot read your sessions, characters or messages'), 'its component reads messages')
		const headless = { ...r.manifest!, components: [], surfaces: undefined }
		assert.ok(cannotDo(headless).includes('cannot read your sessions, characters or messages'))
		// Asking for a widget scope is asking to read more: never "cannot read".
		const scoped = { ...headless, permissions: [...headless.permissions, 'widget:session:full'] }
		assert.ok(!cannotDo(scoped).includes('cannot read your sessions, characters or messages'))
	})

	// R1: `engines` is version ranges and nothing else; a template engine a
	// plugin ships is `templateEngines` (owner ruling 2026-09-26).
	test('a shipped template engine packages to `templateEngines`, and `engines` stays the range', () => {
		function renderMustache({ template, variables }: { template: string; variables: any }) {
			return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(variables[k] ?? ''))
		}
		const ext = defineExtension({
			slug: 'chariot.dice-tray',
			name: 'Dice Tray',
			version: '1.2.0',
			engines: { 'serene-pub': '>=0.7 <0.9' },
			templateEngines: {
				'chariot.dice-tray:template/mustache@1': renderMustache,
				'chariot.dice-tray:template/shout@1': ({ template }) => template.toUpperCase(),
			},
		})
		// Its own source: the describe's declares handlers this extension lacks.
		const own = [{ path: 'index.ts', text: "export default defineExtension({ slug: 'chariot.dice-tray' })" }]
		const r = compilePlugin({ sources: own, extension: ext })
		assert.deepEqual(r.findings, [])
		assert.deepEqual(r.manifest!.templateEngines, {
			'chariot.dice-tray:template/mustache@1': 'renderMustache',
			'chariot.dice-tray:template/shout@1': 'renderShout',
		})
		assert.deepEqual(r.manifest!.engines, { 'serene-pub': '>=0.7 <0.9' })
		// The bundle exports the very names the manifest gives.
		const entry = pluginEntrySource(hookBindingsFor(ext.handlers, ext.templateEngines), './index.js')
		assert.match(entry, /"renderMustache": __engine\("chariot\.dice-tray:template\/mustache@1"\)/)
		assert.match(entry, /"renderShout": __engine\("chariot\.dice-tray:template\/shout@1"\)/)
		// A plugin shipping none writes no key at all.
		assert.equal('templateEngines' in compilePlugin({ sources, extension: dicePlugin }).manifest!, false)
	})

	test('a template engine under `engines`, or outside the namespace, is refused by name', () => {
		const base = { slug: 'chariot.dice-tray', name: 'Dice Tray', version: '1.2.0' }
		assert.throws(
			() =>
				defineExtension({
					...base,
					engines: { 'chariot.dice-tray:template/mustache@1': 'render' } as any,
				}),
			/engines\['chariot\.dice-tray:template\/mustache@1'\] is a template engine id.*templateEngines/s,
		)
		assert.throws(
			() => defineExtension({ ...base, templateEngines: { 'other.x:template/m@1': () => '' } }),
			/not in this plugin's namespace — declare it as 'chariot\.dice-tray:template\/m@1'/,
		)
		assert.throws(
			() => defineExtension({ ...base, templateEngines: { mustache: () => '' } }),
			/'mustache'\] is not a template engine id/,
		)
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
				describeInletDefinition({
					id: 'chariot.crawl:inlet/crawl@1',
					ports: { out: { main: S.json } },
					sessionShape: { personas: { min: 1, max: 1 }, composer: 'text' },
				}),
			/declares a sessionShape but no i18n\.name/,
		)
		// The refusal came before the id was claimed, so fixing the declaration
		// and retrying works — an author is not locked out by their own typo.
		const fixed = describeInletDefinition({
			id: 'chariot.crawl:inlet/crawl@1',
			i18n: { name: { en: 'Dungeon Crawl' } },
			ports: { out: { main: S.json } },
			sessionShape: { personas: { min: 1, max: 1 }, composer: 'text' },
		})
		assert.equal(fixed.kind, 'inlet')
	})

	test('an inlet without a sessionShape is not a mode, and needs no title', () => {
		// summarizeRequest in core's own contracts is the precedent: a plumbing
		// inlet with no sessionShape and no title.
		const plumbing = describeInletDefinition({
			id: 'chariot.crawl:inlet/internal-tick@1',
			ports: { out: { main: S.json } },
		})
		assert.equal(plumbing.kind, 'inlet')
	})

	test('the packager warns when a mode ships without a description', () => {
		// The type registered in the first test: titled, undescribed.
		const crawl = allDefinitions().find((t) => t.id === 'chariot.crawl:inlet/crawl@1')!
		const ext = defineExtension({
			slug: 'chariot.crawl',
			name: 'Dungeon Crawl',
			version: '1.0.0',
			handlers: [handler(crawl, async () => ok({}))],
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

	test("a plugin's own hooks, or an old-SDK 'hooks' list, are refused rather than dropped (R54)", () => {
		const base = { __extension: true, slug: 'chariot.hooky', name: 'Hooky', version: '1.0.0' }
		const run = (hooks: unknown) =>
			compilePlugin({ sources: [{ path: 'index.ts', text: '' }], extension: { ...base, hooks } as never })
		const declared = run({ 'before-shout': { event: 'core:event/message-created@1' } })
		assert.equal(declared.ok, false)
		assert.match(declared.findings.find((f) => f.code === 'E_HOOKS_FIELD')!.fix ?? '', /cannot define its own hook points/)
		const oldList = run([])
		assert.match(oldList.findings.find((f) => f.code === 'E_HOOKS_FIELD')!.fix ?? '', /rename hooks: \[handler/)
	})

	test('a lifecycle callback for sidecarSpawn or scheduled is refused as not supported yet', () => {
		// Ruled 2026-09-26: the host calls every moment it declares, and these
		// two had no caller — so they left the declaration rather than stay as
		// callbacks that silently never run.
		const build = (moment: string) =>
			compilePlugin({
				sources: [{ path: 'index.ts', text: '' }],
				extension: defineExtension({
					slug: 'chariot.moments',
					name: 'Moments',
					version: '1.0.0',
					handlers: [lifecycleCallback(moment as never, async () => ok(null))],
				}),
			})
		for (const moment of ['sidecarSpawn', 'scheduled']) {
			const r = build(moment)
			assert.equal(r.ok, false, moment)
			const f = r.findings.find((x) => x.code === 'E_LIFECYCLE_MOMENT_UNSUPPORTED')
			assert.ok(f, `${moment}: ${renderFindings(r.findings)}`)
			assert.match(f.message, new RegExp(`'${moment}'\\) is not supported yet`))
		}
		assert.match(
			build('scheduled').findings.find((x) => x.code === 'E_LIFECYCLE_MOMENT_UNSUPPORTED')!.fix,
			/schedule-tick/,
		)
		// The moments the host does call build clean.
		for (const moment of ['startup', 'enable', 'disable', 'update', 'uninstall', 'shutdown'])
			assert.ok(build(moment).ok, moment)
	})

	test("a default export that is not a defineExtension() result is named, with the fix", () => {
		const r = compilePlugin({
			sources: [{ path: 'index.ts', text: 'export default { slug: "chariot.plain" }' }],
			extension: { slug: 'chariot.plain', name: 'Plain', version: '1.0.0' } as never,
		})
		assert.equal(r.ok, false)
		const f = r.findings.find((x) => x.code === 'E_NOT_EXTENSION')
		assert.ok(f, JSON.stringify(r.findings))
		assert.match(f!.fix ?? '', /export default defineExtension/)
	})

	test('an untitled mode from an older-SDK build is an error at the packager, not a blank card', () => {
		// Hand-built, because this SDK refuses the declaration outright — the
		// packager's check exists for extensions evaluated against an older one.
		const forged = {
			// Every defineExtension() result carries this marker, whatever SDK built it.
			__extension: true,
			slug: 'chariot.relic',
			name: 'Relic',
			version: '1.0.0',
			handlers: [
				{
					__decl: 'handler',
					visibility: 'private',
					runtime: 'process',
					handler: async () => ok({}),
					type: {
						id: 'chariot.relic:inlet/expedition@1',
						kind: 'inlet',
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
		const heist = describeInletDefinition({
			id: 'chariot.crawl:inlet/heist@1',
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
			handlers: [handler(heist, async () => ok({}))],
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
		assert.equal(bindingNameFor('core:oracle/generate-text@1'), 'generateText')
		assert.equal(bindingNameFor('chariot.dice-tray:roll@1'), 'roll')
		assert.deepEqual(parseDefinitionId('core:query/session-history@2'), {
			ns: 'core',
			kind: 'query',
			name: 'session-history',
			version: 2,
		})
	})

	test('generated output is readable TypeScript with the pin form at the call site', () => {
		const out = generateContracts(allDefinitions().slice(0, 3), { release: '0.6.0' })
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
				.inlet('input', C.userMessage.v1())
				.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
				.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
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
			nodes: [{ nodeKey: 'a', kind: 'oracle', result: 'ok', output: { text } }],
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
			.inlet('input', C.userMessage.v1())
			.gather('gather', { mode: 'parallel' }, (b) =>
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
			`eventListener(EVENTS[i], h)\nasync function f() { await fetch('https://x') }`,
		)
		const code = await main(['check', dir])
		assert.equal(code, 1, 'a plugin core would refuse must not exit 0 — CI is the whole point')
	})

	test('`check` on a clean plugin exits zero and lists the permissions it computed', async () => {
		await write(
			'src/index.ts',
			`export default defineExtension({ slug: 'demo.thing' })\neventListener('core:event/session-created@1', async (s) => { s.log('info', 'k') })`,
		)
		assert.equal(await main(['check', dir]), 0)
	})

	test('there is no `install` verb, because installing is an admin action inside SP', () => {
		// A CLI that could install is a CLI that can be scripted into installing.
		assert.equal(typeof main, 'function')
	})

	test('isEntryPoint matches process.argv[1] through a node_modules/.bin symlink', async () => {
		// npx and every package.json "scripts" entry invoke the CLI through a
		// node_modules/.bin symlink: argv[1] is the symlink path, import.meta.url
		// resolves to the real file. Regression for the bug where comparing those
		// raw meant the guard never fired and `main` silently never ran.
		const real = join(dir, 'real-bin.js')
		const link = join(dir, 'linked-bin.js')
		await write('real-bin.js', '// fixture entry module\n')
		await rm(link, { force: true })
		await symlink(real, link)
		assert.equal(isEntryPoint(link, pathToFileURL(real).href), true)
		assert.equal(isEntryPoint(undefined, pathToFileURL(real).href), false)
	})
})

/* ── 104 · one declaration, one build (D-1) ────────────────────────────────
 *
 * A genre-bearing plugin used to have to export itself twice — `announce()` for
 * the genre, the surfaces and the preset, `defineExtension` for the node
 * definitions and their handlers — and `serene-pub build` would take one export
 * and silently leave the other half out of the artifact. Both showcase plugins
 * carried that workaround in their entry module, with a paragraph of prose
 * explaining it.
 *
 * Imports sit inside the block rather than at the top of the file so this
 * section can be read, moved or removed whole.
 */

import { announce, AnnouncementError, genre, config as configOf } from '@serene-pub/sdk'
import { handler as defineHandler } from '@serene-pub/sdk'
import { readdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

/** A genre declared for one test, under the namespace that test's plugin uses. */
const testGenre = (ns: string, name = 'tally') =>
	genre(`${ns}:genre/${name}`, {
		name: { en: 'Tally' },
		family: 'game',
		events: { [sessionEvents.messageRespond]: { required: true } },
	})

const createFor = (ns: string, g: ReturnType<typeof testGenre>) =>
	spec(`${ns}:spec/create-session`, { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
		.build()

const respondFor = (ns: string, g: ReturnType<typeof testGenre>) =>
	spec(`${ns}:spec/respond`, { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
		.build()

describe('104 · defineExtension carries what only announce() could', () => {
	test('a genre, a surface, a preset and a config sit beside the handlers', () => {
		const ns = 'demo.d1-whole'
		const g = testGenre(ns)
		const create = createFor(ns, g)
		const respond = respondFor(ns, g)
		const shipped = configOf(respond, 'shipped', { label: 'Shipped' }, {})
		const e = defineExtension({
			slug: ns,
			name: 'Tally',
			version: '1.0.0',
			handlers: [
				defineHandler(
					pin(
						describeTaskDefinition({
							id: `${ns}:task/tally@1`,
							i18n: { name: { en: 'Tally' } },
							ports: { in: { text: S.text }, out: { main: S.json } },
						}),
					),
					async () => ok({ main: { words: 2 } }),
				),
			],
			pipelines: [create, respond],
			genres: [g],
			widgets: [
				widget({ id: 'tally', title: 'Tally', component: 'tally' }),
			],
			components: [component({ slug: 'tally', label: 'Tally', entry: 'components/tally.ts', framework: 'vanilla' })],
			configs: [shipped],
			prompts: [
				{
					nodeType: 'core:task/build-template-context',
					slot: 'prompts',
					slug: 'referee',
					label: 'Referee',
					fields: { systemPrompt: 'Count.' },
				},
			],
			presets: [
				{
					slug: 'tally',
					genre: g,
					label: 'Tally',
					bindings: [create, { spec: respond, config: shipped }],
				},
			],
			permissions: { storage: { quotaBytes: 4 * 1024 * 1024 } },
		})
		assert.equal(e.genres?.[0]?.id, `${ns}:genre/tally`)
		assert.equal(e.widgets?.[0]?.component, 'tally')
		assert.equal(e.presets?.[0]?.slug, 'tally')
		assert.equal(e.permissions?.storage?.quotaBytes, 4 * 1024 * 1024)
	})

	test("a genre under somebody else's namespace is refused, as a definition id is", () => {
		const foreign = genre('someone.else:genre/theirs', {
			name: { en: 'Theirs' },
			family: 'game',
		})
		assert.throws(
			() =>
				defineExtension({
					slug: 'demo.d1-foreign',
					name: 'Foreign',
					version: '1.0.0',
					genres: [foreign],
				}),
			(e: Error) =>
				e instanceof ExtensionError &&
				/genre 'someone.else:genre\/theirs' is owned by 'someone.else'/.test(e.message),
		)
	})

	test('a widget still spelling the retired `surface` is refused where the author is', () => {
		assert.throws(
			() =>
				defineExtension({
					slug: 'demo.d1-surface',
					name: 'Surface',
					version: '1.0.0',
					widgets: [
						{
							id: 'tally',
							title: 'Tally',
							surface: { kind: 'frame', pluginId: 'demo.d1-surface', entry: 'ui/tally.html' },
						} as never,
					],
				}),
			(e: Error) =>
				e instanceof ExtensionError &&
				/`surface` is gone/.test(e.message) &&
				/names no component/.test(e.message),
		)
	})

	test('a `surfaces.panels` list is refused and pointed at component widgets', () => {
		assert.throws(
			() =>
				defineExtension({
					slug: 'demo.d1-panels',
					name: 'Panels',
					version: '1.0.0',
					surfaces: { panels: [{ id: 'tally', entry: 'ui/tally.html' }] } as never,
				}),
			(e: Error) => e instanceof ExtensionError && /surfaces\.panels is gone/.test(e.message),
		)
	})

	test('a storage quota outside the band is refused, in the sandbox compiler’s words', () => {
		assert.throws(
			() =>
				defineExtension({
					slug: 'demo.d1-quota',
					name: 'Quota',
					version: '1.0.0',
					permissions: { storage: { quotaBytes: 1 } },
				}),
			/permissions.storage.quotaBytes must be 1024…268435456/,
		)
	})

	test('a network declaration naming no host is refused', () => {
		assert.throws(
			() =>
				defineExtension({
					slug: 'demo.d1-net',
					name: 'Net',
					version: '1.0.0',
					permissions: { network: { hosts: [] } },
				}),
			/permissions.network requires a non-empty hosts allowlist/,
		)
	})

	test('the same mistake gets the same sentence from announce() and defineExtension', () => {
		// One genre, no create pipeline (24 §3) — the law neither surface may
		// let through, declared once each way.
		const ns = 'demo.d1-same'
		const g = testGenre(ns)
		const sentence =
			`genre '${ns}:genre/tally' has no create pipeline — every genre needs exactly one ` +
			`spec answering '${sessionEvents.sessionCreated}' (24 §3)`

		let announced: string[] = []
		try {
			announce({ ns, author: 'x', title: 'Same' }).genres({ g }).build()
		} catch (e) {
			announced = (e as AnnouncementError).errors
		}

		let declared: string[] = []
		try {
			defineExtension({ slug: ns, name: 'Same', version: '1.0.0', genres: [g] })
		} catch (e) {
			declared = (e as Error).message.split('\n').map((l) => l.replace(/^\s*•\s*/, ''))
		}

		assert.ok(announced.includes(sentence), `announce() said: ${announced.join(' | ')}`)
		assert.ok(declared.includes(sentence), `defineExtension said: ${declared.join(' | ')}`)
	})
})

describe('104 · serene-pub build emits one artifact', () => {
	const outFor = (name: string) => join(tmpdir(), `sp-d1-${name}`)

	test('a package that is both halves builds to one manifest carrying both', async () => {
		const dir = join(FIXTURES, 'unified-plugin')
		const out = outFor('unified')
		await rm(out, { recursive: true, force: true })
		assert.equal(await main(['build', dir, '--out', out]), 0)

		const files = (await readdir(out)).sort()
		// `bundle.js` is the other half of the artifact (D-6b): the manifest is
		// what the package declares, the bundle is what the sandbox runs.
		// `components/` holds the panel's built component module.
		assert.deepEqual(files, ['bundle.js', 'components', 'manifest.json', 'pipelines'])
		// One artifact: the announcement's half rides in the manifest, because the
		// manifest is what an instance stores and every reader it has reads that.
		assert.equal(files.includes('announcement.json'), false)

		const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))

		// the defineExtension half
		assert.equal(m.slug, 'demo.unified')
		assert.equal(m.hooks.handlers[0].definitionId, 'demo.unified:task/tally@1')
		assert.equal(m.nodeDefinitions[0].id, 'demo.unified:task/tally@1')
		assert.equal(m.engines['serene-pub'], '>=0.7 <0.8')

		// the announcement half
		assert.deepEqual(
			m.genres.map((g: { id: string }) => g.id),
			['demo.unified:genre/tally'],
		)
		assert.equal(m.widgets[0].component, 'tally')
		assert.deepEqual(
			m.presets.map((p: { slug: string }) => p.slug),
			['tally'],
		)
		assert.deepEqual(
			m.configs.map((c: { slug: string }) => c.slug),
			['tally-default', 'tally-flavoured'],
		)
		assert.deepEqual(
			m.prompts.map((p: { slug: string }) => p.slug),
			['tally-referee'],
		)
		// A config over somebody else's spec is a requirement, never a bundle.
		assert.deepEqual(m.requires, ['core:spec/respond'])

		// the storage grant, in the flat taxonomy the app's permission model reads
		assert.ok(m.permissions.includes('storage:4194304'))
		assert.ok(m.permissions.includes(`event:${sessionEvents.messageRespond}`))

		// What a plugin cannot do is generated from the manifest so that it cannot
		// flatter — which cuts both ways once the manifest carries the surfaces: a
		// plugin whose whole UI is a frame does render, and saying otherwise on a
		// consent screen would be the one false line in a generated list.
		const cannot = cannotDo(m)
		assert.equal(cannot.includes('cannot render anything in the interface'), false)
		assert.ok(cannot.includes('cannot call a model or reach any external service'))

		// and the documents beside it, one per pipeline, exactly as before
		const docs = (await readdir(join(out, 'pipelines'))).sort()
		assert.deepEqual(docs, [
			'demo.unified_spec_create-session.json',
			'demo.unified_spec_respond.json',
		])

		// Which exported function implements the definition — the binding the
		// app's node bindings read, in the shape they read it (a map by pin).
		assert.deepEqual(m.hooks.nodeHandlers, {
			'demo.unified:task/tally@1': 'tallyHandler',
		})
		// The declaration the instance registers the definition FROM. The
		// summary beside it carries port names; a registry row needs the
		// shapes, and only the declaration has them.
		assert.deepEqual(m.nodeDefinitions[0].declaration.ports, {
			in: { text: 'core:shape/text@1' },
			out: { main: 'core:shape/json@1' },
		})
	})

	test('the bundle exports exactly the hooks the manifest names, and they run', async () => {
		const out = outFor('unified-bundle')
		await rm(out, { recursive: true, force: true })
		assert.equal(await main(['build', join(FIXTURES, 'unified-plugin'), '--out', out]), 0)
		const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
		const source = await readFile(join(out, 'bundle.js'), 'utf8')

		// Evaluated the way a backend evaluates it (QuickJsSandbox /
		// SesWorkerSandbox `buildProgram`): one CJS source handed a `module`
		// and an `exports`, with nothing else in scope. A plain `node:vm`
		// context is the honest stand-in — if the bundle needed a host global
		// neither backend endows, it would fail here too.
		const context = createContext({})
		const exported = runInContext(
			`(function () { var module = { exports: {} }; var exports = module.exports;\n` +
				`(function (module, exports) {\n${source}\n})(module, exports);\n` +
				`return module.exports; })()`,
			context,
		) as { hooks?: Record<string, unknown> }

		const named = [
			...Object.values(m.hooks.nodeHandlers as Record<string, string>),
			...(m.hooks.eventListeners as Array<{ hook: string }>).map((e) => e.hook),
			...(m.hooks.lifecycleCallbacks as Array<{ moment: string }>).map((l) => l.moment),
		].sort()
		assert.deepEqual(Object.keys(exported.hooks ?? {}).sort(), named)

		// And it is the author's function, not a stub with the right name: the
		// hook is called `(input, ctx)` and answers a `Result`, which is what
		// the sandbox transport carries back untouched.
		const hook = exported.hooks![m.hooks.nodeHandlers['demo.unified:task/tally@1']] as (
			input: unknown,
			ctx: unknown,
		) => Promise<{ kind: string; value: unknown }>
		const r = await hook(
			{ text: 'one two three' },
			{ random: () => 0.5, now: () => 0, log: () => {} },
		)
		// Through JSON, because that is how a hook's return actually crosses:
		// the value is a plain object from another realm, and comparing it
		// structurally would be comparing prototypes rather than the answer.
		assert.deepEqual(JSON.parse(JSON.stringify(r)), {
			kind: 'ok',
			value: { main: { words: 3 } },
		})
	})

	test('an announce-only package still builds byte-identically', async () => {
		const dir = join(FIXTURES, 'announce-package')
		const out = outFor('announce')
		await rm(out, { recursive: true, force: true })
		assert.equal(await main(['build', dir, '--out', out]), 0)

		const files = (await readdir(out)).sort()
		assert.deepEqual(files, ['announcement.json', 'pipelines'])
		assert.equal(files.includes('manifest.json'), false)

		// Byte-identical to what the builder's own document serializes to — the
		// announce path writes that and nothing else, before D-1 and after.
		const mod = await import(pathToFileURL(join(dir, 'src/index.ts')).href)
		const { document } = mod.default.build()
		assert.equal(
			await readFile(join(out, 'announcement.json'), 'utf8'),
			JSON.stringify(document, null, 2),
		)
	})

	test('check reports the same permissions whichever export a package defaults', async () => {
		// `check` is the static half and never looks at the default export, which
		// is what makes the answer the same on both build paths. Proven over one
		// body of code with the export swapped, rather than asserted.
		const text = await readFile(join(FIXTURES, 'unified-plugin', 'src', 'index.ts'), 'utf8')
		const asAnnouncement = text.replace(
			'export default extension',
			'export default announce({ ns: PLUGIN_SLUG, author: "x", title: "Tally" })',
		)
		assert.notEqual(asAnnouncement, text, 'the fixture must still end in a default export')
		assert.deepEqual(
			scanSource([{ path: 'src/index.ts', text: asAnnouncement }]).permissions,
			scanSource([{ path: 'src/index.ts', text }]).permissions,
		)
	})
})

/* ── 105 · what a sandbox cannot endow, what a frame cannot mount (D-2) ─────
 *
 * Four mistakes cost the plugin lanes more than everything else in this file
 * put together, and every one of them **packaged cleanly**. A plugin Query
 * whose `ctx.read` is endowed by nobody. A Task keeping state in a `storage`
 * a Task is not granted. An outlet declaring `effects: 'write'` when
 * `ctx.commit` is the executor's and not the sandbox's. An inline `<script>`
 * or a `<form>` in a frame document, both refused in silence by a CSP and a
 * sandbox attribute. Each was found by running the thing — at install, or in
 * the harness, hours later.
 *
 * The rule each test pins is not "the scanner matches this string": it is
 * that the author is told, at the line they wrote, in one sentence naming the
 * alternative. `fix` is asserted with the code for exactly that reason.
 *
 * Imports sit inside the block rather than at the top of the file so this
 * section can be read, moved or removed whole.
 */

import {
	DEFAULT_PERMISSION_IGNORES,
	declaredFrameEntries,
	frameEntriesIn,
	matchesGlob,
	scanFrameDocument,
} from '@serene-pub/cli'
import { frameDocumentsIn, sourcesIn } from '@serene-pub/cli/bin'

/**
 * One CLI run with its output in hand: here the findings *are* the product.
 *
 * The copy is taken **through** the real streams rather than instead of them.
 * A tap that swallowed stdout swallowed the test runner's own reporter with
 * it, and three passing tests simply stopped appearing in the output — which
 * is the most expensive kind of green there is.
 */
const cli = async (argv: string[]) => {
	const out: string[] = []
	const err: string[] = []
	const stdout = process.stdout.write.bind(process.stdout)
	const stderr = process.stderr.write.bind(process.stderr)
	process.stdout.write = ((c: never, ...rest: never[]) => (
		out.push(String(c)),
		stdout(c, ...rest)
	)) as never
	process.stderr.write = ((c: never, ...rest: never[]) => (
		err.push(String(c)),
		stderr(c, ...rest)
	)) as never
	try {
		const code = await main(argv)
		return { code, out: out.join(''), err: err.join('') }
	} finally {
		process.stdout.write = stdout
		process.stderr.write = stderr
	}
}

const fixtureSource = async (name: string) => [
	{
		path: 'src/index.ts',
		text: await readFile(join(FIXTURES, name, 'src', 'index.ts'), 'utf8'),
	},
]

const frameDoc = async (name: string) => ({
	path: `ui/${name}`,
	text: await readFile(join(FIXTURES, 'bad-frames', 'ui', name), 'utf8'),
})

/** The source line a finding points at — an address that is off by four is no address. */
const lineOf = (doc: { text: string }, f: { line: number }) =>
	doc.text.split('\n')[f.line - 1] ?? ''

describe('105 · what a plugin’s sandbox cannot endow', () => {
	test('reaching for `ctx.read` is refused, at the line that reaches', async () => {
		const findings = scanSource(await fixtureSource('plugin-query')).findings
		const f = findings.find((x) => x.code === 'E_PLUGIN_CTX_ENDOWMENT')
		assert.ok(
			f,
			`expected E_PLUGIN_CTX_ENDOWMENT, got ${findings.map((x) => x.code).join(', ')}`,
		)
		assert.equal(f.severity, 'error')
		assert.match(f.message, /reaches `ctx\.read`/)
		// The whole table in one sentence, so the author does not have to hold
		// the kind rules in their head to read the finding.
		assert.match(f.message, /endows `random, now, log, signal`/)
		assert.match(f.message, /never `read`, `call` or `commit`/)
		assert.match(f.fix, /an input port wired from a core query/)
		// The line, not the declaration: `read` is refused wherever it is written.
		const text = (await fixtureSource('plugin-query'))[0]!.text
		assert.match(text.split('\n')[f.line - 1]!, /ctx\.read\(/)
	})

	test('`ctx.call` and `ctx.commit` are the same refusal, with their own way back', () => {
		const scan = scanSource([
			{
				path: 'src/index.ts',
				text: [
					'export const a = async (i, ctx) => ctx.call({ prompt: i.text })',
					"export const b = async (i, ctx) => ctx.commit('messages', i.row)",
				].join('\n'),
			},
		])
		const codes = scan.findings.map((f) => f.code)
		assert.deepEqual(codes, ['E_PLUGIN_CTX_ENDOWMENT', 'E_PLUGIN_CTX_ENDOWMENT'])
		assert.match(scan.findings[0]!.fix, /Cross the network from an Oracle/)
		assert.match(scan.findings[1]!.fix, /Let a core outlet do the write/)
		assert.deepEqual(scan.endowments, ['call', 'commit'])
	})

	test('a plugin Query is a kind, not a mistake — it is how a plugin reads its own rows', async () => {
		// The rule was kind-based for an afternoon: every plugin Query refused.
		// `hookCtxGrants` hands a query `storage`, and the two Battleship nodes
		// that read a board became emit-class outlets that write nothing. The
		// fixture must build with no finding at all.
		const scan = scanSource(await fixtureSource('plugin-query-ok'))
		assert.deepEqual(scan.findings, [])
		assert.deepEqual(scan.endowments, [])
		assert.equal(await cli(['check', join(FIXTURES, 'plugin-query-ok')]).then((r) => r.code), 0)
	})

	test('a write-class outlet is refused, and told what `emit` still buys it', async () => {
		const f = scanSource(await fixtureSource('write-outlet')).findings.find(
			(x) => x.code === 'E_PLUGIN_WRITE_OUTLET',
		)
		assert.ok(f)
		assert.match(f.message, /demo\.write-outlet:outlet\/save-record@1 is a write-class outlet/)
		assert.match(f.fix, /effects: 'emit'/)
		// It may still hold its own rows: an author reading "you cannot write"
		// otherwise concludes a plugin cannot keep state at all, which is false.
		assert.match(f.fix, /its own storage/)
	})

	test('a Task that reaches for storage is refused, and the scan admits its grain', async () => {
		const f = scanSource(await fixtureSource('task-storage')).findings.find(
			(x) => x.code === 'E_PLUGIN_TASK_GRANT',
		)
		assert.ok(f)
		assert.match(f.message, /is a Task and the code declaring it reads `ctx\.storage`/)
		assert.match(f.fix, /granted no storage/)
		assert.match(f.fix, /plugin-permissions\.md#kind-task/)
		// Tying a handler to its definition lexically is not reliable, so the
		// static half says what it actually read and says where the precise
		// answer comes from. A finding that overstates what it knows is one an
		// author argues with.
		assert.match(f.fix, /lexical/)
		assert.match(f.fix, /to the next one/)
	})

	test('the region ends at the next definition, so a pure task beside one is not swept up', () => {
		// The rule was file-grained for an afternoon, and it refused the two pure
		// tasks in Battleship's `definitions.ts` because a *query* three hundred
		// lines up keeps a board. A rule an author cannot satisfy without moving
		// files is a rule they turn off.
		const scan = scanSource([
			{
				path: 'src/definitions.ts',
				text: [
					"export const keep = describeQueryDefinition({ id: 'demo.x:query/keep@1' })",
					'export const keepHandler = async (i, ctx) => ok({ main: await ctx.storage.get(`b`) })',
					"export const pure = describeTaskDefinition({ id: 'demo.x:task/pure@1' })",
					'export const pureHandler = async (i) => ok({ main: i.cast })',
				].join('\n'),
			},
		])
		assert.deepEqual(scan.findings, [])
	})

	test('the evaluated half reads the handler that was bound, and says so once', async () => {
		// `build` has the extension in hand, so it can name the handler rather
		// than the module — and must not then say the same thing twice about one
		// definition, which is what the finding's `id` is for.
		const dir = join(FIXTURES, 'task-storage')
		const sources = await fixtureSource('task-storage')
		const mod = await import(pathToFileURL(join(dir, 'src', 'index.ts')).href)
		const r = compilePlugin({ sources, extension: mod.default })
		const grants = r.findings.filter((f) => f.code === 'E_PLUGIN_TASK_GRANT')
		assert.equal(grants.length, 1, renderFindings(r.findings))
		assert.match(grants[0]!.message, /its handler reads `ctx\.storage`/)
		assert.equal(r.ok, false)
		assert.equal(r.manifest, undefined, 'a refused package emits no manifest')
	})

	test('the evaluated half says nothing the source already said at a better address', async () => {
		// `build` reads the bound handler's own source too. When the lexical half
		// has already named the line, this half stays quiet — one mistake, one
		// sentence, at the address an author can jump to.
		const dir = join(FIXTURES, 'plugin-query')
		const sources = await fixtureSource('plugin-query')
		const mod = await import(pathToFileURL(join(dir, 'src', 'index.ts')).href)
		const r = compilePlugin({ sources, extension: mod.default })
		const reaches = r.findings.filter((f) => f.code === 'E_PLUGIN_CTX_ENDOWMENT')
		assert.equal(reaches.length, 1, renderFindings(r.findings))
		assert.equal(r.ok, false)
	})

	test('a task that reaches for nothing is left alone', async () => {
		// The rule is about a grant, not about the word "task": the same scan
		// over a package that keeps no state must be silent, or an author learns
		// to ignore it.
		const scan = scanSource(await fixtureSource('noisy-examples'))
		assert.deepEqual(scan.findings, [])
	})

	test('`check` refuses a package with any of them, at the line', async () => {
		for (const name of ['plugin-query', 'task-storage', 'write-outlet']) {
			const r = await cli(['check', join(FIXTURES, name)])
			assert.equal(r.code, 1, `${name} must not exit 0 — CI is the whole point`)
			assert.match(r.out, /src\/index\.ts:\d+ /)
		}
		// … and accepts the two that are shaped the way the grant table says.
		for (const name of ['plugin-query-ok', 'local-handler'])
			assert.equal((await cli(['check', join(FIXTURES, name)])).code, 0, name)
	})
})

describe('105 · what a frame document cannot mount', () => {
	test('an inline script is named with its line, and told where to put it', async () => {
		const doc = await frameDoc('view.html')
		const f = scanFrameDocument(doc).find((x) => x.code === 'E_FRAME_INLINE_SCRIPT')
		assert.ok(f)
		assert.equal(f.file, 'ui/view.html')
		assert.match(lineOf(doc, f), /<script>/)
		assert.match(f.message, /script-src 'self'/)
		assert.match(f.message, /refused silently/)
		assert.match(f.fix, /a file beside the document/)
	})

	test('an off-package stylesheet and image are refused the same way', async () => {
		const doc = await frameDoc('view.html')
		const findings = scanFrameDocument(doc).filter(
			(x) => x.code === 'E_FRAME_EXTERNAL_RESOURCE',
		)
		assert.equal(findings.length, 2)
		assert.match(lineOf(doc, findings[0]!), /<link/)
		assert.match(lineOf(doc, findings[1]!), /<img/)
		// Both spellings of "somewhere else": https on the stylesheet, http on
		// the image. A rule that caught one would be a rule that caught neither.
		assert.match(findings[0]!.message, /https:\/\/cdn\.example\.com/)
		assert.match(findings[1]!.message, /http:\/\/example\.com/)
	})

	test('an off-package script is its own finding, because the fix is different', async () => {
		const doc = await frameDoc('panel.html')
		const f = scanFrameDocument(doc).find((x) => x.code === 'E_FRAME_EXTERNAL_SCRIPT')
		assert.ok(f)
		assert.match(lineOf(doc, f), /cdn\.example\.com/)
		assert.match(f.fix, /vendor the file beside the document/)
	})

	test('a form and a submit control are both refused, with the sandbox named', async () => {
		const doc = await frameDoc('page.html')
		const findings = scanFrameDocument(doc).filter((x) => x.code === 'E_FRAME_FORM')
		assert.equal(findings.length, 2)
		assert.match(lineOf(doc, findings[0]!), /<form/)
		assert.match(lineOf(doc, findings[1]!), /type="submit"/)
		for (const f of findings) assert.match(f.message, /allow-scripts/)
		assert.match(findings[0]!.fix, /a button and a key handler/)
		// The relative script beside the document is the legal form and stays legal.
		assert.equal(
			scanFrameDocument(doc).some((x) => x.code === 'E_FRAME_EXTERNAL_SCRIPT'),
			false,
		)
	})

	test('a document that does all of it the legal way produces nothing', async () => {
		// A relative stylesheet, a relative image, a relative module script, an
		// absolute one under the plugin's own route, `type="button"`, an inline
		// `<style>` (which the CSP allows) — and a `<form>` inside an HTML
		// comment, which is not a form.
		assert.deepEqual(scanFrameDocument(await frameDoc('ok.html')), [])
	})

	test('a document named through a constant is read too', () => {
		// Both showcase plugins name their surfaces through an exported constant,
		// which is the ordinary way to write it. An `entry:`-only scan would have
		// read those documents in `build` and not in `check` — the one command
		// an author runs before they have a build.
		assert.deepEqual(
			frameEntriesIn([
				{ path: 'src/genre.ts', text: "export const SESSION_VIEW = 'ui/session.html'" },
			]),
			['ui/session.html'],
		)
		// Somebody else's document is somebody else's business.
		assert.deepEqual(
			frameEntriesIn([
				{
					path: 'src/x.ts',
					text: "const a = 'https://example.com/i.html'\nconst b = '/i.html'",
				},
			]),
			[],
		)
	})

	test('both halves name the same documents, so `check` and `build` agree', async () => {
		const sources = [
			...(await fixtureSource('bad-frames')),
			{
				path: 'components/board.ts',
				text: await readFile(join(FIXTURES, 'bad-frames', 'components', 'board.ts'), 'utf8'),
			},
		]
		const mod = await import(
			pathToFileURL(join(FIXTURES, 'bad-frames', 'src', 'index.ts')).href
		)
		assert.deepEqual(frameEntriesIn(sources), [
			'ui/view.html',
			'ui/page.html',
			'ui/panel.html',
			'ui/ok.html',
		])
		// The evaluated `surfaces` name theirs; a component's `sp-frame`
		// documents are the lexical pass's, and both feed the one compile.
		assert.deepEqual(declaredFrameEntries(mod.default.surfaces), ['ui/view.html', 'ui/page.html'])
	})

	test('`check` reads the documents the source names, without evaluating it', async () => {
		const dir = join(FIXTURES, 'bad-frames')
		const { sources } = await sourcesIn(dir)
		const documents = await frameDocumentsIn(dir, frameEntriesIn(sources))
		// Walk order: the board component's documents, then the entry's.
		assert.deepEqual(
			documents.map((d) => d.path),
			['ui/panel.html', 'ui/ok.html', 'ui/view.html', 'ui/page.html'],
		)
		assert.deepEqual(
			[...new Set(documents.flatMap((d) => scanFrameDocument(d)).map((f) => f.code))].sort(),
			[
				'E_FRAME_EXTERNAL_RESOURCE',
				'E_FRAME_INLINE_SCRIPT',
				'E_FRAME_FORM',
				'E_FRAME_EXTERNAL_SCRIPT',
			].sort(),
		)
		const r = await cli(['check', dir])
		assert.equal(r.code, 1)
	})

	test('`build` refuses it too, because it is the same compile', async () => {
		const out = join(tmpdir(), 'sp-d2-bad-frames')
		await rm(out, { recursive: true, force: true })
		const r = await cli(['build', join(FIXTURES, 'bad-frames'), '--out', out])
		assert.equal(r.code, 1)
		assert.match(r.err, /E_FRAME_INLINE_SCRIPT/)
	})

	test('a declared document that is not on disk is not this pass’s finding', async () => {
		// `unified-plugin`'s component places `ui/tally.html` and ships no such file. The
		// shape of an entry is `surfaceFindings`'s business and a missing file is
		// the instance's; a third opinion here would refuse a package mid-move.
		const r = await cli(['check', join(FIXTURES, 'unified-plugin')])
		assert.equal(r.code, 0)
		assert.match(r.out, /compiled cleanly/)
	})
})

describe('105 · --ignore, and what a stand-in host is not', () => {
	test('a glob crosses directories only where it says so', () => {
		assert.equal(matchesGlob('**/*.test.ts', 'src/deep/thing.test.ts'), true)
		assert.equal(matchesGlob('**/*.test.ts', 'thing.test.ts'), true)
		assert.equal(matchesGlob('**/*.test.ts', 'thing.ts'), false)
		assert.equal(matchesGlob('examples/**', 'examples/fixtures.ts'), true)
		assert.equal(matchesGlob('examples/*', 'examples/deep/fixtures.ts'), false)
		assert.equal(matchesGlob('src/*.ts', 'src/index.ts'), true)
		assert.equal(matchesGlob('src/*.ts', 'src/ui/index.ts'), false)
	})

	test('a muted file still lints; it just stops speaking for the plugin', async () => {
		const example = {
			path: 'examples/fixtures.ts',
			text: await readFile(
				join(FIXTURES, 'noisy-examples', 'examples', 'fixtures.ts'),
				'utf8',
			),
		}
		// Read as the plugin's own code, this file asks for two of the strongest
		// grants there are …
		assert.deepEqual(scanSource([example]).permissions, ['core:write', 'provider:call'])
		// … and it is a stand-in nobody installs.
		assert.deepEqual(scanSource([{ ...example, permissions: false }]).permissions, [])
		assert.ok(DEFAULT_PERMISSION_IGNORES.includes('**/examples/**'))
		// The mute has an edge: a rule about the code itself still fires, or an
		// author could move a file under `test/` to escape one.
		assert.equal(
			scanSource([
				{
					path: 'test/net.ts',
					text: "async function h() { await fetch('https://x') }",
					permissions: false,
				},
			]).findings[0]?.code,
			'E_DIRECT_NETWORK',
		)
	})

	test('`check` on the package answers for the package, not for its examples', async () => {
		const dir = join(FIXTURES, 'noisy-examples')
		const { sources, ignored } = await sourcesIn(dir)
		// The file is still read, and still linted …
		assert.ok(sources.some((f) => f.path === 'examples/fixtures.ts'))
		assert.equal(sources.find((f) => f.path === 'examples/fixtures.ts')?.permissions, false)
		// … and the package asks for nothing, which is the true answer.
		assert.deepEqual(scanSource(sources).permissions, [])
		assert.deepEqual(ignored, ['**/examples/**'])
		const r = await cli(['check', dir])
		assert.equal(r.code, 0)
		// Said once, and named: an author who cannot see why a permission
		// stopped being reported has no way to guess.
		assert.match(r.out, /ignored: \*\*\/examples\/\*\*/)
	})

	test('--ignore drops the file outright, and is repeatable', async () => {
		const dir = join(FIXTURES, 'noisy-examples')
		const { sources, ignored } = await sourcesIn(dir, ['examples/**', '**/*.bak.ts'])
		assert.equal(
			sources.some((f) => f.path.startsWith('examples/')),
			false,
		)
		// Only the pattern that matched something is reported — a list nobody
		// pruned is a list nobody reads.
		assert.deepEqual(ignored, ['examples/**'])
		const r = await cli(['check', dir, '--ignore', 'examples/**', '--ignore', '**/*.bak.ts'])
		assert.equal(r.code, 0)
		assert.match(r.out, /ignored: examples\/\*\*/)
		assert.equal(r.out.includes('**/*.bak.ts'), false)
	})

	test('a file that imports from the SDK and not `handler` is calling its own', () => {
		// `handler` is an ordinary English word. A plugin's test looping over its
		// own bindings was read as eleven registrations against the extension's
		// ten, and `build` refused the package for registering hooks
		// conditionally — a mistake it had not made.
		const mine = [
			"import { bindingsOf } from '@serene-pub/sdk'",
			'for (const handler of handlers) handler(input, ctx)',
		].join('\n')
		assert.equal(scanSource([{ path: 'test/run.ts', text: mine }]).declared.handlers, 0)
		// The SDK's own form, in a file that imported it, still counts.
		const theirs = [
			"import { defineExtension, handler } from '@serene-pub/sdk'",
			'export default defineExtension({ handlers: [handler(tally, fn)] })',
		].join('\n')
		assert.equal(scanSource([{ path: 'src/index.ts', text: theirs }]).declared.handlers, 1)
	})

	test('an awaited call is a call, never a registration', () => {
		const text = 'for (const handler of hs) { await handler(input, ctx) }'
		assert.equal(scanSource([{ path: 'run.ts', text }]).declared.handlers, 0)
	})

	test('a stand-in declares nothing, whatever it calls', async () => {
		// Read as the plugin, this counts two registrations that are not there …
		const naive = {
			path: 'test/run.test.ts',
			text: 'for (const handler of hs) handler(i, ctx)\nhandler(a, b)',
		}
		assert.equal(scanSource([naive]).declared.handlers, 2)
		// … and read as what it is, none — along with no permission and no
		// sandbox refusal, because all three are statements about the plugin.
		assert.equal(scanSource([{ ...naive, permissions: false }]).declared.handlers, 0)
		assert.deepEqual(
			scanSource([
				{
					path: 'examples/fixtures.ts',
					text: "const ctx = { read: async () => [] }\nawait ctx.read('messages')",
					permissions: false,
				},
			]).findings,
			[],
		)
	})

	test('the incident, end to end: a package with a test beside it builds', async () => {
		const dir = join(FIXTURES, 'local-handler')
		const { sources } = await sourcesIn(dir)
		const spec = sources.find((f) => f.path.startsWith('test/'))
		assert.ok(spec, 'the fixture ships a test file beside the plugin')
		assert.equal(spec.permissions, false)
		assert.equal(scanSource(sources).declared.handlers, 2)
		const out = join(tmpdir(), 'sp-d2-local-handler')
		await rm(out, { recursive: true, force: true })
		const r = await cli(['build', dir, '--out', out])
		assert.equal(r.code, 0, r.err)
		assert.equal(r.err.includes('E_CONDITIONAL_REGISTRATION'), false)
	})

	test('nothing is said when nothing was left out', async () => {
		const r = await cli(['check', join(FIXTURES, 'unified-plugin')])
		assert.equal(r.out.includes('ignored:'), false)
	})
})
