/**
 * 🚧 A state widget's lorebook search for a list's picker (attributes phase
 * 3c): the session's book through `session-entries`, item entries asked for
 * first (`typeIds`), then the rest of the book — two pages the picker merges
 * (`pickableEntries`), so the items lead even in a book too big for one page.
 *
 * A session that reads no lorebook, and a viewer who does not own the book,
 * are told so in words (`notice`) rather than shown an empty list that reads
 * as "nothing to pick". A declined request rejects, and the picker says why.
 */
import type { WidgetContextRef } from "@serene-pub/core-catalog/widgets"
import { ITEM_ENTRY_TYPE_ID } from "@serene-pub/core-catalog/session-state"

/** One row the picker can offer, as `session-entries` answered it. */
export interface FoundEntry {
	id: number
	typeId: string
	title: string
}

/** What one search found: the item page, then the book's page; or why there is nothing. */
export interface EntryFinds {
	pages: FoundEntry[][]
	notice: string | null
}

/** Search the session's lorebook by title or key; blank is the whole book. */
export type EntryFinder = (titleOrKey: string) => Promise<EntryFinds>

/** How many of each the picker shows before the search has to narrow it. */
const PAGE = 25

export function createEntryFinder(
	widget: WidgetContextRef | undefined,
	t: (source: string) => string
): EntryFinder | undefined {
	if (!widget) return undefined
	return async (titleOrKey) => {
		const words = titleOrKey.trim()
		const ask = (typeIds?: string[]) =>
			widget.current.request("session-entries", {
				...(words ? { titleOrKey: words } : {}),
				sort: "name",
				...(typeIds ? { typeIds } : {}),
				limit: PAGE
			})
		const items = await ask([ITEM_ENTRY_TYPE_ID])
		if (items.lorebookId == null) return { pages: [], notice: t("This session reads no lorebook, so there is nothing to pick from.") }
		if (items.ownerOnly)
			return { pages: [], notice: t("Only the lorebook's owner can pick from it. Type the item's name instead.") }
		const rest = await ask()
		const rows = (page: { rows: FoundEntry[] }) => page.rows.map(({ id, typeId, title }) => ({ id, typeId, title }))
		return { pages: [rows(items), rows(rest)], notice: null }
	}
}
