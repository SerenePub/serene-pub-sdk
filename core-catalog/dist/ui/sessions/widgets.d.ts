/**
 * Core's built-in session widgets (PLAN 25) — part of the announcement (24 §9),
 * the same as the genres, pipelines and hooks core ships. SP boot-seeds each
 * widget's style presets from `CORE_WIDGETS` (create-if-absent by seedKey, the
 * standing rule), and the app's native-surface registry maps a widget's
 * `surface.component` key to a real Svelte component separately.
 *
 * A "widget" is a session-surface component — the messages log, the composer, a
 * portrait panel, a plugin frame. Native and frame widgets share ONE declaration
 * (this) and ONE data contract; the only difference is the iframe. `WidgetDecl`
 * is the superset of the SDK's `PanelDecl`: `id`/`title` already satisfy the
 * stable-slug + display-title a widget must announce, so this adds only the
 * authoring metadata — cell bounds, requested data scopes, plugin dependencies,
 * and the built-in style presets it ships.
 */
import type { PanelDecl, SettingsSchema } from '@serene-pub/sdk';
/** Data a widget requests access to (grant-gated, host-enforced at projection). */
export type WidgetScope = 'persona' | 'characters' | 'lore' | 'session:full' | `channel:${string}`;
/** An external plugin dependency; the CLI captures pkg/range from the imports. */
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
 * widget container (native) or frame document (frame); `vars` overrides design
 * tokens (CSS custom properties).
 */
export interface WidgetStylePreset {
    /** Stable per-widget key — the seed identity within this widget's styles. */
    slug: string;
    title: string;
    css: string;
    vars?: Record<string, string>;
}
/**
 * A widget declaration. Core widgets declare it here; plugin widgets declare the
 * identical shape and the CLI captures `dependencies` from the import graph.
 * Runtime never branches on which — it reads the decl.
 */
export interface WidgetDecl extends PanelDecl {
    /**
     * Optional cell-based size bounds (the widgetGrid cell module), in cells.
     * These sit alongside `layout.span` (track-based) — cells are the physical
     * floor/ceiling, span is the responsive preference.
     */
    cells?: {
        minW?: number;
        maxW?: number;
        minH?: number;
        maxH?: number;
    };
    /** Data the widget requests; each entry is a grant an admin can deny. */
    scopes?: WidgetScope[];
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
}
/**
 * The globally-unique, reseed-stable slug for a widget's built-in style. This is
 * both the system row's `slug` (the layout's reference target) and its seed
 * identity — the reconciler upserts and prunes system rows by matching on it,
 * NEVER on a numeric id (the codified seed rule).
 *
 * Widget ids and preset slugs are simple kebab tokens (no `:`), so the join is
 * unambiguous.
 */
export declare function systemStyleSlug(widgetId: string, presetSlug: string): string;
/**
 * The built-in session widgets. Pure data — no component imports — so the
 * server-side style reconciler reads it at boot without pulling the client
 * bundle; the client maps each `surface.component` key to a Svelte component.
 */
export declare const CORE_WIDGETS: WidgetDecl[];
//# sourceMappingURL=widgets.d.ts.map