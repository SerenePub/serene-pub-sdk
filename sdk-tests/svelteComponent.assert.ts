/**
 * `svelteComponent` and `reactive`, asserted at COMPILE time (never run).
 * What it guards: every component written before the reactive context
 * (props `{ ctx }` only) still mounts; one that takes `raw` too mounts; and
 * the mirror is a `ComponentContext`, so code written for one takes the other.
 */

import type { Component } from 'svelte'
import type { ComponentContext, ComponentMountFn } from '@serene-pub/sdk'
import { reactive, svelteComponent } from '@serene-pub/component-client/svelte'

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const is = <T extends true>(_: T): void => {}

declare const ctxOnly: Component<{ ctx: ComponentContext }>
declare const withRaw: Component<{ ctx: ComponentContext; raw: ComponentContext }>
declare const rawOptional: Component<{ ctx: ComponentContext; raw?: ComponentContext }>
is<Equal<ReturnType<typeof svelteComponent>, ComponentMountFn>>(true)
svelteComponent(ctxOnly)
svelteComponent(withRaw)
svelteComponent(rawOptional)

declare const raw: ComponentContext
is<Equal<ReturnType<typeof reactive>, ComponentContext>>(true)
const mirror: ComponentContext = reactive(raw)
void mirror

// A component that wants something else is refused.
declare const wrongProps: Component<{ ctx: string }>
// @ts-expect-error — `ctx` is the context, not a string.
svelteComponent(wrongProps)
