/**
 * An error nobody caught in the worker (playtest item 15): it belongs to no
 * one mount, so the runtime says it, non-fatally, to every live mount.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageChannel } from 'node:worker_threads'
import type { WorkerToHost } from '@serene-pub/sdk'
import { startComponentWorker } from '../component-client/src/workerRuntime.js'

test('a worker-global error and an unhandled rejection reach every live mount as `error`', async () => {
	const log: WorkerToHost[] = []
	const handle = startComponentWorker({
		post: (m) => log.push(m),
		importModule: async () => ({ default: () => {} }),
	})
	const channels = [new MessageChannel(), new MessageChannel()]
	handle({ k: 'mount', mountId: 'a', entry: 'inline', port: channels[0]!.port2 as never })
	handle({ k: 'mount', mountId: 'b', entry: 'inline', port: channels[1]!.port2 as never })
	await new Promise((r) => setTimeout(r, 50))
	try {
		const fire = (type: string, props: Record<string, unknown>) => {
			const ev = Object.assign(new Event(type), props)
			globalThis.dispatchEvent(ev)
			return ev
		}
		const errors = () =>
			log.flatMap((m) =>
				m.k === 'error' ? [{ mountId: m.mountId, message: m.message }] : [],
			)

		const ev = fire('error', { error: new Error('render blew up') })
		assert.deepEqual(errors(), [
			{ mountId: 'a', message: 'render blew up' },
			{ mountId: 'b', message: 'render blew up' },
		])
		assert.equal(ev.defaultPrevented, false)

		fire('unhandledrejection', { reason: new Error('nobody awaited') })
		assert.deepEqual(errors().slice(2), [
			{ mountId: 'a', message: 'nobody awaited' },
			{ mountId: 'b', message: 'nobody awaited' },
		])

		// A mount that has gone is not told.
		handle({ k: 'unmount', mountId: 'a' })
		fire('error', { error: new Error('later') })
		assert.deepEqual(errors().slice(4), [{ mountId: 'b', message: 'later' }])
	} finally {
		handle({ k: 'unmount', mountId: 'b' })
		for (const c of channels) {
			c.port1.close()
			c.port2.close()
		}
	}
})
