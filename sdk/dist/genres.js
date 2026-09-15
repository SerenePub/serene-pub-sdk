import { refuseUnlessIdentical } from './hash.js';
/** `owner:genre/name` — lowercase, digits, hyphens, dots in the owner. */
const GENRE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:genre\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function assertGenreId(id) {
    if (!GENRE_ID.test(id))
        throw new Error(`'${id}' is not a valid genre id. Use 'owner:genre/name' — 'core:genre/chat', ` +
            `'acme.rp:genre/mystery'. The id is an address sessions hold for their ` +
            `lifetime; the display name lives in the declaration.`);
}
/**
 * The core session events (24 §5). Constants so the core vocabulary is
 * typo-proof; custom events are open, namespaced under the declaring package
 * by the context-bound toolkit.
 */
export const sessionEvents = Object.freeze({
    /** The create slot — required; exactly one pipeline per genre declares it. */
    sessionCreated: 'session-created',
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    messageRespond: 'message-respond',
    /** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
    sessionAction: 'session-action',
    /** A character or persona joined; payload carries the kind. */
    memberAdded: 'member-added',
    /** A character or persona left; payload carries the kind. */
    memberRemoved: 'member-removed',
});
/**
 * Declare a genre. The id is stated in full (`core:genre/chat`) — the
 * context-bound toolkit `announce()` hands out derives it from the package
 * namespace instead.
 */
export function genre(id, props) {
    assertGenreId(id);
    const events = { ...(props.events ?? {}) };
    // Every genre has the create slot, stated or not — stating it merely
    // confirms; omitting it must not produce a genre nothing can instantiate.
    events[sessionEvents.sessionCreated] = {
        ...(events[sessionEvents.sessionCreated] ?? {}),
        required: true,
    };
    const decl = Object.freeze({
        id,
        name: props.name,
        family: props.family,
        description: props.description,
        shape: props.shape,
        events: Object.freeze(events),
        slots: props.slots ? Object.freeze([...props.slots]) : undefined,
    });
    const existing = registry.get(id);
    if (existing)
        refuseUnlessIdentical(existing, decl, `duplicate genre id: ${id}`, GENRE_DISPLAY_KEYS);
    registry.set(id, decl);
    return decl;
}
/**
 * Declared genres, by id.
 *
 * ⚠ **Registered, not merely returned**, and the reason is `slots`. A genre
 * carries the attribute slots it brings, and the only party that can answer
 * "does THIS session have health?" is the genre the session was created under —
 * the declarations registry is global, so a reader that walked it would put a
 * health bar on every chat session on the instance, which is the one thing the
 * stats design says a newcomer must never see. A session holds a genre id;
 * this is what turns that id back into the list.
 *
 * Stored as a fact about the running code, like every other registry here: an
 * identical re-declaration is a no-op so a dev-server reload does not throw,
 * and a *different* declaration under a claimed id throws with both hashes
 * named.
 */
const registry = new Map();
/** Display text stripped from the comparison — see `SLOT_DISPLAY_KEYS`. */
const GENRE_DISPLAY_KEYS = { display: ['name', 'description'] };
export const getGenre = (id) => registry.get(id);
export const genres = () => [...registry.values()];
export function _clearGenres() {
    registry.clear();
}
/**
 * The attribute slots a session of this genre carries.
 *
 * An id this build does not declare answers with an empty list rather than
 * with every slot in the registry: an unknown genre is a genre whose vocabulary
 * this install cannot state, and guessing it is how a stat appears where the
 * author never put one. Values already stored against such a session are
 * untouched — they are read as opaque data, which is the standing "never
 * refuse, fall back and say so" rule for a stale binding.
 */
export const genreSlots = (id) => registry.get(id)?.slots ?? [];
/** A genre reference as it lands in documents: always the id. */
export const genreIdOf = (g) => {
    const id = typeof g === 'string' ? g : g.id;
    assertGenreId(id);
    return id;
};
//# sourceMappingURL=genres.js.map