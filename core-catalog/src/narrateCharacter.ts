/**
 * Core's side-character pipeline — a turn spoken by somebody who is not in the
 * cast (ruling 2026-09-07).
 *
 * ## Why the narrator split in two
 *
 * One spec was doing two jobs. "Narrate" meant *describe the world*, and the
 * shipped prompt says so in as many words — "you only narrate the environment,
 * not {{characterNames}}" — while the button's own modal offered "or any side
 * characters and encounters" as a use for it. So the one thing a person most
 * often wanted from the narrator, a shopkeeper answering back, was reachable
 * only by asking a pipeline configured to refuse it.
 *
 * They are two triggered types because the difference is *configuration*, which
 * is the same argument `narrate.ts` opens with about the reply pipeline: a
 * different system prompt, a different name on the line the model continues
 * from, a different context builder declaring a different surface. A flag would
 * have welded a world-narrator's prompt config to a side character's, and the
 * whole point of each is not to sound like the other.
 *
 * ## First-class presence, no turn slot
 *
 * **participant ≠ character.** A side character is a participant *for one turn*:
 * the prompt is written from their perspective, character lore bound to them
 * becomes readable (the visibility rule keys on the speaker, so a scope naming
 * them is the whole of it), and every retrieval mechanism can reach them. What
 * they are not is a **cast member** — nothing here writes a `session_characters`
 * row, and the free-form case has no character to write.
 *
 * ⚠ **Round-robin exclusion is not enforced here, and it must not be.** The
 * rotation is computed from stored messages by `getNextCharacterTurn`, which
 * drops every `isNarratorResponse` row *before* it matches a character id — so
 * a side-character turn is excluded by the row it writes, not by a rule this
 * document repeats. A second statement of the rule in the pipeline would be
 * free to disagree with the first.
 *
 * Core ships **no** automatic turn-taking for side characters, deliberately. A
 * custom genre may add a turn handler that makes them answer on their own —
 * that is a fine thing to build and it is explicitly not ours.
 *
 * ## Retrieval
 *
 * All five mechanisms, wired exactly as `respond` and `narrate` wire them:
 * keys, the names the scene said, meaning, the names the scene *described*, and
 * the structural signals that order what they find. Three of the five need
 * nothing installed; the two that read embeddings ship switched off, so a first
 * boot runs the zero-cost path.
 */

import { compile, spec, slot, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from './genres.js'

export const NARRATE_CHARACTER_SPEC_ID = 'core:spec/narrate-character'
// 1.0.0: a new declaration, not a bump. The 0.6 version freeze forbids moving
// an existing spec's semver; it says nothing about publishing a new spec, and
// this is one — its own slug, its own config surface, its own contributed
// trigger. Nothing that pins `core:spec/narrate` is affected.
//
// ⚠ **1.0.0, edited in place for the first time — same terms, same pairing.**
//
// The `history` node wires `params: slot.params()`. It never named the slot, and
// `resolveInput` resolves only the slots a node's config names, so `limit` —
// "How many recent messages are considered for the context" — arrived as
// `undefined` on every run and the binding fell through to a literal 100. The
// panel rendered the control, `reconcileConfigs` stored a value for it, and
// nothing read it: the third time this exact omission has shipped in this
// package.
//
// Behaviour-preserving by construction. The declared default is **100** as of
// the same ruling (2026-09-09) — the number every run has actually used, not a
// retune — and `drizzle/0110_session_history_limit.sql` re-projects the type,
// deletes this pin so boot republishes it, and lifts the stored 40s
// `reconcileConfigs` back-filled from the old declaration. `specHashes.test.ts`
// records the moved hash in the same change; neither half is optional.
//
// ⚠ **1.0.0, edited in place a SECOND time — same terms, same pairing.**
//
// The `generate` node names `connection` and `sampling`. It is the OWNER of
// both — `contextBudget` reads `slot.samplingOf("generate")` and `prompt` reads
// `slot.connectionOf("generate")`, so a pick on this step already moved the
// budget and the wire format — and it never named them itself, so
// `refId(p.connection)` in `host.ts` read `null` and `resolveCapabilityTarget`
// took that as "the pipeline chose nothing" and fell to the instance default.
// The prompt was sized and wrapped for one endpoint and sent to another.
//
// ⚠ Not behaviour-preserving on an install where somebody set the picker, and
// that is the point: the pick was stored and ignored (STATE-2026-09-08 §1,
// "Per-node sampling ignored"). An install that never set one keeps resolving
// the same `connection_defaults` row the `capabilityDefault` tier reads, and a
// session override still outranks the pipeline's tier.
//
// `drizzle/0111_reply_slots_and_relationship_cap.sql` deletes this pin so boot
// republishes it, and `specHashes.test.ts` records the moved hash in the same
// change; neither half is optional.
export const NARRATE_CHARACTER_VERSION = '1.0.0'

export const narrateCharacterSpec = () =>
	compile(
		spec(NARRATE_CHARACTER_SPEC_ID, {
			version: NARRATE_CHARACTER_VERSION,
			/** Catalogue claims (23 §2): a person-invoked action on chats. */
			taxonomy: {
				role: 'action',
				genre: chatGenre.id,
			},
			/**
			 * Its contributed trigger (19 §4). Same namespace as the genre
			 * owner, so it lands as a companion — present by default — beside
			 * the world narrator's button rather than replacing it.
			 *
			 * ⚠ The function key is `narrate-character`, distinct from
			 * `narrate`, because the two resolve to two specs and
			 * `resolveFunctionSpec` keys on exactly this string. It also has a
			 * **bespoke lifecycle** like `narrate` and `respond` — the press
			 * opens a modal whose first step is *who speaks*, and the run needs
			 * the streaming message row that modal's answer creates — so the
			 * generic `sessions:triggerFunction` route refuses it by name and
			 * sends the client to that flow instead.
			 */
			contributes: {
				actions: [
					{
						key: 'narrate-character',
						genre: chatGenre.id,
						function: 'narrate-character',
						venue: { kind: 'composer' },
						quick: true,
						icon: 'user-round',
						label: { en: 'Side character' },
					},
				],
			},
		})
			// Manually triggered — a person names who speaks. Nothing about a
			// new message should start one, which is the whole difference
			// between a side character and a cast member.
			/**
			 * The usage lock (24 §4), on its own input type.
			 *
			 * `side-character-turn@1` rather than `user-message@1`: the latter
			 * carries the standard chat's `sessionShape` and *is* the chat mode
			 * (the F29 floor), which a per-turn action must not restate — and
			 * this trigger carries a side-character fact the chat input has no
			 * port for.
			 */
			.inlet('input', C.sideCharacterTurn.v1(), {
				genre: chatGenre,
				event: sessionEvents.sessionAction,
			})
			/**
			 * The side character's row, created by the pipeline that fills it
			 * (R-17) — see `respond`'s `placeholder`. Narration with a named
			 * speaker: `characterId` stays null so the rotation never sees it,
			 * and the side-character fact rides beside the message where the
			 * run and the receipt read it. `speaker` is the inlet's
			 * participant reference (`character:<id>`, or null for a
			 * free-form name) — wired so `metadata.speaker` names a picked
			 * character here exactly as it does on a migrated row (0138).
			 * `row` is the verb's row, for the reason `narrate` gives: a verb
			 * on a side character's line routes back here and must claim,
			 * not insert.
			 */
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					narration: true,
					sideCharacter: $.input.sideCharacter,
					speaker: $.input.speaker,
					instructions: $.input.text,
					row: $.input.messageId,
				}),
			)
			// ⚠ `params`, for the reason the note below states about every
			// other slot on this spec: unnamed is unresolved, so `limit` reached
			// nothing and the binding fell through to a literal 100. The
			// declared default is 100 so this window does not move.
			.query('history', ($) =>
				C.sessionHistory.v1({
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			/**
			 * The keyword mechanism, over all three sources.
			 *
			 * ⚠ `params` is wired here for the reason every other slot on this
			 * spec names its own: the executor resolves only the slots a node's
			 * config already holds, so an unnamed slot arrives as `undefined`
			 * and Scan Depth, Max Recursion Depth and the rest render, validate
			 * and store while reaching nothing. That regression has now been
			 * shipped twice in this repo; it is not going to be shipped a third
			 * time by omission.
			 *
			 * Character lore reaches this turn because the scope names the
			 * speaker: `isCharacterLoreEntryVisible` admits an entry whose
			 * binding names `currentCharacterId`, and the host passes the
			 * scope's straight through. A free-form name has no id, so the
			 * scope's speaker is null and the read is narrator-shaped — which
			 * is the honest answer for somebody the lorebook has never heard of.
			 */
			.query('lore', ($) =>
				C.lorebookTriggers.v1({
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			.query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
			/**
			 * The entity mechanism — rows found because the scene is *naming*
			 * what they name. Its `messages` out-port is deliberately not wired
			 * into `pool`: `assemble` builds the transcript from `lines`, so a
			 * retrieved message reaching `rank` would take budget out of the
			 * `messages` band and render nowhere.
			 */
			.query('entities', ($) =>
				C.entitySearch.v1({
					scope: $.input.sessionScope,
					params: slot.params(),
				}),
			)
			/**
			 * Retrieval by meaning. A block rather than spine nodes: the debug
			 * preview halts at the first Provider **on the spine**, and an
			 * `embed` there would show a reader a list of query strings instead
			 * of a prompt. Ships off — `vector-search.maxEntries` is 0.
			 */
			.gather('semantic', { mode: 'parallel' }, (b) =>
				b.chain('arm', (c) =>
					c
						.task('queries', ($) =>
							C.queryWindows.v1({
								messages: $.history.messages,
								cast: $.cast.cast,
								params: slot.params(),
							}),
						)
						.oracle('embed', ($) =>
							C.embedText.v1({
								texts: $.semantic.arm.queries.current,
								params: slot.params(),
							}),
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
			/**
			 * ⚠ Concatenation, **not** `merge-candidates` — the merge stamps a
			 * reciprocal-rank `presetScore` that `select` prefers over the
			 * weighted signal sum, which makes every signal weight inert. And
			 * order is the design: `concat` keeps the first occurrence of a
			 * `source:id`, so the keyword lane leads and later mechanisms add
			 * signals to what it found rather than replacing it.
			 */
			.task('pool', ($) =>
				C.concatCandidates.v1({
					sources: [
						// The conversation's band intent alone — see `respond`'s
						// `lore` node (R-7 P5): it reserves the transcript's slice
						// of the window. `lore` carries its own three at the head
						// of `main` — `lorebook-triggers` declares an intent per
						// band it produces (`worldLoreShare` …), so a share tuned
						// on that node reaches the ranker declared, not defaulted.
						$.history.band,
						$.lore.main,
						$.entities.main,
						$.semantic.arm.search.main,
					] as any,
				}),
			)
			/**
			 * Retrieval by description. ⚠ It may only reorder, never admit:
			 * `entity-link` returns the list it was handed, enriched, so there
			 * is no id it can produce that another mechanism did not. Ships off
			 * on the first node — `mention-spans.maxMentions` is 0.
			 */
			.gather('names', { mode: 'parallel' }, (b) =>
				b.chain('arm', (c) =>
					c
						.query('mentions', ($) =>
							C.mentionSpans.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						)
						.oracle('embed', ($) =>
							C.embedText.v1({
								texts: $.names.arm.mentions.texts,
								// One `enabled` switch for both embed nodes (R-7 P2): the
								// semantic mechanism's embed owns it, this one reads it.
								params: slot.params({ node: 'semantic.arm.embed' }),
							}),
						)
						.query('link', ($) =>
							C.entityLink.v1({
								scope: $.input.sessionScope,
								candidates: $.pool.candidates,
								mentions: $.names.arm.mentions.mentions,
								vectors: $.names.arm.embed.vectors,
								params: slot.params(),
							}),
						),
				),
			)
			/** The enriched list first, the raw list behind it — see `narrate.ts`. */
			.task('poolLinked', ($) =>
				C.concatCandidates.v1({
					sources: [$.names.arm.link.main, $.pool.candidates] as any,
				}),
			)
			/**
			 * The prompt, from the side character's perspective.
			 *
			 * `sideCharacter` is a port rather than a prompt field, and that
			 * is the reason this is its own context type: a side character's
			 * name is data the trigger carried, different every turn, and a
			 * prompts slot would store whichever name was used last and
			 * render it for everybody after.
			 */
			.task('context', ($) =>
				C.buildSideCharacterContext.v1({
					cast: $.cast.cast,
					sideCharacter: $.input.sideCharacter,
					prompts: slot.prompts(),
					variables: slot.variables(),
				}),
			)
			/**
			 * How much room the context has, from the window itself.
			 *
			 * `samplingOf("generate")` rather than its own slot, exactly as the
			 * other two pipelines: a budget computed against one window and a
			 * prompt sent against another is wrong in the direction that
			 * truncates, silently, and sharing the reference makes the two
			 * impossible to point apart.
			 */
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('generate'),
					// The other half of the same pair, for the model's own
					// window (0114) — see `respond`.
					connection: slot.connectionOf('generate'),
					params: slot.params(),
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.poolLinked.candidates,
					budget: $.contextBudget.available,
					params: slot.params(),
				}),
			)
			.task('lines', ($) =>
				C.processMessages.v1({
					messages: $.history.messages,
					cast: $.cast.cast,
					templateContext: $.context.templateContext,
					// The side character's name, on the line the model
					// continues from. Not the joined cast list, which would
					// teach the model to write joint dialogue as the cast.
					seedName: $.context.seedName,
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					// The ranker's per-band allocation, which `allocate` fell
					// back to `{}` for while nothing wired it — the receipt's
					// `sources`, not the prompt. See `respond` for the terms.
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					// One authored prompt, read by reference where the template
					// asks for `{{systemPrompt}}` (13 §12 finding i).
					prompts: slot.prompts({ node: 'context' }),
					variables: slot.variables(),
					params: slot.params(),
					// The connection this prompt is being WRITTEN FOR, shared
					// with the step that sends it: only `metadata.promptFormat`
					// is read from it, and without it the render falls back to
					// Vicuna markers on every connection while the receipt
					// reports the format that was not used.
					connection: slot.connectionOf('generate'),
				}),
			)
			.oracle('generate', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					// ⚠ The two slots this node OWNS and never named. Both are
					// already read by reference from here — `contextBudget`'s
					// `samplingOf("generate")` and `prompt`'s
					// `connectionOf("generate")` above — so the pick sized and
					// wrapped the prompt while `refId(p.connection)` at the host
					// read `null` and the request went to the instance default.
					// See the note above `NARRATE_CHARACTER_VERSION`.
					connection: slot.connection(),
					sampling: slot.sampling(),
					// And the third: `params.stopSequences` has had a reader
					// since the stop-sequence ruling (2026-09-10) and no spec
					// named the slot, so the control rendered and the value
					// reached nothing. Behaviour-preserving — the parameter
					// carries no declared default, so an install that never
					// typed one still resolves `undefined`. See the note in
					// `respond.ts`, which closed for the same reason.
					params: slot.params(),
					// No `prompts` here — see `respond.ts` (culled 2026-09-16).
				}),
			)
			/** The side character's row, filled — see `placeholder`. */
			.outlet('save', ($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.generate.text,
					thinking: $.generate.thinking,
				}),
			)
			.build(),
	)
