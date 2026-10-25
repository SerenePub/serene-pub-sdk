/**
 * The state-keeper action Rest and Time passes share (`rest.ts`, `advanceTime.ts`).
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { TIME_PASSES_COLLECTS } from '../../shared/timePasses.js'
import { chainIf } from '../../shared/chains.js'
import { STORY_REST_CRIB_SCRIPT } from './reckon.js'

/**
 * The state-keeper's answer for **Rest** (`story-rest`): `{ values, inventory,
 * clock }` — Adventure's keeper schema until 2026-10-19 (moved with the
 * action when Adventure folded into Story). The after-turn reckoning reads
 * the session's rules' change grammar instead (`STORY_RECKON_SCHEMA`, S1).
 * 🚧 A value is named by the word the session's sheets give it (2026-10-23,
 * S3): the hard-coded list of seven (`TRACKED_SLOTS`) is gone — the prompt's
 * `{{slots}}` lists every value the session tracks, and `{{restores}}` the
 * ones the rules say a rest brings back (`core:script/story-rest-crib`).
 * @internal
 */
export const STORY_KEEPER_SCHEMA = {
	type: 'object',
	properties: {
		/** A tracked value the scene changed. Empty is the ordinary turn. */
		values: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					owner: { type: 'string' },
					/** The value, by the word the session's sheets give it (`{{slots}}`). */
					slot: { type: 'string' },
					value: { type: 'string' },
				},
				required: ['owner', 'slot', 'value'],
				additionalProperties: false,
			},
		},
		/**
		 * Something changing hands, by the entry id the lore gave it — an add
		 * (+) or remove (−) on the owner's `inventory` stat once resolved.
		 * Named for the stat it lands on (owner ruling 2026-09-27; was
		 * `possessions`).
		 *
		 * Its own list rather than a second arm inside `values`, because a
		 * schema can only be strict about a list whose items are all one shape.
		 * The two are joined again by the `path` parameter naming both.
		 */
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
		/**
		 * 🚧 **A clock proposal** (live scenes §6, ★3, 2026-10-13): how much
		 * story time the scene took, when its events took meaningful time — a
		 * journey, a long search, a night's sleep. Never for ordinary dialogue,
		 * and never written: `resolve-state-changes` (its `clock` port) turns
		 * the first entry into a `{ kind: 'clock', by, unit }` change, which
		 * *Advance story clock* moves the clock by once the keeper's changes
		 * apply (Rest applies at its own action's mode, GM 2026-10-23).
		 *
		 * A list (empty is the ordinary turn, as `values` and `inventory`)
		 * rather than an optional object, because every property here is
		 * required (see above): a grammar cannot leave a key out. Its own key
		 * rather than another arm on `values`, because the keeper's `path`
		 * is a preset value an install wrote once, and a new arm there would
		 * never reach an install that already has its config.
		 */
		clock: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					by: { type: 'integer' },
					unit: { type: 'string', enum: ['minutes', 'hours', 'days', 'months', 'years'] },
				},
				required: ['by', 'unit'],
				additionalProperties: false,
			},
		},
	},
	required: ['values', 'inventory', 'clock'],
	additionalProperties: false,
} as const

/* ── the two keeper-only actions ────────────────────────────────────────── */

/**
 * Rest and Advance time are one graph with two sets of instructions, and saying
 * so in a builder is more honest than writing it twice.
 *
 * Both read the state, ask the keeper what changes, resolve the names it used
 * and land the result as writes — a press is the person's own decision (GM
 * 2026-10-23: the action's own mode, Full). Neither writes a message: a clock tick is a ledger line, not a
 * paragraph, and the narrator has its own button for the paragraph.
 *
 * They are separate SPECS rather than one spec with a parameter because a
 * shipped prompt is resolved per (pool, spec): two specs is what gives Rest its
 * own instructions and Advance time its own, in the same pool, each editable
 * without touching the other.
 */
export const keeperAction = (
	id: string,
	version: string,
	trigger: { key: string; icon: string; label: string; description: string },
	/**
	 * 🚧 `clock` (live scenes §6, 2026-10-13): the press collects a clock
	 * step on the stepper — the amount is the player's — and, once the
	 * keeper's changes are committed, the session's story clock moves by it
	 * (`core:task/clock-step@1` → *Advance story clock*, behind a junction
	 * on `moves`). Last, after the keeper's changes stand; a clock that
	 * cannot move (a book with nothing dated and no clock set) is skipped
	 * with its sentence in the ledger and on the receipt, never a halt
	 * (live scenes §15 G7). Time passes says it; Rest does not.
	 *
	 * 🚧 Without it (Rest), the keeper's own `clock` list is read instead
	 * (live scenes ★3, lane F): a clock proposal under review, or — on
	 * **Full** — *Advance story clock* in the applying arm.
	 * With it, the keeper's `clock` is never wired: the amount is the
	 * player's.
	 */
	opts: { clock?: boolean } = {},
) => {
	const resolved = spec(id, {
			version,
			taxonomy: {
				role: 'action',
			},
			contributes: {
				actions: [
					{
						key: trigger.key,
						venue: { kind: 'composer' },
						quick: true,
						icon: trigger.icon,
						label: { en: trigger.label },
						description: { en: trigger.description },
						...(opts.clock ? { collects: TIME_PASSES_COLLECTS as any } : {}),
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), { suits: [] })
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
					// The other half of the same pair, for the model's own
					// window (0114) — see `respond`.
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			/**
			 * 🚧 What a rest brings back by the session's rules (S3): the
			 * attributes they tag `resource`, read off the inlet's ruleset, as
			 * `{{restores}}` beside the genre's fields.
			 */
			.task(
				'restores',
				($) => C.runScript.v1({ input: { ruleset: $.input.ruleset, fields: $.input.fields } as any, params: slot.params() }),
				{ expose: { label: 'What a rest brings back' } },
			)
			.task('context', ($) =>
				C.buildKeeperContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					fields: $.restores.main,
					// 🚧 Time passes: the span the player chose, as
					// `{{clockStep}}` (live scenes §15 G6), so the keeper
					// turns the sky over that span, not one notch.
					...(opts.clock ? { clockStep: $.input.clockStep } : {}),
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/**
			 * Prose, and no turn to continue — the respond pipeline's
			 * reasoning, applied to the two actions it left behind. A step
			 * that is asking a question must not be handed a line with
			 * somebody's name on the end of it, and must not be shown the
			 * JSON an earlier turn left in the session.
			 */
			.task('lines', ($) =>
				C.proseTranscript.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
				}),
			)
			/**
			 * 🚧 **The transcript's files, placed** (attachments follow-ups, owner
			 * ruling 2026-10-03) — `respond`'s two steps: the files the rows show,
			 * then per line what `write` receives (an image it can read rides its
			 * own turn; otherwise its name). A transcript with no files passes
			 * through untouched, so the prompt is byte for byte what it was.
			 */
			.query('attachments', ($) =>
				C.historyAttachments.v1({
					messages: $.gather.history.read.messages,
					params: slot.params(),
				}),
			)
			.task('attached', ($) =>
				C.placeAttachments.v1({
					messages: $.lines.messages,
					attachments: $.attachments.attachments,
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					budget: $.contextBudget.available,
					messages: $.attached.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					prompts: slot.prompts($.context),
					variables: slot.variables(),
					params: slot.params(),
					connection: slot.connectionOf('write'),
				}),
			)
			/**
			 * The keeper's own shape, asked for as a shape.
			 *
			 * ⚠ **A moved pin**: asking for a document rather than parsing one
			 * out of a prefilled reply moves both spec hashes, recorded in the
			 * app's `boot/specHashes.test.ts`. Both slugs are new in this
			 * release, which is what makes a moved pin a recorded change here
			 * rather than a break.
			 *
			 * The respond pipeline's keeper schema, deliberately: a Rest
			 * reporting in one shape and a turn reporting in another would
			 * be two vocabularies for one ledger, and the resolver reads one.
			 */
			.oracle('write', ($) =>
				C.generateJson.v1({
					context: $.prompt.context,
					schema: STORY_KEEPER_SCHEMA as any,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { status: 'Updating the world' } },
			)
			.query('resolve', ($) =>
				C.resolveStateChanges.v1({
					changes: $.write.items,
					scope: $.input.sessionScope,
					// The version this run read — see `respond`'s keeperResolve.
					base: $.gather.state.read.version,
					// 🚧 The keeper's clock move (★3) — Rest's alone: under
					// Time passes the amount is the player's stepper, so the
					// keeper's own `clock` is never read there.
					...(opts.clock ? {} : { clock: $.write.json }),
				}),
			)
	/** The keeper's clock move, decided — Rest's alone; see `respond`'s `keeperStep`. */
	const stepped = chainIf(!opts.clock, resolved, (r) =>
		r.task('keeperStep', ($) => C.clockStep.v1({ step: $.resolve.clock, params: slot.params() })),
	)
	/**
	 * 🚧 Apply — **the action's own mode** (GM 2026-10-23, G1 ★3; the
	 * objection PLAN-genres-seams S2 answered for the reply): a press is the
	 * person's own decision, and an action registration carries no mode (a
	 * routine's field, R37), so its changes land, as a rules action's do
	 * (`core:spec/rules-action`, ★ Review for an action waits on a ruling).
	 * Was **the reckoning routine's mode** read by spec id off the settings
	 * document's `routineModes` (R55, 2026-10-21) — a pipeline reading
	 * another's mode; before that Story's *Apply a press's changes*
	 * (`applyActionChanges`, 2026-10-20, removed), the retired background
	 * tasks' *attributes* mode (2026-10-19), and Adventure's `trustNarrator`.
	 */
	const applied = stepped.task(
		'apply',
		($) =>
			C.setState.v1({
				changes: $.resolve.changes,
				scope: $.input.sessionScope,
				base: $.gather.state.read.version,
				params: slot.params(),
			}),
		{ expose: { label: 'Apply the changes' } },
	)
	// 🚧 Rest's clock move (★3): through *Advance story clock*, as
	// `respond`'s — `apply` passes the clock line over. The keeper's move,
	// and a refusal skips the clock rather than halting the rest (§15 G4/G7).
	const committed = chainIf(!opts.clock, applied, (a) =>
		a.junction('keeperClock', { on: ($) => $.keeperStep.moves }, (j) =>
			j.when('moves', { truthy: true }, (k) =>
				k.outlet(
					'advance',
					($) =>
						C.advanceStoryClock.v1({
							by: $.keeperStep.by,
							unit: $.keeperStep.unit,
							cause: 'keeper',
							onRefusal: 'skip',
							params: slot.params(),
						}),
					{ expose: { label: 'Move the story clock' } },
				),
			),
		),
	)
	const withClock = chainIf(opts.clock === true, committed, (c) =>
		c
			/** The press's step, decided: `{ by, unit }` and whether it moves at all. */
			.task('step', ($) => C.clockStep.v1({ step: $.input.clockStep, params: slot.params() }))
			/**
			 * 🚧 A person's press (`cause: 'action'`). A story with no
			 * clock yet skips the move with a line in the ledger
			 * instead of halting after the keeper's changes landed
			 * (`onRefusal: 'skip'`, live scenes §15 G7).
			 */
			.junction('clock', { on: ($) => $.step.moves }, (j) =>
				j.when('moves', { truthy: true }, (c) =>
					c.outlet('advance', ($) =>
						C.advanceStoryClock.v1({
							by: $.step.by,
							unit: $.step.unit,
							cause: 'action',
							onRefusal: 'skip',
							params: slot.params(),
						}),
					),
				),
			),
	)
	return compile(
		withClock
			.defaults((p) =>
				p
					// The keeper's two arms, joined into the one list
					// the resolver takes.
					.params('write', { path: 'values,inventory' })
					.params('apply', { mode: 'apply' })
					.scripts('restores', [{ seedKey: STORY_REST_CRIB_SCRIPT.seedKey }]),
			)
			.build(),
	)
}
