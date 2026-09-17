/**
 * The wire value of `core:shape/context-candidates@1`, and the one thing it
 * carries besides candidates: each source's **band intent**.
 *
 * ## Queries declare, the ranker resolves (16 §5a; R-7 P5, ruled 2026-09-15)
 *
 * *Per-source* intent — how much of the window a source wants (`share`), the
 * most entries it may contribute (`maxEntries`), the fewest it keeps when room
 * is tight (`minEntries`), and how strongly it resists being trimmed
 * (`priority`) — is declared on the **retrieval definition** that produces
 * the source, as ordinary `params`, and travels to the ranker as metadata on
 * the candidates it publishes. The ranker declares only what is
 * *cross-source*: how mechanisms and signals weigh, and how the shares
 * normalise. A per-source map on the ranker is the design 16 §5a rejected: it
 * goes stale when a source is added, and a plugin source cannot participate
 * without somebody editing it.
 *
 * ## The shape, and why it is still a flat list
 *
 * The value stays an **array** — every consumer that iterates candidates, the
 * `candidates/filter` and `candidates/rescore` script kinds included, keeps
 * its contract — and each source's intent rides in it as one element of its
 * own, ahead of that source's items:
 *
 *     [ { band: 'worldLore', intent: { share: 0.1667, maxEntries: 20, priority: 'normal' } },
 *       { id: 12, source: 'worldLore', tokens: 40, signals: {…} },
 *       … ]
 *
 * An element, not a field on every candidate, for one reason that decides it:
 * **a source that found nothing this turn still has a share.** Under
 * share-first allocation an empty band's slice is reserved and then swept to
 * whoever can use it, which is a different allocation from the band not
 * existing — so the intent has to reach the ranker whether or not any item
 * does, and only a thing that is not an item can carry it there. It is also
 * why a `session-history` source that ranks no candidates at all can still
 * publish the transcript's slice of the window on a `band` port.
 *
 * `concat-candidates` keeps the first intent per band and hoists them ahead of
 * the items; `merge-candidates` lifts them out before it fuses ranks and puts
 * them back; a script chain over a `candidates` port never sees them. The
 * ranker reads them, resolves its bands from them, and ranks the items alone
 * — a band no source declared falls back to the ranker's own table for the
 * five core bands and is excluded with a receipt for any other, which is what
 * makes a plugin source's participation a matter of publishing one element.
 */
/**
 * How strongly a band resists being trimmed once its minimum is met.
 *
 * `normal` is what every source ships at and is arithmetically no ordering at
 * all: the ranker's sweep of leftover tokens walks candidates in score order
 * alone, exactly as it always has. `high` and `low` sort a band's candidates
 * ahead of or behind the others in that sweep before score is consulted;
 * `always` takes every candidate of the band ahead of the scored fill, window
 * permitting, the way a pinned entry is taken — *never dropped* is what the
 * word promises, and the window is the one thing that can still say no.
 */
export const BAND_PRIORITIES = ['low', 'normal', 'high', 'always'];
export const isBandPriority = (v) => typeof v === 'string' && BAND_PRIORITIES.includes(v);
/** Build one, dropping fields the source left unset. */
export function bandIntent(band, fields) {
    const intent = {};
    if (typeof fields.share === 'number' && Number.isFinite(fields.share))
        intent.share = Math.max(0, fields.share);
    if (typeof fields.maxEntries === 'number' && Number.isFinite(fields.maxEntries))
        intent.maxEntries = Math.max(0, Math.floor(fields.maxEntries));
    if (typeof fields.minEntries === 'number' && Number.isFinite(fields.minEntries))
        intent.minEntries = Math.max(0, Math.floor(fields.minEntries));
    if (isBandPriority(fields.priority))
        intent.priority = fields.priority;
    return { band, intent };
}
/**
 * Is this element a band's intent rather than a candidate?
 *
 * A candidate names its band as `source` and never carries `intent`; an
 * intent names it as `band` and carries nothing else. Both keys are checked
 * so a candidate a plugin happens to give a `band` field is not mistaken for
 * one.
 */
export const isBandIntent = (v) => typeof v === 'object' &&
    v !== null &&
    typeof v.band === 'string' &&
    typeof v.intent === 'object' &&
    v.intent !== null &&
    !('source' in v);
/**
 * A candidates list, split: the intents (first per band wins) and the items,
 * each in the order they arrived.
 */
export function splitCandidates(list) {
    const intents = [];
    const seen = new Set();
    const items = [];
    for (const el of list ?? []) {
        if (isBandIntent(el)) {
            if (seen.has(el.band))
                continue;
            seen.add(el.band);
            intents.push(el);
        }
        else
            items.push(el);
    }
    return { intents, items };
}
/**
 * Put a list back together the way every core candidate source publishes it:
 * intents first, then items.
 */
export function withBandIntents(intents, items) {
    return [...intents, ...items];
}
//# sourceMappingURL=candidates.js.map