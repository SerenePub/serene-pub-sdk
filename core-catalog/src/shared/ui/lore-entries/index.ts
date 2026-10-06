/**
 * `@serene-pub/core-catalog/lore-entries` — the plain-TypeScript half of
 * core's Lore entries widget (R21, R58): its settings, its filter and sort
 * words, the line under each entry, the page span, and the latest-ask guard
 * the widget pages with. The widget's Svelte source lives in
 * `components/shared/lore-entries/` and ships built
 * (`dist/components/lore-entries.js`); a host imports only this half, which
 * carries no Svelte runtime.
 *
 * Every sentence is English source handed through the widget's `t`, so the
 * same words speak the viewer's language natively or in a worker.
 *
 * 🚧 Provisional with the widget's requests (`session-entries`,
 * `set-entry-marks`).
 */
import type { SessionEntryV1, WidgetRequests } from '@serene-pub/sdk'

type EntriesParams = WidgetRequests['session-entries']['params']

/** 🚧 How the widget orders the book's entries. @experimental */
export type LoreEntriesSort = NonNullable<EntriesParams['sort']>
/** 🚧 Which of the book's entries the widget shows. @experimental */
export type LoreEntriesFilter = NonNullable<EntriesParams['filter']>

/** A translation: English source in, the viewer's words out. @experimental */
export type LoreEntriesT = (source: string) => string

/** The filter radios, in order: the value asked for, and its English label. @experimental */
export const LORE_ENTRIES_FILTERS: ReadonlyArray<{ value: LoreEntriesFilter; label: string }> = Object.freeze([
	{ value: 'all', label: 'All' },
	{ value: 'fired', label: 'Read' },
	{ value: 'pinned', label: 'Pinned' },
	{ value: 'off', label: 'Off' },
])

/** The sort options, in order: the value asked for, and its English label. @experimental */
export const LORE_ENTRIES_SORTS: ReadonlyArray<{ value: LoreEntriesSort; label: string }> = Object.freeze([
	{ value: 'lastRead', label: 'Last read' },
	{ value: 'timesRead', label: 'Times read' },
	{ value: 'rank', label: 'Rank' },
	{ value: 'name', label: 'Name' },
])

/** The widget's settings, complete — the declared defaults wherever an instance has none. @experimental */
export interface LoreEntriesSettings {
	sort: LoreEntriesSort
	pageSize: number
}

/** @experimental */
export const LORE_ENTRIES_DEFAULTS: LoreEntriesSettings = Object.freeze({ sort: 'lastRead', pageSize: 25 })

/** Read one settings payload (`settings.v1`) into the complete object above. @experimental */
export function readLoreEntriesSettings(raw: Record<string, unknown> | undefined): LoreEntriesSettings {
	const v = raw ?? {}
	const sort = LORE_ENTRIES_SORTS.some((s) => s.value === v.sort) ? (v.sort as LoreEntriesSort) : LORE_ENTRIES_DEFAULTS.sort
	const pageSize =
		typeof v.pageSize === 'number' && Number.isInteger(v.pageSize) && v.pageSize >= 1
			? v.pageSize
			: LORE_ENTRIES_DEFAULTS.pageSize
	return { sort, pageSize }
}

/** How long ago `iso` was, from `now` (ms): `just now`, `5m ago`, `3h ago`, `2d ago`; null for no time. @experimental */
export function loreEntryAgo(iso: string | null, now: number, t: LoreEntriesT): string | null {
	if (!iso) return null
	const at = new Date(iso).getTime()
	if (!Number.isFinite(at)) return null
	const s = Math.round((now - at) / 1000)
	if (s < 60) return t('just now')
	if (s < 3600) return t('{n}m ago').replace('{n}', String(Math.round(s / 60)))
	if (s < 86400) return t('{n}h ago').replace('{n}', String(Math.round(s / 3600)))
	return t('{n}d ago').replace('{n}', String(Math.round(s / 86400)))
}

/** The line under an entry: what this session's rankings made of it. @experimental */
export function loreEntryReadLine(row: SessionEntryV1, now: number, t: LoreEntriesT): string {
	if (!row.timesJudged) return t('Not read in this session yet')
	const parts = [
		t('read {included} of {judged}')
			.replace('{included}', String(row.timesIncluded))
			.replace('{judged}', String(row.timesJudged)),
	]
	if (row.lastIncluded && row.lastRank != null) parts.push(t('last at rank {rank}').replace('{rank}', String(row.lastRank)))
	else if (row.lastIncluded === false) parts.push(t('left out last time'))
	const when = loreEntryAgo(row.lastJudgedAt, now, t)
	if (when) parts.push(when)
	return parts.join(t(' · '))
}

/** An entry's name: its title, or `Entry #<id>` for an untitled one. @experimental */
export const loreEntryName = (row: Pick<SessionEntryV1, 'id' | 'title'>, t: LoreEntriesT): string =>
	row.title || t('Entry #{id}').replace('{id}', String(row.id))

/** What an empty page says: nothing matched, or the book has no entries at all. @experimental */
export const loreEntriesEmptyLine = (titleOrKey: string, filter: LoreEntriesFilter, t: LoreEntriesT): string =>
	titleOrKey.trim() || filter !== 'all' ? t('Nothing matches.') : t('This lorebook has no entries yet.')

/** The page shown: `from`–`to` of `total` (1-based), and whether either way is open. @experimental */
export interface LoreEntriesSpan {
	from: number
	to: number
	total: number
	/** More than one page: the pager shows at all. */
	paged: boolean
	hasPrevious: boolean
	hasNext: boolean
	previousOffset: number
	nextOffset: number
}

/** @experimental */
export function loreEntriesSpan(offset: number, pageSize: number, total: number): LoreEntriesSpan {
	return {
		from: offset + 1,
		to: Math.min(offset + pageSize, total),
		total,
		paged: total > pageSize,
		hasPrevious: offset > 0,
		hasNext: offset + pageSize < total,
		previousOffset: Math.max(0, offset - pageSize),
		nextOffset: offset + pageSize,
	}
}

/**
 * 🚧 The widget's own latest-ask guard. The page answers every
 * `session-entries` with its own reply — a newer ask never supersedes an
 * older one there — so which answer to SHOW is the widget's: each ask takes
 * a ticket, and only the newest ticket's answer (or refusal) is taken.
 * @experimental
 */
export interface LatestAsk {
	/** A ticket for a new ask; every earlier ticket is now stale. */
	next(): number
	/** Whether `ticket` is still the newest ask's. */
	isLatest(ticket: number): boolean
}

/** @experimental */
export function createLatestAsk(): LatestAsk {
	let latest = 0
	return {
		next: () => ++latest,
		isLatest: (ticket) => ticket === latest,
	}
}
