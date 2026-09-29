/**
 * Predicates — one declared shape, read in two places (plans/29 R-15
 * *enabled-when*; 20 §10 *junction*; ruled 2026-09-15, built 2026-09-17 as
 * U5e).
 *
 * A **junction** clause branches on a value a task computed: each branch is
 * `{ path?, equals? | equalsPath? | truthy? }` over that value. An action's
 * **enabled-when** is the same predicate over the session's **published
 * values** — the document a host builds from what a session has already said
 * about itself (`state.world.location`, `session.generating`, a message's
 * `item.hidden`). The core here — `readPath` and `predicateHolds` — is what
 * both read, so a predicate that fires a branch and one that greys a button
 * can never mean two things.
 *
 * ## The two-port compare (D-4a, 2026-09-17)
 *
 * `equals` takes a literal, so until this the grammar could ask *is the
 * accused Vell?* and never *is the accused the culprit?* — and a genre that
 * derives a hidden fact rather than authoring it has no other question.
 * `equalsPath` is the second path: the same document, read twice, compared
 * strictly. Additive in the single-version sense (ruling 2026-09-08) — a
 * stored document without it validates and hashes exactly as before. Both
 * doors read it: the junction's `fires()` hands the routed value in as the
 * scope, an enabled-when's evaluator hands in the published values.
 *
 * ## What an enabled-when is not
 *
 * Not a port reference: `on` is a dotted path into the published values,
 * never `$.parse.call` — an action lives outside a run, and there is no port
 * to read. Not code: a richer decision belongs in a task the junction reads,
 * or in a value the state-keeper publishes. And not the field-level
 * `ValuePredicate` of `values.ts`, which gates one settings-form field on a
 * sibling field's value.
 */
import type { I18n, LocaleMap } from './descriptors.js';
import { i18nFindings, localeMapOf } from './i18n.js';
/** The junction's truthiness: a value that is not falsy and not an empty list. @experimental */
export declare const truthy: (v: unknown) => boolean;
/**
 * The value at a dotted path, or `undefined` where the path leaves the
 * document — a missing segment answers `undefined`, never a throw. An absent
 * or empty path is the value itself (a junction branch with no `path` reads
 * the routed value whole). It walks any key at evaluation, on purpose: the
 * junction shares this walker over data a task computed, and the segments a
 * published-values path may not name (`__proto__`, `constructor`,
 * `prototype`) are refused at declaration by `enabledWhenFindings`, not here.
 * @experimental
 */
export declare function readPath(value: unknown, path?: string): unknown;
/** The predicate half of a junction branch and of an enabled-when: exactly one of the three. @experimental */
export interface Predicate {
    /** Holds when the value strictly equals this literal. */
    equals?: unknown;
    /**
     * Holds when the value strictly equals **the value at another path in the
     * same document** — the two-port compare (D-4a, 2026-09-17).
     *
     * `equals` takes a literal, so a document could state *is the accused
     * Vell?* and never *is the accused the culprit?* — which is the one
     * question a genre that DERIVES a hidden fact has to ask, and the reason
     * Whodunit could not adjudicate its own case. The other side is read out
     * of the same document the subject was: the junction's routed value for a
     * branch, the published values for an enabled-when.
     *
     * ⚠ **Two absences are not a match.** A path that leaves the document
     * answers `undefined`, and if that counted as equal to an absent subject
     * then an unwired port on each side would fire the branch that means *the
     * accused IS the culprit*. Either side absent holds for nothing.
     *
     * Strict (`===`) like `equals`, so it compares a key and not a document:
     * two structurally equal objects are not equal here, and a structured
     * comparison belongs in a value the pipeline publishes as one.
     */
    equalsPath?: string;
    /** Holds when the value is truthy (`truthy`). */
    truthy?: boolean;
}
/**
 * The conditions a predicate may state — **exactly one**, wherever it is read.
 *
 * Exported because the junction's own validator asks the same question of a
 * branch (`validate.ts`) and asked it off a literal list; one list is what
 * keeps a grammar that grew a third condition from being legal in one door
 * and refused at the other.
 * @experimental
 */
export declare const PREDICATE_CONDITION_KEYS: readonly string[];
/**
 * Does the predicate hold over this value? `equals` is strict (`===`);
 * `equalsPath` is that same strictness against the value at another path in
 * `scope` — the document the subject itself was read from — and holds for
 * nothing when either side is absent; `truthy` is the junction's truthiness;
 * a predicate stating none of the three holds for nothing — the validators
 * refuse one, but a stored document is judged by what it says.
 *
 * `scope` is optional so that every caller written before the two-port
 * compare still compiles. A caller that does not pass it has no second side
 * to read, so an `equalsPath` predicate holds for nothing there — the same
 * answer an absent path gives, and never a silent `true`.
 * @internal
 */
export declare function predicateHolds(pred: Predicate, value: unknown, scope?: unknown): boolean;
/**
 * One enabled-when predicate (plans/29 R-15): a declared condition over the
 * session's published values that says whether an action is offered *now*.
 * The junction clause's predicate shape, never code.
 *
 * A host publishes, per listing: `state.world.<slot>` and
 * `state.cast.<key>.<slot>` (the resolved state), `session.fields.<key>`
 * (the genre's fields as stored) and `session.generating`; and, for the
 * `message` venue, `item.<field>` per message — `item.id`, `item.isNewest`,
 * `item.hidden`, `item.generating`, `item.role`, `item.mine`,
 * `item.hasSwipes`, `item.greeting`, `item.channel`, `item.speaker` (a
 * participant reference, or null) and `item.characterLine` (lair re-plan
 * R11). A predicate over `item.*` is evaluated
 * where a message is at hand: the client per row, the server at the door.
 * @experimental
 */
export interface EnabledWhen extends Predicate {
    /**
     * A dotted path into the published values — `state.world.location`,
     * `session.generating`, `item.hidden`. **Not a port reference** (no `$`):
     * actions live outside a run.
     */
    on: string;
    /** Why the control is grey when this predicate does not hold. Required (R-20: a string or a locale map with `en`). */
    reason: I18n;
}
/** The keys an enabled-when may carry; anything else is a finding. @experimental */
export declare const ENABLED_WHEN_KEYS: readonly string[];
/** A single predicate or a list — a list means **all must hold**. @experimental */
export type EnabledWhenDecl = EnabledWhen | EnabledWhen[];
/**
 * The verdict over one predicate set: enabled, or the first predicate that
 * failed with its reason — a locale map, whatever spelling the author used.
 * @experimental
 */
export type EnabledWhenVerdict = {
    enabled: true;
} | {
    enabled: false;
    reason: LocaleMap;
    failed: EnabledWhen;
};
export { i18nFindings, localeMapOf };
/** A value with the one field a predicate cannot do without — the shape the list form keeps. @experimental */
export declare const isEnabledWhenShaped: (p: unknown) => p is EnabledWhen;
/**
 * The list form: a single predicate wrapped, a list copied, `reason` as a
 * locale map, nothing else touched. Absent is the empty list — an action
 * declaring no predicate is always enabled. An entry that is not a
 * predicate at all — no string `on` — is dropped here rather than read: a
 * stored document from before this shape must not take a listing down, and
 * `enabledWhenFindings` names the entry wherever the declaration is judged
 * (construction, `validate()`, the host's publish).
 * @internal
 */
export declare function normalizeEnabledWhen(x: unknown): EnabledWhen[];
/**
 * Evaluate a predicate set over a published-values document: every
 * predicate must hold, and the **first** that does not names the reason —
 * the order the author wrote them in is the order a person is told them in.
 * Pure and isomorphic: the client runs it per message row with the same
 * `item` document the server builds at the door.
 * @experimental
 */
export declare function evaluateEnabledWhen(preds: ReadonlyArray<EnabledWhen> | EnabledWhen | undefined | null, doc: unknown): EnabledWhenVerdict;
/** The predicates over one prefix (`item`) and the rest, split for a host that evaluates them in two places. @internal */
export declare function partitionEnabledWhen(preds: ReadonlyArray<EnabledWhen>, prefix: string): {
    under: EnabledWhen[];
    rest: EnabledWhen[];
};
/**
 * Every fault in one enabled-when declaration — a predicate or a list — as
 * sentences that say what to do instead (the teaching-error pattern, 15
 * §1.3). Empty when it is sound, and for `undefined` (no predicate). Applied
 * to an action's `enabledWhen` at construction, in `validate()` and at the
 * host's publish, and to a genre's defaults at declaration.
 * @experimental
 */
export declare function enabledWhenFindings(raw: unknown, at?: string): string[];
//# sourceMappingURL=predicates.d.ts.map