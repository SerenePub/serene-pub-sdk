/**
 * The **session layout** (`SessionLayoutV1`, NOMENCLATURE §9) — the ONE layout
 * format: what the screen draws, what a person arranges, what a genre or a
 * plugin ships (`GenreLayoutDecl.preset`), and what a **session layout preset**
 * row stores. Plain JSON, stored verbatim; every reader reads it defensively,
 * so a key this build does not know degrades rather than throws.
 *
 * ## The shape in one paragraph
 *
 * Its **arrangement** is three slots, three views of one placement:
 *
 * - `zoneLayout` — the side zones' membership: which widgets each side lists,
 *   in order, whether the side is pinned (a docked column) or an icon strip,
 *   its width ladder, and `styles.chat` (the message pack, by name).
 * - `widgetGrid` — the widget grid: each widget's zone, order, size and the
 *   edges it anchors to. The middle's membership lives here; a side's may too.
 * - `arrangedGrid` — the arrangement per zone: whole grid cells (`cols` ×
 *   `rows`) and each widget's cell box. Where a zone has one, it is what draws.
 *
 * A named layout adds `widgetSettings` and `widgetStyles` (per-instance values
 * and style pins), so one blob is the portable layout. A session keeps those
 * two in its own rows instead, and its row adds the surface manager's
 * bookkeeping (`active`, `tierSizeOverrides`), which is the app's.
 *
 * ## Widget instance ids
 *
 * A layout places a widget under a **widget instance id**: the widget id
 * itself (`messages`, `acme.maps:map`), or `<widget id>#<instance name>` for
 * another copy of it in the same layout (`messages#sanctum`). Everything a
 * layout keys per placed copy — the zone lists, grid entries and cells, the
 * `widgetSettings` and `widgetStyles` keys — is an instance id; everything
 * about the widget (its declaration, its style rows) is read through
 * {@link widgetOfInstance}.
 *
 * ## What is deliberately not here
 *
 * No renderer, no normalizer and no measurement: those are the app's, which
 * reads a stored blob it did not write and must repair rather than refuse.
 * This module types the format, reads the ids out of it, and checks a layout a
 * package SHIPS ({@link validateSessionLayout}), where refusing is right. No
 * `svelte` import, ever: a linked package that imports svelte gives the app a
 * second Svelte.
 */
import { parsePluginWidgetId } from './surfaces.js';
// ── Zones ───────────────────────────────────────────────────────────────────
/** The three zones, in visual order. There is no fourth. @experimental */
export const ZONE_IDS = ['left', 'middle', 'right'];
// ── Widget instance ids ─────────────────────────────────────────────────────
/** The separator between a widget id and an instance name. @experimental */
export const INSTANCE_NAME_SEPARATOR = '#';
/** An instance name: short, kebab, lower case (`sanctum`, `2`). @experimental */
export const INSTANCE_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Core's widget id grammar — the bare half a package never namespaces. */
const CORE_WIDGET_ID = /^[a-z][a-z0-9-]*$/;
/** The widget a placed id is a copy of: the id up to its `#`, else the id. @experimental */
export function widgetOfInstance(instanceId) {
    const at = instanceId.indexOf(INSTANCE_NAME_SEPARATOR);
    return at > 0 ? instanceId.slice(0, at) : instanceId;
}
/** The instance name of a copy (`sanctum` of `messages#sanctum`), or `null` for the widget itself. @experimental */
export function instanceNameOf(instanceId) {
    const at = instanceId.indexOf(INSTANCE_NAME_SEPARATOR);
    return at > 0 && at < instanceId.length - 1 ? instanceId.slice(at + 1) : null;
}
/** Is this placed id a copy of `widgetId` — the widget itself or one of its instances? @experimental */
export function isInstanceOf(instanceId, widgetId) {
    return widgetOfInstance(instanceId) === widgetId;
}
/**
 * Is this string a widget instance id a layout may place? The widget half is
 * core's grammar (`world-state`) or a plugin's namespaced one
 * (`acme.maps:map`, `parsePluginWidgetId`); the instance name, when there is
 * one, is {@link INSTANCE_NAME}.
 * @experimental
 */
export function isWidgetInstanceId(id) {
    if (typeof id !== 'string' || !id)
        return false;
    const at = id.indexOf(INSTANCE_NAME_SEPARATOR);
    const widget = at < 0 ? id : id.slice(0, at);
    if (at >= 0 && !INSTANCE_NAME.test(id.slice(at + 1)))
        return false;
    return CORE_WIDGET_ID.test(widget) || parsePluginWidgetId(widget) !== null;
}
/**
 * Widget ids that name nothing any build places. A saved layout, a preset or
 * an arrangement may still carry one — all three are stored verbatim and
 * nothing rewrites them — so every reader drops it.
 *
 * `composer` is one because the conversation is ONE widget: the log and the
 * field are one thing to arrange, and the field's shape is a setting on
 * `messages` rather than a widget beside it.
 *
 * `inventory` is one because R79 (2026-09-25) removed core's Inventory widget
 * for now, with no replacement. Adventure and Lair shipped it, so layouts and
 * presets saved from them name it; dropping it here is what makes such a
 * layout open on the widgets it still has — nothing drawn in its place, no
 * labelled placeholder. What somebody carries is the `inventory` stat, which
 * the stats widget draws as a list. Take it off this list if the widget comes
 * back.
 * @experimental
 */
export const RETIRED_WIDGET_IDS = new Set(['composer', 'inventory']);
// ── Reading ids ─────────────────────────────────────────────────────────────
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = (x) => Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [];
/** The grid's entries for one zone, by `order`. */
function gridIn(layout, zone) {
    const widgets = isObj(layout.widgetGrid) && Array.isArray(layout.widgetGrid.widgets) ? layout.widgetGrid.widgets : [];
    return widgets
        .filter((w) => isObj(w) && w.zone === zone && typeof w.id === 'string')
        .map((w, n) => ({ id: w.id, order: typeof w.order === 'number' ? w.order : n }))
        .sort((a, b) => a.order - b.order)
        .map((w) => w.id);
}
/** An arranged zone's ids in reading order (by row, then column), or null when the zone has none. */
function arrangedIn(layout, zone) {
    const frame = isObj(layout.arrangedGrid) ? layout.arrangedGrid[zone] : undefined;
    if (!isObj(frame) || !Array.isArray(frame.items))
        return null;
    return frame.items
        .filter((i) => isObj(i) && typeof i.id === 'string')
        .map((i) => ({ id: i.id, x: Number(i.x) || 0, y: Number(i.y) || 0 }))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((i) => i.id);
}
/** The zone definitions of `zoneLayout`, whatever its keys. */
function zoneDefs(layout) {
    const zones = isObj(layout.zoneLayout) ? layout.zoneLayout.zones : undefined;
    return isObj(zones) ? Object.values(zones).filter(isObj) : [];
}
/**
 * Where the page draws a zone of `zoneLayout` — the one rule, which the id
 * readers and the validator share with the page: a strip at its `area` (the
 * top unless it says bottom); anything else is a side, on its `side` (the
 * right unless it says left). Never the zone's key.
 */
function zoneDrawnAt(def) {
    if (def.kind === 'strip')
        return def.area === 'bottom' ? 'bottom' : 'top';
    return def.side === 'left' ? 'left' : 'right';
}
/**
 * Every widget instance id the layout NAMES — the zone lists, the grid and the
 * arrangement — each once, in that order. What a check reads when the question
 * is "does this layout mention it at all" (a genre's omitted widgets).
 * @experimental
 */
export function layoutWidgetIds(layout) {
    const out = new Set();
    for (const z of zoneDefs(layout))
        for (const id of strings(z.widgets))
            out.add(id);
    const grid = isObj(layout.widgetGrid) && Array.isArray(layout.widgetGrid.widgets) ? layout.widgetGrid.widgets : [];
    for (const w of grid)
        if (isObj(w) && typeof w.id === 'string')
            out.add(w.id);
    for (const zone of ZONE_IDS)
        for (const id of arrangedIn(layout, zone) ?? [])
            out.add(id);
    return [...out];
}
/**
 * The widget instance ids the MIDDLE names: the grid's middle entries, then
 * the arranged middle's items, each once.
 * @experimental
 */
export function middleWidgetIds(layout) {
    return [...new Set([...gridIn(layout, 'middle'), ...(arrangedIn(layout, 'middle') ?? [])])];
}
/**
 * Every widget instance id the layout DRAWS, in reading order — middle, left,
 * right, then any strips — which is the page's own precedence, place by place:
 *
 * - the middle draws its arrangement whenever it has one (an emptied middle
 *   stays empty), else the grid's middle entries;
 * - a side draws its arrangement when that places anything, else the lists
 *   of the zones on it (by their `side`, never their key) — and, folded into
 *   them, any grid entry naming that side, but only when the layout has a
 *   zone on that side to fold it into;
 * - a strip draws its list.
 *
 * So an entry an arrangement shadows is named but not drawn. A retired widget
 * id is never drawn.
 * @experimental
 */
export function drawnWidgetIds(layout) {
    const out = [];
    const add = (id) => {
        if (!RETIRED_WIDGET_IDS.has(id) && !out.includes(id))
            out.push(id);
    };
    (arrangedIn(layout, 'middle') ?? gridIn(layout, 'middle')).forEach(add);
    const defs = zoneDefs(layout);
    for (const side of ['left', 'right']) {
        const frame = arrangedIn(layout, side);
        if (frame?.length) {
            frame.forEach(add);
            continue;
        }
        const zones = defs.filter((z) => zoneDrawnAt(z) === side);
        for (const z of zones)
            strings(z.widgets).forEach(add);
        if (zones.length)
            gridIn(layout, side).forEach(add);
    }
    for (const z of defs)
        if (z.kind === 'strip')
            strings(z.widgets).forEach(add);
    return out;
}
/**
 * Does the layout DRAW any instance of `primaryId` — the bare id or a
 * `#name` copy — anywhere? The **primary floor**'s question: placement is
 * free, and the one rule left is that a layout draws its genre's primary
 * widget somewhere.
 * @experimental
 */
export function primaryPlaced(layout, primaryId) {
    return drawnWidgetIds(layout).some((id) => isInstanceOf(id, primaryId));
}
const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
/** The slots a session layout has. */
const SLOTS = ['zoneLayout', 'widgetGrid', 'arrangedGrid', 'widgetSettings', 'widgetStyles'];
/** The top-level keys only the retired layout document had (and its preset wrapper, `layout`). */
const RETIRED_DOCUMENT_KEYS = ['layout', 'version', 'zones', 'variants', 'look'];
function isSizeSpec(x) {
    if (x === 'grow' || x === 'fixed')
        return true;
    if (!isObj(x))
        return false;
    const keys = ['minCells', 'maxCells', 'cells'].filter((k) => x[k] !== undefined);
    return keys.length > 0 && keys.every((k) => typeof x[k] === 'number' && x[k] > 0);
}
function isAnchor(x) {
    return isObj(x) && Object.entries(x).every(([k, v]) => ['top', 'bottom', 'left', 'right'].includes(k) && typeof v === 'boolean');
}
/**
 * Check a layout a package ships — the rules its type cannot express. Pure;
 * the verdict lists every problem rather than the first.
 *
 * **Errors** (the layout is refused):
 * - a slot of the wrong shape: `zoneLayout` and `widgetGrid` are `version: 1`;
 *   a grid entry and an arrangement name a zone, `left`, `middle` or
 *   `right`; a `zoneLayout` zone is keyed by where the page draws it — a
 *   side by its `side` (`left`, `right`), a strip by its `area` (`top`,
 *   `bottom`);
 * - a placed id that is not a widget instance id (`<widget id>` or
 *   `<widget id>#<instance name>`);
 * - an arranged cell that is not whole cells inside its zone's `cols` × `rows`;
 * - an id placed twice: a widget instance lives in ONE zone, listed once. The
 *   three slots may each name it there — a side lists it, its arrangement
 *   gives it cells — but never in two zones (a zone as the page draws it),
 *   and never twice in one list;
 * - a `widgetSettings` value that is not an object, a `widgetStyles` pin with
 *   no slug;
 * - the retired layout document (LayoutDoc v2), bare or in its preset
 *   wrapper — refused by name, never read as a layout that places nothing.
 *
 * **Warnings** (the layout draws, not as written):
 * - a key that is not a slot (readers ignore it) and a retired widget;
 * - an id placed but never drawn ({@link drawnWidgetIds}): its zone's
 *   arrangement draws over it, or the grid puts it in a side the layout has
 *   no zone for;
 * - two arranged items sharing a cell (one draws over the other);
 * - with `opts.widgets`, more instances of a widget than its
 *   `maxInstances` (readers draw the first ones in reading order);
 * - with `opts.unknownWidgets: 'warn'` too, a widget `opts.widgets` does not
 *   hold (it draws a labelled placeholder).
 * @experimental
 */
export function validateSessionLayout(layout, opts = {}) {
    const errors = [];
    const warnings = [];
    if (!isObj(layout))
        return { ok: false, errors: ['a session layout is an object'], warnings };
    // The retired layout document (LayoutDoc v2) — bare, or inside the
    // `{ layout, widgetSettings, widgetStyles }` preset that carried it — is
    // refused by name rather than read as a layout that places nothing: no
    // reader converts it (owner L1).
    if (RETIRED_DOCUMENT_KEYS.some((k) => k in layout))
        errors.push(`a retired layout document (LayoutDoc v2: ${RETIRED_DOCUMENT_KEYS.filter((k) => k in layout).join(', ')}) — ` +
            'declare a session layout: { zoneLayout?, widgetGrid?, arrangedGrid?, widgetSettings?, widgetStyles? }');
    for (const k of Object.keys(layout))
        if (!SLOTS.includes(k) && !RETIRED_DOCUMENT_KEYS.includes(k))
            warnings.push(`'${k}' is not a slot of the session layout — readers ignore it`);
    /** Where each id is placed: the zone the page draws it in, first seen at `where`. */
    const placedIn = new Map();
    const isInstanceId = (id, where) => {
        if (isWidgetInstanceId(id))
            return true;
        errors.push(`${where}: '${String(id)}' is not a widget instance id — a widget id, or '<widget id>#<instance name>' (${INSTANCE_NAME})`);
        return false;
    };
    const place = (id, zone, where, seen) => {
        if (!isInstanceId(id, where))
            return;
        if (seen.has(id))
            errors.push(`${where}: '${id}' is listed twice — a widget instance is placed once`);
        seen.add(id);
        const held = placedIn.get(id);
        if (held && held.zone !== zone)
            errors.push(`${where}: '${id}' is also placed in ${held.zone} (${held.where}) — a widget instance lives in one zone`);
        else if (!held)
            placedIn.set(id, { zone, where });
    };
    const zoneKey = (k, where) => {
        if (ZONE_IDS.includes(k))
            return true;
        errors.push(`${where}: '${k}' is not a zone — one of ${ZONE_IDS.join(', ')}`);
        return false;
    };
    // zoneLayout
    const zl = layout.zoneLayout;
    if (zl !== undefined) {
        if (!isObj(zl) || zl.version !== 1 || !isObj(zl.zones))
            errors.push('zoneLayout: { version: 1, zones: { … } }');
        else {
            for (const [key, def] of Object.entries(zl.zones)) {
                const at = `zoneLayout.zones.${key}`;
                if (!isObj(def)) {
                    errors.push(`${at}: a zone is an object`);
                    continue;
                }
                if (def.kind !== 'side' && def.kind !== 'strip')
                    errors.push(`${at}.kind: 'side' or 'strip'`);
                if (def.side !== undefined && def.side !== 'left' && def.side !== 'right')
                    errors.push(`${at}.side: 'left' or 'right'`);
                if (def.area !== undefined && def.area !== 'top' && def.area !== 'bottom')
                    errors.push(`${at}.area: 'top' or 'bottom'`);
                if (def.pinned !== undefined && typeof def.pinned !== 'boolean')
                    errors.push(`${at}.pinned: a boolean`);
                if (def.rules !== undefined && (!Array.isArray(def.rules) || def.rules.some((r) => !isObj(r) || typeof r.min !== 'number')))
                    errors.push(`${at}.rules: a list of { min, mode?, width?, columns? }`);
                // ONE way to say where a zone is: the page reads `side` / `area`
                // (absent: the right / the top), so the key must say the same.
                const drawnAt = zoneDrawnAt(def);
                if (key !== drawnAt) {
                    const strip = def.kind === 'strip';
                    const field = strip ? 'area' : 'side';
                    const unstated = def[field] === undefined ? ` (it states no ${field}, and ${strip ? 'a strip with none is the top' : 'a side zone with none is the right'})` : '';
                    const fixes = (strip ? ['top', 'bottom'] : ['left', 'right']).includes(key)
                        ? `key it '${drawnAt}', or set ${field}: '${key}'`
                        : `key it '${drawnAt}'`;
                    errors.push(`${at}: the page draws this ${strip ? 'strip' : 'side zone'} at the ${drawnAt}${unstated} — ` +
                        `a zone is keyed by where it is drawn (a side by its side, a strip by its area${key === 'middle' ? "; the middle's membership is the widget grid's" : ''}): ${fixes}`);
                }
                if (!Array.isArray(def.widgets)) {
                    errors.push(`${at}.widgets: a list of widget instance ids`);
                    continue;
                }
                const seen = new Set();
                for (const id of def.widgets)
                    place(id, drawnAt, `${at}.widgets`, seen);
            }
            if (zl.styles !== undefined && (!isObj(zl.styles) || (zl.styles.chat !== undefined && typeof zl.styles.chat !== 'string')))
                errors.push('zoneLayout.styles: { chat?: string }');
        }
    }
    // widgetGrid
    const wg = layout.widgetGrid;
    if (wg !== undefined) {
        if (!isObj(wg) || wg.version !== 1 || !Array.isArray(wg.widgets))
            errors.push('widgetGrid: { version: 1, cell, widgets: [ … ] }');
        else {
            if (typeof wg.cell !== 'number' || !(wg.cell > 0))
                errors.push('widgetGrid.cell: a positive number of px');
            const seen = new Set();
            wg.widgets.forEach((w, n) => {
                const at = `widgetGrid.widgets[${n}]`;
                if (!isObj(w)) {
                    errors.push(`${at}: a grid widget is an object`);
                    return;
                }
                // A missing or non-string zone is refused like a wrong one — and the
                // entry's id is still checked, since it names a widget either way.
                const zone = typeof w.zone === 'string' ? w.zone : undefined;
                const zoned = zone === undefined ? (errors.push(`${at}.zone: one of ${ZONE_IDS.join(', ')}`), false) : zoneKey(zone, `${at}.zone`);
                if (typeof w.order !== 'number' || !Number.isFinite(w.order))
                    errors.push(`${at}.order: a number`);
                if (!isObj(w.size) || !isSizeSpec(w.size.w) || !isSizeSpec(w.size.h))
                    errors.push(`${at}.size: { w, h }, each 'grow', 'fixed' or { cells | minCells | maxCells }`);
                if (!isAnchor(w.anchor))
                    errors.push(`${at}.anchor: { top?, bottom?, left?, right? } of booleans`);
                if (w.colSpan !== undefined && !(isInt(w.colSpan) && w.colSpan > 0))
                    errors.push(`${at}.colSpan: a positive integer`);
                if (w.group !== undefined && typeof w.group !== 'string')
                    errors.push(`${at}.group: a string`);
                if (zoned)
                    place(w.id, zone, 'widgetGrid.widgets', seen);
                else
                    isInstanceId(w.id, 'widgetGrid.widgets');
            });
        }
    }
    // arrangedGrid
    const ag = layout.arrangedGrid;
    if (ag !== undefined) {
        if (!isObj(ag))
            errors.push('arrangedGrid: { left?, middle?, right? }');
        else
            for (const [key, frame] of Object.entries(ag)) {
                const at = `arrangedGrid.${key}`;
                if (!zoneKey(key, at))
                    continue;
                if (!isObj(frame) || !(isInt(frame.cols) && frame.cols > 0) || !(isInt(frame.rows) && frame.rows > 0) || !Array.isArray(frame.items)) {
                    errors.push(`${at}: { cols, rows, items } — whole, positive cols and rows`);
                    continue;
                }
                const { cols, rows } = frame;
                const seen = new Set();
                /** The items with whole-cell boxes, for the overlap check. */
                const boxes = [];
                frame.items.forEach((item, n) => {
                    const where = `${at}.items[${n}]`;
                    if (!isObj(item)) {
                        errors.push(`${where}: an arranged item is an object`);
                        return;
                    }
                    const { x, y, w, h } = item;
                    if (!isInt(x) || !isInt(y) || !isInt(w) || !isInt(h) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > cols || y + h > rows)
                        errors.push(`${where}: whole cells inside ${cols} × ${rows} (x, y ≥ 0; w, h ≥ 1)`);
                    else if (typeof item.id === 'string')
                        boxes.push({ id: item.id, x, y, w, h });
                    if (item.anchor !== undefined && !isAnchor(item.anchor))
                        errors.push(`${where}.anchor: { top?, bottom?, left?, right? } of booleans`);
                    if (item.group !== undefined && typeof item.group !== 'string')
                        errors.push(`${where}.group: a string`);
                    if (item.pinned !== undefined && typeof item.pinned !== 'boolean')
                        errors.push(`${where}.pinned: a boolean`);
                    place(item.id, key, `${at}.items`, seen);
                });
                // Two boxes on one cell: the page draws both, one over the other.
                boxes.forEach((a, i) => {
                    for (const b of boxes.slice(i + 1))
                        if (a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
                            warnings.push(`${at}: '${a.id}' and '${b.id}' share cells — one draws over the other`);
                });
            }
    }
    // widgetSettings / widgetStyles
    const ws = layout.widgetSettings;
    if (ws !== undefined) {
        if (!isObj(ws))
            errors.push('widgetSettings: { [widget instance id]: { … } }');
        else
            for (const [id, v] of Object.entries(ws)) {
                if (!isWidgetInstanceId(id))
                    errors.push(`widgetSettings: '${id}' is not a widget instance id`);
                if (!isObj(v))
                    errors.push(`widgetSettings.${id}: the widget's settings, an object`);
            }
    }
    const pins = layout.widgetStyles;
    if (pins !== undefined) {
        if (!isObj(pins))
            errors.push('widgetStyles: { [widget instance id]: { slug, id? } }');
        else
            for (const [id, v] of Object.entries(pins)) {
                if (!isWidgetInstanceId(id))
                    errors.push(`widgetStyles: '${id}' is not a widget instance id`);
                if (!isObj(v) || typeof v.slug !== 'string' || !v.slug || (v.id !== undefined && !(isInt(v.id) && v.id > 0)))
                    errors.push(`widgetStyles.${id}: a style pin, { slug, id? }`);
            }
    }
    // Warnings: what draws, but not as written.
    const drawn = new Set(drawnWidgetIds(layout));
    const framed = (zone) => {
        const frame = isObj(ag) ? ag[zone] : undefined;
        return isObj(frame) && Array.isArray(frame.items) && (zone === 'middle' || frame.items.length > 0);
    };
    for (const [id, { zone }] of placedIn) {
        if (RETIRED_WIDGET_IDS.has(widgetOfInstance(id))) {
            warnings.push(`'${id}' names a retired widget — no reader draws it`);
            continue;
        }
        if (drawn.has(id))
            continue;
        // Named, and never drawn: the page reads each zone one way
        // (`drawnWidgetIds`), and this id is not in what it reads.
        const why = framed(zone)
            ? `the ${zone}'s arrangement draws there, and it does not place '${id}'`
            : `the grid puts it on the ${zone}, where the layout has no side zone to draw it in`;
        warnings.push(`'${id}' is placed in the ${zone} but never drawn — ${why}`);
    }
    if (opts.widgets) {
        const decls = new Map(opts.widgets.map((w) => [w.id, w]));
        const counts = new Map();
        for (const id of placedIn.keys()) {
            const widget = widgetOfInstance(id);
            counts.set(widget, (counts.get(widget) ?? 0) + 1);
            if (opts.unknownWidgets === 'warn' && !decls.has(widget) && !RETIRED_WIDGET_IDS.has(widget))
                warnings.push(`'${id}' names a widget this pub does not know — it draws as a placeholder`);
        }
        for (const [widget, n] of counts) {
            const cap = decls.get(widget)?.maxInstances;
            if (typeof cap === 'number' && n > cap)
                warnings.push(`'${widget}' is placed ${n} times, over its maxInstances (${cap}) — readers draw the first ${cap}`);
        }
    }
    return { ok: errors.length === 0, errors, warnings };
}
//# sourceMappingURL=sessionLayout.js.map