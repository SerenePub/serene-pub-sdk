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
export interface SpecIdentity {
    /** Who ships it: a plugin slug, `core`, or absent for a hand-imported document. */
    owner?: string;
    /** Stable, PK-agnostic reference. Unique per owner. */
    slug: string;
    version: string;
}
/**
 * Parse `owner:slug` — `chariot.rp:chat`, `core:chat-turn`, or a bare `chat-turn` for a
 * document someone hand-wrote and imported.
 * @experimental
 */
export declare function parseSpecId(id: string): {
    owner?: string;
    slug: string;
};
/** @experimental */
export declare function assertSpecId(id: string): void;
/** −1, 0, 1. A prerelease sorts below the release it leads to. @experimental */
export declare function compareVersions(a: string, b: string): number;
/** @experimental */
export type ImportDecision = {
    action: 'install';
    reason: string;
} | {
    action: 'replace';
    reason: string;
} | {
    action: 'ignore';
    reason: string;
} | {
    action: 'conflict';
    reason: string;
};
/**
 * The import rule, already ruled: **a newer version replaces the installed copy; an equal
 * or older one is ignored.** Ownership is checked first, because "newer" is not a licence
 * to overwrite somebody else's row — a plugin update must not silently take over a spec
 * an admin imported by hand, or one another plugin ships.
 * @experimental
 */
export declare function decideImport(incoming: SpecIdentity, installed?: SpecIdentity): ImportDecision;
/** Display form for logs and diffs — never a storage key. @experimental */
export declare const qualify: (i: SpecIdentity) => string;
/** The spec id core's own verbs are listed under — a name, not a row. @internal */
export declare const CORE_ACTION_SPEC_ID = "core";
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
export declare const ACTION_IDENTITY: RegExp;
/** The longest identity the wire accepts; a spec slug is never near this. @internal */
export declare const ACTION_IDENTITY_MAX_LENGTH = 200;
/** Is this string an action identity — `<spec slug>#<key>`, within the wire's length? @experimental */
export declare function isActionIdentity(v: unknown): v is string;
/** An action's identity from its two halves: `{ specSlug: 'core', key: 'edit' }` → `core#edit`. @experimental */
export declare const actionIdentity: (a: {
    specSlug: string;
    key: string;
}) => string;
/**
 * The two halves of an action identity, or null for anything that is not one.
 * Split at the last `#` — neither half may hold one, so it is the only one.
 * @experimental
 */
export declare function parseActionIdentity(raw: unknown): {
    specSlug: string;
    key: string;
} | null;
//# sourceMappingURL=identity.d.ts.map