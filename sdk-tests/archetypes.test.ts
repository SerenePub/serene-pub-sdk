/**
 * Archetype rulesets (rulesets-as-functions A3, 2026-10-23): romance, slice of life, workplace and
 * card game each declare with zero findings, run ≤ 60 lines, carry prose on every item and never say
 * the dungeon word. The archetypes import their sources directly (not the built core-catalog), and
 * with them core's function catalogue (lane A2), which they reference by its declarations' ids
 * (reconciled by lane M1, 2026-10-23).
 */
import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { rulesetSectionFindings, rulesetSections, playtestFindings, functionRefKey, resolveFunctionRef } from '@serene-pub/sdk'
import type { RulesetTemplate } from '@serene-pub/sdk'
import { renderHandbook } from '../cli/src/handbook.js'

const dir = new URL('../core-catalog/src/rulesets/archetypes/', import.meta.url)
let templates: readonly RulesetTemplate[] = []
let ids: Record<string, string> = {}

before(async () => {
	ids = (await import('../core-catalog/src/rulesets/archetypes/functionIds.js')).ARCHETYPE_FUNCTIONS
	templates = (await import('../core-catalog/src/rulesets/archetypes/index.js')).ARCHETYPE_TEMPLATES
})

const FILES = ['romance', 'sliceOfLife', 'workplace', 'cardGame']

describe('archetype rulesets', () => {
	test('four archetypes, each ≤ 60 lines, each declared with zero findings', () => {
		assert.deepEqual(templates.map((t) => t.id), ['romance', 'slice-of-life', 'workplace', 'card-game'].map((n) => `core:ruleset/template-${n}@1`))
		for (const f of FILES) assert.ok(readFileSync(fileURLToPath(new URL(`${f}.ts`, dir)), 'utf8').split('\n').length <= 60, `${f}.ts runs past 60 lines`)
		for (const t of templates) {
			assert.equal(t.ruleset.template, true)
			assert.deepEqual(rulesetSectionFindings(t.id, rulesetSections(t.ruleset as never)), [], t.id)
			assert.deepEqual(playtestFindings(t.id, t.ruleset as never, t.playtest), [], t.id)
		}
	})

	test('every attribute, entry type, zone type and function has prose; no dungeon word', () => {
		for (const t of templates) {
			const s = rulesetSections(t.ruleset as never)
			assert.ok(s.attributes?.length, `${t.id} has attributes`)
			for (const a of s.attributes ?? []) assert.ok(a.prose?.trim() && a.name, `${t.id} attribute ${a.id}`)
			for (const e of s.entryTypes ?? []) assert.ok(e.prose.trim(), `${t.id} entry type ${e.id}`)
			for (const z of s.zoneTypes ?? []) assert.ok(z.prose.trim(), `${t.id} zone type ${z.id}`)
			for (const o of s.outcomes ?? []) assert.ok(o.label, `${t.id} outcome ${o.id}`)
			for (const f of s.functions ?? []) {
				const r = resolveFunctionRef(f)
				assert.ok(r.decl?.prose || r.reserved, `${t.id} function ${functionRefKey(f)} resolves`)
			}
			assert.doesNotMatch(JSON.stringify([t.ruleset, t.label, t.about, t.goodFor, t.playtest]), /dungeon/i, t.id)
		}
	})

	test("they rest on core's reserved ids and its catalogue, and the card game carries one module of its own", () => {
		const refs = templates.flatMap((t) => rulesetSections(t.ruleset as never).functions ?? [])
		const used = new Set(refs.map((f) => f.ref))
		for (const id of [ids.recurring, ids.obligation, ids.deck, ids.moveEntry, ids.markTally, ids.compare, ids.spend, ids.judge]) assert.ok(used.has(id), `${id} is used`)
		const carried = refs.filter((f) => f.module)
		assert.deepEqual(carried.map((f) => [f.ref, f.key]), [['core:function/template-card-game-round-over@1', 'round-over']])
		for (const f of refs.filter((x) => !x.module)) assert.ok(f.ref.startsWith('core:function/'), f.ref)
	})

	test('the handbook generator: a page per category, the author\'s pages beside it, no member-hostile words', () => {
		for (const t of templates) {
			const doc = renderHandbook(t.ruleset as never)
			assert.equal(doc.pages[0]!.title, `How to play ${(t.ruleset.name as { en: string }).en}`)
			for (const want of ['What people carry', 'How things are decided', 'Things people keep', 'How outcomes read'])
				assert.ok(doc.pages.some((p) => p.title === want && p.source === 'generated'), `${t.id}: ${want}`)
			assert.doesNotMatch(doc.markdown, /\b(ruleset|rigou?r|repertoire|piece)s?\b/i, t.id)
		}
		const romance = templates[0]!
		const doc = renderHandbook({ ...(romance.ruleset as object), handbook: [{ title: 'A note from the author', body: 'Be kind.' }, { title: 'Time', body: 'Days only.' }] } as never)
		assert.equal(doc.pages.at(-1)!.source, 'authored')
		assert.equal(doc.pages.find((p) => p.title === 'Time')!.body, 'Days only.')
		assert.match(doc.markdown, /## A note from the author\n\nBe kind\./)
		// The way's own prose, from core's catalogue module (`core:function/compare@1`).
		assert.match(doc.markdown, /\*\*confess\*\* — Contests are decided by comparing one value against another's/)
		const genre = renderHandbook({ name: 'Story', description: 'A tale told together', handbook: [{ title: 'Tips', body: 'Say yes.' }] })
		assert.deepEqual(genre.pages.map((p) => p.title), ['How to play Story', 'Tips'])
	})

	test('🚧 a role left unbound reads as its words and the kinds it takes (RF fix 6)', () => {
		const doc = renderHandbook({ name: 'Bare', functions: [{ ref: 'core:function/restore@1', key: 'restore' }] } as never)
		assert.match(doc.markdown, /\*\*restore\*\* — Restore \(a number, a pool or a tally\)/)
		assert.doesNotMatch(doc.markdown, /\b(ruleset|rigou?r|repertoire|piece|binding)s?\b/i)
	})
})
