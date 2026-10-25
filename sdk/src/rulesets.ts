/**
 * 🚧 Rulesets — a namespaced bundle of mechanics a session's owners are read
 * and resolved by.
 *
 * A ruleset is `<creator>:ruleset/<name>@N` (`core:ruleset/freeform@1`).
 * 🚧 Since 2026-10-23 it is declared in **seven sections** — attributes,
 * functions, entry types, zone types, outcomes and time, library, options
 * (`rulesetSections.ts`), nothing required beyond a name (R9: `{ name }` is
 * a ruleset from scratch). ⏳ The shape before the sections, read into them
 * by `rulesetSections` / `normaliseRuleset`, says in one declaration:
 *
 *  · its **voice** — per rigour, the short paragraph a model reads about how
 *    play runs under it;
 *  · its **conventions** — its check methods (how a risky moment is
 *    decided: dice, cards, a spend, a comparison, or nobody's roll at all —
 *    `checkMethods.ts`), the degree crosswalk onto the five bands, the unit
 *    time is kept in, actions and rests;
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
	_defineRulesetAttributeSlot,
	_registerRulesetStats,
	_withdrawAttributeSlot,
	_withdrawRulesetStats,
	checkSlotValue,
	getAttributeSlot,
	isReservedAttributeOwner,
	resolveSlotConfig,
	type AttributeSlotDecl,
	type SlotId,
} from './attributes.js'
import type { SheetSlotEntry } from './sheets.js'
import type { PlaytestChange, PlaytestMember } from './rulesetTemplates.js'
import { getVocabulary, isVocabulary, VOCABULARY_OWNERS, type Vocabulary, type VocabularyId } from './vocabularies.js'
import {
	_clearRepertoires,
	_registerRulesetRepertoires,
	_withdrawRulesetRepertoires,
	checkPiece,
	finding,
	repertoireFindings,
	RULESET_ID_PATTERN,
	RulesetError,
	type RepertoireContext,
	type RepertoireDecl,
	type PieceProps,
	type MechanicDecl,
} from './repertoires.js'
import { conversionFindings, type ConversionDecl } from './conversions.js'
import { _describeRulesetEntryType, _withdrawEntryType, type EntryDescriptor, type EntryShape, type EntryTypeDecl } from './descriptors.js'
import {
	checkMethodFindings,
	checkMethodKind,
	difficultyBandListFindings,
	isPackageCheckMethodKind,
	LEGACY_DIE_METHOD,
	NONE_CHECK_METHOD,
	type CheckMethodDecl,
} from './checkMethods.js'
import { functionProvides, functionRefDecides, functionWayKeys } from './functions.js'
import {
	_entryTypeAsRepertoire,
	declaresSections,
	entryTypeFields,
	rulesetAttributeSlotDecls,
	rulesetAttributeSlots,
	rulesetSectionFindings,
	rulesetSections,
	sectionsConventions,
	sectionsLegacyView,
	sectionsSettings,
	type RulesetSections,
} from './rulesetSections.js'

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
 * ruleset's scripts and its check methods' chance — dice, cards). Each level
 * includes the ones before.
 * @experimental
 */
export type Rigour = 'prose' | 'mechanics' | 'scripts'
/** @experimental */
export const RIGOURS: readonly Rigour[] = ['prose', 'mechanics', 'scripts']

/**
 * 🚧 **How strict**, in the interface's words (NOMENCLATURE §28): the rigour
 * ids are never shown. `prose` → _Words only_, `mechanics` → _Rules_,
 * `scripts` → _The rules decide_ (2026-10-22: no level is named for dice — a
 * ruleset may decide by cards, a spend or no chance at all). The ids are
 * unchanged, so a stored session's rigour reads as it did.
 * @experimental
 * @ruling PLAN-rulesets-authoring D1 (2026-10-22)
 */
export const RIGOUR_LABELS: Readonly<Record<Rigour, string>> = Object.freeze({
	prose: 'Words only',
	mechanics: 'Rules',
	scripts: 'The rules decide',
})

/**
 * 🚧 The one scale every ruleset's degrees cross-walk onto, worst first —
 * exported for the `dice` message block, whose `five` is one of these.
 * @experimental
 */
export const FIVE_BANDS = ['crit-fail', 'fail', 'partial', 'success', 'crit'] as const
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

/**
 * 🚧 The degrees a ruleset that declares none reads by (2026-10-22: degrees
 * are optional): _Failure_ (`fail`) below the target, _Success_ (`success`)
 * at or above it. `FIVE_BANDS` stays the one outcome scale.
 * @experimental
 */
export const DEFAULT_DEGREES: DegreeCrosswalk = Object.freeze({
	bands: Object.freeze([
		Object.freeze({ id: 'failure', label: { en: 'Failure' }, five: 'fail' as const }),
		Object.freeze({ id: 'success', label: { en: 'Success' }, five: 'success' as const, from: 0 }),
	]),
}) as DegreeCrosswalk

/** How bonuses stack: of each type keep the highest bonus and the lowest penalty, or add them all. */
/** 🚧 How typed bonuses stack; the editor's choices. @experimental */
export const BONUS_STACKINGS = ['highest-per-type', 'sum'] as const

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
 * ⏳ The die a check rolls, and the selector whose value modifies a check
 * that names no `base` of its own — the shape before check methods
 * (2026-10-22). Read as one die-target method keyed `die`
 * (`normaliseRuleset`); say `methods` instead.
 */
interface RulesetDice {
	sides: number
	modifierOf?: string
}

/** 🚧 The units a ruleset keeps time in; the editor's choices. @experimental */
export const RULESET_TIME_UNITS = ['round', 'minute', 'hour', 'day', 'scene'] as const
/** 🚧 The unit a ruleset counts time in; `roundSeconds` for a round. @experimental */
export interface RulesetTime {
	unit: (typeof RULESET_TIME_UNITS)[number]
	roundSeconds?: number
}

/**
 * The turn economy: how many actions a turn holds (`perTurn`), whether a
 * reaction is had besides, and the kinds of action a turn spends. 🚧
 * `perTurn` (and `reaction`) is read by the handler into the voice block's
 * **turn economy line** where numbers show — _A turn holds 3 actions and a
 * reaction._ (PLAN-rulesets-authoring D1: read, not dropped; lane M2).
 */
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

/**
 * 🚧 **Casting from a pool** (2026-10-22, PLAN-rulesets-authoring D1: a
 * ruleset's numbers live in its declaration, never in the engine) — what a
 * cast costs when a ruleset spends a **pool** for it rather than the piece
 * itself (Vis Itineris's _Spell points_, laid by its `casting: points`
 * setting's choice):
 *
 *  · `pool` — the stat a cast spends from: its selector
 *    (`itineris-spell-points`) or its slot id;
 *  · `cost` — the piece field whose value a cast costs (`level`; `0` costs
 *    nothing); `piece.level` reads the same;
 *  · `repertoire` — the one repertoire casts come out of; absent, every
 *    repertoire tagged `casting`;
 *  · `refill` — the rest (`rest[].id`) that fills the pool back; absent, the
 *    long rest, else the longest;
 *  · `max` — the selector whose value the pool fills back to (a derived
 *    value, `spell-points-max`); absent, the pool's own maximum.
 *
 * ⚠ Not a **casting** repertoire tag (what a repertoire's pieces are); a
 * casting pool is what a cast from them spends. Read by the host's handler
 * (`castingPoolOf`); refused when authored with the reason named
 * (`bad-casting`, `unknown-selector`, `unknown-repertoire`).
 * @experimental
 * @ruling PLAN-rulesets-authoring D1 (2026-10-22)
 */
export interface RulesetCasting {
	pool: string
	cost: string
	repertoire?: string
	refill?: string
	max?: string
}

/**
 * 🚧 One of a ruleset's **difficulty bands** — a named target a check is
 * rolled against (_Hard_, 20): its id, the word a person reads, the target
 * number and, on exactly one band, `default: true` — the difficulty an
 * automatic roll uses when nobody picked one (the Lair's _Decide checks at once_).
 *
 * What a `roll` message block offers the person deciding a check (the
 * Lair's game master): the bands in the ruleset's order, plus _No check_.
 * 🚧 Held by a check method that is made against a target (`die-target`,
 * `card-draw`, `compare` — its `bands`); the top-level
 * `RulesetProps.difficultyBands` is ⏳, read as the `die` method's.
 *
 * ⚠ Not a **degree band** (`DegreeBand`, what a roll's result reads as) —
 * a difficulty band is what the roll is made against; not a budget band
 * (an entry type's `sourceKind`); and not the Dungeon Crawler's
 * `core:slot/difficulty@1` (how harsh the whole table is — Gentle, Fair,
 * Brutal).
 * @experimental
 * @ruling Lair rewrite D3 (2026-10-21)
 */
export interface DifficultyBand {
	id: string
	label: I18n
	description?: I18n
	/** The total a check must reach — the target its margin is read from. A whole number. */
	target: number
	/** The band an automatic roll is made against. Exactly one band says so. */
	default?: true
}

/** @experimental */
export interface RulesetConventions {
	/** ⏳ One die-target method, the shape before check methods — say `methods` (`normaliseRuleset`). */
	dice?: RulesetDice
	/**
	 * 🚧 How a risky moment is decided, by a name of the ruleset's own
	 * (`{ d20: { kind: 'die-target', sides: 20 } }`): see `checkMethods.ts`.
	 * Absent (and no `dice`): nothing is decided by chance; every check is
	 * judged (`none`).
	 * @ruling PLAN-rulesets-authoring R1, D1 (2026-10-22)
	 */
	methods?: Readonly<Record<string, CheckMethodDecl>>
	/** 🚧 The method a check uses when its selector names none. Required when there are two or more. */
	defaultMethod?: string
	/**
	 * The ruleset's own degrees, cross-walked onto `FIVE_BANDS`. 🚧 Optional
	 * since 2026-10-22: absent, a check reads as _Failure_ or _Success_
	 * (`DEFAULT_DEGREES`).
	 */
	degrees?: DegreeCrosswalk
	time: RulesetTime
	actions?: RulesetActions
	rest?: readonly RulesetRest[]
	bonuses?: RulesetBonuses
	/** 🚧 What a cast spends when it spends a pool (`RulesetCasting`); absent, a cast spends its piece. */
	casting?: RulesetCasting
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
 *  · `check` — something decided by a check method: `base` is the selector
 *    whose value the check reads (a die-target's modifier — an ability
 *    modifier, proficiency arriving as a `modify` on the check; a dice
 *    pool's size; a comparison's value). No `base`: the method's fallback
 *    (`modifierOf`, `poolOf`), else a bare die. 🚧 `method` names the check
 *    method it is decided by (a key of `conventions.methods`); absent, the
 *    ruleset's `defaultMethod` (2026-10-22).
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
	| { kind: 'check'; base?: string; within?: string; method?: string }
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

/** 🚧 The handler's fixed phase order a ruleset script plugs into (§25); the editor shows it. @experimental */
export const RULESET_SCRIPT_PHASES = ['effects', 'derived', 'pre-roll', 'post-roll', 'render'] as const
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

/**
 * What `defineRuleset` takes: a name, and 🚧 the seven sections
 * (`RulesetSections` — attributes, functions, entry types, zone types,
 * outcomes, time, library, options), every one optional (R9). ⏳ The keys
 * before the sections (`conventions`, `difficultyBands`, `settings`,
 * `presets`, `stats`, `selectors`, `repertoires`, `compendium`, `scripts`,
 * `conversions`, `entryable`) are still read — into the sections by
 * `rulesetSections` — and refused beside the section each became
 * (`legacy-beside-section`).
 * @experimental
 */
export interface RulesetProps extends RulesetSections {
	/** The name a person reads. Display text. */
	name: I18n
	description?: I18n
	/**
	 * Per rigour, what a model reads about play under this ruleset. Model-facing; at most ~60 tokens each.
	 * 🚧 Optional since 2026-10-23 (R9): a ruleset from scratch has no voice. Said, it says the prose line.
	 */
	voice?: Partial<Record<Rigour, string>>
	/** ⏳ The shape before the sections: methods → `functions`, degrees → `outcomes`, time, actions and rests → `time`. */
	conventions?: RulesetConventions
	/**
	 * ⏳ The targets a check may be rolled against, in the order a person
	 * reads them (easiest first, by convention) — `DifficultyBand`. Since
	 * 2026-10-22 a check method holds its own (`methods.<name>.bands`); this
	 * top-level list is read as the ⏳ `conventions.dice` method's
	 * (`normaliseRuleset`) and is refused beside `methods`. Absent when
	 * unstated, so a ruleset that says nothing hashes as it did.
	 * @ruling Lair rewrite D3 (2026-10-21); PLAN-rulesets-authoring D1 (2026-10-22)
	 */
	difficultyBands?: readonly DifficultyBand[]
	/** ⏳ The ways a table may play it, by setting name; each choice may lay conventions over `conventions`. Read as `options`. */
	settings?: Readonly<Record<string, RulesetSettingDecl>>
	/** ⏳ Named sets of setting values offered as one pick. Read as `options.presets`. */
	presets?: readonly RulesetPresetDecl[]
	/**
	 * ⏳ The ruleset's stats, in order, as a sheet names slots — read as
	 * `attributes`. Each is owned by the ruleset unless marked `borrowed`.
	 */
	stats?: readonly RulesetStatEntry[]
	/** ⏳ Read as `functions` (checks, worked-out values, tallies) and `attributes` (another slot's name). */
	selectors?: Readonly<Record<string, RulesetSelectorDecl>>
	/** ⏳ Read as `entryTypes`. */
	repertoires?: readonly RepertoireDecl[]
	/** ⏳ Read as `library`. */
	compendium?: CompendiumDecl
	/** ⏳ Read as function modules the ruleset carries (`functions`), their bodies the seeded rows. */
	scripts?: readonly RulesetScriptDecl[]
	/** ⏳ Read as `options.conversions`. */
	conversions?: readonly ConversionDecl[]
	/** ⏳ Repertoire ids whose pieces become lorebook entry types. Absent: every repertoire declaring `entryable`. */
	entryable?: readonly string[]
	/**
	 * 🚧 The **vocabularies this ruleset plays** (A19, R27): shared words it
	 * answers to — the common vocabulary, a custom one another package shares
	 * — natively, or with `map` onto its own stats. The declarations, never
	 * ids (A18); stored as their ids. A ruleset is itself a vocabulary of its
	 * own stats (`rulesetVocabulary`), so it never lists itself. Absent when
	 * unstated, so a ruleset that says nothing hashes as it did.
	 * @ruling A19, R27, R28
	 */
	plays?: readonly Vocabulary[]
	/**
	 * 🚧 Played members read as this ruleset's own stats (A19):
	 * `[[common.cast.health, vigourSlot]]` — objects on both sides; the left a
	 * member of a vocabulary it plays, the right one of its own `stats`.
	 * Stored as slot-id pairs. A reference to the left resolves to the right
	 * in a session on this ruleset (`resolveAttributeRef`).
	 * @ruling A19
	 */
	map?: readonly (readonly [AttributeSlotDecl, AttributeSlotDecl])[]
	/**
	 * 🚧 A **ruleset template** (2026-10-22, PLAN-rulesets-authoring D3): an
	 * archetype to start a ruleset of one's own from — complete and small,
	 * with sample rows and a playtest scene beside it (`RulesetTemplate`) —
	 * never one a session or lorebook plays. Declared with
	 * `defineRulesetTemplate`; `defineRuleset` refuses it
	 * (`template-not-played`), so it is never offered under Rules, and a copy
	 * (`reidRulesetDocument`) is never a template. Absent when unstated, so a
	 * ruleset that says nothing hashes as it did.
	 * @ruling PLAN-rulesets-authoring D3 (2026-10-22)
	 */
	template?: true
	/**
	 * 🚧 The author's own **handbook** pages (2026-10-23, D8): `{ title, body }`
	 * beside the pages the handbook generator writes from the sections. A page
	 * titled as a generated one replaces it. Documentation for people: never
	 * read into a prompt. Absent when unstated, so a ruleset that says nothing
	 * hashes as it did.
	 */
	handbook?: readonly HandbookPage[]
	/**
	 * 🚧 Playtest scenes **saved as tests** (2026-10-23, D8): what the editor's
	 * _Save as a test_ keeps and _Load_ reads back. No session plays them.
	 * Absent when unstated, so a ruleset that says nothing hashes as it did.
	 */
	playtests?: readonly SavedPlaytest[]
}

/**
 * 🚧 One page an author writes into a **handbook** (2026-10-23, D8): a
 * title and its body, Markdown. A ruleset's or a genre's `handbook` lists
 * them beside the generated pages.
 * @experimental
 */
export interface HandbookPage {
	title: string
	body: string
}

/**
 * 🚧 A playtest scene **saved as a test** (2026-10-23, D8): its name, the
 * sample party, the situation, the one change it puts through the rules (or
 * none), How strict it runs and the seed it rolls from.
 * @experimental
 */
export interface SavedPlaytest {
	name: string
	party: readonly PlaytestMember[]
	situation?: I18n
	change: PlaytestChange | null
	rigour?: Rigour
	seed?: string
}

const isPlainRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * 🚧 Every reason a `handbook` is refused (`bad-handbook`): a list of
 * `{ title, body }`, each title said once.
 * @experimental
 */
export function handbookFindings(handbook: unknown, at: string): string[] {
	if (handbook === undefined) return []
	if (!Array.isArray(handbook)) return [finding('bad-handbook', `${at}.handbook lists pages — handbook: [{ title, body }].`)]
	const out: string[] = []
	const titles = new Set<string>()
	handbook.forEach((p, i) => {
		if (!isPlainRecord(p) || typeof p.title !== 'string' || !p.title.trim() || typeof p.body !== 'string')
			return void out.push(finding('bad-handbook', `${at}.handbook[${i}] is { title, body } — a title and its words.`))
		const key = p.title.trim().toLowerCase()
		if (titles.has(key)) out.push(finding('bad-handbook', `${at}.handbook has two pages titled '${p.title}'. Give each page a title of its own.`))
		titles.add(key)
	})
	return out
}

/**
 * 🚧 Every reason a ruleset's saved tests are refused (`bad-playtests`): a
 * list of `{ name, party, situation?, change, rigour?, seed? }`, each named
 * once, a party of one to four by name, a change or `null`. What a test
 * names is not checked against the ruleset: a stale test is read, never
 * refused.
 * @experimental
 */
export function savedPlaytestFindings(playtests: unknown, at: string): string[] {
	if (playtests === undefined) return []
	if (!Array.isArray(playtests)) return [finding('bad-playtests', `${at}.playtests lists saved scenes — playtests: [{ name, party, situation, change }].`)]
	const out: string[] = []
	const names = new Set<string>()
	playtests.forEach((t, i) => {
		const here = `${at}.playtests[${i}]`
		if (!isPlainRecord(t) || typeof t.name !== 'string' || !t.name.trim())
			return void out.push(finding('bad-playtests', `${here} is { name, party, situation, change } — say its name.`))
		if (names.has(t.name)) out.push(finding('bad-playtests', `${at}.playtests names '${t.name}' twice.`))
		names.add(t.name)
		const party = Array.isArray(t.party) ? t.party : undefined
		if (!party || party.length < 1 || party.length > 4) out.push(finding('bad-playtests', `${here}.party seats ${party?.length ?? 0}. A playtest seats one to four.`))
		party?.forEach((m, j) => {
			if (!isPlainRecord(m) || typeof m.name !== 'string' || !m.name.trim()) out.push(finding('bad-playtests', `${here}.party[${j}] is { name, stats?, pieces? }.`))
		})
		if (t.change !== null && !isPlainRecord(t.change)) out.push(finding('bad-playtests', `${here}.change is { owner, op, … }, or null when nothing happens.`))
		if (t.rigour !== undefined && !RIGOURS.includes(t.rigour as Rigour)) out.push(finding('bad-playtests', `${here}.rigour is one of ${RIGOURS.join(', ')}.`))
		if (t.seed !== undefined && typeof t.seed !== 'string') out.push(finding('bad-playtests', `${here}.seed is words.`))
		out.push(...i18nFindings(t.situation, `${here}.situation`).map((f) => finding('display-text', f)))
	})
	return out
}

/**
 * 🚧 Where a ruleset's declaration came from: `code` (core or a plugin, at
 * import) or `stored` (authored on the pub and loaded from a row —
 * `defineStoredRuleset`). Absent on a declaration means `code`, so a code
 * ruleset hashes as it always did.
 * @experimental
 */
export type RulesetOrigin = 'code' | 'stored'

/**
 * A declared ruleset: its props as written, except `plays` and `map`, stored
 * by id (the declarations' identities) — what `resolveAttributeRef` reads.
 * @experimental
 */
export interface RulesetDecl extends Omit<RulesetProps, 'plays' | 'map' | 'stats' | 'repertoires'> {
	readonly id: RulesetId
	/** ⏳ The stats as declared — always a list on the registered declaration (empty for a ruleset in sections), so a reader of the shape before them reads nothing rather than throwing. */
	readonly stats: readonly RulesetStatEntry[]
	/** ⏳ The repertoires as declared — always a list on the registered declaration (empty for a ruleset in sections). */
	readonly repertoires: readonly RepertoireDecl[]
	/** 🚧 `stored` for an authored ruleset; left out for one declared in code. */
	readonly origin?: 'stored'
	/** 🚧 Who authored a stored ruleset (the pub's user id). */
	readonly authorUserId?: number | string
	/** 🚧 The ids of the vocabularies it plays, in its order (`RulesetProps.plays`). */
	readonly plays?: readonly VocabularyId[]
	/** 🚧 `[played member's slot id, own stat's slot id]` pairs (`RulesetProps.map`). */
	readonly map?: readonly (readonly [SlotId, SlotId])[]
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
		rollsDice: rulesetRollsDice(decl),
	}
}

/** 🚧 The repertoires whose pieces become lorebook entry types. @experimental */
export const rulesetEntryable = (decl: Pick<RulesetProps, 'entryable' | 'repertoires'> & Pick<RulesetSections, 'entryTypes'>): readonly string[] =>
	// 🚧 A ruleset in sections: every entry type but one a repertoire said never was (2026-10-23, D2).
	decl.entryTypes !== undefined
		? decl.entryTypes.filter((e) => e?.entryable !== false).map((e) => e.id)
		: (decl.entryable ?? (decl.repertoires ?? []).filter((r) => r.entryable).map((r) => r.id))

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
export function rulesetEntryTypeDecls(
	ruleset: Pick<RulesetDecl, 'id' | 'entryable'> & { repertoires?: RulesetDecl['repertoires'] } & Pick<RulesetSections, 'entryTypes'>,
	universal: EntryUniversalParts,
): EntryTypeDecl[] {
	const found: string[] = []
	const out: EntryTypeDecl[] = []
	// 🚧 A ruleset in sections derives one per entry type (D2, D5): its whole
	// field shape (`entryTypeFields`) — the ⏳ path below is the repertoires'.
	if (ruleset.entryTypes !== undefined) {
		for (const e of ruleset.entryTypes) {
			if (!e || e.entryable === false) continue
			const own = entryTypeFields(e)
			for (const k of Object.keys(universal.fields))
				if (k in own)
					found.push(finding('entry-field-collision', `${ruleset.id} entry type '${e.id}' declares '${k}', which every entry already carries. Name the field otherwise.`))
			const { fields: _f, ...parts } = universal
			out.push({
				...parts,
				id: rulesetEntryTypeId(ruleset.id, e.id),
				i18n: { name: e.name, ...(e.description !== undefined ? { description: e.description } : {}) },
				fields: { ...own, ...universal.fields },
			})
		}
		if (found.length) throw new RulesetError(`${ruleset.id}'s derived entry types`, found)
		return out
	}
	for (const repId of rulesetEntryable(ruleset as Pick<RulesetProps, 'entryable' | 'repertoires'>)) {
		const rep = (ruleset.repertoires ?? []).find((r) => r.id === repId)
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
	ruleset: Pick<RulesetDecl, 'id' | 'entryable'> & { repertoires?: RulesetDecl['repertoires'] } & Pick<RulesetSections, 'entryTypes'>,
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
		// 🚧 A ruleset in sections: its entry type, read as a repertoire (one piece checker for both).
		const et = r.entryTypes?.find((x) => x.id === m[3])
		if (et) return { ruleset: r, repertoire: _entryTypeAsRepertoire(et) }
		const rep = r.repertoires.find((x) => x.id === m[3])
		if (rep) return { ruleset: r, repertoire: rep }
	}
	return undefined
}

// ── Findings ────────────────────────────────────────────────────────────────

function conventionFindings(
	id: string,
	c: RulesetConventions | undefined,
	selectors: ReadonlyMap<string, RulesetSelectorDecl>,
	reps: readonly RepertoireDecl[] = [],
	/** Check `casting` too — a setting's choice says so only when it lays one (else the ruleset's own is reported once). */
	casting = true,
): string[] {
	const at = `${id}.conventions`
	// 🚧 Optional since 2026-10-23 (R9): a ruleset from scratch keeps no time.
	if (c === undefined) return []
	if (!c || typeof c !== 'object')
		return [finding('missing-conventions', `${id}.conventions is an object — the shape before the sections; say time instead.`)]
	const out: string[] = []
	if (c.dice !== undefined) {
		if (!(Number.isInteger(c.dice?.sides) && c.dice.sides >= 2))
			out.push(finding('bad-dice', `${at}.dice.sides is ${String(c.dice?.sides)}. A die has a whole number of sides, at least 2.`))
		if (c.dice?.modifierOf !== undefined && !selectors.has(c.dice.modifierOf))
			out.push(finding('unknown-selector', `${at}.dice.modifierOf names '${c.dice.modifierOf}', which no stat or selector of ${id} is.`))
	}
	// 🚧 Check methods (2026-10-22), read against the degrees in force.
	const degreeIds = new Set(((c.degrees ?? DEFAULT_DEGREES).bands ?? []).map((b) => b?.id).filter((x): x is string => typeof x === 'string'))
	const stats = new Set([...selectors].filter(([, d]) => d.kind === 'stat').map(([k]) => k))
	out.push(...checkMethodFindings(at, c, { selectors: new Set(selectors.keys()), stats, degreeIds }))
	const bands = c.degrees?.bands
	// 🚧 Degrees are optional (2026-10-22): absent reads as DEFAULT_DEGREES.
	if (c.degrees === undefined) {
		// Nothing to check.
	} else if (!Array.isArray(bands) || !bands.length)
		out.push(finding('no-bands', `${at}.degrees declares no bands. Map the ruleset's degrees onto ${FIVE_BANDS.join(' / ')}, or leave degrees out to read as failure or success.`))
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
	if (casting && c.casting !== undefined) out.push(...castingFindings(at, c, selectors, reps))
	return out
}

/**
 * 🚧 `conventions.casting` (2026-10-22): a pool that is a stat, a cost a
 * piece field of the repertoire casts come out of, a rest the ruleset
 * declares and a selector to fill back to.
 */
function castingFindings(
	at: string,
	c: RulesetConventions,
	selectors: ReadonlyMap<string, RulesetSelectorDecl>,
	reps: readonly RepertoireDecl[],
): string[] {
	const k = c.casting as Partial<RulesetCasting> | null
	const where = `${at}.casting`
	if (!k || typeof k !== 'object' || Array.isArray(k))
		return [finding('bad-casting', `${where} is { pool, cost, repertoire?, refill?, max? } — the stat a cast spends and the piece field it costs.`)]
	const out: string[] = []
	for (const key of Object.keys(k))
		if (!['pool', 'cost', 'repertoire', 'refill', 'max'].includes(key))
			out.push(finding('bad-casting', `${where} says '${key}'. A casting pool is { pool, cost, repertoire?, refill?, max? }.`))
	const pool = typeof k.pool === 'string' && k.pool.includes(':') ? slotName(k.pool) : k.pool
	if (typeof pool !== 'string' || !pool) out.push(finding('bad-casting', `${where}.pool names the stat a cast spends from — its selector or its slot id.`))
	else if (!selectors.has(pool)) out.push(finding('unknown-selector', `${where}.pool names '${String(k.pool)}', which no stat of the ruleset is.`))
	else if (selectors.get(pool)!.kind !== 'stat')
		out.push(finding('bad-casting', `${where}.pool is '${pool}', a ${selectors.get(pool)!.kind} selector. A cast spends from a stat a character holds.`))
	const cost = typeof k.cost === 'string' ? k.cost.replace(/^piece\./, '') : undefined
	if (!cost) out.push(finding('bad-casting', `${where}.cost names the piece field a cast costs — 'level'.`))
	let from: readonly RepertoireDecl[] = []
	if (k.repertoire !== undefined) {
		const rep = reps.find((r) => r.id === k.repertoire)
		if (!rep) out.push(finding('unknown-repertoire', `${where}.repertoire names '${String(k.repertoire)}', which the ruleset does not declare.`))
		else from = [rep]
	} else {
		from = reps.filter((r) => Array.isArray(r.tags) && r.tags.includes('casting'))
		if (reps.length && !from.length)
			out.push(finding('bad-casting', `${where} names no repertoire, and none is tagged 'casting'. Say repertoire: 'spells', or tag the one casts come out of.`))
	}
	if (cost)
		for (const r of from)
			if (!Object.prototype.hasOwnProperty.call(r.piece?.fields ?? {}, cost))
				out.push(finding('bad-casting', `${where}.cost is '${cost}', which no '${r.id}' piece has. Name one of its fields — the one a cast costs.`))
	if (k.refill !== undefined && !(c.rest ?? []).some((r) => r?.id === k.refill))
		out.push(finding('bad-casting', `${where}.refill names the rest '${String(k.refill)}', which the ruleset does not declare (${(c.rest ?? []).map((r) => r.id).join(', ') || 'no rests'}).`))
	if (k.max !== undefined && (typeof k.max !== 'string' || !selectors.has(k.max)))
		out.push(finding('unknown-selector', `${where}.max names '${String(k.max)}', which no stat or selector of the ruleset is.`))
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
				if (props.conventions === undefined)
					out.push(finding('bad-setting', `${at}.choices[${i}] lays conventions over a ruleset that declares none. Lay them over conventions, or say what the choice changes in options.lays.`))
				else {
					const merged = { ...props.conventions, ...c.conventions } as RulesetConventions
					const lays = Object.prototype.hasOwnProperty.call(c.conventions, 'casting')
					for (const f of conventionFindings(`${at}.choices[${i}]`, merged, selectors, props.repertoires ?? [], lays)) out.push(f)
				}
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
 * 🚧 A ruleset's settings in the shape before the sections — its ⏳
 * `settings`, else its options' choices (`sectionsSettings`).
 * @internal
 */
export const settingsOf = (decl: Pick<RulesetProps, 'settings' | 'options'>): Readonly<Record<string, RulesetSettingDecl>> =>
	decl?.settings ?? sectionsSettings(decl?.options) ?? {}

/** 🚧 A ruleset's presets: its ⏳ `presets`, else its options'. @internal */
export const presetsOf = (decl: Pick<RulesetProps, 'presets' | 'options'>): readonly RulesetPresetDecl[] => decl?.presets ?? decl?.options?.presets ?? []

/**
 * 🚧 A session's full setting values for a ruleset: each setting's default,
 * then the preset's values, then the session's own. A name the ruleset does
 * not declare, or a choice a setting does not offer, is left out — it reads
 * as the layer beneath, never as an error at play time (`rulesetFindings`
 * refuses it where it is authored).
 * @experimental
 */
export function rulesetSettingValues(
	decl: Pick<RulesetProps, 'settings' | 'presets' | 'options'>,
	chosen: { preset?: string; values?: Readonly<Record<string, string>> } = {},
): Record<string, string> {
	const out: Record<string, string> = {}
	const settings = settingsOf(decl)
	const lay = (values: Readonly<Record<string, string>> | undefined) => {
		for (const [k, v] of Object.entries(values ?? {}))
			if (settings[k]?.choices.some((c) => c.id === v)) out[k] = v
	}
	for (const [k, s] of Object.entries(settings)) out[k] = s.default
	if (chosen.preset !== undefined) lay(presetsOf(decl).find((p) => p.id === chosen.preset)?.values)
	lay(chosen.values)
	return out
}

/**
 * 🚧 The preset whose values these are exactly, if any — what a picker shows
 * as selected. @experimental
 */
export function rulesetPresetOf(decl: Pick<RulesetProps, 'settings' | 'presets' | 'options'>, values: Readonly<Record<string, string>>): string | undefined {
	const full = rulesetSettingValues(decl, { values })
	return presetsOf(decl).find((p) => {
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
	decl: Pick<RulesetProps, 'conventions' | 'settings' | 'presets' | 'options'> & RulesetSections,
	values: Readonly<Record<string, string>> = {},
): RulesetConventions {
	const full = rulesetSettingValues(decl, { values })
	// 🚧 A ruleset in sections plays by what its sections read back as (`sectionsConventions`).
	let out: RulesetConventions = { ...(declaresSections(decl) ? sectionsConventions(decl) : undefined), ...decl.conventions } as RulesetConventions
	for (const [k, s] of Object.entries(settingsOf(decl))) {
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
			// 🚧 The check method it is decided by (2026-10-22): one the ruleset declares.
			if (sel.method !== undefined) {
				const methods = normaliseConventions({ conventions: props.conventions ?? ({} as RulesetConventions), difficultyBands: props.difficultyBands }).conventions.methods
				if (typeof sel.method !== 'string' || !Object.prototype.hasOwnProperty.call(methods, sel.method))
					out.push(finding('unknown-method', `${at}.method names '${String(sel.method)}', which is none of ${id}'s check methods (${Object.keys(methods).join(', ') || 'none declared'}).`))
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

/**
 * 🚧 `difficultyBands` (Lair rewrite D3), ⏳ since 2026-10-22: each a
 * well-formed band (`difficultyBandListFindings`), and declared only beside
 * the ⏳ `conventions.dice` it is read with — a band is a target a check is
 * made against, and a check method holds its own (`methods.<name>.bands`).
 */
function difficultyBandFindings(id: string, props: RulesetProps): string[] {
	const bands = props?.difficultyBands as readonly DifficultyBand[] | undefined
	if (bands === undefined) return []
	const at = `${id}.difficultyBands`
	const out = difficultyBandListFindings(at, bands)
	if (out.some((f) => f.startsWith('[bad-difficulty]') && f.includes('is a non-empty list'))) return out
	if (props.conventions?.methods !== undefined)
		out.unshift(finding('difficulty-beside-methods', `${at} is declared beside check methods. A method holds its own: move them under the method a check is made against (methods.<name>.bands).`))
	else if (!props.conventions?.dice)
		out.unshift(finding('difficulty-without-dice', `${at} is declared, and ${id} decides nothing against a target (no check method; conventions.dice). A difficulty band is a target a check is made against — declare a method that takes them, or leave the bands out.`))
	return out
}

// ── Check methods, read through the ⏳ aliases ──────────────────────────────

/**
 * 🚧 A ruleset's conventions as a host reads them (`normaliseRuleset`):
 * every check method by name — the ⏳ `dice` read as the `die` method, with
 * the ⏳ top-level `difficultyBands` as its bands — the default method when
 * one is in force, and the degrees in force (`DEFAULT_DEGREES` when none are
 * declared).
 * @experimental
 */
export interface NormalisedConventions extends Omit<RulesetConventions, 'dice' | 'methods' | 'defaultMethod' | 'degrees' | 'time'> {
	methods: Readonly<Record<string, CheckMethodDecl>>
	defaultMethod?: string
	degrees: DegreeCrosswalk
	/** 🚧 Absent for a ruleset that keeps no time (R9, 2026-10-23: a ruleset in sections may say none). */
	time?: RulesetTime
}

/** What `normaliseRuleset` reads: a declaration, a document, or the parts of one. */
type Normalisable = {
	conventions?: RulesetConventions | NormalisedConventions
	difficultyBands?: readonly DifficultyBand[]
	repertoires?: readonly RepertoireDecl[]
	settings?: RulesetProps['settings']
	presets?: RulesetProps['presets']
} & RulesetSections

/**
 * 🚧 A ruleset with its ⏳ aliases folded in — what `normaliseRuleset`
 * returns: its conventions as today's readers take them, and 🚧 its seven
 * `sections` (`rulesetSections`) as every new reader does.
 * @experimental
 */
export type NormalisedRuleset<T> = Omit<T, 'conventions' | 'difficultyBands'> & { conventions: NormalisedConventions; sections: RulesetSections }

/** A piece verb's ⏳ `dice: 'piece.<field>'`, as the amount it always meant. */
const withAmount = (m: MechanicDecl): MechanicDecl => {
	if ((m.verb !== 'harm' && m.verb !== 'heal') || m.dice === undefined || m.amount !== undefined) return m
	const { dice, ...rest } = m
	return { ...rest, amount: { selector: dice } } as MechanicDecl
}

/**
 * 🚧 **The one reading of a ruleset's check methods** — what the host and
 * the engine call at every entry (PLAN-rulesets-authoring D1, 2026-10-22).
 * The ⏳ aliases folded in:
 *
 *  · `conventions.dice` → one die-target method keyed `die`
 *    (`LEGACY_DIE_METHOD`, the default), its `sides` and `modifierOf`
 *    carried over;
 *  · the top-level `difficultyBands` → that method's `bands`;
 *  · `degrees` absent → `DEFAULT_DEGREES`;
 *  · `defaultMethod` absent with one method → that one;
 *  · a `harm` / `heal` that says `dice: 'piece.<field>'` → `amount:
 *    { selector: 'piece.<field>' }`.
 *
 * With `values` (a session's setting values), the conventions are the ones
 * the session plays (`rulesetConventionsFor`) before they are read. Pure:
 * the registry keeps the declaration as written (so a stored document, and
 * its hash, is unchanged until rewritten — the data upgrade persists this
 * result). Idempotent. A malformed declaration still reads (an empty method
 * list); `rulesetFindings` is what refuses it.
 * @experimental
 * @ruling PLAN-rulesets-authoring D1, D6 (2026-10-22)
 */
export function normaliseRuleset<T extends Normalisable>(decl: T, values?: Readonly<Record<string, string>>): NormalisedRuleset<T> {
	const { conventions } = normaliseConventions(decl, values)
	const { conventions: _c, difficultyBands: _b, sections: _s, ...others } = (decl ?? {}) as Normalisable & Record<string, unknown>
	const reps = decl?.repertoires
	const needsAmount = (r: RepertoireDecl) => (r.mechanics ?? []).some((m) => withAmount(m) !== m)
	const amounts = Array.isArray(reps) && reps.some(needsAmount) ? { repertoires: reps.map((r) => (needsAmount(r) ? { ...r, mechanics: r.mechanics!.map(withAmount) } : r)) } : {}
	return {
		...others,
		...amounts,
		conventions,
		// 🚧 The seven sections (2026-10-23): declared, or read from the shapes before
		// them — after the amounts are folded, so normalising twice reads the same.
		sections: rulesetSections({ ...decl, ...amounts }),
	} as unknown as NormalisedRuleset<T>
}

/**
 * 🚧 The conventions half of `normaliseRuleset`: the ⏳ `dice` / top-level
 * `difficultyBands` folded into `methods`, the default method, the degrees
 * in force — from the declaration's ⏳ conventions, or, for a ruleset in
 * sections, from what its sections read back as (`sectionsConventions`:
 * deciding references to core's check-method functions, outcomes with a
 * full ladder, time, turns, rests). With `values`, a session's setting
 * values laid first (`rulesetConventionsFor`). Never reads `rulesetSections`
 * of the shapes before them, so the two readings never call each other.
 * @internal
 */
export function normaliseConventions(decl: Normalisable, values?: Readonly<Record<string, string>>): { conventions: NormalisedConventions } {
	// Sections read back, then the ⏳ conventions over them key by key (a declaration may say some of each).
	const back = declaresSections(decl) ? sectionsConventions(decl) : undefined
	const own = (back || decl?.conventions ? { ...back, ...decl?.conventions } : undefined) as RulesetConventions | undefined
	const conv: Partial<RulesetConventions> =
		(values !== undefined && own ? rulesetConventionsFor({ ...(decl as Pick<RulesetProps, 'settings' | 'presets' | 'options'>), conventions: own }, values) : own) ?? {}
	const { dice, methods, defaultMethod, degrees, ...rest } = conv
	const top = decl?.difficultyBands
	let named: Record<string, CheckMethodDecl> = methods && typeof methods === 'object' ? { ...methods } : {}
	let def = typeof defaultMethod === 'string' ? defaultMethod : undefined
	if (dice !== undefined && dice !== null && methods === undefined) {
		named = {
			[LEGACY_DIE_METHOD]: {
				kind: 'die-target',
				sides: (dice as RulesetDice).sides,
				...((dice as RulesetDice).modifierOf !== undefined ? { modifierOf: (dice as RulesetDice).modifierOf } : {}),
				...(Array.isArray(top) && top.length ? { bands: top } : {}),
			},
		}
		def = def ?? LEGACY_DIE_METHOD
	}
	const keys = Object.keys(named)
	if (def === undefined && keys.length === 1) def = keys[0]
	return {
		conventions: {
			...(rest as Omit<RulesetConventions, 'dice' | 'methods' | 'defaultMethod' | 'degrees'>),
			methods: named,
			...(def !== undefined ? { defaultMethod: def } : {}),
			degrees: degrees ?? DEFAULT_DEGREES,
		},
	}
}

/**
 * 🚧 Whether a ruleset **decides** anything by its rules (D3, 2026-10-23):
 * one of its function references (declared, or ⏳ read from its check
 * methods) is a deciding function that decides — a dice, card, spend or
 * comparison resolver, or a deciding module that is a way — its body
 * exports `decide`, or one of its checks names it as its way
 * (`functionRefDecides`, `functionWayKeys`). A ruleset that
 * only judges in words (`none` / `core:function/judge@1`), or decides
 * nothing, plays `prose` alone. What _The rules decide_ waits on (R6).
 * @experimental
 * @ruling PLAN-rulesets-functions D3 (2026-10-23)
 */
export const rulesetDecides = (decl: unknown): boolean => {
	const functions = rulesetSections(decl).functions ?? []
	const ways = functionWayKeys(functions)
	return functions.some((f) => functionRefDecides(f, ways))
}

/**
 * 🚧 The check method a check is decided by: the one its selector names
 * (`method`), else the ruleset's default — with its key — or, when the
 * ruleset names none, `{ key: null, method: NONE_CHECK_METHOD }`: nothing
 * resolves it, the game master judges.
 * @experimental
 */
export function rulesetCheckMethod(
	decl: Normalisable & Pick<RulesetProps, 'stats' | 'selectors'>,
	selector?: string,
): { key: string | null; method: CheckMethodDecl } {
	const n = normaliseConventions(decl)
	const sel = selector !== undefined ? rulesetSelectors({ stats: decl?.stats ?? [], selectors: decl?.selectors }).get(selector) : undefined
	const key = (sel?.kind === 'check' ? sel.method : undefined) ?? n.conventions.defaultMethod
	const method = key !== undefined ? n.conventions.methods[key] : undefined
	return method ? { key: key!, method } : { key: null, method: NONE_CHECK_METHOD }
}

/** 🚧 Whether any of a ruleset's check methods throws dice (`die-target`, `dice-pool`). @experimental */
export const rulesetRollsDice = (decl: Normalisable): boolean =>
	Object.values(normaliseConventions(decl).conventions.methods).some((m) => !!checkMethodKind(m?.kind)?.rollsDice) ||
	// 🚧 A function the ruleset uses that throws dice (2026-10-23).
	(Array.isArray(decl?.functions) && decl.functions.some((f) => functionProvides(f).rollsDice))

/**
 * 🚧 The difficulty bands a check is made against: the named method's
 * (`methodKey`); else the default method's; else the first method's that
 * holds any — what a `roll` block offers (`rollBlockBands`). The ⏳
 * top-level `difficultyBands` read as the `die` method's. Empty when no
 * method holds any.
 * @experimental
 */
export function rulesetDifficultyBands(decl: Normalisable, methodKey?: string): readonly DifficultyBand[] {
	const n = normaliseConventions(decl)
	const methods = n.conventions.methods
	const bandsOf = (k: string | undefined): readonly DifficultyBand[] | undefined => {
		const m = k !== undefined ? (methods[k] as { bands?: readonly DifficultyBand[] } | undefined) : undefined
		return Array.isArray(m?.bands) && m!.bands!.length ? m!.bands : undefined
	}
	if (methodKey !== undefined) return bandsOf(methodKey) ?? []
	return (
		bandsOf(n.conventions.defaultMethod) ??
		Object.keys(methods).map(bandsOf).find((b) => b !== undefined) ??
		// A declaration that names no method but bands still reads them (it is refused where it is authored).
		(Array.isArray(decl?.difficultyBands) ? decl.difficultyBands : [])
	)
}

/**
 * 🚧 The band an automatic roll is made against — the one `default: true`
 * difficulty band of the method a check uses (`rulesetDifficultyBands`) —
 * or `undefined` when it holds none.
 * @experimental
 */
export const defaultDifficultyBand = (decl: Normalisable, methodKey?: string): DifficultyBand | undefined =>
	rulesetDifficultyBands(decl, methodKey).find((b) => b.default === true)

/**
 * 🚧 What a validator says about a ruleset beyond its refusals — each
 * opened by its reason's name, none refusing (2026-10-22):
 *
 *  · `legacy-dice` ⏳ — `conventions.dice`: say a die-target method.
 *  · `legacy-difficulty-bands` ⏳ — the top-level `difficultyBands`: a
 *    method holds its own.
 *  · `legacy-amount` ⏳ — a `harm` / `heal` that says `dice`: say `amount`.
 *  · `package-method-kind` — a package's own check method kind: a host
 *    with no resolver for it refuses its checks politely, in words (lane
 *    M2, 2026-10-22: never a silent `none`).
 *  · `untagged-repertoires` ⏳ — no repertoire declares `tags`, so what
 *    the ruleset provides (conditions, casting) is guessed from repertoire
 *    names (`guessRepertoireTags`).
 *  · `natural-without-die` — `degrees.natural` / `naturalShift` read a die
 *    face, and no die-target method throws one.
 * @experimental
 */
export function rulesetWarnings(decl: RulesetProps | RulesetDecl): string[] {
	const out: string[] = []
	const id = (decl as { id?: string })?.id ?? 'The ruleset'
	const c = decl?.conventions
	if (c?.dice !== undefined)
		out.push(finding('legacy-dice', `${id}.conventions.dice is the old way to say one die-target method. Say methods: { ${LEGACY_DIE_METHOD}: { kind: 'die-target', sides: ${String(c.dice?.sides)} } }.`))
	if (decl?.difficultyBands !== undefined)
		out.push(finding('legacy-difficulty-bands', `${id}.difficultyBands belong to the method a check is made against — move them under methods.<name>.bands.`))
	const piecesSayingDice = (decl?.repertoires ?? []).flatMap((r) =>
		(r.mechanics ?? []).filter((m) => (m.verb === 'harm' || m.verb === 'heal') && m.dice !== undefined).map(() => r.id),
	)
	if (piecesSayingDice.length)
		out.push(
			finding(
				'legacy-amount',
				`${piecesSayingDice.length} rule(s) in ${[...new Set(piecesSayingDice)].join(', ')} say dice: 'piece.<field>'. Say amount: { selector: 'piece.<field>' } — an amount may be dice, a number or a selector.`,
			),
		)
	for (const [key, m] of Object.entries(c?.methods ?? {}))
		if (isPackageCheckMethodKind(m?.kind))
			out.push(finding('package-method-kind', `${id}.conventions.methods.${key} is a '${m.kind}' method, a package's own. A host with no resolver for it refuses its checks politely, in words ("this pub has no resolver for '${m.kind}'").`))
	const reps = decl?.repertoires ?? []
	if (reps.length && !reps.some((r) => r?.tags !== undefined))
		out.push(
			finding(
				'untagged-repertoires',
				`No repertoire of ${id} declares tags, so whether it has conditions or casting is guessed from repertoire names. Tag them — tags: ['condition'], tags: ['casting'], tags: ['weapon'].`,
			),
		)
	const n = normaliseConventions(decl as Normalisable)
	const deg = c?.degrees
	if ((deg?.natural !== undefined || deg?.naturalShift !== undefined) && !Object.values(n.conventions.methods).some((m) => m?.kind === 'die-target'))
		out.push(finding('natural-without-die', `${id}.conventions.degrees reads natural die faces, and no die-target method throws a die. They would never apply.`))
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
			// 🚧 A relational repertoire's row names no one (2026-10-22, M3): who its
			// piece points towards is said when it is held (`overrides.towards`).
			const held = rep.relational && (piece as { towards?: unknown }).towards === undefined ? { ...piece, towards: 'said-when-held' } : piece
			const why = checkPiece(rep, { kind: 'inline', ...held } as never, { timeUnit: props.conventions?.time?.unit })
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
 * `bad-preset` · `bad-difficulty` · `duplicate-difficulty` ·
 * `difficulty-default` · `difficulty-without-dice` · 🚧 (2026-10-22, check
 * methods) `bad-method` · `unknown-method-kind` · `unknown-method` ·
 * `no-default-method` · `unknown-degree` · `bands-without-target` ·
 * `dice-beside-methods` · `difficulty-beside-methods` · 🚧 `bad-casting` ·
 * `bad-template` (2026-10-22, M3) · every repertoire
 * reason (`repertoireFindings`, in this ruleset's context — `bad-tags`,
 * `bad-amount`, `amount-needs-dice` among them) and every conversion reason
 * (`conversionFindings`). What warns and never refuses is `rulesetWarnings`.
 * @internal
 */
export function rulesetFindings(id: string, input: RulesetProps | RulesetDecl): string[] {
	// A declaration read back stores `plays`/`map` by id; every other key is the props'.
	// 🚧 Only what it says (2026-10-23): a registered ruleset in sections carries its ⏳ read-back
	// in the shape before them unenumerated (`_rulesetDeclOf`), which is never judged.
	const props = (input && typeof input === 'object' ? { ...input } : input) as RulesetProps
	const out: string[] = []
	if (typeof id !== 'string' || !RULESET_ID_PATTERN.test(id))
		out.push(finding('invalid-id', `'${String(id)}' is not a ruleset id. Use 'owner:ruleset/name@N' — 'core:ruleset/freeform@1'.`))
	out.push(...i18nFindings(props?.name, `${id} name`, { required: true }).map((f) => finding('display-text', f)))
	out.push(...i18nFindings(props?.description, `${id} description`).map((f) => finding('display-text', f)))
	if (props?.template !== undefined && props.template !== true)
		out.push(finding('bad-template', `${id}.template is true or left out — true marks an archetype to copy, never one to play.`))
	// 🚧 A voice is optional (R9, 2026-10-23); said, its floor is the prose line.
	const voice = props?.voice ?? {}
	if (props?.voice !== undefined && typeof voice.prose !== 'string')
		out.push(finding('missing-voice', `${id} has no prose voice. A voice says how play runs under it at prose first — or leave voice out.`))
	for (const [k, v] of Object.entries(voice)) {
		if (!RIGOURS.includes(k as Rigour)) out.push(finding('unknown-rigour', `${id}.voice.${k}: the rigours are ${RIGOURS.join(', ')}.`))
		else if (typeof v !== 'string' || !v.trim()) out.push(finding('empty-voice', `${id}.voice.${k} is empty. Write it, or leave the key out.`))
		else if (v.length > VOICE_MAX_CHARS)
			out.push(finding('voice-too-long', `${id}.voice.${k} is ${v.length} characters; a voice is at most ${VOICE_MAX_CHARS} (about 60 tokens) — it rides in every prompt at that rigour.`))
	}
	const selectors = rulesetSelectors({ stats: props?.stats ?? [], selectors: props?.selectors })
	out.push(...conventionFindings(id, props?.conventions, selectors, props?.repertoires ?? []))
	if (props?.conventions || props?.settings !== undefined || props?.presets !== undefined) out.push(...settingFindings(id, props, selectors))
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
	out.push(...difficultyBandFindings(id, props))
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
	out.push(...playsFindings(id, input))
	// 🚧 The author's handbook pages and saved tests (2026-10-23, D8).
	out.push(...handbookFindings(props?.handbook, id))
	out.push(...savedPlaytestFindings(props?.playtests, id))
	// 🚧 The seven sections (2026-10-23, D2), and the slots its attributes name.
	if (declaresSections(props)) {
		out.push(...rulesetSectionFindings(id, props))
		;(Array.isArray(props.attributes) ? props.attributes : []).forEach((a, i) => {
			if (typeof a?.slot !== 'string') return
			const decl = getAttributeSlot(a.slot)
			if (!decl) return void out.push(finding('unknown-stat', `${id}.attributes[${i}] names the slot '${a.slot}', which nothing declares. Declare the slot above the ruleset.`))
			if (a.start !== undefined) {
				const why = checkSlotValue(decl, a.start, resolveSlotConfig(decl, a.config))
				if (why) out.push(finding('bad-stat-default', `${id}.attributes[${i}] starts '${a.slot}' at a value it refuses: ${why}`))
			}
		})
	}
	return out
}

/**
 * 🚧 `plays` and `map` (A19): vocabularies by declaration, a map from a played
 * member onto an own stat. Reads the authored form (objects) and the stored
 * one (ids — a declaration read back) alike.
 */
function playsFindings(id: string, props: RulesetProps | RulesetDecl): string[] {
	const out: string[] = []
	const plays = props?.plays as readonly unknown[] | undefined
	if (plays !== undefined && !Array.isArray(plays))
		return [finding('bad-plays', `${id}.plays lists vocabularies — plays: [rulesets.common, scifi].`)]
	const seen = new Set<string>()
	const played: Vocabulary[] = []
	;(plays ?? []).forEach((v, i) => {
		const vid = typeof v === 'string' ? v : isVocabulary(v) ? v.id : undefined
		if (vid === undefined) {
			out.push(finding('bad-plays', `${id}.plays[${i}] is ${typeof v} — a ruleset plays vocabulary objects (vocabulary(…)).`))
			return
		}
		if (vid === id) out.push(finding('bad-plays', `${id}.plays lists itself — a ruleset is already a vocabulary of its own stats.`))
		if (seen.has(vid)) out.push(finding('bad-plays', `${id}.plays lists '${vid}' twice.`))
		seen.add(vid)
		const known = getVocabulary(vid)
		if (!known) out.push(finding('unknown-vocabulary', `${id}.plays[${i}] '${vid}' is not registered — declare it with vocabulary(…).`))
		else played.push(known)
	})
	// 🚧 Its own stats: the ⏳ stats, and every attribute's slot (2026-10-23).
	const own = new Set([
		...(props?.stats ?? []).map((s) => s?.id),
		...(RULESET_ID_PATTERN.test(id) && Array.isArray(props?.attributes) ? [...rulesetAttributeSlots({ id, attributes: props.attributes }).values()] : []),
	])
	const mappedFrom = new Set<string>()
	const slotIdOf = (x: unknown): string | undefined =>
		typeof x === 'string' ? x : !!x && typeof x === 'object' && typeof (x as AttributeSlotDecl).id === 'string' ? (x as AttributeSlotDecl).id : undefined
	;((props?.map ?? []) as readonly unknown[]).forEach((pair, i) => {
		const at = `${id}.map[${i}]`
		const from = Array.isArray(pair) && pair.length === 2 ? slotIdOf(pair[0]) : undefined
		const to = Array.isArray(pair) && pair.length === 2 ? slotIdOf(pair[1]) : undefined
		if (!from || !to) {
			out.push(finding('bad-map', `${at} is [played member, own stat] — attribute slot declarations on both sides.`))
			return
		}
		if (!own.has(to)) out.push(finding('bad-map', `${at} maps onto '${to}', which is not one of ${id}'s stats — the right side is its own stat.`))
		if (!played.some((v) => VOCABULARY_OWNERS.some((o) => Object.values(v[o] as Record<string, AttributeSlotDecl>).some((m) => m.id === from))))
			out.push(finding('bad-map', `${at} maps '${from}', which no vocabulary ${id} plays has — play it, or leave the entry out.`))
		if (mappedFrom.has(from)) out.push(finding('bad-map', `${at} maps '${from}' a second time.`))
		mappedFrom.add(from)
	})
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
	// 🚧 A ruleset in sections (2026-10-23) is judged as one in the shape
	// before them: attributes by the slot their values are filed under,
	// entry types as repertoires.
	const slotsOf = (d: RulesetDecl) => (d.attributes !== undefined ? [...rulesetAttributeSlots(d).values()] : (d.stats ?? []).map((s) => s.id))
	const repsOf = (d: RulesetDecl) => (d.entryTypes !== undefined ? d.entryTypes.map(_entryTypeAsRepertoire) : (d.repertoires ?? []))
	const nextStats = new Set(slotsOf(next))
	for (const id of slotsOf(prev))
		if (!nextStats.has(id))
			out.push(finding('dropped-stat', `${next.id} drops the stat '${id}'. Values stored under it would read through nothing; keep it on the ruleset.`))
	const nextReps = new Map(repsOf(next).map((r) => [r.id, r]))
	for (const r of repsOf(prev)) {
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

/**
 * 🚧 Ids a ruleset template holds (`defineRulesetTemplate`): never a
 * registered ruleset's, so an archetype is never offered under Rules.
 */
const templateIds = new Set<RulesetId>()

/** 🚧 Reserve a template's id against the registry. Called by `rulesetTemplates.ts` only. @internal */
export function _reserveRulesetTemplateId(id: RulesetId): void {
	if (registry.has(id))
		throw new RulesetError(id, [finding('template-not-played', `${id} is a registered ruleset, so a template may not take its id. Name the template under an id of its own.`)])
	templateIds.add(id)
}

/** 🚧 Forget every reserved template id. Called by `_clearRulesetTemplates` only. @internal */
export function _releaseRulesetTemplateIds(): void {
	templateIds.clear()
}

/** 🚧 Whether an id is a ruleset template's — what a genre may never name. @experimental */
export const isRulesetTemplateId = (id: unknown): boolean => typeof id === 'string' && templateIds.has(id)

/**
 * 🚧 A declaration as the registry keeps it — frozen, `plays` and `map` by
 * id — whether or not it is registered (a template's is not).
 * @internal
 */
export function _rulesetDeclOf(id: RulesetId, props: RulesetProps, stored?: { userId: number | string }): RulesetDecl {
	// A document read back may carry `origin`/`authorUserId`; the registry says those itself.
	const { plays, map, origin: _o, authorUserId: _a, ...rest } = props as RulesetProps & { origin?: unknown; authorUserId?: unknown }
	// 🚧 ⏳ A ruleset in sections (2026-10-23): what each section reads back as in the shape before
	// them, for that shape's readers — hung on the declaration unenumerated, so it is never hashed,
	// never in its document and never said beside its sections (`sectionsLegacyView`).
	const back = declaresSections(props) ? sectionsLegacyView(id, rulesetSections(props)) : {}
	const derivedStats = props.stats === undefined && back.stats !== undefined
	const derivedReps = props.repertoires === undefined && back.repertoires !== undefined
	const decl = {
		...(rest as Omit<RulesetProps, 'plays' | 'map'>),
		id,
		...(stored ? { origin: 'stored' as const, authorUserId: stored.userId } : {}),
		// ⏳ Always lists on the registered declaration (2026-10-23): a ruleset in sections reads its own back.
		...(derivedStats ? {} : { stats: Object.freeze([...(props.stats ?? [])]) }),
		...(derivedReps ? {} : { repertoires: Object.freeze([...(props.repertoires ?? [])]) }),
		// 🚧 A19: stored by id, and only when stated — a ruleset that plays
		// nothing hashes as it did.
		...(plays !== undefined
			? { plays: Object.freeze(plays.map((v) => (typeof v === 'string' ? (v as string) : v.id))) }
			: {}),
		...(map !== undefined
			? {
					map: Object.freeze(
						map.map(([f, t]) =>
							Object.freeze([typeof f === 'string' ? (f as string) : f.id, typeof t === 'string' ? (t as string) : t.id] as const),
						),
					),
				}
			: {}),
	}
	const hang = (key: string, value: unknown) => Object.defineProperty(decl, key, { value, enumerable: false })
	if (derivedStats) hang('stats', Object.freeze([...back.stats!]))
	if (derivedReps) hang('repertoires', Object.freeze([...back.repertoires!]))
	if (props.selectors === undefined && back.selectors !== undefined) hang('selectors', Object.freeze({ ...back.selectors }))
	if (props.compendium === undefined && back.compendium !== undefined) hang('compendium', back.compendium)
	return Object.freeze(decl) as RulesetDecl
}

function register(id: RulesetId, props: RulesetProps, stored?: { userId: number | string }): RulesetDecl {
	const found = rulesetFindings(id, props)
	// 🚧 A template is copied, never played (2026-10-22): nothing registers one.
	if (props?.template === true)
		found.push(finding('template-not-played', `${id} is a template — an archetype to copy, never one a session plays. Declare it with defineRulesetTemplate, or drop template: true.`))
	if (templateIds.has(id))
		found.push(finding('template-not-played', `${id} is a ruleset template's id. A ruleset made from it takes an id of its own.`))
	if (found.length) throw new RulesetError(id, found)
	const decl = _rulesetDeclOf(id, props, stored)
	const existing = registry.get(id)
	if (existing) {
		const heldStored = existing.origin === 'stored'
		if (heldStored !== !!stored) throw new Error(crossOriginRefusal(id, heldStored ? 'stored' : 'code'))
		// A stored ruleset is replaced by its next publish; a code one must
		// be the same declaration twice (HMR, a double import).
		if (stored) _withdrawRuleset(id)
		else refuseUnlessIdentical(existing, decl, `duplicate ruleset id: ${id}`, RULESET_DISPLAY_KEYS)
	}
	// 🚧 Its own attributes' slots (2026-10-23, D2), registered before the
	// ruleset so a refused slot leaves nothing half-registered.
	for (const { id: slotId, props: slotProps } of rulesetAttributeSlotDecls({ id, attributes: props.attributes })) _defineRulesetAttributeSlot(slotId, slotProps)
	registry.set(id, decl)
	const sections = rulesetSections(props)
	const rows = new Map<string, ReadonlySet<string>>(
		Object.entries((props.compendium ?? props.library)?.rows ?? {}).map(([rep, list]) => [rep, new Set(list.map((r) => r.id))]),
	)
	// 🚧 A ruleset in sections files its entry types where a list slot's
	// write reaches them by address (`<ruleset>#<entry type>`), as the
	// repertoires of the shape before them were (2026-10-23).
	const repertoires = props.entryTypes !== undefined ? (sections.entryTypes ?? []).map(_entryTypeAsRepertoire) : decl.repertoires
	_registerRulesetRepertoires(id, repertoires, rows, props.conventions?.time?.unit ?? sections.time?.unit)
	// What it lists, it owns — unless it borrows the slot (`RulesetStatEntry`).
	// 🚧 A ruleset in sections owns its attributes' slots, borrowed ones aside.
	const owned = props.attributes !== undefined
		? props.attributes.filter((a) => a?.borrowed !== true).map((a) => rulesetAttributeSlots({ id, attributes: [a] }).get(a.id)!)
		: decl.stats.filter((s) => s.borrowed !== true).map((s) => s.id)
	_registerRulesetStats(id, owned)
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

const crossOriginRefusal = (id: string, held: RulesetOrigin): string =>
	held === 'code'
		? `'${id}' is declared in code by the package that owns it, so an authored ruleset may not ` +
			`claim it: the id would mean one thing or another depending on what is installed. Author ` +
			`it under your own owner name.`
		: `'${id}' is a ruleset authored on this pub, so code may not declare it: the pub's row would ` +
			`be redefined every time this package loaded. Publish it under the package's own owner name.`

/**
 * 🚧 Declare a ruleset **authored on the pub** — loaded from a stored row
 * rather than imported from a package (PLAN-ruleset-editor §3). The same
 * validation as `defineRuleset`, plus: the owner segment may not be `core`
 * or an installed plugin's id (`reserveAttributeOwner` — one list of
 * reserved owners for every stored declaration), and an id code holds is
 * refused. Declaring a stored id a second time **replaces** it — that is
 * what a publish does — where a code id must be identical.
 * @experimental
 */
export function defineStoredRuleset(id: RulesetId, props: RulesetProps, meta: { userId: number | string }): RulesetDecl {
	if (typeof id !== 'string' || !RULESET_ID_PATTERN.test(id))
		throw new RulesetError(String(id), [finding('invalid-id', `'${String(id)}' is not a ruleset id. Use 'owner:ruleset/name@N'.`)])
	const owner = id.slice(0, id.indexOf(':'))
	if (isReservedAttributeOwner(owner))
		throw new Error(
			`'${id}' is authored under the reserved owner '${owner}'. 'core' and every installed plugin id ` +
				`are reserved: a stored ruleset sharing one would be redefined the next time that package ` +
				`loaded, and every session playing it would quietly change rules. Author it under your own owner name.`,
		)
	return register(id, props, meta)
}

/**
 * 🚧 Forget a ruleset and everything registered with it — its repertoires,
 * compendium ids, stat listings and derived entry types. Never `core:`'s. For
 * a stored ruleset's republish, retire or delete, and a package's withdrawal.
 * Values stored against it stay where they are (parked data).
 * @internal
 */
export function _withdrawRuleset(id: RulesetId): boolean {
	if (typeof id !== 'string' || id.startsWith('core:')) return false
	const held = registry.get(id)
	if (!held) return false
	for (const rep of rulesetEntryable(held)) _withdrawEntryType(rulesetEntryTypeId(id, rep))
	_withdrawRulesetRepertoires(id)
	_withdrawRulesetStats(id)
	// 🚧 Its own attributes' slots go with it; values filed under them stay (parked).
	for (const { id: slotId } of rulesetAttributeSlotDecls({ id, attributes: held.attributes })) _withdrawAttributeSlot(slotId)
	return registry.delete(id)
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
