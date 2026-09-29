/**
 * D-3 — **the harness endows the sandbox's context, not the executor's.**
 *
 * Two packages paid for the gap this file closes, and both failures are pinned
 * below rather than described:
 *
 *  - **G13.** A plugin *Query*'s `ctx.read` is declared by the SDK's executor
 *    and endowed by no sandbox. Twenty Questions shipped a query that worked in
 *    its own tests and would have read nothing at install.
 *  - **The mirror image.** Nothing in the harness endows `ctx.storage`, so
 *    Battleship — a package whose whole point is that one handler reads back
 *    what another wrote — had to write its own fake store and wrap every
 *    binding by hand.
 *
 * So the claim under test is narrow and total: a handler bound through
 * `pluginNodeBindings` sees **exactly** `{ random, now, log, storage?, fetch?,
 * signal }`, by the grant table the app's `hookCtx.ts` holds, and sees none of
 * the executor's own endowments — whichever kind of node it is placed as.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	S,
	compile,
	describeOutletDefinition,
	describeQueryDefinition,
	describeTaskDefinition,
	err,
	ok,
	pin,
	run,
	spec,
	type Result,
} from '@serene-pub/sdk'
import {
	DEFAULT_STORAGE_QUOTA_BYTES,
	EXAMPLE_CLOCK,
	HARNESS_CLOCK,
	formatHookLog,
	hookCtxGrants,
	hookCtxKeysFor,
	inputDigest,
	memoryStorage,
	nodeSeedLabel,
	pluginHandlerContext,
	pluginNodeBindings,
	pluginSeededRandom,
	rowQuotaFor,
	type PluginHandlerContext,
} from '@serene-pub/sdk/testing'
import * as C from '@serene-pub/contracts'

import { bindings, world } from './helpers.js'

const PLUGIN = 'chariot.showcase'

/** The three node kinds a showcase plugin actually places, under its own namespace. */
const readState = pin(
	describeQueryDefinition({
		id: 'chariot.showcase:query/read-state@1',
		timeoutMs: 1000,
		ports: { in: { sessionId: S.json }, out: { main: S.json, seen: S.json } },
	}),
)
const decide = pin(
	describeTaskDefinition({
		id: 'chariot.showcase:task/decide@1',
		timeoutMs: 1000,
		declaresRandomness: true,
		ports: { in: { seen: S.json }, out: { main: S.json } },
	}),
)
const keepState = pin(
	describeOutletDefinition({
		id: 'chariot.showcase:outlet/keep-state@1',
		effects: 'write',
		review: { fields: ['value'] },
		timeoutMs: 1000,
		ports: { in: { value: S.json }, out: { main: S.writeResult } },
	}),
)

/** What a handler saw on its context, recorded for the assertions below. */
type Seen = { keys: string[]; ctx: Record<string, unknown> }
const record = (into: Seen[]) => async (_i: unknown, ctx: PluginHandlerContext) => {
	into.push({ keys: Object.keys(ctx), ctx: ctx as unknown as Record<string, unknown> })
	return ok({ main: null })
}

// ── The grant table (plans/29 R-3) ─────────────────────────────────────────

describe('D-3 · the grant table is the sandbox’s', () => {
	test('a task is pure: neither storage nor fetch', () => {
		assert.deepEqual(hookCtxGrants('task'), { storage: false, fetch: false })
		assert.deepEqual(hookCtxKeysFor('task'), ['random', 'now', 'log', 'signal'])
	})

	test('a query and an outlet get the extension’s own rows, and no network', () => {
		for (const kind of ['query', 'outlet', 'event', 'lifecycle'] as const) {
			assert.deepEqual(hookCtxGrants(kind), { storage: true, fetch: false })
			assert.deepEqual(hookCtxKeysFor(kind), ['random', 'now', 'log', 'storage', 'signal'])
		}
	})

	test('an oracle is the one kind that calls out', () => {
		assert.deepEqual(hookCtxGrants('oracle'), { storage: true, fetch: true })
		assert.deepEqual(hookCtxKeysFor('oracle'), ['random', 'now', 'log', 'storage', 'fetch', 'signal'])
	})

	test('a kind nobody named throws rather than defaulting — a default is a grant nobody decided', () => {
		assert.throws(() => hookCtxGrants('node'), /without a hook ctx kind/)
		assert.throws(() => hookCtxGrants(undefined), /task · query · oracle/)
	})

	test('the context is built in the sandbox’s key order, so a surface test can read it', () => {
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'oracle' })
		assert.deepEqual(Object.keys(ctx), hookCtxKeysFor('oracle'))
		const task = pluginHandlerContext({ pluginId: PLUGIN, kind: 'task' })
		assert.deepEqual(Object.keys(task), hookCtxKeysFor('task'))
		// A member the kind is not granted is ABSENT, never a stub that refuses.
		assert.equal('storage' in task, false)
		assert.equal('fetch' in task, false)
	})
})

// ── G13: the absences, through a real run ──────────────────────────────────

describe('G13 · a plugin handler never sees the executor’s context', () => {
	const doc = compile(
		spec('chariot.showcase:harness', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.query('read', readState.v1({ sessionId: 1 }))
			.task('decide', ($: any) => decide.v1({ seen: $.read.seen }))
			.outlet('keep', ($: any) => keepState.v1({ value: $.decide.main }))
			.build(),
	)

	test('read, call, commit and the executor’s conveniences are all absent', async () => {
		const seen: Seen[] = []
		const r = await run(doc, {
			input: {},
			world,
			seed: 'seed:g13',
			bindings: {
				...bindings(),
				...pluginNodeBindings({
					pluginId: PLUGIN,
					handlers: {
						[readState.id]: record(seen),
						[decide.id]: record(seen),
						[keepState.id]: record(seen),
					},
				}),
			},
		})
		assert.equal(r.outcome, 'ok', r.haltReason)
		assert.equal(seen.length, 3)
		const [query, task, outlet] = seen as [Seen, Seen, Seen]

		// The finding, stated as three assertions: a plugin Query has no `read`.
		assert.equal(query.ctx.read, undefined)
		assert.deepEqual(query.keys, hookCtxKeysFor('query'))
		assert.deepEqual(task.keys, hookCtxKeysFor('task'))
		assert.deepEqual(outlet.keys, hookCtxKeysFor('outlet'))
		for (const s of seen)
			for (const forbidden of ['read', 'call', 'commit', 'emit', 'progress', 'status', 'countTokens', 'iteration', 'scripts'])
				assert.equal(forbidden in s.ctx, false, `${forbidden} reached a plugin handler`)
	})

	test('a CORE query, in the same executor, does get `read` — the contrast that makes it a finding', async () => {
		let coreKeys: string[] = []
		await run(doc, {
			input: {},
			world,
			seed: 'seed:core',
			bindings: {
				...bindings({
					// Bound as an ordinary core-style binding: the executor's own
					// context arrives, `read` and all.
					[readState.id]: async (_i: any, ctx: any) => {
						coreKeys = Object.keys(ctx)
						return ok({ main: null, seen: [] })
					},
				}),
				...pluginNodeBindings({
					pluginId: PLUGIN,
					handlers: { [decide.id]: async () => ok({ main: null }), [keepState.id]: async () => ok({ main: null }) },
				}),
			},
		})
		assert.ok(coreKeys.includes('read'), coreKeys.join(','))
		assert.ok(coreKeys.includes('countTokens'))
		// And nothing the sandbox grants is there.
		assert.equal(coreKeys.includes('storage'), false)
		assert.equal(coreKeys.includes('random'), false)
	})

	test('the executor’s abort is the one thing that crosses — a hook must still be stoppable', async () => {
		let signal: AbortSignal | undefined
		const hook = pluginNodeBindings({
			pluginId: PLUGIN,
			handlers: {
				[decide.id]: async (_i, ctx) => {
					signal = ctx.signal
					return ok({ main: null })
				},
			},
		})[decide.id]!
		const controller = new AbortController()
		await hook({}, { signal: controller.signal } as never)
		assert.equal(signal, controller.signal)
	})

	test('a definition this process has not registered is refused by name, never guessed at', async () => {
		const hook = pluginNodeBindings({
			pluginId: PLUGIN,
			handlers: { 'chariot.showcase:task/unregistered@1': async () => ok({ main: 1 }) },
		})['chariot.showcase:task/unregistered@1']!
		const r = (await hook({}, {} as never)) as Result
		assert.equal(r.kind, 'err')
		assert.match((r as { reason: string }).reason, /which hook ctx kind/)
	})
})

// ── Randomness and the clock ───────────────────────────────────────────────

describe('D-3 · the seeded stream and the pinned clock', () => {
	test('one label, one stream — and it is the sandbox’s algorithm', () => {
		const a = pluginSeededRandom('seed:1:node:x@1:abc')
		const b = pluginSeededRandom('seed:1:node:x@1:abc')
		const rolls = Array.from({ length: 8 }, () => a())
		assert.deepEqual(rolls, Array.from({ length: 8 }, () => b()))
		for (const n of rolls) assert.ok(n >= 0 && n < 1)
		assert.notDeepEqual(
			rolls,
			Array.from({ length: 8 }, pluginSeededRandom('seed:1:node:x@1:abd')),
		)
	})

	test('the label is the app’s: run seed, pin, and a digest of the exact input', () => {
		assert.equal(nodeSeedLabel('s', 'p@1', { a: 1 }), `s:node:p@1:${inputDigest({ a: 1 })}`)
		// Two nodes of one definition under `each` differ by their input alone,
		// so neither depends on completion order for its stream.
		assert.notEqual(nodeSeedLabel('s', 'p@1', { i: 1 }), nodeSeedLabel('s', 'p@1', { i: 2 }))
		// An input JSON cannot carry still addresses something.
		const circular: Record<string, unknown> = {}
		circular.self = circular
		assert.equal(typeof inputDigest(circular), 'string')
	})

	test('two same-typed nodes in one run roll differently; a replay rolls the same', async () => {
		const rolls: number[] = []
		const doc = compile(
			spec('chariot.showcase:two-rolls', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('a', decide.v1({ seen: 1 }))
				.task('b', decide.v1({ seen: 2 }))
				.build(),
		)
		const go = () =>
			run(doc, {
				input: {},
				world,
				seed: 'seed:rolls',
				bindings: {
					...bindings(),
					...pluginNodeBindings({
						pluginId: PLUGIN,
						handlers: {
							[decide.id]: async (_i, ctx) => {
								rolls.push(ctx.random())
								return ok({ main: null })
							},
						},
					}),
				},
			})
		await go()
		assert.equal(rolls.length, 2)
		assert.notEqual(rolls[0], rolls[1])
		await go()
		assert.deepEqual(rolls.slice(2), rolls.slice(0, 2))
	})

	test('the harness clock is the executed examples\u2019 clock — one instant, two entry points', () => {
		// A handler run inside an executed example and the same handler run in a
		// unit test have to report the same `ctx.now()`, or a golden moves
		// between the two for no reason anybody can see.
		assert.equal(HARNESS_CLOCK, EXAMPLE_CLOCK)
	})

	test('the clock is pinned, not ticking — two reads in one call agree', () => {
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'task', now: 1_234_567.9 })
		assert.equal(ctx.now(), 1_234_567)
		assert.equal(ctx.now(), ctx.now())
	})
})

// ── ctx.log ────────────────────────────────────────────────────────────────

describe('D-3 · ctx.log keeps every argument', () => {
	test('a level, a message and a detail all reach the channel', () => {
		const logs: string[] = []
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'task', logs })
		ctx.log('warn', 'disk full', { free: 0 })
		assert.deepEqual(logs, ['[warn] disk full {"free":0}'])
	})

	test('a level nobody declared keeps every argument under [log]', () => {
		assert.equal(formatHookLog(['hello']), '[log] hello')
		assert.equal(formatHookLog(['nope', 'x']), '[log] nope x')
		assert.equal(formatHookLog([]), '[log]')
	})

	test('a value with no JSON rendering says so rather than vanishing', () => {
		assert.equal(formatHookLog(['info', 'v', undefined]), '[info] v undefined')
		assert.match(formatHookLog(['info', 'v', () => 1]), /\[function\]/)
		assert.match(formatHookLog(['info', 'v', new Error('boom')]), /"message":"boom"/)
	})
})

// ── ctx.fetch ──────────────────────────────────────────────────────────────

describe('D-3 · ctx.fetch is a grant, not a given', () => {
	const answer = async () => ({ status: 200, ok: true, headers: {}, body: 'hi' })

	test('a task has no fetch at all — the capability is never ambient', () => {
		assert.equal('fetch' in pluginHandlerContext({ pluginId: PLUGIN, kind: 'task' }), false)
	})

	test('an oracle that declared no hosts is refused by name', async () => {
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'oracle' })
		await assert.rejects(() => ctx.fetch!('https://example.com'), /network: permission not granted/)
	})

	test('a host outside the allowlist is refused, and the sentence names it', async () => {
		const ctx = pluginHandlerContext({
			pluginId: PLUGIN,
			kind: 'oracle',
			network: ['api.example.com'],
			fetch: answer,
		})
		await assert.rejects(() => ctx.fetch!('https://evil.test/x'), /host not permitted: evil\.test/)
		assert.deepEqual(await ctx.fetch!('https://api.example.com/x'), {
			status: 200,
			ok: true,
			headers: {},
			body: 'hi',
		})
	})

	test('a wildcard reaches sub-domains and not the apex, and a bare grant only the web ports', async () => {
		const ctx = pluginHandlerContext({
			pluginId: PLUGIN,
			kind: 'oracle',
			network: ['*.example.com'],
			fetch: answer,
		})
		assert.equal((await ctx.fetch!('https://a.example.com/')).ok, true)
		await assert.rejects(() => ctx.fetch!('https://example.com/'), /host not permitted/)
		await assert.rejects(() => ctx.fetch!('https://a.example.com:8443/'), /host not permitted/)
	})

	test('no request may start after ctx.signal fires', async () => {
		const controller = new AbortController()
		const ctx = pluginHandlerContext({
			pluginId: PLUGIN,
			kind: 'oracle',
			network: ['*'],
			fetch: answer,
			signal: controller.signal,
		})
		assert.equal((await ctx.fetch!('https://example.com/')).ok, true)
		controller.abort()
		await assert.rejects(() => ctx.fetch!('https://example.com/'), /the call was cancelled/)
	})

	test('only http(s), and an allowed host with no scripted answer says so rather than reaching out', async () => {
		const ctx = pluginHandlerContext({ pluginId: PLUGIN, kind: 'oracle', network: ['*'] })
		await assert.rejects(() => ctx.fetch!('file:///etc/passwd'), /only http\(s\) is allowed/)
		await assert.rejects(() => ctx.fetch!('https://example.com/'), /this harness was given no answer/)
	})
})

// ── memoryStorage ──────────────────────────────────────────────────────────

describe('D-3 · memoryStorage is the half the executor cannot supply', () => {
	test('a row one handler writes is a row the next handler reads', async () => {
		const storage = memoryStorage()
		const wrote = await storage.put('s:1:board', { turn: 'user' })
		assert.equal(wrote.kind, 'ok')
		assert.deepEqual(await storage.get('s:1:board'), { turn: 'user' })
		assert.equal(await storage.get('s:1:nothing'), undefined)
		assert.deepEqual(await storage.keys('s:1:'), ['s:1:board'])
		assert.deepEqual(storage.snapshot(), { 's:1:board': { turn: 'user' } })
		assert.equal(storage.writes, 1)
	})

	test('the store holds a copy — a handler mutating what it put changes nothing', async () => {
		const storage = memoryStorage()
		const value = { ships: [1] }
		await storage.put('k', value)
		value.ships.push(2)
		assert.deepEqual(await storage.get('k'), { ships: [1] })
	})

	test('usage reports the split, and a row costs its key as well as its value', async () => {
		const storage = memoryStorage({ quotaBytes: 100_000 })
		const r = await storage.put('ab', 1)
		assert.equal(r.kind, 'ok')
		assert.equal((r as { value: { deltaBytes: number } }).value.deltaBytes, 3) // 'ab' + '1'
		const u = await storage.usage()
		assert.deepEqual(u, {
			quotaBytes: 100_000,
			usedBytes: 3,
			availableBytes: 99_997,
			rowBytes: 3,
			fileBytes: 0,
		})
	})

	test('a write past the row budget is refused whole, as a Result, so a handler can prune and retry', async () => {
		const storage = memoryStorage({ quotaBytes: 120 })
		assert.equal(rowQuotaFor(120), 120)
		const refused = await storage.put('big', 'x'.repeat(200))
		assert.equal(refused.kind, 'err')
		assert.match((refused as { reason: string }).reason, /row budget is full/)
		// Refused WHOLE: nothing landed, and the store is usable afterwards.
		assert.equal(await storage.get('big'), undefined)
		assert.equal((await storage.put('small', 1)).kind, 'ok')
	})

	test('rows and files share one quota, and the whole-grant refusal is the second ceiling', async () => {
		const storage = memoryStorage({ quotaBytes: 200_000 })
		assert.equal(rowQuotaFor(200_000), 65_536)
		const wrote = await storage.files.write('cache/blob', new Uint8Array(190_000))
		assert.equal(wrote.kind, 'ok')
		const refused = await storage.put('k', 'x'.repeat(20_000))
		assert.equal(refused.kind, 'err')
		assert.match((refused as { reason: string }).reason, /quota exceeded/)
	})

	test('files round trip, list, stat and delete — and a path never escapes the extension', async () => {
		const storage = memoryStorage()
		await storage.files.write('cache/a.bin', new Uint8Array([1, 2, 3]))
		const read = await storage.files.read('cache/a.bin')
		assert.equal(read.kind, 'ok')
		assert.deepEqual([...(read as { value: Uint8Array }).value], [1, 2, 3])
		assert.equal((await storage.files.stat('cache/a.bin'))?.bytes, 3)
		assert.equal(await storage.files.stat('cache/missing'), null)
		assert.deepEqual((await storage.files.list('cache/')).map((f) => f.path), ['cache/a.bin'])
		await assert.rejects(() => storage.files.read('../../etc/passwd'), /escapes the extension directory/)
		assert.equal((await storage.files.delete('cache/a.bin')).kind, 'ok')
		assert.equal((await storage.files.read('cache/a.bin')).kind, 'err')
	})

	test('deleteAll clears a prefix and reports how many went', async () => {
		const storage = memoryStorage({ seed: { 'a:1': 1, 'a:2': 2, 'b:1': 3 } })
		const r = await storage.deleteAll('a:')
		assert.equal(r.kind, 'ok')
		assert.equal((r as { value: { removed: number } }).value.removed, 2)
		assert.deepEqual(await storage.keys(), ['b:1'])
		// A key that was never there is not a failure.
		assert.equal((await storage.delete('gone')).kind, 'ok')
	})

	test('query pages by prefix and refuses a cursor it cannot read', async () => {
		const storage = memoryStorage({ seed: Object.fromEntries([...Array(5)].map((_, i) => [`r:${i}`, i])) })
		const page = await storage.query({ prefix: 'r:', limit: 2, order: 'key' })
		assert.deepEqual(page.rows.map((r) => r.key), ['r:0', 'r:1'])
		assert.equal(page.nextCursor, 'o:2')
		const next = await storage.query({ prefix: 'r:', limit: 2, order: 'key', cursor: page.nextCursor! })
		assert.deepEqual(next.rows.map((r) => r.key), ['r:2', 'r:3'])
		await assert.rejects(() => storage.query({ cursor: 'nope' }), /unreadable cursor/)
	})

	test('a key that is not a key, and a value JSON cannot carry, throw the sandbox’s sentence', async () => {
		const storage = memoryStorage()
		await assert.rejects(() => storage.put('', 1), /a row key is required/)
		await assert.rejects(() => storage.put('k'.repeat(513), 1), /may not exceed 512 characters/)
		const circular: Record<string, unknown> = {}
		circular.self = circular
		await assert.rejects(() => storage.put('k', circular), /must be JSON-serializable/)
	})

	test('the default grant is the sandbox’s own fallback', async () => {
		assert.equal((await memoryStorage().usage()).quotaBytes, DEFAULT_STORAGE_QUOTA_BYTES)
	})

	test('isolation is structural: two plugins, two namespaces, no shared map to name', async () => {
		const a = memoryStorage()
		const b = memoryStorage()
		await a.put('shared-key', 'from a')
		assert.equal(await b.get('shared-key'), undefined)
		assert.deepEqual(b.snapshot(), {})
	})
})

// ── The store, shared across one plugin's handlers ─────────────────────────

describe('D-3 · one plugin, one store, many handlers', () => {
	test('what an early node writes is what a later node reads — no wrapping at the call site', async () => {
		const doc = compile(
			spec('chariot.showcase:round-trip', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('read', readState.v1({ sessionId: 7 }))
				.outlet('keep', ($: any) => keepState.v1({ value: $.read.seen }))
				.build(),
		)
		const storage = memoryStorage({ seed: { 's:7': { turn: 3 } } })
		const r = await run(doc, {
			input: {},
			world,
			seed: 'seed:round-trip',
			bindings: {
				...bindings(),
				...pluginNodeBindings({
					pluginId: PLUGIN,
					storage,
					handlers: {
						[readState.id]: async (i: any, ctx) => {
							const held = await ctx.storage!.get<{ turn: number }>(`s:${i.sessionId}`)
							if (!held) return err('no state — this handler refuses rather than inventing one')
							return ok({ main: held, seen: held.turn })
						},
						[keepState.id]: async (i: any, ctx) => {
							const wrote = await ctx.storage!.put('s:7', { turn: i.value + 1 })
							if (wrote.kind !== 'ok') return err(wrote.reason ?? 'the store refused the write')
							return ok({ main: { id: 's:7' } })
						},
					},
				}),
			},
		})
		assert.equal(r.outcome, 'ok', r.haltReason)
		assert.deepEqual(storage.snapshot(), { 's:7': { turn: 4 } })
	})

	test('a handler with no store halts rather than inventing one, and says so', async () => {
		const hook = pluginNodeBindings({
			pluginId: PLUGIN,
			// A task is granted no storage, which is the law, not an oversight.
			handlers: {
				[decide.id]: async (_i, ctx) =>
					ctx.storage ? ok({ main: 'read' }) : err('no storage — this node cannot run without its rows'),
			},
		})[decide.id]!
		const r = (await hook({}, {} as never)) as Result
		assert.equal(r.kind, 'err')
	})

	test('two plugins bound into one run do not share a namespace', async () => {
		const a = pluginNodeBindings({ pluginId: 'acme.one', handlers: { [readState.id]: async (_i, ctx) => {
			await ctx.storage!.put('k', 'a')
			return ok({ main: null })
		} } })
		const b = pluginNodeBindings({ pluginId: 'acme.two', handlers: { [readState.id]: async (_i, ctx) => ok({ main: await ctx.storage!.get('k') }) } })
		await a[readState.id]!({}, {} as never)
		const r = (await b[readState.id]!({}, {} as never)) as Result<{ main: unknown }>
		assert.deepEqual(r, { kind: 'ok', value: { main: undefined } })
	})
})
