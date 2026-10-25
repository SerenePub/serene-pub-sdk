/**
 * 🚧 **What the host keeps for core's genres** (RF fix 8, owner ruling
 * 2026-10-23): beside the session's rules' attributes, never among them.
 *
 * A genre brings no attributes any more; what its own pipelines keep for
 * their tools — and where a party that splits keeps its place — the host
 * keeps for its sessions, declared here beside core's annex fields
 * (`shared/annexField.ts`), each row scoped to the genres whose pipelines read
 * and write it. Stored as slot values, as before: anchored to the message
 * that wrote them, taken back with it, heard by whom the slot says.
 *
 * The world's place needs no row: the host keeps it for every genre whose
 * scenes are placed by it (`shape.scenes.place`, SDK `hostStateFor`) — Story
 * and the Lair. The story clock is the session's own (`sessions` columns).
 *
 * ⚠ Never an attribute: not on the sheet among the rules' attributes, never a
 * carry switch, never counted in fit. A package keeps its tools' state in its
 * annex fields instead.
 * @experimental
 */
import { declareHostState, type HostStateDecl } from "@serene-pub/sdk"
import {
	difficultySlot,
	directionSlot,
	fateSlot,
	crawlTimeSlot,
	goalModeSlot,
	inventorySlot,
	locationSlot,
	standingOrderSlot,
	whisperSlot
} from "./slots.js"
import { dungeonCrawlerGenre, lairGenre, storyGenre } from "./genres.js"
import { DUNGEON_CRAWLER_DYING_SLOTS, DUNGEON_CRAWLER_RULESET_SLOTS } from "../genres/dungeon-crawler/sheet.js"

/** One tool's state, kept for these genres' sessions. */
const tool = (slot: { id: string }, genres: readonly { id: string }[], owners?: HostStateDecl["owners"]): HostStateDecl =>
	Object.freeze({ slot: slot.id, role: "tool", genres, ...(owners ? { owners } : {}) })

/**
 * 🚧 Core's host state, in the order a sheet would read it:
 *
 *  · ⏳ **what someone carries** for Story and the Lair — the host's carried
 *    zone kept as the `inventory` list, on each character, the world and
 *    each place, because their reckoning hands the lorebook's items out as
 *    item lines (their supply checked); until those lines write the zone;
 *  · **the Lair's GM tools** — the standing direction (Nudge, on the world)
 *    and each delver's whisper (Whisper, heard by its holder alone);
 *  · **the Dungeon Crawler's** — each hero's place (the party may split), its
 *    time (`crawl-time`, the crawl's own clock: no lorebook calendar),
 *    standing order, fate and death saves, the table's difficulty and goal
 *    — and ⏳ its piece lists (`crawl-weapons` … `crawl-fuses`), where its
 *    scripts keep the rules' pieces until they read the session's zones.
 * @experimental
 */
export const CORE_HOST_STATE: readonly HostStateDecl[] = Object.freeze([
	Object.freeze({ slot: inventorySlot.id, role: "carried", genres: [storyGenre, lairGenre] }) as HostStateDecl,
	tool(directionSlot, [lairGenre]),
	tool(whisperSlot, [lairGenre]),
	Object.freeze({ slot: locationSlot.id, role: "place", genres: [dungeonCrawlerGenre], owners: Object.freeze(["cast"] as const) }) as HostStateDecl,
	Object.freeze({ slot: crawlTimeSlot.id, role: "time", genres: [dungeonCrawlerGenre] }) as HostStateDecl,
	tool(standingOrderSlot, [dungeonCrawlerGenre]),
	tool(fateSlot, [dungeonCrawlerGenre]),
	...DUNGEON_CRAWLER_DYING_SLOTS.map((s) => tool(s, [dungeonCrawlerGenre])),
	tool(difficultySlot, [dungeonCrawlerGenre]),
	tool(goalModeSlot, [dungeonCrawlerGenre]),
	...DUNGEON_CRAWLER_RULESET_SLOTS.map((s) => tool(s, [dungeonCrawlerGenre]))
])

// Registered on import, as core's annex declaration is.
declareHostState(CORE_HOST_STATE)
