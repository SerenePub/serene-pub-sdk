/**
 * Card strokes — a character's description and personality as an ordered list
 * of small pieces of prose ("a card is painted in strokes").
 *
 * ⏸ Paused 2026-10-11 (owner): no core spec places this step and the app hides strokes behind `STROKES_ENABLED`; kept so stored documents and the registry hash stay stable.
 *
 * ## What a stroke is
 *
 * One piece of a card's prose: which field it belongs to (`kind`), an optional
 * `label` a person reads ("Eyes"), an optional `slug` a template addresses it
 * by (`character.strokes.eyes`), the `text`, and **one** condition — `when`.
 * Array order is position. A card with no strokes is the legacy shape and its
 * prose columns are the truth; a card with strokes has its `description` and
 * `personality` compiled from them (`compileStrokes`), so every existing
 * template, embedding and export keeps reading four plain fields.
 *
 * ## What a stroke is NOT
 *
 *  · **Not a lorebook entry.** A stroke lives on the card and leaves with it; it
 *    has no priority, no weight, no budget, no ranker. A keyword stroke is
 *    marked `fired` or not against the recent transcript (`resolveStrokes`, run
 *    by `core:task/card-strokes@1`) and that is the whole of its life — it never
 *    competes with lore for room, and nothing here ranks one stroke over another.
 *  · **Not a matcher.** The SDK never matches keywords. The host owns the one
 *    keyword matcher (match modes, the regex time limit, the refused-pattern
 *    check) and hands it to `resolveStrokes`; the shape here is what it is
 *    asked about.
 *  · **Not an import transform.** Nothing explodes a card's prose into strokes
 *    behind a person's back: `splitIntoStrokes` is the explicit "Split into
 *    strokes" action, previewed before anything is saved.
 *
 * `when` is the only condition language. A fourth mode (a predicate over
 * state) is planned under `when`; the shape does not block it.
 */

// ── The shape ───────────────────────────────────────────────────────────────

/** Which card field a stroke paints. Closed for now. @experimental */
export type StrokeKind = 'description' | 'personality'

/** @experimental */
export const STROKE_KINDS: readonly StrokeKind[] = Object.freeze(['description', 'personality'] as const)

/** How a keyword stroke's keys are compared — the lore matcher's three modes. @experimental */
export type StrokeMatchMode = 'substring' | 'word' | 'regex'

/** @experimental */
export const STROKE_MATCH_MODES: readonly StrokeMatchMode[] = Object.freeze([
	'substring',
	'word',
	'regex',
] as const)

/**
 * A keyword stroke's condition: in the prompt only when one of `keys` appears
 * in the recent transcript. `matchMode` and `caseSensitive` mean what they mean
 * on a lorebook entry, because the host answers both with the same matcher.
 * @experimental
 */
export interface StrokeKeywordsWhen {
	mode: 'keywords'
	keys: string[]
	matchMode?: StrokeMatchMode
	caseSensitive?: boolean
}

/**
 * When a stroke is in the prompt.
 *
 *  - `always` — every turn.
 *  - `off` — never; kept on the card, compiled nowhere.
 *  - `keywords` — when a key appears in the recent transcript. Before any
 *    step resolved it, it is IN (the fallback loses nothing, only budget).
 * @experimental
 */
export type StrokeWhen = { mode: 'always' } | { mode: 'off' } | StrokeKeywordsWhen

/** @experimental */
export interface Stroke {
	kind: StrokeKind
	/**
	 * The data key a template addresses the stroke by. Author-owned, unique per
	 * card, `^[a-z0-9][a-z0-9-]{0,63}$`. The slug is the key; `label` is what a
	 * person reads.
	 */
	slug?: string
	/** "Eyes" — compiles as `Eyes: green`. Absent, the bare text. */
	label?: string
	text: string
	when: StrokeWhen
}

/**
 * A stroke after `core:task/card-strokes@1` ran: `fired` stamped. `always` is
 * fired, `off` never is, a keyword stroke is whatever the matcher said.
 * @experimental
 */
export type ResolvedStroke = Stroke & { fired: boolean }

/** The caps a card's strokes are held to, at save and at import. @experimental */
export const STROKE_LIMITS = Object.freeze({
	maxStrokes: 200,
	maxTextChars: 4000,
	maxKeys: 32,
	maxKeyChars: 120,
	maxLabelChars: 80,
} as const)

/** A stroke slug — the attributes rule: lower-case, digits and dashes, 64 at most. @experimental */
export const STROKE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/

// ── Compile ─────────────────────────────────────────────────────────────────

/** `Label: text`, or the bare text. Empty after trimming is nothing. */
const pieceOf = (s: Stroke): { text: string; labelled: boolean } | null => {
	const text = typeof s.text === 'string' ? s.text.trim() : ''
	if (!text) return null
	const label = typeof s.label === 'string' ? s.label.trim() : ''
	return label ? { text: `${label}: ${text}`, labelled: true } : { text, labelled: false }
}

/** @experimental */
export interface CompileStrokesOptions {
	/**
	 * Keyword strokes compile only when `fired` is true — the shape after
	 * `core:task/card-strokes@1` ran. Absent, every enabled stroke compiles,
	 * keyword ones included: the cached column and the no-step fallback.
	 */
	firedOnly?: boolean
}

/**
 * One card field compiled from its strokes — the ONE join rule.
 *
 * A labelled stroke is `Label: text`, an unlabelled one its bare text.
 * Description strokes are joined by a blank line. Personality strokes are
 * joined by `; ` when any compiled one has a label (PList-shaped), else by a
 * newline. `off` strokes never compile. `null` when nothing does — the card
 * then has no such field, which is what `compileCharacter` already does with
 * an empty one.
 * @experimental
 */
export function compileStrokes(
	strokes: readonly (Stroke | ResolvedStroke)[] | null | undefined,
	kind: StrokeKind,
	opts: CompileStrokesOptions = {},
): string | null {
	if (!Array.isArray(strokes)) return null
	const pieces: { text: string; labelled: boolean }[] = []
	for (const s of strokes) {
		if (!s || s.kind !== kind) continue
		const mode = s.when?.mode
		if (mode === 'off') continue
		if (mode === 'keywords' && opts.firedOnly && (s as Partial<ResolvedStroke>).fired !== true) continue
		const piece = pieceOf(s)
		if (piece) pieces.push(piece)
	}
	if (!pieces.length) return null
	const sep =
		kind === 'description' ? '\n\n' : pieces.some((p) => p.labelled) ? '; ' : '\n'
	return pieces.map((p) => p.text).join(sep)
}

// ── Resolve ─────────────────────────────────────────────────────────────────

/**
 * Asked once per keyword stroke: does this condition hold against the recent
 * transcript? Supplied by the host, which owns the one keyword matcher and its
 * regex time limit. The SDK never matches.
 * @experimental
 */
export type StrokeMatcher = (when: StrokeKeywordsWhen) => boolean

/**
 * Stamp `fired` on every stroke — what `core:task/card-strokes@1` does to each
 * card in the cast. Order is kept, nothing is dropped, nothing is ranked:
 * `always` → true, `off` → false, `keywords` → the matcher's answer. A matcher
 * that throws leaves that stroke unfired rather than failing the turn.
 * @experimental
 */
export function resolveStrokes(
	strokes: readonly Stroke[] | null | undefined,
	matcher: StrokeMatcher,
): ResolvedStroke[] {
	if (!Array.isArray(strokes)) return []
	return strokes.map((s) => {
		const when = s.when
		let fired: boolean
		if (when?.mode === 'always') fired = true
		else if (when?.mode === 'keywords') {
			try {
				fired = when.keys.length > 0 && matcher(when) === true
			} catch {
				fired = false
			}
		} else fired = false
		return { ...s, fired }
	})
}

// ── Validate ────────────────────────────────────────────────────────────────

/** One thing wrong with a card's strokes. @experimental */
export interface StrokeFinding {
	/** e.g. `strokes[3].when.keys[0]` */
	path: string
	message: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)

/**
 * A card's strokes against the shape and `STROKE_LIMITS`. Empty means fine.
 *
 * ⚠ A `regex` key is not compiled here: whether a pattern is refused is the
 * host matcher's call (the same check a lorebook entry's key gets at save).
 * @experimental
 */
export function validateStrokes(strokes: unknown): StrokeFinding[] {
	const out: StrokeFinding[] = []
	if (!Array.isArray(strokes)) return [{ path: 'strokes', message: 'strokes are a list' }]
	const L = STROKE_LIMITS
	if (strokes.length > L.maxStrokes)
		out.push({
			path: 'strokes',
			message: `a card holds at most ${L.maxStrokes} strokes; this one has ${strokes.length}`,
		})
	const slugs = new Map<string, number>()
	strokes.forEach((s, i) => {
		const at = `strokes[${i}]`
		if (!isObj(s)) {
			out.push({ path: at, message: 'a stroke is an object' })
			return
		}
		if (!STROKE_KINDS.includes(s.kind as StrokeKind))
			out.push({ path: `${at}.kind`, message: `kind is one of ${STROKE_KINDS.join(', ')}` })
		if (s.slug !== undefined) {
			if (typeof s.slug !== 'string' || !STROKE_SLUG.test(s.slug))
				out.push({
					path: `${at}.slug`,
					message: 'a slug is lower-case letters, digits and dashes, starting with a letter or digit, 64 at most',
				})
			else if (slugs.has(s.slug))
				out.push({
					path: `${at}.slug`,
					message: `slug '${s.slug}' is already used by strokes[${slugs.get(s.slug)}] — a slug is unique per card`,
				})
			else slugs.set(s.slug, i)
		}
		if (s.label !== undefined) {
			if (typeof s.label !== 'string') out.push({ path: `${at}.label`, message: 'a label is text' })
			else if (s.label.length > L.maxLabelChars)
				out.push({ path: `${at}.label`, message: `a label is at most ${L.maxLabelChars} characters` })
		}
		if (typeof s.text !== 'string' || !s.text.trim())
			out.push({ path: `${at}.text`, message: 'a stroke needs text' })
		else if (s.text.length > L.maxTextChars)
			out.push({
				path: `${at}.text`,
				message: `a stroke is at most ${L.maxTextChars} characters; this one has ${s.text.length}`,
			})
		const when = s.when
		if (!isObj(when)) {
			out.push({ path: `${at}.when`, message: "when is { mode: 'always' | 'off' | 'keywords' }" })
			return
		}
		if (when.mode === 'always' || when.mode === 'off') return
		if (when.mode !== 'keywords') {
			out.push({ path: `${at}.when.mode`, message: "mode is 'always', 'off' or 'keywords'" })
			return
		}
		if (!Array.isArray(when.keys) || when.keys.length === 0)
			out.push({ path: `${at}.when.keys`, message: 'a keyword stroke needs at least one key' })
		else {
			if (when.keys.length > L.maxKeys)
				out.push({ path: `${at}.when.keys`, message: `a stroke has at most ${L.maxKeys} keys` })
			when.keys.forEach((k, j) => {
				if (typeof k !== 'string' || !k.trim())
					out.push({ path: `${at}.when.keys[${j}]`, message: 'a key is non-empty text' })
				else if (k.length > L.maxKeyChars)
					out.push({ path: `${at}.when.keys[${j}]`, message: `a key is at most ${L.maxKeyChars} characters` })
			})
		}
		if (when.matchMode !== undefined && !STROKE_MATCH_MODES.includes(when.matchMode as StrokeMatchMode))
			out.push({ path: `${at}.when.matchMode`, message: `matchMode is one of ${STROKE_MATCH_MODES.join(', ')}` })
		if (when.caseSensitive !== undefined && typeof when.caseSensitive !== 'boolean')
			out.push({ path: `${at}.when.caseSensitive`, message: 'caseSensitive is true or false' })
	})
	return out
}

// ── Split ───────────────────────────────────────────────────────────────────

/**
 * A slug from a label: lower-cased, accents dropped, everything else a dash,
 * 64 at most. `'stroke'` when nothing survives — a label of punctuation still
 * needs a key.
 * @experimental
 */
export function strokeSlugFor(label: string): string {
	const s = String(label ?? '')
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 64)
		.replace(/-+$/g, '')
	return s || 'stroke'
}

/** How "Split into strokes" cuts a field. @experimental */
export type StrokeSplitBy = 'paragraph' | 'sentence' | 'plist'

const paragraphsOf = (text: string): string[] =>
	text
		.split(/\r?\n[ \t]*\r?\n/)
		.map((p) => p.trim())
		.filter(Boolean)

/** Sentences end at `.`, `!`, `?` or `…` (closing quotes and brackets kept), or at a line break. */
const sentencesOf = (text: string): string[] =>
	text
		.split(/\r?\n/)
		.flatMap((line) => line.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)|[.!?…]+/g) ?? [])
		.map((s) => s.trim())
		.filter(Boolean)

/** `Key: value` — a label is a short run with no sentence punctuation before the first colon. */
const PLIST_PAIR = /^([^:.!?\n]{1,80}?)\s*:\s*([\s\S]+)$/

/**
 * Cut one field's prose into strokes — the explicit "Split into strokes"
 * action. Every stroke comes back `always`, in order.
 *
 *  - `paragraph` — on blank lines.
 *  - `sentence` — on sentence ends and line breaks.
 *  - `plist` — `[Key: value; Key2: value]` and `Key: value;` segments, split
 *    on `;`, line breaks and brackets. A segment with a key becomes a labelled
 *    stroke with a slug from the label (deduplicated `-2`, `-3`…); one
 *    without stays a bare stroke.
 *
 * Pure: the form previews the result and nothing is saved until a person
 * saves it.
 * @experimental
 */
export function splitIntoStrokes(text: string, kind: StrokeKind, by: StrokeSplitBy): Stroke[] {
	const src = typeof text === 'string' ? text : ''
	if (by === 'paragraph') return paragraphsOf(src).map((t): Stroke => ({ kind, text: t, when: { mode: 'always' } }))
	if (by === 'sentence') return sentencesOf(src).map((t): Stroke => ({ kind, text: t, when: { mode: 'always' } }))
	const used = new Set<string>()
	const out: Stroke[] = []
	for (const raw of src.split(/[;\n[\]]/)) {
		const seg = raw.trim()
		if (!seg) continue
		const m = PLIST_PAIR.exec(seg)
		const label = m?.[1]?.trim()
		const value = m?.[2]?.trim()
		if (!label || !value) {
			out.push({ kind, text: seg, when: { mode: 'always' } })
			continue
		}
		const base = strokeSlugFor(label)
		let slug = base
		for (let n = 2; used.has(slug); n++) {
			const suffix = `-${n}`
			slug = `${base.slice(0, 64 - suffix.length).replace(/-+$/, '')}${suffix}`
		}
		used.add(slug)
		out.push({ kind, slug, label, text: value, when: { mode: 'always' } })
	}
	return out
}
