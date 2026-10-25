/**
 * 🚧 The **Lair**'s reply — `core:spec/lair-reply` (rewritten 2026-10-21,
 * PROPOSAL-lair-rewrite §2, D3–D7): the genre's required `message-respond`
 * pipeline. Was `core:spec/lair-respond`, one graph that planned, voiced,
 * kept the books and rewrote the scratchpad; the books and the scratchpad
 * are routines now (`keeper.ts`, `scratchpad.ts`), and the reply is the plan
 * and the voices.
 *
 * ## One turn
 *
 *  1. **Direction** — the GM's lines (`$.input.text`, labelled by
 *     `playerLabel`): instructions, never a line somebody in the scene said.
 *  2. **The plan** (`planned`) — the Castellan reads the direction, the
 *     Sanctum talk and its scratchpad while *Sanctum talk steers the story*
 *     is on, the party's state and the room they stand in, and answers the
 *     plan (`LAIR_PLAN_SCHEMA`, `jsonSchemaOf` of a declared shape): the
 *     beats, who speaks, **which attempts are risky**, and the knock.
 *  3. **The door** — the rooms layer on (`roomsLayer`), a room the plan walks
 *     into that nothing describes halts the turn: the Oracle asks the GM to
 *     describe it (`knock`), and nothing is played.
 *  4. **Checks** (`play.checks`, the ruleset's layer) — by the table's mode
 *     (`core:script/lair-table`): `ask` — the Oracle posts one **roll form**
 *     per risky attempt, addressed to the GM, and the party's turns wait for
 *     the answers (the roll answer resolves each, `rollAnswer.ts`); `auto` — the
 *     ruleset handler rolls them at once (`core:task/ruleset-resolve@1`,
 *     `apply`) and the Oracle posts the **dice**; `none` — told in words.
 *  5. **The plan row** — the beats in the Sanctum, carrying the turn plan
 *     (`turnPlan`: the plan, the room's passage, `waits` — the delvers people
 *     play — and `rolls`, the roll row the turns wait on). The host prepares
 *     one **character turn** per named AI delver off it; a delver a person
 *     plays waits for their line.
 *  6. **A character turn** (`pick.picked`) — one delver, as themselves, in a
 *     run of their own: their own lore, their own whisper, their own face.
 *
 * **Narrate** (`via: 'narrate'`) is the Castellan narrating once on `main`,
 * whichever composer pressed it; a line on the **Sanctum** is the Castellan
 * talking with the GM there.
 *
 * ## What stays the same
 *
 * The retrieval spine (one gather, the meaning and name arms, the gates and
 * the ranker, the room rule), the Sanctum talk, Narrate, the knock's one
 * option, a prose-described room never knocking (R9), and one live row per
 * execution path (F7).
 * @experimental
 */

import { compile, slot, spec, coreEvents, type ChainBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_LOADOUT } from '../../loadouts.js'
import { LAIR_CASTELLAN_KEY, POST_HISTORY_TOKEN_TRIGGER, SANCTUM_CHANNEL } from '../../registry/genres.js'
import { CASTELLAN_SCRATCHPAD_KEY } from '../../shared/annexField.js'
import { applyWiring, jsonPart, scriptStep, textPart, wiring, type ChainNodes, type Wiring } from '../../shared/calls.js'
import { bareEntryTypeId, locationEntryType } from '../../registry/entries.js'
import { lairRoomAnswerSpec } from './roomAnswer.js'
import { LAIR_ROLL_ANSWER_ACTION, LAIR_ROLL_ANSWER_KEY } from './rollAnswer.js'
import { CASTELLAN, LAIR_PLAN_SCHEMA, ORACLE, type LairFields } from './names.js'
import { LAIR_DICE_SCRIPT, LAIR_TABLE_SCRIPT, LAIR_TURN_SCRIPT } from './scripts.js'

/** @experimental */
export const LAIR_REPLY_SPEC_ID = 'core:spec/lair-reply'
/** @internal */
export const LAIR_REPLY_VERSION = '1.0.0'

/**
 * The knock's one option's key (R9): the knock asks the GM to **describe**
 * the room — *Describe The Drowned Hall…*, the label built from the room's
 * name at run time. Its press opens the collect modal.
 */
const KNOCK_OPTION_KEY = 'describe'

/**
 * How many of the newest rows, across the story and the Sanctum, the knock's
 * prose check reads (R9) — the check's own `window` default.
 */
const EXIT_PROSE_ROWS = 40

/** How many of the story's newest rows the Castellan reads while it talks (R6). */
const SANCTUM_STORY_ROWS = 12

/** **The talk window** (R13): how much unplayed Sanctum talk the planner and the narration read. */
const SANCTUM_TALK_ROWS = 12

/**
 * Where Narrate was pressed, beside the session's fields (`asked`, a
 * `pair@1` whose keys the declared defaults name `channel` and `fields`).
 */
interface NarrateAsked {
	readonly channel: unknown
	readonly fields: LairFields
}

/** What `core:script/lair-turn` answers — the parts a junction reads. */
interface LairTurn {
	readonly askForms: unknown
	readonly autoDeltas: unknown
}

/** The unplayed-talk reads (R13): the planner's, and the narration's two. */
const TALK_READS = [
	'via.turn.channel.story.pick.planned.steer.on.talk',
	'via.narrate.talk.pressed.read',
	'via.narrate.talk.steered.read',
] as const

/** The narration's read when nothing crosses (R13): a window of none. */
const NO_TALK_READ = 'via.narrate.talk.none.read'

/**
 * **The Castellan talks in the Sanctum** (R6): a line on the `sanctum`
 * channel gets one streamed reply there, under the Castellan's name — out of
 * the fiction, with the GM. It reads every room the dungeon holds and the one
 * the party stand in, the state, the Sanctum's own history as the
 * conversation, the story's newest rows as background, and its own
 * scratchpad. Nothing here plans or voices. ⚠ The scratchpad is rewritten
 * after this reply by its own routine (`lair-scratchpad`, on the Sanctum's
 * completed line), no longer inside this run.
 */
const sanctumBranch = (s: ChainBuilder<LairHead, 'via.turn.channel.sanctum'>) =>
	s
		.outlet('placeholder', ($) =>
			C.createMessage.v1({
				generating: true,
				channel: SANCTUM_CHANNEL,
				speaker: CASTELLAN,
				row: $.input.messageId,
			}),
			{ expose: { label: "Open the Castellan's Sanctum reply" } },
		)
		.query('talk', ($) =>
			C.sessionHistory.v1({
				scope: $.input.sessionScope,
				budget: $.contextBudget.available,
				params: slot.params(),
			}),
			{ expose: { label: 'Sanctum talk' } },
		)
		// 🚧 The files the talk shows (PLAN-composer-attachments §3.5).
		.query('talkAttachments', ($) =>
			C.historyAttachments.v1({
				messages: $.via.turn.channel.sanctum.talk.messages,
				params: slot.params(),
			}),
		)
		.query('story', ($) =>
			C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
			{ expose: { label: 'The story so far' } },
		)
		/** Its scratchpad, as text (R13) — the key read off the gathered annex view. */
		.task('pad', ($) =>
			C.joinText.v1({
				items: [$.gather.scratchpad.read.main] as any,
				params: slot.params(),
			}),
			{ expose: { label: 'The scratchpad, as text' } },
		)
		.task('context', ($) =>
			C.buildTemplateContext.v1({
				cast: $.gather.cast.read.cast,
				speaker: CASTELLAN,
				state: $.gather.state.read.state,
				locationEntries: $.gather.rooms.read.entries,
				recentStory: $.via.turn.channel.sanctum.story.messages,
				// Whether this talk steers (R13): `{{sanctumSteers}}`.
				fields: $.input.fields,
				scratchpad: $.via.turn.channel.sanctum.pad.text,
				prompts: slot.prompts({ envoy: LAIR_CASTELLAN_KEY }),
				variables: slot.variables(),
			}),
		)
		.task('lines', ($) =>
			C.processMessages.v1({
				messages: $.via.turn.channel.sanctum.talk.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.turn.channel.sanctum.context.templateContext,
				seedName: $.via.turn.channel.sanctum.context.seedName,
			}),
		)
		// 🚧 This voice's attachments, placed on its own pair (§3.5).
		.task('attached', ($) =>
			C.placeAttachments.v1({
				messages: $.via.turn.channel.sanctum.lines.messages,
				attachments: $.via.turn.channel.sanctum.talkAttachments.attachments,
				connection: slot.connectionOf('via.turn.channel.sanctum.say'),
				params: slot.params(),
			}),
		)
		.task('prompt', ($) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				groups: $.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.turn.channel.sanctum.attached.messages,
				templateContext: $.via.turn.channel.sanctum.context.templateContext,
				template: slot.template(),
				prompts: slot.prompts($.context),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf('via.turn.channel.sanctum.say'),
			}),
		)
		/** This execution path's one streaming step. */
		.oracle(
			'say',
			($) =>
				C.generateText.v1({
					context: $.via.turn.channel.sanctum.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
					// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
					speechSampling: slot.speechSampling(),
				}),
			{
				expose: {
					stream: true,
					status: 'Considering',
					label: 'Castellan in the Sanctum',
					purpose: 'The Castellan answers you in the Sanctum, as itself. Its instructions are its own; edit them here.',
				},
			},
		)
		.outlet('save', ($) =>
			C.updateMessage.v1({
				target: $.via.turn.channel.sanctum.placeholder.messageId,
				text: $.via.turn.channel.sanctum.say.text,
				reasoning: $.via.turn.channel.sanctum.say.reasoning,
			}),
			{ expose: { label: "Fill the Castellan's Sanctum reply" } },
		)

/**
 * **The Castellan narrates** (R8): the `core#narrate` turn control, fired
 * from either composer (`via: 'narrate'`). What the dungeon does next, in the
 * third person, on `main`. No plan and no voices: the party answer on the
 * next turn; the books are the keeper routine's after the round.
 *
 * **The unplayed talk** (R13): read when Narrate was pressed in the Sanctum,
 * or while *Sanctum talk steers the story* is on; otherwise a window of none.
 */
const narrateBranch = (n: ChainBuilder<LairHead, 'via.narrate'>) =>
	n
		.outlet('placeholder', ($) =>
			C.createMessage.v1({
				generating: true,
				channel: 'main',
				speaker: CASTELLAN,
				row: $.input.messageId,
			}),
			{ expose: { label: 'Open the narration' } },
		)
		/** Where Narrate was pressed, beside the session's fields — one document to route on. */
		.task('asked', ($) =>
			C.pair.v1({
				first: $.input.channel,
				second: $.input.fields,
				params: slot.params(),
			}),
		)
		.junction('talk', { on: ($) => $.via.narrate.asked.main }, (j) =>
			j
				.when('pressed', { path: (v: NarrateAsked) => v.channel, equals: SANCTUM_CHANNEL }, (c) =>
					c.query('read', ($) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
						{ expose: { label: 'Sanctum talk, Narrate pressed there' } },
					),
				)
				.when('steered', { path: (v: NarrateAsked) => v.fields.sanctumSteers, truthy: true }, (c) =>
					c.query('read', ($) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
						{ expose: { label: 'Sanctum talk, while it steers the story' } },
					),
				)
				/** Neither: the same read with a window of none, so the junction always hands one on. */
				.otherwise('none', (c) =>
					c.query('read', ($) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
						{ expose: { label: 'Sanctum talk, none crossing' } },
					),
				),
		)
		.task('context', ($) =>
			C.buildSceneContext.v1({
				cast: $.gather.cast.read.cast,
				state: $.gather.state.read.state,
				fields: $.input.fields,
				locationEntries: $.gather.rooms.read.entries,
				sideTalk: $.via.narrate.talk.messages,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
		)
		.task('lines', ($) =>
			C.processMessages.v1({
				messages: $.gather.history.read.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.narrate.context.templateContext,
				seedName: $.via.narrate.context.seedName,
			}),
		)
		// 🚧 This voice's attachments, placed on its own pair (§3.5).
		.task('attached', ($) =>
			C.placeAttachments.v1({
				messages: $.via.narrate.lines.messages,
				attachments: $.gather.history.attachments.attachments,
				connection: slot.connectionOf('via.narrate.say'),
				params: slot.params(),
			}),
		)
		.task('prompt', ($) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				groups: $.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.narrate.attached.messages,
				templateContext: $.via.narrate.context.templateContext,
				template: slot.template(),
				prompts: slot.prompts($.context),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf('via.narrate.say'),
			}),
		)
		.oracle(
			'say',
			($) =>
				C.generateText.v1({
					context: $.via.narrate.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
					// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
					speechSampling: slot.speechSampling(),
				}),
			{
				expose: {
					stream: true,
					status: 'The Castellan narrates',
					label: "Castellan's narration",
					purpose: 'When you press Narrate, the Castellan describes the scene in its own voice.',
				},
			},
		)
		/** The narration, and its reasoning folded as the row's Reasoning. */
		.outlet('save', ($) =>
			C.updateMessage.v1({
				target: $.via.narrate.placeholder.messageId,
				text: $.via.narrate.say.text,
				reasoning: $.via.narrate.say.reasoning,
			}),
			{ expose: { label: 'Fill the narration' } },
		)

/**
 * **A character turn** (owner ruling 2026-09-30, kept): ONE delver, as
 * themselves, in a run of their own — fired with that delver as its subject
 * (`input.characterId`): by the turn order off the standing plan
 * (`via: 'plan'`), by Pick who speaks, or by a regenerate or swipe of their
 * row. One settings group, **Character turn**, whoever the delver is.
 *
 * It reads the standing plan (where the scene is, and the prose describing a
 * room nobody filed), streams the delver's line into their own row, reads
 * only this delver's own private lore and the state as their voice hears it
 * (their whisper alone), and chooses their face. ⚠ It keeps no books (D7):
 * the keeper routine reads the round's lines after it.
 */
const voiceBranch = (t: ChainBuilder<LairHead, 'via.turn.channel.story.pick.picked'>) =>
	t
		/** The plan this turn plays from — absent when none stands. */
		.query('plan', ($) =>
			C.turnPlan.v1({
				scope: $.input.sessionScope,
				messageId: $.input.messageId,
			}),
			{ expose: { label: 'The standing plan' } },
		)
		.task('context', ($) =>
			C.buildSideCharacterContext.v1({
				cast: $.gather.cast.read.cast,
				sideCharacter: { characterId: $.input.characterId } as any,
				state: $.gather.state.read.state,
				plan: $.via.turn.channel.story.pick.picked.plan.plan,
				locationEntries: $.gather.rooms.read.entries,
				// A room described only in prose (R9): its paragraph.
				locationPassage: $.via.turn.channel.story.pick.picked.plan.locationPassage,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
		)
		/** The delver's own row — re-voiced on a regenerate or swipe (`row`). */
		.outlet('placeholder', ($) =>
			C.createMessage.v1({
				generating: true,
				channel: 'main',
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				row: $.input.messageId,
			}),
			{ expose: { label: "Open the delver's line" } },
		)
		/** This delver's own private lore, and nobody else's (W1). */
		.query('lore', ($) =>
			C.characterLore.v1({
				scope: $.input.sessionScope,
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				params: slot.params($.gather.worldLore.read),
			}),
			{ expose: { label: "Character lore, the delver's own" } },
		)
		/** **This delver's own arms** (R3) — meaning and name, with the delver as `speaker`. */
		.query('search', ($) =>
			C.vectorSearch.v1({
				scope: $.input.sessionScope,
				vectors: $.semantic.arm.embed.vectors,
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				params: slot.params(),
			}),
			{ expose: { label: "Semantic search, the delver's own" } },
		)
		.query('entities', ($) =>
			C.entitySearch.v1({
				scope: $.input.sessionScope,
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				params: slot.params(),
			}),
			{ expose: { label: "Entity search, the delver's own" } },
		)
		.task('pool', ($) =>
			C.concatCandidates.v1({
				sources: [
					$.gather.history.read.band,
					$.gather.worldLore.read.main,
					$.gather.historyEntries.read.main,
					$.via.turn.channel.story.pick.picked.lore.main,
					$.via.turn.channel.story.pick.picked.entities.main,
					$.via.turn.channel.story.pick.picked.search.main,
				] as any,
			}),
		)
		/** The turn's descriptions, linked against what this delver may read. */
		.query('link', ($) =>
			C.entityLink.v1({
				scope: $.input.sessionScope,
				candidates: $.via.turn.channel.story.pick.picked.pool.candidates,
				mentions: $.names.arm.mentions.mentions,
				vectors: $.names.arm.embed.vectors,
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				params: slot.params(),
			}),
			{ expose: { label: "Entries called by a description, the delver's own" } },
		)
		.task('poolLinked', ($) =>
			C.concatCandidates.v1({
				sources: [$.via.turn.channel.story.pick.picked.link.main, $.via.turn.channel.story.pick.picked.pool.candidates] as any,
			}),
		)
		/** The hard gates for this delver (C2): exclusions, secrecy, presence. */
		.task('eligible', ($) =>
			C.eligibility.v1({
				candidates: $.via.turn.channel.story.pick.picked.poolLinked.candidates,
				exclusions: [
					$.gather.worldLore.read.exclusions,
					$.gather.historyEntries.read.exclusions,
					$.via.turn.channel.story.pick.picked.lore.exclusions,
				] as any,
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				presences: $.gather.presences.read.main,
				at: $.gather.presences.read.at,
			}),
		)
		.task('rank', ($) =>
			C.rankHybrid.v1({
				candidates: $.via.turn.channel.story.pick.picked.eligible.candidates,
				budget: $.contextBudget.available,
				shownElsewhere: $.place.entryId,
				params: slot.params(),
			}),
			{ expose: { label: "Rank hybrid, the delver's own" } },
		)
		.task('lines', ($) =>
			C.processMessages.v1({
				messages: $.gather.history.read.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.turn.channel.story.pick.picked.context.templateContext,
				seedName: $.via.turn.channel.story.pick.picked.context.seedName,
			}),
		)
		// 🚧 This voice's attachments, placed on its own pair (§3.5).
		.task('attached', ($) =>
			C.placeAttachments.v1({
				messages: $.via.turn.channel.story.pick.picked.lines.messages,
				attachments: $.gather.history.attachments.attachments,
				connection: slot.connectionOf('via.turn.channel.story.pick.picked.say'),
				params: slot.params(),
			}),
		)
		.task('prompt', ($) =>
			C.assemble.v2({
				candidates: $.via.turn.channel.story.pick.picked.rank.candidates,
				decisions: $.via.turn.channel.story.pick.picked.rank.decisions,
				groups: $.via.turn.channel.story.pick.picked.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.turn.channel.story.pick.picked.attached.messages,
				templateContext: $.via.turn.channel.story.pick.picked.context.templateContext,
				template: slot.template(),
				prompts: slot.prompts($.context),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf('via.turn.channel.story.pick.picked.say'),
			}),
		)
		/** This execution path's one streaming step: the delver's line. */
		.oracle(
			'say',
			($) =>
				C.generateText.v1({
					context: $.via.turn.channel.story.pick.picked.prompt.context,
					// Whose line this is (lair fix 2): the host leaves the
					// speaker's own label off the stop list and stops on
					// everyone else's — the party's, the player label's and
					// the envoys' — as Story's reply does.
					currentCharacterId: $.input.characterId,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
					// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
					speechSampling: slot.speechSampling(),
				}),
			{
				expose: {
					stream: true,
					status: 'Taking a character turn',
					label: 'Character turn',
					purpose:
						'Every delver the Castellan plans to speak takes a turn of their own, one after another: as themselves, knowing only what they know. Pick who speaks gives the delver you pick the same turn. A delver a person plays is never voiced here: their turn waits for them.',
				},
			},
		)
		.outlet('save', ($) =>
			C.updateMessage.v1({
				target: $.via.turn.channel.story.pick.picked.placeholder.messageId,
				text: $.via.turn.channel.story.pick.picked.say.text,
				reasoning: $.via.turn.channel.story.pick.picked.say.reasoning,
			}),
			{ expose: { label: "Fill the delver's line" } },
		)
		/** The sprite picker (DESIGN-sprites §5), handed the delver's line and the delver. */
		.oracle(
			'spritePick',
			($) =>
				C.pickSprite.v1({
					text: $.via.turn.channel.story.pick.picked.say.text,
					speaker: $.via.turn.channel.story.pick.picked.context.speaker,
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			{ expose: { session: true, status: 'Choosing a sprite', label: "Choose the delver's sprite" } },
		)
		.outlet('spriteShow', ($) =>
			C.showSprite.v1({
				target: $.via.turn.channel.story.pick.picked.save.messageId,
				pick: $.via.turn.channel.story.pick.picked.spritePick.main,
				source: 'picker',
			}),
			{ expose: { label: "Show the delver's sprite" } },
		)

/**
 * **The plan** (`pick.planned`): the Castellan reads the direction, the
 * Sanctum talk and its scratchpad (while *Sanctum talk steers the story*),
 * what this table rolls (`table`, `core:script/lair-table`: the checks and
 * difficulties, the delvers people play), the rooms and the state, and
 * answers the plan. With the rooms layer on (`rooms.on`), the room it walks
 * into is checked against the book and recent prose (R7, R9): a room nothing
 * describes is `undescribed`, and the door knocks.
 */
const plannedHead = (c: ChainBuilder<LairHead, 'via.turn.channel.story.pick.planned'>, w: Wiring) => {
	const steered = c
		/**
		 * **Sanctum talk steers the story** (R13): while the switch is on, the
		 * planner reads the talk since the story's last line (`unplayedOnly`)
		 * and the Castellan's scratchpad. Off, neither.
		 */
		.junction('steer', { on: ($) => $.input.fields }, (j) =>
			j.when('on', { path: (v: LairFields) => v.sanctumSteers, truthy: true }, (on) =>
				on
					.query('talk', ($) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
						{ expose: { label: 'Sanctum talk, for the planner' } },
					)
					.task('pad', ($) =>
						C.joinText.v1({
							items: [$.gather.scratchpad.read.main] as any,
							params: slot.params(),
						}),
						{ expose: { label: 'The scratchpad, for the planner' } },
					),
			),
		)
	/** What this table rolls, and who of the party a person plays (`core:script/lair-table`). */
	const tabled = jsonPart(
		scriptStep(
			steered,
			w,
			'table',
			LAIR_TABLE_SCRIPT.seedKey,
			($) => ({ ruleset: $.input.ruleset, session: $.input.session }),
			'What this table rolls',
			'The Castellan is planning the turn',
		),
		w,
		'tableFields',
		($) => $.via.turn.channel.story.pick.planned.table.main,
		'fields',
		"The planner's fields",
	)
	return tabled
		.task('planContext', ($) =>
			C.buildPlannerContext.v1({
				cast: $.gather.cast.read.cast,
				state: $.gather.state.read.state,
				// The genre's fields, and the table's named variables beside them
				// (`{{checks}}`, `{{bands}}`, `{{players}}`, `{{roomsLayer}}`).
				fields: $.via.turn.channel.story.pick.planned.tableFields.main,
				// What the GM wrote, as direction (B11) — never a line.
				turnDirection: $.input.text,
				locationEntries: $.gather.rooms.read.entries,
				sideTalk: $.via.turn.channel.story.pick.planned.steer.on.talk.messages,
				scratchpad: $.via.turn.channel.story.pick.planned.steer.on.pad.text,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
		)
		/** Prose, and no turn to continue. */
		.task('lines', ($) =>
			C.proseTranscript.v1({
				messages: $.gather.history.read.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.turn.channel.story.pick.planned.planContext.templateContext,
			}),
		)
		.task('planPrompt', ($) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				groups: $.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.turn.channel.story.pick.planned.lines.messages,
				templateContext: $.via.turn.channel.story.pick.planned.planContext.templateContext,
				template: slot.template(),
				prompts: slot.prompts($.planContext),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf('via.turn.channel.story.pick.planned.planWrite'),
			}),
		)
		.oracle(
			'planWrite',
			($) =>
				C.generateJson.v1({
					context: $.via.turn.channel.story.pick.planned.planPrompt.context,
					schema: LAIR_PLAN_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
			{
				expose: {
					status: 'The Castellan is planning the turn',
					label: 'Planner',
					purpose:
						"The Castellan plans the party's turn: the beats, who speaks, which attempts are risky, where the party are heading. It writes no prose, so a small, fast model is enough.",
				},
			},
		)
		/**
		 * **The rooms layer** (`roomsLayer`, R10): on, the room the plan walks
		 * into is checked; off (*Words only*), nothing knocks.
		 */
		.junction('rooms', { on: ($) => $.input.fields }, (j) =>
			j.when('on', { path: (v: LairFields) => v.roomsLayer, truthy: true }, (on) =>
				on
					/** The room the planner says nobody built, at `unknownExit`. */
					.task('exit', ($) =>
						C.parseJson.v1({
							text: $.via.turn.channel.story.pick.planned.planWrite.text,
							params: slot.params(),
						}),
						{ expose: { label: 'Read the unknown exit' } },
					)
					/**
					 * The prose a room may be described in (R9): the newest rows
					 * of every channel, talk only off `main` (`talkOnly`).
					 */
					.query('exitProse', ($) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
						{ expose: { label: 'Recent prose, every channel' } },
					)
					/** … kept only when nothing already describes it (B13; R7; R9). */
					.task('exitCheck', ($) =>
						C.undescribedName.v1({
							name: $.via.turn.channel.story.pick.planned.rooms.on.exit.value,
							locationEntries: $.gather.rooms.read.entries,
							entries: $.gather.lorebook.read.entries,
							messages: $.via.turn.channel.story.pick.planned.rooms.on.exitProse.messages,
							params: slot.params(),
						}),
					),
			),
		)
}

/** The plan's nodes — what the knock and the play read. */
type Planned = ChainNodes<ReturnType<typeof plannedHead>>

/**
 * **The knock** (B13; R9; D4): the plan walks the party into a room nothing
 * describes, so the **Oracle** asks the GM to describe it instead of
 * playing. One complete question row on `main` carrying a `choices` block
 * **addressed to the owner** with one option — *Describe <room>…* — that
 * fires *Answer the door* (`lair-room-answer`). Nothing else is written: no
 * plan row, no rolls, no voices.
 */
const knockBranch = (c: ChainBuilder<Planned, 'via.turn.channel.story.pick.planned.door.knock'>) =>
	c
		/** The planner's own document, read again: a reference carries no sub-path. */
		.task('question', ($) =>
			C.parseJson.v1({
				text: $.via.turn.channel.story.pick.planned.planWrite.text,
				params: slot.params(),
			}),
			{ expose: { label: 'Read the knock question' } },
		)
		/** The one option's label, *Describe The Drowned Hall…* (R9). */
		.task('named', ($) =>
			C.joinText.v1({
				items: [$.via.turn.channel.story.pick.planned.rooms.on.exitCheck.undescribed, '…'] as any,
				params: slot.params(),
			}),
			{ expose: { label: 'Name the room' } },
		)
		.task('describeLabel', ($) =>
			C.joinText.v1({
				items: ['Describe', $.via.turn.channel.story.pick.planned.door.knock.named.text] as any,
				params: slot.params(),
			}),
			{ expose: { label: 'Label the option' } },
		)
		/** Where the planner says the party stand (A27) — the block's `vantage`. */
		.task('vantage', ($) =>
			C.parseJson.v1({
				text: $.via.turn.channel.story.pick.planned.planWrite.text,
				params: slot.params(),
			}),
			{ expose: { label: 'Read where the party stand' } },
		)
		/**
		 * The question as a `choices` block **addressed to the owner** (R-15
		 * *Forms*): who may press, and what lets its option name a `world`
		 * action at all (L1).
		 */
		.task('choices', ($) =>
			C.makeChoices.v1({
				json: {
					question: $.via.turn.channel.story.pick.planned.door.knock.question.value,
					options: [
						{
							key: KNOCK_OPTION_KEY,
							label: $.via.turn.channel.story.pick.planned.door.knock.describeLabel.text,
						},
					],
				} as any,
				fn: 'room',
				action: lairRoomAnswerSpec().actions.room.identity,
				addressee: 'owner',
				cast: $.gather.cast.read.cast,
				referent: $.via.turn.channel.story.pick.planned.rooms.on.exitCheck.undescribed,
				vantage: $.via.turn.channel.story.pick.planned.door.knock.vantage.value,
			}),
		)
		/** The question's row — this path's live row, never streamed: the Oracle's (D4). */
		.outlet('placeholder', ($) =>
			C.createMessage.v1({
				generating: true,
				channel: 'main',
				speaker: ORACLE,
				row: $.input.messageId,
			}),
			{ expose: { label: 'Open the knock question' } },
		)
		.outlet('save', ($) =>
			C.updateMessage.v1({
				target: $.via.turn.channel.story.pick.planned.door.knock.placeholder.messageId,
				text: $.via.turn.channel.story.pick.planned.door.knock.choices.text,
				blocks: $.via.turn.channel.story.pick.planned.door.knock.choices.blocks,
			}),
			{ expose: { label: 'Fill the knock question' } },
		)

/**
 * **The play** (`door.play`): the plan made into the turn
 * (`core:script/lair-turn`), the checks the table's mode calls for, then the
 * plan row in the Sanctum carrying the turns it hands on.
 */
const playBranch = (c: ChainBuilder<Planned, 'via.turn.channel.story.pick.planned.door.play'>, w: Wiring) => {
	const turned = textPart(
		scriptStep(
			c,
			w,
			'turn',
			LAIR_TURN_SCRIPT.seedKey,
			($) => ({
				plan: $.via.turn.channel.story.pick.planned.planWrite.json,
				table: $.via.turn.channel.story.pick.planned.table.main,
				session: $.input.session,
				ruleset: $.input.ruleset,
				action: { id: LAIR_ROLL_ANSWER_ACTION, fn: LAIR_ROLL_ANSWER_KEY },
			}),
			'The plan, made into the turn',
		),
		w,
		'beats',
		($) => $.via.turn.channel.story.pick.planned.door.play.turn.main,
		'beats',
		'The beats, as a list',
	)
	/** The plan as the turn plays it — its speakers filled when the planner named nobody (lair fix 2). */
	const played = jsonPart(
		turned,
		w,
		'played',
		($) => $.via.turn.channel.story.pick.planned.door.play.turn.main,
		'plan',
		'The plan, as the turn plays it',
	)
	const made = jsonPart(
		played,
		w,
		'waits',
		($) => $.via.turn.channel.story.pick.planned.door.play.turn.main,
		'waits',
		'Who the turn waits for',
	)
	return (
		made
			/**
			 * **The checks** (D3): the ruleset's layer, by the table's mode.
			 * `asked` — one roll form per risky attempt, under the Oracle on
			 * `main`, addressed to the GM; the turns wait on this row (`rolls`).
			 * `rolled` — the ruleset handler rolls each at once and the Oracle
			 * posts the dice. Neither: nothing is rolled, and the voices tell it.
			 */
			.junction('checks', { on: ($) => $.via.turn.channel.story.pick.planned.door.play.turn.main }, (j) =>
				j
					.when('asked', { path: (v: LairTurn) => v.askForms, truthy: true }, (a) =>
						jsonPart(
							textPart(a, w, 'said', ($) => $.via.turn.channel.story.pick.planned.door.play.turn.main, 'askText', 'The Oracle asks'),
							w,
							'forms',
							($) => $.via.turn.channel.story.pick.planned.door.play.turn.main,
							'askForms',
							'The roll forms',
						).outlet(
							'write',
							($) =>
								C.createMessage.v1({
									text: $.via.turn.channel.story.pick.planned.door.play.checks.asked.said.text,
									channel: 'main',
									speaker: ORACLE,
									blocks: $.via.turn.channel.story.pick.planned.door.play.checks.asked.forms.main,
								}),
							{ expose: { label: 'Ask the Dungeon Master to call the rolls' } },
						),
					)
					.when('rolled', { path: (v: LairTurn) => v.autoDeltas, truthy: true }, (r) => {
						const read = jsonPart(
							jsonPart(r, w, 'deltas', ($) => $.via.turn.channel.story.pick.planned.door.play.turn.main, 'autoDeltas', 'The checks to roll'),
							w,
							'owners',
							($) => $.via.turn.channel.story.pick.planned.door.play.turn.main,
							'autoOwners',
							'Who rolls',
						).task(
							'apply',
							($) =>
								C.rulesetResolve.v1({
									params: slot.params(),
									scope: $.input.sessionScope,
									owners: $.via.turn.channel.story.pick.planned.door.play.checks.rolled.owners.main,
									deltas: $.via.turn.channel.story.pick.planned.door.play.checks.rolled.deltas.main,
									mode: 'apply',
								}),
							{ expose: { label: 'Roll the checks', status: 'Deciding the checks' } },
						)
						const diced = scriptStep(
							read,
							w,
							'dice',
							LAIR_DICE_SCRIPT.seedKey,
							($) => ({
								outcomes: $.via.turn.channel.story.pick.planned.door.play.checks.rolled.apply.outcomes,
								explain: $.via.turn.channel.story.pick.planned.door.play.checks.rolled.apply.explain,
								ruleset: $.input.ruleset,
								session: $.input.session,
							}),
							'The dice, as blocks',
						)
						return jsonPart(
							textPart(diced, w, 'said', ($) => $.via.turn.channel.story.pick.planned.door.play.checks.rolled.dice.main, 'text', 'The dice, in words'),
							w,
							'blocks',
							($) => $.via.turn.channel.story.pick.planned.door.play.checks.rolled.dice.main,
							'blocks',
							'The dice blocks',
						).junction('shown', { on: ($) => $.via.turn.channel.story.pick.planned.door.play.checks.rolled.blocks.main }, (s) =>
							s.when('some', { truthy: true }, (k) =>
								k.outlet(
									'write',
									($) =>
										C.createMessage.v1({
											text: $.via.turn.channel.story.pick.planned.door.play.checks.rolled.said.text,
											channel: 'main',
											speaker: ORACLE,
											blocks: $.via.turn.channel.story.pick.planned.door.play.checks.rolled.blocks.main,
										}),
									{ expose: { label: 'Show the outcomes' } },
								),
							),
						)
					}),
			)
			/**
			 * **The plan row, in the Sanctum** — complete, never streamed: the
			 * beats as its body, and the **turn plan** it hands on — the plan
			 * (whose `speakers` the host resolves to character turns), the
			 * prose describing the room ahead, who the turn waits for, and the
			 * roll row the turns wait on while its forms are open. A plan with
			 * no beats posts nothing, and so plans no turns.
			 */
			.junction('plan', { on: ($) => $.via.turn.channel.story.pick.planned.door.play.beats.text }, (j) =>
				j.when('posted', { truthy: true }, (p) =>
					p.outlet(
						'write',
						($) =>
							C.createMessage.v1({
								text: $.via.turn.channel.story.pick.planned.door.play.beats.text,
								channel: SANCTUM_CHANNEL,
								speaker: CASTELLAN,
								turnPlan: {
									// The plan as the turn plays it (lair fix 2): the
									// planner's, its speakers filled when it named
									// nobody in the party (`core:script/lair-turn`).
									plan: $.via.turn.channel.story.pick.planned.door.play.played.main,
									locationPassage: $.via.turn.channel.story.pick.planned.rooms.on.exitCheck.passage,
									waits: $.via.turn.channel.story.pick.planned.door.play.waits.main,
									rolls: $.via.turn.channel.story.pick.planned.door.play.checks.asked.write.messageId,
								} as any,
							}),
						{ expose: { label: 'Post the plan in the Sanctum' } },
					),
				),
			)
	)
}

/**
 * The story's turn (the `otherwise` of the Sanctum). **Who** first
 * (`pick`): a run whose subject is a delver — Pick who speaks, a planned
 * character turn, a re-voice — is that delver's turn; any other is the
 * Castellan's plan. Then, planned, **the knock or the play** (`door`): the
 * knock is the `when`, because the halt is the exceptional case.
 */
const storyBranch = (st: ChainBuilder<LairHead, 'via.turn.channel.story'>, w: Wiring) =>
	st.junction('pick', { on: ($) => $.input.characterId }, (who) =>
		who
			.when('picked', { truthy: true }, (d) => voiceBranch(d))
			.otherwise('planned', (c) =>
				plannedHead(c, w).junction(
					'door',
					{ on: ($) => $.via.turn.channel.story.pick.planned.rooms.on.exitCheck.undescribed },
					(r) => r.when('knock', { truthy: true }, (k) => knockBranch(k)).otherwise('play', (p) => playBranch(p, w)),
				),
			),
	)

/** The spine up to the ranker: the inlet, the window, the shared reads, the hard gates and the rank. */
const lairHead = () =>
	spec(LAIR_REPLY_SPEC_ID, {
		version: LAIR_REPLY_VERSION,
		taxonomy: { role: 'primary' },
	})
		.inlet('input', C.userMessage.v1(), { suits: [coreEvents.messageRespond] })
		/**
		 * The window, taken from the step whose prose a person waits on — a
		 * character turn's line. A config reference is resolved by node key and
		 * creates no edge. Before the reads: the history read is sized by it.
		 */
		.task('contextBudget', ($) =>
			C.contextBudget.v1({
				sampling: slot.samplingOf('via.turn.channel.story.pick.picked.say'),
				connection: slot.connectionOf('via.turn.channel.story.pick.picked.say'),
				params: slot.params(),
			}),
		)
		/** One retrieval pass, shared by every agent below. */
		.gather('gather', { mode: 'parallel' }, (b) =>
			b
				.chain('history', (c) =>
					c
						.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								budget: $.contextBudget.available,
								params: slot.params(),
							}),
						)
						// 🚧 The files those rows show (§3.5), read once for every voice that places them.
						.query('attachments', ($) =>
							C.historyAttachments.v1({
								messages: $.gather.history.read.messages,
								params: slot.params(),
							}),
						),
				)
				.chain('worldLore', (c) =>
					c.query('read', ($) =>
						C.worldLore.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				)
				.chain('characterLore', (c) =>
					c.query('read', ($) =>
						C.characterLore.v1({
							scope: $.input.sessionScope,
							params: slot.params($.gather.worldLore.read),
						}),
					),
				)
				.chain('historyEntries', (c) =>
					c.query('read', ($) =>
						C.historyEntries.v1({
							scope: $.input.sessionScope,
							params: slot.params($.gather.worldLore.read),
						}),
					),
				)
				.chain('cast', (c) => c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })))
				/**
				 * Every room the dungeon holds, by listing (B13), each with its
				 * ways out said from it (B6, `withLinks`): `{{locationEntry}}`'s
				 * "From here:" block.
				 */
				.chain('rooms', (c) =>
					c.query('read', ($) =>
						C.lorebookEntries.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
						{ expose: { label: 'Rooms' } },
					),
				)
				/** The whole book, any entry type (R7): a room is described when ANY entry answers to its name. */
				.chain('lorebook', (c) =>
					c.query('read', ($) =>
						C.lorebookEntries.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				)
				/** The party's sheets, the world — and the GM's two tools: `direction` and each delver's `whisper`. */
				.chain('state', (c) => c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })))
				/** The Castellan's own view of the annex (R13): its scratchpad, for its steps alone. */
				.chain('scratchpad', (c) =>
					c.query('read', ($) =>
						C.sessionAnnex.v1({
							scope: $.input.sessionScope,
							view: 'ai',
							speaker: CASTELLAN,
							params: slot.params(),
						}),
					),
				)
				/** **The entity mechanism** (R3) — the Castellan's read; a delver's turn runs its own. */
				.chain('entities', (c) =>
					c.query('read', ($) =>
						C.entitySearch.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				)
				/** Who is in the world at the session's moment (R4), for `eligible`. */
				.chain('presences', (c) => c.query('read', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))),
		)
		/** **Retrieval by meaning** (R3): one embed per turn. */
		.gather('semantic', { mode: 'parallel' }, (b) =>
			b.chain('arm', (c) =>
				c
					.task('queries', ($) =>
						C.queryWindows.v1({
							messages: $.gather.history.read.messages,
							cast: $.gather.cast.read.cast,
							connection: slot.connection(),
							params: slot.params(),
						}),
					)
					.oracle(
						'embed',
						($) =>
							C.embedText.v1({
								texts: $.semantic.arm.queries.current,
								params: slot.params(),
							}),
						{ expose: { label: 'Embed the recent messages', status: 'Searching by meaning' } },
					)
					.query('search', ($) =>
						C.vectorSearch.v1({
							scope: $.input.sessionScope,
							vectors: $.semantic.arm.embed.vectors,
							params: slot.params(),
						}),
					),
			),
		)
		.task('lore', ($) =>
			C.concatCandidates.v1({
				sources: [
					$.gather.history.read.band,
					$.gather.worldLore.read.main,
					$.gather.characterLore.read.main,
					$.gather.historyEntries.read.main,
					$.gather.entities.read.main,
					$.semantic.arm.search.main,
				] as any,
			}),
		)
		/** **Retrieval by description** (R3) — it only reorders. */
		.gather('names', { mode: 'parallel' }, (b) =>
			b.chain('arm', (c) =>
				c
					.query('mentions', ($) =>
						C.mentionSpans.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					)
					.oracle(
						'embed',
						($) =>
							C.embedText.v1({
								texts: $.names.arm.mentions.texts,
								params: slot.params($.semantic.arm.embed),
							}),
						{ expose: { label: 'Embed the mentions', status: 'Searching by name' } },
					)
					.query('link', ($) =>
						C.entityLink.v1({
							scope: $.input.sessionScope,
							candidates: $.lore.candidates,
							mentions: $.names.arm.mentions.mentions,
							vectors: $.names.arm.embed.vectors,
							params: slot.params(),
						}),
					),
			),
		)
		.task('loreLinked', ($) =>
			C.concatCandidates.v1({
				sources: [$.names.arm.link.main, $.lore.candidates] as any,
			}),
		)
		/** **The room the place slot shows** (the room rule): every ranker leaves it out of the lore. */
		.task('place', ($) =>
			C.undescribedName.v1({
				name: $.gather.state.read.state,
				locationEntries: $.gather.rooms.read.entries,
				params: slot.params(),
			}),
			{ expose: { label: 'The current place' } },
		)
		/** The hard gates before the Castellan's ranker (C2): exclusions and presence. */
		.task('eligible', ($) =>
			C.eligibility.v1({
				candidates: $.loreLinked.candidates,
				exclusions: [
					$.gather.worldLore.read.exclusions,
					$.gather.characterLore.read.exclusions,
					$.gather.historyEntries.read.exclusions,
				] as any,
				presences: $.gather.presences.read.main,
				at: $.gather.presences.read.at,
			}),
		)
		.task('rank', ($) =>
			C.rankHybrid.v1({
				candidates: $.eligible.candidates,
				budget: $.contextBudget.available,
				shownElsewhere: $.place.entryId,
				params: slot.params(),
			}),
		)

/** What every branch of the Lair's turn reads off the spine. */
type LairHead = ChainNodes<ReturnType<typeof lairHead>>

/** @experimental */
export const lairReplySpec = () => {
	const w = wiring()
	return compile(
		lairHead()
			/**
			 * **Narrate first** (R8): a fire `via: 'narrate'` is the Castellan
			 * narrating on `main`, whichever composer pressed it. Every other
			 * fire is a turn — the Sanctum's or the story's (R6).
			 */
			.junction('via', { on: ($) => $.input.via }, (v) =>
				v
					.when('narrate', { equals: 'narrate' }, (n) => narrateBranch(n))
					.otherwise('turn', (t) =>
						t.junction('channel', { on: ($) => $.input.channel }, (ch) =>
							ch
								.when('sanctum', { equals: SANCTUM_CHANNEL }, (s) => sanctumBranch(s))
								.otherwise('story', (st) => storyBranch(st, w)),
						),
					),
			)
			/** What the pipeline ships with — selections a person can change, never literals welded in. */
			.defaults((p) =>
				applyWiring(
					p
						// The knock: its question, where the planner says the party
						// stand (A27), the room nobody built (B13), the prose read and
						// its channels (R9), the option label (R9).
						.params('via.turn.channel.story.pick.planned.door.knock.question', { path: 'knockQuestion' })
						.params('via.turn.channel.story.pick.planned.door.knock.vantage', { path: 'worldHints.location' })
						.params('via.turn.channel.story.pick.planned.rooms.on.exit', { path: 'unknownExit' })
						.params('via.turn.channel.story.pick.planned.rooms.on.exitProse', { channel: '*', limit: EXIT_PROSE_ROWS, talkOnly: true })
						.params('via.turn.channel.story.pick.planned.rooms.on.exitCheck', { channels: ['main', SANCTUM_CHANNEL] })
						.params('via.turn.channel.story.pick.planned.door.knock.named', { path: '', separator: '' })
						.params('via.turn.channel.story.pick.planned.door.knock.describeLabel', { path: '', separator: ' ' })
						// The rooms, each with its ways out said from it (B6).
						.params('gather.rooms.read', { entryTypes: [bareEntryTypeId(locationEntryType)], withLinks: true })
						// The room the place slot shows (the room rule).
						.params('place', { path: 'world.location' })
						// The Castellan's Sanctum talk (R6): the Sanctum is the
						// conversation, the story's newest rows its background.
						.params('via.turn.channel.sanctum.talk', { channel: SANCTUM_CHANNEL })
						.params('via.turn.channel.sanctum.story', { channel: 'main', limit: SANCTUM_STORY_ROWS })
						// The unplayed Sanctum talk (R13): only since the story's last line.
						.params(TALK_READS[0], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
						.params(TALK_READS[1], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
						.params(TALK_READS[2], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
						.params(NO_TALK_READ, { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: 0 })
						// Where Narrate was pressed, beside the fields (R13).
						.params('via.narrate.asked', { firstKey: 'channel', secondKey: 'fields' })
						// The scratchpad, as text, off the Castellan's annex view.
						.params('via.turn.channel.story.pick.planned.steer.on.pad', { path: CASTELLAN_SCRATCHPAD_KEY })
						.params('via.turn.channel.sanctum.pad', { path: CASTELLAN_SCRATCHPAD_KEY })
						// The post-history reminder's trigger, at every step that
						// assembles a prompt (`POST_HISTORY_TOKEN_TRIGGER`).
						.params('via.narrate.prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						// …except the Sanctum's (lair fix 2): the Castellan's
						// reminder (`LAIR_CASTELLAN_REMINDER`) lands from the
						// first line, because the talk that drifted into
						// narrating was two messages long.
						.params('via.turn.channel.sanctum.prompt', { postHistoryTokenTrigger: 0 })
						.params('via.turn.channel.story.pick.planned.planPrompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						// …and the voice's (RF fix 2, 2026-10-23): a delver's
						// reminder — whose turn it is, first person for speech,
						// third for action — lands from the first line. On the
						// chat wire nothing else follows the GM's line in a party
						// of one (the seed line is dropped and no cue is added
						// after a user turn), and a turn that read nothing after
						// it answered as the GM, "*You materialize…*".
						.params('via.turn.channel.story.pick.picked.prompt', { postHistoryTokenTrigger: 0 })
						// The plan runs on Background: nobody reads it as prose.
						.sampling('via.turn.channel.story.pick.planned.planWrite', { seedKey: 'sampling-background' })
						// Every spoken line on Reply.
						.loadout('via.narrate.say', slot.loadout(CORE_LOADOUT.reply))
						.loadout('via.turn.channel.sanctum.say', slot.loadout(CORE_LOADOUT.reply))
						.loadout('via.turn.channel.story.pick.picked.say', slot.loadout(CORE_LOADOUT.reply)),
					w,
				),
			)
			.build(),
	)
}
