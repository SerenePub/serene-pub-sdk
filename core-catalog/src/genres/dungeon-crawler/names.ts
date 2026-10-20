/**
 * 🚧 Dungeon Crawler's names, with no imports — the genre id, its channels,
 * its envoys and its annex keys — so the registry, the annex declaration and
 * every spec can read them without an import cycle
 * (PLAN-dungeon-crawler-2026-10-14). Read them through `./index.ts`.
 */

/** @experimental */
export const DUNGEON_CRAWLER_GENRE_ID = 'core:genre/dungeon-crawler'

/* ── Channels ───────────────────────────────────────────────────────────── */

/** The story — `main`, labelled **Story**. @experimental */
export const DUNGEON_CRAWLER_STORY_CHANNEL = 'main'
/**
 * 🚧 Each player's private, out-of-character talk with the Planner, labelled
 * **Planner**: one channel lane per person — declared `lanes: 'personal'`, so
 * **core** opens each person's lane (`core:query/channel-lane@1`), files it
 * in the session's lane register and sends it to that person and the
 * session's owner alone (owner ruling 2026-10-17). Scripts read whose lane
 * is whose off the settings document's `channelLanes`.
 * @experimental
 */
export const PARLEY_CHANNEL = 'parley'
/**
 * 🚧 The journal's log, labelled **Journal**: a folio the story turn's books
 * write one line a round to — the Planner's round summary, in character —
 * and Rest its own. Not a conversation — nobody speaks there, the Narrator
 * included.
 * @experimental
 */
export const TRAVELOGUE_CHANNEL = 'travelogue'

/* ── Envoys ─────────────────────────────────────────────────────────────── */

/**
 * 🚧 The **Planner**: talks with each player in their Planner lane, and keeps
 * the books every turn out of sight — the genre's planner step, given a voice.
 * @experimental
 */
export const DUNGEON_CRAWLER_PLANNER_KEY = 'planner'
/** 🚧 The **Narrator**: tells the story on Story. The default and fallback envoy. @experimental */
export const DUNGEON_CRAWLER_NARRATOR_KEY = 'narrator'

/* ── Annex keys (under `core`) ──────────────────────────────────────────── */

/**
 * 🚧 Every key the genre keeps in `annex.core`, declared in
 * `CORE_ANNEX_FIELDS` (`shared/annexField.ts`). Kebab, genre-prefixed: an
 * annex key is one kebab token (`ANNEX_FIELD_KEY`), so no `/`.
 * @experimental
 */
export const DUNGEON_CRAWLER_ANNEX_KEYS = Object.freeze({
	/**
	 * 🚧 The crawl's own bookkeeping (2026-10-16, rulesets W3-B): the interview's
	 * heroes, the adventure's shape, the goal and where it stands, the owed
	 * arrivals, ⏳ who is out of the round (`fates`, the round script's mirror
	 * until its select point is handed the state — `roundScript.ts`), whether
	 * the world is built or being built, whether it has ended, and the last
	 * telling a swipe re-tells. Pipelines only. **Not the world**: places, people and
	 * the fallen are entries of the session's own lorebook (PLAN-rulesets
	 * §26), and stats are state rows.
	 */
	progress: 'dungeon-crawler-progress',
	/**
	 * ⏳ The world document sessions before 2026-10-16 kept (rooms, people,
	 * rounds, undo snapshots). Read only, for the bookkeeping fields of an
	 * older session (`progress` absent); never written. Its rooms and people
	 * are not read: an older session's world reads as empty.
	 */
	legacyWorld: 'dungeon-crawler-world',
	/**
	 * ⏳ Retired (owner ruling 2026-10-17, lanes by person on the server):
	 * the user → Planner lane map. Nothing writes or reads it — core keeps
	 * the lane register (`channel_lanes`), and `parley` is declared
	 * `lanes: 'personal'`. Still named only because its annex declaration
	 * (`shared/annexField.ts`, outside the genre lane) does; drop both
	 * together.
	 */
	lanes: 'dungeon-crawler-lanes',
	/**
	 * The Planner's secret notes. The Planner alone. ⏳ Stays in the annex
	 * until a lorebook entry can be heard by the Planner alone and amended
	 * by a pipeline (the reveal); then a `gm` entry.
	 */
	planningNotes: 'dungeon-crawler-planning-notes',
	/** The notes once the owner has had them revealed — one-way. Everyone. */
	planningNotesRevealed: 'dungeon-crawler-planning-notes-revealed',
	/**
	 * The journal panel's goal and open leads. Everyone. ⏳ Stays in the
	 * annex until the panel reads lorebook entries and a pipeline can retire
	 * a lead; then leads are entries.
	 */
	journal: 'dungeon-crawler-journal',
} as const)

/**
 * ⚠ What the bookkeeping must never carry over from an older session's world
 * document: the world itself (now the session's lorebook) and its undo
 * snapshots (gone: every row a turn writes is anchored to its message).
 * @internal
 */
export const DUNGEON_CRAWLER_RETIRED_WORLD_KEYS = Object.freeze([
	'rooms',
	'npcs',
	'rounds',
	'cairns',
	'fuses',
	'lastTurn',
	'turnsBefore',
	'goalProgress',
] as const)

/**
 * 🚧 What the journal's goal reads while the goal is secret (round 2: it read
 * the bare word "secret"). Genesis and a new goal write it in the goal's
 * place; the reveal writes the real goal over it. Scripts tell a secret goal
 * by the world's goal-mode slot, and by this line or the old word, never by
 * reading the sentence.
 * @experimental
 */
export const DUNGEON_CRAWLER_SECRET_GOAL_LINE = 'Kept secret by the Planner — ask in the Planner panel.'

/**
 * The most words an open lead may have — ONE number, said to the Planner in
 * its prompt and held by the plan check (`hooks`): a lead is a short hook
 * the party could follow, and a longer line is a summary of what happened.
 * @experimental
 */
export const DUNGEON_CRAWLER_LEAD_WORDS = 12

/* ── Multiplayer contracts (rounds, secrets, a split party) ─────────────── */

/**
 * 🚧 **Who has declared this round** — the one reading every lane shares
 * (feature 17): a player seat has declared when it has a visible line on
 * Story after the Story's newest reply (any row that is not a person's).
 * Narration rows (`narration: true` — a side note such as the reveal's
 * notice) neither end a round nor count in it; the Narrator's story reply is
 * a turn, so it must NOT be written as narration.
 * The turn order reads it off the rows (`roundScript.ts`, the host's
 * `selection.sentSinceReply.main`); the story turn reads the same rows (the
 * person lines after its last reply) and gives every named seat NOT among
 * their senders its `standingOrder` slot instead. Continue fires the story
 * turn directly — the owner's, or a declared player's — so it sets no flag
 * (the hand-marked `dungeon-crawler-round` annex key is retired, AUDIT B).
 * @experimental
 */
export const DUNGEON_CRAWLER_DECLARED_RULE =
	"A player seat has declared this round when it has a visible line on Story after the Story's newest reply. Narration (a side note, `narration: true`) is no reply."

/**
 * 🚧 One secret the Planner keeps for one player (feature 18): what the
 * story turn's Planner JSON carries as `secrets[]`. `seat` names whose it
 * is — the seat's reference (`player-seat:<id>`, or `character:<id>` for a
 * seat with a card), or its player (`user:<id>`); `text` is the line,
 * delivered by the Planner in that player's Planner lane (`secrets.ts`).
 * @experimental
 */
export interface DungeonCrawlerSecret {
	seat: string
	text: string
}

/**
 * 🚧 The `secrets` property for the story turn's Planner JSON schema — a
 * fragment the story lane spreads into its `properties` (and `required`).
 * @experimental
 */
export const DUNGEON_CRAWLER_SECRETS_SCHEMA = Object.freeze({
	type: 'array',
	maxItems: 8,
	items: {
		type: 'object',
		properties: { seat: { type: 'string' }, text: { type: 'string' } },
		required: ['seat', 'text'],
		additionalProperties: false,
	},
} as const)

/**
 * 🚧 **A split party** (feature 19, D3): the sentence the story turn's
 * Planner prompt carries, so one shared Story can hold characters in
 * different places and still keep each one's private knowledge private.
 * @experimental
 */
export const DUNGEON_CRAWLER_SPLIT_PARTY_RULE =
	"Characters may be in different places; narrate each. Anything one character couldn't know goes to `secrets`, addressed to that character's seat, never into the story."
