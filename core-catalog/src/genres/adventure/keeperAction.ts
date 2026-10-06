/**
 * The state-keeper action Rest and Time passes share (`rest.ts`, `advanceTime.ts`).
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { ADVENTURE_KEEPER_SCHEMA } from './respond.js'
import { adventureGenre } from '../../registry/genres.js'

/* ── the two keeper-only actions ────────────────────────────────────────── */

/**
 * Rest and Advance time are one graph with two sets of instructions, and saying
 * so in a builder is more honest than writing it twice.
 *
 * Both read the state, ask the keeper what changes, resolve the names it used
 * and land the result as proposals — or as writes, when the session trusts the
 * narrator. Neither writes a message: a clock tick is a ledger line, not a
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
) =>
	compile(
		spec(id, {
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
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: adventureGenre,
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
			.task('context', ($) =>
				C.buildKeeperContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					fields: $.input.fields,
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
					prompts: slot.prompts({ node: 'context' }),
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
					schema: ADVENTURE_KEEPER_SCHEMA as any,
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
				}),
			)
			.junction('commit', { on: ($: any) => $.input.fields }, (r) =>
				r
					.when('trusted', { path: 'trustNarrator', truthy: true }, (c) =>
						c.task(
							'apply',
							($: any) =>
								C.setState.v1({
									changes: $.resolve.changes,
									scope: $.input.sessionScope,
									base: $.gather.state.read.version,
									params: slot.params(),
								}),
							{ expose: { label: 'Apply the changes' } },
						),
					)
					.otherwise('reviewed', (c) =>
						c.task(
							'propose',
							($: any) =>
								C.setState.v1({
									changes: $.resolve.changes,
									scope: $.input.sessionScope,
									base: $.gather.state.read.version,
									params: slot.params(),
								}),
							{ expose: { label: 'Propose the changes' } },
						),
					),
			)
			.preset('adventure', { label: 'Adventure', default: true }, (p) =>
				p
					// The keeper's two arms, joined into the one list
					// the resolver takes.
					.params('write', { path: 'values,inventory' })
					.params('commit.trusted.apply', { mode: 'apply' }),
			)
			.build(),
	)
