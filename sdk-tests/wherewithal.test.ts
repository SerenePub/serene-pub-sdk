/**
 * 🚧 Wherewithal (`core:ruleset/wherewithal@1`, 2026-10-22, PLAN-rulesets-
 * authoring D3, lane M3) — core's diceless ruleset: the declaration passes
 * every finding and warns of nothing; it decides by spending (`bid`), by
 * weighing (`compare`) and by judgement (`none`, the default), never by
 * chance; its repertoires are tagged; its compendium rows are pieces (bonds
 * leave who they point towards to the holder); its seeded scripts compute
 * mettle, the strain of troubles and the price list; Story recommends it.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	getGenre,
	getRuleset,
	isEntryTypeId,
	rulesetCheckMethod,
	rulesetDifficultyBands,
	rulesetEntryable,
	rulesetEntryTypeId,
	rulesetFindings,
	rulesetFit,
	rulesetProvides,
	rulesetWarnings,
	slotPickableIn,
	CORE_FUNCTION_IDS,
	functionRefKey,
	rulesetConventionsFor,
	rulesetSections,
	type RulesetProps,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const W = cat.wherewithalRuleset
/** 🚧 Its sections (2026-10-23): the registry declares it in them (`WHEREWITHAL_RULESET`). */
const S = rulesetSections(W)
/** A function reference by its key. */
const ref = (key: string) => S.functions!.find((f) => functionRefKey(f) === key)
const reasons = (fs: readonly string[]) => fs.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1])
const runScript = (seedRow: { source: string }, value: unknown) =>
	// eslint-disable-next-line no-new-func
	new Function('value', seedRow.source)(JSON.parse(JSON.stringify(value)))

describe('Wherewithal — the declaration', () => {
	test('registers under its id, passes every finding and warns of nothing', () => {
		assert.equal(W.id, 'core:ruleset/wherewithal@1')
		assert.equal(getRuleset(W.id), W)
		assert.deepEqual(rulesetFindings(W.id, W), [])
		assert.deepEqual(rulesetWarnings(W), [])
		assert.equal(W.template, undefined)
		assert.deepEqual(cat.CORE_RULESETS.map((r) => r.id), ['core:ruleset/freeform@1', 'core:ruleset/vis-itineris@1', W.id])
	})

	test('a voice per rigour, each within its budget', () => {
		for (const r of ['prose', 'mechanics', 'scripts'] as const) {
			const v = W.voice![r]!
			assert.ok(v && v.length <= 240, `${r}: ${v?.length}`)
			assert.doesNotMatch(v, /\broll(s|ed)?\b/i, `${r} asks for no roll`)
		}
	})

	test('three spends, a contest and the judgement it falls back to — no chance, no dice', () => {
		// 🚧 Read through the sections (2026-10-23): the ways in order, the default first.
		const conv = rulesetConventionsFor(W)
		const methods = conv.methods!
		assert.deepEqual(
			Object.entries(methods).map(([k, m]) => [k, m.kind]),
			[['judgement', 'none'], ['dare', 'bid'], ['sway', 'bid'], ['make-do', 'bid'], ['contest', 'compare']],
		)
		assert.equal(conv.defaultMethod, 'judgement')
		assert.equal(conv.dice, undefined)
		assert.deepEqual(
			['dare', 'sway', 'make-do'].map((k) => (methods[k] as { resource: string }).resource),
			['wherewithal-nerve', 'wherewithal-favour', 'wherewithal-provisions'],
		)
		// A spend of two carries a risk; three carries it clean.
		assert.deepEqual((methods.dare as { costs: unknown }).costs, [
			{ spend: 0, band: 'short' },
			{ spend: 1, band: 'cost' },
			{ spend: 2, band: 'carried' },
			{ spend: 3, band: 'clean' },
		])
		assert.equal(rulesetCheckMethod(W, 'dare').key, 'dare')
		assert.equal(rulesetCheckMethod(W, 'contest').key, 'contest')
		assert.equal(rulesetCheckMethod(W).key, 'judgement')
		assert.equal(rulesetCheckMethod(W).method.kind, 'none')
		assert.deepEqual(rulesetDifficultyBands(W, 'contest').map((b) => b.id), ['slight', 'even', 'steep', 'towering'])
		const p = rulesetProvides(W)
		// In the sections' order (2026-10-23): the default way first.
		assert.deepEqual(p.methods, ['none', 'bid', 'compare'])
		assert.equal(p.chance, false)
		assert.equal(p.dice, false)
		assert.ok(p.tagged && p.conditions && !p.casting)
		// 🚧 RF fix 8: its borrowed mood says its tag, so a genre that plays best with a mood word finds it.
		assert.deepEqual([...p.tags].sort(), ['boon', 'condition', 'mood', 'relationship'])
	})

	test('a dice amount is refused: nothing here throws dice', () => {
		const { id: _id, ...props } = W
		const entryTypes = props.entryTypes!.map((e) =>
			e.id === 'boons' ? { ...e, mechanics: [{ verb: 'heal', on: 'use', amount: '1d6', stat: 'wherewithal-nerve' }] } : e,
		)
		assert.ok(reasons(rulesetFindings(W.id, { ...props, entryTypes } as unknown as RulesetProps)).includes('amount-needs-dice'))
	})

	test('mettle on the sheet; the pools are its own, pickable only in its sessions; mood borrowed', () => {
		const mettle = ref('mettle')!.options as { onSheet?: boolean; label?: { en: string } }
		assert.deepEqual([mettle.onSheet, mettle.label?.en], [true, 'Mettle'])
		// The contest is a way of its own, weighing mettle (the check named as its way, merged into it).
		assert.deepEqual([ref('contest')!.ref, (ref('contest')!.options as { base?: string }).base], [CORE_FUNCTION_IDS.compare, 'mettle'])
		assert.deepEqual(S.attributes!.map((a) => [a.slot, a.borrowed ?? false]), [
			['core:slot/wherewithal-nerve@1', false],
			['core:slot/wherewithal-favour@1', false],
			['core:slot/wherewithal-provisions@1', false],
			['core:slot/mood@1', true],
		])
		for (const slot of cat.WHEREWITHAL_OWN_SLOTS) {
			assert.equal(slotPickableIn(slot, W.id), true)
			assert.equal(slotPickableIn(slot, cat.visItinerisRuleset.id), false)
		}
		assert.equal(cat.rulesets.core.wherewithal.cast.nerve, cat.wherewithalNerveSlot)
		assert.equal(cat.rulesets.core.wherewithal.cast.health, cat.rulesets.common.cast.health)
		assert.deepEqual(W.plays, ['core:vocabulary/common@1'])
	})

	test('bonds are relational and tagged; troubles and boons are entryable', () => {
		assert.deepEqual(
			S.entryTypes!.map((r) => [r.id, r.tags, !!r.relational, rulesetEntryable(W).includes(r.id)]),
			[
				['bonds', ['relationship'], true, false],
				['troubles', ['condition'], false, true],
				['boons', ['boon'], false, true],
			],
		)
		assert.deepEqual(rulesetEntryable(W), ['troubles', 'boons'])
		for (const r of rulesetEntryable(W)) assert.ok(isEntryTypeId(rulesetEntryTypeId(W.id, r)), r)
	})

	test('a small compendium of its own: five bonds (naming no one), six troubles, five boons', () => {
		const rows = W.library!.rows
		assert.deepEqual(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])), { bonds: 5, troubles: 6, boons: 5 })
		assert.deepEqual(W.library!.source, { document: 'Wherewithal (Serene Pub)', licence: 'Apache-2.0' })
		for (const b of rows.bonds!) assert.equal((b.piece as { towards?: unknown }).towards, undefined, b.id)
		// Every other part of a row is still held to its repertoire's piece.
		const { id: _id, ...props } = W
		const badWeight = { ...props, library: { ...props.library!, rows: { ...rows, troubles: [{ ...rows.troubles![0]!, piece: { ...rows.troubles![0]!.piece, weight: 'crushing' } }] } } }
		assert.ok(reasons(rulesetFindings(W.id, badWeight as unknown as RulesetProps)).includes('bad-row'), 'a row is still a piece of its repertoire')
	})

	test('Story recommends it beside Freeform and Vis Itineris; it fits Story, the Lair and Chat, and not the crawl', () => {
		assert.ok((getGenre('core:genre/story')!.rulesets as { recommended: readonly string[] }).recommended.includes(W.id))
		assert.equal(rulesetFit(getGenre('core:genre/story'), W).rating, 'perfect')
		assert.equal(rulesetFit(getGenre('core:genre/lair'), W).rating, 'perfect')
		assert.equal(rulesetFit(getGenre('core:genre/chat'), W).rating, 'great')
		const crawl = rulesetFit(getGenre('core:genre/dungeon-crawler'), W)
		assert.equal(crawl.rating, 'poor')
	})
})

describe('Wherewithal — its seeded scripts (derived, effects, render)', () => {
	test('each is seeded and named by the phase it runs at', () => {
		const keys = new Set(cat.CORE_SCRIPTS.map((s) => s.seedKey))
		for (const s of cat.WHEREWITHAL_SCRIPTS) assert.ok(keys.has(s.seedKey), s.seedKey)
		assert.deepEqual(
			S.functions!.filter((f) => f.module).map((f) => [f.module!.phases![0], f.module!.seedKey]),
			[
				['effects', 'core:script/wherewithal-strain'],
				['derived', 'core:script/wherewithal-derive'],
				['render', 'core:script/wherewithal-render'],
			],
		)
	})

	test('derived: mettle is the best pool plus a steady bond each, at most two; the reserve is all three', () => {
		const env = (bonds: string[]) => ({
			phase: 'derived',
			owner: { key: 'character:1', name: 'Ann' },
			values: { 'wherewithal-nerve': 2, 'wherewithal-favour': 4, 'wherewithal-provisions': 1 },
			pieces: { bonds: bonds.map((footing) => ({ name: 'x', footing })) },
		})
		assert.deepEqual(runScript(cat.WHEREWITHAL_DERIVE_SCRIPT, env([])).values, { mettle: 4, reserve: 7 })
		assert.deepEqual(runScript(cat.WHEREWITHAL_DERIVE_SCRIPT, env(['steady', 'strained'])).values, { mettle: 5, reserve: 7 })
		const three = runScript(cat.WHEREWITHAL_DERIVE_SCRIPT, env(['steady', 'steady', 'steady']))
		assert.deepEqual(three.values, { mettle: 6, reserve: 7 })
		assert.match(three.explain, /\+ 2 \(steady bonds\)/)
	})

	test('effects: two troubles wear someone thin — a contest a step down, and a rider; an empty pool is a rider', () => {
		const out = runScript(cat.WHEREWITHAL_STRAIN_SCRIPT, {
			phase: 'effects',
			owner: { key: 'character:1', name: 'Ann' },
			values: { 'wherewithal-nerve': 0, 'wherewithal-favour': 3, 'wherewithal-provisions': 2 },
			pieces: { troubles: [{ name: 'Hurt' }, { name: 'Hunted' }] },
			events: [],
		})
		assert.deepEqual(out.adjust, [{ target: 'contest', by: -1 }])
		assert.deepEqual(out.riders, ['Ann is worn thin: 2 troubles weigh on every contest.', 'Ann is out of nerve: none can be spent until it is restored.'])
		const calm = runScript(cat.WHEREWITHAL_STRAIN_SCRIPT, { owner: { name: 'Bo' }, values: { 'wherewithal-nerve': 1 }, pieces: { troubles: [{ name: 'Shaken' }] } })
		assert.deepEqual([calm.adjust, calm.riders], [[], []])
	})

	test('render: the price list, from the declared costs and degrees, after the voice', () => {
		const out = runScript(cat.WHEREWITHAL_RENDER_SCRIPT, { phase: 'render', blocks: { voice: 'The voice.' }, outcomes: [] })
		assert.equal(out.blocks.voice, 'The voice. What a spend buys: 1, it holds, at a cost; 2, it carries; 3, it carries clean.')
		assert.equal(runScript(cat.WHEREWITHAL_RENDER_SCRIPT, { blocks: {} }), null)
	})
})
