/**
 * 🚧 The **ruleset document** — one ruleset as data (PLAN-ruleset-editor §3).
 *
 * A ruleset declared in code (`defineRuleset`) and one authored on the pub
 * share this shape: `RulesetDecl` as JSON, with a semver `version` (PLAN-
 * rulesets §23). A store holds it, a package ships it, the admin editor edits
 * it, and `defineStoredRulesetDocument` is the one door back into the
 * registry. Vocabularies (`plays`) and slot pairs (`map`) are ids, as a
 * declaration already keeps them; a piece shape is a `FieldDecl`; mechanics
 * and predicates are plain objects. Nothing here is code.
 *
 * What a document does NOT carry: the slots it owns. Those are attribute
 * declarations of their own (`defineStoredAttributeSlot`, the pub's
 * `attribute_declarations` rows), named by id under `stats`; a copy of a
 * ruleset copies its slots beside it and `reidRulesetDocument` renames the
 * references.
 *
 * @experimental
 */

import { slotOwner, type SlotId } from './attributes.js'
import type { I18n } from './i18n.js'
import { finding, RULESET_ID_PATTERN } from './repertoires.js'
import { declaresSections, rulesetAttributeSlots, type RulesetAttributeDecl } from './rulesetSections.js'
import { parseFunctionId, type FunctionRef } from './functions.js'
import {
	defineStoredRuleset,
	rulesetFindings,
	rulesetUpgradeFindings,
	type RulesetDecl,
	type RulesetId,
	type RulesetProps,
	type RulesetSelectorDecl,
} from './rulesets.js'

/** `major.minor.patch`, digits only — `1.0.0`. @experimental */
export const RULESET_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** @experimental */
export interface RulesetDocument extends Omit<RulesetDecl, 'origin' | 'authorUserId' | 'stats' | 'repertoires'> {
	/** 🚧 The declaration's version (§23): bumped on every publish that changes it. */
	readonly version: string
	/** ⏳ The stats — absent from a document in sections (2026-10-23). */
	readonly stats?: RulesetDecl['stats']
	/** ⏳ The repertoires — absent from a document in sections (2026-10-23). */
	readonly repertoires?: RulesetDecl['repertoires']
	/**
	 * 🚧 **How a session moves from an earlier version to this one** (M0,
	 * SHAPES L4 Upgrades): one step per version, `from` → `to` (semver; the
	 * chain contiguous up to this document's `version`, checked by
	 * conformance), saying which slots were `renamed` (old id → new id),
	 * `removed`, or `added` (id → its default) — what `convert-ruleset@1`
	 * re-keys, retracts and inserts — and a `note` the session's *Update
	 * rules* confirm shows. A session pinned to an earlier version keeps
	 * playing it until converted.
	 */
	readonly upgrades?: ReadonlyArray<{
		from: string
		to: string
		slots?: { renamed?: Record<string, string>; removed?: readonly string[]; added?: Record<string, unknown> }
		note?: I18n
	}>
}

/** Where a ruleset id is read from: `owner:ruleset/name@N` → its parts. @experimental */
export function parseRulesetId(id: string): { owner: string; name: string; major: number } | undefined {
	if (typeof id !== 'string' || !RULESET_ID_PATTERN.test(id)) return undefined
	const owner = id.slice(0, id.indexOf(':'))
	const name = id.slice(id.indexOf('/') + 1, id.lastIndexOf('@'))
	return { owner, name, major: Number(id.slice(id.lastIndexOf('@') + 1)) }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * 🚧 A declaration as a document: a deep plain copy with `origin` and
 * `authorUserId` left behind and `version` set (`1.0.0` unless said). The
 * source of every copy an administrator makes of a shipped ruleset.
 * @experimental
 */
export function rulesetDocumentOf(decl: RulesetDecl, version = '1.0.0'): RulesetDocument {
	const { origin: _o, authorUserId: _a, ...rest } = decl
	const doc = { ...clone(rest), version } as RulesetDocument & { stats?: unknown[]; repertoires?: unknown[] }
	// 🚧 A ruleset in sections, or from scratch (2026-10-23): the registry's empty ⏳ lists are not
	// carried. A ruleset in the shape before the sections always said conventions, so its document is as it was.
	if (declaresSections(decl) || decl.conventions === undefined) {
		if (Array.isArray(doc.stats) && !doc.stats.length) delete doc.stats
		if (Array.isArray(doc.repertoires) && !doc.repertoires.length) delete doc.repertoires
	}
	return doc
}

/** The props `defineRuleset` takes, out of a document (`id` and `version` beside). @experimental */
export function rulesetDocumentProps(doc: RulesetDocument): RulesetProps {
	const { id: _id, version: _v, ...props } = doc as RulesetDocument & { origin?: unknown; authorUserId?: unknown }
	delete (props as { origin?: unknown }).origin
	delete (props as { authorUserId?: unknown }).authorUserId
	return props as unknown as RulesetProps
}

/**
 * 🚧 Every reason a document is refused, each opened by its reason's name:
 * `not-a-document` · `bad-version`, then everything `rulesetFindings` says
 * about the declaration inside (unknown stats, selectors, mechanics…). The
 * slots it names must be declared before it is checked — that is the order
 * a store loads in, slots then rulesets.
 * @experimental
 */
export function rulesetDocumentFindings(doc: unknown): string[] {
	if (!doc || typeof doc !== 'object' || Array.isArray(doc))
		return [finding('not-a-document', 'A ruleset document is an object: the declaration with its id and version.')]
	const d = doc as Partial<RulesetDocument>
	const out: string[] = []
	if (typeof d.version !== 'string' || !RULESET_VERSION.test(d.version))
		out.push(finding('bad-version', `${String(d.id)}.version is '${String(d.version)}'; a version reads major.minor.patch — '1.0.0'.`))
	out.push(...rulesetFindings(String(d.id), rulesetDocumentProps(d as RulesetDocument)))
	out.push(...upgradeChainFindings(d))
	return out
}

const UPGRADE_SLOT_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*:slot\/[a-z0-9]+(?:-[a-z0-9]+)*@\d+$/

/** 🚧 Why a document's `upgrades` chain is refused (`bad-version`): versions, forward, contiguous, ending at `version`, slot ids. */
function upgradeChainFindings(d: Partial<RulesetDocument>): string[] {
	if (d.upgrades === undefined) return []
	const id = String(d.id)
	if (!Array.isArray(d.upgrades)) return [finding('bad-version', `${id}.upgrades is a list of steps — { from, to, slots?, note? }.`)]
	const out: string[] = []
	let prevTo: string | undefined
	let last: string | undefined
	d.upgrades.forEach((u, i) => {
		const step = (u ?? {}) as Partial<RulesetDocument['upgrades'] extends ReadonlyArray<infer T> | undefined ? T : never>
		let sound = true
		for (const part of ['from', 'to'] as const) {
			const v = (step as Record<string, unknown>)[part]
			if (typeof v !== 'string' || !RULESET_VERSION.test(v)) {
				out.push(finding('bad-version', `${id}.upgrades[${i}].${part} is '${String(v)}'; a version reads major.minor.patch — '1.0.0'.`))
				sound = false
			}
		}
		if (sound) {
			const { from, to } = step as { from: string; to: string }
			if (compareRulesetVersions(to, from) <= 0) out.push(finding('bad-version', `${id}.upgrades[${i}] goes from ${from} to ${to}; an upgrade moves forward.`))
			if (prevTo !== undefined && from !== prevTo) out.push(finding('bad-version', `${id}.upgrades[${i}] starts at ${from}, but the step before ends at ${prevTo}; the chain must not skip.`))
			prevTo = to
			last = to
		}
		const slots = step.slots
		if (slots && typeof slots === 'object') {
			const named = [...Object.entries(slots.renamed ?? {}).flat(), ...(slots.removed ?? []), ...Object.keys(slots.added ?? {})]
			for (const s of named) if (typeof s !== 'string' || !UPGRADE_SLOT_ID.test(s)) out.push(finding('bad-version', `${id}.upgrades[${i}].slots names '${String(s)}', which is not a slot id.`))
		}
	})
	if (last !== undefined && typeof d.version === 'string' && RULESET_VERSION.test(d.version) && last !== d.version)
		out.push(finding('bad-version', `${id}.upgrades ends at ${last}, but the document is version ${d.version}; the last step ends at it.`))
	return out
}

/** Numeric order of two versions: negative, zero or positive. @experimental */
export function compareRulesetVersions(a: string, b: string): number {
	const pa = a.split('.').map(Number)
	const pb = b.split('.').map(Number)
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
	return 0
}

/** The next patch version — `1.0.0` → `1.0.1`. @experimental */
export function bumpRulesetVersion(v: string, part: 'major' | 'minor' | 'patch' = 'patch'): string {
	const [ma, mi, pa] = v.split('.').map(Number)
	if (part === 'major') return `${ma + 1}.0.0`
	if (part === 'minor') return `${ma}.${mi + 1}.0`
	return `${ma}.${mi}.${pa + 1}`
}

/**
 * 🚧 What publishing `next` over the published `prev` would do (§23): the
 * version must move forward (`version-not-bumped`, `version-backwards`),
 * and every finding `rulesetUpgradeFindings` raises about dropped fields,
 * changed types and newly required fields. An empty list is a clean publish.
 * @experimental
 */
export function rulesetDocumentUpgradeFindings(prev: RulesetDocument, next: RulesetDocument): string[] {
  const out: string[] = []
  if (RULESET_VERSION.test(prev.version) && RULESET_VERSION.test(next.version)) {
    const cmp = compareRulesetVersions(next.version, prev.version)
    if (cmp === 0) out.push(finding('version-not-bumped', `${next.id} is still version ${prev.version}; a publish that changes the rules moves the version.`))
    else if (cmp < 0) out.push(finding('version-backwards', `${next.id} goes from ${prev.version} back to ${next.version}; a version only moves forward.`))
  }
  // A slot `next.upgrades` renames or removes (in the steps from `prev.version` on) is a declared move, not a drop.
  const moved = new Set<string>()
  for (const u of next.upgrades ?? [])
    if (RULESET_VERSION.test(prev.version) && typeof u?.from === 'string' && RULESET_VERSION.test(u.from) && compareRulesetVersions(u.from, prev.version) >= 0) {
      for (const k of Object.keys(u.slots?.renamed ?? {})) moved.add(k)
      for (const k of u.slots?.removed ?? []) moved.add(k)
    }
  let before = prev as unknown as RulesetDecl
  if (moved.size) {
    const copy = clone(prev) as RulesetDocument & { stats?: Array<{ id: string }>; attributes?: RulesetAttributeDecl[] }
    const slotOf = copy.attributes !== undefined ? rulesetAttributeSlots(copy as unknown as RulesetDecl) : undefined
    if (copy.stats) copy.stats = copy.stats.filter((s) => !moved.has(s.id)) as never
    if (copy.attributes && slotOf) copy.attributes = copy.attributes.filter((a) => !moved.has(slotOf.get(a.id) ?? '')) as never
    before = copy as unknown as RulesetDecl
  }
  out.push(...rulesetUpgradeFindings(before, next as unknown as RulesetDecl))
  return out
}

/** The slot ids a document lists as its own — every stat it does not borrow. @experimental */
export const rulesetDocumentOwnSlots = (doc: { stats?: RulesetDocument['stats']; attributes?: readonly RulesetAttributeDecl[] }): SlotId[] => [
	...(doc.stats ?? []).filter((s) => s.borrowed !== true).map((s) => s.id),
	// 🚧 A ruleset in sections owns the slots its attributes name and do not borrow; its own attributes' slots it derives.
	...(doc.attributes ?? []).filter((a) => typeof a?.slot === 'string' && a.borrowed !== true).map((a) => a.slot!),
]

/**
 * 🚧 The same document under a new id (a copy for a new owner): the id, the
 * `to` of its conversions, and every slot reference the caller renames —
 * `stats`, `map`, stat selectors — through `slotIds`. A stat whose slot is
 * not renamed and whose owner is not the new owner is marked `borrowed`:
 * a copy owns only what was copied beside it. Compendium rows, repertoires
 * and `entryable` keep their ids (they are relative to the ruleset). 🚧 A
 * template's `template: true` is left behind: a copy is a ruleset to play.
 * @experimental
 */
export function reidRulesetDocument(
	doc: RulesetDocument,
	newId: RulesetId,
	slotIds: Readonly<Record<string, SlotId>> = {},
): RulesetDocument {
	const parsed = parseRulesetId(newId)
	if (!parsed) throw new Error(`'${newId}' is not a ruleset id. Use 'owner:ruleset/name@N'.`)
	const rename = (id: SlotId): SlotId => slotIds[id] ?? id
	const next = clone(doc) as RulesetDocument & { id: RulesetId; stats: RulesetDocument['stats'] }
	// 🚧 A copy is never a template (2026-10-22): what is made from an archetype is played.
	delete (next as { template?: unknown }).template
	// 🚧 Attributes in sections (2026-10-23): the slots they name renamed and, not copied, borrowed;
	// carried function modules re-owned under the new owner, their references with them.
	const attributes = next.attributes?.map((a) => {
		if (typeof a?.slot !== 'string') return a
		const slot = rename(a.slot)
		const own = slot in slotIds || slotOwner(slot) === parsed.owner
		const { borrowed: _b, ...rest } = a
		return own ? { ...rest, slot } : { ...rest, slot, borrowed: true as const }
	})
	const reown = (id: string) => {
		const f = parseFunctionId(id)
		return f ? `${parsed.owner}:function/${f.name}@${f.version}` : id
	}
	const functions = next.functions?.map((f: FunctionRef) =>
		f?.module ? { ...f, ref: reown(f.ref), module: { ...f.module, id: reown(f.module.id) } } : f,
	)
	const stats = (next.stats ?? []).map((s) => {
		const id = rename(s.id)
		const own = id in slotIds || slotOwner(id) === parsed.owner
		const { borrowed: _b, ...rest } = s
		return own ? { ...rest, id } : { ...rest, id, borrowed: true as const }
	})
	const selectors = next.selectors
		? Object.fromEntries(
				Object.entries(next.selectors).map(([k, v]) => [
					k,
					(v as { kind?: string }).kind === 'stat' ? { ...v, slot: rename((v as { slot: SlotId }).slot) } : v,
				]),
			) as Readonly<Record<string, RulesetSelectorDecl>>
		: undefined
	return {
		...next,
		id: newId,
		...(next.stats !== undefined ? { stats } : {}),
		...(attributes ? { attributes } : {}),
		...(functions ? { functions } : {}),
		...(selectors ? { selectors } : {}),
		...(next.map ? { map: next.map.map(([f, t]) => [rename(f), rename(t)] as const) } : {}),
		...(next.conversions ? { conversions: next.conversions.map((c) => ({ ...c, to: newId })) } : {}),
		// 🚧 In sections, conversions are options (2026-10-23).
		...(next.options?.conversions ? { options: { ...next.options, conversions: next.options.conversions.map((c) => ({ ...c, to: newId })) } } : {}),
	}
}

/**
 * 🚧 The one door from a document into the registry for a ruleset authored
 * on the pub: `defineStoredRuleset` with the document's id and props. Throws
 * `RulesetError` with the findings when the document is refused.
 * @experimental
 */
export function defineStoredRulesetDocument(doc: RulesetDocument, meta: { userId: number | string }): RulesetDecl {
	return defineStoredRuleset(doc.id, rulesetDocumentProps(doc), meta)
}
