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
export declare const PARTICIPANT_ROLES: readonly ['owner', 'admin', 'participant', 'item', 'run-owner'];
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
/**
 * A participant reference, as a string.
 *
 * Ids are opaque to the SDK — the host's user and character ids are
 * integers today, and the receipt's `actorUserId` is already a string, so
 * the id half is a string here and the host reads it at its seam. An envoy
 * slug is `[A-Za-z0-9]` followed by any of `[A-Za-z0-9._-]`.
 */
export type ParticipantRef = ParticipantRole | `user:${string}` | `character:${string}` | `envoy:${string}`;
/** A reference taken apart. */
export type ParsedParticipantRef = {
    kind: ParticipantRole;
} | {
    kind: 'user';
    id: string;
} | {
    kind: 'character';
    id: string;
} | {
    kind: 'envoy';
    slug: string;
};
/**
 * Who may see, and who may act (R-15). Declared here for the action model;
 * consumed by the venue work (U5c) — no UI reads it yet.
 */
export interface Audience {
    see: ParticipantRef[];
    act: ParticipantRef[];
}
/**
 * Who portrays a participant this turn — the resolver's answer.
 *
 * `person` — a signed-in member of the session speaks as them (their own
 * persona, or the run owner acting as a role). `ai` — the model speaks as
 * them (a cast character, an envoy, the turn's own speaker). `none` — nobody
 * can: a character not in the cast, a user who is not a member, a role
 * nobody present holds, or `item`, which is only ever decided against a
 * message.
 *
 * `userId` is a string for the reason `ParticipantRef`'s ids are.
 */
export type Portrayal = {
    by: 'person';
    userId: string;
} | {
    by: 'ai';
} | {
    by: 'none';
};
/** The pinned answer for every reference a run asked about. */
export type Portrayals = Partial<Record<ParticipantRef, Portrayal>>;
/**
 * Take a reference apart. Throws on anything that is not one, with the
 * sentence a declaration error should carry — an audience naming `user:` with
 * no id, or `character:Tom`, is an authoring mistake, not a read to degrade.
 */
export declare function parseParticipantRef(raw: unknown): ParsedParticipantRef;
/** The one spelling a parsed reference has. `parse(format(x))` is `x`. */
export declare function formatParticipantRef(parsed: ParsedParticipantRef): ParticipantRef;
/** Is this a well-formed participant reference? Never throws. */
export declare function isParticipantRef(raw: unknown): raw is ParticipantRef;
/** The reference an envoy is addressed by. */
export type EnvoyRef = `envoy:${string}`;
/**
 * Who declared an envoy — the two places one may be declared, and the two
 * origins a cast row may carry. A genre's envoy is addressed by its bare key;
 * an action's by `<plugin>.<key>` (the spec's namespace, like a slash name).
 */
export type EnvoyOwner = {
    genre: string;
} | {
    action: {
        specId: string;
    };
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
export declare function envoySlugOf(owner: EnvoyOwner, key: string): string;
/** The participant reference for an envoy: `envoy:<slug>` (see `envoySlugOf`). */
export declare function envoyIdentity(owner: EnvoyOwner, key: string): EnvoyRef;
/** The slug of an `envoy:` reference, or null for any other reference. */
export declare function envoySlugOfRef(ref: unknown): string | null;
//# sourceMappingURL=participants.d.ts.map