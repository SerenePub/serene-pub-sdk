/**
 * 🚧 Dungeon Crawler's **interview** (PLAN-dungeon-crawler-2026-10-14,
 * features 1–3, workflow 2–3): the Planner's questions in each person's lane,
 * answered by pressing.
 */

import {
	compile,
	jsonSchemaOf,
	sheetSchemaKeys,
	slot,
	spec,
	sessionEvents,
	ITEM,
	type AttributeSlotDecl,
	type ChainBuilder,
	type DataRef,
	type JsonSchema,
	type OutPortsOf,
} from '@serene-pub/sdk'
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
import {
	applyWiring,
	chainIf,
	chainOf,
	jsonPart,
	modelCall,
	on,
	readOn,
	scriptStep,
	textPart,
	wiring,
	type BranchOf,
	type Chain,
	type ChainNodes,
	type Plus,
	type ReadOn,
	type Wiring,
} from './calls.js'
import { characterClassSlot, difficultySlot, goalModeSlot, hpSlot } from '../../registry/slots.js'

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
 * 🚧 The sheet's slots as a model writes them (`jsonSchemaOf`, Lair rewrite
 * D1, 2026-10-21): the class, the world's difficulty and its goal mode, each
 * as its slot declares it — read, never typed twice. @internal
 */
const SHEET_SLOTS = { slots: [characterClassSlot, difficultySlot, goalModeSlot].map((d) => ({ id: d.id })) }
const SHEET_SLOT_SCHEMAS = (jsonSchemaOf(SHEET_SLOTS).properties ?? {}) as Readonly<Record<string, JsonSchema & { enum?: readonly string[] }>>
const SHEET_SLOT_KEYS = new Map([...sheetSchemaKeys(SHEET_SLOTS)].map(([key, id]) => [id, key]))

/** One slot's answer, as its declaration says. */
const slotAnswer = (decl: AttributeSlotDecl): JsonSchema & { enum?: readonly string[] } =>
	SHEET_SLOT_SCHEMAS[SHEET_SLOT_KEYS.get(decl.id) ?? ''] ?? { type: 'string' }

/** A slot's answer that may also be left empty, "not asked": its options with `''` first. */
const orEmpty = (answer: JsonSchema & { enum?: readonly string[] }): JsonSchema => ({
	...answer,
	type: 'string',
	enum: ['', ...(answer.enum ?? [])],
})

/**
 * The character sheet the Planner writes (and, on Just play, everything a
 * person may pick). Every member required, empty when not asked — the
 * sheet script reads only what this answer may set. What a character
 * carries is not here: it is the class's starting kit (`kits.ts`), pieces
 * of the rules, never a list of words (2026-10-16); nor are its ability
 * scores and full health, which the kit's class sets too (2026-10-17).
 * `name` is always the character's name — the one chosen, or the
 * Planner's own on Just play; an empty one is asked again. 🚧 The class,
 * the difficulty and the goal mode are their slots' own schemas
 * (`slotAnswer`, 2026-10-21); the name, the backstory and the world's
 * shape are the interview's.
 * @experimental
 */
export const DUNGEON_CRAWLER_SHEET_SCHEMA = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		class: slotAnswer(characterClassSlot),
		backstory: { type: 'string' },
		// The schema says what each may be (AUDIT C7): the sheet script
		// checks them no second time.
		shape: { type: 'string', enum: ['', 'dungeon', 'open-world'] },
		difficulty: orEmpty(slotAnswer(difficultySlot)),
		goalMode: orEmpty(slotAnswer(goalModeSlot)),
	},
	required: ['name', 'class', 'backstory', 'shape', 'difficulty', 'goalMode'],
	additionalProperties: false,
} as const

type Ports<F extends (...args: never[]) => unknown> = OutPortsOf<ReturnType<F>>

/** What the interview's judge hands its junctions (`DUNGEON_CRAWLER_INTERVIEW_SCRIPT`): each part `null` unless the answer needs it. */
interface Planned {
	readonly lane: unknown
	readonly echo: unknown
	readonly note: unknown
	readonly refusal: unknown
	readonly world: unknown
	readonly worldChanges: unknown
	readonly seatName: unknown
	readonly seatChanges: unknown
	readonly retireSeat: unknown
	readonly next: unknown
	readonly nextText: unknown
	readonly nextBlocks: unknown
	readonly classBrief: unknown
	readonly sheetBrief: unknown
}

/** What the sheet script hands its junctions (`DUNGEON_CRAWLER_SHEET_SCRIPT`). */
interface Sheeted {
	readonly text: unknown
	readonly blocks: unknown
	readonly after: unknown
	readonly seatName: unknown
	readonly seatChanges: unknown
	readonly healthConfig: unknown
	readonly pointsConfig: unknown
	/** 🚧 The pool the config bounds, the session's rules' (S4). */
	readonly pointsSlot: unknown
	readonly kit: unknown
	readonly worldChanges: unknown
	readonly next: unknown
	readonly nextText: unknown
	readonly nextBlocks: unknown
	readonly world: unknown
	readonly genesisBrief: unknown
	readonly openStory: unknown
	readonly waiting: unknown
}

/** A member of either answer document — what the shared writes below read by path. */
type Part = keyof Planned | keyof Sheeted

/**
 * Write state changes on chain `c`: `changes` (the part of `from` at
 * `path`), `changesResolved` and `changesApplied`. With `owners`, a change
 * naming no owner is made on each — the player seat `set-seat-name@1`
 * handed over. Mounted on several branches; `from`, `owners` and `row` read
 * by full path.
 */
const writeChanges = <B extends Chain>(
	c: B,
	w: Wiring,
	from: ReadOn<B>,
	path: Part,
	what: string,
	owners?: ReadOn<B>,
	/** 🚧 A row this run wrote: the world's and a card-less seat's changes are filed there (P0-4). */
	row?: ReadOn<B>,
): B => {
	w.params.push([on(c, 'changesApplied'), { mode: 'apply' }])
	jsonPart(chainOf(c), w, 'changes', ($) => from($ as never), path, what)
		.query(
			'changesResolved',
			($) =>
				C.resolveStateChanges.v1({
					changes: $.changes.main,
					...(owners ? { owners: owners($ as never) as any } : {}),
					scope: $.input.sessionScope,
					base: $.state.version,
				}),
			{ expose: { label: `${what}, checked` } },
		)
		.task(
			'changesApplied',
			($) =>
				C.setState.v1({
					changes: $.changesResolved.changes,
					scope: $.input.sessionScope,
					base: $.state.version,
					...(row ? { worldRow: row($ as never) as any } : {}),
					params: slot.params(),
				}),
			{ expose: { label: `${what}, written` } },
		)
	return c
}

/** A Planner line on the person's lane, its text the part of `from` at `path`; `what` heads both steps. */
const say = <B extends Chain>(
	c: B,
	w: Wiring,
	from: ReadOn<B>,
	path: Part,
	what: string,
	blocks?: ReadOn<B>,
): Plus<Plus<B, 'line', Ports<typeof C.joinText.v1>>, 'write', Ports<typeof C.createMessage.v1>> =>
	textPart(chainOf(c), w, 'line', ($) => from($ as never), path, what).outlet(
		'write',
		($) =>
			C.createMessage.v1({
				text: $.line.text,
				channel: $.lane.text,
				speaker: PLANNER as any,
				...(blocks ? { blocks: blocks($ as never) as any } : {}),
			}),
		{ expose: { label: `Say: ${what.toLowerCase()}` } },
	) as never

/**
 * Name the seat, then make `changes`' changes on it; `what` says which answer
 * this is. With `health`, the part of `from` at that path — the seat's hp
 * `{ max }` — is its full health, configured FIRST (`set-stat-config@1`), so
 * the stats after it may fill it. Mounted on two branches; `from` and `row`
 * read by full path, the seat named here by the reference read beside it.
 */
const seatWrites = <B extends Chain>(
	c: B,
	w: Wiring,
	from: ReadOn<B>,
	names: Part,
	changes: Part,
	what: string,
	health?: Part,
	o: {
		/** 🚧 The plan's `retireSeat`: a new character's NEW seat, the fallen's retired (P3-1). */
		retire?: Part
		/** 🚧 The row this run wrote in the person's lane: their stats are filed there (P0-4). */
		row?: ReadOn<B>
		/** 🚧 The kit, its owner the seat named here (P3-7). */
		kit?: Part
		/** 🚧 At a spell-points table, the path of the pool's `{ max }` (Q1-6). */
		points?: Part
	} = {},
): B => {
	const read = ($: unknown) => from($ as never) as DataRef
	const row = ($: unknown) => (o.row ? { worldRow: o.row($ as never) as any } : {})
	const withRetire = chainIf(!!o.retire, chainOf(c), (r) => jsonPart(r, w, 'retire', read, o.retire!, `The seat it replaces (${what})`))
	const named = textPart(withRetire, w, 'name', read, names, `The seat's name (${what})`).outlet(
		'setSeat',
		($) =>
			C.setSeatName.v1({
				user: $.answer.addressee,
				name: $.name.text,
				...(o.retire ? { retire: $.retire.main } : {}),
			}),
		{ expose: { label: `Name the seat (${what})` } },
	)
	/** The seat named here, for the branches below. */
	const seat = readOn(named, ($) => $.setSeat)
	const bounded = chainIf(!!health, named, (n) =>
		n.junction('health', { on: read }, (j) =>
			j.when('set', { path: (v: Planned & Sheeted) => v[health!], truthy: true }, (k) =>
				jsonPart(k, w, 'config', read, health!, `The seat's full health (${what})`).outlet(
					'write',
					($) =>
						C.setStatConfig.v1({
							owner: seat.seat,
							slot: hpSlot.id,
							config: $.config.main,
							// 🚧 Filed at the row the stats are (PLAN-dc-after-walk3
							// R1-4, the walk's NEW-8): filed at the newest row instead,
							// the full health came AFTER the health it bounds, and the
							// creation read "Health 20 → 10", never "Health 10 (full)".
							...row($),
						}),
					{ expose: { label: `Set the seat's full health (${what})` } },
				),
			),
		),
	)
	// 🚧 The spell-point pool's most, the seat's own (Q1-6): configured before
	// the stats, so the pool the stats fill fits under it.
	const pooled = chainIf(!!o.points, bounded, (b) =>
		b.junction('points', { on: read }, (j) =>
			j.when('set', { path: (v: Planned & Sheeted) => v[o.points!], truthy: true }, (k) =>
				textPart(
					jsonPart(k, w, 'config', read, o.points!, `The pool's most (${what})`),
					w,
					'pool',
					read,
					'pointsSlot',
					// 🚧 The session's rules' pool (S4), never a slot the build names.
					`The pool (${what})`,
				).outlet(
					'write',
					($) =>
						C.setStatConfig.v1({
							owner: seat.seat,
							slot: $.pool.text,
							config: $.config.main,
							...row($),
						}),
					{ expose: { label: `Set the pool's most (${what})` } },
				),
			),
		),
	)
	const statted = pooled.junction('stats', { on: read }, (j) =>
		j.when('changed', { path: (v: Planned & Sheeted) => v[changes], truthy: true }, (k) =>
			writeChanges(k, w, read, changes, `The seat's stats (${what})`, () => seat.seats, o.row as ReadOn<typeof k> | undefined),
		),
	)
	/**
	 * 🚧 The class's starting kit (rulesets W3-B): pieces of the rules, applied
	 * by the ruleset handler to the seat named above — its owner filled in
	 * here, so a seat a Just play opened in this same run gets its kit (P3-7,
	 * the walk's B20: it got none).
	 */
	chainIf(!!o.kit, statted, (s) =>
		s.junction('kit', { on: read }, (j) =>
			j.when('given', { path: (v: Planned & Sheeted) => v[o.kit!], truthy: true }, (k) => {
				const owned = scriptStep(jsonPart(k, w, 'kit', read, o.kit!, 'The kit, as the sheet drew it'), w, 'owned', DUNGEON_CRAWLER_SHEET_SCRIPT.seedKey, ($) => ({
					session: $.input.session,
					kit: $.kit.main,
					seat: seat.seat,
				}), 'The kit, on the seat')
				return jsonPart(
					jsonPart(owned, w, 'owners', ($) => $.owned.main, 'owners', 'Whose kit'),
					w,
					'deltas',
					($) => $.owned.main,
					'deltas',
					'The kit',
				).task(
					'apply',
					($) =>
						C.rulesetResolve.v1({
							params: slot.params(),
							owners: $.owners.main,
							deltas: $.deltas.main,
							mode: 'apply',
						}),
					{ expose: { label: 'Hand out the kit' } },
				)
			}),
		),
	)
	return c
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
	const built = interviewSaid(w).junction('route', { on: ($) => $.step.main }, (j) =>
		j
			.when('refused', { path: (v: Planned) => v.refusal, truthy: true }, (c) =>
				say(c, w, ($) => $.step.main, 'refusal', 'The refusal'),
			)
			.when('world', { path: (v: Planned) => v.world, truthy: true }, (c) =>
				jsonPart(c, w, 'value', ($) => $.step.main, 'world', 'The world, as answered').outlet(
					'write',
					($) => C.setSessionAnnex.v1({ value: { [K.progress]: $.value.main } as any, params: slot.params() }),
					{ expose: { label: 'Keep the answer' } },
				),
			)
			.when('rules', { path: (v: Planned) => v.worldChanges, truthy: true }, (c) =>
				writeChanges(c, w, ($) => $.step.main, 'worldChanges', "The world's rules", undefined, ($) => $.said.echo.write.messageId),
			)
			.when('seat', { path: (v: Planned) => v.seatName, truthy: true }, (c) =>
				seatWrites(c, w, ($) => $.step.main, 'seatName', 'seatChanges', 'name or class', undefined, {
					retire: 'retireSeat',
					row: ($) => $.said.echo.write.messageId,
				}),
			)
			.when('ask', { path: (v: Planned) => v.next, truthy: true }, (c) =>
				jsonPart(c, w, 'blocks', ($) => $.step.main, 'nextBlocks', "The next question's form").junction(
					'put',
					{ on: ($) => $.step.main },
					(k) =>
						k.when('question', { path: (v: Planned) => v.nextText, truthy: true }, (q) =>
							say(q, w, ($) => $.step.main, 'nextText', 'The next question', ($) => $.route.ask.blocks.main),
						),
				),
			)
			.when('classes', { path: (v: Planned) => v.classBrief, truthy: true }, (c) =>
				modelCall(textPart(c, w, 'brief', ($) => $.step.main, 'classBrief', 'What the classes are for'), w, 'class', {
					speaker: PLANNER,
					prompt: DUNGEON_CRAWLER_PROMPT_KEYS.classes,
					brief: ($) => $.brief.text,
					cast: ($) => $.cast.cast,
					history: ($) => $.story.messages,
					schema: DUNGEON_CRAWLER_CLASSES_SCHEMA,
					briefTurn: true,
					expose: {
						status: 'The Planner thinks of classes',
						label: 'Offer classes',
						purpose: 'The Planner offers classes that fit the world you chose.',
					},
				})
					.task('choices', ($) =>
						C.makeChoices.v1({
							json: $.classWrite.json,
							fn: 'answer',
							action: DUNGEON_CRAWLER_INTERVIEW_ACTION,
							addressee: $.answer.addressee,
							cast: $.cast.cast,
							referent: DUNGEON_CRAWLER_QUESTIONS.characterClass,
						}),
					)
					.outlet(
						'write',
						($) =>
							C.createMessage.v1({
								text: $.choices.text,
								channel: $.lane.text,
								speaker: PLANNER as any,
								blocks: $.choices.blocks,
							}),
						{ expose: { label: 'Offer the classes' } },
					),
			)
			.when('sheet', { path: (v: Planned) => v.sheetBrief, truthy: true }, (c) => sheetPath(c, w)),
	)
	return compile(
		built
			.defaults((p) => applyWiring(p, w))
			.build(),
	)
}

/** The interview's spine: the press, who is here, the state, the story, the judge and the person's lane. */
const interviewHead = (w: Wiring) => {
	const read = spec(DUNGEON_CRAWLER_INTERVIEW_SPEC_ID, {
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
		.inlet('input', C.userMessage.v1(), { suits: [] })
		.task('answer', ($) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
		.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
		.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
		/** The story's newest rows — the conversation the Planner's calls read (empty before genesis). */
		.query('story', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }))
	w.params.push(['story', { channel: 'main', limit: 8, tableLines: false }]) // 🚧 no roll lines: the table's, never the story's speech
	return textPart(
		scriptStep(read, w, 'step', DUNGEON_CRAWLER_INTERVIEW_SCRIPT.seedKey, ($) => ({
			session: $.input.session,
			referent: $.answer.referent,
			choice: $.answer.choice,
			label: $.answer.label,
			values: $.answer.values,
			addressee: $.answer.addressee,
			state: $.state.state,
			// 🚧 The session's ruleset (S4): the classes its kits name.
			ruleset: $.input.ruleset,
		}), 'Judge the answer'),
		w,
		'lane',
		($) => $.step.main,
		'lane',
		"The person's lane",
	)
}

/**
 * 🚧 The answer, said first on the person's own lane — their words
 * (`echo`, P3-5) and the table's acknowledgement (`note`) — so the
 * changes the answer makes below are filed there, in their lane, and
 * never under another person's row (the 100-turn walk, P0-4).
 */
const interviewSaid = (w: Wiring) =>
	interviewHead(w).junction('said', { on: ($) => $.step.main }, (j) => {
		/**
		 * 🚧 An acknowledgement on the person's lane ("Name: Ann.", "Give me a
		 * moment…") as a **table line** (2026-10-16): no model call wrote it, so it
		 * is faceless and never rerun — a swipe on it asked the Planner to answer
		 * its own line, and the call came back empty.
		 */
		const note = (c: BranchOf<typeof j, 'echo' | 'noted'>, path: Part, what: string, kind?: string) =>
			textPart(c, w, 'line', ($) => $.step.main, path, what).outlet(
				'write',
				($) =>
					C.createMessage.v1({
						text: $.line.text,
						channel: $.lane.text,
						// 🚧 An answer is said for the person who pressed it (`user:<id>`),
						// and is of kind `answer`: the Planner's talk reads it as their
						// line (P3-5). A note is the table's, under the Planner.
						speaker: (kind ? $.answer.addressee : PLANNER) as any,
						tableLine: true,
						...(kind ? { kind: kind as any } : {}),
					}),
				{ expose: { label: `Note: ${what.toLowerCase()}` } },
			)
		return j
			.when('echo', { path: (v: Planned) => v.echo, truthy: true }, (c) => note(c, 'echo', "The player's answer", 'answer'))
			.when('noted', { path: (v: Planned) => v.note, truthy: true }, (c) => note(c, 'note', 'The answer, acknowledged'))
	})

/** The route's sheet branch — `route.sheet`, after the answer is said. @internal */
type SheetOn = ChainBuilder<ChainNodes<ReturnType<typeof interviewSaid>>, 'route.sheet'>

/** The `sheet` branch, to the point it branches on what happens next: the Planner's sheet, applied and told. */
const sheetTold = (c: SheetOn, w: Wiring) => {
	const wrote = modelCall(textPart(c, w, 'brief', ($) => $.step.main, 'sheetBrief', 'What the sheet is for'), w, 'sheet', {
		speaker: PLANNER,
		prompt: DUNGEON_CRAWLER_PROMPT_KEYS.sheet,
		brief: ($) => $.brief.text,
		cast: ($) => $.cast.cast,
		history: ($) => $.story.messages,
		schema: DUNGEON_CRAWLER_SHEET_SCHEMA,
		briefTurn: true,
		expose: {
			status: 'The Planner writes your character sheet',
			label: 'Write the character sheet',
			purpose: "The Planner writes your character's backstory, and the table hands them their class's scores, health and kit — and on Just play, everything else too.",
		},
	})
	const applying = scriptStep(wrote, w, 'apply', DUNGEON_CRAWLER_SHEET_SCRIPT.seedKey, ($) => ({
		session: $.input.session,
		plan: $.step.main,
		json: $.sheetWrite.json,
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
	return applying.junction('told', { on: ($) => $.apply.main }, (j) =>
		j.when('said', { path: (v: Sheeted) => v.text, truthy: true }, (k) => {
			w.params.push([on(k, 'next'), { path: 'after', separator: '' }])
			return say(
				jsonPart(k, w, 'blocks', ($) => $.route.sheet.apply.main, 'blocks', 'The standing order, asked'),
				w,
				($) => $.route.sheet.apply.main,
				'text',
				'The sheet, told',
				($) => $.route.sheet.told.said.blocks.main,
			)
				.task(
					'next',
					($) =>
						C.joinText.v1({
							items: [$.route.sheet.apply.main, { row: $.write.messageId }] as any,
							params: slot.params(),
						}),
					{ expose: { label: 'What happens next' } },
				)
				.outlet(
					'nextWrite',
					($) =>
						C.createMessage.v1({
							text: $.next.text,
							channel: $.lane.text,
							speaker: PLANNER as any,
							// What happens next is the table's, not the Planner's reply.
							tableLine: true,
						}),
					{ expose: { label: 'Say: what happens next' } },
				)
		}),
	)
}

/** Where genesis is mounted — `route.sheet.after.begin` (`genesis.ts`). @internal */
export type BeginOn = ChainBuilder<ChainNodes<ReturnType<typeof sheetTold>>, 'route.sheet.after.begin'>

/** The `sheet` branch: the Planner's sheet, applied, then genesis when it is due. */
const sheetPath = (c: SheetOn, w: Wiring) =>
	sheetTold(c, w).junction('after', { on: ($) => $.route.sheet.apply.main }, (j) =>
		j
			.when('seat', { path: (v: Sheeted) => v.seatName, truthy: true }, (k) =>
				seatWrites(k, w, ($) => $.route.sheet.apply.main, 'seatName', 'seatChanges', 'the sheet', 'healthConfig', {
					/** The summary's row: the sheet's changes are filed there (P0-4). */
					row: ($) => $.route.sheet.told.said.write.messageId,
					kit: 'kit',
					points: 'pointsConfig',
				}),
			)
			.when('rules', { path: (v: Sheeted) => v.worldChanges, truthy: true }, (k) =>
				writeChanges(
					k,
					w,
					($) => $.route.sheet.apply.main,
					'worldChanges',
					"The world's rules, chosen for you",
					undefined,
					($) => $.route.sheet.told.said.write.messageId,
				),
			)
			/**
			 * 🚧 No name came back (walk 2026-10-17): nothing was filed, and the
			 * name is asked again — never a seat called "the Stranger".
			 */
			.when('ask', { path: (v: Sheeted) => v.next, truthy: true }, (k) =>
				say(
					jsonPart(k, w, 'blocks', ($) => $.route.sheet.apply.main, 'nextBlocks', "The name question's form"),
					w,
					($) => $.route.sheet.apply.main,
					'nextText',
					'The name, asked again',
					($) => $.route.sheet.after.ask.blocks.main,
				),
			)
			.when('world', { path: (v: Sheeted) => v.world, truthy: true }, (k) =>
				jsonPart(k, w, 'value', ($) => $.route.sheet.apply.main, 'world', 'The world, with the hero').outlet(
					'write',
					($) => C.setSessionAnnex.v1({ value: { [K.progress]: $.value.main } as any, params: slot.params() }),
					{ expose: { label: 'Keep the hero' } },
				),
			)
			.when('begin', { path: (v: Sheeted) => v.genesisBrief, truthy: true }, (k) => genesisChain(k, w))
			/**
			 * 🚧 Their Story composer, closed while their Planner lane waited for
			 * their character (`create.ts`), opens once there is a story to
			 * play in (AUDIT A10: it opened on the sheet, before genesis, and a
			 * guest typed into an empty Story) — this person's when the world
			 * stands; everyone with a finished sheet when this sheet built it,
			 * AFTER genesis above.
			 */
			.when('story', { path: (v: Sheeted) => v.openStory, truthy: true }, (k) =>
				jsonPart(k, w, 'people', ($) => $.route.sheet.apply.main, 'openStory', 'Whose Story opens').each(
					'person',
					{ over: ($) => $.people.main, max: 16 },
					(m) =>
						m.outlet(
							'open',
							($) =>
								C.setComposerState.v1({
									channel: DUNGEON_CRAWLER_STORY_CHANNEL,
									open: true as any,
									person: $[ITEM],
								}),
							{ expose: { label: 'Open their Story' } },
						),
				),
			)
			/** Made, but no world yet: their Story stays shut, and says why now. */
			.when('waiting', { path: (v: Sheeted) => v.waiting, truthy: true }, (k) =>
				k.outlet(
					'shut',
					($) =>
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
