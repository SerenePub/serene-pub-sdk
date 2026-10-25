/**
 * 🚧 **Check methods** — how a ruleset decides a moment that could go
 * either way (PLAN-rulesets-authoring D1, ruling R1, 2026-10-22).
 *
 * Chance is pluggable, never an assumption of the declaration. A ruleset
 * names its check methods under `conventions.methods`, keyed by a name of
 * its own, with one of them the default (`conventions.defaultMethod`); a
 * check selector may name another (`{ kind: 'check', base: 'nerve', method:
 * 'risk' }`). A ruleset that names none decides nothing by chance: every
 * check is judged, as under `none`.
 *
 * The kinds core resolves (`CHECK_METHOD_KINDS`, each with its own options):
 *
 *  · `die-target` — one die plus a modifier against a target; the margin
 *    (total − target) reads through the ruleset's degrees, a natural face
 *    through `degrees.natural` / `naturalShift`. Takes difficulty bands.
 *  · `dice-pool` — a pool of dice, as many as a selector's value; each face
 *    at or above `successOn` is a success, and the count reads as a degree
 *    (`countToDegree`).
 *  · `card-draw` — cards drawn from a deck (`ranks` × `suits`); their ranks
 *    plus a modifier against a target, as a die-target reads. Takes bands.
 *  · `compare` — a value against another's (`opposedBy`) or a target, with
 *    no chance at all; the margin reads through the degrees. Takes bands.
 *  · `bid` — a spend from a resource (`resource`): what is spent buys the
 *    degree its cost table says (`costs`); nothing is rolled.
 *  · `none` — nothing resolves it: the game master (or the model) judges,
 *    and the outcome is told in the ruleset's own words.
 *
 * The kinds are **open**: a package's own is namespaced by its owner
 * (`acme:tarot`) and accepted with a warning — a host with no resolver for
 * it refuses its checks politely, in words (`rulesetWarnings`; the app's
 * engine, 2026-10-22: "this pub has no resolver for ‹kind›"). An un-namespaced kind
 * core does not know is refused, so a misspelt `die-traget` is never a
 * silent `none`.
 *
 * `conventions.dice` (⏳, the shape before 2026-10-22) is read as one
 * die-target method keyed `die` (`LEGACY_DIE_METHOD`), and a top-level
 * `difficultyBands` as that method's bands — `normaliseRuleset` folds both
 * in; stored documents keep their shape (and their hashes) until rewritten.
 *
 * ⚠ Always **check method** where the word could stand alone (R3): never a
 * bare _method_, which is every language's word for a function. Not a
 * **mechanic** (a piece's effect, `MechanicDecl`), not a **rigour** (how
 * much of a ruleset a session runs) and not a **degree** (how a resolved
 * check reads).
 * @experimental
 */

import type { I18n } from './i18n.js'
import { i18nFindings } from './i18n.js'
import { checkValues, type FieldDecl, type SettingsSchema } from './settings.js'
import { finding } from './repertoires.js'
import type { DifficultyBand } from './rulesets.js'

// ── The kinds ───────────────────────────────────────────────────────────────

/** 🚧 The check method kinds core resolves, in the order the editor offers them. @experimental */
export const CORE_CHECK_METHOD_KINDS = ['die-target', 'dice-pool', 'card-draw', 'compare', 'bid', 'none'] as const
/** 🚧 One of the check method kinds core resolves. @experimental */
export type CoreCheckMethodKind = (typeof CORE_CHECK_METHOD_KINDS)[number]
/**
 * 🚧 A check method kind: core's, or a package's own, namespaced by its
 * owner (`acme:tarot`) — open, never a closed list.
 * @experimental
 */
export type CheckMethodKind = CoreCheckMethodKind | `${string}:${string}`

/** What every check method may say beside its kind and options. */
interface CheckMethodBase {
	/** The words a person reads for it — _Roll a d20_. Display text. */
	label?: I18n
	description?: I18n
}

/**
 * 🚧 A step of a `dice-pool`'s count: from `from` successes on, a check
 * reads as the degree band `band` (one of the ruleset's degrees' ids). The
 * last step whose `from` the count reaches is the one.
 * @experimental
 */
export interface PoolCountStep {
	from: number
	band: string
}

/**
 * 🚧 A row of a `bid`'s cost table: spending `spend` or more buys the
 * degree band `band` (one of the ruleset's degrees' ids). The last row whose
 * `spend` the bid reaches is the one.
 * @experimental
 */
export interface BidCostRow {
	spend: number
	band: string
}

/**
 * 🚧 **die-target** — one die (`sides`) plus a modifier against a target.
 * `modifierOf` is the selector a check adds when it names no `base` of its
 * own; `bands`, the targets a check may be made against.
 * @experimental
 */
export interface DieTargetMethod extends CheckMethodBase {
	kind: 'die-target'
	sides: number
	modifierOf?: string
	bands?: readonly DifficultyBand[]
}

/**
 * 🚧 **dice-pool** — as many dice (`sides`) as a selector's value: a
 * check's `base`, else `poolOf`. Each face at or above `successOn` is a
 * success; the count reads as a degree through `countToDegree` — left out,
 * no success reads as the degrees' `fail` band and any as their `success`.
 * @experimental
 */
export interface DicePoolMethod extends CheckMethodBase {
	kind: 'dice-pool'
	sides: number
	poolOf?: string
	successOn: number
	countToDegree?: readonly PoolCountStep[]
}

/**
 * 🚧 **card-draw** — `draw` cards (default 1) from a deck of `ranks` ×
 * `suits` (default 4); their ranks plus a modifier (a check's `base`, else
 * `modifierOf`) against a target, read as a die-target's margin is. The deck
 * is shuffled anew each scene (`reshuffle: 'each-scene'`, the default) or
 * only when it runs out (`'when-empty'`).
 * @experimental
 */
export interface CardDrawMethod extends CheckMethodBase {
	kind: 'card-draw'
	ranks: number
	suits?: number
	draw?: number
	modifierOf?: string
	reshuffle?: 'each-scene' | 'when-empty'
	bands?: readonly DifficultyBand[]
}

/**
 * 🚧 **compare** — a value (a check's `base`, else `modifierOf`) against
 * another side's (`opposedBy`, a selector read on whoever the check is
 * aimed at) or, with no `opposedBy`, against a target. No chance: the
 * margin reads through the degrees.
 * @experimental
 */
export interface CompareMethod extends CheckMethodBase {
	kind: 'compare'
	modifierOf?: string
	opposedBy?: string
	bands?: readonly DifficultyBand[]
}

/**
 * 🚧 **bid** — a spend from `resource` (a stat): what is spent buys the
 * degree `costs` says. Nothing is rolled; a bid larger than what is held is
 * refused by the host.
 * @experimental
 */
export interface BidMethod extends CheckMethodBase {
	kind: 'bid'
	resource: string
	costs: readonly BidCostRow[]
}

/** 🚧 **none** — nothing resolves it: the game master or the model judges, in the ruleset's words. @experimental */
export interface NoneMethod extends CheckMethodBase {
	kind: 'none'
}

/**
 * 🚧 A package's own check method kind (`acme:tarot`), its options as the
 * package says them. Accepted with a warning (`rulesetWarnings`).
 * @experimental
 */
export interface PackageCheckMethod extends CheckMethodBase {
	kind: `${string}:${string}`
	bands?: readonly DifficultyBand[]
	[option: string]: unknown
}

/**
 * 🚧 One of a ruleset's check methods (`conventions.methods`): a kind and
 * that kind's own options (`CHECK_METHOD_KINDS[kind].options`).
 * @experimental
 */
export type CheckMethodDecl =
	| DieTargetMethod
	| DicePoolMethod
	| CardDrawMethod
	| CompareMethod
	| BidMethod
	| NoneMethod
	| PackageCheckMethod

/**
 * 🚧 What core knows about a check method kind: its words, whether chance
 * decides it (`chance`: dice or cards), whether it throws dice
 * (`rollsDice`: a dice-string amount needs one), whether a check under it is
 * made against a target (`takesBands`: the kinds that hold difficulty
 * bands), and its own **options** in the one field language — the editor's
 * form, and `jsonSchemaOf(CHECK_METHOD_KINDS[kind])`'s document.
 * @experimental
 */
export interface CheckMethodKindDecl {
	readonly methodKind: CoreCheckMethodKind
	readonly label: I18n
	readonly description: I18n
	readonly chance: boolean
	readonly rollsDice: boolean
	readonly takesBands: boolean
	readonly options: SettingsSchema
}

const selectorOption = (label: string, description: string, required = false): FieldDecl => ({
	type: 'string',
	label: { en: label },
	description: { en: description },
	...(required ? { required: true } : {}),
})

/** A degree band named by its id — what a pool step and a cost row read as. */
const bandOption: FieldDecl = {
	type: 'string',
	required: true,
	label: { en: 'Reads as' },
	description: { en: "One of the ruleset's degrees, by id." },
}

/**
 * 🚧 The check method kinds core resolves, by kind (see the module note).
 * @experimental
 */
export const CHECK_METHOD_KINDS: Readonly<Record<CoreCheckMethodKind, CheckMethodKindDecl>> = Object.freeze({
	'die-target': {
		methodKind: 'die-target',
		label: { en: 'One die against a target' },
		description: { en: 'Roll one die, add a modifier, and meet or beat a target. How far over or under says how well it went.' },
		chance: true,
		rollsDice: true,
		takesBands: true,
		options: {
			sides: { type: 'integer', min: 2, required: true, label: { en: 'Sides' }, description: { en: 'How many faces the die has — 20 for a d20.' } },
			modifierOf: selectorOption('Modifier', 'The stat or selector a check adds when it names none of its own.'),
		},
	},
	'dice-pool': {
		methodKind: 'dice-pool',
		label: { en: 'A pool of dice' },
		description: { en: 'Roll as many dice as a stat says and count the ones that come up high enough. More successes, a better outcome.' },
		chance: true,
		rollsDice: true,
		takesBands: false,
		options: {
			sides: { type: 'integer', min: 2, required: true, label: { en: 'Sides' }, description: { en: 'How many faces each die has — 6 for a d6.' } },
			poolOf: selectorOption('Pool', 'The stat or selector whose value is how many dice a check rolls, when it names none of its own.'),
			successOn: {
				type: 'integer',
				min: 1,
				required: true,
				label: { en: 'Success on' },
				description: { en: 'The lowest face that counts as a success — 5 on a d6 counts fives and sixes.' },
			},
			countToDegree: {
				type: 'list',
				label: { en: 'Successes to outcome' },
				description: { en: 'From how many successes each outcome starts, fewest first. Left out: none fails, any succeeds.' },
				item: {
					type: 'object',
					fields: {
						from: { type: 'integer', min: 0, required: true, label: { en: 'From' }, description: { en: 'Successes.' } },
						band: bandOption,
					},
				},
			},
		},
	},
	'card-draw': {
		methodKind: 'card-draw',
		label: { en: 'Draw cards' },
		description: { en: 'Draw from a shuffled deck and add a modifier against a target. The deck remembers what has been drawn.' },
		chance: true,
		rollsDice: false,
		takesBands: true,
		options: {
			ranks: { type: 'integer', min: 2, required: true, label: { en: 'Ranks' }, description: { en: 'How many ranks a suit has — 13 for a common deck.' } },
			suits: { type: 'integer', min: 1, default: 4, label: { en: 'Suits' }, description: { en: 'How many cards of each rank the deck holds.' } },
			draw: { type: 'integer', min: 1, default: 1, label: { en: 'Cards drawn' }, description: { en: 'How many cards a check draws; their ranks add up.' } },
			modifierOf: selectorOption('Modifier', 'The stat or selector a check adds when it names none of its own.'),
			reshuffle: {
				type: 'enum',
				of: ['each-scene', 'when-empty'],
				members: [
					{ key: 'each-scene', label: { en: 'Each scene' } },
					{ key: 'when-empty', label: { en: 'When it runs out' } },
				],
				default: 'each-scene',
				label: { en: 'Shuffle' },
			},
		},
	},
	compare: {
		methodKind: 'compare',
		label: { en: 'Compare, no chance' },
		description: { en: "Set one value against another's, or against a target. The higher wins; nothing is rolled." },
		chance: false,
		rollsDice: false,
		takesBands: true,
		options: {
			modifierOf: selectorOption('Value', 'The stat or selector compared, when a check names none of its own.'),
			opposedBy: selectorOption('Against', "The other side's stat or selector. Left out, a check is made against a target."),
		},
	},
	bid: {
		methodKind: 'bid',
		label: { en: 'Spend to succeed' },
		description: { en: 'Spend from a resource; what is spent buys the outcome. Nothing is rolled, and nobody spends what they do not have.' },
		chance: false,
		rollsDice: false,
		takesBands: false,
		options: {
			resource: selectorOption('Spends from', 'The stat a bid is spent from.', true),
			costs: {
				type: 'list',
				required: true,
				min: 1,
				label: { en: 'What a spend buys' },
				description: { en: 'From how much spent each outcome starts, least first.' },
				item: {
					type: 'object',
					fields: {
						spend: { type: 'integer', min: 0, required: true, label: { en: 'Spend' } },
						band: bandOption,
					},
				},
			},
		},
	},
	none: {
		methodKind: 'none',
		label: { en: 'The game master decides' },
		description: { en: "Nothing is rolled or spent: whoever runs the game judges how it goes, in the rules' own words." },
		chance: false,
		rollsDice: false,
		takesBands: false,
		options: {},
	},
} satisfies Record<CoreCheckMethodKind, CheckMethodKindDecl>)

/** 🚧 What core knows about a kind, or `undefined` for a package's own (or nothing at all). @experimental */
export const checkMethodKind = (kind: unknown): CheckMethodKindDecl | undefined =>
	typeof kind === 'string' && Object.prototype.hasOwnProperty.call(CHECK_METHOD_KINDS, kind)
		? CHECK_METHOD_KINDS[kind as CoreCheckMethodKind]
		: undefined

/** 🚧 Whether a kind is a package's own (`owner:name`). @experimental */
export const isPackageCheckMethodKind = (kind: unknown): kind is `${string}:${string}` =>
	typeof kind === 'string' && PACKAGE_KIND.test(kind)

/**
 * 🚧 The method every check falls back to when a ruleset names none: the
 * game master judges. @experimental
 */
export const NONE_CHECK_METHOD: NoneMethod = Object.freeze({ kind: 'none' as const })

/**
 * 🚧 The key `conventions.dice` (⏳) is read under — `methods.die`, the
 * key the data upgrade writes it to.
 * @experimental
 */
export const LEGACY_DIE_METHOD = 'die'

// ── Findings ────────────────────────────────────────────────────────────────

const METHOD_KEY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const PACKAGE_KIND = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/
const BAND_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Keys every method may say beside its own options. */
const SHARED_KEYS = new Set(['kind', 'label', 'description', 'bands'])

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * 🚧 A list of difficulty bands, each well-formed — a whole target, ids
 * distinct, exactly one the default. What a method's `bands` and the ⏳
 * top-level `difficultyBands` are both held to.
 * @internal
 */
export function difficultyBandListFindings(at: string, bands: unknown): string[] {
	if (!Array.isArray(bands) || !bands.length)
		return [finding('bad-difficulty', `${at} is a non-empty list of { id, label, target } — or leave it out.`)]
	const out: string[] = []
	const ids = new Set<string>()
	let defaults = 0
	bands.forEach((b: DifficultyBand, i) => {
		const where = `${at}[${i}]`
		if (!b || typeof b !== 'object') {
			out.push(finding('bad-difficulty', `${where} is { id, label, target, description?, default? }.`))
			return
		}
		if (typeof b.id !== 'string' || !BAND_ID.test(b.id))
			out.push(finding('bad-difficulty', `${where}.id is '${String(b.id)}'. Name it with lowercase words joined by '-' — 'very-hard'.`))
		else if (ids.has(b.id)) out.push(finding('duplicate-difficulty', `${at} declares '${b.id}' twice.`))
		else ids.add(b.id)
		out.push(...i18nFindings(b.label, `${where} label`, { required: true }).map((f) => finding('display-text', f)))
		out.push(...i18nFindings(b.description, `${where} description`).map((f) => finding('display-text', f)))
		if (!Number.isInteger(b.target))
			out.push(finding('bad-difficulty', `${where}.target is ${String(b.target)}. A target is a whole number a check's total must reach.`))
		if (b.default !== undefined && b.default !== true) out.push(finding('bad-difficulty', `${where}.default is true or left out.`))
		if (b.default === true) defaults++
	})
	if (defaults !== 1)
		out.push(finding('difficulty-default', `${at} marks ${defaults} bands default. Mark exactly one default: true — the difficulty an automatic roll is made against.`))
	return out
}

/** One method's options against its kind's schema: unknown keys, then the one value checker. */
function optionFindings(at: string, kind: CheckMethodKindDecl, m: Record<string, unknown>): string[] {
	const out: string[] = []
	const known = Object.keys(kind.options)
	for (const k of Object.keys(m))
		if (!SHARED_KEYS.has(k) && !known.includes(k))
			out.push(
				finding(
					'bad-method',
					`${at} says '${k}', which a ${kind.methodKind} method has no option for. It takes ${known.length ? known.join(', ') : 'no options'}.`,
				),
			)
	for (const [k, d] of Object.entries(kind.options)) {
		const v = m[k]
		if (d.type === 'list' && d.item?.type === 'object' && Array.isArray(v))
			v.forEach((row, i) => {
				if (!isRecord(row)) return
				for (const rk of Object.keys(row))
					if (!(rk in (d.item!.fields ?? {})))
						out.push(finding('bad-method', `${at}.${k}[${i}] says '${rk}'. A row is { ${Object.keys(d.item!.fields ?? {}).join(', ')} }.`))
			})
	}
	for (const f of checkValues(kind.options, m).filter((f) => f.severity === 'error'))
		out.push(finding('bad-method', `${at}: ${f.message}.`))
	return out
}

/** Steps (`from` / `spend`) rising, each naming one of the degrees. */
function stepFindings(at: string, steps: unknown, key: 'from' | 'spend', degreeIds: ReadonlySet<string>): string[] {
	if (!Array.isArray(steps)) return []
	const out: string[] = []
	let last = -Infinity
	steps.forEach((s, i) => {
		if (!isRecord(s)) return
		const n = s[key]
		if (typeof n === 'number' && Number.isInteger(n)) {
			if (n <= last) out.push(finding('bad-method', `${at}[${i}].${key} is ${n}. Each row starts above the one before it, lowest first.`))
			else last = n
		}
		if (typeof s.band === 'string' && !degreeIds.has(s.band))
			out.push(
				finding(
					'unknown-degree',
					`${at}[${i}].band names '${s.band}', which is none of the ruleset's degrees (${[...degreeIds].join(', ')}).`,
				),
			)
	})
	return out
}

/**
 * 🚧 Every reason a ruleset's check methods are refused: the methods
 * themselves (`bad-method`, `unknown-method-kind`, `unknown-selector`,
 * `unknown-degree`, `bands-without-target`, and every difficulty band
 * reason under a method's `bands`), `defaultMethod` (`unknown-method`,
 * `no-default-method`), and the ⏳ `dice` declared beside them
 * (`dice-beside-methods`). `selectors` are the ruleset's selector names;
 * `stats`, those that are stats (what a bid spends from); `degreeIds`, the
 * ids of the degrees in force (declared, else the default crosswalk's).
 * @internal
 */
export function checkMethodFindings(
	at: string,
	conventions: { methods?: unknown; defaultMethod?: unknown; dice?: unknown },
	ctx: { selectors: ReadonlySet<string>; stats: ReadonlySet<string>; degreeIds: ReadonlySet<string> },
): string[] {
	const out: string[] = []
	const methods = conventions?.methods
	const def = conventions?.defaultMethod
	if (methods === undefined) {
		if (def !== undefined && !(conventions?.dice !== undefined && def === LEGACY_DIE_METHOD))
			out.push(finding('unknown-method', `${at}.defaultMethod names '${String(def)}', and the ruleset declares no check methods (conventions.methods).`))
		return out
	}
	if (!isRecord(methods))
		return [finding('bad-method', `${at}.methods is a record of check methods by name — { d20: { kind: 'die-target', sides: 20 } }.`)]
	if (conventions.dice !== undefined)
		out.push(
			finding(
				'dice-beside-methods',
				`${at} declares dice beside its check methods. Dice is the old way to say one die-target method; say it under methods (${LEGACY_DIE_METHOD}: { kind: 'die-target', sides }) and drop dice.`,
			),
		)
	for (const [key, raw] of Object.entries(methods)) {
		const where = `${at}.methods.${key}`
		if (!METHOD_KEY.test(key)) out.push(finding('bad-method', `${where}: a check method is named in lowercase words joined by '-' — 'risk', 'd20'.`))
		if (!isRecord(raw)) {
			out.push(finding('bad-method', `${where} is { kind, …its options }.`))
			continue
		}
		out.push(...i18nFindings(raw.label, `${where}.label`).map((f) => finding('display-text', f)))
		out.push(...i18nFindings(raw.description, `${where}.description`).map((f) => finding('display-text', f)))
		const kind = checkMethodKind(raw.kind)
		if (!kind) {
			if (!isPackageCheckMethodKind(raw.kind))
				out.push(
					finding(
						'unknown-method-kind',
						`${where}.kind is '${String(raw.kind)}'. Say one of ${CORE_CHECK_METHOD_KINDS.join(', ')} — or a package's own kind, namespaced by its owner ('acme:tarot').`,
					),
				)
			else if (raw.bands !== undefined) out.push(...difficultyBandListFindings(`${where}.bands`, raw.bands))
			continue
		}
		out.push(...optionFindings(where, kind, raw))
		for (const k of ['modifierOf', 'poolOf', 'opposedBy', 'resource'] as const) {
			const v = raw[k]
			if (typeof v === 'string' && v && k in kind.options && !ctx.selectors.has(v))
				out.push(finding('unknown-selector', `${where}.${k} names '${v}', which no stat or selector of the ruleset is.`))
		}
		if (kind.methodKind === 'bid' && typeof raw.resource === 'string' && ctx.selectors.has(raw.resource) && !ctx.stats.has(raw.resource))
			out.push(finding('bad-method', `${where}.resource is '${raw.resource}', which is no stat. A bid spends from a stat a character holds.`))
		if (kind.methodKind === 'dice-pool') out.push(...stepFindings(`${where}.countToDegree`, raw.countToDegree, 'from', ctx.degreeIds))
		if (kind.methodKind === 'bid') out.push(...stepFindings(`${where}.costs`, raw.costs, 'spend', ctx.degreeIds))
		if (kind.methodKind === 'dice-pool' && typeof raw.sides === 'number' && typeof raw.successOn === 'number' && raw.successOn > raw.sides)
			out.push(finding('bad-method', `${where}.successOn is ${raw.successOn}, above the die's ${raw.sides} sides — nothing would ever succeed.`))
		if (raw.bands !== undefined) {
			if (!kind.takesBands)
				out.push(
					finding(
						'bands-without-target',
						`${where} declares difficulty bands, and a ${kind.methodKind} check is made against no target. Leave them out, or use a kind that takes them (${CORE_CHECK_METHOD_KINDS.filter((k) => CHECK_METHOD_KINDS[k].takesBands).join(', ')}).`,
					),
				)
			else out.push(...difficultyBandListFindings(`${where}.bands`, raw.bands))
		}
	}
	const keys = Object.keys(methods)
	if (def !== undefined) {
		if (typeof def !== 'string' || !keys.includes(def))
			out.push(finding('unknown-method', `${at}.defaultMethod names '${String(def)}', which is none of its check methods (${keys.join(', ') || 'none declared'}).`))
	} else if (keys.length > 1)
		out.push(finding('no-default-method', `${at} declares ${keys.length} check methods and no defaultMethod. Say which one a check uses when it names none.`))
	return out
}

