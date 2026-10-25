/**
 * 🚧 A ruleset's actions and replies that carry changes — the spec side
 * (lane A2, PLAN-rulesets-functions D6, D7; 2026-10-23):
 *
 *  · `core:inlet/rules-action@1` — where the one generic rules-action
 *    pipeline enters: the function, its answer, who acts and at whom, the
 *    registration's mode, the session;
 *  · `core:spec/rules-action` — the invokable function run by the ruleset
 *    handler with the answer, applied or proposed under the registration's
 *    mode;
 *  · Story's reply gains *Replies carry changes* — the reply's own switch,
 *    off by default — and a `changes` branch beside the prose it always was.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { getDefinition, validate } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { RULES_ACTION_SPEC_ID, rulesActionSpec } from '../core-catalog/src/rulesets/rulesAction.js'
import * as cat from '../core-catalog/src/index.js'
import { storyRespondSpec } from '../core-catalog/src/genres/story/respond.js'

const errors = (doc: Parameters<typeof validate>[0]) => validate(doc).filter((f) => f.severity === 'error')

describe('core:inlet/rules-action@1', () => {
	test('the function, its answer, who acts and at whom, the mode, the session — and the payload whole', () => {
		const d = getDefinition('core:inlet/rules-action@1')!
		assert.ok(d, 'declared')
		assert.equal(C.rulesAction.id, 'core:inlet/rules-action@1')
		assert.deepEqual(Object.keys(d.ports.out!).sort(), ['actor', 'aimedAt', 'answer', 'function', 'main', 'mode', 'ruleset', 'session', 'sessionId', 'sessionScope'])
		assert.equal((d as { entities?: Record<string, string> }).entities?.actor, 'actor')
	})
})

describe('core:spec/rules-action', () => {
	test('compiles clean: the inlet, then the ruleset handler at the registration’s mode', () => {
		const doc = rulesActionSpec()
		assert.equal(doc.id, RULES_ACTION_SPEC_ID)
		assert.deepEqual(errors(doc), [])
		assert.equal(doc.nodes[0]!.definitionId, 'core:inlet/rules-action')
		const resolves = doc.nodes.filter((n) => n.definitionId === 'core:task/ruleset-resolve')
		assert.deepEqual(resolves.map((n) => [n.key, (n.config as { mode?: unknown }).mode]), [['commit.reviewed.propose', 'propose'], ['commit.applied.apply', 'apply']])
		// The payload whole is what runs the function with its answer.
		for (const n of resolves) assert.deepEqual((n.config as { actions?: unknown }).actions, { __ref: 'data', node: 'input', port: 'main' })
		const commit = doc.clauses.find((c) => c.id === 'commit')!
		assert.equal(commit.kind, 'junction')
		assert.deepEqual(Object.keys(commit.branches ?? {}), ['reviewed', 'applied'])
		assert.equal((commit.branches as Record<string, { equals?: unknown }>).reviewed!.equals, 'review')
	})
})

describe('Story’s reply: Replies carry changes', () => {
	test('the reply’s own switch, off by default and the owner’s to flip', () => {
		const schema = (getDefinition('core:task/reply-duties@1')!.slots as any).params.schema
		assert.deepEqual(Object.keys(schema), ['lore', 'scene', 'changes'])
		assert.deepEqual([schema.changes.default, schema.changes.reach], [false, 'owner'])
		assert.ok(getDefinition('core:task/ruleset-resolve@1')!.ports.out!.replySchema, 'the reply schema has a port of its own')
	})

	test('a `changes` branch beside the prose: the schema, one JSON answer, its words saved, its changes through the rules', () => {
		const doc = storyRespondSpec()
		assert.deepEqual(errors(doc), [])
		const reply = doc.clauses.find((c) => c.id === 'reply')!
		assert.equal(reply.kind, 'junction')
		assert.deepEqual(Object.keys(reply.branches ?? {}), ['changes', 'prose'])
		assert.equal((reply.branches as Record<string, { path?: string; equals?: unknown }>).changes!.path, 'reply-changes')
		const key = (k: string) => doc.nodes.find((n) => n.key === k)
		// Off: the prose it always was — generate-text; its words handed on as the junction's `text`.
		assert.equal(key('reply.prose.generate')!.definitionId, 'core:oracle/generate-text')
		// On: the schema from the ruleset, generate-json instead, its changes parsed, its words last.
		assert.equal(key('reply.changes.shape')!.definitionId, 'core:task/ruleset-resolve')
		assert.equal(key('reply.changes.generate')!.definitionId, 'core:oracle/generate-json')
		assert.equal(key('reply.changes.asked')!.definitionId, 'core:task/parse-json')
		assert.equal(key('reply.changes.message')!.definitionId, 'core:task/join-text')
		// 🚧 RF fix 3 (2026-10-23): the branches hold only what differs — the call and what reads its answer.
		const inBranch = (chain: string) => doc.nodes.filter((n) => n.clauseId === 'reply' && n.clauseChain === chain).map((n) => n.key)
		assert.deepEqual(inBranch('prose'), ['reply.prose.generate'])
		assert.deepEqual(inBranch('changes'), ['owners', 'shape', 'generate', 'asked', 'message'].map((k) => `reply.changes.${k}`))
		// ONE tail after the junction, at the top-level keys: the save, the commit, the line's face — once each.
		for (const [k, def] of [['save', 'core:outlet/update-message'], ['spritePick', 'core:oracle/pick-sprite'], ['spriteShow', 'core:outlet/show-sprite']] as const) {
			assert.equal(doc.nodes.filter((n) => n.definitionId === def).map((n) => n.key).join(), k, def)
			assert.equal(key(k)!.clauseId, undefined, k)
		}
		const order = (k: string) => doc.nodes.findIndex((n) => n.key === k)
		assert.ok(order('reply.changes.message') < order('save') && order('save') < order('commit.applied.apply') && order('commit.applied.apply') < order('spritePick'))
		// The save and the picker read the junction's words, whichever branch fired; the trace and parts from the prose call.
		const into = (to: string, port: string) => doc.edges.find((e) => e.to === to && e.toPort === port)
		assert.deepEqual([into('save', 'text')?.from, into('save', 'text')?.fromPort, into('save', 'text')?.shape], ['reply', 'text', 'core:shape/text@1'])
		assert.deepEqual([into('spritePick', 'text')?.from, into('spritePick', 'text')?.fromPort], ['reply', 'text'])
		assert.equal(into('save', 'reasoning')?.from, 'reply.prose.generate')
		// The changes at the reply's OWN mode (S2 — its `changes` duty as `reading` publishes it, never the
		// reckoning's by spec id), after the save, on the same predicate the `changes` branch fired on: Apply alone.
		const commit = doc.clauses.find((c) => c.id === 'commit')!
		assert.equal(commit.clauseId, undefined)
		assert.deepEqual((commit as { on?: unknown }).on, { __ref: 'data', node: 'reading', port: 'modes' })
		assert.deepEqual(Object.keys(commit.branches ?? {}), ['applied'])
		const applied = (commit.branches as Record<string, { path?: string; equals?: unknown }>).applied!
		assert.deepEqual([applied.path, applied.equals], ['reply-changes', 'full'])
		const changes = (reply.branches as Record<string, { path?: string; equals?: unknown }>).changes!
		assert.deepEqual([applied.path, applied.equals], [changes.path, changes.equals])
		assert.deepEqual([into('commit.applied.apply', 'owners')?.from, into('commit.applied.apply', 'deltas')?.from], ['reply.changes.owners', 'reply.changes.asked'])
		assert.ok(!JSON.stringify(commit).includes('story-reckoning'), 'the reckoning is not read')
		// The reply's model and prompt are the prose branch's pick; the JSON one runs on the same loadout.
		const config = JSON.stringify(doc)
		assert.ok(!/"ofNode":"generate"/.test(config), 'no slot names the old top-level generate')
	})

	test('every core spec still compiles clean', () => {
		for (const s of cat.CORE_SPECS) assert.deepEqual(errors(s.build()), [], s.slug)
	})
})
