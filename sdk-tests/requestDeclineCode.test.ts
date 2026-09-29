/**
 * A declined request carries a code a component can act on (`code`), not
 * only a sentence: the wire's own decline at `close()`, a host's decline
 * relayed, and core's conversation reading the code before the text.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createComponentContext, RequestDeclined, type ComponentPort } from '../sdk/src/index.js'

function fakePort() {
	let deliver: ((e: { data: unknown }) => void) | null = null
	const posted: Record<string, unknown>[] = []
	const port: ComponentPort = {
		set onmessage(fn: ((e: never) => void) | null) {
			deliver = fn as never
		},
		get onmessage() {
			return deliver as never
		},
		postMessage(m: unknown) {
			posted.push(m as Record<string, unknown>)
		},
		close() {},
	}
	return { port, posted, deliver: (data: unknown) => deliver!({ data }) }
}

const pendingWrite = (ctx: ReturnType<typeof createComponentContext>) =>
	ctx.request('set-attribute-value', { owner: { kind: 'session', id: 1 }, slotId: 'core:slot/weather@1', value: 'rain' } as never)

test("the wire's close() declines every pending request with the code `unmounted`", async () => {
	const { port } = fakePort()
	const ctx = createComponentContext(port)
	const asked = pendingWrite(ctx)
	ctx.close()
	const e = await asked.then(
		() => assert.fail('a pending request must be declined at close'),
		(err: unknown) => err,
	)
	assert.ok(e instanceof RequestDeclined)
	assert.equal(e.code, 'unmounted')
	assert.equal(e.message, 'the component was unmounted')
})

test("a host's decline is relayed with its code, and without one when the host gave none", async () => {
	const { port, posted, deliver } = fakePort()
	const ctx = createComponentContext(port)
	const first = pendingWrite(ctx)
	const second = pendingWrite(ctx)
	const [a, b] = posted.map((m) => m.requestId)
	deliver({ t: 'response', requestId: a, ok: false, error: 'the page was unmounted before it answered', code: 'unmounted' })
	deliver({ t: 'response', requestId: b, ok: false, error: 'the book is archived' })
	const e1 = (await first.catch((e: unknown) => e)) as RequestDeclined
	const e2 = (await second.catch((e: unknown) => e)) as RequestDeclined
	assert.equal(e1.code, 'unmounted')
	assert.equal(e2.code, undefined)
	assert.equal(e2.message, 'the book is archived')
	ctx.close()
})

test("core's conversation reads the code first, and the sentence of an older host after", async () => {
	// A `.svelte.ts` module: imported at run time so the suite's `tsc` does not compile its runes.
	const path: string = '../core-catalog/components/sessions/messages/conversation.svelte.ts'
	const { isUnmountDecline } = (await import(path)) as { isUnmountDecline: (e: unknown) => boolean }
	assert.equal(isUnmountDecline(new RequestDeclined('gone', 'unmounted')), true)
	assert.equal(isUnmountDecline(new Error('the page was unmounted before it answered')), true)
	assert.equal(isUnmountDecline(new Error('the component was unmounted')), true)
	assert.equal(isUnmountDecline(new RequestDeclined('the book is archived')), false)
	assert.equal(isUnmountDecline(new Error('the draft store is full')), false)
	// A code that is not `unmounted` wins over a sentence that happens to say it.
	assert.equal(isUnmountDecline(Object.assign(new Error('unmounted'), { code: 'other' })), false)
})
