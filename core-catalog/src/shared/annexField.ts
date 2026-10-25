/**
 * Core's one pipeline for every **annex field** (2026-09-26): a widget's
 * `invoke(annexFieldAction(owner, key), { payload: { value } })` runs this,
 * whichever package declared the field.
 *
 * It contributes no action. The host lists one action per declared field
 * (`<owner>:annex#<key>`), judges each press at its door — who may set it,
 * the plugin switch, the shape — and only then runs this spec with
 * `{ field, value }` on the inlet's `payload`. The outlet reads the
 * declaration again and writes through the annex write every
 * `set-session-annex` goes through.
 *
 * No lock, no genre (ruled 2026-10-05), like the built-in writes: it serves
 * an annex field of any genre — the Lair's Castellan scratchpad as much as a
 * Chat plugin's — and nothing binds it; the host runs it by id.
 * @experimental
 */
import { ANNEX_FIELD_SPEC_ID, annexField, compile, declareAnnex, spec, type AnnexFieldDecl } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_CASTELLAN_KEY, dungeonCrawlerGenre, lairGenre, storyGenre } from '../registry/genres.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as DC, DUNGEON_CRAWLER_PLANNER_KEY } from '../genres/dungeon-crawler/names.js'

/** @experimental */
export const SET_ANNEX_FIELD_SPEC_ID = ANNEX_FIELD_SPEC_ID
/** @internal */
export const SET_ANNEX_FIELD_VERSION = '1.0.0'

/**
 * The Lair Castellan's scratchpad, as an annex key under `core` (lair re-plan
 * R13): see `CORE_ANNEX_FIELDS`. @experimental
 */
export const CASTELLAN_SCRATCHPAD_KEY = 'castellan-scratchpad'

/** @experimental */
export const setAnnexFieldSpec = () =>
	compile(
		spec(SET_ANNEX_FIELD_SPEC_ID, {
			version: SET_ANNEX_FIELD_VERSION,
			taxonomy: { role: 'action' },
		})
			.inlet('input', C.userMessage.v1())
			.outlet('write', ($) => C.setAnnexField.v1({ payload: $.input.payload }))
			.build(),
	)

/**
 * 🚧 Dungeon Crawler's annex keys (PLAN-dungeon-crawler-2026-10-14, ★A,
 * ★D, verification 1, the reveal revision). Its sessions alone carry them.
 * Nobody presses any of them: the genre's pipelines write each one.
 *
 * ⚠ **Maps.** The field language has no free-form map — an `object` declares
 * fixed members and `checkValues` passes members it does not declare — so
 * the maps (the ⏳ retired `lanes`, keyed `user:<id>`) and the crawl's
 * bookkeeping declare the members a reader relies on and let the rest
 * through. The hand-marked round (`dungeon-crawler-round`) is retired (AUDIT
 * B): the round is read off the rows. The world itself
 * left the annex on 2026-10-16 (PLAN-rulesets §26): places, people and the
 * fallen are entries of the session's own lorebook.
 * @internal
 */
const DUNGEON_CRAWLER_ANNEX_FIELDS: readonly AnnexFieldDecl[] = [
	annexField({
		key: DC.progress,
		shape: {
			type: 'object',
			fields: {
				shape: { type: 'string', description: "The interview's first answer: 'dungeon' or 'open-world'." },
				goal: { type: 'text', description: 'What the adventure is for. Secret or not, it is written here. Whether it is secret is the world\'s goal-mode slot.' },
				settled: { type: 'boolean', description: "The owner has answered the world's questions: the first finished sheet builds the world." },
				building: { type: 'number', description: 'When genesis started (epoch milliseconds): no second build while one runs.' },
				built: { type: 'boolean', description: 'Genesis has built the world: its places are in the session\'s own lorebook.' },
				ended: { type: 'boolean', description: 'The owner ended the adventure: every later turn is an epilogue.' },
				heroes: {
					type: 'object',
					description: "Each player's character as the interview made it, keyed 'user:<id>': name, class, backstory.",
					fields: {
						// The map's keys are `user:<id>`; this member stands for every one of them.
						'user:<id>': {
							type: 'object',
							fields: {
								name: { type: 'string' },
								class: { type: 'string' },
								backstory: { type: 'text' },
							},
						},
					},
				},
				fates: {
					type: 'object',
					description: "Who is out of the round, by seat reference: 'dead' or 'taken-out'. A mirror of each seat's fate, for the round script.",
					fields: {
						// The map's keys are seat references; this member stands for every one of them.
						'<seat>': { type: 'string' },
					},
				},
				arrivals: {
					type: 'list',
					description: 'Newcomers owed to the story after a death, each with the rounds left to bring them in.',
					item: { type: 'object', fields: { who: { type: 'string' }, fallen: { type: 'string' }, where: { type: 'string' } } },
				},
				lastTelling: {
					type: 'object',
					description: "The last story turn's row, brief and outcomes — what a swipe of that row tells again, with nothing re-rolled.",
					fields: { row: { type: 'number' }, brief: { type: 'text' }, outcomes: { type: 'text' } },
				},
			},
		},
		see: [],
		genre: dungeonCrawlerGenre,
		label: { en: 'Crawl' },
		description: {
			en: "The crawl's bookkeeping: the heroes, the goal and where it stands, who is out, who is owed. The world itself — places, people, the fallen — is the session's own lorebook. Only the pipelines read it.",
		},
	}),
	annexField({
		key: DC.legacyWorld,
		shape: {
			type: 'object',
			fields: {
				shape: { type: 'string' },
				goal: { type: 'text' },
			},
		},
		see: [],
		genre: dungeonCrawlerGenre,
		label: { en: 'World (older sessions)' },
		description: {
			en: "⏳ The world document sessions made before 2026-10-16 kept. Read for an older session's heroes and goal only; never written. Its places and people are not carried over.",
		},
	}),
	annexField({
		key: DC.lanes,
		shape: {
			type: 'object',
			fields: {
				// The map's keys are `user:<id>`; this member stands for every one of them.
				'user:<id>': { type: 'string', description: "One per person: their Planner lane, 'parley:<n>'." },
			},
		},
		see: ['participant'],
		genre: dungeonCrawlerGenre,
		label: { en: 'Planner lanes' },
		description: {
			en: "⏳ Retired 2026-10-17: which Planner lane was whose, keyed user:<id>. Core keeps each person's lane now and sends it to them and the owner alone; nothing writes this.",
		},
	}),
	annexField({
		key: DC.planningNotes,
		shape: { type: 'text', default: '' },
		see: [`envoy:${DUNGEON_CRAWLER_PLANNER_KEY}`],
		genre: dungeonCrawlerGenre,
		label: { en: 'Planning notes' },
		description: {
			en: "The Planner's secret notes: what is really going on, what is hidden where, what the world will do next.",
		},
	}),
	annexField({
		key: DC.planningNotesRevealed,
		shape: { type: 'text', default: '' },
		see: ['participant'],
		genre: dungeonCrawlerGenre,
		label: { en: 'Planning notes' },
		description: {
			en: "The Planner's notes, once the session's owner has asked for them to be revealed. One-way: they stay readable.",
		},
	}),
	annexField({
		key: DC.journal,
		shape: {
			type: 'object',
			fields: {
				goal: { type: 'text', description: "The goal as the party knows it, or 'secret'." },
				leads: { type: 'list', item: { type: 'string' }, description: 'Open leads, one per line.' },
			},
		},
		see: ['participant'],
		genre: dungeonCrawlerGenre,
		label: { en: 'Journal' },
		description: { en: "The party's goal and open leads. The log is the Journal channel." },
	}),
]

/**
 * 🚧 The Story genre's running note of its characters' goals (2026-10-19):
 * written by the sweep's *Track goals* task (`genres/story/reckon.ts`) into
 * `annex.core['story-goals']`.
 * @experimental
 */
export const STORY_GOALS_KEY = 'story-goals'

/**
 * Core's **annex declaration** (owner ruling 2026-09-26): every key core
 * keeps in its own annex document (`annex.core`), declared once with its
 * shape and who may see it — the same declaration a package makes on
 * `defineExtension({ annexFields })`. A core genre's own keys are declared
 * here too, scoped with the field's `genre` option; `GenreDecl` does not
 * carry them.
 *
 * Two fields:
 *
 * - **`retake-quietly`** (owner ruling 2026-09-28, lair pass R2): the
 *   session owner's "Don't ask again for this session" on Regenerate the last
 *   turn (`core#retake`). It is a person's preference about one session, set
 *   by the person through the ready-made action (`core:annex#retake-quietly`),
 *   so it is the annex's by the ruling — not a column, and not a genre field,
 *   because retake is core and no genre owns it (no `genre` scope for the same
 *   reason).
 * - **`castellan-scratchpad`** (owner QB answer 2026-09-28, lair re-plan
 *   R13): the Lair Castellan's running notes — rooms it has planned with the
 *   Dungeon Master, intentions, corrections. The one key a core **pipeline**
 *   writes: the `lair-scratchpad` routine rewrites it after each of the
 *   Castellan's Sanctum replies (rewrite, 2026-10-21; was `lair-respond`'s). Its audience is the Castellan and the
 *   session owner (`see: ['envoy:castellan', 'owner']`, ruled 2026-10-11 so
 *   the Annex widget can place it beside the story): the owner's view carries
 *   it, no other person's does, and it reaches no prompt but the Castellan's
 *   own — never a delver's (earshot by the audience model: the AI view holds
 *   `ai`, `participant` and its speaker, never `owner`, so the owner entry
 *   changes nothing a model hears). The owner may set it by hand
 *   (`act: ['owner']`, the Session data panel or the Annex widget), and the
 *   Lair's sessions alone carry it (`genre`).
 *
 * Every other core pipeline keeps its state in core's own columns
 * (the stored turn order — annex owner `core` — written by `set-turn-order`; each member's
 * composer text in `sessions.drafts`, written by the socket door).
 * `coreCatalog.test.ts` walks every core spec for a `set-session-annex` step
 * and holds each to this list, so a core writer added without its
 * declaration fails there before it ships.
 * @experimental
 */
export const CORE_ANNEX_FIELDS: readonly AnnexFieldDecl[] = Object.freeze([
	annexField({
		key: 'retake-quietly',
		shape: { type: 'boolean', default: false },
		see: ['owner'],
		act: ['owner'],
		label: { en: "Don't ask before regenerating a turn" },
		description: {
			en: 'Regenerate the last turn without the confirmation, for this session only.',
		},
	}),
	annexField({
		key: CASTELLAN_SCRATCHPAD_KEY,
		shape: { type: 'text', default: '' },
		see: [`envoy:${LAIR_CASTELLAN_KEY}`, 'owner'],
		act: ['owner'],
		genre: lairGenre,
		label: { en: "Castellan's scratchpad" },
		description: {
			en: "The Castellan's running notes from the Sanctum: rooms planned, intentions, corrections. It rewrites them after each reply there, and reads them when it plans a turn while Sanctum talk steers the story. The party never read them.",
		},
	}),
	annexField({
		key: STORY_GOALS_KEY,
		shape: { type: 'text', default: '' },
		see: ['owner'],
		act: ['owner'],
		genre: storyGenre,
		label: { en: 'Goals' },
		description: {
			en: "What the characters are after and how close they are, kept every few turns while Track goals is on. Yours to edit.",
		},
	}),
	...DUNGEON_CRAWLER_ANNEX_FIELDS,
])

// Registered on import, as core's events and definitions are: `validate()`
// then judges a core spec's annex writes against it.
declareAnnex('core', CORE_ANNEX_FIELDS)
