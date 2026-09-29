/**
 * Core's side-character pipeline — a turn spoken by somebody who is not in the
 * cast (ruling 2026-09-07).
 *
 * ## Why the narrator split in two
 *
 * One spec was doing two jobs. "Narrate" meant *describe the world*, and the
 * shipped prompt says so in as many words — "you only narrate the environment,
 * not {{characterNames}}" — while the button's own modal offered "or any side
 * characters and encounters" as a use for it. So the one thing a person most
 * often wanted from the narrator, a shopkeeper answering back, was reachable
 * only by asking a pipeline configured to refuse it.
 *
 * They are two triggered types because the difference is *configuration*, which
 * is the same argument `narrate.ts` opens with about the reply pipeline: a
 * different system prompt, a different name on the line the model continues
 * from, a different context builder declaring a different surface. A flag would
 * have welded a world-narrator's prompt config to a side character's, and the
 * whole point of each is not to sound like the other.
 *
 * ## First-class presence, no turn slot
 *
 * **participant ≠ character.** A side character is a participant *for one turn*:
 * the prompt is written from their perspective, character lore bound to them
 * becomes readable (the visibility rule keys on the speaker, so a scope naming
 * them is the whole of it), and every retrieval mechanism can reach them. What
 * they are not is a **cast member** — nothing here writes a `session_characters`
 * row, and the free-form case has no character to write.
 *
 * ⚠ **Round-robin exclusion is not enforced here, and it must not be.** The
 * rotation is computed from stored messages by `getNextCharacterTurn`, which
 * drops every `isNarratorResponse` row *before* it matches a character id — so
 * a side-character turn is excluded by the row it writes, not by a rule this
 * document repeats. A second statement of the rule in the pipeline would be
 * free to disagree with the first.
 *
 * Core ships **no** automatic turn-taking for side characters, deliberately. A
 * custom genre may add a turn handler that makes them answer on their own —
 * that is a fine thing to build and it is explicitly not ours.
 *
 * ## Retrieval
 *
 * All five mechanisms, wired exactly as `respond` and `narrate` wire them:
 * keys, the names the scene said, meaning, the names the scene *described*, and
 * the structural signals that order what they find. Three of the five need
 * nothing installed; the two that read embeddings ship switched off, so a first
 * boot runs the zero-cost path.
 */
/** @experimental */
export declare const NARRATE_CHARACTER_SPEC_ID = "core:spec/narrate-character";
/** @internal */
export declare const NARRATE_CHARACTER_VERSION = "1.0.0";
/** @experimental */
export declare const narrateCharacterSpec: () => import("@serene-pub/sdk").SpecDocument;
//# sourceMappingURL=narrateCharacter.d.ts.map