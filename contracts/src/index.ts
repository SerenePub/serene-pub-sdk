/**
 * Sample core contracts — what /contracts would generate.
 *
 * Every entry is a descriptor plus a pinned constructor. Note that the LLM, TTS and
 * image-gen providers are structurally identical: `params` is declared per type, so
 * nothing anywhere switches on modality (17 §1).
 *
 * Split by node kind (2026-10-05): `inlets.ts`, `queries.ts`, `tasks.ts`,
 * `oracles.ts` and `outlets.ts`, each holding its kind's definitions and the
 * helpers only they use. Every export is re-exported here, so `C.<name>` is
 * unchanged.
 */
export * from './inlets.js'
export * from './queries.js'
export * from './tasks.js'
export * from './oracles.js'
export * from './outlets.js'
