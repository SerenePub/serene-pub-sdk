/**
 * Participant references — who an audience names, and who is speaking
 * (plans/29 R-15 *audience*, R-18 (3), R-21 (4); ruled 2026-09-15, built
 * 2026-09-16 as U5a).
 *
 * One grammar answers two questions that used to be answered by two
 * vocabularies: an action's **audience** (who may *see* it, who may *act* on
 * it) and an inlet's **speaker** (whose turn this is). Both are lists or
 * values of this string form, so nothing downstream branches on which kind
 * of participant it received — a library character and a genre's envoy are
 * addressed the same way and resolved by the same resolver.
 *
 * ## The grammar
 *
 * | Reference           | Means                                                                                                    |
 * | ------------------- | -------------------------------------------------------------------------------------------------------- |
 * | `owner`             | The session's owner.                                                                                     |
 * | `admin`             | Any administrator acting in the session.                                                                 |
 * | `participant`       | Any member of the session — owner or guest.                                                              |
 * | `user:<id>`         | One person, by user id.                                                                                  |
 * | `character:<id>`    | One library character, by row id — a cast member, or a member's own persona.                             |
 * | `envoy:<slug>`      | A speaker the genre (or a contributed action) brings with it — `envoy:mascot`, `envoy:chariot.dice-tray.master`. |
 * | `item`              | The **per-message ownership rule**: whoever the message belongs to, decided at the venue, never resolvable ahead of a message. |
 * | `run-owner`         | The person who started the run.                                                                          |
 *
 * `character:` and `envoy:` are the two forms a **speaker** takes (R-18 (3)):
 * a character id for somebody in the library, an envoy slug for somebody who
 * exists nowhere but the genre. The slug is namespaced like a slash name when
 * an action contributes it (`<plugin>.<key>`), so it cannot collide with a
 * genre's.
 *
 * ## Resolution
 *
 * A reference is a name; **who portrays it this turn** — a person, the AI, or
 * nobody — is the host's answer, resolved once at run start and pinned on
 * the receipt as `portrayals` (R-21 (4)), like config. The SDK declares the
 * question's shape (`Portrayal`) and never answers it: nodes stay blind to
 * it, and a definition that needs the answer declares an in-port.
 *
 * *Portrayal*, not *voice*: a **voice** is one cast member's stage inside an
 * adventure turn (`.each('voices')`), and a connection's `voices` are TTS —
 * the resolver's answer is a third thing and gets its own word (ruled
 * 2026-09-16).
 *
 * ## What this is not
 *
 * Not a *cast* row (a membership), not a *scope* (§6 config layering), and
 * not *availability* (the genre's `messageVerbs`). A reference says *who*;
 * the venue says *where*; the resolver says *whether they are here*.
 */
/** The role-shaped references — no id, resolved against the session and the run. */
export const PARTICIPANT_ROLES = ['owner', 'admin', 'participant', 'item', 'run-owner'];
// An id: anything but whitespace and the separator. The host narrows it.
const ID = /^[^\s:]+$/;
// A slug, optionally namespaced by dots (`<plugin>.<key>` for an action's envoy).
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const roles = new Set(PARTICIPANT_ROLES);
/**
 * Take a reference apart. Throws on anything that is not one, with the
 * sentence a declaration error should carry — an audience naming `user:` with
 * no id, or `character:Tom`, is an authoring mistake, not a read to degrade.
 */
export function parseParticipantRef(raw) {
    if (typeof raw !== 'string')
        throw new Error(`a participant reference is a string — got ${raw === null ? 'null' : typeof raw}`);
    const text = raw.trim();
    if (roles.has(text))
        return { kind: text };
    const cut = text.indexOf(':');
    if (cut === -1)
        throw new Error(`'${raw}' is not a participant reference — expected one of ${PARTICIPANT_ROLES.join(', ')}, ` +
            `or user:<id>, character:<id>, envoy:<slug>`);
    const kind = text.slice(0, cut);
    const rest = text.slice(cut + 1);
    switch (kind) {
        case 'user':
        case 'character':
            if (!ID.test(rest))
                throw new Error(`'${raw}' names a ${kind} with no readable id — a ${kind} reference is '${kind}:<id>'`);
            return { kind, id: rest };
        case 'envoy':
            if (!SLUG.test(rest))
                throw new Error(`'${raw}' names an envoy with no readable slug — an envoy reference is 'envoy:<slug>', ` +
                    `the slug a letter or digit followed by letters, digits, '.', '_' or '-'`);
            return { kind, slug: rest };
        default:
            throw new Error(`'${raw}' is not a participant reference — '${kind}:' is not a kind (user, character, envoy)`);
    }
}
/** The one spelling a parsed reference has. `parse(format(x))` is `x`. */
export function formatParticipantRef(parsed) {
    switch (parsed.kind) {
        case 'user':
            return `user:${parsed.id}`;
        case 'character':
            return `character:${parsed.id}`;
        case 'envoy':
            return `envoy:${parsed.slug}`;
        default:
            return parsed.kind;
    }
}
/** Is this a well-formed participant reference? Never throws. */
export function isParticipantRef(raw) {
    try {
        parseParticipantRef(raw);
        return true;
    }
    catch {
        return false;
    }
}
/** A spec id's namespace — `acme:spec/dice` → `acme`. Empty for an id with no colon. */
const namespaceOf = (specId) => {
    const i = specId.indexOf(':');
    return i === -1 ? '' : specId.slice(0, i);
};
/**
 * The slug an envoy is addressed by: a genre's is its `key`; an action's is
 * `<plugin>.<key>` — **every** action's, core's included (`core.dice-master`),
 * unlike a slash name where core takes the bare form. The dot is what keeps
 * an action's envoy from ever colliding with a genre's (a genre's key admits
 * no dot); a core action taking a bare key would give that up. The origin
 * itself is a fact of the declaration (`DeclaredEnvoy.origin` on the host),
 * never re-derived from the slug.
 */
export function envoySlugOf(owner, key) {
    if ('genre' in owner)
        return key;
    const ns = namespaceOf(owner.action.specId);
    if (!ns)
        throw new Error(`an action's envoy is namespaced by its spec ('<plugin>.<key>') and '${owner.action.specId}' has no namespace`);
    return `${ns}.${key}`;
}
/** The participant reference for an envoy: `envoy:<slug>` (see `envoySlugOf`). */
export function envoyIdentity(owner, key) {
    return `envoy:${envoySlugOf(owner, key)}`;
}
/** The slug of an `envoy:` reference, or null for any other reference. */
export function envoySlugOfRef(ref) {
    if (typeof ref !== 'string')
        return null;
    try {
        const parsed = parseParticipantRef(ref);
        return parsed.kind === 'envoy' ? parsed.slug : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=participants.js.map