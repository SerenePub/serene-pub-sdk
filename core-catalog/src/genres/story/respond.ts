/**
 * Core's answer-a-message pipeline: Story's reply — the roleplay Chat's reply
 * until 2026-10-19 (ruled: today's Chat prompts, context template and variable
 * templates ARE Story's reply), with its two reading duties (2026-10-20).
 *
 * One file per spec — every pipeline core ships is its own module, under its
 * genre's folder (`genres/<genre>/`) or `shared/` — because a pipeline is
 * content and content grows: the summarize and graph-build specs are several
 * nodes each with their own step prompts, and a single module holding all of
 * them would be a merge conflict waiting for the first person to add a sixth.
 */

import { compile, spec, slot, sessionEvents, coreEvents } from '@serene-pub/sdk'
import { CORE_LOADOUT } from '../../loadouts.js'
import * as C from '@serene-pub/contracts'
import { POST_HISTORY_TOKEN_TRIGGER } from '../../registry/genres.js'
import { applyWiring, wiring } from '../../shared/calls.js'
import { STORY_REPLY_OWNERS_SCRIPT, STORY_SCENE_READING_SCRIPT } from './reckon.js'
import { READ_PATH_SCRIPT } from '../../shared/scriptSeed.js'
import { bareEntryTypeId, locationEntryType } from '../../registry/entries.js'

/** The spec a session turn runs. @experimental */
export const STORY_RESPOND_SPEC_ID = 'core:spec/story-respond'
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
// then a version bump, not a rewiring. **Done 2026-09-21** (edited in place
// under the freeze, content-addressed): the socket pre-picks nothing, the
// node is pinned `turn-round-robin` and seated BEFORE `placeholder`, whose
// row now takes `characterId`/`speaker` from the node's output.
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
// ⚠ It ships **Automatic**: `query-windows.searchByMeaning` defaults to `auto`,
// on the chain's **first** node, which searches whenever an embedding model is
// set up — local or a service billed per request, alike — and not when there
// is none. (For one day, 2026-09-29, it skipped a service; the owner,
// 2026-09-30: "I never said to skip paid services for retrieval, that's what
// they are there for.") `queries` reads whether one is set up off its own
// embedding connection slot (`slot.connection()`, the install's active
// embedding connection — it was a reference to the embed step's slot until
// `embed-text` stopped declaring one, 2026-10-05); when it does not search it
// cuts
// no probes and `embed-text` makes no call. One switch, not two — the
// `signalSemantic` weight it feeds is *not* zero, and `vector-search.maxEntries`
// is a ceiling that ships at 5, so turning the switch on is the whole of
// turning the mechanism on. And an install with
// no embedding model loses a signal and nothing else: `embed-text` returns no
// vectors under `auto` rather than failing the turn, and `vector-search`
// returns empty with the reason on the receipt. Adding a model may only add
// matches; removing one may only lose them.
//
// ⚠ 2026-09-29 (genre uplift C3): until then the switch was
// `vector-search.maxEntries = 0`, on the chain's **last** node, so the probes
// were embedded before it said nothing was wanted — every turn with an
// embedding model ready, lorebook or not, paid for an embed it threw away, a
// provider call per turn in API mode. No document edit and no version move:
// both are definition defaults, which reach an install through the registry
// sync. F1 (the same day) is a document edit — the `connection` reference on
// `queries` — at the frozen version; `specHashes.test.ts` records the move.
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
// text an extend is carrying on reaches the seed line the model writes from.
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
// 1.21.0: the `speaker` node moved to `core:spec/turn-order`
// (PLAN-turn-order §4.4, §7). Who speaks is STATE now — the entry being
// fired names them, and it arrives on the inlet — so this spec no longer
// decides anything about turn-taking, and `placeholder` has returned to
// directly after the inlet, where it can make the row before a token is
// spent. A new semver rather than an in-place edit: the node list changed,
// so a stored 1.20.0 document must stay exactly as it is and this must
// re-project (§0 rule 3).
//
// ⚠ **1.21.0, edited in place (2026-10-02, author's note AN1) —
// content-addressed, so boot publishes the changed document under its new
// hash and moves the pointer; `specHashes.test.ts` records the move.** The
// `context` step wires `fields: $.input.fields`, so a genre that declares the
// author's note (Chat) gets it on the template context. Every other genre's
// prompt is the bytes it was: no note, nothing placed.
//
// ⚠ **1.21.0, edited in place (2026-10-02, lorebooks C2) — content-addressed;
// `specHashes.test.ts` records the move.** A `gather.presences` read
// (`core:query/cast-presences@1`) and an `eligible` step
// (`core:task/eligibility@1`) between `loreLinked` and `rank`: exclusions from
// the three keyword lanes, the speaker's secrecy, and presence at the
// session's moment mark candidates ineligible. A book with no selective logic,
// no secrets and no presences ranks exactly what it ranked.
//
// ⚠ **1.21.0, edited in place (2026-10-03, history window) —
// content-addressed; `specHashes.test.ts` records the move.**
// `contextBudget` runs before the reads, and `gather.history.read` takes its
// `budget`: the read is the newest rows up to about twice the window (never
// more than 2000) instead of the newest 100, so the transcript fit's held cut
// decides the prompt's first line once a session passes 100 messages.
//
// ⚠ **1.21.0, edited in place (2026-10-05, sprites in-pipeline) —
// content-addressed; `specHashes.test.ts` records the move.** The sprite step
// is written out after `save` — `spritePick` (`core:oracle/pick-sprite@1`,
// handed the reply's text and speaker) and `spriteShow` — where the retired
// `withSpriteTail` wrapper appended four nodes this source never named; and
// `semantic.arm.queries` wires its own embedding connection
// (`slot.connection()`), since `embed-text` declares none to reference.
//
// ⚠ **1.21.0, edited in place (2026-10-13, live scenes §6) —
// content-addressed; `specHashes.test.ts` records the move.** The reply tick
// after `spriteShow`: a `tick` step (`core:task/clock-step@1`, exposed to the
// session as *Each reply advances the clock by …*, By 0 = off) and a `clock`
// junction holding *Advance story clock*. Off by default, so every session
// replies exactly as it did.
//
// ⚠ **1.21.0, edited in place (2026-10-13, live scenes §15 G12) —
// content-addressed; `specHashes.test.ts` records the move.** The tick's
// *Advance story clock* says `onRefusal: 'skip'`: a story with no clock yet
// skips the tick with a ledger line instead of halting after the reply.
//
// ⚠ **1.21.0, re-homed (2026-10-19, PLAN-genre-restructure R4)** — the spec
// is `core:spec/story-respond` (it was `core:spec/chat-respond`: the roleplay
// Chat became the Story genre, and Chat the plain assistant). The reply graph
// is unchanged by ruling; after the reply tick it now resolves the session's
// background tasks (`core:task/resolve-tasks@1`) and runs the reckoning and
// the sweep behind their junctions (`reckon.ts`). A session whose tasks are
// all Off (Minimal) runs exactly the reply it ran. The app's migration
// re-keys the stored rows (renamed-id table, lane 1 report).
//
// ⚠ **1.21.0, edited in place (2026-10-20, PLAN-layering §4) —
// content-addressed; `specHashes.test.ts` records the move.** The reckoning
// and the sweep left the reply: each is a routine of its own
// (`core:spec/story-reckoning`, `core:spec/story-sweep`), registered on a
// cadence in the Story genre's defaults, so the reply is one call on every
// preset. The head's `tasks` step became `reading`
// (`core:task/reply-duties@1`): *Read the lorebook* and *Read the scene* are
// the reply's own settings (A6), read where they always were. The inlet
// names no genre (`{ suits }`).
// ⚠ Edited in place (2026-10-21, omni O5/O7/O9) — content-addressed;
// `specHashes.test.ts` records the move. A `heard` step (transcribe-audio)
// before placement hears the audio the reply cannot; `generate` names its
// speech sampling, and `save` writes the reply's media parts in order.
// ⚠ Edited in place (2026-10-23, PLAN-rulesets-functions D7) — content-
// addressed; `specHashes.test.ts` records the move. `generate`, `save` and
// the sprite steps moved into the `reply` junction's `prose` branch
// (`reply.prose.*`, the slot references with them), beside the `changes`
// branch — *Replies carry changes*, the `reading` duty, off by default, so a
// reply runs the prose it ran. A stored config keyed `generate`, `save`,
// `spritePick`, `spriteShow` moves to `reply.prose.<key>` (the merge's data
// upgrade).
// ⚠ Edited in place (2026-10-23, PLAN-genres-seams S2): the `changes`
// branch's commit reads the reply's own duty mode (`reading.modes`), never
// the reckoning's routine mode by spec id; it names its owners (`owners`,
// `core:script/story-reply-owners`) to the schema and the commit, and its
// `asked` step reads the preset's `path` (its params were never wired) —
// `specHashes.test.ts` records it.
// ⚠ Edited in place (2026-10-23, RF fix 3) — content-addressed;
// `specHashes.test.ts` records the move. The `reply` junction holds only what
// differs: the prose call, or the changes call and what reads its answer
// (`owners`, `shape`, `generate`, `asked`, `message`). ONE tail after it —
// `save`, the `commit` (Apply alone: the `changes` branch fires at Full only),
// `spritePick`, `spriteShow`, then the tick — reads the junction's `text` and
// runs once, back at the top-level keys `save`, `spritePick`, `spriteShow`
// (the app's 0123 data upgrade moves what 0120 sent to `reply.prose.*`, and
// `reply.changes.commit.applied.apply` to `commit.applied.apply`). Each branch
// carrying its own save and sprite steps showed two settings for one step.
/** @internal */
export const STORY_RESPOND_VERSION = '1.21.0'

/**
 * The reply's duties as its junctions read them (`core:task/reply-duties@1`'s
 * `modes`): each duty's key → `full` or `off`.
 */
interface ReplyDutyModes {
	readonly 'lore-retrieval': string
	readonly 'scene-reading': string
	/** 🚧 D7: *Replies carry changes* (off by default). */
	readonly 'reply-changes'?: string
}

/**
 * Core's answer-a-message pipeline.
 *
 * All five mechanisms since 1.20.0 — keys, names the scene said, meaning,
 * names the scene *described*, and the structural signals that order what they
 * find. Three of the five need nothing installed; the two that read embeddings
 * need a model and both ship switched off, so a first boot runs exactly the
 * zero-cost path it always did.
 * @experimental
 */
export const storyRespondSpec = () => {
	/** What the reply's steps ask of its declared defaults. */
	const w = wiring()
	// 🚧 *Read the scene* (lane 2): the gate script, its two parts, and the
	// places listing's entry type — see the `scene` step below.
	w.scripts.push(['scene', STORY_SCENE_READING_SCRIPT.seedKey])
	w.scripts.push(['sceneState', READ_PATH_SCRIPT.seedKey])
	w.scripts.push(['scenePlaceList', READ_PATH_SCRIPT.seedKey])
	w.params.push(['scenePlaces', { entryTypes: [bareEntryTypeId(locationEntryType)], withLinks: true }])
	return compile(
		spec(STORY_RESPOND_SPEC_ID, {
			version: STORY_RESPOND_VERSION,
			/** Catalogue claims (23 §2): the Story genre's main turn. */
			taxonomy: {
				role: 'primary',
			},
		})
			/** The usage lock (24 §4): this spec answers Story's primary turn. */
			.inlet('input', C.userMessage.v1(), { suits: [coreEvents.messageRespond] })
			/**
			 * The reply row, created by the pipeline that fills it (R-17) —
			 * **directly after the inlet** (PLAN-turn-order §4.4).
			 *
			 * It used to wait for the cast and history reads, because a
			 * `speaker` node between them decided who the row was for. Turn
			 * order is state now: the entry being fired names the speaker,
			 * and it arrives on the inlet — so the row can be made in the
			 * first milliseconds of the run, before anything costs a token.
			 * This is the placeholder the composer shows while the turn runs,
			 * the run's live row the oracle's stream lands in, and the row
			 * Stop finalises with whatever had arrived. `save` at the end
			 * updates it; the pair is one primary row. A regenerate, swipe or
			 * extend hands its existing row in on `messageId` and this node
			 * claims it instead of inserting.
			 */
			.outlet('placeholder', ($) =>
				C.createMessage.v1({
					generating: true,
					characterId: $.input.characterId,
					speaker: $.input.speaker,
					row: $.input.messageId,
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
			 *
			 * Before the reads (history window, 2026-10-03): the history read
			 * is sized by this budget, so it is computed first. It reads only
			 * config, never a step, so moving it changes no value.
			 */
			.task('contextBudget', ($) =>
				C.contextBudget.v1({
					sampling: slot.samplingOf('reply.prose.generate'),
					// The other half of the same pair, for the model's own
					// window (0114). Shared for the same reason, and read by the
					// one computation dispatch sizes the request with (R-8).
					connection: slot.connectionOf('reply.prose.generate'),
					params: slot.params(),
				}),
			)
			/**
			 * 🚧 **What the reply reads** (2026-10-20, PLAN-layering §4, A6):
			 * the reply's own two duties, a switch each and the session
			 * owner's to flip — *Read the lorebook* is the `retrieval`
			 * junction before `rank`, *Read the scene* the `scene` gate
			 * before `context`. Read at the head, once; no model call. Was
			 * the reply group of the retired background tasks.
			 */
			.task('reading', ($) => C.replyDuties.v1({ params: slot.params() }), {
				expose: { session: true, label: 'What the reply reads' },
			})
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
					//
					// `budget` (history window, 2026-10-03): the read is sized
					// by the window — about twice what it holds — and `limit`
					// is not read, so `prompt`'s transcript fit, not a row
					// count, decides where the conversation starts.
					.chain('history', (c) =>
						c
							.query('read', ($) =>
								C.sessionHistory.v1({
									scope: $.input.sessionScope,
									budget: $.contextBudget.available,
									params: slot.params(),
								}),
							)
							// 🚧 The files those rows show (PLAN-composer-attachments
							// §3.5), one query for the transcript. `attached` below
							// decides, per line, what the model receives.
							.query('attachments', ($) =>
								C.historyAttachments.v1({
									messages: $.gather.history.read.messages,
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
								params: slot.params($.gather.worldLore.read),
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
								params: slot.params($.gather.worldLore.read),
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
					// into `lore` below. It publishes the declared
					// `recalledLines` band (2026-09-27), which renders only where
					// a context template places `{{{recalledLines}}}` — and no
					// shipped template does. Which genre places recalled lines,
					// and where, is the compression region's call (design §5);
					// wiring the port without a template that places them would
					// spend budget on lines the prompt never carries (the
					// receipt says so, but the budget is still spent).
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
					)
					/**
					 * Who is in the world at the session's moment (R4) — the
					 * presences on its line, for `eligible`'s presence rule.
					 */
					.chain('presences', (c) =>
						c.query('read', ($) => C.castPresences.v1({ scope: $.input.sessionScope })),
					),
			)
			/**
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
			 * ⚠ It ships **Automatic** — `queries`' `searchByMeaning` is
			 * `auto`, on the chain's first node: it searches whenever an
			 * embedding model is set up (`queries`' connection resolves), local
			 * or a service alike, and otherwise `embed` is handed no texts and
			 * makes no call; `search`'s `maxEntries` is only
			 * a ceiling — and an
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
								// The install's embedding connection, for whether
								// one is set up: `searchByMeaning`'s Automatic
								// searches whenever it is, wherever the model runs.
								connection: slot.connection(),
								params: slot.params(),
							}),
						)
						.oracle('embed', ($) =>
							C.embedText.v1({
								texts: $.semantic.arm.queries.current,
								params: slot.params(),
							}),
							{ expose: { label: 'Embed the recent messages' } },
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
								params: slot.params($.semantic.arm.embed),
							}),
							{ expose: { label: 'Embed the mentions' } },
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
			/**
			 * **The hard gates, before the ranker** (C2; rulings R2, R4). An
			 * entry an author's own selective logic ruled out stays out
			 * whichever mechanism brought it back (`exclusions`, from the
			 * three keyword lanes); a tie that is someone else's secret is not
			 * this speaker's; a member not in the world at the session's
			 * moment has their lore gated. Nothing is dropped — the ranker
			 * records each as `excluded_ineligible` with the sentence.
			 */
			/**
			 * 🚧 *Read the lorebook* (`lore-retrieval`, the `reading` duty):
			 * Off, and the ranker is handed the conversation's band alone —
			 * no lore, character lore, history entry or tie reaches the
			 * prompt; On (the default), the hard gates run as they always
			 * did. Either way one step, so the reply's call count is
			 * unchanged.
			 */
			.junction('retrieval', { on: ($) => $.reading.modes }, (j) =>
				j
					.when('off', { path: (v: ReplyDutyModes) => v['lore-retrieval'], equals: 'off' }, (b) =>
						b.task('eligible', ($) =>
							C.eligibility.v1({
								candidates: $.gather.history.read.band,
							}),
						),
					)
					.otherwise('on', (b) =>
						b.task('eligible', ($) =>
							C.eligibility.v1({
								candidates: $.loreLinked.candidates,
								exclusions: [
									$.gather.worldLore.read.exclusions,
									$.gather.characterLore.read.exclusions,
									$.gather.historyEntries.read.exclusions,
								] as any,
								speaker: $.input.speaker,
								presences: $.gather.presences.read.main,
								at: $.gather.presences.read.at,
							}),
						),
					),
			)
			.task('rank', ($) =>
				C.rankHybrid.v1({
					candidates: $.retrieval.candidates,
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
			/**
			 * 🚧 *Read the scene* (`scene-reading`, lane 2, 2026-10-19): the
			 * session's state and the lorebook's places, read every turn (no
			 * model call) and handed to the context builder only while the
			 * task is on (`core:script/story-scene-reading`), which then makes
			 * `{{locationEntry}}` — where the story is: the place's name, what
			 * it is like, the ways from here — for the prompt row to place.
			 * Off (Minimal), the builder is handed nothing and the prompt is
			 * the bytes it was.
			 */
			.query('sceneNow', ($) => C.sessionState.v1({ scope: $.input.sessionScope }), {
				expose: { label: 'Where the story stands' },
			})
			.query('scenePlaces', ($) => C.lorebookEntries.v1({ scope: $.input.sessionScope, params: slot.params() }), {
				expose: { label: 'The places the lorebook knows' },
			})
			.task(
				'scene',
				($) =>
					C.runScript.v1({
						input: { modes: $.reading.modes, state: $.sceneNow.state, places: $.scenePlaces.entries } as any,
						params: slot.params(),
					}),
				{ expose: { label: 'Read the scene, when on' } },
			)
			.task(
				'sceneState',
				($) => C.runScript.v1({ input: { from: $.scene.main, path: 'state' } as any, params: slot.params() }),
				{ expose: { label: 'The state, for the scene' } },
			)
			.task(
				'scenePlaceList',
				($) => C.runScript.v1({ input: { from: $.scene.main, path: 'places' } as any, params: slot.params() }),
				{ expose: { label: 'The places, for the scene' } },
			)
			.task('context', ($) =>
				C.buildTemplateContext.v1({
					cast: $.gather.cast.read.cast,
					currentCharacterId: $.input.characterId,
					// 🚧 *Read the scene*: null and empty while the task is off.
					state: $.sceneState.main,
					locationEntries: $.scenePlaceList.main,
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
					/**
					 * 🚧 The session's genre fields (2026-10-02, AN1) — for
					 * the **author's note** a genre may declare
					 * (`AUTHORS_NOTE_FIELD`; Chat does). The builder carries
					 * it to Assemble, which places it, and the template
					 * renders it where it writes `{{#with ../authorsNote}}`.
					 * A genre that declares no note supplies none, and the
					 * prompt is the bytes it was. The other Chat fields
					 * (auto-advance, turn mode, character detail) become
					 * interpolation variables here, as Adventure's do —
					 * nothing shipped writes them.
					 */
					fields: $.input.fields,
				}),
				// 🚧 R54 (2026-10-21): the reply's prompt is the session owner's to
				// choose, among the prompts an administrator has not hidden — a
				// setting of the reply in the session's settings. Never its text.
				{ expose: { promptReach: 'owner' } },
			)
			.task('lines', ($) =>
				C.processMessages.v1({
					messages: $.gather.history.read.messages,
					cast: $.gather.cast.read.cast,
					templateContext: $.context.templateContext,
					seedName: $.context.seedName,
					/**
					 * The extend verb, wired (ruling 2026-09-08, D-2; `continue` until 2026-09-28).
					 *
					 * ⚠ Wiring it is the whole of it. `process-messages` has put
					 * `continuationPrefill` on the seed line since the runtime
					 * was written, and no spec supplied a value — so an extend
					 * sent an EMPTY seed, got a fresh reply, and the socket
					 * glued the partial on afterwards. This is the same class of
					 * omission as 1.16.0's unwired `params`: the mechanism
					 * existed at both ends and nothing joined them.
					 *
					 * Empty on an ordinary turn, and the port carries "" — so
					 * this pipeline is byte-identical for every turn that is not
					 * an extend.
					 */
					continuationPrefill: $.input.continuationPrefill,
				}),
			)
			/**
			 * 🚧 **Each line's attachments, placed** (PLAN-composer-attachments
			 * §3.5; D2/D3). An image `generate` can read, within the media
			 * lookback, rides on its own line's turn; a text file is inlined;
			 * the rest are named. Judged on `generate`'s pair — the step that
			 * sends this prompt — through its slot's `metadata.reads`. A
			 * transcript with no files passes through untouched, so the prompt
			 * is byte for byte what it was.
			 */
			/**
			 * 🚧 Audio the reply cannot hear, heard first (O9) — see
			 * `chat/respond.ts`. Nothing to hear sends nothing.
			 */
			.oracle(
				'heard',
				($) =>
					C.transcribeAudio.v1({
						messages: $.lines.messages,
						attachments: $.gather.history.attachments.attachments,
						hears: $.contextBudget.reads,
						connection: slot.connection(),
						params: slot.params(),
					}),
				{ expose: { label: 'Transcribe audio' } },
			)
			.task('attached', ($) =>
				C.placeAttachments.v1({
					messages: $.lines.messages,
					attachments: $.heard.attachments,
					connection: slot.connectionOf('reply.prose.generate'),
					params: slot.params(),
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
					messages: $.attached.messages,
					templateContext: $.context.templateContext,
					template: slot.template(),
					// The context builder's authored text, by reference — one
					// prompt, written once, read where the template asks for
					// `{{systemPrompt}}` (13 §12 finding i).
					prompts: slot.prompts($.context),
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
					connection: slot.connectionOf('reply.prose.generate'),
				}),
			)
			/**
			 * 🚧 **Replies carry changes** (PLAN-rulesets-functions D7, R7;
			 * 2026-10-23) — the reply's own switch (`reply-changes`, the
			 * `reading` duty), off by default. On, the reply is one JSON object
			 * in strict mode — its words (`message`) and what the scene changed
			 * (`changes`: an attribute's value up or down, an entry gained or
			 * lost, never a rewritten sheet), its schema built from the
			 * session's ruleset (`ruleset-resolve`'s `replySchema`). Off, the
			 * reply is the prose it always was — the `prose` branch.
			 *
			 * 🚧 **The junction holds only what differs** (RF fix 3, 2026-10-23,
			 * owner: "careful about hidden behavior … why do we have duplicate
			 * sprites in the pipeline?"): each branch is its model call and what
			 * reads that call's answer, and ends in the step whose `text` is the
			 * reply's words — the prose call itself, or the answer's `message`.
			 * The junction hands that `text` on (M4; a text-stream and a text
			 * agree on text), so ONE tail after it — `save`, the `commit`, the
			 * line's face, the tick — runs once, at the top-level keys it had
			 * before D7, whichever branch fired. Never a second copy of a step in
			 * each branch: two copies were two settings for one thing.
			 */
			.junction('reply', { on: ($) => $.reading.modes }, (j) =>
				j
					.when('changes', { path: (v: ReplyDutyModes) => v['reply-changes'], equals: 'full' }, (c) =>
						c
							/**
							 * 🚧 Whose changes it may name (S2): the world and everyone seated,
							 * by reference — what the schema's `owner` words and the commit
							 * resolve (`core:script/story-reply-owners`).
							 */
							.task('owners', ($) => C.runScript.v1({ input: { session: $.input.session } as any, params: slot.params() }), {
								expose: { label: 'Whose changes a reply may carry' },
							})
							/** What a reply may change: the schema, from the session's ruleset. No dice, no writes. */
							.task(
								'shape',
								($) =>
									C.rulesetResolve.v1({
										params: slot.params(),
										scope: $.input.sessionScope,
										owners: $.owners.main,
										mode: 'resolve',
										actions: { replyShape: true } as any,
									}),
								{ expose: { label: 'What a reply may change' } },
							)
							.oracle(
								'generate',
								($) =>
									C.generateJson.v1({
										context: $.prompt.context,
										schema: $.shape.replySchema,
										connection: slot.connection(),
										sampling: slot.sampling(),
										params: slot.params(),
									}),
								{
									// Not the streaming step: a JSON step never streams into a row (D6's law) —
									// the words land with the save until that law reads a reply's `message` (D7).
									expose: {
										status: '{speaker} is typing',
										label: 'Reply',
										purpose: 'Writes the reply and what the scene changed, as one answer the rules can read.',
									},
								},
							)
							/**
							 * What the scene changed: the answer's `changes` — the step's `path`
							 * (S2: its params wired, so the preset's `path` reaches it; the
							 * whole answer went to the rules before).
							 */
							.task('asked', ($) => C.parseJson.v1({ text: $.generate.text, params: slot.params() }))
							/**
							 * The reply's words: the answer's `message` (the step's `path`) —
							 * last, so the junction hands them on as its `text`.
							 */
							.task('message', ($) => C.joinText.v1({ items: $.generate.items, params: slot.params() })),
					)
					/** The reply as prose — what it always was: the call, whose `text` the junction hands on. */
					.otherwise('prose', (c) =>
						c.oracle('generate', ($) =>
							C.generateText.v1({
								context: $.prompt.context,
								// The stop-string exclusion follows the speaker node's
								// output — the payload-wins seam in the host (19 §5).
								currentCharacterId: $.input.characterId,
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
								speechSampling: slot.speechSampling(),
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
							{
								expose: {
									stream: true,
									status: '{speaker} is typing',
									label: 'Reply',
									purpose: 'Writes the reply: whoever is due speaks, from the story so far and the lore it found.',
								},
							},
						),
					),
			)
			/**
			 * The reply row, filled — once, whichever branch fired. The
			 * placeholder above created it; this ends its generation with the
			 * reply's words (the junction's `text`) and, from the prose call, the
			 * trace and its media parts (a JSON answer carries neither, so a
			 * reply that carries changes saves its words alone, as it always
			 * did). One row, one run — see `placeholder`.
			 */
			.outlet('save', ($) =>
				C.updateMessage.v1({
					target: $.placeholder.messageId,
					text: $.reply.text,
					reasoning: $.reply.prose.generate.reasoning,
					parts: $.reply.prose.generate.parts,
				}),
			)
			/**
			 * What the reply changed, through the rules — after the words are
			 * saved, so a refused change never costs the reply its words. At the
			 * reply's own mode (S2): its `changes` duty as the `reading` step
			 * publishes it, the same predicate the `changes` branch fired on, so
			 * it runs exactly when that branch ran and reads its owners and its
			 * parsed changes by their whole path. 🚧 Full applies; the reply's
			 * `changes` branch fires at Full only (an event registration carries
			 * no mode, R37), so no Review arm is declared that could never run.
			 */
			.junction('commit', { on: ($) => $.reading.modes }, (k) =>
				k.when('applied', { path: (v: ReplyDutyModes) => v['reply-changes'], equals: 'full' }, (a) =>
					a.task(
						'apply',
						($) =>
							C.rulesetResolve.v1({
								params: slot.params(),
								scope: $.input.sessionScope,
								owners: $.reply.changes.owners.main,
								deltas: $.reply.changes.asked.items,
								mode: 'apply',
							}),
						{ expose: { label: 'Apply what the reply changed' } },
					),
				),
			)
			/**
			 * The line's face (DESIGN-sprites §5), after the save so it never
			 * delays the reply: the sprite picker, handed the reply's own words
			 * and whose line it is. A session setting — "Choose sprites",
			 * stickiness and the floor are the session's to set — and ONE step,
			 * whichever branch wrote the words.
			 */
			.oracle(
				'spritePick',
				($) =>
					C.pickSprite.v1({
						text: $.reply.text,
						speaker: $.input.speaker,
						scope: $.input.sessionScope,
						params: slot.params(),
					}),
				{ expose: { session: true } },
			)
			/** … recorded on the line. A picker's null pick writes nothing. */
			.outlet('spriteShow', ($) =>
				C.showSprite.v1({
					target: $.save.messageId,
					pick: $.spritePick.main,
					source: 'picker',
				}),
			)
			/**
			 * 🚧 **The reply tick** (live scenes §6, 2026-10-13): *Each reply
			 * advances the clock by …*, the session's to set and off by default
			 * (**By** 0). A fixed tick, never a model's guess: the step reads
			 * its own parameters, and *Advance story clock* moves the session's
			 * clock behind a junction on `moves`, so the default writes nothing
			 * and refuses nothing. A reply that re-drives its row — a
			 * regenerate, a swipe, an extend — does not tick again (`unless`).
			 * Last, after the line and its face. Says it is a `tick` (live
			 * scenes §15 G4): never a time action for the boundary watcher,
			 * and a swipe of the reply keeps it, since the re-driven reply
			 * does not tick again. 🚧 A story with no clock yet skips the tick
			 * (`onRefusal: 'skip'`, live scenes §15 G12): the reply stands,
			 * the run finishes, and the ledger under the reply says *not on
			 * the clock* and why — never a turn that looks failed.
			 */
			.task('tick', ($) => C.clockStep.v1({ unless: $.input.messageId, params: slot.params() }), {
				expose: { session: true, label: 'Each reply advances the clock by' },
			})
			.junction('clock', { on: ($) => $.tick.moves }, (j) =>
				j.when('moves', { truthy: true }, (c) =>
					c.outlet('advance', ($) =>
						C.advanceStoryClock.v1({
							by: $.tick.by,
							unit: $.tick.unit,
							cause: 'tick',
							onRefusal: 'skip',
							params: slot.params(),
						}),
					),
				),
			)
			/**
			 * What Story ships with: the reminder's trigger
			 * (`POST_HISTORY_TOKEN_TRIGGER`), the reply on the Reply loadout
			 * (I12), and what its steps name (`Wiring`).
			 */
			.defaults((p) =>
				applyWiring(
					p
						.params('prompt', { postHistoryTokenTrigger: POST_HISTORY_TOKEN_TRIGGER })
						// The reply runs on the Reply loadout (I12).
						.loadout('reply.prose.generate', slot.loadout(CORE_LOADOUT.reply))
						.loadout('reply.changes.generate', slot.loadout(CORE_LOADOUT.reply))
						// 🚧 D7: the answer's words and its changes, read apart.
						.params('reply.changes.generate', { path: 'message' })
						.params('reply.changes.asked', { path: 'changes' })
						// 🚧 S2: whose changes the reply may name.
						.scripts('reply.changes.owners', [{ seedKey: STORY_REPLY_OWNERS_SCRIPT.seedKey }])
					.loadout('heard', slot.loadout(CORE_LOADOUT.transcription)),
					w,
				),
			)
			.build(),
	)
}
