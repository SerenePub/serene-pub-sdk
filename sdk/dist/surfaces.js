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
/**
 * Where a package's entry module lives, in the order the toolchain looks.
 * One list, shared by `serene-pub build` and the preview harness, so "the
 * harness found my plugin but the packager didn't" cannot happen.
 */
export const ENTRY_CANDIDATES = ['dist/index.js', 'src/index.ts', 'index.ts', 'index.js'];
/**
 * Protocol 2 adds the three frame → host messages above and their two replies.
 *
 * A v1 frame keeps working unchanged: it never sends the new messages, and it
 * must already ignore host messages it does not recognise. A v2 host must
 * still accept `init` from a v1 frame — the version says what the frame *may*
 * send, not what it must.
 */
export const FRAME_PROTOCOL = 2;
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
const SAFE_ENTRY = /^[a-zA-Z0-9_\-][a-zA-Z0-9._\-]*(\/[a-zA-Z0-9._\-]+)*$/;
const SAFE_PANEL_ID = /^[a-z0-9_-]+$/;
/** Would an instance serve this entry path, or quietly drop the surface? */
export const isServableEntry = (path) => SAFE_ENTRY.test(path) && !path.split('/').some((seg) => seg === '.' || seg === '..');
/** Would an instance accept this panel id, or quietly drop the panel? */
export const isServablePanelId = (id) => SAFE_PANEL_ID.test(id);
const SAFE_ID = /[^a-z0-9]+/g;
const slugify = (s) => s.toLowerCase().replace(SAFE_ID, '-').replace(/^-|-$/g, '') || 'surface';
const str = (v) => (typeof v === 'string' && v.trim() ? v : undefined);
/** A settings schema, or nothing — never a half-read object. */
const settingsOf = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length
    ? v
    : undefined;
/** i18n values are `string | {en: …}` across the SDK; display needs one line. */
const label = (v, fallback) => str(v) ?? str(v?.en) ?? fallback;
/**
 * Read a package's UI declarations into the harness's list.
 *
 * Takes whatever the entry module's default export is: an `AnnouncementBuilder`
 * (the announce() path, 24 §6), an already-compiled `AnnouncementDocument`, or
 * a `defineExtension` result. One shape lands, because the harness should not
 * care which authoring surface a modder is on.
 */
export function previewManifest(entry) {
    const problems = [];
    const targets = [];
    const seen = new Set();
    const source = unwrap(entry, problems);
    const id = source.id;
    const push = (t) => {
        let unique = t.id;
        for (let n = 2; seen.has(unique); n++)
            unique = `${t.id}-${n}`;
        seen.add(unique);
        targets.push({ ...t, id: unique });
    };
    // ── frames declared under `surfaces` ────────────────────────────────────
    const s = source.surfaces;
    const frame = (decl, point, where, extra = {}) => {
        const entryPath = str(decl?.entry);
        if (!entryPath) {
            problems.push(`${where}: no entry — a frame surface is a document to mount`);
            return;
        }
        // Refused here rather than previewed, because an instance refuses it
        // too — and does so without saying anything. A harness that rendered
        // this surface would be showing one that can never exist.
        if (!isServableEntry(entryPath)) {
            problems.push(`${where}: '${entryPath}' is not a path an instance will serve, and it drops ` +
                `such a surface silently. Use relative segments of letters, digits, '.', ` +
                `'-' and '_' — no leading slash, no '..'.`);
            return;
        }
        if (extra.panelId && !isServablePanelId(extra.panelId)) {
            problems.push(`${where}: panel id '${extra.panelId}' is not one an instance accepts ` +
                `(lowercase letters, digits, '-' and '_'), and it drops such a panel silently.`);
            return;
        }
        push({
            id: extra.panelId ? `panel-${slugify(extra.panelId)}` : point,
            label: label(decl.title, extra.panelId ?? point),
            kind: 'frame',
            point,
            entry: entryPath,
            settings: settingsOf(decl.settings),
            source: (extra.source ?? 'surfaces'),
            ...extra,
        });
    };
    if (s?.['session-view'])
        frame(s['session-view'], 'session-view', "surfaces['session-view']");
    if (s?.page)
        frame(s.page, 'page', 'surfaces.page');
    for (const [i, p] of (Array.isArray(s?.panels) ? s.panels : []).entries()) {
        const panelId = str(p?.id);
        if (!panelId) {
            problems.push(`surfaces.panels[${i}]: no id — a layout row keys on it`);
            continue;
        }
        frame(p, 'panel', `surfaces.panels[${i}]`, {
            panelId,
            channels: Array.isArray(p.channels)
                ? p.channels
                : undefined,
        });
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
        const panels = g?.shape?.panels;
        for (const [i, p] of (Array.isArray(panels) ? panels : []).entries()) {
            const surface = p?.surface;
            if (surface?.kind !== 'frame')
                continue;
            const gid = str(g?.id) ?? 'genre';
            const panelId = str(p?.id);
            if (!panelId) {
                problems.push(`${gid}.shape.panels[${i}]: no id`);
                continue;
            }
            if (!str(surface.entry)) {
                problems.push(`${gid}.shape.panels[${i}]: frame surface with no entry`);
                continue;
            }
            // Same instance grammar as a `surfaces.panels[]` entry — a panel
            // declared through a genre's shape is dropped by the same code.
            if (!isServableEntry(surface.entry)) {
                problems.push(`${gid}.shape.panels[${i}]: '${surface.entry}' is not a path an instance ` +
                    `will serve, and it drops such a surface silently`);
                continue;
            }
            if (!isServablePanelId(panelId)) {
                problems.push(`${gid}.shape.panels[${i}]: panel id '${panelId}' is not one an instance ` +
                    `accepts (lowercase letters, digits, '-' and '_')`);
                continue;
            }
            push({
                id: `panel-${slugify(panelId)}`,
                label: label(p.title, panelId),
                kind: 'frame',
                point: 'panel',
                entry: surface.entry,
                settings: settingsOf(p.settings),
                panelId,
                channels: Array.isArray(p.channels)
                    ? p.channels
                    : undefined,
                source: 'genre-shape',
            });
        }
    }
    // ── in-document components (10 §2, virtual tier) ────────────────────────
    for (const [i, c] of source.components.entries()) {
        const slug = str(c?.slug);
        const entryPath = str(c?.entry);
        if (!slug || !entryPath) {
            problems.push(`components[${i}]: ${!slug ? 'no slug' : 'no entry'} — both are required (12 §3b)`);
            continue;
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
        });
    }
    return { id, title: source.title, version: source.version, targets, problems };
}
/**
 * Accept the three entry shapes without importing the announce builder — a
 * structural read keeps this module free of the cycle announce↔surfaces would
 * otherwise create, and keeps a hand-written document just as readable.
 */
function unwrap(entry, problems) {
    const e = (entry ?? {});
    // An AnnouncementBuilder: build it, so its own validation still runs and a
    // refusal shows up as a problem rather than an empty harness.
    if (typeof e.build === 'function' && e.identity?.ns) {
        try {
            const { document } = e.build();
            return unwrap(document, problems);
        }
        catch (err) {
            problems.push(`announcement refused: ${err.message}`);
            return {
                id: e.identity.ns,
                title: str(e.identity.title) ?? e.identity.ns,
                genres: [],
                components: [],
            };
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
        };
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
        };
    }
    problems.push('the entry module has no default export this harness recognises — export ' +
        'your announce(…) builder, its built document, or a defineExtension(…) result');
    return { id: 'unknown', title: 'unknown package', genres: [], components: [] };
}
//# sourceMappingURL=surfaces.js.map