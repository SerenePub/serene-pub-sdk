/**
 * Summarize a scene; the four summarize pipelines share `summarizeSpec.ts`.
 */

import { summarizeSpec } from "./summarizeSpec.js"

/** @experimental */
export const SUMMARIZE_SCENE_SPEC_ID = "core:spec/summarize-scene"

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
export const summarizeSceneSpec = () =>
	summarizeSpec({
		id: SUMMARIZE_SCENE_SPEC_ID,
		loreType: "scene"
	})
