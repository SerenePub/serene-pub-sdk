/**
 * The worker's ordered outbox (C7): what a component sends on its
 * widget-protocol port leaves on the worker channel as `wire`, after every
 * DOM change of the turn that sent it — a handler that closes a menu and
 * then invokes an action never has the page see the invoke first. The
 * runtime runs in this process against the DOM polyfill; the "page" is the
 * log of what it posts, and the other end of the mount's port.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageChannel, type MessagePort } from 'node:worker_threads'
import { MUTATION_TYPE_REMOVE_CHILD } from '@remote-dom/core'
import { FN, type ComponentMountFn, type WorkerToHost } from '@serene-pub/sdk'
import { startComponentWorker } from '../component-client/src/workerRuntime.js'

interface Page {
	/** Every worker → page message, in the order posted. */
	log: WorkerToHost[]
	/** What arrived on the mount's port instead (nothing, now). */
	onPort: unknown[]
	/** The page's end of the mount's port. */
	port: MessagePort
	fire(id: number): void
	unmount(): void
	/** The first listener handle for `event` in what the page was sent. */
	handle(event: string): number
	wires(): Array<Record<string, unknown>>
}

let mounts = 0
function mount(fn: ComponentMountFn): Page {
	const log: WorkerToHost[] = []
	const onPort: unknown[] = []
	const handle = startComponentWorker({ post: (m) => log.push(m), importModule: async () => ({ default: fn }) })
	const channel = new MessageChannel()
	channel.port1.on('message', (m) => onPort.push(m))
	const mountId = `m${++mounts}`
	handle({ k: 'mount', mountId, entry: 'inline', port: channel.port2 as never })
	const find = (v: unknown, event: string): number | undefined => {
		if (!v || typeof v !== 'object') return undefined
		const listeners = (v as { eventListeners?: Record<string, unknown> }).eventListeners
		const h = listeners?.[event] as Record<string, unknown> | undefined
		if (h && typeof h[FN] === 'number') return h[FN] as number
		for (const c of Array.isArray(v) ? v : Object.values(v)) {
			const hit = find(c, event)
			if (hit !== undefined) return hit
		}
		return undefined
	}
	return {
		log,
		onPort,
		port: channel.port1,
		fire: (id) => handle({ k: 'fn', mountId, id, detail: { type: 'click' } }),
		unmount: () => {
			handle({ k: 'unmount', mountId })
			channel.port1.close()
		},
		handle(event) {
			for (const m of log) if (m.k === 'mutate') {
				const id = find(m.records, event)
				if (id !== undefined) return id
			}
			throw new Error(`no ${event} listener was sent`)
		},
		wires: () => log.flatMap((m) => (m.k === 'wire' ? [m.msg as Record<string, unknown>] : [])),
	}
}

const tasks = (n = 1) => new Promise<void>((r) => (n <= 1 ? setTimeout(r, 5) : tasks(n - 1).then(() => setTimeout(r, 5))))
async function until(what: string, ok: () => boolean) {
	for (let i = 0; i < 200; i++) {
		if (ok()) return
		await tasks()
	}
	throw new Error(`timed out waiting for ${what}`)
}

test('ready arrives on the worker channel, behind the first render', async () => {
	const page = mount((root) => {
		root.append(document.createElement('p'))
	})
	try {
		await until('ready', () => page.wires().some((m) => m.t === 'ready'))
		const ready = page.log.findIndex((m) => m.k === 'wire' && (m.msg as { t?: string }).t === 'ready')
		const firstRender = page.log.findIndex((m) => m.k === 'mutate')
		assert.ok(firstRender >= 0 && firstRender < ready, 'the component is drawn before it says it is ready')
		assert.deepEqual(page.onPort, [])
	} finally {
		page.unmount()
	}
})

test('a handler that closes a menu and then invokes: the page sees the menu go first', async () => {
	const page = mount((root, ctx) => {
		const menu = document.createElement('div')
		const item = document.createElement('button')
		item.textContent = 'Branch from here'
		item.addEventListener('click', () => {
			menu.remove()
			ctx.invoke('branch', { messageId: 7 })
		})
		menu.append(item)
		root.append(menu)
	})
	try {
		await until('ready', () => page.wires().some((m) => m.t === 'ready'))
		page.fire(page.handle('click'))
		await until('the invoke', () => page.wires().some((m) => m.t === 'invoke'))
		const removed = page.log.findIndex(
			(m) => m.k === 'mutate' && (m.records as unknown[][]).some((r) => r[0] === MUTATION_TYPE_REMOVE_CHILD),
		)
		const invoked = page.log.findIndex((m) => m.k === 'wire' && (m.msg as { t?: string }).t === 'invoke')
		assert.ok(removed >= 0, 'the menu was removed')
		assert.ok(removed < invoked, `the removal (#${removed}) reaches the page before the invoke (#${invoked})`)
		assert.deepEqual((page.log[invoked] as { msg: unknown }).msg, { t: 'invoke', key: 'branch', messageId: 7 })
		assert.deepEqual(page.onPort, [])
	} finally {
		page.unmount()
	}
})

test('a request goes out on the worker channel; its answer and the sections come back on the port', async () => {
	let shown: Element | undefined
	let context: { messages?: unknown[] } | undefined
	const page = mount((root, ctx) => {
		const p = document.createElement('p')
		root.append(p)
		shown = p
		context = ctx
		void ctx.request('lore' as never, { q: 1 } as never).then((r) => {
			p.textContent = JSON.stringify(r)
		})
	})
	try {
		await until('the request', () => page.wires().some((m) => m.t === 'request'))
		const req = page.wires().find((m) => m.t === 'request')!
		assert.equal(req.what, 'lore')
		assert.deepEqual(req.params, { q: 1 })
		page.port.postMessage({ t: 'response', requestId: req.requestId, ok: true, result: { n: 2 } })
		await until('the answer', () => shown?.textContent === '{"n":2}')
		page.port.postMessage({ t: 'messages', messages: [{ id: 1 }] })
		await until('the section', () => context?.messages?.length === 1)
		assert.deepEqual(page.onPort, [])
	} finally {
		page.unmount()
	}
})

test('what is sent is what it was at the call; unmounting drops what the turn had not sent', async () => {
	let refused: unknown
	const page = mount((root, ctx) => {
		// A payload that cannot cross throws to the caller, as a port's would.
		try {
			ctx.invoke('x', { payload: { f: () => 1 } as never })
		} catch (e) {
			refused = e
		}
		const send = document.createElement('button')
		send.addEventListener('click', () => {
			const payload = { text: 'a' }
			ctx.invoke('send', { payload })
			payload.text = 'b'
		})
		root.append(send)
	})
	try {
		await until('ready', () => page.wires().some((m) => m.t === 'ready'))
		assert.equal((refused as Error | undefined)?.name, 'DataCloneError')
		const click = page.handle('click')
		page.fire(click)
		await until('the invoke', () => page.wires().some((m) => m.t === 'invoke'))
		assert.deepEqual(
			page.wires().filter((m) => m.t === 'invoke'),
			[{ t: 'invoke', key: 'send', payload: { text: 'a' } }],
		)
		// Clicked, then unmounted in the same turn: the invoke never leaves.
		page.fire(click)
		page.unmount()
		await tasks(3)
		assert.equal(page.wires().filter((m) => m.t === 'invoke').length, 1)
	} catch (e) {
		page.unmount()
		throw e
	}
})
