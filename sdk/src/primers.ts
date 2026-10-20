/**
 * 🚧 Primers — the starter content a lorebook can be created from.
 *
 * A **primer** (`<creator>:primer/<name>@N`) is a bundle that sets a new
 * lorebook's ruleset and its **compendium mode**, and fills it with starter
 * content written in our own words: lore entries, places joined by exits, a
 * cast with sheets and relationships, a calendar and a starting clock, and
 * leads to follow. It is catalogue data: applied **once**, when a lorebook is
 * created, and never re-applied — a primer bump affects new lorebooks only.
 *
 * The compendium mode says what happens to the ruleset's entryable
 * compendium rows:
 *
 *  · `derived` — every row is materialised as an entry of its repertoire's
 *    derived entry type (`primerDerivedEntries`), stamped `derivedFrom
 *    { compendium, piece, version }`; the lorebook is self-contained.
 *  · `referenced` — nothing is materialised; pickers list the compendium
 *    beside the lorebook's own entries.
 *
 * A primer validates against its ruleset (`primerFindings`): every entry
 * against its entry type (a derived one by the piece checker, a core one by
 * its declared fields), every exit against the ruleset's exits repertoire and
 * toward a place the primer declares, every cast sheet against the ruleset's
 * stats, every reference against a key the primer declares.
 *
 * ⚠ Not a *template* (context templates), not a *preset* (pipeline, sampling
 * and ruleset presets): a primer is applied once and leaves ordinary rows.
 * @experimental
 */

import type { I18n } from './i18n.js'
import { i18nFindings } from './i18n.js'
import { refuseUnlessIdentical } from './hash.js'
import { checkValues } from './settings.js'
import { allEntryTypes } from './descriptors.js'
import { checkSlotValue, getAttributeSlot, resolveSlotConfig, type SlotPiece } from './attributes.js'
import { storyCalendarProblems, storyTimeProblem, type StoryCalendar, type StoryTime } from './storyTime.js'
import { checkPiece, finding, RulesetError, type PieceProps, type RepertoireDecl } from './repertoires.js'
import {
	derivedEntryTypeSource,
	getRuleset,
	rulesetEntryable,
	rulesetEntryTypeId,
	type CompendiumRow,
	type RulesetDecl,
	type RulesetId,
} from './rulesets.js'

/** `owner:primer/name@N` — `core:primer/vis-itineris@1`. @experimental */
export type PrimerId = string

/** The primer id grammar — `owner:primer/name@N`. */
const PRIMER_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:primer\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** 🚧 What a lorebook does with its ruleset's compendium: materialise it, or list it by reference. @experimental */
export type CompendiumMode = 'derived' | 'referenced'
/** @experimental */
export const COMPENDIUM_MODES: readonly CompendiumMode[] = ['derived', 'referenced']

/**
 * 🚧 One lore entry a primer writes: a key unique within the primer (what
 * leads and relationships name), the entry type it is, its title, content
 * and trigger keys, and its declared `fields`. For a derived entry type the
 * fields are a piece of its repertoire (`name`, `description`, …); for a core
 * type, that type's own fields.
 * @experimental
 */
export interface PrimerEntry {
	key: string
	type: string
	title: string
	content: string
	keys?: readonly string[]
	fields?: Readonly<Record<string, unknown>>
}

/**
 * 🚧 A way out of a primer place, as a piece of the ruleset's exits
 * repertoire: `towards` names the key of the place it leads to.
 * @experimental
 */
export interface PrimerExit extends PieceProps {
	towards: string
}

/** 🚧 A place a primer writes — a `core:entry/location@1` entry — and its ways out. @experimental */
export interface PrimerPlace {
	key: string
	title: string
	content: string
	keys?: readonly string[]
	fields?: Readonly<Record<string, unknown>>
	exits?: readonly PrimerExit[]
}

/**
 * 🚧 A cast member a primer seats: who they are, where they are found, their
 * sheet (stat values by slot id, each a stat of the primer's ruleset) and the
 * pieces they hold, by repertoire id.
 * @experimental
 */
export interface PrimerCastMember {
	key: string
	name: string
	description: string
	/** The key of the place they are usually found. */
	at?: string
	sheet?: Readonly<Record<string, unknown>>
	pieces?: Readonly<Record<string, readonly SlotPiece[]>>
}

/** 🚧 A tie between two cast members (or a cast member and a faction entry), worded from both ends. @experimental */
export interface PrimerRelationship {
	from: string
	to: string
	label: string
	reverseLabel?: string
	description?: string
}

/** 🚧 A thread to pull: a hook into play, naming the cast, places and entries it involves. @experimental */
export interface PrimerLead {
	key: string
	title: string
	content: string
	involves?: readonly string[]
}

/** @experimental */
export interface PrimerContent {
	entries: readonly PrimerEntry[]
	places: readonly PrimerPlace[]
	cast: readonly PrimerCastMember[]
	relationships: readonly PrimerRelationship[]
	calendar?: StoryCalendar
	clock?: StoryTime
	leads: readonly PrimerLead[]
}

/** @experimental */
export interface PrimerProps {
	ruleset: RulesetId
	compendiumMode: CompendiumMode
	/** The name a person reads. Display text. */
	name: I18n
	description?: I18n
	content: PrimerContent
}

/** @experimental */
export interface PrimerDecl extends PrimerProps {
	readonly id: PrimerId
}

/** 🚧 An empty primer's content — a blank lorebook with a ruleset chosen. @experimental */
export const EMPTY_PRIMER_CONTENT: PrimerContent = Object.freeze({
	entries: Object.freeze([]),
	places: Object.freeze([]),
	cast: Object.freeze([]),
	relationships: Object.freeze([]),
	leads: Object.freeze([]),
})

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const LOCATION_TYPE = 'core:entry/location@1'

/** The repertoire a ruleset keeps a place's ways out in: its relational one that applies to places. */
const exitsRepertoire = (r: RulesetDecl): RepertoireDecl | undefined =>
	r.repertoires.find((x) => x.relational && x.appliesTo?.includes('location'))

const slotName = (id: string): string => id.slice(id.indexOf('/') + 1, id.lastIndexOf('@'))

function entryFindings(e: PrimerEntry, at: string): string[] {
	const out: string[] = []
	if (typeof e?.title !== 'string' || !e.title.trim()) out.push(finding('bad-entry', `${at} has no title.`))
	if (typeof e?.content !== 'string' || !e.content.trim()) out.push(finding('bad-entry', `${at} has no content.`))
	if (e?.keys !== undefined && (!Array.isArray(e.keys) || e.keys.some((k) => typeof k !== 'string' || !k)))
		out.push(finding('bad-entry', `${at}.keys is a list of trigger words.`))
	const derived = derivedEntryTypeSource(e?.type)
	const fields = (e?.fields ?? {}) as Record<string, unknown>
	if (derived) {
		const universal = new Set(Object.keys(allEntryTypes().find((t) => t.id === e.type)?.entryShape.fields ?? {}))
		const own = Object.keys(derived.repertoire.piece.fields ?? {})
		const piece = Object.fromEntries(Object.entries(fields).filter(([k]) => own.includes(k) || !universal.has(k)))
		const why = checkPiece(derived.repertoire, { kind: 'inline', ...piece } as SlotPiece)
		if (why) out.push(finding('bad-entry', `${at} is not a '${derived.repertoire.id}' piece: ${why}`))
		const schema = allEntryTypes().find((t) => t.id === e.type)?.entryShape.fields ?? {}
		const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !(k in piece)))
		const universalSchema = Object.fromEntries(Object.keys(rest).filter((k) => k in schema).map((k) => [k, schema[k]!]))
		for (const f of checkValues(universalSchema, rest).filter((f) => f.severity === 'error'))
			out.push(finding('bad-entry', `${at}: ${f.message}`))
		return out
	}
	const type = allEntryTypes().find((t) => t.id === e?.type)
	if (!type) {
		out.push(finding('unknown-entry-type', `${at}.type is '${String(e?.type)}', which no entry type is. Name a core entry type or a ruleset's derived one.`))
		return out
	}
	const schema = type.entryShape.fields ?? {}
	const unknown = Object.keys(fields).filter((k) => !(k in schema))
	if (unknown.length) out.push(finding('bad-entry', `${at}: ${type.id} has no ${unknown.map((k) => `'${k}'`).join(', ')}.`))
	for (const f of checkValues(schema, fields).filter((f) => f.severity === 'error'))
		out.push(finding('bad-entry', `${at}: ${f.message}`))
	return out
}

/**
 * 🚧 Every reason a primer is refused, each opened by its reason's name.
 *
 * Reasons: `invalid-id` · `display-text` · `unknown-ruleset` · `bad-mode` ·
 * `bad-key` · `duplicate-key` · `bad-entry` · `unknown-entry-type` ·
 * `bad-exit` · `unknown-place` · `bad-sheet` · `bad-piece` · `unknown-ref` ·
 * `bad-calendar` · `bad-clock` · `bad-lead`.
 * @experimental
 */
export function primerFindings(id: string, props: PrimerProps): string[] {
	const out: string[] = []
	if (typeof id !== 'string' || !PRIMER_ID_PATTERN.test(id))
		out.push(finding('invalid-id', `'${String(id)}' is not a primer id. Use 'owner:primer/name@N' — 'core:primer/vis-itineris@1'.`))
	out.push(...i18nFindings(props?.name, `${id} name`, { required: true }).map((f) => finding('display-text', f)))
	out.push(...i18nFindings(props?.description, `${id} description`).map((f) => finding('display-text', f)))
	if (!COMPENDIUM_MODES.includes(props?.compendiumMode))
		out.push(finding('bad-mode', `${id}.compendiumMode is '${String(props?.compendiumMode)}'. Say 'derived' or 'referenced'.`))
	const ruleset = getRuleset(props?.ruleset)
	if (!ruleset) {
		out.push(finding('unknown-ruleset', `${id}.ruleset names '${String(props?.ruleset)}', which no registered ruleset is. Declare the ruleset first.`))
		return out
	}
	const c = props.content ?? EMPTY_PRIMER_CONTENT
	const keys = new Map<string, 'entry' | 'place' | 'cast' | 'lead'>()
	const claim = (key: unknown, kind: 'entry' | 'place' | 'cast' | 'lead', at: string) => {
		if (typeof key !== 'string' || !KEY.test(key)) out.push(finding('bad-key', `${at}.key is '${String(key)}'. A key is lowercase words joined by '-'.`))
		else if (keys.has(key)) out.push(finding('duplicate-key', `${at}.key '${key}' is already a ${keys.get(key)}'s. Keys are unique across the primer.`))
		else keys.set(key, kind)
	}
	;(c.entries ?? []).forEach((e, i) => claim(e?.key, 'entry', `${id}.entries[${i}]`))
	;(c.places ?? []).forEach((p, i) => claim(p?.key, 'place', `${id}.places[${i}]`))
	;(c.cast ?? []).forEach((m, i) => claim(m?.key, 'cast', `${id}.cast[${i}]`))
	;(c.leads ?? []).forEach((l, i) => claim(l?.key, 'lead', `${id}.leads[${i}]`))

	;(c.entries ?? []).forEach((e, i) => out.push(...entryFindings(e, `${id}.entries[${i}]`)))

	const exits = exitsRepertoire(ruleset)
	;(c.places ?? []).forEach((p, i) => {
		const at = `${id}.places[${i}]`
		out.push(...entryFindings({ ...p, type: LOCATION_TYPE }, at))
		;(p?.exits ?? []).forEach((x, j) => {
			const xat = `${at}.exits[${j}]`
			if (!exits) {
				out.push(finding('bad-exit', `${xat}: ${ruleset.id} declares no relational repertoire for places, so a place holds no exits.`))
				return
			}
			if (keys.get(x?.towards) !== 'place')
				out.push(finding('unknown-place', `${xat}.towards is '${String(x?.towards)}', which no place in the primer is.`))
			const why = checkPiece(exits, { kind: 'inline', ...x } as SlotPiece)
			if (why) out.push(finding('bad-exit', `${xat} is not a '${exits.id}' piece: ${why}`))
		})
	})

	const stats = new Map(ruleset.stats.map((s) => [s.id, s]))
	;(c.cast ?? []).forEach((m, i) => {
		const at = `${id}.cast[${i}]`
		if (typeof m?.name !== 'string' || !m.name.trim()) out.push(finding('bad-entry', `${at} has no name.`))
		if (typeof m?.description !== 'string' || !m.description.trim()) out.push(finding('bad-entry', `${at} has no description.`))
		if (m?.at !== undefined && keys.get(m.at) !== 'place')
			out.push(finding('unknown-ref', `${at}.at is '${String(m.at)}', which no place in the primer is.`))
		for (const [slotId, value] of Object.entries(m?.sheet ?? {})) {
			const entry = stats.get(slotId)
			const decl = getAttributeSlot(slotId)
			if (!entry || !decl) {
				out.push(finding('bad-sheet', `${at}.sheet names '${slotId}', which is not a stat of ${ruleset.id}.`))
				continue
			}
			const why = checkSlotValue(decl, value as never, resolveSlotConfig(decl, entry.config))
			if (why) out.push(finding('bad-sheet', `${at}.sheet['${slotName(slotId)}']: ${why}`))
		}
		for (const [repId, pieces] of Object.entries(m?.pieces ?? {})) {
			const rep = ruleset.repertoires.find((r) => r.id === repId)
			if (!rep) {
				out.push(finding('bad-piece', `${at}.pieces names '${repId}', which ${ruleset.id} does not declare.`))
				continue
			}
			;(pieces ?? []).forEach((p, j) => {
				const why = checkPiece(rep, p)
				if (why) out.push(finding('bad-piece', `${at}.pieces.${repId}[${j}]: ${why}`))
			})
		}
	})

	;(c.relationships ?? []).forEach((r, i) => {
		const at = `${id}.relationships[${i}]`
		for (const end of ['from', 'to'] as const) {
			const k = keys.get(r?.[end])
			if (k !== 'cast' && k !== 'entry' && k !== 'place')
				out.push(finding('unknown-ref', `${at}.${end} is '${String(r?.[end])}', which no cast member, entry or place in the primer is.`))
		}
		if (keys.get(r?.from) !== 'cast' && keys.get(r?.to) !== 'cast')
			out.push(finding('unknown-ref', `${at} joins no cast member. A relationship has a cast member at one end at least.`))
		if (typeof r?.label !== 'string' || !r.label.trim()) out.push(finding('bad-entry', `${at} has no label.`))
	})

	if (c.calendar !== undefined)
		for (const p of storyCalendarProblems(c.calendar)) out.push(finding('bad-calendar', `${id}.calendar: ${p}`))
	if (c.clock !== undefined) {
		const why = storyTimeProblem(c.clock, c.calendar ?? null)
		if (why) out.push(finding('bad-clock', `${id}.clock: ${why}`))
	}

	;(c.leads ?? []).forEach((l, i) => {
		const at = `${id}.leads[${i}]`
		if (typeof l?.title !== 'string' || !l.title.trim() || typeof l?.content !== 'string' || !l.content.trim())
			out.push(finding('bad-lead', `${at} needs a title and content.`))
		for (const ref of l?.involves ?? [])
			if (!keys.has(ref) || keys.get(ref) === 'lead')
				out.push(finding('unknown-ref', `${at}.involves names '${String(ref)}', which no entry, place or cast member in the primer is.`))
	})
	return out
}

/**
 * 🚧 A derived entry a primer in `derived` mode materialises: one compendium
 * row as an entry of its repertoire's derived entry type, with the stamp the
 * lorebook keeps (`lorebook_entries.derived_from`).
 * @experimental
 */
export interface PrimerDerivedEntry {
	type: string
	title: string
	content: string
	fields: PieceProps
	derivedFrom: { compendium: RulesetId; piece: string; version: string }
}

/**
 * 🚧 Every compendium row a `derived` primer materialises, in repertoire
 * order then row order — empty for a `referenced` primer. Each row becomes an
 * entry of `rulesetEntryTypeId(ruleset, repertoire)`; its piece is the
 * entry's fields; `derivedFrom` names the row and its version. Pure.
 * @experimental
 */
export function primerDerivedEntries(primer: Pick<PrimerProps, 'ruleset' | 'compendiumMode'>): PrimerDerivedEntry[] {
	if (primer.compendiumMode !== 'derived') return []
	const ruleset = getRuleset(primer.ruleset)
	if (!ruleset) return []
	const out: PrimerDerivedEntry[] = []
	for (const repId of rulesetEntryable(ruleset))
		for (const row of (ruleset.compendium?.rows[repId] ?? []) as readonly CompendiumRow[]) {
			// The row's bookkeeping stays on the stamp; its piece is the entry's fields.
			const fields = row.piece
			out.push({
				type: rulesetEntryTypeId(ruleset.id, repId),
				title: fields.name,
				content: fields.description,
				fields,
				derivedFrom: { compendium: ruleset.id, piece: row.id, version: row.version },
			})
		}
	return out
}

const registry = new Map<PrimerId, PrimerDecl>()

/**
 * 🚧 Declare a primer, below the ruleset it names and that ruleset's derived
 * entry types. Refused on any finding (`RulesetError`); an identical
 * re-declaration is a no-op, a different one under a claimed id throws.
 * @experimental
 */
export function definePrimer(id: PrimerId, props: PrimerProps): PrimerDecl {
	const found = primerFindings(id, props)
	if (found.length) throw new RulesetError(`primer ${id}`, found)
	const decl: PrimerDecl = Object.freeze({ ...props, id })
	const existing = registry.get(id)
	if (existing) refuseUnlessIdentical(existing, decl, `duplicate primer id: ${id}`)
	registry.set(id, decl)
	return decl
}

/** @experimental */
export const getPrimer = (id: PrimerId): PrimerDecl | undefined => registry.get(id)
/** @experimental */
export const primers = (): PrimerDecl[] => [...registry.values()]
/** @experimental */
export function _clearPrimers(): void {
	registry.clear()
}
