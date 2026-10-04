/**
 * What a built component was built against (F1): the packager records the
 * host contract on each manifest component entry, the in-app compile carries
 * it in its fingerprint, and a host that has moved on refuses the component
 * with a sentence rather than mounting it into a failure.
 */
import { after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as esbuild from 'esbuild'
import * as svelte from 'svelte/compiler'
import {
	GLOBAL_ATTRIBUTES,
	HOST_ARIA_CURRENT,
	HOST_ARIA_LIVE,
	HOST_ELEMENTS_MAJORS,
	HOST_ELEMENTS_VERSION,
	HOST_INPUT_TYPES,
	HOST_VIEW_NAMES,
	HOST_WIDGET_PROTOCOLS,
	SP_HOST_ELEMENTS,
	WIDGET_PROTOCOL,
	componentBuiltAgainstFinding,
	currentBuiltAgainst,
	type HostElementSpec,
} from '@serene-pub/sdk'
import { main } from '../cli/src/bin.js'
import { builtAgainstOfFingerprint, compileComponentSource, toolchainFingerprint } from '../cli/src/componentCompile.js'
import { assertRefusedMount, mountComponent, test } from './harnessGuard.js'

const HERE = import.meta.dirname
const dirs: string[] = []
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

// ─── the vocabulary version ─────────────────────────────────────────────────

/**
 * The vocabulary's PUBLIC SHAPE, hashed — every tag's attributes, events,
 * slots, children and parts, and the closed value lists. `doc` is not shape.
 */
function vocabularyShapeHash(): string {
	const tags = Object.entries(SP_HOST_ELEMENTS as Record<string, HostElementSpec>)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([tag, s]) => [
			tag,
			[...s.attributes].sort(),
			[...s.events].sort(),
			[...(s.slots ?? [])].sort(),
			[...(s.children ?? [])].sort(),
			[...(s.parts ?? [])].sort(),
		])
	const lists = [GLOBAL_ATTRIBUTES, HOST_VIEW_NAMES, HOST_ARIA_CURRENT, HOST_ARIA_LIVE, HOST_INPUT_TYPES].map((l) => [...l].sort())
	return createHash('sha256').update(JSON.stringify({ tags, lists })).digest('hex')
}

/**
 * The shape each vocabulary version shipped with. Changing the vocabulary
 * fails the pin below: bump `HOST_ELEMENTS_VERSION` — MINOR when the shape
 * only grew, MAJOR when anything was removed, renamed or narrowed (and then
 * decide whether the host keeps mounting the old major) — and add its row.
 */
const SHAPE_AT_VERSION: Record<string, string> = {
	'1.0': 'cf02b3953642d5da060b3d85ecb08c604a046de78fc632d53e85216f8ac7f4c4',
	// 1.1 (lair re-plan S1): `sp-host-view` takes `channel`, the channel the
	// place is for. Grew only — a 1.0 component still mounts.
	'1.1': 'c90e51dcc1b384931721957cdab0f81cef19df066a0bf7768733cbec069ce972',
	// 1.2 (composer attachments, media strip): `img` takes `loading` and
	// `decoding` and raises `error`, so a strip draws a stand-in for a deleted
	// file. Grew only.
	'1.2': '0a2306d3abc5d451a5d37951ac79eca875476ae60ec88a939a2c572b903ed345',
	// 1.3 (composer attachments §3.3): `sp-file-picker` (the device's picker,
	// opened by its body's control) and `sp-drop-zone` (files dropped or
	// pasted), both raising `files`. Grew only.
	'1.3': '1085b6aa0b3bfed1ea4015dadae1cb6e3e73a32a8325d06685446693958f9fa1',
}

test('the host-element vocabulary version is pinned to its shape — change the table, bump the version', () => {
	const shape = vocabularyShapeHash()
	assert.equal(
		shape,
		SHAPE_AT_VERSION[HOST_ELEMENTS_VERSION],
		`the host-element vocabulary's shape changed (now ${shape}) but HOST_ELEMENTS_VERSION is still ` +
			`${HOST_ELEMENTS_VERSION}: bump its minor if the shape only grew, its major if anything was removed, ` +
			`renamed or narrowed, and pin the new shape under the new version`,
	)
	assert.match(HOST_ELEMENTS_VERSION, /^\d+\.\d+$/)
	assert.deepEqual([...HOST_ELEMENTS_MAJORS], [Number(HOST_ELEMENTS_VERSION.split('.')[0])])
	assert.deepEqual([...HOST_WIDGET_PROTOCOLS], [WIDGET_PROTOCOL])
})

// ─── the finding ────────────────────────────────────────────────────────────

test('a component built for a protocol the host does not speak is refused by name', () => {
	assert.equal(
		componentBuiltAgainstFinding({ widgetProtocol: 3, hostElements: '1.0' }, { widgetProtocols: [2] }),
		'built for widget protocol 3; this host speaks 2',
	)
	assert.equal(
		componentBuiltAgainstFinding({ widgetProtocol: 2, hostElements: '1.0' }, { widgetProtocols: [3] }),
		'built for widget protocol 2; this host speaks 3',
	)
	// A host that keeps an old protocol still mounts it.
	assert.equal(componentBuiltAgainstFinding({ widgetProtocol: 2, hostElements: '1.0' }, { widgetProtocols: [2, 3] }), undefined)
	assert.equal(
		componentBuiltAgainstFinding({ widgetProtocol: 1, hostElements: '1.0' }, { widgetProtocols: [2, 3] }),
		'built for widget protocol 1; this host speaks 2 or 3',
	)
})

test('a vocabulary major the host lacks is refused; a newer minor mounts', () => {
	const host = { hostElementsMajors: [1], hostElements: '1.4' }
	assert.equal(
		componentBuiltAgainstFinding({ widgetProtocol: WIDGET_PROTOCOL, hostElements: '2.0' }, host),
		'built for host-element vocabulary 2.0; this host has 1.4',
	)
	assert.equal(componentBuiltAgainstFinding({ widgetProtocol: WIDGET_PROTOCOL, hostElements: '1.9' }, host), undefined)
	assert.equal(componentBuiltAgainstFinding({ widgetProtocol: WIDGET_PROTOCOL, hostElements: '1.0' }, host), undefined)
	// A host that moved to major 2 and dropped 1.
	assert.equal(
		componentBuiltAgainstFinding({ widgetProtocol: WIDGET_PROTOCOL, hostElements: '1.0' }, { hostElementsMajors: [2], hostElements: '2.0' }),
		'built for host-element vocabulary 1.0; this host has 2.0',
	)
})

test('no record is a component from before it (compatible); an unreadable one is refused', () => {
	assert.equal(componentBuiltAgainstFinding(undefined), undefined)
	assert.equal(componentBuiltAgainstFinding(null), undefined)
	assert.match(componentBuiltAgainstFinding('2')!, /not readable/)
	assert.match(componentBuiltAgainstFinding([])!, /not readable/)
	assert.match(componentBuiltAgainstFinding({ hostElements: '1.0' })!, /names no widget protocol/)
	assert.match(componentBuiltAgainstFinding({ widgetProtocol: 2.5, hostElements: '1.0' })!, /names no widget protocol/)
	assert.match(componentBuiltAgainstFinding({ widgetProtocol: WIDGET_PROTOCOL })!, /names no host-element vocabulary/)
	assert.match(componentBuiltAgainstFinding({ widgetProtocol: WIDGET_PROTOCOL, hostElements: 'v1' })!, /names no host-element vocabulary/)
	// Today's own record passes today's host.
	assert.equal(componentBuiltAgainstFinding(currentBuiltAgainst()), undefined)
})

// ─── recorded where it is built ─────────────────────────────────────────────

test('serene-pub build records builtAgainst on every component entry', async () => {
	const out = await mkdtemp(join(tmpdir(), 'sp-built-against-'))
	dirs.push(out)
	assert.equal(await main(['build', resolve(HERE, 'fixtures', 'frozen-artifacts-source'), '--out', out]), 0)
	const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as {
		components: Array<{ slug: string; builtAgainst?: Record<string, unknown> }>
	}
	assert.deepEqual(
		m.components.map((c) => c.slug),
		['ledger', 'controls', 'counter'],
	)
	for (const c of m.components) {
		assert.equal(c.builtAgainst?.widgetProtocol, WIDGET_PROTOCOL, c.slug)
		assert.equal(c.builtAgainst?.hostElements, HOST_ELEMENTS_VERSION, c.slug)
		assert.match(String(c.builtAgainst?.sdk), /^\d+\.\d+\.\d+/, c.slug)
		assert.match(String(c.builtAgainst?.componentClient), /^\d+\.\d+\.\d+/, c.slug)
	}
})

test('an in-app compile returns builtAgainst, and its fingerprint carries it back', async () => {
	const r = await compileComponentSource({
		files: { 'c.ts': `import { defineComponent } from '@serene-pub/component-client'\nexport default defineComponent((root) => { root.append('hi') })\n` },
		entry: 'c.ts',
		framework: 'vanilla',
		mode: 'in-app',
		esbuild,
		svelte,
		resolveFrom: HERE,
	})
	assert.deepEqual(r.errors, [])
	assert.equal(r.builtAgainst.widgetProtocol, WIDGET_PROTOCOL)
	assert.equal(r.builtAgainst.hostElements, HOST_ELEMENTS_VERSION)
	assert.deepEqual(builtAgainstOfFingerprint(r.fingerprint), r.builtAgainst)
	assert.equal(r.fingerprint, toolchainFingerprint({ esbuild, svelte, resolveFrom: HERE }))
	assert.match(r.fingerprint, new RegExp(`widget-protocol@${WIDGET_PROTOCOL} host-elements@${HOST_ELEMENTS_VERSION.replace('.', '\\.')}`))
})

test('a fingerprint from before the record reads as none; a damaged one is refused', () => {
	const old = 'compiler@1 esbuild@0.28.0 svelte-compiler@5.0.0 svelte@5.0.0 sdk@0.6.0 component-client@0.6.0 controls@0.6.0'
	assert.equal(builtAgainstOfFingerprint(old), null)
	assert.equal(builtAgainstOfFingerprint(null), null)
	assert.equal(componentBuiltAgainstFinding(builtAgainstOfFingerprint(old)), undefined)
	const future = 'compiler@2 widget-protocol@3 host-elements@2.1 esbuild@0.30.0 sdk@1.4.0 component-client@1.4.0'
	assert.deepEqual(builtAgainstOfFingerprint(future), { widgetProtocol: 3, hostElements: '2.1', sdk: '1.4.0', componentClient: '1.4.0' })
	assert.match(componentBuiltAgainstFinding(builtAgainstOfFingerprint(future))!, /^built for widget protocol 3; this host speaks 2$/)
	assert.match(componentBuiltAgainstFinding(builtAgainstOfFingerprint('compiler@2 widget-protocol@x'))!, /names no widget protocol/)
})

// ─── the harness refuses as a host does ─────────────────────────────────────

test('the harness refuses to mount a component built for a protocol this host does not speak', async () => {
	const entry = resolve(HERE, 'fixtures', 'frozen-artifacts', '2026-09-26', 'counter.js')
	// Refused, never mounted: a mount that succeeds is unmounted before the
	// test fails, or its worker would keep this file's process alive forever.
	await assertRefusedMount(
		mountComponent({ root: HERE, entry, built: true, builtAgainst: { widgetProtocol: WIDGET_PROTOCOL + 1, hostElements: HOST_ELEMENTS_VERSION } }),
		new RegExp(`the component is not mounted: built for widget protocol ${WIDGET_PROTOCOL + 1}; this host speaks ${WIDGET_PROTOCOL}`),
	)
	await assertRefusedMount(
		mountComponent({ root: HERE, entry, built: true, builtAgainst: { widgetProtocol: WIDGET_PROTOCOL, hostElements: '99.0' } }),
		new RegExp(`built for host-element vocabulary 99\\.0; this host has ${HOST_ELEMENTS_VERSION.replace('.', '\\.')}`),
	)
})
