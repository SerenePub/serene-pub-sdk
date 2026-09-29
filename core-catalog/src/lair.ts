/**
 * The **Lair** genre's two required pipelines: make a dungeon, and take a turn
 * inside it (plans/genres-and-showcase-plugins §3).
 *
 * ## The one idea
 *
 * Adventure asks *what does the world do to the player*. Lair asks the other
 * one: the person at the keyboard **is** the dungeon, and the party delving
 * into it is the AI. Everything structural follows from that inversion —
 * `personas.max: 0` (the master is not in the scene), `voice: 'narrator'` (the
 * pipeline has a voice of its own: the turn order's null entry, `carryOnEntry`,
 * the Narrate press and the seed line all name it — it does not mean a narrator
 * writes every turn) and, here in the spec, the one thing no shape value says:
 *
 * ## The composer's text is DIRECTION, not a line
 *
 * `$.input.text` reaches the planner as *instructions from whoever is running
 * this place*, never as a participant's turn — the planner's shipped prompt
 * says so in those words, and the seed line is the own voice's (the
 * Castellan's), so nothing the master types is ever continued as dialogue. That is a decision this pipeline
 * makes about prose the shape already declared nobody owns; a fourth shape
 * value for it would restate `personas: { max: 0 }` in a second vocabulary.
 *
 * ## A turn is the Castellan's (R8, owner F2/F4/F6 2026-09-28)
 *
 * The Lair is cast only, and **the person is the narrator**: their lines on
 * `main` are what the dungeon does. Nothing narrates a turn. A turn is one
 * run of the dungeon's steward, the Castellan (the turn order's pre-cast
 * entry, the pipeline's own voice):
 *
 *  1. the **planner** plans the party — who speaks, and why — never a dungeon
 *     event;
 *  2. then **either the knock** — one complete Castellan question on `main`,
 *     and nothing else — **or the play**:
 *     - the **beats row** in the Sanctum, first, whole (a list, nothing to
 *       stream), so the master reads the plan while the party speak;
 *     - the **lead delver's** line, streamed — the run's live row, opened
 *       only now, so nothing streams before it;
 *     - the rest of the party, complete rows in the planner's order;
 *  3. the **keeper** keeps the books: the world's changes filed at the beats
 *     row (`set-state`'s declared `worldRow`), a delver's at their own line.
 *
 * **Narrate** (`core#narrate`, `via: 'narrate'`) is the other thing the
 * Castellan does: one streamed narration on `main`, whichever composer
 * fired it — it is fiction, and the party only ever hear `main`. It is
 * routed first, ahead of the Sanctum and the story.
 *
 * ## One live row per execution path (F7, amended 2026-09-28)
 *
 * Each branch opens the row it fills where it needs it — the Castellan's
 * narration, its Sanctum talk, the picked delver, the knock, the lead
 * delver — and at most one of them runs in any execution. The voices after
 * the lead are ordinary complete writes on its channel, written after the
 * lead's row is finished (the live-row law, W1).
 *
 * ## Pick who speaks (B15, owner D2a 2026-09-27)
 *
 * A turn that names a delver — the `core#pick` turn control — takes the `pick.picked` branch: that delver answers alone, in
 * their own row, streamed, with no planner, no beats and no keeper. The
 * same branch re-voices a delver's row on a regenerate or swipe.
 *
 * ## What folds
 *
 * The beats are the Sanctum row's BODY (the B5 Plan fold is retired, R8);
 * the delvers' rows carry only their lines; a narration keeps its
 * **Thinking**. The planner's and keeper's traces stay on the receipt.
 *
 * ## Sanctum talk steers the story, when the person says so (R13)
 *
 * The genre field `sanctumSteers` (on by default, owner F3/QB 2026-09-28).
 * On, the planner reads the **unplayed talk** — the Sanctum rows since the
 * story's newest generated line, only people's lines and the Castellan's
 * replies to them (`session-history@1` `unplayedOnly`) — and the Castellan's
 * **scratchpad**, each as its own labelled block (`sideTalk`, `scratchpad`).
 * Off, it reads neither. The narration reads the talk while the switch is
 * on, or whenever Narrate was pressed in the Sanctum (`input.channel`).
 * The delvers and the keeper never read either. The Castellan rewrites its
 * scratchpad after each Sanctum reply (see `sanctumBranch`).
 *
 * ## The party knocks
 *
 * When the planner says the party is walking into a room nothing describes,
 * the turn **halts** and the Castellan asks the master to describe it instead
 * of playing a room nobody built. That is the U5d form machinery pointed at a
 * person rather than at a character: a `choices` block addressed to `owner`,
 * carried by the Castellan's question row on `main` (no beats, no voices, no
 * keeper — nothing was played), whose one option, *Describe <room>…*, fires
 * `core:spec/lair-room-answer`.
 *
 * **The knock asks for a description** (R9, owner rulings 2 + 6,
 * 2026-09-28). The option's press opens the collect modal: typed text is the
 * room, saved verbatim with no review (the master's own words); an empty
 * answer is the Castellan's draft, which the master edits at
 * `create-lore-entry`'s review gate before it lands. A draft **rejected** at
 * review re-opens the knock — a core rule in the app's review gate: an answer
 * rejected at review that wrote nothing is no answer. See `lairActions.ts`.
 *
 * Writing a lore entry is a `world` effect (R-15 *The line*) and
 * `worldBlockFunctions` refuses any block that names a `world` action —
 * **unless the block is addressed to the owner** (L1, ruled 2026-09-17),
 * which this one is, because the dungeon's master is the only person a
 * question about the dungeon could be put to.
 *
 * **Already described, no knock** (R7; R9, owner QC 2026-09-28): a room the
 * lorebook answers to, or one the master (or the Castellan) described in
 * prose — in the story on `main`, or formally in the Sanctum — is an open
 * door. The prose check reads both channels (`exitProse`, the union), and
 * the paragraph it found reaches the voices as `{{locationPassage}}`.
 *
 * ## Whether a room is new is the planner's guess, checked
 *
 * `unknownExit` is a field the planner fills; `undescribed-name@1` then
 * checks it against the book and recent prose (R7), so a wrong guess costs
 * nothing when the room is described, and one question when it is not.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_CASTELLAN_KEY, lairGenre, SANCTUM_CHANNEL } from './genres.js'
import { LAIR_ROOM_ANSWER_SPEC_ID } from './lairActions.js'
import { CASTELLAN_SCRATCHPAD_KEY } from './annexField.js'

/* ── create ─────────────────────────────────────────────────────────────── */

/** @internal */
export const LAIR_CREATE_SPEC_ID = 'core:spec/lair-create'
/** @internal */
export const LAIR_CREATE_VERSION = '1.0.0'

/** Where the Castellan's greeting lands — its declaration's channel, read at build like the cards' greeting channel. */
const CASTELLAN_GREETING_CHANNEL =
	lairGenre.envoys?.find((e) => e.key === LAIR_CASTELLAN_KEY)?.greeting?.channel ?? 'main'

/**
 * The genre's required member (24 §3): what happens when a Lair session is
 * created.
 *
 * **The dungeon welcomes nobody, but its steward welcomes its master** (R6,
 * owner F1 2026-09-28). The cards' greetings are off — the party are delvers
 * who have not arrived yet — so `collect` and `seed` still write nothing,
 * as the guide's do. Then the Castellan's declared greeting
 * (`EnvoyDecl.greeting`), read through `core:query/envoy-greeting@1` and
 * interpolated for this session, is written on the Sanctum under its name —
 * only when it has text, which it lacks when the Castellan is not seated.
 *
 * No model call, deliberately: creation is a synchronous action a person is
 * waiting on (see `adventure-create` for the argument at length). The
 * welcome is declared, so it is instant, translatable and reviewable; the
 * Castellan's first *reply* is where it tailors itself to the dungeon.
 * @internal
 */
export const lairCreateSpec = () =>
	compile(
		spec(LAIR_CREATE_SPEC_ID, {
			version: LAIR_CREATE_VERSION,
			taxonomy: {
				role: 'create',
			},
			genre: {
				name: lairGenre.name,
				family: lairGenre.family,
				description: lairGenre.description,
				shape: lairGenre.shape,
				events: lairGenre.events as Record<
					string,
					{ required?: boolean; open?: boolean }
				>,
				// R4: the host names the person's lines off this row.
				playerLabel: lairGenre.playerLabel,
				// R6: the Castellan — which speakers this genre brings is
				// read off this row, as the writing room's scribe is.
				envoys: lairGenre.envoys,
			},
		})
			.inlet('input', C.sessionCreated.v1(), {
				genre: lairGenre,
				event: sessionEvents.sessionCreated,
			})
			.query('collect', ($) => C.sessionGreetings.v1({ scope: $.input.sessionScope }))
			.outlet('seed', ($) =>
				C.seedGreetings.v1({
					greetings: $.collect.greetings,
					channel: lairGenre.shape?.greeting?.channel ?? 'main',
				}),
			)
			/** The Castellan's greeting, interpolated — empty when it is not seated. */
			.query('welcome', ($) =>
				C.envoyGreeting.v1({ scope: $.input.sessionScope, params: slot.params() }),
			)
			.junction('greet', { on: ($: any) => $.welcome.text }, (g) =>
				g.when('greets', { truthy: true }, (c) =>
					c.outlet('write', ($: any) =>
						C.createMessage.v1({
							text: $.welcome.text,
							channel: CASTELLAN_GREETING_CHANNEL,
							speaker: `envoy:${LAIR_CASTELLAN_KEY}`,
						}),
					),
				),
			)
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p.params('welcome', { envoy: LAIR_CASTELLAN_KEY }),
			)
			.build(),
	)

/* ── respond ────────────────────────────────────────────────────────────── */

/** @internal */
export const LAIR_RESPOND_SPEC_ID = 'core:spec/lair-respond'
/** @internal */
export const LAIR_RESPOND_VERSION = '1.0.0'

/** How many of the party may speak in one turn. Mandatory (F9) and small. */
const MAX_SPEAKERS = 4

/** The values the keeper may set, by the names the prompts use. */
const TRACKED_SLOTS = ['hp', 'stamina', 'mood', 'trust', 'location', 'floor', 'gold']

/**
 * What the planner answers with.
 *
 * Adventure's schema with the sky taken out and the door put in. Every
 * property is required and every one is a string, an array or an object of
 * those, because the llama.cpp family compiles this to a GBNF grammar and
 * refuses anything outside that set rather than loosening it — see
 * `adventure.ts` for the full argument.
 *
 * `unknownExit` and `knockQuestion` are the halt: the first is the predicate
 * the `turn` junction reads, the second is what the master is asked. Both are
 * written on every turn, most of them empty, because a schema this strict has
 * no optional properties to offer.
 * @internal
 */
export const LAIR_PLAN_SCHEMA = {
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
		 * The name the party is heading for that the dungeon does not hold an
		 * entry for. Empty on every ordinary turn — which is most of them.
		 */
		unknownExit: { type: 'string' },
		/** How the Castellan puts that to the dungeon's master. Empty with it. */
		knockQuestion: { type: 'string' },
		/**
		 * Where this happens. One hint rather than Adventure's three: a
		 * dungeon has no time of day and no weather, and a genre that asked
		 * for them would teach its planner to plan a sky.
		 */
		worldHints: {
			type: 'object',
			properties: { location: { type: 'string' } },
			required: ['location'],
			additionalProperties: false,
		},
	},
	required: ['beats', 'speakers', 'unknownExit', 'knockQuestion', 'worldHints'],
	additionalProperties: false,
} as const

/**
 * What the state-keeper answers with — Adventure's two lists over this genre's
 * vocabulary.
 *
 * ⚠ `direction` and `whisper` are **not** in `TRACKED_SLOTS`, and their
 * absence is the point: they hold what the dungeon's master told the narrator
 * and the cast, and a keeper that could rewrite them would be a model editing
 * its own instructions between two turns.
 * @internal
 */
export const LAIR_KEEPER_SCHEMA = {
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

/**
 * The knock's one option's key (R9, owner rulings 2 + 6, 2026-09-28): the
 * knock asks the master to **describe** the room — *Describe The Drowned
 * Hall…*, the label built from the room's name at run time (`describeLabel`).
 * Its press opens the collect modal (`lair-room-answer#room` collects
 * optional text). Was `KNOCK_OPTIONS`, two options (build · improvise).
 */
const KNOCK_OPTION_KEY = 'describe'


/**
 * How many of the newest rows, across the story and the Sanctum, the knock's
 * prose check reads (R9) — the check's own `window` default, so the read
 * never holds fewer rows than the check would look at.
 */
const EXIT_PROSE_ROWS = 40

/** How many of the story's newest rows the Castellan reads while it talks (R6). */
const SANCTUM_STORY_ROWS = 12

/**
 * **The talk window** (R13): how much unplayed Sanctum talk the planner and
 * the narration read, newest kept. Each talk read's own `limit`, set by the
 * preset — never a second count beside it. (`session-history@1` marks no
 * param `shared`, so each read keeps its own.)
 */
const SANCTUM_TALK_ROWS = 12

/** How many of the Sanctum's newest rows the scratchpad rewrite reads (R13): the exchange just had. */
const SCRATCHPAD_EXCHANGE_ROWS = 4

/**
 * What the scratchpad rewrite answers with (R13): the whole scratchpad,
 * rewritten. One required string, for the grammar-compiling families — see
 * `LAIR_PLAN_SCHEMA`.
 * @internal
 */
export const LAIR_SCRATCHPAD_SCHEMA = {
	type: 'object',
	properties: { scratchpad: { type: 'string' } },
	required: ['scratchpad'],
	additionalProperties: false,
} as const

/** The Castellan, as a participant reference — the name every row it writes carries. */
const CASTELLAN = `envoy:${LAIR_CASTELLAN_KEY}` as const

/** Where the base of every story-side key sits, so a reference reads once. */
const STORY = 'via.turn.channel.story.pick'

/** The unplayed-talk reads (R13): the planner's, and the narration's two. */
const TALK_READS = [
	`${STORY}.planned.steer.on.talk`,
	'via.narrate.talk.pressed.read',
	'via.narrate.talk.steered.read',
] as const

/** The narration's read when nothing crosses (R13): a window of none. */
const NO_TALK_READ = 'via.narrate.talk.none.read'

/** Where the Sanctum branch sits. */
const SANCTUM = 'via.turn.channel.sanctum'

/**
 * **The Castellan talks in the Sanctum** (lair re-plan R6, owner F1/F2
 * 2026-09-28): a line on the `sanctum` channel gets one streamed reply there,
 * under the Castellan's name — out of the fiction, with the Dungeon Master.
 *
 * The Guide's envoy road: `build-template-context` with the Castellan as the
 * `speaker` (its card, `{{char}}`, the seed name; and the earshot filter, so a
 * whisper meant for a delver never reaches it) and its own instructions at
 * `envoy:castellan`. It reads, beside the shared ranked lore:
 *
 *  - every room the dungeon holds and the one the party stand in
 *    (`gather.rooms`, as `{{knownLocations}}` / `{{locationEntry}}`);
 *  - the state;
 *  - **the Sanctum's own history** as the conversation (`talk`);
 *  - **the story's newest 12 rows** as prose in its instructions
 *    (`story`, `{{recentStory}}`) — so it can discuss what happened without
 *    mistaking story lines for table talk.
 *
 * Its own row, opened here (R8: each branch opens the row it fills). Nothing
 * here plans, voices or keeps the books: those are the story's turn
 * (`channel.story`). The story's history read is `main`; what of this talk
 * steers the next turn is R13's (`planned.steer`, `via.narrate.talk`).
 *
 * **The scratchpad** (R13, owner QB 2026-09-28): the Castellan reads its own
 * running notes here (`{{scratchpad}}`), and **rewrites them after each
 * reply** — one Background JSON call over the exchange just had
 * (`padWrite`, the whole scratchpad back), written to the annex field
 * `castellan-scratchpad` only when the answer has text. A separate call
 * rather than a tail on the reply, because the reply streams: a notes block
 * at its end would stream into the person's view before a save could strip
 * it. The person may edit the notes by hand (the Session data panel).
 */
const sanctumBranch = (s: any) =>
	s
		.outlet('placeholder', ($: any) =>
			C.createMessage.v1({
				generating: true,
				channel: SANCTUM_CHANNEL,
				speaker: CASTELLAN,
				row: $.input.messageId,
			}),
		)
		.query('talk', ($: any) =>
			C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
		)
		.query('story', ($: any) =>
			C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
		)
		/** Its scratchpad, as text (R13) — the key read off the gathered annex view. */
		.task('pad', ($: any) =>
			C.joinText.v1({
				items: [$.gather.scratchpad.read.main] as any,
				params: slot.params(),
			}),
		)
		.task('context', ($: any) =>
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
		.task('lines', ($: any) =>
			C.processMessages.v1({
				messages: $.via.turn.channel.sanctum.talk.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.turn.channel.sanctum.context.templateContext,
				seedName: $.via.turn.channel.sanctum.context.seedName,
			}),
		)
		.task('prompt', ($: any) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				groups: $.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.turn.channel.sanctum.lines.messages,
				templateContext: $.via.turn.channel.sanctum.context.templateContext,
				template: slot.template(),
				// The envoy's text arrives through `templateContext` — see
				// the guide's `prompt` node for why this one-hop read is not
				// how it gets there.
				prompts: slot.prompts({ node: 'via.turn.channel.sanctum.context' }),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf('via.turn.channel.sanctum.say'),
			}),
		)
		/** This execution path's one streaming step. */
		.oracle(
			'say',
			($: any) =>
				C.generateText.v1({
					context: $.via.turn.channel.sanctum.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
			{ expose: { stream: true, status: 'Considering' } },
		)
		.outlet('save', ($: any) =>
			C.updateMessage.v1({
				target: $.via.turn.channel.sanctum.placeholder.messageId,
				text: $.via.turn.channel.sanctum.say.text,
				thinking: $.via.turn.channel.sanctum.say.thinking,
			}),
		)
		/* ── the scratchpad, rewritten after the reply (R13) ─────────────── */
		/** The exchange just had: the Sanctum's newest rows, the saved reply included. */
		.query('padExchange', ($: any) =>
			C.sessionHistory.v1({ scope: $.input.sessionScope, params: slot.params() }),
		)
		.task('padContext', ($: any) =>
			C.buildTemplateContext.v1({
				cast: $.gather.cast.read.cast,
				speaker: CASTELLAN,
				state: $.gather.state.read.state,
				locationEntries: $.gather.rooms.read.entries,
				scratchpad: $.via.turn.channel.sanctum.pad.text,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
		)
		.task('padLines', ($: any) =>
			C.proseTranscript.v1({
				messages: $.via.turn.channel.sanctum.padExchange.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.turn.channel.sanctum.padContext.templateContext,
			}),
		)
		.task('padPrompt', ($: any) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				groups: $.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.turn.channel.sanctum.padLines.messages,
				templateContext: $.via.turn.channel.sanctum.padContext.templateContext,
				template: slot.template(),
				prompts: slot.prompts({ node: `${SANCTUM}.padContext` }),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf(`${SANCTUM}.padWrite`),
			}),
		)
		.oracle(
			'padWrite',
			($: any) =>
				C.generateJson.v1({
					context: $.via.turn.channel.sanctum.padPrompt.context,
					schema: LAIR_SCRATCHPAD_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
			{ expose: { status: 'The Castellan takes notes' } },
		)
		/** The rewritten scratchpad, off its document (the preset's path). */
		.task('padText', ($: any) =>
			C.parseJson.v1({
				text: $.via.turn.channel.sanctum.padWrite.text,
				params: slot.params(),
			}),
		)
		/**
		 * Written only when the answer has text: an empty or unreadable
		 * answer leaves the scratchpad as it was. The key is declared in
		 * `CORE_ANNEX_FIELDS` (audience: the Castellan alone).
		 */
		.junction('padKeep', { on: ($: any) => $.via.turn.channel.sanctum.padText.value }, (j: any) =>
			j.when('kept', { truthy: true }, (k: any) =>
				k.outlet('write', ($: any) =>
					C.setSessionAnnex.v1({
						value: {
							[CASTELLAN_SCRATCHPAD_KEY]: $.via.turn.channel.sanctum.padText.value,
						} as any,
						params: slot.params(),
					}),
				),
			),
		)

/**
 * **The Castellan narrates** (R8, owner F2 2026-09-28): the `core#narrate`
 * turn control, fired from either composer (`via: 'narrate'`). What the
 * dungeon does next, in the third person, on `main` — it is fiction, and the
 * party only ever hear `main`. No planner and no voices: the party answer on
 * the next turn. The keeper runs after it, on the spine (`keep`).
 *
 * The scene context's builder, under the Castellan's narration row (the
 * build-scene-context pool's Lair row), with no turn direction: Narrate is
 * "what happens next, with no new direction".
 *
 * **The unplayed talk** (R13): the narration reads the Sanctum talk since the
 * story's last line (`sideTalk`) when **Narrate was pressed in the Sanctum**
 * — that press is the person saying "play this", whatever the switch says —
 * or while the session's _Sanctum talk steers the story_ is on. The `talk`
 * junction routes on the pressed channel and the genre field side by side
 * (`asked`, a `pair`); every branch ends in the same read, and the
 * junction hands the fired one's rows on (`talk.messages`). Pressed in the
 * Sanctum with the switch on, both fire and the first answers; neither,
 * and the `otherwise` reads a window of none.
 */
const narrateBranch = (n: any) =>
	n
		.outlet('placeholder', ($: any) =>
			C.createMessage.v1({
				generating: true,
				channel: 'main',
				speaker: CASTELLAN,
				row: $.input.messageId,
			}),
		)
		/** Where Narrate was pressed, beside the session's fields — one document to route on. */
		.task('asked', ($: any) =>
			C.pair.v1({
				first: $.input.channel,
				second: $.input.fields,
				params: slot.params(),
			}),
		)
		.junction('talk', { on: ($: any) => $.via.narrate.asked.main }, (j: any) =>
			j
				.when('pressed', { path: 'channel', equals: SANCTUM_CHANNEL }, (c: any) =>
					c.query('read', ($: any) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				)
				.when('steered', { path: 'fields.sanctumSteers', truthy: true }, (c: any) =>
					c.query('read', ($: any) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				)
				/**
				 * Neither: nothing crosses. The same read with a window of
				 * none (`limit: 0`), because a junction hands on a port only
				 * when every branch — its `otherwise` too — publishes it.
				 */
				.otherwise('none', (c: any) =>
					c.query('read', ($: any) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					),
				),
		)
		.task('context', ($: any) =>
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
		.task('lines', ($: any) =>
			C.processMessages.v1({
				messages: $.gather.history.read.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.narrate.context.templateContext,
				seedName: $.via.narrate.context.seedName,
			}),
		)
		.task('prompt', ($: any) =>
			C.assemble.v2({
				candidates: $.rank.candidates,
				decisions: $.rank.decisions,
				groups: $.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.narrate.lines.messages,
				templateContext: $.via.narrate.context.templateContext,
				template: slot.template(),
				prompts: slot.prompts({ node: 'via.narrate.context' }),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf('via.narrate.say'),
			}),
		)
		.oracle(
			'say',
			($: any) =>
				C.generateText.v1({
					context: $.via.narrate.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
			{ expose: { stream: true, status: 'The Castellan narrates' } },
		)
		/** The narration, and its reasoning folded as the row's Thinking. */
		.outlet('save', ($: any) =>
			C.updateMessage.v1({
				target: $.via.narrate.placeholder.messageId,
				text: $.via.narrate.say.text,
				thinking: $.via.narrate.say.thinking,
			}),
		)

/**
 * **A delver answers alone** — Pick who speaks, or a verb re-voicing their
 * row (B15, owner D2a 2026-09-27): no planner, no beats, no keeper.
 */
const pickedBranch = (d: any) =>
	d
		/** Their own row from its first millisecond: the inlet's `characterId`. */
		.outlet('placeholder', ($: any) =>
			C.createMessage.v1({
				generating: true,
				characterId: $.input.characterId,
				row: $.input.messageId,
				channel: $.input.channel,
			}),
		)
		/**
		 * The delver, by the id the pick named — the side-character fact's
		 * `characterId`, which the builder resolves against the seated cast
		 * for the card, `{{char}}` and the seed line. The same `lair-voice`
		 * prompt a planned turn's voices get (one row per pool per spec).
		 */
		.task('context', ($: any) =>
			C.buildSideCharacterContext.v1({
				cast: $.gather.cast.read.cast,
				sideCharacter: { characterId: $.input.characterId } as any,
				state: $.gather.state.read.state,
				locationEntries: $.gather.rooms.read.entries,
				prompts: slot.prompts(),
				variables: slot.variables(),
			}),
		)
		/** This delver's own private lore — see the voices below. */
		.query('lore', ($: any) =>
			C.characterLore.v1({
				scope: $.input.sessionScope,
				speaker: $.via.turn.channel.story.pick.picked.context.speaker,
				params: slot.params({ node: 'gather.worldLore.read' }),
			}),
		)
		.task('pool', ($: any) =>
			C.concatCandidates.v1({
				sources: [
					$.gather.history.read.band,
					$.gather.worldLore.read.main,
					$.gather.historyEntries.read.main,
					$.via.turn.channel.story.pick.picked.lore.main,
				] as any,
			}),
		)
		.task('rank', ($: any) =>
			C.rankHybrid.v1({
				candidates: $.via.turn.channel.story.pick.picked.pool.candidates,
				budget: $.contextBudget.available,
				params: slot.params(),
			}),
		)
		.task('lines', ($: any) =>
			C.processMessages.v1({
				messages: $.gather.history.read.messages,
				cast: $.gather.cast.read.cast,
				templateContext: $.via.turn.channel.story.pick.picked.context.templateContext,
				seedName: $.via.turn.channel.story.pick.picked.context.seedName,
			}),
		)
		.task('prompt', ($: any) =>
			C.assemble.v2({
				candidates: $.via.turn.channel.story.pick.picked.rank.candidates,
				decisions: $.via.turn.channel.story.pick.picked.rank.decisions,
				groups: $.via.turn.channel.story.pick.picked.rank.groups,
				budget: $.contextBudget.available,
				messages: $.via.turn.channel.story.pick.picked.lines.messages,
				templateContext: $.via.turn.channel.story.pick.picked.context.templateContext,
				template: slot.template(),
				prompts: slot.prompts({ node: `${STORY}.picked.context` }),
				variables: slot.variables(),
				params: slot.params(),
				connection: slot.connectionOf(`${STORY}.picked.say`),
			}),
		)
		/** The delver's line, streamed into their own row. */
		.oracle(
			'say',
			($: any) =>
				C.generateText.v1({
					context: $.via.turn.channel.story.pick.picked.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
			{ expose: { stream: true, status: 'Voicing the party' } },
		)
		.outlet('save', ($: any) =>
			C.updateMessage.v1({
				target: $.via.turn.channel.story.pick.picked.placeholder.messageId,
				text: $.via.turn.channel.story.pick.picked.say.text,
				thinking: $.via.turn.channel.story.pick.picked.say.thinking,
			}),
		)

/**
 * **The knock** (B13; R8; R9): the planner says the party are walking into a
 * room nothing describes, so the Castellan asks the master to describe it
 * instead of playing. One complete question row on `main` under the
 * Castellan's name, carrying the question as a `choices` block with one
 * option — *Describe <room>…* — and no beats, no voices, no keeper: nothing
 * was played. On `main` because `openFormOf` is main-only, and a Sanctum form
 * would be staled by the next line of talk (owner QC, 2026-09-28: the
 * question stays on `main`).
 *
 * ⚠ **The row's own Regenerate is refused** (R9): re-driving it re-plans the
 * turn, and a plan that now plays would put the lead delver's line in the
 * Castellan's question row. The knock is the whole of its turn, so the
 * composer's Regenerate (`core#retake`) takes that turn again instead —
 * `retakeRowRefusal` in the app says so.
 */
const knockBranch = (c: any) =>
	c
		/**
		 * The planner's own document, read a second time at a different
		 * path: a data reference is `{node, port}` with no sub-path, so the
		 * speakers and the question cannot come off one node.
		 */
		.task('question', ($: any) =>
			C.parseJson.v1({
				text: $.via.turn.channel.story.pick.planned.planWrite.text,
				params: slot.params(),
			}),
		)
		/**
		 * The one option's label, *Describe The Drowned Hall…* (R9): the
		 * room's name with the ellipsis a press that asks for more carries,
		 * then the verb before it — two joins, because a join has one
		 * separator.
		 */
		.task('named', ($: any) =>
			C.joinText.v1({
				items: [$.via.turn.channel.story.pick.planned.exitCheck.undescribed, '…'] as any,
				params: slot.params(),
			}),
		)
		.task('describeLabel', ($: any) =>
			C.joinText.v1({
				items: ['Describe', $.via.turn.channel.story.pick.planned.door.knock.named.text] as any,
				params: slot.params(),
			}),
		)
		/**
		 * The question as a `choices` block **addressed to the owner** (R-15
		 * *Forms*). ⚠ `addressee: 'owner'` is load-bearing twice over since
		 * L1: it decides who may press, AND it is the one thing that lets
		 * these options name a `world` action at all.
		 *
		 * **One option** (R9): describe the room. Its press opens the collect
		 * modal; typed text is the room, verbatim, and an empty answer is
		 * the Castellan's draft behind review (`lairActions.ts`).
		 */
		.task('choices', ($: any) =>
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
				action: `${LAIR_ROOM_ANSWER_SPEC_ID}#room`,
				addressee: 'owner',
				cast: $.gather.cast.read.cast,
				// The room itself, carried to the answer's run on the block
				// (B12): *Answer the door* names the entry it writes from this.
				referent: $.via.turn.channel.story.pick.planned.exitCheck.undescribed,
			}),
		)
		/** The question's row — this path's live row, never streamed. */
		.outlet('placeholder', ($: any) =>
			C.createMessage.v1({
				generating: true,
				channel: 'main',
				speaker: CASTELLAN,
				row: $.input.messageId,
			}),
		)
		.outlet('save', ($: any) =>
			C.updateMessage.v1({
				target: $.via.turn.channel.story.pick.planned.door.knock.placeholder.messageId,
				// The question as prose — `make-choices`' own `text`.
				text: $.via.turn.channel.story.pick.planned.door.knock.choices.text,
				blocks: $.via.turn.channel.story.pick.planned.door.knock.choices.blocks,
			}),
		)

/**
 * **The play** (R8): the beats in the Sanctum, then the party.
 */
const playBranch = (c: any) =>
	c
		/**
		 * Who of the party speaks — the planner's `speakers`, read off its
		 * document (the preset's path) — split into the **lead**, whose line
		 * streams, and the rest.
		 */
		.task('speaking', ($: any) =>
			C.parseJson.v1({
				text: $.via.turn.channel.story.pick.planned.planWrite.text,
				params: slot.params(),
			}),
		)
		.task('party', ($: any) =>
			C.splitFirst.v1({
				items: $.via.turn.channel.story.pick.planned.door.play.speaking.items,
			}),
		)
		/**
		 * The beats as a markdown list — the Sanctum row's BODY (F4: beats
		 * go to the Sanctum; the B5 Plan fold is retired).
		 */
		.task('beats', ($: any) =>
			C.listSection.v1({
				json: $.via.turn.channel.story.pick.planned.planWrite.json,
				params: slot.params(),
			}),
		)
		/**
		 * **The Castellan's beats row, first.** Complete — a list from the
		 * planner's JSON, nothing to stream — and on another channel, so it
		 * is an ordinary write, never a live row. It lands before any voice,
		 * so the master reads the plan while the party speak. A plan with
		 * no beats posts nothing.
		 */
		.junction('plan', { on: ($: any) => $.via.turn.channel.story.pick.planned.door.play.beats.text }, (j: any) =>
			j.when('posted', { truthy: true }, (p: any) =>
				p.outlet('write', ($: any) =>
					C.createMessage.v1({
						text: $.via.turn.channel.story.pick.planned.door.play.beats.text,
						channel: SANCTUM_CHANNEL,
						speaker: CASTELLAN,
					}),
				),
			),
		)
		/**
		 * **The lead delver** — the first speaker the planner named. Their
		 * row is the run's live row, opened NOW, after the beats: nothing
		 * streams before their line. A plan naming nobody skips it.
		 */
		.junction('lead', { on: ($: any) => $.via.turn.channel.story.pick.planned.door.play.party.first }, (j: any) =>
			j.when('speaks', { truthy: true }, (l: any) =>
				l
					.task('context', ($: any) =>
						C.buildSideCharacterContext.v1({
							cast: $.gather.cast.read.cast,
							sideCharacter: $.via.turn.channel.story.pick.planned.door.play.party.first,
							state: $.gather.state.read.state,
							plan: $.via.turn.channel.story.pick.planned.planWrite.json,
							locationEntries: $.gather.rooms.read.entries,
							// A room described only in prose (R9): its paragraph.
							locationPassage: $.via.turn.channel.story.pick.planned.exitCheck.passage,
							prompts: slot.prompts(),
							variables: slot.variables(),
						}),
					)
					.outlet('placeholder', ($: any) =>
						C.createMessage.v1({
							generating: true,
							channel: 'main',
							speaker: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.context.speaker,
							row: $.input.messageId,
						}),
					)
					.query('lore', ($: any) =>
						C.characterLore.v1({
							scope: $.input.sessionScope,
							speaker: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.context.speaker,
							params: slot.params({ node: 'gather.worldLore.read' }),
						}),
					)
					.task('pool', ($: any) =>
						C.concatCandidates.v1({
							sources: [
								$.gather.history.read.band,
								$.gather.worldLore.read.main,
								$.gather.historyEntries.read.main,
								$.via.turn.channel.story.pick.planned.door.play.lead.speaks.lore.main,
							] as any,
						}),
					)
					.task('rank', ($: any) =>
						C.rankHybrid.v1({
							candidates: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.pool.candidates,
							budget: $.contextBudget.available,
							params: slot.params(),
						}),
					)
					.task('lines', ($: any) =>
						C.processMessages.v1({
							messages: $.gather.history.read.messages,
							cast: $.gather.cast.read.cast,
							templateContext: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.context.templateContext,
							seedName: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.context.seedName,
						}),
					)
					.task('prompt', ($: any) =>
						C.assemble.v2({
							candidates: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.rank.candidates,
							decisions: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.rank.decisions,
							groups: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.rank.groups,
							budget: $.contextBudget.available,
							messages: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.lines.messages,
							templateContext: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.context.templateContext,
							template: slot.template(),
							prompts: slot.prompts({ node: `${STORY}.planned.door.play.lead.speaks.context` }),
							variables: slot.variables(),
							params: slot.params(),
							connection: slot.connectionOf(`${STORY}.planned.door.play.lead.speaks.say`),
						}),
					)
					/** This execution path's one streaming step: the lead's line. */
					.oracle(
						'say',
						($: any) =>
							C.generateText.v1({
								context: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.prompt.context,
								connection: slot.connection(),
								sampling: slot.sampling(),
								params: slot.params(),
							}),
						{ expose: { stream: true, status: 'Voicing the party' } },
					)
					.outlet('save', ($: any) =>
						C.updateMessage.v1({
							target: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.placeholder.messageId,
							text: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.say.text,
							thinking: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.say.thinking,
						}),
					),
			),
		)
		/**
		 * **The rest of the party** — one call per delver after the lead (B16,
		 * owner D1a 2026-09-27), each a complete row under their own name, in
		 * the planner's order (W1b). Written after the lead's row is finished,
		 * so they race nothing (the live-row law); never streamed (a step in
		 * an `each` may not).
		 */
		.each(
			'voices',
			{
				over: ($: any) => $.via.turn.channel.story.pick.planned.door.play.party.rest,
				max: MAX_SPEAKERS,
				mode: 'parallel',
			},
			(m: any) =>
				m
					.task('context', ($: any) =>
						C.buildSideCharacterContext.v1({
							cast: $.gather.cast.read.cast,
							sideCharacter: $.via.turn.channel.story.pick.planned.door.play.voices.item,
							// Where this is, what shape they are in, and
							// what they were whispered.
							state: $.gather.state.read.state,
							plan: $.via.turn.channel.story.pick.planned.planWrite.json,
							locationEntries: $.gather.rooms.read.entries,
							locationPassage: $.via.turn.channel.story.pick.planned.exitCheck.passage,
							prompts: slot.prompts(),
							variables: slot.variables(),
						}),
					)
					/**
					 * **This delver's own private lore** (W1, 2026-09-17): the
					 * lane is inside the clause because a scope belongs to the
					 * run and a speaker belongs to the iteration. See
					 * `adventure.ts` for the argument at length.
					 */
					.query('lore', ($: any) =>
						C.characterLore.v1({
							scope: $.input.sessionScope,
							speaker: $.via.turn.channel.story.pick.planned.door.play.voices.item.context.speaker,
							params: slot.params({ node: 'gather.worldLore.read' }),
						}),
					)
					.task('pool', ($: any) =>
						C.concatCandidates.v1({
							sources: [
								$.gather.history.read.band,
								$.gather.worldLore.read.main,
								$.gather.historyEntries.read.main,
								$.via.turn.channel.story.pick.planned.door.play.voices.item.lore.main,
							] as any,
						}),
					)
					/** Ranked per voice, on its OWN params — see `adventure.ts`. */
					.task('rank', ($: any) =>
						C.rankHybrid.v1({
							candidates: $.via.turn.channel.story.pick.planned.door.play.voices.item.pool.candidates,
							budget: $.contextBudget.available,
							params: slot.params(),
						}),
					)
					.task('lines', ($: any) =>
						C.processMessages.v1({
							messages: $.gather.history.read.messages,
							cast: $.gather.cast.read.cast,
							templateContext: $.via.turn.channel.story.pick.planned.door.play.voices.item.context.templateContext,
							seedName: $.via.turn.channel.story.pick.planned.door.play.voices.item.context.seedName,
						}),
					)
					.task('prompt', ($: any) =>
						C.assemble.v2({
							candidates: $.via.turn.channel.story.pick.planned.door.play.voices.item.rank.candidates,
							decisions: $.via.turn.channel.story.pick.planned.door.play.voices.item.rank.decisions,
							groups: $.via.turn.channel.story.pick.planned.door.play.voices.item.rank.groups,
							budget: $.contextBudget.available,
							messages: $.via.turn.channel.story.pick.planned.door.play.voices.item.lines.messages,
							templateContext: $.via.turn.channel.story.pick.planned.door.play.voices.item.context.templateContext,
							template: slot.template(),
							prompts: slot.prompts({ node: `${STORY}.planned.door.play.voices.item.context` }),
							variables: slot.variables(),
							params: slot.params(),
							connection: slot.connectionOf(`${STORY}.planned.door.play.voices.item.say`),
						}),
					)
					.oracle(
						'say',
						($: any) =>
							C.generateText.v1({
								context: $.via.turn.channel.story.pick.planned.door.play.voices.item.prompt.context,
								connection: slot.connection(),
								sampling: slot.sampling(),
								params: slot.params(),
							}),
						{ expose: { status: 'Voicing the party' } },
					)
					/**
					 * **This delver's own row** (B16): the line, complete, under
					 * the delver's name — `speaker` is the participant
					 * reference the context resolved, and the host derives the
					 * row's `characterId` from it.
					 */
					.outlet('line', ($: any) =>
						C.createMessage.v1({
							text: $.via.turn.channel.story.pick.planned.door.play.voices.item.say.text,
							speaker: $.via.turn.channel.story.pick.planned.door.play.voices.item.context.speaker,
						}),
					)
					/** The iteration's value is its last node's ports: the line's text. */
					.task('said', ($: any) =>
						C.joinText.v1({
							items: [{ text: $.via.turn.channel.story.pick.planned.door.play.voices.item.say.text }] as any,
							params: slot.params(),
						}),
					),
		)
		/** The rest's lines, joined in the planner's order … */
		.task('voiceLines', ($: any) =>
			C.joinText.v1({
				items: $.via.turn.channel.story.pick.planned.door.play.voices.values,
				params: slot.params(),
			}),
		)
		/** … after the lead's: what the party said this turn. */
		.task('partyLines', ($: any) =>
			C.joinText.v1({
				items: [
					{ text: $.via.turn.channel.story.pick.planned.door.play.lead.speaks.say.text },
					{ text: $.via.turn.channel.story.pick.planned.door.play.voiceLines.text },
				] as any,
				params: slot.params(),
			}),
		)
		/** The turn as the keeper reads it: the Castellan's beats, then the party. */
		.task('reply', ($: any) =>
			C.joinText.v1({
				items: [
					{ text: $.via.turn.channel.story.pick.planned.door.play.beats.text },
					{ text: $.via.turn.channel.story.pick.planned.door.play.partyLines.text },
				] as any,
				params: slot.params(),
			}),
		)

/**
 * The story's turn (the `otherwise` of the Sanctum): a picked delver alone,
 * or the Castellan's planned turn — planner, then the knock or the play.
 */
const storyBranch = (st: any) =>
	st.junction('pick', { on: ($: any) => $.input.characterId }, (who: any) =>
		who
			.when('picked', { truthy: true }, (d: any) => pickedBranch(d))
			.otherwise('planned', (c: any) =>
				c
					/* ── plan ─────────────────────────────────────────────────── */
					/**
					 * **Sanctum talk steers the story** (R13, owner F3/QB
					 * 2026-09-28): while the session's switch is on (the
					 * default), the planner reads the talk since the story's
					 * last line — only that, never older talk, the greeting or
					 * a beats row (`unplayedOnly`) — and the Castellan's
					 * scratchpad. Off, it reads neither: the Sanctum is for
					 * brainstorming, and only Nudge and a filed room cross.
					 */
					.junction('steer', { on: ($: any) => $.input.fields }, (j: any) =>
						j.when('on', { path: 'sanctumSteers', truthy: true }, (on: any) =>
							on
								.query('talk', ($: any) =>
									C.sessionHistory.v1({
										scope: $.input.sessionScope,
										params: slot.params(),
									}),
								)
								.task('pad', ($: any) =>
									C.joinText.v1({
										items: [$.gather.scratchpad.read.main] as any,
										params: slot.params(),
									}),
								),
						),
					)
					.task('planContext', ($: any) =>
						C.buildPlannerContext.v1({
							cast: $.gather.cast.read.cast,
							state: $.gather.state.read.state,
							fields: $.input.fields,
							// What the master just typed, as direction (B11) — the
							// composer is instructions here, never a line.
							turnDirection: $.input.text,
							// The rooms, always in view (B13).
							locationEntries: $.gather.rooms.read.entries,
							// The unplayed talk and the scratchpad (R13) —
							// absent while the switch is off.
							sideTalk: $.via.turn.channel.story.pick.planned.steer.on.talk.messages,
							scratchpad: $.via.turn.channel.story.pick.planned.steer.on.pad.text,
							prompts: slot.prompts(),
							variables: slot.variables(),
						}),
					)
					/** Prose, and no turn to continue — see `adventure.ts`. */
					.task('lines', ($: any) =>
						C.proseTranscript.v1({
							messages: $.gather.history.read.messages,
							cast: $.gather.cast.read.cast,
							templateContext: $.via.turn.channel.story.pick.planned.planContext.templateContext,
						}),
					)
					.task('planPrompt', ($: any) =>
						C.assemble.v2({
							candidates: $.rank.candidates,
							decisions: $.rank.decisions,
							groups: $.rank.groups,
							budget: $.contextBudget.available,
							messages: $.via.turn.channel.story.pick.planned.lines.messages,
							templateContext: $.via.turn.channel.story.pick.planned.planContext.templateContext,
							template: slot.template(),
							prompts: slot.prompts({ node: `${STORY}.planned.planContext` }),
							variables: slot.variables(),
							params: slot.params(),
							connection: slot.connectionOf(`${STORY}.planned.planWrite`),
						}),
					)
					.oracle(
						'planWrite',
						($: any) =>
							C.generateJson.v1({
								context: $.via.turn.channel.story.pick.planned.planPrompt.context,
								schema: LAIR_PLAN_SCHEMA as any,
								connection: slot.connection(),
								sampling: slot.sampling(),
								params: slot.params(),
							}),
						{ expose: { status: 'The Castellan is planning the turn' } },
					)
					/** The room the planner says nobody built, at `unknownExit` … */
					.task('exit', ($: any) =>
						C.parseJson.v1({
							text: $.via.turn.channel.story.pick.planned.planWrite.text,
							params: slot.params(),
						}),
					)
					/**
					 * The prose a room may be described in (R9, owner QC
					 * 2026-09-28): the newest rows of **every** channel, so a
					 * room the master described in the story OR in the Sanctum
					 * counts. The story's own history read is `main` only; this
					 * is the union (`channel: '*'`), and `exitCheck` keeps the
					 * two channels it names.
					 *
					 * **Talk only** off `main` (`talkOnly`, R10's fold-in of the
					 * R9 follow-up): the Sanctum's beats row is the Castellan's
					 * own plan for a turn — an envoy row, so the check could not
					 * tell it from talk, and a beats list naming a room in a dozen
					 * words suppressed the knock. The read keeps a person's lines
					 * and the replies fired on the Sanctum, and drops what a
					 * story turn or the create run wrote there, by the creating
					 * run's inlet channel — the fact the unplayed talk reads.
					 */
					.query('exitProse', ($: any) =>
						C.sessionHistory.v1({
							scope: $.input.sessionScope,
							params: slot.params(),
						}),
					)
					/**
					 * … kept only when nothing already describes it (B13; R7; R9):
					 * an entry answering to its name or a key, or recent prose on
					 * `main` or in the Sanctum by the master or the Castellan, is
					 * an open door whatever the planner thought. Prose hands its
					 * paragraph on (`passage`) — the room's text for the voices.
					 */
					.task('exitCheck', ($: any) =>
						C.undescribedName.v1({
							name: $.via.turn.channel.story.pick.planned.exit.value,
							locationEntries: $.gather.rooms.read.entries,
							entries: $.gather.lorebook.read.entries,
							messages: $.via.turn.channel.story.pick.planned.exitProse.messages,
							params: slot.params(),
						}),
					)
					/**
					 * **The knock, or the play.** The knock is the `when` and the
					 * play the `otherwise` because the halt is the exceptional
					 * case, and `otherwise` is what runs when the planner's
					 * document could not be read at all.
					 */
					.junction('door', { on: ($: any) => $.via.turn.channel.story.pick.planned.exitCheck.undescribed }, (r: any) =>
						r
							.when('knock', { truthy: true }, (k: any) => knockBranch(k))
							.otherwise('play', (p: any) => playBranch(p)),
					),
			),
	)

/** @internal */
export const lairRespondSpec = () =>
	compile(
		spec(LAIR_RESPOND_SPEC_ID, {
			version: LAIR_RESPOND_VERSION,
			taxonomy: {
				role: 'primary',
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: lairGenre,
				event: sessionEvents.messageRespond,
			})
			/** One retrieval pass, shared by every agent below. See `adventure.ts`. */
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
					 * The dungeon itself. `world-lore` is the lane the rooms
					 * live on, because `core:outlet/create-lore-entry@1` writes
					 * world-lore rows and has no port to say otherwise.
					 */
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
								// One owner per setting per spec (R-7 P2) — the
								// three lanes declare the same seven knobs.
								params: slot.params({ node: 'gather.worldLore.read' }),
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
					/**
					 * Every room the dungeon holds, by listing rather than by
					 * rank (B13, 2026-09-27): the room the party are in —
					 * exits and all — and every other room's name, in front
					 * of the planner, the voices and the Castellan, and what
					 * the knock is checked against. Location entries only (the
					 * preset below).
					 */
					.chain('rooms', (c) =>
						c.query('read', ($) =>
							C.lorebookEntries.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/**
					 * The whole book, any entry type (R7, 2026-09-28): a room is
					 * described when ANY entry answers to its name or a key, not
					 * only a location entry. The rooms above are checked first.
					 */
					.chain('lorebook', (c) =>
						c.query('read', ($) =>
							C.lorebookEntries.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/**
					 * The party's bars, the floor, the purse — and the two
					 * slots the steering actions write: `direction`, the
					 * master's standing note, and each delver's `whisper`.
					 */
					.chain('state', (c) =>
						c.query('read', ($) => C.sessionState.v1({ scope: $.input.sessionScope })),
					)
					/**
					 * The Castellan's own view of the annex (R13): the AI view
					 * for its reference, so it holds the scratchpad — whose
					 * audience is the Castellan alone — and nothing a delver's
					 * view would not. Read by the Castellan's steps only: the
					 * Sanctum talk, its scratchpad rewrite, and the planner
					 * while Sanctum talk steers. No delver's prompt is wired
					 * to it (earshot, by the audience model).
					 */
					.chain('scratchpad', (c) =>
						c.query('read', ($) =>
							C.sessionAnnex.v1({
								scope: $.input.sessionScope,
								view: 'ai',
								speaker: CASTELLAN,
								params: slot.params(),
							}),
						),
					),
			)
			/**
			 * The window, taken from the step whose prose a person waits on —
			 * the lead delver's line. A config reference is resolved by node
			 * key and creates no edge, so naming a node inside a branch costs
			 * the graph nothing.
			 */
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf(`${STORY}.planned.door.play.lead.speaks.say`),
					connection: slot.connectionOf(`${STORY}.planned.door.play.lead.speaks.say`),
					params: slot.params(),
				}),
			)
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [
						$.gather.history.read.band,
						$.gather.worldLore.read.main,
						$.gather.characterLore.read.main,
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
			/* ── what was pressed, where it was pressed, and who takes it ─── */
			/**
			 * **Narrate first** (R8): a fire `via: 'narrate'` is the Castellan
			 * narrating on `main`, whichever composer pressed it — so it is
			 * routed ahead of the channel. Every other fire is a turn.
			 *
			 * **The Sanctum, or the story** (R6). A turn fired on the Sanctum
			 * is the Castellan talking with its master; every other turn is
			 * the story's. Strict equality against the slug: the Lair
			 * allocates no lanes, so `sanctum` is the whole stored string.
			 *
			 * Each branch opens its own row (F7 per execution path).
			 */
			.junction('via', { on: ($: any) => $.input.via }, (v) =>
				v
					.when('narrate', { equals: 'narrate' }, (n) => narrateBranch(n))
					.otherwise('turn', (t) =>
						t.junction('channel', { on: ($: any) => $.input.channel }, (ch: any) =>
							ch
								.when('sanctum', { equals: SANCTUM_CHANNEL }, (s: any) => sanctumBranch(s))
								.otherwise('story', (st: any) => storyBranch(st)),
						),
					),
			)
			/* ── keep the books ───────────────────────────────────────────── */
			/**
			 * What was played this run, for the keeper to route on: a
			 * narration, or the party's lines. `join-text` drops what is
			 * absent, so Sanctum talk, a picked delver, a knock and a play
			 * nobody spoke in all leave it empty, and the keeper does not run.
			 */
			.task('played', ($: any) =>
				C.joinText.v1({
					items: [
						{ text: $.via.narrate.say.text },
						{ text: $.via.turn.channel.story.pick.planned.door.play.partyLines.text },
					] as any,
					params: slot.params(),
				}),
			)
			/** … and what the keeper reads: the narration, or the beats and the party. */
			.task('reply', ($: any) =>
				C.joinText.v1({
					items: [
						{ text: $.via.narrate.say.text },
						{ text: $.via.turn.channel.story.pick.planned.door.play.reply.text },
					] as any,
					params: slot.params(),
				}),
			)
			/**
			 * The keeper, LAST, on the spine: every write in the turn has
			 * landed by the time it runs (a level runs its items in position
			 * order). **The world's changes are filed at the beats row** —
			 * declared on `set-state`'s `worldRow`, never inferred — so their
			 * ledger shows in the Sanctum beside the plan that made them; a
			 * delver's own changes stay on that delver's line (the turn
			 * lock). A narration has no beats row, so its world changes file
			 * at the newest message: the narration itself.
			 */
			.junction('keep', { on: ($: any) => $.played.text }, (k) =>
				k.when('played', { truthy: true }, (c) =>
					c
						.task('keeperContext', ($: any) =>
							C.buildKeeperContext.v1({
								cast: $.gather.cast.read.cast,
								state: $.gather.state.read.state,
								reply: $.reply.text,
								fields: $.input.fields,
								prompts: slot.prompts(),
								variables: slot.variables(),
							}),
						)
						.task('lines', ($: any) =>
							C.proseTranscript.v1({
								messages: $.gather.history.read.messages,
								cast: $.gather.cast.read.cast,
								templateContext: $.keep.played.keeperContext.templateContext,
							}),
						)
						.task('keeperPrompt', ($: any) =>
							C.assemble.v2({
								candidates: $.rank.candidates,
								decisions: $.rank.decisions,
								groups: $.rank.groups,
								budget: $.contextBudget.available,
								messages: $.keep.played.lines.messages,
								templateContext: $.keep.played.keeperContext.templateContext,
								template: slot.template(),
								prompts: slot.prompts({ node: 'keep.played.keeperContext' }),
								variables: slot.variables(),
								params: slot.params(),
								connection: slot.connectionOf('keep.played.keeperWrite'),
							}),
						)
						.oracle(
							'keeperWrite',
							($: any) =>
								C.generateJson.v1({
									context: $.keep.played.keeperPrompt.context,
									schema: LAIR_KEEPER_SCHEMA as any,
									connection: slot.connection(),
									sampling: slot.sampling(),
									params: slot.params(),
								}),
							{ expose: { status: 'Keeping the books' } },
						)
						/**
						 * 🚧 How many of each item are held and left — Lair checks
						 * supply exactly as Adventure does (owner ruling
						 * 2026-09-27).
						 */
						.query('itemSupply', ($: any) =>
							C.itemSupply.v1({
								scope: $.input.sessionScope,
							}),
						)
						/** Names into rows — see `adventure.ts`'s `keeperResolve`. */
						.query('keeperResolve', ($: any) =>
							C.resolveStateChanges.v1({
								changes: $.keep.played.keeperWrite.items,
								base: $.gather.state.read.version,
								plan: $.via.turn.channel.story.pick.planned.planWrite.json,
								scope: $.input.sessionScope,
								supply: $.keep.played.itemSupply.supply,
							}),
						)
						/**
						 * Propose, or apply — the session's own decision, read
						 * from the genre field. The branch IS the decision and the
						 * receipt records which predicate fired.
						 */
						.junction('commit', { on: ($: any) => $.input.fields }, (j) =>
							j
								.when('trusted', { path: 'trustNarrator', truthy: true }, (t) =>
									t.task('apply', ($: any) =>
										C.setState.v1({
											changes: $.keep.played.keeperResolve.changes,
											scope: $.input.sessionScope,
											base: $.gather.state.read.version,
											worldRow: $.via.turn.channel.story.pick.planned.door.play.plan.posted.write.messageId,
											params: slot.params(),
										}),
									),
								)
								.otherwise('reviewed', (t) =>
									t.task('propose', ($: any) =>
										C.setState.v1({
											changes: $.keep.played.keeperResolve.changes,
											scope: $.input.sessionScope,
											base: $.gather.state.read.version,
											worldRow: $.via.turn.channel.story.pick.planned.door.play.plan.posted.write.messageId,
											params: slot.params(),
										}),
									),
								),
						),
				),
			)
			/**
			 * What the pipeline ships with — selections a person can change in
			 * the panel, never literals welded into the document. See
			 * `adventure.ts` for the three warnings that govern this block.
			 */
			.preset('lair', { label: 'Lair', default: true }, (p) =>
				p
					// Who speaks (the planner's speakers, read in the play
					// branch so a knock voices nobody), and where the knock's
					// question is in the planner's own document.
					.params(`${STORY}.planned.door.play.speaking`, { path: 'speakers' })
					.params(`${STORY}.planned.door.knock.question`, { path: 'knockQuestion' })
					// The room the planner says nobody built (B13), checked
					// against every room the listing holds — location entries
					// only, bare id, the way a listing spells them.
					.params(`${STORY}.planned.exit`, { path: 'unknownExit' })
					// Described in the story or in the Sanctum (R9, owner QC
					// 2026-09-28): the union read, capped at the check's window,
					// and the two channels whose prose counts.
					.params(`${STORY}.planned.exitProse`, { channel: '*', limit: EXIT_PROSE_ROWS, talkOnly: true })
					.params(`${STORY}.planned.exitCheck`, { channels: ['main', SANCTUM_CHANNEL] })
					// The knock's option label: the name and its ellipsis, then
					// the verb (R9).
					.params(`${STORY}.planned.door.knock.named`, { path: '', separator: '' })
					.params(`${STORY}.planned.door.knock.describeLabel`, { path: '', separator: ' ' })
					.params('gather.rooms.read', { entryTypes: ['core:entry/location'] })
					// The Castellan's Sanctum talk (R6): the Sanctum is the
					// conversation, the story's newest rows its background.
					.params('via.turn.channel.sanctum.talk', { channel: SANCTUM_CHANNEL })
					.params('via.turn.channel.sanctum.story', { channel: 'main', limit: SANCTUM_STORY_ROWS })
					// The unplayed Sanctum talk (R13): only since the story's
					// last line, capped by the talk window — the planner's
					// read and the narration's two.
					.params(TALK_READS[0], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
					.params(TALK_READS[1], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
					.params(TALK_READS[2], { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: SANCTUM_TALK_ROWS })
					.params(NO_TALK_READ, { channel: SANCTUM_CHANNEL, unplayedOnly: true, limit: 0 })
					// Where Narrate was pressed, beside the fields (R13).
					.params('via.narrate.asked', { firstKey: 'channel', secondKey: 'fields' })
					// The scratchpad, as text, off the Castellan's annex view.
					.params(`${STORY}.planned.steer.on.pad`, { path: CASTELLAN_SCRATCHPAD_KEY })
					.params(`${SANCTUM}.pad`, { path: CASTELLAN_SCRATCHPAD_KEY })
					// Its rewrite reads the exchange just had, and answers
					// the whole scratchpad at `scratchpad`.
					.params(`${SANCTUM}.padExchange`, {
						channel: SANCTUM_CHANNEL,
						limit: SCRATCHPAD_EXCHANGE_ROWS,
					})
					.params(`${SANCTUM}.padText`, { path: 'scratchpad' })
					// The beats the Sanctum row lists (R8).
					.params(`${STORY}.planned.door.play.beats`, {
						path: 'beats',
						kind: 'plan',
						label: 'Plan',
					})
					.params('keep.played.keeperWrite', { path: 'values,inventory' })
					// The one branch that writes rather than asks.
					.params('keep.played.commit.trusted.apply', { mode: 'apply' })
					// What the keeper reads: the beats, then the party,
					// separated by a blank line.
					.params(`${STORY}.planned.door.play.partyLines`, { separator: '\n\n' })
					.params(`${STORY}.planned.door.play.reply`, { separator: '\n\n' })
					.params('reply', { separator: '\n\n' })
					// The two steps nobody reads run on Background — see
					// `adventure.ts`. The narration and the voices are
					// deliberately absent: those are the prose somebody is
					// waiting for.
					.sampling(`${STORY}.planned.planWrite`, { seedKey: 'sampling-background' })
					.sampling('keep.played.keeperWrite', {
						seedKey: 'sampling-background',
					})
					// The scratchpad rewrite: nobody waits on it either (R13).
					.sampling(`${SANCTUM}.padWrite`, { seedKey: 'sampling-background' }),
			)
			.build(),
	)
