/**
 * Declared UI surfaces, and the preview manifest a harness reads from them.
 *
 * A package's UI arrives in exactly two shapes, and the difference is a trust
 * decision, not a taste one:
 *
 *   **frame** — a document (`ui/map.html`) mounted in an opaque-origin iframe
 *   (`sandbox="allow-scripts"`, never `allow-same-origin`). Zero ambient
 *   anything: no cookies, no DOM reach, no socket. Everything it knows arrives
 *   on the MessageChannel the host owns (the frame protocol below). This is the
 *   shape the app ships today — session-view replacement, page, panel grid
 *   (20 §12, 21 §7).
 *
 *   **component** — a module the page's UI worker runs (§3.5, R25): one
 *   worker per owner per session page, no DOM, no network. It places
 *   elements from the host vocabulary (`SP_HOST_ELEMENTS`, `hostElements.ts`)
 *   and the host mirrors them into the widget box, dropping anything not
 *   listed; its data arrives on the same widget wire a frame's does. A
 *   widget names one by `component`; what needs a real document gets one
 *   inside the component through `sp-frame`. A frame is a remote minus the
 *   worker: the same envelope, a different boundary.
 *
 * The preview harness (`serene-pub preview`) renders both. It reads what the
 * package **announces**, never what a directory happens to contain — a surface
 * a modder sees in the harness is a surface an instance would see in the
 * manifest, or it is a bug in one of them.
 *
 * ## Reading is tolerant on purpose
 *
 * `previewManifest()` never throws on a malformed declaration. The app's
 * `surfacesOf` reads the stored manifest the same way — "a malformed
 * declaration is a missing surface, not a crash" — and a dev harness that
 * dies on a half-typed entry path is a harness that gets closed. Problems come
 * back in `problems[]` so the harness can show them beside the list instead of
 * replacing it.
 *
 * ## The frame protocol (host ⇄ frame, over the transferred port)
 *
 * The types below are the one declaration of the wire the app's `PluginFrame`
 * and the preview harness both speak — both import these unions rather than
 * restating them, so a message a host sends is a message this file declares.
 * They are data, not behaviour: the SDK ships no host and no client, because
 * the host is core's (it owns the scoping) and the client is the author's.
 *
 * What travels is the widget envelope (`widgets.ts`) with the boundary added:
 * a frame receives the same sections a native widget reads off its context,
 * one push per section. `FRAME_PROTOCOL` says which vintage of that wire the
 * host speaks.
 */

import type { TurnOrderV1 } from './turnOrder.js'
import type { ComponentDecl, ComponentFramework } from './extension.js'
import type { WidgetDecl } from './layout.js'
import type { SettingsSchema } from './settings.js'
import {
	WIDGET_PROTOCOL,
	type ActionsV1,
	type AnnexV1,
	type LayoutV1,
	type MessageV1,
	type SessionV1,
	type ViewerV1,
	type WidgetRequestKind,
	type WidgetEvent,
	type WidgetPayload,
	type WidgetProtocolVersion,
	type WidgetScopedSectionName,
	type WidgetSectionScope,
} from './widgets.js'

/**
 * Where a package's entry module lives, in the order the toolchain looks.
 * One list, shared by `serene-pub build` and the preview harness, so "the
 * harness found my plugin but the packager didn't" cannot happen.
 * @experimental
 */
export const ENTRY_CANDIDATES = ['dist/index.js', 'src/index.ts', 'index.ts', 'index.js'] as const

// ── Declarations ────────────────────────────────────────────────────────────

/** One frame surface: the document to mount, and what to call it. @experimental */
export interface FrameSurfaceDecl {
	/** Path to the document, relative to the package root — `ui/map.html`. */
	entry: string
	title?: string
	/**
	 * The surface's **declared props** (21 §7's `surface:props`), written in
	 * the same settings vocabulary a component uses for its component-side
	 * settings (12 §6). Declaring them is what lets the host *generate* the
	 * editor — core renders forms from schemas, so a surface that declares its
	 * props gets one for free and never ships one of its own.
	 *
	 * The intended shape: declared values reach a frame as
	 * `{ t: 'settings', settings }` — the effective `settings.v1`, defaults
	 * filled in — and a component as `ctx.settings`. One declaration, two
	 * deliveries; the difference is the boundary, not the vocabulary.
	 *
	 * A `surfaces.panels` declaration reaches that path too. Core projects the
	 * panel (see {@link panelToWidgetDecl}), namespaces its id
	 * ({@link pluginWidgetId}) and seats the result in every session as an
	 * ordinary widget, so its declared settings are resolved against the
	 * instance's stored deviations and posted as `{ t: 'settings' }` exactly as
	 * a {@link WidgetDecl}'s are. One declaration, two deliveries, no third
	 * behaviour for the deprecated spelling.
	 */
	settings?: SettingsSchema
}

/**
 * ⏳ A frame panel in the session surface grid. `id` is what a `surface:open`
 * intent and a saved layout row key on.
 *
 * @deprecated Declare a {@link WidgetDecl} with a `frame` surface. A panel was
 * always a widget — one declaration wearing two names, and this is the name
 * that lost: `WidgetDecl` carries everything here plus placement, cells, fold,
 * scopes and styles, and it is the shape the host actually seats. Kept one
 * release for the packages on disk that declare `surfaces.panels`;
 * {@link panelToWidgetDecl} is the translation.
 * @experimental
 */
export interface FramePanelDecl extends FrameSurfaceDecl {
	id: string
	/** The lanes this panel views (20 §4/§7). A panel is a view onto channels. */
	channels?: string[]
}

/**
 * A `surfaces.panels` entry read as the one widget declaration.
 *
 * Pure and total: every field a panel can declare has a home on
 * {@link WidgetDecl}, so nothing is dropped and nothing is invented. The host
 * calls this at the boundary where it reads a stored manifest, which is what
 * makes "a panel IS a widget" true of the code rather than only of the prose.
 *
 * `id` is carried through **bare**, because this is the SDK's pure projection
 * of what the package wrote and the package wrote its own id. It is therefore
 * NOT unique across packages: two packages declaring a panel `map` declare the
 * same id here.
 *
 * Reconciling that is the host's, and the host does it by **namespacing** —
 * {@link pluginWidgetId} turns the pair into `<pluginId>:<panelId>`, which is
 * the id a seated instance, a saved layout row, a `widget_settings` row and a
 * `surface:open` intent all carry. A reader that needs the package's own
 * spelling back takes it apart with {@link parsePluginWidgetId}.
 * @internal
 */
export function panelToWidgetDecl(pluginId: string, panel: FramePanelDecl): WidgetDecl {
	return {
		id: panel.id,
		title: panel.title ?? panel.id,
		role: 'secondary',
		surface: { kind: 'frame', pluginId, entry: panel.entry },
		...(panel.channels ? { channels: [...panel.channels] } : {}),
		...(panel.settings ? { settings: panel.settings } : {}),
	}
}

/**
 * The plugin slug grammar, mirrored from `defineExtension` — lowercase
 * letters, digits, dots and hyphens, `chariot.dice-tray`, never a slash and
 * never a colon.
 *
 * Here as well as there for the reason {@link isServablePanelId} is here: this
 * module owns the two halves of a namespaced widget id, and a parser that
 * borrowed one grammar and restated the other would be half a contract.
 */
const SAFE_PLUGIN_ID = /^[a-z0-9]+([.-][a-z0-9]+)*$/

/**
 * The widget id a plugin's own panel is seated under: `<pluginId>:<panelId>`.
 *
 * A plugin's widgets are namespaced and core's and a genre's are not, because
 * only a plugin's id is outside anyone's control: a package picks `map` in
 * private and would otherwise collide with every other package that did, and
 * with core's own widgets, in a layout row that outlives the install. The
 * separator can only be `:` — neither grammar admits one — and it is the
 * separator core already uses for an owned id (`core:genre/chat`).
 *
 * Pure: the two halves are NOT validated here. The host reads a stored
 * manifest and knows what it accepted; a helper that refused a second time
 * would have to say so in a second vocabulary, and a composer that can fail is
 * a composer every caller has to branch on. Reading one back DOES validate,
 * because a stored id arrives with no such provenance —
 * {@link parsePluginWidgetId}. The asymmetry is deliberate: composing is the
 * host's own string, parsing is anyone's.
 * @experimental
 */
export const pluginWidgetId = (pluginId: string, panelId: string): string =>
	`${pluginId}:${panelId}`

/**
 * A namespaced widget id taken back apart, or `null` when the string is not
 * one.
 *
 * `null` is the answer for every core and genre widget id, which is what makes
 * this the test for "is this widget a plugin's": both halves must satisfy the
 * grammars a host would have accepted them under, so exactly the ids
 * {@link pluginWidgetId} can produce round-trip and nothing else does. A
 * second colon lands in the panel half and fails there, so `a:b:c` is not a
 * plugin widget id rather than being read as one with a surprising panel.
 * @experimental
 */
export function parsePluginWidgetId(id: string): { pluginId: string; panelId: string } | null {
	const cut = id.indexOf(':')
	if (cut <= 0) return null
	const pluginId = id.slice(0, cut)
	const panelId = id.slice(cut + 1)
	if (!SAFE_PLUGIN_ID.test(pluginId) || !isServablePanelId(panelId)) return null
	return { pluginId, panelId }
}

/**
 * What a package declares under `surfaces` — the exact shape the app's
 * `frameHost.surfacesOf` reads out of a stored manifest.
 * @experimental
 */
export interface SurfacesDecl {
	/**
	 * Replaces the whole message section for a genre that names it (19 `view`).
	 *
	 * Spelled `session-view`, not `sessionView`, because that is the key the
	 * app's `surfacesOf` reads out of a stored manifest — and the announcement
	 * *is* the manifest (24 §6), so there is no layer in between to translate
	 * it. A camelCase spelling here compiled, previewed, installed, and then
	 * silently never mounted: the exact class of bug this file's docstring
	 * claims cannot happen. One spelling, end to end.
	 */
	'session-view'?: FrameSurfaceDecl
	/** A standalone page under the app's plugin route shell. */
	page?: FrameSurfaceDecl
	/**
	 * ⏳ Panels offered to the session surface grid.
	 *
	 * @deprecated Declare widgets instead — a genre's shape carries
	 * {@link WidgetDecl}s, and a `frame` surface on one is this same panel with
	 * placement, cells and scopes it can no longer say here. Read one release
	 * through {@link panelToWidgetDecl}.
	 */
	panels?: FramePanelDecl[]
}

/** The three frame points, spelled as the app spells them. @experimental */
export type FramePoint = 'session-view' | 'page' | 'panel'

// ── Frame protocol v1 ───────────────────────────────────────────────────────

/**
 * 🚧 Why a request was declined, when a component may act on the reason
 * rather than its sentence — the `code` of a declining `response`, and of
 * the error a component's `request` rejects with ({@link RequestDeclined}).
 * `unmounted`: the component was unmounted before its request was answered
 * — nothing is wrong, nobody is left to tell. Additive: a host that sends
 * none still declines with its sentence alone.
 * @experimental
 */
export type RequestDeclineCode = 'unmounted'

/** host → frame. `init` carries the port; everything after rides it. @experimental */
export type HostFrameMessage =
	| { t: 'init'; protocol: FrameProtocolVersion; surface: FramePoint; payload?: unknown }
	| { t: 'session'; session: SessionV1 }
	| { t: 'messages'; messages: MessageV1[] }
	| { t: 'message'; message: MessageV1 }
	| { t: 'channel'; channel: string; messages: MessageV1[] }
	| { t: 'props'; props: WidgetPayload }
	/**
	 * This instance's effective settings — the widget envelope's `settings.v1`,
	 * every declared field defaulted with the person's deviations over it. The
	 * in-document analog is `ctx.settings.v1`; a frame is a widget minus the
	 * iframe, so it receives the same section by push.
	 *
	 * Sent only for a surface that IS a widget. A page or session-view frame
	 * has no instance to resolve settings for and receives none.
	 */
	| { t: 'settings'; settings: WidgetPayload }
	/**
	 * The widget skin this frame should wear, already resolved by the host.
	 *
	 * A frame widget is skinned identically to a native one; the only
	 * difference is that its CSS is injected into the frame's OWN document
	 * rather than a scoped `<style>` in the host's. The frame is expected to
	 * keep one `<style id="sp-widget-style">`, replaced in place, and to set
	 * `vars` on its `document.documentElement`.
	 *
	 * An EMPTY `css` is still sent: taking a style off has to reach the frame,
	 * and a host that simply stopped sending would leave the last one applied
	 * for ever. Widget surfaces only.
	 */
	| { t: 'style'; css: string; vars: Record<string, string> }
	/**
	 * This widget's placement — the envelope's `layout.v1`, projected by the
	 * host and detached, so a later host-side move cannot reach into a message
	 * already sent. Re-sent on every change, and re-sent on reload: a frame
	 * that replays `ready` gets everything it needs to draw itself without
	 * having to ask. Widget surfaces only.
	 */
	| { t: 'layout'; layout: LayoutV1 }
	/** The viewer's view of the session annex (R57), on open and on every change — `annex.v1`. */
	| { t: 'annex'; annex: AnnexV1 }
	/**
	 * One host event — the port's analog of the `on` verb, and the same union a
	 * native widget subscribes to. Scoped to the frame's declared channels
	 * host-side, exactly as the message posts are, so a frame is never told
	 * about a message it was not also sent. Widget surfaces only.
	 */
	| { t: 'event'; event: WidgetEvent }
	/**
	 * The session's actions per venue — the envelope's `actions.v1`. A frame
	 * fires one with `{ t: 'invoke' }`, which the host resolves to the
	 * declaration exactly as the native `invoke` verb does. Widget surfaces
	 * only.
	 */
	| { t: 'actions'; actions: ActionsV1 }
	/**
	 * The host's active theme, as data (10 §6: *"the active theme id is a
	 * prop"*). An in-document component reads it off `ctx.theme`; a frame is
	 * its own document, so it arrives here.
	 *
	 * Values, never tokens. RESEARCH §7b is explicit that SP publishes no
	 * token artifact of any kind — the frame applies the id and the mode to
	 * its own `<html>` (`data-theme` / `data-mode`) and lets the stylesheet it
	 * linked resolve them, exactly as the top document does. That keeps the
	 * token surface "whatever Skeleton version core currently ships" rather
	 * than a list this union would have to maintain.
	 *
	 * Sent once the frame is ready and again whenever the host's theme or mode
	 * changes. A frame is still free to ignore it and keep its own look: the
	 * host's CSP grants the frame its OWN files, so a stylesheet resolving
	 * these attributes is one the package ships, not one it inherits.
	 */
	| { t: 'theme'; theme: string; mode: 'light' | 'dark' }
	/**
	 * The viewer's language code — the envelope's `locale.v1` — sent once the
	 * frame is ready and again if it changes, so a frame renders locale maps
	 * (`i18nText`) in the page's language.
	 */
	| { t: 'locale'; locale: string }
	| { t: 'suspend' }
	| { t: 'resume' }
	/**
	 * A page of whatever the frame last asked for, echoing its `requestId`.
	 * Without this a frame had no way to ask for anything: `messages` and
	 * `channel` arrive when the host feels like sending them, so a long channel
	 * could only be rendered in whatever slice the host chose.
	 */
	| {
			t: 'page'
			requestId: string
			rows: unknown[]
			nextCursor?: string
	  }
	/** The frame's own persisted view state, restored on (re)mount — see
	 *  `save-state`. */
	| { t: 'state'; state: Record<string, unknown> }
	/**
	 * 🚧 The answer to any `request` but `messages` (C0b), echoing its
	 * `requestId`: `ok` with the kind's result, or declined with why — and,
	 * when the decline is one a component may tell apart, its
	 * {@link RequestDeclineCode} (`code`; absent from an older host).
	 */
	| { t: 'response'; requestId: string; ok: boolean; result?: unknown; error?: string; code?: RequestDeclineCode }
	/** 🚧 Translations of strings the frame asked for with `translate` (C0b). */
	| { t: 'strings'; strings: Record<string, string> }
	/** 🚧 Who is looking — the envelope's `viewer.v1` (C0b). */
	| { t: 'viewer'; viewer: ViewerV1 }
	/** The session's turn order — the envelope's `turnOrder.v1` (C5), on open and on every change. */
	| { t: 'turn-order'; turnOrder: TurnOrderV1 }
	/**
	 * 🚧 A scoped section the widget was granted (C0b) — named as the SDK's
	 * one table posts it (`WidgetScopedSections`: `session_full`,
	 * `session_state`, `persona`, `characters`, `lore`), the envelope's
	 * `<name>.v1` — posted when it changes; `value: null` withdraws it (the
	 * grant went away). Never posted to a widget not granted it.
	 */
	| { t: 'scoped'; section: WidgetScopedSectionName; value: unknown }
	/**
	 * 🚧 The scopes the widget holds, BARE (`session:state`, never the
	 * permission key `widget:session:state`) — sent before the first push
	 * of its sections and again whenever they change (an admin grants or
	 * revokes one while it is open). What lets a widget tell a scope that was
	 * NOT granted (its section will never come: say so) from one whose
	 * section has not been posted yet (wait): both are an absent `scoped`.
	 * A host that never sends it leaves the widget unable to tell, as before.
	 * Additive within protocol 2 — a frame ignores a host message it does
	 * not recognise.
	 */
	| { t: 'grants'; grants: WidgetSectionScope[] }

/**
 * frame → host. Deliberately tiny: a frame proposes, the host decides.
 *
 * Tiny is not the same as mute. A frame that fails to boot has to be able to
 * say so (`error`); a frame showing a long channel has to be able to page
 * (`request`); a frame with view state has to be able to keep it across a
 * remount (`save-state`); and a frame pressing one of the session's own
 * actions has to be able to name it (`invoke`). None of those is the host
 * giving up control — they are the frame reporting, requesting and naming,
 * with the host still deciding.
 * @experimental
 */
export type FrameHostMessage =
	| { t: 'ready' }
	/**
	 * ⏳ Fire a function by name.
	 *
	 * @deprecated Send `invoke` instead. A press names a DECLARATION by its
	 * identity: a bare `fn` is a key, which several specs may declare, and it
	 * gets the server's narrowest reading — the one declarer it names, or a
	 * refusal — rather than the one the frame meant. Accepted for one release — the host still routes it — and it
	 * is the frame half of `WidgetVerbs.action`'s deprecation.
	 */
	| {
			t: 'action'
			fn: string
			messageId?: number
			payload?: WidgetPayload
			/** The identity the outlet stamped a form block with (W-E) — carried, never chosen. */
			action?: string
			/** The form the press answers: a block's id within `messageId`. */
			blockId?: string
	  }
	/**
	 * Fire an action the host listed in `actions`, by its **identity**
	 * (`<spec slug>#<key>`) or, when only one action carries it, its bare
	 * **key**. The host resolves it against the very projection it sent and
	 * routes it — one of core's verbs to its real handler, a contributed one to
	 * the audited fire with its identity attached.
	 *
	 * A key no venue lists, and a bare key several actions share, is dropped
	 * with a warning: a frame cannot fire something the session does not offer,
	 * or something ambiguous, and believe it did. A state-changing verb also
	 * wants a person in the frame — the host judges that, and the server
	 * re-judges the write.
	 */
	| {
			t: 'invoke'
			key: string
			messageId?: number
			payload?: WidgetPayload
			/**
			 * The form this press answers — a block's id within `messageId`
			 * (R-15 *Forms*). Absent on every other press; the frame half of
			 * `WidgetInvokeArgs.blockId`.
			 */
			blockId?: string
			/** The text the press supplies (a slash argument) — the frame half of `WidgetInvokeArgs.text`. */
			text?: string
	  }
	/**
	 * Something went wrong inside the frame. The host logs it against the
	 * plugin and may surface it in the panel's chrome — which is the whole
	 * point: a broken total-conversion surface should say so rather than sit
	 * blank.
	 */
	| { t: 'error'; message: string; detail?: unknown; fatal?: boolean }
	/**
	 * Ask for a page of a channel's messages. The host answers with `page`
	 * carrying the same `requestId`, or declines silently — a request is not a
	 * grant.
	 */
	| {
			t: 'request'
			requestId: string
			what: 'messages'
			channel?: string
			cursor?: string
			limit?: number
	  }
	/**
	 * 🚧 Ask the host for anything else in {@link WidgetRequests} (C0b) — a
	 * host view opened, a picker shown. Answered with `response`.
	 */
	| {
			t: 'request'
			requestId: string
			what: Exclude<WidgetRequestKind, 'messages'>
			params: unknown
	  }
	/** 🚧 English UI strings the frame wants in the viewer's language (C0b); answered with `strings`. */
	| { t: 'translate'; sources: string[] }
	/** Persist small view state (a scroll offset, an open tab). Returned as
	 *  `state` on the next mount. Not storage: the host may cap or drop it. */
	| { t: 'save-state'; state: Record<string, unknown> }

/**
 * The version the host announces in `init`, and the number a frame reads to
 * know what it may send.
 *
 * **2 comprises** everything declared in the two unions above: the widget
 * envelope's sections as pushes (`settings`, `style`, `layout`, `event`,
 * `actions`) alongside `session` / `messages` / `message` / `channel` /
 * `props` / `theme` / `suspend` / `resume`, and, frame → host, `invoke`
 * beside `ready` and `action`, plus `error`, `request` and `save-state` with
 * their `page` and `state` replies.
 *
 * A host may DECLINE any of the last three and still be a v2 host: a `request`
 * is not a grant, `save-state` may be capped or dropped, and an `error` may go
 * no further than a log. What 2 promises is that the frame may send them
 * without breaking the wire — never that the host will act on them. A frame
 * that needs an answer must therefore tolerate not getting one, which is the
 * same rule that lets a host push `style` at a frame that has never heard of
 * it.
 *
 * A v1 frame keeps working unchanged: it never sends the frame → host
 * additions, and it must already ignore host messages it does not recognise. A
 * v2 host must still accept `init` from a v1 frame — the version says what the
 * frame *may* send, not what it must.
 *
 * ONE number with the native lane (`WIDGET_PROTOCOL`): native is frame minus
 * the iframe, so a second clock here would be a second contract by accident.
 * @experimental
 */
export const FRAME_PROTOCOL = WIDGET_PROTOCOL
/** @experimental */
export type FrameProtocolVersion = WidgetProtocolVersion

// ── The preview manifest ────────────────────────────────────────────────────

/** One thing the harness can put on screen. @experimental */
export interface PreviewTarget {
	/** URL-safe, unique within the manifest — the harness routes on it. */
	id: string
	label: string
	kind: 'frame' | 'component'
	/**
	 * For a frame, one of `FramePoint`. For a component, the mount point it
	 * renders at — `widget` today (a page mount point comes later, R25).
	 */
	point: string
	/** Path to the entry, exactly as declared — relative to the package root. */
	entry: string
	/** Components only: which adapter renders it (10 §7). */
	framework?: ComponentFramework
	/** Panels only: the declared panel id `surface:open` keys on. */
	panelId?: string
	/** Panels only: the lanes this panel views. */
	channels?: string[]
	/** Component-side settings the target reads through `ctx` (12 §6). */
	settings?: SettingsSchema
	/** Where the declaration came from, for the harness's "declared in" line. */
	source: 'surfaces' | 'genre-shape' | 'components'
}

/** @experimental */
export interface PreviewManifest {
	/** The package's address — an announce ns (`acme.dice`) or a plugin slug. */
	id: string
	title: string
	version?: string
	targets: PreviewTarget[]
	/**
	 * Declarations that could not be read. Shown beside the list, never thrown:
	 * a half-typed entry path must not empty the harness.
	 */
	problems: string[]
}

/**
 * What the instance will actually accept — mirrored from the app's `frameHost`
 * (`isSafeUiPath`, and the panel-id test inside `surfacesOf`).
 *
 * These live here, and not only there, because core **silently drops** a
 * surface that fails them: no error, no log, just a panel that never appears.
 * The author has to be told at build time and at preview time, which means the
 * grammar has to exist on this side of the boundary too. If the app's changes,
 * this changes with it — the pins in `surfaces.test.ts` name the function to
 * check against.
 */
const SAFE_ENTRY = /^[a-zA-Z0-9_\-][a-zA-Z0-9._\-]*(\/[a-zA-Z0-9._\-]+)*$/
const SAFE_PANEL_ID = /^[a-z0-9_-]+$/

/** Would an instance serve this entry path, or quietly drop the surface? @internal */
export const isServableEntry = (path: string): boolean =>
	SAFE_ENTRY.test(path) && !path.split('/').some((seg) => seg === '.' || seg === '..')

/** Would an instance accept this panel id, or quietly drop the panel? @internal */
export const isServablePanelId = (id: string): boolean => SAFE_PANEL_ID.test(id)

const SAFE_ID = /[^a-z0-9]+/g

const slugify = (s: string) =>
	s.toLowerCase().replace(SAFE_ID, '-').replace(/^-|-$/g, '') || 'surface'

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

/** A settings schema, or nothing — never a half-read object. */
const settingsOf = (v: unknown): SettingsSchema | undefined =>
	v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length
		? (v as SettingsSchema)
		: undefined

/** i18n values are `string | {en: …}` across the SDK; display needs one line. */
const label = (v: unknown, fallback: string): string =>
	str(v) ?? str((v as { en?: unknown } | null)?.en) ?? fallback

/**
 * Read a package's UI declarations into the harness's list.
 *
 * Takes the entry module's default export: a `defineExtension` result. An
 * `AnnouncementBuilder` or a compiled `AnnouncementDocument` is still read, for
 * packages built before `defineExtension` became the one entry.
 * @experimental
 */
export function previewManifest(entry: unknown): PreviewManifest {
	const problems: string[] = []
	const targets: PreviewTarget[] = []
	const seen = new Set<string>()

	const source = unwrap(entry, problems)
	const id = source.id
	const push = (t: PreviewTarget) => {
		let unique = t.id
		for (let n = 2; seen.has(unique); n++) unique = `${t.id}-${n}`
		seen.add(unique)
		targets.push({ ...t, id: unique })
	}

	// ── frames declared under `surfaces` ────────────────────────────────────
	const s = source.surfaces
	const frame = (
		decl: unknown,
		point: FramePoint,
		where: string,
		extra: Partial<PreviewTarget> = {},
	) => {
		const entryPath = str((decl as FrameSurfaceDecl | null)?.entry)
		if (!entryPath) {
			problems.push(`${where}: no entry — a frame surface is a document to mount`)
			return
		}
		// Refused here rather than previewed, because an instance refuses it
		// too — and does so without saying anything. A harness that rendered
		// this surface would be showing one that can never exist.
		if (!isServableEntry(entryPath)) {
			problems.push(
				`${where}: '${entryPath}' is not a path an instance will serve, and it drops ` +
					`such a surface silently. Use relative segments of letters, digits, '.', ` +
					`'-' and '_' — no leading slash, no '..'.`,
			)
			return
		}
		if (extra.panelId && !isServablePanelId(extra.panelId)) {
			problems.push(
				`${where}: panel id '${extra.panelId}' is not one an instance accepts ` +
					`(lowercase letters, digits, '-' and '_'), and it drops such a panel silently.`,
			)
			return
		}
		push({
			id: extra.panelId ? `panel-${slugify(extra.panelId)}` : point,
			label: label((decl as FrameSurfaceDecl).title, extra.panelId ?? point),
			kind: 'frame',
			point,
			entry: entryPath,
			settings: settingsOf((decl as FrameSurfaceDecl).settings),
			source: (extra.source ?? 'surfaces') as PreviewTarget['source'],
			...extra,
		})
	}
	if (s?.['session-view']) frame(s['session-view'], 'session-view', "surfaces['session-view']")
	if (s?.page) frame(s.page, 'page', 'surfaces.page')
	for (const [i, p] of (Array.isArray(s?.panels) ? s.panels : []).entries()) {
		const panelId = str((p as FramePanelDecl | null)?.id)
		if (!panelId) {
			problems.push(`surfaces.panels[${i}]: no id — a layout row keys on it`)
			continue
		}
		frame(p, 'panel', `surfaces.panels[${i}]`, {
			panelId,
			channels: Array.isArray((p as FramePanelDecl).channels)
				? (p as FramePanelDecl).channels
				: undefined,
		})
	}

	// ── frames a genre's shape declares (21 §6) ─────────────────────────────
	// A genre may point a panel at its own package's frame; that panel is a
	// surface this package ships and the harness must render it.
	for (const g of source.genres) {
		// `?.` on every hop, including the element itself. A hand-edited
		// announcement.json with a null in `genres` or `shape.panels` is
		// exactly the input this function promises to survive, and `g.shape`
		// on a null `g` is a TypeError that empties the harness — the one
		// outcome the whole tolerance contract exists to prevent.
		const panels = (g as { shape?: { panels?: unknown[] } } | null)?.shape?.panels
		for (const [i, p] of (Array.isArray(panels) ? panels : []).entries()) {
			const surface = (p as { surface?: { kind?: string; entry?: string } } | null)?.surface
			if (surface?.kind !== 'frame') continue
			const gid = str((g as { id?: unknown } | null)?.id) ?? 'genre'
			const panelId = str((p as { id?: unknown } | null)?.id)
			if (!panelId) {
				problems.push(`${gid}.shape.panels[${i}]: no id`)
				continue
			}
			if (!str(surface.entry)) {
				problems.push(`${gid}.shape.panels[${i}]: frame surface with no entry`)
				continue
			}
			// Same instance grammar as a `surfaces.panels[]` entry — a panel
			// declared through a genre's shape is dropped by the same code.
			if (!isServableEntry(surface.entry!)) {
				problems.push(
					`${gid}.shape.panels[${i}]: '${surface.entry}' is not a path an instance ` +
						`will serve, and it drops such a surface silently`,
				)
				continue
			}
			if (!isServablePanelId(panelId)) {
				problems.push(
					`${gid}.shape.panels[${i}]: panel id '${panelId}' is not one an instance ` +
						`accepts (lowercase letters, digits, '-' and '_')`,
				)
				continue
			}
			push({
				id: `panel-${slugify(panelId)}`,
				label: label((p as { title?: unknown }).title, panelId),
				kind: 'frame',
				point: 'panel',
				entry: surface.entry!,
				settings: settingsOf((p as { settings?: unknown }).settings),
				panelId,
				channels: Array.isArray((p as { channels?: unknown }).channels)
					? ((p as { channels?: string[] }).channels as string[])
					: undefined,
				source: 'genre-shape',
			})
		}
	}

	// ── components: modules the page's UI worker runs (§3.5, R25) ───────────
	for (const [i, c] of source.components.entries()) {
		const slug = str(c?.slug)
		const entryPath = str(c?.entry)
		if (!slug || !entryPath) {
			problems.push(
				`components[${i}]: ${!slug ? 'no slug' : 'no entry'} — both are required (12 §3b)`,
			)
			continue
		}
		push({
			id: slugify(slug),
			label: label(c.label, slug),
			kind: 'component',
			point: 'widget',
			entry: entryPath,
			framework: c.framework,
			settings: settingsOf(c.settings),
			source: 'components',
		})
	}

	return { id, title: source.title, version: source.version, targets, problems }
}

interface Unwrapped {
	id: string
	title: string
	version?: string
	surfaces?: SurfacesDecl
	genres: unknown[]
	components: ComponentDecl[]
}

/**
 * Accept the three entry shapes without importing the announce builder — a
 * structural read keeps this module free of the cycle announce↔surfaces would
 * otherwise create, and keeps a hand-written document just as readable.
 */
function unwrap(entry: unknown, problems: string[]): Unwrapped {
	const e = (entry ?? {}) as Record<string, any>

	// An AnnouncementBuilder: build it, so its own validation still runs and a
	// refusal shows up as a problem rather than an empty harness.
	if (typeof e.build === 'function' && e.identity?.ns) {
		try {
			const { document } = e.build()
			return unwrap(document, problems)
		} catch (err) {
			problems.push(`announcement refused: ${(err as Error).message}`)
			return {
				id: e.identity.ns,
				title: str(e.identity.title) ?? e.identity.ns,
				genres: [],
				components: [],
			}
		}
	}

	// A compiled AnnouncementDocument.
	if (e.schemaVersion === 1 && e.identity?.ns) {
		return {
			id: e.identity.ns,
			title: str(e.identity.title) ?? e.identity.ns,
			version: str(e.identity.version),
			surfaces: e.surfaces,
			genres: Array.isArray(e.genres) ? e.genres : [],
			components: Array.isArray(e.components) ? e.components : [],
		}
	}

	// A defineExtension result. Its `genres` are read for the same reason an
	// announcement's are: since D-1 a plugin declares its genre here, and a genre
	// may point a panel at its own package's frame — a harness reading only
	// `surfaces` would render fewer surfaces than an instance mounts.
	if (str(e.slug)) {
		return {
			id: e.slug,
			title: str(e.name) ?? e.slug,
			version: str(e.version),
			surfaces: e.surfaces,
			genres: Array.isArray(e.genres) ? e.genres : [],
			components: Array.isArray(e.components) ? e.components : [],
		}
	}

	problems.push(
		'the entry module has no default export this harness recognises — export ' +
			'your defineExtension(…) result',
	)
	return { id: 'unknown', title: 'unknown package', genres: [], components: [] }
}
