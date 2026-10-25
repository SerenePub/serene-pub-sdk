/**
 * 🚧 Dungeon Crawler's **genesis** (PLAN-dungeon-crawler-2026-10-14, feature 4,
 * workflow 3–4): when the first character is made — the owner's, or anyone's
 * once the owner has settled the world's questions (AUDIT A10) — by the
 * interview or by Just play, the Planner builds the world in ONE JSON call
 * and the Narrator opens the story in ONE streamed call.
 *
 * Not a spec of its own: a chain the interview (`interview.ts`) places at the
 * end of its sheet path, so the world is built in the same press that
 * finished the character, as the plan's workflow asks. Its node keys sit
 * under that branch (`route.sheet.after.begin.*`).
 */

import { slot, ITEM } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_NARRATOR_KEY } from './names.js'
import { DUNGEON_CRAWLER_GENESIS_SCRIPT } from './scripts.js'
import { jsonPart, modelCall, on, scriptStep, textPart, type Wiring } from './calls.js'
import type { BeginOn } from './interview.js'
import { DUNGEON_CRAWLER_ENTRY_TYPES, loreWrites } from './lore.js'
import { DUNGEON_CRAWLER_SHAPE_SCRIPT } from './shape.js'

/** The Narrator, as a participant reference. @experimental */
export const NARRATOR = `envoy:${DUNGEON_CRAWLER_NARRATOR_KEY}` as const

/*
 * What the Planner answers genesis with is laid at run time over the
 * session's rules (lane G3, 2026-10-23, S4: `DUNGEON_CRAWLER_GENESIS_FRAME`,
 * `shape.ts` — its places' ways out the rules' own); ⏳
 * `DUNGEON_CRAWLER_GENESIS_SCHEMA`, spelled from Vis Itineris at build, is retired.
 */

/** What the genesis script hands its junctions (`DUNGEON_CRAWLER_GENESIS_SCRIPT`). */
interface Filed {
	readonly world: unknown
	readonly journal: unknown
	readonly notes: unknown
	readonly openingBrief: unknown
	readonly placements: unknown
	readonly places: unknown
	readonly people: unknown
	readonly startedLanes: unknown
	readonly startedLine: unknown
	readonly ways: unknown
}

/**
 * **Genesis**, at the end of the interview's sheet path
 * (`route.sheet.after.begin`):
 *
 *  1. `brief` — what the world is for (the sheet step's `genesisBrief`);
 *  2. `genesis*` — the Planner's world, one JSON call, 🚧 its grammar laid
 *     over the session's rules (`worldSchema`, `shape.ts`; Background sampling);
 *  3. `filed` — `core:script/dungeon-crawler-genesis` files it: the crawl's
 *     bookkeeping (`dungeon-crawler-progress`: the goal, where the party
 *     starts, `built`), the journal (the goal, or *secret*, and the leads),
 *     the Planner's notes (the secret goal and its notes) — one annex write
 *     (`write`); then the world itself, the places with
 *     their ways out and the people, as entries of the session's own
 *     lorebook (`lorePlaces` … `lorePeople`, `lore.ts`);
 *  4. `opening` — the Narrator's row on Story; `placed.set.*` — each player
 *     seat's `location` set to the first place, filed at that row;
 *  5. `scene*` → `save` — the Narrator's opening, one streamed call into
 *     its row, from the first place and a lead.
 * @internal
 */
export const genesisChain = (k: BeginOn, w: Wiring): BeginOn => {
	/** 🚧 The world's grammar, its ways out the session's rules' own (S4, `shape.ts`). */
	const shaped = scriptStep(
		textPart(k, w, 'brief', ($) => $.route.sheet.apply.main, 'genesisBrief', 'What the world is for'),
		w,
		'worldSchema',
		DUNGEON_CRAWLER_SHAPE_SCRIPT.seedKey,
		($) => ({ shape: null, ruleset: $.input.ruleset, want: 'genesis' }),
		"The world's grammar",
	)
	const world = modelCall(
		shaped,
		w,
		'genesis',
		{
			speaker: `envoy:planner`,
			prompt: DUNGEON_CRAWLER_PROMPT_KEYS.genesis,
			brief: ($) => $.brief.text,
			cast: ($) => $.cast.cast,
			history: ($) => $.story.messages,
			schema: ($) => $.worldSchema.main,
			briefTurn: true,
			expose: {
				status: 'Building the world',
				label: 'Build the world',
				purpose: 'Once the characters are made, the Planner generates the world: where you start, what is near, who you may meet, the goal and its secrets.',
			},
		},
	)
	const filed = scriptStep(world, w, 'filed', DUNGEON_CRAWLER_GENESIS_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		sheet: $.route.sheet.apply.main,
		json: $.genesisWrite.json,
		state: $.state.state,
	}), 'Read the generated world')
	const parts = jsonPart(
		jsonPart(
			textPart(filed, w, 'notes', ($) => $.filed.main, 'notes', "The Planner's notes"),
			w,
			'journal',
			($) => $.filed.main,
			'journal',
			'The journal',
		),
		w,
		'world',
		($) => $.filed.main,
		'world',
		"The crawl's bookkeeping",
	)
	const filedKeys = parts.outlet(
		'write',
		($) =>
			C.setSessionAnnex.v1({
				value: {
					[K.progress]: $.world.main,
					[K.journal]: $.journal.main,
					[K.planningNotes]: $.notes.text,
				} as any,
				params: slot.params(),
			}),
		{ expose: { label: 'File the goal and the notes' } },
	)
	// The world itself: its places with their ways out, and its people, in the
	// session's own lorebook (`lore.ts`) — before the opening, which opens in
	// the first place.
	const written = loreWrites(filedKeys, w, ($) => $.route.sheet.after.begin.filed.main)
	const briefed = textPart(written, w, 'openingBrief', ($) => $.filed.main, 'openingBrief', 'What the opening shows').outlet(
		'opening',
		() => C.createMessage.v1({ generating: true, channel: 'main', speaker: NARRATOR as any }),
		{ expose: { label: 'Open the first scene' } },
	)
	/**
	 * Where the party starts: each player seat's `location`, the first place
	 * — filed at the opening's row, so the opening line says where they are.
	 */
	const placed = briefed.junction('placed', { on: ($) => $.filed.main }, (j) =>
		j.when('set', { path: (v: Filed) => v.placements, truthy: true }, (s) => {
			w.params.push([on(s, 'applied'), { mode: 'apply' }])
			return jsonPart(s, w, 'changes', ($) => $.route.sheet.after.begin.filed.main, 'placements', 'Where the party starts')
				.query('resolved', ($) =>
					C.resolveStateChanges.v1({
						changes: $.changes.main,
						scope: $.input.sessionScope,
						base: $.state.version,
					}),
				)
				.task(
					'applied',
					($) =>
						C.setState.v1({
							changes: $.resolved.changes,
							scope: $.input.sessionScope,
							base: $.state.version,
							worldRow: $.route.sheet.after.begin.opening.messageId,
							params: slot.params(),
						}),
					{ expose: { label: 'Put the party in the first place' } },
				)
		}),
	)
	/**
	 * 🚧 The world's ways out, held from the start (PLAN-dc-after-walk3 R2-2,
	 * the walk's NEW-7): the places as written are read back, and every way
	 * out becomes an `exits` piece on the place it leaves — the crib names
	 * each exactly ("Gate to The Hall (open)"), and the Planner's first
	 * re-listing of a place is no change. Before, only a place the Planner
	 * listed again held its ways, and the first listing headed the round's
	 * fold as if found.
	 */
	w.params.push([on(placed, 'worldPlaces'), { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.place], withLinks: true }])
	const ways = scriptStep(
		placed.query('worldPlaces', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The places, as written' },
		}),
		w,
		'ways',
		DUNGEON_CRAWLER_GENESIS_SCRIPT.seedKey,
		($) => ({
			session: $.input.session,
			json: $.genesisWrite.json,
			places: $.worldPlaces.entries,
			state: $.state.state,
		}),
		'The ways out, as pieces',
	)
	const held = ways.junction('hold', { on: ($) => $.ways.main }, (j) =>
		j.when('ways', { path: (v: Filed) => v.ways, truthy: true }, (h) =>
			jsonPart(
				jsonPart(h, w, 'owners', ($) => $.route.sheet.after.begin.ways.main, 'ways.owners', 'Whose ways out'),
				w,
				'deltas',
				($) => $.route.sheet.after.begin.ways.main,
				'ways.deltas',
				'The ways out',
			).task(
				'apply',
				($) =>
					C.rulesetResolve.v1({
						params: slot.params(),
						scope: $.input.sessionScope,
						owners: $.owners.main,
						deltas: $.deltas.main,
						mode: 'apply',
					}),
				{ expose: { label: 'Hold the ways out' } },
			),
		),
	)
	return modelCall(held, w, 'scene', {
		speaker: NARRATOR,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.opening,
		brief: ($) => $.openingBrief.text,
		cast: ($) => $.cast.cast,
		history: ($) => $.story.messages,
		briefTurn: true,
		expose: {
			stream: true,
			status: 'The story begins',
			label: 'The opening scene',
			purpose: 'The Narrator opens the story in the first place the Planner built.',
		},
	})
		.outlet(
			'save',
			($) =>
				C.updateMessage.v1({
					target: $.opening.messageId,
					text: $.sceneWrite.text,
					reasoning: $.sceneWrite.reasoning,
				}),
			{ expose: { label: 'Fill the opening scene' } },
		)
		/**
		 * 🚧 Each made character's Planner lane hears the story has started
		 * (PLAN-dc-after-walk2 Q3-3): a table line, after the opening is in.
		 */
		.junction('started', { on: ($) => $.filed.main }, (j) =>
			j.when('told', { path: (v: Filed) => v.startedLanes, truthy: true }, (t) =>
				textPart(
					jsonPart(t, w, 'lanes', ($) => $.route.sheet.after.begin.filed.main, 'startedLanes', 'Whose lanes hear it'),
					w,
					'line',
					($) => $.route.sheet.after.begin.filed.main,
					'startedLine',
					'The story has started',
				).each('lane', { over: ($) => $.lanes.main, max: 16 }, (m) =>
					m.outlet(
						'write',
						($) =>
							C.createMessage.v1({
								text: $.route.sheet.after.begin.started.told.line.text,
								channel: $[ITEM],
								speaker: `envoy:planner` as any,
								tableLine: true,
							}),
						{ expose: { label: 'Say the story has started' } },
					),
				),
			),
		)
}
