/**
 * Widgets as a package declares them, and genres as they subtract and lay
 * them out (R71, ruled 2026-09-24).
 *
 * - A **package** — a plugin, or core in `core-catalog` — declares its
 *   widgets once (`defineExtension({ widgets })`), each optionally scoped to
 *   genres by value (`widget({ genres: [myGenre] })`; absent = every genre).
 * - A **genre** withholds any package's widgets (`omitWidgets`, by value) and
 *   ships its layouts (`layouts`, the first its default).
 *
 * A session of a genre is offered every widget scoped to it or to all,
 * minus the genre's `omitWidgets`.
 *
 * **Whose a widget is** is recorded when its package declares it — core's by
 * `core-catalog`, a plugin's by `defineExtension` — so a genre that names
 * another package's widget by value names the id the page knows it by
 * (`widgetRef`): core's bare (`stats`), a plugin's under its package
 * (`acme.dice:tray`, the `pluginWidgetId` grammar).
 */
import type { WidgetDecl } from './layout.js';
import { type SessionLayoutV1 } from './sessionLayout.js';
import { type I18n } from './i18n.js';
import { type WidgetBaseSection } from './widgets.js';
/** Record whose widgets these are. Core's `core-catalog` and `defineExtension` call it; nothing else should. @internal */
export declare function ownWidgets(owner: string, widgets: readonly WidgetDecl[]): void;
/**
 * Core's widget ids, as far as core's catalogue has been loaded. A package's
 * widget may not take one: a layout names core's widgets and the package's
 * own by bare id, so the two sets never overlap.
 * @experimental
 */
export declare const coreWidgetIds: () => ReadonlySet<string>;
/** The package that declared this widget value, if one has. @experimental */
export declare const widgetOwner: (w: WidgetDecl) => string | undefined;
/** The id a page, a layout row and a genre's `omitWidgets` know this widget by. @experimental */
export declare function widgetRef(w: WidgetDecl): string;
/** A genre as a widget's `genres` names it: the genre value, or `use('<id>')` for one declared elsewhere. @experimental */
export type GenreLike = {
    readonly id: string;
};
/** @experimental */
export interface WidgetInput extends Omit<WidgetDecl, 'genres'> {
    /** The genres whose sessions offer it, by value. Absent = every genre. */
    genres?: readonly GenreLike[];
}
/**
 * The base sections a widget reads (R75): its `reads`, or every base section
 * when it declares none — what its host sends it. A host asks this rather
 * than reading `reads`, so the default lives in one place.
 *
 * Clamped, as a host must clamp what an install stored verbatim: a name that
 * is not a base section (a scoped one, junk) never comes back, and each name
 * comes back once.
 * @experimental
 */
export declare function widgetReads(w: Pick<WidgetDecl, 'reads'>): readonly WidgetBaseSection[];
/**
 * What is wrong with a widget's `reads` (R75), one sentence each, each led by
 * `at` (where it was written): a name that is not a base section is refused
 * where it is declared, rather than naming a section the widget would
 * silently never receive.
 * @experimental
 */
export declare function widgetReadsFindings(reads: unknown, at: string): string[];
/** Declare a widget — the value a package lists in `widgets` and a genre names in `omitWidgets` or a layout. @experimental */
export declare function widget(d: WidgetInput): WidgetDecl;
/**
 * A layout a genre ships (R71): a **session layout** under a slug and a name.
 * The first is the genre's default — its **genre default layout**.
 * @experimental
 */
export interface GenreLayoutDecl {
    /** Unique within the genre; `default` for the first. */
    slug: string;
    name: I18n;
    description?: I18n;
    /**
     * The session layout, with the widget settings and style pins that come
     * with it. It places widgets by the id the page knows them by —
     * `someWidget.id` for one of this package's, `coreWidgets.x.id` for core's
     * — or a copy of one (`messages#sanctum`); the packager puts a plugin's own
     * widget ids under its namespace.
     */
    preset: SessionLayoutV1;
}
/** Declare a layout a genre ships. Refused unless `validateSessionLayout` finds no error in it. @experimental */
export declare function layout(d: GenreLayoutDecl): GenreLayoutDecl;
//# sourceMappingURL=widgetDecls.d.ts.map