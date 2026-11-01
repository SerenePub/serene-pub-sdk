/**
 * `ctx.t(source, ...args)` fills `{n}` placeholders after the lookup — on a
 * miss (the English source) and on a hit (the host's `strings` post) alike.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createComponentContext, type ComponentPort } from '../sdk/src/componentWire.js'

function fakePort(): ComponentPort & { deliver(msg: unknown): void } {
	const port = {
		onmessage: null as ((e: never) => void) | null,
		postMessage() {},
		close() {},
		deliver(msg: unknown) {
			;(port.onmessage as unknown as (e: { data: unknown }) => void)({ data: msg })
		},
	}
	return port
}

test('t fills {0}…{n} on a miss', () => {
	const ctx = createComponentContext(fakePort())
	assert.equal(ctx.t('Hello {0}, {1}', 'Ana', 3), 'Hello Ana, 3')
	ctx.close()
})

test('t fills {0}…{n} on a hit', () => {
	const port = fakePort()
	const ctx = createComponentContext(port)
	ctx.t('Hello {0}, {1}', 'Ana', 3)
	port.deliver({ t: 'strings', strings: { 'Hello {0}, {1}': 'Hola {0}, {1}' } })
	assert.equal(ctx.t('Hello {0}, {1}', 'Ana', 3), 'Hola Ana, 3')
	ctx.close()
})

test('a missing argument leaves {n} as written', () => {
	const ctx = createComponentContext(fakePort())
	assert.equal(ctx.t('Hello {0}, {1}', 'Ana'), 'Hello Ana, {1}')
	ctx.close()
})
