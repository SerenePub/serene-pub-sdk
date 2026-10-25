/**
 * PLAN-layering D1 / D3 / D5 (lane 1, 2026-10-20) — registrations: the key is
 * derived, strings warn, duplicates warn, cycles among emitted events refuse,
 * and every other door finding (§11-2). Plus the builder's half: the suits
 * form, the ⏳ lock alias, `.emits()`, `.defaults()` and typed action handles.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	register,
	registrationKeyOf,
	registrationFindings,
	pipelineDefaultsFindings,
	coreEvents,
	sessionEvents,
	everyNTurns,
	timelineCron,
	systemCron,
	afterEachTurn,
	defineSessionEvent,
	spec,
	compile,
	canonicalHash,
	validate,
	suitsOf,
	use,
	genre,
	actionHandlesOf,
	parseRequirement,
	requirementRanges,
	S,
	type BuiltSpec,
	type RegistrationDecl,
	type Receipt,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { Read, onRoutine, onSessionEvent, onUserMessage } from './registrationFixtures.js'

const reply = onUserMessage('core:spec/test-reply', ['speaker', 'text'], 'Test reply')
const sweep = onRoutine('core:spec/test-sweep', ['session'])
const pipelines = new Map<string, BuiltSpec>([
	[reply.id, reply],
	[sweep.id, sweep],
])
const ctx = { pipeline: (id: string) => pipelines.get(id) }

const errors = (fs: ReturnType<typeof registrationFindings>) =>
	fs.filter((f) => f.severity === 'error')
const warnings = (fs: ReturnType<typeof registrationFindings>) =>
	fs.filter((f) => f.severity === 'warning')

describe('D1 · the key is derived (A8)', () => {
	test('event → its slug, pipeline → its slug tail', () => {
		const r = register(coreEvents.messageRespond, reply)
		assert.equal(r.key, 'message-respond→test-reply')
		assert.deepEqual(r.trigger, { family: 'event', event: sessionEvents.messageRespond })
		assert.equal(r.pipeline, 'core:spec/test-reply')
	})

	test('cadence → its id slug; options and when never move the key', () => {
		const a = register(everyNTurns({ n: 5 }), sweep)
		const b = register(everyNTurns({ n: 9 }), sweep, {
			mode: 'review',
			when: { on: 'state.world.x', truthy: true },
		})
		assert.equal(a.key, 'every-n-turns→test-sweep')
		assert.equal(b.key, a.key)
	})

	test("action → its spec's tail and key", () => {
		const narrate = spec('core:spec/story-narrate', {
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
		assert.equal(
			register(narrate.actions.narrate, narrate).key,
			'story-narrate#narrate→story-narrate',
		)
	})

	test("another package's ids keep their namespace — two packages never share a key", () => {
		const roll = onUserMessage('acme.dice:spec/roll', [])
		assert.equal(
			registrationKeyOf(coreEvents.messageRespond, roll),
			'message-respond→acme.dice:roll',
		)
		const guessed = defineSessionEvent({
			id: 'acme.rp:event/guessed@1',
			payload: S.text,
			name: 'Guessed',
			description: 'A guess.',
		})
		assert.equal(register(guessed, reply).key, 'acme.rp:guessed→test-reply')
	})

	test('registrationKeyOf is pure and agrees with register()', () => {
		const r = register(afterEachTurn(), sweep)
		assert.equal(registrationKeyOf(r.trigger, r.pipeline), r.key)
		assert.equal(registrationKeyOf(afterEachTurn(), 'core:spec/test-sweep'), r.key)
	})

	test('an unknown option is refused where the author is', () => {
		assert.throws(
			() => register(coreEvents.messageRespond, reply, { preset: 'x' } as never),
			/not a registration option/,
		)
	})
})

describe('R30 · strings warn, never refuse', () => {
	test('a string trigger and a string pipeline each warn', () => {
		const r = register('core:event/message-respond@1', 'core:spec/test-reply')
		const fs = registrationFindings([r], ctx)
		assert.deepEqual(errors(fs), [])
		const w = warnings(fs).filter((f) => f.law === 'registration reference')
		assert.equal(w.length, 1)
		assert.match(w[0]!.message, /'core:event\/message-respond@1' and 'core:spec\/test-reply'/)
	})

	test('objects draw no warning', () => {
		assert.deepEqual(
			registrationFindings([register(coreEvents.messageRespond, reply)], ctx),
			[],
		)
	})
})

describe('R34 · duplicates warn, never refuse', () => {
	test('two alike in one layer: one warning, no error', () => {
		const a = register(coreEvents.messageRespond, reply)
		const b = register(coreEvents.messageRespond, reply, { order: 10 })
		const fs = registrationFindings([a, b], ctx)
		assert.deepEqual(errors(fs), [])
		assert.equal(warnings(fs).filter((f) => f.law === 'registration duplicate').length, 1)
	})
})

describe('A12 · a cycle among emitted events refuses', () => {
	test('annex-changed → emits backdrop-set → emits annex-changed', () => {
		const a = spec('core:spec/test-a', { version: '1.0.0' })
			.inlet('input', C.sessionEvent.v1(), { suits: [coreEvents.annexChanged] })
			.emits(coreEvents.backdropSet)
			.build()
		const b = spec('core:spec/test-b', { version: '1.0.0' })
			.inlet('input', C.sessionEvent.v1(), { suits: [coreEvents.backdropSet] })
			.emits(coreEvents.annexChanged)
			.build()
		const all = new Map<string, BuiltSpec>([
			[a.id, a],
			[b.id, b],
		])
		const fs = registrationFindings(
			[register(coreEvents.annexChanged, a), register(coreEvents.backdropSet, b)],
			{
				pipeline: (id) => all.get(id),
			},
		)
		const cycle = errors(fs).filter((f) => f.law === 'emits cycle')
		assert.equal(cycle.length, 1)
		assert.match(
			cycle[0]!.message,
			/annex-changed@1 → core:event\/backdrop-set@1 → core:event\/annex-changed@1/,
		)
		// One edge alone is no cycle.
		assert.deepEqual(
			errors(
				registrationFindings([register(coreEvents.annexChanged, a)], {
					pipeline: (id) => all.get(id),
				}),
			),
			[],
		)
	})
})

describe('§11-2 · the door', () => {
	test('a family the host does not support is refused, in words (LS1)', () => {
		const live = {
			key: 'live:call→test-reply',
			trigger: { family: 'live', ref: 'call' },
			pipeline: reply.id,
		} as unknown as RegistrationDecl
		const fs = registrationFindings([live], ctx)
		assert.match(errors(fs)[0]!.message, /live pipelines are not available on this host yet/)
	})

	test('an undeclared event and the internal turn-order event are refused', () => {
		const ghost = register({ family: 'event', event: 'core:event/nope@1' }, reply)
		assert.ok(
			errors(registrationFindings([ghost], ctx)).some(
				(f) => f.law === 'registration trigger',
			),
		)
		const internal = register({ family: 'event', event: sessionEvents.turnOrderChanged }, reply)
		assert.match(errors(registrationFindings([internal], ctx))[0]!.message, /core-internal/)
	})

	test('routine-only fields sit on routines', () => {
		const r = register(coreEvents.messageRespond, reply, {
			mode: 'review',
			allowStacking: true,
		})
		const fs = errors(registrationFindings([r], ctx)).filter((f) => f.law === 'routine fields')
		assert.equal(fs.length, 2)
	})

	test('caps: on system-clock routines, whole numbers, within the system', () => {
		const ok = register(systemCron({ every: 1, unit: 'hours' }), sweep, {
			caps: { maxRunsInRow: 12 },
		})
		assert.deepEqual(
			errors(registrationFindings([ok], { ...ctx, caps: { maxRunsInRow: 12 } })),
			[],
		)
		const above = register(systemCron({ every: 1, unit: 'hours' }), sweep, {
			caps: { maxRunsInRow: 20 },
		})
		assert.match(
			errors(registrationFindings([above], { ...ctx, caps: { maxRunsInRow: 12 } }))[0]!
				.message,
			/above the system's 12/,
		)
		const story = register(
			timelineCron({ every: 1, unit: 'days' }),
			onRoutine('core:spec/test-story', ['clock']),
			{ caps: { maxRunsInRow: 3 } },
		)
		assert.ok(
			warnings(registrationFindings([story])).some((f) => f.law === 'registration caps'),
		)
	})

	test('stored cadence options are judged by their declarations (R15)', () => {
		const stored = register(
			{
				family: 'routine',
				cadence: {
					id: 'core:cadence/system-cron@1',
					options: { every: 7, unit: 'minutes' },
				},
			},
			sweep,
		)
		const fs = errors(registrationFindings([stored], ctx)).filter(
			(f) => f.law === 'cadence options',
		)
		assert.equal(fs.length, 1)
		assert.match(fs[0]!.message, /5, 10, 15/)
	})

	test('a story-clock cadence needs a session with a story clock', () => {
		const r = register(timelineCron({ every: 1, unit: 'days' }), sweep)
		assert.ok(
			errors(registrationFindings([r], { ...ctx, storyClock: false })).some(
				(f) => f.law === 'cadence clock',
			),
		)
		assert.deepEqual(errors(registrationFindings([r], { ...ctx, storyClock: true })), [])
	})

	test('values: never a connection, only slots a registration sets, only steps the pipeline has', () => {
		const r = register(coreEvents.messageRespond, reply, {
			values: {
				read: { connection: 'x', params: { k: 1 } },
				ghost: { prompts: { system: 'y' } },
				input: { wire: 1 },
			},
		})
		const fs = errors(registrationFindings([r], ctx)).filter(
			(f) => f.law === 'registration values',
		)
		assert.equal(fs.length, 3)
		assert.ok(fs.some((f) => /sets a connection/.test(f.message)))
		assert.ok(fs.some((f) => /no step called/.test(f.message)))
		assert.ok(fs.some((f) => /sets 'wire'/.test(f.message)))
	})

	test('a pipeline that is not installed is refused; another package’s is left to its instance', () => {
		const r = register(coreEvents.messageRespond, use('acme:spec/elsewhere'))
		assert.ok(
			errors(registrationFindings([r], ctx)).some((f) => f.law === 'registration pipeline'),
		)
		assert.deepEqual(
			errors(registrationFindings([r], { ...ctx, external: (id) => id.startsWith('acme:') })),
			[],
		)
	})

	test('fit is checked at the door (R4)', () => {
		const r = register(coreEvents.sceneOpened, reply)
		const fs = errors(registrationFindings([r], ctx)).filter(
			(f) => f.law === 'registration fit',
		)
		assert.equal(fs.length, 1)
		assert.match(fs[0]!.message, /Test reply reads the speaker; scene-opened carries none\./)
	})

	test('an action the spec does not contribute is refused', () => {
		const r = register({ family: 'action', action: `${reply.id}#nope` }, reply)
		assert.ok(
			errors(registrationFindings([r], ctx)).some((f) =>
				/declares no action 'nope'/.test(f.message),
			),
		)
	})

	test('a key that was typed, not derived, is refused', () => {
		const forged = {
			...register(coreEvents.messageRespond, reply),
			key: 'my-reply',
		} as RegistrationDecl
		assert.ok(
			errors(registrationFindings([forged], ctx)).some((f) => f.law === 'registration key'),
		)
	})

	test('a when that does not read is refused', () => {
		const r = register(coreEvents.messageRespond, reply, {
			when: { on: 'x', gt: 'two' } as never,
		})
		assert.ok(errors(registrationFindings([r], ctx)).some((f) => f.law === 'registration when'))
	})
})

describe('D5 · pipeline declared defaults', () => {
	const build = (fn: (b: any) => any) =>
		fn(
			spec('acme:spec/defaults', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('read', ($: any) => (Read as any).v1({ a: $.input.text })),
		)
	test('.defaults() is stored where the default author preset always was — byte for byte', () => {
		const viaDefaults = compile(
			build((b) => b.defaults((d: any) => d.params('read', { k: 1 }))).build(),
		)
		const viaPreset = compile(
			build((b) =>
				b.preset('default', { label: 'Default', default: true }, (p: any) =>
					p.params('read', { k: 1 }),
				),
			).build(),
		)
		assert.equal(canonicalHash(viaDefaults), canonicalHash(viaPreset))
		assert.deepEqual(viaDefaults.presets, [
			{
				slug: 'default',
				label: 'Default',
				default: true,
				owner: 'acme',
				values: [{ nodeKey: 'read', slot: 'params', value: { k: 1 } }],
			},
		])
	})
	test('declared twice is refused', () => {
		assert.throws(
			() => build((b) => b.defaults(() => {}).defaults(() => {})),
			/declares its defaults twice/,
		)
	})
	test('an author preset that is not the defaults is named as ignored (R38)', () => {
		const s = build((b) =>
			b.defaults(() => {}).preset('fast', { label: 'Fast' }, () => {}),
		).build()
		const found = pipelineDefaultsFindings(s)
		assert.equal(found.length, 1)
		assert.match(found[0]!, /'fast', which is ignored/)
	})
})

describe('D3 · the inlet: suits, the ⏳ lock alias, emits', () => {
	const g = genre('lane1:genre/inlets', { name: 'Inlets', family: 'chat' })
	const locked = () =>
		spec('lane1:spec/locked', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { genre: g, event: sessionEvents.messageRespond })
			.build()

	test('the lock still writes input, and records its events as suits — the document does not move', () => {
		const s = locked()
		assert.deepEqual(s.input, { genre: g.id, event: sessionEvents.messageRespond })
		assert.deepEqual(s.suits, [sessionEvents.messageRespond])
		const doc = compile(s)
		assert.equal(
			'suits' in doc,
			false,
			'a locked document carries no suits — its input says them',
		)
		assert.deepEqual(suitsOf(doc), [sessionEvents.messageRespond])
	})

	test('the suits form names no genre and writes suits to the document', () => {
		const s = spec('lane1:spec/free', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1(), { suits: [coreEvents.messageRespond] })
			.build()
		assert.equal(s.input, undefined)
		const doc = compile(s)
		assert.deepEqual(doc.suits, [sessionEvents.messageRespond])
		assert.deepEqual(suitsOf(doc), [sessionEvents.messageRespond])
		assert.throws(
			() =>
				spec('lane1:spec/x', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
					suits: [],
					genre: g,
				} as never),
			/names no genre/,
		)
		assert.throws(
			() =>
				spec('lane1:spec/y', { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
					suits: ['core:event/nope@1'],
				}),
			/not a declared event/,
		)
	})

	test('.emits() records declared events in the document; a spec that emits nothing hashes as before', () => {
		const s = spec('lane1:spec/emits', { version: '1.0.0' })
			.inlet('input', C.sessionEvent.v1(), { suits: [] })
			.emits(coreEvents.backdropSet, coreEvents.backdropSet)
			.build()
		assert.deepEqual(compile(s).emits, [sessionEvents.backdropSet])
		assert.equal('emits' in compile(locked()), false)
		assert.throws(
			() => spec('lane1:spec/z', { version: '1.0.0' }).emits('core:event/nope@1'),
			/not a declared event/,
		)
	})

	test('an unlocked spec contributes actions with no genre — build and validate accept it', () => {
		const s = spec('lane1:spec/act', {
			version: '1.0.0',
			contributes: {
				actions: [
					{
						key: 'roll',
						venue: { kind: 'composer' },
						label: 'Roll',
						description: 'Roll the dice.',
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), { suits: [] })
			.task('read', ($: any) => (Read as any).v1({ a: $.input.text }))
			.build()
		const doc = compile(s)
		const genreFindings = validate(doc).filter((f) => /'genre' is required/.test(f.message))
		assert.deepEqual(genreFindings, [])
		// A spec that said nothing at its inlet still needs the lock.
		assert.throws(
			() =>
				spec('lane1:spec/act2', {
					version: '1.0.0',
					contributes: {
						actions: [
							{
								key: 'roll',
								venue: { kind: 'composer' },
								label: 'Roll',
								description: 'Roll.',
							},
						],
					},
				})
					.inlet('input', C.userMessage.v1())
					.build(),
			/no inlet lock/,
		)
	})

	test('action handles: spec.actions.<key>, typed from the declarations, never in the document', () => {
		const s = spec('lane1:spec/handles', {
			version: '1.0.0',
			contributes: {
				actions: [
					{
						key: 'roll',
						venue: { kind: 'composer' },
						label: 'Roll',
						description: 'Roll the dice.',
					},
					{
						key: 'reroll',
						venue: [{ kind: 'message' }],
						label: 'Re-roll',
						description: 'Roll again.',
						collects: { recipients: { label: 'Who' } },
					},
				],
			},
		})
			.inlet('input', C.userMessage.v1(), { suits: [] })
			.build()
		assert.equal(s.actions.roll.identity, 'lane1:spec/handles#roll')
		assert.deepEqual(s.actions.reroll.venues, ['message'])
		assert.deepEqual(s.actions.reroll.collects, ['recipients'])
		// @ts-expect-error — no action 'nope' is declared, so no handle is typed
		void s.actions.nope
		assert.equal(
			Object.keys(s).includes('actions'),
			false,
			'non-enumerable: nothing that serializes a spec sees it',
		)
		assert.equal(JSON.stringify(compile(s)).includes('__handle'), false)
		assert.deepEqual(Object.keys(actionHandlesOf(compile(s))), ['roll', 'reroll'])
	})
})

describe('LS2 · the receipt records the family and the registration', () => {
	test('both fields are optional and typed', () => {
		const r: Pick<Receipt, 'triggerFamily' | 'registrationKey'> = {
			triggerFamily: 'routine',
			registrationKey: 'every-n-turns→test-sweep',
		}
		assert.equal(r.triggerFamily, 'routine')
		const live: Pick<Receipt, 'triggerFamily'> = { triggerFamily: 'live' }
		assert.equal(live.triggerFamily, 'live')
	})
})

describe('A16 · requirements with version ranges', () => {
	test('parseRequirement reads a package range, an id, and an id with a range — never an event version', () => {
		assert.deepEqual(parseRequirement('acme.dice@^1.2'), {
			requirement: 'acme.dice@^1.2',
			package: 'acme.dice',
			range: '^1.2',
		})
		assert.deepEqual(parseRequirement('core:event/message-respond@1'), {
			requirement: 'core:event/message-respond@1',
			package: 'core',
			id: 'core:event/message-respond@1',
		})
		assert.deepEqual(parseRequirement('acme:spec/x@^2'), {
			requirement: 'acme:spec/x@^2',
			package: 'acme',
			id: 'acme:spec/x',
			range: '^2',
		})
		assert.equal(parseRequirement('Not a requirement!'), undefined)
	})
	test('requirementRanges lists only the ranged entries', () => {
		assert.deepEqual(
			requirementRanges({
				requires: ['core:genre/story', 'acme.dice@^1.2', 'core:event/turn-ended@1'],
			}).map((r) => r.requirement),
			['acme.dice@^1.2'],
		)
	})
})

// The routine pipeline used above reads the session only — so it fits every cadence.
test('a routine reading only the session fits any cadence (R12)', () => {
	assert.deepEqual(
		errors(
			registrationFindings(
				[
					register(everyNTurns({ n: 3 }), sweep),
					register(timelineCron({ every: 2, unit: 'hours' }), sweep),
				],
				ctx,
			),
		),
		[],
	)
	void onSessionEvent
})
