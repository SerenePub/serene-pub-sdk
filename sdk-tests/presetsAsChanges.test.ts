/**
 * PLAN-layering D4 (lane 1, 2026-10-20) — the genre's defaults and presets as
 * changes on them (R2, R3, R8, R22, R24): the stored form, the merge
 * (`effectiveRegistrations`), the ⏳ aliases (`bindings` → register/change,
 * `actions.include` → action registrations), one level, and the package
 * build's door.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	genre,
	withGenreDefaults,
	genreDefaultsOf,
	preset,
	register,
	effectiveRegistrations,
	presetChangesOf,
	declarationFindings,
	everyNTurns,
	afterEachScene,
	coreEvents,
	sessionEvents,
	spec,
	use,
	type RegistrationDecl,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { onRoutine, onUserMessage } from './registrationFixtures.js'

const g = genre('lane1:genre/story', {
	name: 'Story',
	family: 'story',
	events: { [sessionEvents.messageRespond]: { required: true } },
})
const create = spec('lane1:spec/create', { version: '1.0.0' })
	.inlet('input', C.sessionCreated.v1(), { genre: g, event: sessionEvents.sessionCreated })
	.build()
const reply = onUserMessage('lane1:spec/reply', ['speaker'])
const combatReply = onUserMessage('lane1:spec/combat-reply', ['speaker'])
const sweep = onRoutine('lane1:spec/sweep', ['session'])
const illustrate = onRoutine('lane1:spec/illustrate', ['scene'])
const narrate = spec('lane1:spec/narrate', {
	version: '1.0.0',
	contributes: {
		actions: [
			{
				key: 'narrate',
				venue: { kind: 'composer' },
				label: 'Narrate',
				description: 'The narrator speaks.',
			},
		],
	},
})
	.inlet('input', C.userMessage.v1(), { suits: [] })
	.build()

/** Locked twins (⏳ the lock alias) for the binding aliases — same ids, so the same keys. */
const lockedReply = spec('lane1:spec/reply', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
	.build()
const lockedCombat = spec('lane1:spec/combat-reply', { version: '1.0.0' })
	.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
	.build()

const createReg = register(coreEvents.sessionCreated, create)
const replyReg = register(coreEvents.messageRespond, reply)
const sweepReg = register(everyNTurns({ n: 5 }), sweep)
const illustrateReg = register(afterEachScene(), illustrate, { mode: 'off' })
const narrateReg = register(narrate.actions.narrate, narrate)
const storyGenre = withGenreDefaults(g, {
	registrations: [createReg, replyReg, sweepReg, illustrateReg, narrateReg],
	settings: { tone: { value: 'gentle', askAtStart: true } },
})

describe("R22 · the genre's defaults", () => {
	test('declared after the genre (its pipelines import it) and registered in its place', () => {
		assert.deepEqual(
			genreDefaultsOf(storyGenre)!.registrations.map((r) => r.key),
			[
				'session-created→lane1:create',
				'message-respond→lane1:reply',
				'every-n-turns→lane1:sweep',
				'after-each-scene→lane1:illustrate',
				'lane1:narrate#narrate→lane1:narrate',
			],
		)
		// The same genre re-declared without them (a reload) is the same genre.
		assert.doesNotThrow(() =>
			genre('lane1:genre/story', {
				name: 'Story',
				family: 'story',
				events: { [sessionEvents.messageRespond]: { required: true } },
			}),
		)
		withGenreDefaults(g, {
			registrations: [createReg, replyReg, sweepReg, illustrateReg, narrateReg],
			settings: { tone: { value: 'gentle', askAtStart: true } },
		})
	})

	test('the shape is refused at the declaration; the default preset is the preset’s to say', () => {
		assert.throws(
			() =>
				genre('lane1:genre/bad', {
					name: 'Bad',
					family: 'x',
					defaults: { registrations: [{}] } as never,
				}),
			/not a registration/,
		)
		assert.throws(
			() =>
				genre('lane1:genre/bad2', {
					name: 'Bad',
					family: 'x',
					defaults: { registrations: [], preset: 'x' } as never,
				}),
			/default: true/,
		)
	})
})

describe('R2 · presets are changes on the genre’s defaults', () => {
	const minimal = preset({
		slug: 'minimal',
		genre: storyGenre,
		label: 'Minimal',
		description: 'Just the replies.',
		drop: [sweepReg, illustrateReg],
	})
	const living = preset({
		slug: 'living',
		genre: storyGenre,
		label: 'Living',
		default: true,
		change: [{ of: sweepReg, mode: 'review', values: { read: { params: { k: 1 } } } }],
		register: [
			register(coreEvents.messageRespond, combatReply, {
				when: { on: 'state.world.inCombat', truthy: true },
				order: -1,
			}),
		],
		settings: { rigour: { value: 'scripts', lock: true } },
	})

	test('the stored form: keys, never objects; bindings empty; no save-message written in; default marked', () => {
		assert.deepEqual(minimal.registrations, {
			drop: ['every-n-turns→lane1:sweep', 'after-each-scene→lane1:illustrate'],
		})
		assert.deepEqual(minimal.bindings, {})
		assert.equal(minimal.default, undefined)
		assert.equal(living.default, true)
		assert.deepEqual(living.registrations!.change, [
			{
				key: 'every-n-turns→lane1:sweep',
				values: { read: { params: { k: 1 } } },
				mode: 'review',
			},
		])
		assert.equal(living.registrations!.register![0]!.key, 'message-respond→lane1:combat-reply')
		assert.deepEqual(living.settings, { rigour: { value: 'scripts', lock: true } })
	})

	test('a preset with only a title and a description states no change', () => {
		const plain = preset({
			slug: 'plain',
			genre: storyGenre,
			label: 'Plain',
			description: 'As the genre.',
		})
		assert.equal(plain.registrations, undefined)
		assert.deepEqual(
			effectiveRegistrations(
				genreDefaultsOf(storyGenre)!.registrations,
				presetChangesOf(plain, genreDefaultsOf(storyGenre)!.registrations),
			).length,
			5,
		)
	})

	test('one level: a preset never builds on a preset', () => {
		assert.throws(
			() => preset({ slug: 'x', genre: storyGenre, label: 'X', extends: minimal } as never),
			/never builds on another preset/,
		)
		assert.throws(
			() =>
				preset({ slug: 'y', genre: storyGenre, label: 'Y', register: [minimal as never] }),
			/names a preset/,
		)
		assert.throws(
			() =>
				preset({
					slug: 'z',
					genre: storyGenre,
					label: 'Z',
					change: [{ of: sweepReg, preset: 'x' } as never],
				}),
			/not something a preset changes/,
		)
	})

	test('callsPerTurn is accepted and kept as stated (⏳)', () => {
		assert.equal(
			preset({ slug: 'cpt', genre: storyGenre, label: 'C', callsPerTurn: 2 }).callsPerTurn,
			2,
		)
	})

	test("requires: a use('…@range') pipeline names its package's range (A16)", () => {
		const p = preset({
			slug: 'composed',
			genre: storyGenre,
			label: 'Composed',
			register: [register(everyNTurns({ n: 3 }), use('acme.dice:spec/roll@^1.2'))],
			requires: ['acme.moon@~2'],
		})
		assert.deepEqual(p.requires, ['acme.dice@^1.2', 'acme.moon@~2'])
		assert.throws(
			() => preset({ slug: 'bad', genre: storyGenre, label: 'Bad', requires: ['!!'] }),
			/not a requirement/,
		)
	})

	describe('effectiveRegistrations — the genre’s defaults ⊕ the preset ⊕ the session', () => {
		const defaults = genreDefaultsOf(storyGenre)!.registrations
		test('dropped ones are gone; changed ones carry the change and who made it; added ones run first by order', () => {
			const eff = effectiveRegistrations(defaults, presetChangesOf(living, defaults))
			assert.deepEqual(
				eff.map((r) => [r.key, r.origin]),
				[
					['message-respond→lane1:combat-reply', 'preset'],
					['after-each-scene→lane1:illustrate', 'genre'],
					['every-n-turns→lane1:sweep', 'genre'],
					['lane1:narrate#narrate→lane1:narrate', 'genre'],
					['message-respond→lane1:reply', 'genre'],
					['session-created→lane1:create', 'genre'],
				],
			)
			const s = eff.find((r) => r.key === 'every-n-turns→lane1:sweep')!
			assert.equal(s.mode, 'review')
			assert.deepEqual(s.changedBy, ['preset'])
			assert.deepEqual(
				effectiveRegistrations(defaults, presetChangesOf(minimal, defaults)).map(
					(r) => r.key,
				),
				[
					'lane1:narrate#narrate→lane1:narrate',
					'message-respond→lane1:reply',
					'session-created→lane1:create',
				],
			)
		})

		test('R8: a routine switched Off stays; a session row changes the mode, drops, or adds its own', () => {
			const own = register(everyNTurns({ n: 2 }), sweep)
			const eff = effectiveRegistrations(defaults, null, [
				{ key: 'after-each-scene→lane1:illustrate', mode: 'full' },
				{ key: 'lane1:narrate#narrate→lane1:narrate', dropped: true },
				{ key: own.key, registration: own, origin: 'owner' },
				{
					key: 'message-respond→lane1:reply',
					values: { read: { prompts: { system: 'S' } } },
				},
			])
			assert.equal(
				eff.find((r) => r.key === 'after-each-scene→lane1:illustrate')!.mode,
				'full',
			)
			assert.equal(
				eff.some((r) => r.key.startsWith('lane1:narrate#')),
				false,
			)
			// The session's own row replaces the default with the same key — a row with an origin (§11-1).
			assert.equal(eff.find((r) => r.key === own.key)!.origin, 'owner')
			assert.deepEqual(eff.find((r) => r.key === 'message-respond→lane1:reply')!.values, {
				read: { prompts: { system: 'S' } },
			})
			const off = effectiveRegistrations(defaults).find(
				(r) => r.key === 'after-each-scene→lane1:illustrate',
			)!
			assert.equal(off.mode, 'off', 'switched Off, still listed (R8)')
		})

		test('values merge node by node, a slot replaced whole', () => {
			const base: RegistrationDecl[] = [
				register(coreEvents.messageRespond, reply, {
					values: { read: { params: { a: 1 }, prompts: { system: 'X' } } },
				}),
			]
			const eff = effectiveRegistrations(base, {
				change: [{ key: base[0]!.key, values: { read: { params: { b: 2 } } } }],
			})
			assert.deepEqual(eff[0]!.values, {
				read: { params: { b: 2 }, prompts: { system: 'X' } },
			})
		})
	})
})

describe('⏳ the aliases: bindings and actions.include read as registrations', () => {
	const defaults = genreDefaultsOf(storyGenre)!.registrations
	test('a binding to the same spec changes nothing; to another replaces the event’s registrations', () => {
		const same = preset({
			slug: 'same',
			genre: storyGenre,
			label: 'Same',
			bindings: [create, lockedReply],
		})
		const changes = presetChangesOf(same, defaults)
		assert.equal(changes.drop, undefined)
		assert.deepEqual(
			changes.register!.map((r) => r.key),
			['message-offered→save-message'],
		)
		const other = preset({
			slug: 'other',
			genre: storyGenre,
			label: 'Other',
			bindings: [create, lockedCombat],
		})
		const swapped = presetChangesOf(other, defaults)
		assert.deepEqual(swapped.drop, ['message-respond→lane1:reply'])
		assert.ok(swapped.register!.some((r) => r.key === 'message-respond→lane1:combat-reply'))
	})

	test('the stored alias form does not move — no registrations key, save-message bound as before', () => {
		const same = preset({
			slug: 'same',
			genre: storyGenre,
			label: 'Same',
			bindings: [create, lockedReply],
		})
		assert.equal('registrations' in same, false)
		assert.deepEqual(same.bindings[sessionEvents.messageOffered], {
			spec: 'core:spec/save-message',
		})
	})

	test('actions.include: the listed actions registered, the defaults’ others dropped', () => {
		const p = preset({
			slug: 'acts',
			genre: storyGenre,
			label: 'Acts',
			bindings: [create, lockedReply],
			actions: { include: [] },
		})
		assert.ok(
			presetChangesOf(p, defaults).drop!.includes('lane1:narrate#narrate→lane1:narrate'),
		)
		const q = preset({
			slug: 'acts2',
			genre: storyGenre,
			label: 'Acts',
			bindings: [create, lockedReply],
			actions: { include: [{ spec: narrate, key: 'narrate' }] },
		})
		assert.equal(presetChangesOf(q, defaults).drop, undefined)
	})

	test('a binding’s named configuration is handed on for the host’s data upgrade', () => {
		const changes = presetChangesOf(
			{
				bindings: {
					[sessionEvents.messageRespond]: { spec: combatReply.id, config: 'tuned' },
				},
			},
			defaults,
		)
		assert.deepEqual(changes.aliasConfigs, { 'message-respond→lane1:combat-reply': 'tuned' })
	})
})

describe('the package build calls the door (§11-2)', () => {
	const base = {
		ns: 'lane1',
		genres: [storyGenre],
		pipelines: [create, reply, combatReply, sweep, illustrate, narrate],
	}
	test('a preset of a genre whose defaults register the required event needs no bindings', () => {
		const found = declarationFindings({
			...base,
			presets: [
				preset({
					slug: 'p',
					genre: storyGenre,
					label: 'P',
					register: [],
					drop: [sweepReg],
				}),
			],
		})
		assert.deepEqual(
			found.errors.filter((e) => /required slot/.test(e)),
			[],
		)
		const slots = found.coverage.presets[0]!.slots
		assert.equal(slots.find((s) => s.event === sessionEvents.messageRespond)!.status, 'bound')
	})

	test('a misfit registration in a preset is refused, once', () => {
		const misfit = preset({
			slug: 'm',
			genre: storyGenre,
			label: 'M',
			register: [register(coreEvents.sceneOpened, reply)],
		})
		const found = declarationFindings({ ...base, presets: [misfit] })
		assert.equal(
			found.errors.filter((e) => /reads the speaker; scene-opened carries none/.test(e))
				.length,
			1,
		)
	})

	test('dropping what the defaults never registered warns', () => {
		const stray = preset({
			slug: 's',
			genre: storyGenre,
			label: 'S',
			drop: [register(everyNTurns({ n: 2 }), illustrate)],
		})
		const found = declarationFindings({ ...base, presets: [stray] })
		assert.ok(found.warnings.some((w) => /the genre's defaults do not register/.test(w)))
	})

	test("another package's pipeline is a requirement, not an error", () => {
		const p = preset({
			slug: 'x',
			genre: storyGenre,
			label: 'X',
			register: [register(everyNTurns({ n: 2 }), use('acme.dice:spec/roll'))],
		})
		const found = declarationFindings({ ...base, presets: [p] })
		assert.deepEqual(
			found.errors.filter((e) => /acme\.dice/.test(e)),
			[],
		)
		assert.ok(found.requires.includes('acme.dice:spec/roll'))
	})
})
