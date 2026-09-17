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
export declare const SUMMARIZE_WORLD_SPEC_ID = "core:spec/summarize-world";
export declare const SUMMARIZE_CHARACTER_SPEC_ID = "core:spec/summarize-character";
export declare const SUMMARIZE_SCENE_SPEC_ID = "core:spec/summarize-scene";
export declare const SUMMARIZE_HISTORY_SPEC_ID = "core:spec/summarize-history";
export declare const SUMMARIZE_VERSION = "1.3.0";
export declare const summarizeWorldSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const summarizeCharacterSpec: () => import("@serene-pub/sdk").SpecDocument;
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
 */
export declare const summarizeSceneSpec: () => import("@serene-pub/sdk").SpecDocument;
export declare const summarizeHistorySpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=summarize.d.ts.map