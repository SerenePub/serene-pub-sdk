/**
 * The **Whodunit** genre's two required pipelines: open a case, and take a turn
 * inside one (plans/genres-and-showcase-plugins §4).
 *
 * ## The one idea
 *
 * Adventure gives every member of the cast its own model call. Whodunit asks
 * the question that follows: **what is each of those calls allowed to know?**
 * A suspect who answers out of the whole case file is not a suspect, and every
 * structural decision below is downstream of that one sentence.
 *
 * ## What a voice may know
 *
 * **Each suspect reads their own private lore and nobody else's** (W1, built
 * 2026-09-17). Character-lore visibility is decided by the host at the *lore
 * read* against one subject, and `core:query/character-lore@1` takes that
 * subject on a `speaker` port — so the lane sits INSIDE the voices clause,
 * which is the only place it can sit: a scope is a property of the run and a
 * speaker is a property of the iteration, and there they are one fact. Each
 * voice reads on the reference its own context node resolved
 * (`$.voices.item.context.speaker`), pools it with the world lore, the timeline
 * and the conversation's band, and ranks that pool for itself.
 *
 * ⚠ **The spine still wires no character-lore lane, and must not.** A lane on
 * the gather reads ONCE for the whole run on the narrator's scope — which
 * carries no character, and which the visibility rule reads as omniscient — and
 * every voice in the clause would then be handed the same ranked pool. That is
 * the game over in one wire, so the only character lore in this pipeline is
 * per-speaker and inside the clause.
 *
 * A suspect the cast does not hold — a name the planner invented — resolves to
 * no speaker and reads nobody's private lore, which is the honest answer for
 * somebody who is nobody.
 *
 * The private half of the case in FULL — every suspect's entries at once —
 * still reaches exactly one prompt in the genre, and it is the judge's, at the
 * accusation (`whodunitActions.ts`, `whodunit-verdict`), where the game is over
 * and hiding them would only stop the ending being written.
 *
 * Residual, stated rather than hidden: `{{characters}}` renders every cast card
 * into every prompt, so a secret written into a card's *description* still
 * reaches every voice. A card is the author's public surface; the lorebook is
 * where a secret goes.
 *
 * ## The culprit
 *
 * The solution must be a fact before the first turn, and it must not be a
 * *stored* fact: the only per-session store a spec can reach is the attribute
 * ledger, which the Stats and World State widgets render on screen, so writing
 * the answer there would put it beside the suspicion bars.
 *
 * So it is **derived, by the pipeline, and written down nowhere** (D-4a,
 * 2026-09-17). `core:task/cast-choices@1` turns the room into the option list
 * a question is put with — one entry per live suspect, keyed by participant
 * reference — and `core:task/pick-by-hash@1` picks one of those entries under
 * the session's own scope. Rendezvous hashing, so the create run and every
 * later turn reach the same suspect with nothing stored and nothing on screen,
 * and seating a further suspect mid-case displaces the culprit in about one
 * session in n rather than in all of them.
 *
 * The genre's own copy of that rule is gone with this change: `pickHash32` and
 * `rendezvousPick` (SDK `pick.ts`) are the one implementation the app's
 * binding, this genre and a plugin's picker share, and `whodunit.test.ts` pins
 * that they answer exactly what the genre's copy answered for a fixture
 * session — `session:<id>`, the spelling the binding reads off
 * `$.input.sessionScope`.
 *
 * ⚠ **`whodunit-create` derives the culprit and wires it to nothing**, which
 * is the point rather than an oversight: the derivation IS the record. A
 * create run that published it — on a slot, in the ledger, on the seeded row
 * — would be the answer in the session's own state, one widget away from the
 * player.
 *
 * The one run that needs it asks the same two nodes the same question:
 * `whodunit-verdict` re-derives the pick over the same list and the same scope
 * and compares it with the accusation (`whodunitActions.ts`). Nothing in
 * between carries the answer, which is what "derived rather than stored"
 * buys — and why the pick's two settings must stay identical in both specs.
 *
 * ## The turn
 *
 * Adventure's four agents over this genre's vocabulary: the planner reads the
 * detective's line as the detective's *action* and decides which suspects react
 * and whether the scene turns something up; the narrator writes the moment in
 * the third person with no dialogue in it; one voice call per suspect the
 * planner named; and the state keeper writes down what changed. The voices are
 * joined into ONE reply, exactly as Adventure and Lair join them: the reply is
 * the run's one live row (F7). "One row per suspect" is writable as complete
 * messages inside an `each` (W1), at the cost of streaming and Stop — see
 * `lair.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { whodunitGenre } from './genres.js'

/* ── create ─────────────────────────────────────────────────────────────── */

/** @internal */
export const WHODUNIT_CREATE_SPEC_ID = 'core:spec/whodunit-create'
/** @internal */
export const WHODUNIT_CREATE_VERSION = '1.0.0'

/**
 * The genre's required member (24 §3): what happens when a Whodunit session is
 * created.
 *
 * Adventure's create pipeline exactly — the cast's greetings, seeded on `main`
 * — because a case opens with a room of people who have already met the
 * detective at the door. No model call, deliberately: creation is a synchronous
 * action a person is waiting on (see `adventure-create` for the argument at
 * length), and the first real beat is a turn or *Search*, which is a button.
 *
 * It does pick the culprit, and still calls no model: `cast-choices` shapes the
 * room and `pick-by-hash` chooses one of it under the session's scope, both
 * pure and both bounded at half a second. The pick lands on no port anybody
 * writes — see the module header — and is **re-derivable** rather than kept:
 * the same two nodes over the same scope reach the same suspect in any later
 * run, which is what a genre asks a hidden fact for.
 *
 * ⚠ **A case with nobody in it fails here.** `pick-by-hash@1` declares no
 * `optional`, so an empty option list halts the create run rather than opening
 * a session whose answer is nobody. The genre requires two characters
 * (`shape.characters.min`), so this is the floor asserting itself.
 * @internal
 */
export const whodunitCreateSpec = () =>
	compile(
		spec(WHODUNIT_CREATE_SPEC_ID, {
			version: WHODUNIT_CREATE_VERSION,
			taxonomy: {
				role: 'create',
			},
			genre: {
				name: whodunitGenre.name,
				family: whodunitGenre.family,
				description: whodunitGenre.description,
				shape: whodunitGenre.shape,
				events: whodunitGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>,
			},
		})
			.inlet('input', C.sessionCreated.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.sessionCreated,
			})
			/**
			 * The culprit, derived here and stored nowhere.
			 *
			 * `exclude: 'personas'` because the detective is a cast member too
			 * (0132) and the one thing they cannot be is the answer. The pick
			 * is identified `by: 'key'` — the option's participant reference,
			 * which survives an author renaming somebody, where a name does
			 * not.
			 *
			 * ⚠ **Declared before the greetings, not after**, and the order is
			 * load-bearing: a node with no explicit edge from the one above it
			 * gets the spine's implicit `main → main`, so a pick declared last
			 * would hand the answer to the **write** — which reads neither
			 * port, but puts the culprit on the input of the one node in this
			 * run that touches a row. Here the implicit edge lands on the
			 * greetings read instead, which is a question about a session and
			 * cannot carry it anywhere.
			 */
			.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
			.task('suspects', ($) =>
				C.castChoices.v1({ cast: $.cast.cast, params: slot.params() }),
			)
			.task('culprit', ($) =>
				C.pickByHash.v1({
					items: $.suspects.options,
					scopeKey: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: whodunitGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			/**
			 * The pick's two settings, as author defaults rather than literals
			 * on the ports: a node that declares a parameters slot has to WIRE
			 * it (`paramsSlotWiring`, the app's own law), or the control the
			 * config panel renders for it is stored and never read.
			 */
			.preset('whodunit', { label: 'Whodunit', default: true }, (p) =>
				p
					// The detective is a cast member and cannot be the answer.
					.params('suspects', { exclude: 'personas' })
					// The option's participant reference is the identity the
					// hash is taken over — stable where a name is not.
					.params('culprit', { by: 'key' }),
			)
			.build(),
	)

/* ── respond ────────────────────────────────────────────────────────────── */

/** @internal */
export const WHODUNIT_RESPOND_SPEC_ID = 'core:spec/whodunit-respond'
/** @internal */
export const WHODUNIT_RESPOND_VERSION = '1.0.0'

/** How many suspects may react in one turn. Mandatory (F9) and small. */
const MAX_SPEAKERS = 4

/**
 * The values the keeper may set, by the names the prompts use.
 *
 * ⚠ **`case` is not here, and its absence is the rule.** The verdict is the
 * one value in this session a model never writes: only
 * `core:spec/whodunit-verdict` sets it, once, and *Accuse*'s `enabledWhen`
 * reads it. A keeper that could set it would be a state-keeper ending the game
 * between two messages — the same argument that keeps `direction` and
 * `whisper` out of Lair's list.
 */
const TRACKED_SLOTS = ['suspicion', 'location', 'clues-found']

/**
 * What the planner answers with.
 *
 * Adventure's schema with the sky taken out and the evidence put in. Every
 * property is required and every one is a string, an array or an object of
 * those, because the llama.cpp family compiles this to a GBNF grammar and
 * refuses anything outside that set rather than loosening it — see
 * `adventure.ts` for the full argument.
 *
 * ⚠ **There is no `culprit` property and there must not be.** The planner's
 * document is wired into the narrator's context AND into every voice's
 * (`build-side-character-context@1` takes `plan`), so anything the planner
 * writes is read by every suspect in the room. `clueSurfaced` is as close as
 * this schema comes to the solution, and it is a fact about the SCENE — what
 * the detective just turned up — not about who did it.
 * @internal
 */
export const WHODUNIT_PLAN_SCHEMA = {
	type: 'object',
	properties: {
		beats: { type: 'array', items: { type: 'string' } },
		speakers: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					intent: { type: 'string' },
				},
				required: ['name', 'intent'],
				additionalProperties: false,
			},
		},
		/**
		 * What this turn turned up, in one sentence, or empty — which is most
		 * turns. The keeper reads the written scene rather than this field, so
		 * a planner that promised a clue the narrator did not deliver raises
		 * nothing; this is the planner telling the narrator to put one in.
		 */
		clueSurfaced: { type: 'string' },
		/**
		 * Where this happens. One hint rather than Adventure's three: a case is
		 * a house and an afternoon, and a genre that asked for weather would
		 * teach its narrator to describe a sky instead of a room.
		 */
		worldHints: {
			type: 'object',
			properties: { location: { type: 'string' } },
			required: ['location'],
			additionalProperties: false,
		},
	},
	required: ['beats', 'speakers', 'clueSurfaced', 'worldHints'],
	additionalProperties: false,
} as const

/**
 * What the state-keeper answers with — Adventure's two lists over this genre's
 * vocabulary.
 *
 * `inventory` is kept even though a mystery moves few objects: the resolver
 * takes one shape, and a keeper reporting in a second vocabulary because this
 * genre rarely needs the first would be two ledgers for one table. A letter
 * that changes hands is exactly what it is for.
 * @internal
 */
export const WHODUNIT_KEEPER_SCHEMA = {
	type: 'object',
	properties: {
		values: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					owner: { type: 'string' },
					slot: { type: 'string', enum: TRACKED_SLOTS },
					value: { type: 'string' },
				},
				required: ['owner', 'slot', 'value'],
				additionalProperties: false,
			},
		},
		inventory: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					owner: { type: 'string' },
					entryId: { type: 'integer' },
					delta: { type: 'integer' },
				},
				required: ['owner', 'entryId', 'delta'],
				additionalProperties: false,
			},
		},
	},
	required: ['values', 'inventory'],
	additionalProperties: false,
} as const

/** @internal */
export const whodunitRespondSpec = () =>
	compile(
		spec(WHODUNIT_RESPOND_SPEC_ID, {
			version: WHODUNIT_RESPOND_VERSION,
			taxonomy: {
				role: 'primary',
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.messageRespond,
			})
			/** The reply row, created by the pipeline that fills it (R-17). */
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					characterId: $.input.characterId,
					row: $.input.messageId,
				}),
			)
			/**
			 * One retrieval pass, shared by every agent below — and **three
			 * lanes rather than Adventure's four.**
			 *
			 * `core:query/character-lore@1` is deliberately absent HERE, and
			 * present inside the voices clause instead (W1). A lane on this
			 * gather reads once per RUN, on a scope that carries no character,
			 * and every voice below would read the same ranked pool — which is
			 * every suspect's private entry in every suspect's prompt. The
			 * per-speaker read is the one shape that closes it; the case's
			 * private half in full is read at the accusation and nowhere else.
			 */
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/** The case as everybody in the room already knows it. */
					.chain('worldLore', (c) =>
						c.query('read', ($) =>
							C.worldLore.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/** The timeline: who was where, and when. */
					.chain('historyEntries', (c) =>
						c.query('read', ($) =>
							C.historyEntries.v1({
								scope: $.input.sessionScope,
								// One owner per setting per spec (R-7 P2) — the
								// two lanes declare the same seven knobs.
								params: slot.params({ node: 'gather.worldLore.read' }),
							}),
						),
					)
					.chain('cast', (c) =>
						c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
					)
					.chain('state', (c) =>
						c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })),
					),
			)
			/** The window, taken from the step whose prose fills it — the narrator. */
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('scene'),
					connection: slot.connectionOf('scene'),
					params: slot.params(),
				}),
			)
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [
						$.gather.history.read.band,
						$.gather.worldLore.read.main,
						$.gather.historyEntries.read.main,
					] as any,
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.lore.candidates,
					budget: $.contextBudget.available,
					params: slot.params(),
				}),
			)
			/* ── plan ───────────────────────────────────────────────────── */
			.task('planContext', ($) =>
				C.buildPlannerContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					fields: $.input.fields,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/** Prose, and no turn to continue — see `adventure.ts`. */
			.task('lines', ($) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.planContext.templateContext,
				}),
			)
			.task('planPrompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.planContext.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'planContext' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('planWrite'),
				}),
			)
			.oracle('planWrite', ($) =>
				C.generateJson.v1({
					context: $.planPrompt.context,
					schema: WHODUNIT_PLAN_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Planning the turn' } },
			)
			/* ── narrate ────────────────────────────────────────────────── */
			.task('sceneContext', ($) =>
				C.buildSceneContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					plan: $.planWrite.json,
					fields: $.input.fields,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/**
			 * The narrator's own transcript, ending on the NARRATOR's line —
			 * `build-scene-context` resolves this step as nobody, so `seedName`
			 * is the narrator's and not a suspect's.
			 */
			.task('sceneLines', ($) =>
				C.processMessages.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.sceneContext.templateContext,
					seedName: $.sceneContext.seedName,
				}),
			)
			.task('scenePrompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.sceneLines.messages,
					templateContext: $.sceneContext.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'sceneContext' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('scene'),
				}),
			)
			.oracle('scene', ($) =>
				C.generateText.v1({
					context: $.scenePrompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { stream: true, status: 'Narrating the scene' } },
			)
			/* ── the suspects who react ─────────────────────────────────── */
			/**
			 * One call per suspect the planner named, in their own voice — and
			 * **on their own pool** (W1, 2026-09-17).
			 *
			 * What differs per call is `sideCharacter`, which the binding
			 * resolves against the cast and which decides whose card is compiled
			 * at full visibility, what `{{char}}` renders and the name on the
			 * line the model continues from — and, since the lane below, whose
			 * private entries the prompt may carry. One answer, not two: the
			 * reference the context node published is the reference the lore read
			 * is made on.
			 *
			 * `max` is mandatory (F9) and is the only thing between a planner
			 * that names the whole household and a turn that costs a dozen
			 * calls.
			 */
			.each(
				'voices',
				{
					over: ($: any) => $.planWrite.items,
					max: MAX_SPEAKERS,
					mode: 'parallel',
				},
				(m) =>
					m
						.task('context', ($: any) =>
							C.buildSideCharacterContext.v1({
								cast: $.gather.cast.read.cast,
								sideCharacter: $.voices.item,
								// Where this is and what shape the room is in.
								state: $.gather.state.read.state,
								plan: $.planWrite.json,
								prompts: slot.prompts(),
								variables: slot.variables(),
							}),
						)
						/**
						 * **This suspect's own private lore** (W1, 2026-09-17).
						 *
						 * The one lane in this pipeline that can carry a private
						 * entry, and it is read for ONE person: `speaker` is the
						 * reference the context node above already resolved, never a
						 * second name match, so the voice the prompt is written in
						 * and the secrets it may read are one answer. A name the cast
						 * does not hold publishes `null` and reads nobody's.
						 *
						 * Settings on the world-lore lane, as the gather's two lore
						 * lanes have them (R-7 P2): one owner per setting per spec, so
						 * tuning the scan once tunes it here too.
						 */
						.query('lore', ($: any) =>
							C.characterLore.v1({
								scope: $.input.sessionScope,
								speaker: $.voices.item.context.speaker,
								params: slot.params({ node: 'gather.worldLore.read' }),
							}),
						)
						/**
						 * The shared pool with this voice's own entries in it. World
						 * lore, the timeline and the conversation's band intent are
						 * the same three the spine concatenates — they are not
						 * per-speaker, and a second read of them would be a second
						 * answer to one question.
						 */
						.task('pool', ($: any) =>
							C.concatCandidates.v1({
								sources: [
									$.gather.history.read.band,
									$.gather.worldLore.read.main,
									$.gather.historyEntries.read.main,
									$.voices.item.lore.main,
								] as any,
							}),
						)
						/**
						 * Ranked per voice, because the pool is per voice.
						 *
						 * ⚠ Its **own** params, not a reference to the spine
						 * ranker's (R-7 P2): `core:task/rank-hybrid@1` marks no field
						 * `shared`, so a reference to another node of it resolves
						 * nothing and `validate()` says so. Two rankers are two
						 * settings here, at identical defaults.
						 */
						.task('rank', ($: any) =>
							C.rankHybrid.v1({
								candidates: $.voices.item.pool.candidates,
								budget: $.contextBudget.available,
								params: slot.params(),
							}),
						)
						.task('lines', ($: any) =>
							C.processMessages.v1({
								messages: $.gather.history.read.messages,
								cast: $.gather.cast.read.cast,
								templateContext: $.voices.item.context.templateContext,
								seedName: $.voices.item.context.seedName,
							}),
						)
						.task('prompt', ($: any) =>
							C.assemble.v2({
								candidates: $.voices.item.rank.candidates,
								decisions: $.voices.item.rank.decisions,
								groups: $.voices.item.rank.groups,
								budget: $.contextBudget.available,
								messages: $.voices.item.lines.messages,
								templateContext: $.voices.item.context.templateContext,
								template: slot.template(),
								prompts: slot.prompts({ node: 'voices.item.context' }),
								variables: slot.variables(),
								params: slot.params(),
								connection: slot.connectionOf('voices.item.say'),
							}),
						)
						.oracle('say', ($: any) =>
							C.generateText.v1({
								context: $.voices.item.prompt.context,
								connection: slot.connection(),
								sampling: slot.sampling(),
								params: slot.params(),
							}),
							{ expose: { status: 'Voicing the suspects' } },
						),
			)
			/* ── assemble ───────────────────────────────────────────────── */
			.task('voiceLines', ($: any) =>
				C.joinText.v1({
					items: $.voices.values,
					params: slot.params(),
				}),
			)
			/**
			 * The reply: the scene, then whoever answered. A nested literal is
			 * how one port takes two references; `join-text` drops what is
			 * empty, so a turn nobody reacted to is exactly the narrator's
			 * prose with no trailing separator.
			 */
			.task('reply', ($: any) =>
				C.joinText.v1({
					items: [{ text: $.scene.text }, { text: $.voiceLines.text }] as any,
					params: slot.params(),
				}),
			)
			/** The reply row, filled — see `placeholder`. */
			.outlet('save', ($: any) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.reply.text,
				}),
			)
			/* ── keep state ─────────────────────────────────────────────── */
			/**
			 * The keeper, and it runs LAST for Adventure's reason: every value
			 * it produces is anchored to the newest message in the session,
			 * which is how a swipe takes a turn's changes back with it.
			 * `afterWrite` is the ordering edge that says so — the keeper reads
			 * a reply that EXISTS.
			 */
			.task('keeperContext', ($: any) =>
				C.buildKeeperContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					reply: $.reply.text,
					afterWrite: $.save.messageId,
					fields: $.input.fields,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			.task('keeperPrompt', ($: any) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.keeperContext.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'keeperContext' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('keeperWrite'),
				}),
			)
			.oracle('keeperWrite', ($: any) =>
				C.generateJson.v1({
					context: $.keeperPrompt.context,
					schema: WHODUNIT_KEEPER_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Keeping the record' } },
			)
			/** Names into rows — see `adventure.ts`'s `keeperResolve`. */
			.query('keeperResolve', ($: any) =>
				C.resolveStateChanges.v1({
					changes: $.keeperWrite.items,
					base: $.gather.state.read.version,
					plan: $.planWrite.json,
					scope: $.input.sessionScope,
				}),
			)
			/**
			 * Propose, or apply — the session's own decision, read from the
			 * genre field rather than from a setting on the node. The branch IS
			 * the decision and the receipt records which predicate fired.
			 */
			.junction('commit', { on: ($: any) => $.input.fields }, (j) =>
				j
					.when('trusted', { path: 'trustNarrator', truthy: true }, (t) =>
						t.task('apply', ($: any) =>
							C.setState.v1({
								changes: $.keeperResolve.changes,
								scope: $.input.sessionScope,
								base: $.gather.state.read.version,
								params: slot.params(),
							}),
						),
					)
					.otherwise('reviewed', (t) =>
						t.task('propose', ($: any) =>
							C.setState.v1({
								changes: $.keeperResolve.changes,
								scope: $.input.sessionScope,
								base: $.gather.state.read.version,
								params: slot.params(),
							}),
						),
					),
			)
			/**
			 * What the pipeline ships with — selections a person can change in
			 * the panel, never literals welded into the document. See
			 * `adventure.ts` for the three warnings that govern this block.
			 */
			.preset('whodunit', { label: 'Whodunit', default: true }, (p) =>
				p
					// Which list the voices iterate, and which paths the
					// keeper's changes come from.
					.params('planWrite', { path: 'speakers' })
					.params('keeperWrite', { path: 'values,inventory' })
					// The one branch that writes rather than asks.
					.params('commit.trusted.apply', { mode: 'apply' })
					// Narrator first, then the suspects, separated by a blank line.
					.params('reply', { separator: '\n\n' })
					// The two steps nobody reads run on Background — see
					// `adventure.ts`. The narrator and the voices are
					// deliberately absent: those are the prose somebody is
					// waiting for.
					.sampling('planWrite', { seedKey: 'sampling-background' })
					.sampling('keeperWrite', { seedKey: 'sampling-background' }),
			)
			.build(),
	)
