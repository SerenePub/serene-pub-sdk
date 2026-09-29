/**
 * A remote's widget context (C0b): the component context a UI worker hands
 * a component, as the native `WidgetContext` core's widgets read
 * (`useWidgetContext`). So a core widget — written against the native
 * context — runs in a worker with no change to its source: the same
 * sections, the same verbs, reaching the host over the component's port.
 * Shared by every core widget (R21); the conversation was the first.
 */
import {
	EMPTY_TURN_ORDER,
	WIDGET_PROTOCOL,
	type ComponentContext,
	type LayoutV1,
	type ViewerV1,
	type WidgetEvent,
	type WidgetEventKind
} from "@serene-pub/sdk/component"
import {
	WIDGET_SCOPED_SECTIONS,
	type WidgetContext,
	type WidgetContextRef,
	type WidgetScopedData
} from "@serene-pub/core-catalog/widgets"

/** Every scoped section's posted name — the SDK's one table, read once. */
const SCOPED_NAMES = Object.values(WIDGET_SCOPED_SECTIONS)

const NOBODY: ViewerV1 = { userId: null, isAdmin: false, isGuest: false }

/**
 * A remote's context carries its saved view state besides: what it saved
 * last mount (`state`) and the host's save-state channel (`saveState`) —
 * read by core's widgets off the context where a remote has them.
 */
type RemoteWidgetContext = WidgetContext & {
	state: unknown
	saveState: (state: unknown) => void
}

/** The granted scoped sections as the envelope carries them: `{ <name>: { v1 } }`, absent when not granted. */
function scopedData(scoped: ComponentContext["scoped"]): WidgetScopedData {
	const out: Record<string, { v1: unknown }> = {}
	for (const name of SCOPED_NAMES) if (scoped[name] !== undefined) out[name] = { v1: scoped[name] }
	return out as WidgetScopedData
}

export function widgetRefFromComponent(
	ctx: ComponentContext,
	widget: WidgetContext["widget"]
): WidgetContextRef {
	// Any section the host pushes re-projects the context, as a native
	// host's re-projection does.
	let version = $state(0)
	ctx.subscribe(() => version++)

	const current = $derived.by((): RemoteWidgetContext => {
		void version
		const scoped = ctx.scoped ?? {}
		return {
			protocol: WIDGET_PROTOCOL,
			widget,
			layout: { v1: (ctx.layout ?? {}) as LayoutV1 },
			session: { v1: (ctx.session ?? { id: 0, name: null }) as WidgetContext["session"]["v1"] },
			channels: { v1: Object.keys(ctx.channels ?? {}) },
			messages: { v1: (ctx.messages ?? []) as WidgetContext["messages"]["v1"] },
			props: { v1: ctx.props ?? {} },
			actions: { v1: (ctx.actions ?? {}) as WidgetContext["actions"]["v1"] },
			settings: { v1: ctx.settings ?? {} },
			annex: { v1: (ctx.annex ?? {}) as WidgetContext["annex"]["v1"] },
			locale: { v1: ctx.locale ?? "en" },
			viewer: { v1: ctx.viewer ?? NOBODY },
			turnOrder: { v1: ctx.turnOrder ?? EMPTY_TURN_ORDER },
			// What the host said this widget holds — absent until it has — so a
			// widget can tell a scope never granted apart from a section not yet posted.
			grants: ctx.grants,
			// The scoped sections the host granted, each as its `{ v1 }` bag — by
			// the table, so a section the SDK adds arrives with no change here.
			...scopedData(scoped),
			action: (fn, messageId, payload, action, blockId) => ctx.action(fn, messageId, payload, action, blockId),
			invoke: (key, args) => ctx.invoke(key, args),
			request: ((kind, params) => ctx.request(kind, params)) as WidgetContext["request"],
			// No host menu across the port yet: dismissed, as a native host without one answers.
			menu: async () => null,
			on: (kind: WidgetEventKind | "*", cb: (e: WidgetEvent) => void) =>
				ctx.onEvent((e) => {
					const ev = e as WidgetEvent
					if (kind === "*" || ev.kind === kind) cb(ev)
				}),
			t: (source) => ctx.t(source),
			state: ctx.state,
			saveState: (state) => ctx.saveState(state)
		}
	})

	return {
		get current() {
			return current
		}
	}
}
