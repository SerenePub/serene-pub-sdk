/**
 * The pick hash and the rendezvous pick — one implementation, three callers.
 *
 * A genre that wants a fact *chosen* rather than authored — which suspect did
 * it, which lorebook entry the answer is — needs a rule that is a pure
 * function of the session and the candidates. Nothing may be written down:
 * the only per-session store a spec can reach is the attribute-slot ledger,
 * which a player's own state panel renders, so an answer stored there is an
 * answer on screen. Derived, the create run and every later turn reach the
 * same choice with nothing recorded anywhere.
 *
 * Two plugins and one core genre each wrote this function out before it lived
 * here — Twenty Questions' `pickSecretEntry`, Whodunit's `pickCulprit`, and
 * `core:task/pick-by-hash@1`'s binding in the app. Three copies of a hash is
 * three chances for one of them to drift, and a drifted copy does not fail:
 * it quietly picks a different suspect than the receipt of the same session
 * from last week.
 *
 * ## Rendezvous, not modulo
 *
 * `ids[hash(key) % ids.length]` is the obvious version and it has the wrong
 * failure: every id moves when the list length changes. Seating a fifth
 * suspect halfway through a case would move the answer in four sessions out
 * of five. Rendezvous hashing scores each candidate *on its own* —
 * `hash(key + '#' + itemKey)` — and takes the maximum, so a new candidate
 * displaces the pick exactly when its own score wins: probability 1/n, and
 * the other n-1 sessions are undisturbed. Removing a candidate moves only the
 * sessions that had picked it.
 *
 * ## ⚠ The finalizer is not optional, and leaving it off is a real bug
 *
 * The pick compares whole hashes, so what matters is how the **high** bits are
 * distributed — and plain FNV-1a over strings differing only in their last
 * character or two leaves those bits systematic. Measured over three ids
 * differing in the last digit, plain FNV handed the first of them the answer
 * in 49% of sessions instead of 33%, and a fourth added mid-game displaced it
 * half the time rather than a quarter. The murmur3 `fmix32` tail below puts
 * both back where the arithmetic says they should be. `sdk-tests/pick.test.ts`
 * is what catches it coming back.
 */
/**
 * FNV-1a, 32 bits, with murmur3's `fmix32` avalanche on the end. Small,
 * dependency-free, and identical on every machine — the same number in the
 * app's binding, in a plugin's sandbox and in a test.
 *
 * Not `contentHash` from `hash.ts`, and the two must never be confused: that
 * one answers *is this the same declaration?* over a canonical JSON form and
 * is free to change whenever the registries agree to re-project. This one is
 * a **stored answer** in everything but name — change it and every session in
 * flight silently picks somebody else — so it is frozen by its tests.
 * @experimental
 */
export declare function pickHash32(text: string): number;
/** What the pick answers: the winning item, where it sat, and the key it won under. @public */
export interface RendezvousPick<T> {
    item: T;
    /** Its index in the list **as handed in**, not among the candidates. */
    index: number;
    /** The identity it was scored under — what a later comparison compares against. */
    key: string;
}
/**
 * The highest-scoring candidate for this key, or `null` when nothing
 * identifiable was offered.
 *
 * Deterministic in both arguments and in **neither's order**: each candidate
 * is scored on its own, and a tie is settled by the lower item key rather
 * than by arrival, so a query that happened to return its rows the other way
 * round reaches the same answer. (A tie needs two keys colliding in all 32
 * bits; the rule exists so that the *answer* does not depend on row order
 * even then.)
 *
 * `keyOf` answers `null` for an entry with no identity — a hole in the list,
 * a row the caller cannot name — and those are skipped rather than scored
 * under `'undefined'`, which would make every nameless entry the same
 * candidate.
 *
 * ⚠ `key` is the session's own address (`session:41`) or something equally
 * durable. It must **not** be a run's seed: that is a different string every
 * turn, and a pick keyed on it would move between two questions.
 * @public
 */
export declare function rendezvousPick<T>(items: readonly T[], key: string, keyOf: (item: T, index: number) => string | null): RendezvousPick<T> | null;
//# sourceMappingURL=pick.d.ts.map