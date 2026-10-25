/**
 * 🚧 Dungeon Crawler's **starting kits** (rulesets W3-B, 2026-10-16): what a
 * new character carries, by class — read from the **session's ruleset** at
 * run time, never kept here (Lair rewrite D9, 2026-10-21: a genre never says
 * what exists; lane G3, 2026-10-23, S4: never the build's Vis Itineris
 * either). The kits are the library rows of the ruleset's **class entry
 * type** — the one tagged `class` (`REPERTOIRE_TAGS`) — each row read as a
 * kit (`kitsOf`): its hit die, ability scores, trained skills, starting kit
 * (library rows, by entry type), spell slots and features, and the names it
 * answers to. The host reads them once per turn onto the inlet's `ruleset`
 * (`rulesetGistOf`, `fromRuleset.ts`); the sheet step picks a kit by the
 * class's name (`kitKeyFor`) and writes each entry type's pieces to the
 * genre's ruleset fields (`sheet.ts`) — never a line of text. A ruleset with
 * no class entry type has no kits: a character starts with what the
 * interview gave, in words.
 *
 * A class no kit names takes the first row's kit.
 */

import type { CompendiumRow, RulesetAttributeDecl } from '@serene-pub/sdk'
import { DUNGEON_CRAWLER_REPERTOIRE_SLOTS } from './sheet.js'

/** One kit: library row ids by entry type, and the features written out — a class row, read. @experimental */
export interface DungeonCrawlerKit {
	label: string
	/** Words in a class's name that pick this kit: the class's own name, then what it is also called. */
	words: readonly string[]
	/** 🚧 The class's hit die, as its number of faces (2026-10-17). */
	hitDie: number
	/**
	 * 🚧 Full health at level 1 (2026-10-17): the hit die's maximum plus the
	 * modifier of the row's `constitution` score — the ruleset's level-1 rule,
	 * read off its class row. At least 1.
	 */
	maxHp: number
	/**
	 * 🚧 The health each later level brings (lane G3, 2026-10-23: the
	 * genre's `HP_PER_LEVEL` retired, D9): half the hit die plus one, plus
	 * the same modifier, at least 1 — what the rules' level-up says for this
	 * class (Vis Itineris's fork of `core:function/experience-levels@1`).
	 * Applied only where the session's ruleset references experience levels
	 * (`RulesetGist.levels`).
	 */
	levelHp: number
	/** 🚧 The ability scores the row lays out, as changes on the ruleset's attributes that hold them (an attribute named for the ability). */
	abilities: ReadonlyArray<{ slot: string; value: number }>
	/** 🚧 The skills the class is trained in (★4), as one change on the ruleset's skill-training attribute — empty where it has none. */
	skills: ReadonlyArray<{ slot: string; value: readonly string[] }>
	/** The starting kit: library rows, by entry type, in the row's order. */
	pieces: ReadonlyArray<{ entryType: string; id: string; version: string }>
	/** 🚧 Spell slots at level 1 (PLAN-sheet-widget-redesign §8, 2026-10-17). */
	spellSlots?: ReadonlyArray<{ level: number; max: number }>
	features: ReadonlyArray<{
		name: string
		description: string
		activation: string
		usesMax?: number
		recharge?: 'short' | 'long' | 'none'
	}>
}

/**
 * 🚧 **The kits of a ruleset**, as the inlet carries them (`RulesetGist.kits`):
 * the library's ruleset (what a piece reference names), the kits by class row
 * id in the library's order (the first is the fallback), the entry types a
 * feature and a spell slot are kept in, and the rows' own names for the
 * summary line. JSON throughout — a script reads it as it is.
 * @experimental
 */
export interface DungeonCrawlerKits {
	ruleset: string
	order: readonly string[]
	byId: Readonly<Record<string, DungeonCrawlerKit>>
	/** The entry type a written-out feature is kept in (tagged `feature`), else null. */
	featureType: string | null
	/** The entry type a level's spell slots are kept in (tagged `resource`), else null. */
	slotType: string | null
	/** The library rows' own names, by `<entry type>:<row id>` — the summary line's labels (AUDIT E). */
	pieceNames: Readonly<Record<string, string>>
}

/** A class row's piece, as a class entry type declares it. */
interface ClassPiece {
	name: string
	hitDie?: string | number
	abilities?: Record<string, number>
	skills?: readonly string[]
	startingKit?: Readonly<Record<string, readonly string[]>>
	spellSlots?: ReadonlyArray<{ level: number; max: number }>
	features?: DungeonCrawlerKit['features']
	alsoCalled?: readonly string[]
}

/** A name's words, in lower case — what `kitKeyFor` matches on. */
const wordsOf = (name: string): string[] =>
	String(name || '')
		.toLowerCase()
		.split(/[^a-z]+/)
		.filter(Boolean)

/** What `kitsOf` reads of a ruleset: its id and its sections (`rulesetSections`). @internal */
export interface KitSections {
	id: string
	entryTypes?: ReadonlyArray<{ id: string; tags?: readonly string[] }>
	attributes?: readonly RulesetAttributeDecl[]
	library?: { rows?: Readonly<Record<string, readonly CompendiumRow[]>> }
}

/** The ruleset attribute named for a key — its id the key, or ending `-<key>` — as the slot a change names. */
function attributeSlotFor(attributes: readonly RulesetAttributeDecl[], key: string): string | null {
	const a = attributes.find((x) => x.id === key) ?? attributes.find((x) => x.id.endsWith(`-${key}`))
	return a ? (a.slot ?? a.id) : null
}

/**
 * 🚧 A ruleset's kits (`DungeonCrawlerKits`), read from its sections: the
 * rows of its entry type tagged `class`, each a kit. Null for a ruleset with
 * no class entry type, or none in its library.
 * @experimental
 */
export function kitsOf(sections: KitSections): DungeonCrawlerKits | null {
	const entryTypes = sections.entryTypes ?? []
	const classType = entryTypes.find((e) => (e.tags ?? []).includes('class'))
	const rows = sections.library?.rows ?? {}
	const classRows = classType ? (rows[classType.id] ?? []) : []
	if (!classType || !classRows.length) return null
	const tagged = (tag: string) => entryTypes.find((e) => (e.tags ?? []).includes(tag))?.id ?? null
	const featureType = tagged('feature')
	// A level's spell slots: the resource entry type a kit's slots are kept in.
	const slotType = classRows.some((r) => ((r.piece as unknown as ClassPiece).spellSlots ?? []).length) ? tagged('resource') : null
	const attributes = sections.attributes ?? []
	const byId: Record<string, DungeonCrawlerKit> = {}
	const pieceNames: Record<string, string> = {}
	for (const row of classRows) {
		const p = row.piece as unknown as ClassPiece
		const hitDie = Number(String(p.hitDie ?? '').replace(/^d/, '')) || 0
		const scores = p.abilities ?? {}
		const mod = typeof scores.constitution === 'number' ? Math.floor((scores.constitution - 10) / 2) : 0
		const pieces: Array<{ entryType: string; id: string; version: string }> = []
		for (const [entryType, ids] of Object.entries(p.startingKit ?? {}))
			for (const id of ids ?? []) {
				const lib = (rows[entryType] ?? []).find((r) => r.id === id)
				pieces.push({ entryType, id, version: String(lib?.version ?? row.version ?? '') })
				if (lib) pieceNames[`${entryType}:${id}`] = String((lib.piece as { name?: unknown }).name ?? id)
			}
		const abilities: Array<{ slot: string; value: number }> = []
		for (const [ability, value] of Object.entries(scores)) {
			const slot = attributeSlotFor(attributes, ability)
			if (slot && typeof value === 'number') abilities.push({ slot, value })
		}
		const skillSlot = attributeSlotFor(attributes, 'skill-training')
		byId[row.id] = Object.freeze({
			label: p.name,
			words: Object.freeze([...new Set([...wordsOf(p.name), ...(p.alsoCalled ?? []).map((w) => w.toLowerCase())])]),
			hitDie,
			maxHp: Math.max(1, hitDie + mod),
			levelHp: Math.max(1, Math.floor(hitDie / 2) + 1 + mod),
			abilities: Object.freeze(abilities),
			skills: Object.freeze(skillSlot && (p.skills ?? []).length ? [{ slot: skillSlot, value: [...p.skills!] }] : []),
			pieces: Object.freeze(pieces),
			...(p.spellSlots?.length ? { spellSlots: Object.freeze(p.spellSlots.map((s) => Object.freeze({ ...s }))) } : {}),
			features: Object.freeze((p.features ?? []).map((f) => Object.freeze({ ...f }))),
		})
	}
	return Object.freeze({
		ruleset: sections.id,
		order: Object.freeze(classRows.map((r) => r.id)),
		byId: Object.freeze(byId),
		featureType,
		slotType,
		pieceNames: Object.freeze(pieceNames),
	})
}

/** A kit by key, else the fallback's (the first). */
const kitFor = (kits: DungeonCrawlerKits, key: string): DungeonCrawlerKit | undefined => kits.byId[key] ?? kits.byId[kits.order[0] ?? '']

/**
 * The kit a class's name picks: the first kit one of whose words is a word
 * of the name, else the fallback (the ruleset's first class). @experimental
 */
export function kitKeyFor(kits: DungeonCrawlerKits, className: string): string {
	const words = wordsOf(className)
	for (const key of kits.order) if (kits.byId[key]!.words.some((w) => words.includes(w))) return key
	return kits.order[0] ?? ''
}

/**
 * 🚧 A kit as the deltas the ruleset handler applies (`core:task/ruleset-resolve@1`,
 * mode `apply`): one `add` per piece, on `owner` — a library piece by its
 * row id, a feature written out, a level's spell slots. Spelled in ES5 for
 * the sheet script too (`kitDeltas` in `DUNGEON_CRAWLER_KIT_JS`).
 * @experimental
 */
export function kitDeltas(kits: DungeonCrawlerKits, key: string, owner: string): Array<Record<string, unknown>> {
	const kit = kitFor(kits, key)
	if (!kit) return []
	const reason = `${kit.label}'s kit`
	const out: Array<Record<string, unknown>> = kit.pieces.map((p) => ({ owner, repertoire: p.entryType, op: 'add', piece: p.id, reason }))
	if (kits.featureType)
		for (const f of kit.features) out.push({ owner, repertoire: kits.featureType, op: 'add', piece: { kind: 'inline', source: 'class', ...f }, reason })
	if (kits.slotType)
		for (const s of kit.spellSlots ?? []) out.push({ owner, repertoire: kits.slotType, op: 'add', piece: spellSlotPiece(s.level, s.max, 0), reason })
	return out
}

/**
 * 🚧 A kit as the changes a sheet step writes to the genre's own fields: one
 * change per field that holds something, its value the list of pieces
 * (`{ kind: 'compendium', compendiumId, pieceId, version }`, or a written-out
 * feature). Owner-less: the sheet step names the seat.
 * @experimental
 */
export function kitChanges(kits: DungeonCrawlerKits, key: string): Array<{ slot: string; value: unknown[] }> {
	const kit = kitFor(kits, key)
	if (!kit) return []
	const slots = DUNGEON_CRAWLER_REPERTOIRE_SLOTS as Readonly<Record<string, string>>
	const byType = new Map<string, unknown[]>()
	for (const p of kit.pieces) {
		if (!slots[p.entryType]) continue
		const list = byType.get(p.entryType) ?? []
		list.push({ kind: 'compendium', compendiumId: kits.ruleset, pieceId: p.id, version: p.version })
		byType.set(p.entryType, list)
	}
	const out: Array<{ slot: string; value: unknown[] }> = [...byType].map(([type, value]) => ({ slot: slots[type]!, value }))
	if (kit.features.length && kits.featureType && slots[kits.featureType])
		out.push({ slot: slots[kits.featureType]!, value: kit.features.map((f) => ({ kind: 'inline', source: 'class', ...f })) })
	return out
}

/**
 * 🚧 One level's spell slots as a written-out spell-slots piece, named by its
 * level ("Level 1") — what the Planner's `spend` names by the level alone
 * ("1"). @experimental
 */
export function spellSlotPiece(level: number, max: number, used: number): Record<string, unknown> {
	return { kind: 'inline', name: `Level ${level}`, description: `Spell slots of level ${level}.`, level, max, used, recharge: 'long' }
}

/** 🚧 The classes a character may be made as, by the ruleset's own names, in its order: "A, B or C". @internal */
export function classListOf(kits: DungeonCrawlerKits | null | undefined): string {
	const names = kits ? kits.order.map((k) => kits.byId[k]!.label) : []
	return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : (names[0] ?? '')
}

/**
 * 🚧 The kits in ES5, for the interview's scripts, over the session's ruleset
 * as the inlet carries it (`v.ruleset.kits`, `RulesetGist`): `kitKeyFor(name)`,
 * `kitDeltas(key, owner)`, `kitAbilityChanges(key)`, `kitSkillChanges(key)`,
 * `kitMaxHp(key)` (null with no kit: health stays the sheet's own),
 * `kitSpellPoints(key)` (the spell-point pool rule for its class at level 1,
 * where it casts at all), `pieceLabel(entryType, piece)`, `KIT_LABELS` and
 * `classList()` ("A, B or C"). With no kits — a ruleset with no class entry
 * type — every one answers nothing. Needs the preamble (`own`, `copy`,
 * `text`, `num`, `spellPointsFor`). @internal
 */
export const DUNGEON_CRAWLER_KIT_JS = `
var KITS = own(own(v.ruleset).kits);
var KIT_ORDER = Array.isArray(KITS.order) ? KITS.order : [];
var KIT_BY = own(KITS.byId);
// 🚧 Each kit's class, by its label: what the table picks when Just play's
// sheet came back with no class (the 100-turn walk, B20).
var KIT_LABELS = [];
for (var kl0 = 0; kl0 < KIT_ORDER.length; kl0++) KIT_LABELS.push(text(own(KIT_BY[KIT_ORDER[kl0]]).label));
// 🚧 The kit a class no kit names takes: the ruleset's first class.
var FALLBACK_KIT = KIT_ORDER.length ? KIT_ORDER[0] : "";
function classList() {
	return KIT_LABELS.length > 1 ? KIT_LABELS.slice(0, -1).join(", ") + " or " + KIT_LABELS[KIT_LABELS.length - 1] : KIT_LABELS[0] || "";
}
function kitOf(key) { return own(KIT_BY[key] || KIT_BY[FALLBACK_KIT]); }
function kitKeyFor(name) {
	var words = String(name || "").toLowerCase().split(/[^a-z]+/);
	for (var k0 = 0; k0 < KIT_ORDER.length; k0++) {
		var kw = own(KIT_BY[KIT_ORDER[k0]]).words;
		kw = Array.isArray(kw) ? kw : [];
		for (var i = 0; i < kw.length; i++) for (var j = 0; j < words.length; j++) if (words[j] && words[j] === kw[i]) return KIT_ORDER[k0];
	}
	return FALLBACK_KIT;
}
function kitAbilityChanges(key) { var a0 = kitOf(key).abilities; return Array.isArray(a0) ? copy(a0) : []; }
// 🚧 Each kit's trained skills (★4): one change on the ruleset's trained-skills field.
function kitSkillChanges(key) { var s0 = kitOf(key).skills; return Array.isArray(s0) ? copy(s0) : []; }
function kitMaxHp(key) { var m = num(kitOf(key).maxHp, 0); return m > 0 ? m : null; }
// 🚧 A kit's spell-point pool at level 1 (P2-4): the pool rule for its class, where it casts at all.
function kitSpellPoints(key) { var k0 = kitOf(key); return Array.isArray(k0.spellSlots) && k0.spellSlots.length ? spellPointsFor(k0.label, 1) : 0; }
function spellSlotPiece(level, max, used) { return { kind: "inline", name: "Level " + level, description: "Spell slots of level " + level + ".", level: level, max: max, used: used, recharge: "long" }; }
function kitDeltas(key, owner) {
	var k0 = kitOf(key), out = [], reason = text(k0.label) + "'s kit";
	if (!text(k0.label)) return out;
	var ps = Array.isArray(k0.pieces) ? k0.pieces : [];
	for (var i = 0; i < ps.length; i++) out.push({ owner: owner, repertoire: ps[i].entryType, op: "add", piece: ps[i].id, reason: reason });
	var fs = Array.isArray(k0.features) ? k0.features : [];
	if (text(KITS.featureType)) for (var f = 0; f < fs.length; f++) {
		var piece = { kind: "inline", source: "class" };
		for (var fk in fs[f]) piece[fk] = fs[f][fk];
		out.push({ owner: owner, repertoire: KITS.featureType, op: "add", piece: piece, reason: reason });
	}
	var ss = Array.isArray(k0.spellSlots) ? k0.spellSlots : [];
	if (text(KITS.slotType)) for (var s = 0; s < ss.length; s++) out.push({ owner: owner, repertoire: KITS.slotType, op: "add", piece: spellSlotPiece(ss[s].level, ss[s].max, 0), reason: reason });
	return out;
}
// A piece's name, for the summary line: the library row's own \`name\`
// (never the id spelled out), or the written-out piece's.
var PIECE_NAMES = own(KITS.pieceNames);
function pieceLabel(rep, p) {
	if (p && typeof p === "object") return String(p.name || "");
	return PIECE_NAMES[rep + ":" + p] || String(p || "");
}
`
