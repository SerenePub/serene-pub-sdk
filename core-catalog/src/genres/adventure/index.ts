/**
 * The Adventure genre's pipelines, one per file: its two required pipelines
 * (`create.ts`, `respond.ts`), its actions, and its answer form and turn order.
 */
export * from './create.js'
export * from './respond.js'

/**
 * The Adventure genre's actions — the small pipelines a player fires from the
 * composer (DESIGN-adventure-genre.md, "Actions").
 *
 * `session-action` is an OPEN event: any number of pipelines may serve it, and
 * which ones a session offers is the preset's `actions.include`. So these are
 * the E-series "events are all optional" made concrete — each is two or three
 * nodes, each contributes its own button, and removing one from a preset takes
 * the button with it and breaks nothing.
 *
 * ## Two shapes, three specs
 *
 * `adventure-look` writes a message and changes nothing. The other two change
 * state and write no message at all, which is worth stating plainly because it
 * looks like a bug the first time you see a run with no reply: pressing Rest
 * produces a ledger under the last message, not a new one. A pipeline may
 * write as often as it likes and is not obliged to write at all (F7).
 *
 * ## Why `adventure-inventory` is not here
 *
 * The design lists a fourth action: a prose inventory check with no model call.
 * Two things say it should not be a pipeline. What somebody carries is their
 * `inventory` stat (phase 3b), already in the state block every prompt reads,
 * so a pipeline would only restate it. And the question it answers was the one
 * the **Inventory widget** answered continuously, in the session, with the item
 * prose on hover. A button that writes a worse copy of a panel already on
 * screen is a feature competing with itself. (R79 removed that widget for now;
 * the first reason still stands on its own, so the action stays out.)
 */
export * from './look.js'
export * from './rest.js'
export * from './advanceTime.js'
export * from './ask.js'
export * from './answer.js'

export * from './answerForm.js'
export * from './turnOrder.js'
