/**
 * Ranking decisions (PLAN-sdk-1.0 §3.9, R64): what a ranker says about each
 * candidate it judged. A node that publishes an array of these on a port of
 * shape `core:shape/decisions@1` (`S.decisions`) has them recorded by the
 * host automatically — nothing else to opt into.
 *
 * Required per decision: `included` and a `reason` code, and something that
 * says WHAT was judged — a `subject` (`{ kind, id }`: `lore-entry` is core's;
 * a package names its own kinds `<slug>:<kind>`), or core's own `candidate`
 * object, from which the host derives the subject. Optional: `score`,
 * `rank`, `tokens`, `why` (a sentence or two) and `detail` (ranker-specific
 * facts, bounded).
 *
 * A decision with no derivable subject (a message or relationship band) is
 * counted on its ranking, not stored.
 */
/** The shape id a decisions port carries. @experimental */
export declare const DECISIONS_SHAPE = "core:shape/decisions@1";
/** Core's subject kind for a lorebook entry. @experimental */
export declare const LORE_ENTRY_SUBJECT = "lore-entry";
/** At most this many decisions are stored per ranking; the rest are counted and noted. @experimental */
export declare const MAX_DECISIONS_PER_RANKING = 2000;
/** At most this many bytes of `detail` per decision, serialized; larger is dropped and noted. @experimental */
export declare const MAX_DECISION_DETAIL_BYTES = 2048;
/** @experimental */
export interface RankingSubject {
    /** `lore-entry`, or a package's own `<slug>:<kind>`. */
    kind: string;
    id: string | number;
}
/** @experimental */
export interface RankingDecisionV1 {
    subject?: RankingSubject;
    /** Core's rankers publish the candidate they judged; the host derives the subject from it. */
    candidate?: {
        id: string | number;
        source?: string;
        tokens?: number;
        payload?: unknown;
        [k: string]: unknown;
    };
    included: boolean;
    /** A short code: core's closed set, or `<slug>:<code>` for a package's own. */
    reason: string;
    score?: number;
    rank?: number;
    tokens?: number;
    why?: string;
    detail?: Record<string, unknown>;
}
/** Why a subject kind is not one a decision may carry, or undefined. @internal */
export declare function subjectKindFindings(kind: unknown): string | undefined;
/**
 * One decision, checked. For a custom ranker: `decision({ subject: { kind:
 * 'acme.dice:roll', id: 7 }, included: true, reason: 'acme.dice:rolled-high',
 * score: 0.9, why: 'Rolled a 19.' })`.
 * @experimental
 */
export declare function decision(d: RankingDecisionV1): RankingDecisionV1;
//# sourceMappingURL=rankingDecisions.d.ts.map