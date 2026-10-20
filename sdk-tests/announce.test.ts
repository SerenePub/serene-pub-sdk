/**
 * announce() — the serializer behind defineExtension() — and the pieces it binds:
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

const storyGenre = () =>
	genre('demo:genre/chat', {
		name: { en: 'Chat' },
		family: 'chat',
		events: {
			[sessionEvents.messageRespond]: { required: true },
			[sessionEvents.sessionAction]: { open: true },
		},
	})

const createSpec = (g = storyGenre()) =>
	spec('demo:spec/create-chat', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
		.build()

const storyRespondSpec = (g = storyGenre()) =>
	spec('demo:spec/respond', { version: '1.0.0' })
		.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
		.build()

describe('genres (24 §3)', () => {
	test('own their id; session-created is always required', () => {
		const g = storyGenre()
		assert.equal(genreIdOf(g), 'demo:genre/chat')
		assert.equal(g.events[sessionEvents.sessionCreated]?.required, true)
		assert.throws(() => genre('demo:chat', { name: {} as any, family: 'x' }), /genre id/)
	})
})

describe('the input lock (24 §4)', () => {
	test('an event without a genre refuses at authoring time', () => {
		assert.throws(
			() =>
				spec('demo:spec/loose', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
					event: sessionEvents.messageRespond,
				} as any),
			/genre it serves/,
		)
	})

	test('the lock rides the document and moves the hash', () => {
		const locked = compile(storyRespondSpec())
		assert.deepEqual(locked.input, {
			genre: 'demo:genre/chat',
			event: sessionEvents.messageRespond,
		})
		const unlocked = compile(
			spec('demo:spec/respond', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.build(),
		)
		assert.notEqual(canonicalHash(locked), canonicalHash(unlocked))
	})
})

describe('announce (24 §6)', () => {
	const identity = { ns: 'demo', author: 'demo', title: 'Demo pack' }

	test('a complete package builds: document + coverage', () => {
		const g = storyGenre()
		const create = createSpec(g)
		const respond = storyRespondSpec(g)
		const fast = config(respond, 'fast', { label: 'Fast' }, { input: { params: { x: 1 } } })
		const { document, coverage } = announce(identity)
			.genres({ g })
			.hooks({ 'trim-history': { event: 'message-created' } })
			.pipelines(create, respond)
			.configs(fast)
			.presets({
				slug: 'casual',
				genre: g,
				label: 'Casual',
				// Each spec is bound on the events its inlet lock answers (R48).
				bindings: [create, { spec: respond, config: fast }],
			})
			.build()

		assert.equal(document.identity.ns, 'demo')
		assert.deepEqual(Object.keys(document.hooks), ['demo:hook/trim-history'])
		assert.equal(document.pipelines.length, 2)
		// Core events a pipeline locks on are requirements on the host's version.
		assert.deepEqual(document.requires, ['core:event/message-respond@1', 'core:event/session-created@1'])
		const slots = coverage.presets[0]!.slots
		const respondSlot = slots.find((s) => s.event === sessionEvents.messageRespond)!
		assert.equal(respondSlot.status, 'bound')
		assert.equal(respondSlot.binding?.config, 'fast')
		// The open action slot is unbound and that is fine.
		assert.equal(slots.find((s) => s.event === sessionEvents.sessionAction)?.status, 'unbound')
	})

	test('a genre without a create pipeline refuses', () => {
		const g = storyGenre()
		assert.throws(
			() => announce(identity).genres({ g }).pipelines(storyRespondSpec(g)).build(),
			(e: unknown) => e instanceof AnnouncementError && /no create pipeline/.test(e.message),
		)
	})

	test('a preset leaving a required slot unbound refuses, and coverage says MISSING', () => {
		const g = storyGenre()
		const create = createSpec(g)
		try {
			announce(identity)
				.genres({ g })
				.pipelines(create)
				.presets({ slug: 'half', genre: g, label: 'Half', bindings: [create] })
				.build()
			assert.fail('should refuse')
		} catch (e) {
			assert.ok(e instanceof AnnouncementError)
			assert.match(e.message, /required slot 'core:event\/message-respond@1'/)
			const slots = e.coverage.presets[0]!.slots
			assert.equal(
				slots.find((s) => s.event === sessionEvents.messageRespond)?.status,
				'MISSING',
			)
		}
	})

	test('a binding on an event its spec does not answer refuses, naming the lock', () => {
		const g = storyGenre()
		const create = createSpec(g)
		const respond = storyRespondSpec(g)
		assert.throws(
			() =>
				preset({
					slug: 'wrong',
					genre: g,
					label: 'Wrong',
					// respond narrowed onto the action slot: not an event its lock answers.
					bindings: [create, { spec: respond, events: [sessionEvents.sessionAction] }],
				}),
			/binds 'demo:spec\/respond' on 'core:event\/session-action@1', which its inlet lock does not answer \(core:event\/message-respond@1\)/,
		)
	})

	test('references are values: a string spec, genre or action is refused with the fix (R48)', () => {
		const g = storyGenre()
		assert.throws(
			() => preset({ slug: 's', genre: g, label: 'S', bindings: ['demo:spec/respond' as never] }),
			/names the spec 'demo:spec\/respond' as a string — pass the spec value you built, or use\('demo:spec\/respond'\)/,
		)
		assert.throws(
			() => preset({ slug: 's', genre: 'demo:genre/chat' as never, label: 'S', bindings: [] }),
			/names its genre as a string — pass the genre value/,
		)
		assert.throws(
			() =>
				preset({
					slug: 's',
					genre: g,
					label: 'S',
					bindings: [createSpec(g)],
					actions: { include: ['core:spec/story-narrate#narrate' as never] },
				}),
			/names 'core:spec\/story-narrate#narrate' as a string — pass the spec value .* or \{ spec, key \}/,
		)
		assert.throws(() => config('demo:spec/respond' as never, 'x', { label: 'X' }, {}), /as a string/)
	})

	test('a config made for another spec, and one event bound twice, refuse', () => {
		const g = storyGenre()
		const create = createSpec(g)
		const respond = storyRespondSpec(g)
		const forCreate = config(create, 'c', { label: 'C' }, {})
		assert.throws(
			() => preset({ slug: 'x', genre: g, label: 'X', bindings: [{ spec: respond, config: forCreate }] }),
			/with config 'c', which was made for 'demo:spec\/create-chat'/,
		)
		assert.throws(
			() => preset({ slug: 'x', genre: g, label: 'X', bindings: [respond, respond] }),
			/binds 'core:event\/message-respond@1' twice/,
		)
	})

	test("another package's spec names its events; without them it refuses", () => {
		const g = storyGenre()
		assert.throws(
			() => preset({ slug: 'x', genre: g, label: 'X', bindings: [use('core:spec/story-respond') as never] }),
			/another package's spec — name the events it answers/,
		)
	})

	test('a binding keyed by a bare event name refuses, whoever owns the genre (R-4)', () => {
		// The pre-fold spelling. A package built against the previous SDK
		// carries `message-respond`; a host that projected it verbatim would
		// undo its own migration on every boot and the preset would bind
		// nothing (plans/30 §U3 review, W6). Refused for the genre this
		// package owns…
		const g = storyGenre()
		const create = createSpec(g)
		const respond = storyRespondSpec(g)
		assert.throws(
			() =>
				announce(identity)
					.genres({ g })
					.pipelines(create, respond)
					.presets({
						slug: 'bare',
						genre: g,
						label: 'Bare',
						bindings: [create, { spec: use('demo:spec/respond'), events: ['message-respond'] }],
					})
					.build(),
			(e: unknown) =>
				e instanceof AnnouncementError &&
				/binds 'message-respond', which is not an event id/.test(e.message),
		)
		// …and for one it does not, where the surface is unknown and the key
		// would otherwise be recorded as an external requirement.
		assert.throws(
			() =>
				announce(identity)
					.presets({
						slug: 'bare-external',
						genre: use('core:genre/story'),
						label: 'Bare external',
						bindings: [
							{ spec: use('core:spec/story-create'), events: [sessionEvents.sessionCreated] },
							{ spec: use('core:spec/story-respond'), events: ['message-respond'] },
						],
					})
					.build(),
			(e: unknown) =>
				e instanceof AnnouncementError &&
				/binds 'message-respond', which is not an event id/.test(e.message),
		)
	})

	test('external references are recorded as requirements, never bundled', () => {
		// A pure mod: one config + one preset over another package's genre/specs.
		// use() parses the range off; the id is what documents store (24 §10).
		const respondRef = use('core:spec/story-respond@^2')
		assert.equal(respondRef.id, 'core:spec/story-respond')
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
			.presets({
				slug: 'modded',
				genre: use('core:genre/story'),
				label: 'Modded',
				bindings: [
					{ spec: use('core:spec/story-create'), events: [sessionEvents.sessionCreated] },
					{ spec: respondRef, config: external, events: [sessionEvents.messageRespond] },
				],
			})
			.build()
		assert.deepEqual(document.requires, [
			'core:event/message-respond@1',
			'core:event/session-created@1',
			'core:genre/story',
			'core:spec/story-create',
			'core:spec/story-respond',
		])
		for (const s of coverage.presets[0]!.slots) assert.equal(s.status, 'bound-external')
	})

	test('configs verify node keys for announced specs; todos are named holes', () => {
		const g = storyGenre()
		const respond = storyRespondSpec(g)
		assert.throws(
			() =>
				announce(identity)
					.genres({ g })
					.pipelines(createSpec(g), respond)
					.configs(config(respond, 'bad', { label: 'Bad' }, { nope: { params: {} } }))
					.build(),
			(e: unknown) => e instanceof AnnouncementError && /unknown node 'nope'/.test(e.message),
		)

		// A genre ships with a preset (owner ruling 2026-10-02: a custom
		// pipeline must include a default preset).
		const create = createSpec(g)
		const { coverage } = announce(identity)
			.genres({ g })
			.pipelines(create, respond)
			.presets({ slug: 'plain', genre: g, label: 'Plain', bindings: [create, respond] })
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

	test('a genre with no preset is refused: a custom pipeline must include a default preset', () => {
		// Owner ruling 2026-10-02 (notes 27/28): a genre's pipelines are
		// reached through its presets, so a package declaring a genre ships
		// at least one preset for it — the first is the genre's default.
		const g = storyGenre()
		const create = createSpec(g)
		const respond = storyRespondSpec(g)
		assert.throws(
			() => announce(identity).genres({ g }).pipelines(create, respond).build(),
			(e: unknown) =>
				e instanceof AnnouncementError &&
				/genre 'demo:genre\/chat' has no preset — a custom pipeline must include a default preset/.test(e.message),
		)
		announce(identity)
			.genres({ g })
			.pipelines(create, respond)
			.presets({ slug: 'plain', genre: g, label: 'Plain', bindings: [create, respond] })
			.build()
	})

	test('the context-bound toolkit namespaces genres and custom value kinds', () => {
		const a = announce(identity)
		const g = a.genre('crawl', { name: { en: 'Crawl' }, family: 'adventure' })
		assert.equal(g.id, 'demo:genre/crawl')
		assert.deepEqual(a.v.custom('die', 1, { sides: 6 }), { 'demo:die@1': { sides: 6 } })
	})
})

/**
 * W-A (U5c review, 2026-09-16): a preset's `actions.include` curates
 * declarations by identity — `<spec slug>#<key>` — never specs or bare
 * functions. A built spec expands to every action it contributes; a bare
 * spec id is refused at authoring time, where the author is.
 */
describe('a preset includes actions by identity (W-A)', () => {
	const g = storyGenre()
	const actionSpec = (id: string, keys: string[]) =>
		spec(id, {
			version: '1.0.0',
			contributes: {
				actions: keys.map((key) => ({
					key,
					venue: { kind: 'composer' as const },
					label: { en: key },
					description: { en: `Run ${key}.` },
					slash: `demo.${key}`,
				})),
			},
		})
			.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionAction })
			.build()

	test('a pick names one action; a spec value expands to each of its actions', () => {
		const dice = actionSpec('demo:spec/dice', ['roll', 'reroll'])
		const p = preset({
			slug: 'table',
			genre: g,
			label: 'Table',
			bindings: [createSpec(g)],
			actions: { include: [{ spec: use('core:spec/story-narrate'), key: 'narrate' }, dice] },
		})
		assert.deepEqual(p.actions?.include, [
			'core:spec/story-narrate#narrate',
			'demo:spec/dice#roll',
			'demo:spec/dice#reroll',
		])
	})

	test('a pick of a key the spec does not declare is refused, naming the keys it does', () => {
		const dice = actionSpec('demo:spec/dice', ['roll'])
		assert.throws(
			() =>
				preset({
					slug: 'table',
					genre: g,
					label: 'Table',
					bindings: [createSpec(g)],
					actions: { include: [{ spec: dice, key: 'reroll' }] },
				}),
			/picks 'reroll' from 'demo:spec\/dice', which contributes 'roll'/,
		)
	})

	test("an included action's spec is a requirement when the package does not announce it", () => {
		const dice = actionSpec('demo:spec/dice', ['roll'])
		const { document } = announce({ ns: 'demo', author: 'demo', title: 'Demo pack' })
			.genres({ g })
			.pipelines(createSpec(g), storyRespondSpec(g), dice)
			.presets({
				slug: 'table',
				genre: g,
				label: 'Table',
				bindings: [createSpec(g), storyRespondSpec(g)],
				actions: { include: [dice, { spec: use('core:spec/story-narrate'), key: 'narrate' }] },
			})
			.build()
		assert.deepEqual(document.presets[0]!.actions?.include, [
			'demo:spec/dice#roll',
			'core:spec/story-narrate#narrate',
		])
		// The spec, not the identity: an install resolves specs.
		assert.deepEqual(document.requires, [
			'core:event/message-respond@1',
			'core:event/session-action@1',
			'core:event/session-created@1',
			'core:spec/story-narrate',
		])
	})
})
