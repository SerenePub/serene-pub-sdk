/**
 * Core's answer-a-message pipeline.
 *
 * One file per spec, because a pipeline is content and content grows: the
 * summarize and graph-build specs are several nodes each with their own step
 * prompts, and a single module holding all of them would be a merge conflict
 * waiting for the first person to add a sixth.
 */

import { compile, spec, slot, sessionEvents } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { chatGenre } from './genres.js'

/** The spec a session turn runs. */
export const RESPOND_SPEC_ID = 'core:spec/respond'
// 1.1.0: one authored prompt, not three. The context builder owns the
// `prompts` slot; assemble and generate read it by reference (13 §12 finding
// i, closed) — so the panel renders one prompts group and `world.ts` no
// longer writes the same text to two nodes. A published version is
// immutable, so the rewiring is a new version.
//
// 1.2.0: the context builder takes a `variables` slot, so how each part of the
// prompt is laid out is a selection rather than a `JSON.stringify` in
// TypeScript. The shipped layouts reproduce the old output byte for byte —
// this version changes what is *configurable*, not what is produced.
//
// 1.3.0: the same for assembly, whose lore and history are laid out *after* the
// budget decided what fit. A separate bump rather than folding it into 1.2.0:
// an install that already published 1.2.0 would keep its stored document,
// since seeding matches on (slug, semver) — so rewriting a version in place is
// how a pipeline silently ends up without the wiring the code assumes.
//
// 1.4.0: the narrative graph's relationship summary reaches the prompt. It
// always did on the legacy path (`generateResponse.ts` set it on the adapter)
// and never did here, so a user with the graph on lost the block by switching —
// a missing feature rather than a changed one, which is why it lands as a new
// version and not a fix.
// 1.5.0: `narratorName` leaves this pipeline's prompts slot. It was declared on
// the shared context-builder type and read only when there is no speaking
// character — which never happens here — so all twelve shipped reply prompts
// carried an empty box. `0114` strips the key from rows already written.
// 1.6.0 — the ranker stopped carrying an absolute token budget.
//
// `rank` used to be handed `budget: 4096` as a parameter, because nothing
// supplied its `budget` in-port; an absolute count on a node cannot know which
// model it is about to be sent to, so it was free to disagree with the window
// and warn nobody. A `contextBudget` step now derives the number from the
// sampling config the reply is generated against, and `rank` divides *that* by
// the configurable share. A new version because the wiring changed.
// 1.7.0: the four reads move into an `async` block and run together. They were
// sequential only because unblocked nodes are, never because the data required
// it — all four take `input.sessionScope` and none reads another's output, and
// `graphContext` alone makes three round trips.
//
// They stay four distinct nodes. Concurrency is how they run, not a reason to
// collapse them into one box fetching four unrelated things.
//
// The keys inside a block are qualified, so `history` becomes
// `gather.history.read`. `reconcileConfigs` culls values at the old addresses
// and records a notice carrying what each one was.
// 1.8.0: world lore and character lore are separate queries, merged before
// ranking. One query returning both meant one weight, one floor and one share
// for two things that are not alike — character lore is bound to whoever is
// speaking and world lore is not, so "more world, less character" could not be
// said. Retrieval is unchanged: candidates already carried which source they
// came from, so each node is the same scan with one filter.
// 1.9.0: the narrative graph splits into two nodes and two variables —
// `relationshipsPerspectives` (how the speaker regards everyone) and
// `relationshipsKnown` (how everyone regards them, plus the figures the world
// knows of). One node emitted all three sections through one port under one
// "Your relationships:" heading, so opposite claims arrived as one list and
// they shared a layout, a priority and an on/off switch.
//
// ⚠ This is the first deliberate departure from 0.5's prompt bytes. Everything
// before it moved wrappers around without changing them;
// `contextTemplateWrappers.test.ts` records the exception and why.
// 1.10.0: history entries get a lane. ⚠ A **regression fix**: 1.8.0 replaced
// the one lore query with two that each filter the shared scan to their own
// source, and nothing filtered for `history` — so from 1.8.0 until now, dated
// history summaries were retrieved, scored and then dropped, while the ranker
// kept a `history` band and `assemble` kept asking for history blocks. No test
// caught it, because the parity corpus renders through `lorebook-triggers@1`
// rather than through this document. The corpus mirrors the three lanes now.
// 1.11.0: turn-taking becomes a node (19 §5, U-C4). Selection used to happen
// before the run existed — the one decision per turn the receipt could not
// explain. The `speaker` node honors the trigger's explicit pick and records
// it; context and generation take their speaker from its output, so the
// prompt's voice and the stop-string exclusion follow the same recorded
// decision. Pinned to `turn-manual` because the socket still pre-picks every
// turn — the node passes the pick through and today's bytes are unchanged.
// U-C5 retires the pre-pick, and swapping this pin to `turn-round-robin` is
// then a version bump, not a rewiring.
// 1.15.0 (24): the deep genre rename — taxonomy claims `genre:
// core:genre/chat` (the genre's own id, 24 §3) and the input carries the
// usage lock (24 §4). Document fields changed, so the hash moves: a bump.
// 1.16.0: the three lore lanes wire their `params` slot. ⚠ A **regression
// fix**, on the same footing as 1.10.0: `contextBudget`, `rank` and `prompt`
// have always named their slots and these never did, and `resolveInput` only
// resolves slots the node's config already holds — so Scan Depth, Max
// Recursion Depth and Retrieval Mode rendered, validated, stored and resolved
// through the whole scope chain into a value nothing ever read. The bump is
// what makes it reach an install at all: `seedCoreSpecs` matches on (slug,
// semver), so editing 1.15.0 in place would be a silent no-op, and the stored
// declarations a config back-fills from come from the published version.
// 1.17.0: the three lore lanes stop going through
// `core:task/merge-candidates@1`. ⚠ A **regression fix**, and the third of its
// kind in this file. The merge is reciprocal-rank *fusion* — its whole premise
// is two mechanisms ranking the same pool, so an entry both found outranks one either
// found alone — and it stamps a `presetScore` on everything it passes through.
// `select` prefers `presetScore` over the weighted signal sum, so on three
// **disjoint** lists every entry's score collapsed to its position in its own
// list, `keywordQuery` does not sort, and that position is database row order.
// Net effect: `score()`, all nine signal weights and the priority bonus were
// inert on the shipped reply path. `core:task/concat-candidates@1` puts the
// lanes end to end and stamps nothing, which is what leaves the ranker
// something to rank. `session/entity-cooccurrence` in the parity corpus is the
// fixture that could see it, and it moves from held-divergence to gate here.
// 1.18.0: the third retrieval mechanism. `core:query/entity-search@1` runs beside the
// three lore lanes and finds rows because the scene is *naming* what they name —
// no keys, no embedding model. It is wired **last** into `concat-candidates` on
// purpose: that node keeps the first occurrence of a `source:id`, so an entry the
// keyword scan already found keeps its keyword signals and only entries no key
// reached are added. Evidence adds; keys still guarantee.
//
// ⚠ It ships **inert**: `maxEntries` and `maxMessages` both default to 0, which
// is off by the `maxRecursionDepth` / `admitThreshold` convention. The bump is
// what carries the node to an install at all — `seedCoreSpecs` matches on (slug,
// semver) — and until somebody raises one of the two, an upgraded install
// retrieves exactly what it retrieved before.
// 1.19.0: the **fourth** mechanism, and the last one this pipeline was missing.
// `core:query/vector-search@1` has been built, bound and tested since the
// decomposition and was wired into no shipped spec at all — the header below
// said so, and the reason it gave (a spec that halts on a missing model would be
// the first thing a new user saw) is answered here rather than avoided.
//
// It lands as a **score component**, not as a rival ordering. The mechanism attaches
// `signals.semantic` to what it finds and stamps no `presetScore`, so an entry
// both the keyword scan and the semantic mechanism reached keeps its keyword signals
// and gains a semantic one — agreement between two independent mechanisms
// compounds by addition and there is nothing for a fusion step to reconcile.
// That is the whole reason it concatenates rather than merging, and it is the
// same argument 1.17.0 made about the three lore lanes.
//
// ⚠ Its own block rather than a fifth chain inside `gather`, and the reason is
// mechanical rather than aesthetic. Chains in a `parallel` block run under one
// `Promise.all`, so a chain cannot read a sibling's output; the semantic mechanism
// needs the messages `gather.history` reads, and the alternative — a second
// hundred-row read of the same table inside the lane — costs more than the
// block does. It still runs beside the lore lanes in every sense that matters:
// nothing between the two blocks depends on it, and its candidates arrive at the
// same `concat-candidates`. It is a block rather than three spine nodes because
// the debug preview stops at the first Provider **on the spine** — with `embed`
// on the spine the preview would halt on a payload that is a list of query
// strings, which is a correct application of the rule and a useless preview.
//
// ⚠ It ships **off**: `vector-search`'s `maxEntries` defaults to 0, the
// `admitThreshold` / `scoreLedAllocation` convention. One switch, not two — the
// `signalSemantic` weight it feeds is *not* zero, so raising the cap is the
// whole of turning it on. And an install with no embedding model loses a signal
// and nothing else: `embed-text` returns no vectors under `auto` rather than
// failing the turn, and `vector-search` returns empty with the reason on the
// receipt. Adding a model may only add matches; removing one may only lose them.
// 1.20.0: the **fifth** mechanism — retrieval by *description*. A second named
// vector space holding one vector per **name** (an entry's title, the aliases
// its body declares, the bound character's names), queried with the descriptive
// references the scene actually used. `core:query/mention-spans@1` finds them,
// `core:oracle/embed-text@1` embeds them, and `core:query/entity-link@1`
// matches them to names — so *"the captain"* reaches Captain Vell and *"the
// order"* reaches The Ashguard Riders. Neither shares a character with its
// target, so keys, trigrams and the gazetteer all miss them, and they are the
// references people actually write.
//
// ⚠ **It may only reorder. It may never admit**, and that is wiring rather than
// a promise. `entity-link` takes the concatenated candidate list on an in-port
// and returns *that list* with `signals.entityVector` attached to whatever
// linked, so there is no id it can emit that some other mechanism did not
// already produce. The reason is that invented proper nouns are where embeddings
// are least reliable — "Vell" has no learned meaning, so its vector comes from
// subword fragments and Vell, Vall and Vela cluster — and a confident wrong link
// is worse than a miss: it would inject wrong lore at high confidence into a
// fixed budget, displacing right lore. Constrained to reordering, the same wrong
// link costs a position and a receipt line naming it.
//
// ⚠ **`loreLinked` is where that constraint is enforced, and its argument order
// is the whole of it.** `concat-candidates` keeps the **first** occurrence of a
// `source:id`, so the mechanism's enriched copies win and the raw `lore.candidates`
// behind them is a pure fallback: switched off, no embedding model, or an error
// the executor recovered as empty all land on exactly the list `rank` would have
// seen without the mechanism. `rank` reads a concatenation either way, which is what
// makes "an unavailable mechanism subtracts a signal and nothing else" true by
// construction rather than by a `try` inside one binding.
//
// ⚠ It ships **off**, and the switch is on the *first* node: `mention-spans`'
// `maxMentions` defaults to 0, so nothing is read, nothing is embedded and the
// mechanism costs literally nothing until somebody raises it. `entity-link.maxLinks`
// is a ceiling and ships at 5, and `signalEntityVector` is 0.2 — one switch, not
// three, so turning the mechanism on with one control does something. The weight sits
// strictly below `signalNameMatch`'s 0.25 on purpose: exact and trigram matching
// own invented names, entity vectors own descriptive references, and a vector
// link must never outrank an entry whose title literally occurred.
//
// ⚠ **1.20.0, edited in place — deliberately, and paired with a migration.**
//
// The `prompt` step gained `connection: slot.connectionOf("generate")`, so the
// render finally learns the wire format it is rendering for. Under the version
// freeze ruled for the 0.6 pre-release ("no SDK spec bumps; all stay a hard 1
// until 0.7.0") this is NOT a new semver — which means seeding, which matches on
// (slug, semver) and skips a match, would never carry it to a database that has
// already booted. Migration 0095 deletes the published `pipeline_spec_versions`
// row for this pin so boot republishes it, and `specHashes.test.ts` records the
// moved hash in the same change. Neither half is optional: without the
// migration the edit reaches no existing install and is invisible on a fresh
// test database, which is exactly the failure `specHashes.test.ts` exists to
// make loud.
//
// ⚠ **1.20.0, edited in place a SECOND time — again deliberately, again paired
// with a migration.**
//
// `lines` gained `continuationPrefill: $.input.continuationPrefill`, so the
// text a continue is continuing reaches the seed line the model writes from.
// Under the same version freeze, and therefore under the same terms as the
// paragraph above: migration `0106` deletes this pin's published
// `pipeline_spec_versions` row so boot republishes it, and re-projects
// `core:task/process-messages@1` and `core:inlet/user-message@1`, whose port
// declarations moved. `specHashes.test.ts` and `registryHashes.test.ts` record
// the moved hashes in the same change. Without the migration the edit reaches
// no install that has already booted and is invisible on a fresh test database.
//
// ⚠ **1.20.0, edited in place a THIRD time — same terms, same pairing.**
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
// ⚠ **1.20.0, edited in place a FOURTH time — same terms, same pairing, and
// two distinct slot shapes at once.** Found by
// `boot/paramsSlotWiring.test.ts`, which walks every declared slot against
// every shipped document and had seventeen of these written down in its
// ledger.
//
//  1. **The `generate` node names `connection` and `sampling`.** It is the
//     OWNER of both — `contextBudget` reads `slot.samplingOf("generate")` and
//     `prompt` reads `slot.connectionOf("generate")`, so a pick on the reply
//     step already moved the budget and the wire format — and it never named
//     them itself, so `refId(p.connection)` in `host.ts` read `null` and
//     `resolveCapabilityTarget` fell to the instance default. The prompt was
//     sized and wrapped for one endpoint and sent to another.
//
//     ⚠ This one is NOT behaviour-preserving on an install where somebody set
//     the picker, and that is the point: the pick was stored and ignored, and
//     the app owner classes the current state as a defect (STATE-2026-09-08 §1,
//     "Per-node sampling ignored"). Nothing changes for an install that never
//     set one — the slot falls back to the same `connection_defaults` row the
//     `capabilityDefault` tier reads, and a session override still outranks it.
//
//  2. **The two relationship reads name `params`.** `bindings.ts` calls
//     `capRelationships(section, input?.params?.maxEntries)` and nothing
//     supplied it, so the ceiling was `undefined` — which that function reads
//     as no ceiling at all. Behaviour-preserving, and the declaration is what
//     makes it so: `maxEntries` carries no default now (uncapped is not a
//     number `min: 0` can hold), so an untouched install resolves `undefined`
//     and stays uncapped.
//
// `drizzle/0111_reply_slots_and_relationship_cap.sql` re-projects the two
// relationship types, deletes this pin so boot republishes it, and lifts the
// stored `12`s `reconcileConfigs` back-filled from the old declaration.
// `specHashes.test.ts` and `registryHashes.test.ts` record the moved hashes in
// the same change; no half is optional.
//
// ⚠ **1.20.0, edited in place a FIFTH time — content-addressed now, so no
// migration deletes the pin: boot publishes the changed document under its new
// hash and moves the pointer (ruling 2026-09-10), and `specHashes.test.ts`
// records the move.** Weights to the source (R-7 P5, 2026-09-16, plans/30
// U3b): the `lore` concat takes `$.gather.history.read.band` first — the
// conversation's **band intent**, alone — so the ranker reserves the
// transcript's slice of the window from `session-history`'s own declaration
// rather than from a `share` map on itself. The three lore lanes and the
// ranked relationship read publish their intents at the head of `main`, which
// this document already wired, so nothing else here moves. Same numbers, same
// prompt; the parity corpus holds it. Migration 0135 moves the stored maps.
export const RESPOND_VERSION = '1.20.0'

/**
 * Core's answer-a-message pipeline.
 *
 * All five mechanisms since 1.20.0 — keys, names the scene said, meaning,
 * names the scene *described*, and the structural signals that order what they
 * find. Three of the five need nothing installed; the two that read embeddings
 * need a model and both ship switched off, so a first boot runs exactly the
 * zero-cost path it always did.
 */
export const respondSpec = () =>
	compile(
		spec(RESPOND_SPEC_ID, {
			version: RESPOND_VERSION,
			/** Catalogue claims (23 §2): the standard chat's main turn. */
			taxonomy: {
				role: 'primary',
				genre: chatGenre.id,
			},
		})
			/** The usage lock (24 §4): this spec answers Chat's primary turn. */
			.inlet('input', C.userMessage.v1(), {
				genre: chatGenre,
				event: sessionEvents.messageRespond,
			})
			/**
			 * The reply row, created by the pipeline that fills it (R-17).
			 *
			 * Straight after the inlet, before anything costs a token: this is
			 * the placeholder the composer shows while the turn runs, the run's
			 * live row the oracle's stream lands in, and the row Stop finalises
			 * with whatever had arrived. `save` at the end updates it; the pair
			 * is one primary row. The trigger inserts nothing any more — a
			 * regenerate, swipe or continue hands its existing row in on
			 * `messageId` and this node claims it instead of inserting.
			 */
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					characterId: $.input.characterId,
					row: $.input.messageId,
				}),
			)
			/**
			 * The four reads, run together.
			 *
			 * Every one of them takes `input.sessionScope` and none consumes
			 * another's output, so nothing about the data required them to
			 * happen in turn — but unblocked nodes execute sequentially, so a
			 * turn waited for all four in series. `graphContext` alone makes
			 * three round trips.
			 *
			 * They stay four distinct nodes. Concurrency is a property of how
			 * they run, not a reason to collapse them into one box that fetches
			 * four unrelated things — the editor should be able to draw the
			 * pipeline's real shape.
			 *
			 * `mode` is the author's default here and the administrator's
			 * decision at runtime: four overlapping reads suit a local database
			 * and may not suit a rate-limited remote one, and the person who
			 * knows which is not the person who wrote this.
			 */
			.gather('gather', { mode: 'parallel' }, (b) =>
				b
					// ⚠ `params` is wired here for the same reason the three
					// lore lanes below wire it, and it was missing for longer:
					// a slot absent from the node's config is never resolved, so
					// `limit` — "How many recent messages are considered for the
					// context" — arrived as `undefined` on every run this
					// pipeline has ever made. The binding then fell through to a
					// literal 100, which is why the declared default is 100 now
					// (see `sessionHistory` in the contracts package): the
					// control becomes live without moving anybody's window.
					.chain('history', (c) =>
						c.query('read', ($) =>
							C.sessionHistory.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					// Two lore lanes, not one. World lore and character lore
					// were a single query sharing a weight, a floor and a
					// share of the window, which left "more world, less
					// character" unsayable.
					//
					// ⚠ `params` is wired here for the same reason it is on
					// `contextBudget`, `rank` and `prompt`: a slot absent from
					// the node's config is never resolved, so the declared
					// parameters arrive as `undefined` no matter what the panel
					// stored. These three lanes shipped without it from 1.8.0,
					// which made Scan Depth, Max Recursion Depth and Retrieval
					// Mode controls that rendered, validated and saved without
					// ever reaching the scan.
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
								// The settings live on the world-lore lane (R-7 P2, one owner per
								// setting per spec): the three lanes declare the same seven knobs,
								// and a person tuning them tunes them once.
								params: slot.params({ node: 'gather.worldLore.read' }),
							}),
						),
					)
					// The third lane. It was missing from 1.8.0 to 1.10.0 and
					// history was absent from every prompt in that window —
					// see `core:query/history-entries@1` for how a split into
					// two lanes dropped a third source without failing.
					.chain('historyEntries', (c) =>
						c.query('read', ($) =>
							C.historyEntries.v1({
								scope: $.input.sessionScope,
								// The settings live on the world-lore lane (R-7 P2, one owner per
								// setting per spec): the three lanes declare the same seven knobs,
								// and a person tuning them tunes them once.
								params: slot.params({ node: 'gather.worldLore.read' }),
							}),
						),
					)
					// The third mechanism (design §13.5). Same scope, same shared
					// read of the lorebook — what differs is the index it
					// consults: the *entities* a row names rather than the keys
					// an author wrote or a vector nobody has computed. It is
					// the mechanism a keyless book works by, and the first
					// retrieval over conversation history in the product.
					//
					// ⚠ Its `messages` out-port is deliberately **not** wired
					// into `lore` below. `assemble` builds the transcript from
					// `lines`, not from ranked candidates, so a retrieved
					// message reaching `rank` would take budget out of the
					// `messages` band — half the window by default — and render
					// nowhere at all. That is the shape of the failure history
					// had between 1.8.0 and 1.10.0, and it is not one to repeat
					// on purpose. Retrieved transcript lands when design §5's
					// compression region does.
					.chain('entities', (c) =>
						c.query('read', ($) =>
							C.entitySearch.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('cast', (c) =>
						c.query('read', ($) => C.sessionCast.v1({ scope: $.input.sessionScope })),
					)
					// Optional by construction: an install that never opened
					// the narrative graph gets an empty string here and the
					// template's `{{#if}}` skips the block. Its own node rather
					// than a read inside the context Task, because a Task is
					// handed no services (F11) — and because a node is
					// something a user can see on the receipt and remove
					// without editing the context builder.
					// Two lanes, as with lore, and for the same reason. One
					// node emitted both directions of the graph under a single
					// heading — what the speaker thinks of everyone, and what
					// everyone thinks of the speaker — which a model reads as
					// one list and a user cannot separate.
					//
					// ⚠ `params` on both, for the fourth time in this file and
					// the same one line each: a slot absent from the node's
					// config is never resolved, so "Most relationships" arrived
					// as `undefined` and `capRelationships` returned every
					// relationship the graph holds however small the number the
					// panel showed. The declaration carries no default now — see
					// `relationshipSlots` in the contracts — so an untouched
					// install stays uncapped, which is what it has always been.
					.chain('relationshipsPerspectives', (c) =>
						c.query('read', ($) =>
							C.relationshipsPerspectives.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					.chain('relationshipsKnown', (c) =>
						c.query('read', ($) =>
							C.relationshipsKnown.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					)
					/**
					 * The graph as a retrieval **mechanism** (ruling
					 * 2026-09-10, Q1 — the ruling's word is *arm*; see the
					 * type's own note for why the id does not spell it).
					 *
					 * The two branches above hand the graph to the template as
					 * three keyed sections, in whatever order the database
					 * returned the rows, outside the budget entirely. This one
					 * reads the same three layers as candidates in the
					 * `relationships` band — the band the ranker, the share
					 * control and the entry cap have all carried since they were
					 * written and nothing has ever put anything in — ordered by
					 * scene presence, then the speaker, then recency.
					 *
					 * ⚠ **It replaces neither of them.** Both keep feeding
					 * `context`; this is what lets the graph compete for the
					 * window and appear on the retrieval receipt. Which of the
					 * two paths eventually wins is a rendering question and not
					 * this document's to decide.
					 *
					 * ⚠ **It ships inert, and the off switch is the share.**
					 * `rank-hybrid`'s `share.relationships` defaults to 0, which
					 * `select` reads as "leave this source out" — so every
					 * candidate this produces is excluded with
					 * `excluded_group_disabled` and the prompt is byte-identical
					 * until somebody drags that band. That is a *visible*
					 * off state with a reason on the receipt, which is the shape
					 * this retrieval surface prefers to a second cap defaulting
					 * to zero.
					 *
					 * A third traversal of the same graph, and it is a real
					 * cost: the two branches above already walk it once each.
					 * They are in one `parallel` block, so it is concurrency
					 * rather than wall-clock, and collapsing three reads into one
					 * node is the same trade the two lore lanes already refused —
					 * a node is what a person can see on the receipt and switch
					 * off.
					 */
					.chain('relationships', (c) =>
						c.query('read', ($) =>
							C.relationshipSearch.v1({
								scope: $.input.sessionScope,
								params: slot.params(),
							}),
						),
					),
			)
			/**
			 * The fourth mechanism — retrieval by meaning (1.19.0, design phase 2).
			 *
			 * Three nodes, and the split is the same one the other mechanisms have:
			 * a Task decides *what to ask*, a Provider reaches the model
			 * because a Query may not (16 §1), and a Query does the retrieval.
			 *
			 * ⚠ **A block, and after `gather` rather than inside it.** Two
			 * separate reasons, both mechanical. Inside `gather` this could not
			 * read `gather.history`'s messages — chains of a `parallel` block
			 * run under one `Promise.all` and cannot see each other — and the
			 * only way round that is a second read of the same hundred rows.
			 * And on the *spine* the debug preview would stop here: it halts at
			 * the first Provider it reaches, which would show a reader a list
			 * of query strings instead of a prompt. A block is where the rule
			 * expects retrieval to be, and the RAG parity harness places its own
			 * embed calls the same way for the same reason.
			 *
			 * Nothing between the two blocks reads this, so it is a sibling of
			 * the lore lanes in every sense except the source line ordering.
			 *
			 * ⚠ It ships **off** — `vector-search.maxEntries` is 0 — and an
			 * install with no embedding model is not a broken install: `embed`
			 * yields no vectors under its `auto` setting, `search` returns empty
			 * with the reason on the receipt, and the turn loses a signal rather
			 * than failing. That is the plan's second governing rule in wiring:
			 * an unavailable mechanism subtracts a signal, it never disables a
			 * path.
			 */
			.gather('semantic', { mode: 'parallel' }, (b) =>
				b.chain('arm', (c) =>
					c
						// One window, not two. The RAG spec embeds a current and
						// a recent window and fuses their ranks, because it is
						// producing an *ordering*; this mechanism produces a score
						// component, and a second window would need exactly the
						// fusion step 1.17.0 removed from this pipeline. The
						// recent window is reachable by raising `recentWindow`
						// for anybody who wants the wider query.
						.task('queries', ($) =>
							C.queryWindows.v1({
								messages: $.gather.history.read.messages,
								cast: $.gather.cast.read.cast,
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
			 * Who speaks (19 §5). The trigger's pick arrives on
			 * `input.speaker` — a participant reference (R-18 (3)), so a
			 * genre's envoy arrives the same way a library character does —
			 * and always wins; the strategy decides only when the trigger did
			 * not. `characterId` rides beside it one release longer for the
			 * readers that still take the bare id. `turn-manual` never decides
			 * — see the 1.11.0 note for why that is today's correct pin.
			 */
			.task('speaker', ($) =>
				C.turnManual.v1({
					cast: $.gather.cast.read.cast,
					messages: $.gather.history.read.messages,
					speaker: $.input.speaker,
					characterId: $.input.characterId,
				}),
			)
			/**
			 * How much room the context has, from the window itself.
			 *
			 * `samplingOf("generate")` rather than its own slot, and that is
			 * the whole safety of this step: a budget computed against one
			 * window and a prompt sent against another is wrong in the
			 * direction that truncates, silently. Sharing the reference makes
			 * the two impossible to point apart, rather than documenting that
			 * they must agree and hoping.
			 */
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('generate'),
					// The other half of the same pair, for the model's own
					// window (0114). Shared for the same reason, and read by the
					// one computation dispatch sizes the request with (R-8).
					connection: slot.connectionOf('generate'),
					params: slot.params(),
				}),
			)
			// All three lanes reach the ranker, and the count is the point.
			// Wiring `rank` to a subset drops the rest silently — the prompt
			// simply has no character lore, or no history, in it, and nothing
			// anywhere says so. That is not hypothetical: history was left out
			// of this list from 1.8.0 to 1.10.0 and every prompt lost it.
			//
			// ⚠ Concatenation, **not** `merge-candidates`. The three lanes are
			// disjoint by construction — an entry is world lore or character
			// lore or history, never two — so there is no agreement between them
			// for rank fusion to measure. The merge fused them anyway and
			// stamped a reciprocal-rank `presetScore` on every candidate, which
			// `select` prefers over the weighted signal sum; each entry then
			// ranked by its position in its own list, which for an unsorted
			// keyword scan is database row order. Ranking across the three is
			// `rank-hybrid`'s job, and budgeting between them is what the share
			// bands are for.
			.task('lore', ($) =>
				C.concatCandidates.v1({
					sources: [
						/**
						 * The conversation's **band intent** and nothing else
						 * (R-7 P5): `session-history` ranks no candidates — the
						 * transcript is built from `lines` — but its `share` is
						 * what reserves the transcript's slice of the window
						 * before the lore sources divide the rest. Each lore
						 * lane's own intent rides at the head of its `main`;
						 * this one needs a port of its own because `main`
						 * carries message rows. First, so a reader of the
						 * receipt sees the bands before the items.
						 */
						$.gather.history.read.band,
						$.gather.worldLore.read.main,
						$.gather.characterLore.read.main,
						$.gather.historyEntries.read.main,
						// ⚠ Last, and the position is the design. Concatenation
						// keeps the **first** occurrence of a `source:id`, so an
						// entry both mechanisms found keeps the keyword mechanism's full
						// signal set and the entity mechanism only ever contributes
						// rows no key reached. Put it first instead and every
						// keyed entry would arrive scored on entity overlap
						// alone.
						$.gather.entities.read.main,
						// The semantic mechanism, after it, and the ordering matters
						// less than it does for the entity mechanism: `concat` merges
						// a duplicate's *signals* into the copy it keeps for
						// keys that copy does not carry, and `semantic` is a key
						// no other mechanism produces. So an entry the keyword scan
						// found keeps every keyword signal **and** gains this
						// one — which is what "each mechanism contributes to one
						// score" means in wiring, and why there is no fusion
						// node here to reconcile two incomparable scales.
						$.semantic.arm.search.main,
					] as any,
				}),
			)
			/**
			 * The fifth mechanism — entries reached by a **description**
			 * (1.20.0, design phase 4).
			 *
			 * Three nodes with the same split the semantic mechanism has: a Query
			 * decides what to ask, a Provider reaches the model because a Query
			 * may not (16 §1), and a Query does the retrieval. The difference
			 * is what is compared — short mention against short *name*, in a
			 * second vector space, which is the comparison embeddings are most
			 * reliable at and the one a whole-entry vector cannot make.
			 *
			 * ⚠ **After `lore` rather than beside it**, because this mechanism's pool
			 * *is* `lore`'s output: it may only attach a signal to candidates
			 * some other mechanism already produced. Everything else about its
			 * placement is the semantic mechanism's argument unchanged — a block
			 * rather than spine nodes, so the debug preview does not halt at the
			 * `embed` Provider and show a reader a list of mention strings
			 * instead of a prompt.
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
								candidates: $.lore.candidates,
								mentions: $.names.arm.mentions.mentions,
								vectors: $.names.arm.embed.vectors,
								params: slot.params(),
							}),
						),
				),
			)
			/**
			 * ⚠ **The enriched list first, the raw list behind it.**
			 *
			 * `concat-candidates` keeps the first occurrence of a `source:id`,
			 * so this is a fallback rather than a merge: when the mechanism produced
			 * anything, its copies carry `signals.entityVector` and win; when it
			 * produced nothing — off, no embedding model, an error recovered as
			 * empty — the second source is exactly what the ranker would have
			 * seen without it. That is what makes "an unavailable mechanism
			 * subtracts a signal and never removes a candidate" a property of
			 * the wiring rather than of a binding's error handling.
			 *
			 * `rank` reads this rather than `lore` for the same reason: a node
			 * whose input is a concatenation cannot be emptied by one of its
			 * sources going quiet.
			 */
			.task('loreLinked', ($) =>
				C.concatCandidates.v1({
					sources: [
						$.names.arm.link.main,
						$.lore.candidates,
						/**
						 * The relationship mechanism, here rather than in
						 * `lore`.
						 *
						 * `lore` is the entity-vector mechanism's **pool**:
						 * `entity-link` takes that list on an in-port and may
						 * only attach a signal to candidates some other
						 * mechanism already produced. Putting graph edges in it
						 * would change what that mechanism embeds and compares
						 * for a signal the `relationships` band weighs at 0 —
						 * a cost with no effect. Concatenated after it instead,
						 * so the pool the fifth mechanism sees is byte-identical
						 * to what it saw before this one existed.
						 *
						 * Nothing can collide: `concat` de-duplicates on
						 * `source:id`, and no other mechanism produces a
						 * `relationships` candidate.
						 */
						$.gather.relationships.read.main,
					] as any,
				}),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.loreLinked.candidates,
					budget: $.contextBudget.available,
					params: slot.params(),
				}),
			)
			/**
			 * ⚠ **After the ranker, and that is the whole of what moved.**
			 *
			 * It read the two graph branches directly and could sit anywhere
			 * after `gather`. It reads the *allocated* band now, which does not
			 * exist until `rank` has selected — so the node follows it. Nothing
			 * between the two ever read this node: `lines` and `prompt` are
			 * downstream of both, and the ranker takes candidates rather than a
			 * context. The one node that declares randomness is still this one
			 * and still the only consumer of the run's seeded stream, so the
			 * example dialogue a replay picks is unchanged by the move.
			 */
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					currentCharacterId: $.speaker.characterId,
					/**
					 * The narrative graph, both ways it can arrive.
					 *
					 * ⚠ **Two keys on one port, not two ports.** The declared
					 * in-port is `json` and carries the section the template
					 * renders; what this adds is the *source* it should be built
					 * from. `band` is `rank`'s inclusions — ranked by scene
					 * presence, capped by the query, and inside the window the
					 * budget divided — and `graph` is the traversal's own dump,
					 * behind it. A nested literal is how a port takes more than
					 * one reference (`concat-candidates`' `sources` is the same
					 * construction), and it needs no declaration to move.
					 *
					 * ⚠ **The dump is the fallback, per RUN.** With no
					 * relationship allocated — `share.relationships` is 0 on a
					 * shipped install, so `select` excludes the whole band with
					 * `excluded_group_disabled` — the section renders exactly
					 * the bytes it always did. Raising that share is what moves
					 * the graph from *dumped whole, outside the budget* to
					 * *retrieved*: only what ranking selected, in rank order,
					 * within what the band was allotted.
					 *
					 * Both ports carry the same `band` and their own half of the
					 * graph. The split is by lane on the way out, which is what
					 * the two sibling queries do to the same traversal.
					 */
					relationshipsPerspectives: {
						band: $.rank.candidates,
						graph: $.gather.relationshipsPerspectives.read.relationshipsPerspectives,
					} as any,
					relationshipsKnown: {
						band: $.rank.candidates,
						graph: $.gather.relationshipsKnown.read.relationshipsKnown,
					} as any,
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
					/**
					 * The continue verb, wired (ruling 2026-09-08, D-2).
					 *
					 * ⚠ Wiring it is the whole of it. `process-messages` has put
					 * `continuationPrefill` on the seed line since the runtime
					 * was written, and no spec supplied a value — so a continue
					 * sent an EMPTY seed, got a fresh reply, and the socket
					 * glued the partial on afterwards. This is the same class of
					 * omission as 1.16.0's unwired `params`: the mechanism
					 * existed at both ends and nothing joined them.
					 *
					 * Empty on an ordinary turn, and the port carries "" — so
					 * this pipeline is byte-identical for every turn that is not
					 * a continue.
					 */
					continuationPrefill: $.input.continuationPrefill,
				}),
			)
			.task('prompt', ($) =>
				C.assemble.v2({
					candidates: $.rank.candidates,
					decisions: $.rank.decisions,
					/**
					 * The per-band arithmetic the ranker already did (D-H).
					 *
					 * ⚠ **Published by `rank-hybrid` and wired by nobody**,
					 * for as long as both nodes have existed. `select()`
					 * returns what each band was allotted, spent and filled,
					 * the binding has always put it on this out-port, and
					 * `allocate` has always taken the `?? {}` branch instead —
					 * two adjacent nodes, one of them computing exactly what
					 * the other needed, with no edge between them.
					 *
					 * ⚠ **It does not move the prompt.** `allocate` copies
					 * this onto `AllocatedContext.groups` and reads it nowhere
					 * else; `blocks`, `totalTokens` and `budget` — everything
					 * the render walks — are the same bytes with it wired or
					 * not, which is why this lands under a frozen version
					 * rather than as a retune. What it fills in is the
					 * RECEIPT: `dispatch.ts` publishes `payload.groups` as the
					 * run's `sources`, so the budget panel's per-band numbers
					 * have been an empty object on every run ever recorded.
					 */
					groups: $.rank.groups,
					budget: $.contextBudget.available,
					messages: $.lines.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					// The context builder's authored text, by reference — one
					// prompt, written once, read where the template asks for
					// `{{systemPrompt}}` (13 §12 finding i).
					prompts: slot.prompts({ node: 'context' }),
					// Assemble's own layouts — the lore and history *it*
					// produced, laid out after the budget decided what fit.
					// Its own slot, not the context builder's: no earlier node
					// knows the answer.
					variables: slot.variables(),
					params: slot.params(),
					// The connection this prompt is being WRITTEN FOR, shared
					// with the step that sends it — the same construction, and
					// the same reason, as `contextBudget`'s `samplingOf`
					// above: a prompt wrapped for one endpoint and sent to
					// another is wrong silently.
					//
					// Only `metadata.promptFormat` is read from it, and
					// assemble calls nothing. Without it `renderers.ts` fell
					// back to Vicuna on every run, so every ChatML, Llama-2,
					// Alpaca and Claude connection was sent Vicuna markers and
					// the receipt reported the format that was NOT used.
					connection: slot.connectionOf('generate'),
				}),
			)
			.oracle('generate', ($) =>
				C.generateText.v1({
					context: $.prompt.context,
					// The stop-string exclusion follows the speaker node's
					// output — the payload-wins seam in the host (19 §5).
					currentCharacterId: $.speaker.characterId,
					// ⚠ **The two slots this node has always been the OWNER of,
					// and never named.**
					//
					// `contextBudget` sizes the prompt with
					// `slot.samplingOf("generate")` and `prompt` renders it with
					// `slot.connectionOf("generate")` — both read
					// `config['generate']`, so a pick made on this step already
					// decided the window the prompt is cut to and the wire format
					// it is wrapped in. What it did not decide was where the
					// request went: `resolveInput` resolves only the slots a
					// node's config names, so `p.connection` and `p.sampling`
					// were `undefined` at the binding, `host.ts`'s
					// `refId(p.connection)` read `null`, and
					// `resolveCapabilityTarget` took that as "the pipeline chose
					// nothing" and fell to the instance default. One window sized
					// the prompt and another received it.
					//
					// So this is a picker becoming live rather than a retune: a
					// person who set it expected it to be used, and every install
					// that never set one keeps resolving the same instance
					// default it always did (`resolveSlot` falls back to
					// `world.activeConnection[kind]`, which `world.ts` projects
					// from the very `connection_defaults` row the
					// `capabilityDefault` tier reads). A session names no
					// connection of its own: the pair is this slot's pick or the
					// capability default, and only a session's SAMPLING rides on
					// top (`PAIR_TIERS` vs `RESOLUTION_TIERS` in
					// `capabilityTarget.ts`).
					connection: slot.connection(),
					sampling: slot.sampling(),
					// ⚠ **The third slot this node owns, and the last half of
					// the stop-sequence ruling (2026-09-10).**
					//
					// `core:oracle/generate-text@1` declares
					// `params.stopSequences` — "sequences that end the reply the
					// moment the model writes one" — the binding reads
					// `input?.params?.stopSequences`, `DispatchRequest` carries
					// it, and `BaseConnectionAdapter.withStops` sends it. Every
					// piece existed except this one: `resolveInput` resolves only
					// the slots a node's config names, so the key was never
					// formed and the reader saw `undefined` on every turn — while
					// the panel rendered the control and stored what people typed
					// into it.
					//
					// Behaviour-preserving to close, and the declaration is what
					// makes it so: `stopSequences` carries no default, so an
					// install that never typed one still resolves `undefined` and
					// sends exactly the stops it always did.
					params: slot.params(),
					// No `prompts` here: `core:oracle/generate-text@1` declares
					// no such slot any more (culled 2026-09-16, R-12) — the
					// instructions travel inside `context`, from `prompt`.
				}),
			)
			/**
			 * The reply row, filled. The placeholder above created it; this
			 * ends its generation with the text and the trace. One row, one
			 * run — see `placeholder`.
			 */
			.outlet('save', ($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.generate.text,
					thinking: $.generate.thinking,
				}),
			)
			.build(),
	)
