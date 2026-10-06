/**
 * The Castellan's turn as an action, which Trigger trap and Reveal share
 * (`trap.ts`, `reveal.ts`).
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { LAIR_CASTELLAN_KEY, POST_HISTORY_TOKEN_TRIGGER, lairGenre } from '../../registry/genres.js'

/* ── The Castellan's two turns ──────────────────────────────────────────── */

/**
 * Trigger trap and Reveal are one graph with two sets of instructions, and
 * saying so in a builder is more honest than writing it twice — Adventure's
 * `keeperAction` makes the same call for the same reason.
 *
 * Both are Adventure's *Look*: the Castellan describes something from the lore
 * and the world state, changes nothing, and writes one message. They are
 * separate SPECS rather than one spec with a parameter because a shipped
 * prompt is resolved per (pool, spec) — two specs is what gives the trap its
 * own instructions and the reveal its own, in the same pool, each editable
 * without touching the other.
 */
export const castellanAction = (
	id: string,
	version: string,
	trigger: {
		key: string
		icon: string
		label: string
		description: string
		/** What the row says while the Castellan writes (B18 step status). */
		status: string
		/** The collect modal's question (R3): what the master may say the thing is. */
		ask: string
	},
) =>
	compile(
		spec(id, {
			version,
			taxonomy: { role: 'action'},
			contributes: {
				actions: [
					{
						key: trigger.key,
						venue: { kind: 'composer' },
						quick: true,
						icon: trigger.icon,
						/** What the master says rides as the turn's instructions — or nothing, and the room decides (R3). */
						collects: {
							text: { need: 'optional', label: { en: trigger.ask }, ifEmpty: { en: 'The room decides.' } },
						},
						label: { en: trigger.label },
						description: { en: trigger.description },
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: lairGenre,
				event: sessionEvents.sessionAction,
			})
			/**
			 * The row, opened before anything is read — the Castellan's, by
			 * name (R8, owner F2 2026-09-28: Trap and Reveal are the
			 * Castellan's). Not `narration`: a trap is the Castellan taking a
			 * turn, not a side note beside one. It streams while `write` runs
			 * (`expose.stream`) and `save` finishes it. What the master typed
			 * is stored beside it as the turn's instructions — never as its
			 * text.
			 */
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					speaker: `envoy:${LAIR_CASTELLAN_KEY}`,
					instructions: $.input.text,
				}),
			)
			// Before the reads (history window, 2026-10-03): the history read
			// is sized by this budget, so it is computed first. It reads only
			// config, never a step, so moving it changes no value.
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('write'),
					connection: slot.connectionOf('write'),
					params: slot.params(),
				}),
			)
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								// Sized by the window (history window, 2026-10-03).
								budget: $.contextBudget.available,
								params: slot.params(),
							}),
						),
					)
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
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [$.gather.history.read.band, $.gather.lore.read.main] as any,
				}),
			)
			// Who is in the world at the session's moment (R4), for `eligible`.
			.query('presences', ($) => C.castPresences.v1({ scope: $.input.sessionScope }))
			// The hard gates before the ranker (C2; R2, R4): selective-logic
			// exclusions from the keyword lanes, and the presence gate.
			.task('eligible', ($) =>
				C.eligibility.v1({
					candidates: $.lore.candidates,
					exclusions: $.gather.lore.read.exclusions,
					presences: $.presences.main,
					at: $.presences.at,
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.eligible.candidates,
					budget: $.contextBudget.available,
					params: slot.params(),
				}),
			)
			/**
			 * `build-template-context@1` rather than the narrator builder,
			 * builder, for the one port that decides it: `state`. A trap that
			 * did not know which floor the party is on, and a reveal that did
			 * not know where they are standing, would be describing a dungeon
			 * in general.
			 */
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					/**
					 * What the master typed — *"the floor gives way"* — as
					 * what to spring or reveal (B17). The prompt renders it as
					 * `{{turnDirection}}`; blank, the room decides.
					 */
					turnDirection: $.input.text,
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
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					groups: $.rank.groups,
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
			.oracle('write', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					connection: slot.connection(),
					sampling: slot.sampling(),
					params: slot.params(),
				}),
				{ expose: { stream: true, status: trigger.status } },
			)
			/**
			 * The placeholder, finished: the prose, and the Castellan's
			 * reasoning folded as the row's Reasoning (the B5 pattern — absent
			 * when the model gave none, and the port is skipped).
			 */
			.outlet('save', ($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.write.text,
					reasoning: $.write.reasoning,
				}),
			)
			/**
			 * What this step ships with: the post-history reminder's trigger
			 * (`POST_HISTORY_TOKEN_TRIGGER`), because the prompt renders the
			 * session's growing history and the reminder only earns its place
			 * once there is enough of it to drift from.
			 */
			.preset('default', { label: 'Default', default: true }, (p) =>
				p.params('prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER }),
			)
			.build(),
	)
