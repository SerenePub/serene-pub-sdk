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
import type { FieldDecl, I18nText, SettingsSchema } from './settings.js';
import type { I18n } from './i18n.js';
import type { WidgetBaseSection, WidgetSectionScope } from './widgets.js';
/** The three zones, in visual order. There is no fourth; see the file header. @experimental */
export declare const ZONE_IDS: readonly ['left', 'middle', 'right'];
/** @experimental */
export type ZoneId = (typeof ZONE_IDS)[number];
/**
 * The four sizes, as the **session box's** inline size — never the viewport's.
 * Opening a sidebar cascades the layout exactly as narrowing the window does,
 * which is the whole reason the numbers are measured on the box.
 * @experimental
 */
export declare const BREAKPOINTS: {
    readonly compact: 0;
    readonly cozy: 640;
    readonly roomy: 1024;
    readonly wide: 1440;
};
/** @experimental */
export type Breakpoint = keyof typeof BREAKPOINTS;
/** Ascending, which is the order every "at or above" rule walks. @experimental */
export declare const BREAKPOINT_ORDER: readonly Breakpoint[];
/**
 * The reference box each size is edited and checked at (§5.1): a width and a
 * device height. `checkSizes` resolves at these, and the editor's Screen picker
 * draws them, so "what the phone will do" is one answer rather than two.
 * @experimental
 */
export declare const REFERENCE_BOXES: Record<Breakpoint, {
    width: number;
    height: number;
}>;
/** The size a measured box is. Total: anything under `cozy` is `compact`. @experimental */
export declare function breakpointFor(width: number): Breakpoint;
/**
 * The narrowest a widget is ever asked to be. A side thinner than this, or a
 * box thinner than a zone's own tracks, folds that zone to one column — the
 * one measurement in the whole model, and it is a floor rather than a ladder.
 * @experimental
 */
export declare const MIN_WIDGET_PX = 220;
/**
 * What a track means, never what it measures.
 *
 * `grow` is `1fr`, `fit` is `auto`, `{ cells: n }` is N of the cell module, and
 * `{ min, max }` is a `minmax()` in cells. Nothing here is pixels: the cell
 * module is a root look emitted in `rem`, so a layout follows the reader's zoom
 * instead of pinning itself to one device.
 *
 * `{ grow: n }` is a **share**: n twelfths of what the grow tracks on that axis
 * divide between them, emitted as `nfr`. It exists because "Map beside Messages
 * at 8 and 4 of 12" is a sentence the editor's join gesture has to be able to
 * write down, and a bare `grow` has no number to write it in.
 *
 * ⚠ A share only reads as "n of twelve" when **every** grow track on that axis
 * carries one. `joinRow` and `setSpan` therefore materialise the whole axis
 * before they write (`materialiseShares`), and a track handle between two share
 * tracks moves both and preserves their total — which is what keeps the reading
 * true after a drag. A bare `grow` beside a share is a mixed axis, and its
 * share is whatever the weighted ones have not claimed.
 * @experimental
 */
export type Extent = 'grow' | 'fit' | {
    cells: number;
} | {
    min?: number;
    max?: number;
} | {
    grow: number;
};
/** A grow track's share is read in twelfths of its axis. @experimental */
export declare const TWELFTHS = 12;
/**
 * A bag of **look** deviations — declared keys only, and only where the value
 * differs from the declaration's default. Everything else is inherited, so a
 * document says what somebody changed rather than restating the theme.
 * @experimental
 */
export type LookBag = Record<string, unknown>;
/**
 * The shared half of every unit. Exported because the three unit types extend
 * it and a declaration emit cannot name a private type; a reader holding a unit
 * of an unknown `kind` can type it as this.
 * @experimental
 */
export interface UnitBase {
    /** `widget` · `group` · `spacer` today; anything else draws a placeholder. */
    kind: string;
    /**
     * The **instance key**: unique in the document, default the widget id.
     *
     * ⚠ There is deliberately **no `title`** here. What a unit is called comes
     * from the `WidgetDecl` it names, so one rename reaches every document and a
     * layout never carries a stale label for a widget somebody renamed. A person
     * naming their own instance is a per-instance SETTING (`title`, core-owned),
     * stored against this key — not a second copy of the name in the placement.
     */
    key: string;
    /** 1-based grid lines. `start` is the line, `span` the track count. */
    row: {
        start: number;
        span: number;
    };
    col: {
        start: number;
        span: number;
    };
    /** Absent means pinned — the 2026-09-10 rule, kept verbatim. */
    pinned?: boolean;
    /** Fold order and space contention; default from the widget declaration. */
    priority?: number;
    /** Unit-scope looks. */
    look?: LookBag;
}
/** @experimental */
export interface WidgetUnit extends UnitBase {
    kind: 'widget';
    widget: string;
}
/** Several widgets drawn as one tab set, occupying one unit's cells. @experimental */
export interface GroupUnit extends UnitBase {
    kind: 'group';
    members: Array<{
        widget: string;
        key: string;
    }>;
}
/** Deliberate empty space, so a person can leave a hole without a placeholder. @experimental */
export interface SpacerUnit extends UnitBase {
    kind: 'spacer';
}
/** Discriminated on `kind`. A document may carry kinds this build has never heard of. @experimental */
export type Unit = WidgetUnit | GroupUnit | SpacerUnit;
/** @experimental */
export interface Zone {
    /** At least one; the default is `['grow']`. */
    rows: Extent[];
    /** At least one; the default is `['grow']`. */
    cols: Extent[];
    units: Unit[];
    /** Zone-scope looks. */
    look?: LookBag;
}
/** @experimental */
export interface SideZone extends Zone {
    /** Absent means a docked column; `false` means an icon rail. */
    pinned?: boolean;
    /** The docked column's inline size. Default `{ cells: 6 }`. */
    width?: Extent;
}
/** @experimental */
export interface LayoutDoc {
    version: 2;
    zones: {
        left?: SideZone;
        middle: Zone;
        right?: SideZone;
    };
    /**
     * One size's own zones — **a patch, and the patch granularity is the zone**:
     * a variant that names `right` replaces that whole zone and says nothing
     * about the other two. A variant serves its own size and every smaller size
     * that has none of its own (`resolve` rule 1).
     */
    variants?: Partial<Record<Breakpoint, Partial<LayoutDoc['zones']>>>;
    /** Root-scope looks. */
    look?: LookBag;
}
/**
 * A layout as it is **shipped or saved**: the document plus the per-instance
 * settings and style pins that came with it. A genre ships one; a person's
 * saved preset is one; the reconciler writes all three columns from it.
 *
 * Both maps are keyed by **instance key**, not by widget id — which are the
 * same string until somebody places a second copy of a widget.
 * @experimental
 */
export interface LayoutPreset {
    layout: LayoutDoc;
    widgetSettings?: Record<string, Record<string, unknown>>;
    widgetStyles?: Record<string, {
        id: number;
        slug: string;
    }>;
}
/** The docked width a side takes when it does not declare one. @experimental */
export declare const DEFAULT_SIDE_WIDTH: Extent;
/**
 * Data a widget requests access to (grant-gated, host-enforced at
 * projection): a scope that delivers a scoped section — the SDK's one table,
 * `WidgetScopedSections` (`session:full`, `session:state`, `persona`,
 * `characters`, `lore`) — or a `channel:<slug>`.
 * @experimental
 */
export type WidgetScope = WidgetSectionScope | `channel:${string}`;
/** An external plugin dependency; the CLI captures pkg/range from the imports. @experimental */
export interface WidgetDependency {
    /** The depended-on plugin's stable manifest id. */
    pluginId: string;
    /** The npm package the direct API reference resolved to (CLI-filled). */
    pkg?: string;
    /** Semver range the author built against (CLI-filled). */
    range?: string;
}
/**
 * A built-in style a widget ships. Seeded as a `source: "system"` row keyed by
 * `systemStyleSlug(widgetId, slug)`; users never edit these in place — they
 * clone one into a private style. `css` is the scoped skin injected into the
 * widget's box (a component) or frame document (frame); `vars` overrides design
 * tokens (CSS custom properties).
 * @experimental
 */
export interface WidgetStylePreset {
    /** Stable per-widget key — the seed identity within this widget's styles. */
    slug: string;
    title: string;
    css: string;
    vars?: Record<string, string>;
    /**
     * What `vars` this pack exposes, in the one field language.
     *
     * Stored per style row as today — the schema only makes the pack's own
     * knobs editable **without CSS**, so a person can retune a shipped skin
     * instead of cloning it and hand-editing a stylesheet to change one radius.
     * A var with no declaration here stays exactly what it is: CSS the author
     * wrote, which nothing offers to edit.
     */
    varsSchema?: SettingsSchema;
}
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
export declare function systemStyleSlug(widgetId: string, presetSlug: string): string;
/**
 * The deprecated spelling of what a widget renders (R24): a plugin's own
 * frame document. `native` — a core component the page mounted in its own
 * tree — is gone (R79): every widget is a component, and a declaration still
 * spelling `{ kind: 'native' }` resolves to nothing.
 * @experimental
 */
export type WidgetSurfaceAlias = {
    kind: 'frame';
    pluginId: string;
    entry: string;
};
/**
 * What a widget renders, resolved — the host's switch. `remote` is a
 * component running in its owner's UI worker, mirrored through the
 * vocabulary (§3.5) — core's own components as much as a plugin's (R79);
 * `frame` a plugin document in an opaque-origin iframe.
 * @experimental
 */
export type WidgetSurface = {
    kind: 'frame';
    pluginId: string;
    entry: string;
} | {
    kind: 'remote';
    owner: string;
    component: string;
};
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
export declare function resolveWidgetSurface(decl: Pick<WidgetDecl, 'component' | 'surface'>, owner: string): WidgetSurface | null;
/**
 * One **widget** a session offers: the conversation, a portrait column, a
 * plugin frame. Component and frame widgets share ONE declaration (this) and
 * ONE data contract; the only difference is the iframe.
 *
 * Declaring a widget makes it *addable*. Where an instance of it sits is the
 * layout document's business — `placement` only says where a fresh drop lands.
 * @experimental
 */
export interface WidgetDecl {
    /** Stable id — units and `surface:open` intents key on this. */
    id: string;
    /** Human title shown in the widget's chrome and the tray — a string or a locale map (R-20). */
    title: I18n;
    /** Optional icon name (the app maps it to its icon set). */
    icon?: string;
    /**
     * The anchored conversation is `primary` — **required**: the middle is never
     * empty, and if no primary widget is placed anywhere `resolve` appends it.
     * Everything else is `secondary` (the default).
     */
    role?: 'primary' | 'secondary';
    /**
     * The genres whose sessions offer it (R71), by id — `widget()` reads
     * genre values down to these. Absent = every genre. A genre may still
     * withhold it (`GenreDecl.omitWidgets`).
     */
    genres?: string[];
    /**
     * What renders inside: the slug of a {@link ComponentDecl} in the same
     * package (R25). Core's widgets name core components. Give this or the
     * deprecated `surface`, never both.
     */
    component?: string;
    /**
     * ⏳ The alias `component` replaces (R24), accepted until 0.7: `frame`
     * mounts a generated component whose whole body is one `sp-frame` at the
     * entry. `native` is retired (R79) and a written `remote` refused — name
     * the component instead.
     *
     * @deprecated Declare `component`.
     */
    surface?: WidgetSurfaceAlias;
    /** Which channels feed it (20 §4/§7). A widget is a view onto its channels. */
    channels?: string[];
    /**
     * Size bounds in **cells** — the floor and ceiling `resolve` and the editor
     * both enforce. A unit whose allotted space is below `minW`/`minH` applies
     * its `fold`, and the editor's track drag stops at the same number and names
     * the widget.
     */
    cells?: {
        minW?: number;
        maxW?: number;
        minH?: number;
        maxH?: number;
    };
    /** Data the widget requests; each entry is a grant an admin can deny. */
    scopes?: WidgetScope[];
    /**
     * The BASE sections this widget reads (R75) — `messages`, `settings`, … —
     * and so the only ones its host sends it: a widget that does not read
     * `messages` is never handed the log again on every token. Absent means
     * every base section, which is what a widget declared before R75 reads.
     * A name outside `WIDGET_BASE_SECTIONS` is refused where the widget is
     * declared. Scoped sections are not named here — `scopes` asks for them.
     */
    reads?: WidgetBaseSection[];
    /** External plugin dependencies (CLI-captured into the manifest). */
    dependencies?: WidgetDependency[];
    /** Built-in styles this widget ships; seeded as system rows. */
    presets?: WidgetStylePreset[];
    /**
     * Per-instance settings this widget offers, in the SDK's one field
     * language — the same `FieldDecl` a node's `params` are declared in, so one
     * renderer draws both and an author who has written node params has written
     * these.
     *
     * Exposure is progressive and declaration-driven: a field appears in the
     * widget's settings panel only because it is here, and a field carrying
     * `group: 'behaviour'` appears behind the advanced disclosure. Core owns
     * `title` and `lane` for every widget, so those two keys are reserved and a
     * declaration of either is ignored.
     *
     * Values are stored per widget instance as deviations from the defaults
     * declared here; a field dropped from this schema has its stored values
     * pruned on the next reconcile.
     */
    settings?: SettingsSchema;
    /**
     * Where a fresh drop — or a `surface:open` intent — puts an instance, and
     * what shape it takes when it lands. Placement only; a placed unit's
     * position is the document's.
     */
    placement?: {
        /** Default zone. Absent means `right`. */
        zone?: ZoneId;
        /** Default row extent when placed alone in a row. Absent means `grow`. */
        height?: Extent;
        /** Default column share of twelve when joining a row. */
        span?: number;
        /** Default `pinned` for the unit. `layout.prefer: 'drawer'` maps to `false`. */
        pinned?: boolean;
    };
    /**
     * What happens below its declared minimum: `shrink` keeps it at whatever it
     * is given, `scroll` keeps it and scrolls, `rail` sends it to the zone's
     * icon rail, `hide` hides it. Absent means `scroll`.
     */
    fold?: 'shrink' | 'scroll' | 'rail' | 'hide';
    /**
     * Fold order and space contention: **lower yields first**, and the primary
     * widget is `0`. Absent means 50.
     */
    priority?: number;
    /**
     * ⏳ The surface-grid packer's hints, kept one release as deprecated inputs
     * to the same defaults (`span.ideal` → `placement.span`, `minInline` →
     * `cells.minW`, `prefer: 'drawer'` → `placement.pinned: false`).
     *
     * @deprecated Declare `placement`, `cells` and `fold` instead.
     */
    layout?: {
        span?: {
            ideal?: number;
            min?: number;
            max?: number;
        };
        minInline?: number;
        minBlock?: number;
        collapsible?: boolean;
        closable?: boolean;
        prefer?: 'grid' | 'drawer';
    };
    /** Seed this widget into a new session's default layout. Default false. */
    defaultActive?: boolean;
}
/**
 * One **look**: a declared layout variable, at root, zone or unit scope.
 *
 * Looks are how the model grows without growing keys. Core ships eight
 * (`CORE_LOOKS`); a plugin ships its own under a namespaced key, and both are
 * read the same way — `resolve` reads the `structural` ones to build the grid
 * templates and passes every other one through as a CSS variable at its scope.
 * @experimental
 */
export interface LookDecl {
    /** Core bare (`backdrop`); a plugin namespaces it (`<pluginId>.key`). */
    key: string;
    /** The settings field language: type, default, editor, group. */
    field: FieldDecl;
    appliesTo: Array<'root' | 'zone' | 'unit'>;
    /** Read by `resolve()` to build the templates. Everything else passes through. */
    structural?: boolean;
    /** Default `--sp-look-<key>`. */
    cssVar?: string;
    /**
     * The CSS unit a numeric value is emitted in. `rem` divides by 16, so a
     * value that is a module (the cell) follows the reader's zoom; `px` is for
     * the gaps and pads that should not. Absent means the number is emitted
     * bare, which is what a unitless variable (a count, a ratio) wants.
     */
    unit?: 'px' | 'rem';
    label?: I18nText;
    description?: I18nText;
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
export declare function lookCssVar(decl: LookDecl): string;
/** Both declaration sets `resolve`, `checkSizes` and `validateLayoutDoc` read. @internal */
export interface LayoutDecls {
    widgets?: WidgetDecl[];
    looks?: LookDecl[];
}
/** A weighted grow track — `{ grow: n }`, n twelfths of the axis. @experimental */
export declare const isShare: (e: Extent) => e is {
    grow: number;
};
/** @experimental */
export declare function isExtent(x: unknown): x is Extent;
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
export declare function materialiseShares(tracks: Extent[], force?: boolean): Extent[];
/** @experimental */
export interface LayoutValidation {
    ok: boolean;
    /** The document cannot be stored as it is. */
    errors: string[];
    /** Reported, pruned at reconcile, never fatal. */
    warnings: string[];
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
export declare function validateLayoutDoc(doc: unknown, opts?: LayoutDecls): LayoutValidation;
/** @internal */
export interface Box {
    width: number;
    height: number;
    /** Measured side widths, when the host has them. */
    sideWidths?: Partial<Record<'left' | 'right', number>>;
}
/** @internal */
export interface ResolvedUnit {
    key: string;
    /** A `grid-area` line string: `rowStart / colStart / rowEnd / colEnd`. */
    area: string;
    /** Not drawn at this size (fold `hide`, or a hidden zone). */
    hidden?: boolean;
    /** Drawn as an icon in the zone's rail rather than in the grid. */
    rail?: boolean;
    /**
     * Set **only** when this unit's declared minimum could not be met at this
     * size — the fold that was applied. Absent means the unit fits.
     */
    fold?: 'shrink' | 'scroll' | 'rail' | 'hide';
    /** Unit-scope look variables. */
    vars?: Record<string, string>;
}
/** @internal */
export interface ResolvedZone {
    state: 'docked' | 'rail' | 'sheet' | 'hidden';
    gridTemplateRows: string;
    gridTemplateColumns: string;
    units: ResolvedUnit[];
    vars: Record<string, string>;
}
/** @internal */
export interface Resolved {
    breakpoint: Breakpoint;
    /** `null` = the document declares no such zone. */
    zones: Record<ZoneId, ResolvedZone | null>;
    /** Root CSS variables: the structural looks and every pass-through one. */
    vars: Record<string, string>;
}
/** @experimental */
export declare function extentToCss(e: Extent): string;
/**
 * How many tracks a grid template names.
 *
 * A paren-aware scan rather than a split on whitespace, because a single track
 * is routinely `calc(4 * var(--sp-cell))` or `minmax(0, 1fr)` and both carry
 * spaces of their own. Counting those as three tracks would make a one-column
 * zone look like several to anything reading the template back.
 * @internal
 */
export declare function trackCount(template: string): number;
/**
 * The variant that serves a size: the nearest **customized** one at or above
 * it. A variant at `roomy` serves `cozy` and `compact` unless they have their
 * own, and nothing below the base ever reaches upward — which is what makes a
 * phone edit unable to touch the desktop.
 * @experimental
 */
export declare function servingVariant(doc: LayoutDoc, bp: Breakpoint): Breakpoint | null;
/** The zones in force at one size: the base patched, a zone at a time. @internal */
export declare function effectiveZones(doc: LayoutDoc, bp: Breakpoint): LayoutDoc['zones'];
/**
 * The document at one box, as grid templates and `grid-area` strings.
 *
 * Pure and **total** for every box and every document that parses — unknown
 * look keys and unknown unit kinds included. The six rules run in the order
 * §2.5 states them, and each is marked below.
 * @internal
 */
export declare function resolve(doc: LayoutDoc, box: Box, decls?: LayoutDecls): Resolved;
/** @experimental */
export type LayoutFindingKind = 'below-minimum' | 'hidden' | 'folded' | 'sheet';
/** @experimental */
export interface LayoutFinding {
    breakpoint: Breakpoint;
    kind: LayoutFindingKind;
    zone: ZoneId;
    /** The unit's instance key, where the finding is about one unit. */
    key?: string;
    /** One sentence, ready to show. */
    message: string;
}
/** @experimental */
export type SizeFindings = Record<Breakpoint, LayoutFinding[]>;
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
export declare function checkSizes(doc: LayoutDoc, decls?: LayoutDecls): SizeFindings;
/**
 * Every op returns this. `doc` is the INPUT BY REFERENCE when nothing changed —
 * which is what lets a store skip a repaint and a test assert "this gesture did
 * nothing" without comparing trees. `refused` is one sentence, and when it is
 * set `doc` is always the input.
 * @experimental
 */
export interface LayoutOpResult {
    doc: LayoutDoc;
    refused?: string;
}
/**
 * Where an edit lands. `'base'` is the document every size inherits; a
 * breakpoint is that size's variant.
 *
 * ⚠ Only **position** edits honour a breakpoint target. Membership — adding,
 * removing, pinning, grouping, looks — is size-neutral and always writes the
 * base *and* every variant that shadows the zone, because a person who adds
 * Stats on the train expects Stats on the desk (§5.5).
 * @experimental
 */
export type OpTarget = 'base' | Breakpoint;
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
export declare function tidyZone(zone: Zone): void;
/** @experimental */
export interface PlaceArgs {
    widget: string;
    /** Defaults to the widget id; pass one to place a second copy. */
    key?: string;
    /** Defaults to the declaration's `placement.zone`, else `right`. */
    zone?: ZoneId;
    /** A one-column list index for the variant, when `target` is a size. */
    at?: number;
    target: OpTarget;
}
/** @experimental */
export interface RemoveArgs {
    key: string;
    target: OpTarget;
}
/** @experimental */
export interface MoveArgs {
    key: string;
    zone?: ZoneId;
    row: number;
    col: number;
    target: OpTarget;
}
/** @experimental */
export interface SetPinnedArgs {
    /** A unit's pin. Omit with `zone` to pin the side itself. */
    key?: string;
    zone?: ZoneId;
    pinned: boolean;
    target: OpTarget;
}
/** @experimental */
export interface TrackArgs {
    zone: ZoneId;
    axis: 'row' | 'col';
    index: number;
    target: OpTarget;
}
/**
 * The pure operations the editor and the CLI both dispatch.
 *
 * Every one of them: takes the document first, returns `{ doc, refused? }`,
 * returns the input **by reference** when it changes nothing, and refuses
 * rather than storing a document `validateLayoutDoc` would reject.
 * @experimental
 */
export declare const layoutOps: {
    /**
     * Add a widget. **Membership, so it lands on the base** — and in every
     * variant that shadows the zone, or the size that customized it would never
     * see the new widget (§5.5). With a size target and an explicit `at`, that
     * size's list position is the variant's own.
     */
    place(doc: LayoutDoc, args: PlaceArgs, decls?: LayoutDecls): LayoutOpResult;
    /** Remove a unit. Membership: the base and every variant lose it. */
    remove(doc: LayoutDoc, args: RemoveArgs, decls?: LayoutDecls): LayoutOpResult;
    /** Move a unit to a grid line. **Position, so a size target writes its variant.** */
    moveToLine(doc: LayoutDoc, args: MoveArgs, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Put a unit into another's row, the two sharing its columns.
     *
     * The column axis is **materialised** first, so both sides come out reading
     * as "n of twelve" rather than as two anonymous `1fr`s. A host that already
     * spans two or more tracks simply gives half of them away; a host on ONE
     * track has that track split in two, each half carrying half its share, and
     * every unit that covered the line widens by a track so nothing else moves.
     */
    joinRow(doc: LayoutDoc, args: {
        key: string;
        ontoKey: string;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Give a unit a row of its own, directly under the one it was in. */
    splitRow(doc: LayoutDoc, args: {
        key: string;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Change how many tracks a unit spans on one axis.
     *
     * Materialises that axis first, for the same reason `joinRow` does: a span
     * whose result a person is meant to read as "8 of 12" needs every grow
     * track beside it to carry a share.
     */
    setSpan(doc: LayoutDoc, args: {
        key: string;
        axis: 'row' | 'col';
        span: number;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Retune one track. **Position, so a size target writes its variant.** */
    setTrackExtent(doc: LayoutDoc, args: TrackArgs & {
        extent: Extent;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Add a track, pushing everything after it along. */
    addTrack(doc: LayoutDoc, args: {
        zone: ZoneId;
        axis: 'row' | 'col';
        at?: number;
        extent?: Extent;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Remove a track; a unit that lived only there refuses the whole edit. */
    removeTrack(doc: LayoutDoc, args: TrackArgs, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Pin or unpin a unit, or a side zone itself. **Membership**: the base and
     * every variant, so a pin made on a phone is the same pin on the desk.
     */
    setPinned(doc: LayoutDoc, args: SetPinnedArgs, decls?: LayoutDecls): LayoutOpResult;
    /** Merge widget units into one tab group. Membership: base and variants. */
    group(doc: LayoutDoc, args: {
        keys: string[];
        key?: string;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Break a tab group back into its widgets, stacked in its rows. */
    ungroup(doc: LayoutDoc, args: {
        key: string;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Reorder a group's tabs. Membership order, so it lands everywhere. */
    reorderMembers(doc: LayoutDoc, args: {
        key: string;
        order: string[];
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Set one look. **An option, so it lands on the base** — and on every
     * variant zone that shadows the one being styled.
     */
    setLook(doc: LayoutDoc, args: {
        scope: 'root' | 'zone' | 'unit';
        zone?: ZoneId;
        key?: string;
        look: string;
        value: unknown;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Drop what a move left behind: empty rows, a narrowed unit now alone in
     * its row, a column split nobody is using. Every op that moves or removes a
     * unit runs it already; this is the door for an editor that has just
     * rearranged a zone some other way.
     */
    tidy(doc: LayoutDoc, args: {
        zone: ZoneId;
        target: OpTarget;
    }, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Make a size its own: copy the zones it currently inherits into its
     * variant. Idempotent — a size already customized comes back by reference.
     */
    customizeVariant(doc: LayoutDoc, args: {
        breakpoint: Breakpoint;
    }, decls?: LayoutDecls): LayoutOpResult;
    /** Return a size to inherited. Absent already: the input, by reference. */
    resetVariant(doc: LayoutDoc, args: {
        breakpoint: Breakpoint;
    }, decls?: LayoutDecls): LayoutOpResult;
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
    reorderFolded(doc: LayoutDoc, args: {
        zone: ZoneId;
        order: string[];
        target: Breakpoint;
    }, decls?: LayoutDecls): LayoutOpResult;
    /**
     * Apply one size's folded order to the base, so every size sees it.
     *
     * Succeeds **iff** every zone the order touches is already one column wide
     * at the base: that is the only promotion which cannot damage a desktop
     * layout, because it changes no columns. Otherwise it refuses with a
     * sentence naming the size and the units that sit side by side there.
     */
    promoteOrder(doc: LayoutDoc, args: {
        breakpoint: Breakpoint;
    }, decls?: LayoutDecls): LayoutOpResult;
};
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
export declare const RETIRED_WIDGET_IDS: ReadonlySet<string>;
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
export declare function fromLegacy(blob: unknown): LayoutPreset | null;
//# sourceMappingURL=layout.d.ts.map