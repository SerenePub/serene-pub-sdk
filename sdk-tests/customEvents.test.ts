/**
 * Custom events (R45, R47, R52; unit E1a): a package declares an event, a
 * pipeline records it with the `record-event` write, and bound pipelines
 * hear it. The SDK half: the declaration and its registry, the contract, the
 * validator's recording rules, and the package entry's recording scope.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	announcementOf,
	compile,
	defineExtension,
	defineSessionEvent,
	defineShape,
	eventById,
	_withdrawSessionEvent,
	MAX_RECORDED_PAYLOAD_BYTES,
	recordedPayloadFindings,
	genre,
	ok,
	run,
	S,
	sessionEvents,
	spec,
	use,
	validate,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { bindings, publish, world } from './helpers.js'

const g = genre('dice:genre/table', {
	name: { en: 'Table' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true }, [sessionEvents.sessionAction]: { open: true } },
})

const rolled = defineSessionEvent<{ total: number }>({
	id: 'dice:event/rolled@1',
	payload: S.json,
	name: { en: 'Dice rolled' },
	description: 'A roll landed.',
})

/** A spec on the `roll` action that records `rolled`. */
const rollSpec = (id = 'dice:spec/roll') =>
	spec(id, {
		version: '1.0.0',
		contributes: { actions: [{ key: 'roll', venue: { kind: 'composer' }, label: { en: 'Roll' }, description: { en: 'Roll the dice.' } }] },
	})
		.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionAction })
		.outlet('rolled', ($) => C.recordEvent.v1({ event: rolled as never, payload: $.input.text as never }))
		.build()

const createTable = spec('dice:spec/create-table', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
	.build()

const errors = (b: ReturnType<typeof rollSpec>) =>
	validate(compile(b)).filter((f) => f.severity === 'error' && f.law === 'F8')

describe('declaring an event', () => {
	test('registers it, so a lock may name it; core ids and bad ids are refused', () => {
		assert.equal(eventById('dice:event/rolled@1')?.payload, 'core:shape/recorded-event@1')
		assert.throws(
			() => defineSessionEvent({ id: 'core:event/rolled@1', payload: S.json, name: { en: 'x' }, description: 'A test event.' }),
			/not an event id a package may declare/,
		)
		assert.throws(
			() => defineSessionEvent({ id: 'dice:rolled', payload: S.json, name: { en: 'x' }, description: 'A test event.' }),
			/not an event id a package may declare/,
		)
		// Identical re-declaration is fine (a module evaluated twice); a different one is not.
		defineSessionEvent({ id: 'dice:event/rolled@1', payload: S.json, name: { en: 'Dice rolled' }, description: 'A roll landed.' })
		assert.throws(() =>
			defineSessionEvent({ id: 'dice:event/rolled@1', payload: S.text, name: { en: 'Dice rolled' }, description: 'A roll landed.' }),
		)
	})

	test('a listener locks on it through the session-event inlet, whose envelope covers it (R33)', () => {
		const doc = compile(
			spec('dice:spec/announce', { version: '1.0.0' })
				.inlet('event', C.sessionEvent.v1(), { genre: g, events: [rolled.id] })
				.build(),
		)
		assert.deepEqual(doc.input, { genre: 'dice:genre/table', events: ['dice:event/rolled@1'] })
	})
})

describe('recording an event', () => {
	test('the declaration value is written into the document as its id', () => {
		const node = compile(rollSpec()).nodes.find((n) => n.key === 'rolled')!
		assert.equal(node.config.event, 'dice:event/rolled@1')
		assert.deepEqual(errors(rollSpec()), [])
	})

	test('the receipt names the event the write caused; a write that wrote nothing causes nothing', async () => {
		const doc = publish(
			spec('dice:spec/roll-run', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('rolled', ($) => C.recordEvent.v1({ event: rolled as never, payload: $.input.text as never })),
		)
		const record = bindings({
			'core:outlet/record-event@1': async (i: any, ctx: any) => ok({ main: await ctx.commit(i) }),
		} as never)
		const wrote: any = await run(doc, {
			world, input: { text: '12' }, seed: 's', bindings: record,
			host: { commit: async () => ({ id: 1 }) } as any,
		} as any)
		assert.deepEqual(wrote.emitted.map((e: any) => e.event), ['dice:event/rolled@1'])
		const nothing: any = await run(doc, {
			world, input: { text: '12' }, seed: 's', bindings: record,
			host: { commit: async () => ({ written: false }) } as any,
		} as any)
		assert.deepEqual(nothing.emitted, [])
	})

	test('publish refuses a wired event, a core event and an undeclared one', () => {
		const base = () => spec('dice:spec/bad', { version: '1.0.0' }).inlet('input', C.userMessage.v1())
		const wired = compile(base().outlet('r', ($) => C.recordEvent.v1({ event: $.input.text as never, payload: {} as never })).build())
		assert.ok(validate(wired).some((f) => /wires the event it records/.test(f.message)))
		const core = compile(base().outlet('r', () => C.recordEvent.v1({ event: 'core:event/annex-changed@1' as never, payload: {} as never })).build())
		assert.ok(validate(core).some((f) => /a core event/.test(f.message)))
		const unknown = compile(base().outlet('r', () => C.recordEvent.v1({ event: 'dice:event/nope@1' as never, payload: {} as never })).build())
		assert.ok(validate(unknown).some((f) => /which is not declared/.test(f.message)))
	})
})

/** A plain reply on `gg` — what a genre's preset binds beside its create. */
const respondOn = (gg: typeof g, id: string) =>
	spec(id, { version: '1.0.0' }).inlet('input', C.userMessage.v1(), { genre: gg, event: sessionEvents.messageRespond }).build()

describe("the package entry's recording scope (R52)", () => {
	// A genre ships with a preset (owner ruling 2026-10-02: a custom pipeline
	// must include a default preset).
	const respondTable = respondOn(g, 'dice:spec/respond-table')
	const ext = (recordedBy: unknown, pipelines = [createTable, rollSpec(), respondTable]) =>
		defineExtension({
			slug: 'dice',
			name: 'Dice',
			version: '0.1.0',
			genres: [g],
			pipelines,
			presets: [{ slug: 'table', genre: g, label: 'Table', bindings: [createTable, respondTable] }],
			events: [{ event: rolled, genre: g, recordedBy: recordedBy as never }],
		})

	test('a pipeline serving a subject in scope may record; the declaration is stored with ids', () => {
		const e = ext([{ spec: rollSpec(), key: 'roll' }])
		assert.deepEqual(e.events, [
			{
				event: 'dice:event/rolled@1',
				payload: S.json,
				name: { en: 'Dice rolled' },
				description: 'A roll landed.',
				domain: 'session',
				genre: 'dice:genre/table',
				recordedBy: ['dice:spec/roll#roll'],
			},
		])
		assert.deepEqual(announcementOf(e).document.events?.[0]?.recordedBy, ['dice:spec/roll#roll'])
		ext('any')
		ext([rollSpec()]) // a spec value stands for the subjects it serves
	})

	test('a pipeline outside the scope is refused, with both ways out', () => {
		assert.throws(
			() => ext([sessionEvents.messageRespond]),
			/pipeline 'dice:spec\/roll' records 'dice:event\/rolled@1' at 'rolled', but serves none of the subjects that may record it .* declare your own event/,
		)
	})

	test('a genre string, an empty scope and an event id string as the event are refused', () => {
		assert.throws(
			() => defineExtension({ slug: 'dice', name: 'D', version: '0.1.0', events: [{ event: rolled, genre: 'dice:genre/table' as never, recordedBy: 'any' }] }),
			/names its genre as a string/,
		)
		assert.throws(() => ext([]), /names nothing that may record it/)
		assert.throws(
			() => defineExtension({ slug: 'dice', name: 'D', version: '0.1.0', events: [{ event: 'dice:event/rolled@1' as never, genre: g, recordedBy: 'any' }] }),
			/'event' is the value defineSessionEvent\(\) returned/,
		)
	})

	test("a preset may bind a listener on its own genre's package event", () => {
		const listener = spec('dice:spec/cheer', { version: '1.0.0' })
			.inlet('event', C.sessionEvent.v1(), { genre: g, events: [rolled.id] })
			.build()
		const respond = spec('dice:spec/respond', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
			.build()
		const create = spec('dice:spec/create', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
			.build()
		const e = defineExtension({
			slug: 'dice',
			name: 'Dice',
			version: '0.1.0',
			genres: [g],
			pipelines: [create, respond, rollSpec(), listener],
			events: [{ event: rolled, genre: g, recordedBy: 'any' }],
			presets: [{ slug: 'table', genre: g, label: 'Table', bindings: [create, respond, listener] }],
		})
		assert.equal(e.presets?.[0]?.bindings['dice:event/rolled@1']?.spec, 'dice:spec/cheer')
	})

	test("an event another package declares is a requirement; its scope is that package's to check", () => {
		const other = defineSessionEvent({ id: 'cards:event/drawn@1', payload: S.json, name: { en: 'Drawn' }, description: 'A test event.' })
		const draw = spec('dice:spec/draw', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: use('core:genre/chat'), event: sessionEvents.messageRespond })
			.outlet('drawn', ($) => C.recordEvent.v1({ event: other as never, payload: $.input.text as never }))
			.build()
		const e = defineExtension({ slug: 'dice', name: 'Dice', version: '0.1.0', pipelines: [draw] })
		assert.ok(announcementOf(e).document.requires.includes('cards:event/drawn@1'))
	})
})

describe('E1a review fixes', () => {
	const g2 = genre('dice:genre/parlour', {
		name: { en: 'Parlour' },
		family: 'chat',
		events: { [sessionEvents.messageRespond]: { required: true } },
	})
	const createOn = (gg: typeof g, id: string) =>
		spec(id, { version: '1.0.0' }).inlet('input', C.userMessage.v1(), { genre: gg, event: sessionEvents.sessionCreated }).build()
	const respondRecording = (gg: typeof g, id: string) =>
		spec(id, { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: gg, event: sessionEvents.messageRespond })
			.outlet('r', ($) => C.recordEvent.v1({ event: rolled, payload: $.input.text as never }))
			.build()
	const pkg = (over: Record<string, unknown>) =>
		defineExtension({
			slug: 'dice',
			name: 'Dice',
			version: '0.1.0',
			genres: [g, g2],
			pipelines: [
				createOn(g, 'dice:spec/c1'),
				createOn(g2, 'dice:spec/c2'),
				respondOn(g, 'dice:spec/r1'),
				respondRecording(g2, 'dice:spec/r2'),
			],
			// One preset per genre (owner ruling 2026-10-02).
			presets: [
				{ slug: 'table', genre: g, label: 'Table', bindings: [createOn(g, 'dice:spec/c1'), respondOn(g, 'dice:spec/r1')] },
				{ slug: 'parlour', genre: g2, label: 'Parlour', bindings: [createOn(g2, 'dice:spec/c2'), respondRecording(g2, 'dice:spec/r2')] },
			],
			...over,
		} as never)

	test('scope is per genre: a recording on a genre the event is not declared for is refused; one event may serve two genres', () => {
		assert.throws(
			() => pkg({ events: [{ event: rolled, genre: g, recordedBy: [sessionEvents.messageRespond] }] }),
			/records 'dice:event\/rolled@1' at 'r' for genre 'dice:genre\/parlour', but it is declared for dice:genre\/table/,
		)
		pkg({
			events: [
				{ event: rolled, genre: g, recordedBy: 'any' },
				{ event: rolled, genre: g2, recordedBy: [sessionEvents.messageRespond] },
			],
		})
	})

	test("an own event recorded but not listed in events is refused, not required of itself", () => {
		assert.throws(() => pkg({}), /names 'dice:event\/rolled@1', this package's own event, but defineExtension\(\{ events \}\) does not list it/)
	})

	test('a lock on an own event names a genre it is declared for', () => {
		const listener = spec('dice:spec/listen', { version: '1.0.0' })
			.inlet('event', C.sessionEvent.v1(), { genre: g2, events: [rolled] })
			.build()
		assert.throws(
			() =>
				pkg({
					pipelines: [createOn(g, 'dice:spec/c1'), createOn(g2, 'dice:spec/c2'), listener],
					events: [{ event: rolled, genre: g, recordedBy: 'any' }],
				}),
			/listens for 'dice:event\/rolled@1' on 'dice:genre\/parlour', but it is declared for dice:genre\/table/,
		)
	})

	test('a single-event lock on a package event needs an inlet that reads the envelope', () => {
		assert.throws(() =>
			spec('dice:spec/wrong-inlet', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), { genre: g, event: rolled }),
		)
	})

	test('a non-json payload is wired whole; a missing payload is refused', () => {
		const shaped = defineSessionEvent({ id: 'dice:event/scored@1', payload: S.text, name: 'Scored', description: 'A test event.' })
		const literal = compile(
			spec('dice:spec/lit', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('r', () => C.recordEvent.v1({ event: shaped, payload: { x: 1 } as never }))
				.build(),
		)
		assert.ok(validate(literal).some((f) => /assembled or literal payload/.test(f.message)))
		const none = compile(
			spec('dice:spec/none', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('r', () => C.recordEvent.v1({ event: shaped } as never))
				.build(),
		)
		assert.ok(validate(none).some((f) => /with no payload/.test(f.message)))
	})

	test('the executor refuses a recording of a core or undeclared event whatever the document says', async () => {
		const doc = publish(
			spec('dice:spec/forged', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('r', ($) => C.recordEvent.v1({ event: rolled, payload: $.input.text as never })),
		)
		const node = doc.nodes.find((n) => n.key === 'r')!
		node.config.event = 'core:event/session-created@1'
		const receipt: any = await run(doc, {
			world, input: { text: 'x' }, seed: 's',
			bindings: bindings({ 'core:outlet/record-event@1': async (i: any, ctx: any) => ok({ main: await ctx.commit(i) }) } as never),
			host: { commit: async () => ({ id: 1 }) } as any,
		} as any)
		assert.deepEqual(receipt.emitted, [])
		assert.notEqual(receipt.outcome, 'ok')
	})

	test('genre() does not list a package event; recordedBy refuses the bare action event and undeclared ids', () => {
		assert.throws(
			() => genre('dice:genre/x', { name: { en: 'X' }, family: 'chat', events: { [rolled.id]: {} } }),
			/add it to the genre from defineExtension\(\{ events/,
		)
		assert.throws(
			() => pkg({ events: [{ event: rolled, genre: g2, recordedBy: [sessionEvents.sessionAction] }] }),
			/pick the action/,
		)
		assert.throws(
			() => pkg({ events: [{ event: rolled, genre: g2, recordedBy: ['dice:event/nope@1'] }] }),
			/not a declared event id/,
		)
	})

	test('defineSessionEvent checks its text, payload shape and version, and refuses delivery', () => {
		const bad = (over: Record<string, unknown>) => () =>
			defineSessionEvent({ id: 'dice:event/checked@1', payload: S.json, name: 'Checked', description: 'A test event.', ...over } as never)
		assert.throws(bad({ delivery: 'server' }), /has no 'delivery'/)
		assert.throws(bad({ payload: 'dice:shape/nope@1' }), /not a registered shape/)
		assert.throws(bad({ id: 'dice:event/checked@01' }), /not an event id a package may declare/)
		assert.throws(bad({ name: '' }))
		// A package's own shape is registered here but would not travel in the manifest.
		defineShape({ id: 'dice:shape/roll@1' })
		assert.throws(bad({ payload: 'dice:shape/roll@1' }), /your package's own shape/)
	})

	test('the host re-checks a recorded payload: plain JSON, within the cap, text where declared text', () => {
		assert.equal(recordedPayloadFindings(S.json, { guess: 'a lamp', n: 3 }), undefined)
		assert.equal(recordedPayloadFindings(S.json, undefined), undefined)
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		assert.match(recordedPayloadFindings(S.json, cyclic)!, /not plain JSON/)
		assert.match(recordedPayloadFindings(S.json, 'x'.repeat(MAX_RECORDED_PAYLOAD_BYTES))!, /at most/)
		assert.match(recordedPayloadFindings(S.text, { a: 1 })!, /payload is text, and object arrived/)
		assert.equal(recordedPayloadFindings(S.text, 'a lamp'), undefined)
	})

	test('a withdrawn event may be declared again, differently', () => {
		defineSessionEvent({ id: 'dice:event/redeclared@1', payload: S.json, name: 'Once', description: 'A test event.' })
		assert.throws(() =>
			defineSessionEvent({ id: 'dice:event/redeclared@1', payload: S.text, name: 'Once', description: 'A test event.' }),
		)
		_withdrawSessionEvent('dice:event/redeclared@1')
		assert.equal(eventById('dice:event/redeclared@1'), undefined)
		defineSessionEvent({ id: 'dice:event/redeclared@1', payload: S.text, name: 'Twice', description: 'A test event.' })
		assert.equal(eventById('dice:event/redeclared@1')?.name?.en, 'Twice')
	})
})
