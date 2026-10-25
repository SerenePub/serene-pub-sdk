/**
 * 🚧 **Vocabularies** — shared attribute words, as SDK objects (R27–R30, A19).
 *
 * A vocabulary is a declared object whose members ARE attribute slot
 * declarations, grouped by the owner they attach to — `world` · `cast` ·
 * `location` (`SlotAppliesTo`) — never wrappers around them:
 *
 * ```ts
 * const scifi = vocabulary('acme.scifi:vocabulary/ships@1', { cast: { shields: shieldsSlot } })
 * scifi.cast.shields            // the slot declaration itself, typed
 * ```
 *
 * A **ruleset plays** vocabularies (`defineRuleset(id, { plays: [common, scifi],
 * map: [[common.cast.health, vigour]] })`) — natively, or mapped onto its own
 * stats — and a ruleset is itself a vocabulary of its own stats
 * (`rulesetVocabulary`). Nothing is a gate: a ruleset plays what it likes and
 * a reference to something it does not play is simply absent (A19).
 *
 * ## Four ways to reference a property, in order of preference
 *
 * 1. the common vocabulary's member (core-catalog's `rulesets.common`, id
 *    `COMMON_VOCABULARY_ID`) — fits every ruleset that plays it;
 * 2. a ruleset's own member — makes the reference ruleset-specific;
 * 3. a custom vocabulary's member — for a family of rulesets that agree on it;
 * 4. a string, `stat('shields')` — resolved by slug at run time; the
 *    validator warns (never refuses) when nothing installed declares it (R30).
 *
 * The parameter type is `AttributeRef` — the declaration, or a string.
 * `resolveAttributeRef(ref, ruleset)` is the one resolver: an object by
 * identity, a string by slug (the ruleset's own, then each vocabulary it
 * plays, the common one last); two matches warn and take the ruleset's own;
 * nothing → `null` with the reason, so a condition reads false and a run goes
 * on (A19).
 *
 * ⚠ Not the host's per-session **vocabulary** of tracked slots (the app's
 * `vocabularyFor`, "this session's vocabulary, in sheet order") — that one is
 * what a session tracks; this one is a shared set of words to reference.
 * @experimental
 * @ruling R27, R28, R29, R30, A19
 */

import {
	getAttributeSlot,
	attributeSlots,
	slotSlug,
	type AttributeSlotDecl,
	type SlotAppliesTo,
	type SlotId,
} from './attributes.js'
import { refuseUnlessIdentical } from './hash.js'
import type { RulesetDecl } from './rulesets.js'

/** The owners a vocabulary groups its members under — the attribute owners. @experimental */
export type VocabularyOwner = SlotAppliesTo

/** The three owners, in the order a vocabulary lists them. @experimental */
export const VOCABULARY_OWNERS: readonly VocabularyOwner[] = Object.freeze(['world', 'cast', 'location'] as const)

/** One owner's members: the vocabulary's word → the attribute slot declaration. @experimental */
export type VocabularyGroup = Readonly<Record<string, AttributeSlotDecl>>

/** What `vocabulary()` takes: members grouped by owner. @experimental */
export interface VocabularyGroups {
	readonly world?: VocabularyGroup
	readonly cast?: VocabularyGroup
	readonly location?: VocabularyGroup
}

/** A vocabulary's id: `<owner>:vocabulary/<name>@<n>` — or a ruleset's own id, for a ruleset read as one. @experimental */
export type VocabularyId = string

/**
 * 🚧 The common vocabulary's id — what core-catalog's `rulesets.common` is
 * declared under (R27, R28). A string reference resolves against it LAST.
 * @experimental
 * @ruling R27, R28
 */
export const COMMON_VOCABULARY_ID: VocabularyId = 'core:vocabulary/common@1'

const VOCABULARY_ID = /^[a-z0-9][a-z0-9._-]*:[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*@\d+$/

/** Runtime brand, so a vocabulary is told from a plain object by value. */
const VOCABULARY = Symbol.for('serene-pub.vocabulary')

/**
 * 🚧 A declared vocabulary: its id and its members by owner. Every group is
 * present (empty when unstated), so `v.cast.health` never reads through
 * `undefined`.
 * @experimental
 * @ruling R27, A19
 */
export type Vocabulary<G extends VocabularyGroups = VocabularyGroups> = {
	readonly id: VocabularyId
	readonly world: G['world'] extends VocabularyGroup ? G['world'] : {}
	readonly cast: G['cast'] extends VocabularyGroup ? G['cast'] : {}
	readonly location: G['location'] extends VocabularyGroup ? G['location'] : {}
}

/** Is this a declared vocabulary (from `vocabulary()` or `rulesetVocabulary()`)? @experimental */
export const isVocabulary = (v: unknown): v is Vocabulary =>
	!!v && typeof v === 'object' && (v as Record<symbol, unknown>)[VOCABULARY] === true

const registry = new Map<VocabularyId, Vocabulary>()

const isSlotDecl = (v: unknown): v is AttributeSlotDecl =>
	!!v && typeof v === 'object' && typeof (v as AttributeSlotDecl).id === 'string' &&
	Array.isArray((v as AttributeSlotDecl).appliesTo)

/** A member word: a JS identifier a property chain can name (`health`, `spellPoints`). */
const MEMBER_WORD = /^[a-zA-Z][a-zA-Z0-9]*$/

/**
 * Every fault in a vocabulary declaration, one sentence each — `[]` when it is
 * sound.
 * @experimental
 */
export function vocabularyFindings(id: unknown, groups: unknown): string[] {
	const out: string[] = []
	if (typeof id !== 'string' || !VOCABULARY_ID.test(id))
		out.push(`'${String(id)}' is not a vocabulary id. Use 'owner:vocabulary/name@N' — 'acme.scifi:vocabulary/ships@1'.`)
	if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
		out.push(`${String(id)}: members are grouped by owner — { world?, cast?, location? }`)
		return out
	}
	for (const [owner, group] of Object.entries(groups as Record<string, unknown>)) {
		if (!(VOCABULARY_OWNERS as readonly string[]).includes(owner)) {
			out.push(`${id}.${owner}: a vocabulary groups by owner — ${VOCABULARY_OWNERS.join(', ')}`)
			continue
		}
		if (!group || typeof group !== 'object' || Array.isArray(group)) {
			out.push(`${id}.${owner}: a group maps a word to an attribute slot declaration — { health: hpSlot }`)
			continue
		}
		for (const [word, member] of Object.entries(group as Record<string, unknown>)) {
			const at = `${id}.${owner}.${word}`
			if (!MEMBER_WORD.test(word)) out.push(`${at}: a member's word is an identifier — 'spellPoints', not '${word}'`)
			if (!isSlotDecl(member)) {
				out.push(
					`${at}: a member IS an attribute slot declaration (defineAttributeSlot(…)) — ` +
						`got ${typeof member === 'string' ? `the string '${member}'; pass the declaration` : typeof member}`,
				)
				continue
			}
			if (!getAttributeSlot(member.id))
				out.push(`${at}: '${member.id}' is not a registered attribute slot — declare it above the vocabulary`)
			if (!member.appliesTo.includes(owner as SlotAppliesTo))
				out.push(
					`${at}: '${member.id}' does not attach to the ${owner} (it attaches to ${member.appliesTo.join(', ')}) — ` +
						`list it under ${member.appliesTo.map((a) => `'${a}'`).join(' or ')}`,
				)
		}
	}
	return out
}

function freezeVocabulary(id: VocabularyId, groups: VocabularyGroups): Vocabulary {
	const v = {
		id,
		world: Object.freeze({ ...(groups.world ?? {}) }),
		cast: Object.freeze({ ...(groups.cast ?? {}) }),
		location: Object.freeze({ ...(groups.location ?? {}) }),
	}
	// Non-enumerable: the brand never reaches JSON, a hash or a comparison.
	Object.defineProperty(v, VOCABULARY, { value: true, enumerable: false })
	return Object.freeze(v) as Vocabulary
}

/** The stored form a registry compares: member slot ids, not the declarations. */
const comparable = (v: Vocabulary) => ({
	id: v.id,
	world: Object.fromEntries(Object.entries(v.world).map(([k, s]) => [k, (s as AttributeSlotDecl).id])),
	cast: Object.fromEntries(Object.entries(v.cast).map(([k, s]) => [k, (s as AttributeSlotDecl).id])),
	location: Object.fromEntries(Object.entries(v.location).map(([k, s]) => [k, (s as AttributeSlotDecl).id])),
})

/**
 * 🚧 Declare a vocabulary: members grouped by owner, each the attribute slot
 * declaration itself (A19). Registered — a ruleset's `plays` names it by id —
 * with every registry's discipline: an identical re-declaration is a no-op, a
 * different one under a claimed id throws. Refused on any finding.
 *
 * ```ts
 * export const scifi = vocabulary('acme.scifi:vocabulary/ships@1', {
 *   cast: { shields: shieldsSlot, hull: hullSlot },
 * })
 * ```
 * @experimental
 * @ruling R27, R29, A19
 */
export function vocabulary<const G extends VocabularyGroups>(id: VocabularyId, groups: G): Vocabulary<G> {
	const found = vocabularyFindings(id, groups)
	if (found.length) throw new Error(`vocabulary '${String(id)}':\n · ${found.join('\n · ')}`)
	const v = freezeVocabulary(id, groups)
	const existing = registry.get(id)
	if (existing) refuseUnlessIdentical(comparable(existing), comparable(v), `duplicate vocabulary id: ${id}`)
	registry.set(id, v)
	return v as unknown as Vocabulary<G>
}

/** A registered vocabulary, by id. @experimental */
export const getVocabulary = (id: VocabularyId): Vocabulary | undefined => registry.get(id)

/** Every registered vocabulary. @experimental */
export const vocabularies = (): Vocabulary[] => [...registry.values()]

/** @internal */
export function _clearVocabularies(): void {
	registry.clear()
}

/** @internal */
export function _withdrawVocabulary(id: VocabularyId): boolean {
	return registry.delete(id)
}

/** `spell-points`, `spellPoints`, `spell_points` → `spell-points`: one spelling to compare slugs by. @internal */
export const slugWord = (s: string): string =>
	s
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/_/g, '-')
		.toLowerCase()

/** `spell-points` → `spellPoints`: the member word a slug reads as on a typed view. @internal */
export const memberWord = (slug: string): string => slug.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())

/**
 * 🚧 A ruleset read as a vocabulary of its own stats (A19): each stat's slot
 * under the owners it attaches to (the stat entry's `appliesTo` where it
 * narrows, else the slot's), under its slug as a member word (`spell-points`
 * → `spellPoints`). Not registered — the ruleset is. A stat whose slot is not
 * registered is left out.
 * @experimental
 * @ruling A19
 */
export function rulesetVocabulary(ruleset: Pick<RulesetDecl, 'id' | 'stats'>): Vocabulary {
	const groups: Record<VocabularyOwner, Record<string, AttributeSlotDecl>> = { world: {}, cast: {}, location: {} }
	for (const entry of ruleset.stats ?? []) {
		const slot = getAttributeSlot(entry.id)
		if (!slot) continue
		const owners = (entry as { appliesTo?: readonly SlotAppliesTo[] }).appliesTo ?? slot.appliesTo
		for (const owner of owners) {
			const word = memberWord(slotSlug(slot.id))
			if (!(word in groups[owner])) groups[owner][word] = slot
		}
	}
	return freezeVocabulary(ruleset.id, groups)
}

// ── References ──────────────────────────────────────────────────────────────

/**
 * 🚧 How a reference names an attribute (A19): the declaration (a common or
 * ruleset vocabulary member, a slot) — typed and checked — or a string,
 * resolved by slug at run time.
 * @experimental
 * @ruling A19, R30
 */
export type AttributeRef = AttributeSlotDecl | string

/**
 * 🚧 A string reference to an attribute, by slug (A19's fourth way):
 * `stat('shields')`. Untyped; resolved by `resolveAttributeRef` in the session's
 * ruleset; `attributeRefWarnings` says when nothing installed declares it.
 * Refuses only what can never be a slug.
 * @experimental
 * @ruling A19, R30
 */
export function stat(slug: string): string {
	if (typeof slug !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(slug))
		throw new Error(`stat('${String(slug)}'): a slug — 'shields', 'spell-points'`)
	return slug
}

/**
 * 🚧 The registered vocabularies a declared ruleset plays, in the order a
 * string reference reads them: its own order, the common vocabulary last
 * (A19). An id nothing registered is left out.
 * @experimental
 * @ruling A19
 */
export function playedVocabularies(ruleset: Pick<RulesetDecl, 'plays'> | null | undefined): Vocabulary[] {
	return playedBy(ruleset)
}

/** Every vocabulary a ruleset plays, in its order, the common one last; then nothing. */
function playedBy(ruleset: Pick<RulesetDecl, 'plays'> | null | undefined): Vocabulary[] {
	const ids = [...(ruleset?.plays ?? [])]
	const ordered = [...ids.filter((v) => v !== COMMON_VOCABULARY_ID), ...ids.filter((v) => v === COMMON_VOCABULARY_ID)]
	return ordered.map((id) => getVocabulary(id)).filter((v): v is Vocabulary => !!v)
}

/** The members of a vocabulary that answer to `word` — by member word or by the slot's own slug. */
function membersNamed(v: Vocabulary, word: string): AttributeSlotDecl[] {
	const want = slugWord(word)
	const out: AttributeSlotDecl[] = []
	for (const owner of VOCABULARY_OWNERS)
		for (const [k, slot] of Object.entries(v[owner] as VocabularyGroup))
			if ((slugWord(k) === want || slotSlug(slot.id) === want) && !out.some((s) => s.id === slot.id)) out.push(slot)
	return out
}

/** Is this slot a member of the vocabulary, under any owner? */
const hasMember = (v: Vocabulary, slotId: SlotId): boolean =>
	VOCABULARY_OWNERS.some((o) => Object.values(v[o] as VocabularyGroup).some((s) => s.id === slotId))

/**
 * 🚧 What a reference resolves to in a session's ruleset: the slot, how it got
 * there (`own` stat, a played `vocabulary`, a ruleset's `map`, or `direct` —
 * no ruleset to consult), and any warnings; or `slot: null` with the reason.
 * @experimental
 * @ruling A19
 */
export type AttributeResolution =
	| {
			readonly slot: AttributeSlotDecl
			readonly via: 'own' | 'vocabulary' | 'map' | 'direct'
			/** The vocabulary it was found in, for `vocabulary` and `map`. */
			readonly vocabulary?: VocabularyId
			readonly warnings: readonly string[]
	  }
	| { readonly slot: null; readonly reason: string; readonly warnings: readonly string[] }

/**
 * 🚧 Resolve an attribute reference in a session's ruleset (A19) — the one
 * resolver every reader asks:
 *
 * - an **object** by identity: the ruleset's own stat; else the stat a `map`
 *   entry puts in its place; else a member of a vocabulary it plays; else
 *   absent ("‹ruleset› does not play ‹slot›").
 * - a **string** by slug: the ruleset's own stats, then each vocabulary it
 *   plays in order, the common one last. Two matches warn and take the
 *   ruleset's own (or the first in order); a played member the ruleset maps
 *   onto its own stat resolves to that stat. Nothing → absent, with the reason.
 *
 * With no ruleset an object resolves to itself and a string only against the
 * common vocabulary. Never throws: absence is an answer (a condition reads
 * false, a read gets nothing, the run goes on).
 * @experimental
 * @ruling A19, R30
 */
export function resolveAttributeRef(
	ref: AttributeRef,
	ruleset: Pick<RulesetDecl, 'id' | 'stats' | 'plays' | 'map'> | null | undefined,
): AttributeResolution {
	const warnings: string[] = []
	if (!ruleset) {
		if (typeof ref !== 'string')
			return isSlotDecl(ref)
				? { slot: ref, via: 'direct', warnings }
				: { slot: null, reason: 'not an attribute reference', warnings }
		const common = getVocabulary(COMMON_VOCABULARY_ID)
		const found = common ? membersNamed(common, ref) : []
		if (found.length > 1) warnings.push(`'${ref}' names ${found.length} common members; took '${found[0]!.id}'`)
		return found[0]
			? { slot: found[0], via: 'vocabulary', vocabulary: COMMON_VOCABULARY_ID, warnings }
			: { slot: null, reason: `no ruleset, and the common vocabulary has no '${ref}'`, warnings }
	}
	const own = new Set((ruleset.stats ?? []).map((s) => s.id))
	const mapped = new Map((ruleset.map ?? []).map(([from, to]) => [from, to] as const))
	const played = playedBy(ruleset)
	const ownSlot = (id: SlotId) => (own.has(id) ? getAttributeSlot(id) : undefined)

	if (typeof ref !== 'string') {
		if (!isSlotDecl(ref)) return { slot: null, reason: 'not an attribute reference', warnings }
		const self = ownSlot(ref.id)
		if (self) return { slot: self, via: 'own', warnings }
		const to = mapped.get(ref.id)
		const target = to ? getAttributeSlot(to) : undefined
		if (target) {
			const from = played.find((v) => hasMember(v, ref.id))
			return { slot: target, via: 'map', ...(from ? { vocabulary: from.id } : {}), warnings }
		}
		const from = played.find((v) => hasMember(v, ref.id))
		if (from) return { slot: ref, via: 'vocabulary', vocabulary: from.id, warnings }
		return { slot: null, reason: `${ruleset.id} does not play '${ref.id}'`, warnings }
	}

	const word = slugWord(ref)
	const ownHits = [...own]
		.map((id) => getAttributeSlot(id))
		.filter((s): s is AttributeSlotDecl => !!s && slotSlug(s.id) === word)
	const vocabHits: { slot: AttributeSlotDecl; vocabulary: VocabularyId }[] = []
	for (const v of played) for (const slot of membersNamed(v, ref)) vocabHits.push({ slot, vocabulary: v.id })
	const distinct = new Set([...ownHits.map((s) => s.id), ...vocabHits.map((h) => mapped.get(h.slot.id) ?? h.slot.id)])
	if (distinct.size > 1)
		warnings.push(
			`'${ref}' names ${distinct.size} attributes in ${ruleset.id} (${[...distinct].join(', ')}); ` +
				`took ${ownHits[0] ? `the ruleset's own, '${ownHits[0].id}'` : `the first it plays`}`,
		)
	if (ownHits[0]) return { slot: ownHits[0], via: 'own', warnings }
	const hit = vocabHits[0]
	if (!hit) return { slot: null, reason: `nothing ${ruleset.id} plays is called '${ref}'`, warnings }
	const to = mapped.get(hit.slot.id)
	const target = to ? getAttributeSlot(to) : undefined
	if (target) return { slot: target, via: 'map', vocabulary: hit.vocabulary, warnings }
	return { slot: hit.slot, via: 'vocabulary', vocabulary: hit.vocabulary, warnings }
}

/**
 * 🚧 What a validator says about a reference (R30): nothing for a declaration
 * (it is typed and checked where it is written); a warning for a string that
 * no installed attribute slot or vocabulary member answers to. Never refuses.
 * @experimental
 * @ruling R30, A19
 */
export function attributeRefWarnings(ref: AttributeRef, at = 'ref'): string[] {
	if (typeof ref !== 'string') return isSlotDecl(ref) ? [] : [`${at}: an attribute reference is a slot declaration or a slug`]
	const word = slugWord(ref)
	if (attributeSlots().some((s) => slotSlug(s.id) === word)) return []
	if (vocabularies().some((v) => membersNamed(v, ref).length > 0)) return []
	return [
		`${at}: nothing installed declares an attribute called '${ref}' — fine if a package that does is installed ` +
			`later; prefer the declaration (a vocabulary member) where one exists`,
	]
}
