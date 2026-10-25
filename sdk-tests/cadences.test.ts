/**
 * PLAN-layering D2 (lane 1, 2026-10-20) — cadences: each ready-made cadence's
 * due logic (R10, R15–R21), the 5-minute floor, the jump ceiling, Schedule
 * on both clocks, no catch-up, plugin cadences and `simulateCadence` (A17).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	everyNTurns,
	afterEachTurn,
	afterEachRound,
	afterEachScene,
	whenIdle,
	onEvent,
	whenValue,
	systemCron,
	timelineCron,
	schedule,
	cadenceDue,
	cadenceOptionFindings,
	simulateCadence,
	turnMoments,
	defineCadence,
	definePluginCadence,
	getCadence,
	allCadences,
	coreCadences,
	nextStoryOccurrence,
	coreEvents,
	sessionEvents,
	ANY_EVENT,
	CADENCE_EVENTS,
	CORE_MOMENTS,
	MOMENT_EVENTS,
	SYSTEM_TICK_EVENT,
	TURN_ENDED_EVENT,
	cadenceEventOf,
	cadenceMomentKinds,
	cadenceWakesOn,
	turnEvents,
	getScriptKind,
	parseStoryTime,
	type CadenceMoment,
	type StoryCalendar,
	type StoryTime,
} from '@serene-pub/sdk'

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.UTC(2026, 9, 20, 0, 0) // a Tuesday, on the 5-minute grid
const tick = (
	at: number,
	extra: Partial<Extract<CadenceMoment, { kind: 'system-tick' }>> = {},
): CadenceMoment => ({
	kind: 'system-tick',
	at,
	...extra,
})
const t = (line: string): StoryTime => parseStoryTime(line)!
const move = (from: string, to: string, calendar?: StoryCalendar | null): CadenceMoment => ({
	kind: 'story-clock-moved',
	from: t(from),
	to: t(to),
	calendar: calendar ?? null,
})

/** A small declared calendar: three months of 10 days, a five-day week. */
const CAL: StoryCalendar = {
	months: [
		{ name: 'Thaw', days: 10 },
		{ name: 'Bloom', days: 10 },
		{ name: 'Ember', days: 10 },
	],
	weekdays: ['Oneday', 'Twoday', 'Threeday', 'Fourday', 'Fiveday'],
}

describe('the ten are declared, addressable and serializable (§11-3)', () => {
	test('every core cadence has a stable id, options as fields, the moments it wakes on and what it carries', () => {
		assert.equal(Object.keys(coreCadences).length, 10)
		for (const def of Object.values(coreCadences)) {
			assert.match(def.id, /^core:cadence\/[a-z-]+@1$/)
			assert.equal(def.evaluate, 'host')
			assert.ok(def.wakesOn.length, def.id)
			assert.ok(def.carries.includes('session'), def.id)
			assert.equal(getCadence(def.id), def)
		}
		assert.equal(allCadences().filter((c) => c.id.startsWith('core:')).length, 10)
		const ref = everyNTurns({ n: 5 })
		assert.deepEqual(JSON.parse(JSON.stringify(ref)), {
			id: 'core:cadence/every-n-turns@1',
			options: { n: 5 },
		})
	})

	test('a redeclaration is idempotent; a different one under a claimed id throws', () => {
		const def = coreCadences.afterEachTurn
		assert.doesNotThrow(() => defineCadence({ ...def }))
		assert.throws(
			() => defineCadence({ ...def, wakesOn: ['round-ended'] }),
			/duplicate cadence id/,
		)
	})

	test('the plugin cadence script kind is a verdict', () => {
		assert.equal(getScriptKind('core:script:cadence/due@1')!.semantics, 'verdict')
	})
})

describe('turns, rounds, scenes', () => {
	test('everyNTurns fires on the multiples of n', () => {
		const run = simulateCadence(everyNTurns({ n: 5 }), turnMoments(1, 12))
		assert.deepEqual(run.fired, [4, 9])
		assert.throws(() => everyNTurns({ n: 0 }), /minimum 1/)
	})

	test('afterEachTurn fires every turn and sleeps at other moments', () => {
		assert.equal(cadenceDue(afterEachTurn(), { kind: 'turn-ended', turn: 3 }).due, true)
		const asleep = cadenceDue(afterEachTurn(), { kind: 'round-ended', round: 1 })
		assert.equal(asleep.due, false)
		assert.match(asleep.reason!, /sleeps at round-ended/)
	})

	test('afterEachRound and afterEachScene', () => {
		assert.equal(cadenceDue(afterEachRound(), { kind: 'round-ended', round: 2 }).due, true)
		assert.equal(cadenceDue(afterEachRound(), { kind: 'turn-ended', turn: 2 }).due, false)
		assert.equal(cadenceDue(afterEachScene(), { kind: 'scene-closed', sceneId: 4 }).due, true)
		assert.equal(cadenceDue(afterEachScene(), { kind: 'scene-opened', sceneId: 4 }).due, false)
	})
})

describe('events and values', () => {
	test('onEvent fires on its event, narrowed by its own fields', () => {
		const c = onEvent(coreEvents.castChanged, { where: { on: 'change', equals: 'enabled' } })
		assert.equal(
			cadenceDue(c, {
				kind: 'event',
				event: sessionEvents.castChanged,
				payload: { change: 'enabled' },
			}).due,
			true,
		)
		assert.equal(
			cadenceDue(c, {
				kind: 'event',
				event: sessionEvents.castChanged,
				payload: { change: 'position' },
			}).due,
			false,
		)
		assert.equal(
			cadenceDue(c, {
				kind: 'event',
				event: sessionEvents.annexChanged,
				payload: { change: 'enabled' },
			}).due,
			false,
		)
		assert.throws(() => onEvent('core:event/nope@1'), /not a declared event/)
	})

	test('whenValue fires when its condition becomes true — once, not on every change while it holds', () => {
		const c = whenValue({ when: { on: 'state.cast.ada.hp', lte: 0 } })
		const v = (hp: number): CadenceMoment => ({
			kind: 'value-changed',
			values: { state: { cast: { ada: { hp } } } },
		})
		const run = simulateCadence(c, [v(5), v(0), v(-1), v(3), v(0)])
		assert.deepEqual(run.fired, [1, 4])
	})
})

describe('when idle (the 5-minute tick)', () => {
	test('once per quiet stretch, after the minutes', () => {
		const c = whenIdle({ minutes: 30 })
		const last = T0
		const run = simulateCadence(c, [
			tick(T0 + 25 * MIN, { lastInteractionAt: last }),
			tick(T0 + 30 * MIN, { lastInteractionAt: last }),
			tick(T0 + 35 * MIN, { lastInteractionAt: last }),
			tick(T0 + 90 * MIN, { lastInteractionAt: T0 + 50 * MIN }),
		])
		assert.deepEqual(run.fired, [1, 3])
		assert.match(run.steps[2]!.reason!, /already ran for this quiet stretch/)
		assert.equal(cadenceDue(c, tick(T0, { lastInteractionAt: null })).due, false)
		assert.throws(() => whenIdle({ minutes: 7 }), /multiple of 5/)
	})

	test('takes minutes only — localOnly is gone (R58)', () => {
		assert.deepEqual(Object.keys(whenIdle({ minutes: 30 }).options), ['minutes'])
		assert.deepEqual(Object.keys(getCadence('core:cadence/when-idle@1')!.options), ['minutes'])
		assert.match(
			cadenceOptionFindings({ id: 'core:cadence/when-idle@1', options: { minutes: 30, localOnly: true } }).join('\n'),
			/localOnly: when-idle takes minutes/,
		)
	})
})

describe('System Cron — five minutes is the floor (R15), no seconds (R10), no catch-up (R19)', () => {
	test('a minutes interval is a multiple of 5 and at least 5', () => {
		assert.throws(() => systemCron({ every: 3, unit: 'minutes' }), /5, 10, 15/)
		assert.throws(() => systemCron({ every: 7, unit: 'minutes' }), /5, 10, 15/)
		assert.doesNotThrow(() => systemCron({ every: 5, unit: 'minutes' }))
		assert.doesNotThrow(() => systemCron({ every: 10, unit: 'minutes' }))
		assert.doesNotThrow(() => systemCron({ every: 1, unit: 'hours' }))
		assert.throws(() => systemCron({ every: 30, unit: 'seconds' as never }), /no seconds/)
	})

	test('counts from the first tick it sees, fires once however many intervals passed, then counts from the run', () => {
		const run = simulateCadence(systemCron({ every: 1, unit: 'hours' }), [
			tick(T0),
			tick(T0 + 30 * MIN),
			tick(T0 + HOUR),
			tick(T0 + HOUR + 5 * MIN),
			tick(T0 + 10 * HOUR),
			tick(T0 + 10 * HOUR + 30 * MIN),
			tick(T0 + 11 * HOUR),
		])
		assert.deepEqual(run.fired, [2, 4, 6])
		assert.match(run.steps[0]!.reason!, /counting from now/)
	})

	test('after a restart the host clears the state, and the cron counts from the first interaction (R21)', () => {
		const before = simulateCadence(systemCron({ every: 1, unit: 'hours' }), [
			tick(T0),
			tick(T0 + HOUR),
		])
		assert.deepEqual(before.fired, [1])
		const resumed = simulateCadence(systemCron({ every: 1, unit: 'hours' }), [
			tick(T0 + 50 * HOUR),
			tick(T0 + 51 * HOUR),
		])
		assert.deepEqual(resumed.fired, [1], 'nothing missed while the app was down runs')
	})
})

describe('Timeline Cron — story time, once per move (R17), the jump ceiling (R19)', () => {
	test('at least one minute, no seconds', () => {
		assert.throws(() => timelineCron({ every: 0, unit: 'minutes' }), /minimum 1/)
		assert.doesNotThrow(() => timelineCron({ every: 1, unit: 'minutes' }))
		assert.throws(() => timelineCron({ every: 1, unit: 'seconds' as never }), /one of/)
		assert.throws(
			() => timelineCron({ every: 1, unit: 'days', maxJump: { every: 0, unit: 'hours' } }),
			/1 or more/,
		)
	})

	test('a daily cron: half a day waits, a whole day fires', () => {
		const run = simulateCadence(timelineCron({ every: 1, unit: 'days' }), [
			move('412-03-05 08:00', '412-03-05 20:00'),
			move('412-03-05 20:00', '412-03-06 08:00'),
			move('412-03-06 08:00', '412-03-06 12:00'),
		])
		assert.deepEqual(run.fired, [1])
	})

	test('a long jump fires once — no catch-up — and the next counts from where the clock stands', () => {
		const run = simulateCadence(timelineCron({ every: 1, unit: 'days' }), [
			move('412-03-05 08:00', '412-03-08 08:00'),
			move('412-03-08 08:00', '412-03-08 20:00'),
			move('412-03-08 20:00', '412-03-09 08:00'),
		])
		assert.deepEqual(run.fired, [0, 2])
	})

	test('every cron whose remaining wait is within the jump fires; one not yet due waits', () => {
		const daily = timelineCron({ every: 1, unit: 'days' })
		const fiveDay = timelineCron({ every: 5, unit: 'days' })
		const jump = move('412-03-05 08:00', '412-03-08 08:00')
		assert.equal(cadenceDue(daily, jump).due, true)
		assert.equal(cadenceDue(fiveDay, jump).due, false)
	})

	test('"Skip when the clock jumps more than …": a larger move fires nothing; the next move within it does', () => {
		const c = timelineCron({
			every: 30,
			unit: 'minutes',
			maxJump: { every: 12, unit: 'hours' },
		})
		const run = simulateCadence(c, [
			move('412-03-05 08:00', '412-03-06 08:00'),
			move('412-03-06 08:00', '412-03-06 08:30'),
		])
		assert.deepEqual(run.fired, [1])
		assert.match(run.steps[0]!.reason!, /Skipped: the clock jumped more than 12 hours/)
	})

	test('a backwards move fires nothing; a declared calendar carries days into months', () => {
		assert.equal(
			cadenceDue(
				timelineCron({ every: 1, unit: 'days' }),
				move('412-03-05 08:00', '412-03-04 08:00'),
			).due,
			false,
		)
		const monthly = timelineCron({ every: 1, unit: 'months' })
		const run = simulateCadence(monthly, [
			move('1-01-05', '1-01-10', CAL),
			move('1-01-10', '1-02-06', CAL),
		])
		assert.deepEqual(run.fired, [1])
	})
})

describe('Schedule — set moments on the 5-minute grid (R20), on both clocks', () => {
	test('times sit on the grid; the at form is checked per clock', () => {
		assert.throws(() => schedule({ clock: 'system', at: { daily: '09:03' } }), /5-minute grid/)
		assert.throws(
			() => schedule({ clock: 'system', at: { weekly: { weekday: 7, time: '09:00' } } }),
			/0 = Monday/,
		)
		assert.throws(
			() => schedule({ clock: 'system', at: { once: '412-03-05 09:00' } }),
			/YYYY-MM-DDTHH:MM/,
		)
		assert.throws(
			() =>
				schedule({
					clock: 'system',
					at: { daily: '09:00' },
					maxJump: { every: 1, unit: 'days' },
				}),
			/only a story-clock schedule/,
		)
		assert.doesNotThrow(() => schedule({ clock: 'story', at: { once: '412-03-05 09:05' } }))
	})

	test('system: daily at 09:00 in the owner’s time zone — once, when a tick passes it', () => {
		const c = schedule({ clock: 'system', at: { daily: '09:00' } })
		const zone = 'America/New_York' // UTC−4 on 2026-10-20
		const run = simulateCadence(c, [
			tick(T0 + 12 * HOUR, { timeZone: zone }),
			tick(T0 + 12 * HOUR + 55 * MIN, { timeZone: zone }),
			tick(T0 + 13 * HOUR, { timeZone: zone }),
			tick(T0 + 13 * HOUR + 5 * MIN, { timeZone: zone }),
		])
		assert.deepEqual(run.fired, [2])
	})

	test('system: once fires once and is done; weekly reads the owner’s weekday', () => {
		const once = schedule({ clock: 'system', at: { once: '2026-10-20T01:00' } })
		const run = simulateCadence(once, [tick(T0), tick(T0 + HOUR), tick(T0 + 25 * HOUR)])
		assert.deepEqual(run.fired, [1])
		// 2026-10-20 is a Tuesday: weekday 1 (0 = Monday).
		const weekly = schedule({ clock: 'system', at: { weekly: { weekday: 1, time: '00:05' } } })
		assert.deepEqual(simulateCadence(weekly, [tick(T0), tick(T0 + 5 * MIN)]).fired, [1])
	})

	test('timeline: daily, weekly, monthly, annually and once on a story calendar', () => {
		assert.deepEqual(
			nextStoryOccurrence(t('1-01-05 10:00'), { daily: '09:00' }, CAL),
			t('1-01-06 09:00'),
		)
		assert.deepEqual(
			nextStoryOccurrence(t('1-01-10 10:00'), { daily: '09:00' }, CAL),
			t('1-02-01 09:00'),
		)
		// 1-01-01 is Oneday (index 0); Threeday (2) is 1-01-03.
		assert.deepEqual(
			nextStoryOccurrence(t('1-01-01 10:00'), { weekly: { weekday: 2, time: '08:00' } }, CAL),
			t('1-01-03 08:00'),
		)
		assert.deepEqual(
			nextStoryOccurrence(t('1-01-05 10:00'), { monthly: { day: 3, time: '08:00' } }, CAL),
			t('1-02-03 08:00'),
		)
		assert.deepEqual(
			nextStoryOccurrence(
				t('1-02-05 10:00'),
				{ annually: { month: 1, day: 1, time: '00:00' } },
				CAL,
			),
			t('2-01-01 00:00'),
		)
		assert.equal(
			nextStoryOccurrence(t('1'), { daily: '09:00' }, CAL),
			null,
			'a year-only clock cannot place a daily schedule',
		)

		const c = schedule({ clock: 'story', at: { daily: '09:00' } })
		const run = simulateCadence(c, [
			move('1-01-05 07:00', '1-01-05 08:55', CAL),
			move('1-01-05 08:55', '1-01-07 12:00', CAL),
		])
		assert.deepEqual(run.fired, [1], 'one firing per move however many occurrences it passed')
		const once = schedule({ clock: 'story', at: { once: '1-01-06 09:00' } })
		assert.deepEqual(
			simulateCadence(once, [
				move('1-01-05 07:00', '1-01-07 12:00', CAL),
				move('1-01-07 12:00', '1-01-09 12:00', CAL),
			]).fired,
			[0],
		)
	})

	test('timeline: the jump ceiling is honoured', () => {
		const c = schedule({
			clock: 'story',
			at: { daily: '09:00' },
			maxJump: { every: 12, unit: 'hours' },
		})
		const v = cadenceDue(c, move('1-01-05 07:00', '1-01-07 12:00', CAL))
		assert.equal(v.due, false)
		assert.match(v.reason!, /Skipped/)
	})
})

describe('plugin cadences (R5) and simulateCadence (A17)', () => {
	test('a plugin declares under its own namespace, as a script, waking on moments core emits', () => {
		const base = {
			id: 'acme.moon:cadence/full-moon@1',
			i18n: { name: { en: 'At the full moon' } },
			options: {},
			wakesOn: ['story-clock-moved'],
			carries: ['session', 'clock'],
			evaluate: { script: 'return { due: ctx.moment.to.day === 15 }' },
		} as const
		assert.throws(
			() => definePluginCadence('acme.moon', { ...base, id: 'core:cadence/full-moon@1' }),
			/core/,
		)
		assert.throws(
			() => definePluginCadence('acme.moon', { ...base, evaluate: 'host' }),
			/core:script:cadence\/due@1/,
		)
		assert.throws(
			() => definePluginCadence('acme.moon', { ...base, wakesOn: ['lunar-eclipse'] }),
			/never emits/,
		)
		const def = definePluginCadence('acme.moon', {
			...base,
			wakesOn: [...base.wakesOn],
			carries: [...base.carries],
		})
		const ref = { id: def.id, options: {} }
		assert.deepEqual(cadenceOptionFindings(ref), [])
		assert.match(cadenceDue(ref, move('1-01-14', '1-01-15')).reason!, /decided by its script/)
		const run = simulateCadence(
			ref,
			[
				move('1-01-14', '1-01-15'),
				{ kind: 'turn-ended', turn: 1 },
				move('1-01-15', '1-01-16'),
			],
			{
				evaluate: (m) =>
					m.kind === 'story-clock-moved' && (m as { to: StoryTime }).to.day === 15,
			},
		)
		assert.deepEqual(run.fired, [0])
		assert.match(run.steps[1]!.reason!, /sleeps at turn-ended/)
	})

	test('an undeclared cadence and an option it does not take are findings', () => {
		assert.match(
			cadenceOptionFindings({ id: 'core:cadence/nope@1', options: {} })[0]!,
			/not a declared cadence/,
		)
		assert.match(
			cadenceOptionFindings({ id: 'core:cadence/after-each-turn@1', options: { n: 2 } })[0]!,
			/takes no options/,
		)
	})
})

describe('D11 — they are events, never moments (2026-10-23)', () => {
	test("a cadence wakes on event ids: the session's own, the system tick, or every event", () => {
		assert.deepEqual(coreCadences.everyNTurns.wakesOn, [sessionEvents.turnEnded])
		assert.deepEqual(coreCadences.afterEachRound.wakesOn, [sessionEvents.roundEnded])
		assert.deepEqual(coreCadences.afterEachScene.wakesOn, [sessionEvents.sceneClosed])
		assert.deepEqual(coreCadences.timelineCron.wakesOn, [sessionEvents.storyClockMoved])
		assert.deepEqual(coreCadences.systemCron.wakesOn, [SYSTEM_TICK_EVENT])
		assert.deepEqual(coreCadences.onEvent.wakesOn, [ANY_EVENT])
		assert.deepEqual(coreCadences.whenValue.wakesOn, [ANY_EVENT])
		assert.deepEqual(coreCadences.schedule.wakesOn, [SYSTEM_TICK_EVENT, sessionEvents.storyClockMoved])
		assert.equal(TURN_ENDED_EVENT, sessionEvents.turnEnded)
		for (const def of Object.values(coreCadences))
			for (const w of def.wakesOn) assert.ok(w === ANY_EVENT || (CADENCE_EVENTS as readonly string[]).includes(w), `${def.id} ${w}`)
	})

	test('cadenceDue and simulateCadence take events; ⏳ a moment reads as its event', () => {
		assert.equal(cadenceDue(afterEachTurn(), { event: TURN_ENDED_EVENT, turn: 3 }).due, true)
		assert.match(cadenceDue(afterEachTurn(), { event: sessionEvents.roundEnded, round: 1 }).reason!, /sleeps at round-ended/)
		assert.deepEqual(simulateCadence(everyNTurns({ n: 5 }), turnEvents(1, 12)).fired, [4, 9])
		const c = onEvent(coreEvents.castChanged, { where: { on: 'change', equals: 'enabled' } })
		assert.equal(cadenceDue(c, { event: sessionEvents.castChanged, payload: { change: 'enabled' } }).due, true)
		// On every event: a turn ending is evaluated too, and it is not the event listened to.
		assert.match(cadenceDue(c, { event: TURN_ENDED_EVENT, turn: 1 }).reason!, /listens to/)
		assert.equal(cadenceDue(whenValue({ when: { on: 'hp', lte: 0 } }), { event: sessionEvents.castChanged, values: { hp: 0 } }).due, true)
		assert.match(cadenceDue(whenValue({ when: { on: 'hp', lte: 0 } }), { event: sessionEvents.castChanged }).reason!, /no published values/)
		// ⏳ The moments, read as events.
		assert.deepEqual(Object.keys(MOMENT_EVENTS), [...CORE_MOMENTS])
		assert.deepEqual(cadenceEventOf({ kind: 'turn-ended', turn: 2 }), { event: TURN_ENDED_EVENT, turn: 2 })
		assert.deepEqual(cadenceEventOf({ kind: 'event', event: sessionEvents.castChanged, payload: 1 }), { event: sessionEvents.castChanged, payload: 1 })
		assert.deepEqual(cadenceEventOf({ kind: 'value-changed', values: { a: 1 } }), { event: ANY_EVENT, values: { a: 1 } })
		assert.deepEqual(cadenceEventOf({ kind: 'system-tick', at: 5 }), { event: SYSTEM_TICK_EVENT, at: 5 })
		assert.deepEqual(simulateCadence(everyNTurns({ n: 5 }), turnMoments(1, 12)).steps[4]!.event, { event: TURN_ENDED_EVENT, turn: 5 })
		assert.equal(cadenceWakesOn(coreCadences.onEvent, 'acme:event/anything@1'), true)
		// ⏳ For a host that still raises moments: each cadence's wakes in the words before events.
		assert.deepEqual(cadenceMomentKinds(coreCadences.everyNTurns), ['turn-ended'])
		assert.deepEqual(cadenceMomentKinds(coreCadences.schedule), ['system-tick', 'story-clock-moved'])
		assert.deepEqual(cadenceMomentKinds(coreCadences.onEvent), ['event'])
		assert.deepEqual(cadenceMomentKinds(coreCadences.whenValue), ['value-changed'])
		assert.equal(cadenceWakesOn(coreCadences.afterEachTurn, sessionEvents.roundEnded), false)
	})

	test('⏳ a plugin cadence declared with a moment is stored with its event; a declared event is wakeable', () => {
		const def = definePluginCadence('acme.d11', {
			id: 'acme.d11:cadence/at-dusk@1',
			i18n: { name: { en: 'At dusk' } },
			options: {},
			wakesOn: ['story-clock-moved'],
			carries: ['session', 'clock'],
			evaluate: { script: 'return { due: true }' },
		})
		assert.deepEqual(def.wakesOn, [sessionEvents.storyClockMoved])
		const onCast = definePluginCadence('acme.d11', {
			id: 'acme.d11:cadence/on-cast@1',
			i18n: { name: { en: 'When the cast changes' } },
			options: {},
			wakesOn: [sessionEvents.castChanged],
			carries: ['session'],
			evaluate: { script: 'return { due: true }' },
		})
		assert.deepEqual(onCast.wakesOn, [sessionEvents.castChanged])
	})
})
