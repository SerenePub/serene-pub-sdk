/**
 * `@serene-pub/core-catalog/lore-entries` — the plain-TypeScript half of
 * core's Lore entries widget (R21, R58): its settings, its filter and sort
 * words, the line under each entry, the page span, and the latest-ask guard
 * the widget pages with. The widget's Svelte source lives in
 * `components/sessions/lore-entries/` and ships built
 * (`dist/components/lore-entries.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget's requests (`session-entries`,
 * `set-entry-marks`).
 */
import type { SessionEntryV1, WidgetRequests } from '@serene-pub/sdk';
type EntriesParams = WidgetRequests['session-entries']['params'];
/** 🚧 How the widget orders the book's entries. @experimental */
export type LoreEntriesSort = NonNullable<EntriesParams['sort']>;
/** 🚧 Which of the book's entries the widget shows. @experimental */
export type LoreEntriesFilter = NonNullable<EntriesParams['filter']>;
/** A translation: English source in, the viewer's words out. @experimental */
export type LoreEntriesT = (source: string) => string;
/** The filter radios, in order: the value asked for, and its English label. @experimental */
export declare const LORE_ENTRIES_FILTERS: ReadonlyArray<{
    value: LoreEntriesFilter;
    label: string;
}>;
/** The sort options, in order: the value asked for, and its English label. @experimental */
export declare const LORE_ENTRIES_SORTS: ReadonlyArray<{
    value: LoreEntriesSort;
    label: string;
}>;
/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface LoreEntriesSettings {
    sort: LoreEntriesSort;
    pageSize: number;
}
/** @experimental */
export declare const LORE_ENTRIES_DEFAULTS: LoreEntriesSettings;
/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export declare function readLoreEntriesSettings(raw: Record<string, unknown> | undefined): LoreEntriesSettings;
/** How long ago `iso` was, from `now` (ms): `just now`, `5m ago`, `3h ago`, `2d ago`; null for no time. @experimental */
export declare function loreEntryAgo(iso: string | null, now: number, t: LoreEntriesT): string | null;
/** The line under an entry: what this session's rankings made of it. @experimental */
export declare function loreEntryReadLine(row: SessionEntryV1, now: number, t: LoreEntriesT): string;
/** An entry's name: its title, or `Entry #<id>` for an untitled one. @experimental */
export declare const loreEntryName: (row: Pick<SessionEntryV1, 'id' | 'title'>, t: LoreEntriesT) => string;
/** What an empty page says: nothing matched, or the book has no entries at all. @experimental */
export declare const loreEntriesEmptyLine: (titleOrKey: string, filter: LoreEntriesFilter, t: LoreEntriesT) => string;
/** The page shown: `from`–`to` of `total` (1-based), and whether either way is open. @experimental */
export interface LoreEntriesSpan {
    from: number;
    to: number;
    total: number;
    /** More than one page: the pager shows at all. */
    paged: boolean;
    hasPrevious: boolean;
    hasNext: boolean;
    previousOffset: number;
    nextOffset: number;
}
/** @experimental */
export declare function loreEntriesSpan(offset: number, pageSize: number, total: number): LoreEntriesSpan;
/**
 * 🚧 The widget's own latest-ask guard. The page answers every
 * `session-entries` with its own reply — a newer ask never supersedes an
 * older one there — so which answer to SHOW is the widget's: each ask takes
 * a ticket, and only the newest ticket's answer (or refusal) is taken.
 * @experimental
 */
export interface LatestAsk {
    /** A ticket for a new ask; every earlier ticket is now stale. */
    next(): number;
    /** Whether `ticket` is still the newest ask's. */
    isLatest(ticket: number): boolean;
}
/** @experimental */
export declare function createLatestAsk(): LatestAsk;
export {};
//# sourceMappingURL=index.d.ts.map