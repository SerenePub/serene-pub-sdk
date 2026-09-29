/**
 * The turn lock — whether the numbers written for one speaker are still open
 * to be changed.
 *
 * A change to a character's state anchors to **that character's latest
 * message** and stays open until that character speaks again, whatever anybody
 * else says in between. Two characters trading lines therefore each keep their
 * own reply editable: the older one is not sealed by the newer speaker, because
 * it was not that speaker's turn that produced it. The world's numbers follow
 * the same rule against the newest message in the session, whoever wrote it —
 * the world moves on every turn, which is exactly the difference between the
 * two owners.
 *
 * Before a character's first reply there is nothing to anchor to: the open
 * anchor is `null`, and `null` is open. That is the case a cast member who has
 * just joined is in, and it has to be writable or their opening state could
 * never be set at all. Personas are characters, so the player's own turns lock
 * on exactly these terms too.
 *
 * ## Why this lives in the SDK
 *
 * Three parties ask this question and they must not answer it differently: the
 * host's write gate, which refuses a write to a sealed anchor; a plugin
 * proposing a change, which has to know whether the proposal can land; and the
 * client, which draws each ledger line as editable or sealed. Two of the three
 * are outside core, so the rule cannot live in core's write path — a client
 * that drew an editable ledger the gate then refused would be a bug neither
 * side could see alone, and a plugin that guessed would be a bug nobody could
 * see at all. It is a pure function over facts all three already hold, so there
 * is nothing to share here but the rule itself.
 *
 * ⚠ Only session-layer writes are turn-locked. A lorebook-layer edit is
 * authoring rather than play, and a capture stays exactly as it was written.
 */
/**
 * The anchor still open for this owner, or `null` when there is none.
 *
 * ⚠ `messages` is in **session order** — oldest first, as a query ordered by id
 * returns them. The newest is the last element, and the caller owns that
 * guarantee: this reads positions rather than comparing ids, so a reversed list
 * answers confidently and wrongly.
 * @experimental
 */
export function openAnchorFor(messages, owner) {
    if (owner.kind === 'session')
        return messages.length ? messages[messages.length - 1].id : null;
    for (let i = messages.length - 1; i >= 0; i--)
        if (messages[i].speakerId === owner.id)
            return messages[i].id;
    return null;
}
/**
 * Whether a change filed at `anchorId` may still be changed.
 *
 * `null === null` is deliberate, and it is the whole first-reply case: a
 * character who has not spoken has no anchor, and a change filed against no
 * anchor is open until they do.
 *
 * **The world's newest turn, whole** (lair pass R8, 2026-09-28): a turn may
 * write several rows — the Lair's Castellan posts its beats in the Sanctum
 * and then the party speak — and the world's changes are anchored to the
 * row that planned them, not to whichever delver happened to speak last. So
 * for the world, an anchor is open when it is the newest message OR it
 * belongs to the same turn (`TurnMessage.turn`) as the newest message.
 * Nothing written after that turn by anybody else is sealed any later than
 * before; a caller that supplies no `turn` gets the newest-message rule.
 * @experimental
 */
export function isAnchorOpen(messages, owner, anchorId) {
    if (anchorId === openAnchorFor(messages, owner))
        return true;
    if (owner.kind !== 'session' || anchorId === null || !messages.length)
        return false;
    const newest = messages[messages.length - 1].turn;
    if (newest === undefined || newest === null)
        return false;
    return messages.some((m) => m.id === anchorId && m.turn === newest);
}
//# sourceMappingURL=turnLock.js.map