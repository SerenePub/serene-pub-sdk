/**
 * `@serene-pub/core-catalog/widgets` — the widget context a core widget reads:
 * the same sections a frame is sent and a remote component is
 * handed, as one reactive object the host keeps current. Core's widgets are
 * written against this whether they render in the page or in its UI worker;
 * the host provides it under `WIDGET_CONTEXT_KEY`.
 *
 * The neutral subpath every core widget imports — not one widget's:
 * the conversation's `…/conversation` re-exports the context alone, as it
 * always has. Beside it, the SDK's one table of scoped sections and the
 * shapes it names, so a core widget reads `session_state`, `characters`,
 * `persona` or `session_full` typed from here.
 *
 * Types, the key, the table and one pure check (`scopeNotGranted`) —
 * reading the context is the widget's own `getContext`, so this module never
 * imports a Svelte runtime and a host may import it freely.
 * @ruling PLAN 25, C0b, R21
 */
import type {
	WidgetData,
	WidgetProtocolVersion,
	WidgetScopedSections,
	WidgetScopedSectionValues,
	WidgetSectionScope,
	WidgetVerbs,
	WidgetWriteGrant,
} from '@serene-pub/sdk'

export {
	WIDGET_BASE_SECTIONS,
	WIDGET_SCOPED_SECTIONS,
	isWidgetScopedSectionName,
	type SessionCharacterV1,
	type SessionCharactersV1,
	type SessionDossierV1,
	type SessionEntryV1,
	type SessionPersonaV1,
	type SessionResolvedStateV1,
	type SessionSceneImageV1,
	type SessionStateOwnerV1,
	type SessionStateSlotV1,
	type SessionStateV1,
	type WidgetBaseSection,
	type WidgetScopedData,
	type WidgetScopedSectionName,
	type WidgetScopedSectionValues,
	type WidgetScopedSections,
	type WidgetSectionScope,
} from '@serene-pub/sdk'

/** @experimental */
export interface WidgetContext extends WidgetData, WidgetVerbs {
	/**
	 * The widget contract's version — the SDK's one number, shared with the
	 * frame lane's `FRAME_PROTOCOL`. Native is frame minus the iframe, so the
	 * two deliveries report the same contract rather than two clocks that
	 * agree until one is bumped.
	 */
	protocol: WidgetProtocolVersion
	widget: { id: string; instanceId: string; title: string }
	/**
	 * 🚧 The scopes and write grants this widget holds, bare (`session:state`, `session:state:write`) — as the host
	 * last said (`ComponentContext.grants`); absent until it has. A scope
	 * missing from a PRESENT list was not granted, and its section will never
	 * come: say so ({@link scopeNotGranted}) rather than draw loading.
	 */
	grants?: readonly (WidgetSectionScope | WidgetWriteGrant)[]
	/**
	 * 🚧 The section a granted scope delivers, its `v1` — by the scope
	 * string (`scope('session:state')`), as a remote component's
	 * `ComponentContext.scope` answers it. `undefined` when not granted or
	 * not posted yet; {@link scopeNotGranted} tells the two apart. (Not
	 * `scopes`: that is the list a widget declares.)
	 */
	scope<S extends WidgetSectionScope>(scope: S): WidgetScopedSectionValues[WidgetScopedSections[S]['section']] | undefined
}

/**
 * 🚧 Did the host say this widget does NOT hold `scope`? True only once it
 * has said (`grants` present) — before that, an absent section is "not yet".
 * @experimental
 */
export const scopeNotGranted = (ctx: Pick<WidgetContext, 'grants'> | undefined, scope: WidgetSectionScope): boolean =>
	!!ctx?.grants && !ctx.grants.includes(scope)

/** The Svelte context key a core widget reads its context from. @experimental */
export const WIDGET_CONTEXT_KEY = 'widget'

/**
 * A stable handle a widget reads its (reactive) context through. The provider
 * puts one in Svelte context whose `current` getter returns the live context,
 * so a consumer that reads `ref.current.session.v1` inside its own
 * `$derived`/template stays reactive across re-projections.
 * @experimental
 */
export interface WidgetContextRef {
	readonly current: WidgetContext
}
