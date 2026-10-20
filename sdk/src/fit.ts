/**
 * 🚧 **Ruleset ↔ genre fit** (PLAN-genre-restructure §11, ruled 2026-10-19):
 * a verbal rating — Incompatible · Poor · Ok · Good · Great · Perfect — from
 * a cross-examination of what a genre **uses** (`GenreDecl.uses`) against
 * what a ruleset **provides** (derived from its declaration: slots, verbs,
 * repertoires, dice, conditions, casting). Computed over declared keys, never
 * over "dice": a diceless ruleset provides the same verbs resolved another
 * way. Optional genre uses never count toward the rating; they appear in the
 * audit only. The reverse direction — what the ruleset has that the genre
 * never exercises — is the same function's `unused`, shown neutrally.
 *
 * No model call: everything here is static declaration data.
 * @experimental
 */
import type { GenreDecl } from './genres.js'
import type { RulesetDecl } from './rulesets.js'

/** The six ratings, worst first. @experimental */
export const RULESET_RATINGS = ['incompatible', 'poor', 'ok', 'good', 'great', 'perfect'] as const
/** @experimental */
export type RulesetRating = (typeof RULESET_RATINGS)[number]

/** The picker's groups (ruled 2026-10-19): [Incompatible] · [Poor] · [Ok, Good] · [Great, Perfect]. @experimental */
export const RULESET_RATING_GROUPS: ReadonlyArray<readonly RulesetRating[]> = Object.freeze([
	Object.freeze(['incompatible'] as const),
	Object.freeze(['poor'] as const),
	Object.freeze(['ok', 'good'] as const),
	Object.freeze(['great', 'perfect'] as const),
])

/** The rating word as the card prints it. @experimental */
export const RULESET_RATING_TEXT: Readonly<Record<RulesetRating, string>> = Object.freeze({
	incompatible: 'Incompatible',
	poor: 'Poor',
	ok: 'Ok',
	good: 'Good',
	great: 'Great',
	perfect: 'Perfect',
})

/** The index of a rating's picker group, 0 = Incompatible. @experimental */
export const ratingGroupOf = (r: RulesetRating): number =>
	RULESET_RATING_GROUPS.findIndex((g) => (g as readonly string[]).includes(r))

/**
 * What a genre (or one of its presets) uses of a ruleset. `verbs: 'any'` is
 * an **open** grammar: the genre's after-turn call takes whatever verbs the
 * ruleset provides (the Story genre). A list is a **closed** grammar: the
 * genre's scripts emit exactly these (the Dungeon Crawler). `optional` lists
 * what the genre can use but does without; it never counts toward the rating.
 * @experimental
 */
export interface GenreUses {
	readonly verbs: readonly string[] | 'any'
	/** Sheet slots the genre reads — `hp`, `conditions`, `pieces` … (bare slot names or full ids). */
	readonly slots?: readonly string[]
	/** Repertoires the genre hands pieces out of — `weapons`, `traps`, `ways` … */
	readonly pieces?: readonly string[]
	readonly conditions?: boolean
	readonly casting?: boolean
	/** Whether the genre reads dice results (the fold). `optional` means the fold prints whatever change lines come. */
	readonly dice?: 'required' | 'optional'
	readonly optional?: {
		readonly verbs?: readonly string[]
		readonly slots?: readonly string[]
		readonly pieces?: readonly string[]
		readonly conditions?: boolean
		readonly casting?: boolean
	}
}

/** What a ruleset provides, derived from its declaration. @experimental */
export interface RulesetProvides {
	readonly verbs: ReadonlySet<string>
	readonly slots: ReadonlySet<string>
	readonly pieces: ReadonlySet<string>
	readonly conditions: boolean
	readonly casting: boolean
	readonly dice: boolean
	/** Verbs the ruleset resolves by script (free) rather than by words. */
	readonly scripted: ReadonlySet<string>
}

const bare = (id: string): string => {
	const m = /^[^:]+:[a-z-]+\/([a-z0-9-]+)(?:@\d+)?$/.exec(id)
	return m ? m[1]! : id
}

/** Walk a declaration for every `{ verb: '…' }` it carries, at any depth. */
function verbsIn(v: unknown, out: Set<string>, depth = 0): void {
	if (!v || typeof v !== 'object' || depth > 12) return
	if (Array.isArray(v)) return void v.forEach((x) => verbsIn(x, out, depth + 1))
	const o = v as Record<string, unknown>
	if (typeof o.verb === 'string') out.add(o.verb)
	for (const x of Object.values(o)) verbsIn(x, out, depth + 1)
}

/** @experimental */
export function rulesetProvides(decl: RulesetDecl | null | undefined): RulesetProvides {
	const verbs = new Set<string>()
	const slots = new Set<string>()
	const pieces = new Set<string>()
	const scripted = new Set<string>()
	let conditions = false
	let casting = false
	if (!decl) return { verbs, slots, pieces, conditions, casting, dice: false, scripted }
	const d = decl as unknown as Record<string, unknown>
	for (const s of (d.stats as readonly { id?: string }[] | undefined) ?? []) if (s?.id) slots.add(bare(s.id))
	for (const r of (d.repertoires as readonly Record<string, unknown>[] | undefined) ?? []) {
		if (typeof r?.id === 'string') {
			pieces.add(r.id)
			if (/condition/i.test(r.id)) conditions = true
			if (/spell|casting|cantrip/i.test(r.id)) casting = true
		}
		verbsIn(r, verbs)
	}
	verbsIn(d.conventions, verbs)
	if (slots.has('conditions') || slots.has('crawl-conditions')) conditions = true
	if (slots.has('spell-slots') || slots.has('spell-points') || slots.has('casting')) casting = true
	for (const s of (d.scripts as readonly { verb?: string; verbs?: readonly string[] }[] | undefined) ?? []) {
		if (s?.verb) scripted.add(s.verb)
		for (const v of s?.verbs ?? []) scripted.add(v)
	}
	const conv = d.conventions as { dice?: unknown } | undefined
	return { verbs, slots, pieces, conditions, casting, dice: !!conv?.dice, scripted }
}

/** One examined use and how it was met. @experimental */
export interface FitRow {
	readonly kind: 'verb' | 'slot' | 'piece' | 'conditions' | 'casting' | 'dice'
	readonly key: string
	readonly required: boolean
	readonly met: 'native' | 'words' | 'missing'
}

/** @experimental */
export interface RulesetFit {
	readonly rating: RulesetRating
	readonly group: number
	/** One sentence for the picker's reason line. */
	readonly reason: string
	readonly rows: readonly FitRow[]
	/** What the ruleset provides that the genre never exercises — shown neutrally, never a penalty. */
	readonly unused: readonly string[]
}

const PROSE_FALLBACK_VERBS: ReadonlySet<string> = new Set(['modify', 'set', 'adjustDegree', 'harm', 'heal', 'cure', 'consume'])

/**
 * Cross-examine a genre's uses against a ruleset's provides.
 *
 * Over **required** uses only (ruled 2026-10-19):
 *  · Perfect — every use met natively and nothing the ruleset provides goes unused (★N: Perfect = all native; extras never lower it)
 *  · Great   — every use met natively
 *  · Good    — every use met, at least one by words where the ruleset has no script
 *  · Ok      — every use met, more than one by words
 *  · Poor    — more than half of the uses by words
 *  · Incompatible — any use missing with no words fallback
 * A genre with no `uses` fits every ruleset Great (it asks for nothing).
 * @experimental
 */
export function rulesetFit(genre: Pick<GenreDecl, 'uses'> | null | undefined, ruleset: RulesetDecl | null | undefined): RulesetFit {
	const uses = genre?.uses
	const p = rulesetProvides(ruleset)
	const rows: FitRow[] = []
	const slotMet = (k: string) => p.slots.has(bare(k))
	const verbMet = (k: string): FitRow['met'] =>
		p.verbs.has(k) ? 'native' : PROSE_FALLBACK_VERBS.has(k) ? 'words' : 'missing'
	if (uses) {
		if (uses.verbs !== 'any') for (const v of uses.verbs) rows.push({ kind: 'verb', key: v, required: true, met: verbMet(v) })
		for (const s of uses.slots ?? []) rows.push({ kind: 'slot', key: bare(s), required: true, met: slotMet(s) ? 'native' : 'missing' })
		for (const r of uses.pieces ?? []) rows.push({ kind: 'piece', key: r, required: true, met: p.pieces.has(r) ? 'native' : 'words' })
		if (uses.conditions) rows.push({ kind: 'conditions', key: 'conditions', required: true, met: p.conditions ? 'native' : 'words' })
		if (uses.casting) rows.push({ kind: 'casting', key: 'casting', required: true, met: p.casting ? 'native' : 'missing' })
		if (uses.dice === 'required') rows.push({ kind: 'dice', key: 'dice', required: true, met: p.dice ? 'native' : 'missing' })
		const o = uses.optional
		for (const v of o?.verbs ?? []) rows.push({ kind: 'verb', key: v, required: false, met: verbMet(v) })
		for (const s of o?.slots ?? []) rows.push({ kind: 'slot', key: bare(s), required: false, met: slotMet(s) ? 'native' : 'missing' })
		for (const r of o?.pieces ?? []) rows.push({ kind: 'piece', key: r, required: false, met: p.pieces.has(r) ? 'native' : 'words' })
		if (o?.conditions) rows.push({ kind: 'conditions', key: 'conditions', required: false, met: p.conditions ? 'native' : 'words' })
		if (o?.casting) rows.push({ kind: 'casting', key: 'casting', required: false, met: p.casting ? 'native' : 'missing' })
	}
	const required = rows.filter((r) => r.required)
	const missing = required.filter((r) => r.met === 'missing')
	const words = required.filter((r) => r.met === 'words')
	const usedKeys = new Set(rows.map((r) => r.key))
	const unused = [
		...[...p.pieces].filter((k) => !usedKeys.has(k) && !(uses?.verbs === 'any')),
		...(p.casting && !usedKeys.has('casting') ? ['casting'] : []),
		...(p.conditions && !usedKeys.has('conditions') ? ['conditions'] : []),
	]
	let rating: RulesetRating
	if (missing.length) rating = 'incompatible'
	else if (required.length && words.length * 2 > required.length) rating = 'poor'
	else if (words.length > 1) rating = 'ok'
	else if (words.length === 1) rating = 'good'
	else rating = 'perfect'
	if (rating === 'perfect' && !uses) rating = 'great'
	const name = (r: FitRow) => (r.kind === 'verb' ? `the ${r.key} verb` : r.kind === 'slot' ? `a ${r.key} slot` : r.key)
	const reason =
		rating === 'incompatible'
			? `missing ${missing.map(name).join(', ')} with no fallback`
			: rating === 'perfect'
				? required.length
					? `everything resolves by the rules`
					: `nothing required; fits as it is`
				: rating === 'great'
					? `this genre asks for nothing in particular`
					: `${words.map((r) => r.key).join(', ')} resolve${words.length === 1 ? 's' : ''} in words`
	return { rating, group: ratingGroupOf(rating), reason, rows, unused }
}

/** @experimental */
export function genreUsesFindings(raw: unknown, at = 'uses'): string[] {
	if (raw === undefined) return []
	const out: string[] = []
	if (!raw || typeof raw !== 'object') return [`${at} is { verbs, slots?, pieces?, conditions?, casting?, dice?, optional? }`]
	const u = raw as Record<string, unknown>
	const list = (v: unknown, k: string) => {
		if (v === undefined) return
		if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x)) out.push(`${at}.${k} is a list of names`)
	}
	if (u.verbs !== 'any') list(u.verbs, 'verbs')
	if (u.verbs === undefined) out.push(`${at}.verbs is a list of verbs or 'any'`)
	list(u.slots, 'slots')
	list(u.pieces, 'pieces')
	if (u.conditions !== undefined && typeof u.conditions !== 'boolean') out.push(`${at}.conditions is a boolean`)
	if (u.casting !== undefined && typeof u.casting !== 'boolean') out.push(`${at}.casting is a boolean`)
	if (u.dice !== undefined && u.dice !== 'required' && u.dice !== 'optional') out.push(`${at}.dice is 'required' or 'optional'`)
	if (u.optional !== undefined) {
		if (!u.optional || typeof u.optional !== 'object') out.push(`${at}.optional is { verbs?, slots?, pieces?, conditions?, casting? }`)
		else {
			const o = u.optional as Record<string, unknown>
			list(o.verbs, 'optional.verbs')
			list(o.slots, 'optional.slots')
			list(o.pieces, 'optional.pieces')
		}
	}
	return out
}
