/**
 * 🚧 The Dialogue box's reading pace (PLAN-visual-novel-layout §1.3): what
 * the shown line's voice is doing and when the box moves to the next line.
 * Pure: time is always a parameter; no DOM, no timers. No imports: a
 * component imports no runtime from the SDK.
 */

export type LineSpeechPhase =
	'none' | 'awaiting' | 'speaking' | 'ready' | 'playing' | 'paused' | 'ended' | 'blocked'
/** The last thing the shown line's player said: from its `play`, `pause` and `ended` events. */
export type HeardPlayback = 'none' | 'playing' | 'paused' | 'ended' | 'refused'

/** The never-before grace after a line settles: its speech marker is written just after. */
export const SETTLE_GRACE_MS = 1_500
/** A speech marker older than this with no audio counts as no voice. */
export const STALE_MARKER_MS = 90_000
/** Audio there but no `play` heard this long after it was seen: the browser did not start it. */
export const AUTOPLAY_START_GRACE_MS = 5_000

export function heardAfter(prev: HeardPlayback, event: 'play' | 'pause' | 'ended'): HeardPlayback {
	if (event === 'play') return 'playing'
	if (event === 'ended') return 'ended'
	// A pause with no play before it is the host answering a play the browser refused.
	if (prev === 'playing' || prev === 'paused') return 'paused'
	if (prev === 'ended') return 'ended'
	return 'refused'
}

export interface LineSpeechFacts {
	readAloud: 'off' | 'make' | 'play'
	playback: 'auto' | 'click' | 'never'
	/** The pub can speak (`dossier.speech?.canSpeak !== false`). */
	canSpeak: boolean
	/** A live speak run's marker time (`metadata.spoken.pending.at`), null when no run is live. */
	pendingAt: string | null
	/** The line has its spoken audio. */
	hasAudio: boolean
	/** When the widget first saw the line holding audio (ms), null while it has none. */
	audioSeenAt: number | null
	heard: HeardPlayback
	/** When the widget saw the line stop generating (ms); null while it is still generating. */
	settledAt: number | null
	now: number
}

export function lineSpeechPhase(f: LineSpeechFacts): LineSpeechPhase {
	if (!(f.readAloud === 'play' && f.playback === 'auto' && f.canSpeak)) return 'none'
	if (f.heard === 'ended') return 'ended'
	if (f.heard === 'playing') return 'playing'
	if (f.heard === 'paused') return 'paused'
	if (f.heard === 'refused') return 'blocked'
	if (f.hasAudio) {
		return f.audioSeenAt !== null && f.now - f.audioSeenAt >= AUTOPLAY_START_GRACE_MS
			? 'blocked'
			: 'ready'
	}
	if (f.pendingAt !== null) {
		const at = Date.parse(f.pendingAt)
		return Number.isFinite(at) && f.now - at > STALE_MARKER_MS ? 'none' : 'speaking'
	}
	if (f.settledAt === null) return 'awaiting'
	return f.now < f.settledAt + SETTLE_GRACE_MS ? 'awaiting' : 'none'
}

/** How long a line stays when it has no voice: its words at `wordsPerMinute`, never under 1.5 s. */
export function readingTimeMs(text: string, wordsPerMinute: number): number {
	const words = text.split(/\s+/).filter(Boolean).length
	const wpm = Number.isFinite(wordsPerMinute) ? Math.min(600, Math.max(80, wordsPerMinute)) : 220
	return Math.max(1500, Math.round((words / wpm) * 60_000))
}

export interface ReadOnFacts {
	phase: LineSpeechPhase
	/** A row waits after the place. */
	queued: boolean
	/** The bar's **Pause** is pressed. */
	held: boolean
	/** When the reading timer counts from: the moment the line was shown, or the moment Pause was released. */
	timerFrom: number
	settledAt: number | null
	readingMs: number
	now: number
}
export interface ReadOnState {
	/** Move to the next line now. */
	due: boolean
	/** The reading timer the progress bar fills over (ms); null when none runs. */
	timer: { elapsed: number; total: number } | null
}

export function readOnState(f: ReadOnFacts): ReadOnState {
	if (!f.queued || f.held) return { due: false, timer: null }
	if (f.phase === 'ended') return { due: true, timer: null }
	if (f.phase === 'none' || f.phase === 'blocked') {
		const endAt = Math.max(f.timerFrom + f.readingMs, (f.settledAt ?? f.now) + SETTLE_GRACE_MS)
		const total = endAt - f.timerFrom
		const elapsed = Math.min(Math.max(f.now - f.timerFrom, 0), total)
		return { due: f.settledAt !== null && f.now >= endAt, timer: { elapsed, total } }
	}
	return { due: false, timer: null }
}
