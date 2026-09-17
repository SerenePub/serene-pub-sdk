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
export declare const BAND_PRIORITIES: readonly ['low', 'normal', 'high', 'always'];
export type BandPriority = (typeof BAND_PRIORITIES)[number];
export declare const isBandPriority: (v: unknown) => v is BandPriority;
/** What one source says about its own place in the window. */
export interface BandIntentFields {
    /**
     * The band's slice of the window, relative to every other band's. `0` is
     * the band's off switch. NOMENCLATURE §7: a share, never a weight.
     */
    share?: number;
    /** The most entries this band may contribute. Absent means no ceiling. */
    maxEntries?: number;
    /** The fewest entries kept when room is tight — a minimum, honoured before the shares. */
    minEntries?: number;
    priority?: BandPriority;
}
/** One source's declared intent, as it travels in a candidates list. */
export interface BandIntent {
    /** The band this speaks for — `worldLore`, `messages`, a plugin's own key. */
    band: string;
    intent: BandIntentFields;
}
/** Build one, dropping fields the source left unset. */
export declare function bandIntent(band: string, fields: BandIntentFields): BandIntent;
/**
 * Is this element a band's intent rather than a candidate?
 *
 * A candidate names its band as `source` and never carries `intent`; an
 * intent names it as `band` and carries nothing else. Both keys are checked
 * so a candidate a plugin happens to give a `band` field is not mistaken for
 * one.
 */
export declare const isBandIntent: (v: unknown) => v is BandIntent;
/**
 * A candidates list, split: the intents (first per band wins) and the items,
 * each in the order they arrived.
 */
export declare function splitCandidates<T = unknown>(list: readonly unknown[] | null | undefined): {
    intents: BandIntent[];
    items: T[];
};
/**
 * Put a list back together the way every core candidate source publishes it:
 * intents first, then items.
 */
export declare function withBandIntents<T>(intents: readonly BandIntent[], items: readonly T[]): Array<BandIntent | T>;
//# sourceMappingURL=candidates.d.ts.map