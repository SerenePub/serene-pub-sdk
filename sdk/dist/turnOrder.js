/**
 * The order a session has before its first recompute — and what a reader
 * answers for a document it cannot read. Frozen: a caller that wants to
 * build on it copies it.
 * @experimental
 */
export const EMPTY_TURN_ORDER = Object.freeze({
    v: 1,
    order: Object.freeze([]),
    candidates: Object.freeze([]),
    basedOnAt: 0,
    computedAt: 0,
    runId: null,
    event: null,
    strategy: null,
});
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isEntry = (v) => isRecord(v) &&
    (v.ref === null || typeof v.ref === 'string') &&
    typeof v.via === 'string' &&
    (v.channel === undefined || typeof v.channel === 'string') &&
    (v.subject === undefined || typeof v.subject === 'string');
const isCandidate = (v) => isRecord(v) &&
    typeof v.ref === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.name === 'string' &&
    typeof v.position === 'number';
/**
 * The turn order a session's `metadata` holds — `EMPTY_TURN_ORDER` when the
 * key is missing or the value is not a `TurnOrderV1`. Never throws: a
 * session that predates this build, or one whose metadata a hand edit
 * broke, has an empty order until its next event recomputes it (§4.1,
 * "no backfill"). The document is returned as stored, extra keys included;
 * only its shape is judged.
 * @experimental
 */
export function readTurnOrder(metadata) {
    if (!isRecord(metadata))
        return EMPTY_TURN_ORDER;
    const t = metadata.turnOrder;
    if (!isRecord(t))
        return EMPTY_TURN_ORDER;
    if (t.v !== 1)
        return EMPTY_TURN_ORDER;
    if (!Array.isArray(t.order) || !t.order.every(isEntry))
        return EMPTY_TURN_ORDER;
    if (!Array.isArray(t.candidates) || !t.candidates.every(isCandidate))
        return EMPTY_TURN_ORDER;
    if (typeof t.basedOnAt !== 'number' || typeof t.computedAt !== 'number')
        return EMPTY_TURN_ORDER;
    if (t.runId !== null && typeof t.runId !== 'string')
        return EMPTY_TURN_ORDER;
    if (t.event !== null && typeof t.event !== 'string')
        return EMPTY_TURN_ORDER;
    if (t.strategy !== null && typeof t.strategy !== 'string')
        return EMPTY_TURN_ORDER;
    return t;
}
/** Who voiced a row, by reference: the projected `speaker`, else the raw `metadata.speaker`. */
const speakerRefOf = (m) => m.speaker ?? m.metadata?.speaker;
/**
 * The rows that count as turns: not hidden, not narration. Hidden rows and
 * narrator responses are outside the rotation entirely. A missing row (`null`
 * or `undefined` — a sparse or partially loaded history) is skipped, never a
 * throw: every reader of turn order goes through here, so it tolerates them once.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export function countedTurns(messages) {
    return messages.filter((m) => !!m && !m.isHidden && !m.isNarratorResponse);
}
const lastUserIndex = (turns) => {
    for (let i = turns.length - 1; i >= 0; i--)
        if (turns[i].role === 'user')
            return i;
    return -1;
};
/**
 * Which participants have already spoken since the person last did, as
 * references (`character:<id>`, `envoy:<slug>`).
 *
 * Three readings, one per kind, each the fact that kind leaves in the
 * history: a character's id on a reply row, an envoy's reference on a reply
 * row (`speaker`, else `metadata.speaker`), a persona's id on the user row
 * that opened the window — the person's own send is their turn, consumed. An
 * envoy's reply marks no character. Before any user row the whole history is
 * one round, so a greeting counts as its character's turn.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export function spokenRefsSince(messages) {
    const turns = countedTurns(messages);
    const at = lastUserIndex(turns);
    const out = new Set();
    for (let i = at + 1; i < turns.length; i++) {
        const m = turns[i];
        if (m.role !== 'assistant')
            continue;
        if (m.characterId != null)
            out.add(`character:${m.characterId}`);
        const ref = speakerRefOf(m);
        if (typeof ref === 'string' && ref.startsWith('envoy:'))
            out.add(ref);
    }
    if (at >= 0) {
        const sender = turns[at].personaId;
        if (sender != null)
            out.add(`character:${sender}`);
    }
    return out;
}
/**
 * Round robin — once per turn of the person's: every candidate that has not
 * spoken since the person last did, in candidate order, each entry
 * `via: 'strategy'`. Everyone having spoken is an empty order (the person's
 * turn), never a halt; the next user row opens a fresh round, and a manual
 * out-of-turn trigger counts as that candidate's turn for the round.
 *
 * This is the rule `core:task/turn-round-robin@1` runs, and the fallback a
 * plugin's own strategy should use rather than carry a copy of it.
 *
 * @experimental 🚧 provisional with the turn-order vocabulary (PLAN-turn-order §4.4).
 */
export function roundRobinOrder(candidates, messages) {
    const spoken = spokenRefsSince(messages);
    return candidates.filter((c) => !spoken.has(c.ref)).map((c) => ({ ref: c.ref, via: 'strategy' }));
}
//# sourceMappingURL=turnOrder.js.map