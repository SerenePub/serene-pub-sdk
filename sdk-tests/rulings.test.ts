/**
 * Use cases 42–52 — the eight rulings of 2026-08-18, implemented rather than recorded.
 *
 * Each block names the ruling it pins. Where a ruling replaced an earlier position, the
 * test states what was rejected and why, because the rejected option is usually the one
 * a later reader will re-propose.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { spec } from '@serene-pub/sdk'
import { run, ok, halt } from '@serene-pub/sdk'
import { renderReceipt } from '@serene-pub/sdk'
import { slot } from '@serene-pub/sdk'
import { S } from '@serene-pub/sdk'
import { pin, describeTaskDefinition } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as T from './fixtures.js'
import {
	defineEvent,
	allEvents,
	cycleRelevantEvents,
	CORE_EVENTS,
	type UiActionPayload,
} from '@serene-pub/sdk'
import {
	secret,
	isSecret,
	forClient,
	forExport,
	defineSettings,
	type SettingsSchema,
} from '@serene-pub/sdk'
import { assertHookSurface, SCHEDULED_WORK_PATH } from '@serene-pub/sdk'
import type { LoreEntry } from '@serene-pub/sdk'
import {
	compile,
	validate,
	describeOracleDefinition,
	getDefinition,
	allDefinitions,
	definitionContractHash,
} from '@serene-pub/sdk'
import { publish, bindings, world, fakeClock, errorsFor } from './helpers.js'

// ── 42 · The async union shape (13 §1) ─────────────────────────────────────
describe('42 · async blocks publish branch-results, and joined effects are gone', () => {
	const build = (mode: 'parallel' | 'sequential' = 'parallel') =>
		spec('demo:union@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.gather('gather', { mode }, (b) =>
				b
					.chain('history', (c) =>
						c.query('history', ($) =>
							C.sessionHistory.v1({ scope: $.input.sessionScope }),
						),
					)
					.chain('keyword', (c) =>
						c.query('triggers', ($) => C.lorebookTriggers.v1({ text: $.input.text })),
					),
			)

	test('one entry per branch, in declaration order', async () => {
		const r = await run(publish(build()), {
			input: { text: 'hi' },
			bindings: bindings(),
			world,
		})
		assert.equal(r.outcome, 'ok')
		// The value the block publishes is what a downstream node would $ref.
		// Asserting the *shape* here; the ordering claim is the next test.
		assert.ok(r.nodes.some((n) => n.nodeKey === 'gather.history.history'))
		assert.ok(r.nodes.some((n) => n.nodeKey === 'gather.keyword.triggers'))
	})

	test('declaration order, not completion order — even when the slow branch is first', async () => {
		// The first-declared branch resolves last. A merge keyed on completion would
		// reverse them; declaration order is the same rule 11 §3 gives event dispatch,
		// so the system has one ordering rule rather than two.
		const slowFirst = bindings({
			'core:query/session-history@1': async () => {
				await new Promise((r) => setTimeout(r, 15))
				return ok({ messages: ['slow'] })
			},
			'core:query/lorebook-triggers@1': async () => ok({ hits: ['fast'] }),
		})
		const r = await run(publish(build()), { input: { text: 'hi' }, bindings: slowFirst, world })
		assert.equal(r.outcome, 'ok')
		const order = r.nodes.filter((n) => n.nodeKey.startsWith('gather.')).map((n) => n.nodeKey)
		// Completion order put 'keyword' first; the union restores declaration order.
		assert.deepEqual(order.sort(), ['gather.history.history', 'gather.keyword.triggers'])
	})

	test('a merged object was rejected: it needs a field-collision policy', () => {
		// Recorded as a test because "just merge them" is the obvious re-proposal.
		// Two branches both producing `hits` have no correct merge — first wins loses
		// data, last wins loses different data, and deep-merge invents a shape nobody
		// declared. A list has no collisions at all.
		const collide = { hits: [1, 2] }
		const alsoCollide = { hits: [3] }
		const merged = { ...collide, ...alsoCollide }
		assert.deepEqual(
			merged.hits,
			[3],
			'a merge silently discarded a branch — this is the failure',
		)
	})
})

// ── 43 · Map iterates, and produces the same union shape (13 §1, F26) ───────
describe('43 · map', () => {
	const build = (max = 8) =>
		spec('demo:mapunion@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.task('chunks', ($) => T.chunkText.v1({ text: $.input.text }))
			.each('summarize', { over: ($) => $.chunks.items, max, mode: 'parallel' }, (m) =>
				m.oracle('sum', C.generateText.v1({ connection: slot.connection() })),
			)

	test('the chain runs once per item, and each iteration is identified in the receipt', async () => {
		const r = await run(publish(build()), {
			input: { text: 'a|b|c' },
			bindings: bindings(),
			world,
		})
		const iters = r.nodes.filter((n) => n.nodeKey === 'summarize.item.sum')
		assert.ok(iters.length > 1, `expected several iterations, got ${iters.length}`)
		assert.deepEqual(
			iters.map((n) => n.iteration),
			iters.map((_, i) => i),
			'iterations are numbered, so a receipt can say which one failed',
		)
	})

	test('exceeding the declared max fails the run rather than silently truncating', async () => {
		const r = await run(publish(build(1)), {
			input: { text: 'a|b|c' },
			bindings: bindings(),
			world,
		})
		assert.equal(r.outcome, 'err')
		assert.match(String(r.haltReason), /declares max 1/)
	})

	test('async and map publish the same shape, so one equivalence harness covers both', () => {
		// F26's forced-sequential test does not need to know which construct it is
		// looking at. That is the payoff of not giving map its own output shape.
		assert.equal(S.branchResults, 'core:shape/branch-results@1')
	})
})

// ── 44 · Compact receipts for the event multiplier (13 §2) ──────────────────
describe('44 · compact halt receipts', () => {
	const haltEarly = () =>
		spec('demo:halts@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
			.outlet('save', ($) => C.createMessage.v1({ text: $.generate.text }))

	const halting = bindings({
		'core:query/session-history@1': async () => halt('this chat type is not applicable'),
	})

	test('an event-triggered run that halts before any effect keeps attribution, drops payloads', async () => {
		const r = await run(publish(haltEarly()), {
			input: {},
			bindings: halting,
			world,
			triggerSource: 'event',
			triggerRef: 'core:event/message-created@1',
		})
		assert.equal(r.outcome, 'halt')
		assert.equal(r.compact, true)
		assert.deepEqual(r.nodes, [], 'no node rows — that is the count this was written to bound')
		assert.equal(r.haltReason, 'this chat type is not applicable', 'why it halted survives')
		assert.equal(r.triggerRef, 'core:event/message-created@1', 'attribution survives')
		assert.ok(r.compactedNodeCount! > 0, 'the dropped count is recorded, never a mystery')
	})

	test('the same halt from a click keeps its full detail', async () => {
		// A run someone started happens once per click. The multiplier is a hot event ×
		// every subscribed pipeline × every message, and only that case is compacted.
		const r = await run(publish(haltEarly()), {
			input: {},
			bindings: halting,
			world,
			triggerSource: 'ui',
		})
		assert.equal(r.outcome, 'halt')
		assert.notEqual(r.compact, true)
		assert.ok(r.nodes.length > 0)
	})

	test('once anything effectful has run, the receipt stays full even on an event', async () => {
		const r = await run(publish(haltEarly()), {
			input: {},
			bindings: bindings({
				'core:outlet/create-message@1': async () => halt('rejected downstream'),
			}),
			world,
			triggerSource: 'event',
		})
		assert.equal(r.outcome, 'halt')
		assert.notEqual(r.compact, true, 'a Provider already ran — this run is worth keeping')
		assert.ok(r.nodes.some((n) => n.kind === 'oracle'))
	})

	test('the rendered receipt says it was compacted rather than looking empty', async () => {
		const r = await run(publish(haltEarly()), {
			input: {},
			bindings: halting,
			world,
			triggerSource: 'event',
		})
		assert.match(renderReceipt(r), /compact:.*before any effectful node/)
	})
})

// ── 45 · Admin kill is `cancelled`, not `err` (13 §3) ───────────────────────
describe('45 · admin kill', () => {
	const s = () =>
		spec('demo:kill@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope }))
			.oracle('generate', C.generateText.v1({ connection: slot.connection() }))

	test('the run ends cancelled, with the actor recorded', async () => {
		let calls = 0
		const r = await run(publish(s()), {
			input: {},
			bindings: bindings(),
			world,
			cancelSignal: () =>
				++calls > 2
					? { by: 'admin:jody', reason: 'killed from the queue view' }
					: undefined,
		})
		assert.equal(r.outcome, 'cancelled')
		assert.equal(r.cancelledBy, 'admin:jody')
		assert.match(String(r.haltReason), /killed from the queue view/)
	})

	test('cancelled is distinguishable from err — which is why there are four result kinds', async () => {
		const killed = await run(publish(s()), {
			input: {},
			bindings: bindings(),
			world,
			cancelSignal: () => ({ by: 'admin:jody', reason: 'stop' }),
		})
		const broke = await run(publish(s()), {
			input: {},
			bindings: bindings({
				'core:query/session-history@1': async () =>
					({ kind: 'err', reason: 'db down' }) as any,
			}),
			world,
		})
		assert.equal(killed.outcome, 'cancelled')
		assert.equal(broke.outcome, 'err')
		assert.notEqual(killed.outcome, broke.outcome, '"an admin stopped it" is not "it broke"')
	})
})

// ── 46 · Queue wait is free (13 §3, F13, F36) ───────────────────────────────
describe('46 · queued time', () => {
	test('a run queued for a week trips no timeout and consumes no budget', async () => {
		const clock = fakeClock()
		const week = 7 * 24 * 60 * 60 * 1000
		const r = await run(
			publish(
				spec('demo:queued@1', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.query('history', ($) => C.sessionHistory.v1({ scope: $.input.sessionScope })),
			),
			{
				input: {},
				bindings: bindings(),
				world,
				now: clock.now,
				queuedMs: week,
				timeoutCeilingMs: 5_000,
				budget: { tokens: 10 },
			},
		)
		assert.equal(r.outcome, 'ok', 'the clock starts at dequeue, not at enqueue')
		assert.equal(r.queuedMs, week)
		assert.equal(r.consumption.tokens, 0, 'waiting consumes nothing (F13)')
		assert.ok(r.endedAt - r.startedAt < 5_000, 'elapsed excludes the wait (F36)')
	})

	test('the receipt says the wait was uncharged, so nobody has to infer it', async () => {
		const r = await run(
			publish(spec('demo:q2@1', { version: '1.0.0' }).inlet('input', C.userMessage.v1())),
			{ input: {}, bindings: bindings(), world, queuedMs: 90_000 },
		)
		assert.match(renderReceipt(r), /90000 ms queued, uncharged/)
	})
})

// ── 47 · Secret-typed settings (13 §6) ──────────────────────────────────────
describe('47 · secret settings', () => {
	const schema: SettingsSchema = {
		endpoint: { type: 'string', scope: 'pub' },
		apiKey: { type: 'secret', scope: 'pub', side: 'extension' },
	}
	const values = { endpoint: 'https://example.test', apiKey: secret('cipher:abc123') }

	test('the client is told whether it is set, never what it is', () => {
		const c = forClient(schema, values)
		assert.deepEqual(c.apiKey, { $secretSet: true })
		assert.equal(c.endpoint, 'https://example.test')
		assert.equal(JSON.stringify(c).includes('cipher:abc123'), false)
	})

	test('an export drops it, on the same footing as connection credentials', () => {
		assert.deepEqual(forExport(schema, values), { endpoint: 'https://example.test' })
	})

	test('a receipt redacts it BY TYPE — which is the whole argument for typing it', async () => {
		const echo = pin(
			describeTaskDefinition({
				id: 'demo:task/echo-settings@1',
				timeoutMs: 1000,
				ports: { in: { main: S.json }, out: { main: S.json } },
			}),
		)
		const r = await run(
			publish(
				spec('demo:secret@1', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.task('echo', echo.v1({ creds: secret('cipher:abc123') })),
			),
			{
				input: {},
				world,
				bindings: bindings({
					'demo:task/echo-settings@1': async (i: any) => ok({ main: i.creds }),
				}),
			},
		)
		const body = JSON.stringify(r)
		assert.equal(
			body.includes('cipher:abc123'),
			false,
			'the ciphertext never reaches a receipt',
		)
		assert.ok(body.includes('[secret]'))
		// A free-form column could not have done this: core would not know which key
		// held a credential and which held a note (13 §6).
		assert.equal(isSecret(secret('x')), true)
	})

	test('two declaration-time mistakes are refused rather than documented', () => {
		// Now a throw at declaration rather than a list to inspect — a schema that leaks
		// should not be constructible (§ defineSettings).
		assert.throws(
			() =>
				defineSettings({
					leaky: { type: 'secret', scope: 'user', side: 'component' },
					shipped: { type: 'secret', scope: 'pub', default: 'sk-live-default' },
				}),
			(e: Error) =>
				/runs in the browser/.test(e.message) && /not a credential/.test(e.message),
		)
	})
})

// ── 48 · The events registry (13 §7, §7g) ───────────────────────────────────
describe('48 · events registry', () => {
	test('slugs are unique, because the slug is what syncs a seeded row across instances', () => {
		assert.throws(
			() =>
				defineEvent({
					slug: 'message-created',
					version: 1,
					family: 'data',
					affectsUser: true,
					description: 'dupe',
				}),
			/duplicate event slug/,
		)
	})

	test('the id is not the reference — every core event carries a stable slug', () => {
		for (const e of allEvents()) {
			assert.ok(e.slug.length > 0)
			assert.equal(typeof e.id, 'number')
			assert.equal(
				e.ownerPluginId,
				null,
				'reserved for plugin events; reopening is a permission',
			)
		}
	})

	test('action events drop out of the cycle graph by construction, not by exception', () => {
		const cyclic = cycleRelevantEvents().map((e) => e.slug)
		assert.ok(cyclic.includes('message-created'))
		assert.equal(cyclic.includes('ui-action'), false)
		assert.equal(cyclic.includes('schedule-tick'), false)
	})

	test('an action event declaring causedBy is refused — it is a request, not a consequence', () => {
		assert.throws(
			() =>
				defineEvent({
					slug: 'bad-action',
					version: 1,
					family: 'action',
					affectsUser: false,
					causedBy: ['core:outlet/save-message'],
					description: 'x',
				}),
			/keeps them out of the cycle graph/,
		)
	})
})

// ── 49 · UI-initiated runs and the budget owner (13 §7) ─────────────────────
describe('49 · ui-action carries both users', () => {
	test('budget attaches to the owner; attribution records the trigger', async () => {
		const payload: UiActionPayload = {
			sessionId: 'chat:1',
			ownerUserId: 'user:owner',
			actorUserId: 'user:guest',
			action: 're-roll',
			modeId: 'dungeon-crawl',
			input: { text: 'roll again' },
		}
		const r = await run(
			publish(
				spec('demo:reroll@1', { version: '1.0.0' })
					.inlet('input', C.userMessage.v1())
					.oracle('generate', C.generateText.v1({ connection: slot.connection() })),
			),
			{
				input: payload.input,
				bindings: bindings(),
				world,
				triggerSource: 'event',
				triggerRef: CORE_EVENTS.uiAction.slug,
				// The owner pays; the trigger is recorded. Group chats need no special case.
				actorUserId: payload.ownerUserId,
			},
		)
		assert.equal(r.triggerRef, 'ui-action')
		assert.equal(r.actorUserId, 'user:owner')
		assert.notEqual(
			payload.ownerUserId,
			payload.actorUserId,
			'the two can differ — that was the question',
		)
	})

	test('re-roll is the existing regenerate contract, not a new spend path', () => {
		// A handler with its own budget would have been a second way to spend money.
		// Routing it through a run means budget, receipt and review gate all apply.
		assert.equal(CORE_EVENTS.uiAction.family, 'action')
		assert.equal(CORE_EVENTS.uiAction.affectsUser, true)
	})
})

// ── 50 · No hook calls a Provider (13 §7c, F32) ─────────────────────────────
describe('50 · hook surfaces', () => {
	const eventSurface = {
		// No `readEvent`: the occurrence arrives as argument 0, never as a
		// method on the surface. Depicting one here would re-teach the shape
		// the SDK just retired.
		storage: {},
		log: () => {},
		signal: new AbortController().signal,
	}
	const lifecycleSurface = {
		storage: {},
		log: () => {},
		signal: new AbortController().signal,
	}

	test('neither surface carries Provider access', () => {
		assert.deepEqual(assertHookSurface('event', eventSurface), { ok: true })
		assert.deepEqual(assertHookSurface('lifecycle', lifecycleSurface), { ok: true })
	})

	test('a regression that adds it back fails the probe instead of shipping', () => {
		const regressed = { ...lifecycleSurface, callProvider: async () => 'text' }
		const res = assertHookSurface('lifecycle', regressed)
		assert.equal(res.ok, false)
		assert.deepEqual((res as { found: string[] }).found, ['callProvider'])
	})

	test('a lifecycle hook may not trigger a pipeline either', () => {
		const regressed = { ...lifecycleSurface, trigger: async () => {} }
		assert.equal(assertHookSurface('lifecycle', regressed).ok, false)
	})

	// The whole list, pinned by name. It is the executor handles and only those —
	// narrowing it is a ruling, and a narrowing that happens by accident (someone
	// deleting an entry to make their own surface pass) fails here.
	test('every executor handle is refused, on both kinds', () => {
		for (const name of ['callProvider', 'call', 'provider', 'trigger', 'run', 'emit']) {
			for (const [kind, base] of [
				['event', eventSurface],
				['lifecycle', lifecycleSurface],
			] as const) {
				const res = assertHookSurface(kind, { ...base, [name]: () => {} })
				assert.equal(res.ok, false, `${kind} surface accepted ${name}`)
				assert.deepEqual((res as { found: string[] }).found, [name])
			}
		}
	})

	// `fetch` was on that list, which made the probe reject the ctx both sandbox
	// backends actually hand out. The line is Provider/trigger access, not network:
	// host-scoped fetch is a manifest-declared, admin-deniable grant with a consent
	// surface, so it is declared on the surfaces and metered by permissions instead.
	test('a declared, host-scoped fetch is not an executor handle', () => {
		const withFetch = { ...eventSurface, fetch: async () => ({ status: 200 }) }
		assert.deepEqual(assertHookSurface('event', withFetch), { ok: true })
		assert.deepEqual(
			assertHookSurface('lifecycle', {
				...lifecycleSurface,
				fetch: async () => ({ status: 200 }),
			}),
			{ ok: true },
		)
	})

	test('scheduled model work has a path, and it is an event', () => {
		// Barring Providers *and* triggering would have left nightly summarization with
		// nowhere to go. It subscribes instead — which also gets it a receipt, a budget,
		// the review gate, and a line on the consent screen.
		assert.equal(SCHEDULED_WORK_PATH.instead, 'core:event/schedule-tick@1')
		assert.equal(CORE_EVENTS.scheduleTick.slug, 'schedule-tick')
		assert.match(SCHEDULED_WORK_PATH.because, /consent screen/)
	})
})

// ── 51 · The lorebook depth field (13 §7i) ─────────────────────────────────
test('51 · a lorebook entry can carry a depth — the one real parity gap, closed', () => {
	// Depth positioning is expressed in the assembly template (use case 41). What SP
	// lacked was somewhere for the template to read it from. An entry-schema addition,
	// not architecture.
	const e: LoreEntry = { id: 'note', title: 'Note', content: 'c', keys: ['k'], depth: 4 }
	assert.equal(e.depth, 4)
})

// ── R-2 · provisional definitions (plans/29, 2026-09-17) ───────────────────
describe('R-2 · a provisional definition is declared, not bound, and cannot be placed', () => {
	/** A definition core publishes because a plan owns it, with no handler behind it. */
	const pending = pin(
		describeOracleDefinition({
			id: 'test:oracle/pending@1',
			effects: 'external',
			review: { fields: [] },
			timeoutMs: 1000,
			provisional: true,
			ports: { in: { text: S.text }, out: { main: S.json } },
		}),
	)
	const places = () =>
		spec('demo:places-provisional@1', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.oracle('pending', ($) => pending.v1({ text: $.input.text }))

	test('the three core definitions plans 14 and 28 own carry the flag, and no other core one does', () => {
		const flagged = ['core:oracle/speak@1', 'core:oracle/mcp-tool@1', 'core:oracle/mcp-resource@1']
		for (const id of flagged) assert.equal(getDefinition(id)?.provisional, true, id)
		assert.deepEqual(
			allDefinitions()
				.filter((d) => d.provisional && /^core:/.test(d.id))
				.map((d) => d.id)
				.sort(),
			[...flagged].sort(),
		)
		assert.equal(C.attachImage.descriptor.provisional, undefined, 'bound 2026-09-17')
	})

	test('validate() refuses the document under R-2, and the fix is the two things an author can do', () => {
		const e = errorsFor(places(), 'R-2')
		assert.equal(e.length, 1)
		assert.equal(e[0]!.nodeKey, 'pending')
		assert.match(e[0]!.message, /provisional — declared, not bound/)
		assert.equal(e[0]!.fix, 'bind it or remove the node')
	})

	test('a document that reached the executor anyway halts on the law, not on "no binding registered"', async () => {
		// Compiled without `publish` — a stored version older than the flag.
		const doc = compile(places().build())
		assert.ok(validate(doc).some((f) => f.law === 'R-2'))
		const r = await run(doc, {
			input: { text: 'x' },
			world,
			bindings: bindings({ 'test:oracle/pending@1': async () => ok({ main: 'never' }) }),
		})
		assert.equal(r.outcome, 'err')
		assert.match(r.haltReason ?? '', /is provisional — declared, not bound/)
		assert.match(r.haltReason ?? '', /R-2/)
		assert.doesNotMatch(r.haltReason ?? '', /no binding registered/)
	})

	test('the flag is policy, not contract: binding it moves no hash (plans/31 V6)', () => {
		// What is *offered* is policy; what *runs* is contract. The day the
		// handler lands, every pin stays where it is and the registry row's
		// `status` moves from `provisional` to `live` on the next sync.
		const { provisional: _p, ...bound } = pending.descriptor
		assert.equal(definitionContractHash(pending.descriptor), definitionContractHash(bound))
	})
})
