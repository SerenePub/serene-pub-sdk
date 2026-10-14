/**
 * `@serene-pub/sdk/component` — what a COMPONENT imports from the SDK.
 * Experimental: grows additively until SDK 1.0 freezes it.
 *
 * A component runs in a UI worker and may import only `COMPONENT_IMPORTS`
 * (`componentImports.ts`). The SDK's root barrel is not on that list — it is
 * the pipeline and plugin authoring surface, most of which a component
 * never runs — so the few runtime helpers a component does use, and the
 * section types it reads, are re-exported here. Core's own components
 * import this subpath and nothing else of the SDK's, so a clone of one
 * compiles in-app from its source as it stands.
 *
 * Every name here is the root barrel's own, re-exported: `import { x } from
 * '@serene-pub/sdk'` and from this subpath are the same binding.
 * @ruling §3.5, C6 P1
 */

// ── runtime helpers ─────────────────────────────────────────────────────────
/** An action's stable identity (a verb's key in a row or a palette). */
export { actionIdentity } from './identity.js'
/**
 * Display text: a plain string or a locale map, resolved.
 * @ruling R-20
 */
export { i18nText, type I18n } from './i18n.js'
/** The empty turn order a widget starts from before the host's first push. */
export { EMPTY_TURN_ORDER, type TurnOrderV1 } from './turnOrder.js'
/**
 * The widget data contract's protocol version; the empty attendance a widget starts from.
 * @ruling W10
 */
export { WIDGET_PROTOCOL, EMPTY_ATTENDANCE } from './widgets.js'
/**
 * The folded sections a row's shown alternative carries, read from its metadata.
 * @ruling B4
 */
export { foldedSectionsOf } from './foldedSections.js'

// ── types ───────────────────────────────────────────────────────────────────
export type { ComponentContext } from './componentClient.js'
/** A declined `request`'s error, and the `code` it may carry. */
export type { RequestDeclined } from './componentWire.js'
export type { RequestDeclineCode } from './surfaces.js'
export type { HostKeyEventDetail } from './hostElements.js'
export type { StatusText, WidgetActionReason } from './status.js'
export type {
	AttendanceV1,
	AttendeeV1,
	AuthorsNoteV1,
	AuthorsNoteValueV1,
	HistoryEntriesV1,
	HistoryEntryV1,
	HistorySceneV1,
	FoldedSectionPartDataV1,
	FoldedSectionV1,
	LayoutV1,
	MessageErrorConnectionV1,
	MessageErrorV1,
	MessageMetadataV1,
	MessagePartV1,
	MessageSwipesV1,
	MessageV1,
	PlaceLinkV1,
	PlaceV1,
	SessionCharactersV1,
	SessionEntryV1,
	SessionPersonaV1,
	SessionPlacesV1,
	SessionStateV1,
	StatTrailChangeV1,
	StoryClockV1,
	WayV1,
	ViewerV1,
	WidgetAction,
	WidgetEvent,
	WidgetEventKind,
	WidgetRequestKind,
	WidgetRequests,
} from './widgets.js'
/**
 * 🚧 A story time and what a story clock steps by (Chronicle).
 * @ruling W3
 */
export type { StoryTime, StoryTimeUnit } from './storyTime.js'
/** The conversation dossier — `session_full.v1`, for a widget granted `session:full`. */
export type { SessionDossierV1 } from './sessionDossier.js'
