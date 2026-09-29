/**
 * The session **layout document** (v2) — one typed document a genre ships, a
 * person edits and the app renders, plus the four pure functions that make it
 * mean something: `validateLayoutDoc`, `resolve`, `layoutOps` and `fromLegacy`.
 *
 * It lives beside `settings.ts` and `descriptors.ts` because it is a public
 * contract on the same terms as those: a plugin declares widgets and looks
 * against it, the CLI validates a shipped layout with it, the docs compiler
 * renders a genre's layout through it, and the app's stage is a renderer for
 * `resolve`'s answer and nothing else.
 *
 * ## The model in one paragraph
 *
 * Three fixed **zones** — left, middle, right — and the middle is the primary
 * one. Each zone is a CSS grid of **tracks** (rows and columns), each track
 * carrying an **extent** that says what it means (`grow`, `fit`, N `cells`, a
 * range) rather than a measured size. A **unit** sits on those tracks by grid
 * line: a widget, a tab **group** of widgets, or a spacer. Every unit carries
 * an **instance key**, unique in the document, which is what per-instance
 * settings and style pins are stored against. A **variant** is one screen
 * size's own zones, patched over the base a zone at a time. A **look** is a
 * declared layout variable at root, zone or unit scope. A **fold** is what a
 * unit does when its declared minimum cannot be met.
 *
 * ## What is deliberately not here
 *
 * No solver, no measured cells, no free CSS at root or zone scope, no fourth
 * zone. `resolve` emits grid templates and `grid-area` line strings; the
 * browser does the layout. Every future knob arrives as a declaration — a
 * `LookDecl` a plugin ships, a `WidgetDecl` field — rather than as a new key
 * this file has to learn.
 *
 * ## Versioning
 *
 * The document's `version` is `2`. **Additive keys never bump it**: readers
 * drop keys they do not know and draw unknown unit kinds as labelled
 * placeholders, so a document written by a newer build still resolves here. A
 * breaking change ships `version: 3` beside 2 with its own `fromV2`.
 */
// ── Zones and sizes ─────────────────────────────────────────────────────────
/** The three zones, in visual order. There is no fourth; see the file header. @experimental */
export const ZONE_IDS = ['left', 'middle', 'right'];
/**
 * The four sizes, as the **session box's** inline size — never the viewport's.
 * Opening a sidebar cascades the layout exactly as narrowing the window does,
 * which is the whole reason the numbers are measured on the box.
 * @experimental
 */
export const BREAKPOINTS = { compact: 0, cozy: 640, roomy: 1024, wide: 1440 };
/** Ascending, which is the order every "at or above" rule walks. @experimental */
export const BREAKPOINT_ORDER = ['compact', 'cozy', 'roomy', 'wide'];
/**
 * The reference box each size is edited and checked at (§5.1): a width and a
 * device height. `checkSizes` resolves at these, and the editor's Screen picker
 * draws them, so "what the phone will do" is one answer rather than two.
 * @experimental
 */
export const REFERENCE_BOXES = {
    compact: { width: 390, height: 844 },
    cozy: { width: 640, height: 960 },
    roomy: { width: 1024, height: 768 },
    wide: { width: 1440, height: 900 },
};
/** The size a measured box is. Total: anything under `cozy` is `compact`. @experimental */
export function breakpointFor(width) {
    const w = Number.isFinite(width) ? width : 0;
    let out = 'compact';
    for (const bp of BREAKPOINT_ORDER)
        if (w >= BREAKPOINTS[bp])
            out = bp;
    return out;
}
/**
 * The narrowest a widget is ever asked to be. A side thinner than this, or a
 * box thinner than a zone's own tracks, folds that zone to one column — the
 * one measurement in the whole model, and it is a floor rather than a ladder.
 * @experimental
 */
export const MIN_WIDGET_PX = 220;
/** A grow track's share is read in twelfths of its axis. @experimental */
export const TWELFTHS = 12;
/** The docked width a side takes when it does not declare one. @experimental */
export const DEFAULT_SIDE_WIDTH = { cells: 6 };
/**
 * The globally-unique, reseed-stable slug for a widget's built-in style. This is
 * both the system row's `slug` (the layout's reference target) and its seed
 * identity — the reconciler upserts and prunes system rows by matching on it,
 * NEVER on a numeric id (the codified seed rule).
 *
 * Widget ids and preset slugs are simple kebab tokens (no `:`), so the join is
 * unambiguous.
 * @internal
 */
export function systemStyleSlug(widgetId, presetSlug) {
    return `${widgetId}:${presetSlug}`;
}
/**
 * Resolve a widget declaration to what the host mounts. `owner` is `'core'`
 * or the declaring plugin's id: a `component` is that owner's remote. `null`
 * when the declaration names nothing it may — validation reports that; the
 * host treats it as a missing widget, never a crash.
 *
 * The alias is held to the same rule as `component` (R25): a `frame` mounts
 * its OWN plugin's document, never another's.
 * @internal
 */
export function resolveWidgetSurface(decl, owner) {
    if (typeof decl.component === 'string' && decl.component)
        return { kind: 'remote', owner, component: decl.component };
    const s = decl.surface;
    if (s?.kind === 'frame' && typeof s.pluginId === 'string' && typeof s.entry === 'string')
        return owner === 'core' || s.pluginId === owner ? { kind: 'frame', pluginId: s.pluginId, entry: s.entry } : null;
    return null;
}
/**
 * The CSS custom property a look is emitted as.
 *
 * A plugin's key is namespaced with a dot, which is not an ident character, so
 * every character outside `[A-Za-z0-9_-]` becomes `-`. Two keys that differ
 * only in punctuation would collide; declare `cssVar` explicitly if that is
 * ever a real risk.
 * @experimental
 */
export function lookCssVar(decl) {
    return decl.cssVar ?? `--sp-look-${decl.key.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}
// ── Small shared helpers ────────────────────────────────────────────────────
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
const isCells = (e) => isObj(e) && typeof e.cells === 'number';
/** A weighted grow track — `{ grow: n }`, n twelfths of the axis. @experimental */
export const isShare = (e) => isObj(e) && typeof e.grow === 'number';
const isRange = (e) => isObj(e) && !isCells(e) && !isShare(e);
/** Bare or weighted — everything that divides what the fixed tracks leave. */
const isGrowish = (e) => e === 'grow' || isShare(e);
/** The twelfths a grow track claims; a bare `grow` claims none of its own. */
const shareOf = (e) => (isShare(e) ? e.grow : 0);
/** @experimental */
export function isExtent(x) {
    if (x === 'grow' || x === 'fit')
        return true;
    if (!isObj(x))
        return false;
    if (typeof x.grow === 'number')
        return Number.isInteger(x.grow) && x.grow > 0;
    if (typeof x.cells === 'number')
        return Number.isFinite(x.cells) && x.cells > 0;
    const okMin = x.min === undefined || (typeof x.min === 'number' && Number.isFinite(x.min));
    const okMax = x.max === undefined || (typeof x.max === 'number' && Number.isFinite(x.max));
    return okMin && okMax;
}
/**
 * Give every bare `grow` track on one axis a share, so the axis reads in
 * twelfths — the step `joinRow` and `setSpan` take before they write.
 *
 * Shares already declared keep their number; the bare tracks divide what is
 * left, remainder first, so the axis totals twelve. An axis with fewer than two
 * grow tracks is returned untouched (`force` overrides that, for the moment a
 * single track is about to become two): one grow track is already the whole of
 * what the grow tracks share, and writing `{ grow: 12 }` for it would be noise
 * in every document that never joined anything.
 *
 * With more than twelve grow tracks there is no integer division of twelve, so
 * each gets one and the axis totals more — the honest floor rather than a zero.
 * @experimental
 */
export function materialiseShares(tracks, force = false) {
    const growIndexes = tracks.map((t, i) => (isGrowish(t) ? i : -1)).filter((i) => i >= 0);
    if (!growIndexes.length)
        return tracks;
    if (!force && growIndexes.length < 2)
        return tracks;
    const bare = growIndexes.filter((i) => tracks[i] === 'grow');
    if (!bare.length)
        return tracks;
    const claimed = growIndexes.reduce((sum, i) => sum + shareOf(tracks[i]), 0);
    const pool = Math.max(bare.length, TWELFTHS - claimed);
    const each = Math.floor(pool / bare.length);
    let spare = pool - each * bare.length;
    const out = [...tracks];
    for (const i of bare)
        out[i] = { grow: each + (spare-- > 0 ? 1 : 0) };
    return out;
}
const KNOWN_KINDS = new Set(['widget', 'group', 'spacer']);
/** Every widget id a unit names, the group members included. */
function widgetIdsOf(u) {
    if (u.kind === 'widget')
        return typeof u.widget === 'string' ? [u.widget] : [];
    if (u.kind === 'group')
        return (u.members ?? [])
            .map((m) => m?.widget)
            .filter((w) => typeof w === 'string');
    return [];
}
/** Every instance key a unit owns — its own and, for a group, its members'. */
function keysOf(u) {
    const own = typeof u.key === 'string' ? [u.key] : [];
    if (u.kind === 'group')
        for (const m of u.members ?? [])
            if (m && typeof m.key === 'string')
                own.push(m.key);
    return own;
}
const zonesOf = (zones) => ZONE_IDS.map((id) => [id, zones?.[id]]).filter((pair) => !!pair[1]);
/** Row-major reading order: down the rows, across the columns, key as tie-break. */
function rowMajor(units) {
    return [...units].sort((a, b) => (a.row?.start ?? 0) - (b.row?.start ?? 0) ||
        (a.col?.start ?? 0) - (b.col?.start ?? 0) ||
        String(a.key).localeCompare(String(b.key)));
}
/**
 * The rules the type cannot express.
 *
 * **Errors** are structural: overlapping units, a position outside the zone's
 * tracks, a repeated instance key, a variant naming a size that is not one.
 * **Warnings** are everything a reader survives — an undeclared look key (which
 * is pruned at reconcile), a widget id this build has no component for, a unit
 * kind it has never heard of. Both of those draw a labelled placeholder rather
 * than failing, which is the whole point: uninstalling a plugin must not strand
 * a person's layout.
 *
 * Total: `doc` is `unknown` because the server runs this on every write.
 * @internal
 */
export function validateLayoutDoc(doc, opts) {
    const errors = [];
    const warnings = [];
    const err = (m) => {
        if (!errors.includes(m))
            errors.push(m);
    };
    const warn = (m) => {
        if (!warnings.includes(m))
            warnings.push(m);
    };
    if (!isObj(doc))
        return { ok: false, errors: ['The layout document must be an object.'], warnings };
    if (doc.version !== 2)
        err(`\`version\` must be 2; this document says ${JSON.stringify(doc.version)}.`);
    if (!isObj(doc.zones)) {
        err('`zones` is required, with a `middle`.');
        return { ok: false, errors, warnings };
    }
    const zones = doc.zones;
    if (!isObj(zones.middle))
        err('`zones.middle` is required — the middle is the primary zone.');
    const widgetIds = new Set((opts?.widgets ?? []).map((w) => w.id));
    const looks = opts?.looks ?? [];
    const lookByKey = new Map(looks.map((l) => [l.key, l]));
    const checkLooks = (bag, scope, where) => {
        if (bag === undefined)
            return;
        if (!isObj(bag))
            return err(`${where}: \`look\` must be an object of declared keys.`);
        if (!looks.length)
            return;
        for (const key of Object.keys(bag)) {
            const decl = lookByKey.get(key);
            if (!decl)
                warn(`${where}: the look \`${key}\` is not declared; it is dropped at reconcile.`);
            else if (!decl.appliesTo.includes(scope))
                warn(`${where}: the look \`${key}\` applies to ${decl.appliesTo.join(', ')}, not ${scope}; it is dropped at reconcile.`);
        }
    };
    /** One layer: the base, or one variant's effective zones. */
    const checkLayer = (layer, where) => {
        const seen = new Map();
        for (const id of ZONE_IDS) {
            const raw = layer[id];
            if (raw === undefined)
                continue;
            if (!isObj(raw)) {
                err(`${where}zone \`${id}\` must be a whole zone, with \`rows\`, \`cols\` and \`units\`.`);
                continue;
            }
            const zone = raw;
            const rows = Array.isArray(zone.rows) ? zone.rows : null;
            const cols = Array.isArray(zone.cols) ? zone.cols : null;
            if (!rows?.length)
                err(`${where}zone \`${id}\` must declare at least one row track.`);
            if (!cols?.length)
                err(`${where}zone \`${id}\` must declare at least one column track.`);
            for (const [axis, tracks] of [
                ['row', rows],
                ['column', cols],
            ])
                tracks?.forEach((t, i) => {
                    if (isExtent(t))
                        return;
                    if (isObj(t) && typeof t.grow === 'number')
                        err(`${where}zone \`${id}\`: ${axis} track ${i + 1}'s share is ${JSON.stringify(t.grow)}; a share is a whole number of twelfths, at least 1.`);
                    else
                        err(`${where}zone \`${id}\`: ${axis} track ${i + 1} is not an extent.`);
                });
            if (id !== 'middle') {
                const side = zone;
                if (side.pinned !== undefined && typeof side.pinned !== 'boolean')
                    err(`${where}zone \`${id}\`: \`pinned\` must be true or false.`);
                if (side.width !== undefined && !isExtent(side.width))
                    err(`${where}zone \`${id}\`: \`width\` is not an extent.`);
            }
            checkLooks(zone.look, 'zone', `${where}zone \`${id}\``);
            if (!Array.isArray(zone.units)) {
                err(`${where}zone \`${id}\`: \`units\` must be an array.`);
                continue;
            }
            const rowCount = rows?.length ?? 0;
            const colCount = cols?.length ?? 0;
            const placed = [];
            for (const unit of zone.units) {
                if (!isObj(unit)) {
                    err(`${where}zone \`${id}\`: every unit must be an object.`);
                    continue;
                }
                if (typeof unit.key !== 'string' || !unit.key)
                    err(`${where}zone \`${id}\`: every unit needs an instance key.`);
                if (typeof unit.kind !== 'string' || !unit.kind)
                    err(`${where}zone \`${id}\`: every unit needs a \`kind\`.`);
                else if (!KNOWN_KINDS.has(unit.kind))
                    warn(`${where}zone \`${id}\`: the unit \`${unit.key}\` has kind \`${unit.kind}\`, which draws a labelled placeholder.`);
                if (unit.kind === 'widget' && typeof unit.widget !== 'string')
                    err(`${where}zone \`${id}\`: the unit \`${unit.key}\` names no widget.`);
                if (unit.kind === 'group') {
                    const members = unit.members;
                    if (!Array.isArray(members) || !members.length)
                        err(`${where}zone \`${id}\`: the group \`${unit.key}\` has no members.`);
                    else
                        for (const m of members)
                            if (!isObj(m) || typeof m.widget !== 'string' || typeof m.key !== 'string')
                                err(`${where}zone \`${id}\`: every member of the group \`${unit.key}\` needs a widget and an instance key.`);
                }
                if (widgetIds.size)
                    for (const w of widgetIdsOf(unit))
                        if (!widgetIds.has(w))
                            warn(`${where}zone \`${id}\`: \`${w}\` is not a widget this build knows; it draws a labelled placeholder.`);
                for (const key of keysOf(unit)) {
                    const prior = seen.get(key);
                    if (prior)
                        err(`${where}the instance key \`${key}\` is used twice (zone \`${prior}\` and zone \`${id}\`); keys are unique in the document.`);
                    else
                        seen.set(key, id);
                }
                checkLooks(unit.look, 'unit', `${where}zone \`${id}\`: the unit \`${unit.key}\``);
                const spans = [
                    ['row', unit.row, rowCount],
                    ['col', unit.col, colCount],
                ];
                let ok = true;
                for (const [axis, at, count] of spans) {
                    const word = axis === 'row' ? 'row' : 'column';
                    if (!isObj(at) || !isInt(at.start) || !isInt(at.span)) {
                        err(`${where}zone \`${id}\`: the unit \`${unit.key}\` needs a \`${axis}\` of \`{ start, span }\` whole numbers.`);
                        ok = false;
                        continue;
                    }
                    if (at.start < 1 || at.span < 1) {
                        err(`${where}zone \`${id}\`: the unit \`${unit.key}\` starts at ${word} ${at.start} spanning ${at.span}; grid lines are 1-based and a span is at least 1.`);
                        ok = false;
                        continue;
                    }
                    if (count && at.start + at.span - 1 > count) {
                        err(`${where}zone \`${id}\`: the unit \`${unit.key}\` spans ${word}s ${at.start}–${at.start + at.span - 1}, but the zone has ${count} ${word} track${count === 1 ? '' : 's'}.`);
                        ok = false;
                    }
                }
                if (unit.pinned !== undefined && typeof unit.pinned !== 'boolean')
                    err(`${where}zone \`${id}\`: the unit \`${unit.key}\`'s \`pinned\` must be true or false.`);
                if (ok && typeof unit.key === 'string')
                    placed.push({
                        key: unit.key,
                        r0: unit.row.start,
                        r1: unit.row.start + unit.row.span,
                        c0: unit.col.start,
                        c1: unit.col.start + unit.col.span,
                    });
            }
            for (let i = 0; i < placed.length; i++)
                for (let j = i + 1; j < placed.length; j++) {
                    const a = placed[i];
                    const b = placed[j];
                    if (a.r0 < b.r1 && a.r1 > b.r0 && a.c0 < b.c1 && a.c1 > b.c0)
                        err(`${where}zone \`${id}\`: \`${a.key}\` and \`${b.key}\` claim the same cells.`);
                }
        }
    };
    checkLooks(doc.look, 'root', 'The root');
    checkLayer(zones, '');
    if (doc.variants !== undefined) {
        if (!isObj(doc.variants))
            err('`variants` must be an object keyed by size.');
        else
            for (const [bp, patch] of Object.entries(doc.variants)) {
                if (!(bp in BREAKPOINTS)) {
                    err(`\`variants\` names \`${bp}\`, which is not a size (${BREAKPOINT_ORDER.join(', ')}).`);
                    continue;
                }
                if (!isObj(patch)) {
                    err(`Variant \`${bp}\` must be an object of whole zones.`);
                    continue;
                }
                for (const key of Object.keys(patch))
                    if (!ZONE_IDS.includes(key))
                        warn(`Variant \`${bp}\` names \`${key}\`, which is not a zone; it is dropped on read.`);
                // A variant is a patch at ZONE granularity, so the layer it
                // describes is the base with its own zones laid over the top —
                // which is what the overlap and key rules have to hold for.
                checkLayer({ ...zones, ...patch }, `Variant \`${bp}\`: `);
            }
    }
    return { ok: errors.length === 0, errors, warnings };
}
/** `{ cells: 3 }` → `calc(3 * var(--sp-cell))`. The host sets `--sp-cell` in rem. */
const cellsCss = (n) => `calc(${n} * var(--sp-cell))`;
/** @experimental */
export function extentToCss(e) {
    if (e === 'grow')
        return '1fr';
    if (e === 'fit')
        return 'auto';
    if (isShare(e))
        return `${e.grow}fr`;
    if (isCells(e))
        return cellsCss(e.cells);
    const min = typeof e.min === 'number' ? cellsCss(e.min) : '0';
    const max = typeof e.max === 'number' ? cellsCss(e.max) : '1fr';
    return `minmax(${min}, ${max})`;
}
/** The px a track is worth before sharing; `null` = it takes a share of the rest. */
function extentFloorPx(e, cell) {
    if (e === 'grow' || e === 'fit' || isShare(e))
        return null;
    if (isCells(e))
        return e.cells * cell;
    if (isRange(e) && typeof e.min === 'number')
        return e.min * cell;
    return null;
}
/**
 * Per-track px: fixed tracks take their floor, the rest share what is left —
 * **in proportion to their share**, so `{ grow: 8 }` beside `{ grow: 4 }` is
 * two thirds and one third rather than half and half. A bare `grow` and a `fit`
 * weigh one apiece, which is what `1fr` and `auto` do.
 */
function trackPx(tracks, available, cell, gap) {
    const out = tracks.map(() => 0);
    const flex = [];
    let fixed = 0;
    let weight = 0;
    tracks.forEach((t, i) => {
        const px = extentFloorPx(t, cell);
        if (px === null) {
            flex.push(i);
            weight += isShare(t) ? t.grow : 1;
        }
        else {
            out[i] = px;
            fixed += px;
        }
    });
    const gaps = Math.max(0, tracks.length - 1) * gap;
    const rest = Math.max(0, available - gaps - fixed);
    for (const i of flex) {
        const t = tracks[i];
        out[i] = weight > 0 ? (rest * (isShare(t) ? t.grow : 1)) / weight : 0;
    }
    return out;
}
/**
 * One extent for a span of them — what a multi-row unit becomes when its zone
 * folds to one column. `grow` wins (something in the span wants the rest);
 * otherwise cells sum, and a span of `fit` alone stays `fit`.
 */
function combineExtents(list) {
    if (!list.length)
        return 'grow';
    // One track combines to itself, share and all.
    if (list.length === 1)
        return list[0];
    if (list.some((e) => e === 'grow'))
        return 'grow';
    // Shares add up: two rows of four twelfths fold into one of eight.
    const shares = list.filter(isShare);
    if (shares.length)
        return { grow: shares.reduce((sum, e) => sum + e.grow, 0) };
    let cells = 0;
    let min = 0;
    let max = 0;
    let sawRange = false;
    let sawFit = false;
    for (const e of list) {
        if (e === 'fit')
            sawFit = true;
        else if (isCells(e))
            cells += e.cells;
        else if (isRange(e)) {
            sawRange = true;
            min += e.min ?? 0;
            max += e.max ?? 0;
        }
    }
    if (cells > 0 && !sawRange)
        return { cells };
    if (sawRange) {
        const out = {};
        if (min + cells > 0)
            out.min = min + cells;
        if (max > 0)
            out.max = max + cells;
        return out;
    }
    return sawFit ? 'fit' : 'grow';
}
/**
 * How many tracks a grid template names.
 *
 * A paren-aware scan rather than a split on whitespace, because a single track
 * is routinely `calc(4 * var(--sp-cell))` or `minmax(0, 1fr)` and both carry
 * spaces of their own. Counting those as three tracks would make a one-column
 * zone look like several to anything reading the template back.
 * @internal
 */
export function trackCount(template) {
    let depth = 0;
    let count = 0;
    let inTrack = false;
    for (const ch of template) {
        if (ch === '(')
            depth++;
        else if (ch === ')')
            depth = Math.max(0, depth - 1);
        const space = depth === 0 && /\s/.test(ch);
        if (space)
            inTrack = false;
        else if (!inTrack) {
            inTrack = true;
            count++;
        }
    }
    return count;
}
const areaOf = (u) => `${u.row.start} / ${u.col.start} / ${u.row.start + u.row.span} / ${u.col.start + u.col.span}`;
/** Stringify one look value by its field type (rule 6). */
function lookToCss(decl, value) {
    const t = decl.field.type;
    if (value === null || value === undefined)
        return '';
    if (t === 'boolean')
        return value ? '1' : '0';
    if (t === 'number' || t === 'integer') {
        const n = Number(value);
        if (!Number.isFinite(n))
            return '';
        if (decl.unit === 'rem')
            return `${n / 16}rem`;
        if (decl.unit === 'px')
            return `${n}px`;
        return String(n);
    }
    if (typeof value === 'string')
        return value;
    return JSON.stringify(value);
}
/** The CSS variables one look bag becomes at one scope. */
function looksToVars(bag, scope, looks, withDefaults) {
    const out = {};
    for (const decl of looks) {
        if (!decl.appliesTo.includes(scope))
            continue;
        const has = bag && Object.prototype.hasOwnProperty.call(bag, decl.key);
        const value = has ? bag[decl.key] : withDefaults ? decl.field.default : undefined;
        if (value === undefined)
            continue;
        const css = lookToCss(decl, value);
        if (css !== '')
            out[lookCssVar(decl)] = css;
    }
    return out;
}
/** A declared look's value at one scope, falling back to its default. */
function lookValue(bag, key, looks) {
    if (bag && Object.prototype.hasOwnProperty.call(bag, key))
        return bag[key];
    return looks.find((l) => l.key === key)?.field.default;
}
const numberLook = (bag, key, looks, fallback) => {
    const v = lookValue(bag, key, looks);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
};
/**
 * The variant that serves a size: the nearest **customized** one at or above
 * it. A variant at `roomy` serves `cozy` and `compact` unless they have their
 * own, and nothing below the base ever reaches upward — which is what makes a
 * phone edit unable to touch the desktop.
 * @experimental
 */
export function servingVariant(doc, bp) {
    const from = BREAKPOINT_ORDER.indexOf(bp);
    for (let i = from; i < BREAKPOINT_ORDER.length; i++) {
        const at = BREAKPOINT_ORDER[i];
        if (doc.variants && doc.variants[at])
            return at;
    }
    return null;
}
/** The zones in force at one size: the base patched, a zone at a time. @internal */
export function effectiveZones(doc, bp) {
    const base = (doc.zones ?? {});
    const at = servingVariant(doc, bp);
    if (!at)
        return base;
    const patch = doc.variants[at];
    const out = { ...base };
    for (const id of ZONE_IDS) {
        const z = patch[id];
        if (z)
            out[id] = z;
    }
    return out;
}
/**
 * The document at one box, as grid templates and `grid-area` strings.
 *
 * Pure and **total** for every box and every document that parses — unknown
 * look keys and unknown unit kinds included. The six rules run in the order
 * §2.5 states them, and each is marked below.
 * @internal
 */
export function resolve(doc, box, decls) {
    const looks = decls?.looks ?? [];
    const widgets = decls?.widgets ?? [];
    const widgetById = new Map(widgets.map((w) => [w.id, w]));
    const width = Number.isFinite(box?.width) ? Math.max(0, box.width) : 0;
    const height = Number.isFinite(box?.height) ? Math.max(0, box.height) : 0;
    const bp = breakpointFor(width);
    const rootLook = isObj(doc?.look) ? doc.look : undefined;
    const cell = numberLook(rootLook, 'cell', looks, 44);
    const rootGap = numberLook(rootLook, 'gap', looks, 12);
    const rootPad = numberLook(rootLook, 'pad', looks, 12);
    const railWidth = numberLook(rootLook, 'railWidth', looks, 36);
    // ── rule 1: the effective zones ─────────────────────────────────────
    const zones = effectiveZones(doc, bp);
    // ── rule 2: the middle is never empty ───────────────────────────────
    const primary = widgets.find((w) => w.role === 'primary');
    const middleRaw = zones.middle;
    const middle = middleRaw ?? { rows: ['grow'], cols: ['grow'], units: [] };
    let effective = { ...zones, middle };
    if (primary) {
        const placedAnywhere = zonesOf(effective).some(([, z]) => (z.units ?? []).some((u) => widgetIdsOf(u).includes(primary.id)));
        if (!placedAnywhere) {
            const unit = {
                kind: 'widget',
                key: primary.id,
                widget: primary.id,
                row: { start: 1, span: 1 },
                col: { start: 1, span: 1 },
            };
            const units = middle.units ?? [];
            if (!units.length) {
                // No units at all: the middle IS the primary widget, one grow row.
                effective = { ...effective, middle: { ...middle, rows: ['grow'], cols: ['grow'], units: [unit] } };
            }
            else {
                // Placed nowhere but the middle has other units: append a row.
                const rows = [...(middle.rows ?? ['grow']), 'grow'];
                const cols = middle.cols ?? ['grow'];
                effective = {
                    ...effective,
                    middle: {
                        ...middle,
                        rows,
                        cols,
                        units: [
                            ...units,
                            { ...unit, row: { start: rows.length, span: 1 }, col: { start: 1, span: cols.length } },
                        ],
                    },
                };
            }
        }
    }
    // ── rule 3: below roomy the sides are sheets and the middle is the page ──
    const belowRoomy = BREAKPOINTS[bp] < BREAKPOINTS.roomy;
    const stateOf = (id, zone) => {
        if (id === 'middle')
            return 'docked';
        if (!(zone.units ?? []).length)
            return 'hidden';
        if (belowRoomy)
            return 'sheet';
        // ── rule 5: an unpinned side is a rail ──────────────────────────
        return zone.pinned === false ? 'rail' : 'docked';
    };
    const states = {};
    for (const [id, zone] of zonesOf(effective))
        states[id] = stateOf(id, zone);
    const sideWidthPx = (id) => {
        const zone = effective[id];
        if (!zone)
            return 0;
        const state = states[id];
        if (state === 'hidden')
            return 0;
        if (state === 'rail')
            return railWidth;
        if (state === 'sheet')
            return width;
        const measured = box?.sideWidths?.[id];
        if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0)
            return measured;
        return extentFloorPx(zone.width ?? DEFAULT_SIDE_WIDTH, cell) ?? 6 * cell;
    };
    const availableOf = (id) => {
        if (id !== 'middle')
            return sideWidthPx(id);
        if (belowRoomy)
            return Math.max(0, width - rootPad * 2);
        const sides = ['left', 'right'].reduce((sum, s) => sum + (states[s] === 'sheet' ? 0 : sideWidthPx(s)), 0);
        return Math.max(0, width - sides - rootPad * 2);
    };
    const out = { left: null, middle: null, right: null };
    for (const [id, zone] of zonesOf(effective)) {
        const state = states[id];
        const zoneLook = isObj(zone.look) ? zone.look : undefined;
        const gap = numberLook(zoneLook, 'gap', looks, rootGap);
        const available = availableOf(id);
        const rows = (Array.isArray(zone.rows) && zone.rows.length ? zone.rows : ['grow']).filter(isExtent);
        const cols = (Array.isArray(zone.cols) && zone.cols.length ? zone.cols : ['grow']).filter(isExtent);
        const safeRows = rows.length ? rows : ['grow'];
        const safeCols = cols.length ? cols : ['grow'];
        const units = (Array.isArray(zone.units) ? zone.units : []).filter((u) => isObj(u) && isObj(u.row) && isObj(u.col));
        // Rule 5, unit half: a whole rail is icons; an unpinned unit in a
        // docked side is one icon. Railed units leave the grid, so they are
        // taken out before the tracks are derived.
        const railed = new Set();
        if (state === 'rail')
            for (const u of units)
                railed.add(u.key);
        else if (state === 'docked' && id !== 'middle')
            for (const u of units)
                if (u.pinned === false)
                    railed.add(u.key);
        const gridUnits = units.filter((u) => !railed.has(u.key));
        // ── rule 3, second half: fold to one column ─────────────────────
        const trackFloor = safeCols.reduce((sum, c) => sum + (extentFloorPx(c, cell) ?? MIN_WIDGET_PX), 0) +
            Math.max(0, safeCols.length - 1) * gap;
        const folds = state !== 'hidden' &&
            (belowRoomy || (available > 0 && (available < MIN_WIDGET_PX || available < trackFloor)));
        let useRows = safeRows;
        let useCols = safeCols;
        let placed;
        if (folds && safeCols.length >= 1) {
            const order = rowMajor(gridUnits);
            useCols = ['grow'];
            useRows = order.map((u) => combineExtents(safeRows.slice(Math.max(0, u.row.start - 1), Math.max(0, u.row.start - 1 + Math.max(1, u.row.span)))));
            if (!useRows.length)
                useRows = ['grow'];
            placed = order.map((unit, i) => ({
                unit,
                row: { start: i + 1, span: 1 },
                col: { start: 1, span: 1 },
            }));
        }
        else {
            placed = gridUnits.map((unit) => ({ unit, row: unit.row, col: unit.col }));
        }
        const colPx = trackPx(useCols, available, cell, gap);
        const rowPx = trackPx(useRows, Math.max(0, height - rootPad * 2), cell, gap);
        // ── rule 4: a minimum that cannot be met applies the unit's fold,
        //            and lower priority yields first ──────────────────────
        const foldOf = (u) => {
            const decl = widgetById.get(widgetIdsOf(u)[0] ?? '');
            return decl?.fold ?? 'scroll';
        };
        const priorityOf = (u) => {
            if (typeof u.priority === 'number')
                return u.priority;
            const decl = widgetById.get(widgetIdsOf(u)[0] ?? '');
            return decl?.priority ?? 50;
        };
        const widthOf = (p) => {
            let px = 0;
            for (let i = p.col.start - 1; i < p.col.start - 1 + p.col.span; i++)
                px += colPx[i] ?? 0;
            return px + Math.max(0, p.col.span - 1) * gap;
        };
        const heightOf = (p) => {
            // Only a deterministic row span has a height worth checking: a
            // `fit` row is content-sized and a `grow` row is whatever is left,
            // so neither can be under a minimum in any meaningful sense.
            const span = useRows.slice(p.row.start - 1, p.row.start - 1 + p.row.span);
            if (!span.length || span.some((e) => e === 'grow' || e === 'fit'))
                return null;
            let px = 0;
            for (let i = p.row.start - 1; i < p.row.start - 1 + p.row.span; i++)
                px += rowPx[i] ?? 0;
            return px + Math.max(0, p.row.span - 1) * gap;
        };
        const applied = new Map();
        if (available > 0) {
            // Ascending priority: the unit that yields first is the one that
            // matters least, and each rail/hide hands its width back as slack
            // the survivors can use.
            const byRow = new Map();
            for (const p of placed) {
                const list = byRow.get(p.row.start) ?? [];
                list.push(p);
                byRow.set(p.row.start, list);
            }
            for (const list of byRow.values()) {
                let slack = 0;
                const contenders = [...list].sort((a, b) => priorityOf(a.unit) - priorityOf(b.unit) || String(a.unit.key).localeCompare(String(b.unit.key)));
                const survivors = contenders.length;
                let yielded = 0;
                for (const p of contenders) {
                    const decl = widgetById.get(widgetIdsOf(p.unit)[0] ?? '');
                    const minW = decl?.cells?.minW;
                    const minH = decl?.cells?.minH;
                    const have = widthOf(p) + slack;
                    const tooNarrow = typeof minW === 'number' && minW > 0 && have < minW * cell;
                    const h = heightOf(p);
                    const tooShort = typeof minH === 'number' && minH > 0 && h !== null && h < minH * cell;
                    if (!tooNarrow && !tooShort)
                        continue;
                    const fold = foldOf(p.unit);
                    // The last one standing is never folded away: a row of one
                    // widget that does not fit still has to draw something.
                    if ((fold === 'rail' || fold === 'hide') && yielded >= survivors - 1) {
                        applied.set(p.unit.key, fold === 'hide' ? 'shrink' : 'scroll');
                        continue;
                    }
                    applied.set(p.unit.key, fold);
                    if (fold === 'rail' || fold === 'hide') {
                        slack += widthOf(p) + gap;
                        yielded++;
                    }
                }
            }
        }
        const hiddenKeys = new Set();
        for (const [key, fold] of applied) {
            if (fold === 'hide')
                hiddenKeys.add(key);
            if (fold === 'rail')
                railed.add(key);
        }
        // In the folded path the rows are DERIVED from the units, so a unit
        // that left the grid takes its row with it. In the unfolded path the
        // tracks are the author's and stay exactly as declared.
        let finalRows = useRows;
        let finalPlaced = placed;
        if (folds) {
            const kept = placed.filter((p) => !hiddenKeys.has(p.unit.key) && !railed.has(p.unit.key));
            finalRows = kept.length ? kept.map((p) => useRows[p.row.start - 1] ?? 'grow') : ['grow'];
            finalPlaced = kept.map((p, i) => ({ ...p, row: { start: i + 1, span: 1 } }));
        }
        const resolvedUnits = [];
        for (const p of finalPlaced) {
            const vars = looksToVars(p.unit.look, 'unit', looks, false);
            resolvedUnits.push({
                key: p.unit.key,
                area: areaOf(p),
                ...(hiddenKeys.has(p.unit.key) ? { hidden: true } : {}),
                ...(applied.has(p.unit.key) ? { fold: applied.get(p.unit.key) } : {}),
                ...(Object.keys(vars).length ? { vars } : {}),
            });
        }
        // Railed units keep their identity and their declared cells, so a host
        // that expands a flyout has somewhere to draw it.
        for (const u of units)
            if (railed.has(u.key)) {
                const vars = looksToVars(u.look, 'unit', looks, false);
                resolvedUnits.push({
                    key: u.key,
                    area: areaOf(u),
                    rail: true,
                    ...(hiddenKeys.has(u.key) ? { hidden: true } : {}),
                    ...(applied.has(u.key) ? { fold: applied.get(u.key) } : {}),
                    ...(Object.keys(vars).length ? { vars } : {}),
                });
            }
        out[id] = {
            state,
            gridTemplateRows: finalRows.map(extentToCss).join(' '),
            gridTemplateColumns: useCols.map(extentToCss).join(' '),
            units: resolvedUnits,
            // ── rule 6, zone scope: deviations only; the rest cascades ──
            vars: looksToVars(zoneLook, 'zone', looks, false),
        };
    }
    // ── rule 6, root scope: every declared root look, default included, so
    //            the host always has `--sp-cell` to calc against ────────────
    return { breakpoint: bp, zones: out, vars: looksToVars(rootLook, 'root', looks, true) };
}
const SIZE_LABEL = {
    compact: 'Compact',
    cozy: 'Cozy',
    roomy: 'Roomy',
    wide: 'Wide',
};
const FOLD_SENTENCE = {
    shrink: 'it will be squeezed',
    scroll: 'it will scroll',
    rail: 'it will move to the rail',
    hide: 'it will be hidden',
};
/**
 * The document at every size, and what each one costs.
 *
 * A **finding is a deviation**, never a consequence of the rules themselves:
 * below `roomy` every zone folds to one column and every side becomes a sheet,
 * which is the contract rather than a surprise, so neither is reported there. A
 * zone that folds at `roomy` or `wide` — because its own tracks do not fit the
 * box — is reported, and so is every unit below its declared minimum and every
 * unit hidden, at any size.
 *
 * Pure and total; the editor shows these on Done and the CLI treats a finding
 * on a shipped layout as an error.
 * @experimental
 */
export function checkSizes(doc, decls) {
    const out = { compact: [], cozy: [], roomy: [], wide: [] };
    for (const bp of BREAKPOINT_ORDER) {
        const findings = [];
        const zones = effectiveZones(doc, bp);
        const resolved = resolve(doc, REFERENCE_BOXES[bp], decls);
        const expectedFold = BREAKPOINTS[bp] < BREAKPOINTS.roomy;
        for (const id of ZONE_IDS) {
            const zone = resolved.zones[id];
            if (!zone)
                continue;
            const declared = zones[id];
            const declaredCols = declared?.cols?.length ?? 1;
            const drawnCols = Math.max(1, trackCount(zone.gridTemplateColumns));
            if (!expectedFold && declaredCols > 1 && drawnCols === 1 && zone.state !== 'hidden')
                findings.push({
                    breakpoint: bp,
                    kind: 'folded',
                    zone: id,
                    message: `${SIZE_LABEL[bp]}: the ${id} zone does not fit its ${declaredCols} columns, so it folds to one.`,
                });
            if (!expectedFold && zone.state === 'sheet')
                findings.push({
                    breakpoint: bp,
                    kind: 'sheet',
                    zone: id,
                    message: `${SIZE_LABEL[bp]}: the ${id} zone becomes a sheet over the middle.`,
                });
            for (const unit of zone.units) {
                if (unit.hidden)
                    findings.push({
                        breakpoint: bp,
                        kind: 'hidden',
                        zone: id,
                        key: unit.key,
                        message: `${SIZE_LABEL[bp]}: ${unit.key} is hidden.`,
                    });
                else if (unit.fold)
                    findings.push({
                        breakpoint: bp,
                        kind: 'below-minimum',
                        zone: id,
                        key: unit.key,
                        message: `${SIZE_LABEL[bp]}: ${unit.key} is below its declared minimum, ${FOLD_SENTENCE[unit.fold]}.`,
                    });
            }
        }
        out[bp] = findings;
    }
    return out;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const refuse = (doc, refused) => ({ doc, refused });
/** Store a rebuilt document, or refuse it if the rebuild broke a rule. */
function commit(input, next, decls) {
    if (JSON.stringify(next) === JSON.stringify(input))
        return { doc: input };
    const check = validateLayoutDoc(next, decls);
    if (!check.ok)
        return refuse(input, check.errors[0]);
    return { doc: next };
}
/** Every zone object that stands for `id`: the base's, and every variant's. */
function layersFor(doc, id) {
    const layers = [
        {
            get: () => doc.zones[id],
            set: (z) => {
                ;
                doc.zones[id] = z;
            },
        },
    ];
    for (const bp of BREAKPOINT_ORDER) {
        const patch = doc.variants?.[bp];
        if (!patch)
            continue;
        const record = patch;
        if (!record[id])
            continue;
        layers.push({ get: () => record[id], set: (z) => void (record[id] = z) });
    }
    return layers;
}
/** The zone one positional edit writes: the base's, or the variant's own. */
function positionalZone(doc, id, target) {
    if (target === 'base')
        return doc.zones[id];
    const patch = (doc.variants ??= {})[target] ?? (doc.variants[target] = {});
    const record = patch;
    if (!record[id]) {
        const base = doc.zones[id];
        if (!base)
            return undefined;
        record[id] = clone(base);
    }
    return record[id];
}
const findUnit = (zone, key) => (zone.units ?? []).find((u) => u.key === key);
function zoneHolding(zones, key) {
    for (const [id, zone] of zonesOf(zones))
        if (findUnit(zone, key))
            return id;
    return undefined;
}
/** Do two units' row bands overlap at all? */
const sharesRows = (a, b) => a.row.start < b.row.start + b.row.span && b.row.start < a.row.start + a.row.span;
/**
 * Drop the tracks nothing is on any more — run at the end of every op that
 * moves or removes a unit, in place, on the zone that changed.
 *
 * Three rules, and each is the inverse of a gesture:
 *
 *   1. **A row no unit covers goes**, and everything below it shifts up. A move
 *      leaves the row it came from empty; a `fit` row collapses to nothing but
 *      a `grow` one keeps its share, so the hole would be visible.
 *   2. **A unit left alone in its row band reclaims the full width.** A column
 *      split only ever exists because two units share a row, so when one of
 *      them leaves the other should not be left beside a hole. The inverse of
 *      the join, and the only way a unit's span shrinks in the first place.
 *   3. **A column split no unit uses collapses back to one track** — but only
 *      when every column track is a grow variety. Columns the author sized in
 *      cells are reserved space somebody asked for; collapsing those would be
 *      tidying away a decision rather than a leftover.
 *
 * A zone with no units keeps its tracks: there is nothing to infer from an
 * empty zone, and a zone needs at least one row and one column either way.
 * @experimental
 */
export function tidyZone(zone) {
    const rows = zone.rows ?? [];
    const cols = zone.cols ?? [];
    let units = zone.units ?? [];
    if (!units.length)
        return;
    // 1. rows nothing covers.
    const used = new Set();
    for (const u of units)
        for (let r = u.row.start; r < u.row.start + u.row.span; r++)
            used.add(r);
    if (used.size && used.size < rows.length) {
        const keep = rows.map((_, i) => used.has(i + 1));
        // Old grid line → new grid line.
        const line = [];
        let at = 1;
        for (let i = 0; i <= keep.length; i++) {
            line[i + 1] = at;
            if (keep[i])
                at++;
        }
        zone.rows = rows.filter((_, i) => keep[i]);
        units = units.map((u) => {
            const start = line[u.row.start] ?? 1;
            const end = line[u.row.start + u.row.span] ?? start + 1;
            return { ...u, row: { start, span: Math.max(1, end - start) } };
        });
    }
    // 2. a unit alone in its row band takes the whole width back.
    const width = (zone.cols ?? cols).length;
    units = units.map((u) => units.some((o) => o.key !== u.key && sharesRows(o, u))
        ? u
        : { ...u, col: { start: 1, span: width } });
    // 3. a split nobody is using.
    const full = units.every((u) => u.col.start === 1 && u.col.span === width);
    if (width > 1 && full && cols.every(isGrowish)) {
        zone.cols = ['grow'];
        units = units.map((u) => ({ ...u, col: { start: 1, span: 1 } }));
    }
    zone.units = units;
}
/** A free row at the end of a zone, for a unit that has nowhere else to land. */
function appendRow(zone, extent) {
    zone.rows = [...(zone.rows ?? []), extent];
    return zone.rows.length;
}
/**
 * The pure operations the editor and the CLI both dispatch.
 *
 * Every one of them: takes the document first, returns `{ doc, refused? }`,
 * returns the input **by reference** when it changes nothing, and refuses
 * rather than storing a document `validateLayoutDoc` would reject.
 * @experimental
 */
export const layoutOps = {
    /**
     * Add a widget. **Membership, so it lands on the base** — and in every
     * variant that shadows the zone, or the size that customized it would never
     * see the new widget (§5.5). With a size target and an explicit `at`, that
     * size's list position is the variant's own.
     */
    place(doc, args, decls) {
        const decl = (decls?.widgets ?? []).find((w) => w.id === args.widget);
        const key = args.key ?? args.widget;
        const id = args.zone ?? decl?.placement?.zone ?? 'right';
        const next = clone(doc);
        if (zoneHolding(next.zones, key))
            return refuse(doc, `The instance key \`${key}\` is already placed; keys are unique in the document.`);
        const height = decl?.placement?.height ?? 'grow';
        const pinned = decl?.placement?.pinned;
        if (!layersFor(next, id)[0].get())
            next.zones[id] = { rows: [], cols: ['grow'], units: [] };
        for (const layer of layersFor(next, id)) {
            const zone = layer.get();
            if (!zone)
                continue;
            if (!zone.cols?.length)
                zone.cols = ['grow'];
            const row = appendRow(zone, height);
            const unit = {
                kind: 'widget',
                key,
                widget: args.widget,
                row: { start: row, span: 1 },
                col: { start: 1, span: zone.cols.length },
                ...(pinned === false ? { pinned: false } : {}),
            };
            zone.units = [...(zone.units ?? []), unit];
        }
        if (args.target !== 'base' && typeof args.at === 'number') {
            const zone = positionalZone(next, id, args.target);
            if (zone) {
                const order = rowMajor(zone.units ?? []).map((u) => u.key);
                const without = order.filter((k) => k !== key);
                without.splice(Math.max(0, Math.min(args.at, without.length)), 0, key);
                foldOrderInto(zone, without);
            }
        }
        return commit(doc, next, decls);
    },
    /** Remove a unit. Membership: the base and every variant lose it. */
    remove(doc, args, decls) {
        const next = clone(doc);
        let touched = false;
        for (const id of ZONE_IDS)
            for (const layer of layersFor(next, id)) {
                const zone = layer.get();
                if (!zone)
                    continue;
                const before = (zone.units ?? []).length;
                zone.units = (zone.units ?? []).filter((u) => u.key !== args.key);
                if (zone.units.length !== before) {
                    touched = true;
                    tidyZone(zone);
                }
            }
        if (!touched)
            return { doc };
        return commit(doc, next, decls);
    },
    /** Move a unit to a grid line. **Position, so a size target writes its variant.** */
    moveToLine(doc, args, decls) {
        const next = clone(doc);
        const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target);
        const from = zoneHolding(zones, args.key);
        if (!from)
            return refuse(doc, `There is no unit \`${args.key}\` at this size.`);
        const to = args.zone ?? from;
        const source = positionalZone(next, from, args.target);
        const dest = positionalZone(next, to, args.target);
        if (!source || !dest)
            return refuse(doc, `There is no \`${to}\` zone to move \`${args.key}\` into.`);
        const unit = findUnit(source, args.key);
        if (!unit)
            return refuse(doc, `There is no unit \`${args.key}\` at this size.`);
        const moved = {
            ...unit,
            row: { start: args.row, span: unit.row.span },
            col: { start: args.col, span: unit.col.span },
        };
        if (source === dest)
            // In place, so a move to where it already is is byte-identical and
            // comes back by reference rather than as a reshuffled array.
            dest.units = dest.units.map((u) => (u.key === args.key ? moved : u));
        else {
            source.units = source.units.filter((u) => u.key !== args.key);
            dest.units = [...(dest.units ?? []), moved];
        }
        tidyZone(dest);
        if (source !== dest)
            tidyZone(source);
        return commit(doc, next, decls);
    },
    /**
     * Put a unit into another's row, the two sharing its columns.
     *
     * The column axis is **materialised** first, so both sides come out reading
     * as "n of twelve" rather than as two anonymous `1fr`s. A host that already
     * spans two or more tracks simply gives half of them away; a host on ONE
     * track has that track split in two, each half carrying half its share, and
     * every unit that covered the line widens by a track so nothing else moves.
     */
    joinRow(doc, args, decls) {
        if (args.key === args.ontoKey)
            return refuse(doc, 'A widget cannot be put beside itself.');
        const next = clone(doc);
        const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target);
        const id = zoneHolding(zones, args.ontoKey);
        if (!id)
            return refuse(doc, `There is no unit \`${args.ontoKey}\` at this size.`);
        const zone = positionalZone(next, id, args.target);
        if (!zone)
            return refuse(doc, `There is no unit \`${args.ontoKey}\` at this size.`);
        const from = zoneHolding(zones, args.key);
        if (!from)
            return refuse(doc, `\`${args.key}\` and \`${args.ontoKey}\` are not in the same size.`);
        const sourceZone = positionalZone(next, from, args.target);
        if (!findUnit(sourceZone, args.key))
            return refuse(doc, `There is no unit \`${args.key}\` at this size.`);
        zone.cols = materialiseShares(zone.cols, true);
        const onto = findUnit(zone, args.ontoKey);
        if (onto.col.span < 2) {
            const at = onto.col.start;
            const track = zone.cols[at - 1];
            if (!isGrowish(track))
                return refuse(doc, `\`${args.ontoKey}\` sits in a fixed column; widen it or add a column before putting \`${args.key}\` beside it.`);
            const total = isShare(track) ? track.grow : TWELFTHS;
            const first = Math.max(1, Math.ceil(total / 2));
            const second = Math.max(1, total - first);
            zone.cols = [...zone.cols.slice(0, at - 1), { grow: first }, { grow: second }, ...zone.cols.slice(at)];
            zone.units = zone.units.map((u) => {
                const c = u.col;
                if (c.start > at)
                    return { ...u, col: { start: c.start + 1, span: c.span } };
                if (c.start + c.span - 1 >= at)
                    return { ...u, col: { start: c.start, span: c.span + 1 } };
                return u;
            });
        }
        const host = findUnit(zone, args.ontoKey);
        const span = host.col.span;
        const half = Math.max(1, Math.floor(span / 2));
        const joiner = findUnit(sourceZone, args.key);
        sourceZone.units = sourceZone.units.filter((u) => u.key !== args.key);
        zone.units = zone.units.map((u) => u.key === args.ontoKey ? { ...u, col: { start: host.col.start, span: half } } : u);
        zone.units = [
            ...zone.units,
            {
                ...joiner,
                row: { start: host.row.start, span: host.row.span },
                col: { start: host.col.start + half, span: span - half },
            },
        ];
        tidyZone(zone);
        if (sourceZone !== zone)
            tidyZone(sourceZone);
        return commit(doc, next, decls);
    },
    /** Give a unit a row of its own, directly under the one it was in. */
    splitRow(doc, args, decls) {
        const next = clone(doc);
        const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target);
        const id = zoneHolding(zones, args.key);
        if (!id)
            return refuse(doc, `There is no unit \`${args.key}\` at this size.`);
        const zone = positionalZone(next, id, args.target);
        const unit = findUnit(zone, args.key);
        const at = unit.row.start + unit.row.span;
        zone.rows = [...zone.rows.slice(0, at - 1), zone.rows[unit.row.start - 1] ?? 'grow', ...zone.rows.slice(at - 1)];
        zone.units = zone.units.map((u) => {
            if (u.key === args.key)
                return { ...u, row: { start: at, span: 1 }, col: { start: 1, span: zone.cols.length } };
            if (u.row.start >= at)
                return { ...u, row: { start: u.row.start + 1, span: u.row.span } };
            if (u.row.start + u.row.span - 1 >= at)
                return { ...u, row: { start: u.row.start, span: u.row.span + 1 } };
            return u;
        });
        tidyZone(zone);
        return commit(doc, next, decls);
    },
    /**
     * Change how many tracks a unit spans on one axis.
     *
     * Materialises that axis first, for the same reason `joinRow` does: a span
     * whose result a person is meant to read as "8 of 12" needs every grow
     * track beside it to carry a share.
     */
    setSpan(doc, args, decls) {
        if (!isInt(args.span) || args.span < 1)
            return refuse(doc, 'A span is a whole number of tracks, at least 1.');
        const next = clone(doc);
        const zones = args.target === 'base' ? next.zones : effectiveZones(next, args.target);
        const id = zoneHolding(zones, args.key);
        if (!id)
            return refuse(doc, `There is no unit \`${args.key}\` at this size.`);
        const zone = positionalZone(next, id, args.target);
        if (args.axis === 'row')
            zone.rows = materialiseShares(zone.rows);
        else
            zone.cols = materialiseShares(zone.cols);
        zone.units = zone.units.map((u) => u.key === args.key ? { ...u, [args.axis]: { ...u[args.axis], span: args.span } } : u);
        return commit(doc, next, decls);
    },
    /** Retune one track. **Position, so a size target writes its variant.** */
    setTrackExtent(doc, args, decls) {
        if (!isExtent(args.extent))
            return refuse(doc, 'That is not a track extent.');
        const next = clone(doc);
        const zone = positionalZone(next, args.zone, args.target);
        if (!zone)
            return refuse(doc, `There is no \`${args.zone}\` zone at this size.`);
        const list = args.axis === 'row' ? zone.rows : zone.cols;
        if (args.index < 1 || args.index > list.length)
            return refuse(doc, `The ${args.zone} zone has no ${args.axis === 'row' ? 'row' : 'column'} ${args.index}.`);
        const copy = [...list];
        copy[args.index - 1] = args.extent;
        if (args.axis === 'row')
            zone.rows = copy;
        else
            zone.cols = copy;
        return commit(doc, next, decls);
    },
    /** Add a track, pushing everything after it along. */
    addTrack(doc, args, decls) {
        const next = clone(doc);
        const zone = positionalZone(next, args.zone, args.target);
        if (!zone)
            return refuse(doc, `There is no \`${args.zone}\` zone at this size.`);
        const list = args.axis === 'row' ? zone.rows : zone.cols;
        const at = Math.max(1, Math.min(args.at ?? list.length + 1, list.length + 1));
        const copy = [...list];
        copy.splice(at - 1, 0, args.extent ?? 'grow');
        if (args.axis === 'row')
            zone.rows = copy;
        else
            zone.cols = copy;
        zone.units = zone.units.map((u) => {
            const cur = u[args.axis];
            if (cur.start >= at)
                return { ...u, [args.axis]: { start: cur.start + 1, span: cur.span } };
            if (cur.start + cur.span - 1 >= at)
                return { ...u, [args.axis]: { start: cur.start, span: cur.span + 1 } };
            return u;
        });
        return commit(doc, next, decls);
    },
    /** Remove a track; a unit that lived only there refuses the whole edit. */
    removeTrack(doc, args, decls) {
        const next = clone(doc);
        const zone = positionalZone(next, args.zone, args.target);
        if (!zone)
            return refuse(doc, `There is no \`${args.zone}\` zone at this size.`);
        const list = args.axis === 'row' ? zone.rows : zone.cols;
        const word = args.axis === 'row' ? 'row' : 'column';
        if (args.index < 1 || args.index > list.length)
            return refuse(doc, `The ${args.zone} zone has no ${word} ${args.index}.`);
        if (list.length <= 1)
            return refuse(doc, `The ${args.zone} zone needs at least one ${word}.`);
        const orphan = zone.units.find((u) => {
            const cur = u[args.axis];
            return cur.span === 1 && cur.start === args.index;
        });
        if (orphan)
            return refuse(doc, `\`${orphan.key}\` is the only thing in ${word} ${args.index}; move it before removing the ${word}.`);
        const copy = [...list];
        copy.splice(args.index - 1, 1);
        if (args.axis === 'row')
            zone.rows = copy;
        else
            zone.cols = copy;
        zone.units = zone.units.map((u) => {
            const cur = u[args.axis];
            if (cur.start > args.index)
                return { ...u, [args.axis]: { start: cur.start - 1, span: cur.span } };
            if (cur.start + cur.span - 1 >= args.index)
                return { ...u, [args.axis]: { start: cur.start, span: Math.max(1, cur.span - 1) } };
            return u;
        });
        return commit(doc, next, decls);
    },
    /**
     * Pin or unpin a unit, or a side zone itself. **Membership**: the base and
     * every variant, so a pin made on a phone is the same pin on the desk.
     */
    setPinned(doc, args, decls) {
        const next = clone(doc);
        const write = (zone) => {
            if (args.key) {
                zone.units = (zone.units ?? []).map((u) => {
                    if (u.key !== args.key)
                        return u;
                    if (args.pinned) {
                        // Absent IS pinned — never store `true`, so a pinned
                        // document stays byte-identical to one saved before the
                        // field existed.
                        const { pinned: _was, ...rest } = u;
                        return rest;
                    }
                    return { ...u, pinned: false };
                });
            }
            else {
                const side = zone;
                if (args.pinned)
                    delete side.pinned;
                else
                    side.pinned = false;
            }
        };
        const target = args.zone ?? (args.key ? zoneHolding(next.zones, args.key) : undefined);
        if (!target)
            return refuse(doc, args.key ? `There is no unit \`${args.key}\`.` : 'Name a zone to pin.');
        if (!args.key && target === 'middle')
            return refuse(doc, 'The middle zone is the session, not a rail.');
        for (const layer of layersFor(next, target)) {
            const zone = layer.get();
            if (zone)
                write(zone);
        }
        return commit(doc, next, decls);
    },
    /** Merge widget units into one tab group. Membership: base and variants. */
    group(doc, args, decls) {
        if (!Array.isArray(args.keys) || args.keys.length < 2)
            return refuse(doc, 'A group needs at least two widgets.');
        const next = clone(doc);
        const id = zoneHolding(next.zones, args.keys[0]);
        if (!id)
            return refuse(doc, `There is no unit \`${args.keys[0]}\`.`);
        const groupKey = args.key ?? `g:${args.keys.join('+')}`;
        for (const layer of layersFor(next, id)) {
            const zone = layer.get();
            if (!zone)
                continue;
            const members = args.keys
                .map((k) => findUnit(zone, k))
                .filter((u) => !!u && u.kind === 'widget');
            if (members.length < 2)
                continue;
            const anchor = rowMajor(members)[0];
            zone.units = [
                ...zone.units.filter((u) => !args.keys.includes(u.key)),
                {
                    kind: 'group',
                    key: groupKey,
                    members: members.map((m) => ({ widget: m.widget, key: m.key })),
                    row: anchor.row,
                    col: anchor.col,
                    ...(members.every((m) => m.pinned === false) ? { pinned: false } : {}),
                },
            ];
            tidyZone(zone);
        }
        return commit(doc, next, decls);
    },
    /** Break a tab group back into its widgets, stacked in its rows. */
    ungroup(doc, args, decls) {
        const next = clone(doc);
        const id = zoneHolding(next.zones, args.key);
        if (!id)
            return refuse(doc, `There is no group \`${args.key}\`.`);
        for (const layer of layersFor(next, id)) {
            const zone = layer.get();
            if (!zone)
                continue;
            const unit = findUnit(zone, args.key);
            if (!unit || unit.kind !== 'group')
                continue;
            const group = unit;
            // Each member needs a row of its own, so the group's row becomes
            // the first and the rest are inserted under it.
            const extra = group.members.length - 1;
            const at = group.row.start + group.row.span;
            const extent = zone.rows[group.row.start - 1] ?? 'grow';
            zone.rows = [...zone.rows.slice(0, at - 1), ...Array.from({ length: extra }, () => extent), ...zone.rows.slice(at - 1)];
            zone.units = zone.units
                .filter((u) => u.key !== args.key)
                .map((u) => u.row.start >= at ? { ...u, row: { start: u.row.start + extra, span: u.row.span } } : u);
            zone.units = [
                ...zone.units,
                ...group.members.map((m, i) => ({
                    kind: 'widget',
                    key: m.key,
                    widget: m.widget,
                    row: { start: i === 0 ? group.row.start : at + i - 1, span: 1 },
                    col: { start: group.col.start, span: group.col.span },
                    ...(group.pinned === false ? { pinned: false } : {}),
                })),
            ];
            tidyZone(zone);
        }
        return commit(doc, next, decls);
    },
    /** Reorder a group's tabs. Membership order, so it lands everywhere. */
    reorderMembers(doc, args, decls) {
        const next = clone(doc);
        const id = zoneHolding(next.zones, args.key);
        if (!id)
            return refuse(doc, `There is no group \`${args.key}\`.`);
        for (const layer of layersFor(next, id)) {
            const zone = layer.get();
            if (!zone)
                continue;
            zone.units = zone.units.map((u) => {
                if (u.key !== args.key || u.kind !== 'group')
                    return u;
                const group = u;
                const byKey = new Map(group.members.map((m) => [m.key, m]));
                const ordered = args.order.map((k) => byKey.get(k)).filter((m) => !!m);
                const rest = group.members.filter((m) => !args.order.includes(m.key));
                return { ...group, members: [...ordered, ...rest] };
            });
        }
        return commit(doc, next, decls);
    },
    /**
     * Set one look. **An option, so it lands on the base** — and on every
     * variant zone that shadows the one being styled.
     */
    setLook(doc, args, decls) {
        const next = clone(doc);
        const put = (bagHolder) => {
            const bag = { ...(bagHolder.look ?? {}) };
            if (args.value === undefined)
                delete bag[args.look];
            else
                bag[args.look] = args.value;
            if (Object.keys(bag).length)
                bagHolder.look = bag;
            else
                delete bagHolder.look;
        };
        if (args.scope === 'root')
            put(next);
        else {
            const id = args.zone ?? (args.key ? zoneHolding(next.zones, args.key) : undefined);
            if (!id)
                return refuse(doc, 'Name a zone or a unit to style.');
            let touched = false;
            for (const layer of layersFor(next, id)) {
                const zone = layer.get();
                if (!zone)
                    continue;
                if (args.scope === 'zone') {
                    put(zone);
                    touched = true;
                }
                else {
                    zone.units = zone.units.map((u) => {
                        if (u.key !== args.key)
                            return u;
                        touched = true;
                        const copy = { ...u };
                        put(copy);
                        return copy;
                    });
                }
            }
            if (!touched)
                return refuse(doc, `There is nothing called \`${args.key ?? id}\` to style.`);
        }
        return commit(doc, next, decls);
    },
    /**
     * Drop what a move left behind: empty rows, a narrowed unit now alone in
     * its row, a column split nobody is using. Every op that moves or removes a
     * unit runs it already; this is the door for an editor that has just
     * rearranged a zone some other way.
     */
    tidy(doc, args, decls) {
        const next = clone(doc);
        const zone = positionalZone(next, args.zone, args.target);
        if (!zone)
            return refuse(doc, `There is no \`${args.zone}\` zone at this size.`);
        tidyZone(zone);
        return commit(doc, next, decls);
    },
    /**
     * Make a size its own: copy the zones it currently inherits into its
     * variant. Idempotent — a size already customized comes back by reference.
     */
    customizeVariant(doc, args, decls) {
        if (!(args.breakpoint in BREAKPOINTS))
            return refuse(doc, `\`${args.breakpoint}\` is not a size.`);
        if (doc.variants?.[args.breakpoint])
            return { doc };
        const next = clone(doc);
        next.variants = { ...(next.variants ?? {}), [args.breakpoint]: clone(effectiveZones(doc, args.breakpoint)) };
        return commit(doc, next, decls);
    },
    /** Return a size to inherited. Absent already: the input, by reference. */
    resetVariant(doc, args, decls) {
        if (!doc.variants?.[args.breakpoint])
            return { doc };
        const next = clone(doc);
        delete next.variants[args.breakpoint];
        if (!Object.keys(next.variants).length)
            delete next.variants;
        return commit(doc, next, decls);
    },
    /**
     * A one-column order, for **one size only**.
     *
     * The owner rule this exists for: a phone edit never degrades the desktop.
     * A folded order carries no information about columns, so writing it to the
     * base would shuffle a two-dimensional layout — it goes to the variant, and
     * `doc.zones` comes back byte-identical every time. `promoteOrder` is the
     * one door from here to the base, and it only opens when there are no
     * columns to damage.
     */
    reorderFolded(doc, args, decls) {
        if (args.target === 'base')
            return refuse(doc, 'A folded order is one size’s own; use promoteOrder to apply it to every size.');
        if (!(args.target in BREAKPOINTS))
            return refuse(doc, `\`${args.target}\` is not a size.`);
        const next = clone(doc);
        const zone = positionalZone(next, args.zone, args.target);
        if (!zone)
            return refuse(doc, `There is no \`${args.zone}\` zone at this size.`);
        const known = new Set((zone.units ?? []).map((u) => u.key));
        const order = args.order.filter((k) => known.has(k));
        if (order.length !== known.size)
            return refuse(doc, 'A folded order must name every unit in the zone exactly once.');
        foldOrderInto(zone, order);
        return commit(doc, next, decls);
    },
    /**
     * Apply one size's folded order to the base, so every size sees it.
     *
     * Succeeds **iff** every zone the order touches is already one column wide
     * at the base: that is the only promotion which cannot damage a desktop
     * layout, because it changes no columns. Otherwise it refuses with a
     * sentence naming the size and the units that sit side by side there.
     */
    promoteOrder(doc, args, decls) {
        const patch = doc.variants?.[args.breakpoint];
        if (!patch)
            return refuse(doc, `${SIZE_LABEL[args.breakpoint] ?? args.breakpoint} has no order of its own to apply.`);
        const affected = ZONE_IDS.filter((id) => patch[id]);
        // The base is what every uncustomized size sees; name the largest of
        // them, because that is the layout a promotion would damage.
        const servedByBase = [...BREAKPOINT_ORDER].reverse().find((bp) => !doc.variants?.[bp]) ?? BREAKPOINT_ORDER[BREAKPOINT_ORDER.length - 1];
        for (const id of affected) {
            const base = doc.zones[id];
            if (!base)
                continue;
            if ((base.cols?.length ?? 1) === 1)
                continue;
            const row = rowMajor(base.units ?? []).reduce((m, u) => {
                m.set(u.row.start, [...(m.get(u.row.start) ?? []), u.key]);
                return m;
            }, new Map());
            const side = [...row.values()].find((keys) => keys.length > 1) ?? [];
            const names = side.length ? side.join(' beside ') : `${base.cols.length} columns`;
            return refuse(doc, `${SIZE_LABEL[servedByBase]} has ${names}; apply the order there from a desktop.`);
        }
        const next = clone(doc);
        for (const id of affected) {
            const variantZone = patch[id];
            const base = next.zones[id];
            if (!base)
                continue;
            const order = rowMajor(variantZone.units ?? []).map((u) => u.key);
            foldOrderInto(base, order.filter((k) => (base.units ?? []).some((u) => u.key === k)));
            delete next.variants[args.breakpoint][id];
        }
        if (next.variants && !Object.keys(next.variants[args.breakpoint] ?? {}).length)
            delete next.variants[args.breakpoint];
        if (next.variants && !Object.keys(next.variants).length)
            delete next.variants;
        return commit(doc, next, decls);
    },
};
/** Rewrite a zone as one column, its units stacked in the given key order. */
function foldOrderInto(zone, order) {
    const byKey = new Map((zone.units ?? []).map((u) => [u.key, u]));
    const stacked = order.map((k) => byKey.get(k)).filter((u) => !!u);
    const rest = (zone.units ?? []).filter((u) => !order.includes(u.key));
    const all = [...stacked, ...rest];
    zone.rows = all.map((u) => combineExtents((zone.rows ?? []).slice(u.row.start - 1, u.row.start - 1 + u.row.span)));
    if (!zone.rows.length)
        zone.rows = ['grow'];
    zone.cols = ['grow'];
    zone.units = all.map((u, i) => ({ ...u, row: { start: i + 1, span: 1 }, col: { start: 1, span: 1 } }));
}
// ── fromLegacy ──────────────────────────────────────────────────────────────
/**
 * Widget ids that name nothing any build places. A saved blob, a preset or an
 * arrangement may still carry one — all three were stored verbatim and nothing
 * rewrote them — so every reader drops it.
 *
 * `composer` is one because the conversation is ONE widget: the log and the
 * field are one thing to arrange, and the field's shape is a setting on
 * `messages` rather than a widget beside it.
 *
 * `inventory` is one because R79 (2026-09-25) removed core's Inventory widget
 * for now, with no replacement. Adventure and Lair shipped it, so layouts and
 * presets saved from them name it; dropping it here is what makes such a layout
 * open on the widgets it still has — nothing drawn in its place, no labelled
 * placeholder. What somebody carries is the `inventory` stat (phase 3b), which
 * the stats widget draws as a list. Take it off
 * this list if the widget comes back.
 * @internal
 */
export const RETIRED_WIDGET_IDS = new Set(['composer', 'inventory']);
/**
 * Read a pre-v2 layout blob as a `LayoutPreset`, or `null` if it is not one.
 *
 * ## The mapping, exactly
 *
 * | legacy | v2 |
 * |---|---|
 * | `arrangedGrid[zone].items` sorted by `y` then `x` | the zone's units, in reading order |
 * | the distinct `y` boundaries | row tracks — `grow` for an item the widget grid called `grow`, `fit` for a one-cell band, `{ cells: h }` otherwise |
 * | `x`/`w` over the zone's `cols` | column tracks in **twelfths**, collapsed to one `grow` column when every item spanned the full width |
 * | `group` | a `GroupUnit` at the members' bounding box |
 * | `pinned: false` on an item or `zoneLayout.zones[side].pinned` | the unit's / the side's `pinned` |
 * | `anchor` | **dropped** — top/bottom survive only as reading order |
 * | a retired widget id | **dropped** |
 * | `widgetGrid.widgets` with no arrangement | one row per widget, in `order`, extent from `size.h` |
 * | `widgetSettings` inside the blob | lifted to `LayoutPreset.widgetSettings` |
 *
 * Deterministic and lossy, in that order: holes and anchors do not survive, and
 * the changelog says so. A v2 document — or a `LayoutPreset` around one —
 * passes straight through.
 * @internal
 */
export function fromLegacy(blob) {
    if (!isObj(blob))
        return null;
    // Already v2: a bare document, or a preset around one.
    if (blob.version === 2 && isObj(blob.zones))
        return { layout: blob };
    if (isObj(blob.layout) && blob.layout.version === 2)
        return blob;
    const hasLegacy = ['zoneLayout', 'widgetGrid', 'arrangedGrid', 'widgetSettings'].some((k) => Object.prototype.hasOwnProperty.call(blob, k));
    if (!hasLegacy)
        return null;
    const arranged = isObj(blob.arrangedGrid) ? blob.arrangedGrid : {};
    const grid = isObj(blob.widgetGrid) ? blob.widgetGrid : {};
    const gridWidgets = (Array.isArray(grid.widgets) ? grid.widgets : []).filter(isObj);
    const zoneLayout = isObj(blob.zoneLayout) ? blob.zoneLayout : {};
    const legacyZones = isObj(zoneLayout.zones) ? zoneLayout.zones : {};
    const live = (id) => typeof id === 'string' && !!id && !RETIRED_WIDGET_IDS.has(id);
    const heightOf = (id) => {
        const w = gridWidgets.find((g) => g.id === id);
        const h = isObj(w?.size) ? w.size.h : undefined;
        if (h === 'grow')
            return 'grow';
        if (h === 'fixed')
            return 'fit';
        if (isObj(h) && typeof h.cells === 'number')
            return { cells: h.cells };
        return 'grow';
    };
    const growsById = new Set(gridWidgets
        .filter((g) => isObj(g.size) && g.size.h === 'grow')
        .map((g) => g.id)
        .filter(live));
    const taken = new Set();
    const zones = {};
    /** A zone built from a saved arrangement: bands to rows, twelfths to columns. */
    const fromArrangement = (raw) => {
        if (!isObj(raw) || !Array.isArray(raw.items))
            return null;
        const cols = typeof raw.cols === 'number' && raw.cols > 0 ? raw.cols : 1;
        const items = raw.items
            .filter(isObj)
            .filter((i) => live(i.id) && ['x', 'y', 'w', 'h'].every((k) => typeof i[k] === 'number'))
            .map((i) => ({
            id: i.id,
            x: i.x,
            y: i.y,
            w: i.w,
            h: i.h,
            ...(typeof i.group === 'string' ? { group: i.group } : {}),
            ...(i.pinned === false ? { pinned: false } : {}),
        }))
            .filter((i) => !taken.has(i.id))
            .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
        if (!items.length)
            return null;
        const groups = new Map();
        const placed = [];
        for (const it of items) {
            taken.add(it.id);
            if (it.group) {
                groups.set(it.group, [...(groups.get(it.group) ?? []), it]);
                continue;
            }
            placed.push({
                unit: {
                    kind: 'widget',
                    key: it.id,
                    widget: it.id,
                    row: { start: 1, span: 1 },
                    col: { start: 1, span: 1 },
                    ...(it.pinned === false ? { pinned: false } : {}),
                },
                x0: it.x,
                x1: it.x + it.w,
                y0: it.y,
                y1: it.y + it.h,
            });
        }
        for (const [key, members] of groups) {
            const x0 = Math.min(...members.map((m) => m.x));
            const x1 = Math.max(...members.map((m) => m.x + m.w));
            const y0 = Math.min(...members.map((m) => m.y));
            const y1 = Math.max(...members.map((m) => m.y + m.h));
            placed.push({
                unit: {
                    kind: 'group',
                    key,
                    members: members.map((m) => ({ widget: m.id, key: m.id })),
                    row: { start: 1, span: 1 },
                    col: { start: 1, span: 1 },
                    // A group reads as pinned unless EVERY member says otherwise
                    // — the same answer the per-item default gives.
                    ...(members.every((m) => m.pinned === false) ? { pinned: false } : {}),
                },
                x0,
                x1,
                y0,
                y1,
            });
        }
        placed.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0 || String(a.unit.key).localeCompare(String(b.unit.key)));
        // y-bands → row tracks.
        const bounds = [...new Set(placed.flatMap((p) => [p.y0, p.y1]))].sort((a, b) => a - b);
        const bands = [];
        for (let i = 0; i < bounds.length - 1; i++)
            bands.push([bounds[i], bounds[i + 1]]);
        if (!bands.length)
            bands.push([0, 1]);
        const rows = bands.map(([from, to]) => {
            const covering = placed.filter((p) => p.y0 < to && p.y1 > from);
            if (covering.some((p) => widgetIdsOf(p.unit).some((w) => growsById.has(w))))
                return 'grow';
            const span = to - from;
            return span <= 1 ? 'fit' : { cells: span };
        });
        // x-extents → column tracks in twelfths, unless everything is full-width.
        const fullWidth = placed.every((p) => p.x0 <= 0 && p.x1 >= cols);
        const colCount = fullWidth ? 1 : 12;
        const toTwelfth = (x) => Math.max(0, Math.min(12, Math.round((x * 12) / cols)));
        const units = placed.map((p) => {
            const rowStart = bands.findIndex(([from]) => from >= p.y0);
            const rowEnd = bands.findIndex(([, to]) => to >= p.y1);
            const start = (rowStart < 0 ? 0 : rowStart) + 1;
            const span = Math.max(1, (rowEnd < 0 ? bands.length - 1 : rowEnd) + 1 - start + 1);
            const c0 = fullWidth ? 1 : toTwelfth(p.x0) + 1;
            const c1 = fullWidth ? 2 : Math.max(c0 + 1, toTwelfth(p.x1) + 1);
            return { ...p.unit, row: { start, span }, col: { start: c0, span: c1 - c0 } };
        });
        return { rows, cols: Array.from({ length: colCount }, () => 'grow'), units };
    };
    /** A zone built from a bare id list: one widget per row, top to bottom. */
    const fromOrder = (ids) => {
        const keep = ids.filter(live).filter((id) => !taken.has(id));
        if (!keep.length)
            return null;
        for (const id of keep)
            taken.add(id);
        return {
            rows: keep.map(heightOf),
            cols: ['grow'],
            units: keep.map((id, i) => ({
                kind: 'widget',
                key: id,
                widget: id,
                row: { start: i + 1, span: 1 },
                col: { start: 1, span: 1 },
            })),
        };
    };
    // The middle first, so a widget named in two places belongs to the one that
    // matters most; then the sides in reading order.
    for (const id of ['middle', 'left', 'right']) {
        const built = fromArrangement(arranged[id]) ??
            fromOrder(id === 'middle'
                ? gridWidgets
                    .filter((w) => (w.zone ?? 'middle') === 'middle')
                    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
                    .map((w) => w.id)
                    .filter(live)
                : (() => {
                    const z = legacyZones[id];
                    const list = isObj(z) && Array.isArray(z.widgets) ? z.widgets : [];
                    return list.filter(live);
                })());
        if (built)
            zones[id] = built;
        else if (id !== 'middle' && isObj(legacyZones[id]))
            // A declared side with nothing in it is still declared: the Adventure
            // lore rail lands collapsed on the day core ships a lore widget.
            zones[id] = { rows: ['grow'], cols: ['grow'], units: [] };
    }
    if (!zones.middle)
        zones.middle = { rows: ['grow'], cols: ['grow'], units: [] };
    for (const id of ['left', 'right']) {
        const z = legacyZones[id];
        if (zones[id] && isObj(z) && z.pinned === false)
            zones[id].pinned = false;
    }
    const layout = {
        version: 2,
        zones: {
            ...(zones.left ? { left: zones.left } : {}),
            middle: zones.middle,
            ...(zones.right ? { right: zones.right } : {}),
        },
    };
    const settings = isObj(blob.widgetSettings) ? blob.widgetSettings : null;
    const widgetSettings = {};
    if (settings)
        for (const [key, value] of Object.entries(settings))
            if (live(key) && isObj(value))
                widgetSettings[key] = value;
    return { layout, ...(Object.keys(widgetSettings).length ? { widgetSettings } : {}) };
}
//# sourceMappingURL=layout.js.map