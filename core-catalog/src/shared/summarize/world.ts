/**
 * Summarize world lore; the four summarize pipelines share `summarizeSpec.ts`.
 */

import { summarizeSpec } from "./summarizeSpec.js"

/** @experimental */
export const SUMMARIZE_WORLD_SPEC_ID = "core:spec/summarize-world"

/** @experimental */
export const summarizeWorldSpec = () =>
	summarizeSpec({ id: SUMMARIZE_WORLD_SPEC_ID, loreType: "world" })
