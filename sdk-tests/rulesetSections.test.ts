/**
 * 🚧 The seven sections (PLAN-rulesets-functions D2, R9; 2026-10-23).
 *
 *  · From scratch is `{ name }`, and reads exactly as no rules at all.
 *  · A ruleset in sections registers: its own attributes' slots, its entry
 *    types, its sheet.
 *  · ⏳ Every shape before the sections reads into them (`rulesetSections`),
 *    the reading is idempotent and reads back (`normaliseConventions`), and
 *    what a data upgrade persists (`rulesetInSections`) is a clean ruleset.
 *  · Core's declarations did not move: Vis Itineris, Wherewithal, Freeform
 *    and the three templates hash as they did before the sections.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
	getRepertoire,
	rulesetContext,
	rulesetSelectors,
	canonicalize,
	checkMethodKindOfFunction,
	CARRIED_ZONE_TYPE,
	CHECK_METHOD_FUNCTIONS,
	CORE_FUNCTION_IDS,
	DEFAULT_DEGREES,
	declaresSections,
	defineRuleset,
	defineStoredRuleset,
	getAttributeSlot,
	getRuleset,
	jsonSchemaOf,
	normaliseConventions,
	normaliseRuleset,
	playtestFindings,
	reidRulesetDocument,
	rulesetAttributeSlotId,
	rulesetDecides,
	rulesetDocumentOf,
	rulesetEntryTypeDecls,
	rulesetFindings,
	rulesetInSections,
	rulesetProvides,
	rulesetSections,
	rulesetTemplates,
	rulesetWarnings,
	rulesetZoneTypes,
	slotPickableIn,
	type RulesetDecl,
	type RulesetProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const reasons = (findings: readonly string[]): string[] => findings.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1] ?? f)
const has = (findings: readonly string[], reason: string) =>
	assert.ok(reasons(findings).includes(reason), `expected [${reason}] in:\n${findings.join('\n')}`)
const digest = (v: unknown) => createHash('sha256').update(canonicalize(v as never)).digest('hex').slice(0, 16)

describe('from scratch is truly from scratch (R9)', () => {
	test('{ name } registers, and carries nothing', () => {
		const rs = defineRuleset('acme.sec:ruleset/scratch@1', { name: 'Scratch' })
		assert.equal(getRuleset(rs.id), rs)
		assert.deepEqual(rulesetFindings(rs.id, { name: 'Scratch' }), [])
		assert.deepEqual(rulesetSections(rs), {})
		assert.deepEqual(rulesetInSections(rs), { name: 'Scratch' })
		assert.equal(rulesetDecides(rs), false)
		const p = rulesetProvides(rs)
		assert.deepEqual([p.slots.size, p.pieces.size, p.methods, p.dice, p.chance, p.decides], [0, 0, [], false, false, false])
		// What a host reads: no ways to decide, no time; the degrees are the host's fallback, not the ruleset's.
		const n = normaliseRuleset(rs)
		assert.deepEqual(n.conventions.methods, {})
		assert.equal(n.conventions.time, undefined)
		assert.equal(n.conventions.degrees, DEFAULT_DEGREES)
		assert.deepEqual(n.sections, {})
		assert.deepEqual(rulesetWarnings(rs), [])
		// The carried list is the host's default zone type, not the ruleset's.
		assert.deepEqual(rulesetZoneTypes(rs), [CARRIED_ZONE_TYPE])
		// Its document carries no empty lists from the shape before the sections.
		assert.deepEqual(rulesetDocumentOf(rs), { name: 'Scratch', id: rs.id, version: '1.0.0' })
	})

	test('a voice is optional; said, its floor is the prose line', () => {
		assert.deepEqual(rulesetFindings('acme.sec:ruleset/v@1', { name: 'V', voice: { prose: 'Plain.' } }), [])
		has(rulesetFindings('acme.sec:ruleset/v@1', { name: 'V', voice: { mechanics: 'Numbers.' } }), 'missing-voice')
	})
})

/** A romance in sections: three attributes with their sentences, an entry type, two zone types, a way to decide. */
const HOLLOW: RulesetProps = {
	name: 'Hollow Hearts',
	attributes: [
		{ id: 'affection', name: 'Affection', kind: 'number', bounds: { min: 0, max: 10 }, start: 5, visibility: 'holder', changedBy: ['rules', 'gm'], tags: ['relationship'], prose: 'How much someone likes you.', shownAs: 'bar' },
		{ id: 'nerve', name: 'Nerve', kind: 'pool', bounds: { max: 3 }, tags: ['resource'], prose: 'Spent to do something brave; it comes back each morning.', shownAs: 'pips' },
		{ id: 'mood', name: 'Mood', kind: 'label', of: ['shy', 'warm', 'guarded', 'giddy'], prose: 'The mood they are in right now.', shownAs: 'badge' },
	],
	entryTypes: [
		{ id: 'keepsakes', name: 'Keepsakes', traits: true, fields: { from: { type: 'string', label: 'From' } }, tags: ['gift'], prose: 'Something given or found that means something.' },
	],
	zoneTypes: [
		{ id: 'pocket', name: 'Pocket', owners: ['cast'], holds: ['keepsakes'], visibility: 'holder', prose: 'What someone keeps to themselves.' },
		{ id: 'shelf', name: 'Shelf', owners: ['cast', 'location'], holds: ['keepsakes'], limit: 6, visibility: CORE_FUNCTION_IDS.samePlace, prose: 'Keepsakes on display.' },
	],
	functions: [{ ref: CORE_FUNCTION_IDS.compare, key: 'confession', options: { bands: [{ id: 'even', label: 'Even', target: 7, default: true }] } }],
	outcomes: [
		{ id: 'cooled', label: 'Cooled', five: 'fail' },
		{ id: 'warmed', label: 'Warmed', five: 'success', from: 0 },
	],
	library: { source: { document: 'Hollow Hearts', licence: 'CC0-1.0' }, rows: { keepsakes: [{ id: 'cinema-stub', version: '1', piece: { name: 'A cinema stub', description: 'From the first night out.' } }] } },
	options: {
		fields: { pace: { type: 'enum', label: 'Pace', members: [{ key: 'slow', label: 'Slow burn' }, { key: 'quick', label: 'Quick' }], default: 'slow', reach: 'owner' } },
		presets: [{ id: 'gentle', label: 'Gentle', values: { pace: 'slow' } }],
	},
}

describe('a ruleset in sections', () => {
	test('registers: its own attributes are slots of its own; its entry types derive', () => {
		assert.deepEqual(rulesetFindings('jody:ruleset/hollow-hearts@1', HOLLOW), [])
		const rs = defineRuleset('jody:ruleset/hollow-hearts@1', HOLLOW)
		const aff = getAttributeSlot(rulesetAttributeSlotId(rs.id, 'affection'))!
		assert.equal(aff.id, 'jody.hollow-hearts:slot/affection@1')
		assert.deepEqual([aff.type, aff.config, aff.default, aff.descriptor, aff.earshot, aff.appliesTo], ['integer', { min: 0, max: 10 }, 5, 'How much someone likes you.', 'holder', ['cast']])
		const nerve = getAttributeSlot(rulesetAttributeSlotId(rs.id, 'nerve'))!
		assert.deepEqual([nerve.type, nerve.config, nerve.default], ['integer', { min: 0, max: 3 }, 3])
		const mood = getAttributeSlot(rulesetAttributeSlotId(rs.id, 'mood'))!
		assert.deepEqual([mood.type, mood.config], ['enum', { of: ['shy', 'warm', 'guarded', 'giddy'] }])
		// Its own, so pickable only in its sessions.
		assert.equal(slotPickableIn(nerve, rs.id), true)
		assert.equal(slotPickableIn(nerve, 'core:ruleset/freeform@1'), false)
		// The sheet: one key per attribute.
		assert.deepEqual(Object.keys((jsonSchemaOf(rs) as { properties: object }).properties).sort(), ['affection', 'mood', 'nerve'])
		// An entry type IS an entry type: name, description, traits, then its own fields.
		const [et] = rulesetEntryTypeDecls(rs, cat.ENTRY_UNIVERSAL_PARTS)
		assert.equal(et!.id, 'jody:entry/hollow-hearts.keepsakes@1')
		assert.deepEqual(Object.keys(et!.fields!).slice(0, 4), ['name', 'description', 'traits', 'from'])
		// It decides by a comparison; outcomes read back as its degrees, its way as a check method.
		assert.equal(rulesetDecides(rs), true)
		const n = normaliseRuleset(rs)
		assert.deepEqual(Object.keys(n.conventions.methods), ['confession'])
		assert.equal(n.conventions.methods.confession!.kind, 'compare')
		assert.equal(n.conventions.defaultMethod, 'confession')
		assert.deepEqual(n.conventions.degrees.bands.map((b) => b.id), ['cooled', 'warmed'])
		const p = rulesetProvides(rs)
		assert.deepEqual([[...p.pieces], p.tags.has('gift'), p.tags.has('resource'), p.decides, p.chance, p.methods], [['keepsakes'], true, true, true, false, ['compare']])
		assert.deepEqual(rulesetZoneTypes(rs).map((z) => z.id), ['pocket', 'shelf', 'carried'])
		// Its options are settings a session may hold.
		const docOf = rulesetDocumentOf(rs)
		assert.equal('stats' in docOf || 'repertoires' in docOf, false)
	})

	test('🚧 M1: its entry types are filed as repertoires; the shape before the sections is read back, unenumerated', () => {
		const rs = defineRuleset('jody:ruleset/hollow-hearts@1', HOLLOW)
		// A list slot's write reaches an entry type by address, as a repertoire's did.
		assert.equal(getRepertoire(`${rs.id}#keepsakes`)?.id, 'keepsakes')
		assert.deepEqual(getRepertoire(`${rs.id}#keepsakes`)?.tags, HOLLOW.entryTypes![0]!.tags)
		// The read-back: stats by slot, repertoires, checks and ways as selectors, the library as compendium …
		assert.deepEqual(rs.stats.map((s) => s.id), HOLLOW.attributes!.map((a) => rulesetAttributeSlotId(rs.id, a.id)))
		assert.deepEqual(rs.repertoires.map((r) => r.id), ['keepsakes'])
		assert.deepEqual(rulesetSelectors(rs).get('confession'), { kind: 'check', method: 'confession' })
		assert.equal(rs.compendium, HOLLOW.library)
		assert.ok(rulesetContext(rs).repertoires.has('keepsakes'))
		// … never said: not enumerated, not hashed, not in its document, never judged.
		assert.deepEqual(Object.keys(rs).filter((k) => ['stats', 'repertoires', 'selectors', 'compendium'].includes(k)), [])
		assert.deepEqual(rulesetFindings(rs.id, rs), [])
	})

	test('🚧 M1: handbook pages and saved tests ride along — kept in sections, checked, never judged stale', () => {
		const handbook = [{ title: 'A note', body: 'Be kind.' }]
		const playtests = [{ name: 'Pier', party: [{ name: 'Wren', stats: { gone: 1 } }], situation: 'Dusk.', change: null }]
		assert.deepEqual(rulesetFindings('jody:ruleset/notes@1', { ...HOLLOW, handbook, playtests }), [])
		assert.deepEqual(rulesetInSections({ ...HOLLOW, handbook, playtests }).handbook, handbook)
		assert.deepEqual(rulesetInSections({ ...HOLLOW, handbook, playtests }).playtests, playtests)
		has(rulesetFindings('jody:ruleset/notes@1', { ...HOLLOW, handbook: [{ title: 'A', body: '' }, { title: 'a', body: '' }] }), 'bad-handbook')
		has(rulesetFindings('jody:ruleset/notes@1', { ...HOLLOW, handbook: 'x' as never }), 'bad-handbook')
		has(rulesetFindings('jody:ruleset/notes@1', { ...HOLLOW, playtests: [{ name: 'A', party: [], change: null }] as never }), 'bad-playtests')
		has(rulesetFindings('jody:ruleset/notes@1', { ...HOLLOW, playtests: [{ name: 'A', party: [{ name: 'W' }], change: null, rigour: 'loud' }] as never }), 'bad-playtests')
	})

	test('a stored ruleset republished without an attribute withdraws its slot', () => {
		const id = 'mara:ruleset/tea-room@1'
		const tea = { name: 'Tea room', attributes: [{ id: 'warmth', name: 'Warmth', kind: 'tally' as const, prose: 'Kindness counted.' }, { id: 'gossip', name: 'Gossip', kind: 'list' as const, bounds: { max: 5 }, prose: 'What is said.' }] }
		defineStoredRuleset(id, tea, { userId: 3 })
		assert.ok(getAttributeSlot(rulesetAttributeSlotId(id, 'gossip')))
		assert.equal(getAttributeSlot(rulesetAttributeSlotId(id, 'warmth'))!.default, 0)
		defineStoredRuleset(id, { ...tea, attributes: [tea.attributes[0]!] }, { userId: 3 })
		assert.equal(getAttributeSlot(rulesetAttributeSlotId(id, 'gossip')), undefined)
		assert.ok(getAttributeSlot(rulesetAttributeSlotId(id, 'warmth')))
	})

	test('each refusal is named', () => {
		const f = (over: Partial<RulesetProps>) => rulesetFindings('jody:ruleset/f@1', { ...HOLLOW, ...over })
		const attrs = HOLLOW.attributes!
		has(f({ attributes: [...attrs, attrs[0]!] }), 'duplicate-attribute')
		has(f({ attributes: [{ id: 'nerve', name: 'Nerve', kind: 'pool', prose: 'p' }] }), 'bad-bounds')
		has(f({ attributes: [{ id: 'x', name: 'X', kind: 'number', of: ['a'], prose: 'p' }] }), 'bad-attribute')
		has(f({ attributes: [{ id: 'x', name: 'X', kind: 'number', carriedBy: ['world'], visibility: 'holder', prose: 'p' }] }), 'bad-visibility')
		has(f({ attributes: [{ id: 'x', name: 'X', kind: 'number', prose: 'p', start: 'lots' }] }), 'bad-start')
		has(f({ attributes: [{ id: 'x', name: 'X', kind: 'number' }] }), 'missing-prose')
		has(f({ attributes: [{ id: 'x', name: 'X', kind: 'dice' as never, prose: 'p' }] }), 'bad-attribute-kind')
		has(f({ attributes: [{ id: 'x', slot: 'acme.sec:slot/ghost@1' }] }), 'unknown-stat')
		has(f({ attributes: [{ id: 'x', name: 'X', kind: 'number', prose: 'p', changedBy: ['anyone' as never] }] }), 'bad-changed-by')
		has(f({ zoneTypes: [{ id: 'hand', name: 'Hand', owners: ['cast'], holds: ['cards'], prose: 'p' }] }), 'bad-holds')
		has(f({ zoneTypes: [{ id: 'bag', name: 'Bag', owners: ['cast'], holds: '*', limit: { attribute: 'strength' }, prose: 'p' }] }), 'bad-limit')
		has(f({ outcomes: [{ id: 'x', label: 'X', five: 'great' as never }] }), 'bad-outcome')
		has(f({ time: { unit: 'week' as never } }), 'bad-time-unit')
		has(f({ library: { source: { document: 'd', licence: 'l' }, rows: { cards: [] } } }), 'unknown-entry-type')
		has(f({ options: { fields: { pace: { type: 'enum', of: ['a', 'b'], label: 'Pace', reach: 'everyone' as never } } } }), 'bad-setting')
		has(f({ options: { ...HOLLOW.options, presets: [{ id: 'p', label: 'P', values: { speed: 'fast' } }] } }), 'bad-preset')
		// A section and the shape it replaced, both said.
		has(f({ stats: [{ id: 'core:slot/mood@1' }] }), 'legacy-beside-section')
		// ⏳ An empty list says nothing: a registered declaration always carries `stats` and `repertoires` (A2, 2026-10-23).
		assert.ok(!reasons(f({ stats: [], repertoires: [] })).includes('legacy-beside-section'))
		has(f({ time: { unit: 'day' }, conventions: { time: { unit: 'day' } } }), 'legacy-beside-section')
	})

	test('🚧 RF fix 2: a text attribute is free prose per holder — a text slot, no bounds; required is a boolean', () => {
		const id = 'jody:ruleset/vows@1'
		const vow = { id: 'vow', name: { en: 'Vow' }, kind: 'text' as const, start: 'To see the sea once.', required: true, prose: 'Vow: what someone has sworn to do, in their own words.' }
		assert.deepEqual(rulesetFindings(id, { name: { en: 'Vows' }, attributes: [vow] }), [])
		const f = (over: object) => rulesetFindings(id, { name: { en: 'Vows' }, attributes: [{ ...vow, ...over } as never] })
		has(f({ bounds: { max: 3 } }), 'bad-bounds')
		has(f({ of: ['a'] }), 'bad-attribute')
		has(f({ required: 'yes' }), 'bad-attribute')
		const props = rulesetSections({ attributes: [vow] }).attributes!.map((a) => a.kind)
		assert.deepEqual(props, ['text'])
		const decl = defineRuleset(id, { name: { en: 'Vows' }, attributes: [vow] })
		const slot = getAttributeSlot(rulesetAttributeSlotId(decl.id, 'vow'))
		assert.equal(slot?.type, 'text')
		assert.equal(slot?.default, 'To see the sea once.')
		// What a model writes for it is words.
		const vowSchema = (jsonSchemaOf(decl) as { properties: Record<string, { type?: unknown }> }).properties.vow
		assert.equal(vowSchema?.type, 'string')
	})
})

/** The legacy fixture of rulesets.test — every shape before the sections at once. */
describe('⏳ the shapes before the sections read into them', () => {
	const legacy: RulesetDecl[] = [cat.freeformRuleset, cat.visItinerisRuleset, cat.wherewithalRuleset]
	const templates = rulesetTemplates()

	test('stats → attributes; repertoires → entry types; compendium → library', () => {
		// Those still in the shape before the sections (the templates are in sections since 2026-10-23, A2).
		for (const d of [...legacy, ...templates.map((t) => t.ruleset)].filter((x) => !declaresSections(x))) {
			const s = rulesetSections(d)
			assert.deepEqual(s.attributes?.map((a) => a.slot) ?? [], d.stats.map((e) => e.id), d.id)
			assert.deepEqual(s.entryTypes?.map((e) => e.id) ?? [], d.repertoires.map((r) => r.id), d.id)
			for (const e of s.entryTypes ?? []) assert.deepEqual(e.piece, d.repertoires.find((r) => r.id === e.id)!.piece, `${d.id} ${e.id}`)
			assert.equal(s.library, d.compendium, d.id)
		}
	})

	test('ways to decide → deciding functions, the default first; checks, worked-out values and tallies → core references; scripts → carried modules', () => {
		const vi = rulesetSections(cat.visItinerisRuleset)
		const viRefs = vi.functions!
		assert.equal(viRefs[0]!.ref, CHECK_METHOD_FUNCTIONS['die-target'])
		assert.equal(viRefs[0]!.key, 'die')
		// Natural faces ride with the first die (they read the degrees ruleset-wide).
		assert.ok((viRefs[0]!.options as { natural?: unknown }).natural !== undefined || cat.VIS_ITINERIS_CONVENTIONS.degrees?.natural === undefined)
		const checks = viRefs.filter((r) => r.ref === CORE_FUNCTION_IDS.check)
		assert.ok(checks.length > 5)
		const derived = viRefs.filter((r) => r.ref === CORE_FUNCTION_IDS.workedOut)
		assert.ok(derived.length > 0)
		const scripts = viRefs.filter((r) => r.module)
		assert.deepEqual(scripts.map((r) => [r.module!.seedKey, r.module!.phases]), [
			['core:script/vis-itineris-level-up', ['effects']],
			['core:script/vis-itineris-derive', ['derived']],
			['core:script/vis-itineris-bulk', ['derived']],
			['core:script/vis-itineris-heighten-spell', ['before']],
		])
		assert.equal(scripts[1]!.ref, 'core:function/vis-itineris-derive@1')
		// Wherewithal: its default (judgement) first, then its ways in order; a check named as its way is
		// that way's use — the contest weighs mettle on the compare reference itself.
		const ww = rulesetSections(cat.wherewithalRuleset).functions!
		const ways = ww.filter((r) => checkMethodKindOfFunction(r.ref))
		assert.equal(ways[0]!.key, 'judgement')
		assert.equal(ways[0]!.ref, CORE_FUNCTION_IDS.judge)
		assert.deepEqual(ways.map((r) => r.key).sort(), ['contest', 'dare', 'judgement', 'make-do', 'sway'])
		assert.equal((ways.find((r) => r.key === 'contest')!.options as { base?: string }).base, 'mettle')
		assert.equal(ww.filter((r) => r.ref === CORE_FUNCTION_IDS.check).length, 0)
	})

	test('degrees → outcomes; time, turns, rests → time; settings and presets → options', () => {
		// Vis Itineris's parts in the shape before the sections (it is registered in them since 2026-10-23).
		const vi: RulesetProps = { name: { en: 'Vis Itineris' }, conventions: cat.VIS_ITINERIS_CONVENTIONS, settings: cat.VIS_ITINERIS_SETTINGS, presets: cat.VIS_ITINERIS_PRESETS }
		const s = rulesetSections(vi)
		assert.deepEqual(s.outcomes!.map((o) => o.id), vi.conventions!.degrees!.bands.map((b) => b.id))
		assert.deepEqual([s.time!.unit, s.time!.rests!.map((r) => r.id)], [vi.conventions!.time.unit, vi.conventions!.rest!.map((r) => r.id)])
		const fields = s.options!.fields!
		assert.deepEqual(Object.keys(fields), Object.keys(vi.settings!))
		for (const [k, setting] of Object.entries(vi.settings!)) {
			assert.equal(fields[k]!.type, 'enum')
			assert.deepEqual(fields[k]!.members!.map((m) => m.key), setting.choices.map((c) => c.id))
			assert.equal(fields[k]!.default, setting.default)
			for (const c of setting.choices) assert.deepEqual(s.options!.lays?.[k]?.[c.id]?.conventions, c.conventions, `${k}.${c.id}`)
		}
		assert.equal(s.options!.presets, vi.presets)
		// Freeform's degrees are its outcome words; a ruleset that says none has none (DEFAULT_DEGREES is the host's).
		assert.deepEqual(rulesetSections(cat.freeformRuleset).outcomes!.map((o) => o.id), cat.freeformRuleset.conventions!.degrees!.bands.map((b) => b.id))
		assert.equal(rulesetSections({ name: 'X', conventions: { time: { unit: 'day' } } }).outcomes, undefined)
		assert.equal(rulesetSections(normaliseRuleset({ name: 'X', conventions: { time: { unit: 'day' } } })).outcomes, undefined)
	})

	test('idempotent, read back, and what a data upgrade persists is a clean ruleset that decides and provides as before', () => {
		for (const d of [...legacy, ...templates.map((t) => t.ruleset)]) {
			const s = rulesetSections(d)
			const upgraded = rulesetInSections(d)
			assert.equal('stats' in upgraded || 'conventions' in upgraded || 'repertoires' in upgraded, false, d.id)
			assert.deepEqual(rulesetSections(upgraded), s, `${d.id} idempotent`)
			assert.deepEqual(rulesetSections({ ...upgraded, ...s }), s, `${d.id} sections in, sections out`)
			// The conventions today's readers take, read back from the sections.
			const before = normaliseConventions(d).conventions
			const after = normaliseConventions(upgraded).conventions
			assert.deepEqual(after.methods, before.methods, `${d.id} methods`)
			assert.equal(after.defaultMethod, before.defaultMethod, `${d.id} default`)
			assert.deepEqual(after.degrees, before.degrees, `${d.id} degrees`)
			assert.deepEqual(after.time, before.time, `${d.id} time`)
			assert.deepEqual([after.rest, after.actions, after.bonuses, after.casting], [before.rest, before.actions, before.bonuses, before.casting], `${d.id} rest, actions, bonuses, casting`)
			// Clean, under its own id (the slots it names are declared).
			const id = d.template ? d.id.replace('template-', 'copy-') : d.id
			assert.deepEqual(rulesetFindings(id, { ...upgraded, ...(d.template ? { template: undefined } : {}) }), [], `${d.id} findings`)
			// It decides and provides as it did.
			assert.equal(rulesetDecides(upgraded), rulesetDecides(d), `${d.id} decides`)
			const [p, q] = [rulesetProvides(d), rulesetProvides({ ...upgraded, id } as never)]
			assert.deepEqual([[...q.pieces], [...q.methods].sort(), q.dice, q.chance, q.conditions, q.casting, [...q.tags].sort(), [...q.slots].sort()], [[...p.pieces], [...p.methods].sort(), p.dice, p.chance, p.conditions, p.casting, [...p.tags].sort(), [...p.slots].sort()], `${d.id} provides`)
			// Normalised, the sections ride beside the conventions — and normalising twice reads the same.
			const n = normaliseRuleset(d)
			assert.deepEqual(n.sections, s)
			assert.deepEqual(normaliseRuleset(n), n)
		}
		// The shipped rulesets decide as the app's how-strict reading did: Freeform no, the others yes.
		assert.deepEqual(legacy.map(rulesetDecides), [false, true, true])
	})

	test('a copy in sections registers beside the original', () => {
		const id = 'acme.sec:ruleset/wherewithal-copy@1'
		const upgraded = rulesetInSections(cat.wherewithalRuleset)
		// A copy converts to itself (as `reidRulesetDocument` re-targets a copy's conversions).
		const options = upgraded.options && { ...upgraded.options, conversions: upgraded.options.conversions?.map((c) => ({ ...c, to: id })) }
		const copy = defineRuleset(id, { ...upgraded, options })
		assert.equal(rulesetDecides(copy), true)
		assert.deepEqual(rulesetEntryTypeDecls(copy, cat.ENTRY_UNIVERSAL_PARTS).map((e) => e.fields), rulesetEntryTypeDecls(cat.wherewithalRuleset, cat.ENTRY_UNIVERSAL_PARTS).map((e) => e.fields))
		// Re-owned for a new owner: its carried modules and the slots it names.
		const doc = reidRulesetDocument(rulesetDocumentOf(copy), 'mara:ruleset/my-wherewithal@1')
		for (const f of doc.functions!.filter((x) => x.module)) assert.ok(f.ref.startsWith('mara:function/') && f.module!.id === f.ref, f.ref)
		for (const a of doc.attributes!) assert.equal(a.borrowed, true, a.id)
	})

	test("a playtest names a sections ruleset's attributes by their own names", () => {
		const scene = { party: [{ name: 'Wren', stats: { affection: 6, nerve: 2 } }], situation: 'A confession at the pier.', change: { owner: 'Wren', op: 'confess', check: 'confession' } }
		assert.deepEqual(playtestFindings('jody:ruleset/hollow-hearts@1', HOLLOW, scene), [])
		has(playtestFindings('jody:ruleset/hollow-hearts@1', HOLLOW, { ...scene, change: { ...scene.change, check: 'charm' } }), 'bad-playtest')
	})
})

describe("core's declarations did not move (hash proof)", () => {
	test('Freeform hashes as before the sections; Vis Itineris, Wherewithal and the templates as rebuilt in them', () => {
		// Moved 2026-10-23 (merge M1): Vis Itineris and Wherewithal are declared in the seven sections
		// (lane A2; `catalogueParity` proves they read as before, and the shape before them still hashes
		// 'b07a6e3b8fe47be0' / '7cf35cc58028a81b'). (was 'b07a6e3b8fe47be0', '7cf35cc58028a81b')
		// Moved 2026-10-23 (genres GM): Vis Itineris references core's rest and fall rule (lane G3, S3, ★I) and
		// gives its checks their words (`label`, G2 ★1). (was '4ade3f8c8d3caf8b')
		// 🚧 Moved 2026-10-23 (RF fix 8: attributes are the rules', plays best with by tag): Vis Itineris's
		// borrowed level, class and health say their tags (`level`, `class`, `health`); Wherewithal's
		// borrowed mood says `mood`; Freeform declares no attributes (its borrowed mood retired). Proven:
		// with exactly those put back, the three hash to the pins before ('75f4c4c69cd43155' ·
		// '20b8591e6c8eef16' · '4a07f5304b800211'). Recomputed after the final build.
		assert.equal(digest(rulesetDocumentOf(cat.visItinerisRuleset)), '17daa8bfe5339da9')
		assert.equal(digest(rulesetDocumentOf(cat.wherewithalRuleset)), '92e2067a5a7b7c41')
		assert.equal(digest(rulesetDocumentOf(cat.freeformRuleset)), '37aa7a652994c13e')
		// Moved 2026-10-23: the dice templates rebuilt in the sections (lane A2), and a declaration in
		// sections no longer says empty ⏳ `stats` / `repertoires` (its read-back is unenumerated,
		// `_rulesetDeclOf`) — proven: with `stats: [], repertoires: []` put back the three hash to
		// A2's '651a6dc338c2b6f1' · '35b4ad7f515f1c82' · '1b413c63f214308e'. The four archetypes lead.
		// (was '24d96910fad17661' · '2f11c97063087b30' · '143df93a06b9da00')
		// 🚧 Moved 2026-10-23 (lane T3): Romance's standing worked out by rungs and a confession moving
		// the other side (was 'd701b6c316489773'); Workplace's footing on the grapevine (was '9166924478cc1d19').
		const t = Object.fromEntries(rulesetTemplates().map((x) => [x.id, digest(x.ruleset)]))
		assert.deepEqual(t, {
			'core:ruleset/template-romance@1': '1c63068aa2387f61',
			'core:ruleset/template-slice-of-life@1': 'bf014182155e3a75',
			'core:ruleset/template-workplace@1': 'cf3c56b86ba25141',
			'core:ruleset/template-card-game@1': 'a6a5a79e11da8c4d',
			'core:ruleset/template-d20-style@1': 'e5b6857ee61ade11',
			'core:ruleset/template-dice-pool@1': '62eef38c0250b520',
			'core:ruleset/template-diceless-pools@1': 'b6cb7c31299be352',
		})
	})
})
