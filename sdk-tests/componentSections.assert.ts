/**
 * The component context's sections, asserted at COMPILE time.
 *
 * This file is checked by `tsc --noEmit` and is never run (the suite has no
 * `expectTypeOf`; an `.assert.ts` is its type test). What it guards: a
 * component's sections are typed off the envelope (`WidgetData`), flat —
 * `ctx.messages` is `messages.v1`, never `unknown` — and `ctx.scope(…)`
 * answers the section its scope delivers. If either widens back to `unknown`,
 * an `Equal` below stops being `true` and the build fails.
 */

import type {
	ActionsV1,
	AnnexV1,
	ComponentContext,
	LayoutV1,
	MessageV1,
	SessionCharactersV1,
	SessionDossierV1,
	SessionPersonaV1,
	SessionStateV1,
	SessionV1,
	WidgetEvent,
	WidgetPayload,
} from '@serene-pub/sdk'

/** Exact type equality: true only when `A` and `B` are the same type. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const is = <T extends true>(_: T): void => {}

declare const ctx: ComponentContext

// Base sections: each its `v1`, `undefined` until posted.
is<Equal<typeof ctx.messages, MessageV1[] | undefined>>(true)
is<Equal<typeof ctx.session, SessionV1 | undefined>>(true)
is<Equal<typeof ctx.layout, LayoutV1 | undefined>>(true)
is<Equal<typeof ctx.actions, ActionsV1 | undefined>>(true)
is<Equal<typeof ctx.props, WidgetPayload | undefined>>(true)
is<Equal<typeof ctx.settings, WidgetPayload | undefined>>(true)
is<Equal<typeof ctx.annex, AnnexV1 | undefined>>(true)
is<Equal<typeof ctx.locale, string | undefined>>(true)
// Per-lane rows, not the envelope's slug list.
is<Equal<typeof ctx.channels, Record<string, MessageV1[]>>>(true)
// The widget's own view state stays its own.
is<Equal<typeof ctx.state, unknown>>(true)

// Events arrive as the union, so `kind` narrows.
ctx.onEvent((e) => {
	is<Equal<typeof e, WidgetEvent>>(true)
	if (e.kind === 'message:created') is<Equal<typeof e.messageId, number>>(true)
})

// One spelling: the scope string reads its section.
is<Equal<ReturnType<typeof ctx.scope<'session:state'>>, SessionStateV1 | undefined>>(true)
is<Equal<ReturnType<typeof ctx.scope<'session:full'>>, SessionDossierV1 | undefined>>(true)
is<Equal<ReturnType<typeof ctx.scope<'characters'>>, SessionCharactersV1 | undefined>>(true)
is<Equal<ReturnType<typeof ctx.scope<'persona'>>, SessionPersonaV1[] | undefined>>(true)
const state = ctx.scope('session:state')
is<Equal<typeof state, SessionStateV1 | undefined>>(true)
// @ts-expect-error — a posted name is not a scope: `scope` takes what `scopes` declares.
ctx.scope('session_state')
