/**
 * 🚧 **What a genre reads of the session's ruleset** (lane G3, 2026-10-23;
 * PLAN-genres-seams S4) — read at run time, through the inlet, never from a
 * ruleset the build holds (Lair rewrite D9: rolls and what exists follow the
 * ruleset, never the genre; ★H: the Dungeon Crawler reads the session's
 * ruleset, not Vis Itineris).
 *
 * The **ruleset gist** (`rulesetGistOf`, `RulesetGist`) is that reading:
 * whether the ruleset decides anything by its rules, its rests, its fall
 * rule (`core:function/at-zero-health@1`'s reference) and whether its saves
 * play under the session's options, whether it references experience
 * levels, the keys a check may be asked by, a casting pool, its kits (the
 * library rows of its class entry type, `kits.ts`), its way out (the entry
 * type tagged `exit`) and its conditions. The host lays it on every inlet's
 * `ruleset` beside the id, rigour, settings, what it rolls (`rulesetRolls`)
 * and its attributes and entry types (`rulesetInletSections`, S1/S3) —
 * `sessionRulesetInput`; a script reads it there. ⚠ No key of its shares a
 * name with theirs. Plain JSON, nothing
 * opinionated: a ruleset that says nothing reads as nothing — no die, no
 * rest, no kit — and the crawl tells that part in words.
 *
 * What stays the genre's is its dial: how hard the world pushes back
 * (`core:slot/difficulty@1`) moves the fall rule's door a step
 * (`DUNGEON_CRAWLER_DIFFICULTY_STEPS`).
 *
 * The words for the numbers (`countInWords`; in the scripts' preamble
 * `DUNGEON_CRAWLER_RULES_WORDS_JS`) are the genre's; the numbers never are.
 */

import {
	CORE_FUNCTION_IDS,
	functionRefDecides,
	functionRefKey,
	functionWayKeys,
	getFunction,
	getRepertoire,
	i18nText,
	jsonSchemaOf,
	normaliseRuleset,
	rulesetDecides,
	rulesetSections,
	type FunctionRef,
	type JsonSchema,
} from '@serene-pub/sdk'
import { AT_ZERO_HEALTH_FUNCTION_ID, type AtZeroHealthOptions } from '../../functions/atZeroHealth.js'
import { restFunction } from '../../functions/time.js'
import { experienceLevelsFunction } from '../../functions/progression.js'
import { kitsOf, type DungeonCrawlerKits } from './kits.js'
import { rowName } from './sheet.js'

/** A small count in words — 3 is "three" — else its digits. @internal */
export function countInWords(n: number): string {
	const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
	return Number.isInteger(n) && n >= 0 && n < words.length ? words[n]! : String(n)
}

/**
 * 🚧 How the genre's difficulty moves the ruleset's door, in its steps: a
 * gentle world one step easier, a brutal one a step harder. The genre's own
 * dial — the door, its step and the die are the ruleset's. @experimental
 */
export const DUNGEON_CRAWLER_DIFFICULTY_STEPS = Object.freeze({ gentle: -1, fair: 0, brutal: 1 } as const)

/**
 * 🚧 **The ruleset gist** — what a genre reads of the session's ruleset at
 * run time, on the inlet's `ruleset` (lane G3, 2026-10-23, S4). Each member
 * is read from the ruleset's sections, never assumed: absent, empty or null
 * where the ruleset says nothing.
 * @experimental
 */
export interface RulesetGist {
	/** Its name, in words (`i18nText`). */
	name: string
	/** Whether it decides anything by its rules (`rulesetDecides`): what counted play waits on. */
	decides: boolean
	/**
	 * 🚧 The ids of every attribute it declares, borrowed or its own (RF fix
	 * 8: attributes are the rules') — what a genre may name a change to.
	 */
	keeps: readonly string[]
	/** Its rests (`rulesetSections(r).time.rests`), longest first: `{ id, label, minutes }`. */
	rests: ReadonlyArray<{ id: string; label: string; minutes: number }>
	/**
	 * Its fall rule — the options of its reference to
	 * `core:function/at-zero-health@1` — and whether its death saves play
	 * under the session's options (`playsSaves`); null when it has none.
	 */
	atZeroHealth: (AtZeroHealthOptions & { readonly playsSaves: boolean }) | null
	/** Whether it references experience levels (`core:function/experience-levels@1`, or a fork of it). */
	levels: boolean
	/**
	 * The keys a check may be asked by (S1: "checks are asked by the
	 * ruleset's function keys, deciding kind"): its checks' keys, else —
	 * a ruleset whose checks are its ways — the keys of the ways that decide.
	 */
	decidingKeys: readonly string[]
	/** A casting pool its conventions lay under the session's options: the attribute spent, its slot, its declared ceiling. */
	casting: { readonly pool: string; readonly slot: string; readonly ceiling: number | null } | null
	/** Its kits: the library rows of its class entry type (`kitsOf`); null with none. */
	kits: DungeonCrawlerKits | null
	/** Its way out: the entry type tagged `exit` and its fields as a model writes them (`jsonSchemaOf`); null with none. */
	exits: { readonly entryType: string; readonly fields: Readonly<Record<string, JsonSchema>> } | null
	/**
	 * Its conditions: the entry type tagged `condition`, and its library rows
	 * as the table says them — each `{ name, lasts, gloss }` by row id and by
	 * name in lower case (`lasts` "1 hour", or empty for one that lasts until
	 * removed; `gloss` its description up to its rule). Null with none.
	 */
	conditions: { readonly entryType: string; readonly names: readonly string[]; readonly rows: Readonly<Record<string, { name: string; lasts: string; gloss: string }>> } | null
}

/**
 * 🚧 A ruleset's conditions as the table says them (`RulesetGist.conditions`):
 * the rows of its entry type tagged `condition` — each one's name, how long
 * it lasts in words, and its gloss at a table of words (PLAN-dc-after-walk2
 * Q2-3: "Sick and shaky", never its rule). Null with none.
 * @experimental
 */
export function conditionsOf(s: ReturnType<typeof rulesetSections>): RulesetGist['conditions'] {
	const type = (s.entryTypes ?? []).find((e) => (e.tags ?? []).includes('condition'))
	const rows = type ? ((s.library?.rows ?? {})[type.id] ?? []) : []
	if (!type) return null
	const out: Record<string, { name: string; lasts: string; gloss: string }> = {}
	const names: string[] = []
	for (const r of rows as readonly any[]) {
		const d = r.piece?.duration ?? r.duration ?? {}
		const n = Number(d.value)
		const units = String(d.units ?? '')
		const lasts = n > 0 && units && units !== 'until-removed' ? `${n} ${units}${n === 1 ? '' : 's'}` : ''
		const said = String(r.piece?.description ?? r.description ?? '').split(':')[0]!.trim().replace(/[.]$/, '')
		const row = { name: rowName(r), lasts, gloss: said ? `${said}.` : '' }
		names.push(row.name)
		out[String(r.id)] = row
		out[row.name.toLowerCase()] = row
	}
	return Object.freeze({ entryType: type.id, names: Object.freeze(names), rows: Object.freeze(out) })
}

/** A function reference of `id`, or of a module forked from it. */
const refersTo = (ref: FunctionRef, id: string): boolean =>
	ref.ref === id || ref.module?.forkedFrom === id || (typeof ref.ref === 'string' && getFunction(ref.ref as never)?.forkedFrom === id)

/**
 * 🚧 **The ruleset gist of a declaration** (`RulesetGist`) under the session's
 * option values: pure, cheap, read once per inlet. A declaration in any
 * shape (`rulesetSections` reads the shape before the sections too).
 * @experimental
 */
export function rulesetGistOf(decl: { id: string } & object, settings: Readonly<Record<string, string>> = {}): RulesetGist {
	const s = rulesetSections(decl)
	const functions = s.functions ?? []
	const rests = [...(s.time?.rests ?? [])]
		.map((r) => ({ id: r.id, label: i18nText(r.label) ?? r.id, minutes: typeof r.minutes === 'number' ? r.minutes : 0 }))
		.sort((a, b) => b.minutes - a.minutes)
	const fall = functions.find((f) => refersTo(f, AT_ZERO_HEALTH_FUNCTION_ID))
	const fallOptions = fall?.options as AtZeroHealthOptions | undefined
	const savesWhen = fallOptions?.savesWhen
	const atZeroHealth =
		fallOptions && typeof fallOptions.sides === 'number' && fallOptions.door
			? Object.freeze({
					...fallOptions,
					playsSaves: !!fallOptions.saves && !!savesWhen && settings[savesWhen.option] === savesWhen.is,
				})
			: null
	const checks = functions.filter((f) => f.ref === CORE_FUNCTION_IDS.check).map((f) => functionRefKey(f))
	const ways = functionWayKeys(functions)
	const decidingKeys = checks.length ? checks : functions.filter((f) => functionRefDecides(f, ways)).map((f) => functionRefKey(f))
	const slotOf = (id: string): string => (s.attributes ?? []).find((a) => a.id === id)?.slot ?? id
	let casting: RulesetGist['casting'] = null
	try {
		const pool = (normaliseRuleset(decl as never, settings) as { conventions?: { casting?: { pool?: unknown } } }).conventions?.casting?.pool
		if (typeof pool === 'string' && pool) {
			const attr = (s.attributes ?? []).find((a) => a.id === pool)
			const ceiling = attr?.bounds?.max ?? (attr?.config as { max?: unknown } | undefined)?.max
			casting = Object.freeze({ pool, slot: slotOf(pool), ceiling: typeof ceiling === 'number' ? ceiling : null })
		}
	} catch {
		casting = null
	}
	const exitType = (s.entryTypes ?? []).find((e) => (e.tags ?? []).includes('exit'))
	const exitRep = exitType ? getRepertoire(`${decl.id}#${exitType.id}`) : undefined
	const exits = exitType && exitRep ? Object.freeze({ entryType: exitType.id, fields: (jsonSchemaOf(exitRep).properties ?? {}) as Record<string, JsonSchema> }) : null
	return Object.freeze({
		name: i18nText((decl as { name?: unknown }).name as never) ?? '',
		decides: rulesetDecides(decl),
		keeps: Object.freeze((s.attributes ?? []).map((a) => a.id)),
		rests: Object.freeze(rests),
		atZeroHealth,
		levels: functions.some((f) => refersTo(f, experienceLevelsFunction.id)),
		decidingKeys: Object.freeze([...new Set(decidingKeys)]),
		casting,
		kits: kitsOf({ id: decl.id, ...s }),
		exits,
		conditions: conditionsOf(s),
	})
}

/** 🚧 Whether a ruleset offers a rest a person may take — its reference to `core:function/rest@1` (the rules action Rest, S3). @experimental */
export const rulesetOffersRest = (decl: unknown): boolean => (rulesetSections(decl).functions ?? []).some((f) => refersTo(f, restFunction.id))

/**
 * 🚧 The words for a gist's numbers, in ES5, for the preamble: `inWords(n)`
 * ("three"), `countedWords(n, one, many)` ("one failure"), and over the session's
 * ruleset as the inlet carries it (`v.ruleset`, a `RulesetGist`):
 *
 *  - `nightRest(rs)` — a night's rest: its longest rest `{ id, label,
 *    minutes }`, else null (a ruleset that keeps no rests: the night is told
 *    in words, its length unsaid);
 *  - `restWords(minutes)` — "<n> hours", else "<n> minutes";
 *  - `fallOf(rs)` — its fall rule (`RulesetGist.atZeroHealth`), else null;
 *  - `deathSavesRule(fall, passesFirst)` — "<n> failures and they die, <n>
 *    passes and they are stable", in words (the passes first for the
 *    table's line).
 * @internal
 */
export const DUNGEON_CRAWLER_RULES_WORDS_JS = `
var IN_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function inWords(n) { return typeof n === "number" && n >= 0 && n < IN_WORDS.length && Math.floor(n) === n ? IN_WORDS[n] : String(n); }
function countedWords(n, one0, many) { return inWords(n) + " " + (n === 1 ? one0 : many); }
function nightRest(rs) {
	var rests = Array.isArray(own(rs).rests) ? own(rs).rests : [];
	return rests.length && num(own(rests[0]).minutes, 0) > 0 ? own(rests[0]) : null;
}
function restWords(minutes) { return minutes % 60 === 0 ? countedWords(minutes / 60, "hour", "hours") : countedWords(minutes, "minute", "minutes"); }
function fallOf(rs) { var f = own(rs).atZeroHealth; return f && typeof f === "object" && f.door && num(f.sides, 0) > 1 ? f : null; }
function deathSavesRule(fall, passesFirst) {
	var sv = own(own(fall).saves);
	var fails = countedWords(num(sv.failures, 0), "failure", "failures") + " and they die", passes = countedWords(num(sv.passes, 0), "pass", "passes") + " and they are stable";
	return passesFirst ? passes + ", " + fails : fails + ", " + passes;
}
`
