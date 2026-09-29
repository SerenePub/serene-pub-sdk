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
import type { LayoutPreset } from '@serene-pub/sdk';
/** One genre's shipped layout: what the seed writes into the row. @internal */
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
 * is. `messages` — the log and the field you write into, one widget — fills
 * everything under it, anchored to all four edges. It is `required`, which is
 * the conversation's anchor guarantee: it can be moved and never removed.
 *
 * **Right, docked and pinned.** Scene Portraits sourced from the SCENE rather
 * than from pinned images, with `bars: true` so each face carries its own health
 * under it — the common case needs no second widget for that. Stats below it.
 * (Inventory sat under Stats until R79 removed that widget for now.)
 *
 * **Left, unpinned.** An unpinned rail is an icon strip that pops over the
 * conversation when you click it, which is what "collapsed to the rail" means:
 * the lore is one click away and costs no width until you want it. It carries
 * no widget ids, and that absence is deliberate rather than an omission — core
 * ships no lore panel yet, and naming one would put a labelled placeholder in
 * every Adventure session until it does. The rail is declared so that the panel
 * lands collapsed on the day it exists.
 * @internal
 */
export declare const ADVENTURE_LAYOUT: Record<string, unknown>;
/**
 * Lair: the party down the left, the conversation in the middle, the dungeon
 * down the right.
 *
 * The mirror of Adventure's arrangement, and the mirror is the point. In an
 * adventure the player asks *what shape am I in*, so the party is on the right
 * where a reader's eye rests; in a Lair the party is somebody else's — a set of
 * bars the master WATCHES rather than owns — so Stats goes left, where a thing
 * being monitored belongs, and the dungeon's own state takes the right.
 *
 * ⚠ **The room list is `world-state`, and that is a stand-in.** What this genre
 * wants on the right is a list of the dungeon's location entries with the
 * party's `location` picked out — and beyond it the room graph drawn from the
 * exits, which is the first customer for the Mermaid renderer (memory
 * `project_mermaid_for_maps`). Core ships neither widget. `world-state` is the
 * closest thing that exists: it shows `location`, `floor` and `gold`, which is
 * the same question answered in one line instead of a map. **Map widget pending
 * Mermaid**; swapping it is one id in this file.
 *
 * **The Sanctum, under it** (lair re-plan S1). The master's side-talk with the
 * Castellan is its own channel, so it gets its own panel: a second copy of the
 * `messages` widget, placed under the **widget instance id**
 * `messages#sanctum` and pinned to the channel by its `channel` setting. It
 * opens on the Castellan's greeting (the channel's first row), writes on the
 * Sanctum, and draws the Sanctum's turn controls — Continue and Narrate; Pick
 * and retake are off there (`ChannelDecl.turnControls`). The middle's
 * conversation is then the story alone: a channel a placed copy claims leaves
 * the primary log and its channel strip. `minimal` because a side panel is
 * narrow and talk is short; it is the copy's own setting, so a person who
 * wants the card gets it without touching the story's composer. On a phone
 * the right side is a sheet, so the Sanctum is one of its views.
 * @internal
 */
export declare const LAIR_LAYOUT: Record<string, unknown>;
/**
 * The genres that ship a layout of their own. A genre absent from this list
 * gets the empty default, which is the app's built-in arrangement.
 */
/**
 * Writing Room: the log dressed as a page.
 *
 * ## What it does
 *
 * Two settings and one style, and each is doing real work. `composer: "writer"`
 * opens the tall prose field — a chunk of the manuscript is eight lines of
 * typing, not one. The **Novel** pack is the message skin: flowing serif prose
 * at a reading measure, no bubbles and no portraits, which is the nearest thing
 * core ships to a page. Times and scene markers are off, because a manuscript
 * has neither.
 *
 * ## What it deliberately does NOT do, and why
 *
 * The plan asked for the manuscript as a document view in the middle with the
 * conversation as a side panel. It is expressible since S1 — a second copy,
 * `messages#manuscript` with `channel: "manuscript"`, as the Lair places its
 * Sanctum — but not yet shipped: the manuscript wants a document skin (a
 * `folio` channel reads as one block of prose), not the conversation's rows.
 * Until then the two channels share one log, and the composer's channel
 * control is what moves between them.
 *
 * ## And no word-count slot
 *
 * A count would have to be written by the turn that produced the prose, and
 * nothing in core counts words. It is two declarations — a `world` integer slot
 * and a node that counts — not a line in a layout.
 * @internal
 */
export declare const WRITING_ROOM_LAYOUT: Record<string, unknown>;
/**
 * Whodunit: the suspects down the left, the interview in the middle, the case
 * down the right.
 *
 * Adventure's arrangement with its two questions swapped. In an adventure the
 * player asks *what shape am I in*, so Stats sits on the right where a reader's
 * eye rests; here the bars belong to somebody else — one suspicion score per
 * suspect, a set of readings the detective WATCHES — so Stats goes left, where
 * a thing being monitored belongs, exactly as Lair puts the party there.
 *
 * The right column is the case: World State shows where this is happening, how
 * many clues have turned up and whether the case is still open, which is the
 * whole of what a detective needs on screen between questions.
 * @internal
 */
export declare const WHODUNIT_LAYOUT: Record<string, unknown>;
/** @internal */
export declare const CORE_LAYOUT_PRESETS: CoreLayoutPreset[];
/** The shipped layout for a genre, or undefined when it ships none. @internal */
export declare const coreLayoutPreset: (genreId: string) => CoreLayoutPreset | undefined;
/**
 * Adventure, as a layout document: the world above the conversation, the party
 * down the right, the lore within reach on the left.
 *
 * **Middle**, two row tracks. `fit` then `grow`: World State is a strip as tall
 * as its content — where you are, what time it is, what the sky is doing — and
 * Messages takes everything under it. The two extents say that in the model
 * rather than in an anchor bitmap, which is the whole difference between this
 * and the arrangement it replaces.
 *
 * **Right**, docked, two `grow` rows sharing the column evenly. Scene
 * Portraits sourced from the SCENE rather than from pinned images, with
 * `bars: true` so each face carries its own health under it. Stats below it.
 * (Inventory sat under Stats until R79 removed that widget for now.)
 *
 * **Left**, unpinned and empty. An unpinned side is an icon rail that pops over
 * the conversation when you click it: the lore is one click away and costs no
 * width until you want it. It carries no widget ids, and that absence is
 * deliberate — core ships no lore widget yet, and naming one would put a
 * labelled placeholder in every Adventure session until it does. The rail is
 * declared so the widget lands collapsed on the day it exists. A zone with no
 * units resolves `hidden`, so today it costs nothing at all.
 * @internal
 */
export declare const ADVENTURE_LAYOUT_V2: LayoutPreset;
/**
 * Lair, as a layout document — the same three columns as the blob above, said
 * in the model that replaces it.
 *
 * **Left**, docked: the party's bars, watched rather than owned (see
 * `LAIR_LAYOUT`). **Middle**, one `grow` row: the conversation. **Right**,
 * docked, one `grow` row: the dungeon's own state. (Inventory sat under it
 * until R79 removed that widget for now.)
 *
 * ⚠ The right column's one unit is the **room list's stand-in** — see
 * `LAIR_LAYOUT`. Map widget pending Mermaid.
 * @internal
 */
export declare const LAIR_LAYOUT_V2: LayoutPreset;
/**
 * The Writing Room, as a layout document — one zone and one widget, which is
 * the honest shape of it until the log can be pointed at a channel (see
 * `WRITING_ROOM_LAYOUT` for why).
 *
 * The middle is a single `grow` row: the conversation, full height. Both sides
 * are declared, unpinned and empty, so the rails land collapsed on the day a
 * lore widget or a channel-scoped log exists to put in them — a zone with no
 * units resolves `hidden`, so today they cost nothing.
 *
 * The **Novel** pack is not here: a v2 document's `look` is the layout's own
 * declared variables, and a message skin is a widget style row. The legacy
 * blob beside this one carries it, which is what the app's seeder reads today.
 * @internal
 */
export declare const WRITING_ROOM_LAYOUT_V2: LayoutPreset;
/**
 * Whodunit, as a layout document — the same three columns as the blob above,
 * said in the model that replaces it.
 *
 * **Left**, docked, one `grow` row: the suspicion scores, watched rather than
 * owned (see `WHODUNIT_LAYOUT`). **Middle**, one `grow` row: the interview.
 * **Right**, docked, one `grow` row: the case — where this is, how many clues
 * have turned up, and whether it is still open.
 *
 * No `widgetSettings`: nothing here deviates from a widget's declared
 * defaults, and an empty bag would say the same thing in more words.
 * @internal
 */
export declare const WHODUNIT_LAYOUT_V2: LayoutPreset;
//# sourceMappingURL=layouts.d.ts.map