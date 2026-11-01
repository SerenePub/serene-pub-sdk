/**
 * The spoken line's pending reading (speech follow-ups A4): `metadata.spoken.pending`
 * and when a line reads Speaking…. Pure; the component is proven in
 * coreConversationComponent.test.ts.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { cueCaptionAt, formatClock, isOwnVoice, isSpeaking, moodOf, playbackOf, spokenAsLine, spokenOf, spokenPendingOf, voiceNameOf } from '../core-catalog/components/shared/messages/spokenLine.js'

const pending = { runId: 'run-1', at: '2026-10-29T10:00:00Z' }

describe('spokenPendingOf', () => {
	test('reads the marker; anything misshapen is none', () => {
		assert.deepEqual(spokenPendingOf({ spoken: { pending } }), pending)
		assert.equal(spokenPendingOf(null), null)
		assert.equal(spokenPendingOf({}), null)
		assert.equal(spokenPendingOf({ spoken: {} }), null)
		assert.equal(spokenPendingOf({ spoken: { pending: { runId: '' } } }), null)
		assert.equal(spokenPendingOf({ spoken: { pending: { runId: 7 } } }), null)
		assert.deepEqual(spokenPendingOf({ spoken: { pending: { runId: 'r' } } }), { runId: 'r', at: '' })
	})
	test('a spoken holding only pending is not a spoken line', () => {
		assert.equal(spokenOf({ spoken: { pending } }), null)
	})
})

describe('isSpeaking', () => {
	test('no pending marker: not speaking', () => {
		assert.equal(isSpeaking(null, ['run-1'], null), false)
	})
	test('the run is live: speaking', () => {
		assert.equal(isSpeaking(pending, ['run-1'], null), true)
		assert.equal(isSpeaking(pending, ['run-1', 'x'], 'run-1'), true)
	})
	test('never seen live (queued, or the push not yet heard): the marker is believed', () => {
		assert.equal(isSpeaking(pending, [], null), true)
		assert.equal(isSpeaking(pending, undefined, null), true)
	})
	test('seen live and gone since: over, however long the marker lingers', () => {
		assert.equal(isSpeaking(pending, [], 'run-1'), false)
		assert.equal(isSpeaking(pending, ['other'], 'run-1'), false)
	})
	test('a seen run id of an earlier run does not end a new one', () => {
		assert.equal(isSpeaking({ runId: 'run-2', at: '' }, [], 'run-1'), true)
	})
})

describe('the strip: clock, playback, caption', () => {
	const rec = (extra: object = {}, inflection: { label: string } | null = null) => ({
		spokenAs: { voice: 'v1', model: 'm', applied: [], ignored: [], ...extra },
		cueMap: { source: 'none' as const, spans: [] },
		inflection,
		template: null,
		at: '2026-10-29T10:00:00Z',
	})
	test('formatClock reads m:ss and survives junk', () => {
		assert.equal(formatClock(0), '0:00')
		assert.equal(formatClock(65.9), '1:05')
		assert.equal(formatClock(NaN), '0:00')
		assert.equal(formatClock(Infinity), '0:00')
		assert.equal(formatClock(-3), '0:00')
	})
	test('playbackOf takes a detail (or a wrapped one) and refuses the rest', () => {
		assert.deepEqual(playbackOf({ currentTime: 1.5, duration: 4, paused: false }), { currentTime: 1.5, duration: 4, paused: false })
		assert.deepEqual(playbackOf({ type: 'timeupdate', detail: { currentTime: 2, duration: NaN, paused: true } }), {
			currentTime: 2,
			duration: 0,
			paused: true,
		})
		assert.equal(playbackOf(undefined), null)
		assert.equal(playbackOf('x'), null)
	})
	test('cueCaptionAt finds the playing cue, joins a shared group once, and is silent in gaps', () => {
		const cueMap = {
			source: 'concatenated' as const,
			spans: [
				{ cue: 0, startMs: 0, endMs: 1000, text: 'Hello.' },
				{ cue: 1, startMs: 1000, endMs: 3000, text: 'How are' },
				{ cue: 2, startMs: 1000, endMs: 3000, text: 'you?' },
				{ cue: 3, startMs: 4000, endMs: 5000 },
			],
		}
		assert.equal(cueCaptionAt(cueMap, 0), 'Hello.')
		assert.equal(cueCaptionAt(cueMap, 0.999), 'Hello.')
		assert.equal(cueCaptionAt(cueMap, 1), 'How are you?')
		assert.equal(cueCaptionAt(cueMap, 3.5), null)
		assert.equal(cueCaptionAt(cueMap, 4.5), null, 'a span without text has no caption')
		assert.equal(cueCaptionAt(cueMap, 5), null)
		assert.equal(cueCaptionAt({ source: 'none', spans: [] }, 1), null)
		assert.equal(cueCaptionAt(cueMap, -1), null)
	})
	test('the voice name: passed, else recorded, else the id; the line and mood carry it', () => {
		assert.equal(voiceNameOf(rec() as any), 'v1')
		assert.equal(voiceNameOf(rec({ voiceName: 'Bruno' }) as any), 'Bruno')
		assert.equal(voiceNameOf(rec({ voiceName: 'Bruno' }) as any, 'Asked'), 'Asked')
		assert.equal(spokenAsLine(rec({ voiceName: 'Bruno' }, { label: 'sadness' }) as any), 'Spoken as Bruno · m · said with sadness')
		assert.equal(moodOf(rec({}, { label: 'Neutral' }) as any), null)
		assert.equal(moodOf(rec({}, { label: 'sadness' }) as any), 'sadness')
	})
	test('own voice: the speaker’s card or envoy, not a default', () => {
		assert.equal(isOwnVoice('timbre'), true)
		assert.equal(isOwnVoice('envoy-narration'), true)
		assert.equal(isOwnVoice('voicebank-default'), false)
		assert.equal(isOwnVoice(undefined), false)
	})
})
