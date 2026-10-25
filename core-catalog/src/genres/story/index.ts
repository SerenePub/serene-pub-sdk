/**
 * The Story genre's pipelines, one per file: its create pipeline and reply,
 * the narrator's two halves, image generation, and its answer form and turn
 * order. Story's one widget of its own, the Author's note, has its typed
 * section under `ui/` (`@serene-pub/core-catalog/authors-note`), never
 * re-exported here.
 */
export * from './create.js'
export * from './respond.js'
export * from './narrate.js'
export * from './narrateCharacter.js'
export * from './generateImage.js'
export * from './answerForm.js'
export * from './turnOrder.js'
export * from './summarizeScene.js'
export * from './illustrateScene.js'
// 🚧 Time passes… (live scenes §6): the graph is `shared/timePasses.ts`.
export * from './advanceTime.js'

/**
 * The actions Story took over from Adventure (2026-10-19): Look, Rest, Ask
 * and its Answer — each a small pipeline a player fires from the composer,
 * each contributing its own button; the genre's defaults register each one
 * (`../defaults.ts`). Adventure's own reply (planner, voices, keeper) and its
 * Time passes were retired: Story's reply is Chat's one-call reply, and the
 * world keeps itself by routines (`reckoning.ts`, `sweep.ts`, the routine
 * half of `illustrateScene.ts`; their branches in `reckon.ts`).
 */
export * from './look.js'
export * from './rest.js'
// 🚧 GM 2026-10-23 (G1 ★5): the routine after the rules' Rest — the story clock moves by it.
export * from './afterRest.js'
export * from './ask.js'
export * from './answer.js'
export * from './reckon.js'
// 🚧 The routines (PLAN-layering §4, 2026-10-20).
export * from './reckoning.js'
export * from './sweep.js'
