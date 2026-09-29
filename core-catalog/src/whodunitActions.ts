/**
 * The **Whodunit** genre's actions — what a detective does that is not simply
 * talking (plans/genres-and-showcase-plugins §4, "Actions").
 *
 * `session-action` is an OPEN event, so each of these is its own small pipeline
 * contributing its own button, and removing one from a preset takes the button
 * with it and breaks nothing. Three shapes, and two of them come in pairs:
 *
 *  - **Question** → **Answer**. The detective types a question, picks who to
 *    put it to from a form, and that suspect answers in their own voice. Two
 *    specs because a spec has one inlet and one graph, and asking and answering
 *    are two graphs — Adventure's Ask/Answer pair, with the form turned round.
 *  - **Search** is a narrator turn that may move the ledger: the scene
 *    describes what the detective turns over, and the state keeper decides
 *    whether that was actually a clue.
 *  - **Accuse** → **Verdict**. The same form shape as Question, ending in the
 *    one pipeline in this genre that is allowed to know who did it.
 *
 * ## The forms are addressed to the OWNER
 *
 * Every form here is a `choices` block with `addressee: 'owner'` wired on the
 * port (R-15 *Forms*; the port wins over the document's, by contract). That is
 * the U5d machinery pointed at a person rather than at a character, and it is
 * the right address for the same reason in both pairs: *who do you want to ask*
 * and *who do you say did it* are the detective's questions to answer, and a
 * model that could address them to somebody in the room would be the suspects
 * choosing who gets interrogated.
 *
 * None of these declares `effects: 'world'`, which is what lets a form carry
 * them at all: `worldBlockFunctions` refuses any message block naming a world
 * action (the effects line, R-15), and it is why Lair's knock cannot save a
 * room. Nothing here writes outside the session — messages and the session's
 * own state ledger, both of which are the fiction.
 *
 * ## ⚠ `lorebook-triggers` appears in exactly one spec below
 *
 * `core:query/lorebook-triggers@1` returns world lore, **character lore** and
 * history through one port, so wiring it is wiring the suspects' private
 * entries. Nothing here wires it. The two pipelines that put prose in front of
 * a model — *Answer* and *Search* — read `world-lore` and `history-entries` as
 * two explicit lanes instead, which is the decision `whodunit.ts` takes for the
 * turn and for the same reason; the two pickers read no lore at all — and,
 * since D-4a (2026-09-17), no transcript and no model either: the room IS the
 * option list, and `core:task/cast-choices@1` shapes it. The single exception
 * is `whodunit-verdict`, whose whole job is to know.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { whodunitGenre } from './genres.js'
import { WHODUNIT_KEEPER_SCHEMA } from './whodunit.js'

/* ── Question / Answer ──────────────────────────────────────────────────── */

/** @internal */
export const WHODUNIT_QUESTION_SPEC_ID = 'core:spec/whodunit-question'
/** @internal */
export const WHODUNIT_QUESTION_VERSION = '1.0.0'
/** @internal */
export const WHODUNIT_ANSWER_SPEC_ID = 'core:spec/whodunit-answer'
/** @internal */
export const WHODUNIT_ANSWER_VERSION = '1.0.0'

/**
 * **Question**: the detective puts something to one suspect.
 *
 * The collected text (lair pass R3) is the **question** — the one thing a person always has
 * when they press this — and the form is only *who*. The block is addressed to
 * the owner, its options fire `whodunit-answer`, and the row it lands on is the
 * question itself, so the suspect's voice reads it out of the transcript like
 * anything else said in the room.
 *
 * ## No model stands between the room and the question (D-4a, 2026-09-17)
 *
 * This spec used to spend a whole `generate-json@1` call whose entire job was
 * to read the cast back out as `{ key, label }` and echo the detective's own
 * question at them — a request, a schema and a wait for two facts the run
 * already held, with a model free to misspell a suspect, invent one or leave
 * one out, and what it wrote was what the player could press.
 * `core:task/cast-choices@1` publishes the room in exactly the shape
 * `make-choices@1` reads, the detective's words go on the `question` port, and
 * the whole picker is two pure nodes bounded at half a second each.
 *
 * ⚠ **The question is `$.input.text`, not a prompt.** It is what the person
 * typed, which is the point: the row carries their words, and *Answer*'s
 * suspect reads the question out of the transcript. A composer press with
 * nothing typed therefore puts up no block — `make-choices@1` publishes none
 * for a document with no question — which is the same silence it answers an
 * empty room with.
 * @internal
 */
export const whodunitQuestionSpec = () =>
	compile(
		spec(WHODUNIT_QUESTION_SPEC_ID, {
			version: WHODUNIT_QUESTION_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'question',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'message-circle-question',
						/** The question is the whole instruction (lair pass R3): nothing to ask without it. */
						collects: { text: { need: 'required', label: { en: 'Your question' } } },
						label: { en: 'Question' },
						description: {
							en: 'Put something to one of the suspects. Ask the question; you pick who answers it.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.sessionAction,
			})
			.gather('gather', { mode: 'parallel' }, (b) =>
				b.chain('cast', (c) =>
					c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
				),
			)
			/**
			 * The room, as the question's options.
			 *
			 * `exclude: 'personas'` because a persona is a cast member too
			 * (0132) and the detective does not put their own question to
			 * themselves. `json` is the `{ question, options }` document
			 * `make-choices@1` reads off its own port, so the two wire straight
			 * to each other.
			 */
			.task('suspects', ($) =>
				C.castChoices.v1({
					cast: $.gather.cast.read.cast,
					question: $.input.text,
					params: slot.params(),
				}),
			)
			/**
			 * The question as a `choices` block **addressed to the owner**.
			 *
			 * `addressee` is wired rather than left to the document, so the
			 * detective's own choice cannot be handed to somebody in the room:
			 * the port wins over the document's `addressee` by contract. The
			 * options fire `whodunit-answer`, named the way Adventure's Ask
			 * names Answer — the host holds the press to THAT declaration's
			 * audience.
			 */
			.task('choices', ($) =>
				C.makeChoices.v1({
					json: $.suspects.json,
					fn: 'answer',
					action: `${WHODUNIT_ANSWER_SPEC_ID}#answer`,
					addressee: 'owner',
					cast: $.gather.cast.read.cast,
				}),
			)
			.outlet('save', ($) =>
				C.createMessage.v1({
					narration: true,
					text: $.choices.text,
					blocks: $.choices.blocks,
				}),
			)
			/**
			 * No sampling any more — the picker calls no model. What the preset
			 * carries instead is the half of the room to leave out: an author
			 * default rather than a literal on the port, because a node
			 * declaring a parameters slot must wire it or the control the
			 * config panel renders for it is stored and never read.
			 */
			.preset('whodunit', { label: 'Whodunit', default: true }, (p) =>
				p.params('suspects', { exclude: 'personas' }),
			)
			.build(),
	)

/**
 * **Answer**: the suspect the detective picked answers, and nobody else does.
 *
 * `read-answer` takes the press apart; the chosen option's label is the
 * suspect's name, and `build-side-character-context@1` resolves that name
 * against the cast — which is what decides whose card is compiled at full
 * visibility, what `{{char}}` renders and the name on the line the model
 * continues from (`asSideCharacter`, in the app's bindings).
 *
 * ⚠ **This is the genre's promise at its narrowest, and its limit.** The reply
 * is written by one call, in one person's voice, from a corpus that holds the
 * case as publicly known and no suspect's private entries at all — see
 * `whodunit.ts` for why the lane is withheld rather than scoped. What this
 * suspect knows that the others do not has to be on their card.
 *
 * Declared on its own spec rather than folded into *Question*: a spec has one
 * inlet and one graph.
 * @internal
 */
export const whodunitAnswerSpec = () =>
	compile(
		spec(WHODUNIT_ANSWER_SPEC_ID, {
			version: WHODUNIT_ANSWER_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'answer',
						/**
						 * Carried by a block and pressed from that block alone
						 * (U5d review, S1): no listing offers the `form` venue,
						 * so this is in no composer menu and no message's
						 * overflow. The block's fire still resolves it.
						 */
						venue: { kind: 'form' },
						/** The detective picks; the block says the same thing where a listing would ask. */
						audience: { see: ['participant'], act: ['owner'] },
						icon: 'message-circle-reply',
						label: { en: 'Answer' },
						description: {
							en: 'Say which suspect takes the question. They answer from what they know.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.sessionAction,
			})
			.task('answer', ($) =>
				C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }),
			)
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
					/** The case as the room already knows it — never the private half. */
					.chain('worldLore', (c) =>
						c.query('read', ($) =>
							C.worldLore.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('historyEntries', (c) =>
						c.query('read', ($) =>
							C.historyEntries.v1({
								scope: $.input.sessionScope,
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
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('say'),
					connection: slot.connectionOf('say'),
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
			/**
			 * The speaker, as a nested literal carrying one reference — the
			 * construction `concat-candidates`' `sources` uses. The port takes
			 * `{ name, characterId, known, character }`; a name the cast holds
			 * resolves to that member, which is the whole of who is speaking.
			 */
			.task('context', ($) =>
				C.buildSideCharacterContext.v1({
					cast: $.gather.cast.read.cast,
					sideCharacter: { name: $.answer.label } as any,
					state: $.gather.state.read.state,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			.task('lines', ($) =>
				C.processMessages.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
					seedName: $.context.seedName,
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('say'),
				}),
			)
			.oracle('say', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { stream: true, status: 'Answering' } },
			)
			/**
			 * The row is the suspect's, not the narrator's: `sideCharacter`
			 * carries the name the host writes it under. The same literal as
			 * the context builder's, because the two must agree about who just
			 * spoke.
			 */
			.outlet('save', ($) =>
				C.createMessage.v1({
					text: $.say.text,
					sideCharacter: { name: $.answer.label } as any,
				}),
			)
			.build(),
	)

/* ── Search ─────────────────────────────────────────────────────────────── */

/** @internal */
export const WHODUNIT_SEARCH_SPEC_ID = 'core:spec/whodunit-search'
/** @internal */
export const WHODUNIT_SEARCH_VERSION = '1.0.0'

/**
 * **Search**: the detective turns the place over, and the ledger may move.
 *
 * Two agents and one row. The narrator writes what searching this place with
 * this question in mind actually turns up — from the case and the state, never
 * invented — and then the state keeper reads that scene and decides whether it
 * was a clue. `clues-found` rises when the scene genuinely produced something
 * and not because a button was pressed, which is the difference between a
 * counter and a score.
 *
 * ⚠ **The keeper reads the scene, so it runs after the write** — Adventure's
 * ordering rule: `afterWrite` is the edge that makes the keeper's changes
 * anchor to a message that EXISTS, which is how a swipe takes them back with
 * it.
 * @internal
 */
export const whodunitSearchSpec = () =>
	compile(
		spec(WHODUNIT_SEARCH_SPEC_ID, {
			version: WHODUNIT_SEARCH_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'search',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'search',
						/** What the detective looks for rides as the instructions — or nothing (lair pass R3). */
						collects: {
							text: {
								need: 'optional',
								label: { en: 'What are you looking for?' },
								ifEmpty: { en: 'The scene decides what you find.' },
							},
						},
						label: { en: 'Search' },
						description: {
							en: 'Turn this place over. Say what you are looking for, or let the scene decide what you find.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.sessionAction,
			})
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
					.chain('worldLore', (c) =>
						c.query('read', ($) =>
							C.worldLore.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('historyEntries', (c) =>
						c.query('read', ($) =>
							C.historyEntries.v1({
								scope: $.input.sessionScope,
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
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('write'),
					connection: slot.connectionOf('write'),
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
			/**
			 * `build-template-context@1` rather than the narrator's own
			 * builder, for the one port that decides it: `state`. A search that
			 * did not know which room the detective is standing in would be
			 * describing a house in general.
			 */
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			.task('lines', ($) =>
				C.processMessages.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
					seedName: $.context.seedName,
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('write'),
				}),
			)
			.oracle('write', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { stream: true, status: 'Searching' } },
			)
			/**
			 * What the detective typed rides along as the turn's instructions —
			 * *"look under the blotter"* — stored beside the message and shown
			 * with it, never as its text. The narrate specs wire the same port
			 * from the same place.
			 */
			.outlet('save', ($) =>
				C.createMessage.v1({
					narration: true,
					text: $.write.text,
					instructions: $.input.text,
				}),
			)
			/* ── keep state ─────────────────────────────────────────────── */
			.task('keeperContext', ($) =>
				C.buildKeeperContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					reply: $.write.text,
					afterWrite: $.save.messageId,
					fields: $.input.fields,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/**
			 * The keeper's own transcript, and it is NOT the narrator's.
			 *
			 * Adventure's rule, stated on `keeperAction`: a step that is
			 * answering a question must not be handed a line with somebody's
			 * name on the end of it, and must not be shown the JSON an earlier
			 * turn left in the session. The narrator above is taking a turn and
			 * wants the seed; this one is reading one.
			 */
			.task('keeperLines', ($) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.keeperContext.templateContext,
				}),
			)
			.task('keeperPrompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.keeperLines.messages,
					templateContext: $.keeperContext.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'keeperContext' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('keeperWrite'),
				}),
			)
			.oracle('keeperWrite', ($) =>
				C.generateJson.v1({
					context: $.keeperPrompt.context,
					schema: WHODUNIT_KEEPER_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Keeping the record' } },
			)
			.query('keeperResolve', ($) =>
				C.resolveStateChanges.v1({
					changes: $.keeperWrite.items,
					scope: $.input.sessionScope,
					base: $.gather.state.read.version,
				}),
			)
			.junction('commit', { on: ($: any) => $.input.fields }, (r) =>
				r
					.when('trusted', { path: 'trustNarrator', truthy: true }, (c) =>
						c.task('apply', ($: any) =>
							C.setState.v1({
								changes: $.keeperResolve.changes,
								scope: $.input.sessionScope,
								base: $.gather.state.read.version,
								params: slot.params(),
							}),
						),
					)
					.otherwise('reviewed', (c) =>
						c.task('propose', ($: any) =>
							C.setState.v1({
								changes: $.keeperResolve.changes,
								scope: $.input.sessionScope,
								base: $.gather.state.read.version,
								params: slot.params(),
							}),
						),
					),
			)
			.preset('whodunit', { label: 'Whodunit', default: true }, (p) =>
				p
					.params('keeperWrite', { path: 'values,inventory' })
					.params('commit.trusted.apply', { mode: 'apply' })
					.sampling('keeperWrite', { seedKey: 'sampling-background' }),
			)
			.build(),
	)

/* ── Accuse / Verdict ───────────────────────────────────────────────────── */

/** @internal */
export const WHODUNIT_ACCUSE_SPEC_ID = 'core:spec/whodunit-accuse'
/** @internal */
export const WHODUNIT_ACCUSE_VERSION = '1.0.0'
/** @internal */
export const WHODUNIT_VERDICT_SPEC_ID = 'core:spec/whodunit-verdict'
/** @internal */
export const WHODUNIT_VERDICT_VERSION = '1.0.0'

/**
 * Offered only while the case is open.
 *
 * `state.world.case` is the session's published value for `core:slot/case@1`,
 * keyed the way a template reads it (`publishedValues.ts`). The slot's declared
 * default is `open`, so a session that has never accused anybody shows the
 * button live — which is the trap Adventure's withdrawn `look` default fell
 * into (a predicate over a slot with no default greyed the opening button of
 * every fresh session) and the reason this one has a default at all.
 *
 * The same predicate is evaluated at the door (`fireAction` → `enablementOf`),
 * so a grey button and a refusal cannot disagree: accusing twice is refused
 * even by a client that never listed the button.
 */
const WHILE_THE_CASE_IS_OPEN = [
	{
		on: 'state.world.case',
		equals: 'open',
		reason: { en: 'This case is closed — you have already named somebody.' },
	},
]

/**
 * **Accuse**: the detective names somebody, and the case ends either way.
 *
 * The same picker as *Question* over the same list, addressed to the same
 * person, firing `whodunit-verdict` instead. It is quick because it is the
 * button the whole session is pointed at, and it goes quiet the moment a
 * verdict lands. Two pure nodes and no model, for the reason *Question* gives
 * at length: a model enumerating the room can misspell a suspect or invent
 * one, and here the list it writes is the list the case is decided from.
 *
 * ⚠ **The question above the options is a literal**, not `$.input.text` and no
 * longer a prompt row. *Question* can take the detective's words because they
 * always have some — the question IS what they typed — and an accusation is a
 * button somebody presses with an empty composer, which `make-choices@1` would
 * answer with no block at all. So the line is written here, in English, until
 * this genre's documents can carry a locale map.
 * @internal
 */
export const whodunitAccuseSpec = () =>
	compile(
		spec(WHODUNIT_ACCUSE_SPEC_ID, {
			version: WHODUNIT_ACCUSE_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'accuse',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'gavel',
						label: { en: 'Accuse' },
						description: {
							en: 'Name the culprit. Right or wrong, the case closes and the story ends.',
						},
						enabledWhen: WHILE_THE_CASE_IS_OPEN,
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.sessionAction,
			})
			.gather('gather', { mode: 'parallel' }, (b) =>
				b.chain('cast', (c) =>
					c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
				),
			)
			/** The room, as the accusation's options — the detective excepted. */
			.task('suspects', ($) =>
				C.castChoices.v1({
					cast: $.gather.cast.read.cast,
					question: 'Who do you accuse? Right or wrong, the case closes on your answer.',
					params: slot.params(),
				}),
			)
			.task('choices', ($) =>
				C.makeChoices.v1({
					json: $.suspects.json,
					fn: 'verdict',
					action: `${WHODUNIT_VERDICT_SPEC_ID}#verdict`,
					addressee: 'owner',
					cast: $.gather.cast.read.cast,
				}),
			)
			.outlet('save', ($) =>
				C.createMessage.v1({
					narration: true,
					text: $.choices.text,
					blocks: $.choices.blocks,
				}),
			)
			/** No sampling: no model is called. The room's half — see *Question*. */
			.preset('whodunit', { label: 'Whodunit', default: true }, (p) =>
				p.params('suspects', { exclude: 'personas' }),
			)
			.build(),
	)

/**
 * What the judge answers with — **the ending's plan, and nothing decided**.
 *
 * The verdict is not here any more (contracts batch 2, 2026-09-17). A junction
 * over `core:task/pair@1`'s document decides it, and the word written into
 * `core:slot/case@1` comes off the branch that fired. What is left is the one
 * thing there is a model for at this moment: how the reveal goes.
 *
 * `beats` is how it reaches the page — the narrator downstream takes this
 * document on its `plan` port and `{{beats}}` is what renders off it
 * (`sceneAnchor`, in the app's prompt layer), so the judge is told who did it
 * and asked to name them in the first beat.
 *
 * ⚠ **No `verdict` property and no `culprit` property**, and both absences are
 * the rule rather than a tidy-up. A model that could write either could
 * disagree with the pick — `solved` over a wrong accusation, or a second name
 * for the culprit — and the ledger would then say one thing while the prose
 * said another, with no way to tell which was the game.
 * @internal
 */
export const WHODUNIT_VERDICT_SCHEMA = {
	type: 'object',
	properties: {
		beats: { type: 'array', items: { type: 'string' } },
	},
	required: ['beats'],
	additionalProperties: false,
} as const

/**
 * **Verdict**: the one pipeline in this genre that is allowed to know.
 *
 * ## Where the culprit comes from
 *
 * **Derived again, exactly as the case was opened** (contracts batch 2,
 * 2026-09-17): `core:task/cast-choices@1` shapes the room into the same option
 * list, `core:task/pick-by-hash@1` picks over it under the same
 * `$.input.sessionScope` with the same identity rule, and rendezvous hashing
 * reaches the suspect the create run reached — with nothing stored, nothing on
 * screen and nothing for a widget to render. `whodunit.ts`'s module header is
 * the long version of why the answer is a derivation rather than a row.
 *
 * The case's private half is still read here and nowhere else: this is the
 * single spec in the genre that wires `core:query/lorebook-triggers@1` — the
 * node that returns world lore, **character lore** and history through one
 * port — because the ending is written at the moment the game is over, and
 * hiding them then would only stop it being written.
 *
 * ## Who decides, and who is told
 *
 * `core:task/pair@1` puts the accusation and the pick in one document, under
 * `accused` and `culprit`, and the `verdict` junction compares them with
 * `{ path: 'accused', equalsPath: 'culprit' }`. Each branch is a **task**
 * publishing one word — 01 §4 keeps every write off a clause's inside — and
 * `outcome` folds whichever fired into the value the ledger takes.
 *
 * So the outcome of the game is decided by the graph and never by a model, and
 * the judge becomes what it should have been all along: the ending's
 * **planner**, told the verdict and the culprit and asked how the reveal goes.
 *
 * ⚠ **An accusation that never arrived cannot solve the case.** `pair@1` omits
 * an absent side rather than writing null, and `predicateHolds` answers false
 * when either side of an `equalsPath` is absent — so a run whose `accused`
 * published nothing falls through to `failed`, never to `solved`.
 *
 * ⚠ **The two key names ARE the predicate's paths.** `firstKey` and
 * `secondKey` are `quick` parameters, so a config panel renders them: renaming
 * them renames what the branch reads, and the branch then never fires. They are
 * preset values rather than literals because a node declaring a parameters slot
 * has to wire it (`paramsSlotWiring`) — this is the cost of that law, written
 * down because nothing else writes it down.
 *
 * ## Two writes, one outlet
 *
 * The verdict lands on `core:slot/case@1` through `set-state`, which is a Task
 * and not a write-class outlet; the ending is the outlet. And it is **applied,
 * not proposed**: `trustNarrator` governs what the
 * state keeper may do to the fiction's numbers, and this is not a number in the
 * fiction, it is the game's outcome. A verdict parked at a review gate is a
 * case that never closes and an *Accuse* button that never goes quiet.
 * @internal
 */
export const whodunitVerdictSpec = () =>
	compile(
		spec(WHODUNIT_VERDICT_SPEC_ID, {
			version: WHODUNIT_VERDICT_VERSION,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: 'verdict',
						/** Carried by the accusation's block and pressed from it alone. */
						venue: { kind: 'form' },
						audience: { see: ['participant'], act: ['owner'] },
						icon: 'gavel',
						label: { en: 'Name them' },
						description: {
							en: 'Say which suspect you are accusing. The case closes on the answer.',
						},
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: whodunitGenre,
				event: sessionEvents.sessionAction,
			})
			.task('accused', ($) =>
				C.readAnswer.v1({ payload: $.input.payload, form: $.input.form }),
			)
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
					/**
					 * The whole case, private entries and all — see the header.
					 * One node rather than three lanes because the judge wants
					 * every band and the distinction this genre draws
					 * everywhere else has stopped mattering.
					 */
					.chain('lore', (c) =>
						c.query('read', ($) =>
							C.lorebookTriggers.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
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
			/* ── who did it, and was the detective right ────────────── */
			/**
			 * The room, as the option list the answer was picked from.
			 *
			 * No `question` is wired and none belongs here: nobody is being asked
			 * anything at this point. `cast-choices` publishes the bare list beside
			 * its document precisely for a pick over the same options, and this is
			 * that pick — `exclude: 'personas'` in the preset below, because the
			 * detective is a cast member (0132) and the one thing they cannot be is
			 * the answer.
			 */
			.task('suspects', ($) =>
				C.castChoices.v1({ cast: $.gather.cast.read.cast, params: slot.params() }),
			)
			/**
			 * The culprit — derived, never looked up. The same list, the same
			 * scope and the same identity rule (`by: 'key'`) as `whodunit-create`,
			 * which is what makes rendezvous hashing answer the same suspect it
			 * answered when the case opened.
			 */
			.task('culprit', ($) =>
				C.pickByHash.v1({
					items: $.suspects.options,
					scopeKey: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			/**
			 * The accusation and the answer, side by side, so a predicate can see
			 * both — a junction branches on ONE port and `equalsPath` compares two
			 * paths of ONE document.
			 */
			.task('pairing', ($) =>
				C.pair.v1({
					first: $.accused.choice,
					second: $.culprit.chosenKey,
					params: slot.params(),
				}),
			)
			/**
			 * The verdict, decided by the graph.
			 *
			 * Each branch ends on a task publishing the word, because no write may
			 * sit inside a clause (01 §4) and the state write below is one.
			 * `join-text` over a single literal entry is how a document states a
			 * constant — Lair's `build` draft, the same construction.
			 */
			.junction('verdict', { on: ($: any) => $.pairing.main }, (r) =>
				r
					.when('solved', { path: 'accused', equalsPath: 'culprit' }, (c) =>
						c.task('word', () =>
							C.joinText.v1({
								items: [{ text: 'solved' }] as any,
								params: slot.params(),
							}),
						),
					)
					/**
					 * Everything else, and the list of what that covers is short and
					 * worth stating: a wrong name, and a run where one side of the
					 * pair never arrived. Neither is a solved case.
					 */
					.otherwise('failed', (c) =>
						c.task('word', () =>
							C.joinText.v1({
								items: [{ text: 'failed' }] as any,
								params: slot.params(),
							}),
						),
					),
			)
			/** Whichever branch fired — see `lair.ts`'s `voiceLines` for the fold. */
			.task('outcome', ($: any) =>
				C.joinText.v1({ items: $.verdict.values, params: slot.params() }),
			)
			/**
			 * What the judge is TOLD, as one document.
			 *
			 * `build-planner-context@1` publishes its `fields` onto the template
			 * context under their own names — the round trip that makes `{{tone}}`
			 * render — and that is the one surface through which a spec can hand an
			 * agent a fact this run computed. So the judge's row renders
			 * `{{verdict}}` and `{{culprit.label}}` where it would otherwise have
			 * rendered this genre's two fields, which that row does not use and the
			 * ending below still gets.
			 *
			 * The second side is the chosen OPTION rather than its key: the label is
			 * the name the case knows them by, and `character:7` names nobody to a
			 * model.
			 */
			.task('told', ($: any) =>
				C.pair.v1({
					first: $.outcome.text,
					second: $.culprit.main,
					params: slot.params(),
				}),
			)
			.task('contextBudget', ($: any) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('ending'),
					connection: slot.connectionOf('ending'),
					params: slot.params(),
				}),
			)
			.task('lore', ($: any) =>
				C.concatCandidates.v1({
					sources: [$.gather.history.read.band, $.gather.lore.read.main] as any,
				}),
			)
			.task('rank', ($: any) =>
				C.rankHybrid.v1({
					candidates: $.lore.candidates,
					budget: $.contextBudget.available,
					params: slot.params(),
				}),
			)
			/**
			 * The judge reads the case, the accusation and what it was told.
			 * `build-planner-context@1` declares no speaker, which is this
			 * agent's posture exactly — nobody in the room is judging — and it
			 * is a different pool from the narrator's below, so each ships its
			 * own instructions (`defaultPromptFor` resolves one row per pool per
			 * spec, which is also why this one cannot become a scene context).
			 *
			 * ⚠ `fields` carries the verdict and the culprit, not the session's
			 * genre fields — see `told` above.
			 */
			.task('judgeContext', ($: any) =>
				C.buildPlannerContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					fields: $.told.main,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/** Prose and no seed: a judgement is not a turn. */
			.task('judgeLines', ($: any) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.judgeContext.templateContext,
				}),
			)
			.task('judgePrompt', ($: any) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.judgeLines.messages,
					templateContext: $.judgeContext.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'judgeContext' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('judge'),
				}),
			)
			.oracle('judge', ($: any) =>
				C.generateJson.v1({
					context: $.judgePrompt.context,
					schema: WHODUNIT_VERDICT_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Weighing the accusation' } },
			)
			/**
			 * The verdict into the ledger, off the fold and not off a model.
			 *
			 * `solved` and `failed` are the two words the branches publish and
			 * ARE `core:slot/case@1`'s two closed states, spelled identically on
			 * purpose: `resolve-state-changes` validates a value against the
			 * slot's declared enum, and a third spelling would be refused and
			 * reported to nobody.
			 */
			.query('resolve', ($: any) =>
				C.resolveStateChanges.v1({
					changes: [{ owner: 'world', slot: 'case', value: $.outcome.text }] as any,
					scope: $.input.sessionScope,
					base: $.gather.state.read.version,
				}),
			)
			/** Applied rather than proposed — the outcome, not a detail of the fiction. */
			.task('apply', ($: any) =>
				C.setState.v1({
					changes: $.resolve.changes,
					scope: $.input.sessionScope,
					base: $.gather.state.read.version,
					params: slot.params(),
				}),
			)
			/* ── the ending ─────────────────────────────────────────────── */
			/**
			 * The narrator writes the last scene, and it is the one narrator
			 * call in this genre that knows who did it: the judge's document is
			 * on the `plan` port, and `{{beats}}` renders off it.
			 */
			.task('endingContext', ($: any) =>
				C.buildSceneContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					plan: $.judge.json,
					fields: $.input.fields,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			.task('endingLines', ($: any) =>
				C.processMessages.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.endingContext.templateContext,
					seedName: $.endingContext.seedName,
				}),
			)
			.task('endingPrompt', ($: any) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.endingLines.messages,
					templateContext: $.endingContext.templateContext,
					template: slot.template(),
					prompts: slot.prompts({ node: 'endingContext' }),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('ending'),
				}),
			)
			.oracle('ending', ($: any) =>
				C.generateText.v1({
					context: $.endingPrompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { stream: true, status: 'Writing the ending' } },
			)
			.outlet('save', ($: any) =>
				C.createMessage.v1({
					narration: true,
					text: $.ending.text,
				}),
			)
			.preset('whodunit', { label: 'Whodunit', default: true }, (p) =>
				p
					// The detective is a cast member and cannot be the answer.
					.params('suspects', { exclude: 'personas' })
					// The option's participant reference, as at creation — stable
					// where a name is not, and the same identity or a different
					// suspect is picked.
					.params('culprit', { by: 'key' })
					// ⚠ The junction's paths. Renaming these renames what the
					// predicate reads — see the header.
					.params('pairing', { firstKey: 'accused', secondKey: 'culprit' })
					// What the judge's prompt row renders them as.
					.params('told', { firstKey: 'verdict', secondKey: 'culprit' })
					// The verdict is applied, never proposed — see the header.
					.params('apply', { mode: 'apply' })
					// The judgement is read by the next node and by nobody else.
					.sampling('judge', { seedKey: 'sampling-background' }),
			)
			.build(),
	)
