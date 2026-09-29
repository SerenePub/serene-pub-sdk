/** The filter radios, in order: the value asked for, and its English label. @experimental */
export const LORE_ENTRIES_FILTERS = Object.freeze([
    { value: 'all', label: 'All' },
    { value: 'fired', label: 'Read' },
    { value: 'pinned', label: 'Pinned' },
    { value: 'off', label: 'Off' },
]);
/** The sort options, in order: the value asked for, and its English label. @experimental */
export const LORE_ENTRIES_SORTS = Object.freeze([
    { value: 'lastRead', label: 'Last read' },
    { value: 'timesRead', label: 'Times read' },
    { value: 'rank', label: 'Rank' },
    { value: 'name', label: 'Name' },
]);
/** @experimental */
export const LORE_ENTRIES_DEFAULTS = Object.freeze({ sort: 'lastRead', pageSize: 25 });
/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readLoreEntriesSettings(raw) {
    const v = raw ?? {};
    const sort = LORE_ENTRIES_SORTS.some((s) => s.value === v.sort) ? v.sort : LORE_ENTRIES_DEFAULTS.sort;
    const pageSize = typeof v.pageSize === 'number' && Number.isInteger(v.pageSize) && v.pageSize >= 1
        ? v.pageSize
        : LORE_ENTRIES_DEFAULTS.pageSize;
    return { sort, pageSize };
}
/** How long ago `iso` was, from `now` (ms): `just now`, `5m ago`, `3h ago`, `2d ago`; null for no time. @experimental */
export function loreEntryAgo(iso, now, t) {
    if (!iso)
        return null;
    const at = new Date(iso).getTime();
    if (!Number.isFinite(at))
        return null;
    const s = Math.round((now - at) / 1000);
    if (s < 60)
        return t('just now');
    if (s < 3600)
        return t('{n}m ago').replace('{n}', String(Math.round(s / 60)));
    if (s < 86400)
        return t('{n}h ago').replace('{n}', String(Math.round(s / 3600)));
    return t('{n}d ago').replace('{n}', String(Math.round(s / 86400)));
}
/** The line under an entry: what this session's rankings made of it. @experimental */
export function loreEntryReadLine(row, now, t) {
    if (!row.timesJudged)
        return t('Not read in this session yet');
    const parts = [
        t('read {included} of {judged}')
            .replace('{included}', String(row.timesIncluded))
            .replace('{judged}', String(row.timesJudged)),
    ];
    if (row.lastIncluded && row.lastRank != null)
        parts.push(t('last at rank {rank}').replace('{rank}', String(row.lastRank)));
    else if (row.lastIncluded === false)
        parts.push(t('left out last time'));
    const when = loreEntryAgo(row.lastJudgedAt, now, t);
    if (when)
        parts.push(when);
    return parts.join(t(' · '));
}
/** An entry's name: its title, or `Entry #<id>` for an untitled one. @experimental */
export const loreEntryName = (row, t) => row.title || t('Entry #{id}').replace('{id}', String(row.id));
/** What an empty page says: nothing matched, or the book has no entries at all. @experimental */
export const loreEntriesEmptyLine = (titleOrKey, filter, t) => titleOrKey.trim() || filter !== 'all' ? t('Nothing matches.') : t('This lorebook has no entries yet.');
/** @experimental */
export function loreEntriesSpan(offset, pageSize, total) {
    return {
        from: offset + 1,
        to: Math.min(offset + pageSize, total),
        total,
        paged: total > pageSize,
        hasPrevious: offset > 0,
        hasNext: offset + pageSize < total,
        previousOffset: Math.max(0, offset - pageSize),
        nextOffset: offset + pageSize,
    };
}
/** @experimental */
export function createLatestAsk() {
    let latest = 0;
    return {
        next: () => ++latest,
        isLatest: (ticket) => ticket === latest,
    };
}
//# sourceMappingURL=index.js.map