/**
 * `@serene-pub/core-catalog/authors-note` — the plain-TypeScript half of
 * core's Author's note widget (2026-10-02, AN1): reading a stored note into
 * the shape the form edits, whether a draft differs from what is saved, and
 * the line that says what the newest reply did with the note. The widget's
 * Svelte source lives in `components/sessions/authors-note/` and ships built
 * (`dist/components/authors-note.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget's requests (`authors-note`,
 * `set-authors-note`).
 */
import type { AuthorsNoteV1, AuthorsNoteValueV1 } from '@serene-pub/sdk';
/** A translation: English source in, the viewer's words out. @experimental */
export type AuthorsNoteT = (source: string) => string;
/** The note a session reads before anybody wrote one — `AUTHORS_NOTE_FIELD`'s defaults. @experimental */
export declare const AUTHORS_NOTE_DEFAULTS: Readonly<AuthorsNoteValueV1>;
/** The three roles a note may be sent as, in order, with their English labels. @experimental */
export declare const AUTHORS_NOTE_ROLES: ReadonlyArray<{
    value: AuthorsNoteValueV1['role'];
    label: string;
}>;
/**
 * Any stored value, read as a note: missing keys take the defaults, a depth
 * below 0 is 0, an interval below 1 is 1, an unknown role is `system`, and
 * numbers typed as text (a form's input) are numbers. Total over anything.
 * @experimental
 */
export declare function readAuthorsNote(value: unknown): AuthorsNoteValueV1;
/**
 * Does the draft differ from what is saved (STYLE-GUIDE §6.14: unsaved means
 * different, never "touched")? Both are read first, so `"4"` equals `4` and
 * changing a value and changing it back is clean.
 * @experimental
 */
export declare function authorsNoteDirty(draft: unknown, saved: unknown): boolean;
/**
 * The one line under the form: what the newest reply's prompt did with the
 * note, in the widget's words. Null when no reply was written with the note
 * in scope yet.
 * @experimental
 */
export declare function authorsNoteLastReplyLine(lastReply: AuthorsNoteV1['lastReply'], t: AuthorsNoteT): string | null;
//# sourceMappingURL=index.d.ts.map