/**
 * 🚧 The Lair genre's pipelines, one per file (rewritten 2026-10-21,
 * PROPOSAL-lair-rewrite): its create pipeline and reply (`create.ts`,
 * `reply.ts`), the welcome of a seated guest, its routines — the keeper, the
 * Castellan's scratchpad, filing the current room — its actions, and its
 * answer form, turn order and scene summary. The names and declared shapes
 * they share are `names.ts`; the script steps, `scripts.ts`.
 *
 * ## The actions — what the GM does between turns
 *
 * `session-action` is an OPEN event, so each is its own small pipeline
 * contributing its own button; a preset that drops one takes the button with
 * it and breaks nothing. Narrate and Pick who speaks are core's turn controls,
 * answered by the reply.
 *
 *  - **Build room**, **Answer the door** and **File as a room** write a
 *    *lorebook entry* — `effects: 'world'`, the owner's, never named by a
 *    block except the knock's owner-addressed one. Their drafts are one JSON
 *    answer each: the body, the ways out, and the place entry type's own
 *    fields (`jsonSchemaOf`), the ways to rooms the book holds linked in the
 *    entry's own commit.
 *  - **Whisper** and **Nudge** write *state* and no message: a standing note
 *    for the delvers the GM picks (heard by its holder alone), and one for the
 *    Castellan's planner. Neither calls a model.
 *  - **Trigger trap** and **Reveal** write a *message* and change nothing:
 *    the Castellan's turn with a fixed instruction.
 *  - **Roll** and the **roll answer** — the dice are the ruleset's, the call
 *    the GM's, the voice the Oracle's: the GM's own call for a roll, and a roll
 *    form's answer, rolled (as *Answer the door* is the knock's).
 *
 * ## Why the two steering actions write slots rather than messages
 *
 * A directive that produces no message still has to reach the next turn, and
 * a session has exactly three places a fact can live: the transcript, the
 * lorebook and the state. A nudge is not a line anybody said and not a fact
 * about the world, so it is state — `core:slot/direction@1` for the
 * Castellan, `core:slot/whisper@1` per delver — which the planner and the
 * voices already read.
 */
export * from './names.js'
export * from './scripts.js'
export * from './create.js'
export * from './reply.js'
export * from './welcome.js'

export * from './keeper.js'
export * from './scratchpad.js'
export * from './fileCurrentRoom.js'

export * from './buildRoom.js'
export * from './roomAnswer.js'
export * from './fileRoom.js'
export * from './nudge.js'
export * from './whisper.js'
export * from './trap.js'
export * from './reveal.js'
export * from './roll.js'
export * from './rollAnswer.js'

export * from './answerForm.js'
export * from './turnOrder.js'
export * from './summarizeScene.js'
