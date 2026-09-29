/**
 * Spec identity: **owner + slug + version** (12 §3b, 02 §3).
 *
 * Two versioning schemes live in this system and conflating them causes real confusion,
 * so they are stated apart:
 *
 * - **Types pin at an integer version** — `core:query/session-history@1`. A pin is exact;
 *   a spec references one version and never floats.
 * - **Specs upgrade at semver** — `1.2.0`. An import replaces the installed copy when it
 *   is newer and is ignored when it is not, which is the rule already ruled for imported
 *   pipelines.
 *
 * So a spec id carries **no `@N` suffix**. The version is not part of the identity; it is
 * what the identity is compared *at*.
 * @experimental
 */
const SLUG_PART = /^[a-z0-9]+([./-][a-z0-9]+)*$/;
/**
 * Parse `owner:slug` — `chariot.rp:chat`, `core:chat-turn`, or a bare `chat-turn` for a
 * document someone hand-wrote and imported.
 * @experimental
 */
export function parseSpecId(id) {
    // Tolerated and ignored: a trailing @N. It is type-pin syntax that reads like a
    // version here, and silently treating it as one is how a spec ends up with two.
    // `SpecBuilder` strips it the same way before storing the id, so a document's
    // `id` is always the versionless slug and an action's identity (`<slug>#<key>`)
    // never carries an `@`. An `@` anywhere else fails `SLUG_PART` below.
    const withoutPin = id.replace(/@\d+$/, '');
    const i = withoutPin.indexOf(':');
    if (i === -1)
        return { slug: withoutPin };
    return { owner: withoutPin.slice(0, i), slug: withoutPin.slice(i + 1) };
}
/** @experimental */
export function assertSpecId(id) {
    const { owner, slug } = parseSpecId(id);
    if (!SLUG_PART.test(slug) || (owner !== undefined && !SLUG_PART.test(owner))) {
        throw new Error(`'${id}' is not a valid spec id. Use 'owner:slug' — 'chariot.rp:chat', 'core:chat-turn' — ` +
            `or a bare slug for a hand-imported document. Lowercase, digits, hyphens and dots only. ` +
            `The **semver** goes in meta.version, never in the id: a spec upgrades by version, and an ` +
            `id that carries one cannot be matched across upgrades.`);
    }
}
// ── Semver, only as much as the upgrade rule needs ──────────────────────────
const parts = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
    if (!m)
        return null;
    return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] };
};
/** −1, 0, 1. A prerelease sorts below the release it leads to. @experimental */
export function compareVersions(a, b) {
    const x = parts(a);
    const y = parts(b);
    if (!x || !y)
        return a === b ? 0 : a < b ? -1 : 1;
    for (const k of ['major', 'minor', 'patch']) {
        if (x[k] !== y[k])
            return x[k] < y[k] ? -1 : 1;
    }
    if (x.pre === y.pre)
        return 0;
    if (x.pre === undefined)
        return 1;
    if (y.pre === undefined)
        return -1;
    return x.pre < y.pre ? -1 : 1;
}
/**
 * The import rule, already ruled: **a newer version replaces the installed copy; an equal
 * or older one is ignored.** Ownership is checked first, because "newer" is not a licence
 * to overwrite somebody else's row — a plugin update must not silently take over a spec
 * an admin imported by hand, or one another plugin ships.
 * @experimental
 */
export function decideImport(incoming, installed) {
    if (!installed)
        return { action: 'install', reason: 'nothing installed under this slug' };
    if ((incoming.owner ?? null) !== (installed.owner ?? null)) {
        return {
            action: 'conflict',
            reason: `'${incoming.slug}' is installed under owner '${installed.owner ?? '(none)'}' and the ` +
                `import claims '${incoming.owner ?? '(none)'}'. Ownership is not transferred by importing — ` +
                `rename the slug, or remove the installed copy deliberately`,
        };
    }
    const c = compareVersions(incoming.version, installed.version);
    if (c > 0)
        return {
            action: 'replace',
            reason: `${incoming.version} is newer than ${installed.version}`,
        };
    return {
        action: 'ignore',
        reason: `${incoming.version} is not newer than the installed ${installed.version}`,
    };
}
/** Display form for logs and diffs — never a storage key. @experimental */
export const qualify = (i) => `${i.owner ? `${i.owner}:` : ''}${i.slug}@${i.version}`;
/* ── Action identity ─────────────────────────────────────────────────────── */
/** The spec id core's own verbs are listed under — a name, not a row. @internal */
export const CORE_ACTION_SPEC_ID = 'core';
/**
 * An action's **identity** on the wire: `<spec slug>#<key>` — a spec slug
 * (`core`, `core:spec/narrate`, `acme:spec/roll`; versionless, so no `@`)
 * and a key (a lowercase kebab token), joined by `#`. One string names one
 * declaration; everything that keys on an action keys on this — a binding's
 * subject, a preset's included set, a session's enablement row, a genre's
 * enabled-when default, the fire, a block's `action`, the *new* mark (plans/31
 * V2: the one key; there is no bare function beside it). The host's
 * `shared/actions/identity.ts` reads the same grammar from here.
 * @internal
 */
export const ACTION_IDENTITY = /^[a-z0-9:./-]+#[a-z0-9-]+$/;
/** The longest identity the wire accepts; a spec slug is never near this. @internal */
export const ACTION_IDENTITY_MAX_LENGTH = 200;
/** Is this string an action identity — `<spec slug>#<key>`, within the wire's length? @experimental */
export function isActionIdentity(v) {
    return (typeof v === 'string' && v.length <= ACTION_IDENTITY_MAX_LENGTH && ACTION_IDENTITY.test(v));
}
/** An action's identity from its two halves: `{ specSlug: 'core', key: 'edit' }` → `core#edit`. @experimental */
export const actionIdentity = (a) => `${a.specSlug}#${a.key}`;
/**
 * The two halves of an action identity, or null for anything that is not one.
 * Split at the last `#` — neither half may hold one, so it is the only one.
 * @experimental
 */
export function parseActionIdentity(raw) {
    if (!isActionIdentity(raw))
        return null;
    const i = raw.lastIndexOf('#');
    return { specSlug: raw.slice(0, i), key: raw.slice(i + 1) };
}
//# sourceMappingURL=identity.js.map