/**
 * 🚧 **The seven sections** of a ruleset (PLAN-rulesets-functions D2, D4,
 * D5; owner rulings 2026-10-22/23) — what a ruleset declares, every one of
 * them optional:
 *
 *  1. `attributes` — what characters, the world and places carry, each with
 *     the sentence the model reads (the floor of every ruleset: R6);
 *  2. `functions` — the function references it uses (`functions.ts`);
 *  3. `entryTypes` — the kinds of thing people hold, suffer or share: each
 *     IS a lorebook entry type (derived, `rulesetEntryTypeDecls`); its rows
 *     are the library;
 *  4. `zoneTypes` — where entries sit (a hand, a deck, an inbox), declared
 *     once and instanced per owner; who sees an entry is its zone's
 *     visibility;
 *  5. `outcomes` — the author's own outcome words, with an optional ladder
 *     onto the five bands;
 *  6. `time` — the unit time is kept in, turns, rests;
 *  7. `library` — rows per entry type;
 *  8. `options` — the ways a table may play it (settings in the genre field
 *     shape, with reach), presets, conversions.
 *
 * (Outcomes and time are one category in the editor: seven.) Nothing is
 * required beyond a name: `{ name }` is a ruleset **from scratch**, and a
 * session playing it reads and behaves exactly as a session with no rules
 * (R9) — no degrees, no time unit, no way to decide, no voice. Whatever
 * the "no rules" experience needs is the host's (`CARRIED_ZONE_TYPE` is the
 * host's default zone type, never the ruleset's).
 *
 * ⏳ **The shapes before the sections** read into them (`rulesetSections`,
 * `normaliseRuleset`): `stats` → attributes; `repertoires` → entry types;
 * `selectors` (derived, tally, check) and `conventions.methods` / ⏳ `dice`
 * → function references to core's reserved ids; `scripts` → carried
 * function modules (their bodies the seeded rows); `conventions.degrees` →
 * outcomes; `conventions.time` / `actions` / `rest` → time; `compendium` →
 * library; `settings` / `presets` / `conversions` → options. A declaration
 * says one or the other for each section, never both (`legacy-beside-section`).
 * @experimental
 * @ruling PLAN-rulesets-functions D2, D4, D5 (2026-10-23); R6, R9
 */

import { i18nFindings, type I18n } from './i18n.js'
import {
	checkSlotValue,
	getAttributeSlot,
	slotSlug,
	type AttributeSlotDecl,
	type AttributeSlotProps,
	type SlotAppliesTo,
	type SlotConfig,
	type SlotId,
	type SlotValue,
} from './attributes.js'
import { checkSchema, settingsSchemaFindings, type FieldDecl, type SettingsSchema } from './settings.js'
import { exposureFindings } from './exposure.js'
import {
	_repertoireMechanicFindings,
	checkPiece,
	finding,
	RULESET_ID_PATTERN,
	PIECE_FIELDS,
	RELATIONAL_PIECE_FIELDS,
	RENDER_DEPTHS,
	type MechanicDecl,
	type RenderDepth,
	type RepertoireContext,
	type RepertoireDecl,
} from './repertoires.js'
import { conversionFindings, type ConversionDecl } from './conversions.js'
import {
	attributeModelShareFindings,
	attributeReadsOntoFindings,
	entryTypeModelShareFindings,
	entryTypeReadsOntoFindings,
	entryFieldSelectors,
	farEndFindings,
	tieSidesOf,
	unheldTieFindings,
	type FarEnd,
	type ModelShare,
	type ReadsOnto,
} from './ties.js'
import { checkMethodKind, type CheckMethodDecl, type CoreCheckMethodKind } from './checkMethods.js'
import {
	CHECK_METHOD_FUNCTIONS,
	CORE_FUNCTION_IDS,
	checkMethodKindOfFunction,
	functionRefFindings,
	functionRefKey,
	isFunctionId,
	isPackageFunctionKind,
	resolveFunctionRef,
	tagListFindings,
	visibilityFindings,
	type FunctionDecl,
	type FunctionPhase,
	type FunctionRef,
	type Visibility,
} from './functions.js'
import {
	DEFAULT_DEGREES,
	FIVE_BANDS,
	normaliseConventions,
	RULESET_SCRIPT_PHASES,
	RULESET_TIME_UNITS,
	rulesetEntryable,
	type CompendiumDecl,
	type CompendiumRow,
	type DegreeCrosswalk,
	type FiveBand,
	type RulesetConventions,
	type RulesetPresetDecl,
	type RulesetProps,
	type RulesetSelectorDecl,
	type RulesetSettingDecl,
	type RulesetTime,
} from './rulesets.js'

// ── Attributes ──────────────────────────────────────────────────────────────

/**
 * 🚧 What an attribute holds: `number` (a whole number, bounded or not),
 * `pool` (a number spent and refilled, from its floor to its most), `tally`
 * (a count from nothing up), `label` (one of its words — or any words when
 * it names none), `list` (several words), 🚧 `text` (free prose of each
 * holder's own — a backstory, a vow, what they are after: shown as words,
 * read by the model as a sentence of its own; ⚠ not a `label`, whose value
 * is a word or two read inline beside the numbers. RF fix 2, 2026-10-23).
 * @experimental
 */
export const ATTRIBUTE_KINDS = ['number', 'pool', 'tally', 'label', 'list', 'text'] as const
/** @experimental */
export type RulesetAttributeKind = (typeof ATTRIBUTE_KINDS)[number]

/**
 * 🚧 The attribute kinds whose value is a number — what a sum, a spend or a
 * count takes (`FunctionBindingDecl.kinds`; RF fix 6, 2026-10-23).
 * @experimental
 */
export const NUMBER_ATTRIBUTE_KINDS = ['number', 'pool', 'tally'] as const satisfies readonly RulesetAttributeKind[]

/**
 * 🚧 Each attribute kind in a few plain words, for a sentence that names
 * what a function binding takes ("Restore takes a number, a pool or a
 * tally"; RF fix 6, 2026-10-23). Admin and handbook words alike.
 * @experimental
 */
export const ATTRIBUTE_KIND_WORDS: Readonly<Record<RulesetAttributeKind, string>> = {
	number: 'a number',
	pool: 'a pool',
	tally: 'a tally',
	label: 'a word',
	list: 'a list of words',
	text: 'free text',
}

/**
 * 🚧 Attribute kinds in words, joined as a person says them: `['number',
 * 'pool', 'tally']` → "a number, a pool or a tally"; every kind → "any kind
 * of attribute".
 * @experimental
 */
export function attributeKindsInWords(kinds: readonly string[]): string {
	const ks = [...new Set(kinds)]
	if (ATTRIBUTE_KINDS.every((k) => ks.includes(k))) return 'any kind of attribute'
	const words = ks.map((k) => ATTRIBUTE_KIND_WORDS[k as RulesetAttributeKind] ?? k)
	return words.length < 2 ? (words[0] ?? 'nothing') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`
}

/**
 * 🚧 The attribute kinds a slot type may be read as (RF fix 6): a number any
 * of the three counts, an enum a word, free text a word or free text, a list
 * a list; `undefined` for any other type. What a borrowed attribute's kinds are.
 * @experimental
 */
export const attributeKindsOfSlotType = (type: string | undefined): readonly RulesetAttributeKind[] | undefined =>
	type === undefined ? undefined : KINDS_OF_SLOT_TYPE[type]

/** The slot types a borrowed attribute's kinds are read from: a number reads as any of the three counts. */
const KINDS_OF_SLOT_TYPE: Readonly<Record<string, readonly RulesetAttributeKind[]>> = {
	integer: NUMBER_ATTRIBUTE_KINDS,
	number: NUMBER_ATTRIBUTE_KINDS,
	derived: NUMBER_ATTRIBUTE_KINDS,
	enum: ['label'],
	text: ['label', 'text'],
	list: ['list'],
}

/**
 * 🚧 The kinds an attribute may be read as (RF fix 6, 2026-10-23): its own
 * `kind`; for one that names a slot, what the slot's type allows (a number
 * any of the three counts, free words a word or free text); `undefined` when
 * that cannot be said (an unregistered slot) — then it is never judged by kind.
 * @experimental
 */
export function rulesetAttributeKinds(a: Pick<RulesetAttributeDecl, 'kind' | 'slot'> | undefined): readonly RulesetAttributeKind[] | undefined {
	if (!a) return undefined
	if (a.slot === undefined) return (ATTRIBUTE_KINDS as readonly unknown[]).includes(a.kind) ? [a.kind!] : undefined
	return attributeKindsOfSlotType(typeof a.slot === 'string' ? getAttributeSlot(a.slot)?.type : undefined)
}

/**
 * 🚧 Who may **change** a value — separate from who sees it (D4): `rules`
 * (the ruleset's functions and the pipelines that apply them), `gm` (the
 * game master), `holder` (who carries it), `everyone`.
 * @experimental
 */
export const ATTRIBUTE_CHANGERS = ['rules', 'gm', 'holder', 'everyone'] as const
/** @experimental */
export type AttributeChanger = (typeof ATTRIBUTE_CHANGERS)[number]

/**
 * 🚧 How a stock widget draws a thing — a **shown-as hint** (the plan's
 * "render hint"; ⚠ not an entry type's `render`, the prompt variable its rows
 * reach the model through, and not a render depth): core's are `bar`,
 * `pips`, `badge`, `count`, `words`, `list`, `fan` (cards face up), `ties`
 * (a list of ties). Open: a word a widget does not know draws as it would
 * with none. A ruleset never ships a widget.
 * @experimental
 */
export const SHOWN_AS = ['bar', 'pips', 'badge', 'count', 'words', 'list', 'fan', 'ties'] as const
/** @experimental */
export type ShownAs = (typeof SHOWN_AS)[number] | (string & {})

/** 🚧 An attribute's bounds: its floor and its most. @experimental */
export interface AttributeBounds {
	min?: number
	max?: number
}

/**
 * 🚧 One of a ruleset's **attributes** — what an owner carries, with the
 * sentence the model reads (the floor of every ruleset, R6).
 *
 *  · `id` — what functions bind it by (`affection`);
 *  · `name` — the word a person reads; `prose` — what the model reads
 *    ("How much someone likes you…"); both required for the ruleset's own;
 *  · `kind`, `bounds`, `of` (a label's words), `start` (where it begins);
 *  · 🚧 `required` — every holder carries it (no opt-out);
 *  · `carriedBy` — the owners that carry it (default: each character);
 *  · `visibility` — who sees it (default: everyone); `changedBy` — who may
 *    change it (default: anyone);
 *  · `tags` — what it is, for functions that bind by tag (`resource`);
 *  · `shownAs` — how a stock widget draws it;
 *  · 🚧 `readsOnto` — the lorebook column it feeds where its owner lives (a
 *    cast member's state on the graph, a place entry's field; `ties.ts`, T2);
 *  · 🚧 `modelShare` — what the model is told of it: its words, its number
 *    (T5; declared, it is honoured — see `ties.ts`).
 *
 * An attribute with `slot` **is** an existing attribute slot (a shared
 * vocabulary member, ⏳ a stat): its kind and words are the slot's, `config`
 * and `start` its deviations, `borrowed` when the ruleset only borrows it. One
 * without is the ruleset's own: its value is filed under a slot derived from
 * the ruleset (`rulesetAttributeSlotId`), registered with it.
 *
 * ⚠ Not an attribute slot (`AttributeSlotDecl`, what a value is filed
 * under), and not a sheet: the ruleset's attributes are its sheet.
 * @experimental
 */
export interface RulesetAttributeDecl {
	id: string
	name?: I18n
	description?: I18n
	slot?: SlotId
	borrowed?: true
	kind?: RulesetAttributeKind
	bounds?: AttributeBounds
	of?: readonly string[]
	start?: SlotValue
	/** ⏳ A stat's deviations from its slot's config (`SheetSlotEntry.config`). */
	config?: SlotConfig
	/**
	 * 🚧 Every holder carries it (RF fix 2, 2026-10-23): no holder — nor the
	 * game master for one — may turn it off for themselves. Left out, a holder
	 * may opt out of carrying it (an **attribute carry**, the host's per-owner
	 * switch): then it is not shown, not read and not written for them.
	 */
	required?: boolean
	carriedBy?: readonly SlotAppliesTo[]
	visibility?: Visibility
	changedBy?: readonly AttributeChanger[]
	tags?: readonly string[]
	prose?: string
	shownAs?: ShownAs
	/** 🚧 The lorebook column this attribute reads onto (T2). */
	readsOnto?: ReadsOnto
	/** 🚧 What the model is told of it (T5). */
	modelShare?: ModelShare
}

// ── Entry types ─────────────────────────────────────────────────────────────

/**
 * 🚧 One of a ruleset's **entry types** (D5) — a kind of thing people hold,
 * suffer or share (a keepsake, a bond, a card). It IS a lorebook entry type:
 * `rulesetEntryTypeDecls` derives `<owner>:entry/<ruleset>.<id>@1`, its
 * fields its `name` and `description`, `traits` when it says so, `towards`
 * when relational, then its own `fields`. Instances are entries; a held one
 * is a copy stamped from its entry (`stampHeldEntry`).
 *
 *  · `holders` — the owners that hold its entries (default: characters);
 *  · `visibility` — who sees an entry where no zone says (D4);
 *  · `tags` — what it is (`relationship`, `condition`), for fit and functions;
 *  · `traits: true` — a free traits list, declared by the ruleset on its own
 *    entry type (never added to core's);
 *  · `prose` — what the model reads about entries of the type;
 *  · 🚧 `farEnd` — on a relational one, what its other end may be (person ·
 *    place · entry); its **tie sides** are worked out from the ends
 *    (`tieSidesOf`: person to person two, each held by its person; else one,
 *    held by the world — T1);
 *  · 🚧 `readsOnto` — per field, the lorebook column it feeds (a tie's
 *    relationship row, a held thing's source entry — T2);
 *  · 🚧 `modelShare` — per field, what the model is told: words, number (T5).
 *
 * ⏳ What a repertoire said, carried when one is read as an entry type: its
 * whole `piece` shape (universal piece parts included — `fields` is not read
 * then), its piece rules (`mechanics`), `renderDepth`, `renames`,
 * `retired`, and `entryable: false` for one that never became an entry type.
 * @experimental
 */
export interface RulesetEntryTypeDecl {
	id: string
	name: I18n
	description?: I18n
	fields?: SettingsSchema
	traits?: true
	relational?: true
	/** 🚧 What the far end of a relational entry type may be (T1). */
	farEnd?: FarEnd
	holders?: readonly SlotAppliesTo[]
	visibility?: Visibility
	tags?: readonly string[]
	prose: string
	shownAs?: ShownAs
	/** 🚧 Per field, the lorebook column it reads onto (T2). */
	readsOnto?: Readonly<Record<string, ReadsOnto>>
	/** 🚧 Per field, what the model is told of it (T5). */
	modelShare?: Readonly<Record<string, ModelShare>>
	/** ⏳ A repertoire's whole piece shape (`RepertoireDecl.piece`). */
	piece?: FieldDecl
	/** ⏳ A repertoire's piece rules, read by the handler until functions replace them. */
	mechanics?: readonly MechanicDecl[]
	/** ⏳ A repertoire's render depth. */
	renderDepth?: RenderDepth
	/** ⏳ A repertoire's renamed piece fields, old → new. */
	renames?: Readonly<Record<string, string>>
	/** ⏳ A repertoire's retired piece fields. */
	retired?: readonly string[]
	/** ⏳ `false` for a repertoire that never yielded an entry type. */
	entryable?: false
}

// ── Zone types ──────────────────────────────────────────────────────────────

/** 🚧 What a zone type that holds entries of every entry type says it holds. @experimental */
export const ZONE_HOLDS_ANY = '*' as const

/**
 * 🚧 A **zone type** (D5) — where entries sit: declared once, instanced per
 * owner (every character their own hand; the world one deck; each place
 * its inbox). A **zone** is one instance.
 *
 *  · `owners` — who carries one (`cast`, `world`, `location`);
 *  · `holds` — the entry types it takes, by id, or `'*'` for any;
 *  · `limit` — at most so many entries, or as many as an attribute of its
 *    owner says (`{ attribute: 'strength' }`);
 *  · `visibility` — who sees what sits in it: moving an entry between zones
 *    is what reveals it (pocket → shelf);
 *  · `ordered: true` — its order means something (a deck);
 *  · `prose` — what the model reads; `shownAs` — how a widget draws it.
 *
 * ⚠ Not a lorebook **scope** (where an entry applies) and not a location.
 * @experimental
 */
export interface ZoneTypeDecl {
	id: string
	name: I18n
	description?: I18n
	owners: readonly SlotAppliesTo[]
	holds: readonly string[] | typeof ZONE_HOLDS_ANY
	limit?: number | { attribute: string }
	visibility?: Visibility
	ordered?: true
	prose: string
	shownAs?: ShownAs
	/** 🚧 What it is (RF fix 8): a genre plays best with a zone type by tag (`inventory`). */
	tags?: readonly string[]
}

/**
 * 🚧 The **carried** zone type — what an owner has with it: a character's
 * things on them, a place's things lying there. The host's default (D5:
 * today's carried list), present in every session whatever its ruleset
 * (`rulesetZoneTypes`); a ruleset may declare its own `carried` instead.
 * @experimental
 */
export const CARRIED_ZONE_TYPE: ZoneTypeDecl = Object.freeze({
	id: 'carried',
	name: { en: 'Carried' },
	owners: Object.freeze(['cast', 'location'] as const),
	holds: ZONE_HOLDS_ANY,
	visibility: 'everyone',
	prose: 'What someone has on them, or what lies in a place.',
	shownAs: 'list',
	// 🚧 RF fix 8: every session has somewhere to keep what someone carries.
	tags: Object.freeze(['inventory']),
}) as ZoneTypeDecl

// ── Outcomes, time, library, options ────────────────────────────────────────

/**
 * 🚧 One of a ruleset's **outcome words** — the author's own (_awkward_,
 * _warmed_, _confessed_) — with, optionally, the step of the five-band
 * ladder it reads as (`five`) and the least margin it starts at (`from`).
 * @experimental
 */
export interface RulesetOutcomeDecl {
	id: string
	label: I18n
	five?: FiveBand
	from?: number
}

/** 🚧 A ruleset's turns: how many actions a turn holds, a reaction besides, the kinds of action. @experimental */
export interface RulesetTurns {
	perTurn?: number
	reaction?: boolean
	kinds?: readonly string[]
}

/** 🚧 A rest: how long it takes, and the traits of what it recharges. @experimental */
export interface RulesetRestDecl {
	id: string
	label: I18n
	minutes?: number
	recharges?: readonly string[]
}

/** 🚧 The **time** section: the unit time is kept in, a round's seconds, turns, rests. @experimental */
export interface RulesetTimeSection extends RulesetTime {
	turns?: RulesetTurns
	rests?: readonly RulesetRestDecl[]
}

/** 🚧 The **library** section: rows per entry type, each with its source and licence (the compendium's shape). @experimental */
export type RulesetLibrary = CompendiumDecl

/**
 * 🚧 What choosing one of an option's choices lays over the ruleset. ⏳ The
 * conventions a setting's choice laid (`RulesetSettingDecl` choices).
 * @experimental
 */
export interface RulesetChoiceLays {
	conventions?: Partial<Omit<RulesetConventions, 'time'>>
}

/**
 * 🚧 The **options** section: the ways a table may play the ruleset —
 * `fields` in the genre field shape (`reach: 'owner'` lets a session's
 * owner set one; an `enum` with `members` is a choice), what a choice
 * `lays`, `presets` (named sets of values), and `conversions` from other
 * rulesets.
 * @experimental
 */
export interface RulesetOptions {
	fields?: SettingsSchema
	lays?: Readonly<Record<string, Readonly<Record<string, RulesetChoiceLays>>>>
	presets?: readonly RulesetPresetDecl[]
	conversions?: readonly ConversionDecl[]
}

/** 🚧 The seven sections (eight keys: outcomes and time are one category). @experimental */
export interface RulesetSections {
	attributes?: readonly RulesetAttributeDecl[]
	functions?: readonly FunctionRef[]
	entryTypes?: readonly RulesetEntryTypeDecl[]
	zoneTypes?: readonly ZoneTypeDecl[]
	outcomes?: readonly RulesetOutcomeDecl[]
	time?: RulesetTimeSection
	library?: RulesetLibrary
	options?: RulesetOptions
}

/** 🚧 The section keys, in the editor's order. @experimental */
export const RULESET_SECTIONS = ['attributes', 'functions', 'entryTypes', 'zoneTypes', 'outcomes', 'time', 'library', 'options'] as const
/** @experimental */
export type RulesetSectionKey = (typeof RULESET_SECTIONS)[number]

/** 🚧 Whether a declaration says any of the sections. @experimental */
export const declaresSections = (decl: unknown): boolean =>
	!!decl && typeof decl === 'object' && RULESET_SECTIONS.some((k) => (decl as Record<string, unknown>)[k] !== undefined)

// ── Held entries ────────────────────────────────────────────────────────────

/**
 * 🚧 A **held entry** (D5, ruled 10-22) — an entry in a zone: a copy stamped
 * from its lorebook entry, the `entryId` kept so a function may read the
 * source; `null` for one made in play with no entry behind it. `exposed`:
 * its holder revealed it beyond its zone's visibility.
 *
 * 🚧 A held **tie side** (T1) — an entry of a relational type with a far
 * end — carries its side's owner (`sideOwner`, an owner key: `character:4`):
 * on a two-sided tie the person whose side it is (its holder); on a
 * one-sided tie, held by the world, its near end. Its `towards` field names
 * the far end and its `edge` the relationship row it reads onto.
 * @experimental
 */
export interface HeldEntry {
	readonly entryId: number | null
	readonly entryType: string
	readonly name: string
	readonly fields: Readonly<Record<string, unknown>>
	readonly count?: number
	readonly exposed?: true
	/** 🚧 A tie side's owner (T1). */
	readonly sideOwner?: string
}

/**
 * 🚧 Stamp a held copy of an entry (D5): its id, type, name and fields
 * copied — never a reference — with `overrides` laid over the fields. A
 * tie side carries `opts.sideOwner` (T1); `stampTieSides` stamps every side
 * of a tie at once.
 * @experimental
 */
export function stampHeldEntry(
	entry: { id: number | null; entryType: string; name: string; fields?: Readonly<Record<string, unknown>> },
	overrides: Readonly<Record<string, unknown>> = {},
	opts: { count?: number; sideOwner?: string } = {},
): HeldEntry {
	return Object.freeze({
		entryId: entry.id,
		entryType: entry.entryType,
		name: entry.name,
		fields: Object.freeze(JSON.parse(JSON.stringify({ ...(entry.fields ?? {}), ...overrides })) as Record<string, unknown>),
		...(opts.count !== undefined && opts.count !== 1 ? { count: opts.count } : {}),
		...(typeof opts.sideOwner === 'string' && opts.sideOwner ? { sideOwner: opts.sideOwner } : {}),
	})
}

/** 🚧 A tie's two ends, as owner keys: the near end (`from`) and the far end (`towards`). @experimental */
export interface TieEnds {
	from: string
	towards: string
	/** The name each side reads the other by — the far end's name for `from`'s side. Absent: the entry's name. */
	names?: { from?: string; towards?: string }
}

/** 🚧 One stamped tie side and who holds it — an owner key, or `world`. @experimental */
export interface TieSideStamp {
	holder: string
	held: HeldEntry
}

/**
 * 🚧 Stamp **every side** of a tie (T1): for a two-sided tie (a person to a
 * person) one held entry per person, each held by its own person, carrying
 * its side's owner and pointing `towards` the other; for a one-sided tie
 * one held entry, held by the world, its near end its side's owner. Each
 * side's fields start at the type's field defaults, `overrides` laid over
 * (`from` for the near end's side, `towards` for the far end's). Empty for
 * an entry type with no far end.
 * @experimental
 */
export function stampTieSides(
	type: RulesetEntryTypeDecl,
	entry: { id: number | null; name: string; fields?: Readonly<Record<string, unknown>> },
	ends: TieEnds,
	overrides: { from?: Readonly<Record<string, unknown>>; towards?: Readonly<Record<string, unknown>> } = {},
): TieSideStamp[] {
	const sides = tieSidesOf(type)
	if (sides === undefined) return []
	const defaults: Record<string, unknown> = {}
	for (const [k, f] of Object.entries(type.fields ?? {})) if ((f as FieldDecl).default !== undefined) defaults[k] = (f as FieldDecl).default
	const side = (owner: string, other: string, name: string | undefined, over: Readonly<Record<string, unknown>> | undefined): HeldEntry =>
		stampHeldEntry(
			{ id: entry.id, entryType: type.id, name: name ?? entry.name, fields: { ...defaults, ...(entry.fields ?? {}) } },
			{ ...(over ?? {}), towards: other },
			{ sideOwner: owner },
		)
	if (sides === 1) return [{ holder: 'world', held: side(ends.from, ends.towards, ends.names?.from, overrides.from) }]
	return [
		{ holder: ends.from, held: side(ends.from, ends.towards, ends.names?.from, overrides.from) },
		{ holder: ends.towards, held: side(ends.towards, ends.from, ends.names?.towards, overrides.towards) },
	]
}

// ── Item findings ───────────────────────────────────────────────────────────

const ATTRIBUTE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PART_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FUNCTION_KEY = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*$/
const OWNERS: readonly SlotAppliesTo[] = ['cast', 'world', 'location']
const display = (v: unknown, at: string, required = false) => i18nFindings(v, at, { required }).map((f) => finding('display-text', f))
const ownersFindings = (v: unknown, at: string, reason: string): string[] =>
	v === undefined
		? []
		: !Array.isArray(v) || !v.length || v.some((o) => !(OWNERS as readonly unknown[]).includes(o)) || new Set(v).size !== v.length
			? [finding(reason, `${at} is a non-empty list of owners — ${OWNERS.join(', ')}.`)]
			: []
const shownAsFindings = (v: unknown, at: string): string[] =>
	v === undefined || (typeof v === 'string' && PART_ID.test(v)) ? [] : [finding('bad-shown-as', `${at} is a word a widget reads — ${SHOWN_AS.join(', ')}.`)]
const proseFindings = (v: unknown, at: string): string[] =>
	typeof v === 'string' && v.trim() ? [] : [finding('missing-prose', `${at} has no prose. Say in a sentence what the model reads about it.`)]

/**
 * 🚧 Why one attribute is refused (`bad-attribute`, `bad-attribute-kind`,
 * `bad-bounds`, `bad-start`, `bad-carried-by`, `bad-changed-by`,
 * `bad-visibility`, `bad-tags`, `bad-shown-as`, `missing-prose`,
 * `display-text`). `own` — the modules a ruleset carries, for a scope its
 * visibility names.
 * @experimental
 */
export function rulesetAttributeFindings(a: RulesetAttributeDecl, at: string, own: ReadonlyMap<string, FunctionDecl> = new Map()): string[] {
	if (!a || typeof a !== 'object' || Array.isArray(a)) return [finding('bad-attribute', `${at} is { id, name, kind, prose, … }.`)]
	const out: string[] = []
	if (typeof a.id !== 'string' || !ATTRIBUTE_ID.test(a.id)) out.push(finding('bad-attribute', `${at}.id is '${String(a.id)}'. An attribute is named in lowercase words joined by '-' — 'affection'.`))
	const inline = a.slot === undefined
	if (!inline && (typeof a.slot !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*:slot\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/.test(a.slot)))
		out.push(finding('bad-attribute', `${at}.slot is an attribute slot id — 'core:slot/mood@1'.`))
	if (a.borrowed !== undefined && (a.borrowed !== true || inline))
		out.push(finding('bad-borrowed', `${at}.borrowed is true or left out, and only an attribute that names a slot borrows it.`))
	out.push(...display(a.name, `${at}.name`, inline), ...display(a.description, `${at}.description`))
	if (inline) {
		if (!(ATTRIBUTE_KINDS as readonly unknown[]).includes(a.kind))
			out.push(finding('bad-attribute-kind', `${at}.kind is '${String(a.kind)}'. Say one of ${ATTRIBUTE_KINDS.join(', ')}.`))
		out.push(...proseFindings(a.prose, at))
	} else {
		if (a.kind !== undefined) out.push(finding('bad-attribute-kind', `${at} names a slot, whose kind is the slot's. Leave kind out.`))
		if (a.prose !== undefined && (typeof a.prose !== 'string' || !a.prose.trim())) out.push(...proseFindings(a.prose, at))
	}
	const b = a.bounds
	if (b !== undefined) {
		const numeric = a.kind === 'number' || a.kind === 'pool' || a.kind === 'tally'
		if (!b || typeof b !== 'object' || [b.min, b.max].some((n) => n !== undefined && !Number.isInteger(n)))
			out.push(finding('bad-bounds', `${at}.bounds is { min?, max? } — whole numbers.`))
		else if (b.min !== undefined && b.max !== undefined && b.min > b.max) out.push(finding('bad-bounds', `${at}.bounds.min is above its max.`))
		else if (!numeric && a.kind !== 'list') out.push(finding('bad-bounds', `${at} is a '${String(a.kind)}' — bounds belong to a number, a pool, a tally (and a list's most).`))
	}
	if (a.kind === 'pool' && (b?.max === undefined))
		out.push(finding('bad-bounds', `${at} is a pool with no most. A pool is spent and refilled — say bounds: { max }.`))
	if (a.of !== undefined && (a.kind !== 'label' || !Array.isArray(a.of) || !a.of.length || a.of.some((w) => typeof w !== 'string' || !w) || new Set(a.of).size !== a.of.length))
		out.push(finding('bad-attribute', `${at}.of lists a label's words — distinct, non-empty — and only a label has them.`))
	if (inline && a.start !== undefined) {
		const derived = rulesetAttributeSlotProps(a)
		if (derived) {
			const why = checkSlotValue({ ...derived, id: 'x:slot/x@1', origin: 'code' } as unknown as AttributeSlotDecl, a.start)
			if (why) out.push(finding('bad-start', `${at}.start is refused: ${why}`))
		}
	}
	out.push(...ownersFindings(a.carriedBy, `${at}.carriedBy`, 'bad-carried-by'))
	out.push(...visibilityFindings(a.visibility, `${at}.visibility`, own))
	if (a.visibility === 'holder' && a.carriedBy !== undefined && (a.carriedBy.length !== 1 || a.carriedBy[0] !== 'cast'))
		out.push(finding('bad-visibility', `${at}: only a value each character carries can be seen by its holder alone — say carriedBy: ['cast'], or another visibility.`))
	if (a.changedBy !== undefined && (!Array.isArray(a.changedBy) || !a.changedBy.length || a.changedBy.some((c) => !(ATTRIBUTE_CHANGERS as readonly unknown[]).includes(c))))
		out.push(finding('bad-changed-by', `${at}.changedBy is a non-empty list among ${ATTRIBUTE_CHANGERS.join(', ')}.`))
	out.push(...tagListFindings(a.tags, `${at}.tags`))
	out.push(...shownAsFindings(a.shownAs, `${at}.shownAs`))
	if (a.required !== undefined && typeof a.required !== 'boolean') out.push(finding('bad-attribute', `${at}.required is true, false or left out.`))
	out.push(...attributeReadsOntoFindings(a, at), ...attributeModelShareFindings(a, at))
	return out
}

/** 🚧 Why one entry type is refused (`bad-entry-type`, `bad-holders`, …). @experimental */
export function rulesetEntryTypeFindings(e: RulesetEntryTypeDecl, at: string, own: ReadonlyMap<string, FunctionDecl> = new Map()): string[] {
	if (!e || typeof e !== 'object' || Array.isArray(e)) return [finding('bad-entry-type', `${at} is { id, name, fields?, prose, … }.`)]
	const out: string[] = []
	if (typeof e.id !== 'string' || !PART_ID.test(e.id)) out.push(finding('bad-entry-type', `${at}.id is '${String(e.id)}'. An entry type is named in lowercase words joined by '-' — 'keepsakes'.`))
	out.push(...display(e.name, `${at}.name`, true), ...display(e.description, `${at}.description`))
	out.push(...proseFindings(e.prose, at))
	if (e.fields !== undefined) {
		const s = settingsSchemaFindings(e.fields, `${at}.fields`)
		if (s.length) out.push(...s.map((f) => finding('bad-entry-type', f)))
		else {
			for (const f of checkSchema(e.fields as SettingsSchema).filter((x) => x.severity === 'error'))
				out.push(finding('bad-entry-type', `${at}.fields${f.field ? `.${f.field}` : ''}: ${f.message} — ${f.fix}`))
			for (const k of Object.keys(e.fields))
				if (k === 'name' || k === 'description' || k === 'traits' || (e.relational && (k === 'towards' || k === 'edge')))
					out.push(finding('bad-entry-type', `${at}.fields.${k}: every entry of it has '${k}' already. Name the field otherwise.`))
		}
	}
	if (e.piece !== undefined && (e.piece?.type !== 'object' || !e.piece.fields))
		out.push(finding('bad-entry-type', `${at}.piece is a repertoire's whole piece shape — an object field with its fields.`))
	for (const flag of ['traits', 'relational'] as const)
		if (e[flag] !== undefined && e[flag] !== true) out.push(finding('bad-entry-type', `${at}.${flag} is true or left out.`))
	if (e.entryable !== undefined && e.entryable !== false) out.push(finding('bad-entry-type', `${at}.entryable is false or left out — an entry type is entryable.`))
	if (e.renderDepth !== undefined && !(RENDER_DEPTHS as readonly unknown[]).includes(e.renderDepth))
		out.push(finding('bad-render-depth', `${at}.renderDepth is one of ${RENDER_DEPTHS.join(', ')}.`))
	out.push(...ownersFindings(e.holders, `${at}.holders`, 'bad-holders'))
	out.push(...visibilityFindings(e.visibility, `${at}.visibility`, own))
	out.push(...tagListFindings(e.tags, `${at}.tags`))
	out.push(...shownAsFindings(e.shownAs, `${at}.shownAs`))
	// 🚧 Ties on the graph (T1, T2, T5): the far end, what reads onto the lorebook, what the model is told.
	out.push(...farEndFindings(e, at))
	if (e.readsOnto !== undefined || e.modelShare !== undefined) {
		const fields = e.fields !== undefined && settingsSchemaFindings(e.fields, `${at}.fields`).length ? {} : entryTypeFields(e)
		out.push(...entryTypeReadsOntoFindings(e, fields, at), ...entryTypeModelShareFindings(e, fields, at))
	}
	return out
}

/**
 * 🚧 Why one zone type is refused (`bad-zone-type`, `bad-owners`,
 * `bad-holds`, `bad-limit`, …). With `ctx`, what it holds and the attribute
 * a limit reads are checked against the ruleset too.
 * @experimental
 */
export function zoneTypeFindings(
	z: ZoneTypeDecl,
	at: string,
	ctx?: { entryTypes: ReadonlySet<string>; attributes: ReadonlySet<string>; modules?: ReadonlyMap<string, FunctionDecl> },
): string[] {
	if (!z || typeof z !== 'object' || Array.isArray(z)) return [finding('bad-zone-type', `${at} is { id, name, owners, holds, prose, … }.`)]
	const out: string[] = []
	if (typeof z.id !== 'string' || !PART_ID.test(z.id)) out.push(finding('bad-zone-type', `${at}.id is '${String(z.id)}'. A zone type is named in lowercase words joined by '-' — 'hand'.`))
	out.push(...display(z.name, `${at}.name`, true), ...display(z.description, `${at}.description`))
	out.push(...proseFindings(z.prose, at))
	if (z.owners === undefined) out.push(finding('bad-owners', `${at}.owners says who carries one — ${OWNERS.join(', ')}.`))
	else out.push(...ownersFindings(z.owners, `${at}.owners`, 'bad-owners'))
	if (z.holds !== ZONE_HOLDS_ANY) {
		if (!Array.isArray(z.holds) || !z.holds.length || z.holds.some((h) => typeof h !== 'string' || !h))
			out.push(finding('bad-holds', `${at}.holds lists the entry types it takes, by id, or says '${ZONE_HOLDS_ANY}' for any.`))
		else if (ctx) for (const h of z.holds) if (!ctx.entryTypes.has(h)) out.push(finding('bad-holds', `${at}.holds names '${h}', which is none of the ruleset's entry types.`))
	}
	const lim = z.limit
	if (lim !== undefined) {
		if (typeof lim === 'number') {
			if (!Number.isInteger(lim) || lim < 1) out.push(finding('bad-limit', `${at}.limit is a whole number of at least 1, or { attribute }.`))
		} else if (!lim || typeof lim !== 'object' || typeof lim.attribute !== 'string')
			out.push(finding('bad-limit', `${at}.limit is a whole number, or { attribute: 'strength' } — as many as its owner's attribute says.`))
		else if (ctx && !ctx.attributes.has(lim.attribute)) out.push(finding('bad-limit', `${at}.limit reads '${lim.attribute}', which is none of the ruleset's attributes.`))
	}
	if (z.ordered !== undefined && z.ordered !== true) out.push(finding('bad-zone-type', `${at}.ordered is true or left out.`))
	out.push(...visibilityFindings(z.visibility, `${at}.visibility`, ctx?.modules))
	out.push(...shownAsFindings(z.shownAs, `${at}.shownAs`))
	// 🚧 What it is, for a genre that plays best with it (RF fix 8: `uses.zoneTypes` by tag).
	out.push(...tagListFindings((z as { tags?: unknown }).tags, `${at}.tags`))
	return out
}

/** 🚧 Why one outcome word is refused (`bad-outcome`). @experimental */
export function rulesetOutcomeFindings(o: RulesetOutcomeDecl, at: string): string[] {
	if (!o || typeof o !== 'object' || Array.isArray(o)) return [finding('bad-outcome', `${at} is { id, label, five?, from? }.`)]
	const out: string[] = []
	if (typeof o.id !== 'string' || !PART_ID.test(o.id)) out.push(finding('bad-outcome', `${at}.id is '${String(o.id)}'. An outcome is named in lowercase words joined by '-' — 'warmed'.`))
	out.push(...display(o.label, `${at}.label`, true))
	if (o.five !== undefined && !(FIVE_BANDS as readonly unknown[]).includes(o.five))
		out.push(finding('bad-outcome', `${at}.five is '${String(o.five)}'. Say one of ${FIVE_BANDS.join(', ')}, or leave the ladder out.`))
	if (o.from !== undefined && typeof o.from !== 'number') out.push(finding('bad-outcome', `${at}.from is the least margin it starts at — a number.`))
	return out
}

// ── Derived attribute slots ─────────────────────────────────────────────────

/**
 * 🚧 The attribute slot a ruleset's own attribute files its values under:
 * `<owner>.<ruleset>:slot/<attribute>@<ruleset major>` —
 * `jody.hollow-hearts:slot/affection@1` for `affection` on
 * `jody:ruleset/hollow-hearts@1`. The owner segment holds the ruleset, so
 * the slug is the attribute's own name (what a selector reads) and two
 * rulesets never share one.
 * @experimental
 */
export function rulesetAttributeSlotId(rulesetId: string, attributeId: string): SlotId {
	const m = /^([a-z0-9]+(?:[.-][a-z0-9]+)*):ruleset\/([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/.exec(rulesetId)
	if (!m) throw new Error(`'${rulesetId}' is not a ruleset id. Use 'owner:ruleset/name@N'.`)
	return `${m[1]}.${m[2]}:slot/${attributeId}@${m[3]}`
}

/**
 * 🚧 The attribute slot an inline attribute is, as declaration props —
 * `number`, `pool` and `tally` an integer (a pool starts full, a tally at
 * nothing), `label` an enum of its words (free words without), `list` a
 * list. `undefined` for an attribute that names a slot, or one too broken to
 * say (its findings say why).
 * @experimental
 */
export function rulesetAttributeSlotProps(a: RulesetAttributeDecl): AttributeSlotProps | undefined {
	if (!a || a.slot !== undefined || !(ATTRIBUTE_KINDS as readonly unknown[]).includes(a.kind)) return undefined
	const b = a.bounds ?? {}
	const config: SlotConfig = {}
	let type: AttributeSlotProps['type']
	let start: SlotValue | undefined = a.start
	switch (a.kind) {
		case 'number':
			type = 'integer'
			if (b.min !== undefined) config.min = b.min
			if (b.max !== undefined) config.max = b.max
			break
		case 'pool':
			type = 'integer'
			config.min = b.min ?? 0
			if (b.max !== undefined) config.max = b.max
			start = start ?? b.max
			break
		case 'tally':
			type = 'integer'
			config.min = b.min ?? 0
			if (b.max !== undefined) config.max = b.max
			start = start ?? config.min
			break
		case 'label':
			type = a.of?.length ? 'enum' : 'text'
			if (a.of?.length) config.of = [...a.of]
			break
		case 'list':
			type = 'list'
			if (b.max !== undefined) config.maxItems = b.max
			break
		case 'text':
			// 🚧 Free prose per holder: a text slot, read as words.
			type = 'text'
			break
	}
	const appliesTo = a.carriedBy?.length ? [...a.carriedBy] : ['cast' as const]
	return {
		type,
		...(a.name !== undefined ? { label: a.name } : {}),
		...(a.description !== undefined ? { description: a.description } : {}),
		descriptor: typeof a.prose === 'string' ? a.prose : '',
		appliesTo,
		...(Object.keys(config).length ? { config } : {}),
		...(start !== undefined ? { default: start } : {}),
		...(a.visibility === 'holder' && appliesTo.length === 1 && appliesTo[0] === 'cast' ? { earshot: 'holder' as const } : {}),
	}
}

/**
 * 🚧 The attribute slots a ruleset's own attributes are filed under — one
 * per attribute that names no slot: `{ id, props }`. Pure;
 * `defineRuleset` registers them with the ruleset.
 * @experimental
 */
export function rulesetAttributeSlotDecls(ruleset: { id: string } & Pick<RulesetSections, 'attributes'>): { id: SlotId; props: AttributeSlotProps }[] {
	const out: { id: SlotId; props: AttributeSlotProps }[] = []
	for (const a of ruleset.attributes ?? []) {
		const props = rulesetAttributeSlotProps(a)
		if (props) out.push({ id: rulesetAttributeSlotId(ruleset.id, a.id), props })
	}
	return out
}

/**
 * 🚧 The slot each of a ruleset's attributes is filed under, by attribute id:
 * the slot it names, else its derived one.
 * @experimental
 */
export function rulesetAttributeSlots(ruleset: { id: string } & Pick<RulesetSections, 'attributes'>): ReadonlyMap<string, SlotId> {
	return new Map((ruleset.attributes ?? []).map((a) => [a.id, a.slot ?? rulesetAttributeSlotId(ruleset.id, a.id)]))
}

/**
 * 🚧 A ruleset's zone types as a session has them: its own, and the host's
 * `carried` (`CARRIED_ZONE_TYPE`) unless it declares a `carried` of its own.
 * @experimental
 */
export function rulesetZoneTypes(decl: unknown): readonly ZoneTypeDecl[] {
	const own = rulesetSections(decl).zoneTypes ?? []
	return own.some((z) => z.id === CARRIED_ZONE_TYPE.id) ? own : [...own, CARRIED_ZONE_TYPE]
}

// ── The aliases: the shapes before the sections, read into them ────────────

/** The parts of any declaration-shaped thing the aliases read. */
type Readable = Partial<RulesetProps> & { id?: string } & Record<string, unknown>

const PHASE_OF: Readonly<Record<(typeof RULESET_SCRIPT_PHASES)[number], FunctionPhase>> = {
	effects: 'effects',
	derived: 'derived',
	'pre-roll': 'before',
	'post-roll': 'after',
	render: 'render',
}

const slugOf = (s: string): string =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'x'

/** `owner:ruleset/name@N` → `[owner, name]`, or a local stand-in for a partial declaration. */
const rulesetParts = (id: unknown): [string, string] => {
	const m = typeof id === 'string' ? /^([a-z0-9]+(?:[.-][a-z0-9]+)*):ruleset\/([a-z0-9]+(?:-[a-z0-9]+)*)@\d+$/.exec(id) : null
	return m ? [m[1]!, m[2]!] : ['local', 'ruleset']
}

/** ⏳ A method key's function: core's kinds by `CHECK_METHOD_FUNCTIONS`, a package kind `owner:name` as `owner:function/name@1`. */
const methodFunctionId = (kind: unknown): string => {
	const core = CHECK_METHOD_FUNCTIONS[kind as CoreCheckMethodKind]
	if (core) return core
	if (isPackageFunctionKind(kind)) {
		const [o, n] = (kind as string).split(':')
		return `${o}:function/${n}@1`
	}
	return CORE_FUNCTION_IDS.judge
}

function aliasAttributes(d: Readable): RulesetAttributeDecl[] {
	const out: RulesetAttributeDecl[] = []
	const ids = new Set<string>()
	for (const e of (Array.isArray(d.stats) ? d.stats : []) as readonly NonNullable<RulesetProps['stats']>[number][]) {
		if (!e || typeof e.id !== 'string') continue
		const id = slotSlug(e.id) || slugOf(e.id)
		ids.add(id)
		out.push({
			id,
			slot: e.id,
			...(e.borrowed === true ? { borrowed: true as const } : {}),
			...(e.required !== undefined ? { required: e.required } : {}),
			...(e.default !== undefined ? { start: e.default } : {}),
			...(e.config !== undefined ? { config: e.config } : {}),
			...(e.appliesTo !== undefined ? { carriedBy: e.appliesTo } : {}),
		})
	}
	for (const [name, sel] of Object.entries((d.selectors ?? {}) as Record<string, RulesetSelectorDecl>))
		if (sel?.kind === 'stat' && !ids.has(name) && typeof sel.slot === 'string') {
			ids.add(name)
			out.push({ id: name, slot: sel.slot, borrowed: true })
		}
	return out
}

function aliasFunctions(d: Readable): FunctionRef[] {
	const out: FunctionRef[] = []
	// The ways a check is decided: the default first, then the rest in order.
	const conv = normaliseConventions(d as never).conventions
	const methods = Object.entries(conv.methods as Readonly<Record<string, CheckMethodDecl>>)
	const def = conv.defaultMethod
	const ordered = [...methods.filter(([k]) => k === def), ...methods.filter(([k]) => k !== def)]
	const deg = (d.conventions as RulesetConventions | undefined)?.degrees
	let naturalCarried = false
	for (const [key, m] of ordered) {
		const { kind, ...options } = (m ?? {}) as CheckMethodDecl & Record<string, unknown>
		// ⏳ Natural die faces read the degrees ruleset-wide; they ride with the first die thrown against a target.
		const natural =
			!naturalCarried && kind === 'die-target' && (deg?.natural !== undefined || deg?.naturalShift !== undefined)
				? { ...(deg?.natural !== undefined ? { natural: deg.natural } : {}), ...(deg?.naturalShift !== undefined ? { naturalShift: deg.naturalShift } : {}) }
				: {}
		if (Object.keys(natural).length) naturalCarried = true
		const opts = { ...options, ...natural }
		out.push({ ref: methodFunctionId(kind), key, ...(Object.keys(opts).length ? { options: opts } : {}) })
	}
	const wayKeys = new Map(out.map((r, i) => [r.key!, i]))
	for (const [name, sel] of Object.entries((d.selectors ?? {}) as Record<string, RulesetSelectorDecl>)) {
		if (sel?.kind === 'check') {
			// A check named as its way (Wherewithal's `dare`, `contest`) is that way's use: its base
			// and `within` ride on the way's reference (read back without them).
			const way = wayKeys.get(name)
			if (way !== undefined && sel.method === name) {
				const ref = out[way]!
				const extra = { ...(sel.base !== undefined ? { base: sel.base } : {}), ...(sel.within !== undefined ? { within: sel.within } : {}) }
				if (Object.keys(extra).length) out[way] = { ...ref, options: { ...(ref.options ?? {}), ...extra } }
				continue
			}
			const options = {
				...(sel.base !== undefined ? { base: sel.base } : {}),
				...(sel.method !== undefined ? { way: sel.method } : {}),
				...(sel.within !== undefined ? { within: sel.within } : {}),
			}
			out.push({ ref: CORE_FUNCTION_IDS.check, key: name, ...(Object.keys(options).length ? { options } : {}) })
		} else if (sel?.kind === 'derived') {
			const options = {
				from: [...(sel.from ?? [])],
				...(sel.onSheet !== undefined ? { onSheet: sel.onSheet } : {}),
				...(sel.label !== undefined ? { label: sel.label } : {}),
			}
			out.push({ ref: CORE_FUNCTION_IDS.workedOut, key: name, options })
		} else if (sel?.kind === 'tally') out.push({ ref: CORE_FUNCTION_IDS.tally, key: name })
	}
	const c = d.conventions as RulesetConventions | undefined
	if (c?.bonuses !== undefined) out.push({ ref: CORE_FUNCTION_IDS.typedBonuses, key: 'typed-bonuses', options: { ...c.bonuses } })
	if (c?.casting !== undefined) out.push({ ref: CORE_FUNCTION_IDS.castingPool, key: 'casting-pool', options: { ...c.casting } })
	// The ruleset's own scripts, as modules it carries: phase order, then priority.
	const [owner, rs] = rulesetParts(d.id)
	const scripts = [...((Array.isArray(d.scripts) ? d.scripts : []) as readonly NonNullable<RulesetProps['scripts']>[number][])]
		.map((s, i) => ({ s, i }))
		.filter(({ s }) => s && typeof s.seedKey === 'string' && (RULESET_SCRIPT_PHASES as readonly string[]).includes(s.phase))
		.sort((a, b) => RULESET_SCRIPT_PHASES.indexOf(a.s.phase) - RULESET_SCRIPT_PHASES.indexOf(b.s.phase) || (a.s.priority ?? 0) - (b.s.priority ?? 0) || a.i - b.i)
	for (const { s } of scripts) {
		const tail = slugOf(s.seedKey.slice(Math.max(s.seedKey.lastIndexOf('/'), s.seedKey.lastIndexOf(':')) + 1))
		const name = tail.startsWith(`${rs}-`) || tail === rs ? tail : `${rs}-${tail}`
		const id = `${owner}:function/${name}@1`
		const phase = PHASE_OF[s.phase]
		const module: FunctionDecl = {
			id,
			name: s.seedKey,
			meaning: `The ruleset's own ${phase} script.`,
			kind: s.phase === 'derived' ? 'value' : 'changing',
			prose: `The ruleset's own script runs at ${phase}.`,
			phases: [phase],
			seedKey: s.seedKey,
		}
		out.push({ ref: id, key: name, module })
	}
	return out
}

function aliasEntryTypes(d: Readable): RulesetEntryTypeDecl[] {
	const reps = (Array.isArray(d.repertoires) ? d.repertoires : []) as readonly RepertoireDecl[]
	const entryable = new Set(rulesetEntryable({ entryable: d.entryable as readonly string[] | undefined, repertoires: reps }))
	return reps
		.filter((r) => r && typeof r.id === 'string')
		.map((r) => ({
			id: r.id,
			name: r.label,
			...(r.description !== undefined ? { description: r.description } : {}),
			...(r.piece !== undefined ? { piece: r.piece } : {}),
			prose: r.prose,
			...(r.relational ? { relational: true as const } : {}),
			...(r.appliesTo !== undefined ? { holders: r.appliesTo } : {}),
			...(r.gmOnly ? { visibility: 'gm' as const } : r.earshot === 'holder' ? { visibility: 'holder' as const } : {}),
			...(r.tags !== undefined ? { tags: r.tags } : {}),
			...(r.mechanics !== undefined ? { mechanics: r.mechanics } : {}),
			...(r.renderDepth !== undefined ? { renderDepth: r.renderDepth } : {}),
			...(r.renames !== undefined ? { renames: r.renames } : {}),
			...(r.retired !== undefined ? { retired: r.retired } : {}),
			...(entryable.has(r.id) ? {} : { entryable: false as const }),
		}))
}

function aliasOptions(d: Readable): RulesetOptions | undefined {
	const settings = (d.settings ?? undefined) as Readonly<Record<string, RulesetSettingDecl>> | undefined
	const out: { fields?: Record<string, FieldDecl>; lays?: Record<string, Record<string, RulesetChoiceLays>>; presets?: readonly RulesetPresetDecl[]; conversions?: readonly ConversionDecl[] } = {}
	if (settings && typeof settings === 'object') {
		const fields: Record<string, FieldDecl> = {}
		const lays: Record<string, Record<string, RulesetChoiceLays>> = {}
		for (const [name, s] of Object.entries(settings)) {
			const choices = Array.isArray(s?.choices) ? s.choices : []
			fields[name] = {
				type: 'enum',
				label: s.label,
				...(s.description !== undefined ? { description: s.description } : {}),
				of: choices.map((c) => c.id),
				members: choices.map((c) => ({ key: c.id, label: c.label, ...(c.description !== undefined ? { description: c.description } : {}) })),
				default: s.default,
			} as FieldDecl
			for (const c of choices) if (c?.conventions !== undefined) (lays[name] ??= {})[c.id] = { conventions: c.conventions }
		}
		out.fields = fields
		if (Object.keys(lays).length) out.lays = lays
	}
	if (d.presets !== undefined) out.presets = d.presets as readonly RulesetPresetDecl[]
	if (d.conversions !== undefined) out.conversions = d.conversions as readonly ConversionDecl[]
	return Object.keys(out).length ? (out as RulesetOptions) : undefined
}

/**
 * 🚧 **The seven sections of any declaration** — the one reading every new
 * reader calls: each section as declared, else ⏳ read from the shape before
 * sections (the module note lists the aliases). Pure; a section neither
 * says is left out, so `{ name }` reads as `{}` (R9). Idempotent:
 * `rulesetSections(rulesetInSections(d))` is `rulesetSections(d)`.
 * @experimental
 */
export function rulesetSections(decl: unknown): RulesetSections {
	if (!decl || typeof decl !== 'object') return {}
	const d = decl as Readable
	const out: RulesetSections & Record<string, unknown> = {}
	const has = (k: RulesetSectionKey) => d[k] !== undefined
	if (has('attributes')) out.attributes = d.attributes as RulesetSections['attributes']
	else {
		const a = aliasAttributes(d)
		if (a.length) out.attributes = a
	}
	if (has('functions')) out.functions = d.functions as RulesetSections['functions']
	else {
		const f = aliasFunctions(d)
		if (f.length) out.functions = f
	}
	if (has('entryTypes')) out.entryTypes = d.entryTypes as RulesetSections['entryTypes']
	else {
		const e = aliasEntryTypes(d)
		if (e.length) out.entryTypes = e
	}
	if (has('zoneTypes')) out.zoneTypes = d.zoneTypes as RulesetSections['zoneTypes']
	const c = d.conventions as RulesetConventions | undefined
	if (has('outcomes')) out.outcomes = d.outcomes as RulesetSections['outcomes']
	// The degrees in force when none are declared (`DEFAULT_DEGREES`, what a normalised ruleset holds) are no outcome words of its own.
	else if (Array.isArray(c?.degrees?.bands) && c!.degrees !== DEFAULT_DEGREES)
		out.outcomes = c!.degrees!.bands.map((b) => ({ id: b.id, label: b.label, five: b.five, ...(b.from !== undefined ? { from: b.from } : {}) }))
	if (has('time')) out.time = d.time as RulesetSections['time']
	else if (c?.time !== undefined)
		out.time = {
			...c.time,
			...(c.actions !== undefined ? { turns: c.actions as RulesetTurns } : {}),
			...(c.rest !== undefined ? { rests: c.rest as readonly RulesetRestDecl[] } : {}),
		}
	if (has('library')) out.library = d.library as RulesetSections['library']
	else if (d.compendium !== undefined) out.library = d.compendium as RulesetLibrary
	if (has('options')) out.options = d.options as RulesetSections['options']
	else {
		const o = aliasOptions(d)
		if (o) out.options = o
	}
	return out
}

/** The keys a declaration says outside the sections and the shapes before them. */
const KEPT_KEYS = ['name', 'description', 'voice', 'template', 'plays', 'map', 'handbook', 'playtests'] as const

/**
 * 🚧 A declaration **in the seven sections**: its name, description, voice,
 * template mark, `plays`, `map`, handbook pages and saved tests kept, every section read
 * (`rulesetSections`), and the shapes before the sections left behind — what
 * a data upgrade persists for a stored ruleset. Pure; the id, origin and
 * author stay with the caller.
 * @experimental
 */
export function rulesetInSections(decl: unknown): RulesetProps {
	const d = (decl ?? {}) as Readable
	const out: Record<string, unknown> = {}
	for (const k of KEPT_KEYS) if (d[k] !== undefined) out[k] = d[k]
	return { ...out, ...rulesetSections(d) } as RulesetProps
}

// ── Read back: sections → the conventions today's readers take ─────────────

/**
 * 🚧 The conventions a declaration in sections plays by, for the readers of
 * the shapes before them (`normaliseRuleset`, `rulesetCheckMethod`,
 * `rulesetDifficultyBands`): its deciding references to core's check-method
 * functions as `methods` (the first the default), its outcomes with a full
 * ladder as `degrees` (natural faces from the first die's options), its
 * time, turns and rests, its bonuses and casting pool. `undefined` when
 * the sections say none of these.
 * @internal
 */
export function sectionsConventions(s: RulesetSections): Partial<RulesetConventions> | undefined {
	const out: Partial<RulesetConventions> & Record<string, unknown> = {}
	const methods: Record<string, CheckMethodDecl> = {}
	let natural: Pick<DegreeCrosswalk, 'natural' | 'naturalShift'> | undefined
	for (const ref of s.functions ?? []) {
		const kind = checkMethodKindOfFunction(ref?.ref)
		if (ref?.ref === CORE_FUNCTION_IDS.typedBonuses) out.bonuses = { ...(ref.options as object) } as RulesetConventions['bonuses']
		if (ref?.ref === CORE_FUNCTION_IDS.castingPool) out.casting = { ...(ref.options as object) } as RulesetConventions['casting']
		if (!kind) continue
		// A check's base and `within` ride on its way's reference (⏳ a check named as its way); no check method says them.
		const { natural: nat, naturalShift, base: _b, within: _w, ...options } = (ref.options ?? {}) as Record<string, unknown>
		if (!natural && (nat !== undefined || naturalShift !== undefined))
			natural = { ...(nat !== undefined ? { natural: nat as DegreeCrosswalk['natural'] } : {}), ...(naturalShift !== undefined ? { naturalShift: naturalShift as DegreeCrosswalk['naturalShift'] } : {}) }
		methods[functionRefKey(ref)] = { ...options, kind } as CheckMethodDecl
	}
	const keys = Object.keys(methods)
	if (keys.length) {
		out.methods = methods
		out.defaultMethod = keys[0]
	}
	const outcomes = s.outcomes ?? []
	if (outcomes.length && outcomes.every((o) => o?.five !== undefined))
		out.degrees = { bands: outcomes.map((o) => ({ id: o.id, label: o.label, five: o.five!, ...(o.from !== undefined ? { from: o.from } : {}) })), ...(natural ?? {}) }
	if (s.time) {
		const { turns, rests, ...time } = s.time
		out.time = time as RulesetTime
		if (turns !== undefined) out.actions = turns as RulesetConventions['actions']
		if (rests !== undefined) out.rest = rests as RulesetConventions['rest']
	}
	return Object.keys(out).length ? out : undefined
}

/**
 * 🚧 The settings a declaration in sections offers, in the shape before
 * sections (`RulesetSettingDecl`): every `enum` option with its members as
 * choices and what each `lays`. What `rulesetSettingValues` and
 * `rulesetConventionsFor` read. Options of other field types are values a
 * function reads, never choices that lay conventions.
 * @internal
 */
export function sectionsSettings(options: RulesetOptions | undefined): Record<string, RulesetSettingDecl> | undefined {
	const out: Record<string, RulesetSettingDecl> = {}
	for (const [name, f] of Object.entries(options?.fields ?? {})) {
		if (f?.type !== 'enum') continue
		const keys = f.members?.length ? f.members.map((m) => m.key) : [...((f.of as readonly string[] | undefined) ?? [])]
		out[name] = {
			label: f.label ?? name,
			...(f.description !== undefined ? { description: f.description } : {}),
			choices: keys.map((k) => {
				const m = f.members?.find((x) => x.key === k)
				const lays = options?.lays?.[name]?.[k]
				return { id: k, label: m?.label ?? k, ...(m?.description !== undefined ? { description: m.description } : {}), ...(lays?.conventions ? { conventions: lays.conventions } : {}) }
			}),
			default: typeof f.default === 'string' ? f.default : (keys[0] ?? ''),
		}
	}
	return Object.keys(out).length ? out : undefined
}

// ── Section findings ────────────────────────────────────────────────────────

/**
 * Whether a declaration says a list before the sections: a registered
 * declaration always carries `stats` and `repertoires` (⏳, empty for a
 * ruleset in sections — `_rulesetDeclOf`), so an empty one says nothing.
 */
const saysList = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : v !== undefined)

/** Which shape before the sections each section replaces — said beside it, it is refused. */
const LEGACY_OF: Readonly<Record<RulesetSectionKey, (d: Readable) => string | undefined>> = {
	attributes: (d) => (saysList(d.stats) ? 'stats' : undefined),
	functions: (d) =>
		d.selectors !== undefined
			? 'selectors'
			: d.scripts !== undefined
				? 'scripts'
				: (d.conventions as RulesetConventions | undefined)?.methods !== undefined
					? 'conventions.methods'
					: (d.conventions as RulesetConventions | undefined)?.dice !== undefined
						? 'conventions.dice'
						: undefined,
	entryTypes: (d) => (saysList(d.repertoires) ? 'repertoires' : d.entryable !== undefined ? 'entryable' : undefined),
	zoneTypes: () => undefined,
	outcomes: (d) => ((d.conventions as RulesetConventions | undefined)?.degrees !== undefined ? 'conventions.degrees' : undefined),
	time: (d) => (d.conventions !== undefined ? 'conventions' : undefined),
	library: (d) => (d.compendium !== undefined ? 'compendium' : undefined),
	options: (d) => (d.settings !== undefined ? 'settings' : d.presets !== undefined ? 'presets' : d.conversions !== undefined ? 'conversions' : undefined),
}

/**
 * A section entry type read as a repertoire — what the piece checker and the piece rules take, and
 * (🚧 2026-10-23) what a reader of the shape before the sections reads of it: its tags, render
 * depth, `gmOnly` / `earshot` from its visibility, and `entryable` unless it says never.
 * @internal
 */
export function _entryTypeAsRepertoire(e: RulesetEntryTypeDecl): RepertoireDecl {
	return {
		id: e.id,
		label: e.name,
		...(e.description !== undefined ? { description: e.description } : {}),
		prose: e.prose,
		piece: e.piece ?? { type: 'object', fields: entryTypeFields(e) },
		...(e.relational ? { relational: true } : {}),
		...(e.holders ? { appliesTo: e.holders } : {}),
		...(e.tags !== undefined ? { tags: e.tags } : {}),
		...(e.visibility === 'gm' ? { gmOnly: true } : e.visibility === 'holder' ? { earshot: 'holder' } : {}),
		...(e.mechanics ? { mechanics: e.mechanics } : {}),
		...(e.renderDepth !== undefined ? { renderDepth: e.renderDepth } : {}),
		...(e.renames ? { renames: e.renames } : {}),
		...(e.retired ? { retired: e.retired } : {}),
		...(e.entryable !== false ? { entryable: true } : {}),
	} as RepertoireDecl
}

/** 🚧 ⏳ What a declaration in sections reads as in the shape before them (`sectionsLegacyView`). @internal */
export interface SectionsLegacyView {
	readonly stats?: readonly NonNullable<RulesetProps['stats']>[number][]
	readonly repertoires?: readonly RepertoireDecl[]
	readonly selectors?: Readonly<Record<string, RulesetSelectorDecl>>
	readonly compendium?: CompendiumDecl
}

/**
 * 🚧 ⏳ **A declaration in sections, read back into the shape before them**
 * (2026-10-23) — for that shape's readers (`rulesetContext`,
 * `rulesetSelectors`, primers, vocabularies, a host's engine), each list
 * only where its section is said: attributes as `stats` (each under the slot
 * it is filed under), entry types as `repertoires`, checks, worked-out
 * values and tallies — and each way to decide, a check by its own name — as
 * `selectors` (an attribute named otherwise than its slot, a stat selector),
 * the library as `compendium`. The registry hangs these on a registered
 * declaration in sections unenumerated (`_rulesetDeclOf`): never hashed,
 * never in its document, never said beside its sections. Pure.
 * @internal
 */
export function sectionsLegacyView(id: string, s: RulesetSections): SectionsLegacyView {
	const out: { -readonly [K in keyof SectionsLegacyView]: SectionsLegacyView[K] } = {}
	const attributes = s.attributes ?? []
	const slots = RULESET_ID_PATTERN.test(id) ? rulesetAttributeSlots({ id, attributes }) : new Map<string, string>()
	if (s.attributes !== undefined)
		out.stats = attributes
			.filter((a) => slots.has(a?.id))
			.map((a) => ({
				id: slots.get(a.id)!,
				...(a.borrowed === true ? { borrowed: true as const } : {}),
				...(a.required !== undefined ? { required: a.required } : {}),
				...(a.start !== undefined ? { default: a.start } : {}),
				...(a.config !== undefined ? { config: a.config } : {}),
				...(a.carriedBy !== undefined ? { appliesTo: a.carriedBy } : {}),
			})) as NonNullable<RulesetProps['stats']>[number][]
	if (s.entryTypes !== undefined) out.repertoires = s.entryTypes.map(_entryTypeAsRepertoire)
	if (s.functions !== undefined || attributes.some((a) => typeof a?.slot === 'string' && slotSlug(a.slot) !== a.id)) {
		const sel: Record<string, RulesetSelectorDecl> = {}
		for (const a of attributes)
			if (typeof a?.slot === 'string' && slotSlug(a.slot) !== a.id) sel[a.id] = { kind: 'stat', slot: a.slot } as RulesetSelectorDecl
		for (const f of s.functions ?? []) {
			const key = functionRefKey(f)
			const o = (f?.options ?? {}) as Record<string, unknown>
			const base = o.base !== undefined ? { base: o.base } : {}
			const within = o.within !== undefined ? { within: o.within } : {}
			if (f.ref === CORE_FUNCTION_IDS.check) sel[key] = { kind: 'check', ...base, ...(o.way !== undefined ? { method: o.way } : {}), ...within } as RulesetSelectorDecl
			else if (f.ref === CORE_FUNCTION_IDS.workedOut)
				sel[key] = { kind: 'derived', from: Array.isArray(o.from) ? [...o.from] : [], ...(o.onSheet !== undefined ? { onSheet: o.onSheet } : {}), ...(o.label !== undefined ? { label: o.label } : {}) } as RulesetSelectorDecl
			else if (f.ref === CORE_FUNCTION_IDS.tally) sel[key] = { kind: 'tally' } as RulesetSelectorDecl
			// A way to decide is a check by its own name (Wherewithal's `dare`): its base and `within` ride on it.
			else if (checkMethodKindOfFunction(f.ref)) sel[key] ??= { kind: 'check', method: key, ...base, ...within } as RulesetSelectorDecl
		}
		out.selectors = sel
	}
	if (s.library !== undefined) out.compendium = s.library as CompendiumDecl
	return out
}

/**
 * 🚧 An entry type's whole field shape — the fields every entry of it has:
 * its repertoire's whole piece shape when it was one (⏳), else `name` and
 * `description`, `traits` when it says so, `towards` and `edge` when
 * relational, then its own fields.
 * @experimental
 */
export function entryTypeFields(e: RulesetEntryTypeDecl): SettingsSchema {
	if (e.piece?.fields) return { ...e.piece.fields }
	return {
		name: PIECE_FIELDS.name!,
		description: PIECE_FIELDS.description!,
		...(e.traits ? { traits: PIECE_FIELDS.traits! } : {}),
		...(e.relational ? RELATIONAL_PIECE_FIELDS : {}),
		...(e.fields ?? {}),
	}
}

/**
 * 🚧 Every reason a ruleset's sections are refused, each opened by its
 * reason's name: `legacy-beside-section` (a section and the shape it
 * replaces, both said), `bad-section` (not a list / an object),
 * `duplicate-attribute` · `duplicate-entry-type` · `duplicate-zone-type` ·
 * `duplicate-outcome` · `duplicate-function-key` · `bad-function-key` ·
 * `name-taken` (a function key that is an attribute's id), every item's
 * (`rulesetAttributeFindings`, `rulesetEntryTypeFindings`,
 * `zoneTypeFindings`, `rulesetOutcomeFindings`), 🚧 `unheld-tie` (a
 * one-sided tie no zone type of the world's holds — `unheldTieFindings`),
 * every function reference's (`functionRefFindings`; an `entryFields` role
 * may name an entry field selector), the time section's (`bad-time-unit`,
 * `bad-actions`, `bad-rest`), the library's (`unknown-entry-type`,
 * `bad-row`, `duplicate-row`, `missing-source`), the options' (fields,
 * reach, `bad-preset`, conversion reasons), and the ⏳ piece rules an entry
 * type carries, checked as a repertoire's are.
 * @experimental
 */
export function rulesetSectionFindings(id: string, input: unknown): string[] {
	// Only what it says: a registered declaration's unenumerated ⏳ read-back is never judged (`_rulesetDeclOf`).
	const d = (input && typeof input === 'object' ? { ...input } : {}) as Readable
	const out: string[] = []
	for (const k of RULESET_SECTIONS) {
		if (d[k] === undefined) continue
		const legacy = LEGACY_OF[k](d)
		if (legacy) out.push(finding('legacy-beside-section', `${id} says ${k} and ${legacy}. ${legacy} is the shape before the sections — say one of them.`))
	}
	const list = <T>(k: RulesetSectionKey): readonly T[] => {
		const v = d[k]
		if (v === undefined) return []
		if (!Array.isArray(v)) {
			out.push(finding('bad-section', `${id}.${k} is a list.`))
			return []
		}
		return v as readonly T[]
	}
	const attributes = list<RulesetAttributeDecl>('attributes')
	const functions = list<FunctionRef>('functions')
	const entryTypes = list<RulesetEntryTypeDecl>('entryTypes')
	const zoneTypes = list<ZoneTypeDecl>('zoneTypes')
	const outcomes = list<RulesetOutcomeDecl>('outcomes')
	const modules = new Map<string, FunctionDecl>()
	for (const f of functions) if (f?.module && typeof f.module.id === 'string') modules.set(f.module.id, f.module)
	const unique = (items: readonly { id?: unknown }[], what: string, reason: string, at: string) => {
		const seen = new Set<string>()
		for (const x of items)
			if (typeof x?.id === 'string') {
				if (seen.has(x.id)) out.push(finding(reason, `${id}.${at} names the ${what} '${x.id}' twice.`))
				seen.add(x.id)
			}
		return seen
	}
	const attrIds = unique(attributes, 'attribute', 'duplicate-attribute', 'attributes')
	const etIds = unique(entryTypes, 'entry type', 'duplicate-entry-type', 'entryTypes')
	unique(outcomes, 'outcome', 'duplicate-outcome', 'outcomes')
	attributes.forEach((a, i) => out.push(...rulesetAttributeFindings(a, `${id}.attributes[${i}]`, modules)))
	entryTypes.forEach((e, i) => out.push(...rulesetEntryTypeFindings(e, `${id}.entryTypes[${i}]`, modules)))
	outcomes.forEach((o, i) => out.push(...rulesetOutcomeFindings(o, `${id}.outcomes[${i}]`)))
	// Zone types and events a function adds count as the ruleset's own.
	const added = functions.flatMap((f) => resolveFunctionRef(f).decl?.adds ?? [])
	const zoneIds = unique([...zoneTypes, ...added.flatMap((a) => a.zoneTypes ?? [])], 'zone type', 'duplicate-zone-type', 'zoneTypes')
	for (const a of added.flatMap((x) => x.attributes ?? [])) if (typeof a?.id === 'string') attrIds.add(a.id)
	const zctx = { entryTypes: etIds, attributes: attrIds, modules }
	zoneTypes.forEach((z, i) => out.push(...zoneTypeFindings(z, `${id}.zoneTypes[${i}]`, zctx)))
	// 🚧 A one-sided tie is the world's: a zone type the world owns must hold it (★6, 2026-10-23).
	out.push(...unheldTieFindings(entryTypes, [...zoneTypes, ...added.flatMap((a) => a.zoneTypes ?? [])], `${id}.entryTypes`))
	const entryFields = new Set(entryFieldSelectors(entryTypes))
	// 🚧 What a function binding's kinds are judged against (RF fix 6): each attribute's kinds, each entry field's type.
	const attributeKinds = new Map<string, readonly RulesetAttributeKind[]>()
	for (const a of [...attributes, ...added.flatMap((x) => x.attributes ?? [])]) {
		const ks = typeof a?.id === 'string' ? rulesetAttributeKinds(a) : undefined
		if (ks) attributeKinds.set(a.id, ks)
	}
	const entryFieldTypes = new Map<string, string>()
	for (const e of entryTypes)
		if (typeof e?.id === 'string')
			for (const [k, f] of Object.entries(e.fields ?? {})) if (typeof (f as FieldDecl)?.type === 'string') entryFieldTypes.set(`${e.id}.${k}`, (f as FieldDecl).type)
	const events = new Set(added.flatMap((a) => (a.events ?? []).map((e) => e?.id)).filter((x): x is string => typeof x === 'string'))
	const keys = new Set<string>()
	// 🚧 Every use's key, before any is judged (RF fix 8): what an option role naming a function may name.
	const functionKeys = new Set(functions.map((f) => { try { return functionRefKey(f) } catch { return '' } }).filter(Boolean))
	functions.forEach((f, i) => {
		const at = `${id}.functions[${i}]`
		const key = functionRefKey(f)
		if (!FUNCTION_KEY.test(key)) out.push(finding('bad-function-key', `${at}.key is '${key}'. A key is lowercase words joined by '-', dotted for a family — 'd20', 'skill.stealth'.`))
		else if (keys.has(key)) out.push(finding('duplicate-function-key', `${at}: '${key}' names two of ${id}'s functions. Give each use a key of its own.`))
		else if (attrIds.has(key)) out.push(finding('name-taken', `${at}: '${key}' is an attribute's id. Name the function's use otherwise.`))
		keys.add(key)
		if (f?.module !== undefined && !isFunctionId(f.module?.id)) return void out.push(finding('bad-function-id', `${at}.module has no function id.`))
		out.push(...functionRefFindings(f, at, { attributes: attrIds, attributeKinds, entryTypes: etIds, entryFields, entryFieldTypes, zoneTypes: zoneIds, modules, events, functionKeys }))
	})
	if (d.time !== undefined) out.push(...timeSectionFindings(id, d.time as RulesetTimeSection))
	if (d.library !== undefined) out.push(...libraryFindings(id, d.library as RulesetLibrary, entryTypes, (d.time as RulesetTimeSection | undefined)?.unit))
	if (d.options !== undefined) out.push(...optionsFindings(id, d.options as RulesetOptions))
	// ⏳ Piece rules an entry type carries, against the names the sections give.
	const withRules = entryTypes.filter((e) => Array.isArray(e?.mechanics) && e.mechanics.length)
	if (withRules.length) {
		const ctx = sectionsRepertoireContext(id, { attributes, functions, entryTypes, time: d.time as RulesetTimeSection | undefined })
		for (const e of withRules) out.push(..._repertoireMechanicFindings(_entryTypeAsRepertoire(e), ctx, `${id}.entryTypes.${e.id}`))
	}
	return out
}

/**
 * 🚧 The context ⏳ piece rules are checked in, from the sections: the
 * names they may target (attributes, and the keys of worked-out values,
 * tallies and checks), the families the dotted keys and `within`s make,
 * the attributes the ruleset owns, its entry types as repertoires, its time
 * unit, whether it throws dice.
 * @internal
 */
export function sectionsRepertoireContext(id: string, s: RulesetSections): RepertoireContext {
	const selectors = new Set<string>((s.attributes ?? []).map((a) => a.id))
	const families = new Set<string>()
	let rollsDice = false
	for (const f of s.functions ?? []) {
		const key = functionRefKey(f)
		const kind = checkMethodKindOfFunction(f?.ref)
		if (kind && checkMethodKind(kind)?.rollsDice) rollsDice = true
		// A check, a worked-out value, a tally — and a way to decide, which is a check by its own name.
		if (kind || f?.ref === CORE_FUNCTION_IDS.check || f?.ref === CORE_FUNCTION_IDS.workedOut || f?.ref === CORE_FUNCTION_IDS.tally) {
			selectors.add(key)
			const parts = key.split('.')
			for (let i = parts.length - 1; i > 0; i--) families.add(parts.slice(0, i).join('.'))
			const within = (f.options as { within?: unknown } | undefined)?.within
			if (typeof within === 'string') families.add(within)
		}
	}
	for (const name of selectors) families.delete(name)
	return {
		ruleset: id,
		selectors,
		families,
		// Every attribute it lists is its own to `set`, borrowed or not (as every stat it listed was).
		ownStats: new Set((s.attributes ?? []).map((a) => a.id)),
		repertoires: new Map((s.entryTypes ?? []).map((e) => [e.id, _entryTypeAsRepertoire(e)])),
		timeUnit: s.time?.unit,
		rollsDice,
	}
}

function timeSectionFindings(id: string, t: RulesetTimeSection): string[] {
	const at = `${id}.time`
	if (!t || typeof t !== 'object') return [finding('bad-time-unit', `${at} is { unit, roundSeconds?, turns?, rests? }.`)]
	const out: string[] = []
	if (!(RULESET_TIME_UNITS as readonly unknown[]).includes(t.unit)) out.push(finding('bad-time-unit', `${at}.unit is '${String(t.unit)}'. Say one of ${RULESET_TIME_UNITS.join(', ')}.`))
	if (t.roundSeconds !== undefined && (t.unit !== 'round' || !(typeof t.roundSeconds === 'number' && t.roundSeconds > 0)))
		out.push(finding('bad-time-unit', `${at}.roundSeconds is said only with unit 'round', as a positive number of seconds.`))
	if (t.turns?.perTurn !== undefined && !(Number.isInteger(t.turns.perTurn) && t.turns.perTurn >= 1))
		out.push(finding('bad-actions', `${at}.turns.perTurn is ${String(t.turns.perTurn)}. A whole number of at least 1.`))
	const rests = new Set<string>()
	;(t.rests ?? []).forEach((r, i) => {
		if (typeof r?.id !== 'string' || !r.id || rests.has(r.id)) out.push(finding('bad-rest', `${at}.rests[${i}] needs an id of its own.`))
		else rests.add(r.id)
		out.push(...display(r?.label, `${at}.rests[${i}].label`, true))
		if (r?.minutes !== undefined && !(typeof r.minutes === 'number' && r.minutes >= 0)) out.push(finding('bad-rest', `${at}.rests[${i}].minutes is a number of minutes, zero or more.`))
	})
	return out
}

function libraryFindings(id: string, lib: RulesetLibrary, entryTypes: readonly RulesetEntryTypeDecl[], timeUnit?: string): string[] {
	if (!lib || typeof lib !== 'object' || !lib.rows || typeof lib.rows !== 'object') return [finding('bad-section', `${id}.library is { source?, rows: { <entry type>: [rows] } }.`)]
	const out: string[] = []
	const types = new Map(entryTypes.map((e) => [e.id, e]))
	for (const [etId, rows] of Object.entries(lib.rows)) {
		const e = types.get(etId)
		if (!e) {
			out.push(finding('unknown-entry-type', `${id}.library has rows for '${etId}', which is none of ${id}'s entry types.`))
			continue
		}
		const rep = _entryTypeAsRepertoire(e)
		const ids = new Set<string>()
		;(Array.isArray(rows) ? rows : []).forEach((row: CompendiumRow, i: number) => {
			const at = `${id}.library.${etId}[${i}]`
			const { id: rowId, version, source, lang, piece, ...extra } = row ?? ({} as CompendiumRow)
			if (Object.keys(extra).length) out.push(finding('bad-row', `${at} says ${Object.keys(extra).map((k) => `'${k}'`).join(', ')} beside its bookkeeping. A row is { id, version, source?, lang?, piece: { … } }.`))
			if (typeof rowId !== 'string' || !PART_ID.test(rowId)) out.push(finding('bad-row', `${at}.id is '${String(rowId)}'. A row id is lowercase words joined by '-'.`))
			else if (ids.has(rowId)) out.push(finding('duplicate-row', `${at} repeats the row id '${rowId}'.`))
			else ids.add(rowId)
			if (typeof version !== 'string' || !version) out.push(finding('bad-row', `${at} has no version. Rows are pinned by version; say one.`))
			const src = source ?? lib.source
			if (!src || typeof src.document !== 'string' || !src.document || typeof src.licence !== 'string' || !src.licence)
				out.push(finding('missing-source', `${at} names no source { document, licence }, and the library has none.`))
			if (lang !== undefined && (typeof lang !== 'string' || !lang)) out.push(finding('bad-row', `${at}.lang is a language tag.`))
			if (!piece || typeof piece !== 'object' || Array.isArray(piece)) return void out.push(finding('bad-row', `${at} has no piece — the row's fields.`))
			const held = e.relational && (piece as { towards?: unknown }).towards === undefined ? { ...piece, towards: 'said-when-held' } : piece
			const why = checkPiece(rep, { kind: 'inline', ...held } as never, { timeUnit })
			if (why) out.push(finding('bad-row', `${at} is not a '${etId}' entry: ${why}`))
		})
	}
	return out
}

function optionsFindings(id: string, o: RulesetOptions): string[] {
	const at = `${id}.options`
	if (!o || typeof o !== 'object' || Array.isArray(o)) return [finding('bad-section', `${at} is { fields?, lays?, presets?, conversions? }.`)]
	const out: string[] = []
	for (const k of Object.keys(o)) if (!['fields', 'lays', 'presets', 'conversions'].includes(k)) out.push(finding('bad-section', `${at} says '${k}'. Options are fields, lays, presets and conversions.`))
	const fields = o.fields ?? {}
	if (o.fields !== undefined) {
		const s = settingsSchemaFindings(o.fields, `${at}.fields`)
		if (s.length) out.push(...s.map((f) => finding('bad-setting', f)))
		else {
			for (const f of checkSchema(o.fields).filter((x) => x.severity === 'error'))
				out.push(finding('bad-setting', `${at}.fields${f.field ? `.${f.field}` : ''}: ${f.message} — ${f.fix}`))
			out.push(...exposureFindings(o.fields, `${at}.fields`).map((f) => finding('bad-setting', f)))
		}
	}
	const settings = sectionsSettings(o) ?? {}
	for (const [name, choices] of Object.entries(o.lays ?? {})) {
		const s = settings[name]
		if (!s) {
			out.push(finding('bad-setting', `${at}.lays.${name}: no choice field '${name}' (an enum among the fields) lays anything.`))
			continue
		}
		for (const [choice, lays] of Object.entries(choices ?? {})) {
			if (!s.choices.some((c) => c.id === choice)) out.push(finding('bad-setting', `${at}.lays.${name}.${choice} is none of '${name}''s choices.`))
			if (lays?.conventions !== undefined && (!lays.conventions || typeof lays.conventions !== 'object' || 'time' in lays.conventions))
				out.push(finding('bad-setting', `${at}.lays.${name}.${choice}.conventions lays conventions over the ruleset's — never time.`))
		}
	}
	const presets = new Set<string>()
	;(o.presets ?? []).forEach((p, i) => {
		const pat = `${at}.presets[${i}]`
		if (typeof p?.id !== 'string' || !PART_ID.test(p.id) || presets.has(p.id)) out.push(finding('bad-preset', `${pat} needs an id of its own, in lowercase words joined by '-'.`))
		else presets.add(p.id)
		out.push(...display(p?.label, `${pat}.label`, true), ...display(p?.description, `${pat}.description`))
		for (const [k, v] of Object.entries(p?.values ?? {})) {
			const f = (fields as SettingsSchema)[k]
			if (!f) out.push(finding('bad-preset', `${pat}.values.${k}: ${id} declares no option '${k}'.`))
			else if (settings[k] && !settings[k]!.choices.some((c) => c.id === v)) out.push(finding('bad-preset', `${pat}.values.${k} is '${String(v)}', which is not one of its choices.`))
		}
	})
	;(o.conversions ?? []).forEach((c, i) => out.push(...conversionFindings(c, { ruleset: id }, `${at}.conversions[${i}]`)))
	return out
}
