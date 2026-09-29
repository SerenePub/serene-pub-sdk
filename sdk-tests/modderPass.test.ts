/**
 * PLAN-turn-order §5 M1 — the modder pass (R26–R35, §4.14), SDK half.
 *
 * R26 is the yardstick every case here is judged against: a declaration is a
 * typed value a modder imports and passes; core uses the public API a modder
 * uses; and a declaration that would silently do nothing is refused at build
 * time with a sentence naming the fix. So most of this file is refusals, each
 * asserted by the words a modder will read.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	AMBIENT_SCRIPT_EXTRAS,
	preset,
	CORE_EVENTS,
	S,
	announce,
	compile,
	component,
	componentFindings,
	declarationFindings,
	definitionContractHash,
	describeOracleDefinition,
	describeTaskDefinition,
	eventById,
	genre,
	getShape,
	ok,
	pin,
	run,
	sessionEvents,
	spec,
	use,
	type AnnexChangePayload,
	type CastChangePayload,
	type ScriptChainApplier,
	type ScriptHookSite,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import {
	ADVENTURE_TURN_ORDER_SPEC_ID,
	CHAT_TURN_ORDER_SPEC_ID,
	CORE_SPECS,
	GUIDE_TURN_ORDER_SPEC_ID,
	LAIR_TURN_ORDER_SPEC_ID,
	TURN_ORDER_BY_GENRE,
	TURN_ORDER_EVENTS,
	TURN_ORDER_NARRATOR_EVENTS,
	WHODUNIT_TURN_ORDER_SPEC_ID,
	WRITING_ROOM_TURN_ORDER_SPEC_ID,
	adventureGenre,
	corePresets,
	chatGenre,
	guideGenre,
	lairGenre,
	turnOrderSpec,
	whodunitGenre,
	writingRoomGenre,
} from '@serene-pub/core-catalog'
import { world } from './helpers.js'

/** A strategy node over the turn-order ports, so a swap has something to stand in for. */
const strategySpec = (swaps: unknown[], id = 'test:spec/swaps') =>
	spec(id, { version: '1.0.0' })
		.inlet('event', C.sessionEvent.v1(), {
			genre: chatGenre,
			events: [sessionEvents.messageCompleted],
		})
		.query('history', ($) => C.sessionHistory.v1({ scope: $.event.sessionScope }))
		.task('pool', ($) => C.turnPool.v1({ cast: $.event.cast, messages: $.history.main }))
		.task(
			'strategy',
			($) => C.turnRoundRobin.v1({ candidates: $.pool.main, messages: $.history.main }),
			{ expose: { session: true, swaps: swaps as never } },
		)

// ── R28 · a node a session may swap declares its own swaps ──────────────────

describe('M1 · expose.swaps (R28)', () => {
	test('swaps land on the built node and in the document as definition ids, pin never repeated', () => {
		const built = strategySpec([C.turnRandom, C.turnManual]).build()
		const node = built.nodes.find((n) => n.key === 'strategy')!
		assert.deepEqual(node.expose, {
			session: true,
			swaps: ['core:task/turn-random@1', 'core:task/turn-manual@1'],
		})
		const doc = compile(built)
		assert.deepEqual(doc.nodes.find((n) => n.key === 'strategy')!.expose, node.expose)
	})

	test('swaps imply session: true', () => {
		const built = spec('test:spec/implied', { version: '1.0.0' })
			.inlet('event', C.sessionEvent.v1(), {
				genre: chatGenre,
				events: [sessionEvents.messageCompleted],
			})
			.query('history', ($) => C.sessionHistory.v1({ scope: $.event.sessionScope }))
			.task('pool', ($) => C.turnPool.v1({ cast: $.event.cast, messages: $.history.main }))
			.task(
				'strategy',
				($) => C.turnRoundRobin.v1({ candidates: $.pool.main, messages: $.history.main }),
				{ expose: { swaps: [C.turnRandom] } },
			)
			.build()
		assert.deepEqual(built.nodes.find((n) => n.key === 'strategy')!.expose, {
			session: true,
			swaps: ['core:task/turn-random@1'],
		})
	})

	test('an empty swaps list stores nothing — no control, and the document hashes as unmarked swaps', () => {
		const node = strategySpec([]).build().nodes.find((n) => n.key === 'strategy')!
		assert.deepEqual(node.expose, { session: true })
	})

	test('a swap whose ports differ is refused, naming the node and the ports', () => {
		assert.throws(
			() => strategySpec([C.turnPool]),
			/'core:task\/turn-pool@1' cannot stand in for 'strategy'.*ports/s,
		)
	})

	test('a swap of another kind is refused with the same sentence', () => {
		assert.throws(
			() => strategySpec([C.sessionHistory]),
			/'core:query\/session-history@1' cannot stand in for 'strategy'/,
		)
	})

	test('a duplicate swap is refused', () => {
		assert.throws(() => strategySpec([C.turnRandom, C.turnRandom]), /lists 'core:task\/turn-random@1' twice/)
	})

	test('the pin listed as its own swap is refused — the pin is always offered first', () => {
		assert.throws(
			() => strategySpec([C.turnRoundRobin]),
			/'core:task\/turn-round-robin@1' is the pin.*always offered first/s,
		)
	})

	test('SessionShape.turnOrder is gone: chat declares no Turn order list on its shape', () => {
		assert.equal('turnOrder' in (chatGenre.shape ?? {}), false)
	})
})

// ── R27 · one turn-order spec per genre, from one public builder ────────────

describe('M1 · turnOrderSpec (R27)', () => {
	// The strategy node's key comes from the table (M4: chat's sits in the
	// `decide` junction), never the literal.
	const strategyNode = (doc: ReturnType<typeof turnOrderSpec>) =>
		doc.nodes.find(
			(n) => n.key === (TURN_ORDER_BY_GENRE.find((t) => t.spec === doc.id)?.strategyNode ?? 'strategy'),
		)!
	const poolPreset = (doc: ReturnType<typeof turnOrderSpec>) =>
		doc.presets.find((p) => p.default)?.values.find((v) => v.nodeKey === 'pool')?.value

	const table = [
		{ genre: chatGenre, id: CHAT_TURN_ORDER_SPEC_ID, slug: 'core:spec/chat-turn-order', events: TURN_ORDER_EVENTS, pin: 'core:task/turn-round-robin', swaps: ['core:task/turn-user-split@1', 'core:task/turn-random@1', 'core:task/turn-scripted@1', 'core:task/turn-manual@1', 'core:task/turn-narrator@1'], pool: {} },
		{ genre: guideGenre, id: GUIDE_TURN_ORDER_SPEC_ID, slug: 'core:spec/guide-turn-order', events: TURN_ORDER_EVENTS, pin: 'core:task/turn-round-robin', swaps: undefined, pool: { characters: 'none', envoys: 'in-turn' } },
		{ genre: writingRoomGenre, id: WRITING_ROOM_TURN_ORDER_SPEC_ID, slug: 'core:spec/writing-room-turn-order', events: TURN_ORDER_EVENTS, pin: 'core:task/turn-round-robin', swaps: undefined, pool: { characters: 'none', envoys: 'in-turn' } },
		{ genre: adventureGenre, id: ADVENTURE_TURN_ORDER_SPEC_ID, slug: 'core:spec/adventure-turn-order', events: TURN_ORDER_NARRATOR_EVENTS, pin: 'core:task/turn-narrator', swaps: undefined, pool: { characters: 'none', envoys: 'none' } },
		{ genre: lairGenre, id: LAIR_TURN_ORDER_SPEC_ID, slug: 'core:spec/lair-turn-order', events: TURN_ORDER_NARRATOR_EVENTS, pin: 'core:task/turn-narrator', swaps: undefined, pool: { characters: 'none', envoys: 'none' } },
		{ genre: whodunitGenre, id: WHODUNIT_TURN_ORDER_SPEC_ID, slug: 'core:spec/whodunit-turn-order', events: TURN_ORDER_NARRATOR_EVENTS, pin: 'core:task/turn-narrator', swaps: undefined, pool: { characters: 'none', envoys: 'none' } },
	] as const

	for (const row of table) {
		test(`${row.slug}: its genre, its events, its pin, its swaps, its pool`, () => {
			assert.equal(row.id, row.slug)
			const entry = CORE_SPECS.find((c) => c.slug === row.slug)
			assert.ok(entry, `${row.slug} is in CORE_SPECS`)
			const doc = entry!.build() as ReturnType<typeof turnOrderSpec>
			assert.equal(doc.id, row.slug)
			assert.deepEqual(doc.input, { genre: row.genre.id, events: [...row.events] })
			const node = strategyNode(doc)
			assert.equal(node.definitionId, row.pin)
			// No swaps, no control: the strategy node carries no mark at all (R28).
			assert.deepEqual(node.expose, row.swaps ? { session: true, swaps: [...row.swaps] } : undefined)
			assert.deepEqual(poolPreset(doc) ?? {}, row.pool)
			// The genre's own preset table names this spec for this genre.
			assert.equal(TURN_ORDER_BY_GENRE.find((t) => t.genre.id === row.genre.id)?.spec, row.slug)
		})
	}

	test('the two shared slugs are retired', () => {
		for (const gone of ['core:spec/turn-order', 'core:spec/turn-order-narrator'])
			assert.equal(CORE_SPECS.some((c) => c.slug === gone), false, `${gone} is retired`)
	})

	test('a plugin genre gets its own spec from the same call — the id is taken, never derived', () => {
		const tavern = genre('acme.rp:genre/tavern', {
			name: { en: 'Tavern' },
			family: 'chat',
			events: { [sessionEvents.messageCompleted]: {}, [sessionEvents.annexChanged]: {} },
		})
		const doc = turnOrderSpec({
			id: 'acme.rp:spec/tavern-turn-order',
			genre: tavern,
			events: [sessionEvents.messageCompleted, sessionEvents.annexChanged],
			strategy: C.turnRoundRobin,
			swaps: [C.turnRandom],
			pool: { personas: 'none' },
		})
		assert.equal(doc.id, 'acme.rp:spec/tavern-turn-order')
		assert.equal(doc.version, '1.0.0')
		assert.deepEqual(doc.input, {
			genre: 'acme.rp:genre/tavern',
			events: [sessionEvents.messageCompleted, sessionEvents.annexChanged],
		})
		assert.deepEqual(strategyNode(doc).expose, { session: true, swaps: ['core:task/turn-random@1'] })
		assert.deepEqual(poolPreset(doc), { personas: 'none' })
	})

	test('a turn-order spec binds like any spec — on every event its lock lists (R48)', () => {
		const chat = corePresets().find((p) => p.slug === 'chat-default')!
		for (const e of TURN_ORDER_EVENTS) assert.equal(chat.bindings[e]?.spec, CHAT_TURN_ORDER_SPEC_ID)
	})
})

// ── R30 · packages do not define events; annex-changed is core's ────────────

describe('M1 · annex-changed and no package-defined events (R30)', () => {
	test('annex-changed is registered: data, affectsUser, caused by the two annex writes, its own shape', () => {
		const e = CORE_EVENTS.annexChanged
		assert.equal(e.slug, 'annex-changed')
		assert.equal(e.family, 'data')
		assert.equal(e.affectsUser, true)
		// set-annex-field (2026-09-26) is the annex field's write — the same annex write, one door along.
		assert.deepEqual(e.causedBy, ['core:outlet/set-session-annex', 'core:outlet/set-annex-field'])
		assert.equal(e.payload, S.annexChange)
		assert.equal(S.annexChange, 'core:shape/annex-change@1')
		assert.ok(getShape(S.annexChange))
		assert.equal(sessionEvents.annexChanged, 'core:event/annex-changed@1')
	})

	test('set-session-annex causes it', () => {
		assert.equal(C.setSessionAnnex.descriptor.causesEvent, 'core:event/annex-changed@1')
	})

	test('AnnexChangePayload names the owner', () => {
		const p: AnnexChangePayload = {
			event: sessionEvents.annexChanged,
			sessionId: 1,
			at: 1,
			cause: { kind: 'run', runId: 'r', auto: false },
			owner: 'acme.rp',
		}
		assert.equal(p.owner, 'acme.rp')
	})

	test('eventById answers core ids only — a namespaced id never matches a core slug', () => {
		assert.equal(eventById(sessionEvents.messageCompleted), CORE_EVENTS.messageCompleted)
		assert.equal(eventById('acme:event/message-completed@1'), undefined)
		assert.equal(eventById('core:event/message-completed@2'), undefined)
		assert.equal(eventById('message-completed'), undefined)
	})

	const lockedTo = (event: string) =>
		spec('acme:spec/dice', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
			genre: chatGenre,
			event,
		})

	// An undeclared event is refused at every door; declaring one is
	// defineSessionEvent() plus the package entry's `events` (R45/R52).
	const refusal =
		/'acme:event\/dice-rolled@1' is not a declared event — core defines its own, and a package declares one with defineSessionEvent\(\{ id, payload, … \}\) and names it in defineExtension\(\{ events \}\)\./

	test('the builder refuses a lock on an event core does not define', () => {
		assert.throws(() => lockedTo('acme:event/dice-rolled@1'), refusal)
	})

	test('the package pass refuses the same lock in a hand-built document, with the same sentence', () => {
		const doc = compile(lockedTo(sessionEvents.messageRespond).build())
		const forged = { ...doc, input: { genre: 'core:genre/chat', event: 'acme:event/dice-rolled@1' } }
		const { errors } = declarationFindings({ ns: 'acme', pipelines: [forged] })
		assert.ok(errors.some((e) => refusal.test(e)), errors.join('\n'))
	})

	test('a lock on any registered core event is still fine', () => {
		assert.doesNotThrow(() => lockedTo(sessionEvents.messageRespond))
	})
})

// ── R31 · member events carry cast-change@1 ─────────────────────────────────

describe('M1 · member events carry cast-change@1 (R31)', () => {
	test('member-added and member-removed declare the cast-change payload; family unchanged', () => {
		for (const e of [CORE_EVENTS.memberAdded, CORE_EVENTS.memberRemoved]) {
			assert.equal(e.payload, S.castChange)
			assert.equal(e.family, 'action')
		}
	})

	test('CastChangePayload documents added and removed', () => {
		const p: CastChangePayload = {
			event: sessionEvents.memberAdded,
			sessionId: 1,
			at: 1,
			ref: 'envoy:mascot',
			change: 'added',
		}
		const q: CastChangePayload = { ...p, event: sessionEvents.memberRemoved, change: 'removed' }
		assert.equal(q.change, 'removed')
	})
})

// ── R33 · contracts checked at build time ───────────────────────────────────

describe('M1 · an events lock is checked against its inlet (R33)', () => {
	const lock = (inlet: unknown, events: string[]) =>
		spec('test:spec/lock', { version: '1.0.0' }).inlet('input', inlet as never, {
			genre: chatGenre,
			events,
		})

	test('session-event@1 declares the payloads it reads', () => {
		assert.deepEqual(C.sessionEvent.descriptor.payloads, [S.sessionChange, S.castChange, S.annexChange, S.recordedEvent])
	})

	test('it reads every one of the nine, and annex-changed', () => {
		assert.doesNotThrow(() => lock(C.sessionEvent.v1(), [...TURN_ORDER_EVENTS, sessionEvents.annexChanged]))
	})

	test('an inlet that declares no payloads answers one event only', () => {
		assert.throws(
			() => lock(C.userMessage.v1(), [sessionEvents.messageCompleted, sessionEvents.messageEdited]),
			/'core:inlet\/user-message@1' declares no payloads, so it answers one event: \{ genre, event \}/,
		)
	})

	test('an event with no payload cannot join an events list', () => {
		assert.throws(
			() => lock(C.sessionEvent.v1(), [sessionEvents.messageCompleted, sessionEvents.sessionCreated]),
			/'core:event\/session-created@1' carries no payload/,
		)
	})

	test('an event whose payload the inlet does not read is refused, naming both', () => {
		assert.throws(
			() => lock(C.sessionEvent.v1(), [sessionEvents.messageCompleted, sessionEvents.formAddressed]),
			/'core:inlet\/session-event@1' does not read 'core:shape\/form-addressed@1', the payload of 'core:event\/form-addressed@1'/,
		)
	})

	test('the one-event form is not checked — the inlet was written for its event', () => {
		assert.doesNotThrow(() =>
			spec('test:spec/one', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
				genre: chatGenre,
				event: sessionEvents.messageRespond,
			}),
		)
	})
})

describe('M1 · causesEvent agrees with causedBy (R33)', () => {
	test('every core descriptor that causes an event is named by that event’s causedBy', () => {
		const descriptors = Object.values(C)
			.map((v) => (v as { descriptor?: { id: string; causesEvent?: string } })?.descriptor)
			.filter((d): d is { id: string; causesEvent: string } => !!d?.causesEvent)
		assert.ok(descriptors.length >= 15)
		for (const d of descriptors) {
			const event = eventById(d.causesEvent)
			assert.ok(event, `${d.id} causes '${d.causesEvent}', which core defines`)
			assert.ok(
				event!.causedBy?.includes(d.id.replace(/@\d+$/, '')),
				`${d.causesEvent}.causedBy names ${d.id}`,
			)
		}
	})

	test('a descriptor whose causesEvent the event does not name is refused at declaration', async () => {
		const { describeOutletDefinition } = await import('@serene-pub/sdk')
		assert.throws(
			() =>
				describeOutletDefinition({
					id: 'core:outlet/stray-write@1',
					effects: 'write',
					causesEvent: 'core:event/message-created@1',
					ports: { in: { main: S.text } },
				} as never),
			/'core:outlet\/stray-write@1' causes 'core:event\/message-created@1', but that event's causedBy does not name 'core:outlet\/stray-write'/,
		)
	})

	test('a descriptor may not cause an event core does not define', async () => {
		const { describeOutletDefinition } = await import('@serene-pub/sdk')
		assert.throws(
			() =>
				describeOutletDefinition({
					id: 'acme:outlet/roll@1',
					effects: 'write',
					causesEvent: 'acme:event/dice-rolled@1',
					ports: { in: { main: S.text } },
				} as never),
			/'acme:event\/dice-rolled@1' is not a declared event/,
		)
	})
})

// ── R32 · session is ambient on every script point ──────────────────────────

describe('M1 · ambient session (R32)', () => {
	test('AMBIENT_SCRIPT_EXTRAS is exactly session', () => {
		assert.deepEqual([...AMBIENT_SCRIPT_EXTRAS], ['session'])
	})

	test('no core scripts slot lists session in its extras any more', () => {
		for (const v of Object.values(C)) {
			const d = (v as { descriptor?: { id: string; slots?: Record<string, { kind?: string; extras?: string[] }> } })
				?.descriptor
			for (const [name, slot] of Object.entries(d?.slots ?? {}))
				if (slot.kind === 'scripts')
					assert.equal(
						(slot.extras ?? []).includes('session'),
						false,
						`${d!.id}.${name} still lists session`,
					)
		}
	})

	test('the executor offers session at a port hook and at an interior point alike', async () => {
		// The scriptPoints.test.ts harness: user-message's `text` hook is a
		// port site, the drafter's `candidates` point an interior one.
		const drafter = pin(
			describeOracleDefinition({
				id: 'test:oracle/ambient-drafter@1',
				shape: S.textGen,
				ports: { in: { text: S.text }, out: { main: S.text } },
				scriptPoints: [{ key: 'candidates', accepts: ['core:script:text/transform@1'], label: { en: 'Candidates' } }],
			}),
		)
		const doc = compile(
			spec('test:spec/ambient', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle('draft', ($: any) => drafter.v1({ text: $.input.text }))
				.build(),
		)
		const sites: ScriptHookSite[] = []
		const applier: ScriptChainApplier = async (site, _chain, value) => {
			sites.push(site)
			return { value, applications: [] }
		}
		const receipt: any = await run(doc, {
			world: {
				...world,
				overrides: [
					{ nodeKey: 'draft', slot: 'scripts', path: 'candidates', value: [7], scopeKind: 'session' as const },
				],
			},
			input: { text: 'hi' },
			seed: 'ambient',
			triggerSource: 'ui',
			applyScripts: applier,
			bindings: {
				'core:inlet/user-message@1': async (i: any) => ok(i),
				[drafter.id]: async (i: any, ctx: any) =>
					ok({ main: await ctx.scripts.applyText('candidates', i.text) }),
			},
		})
		assert.equal(receipt.outcome, 'ok')
		const port = sites.filter((s) => s.origin !== 'binding')
		const interior = sites.filter((s) => s.origin === 'binding')
		assert.ok(port.length >= 1, 'the inlet text hook was offered')
		assert.equal(interior.length, 1)
		for (const site of [...port, ...interior])
			assert.ok(site.extras.includes('session'), `${site.nodeKey}.${site.port} offers session`)
		assert.deepEqual(interior[0]!.extras, ['session'])
	})
})

// ── R29 · packages contribute swaps ─────────────────────────────────────────

describe('M1 · swap contributions (R29)', () => {
	const pkg = () =>
		announce({ ns: 'acme', author: 'A', title: { en: 'Acme' } })

	test('announce().swaps() lands on the document, the definition as its id', () => {
		const natural = { id: 'acme:task/turn-natural@1' }
		const { document } = pkg()
			.swaps({ spec: use(CHAT_TURN_ORDER_SPEC_ID), node: 'strategy', definition: natural })
			.build()
		assert.deepEqual(document.swaps, [
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: 'strategy', definition: 'acme:task/turn-natural@1' },
		])
	})

	test('a package contributes only its own definitions', () => {
		assert.throws(
			() =>
				pkg()
					.swaps({ spec: use(CHAT_TURN_ORDER_SPEC_ID), node: 'strategy', definition: C.turnRandom })
					.build(),
			/swap 'core:task\/turn-random@1' is owned by 'core' — a package contributes its own definitions/,
		)
	})

	test('a swap onto the package’s own spec is refused: declare it with expose.swaps instead', () => {
		assert.throws(
			() =>
				pkg()
					.swaps({ spec: use('acme:spec/tavern-turn-order'), node: 'strategy', definition: { id: 'acme:task/turn-natural@1' } })
					.build(),
			/'acme:spec\/tavern-turn-order' is this package's own spec — list the swap on its node with expose\.swaps/,
		)
	})

	test('a duplicate contribution is refused', () => {
		const one = { spec: use(CHAT_TURN_ORDER_SPEC_ID), node: 'strategy', definition: { id: 'acme:task/turn-natural@1' } }
		assert.throws(() => pkg().swaps(one, one).build(), /contributes 'acme:task\/turn-natural@1' to 'core:spec\/chat-turn-order#strategy' twice/)
	})

	test('a string spec or definition is refused, and a spec value checks the node key (R48)', () => {
		assert.throws(
			() => pkg().swaps({ spec: CHAT_TURN_ORDER_SPEC_ID as never, node: 'strategy', definition: { id: 'acme:task/turn-natural@1' } }),
			/names the spec 'core:spec\/chat-turn-order' as a string — pass the spec value, or use/,
		)
		assert.throws(
			() => pkg().swaps({ spec: use(CHAT_TURN_ORDER_SPEC_ID), node: 'strategy', definition: 'acme:task/turn-natural@1' as never }),
			/names the definition 'acme:task\/turn-natural@1' as a string — pass its pin/,
		)
		const chat = TURN_ORDER_BY_GENRE.find((t) => t.genre === chatGenre)!.build()
		assert.throws(
			() => pkg().swaps({ spec: chat, node: 'strategy', definition: { id: 'acme:task/turn-natural@1' } }),
			/swap names node 'strategy', which 'core:spec\/chat-turn-order' does not have/,
		)
	})

	test('no swaps declared: the document carries no key', () => {
		const { document } = pkg().build()
		assert.equal('swaps' in document, false)
	})
})

// ── R35 · components at 1.0 ─────────────────────────────────────────────────

describe('M1 · component frameworks at 1.0 (R35)', () => {
	test('svelte and vanilla pass; react is refused until after SDK 1.0', () => {
		const base = { slug: 'x', label: 'X', entry: 'dist/x.js' }
		assert.deepEqual(componentFindings([component({ ...base, framework: 'svelte' })]), [])
		assert.deepEqual(componentFindings([component({ ...base, slug: 'y', framework: 'vanilla' })]), [])
		const found = componentFindings([component({ ...base, framework: 'react' as never })])
		assert.ok(
			found.some((f) => /component 'x' declares framework 'react', which arrives after SDK 1\.0 — use 'svelte' or 'vanilla'/.test(f)),
			found.join('\n'),
		)
	})
})

// ── Review findings (R39 review of M1, 2026-09-23) ──────────────────────────

describe('M1 review · refusals at every door', () => {
	test('genre() refuses an event core does not define', () => {
		assert.throws(
			() => genre('acme:genre/quiz', { name: { en: 'Quiz' }, family: 'chat', events: { 'acme:event/guessed@1': {} } }),
			/acme:genre\/quiz: 'acme:event\/guessed@1' is not a declared event/,
		)
	})

	test('a preset binding keyed by a non-core event is refused even when the spec is another package’s', () => {
		const { errors } = declarationFindings({
			ns: 'acme',
			presets: [
				{
					slug: 'p',
					genre: 'core:genre/chat',
					label: { en: 'P' },
					bindings: { 'acme:event/guessed@1': { spec: 'other:spec/x' } },
				} as never,
			],
		})
		assert.ok(errors.some((e) => /preset 'p': 'acme:event\/guessed@1' is not a declared event/.test(e)), errors.join('\n'))
	})

	test('a lock on turn-order-changed is refused by the builder and by the package pass', () => {
		assert.throws(
			() =>
				spec('acme:spec/loop', { version: '1.0.0' }).inlet('event', C.sessionEvent.v1(), {
					genre: chatGenre,
					event: sessionEvents.turnOrderChanged,
				}),
			/core-internal/,
		)
		const doc = compile(
			spec('acme:spec/loop', { version: '1.0.0' })
				.inlet('event', C.sessionEvent.v1(), { genre: chatGenre, event: sessionEvents.messageCompleted })
				.build(),
		)
		const forged = { ...doc, input: { genre: 'core:genre/chat', event: sessionEvents.turnOrderChanged } }
		const { errors } = declarationFindings({ ns: 'acme', pipelines: [forged] })
		assert.ok(errors.some((e) => /core-internal/.test(e)), errors.join('\n'))
	})

	test('a compiled document gets the events-payload check the builder gives', () => {
		const doc = compile(
			spec('acme:spec/two', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1(), { genre: chatGenre, event: sessionEvents.messageRespond })
				.build(),
		)
		const forged = {
			...doc,
			input: { genre: 'core:genre/chat', events: [sessionEvents.messageCompleted, sessionEvents.messageEdited] },
		}
		const { errors } = declarationFindings({ ns: 'acme', pipelines: [forged] })
		assert.ok(errors.some((e) => /'core:inlet\/user-message@1' declares no payloads/.test(e)), errors.join('\n'))
	})

	test('a compiled document gets the swap-fit check the builder gives', () => {
		const doc = compile(strategySpec([C.turnRandom], 'acme:spec/swaps').build())
		const forged = {
			...doc,
			nodes: doc.nodes.map((n) =>
				n.key === 'strategy' ? { ...n, expose: { session: true, swaps: ['core:task/turn-pool@1'] } } : n,
			),
		}
		const { errors } = declarationFindings({ ns: 'acme', pipelines: [forged] })
		assert.ok(errors.some((e) => /'core:task\/turn-pool@1' cannot stand in for 'strategy'/.test(e)), errors.join('\n'))
	})

	test('eventById compares the version as written — @01 is not @1', () => {
		assert.equal(eventById('core:event/message-completed@01'), undefined)
	})
})

describe('M1 review · expose edge cases', () => {
	const withExpose = (expose: unknown) =>
		spec('test:spec/edge', { version: '1.0.0' })
			.inlet('event', C.sessionEvent.v1(), { genre: chatGenre, events: [sessionEvents.messageCompleted] })
			.query('history', ($) => C.sessionHistory.v1({ scope: $.event.sessionScope }))
			.task('pool', ($) => C.turnPool.v1({ cast: $.event.cast, messages: $.history.main }))
			.task('strategy', ($) => C.turnRoundRobin.v1({ candidates: $.pool.main, messages: $.history.main }), {
				expose: expose as never,
			})
			.build()
			.nodes.find((n) => n.key === 'strategy')!

	test('a mark that says nothing is not stored: {}, { swaps: [] } and { session: false }', () => {
		for (const e of [{}, { swaps: [] }, { session: false }]) assert.equal('expose' in withExpose(e), false, JSON.stringify(e))
	})

	test('session: false with swaps is refused', () => {
		assert.throws(() => withExpose({ session: false, swaps: [C.turnRandom] }), /cannot be combined with session: false/)
	})

	test('a swap given as an id string is refused with a sentence, not a TypeError', () => {
		assert.throws(() => withExpose({ swaps: ['core:task/turn-random@1'] }), /expose\.swaps takes pins \(C\.turnRandom\), not ids/)
	})

	test('a swap with slots the pin lacks is refused — its settings would never reach it', () => {
		const withParams = pin(
			describeTaskDefinition({
				id: 'test:task/turn-with-params@1',
				ports: {
					in: { candidates: S.turnCandidates, messages: S.messages },
					out: { main: S.turnEntries, order: S.turnEntries },
				},
				slots: { params: { kind: 'parameters', facet: 'behavior', schema: {} } },
			} as never),
		)
		assert.throws(() => withExpose({ swaps: [withParams] }), /cannot stand in for 'strategy'.*slots \[params\]/s)
	})

	test('a plugin pin at @2 fits TurnStrategyPin and seats as the strategy', () => {
		const pick2 = pin(
			describeTaskDefinition({
				id: 'acme:task/turn-pick@2',
				ports: {
					in: { candidates: S.turnCandidates, messages: S.messages },
					out: { main: S.turnEntries, order: S.turnEntries },
				},
			}),
		)
		const doc = turnOrderSpec({
			id: 'acme:spec/pick-turn-order',
			genre: chatGenre,
			events: [sessionEvents.messageCompleted],
			strategy: pick2,
			swaps: [C.turnRoundRobin],
		})
		const node = doc.nodes.find((n) => n.key === 'strategy')!
		assert.equal(node.definitionId, 'acme:task/turn-pick')
		assert.equal(node.definitionVersion, 2)
	})
})

describe('M1 review · payloads are part of the contract, session is never listed', () => {
	test('an inlet re-declared with different payloads is a different definition', () => {
		const base = { id: 'test:inlet/p@1', kind: 'inlet', ports: { out: { main: S.json } } }
		assert.notEqual(
			definitionContractHash({ ...base, payloads: [S.sessionChange] }),
			definitionContractHash(base),
		)
		// A set, not a sequence.
		assert.equal(
			definitionContractHash({ ...base, payloads: [S.castChange, S.sessionChange] }),
			definitionContractHash({ ...base, payloads: [S.sessionChange, S.castChange] }),
		)
	})

	test('a scripts slot listing session is refused — it is ambient', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'test:task/lists-session@1',
					ports: { in: { main: S.text }, out: { main: S.text } },
					slots: {
						scripts: { kind: 'scripts', accepts: ['core:script:text/transform@1'], port: 'main', extras: ['session'] },
					},
				} as never),
			/slot 'scripts' lists 'session' in its extras — every script site is handed 'session' already/,
		)
	})
})

// ── R40 · a preset seeds swaps the way a package contributes them ───────────

describe('M2 · preset-seeded swaps (R40)', () => {
	test('defaults.swaps lands with each definition as its id; speakerStrategy is gone', () => {
		const p = preset({
			slug: 'seeded',
			genre: chatGenre,
			label: 'Seeded',
			bindings: [{ spec: use('core:spec/create-chat'), events: [sessionEvents.sessionCreated] }],
			defaults: { swaps: [{ spec: use(CHAT_TURN_ORDER_SPEC_ID), node: 'strategy', definition: C.turnManual }] },
		})
		assert.deepEqual(p.defaults?.swaps, [
			{ spec: CHAT_TURN_ORDER_SPEC_ID, node: 'strategy', definition: 'core:task/turn-manual@1' },
		])
		assert.equal('speakerStrategy' in (p.defaults ?? {}), false)
	})

	test('a seeded swap that names no spec or node is refused by the package pass', () => {
		const { errors } = declarationFindings({
			ns: 'acme',
			presets: [
				{
					slug: 'bad',
					genre: 'core:genre/chat',
					label: { en: 'Bad' },
					bindings: {},
					defaults: { swaps: [{ spec: 'strategy', node: '', definition: 'core:task/turn-manual@1' }] },
				} as never,
			],
		})
		assert.ok(errors.some((e) => /preset 'bad' seeds a swap on 'strategy', which is not a spec id/.test(e)), errors.join('\n'))
		assert.ok(errors.some((e) => /preset 'bad' seeds a swap onto 'strategy' that names no node/.test(e)), errors.join('\n'))
	})
})

// ── R42 · turn controls only where a genre offers a choice ──────────────────

describe('M2 · turn controls follow swaps (R42)', () => {
	const exposed = (slug: string) => {
		const strategyKey = TURN_ORDER_BY_GENRE.find((t) => t.spec === slug)!.strategyNode
		return Object.fromEntries(
			(CORE_SPECS.find((c) => c.slug === slug)!.build() as ReturnType<typeof turnOrderSpec>).nodes
				.filter((n) => ['pool', 'mentioned', strategyKey].includes(n.key))
				.map((n) => [n.key === strategyKey ? 'strategy' : n.key, n.expose ?? null]),
		)
	}

	test('chat, which offers swaps, exposes pool, mentioned and strategy', () => {
		const e = exposed(CHAT_TURN_ORDER_SPEC_ID)
		assert.deepEqual(e.pool, { session: true })
		assert.deepEqual(e.mentioned, { session: true })
		assert.equal((e.strategy as { swaps?: string[] }).swaps?.length, 5)
	})

	for (const slug of [GUIDE_TURN_ORDER_SPEC_ID, WRITING_ROOM_TURN_ORDER_SPEC_ID, ADVENTURE_TURN_ORDER_SPEC_ID, LAIR_TURN_ORDER_SPEC_ID, WHODUNIT_TURN_ORDER_SPEC_ID])
		test(`${slug} exposes no turn control`, () => {
			assert.deepEqual(exposed(slug), { pool: null, mentioned: null, strategy: null })
		})
})

// ── M2 review fixes (SDK half) ──────────────────────────────────────────────

describe('M2 review · swaps and seeds refused where they would do nothing', () => {
	test('a contribution naming no definition gets a sentence, not a TypeError', () => {
		const { errors } = declarationFindings({ ns: 'acme', swaps: [{ spec: CHAT_TURN_ORDER_SPEC_ID, node: 'strategy' } as never] })
		assert.ok(errors.some((e) => /names definition '', which is not a pinned id/.test(e)), errors.join('\n'))
	})

	test('an unversioned definition id is refused', () => {
		const { errors } = declarationFindings({
			ns: 'acme',
			swaps: [{ spec: CHAT_TURN_ORDER_SPEC_ID, node: 'strategy', definition: 'acme:task/turn-natural' }],
		})
		assert.ok(errors.some((e) => /'acme:task\/turn-natural', which is not a pinned id/.test(e)), errors.join('\n'))
	})

	test('a provisional definition cannot be a swap — it has no handler', () => {
		const provisional = pin(
			describeTaskDefinition({
				id: 'test:task/turn-provisional@1',
				provisional: true,
				ports: {
					in: { candidates: S.turnCandidates, messages: S.messages },
					out: { main: S.turnEntries, order: S.turnEntries },
				},
			} as never),
		)
		assert.throws(() => strategySpec([provisional], 'test:spec/prov'), /it is provisional/)
	})

	test('a preset seeding a swap its own spec does not offer is refused at build', () => {
		const own = turnOrderSpec({
			id: 'acme:spec/tavern-turn-order',
			genre: chatGenre,
			events: [sessionEvents.messageCompleted],
			strategy: C.turnRoundRobin,
			swaps: [C.turnRandom],
		})
		const seeded = (definition: string, node = 'strategy') =>
			declarationFindings({
				ns: 'acme',
				pipelines: [own],
				presets: [
					{
						slug: 'p',
						genre: 'core:genre/chat',
						label: { en: 'P' },
						bindings: {},
						defaults: { swaps: [{ spec: 'acme:spec/tavern-turn-order', node, definition }] },
					} as never,
				],
			}).errors
		assert.deepEqual(
			seeded('core:task/turn-random@1').filter((e) => /seeds/.test(e)),
			[],
		)
		assert.ok(seeded('core:task/turn-manual@1').some((e) => /seeds 'core:task\/turn-manual@1' onto 'acme:spec\/tavern-turn-order#strategy', which offers/.test(e)))
		// `history` is not in session settings; `pool` is (its params, since the
		// spec offers swaps — R42), and offers only its pin.
		assert.ok(seeded('core:task/turn-random@1', 'history').some((e) => /which is not in session settings/.test(e)))
		assert.ok(seeded('core:task/turn-random@1', 'pool').some((e) => /onto 'acme:spec\/tavern-turn-order#pool', which offers/.test(e)))
	})
})

// ── R41 · the optional model path (M4) ──────────────────────────────────────

describe('M4 · turnOrderSpec({ advise }) builds the decide junction', () => {
	const chat = () =>
		CORE_SPECS.find((c) => c.slug === CHAT_TURN_ORDER_SPEC_ID)!.build() as ReturnType<typeof turnOrderSpec>

	test('chat: decide on the session, model → advise, otherwise rules → strategy', () => {
		const doc = chat()
		const decide = doc.clauses.find((c) => c.id === 'decide')!
		assert.equal(decide.kind, 'junction')
		assert.deepEqual(decide.chains, ['model', 'rules'])
		assert.deepEqual(decide.branches, {
			model: { path: 'fields.turnMode', equals: 'model' },
			rules: { default: true },
		})
		const advise = doc.nodes.find((n) => n.key === 'decide.model.advise')!
		assert.equal(advise.definitionId, 'core:oracle/turn-advise')
		// In session settings, so a plugin's model strategy can be contributed.
		assert.deepEqual(advise.expose, { session: true })
		const strategy = doc.nodes.find((n) => n.key === 'decide.rules.strategy')!
		assert.equal(strategy.definitionId, 'core:task/turn-round-robin')
		assert.equal(strategy.expose?.swaps?.length, 5)
		// The write reads the junction's own result port.
		const edge = doc.edges.find((e) => e.to === 'write' && e.toPort === 'order')!
		assert.deepEqual([edge.from, edge.fromPort, edge.shape], ['decide', 'order', S.turnEntries])
	})

	test('chat declares turnMode (rules | model), rules by default', () => {
		const field = (chatGenre.shape?.fields as Record<string, any>)?.turnMode
		assert.equal(field?.type, 'enum')
		assert.deepEqual(field?.members?.map((m: any) => m.key), ['rules', 'model'])
		assert.equal(field?.default, 'rules')
	})

	test('every table entry names the node its Turn order control swaps', () => {
		const byGenre = Object.fromEntries(TURN_ORDER_BY_GENRE.map((t) => [t.genre.id, t.strategyNode]))
		assert.equal(byGenre['core:genre/chat'], 'decide.rules.strategy')
		assert.equal(byGenre['core:genre/guide'], 'strategy')
		for (const t of TURN_ORDER_BY_GENRE)
			assert.ok(t.build().nodes.some((n) => n.key === t.strategyNode), t.spec)
	})

	test('without advise the spec is the plain line — strategy on the spine, no junction', () => {
		const doc = CORE_SPECS.find((c) => c.slug === GUIDE_TURN_ORDER_SPEC_ID)!.build() as ReturnType<typeof turnOrderSpec>
		assert.equal(doc.clauses.length, 0)
		assert.ok(doc.nodes.some((n) => n.key === 'strategy'))
	})

	test("turn-advise fits the strategy node's ports, with a model's slots", () => {
		const d = C.turnAdvise.descriptor
		assert.equal(d.kind, 'oracle')
		assert.deepEqual(Object.keys(d.ports.in ?? {}).sort(), ['candidates', 'messages'])
		assert.deepEqual(Object.keys(d.ports.out ?? {}).sort(), ['main', 'order'])
		assert.deepEqual(Object.keys(d.slots ?? {}).sort(), ['connection', 'prompts', 'sampling'])
	})
})
