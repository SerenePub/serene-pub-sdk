/**
 * 🚧 The Dialogue box's reading place (PLAN-visual-novel-layout §1.2): a
 * message id, client-only, over the widget's rows in host order (oldest
 * first). Pure: no DOM, no timers.
 */

/** The fields of a row the reading place reads (a `MessageV1` satisfies it). @experimental */
export interface ReadingRow {
	id: number
	role?: string
	characterId?: number | null
	personaId?: number | null
	castMemberId?: number | null
	isNarratorResponse?: boolean
	isGenerating?: boolean
	metadata?: unknown
}

/**
 * A row a reader stops at: a line a character, a person, the narrator or an envoy spoke,
 * or a row being written. A change line or a marker is passed over.
 * @experimental
 */
export function isReadLine(row: ReadingRow): boolean {
	const md =
		row.metadata && typeof row.metadata === 'object'
			? (row.metadata as Record<string, unknown>)
			: {}
	if (md.tableLine === true) return false
	if (md.anchorMessageId != null) return false
	if (row.role === 'system') return false
	if (row.isGenerating) return true
	if (row.isNarratorResponse) return true
	if (row.characterId != null) return true
	if (row.personaId != null) return true
	if (row.castMemberId != null) return true
	if (typeof md.speaker === 'string' && md.speaker.startsWith('envoy:')) return true
	return row.role === 'user'
}

/** The passing rule: move on while a row follows and the row here is the viewer's own or not read. */
function pass(rows: readonly ReadingRow[], index: number, ownId?: number | null): number {
	let i = index
	while (i < rows.length - 1 && (rows[i].id === ownId || !isReadLine(rows[i]))) i++
	return i
}

/** The place after the rows (or the viewer's own newest id) changed. @experimental */
export function settlePlace(
	rows: readonly ReadingRow[],
	place: number | null,
	ownId?: number | null,
): number | null {
	if (rows.length === 0) return null
	const newest = rows.length - 1
	let index: number
	if (place === null) {
		index = newest
	} else {
		index = rows.findIndex((r) => r.id === place)
		if (index < 0) {
			index = -1
			for (let i = 0; i < rows.length; i++) if (rows[i].id <= place) index = i
			if (index < 0) index = newest
		}
		if (ownId != null && ownId > rows[index].id) {
			const own = rows.findIndex((r) => r.id === ownId)
			if (own >= 0) index = own
		}
	}
	return rows[pass(rows, index, ownId)].id
}

/** **Next line**: one row on, then the passing rule. @experimental */
export function nextLinePlace(
	rows: readonly ReadingRow[],
	place: number | null,
	ownId?: number | null,
): number | null {
	const index = place === null ? -1 : rows.findIndex((r) => r.id === place)
	if (index < 0) return settlePlace(rows, place, ownId)
	if (index >= rows.length - 1) return place
	return rows[pass(rows, index + 1, ownId)].id
}

/** @experimental */
export interface QueuedSummary {
	/** Finished read lines after the place. */
	lines: number
	/** Distinct speaker names of those lines, in order; empty when any of them has no name. */
	repliedBy: string[]
	/** A read line after the place is being written: its speaker's name, `''` when it has none; null when none is. */
	writing: string | null
}

/** @experimental */
export function queuedSummary(
	rows: readonly ReadingRow[],
	place: number | null,
	nameOf: (row: ReadingRow) => string | null,
): QueuedSummary {
	const none: QueuedSummary = { lines: 0, repliedBy: [], writing: null }
	if (place === null) return none
	const after = rows.filter((r) => r.id > place && isReadLine(r))
	const writingRow = after.find((r) => r.isGenerating)
	const finished = after.filter((r) => !r.isGenerating)
	const names: string[] = []
	let nameless = false
	for (const r of finished) {
		const n = nameOf(r)
		if (!n) nameless = true
		else if (!names.includes(n)) names.push(n)
	}
	return {
		lines: finished.length,
		repliedBy: nameless ? [] : names,
		writing: writingRow ? (nameOf(writingRow) ?? '') : null,
	}
}

/** What the reading bar says about what waits; null when nothing does. @experimental */
export function queuedText(summary: QueuedSummary): string | null {
	const parts: string[] = []
	const { lines, repliedBy, writing } = summary
	if (lines > 0) {
		if (repliedBy.length > 0 && lines <= 2 && repliedBy.length === lines) {
			parts.push(
				repliedBy.length === 1
					? `${repliedBy[0]} has replied`
					: `${repliedBy[0]} and ${repliedBy[1]} have replied`,
			)
		} else {
			parts.push(lines === 1 ? '1 more line' : `${lines} more lines`)
		}
	}
	if (writing !== null) parts.push(writing === '' ? 'Writing…' : `${writing} is writing…`)
	return parts.length ? parts.join(' · ') : null
}
