/**
 * The event and lifecycle surfaces say exactly what the host hands out,
 * asserted at COMPILE time.
 *
 * Checked by `tsc --noEmit` and never run. The grant table (`hookGrants.ts`)
 * is what both sandboxes enforce: an event listener and a lifecycle callback
 * get the base four (`random`, `now`, `log`, `signal`) and `storage`, and no
 * network. The surfaces once also typed `fetch` (and `readCore` on lifecycle),
 * so an author's compiler accepted calls that threw at runtime. The exact-key
 * checks below fail the build if a member is typed that the table does not
 * grant, or granted and not typed; the `@ts-expect-error` lines fail it if a
 * withheld member comes back.
 */

import {
	ok,
	type EventListener,
	type EventListenerSurface,
	type LifecycleCallback,
	type LifecycleCallbackSurface,
} from '@serene-pub/sdk'

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** `hookCtxKeysFor('event')` and `hookCtxKeysFor('lifecycle')`, as a type. */
type Granted = 'random' | 'now' | 'log' | 'storage' | 'signal'

export const eventKeys: Exactly<keyof EventListenerSurface, Granted> = true
export const lifecycleKeys: Exactly<keyof LifecycleCallbackSurface, Granted> = true

export const listener: EventListener = async (_input, ctx) => {
	ctx.log('info', 'tick', { at: ctx.now(), roll: ctx.random() })
	await ctx.storage.query({ limit: 1 })
	// @ts-expect-error — network is an oracle's grant, never a listener's
	await ctx.fetch('https://example.com')
	return ok({})
}

export const callback: LifecycleCallback = async (_input, ctx) => {
	// @ts-expect-error — network is an oracle's grant, never a lifecycle callback's
	await ctx.fetch('https://example.com')
	// @ts-expect-error — a lifecycle callback reads no core table
	await ctx.readCore('sessions')
	return ok({})
}
