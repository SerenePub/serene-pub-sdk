/**
 * Adventure's **Look** action. The genre's actions are introduced in `index.ts`.
 */

import { compile, slot, spec, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { adventureGenre, POST_HISTORY_TOKEN_TRIGGER } from '../../registry/genres.js'

/* ── look ───────────────────────────────────────────────────────────────── */

/** @internal */
export const ADVENTURE_LOOK_SPEC_ID = 'core:spec/adventure-look'
/**
 * 1.0.0, edited in place (lorebooks C2, 2026-10-02): a `presences` read and an
 * `eligible` step before `rank`. Content-addressed; `specHashes.test.ts`
 * records the move.
 *
 * Edited in place again (owner ruling 2026-10-03): the context step is the
 * SCENE builder, with the places listing — see `adventureLookSpec`.
 *
 * And again (history window, 2026-10-03): `contextBudget` runs before the
 * reads and `gather.history.read` takes its `budget`, so the transcript fit,
 * not the newest 100 rows, decides where the conversation starts.
 * @internal
 */
export const ADVENTURE_LOOK_VERSION = '1.0.0'

/**
 * The narrator describes where you are, from the lore and the world state, and
 * changes nothing.
 *
 * It is also the opening scene: the create pipeline deliberately makes no model
 * call, so this is the button a new Adventure session is meant to start with.
 *
 * **Built on the scene builder** (`core:task/build-scene-context@1`, owner
 * ruling 2026-10-03), the context Adventure's own narrator reads, so Look is
 * shown what the narrator is shown: `{{location}}`, the clock and the weather,
 * the place the scene is in with its ways on (`{{locationEntry}}`) and every
 * place the world holds (`{{knownLocations}}`), off the same `rooms` listing
 * and the same room rule as `adventure-respond`. It was built on
 * `build-template-context@1`, which computes no scene variables, so Look
 * described a place it had never been shown. No `plan`: nothing is planned,
 * so `{{beats}}` is empty and the builder anchors on the world state alone.
 * The builder also resolves the step as nobody, so the line the model
 * continues is the narrator's rather than the session's last speaker's.
 *
 * Its prompt row moved with it, from the `build-template-context` pool into
 * the `build-scene-context` pool (migration `0111` re-keys the row in place,
 * so a configuration pointing at it keeps pointing at it).
 * @internal
 */
export const adventureLookSpec = () =>
	compile(
		spec(ADVENTURE_LOOK_SPEC_ID, {
			version: ADVENTURE_LOOK_VERSION,
			taxonomy: {
				role: 'action',
			},
			contributes: {
				actions: [
					{
						key: 'look',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'eye',
						label: { en: 'Look' },
						description: { en: 'Have the narrator describe where you are and what you can see.' },
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), {
				genre: adventureGenre,
				event: sessionEvents.sessionAction,
			})
			// Before the reads (history window, 2026-10-03): the history read
			// is sized by this budget, so it is computed first. It reads only
			// config, never a step, so moving it changes no value.
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('write'),
					// The other half of the same pair, for the model's own
					// window (0114) — see `respond`.
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
					)
					// Every place the world holds, by listing (the places plan
					// A28, as `adventure-respond` reads them): location entries
					// with their ways on (the preset), for `{{locationEntry}}`
					// and `{{knownLocations}}`.
					.chain('rooms', (c) =>
						c.query('read', ($) =>
							C.lorebookEntries.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					// Who is in the world at the session's moment (R4), for `eligible`.
					.chain('presences', (c) =>
						c.query('read', ($) => C.castPresences.v1({ scope: $.input.sessionScope })),
					),
			)
			// The pool the ranker reads: the conversation's band intent (R-7
			// P5 — `session-history` ranks nothing, but its `share` reserves the
			// transcript's slice of the window) ahead of the keyword scan's
			// candidates, which open with the scan's own three intents
			// (`lorebook-triggers` declares one per band it produces). A concat
			// rather than the scan's port straight into `rank`, because a
			// ranker takes one list and the intent needs a seat in it.
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [$.gather.history.read.band, $.gather.lore.read.main] as any,
				}),
			)
			// The hard gates before the ranker (C2; R2, R4): the scan's own
			// exclusions, and the presence gate.
			.task('eligible', ($) =>
				C.eligibility.v1({
					candidates: $.lore.candidates,
					exclusions: $.gather.lore.read.exclusions,
					presences: $.gather.presences.read.main,
					at: $.gather.presences.read.at,
				}),
			)
			// The room the place slot shows (the room rule, as in
			// `adventure-respond`): the world's `location` resolved against
			// the places, so the ranker leaves that room to
			// `{{locationEntry}}` rather than spending lore budget on it twice.
			.task('place', ($: any) =>
				C.undescribedName.v1({
					name: $.gather.state.read.state,
					locationEntries: $.gather.rooms.read.entries,
					params: slot.params(),
				}),
				{ expose: { label: 'The current place' } },
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.eligible.candidates,
					budget: $.contextBudget.available,
					shownElsewhere: $.place.entryId,
					params: slot.params(),
				}),
			)
			// The narrator's context (owner ruling 2026-10-03): the scene
			// builder, with no plan. The key stays `context`, so a stored
			// value at `context#prompts` keeps its address.
			.task('context', ($) =>
				C.buildSceneContext.v1({
					cast: $.gather.cast.read.cast,
					state: $.gather.state.read.state,
					fields: $.input.fields,
					locationEntries: $.gather.rooms.read.entries,
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
					// No `prompts` on the generating step — see `../chat/respond.ts`
					// (culled 2026-09-16, R-12).
				}),
				{ expose: { stream: true, status: 'Looking around' } },
			)
			.outlet('save', ($) => C.createMessage.v1({ text: $.write.text }))
			/**
			 * What this step ships with: the post-history reminder's trigger
			 * (`POST_HISTORY_TOKEN_TRIGGER`), because the prompt renders the
			 * session's growing history and the reminder only earns its place
			 * once there is enough of it to drift from; and the places and the
			 * room rule as `adventure-respond` ships them — preset values on
			 * new nodes, so they reach an install through a re-projection
			 * (0111).
			 */
			.preset('default', { label: 'Default', default: true }, (p) =>
				p
					.params('prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
					.params('gather.rooms.read', {
						entryTypes: ['core:entry/location'],
						withLinks: true,
					})
					.params('place', { path: 'world.location' }),
			)
			.build(),
	)
