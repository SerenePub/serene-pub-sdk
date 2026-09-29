/**
 * Typed references (R48): a declaration names what it points at by value —
 * the spec, the genre, the config, the action — never by a string a modder
 * retypes. The compile-time half is the `@ts-expect-error` lines below: the
 * suite runs `tsc --noEmit` first, so one of them compiling cleanly fails the
 * build. The runtime half is the same refusal for a JS author, with the fix.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	announce,
	announcementOf,
	canonicalize,
	compile,
	config,
	defineExtension,
	genre,
	preset,
	sessionEvents,
	spec,
	use,
	type PresetInput,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

const g = genre('typed:genre/table', {
	name: { en: 'Table' },
	family: 'chat',
	events: { [sessionEvents.messageRespond]: { required: true }, [sessionEvents.sessionAction]: { open: true } },
})

const create = spec('typed:spec/create', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionCreated })
	.build()
const respond = spec('typed:spec/respond', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
	.build()
const roll = spec('typed:spec/roll', {
	version: '1.0.0',
	taxonomy: { role: 'action' },
	contributes: { actions: [{ key: 'roll', venue: { kind: 'composer' }, label: { en: 'Roll' }, description: { en: 'Roll the dice.' } }] },
})
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.sessionAction })
	.build()
const tuned = config(respond, 'tuned', { label: 'Tuned' }, {})

describe('typed references (R48)', () => {
	test('a package written with values only builds, and stores ids', () => {
		const table: PresetInput = {
			slug: 'table',
			genre: g,
			label: 'Table',
			bindings: [create, { spec: respond, config: tuned }],
			actions: { include: [roll] },
		}
		const { document } = announce({ ns: 'typed', author: 'T', title: 'Typed' })
			.genres({ g })
			.pipelines(create, respond, roll)
			.configs(tuned)
			.presets(table)
			.build()
		assert.deepEqual(document.presets[0]!.bindings, {
			[sessionEvents.sessionCreated]: { spec: 'typed:spec/create' },
			[sessionEvents.messageRespond]: { spec: 'typed:spec/respond', config: 'tuned' },
		})
		assert.deepEqual(document.presets[0]!.actions?.include, ['typed:spec/roll#roll'])
		assert.equal(document.configs[0]!.spec, 'typed:spec/respond')
	})

	test('the genre is stated once, on the lock — and a spec with no taxonomy grows none', () => {
		assert.equal(compile(respond).taxonomy, undefined)
		const doc = compile(roll)
		assert.equal((doc.taxonomy as { genre?: string }).genre, 'typed:genre/table')
		assert.equal((doc.contributes as { actions: Array<{ genre: string }> }).actions[0]!.genre, 'typed:genre/table')
	})

	test('strings do not compile, and a JS author gets the same refusal at build', () => {
		assert.throws(() =>
			preset({
				slug: 'x',
				// @ts-expect-error — a genre is a value (or use()), never a string
				genre: 'typed:genre/table',
				label: 'X',
				bindings: [],
			}),
		)
		assert.throws(() =>
			preset({
				slug: 'x',
				genre: g,
				label: 'X',
				// @ts-expect-error — a binding is a spec value, never an id
				bindings: ['typed:spec/respond'],
			}),
		)
		assert.throws(() =>
			preset({
				slug: 'x',
				genre: g,
				label: 'X',
				bindings: [create],
				// @ts-expect-error — an action is a spec value or { spec, key }, never an identity string
				actions: { include: ['typed:spec/roll#roll'] },
			}),
		)
		// @ts-expect-error — a config names its spec by value
		assert.throws(() => config('typed:spec/respond', 'c', { label: 'C' }, {}))
		assert.throws(() =>
			defineExtension({
				slug: 'typed',
				name: 'Typed',
				version: '0.1.0',
				// @ts-expect-error — a swap names its spec by value
				swaps: [{ spec: 'core:spec/chat-turn-order', node: 'strategy', definition: C.turnRandom }],
			}),
		)
		assert.throws(() =>
			spec('typed:spec/stated', {
				version: '1.0.0',
				// @ts-expect-error — the catalogue's genre comes from the lock
				taxonomy: { role: 'action', genre: 'typed:genre/table' },
			}),
		)
	})

	test("another package's spec is named with use(), and names its events", () => {
		const p = preset({
			slug: 'modded',
			genre: use('core:genre/chat'),
			label: 'Modded',
			bindings: [{ spec: use('core:spec/respond'), events: [sessionEvents.messageRespond] }],
		})
		assert.deepEqual(p.bindings, { [sessionEvents.messageRespond]: { spec: 'core:spec/respond' } })
	})

	test('review fixes: a use() pick names its key, no binding binds nothing, a seeded swap names a real node', () => {
		assert.throws(
			() => preset({ slug: 'x', genre: g, label: 'X', bindings: [create], actions: { include: [use('core:spec/narrate') as never] } }),
			/another package's spec — name the action: \{ spec: use\('core:spec\/narrate'\), key/,
		)
		assert.throws(
			() =>
				preset({
					slug: 'x',
					genre: g,
					label: 'X',
					bindings: [create],
					actions: { include: [{ spec: use('core:spec/narrate'), key: 'Bad#Key' }] },
				}),
			/without a valid key/,
		)
		assert.throws(
			() => preset({ slug: 'x', genre: g, label: 'X', bindings: [{ spec: respond, events: [] }] }),
			/binds 'typed:spec\/respond' on no events/,
		)
		assert.throws(
			() =>
				preset({
					slug: 'x',
					genre: g,
					label: 'X',
					bindings: [create],
					defaults: { swaps: [{ spec: respond, node: 'nope', definition: C.turnManual }] },
				}),
			/swap names node 'nope', which 'typed:spec\/respond' does not have/,
		)
		// And the lock itself takes the genre by value.
		assert.throws(
			() =>
				spec('typed:spec/stringly', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
					// @ts-expect-error — the lock's genre is a value (or use()), never a string
					genre: 'typed:genre/table',
					event: sessionEvents.messageRespond,
				}),
			/names its genre as the string 'typed:genre\/table' — pass the genre value/,
		)
	})

	test('one public entry: defineExtension() announces the document the builder produced (T1b)', () => {
		const viaEntry = announcementOf(
			defineExtension({
				slug: 'typed',
				name: 'Typed',
				version: '0.1.0',
				description: 'A typed package.',
				author: 'T',
				genres: [g],
				pipelines: [create, respond, roll],
				configs: [tuned],
				presets: [{ slug: 'table', genre: g, label: 'Table', bindings: [create, { spec: respond, config: tuned }] }],
			}),
		).document
		const viaBuilder = announce({ ns: 'typed', author: 'T', title: 'Typed', summary: 'A typed package.' })
			.genres({ g })
			.pipelines(create, respond, roll)
			.configs(tuned)
			.presets({ slug: 'table', genre: g, label: 'Table', bindings: [create, { spec: respond, config: tuned }] })
			.build().document
		assert.equal(canonicalize(viaEntry), canonicalize(viaBuilder))
	})

	test('handlers are the code a plugin runs; hooks are the points it defines (R54)', () => {
		assert.throws(
			() => defineExtension({ slug: 'typed', name: 'Typed', version: '0.1.0', hooks: [] as never }),
			/'hooks' is a list — the code a plugin runs is declared under 'handlers' now/,
		)
		const { document } = announcementOf(
			defineExtension({
				slug: 'typed',
				name: 'Typed',
				version: '0.1.0',
				hooks: { 'before-roll': { event: 'core:event/message-created@1' } },
			}),
		)
		assert.deepEqual(Object.keys(document.hooks), ['typed:hook/before-roll'])
	})
})
