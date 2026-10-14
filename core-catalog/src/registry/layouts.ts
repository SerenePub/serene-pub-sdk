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
import type { SessionLayoutV1 } from '@serene-pub/sdk'

/**
 * Chat's (owner ruling 2026-10-03): the conversation in the middle, and the
 * Author's note tucked in the right column — an icon in the rail, unpinned,
 * opened when wanted — so the conversation stays the page on a narrow
 * screen, where the note waits in **Session panels** without arriving open.
 * @internal
 */
export const CHAT_LAYOUT: SessionLayoutV1 = {
	zoneLayout: {
		version: 1,
		zones: {
			left: { kind: "side", side: "left", pinned: false, widgets: [] },
			right: { kind: "side", side: "right", pinned: false, widgets: ["authors-note"] }
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
				anchor: { top: true, bottom: true, left: true, right: true }
			}
		]
	},
	arrangedGrid: {
		right: {
			cols: 1,
			rows: 12,
			items: [{ id: "authors-note", x: 0, y: 0, w: 1, h: 12, pinned: false }]
		}
	}
}


/**
 * Adventure: the world above the conversation, the party down the right, the
 * lore within reach on the left.
 *
 * **Middle.** The world's stats are a strip above the messages — where you
 * are, what time it is, what the sky is doing — because they are the one
 * piece of state that is about the scene rather than about a person, and they
 * belong where the scene is. It is a copy of Stats, `stats#world`, set to the
 * world as a strip and titled as World State was (PLAN-core-widgets W7: World
 * State became Stats drawn for the world; `world-state` is now an alias a
 * stored layout may still place). `messages` — the log and the field you
 * write into, one widget — fills everything under it, anchored to all four
 * edges. Placement is free, so a person may move it to a side; a session
 * always keeps one (the primary floor).
 *
 * **Right, docked and pinned.** Scene Portraits showing who is in the SCENE,
 * each as their sprite, with `bars: true` so each face carries its own health
 * under it — the common case needs no second widget for that. Stats below it,
 * the cast's cards. (Inventory sat under Stats until R79 removed that widget
 * for now.)
 *
 * **Left, unpinned.** An unpinned rail is an icon strip that pops over the
 * conversation when you click it, which is what "collapsed to the rail" means:
 * the lore is one click away and costs no width until you want it. It holds
 * the Chronicle (the story's history and its clock) and Lore entries (what
 * the book has, and what was read) — an adventure's lorebook is required, so
 * both always have a book to read.
 *
 * Places, Turn order, Album, Actions and Who's here are left to the tray: an
 * adventure has room for them, but none is what every adventure needs on its
 * first paint.
 * @internal
 */
export const ADVENTURE_LAYOUT: SessionLayoutV1 = {
	zoneLayout: {
		version: 1,
		zones: {
			left: {
				kind: "side",
				side: "left",
				pinned: false,
				widgets: ["chronicle", "lore-entries"]
			},
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
				id: "stats#world",
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
				}
			}
		]
	},
	/**
	 * Per-widget settings the layout brings. Copied into the session's own
	 * settings when the layout is, so a person who turns the bars off keeps
	 * them off.
	 *
	 * Scene Portraits' values are its defaults, written anyway so a changed
	 * default never moves Adventure — and because an instance with nothing
	 * stored about who it shows is read as a 0.6 pinned one by the page's
	 * one-time seed of old pinned images: `who: "scene"` is what keeps it off.
	 * The world strip's `owners` and `arrangement` are what make the copy of
	 * Stats the world's; its `title` keeps the strip's name.
	 */
	widgetSettings: {
		"scene-portraits": {
			who: "scene",
			face: "sprite",
			arrangement: "grid",
			bars: true
		},
		"stats#world": { owners: "world", arrangement: "strip", title: "World State" }
	},
	/**
	 * The right column, ARRANGED — which is what makes it open on the first
	 * paint rather than a strip of icons the player has to click.
	 *
	 * The left is NOT arranged: its zone's `pinned: false` makes it an icon
	 * strip on the width ladder, which costs no width, and the layout
	 * editor's Done keeps a side it was opened on un-arranged unless a hand
	 * moves something in it. (An arrangement whose cards are all unpinned
	 * would draw the same: a rail-only side counts a rail's width, never a
	 * column's — `sideFlowPx` in the app's `sessionLayout/sideSlot`.)
	 *
	 * A side is drawn from its arrangement when it has one, and a group in an
	 * arrangement is expanded by default exactly when it is PINNED: `pinned` is
	 * a field on these items and absent means pinned (`pinnedOf`, the SDK's
	 * one pin rule), so two items with no `pinned` field is two panels open,
	 * in this order, with nothing transient deciding it. A side with NO
	 * arrangement falls back to the width ladder instead, which leaves its
	 * docked-or-icons state to whatever the session box happens to measure.
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
}

/**
 * Lair: the party down the left, the conversation in the middle, the dungeon
 * down the right.
 *
 * The mirror of Adventure's arrangement, and the mirror is the point. In an
 * adventure the player asks *what shape am I in*, so the party is on the right
 * where a reader's eye rests; in a Lair the party is somebody else's — a set of
 * bars the master WATCHES rather than owns — so Stats goes left, where a thing
 * being monitored belongs, and the dungeon itself takes the right.
 *
 * **The rooms, at the top** (PLAN-core-widgets W4, Q4). Places as a list: the
 * dungeon's places from the lorebook, the world's location and the party's
 * picked out (`highlight: "both"`), the ways out of each under it. It
 * replaces World State, which stood in for a room list by showing
 * `location`, `floor` and `gold` in one line; those stay one tray pick away
 * (Stats, set to the world). Both settings are Places' defaults, written so a
 * changed default never moves the Lair. Its `map` view draws the same rooms
 * as a graph of their ways.
 *
 * **The Castellan's scratchpad, under it.** An Annex copy reading the
 * Castellan's running notes (`core.castellan-scratchpad`), which the owner may
 * see and correct (the field's `see` names `owner`); small, because the notes
 * are a reference and the talk is the work. Titled with the field's label,
 * since an Annex panel's head otherwise reads "Annex".
 *
 * **The Sanctum, at the bottom** (lair re-plan S1). The master's side-talk
 * with the Castellan is its own channel, so it gets its own panel: a second
 * copy of the `messages` widget, placed under the **widget instance id**
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
export const LAIR_LAYOUT: SessionLayoutV1 = {
	zoneLayout: {
		version: 1,
		zones: {
			left: { kind: "side", side: "left", pinned: true, widgets: ["stats"] },
			right: {
				kind: "side",
				side: "right",
				pinned: true,
				widgets: ["places", "annex#castellan", "messages#sanctum"]
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
				}
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
			// The rooms, a short note, and the talk taking the most.
			items: [
				{ id: "places", x: 0, y: 0, w: 1, h: 4 },
				{ id: "annex#castellan", x: 0, y: 4, w: 1, h: 2 },
				{ id: "messages#sanctum", x: 0, y: 6, w: 1, h: 6 }
			]
		}
	},
	/**
	 * The right column's settings: the room list's, the note's key, and the
	 * Sanctum copy's claim that makes it the Sanctum.
	 */
	widgetSettings: {
		places: { view: "list", highlight: "both" },
		"annex#castellan": {
			key: "core.castellan-scratchpad",
			title: "Castellan's scratchpad"
		},
		"messages#sanctum": { channel: "sanctum", composer: "minimal" }
	}
}
