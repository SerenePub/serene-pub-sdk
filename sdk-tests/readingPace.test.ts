/**
 * The Dialogue box's reading pace (PLAN-visual-novel-layout §1.3). Pure.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	AUTOPLAY_START_GRACE_MS,
	SETTLE_GRACE_MS,
	STALE_MARKER_MS,
	heardAfter,
	lineSpeechPhase,
	readOnState,
	readingTimeMs,
	type HeardPlayback,
	type LineSpeechFacts,
	type ReadOnFacts,
} from '../core-catalog/components/shared/messages/readingPace.js'

describe('heardAfter', () => {
	const cases: [HeardPlayback, 'play' | 'pause' | 'ended', HeardPlayback][] = [
		['none', 'play', 'playing'],
		['paused', 'play', 'playing'],
		['ended', 'play', 'playing'],
		['playing', 'ended', 'ended'],
		['paused', 'ended', 'ended'],
		['none', 'ended', 'ended'],
		['playing', 'pause', 'paused'],
		['ended', 'pause', 'ended'],
		['paused', 'pause', 'paused'],
		['none', 'pause', 'refused'],
		['refused', 'pause', 'refused'],
	]
	for (const [prev, ev, want] of cases)
		test(`${prev} + ${ev} -> ${want}`, () => assert.equal(heardAfter(prev, ev), want))
})

const T0 = Date.parse('2026-11-11T10:00:00Z')
const facts = (over: Partial<LineSpeechFacts> = {}): LineSpeechFacts => ({
	readAloud: 'play',
	playback: 'auto',
	canSpeak: true,
	pendingAt: null,
	hasAudio: false,
	audioSeenAt: null,
	heard: 'none',
	settledAt: T0,
	now: T0,
	...over,
})

describe('lineSpeechPhase', () => {
	test('no automatic voice is none', () => {
		assert.equal(lineSpeechPhase(facts({ readAloud: 'off' })), 'none')
		assert.equal(lineSpeechPhase(facts({ readAloud: 'make' })), 'none')
		assert.equal(lineSpeechPhase(facts({ playback: 'click' })), 'none')
		assert.equal(lineSpeechPhase(facts({ playback: 'never' })), 'none')
		assert.equal(
			lineSpeechPhase(facts({ canSpeak: false, hasAudio: true, heard: 'playing' })),
			'none',
		)
	})
	test('heard decides first', () => {
		assert.equal(lineSpeechPhase(facts({ heard: 'ended', hasAudio: true })), 'ended')
		assert.equal(lineSpeechPhase(facts({ heard: 'playing' })), 'playing')
		assert.equal(lineSpeechPhase(facts({ heard: 'paused' })), 'paused')
		assert.equal(lineSpeechPhase(facts({ heard: 'refused', hasAudio: true })), 'blocked')
	})
	test('audio there is ready, then blocked when never started', () => {
		assert.equal(
			lineSpeechPhase(facts({ hasAudio: true, audioSeenAt: T0, now: T0 + 100 })),
			'ready',
		)
		assert.equal(lineSpeechPhase(facts({ hasAudio: true, audioSeenAt: null })), 'ready')
		assert.equal(
			lineSpeechPhase(
				facts({ hasAudio: true, audioSeenAt: T0, now: T0 + AUTOPLAY_START_GRACE_MS - 1 }),
			),
			'ready',
		)
		assert.equal(
			lineSpeechPhase(
				facts({ hasAudio: true, audioSeenAt: T0, now: T0 + AUTOPLAY_START_GRACE_MS }),
			),
			'blocked',
		)
	})
	test('a live marker is speaking', () => {
		const at = new Date(T0).toISOString()
		assert.equal(lineSpeechPhase(facts({ pendingAt: at, now: T0 + 1000 })), 'speaking')
		assert.equal(
			lineSpeechPhase(facts({ pendingAt: at, now: T0 + STALE_MARKER_MS })),
			'speaking',
		)
	})
	test('a stale marker is none', () => {
		const at = new Date(T0).toISOString()
		assert.equal(
			lineSpeechPhase(facts({ pendingAt: at, now: T0 + STALE_MARKER_MS + 1 })),
			'none',
		)
	})
	test('an unparsable marker time is speaking', () => {
		assert.equal(lineSpeechPhase(facts({ pendingAt: '', now: T0 + 999_999 })), 'speaking')
		assert.equal(
			lineSpeechPhase(facts({ pendingAt: 'nonsense', now: T0 + 999_999 })),
			'speaking',
		)
	})
	test('a line still generating is awaiting', () => {
		assert.equal(lineSpeechPhase(facts({ settledAt: null })), 'awaiting')
	})
	test('settled: awaiting within the grace, none after', () => {
		assert.equal(lineSpeechPhase(facts({ now: T0 + SETTLE_GRACE_MS - 1 })), 'awaiting')
		assert.equal(lineSpeechPhase(facts({ now: T0 + SETTLE_GRACE_MS })), 'none')
	})
})

describe('readingTimeMs', () => {
	test('empty text is the floor', () => {
		assert.equal(readingTimeMs('', 220), 1500)
		assert.equal(readingTimeMs('   \n ', 220), 1500)
	})
	test('words at the speed', () => {
		const text = Array.from({ length: 220 }, () => 'w').join(' ')
		assert.equal(readingTimeMs(text, 220), 60_000)
		assert.equal(readingTimeMs('one  two\nthree', 180), 1500)
		assert.equal(readingTimeMs(Array.from({ length: 90 }, () => 'w').join(' '), 180), 30_000)
	})
	test('speed clamps low and high', () => {
		const text = Array.from({ length: 80 }, () => 'w').join(' ')
		assert.equal(readingTimeMs(text, 1), 60_000)
		assert.equal(readingTimeMs(text, -50), 60_000)
		const long = Array.from({ length: 600 }, () => 'w').join(' ')
		assert.equal(readingTimeMs(long, 100_000), 60_000)
	})
	test('a non-finite speed is 220', () => {
		const text = Array.from({ length: 220 }, () => 'w').join(' ')
		assert.equal(readingTimeMs(text, NaN), 60_000)
		assert.equal(readingTimeMs(text, Infinity), 60_000)
	})
})

describe('readOnState', () => {
	const on = (over: Partial<ReadOnFacts> = {}): ReadOnFacts => ({
		phase: 'none',
		queued: true,
		held: false,
		timerFrom: T0,
		settledAt: T0,
		readingMs: 4000,
		now: T0,
		...over,
	})
	test('not queued waits', () => {
		assert.deepEqual(readOnState(on({ queued: false, phase: 'ended' })), {
			due: false,
			timer: null,
		})
	})
	test('held waits', () => {
		assert.deepEqual(readOnState(on({ held: true, phase: 'ended' })), {
			due: false,
			timer: null,
		})
	})
	test('ended is due', () => {
		assert.deepEqual(readOnState(on({ phase: 'ended' })), { due: true, timer: null })
	})
	test('none runs the timer, not due before the reading time', () => {
		assert.deepEqual(readOnState(on({ now: T0 + 1000 })), {
			due: false,
			timer: { elapsed: 1000, total: 4000 },
		})
		assert.equal(readOnState(on({ now: T0 + 3999 })).due, false)
	})
	test('none is due after the reading time', () => {
		const s = readOnState(on({ now: T0 + 4000 }))
		assert.equal(s.due, true)
		assert.deepEqual(s.timer, { elapsed: 4000, total: 4000 })
	})
	test('the settle grace holds a short line', () => {
		const s = readOnState(on({ readingMs: 100, now: T0 + 1000 }))
		assert.equal(s.due, false)
		assert.deepEqual(s.timer, { elapsed: 1000, total: SETTLE_GRACE_MS })
		assert.equal(readOnState(on({ readingMs: 100, now: T0 + SETTLE_GRACE_MS })).due, true)
	})
	test('an unsettled line is never due', () => {
		const s = readOnState(on({ settledAt: null, now: T0 + 10_000 }))
		assert.equal(s.due, false)
		assert.deepEqual(s.timer, { elapsed: 10_000, total: 10_000 + SETTLE_GRACE_MS })
	})
	test('blocked runs the timer like none', () => {
		const s = readOnState(on({ phase: 'blocked', now: T0 + 5000 }))
		assert.equal(s.due, true)
	})
	test('timer after Pause is released counts from timerFrom', () => {
		const s = readOnState(on({ timerFrom: T0 + 2000, now: T0 + 3000 }))
		assert.deepEqual(s, { due: false, timer: { elapsed: 1000, total: 4000 } })
	})
	test('elapsed never goes negative', () => {
		assert.equal(readOnState(on({ timerFrom: T0 + 500, now: T0 })).timer?.elapsed, 0)
	})
	test('voice phases wait', () => {
		for (const phase of ['playing', 'paused', 'speaking', 'awaiting', 'ready'] as const) {
			assert.deepEqual(
				readOnState(on({ phase, now: T0 + 99_999 })),
				{ due: false, timer: null },
				phase,
			)
		}
	})
})
