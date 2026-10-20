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

import { slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_NARRATOR_KEY } from './names.js'
import { DUNGEON_CRAWLER_GENESIS_SCRIPT } from './scripts.js'
import { at, jsonPart, modelCall, scriptStep, textPart, type Wiring } from './calls.js'
import { DUNGEON_CRAWLER_ENTRY_TYPES, DUNGEON_CRAWLER_ROOM_SCHEMA, loreWrites } from './lore.js'

/** The Narrator, as a participant reference. @experimental */
export const NARRATOR = `envoy:${DUNGEON_CRAWLER_NARRATOR_KEY}` as const

/**
 * What the Planner answers genesis with (≤600 tokens, the prompt says): the
 * goal, four to seven places (the first is where the party starts) with
 * their ways out, two to four people, two leads and its secret notes. One
 * required key per member, for the grammar-compiling families.
 * @experimental
 */
export const DUNGEON_CRAWLER_GENESIS_SCHEMA = {
	type: 'object',
	properties: {
		goal: { type: 'string' },
		// One exit model (AUDIT A12): a way out is written inside its place.
		rooms: { type: 'array', minItems: 1, maxItems: 7, items: DUNGEON_CRAWLER_ROOM_SCHEMA },
		npcs: {
			type: 'array',
			maxItems: 4,
			items: {
				type: 'object',
				properties: { name: { type: 'string' }, description: { type: 'string' } },
				required: ['name', 'description'],
				additionalProperties: false,
			},
		},
		leads: { type: 'array', maxItems: 4, items: { type: 'string' } },
		notes: { type: 'string' },
	},
	required: ['goal', 'rooms', 'npcs', 'leads', 'notes'],
	additionalProperties: false,
} as const

/** What genesis is handed by the step that placed it. @internal */
export interface GenesisTerms {
	/** What the world is for — the sheet step's `genesisBrief`, as text. */
	brief: ($: any) => unknown
	/** The sheet step's whole output, whose `world` this run already changed. */
	sheet: ($: any) => unknown
	session: ($: any) => unknown
	/** The session's state (`session-state@1`), so a placement that changes nothing is dropped. */
	state: ($: any) => unknown
	cast: ($: any) => unknown
	history: ($: any) => unknown
}

/**
 * **Genesis**, placed at `prefix`:
 *
 *  1. `genesis*` — the Planner's world, one JSON call
 *     (`DUNGEON_CRAWLER_GENESIS_SCHEMA`, Background sampling);
 *  2. `filed` — `core:script/dungeon-crawler-genesis` files it: the crawl's
 *     bookkeeping (`dungeon-crawler-progress`: the goal, where the party
 *     starts, `built`), the journal (the goal, or *secret*, and the leads),
 *     the Planner's notes (the secret goal and its notes) — one annex write
 *     (`write`); then the world itself, the places with
 *     their ways out and the people, as entries of the session's own
 *     lorebook (`lorePlaces` … `lorePeople`, `lore.ts`);
 *  3. `opening` — the Narrator's row on Story; `placed.set.*` — each player
 *     seat's `location` set to the first place, filed at that row;
 *  4. `scene*` → `save` — the Narrator's opening, one streamed call into
 *     its row, from the first place and a lead.
 * @internal
 */
export const genesisChain = (c: any, w: Wiring, prefix: string, t: GenesisTerms) => {
	const world = modelCall(c, w, prefix, 'genesis', {
		speaker: `envoy:planner`,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.genesis,
		brief: t.brief,
		cast: t.cast,
		history: t.history,
		schema: DUNGEON_CRAWLER_GENESIS_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'Building the world',
			label: 'Build the world',
			purpose: 'Once the characters are made, the Planner generates the world: where you start, what is near, who you may meet, the goal and its secrets.',
		},
	})
	const filed = scriptStep(world, w, prefix, 'filed', DUNGEON_CRAWLER_GENESIS_SCRIPT.seedKey, ($) => ({
		session: t.session($),
		sheet: t.sheet($),
		json: at($, `${prefix}genesisWrite`).json,
		state: t.state($),
	}), 'Read the generated world')
	const doc = ($: any) => at($, `${prefix}filed`).main
	const parts = jsonPart(
		jsonPart(
			textPart(filed, w, prefix, 'notes', doc, 'notes', "The Planner's notes"),
			w,
			prefix,
			'journal',
			doc,
			'journal',
			'The journal',
		),
		w,
		prefix,
		'world',
		doc,
		'world',
		"The crawl's bookkeeping",
	)
	const filedKeys = parts.outlet(
		'write',
		($: any) =>
			C.setSessionAnnex.v1({
				value: {
					[K.progress]: at($, `${prefix}world`).main,
					[K.journal]: at($, `${prefix}journal`).main,
					[K.planningNotes]: at($, `${prefix}notes`).text,
				} as any,
				params: slot.params(),
			}),
		{ expose: { label: 'File the goal and the notes' } },
	)
	// The world itself: its places with their ways out, and its people, in the
	// session's own lorebook (`lore.ts`) — before the opening, which opens in
	// the first place.
	const written = loreWrites(filedKeys, w, prefix, doc)
	const briefed = textPart(
		written,
		w,
		prefix,
		'openingBrief',
		($) => at($, `${prefix}filed`).main,
		'openingBrief',
		'What the opening shows',
	).outlet(
		'opening',
		() => C.createMessage.v1({ generating: true, channel: 'main', speaker: NARRATOR as any }),
		{ expose: { label: 'Open the first scene' } },
	)
	/**
	 * Where the party starts: each player seat's `location`, the first place
	 * — filed at the opening's row, so the opening line says where they are.
	 */
	const P = `${prefix}placed.set.`
	w.params.push([`${P}applied`, { mode: 'apply' }])
	const placed = briefed.junction('placed', { on: doc }, (j: any) =>
		j.when('set', { path: 'placements', truthy: true }, (k: any) =>
			jsonPart(k, w, P, 'changes', doc, 'placements', 'Where the party starts')
				.query('resolved', ($: any) =>
					C.resolveStateChanges.v1({
						changes: at($, `${P}changes`).main,
						scope: $.input.sessionScope,
						base: $.state.version,
					}),
				)
				.task(
					'applied',
					($: any) =>
						C.setState.v1({
							changes: at($, `${P}resolved`).changes,
							scope: $.input.sessionScope,
							base: $.state.version,
							worldRow: at($, `${prefix}opening`).messageId,
							params: slot.params(),
						}),
					{ expose: { label: 'Put the party in the first place' } },
				),
		),
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
	w.params.push([`${prefix}worldPlaces`, { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.place], withLinks: true }])
	const W = `${prefix}hold.ways.`
	const ways = scriptStep(
		placed.query('worldPlaces', ($: any) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The places, as written' },
		}),
		w,
		prefix,
		'ways',
		DUNGEON_CRAWLER_GENESIS_SCRIPT.seedKey,
		($) => ({
			session: t.session($),
			json: at($, `${prefix}genesisWrite`).json,
			places: at($, `${prefix}worldPlaces`).entries,
			state: t.state($),
		}),
		'The ways out, as pieces',
	)
	const held = ways.junction('hold', { on: ($: any) => at($, `${prefix}ways`).main }, (j: any) =>
		j.when('ways', { path: 'ways', truthy: true }, (k: any) =>
			jsonPart(
				jsonPart(k, w, W, 'owners', ($: any) => at($, `${prefix}ways`).main, 'ways.owners', 'Whose ways out'),
				w,
				W,
				'deltas',
				($: any) => at($, `${prefix}ways`).main,
				'ways.deltas',
				'The ways out',
			).task(
				'apply',
				($: any) =>
					C.rulesetResolve.v1({
						scope: $.input.sessionScope,
						owners: at($, `${W}owners`).main,
						deltas: at($, `${W}deltas`).main,
						mode: 'apply',
					}),
				{ expose: { label: 'Hold the ways out' } },
			),
		),
	)
	return modelCall(held, w, prefix, 'scene', {
		speaker: NARRATOR,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.opening,
		brief: ($) => at($, `${prefix}openingBrief`).text,
		cast: t.cast,
		history: t.history,
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
			($: any) =>
				C.updateMessage.v1({
					target: at($, `${prefix}opening`).messageId,
					text: at($, `${prefix}sceneWrite`).text,
					reasoning: at($, `${prefix}sceneWrite`).reasoning,
				}),
			{ expose: { label: 'Fill the opening scene' } },
		)
		/**
		 * 🚧 Each made character's Planner lane hears the story has started
		 * (PLAN-dc-after-walk2 Q3-3): a table line, after the opening is in.
		 */
		.junction('started', { on: doc }, (j: any) =>
			j.when('told', { path: 'startedLanes', truthy: true }, (k: any) =>
				textPart(
					jsonPart(k, w, `${prefix}started.told.`, 'lanes', doc, 'startedLanes', 'Whose lanes hear it'),
					w,
					`${prefix}started.told.`,
					'line',
					doc,
					'startedLine',
					'The story has started',
				).each('lane', { over: ($: any) => at($, `${prefix}started.told.lanes`).main, max: 16 }, (m: any) =>
					m.outlet(
						'write',
						($: any) =>
							C.createMessage.v1({
								text: at($, `${prefix}started.told.line`).text,
								channel: at($, `${prefix}started.told.lane.item`),
								speaker: `envoy:planner` as any,
								tableLine: true,
							}),
						{ expose: { label: 'Say the story has started' } },
					),
				),
			),
		)
}
