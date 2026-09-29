/**
 * Core's built-in session widgets (PLAN 25) — part of the announcement (24 §9),
 * the same as the genres, pipelines and hooks core ships. SP boot-seeds each
 * widget's style presets from `CORE_WIDGETS` (create-if-absent by seedKey, the
 * standing rule), and the app mounts each widget's `component` — core's own
 * component module, served at `/core-ui/<slug>` — remote (R79).
 *
 * A "widget" is a session-surface component — the conversation, a portrait
 * panel, a plugin frame. Component and frame widgets share ONE declaration and
 * ONE data contract; the only difference is the iframe.
 *
 * ## Where the declaration lives
 *
 * `WidgetDecl` and its parts moved into the SDK (`layout.ts`) with the layout
 * document that places them, because `placement`, `fold` and `priority` are
 * statements about the grid and a plugin declaring a widget should not have to
 * import core's catalogue to say them. They are re-exported here so every
 * existing import — the app's `$lib/shared/widgets/types` chain included —
 * keeps resolving through one module.
 */
export { systemStyleSlug, type WidgetDecl, type WidgetDependency, type WidgetScope, type WidgetStylePreset, } from '@serene-pub/sdk';
import { type ComponentDecl, type WidgetDecl } from '@serene-pub/sdk';
/**
 * The built-in session widgets. Pure data — no component imports — so the
 * server-side style reconciler reads it at boot without pulling the client
 * bundle; the client maps each `component` to a Svelte component.
 * @experimental
 */
export declare const CORE_WIDGETS: WidgetDecl[];
/**
 * Core's widgets as values (R71) — what a genre names in `omitWidgets` or a
 * layout, and what a package's clone replaces.
 * @public
 */
export declare const coreWidgets: {
    /** The log and the field you write into — the middle of every genre that keeps it. */
    readonly conversation: WidgetDecl;
    readonly scenePortraits: WidgetDecl;
    readonly loreEntries: WidgetDecl;
    readonly stats: WidgetDecl;
    readonly worldState: WidgetDecl;
};
/**
 * Core's components (C6 P1), declared through the public API as a package
 * declares its own (R26): one per core widget's `component`, its source
 * under this package's `components/`. The build compiles them into
 * `dist/components/<slug>.js` (served at `/core-ui/<slug>`) and writes each
 * one's source beside it, `dist/components/<slug>.source.json`, which an
 * admin views, clones and diffs against — a clone's `basedOn` names the
 * slug, this package's version and that file's `sourceHash`.
 * @experimental
 */
export declare const CORE_COMPONENTS: ComponentDecl[];
/**
 * Core components an admin may read but not clone (C6 Q3): `messages` runs
 * on core's trust — no invoke gate, unprefixed `#message-<id>` ids for j/k
 * — which a clone, never mounted as core, cannot have.
 * @experimental
 */
export declare const CORE_VIEW_ONLY_COMPONENTS: readonly string[];
/**
 * `dist/components/<slug>.source.json` (C6 P1): a core component's source
 * as its build read it — every file under this package's `components/` the
 * build reached, by path relative to `components/` (never outside it, never
 * into `node_modules`). A clone starts from `files`; the in-app compiler
 * builds it from `files` and `entry` as they stand.
 * @experimental
 */
export interface CoreComponentSource {
    slug: string;
    framework: ComponentDecl['framework'];
    /** One of `files`' keys. */
    entry: string;
    /** Relative path (under `components/`) → source. */
    files: Record<string, string>;
    /** `componentSourceHash(files)` (`@serene-pub/cli/component-compile`). */
    sourceHash: string;
    /** This package's version when it was built. */
    catalogVersion: string;
}
//# sourceMappingURL=widgets.d.ts.map