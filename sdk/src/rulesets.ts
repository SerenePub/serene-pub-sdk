/**
 * 🚧 Rulesets — a namespaced bundle of mechanics a session's owners are read
 * and resolved by.
 *
 * A ruleset is `<creator>:ruleset/<name>@N` (`core:ruleset/freeform@1`) and says,
 * in one declaration:
 *
 *  · its **voice** — per rigour, the short paragraph a model reads about how
 *    play runs under it;
 *  · its **conventions** — dice, the degree crosswalk onto the five bands,
 *    the unit time is kept in, actions and rests;
 *  · its **stats** — attribute slots, as a sheet names them (`sheets.ts`);
 *  · its **selectors** — every name a mechanic may target or test, so an
 *    unknown one is refused when authored, never missed at runtime;
 *  · its **repertoires** — the kinds of piece its owners hold
 *    (`repertoires.ts`), and the **compendium** rows that ship with them;
 *  · its **scripts**, at declared phases of the handler's fixed order;
 *  · its **conversions** from other rulesets (id maps), and which
 *    repertoires are **entryable** (become lorebook entry types).
 *
 * A primer names its ruleset (`primers.ts`); the ruleset never names its
 * primers (the back-reference was cut 2026-10-17: nothing read it).
 *
 * Rulesets are genre-independent: a genre says how play is driven and at
 * which **rigour** — `prose`, `mechanics` or `scripts`, each including the
 * levels before — and the one handler (`core:task/ruleset-resolve@1`) reads
 * whichever ruleset the session has. Core's rulesets are declared through
 * the same `defineRuleset` a plugin uses.
 *
 * ⚠ *Mechanics*, never "laws" or "rules": both words already mean something
 * else here.
 * @experimental
 */

import type { I18n } from './i18n.js'
import { i18nFindings } from './i18n.js'
import { refuseUnlessIdentical } from './hash.js'
import {
	_clearRulesetStats,
	_registerRulesetStats,
	checkSlotValue,
	getAttributeSlot,
	resolveSlotConfig,
	type SlotId,
} from './attributes.js'
import type { SheetSlotEntry } from './sheets.js'
import {
	_clearRepertoires,
	_registerRulesetRepertoires,
	checkPiece,
	finding,
	repertoireFindings,
	RULESET_ID_PATTERN,
	RulesetError,
	type RepertoireContext,
	type RepertoireDecl,
	type PieceProps,
} from './repertoires.js'
import { conversionFindings, type ConversionDecl } from './conversions.js'
import { _describeRulesetEntryType, type EntryDescriptor, type EntryShape, type EntryTypeDecl } from './descriptors.js'

// ── Ids and vocabulary ──────────────────────────────────────────────────────

/** `owner:ruleset/name@N` — `core:ruleset/freeform@1`. @experimental */
export type RulesetId = string

function assertRulesetId(id: string): void {
	if (!RULESET_ID_PATTERN.test(id))
		throw new Error(
			`'${id}' is not a valid ruleset id. Use 'owner:ruleset/name@N' — 'core:ruleset/freeform@1'. ` +
				`The id is what a lorebook and a session hold to say which mechanics they run.`,
		)
}

/**
 * 🚧 How much of a ruleset a call resolves: `prose` (what things are, in
 * words), `mechanics` (adds the declared mechanics), `scripts` (adds the
 * ruleset's scripts and dice). Each level includes the ones before.
 * @experimental
 */
export type Rigour = 'prose' | 'mechanics' | 'scripts'
/** @experimental */
export const RIGOURS: readonly Rigour[] = ['prose', 'mechanics', 'scripts']

/** The one scale every ruleset's degrees cross-walk onto, worst first. */
const FIVE_BANDS = ['crit-fail', 'fail', 'partial', 'success', 'crit'] as const
/** 🚧 One step of the one scale every ruleset's degrees cross-walk onto. @experimental */
export type FiveBand = (typeof FIVE_BANDS)[number]

/**
 * 🚧 One of a ruleset's own degrees of success: its id, the word a person
 * (and a prose render) reads, the five-band value it maps to and, for a
 * margin-read check, the least margin (total − target) it starts at.
 * @experimental
 */
export interface DegreeBand {
	id: string
	label: I18n
	five: FiveBand
	from?: number
}

/**
 * 🚧 A ruleset's degrees, cross-walked onto `FIVE_BANDS`.
 *
 *  · Bands are read by margin: the band is the last one whose `from` the
 *    margin reaches; the first band, with no `from`, is the floor.
 *  · A band with no `from` after the first is reached only through `natural`.
 *  · `naturalShift` — die faces that move the band one step (at or above
 *    `high` up, at or below `low` down).
 *  · `natural` — die faces that **set** the band outright: a face at or above
 *    `high.from` reads as `high.band` (a classic critical, its threat range
 *    widened by lowering `from`); at or below `low.to` as `low.band`.
 * @experimental
 */
export interface DegreeCrosswalk {
	bands: readonly DegreeBand[]
	naturalShift?: { high?: number; low?: number }
	natural?: { high?: { from: number; band: string }; low?: { to: number; band: string } }
}

/** How bonuses stack: of each type keep the highest bonus and the lowest penalty, or add them all. */
const BONUS_STACKINGS = ['highest-per-type', 'sum'] as const

/**
 * 🚧 A ruleset's typed bonuses: the `bonusType`s a `modify` may name (Vis
 * Itineris: `gear`, `status`, `circumstance`, `edge`), how they stack
 * (untyped bonuses always add), and the type read as **edge** —
 * net +1 rolls the die twice and keeps the higher, net −1 keeps the lower.
 * The edge type always keeps one highest bonus and one lowest penalty, so
 * any number of sources is one edge and one of each cancels.
 * @experimental
 */
export interface RulesetBonuses {
	types: readonly string[]
	stacking: (typeof BONUS_STACKINGS)[number]
	edge?: string
}

/**
 * The die a check rolls, and the selector whose value modifies a check that
 * names no `base` of its own — the fallback; a check selector says its own.
 */
interface RulesetDice {
	sides: number
	modifierOf?: string
}

const RULESET_TIME_UNITS = ['round', 'minute', 'hour', 'day', 'scene'] as const
/** 🚧 The unit a ruleset counts time in; `roundSeconds` for a round. @experimental */
export interface RulesetTime {
	unit: (typeof RULESET_TIME_UNITS)[number]
	roundSeconds?: number
}

interface RulesetActions {
	perTurn?: number
	reaction?: boolean
	kinds?: readonly string[]
}

/** A rest: how long it takes, and the traits of what it recharges. */
interface RulesetRest {
	id: string
	label: I18n
	minutes?: number
	recharges?: readonly string[]
}

/** @experimental */
export interface RulesetConventions {
	dice?: RulesetDice
	degrees: DegreeCrosswalk
	time: RulesetTime
	actions?: RulesetActions
	rest?: readonly RulesetRest[]
	bonuses?: RulesetBonuses
}

/** The conventions a ruleset setting's choice may replace — every one but time, key by key. */
type RulesetConventionsPatch = Partial<Omit<RulesetConventions, 'time'>>

/**
 * One choice of a ruleset setting: its id, the words a person reads, and
 * the conventions it lays over the ruleset's own when chosen. A choice with
 * no `conventions` is read by the handler by its id (how dying works, say).
 */
interface RulesetSettingChoice {
	id: string
	label: I18n
	description?: I18n
	conventions?: RulesetConventionsPatch
}

/**
 * 🚧 A **ruleset setting** — one way a table may play a ruleset (how degrees
 * read, how many actions a turn holds), a closed list of choices with a
 * default. A session holds its chosen values; the handler resolves the
 * ruleset's conventions through them (`rulesetConventionsFor`).
 * @experimental
 */
export interface RulesetSettingDecl {
	label: I18n
	description?: I18n
	choices: readonly RulesetSettingChoice[]
	default: string
}

/**
 * 🚧 A **ruleset preset** — a named set of setting values offered as one
 * pick (_Classic_ restores the rules as printed). Settings it does not name
 * keep their defaults. ⚠ Not a session, sampling or layout preset.
 * @experimental
 */
export interface RulesetPresetDecl {
	id: string
	label: I18n
	description?: I18n
	values: Readonly<Record<string, string>>
}

/**
 * 🚧 A name a mechanic may target or test, beyond the ruleset's stats (each
 * stat is a selector by its slot name already):
 *
 *  · `stat` — another slot's value.
 *  · `check` — something rolled: the ruleset's die plus `base`, the selector
 *    whose value is the check's modifier (an ability modifier; proficiency
 *    arrives as a `modify` on the check). No `base`: the conventions'
 *    `dice.modifierOf`, else a bare die.
 *  · `derived` — a value computed from other selectors (by a script). 🚧
 *    `onSheet: true` (2026-10-18) puts it on the ruleset's sheet beside the
 *    stats, under its `label` — armour class: worked out, never stored, and
 *    still what a player reads first.
 *  · `tally` — a number modifies add up on and nothing rolls (a damage
 *    bonus). ⚠ Not a check: a host never rolls a die for it.
 *
 * **Selector families.** A dotted name's parents cover it: a `modify` on
 * `attack` reaches `attack.melee` and `attack.ranged`, one on `save` every
 * `save.*`, though neither parent is declared. A check may also declare the
 * generic check it counts **within** (`within: 'check'` on `skill.stealth`),
 * so a `modify` on `check` reaches every skill and ability check but not an
 * attack or a save. A family is a legal target for `modify`, `adjustDegree`
 * and `rider` — never for `set`, which writes one stored value
 * (`rulesetSelectorFamily`).
 * @experimental
 */
export type RulesetSelectorDecl =
	| { kind: 'stat'; slot: SlotId }
	| { kind: 'check'; base?: string; within?: string }
	| { kind: 'derived'; from: readonly string[]; onSheet?: boolean; label?: I18n }
	| { kind: 'tally' }

/** Where a compendium row comes from, and the licence that travels with it. */
interface CompendiumSource {
	document: string
	licence: string
}

/**
 * 🚧 One compendium row: its bookkeeping — id, version, source, language —
 * and its **piece**, nested (2026-10-17), so a piece field may be called
 * anything, `source` included, without being taken for the row's own.
 * @experimental
 */
export interface CompendiumRow {
	id: string
	version: string
	source?: CompendiumSource
	lang?: string
	piece: PieceProps
}

/** 🚧 The rows that ship with a ruleset, by repertoire id. `source` is the default for rows that name none. @experimental */
export interface CompendiumDecl {
	source?: CompendiumSource
	rows: Readonly<Record<string, readonly CompendiumRow[]>>
}

const RULESET_SCRIPT_PHASES = ['effects', 'derived', 'pre-roll', 'post-roll', 'render'] as const
/**
 * A script the handler runs at one phase of its fixed order, by priority
 * within the phase. `seedKey` names the seeded script row.
 */
interface RulesetScriptDecl {
	phase: (typeof RULESET_SCRIPT_PHASES)[number]
	priority: number
	seedKey: string
}

/**
 * 🚧 One of a ruleset's stats: a sheet entry, and whether the ruleset only
 * **borrows** the slot. A slot a ruleset lists is owned by it — pickable
 * only in its sessions (`slotPickableIn`) — unless it is `borrowed`: a
 * general slot other rulesets and genres read too (core's health, level,
 * mood). ⚠ Not the slot's `rulesetOwned`, which a slot may still spell.
 * @experimental
 */
export interface RulesetStatEntry extends SheetSlotEntry {
	borrowed?: true
}

/** @experimental */
export interface RulesetProps {
	/** The name a person reads. Display text. */
	name: I18n
	description?: I18n
	/** Per rigour, what a model reads about play under this ruleset. Model-facing; at most ~60 tokens each. */
	voice: Partial<Record<Rigour, string>>
	conventions: RulesetConventions
	/** 🚧 The ways a table may play it, by setting name; each choice may lay conventions over `conventions`. */
	settings?: Readonly<Record<string, RulesetSettingDecl>>
	/** 🚧 Named sets of setting values offered as one pick. */
	presets?: readonly RulesetPresetDecl[]
	/**
	 * The ruleset's stats, in order, as a sheet names slots. Each is owned by
	 * the ruleset unless marked `borrowed`.
	 */
	stats: readonly RulesetStatEntry[]
	selectors?: Readonly<Record<string, RulesetSelectorDecl>>
	repertoires: readonly RepertoireDecl[]
	compendium?: CompendiumDecl
	scripts?: readonly RulesetScriptDecl[]
	conversions?: readonly ConversionDecl[]
	/** Repertoire ids whose pieces become lorebook entry types. Absent: every repertoire declaring `entryable`. */
	entryable?: readonly string[]
}

/** @experimental */
export interface RulesetDecl extends RulesetProps {
	readonly id: RulesetId
}

/** Display text outside `i18n`/`description`: band and rest labels, repertoire labels. */
const RULESET_DISPLAY_KEYS = { display: ['label'] } as const

/** The voice budget: about 60 tokens, at four characters a token. */
const VOICE_MAX_CHARS = 240

const SELECTOR_NAME = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*$/

/** `core:slot/mood@1` → `mood`. */
const slotName = (id: string): string => id.slice(id.indexOf('/') + 1, id.lastIndexOf('@'))

/**
 * 🚧 Every selector a ruleset's mechanics may name: each stat by its slot
 * name (`mood`), then the declared ones.
 * @experimental
 */
export function rulesetSelectors(decl: Pick<RulesetProps, 'stats' | 'selectors'>): ReadonlyMap<string, RulesetSelectorDecl> {
	const out = new Map<string, RulesetSelectorDecl>()
	for (const s of decl.stats ?? []) out.set(slotName(s.id), { kind: 'stat', slot: s.id })
	for (const [k, v] of Object.entries(decl.selectors ?? {})) if (!out.has(k)) out.set(k, v)
	return out
}

/** A dotted name's parents, nearest first — `a.b.c` → `a.b`, `a`. */
const dottedParents = (name: string): string[] => {
	const parts = name.split('.')
	const out: string[] = []
	for (let i = parts.length - 1; i > 0; i--) out.push(parts.slice(0, i).join('.'))
	return out
}

/**
 * 🚧 Every name a `modify` or `adjustDegree` may target to reach `selector`:
 * itself, its dotted parents (`attack.melee` → `attack`), and — for a check
 * that declares one — the generic check it counts `within`, with that
 * name's own family in turn. What a host folds onto a check, so the engine
 * and the authoring check agree on what "covers" means. A name that is no
 * selector is its own family alone.
 * @experimental
 */
export function rulesetSelectorFamily(decl: Pick<RulesetProps, 'stats' | 'selectors'>, selector: string): readonly string[] {
	const all = rulesetSelectors(decl)
	const out: string[] = []
	const add = (name: string) => {
		if (out.includes(name)) return
		out.push(name)
		for (const p of dottedParents(name)) add(p)
		const sel = all.get(name)
		if (sel?.kind === 'check' && typeof sel.within === 'string') add(sel.within)
	}
	add(selector)
	return out
}

/**
 * Names that are no selector of the ruleset but cover some: every dotted
 * selector's parents and every check's `within`, with their families.
 */
function selectorFamilies(decl: Pick<RulesetProps, 'stats' | 'selectors'>): Set<string> {
	const all = rulesetSelectors(decl)
	const out = new Set<string>()
	for (const name of all.keys()) for (const f of rulesetSelectorFamily(decl, name)) if (!all.has(f)) out.add(f)
	return out
}

/**
 * The context a repertoire's mechanics are checked in.
 * @internal
 */
export function rulesetContext(decl: RulesetDecl | (RulesetProps & { id: string })): RepertoireContext {
	return {
		ruleset: decl.id,
		selectors: new Set(rulesetSelectors(decl).keys()),
		families: selectorFamilies(decl),
		ownStats: new Set((decl.stats ?? []).map((s) => slotName(s.id))),
		repertoires: new Map((decl.repertoires ?? []).map((r) => [r.id, r])),
		timeUnit: decl.conventions?.time?.unit,
	}
}

/** 🚧 The repertoires whose pieces become lorebook entry types. @experimental */
export const rulesetEntryable = (decl: Pick<RulesetProps, 'entryable' | 'repertoires'>): readonly string[] =>
	decl.entryable ?? decl.repertoires.filter((r) => r.entryable).map((r) => r.id)

/**
 * 🚧 The derived entry type an entryable repertoire yields —
 * `core:entry/freeform.things@1` for `things` on `core:ruleset/freeform@1`.
 * @experimental
 */
export function rulesetEntryTypeId(rulesetId: RulesetId, repertoireId: string): string {
	assertRulesetId(rulesetId)
	const owner = rulesetId.slice(0, rulesetId.indexOf(':'))
	return `${owner}:entry/${slotName(rulesetId)}.${repertoireId}@1`
}

/**
 * 🚧 The parts every entry type answers with beyond its own fields — which
 * field plays title, key, priority, parent; what the embedding reads; the
 * band it competes in; where it renders; what an amendment means — and the
 * fields every entry carries (priority, supply). Core's entry types declare
 * them (`core-catalog`'s `ENTRY_UNIVERSAL_PARTS`); a derived entry type takes
 * them whole, so the two never drift. Keys, provenance and `derived_from`
 * are columns every row has, and need no declaration.
 * @experimental
 */
export interface EntryUniversalParts extends Omit<EntryShape, 'fields'> {
	fields: NonNullable<EntryShape['fields']>
}

/**
 * 🚧 The derived entry types a ruleset yields, as declarations — one per
 * entryable repertoire (`rulesetEntryable`): id `rulesetEntryTypeId`, name
 * and description the repertoire's, fields the repertoire's **whole piece
 * shape** (name, description, prose, traits, the relational parts when it is
 * relational, then its own) with the universal entry fields laid beside it.
 * Pure; `deriveRulesetEntryTypes` registers them.
 *
 * Refused (`RulesetError`, `[entry-field-collision]`) when a piece field
 * shares a name with a universal entry field — the entry could not hold both.
 * @experimental
 */
export function rulesetEntryTypeDecls(ruleset: Pick<RulesetDecl, 'id' | 'repertoires' | 'entryable'>, universal: EntryUniversalParts): EntryTypeDecl[] {
	const found: string[] = []
	const out: EntryTypeDecl[] = []
	for (const repId of rulesetEntryable(ruleset)) {
		const rep = ruleset.repertoires.find((r) => r.id === repId)
		if (!rep) continue
		const pieceFields = rep.piece.fields ?? {}
		for (const k of Object.keys(universal.fields))
			if (k in pieceFields)
				found.push(finding('entry-field-collision', `${ruleset.id} '${repId}' pieces declare '${k}', which every entry already carries. Name the piece field otherwise.`))
		const { fields: _f, ...parts } = universal
		out.push({
			...parts,
			id: rulesetEntryTypeId(ruleset.id, repId),
			i18n: { name: rep.label, ...(rep.description !== undefined ? { description: rep.description } : {}) },
			fields: { ...pieceFields, ...universal.fields },
		})
	}
	if (found.length) throw new RulesetError(`${ruleset.id}'s derived entry types`, found)
	return out
}

/**
 * 🚧 Register a ruleset's derived entry types — `<creator>:entry/<ruleset>.<repertoire>@1`
 * for each entryable repertoire (§21 amendment). Core and rulesets are the
 * authors of entry types; this is the rulesets' door, and a plugin ruleset's
 * types derive under its own namespace. Idempotent: an identical
 * re-derivation is a no-op.
 * @experimental
 */
export function deriveRulesetEntryTypes(
	ruleset: Pick<RulesetDecl, 'id' | 'repertoires' | 'entryable'>,
	universal: EntryUniversalParts,
): EntryDescriptor[] {
	return rulesetEntryTypeDecls(ruleset, universal).map((d) => _describeRulesetEntryType(d))
}

/**
 * 🚧 The repertoire a derived entry type id was derived from, when it is one
 * and its ruleset is registered — `core:entry/vis-itineris.weapons@1` → Vis Itineris's
 * `weapons`. What lets one piece checker validate an entry of the type.
 * @experimental
 */
export function derivedEntryTypeSource(entryTypeId: string): { ruleset: RulesetDecl; repertoire: RepertoireDecl } | undefined {
	const m = /^([a-z0-9][a-z0-9.-]*):entry\/([a-z0-9-]+)\.([a-z0-9-]+)@1$/.exec(entryTypeId)
	if (!m) return undefined
	for (const r of registry.values()) {
		if (!r.id.startsWith(`${m[1]}:ruleset/${m[2]}@`)) continue
		if (!rulesetEntryable(r).includes(m[3]!)) continue
		const rep = r.repertoires.find((x) => x.id === m[3])
		if (rep) return { ruleset: r, repertoire: rep }
	}
	return undefined
}

// ── Findings ────────────────────────────────────────────────────────────────

function conventionFindings(id: string, c: RulesetConventions | undefined, selectors: ReadonlyMap<string, RulesetSelectorDecl>): string[] {
	const at = `${id}.conventions`
	if (!c || typeof c !== 'object')
		return [finding('missing-conventions', `${id} declares no conventions. Every ruleset says at least its degrees and the unit it keeps time in.`)]
	const out: string[] = []
	if (c.dice !== undefined) {
		if (!(Number.isInteger(c.dice?.sides) && c.dice.sides >= 2))
			out.push(finding('bad-dice', `${at}.dice.sides is ${String(c.dice?.sides)}. A die has a whole number of sides, at least 2.`))
		if (c.dice?.modifierOf !== undefined && !selectors.has(c.dice.modifierOf))
			out.push(finding('unknown-selector', `${at}.dice.modifierOf names '${c.dice.modifierOf}', which no stat or selector of ${id} is.`))
	}
	const bands = c.degrees?.bands
	if (!Array.isArray(bands) || !bands.length)
		out.push(finding('no-bands', `${at}.degrees declares no bands. Map the ruleset's degrees onto ${FIVE_BANDS.join(' / ')} — even a prose ruleset names them in words.`))
	else {
		const ids = new Set<string>()
		let last = -Infinity
		bands.forEach((b, i) => {
			if (typeof b?.id !== 'string' || !b.id) out.push(finding('bad-band', `${at}.degrees.bands[${i}] has no id.`))
			else if (ids.has(b.id)) out.push(finding('duplicate-band', `${at}.degrees names the band '${b.id}' twice.`))
			else ids.add(b.id)
			if (!FIVE_BANDS.includes(b?.five)) out.push(finding('bad-band', `${at}.degrees.bands[${i}].five is '${String(b?.five)}'. Say one of ${FIVE_BANDS.join(', ')}.`))
			out.push(...i18nFindings(b?.label, `${at}.degrees.bands[${i}].label`, { required: true }).map((f) => finding('display-text', f)))
			if (b?.from !== undefined) {
				if (typeof b.from !== 'number' || b.from <= last)
					out.push(finding('bad-band', `${at}.degrees.bands[${i}].from is ${String(b.from)}. Margins rise band by band, lowest first.`))
				else last = b.from
			}
		})
		if (!bands.some((b) => b?.five === 'success'))
			out.push(finding('no-success-band', `${at}.degrees maps no band to 'success'. Every crosswalk says what succeeding is.`))
	}
	const shift = c.degrees?.naturalShift
	if (shift !== undefined && (!shift || [shift.high, shift.low].some((v) => v !== undefined && !Number.isInteger(v))))
		out.push(finding('bad-band', `${at}.degrees.naturalShift is { high?, low? } — die faces, whole numbers.`))
	const nat = c.degrees?.natural
	if (nat !== undefined) {
		const ids = new Set((Array.isArray(bands) ? bands : []).map((b) => b?.id))
		if (!nat || typeof nat !== 'object')
			out.push(finding('bad-band', `${at}.degrees.natural is { high?: { from, band }, low?: { to, band } }.`))
		else
			for (const [k, face] of [['high', nat.high?.from], ['low', nat.low?.to]] as const) {
				const side = nat[k]
				if (side === undefined) continue
				if (!Number.isInteger(face) || !ids.has(side?.band))
					out.push(finding('bad-band', `${at}.degrees.natural.${k} names a die face (a whole number) and one of this crosswalk's band ids.`))
			}
	}
	const bonuses = c.bonuses
	if (bonuses !== undefined) {
		const types = Array.isArray(bonuses?.types) ? bonuses.types : []
		if (!types.length || types.some((t) => typeof t !== 'string' || !SELECTOR_NAME.test(t)) || new Set(types).size !== types.length)
			out.push(finding('bad-bonuses', `${at}.bonuses.types is a non-empty list of distinct lowercase names — 'gear', 'status'.`))
		if (!BONUS_STACKINGS.includes(bonuses?.stacking))
			out.push(finding('bad-bonuses', `${at}.bonuses.stacking is '${String(bonuses?.stacking)}'. Say one of ${BONUS_STACKINGS.join(', ')}.`))
		if (bonuses?.edge !== undefined && !types.includes(bonuses.edge))
			out.push(finding('bad-bonuses', `${at}.bonuses.edge names '${String(bonuses.edge)}', which is not among its types.`))
	}
	if (!RULESET_TIME_UNITS.includes(c.time?.unit))
		out.push(finding('bad-time-unit', `${at}.time.unit is '${String(c.time?.unit)}'. Say one of ${RULESET_TIME_UNITS.join(', ')}.`))
	if (c.time?.roundSeconds !== undefined && (c.time.unit !== 'round' || !(typeof c.time.roundSeconds === 'number' && c.time.roundSeconds > 0)))
		out.push(finding('bad-time-unit', `${at}.time.roundSeconds is said only with unit 'round', as a positive number of seconds.`))
	if (c.actions?.perTurn !== undefined && !(Number.isInteger(c.actions.perTurn) && c.actions.perTurn >= 1))
		out.push(finding('bad-actions', `${at}.actions.perTurn is ${String(c.actions.perTurn)}. A whole number of at least 1.`))
	const rests = new Set<string>()
	;(c.rest ?? []).forEach((r, i) => {
		if (typeof r?.id !== 'string' || !r.id || rests.has(r.id))
			out.push(finding('bad-rest', `${at}.rest[${i}] needs an id of its own.`))
		else rests.add(r.id)
		out.push(...i18nFindings(r?.label, `${at}.rest[${i}].label`, { required: true }).map((f) => finding('display-text', f)))
		if (r?.minutes !== undefined && !(typeof r.minutes === 'number' && r.minutes >= 0))
			out.push(finding('bad-rest', `${at}.rest[${i}].minutes is ${String(r.minutes)}. A number of minutes, zero or more.`))
	})
	return out
}

const SETTING_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Every convention key a setting's choices replace, by setting — for the overlap check. */
const patchedKeys = (decl: RulesetSettingDecl): Set<string> =>
	new Set((decl?.choices ?? []).flatMap((c) => Object.keys(c?.conventions ?? {})))

function settingFindings(id: string, props: RulesetProps, selectors: ReadonlyMap<string, RulesetSelectorDecl>): string[] {
	const out: string[] = []
	const settings = props.settings ?? {}
	const claimed = new Map<string, string>()
	for (const [name, decl] of Object.entries(settings)) {
		const at = `${id}.settings.${name}`
		if (!SETTING_NAME.test(name)) out.push(finding('bad-setting', `${at}: a setting is named in lowercase words joined by '-' — 'degrees'.`))
		out.push(...i18nFindings(decl?.label, `${at}.label`, { required: true }).map((f) => finding('display-text', f)))
		out.push(...i18nFindings(decl?.description, `${at}.description`).map((f) => finding('display-text', f)))
		const choices = Array.isArray(decl?.choices) ? decl.choices : []
		if (choices.length < 2) out.push(finding('bad-setting', `${at} offers ${choices.length} choice(s). A setting is a choice between two or more ways to play.`))
		const ids = new Set<string>()
		choices.forEach((c, i) => {
			if (typeof c?.id !== 'string' || !SETTING_NAME.test(c.id) || ids.has(c.id))
				out.push(finding('bad-setting', `${at}.choices[${i}] needs an id of its own, in lowercase words joined by '-'.`))
			else ids.add(c.id)
			out.push(...i18nFindings(c?.label, `${at}.choices[${i}].label`, { required: true }).map((f) => finding('display-text', f)))
			if (c?.conventions !== undefined) {
				if ('time' in (c.conventions as object))
					out.push(finding('bad-setting', `${at}.choices[${i}] replaces time. A setting changes how play reads, never the unit time is kept in.`))
				const merged = { ...props.conventions, ...c.conventions } as RulesetConventions
				for (const f of conventionFindings(`${at}.choices[${i}]`, merged, selectors)) out.push(f)
			}
		})
		if (!ids.has(decl?.default)) out.push(finding('bad-setting', `${at}.default is '${String(decl?.default)}', which is not one of its choices.`))
		for (const k of patchedKeys(decl)) {
			const other = claimed.get(k)
			if (other) out.push(finding('setting-overlap', `${at} and ${id}.settings.${other} both replace conventions.${k}. One setting owns each convention, or the result depends on order.`))
			else claimed.set(k, name)
		}
	}
	const presets = new Set<string>()
	;(props.presets ?? []).forEach((p, i) => {
		const at = `${id}.presets[${i}]`
		if (typeof p?.id !== 'string' || !SETTING_NAME.test(p.id) || presets.has(p.id))
			out.push(finding('bad-preset', `${at} needs an id of its own, in lowercase words joined by '-'.`))
		else presets.add(p.id)
		out.push(...i18nFindings(p?.label, `${at}.label`, { required: true }).map((f) => finding('display-text', f)))
		out.push(...i18nFindings(p?.description, `${at}.description`).map((f) => finding('display-text', f)))
		for (const [k, v] of Object.entries(p?.values ?? {})) {
			const s = settings[k]
			if (!s) out.push(finding('bad-preset', `${at}.values.${k}: ${id} declares no setting '${k}'.`))
			else if (!s.choices.some((c) => c.id === v)) out.push(finding('bad-preset', `${at}.values.${k} is '${String(v)}', which is not one of its choices.`))
		}
	})
	return out
}

/**
 * 🚧 A session's full setting values for a ruleset: each setting's default,
 * then the preset's values, then the session's own. A name the ruleset does
 * not declare, or a choice a setting does not offer, is left out — it reads
 * as the layer beneath, never as an error at play time (`rulesetFindings`
 * refuses it where it is authored).
 * @experimental
 */
export function rulesetSettingValues(
	decl: Pick<RulesetProps, 'settings' | 'presets'>,
	chosen: { preset?: string; values?: Readonly<Record<string, string>> } = {},
): Record<string, string> {
	const out: Record<string, string> = {}
	const settings = decl.settings ?? {}
	const lay = (values: Readonly<Record<string, string>> | undefined) => {
		for (const [k, v] of Object.entries(values ?? {}))
			if (settings[k]?.choices.some((c) => c.id === v)) out[k] = v
	}
	for (const [k, s] of Object.entries(settings)) out[k] = s.default
	if (chosen.preset !== undefined) lay(decl.presets?.find((p) => p.id === chosen.preset)?.values)
	lay(chosen.values)
	return out
}

/**
 * 🚧 The preset whose values these are exactly, if any — what a picker shows
 * as selected. @experimental
 */
export function rulesetPresetOf(decl: Pick<RulesetProps, 'settings' | 'presets'>, values: Readonly<Record<string, string>>): string | undefined {
	const full = rulesetSettingValues(decl, { values })
	return decl.presets?.find((p) => {
		const v = rulesetSettingValues(decl, { preset: p.id })
		return Object.keys(full).every((k) => full[k] === v[k])
	})?.id
}

/**
 * 🚧 A ruleset's conventions as a session plays them: its own, with each
 * chosen setting's `conventions` laid over key by key. One setting owns each
 * key (`setting-overlap`), so the order settings are read in never matters.
 * @experimental
 */
export function rulesetConventionsFor(
	decl: Pick<RulesetProps, 'conventions' | 'settings' | 'presets'>,
	values: Readonly<Record<string, string>> = {},
): RulesetConventions {
	const full = rulesetSettingValues(decl, { values })
	let out: RulesetConventions = { ...decl.conventions }
	for (const [k, s] of Object.entries(decl.settings ?? {})) {
		const patch = s.choices.find((c) => c.id === full[k])?.conventions
		if (patch) out = { ...out, ...patch }
	}
	return out
}

function selectorFindings(id: string, props: RulesetProps): string[] {
	const out: string[] = []
	const stats = new Set((props.stats ?? []).map((s) => slotName(s.id)))
	const all = rulesetSelectors(props)
	for (const [name, sel] of Object.entries(props.selectors ?? {})) {
		const at = `${id}.selectors.${name}`
		if (!SELECTOR_NAME.test(name)) out.push(finding('bad-selector', `${at}: a selector is lowercase words joined by '-', dotted for a family — 'attack.melee'.`))
		if (stats.has(name)) out.push(finding('duplicate-selector', `${at} repeats the stat '${name}', which is a selector already.`))
		if (sel?.kind === 'stat' && !getAttributeSlot(sel.slot))
			out.push(finding('unknown-stat', `${at} reads '${String(sel.slot)}', which nothing declares. Declare the slot first.`))
		else if (sel?.kind === 'check') {
			if (sel.base !== undefined && !all.has(sel.base))
				out.push(finding('unknown-selector', `${at} is a check on '${sel.base}', which no stat or selector of ${id} is.`))
			if (sel.within !== undefined) {
				if (typeof sel.within !== 'string' || !SELECTOR_NAME.test(sel.within))
					out.push(finding('bad-selector', `${at}.within is the generic check it counts within, a selector name — 'check'.`))
				else if (sel.within === name || name.startsWith(`${sel.within}.`))
					out.push(finding('bad-selector', `${at}.within is '${sel.within}', which covers it already as its own name or dotted parent. Leave it out.`))
				else {
					const w = all.get(sel.within)
					if (w && w.kind !== 'check')
						out.push(finding('bad-selector', `${at} counts within '${sel.within}', a '${w.kind}' selector. A check counts within a check, or within a family name no selector claims.`))
				}
			}
		} else if (sel?.kind === 'tally') {
			// A number modifies add up on; nothing more to say.
		} else if (sel?.kind === 'derived') {
			if (!Array.isArray(sel.from) || !sel.from.length)
				out.push(finding('bad-selector', `${at} is derived from nothing. Name the selectors it reads.`))
			else for (const f of sel.from.filter((f) => !all.has(f)))
				out.push(finding('unknown-selector', `${at} is derived from '${f}', which no stat or selector of ${id} is.`))
			if (sel.onSheet !== undefined && typeof sel.onSheet !== 'boolean')
				out.push(finding('bad-selector', `${at}.onSheet is true or left out.`))
			out.push(...i18nFindings(sel.label, `${at}.label`).map((f) => finding('display-text', f)))
		} else if (!['stat', 'check', 'derived', 'tally'].includes((sel as { kind?: string })?.kind as string))
			out.push(finding('bad-selector', `${at} is a '${String((sel as { kind?: unknown })?.kind)}' selector. Say 'stat', 'check', 'derived' or 'tally'.`))
	}
	// Derived selectors are pure functions in dependency order: a cycle has none.
	const derived = new Map(Object.entries(props.selectors ?? {}).filter(([, s]) => s?.kind === 'derived') as [string, { from: readonly string[] }][])
	const state = new Map<string, 'open' | 'done'>()
	const visit = (n: string, path: string[]): void => {
		if (state.get(n) === 'done' || !derived.has(n)) return
		if (state.get(n) === 'open') {
			out.push(finding('derived-cycle', `${id} derives ${[...path.slice(path.indexOf(n)), n].join(' → ')} — a cycle has no order to compute in.`))
			return
		}
		state.set(n, 'open')
		for (const f of derived.get(n)!.from ?? []) visit(f, [...path, n])
		state.set(n, 'done')
	}
	for (const n of derived.keys()) visit(n, [])
	// `within` chains end: a check counting within itself through others has no generic parent.
	for (const [name, sel] of Object.entries(props.selectors ?? {})) {
		if (sel?.kind !== 'check' || typeof sel.within !== 'string') continue
		const seen = new Set([name])
		let at: string | undefined = sel.within
		while (at !== undefined) {
			if (seen.has(at)) {
				out.push(finding('derived-cycle', `${id}.selectors.${name} counts within a chain that comes back to '${at}'. A check's generic parent ends somewhere.`))
				break
			}
			seen.add(at)
			const next: RulesetSelectorDecl | undefined = props.selectors?.[at]
			at = next?.kind === 'check' ? next.within : undefined
		}
	}
	return out
}

function compendiumFindings(id: string, props: RulesetProps): string[] {
	const c = props.compendium
	if (!c) return []
	const out: string[] = []
	const reps = new Map((props.repertoires ?? []).map((r) => [r.id, r]))
	for (const [repId, rows] of Object.entries(c.rows ?? {})) {
		const rep = reps.get(repId)
		if (!rep) {
			out.push(finding('unknown-repertoire', `${id}.compendium has rows for '${repId}', which ${id} does not declare.`))
			continue
		}
		const ids = new Set<string>()
		;(rows ?? []).forEach((row, i) => {
			const at = `${id}.compendium.${repId}[${i}]`
			const { id: rowId, version, source, lang, piece, ...extra } = row ?? ({} as CompendiumRow)
			// Bookkeeping beside, the piece nested: a flat row (the shape before
			// 2026-10-17) would read its fields as unknown row keys.
			if (Object.keys(extra).length)
				out.push(finding('bad-row', `${at} says ${Object.keys(extra).map((k) => `'${k}'`).join(', ')} beside its bookkeeping. A row is { id, version, source?, lang?, piece: { … } } — the piece's fields go inside 'piece'.`))
			if (typeof rowId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rowId))
				out.push(finding('bad-row', `${at}.id is '${String(rowId)}'. A row id is lowercase words joined by '-'.`))
			else if (ids.has(rowId)) out.push(finding('duplicate-row', `${at} repeats the row id '${rowId}'.`))
			else ids.add(rowId)
			if (typeof version !== 'string' || !version) out.push(finding('bad-row', `${at} has no version. Rows are pinned by version; say one.`))
			const src = source ?? c.source
			if (!src) out.push(finding('missing-source', `${at} names no source, and the compendium has no default. Every row says the document it comes from and its licence.`))
			else if (typeof src.document !== 'string' || !src.document || typeof src.licence !== 'string' || !src.licence)
				out.push(finding('missing-source', `${at}'s source is { document, licence } — both non-empty.`))
			if (lang !== undefined && (typeof lang !== 'string' || !lang)) out.push(finding('bad-row', `${at}.lang is a language tag.`))
			if (!piece || typeof piece !== 'object' || Array.isArray(piece)) {
				out.push(finding('bad-row', `${at} has no piece. A row is { id, version, source?, lang?, piece: { name, description, … } }.`))
				return
			}
			const why = checkPiece(rep, { kind: 'inline', ...piece } as never, { timeUnit: props.conventions?.time?.unit })
			if (why) out.push(finding('bad-row', `${at} is not a '${repId}' piece: ${why}`))
		})
	}
	return out
}

/**
 * 🚧 Every reason a ruleset is refused, each opened by its reason's name.
 *
 * Reasons: `invalid-id` · `display-text` · `missing-voice` · `unknown-rigour`
 * · `empty-voice` · `voice-too-long` · `missing-conventions` · `bad-dice` ·
 * `no-bands` · `bad-band` · `duplicate-band` · `no-success-band` ·
 * `bad-time-unit` · `bad-actions` · `bad-rest` · `unknown-stat` ·
 * `duplicate-stat` · `bad-stat-default` · `bad-borrowed` · `bad-selector` ·
 * `duplicate-selector` · `unknown-selector` · `derived-cycle` ·
 * `duplicate-repertoire` · `unknown-repertoire` · `bad-row` ·
 * `duplicate-row` · `missing-source` · `bad-script-phase` · `bad-script` ·
 * `duplicate-script` · `bad-bonuses` · `bad-setting` · `setting-overlap` ·
 * `bad-preset` · every repertoire reason (`repertoireFindings`, in this
 * ruleset's context) and every conversion reason (`conversionFindings`).
 * @internal
 */
export function rulesetFindings(id: string, props: RulesetProps): string[] {
	const out: string[] = []
	if (typeof id !== 'string' || !RULESET_ID_PATTERN.test(id))
		out.push(finding('invalid-id', `'${String(id)}' is not a ruleset id. Use 'owner:ruleset/name@N' — 'core:ruleset/freeform@1'.`))
	out.push(...i18nFindings(props?.name, `${id} name`, { required: true }).map((f) => finding('display-text', f)))
	out.push(...i18nFindings(props?.description, `${id} description`).map((f) => finding('display-text', f)))
	const voice = props?.voice ?? {}
	if (typeof voice.prose !== 'string')
		out.push(finding('missing-voice', `${id} has no prose voice. Every ruleset renders at prose; say in a sentence or two how play runs under it.`))
	for (const [k, v] of Object.entries(voice)) {
		if (!RIGOURS.includes(k as Rigour)) out.push(finding('unknown-rigour', `${id}.voice.${k}: the rigours are ${RIGOURS.join(', ')}.`))
		else if (typeof v !== 'string' || !v.trim()) out.push(finding('empty-voice', `${id}.voice.${k} is empty. Write it, or leave the key out.`))
		else if (v.length > VOICE_MAX_CHARS)
			out.push(finding('voice-too-long', `${id}.voice.${k} is ${v.length} characters; a voice is at most ${VOICE_MAX_CHARS} (about 60 tokens) — it rides in every prompt at that rigour.`))
	}
	const selectors = rulesetSelectors({ stats: props?.stats ?? [], selectors: props?.selectors })
	out.push(...conventionFindings(id, props?.conventions, selectors))
	if (props?.conventions) out.push(...settingFindings(id, props, selectors))
	const seenStats = new Set<string>()
	;(props?.stats ?? []).forEach((entry, i) => {
		const decl = getAttributeSlot(entry?.id)
		if (!decl) {
			out.push(finding('unknown-stat', `${id}.stats[${i}] names '${String(entry?.id)}', which nothing declares. Declare the slot above the ruleset.`))
			return
		}
		if (seenStats.has(entry.id)) out.push(finding('duplicate-stat', `${id}.stats names '${entry.id}' twice.`))
		seenStats.add(entry.id)
		if (entry.borrowed !== undefined && entry.borrowed !== true)
			out.push(finding('bad-borrowed', `${id}.stats['${entry.id}'].borrowed is true or left out — a ruleset owns what it lists unless it says it borrows it.`))
		if (entry.default !== undefined) {
			const why = checkSlotValue(decl, entry.default, resolveSlotConfig(decl, entry.config))
			if (why) out.push(finding('bad-stat-default', `${id}.stats gives '${entry.id}' a default it refuses: ${why}`))
		}
	})
	out.push(...selectorFindings(id, { ...props, stats: props?.stats ?? [] }))
	const reps = props?.repertoires ?? []
	const seenReps = new Set<string>()
	for (const r of reps) {
		if (seenReps.has(r.id)) out.push(finding('duplicate-repertoire', `${id} declares the repertoire '${r.id}' twice.`))
		seenReps.add(r.id)
	}
	const ctx = rulesetContext({ ...props, id, stats: props?.stats ?? [], repertoires: reps })
	for (const r of reps) out.push(...repertoireFindings(r, ctx))
	out.push(...compendiumFindings(id, { ...props, repertoires: reps }))
	const seeds = new Set<string>()
	;(props?.scripts ?? []).forEach((s, i) => {
		const at = `${id}.scripts[${i}]`
		if (!RULESET_SCRIPT_PHASES.includes(s?.phase))
			out.push(finding('bad-script-phase', `${at}.phase is '${String(s?.phase)}'. Say one of ${RULESET_SCRIPT_PHASES.join(', ')}.`))
		if (!Number.isInteger(s?.priority)) out.push(finding('bad-script', `${at}.priority is a whole number.`))
		if (typeof s?.seedKey !== 'string' || !s.seedKey) out.push(finding('bad-script', `${at} names no seedKey.`))
		else if (seeds.has(s.seedKey)) out.push(finding('duplicate-script', `${at} repeats the seedKey '${s.seedKey}'.`))
		else seeds.add(s.seedKey)
	})
	;(props?.conversions ?? []).forEach((c, i) => out.push(...conversionFindings(c, { ruleset: id }, `${id}.conversions[${i}]`)))
	for (const r of props?.entryable ?? [])
		if (!seenReps.has(r)) out.push(finding('unknown-repertoire', `${id}.entryable names '${r}', which ${id} does not declare.`))
	return out
}

/**
 * 🚧 What upgrading a ruleset from `prev` to `next` would leave unread or
 * refuse: a repertoire or stat that disappears, a piece field that
 * disappears without a `renames` entry or a `retired` mark on its
 * repertoire, a field whose field type changes (a stored `'heavy'` read as
 * an integer), and a field that becomes required with no default (every
 * stored piece without it would be refused at its next write). Shape changes
 * never rewrite stored data, so a version that breaks it silently is refused
 * here instead.
 *
 * Reasons: `not-same-ruleset` · `dropped-repertoire` · `dropped-stat` ·
 * `dropped-field` · `changed-field-type` · `newly-required`.
 * @experimental
 */
export function rulesetUpgradeFindings(prev: RulesetDecl, next: RulesetDecl): string[] {
	if (prev.id !== next.id)
		return [finding('not-same-ruleset', `${prev.id} and ${next.id} are two rulesets. An upgrade keeps the id; moving between rulesets is a conversion.`)]
	const out: string[] = []
	const nextStats = new Set(next.stats.map((s) => s.id))
	for (const s of prev.stats)
		if (!nextStats.has(s.id))
			out.push(finding('dropped-stat', `${next.id} drops the stat '${s.id}'. Values stored under it would read through nothing; keep it on the ruleset.`))
	const nextReps = new Map(next.repertoires.map((r) => [r.id, r]))
	for (const r of prev.repertoires) {
		const n = nextReps.get(r.id)
		if (!n) {
			out.push(finding('dropped-repertoire', `${next.id} drops the repertoire '${r.id}'. Pieces held in it would read through nothing; keep it and retire its fields instead.`))
			continue
		}
		const was = r.piece.fields ?? {}
		const now = n.piece.fields ?? {}
		for (const k of Object.keys(was)) {
			const to = k in now ? k : n.renames?.[k]
			if (to === undefined || !(to in now)) {
				if (!n.retired?.includes(k))
					out.push(finding('dropped-field', `${next.id} '${r.id}' drops the piece field '${k}'. Say renames: { ${k}: '<new>' } or retired: ['${k}'] so stored pieces still read.`))
				continue
			}
			if (was[k]!.type !== now[to]!.type)
				out.push(finding('changed-field-type', `${next.id} '${r.id}' changes '${to}' from ${was[k]!.type} to ${now[to]!.type}. Stored pieces hold the old kind of value; add a new field and retire this one.`))
		}
		// A field newly required with no default: what was stored without it is refused at its next write.
		const prevOf = new Map<string, (typeof was)[string]>()
		for (const [k, d] of Object.entries(was)) prevOf.set(k in now ? k : (n.renames?.[k] ?? k), d)
		for (const [k, decl] of Object.entries(now)) {
			if (!decl.required || decl.default !== undefined) continue
			if (!prevOf.get(k)?.required)
				out.push(finding('newly-required', `${next.id} '${r.id}' makes '${k}' required with no default. Pieces stored without it would be refused; give it a default.`))
		}
	}
	return out
}

// ── The registry ────────────────────────────────────────────────────────────

const registry = new Map<RulesetId, RulesetDecl>()

function register(id: RulesetId, props: RulesetProps): RulesetDecl {
	const found = rulesetFindings(id, props)
	if (found.length) throw new RulesetError(id, found)
	const decl: RulesetDecl = Object.freeze({
		...props,
		id,
		stats: Object.freeze([...props.stats]),
		repertoires: Object.freeze([...props.repertoires]),
	})
	const existing = registry.get(id)
	if (existing) refuseUnlessIdentical(existing, decl, `duplicate ruleset id: ${id}`, RULESET_DISPLAY_KEYS)
	registry.set(id, decl)
	const rows = new Map<string, ReadonlySet<string>>(
		Object.entries(props.compendium?.rows ?? {}).map(([rep, list]) => [rep, new Set(list.map((r) => r.id))]),
	)
	_registerRulesetRepertoires(id, decl.repertoires, rows, props.conventions.time.unit)
	// What it lists, it owns — unless it borrows the slot (`RulesetStatEntry`).
	_registerRulesetStats(id, decl.stats.filter((s) => s.borrowed !== true).map((s) => s.id))
	return decl
}

/**
 * 🚧 Declare a ruleset. Written below the slots its stats name and with its
 * repertoires built (`defineRepertoire`); refused on any finding
 * (`RulesetError`). An identical re-declaration is a no-op; a different one
 * under a claimed id throws with both hashes.
 * @experimental
 */
export function defineRuleset(id: RulesetId, props: RulesetProps): RulesetDecl {
	return register(id, props)
}

/** 🚧 The plugin-facing door — the same registration, minus core's namespace. @internal */
export function definePluginRuleset(pluginId: string, id: RulesetId, props: RulesetProps): RulesetDecl {
	if (id.startsWith('core:'))
		throw new Error(
			`plugin '${pluginId}' may not declare '${id}': the 'core:' namespace is reserved. Publish it ` +
				`under your own namespace — a ruleset two parties can define is one whose mechanics depend on load order.`,
		)
	return register(id, props)
}

/** @experimental */
export const getRuleset = (id: RulesetId): RulesetDecl | undefined => registry.get(id)
/** @experimental */
export const rulesets = (): RulesetDecl[] => [...registry.values()]
/** @internal */
export function _clearRulesets(): void {
	registry.clear()
	_clearRepertoires()
	_clearRulesetStats()
}
