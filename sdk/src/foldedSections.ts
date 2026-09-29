/**
 * Folded sections (B4; decision D5, 2026-09-27) — the checks a host makes on
 * the message outlets' `sections` in-port, the one reading of where a row keeps
 * them, and the one `core:section` part each becomes. Pure: the host's write,
 * its projection to parts and a widget's fallback all read through here, so
 * there is one answer to "which sections does this alternative carry".
 *
 * Where a row keeps them: `metadata.sections` while the row has no
 * alternatives; `metadata.swipes.sectionsHistory`, parallel to `history`, once
 * a write gives one of them sections. Until that array exists the first
 * alternative's sections are the row's `sections` — the ones it had before
 * anybody swiped.
 * @experimental
 */
import type { FoldedSectionPartDataV1, FoldedSectionV1 } from './widgets.js'

/**
 * How many folded sections one reply may carry. Bounded because they are laid
 * out in the host's own part slots, between a narrator's instructions and the
 * reply's reasoning and body. @experimental
 */
export const MAX_FOLDED_SECTIONS = 6

/** A folded section's `kind`: a lowercase slug. @experimental */
export const FOLDED_SECTION_KIND = /^[a-z][a-z0-9-]*$/

/**
 * Check a `sections` value and return it normalized, or the reason it is
 * refused (1-based position, the field, what is wrong). `undefined`/`null` is
 * "none given". A section with nothing to show — blank text, an empty list —
 * is left out rather than refused: a formatter that found nothing is an
 * ordinary state.
 * @experimental
 */
export function checkFoldedSections(
	value: unknown,
): { sections?: FoldedSectionV1[]; refusal?: string } {
	if (value === undefined || value === null) return {}
	if (!Array.isArray(value)) return { refusal: 'sections must be a list of { kind, label, content | items }' }
	if (value.length > MAX_FOLDED_SECTIONS)
		return { refusal: `a reply carries at most ${MAX_FOLDED_SECTIONS} sections — this has ${value.length}` }
	const sections: FoldedSectionV1[] = []
	for (let i = 0; i < value.length; i++) {
		const at = `section ${i + 1}`
		const s = value[i] as Record<string, unknown> | null
		if (!s || typeof s !== 'object' || Array.isArray(s)) return { refusal: `${at} is not an object` }
		if (typeof s.kind !== 'string' || !FOLDED_SECTION_KIND.test(s.kind))
			return { refusal: `${at} needs a kind: a lowercase slug such as 'plan'` }
		const label = typeof s.label === 'string' ? s.label.trim() : ''
		if (!label) return { refusal: `${at} needs a label: the heading its button shows` }
		const hasContent = s.content !== undefined && s.content !== null
		const hasItems = s.items !== undefined && s.items !== null
		if (hasContent === hasItems) return { refusal: `${at} needs exactly one of content and items` }
		if (hasContent) {
			if (typeof s.content !== 'string') return { refusal: `${at}'s content must be text` }
			if (s.content.trim()) sections.push({ kind: s.kind, label, content: s.content })
			continue
		}
		if (!Array.isArray(s.items) || !s.items.every((x) => typeof x === 'string'))
			return { refusal: `${at}'s items must be a list of text` }
		const items = (s.items as string[]).map((x) => x.trim()).filter(Boolean)
		if (items.length) sections.push({ kind: s.kind, label, items })
	}
	return { sections }
}

/** A stored value read back leniently: what `checkFoldedSections` would keep, or nothing. */
function stored(value: unknown): FoldedSectionV1[] {
	return checkFoldedSections(value).sections ?? []
}

/**
 * The folded sections alternative `slot` of a row carries, read from its
 * metadata. `slot` defaults to the alternative the row shows.
 * @experimental
 */
export function foldedSectionsOf(metadata: unknown, slot?: number): FoldedSectionV1[] {
	const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as {
		sections?: unknown
		swipes?: { currentIdx?: number | null; history?: unknown[]; sectionsHistory?: unknown[] }
	}
	const swipes = meta.swipes
	if (!swipes || !Array.isArray(swipes.history) || !swipes.history.length) return stored(meta.sections)
	const i = slot ?? swipes.currentIdx ?? 0
	if (Array.isArray(swipes.sectionsHistory)) return stored(swipes.sectionsHistory[i])
	return i === 0 ? stored(meta.sections) : []
}

/**
 * Metadata with the SHOWN alternative's folded sections replaced by
 * `sections` — whole, so an empty list clears them. Every other alternative
 * keeps its own. Returns a new object; the input is not touched.
 * @experimental
 */
export function withFoldedSections<M extends object>(metadata: M | null | undefined, sections: FoldedSectionV1[]): M {
	const meta = { ...(metadata ?? {}) } as Record<string, unknown>
	const swipes = meta.swipes as
		| { currentIdx?: number | null; history?: unknown[]; sectionsHistory?: unknown[] }
		| undefined
	const value = sections.length ? sections : null
	if (!swipes || !Array.isArray(swipes.history) || !swipes.history.length) {
		if (value) meta.sections = value
		else delete meta.sections
		return meta as M
	}
	const length = swipes.history.length
	const history: (FoldedSectionV1[] | null)[] = Array.isArray(swipes.sectionsHistory)
		? swipes.sectionsHistory.map((s) => (stored(s).length ? stored(s) : null))
		: [stored(meta.sections).length ? stored(meta.sections) : null]
	while (history.length < length) history.push(null)
	history.length = length
	const idx = Math.max(0, Math.min(swipes.currentIdx ?? 0, length - 1))
	history[idx] = value
	meta.swipes = { ...swipes, sectionsHistory: history }
	return meta as M
}

/**
 * One folded section as the `core:section` part it is stored as: `content` is
 * its text, or its items as a markdown bullet list (what a renderer that knows
 * nothing of `items` shows); `data` is {@link FoldedSectionPartDataV1}.
 * @experimental
 */
export function foldedSectionPart(section: FoldedSectionV1): {
	type: 'core:section'
	content: string
	data: FoldedSectionPartDataV1
} {
	const items = section.items
	return {
		type: 'core:section',
		content: items ? items.map((x) => `- ${x}`).join('\n') : (section.content ?? ''),
		data: { title: section.label, kind: section.kind, ...(items ? { items: [...items] } : {}) },
	}
}

/**
 * The readable lines a document's lists make — what `core:task/list-section@1`
 * folds into one section's `items` (lair pass B5, decision D5, 2026-09-27).
 *
 * `path` names the keys to read, comma-separated and in order (`'beats,speakers'`);
 * empty reads the document itself. A list contributes one line per entry and
 * anything else one line: a string is itself, a number or a boolean its text,
 * and an object its own scalar values joined with ` — ` in key order, so a
 * planner's `{ name, intent }` reads "Mara — check the door" and never as JSON.
 * Nested lists and objects inside an entry are left out rather than printed.
 * Blank lines are dropped, so a document with nothing to say makes no lines.
 * @experimental
 */
export function sectionItemsOf(document: unknown, path = ''): string[] {
	const keys = path
		.split(',')
		.map((k) => k.trim())
		.filter(Boolean)
	const sources: unknown[] = keys.length
		? keys.map((k) =>
				document && typeof document === 'object' && !Array.isArray(document)
					? (document as Record<string, unknown>)[k]
					: undefined,
			)
		: [document]
	const lines: string[] = []
	for (const source of sources)
		for (const entry of Array.isArray(source) ? source : [source]) {
			const line = lineOf(entry)
			if (line) lines.push(line)
		}
	return lines
}

/** One entry as one readable line, or '' when it has nothing scalar to show. */
function lineOf(entry: unknown): string {
	if (typeof entry === 'string') return entry.trim()
	if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry)
	if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
	return Object.values(entry as Record<string, unknown>)
		.map((v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''))
		.filter(Boolean)
		.join(' — ')
}
