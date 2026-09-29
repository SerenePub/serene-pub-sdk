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
export const ADVENTURE_LAYOUT = {
    zoneLayout: {
        version: 1,
        zones: {
            left: { kind: "side", side: "left", pinned: false, widgets: [] },
            right: {
                kind: "side",
                side: "right",
                pinned: true,
                widgets: ["scene-portraits", "stats"]
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
     * `sessionLayout/arrangedGeometry`), so two items with no `pinned` field
     * is two panels open, in this order, with nothing transient deciding it.
     * A side with NO arrangement falls back to the width ladder instead, and
     * that is what shipped: the widgets were listed in the zone and their
     * docked-or-icons state was left to whatever the session box happened to
     * measure.
     *
     * One column and twelve rows because a rail is one column; the two
     * heights are the share each panel takes of it, and `seedPositions` clamps
     * the whole thing to however many whole cells the window actually gives the
     * column.
     */
    arrangedGrid: {
        right: {
            cols: 1,
            rows: 12,
            items: [
                { id: "scene-portraits", x: 0, y: 0, w: 1, h: 6 },
                { id: "stats", x: 0, y: 6, w: 1, h: 6 }
            ]
        }
    }
};
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
export const LAIR_LAYOUT = {
    zoneLayout: {
        version: 1,
        zones: {
            left: { kind: "side", side: "left", pinned: true, widgets: ["stats"] },
            right: {
                kind: "side",
                side: "right",
                pinned: true,
                // Inventory sat under it until R79 removed that widget for now.
                widgets: ["world-state", "messages#sanctum"]
            }
        }
    },
    widgetGrid: {
        version: 1,
        cell: 44,
        widgets: [
            {
                id: "messages",
                zone: "middle",
                order: 0,
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
    arrangedGrid: {
        left: {
            cols: 1,
            rows: 12,
            items: [{ id: "stats", x: 0, y: 0, w: 1, h: 12 }]
        },
        right: {
            cols: 1,
            rows: 12,
            // The dungeon's state is a strip; the talk takes the rest.
            items: [
                { id: "world-state", x: 0, y: 0, w: 1, h: 2 },
                { id: "messages#sanctum", x: 0, y: 2, w: 1, h: 10 }
            ]
        }
    },
    /** The Sanctum copy's settings: the claim that makes it the Sanctum. */
    widgetSettings: {
        "messages#sanctum": { channel: "sanctum", composer: "minimal" }
    }
};
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
export const WRITING_ROOM_LAYOUT = {
    zoneLayout: {
        version: 1,
        zones: {
            left: { kind: "side", side: "left", pinned: false, widgets: [] },
            right: { kind: "side", side: "right", pinned: false, widgets: [] }
        },
        /**
         * The message pack, by the one name a shipped layout can use.
         *
         * ⚠ `layoutSettings.widgetStyles` is the durable pin and it holds a
         * `{ id, slug }` — a database row id, which a catalogue written before
         * any install exists cannot know. `styles.chat` is read as a fallback
         * on every open and never written back (`legacyPackPin`), so it is the
         * id-free way to say "Novel"; the moment a person picks a style from
         * the widget's own overlay, their real pin takes over.
         */
        styles: { chat: "novel" }
    },
    widgetGrid: {
        version: 1,
        cell: 44,
        widgets: [
            {
                id: "messages",
                zone: "middle",
                order: 0,
                size: { w: "grow", h: "grow" },
                anchor: { top: true, bottom: true, left: true, right: true },
                required: true
            }
        ]
    },
    widgetSettings: {
        messages: {
            composer: "writer",
            showTimestamps: false,
            showSceneMarkers: false
        }
    }
};
/* ── Whodunit (plans/genres §4; U4) ──────────────────────────────────────── */
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
export const WHODUNIT_LAYOUT = {
    zoneLayout: {
        version: 1,
        zones: {
            left: { kind: "side", side: "left", pinned: true, widgets: ["stats"] },
            right: {
                kind: "side",
                side: "right",
                pinned: true,
                widgets: ["world-state"]
            }
        }
    },
    widgetGrid: {
        version: 1,
        cell: 44,
        widgets: [
            {
                id: "messages",
                zone: "middle",
                order: 0,
                size: { w: "grow", h: "grow" },
                anchor: { top: true, bottom: true, left: true, right: true },
                required: true
            }
        ]
    },
    arrangedGrid: {
        left: {
            cols: 1,
            rows: 12,
            items: [{ id: "stats", x: 0, y: 0, w: 1, h: 12 }]
        },
        right: {
            cols: 1,
            rows: 12,
            items: [{ id: "world-state", x: 0, y: 0, w: 1, h: 12 }]
        }
    }
};
/** @internal */
export const CORE_LAYOUT_PRESETS = [
    {
        genreId: "core:genre/adventure",
        name: "Adventure",
        layout: ADVENTURE_LAYOUT
    },
    {
        genreId: "core:genre/lair",
        name: "Lair",
        layout: LAIR_LAYOUT
    },
    {
        genreId: "core:genre/writing-room",
        name: "Writing Room",
        layout: WRITING_ROOM_LAYOUT
    },
    {
        genreId: "core:genre/whodunit",
        name: "Whodunit",
        layout: WHODUNIT_LAYOUT
    }
];
/** The shipped layout for a genre, or undefined when it ships none. @internal */
export const coreLayoutPreset = (genreId) => CORE_LAYOUT_PRESETS.find((l) => l.genreId === genreId);
/* ── v2: the layout DOCUMENT (session layout v2, plan §6) ────────────────
 *
 * Beside the legacy blob rather than instead of it: the app's seeder still
 * reads `ADVENTURE_LAYOUT` and `CORE_LAYOUT_PRESETS` until the storage phase
 * lands, and a genre that ships two shapes for one release is cheaper than a
 * boot that seeds nothing. `fromLegacy` reads the old one; this is the one a
 * person will edit.
 */
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
export const ADVENTURE_LAYOUT_V2 = {
    layout: {
        version: 2,
        zones: {
            left: { rows: ["grow"], cols: ["grow"], units: [], pinned: false },
            middle: {
                rows: ["fit", "grow"],
                cols: ["grow"],
                units: [
                    {
                        kind: "widget",
                        key: "world-state",
                        widget: "world-state",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    },
                    {
                        kind: "widget",
                        key: "messages",
                        widget: "messages",
                        row: { start: 2, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            },
            right: {
                rows: ["grow", "grow"],
                cols: ["grow"],
                units: [
                    {
                        kind: "widget",
                        key: "scene-portraits",
                        widget: "scene-portraits",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    },
                    {
                        kind: "widget",
                        key: "stats",
                        widget: "stats",
                        row: { start: 2, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            }
        },
        /**
         * No deviations. An empty bag is the statement that this genre takes the
         * declared defaults — the cell module, the gap — rather
         * than the absence of one.
         */
        look: {}
    },
    /**
     * Per-instance settings the layout pins, keyed by INSTANCE KEY (which is the
     * widget id until somebody places a second copy). Merged under the person's
     * own stored settings, so a player who turns the bars off keeps them off.
     *
     * `source: "scene"` is the half that makes the docked portraits mean
     * anything on a fresh session: pinning is a gesture nobody has made yet, and
     * an adventure's portrait column is about who is in the scene rather than
     * about two images somebody chose.
     */
    widgetSettings: {
        "scene-portraits": { source: "scene", bars: true }
    }
};
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
export const LAIR_LAYOUT_V2 = {
    layout: {
        version: 2,
        zones: {
            left: {
                rows: ["grow"],
                cols: ["grow"],
                pinned: true,
                units: [
                    {
                        kind: "widget",
                        key: "stats",
                        widget: "stats",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            },
            middle: {
                rows: ["grow"],
                cols: ["grow"],
                units: [
                    {
                        kind: "widget",
                        key: "messages",
                        widget: "messages",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            },
            right: {
                rows: ["grow"],
                cols: ["grow"],
                units: [
                    {
                        kind: "widget",
                        key: "world-state",
                        widget: "world-state",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            }
        },
        /** No deviations — the declared defaults, as Adventure's says. */
        look: {}
    }
};
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
export const WRITING_ROOM_LAYOUT_V2 = {
    layout: {
        version: 2,
        zones: {
            left: { rows: ["grow"], cols: ["grow"], units: [], pinned: false },
            middle: {
                rows: ["grow"],
                cols: ["grow"],
                units: [
                    {
                        kind: "widget",
                        key: "messages",
                        widget: "messages",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            },
            right: { rows: ["grow"], cols: ["grow"], units: [], pinned: false }
        },
        look: {}
    },
    widgetSettings: {
        messages: {
            composer: "writer",
            showTimestamps: false,
            showSceneMarkers: false
        }
    }
};
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
export const WHODUNIT_LAYOUT_V2 = {
    layout: {
        version: 2,
        zones: {
            left: {
                rows: ["grow"],
                cols: ["grow"],
                pinned: true,
                units: [
                    {
                        kind: "widget",
                        key: "stats",
                        widget: "stats",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            },
            middle: {
                rows: ["grow"],
                cols: ["grow"],
                units: [
                    {
                        kind: "widget",
                        key: "messages",
                        widget: "messages",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            },
            right: {
                rows: ["grow"],
                cols: ["grow"],
                pinned: true,
                units: [
                    {
                        kind: "widget",
                        key: "world-state",
                        widget: "world-state",
                        row: { start: 1, span: 1 },
                        col: { start: 1, span: 1 }
                    }
                ]
            }
        },
        /** No deviations — the declared defaults, as Adventure's says. */
        look: {}
    }
};
//# sourceMappingURL=layouts.js.map