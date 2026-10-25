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
import { DUNGEON_CRAWLER_SHAPE_SCRIPT } from './shape.js'
import { jsonPart, modelCall, on, scriptStep, textPart, type Wiring } from './calls.js'
import type { ParleyOn } from './respond.js'

/*
 * 🚧 What a player's talk with the Planner may change — its standing order,
 * its asks, changes in the session's rules' grammar, the host's places — is
 * laid at run time over the session's ruleset since 2026-10-23 (lane G3, S1:
 * `DUNGEON_CRAWLER_EDITS_FRAME`, `shape.ts`); ⏳ `DUNGEON_CRAWLER_EDITS_SCHEMA`,
 * spelled from Vis Itineris at build, is retired.
 */

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
 *  5. `edits*` — ONE JSON call over the same crib, 🚧 its grammar laid over the
 *     session's rules (`editsShape` reads `ruleset-resolve`'s `replySchema`,
 *     `editsSchema` the rest — `shape.ts`, S1):
 *     the prompt says what may change, and an answer that changes nothing is
 *     empty (AUDIT A23: no keyword gate decides whether it is asked);
 *     `core:script/dungeon-crawler-edits` lands it — the standing order on
 *     the seat, the asks in the notes, the deltas through the ruleset
 *     handler's `apply` — and each landing is a **table line** on the lane,
 *     anchored to the Planner's reply, so deleting the reply takes it back.
 * @internal
 */
export const parleyBranch = (c: ParleyOn, w: Wiring): ParleyOn => {
	const opened = c.outlet(
		'placeholder',
		($) =>
			C.createMessage.v1({
				generating: true,
				channel: $.input.channel,
				speaker: PLANNER as any,
				row: $.input.messageId,
			}),
		{ expose: { label: "Open the Planner's reply" } },
	)
	w.params.push([on(c, 'lane'), { limit: 40 }])
	const heard = opened.query(
		'lane',
		($) => C.sessionHistory.v1({ scope: $.input.sessionScope, channelLane: $.input.channel, params: slot.params() }),
		{ expose: { label: "This lane's talk", status: 'The Planner is thinking' } },
	)
	const booked = textPart(
		textPart(
			scriptStep(heard, w, 'crib', DUNGEON_CRAWLER_CRIB_SCRIPT.seedKey, ($) => ({
				session: $.input.session,
				lane: $.input.channel,
				places: $.places.entries,
				people: $.people.entries,
				state: $.state.state,
				// 🚧 How the table plays (P1-3).
				ruleset: $.input.ruleset,
			}), "The Planner's crib"),
			w,
			'cribText',
			($) => $.crib.main,
			'text',
			"The Planner's out-of-character crib, as text",
		),
		w,
		'canChange',
		($) => $.crib.main,
		'canChange',
		'What this player may change',
	)
	/**
	 * This lane's rows — each answer the person pressed (a table line of kind
	 * `answer`, said for them) reads as their own line (🚧 P3-5).
	 */
	const talked = modelCall(booked, w, 'talk', {
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.parley,
		brief: ($) => $.input.text,
		crib: ($) => $.cribText.text,
		cast: ($) => $.cast.cast,
		history: ($) => $.lane.messages,
		recentStory: ($) => $.story.messages,
		expose: {
			stream: true,
			status: 'The Planner is thinking',
			label: 'The Planner, out of character',
			purpose: 'The Planner answers you in your own channel, out of character, from its crib.',
		},
	}).outlet(
		'save',
		($) =>
			C.updateMessage.v1({
				target: $.placeholder.messageId,
				text: $.talkWrite.text,
				reasoning: $.talkWrite.reasoning,
			}),
		{ expose: { label: "Fill the Planner's reply" } },
	)
	/** 🚧 What a change may name under the session's rules (S1): no dice, no writes. */
	const shaped = scriptStep(
		talked.task(
			'editsShape',
			($) =>
				C.rulesetResolve.v1({
					params: slot.params(),
					scope: $.input.sessionScope,
					mode: 'resolve',
					actions: { replyShape: true } as any,
				}),
			{ expose: { label: 'What the Planner may change', status: 'The Planner notes what you asked' } },
		),
		w,
		'editsSchema',
		DUNGEON_CRAWLER_SHAPE_SCRIPT.seedKey,
		($) => ({ shape: $.editsShape.replySchema, ruleset: $.input.ruleset, want: 'edits' }),
		"The Planner's grammar",
	)
	const read = modelCall(shaped, w, 'edits', {
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.edits,
		brief: ($) => $.input.text,
		crib: ($) => $.cribText.text,
		fields: ($) => ({ canChange: $.canChange.text }),
		cast: ($) => $.cast.cast,
		history: ($) => $.lane.messages,
		schema: ($) => $.editsSchema.main,
		expose: {
			status: 'The Planner notes what you asked',
			label: 'What you asked for',
			purpose: 'What you ask the Planner for lands: your standing order, an ask the story will honour, a change to your sheet — and, from the host, a change to the world.',
		},
	})
	return scriptStep(read, w, 'edit', DUNGEON_CRAWLER_EDITS_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		lane: $.input.channel,
		json: $.editsWrite.json,
		state: $.state.state,
		places: $.places.entries,
	}), 'Read what was asked').junction('kept', { on: ($) => $.edit.main }, (k) => {
		return k
			.when('changed', { path: (v: Edited) => v.changes, truthy: true }, (ch) => {
				w.params.push([on(ch, 'apply'), { mode: 'apply' }])
				return jsonPart(ch, w, 'changes', ($) => $.channel.parley.edit.main, 'changes', 'The standing order')
					.query('resolve', ($) =>
						C.resolveStateChanges.v1({
							changes: $.changes.main,
							scope: $.input.sessionScope,
							base: $.state.version,
						}),
					)
					.task('apply', ($) =>
						C.setState.v1({
							changes: $.resolve.changes,
							scope: $.input.sessionScope,
							base: $.state.version,
							worldRow: $.channel.parley.placeholder.messageId,
							params: slot.params(),
						}),
					)
			})
			.when('noted', { path: (v: Edited) => v.notes, truthy: true }, (n) =>
				textPart(n, w, 'notes', ($) => $.channel.parley.edit.main, 'notes', "The Planner's notes, with the asks").outlet(
					'write',
					($) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotes]: $.notes.text } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep the asks in the notes' } },
				),
			)
			/** 🚧 The notes once out: the revealed copy follows (AUDIT A24). */
			.when('revealed', { path: (v: Edited) => v.notesRevealed, truthy: true }, (n) =>
				textPart(n, w, 'notes', ($) => $.channel.parley.edit.main, 'notesRevealed', 'The notes, as revealed — the Planner lane').outlet(
					'write',
					($) =>
						C.setSessionAnnex.v1({
							value: { [K.planningNotesRevealed]: $.notes.text } as any,
							params: slot.params(),
						}),
					{ expose: { label: 'Keep the revealed notes in step — the Planner lane' } },
				),
			)
			/** A table line on this lane, anchored to the Planner's reply. */
			.when('said', { path: (v: Edited) => v.said, truthy: true }, (t) =>
				textPart(t, w, 'line', ($) => $.channel.parley.edit.main, 'said', 'What was noted').outlet(
					'write',
					($) =>
						C.createMessage.v1({
							text: $.line.text,
							channel: $.input.channel,
							tableLine: $.channel.parley.placeholder.messageId as any,
						}),
					{ expose: { label: 'Say: what was noted' } },
				),
			)
			.when('ruled', { path: (v: Edited) => v.deltas, truthy: true }, (r) =>
				scriptStep(
					jsonPart(
						jsonPart(r, w, 'deltas', ($) => $.channel.parley.edit.main, 'deltas', 'The changes asked for'),
						w,
						'owners',
						($) => $.channel.parley.edit.main,
						'owners',
						'Whose rules they touch',
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
						{ expose: { label: 'Apply what was asked', status: 'The Planner notes what you asked' } },
					),
					w,
					'told',
					DUNGEON_CRAWLER_EDITS_SCRIPT.seedKey,
					($) => ({
						// The table's names for its refusals (P1-2).
						session: $.input.session,
						places: $.places.entries,
						applied: {
							outcomes: $.apply.outcomes,
							rejected: $.apply.rejected,
						},
					}),
					'What the rules made of it',
				).junction('shown', { on: ($) => $.told.main }, (j) =>
					j.when('line', { path: (v: Edited) => v.line, truthy: true }, (t) =>
						textPart(t, w, 'line', ($) => $.channel.parley.kept.ruled.told.main, 'line', 'What changed').outlet(
							'write',
							($) =>
								C.createMessage.v1({
									text: $.line.text,
									channel: $.input.channel,
									tableLine: $.channel.parley.placeholder.messageId as any,
								}),
							{ expose: { label: 'Say: what changed' } },
						),
					),
				),
			)
	})
}

/**
 * What the edits script hands its junctions (`core:script/dungeon-crawler-edits`):
 * each member `null` when empty; handed the handler's `apply`, `{ line }`.
 */
interface Edited {
	readonly changes: unknown
	readonly notes: unknown
	readonly notesRevealed: unknown
	readonly deltas: unknown
	readonly owners: unknown
	readonly said: unknown
	readonly line: unknown
}
