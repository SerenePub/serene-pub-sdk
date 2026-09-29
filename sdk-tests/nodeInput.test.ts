/**
 * The runtime half of "handler input types come from the contract".
 *
 * `InputOf` is checked by `tsc` and vanishes; `suppliesOf` is what a *runtime*
 * consumer gets — a plugin binding a handler to somebody else's type, and the
 * admin-side orchestrator composing nodes in the UI. Neither can typecheck
 * anything, so the two derivations have to agree, and the agreement has to be
 * asserted rather than assumed: they read the same declaration from opposite
 * ends, and a divergence would show up as a check that passes on a binding the
 * compiler would have refused.
 *
 * The compile-time side is `nodeInput.assert.ts`, which `npm test` runs first
 * (`tsc --noEmit && tsx --test`).
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	describeQueryDefinition,
	declaresReads,
	pin,
	reads,
	readsOf,
	suppliesOf,
	S,
	ok,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

describe('suppliesOf — the runtime twin of InputOf', () => {
	test('reads in-ports and slot names as one flat set, because input is flat', () => {
		const s = suppliesOf(C.vectorSearch)
		assert.equal(s.id, 'core:query/vector-search@1')
		// `resolveInput` builds one object out of wired edges and resolved slot
		// refs alike, so a handler cannot tell a port from a slot and neither
		// does this.
		assert.deepEqual([...s.ports].sort(), ['params', 'scope', 'vectors'])
	})

	test('reads the params slot schema, with each field type', () => {
		const s = suppliesOf(C.vectorSearch)
		assert.deepEqual([...s.params].sort(), ['maxEntries', 'similarityFalloff', 'topK'])
		assert.equal(s.paramTypes.topK, 'integer')
		// The defect this whole exercise is named after: `topK` is a PARAMETER.
		// It must never appear as a port, which is where the binding read it.
		assert.equal(s.ports.includes('topK'), false)
	})

	test('session-history supplies limit and channel as params, not as ports', () => {
		const s = suppliesOf(C.sessionHistory)
		// `share`, `maxEntries`, `minEntries` joined `priority` 2026-09-16 (R-7
		// P5): the conversation's band intent, declared on the source.
		assert.deepEqual(
			[...s.params].sort(),
			// `unplayedOnly` 2026-09-28 (lair re-plan R13): the side channel's
			// talk since the story's last line.
			['channel', 'limit', 'maxEntries', 'minEntries', 'priority', 'share', 'talkOnly', 'unplayedOnly'],
		)
		assert.equal(s.ports.includes('limit'), false)
		assert.equal(s.ports.includes('channel'), false)
	})

	test('a type with no parameters supplies none — not "all"', () => {
		// The `never` trap: a mapped type over `never` has `keyof` of
		// `string | number | symbol`, so the empty case is the one most at risk
		// of quietly answering "everything".
		const s = suppliesOf(C.userMessage)
		assert.deepEqual(s.params, [])
		assert.deepEqual(s.ports, ['scripts'])
	})

	test('accepts the pinned form and a bare descriptor alike', () => {
		const bare = describeQueryDefinition({
			id: 'test:query/bare@1',
			ports: { in: { a: S.text }, out: { main: S.text } },
		})
		assert.deepEqual(suppliesOf(bare).ports, ['a'])
		assert.deepEqual(suppliesOf(pin(bare)).ports, ['a'])
	})

	test('anything that is not a contract answers emptily and says so', () => {
		assert.deepEqual(suppliesOf(undefined), {
			id: '(unknown type)',
			ports: [],
			params: [],
			paramTypes: {},
		})
	})
})

describe('declaresReads — the additive half of a binding', () => {
	const hook = async () => ok({ main: 1 })

	test('returns the same function object, so binding identity survives', () => {
		const declared = declaresReads(hook, { ports: ['scope'], params: ['limit'] })
		assert.equal(declared, hook)
	})

	test('a declared hook is still an ordinary Hook', async () => {
		const declared = declaresReads(hook, { ports: [], params: [] })
		assert.deepEqual(await declared(), ok({ main: 1 }))
	})

	test('readsOf finds a declaration and ignores everything else', () => {
		assert.deepEqual(
			readsOf(declaresReads(async () => ok({}), { ports: ['a'], params: ['b'] })),
			{ ports: ['a'], params: ['b'] },
		)
		assert.equal(
			readsOf(async () => ok({})),
			undefined,
		)
		assert.equal(readsOf(undefined), undefined)
		// A `requires` of the wrong shape is not a declaration. Half a
		// declaration would be checked as if it were whole, and the missing
		// half would read as "requires nothing".
		assert.equal(readsOf(Object.assign(() => {}, { requires: { ports: ['a'] } })), undefined)
	})
})

describe('reads — the typed declaration', () => {
	test('records exactly what was declared, in HandlerRequires shape', () => {
		const hook = async () => ok({ main: [] })
		const declared = reads<typeof C.sessionHistory>(hook, {
			ports: ['scope'],
			params: ['limit', 'channel'],
		})
		assert.equal(declared, hook, 'same function object, as declaresReads')
		assert.deepEqual(readsOf(declared), { ports: ['scope'], params: ['limit', 'channel'] })
	})

	test('params is optional and records as an empty list', () => {
		const declared = reads<typeof C.userMessage>(async (i) => ok(i), { ports: [] })
		assert.deepEqual(readsOf(declared), { ports: [], params: [] })
	})

	test('an identical redeclaration is a no-op', () => {
		const hook = async () => ok({ main: [] })
		reads<typeof C.sessionHistory>(hook, { ports: ['scope'], params: ['limit'] })
		assert.doesNotThrow(() =>
			reads<typeof C.sessionHistory>(hook, { ports: ['scope'], params: ['limit'] }),
		)
	})

	test('a DIFFERENT redeclaration on the same function object is refused', () => {
		// A declaration attaches to the function, so a handler two pins share
		// can carry only one. Silently replacing the first would leave one pin
		// checked against the other's reads; refusing is what makes the
		// per-pin arrow the only way to bind a shared handler that reads
		// differently.
		const hook = async () => ok({ main: [] })
		reads<typeof C.sessionHistory>(hook, { ports: ['scope'], params: ['limit'] })
		assert.throws(
			() => reads<typeof C.sessionHistory>(hook, { ports: ['scope'], params: ['channel'] }),
			/already declares what it reads/,
		)
	})
})

describe('the two derivations agree', () => {
	// A handler typed `InputOf<typeof C.sessionHistory>` may read exactly these
	// names; `suppliesOf` must answer with exactly these names. Written out
	// rather than computed from each other, so a change to either side has to
	// be made here too.
	test('session-history', () => {
		const s = suppliesOf(C.sessionHistory)
		// `budget` was here until 2026-09-16: an in-port nothing filled and
		// nothing read, culled under R-12.
		// `messageId` since 2026-09-28 (lair re-plan R11): one row, by id.
		assert.deepEqual([...s.ports].sort(), ['messageId', 'params', 'scope'])
		assert.deepEqual(
			[...s.params].sort(),
			// `unplayedOnly` 2026-09-28 (lair re-plan R13): the side channel's
			// talk since the story's last line.
			['channel', 'limit', 'maxEntries', 'minEntries', 'priority', 'share', 'talkOnly', 'unplayedOnly'],
		)
	})

	test('the three lore lanes are interchangeable, which is why one handler serves them', () => {
		const [w, c, h] = [
			suppliesOf(C.worldLore),
			suppliesOf(C.characterLore),
			suppliesOf(C.historyEntries),
		]
		// The same seven knobs on all three — one `loreSlots()` helper declares
		// them, which is what makes one handler honest.
		assert.deepEqual([...w.params].sort(), [...c.params].sort())
		assert.deepEqual([...w.params].sort(), [...h.params].sort())
		// World lore and history take the same ports, exactly.
		assert.deepEqual([...w.ports].sort(), [...h.ports].sort())
		assert.deepEqual([...w.ports].sort(), ['params', 'scope'])
		/**
		 * ⚠ **Character lore declares one port more** (W1, 2026-09-17):
		 * `speaker`, the per-speaker visibility subject. Its two siblings do not,
		 * and that is the check working rather than a divergence — character
		 * lore is the one band a lorebook binding gates, so it is the one lane a
		 * speaker means anything on.
		 *
		 * The shared handler is still typed against the INTERSECTION
		 * (`SharedInput`), which is still these two names, so nothing about "one
		 * handler serves three lanes" changed: the speaker reaches it as its own
		 * argument, from the one arrow that has one.
		 */
		assert.deepEqual([...c.ports].sort(), ['params', 'scope', 'speaker'])
	})
})
