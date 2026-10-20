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
 *
 * ## The arrangement is `panels`
 *
 * Each layout says where its widgets sit in ONE slot, `panels`
 * (PLAN-session-panels-2026-10-14): three zones — `left`, `middle`, `right` —
 * of panels, each panel a box holding widget instances as tabs. A side panel
 * is docked unless it says `pinned: false` (in the rail, an icon); its height
 * is `fill` unless it says otherwise. The middle is the `primary` panel (the
 * conversation, filling) with panels `above` and `below` it. Keys run `p1…pn`
 * in the order the converter discovers them — the primary, above, below,
 * left, right — so a layout converted from the old slots and the literal
 * here agree key for key.
 *
 * ⏳ The three older slots — `zoneLayout`, `widgetGrid`, `arrangedGrid` — are
 * gone from these literals. A stored layout or a plugin manifest may still
 * carry them; readers go through the SDK's `panelsOf`, which converts them
 * (`panelsFromSlots`) when `panels` is absent. They are dropped at the 0.7
 * squash. `widgetSettings` and `widgetStyles` are not arrangement and stay.
 */
import type { SessionLayoutV1 } from '@serene-pub/sdk'

/**
 * Story's default — the roleplay Chat's until 2026-10-19 (owner ruling
 * 2026-10-03): the conversation in the middle, and the
 * Author's note tucked in the right column — an icon in the rail, unpinned,
 * opened when wanted — so the conversation stays the page on a narrow
 * screen, where the note waits in **Session panels** without arriving open.
 * @internal
 */
export const STORY_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 1,
		left: [],
		middle: { above: [], primary: { key: "p1", tabs: ["messages"] }, below: [] },
		right: [{ key: "p2", tabs: ["authors-note"], pinned: false }]
	}
}


/**
 * Story's **World** layout — Adventure's until 2026-10-19: the world above the
 * conversation, the party down the right, the
 * lore within reach on the left.
 *
 * **Middle.** The world's stats are a strip above the messages — where you
 * are, what time it is, what the sky is doing — because they are the one
 * piece of state that is about the scene rather than about a person, and they
 * belong where the scene is. It is a copy of Stats, `stats#world`, set to the
 * world as a strip and titled as World State was (PLAN-core-widgets W7: World
 * State became Stats drawn for the world; `world-state` is now an alias a
 * stored layout may still place). `messages` — the log and the field you
 * write into, one widget — is the primary panel and fills everything under
 * it; the strip is a panel above it, sized to `fit`. Placement is free, so a person may move it to a side; a session
 * always keeps one (the primary floor).
 *
 * **Right, docked and pinned.** Scene Portraits showing who is in the SCENE,
 * each as their sprite, with `bars: true` so each face carries its own health
 * under it — the common case needs no second widget for that. Stats below it,
 * the cast's cards. (Inventory sat under Stats until R79 removed that widget
 * for now.)
 *
 * **Left, in the rail.** Both panels are `pinned: false`: an icon each in
 * the rail, popping over the conversation when you click it, which is what
 * "collapsed to the rail" means:
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
export const STORY_WORLD_LAYOUT: SessionLayoutV1 = {
	/**
	 * The right column docked — two panels with no `pinned` field, which is
	 * what makes it open on the first paint rather than a strip of icons the
	 * player has to click — Scene Portraits over Stats, sharing the column
	 * (`fill`, the absent height). The left in the rail: a side whose every
	 * panel is `pinned: false` takes a rail's width, never a column's.
	 */
	panels: {
		version: 1,
		left: [
			{ key: "p3", tabs: ["chronicle"], pinned: false },
			{ key: "p4", tabs: ["lore-entries"], pinned: false }
		],
		middle: {
			above: [{ key: "p2", tabs: ["stats#world"], height: "fit" }],
			primary: { key: "p1", tabs: ["messages"] },
			below: []
		},
		right: [
			{ key: "p5", tabs: ["scene-portraits"] },
			{ key: "p6", tabs: ["stats"] }
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
	/**
	 * Both sides docked: Stats alone on the left; on the right the rooms, the
	 * note and the talk, a panel each, top to bottom — the Sanctum its own
	 * panel, never a tab of the story's, so both conversations stay in view.
	 */
	panels: {
		version: 1,
		left: [{ key: "p2", tabs: ["stats"] }],
		middle: { above: [], primary: { key: "p1", tabs: ["messages"] }, below: [] },
		right: [
			// The old 4/2/6 row split, kept as shares: the Sanctum's talk takes the most room.
			{ key: "p3", tabs: ["places"], height: { share: 4 } },
			{ key: "p4", tabs: ["annex#castellan"], height: { share: 2 } },
			{ key: "p5", tabs: ["messages#sanctum"], height: { share: 6 } }
		]
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

/**
 * 🚧 Dungeon Crawler (PLAN-dungeon-crawler-2026-10-14): the Planner, the
 * story and the planning notes as tabs of the middle, the Planner first;
 * your character and the journal on the right.
 *
 * **Middle — tabs, the Planner first** (DC walkthrough 2026-10-15). A session
 * opens on the Planner's interview: until it ends the Story is empty, so the
 * first thing anyone sees must be the Planner. A layout has one arrangement
 * for every width, and on a phone the sides are hidden behind *Session
 * panels* — a Planner docked on the left left a phone on an empty Story
 * ("Send a message to start"), the interview out of sight; in a narrow side
 * its choices and composer had no room either. So the Planner lane is the
 * primary panel's first tab: a Messages copy on `parley` that shows each
 * viewer their own lane (`channelLane: 'mine'`, which the host resolves from
 * `SessionV1.channels`; `parley` is declared `lanes: 'personal'`, so the
 * server sends each lane to its person and the session's owner alone —
 * owner ruling 2026-10-17). **Story** (the
 * conversation, titled so by its copy's `title`) is the second tab; the open tab is saved with the session's
 * layout, so once someone moves to Story it stays there. The third tab is
 * the revealed **Planning notes** (an Annex copy): empty until the owner has
 * them revealed, then readable by everyone — the tab the reveal's line on
 * Story names. 🚧 Every later rewrite of the notes writes the revealed key
 * too (AUDIT A24), so the tab never goes stale; ⏳ reading the live key
 * behind a `revealed` flag waits on an annex key whose `see` can open up. A tab never shares the panel's height with another, so
 * opening the notes can no longer squeeze the Planner to its composer.
 *
 * **Right.** The character sheet: 🚧 every player seat's, as the **faces
 * strip** (`owners: seats`, `arrangement: faces`, 2026-10-18 — the 100-turn
 * walk: a host could not see the sheet they had just given a potion to),
 * the viewer's own first and chosen, so a guest still opens on their own;
 * alone at the table there is one sheet and no strip. Companions keep no
 * sheet, so they are not chips. It leaves out the core `abilities` and
 * `inventory` rows that Vis Itineris's features and gear replaced
 * (`hideSlots`). Under it the
 * goal and the open leads — an Annex copy titled **Goal & leads**
 * (`annex#journal`) — and the **Journal**: a Messages copy pinned to the
 * `travelogue` folio with no composer (`messages#journal`), the log the
 * story turn's books keep — never the Narrator's (AUDIT E) — its rows drawn
 * by kind (`rowKinds`: the round's `did` line, then what it found, met,
 * changed, the time it took and its new leads). Two panels, two names
 * (round 2: both read "Journal").
 *
 * **Copy and clock** (owner ruling 2026-10-15: formats and empty-state copy
 * are widget settings, pinned here — never genre or channel fields). Story,
 * Journal and the sheet each say why they are empty in the crawl's words
 * (`emptyState`; the Planner tab keeps the widget's own); Story's change
 * lines and the sheet's clock read `Day 1, 08:30` (`timeFormat`), the
 * crawl counting days, not calendar dates.
 *
 * **Dice** (🚧 PLAN-rulesets §30, 2026-10-16): the rolls, stakes and rest
 * lines are the `table` channel's, never the Story's — Story draws them
 * inline under the Narrator's line each belongs to (`interleave: "table"`),
 * faceless. 🚧 The **Dice** tab beside the Journal (`messages#table`,
 * 2026-10-18) is the whole table as a log, newest last, with no composer:
 * nobody writes there. Story still draws each line inline under its anchor
 * — an interleaved row is drawn whichever copy claims its channel.
 * @internal
 */
export const DUNGEON_CRAWLER_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 1,
		left: [],
		middle: {
			above: [],
			primary: { key: "p1", tabs: ["messages#parley", "messages", "annex#planning-notes"] },
			below: []
		},
		right: [
			{ key: "p2", tabs: ["stats"], height: { share: 4 } },
			{ key: "p3", tabs: ["annex#journal"], height: { share: 2 } },
			{ key: "p4", tabs: ["messages#journal", "messages#table"], height: { share: 4 } }
		]
	},
	widgetSettings: {
		stats: {
			owners: "seats",
			arrangement: "faces",
			castScope: "all",
			// 🚧 The trained skills too (★4, after walk #3): the derive script's
			// to read, spelled as keys; a check names its proficiency itself.
			hideSlots: ["abilities", "inventory", "itineris-skill-training"],
			title: "Character sheet",
			emptyState: "Your sheet appears once your character is made.",
			timeFormat: "Day {day}, {hh}:{mm}"
		},
		messages: {
			title: "Story",
			emptyState:
				"The Planner is getting to know you on the Planner tab — the story starts after the interview.",
			timeFormat: "Day {day}, {hh}:{mm}",
			// 🚧 The dice under the Narrator's line they decided (PLAN-rulesets
			// §30): the `table` channel's rows, drawn inline by their anchor.
			interleave: "table"
		},
		"annex#journal": { key: "core.dungeon-crawler-journal", title: "Goal & leads" },
		"messages#journal": {
			channel: "travelogue",
			showComposer: false,
			emptyState: "Your journal fills as the story unfolds.",
			// 🚧 The journal's line kinds (PLAN-sheet-widget-redesign §16):
			// `DUNGEON_CRAWLER_JOURNAL_KINDS` (`genres/dungeon-crawler/journal.ts`)
			// — all but `time`, off by default (PLAN-dc-after-walk3 R3-5, the
			// walk's #42: bare "Day 1, 08:15 → Day 1, 08:20" lines between the
			// story's own); a person ticks it back on.
			rowKinds: ["did", "found", "met", "changed", "lead"]
		},
		"messages#table": {
			channel: "table",
			title: "Dice",
			showComposer: false,
			emptyState: "The rolls and the table's notes show here as the story is played.",
			// 🚧 The crawl's clock as the Story spells it (PLAN-dc-after-walk3
			// R1-6, the walk's NEW-14: a Rest's time line here read "Year 1,
			// Mo. 1, Day 1, 09:06 → …").
			timeFormat: "Day {day}, {hh}:{mm}"
		},
		"messages#parley": {
			channel: "parley",
			channelLane: "mine",
			// …and the Planner's lane, where a new sheet's changes are filed.
			timeFormat: "Day {day}, {hh}:{mm}"
		},
		"annex#planning-notes": {
			key: "core.dungeon-crawler-planning-notes-revealed",
			title: "Planning notes"
		},
		// 🚧 Scene Portraits, for whoever adds it (PLAN-dc-after-walk2 Q3-5,
		// the walk's #29): not placed, but a crawl's scene is its heroes —
		// player seats, not cast — and the people met, never only a companion.
		"scene-portraits": {
			who: "scene",
			playerSeats: true,
			metPeople: true,
			bars: true,
			// 🚧 Only the heroes keep sheets (R3-3, the walk's NEW-13).
			barsFor: "seats"
		}
	}
}
