/**
 * Core's three session layouts as they shipped BEFORE PLAN-session-panels
 * (2026-10-14) — the ⏳ old slots (`zoneLayout`, `widgetGrid`,
 * `arrangedGrid`) verbatim from `core-catalog/src/registry/layouts.ts`, its
 * comments left out. Kept as fixtures: `panelsFromSlots` must convert each to
 * the `panels` literal the catalogue now ships, since a stored 0.6 layout
 * carries exactly these.
 *
 * The `V1_*` exports below are core's layouts as they shipped as `panels`
 * version 1 (until 2026-11-05, PLAN-session-layout-simplify), frozen so the
 * converters' goldens don't read the catalogue's v2 literals.
 */
import type { SessionLayoutV1 } from '../../sdk/src/index.js'

export const OLD_CHAT_LAYOUT: SessionLayoutV1 = {
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

export const OLD_ADVENTURE_LAYOUT: SessionLayoutV1 = {
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
	widgetSettings: {
		"scene-portraits": {
			who: "scene",
			face: "sprite",
			arrangement: "grid",
			bars: true
		},
		"stats#world": { owners: "world", arrangement: "strip", title: "World State" }
	},
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

export const OLD_LAIR_LAYOUT: SessionLayoutV1 = {
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
			items: [
				{ id: "places", x: 0, y: 0, w: 1, h: 4 },
				{ id: "annex#castellan", x: 0, y: 4, w: 1, h: 2 },
				{ id: "messages#sanctum", x: 0, y: 6, w: 1, h: 6 }
			]
		}
	},
	widgetSettings: {
		places: { view: "list", highlight: "both" },
		"annex#castellan": {
			key: "core.castellan-scratchpad",
			title: "Castellan's scratchpad"
		},
		"messages#sanctum": { channel: "sanctum", composer: "minimal" }
	}
}

export const V1_STORY_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 1,
		left: [],
		middle: {
			above: [],
			primary: { key: "p1", tabs: ["messages"] },
			below: []
		},
		right: [{ key: "p2", tabs: ["authors-note"], pinned: false }]
	}
}

export const V1_STORY_WORLD_LAYOUT: SessionLayoutV1 = {
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
	widgetSettings: {
		"scene-portraits": {
			who: "scene",
			face: "sprite",
			arrangement: "grid",
			bars: true
		},
		"stats#world": {
			owners: "world",
			arrangement: "strip",
			title: "World State"
		}
	}
}

export const V1_LAIR_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 1,
		left: [{ key: "p2", tabs: ["stats"] }],
		middle: {
			above: [],
			primary: { key: "p1", tabs: ["messages"] },
			below: []
		},
		right: [
			{ key: "p3", tabs: ["places"], height: { share: 3 } },
			{ key: "p4", tabs: ["annex#castellan"], height: { share: 2 } }
		]
	},
	widgetSettings: {
		messages: { otherTabsComposer: "minimal" },
		places: { view: "list", highlight: "both" },
		"annex#castellan": {
			key: "core.castellan-scratchpad",
			title: "Castellan's scratchpad"
		}
	}
}

export const V1_LAIR_PARTY_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 1,
		left: [{ key: "p2", tabs: ["stats"] }],
		middle: {
			above: [],
			primary: { key: "p1", tabs: ["messages"] },
			below: []
		},
		right: [
			{ key: "p3", tabs: ["places"], height: { share: 5 } },
			{
				key: "p4",
				tabs: ["turn-order", "attendance"],
				height: { share: 7 },
				title: "Party"
			}
		]
	},
	widgetSettings: {
		places: { view: "list", highlight: "both" },
		"turn-order": { showStrategy: false }
	}
}

export const V1_DUNGEON_CRAWLER_LAYOUT: SessionLayoutV1 = {
	panels: {
		version: 1,
		left: [],
		middle: {
			above: [],
			primary: {
				key: "p1",
				tabs: ["messages#parley", "messages", "annex#planning-notes"]
			},
			below: []
		},
		right: [
			{ key: "p2", tabs: ["stats"], height: { share: 4 } },
			{ key: "p3", tabs: ["annex#journal"], height: { share: 2 } },
			{
				key: "p4",
				tabs: ["messages#journal", "messages#table"],
				height: { share: 4 }
			}
		]
	},
	widgetSettings: {
		stats: {
			owners: "seats",
			arrangement: "faces",
			castScope: "all",
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
			interleave: "table"
		},
		"annex#journal": {
			key: "core.dungeon-crawler-journal",
			title: "Goal & leads"
		},
		"messages#journal": {
			channel: "travelogue",
			showComposer: false,
			emptyState: "Your journal fills as the story unfolds.",
			rowKinds: ["did", "found", "met", "changed", "lead"]
		},
		"messages#table": {
			channel: "table",
			title: "Dice",
			showComposer: false,
			emptyState:
				"The rolls and the table's notes show here as the story is played.",
			timeFormat: "Day {day}, {hh}:{mm}"
		},
		"messages#parley": {
			channel: "parley",
			channelLane: "mine",
			timeFormat: "Day {day}, {hh}:{mm}"
		},
		"annex#planning-notes": {
			key: "core.dungeon-crawler-planning-notes-revealed",
			title: "Planning notes"
		},
		"scene-portraits": {
			who: "scene",
			playerSeats: true,
			metPeople: true,
			bars: true,
			barsFor: "seats"
		}
	}
}
