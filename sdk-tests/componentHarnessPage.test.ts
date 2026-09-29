/**
 * The harness is as strict as the page, not gentler (plugin authors' D2/D3
 * reports): a widget is posted only the base sections it reads (R75), and
 * told only the events those sections carry; a plugin's box invokes a verb
 * the page gates only behind a person's press in the box; and a box's ids
 * are prefixed per mount, as the page prefixes them — every box but core's
 * own conversation.
 */
import { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { mountComponent, test, type MountComponentOptions } from './harnessGuard.js'

const dirs: string[] = []
async function pkg(source: string): Promise<string> {
	const base = resolve(import.meta.dirname, '..', 'node_modules', '.cache')
	await mkdir(base, { recursive: true })
	const dir = await mkdtemp(join(base, 'sp-harness-page-'))
	dirs.push(dir)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'harness-page-fixture', type: 'module' }))
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	await writeFile(join(dir, 'c.ts'), source)
	return dir
}
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

/** Lists every section it was posted, and every event kind it heard. */
const RECORDER = `import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root, ctx) => {
	const seen = document.createElement('p'); seen.className = 'seen'; root.append(seen)
	const heard = document.createElement('p'); heard.className = 'heard'; root.append(heard)
	const got = new Set(), kinds = []
	const off = ctx.subscribe((s) => { got.add(s); seen.textContent = [...got].sort().join(',') })
	const offEvents = ctx.onEvent((e) => { kinds.push(e.kind); heard.textContent = kinds.join(',') })
	return () => { off(); offEvents() }
})
`

/** Invokes on a click, and unprompted whenever `props.go` lands; a labelled field for the id rule. */
const INVOKER = `import { defineComponent } from '@serene-pub/component-client'
export default defineComponent((root, ctx) => {
	const edit = document.createElement('button'); edit.className = 'edit'; edit.textContent = 'Edit'
	edit.addEventListener('click', () => ctx.invoke('edit', { messageId: 2, payload: { content: 'x' } }))
	const nudge = document.createElement('button'); nudge.className = 'nudge'; nudge.textContent = 'Nudge'
	nudge.addEventListener('click', () => {})
	const label = document.createElement('label'); label.setAttribute('for', 'name'); label.textContent = 'Name'
	const field = document.createElement('input'); field.id = 'name'
	root.append(edit, nudge, label, field)
	const off = ctx.subscribe((s) => {
		// Unprompted: the moment a section lands, with nobody pressing anything.
		if (s === 'props' && ctx.props?.go) ctx.invoke(String(ctx.props.go), { messageId: 1 })
	})
	return off
})
`

const mount = async (source: string, opts: Omit<MountComponentOptions, 'root' | 'entry'> = {}) =>
	mountComponent({ root: await pkg(source), entry: 'c.ts', timeoutMs: 60_000, ...opts })

const CONTEXT = {
	session: { id: 1 },
	messages: [{ id: 1 }],
	props: { a: 1 },
	layout: { box: 1 },
	viewer: { userId: 1, isAdmin: false, isGuest: false },
} as never

test('a base section the widget does not read is never posted; one it reads is', async () => {
	const view = await mount(RECORDER, { reads: ['props'], context: CONTEXT })
	try {
		// state/theme/grants are the page's, not base sections: always posted.
		assert.deepEqual(view.query('.seen')?.textContent?.split(','), ['grants', 'props', 'theme'])
		await view.push('messages', [{ id: 1 }, { id: 2 }] as never)
		await view.push('channels', { main: [{ id: 3 }] } as never)
		await view.push('props', { a: 2 })
		assert.deepEqual(view.query('.seen')?.textContent?.split(','), ['grants', 'props', 'theme'])
	} finally {
		await view.unmount()
	}
})

test('without `reads`, every base section is posted (a widget written before R75)', async () => {
	const view = await mount(RECORDER, { context: CONTEXT })
	try {
		const seen = view.query('.seen')?.textContent?.split(',') ?? []
		for (const s of ['session', 'messages', 'props', 'layout', 'locale', 'viewer']) assert.ok(seen.includes(s), s)
	} finally {
		await view.unmount()
	}
})

test('an event gated on a section the widget does not read is not delivered', async () => {
	const view = await mount(RECORDER, { reads: ['props'], context: CONTEXT })
	try {
		await view.event({ kind: 'message:created', message: { id: 9 } })
		await view.event({ kind: 'layout:changed', layout: {} })
		await view.event({ kind: 'generation:started' })
		assert.equal(view.query('.heard')?.textContent, 'generation:started')
	} finally {
		await view.unmount()
	}
	const reading = await mount(RECORDER, { reads: ['messages', 'layout'], context: CONTEXT })
	try {
		await reading.event({ kind: 'message:created', message: { id: 9 } })
		await reading.event({ kind: 'layout:changed', layout: {} })
		assert.equal(reading.query('.heard')?.textContent, 'message:created,layout:changed')
	} finally {
		await reading.unmount()
	}
})

test("a plugin box's unprompted invoke of a gated verb is refused; a clicked one passes", async () => {
	const view = await mount(INVOKER, { context: {} })
	try {
		await view.push('props', { go: 'retry' })
		assert.equal(view.invoked.length, 0)
		assert.equal(view.refusedInvokes.length, 1)
		assert.equal(view.refusedInvokes[0]!.key, 'retry')
		assert.match(view.refusedInvokes[0]!.reason, /person/)
		await view.click('.edit')
		assert.deepEqual(view.invoked, [{ key: 'edit', messageId: 2, payload: { content: 'x' } }])
		assert.equal(view.refusedInvokes.length, 1)
		// A verb the page does not gate passes unprompted, as on the page.
		await view.push('props', { go: 'myplugin:spec/roll#roll' })
		assert.deepEqual(
			view.invoked.map((i) => i.key),
			['edit', 'myplugin:spec/roll#roll'],
		)
	} finally {
		await view.unmount()
	}
})

test('a press on another element with a listener opens the window too; `invokeGate: false` records every invoke', async () => {
	const pressed = await mount(INVOKER, { context: {} })
	try {
		await pressed.click('.nudge')
		await pressed.push('props', { go: 'core#retry' })
		assert.deepEqual(pressed.invoked.map((i) => i.key), ['core#retry'])
		assert.deepEqual(pressed.refusedInvokes, [])
	} finally {
		await pressed.unmount()
	}
	const ungated = await mount(INVOKER, { context: {}, invokeGate: false })
	try {
		await ungated.push('props', { go: 'retry' })
		assert.deepEqual(ungated.invoked.map((i) => i.key), ['retry'])
		assert.deepEqual(ungated.refusedInvokes, [])
	} finally {
		await ungated.unmount()
	}
})

test("core's box is not gated", async () => {
	const view = await mount(INVOKER, { owner: 'core', context: {} })
	try {
		await view.push('props', { go: 'retry' })
		assert.deepEqual(view.invoked.map((i) => i.key), ['retry'])
		assert.deepEqual(view.refusedInvokes, [])
	} finally {
		await view.unmount()
	}
})

test("ids are prefixed per box for a plugin's (and core's widgets'), not for core's conversation", async () => {
	const plugin = await mount(INVOKER, { context: {} })
	try {
		const id = plugin.query('input')!.getAttribute('id')!
		assert.notEqual(id, 'name')
		assert.equal(id, `${plugin.idPrefix}name`)
		assert.match(plugin.idPrefix, /^sp-r\d+-[0-9a-f]{8}-$/)
		assert.equal(plugin.query('label')!.getAttribute('for'), id)
		assert.equal(plugin.query(`#${id}`)?.localName, 'input')
	} finally {
		await plugin.unmount()
	}
	const coreWidget = await mount(INVOKER, { owner: 'core', context: {} })
	try {
		assert.equal(coreWidget.query('input')!.getAttribute('id'), `${coreWidget.idPrefix}name`)
		assert.notEqual(coreWidget.idPrefix, '')
	} finally {
		await coreWidget.unmount()
	}
	const conversation = await mount(INVOKER, { owner: 'core', coreConversation: true, context: {} })
	try {
		assert.equal(conversation.idPrefix, '')
		assert.equal(conversation.query('input')!.getAttribute('id'), 'name')
		assert.equal(conversation.query('label')!.getAttribute('for'), 'name')
	} finally {
		await conversation.unmount()
	}
})
