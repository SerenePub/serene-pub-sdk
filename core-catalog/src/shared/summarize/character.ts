/**
 * Summarize character lore; the four summarize pipelines share
 * `summarizeSpec.ts`.
 */

import { summarizeSpec } from "./summarizeSpec.js"

/** @experimental */
export const SUMMARIZE_CHARACTER_SPEC_ID = "core:spec/summarize-character"

/** @experimental */
export const summarizeCharacterSpec = () =>
	summarizeSpec({ id: SUMMARIZE_CHARACTER_SPEC_ID, loreType: "character" })
