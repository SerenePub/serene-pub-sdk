/**
 * FROZEN OLD ARTIFACTS (F1): components built ONCE, with the toolchain of
 * their day, committed as built JS beside their manifest entries under
 * `fixtures/frozen-artifacts/<date>/` — and mounted every run against TODAY's
 * host rules (the harness is the page's receiver, vocabulary, gates and
 * worker runtime). A component compiled today must keep working for a year
 * as core updates; this is the test that says so.
 *
 * ⚠ NEVER REBUILD THESE FIXTURES TO MAKE THIS TEST PASS. A failure here means
 * a host change broke year-old components: fix the host (keep speaking the
 * old protocol, keep the old vocabulary major in `HOST_ELEMENTS_MAJORS`), or
 * — when the break is deliberate and ruled — say so by bumping the protocol
 * or the vocabulary major, so the host REFUSES these by name instead of
 * mounting them broken, and assert that refusal here. The artifacts' hashes
 * are pinned below so a rebuild cannot pass silently.
 *
 * New fixtures are ADDED under a new dated directory (build
 * `fixtures/frozen-artifacts-source` with `serene-pub build` and copy the
 * modules and their entries); old ones are never replaced.
 *
 * Text checks only — what a person would read — never DOM-node asserts.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { componentBuiltAgainstFinding, componentModuleFindings } from '@serene-pub/sdk'
import { mountComponent, test, type MountComponentOptions } from './harnessGuard.js'

const FROZEN = resolve(import.meta.dirname, 'fixtures', 'frozen-artifacts', '2026-09-26')

interface FrozenEntry {
	slug: string
	entry: string
	framework: string
	builtAgainst?: unknown
}
const manifest = JSON.parse(readFileSync(join(FROZEN, 'manifest.json'), 'utf8')) as {
	package: string
	components: FrozenEntry[]
}
const entryOf = (slug: string): FrozenEntry => {
	const e = manifest.components.find((c) => c.slug === slug)
	if (!e) throw new Error(`no frozen component '${slug}'`)
	return e
}

/** The committed bytes, by sha256 — a rebuilt fixture fails here, by name, before anything mounts. */
const PINNED: Record<string, string> = {
	'ledger.js': 'a3edc9bf9aee0332cb221b33ed16d7e05f5e3549d9e57119fa1317a01c4d13d8',
	'controls.js': 'cf6c96738248c156db3b96a5bb1a950bea3df7091573d5929cd63871d727d071',
	'counter.js': '9f7af6b4c5d3bb4f906a16ebd12e3fcb6e67864e24f0062b48b70643ba1f4704',
}

/** Mount a frozen module byte for byte, judged first as a host judges its manifest entry. */
const mountFrozen = (slug: string, opts: Omit<MountComponentOptions, 'entry' | 'built' | 'builtAgainst'> = {}) => {
	const e = entryOf(slug)
	return mountComponent({
		root: import.meta.dirname,
		owner: manifest.package,
		...opts,
		entry: join(FROZEN, e.entry),
		built: true,
		builtAgainst: e.builtAgainst,
	})
}

test('the frozen artifacts are the bytes that were committed — never rebuilt', () => {
	for (const [file, sha] of Object.entries(PINNED)) {
		const got = createHash('sha256').update(readFileSync(join(FROZEN, file))).digest('hex')
		assert.equal(got, sha, `${file} changed — these fixtures are never rebuilt; see the header`)
	}
	assert.deepEqual(manifest.components.map((c) => c.entry).sort(), Object.keys(PINNED).sort())
})

test("today's host would serve and mount every frozen artifact: its module judged clean, its build record compatible", () => {
	for (const c of manifest.components) {
		const { errors } = componentModuleFindings(readFileSync(join(FROZEN, c.entry), 'utf8'))
		assert.deepEqual(errors, [], c.slug)
		assert.equal(componentBuiltAgainstFinding(c.builtAgainst), undefined, c.slug)
	}
})

test('a frozen Svelte widget still reads its sections, asks a request, hears an event and invokes', async () => {
	const view = await mountFrozen('ledger', {
		context: { messages: [{ id: 1 }, { id: 2 }], settings: { title: 'Ledger of old' }, locale: 'en' },
		requests: (kind) => (kind === 'messages' ? { rows: [{ id: -1 }, { id: 0 }] } : undefined),
	})
	try {
		assert.equal(view.query('.title')?.textContent, 'Ledger of old')
		assert.equal(view.query('.count')?.textContent, '2 messages · en')
		await view.click('.older')
		assert.equal(view.query('.older-state')?.textContent, '2 older')
		assert.deepEqual(
			view.requested.map((r) => r.kind),
			['messages'],
		)
		await view.event({ kind: 'message:created', channel: 'main', slug: 'main', lane: 1, messageId: 3 })
		assert.equal(view.query('.event')?.textContent, 'last event: message:created #3')
		await view.push('messages', [{ id: 1 }, { id: 2 }, { id: 3 }])
		assert.equal(view.query('.count')?.textContent, '3 messages · en')
		await view.click('.note')
		assert.deepEqual(view.invoked, [{ key: 'note', payload: { n: 3 } }])
		assert.deepEqual(view.refused, [])
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

test('a frozen widget of sp-* elements still switches tabs, flips a switch and hears its keys', async () => {
	const view = await mountFrozen('controls')
	try {
		assert.equal(view.query('.tab')?.textContent, 'tab: one')
		await view.dispatch('sp-tabs', 'change', { value: 'two' })
		assert.equal(view.query('.tab')?.textContent, 'tab: two')
		assert.equal(view.query('.state')?.textContent, 'off')
		await view.dispatch('.toggle', 'change', { checked: true })
		assert.equal(view.query('.state')?.textContent, 'on')
		assert.equal(view.query('.state')?.getAttribute('tone'), 'success')
		assert.equal(view.query('.field')?.getAttribute('keys'), 'Enter Escape')
		await view.input('.field', 'hello')
		assert.equal(await view.pressKey('.field', 'Enter'), true)
		assert.equal(await view.pressKey('.field', 'Escape'), true)
		assert.equal(view.query('.heard')?.textContent, 'Enter Escape')
		assert.deepEqual(view.invoked, [{ key: 'commit', payload: { text: 'hello' } }])
		assert.deepEqual(view.refused, [])
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

test('a frozen vanilla widget still restores its saved state, counts and saves', async () => {
	const view = await mountFrozen('counter', { context: { messages: [{ id: 1 }], state: { n: 4 } } })
	try {
		assert.equal(view.query('.count')?.textContent, 'count 4 of 1 messages')
		await view.click('.bump')
		assert.equal(view.query('.count')?.textContent, 'count 5 of 1 messages')
		assert.deepEqual(view.saved, [{ n: 5 }])
		assert.deepEqual(view.refused, [])
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})
