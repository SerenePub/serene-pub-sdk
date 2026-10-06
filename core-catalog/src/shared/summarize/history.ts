/**
 * Summarize a history entry; the four summarize pipelines share
 * `summarizeSpec.ts`.
 */

import { summarizeSpec } from "./summarizeSpec.js"

/** @experimental */
export const SUMMARIZE_HISTORY_SPEC_ID = "core:spec/summarize-history"

/** @experimental */
export const summarizeHistorySpec = () =>
	summarizeSpec({ id: SUMMARIZE_HISTORY_SPEC_ID, loreType: "history" })
