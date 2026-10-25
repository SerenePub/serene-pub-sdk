/**
 * 🚧 The Lair's shared names (rewrite, 2026-10-21): who speaks, the shapes
 * its model calls answer in — each a declared shape read through
 * `jsonSchemaOf` (D1), never a hand-written schema beside a declaration — and
 * what the session's rules decide, read off any ruleset's sections for the
 * inlet the genre's scripts read (`lairRulesRow`, S4 2026-10-23).
 */

import {
	CORE_FUNCTION_IDS,
	checkMethodKindOfFunction,
	declaresSections,
	functionRefDecides,
	functionRefKey,
	functionWayKeys,
	jsonSchemaOf,
	rulesetSections,
	i18nText,
	type DifficultyBand,
	type FormBlock,
	type FunctionRef,
	type RollBlockBand,
	type RollBlockCheck,
	type SessionOf,
	type SettingsSchema,
} from '@serene-pub/sdk'
import { LAIR_CASTELLAN_KEY, LAIR_ORACLE_KEY, lairGenre } from '../../registry/genres.js'
import { locationEntryType } from '../../registry/entries.js'

/** The Castellan, as a participant reference — the name every row it writes carries. @internal */
export const CASTELLAN = `envoy:${LAIR_CASTELLAN_KEY}` as const

/** 🚧 The Oracle, as a participant reference — the mechanics' speaker (D4). @internal */
export const ORACLE = `envoy:${LAIR_ORACLE_KEY}` as const

/** The session's fields as the Lair's junctions read them — keyed as the genre declares them. @internal */
export type LairFields = SessionOf<typeof lairGenre>['fields']

/**
 * 🚧 **The plan** the Castellan answers with (D1): declared once in the one
 * field language, asked for through `jsonSchemaOf` — what the beats row
 * lists, who takes a character turn (`speakers`, the facts the host's turn
 * plan resolves), which attempts are **risky** (`risks`, what the ruleset
 * may be asked to roll), and the knock (`unknownExit`, `knockQuestion`).
 * `beats` stay plain lines and `worldHints.location` a name: the host's
 * scene variables read them so (`{{beats}}`, `{{location}}`'s fallback).
 * @experimental
 */
export const LAIR_PLAN_SHAPE: SettingsSchema = {
	beats: {
		type: 'string[]',
		description: { en: 'One short sentence per thing the party do this turn, in order. Four at most.' },
	},
	speakers: {
		type: 'list',
		max: 6,
		description: { en: 'Who of the party speaks or acts this turn, in order — the first goes first. Empty only when nobody in the party would react at all; a party of one is named unless they are unconscious or gone.' },
		item: {
			type: 'object',
			fields: {
				name: { type: 'string', description: { en: 'The delver, by the name the conversation uses.' } },
				intent: { type: 'string', description: { en: 'What they are trying to do, in a few words.' } },
			},
		},
	},
	risks: {
		type: 'list',
		max: 4,
		description: {
			en: 'Each attempt this turn that could fail and that the rules should decide. Empty when nothing is risky — most turns, and always at a table that rolls nothing.',
		},
		item: {
			type: 'object',
			fields: {
				who: { type: 'string', description: { en: 'Who attempts it, by name.' } },
				attempt: { type: 'string', description: { en: 'What they attempt, in a few words: “pick the lock”.' } },
				check: { type: 'string', description: { en: "The check the rules roll for it, by its key from the table's list." } },
				difficulty: { type: 'string', description: { en: 'How hard it is, by the name of one of the difficulties listed.' } },
			},
		},
	},
	unknownExit: {
		type: 'string',
		description: {
			en: 'The room the party are about to walk into that no entry describes. Empty on every turn they stay or move somewhere the dungeon holds.',
		},
	},
	knockQuestion: {
		type: 'string',
		description: { en: 'Only with unknownExit: the question put to the game master about it, naming the room. Empty otherwise.' },
	},
	worldHints: {
		type: 'object',
		fields: {
			location: { type: 'string', description: { en: 'Where this happens: the room the party are in.' } },
		},
	},
}

/** A shape as a form block — the declaration `jsonSchemaOf` reads a plain field record through. */
const formOf = (fields: SettingsSchema): FormBlock => ({ kind: 'form', fn: 'answer', fields })

/** 🚧 The plan's JSON Schema — `jsonSchemaOf(LAIR_PLAN_SHAPE)`, strict (every member required). @experimental */
export const LAIR_PLAN_SCHEMA = jsonSchemaOf(formOf(LAIR_PLAN_SHAPE))

/**
 * 🚧 **A room draft** (D1, D2, D10): the room's body in words, its ways out,
 * and — under `fields` — exactly the typed fields the place entry type
 * declares (`jsonSchemaOf(locationEntryType)`, its priority left out: a
 * model never ranks an entry), which `create-lore-entry@1`'s `fields` port
 * takes and checks. The ways out that name a room the book holds become
 * links in the same commit (`core:script/lair-room`); the rest stay an
 * *Exits:* line in the body, for the knock and the host to answer.
 * @experimental
 */
export const LAIR_ROOM_DRAFT_SHAPE: SettingsSchema = {
	content: {
		type: 'text',
		description: {
			en: 'The room, as its lorebook entry reads: what it is and how it feels to stand in, then what is in it, what can hurt the careless, and who or what is here — a short line each.',
		},
	},
	exits: {
		type: 'list',
		max: 6,
		description: { en: 'Its ways out. Empty when it names none.' },
		item: {
			type: 'object',
			fields: {
				way: { type: 'string', description: { en: 'The way out, in a word or two: “north”, “the iron door”.' } },
				to: { type: 'string', description: { en: 'The room it leads to, by name — one the dungeon has, or a new one to be built.' } },
			},
		},
	},
}

/** 🚧 The room draft's JSON Schema: the shape above, with the place entry type's own fields under `fields`. @experimental */
export const LAIR_ROOM_DRAFT_SCHEMA = (() => {
	const draft = jsonSchemaOf(formOf(LAIR_ROOM_DRAFT_SHAPE)) as {
		properties: Record<string, unknown>
		required: string[]
	}
	const fields = jsonSchemaOf(locationEntryType, { omit: [locationEntryType.entryShape.roles?.priority ?? 'priority'] })
	return Object.freeze({
		...draft,
		properties: { ...draft.properties, fields },
		required: [...draft.required, 'fields'],
	})
})()

/**
 * What the scratchpad rewrite answers with (R13): the whole scratchpad,
 * rewritten — one string, for the grammar-compiling families.
 * @internal
 */
export const LAIR_SCRATCHPAD_SCHEMA = jsonSchemaOf(
	formOf({ scratchpad: { type: 'text', description: { en: 'The whole scratchpad, rewritten, as plain lines.' } } }),
)

/* ── What the session's rules decide ───────────────────────────────────── */

/**
 * 🚧 **The rules row** — what the session's ruleset decides, as the Lair's
 * scripts read it off the inlet's `ruleset` port (the host carries it beside
 * the id, rigour and settings; S4, 2026-10-23): the checks a roll form may
 * offer, the difficulties, the usual one, the ways it decides by and its
 * outcome words. No table is baked into a script: every ruleset — core's, a
 * plugin's, one made on the pub — is read the same way, at run time.
 * @experimental
 */
export interface LairRulesRow {
	/**
	 * ⏳ Whether a check may be put to a **roll form**: a way the ruleset
	 * decides by holds difficulty bands, and a check is decided by it. Named
	 * for dice; since 2026-10-22 any way with bands (a comparison against a
	 * target asks how hard, as a die does). Retires at RC1 for
	 * `checks.length > 0 && bands.length > 0`.
	 */
	dice: boolean
	/** The checks a roll form may offer, in the ruleset's order, each in its words. */
	checks: RollBlockCheck[]
	/** The difficulties a check is made against, easiest first, in the ruleset's words. */
	bands: RollBlockBand[]
	/** The usual difficulty's id — the one the ruleset marks `default` — or null. */
	band: string | null
	/** The kinds of the ways it decides by, distinct, in its order (`die-target`, `bid`, `none`, a package way's function id) — empty when it decides nothing. */
	methods: string[]
	/** Its outcome words, each with its step on the five when it says one — empty when it names none of its own. */
	outcomes: Array<{ id: string; label: string; five?: string }>
}

/** A label in the ruleset's own words, as English text; empty when it gives none. */
const words = (label: unknown): string => (label !== undefined && label !== null ? (i18nText(label as never) ?? '') : '')

/**
 * A key read as words when the ruleset gives a check none: its dotted parts
 * last first, hyphens as spaces (`attack.melee` → _Melee attack_,
 * `skill.sleight-of-hand` → _Sleight of hand skill_) — the rule the host's
 * explain lines follow, with no ruleset's vocabulary in it.
 */
const keyWords = (key: string): string => {
	const parts = key.split('.').filter(Boolean).map((p) => p.split('-').filter(Boolean).join(' '))
	const text = (parts.length > 1 ? [...parts.slice(1).reverse(), parts[0]!] : parts).join(' ') || key
	return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A way's difficulty bands, as its reference's options carry them. */
const bandsOf = (way: FunctionRef | undefined): DifficultyBand[] => {
	const b = (way?.options as { bands?: unknown } | undefined)?.bands
	return Array.isArray(b) ? (b as DifficultyBand[]) : []
}

/**
 * 🚧 **What a ruleset decides, as the Lair reads it** (S4, 2026-10-23) — read
 * off its sections (`rulesetSections(r).functions` and `outcomes`), never
 * retyped and never from a list of core's rulesets: the host calls it on the
 * session's declaration and carries the row on the inlet's `ruleset`.
 *
 *  - **Ways** — its deciding references that decide: one of core's (a die, a
 *    pool, cards, a comparison, a spend, or judged in words) or a module that
 *    decides (`functionRefDecides`). The default way is its first of core's,
 *    else its first (what the engine resolves a check by).
 *  - **Checks** — every `core:function/check@1` reference (decided by the way
 *    it names, else the default) and every way, a check by its own name. A
 *    roll form asks how hard, so only the checks decided by the way whose
 *    difficulties it offers are listed: the default way's when it holds any,
 *    else the first of core's ways that does (a package way's checks are
 *    told in words). A declaration in the shape before sections lists a way
 *    as a check only where it names one so (its own `selectors`).
 *  - **Words** — the ruleset's: a way's or a check's own `label` (a check
 *    reference's since GM 2026-10-23, G2 ★1), a check's declared label (the
 *    shape before sections), else its key read as words; a band's label;
 *    each outcome word.
 *
 * A ruleset that decides nothing reads as no checks, no bands, no ways.
 * @experimental
 */
export function lairRulesRow(decl: unknown): LairRulesRow {
	const s = rulesetSections(decl)
	const functions = s.functions ?? []
	const named = functionWayKeys(functions)
	const isCore = (f: FunctionRef) => checkMethodKindOfFunction(f.ref) !== undefined
	const ways = functions.filter((f) => f?.ref !== CORE_FUNCTION_IDS.check && (isCore(f) || functionRefDecides(f, named)))
	const wayByKey = new Map(ways.map((f) => [functionRefKey(f), f]))
	const defaultWay = ways.find(isCore) ?? ways[0]
	const bandWay = bandsOf(defaultWay).length && defaultWay && isCore(defaultWay) ? defaultWay : ways.find((f) => isCore(f) && bandsOf(f).length)
	const legacy = declaresSections(decl) ? undefined : ((decl as { selectors?: Record<string, { kind?: string; label?: unknown }> }).selectors ?? {})
	const checks: RollBlockCheck[] = []
	if (bandWay)
		for (const f of functions) {
			const key = functionRefKey(f)
			if (f?.ref === CORE_FUNCTION_IDS.check) {
				const way = (f.options as { way?: unknown } | undefined)?.way
				if ((typeof way === 'string' && way ? wayByKey.get(way) : defaultWay) !== bandWay) continue
				checks.push({ key, label: words((f.options as { label?: unknown } | undefined)?.label) || words(legacy?.[key]?.label) || keyWords(key) })
			} else if (f === bandWay && (!legacy || legacy[key]?.kind === 'check'))
				checks.push({ key, label: words((f.options as { label?: unknown } | undefined)?.label) || words(legacy?.[key]?.label) || keyWords(key) })
		}
	const bands: RollBlockBand[] = checks.length
		? bandsOf(bandWay).map((b) => ({ id: b.id, label: words(b.label) || b.id, ...(typeof b.target === 'number' ? { target: b.target } : {}) }))
		: []
	return {
		dice: checks.length > 0 && bands.length > 0,
		checks,
		bands,
		band: checks.length ? (bandsOf(bandWay).find((b) => b.default === true)?.id ?? null) : null,
		methods: [...new Set(ways.map((f) => checkMethodKindOfFunction(f.ref) ?? String(f.ref)))],
		outcomes: (s.outcomes ?? []).map((o) => ({ id: o.id, label: words(o.label) || o.id, ...(o.five !== undefined ? { five: o.five } : {}) })),
	}
}
