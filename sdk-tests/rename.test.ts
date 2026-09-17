/**
 * The one-shot rename (plans/30 §U3; R-1, R-4, R-7 P2, R-10, R-13, R-14 —
 * ruled 2026-09-14/15, landed 2026-09-16). Each pin here is a word the
 * constitution now uses, held against the code: the kinds and their ids, the
 * clauses, the one event registry, the four-scope chain, the params owner rule,
 * and the deprecated spellings a plugin may still import for one release.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	spec,
	slot,
	compile,
	validate,
	allDefinitions,
	allEvents,
	CORE_EVENTS,
	sessionEvents,
	SCOPE_ORDER,
	WRITE_MATRIX,
	S,
	pin,
	describeQueryDefinition,
	// the deprecated spellings — resolvable, and the same objects
	describeQueryType,
	getType,
	getDefinition,
	pipelineHook,
	handler,
	defineScriptType,
	defineScriptKind,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_SPECS } from '@serene-pub/core-catalog'
import type { SpecDocument } from '@serene-pub/sdk'

/** `CoreSpec.build` is typed `any` (it compiles lazily); pin the document here. */
const built = (slug: string): SpecDocument => CORE_SPECS.find((s) => s.slug === slug)!.build()

const KINDS = ['inlet', 'query', 'task', 'oracle', 'outlet', 'entry']
const CLAUSES = ['gather', 'each', 'loop', 'junction']

describe('R-13 · kinds are inlet · query · task · oracle · outlet, and the id says so', () => {
	test('every registered definition is one of the six kinds', () => {
		for (const d of allDefinitions()) assert.ok(KINDS.includes(d.kind), `${d.id} is ${d.kind}`)
	})

	test('the kind is the second segment of the id (01 §3a) — no input/provider/consumer survives', () => {
		// A plugin id may omit the kind segment (`chariot.dice-tray:roll@1`);
		// one that states it must state the kind it is.
		for (const d of allDefinitions()) {
			const m = /^[^:]+:([a-z]+)\//.exec(d.id)
			if (!m) continue
			assert.equal(m[1], d.kind, `${d.id} says ${m[1]} but is a ${d.kind}`)
		}
		const ids = allDefinitions().map((d) => d.id)
		assert.equal(ids.filter((id) => /:(input|provider|consumer)\//.test(id)).length, 0)
	})

	test('the shipped specs carry the new kinds in every node row', () => {
		for (const s of CORE_SPECS) {
			for (const n of (s.build() as SpecDocument).nodes) {
				assert.ok(KINDS.includes(n.kind), `${s.slug} ${n.key} kind ${n.kind}`)
				assert.match(n.definitionId, /^[^:]+:(inlet|query|task|oracle|outlet)\//)
			}
		}
	})

	test('the culled inlet is gone: core:inlet/message-created@1 had no spec and no emitter', () => {
		assert.equal(allDefinitions().some((d) => /message-created@/.test(d.id)), false)
	})
})

describe('R-14 · clauses are gather · each · loop · junction', () => {
	test('every clause a shipped spec declares is one of the four, and the document says `clauses`', () => {
		let seen = new Set<string>()
		for (const s of CORE_SPECS) {
			const doc: SpecDocument = s.build()
			assert.ok(Array.isArray(doc.clauses), `${s.slug} has no clauses array`)
			assert.equal('blocks' in doc, false, `${s.slug} still carries blocks`)
			for (const c of doc.clauses) {
				assert.ok(CLAUSES.includes(c.kind), `${s.slug} ${c.id} kind ${c.kind}`)
				seen.add(c.kind)
			}
			for (const n of doc.nodes)
				if (n.clauseKind) assert.ok(CLAUSES.includes(n.clauseKind))
		}
		// The catalog exercises every rule — a clause kind nobody ships is a
		// clause kind nothing here proves.
		assert.deepEqual([...seen].sort(), [...CLAUSES].sort())
	})

	test('the tool loop is keyed `tools`, never `agent` (NOMENCLATURE §4 carry)', () => {
		const loop = built('core:spec/tool-loop')
		assert.ok(loop.clauses.some((c) => c.id === 'tools' && c.kind === 'loop'))
		assert.equal(loop.nodes.some((n) => n.key.startsWith('agent.')), false)
		// The query that lists what the install offers moved off `tools` to
		// make room: nodes and clauses share one address space.
		assert.ok(loop.nodes.some((n) => n.key === 'available'))
	})

	test('no shipped spec gives a node and a clause the same key — one address space', () => {
		for (const s of CORE_SPECS) {
			const doc: SpecDocument = s.build()
			const nodeKeys = new Set(doc.nodes.map((n) => n.key))
			for (const c of doc.clauses)
				assert.equal(nodeKeys.has(c.id), false, `${s.slug}: '${c.id}' is both`)
		}
		// And the builder refuses it at authoring time.
		assert.throws(
			() =>
				spec('demo:clash', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.query('tools', ($) => C.availableTools.v1({ scope: $.input.sessionScope }))
					.loop('tools', { repeatWhile: ($: any) => $.tools.item.q.main, max: 2 }, (l) =>
						l.query('q', ($: any) => C.availableTools.v1({ scope: $.input.sessionScope })),
					),
			/one address space/,
		)
	})

	test('a junction declares `branches`, not `routes`', () => {
		const adv = built('core:spec/adventure-respond')
		const j = adv.clauses.find((c) => c.kind === 'junction')!
		assert.ok(j.branches && Object.keys(j.branches).length > 0)
		assert.equal('routes' in j, false)
	})
})

describe('R-4 · one event registry; the inlet lock is the only subscription', () => {
	test('the genre events are CORE_EVENTS, by id', () => {
		const ids = new Set(allEvents().map((e) => `core:event/${e.slug}@${e.version}`))
		for (const id of Object.values(sessionEvents)) assert.ok(ids.has(id), `${id} not in the registry`)
		assert.equal(sessionEvents.messageRespond, 'core:event/message-respond@1')
		assert.equal(CORE_EVENTS.messageRespond.family, 'action')
	})

	test('the data events core outlets cause are registered, with their causes', () => {
		const causes = new Set(allDefinitions().map((d) => d.causesEvent).filter(Boolean))
		for (const ev of causes) {
			const [, slug] = /^core:event\/([a-z-]+)@1$/.exec(ev as string) ?? []
			assert.ok(allEvents().some((e) => e.slug === slug), `${ev} is caused and not registered`)
		}
	})

	test('no document carries `subscribes`; the lock is on `input`', () => {
		for (const s of CORE_SPECS) {
			const doc: SpecDocument = s.build()
			assert.equal('subscribes' in doc, false, s.slug)
		}
		const respond = built('core:spec/respond')
		assert.equal(respond.input?.event, 'core:event/message-respond@1')
	})

	test('an action says its venues; nothing says kind, pick, zone or triggers', () => {
		// U5c: `contributes.triggers` folded into `contributes.actions`, each
		// with a venue list — a stored document carries only the new spelling.
		for (const s of CORE_SPECS) {
			const doc: SpecDocument = s.build()
			assert.equal((doc.contributes as any)?.triggers, undefined, `${s.slug} still says triggers`)
			const actions = (doc.contributes as any)?.actions ?? []
			for (const a of actions) {
				assert.ok(Array.isArray(a.venue) && a.venue.length, `${s.slug} action ${a.key} venue`)
				for (const v of a.venue)
					assert.ok(['composer', 'message'].includes(v.kind), `${s.slug} action venue ${v.kind}`)
				assert.equal('kind' in a, false)
				assert.equal('pick' in a, false)
			}
			assert.equal((doc.taxonomy as any)?.zone, undefined, `${s.slug} still has a zone`)
		}
	})
})

describe('R-10 · the scope chain is session · preset · defaults · author', () => {
	test('the constant and the matrix agree', () => {
		assert.deepEqual(SCOPE_ORDER, ['session', 'preset', 'defaults', 'author'])
		for (const scopes of Object.values(WRITE_MATRIX))
			for (const s of scopes) assert.ok(SCOPE_ORDER.includes(s), `matrix names ${s}`)
	})
})

describe('R-7 P2 · one params owner per setting per spec', () => {
	// Keyed on `FieldDecl.shared` (U3b, 2026-09-16): a definition says which
	// of its fields are one setting wherever two of it run side by side.
	const lane = pin(
		describeQueryDefinition({
			id: 'demo:query/lane@1',
			timeoutMs: 100,
			ports: { in: { scope: S.json }, out: { main: S.json } },
			slots: {
				params: {
					kind: 'parameters',
					schema: {
						depth: { type: 'integer', default: 3, shared: true, i18n: { en: 'Scan depth' } },
						share: { type: 'number', default: 0.2, i18n: { en: 'Share' } },
					},
				},
			},
		}),
	)
	const two = (second: Record<string, unknown>) =>
		compile(
			spec('demo:p2', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('a', ($) => lane.v1({ scope: $.input.sessionScope, params: slot.params() }))
				.query('b', ($) => lane.v1({ scope: $.input.sessionScope, ...second }))
				.build(),
		)
	const p2 = (doc: ReturnType<typeof two>) => validate(doc).filter((f) => f.law === '12 §2 P2')

	test('two own-node params slots declaring the same shared field is a diagnostic', () => {
		const f = p2(two({ params: slot.params() }))
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /'a' and 'b' both own a params slot declaring the shared 'depth'/)
		// The unmarked `share` is each node's own and is not named.
		assert.doesNotMatch(f[0]!.message, /'share'/)
		assert.match(f[0]!.fix, /slot\.params\(\{ node: 'a' \}\)/)
	})

	test('a reference to the owner is not an owner', () => {
		assert.deepEqual(p2(two({ params: slot.params({ node: 'a' }) })), [])
	})

	test('same-named fields nobody marked shared are several settings, not one', () => {
		const own = pin(
			describeQueryDefinition({
				id: 'demo:query/own-lane@1',
				timeoutMs: 100,
				ports: { in: { scope: S.json }, out: { main: S.json } },
				slots: {
					params: {
						kind: 'parameters',
						schema: { maxEntries: { type: 'integer', default: 5, i18n: { en: 'Most entries' } } },
					},
				},
			}),
		)
		const doc = compile(
			spec('demo:p2own', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('a', ($) => own.v1({ scope: $.input.sessionScope, params: slot.params() }))
				.query('b', ($) => own.v1({ scope: $.input.sessionScope, params: slot.params() }))
				.build(),
		)
		assert.deepEqual(p2(doc), [])
	})

	test('the shipped specs trip it nowhere', () => {
		for (const { slug } of CORE_SPECS) assert.deepEqual(p2(built(slug)), [], slug)
	})

	test('the lore lanes and the embed pair are one owner each in the shipped reply specs', () => {
		for (const slug of ['core:spec/respond', 'core:spec/adventure-respond']) {
			const doc = built(slug)
			for (const key of ['gather.characterLore.read', 'gather.historyEntries.read']) {
				const n = doc.nodes.find((x) => x.key === key)!
				assert.equal(n.resolvedRefs?.['params'], 'gather.worldLore.read', `${slug} ${key}`)
			}
		}
		for (const slug of ['core:spec/respond', 'core:spec/narrate', 'core:spec/narrate-character']) {
			const doc = built(slug)
			const n = doc.nodes.find((x) => x.key === 'names.arm.embed')!
			assert.equal(n.resolvedRefs?.['params'], 'semantic.arm.embed', slug)
		}
	})
})

describe('the deprecated spellings resolve to the same things, for one release', () => {
	test('aliases are the renamed values', () => {
		assert.equal(describeQueryType, describeQueryDefinition)
		assert.equal(getType, getDefinition)
		assert.equal(pipelineHook, handler)
		assert.equal(defineScriptType, defineScriptKind)
	})
})
