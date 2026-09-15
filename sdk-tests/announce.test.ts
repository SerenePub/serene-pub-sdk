/**
 * announce() — the one authoring surface (24 §6) — and the pieces it binds:
 * genres with their own ids (24 §3), the input-node usage lock (24 §4),
 * config deltas and preset bindings with the coverage report (24 §7).
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	announce,
	AnnouncementError,
	config,
	preset,
	use,
	genre,
	genreIdOf,
	sessionEvents,
	spec,
	compile,
	canonicalHash,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const chatGenre = () =>
	genre('demo:genre/chat', {
		name: { en: 'Chat' },
		family: 'chat',
		events: {
			[sessionEvents.messageRespond]: { required: true },
			[sessionEvents.sessionAction]: { open: true },
		},
	})

const createSpec = (g = chatGenre()) =>
	spec('demo:spec/create-chat', { version: '1.0.0' })
		.input('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
		.build()

const respondSpec = (g = chatGenre()) =>
	spec('demo:spec/respond', { version: '1.0.0' })
		.input('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
		.build()

describe('genres (24 §3)', () => {
	test('own their id; session-created is always required', () => {
		const g = chatGenre()
		assert.equal(genreIdOf(g), 'demo:genre/chat')
		assert.equal(g.events[sessionEvents.sessionCreated]?.required, true)
		assert.throws(() => genre('demo:chat', { name: {}, family: 'x' }), /genre id/)
	})
})

describe('the input lock (24 §4)', () => {
	test('an event without a genre refuses at authoring time', () => {
		assert.throws(
			() =>
				spec('demo:spec/loose', { version: '1.0.0' }).input('input', C.userMessage.v1(), {
					event: sessionEvents.messageRespond,
				} as any),
			/genre it serves/,
		)
	})

	test('the lock rides the document and moves the hash', () => {
		const locked = compile(respondSpec())
		assert.deepEqual(locked.input, {
			genre: 'demo:genre/chat',
			event: sessionEvents.messageRespond,
		})
		const unlocked = compile(
			spec('demo:spec/respond', { version: '1.0.0' })
				.input('input', C.userMessage.v1())
				.build(),
		)
		assert.notEqual(canonicalHash(locked), canonicalHash(unlocked))
	})
})

describe('announce (24 §6)', () => {
	const identity = { ns: 'demo', author: 'demo', title: 'Demo pack' }

	test('a complete package builds: document + coverage', () => {
		const g = chatGenre()
		const create = createSpec(g)
		const respond = respondSpec(g)
		const fast = config(respond, 'fast', { label: 'Fast' }, { input: { params: { x: 1 } } })
		const { document, coverage } = announce(identity)
			.genres({ g })
			.hooks({ 'trim-history': { event: 'message-created' } })
			.pipelines(create, respond)
			.configs(fast)
			.presets(
				preset('casual', {
					genre: g,
					label: 'Casual',
					bindings: {
						[sessionEvents.sessionCreated]: create,
						[sessionEvents.messageRespond]: [respond, fast],
					},
				}),
			)
			.build()

		assert.equal(document.identity.ns, 'demo')
		assert.deepEqual(Object.keys(document.hooks), ['demo:hook/trim-history'])
		assert.equal(document.pipelines.length, 2)
		assert.deepEqual(document.requires, [])
		const slots = coverage.presets[0]!.slots
		const respondSlot = slots.find((s) => s.event === sessionEvents.messageRespond)!
		assert.equal(respondSlot.status, 'bound')
		assert.equal(respondSlot.binding?.config, 'fast')
		// The open action slot is unbound and that is fine.
		assert.equal(slots.find((s) => s.event === sessionEvents.sessionAction)?.status, 'unbound')
	})

	test('a genre without a create pipeline refuses', () => {
		const g = chatGenre()
		assert.throws(
			() => announce(identity).genres({ g }).pipelines(respondSpec(g)).build(),
			(e: unknown) => e instanceof AnnouncementError && /no create pipeline/.test(e.message),
		)
	})

	test('a preset leaving a required slot unbound refuses, and coverage says MISSING', () => {
		const g = chatGenre()
		const create = createSpec(g)
		try {
			announce(identity)
				.genres({ g })
				.pipelines(create)
				.presets(
					preset('half', {
						genre: g,
						label: 'Half',
						bindings: { [sessionEvents.sessionCreated]: create },
					}),
				)
				.build()
			assert.fail('should refuse')
		} catch (e) {
			assert.ok(e instanceof AnnouncementError)
			assert.match(e.message, /required slot 'message-respond'/)
			const slots = e.coverage.presets[0]!.slots
			assert.equal(
				slots.find((s) => s.event === sessionEvents.messageRespond)?.status,
				'MISSING',
			)
		}
	})

	test('a binding whose spec answers a different event or genre refuses', () => {
		const g = chatGenre()
		const create = createSpec(g)
		const respond = respondSpec(g)
		assert.throws(
			() =>
				announce(identity)
					.genres({ g })
					.pipelines(create, respond)
					.presets(
						preset('wrong', {
							genre: g,
							label: 'Wrong',
							bindings: {
								[sessionEvents.sessionCreated]: create,
								// respond bound into the action slot: wrong event.
								[sessionEvents.sessionAction]: respond,
							},
						}),
					)
					.build(),
			(e: unknown) =>
				e instanceof AnnouncementError && /answers 'message-respond'/.test(e.message),
		)
	})

	test('external references are recorded as requirements, never bundled', () => {
		// A pure mod: one config + one preset over another package's genre/specs.
		// use() parses the range off; the id is what documents store (24 §10).
		const respondRef = use('core:spec/respond@^2')
		assert.equal(respondRef.id, 'core:spec/respond')
		assert.equal(respondRef.range, '^2')
		const external = config(
			respondRef,
			'mine',
			{ label: 'Mine' },
			{
				generate: { params: { maxTokens: 512 } },
			},
		)
		const { document, coverage } = announce(identity)
			.configs(external)
			.presets(
				preset('modded', {
					genre: 'core:genre/chat',
					label: 'Modded',
					bindings: {
						[sessionEvents.sessionCreated]: 'core:spec/create-chat',
						[sessionEvents.messageRespond]: ['core:spec/respond', 'mine'],
					},
				}),
			)
			.build()
		assert.deepEqual(document.requires, [
			'core:genre/chat',
			'core:spec/create-chat',
			'core:spec/respond',
		])
		for (const s of coverage.presets[0]!.slots) assert.equal(s.status, 'bound-external')
	})

	test('configs verify node keys for announced specs; todos are named holes', () => {
		const g = chatGenre()
		const respond = respondSpec(g)
		assert.throws(
			() =>
				announce(identity)
					.genres({ g })
					.pipelines(createSpec(g), respond)
					.configs(config(respond, 'bad', { label: 'Bad' }, { nope: { params: {} } }))
					.build(),
			(e: unknown) => e instanceof AnnouncementError && /unknown node 'nope'/.test(e.message),
		)

		const { coverage } = announce(identity)
			.genres({ g })
			.pipelines(createSpec(g), respond)
			.configs(
				config(
					respond,
					'holey',
					{ label: 'Holey' },
					{
						input: { prompts: { 'todo@1': { note: 'pick a prompt' } } },
					},
				),
			)
			.build()
		assert.equal(coverage.todos.length, 1)
		assert.match(coverage.todos[0]!.path, /holey → input.prompts/)
	})

	test('the context-bound toolkit namespaces genres and custom value kinds', () => {
		const a = announce(identity)
		const g = a.genre('crawl', { name: { en: 'Crawl' }, family: 'adventure' })
		assert.equal(g.id, 'demo:genre/crawl')
		assert.deepEqual(a.v.custom('die', 1, { sides: 6 }), { 'demo:die@1': { sides: 6 } })
	})
})
