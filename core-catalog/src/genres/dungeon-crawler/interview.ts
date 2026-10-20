/**
 * 🚧 Dungeon Crawler's **interview** (PLAN-dungeon-crawler-2026-10-14,
 * features 1–3, workflow 2–3): the Planner's questions in each person's lane,
 * answered by pressing.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import {
	DUNGEON_CRAWLER_INTERVIEW_ACTION,
	DUNGEON_CRAWLER_INTERVIEW_SCRIPT,
	DUNGEON_CRAWLER_QUESTIONS,
	DUNGEON_CRAWLER_SHEET_SCRIPT,
} from './scripts.js'
import { PLANNER } from './create.js'
import { genesisChain } from './genesis.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, DUNGEON_CRAWLER_STORY_CHANNEL } from './names.js'
import { DUNGEON_CRAWLER_STORY_WAITING_FOR_WORLD } from './create.js'
import { applyWiring, at, jsonPart, modelCall, scriptStep, textPart, wiring, type Wiring } from './calls.js'
import { hpSlot } from '../../registry/slots.js'
import { DUNGEON_CRAWLER_SPELL_POINTS_SLOT } from './kits.js'

/** @experimental */
export const DUNGEON_CRAWLER_INTERVIEW_SPEC_ID = 'core:spec/dungeon-crawler-interview'
/** @internal */
export const DUNGEON_CRAWLER_INTERVIEW_VERSION = '1.0.0'

/** The classes the Planner offers: a question and three to five options (`make-choices@1`'s document). @experimental */
export const DUNGEON_CRAWLER_CLASSES_SCHEMA = {
	type: 'object',
	properties: {
		question: { type: 'string' },
		options: {
			type: 'array',
			minItems: 2,
			maxItems: 5,
			items: {
				type: 'object',
				properties: { key: { type: 'string' }, label: { type: 'string' } },
				required: ['key', 'label'],
				additionalProperties: false,
			},
		},
	},
	required: ['question', 'options'],
	additionalProperties: false,
} as const

/**
 * The character sheet the Planner writes (and, on Just play, everything a
 * person may pick). Every member required, empty when not asked — the
 * sheet script reads only what this answer may set. What a character
 * carries is not here: it is the class's starting kit (`kits.ts`), pieces
 * of the rules, never a list of words (2026-10-16); nor are its ability
 * scores and full health, which the kit's class sets too (2026-10-17).
 * `name` is always the character's name — the one chosen, or the
 * Planner's own on Just play; an empty one is asked again.
 * @experimental
 */
export const DUNGEON_CRAWLER_SHEET_SCHEMA = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		class: { type: 'string' },
		backstory: { type: 'string' },
		// The schema says what each may be (AUDIT C7): the sheet script
		// checks them no second time.
		shape: { type: 'string', enum: ['', 'dungeon', 'open-world'] },
		difficulty: { type: 'string', enum: ['', 'gentle', 'fair', 'brutal'] },
		goalMode: { type: 'string', enum: ['', 'shared', 'secret'] },
	},
	required: ['name', 'class', 'backstory', 'shape', 'difficulty', 'goalMode'],
	additionalProperties: false,
} as const

const step = ($: any) => $.step.main

/**
 * Write state changes, at `prefix`: `<key>` (the part of `from` at `path`),
 * `<key>Resolved` and `<key>Applied`. With `owners`, a change naming no owner
 * is made on each — the player seat `set-seat-name@1` handed over.
 */
const writeChanges = (
	c: any,
	w: Wiring,
	prefix: string,
	key: string,
	from: ($: any) => unknown,
	path: string,
	what: string,
	owners?: ($: any) => unknown,
	/** 🚧 A row this run wrote: the world's and a card-less seat's changes are filed there (P0-4). */
	row?: ($: any) => unknown,
) => {
	w.params.push([`${prefix}${key}Applied`, { mode: 'apply' }])
	return jsonPart(c, w, prefix, key, from, path, what)
		.query(
			`${key}Resolved`,
			($: any) =>
				C.resolveStateChanges.v1({
					changes: at($, `${prefix}${key}`).main,
					...(owners ? { owners: owners($) as any } : {}),
					scope: $.input.sessionScope,
					base: $.state.version,
				}),
			{ expose: { label: `${what}, checked` } },
		)
		.task(
			`${key}Applied`,
			($: any) =>
				C.setState.v1({
					changes: at($, `${prefix}${key}Resolved`).changes,
					scope: $.input.sessionScope,
					base: $.state.version,
					...(row ? { worldRow: row($) as any } : {}),
					params: slot.params(),
				}),
			{ expose: { label: `${what}, written` } },
		)
}

/** A Planner line on the person's lane, its text the part of `from` at `path`; `what` heads both steps. */
const say = (
	c: any,
	w: Wiring,
	prefix: string,
	from: ($: any) => unknown,
	path: string,
	what: string,
	blocks?: ($: any) => unknown,
) =>
	textPart(c, w, prefix, 'line', from, path, what).outlet(
		'write',
		($: any) =>
			C.createMessage.v1({
				text: at($, `${prefix}line`).text,
				channel: $.lane.text,
				speaker: PLANNER as any,
				...(blocks ? { blocks: blocks($) as any } : {}),
			}),
		{ expose: { label: `Say: ${what.toLowerCase()}` } },
	)

/**
 * 🚧 An acknowledgement on the person's lane ("Name: Ann.", "Give me a
 * moment…") as a **table line** (2026-10-16): no model call wrote it, so it
 * is faceless and never rerun — a swipe on it asked the Planner to answer
 * its own line, and the call came back empty.
 */
const note = (
	c: any,
	w: Wiring,
	prefix: string,
	from: ($: any) => unknown,
	path: string,
	what: string,
	kind?: ($: any) => unknown,
) =>
	textPart(c, w, prefix, 'line', from, path, what).outlet(
		'write',
		($: any) =>
			C.createMessage.v1({
				text: at($, `${prefix}line`).text,
				channel: $.lane.text,
				// 🚧 An answer is said for the person who pressed it (`user:<id>`),
				// and is of kind `answer`: the Planner's talk reads it as their
				// line (P3-5). A note is the table's, under the Planner.
				speaker: (kind ? $.answer.addressee : PLANNER) as any,
				tableLine: true,
				...(kind ? { kind: kind($) as any } : {}),
			}),
		{ expose: { label: `Note: ${what.toLowerCase()}` } },
	)

/**
 * Name the seat, then make `path`'s changes on it; `what` says which answer
 * this is. With `health`, the part of `from` at that path — the seat's hp
 * `{ max }` — is its full health, configured FIRST (`set-stat-config@1`), so
 * the stats after it may fill it.
 */
const seatWrites = (
	c: any,
	w: Wiring,
	prefix: string,
	from: ($: any) => unknown,
	names: string,
	changes: string,
	what: string,
	health?: string,
	o: {
		/** 🚧 The plan's `retireSeat`: a new character's NEW seat, the fallen's retired (P3-1). */
		retire?: string
		/** 🚧 The row this run wrote in the person's lane: their stats are filed there (P0-4). */
		row?: ($: any) => unknown
		/** 🚧 The kit, its owner the seat named here (P3-7). */
		kit?: string
		/** 🚧 At a spell-points table, the path of the pool's `{ max }` (Q1-6). */
		points?: string
	} = {},
) => {
	const withRetire = o.retire ? jsonPart(c, w, prefix, 'retire', from, o.retire, `The seat it replaces (${what})`) : c
	const named = textPart(withRetire, w, prefix, 'name', from, names, `The seat's name (${what})`).outlet(
		'setSeat',
		($: any) =>
			C.setSeatName.v1({
				user: $.answer.addressee,
				name: at($, `${prefix}name`).text,
				...(o.retire ? { retire: at($, `${prefix}retire`).main } : {}),
			}),
		{ expose: { label: `Name the seat (${what})` } },
	)
	const bounded = health
		? named.junction('health', { on: from }, (j: any) =>
				j.when('set', { path: health, truthy: true }, (k: any) =>
					jsonPart(k, w, `${prefix}health.set.`, 'config', from, health, `The seat's full health (${what})`).outlet(
						'write',
						($: any) =>
							C.setStatConfig.v1({
								owner: at($, `${prefix}setSeat`).seat,
								slot: hpSlot.id,
								config: at($, `${prefix}health.set.config`).main,
								// 🚧 Filed at the row the stats are (PLAN-dc-after-walk3
								// R1-4, the walk's NEW-8): filed at the newest row instead,
								// the full health came AFTER the health it bounds, and the
								// creation read "Health 20 → 10", never "Health 10 (full)".
								...(o.row ? { worldRow: o.row($) as any } : {}),
							}),
						{ expose: { label: `Set the seat's full health (${what})` } },
					),
				),
			)
		: named
	// 🚧 The spell-point pool's most, the seat's own (Q1-6): configured before
	// the stats, so the pool the stats fill fits under it.
	const pooled = o.points
		? bounded.junction('points', { on: from }, (j: any) =>
				j.when('set', { path: o.points!, truthy: true }, (k: any) =>
					jsonPart(k, w, `${prefix}points.set.`, 'config', from, o.points!, `The pool's most (${what})`).outlet(
						'write',
						($: any) =>
							C.setStatConfig.v1({
								owner: at($, `${prefix}setSeat`).seat,
								slot: DUNGEON_CRAWLER_SPELL_POINTS_SLOT,
								config: at($, `${prefix}points.set.config`).main,
								...(o.row ? { worldRow: o.row($) as any } : {}),
							}),
						{ expose: { label: `Set the pool's most (${what})` } },
					),
				),
			)
		: bounded
	const statted = pooled.junction('stats', { on: from }, (j: any) =>
		j.when('changed', { path: changes, truthy: true }, (k: any) =>
			writeChanges(
				k,
				w,
				`${prefix}stats.changed.`,
				'changes',
				from,
				changes,
				`The seat's stats (${what})`,
				($) => at($, `${prefix}setSeat`).seats,
				o.row,
			),
		),
	)
	if (!o.kit) return statted
	/**
	 * 🚧 The class's starting kit (rulesets W3-B): pieces of the rules, applied
	 * by the ruleset handler to the seat named above — its owner filled in
	 * here, so a seat a Just play opened in this same run gets its kit (P3-7,
	 * the walk's B20: it got none).
	 */
	const K0 = `${prefix}kit.given.`
	return statted.junction('kit', { on: from }, (j: any) =>
		j.when('given', { path: o.kit!, truthy: true }, (k: any) => {
			const owned = scriptStep(jsonPart(k, w, K0, 'kit', from, o.kit!, 'The kit, as the sheet drew it'), w, K0, 'owned', DUNGEON_CRAWLER_SHEET_SCRIPT.seedKey, ($) => ({
				session: $.input.session,
				kit: at($, `${K0}kit`).main,
				seat: at($, `${prefix}setSeat`).seat,
			}), 'The kit, on the seat')
			return jsonPart(
				jsonPart(owned, w, K0, 'owners', ($: any) => at($, `${K0}owned`).main, 'owners', 'Whose kit'),
				w,
				K0,
				'deltas',
				($: any) => at($, `${K0}owned`).main,
				'deltas',
				'The kit',
			).task(
				'apply',
				($: any) =>
					C.rulesetResolve.v1({
						owners: at($, `${K0}owners`).main,
						deltas: at($, `${K0}deltas`).main,
						mode: 'apply',
					}),
				{ expose: { label: 'Hand out the kit' } },
			)
		}),
	)
}

/**
 * **Answer** — what every interview question's block fires (the `form`
 * venue: pressed where it was asked, in no listing).
 *
 * `read-answer@1` takes the press apart; `core:script/dungeon-crawler-interview`
 * judges it against the session (the owner answers the world's three
 * questions; a player their own character's) and hands back a plan, which
 * the `route` junction runs — every branch whose part is present:
 *
 *  - `refused` — the Planner's one line, nothing written;
 *  - `world` — the crawl's bookkeeping (`dungeon-crawler-progress`): the
 *    world's shape and goal mode, the person's `heroes` entry;
 *  - `rules` — difficulty, rules and goal on the world (state, applied: the
 *    owner's own answer, Nudge's argument);
 *  - `seat` — the seat's name (`core:outlet/set-seat-name@1`), and its class;
 *  - `ask` — the next question, as the Planner's line with its form;
 *  - `classes` — ONE JSON call: the Planner offers classes that fit the
 *    world, put to the person as choices;
 *  - `sheet` — ONE JSON call: the Planner writes the sheet (backstory; full
 *    health — the class's hit die plus Constitution, the seat's hp max,
 *    configured first — the ability scores and the class's starting kit
 *    added by the script, `kits.ts`; a sheet with no name asks it again; on Just play the name, the class and — the owner's —
 *    the world's three too); `core:script/dungeon-crawler-sheet` applies it:
 *    the seat named, its stats written on the `player_seat` owner, the world's
 *    rules, the hero kept, the Planner's summary in the lane — and, when the
 *    owner finished and no world exists yet, **genesis** (`genesis.ts`).
 *
 * Its answers write state, so a retake of the turn undoes them like any
 * write; the annex does not move back (the plan's ★A, prose that never
 * needs undo).
 * @experimental
 */
export const dungeonCrawlerInterviewSpec = () => {
	const w = wiring()
	const cast = ($: any) => $.cast.cast
	const history = ($: any) => $.story.messages
	let graph: any = spec(DUNGEON_CRAWLER_INTERVIEW_SPEC_ID, {
		version: DUNGEON_CRAWLER_INTERVIEW_VERSION,
		taxonomy: { role: 'action' },
		contributes: {
			actions: [
				{
					key: 'answer',
					venue: { kind: 'form' },
					audience: { see: ['participant'], act: ['participant'] },
					icon: 'message-circle-reply',
					label: { en: 'Answer' },
					description: { en: "Answer the Planner's question." },
				},
			],
		},
	})
		.inlet('input', C.userMessage.v1(), {
			genre: dungeonCrawlerGenre,
			event: sessionEvents.sessionAction,
		})
		.task('answer', ($) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		/** The story's newest rows — the conversation the Planner's calls read (empty before genesis). */
		.query('story', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }))
	w.params.push(['story', { channel: 'main', limit: 8, tableLines: false }]) // 🚧 no roll lines: the table's, never the story's speech
	graph = scriptStep(graph, w, '', 'step', DUNGEON_CRAWLER_INTERVIEW_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		referent: $.answer.referent,
		choice: $.answer.choice,
		label: $.answer.label,
		values: $.answer.values,
		addressee: $.answer.addressee,
		state: $.state.state,
	}), 'Judge the answer')
	graph = textPart(graph, w, '', 'lane', step, 'lane', "The person's lane")
	/**
	 * 🚧 The answer, said first on the person's own lane — their words
	 * (`echo`, P3-5) and the table's acknowledgement (`note`) — so the
	 * changes the answer makes below are filed there, in their lane, and
	 * never under another person's row (the 100-turn walk, P0-4).
	 */
	const said = graph.junction('said', { on: step }, (j: any) =>
		j
			.when('echo', { path: 'echo', truthy: true }, (c: any) =>
				note(c, w, 'said.echo.', step, 'echo', "The player's answer", () => 'answer'),
			)
			.when('noted', { path: 'note', truthy: true }, (c: any) =>
				note(c, w, 'said.noted.', step, 'note', 'The answer, acknowledged'),
			),
	)
	/** The row the answer was said on: the answer's changes are filed there. */
	const saidRow = ($: any) => $.said.echo.write.messageId
	const built = said.junction('route', { on: step }, (j: any) =>
		j
			.when('refused', { path: 'refusal', truthy: true }, (c: any) =>
				say(c, w, 'route.refused.', step, 'refusal', 'The refusal'),
			)
			.when('world', { path: 'world', truthy: true }, (c: any) =>
				jsonPart(c, w, 'route.world.', 'value', step, 'world', 'The world, as answered').outlet(
					'write',
					($: any) => C.setSessionAnnex.v1({ value: { [K.progress]: $.route.world.value.main } as any, params: slot.params() }),
					{ expose: { label: 'Keep the answer' } },
				),
			)
			.when('rules', { path: 'worldChanges', truthy: true }, (c: any) =>
				writeChanges(c, w, 'route.rules.', 'changes', step, 'worldChanges', "The world's rules", undefined, saidRow),
			)
			.when('seat', { path: 'seatName', truthy: true }, (c: any) =>
				seatWrites(c, w, 'route.seat.', step, 'seatName', 'seatChanges', 'name or class', undefined, {
					retire: 'retireSeat',
					row: saidRow,
				}),
			)
			.when('ask', { path: 'next', truthy: true }, (c: any) =>
				jsonPart(c, w, 'route.ask.', 'blocks', step, 'nextBlocks', "The next question's form").junction(
					'put',
					{ on: step },
					(k: any) =>
						k.when('question', { path: 'nextText', truthy: true }, (q: any) =>
							say(q, w, 'route.ask.put.question.', step, 'nextText', 'The next question', ($) => $.route.ask.blocks.main),
						),
				),
			)
			.when('classes', { path: 'classBrief', truthy: true }, (c: any) =>
				modelCall(textPart(c, w, 'route.classes.', 'brief', step, 'classBrief', 'What the classes are for'), w, 'route.classes.', 'class', {
					speaker: PLANNER,
					prompt: DUNGEON_CRAWLER_PROMPT_KEYS.classes,
					brief: ($) => $.route.classes.brief.text,
					cast,
					history,
					schema: DUNGEON_CRAWLER_CLASSES_SCHEMA,
					briefTurn: true,
					expose: {
						status: 'The Planner thinks of classes',
						label: 'Offer classes',
						purpose: 'The Planner offers classes that fit the world you chose.',
					},
				})
					.task('choices', ($: any) =>
						C.makeChoices.v1({
							json: $.route.classes.classWrite.json,
							fn: 'answer',
							action: DUNGEON_CRAWLER_INTERVIEW_ACTION,
							addressee: $.answer.addressee,
							cast: $.cast.cast,
							referent: DUNGEON_CRAWLER_QUESTIONS.characterClass,
						}),
					)
					.outlet(
						'write',
						($: any) =>
							C.createMessage.v1({
								text: $.route.classes.choices.text,
								channel: $.lane.text,
								speaker: PLANNER as any,
								blocks: $.route.classes.choices.blocks,
							}),
						{ expose: { label: 'Offer the classes' } },
					),
			)
			.when('sheet', { path: 'sheetBrief', truthy: true }, (c: any) => sheetPath(c, w, cast, history)),
	)
	return compile(
		built
			.preset('dungeon-crawler', { label: 'Dungeon Crawler', default: true }, (p: any) => applyWiring(p, w))
			.build(),
	)
}

/** The `sheet` branch: the Planner's sheet, applied, then genesis when it is due. */
const sheetPath = (c: any, w: Wiring, cast: ($: any) => unknown, history: ($: any) => unknown) => {
	const P = 'route.sheet.'
	const applied = ($: any) => $.route.sheet.apply.main
	const wrote = modelCall(textPart(c, w, P, 'brief', step, 'sheetBrief', 'What the sheet is for'), w, P, 'sheet', {
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.sheet,
		brief: ($) => $.route.sheet.brief.text,
		cast,
		history,
		schema: DUNGEON_CRAWLER_SHEET_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'The Planner writes your character sheet',
			label: 'Write the character sheet',
			purpose: "The Planner writes your character's backstory, and the table hands them their class's scores, health and kit — and on Just play, everything else too.",
		},
	})
	const applying = scriptStep(wrote, w, P, 'apply', DUNGEON_CRAWLER_SHEET_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		plan: $.step.main,
		json: $.route.sheet.sheetWrite.json,
		state: $.state.state,
		// 🚧 How the session's ruleset casts and keeps things (P2-4, P2-6).
		ruleset: $.input.ruleset,
	}), 'Apply the sheet')
	/**
	 * The summary FIRST, on the person's own lane (🚧 the 100-turn walk,
	 * P0-4): the sheet's changes below are filed at it — under the shipped
	 * order they were filed at the session's newest row, and a guest's
	 * greeting carried the host's "Health 20 → 12". The summary carries the
	 * standing order's question (feature 17, D11 — `round.ts`); what happens
	 * next ("Give me a moment to build the world.") is its own line AFTER
	 * it — read with the summary's row, so it is written once that row is.
	 */
	const told = applying.junction('told', { on: applied }, (j: any) =>
		j.when('said', { path: 'text', truthy: true }, (k: any) => {
			w.params.push([`${P}told.said.next`, { path: 'after', separator: '' }])
			return say(
				jsonPart(k, w, `${P}told.said.`, 'blocks', applied, 'blocks', 'The standing order, asked'),
				w,
				`${P}told.said.`,
				applied,
				'text',
				'The sheet, told',
				($) => $.route.sheet.told.said.blocks.main,
			)
				.task(
					'next',
					($: any) =>
						C.joinText.v1({
							items: [applied($), { row: $.route.sheet.told.said.write.messageId }] as any,
							params: slot.params(),
						}),
					{ expose: { label: 'What happens next' } },
				)
				.outlet(
					'nextWrite',
					($: any) =>
						C.createMessage.v1({
							text: $.route.sheet.told.said.next.text,
							channel: $.lane.text,
							speaker: PLANNER as any,
							// What happens next is the table's, not the Planner's reply.
							tableLine: true,
						}),
					{ expose: { label: 'Say: what happens next' } },
				)
		}),
	)
	/** The summary's row: the sheet's changes are filed there (P0-4). */
	const summaryRow = ($: any) => $.route.sheet.told.said.write.messageId
	return told.junction('after', { on: applied }, (j: any) =>
		j
			.when('seat', { path: 'seatName', truthy: true }, (k: any) =>
				seatWrites(k, w, `${P}after.seat.`, applied, 'seatName', 'seatChanges', 'the sheet', 'healthConfig', {
					row: summaryRow,
					kit: 'kit',
					points: 'pointsConfig',
				}),
			)
			.when('rules', { path: 'worldChanges', truthy: true }, (k: any) =>
				writeChanges(k, w, `${P}after.rules.`, 'changes', applied, 'worldChanges', "The world's rules, chosen for you", undefined, summaryRow),
			)
			/**
			 * 🚧 No name came back (walk 2026-10-17): nothing was filed, and the
			 * name is asked again — never a seat called "the Stranger".
			 */
			.when('ask', { path: 'next', truthy: true }, (k: any) =>
				say(
					jsonPart(k, w, `${P}after.ask.`, 'blocks', applied, 'nextBlocks', "The name question's form"),
					w,
					`${P}after.ask.`,
					applied,
					'nextText',
					'The name, asked again',
					($) => $.route.sheet.after.ask.blocks.main,
				),
			)
			.when('world', { path: 'world', truthy: true }, (k: any) =>
				jsonPart(k, w, `${P}after.world.`, 'value', applied, 'world', 'The world, with the hero').outlet(
					'write',
					($: any) =>
						C.setSessionAnnex.v1({ value: { [K.progress]: $.route.sheet.after.world.value.main } as any, params: slot.params() }),
					{ expose: { label: 'Keep the hero' } },
				),
			)
			.when('begin', { path: 'genesisBrief', truthy: true }, (k: any) =>
				genesisChain(textPart(k, w, `${P}after.begin.`, 'brief', applied, 'genesisBrief', 'What the world is for'), w, `${P}after.begin.`, {
					brief: ($) => $.route.sheet.after.begin.brief.text,
					sheet: applied,
					session: ($) => $.input.session,
					state: ($) => $.state.state,
					cast,
					history,
				}),
			)
			/**
			 * 🚧 Their Story composer, closed while their Planner lane waited for
			 * their character (`create.ts`), opens once there is a story to
			 * play in (AUDIT A10: it opened on the sheet, before genesis, and a
			 * guest typed into an empty Story) — this person's when the world
			 * stands; everyone with a finished sheet when this sheet built it,
			 * AFTER genesis above.
			 */
			.when('story', { path: 'openStory', truthy: true }, (k: any) =>
				jsonPart(k, w, `${P}after.story.`, 'people', applied, 'openStory', 'Whose Story opens').each(
					'person',
					{ over: ($: any) => $.route.sheet.after.story.people.main, max: 16 },
					(m: any) =>
						m.outlet(
							'open',
							($: any) =>
								C.setComposerState.v1({
									channel: DUNGEON_CRAWLER_STORY_CHANNEL,
									open: true as any,
									person: at($, `${P}after.story.person.item`),
								}),
							{ expose: { label: 'Open their Story' } },
						),
				),
			)
			/** Made, but no world yet: their Story stays shut, and says why now. */
			.when('waiting', { path: 'waiting', truthy: true }, (k: any) =>
				k.outlet(
					'shut',
					($: any) =>
						C.setComposerState.v1({
							channel: DUNGEON_CRAWLER_STORY_CHANNEL,
							open: false as any,
							reason: DUNGEON_CRAWLER_STORY_WAITING_FOR_WORLD,
							person: $.answer.addressee,
						}),
					{ expose: { label: 'Keep their Story shut until the world is built' } },
				),
			),
	)
}
