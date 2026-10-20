/**
 * 🚧 **Interleave** (PLAN-rulesets §30, 2026-10-16): a conversation copy's
 * `interleave` setting names another channel — the `table` 🚧 channel, where
 * a Dungeon Crawler's rolls, stakes and rest lines live — whose rows this copy
 * draws inline, each straight after the line it belongs to
 * (`metadata.anchorMessageId`), faceless. Both views read the same rows: a
 * copy pinned to that channel itself shows them as a log.
 *
 * Pure, so the order is a fact a test can read without a mount.
 */

/** A row as far as interleaving reads it. */
export interface InterleaveRow {
	id: number
	channel?: unknown
	metadata?: { anchorMessageId?: unknown } | null | Record<string, unknown>
}

/** The slug part of a stored channel (`table:2` → `table`); absent is `main`. */
function slugOf(channel: unknown): string {
	const c = typeof channel === "string" && channel ? channel : "main"
	const at = c.indexOf(":")
	return at < 0 ? c : c.slice(0, at)
}

/** The `interleave` setting, read: a trimmed slug, or `''` for none. */
export function interleaveSlug(raw: unknown): string {
	return typeof raw === "string" ? raw.trim() : ""
}

/** The message a row is anchored to (`metadata.anchorMessageId`), or `null`. */
export function anchorOf(row: InterleaveRow): number | null {
	const v = (row.metadata as { anchorMessageId?: unknown } | null | undefined)?.anchorMessageId
	return typeof v === "number" && Number.isInteger(v) ? v : null
}

/** Whether `row` is one of the interleaved channel's rows (`slug` set). */
export function isInterleavedRow(row: InterleaveRow, slug: string): boolean {
	return !!slug && slugOf(row.channel) === slug
}

/**
 * `rows` (the host's order, oldest first) with each row of channel `slug`
 * that names a present anchor moved to straight after that anchor — after
 * any earlier row anchored to it, by id. A row of `slug` whose anchor is not
 * among `rows` (older than the page loaded, or none) keeps its own place.
 * No `slug`: `rows`, untouched.
 */
export function interleaveByAnchor<T extends InterleaveRow>(rows: readonly T[], slug: string): T[] {
	if (!slug) return rows as T[]
	const present = new Set<number>()
	for (const r of rows) if (!isInterleavedRow(r, slug)) present.add(r.id)
	const under = new Map<number, T[]>()
	const rest: T[] = []
	for (const r of rows) {
		const anchor = isInterleavedRow(r, slug) ? anchorOf(r) : null
		if (anchor !== null && present.has(anchor)) {
			const list = under.get(anchor)
			if (list) list.push(r)
			else under.set(anchor, [r])
		} else rest.push(r)
	}
	if (!under.size) return rows as T[]
	const out: T[] = []
	for (const r of rest) {
		out.push(r)
		const list = under.get(r.id)
		if (list) out.push(...list.sort((a, b) => a.id - b.id))
	}
	return out
}

// ─── How an interleaved row reads, and a folio's kinds (PLAN-sheet-widget §16) ──

/**
 * 🚧 The `interleaveAs` setting, read (owner ruling 2026-10-17, "under the
 * fold"): `fold` — one head line that opens into the whole row, closed by
 * default — or `open`, the row as it was written. Unsaid is `fold`.
 */
export function interleaveMode(raw: unknown): "fold" | "open" {
	return raw === "open" ? "open" : "fold"
}

/** The head a folded row shows: the host's `metadata.summary` when it sent one, else the row's first line. */
export function foldHeadOf(row: { content?: unknown; metadata?: unknown }): string {
	const meta = row.metadata as { summary?: unknown } | null | undefined
	const summary = typeof meta?.summary === "string" ? meta.summary.trim() : ""
	const source = summary || (typeof row.content === "string" ? row.content : "")
	const first = source.split("\n").map((l) => l.trim()).find(Boolean) ?? ""
	// A heading's or a list's marks are not words.
	const bare = first.replace(/^(#{1,6}\s+|[-*]\s+|>\s+)/, "").replace(/\*\*|__/g, "")
	return bare.length > 160 ? `${bare.slice(0, 159)}…` : bare
}

/**
 * 🚧 A fold's body (PLAN-dc-after-walk2 Q3-2, the walk's N14): every line
 * AFTER its head, one result a line — the open fold repeated its head and
 * ran its lines together into one. Empty when the head is all there is.
 */
export function foldRestOf(row: { content?: unknown; metadata?: unknown }): string[] {
	const meta = row.metadata as { summary?: unknown } | null | undefined
	const lines = (typeof row.content === "string" ? row.content : "").split("\n").map((l) => l.trim()).filter(Boolean)
	const summary = typeof meta?.summary === "string" ? meta.summary.trim() : ""
	// A summary heads the fold apart from the lines: every line is the body.
	return summary ? lines : lines.slice(1)
}

/**
 * 🚧 The `rowKinds` setting, read: the kinds ticked (a list), trimmed and
 * lower-cased; none is every line. ⏳ A copy stored as one comma-separated
 * string (before 2026-10-18) reads the same.
 */
export function rowKindsOf(raw: unknown): string[] {
	const listed = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : typeof raw === "string" ? raw.split(",") : []
	return listed.map((k) => k.trim().toLowerCase()).filter(Boolean)
}

/** A row's kind (`metadata.kind` — a journal's `did`, `found`, `met`, …), or `null`. */
export function rowKindOf(row: { metadata?: unknown }): string | null {
	const k = (row.metadata as { kind?: unknown } | null | undefined)?.kind
	return typeof k === "string" && k.trim() ? k.trim().toLowerCase() : null
}

/**
 * The round a row belongs to: the Narrator's row every journal line of that
 * round is anchored to (`metadata.anchorMessageId`, what the ledger writes),
 * else a `metadata.round` a genre may spell; or `null`.
 */
function roundOf(row: { metadata?: unknown }): string | null {
	const m = row.metadata as { round?: unknown; anchorMessageId?: unknown } | null | undefined
	const a = m?.anchorMessageId
	if (typeof a === "number" || (typeof a === "string" && a)) return `anchor:${String(a)}`
	const r = m?.round
	return typeof r === "number" || (typeof r === "string" && r) ? String(r) : null
}

/**
 * 🚧 A folio copy's rows by kind (PLAN-sheet-widget §16): `kinds` keeps the
 * rows whose kind it names — a row with no kind always shows — and a
 * round's rows (anchored to one Narrator row, `metadata.anchorMessageId`) are drawn together under its `did` row,
 * the other kinds after it as small lines. A round with no `did` row keeps
 * its rows where the first of them was. No kind anywhere: `rows`, untouched.
 */
export function rowsByKind<T extends { id: number; metadata?: unknown }>(rows: readonly T[], kinds: readonly string[]): T[] {
	const kept = kinds.length
		? rows.filter((r) => {
				const k = rowKindOf(r)
				return k === null || kinds.includes(k)
			})
		: rows.slice()
	if (!kept.some((r) => rowKindOf(r) !== null && roundOf(r) !== null)) return kept as T[]
	const byRound = new Map<string, T[]>()
	for (const r of kept) {
		const round = rowKindOf(r) !== null ? roundOf(r) : null
		if (round === null) continue
		const list = byRound.get(round)
		if (list) list.push(r)
		else byRound.set(round, [r])
	}
	const placed = new Set<string>()
	const out: T[] = []
	for (const r of kept) {
		const round = rowKindOf(r) !== null ? roundOf(r) : null
		if (round === null) {
			out.push(r)
			continue
		}
		const list = byRound.get(round)!
		const head = list.find((x) => rowKindOf(x) === "did")
		// The round is drawn where its `did` row stands (or its first row, with none).
		if (placed.has(round) || (head && r !== head)) continue
		placed.add(round)
		const rest = list.filter((x) => x !== head).sort((a, b) => a.id - b.id)
		if (head) out.push(head)
		out.push(...rest)
	}
	return out
}
