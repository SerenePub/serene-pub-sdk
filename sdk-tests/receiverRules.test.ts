/**
 * The receiver's rules (C7): whose box an element lands in, and the value a
 * rule judged being the value written — one function the page's receiver and
 * the component harness both call, so a harness mount shows what the page
 * would: a plugin's box by default, core's when told.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { receiverAttribute, receiverElementFinding } from '@serene-pub/sdk'
import { mountComponent } from './harnessGuard.js'

const written = (tag: string, name: string, value: unknown, owner = 'acme.widgets') => {
	const judged = receiverAttribute(tag, name, value, owner)
	return 'refused' in judged ? undefined : judged.value
}

test('a URL is judged as the parser reads it, and written as it was judged', () => {
	// The ends the URL parser strips, and the ones `trim` strips: gone before the check.
	assert.equal(written('a', 'href', ' #message-12'), '#message-12')
	assert.equal(written('a', 'href', '\t\n#message-12 '), '#message-12')
	assert.equal(written('a', 'href', '\u0001#x'), '#x')
	assert.equal(written('a', 'href', ' #message-12'), '#message-12')
	assert.equal(written('img', 'src', ' /media/abc?v=thumb'), '/media/abc?v=thumb')
	assert.equal(written('a', 'href', ' https://ok.example/ '), 'https://ok.example/')
	// Only URLs: other text is the component's own, spaces and all.
	assert.equal(written('textarea', 'value', '  a line  '), '  a line  ')
	assert.equal(written('img', 'alt', ' face '), ' face ')
})

test("the owner rules: autofocus and host views are core's, and 'false' hides nothing", () => {
	assert.deepEqual(receiverAttribute('textarea', 'autofocus', '', 'acme.widgets'), {
		refused: "<textarea> autofocus is core's to place",
	})
	assert.deepEqual(receiverAttribute('textarea', 'autofocus', '', 'core'), { value: '' })
	assert.match(receiverElementFinding('sp-host-view', 'acme.widgets') ?? '', /core's/)
	assert.equal(receiverElementFinding('sp-host-view', 'core'), undefined)
	assert.match(receiverElementFinding('script', 'core') ?? '', /not in the host-element vocabulary/)
	assert.equal(receiverElementFinding('sp-badge', 'acme.widgets'), undefined)
	for (const owner of ['core', 'acme.widgets']) {
		assert.deepEqual(receiverAttribute('sp-badge', 'hidden', 'false', owner), { value: null })
		assert.deepEqual(receiverAttribute('div', 'inert', 'false', owner), { value: null })
		assert.deepEqual(receiverAttribute('div', 'hidden', '', owner), { value: '' })
		assert.deepEqual(receiverAttribute('div', 'hidden', undefined, owner), { value: null })
	}
	assert.match((receiverAttribute('div', 'onclick', 'x()', 'core') as { refused: string }).refused, /takes no 'onclick'/)
})

test("an envoy's face: core's box takes an https or inline raster image, a plugin's does not", () => {
	const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
	const faces = ['https://cdn.example/herald.png', png, 'data:image/webp;base64,UklGRg==', 'data:image/jpeg;base64,/9j/4A==']
	for (const face of faces) {
		assert.deepEqual(receiverAttribute('img', 'src', face, 'core'), { value: face }, face)
		assert.ok('refused' in receiverAttribute('img', 'src', face, 'acme.widgets'), face)
	}
	// Still refused in core's box: plain http, a vector (Remote DOM's own floor
	// refuses it, which would stop the whole box), a non-base64 inline image,
	// and the exemption is the <img>'s alone.
	for (const face of [
		'http://cdn.example/herald.png',
		'data:image/svg+xml;utf8,%3Csvg%2F%3E',
		'data:image/png,rawbytes',
		'data:text/html;base64,PGgxPg==',
		'javascript:alert(1)',
	])
		assert.ok('refused' in receiverAttribute('img', 'src', face, 'core'), face)
	assert.ok('refused' in receiverAttribute('a', 'href', png, 'core'))
	// The app's own media stays everyone's.
	assert.deepEqual(receiverAttribute('img', 'src', '/media/abc?v=thumb&r=3', 'acme.widgets'), { value: '/media/abc?v=thumb&r=3' })
	assert.deepEqual(receiverAttribute('img', 'src', ` ${png}\n`, 'core'), { value: png })
})

test("a message's session asset lands in every box — the one file id the route serves, and nothing else", () => {
	for (const owner of ['core', 'acme.widgets']) {
		// A part's image and a block's image; a part's file as a download link.
		assert.deepEqual(receiverAttribute('img', 'src', '/session-assets/41', owner), { value: '/session-assets/41' }, owner)
		assert.deepEqual(receiverAttribute('img', 'src', ' /session-assets/41?v=thumb', owner), { value: '/session-assets/41?v=thumb' }, owner)
		assert.deepEqual(receiverAttribute('a', 'href', '/session-assets/42', owner), { value: '/session-assets/42' }, owner)
		assert.deepEqual(receiverAttribute('a', 'download', 'notes.txt', owner), { value: 'notes.txt' }, owner)
		for (const [tag, name, url] of [
			// Another host (plain http), a script, a protocol-relative host, a non-image inline URL.
			['img', 'src', 'http://evil.example/session-assets/41'],
			['a', 'href', 'http://evil.example/session-assets/41'],
			['a', 'href', 'javascript:alert(1)'],
			['a', 'href', '//evil.example/session-assets/41'],
			['img', 'src', 'data:text/html;base64,PGgxPg=='],
			// Not the route's shape: a path under an id, a name, no id, a dot segment out of it.
			['img', 'src', '/session-assets/41/../../api/users'],
			['img', 'src', '/session-assets/%2e%2e/api/users'],
			['img', 'src', '/session-assets/41/sprites/happy.webp'],
			['a', 'href', '/session-assets/secret.txt'],
			['a', 'href', '/session-assets/'],
		] as const)
			assert.ok('refused' in receiverAttribute(tag, name, url, owner), `${owner} ${tag} ${name}=${url}`)
	}
	// Another host over TLS: an image request the page would make, so a plugin's
	// box refuses it (core's takes an envoy's https face, above).
	assert.ok('refused' in receiverAttribute('img', 'src', 'https://evil.example/session-assets/41', 'acme.widgets'))
})

/* ── the harness applies them, as the page does ─────────────────────────── */

const dirs: string[] = []
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

/** One plain component that writes everything the owner rules judge. */
async function ownerFixture(): Promise<string> {
	const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
	await mkdir(base, { recursive: true })
	const dir = await mkdtemp(join(base, 'sp-owner-'))
	dirs.push(dir)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'owner-fixture', type: 'module' }))
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/owner.ts'),
		`import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root) => {
	const field = document.createElement('textarea'); field.setAttribute('autofocus', ''); root.append(field)
	const badge = document.createElement('sp-badge'); badge.setAttribute('hidden', 'false'); badge.textContent = 'shown'; root.append(badge)
	const view = document.createElement('sp-host-view'); view.setAttribute('name', 'session-controls'); root.append(view)
	const face = document.createElement('img'); face.className = 'face'; face.setAttribute('src', 'https://cdn.example/herald.png'); root.append(face)
	const link = document.createElement('a'); link.setAttribute('href', ' #message-12'); link.textContent = 'jump'; root.append(link)
})
`,
	)
	return dir
}

test("a harness mount is a plugin's box unless told it is core's", { timeout: 120_000 }, async () => {
	const dir = await ownerFixture()
	const plugin = await mountComponent({ root: dir, entry: 'src/owner.ts' })
	try {
		assert.equal(plugin.query('textarea')?.hasAttribute('autofocus'), false)
		assert.equal(plugin.query('sp-host-view') === null, true)
		assert.equal(plugin.query('.face')?.getAttribute('src'), null)
		assert.ok(plugin.refused.some((r) => r.includes("autofocus is core's to place")), plugin.refused.join('\n'))
		assert.ok(plugin.refused.some((r) => r.includes('<sp-host-view>')), plugin.refused.join('\n'))
		assert.ok(plugin.refused.some((r) => r.includes('herald.png')), plugin.refused.join('\n'))
		// Everyone's: 'false' is absent, and the link is written as it was judged —
		// its fragment the box's own, as the page prefixes a plugin's ids.
		assert.equal(plugin.query('sp-badge')?.hasAttribute('hidden'), false)
		assert.equal(plugin.query('a')?.getAttribute('href'), `#${plugin.idPrefix}message-12`)
	} finally {
		await plugin.unmount()
	}
	const core = await mountComponent({ root: dir, entry: 'src/owner.ts', owner: 'core' })
	try {
		assert.deepEqual(core.refused, [])
		assert.equal(core.query('textarea')?.hasAttribute('autofocus'), true)
		assert.equal(core.query('sp-host-view')?.getAttribute('name'), 'session-controls')
		assert.equal(core.query('.face')?.getAttribute('src'), 'https://cdn.example/herald.png')
		assert.equal(core.query('sp-badge')?.hasAttribute('hidden'), false)
	} finally {
		await core.unmount()
	}
})

test('the harness receives aria-current and aria-live in their value sets, and refuses the rest', { timeout: 120_000 }, async () => {
	const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
	await mkdir(base, { recursive: true })
	const dir = await mkdtemp(join(base, 'sp-aria-'))
	dirs.push(dir)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'aria-fixture', type: 'module' }))
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(
		join(dir, 'src/aria.ts'),
		`import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root) => {
	const add = (tag: string, cls: string, name: string, value: string) => {
		const n = document.createElement(tag); n.className = cls; n.setAttribute(name, value); root.append(n)
	}
	add('li', 'now', 'aria-current', 'step')
	add('li', 'odd', 'aria-current', 'yes')
	add('div', 'calm', 'aria-live', 'polite')
	add('div', 'loud', 'aria-live', 'assertive')
})
`,
	)
	const m = await mountComponent({ root: dir, entry: 'src/aria.ts' })
	try {
		assert.equal(m.query('.now')?.getAttribute('aria-current'), 'step')
		assert.equal(m.query('.calm')?.getAttribute('aria-live'), 'polite')
		assert.equal(m.query('.odd')?.hasAttribute('aria-current'), false)
		assert.equal(m.query('.loud')?.hasAttribute('aria-live'), false)
		assert.ok(m.refused.some((r) => r.includes("aria-live 'assertive'")), m.refused.join('\n'))
		assert.ok(m.refused.some((r) => r.includes("aria-current 'yes'")), m.refused.join('\n'))
	} finally {
		await m.unmount()
	}
})
