/**
 * 🚧 Dungeon Crawler's reply (PLAN-dungeon-crawler-2026-10-14): the genre's
 * required `message-respond` pipeline, routed by the channel the turn was
 * fired on — `main` is the story, any other is a Planner lane (`parley:<n>`;
 * the Journal folio has no voice, so no turn is ever fired there).
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { parleyBranch } from './parley.js'
import { storyBranch } from './story.js'
import { applyWiring, wiring } from './calls.js'
import { DUNGEON_CRAWLER_ENTRY_TYPES } from './lore.js'

/** @experimental */
export const DUNGEON_CRAWLER_RESPOND_SPEC_ID = 'core:spec/dungeon-crawler-respond'
/** @internal */
export const DUNGEON_CRAWLER_RESPOND_VERSION = '1.0.0'

/**
 * **Reply** — the genre's one turn pipeline (24 §3), two branches on
 * `input.channel` (strict equality: `main` is the stored string of the
 * story's one lane):
 *
 *  - `channel.story` — the story turn: the hidden Planner's books, the
 *    rules, then the Narrator (`story.ts`) — two model calls at most;
 *  - `channel.parley` — the Planner, out of character, in the player's own
 *    lane (`parley.ts`): its answer, then what the player asked it to
 *    change. The round script prepares this entry whenever a lane's newest
 *    row is a person's, round or no round.
 * @experimental
 */
export const dungeonCrawlerRespondSpec = () => {
	const w = wiring()
	/**
	 * The story read: Story's newest thirty rows, **without the table lines**
	 * (🚧 2026-10-15) — the roll lines are the table's, and the brief already
	 * carries every result. Read, they taught the Narrator to write roll lines
	 * of its own with dice the Planner never rolled.
	 */
	w.params.push(['story', { channel: 'main', limit: 30, tableLines: false }])
	/**
	 * 🚧 The world, as the session's own lorebook holds it (PLAN-rulesets §26,
	 * `lore.ts`): its places with their ways out, and its people — what both
	 * branches read. The fallen and the Journal folio are the story turn's
	 * own reads (`story.ts`): the Planner's talk never needed them (AUDIT C7).
	 * A session whose lorebook holds nothing yet reads an empty world.
	 */
	w.params.push(['places', { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.place], withLinks: true }])
	w.params.push(['people', { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.person] }])
	const built = spec(DUNGEON_CRAWLER_RESPOND_SPEC_ID, {
		version: DUNGEON_CRAWLER_RESPOND_VERSION,
		taxonomy: { role: 'primary' },
	})
		.inlet('input', C.userMessage.v1(), {
			genre: dungeonCrawlerGenre,
			event: sessionEvents.messageRespond,
		})
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		/**
		 * The story's newest rows: the Narrator's conversation, and what the
		 * Planner has seen of the story. Its status is the turn's first word
		 * — on both branches the Planner goes first — said in place of the
		 * history read's generic *{speaker} is thinking*.
		 */
		.query('story', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { status: 'The Planner is thinking' },
		})
		.query('places', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The places', status: 'The Planner is thinking' },
		})
		.query('people', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
			expose: { label: 'The people', status: 'The Planner is thinking' },
		})
		.junction('channel', { on: ($: any) => $.input.channel }, (ch: any) =>
			ch
				.when('story', { equals: 'main' }, (s: any) =>
					storyBranch(s, w, {
						cast: ($) => $.cast.cast,
						history: ($) => $.story.messages,
						places: ($) => $.places.entries,
						people: ($) => $.people.entries,
					}),
				)
				.otherwise('parley', (p: any) =>
					parleyBranch(p, w, 'channel.parley.', {
						cast: ($) => $.cast.cast,
						history: ($) => $.story.messages,
						places: ($) => $.places.entries,
						people: ($) => $.people.entries,
					}),
				),
		)
	return compile(
		built
			.preset('dungeon-crawler', { label: 'Dungeon Crawler', default: true }, (p: any) => applyWiring(p, w))
			.build(),
	)
}
