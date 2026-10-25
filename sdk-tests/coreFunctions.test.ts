/**
 * 🚧 Core's function catalogue (lane A2, PLAN-rulesets-functions D1, D3, D4;
 * 2026-10-23): every module declares clean, every reserved id is declared as
 * the kind core reserved it as, every body exports exactly the handlers its
 * phases list and computes what it says — the ways byte for byte as the
 * ruleset handler's resolvers — and the shapes before sections read as
 * references these modules accept.
 *
 * Bodies are ES modules; each is imported here from a `data:` URL and its
 * handlers called with one envelope, as the app's rules sandbox calls them —
 * a seeded stream on it as `random`.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	CORE_FUNCTION_IDS,
	FUNCTION_ID_PATTERN,
	FUNCTION_PHASES,
	functionFindings,
	functionRefDecides,
	getFunction,
	jsonSchemaOf,
	NUMBER_ATTRIBUTE_KINDS,
	RESERVED_FUNCTIONS,
	rulesetInSections,
	rulesetSectionFindings,
	type DegreeCrosswalk,
	type FunctionDecl,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'
import * as F from '../core-catalog/src/functions/index.js'
import { AT_ZERO_HEALTH_JS, atZeroHealthFunction } from '../core-catalog/src/functions/atZeroHealth.js'

type Handler = (input: Record<string, unknown>, ctx?: { random: () => number; log?: (m: string) => void }) => any
const loaded = new Map<string, Record<string, Handler>>()
async function handlers(decl: FunctionDecl): Promise<Record<string, Handler>> {
	if (!decl.body) throw new Error(`${decl.id} has no body`)
	if (!loaded.has(decl.id)) loaded.set(decl.id, (await import('data:text/javascript;base64,' + Buffer.from(decl.body).toString('base64'))) as Record<string, Handler>)
	return loaded.get(decl.id)!
}
/** A stream that answers the given faces (as fractions of `sides`) in turn. */
const faces = (sides: number, ...rolled: number[]) => {
	let i = 0
	return { random: () => (rolled[i++ % rolled.length]! - 1 + 0.5) / sides }
}
/** The handlers outside the phases, and the phase each is listed under. */
const OUTSIDE: Readonly<Record<string, string>> = { decide: 'after', members: 'derived', invoke: 'effects' }

const FOURFOLD: DegreeCrosswalk = cat.VIS_ITINERIS_FOURFOLD_DEGREES
const CLASSIC: DegreeCrosswalk = cat.VIS_ITINERIS_CLASSIC_DEGREES
const W_DEGREES: DegreeCrosswalk = cat.WHEREWITHAL_DEGREES

describe('🚧 the fall rule (★I): at zero health — one roll at the door, or death saves, by the reference\'s numbers', () => {
	const Z = cat.VIS_ITINERIS_AT_ZERO_HEALTH_RULE
	// The module's own rule, as a script splices it.
	const fallOf = new Function(`${AT_ZERO_HEALTH_JS}; return atZeroHealthOf`)() as (o: unknown, face: number, tally?: unknown, saves?: boolean, steps?: number) => any
	test('declared in values, bound to health, chance — never a check, never invokable', () => {
		assert.ok(F.CORE_FUNCTION_GROUPS.values.includes(atZeroHealthFunction))
		assert.equal(atZeroHealthFunction.kind, 'value')
		assert.deepEqual(Object.keys(atZeroHealthFunction.bindings ?? {}), ['health'])
		assert.equal(atZeroHealthFunction.invokable, undefined)
		assert.equal(atZeroHealthFunction.chance, true)
		assert.deepEqual(functionFindings(atZeroHealthFunction.id, atZeroHealthFunction), [])
	})
	test('the door: at or over its target, back up; a harsher table a step higher; under it, down', () => {
		assert.deepEqual(fallOf(Z, 10), { outcome: 'survives', upOn: 1, target: 10 })
		assert.deepEqual(fallOf(Z, 9), { outcome: 'down', target: 10 })
		assert.deepEqual(fallOf(Z, 11, null, false, 1), { outcome: 'down', target: 12 })
		assert.deepEqual(fallOf(Z, 8, null, false, -1), { outcome: 'survives', upOn: 1, target: 8 })
	})
	test('death saves: passes, failures, the lowest face two failures, the highest back up at once', () => {
		assert.deepEqual(fallOf(Z, 12, { passed: 0, failed: 0 }, true), { outcome: 'dying', target: 10, passed: 1, failed: 0, saves: true })
		assert.deepEqual(fallOf(Z, 12, { passed: 2, failed: 0 }, true), { outcome: 'stable', target: 10, passed: 3, failed: 0, saves: true })
		assert.deepEqual(fallOf(Z, 1, { passed: 0, failed: 1 }, true), { outcome: 'down', target: 10, passed: 0, failed: 3, saves: true })
		assert.deepEqual(fallOf(Z, 20, { passed: 0, failed: 2 }, true), { outcome: 'survives', upOn: 1, target: 10, passed: 0, failed: 2, saves: true })
		// No saves in the options: the door, whatever is asked.
		assert.equal(fallOf({ ...Z, saves: undefined }, 12, null, true).outcome, 'survives')
	})
	test('the body answers only when asked with the face rolled: a survivor set back up on the health', async () => {
		const mod = await import(`data:text/javascript,${encodeURIComponent(atZeroHealthFunction.body!)}`)
		assert.deepEqual(mod.effects({ options: Z, bindings: { health: { id: 'hp' } }, owner: { key: 'character:4' } }), {})
		const up = mod.effects({ options: Z, bindings: { health: { id: 'hp', value: 0 } }, owner: { key: 'character:4' }, answer: { face: 15 } })
		assert.deepEqual(up.deltas, [{ owner: 'character:4', attribute: 'hp', op: 'set', value: 1, reason: 'pulled through' }])
		assert.deepEqual(mod.effects({ options: Z, bindings: { health: { id: 'hp' } }, owner: { key: 'character:4' }, answer: { face: 3 } }).deltas, undefined)
	})
})

describe('the catalogue declares clean', () => {
	test('every module: a function id, no findings, prose, a form that reads as JSON Schema', () => {
		// 49, and 🚧 the fall rule (lane G3, 2026-10-23, ★I: `at-zero-health`, in values), and 🚧 an
		// outcome that moves a number (lane T3: `outcome-moves`, in changing).
		assert.equal(F.CORE_FUNCTIONS.length, 51)
		assert.equal(new Set(F.CORE_FUNCTIONS.map((d) => d.id)).size, F.CORE_FUNCTIONS.length)
		for (const d of F.CORE_FUNCTIONS) {
			assert.match(d.id, FUNCTION_ID_PATTERN)
			assert.deepEqual(functionFindings(d.id, d), [], d.id)
			assert.equal(getFunction(d.id), d, `${d.id} is registered`)
			assert.ok(d.prose.trim().length > 20, `${d.id} says what the model reads`)
			assert.ok(jsonSchemaOf(d), d.id)
			if (d.schema) assert.ok(jsonSchemaOf(d, { part: 'schema' }), d.id)
			if (d.invokable) assert.ok(jsonSchemaOf(d, { part: 'invokable' }), d.id)
			// A role's hole in the prose names a role it declares.
			for (const hole of d.prose.match(/\{\{([a-zA-Z-]+)\}\}/g) ?? [])
				assert.ok(Object.keys(d.bindings ?? {}).includes(hole.slice(2, -2)), `${d.id} prose names ${hole}`)
		}
	})

	test('every reserved id is declared, as the kind core reserved it as, deciding as it said', () => {
		for (const id of Object.values(CORE_FUNCTION_IDS)) {
			const d = getFunction(id)
			assert.ok(d, `${id} is declared`)
			assert.equal(d!.kind, RESERVED_FUNCTIONS[id]!.kind, id)
			assert.equal(functionRefDecides({ ref: id }), RESERVED_FUNCTIONS[id]!.decides === true, `${id} decides as reserved`)
			assert.equal(d!.chance === true, RESERVED_FUNCTIONS[id]!.chance === true, `${id} chance`)
			assert.equal(d!.rollsDice === true, RESERVED_FUNCTIONS[id]!.rollsDice === true, `${id} rolls dice`)
		}
		// Judged in words, and decided by the way it names: header-only.
		assert.equal(F.judgeFunction.body, undefined)
		assert.equal(F.checkFunction.body, undefined)
	})

	test('a body exports a handler for each phase it lists — a way decides, a scope answers members', async () => {
		for (const d of F.CORE_FUNCTIONS.filter((x) => x.body)) {
			const h = await handlers(d)
			const listed = new Set(Object.keys(h).map((k) => OUTSIDE[k] ?? k))
			assert.deepEqual([...listed].sort(), [...(d.phases ?? [])].sort(), d.id)
			for (const p of d.phases ?? []) assert.ok((FUNCTION_PHASES as readonly string[]).includes(p))
			assert.ok(!/Math\.random/.test(d.body!), `${d.id} draws from the call's stream only`)
		}
		for (const d of [F.dieTargetFunction, F.dicePoolFunction, F.cardDrawFunction, F.compareFunction, F.spendFunction, F.tableFunction])
			assert.deepEqual(Object.keys(await handlers(d)), ['decide'], d.id)
		for (const d of F.SCOPE_FUNCTIONS) assert.deepEqual(Object.keys(await handlers(d)), ['members'], d.id)
	})

	test('🚧 every attribute role says the attribute kinds it takes (RF fix 6, 2026-10-23)', () => {
		const roles = F.CORE_FUNCTIONS.flatMap((d) => Object.entries(d.bindings ?? {}).filter(([, b]) => b.to === 'attribute').map(([role, b]) => [d, role, b] as const))
		assert.ok(roles.length >= 20)
		for (const [d, role, b] of roles) assert.ok(b.kinds?.length, `${d.id}'s '${role}' says the kinds it takes`)
		// A word is a word; everything else core binds an attribute to is a number.
		const words = roles.filter(([, , b]) => b.kinds!.some((k) => !(NUMBER_ATTRIBUTE_KINDS as readonly string[]).includes(k))).map(([d]) => d.id)
		assert.deepEqual(words.sort(), ['core:function/set-value@1', 'core:function/word-value@1'])
	})

	test('groups: the first batch is values, deciding, changing and scopes', () => {
		assert.deepEqual(Object.keys(F.CORE_FUNCTION_GROUPS), ['values', 'deciding', 'changing', 'scopes', 'pieces-and-zones', 'time-and-order', 'progression-and-economy', 'asking'])
		assert.equal(F.CORE_FUNCTIONS_FIRST_BATCH.length, 32)
		assert.deepEqual(F.ASKING_FUNCTIONS.map((d) => d.body), [undefined])
	})
})

describe('the shapes before sections read as references these modules accept', () => {
	test("every core ruleset's and template's ways, checks, worked-out values, bonuses and casting pool check clean", () => {
		const all = [...cat.CORE_RULESETS.map((r) => [r.id, r] as const), ...cat.RULESET_TEMPLATES.map((t) => [t.id, t.ruleset] as const)]
		for (const [id, decl] of all) {
			const props = rulesetInSections(decl)
			const fns = rulesetSectionFindings(id, props).filter((f) => /bad-function-options|unknown-function-binding|unbound-function-binding|unknown-function\]|bad-binding-kind/.test(f))
			assert.deepEqual(fns, [], id)
		}
	})

	test('a way names words and difficulty bands as display text — a string or a locale map', () => {
		const found = rulesetSectionFindings('acme:ruleset/x@1', {
			name: 'X',
			functions: [{ ref: CORE_FUNCTION_IDS.compare, key: 'even', options: { label: { en: 'Even odds' }, bands: [{ id: 'even', label: 'Even', target: 7, default: true }] } }],
		})
		assert.deepEqual(found, [])
		const bad = rulesetSectionFindings('acme:ruleset/x@1', { name: 'X', functions: [{ ref: CORE_FUNCTION_IDS.dieTarget, key: 'd', options: { sides: 'twenty' } }] })
		assert.ok(bad.some((f) => f.startsWith('[bad-function-options]')), bad.join('\n'))
	})
})

describe('the ways', () => {
	test('one die against a target: the margin through the degrees, natural faces shifting it', async () => {
		const { decide } = await handlers(F.dieTargetFunction)
		const terms = [{ value: 3, label: 'dexterity' }]
		const hit = decide!({ options: { sides: 20 }, check: { terms, against: 15, edge: 0 }, degrees: FOURFOLD }, faces(20, 14)).result
		assert.deepEqual([hit.natural, hit.total, hit.degree.band.id, hit.terms[0].label], [14, 17, 'success', 'd20'])
		const crit = decide!({ options: { sides: 20 }, check: { terms, against: 15 }, degrees: FOURFOLD }, faces(20, 20)).result
		assert.equal(crit.degree.band.id, 'critical-success')
		// Under an edge two dice, the better kept; against it, the worse.
		const up = decide!({ options: { sides: 20 }, check: { terms: [], against: 10, edge: 1 }, degrees: FOURFOLD }, faces(20, 4, 12)).result
		assert.deepEqual([up.natural, up.terms[0].label], [12, 'd20 (4, 12, edge)'])
		const down = decide!({ options: { sides: 20 }, check: { terms: [], against: 10, edge: -1 }, degrees: FOURFOLD }, faces(20, 4, 12)).result
		assert.deepEqual([down.natural, down.terms[0].label], [4, 'd20 (4, 12, against the edge)'])
		// Hit or miss: a natural 1 always misses, a natural 20 a critical.
		const one = decide!({ options: { sides: 20 }, check: { terms: [{ value: 30, label: 'x' }], against: 10 }, degrees: CLASSIC }, faces(20, 1)).result
		assert.equal(one.degree.band.id, 'natural-one')
		// No target: no verdict.
		assert.equal(decide!({ options: { sides: 20 }, check: {}, degrees: FOURFOLD }, faces(20, 7)).result.degree, null)
		// Degree steps walk the rank, never the declaration order.
		const stepped = decide!({ options: { sides: 20 }, check: { terms: [], against: 5, adjust: 1 }, degrees: CLASSIC }, faces(20, 10)).result
		assert.equal(stepped.degree.band.id, 'critical')
	})

	test('a pool of dice: the count through countToDegree, the pool explained', async () => {
		const { decide } = await handlers(F.dicePoolFunction)
		const degrees: DegreeCrosswalk = { bands: [{ id: 'miss', label: 'Miss', five: 'fail' }, { id: 'mixed', label: 'Mixed', five: 'partial' }, { id: 'hit', label: 'Hit', five: 'success' }] }
		const o = { sides: 6, successOn: 5, countToDegree: [{ from: 1, band: 'mixed' }, { from: 2, band: 'hit' }] }
		const r = decide!({ options: o, check: { terms: [{ value: 3, label: 'brawn' }] }, degrees }, faces(6, 5, 2, 6)).result
		assert.deepEqual([r.pool, r.degree.band.id, r.faces], [{ size: 3, successes: 2, successOn: 5 }, 'hit', [5, 2, 6]])
		assert.equal(r.explain, 'pool 3 — 3d6 (5, 2, 6): 2 successes at 5+')
		const none = decide!({ options: o, check: { terms: [{ value: 2, label: 'brawn' }], edge: -1, extra: 1 }, degrees }, faces(6, 1)).result
		assert.equal(none.explain, 'pool 2 (2 brawn, 1 more, −1 against the edge) — 2d6 (1, 1): 0 successes at 5+')
		assert.equal(none.degree.band.id, 'miss')
		// No map: none fails, any succeeds; never more than POOL_MAX dice.
		assert.equal(decide!({ options: { sides: 6, successOn: 6 }, check: { terms: [{ value: 1, label: 'x' }] }, degrees }, faces(6, 6)).result.degree.band.id, 'hit')
		assert.equal(decide!({ options: { sides: 6, successOn: 6 }, check: { terms: [{ value: 9000, label: 'x' }] }, degrees }, faces(6, 1)).result.pool.size, F.POOL_MAX)
	})

	test("cards from the way's deck: the seed's order, the state carried, shuffled anew each scene", async () => {
		const { decide } = await handlers(F.cardDrawFunction)
		const o = { ranks: 13, suits: 4, draw: 2 }
		const deck = { seed: 's1', scene: 4 }
		const a = decide!({ key: 'fate', options: o, check: { terms: [], against: 14, deck }, degrees: FOURFOLD }).result
		const b = decide!({ key: 'fate', options: o, check: { terms: [], against: 14, deck }, degrees: FOURFOLD }).result
		assert.deepEqual(a.cards, b.cards, 'the same deck whoever draws')
		assert.deepEqual(a.deck, { scene: 4, shuffle: 0, drawn: 2 })
		assert.equal(a.total, a.cards[0].rank + a.cards[1].rank)
		assert.match(a.terms[0].label, /^drew .+ of (hearts|diamonds|clubs|spades), .+ of (hearts|diamonds|clubs|spades)$/)
		const next = decide!({ key: 'fate', options: o, check: { terms: [], against: 14, deck: { ...deck, state: a.deck } }, degrees: FOURFOLD }).result
		assert.deepEqual(next.deck, { scene: 4, shuffle: 0, drawn: 4 })
		assert.notDeepEqual(next.cards, a.cards)
		const fresh = decide!({ key: 'fate', options: o, check: { terms: [], against: 14, deck: { ...deck, scene: 5, state: a.deck } }, degrees: FOURFOLD }).result
		assert.deepEqual(fresh.deck, { scene: 5, shuffle: 0, drawn: 2 })
		// Run out mid-draw and it is shuffled again.
		const tiny = decide!({ key: 'k', options: { ranks: 2, suits: 1, draw: 3 }, check: { terms: [], against: 1, deck }, degrees: FOURFOLD }).result
		assert.deepEqual(tiny.deck, { scene: 4, shuffle: 1, drawn: 1 })
	})

	test('compare: no chance, the margin through the degrees', async () => {
		const { decide } = await handlers(F.compareFunction)
		const r = decide!({ options: { opposedBy: 'mettle' }, check: { terms: [{ value: 4, label: 'mettle' }], against: 3 }, degrees: W_DEGREES }).result
		assert.deepEqual([r.total, r.degree.band.id], [4, 'carried'])
		assert.equal(decide!({ check: { terms: [{ value: 6, label: 'mettle' }], against: 3 }, degrees: W_DEGREES }).result.degree.band.id, 'clean')
		assert.equal(decide!({ check: { terms: [{ value: 0, label: 'mettle' }], against: 3 }, degrees: W_DEGREES }).result.degree.band.id, 'ruin')
	})

	test('spend to succeed: the cost table, the price of success, never more than is held', async () => {
		const { decide } = await handlers(F.spendFunction)
		const o = { resource: 'wherewithal-nerve', costs: cat.WHEREWITHAL_COSTS }
		const held = { value: 3, label: 'Nerve', ref: 'core:slot/wherewithal-nerve@1' }
		const two = decide!({ owner: { key: 'character:1' }, options: o, check: { held, spend: 2 }, degrees: W_DEGREES })
		assert.equal(two.result.degree.band.id, 'carried')
		assert.equal(two.result.explain, 'spent 2 of 3 Nerve (1 left)')
		assert.deepEqual([two.degree, two.deltas], ['carried', [{ owner: 'character:1', attribute: 'wherewithal-nerve', op: 'spend', value: 2, reason: 'spent' }]])
		// No amount asked: the least spend that buys a success or better.
		const price = decide!({ owner: { key: 'character:1' }, options: o, check: { held }, degrees: W_DEGREES })
		assert.deepEqual([price.result.total, price.result.degree.band.id], [2, 'carried'])
		const greedy = decide!({ owner: { key: 'character:1' }, options: o, check: { held, spend: 4 }, degrees: W_DEGREES })
		assert.deepEqual([greedy.result.refused, greedy.deltas], ['not-enough', undefined])
		const nothing = decide!({ owner: { key: 'character:1' }, options: o, check: { held, spend: 0 }, degrees: W_DEGREES })
		assert.deepEqual([nothing.result.degree.band.id, nothing.deltas], ['short', undefined])
	})

	test('a roll on a table: the row the total lands on, its words, its outcome', async () => {
		const { decide } = await handlers(F.tableFunction)
		const o = { dice: '2d6', rows: [{ from: 2, text: 'Wolves.' }, { from: 7, text: 'A stranger on the road.', outcome: 'success' }, { from: 11, text: 'An old friend.' }] }
		const r = decide!({ options: o, check: {}, degrees: FOURFOLD }, faces(6, 3, 5))
		assert.deepEqual([r.result.total, r.result.row, r.lines, r.degree, r.outcome], [8, { from: 7, to: 10, text: 'A stranger on the road.' }, ['A stranger on the road.'], 'success', 'success'])
		assert.deepEqual(decide!({ options: o, check: {} }, faces(6, 6, 6)).result.row, { from: 11, text: 'An old friend.' })
		assert.equal(decide!({ options: { ...o, dice: 'two dice' }, check: {} }).result.refused, 'bad-dice')
	})

	test('a way leaves a check that already came out as it came', async () => {
		for (const d of [F.dieTargetFunction, F.dicePoolFunction, F.cardDrawFunction, F.compareFunction, F.spendFunction, F.tableFunction])
			assert.deepEqual((await handlers(d)).decide!({ options: {}, check: { rolled: 14, terms: [] }, degrees: FOURFOLD, random: () => 0.5 }), {}, d.id)
		// The host's envelope carries the stream as `random`.
		const r = (await handlers(F.dieTargetFunction)).decide!({ options: { sides: 20 }, check: { terms: [], against: 10 }, degrees: FOURFOLD, random: faces(20, 11).random })
		assert.deepEqual([r.degree, r.result.natural], ['success', 11])
	})

	test('around a decision: an edge, margins as outcome words, natural faces', async () => {
		const { before } = await handlers(F.advantageFunction)
		const blessed = { helps: { to: 'entry-type', ids: ['blessings'], entries: [{ name: 'Blessed' }] }, hinders: { to: 'entry-type', ids: ['fears'], entries: [] } }
		assert.deepEqual(before!({ bindings: blessed, check: { edge: 0 } }), { edge: 1, lines: ['with the edge'] })
		assert.deepEqual(before!({ bindings: { ...blessed, hinders: [{ id: 'fears', entries: [{ name: 'Afraid' }] }] }, check: {} }), {})
		const { after: margins } = await handlers(F.marginsFunction)
		const words = [{ outcome: 'awkward', from: -99 }, { outcome: 'warmed', from: 0 }, { outcome: 'smitten', from: 5 }]
		assert.deepEqual(margins!({ options: { words }, check: { against: 7, rolled: 13 } }).outcomes, ['smitten'])
		assert.deepEqual(margins!({ options: { words }, check: { margin: -1 } }).outcomes, ['awkward'])
		assert.deepEqual(margins!({ options: { words }, check: { rolled: 6 } }), {})
		assert.equal(margins!({ options: { words }, check: { margin: 0 }, degrees: { bands: [{ id: 'warmed', label: 'Warmed', five: 'success' }] } }).degree, 'warmed')
		const { after: natural } = await handlers(F.naturalResultsFunction)
		const o = { high: 20, highOutcome: 'critical', low: 1, lowOutcome: 'natural-one' }
		assert.equal(natural!({ options: o, check: { natural: 20 } }).degree, 'critical')
		assert.equal(natural!({ options: o, check: { natural: 1 } }).degree, 'natural-one')
		assert.deepEqual(natural!({ options: o, check: { natural: 9 } }), {})
	})
})

describe('values', () => {
	test('a pool refills when its event comes round — to its most, or by an amount', async () => {
		const { effects } = await handlers(F.refillingPoolFunction)
		// The host's binding shape (ids, values, bounds), and the flat one.
		const pool = { to: 'attribute', ids: ['nerve'], values: { nerve: 1 }, bounds: { nerve: { min: 0, max: 6 } } }
		const owner = { key: 'character:1' }
		assert.deepEqual(effects!({ owner, bindings: { pool }, options: {}, event: { id: 'core:event/scene-closed@1' } }).deltas, [{ owner: 'character:1', attribute: 'nerve', op: 'set', value: 6, reason: 'refilled' }])
		assert.equal(effects!({ owner, bindings: { pool: { id: 'nerve', value: 1, max: 6 } }, options: { on: 'core:event/rest-taken@1', by: 2 }, event: { id: 'core:event/rest-taken@1' } }).deltas[0].value, 2)
		assert.deepEqual(effects!({ owner, bindings: { pool }, options: {}, event: { id: 'core:event/turn-ended@1' } }), {})
		assert.deepEqual(effects!({ owner, bindings: { pool: { id: 'nerve', value: 6, max: 6 } }, options: {}, event: { id: 'core:event/scene-closed@1' } }), {})
	})

	test('rungs: the number read as the rung it reached', async () => {
		const { derived } = await handlers(F.rungsFunction)
		const rungs = [{ from: 0, words: 'Stranger' }, { from: 4, words: 'Friend' }, { from: 8, words: 'Confidant' }]
		assert.deepEqual(derived!({ owner: { key: 'character:1', name: 'Mara' }, bindings: { what: { to: 'attribute', ids: ['affection'], values: { affection: 5 } } }, options: { rungs } }).lines, ['Mara: Friend'])
		assert.deepEqual(derived!({ bindings: { what: { id: 'affection', value: -1 } }, options: { rungs } }), {})
	})
})

describe('changing', () => {
	const owner = { key: 'character:1', name: 'Mara' }
	test('reduce, restore, set, mark — invoked, proposed, or on their event', async () => {
		const what = { id: 'affection', value: 5, max: 10, start: 3 }
		const { effects: reduce } = await handlers(F.reduceFunction)
		assert.deepEqual(reduce!({ owner, bindings: { what }, options: { by: 1 }, answer: { by: 2, why: 'a careless word' } }).deltas, [{ owner: 'character:1', attribute: 'affection', op: 'add', value: -2, reason: 'a careless word' }])
		assert.equal(reduce!({ owner, bindings: { what }, options: { by: 1, on: 'core:event/turn-ended@1' }, event: { id: 'core:event/turn-ended@1' } }).deltas[0].value, -1)
		assert.deepEqual(reduce!({ owner, bindings: { what }, options: { by: 1 }, event: { id: 'core:event/turn-ended@1' } }), {})
		const { effects: restore } = await handlers(F.restoreFunction)
		assert.equal(restore!({ owner, bindings: { what }, options: { to: 'most' }, answer: {} }).deltas[0].value, 10)
		assert.equal(restore!({ owner, bindings: { what }, options: { to: 'start' }, answer: { who: 'character:2' } }).deltas[0].owner, 'character:2')
		assert.equal(restore!({ owner, bindings: { what: { id: 'affection', value: 5 } }, options: { to: 'most' }, answer: {} }).lines.length, 1)
		const { effects: set } = await handlers(F.setValueFunction)
		assert.equal(set!({ owner, bindings: { what }, answer: { to: '7' } }).deltas[0].value, 7)
		assert.equal(set!({ owner, bindings: { what: { id: 'mood', value: 'calm' } }, answer: { to: 'wary' } }).deltas[0].value, 'wary')
		const { effects: mark } = await handlers(F.markTallyFunction)
		assert.deepEqual(mark!({ owner, bindings: { tally: { id: 'debts', value: 0 } }, options: { marks: 1 }, answer: {} }).deltas, [{ owner: 'character:1', attribute: 'debts', op: 'add', value: 1, reason: 'marked' }])
	})

	test('transfer: both sides moved, never more than the giver holds', async () => {
		const { effects } = await handlers(F.transferFunction)
		assert.deepEqual(effects!({ owner, actor: 'character:1', bindings: { what: { id: 'coin', value: 5 } }, answer: { to: 'character:2', amount: 3 } }).deltas, [
			{ owner: 'character:1', attribute: 'coin', op: 'add', value: -3, reason: 'given to character:2' },
			{ owner: 'character:2', attribute: 'coin', op: 'add', value: 3, reason: 'given by character:1' },
		])
		assert.equal(effects!({ owner, bindings: { what: { id: 'coin', value: 2 } }, answer: { to: 'character:2', amount: 3 } }).lines.length, 1)
	})

	test('entries given, taken, moved between zones, revealed', async () => {
		const kind = { to: 'entry-type', ids: ['keepsakes'], entries: [] }
		assert.deepEqual((await handlers(F.addEntryFunction)).effects!({ owner, bindings: { kind }, answer: { entry: 'Pressed flower' } }).deltas, [
			{ owner: 'character:1', op: 'add', entry: { name: 'Pressed flower', entryType: 'keepsakes' }, zone: 'carried', reason: 'given' },
		])
		assert.deepEqual((await handlers(F.removeEntryFunction)).effects!({ owner, bindings: { kind, from: { to: 'zone-type', ids: ['shelf'], zones: {} } }, answer: { entry: 'Pressed flower' } }).deltas, [
			{ owner: 'character:1', op: 'remove', entry: 'Pressed flower', zone: 'shelf', reason: 'taken' },
		])
		const move = (await handlers(F.moveEntryFunction)).effects!
		assert.deepEqual(move({ owner, bindings: { from: { id: 'pocket', entries: [] }, to: { to: 'zone-type', ids: ['shelf'], zones: { shelf: [] } } }, answer: { entry: 'Letter', toWhom: 'location:3' } }).deltas, [
			{ owner: 'character:1', op: 'move', entry: 'Letter', zone: 'pocket', to: 'shelf', toOwner: 'location:3' },
		])
		assert.equal(move({ owner, bindings: {}, answer: { entry: 'Letter' } }).lines.length, 1)
		assert.deepEqual((await handlers(F.revealFunction)).effects!({ owner, bindings: { zone: { id: 'hand', entries: [] } }, answer: { entry: 'Queen of hearts' } }).deltas, [
			{ owner: 'character:1', op: 'reveal', entry: 'Queen of hearts', zone: 'hand' },
		])
	})
})

describe('scopes', () => {
	const owners = [
		{ key: 'character:1', location: 'location:1' },
		{ key: 'character:2', location: 'location:1' },
		{ key: 'character:3', location: 'location:2' },
		{ key: 'character:4' },
	]
	const members = async (d: FunctionDecl, input: Record<string, unknown>) => (await handlers(d)).members!({ owners, ...input }).members
	test('everyone, the same place, within a tie, whoever it is aimed at — as the host answers them', async () => {
		assert.deepEqual(await members(F.everyoneScopeFunction, {}), ['character:1', 'character:2', 'character:3', 'character:4'])
		assert.deepEqual(await members(F.samePlaceScopeFunction, { subject: 'character:2' }), ['character:1', 'character:2'])
		assert.deepEqual(await members(F.samePlaceScopeFunction, { subject: 'character:4' }), ['character:4'])
		const ties = [{ from: 'character:3', to: 'character:1', type: 'friend' }, { from: 'character:1', to: 'character:4', type: 'rival' }]
		assert.deepEqual(await members(F.withinTieScopeFunction, { subject: 'character:1', ties }), ['character:3', 'character:4'])
		assert.deepEqual(await members(F.withinTieScopeFunction, { subject: 'character:1', ties, options: { types: ['rival'] } }), ['character:4'])
		assert.deepEqual(await members(F.aimedAtScopeFunction, { subject: 'character:1', aimedAt: 'character:3' }), ['character:3'])
		assert.deepEqual(await members(F.aimedAtScopeFunction, { subject: 'character:1', aimedAt: 'character:9' }), [])
	})
})

describe('pieces and zones', () => {
	const owner = { key: 'character:1', name: 'Mara' }
	test('a condition that lasts is lifted when its turn or scene runs out', async () => {
		const { effects } = await handlers(F.lastingConditionFunction)
		const conditions = { to: 'entry-type', ids: ['conditions'], entries: [
			{ name: 'Stunned', zone: 'carried', fields: { duration: { units: 'turn', value: 1, expiry: 'turn-end' } } },
			{ name: 'Poisoned', fields: { duration: { units: 'turn', value: 3, spent: 1, expiry: 'turn-end' } } },
			{ name: 'Shaken', fields: { duration: { units: 'scene', expiry: 'scene-end' } } },
		] }
		assert.deepEqual(effects!({ owner, bindings: { conditions }, event: { id: 'core:event/turn-ended@1' } }).deltas, [{ owner: 'character:1', op: 'remove', entry: 'Stunned', zone: 'carried', reason: 'ran its course' }])
		assert.deepEqual(effects!({ owner, bindings: { conditions }, event: { id: 'core:event/scene-closed@1' } }).lines, ['Shaken has passed.'])
	})

	test('an obligation comes due when the clock passes it', async () => {
		const { effects } = await handlers(F.obligationFunction)
		const owed = { to: 'entry-type', ids: ['debts'], entries: [{ name: 'The ferryman', fields: { due: { year: 3, month: 4, day: 2 } } }] }
		const moved = (from: object, to: object) => ({ owner, bindings: { owed }, options: {}, event: { id: 'core:event/story-clock-moved@1', payload: { clock: { from, to } } } })
		const due = effects!(moved({ year: 3, month: 4, day: 1 }, { year: 3, month: 4, day: 3 }))
		assert.deepEqual([due.lines, due.emits], [['The ferryman has come due.'], [{ event: 'core:event/obligation-came-due@1', payload: { owner: 'character:1', entry: 'The ferryman' } }]])
		assert.deepEqual(effects!(moved({ year: 3, month: 4, day: 3 }, { year: 3, month: 4, day: 5 })), {})
	})

	test('the deck adds its three zone types; a draw moves cards into the hand', async () => {
		assert.deepEqual(F.deckFunction.adds!.zoneTypes!.map((z) => [z.id, z.visibility]), [['deck', 'gm'], ['hand', 'holder'], ['discard', 'everyone']])
		const { effects } = await handlers(F.deckFunction)
		const deck = { to: 'zone-type', ids: ['deck'], zones: { deck: [{ name: 'Ace of cups' }, { name: 'The Tower' }] } }
		assert.deepEqual(effects!({ owner, bindings: { deck, hand: { to: 'zone-type', ids: ['hand'], zones: { hand: [] } } }, options: { draws: 1 }, answer: {} }).deltas, [
			{ owner: 'world', op: 'move', entry: 'Ace of cups', zone: 'deck', to: 'hand', toOwner: 'character:1', reason: 'drawn' },
		])
		assert.deepEqual(effects!({ owner, bindings: { deck: { id: 'deck', entries: [] }, hand: { id: 'hand', entries: [] } }, answer: {} }).lines, ['The deck is empty.'])
	})

	test('a carrying limit: burdened past it, in words', async () => {
		const { effects } = await handlers(F.carryingLimitFunction)
		const zone = { to: 'zone-type', ids: ['carried'], zones: { carried: [{ name: 'Rope' }, { name: 'Torch', count: 3 }] } }
		assert.equal(effects!({ owner, bindings: { zone, most: { to: 'attribute', ids: ['strength'], values: { strength: 3 } } } }).lines[0], 'Mara carries 4 things, more than the 3 they can: burdened and slowed.')
		assert.deepEqual(effects!({ owner, bindings: { zone }, options: { most: 4 } }), {})
	})
})

describe('time and order', () => {
	const owner = { key: 'character:1', name: 'Mara' }
	const clock = (from: object, to: object) => ({ id: 'core:event/story-clock-moved@1', payload: { clock: { from, to } } })
	test('each turn, round, scene or day; a scheduled moment; a deadline', async () => {
		const { effects: each } = await handlers(F.recurringFunction)
		const what = { id: 'hunger', value: 1 }
		assert.equal(each!({ owner, bindings: { what }, options: { every: 'day', by: 1 }, event: clock({ year: 1, month: 1, day: 1, hour: 8 }, { year: 1, month: 1, day: 2 }) }).deltas[0].value, 1)
		assert.deepEqual(each!({ owner, bindings: { what }, options: { every: 'day', by: 1 }, event: clock({ year: 1, month: 1, day: 1, hour: 8 }, { year: 1, month: 1, day: 1, hour: 9 }) }), {})
		assert.deepEqual(each!({ owner, bindings: { what }, options: { every: 'round', by: -1 }, event: { id: 'core:event/round-ended@1' } }).deltas, [{ owner: 'character:1', attribute: 'hunger', op: 'add', value: -1, reason: 'each round' }])
		const { effects: at } = await handlers(F.scheduledFunction)
		const fest = { at: { year: 1, month: 5, day: 3, hour: 6 }, happens: 'The festival begins at dawn.' }
		const reached = at!({ function: { key: 'festival' }, options: fest, event: clock({ year: 1, month: 5, day: 2 }, { year: 1, month: 5, day: 3, hour: 7 }) })
		assert.deepEqual([reached.lines, reached.emits], [['The festival begins at dawn.'], [{ event: 'core:event/scheduled-moment-reached@1', payload: { key: 'festival' } }]])
		assert.deepEqual(at!({ options: fest, event: clock({ year: 1, month: 5, day: 4 }, { year: 1, month: 5, day: 5 }) }), {})
		const { effects: by } = await handlers(F.deadlineFunction)
		const late = by!({ owner, bindings: { goal: { id: 'ransom', value: 40 } }, options: { by: { year: 1, month: 6 }, reach: 100 }, event: clock({ year: 1, month: 5, day: 30 }, { year: 1, month: 6, day: 1 }) })
		assert.equal(late.emits[0].event, 'core:event/deadline-passed@1')
		assert.deepEqual(by!({ owner, bindings: { goal: { id: 'ransom', value: 100 } }, options: { by: { year: 1, month: 6 }, reach: 100 }, event: clock({ year: 1, month: 5, day: 30 }, { year: 1, month: 6, day: 1 }) }), {})
	})

	test('turn order from a value, ties by name; a rest restores and is raised', async () => {
		const { derived } = await handlers(F.turnOrderByFunction)
		const owners = [{ key: 'character:1', name: 'Mara' }, { key: 'character:2', name: 'Bryn' }, { key: 'character:3', name: 'Ash' }]
		const values = { 'character:1': { quickness: 3 }, 'character:2': { quickness: 5 }, 'character:3': { quickness: 3 } }
		assert.deepEqual(derived!({ bindings: { by: { to: 'attribute', ids: ['quickness'], values: {} } }, owners, values }).order, ['character:2', 'character:3', 'character:1'])
		assert.deepEqual(derived!({ bindings: { by: { id: 'quickness' } }, owners, values, options: { lowestFirst: true } }).order, ['character:3', 'character:1', 'character:2'])
		const { effects } = await handlers(F.restFunction)
		const restores = { to: 'attribute', ids: ['nerve', 'favour'], values: { nerve: 1, favour: 6 }, bounds: { nerve: { max: 6 }, favour: { max: 6 } } }
		const r = effects!({ owner, bindings: { restores }, options: { rest: 'night' }, answer: {} })
		assert.deepEqual(r.deltas, [{ owner: 'character:1', attribute: 'nerve', op: 'set', value: 6, reason: 'rested' }])
		assert.deepEqual(r.emits, [{ event: F.REST_TAKEN_EVENT, payload: { owner: 'character:1', rest: 'night' } }])
	})
})

describe('progression and economy', () => {
	const owner = { key: 'character:1', name: 'Mara' }
	test('experience raises a level, never lowers it', async () => {
		const { effects } = await handlers(F.experienceLevelsFunction)
		const o = { thresholds: [300, 900, 2700] }
		const up = effects!({ owner, bindings: { experience: { id: 'xp', value: 950 }, level: { id: 'level', value: 1 } }, options: o })
		assert.deepEqual([up.deltas[0].value, up.emits[0].payload.level, up.lines], [3, 3, ['Mara reaches level 3.']])
		assert.deepEqual(effects!({ owner, bindings: { experience: { id: 'xp', value: 100 }, level: { id: 'level', value: 2 } }, options: o }), {})
	})

	test('buy at a price; a standing opens a door; a limited supply runs out', async () => {
		const { effects: buy } = await handlers(F.pricesFunction)
		const b = { money: { id: 'coin', value: 10 }, goods: { to: 'entry-type', ids: ['wares'], entries: [] } }
		assert.deepEqual(buy!({ owner, bindings: b, answer: { entry: 'Lantern', price: 4 } }).deltas, [
			{ owner: 'character:1', attribute: 'coin', op: 'add', value: -4, reason: 'bought Lantern' },
			{ owner: 'character:1', op: 'add', entry: { name: 'Lantern', entryType: 'wares' }, zone: 'carried', reason: 'bought' },
		])
		assert.equal(buy!({ owner, bindings: b, answer: { entry: 'Horse', price: 40 } }).lines.length, 1)
		const { derived } = await handlers(F.reputationGateFunction)
		assert.deepEqual(derived!({ owner, bindings: { standing: { id: 'renown', value: 6 } }, options: { at: 5, opens: 'the guild hall' } }).lines, ['Mara is welcome: the guild hall.'])
		const { effects: take } = await handlers(F.limitedSupplyFunction)
		const s2 = { stock: { id: 'potions-left', value: 1 }, goods: { id: 'potions', entries: [] } }
		assert.deepEqual(take!({ owner, bindings: s2, answer: { entry: 'Potion' } }).deltas[0], { owner: 'world', attribute: 'potions-left', op: 'add', value: -1, reason: 'taken by character:1' })
		assert.equal(take!({ owner, bindings: { ...s2, stock: { id: 'potions-left', value: 0 } }, answer: { entry: 'Potion' } }).lines.length, 1)
	})
})

describe('🚧 option roles in core\'s modules (RF fix 8 — RF fix 6 ★2/★3)', () => {
	test('every option that names a value it reads is a value role; a check\'s way and an outcome\'s check name a function', () => {
		const VALUE_OPTIONS = ['base', 'modifierOf', 'poolOf', 'opposedBy', 'resource']
		for (const f of cat.CORE_FUNCTIONS) {
			for (const k of VALUE_OPTIONS)
				if (f.form && Object.prototype.hasOwnProperty.call(f.form, k))
					assert.deepEqual(f.optionRoles?.[k], { names: 'value' }, `${f.id} ${k}`)
		}
		assert.deepEqual(F.checkFunction.optionRoles?.way, { names: 'function' })
		assert.deepEqual(cat.CORE_FUNCTIONS.find((f) => f.id === 'core:function/outcome-moves@1')?.optionRoles?.check, { names: 'function' })
	})
})
