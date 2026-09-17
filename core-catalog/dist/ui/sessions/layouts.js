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
/**
 * Adventure: the world above the conversation, the party down the right, the
 * lore within reach on the left.
 *
 * **Middle.** `world-state` is a strip above the messages — where you are, what
 * time it is, what the sky is doing — because it is the one piece of state that
 * is about the scene rather than about a person, and it belongs where the scene
 * is. `messages` — the log and the field you write into, one widget — fills
 * everything under it, anchored to all four edges. It is `required`, which is
 * the conversation's anchor guarantee: it can be moved and never removed.
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
export const ADVENTURE_LAYOUT = {
    zoneLayout: {
        version: 1,
        zones: {
            left: { kind: "side", side: "left", pinned: false, widgets: [] },
            right: {
                kind: "side",
                side: "right",
                pinned: true,
                widgets: ["scene-portraits", "stats", "inventory"]
            }
        }
    },
    widgetGrid: {
        version: 1,
        cell: 44,
        widgets: [
            {
                id: "world-state",
                zone: "middle",
                order: 0,
                size: { w: "grow", h: "fixed" },
                anchor: { top: true, left: true, right: true }
            },
            {
                id: "messages",
                zone: "middle",
                order: 1,
                size: { w: "grow", h: "grow" },
                anchor: {
                    top: true,
                    bottom: true,
                    left: true,
                    right: true
                },
                required: true
            }
        ]
    },
    /**
     * Per-widget settings the layout pins. Merged under the user's own stored
     * settings, so a person who turns the bars off keeps them off.
     *
     * `source: "scene"` is the half that makes the docked portraits mean
     * anything on a fresh session: pinning is a gesture nobody has made yet, and
     * an adventure's portrait rail is about who is in the scene rather than
     * about two images somebody chose.
     */
    widgetSettings: {
        "scene-portraits": { source: "scene", bars: true }
    },
    /**
     * The right column, ARRANGED — which is what makes it open on the first
     * paint rather than a strip of icons the player has to click.
     *
     * A side is drawn from its arrangement when it has one, and a group in an
     * arrangement is expanded by default exactly when it is PINNED: `pinned` is
     * a field on these items and absent means pinned (`unitPinned` in
     * `sessionLayout/arrangedGeometry`), so three items with no `pinned` field
     * is three panels open, in this order, with nothing transient deciding it.
     * A side with NO arrangement falls back to the width ladder instead, and
     * that is what shipped: the three widgets were listed in the zone and their
     * docked-or-icons state was left to whatever the session box happened to
     * measure.
     *
     * One column and twelve rows because a rail is one column; the three
     * heights are the share each panel takes of it, and `seedPositions` clamps
     * the whole thing to however many whole cells the window actually gives the
     * column.
     */
    arrangedGrid: {
        right: {
            cols: 1,
            rows: 12,
            items: [
                { id: "scene-portraits", x: 0, y: 0, w: 1, h: 4 },
                { id: "stats", x: 0, y: 4, w: 1, h: 4 },
                { id: "inventory", x: 0, y: 8, w: 1, h: 4 }
            ]
        }
    }
};
/**
 * The genres that ship a layout of their own. A genre absent from this list
 * gets the empty default, which is the app's built-in arrangement.
 */
export const CORE_LAYOUT_PRESETS = [
    {
        genreId: "core:genre/adventure",
        name: "Adventure",
        layout: ADVENTURE_LAYOUT
    }
];
/** The shipped layout for a genre, or undefined when it ships none. */
export const coreLayoutPreset = (genreId) => CORE_LAYOUT_PRESETS.find((l) => l.genreId === genreId);
//# sourceMappingURL=layouts.js.map