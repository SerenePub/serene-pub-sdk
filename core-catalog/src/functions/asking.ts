/**
 * 🚧 **Asking** — the rules put a question to people and wait for the answer
 * (lane A2, 2026-10-23). Header-only until Sprint B's B1 builds the asking
 * functions and the gate: the model reads that the question is the table's to
 * answer, and nothing waits yet.
 */
import { defineFunction } from "@serene-pub/sdk"

/**
 * 🚧 **Ask the table and wait** — some choices are put to the people at the
 * table (a vote, a player's call), and play waits on their answer.
 * Header-only (B1 adds its body and the gate).
 * @experimental
 */
export const askAndWaitFunction = defineFunction("core:function/ask-and-wait@1", {
	name: { en: "Ask the table and wait" },
	meaning: { en: "Some choices are put to the people at the table, and play waits for their answer." },
	kind: "asking",
	prose: "Some choices belong to the people at the table: ask them plainly, and do not decide for them."
})

/** 🚧 Core's asking functions. @experimental */
export const ASKING_FUNCTIONS = Object.freeze([askAndWaitFunction])
