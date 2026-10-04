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
import type { WidgetDecl } from './layout.js';
/** The three zones, in visual order. There is no fourth. @experimental */
export declare const ZONE_IDS: readonly ['left', 'middle', 'right'];
/** @experimental */
export type ZoneId = (typeof ZONE_IDS)[number];
/** The separator between a widget id and an instance name. @experimental */
export declare const INSTANCE_NAME_SEPARATOR = "#";
/** An instance name: short, kebab, lower case (`sanctum`, `2`). @experimental */
export declare const INSTANCE_NAME: RegExp;
/** The widget a placed id is a copy of: the id up to its `#`, else the id. @experimental */
export declare function widgetOfInstance(instanceId: string): string;
/** The instance name of a copy (`sanctum` of `messages#sanctum`), or `null` for the widget itself. @experimental */
export declare function instanceNameOf(instanceId: string): string | null;
/** Is this placed id a copy of `widgetId` — the widget itself or one of its instances? @experimental */
export declare function isInstanceOf(instanceId: string, widgetId: string): boolean;
/**
 * Is this string a widget instance id a layout may place? The widget half is
 * core's grammar (`world-state`) or a plugin's namespaced one
 * (`acme.maps:map`, `parsePluginWidgetId`); the instance name, when there is
 * one, is {@link INSTANCE_NAME}.
 * @experimental
 */
export declare function isWidgetInstanceId(id: unknown): id is string;
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
export declare const RETIRED_WIDGET_IDS: ReadonlySet<string>;
/**
 * One width rule of a side zone's ladder. `min` is the session box's inline
 * size (px) at or above which the rule applies; rules merge ascending, each
 * stating only what changes.
 * @experimental
 */
export interface LayoutZoneRule {
    min: number;
    /** A side: `drawer` · `rail` · `icons` · `hidden`. A strip: `row` · `hidden`. */
    mode?: 'drawer' | 'rail' | 'icons' | 'hidden' | 'row';
    /** The rail's or drawer's inline size, px. */
    width?: number;
    /** Rail stack columns (a wide screen turns a rail into a grid). */
    columns?: number;
}
/**
 * One zone of `zoneLayout`: a side column (or a strip) and the widgets it
 * lists, in order.
 *
 * Where the page draws it is `side` (a side zone) or `area` (a strip) — never
 * its key — and a zone that does not say it is a strip is a side.
 * @experimental
 */
export interface LayoutZoneDef {
    kind: 'side' | 'strip';
    /** A side zone's edge. Absent is the right: state it. */
    side?: 'left' | 'right';
    /** A strip: above or below the conversation. Absent is the top: state it. */
    area?: 'top' | 'bottom';
    /** The editor's label; the zone's key when absent. */
    label?: string;
    /** A docked column when absent or `true`; an icon strip when `false`. */
    pinned?: boolean;
    /** Widget instance ids, in order. */
    widgets: string[];
    /** The width ladder. Absent means the app's default for the side. */
    rules?: LayoutZoneRule[];
}
/**
 * The `zoneLayout` slot. A zone is keyed by where the page draws it: a side
 * zone by its `side` (`left`, `right`), a strip by its `area` (`top`,
 * `bottom`) — so one layout has at most one of each, and the key and the
 * field never disagree (`validateSessionLayout` refuses a layout where they
 * do). The middle has no zone here: its membership is the widget grid's. The
 * type is a string record because a stored blob is read as it was written.
 * @experimental
 */
export interface ZoneLayoutV1 {
    version: 1;
    zones: Record<string, LayoutZoneDef>;
    /** The message pack by name (`novel`), the id-free way to pick one. */
    styles?: {
        chat?: string;
    };
}
/**
 * How a grid widget sizes on one axis: `grow` fills what is left (a `1fr`
 * track), `fixed` is content-sized (`auto`), or a number of cells.
 * @experimental
 */
export type GridSizeSpec = 'grow' | 'fixed' | {
    minCells?: number;
    maxCells?: number;
    cells?: number;
};
/**
 * The edges of its space a widget sticks to as the grid reflows. ⚠ Not a lore
 * entry's **anchor** (the reference that governs its visibility).
 * @experimental
 */
export interface WidgetAnchor {
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
}
/** One widget in the widget grid. @experimental */
export interface GridWidget {
    /** A widget instance id. */
    id: string;
    zone: ZoneId;
    /** Its place in the zone's stack, top to bottom. */
    order: number;
    /** Cells wide; absent spans the zone. */
    colSpan?: number;
    size: {
        w: GridSizeSpec;
        h: GridSizeSpec;
    };
    anchor: WidgetAnchor;
    /** Stays visible when the drawer is closed. */
    pinned?: boolean;
    /** Only meaningful when pinned: the card background toggle. */
    background?: boolean;
    /** Tab-group membership. */
    group?: string;
}
/** The `widgetGrid` slot. @experimental */
export interface WidgetGridV1 {
    version: 1;
    /** The cell module, px. */
    cell: number;
    widgets: GridWidget[];
}
/**
 * One widget's cell box in an arranged zone: 0-based origin and span, in whole
 * cells of that zone's grid.
 * @experimental
 */
export interface ArrangedItem {
    /** A widget instance id. */
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    anchor?: WidgetAnchor;
    /** Tab-group membership: items sharing one draw as one tab set (`g:` + the sorted members). */
    group?: string;
    /** Docked in a side column. ABSENT MEANS PINNED; `false` is the only value written. */
    pinned?: boolean;
}
/** One zone's arrangement: its cell grid and the items on it. @experimental */
export interface ArrangedZone {
    cols: number;
    rows: number;
    items: ArrangedItem[];
}
/** The `arrangedGrid` slot: one arrangement per zone that has one. @experimental */
export type ArrangedGridV1 = Partial<Record<ZoneId, ArrangedZone>>;
/**
 * A **style pin** a layout carries: the widget style it draws with. A person's
 * saved layout carries `{ id, slug }` from their pins; a shipped one can know
 * only the slug, because a row id belongs to one install.
 * @experimental
 */
export interface WidgetStylePin {
    slug: string;
    id?: number;
}
/**
 * The **session layout**. Every slot is optional: a layout says what it
 * arranges and nothing else.
 * @experimental
 */
export interface SessionLayoutV1 {
    zoneLayout?: ZoneLayoutV1;
    widgetGrid?: WidgetGridV1;
    arrangedGrid?: ArrangedGridV1;
    /** Per-instance widget settings, keyed by widget instance id. */
    widgetSettings?: Record<string, Record<string, unknown>>;
    /** Style pins, keyed by widget instance id. */
    widgetStyles?: Record<string, WidgetStylePin>;
}
/**
 * Every widget instance id the layout NAMES — the zone lists, the grid and the
 * arrangement — each once, in that order. What a check reads when the question
 * is "does this layout mention it at all" (a genre's omitted widgets).
 * @experimental
 */
export declare function layoutWidgetIds(layout: SessionLayoutV1): string[];
/**
 * The widget instance ids the MIDDLE names: the grid's middle entries, then
 * the arranged middle's items, each once.
 * @experimental
 */
export declare function middleWidgetIds(layout: SessionLayoutV1): string[];
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
export declare function drawnWidgetIds(layout: SessionLayoutV1): string[];
/**
 * Does the layout DRAW any instance of `primaryId` — the bare id or a
 * `#name` copy — anywhere? The **primary floor**'s question: placement is
 * free, and the one rule left is that a layout draws its genre's primary
 * widget somewhere.
 * @experimental
 */
export declare function primaryPlaced(layout: SessionLayoutV1, primaryId: string): boolean;
/** @experimental */
export interface SessionLayoutValidation {
    ok: boolean;
    /** What makes the layout unusable as shipped. Any error refuses it. */
    errors: string[];
    /** What draws, but not as declared: an unknown widget draws a placeholder. */
    warnings: string[];
}
/** What {@link validateSessionLayout} checks ids against. @experimental */
export interface SessionLayoutValidationOptions {
    /**
     * Widget declarations, under the ids the layout names them by (core's
     * bare, a plugin's namespaced — or, in a package's own declaration, the
     * package's bare). A widget listed here and placed more often than its
     * `maxInstances` is a warning.
     */
    widgets?: readonly Pick<WidgetDecl, 'id' | 'maxInstances'>[];
    /**
     * `'warn'` when `widgets` is every widget the caller knows — an
     * instance's check, core's and every enabled package's — so a widget
     * outside it is warned about too: it draws a labelled placeholder. A
     * packager knows its own widgets and not the rest, and leaves this at
     * `'ignore'` (the default).
     */
    unknownWidgets?: 'warn' | 'ignore';
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
export declare function validateSessionLayout(layout: unknown, opts?: SessionLayoutValidationOptions): SessionLayoutValidation;
//# sourceMappingURL=sessionLayout.d.ts.map