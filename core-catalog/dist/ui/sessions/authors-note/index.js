/** The note a session reads before anybody wrote one — `AUTHORS_NOTE_FIELD`'s defaults. @experimental */
export const AUTHORS_NOTE_DEFAULTS = Object.freeze({
    text: '',
    depth: 0,
    interval: 1,
    role: 'system',
});
/** The three roles a note may be sent as, in order, with their English labels. @experimental */
export const AUTHORS_NOTE_ROLES = Object.freeze([
    { value: 'system', label: 'System' },
    { value: 'user', label: 'User' },
    { value: 'assistant', label: 'Assistant' },
]);
const wholeAtLeast = (v, floor, fallback) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(floor, Math.floor(n)) : fallback;
};
/**
 * Any stored value, read as a note: missing keys take the defaults, a depth
 * below 0 is 0, an interval below 1 is 1, an unknown role is `system`, and
 * numbers typed as text (a form's input) are numbers. Total over anything.
 * @experimental
 */
export function readAuthorsNote(value) {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const role = v.role === 'user' || v.role === 'assistant' || v.role === 'system' ? v.role : AUTHORS_NOTE_DEFAULTS.role;
    return {
        text: typeof v.text === 'string' ? v.text : AUTHORS_NOTE_DEFAULTS.text,
        depth: wholeAtLeast(v.depth, 0, AUTHORS_NOTE_DEFAULTS.depth),
        interval: wholeAtLeast(v.interval, 1, AUTHORS_NOTE_DEFAULTS.interval),
        role,
    };
}
/**
 * Does the draft differ from what is saved (STYLE-GUIDE §6.14: unsaved means
 * different, never "touched")? Both are read first, so `"4"` equals `4` and
 * changing a value and changing it back is clean.
 * @experimental
 */
export function authorsNoteDirty(draft, saved) {
    const a = readAuthorsNote(draft);
    const b = readAuthorsNote(saved);
    return a.text !== b.text || a.depth !== b.depth || a.interval !== b.interval || a.role !== b.role;
}
/**
 * The one line under the form: what the newest reply's prompt did with the
 * note, in the widget's words. Null when no reply was written with the note
 * in scope yet.
 * @experimental
 */
export function authorsNoteLastReplyLine(lastReply, t) {
    if (!lastReply)
        return null;
    if (lastReply.included)
        return lastReply.depth === 0
            ? t('Last reply: added right before the reply.')
            : t('Last reply: added {depth} messages before the reply.').replace('{depth}', String(lastReply.depth));
    if (lastReply.reason === 'interval')
        return t('Last reply: skipped — not one of the replies it repeats on.');
    return t('Last reply: nothing added — the note was empty.');
}
//# sourceMappingURL=index.js.map