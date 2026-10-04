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
import { WIDGET_PROTOCOL, } from './widgets.js';
/**
 * Where a package's entry module lives, in the order the toolchain looks.
 * One list, shared by `serene-pub build` and the preview harness, so "the
 * harness found my plugin but the packager didn't" cannot happen.
 * @experimental
 */
export const ENTRY_CANDIDATES = ['dist/index.js', 'src/index.ts', 'index.ts', 'index.js'];
/**
 * The plugin slug grammar, mirrored from `defineExtension` — lowercase
 * letters, digits, dots and hyphens, `chariot.dice-tray`, never a slash and
 * never a colon.
 *
 * Here as well as there for the reason {@link isServablePanelId} is here: this
 * module owns the two halves of a namespaced widget id, and a parser that
 * borrowed one grammar and restated the other would be half a contract.
 */
const SAFE_PLUGIN_ID = /^[a-z0-9]+([.-][a-z0-9]+)*$/;
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
export const pluginWidgetId = (pluginId, panelId) => `${pluginId}:${panelId}`;
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
export function parsePluginWidgetId(id) {
    const cut = id.indexOf(':');
    if (cut <= 0)
        return null;
    const pluginId = id.slice(0, cut);
    const panelId = id.slice(cut + 1);
    if (!SAFE_PLUGIN_ID.test(pluginId) || !isServablePanelId(panelId))
        return null;
    return { pluginId, panelId };
}
/**
 * The version the host announces in `init`, and the number a frame reads to
 * know what it may send.
 *
 * **2 comprises** everything declared in the two unions above: the widget
 * envelope's sections as pushes (`settings`, `layout`, `event`,
 * `actions`) alongside `session` / `messages` / `message` / `channel` /
 * `props` / `theme` / `suspend` / `resume`, and, frame → host, `invoke`
 * beside `ready` and `action`, plus `error`, `request` and `save-state` with
 * their `page` and `state` replies.
 *
 * A host may DECLINE any of the last three and still be a v2 host: a `request`
 * is not a grant, `save-state` may be capped or dropped, and an `error` may go
 * no further than a log. What 2 promises is that the frame may send them
 * without breaking the wire — never that the host will act on them. A frame
 * that needs an answer must therefore tolerate not getting one, just as it
 * ignores a host message it has never heard of.
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
export const FRAME_PROTOCOL = WIDGET_PROTOCOL;
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
/** Would an instance serve this entry path, or quietly drop the surface? @internal */
export const isServableEntry = (path) => SAFE_ENTRY.test(path) && !path.split('/').some((seg) => seg === '.' || seg === '..');
/** Would an instance accept this panel id, or quietly drop the panel? @internal */
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
 * Takes the entry module's default export: a `defineExtension` result. An
 * `AnnouncementBuilder` or a compiled `AnnouncementDocument` is still read, for
 * packages built before `defineExtension` became the one entry.
 * @experimental
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
    const frame = (decl, point, where) => {
        const entryPath = str(decl?.entry);
        if (!entryPath) {
            problems.push(`${where}: no entry — a frame surface is a document to mount`);
            return;
        }
        // Refused here rather than previewed, because an instance refuses it
        // too — and does so without saying anything. A harness that rendered
        // this surface would be showing one that can never exist.
        if (!isServableEntry(entryPath)) {
            problems.push(`${where}: '${entryPath}' is not a path a pub will serve, and it drops ` +
                `such a surface silently. Use relative segments of letters, digits, '.', ` +
                `'-' and '_' — no leading slash, no '..'.`);
            return;
        }
        push({
            id: point,
            label: label(decl.title, point),
            kind: 'frame',
            point,
            entry: entryPath,
            source: 'surfaces',
        });
    };
    if (s?.['session-view'])
        frame(s['session-view'], 'session-view', "surfaces['session-view']");
    if (s?.page)
        frame(s.page, 'page', 'surfaces.page');
    // ── components: modules the page's UI worker runs (§3.5, R25) ───────────
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
            point: 'widget',
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
                widgets: [],
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
            widgets: Array.isArray(e.widgets) ? e.widgets : [],
        };
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
            widgets: Array.isArray(e.widgets) ? e.widgets : [],
        };
    }
    problems.push('the entry module has no default export this harness recognises — export ' +
        'your defineExtension(…) result');
    return { id: 'unknown', title: 'unknown package', genres: [], components: [], widgets: [] };
}
//# sourceMappingURL=surfaces.js.map