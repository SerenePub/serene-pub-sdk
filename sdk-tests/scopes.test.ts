/**
 * 🚧 Scopes and visibility (PLAN-rulesets-functions D4, 2026-10-23).
 *
 * A scope is a function of kind `scope` — prose and an optional body that
 * returns members, never a write. Core reserves four (same place, within a
 * tie, aimed at, everyone) as references a ruleset may name before their
 * modules are registered. A `visibility` says `holder`, `gm` or `everyone`,
 * or names a scope; who may change a thing is said apart (`changedBy`).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	CORE_SCOPE_IDS,
	CORE_FUNCTION_IDS,
	definePluginFunction,
	functionProvides,
	functionRefKind,
	isVisibilityWord,
	RESERVED_FUNCTIONS,
	rulesetAttributeFindings,
	rulesetSectionFindings,
	visibilityFindings,
	VISIBILITY_WORDS,
	type FunctionDecl,
} from '@serene-pub/sdk'

const reasons = (findings: readonly string[]): string[] => findings.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1] ?? f)
const has = (findings: readonly string[], reason: string) =>
	assert.ok(reasons(findings).includes(reason), `expected [${reason}] in:\n${findings.join('\n')}`)

const BONDED = definePluginFunction('acme.scope', 'acme.scope:function/who-hears@1', {
	name: 'Who hears a confession',
	meaning: 'Everyone in the same place, and anyone with a tie to either of them.',
	kind: 'scope',
	bindings: { ties: { to: 'entry-type', tags: ['relationship'] } },
	prose: 'Everyone in the same place hears a confession, and so does anyone with a bond to either of them.',
	phases: ['derived'],
	body: 'export function derived({ source, cast }) { return { members: cast.filter((c) => c.location === source.location) } }',
})

describe('scopes', () => {
	test('core reserves four, as scope functions', () => {
		assert.deepEqual(Object.values(CORE_SCOPE_IDS), [CORE_FUNCTION_IDS.samePlace, CORE_FUNCTION_IDS.withinTie, CORE_FUNCTION_IDS.aimedAt, CORE_FUNCTION_IDS.everyone])
		for (const id of Object.values(CORE_SCOPE_IDS)) {
			assert.equal(RESERVED_FUNCTIONS[id]!.kind, 'scope')
			assert.equal(functionRefKind({ ref: id }), 'scope')
			assert.equal(functionProvides(id).decides, false)
		}
	})

	test('a scope of a package’s own is a function with a body that returns members', () => {
		const p = functionProvides(BONDED)
		assert.deepEqual([p.kind, p.decides, p.headerOnly], ['scope', false, false])
	})
})

describe('visibility', () => {
	test('a word, or a scope — never another kind of function, never a stray word', () => {
		assert.deepEqual([...VISIBILITY_WORDS], ['holder', 'gm', 'everyone'])
		for (const w of VISIBILITY_WORDS) {
			assert.ok(isVisibilityWord(w))
			assert.deepEqual(visibilityFindings(w, 'v'), [])
		}
		assert.deepEqual(visibilityFindings(CORE_SCOPE_IDS.samePlace, 'v'), [])
		assert.deepEqual(visibilityFindings(BONDED.id, 'v'), [])
		has(visibilityFindings(CORE_FUNCTION_IDS.dieTarget, 'v'), 'bad-visibility')
		has(visibilityFindings('acme.scope:function/ghost@1', 'v'), 'unknown-function')
		has(visibilityFindings('the party', 'v'), 'bad-visibility')
		// A ruleset may carry its own scope module and name it.
		const own: FunctionDecl = { id: 'acme.scope:function/my-table@1', name: 'My table', meaning: 'Who sits at my table.', kind: 'scope', prose: 'Everyone at the table.' }
		has(visibilityFindings(own.id, 'v'), 'unknown-function')
		assert.deepEqual(visibilityFindings(own.id, 'v', new Map([[own.id, own]])), [])
	})

	test("an attribute's visibility and who may change it are two declarations", () => {
		const a = { id: 'affection', name: 'Affection', kind: 'number' as const, prose: 'How much someone likes you.' }
		assert.deepEqual(rulesetAttributeFindings({ ...a, visibility: 'holder', changedBy: ['rules', 'gm'] }, 'a'), [])
		assert.deepEqual(rulesetAttributeFindings({ ...a, visibility: BONDED.id, changedBy: ['everyone'] }, 'a'), [])
		has(rulesetAttributeFindings({ ...a, visibility: 'holder', carriedBy: ['cast', 'world'] }, 'a'), 'bad-visibility')
		has(rulesetAttributeFindings({ ...a, changedBy: [] }, 'a'), 'bad-changed-by')
	})

	test('in a ruleset: a carried scope module is a scope its parts may name', () => {
		const module: FunctionDecl = { id: 'acme.scope:function/my-table@1', name: 'My table', meaning: 'Who sits at my table.', kind: 'scope', prose: 'Everyone at the table.' }
		const rs = {
			name: 'Table',
			attributes: [{ id: 'secret', name: 'Secret', kind: 'label' as const, visibility: module.id, prose: 'What someone keeps back.' }],
			functions: [{ ref: module.id, module }],
		}
		assert.deepEqual(rulesetSectionFindings('acme.scope:ruleset/table@1', rs), [])
		has(rulesetSectionFindings('acme.scope:ruleset/table@1', { ...rs, functions: [] }), 'unknown-function')
	})
})
