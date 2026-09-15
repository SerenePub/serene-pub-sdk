/**
 * Shipped session layouts, per genre (PLAN 25) — part of the announcement, the
 * same as the widgets beside them.
 *
 * SP's boot seeds one default layout preset per genre, keyed
 * `layout:<genreId>:default`. For every genre but one that preset is `{}`, which
 * means "no overrides" — the app's own built-in arrangement — and the preset
 * system stays inert for anybody who never touches it. This file is where a
 * genre says otherwise.
 *
 * ## Why it is data here rather than a component decision
 *
 * The blob is stored verbatim and never interpreted by the server: the layout
 * shape belongs to the client (`$lib/client/sessionLayout/schema` and
 * `widgetGrid`), and both halves read it defensively, so a key this build does
 * not understand degrades rather than throws. Declaring it in the catalog puts
 * the genre's layout beside the genre's pipelines and prompts — the whole of
 * what "shipping a genre" means is then one package.
 *
 * ## Widgets are named by id, and a missing one is not an error
 *
 * A widget id with no native component renders as a labelled placeholder, by
 * design: uninstalling a plugin or mistyping a key strands nothing. So naming
 * `stats` here is safe whether or not this build has a Stats panel.
 */
/** One genre's shipped layout: what the seed writes into the row. */
export interface CoreLayoutPreset {
    genreId: string;
    /** The preset's display name. `Default` for the empty per-genre floor. */
    name: string;
    /** `{ zoneLayout?, widgetGrid?, arrangedGrid? }`, stored verbatim. */
    layout: Record<string, unknown>;
}
/**
 * Adventure: the world above the conversation, the party down the right, the
 * lore within reach on the left.
 *
 * **Middle.** `world-state` is a strip above the messages — where you are, what
 * time it is, what the sky is doing — because it is the one piece of state that
 * is about the scene rather than about a person, and it belongs where the scene
 * is. Messages grow into whatever is left; the composer stays pinned to the
 * bottom. Both of those are `required`, which is the chat's anchor guarantee:
 * they can be moved and never removed.
 *
 * **Right, docked and pinned.** Scene Portraits sourced from the SCENE rather
 * than from pinned images, with `bars: true` so each face carries its own health
 * under it — the common case needs no second widget for that. Stats and Inventory below it, in that order, because the question
 * "what shape am I in" comes up more often than "what am I carrying".
 *
 * **Left, unpinned.** An unpinned rail is an icon strip that pops over the
 * conversation when you click it, which is what "collapsed to the rail" means:
 * the lore is one click away and costs no width until you want it. It carries
 * no widget ids, and that absence is deliberate rather than an omission — core
 * ships no lore panel yet, and naming one would put a labelled placeholder in
 * every Adventure session until it does. The rail is declared so that the panel
 * lands collapsed on the day it exists.
 */
export declare const ADVENTURE_LAYOUT: Record<string, unknown>;
/**
 * The genres that ship a layout of their own. A genre absent from this list
 * gets the empty default, which is the app's built-in arrangement.
 */
export declare const CORE_LAYOUT_PRESETS: CoreLayoutPreset[];
/** The shipped layout for a genre, or undefined when it ships none. */
export declare const coreLayoutPreset: (genreId: string) => CoreLayoutPreset | undefined;
//# sourceMappingURL=layouts.d.ts.map