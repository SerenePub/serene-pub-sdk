/**
 * 🚧 **Nothing was lost** (lane A2, PLAN-rulesets-functions D9, 2026-10-23):
 * Vis Itineris and Wherewithal rebuilt in the seven sections over core's
 * functions read, every way a host reads them, exactly as the declarations
 * before sections did — built here from the same parts `registry/rulesets.ts`
 * declared them from.
 *
 * The readings compared: the conventions (`normaliseRuleset`) under every
 * preset and every single setting choice; the sections (`rulesetSections`)
 * — attributes, entry types, outcomes, time, library, options, and every
 * function reference's id, key and options, each carried module's seed key
 * and phase; the names piece rules may target and their families; the
 * derived entry types; the settings and presets read back; whether it
 * decides; what it provides. The way bodies those references decide by are
 * the ruleset handler's resolvers (the app-side proof in the lane's report).
 * The document hashes move — the declaration's shape did — and are recorded.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
	_rulesetDeclOf,
	canonicalize,
	normaliseRuleset,
	presetsOf,
	rulesetContext,
	rulesetDecides,
	rulesetDocumentOf,
	rulesetEntryTypeDecls,
	rulesetFindings,
	rulesetProvides,
	rulesetSections,
	sectionsRepertoireContext,
	settingsOf,
	type FunctionRef,
	type RulesetProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'
import { VIS_ITINERIS_RULESET } from '../core-catalog/src/rulesets/vis-itineris/ruleset.js'
import { WHEREWITHAL_RULESET } from '../core-catalog/src/rulesets/wherewithal/ruleset.js'

const digest = (v: unknown) => createHash('sha256').update(canonicalize(v as never)).digest('hex').slice(0, 16)

/** Vis Itineris as `registry/rulesets.ts` declared it before the sections. */
const VI_BEFORE: RulesetProps = {
	name: { en: 'Vis Itineris' },
	description: VIS_ITINERIS_RULESET.description,
	voice: cat.VIS_ITINERIS_VOICE,
	conventions: cat.VIS_ITINERIS_CONVENTIONS,
	settings: cat.VIS_ITINERIS_SETTINGS,
	presets: cat.VIS_ITINERIS_PRESETS,
	stats: [
		{ id: cat.levelSlot.id, config: { min: 1, max: 20 }, borrowed: true },
		{ id: cat.characterClassSlot.id, borrowed: true },
		{ id: cat.hpSlot.id, config: { min: 0, max: 999 }, default: 10, borrowed: true },
		...cat.VIS_ITINERIS_OWN_SLOTS.map((s) => ({ id: s.id })),
	],
	selectors: cat.VIS_ITINERIS_SELECTORS,
	repertoires: cat.VIS_ITINERIS_REPERTOIRES,
	compendium: cat.VIS_ITINERIS_COMPENDIUM,
	scripts: [
		{ phase: 'derived', priority: 10, seedKey: 'core:script/vis-itineris-derive' },
		{ phase: 'derived', priority: 20, seedKey: 'core:script/vis-itineris-bulk' },
		{ phase: 'pre-roll', priority: 10, seedKey: 'core:script/vis-itineris-heighten-spell' },
		{ phase: 'effects', priority: 90, seedKey: 'core:script/vis-itineris-level-up' },
	],
	conversions: [cat.VIS_ITINERIS_FROM_FREEFORM],
	plays: [cat.commonVocabulary],
}

/** Wherewithal as `registry/rulesets.ts` declared it before the sections. */
const W_BEFORE: RulesetProps = {
	name: { en: 'Wherewithal' },
	description: WHEREWITHAL_RULESET.description,
	voice: cat.WHEREWITHAL_VOICE,
	conventions: cat.WHEREWITHAL_CONVENTIONS,
	stats: [...cat.WHEREWITHAL_OWN_SLOTS.map((s) => ({ id: s.id })), { id: cat.moodSlot.id, borrowed: true }],
	selectors: cat.WHEREWITHAL_SELECTORS,
	repertoires: cat.WHEREWITHAL_REPERTOIRES,
	compendium: cat.WHEREWITHAL_COMPENDIUM,
	scripts: [
		{ phase: 'effects', priority: 10, seedKey: cat.WHEREWITHAL_SCRIPT_KEYS.strain },
		{ phase: 'derived', priority: 10, seedKey: cat.WHEREWITHAL_SCRIPT_KEYS.derive },
		{ phase: 'render', priority: 10, seedKey: cat.WHEREWITHAL_SCRIPT_KEYS.render },
	],
	conversions: [cat.WHEREWITHAL_FROM_FREEFORM],
	plays: [cat.commonVocabulary],
}

const CASES = [
	{ id: cat.VIS_ITINERIS_RULESET_ID, before: VI_BEFORE, after: { ...VIS_ITINERIS_RULESET, plays: [cat.commonVocabulary] } as RulesetProps },
	{ id: cat.WHEREWITHAL_RULESET_ID, before: W_BEFORE, after: { ...WHEREWITHAL_RULESET, plays: [cat.commonVocabulary] } as RulesetProps },
]

/**
 * A reference as a host runs it: what it names, its key, its options, and a carried module's seed key and phases.
 * 🚧 A check's words (`label`, GM 2026-10-23, G2 ★1) decide nothing and were never said before the sections: left out.
 */
const running = (r: FunctionRef) => {
	const { label: _words, ...options } = (r.options ?? {}) as Record<string, unknown>
	const said = r.ref === 'core:function/check@1' ? (Object.keys(options).length ? options : undefined) : r.options
	return {
		ref: r.ref,
		key: r.key,
		options: said,
		...(r.module ? { seedKey: r.module.seedKey, phases: r.module.phases } : {}),
	}
}

/** Every way a table may set the ruleset: its defaults, each preset, each single choice. */
function settingValues(decl: RulesetProps): Record<string, string>[] {
	const out: Record<string, string>[] = [{}]
	for (const p of presetsOf(decl)) out.push({ ...p.values })
	for (const [name, s] of Object.entries(settingsOf(decl))) for (const c of s.choices) out.push({ [name]: c.id })
	return out
}

/** 🚧 RF fix 8 (2026-10-23): the tags core's borrowed attributes say since — by attribute id. */
const SINCE_FIX8_TAGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
	hp: ['health'],
	level: ['level'],
	'character-class': ['class'],
	mood: ['mood'],
})

describe('Vis Itineris and Wherewithal, rebuilt in the sections, read as they did', () => {
	for (const { id, before, after } of CASES) {
		test(`${id}: declared in the sections, over core's functions, and clean`, () => {
			assert.deepEqual(rulesetFindings(id, after), [])
			for (const k of ['conventions', 'stats', 'selectors', 'repertoires', 'compendium', 'scripts', 'settings', 'presets', 'conversions'])
				assert.equal((after as unknown as Record<string, unknown>)[k], undefined, `${id} says no ${k}`)
			const refs = rulesetSections(after).functions!
			assert.ok(refs.every((r) => r.module || r.ref.startsWith('core:function/')), 'every reference names a core function or carries its own module')
			assert.ok(refs.filter((r) => r.module).every((r) => r.module!.seedKey), 'its own modules keep their seeded bodies')
		})

		test(`${id}: the conventions, under every preset and every choice`, () => {
			for (const values of settingValues(before)) {
				assert.deepEqual(normaliseRuleset(after, values).conventions, normaliseRuleset(before, values).conventions, JSON.stringify(values))
			}
		})

		test(`${id}: every section, every reference as it runs`, () => {
			const a = rulesetSections({ ...after, id })
			const b = rulesetSections({ ...before, id })
			// 🚧 RF fix 8 (2026-10-23): its borrowed attributes say their tags — what a genre plays best with is found by.
			const untagged = (list: typeof a.attributes) => (list ?? []).map((x) => (SINCE_FIX8_TAGS[x.id] ? (({ tags: _t, ...rest }) => rest)(x) : x))
			assert.deepEqual(untagged(a.attributes), b.attributes, 'attributes')
			for (const x of a.attributes ?? []) if (SINCE_FIX8_TAGS[x.id]) assert.deepEqual(x.tags, SINCE_FIX8_TAGS[x.id], x.id)
			for (const k of ['entryTypes', 'zoneTypes', 'outcomes', 'time', 'library', 'options'] as const) assert.deepEqual(a[k], b[k], k)
			// 🚧 lane G3 (2026-10-23, S3, ★I): Vis Itineris references core's rest and fall rule — rules
			// the shape before the sections never said (the crawl played them from its own constants).
			const sinceSections = new Set(['core:function/rest@1', 'core:function/at-zero-health@1'])
			assert.deepEqual(a.functions!.filter((f) => !sinceSections.has(String(f.ref))).map(running), b.functions!.map(running))
		})

		test(`${id}: what piece rules may target, the entry types it yields, its settings, what it decides and provides`, () => {
			const a = sectionsRepertoireContext(id, rulesetSections({ ...after, id }))
			const b = sectionsRepertoireContext(id, rulesetSections({ ...before, id }))
			for (const k of ['selectors', 'families', 'ownStats'] as const) assert.deepEqual([...(a[k] ?? [])].sort(), [...(b[k] ?? [])].sort(), k)
			assert.deepEqual([a.timeUnit, a.rollsDice, [...a.repertoires.keys()]], [b.timeUnit, b.rollsDice, [...b.repertoires.keys()]])
			// Read the way before the sections did: the same names, and each way a check by its own name besides.
			const legacy = rulesetContext({ ...before, id })
			const ways = new Set((rulesetSections(after).functions ?? []).filter((f) => normaliseRuleset(after).conventions.methods[f.key!]).map((f) => f.key!))
			assert.deepEqual([...a.selectors].sort(), [...new Set([...legacy.selectors, ...ways])].sort())
			assert.deepEqual([...(a.families ?? [])].sort(), [...(legacy.families ?? [])].sort())
			const derived = (p: RulesetProps) => rulesetEntryTypeDecls(_rulesetDeclOf(id, p), cat.ENTRY_UNIVERSAL_PARTS)
			assert.deepEqual(derived(after), derived(before))
			assert.deepEqual(settingsOf(after), settingsOf(before))
			assert.deepEqual(presetsOf(after), presetsOf(before))
			assert.equal(rulesetDecides(after), rulesetDecides(before))
			const provides = (p: RulesetProps) => {
				// The kinds of way it decides by, as a set: the sections list the default way first.
				const { methods, attributeTags: _byTag, tags, ...rest } = rulesetProvides(_rulesetDeclOf(id, p)) as unknown as Record<string, unknown> & { methods: string[]; tags: Set<string> }
				return { ...rest, methods: [...methods].sort(), tags: [...tags].sort() }
			}
			// 🚧 RF fix 8: what its borrowed attributes' tags add (health, level, mood) is its own addition; the rest reads as before.
			const was = provides(before)
			const now = provides(after)
			const added = new Set(Object.values(SINCE_FIX8_TAGS).flat().filter((t) => !was.tags.includes(t)))
			assert.deepEqual({ ...now, tags: now.tags.filter((t) => !added.has(t)) }, was)
		})
	}

	test('the document hashes move with the shape — recorded for the merge', () => {
		const hashes = Object.fromEntries(CASES.map(({ id, before, after }) => [id, [digest(rulesetDocumentOf(_rulesetDeclOf(id, before))), digest(rulesetDocumentOf(_rulesetDeclOf(id, after)))]]))
		// Before: the pins `rulesetSections.test` holds for the registered declarations.
		assert.deepEqual(hashes[cat.VIS_ITINERIS_RULESET_ID]![0], 'b07a6e3b8fe47be0')
		assert.deepEqual(hashes[cat.WHEREWITHAL_RULESET_ID]![0], '7cf35cc58028a81b')
		console.log('rfA2 document hashes (before → after):', JSON.stringify(hashes))
	})
})
