/**
 * The component client's contract: what a remote component is
 * handed. The host implements it in the page's UI worker over the widget
 * wire — the same sections a native widget reads off its context and a
 * frame is posted, and the same verbs back — and `@serene-pub/component-client`
 * is how a component names it.
 *
 * A component module exports one mount function: it draws into `root`
 * (placing elements from `SP_HOST_ELEMENTS`) and returns a cleanup.
 *
 * **A component never types `v1`.** `.v1` is the wire's version clock: the
 * envelope ({@link WidgetData}) carries each section as `{ v1 }`, and the
 * component client unwraps the current version — `ctx.messages` is
 * `messages.v1`, `ctx.scope('session:state')` is `session_state.v1`. When a
 * section ships a `v2`, the client is the one place that picks.
 *
 * New to the project's words (scope, section, grant, dossier)? See the
 * vocabulary page, `guides/vocabulary.md`.
 * @ruling §3.5, C3
 */

import type {
	MessageV1,
	WidgetBaseSection,
	WidgetData,
	WidgetEvent,
	WidgetRequestKind,
	WidgetRequests,
	WidgetScopedSections,
	WidgetScopedSectionValues,
	WidgetSectionScope,
	WidgetWriteGrant,
} from './widgets.js'

/**
 * Every base section of the envelope ({@link WidgetData}) but `channels`,
 * flat: the section's current version, `undefined` until the host posts it.
 * Derived, never hand-listed — a base section added to `WidgetData` is here
 * at once, and the component wire does not compile until it hands it over.
 * (`channels` differs on purpose: the envelope's is the declared slugs; a
 * component is handed each lane's rows, below.)
 * @experimental
 */
export type ComponentBaseSections = {
	[S in Exclude<WidgetBaseSection, 'channels'>]?: WidgetData[S]['v1']
}

/**
 * Every section the host pushes, as the latest value received.
 *
 * `session`, `messages`, `layout`, `actions`, `props`, `settings`, `annex`,
 * `locale`, `viewer` (🚧 who is looking), `turnOrder`, `attendance` — each
 * that section's `v1`, from {@link ComponentBaseSections}.
 * @experimental
 */
export interface ComponentSections extends ComponentBaseSections {
	/** Per-lane rows, when the widget declared channels. */
	channels: Record<string, MessageV1[]>
	theme?: { theme: string; mode: 'light' | 'dark' }
	/**
	 * 🚧 The raw bag: the scoped sections this widget was granted, by their
	 * posted name (`session_full`, `session_state`, …) — the SDK's one table
	 * (`WidgetScopedSections`), each its section's `v1`. Read one with
	 * {@link ComponentContext.scope}, by the scope you declared; this bag is
	 * for code that walks every section.
	 */
	scoped: Partial<WidgetScopedSectionValues>
	/**
	 * 🚧 The scopes and write grants this widget holds, BARE
	 * (`session:state`, `session:state:write`, `channel:main:write`; never
	 * `widget:session:state`) — as the host last said (`grants`), on mount
	 * and whenever an admin's review changes them. `undefined` until the host
	 * says (and from a host that never does). So a component tells "this
	 * scope was not granted" (drawn as such) from "its section has not been
	 * posted yet" (drawn as loading) — both of which are an absent `scoped`
	 * entry — and can hide a button whose write it does not hold. A write
	 * grant ({@link WidgetWriteGrant}) pushes no section of its own. Read one
	 * with {@link ComponentContext.granted}.
	 */
	grants?: readonly (WidgetSectionScope | WidgetWriteGrant)[]
	/** The view state this widget saved last time, handed back once on mount. */
	state?: unknown
	suspended: boolean
}

/** @experimental */
export type ComponentSection = keyof ComponentSections | 'event' | 'strings'

/** @experimental */
export interface ComponentInvokeArgs {
	messageId?: number
	payload?: Record<string, unknown>
	blockId?: string
	/** The text the press supplies — a slash argument (`WidgetInvokeArgs.text`). */
	text?: string
}

/** @experimental */
export interface ComponentContext extends Readonly<ComponentSections> {
	/** Called with the section's name whenever the host pushes one. */
	subscribe(fn: (section: ComponentSection) => void): () => void
	/** Widget events (`message:created`, `layout:changed`, …). */
	onEvent(fn: (event: WidgetEvent) => void): () => void
	/** Press an action by key or identity, as the native `invoke` verb does. */
	invoke(key: string, args?: ComponentInvokeArgs): void
	/**
	 * ⏳ Fire a function by name — a form block's press, whose identity the
	 * outlet stamped and no venue need list (the native `action` verb).
	 */
	action(fn: string, messageId?: number, payload?: Record<string, unknown>, action?: string, blockId?: string): void
	/** Keep a little view state for the next mount (capped by the host). */
	saveState(state: unknown): void
	/** Tell the host something went wrong; `fatal` shows the host's own notice. */
	error(message: string, fatal?: boolean): void
	/** Ask the host for something ({@link WidgetRequests}); rejects when it declines. */
	request<K extends WidgetRequestKind>(kind: K, params: WidgetRequests[K]['params']): Promise<WidgetRequests[K]['result']>
	/**
	 * 🚧 The viewer's translation of one of the component's own English
	 * strings — the source until a translation arrives, when `subscribe` hears
	 * `strings` and a redraw shows it.
	 */
	t(source: string): string
	/**
	 * 🚧 Was `scope` — or a write grant, `session:state:write`,
	 * `channel:<slug>:write` — granted? `true` or `false` once the host has
	 * said (`grants`); `undefined` before it has — so `false` is the one
	 * answer that means "draw not granted", and `undefined` still means "wait".
	 * A widget that asks `send`, `draft` or `set-attribute-value` checks its
	 * write grant here before it offers the button.
	 */
	granted(scope: WidgetSectionScope | WidgetWriteGrant): boolean | undefined
	/**
	 * 🚧 The section a granted scope delivers, by the same string `scopes`
	 * and `granted` take: `ctx.scope('session:state')` is the session's
	 * stats and states. `undefined` when it is not granted, or not posted
	 * yet — {@link granted} tells the two apart. (Not `scopes`: that is the
	 * list a widget declares.)
	 */
	scope<S extends WidgetSectionScope>(scope: S): WidgetScopedSectionValues[WidgetScopedSections[S]['section']] | undefined
}

/** What a component module exports: mount into `root`; return a cleanup. @experimental */
export type ComponentMountFn = (root: HTMLElement, ctx: ComponentContext) => void | (() => void)

/** Types a component's mount function; returns it unchanged. @experimental */
export const defineComponent = (fn: ComponentMountFn): ComponentMountFn => fn
