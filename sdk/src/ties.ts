/**
 * 🚧 **Ties on the lorebook graph** (PLAN-rulesets-functions "Ties on the
 * graph", owner rulings T1–T5, GO 2026-10-23) — what a relational entry type
 * says about the relationship it rides on, and what any field may say about
 * the lorebook and the model.
 *
 *  · **far end** (`farEnd`, T1) — what the other end of a relational entry
 *    type may be: a `person`, a `place`, or any `entry`. The near end is its
 *    holder.
 *  · **tie sides** (`tieSidesOf`, T1) — derived from the ends, never said:
 *    a person to a person is **two** sides, each person holding their own
 *    (a cast tie's two perspective rows); anything else is **one** side, held
 *    by the world (a road, a standing in a town).
 *  · **reads onto the lorebook** (`readsOnto`, T2) — ONE per-field setting,
 *    on an entry type's fields and on an attribute: the lorebook column the
 *    field feeds wherever the type's instances live. A tie's field feeds its
 *    relationship row's `relationship-type` or `relationship-name`; a held
 *    thing's, its source entry's own field (`entry-field`); a cast
 *    attribute's, the cast member's state on the graph (`cast-state`); a
 *    place attribute's, the place entry's own field. Validated against the
 *    owner kind. The host writes it whenever the value lands — through the
 *    outlet, never from a function (R8). The tie case is an instance of it,
 *    never a path of its own.
 *  · **model share** (`modelShare`, T5) — per field, what the model is told:
 *    its `words` (default on) and its `number` (default off). Not a law: a
 *    setting each field carries, read by the retrieval arm and the ruleset's
 *    voice.
 *
 * ⚠ None of these names a lorebook **scope**, a graph **node**, or a
 * **perspective** on its own: a tie's side is the held entry one person
 * holds; its perspective row is what that side reads onto.
 * @experimental
 * @ruling PLAN-rulesets-functions T1–T5 (2026-10-23)
 */

import type { SlotAppliesTo } from './attributes.js'
import { finding } from './repertoires.js'
import type { FieldDecl, SettingsSchema } from './settings.js'

// ── The far end and the sides ───────────────────────────────────────────────

/**
 * 🚧 What the **far end** of a relational entry type may be (T1): a `person`
 * (a cast member), a `place` (a place entry), or any `entry`. The near end
 * is whoever holds the side. ⚠ The lorebook's link form says "far end" for
 * the same thing — the other end of a relationship.
 * @experimental
 */
export const FAR_ENDS = ['person', 'place', 'entry'] as const
/** @experimental */
export type FarEnd = (typeof FAR_ENDS)[number]

/** 🚧 Whether a value is one of `FAR_ENDS`. @experimental */
export const isFarEnd = (v: unknown): v is FarEnd => typeof v === 'string' && (FAR_ENDS as readonly string[]).includes(v)

/** What `tieSidesOf` reads of an entry type. */
interface TieShape {
	relational?: true
	farEnd?: FarEnd
	holders?: readonly SlotAppliesTo[]
}

const castOnly = (holders: readonly SlotAppliesTo[] | undefined): boolean =>
	holders === undefined || (holders.length === 1 && holders[0] === 'cast')

/**
 * 🚧 How many **tie sides** a relational entry type has, worked out from its
 * ends (T1, never declared): `2` for a person to a person held by people —
 * each holds their own side (its own perspective row on the graph); `1` for
 * anything else, held by the world. `undefined` for an entry type that says
 * no far end (⏳ an untyped `towards`, read as before).
 * @experimental
 */
export function tieSidesOf(e: TieShape | null | undefined): 1 | 2 | undefined {
	if (!e || e.relational !== true || !isFarEnd(e.farEnd)) return undefined
	return e.farEnd === 'person' && castOnly(e.holders) ? 2 : 1
}

/**
 * 🚧 Who holds a tie's sides: each person for a two-sided tie (`cast`), the
 * world for a one-sided one. `undefined` for an entry type with no far end.
 * @experimental
 */
export function tieHoldersOf(e: TieShape | null | undefined): readonly SlotAppliesTo[] | undefined {
	const sides = tieSidesOf(e)
	return sides === 2 ? ['cast'] : sides === 1 ? ['world'] : undefined
}

/**
 * 🚧 Why a relational entry type's far end is refused (`bad-far-end`,
 * `bad-holders`): a word that is none of `FAR_ENDS`, a far end on an entry
 * type that is not relational, or holders that contradict the sides its ends
 * give it (a one-sided tie is the world's).
 * @experimental
 */
export function farEndFindings(e: TieShape & { holders?: unknown }, at: string): string[] {
	if (!e || typeof e !== 'object' || (e as { farEnd?: unknown }).farEnd === undefined) return []
	const out: string[] = []
	const far = (e as { farEnd?: unknown }).farEnd
	if (!isFarEnd(far)) out.push(finding('bad-far-end', `${at}.farEnd is '${String(far)}'. Say what its far end may be — ${FAR_ENDS.join(', ')}.`))
	if (e.relational !== true) out.push(finding('bad-far-end', `${at} says a far end and is not relational. Only a relational entry type has one — say relational: true.`))
	if (out.length) return out
	const holders = e.holders as readonly SlotAppliesTo[] | undefined
	if (tieSidesOf(e) === 1 && holders !== undefined && !(holders.length === 1 && holders[0] === 'world'))
		out.push(
			finding(
				'bad-holders',
				`${at}: a tie whose far end is ${far === 'person' ? 'a person, held by someone other than people,' : `a ${far}`} has one side, held by the world. Leave holders out, or say ['world'].`,
			),
		)
	return out
}

// ── Reads onto the lorebook ─────────────────────────────────────────────────

/**
 * 🚧 The lorebook columns a field may **read onto** (T2):
 *
 *  · `relationship-type` — a tie's relationship row's relationship type (a
 *    two-sided tie: its side's own perspective row);
 *  · `relationship-name` — that row's name;
 *  · `entry-field` — a held thing's source entry's field of the same name; a
 *    place attribute's, the place entry's;
 *  · `cast-state` — a cast member's state on the graph (`CAST_STATE_WORDS`).
 * @experimental
 */
export const READS_ONTO = ['relationship-type', 'relationship-name', 'entry-field', 'cast-state'] as const
/** @experimental */
export type ReadsOnto = (typeof READS_ONTO)[number]

/**
 * 🚧 The words a cast member's state on the graph takes — what a cast
 * attribute reading onto `cast-state` may hold.
 * @experimental
 */
export const CAST_STATE_WORDS = ['active', 'deceased', 'missing', 'departed'] as const

/**
 * 🚧 The owner kinds a field's instances live with, as `readsOnto` reads
 * them: a **tie** (a relational entry type with a far end), a **held** thing
 * (any other entry type), or the owner an attribute is carried by.
 * @experimental
 */
export type ReadsOntoOwner = 'tie' | 'held' | 'cast' | 'location' | 'world'

/** 🚧 The columns each owner kind's fields may read onto. @experimental */
export const READS_ONTO_BY_OWNER: Readonly<Record<ReadsOntoOwner, readonly ReadsOnto[]>> = Object.freeze({
	tie: ['relationship-type', 'relationship-name'],
	held: ['entry-field'],
	cast: ['cast-state'],
	location: ['entry-field'],
	world: [],
})

/** 🚧 Whether a value is one of `READS_ONTO`. @experimental */
export const isReadsOnto = (v: unknown): v is ReadsOnto => typeof v === 'string' && (READS_ONTO as readonly string[]).includes(v)

const WORDS_TYPES = new Set(['string', 'text', 'enum'])
const NUMBER_TYPES = new Set(['integer', 'number'])

/**
 * 🚧 Why an entry type's `readsOnto` is refused (`bad-reads-onto`): not a map
 * of its own fields to columns; a column its owner kind has none of (a tie's
 * fields feed its relationship row, a held thing's its source entry); a
 * relational type with no far end (its row is not known); a relationship
 * column fed by anything but words; two fields onto one column.
 * @experimental
 */
export function entryTypeReadsOntoFindings(
	e: TieShape & { readsOnto?: unknown },
	fields: SettingsSchema,
	at: string,
): string[] {
	const v = e?.readsOnto
	if (v === undefined) return []
	if (!v || typeof v !== 'object' || Array.isArray(v))
		return [finding('bad-reads-onto', `${at}.readsOnto is a map of its fields to the lorebook column each reads onto — { standing: 'relationship-type' }.`)]
	const owner: ReadsOntoOwner | null = tieSidesOf(e) !== undefined ? 'tie' : e.relational === true ? null : 'held'
	const out: string[] = []
	const fed = new Map<string, string>()
	for (const [field, target] of Object.entries(v as Record<string, unknown>)) {
		const where = `${at}.readsOnto.${field}`
		const decl = fields[field] as FieldDecl | undefined
		if (!decl) {
			out.push(finding('bad-reads-onto', `${where}: '${field}' is none of its fields (${Object.keys(fields).join(', ')}).`))
			continue
		}
		if (!isReadsOnto(target)) {
			out.push(finding('bad-reads-onto', `${where} is '${String(target)}'. Say one of ${READS_ONTO.join(', ')}.`))
			continue
		}
		if (owner === null) {
			out.push(finding('bad-reads-onto', `${where}: a relational entry type reads onto its relationship row only once it says its far end — say farEnd.`))
			continue
		}
		if (!READS_ONTO_BY_OWNER[owner].includes(target)) {
			out.push(
				finding(
					'bad-reads-onto',
					`${where} is '${target}'. ${owner === 'tie' ? "A tie's field reads onto its relationship row" : "A held thing's field reads onto its own entry"} — ${READS_ONTO_BY_OWNER[owner].join(', ')}.`,
				),
			)
			continue
		}
		if ((target === 'relationship-type' || target === 'relationship-name') && !WORDS_TYPES.has(decl.type))
			out.push(finding('bad-reads-onto', `${where}: a relationship's ${target === 'relationship-type' ? 'type' : 'name'} is words, and '${field}' is a ${decl.type}. Read a words field onto it.`))
		const before = fed.get(target)
		if (before !== undefined) out.push(finding('bad-reads-onto', `${where}: '${before}' reads onto ${target} already. One field feeds a column.`))
		else fed.set(target, field)
	}
	return out
}

/** What `attributeReadsOntoFindings` reads of an attribute. */
interface AttributeShape {
	kind?: string
	slot?: string
	of?: readonly string[]
	carriedBy?: readonly SlotAppliesTo[]
	readsOnto?: unknown
}

/**
 * 🚧 Why an attribute's `readsOnto` is refused (`bad-reads-onto`): a column
 * its owner has none of — a cast attribute reads onto `cast-state` (a label
 * whose words are `CAST_STATE_WORDS`), a place attribute onto `entry-field`,
 * a world attribute onto nothing — or an attribute carried by more than one
 * kind of owner.
 * @experimental
 */
export function attributeReadsOntoFindings(a: AttributeShape, at: string): string[] {
	const v = a?.readsOnto
	if (v === undefined) return []
	const where = `${at}.readsOnto`
	if (!isReadsOnto(v)) return [finding('bad-reads-onto', `${where} is '${String(v)}'. Say one of ${READS_ONTO.join(', ')}.`)]
	const owners = a.carriedBy ?? (['cast'] as const)
	if (owners.length !== 1) return [finding('bad-reads-onto', `${where}: an attribute carried by ${owners.join(' and ')} reads onto no one column. Say one owner in carriedBy.`)]
	const owner = owners[0] as ReadsOntoOwner
	const may = READS_ONTO_BY_OWNER[owner] ?? []
	if (!may.includes(v))
		return [
			finding(
				'bad-reads-onto',
				may.length
					? `${where} is '${v}'. A ${owner === 'cast' ? 'cast member' : owner === 'location' ? 'place' : owner}'s attribute reads onto ${may.join(', ')}.`
					: `${where}: nothing on the lorebook reads a world attribute. Leave readsOnto out.`,
			),
		]
	if (v === 'cast-state') {
		if (a.slot !== undefined || a.kind !== 'label' || !a.of?.length || a.of.some((w) => !(CAST_STATE_WORDS as readonly string[]).includes(w)))
			return [finding('bad-reads-onto', `${where}: a cast member's state is one of ${CAST_STATE_WORDS.join(', ')} — read a label of those words onto it.`)]
	}
	return []
}

// ── Model share ─────────────────────────────────────────────────────────────

/**
 * 🚧 What the model is told of one field (T5): its `words` (its value as
 * words, its sentence; default on) and its `number` (default off). Not a
 * law — a setting each field carries.
 * @experimental
 */
export interface ModelShare {
	words?: boolean
	number?: boolean
}

/** 🚧 A field's model share with the defaults filled: words on, the number off. @experimental */
export function modelShareOf(share: ModelShare | null | undefined): { words: boolean; number: boolean } {
	return { words: share?.words !== false, number: share?.number === true }
}

const shareFindings = (v: unknown, where: string, numeric: boolean | undefined): string[] => {
	if (!v || typeof v !== 'object' || Array.isArray(v)) return [finding('bad-model-share', `${where} is { words?, number? } — each true or false.`)]
	const out: string[] = []
	for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
		if (k !== 'words' && k !== 'number') out.push(finding('bad-model-share', `${where}.${k}: say words or number.`))
		else if (typeof x !== 'boolean') out.push(finding('bad-model-share', `${where}.${k} is true or false.`))
	}
	if ((v as ModelShare).number === true && numeric === false) out.push(finding('bad-model-share', `${where}.number: only a number is shared as one.`))
	return out
}

/**
 * 🚧 Why an entry type's `modelShare` is refused (`bad-model-share`): not a
 * map of its own fields to `{ words?, number? }`, or a number shared of a
 * field that holds none.
 * @experimental
 */
export function entryTypeModelShareFindings(e: { modelShare?: unknown }, fields: SettingsSchema, at: string): string[] {
	const v = e?.modelShare
	if (v === undefined) return []
	if (!v || typeof v !== 'object' || Array.isArray(v))
		return [finding('bad-model-share', `${at}.modelShare is a map of its fields to { words?, number? }.`)]
	const out: string[] = []
	for (const [field, share] of Object.entries(v as Record<string, unknown>)) {
		const decl = fields[field] as FieldDecl | undefined
		if (!decl) out.push(finding('bad-model-share', `${at}.modelShare.${field}: '${field}' is none of its fields.`))
		else out.push(...shareFindings(share, `${at}.modelShare.${field}`, NUMBER_TYPES.has(decl.type)))
	}
	return out
}

/** 🚧 Why an attribute's `modelShare` is refused (`bad-model-share`). @experimental */
export function attributeModelShareFindings(a: { kind?: string; slot?: string; modelShare?: unknown }, at: string): string[] {
	if (a?.modelShare === undefined) return []
	const numeric = a.slot !== undefined ? undefined : a.kind === 'number' || a.kind === 'pool' || a.kind === 'tally'
	return shareFindings(a.modelShare, `${at}.modelShare`, numeric)
}

/**
 * 🚧 A **tie field selector** — `<entry type>.<field>` (`bond.affection`):
 * what a check reads of a tie when it is aimed at someone — the side the one
 * aimed at holds, towards the one checking ("how they feel about you"). The
 * selectors a ruleset's two-sided ties give, one per number field.
 * @experimental
 */
export function tieFieldSelectors(entryTypes: readonly (TieShape & { id: string; fields?: SettingsSchema })[] | undefined): string[] {
	const out: string[] = []
	for (const e of entryTypes ?? [])
		if (tieSidesOf(e) !== undefined)
			for (const [k, f] of Object.entries(e.fields ?? {})) if (NUMBER_TYPES.has((f as FieldDecl).type)) out.push(`${e.id}.${k}`)
	return out
}

/**
 * 🚧 Every **entry field selector** a ruleset's entry types give —
 * `<entry type>.<field>` of each number field (`bond.affection`, a tie's
 * fields among them): what an attribute role declared `entryFields` may be
 * filled by (`FunctionBindingDecl.entryFields`; `rungs` reads one per held
 * entry, a tie's per side). ⚠ Not a ruleset **selector** (a stat or a check
 * by key): it names a field of a held entry, read where the entry is held.
 * @experimental
 */
export function entryFieldSelectors(entryTypes: readonly { id: string; fields?: SettingsSchema }[] | undefined): string[] {
	const out: string[] = []
	for (const e of entryTypes ?? [])
		for (const [k, f] of Object.entries(e?.fields ?? {})) if (NUMBER_TYPES.has((f as FieldDecl)?.type)) out.push(`${e.id}.${k}`)
	return out
}

/** What `unheldTieFindings` reads of a zone type. */
interface ZoneShape {
	id: string
	owners?: readonly string[]
	holds?: readonly string[] | '*'
}

/**
 * 🚧 Why a **one-sided tie** cannot be held (`unheld-tie`, ★6 of ties on the
 * graph, 2026-10-23): its one side is the world's, and no zone type the
 * world owns holds it — the carried zone is the cast's and the places'. The
 * finding names the fix: a zone type `owners: ['world']` that `holds` it.
 * @experimental
 */
export function unheldTieFindings(
	entryTypes: readonly (TieShape & { id: string })[] | undefined,
	zoneTypes: readonly ZoneShape[] | undefined,
	at: string,
): string[] {
	const out: string[] = []
	for (const e of entryTypes ?? []) {
		if (tieSidesOf(e) !== 1) continue
		const held = (zoneTypes ?? []).some(
			(z) => (z?.owners ?? []).includes('world') && (z.holds === '*' || (Array.isArray(z.holds) && z.holds.includes(e.id))),
		)
		if (!held)
			out.push(
				finding(
					'unheld-tie',
					`${at}: '${e.id}' is a tie with one side, held by the world, and no zone type the world owns holds it. Add one — { id: '…', owners: ['world'], holds: ['${e.id}'], prose: '…' }.`,
				),
			)
	}
	return out
}
