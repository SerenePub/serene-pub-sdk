/**
 * Declared UI surfaces, and the preview manifest a harness reads from them.
 *
 * A package's UI arrives in exactly two shapes, and the difference is a trust
 * decision, not a taste one:
 *
 *   **frame** — a document (`ui/map.html`) mounted in an opaque-origin iframe
 *   (`sandbox="allow-scripts"`, never `allow-same-origin`). Zero ambient
 *   anything: no cookies, no DOM reach, no socket. Everything it knows arrives
 *   on the MessageChannel the host owns (§ protocol v1 below). This is the
 *   shape the app ships today — session-view replacement, page, panel grid
 *   (20 §12, 21 §7).
 *
 *   **component** — code the host mounts *in its own document* (10 §2's
 *   virtual tier). Code trust at install; no boundary but the error boundary.
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
 * ## Frame protocol v1 (host ⇄ frame, over the transferred port)
 *
 * The types below are the one declaration of the wire the app's `PluginFrame`
 * and the preview harness both speak. They are data, not behaviour: the SDK
 * ships no host and no client, because the host is core's (it owns the
 * scoping) and the client is the author's.
 */

import type { ComponentDecl } from './extension.js'
import type { SettingsSchema } from './settings.js'

/**
 * Where a package's entry module lives, in the order the toolchain looks.
 * One list, shared by `serene-pub build` and the preview harness, so "the
 * harness found my plugin but the packager didn't" cannot happen.
 */
export const ENTRY_CANDIDATES = ['dist/index.js', 'src/index.ts', 'index.ts', 'index.js'] as const

// ── Declarations ────────────────────────────────────────────────────────────

/** One frame surface: the document to mount, and what to call it. */
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
	 * The intended shape: values reach a frame as `{ t: 'props', props }` and
	 * a component as `ctx.settings`. One declaration, two deliveries — the
	 * difference is the boundary, not the vocabulary.
	 *
	 * ⚠ **Core does not deliver these yet.** `frameHost.surfacesOf` narrows a
	 * stored surface to `{entry, title}` and drops `settings`, and
	 * `Panel.svelte` posts a hardcoded `{panelId, title}`; there is also no
	 * persistence for values an admin might set. `serene-pub ui` generates the
	 * editor and posts the result so a surface can be built against it, but a
	 * frame must read these defensively and keep its own defaults until core's
	 * delivery path exists.
	 */
	settings?: SettingsSchema
}

/** A frame panel in the session surface grid (21 §7). `id` is what a
 * `surface:open` intent and a saved layout row key on. */
export interface FramePanelDecl extends FrameSurfaceDecl {
	id: string
	/** The lanes this panel views (20 §4/§7). A panel is a view onto channels. */
	channels?: string[]
}

/**
 * What a package declares under `surfaces` — the exact shape the app's
 * `frameHost.surfacesOf` reads out of a stored manifest.
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
	/** Panels offered to the session surface grid. */
	panels?: FramePanelDecl[]
}

/** The three frame points, spelled as the app spells them. */
export type FramePoint = 'session-view' | 'page' | 'panel'

// ── Frame protocol v1 ───────────────────────────────────────────────────────

/** host → frame. `init` carries the port; everything after rides it. */
export type HostFrameMessage =
	| { t: 'init'; protocol: FrameProtocolVersion; surface: FramePoint; payload?: unknown }
	| { t: 'session'; session: unknown }
	| { t: 'messages'; messages: unknown[] }
	| { t: 'message'; message: unknown }
	| { t: 'channel'; channel: string; messages: unknown[] }
	| { t: 'props'; props: Record<string, unknown> }
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
	 * ⚠ Declared here so the harness and core stay pinned to one union, but
	 * **core does not send this yet** — today only `serene-pub ui` does. A
	 * frame must therefore treat it as optional and keep a sane default.
	 */
	| { t: 'theme'; theme: string; mode: 'light' | 'dark' }
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
 * frame → host. Deliberately tiny: a frame proposes, the host decides.
 *
 * "Tiny" was doing too much work in v1, which had only `ready` and `action`.
 * A frame that failed to boot was indistinguishable from one that was merely
 * slow; a frame showing a long channel could not page; and a frame with any
 * view state lost it on every remount. None of those are the host giving up
 * control — they are the frame reporting and requesting, with the host still
 * deciding. Each addition below is one of those three.
 */
export type FrameHostMessage =
	| { t: 'ready' }
	| { t: 'action'; fn: string; messageId?: number; payload?: Record<string, unknown> }
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
	/** Persist small view state (a scroll offset, an open tab). Returned as
	 *  `state` on the next mount. Not storage: the host may cap or drop it. */
	| { t: 'save-state'; state: Record<string, unknown> }

/**
 * Protocol 2 adds the three frame → host messages above and their two replies.
 *
 * A v1 frame keeps working unchanged: it never sends the new messages, and it
 * must already ignore host messages it does not recognise. A v2 host must
 * still accept `init` from a v1 frame — the version says what the frame *may*
 * send, not what it must.
 */
export const FRAME_PROTOCOL = 2 as const
export type FrameProtocolVersion = 1 | 2

// ── The preview manifest ────────────────────────────────────────────────────

/** One thing the harness can put on screen. */
export interface PreviewTarget {
	/** URL-safe, unique within the manifest — the harness routes on it. */
	id: string
	label: string
	kind: 'frame' | 'component'
	/**
	 * For a frame, one of `FramePoint`. For a component, the surface point it
	 * declared (`core:surface/settings-section@1`) — the harness shows it, it
	 * does not interpret it.
	 */
	point: string
	/** Path to the entry, exactly as declared — relative to the package root. */
	entry: string
	/** Components only: which adapter renders it (10 §7). */
	framework?: 'svelte' | 'react' | 'vanilla'
	/** Panels only: the declared panel id `surface:open` keys on. */
	panelId?: string
	/** Panels only: the lanes this panel views. */
	channels?: string[]
	/** Component-side settings the target reads through `ctx` (12 §6). */
	settings?: SettingsSchema
	/** Where the declaration came from, for the harness's "declared in" line. */
	source: 'surfaces' | 'genre-shape' | 'components'
}

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

/** Would an instance serve this entry path, or quietly drop the surface? */
export const isServableEntry = (path: string): boolean =>
	SAFE_ENTRY.test(path) && !path.split('/').some((seg) => seg === '.' || seg === '..')

/** Would an instance accept this panel id, or quietly drop the panel? */
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
 * Takes whatever the entry module's default export is: an `AnnouncementBuilder`
 * (the announce() path, 24 §6), an already-compiled `AnnouncementDocument`, or
 * a `defineExtension` result. One shape lands, because the harness should not
 * care which authoring surface a modder is on.
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

	// ── in-document components (10 §2, virtual tier) ────────────────────────
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
			point: str(c.surface) ?? 'unknown',
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

	// A defineExtension result.
	if (str(e.slug)) {
		return {
			id: e.slug,
			title: str(e.name) ?? e.slug,
			version: str(e.version),
			surfaces: e.surfaces,
			genres: [],
			components: Array.isArray(e.components) ? e.components : [],
		}
	}

	problems.push(
		'the entry module has no default export this harness recognises — export ' +
			'your announce(…) builder, its built document, or a defineExtension(…) result',
	)
	return { id: 'unknown', title: 'unknown package', genres: [], components: [] }
}
