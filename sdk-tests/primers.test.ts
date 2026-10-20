/**
 * 🚧 Primers (rulesets §21, W3-S 2026-10-16): Vis Itineris's starter world and
 * Story's blank pass their findings; Vis Itineris's places graph is connected;
 * `derived` mode materialises every compendium row as a derived entry.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { definePrimer, EMPTY_PRIMER_CONTENT, getPrimer, primerDerivedEntries, primerFindings, RulesetError, type PrimerProps } from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const reasons = (f: string[]) => f.map((x) => x.slice(1, x.indexOf(']')))

describe('core primers', () => {
	test('both are registered and pass every finding', () => {
		assert.deepEqual(cat.CORE_PRIMERS.map((p) => p.id), ['core:primer/freeform@1', 'core:primer/vis-itineris@1'])
		for (const p of cat.CORE_PRIMERS) {
			assert.equal(getPrimer(p.id), p)
			assert.deepEqual(primerFindings(p.id, p), [], p.id)
		}
		// A primer names its ruleset; the ruleset names no primer (cut 2026-10-17).
		assert.equal(cat.visItinerisPrimer.ruleset, cat.visItinerisRuleset.id)
		assert.equal('primer' in cat.visItinerisRuleset, false)
	})

	test('Story is blank', () => {
		assert.deepEqual(cat.freeformPrimer.content, EMPTY_PRIMER_CONTENT)
		assert.deepEqual(primerDerivedEntries(cat.freeformPrimer), [])
	})

	test('Vis Itineris: one region and a town, 8–12 places, 3 factions, 6–8 cast, 5 leads, a calendar and a clock', () => {
		const c = cat.visItinerisPrimer.content
		assert.equal(cat.visItinerisPrimer.compendiumMode, 'derived')
		assert.ok(c.places.length >= 8 && c.places.length <= 12, `${c.places.length} places`)
		assert.equal(c.places.filter((p) => p.fields?.category === 'region').length, 1)
		assert.equal(c.places.filter((p) => p.fields?.category === 'town').length, 1)
		assert.equal(c.entries.filter((e) => e.type === 'core:entry/world-lore@1' && e.fields?.category === 'faction').length, 3)
		assert.ok(c.entries.some((e) => e.fields?.category === 'premise'))
		assert.ok(c.cast.length >= 6 && c.cast.length <= 8)
		for (const m of c.cast) assert.ok(Object.keys(m.sheet ?? {}).length > 0, `${m.key} has a sheet`)
		assert.ok(c.relationships.length >= c.cast.length - 1)
		assert.equal(c.leads.length, 5)
		assert.ok(c.calendar && c.clock)
	})

	test("Vis Itineris's places graph is connected", () => {
		const places = cat.visItinerisPrimer.content.places
		const adj = new Map(places.map((p) => [p.key, new Set<string>()]))
		for (const p of places) for (const x of p.exits ?? []) {
			adj.get(p.key)!.add(x.towards)
			adj.get(x.towards)!.add(p.key)
		}
		const seen = new Set([places[0]!.key])
		const queue = [places[0]!.key]
		while (queue.length) for (const n of adj.get(queue.shift()!)!) if (!seen.has(n)) (seen.add(n), queue.push(n))
		assert.equal(seen.size, places.length, `unreached: ${places.filter((p) => !seen.has(p.key)).map((p) => p.key)}`)
	})

	test('derived mode materialises all 51 compendium rows as derived entries, stamped', () => {
		const rows = primerDerivedEntries(cat.visItinerisPrimer)
		assert.equal(rows.length, 51)
		for (const r of rows) {
			assert.match(r.type, /^core:entry\/vis-itineris\.[a-z-]+@1$/)
			assert.equal(r.derivedFrom.compendium, 'core:ruleset/vis-itineris@1')
			assert.equal(r.derivedFrom.version, '1.1.0')
			assert.equal(r.title, r.fields.name)
			// The row's bookkeeping rides on the stamp, never among the entry's fields.
			for (const k of ['id', 'version', 'lang', 'piece']) assert.equal(k in r.fields, false, `${r.derivedFrom.piece}.${k}`)
		}
		assert.deepEqual(primerDerivedEntries({ ...cat.visItinerisPrimer, compendiumMode: 'referenced' }), [])
	})

	test('the content names no one outside it', () => {
		const text = JSON.stringify(cat.visItinerisPrimer.content)
		assert.ok(!/https?:\/\//.test(text))
	})
})

describe('primer findings', () => {
	const base = (): PrimerProps => JSON.parse(JSON.stringify(cat.VIS_ITINERIS_PRIMER))

	test('an exit toward an undeclared place, a bad sheet value, an unknown ref and an invalid derived entry are named', () => {
		const p = base() as any
		p.content.places[0].exits[0].towards = 'nowhere'
		p.content.cast[0].sheet['core:slot/level@1'] = 99
		p.content.relationships[0].to = 'nobody'
		p.content.entries.find((e: any) => e.type === 'core:entry/vis-itineris.gear@1').fields.sort = 'spaceship'
		p.content.cast[0].sheet['core:slot/mood@1'] = 'calm'
		const r = reasons(primerFindings('core:primer/test@1', p))
		for (const want of ['unknown-place', 'bad-sheet', 'unknown-ref', 'bad-entry']) assert.ok(r.includes(want), `${want} in ${r}`)
	})

	test('an unknown ruleset, a bad mode and a bad id are refused through definePrimer', () => {
		assert.throws(
			() => definePrimer('not a primer', { ruleset: 'acme:ruleset/none@1', compendiumMode: 'copied' as never, name: { en: 'X' }, content: EMPTY_PRIMER_CONTENT }),
			(e: unknown) => e instanceof RulesetError && ['invalid-id', 'bad-mode', 'unknown-ruleset'].every((x) => reasons([...e.findings]).includes(x)),
		)
	})
})
