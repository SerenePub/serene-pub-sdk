/**
 * The session layouts core's genres ship (PLAN 25) — each genre declares its
 * own in `genres.ts` (`layouts: [layout({ slug: 'default', … })]`), which is
 * how they reach the announcement and the instance's reconciler; this file
 * holds the **session layouts** (`SessionLayoutV1`) those declarations name.
 *
 * A genre with none of its own (the Guide) ships nothing, and the instance
 * seeds it an empty **genre default layout**: the app's own floor
 * arrangement, the conversation in the middle.
 *
 * ## Why it is data here rather than a component decision
 *
 * A layout is stored verbatim and read defensively, so a key this build does
 * not understand degrades rather than throws. Declaring it in the catalog puts
 * the genre's layout beside the genre's pipelines and prompts — the whole of
 * what "shipping a genre" means is then one package.
 *
 * ## Widgets are named by id, and a missing one is not an error
 *
 * A widget id with no component renders as a labelled placeholder, by design:
 * uninstalling a plugin or mistyping a key strands nothing. So naming `stats`
 * here is safe whether or not this build has a Stats widget.
 */
import type { SessionLayoutV1 } from '@serene-pub/sdk';
/**
 * Chat's (owner ruling 2026-10-03): the conversation in the middle, and the
 * Author's note tucked in the right column — an icon in the rail, unpinned,
 * opened when wanted — so the conversation stays the page on a narrow
 * screen, where the note waits in **Session panels** without arriving open.
 * @internal
 */
export declare const CHAT_LAYOUT: SessionLayoutV1;
/**
 * Adventure: the world above the conversation, the party down the right, the
 * lore within reach on the left.
 *
 * **Middle.** `world-state` is a strip above the messages — where you are, what
 * time it is, what the sky is doing — because it is the one piece of state that
 * is about the scene rather than about a person, and it belongs where the scene
 * is. `messages` — the log and the field you write into, one widget — fills
 * everything under it, anchored to all four edges. Placement is free, so a
 * person may move it to a side; a session always keeps one (the primary floor).
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
export declare const ADVENTURE_LAYOUT: SessionLayoutV1;
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
export declare const LAIR_LAYOUT: SessionLayoutV1;
//# sourceMappingURL=layouts.d.ts.map