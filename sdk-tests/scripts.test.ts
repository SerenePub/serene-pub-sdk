/**
 * U-S1 — the script type grammar and its registry (18 §1–§3, §11).
 *
 * The unit ships alone and nothing is user-visible yet, so what has to be true
 * is narrow and checkable: the grammar parses what it promises and refuses what
 * it does not, the seven core contracts exist, and the projection puts them in
 * the same registry as node types under the same rules.
 *
 * The assertion worth reading is the last group. 18 §2 puts scripts "under the
 * same sync, conflict-refusal and re-projection rules as node types", and the
 * only way that stays true is for there to be one projection and one hash
 * rather than a parallel set that agrees on the day it is written.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	allScriptKinds,
	defineScriptKind,
	definePluginScriptKind,
	getScriptKind,
	isScriptKindId,
	parseScriptKindId,
	scriptContentScopes,
	scriptSpace,
	snapshotRegistry,
	allDefinitions,
	type ScriptKindDecl,
} from '@serene-pub/sdk'

/**
 * Snapshotted before any test runs.
 *
 * The registry is module state, and a later test registers a plugin type into
 * it on purpose. Reading "what core ships" at load rather than at assertion
 * time is what lets both be true without a teardown that clears declarations
 * this process cannot re-run.
 */
const AT_LOAD = allScriptKinds()
	.map((t) => t.id)
	.sort()

const CORE_V1 = [
	'core:script:text/transform@1',
	'core:script:text/stop@1',
	'core:script:messages/inject@1',
	'core:script:messages/transform@1',
	'core:script:candidates/filter@1',
	'core:script:candidates/rescore@1',
	'core:script:context/transform@1',
	// The cast scope, added 2026-08-26 for replaceable cast extraction: the
	// paste-rung half of the ruling. A scope of its own so a context edit can
	// never land on a cast list by attachment mistake.
	'core:script:cast/transform@1',
]

describe('18-S1 · the id grammar', () => {
	test('parses the three segments a script id carries', () => {
		assert.deepEqual(parseScriptKindId('core:script:text/stop@1'), {
			namespace: 'core',
			content: 'text',
			operation: 'stop',
			version: 1,
			space: 'text/stop',
		})
	})

	test('a dotted namespace is legal, a dotted segment is not', () => {
		// Plugin namespaces are reverse-DNS-ish already (`chariot.rp:`), so the
		// namespace takes dots and the payload segments do not — they are
		// matched by equality, and a dot in one is a second delimiter nobody
		// declared.
		assert.equal(
			parseScriptKindId('chariot.rp:script:text/transform@1').namespace,
			'chariot.rp',
		)
		assert.throws(
			() => parseScriptKindId('core:script:te.xt/transform@1'),
			/not a valid script/,
		)
	})

	test('refuses the shapes a near-miss actually takes', () => {
		for (const bad of [
			// A node id. The single most likely thing to be handed this by
			// mistake, and it must not parse as a script whose content is the
			// kind.
			'core:task/assemble@2',
			// The hyphen convention the segment exists to replace.
			'core:script:text-stop@1',
			// Unpinned. A script type is a contract; an unpinned contract is
			// the thing 01 §3 forbids.
			'core:script:text/stop',
			// Empty segments, uppercase, and a trailing slash.
			'core:script:/stop@1',
			'core:script:text/@1',
			'core:script:Text/Stop@1',
			'core:script:text/stop/extra@1',
			'',
		])
			assert.throws(
				() => parseScriptKindId(bad),
				/not a valid script type id/,
				`'${bad}' parsed when it should not have`,
			)
	})

	test('`isScriptKindId` agrees with the parser, and does not throw', () => {
		assert.equal(isScriptKindId('core:script:text/stop@1'), true)
		assert.equal(isScriptKindId('core:task/assemble@2'), false)
		assert.equal(isScriptKindId('nonsense'), false)
	})

	test('the chain-homogeneity key is readable off the id alone', () => {
		// The whole point of putting content in the grammar: whether two links
		// may share a chain is answerable without the registry, the script
		// body, or a database round trip.
		assert.equal(scriptSpace('core:script:text/transform@1'), 'text/transform')
		assert.notEqual(
			scriptSpace('core:script:messages/inject@1'),
			scriptSpace('core:script:messages/transform@1'),
		)
	})
})

describe('18-S1 · core ships eight contracts', () => {
	test('all eight are registered, and nothing else is', () => {
		assert.deepEqual(AT_LOAD, [...CORE_V1].sort())
	})

	test('every one is reachable by id and states its blast radius', () => {
		for (const id of CORE_V1) {
			const t = getScriptKind(id)
			assert.ok(t, `${id} is not registered`)
			// Not decoration: operations within a content scope *are* the
			// permission granularity (18 §3), so the panel needs a sentence to
			// badge each one with or the split buys nothing.
			assert.ok(t!.blastRadius, `${id} declares no blast radius`)
		}
	})

	test('stop is the verdict operation; the rest fold', () => {
		// The distinction that makes cross-source merging well-defined: a
		// verdict is reduced (earliest index wins) rather than folded, so
		// connection ∪ pipeline ∪ chat needs no precedence rule.
		assert.equal(getScriptKind('core:script:text/stop@1')!.semantics, 'verdict')
		for (const id of CORE_V1.filter((i) => i !== 'core:script:text/stop@1'))
			assert.equal(getScriptKind(id)!.semantics, 'transform', id)
	})

	test('the content scopes are derived, not restated', () => {
		assert.deepEqual(scriptContentScopes().sort(), [
			'candidates',
			'cast',
			'context',
			'messages',
			'text',
		])
	})
})

describe('18-S1 · registration refuses what it must', () => {
	const decl = (id: string): ScriptKindDecl => ({
		id,
		blastRadius: { en: 'test' },
		semantics: 'transform',
		ports: { in: { text: 'core:shape/text@1' }, out: { text: 'core:shape/text@1' } },
	})

	test('a malformed id is refused at the door, not stored', () => {
		// It matters more here than in the other registries: these ids are
		// matched by *segment*, so a malformed one does not fail loudly — it
		// quietly belongs to no chain and no hook.
		assert.throws(() => defineScriptKind(decl('core:script:text-stop@9')), /not a valid script/)
		assert.equal(getScriptKind('core:script:text-stop@9'), undefined)
	})

	test('an id has exactly one owner', () => {
		assert.throws(() => defineScriptKind(decl('core:script:text/stop@1')), /duplicate/)
	})

	test("a plugin may not claim core's namespace", () => {
		assert.throws(
			() => definePluginScriptKind('stats', decl('core:script:data/check@1')),
			/may not declare/,
		)
		// …and its own is fine, which is the half that matters: an extension
		// registering its own types under its own namespace is tier 2 of §4a,
		// and it must work without core coordinating.
		const own = definePluginScriptKind('stats', decl('stats:script:data/check@1'))
		assert.equal(getScriptKind(own.id)!.id, 'stats:script:data/check@1')
		assert.equal(parseScriptKindId(own.id).content, 'data')
		// Left registered on purpose. `_clearScriptKinds` would take core's
		// declarations with it, and this process cannot re-run the module's
		// side effects — a teardown that breaks every later assertion is worse
		// than a registry with one extra row in it.
	})
})

describe('18-S1 · one registry, one projection', () => {
	test('a script type projects with kind "script" and its semantics', () => {
		const [entry] = snapshotRegistry([getScriptKind('core:script:text/transform@1')!], {
			release: 'test',
		})
		assert.equal(entry!.id, 'core:script:text/transform')
		assert.equal(entry!.version, 1)
		assert.equal(entry!.kind, 'script')
		assert.equal(entry!.semantics, 'transform')
		assert.deepEqual(entry!.ports.in, { text: 'core:shape/text@1' })
		// No slots. A script type is a contract; what is configurable about a
		// script is the script.
		assert.deepEqual(entry!.slots, {})
	})

	test('the blast radius rides in i18n, where display text is stripped from the hash', () => {
		const [entry] = snapshotRegistry([getScriptKind('core:script:text/stop@1')!], {
			release: 'test',
		})
		assert.equal((entry!.i18n as { blastRadius?: unknown }).blastRadius !== undefined, true)
	})

	test('node types keep their kind and carry no semantics', () => {
		// The other half of "one projection": widening it must not have moved
		// anything about node types, whose hashes are frozen.
		const nodes = snapshotRegistry(allDefinitions().slice(0, 5), { release: 'test' })
		for (const e of nodes) {
			assert.notEqual(e.kind, 'script')
			assert.equal(e.semantics, undefined)
		}
	})
})
