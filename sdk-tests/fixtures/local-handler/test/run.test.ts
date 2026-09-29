/**
 * The plugin's own test. Not the plugin: nothing here is registered with
 * anything, and `handler` is a loop variable.
 */

import { bindingsOf } from '@serene-pub/sdk'
import extension from '../src/index.js'

const handlers = Object.values(bindingsOf(extension as never))
const ctx = { random: Math.random, now: () => 0, log: () => {}, signal: undefined }

for (const handler of handlers) {
	await handler({ text: 'hello' }, ctx)
	await handler({ text: 'again' }, ctx)
}
await handlers[0]?.({ text: 'once more' }, ctx)
