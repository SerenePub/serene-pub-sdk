/**
 * 🚧 The Planner talks in a player's lane (PLAN-dungeon-crawler-2026-10-14,
 * feature 9): the `parley` branch of `core:spec/dungeon-crawler-respond`.
 * Modelled on the Lair's Sanctum (`lair/respond.ts`, `sanctumBranch`) and
 * its steering actions (`whisper.ts`, `nudge.ts`).
 */

import { slot } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import { DUNGEON_CRAWLER_CRIB_SCRIPT, DUNGEON_CRAWLER_EDITS_SCRIPT } from './scripts.js'
import { PLANNER } from './create.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K } from './names.js'
import { DUNGEON_CRAWLER_STANDING_ORDERS } from './round.js'
import { DUNGEON_CRAWLER_ROOM_SCHEMA } from './lore.js'
import { DUNGEON_CRAWLER_DELTA_SCHEMA } from './story.js'
import { at, jsonPart, modelCall, scriptStep, textPart, type Wiring } from './calls.js'

/**
 * 🚧 What a player's talk with the Planner may change (PLAN-sheet-widget-redesign
 * §13–14, 2026-10-17: "introduce an alley"):
 *
 *  - `standingOrder` — one of the slot's four, or empty; only at a table of
 *    more than one (`manyAtTable`: the edits script refuses it in solo);
 *  - `asks` — what the player wants the story to bring in ("introduce an
 *    alley"), appended to the Planner's notes under *Asks*, which the story
 *    turn honours when the scene allows;
 *  - `deltas` — changes in the story turn's own delta shape
 *    (`DUNGEON_CRAWLER_DELTA_SCHEMA`), applied by the ruleset handler: the
 *    host's lane any seat or the world, a guest's only their own seat;
 *  - `rooms` — the host's alone: a place the book holds with a new or
 *    changed way out inside it (the one exit model, `lore.ts`) — the alley.
 *
 * Every member required (the grammar-compiling families); empty says "none".
 * @experimental
 */
export const DUNGEON_CRAWLER_EDITS_SCHEMA = {
	type: 'object',
	properties: {
		standingOrder: { type: 'string', enum: ['', ...DUNGEON_CRAWLER_STANDING_ORDERS.map((o) => o.key)] },
		asks: { type: 'array', maxItems: 4, items: { type: 'string' } },
		deltas: { type: 'array', maxItems: 8, items: DUNGEON_CRAWLER_DELTA_SCHEMA },
		rooms: { type: 'array', maxItems: 4, items: DUNGEON_CRAWLER_ROOM_SCHEMA },
	},
	required: ['standingOrder', 'asks', 'deltas', 'rooms'],
	additionalProperties: false,
} as const

/**
 * The Planner's reply in the lane the line was sent on (`input.channel`,
 * `parley:<n>`), out of character, and what the player asked it to change:
 *
 *  1. `placeholder` — its own row on that lane, under the Planner's name;
 *  2. `crib` — `core:script/dungeon-crawler-crib`: the world (the session's
 *     own lorebook: its places and people), the journal, its own notes and
 *     this player's hero, as prose (`{{scratchpad}}` — the speaker's own
 *     running notes), and what this player may change (`{{canChange}}`);
 *  3. `lane` — **this lane's own rows** (`session-history@1` with its
 *     `channelLane` in-port wired to `input.channel`: exactly that lane, a bare
 *     `parley` being lane 1 — never every lane of the slug, which would hand
 *     one player's private talk to another's Planner);
 *  4. `talk*` — ONE streamed call: the lane as the conversation, the story's
 *     newest rows as background (`{{recentStory}}`);
 *  5. `edits*` — ONE JSON call over the same crib (`DUNGEON_CRAWLER_EDITS_SCHEMA`):
 *     the prompt says what may change, and an answer that changes nothing is
 *     empty (AUDIT A23: no keyword gate decides whether it is asked);
 *     `core:script/dungeon-crawler-edits` lands it — the standing order on
 *     the seat, the asks in the notes, the deltas through the ruleset
 *     handler's `apply` — and each landing is a **table line** on the lane,
 *     anchored to the Planner's reply, so deleting the reply takes it back.
 * @internal
 */
export const parleyBranch = (
	c: any,
	w: Wiring,
	prefix: string,
	terms: {
		cast: ($: any) => unknown
		history: ($: any) => unknown
		/** `core:query/lorebook-entries@1` — the places, with their links. */
		places: ($: any) => unknown
		/** `core:query/lorebook-entries@1` — the people. */
		people: ($: any) => unknown
	},
) => {
	const opened = c.outlet(
		'placeholder',
		($: any) =>
			C.createMessage.v1({
				generating: true,
				channel: $.input.channel,
				speaker: PLANNER as any,
				row: $.input.messageId,
			}),
		{ expose: { label: "Open the Planner's reply" } },
	)
	const row = ($: any) => at($, `${prefix}placeholder`).messageId
	w.params.push([`${prefix}lane`, { limit: 40 }])
	const heard = opened.query(
		'lane',
		($: any) =>
			C.sessionHistory.v1({ scope: $.input.sessionScope, channelLane: $.input.channel, params: slot.params() }),
		{ expose: { label: "This lane's talk", status: 'The Planner is thinking' } },
	)
	const cribbed = ($: any) => at($, `${prefix}crib`).main
	const booked = textPart(
		textPart(
			scriptStep(heard, w, prefix, 'crib', DUNGEON_CRAWLER_CRIB_SCRIPT.seedKey, ($) => ({
				session: $.input.session,
				lane: $.input.channel,
				places: terms.places($),
				people: terms.people($),
				state: $.state.state,
				// 🚧 How the table plays (P1-3).
				ruleset: $.input.ruleset,
			}), "The Planner's crib"),
			w,
			prefix,
			'cribText',
			cribbed,
			'text',
			"The Planner's out-of-character crib, as text",
		),
		w,
		prefix,
		'canChange',
		cribbed,
		'canChange',
		'What this player may change',
	)
	const crib = ($: any) => at($, `${prefix}cribText`).text
	/**
	 * This lane's rows — each answer the person pressed (a table line of kind
	 * `answer`, said for them) reads as their own line (🚧 P3-5).
	 */
	const lane = ($: any) => at($, `${prefix}lane`).messages
	const talked = modelCall(booked, w, prefix, 'talk', {
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.parley,
		brief: ($) => $.input.text,
		crib,
		cast: terms.cast,
		history: lane,
		recentStory: terms.history,
		expose: {
			stream: true,
			status: 'The Planner is thinking',
			label: 'The Planner, out of character',
			purpose: 'The Planner answers you in your own channel, out of character, from its crib.',
		},
	}).outlet(
		'save',
		($: any) =>
			C.updateMessage.v1({
				target: row($),
				text: at($, `${prefix}talkWrite`).text,
				reasoning: at($, `${prefix}talkWrite`).reasoning,
			}),
		{ expose: { label: "Fill the Planner's reply" } },
	)
	const read = modelCall(talked, w, prefix, 'edits', {
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.edits,
		brief: ($) => $.input.text,
		crib,
		fields: ($) => ({ canChange: at($, `${prefix}canChange`).text }),
		cast: terms.cast,
		history: lane,
		schema: DUNGEON_CRAWLER_EDITS_SCHEMA,
		expose: {
			status: 'The Planner notes what you asked',
			label: 'What you asked for',
			purpose: 'What you ask the Planner for lands: your standing order, an ask the story will honour, a change to your sheet — and, from the host, a change to the world.',
		},
	})
	/** A table line on this lane, anchored to the Planner's reply. */
	const tableLine = (k: any, Q: string, from: ($: any) => unknown, path: string, what: string) =>
		textPart(k, w, Q, 'line', from, path, what).outlet(
			'write',
			($: any) =>
				C.createMessage.v1({
					text: at($, `${Q}line`).text,
					channel: $.input.channel,
					tableLine: row($) as any,
				}),
			{ expose: { label: `Say: ${what.toLowerCase()}` } },
		)
	return scriptStep(read, w, prefix, 'edit', DUNGEON_CRAWLER_EDITS_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		lane: $.input.channel,
		json: at($, `${prefix}editsWrite`).json,
		state: $.state.state,
		places: terms.places($),
	}), 'Read what was asked').junction('kept', { on: ($: any) => at($, `${prefix}edit`).main }, (k: any) => {
		const Q = `${prefix}kept.`
		const edit = ($: any) => at($, `${prefix}edit`).main
		w.params.push([`${Q}changed.apply`, { mode: 'apply' }])
		return k
			.when('changed', { path: 'changes', truthy: true }, (ch: any) =>
				jsonPart(ch, w, `${Q}changed.`, 'changes', edit, 'changes', 'The standing order')
					.query('resolve', ($: any) =>
						C.resolveStateChanges.v1({
							changes: at($, `${Q}changed.changes`).main,
							scope: $.input.sessionScope,
							base: $.state.version,
						}),
					)
					.task('apply', ($: any) =>
						C.setState.v1({
							changes: at($, `${Q}changed.resolve`).changes,
							scope: $.input.sessionScope,
							base: $.state.version,
							worldRow: row($),
							params: slot.params(),
						}),
					),
			)
			.when('noted', { path: 'notes', truthy: true }, (n: any) =>
				textPart(n, w, `${Q}noted.`, 'notes', edit, 'notes', "The Planner's notes, with the asks").outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotes]: at($, `${Q}noted.notes`).text } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep the asks in the notes' } },
				),
			)
			/** 🚧 The notes once out: the revealed copy follows (AUDIT A24). */
			.when('revealed', { path: 'notesRevealed', truthy: true }, (n: any) =>
				textPart(n, w, `${Q}revealed.`, 'notes', edit, 'notesRevealed', 'The notes, as revealed — the Planner lane').outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotesRevealed]: at($, `${Q}revealed.notes`).text } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep the revealed notes in step — the Planner lane' } },
				),
			)
			.when('said', { path: 'said', truthy: true }, (t: any) =>
				tableLine(t, `${Q}said.`, edit, 'said', 'What was noted'),
			)
			.when('ruled', { path: 'deltas', truthy: true }, (r: any) => {
				const R = `${Q}ruled.`
				return scriptStep(
					jsonPart(jsonPart(r, w, R, 'deltas', edit, 'deltas', 'The changes asked for'), w, R, 'owners', edit, 'owners', 'Whose rules they touch').task(
						'apply',
						($: any) =>
							C.rulesetResolve.v1({
								scope: $.input.sessionScope,
								owners: at($, `${R}owners`).main,
								deltas: at($, `${R}deltas`).main,
								mode: 'apply',
							}),
						{ expose: { label: 'Apply what was asked', status: 'The Planner notes what you asked' } },
					),
					w,
					R,
					'told',
					DUNGEON_CRAWLER_EDITS_SCRIPT.seedKey,
					($) => ({
						// The table's names for its refusals (P1-2).
						session: $.input.session,
						places: terms.places($),
						applied: {
							outcomes: at($, `${R}apply`).outcomes,
							rejected: at($, `${R}apply`).rejected,
						},
					}),
					'What the rules made of it',
				).junction('shown', { on: ($: any) => at($, `${R}told`).main }, (j: any) =>
					j.when('line', { path: 'line', truthy: true }, (t: any) =>
						tableLine(t, `${R}shown.line.`, ($: any) => at($, `${R}told`).main, 'line', 'What changed'),
					),
				)
			})
	})
}
