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
import type { SettingsSchema } from './settings.js';
/**
 * Where a package's entry module lives, in the order the toolchain looks.
 * One list, shared by `serene-pub build` and the preview harness, so "the
 * harness found my plugin but the packager didn't" cannot happen.
 */
export declare const ENTRY_CANDIDATES: readonly ['dist/index.js', 'src/index.ts', 'index.ts', 'index.js'];
/** One frame surface: the document to mount, and what to call it. */
export interface FrameSurfaceDecl {
    /** Path to the document, relative to the package root — `ui/map.html`. */
    entry: string;
    title?: string;
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
    settings?: SettingsSchema;
}
/** A frame panel in the session surface grid (21 §7). `id` is what a
 * `surface:open` intent and a saved layout row key on. */
export interface FramePanelDecl extends FrameSurfaceDecl {
    id: string;
    /** The lanes this panel views (20 §4/§7). A panel is a view onto channels. */
    channels?: string[];
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
    'session-view'?: FrameSurfaceDecl;
    /** A standalone page under the app's plugin route shell. */
    page?: FrameSurfaceDecl;
    /** Panels offered to the session surface grid. */
    panels?: FramePanelDecl[];
}
/** The three frame points, spelled as the app spells them. */
export type FramePoint = 'session-view' | 'page' | 'panel';
/** host → frame. `init` carries the port; everything after rides it. */
export type HostFrameMessage = {
    t: 'init';
    protocol: FrameProtocolVersion;
    surface: FramePoint;
    payload?: unknown;
} | {
    t: 'session';
    session: unknown;
} | {
    t: 'messages';
    messages: unknown[];
} | {
    t: 'message';
    message: unknown;
} | {
    t: 'channel';
    channel: string;
    messages: unknown[];
} | {
    t: 'props';
    props: Record<string, unknown>;
}
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
 | {
    t: 'theme';
    theme: string;
    mode: 'light' | 'dark';
} | {
    t: 'suspend';
} | {
    t: 'resume';
}
/**
 * A page of whatever the frame last asked for, echoing its `requestId`.
 * Without this a frame had no way to ask for anything: `messages` and
 * `channel` arrive when the host feels like sending them, so a long channel
 * could only be rendered in whatever slice the host chose.
 */
 | {
    t: 'page';
    requestId: string;
    rows: unknown[];
    nextCursor?: string;
}
/** The frame's own persisted view state, restored on (re)mount — see
 *  `save-state`. */
 | {
    t: 'state';
    state: Record<string, unknown>;
};
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
export type FrameHostMessage = {
    t: 'ready';
} | {
    t: 'action';
    fn: string;
    messageId?: number;
    payload?: Record<string, unknown>;
}
/**
 * Something went wrong inside the frame. The host logs it against the
 * plugin and may surface it in the panel's chrome — which is the whole
 * point: a broken total-conversion surface should say so rather than sit
 * blank.
 */
 | {
    t: 'error';
    message: string;
    detail?: unknown;
    fatal?: boolean;
}
/**
 * Ask for a page of a channel's messages. The host answers with `page`
 * carrying the same `requestId`, or declines silently — a request is not a
 * grant.
 */
 | {
    t: 'request';
    requestId: string;
    what: 'messages';
    channel?: string;
    cursor?: string;
    limit?: number;
}
/** Persist small view state (a scroll offset, an open tab). Returned as
 *  `state` on the next mount. Not storage: the host may cap or drop it. */
 | {
    t: 'save-state';
    state: Record<string, unknown>;
};
/**
 * Protocol 2 adds the three frame → host messages above and their two replies.
 *
 * A v1 frame keeps working unchanged: it never sends the new messages, and it
 * must already ignore host messages it does not recognise. A v2 host must
 * still accept `init` from a v1 frame — the version says what the frame *may*
 * send, not what it must.
 */
export declare const FRAME_PROTOCOL: 2;
export type FrameProtocolVersion = 1 | 2;
/** One thing the harness can put on screen. */
export interface PreviewTarget {
    /** URL-safe, unique within the manifest — the harness routes on it. */
    id: string;
    label: string;
    kind: 'frame' | 'component';
    /**
     * For a frame, one of `FramePoint`. For a component, the surface point it
     * declared (`core:surface/settings-section@1`) — the harness shows it, it
     * does not interpret it.
     */
    point: string;
    /** Path to the entry, exactly as declared — relative to the package root. */
    entry: string;
    /** Components only: which adapter renders it (10 §7). */
    framework?: 'svelte' | 'react' | 'vanilla';
    /** Panels only: the declared panel id `surface:open` keys on. */
    panelId?: string;
    /** Panels only: the lanes this panel views. */
    channels?: string[];
    /** Component-side settings the target reads through `ctx` (12 §6). */
    settings?: SettingsSchema;
    /** Where the declaration came from, for the harness's "declared in" line. */
    source: 'surfaces' | 'genre-shape' | 'components';
}
export interface PreviewManifest {
    /** The package's address — an announce ns (`acme.dice`) or a plugin slug. */
    id: string;
    title: string;
    version?: string;
    targets: PreviewTarget[];
    /**
     * Declarations that could not be read. Shown beside the list, never thrown:
     * a half-typed entry path must not empty the harness.
     */
    problems: string[];
}
/** Would an instance serve this entry path, or quietly drop the surface? */
export declare const isServableEntry: (path: string) => boolean;
/** Would an instance accept this panel id, or quietly drop the panel? */
export declare const isServablePanelId: (id: string) => boolean;
/**
 * Read a package's UI declarations into the harness's list.
 *
 * Takes whatever the entry module's default export is: an `AnnouncementBuilder`
 * (the announce() path, 24 §6), an already-compiled `AnnouncementDocument`, or
 * a `defineExtension` result. One shape lands, because the harness should not
 * care which authoring surface a modder is on.
 */
export declare function previewManifest(entry: unknown): PreviewManifest;
