/**
 * The kit's package cases, run the way a plugin runs them over its BUILT
 * artifact (C30 parity, C31–C33): core's messages widget against a clone of
 * it, every listed module mounted in a plugin's box, every swap fitted to
 * the node it stands in for, and every swapped-in definition's handler put
 * through the binding probes. Each case is shown failing on the shape it
 * exists to catch. No DOM node is compared — text, attributes and verdicts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { describeTaskDefinition, S, type Descriptor } from '@serene-pub/sdk'
import '@serene-pub/contracts'
import { coreSpec, CHAT_TURN_ORDER_SPEC_ID, TURN_ORDER_BY_GENRE } from '@serene-pub/core-catalog'
import {
	COMPONENT_PROTOCOL_FIXTURE,
	PACKAGE_REQUIREMENTS,
	componentParityCase,
	componentParitySections,
	conform,
	conformPackage,
	componentsFromManifest,
	definitionFromManifest,
	hooksFromBundle,
	manifestSeams,
	pinnedDefinitionIn,
	renderConformance,
	swapsFromManifest,
	type ComponentView,
	type HostUnderTest,
	type PackageManifestLike,
} from '../conformance/src/index.js'
import { summarizeDefinition } from '../cli/src/codegen.js'
import { mountComponent } from './harnessGuard.js'
import { compileCoreSource, mountCode } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const STRATEGY_NODE = TURN_ORDER_BY_GENRE.find((t) => t.spec === CHAT_TURN_ORDER_SPEC_ID)!.strategyNode

/* ── C30 parity: core's messages widget against a clone ────────────────── */

/** Core's own copy, in core's box, from its source — as core's page mounts it. */
const mountNative = () =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: componentParitySections() as never,
	})

let cloneCode: Promise<string> | undefined
/** The clone: `messages.source.json` compiled in-app, exactly as a clone is built before anyone edits it. */
const messagesClone = () =>
	(cloneCode ??= compileCoreSource('messages').then((b) => {
		if (b.errors.length) throw new Error(JSON.stringify(b.errors))
		return b.code
	}))
/** …mounted in a plugin's box, holding the scope a messages clone declares. */
const mountClone = async () =>
	mountCode(await messagesClone(), componentParitySections(), { grants: ['session:full'], timeoutMs: 60_000 })

test('C30 parity passes on core’s messages widget against a clone, editing through the page’s field', { timeout: 240_000 }, async () => {
	const native = await mountNative()
	const remote = await mountClone()
	try {
		// The field the case drives is the page's, in both copies.
		await componentParityCase(native, remote)
		for (const v of [native, remote])
			assert.deepEqual(
				v.invoked.filter((i) => i.key === 'edit'),
				[{ key: 'edit', messageId: 2, payload: { content: 'Hi, friend!' } }],
			)
	} finally {
		await native.unmount()
		await remote.unmount()
	}
})

test('C30 parity fails when typing never reaches the clone’s field, and names what is missing', { timeout: 240_000 }, async () => {
	const native = await mountNative()
	const remote = await mountClone()
	try {
		// The page raises nothing: the edit stays clean, Save stays disabled, the field stays open.
		const deafField: ComponentView = Object.assign(Object.create(remote), { dispatch: async () => {} })
		await assert.rejects(componentParityCase(native, deafField), /Save left the field open \(remote\)/)
	} finally {
		await native.unmount()
		await remote.unmount()
	}
	const native2 = await mountNative()
	const remote2 = await mountClone()
	try {
		// A view that cannot raise the page field's events is told so, not failed on a textarea it lacks.
		const noDispatch: ComponentView = Object.assign(Object.create(remote2), { dispatch: undefined })
		await assert.rejects(componentParityCase(native2, noDispatch), /offers no dispatch\(\)/)
	} finally {
		await native2.unmount()
		await remote2.unmount()
	}
})

/* ── C31: a package's own modules, each mounted in a plugin's box ───────── */

const CLEAN = `export default (root, ctx) => {
	const p = document.createElement('p')
	p.textContent = String((ctx.messages ?? []).length) + ' messages'
	root.append(p)
	return ctx.subscribe(() => { p.textContent = String((ctx.messages ?? []).length) + ' messages' })
}
`
const RAISES = `export default (root, ctx) => {
	root.append(document.createElement('p'))
	ctx.error('the tally could not read its state')
}
`

const componentHost = (components: Array<{ id: string; code: string; grants?: string[]; reads?: string[] }>): HostUnderTest =>
	({
		name: 'a package on the SDK harness',
		components: () => components,
		mountComponent: (code, sections, opts) => mountCode(code, sections, { ...opts, timeoutMs: 60_000 }),
	}) as HostUnderTest

test('C31 mounts every listed module in a plugin’s box — clean modules pass, with the grants each names', { timeout: 120_000 }, async () => {
	const [c31] = await conformPackage(
		componentHost([
			{ id: 'plain', code: CLEAN },
			{ id: 'plain-granted', code: CLEAN, grants: ['session:full'] },
		]),
		['C31'],
	)
	assert.equal(c31!.pass, true, c31!.error)
	assert.equal(c31!.skipped, undefined)
})

/**
 * What C30's parity half cannot see: an UNEDITED clone of core's messages
 * widget renders and edits the same as core's copy, and still places the
 * page's own views (`sp-host-view`), which a plugin's box refuses. A clone
 * must drop them (the Twenty Questions Question log does); C31 says so.
 */
test('C31 refuses an unedited clone of core’s messages widget in a plugin’s box — it places core’s host views', { timeout: 240_000 }, async () => {
	const [c31] = await conformPackage(
		componentHost([{ id: 'question-log', code: await messagesClone(), grants: ['session:full'] }]),
		['C31'],
	)
	assert.equal(c31!.pass, false)
	assert.match(c31!.error!, /component 'question-log': the page refused what it placed — <sp-host-view> is core's/)
})

test('C31 fails on a module the page refuses, and on one that raises an error, naming each', { timeout: 120_000 }, async () => {
	const [c31] = await conformPackage(
		componentHost([
			{ id: 'plain', code: CLEAN },
			{ id: 'sneaky', code: COMPONENT_PROTOCOL_FIXTURE },
			{ id: 'grumpy', code: RAISES },
		]),
		['C31'],
	)
	assert.equal(c31!.pass, false)
	assert.match(c31!.error!, /component 'sneaky': the page refused what it placed — .*script/)
	assert.match(c31!.error!, /component 'grumpy': it raised an error 'the tally could not read its state'/)
	assert.doesNotMatch(c31!.error!, /'plain'/)
})

/**
 * A module that needs the log: it draws the count as sections arrive, and
 * once its settings come — the page posts them after the log — a log that
 * never came is its error.
 */
const NEEDS_LOG = `export default (root, ctx) => {
	const p = document.createElement('p')
	root.append(p)
	const draw = () => { p.textContent = String((ctx.messages ?? []).length) + ' messages' }
	draw()
	return ctx.subscribe((section) => {
		draw()
		if (section === 'settings' && ctx.messages === undefined) ctx.error('the log never came')
	})
}
`

test('C31 mounts each module with only the base sections it declares it reads (R75)', { timeout: 120_000 }, async () => {
	const [declared] = await conformPackage(
		componentHost([{ id: 'log-reader', code: NEEDS_LOG, reads: ['messages', 'settings'] }]),
		['C31'],
	)
	assert.equal(declared!.pass, true, declared!.error)
	// Declares it reads settings only: the page never hands it the log, and it breaks.
	const [undeclared] = await conformPackage(componentHost([{ id: 'log-reader', code: NEEDS_LOG, reads: ['settings'] }]), ['C31'])
	assert.equal(undeclared!.pass, false)
	assert.match(undeclared!.error!, /component 'log-reader': it raised an error 'the log never came' on mount/)
})

test("componentsFromManifest: each module with its widgets' scopes and reads", async () => {
	const out = await componentsFromManifest(
		{
			slug: 'acme',
			components: [
				{ slug: 'log', entry: 'dist/log.js' },
				{ slug: 'tally', entry: 'dist/tally.js' },
				{ slug: 'loose', entry: 'dist/loose.js' },
				{ slug: 'orphan', entry: 'dist/orphan.js' },
			],
			widgets: [
				{ id: 'log', component: 'log', scopes: ['session:full', 'channel:ooc'], reads: ['messages'] },
				{ id: 'log-mini', component: 'log', reads: ['settings', 'messages'] },
				{ id: 'tally', component: 'tally', reads: [] },
				{ id: 'loose-a', component: 'loose', reads: ['messages'] },
				{ id: 'loose-b', component: 'loose' },
			],
		},
		(entry) => `// ${entry}`,
	)
	assert.deepEqual(out, [
		{ id: 'log', code: '// dist/log.js', grants: ['session:full'], reads: ['messages', 'settings'] },
		{ id: 'tally', code: '// dist/tally.js', reads: [] },
		// One of its widgets reads everything, so it is mounted with everything.
		{ id: 'loose', code: '// dist/loose.js' },
		// No widget renders it: every base section, no grants.
		{ id: 'orphan', code: '// dist/orphan.js' },
	])
})

/* ── C30's parity half: only for a package that ships a clone of core's messages ── */

/** A package listing these modules, with no mount and no native/remote pair of its own. */
const listingHost = (components: Array<{ id: string; code: string; basedOn?: string }>): HostUnderTest =>
	({ name: 'a package that lists its modules', components: () => components }) as HostUnderTest

test('C30: a package with no component based on core’s messages is not applicable on the parity half — neither skipped nor failed', async () => {
	const [c30] = await conformPackage(listingHost([{ id: 'plain', code: CLEAN }]), ['C30'])
	assert.equal(c30!.pass, true, c30!.error)
	assert.equal(c30!.notApplicable?.length, 1)
	assert.match(c30!.notApplicable![0]!, /no component the host lists is based on core's messages widget/)
	// The only hole left is the mount it was not handed; the parity half is not among the skips.
	assert.equal(c30!.skipped?.length, 1)
	assert.doesNotMatch(c30!.skipped!.join(' '), /componentParity/)
	assert.match(renderConformance([c30!]), /— not applicable: no component the host lists is based on core's messages widget/)
})

test('C30: a package shipping a clone of core’s messages with no native/remote pair is skipped on the parity half, naming the clone', async () => {
	const [c30] = await conformPackage(
		listingHost([
			{ id: 'plain', code: CLEAN },
			{ id: 'my-log', code: CLEAN, basedOn: 'messages' },
		]),
		['C30'],
	)
	assert.equal(c30!.pass, true, c30!.error)
	assert.equal(c30!.notApplicable, undefined)
	assert.match(c30!.skipped!.join(' '), /'my-log' is based on core's messages .*supply `componentParity\(\)`/)
})

test('C30: a host that lists no components keeps the parity half skipped, as before', async () => {
	const [c30] = await conformPackage({ name: 'bare' } as HostUnderTest, ['C30'])
	assert.equal(c30!.pass, true)
	assert.equal(c30!.notApplicable, undefined)
	assert.match(c30!.skipped!.join(' '), /supply `componentParity\(\)`/)
})

test('componentsFromManifest carries the core component a module is based on', async () => {
	const out = await componentsFromManifest(
		{
			slug: 'acme',
			components: [
				{ slug: 'my-log', entry: 'dist/my-log.js', basedOn: { component: 'messages' } },
				{ slug: 'tally', entry: 'dist/tally.js' },
			],
		},
		(entry) => `// ${entry}`,
	)
	assert.deepEqual(out, [
		{ id: 'my-log', code: '// dist/my-log.js', basedOn: 'messages' },
		{ id: 'tally', code: '// dist/tally.js' },
	])
})

test('C31 without the seams is skipped with the seam named', async () => {
	const [c31] = await conformPackage({ name: 'bare' } as HostUnderTest, ['C31'])
	assert.equal(c31!.pass, true)
	assert.match(c31!.skipped!.join(), /supply `components\(\)`/)
})

/* ── C32, C33: a package's swaps, off a manifest the compiler's projection wrote ── */

const strategyPorts = (out: Record<string, unknown> = { main: S.turnEntries, order: S.turnEntries }) => ({
	in: { candidates: S.turnCandidates, messages: S.messages },
	out,
})
const firstUp = describeTaskDefinition({
	id: 'acme.turns:task/turn-first-up@1',
	i18n: { name: { en: 'First up' } },
	timeoutMs: 1000,
	ports: strategyPorts(),
} as never) as Descriptor
const halfWired = describeTaskDefinition({
	id: 'acme.turns:task/turn-half-wired@1',
	i18n: { name: { en: 'Half wired' } },
	timeoutMs: 1000,
	ports: strategyPorts({ main: S.turnEntries }),
} as never) as Descriptor
const bare = describeTaskDefinition({
	id: 'acme.turns:task/turn-bare@1',
	i18n: { name: { en: 'Bare' } },
	timeoutMs: 1000,
	ports: strategyPorts(),
} as never) as Descriptor

/** The handler bundle, as the packager writes it: self-contained CommonJS, handlers under `hooks`. */
const BUNDLE = `
const ok = (value) => ({ kind: 'ok', value })
module.exports = { hooks: {
	turnFirstUpHandler: (input, ctx) => {
		const order = (input.candidates || []).slice(0, 1).map((c) => ({ ref: c.ref, via: 'strategy' }))
		return ok({ main: order, order })
	},
	turnBareHandler: (input) => (input.candidates || []).map((c) => c.ref),
} }
`

/** A manifest the way the compiler projects one — `summarizeDefinition`, then JSON, as it lands on disk. */
const manifestWith = (swaps: PackageManifestLike['swaps'], defs: Descriptor[]): PackageManifestLike =>
	JSON.parse(
		JSON.stringify({
			slug: 'acme.turns',
			swaps,
			nodeDefinitions: defs.map(summarizeDefinition),
			hooks: { nodeHandlers: { [firstUp.id]: 'turnFirstUpHandler', [bare.id]: 'turnBareHandler' } },
		}),
	)

const swapHost = (m: PackageManifestLike): HostUnderTest =>
	({
		name: `${m.slug} (built), on the SDK reference executor`,
		...manifestSeams(m, BUNDLE),
		// Core's own spec, resolved in this SDK's registry: what the swap stands in for.
		pinnedDefinition: (spec: string, node: string) => pinnedDefinitionIn(coreSpec(spec)?.build(), node),
	}) as unknown as HostUnderTest

test('the manifest carries full port shapes: definitionFromManifest reads the declaration, never the names', () => {
	const [entry] = manifestWith([], [firstUp]).nodeDefinitions!
	// The audit summary is names only…
	assert.deepEqual(entry!.ports, { in: ['candidates', 'messages'], out: ['main', 'order'] })
	// …the declaration is the descriptor the builder judged.
	const d = definitionFromManifest(entry!)
	assert.equal(d.id, firstUp.id)
	assert.deepEqual(Object.keys(d.ports.in!).sort(), ['candidates', 'messages'])
	assert.equal(String(d.ports.in!.candidates), 'core:shape/turn-candidates@1')
	// A pre-D-6b entry (no declaration) is refused in a sentence.
	assert.throws(() => definitionFromManifest({ ...entry!, declaration: undefined }), /carries no declaration .* Re-package/)
	assert.throws(
		() => definitionFromManifest({ ...entry!, declaration: { ...entry!.declaration!, id: 'acme.turns:task/other@1' } }),
		/carries the declaration of 'acme.turns:task\/other@1'/,
	)
})

test('C32 and C33 pass on a strategy that fits core’s chat turn order and behaves as a hook', async () => {
	const m = manifestWith([{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: firstUp.id }], [firstUp])
	const results = await conformPackage(swapHost(m), ['C32', 'C33'])
	for (const r of results) {
		assert.equal(r.pass, true, `${r.id}: ${r.error}`)
		assert.equal(r.skipped, undefined, `${r.id}: ${r.skipped}`)
	}
})

test('C32 fails on a misfit, a node the host does not seat, and a definition the package does not declare', async () => {
	const m = manifestWith(
		[
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: halfWired.id },
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: 'strategy', definition: firstUp.id },
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: 'acme.turns:task/turn-ghost@1' },
		],
		[firstUp, halfWired],
	)
	const [c32] = await conformPackage(swapHost(m), ['C32'])
	assert.equal(c32!.pass, false)
	assert.match(c32!.error!, /turn-half-wired@1' cannot stand in for 'decide\.rules\.strategy': a swap must match/)
	assert.match(c32!.error!, /this host seats nothing at 'strategy'/)
	assert.match(c32!.error!, /declares no definition 'acme\.turns:task\/turn-ghost@1'/)
})

test('C33 fails on a strategy that returns a bare value, and on one with no handler, naming the probe', async () => {
	const m = manifestWith(
		[
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: bare.id },
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: halfWired.id },
		],
		[bare, halfWired],
	)
	const [c33] = await conformPackage(swapHost(m), ['C33'])
	assert.equal(c33!.pass, false)
	assert.match(c33!.error!, /'acme\.turns:task\/turn-bare@1' B1 \(returns a discriminated result/)
	assert.match(c33!.error!, /turn-half-wired@1': the host has no handler/)
})

test('C33 skips a definition reading a shape the kit has no sample for, unless the host supplies probeInput', async () => {
	const odd = describeTaskDefinition({
		id: 'acme.turns:task/turn-odd@1',
		i18n: { name: { en: 'Odd' } },
		timeoutMs: 1000,
		ports: { in: { cast: S.sessionCast }, out: { main: S.turnEntries } },
	} as never) as Descriptor
	const m = manifestWith([{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: odd.id }], [odd])
	m.hooks!.nodeHandlers![odd.id] = 'turnFirstUpHandler'
	const [skipped] = await conformPackage(swapHost(m), ['C33'])
	assert.equal(skipped!.pass, true)
	assert.match(skipped!.skipped!.join(), /no sample for \(cast: core:shape\/session-cast@1\) — supply `probeInput\(d\)`/)
	const [probed] = await conformPackage({ ...swapHost(m), probeInput: () => ({ cast: {} }) }, ['C33'])
	assert.equal(probed!.pass, true, probed!.error)
	assert.equal(probed!.skipped, undefined)
})

test('the package seams: hooksFromBundle refuses a require, swapsFromManifest carries the declaration', () => {
	assert.throws(() => hooksFromBundle(`require('fs')`), /asked for 'fs' — a bundle must be self-contained/)
	assert.deepEqual(Object.keys(hooksFromBundle(BUNDLE)).sort(), ['turnBareHandler', 'turnFirstUpHandler'])
	const [s] = swapsFromManifest(manifestWith([{ spec: CHAT_TURN_ORDER_SPEC_ID, node: STRATEGY_NODE, definition: firstUp.id }], [firstUp]))
	assert.equal(s!.definition?.id, firstUp.id)
})

test('conformPackage runs the package cases only, and refuses a host case by name', async () => {
	const results = await conformPackage({ name: 'bare' } as HostUnderTest)
	assert.deepEqual(results.map((r) => r.id), [...PACKAGE_REQUIREMENTS])
	assert.throws(() => conformPackage({ name: 'bare' } as HostUnderTest, ['C1']), /C1 judge a host's executor/)
	await assert.rejects(conform({ name: 'bare' } as HostUnderTest, {} as never, { only: ['C99'] }), /no requirement C99/)
})
