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
 * *Portrayal*, not *voice*: a **voice** is one cast member's step inside an
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
/**
 * The role-shaped references — no id, resolved against the session and the run.
 *
 * `participant` is everyone in the session: its people, and the model's
 * context. The two catch-alls split it (R57): `person` is every human member,
 * `ai` is the model's context — what goes into a prompt. A data audience
 * (`see` on a stored value) is written in these; an empty one is pipelines
 * only.
 * @experimental
 */
export declare const PARTICIPANT_ROLES: readonly ['owner', 'admin', 'participant', 'person', 'ai', 'item', 'run-owner'];
/** @experimental */
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
/**
 * A participant reference, as a string.
 *
 * Ids are opaque to the SDK — the host's user and character ids are
 * integers today, and the receipt's `actorUserId` is already a string, so
 * the id half is a string here and the host reads it at its seam. An envoy
 * slug is `[A-Za-z0-9]` followed by any of `[A-Za-z0-9._-]`.
 * @experimental
 */
export type ParticipantRef = ParticipantRole | `user:${string}` | `character:${string}` | `envoy:${string}`;
/** A reference taken apart. @experimental */
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
 * @experimental
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
 * @experimental
 */
export type Portrayal = {
    by: 'person';
    userId: string;
} | {
    by: 'ai';
} | {
    by: 'none';
};
/** The pinned answer for every reference a run asked about. @experimental */
export type Portrayals = Partial<Record<ParticipantRef, Portrayal>>;
/**
 * Does the viewer hold any of these references, under the resolver's rules?
 * A reference the viewer *is* — a `person` portrayal naming them — holds.
 * `item` is the per-message ownership rule: with `item` given, that is its
 * answer; with none (a listing, ahead of any message) it holds and the
 * caller reports it separately as `itemGated`, a question for a message
 * rather than a refusal.
 *
 * The judge of `core:verdict/audience` (`verdicts.ts`): the host's listing
 * reads `canAct` through it and its fire quotes the verdict, so the two
 * cannot disagree.
 * @internal
 */
export declare function audienceHolds(refs: ReadonlyArray<ParticipantRef>, portrayals: Portrayals, viewer: {
    userId: number | string;
}, item?: boolean): boolean;
/**
 * Does the model's context hold any of these references (R57)? The prompt
 * built for `speaker` — a `character:` or `envoy:` reference, when there is
 * one — may carry what everyone may see (`participant`), what the model may
 * (`ai`), and what that speaker may. `[]` holds for nobody.
 * @internal
 */
export declare function aiHolds(refs: ReadonlyArray<ParticipantRef>, speaker?: ParticipantRef | null): boolean;
/** The one spelling of a reference — `' character:7 '` is `character:7`. Throws on a non-reference. @internal */
export declare const canonicalParticipantRef: (raw: string) => ParticipantRef;
/** Who may see each stored value, by owner and key; a key with no entry is pipelines only (R59). @experimental */
export type DataAudiences = Record<string, Record<string, ParticipantRef[]>>;
/**
 * One reader's view of an owner-keyed store (R57): the values whose audience
 * `holds` for that reader, as one object per owner. An owner left with no
 * value the reader may see is left out. Pipelines read the store itself, not
 * this.
 * @internal
 */
export declare function visibleTo(values: Record<string, unknown>, audiences: DataAudiences, holds: (refs: ReadonlyArray<ParticipantRef>) => boolean): Record<string, Record<string, unknown>>;
/**
 * What is wrong with an audience a write names, or undefined (R57). A list of
 * participant references; `item` and `run-owner` mean nothing for a stored
 * value — there is no message to own, and a value outlives the run.
 * @internal
 */
export declare function dataAudienceFindings(raw: unknown): string | undefined;
/**
 * Take a reference apart. Throws on anything that is not one, with the
 * sentence a declaration error should carry — an audience naming `user:` with
 * no id, or `character:Tom`, is an authoring mistake, not a read to degrade.
 * @internal
 */
export declare function parseParticipantRef(raw: unknown): ParsedParticipantRef;
/** The one spelling a parsed reference has. `parse(format(x))` is `x`. @internal */
export declare function formatParticipantRef(parsed: ParsedParticipantRef): ParticipantRef;
/** Is this a well-formed participant reference? Never throws. @internal */
export declare function isParticipantRef(raw: unknown): raw is ParticipantRef;
/** The reference an envoy is addressed by. @experimental */
export type EnvoyRef = `envoy:${string}`;
/**
 * Who declared an envoy — the two places one may be declared, and the two
 * origins a cast row may carry. A genre's envoy is addressed by its bare key;
 * an action's by `<plugin>.<key>` (the spec's namespace, like a slash name).
 * @experimental
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
 * @internal
 */
export declare function envoySlugOf(owner: EnvoyOwner, key: string): string;
/** The participant reference for an envoy: `envoy:<slug>` (see `envoySlugOf`). @experimental */
export declare function envoyIdentity(owner: EnvoyOwner, key: string): EnvoyRef;
/** The slug of an `envoy:` reference, or null for any other reference. @internal */
export declare function envoySlugOfRef(ref: unknown): string | null;
/**
 * What `core:query/session-cast@1` publishes on `main` / `cast`
 * (`core:shape/session-cast@1`), as a TypeScript name — the `cast` of the
 * settings document (`SessionSettingsV1`, sessionSettings.ts) and the
 * `cast` in-port of `core:task/turn-pool@1`.
 *
 * Declared from the existing read and **adding no fields**: the character
 * and persona rows go out raw with the seat's `position`, `removedAt` and
 * `enabled` riding along (the host retrieves, it does not choose), `envoys` is the
 * seated envoys `entities/envoys.ts seatedEnvoys` returns (each with `slug`,
 * `position`, `speaks`, `removedAt`), and the rest is what the prompt path
 * already reads. Every row is open: the host's character row has more
 * columns than this file names, and a reader keys on what it needs.
 *
 * Not candidates: nothing here has been pooled. The pool reads this and
 * publishes `turn-candidates@1`.
 * @experimental
 */
export interface SessionCastV1 {
    /** Character seats: the library row under `character`, plus the seat's own columns. */
    sessionCharacters: Array<{
        character: {
            id: number;
            name: string;
            nickname?: string | null;
            aliases?: unknown;
            userId?: number | null;
            [k: string]: unknown;
        };
        /**
         * The seat is switched on in the cast list. **Every seat is here**,
         * switched off or not (2026-09-27): a reader that must not see a
         * switched-off one — a turn pool, a names list — filters on this.
         * (The table's column is `is_active`; `enabled` is its name on every
         * read a pipeline or widget takes.)
         */
        enabled: boolean;
        position: number | null;
        removedAt: Date | string | null;
        /** Attached by the host from `lorebook_bindings`, not a cast column. */
        absorbedAliases: string[];
        [k: string]: unknown;
    }>;
    /** Persona seats: the library row under `persona` (a character flagged `is_persona`), plus the seat's own columns. */
    sessionPersonas: Array<{
        persona: {
            id: number;
            name: string;
            nickname?: string | null;
            aliases?: unknown;
            userId?: number | null;
            [k: string]: unknown;
        };
        /** Always true — a persona seat has no switch — said so one filter serves both lists. */
        enabled: boolean;
        position: number | null;
        removedAt: Date | string | null;
        absorbedAliases: string[];
        [k: string]: unknown;
    }>;
    /** The seated envoys, live and departed, in seat order — each its declaration joined to the seat. */
    envoys: Array<{
        /** The address — `mascot`, `acme.master`. */
        slug: string;
        key: string;
        origin: 'genre' | 'action';
        name: unknown;
        speaks: 'in-turn' | 'on-action';
        default: boolean;
        position: number;
        removedAt: Date | string | null;
        [k: string]: unknown;
    }>;
    sessionScenario: string | null;
    isGroup: boolean;
    /** Whose turn this run is, from the scope; null when the trigger named nobody. */
    currentCharacterId: number | null;
    /** The declared voice of the turn's channel, when the trigger named one and the genre shapes channels. */
    turnChannelVoice?: 'character' | 'narrator' | 'none';
    /**
     * How much of each non-speaking character's card the prompt shows — the
     * session's `characterDetail` genre field, resolved (`full` · `brief` ·
     * `speaker-only`). Absent for a genre that declares no such field, which
     * reads as `full`.
     */
    characterDetail?: 'full' | 'brief' | 'speaker-only';
    [k: string]: unknown;
}
//# sourceMappingURL=participants.d.ts.map