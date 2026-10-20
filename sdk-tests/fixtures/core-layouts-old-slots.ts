/**
 * Core's three session layouts as they shipped BEFORE PLAN-session-panels
 * (2026-10-14) — the ⏳ old slots (`zoneLayout`, `widgetGrid`,
 * `arrangedGrid`) verbatim from `core-catalog/src/registry/layouts.ts`, its
 * comments left out. Kept as fixtures: `panelsFromSlots` must convert each to
 * the `panels` literal the catalogue now ships, since a stored 0.6 layout
 * carries exactly these.
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
