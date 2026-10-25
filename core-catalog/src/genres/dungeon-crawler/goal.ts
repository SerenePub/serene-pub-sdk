/**
 * 🚧 Dungeon Crawler's **goal reached** (PLAN-dungeon-crawler-2026-10-14,
 * feature 14): continue, a new goal, or end.
 *
 * **In the story turn** (the fragment below, inside the books): when the
 * Planner's `world.goalProgress` is `reached` and the goal has not been
 * reached before, the turn's row is stamped on `progress.goalReached`, the
 * Narrator is told to close the arc, and the owner's Planner lane gets a
 * form — *Carry on* · *A new goal* · *End the adventure* — whose press fires
 * this file's action.
 *
 * **The action** (`core:spec/dungeon-crawler-goal`, `#goal`, the `form`
 * venue — pressed where it was asked, in no listing): `read-answer@1`, then
 * `core:script/dungeon-crawler-goal` judges the press (the owner's alone):
 *
 *  - *Carry on* — `progress.goalDone`: the world turns on with no goal to chase;
 *  - *A new goal* — ONE JSON call (`DUNGEON_CRAWLER_GOAL_SCHEMA`) for a goal
 *    grown out of what happened and two leads; the same script files it in
 *    the bookkeeping, the journal (or *secret*) and the Planner's notes;
 *  - *End* — `progress.ended`: every later story turn is the Narrator's short
 *    epilogue, no Planner; the session stays readable.
 */

import { actionIdentity, compile, slot, spec, sessionEvents, type ChainBuilder } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { dungeonCrawlerGenre } from '../../registry/genres.js'
import { DUNGEON_CRAWLER_PROMPT_KEYS } from '../../seed/prompts.js'
import { PLANNER } from './create.js'
import { DUNGEON_CRAWLER_ANNEX_KEYS as K, TRAVELOGUE_CHANNEL } from './names.js'
import { DUNGEON_CRAWLER_ENTRY_TYPES } from './lore.js'
import { DUNGEON_CRAWLER_STORY_PREAMBLE, storySeed } from './storyScripts.js'
import {
	applyWiring,
	DUNGEON_CRAWLER_NARRATE_TEMPLATE,
	jsonPart,
	modelCall,
	on,
	scriptStep,
	textPart,
	wiring,
	type Wiring,
} from './calls.js'
import type { ChainNodes } from '../../shared/chains.js'
import { NARRATOR } from './genesis.js'

/** @experimental */
export const DUNGEON_CRAWLER_GOAL_SPEC_ID = 'core:spec/dungeon-crawler-goal'
/** @internal */
export const DUNGEON_CRAWLER_GOAL_VERSION = '1.0.0'
/** The goal action's key, as the spec declares it. */
const GOAL_ACTION_KEY = 'goal'
/** What the goal form's options fire. @experimental */
export const DUNGEON_CRAWLER_GOAL_ACTION = actionIdentity({ specSlug: DUNGEON_CRAWLER_GOAL_SPEC_ID, key: GOAL_ACTION_KEY })
/** The goal form's three options, by the key its block carries. @experimental */
export const DUNGEON_CRAWLER_GOAL_CHOICES = Object.freeze({
	carryOn: 'continue',
	newGoal: 'new-goal',
	end: 'end',
} as const)

/** A new goal: one sentence, two leads, the Planner's secret notes. @experimental */
export const DUNGEON_CRAWLER_GOAL_SCHEMA = {
	type: 'object',
	properties: {
		goal: { type: 'string' },
		leads: { type: 'array', maxItems: 4, items: { type: 'string' } },
		notes: { type: 'string' },
	},
	required: ['goal', 'leads', 'notes'],
	additionalProperties: false,
} as const

/** The books' goal part (`story.ts`'s ledger runs it). @internal */
export const DUNGEON_CRAWLER_GOAL_JS = `
// ── The goal (goal.ts) ──
var GOAL_ACTION = ${JSON.stringify(DUNGEON_CRAWLER_GOAL_ACTION)};
var GC = ${JSON.stringify(DUNGEON_CRAWLER_GOAL_CHOICES)};
if (plan && plan.world.goalProgress === "reached" && !progress.goalReached && !progress.goalDone && !progress.ended) {
	progress.goalReached = row;
	told.push("The party has reached their goal" + (text(progress.goal) ? " (" + text(progress.goal) + ")" : "") +
		". Close this chapter: the moment it is won, and a breath after it. Leave the world open.");
	// 🚧 A secret goal, once reached, is no secret (P3-3, the walk's #30): the
	// journal shows it, where it read "Kept secret by the Planner".
	if (text(progress.goal)) journal.goal = text(progress.goal);
	// 🚧 Every lane hears it (P3-3, #25: the guest was never told); the owner's
	// gets the form below.
	var people0 = tablePeople(doc);
	for (var pg = 0; pg < people0.length; pg++) {
		if (doc.ownerUserId != null && people0[pg] === Number(doc.ownerUserId)) continue;
		var lane0 = laneOf(doc, people0[pg]);
		if (lane0 && b.fresh) laneLines.push({
			lane: lane0,
			// 🚧 One full stop (Q3-2, the walk's N14: "…the bells ring..").
			text: "The goal is reached" + (text(progress.goal) ? ": " + text(progress.goal).replace(/[.!?…]+$/, "") : "") + ". The session's owner decides what comes next — carry on, a new goal, or the end.",
			blocks: null
		});
	}
	var ownerLane = doc.ownerUserId != null ? laneOf(doc, Number(doc.ownerUserId)) : null;
	if (ownerLane && b.fresh) laneLines.push({
		lane: ownerLane,
		text: "You did it: the goal is reached. What now? Carry on in this world, let me set a new goal, or end the adventure here. The session stays readable either way.",
		blocks: [{
			kind: "choices", addressee: "user:" + doc.ownerUserId, referent: "goal", question: "The goal is reached. What now?",
			actions: [
				{ fn: "goal", action: GOAL_ACTION, choice: GC.carryOn, label: "Carry on" },
				{ fn: "goal", action: GOAL_ACTION, choice: GC.newGoal, label: "A new goal" },
				{ fn: "goal", action: GOAL_ACTION, choice: GC.end, label: "End the adventure" }
			]
		}]
	});
}
if (progress.ended) told.push("The adventure is over. Give the party a short epilogue, two or three sentences, and end there.");
`

/**
 * 🚧 `core:script/dungeon-crawler-goal`: the goal form's press, judged —
 * or, handed the model's `json`, the new goal filed.
 *
 * Judging `{ session, choice, addressee }` → `{ lane, text, world, journal,
 * brief, crib }`, each `null` unless this press needs it: the owner alone
 * decides (anyone else gets a line); *Carry on* and *End* change the world
 * and say so; *A new goal* hands back the brief and the Planner's crib for
 * the one call. Filing `{ session, filing: true, json, addressee }` → `{ lane, text, world,
 * journal, notes }`.
 * @experimental
 */
export const DUNGEON_CRAWLER_GOAL_SCRIPT = storySeed(
	'core:script/dungeon-crawler-goal',
	'Dungeon Crawler: after the goal',
	`${DUNGEON_CRAWLER_STORY_PREAMBLE}
var GC = ${JSON.stringify(DUNGEON_CRAWLER_GOAL_CHOICES)};
var world = progressOf(core);
var journal = own(core[KEYS.journal]);
var who = text(v.addressee);
var m = /^user:(\\d+)$/.exec(who);
var userId = m ? Number(m[1]) : null;
var isOwner = userId !== null && doc.ownerUserId != null && userId === Number(doc.ownerUserId);
var out = { lane: (userId !== null && laneOf(doc, userId)) || PARLEY, text: null, world: null, journal: null, brief: null, crib: null, notes: null, notesRevealed: null, epilogue: null };
// A NEW goal is kept as the table chose (the world's goal mode), whatever
// the reached one showed (\`goalKeptSecret\` reads a reached goal as out).
var secret = !text(core[KEYS.planningNotesRevealed]) &&
	(text(own(own(v.state).world)["goal-mode"]) === "secret" || text(journal.goal) === SECRET_GOAL || text(journal.goal) === "secret");
if (v.filing === true) {
	var j = own(v.json);
	var goal = text(j.goal);
	if (!goal) { out.text = "I couldn't settle on a new goal just now. Ask me again, or carry on and I'll keep the world turning."; return out; }
	var leads = list(j.leads, 4);
	world.goal = goal; world.goalReached = null; world.goalDone = false;
	out.world = world;
	out.journal = { goal: secret ? SECRET_GOAL : goal, leads: leads.length ? leads : list(journal.leads, 6) };
	var notes = text(core[KEYS.planningNotes]);
	var more = [];
	if (secret) more.push("Secret goal: " + goal);
	if (text(j.notes)) more.push(text(j.notes));
	out.notes = (notes ? notes + "\\n" : "") + more.join("\\n");
	// 🚧 While the notes are out, the revealed copy follows (AUDIT A24).
	if (text(core[KEYS.planningNotesRevealed])) out.notesRevealed = out.notes;
	out.text = secret ? "I have a new goal in mind. It's a secret: you'll find it in play." : "A new goal: " + goal + (leads.length ? "\\n\\nLeads: " + leads.join("; ") + "." : "");
	return out;
}
var choice = text(v.choice);
if (!isOwner) out.text = "What comes after the goal is the session owner's to decide.";
else if (world.ended) out.text = "The adventure has already ended. The session stays here to read.";
else if (choice === GC.carryOn) {
	world.goalDone = true;
	out.world = world;
	out.text = "Then we carry on. The world keeps turning; there is always more out there.";
} else if (choice === GC.end) {
	world.ended = true;
	out.world = world;
	out.text = "The adventure is over. The Narrator closes it now; the Story and the Journal stay here to read.";
	// 🚧 The Narrator closes it NOW (P3-3, the walk's #30: nothing closed
	// until somebody wrote).
	out.epilogue = "The adventure is over" + (text(world.goal) ? ", its goal reached: " + text(world.goal).replace(/[.!?…]+$/, "") : "") +
		". Give the party a short epilogue, two or three sentences, and end there.";
} else if (choice === GC.newGoal) {
	out.brief = "The party reached their goal" + (text(world.goal) ? ": " + text(world.goal).replace(/[.!?…]+$/, "") : "") + ". Give them a new one that grows out of what happened and where they are now.";
	// The preamble's one crib builder (AUDIT C7), over the newest journal lines.
	out.crib = cribLines(world, journal, { state: v.state, places: v.places, log: logOf(v.log, 8) }).join("\\n");
} else out.text = "I didn't catch that. Carry on, a new goal, or end?";
return out;
`,
)

/**
 * What the goal script hands its junctions — judging a press or filing a new
 * goal (`DUNGEON_CRAWLER_GOAL_SCRIPT`): each member `null` unless the press
 * needs it.
 */
interface GoalStep {
	readonly lane: unknown
	readonly text: unknown
	readonly world: unknown
	readonly journal: unknown
	readonly brief: unknown
	readonly crib: unknown
	readonly notes: unknown
	readonly notesRevealed: unknown
	readonly epilogue: unknown
}

/** The spine before the route: the press, the reads, the judge, and the owner's lane. */
const goalHead = (w: Wiring) =>
	textPart(
		scriptStep(
			spec(DUNGEON_CRAWLER_GOAL_SPEC_ID, {
				version: DUNGEON_CRAWLER_GOAL_VERSION,
				taxonomy: { role: 'action' },
				contributes: {
					actions: [
						{
							key: GOAL_ACTION_KEY,
							venue: { kind: 'form' },
							audience: { see: ['participant'], act: ['participant'] },
							icon: 'flag',
							label: { en: 'Decide' },
							description: { en: 'Decide what comes after the goal: carry on, a new goal, or the end.' },
						},
					],
				},
			})
				.inlet('input', C.userMessage.v1(), { suits: [] })
				.task('answer', ($) => C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }))
				.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
				/** The state: the world's goal mode says whether the goal is kept secret. */
				.query('state', ($) => C.sessionState.v1({ scope: $.input.sessionScope }))
				.query('story', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
					expose: { label: 'The story so far' },
				})
				// The world as the session's own lorebook holds it, and the Journal's newest lines.
				.query('places', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
					expose: { label: 'The places' },
				})
				.query('log', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }), {
					expose: { label: 'The journal so far' },
				}),
			w,
			'step',
			DUNGEON_CRAWLER_GOAL_SCRIPT.seedKey,
			($) => ({
				session: $.input.session,
				choice: $.answer.choice,
				addressee: $.answer.addressee,
				places: $.places.entries,
				log: $.log.messages,
				state: $.state.state,
			}),
			'Judge the press',
		),
		w,
		'lane',
		($) => $.step.main,
		'lane',
		"The owner's lane",
	)

/** The epilogue, at `route.closing.`: the Narrator's row, its call, its words. */
const closing = (c: ChainBuilder<ChainNodes<ReturnType<typeof goalHead>>, 'route.closing'>, w: Wiring) => {
	w.prompts.push([on(c, 'context'), DUNGEON_CRAWLER_PROMPT_KEYS.narrate])
	w.templates.push([on(c, 'prompt'), DUNGEON_CRAWLER_NARRATE_TEMPLATE])
	const telling = { expose: { status: 'The Narrator closes the adventure' } }
	return textPart(c, w, 'brief', ($) => $.step.main, 'epilogue', 'The epilogue, asked')
		.outlet('placeholder', () => C.createMessage.v1({ generating: true, channel: 'main', speaker: NARRATOR as any }), {
			expose: { label: "Open the Narrator's last line", status: 'The Narrator closes the adventure' },
		})
		.task(
			'context',
			($) =>
				C.buildTemplateContext.v1({
					cast: $.cast.cast,
					speaker: NARRATOR as any,
					turnDirection: $.brief.text,
					fields: { diceRolled: '' } as any,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			telling,
		)
		.task(
			'lines',
			($) =>
				C.processMessages.v1({
					messages: $.story.messages,
					cast: $.cast.cast,
					templateContext: $.context.templateContext,
					seedName: $.context.seedName,
				}),
			telling,
		)
		.task(
			'prompt',
			($) =>
				C.assemble.v2({
					messages: $.lines.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts($.context),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('route.closing.say'),
				}),
			telling,
		)
		.oracle(
			'say',
			($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
					// 🚧 O7: the voice a spoken reply speaks in, when `outputs` ask for audio.
					speechSampling: slot.speechSampling(),
				}),
			{
				expose: {
					stream: true,
					status: 'The Narrator closes the adventure',
					label: 'The epilogue',
					purpose: 'When the adventure ends, the Narrator closes it on the Story in a few sentences.',
				},
			},
		)
		.outlet(
			'save',
			($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.say.text,
					reasoning: $.say.reasoning,
				}),
			{ expose: { label: 'Fill the epilogue' } },
		)
}

/**
 * **After the goal** — what the goal form's options fire (see the header).
 * @experimental
 */
export const dungeonCrawlerGoalSpec = () => {
	const w = wiring()
	w.params.push(['story', { channel: 'main', limit: 8, tableLines: false }]) // 🚧 no roll lines: the table's, never the story's speech
	w.params.push(['places', { entryTypes: [DUNGEON_CRAWLER_ENTRY_TYPES.place] }])
	w.params.push(['log', { channel: TRAVELOGUE_CHANNEL, limit: 8 }])
	const built = goalHead(w).junction('route', { on: ($) => $.step.main }, (j) =>
		j
			.when('said', { path: (v: GoalStep) => v.text, truthy: true }, (c) =>
				textPart(c, w, 'line', ($) => $.step.main, 'text', "The Planner's answer").outlet(
					'write',
					($) => C.createMessage.v1({ text: $.line.text, channel: $.lane.text, speaker: PLANNER as any }),
					{ expose: { label: "Say the Planner's answer" } },
				),
			)
			.when('world', { path: (v: GoalStep) => v.world, truthy: true }, (c) =>
				jsonPart(c, w, 'value', ($) => $.step.main, 'world', 'The world, decided').outlet(
					'write',
					($) => C.setSessionAnnex.v1({ value: { [K.progress]: $.value.main } as any, params: slot.params() }),
					{ expose: { label: 'Keep the decision' } },
				),
			)
			/**
			 * 🚧 End: the Narrator closes the adventure NOW (P3-3, the walk's #30)
			 * — one streamed call on Story under its own prompt row, the
			 * epilogue as the round's brief, laid out to end on the request
			 * (`DUNGEON_CRAWLER_NARRATE_TEMPLATE`). No numbers: an epilogue
			 * rolls nothing.
			 */
			.when('closing', { path: (v: GoalStep) => v.epilogue, truthy: true }, (c) => closing(c, w))
			.when('renew', { path: (v: GoalStep) => v.brief, truthy: true }, (c) => {
				const asked = modelCall(
					textPart(textPart(c, w, 'brief', ($) => $.step.main, 'brief', 'What the new goal is for'), w, 'crib', ($) => $.step.main, 'crib', "The Planner's crib"),
					w,
					'goal',
					{
						speaker: PLANNER,
						prompt: DUNGEON_CRAWLER_PROMPT_KEYS.goal,
						brief: ($) => $.brief.text,
						crib: ($) => $.crib.text,
						cast: ($) => $.cast.cast,
						history: ($) => $.story.messages,
						schema: DUNGEON_CRAWLER_GOAL_SCHEMA,
						briefTurn: true,
						expose: {
							status: 'The Planner sets a new goal',
							label: 'A new goal',
							purpose: 'When the party reaches its goal and asks for another, the Planner sets one that grows out of the story.',
						},
					},
				)
				const parts = jsonPart(
					jsonPart(
						textPart(
							scriptStep(asked, w, 'filed', DUNGEON_CRAWLER_GOAL_SCRIPT.seedKey, ($) => ({
								session: $.input.session,
								addressee: $.answer.addressee,
								filing: true,
								json: $.goalWrite.json,
								state: $.state.state,
							}), 'Draw up the new goal'),
							w,
							'notes',
							($) => $.filed.main,
							'notes',
							"The Planner's notes, with the new goal",
						),
						w,
						'journal',
						($) => $.filed.main,
						'journal',
						'The journal, with the new goal',
					),
					w,
					'world',
					($) => $.filed.main,
					'world',
					'The world, with the new goal',
				)
				return parts
					.junction('kept', { on: ($) => $.filed.main }, (k) =>
						k.when('goal', { path: (v: GoalStep) => v.world, truthy: true }, (g) =>
							g.outlet(
								'write',
								($) =>
									C.setSessionAnnex.v1({
										value: {
											[K.progress]: $.route.renew.world.main,
											[K.journal]: $.route.renew.journal.main,
											[K.planningNotes]: $.route.renew.notes.text,
										} as any,
										params: slot.params(),
									}),
								{ expose: { label: 'Keep the new goal in the world' } },
							),
						),
					)
					.junction('revealed', { on: ($) => $.filed.main }, (k) =>
						k.when('notes', { path: (v: GoalStep) => v.notesRevealed, truthy: true }, (n) =>
							textPart(n, w, 'line', ($) => $.route.renew.filed.main, 'notesRevealed', 'The notes, as revealed').outlet(
								'write',
								($) =>
									C.setSessionAnnex.v1({
										value: { [K.planningNotesRevealed]: $.line.text } as any,
										params: slot.params(),
									}),
								{ expose: { label: 'Keep the revealed notes in step' } },
							),
						),
					)
					.junction('told', { on: ($) => $.filed.main }, (k) =>
						k.when('line', { path: (v: GoalStep) => v.text, truthy: true }, (t) =>
							textPart(t, w, 'line', ($) => $.route.renew.filed.main, 'text', 'The new goal, told').outlet(
								'write',
								($) =>
									C.createMessage.v1({
										text: $.line.text,
										channel: $.lane.text,
										speaker: PLANNER as any,
									}),
								{ expose: { label: 'Tell the new goal' } },
							),
						),
					)
			}),
	)
	return compile(
		built
			.defaults((p) => applyWiring(p, w))
			.build(),
	)
}
