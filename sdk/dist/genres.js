/**
 * Session genres (24 §3) — first-class declared objects with their own ids.
 *
 * A genre is what kind of session something is: `core:genre/chat`. It owns
 * its id; the create pipeline is its **required member**, not its identity
 * (revises 23 §7). The genre object declares everything a surface asks about
 * for the life of a session — display name, family, standing shape — plus
 * its **event surface**: which session events exist for this genre and which
 * are required. Presets validate against that surface; dispatch keys on
 * (genre, event).
 *
 * Pipelines reference the genre object directly (`input(…, { genre: chat,
 * event: events.messageRespond })`) — a typed reference the compiler checks,
 * never a string retyped per spec. In the document it serializes to the id.
 */
import { assertMessageVerbFloors, } from './descriptors.js';
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
 * The core session events (24 §5), as **event ids** — `core:event/<name>@1`.
 *
 * Constants so the core vocabulary is typo-proof. Since R-4 (ruled 2026-09-15,
 * landed 2026-09-16) these ARE `CORE_EVENTS` entries (`events.ts`): one
 * registry, and a genre's event surface, a preset's `bindings` map and a spec's
 * inlet lock are all keyed by these ids. The bare names (`session-created`)
 * were the keys until the fold; a host migrates its stored keys once.
 */
export const sessionEvents = Object.freeze({
    /** The create slot — required; exactly one pipeline per genre declares it. */
    sessionCreated: 'core:event/session-created@1',
    /** The primary turn. A swipe is this pipeline re-run, not a new event. */
    messageRespond: 'core:event/message-respond@1',
    /** Arbitrary buttons/triggers — the existing functions surface (19 §3). */
    sessionAction: 'core:event/session-action@1',
    /** A character or persona joined; payload carries the kind. */
    memberAdded: 'core:event/member-added@1',
    /** A character or persona left; payload carries the kind. */
    memberRemoved: 'core:event/member-removed@1',
    /**
     * A form in a message was addressed to a participant the AI portrays
     * (R-15 *Forms*; U5d). Optional in every genre's surface: a genre that
     * binds nothing leaves such a form waiting, as it would for a person.
     */
    formAddressed: 'core:event/form-addressed@1',
});
/** An envoy's key: a lowercase kebab token. Dots are reserved for an action's namespace. */
export const ENVOY_KEY = /^[a-z][a-z0-9-]*$/;
/** An envoy's image: an `http(s)://` URL or a `data:image/…` URI — an `<img>` source, nothing else. */
export const ENVOY_IMAGE = /^(?:https?:\/\/\S+|data:image\/[a-z0-9.+-]+(?:;[^,]*)?,.+)$/i;
const ENVOY_SPEAKS = new Set(['in-turn', 'on-action']);
const localeMapFindings = (v, where, required) => {
    if (v === undefined)
        return required ? [`${where} is required — a locale map with 'en' (R-20)`] : [];
    if (v && typeof v === 'object' && typeof v.en === 'string')
        return [];
    return [`${where} is a locale map with a required 'en' (R-20)`];
};
/**
 * Every fault in one envoy declaration, as sentences (the teaching-error
 * pattern, 15 §1.3). Empty when it is sound. `owner` says which of the two
 * declaring places this is, because an action's envoy has one rule of its own:
 * it may only be `on-action`.
 */
export function envoyFindings(raw, at, owner = 'genre') {
    const out = [];
    if (!raw || typeof raw !== 'object')
        return [`${at}: an envoy is an object — got ${typeof raw}`];
    const e = raw;
    const where = `${at}[${typeof e.key === 'string' ? e.key : '?'}]`;
    if (typeof e.key !== 'string' || !ENVOY_KEY.test(e.key))
        out.push(`${where}: 'key' is required — a lowercase kebab token (${ENVOY_KEY.source}); ` +
            `an action's envoy is namespaced by the host, never by the key`);
    out.push(...localeMapFindings(e.name, `${where}.name`, true));
    out.push(...localeMapFindings(e.description, `${where}.description`, false));
    if (e.image !== undefined && (typeof e.image !== 'string' || !ENVOY_IMAGE.test(e.image)))
        out.push(`${where}: 'image' is an http(s):// URL or a data:image/… URI — an <img> source and nothing else`);
    if (e.prompts !== undefined) {
        if (!e.prompts || typeof e.prompts !== 'object')
            out.push(`${where}: 'prompts' is { systemPrompt?, postHistoryInstructions? }`);
        else
            for (const [k, v] of Object.entries(e.prompts))
                if (typeof v !== 'string')
                    out.push(`${where}: prompts.${k} is a string — the authored text`);
    }
    if (e.default !== undefined && typeof e.default !== 'boolean')
        out.push(`${where}: 'default' is a boolean`);
    if (e.speaks !== undefined) {
        if (!ENVOY_SPEAKS.has(e.speaks))
            out.push(`${where}: 'speaks' is 'in-turn' or 'on-action' (R-21 (6))`);
        else if (owner === 'action' && e.speaks !== 'on-action')
            out.push(`${where}: an action's envoy speaks 'on-action' only — it is the speaker the ` +
                `action's results post as, never a turn-taking candidate (R-21 (6))`);
    }
    return out;
}
/** The findings on a genre's whole list: each entry's, plus unique keys and at most one default. */
export function envoysFindings(raw, at = 'envoys') {
    if (raw === undefined)
        return [];
    if (!Array.isArray(raw))
        return [`${at}: a genre's envoys are an array`];
    const out = [];
    const keys = new Map();
    let defaults = 0;
    raw.forEach((e, i) => {
        out.push(...envoyFindings(e, at, 'genre'));
        const key = e?.key;
        if (typeof key === 'string')
            keys.set(key, (keys.get(key) ?? 0) + 1);
        if (e?.default === true)
            defaults++;
        void i;
    });
    for (const [key, n] of keys)
        if (n > 1)
            out.push(`${at}: the key '${key}' is declared ${n} times — an envoy's key is unique within its genre`);
    if (defaults > 1)
        out.push(`${at}: ${defaults} envoys are 'default: true' — at most one is seated with no choice; ` +
            `the rest are offered`);
    return out;
}
/** One envoy in its document form: `speaks` stated, nothing else added. */
export function normalizeEnvoy(raw, speaks) {
    return Object.freeze({ ...raw, speaks });
}
function assertEnvoys(envoys, genreId) {
    if (!envoys)
        return [];
    const findings = envoysFindings(envoys, `${genreId}.envoys`);
    if (findings.length)
        throw new Error(findings.join('\n'));
    return envoys.map((e) => normalizeEnvoy(e, e.speaks ?? 'in-turn'));
}
/**
 * Declare a genre. The id is stated in full (`core:genre/chat`) — the
 * context-bound toolkit `announce()` hands out derives it from the package
 * namespace instead.
 */
export function genre(id, props) {
    assertGenreId(id);
    // The floors (R-15): a genre that switches off stop, branch or edit is
    // refused here, at the declaration, on the same terms as an inlet's shape.
    assertMessageVerbFloors(props.shape, id);
    const events = { ...(props.events ?? {}) };
    // Every genre has the create slot, stated or not — stating it merely
    // confirms; omitting it must not produce a genre nothing can instantiate.
    events[sessionEvents.sessionCreated] = {
        ...(events[sessionEvents.sessionCreated] ?? {}),
        required: true,
    };
    // The envoys (R-18): refused here, at the declaration, on the same terms
    // as the floors — a duplicate key, two defaults or a name with no `en`
    // is an authoring mistake, not a row to degrade.
    const envoys = assertEnvoys(props.envoys, id);
    const decl = Object.freeze({
        id,
        name: props.name,
        family: props.family,
        description: props.description,
        shape: props.shape,
        events: Object.freeze(events),
        slots: props.slots ? Object.freeze([...props.slots]) : undefined,
        ...(envoys.length ? { envoys: Object.freeze(envoys) } : {}),
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
/**
 * The envoys a genre declares, by id — empty for a genre this build does not
 * declare, on the same "never guess" terms as `genreSlots`.
 */
export const genreEnvoys = (id) => registry.get(id)?.envoys ?? [];
/** One of a genre's envoys by key, or undefined. */
export const genreEnvoy = (g, key) => (typeof g === 'string' ? registry.get(g)?.envoys : g.envoys)?.find((e) => e.key === key);
/** A genre reference as it lands in documents: always the id. */
export const genreIdOf = (g) => {
    const id = typeof g === 'string' ? g : g.id;
    assertGenreId(id);
    return id;
};
/**
 * The configurable surface of one envoy, as a slot declaration (R-18 (2)).
 *
 * An envoy is not a node and has no registry row to carry a declaration —
 * so the SDK declares its slot from the two facts the genre does carry, its
 * `prompts` defaults and its name, the way `clauseSettingsSlotFor` declares
 * a gather clause's mode. A host renders it through the same reader a node's
 * slot goes through, at the address `envoy:<key>` (`envoyConfigKey`), with
 * the genre's text as the author default: an admin's edit is a deviation
 * above it, and clearing the edit is the genre's text again.
 *
 * `parameters`, not `prompts`, and the reason is what each kind means to a
 * panel: a `prompts` slot is a **reference** to a swappable prompt row, and
 * an envoy's instructions are not a row anybody swaps — they are the genre's
 * words, tuned in place. The slot is still *named* `prompts`, because that
 * is the name the reading node's own slot has and the name `slot.prompts({
 * envoy })` resolves at; the fields are that node's fields.
 */
export function envoyPromptsSlotFor(envoy) {
    return {
        kind: 'parameters',
        facet: 'prompts',
        quick: true,
        description: {
            en: 'The written instructions this envoy speaks under. The genre ships them; edit them here to change how it answers.',
        },
        schema: {
            systemPrompt: {
                type: 'text',
                quick: true,
                default: envoy.prompts?.systemPrompt ?? '',
                label: { en: 'System prompt' },
                description: {
                    en: "Who the envoy is and how it should answer — the reply's instructions, in the envoy's own words.",
                },
            },
            postHistoryInstructions: {
                type: 'text',
                default: envoy.prompts?.postHistoryInstructions ?? '',
                label: { en: 'Post-history instructions' },
                description: {
                    en: 'Instructions placed after the conversation, just before the envoy answers. Empty unless the genre or you put something here.',
                },
            },
        },
    };
}
//# sourceMappingURL=genres.js.map