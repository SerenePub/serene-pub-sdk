/**
 * The four summarize pipelines: world lore, character lore, scene, history entry.
 *
 * ## Why four specs and not one with a `loreType` parameter
 *
 * They are four *namespaces*. Each has its own prompts, its own connection and
 * sampling choices per step, and its own configs a user swaps between — which is
 * exactly what `world_summarize_configs`, `character_summarize_configs` and
 * `scene_summarize_configs` already are. One spec with a discriminator would put
 * that difference in a condition somebody has to find, and would give all four a
 * single shared prompt set, which is the thing the three tables exist to avoid.
 *
 * History entry summarization gets the fourth. Today it is a `loreType` the
 * summarizer already supports (`"world" | "history" | "character" | "scene"`)
 * that falls through to the **scene** config in `sockets/summarize.ts` — so a
 * user tuning scene summaries silently retunes history entries. That is a defect
 * this split fixes rather than a feature it adds.
 *
 * ## The two phases, and why the first is a `map`
 *
 * Messages are cut into token-sized batches and each is drafted *without sight
 * of any other*; the ordered drafts are then merged into one narrative. Drafting
 * in isolation is what makes a long session summarizable at all — the model never
 * holds more than one batch — and the batches genuinely do not depend on each
 * other, so `map` states that and lets the connection's own queue decide the
 * ordering. A loop would impose a sequence the work does not have.
 */
import { compile, spec, slot } from "@serene-pub/sdk";
import * as C from "@serene-pub/contracts";
/** @experimental */
export const SUMMARIZE_WORLD_SPEC_ID = "core:spec/summarize-world";
/** @experimental */
export const SUMMARIZE_CHARACTER_SPEC_ID = "core:spec/summarize-character";
/** @experimental */
export const SUMMARIZE_SCENE_SPEC_ID = "core:spec/summarize-scene";
/** @experimental */
export const SUMMARIZE_HISTORY_SPEC_ID = "core:spec/summarize-history";
// 1.1.0: the request travels to the drafting, synthesis and cast steps, so a
// topic focuses every prompt and the known-cast list reaches extraction. A
// published version is immutable, so the wiring change is a new version and
// 1.0.0 stays for anything that resolved against it.
/** @internal */
export const SUMMARIZE_VERSION = "1.3.0";
/**
 * The ceiling on batches for one run.
 *
 * Mandatory — F9 makes repetition without a bound inexpressible, and the
 * database enforces it too (`pipeline_clauses_bounded_check`). 512 is chosen to
 * be far above any real session rather than tuned: the batch *size* is the knob a
 * user turns, and this is the guard that stops a runaway from becoming a bill.
 */
const MAX_BATCHES = 512;
/**
 * The drafting Provider's node key, qualified.
 *
 * A node declared inside a block is keyed `<block>.<chain>.<key>`, so the
 * `draft` step of the `drafting` map is `drafting.item.draft`. Named here
 * because the batching Task references that node's *sampling slot* and is
 * declared before it — a forward reference the document builder validates at
 * publish, so a typo is a build failure rather than a silent miss.
 */
const DRAFT_NODE = "drafting.item.draft";
/**
 * One summarize pipeline.
 *
 * The `extractsCast` arm is the only structural difference between the four, and
 * it is a whole extra Provider with its own prompt, connection and sampling —
 * which is why it is a branch here rather than a slot on a shared node.
 */
const summarizeSpec = ({ id, loreType, extractsCast }) => compile((() => {
    const base = spec(id, {
        version: SUMMARIZE_VERSION,
        /** Catalogue claims (23 §2): person-invoked, any mode. */
        taxonomy: { role: "action" }
    })
        // Manually triggered: a person asks for a summary. ACTION events
        // carry no write targets, so this drops out of the cycle check by
        // construction rather than by exception (13 §7g).
        .inlet("input", C.summarizeRequest.v1())
        .query("transcript", ($) => C.summarizeSource.v1({
        scope: $.input.scope,
        request: $.input.request
    }))
        // 🚧 The files those messages show (attachments follow-ups,
        // owner ruling 2026-10-03): the same read `respond` makes. A
        // summary is drafted from text, so `batches` names each file
        // after its message's text — `[image: cat.png — a grey cat]` —
        // and counts the names in its cut. A message that is only a
        // picture is summarized as that picture's name, not as nothing.
        .query("attachments", ($) => C.historyAttachments.v1({
        messages: $.transcript.messages,
        params: slot.params()
    }))
        .task("batches", ($) => C.batchMessages.v1({
        messages: $.transcript.messages,
        attachments: $.attachments.attachments,
        params: slot.params(),
        // The drafting step's own sampling, by reference rather
        // than as a second picker. The cut has to be clamped to
        // the window the batch is *sent* against, and two
        // separately-chosen configs would let those diverge —
        // which on this path overflows the window silently,
        // because a batch prompt is injected whole and nothing
        // downstream truncates it. Shared, so the panel offers
        // one Sampling control for the pair (a slot wired with
        // `ofNode` is the owner's to configure, 13 §12 finding i).
        sampling: slot.samplingOf(DRAFT_NODE)
    }))
        .each("drafting", { over: ($) => $.batches.batches, max: MAX_BATCHES }, (m) => m.oracle("draft", ($) => C.summarizeBatch.v1({
        // The one batch this iteration drafts. Without it
        // the node has no input and every draft is written
        // against nothing — which produces plausible
        // summaries of a conversation that did not happen.
        batch: $.drafting.item,
        // The person's ask — the topic line, most
        // visibly. Wired to every drafting iteration
        // because the focus has to hold *per batch*,
        // not arrive at synthesis after the drafts
        // already wandered.
        request: $.input.request,
        loreType,
        connection: slot.connection(),
        sampling: slot.sampling(),
        prompts: slot.prompts()
    }), {
        expose: {
            label: 'Drafting',
            purpose: 'Summarises the text a batch at a time, one draft per batch.',
        },
    }))
        .oracle("synth", ($) => C.summarizeSynth.v1({
        drafts: $.drafting.main,
        request: $.input.request,
        loreType,
        connection: slot.connection(),
        sampling: slot.sampling(),
        prompts: slot.prompts()
    }), {
        expose: {
            label: 'Combining',
            purpose: 'Merges the drafts into one summary, the text of the entry.',
        },
    })
        .oracle("naming", ($) => C.nameEntry.v1({
        content: $.synth.content,
        loreType,
        connection: slot.connection(),
        sampling: slot.sampling(),
        prompts: slot.prompts()
    }), {
        expose: {
            label: 'Naming',
            purpose: 'Gives the summary its title, the name the entry is filed under.',
        },
    });
    const withCast = extractsCast
        ? base.oracle("cast", ($) => C.extractCast.v1({
            content: $.synth.content,
            // The known-cast list ([id: N] entries), so the
            // extraction prompt references real ids instead of
            // inventing castIds the resolve step must drop.
            request: $.input.request,
            connection: slot.connection(),
            sampling: slot.sampling(),
            prompts: slot.prompts()
        }))
        : base;
    return withCast
        .outlet("save", ($) => C.createLoreEntry.v1({
        name: $.naming.name,
        content: $.synth.content,
        // Which KIND of entry this summarizer files (L3): the
        // four namespaces exist so the press decides, and the
        // slot is how that decision reaches the row instead of
        // rendering a control nothing reads.
        params: slot.params()
    }))
        .build();
})());
/** @experimental */
export const summarizeWorldSpec = () => summarizeSpec({ id: SUMMARIZE_WORLD_SPEC_ID, loreType: "world" });
/** @experimental */
export const summarizeCharacterSpec = () => summarizeSpec({ id: SUMMARIZE_CHARACTER_SPEC_ID, loreType: "character" });
/**
 * ⚠ **The cast extraction is ON ICE, not deleted** (plan §2, ruled 2026-09-08).
 *
 * `extractsCast` is deliberately absent rather than removed: the branch above,
 * `core:oracle/extract-cast@1` and its shipped prompt all stay exactly where
 * they are, so reviving the step is restoring this one property.
 *
 * Why it is off. The measured replacement for the *participant* half — the
 * roster unioned with speech-gated textual extraction — scored 100% precision
 * at 88.5% recall from the sender side and 96.2% recall from the roster side,
 * with **zero fabricated people in any configuration**, over 40,000 turns in
 * ~661 ms and no model at all. Its failure profile is omission, categorically
 * unlike the 24% fabrication that got the acts layer rejected. Until that
 * pre-fill has been used in anger the LLM step is disabled rather than dropped.
 *
 * The *mentioned* half is not coming back at all in this shape: it is derived
 * from `message_annotations` now (plan §1) — exactly (scene text × vocabulary),
 * invalidated by the freshness triple — rather than asked of a model and stored.
 *
 * Participants keep coming from where they always did on this path: every
 * distinct sender in the scene's span is made a participant by
 * `sockets/scenes.ts` and `sockets/summarize.ts` regardless of what any
 * extraction said, so turning this off narrows the proposal, it does not empty
 * it. The graph build keeps its own Pass 1 extraction for scenes that have no
 * stored cast at all.
 *
 * ⚠ Editing this document does not reach a database that has already seeded —
 * publishing is idempotent by `(slug, semver)` — so this ships with a migration
 * deleting the `pipeline_spec_versions` row, precedent `0095`/`0100`.
 * @experimental
 */
export const summarizeSceneSpec = () => summarizeSpec({
    id: SUMMARIZE_SCENE_SPEC_ID,
    loreType: "scene"
});
/** @experimental */
export const summarizeHistorySpec = () => summarizeSpec({ id: SUMMARIZE_HISTORY_SPEC_ID, loreType: "history" });
//# sourceMappingURL=summarize.js.map