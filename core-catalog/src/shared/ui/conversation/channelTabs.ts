/**
 * 🚧 **Channel tabs** (lair fix 2, 2026-10-22): a conversation copy that
 * shows more than one channel draws a tab per channel above its log — the
 * Lair's **Story · Sanctum** — instead of a switch in its composer's footer.
 * The log shows the active tab's rows and the composer writes there (the
 * copy's `lane`); a tab not shown carries a dot when a line somebody else
 * wrote lands on its channel (a Castellan line in the Sanctum while the
 * story is shown).
 *
 * Which channels a copy shows is the host's claim rule (`composer.channels`,
 * narrowed per copy): a copy pinned to one channel draws no tabs, and a
 * channel the viewer may not read (the Sanctum, for a guest) is never
 * listed. Pure, so the rule is tested without a page.
 */
import { parseChannel } from '@serene-pub/sdk'
import { canonicalListedChannel, isNoLaneChannel } from './channelLanes.js'

/**
 * The tabs a copy draws: its listed channels in their written form, once
 * each — none when it shows fewer than two (one channel needs no tab, and
 * `null`, every channel, is a copy the host has told nothing yet).
 * @experimental
 */
export function channelTabsOf(listed: readonly string[] | null | undefined): string[] {
	if (!listed) return []
	const out: string[] = []
	for (const entry of listed) {
		if (isNoLaneChannel(entry)) continue
		const slug = canonicalListedChannel(entry)
		if (!out.includes(slug)) out.push(slug)
	}
	return out.length > 1 ? out : []
}

/** A row as the tabs read it. @experimental */
export interface ChannelTabRow {
	readonly id: number
	readonly channel?: unknown
	readonly userId?: unknown
	/** Whose line it is: only a `user` row under the viewer's id is their own. */
	readonly role?: unknown
	readonly isHidden?: unknown
	readonly isGenerating?: unknown
}

/**
 * The newest line on a tab's channel that somebody other than `viewerId`
 * wrote — the id, or 0 — as the session panel's tabs count news
 * (`tabAttention`): a hidden row or one still being written is not news yet,
 * and a person's own line (`role: 'user'` under their id) never is. A bare
 * tab holds every lane of its channel, a lane tab (`parley:2`) that lane.
 * @experimental
 */
export function newestNewsOn(rows: readonly ChannelTabRow[], tab: string, viewerId: number | null | undefined): number {
	const shown = parseChannel(tab)
	let newest = 0
	for (const m of rows) {
		if (m.isHidden || m.isGenerating) continue
		const at = parseChannel(typeof m.channel === 'string' && m.channel ? m.channel : 'main')
		if (at.slug !== shown.slug) continue
		if (shown.explicit && at.lane !== shown.lane) continue
		if (viewerId != null && m.userId === viewerId && (m.role ?? 'user') === 'user') continue
		if (m.id > newest) newest = m.id
	}
	return newest
}

/**
 * The tabs that carry a dot: every tab but the `active` one whose channel
 * has news past what it was last shown with (`seen`). A tab never seen has
 * no mark yet, and no dot — the copy's first look reads history as read.
 * @experimental
 */
export function channelTabDots(
	tabs: readonly string[],
	active: string,
	rows: readonly ChannelTabRow[],
	viewerId: number | null | undefined,
	seen: ReadonlyMap<string, number>,
): Set<string> {
	const out = new Set<string>()
	for (const tab of tabs) {
		if (tab === active) continue
		const last = seen.get(tab)
		if (last !== undefined && newestNewsOn(rows, tab, viewerId) > last) out.add(tab)
	}
	return out
}
