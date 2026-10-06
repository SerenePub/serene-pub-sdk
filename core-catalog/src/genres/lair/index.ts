/**
 * The Lair genre's pipelines, one per file: its two required pipelines
 * (`create.ts`, `respond.ts`), its actions, and its answer form and turn order.
 */
export * from './create.js'
export * from './respond.js'

/**
 * The **Lair** genre's actions — what the dungeon's master does between turns
 * (plans/genres-and-showcase-plugins §3, "Room building").
 *
 * `session-action` is an OPEN event, so each of these is its own small
 * pipeline contributing its own button, and removing one from a preset takes
 * the button with it and breaks nothing. Three shapes:
 *
 *  - **Build room**, **Answer the door** and **File as a room** write a
 *    *lorebook entry*. They are the three actions here that reach outside the
 *    story, so they are the three declared `effects: 'world'` — owner-only,
 *    and never named by a block. *File as a room* lives on a message's ⋮ (the
 *    row it files is its subject, R11); the other two live in the composer
 *    and are nameable only by a message block **addressed to the owner**
 *    (R-15 *The line*; L1, ruled 2026-09-17). The knock's block is exactly
 *    that block, which is what makes its options real writes rather than
 *    narration.
 *  - **Whisper** and **Nudge** write *state* and no message: a standing
 *    instruction for the delvers the master picks (R10), and one for the
 *    Castellan. Neither calls a model. Pressing Nudge
 *    produces nothing visible in the log, which looks like a bug the first
 *    time you see it and is the same thing Adventure's Rest does.
 *  - **Trigger trap** and **Reveal** write a *message* and change nothing:
 *    the Castellan's turns with a fixed instruction, Adventure's Look with a
 *    different sentence in its prompt — one streamed row under the
 *    Castellan's name (lair pass B17, owner D7a; R8).
 *
 * ## Why the two steering actions write slots rather than messages
 *
 * A directive that produces no message still has to reach the next turn, and a
 * session has exactly three places a fact can live: the transcript, the
 * lorebook and the state. A nudge is not a line anybody said and not a fact
 * about the world, so it is state — `core:slot/direction@1` for the Castellan,
 * `core:slot/whisper@1` per delver — and the planner and the voices already
 * take `state` on a port, which makes the note a control something *reads*
 * rather than a second store nothing walks. (The planner reads the direction;
 * a whisper is heard by its holder's voice alone — earshot, R1.)
 *
 * ⚠ **The channel route was the other candidate and does not work.** A hidden
 * message on a `whispers` channel is one node to write and unreadable
 * afterwards: `core:query/session-history@1` reads exactly one channel, and no
 * core node merges two transcripts into the one `messages` port `assemble`
 * takes. It would have been a button wired to nothing.
 */
export * from './buildRoom.js'
export * from './roomAnswer.js'
export * from './fileRoom.js'
export * from './nudge.js'
export * from './whisper.js'
export * from './trap.js'
export * from './reveal.js'

export * from './answerForm.js'
export * from './turnOrder.js'
