/**
 * 🚧 **Ruleset ↔ genre fit** (PLAN-genre-restructure §11, ruled 2026-10-19):
 * a verbal rating — Incompatible · Poor · Ok · Good · Great · Perfect — from
 * a cross-examination of what a genre **uses** (`GenreDecl.uses`) against
 * what a ruleset **provides** (derived from its declaration: verbs, check
 * methods, and its attributes', entry types' and zone types' tags).
 *
 * 🚧 **Plays best with** (RF fix 8, owner ruling 2026-10-23: "genres can
 * expect certain attributes, shapes, zones … but we won't lock someone into
 * using their own conventions"): a genre names what it reads by **tag** — an
 * attribute (`health`, of a number kind), an entry type (`condition`), a zone
 * type (`inventory`) — each with a short label and the sentence the picker
 * says why. One the rules lack is played **in words**: it lowers the rating,
 * never makes the rules incompatible. A genre names no slot and no ruleset's
 * repertoire (`slots`, `pieces`: retired, refused). Computed over declared keys, never over
 * "dice": a diceless ruleset provides the same verbs resolved another way. Optional genre uses never count toward the rating; they appear in the
 * audit only. The reverse direction — what the ruleset has that the genre
 * never exercises — is the same function's `unused`, shown neutrally.
 *
 * No model call: everything here is static declaration data.
 * @experimental
 */
import type { GenreDecl } from './genres.js'
import { normaliseConventions, rulesetDecides, type RulesetDecl } from './rulesets.js'
import { checkMethodKind } from './checkMethods.js'
import { rulesetAttributeKinds, rulesetSections, rulesetZoneTypes } from './rulesetSections.js'
import { functionProvides } from './functions.js'

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
 * 🚧 One thing a genre **plays best with** (RF fix 8): what it reads, by
 * `tag` — an attribute's (or its id), an entry type's, a zone type's — with
 * the attribute kinds that fit (`kinds`, an attribute's only: a health that
 * is a word is not a health a hit can lower), a short `label` the picker
 * lists ("a health-like number") and `why` — the sentence it says ("Hits
 * hurt and rests heal by it; without one, harm is told in words.").
 * Member copy: never a word of the rules' machinery.
 * @experimental
 */
export interface UsesExpectation {
	readonly tag: string
	readonly kinds?: readonly string[]
	readonly label: string
	readonly why: string
}

/**
 * What a genre (or one of its presets) uses of a ruleset. `verbs: 'any'` is
 * an **open** grammar: the genre's after-turn call takes whatever verbs the
 * ruleset provides (the Story genre). A list is a **closed** grammar: the
 * genre's scripts emit exactly these (the Dungeon Crawler). 🚧 `attributes`,
 * `entryTypes` and `zoneTypes` (RF fix 8) are what it **plays best with**,
 * by tag: met by the rules or played in words, never a lock. `optional`
 * lists what the genre can use but does without; it never counts toward the
 * rating.
 * @experimental
 */
export interface GenreUses {
	readonly verbs: readonly string[] | 'any'
	/** 🚧 Attributes it plays best with, by tag (`health`, `mood`, `level`). */
	readonly attributes?: readonly UsesExpectation[]
	/** 🚧 Entry types it plays best with, by tag (`condition`, `weapon`, `class`). */
	readonly entryTypes?: readonly UsesExpectation[]
	/** 🚧 Zone types it plays best with, by tag (`inventory`). */
	readonly zoneTypes?: readonly UsesExpectation[]
	readonly conditions?: boolean
	readonly casting?: boolean
	/** Whether the genre reads dice results (the fold). `optional` means the fold prints whatever change lines come. */
	readonly dice?: 'required' | 'optional'
	readonly optional?: {
		readonly verbs?: readonly string[]
		readonly attributes?: readonly UsesExpectation[]
		readonly entryTypes?: readonly UsesExpectation[]
		readonly zoneTypes?: readonly UsesExpectation[]
		readonly conditions?: boolean
		readonly casting?: boolean
	}
}

/** What a ruleset provides, derived from its declaration. @experimental */
export interface RulesetProvides {
	readonly verbs: ReadonlySet<string>
	readonly slots: ReadonlySet<string>
	readonly pieces: ReadonlySet<string>
	/** A repertoire tagged `condition` (⏳ untagged: guessed from names). */
	readonly conditions: boolean
	/** A repertoire tagged `casting` (⏳ untagged: guessed from names). */
	readonly casting: boolean
	/** One of its check methods throws dice (`die-target`, `dice-pool`; the ⏳ `conventions.dice`). */
	readonly dice: boolean
	/** 🚧 One of its check methods is decided by chance — dice or cards (2026-10-22). */
	readonly chance: boolean
	/** 🚧 Its check methods' kinds, distinct, in declaration order (2026-10-22). */
	readonly methods: readonly string[]
	/** 🚧 Every repertoire tag it declares — or, untagged, the ones guessed from its repertoires' names. */
	readonly tags: ReadonlySet<string>
	/**
	 * 🚧 Whether its repertoires declare tags. `false`: `conditions`,
	 * `casting` and `tags` are guessed from names (⏳ — `rulesetWarnings`
	 * says `untagged-repertoires`).
	 */
	readonly tagged: boolean
	/** Verbs the ruleset resolves by script (free) rather than by words. */
	readonly scripted: ReadonlySet<string>
	/**
	 * 🚧 It decides something by its rules — a deciding function that decides
	 * (`rulesetDecides`, 2026-10-23): what _The rules decide_ waits on.
	 */
	readonly decides: boolean
	/**
	 * 🚧 Its attributes by tag (RF fix 8): each tag an attribute says — and
	 * each attribute's own id — with the attribute kinds found under it
	 * (`rulesetAttributeKinds`; empty where a kind cannot be read).
	 */
	readonly attributeTags: ReadonlyMap<string, ReadonlySet<string>>
	/** 🚧 Its zone types' tags (RF fix 8), the host's carried zone among them (`inventory`). */
	readonly zoneTags: ReadonlySet<string>
}

/** The ⏳ name guesses, one per repertoire tag core reads. */
const TAG_GUESSES: readonly (readonly [string, RegExp])[] = [
	['condition', /condition/i],
	['casting', /spell|casting|cantrip/i],
	['weapon', /weapon/i],
	['armour', /armou?r/i],
	['relationship', /relationship|bond/i],
	['resource', /resource|suppl(y|ies)/i],
	['exit', /exit|door/i],
	['note', /(^|-)notes?($|-)/i],
	['creature', /creature|monster|bestiary/i],
	['class', /(^|-)class(es)?($|-)/i],
]

/**
 * ⏳ The repertoire tags a repertoire's **name** suggests — the guess
 * `rulesetProvides` made before tags were declared (conditions by
 * `/condition/`, casting by `/spell|casting|cantrip/`), widened to every tag
 * core reads. What a ruleset with no tags is still read by, and what the
 * data upgrade writes once onto a stored ruleset's repertoires. Never a
 * substitute for declaring them.
 * @experimental
 */
export function guessRepertoireTags(repertoire: { readonly id: string }): string[] {
	const id = typeof repertoire?.id === 'string' ? repertoire.id : ''
	return TAG_GUESSES.filter(([, re]) => re.test(id)).map(([tag]) => tag)
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

/**
 * 🚧 What a ruleset provides, read through its sections (2026-10-23): its
 * attributes as slots, its entry types as pieces and their tags (⏳
 * guessed from names when none says them), the verbs its piece rules and
 * functions answer to, its ways to decide and their chance, and whether it
 * decides anything by its rules. A ruleset in the shape before the sections
 * reads exactly as it did.
 * @experimental
 */
export function rulesetProvides(decl: RulesetDecl | null | undefined): RulesetProvides {
	const verbs = new Set<string>()
	const slots = new Set<string>()
	const pieces = new Set<string>()
	const scripted = new Set<string>()
	const tags = new Set<string>()
	let conditions = false
	let casting = false
	const attributeTags = new Map<string, Set<string>>()
	const zoneTags = new Set<string>()
	if (!decl)
		return { verbs, slots, pieces, conditions, casting, dice: false, chance: false, methods: [], tags, tagged: false, scripted, decides: false, attributeTags, zoneTags }
	const d = decl as unknown as Record<string, unknown>
	const sec = rulesetSections(decl)
	// 🚧 Attributes as slots: the slot each names (⏳ a stat's), else its own name.
	if (d.attributes !== undefined) for (const a of sec.attributes ?? []) slots.add(a.slot ? bare(a.slot) : a.id)
	else for (const s of (d.stats as readonly { id?: string }[] | undefined) ?? []) if (s?.id) slots.add(bare(s.id))
	const types = sec.entryTypes ?? []
	// 🚧 Tags, declared (2026-10-22): once any entry type (⏳ repertoire) or
	// attribute says them, they are all that is read. ⏳ Untagged, the names are guessed as before.
	const tagged = types.some((r) => r?.tags !== undefined) || (d.attributes !== undefined && (sec.attributes ?? []).some((a) => a?.tags !== undefined))
	for (const r of types) {
		if (typeof r?.id === 'string') pieces.add(r.id)
		const own = tagged ? (Array.isArray(r?.tags) ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string') : []) : guessRepertoireTags(r as { id: string })
		for (const t of own) tags.add(t)
		verbsIn(r, verbs)
	}
	if (d.attributes !== undefined) for (const a of sec.attributes ?? []) for (const t of a.tags ?? []) tags.add(t)
	// 🚧 Attributes by tag (RF fix 8) — its id a tag of its own — with the kinds found under each.
	for (const a of sec.attributes ?? []) {
		const kinds = rulesetAttributeKinds(a) ?? []
		for (const t of new Set([a.id, ...(a.slot ? [bare(a.slot)] : []), ...(a.tags ?? [])])) {
			let k = attributeTags.get(t)
			if (!k) attributeTags.set(t, (k = new Set()))
			for (const kind of kinds) k.add(kind)
		}
	}
	for (const z of rulesetZoneTypes(decl)) for (const t of z.tags ?? []) zoneTags.add(t)
	verbsIn(d.conventions, verbs)
	conditions = tags.has('condition')
	casting = tags.has('casting')
	if (!tagged) {
		if (slots.has('conditions') || slots.has('crawl-conditions')) conditions = true
		if (slots.has('spell-slots') || slots.has('spell-points') || slots.has('casting')) casting = true
	}
	for (const s of (d.scripts as readonly { verb?: string; verbs?: readonly string[] }[] | undefined) ?? []) {
		if (s?.verb) scripted.add(s.verb)
		for (const v of s?.verbs ?? []) scripted.add(v)
	}
	// 🚧 Check methods (2026-10-22), the ⏳ `conventions.dice` read as one — and,
	// in sections, the deciding functions and what each function adds (2026-10-23).
	const kinds = [...new Set(Object.values(normaliseConventions(decl).conventions.methods).map((m) => String(m?.kind)))]
	let dice = kinds.some((k) => !!checkMethodKind(k)?.rollsDice)
	let chance = kinds.some((k) => !!checkMethodKind(k)?.chance)
	if (d.functions !== undefined)
		for (const f of sec.functions ?? []) {
			const p = functionProvides(f)
			for (const v of p.verbs) verbs.add(v)
			if (p.rollsDice) dice = true
			if (p.chance) chance = true
		}
	return { verbs, slots, pieces, conditions, casting, dice, chance, methods: kinds, tags, tagged, scripted, decides: rulesetDecides(decl), attributeTags, zoneTags }
}

/**
 * One examined use and how it was met. 🚧 `attribute` · `entry-type` ·
 * `zone-type` (RF fix 8) are what the genre plays best with, by tag (`key`),
 * with its `label` and `why`; one the rules lack is met in `words`.
 * @experimental
 */
export interface FitRow {
	readonly kind: 'verb' | 'attribute' | 'entry-type' | 'zone-type' | 'conditions' | 'casting' | 'dice'
	readonly key: string
	readonly required: boolean
	readonly met: 'native' | 'words' | 'missing'
	/** 🚧 What the picker lists for a plays-best-with row ("a health-like number"). */
	readonly label?: string
	/** 🚧 Why the genre plays best with it, as the picker says it. */
	readonly why?: string
}

/** @experimental */
export interface RulesetFit {
	readonly rating: RulesetRating
	readonly group: number
	/** One sentence for the picker's reason line. */
	readonly reason: string
	readonly rows: readonly FitRow[]
	/** 🚧 What the genre plays best with that these rules lack — each played in words (RF fix 8). */
	readonly inWords: readonly FitRow[]
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
	const uses = genre?.uses as GenreUses | undefined
	const p = rulesetProvides(ruleset)
	const rows: FitRow[] = []
	const verbMet = (k: string): FitRow['met'] =>
		p.verbs.has(k) ? 'native' : PROSE_FALLBACK_VERBS.has(k) ? 'words' : 'missing'
	// 🚧 Plays best with (RF fix 8): met by a tag the rules say (an attribute's of a fitting kind), else in words.
	const attributeMet = (e: UsesExpectation): FitRow['met'] => {
		const kinds = p.attributeTags.get(e.tag)
		if (!kinds) return 'words'
		return !e.kinds?.length || !kinds.size || e.kinds.some((k) => kinds.has(k)) ? 'native' : 'words'
	}
	const expect = (kind: 'attribute' | 'entry-type' | 'zone-type', e: UsesExpectation, required: boolean) =>
		rows.push({
			kind,
			key: e.tag,
			required,
			met: kind === 'attribute' ? attributeMet(e) : (kind === 'entry-type' ? p.tags : p.zoneTags).has(e.tag) ? 'native' : 'words',
			label: e.label,
			why: e.why,
		})
	if (uses) {
		if (uses.verbs !== 'any') for (const v of uses.verbs) rows.push({ kind: 'verb', key: v, required: true, met: verbMet(v) })
		for (const e of uses.attributes ?? []) expect('attribute', e, true)
		for (const e of uses.entryTypes ?? []) expect('entry-type', e, true)
		for (const e of uses.zoneTypes ?? []) expect('zone-type', e, true)
		if (uses.conditions) rows.push({ kind: 'conditions', key: 'conditions', required: true, met: p.conditions ? 'native' : 'words' })
		if (uses.casting) rows.push({ kind: 'casting', key: 'casting', required: true, met: p.casting ? 'native' : 'missing' })
		if (uses.dice === 'required') rows.push({ kind: 'dice', key: 'dice', required: true, met: p.dice ? 'native' : 'missing' })
		const o = uses.optional
		for (const v of o?.verbs ?? []) rows.push({ kind: 'verb', key: v, required: false, met: verbMet(v) })
		for (const e of o?.attributes ?? []) expect('attribute', e, false)
		for (const e of o?.entryTypes ?? []) expect('entry-type', e, false)
		for (const e of o?.zoneTypes ?? []) expect('zone-type', e, false)
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
	const name = (r: FitRow) => r.label ?? (r.kind === 'verb' ? `the ${r.key} verb` : r.key)
	const inWords = rows.filter((r) => r.met === 'words' && (r.kind === 'attribute' || r.kind === 'entry-type' || r.kind === 'zone-type'))
	const reason =
		rating === 'incompatible'
			? `missing ${missing.map(name).join(', ')} with no fallback`
			: rating === 'perfect'
				? required.length
					? `everything it plays best with is here`
					: `nothing required; fits as it is`
				: rating === 'great'
					? `this genre asks for nothing in particular`
					: `${words.map(name).join(', ')} — told in words`
	return { rating, group: ratingGroupOf(rating), reason, rows, unused, inWords }
}

/**
 * 🚧 What a genre **plays best with** (RF fix 8), as the picker lists it —
 * each expectation, required first, then optional (each label once): `plays
 * best with: a health-like number, a mood word, somewhere to keep what they
 * carry`. Empty for a genre that names none.
 * @experimental
 */
export function playsBestWith(genre: Pick<GenreDecl, 'uses'> | null | undefined): readonly UsesExpectation[] {
	const u = genre?.uses as GenreUses | undefined
	const o = u?.optional
	// Required and optional alike: both are what it plays best with; only the required count toward the rating.
	const all = [...(u?.attributes ?? []), ...(u?.entryTypes ?? []), ...(u?.zoneTypes ?? []), ...(o?.attributes ?? []), ...(o?.entryTypes ?? []), ...(o?.zoneTypes ?? [])]
	const seen = new Set<string>()
	return all.filter((e) => !seen.has(e.label) && !!seen.add(e.label))
}

/** 🚧 `plays best with: a, b and c` — the picker's line, or `''` for a genre that names none. @experimental */
export function playsBestWithLine(genre: Pick<GenreDecl, 'uses'> | null | undefined): string {
	const labels = playsBestWith(genre).map((e) => e.label)
	if (!labels.length) return ''
	const said = labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
	return `Plays best with ${said}.`
}

/** One plays-best-with list's problems (RF fix 8). */
function expectationFindings(v: unknown, at: string, kinds: boolean): string[] {
	if (v === undefined) return []
	if (!Array.isArray(v)) return [`${at} is a list of { tag, label, why${kinds ? ', kinds?' : ''} }`]
	const out: string[] = []
	v.forEach((e, i) => {
		const r = (e ?? {}) as Record<string, unknown>
		if (typeof r.tag !== 'string' || !/^[a-z][a-z0-9-]*$/.test(r.tag)) out.push(`${at}[${i}].tag is a lowercase word (words joined by -)`)
		if (typeof r.label !== 'string' || !r.label.trim()) out.push(`${at}[${i}].label says what it is, as the picker lists it`)
		if (typeof r.why !== 'string' || !r.why.trim()) out.push(`${at}[${i}].why says why the genre plays best with it`)
		if (r.kinds !== undefined && (!kinds || !Array.isArray(r.kinds) || r.kinds.some((k) => typeof k !== 'string')))
			out.push(kinds ? `${at}[${i}].kinds is a list of attribute kinds` : `${at}[${i}].kinds: only an attribute has kinds`)
	})
	return out
}

/** @experimental */
export function genreUsesFindings(raw: unknown, at = 'uses'): string[] {
	if (raw === undefined) return []
	const out: string[] = []
	if (!raw || typeof raw !== 'object') return [`${at} is { verbs, attributes?, entryTypes?, zoneTypes?, conditions?, casting?, dice?, optional? }`]
	const u = raw as Record<string, unknown>
	const list = (v: unknown, k: string) => {
		if (v === undefined) return
		if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x)) out.push(`${at}.${k} is a list of names`)
	}
	// 🚧 Retired (RF fix 8): a genre names no slot and no ruleset's repertoire — it says what it plays best with by tag.
	const retired = (o: Record<string, unknown>, prefix: string) => {
		if (o.slots !== undefined) out.push(`${at}.${prefix}slots: a genre names no slot any more — say the attribute it plays best with by tag (${at}.${prefix}attributes: [{ tag: 'health', label, why }])`)
		if (o.pieces !== undefined) out.push(`${at}.${prefix}pieces: a genre names no ruleset's repertoire any more — say the entry type it plays best with by tag (${at}.${prefix}entryTypes: [{ tag: 'weapon', label, why }])`)
	}
	if (u.verbs !== 'any') list(u.verbs, 'verbs')
	if (u.verbs === undefined) out.push(`${at}.verbs is a list of verbs or 'any'`)
	retired(u, '')
	out.push(...expectationFindings(u.attributes, `${at}.attributes`, true))
	out.push(...expectationFindings(u.entryTypes, `${at}.entryTypes`, false))
	out.push(...expectationFindings(u.zoneTypes, `${at}.zoneTypes`, false))
	if (u.conditions !== undefined && typeof u.conditions !== 'boolean') out.push(`${at}.conditions is a boolean`)
	if (u.casting !== undefined && typeof u.casting !== 'boolean') out.push(`${at}.casting is a boolean`)
	if (u.dice !== undefined && u.dice !== 'required' && u.dice !== 'optional') out.push(`${at}.dice is 'required' or 'optional'`)
	if (u.optional !== undefined) {
		if (!u.optional || typeof u.optional !== 'object') out.push(`${at}.optional is { verbs?, attributes?, entryTypes?, zoneTypes?, conditions?, casting? }`)
		else {
			const o = u.optional as Record<string, unknown>
			list(o.verbs, 'optional.verbs')
			retired(o, 'optional.')
			out.push(...expectationFindings(o.attributes, `${at}.optional.attributes`, true))
			out.push(...expectationFindings(o.entryTypes, `${at}.optional.entryTypes`, false))
			out.push(...expectationFindings(o.zoneTypes, `${at}.optional.zoneTypes`, false))
		}
	}
	return out
}
