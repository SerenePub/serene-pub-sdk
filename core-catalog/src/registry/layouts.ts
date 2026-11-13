/**
 * The session layouts core's genres ship (PLAN 25) — each genre declares its
 * own in `genres.ts` (`layouts: [layout({ slug: 'default', … })]`), which is
 * how they reach the announcement and the instance's reconciler; this file
 * holds the **session layouts** (`SessionLayoutV1`) those declarations name.
 *
 * Every genre ships one (★5, owner 2026-11-05, "each genre needs its own
 * twist on what's used and how busy the screen is", R6): the Guide a bare
 * conversation, Story the common layout (R5), the Lair and the Dungeon
 * Crawler their own twists on it. Story's **World** layout stays (D15: no
 * shipped layout is deleted without the owner).
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
 * ## The arrangement is `panels`, version 2
 *
 * Three zones — `left`, `middle`, `right` — of panels, each a box holding
 * widget instances as tabs (`PanelLayoutV2`). There is no pin and no rail:
 * every panel is open. The middle is never empty. A panel's height and
 * priority are its open tab's `WidgetDecl.panel` unless the panel says
 * otherwise, so these literals state `height: "fit"` only for the portrait
 * panels and the World strip. Keys run `p1…pn` in order middle, left, right.
 * No look keys but the Visual novel's: the defaults apply.
 *
 * ## Conversation = Messages, Turn line, Composer
 *
 * The log, the turn line and the field you write into are three widgets
 * (R8). A Composer writes to the Messages copy shown in its own zone; a zone
 * with Messages and no Composer is a reading pane. So each middle here is
 * three panels: Messages, Turn line, Composer.
 *
 * ⏳ The older slots — `zoneLayout`, `widgetGrid`, `arrangedGrid` and
 * version-1 `panels` — are gone from these literals. A stored layout or a
 * plugin manifest may still carry them; readers convert them when `panels` is
 * not version 2. They are dropped at the 0.7 squash. `widgetSettings` and
 * `widgetStyles` are not arrangement and stay.
 */
import type { SessionLayoutV1 } from '@serene-pub/sdk'

/**
 * The **Guide**'s layout (★5): Messages and Composer, the Turn line beside
 * them — nothing else; the Guide is one person's questions about the app.
 * @internal
 */
export const GUIDE_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [],
		middle: [
			{ key: "p1", tabs: ["messages"] },
			{ key: "p2", tabs: ["turn-line"] },
			{ key: "p3", tabs: ["composer"] }
		],
		right: []
	}
}

/**
 * Story's default — the **common layout** (R5, ★5; D15 for the rest): the
 * middle holds the story and, as a second tab, the characters
 * (an rpg-style management screen); the left is compact data for each
 * character — the cast's stats, with the scenario as its second tab — and,
 * at its foot, the latest **character** that spoke; the right is the world
 * on top with the lorebook's entries as its second tab, and the latest
 * **persona** that spoke below.
 * @internal
 */
export const STORY_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [
			{ key: "p4", tabs: ["stats", "authors-note"] },
			{ key: "p5", tabs: ["scene-portraits#character"], height: "fit" }
		],
		middle: [
			{ key: "p1", tabs: ["messages", "stats#characters"] },
			{ key: "p2", tabs: ["turn-line"] },
			{ key: "p3", tabs: ["composer"] }
		],
		right: [
			{ key: "p6", tabs: ["stats#world", "lore-entries"] },
			{ key: "p7", tabs: ["scene-portraits#persona"], height: "fit" }
		]
	},
	/**
	 * Names and what each copy of Stats shows: the cast as a list, the
	 * characters as faces, the world as a list. The two portraits follow the
	 * latest speaker of their kind (one turn back), as sprites.
	 */
	widgetSettings: {
		stats: { owners: "cast", arrangement: "list", title: "Cast" },
		"authors-note": { title: "Scenario" },
		"scene-portraits#character": {
			who: "recent",
			whoKind: "characters",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last character"
		},
		messages: { title: "Story" },
		"stats#characters": { owners: "cast", castScope: "all", arrangement: "faces", title: "Characters" },
		"stats#world": { owners: "world", arrangement: "list", title: "World" },
		"lore-entries": { title: "Lore" },
		"scene-portraits#persona": {
			who: "recent",
			whoKind: "personas",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last persona"
		}
	}
}

/**
 * Story's **World** layout — Adventure's until 2026-10-19: the world above the
 * conversation, the party down the right, the lore within reach on the left.
 * Kept and converted to version 2 (D15).
 *
 * **Middle.** The world's stats are a strip above the messages — where you
 * are, what time it is, what the sky is doing — because they are the one
 * piece of state that is about the scene rather than about a person, and they
 * belong where the scene is. It is a copy of Stats, `stats#world`, set to the
 * world as a strip and titled as World State was (PLAN-core-widgets W7: World
 * State became Stats drawn for the world; `world-state` is now an alias a
 * stored layout may still place), sized to `fit`. Under it the Messages, Turn
 * line and Composer panels.
 *
 * **Right.** Scene Portraits showing who is in the SCENE, each as their
 * sprite, with `bars: true` so each face carries its own health under it —
 * the common case needs no second widget for that. Stats below it, the
 * cast's cards. (Inventory sat under Stats until R79 removed that widget for
 * now.)
 *
 * **Left.** The Chronicle (the story's history and its clock) and Lore
 * entries (what the book has, and what was read), two open panels now that
 * the rail is gone — every session has a book (its own, the phantom
 * lorebook, when none is attached), so both always have one to read.
 *
 * Places, Turn order, Album, Actions and Who's here are left to the tray: an
 * adventure has room for them, but none is what every adventure needs on its
 * first paint.
 * @internal
 */
export const STORY_WORLD_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [
			{ key: "p5", tabs: ["chronicle"] },
			{ key: "p6", tabs: ["lore-entries"] }
		],
		middle: [
			{ key: "p1", tabs: ["stats#world"], height: "fit" },
			{ key: "p2", tabs: ["messages"] },
			{ key: "p3", tabs: ["turn-line"] },
			{ key: "p4", tabs: ["composer"] }
		],
		right: [
			{ key: "p7", tabs: ["scene-portraits"] },
			{ key: "p8", tabs: ["stats"] }
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
 * 🚧 Story's **Visual novel** layout (PLAN-visual-novel-layout §1.6, ★4): the
 * session's backdrop fills the window behind glass panels; the last two
 * speakers stand on it (Scene Portraits on the open stage, whoever did not
 * write the line shown dimmed); the Dialogue box reads the story one line at
 * a time in the bottom band, the whole log (titled Log) and the characters
 * as tabs beside it; the Turn line and the Composer under it, as in every
 * layout. The sides are empty.
 *
 * The one shipped layout with look keys (`backing`, `behind`). It pins Scene
 * Portraits' **Open stage** style by slug (`<widgetId>:<preset>`, how core's
 * style rows are seeded); a row id belongs to one install. **Read on by
 * itself** stays off (P1): a new automatic behaviour is a person's choice.
 * @internal
 */
export const STORY_VISUAL_NOVEL_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [],
		middle: [
			{ key: "p1", tabs: ["scene-portraits"] },
			{ key: "p2", tabs: ["dialogue-box", "messages", "stats#characters"], height: { share: 4 } },
			{ key: "p3", tabs: ["turn-line"] },
			{ key: "p4", tabs: ["composer"] }
		],
		right: [],
		backing: "glass",
		behind: "backdrop"
	},
	widgetSettings: {
		"scene-portraits": {
			who: "recent",
			recentTurns: 2,
			face: "sprite",
			arrangement: "stage",
			speakerFocus: true
		},
		messages: { title: "Log" },
		"stats#characters": { owners: "cast", castScope: "all", arrangement: "faces", title: "Characters" }
	},
	widgetStyles: {
		"scene-portraits": { slug: "scene-portraits:open-stage" }
	}
}

/**
 * Lair (★5): the party's Stats down the left over the last character that
 * spoke, the conversation in the middle, the dungeon down the right over the
 * last persona.
 *
 * The mirror of Story's arrangement, and the mirror is the point. In a story
 * the player asks *what shape am I in*; in a Lair the party is somebody
 * else's — a set of bars the master WATCHES rather than owns — so Stats goes
 * left, where a thing being monitored belongs, and the dungeon itself takes
 * the right.
 *
 * **The rooms, at the top of the right** (PLAN-core-widgets W4, Q4). Places as
 * a list: the dungeon's places from the lorebook, the world's location and
 * the party's picked out (`highlight: "both"`), the ways out of each under it.
 * Both settings are Places' defaults, written so a changed default never
 * moves the Lair. Its `map` view draws the same rooms as a graph of their
 * ways.
 *
 * **The Castellan's scratchpad, its second tab.** An Annex copy reading the
 * Castellan's running notes (`core.castellan-scratchpad`), which the owner may
 * see and correct (the field's `see` names `owner`). Titled with the field's
 * label, since an Annex panel's head otherwise reads "Annex".
 *
 * 🚧 **The Sanctum, a tab beside the story** (lair fix 2, owner 2026-10-22).
 * The master's side-talk with the Castellan is its own channel, and no placed
 * copy claims it, so the middle's one Messages copy shows the story and the
 * Sanctum as **channel tabs** above its log (`messages.channel-tabs`): the
 * log shows the tab chosen and the Composer writes there, with the Sanctum's
 * turn controls — Continue and Narrate; Pick and retake are off there
 * (`ChannelDecl.turnControls`). On the Sanctum tab the Composer is the
 * single-line pill (`composer.otherTabsComposer: "minimal"`); a Castellan line
 * that lands there while the story is shown puts a dot on its tab. A guest is
 * never told the owner-only Sanctum, so their story draws no tabs.
 * @internal
 */
export const LAIR_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [
			{ key: "p4", tabs: ["stats"] },
			{ key: "p5", tabs: ["scene-portraits#character"], height: "fit" }
		],
		middle: [
			{ key: "p1", tabs: ["messages"] },
			{ key: "p2", tabs: ["turn-line"] },
			{ key: "p3", tabs: ["composer"] }
		],
		right: [
			{ key: "p6", tabs: ["places", "annex#castellan"] },
			{ key: "p7", tabs: ["scene-portraits#persona"], height: "fit" }
		]
	},
	/**
	 * The Composer's setting for the Sanctum tab, the sheets' title, the room
	 * list's settings, the note's key and the two portraits.
	 */
	widgetSettings: {
		composer: { otherTabsComposer: "minimal" },
		stats: { title: "Party" },
		places: { view: "list", highlight: "both" },
		"annex#castellan": {
			key: "core.castellan-scratchpad",
			title: "Castellan's scratchpad"
		},
		"scene-portraits#character": {
			who: "recent",
			whoKind: "characters",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last character"
		},
		"scene-portraits#persona": {
			who: "recent",
			whoKind: "personas",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last persona"
		}
	}
}

/**
 * 🚧 The Lair's **party** layout (D6, 2026-10-21): a guest's view, and the
 * genre's guests' layout (`forGuests`: what a guest's first open copies) —
 * the story in the middle, the party's sheets and the last character on the
 * left, and on the right the dungeon's rooms over the **Party** panel (where
 * the Sanctum sits in the GM's) over the last persona: neither the Sanctum
 * (the GM's alone, `audience: 'owner'`) nor the Castellan's scratchpad (the
 * owner's) is here.
 *
 * The Party panel (lane L5) is two of core's widgets as its tabs, titled
 * _Party_: **Turn order** — whose turn it is and who the turn waits for (a
 * seated player's planned turn reads _Your turn_ to its player and _Waiting
 * for ‹name›_ to the others), faces on — and **Who's here** — who has the
 * session open, as which delver each plays, who is typing. A panel, not a
 * widget of its own: both widgets already say exactly this, everywhere.
 * @internal
 */
export const LAIR_PARTY_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [
			{ key: "p4", tabs: ["stats"] },
			{ key: "p5", tabs: ["scene-portraits#character"], height: "fit" }
		],
		middle: [
			{ key: "p1", tabs: ["messages"] },
			{ key: "p2", tabs: ["turn-line"] },
			{ key: "p3", tabs: ["composer"] }
		],
		right: [
			{ key: "p6", tabs: ["places"], height: { share: 5 } },
			{ key: "p7", tabs: ["turn-order", "attendance"], height: { share: 7 }, title: "Party" },
			{ key: "p8", tabs: ["scene-portraits#persona"], height: "fit" }
		]
	},
	widgetSettings: {
		places: { view: "list", highlight: "both" },
		"turn-order": { showStrategy: false },
		"scene-portraits#character": {
			who: "recent",
			whoKind: "characters",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last character"
		},
		"scene-portraits#persona": {
			who: "recent",
			whoKind: "personas",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last persona"
		}
	}
}

/**
 * 🚧 Dungeon Crawler (PLAN-dungeon-crawler-2026-10-14; ★5, 2026-11-05): the
 * Planner, the story, the planning notes and the characters as tabs of the
 * middle, the Planner first; the party and turn order on the left; the
 * journal and the table's talk on the right; the last character and the last
 * persona at the foot of each side.
 *
 * **Middle — tabs, the Planner first** (DC walkthrough 2026-10-15). A session
 * opens on the Planner's interview: until it ends the Story is empty, so the
 * first thing anyone sees must be the Planner. A layout has one arrangement
 * for every width, and on a phone the sides are hidden behind *Session
 * panels* — a Planner docked on the left left a phone on an empty Story
 * ("Send a message to start"), the interview out of sight; in a narrow side
 * its choices and composer had no room either. So the Planner lane is the
 * Messages panel's first tab: a Messages copy on `parley` that shows each
 * viewer their own lane (`channelLane: 'mine'`, which the host resolves from
 * `SessionV1.channels`; `parley` is declared `lanes: 'personal'`, so the
 * server sends each lane to its person and the session's owner alone —
 * owner ruling 2026-10-17). **Story** (the conversation, titled so by its
 * copy's `title`) is the second tab; the open tab is saved with the session's
 * layout, so once someone moves to Story it stays there. The third tab is
 * the revealed **Planning notes** (an Annex copy): empty until the owner has
 * them revealed, then readable by everyone — the tab the reveal's line on
 * Story names. 🚧 Every later rewrite of the notes writes the revealed key
 * too (AUDIT A24), so the tab never goes stale; ⏳ reading the live key
 * behind a `revealed` flag waits on an annex key whose `see` can open up. The
 * fourth is **Characters**: every sheet as the faces strip. Under the tabs,
 * the Turn line and the Composer — the Composer writes to whichever Messages
 * tab is shown and keeps the last channel on the others.
 *
 * **Left.** **Party** — every player seat's sheet, the faces strip (`owners:
 * seats`, `arrangement: faces`, 2026-10-18 — the 100-turn walk: a host could
 * not see the sheet they had just given a potion to), the viewer's own first
 * and chosen, so a guest still opens on their own; alone at the table there
 * is one sheet and no strip. Companions keep no sheet, so they are not chips.
 * It leaves out the core `abilities` and `inventory` rows that Vis Itineris's
 * features and gear replaced (`hideSlots`). **Turn order** is its second
 * tab. Then the last character that spoke.
 *
 * **Right.** The goal and the open leads — an Annex copy titled **Goal &
 * leads** (`annex#journal`) — and the **Journal**: a Messages copy pinned to
 * the `travelogue` folio (`messages#journal`), the log the story turn's books
 * keep — never the Narrator's (AUDIT E) — its rows drawn by kind (`rowKinds`:
 * the round's `did` line, then what it found, met, changed, the time it took
 * and its new leads); and **Table talk** (`messages#table`), the whole
 * `table` channel as a log. Neither has a Composer in its zone's panels —
 * nobody writes there — so the right is a reading pane. Then the last
 * persona that spoke.
 *
 * **Copy and clock** (owner ruling 2026-10-15: formats and empty-state copy
 * are widget settings, pinned here — never genre or channel fields). Story,
 * Journal and the sheets each say why they are empty in the crawl's words
 * (`emptyState`; the Planner tab keeps the widget's own); Story's change
 * lines and the sheets' clock read `Day 1, 08:30` (`timeFormat`), the crawl
 * counting days, not calendar dates.
 *
 * **Dice** (🚧 PLAN-rulesets §30, 2026-10-16): the rolls, stakes and rest
 * lines are the `table` channel's, never the Story's — Story draws them
 * inline under the Narrator's line each belongs to (`interleave: "table"`),
 * faceless. Table talk is the whole table as a log, newest last. Story still
 * draws each line inline under its anchor — an interleaved row is drawn
 * whichever copy claims its channel.
 * @internal
 */
export const DUNGEON_CRAWLER_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 2,
		left: [
			{ key: "p4", tabs: ["stats", "turn-order"] },
			{ key: "p5", tabs: ["scene-portraits#character"], height: "fit" }
		],
		middle: [
			{
				key: "p1",
				tabs: ["messages#parley", "messages", "annex#planning-notes", "stats#characters"]
			},
			{ key: "p2", tabs: ["turn-line"] },
			{ key: "p3", tabs: ["composer"] }
		],
		right: [
			{ key: "p6", tabs: ["annex#journal", "messages#journal", "messages#table"] },
			{ key: "p7", tabs: ["scene-portraits#persona"], height: "fit" }
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
			title: "Party",
			emptyState: "Your sheet appears once your character is made.",
			timeFormat: "Day {day}, {hh}:{mm}"
		},
		"stats#characters": {
			owners: "seats",
			arrangement: "faces",
			title: "Characters",
			hideSlots: ["abilities", "inventory", "itineris-skill-training"],
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
			title: "Table talk",
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
		"scene-portraits#character": {
			who: "recent",
			whoKind: "characters",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last character"
		},
		"scene-portraits#persona": {
			who: "recent",
			whoKind: "personas",
			recentTurns: 1,
			arrangement: "stage",
			face: "sprite",
			title: "Last persona"
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
