/**
 * 🚧 **Ruleset templates** — archetypes a ruleset of one's own starts from
 * (PLAN-rulesets-authoring D3, ruling R2, 2026-10-22): a d20-style one, a
 * dice pool, diceless pools. Each is a complete, small, working ruleset
 * marked `template: true`, with the words its card reads (`label`, `about`,
 * `goodFor`) and a **playtest scene** preloaded beside it — a sample party,
 * the situation in a sentence, and one change to put through the rules.
 *
 * A template is **copied, never played**: `defineRulesetTemplate` checks it
 * and keeps it in a registry of its own; `defineRuleset` refuses it
 * (`template-not-played`) and a genre may never name one
 * (`template-ruleset`), so it is never offered under Rules. Its slots are
 * declared like any ruleset's, owned by the template (`rulesetOwned`), so no
 * session's picker offers them; a copy (`reidRulesetDocument`) leaves
 * `template` behind and copies the slots under its own owner.
 *
 * Also here: the **ruleset laws** a shipped catalogue keeps
 * (`rulesetCatalogueFindings`) — what conformance requirement C38 holds a
 * host to.
 *
 * ⚠ Not a **context template** (§15), a **primer** (a lorebook's starting
 * bundle) or a **preset** (a named set of setting values) — always _ruleset
 * template_ where the word could stand alone (R3).
 * @experimental
 */

import type { I18n } from './i18n.js'
import { i18nFindings } from './i18n.js'
import type { SlotValue } from './attributes.js'
import { refuseUnlessIdentical } from './hash.js'
import { finding, RULESET_ID_PATTERN, RulesetError } from './repertoires.js'
import { checkMethodKind } from './checkMethods.js'
import {
	_releaseRulesetTemplateIds,
	_reserveRulesetTemplateId,
	_rulesetDeclOf,
	normaliseConventions,
	rulesetFindings,
	rulesetSelectors,
	type RulesetDecl,
	type RulesetId,
	type RulesetProps,
} from './rulesets.js'
import type { GenreDecl } from './genres.js'
import { entryTypeFields, rulesetAttributeSlots, rulesetSections } from './rulesetSections.js'
import { functionRefKey } from './functions.js'
import { tieFieldSelectors, tieSidesOf } from './ties.js'

// ── The playtest scene ──────────────────────────────────────────────────────

/**
 * 🚧 One of a playtest's sample party: a name, values by stat slot id (a
 * stat left out takes its default) and the compendium rows held, by
 * repertoire id. What the editor's _Playtest a scene_ seats.
 *
 * 🚧 `ties` (T1, 2026-10-23): the member's side of each tie, by the tie's
 * entry type, then the other member's name — that side's field values
 * (`{ bond: { Mara: { affection: 6 } } }`). Only an entry type with a far end
 * is a tie; a person-to-person one has a side for each of the two.
 * @experimental
 */
export interface PlaytestMember {
	name: string
	stats?: Readonly<Record<string, SlotValue>>
	pieces?: Readonly<Record<string, readonly string[]>>
	ties?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, SlotValue>>>>>>
}

/**
 * 🚧 The one change a playtest puts through the rules — a proposed change
 * as a turn makes one: who makes it (`owner`, a member's name), the op
 * (`hit` · `use` · `traverse` for a check; `add` · `spend` · `set` ·
 * `remove` otherwise), the check, repertoire, piece (a compendium row id),
 * slot and value it names, the number it is against and who it is aimed at
 * (a member's name). Under a `bid`, `value` is the spend; under `none`, the
 * degree it was judged.
 * @experimental
 */
export interface PlaytestChange {
	owner: string
	op: string
	check?: string
	repertoire?: string
	piece?: string
	slot?: string
	value?: SlotValue
	against?: number
	aimedAt?: string
	reason?: string
}

/**
 * 🚧 A **playtest scene** (2026-10-22): a sample party of two or three, the
 * situation in a sentence, and one change — enough to see a ruleset decide
 * something before anyone plays it.
 * @experimental
 */
export interface RulesetPlaytest {
	party: readonly PlaytestMember[]
	situation: I18n
	change: PlaytestChange
}

// ── The declaration ─────────────────────────────────────────────────────────

/** 🚧 What `defineRulesetTemplate` takes. @experimental */
export interface RulesetTemplateProps {
	/** The card's title — _d20-style_. Display text. */
	label: I18n
	/** One paragraph: how play goes under it. Display text. */
	about: I18n
	/** What it is good for, in a line. Display text. */
	goodFor: I18n
	/** The ruleset itself, `template: true`: complete and small, with sample rows. */
	ruleset: RulesetProps & { template: true }
	playtest: RulesetPlaytest
}

/** 🚧 A declared ruleset template. `id` is its ruleset's. @experimental */
export interface RulesetTemplate {
	readonly id: RulesetId
	readonly label: I18n
	readonly about: I18n
	readonly goodFor: I18n
	readonly ruleset: RulesetDecl
	readonly playtest: RulesetPlaytest
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * 🚧 Every reason a playtest scene is refused (`bad-playtest`): a party of
 * one to four with distinct names, each stat a stat of the ruleset, each
 * piece a row of its compendium; a situation; and a change by one of the
 * party, naming a check, repertoire, piece and target the ruleset has.
 * @experimental
 */
export function playtestFindings(id: string, ruleset: RulesetProps, playtest: unknown): string[] {
	const at = `${id}.playtest`
	if (!isRecord(playtest)) return [finding('bad-playtest', `${at} is { party, situation, change }.`)]
	const out: string[] = []
	const bad = (text: string) => out.push(finding('bad-playtest', `${at}${text}`))
	// 🚧 Read through the sections (2026-10-23): a stat is an attribute — by its
	// slot id or its own — a repertoire an entry type, the compendium the library.
	const sections = rulesetSections(ruleset)
	const slots = RULESET_ID_PATTERN.test(id) ? rulesetAttributeSlots({ id, attributes: sections.attributes }) : new Map<string, string>()
	const stats = new Set([...(ruleset.stats ?? []).map((s) => s.id), ...(sections.attributes ?? []).map((a) => a.id), ...slots.values()])
	const rows = (rep: string) => new Set((sections.library?.rows?.[rep] ?? []).map((r) => r.id))
	const reps = new Set((sections.entryTypes ?? []).map((e) => e.id))
	const party = Array.isArray(playtest.party) ? (playtest.party as unknown[]) : []
	if (party.length < 1 || party.length > 4) bad(`.party seats ${party.length}. A playtest seats one to four.`)
	const names = new Set<string>()
	party.forEach((m, i) => {
		if (!isRecord(m) || typeof m.name !== 'string' || !m.name.trim()) return void bad(`.party[${i}] is { name, stats?, pieces? }.`)
		if (names.has(m.name)) bad(`.party names '${m.name}' twice.`)
		names.add(m.name)
		for (const k of Object.keys(isRecord(m.stats) ? m.stats : {}))
			if (!stats.has(k)) bad(`.party[${i}].stats names '${k}', which is not one of the ruleset's stats.`)
		for (const [rep, ids] of Object.entries(isRecord(m.pieces) ? m.pieces : {})) {
			if (!reps.has(rep)) {
				bad(`.party[${i}].pieces names '${rep}', which the ruleset does not declare.`)
				continue
			}
			const have = rows(rep)
			for (const r of Array.isArray(ids) ? ids : []) if (!have.has(r)) bad(`.party[${i}].pieces.${rep} holds '${String(r)}', which is no row of its compendium.`)
		}
	})
	// 🚧 Each member's side of a tie (T1): a tie type of the ruleset, towards another member, its own fields.
	party.forEach((m, i) => {
		if (!isRecord(m) || !isRecord(m.ties)) return
		for (const [type, sides] of Object.entries(m.ties)) {
			const e = (sections.entryTypes ?? []).find((x) => x.id === type)
			if (!e || tieSidesOf(e) === undefined) {
				bad(`.party[${i}].ties names '${type}', which is no tie of the ruleset — an entry type that says its far end.`)
				continue
			}
			const fields = entryTypeFields(e)
			for (const [other, values] of Object.entries(isRecord(sides) ? sides : {})) {
				if (other === m.name || !names.has(other)) bad(`.party[${i}].ties.${type} is towards '${other}', who is no other member of the party.`)
				for (const k of Object.keys(isRecord(values) ? values : {}))
					if (!(k in fields) || k === 'towards' || k === 'edge') bad(`.party[${i}].ties.${type}.${other} names '${k}', which is none of its fields.`)
			}
		}
	})
	out.push(...i18nFindings(playtest.situation, `${at}.situation`, { required: true }).map((f) => finding('display-text', f)))
	const c = playtest.change
	if (!isRecord(c)) {
		bad(`.change is { owner, op, check?, repertoire?, piece?, slot?, value?, against?, aimedAt? }.`)
		return out
	}
	if (typeof c.owner !== 'string' || !names.has(c.owner)) bad(`.change is made by '${String(c.owner)}', who is not in the party.`)
	if (typeof c.op !== 'string' || !c.op) bad(`.change names no op — 'use', 'hit', 'add', 'spend'.`)
	if (c.aimedAt !== undefined && (typeof c.aimedAt !== 'string' || !names.has(c.aimedAt))) bad(`.change is aimed at '${String(c.aimedAt)}', who is not in the party.`)
	const checks = new Set([
		...rulesetSelectors({ stats: ruleset.stats ?? [], selectors: ruleset.selectors }).keys(),
		...(sections.attributes ?? []).map((a) => a.id),
		...(sections.functions ?? []).map(functionRefKey),
		...tieFieldSelectors(sections.entryTypes),
	])
	if (c.check !== undefined && !checks.has(String(c.check)))
		bad(`.change checks '${String(c.check)}', which is no selector of the ruleset.`)
	if (c.repertoire !== undefined && !reps.has(String(c.repertoire))) bad(`.change names the repertoire '${String(c.repertoire)}', which the ruleset does not declare.`)
	if (c.piece !== undefined && !(c.repertoire !== undefined && rows(String(c.repertoire)).has(String(c.piece))))
		bad(`.change names the piece '${String(c.piece)}', which is no row of ${c.repertoire !== undefined ? `'${String(c.repertoire)}'` : 'a repertoire it names'}.`)
	if (c.against !== undefined && !Number.isInteger(c.against)) bad(`.change.against is a whole number.`)
	return out
}

/**
 * 🚧 Every reason a ruleset template is refused, each opened by its
 * reason's name: its words (`display-text`), `bad-template` (not marked
 * `template: true`), everything `rulesetFindings` says of the ruleset, and
 * `bad-playtest`.
 * @experimental
 */
export function rulesetTemplateFindings(id: RulesetId, props: RulesetTemplateProps): string[] {
	const out: string[] = []
	if (!isRecord(props)) return [finding('bad-template', `${String(id)} is { label, about, goodFor, ruleset, playtest }.`)]
	for (const k of ['label', 'about', 'goodFor'] as const)
		out.push(...i18nFindings(props[k], `${id} ${k}`, { required: true }).map((f) => finding('display-text', f)))
	if (!isRecord(props.ruleset)) return [...out, finding('bad-template', `${id}.ruleset is the ruleset's declaration.`)]
	if (props.ruleset.template !== true) out.push(finding('bad-template', `${id}.ruleset says template: true — a template is copied, never played.`))
	out.push(...rulesetFindings(id, props.ruleset))
	out.push(...playtestFindings(id, props.ruleset, props.playtest))
	return out
}

const templates = new Map<RulesetId, RulesetTemplate>()

/**
 * 🚧 Declare a ruleset template: checked (`rulesetTemplateFindings`,
 * refused with `RulesetError`), kept in the template registry — never the
 * ruleset registry — and its id reserved against it. An identical
 * re-declaration is a no-op (HMR, a double import).
 * @experimental
 */
export function defineRulesetTemplate(id: RulesetId, props: RulesetTemplateProps): RulesetTemplate {
	if (typeof id !== 'string' || !RULESET_ID_PATTERN.test(id))
		throw new RulesetError(String(id), [finding('invalid-id', `'${String(id)}' is not a ruleset id. Use 'owner:ruleset/name@N'.`)])
	const found = rulesetTemplateFindings(id, props)
	if (found.length) throw new RulesetError(id, found)
	const t: RulesetTemplate = Object.freeze({
		id,
		label: props.label,
		about: props.about,
		goodFor: props.goodFor,
		ruleset: _rulesetDeclOf(id, props.ruleset),
		playtest: Object.freeze(JSON.parse(JSON.stringify(props.playtest)) as RulesetPlaytest),
	})
	const existing = templates.get(id)
	if (existing) refuseUnlessIdentical(existing, t, `duplicate ruleset template id: ${id}`)
	else _reserveRulesetTemplateId(id)
	templates.set(id, t)
	return t
}

/** 🚧 A declared ruleset template, by its id. @experimental */
export const getRulesetTemplate = (id: RulesetId): RulesetTemplate | undefined => templates.get(id)
/** 🚧 Every declared ruleset template, in declaration order. @experimental */
export const rulesetTemplates = (): RulesetTemplate[] => [...templates.values()]
/** @internal */
export function _clearRulesetTemplates(): void {
	templates.clear()
	_releaseRulesetTemplateIds()
}

// ── The laws a shipped catalogue keeps (conformance C38) ────────────────────

/**
 * 🚧 What a catalogue ships of rulesets, for the ruleset laws: its
 * rulesets, its templates, and its genres (what they name).
 * @experimental
 */
export interface RulesetCatalogue {
	rulesets: readonly RulesetDecl[]
	templates?: readonly RulesetTemplate[]
	genres?: readonly Pick<GenreDecl, 'id' | 'rulesets'>[]
}

/**
 * 🚧 **The ruleset laws** (2026-10-22, PLAN-rulesets-authoring M3) — what
 * every ruleset a catalogue ships keeps, beyond what `defineRuleset`
 * refuses, each finding opened by its reason's name:
 *
 *  · `chance-without-degrees` — a check method decided by chance (dice,
 *    cards) holds difficulty bands or reads through a degree mapping the
 *    ruleset declares (its `degrees`, a pool's `countToDegree`): chance with
 *    neither has nothing to be rolled against and nothing to read as.
 *  · `untagged-repertoire` — every repertoire says what its pieces are
 *    (`tags`, at least one), so what the ruleset provides is read, never
 *    guessed from a name.
 *  · `template-recommended` — no genre names a ruleset template.
 *  · `template-registered` — no template is among the rulesets played;
 *    and every template passes `rulesetTemplateFindings`.
 * @experimental
 */
export function rulesetCatalogueFindings(catalogue: RulesetCatalogue): string[] {
	const out: string[] = []
	const templateIds = new Set((catalogue.templates ?? []).map((t) => t.id))
	for (const r of catalogue.rulesets ?? []) {
		if (templateIds.has(r.id) || r.template === true)
			out.push(finding('template-registered', `${r.id} is a ruleset template, and the catalogue plays it as a ruleset. A template is copied, never played.`))
		const declared = r.conventions?.degrees !== undefined || (r.outcomes ?? []).some((o) => o?.five !== undefined)
		for (const [key, m] of Object.entries(normaliseConventions(r).conventions.methods)) {
			const kind = checkMethodKind(m?.kind)
			if (!kind?.chance) continue
			const o = m as unknown as { bands?: unknown; countToDegree?: unknown }
			const bands = Array.isArray(o.bands) && o.bands.length > 0
			const counts = Array.isArray(o.countToDegree) && o.countToDegree.length > 0
			if (!bands && !counts && !declared)
				out.push(
					finding(
						'chance-without-degrees',
						`${r.id}'s check method '${key}' (${kind.methodKind}) is decided by chance, and holds no difficulty bands and reads through no degrees of its own. Give it bands to roll against${kind.methodKind === 'dice-pool' ? ', a countToDegree,' : ''} or declare the ruleset's degrees.`,
					),
				)
		}
		// A ruleset in sections is judged by its entry types below, never its ⏳ read-back.
		for (const rep of r.entryTypes !== undefined ? [] : (r.repertoires ?? []))
			if (!Array.isArray(rep.tags) || !rep.tags.length)
				out.push(finding('untagged-repertoire', `${r.id}'s repertoire '${rep.id}' declares no tags. Say what its pieces are — tags: ['condition'], ['weapon'], or a word of the ruleset's own.`))
		// 🚧 A ruleset in sections: its entry types say what they are too (2026-10-23).
		for (const e of r.entryTypes ?? [])
			if (!Array.isArray(e?.tags) || !e.tags.length)
				out.push(finding('untagged-repertoire', `${r.id}'s entry type '${e.id}' declares no tags. Say what its entries are — tags: ['relationship'], ['condition'], or a word of the ruleset's own.`))
	}
	for (const t of catalogue.templates ?? []) {
		const props = { label: t.label, about: t.about, goodFor: t.goodFor, ruleset: t.ruleset as unknown as RulesetTemplateProps['ruleset'], playtest: t.playtest }
		out.push(...rulesetTemplateFindings(t.id, props))
	}
	for (const g of catalogue.genres ?? []) {
		const rs = g.rulesets as { only?: readonly string[]; recommended?: readonly string[] } | undefined
		for (const id of [...(rs?.only ?? []), ...(rs?.recommended ?? [])])
			if (templateIds.has(id))
				out.push(finding('template-recommended', `${g.id} names ${id}, a ruleset template. A genre offers rulesets to play; a template is copied, never played.`))
	}
	return out
}
