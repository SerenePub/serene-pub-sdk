/**
 * Core's narrator pipeline — a narration or environment turn.
 *
 * ## Why this is its own namespace rather than a flag on the reply pipeline
 *
 * Structurally it is the reply pipeline: same queries, same assembly, same
 * provider. Every difference is *configuration* — a different system prompt, a
 * different post-history reminder, a name on the line the model continues from,
 * and its own connection and sampling choices. That is precisely the set of
 * things a namespace holds, and `narrator_prompt_configs` is already that table
 * wearing a different name.
 *
 * A flag on the reply spec would have made the two share one config surface,
 * which is the thing a user configuring a narrator most needs them not to do:
 * the narrator's whole job is to *not* sound like the character reply that
 * shares its session.
 *
 * ## What it deliberately keeps
 *
 * Lorebook triggers, because a narrator describing a place needs the lore about
 * that place as much as a character does. Reading `generateResponse.ts` closely,
 * the thing narrator mode actually skips is **graph context** — which needs a
 * speaking character's perspective and a narrator has none — not retrieval. The
 * two are easy to conflate, and conflating them would quietly strip a narrator
 * of its world.
 *
 * ## Its sibling (ruling 2026-09-07)
 *
 * `core:spec/narrate-character` is the other half of the split: a turn spoken
 * by somebody who is not in the cast. This one narrates the **world** and
 * speaks as nobody; that one speaks **as a person** and is written from their
 * perspective. Both read world lore, and neither is inserted into the
 * round-robin — see `narrateCharacter.ts` for how that is a property of the
 * message row rather than a rule this file enforces.
 *
 * They stay two specs for the reason this file's opening argument gives about
 * the reply pipeline: the difference between them is entirely *configuration* —
 * a different system prompt, a different name on the seed line, a different
 * context builder declaring a different surface — and a namespace is what holds
 * that. A flag would have made one config surface serve a narrator and a
 * character, which is precisely what neither wants.
 */
import { compile, spec, slot, sessionEvents } from '@serene-pub/sdk';
import * as C from '@serene-pub/contracts';
import { chatGenre } from './genres.js';
export const NARRATE_SPEC_ID = 'core:spec/narrate';
// 1.1.0: shared prompts slot, exactly as the respond spec (13 §12 finding i).
// 1.2.0: the `variables` slot, also exactly as the respond spec — and the
// layouts it selects are the *same rows*, since a layout is keyed by the
// variable it renders rather than by the pipeline that asked for it.
// 1.3.0: assembly's own `variables` slot, for its post-budget lore and history.
// 1.4.0: its own context-builder type. Sharing `build-template-context@1` with
// the reply pipeline meant sharing its *configurable surface*, and the panel is
// generated from the registry row — so the narrator offered layout pickers for
// example dialogue (which comes from a speaking character it does not have) and
// speaker relationships (which this spec deliberately never supplies), while
// `narratorName` sat on every reply prompt doing nothing. A type is the unit
// that declares a surface; two surfaces is two types.
// 1.5.0: declares its contribution — the narrator button on the standard
// mode (19 §3–§4). Contribution is content, so it is a version, not an edit.
// 1.9.0 (24): the deep genre rename — taxonomy and the contributed trigger
// claim `core:genre/chat` (the genre's own id), and the input carries the
// usage lock. Document fields changed, so the hash moves: a bump.
// 1.10.0: the `lore` node wires its `params` slot — the same regression fixed
// in the reply pipeline's 1.16.0, and for the same reason: a slot the config
// does not name is never resolved, so this node's retrieval parameters were
// never read. A bump because `seedCoreSpecs` matches on (slug, semver) and a
// config back-fills from the published version's declarations.
// 1.11.0: a `contextBudget` step, and `rank` finally has a budget to rank
// against. ⚠ A **regression fix**: `rank`'s `budget` in-port was wired by
// nothing here, and the reply pipeline retired the typed `budget: 4096`
// fallback in its 1.6.0 — so `availableTokens` resolved to 0, `allocateBudgets`
// returned zeros for every band, and every scored candidate came back
// `excluded_group_disabled` while every pinned one came back
// `excluded_pinned_token_limit`. **The narrator retrieved no lore at all.**
// Nothing failed: an empty lore block is what a session with no matching lore
// looks like, and the template's `{{#if}}` skips it either way. The step is
// `samplingOf("generate")` for the same reason it is in the reply pipeline — a
// budget computed against one window and a prompt sent against another is
// wrong in the direction that truncates, silently.
//
// ⚠ **1.11.0, edited in place — deliberately, and paired with a migration.**
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
// ⚠ **1.11.0, edited in place a second time — same terms, same pairing.**
//
// The three retrieval mechanisms the reply pipeline gained in 1.18.0, 1.19.0 and
// 1.20.0 are wired here: `core:query/entity-search@1`, the `semantic` arm
// (`query-windows` → `embed-text` → `vector-search`) and the `names` arm
// (`mention-spans` → `embed-text` → `entity-link`). Until now this pipeline
// wired the keyword mechanism and the ranker and nothing else — so a user who
// turned on "find entries by meaning" or "find entries by name" got **no change
// at all** in narrator mode, with nothing anywhere saying so. That is the same
// control-with-no-effect class the retrieval audit spent a day removing, and it
// was hiding in the one pipeline the audit's own corpus does not render through.
//
// Wired the way `respond` wires them, deliberately down to the argument order:
// `concat-candidates` keeps the FIRST occurrence of a `source:id`, so the
// keyword lane comes first and the entity mechanism only ever adds rows no key
// reached; and `rank` reads the *linked* concatenation with the raw one behind
// it, so every way the name mechanism can produce nothing lands on exactly the
// list the ranker would have seen without it.
//
// All three ship **off** — `entity-search`'s two caps, `vector-search.maxEntries`
// and `mention-spans.maxMentions` all default to 0 — so an upgraded install
// retrieves exactly what it retrieved before until somebody raises one. The
// version does not move (the 0.6 freeze), so `drizzle/0100` deletes the
// published `pipeline_spec_versions` row for this pin and boot republishes it;
// `specHashes.test.ts` records the moved hash in the same change. Neither half
// is optional — see the note above it for why.
//
// ⚠ **1.11.0, edited in place a THIRD time — same terms, same pairing.**
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
// ⚠ **1.11.0, edited in place a FOURTH time — same terms, same pairing.**
//
// The `generate` node names `connection` and `sampling`. It is the OWNER of
// both — `contextBudget` reads `slot.samplingOf("generate")` and `prompt` reads
// `slot.connectionOf("generate")`, so a pick on the narration step already
// moved the budget and the wire format — and it never named them itself, so
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
export const NARRATE_VERSION = '1.11.0';
export const narrateSpec = () => compile(spec(NARRATE_SPEC_ID, {
    version: NARRATE_VERSION,
    /** Catalogue claims (23 §2): a person-invoked action on chats. */
    taxonomy: {
        role: 'action',
        genre: chatGenre.id,
    },
    /**
     * The canonical contributed action (19 §4; R-15, U5c): this spec
     * offers the `narrate` function on standard-mode sessions — on the
     * composer's primary row (`quick`) and as `/narrate`. Same namespace
     * as the mode owner, so it lands as a companion — present by
     * default — and the standard input type never has to know it exists.
     */
    contributes: {
        actions: [
            {
                key: 'narrate',
                genre: chatGenre.id,
                function: 'narrate',
                venue: { kind: 'composer' },
                quick: true,
                icon: 'book-open-text',
                label: { en: 'Narrate' },
            },
        ],
    },
})
    // Manually triggered — a person asks the narrator to speak. Unlike the
    // reply pipeline, nothing about a new message should start one.
    /** The usage lock (24 §4): a person-invoked action on Chat sessions. */
    .inlet('input', C.userMessage.v1(), {
    genre: chatGenre,
    event: sessionEvents.sessionAction,
})
    /**
     * The narration row, created by the pipeline that fills it (R-17)
     * — see `respond`'s `placeholder`. Narration: no character, the
     * narrator's name on it, and the instructions the person typed
     * stored beside it, which is what a narrator turn's triggering
     * text is. `row` is the verb's row: a regenerate, swipe or
     * continue of a narration routes back here, and without it this
     * node inserted a second narration while the verb's row stayed
     * generating forever.
     */
    .outlet('placeholder', ($) => C.createMessage.v1({
    generating: true,
    narration: true,
    instructions: $.input.text,
    row: $.input.messageId,
}))
    // ⚠ `params` is wired for the same reason it is on `lore` below,
    // and it was missing here too: an unnamed slot is never resolved, so
    // `limit` arrived as `undefined` and the binding fell through to a
    // literal 100. The declared default is 100 for that reason, so the
    // narrator's window does not move as this becomes live.
    .query('history', ($) => C.sessionHistory.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))
    // ⚠ `params` is wired for the same reason it is on `rank` below: a
    // slot the node's config does not name is never resolved, so the
    // declared parameters arrive as `undefined` and the scan silently
    // runs on its engine defaults. Scan Depth and Max Recursion Depth
    // rendered, validated and saved here without ever being read.
    .query('lore', ($) => C.lorebookTriggers.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))
    .query('cast', ($) => C.sessionCast.v1({ scope: $.input.sessionScope }))
    /**
     * The entity mechanism (design §13.5) — rows found because the scene
     * is *naming* what they name. No keys, no embedding model.
     *
     * ⚠ Its `messages` out-port is deliberately **not** wired into
     * `pool` below. `assemble` builds the transcript from `lines`, not
     * from ranked candidates, so a retrieved message reaching `rank`
     * would take budget out of the `messages` band and render nowhere at
     * all — the same shape of failure the reply pipeline's history lane
     * had between its 1.8.0 and 1.10.0.
     */
    .query('entities', ($) => C.entitySearch.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))
    /**
     * Retrieval by **meaning**.
     *
     * A block rather than three spine nodes, and both halves of that
     * are the reply pipeline's argument unchanged. On the spine the
     * debug preview would stop at the `embed` Provider and show a
     * reader a list of query strings instead of a prompt — a correct
     * application of the rule and a useless preview. A block also
     * reads `history` and `cast` above, which is the whole reason this
     * is not a fourth chain inside somebody else's parallel block.
     *
     * ⚠ It ships **off** — `vector-search.maxEntries` defaults to 0 —
     * and an install with no embedding model is not a broken install:
     * `embed` yields no vectors under its `auto` setting, `search`
     * returns empty with the reason on the receipt, and the turn loses
     * a signal rather than failing.
     */
    .gather('semantic', { mode: 'parallel' }, (b) => b.chain('arm', (c) => c
    .task('queries', ($) => C.queryWindows.v1({
    messages: $.history.messages,
    cast: $.cast.cast,
    params: slot.params(),
}))
    .oracle('embed', ($) => C.embedText.v1({
    texts: $.semantic.arm.queries.current,
    params: slot.params(),
}))
    .query('search', ($) => C.vectorSearch.v1({
    scope: $.input.sessionScope,
    vectors: $.semantic.arm.embed.vectors,
    params: slot.params(),
}))))
    /**
     * Every mechanism's candidates, end to end.
     *
     * ⚠ Concatenation, **not** `merge-candidates`. The merge is
     * reciprocal-rank fusion and it stamps a `presetScore` on
     * everything it passes through, which `select` prefers over the
     * weighted signal sum — so fusing these would collapse every
     * entry's score to its position in its own list and make all nine
     * signal weights inert. That is exactly the regression the reply
     * pipeline's 1.17.0 removed.
     *
     * ⚠ **Order is the design.** `concat-candidates` keeps the first
     * occurrence of a `source:id` and merges a duplicate's *signals*
     * into the copy it keeps. The keyword lane is first, so an entry a
     * key already reached keeps its full keyword signal set and gains
     * whatever the later mechanisms contribute; the entity mechanism
     * only ever adds rows no key reached.
     */
    .task('pool', ($) => C.concatCandidates.v1({
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
    ],
}))
    /**
     * Retrieval by **description** — *"the captain"* reaching Captain
     * Vell, in a second vector space of one vector per name.
     *
     * ⚠ **It may only reorder. It may never admit.** `entity-link`
     * takes the concatenated list on an in-port and returns *that list*
     * with `signals.entityVector` attached to whatever linked, so there
     * is no id it can emit that some other mechanism did not already
     * produce. Invented proper nouns are where embeddings are least
     * reliable, and a confident wrong link would displace right lore
     * inside a fixed budget; constrained to reordering it costs a
     * position and a receipt line naming it.
     *
     * Ships **off** on the first node of the chain — `mention-spans`'
     * `maxMentions` is 0 — so nothing is read and nothing is embedded
     * until somebody raises it.
     */
    .gather('names', { mode: 'parallel' }, (b) => b.chain('arm', (c) => c
    .query('mentions', ($) => C.mentionSpans.v1({
    scope: $.input.sessionScope,
    params: slot.params(),
}))
    .oracle('embed', ($) => C.embedText.v1({
    texts: $.names.arm.mentions.texts,
    // One `enabled` switch for both embed nodes (R-7 P2): the
    // semantic mechanism's embed owns it, this one reads it.
    params: slot.params({ node: 'semantic.arm.embed' }),
}))
    .query('link', ($) => C.entityLink.v1({
    scope: $.input.sessionScope,
    candidates: $.pool.candidates,
    mentions: $.names.arm.mentions.mentions,
    vectors: $.names.arm.embed.vectors,
    params: slot.params(),
}))))
    /**
     * ⚠ **The enriched list first, the raw list behind it.**
     *
     * A fallback rather than a merge, exactly as in the reply pipeline:
     * when the name mechanism produced anything its copies carry
     * `signals.entityVector` and win; when it produced nothing — off, no
     * embedding model, an error the executor recovered as empty — the
     * second source is precisely what the ranker would have seen
     * without it. That is what makes "an unavailable mechanism
     * subtracts a signal and never removes a candidate" a property of
     * the wiring rather than of a binding's error handling.
     */
    .task('poolLinked', ($) => C.concatCandidates.v1({
    sources: [$.names.arm.link.main, $.pool.candidates],
}))
    .task('context', ($) => C.buildNarratorContext.v1({
    cast: $.cast.cast,
    prompts: slot.prompts(),
    variables: slot.variables(),
}))
    /**
     * How much room the context has, from the window itself.
     *
     * ⚠ Absent until 1.11.0, and the absence was not a missing nicety:
     * `rank` below takes a `budget` in-port and nothing supplied it, so
     * the ranker selected against zero tokens and excluded every
     * candidate it was handed. A narrator describing a place got none of
     * the lore about that place — the thing this spec's own header says
     * it deliberately keeps.
     *
     * `samplingOf("generate")` rather than its own slot, exactly as the
     * reply pipeline: a budget computed against one window and a prompt
     * sent against another is wrong in the direction that truncates,
     * silently, and sharing the reference makes the two impossible to
     * point apart.
     */
    .task('contextBudget', ($) => C.contextBudget.v1({
    sampling: slot.samplingOf('generate'),
    // The other half of the same pair, for the model's own
    // window (0114) — see `respond`.
    connection: slot.connectionOf('generate'),
    params: slot.params(),
}))
    // Every mechanism's output, not just the keyword scan's. Wiring
    // `rank` to a subset drops the rest silently — the prompt simply
    // has no lore from that mechanism in it and nothing anywhere says
    // so, which is how this pipeline came to render four retrieval
    // controls that reached nothing.
    .task('rank', ($) => C.rankHybrid.v1({
    candidates: $.poolLinked.candidates,
    budget: $.contextBudget.available,
    params: slot.params(),
}))
    .task('lines', ($) => C.processMessages.v1({
    messages: $.history.messages,
    cast: $.cast.cast,
    templateContext: $.context.templateContext,
    seedName: $.context.seedName,
}))
    .task('prompt', ($) => C.assemble.v2({
    candidates: $.rank.candidates,
    decisions: $.rank.decisions,
    // The ranker's per-band allocation, which `allocate` fell
    // back to `{}` for while nothing wired it — the receipt's
    // `sources`, not the prompt. See `respond` for the terms.
    groups: $.rank.groups,
    // The same number the ranker selected against, so the
    // allocation on the receipt describes the window this
    // prompt is going to. It read 0 while nothing supplied it.
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
}))
    .oracle('generate', ($) => C.generateText.v1({
    context: $.prompt.context,
    // ⚠ The two slots this node OWNS and never named. Both are
    // already read by reference from here — `contextBudget`'s
    // `samplingOf("generate")` and `prompt`'s
    // `connectionOf("generate")` above — so the pick sized and
    // wrapped the prompt while `refId(p.connection)` at the host
    // read `null` and the request went to the instance default.
    // See the note above `NARRATE_VERSION`.
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
    // No `prompts` here: `core:oracle/generate-text@1` declares
    // no such slot any more (culled 2026-09-16, R-12) — the
    // instructions travel inside `context`, from `prompt`.
}))
    /** The narration row, filled — see `placeholder`. */
    .outlet('save', ($) => C.updateMessage.v1({
    target: $.placeholder.messageId,
    text: $.generate.text,
    thinking: $.generate.thinking,
}))
    .build());
//# sourceMappingURL=narrate.js.map