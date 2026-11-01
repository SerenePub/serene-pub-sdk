/**
 * 🚧 The spoken line's reading of a message (speech build, lane E3; design
 * §6.4): what `metadata.spoken` (seam S6) says, which of the row's files is
 * its audio, and which cue is speaking at a moment. Pure, so the spoken
 * line and its tests read one answer. Types only from the SDK: a component
 * imports no runtime from it.
 */
import type { CueMap, Inflection, SpokenAs, SpokenMeta, SpokenVoiceFrom } from '@serene-pub/sdk/component'
import type { MediaStripItem } from './mediaStrip'

export type ReadAloudMode = 'off' | 'make' | 'play'

/** The session's Read aloud setting off a dossier-like object; anything else is `off`. */
export function readAloudOf(dossier: unknown): ReadAloudMode {
	const v = (dossier as { readAloud?: unknown } | null | undefined)?.readAloud
	return v === 'make' || v === 'play' ? v : 'off'
}

export type SpokenPlayback = 'auto' | 'click' | 'never'

/** The viewer's own playback choice off a dossier-like object; anything else is `auto`. */
export function spokenPlaybackOf(dossier: unknown): SpokenPlayback {
	const v = (dossier as { spokenPlayback?: unknown } | null | undefined)?.spokenPlayback
	return v === 'click' || v === 'never' ? v : 'auto'
}

/** `metadata.spoken` when it has the shape the speak step records; otherwise null. */
export function spokenOf(metadata: unknown): SpokenMeta | null {
	const s = (metadata as { spoken?: unknown } | null | undefined)?.spoken as Partial<SpokenMeta> | undefined
	if (!s || typeof s !== 'object') return null
	const as = s.spokenAs as SpokenAs | undefined
	if (!as || typeof as !== 'object' || typeof as.voice !== 'string') return null
	const cueMap: CueMap =
		s.cueMap && Array.isArray(s.cueMap.spans) ? s.cueMap : { source: 'none', spans: [] }
	return {
		spokenAs: as,
		cueMap,
		inflection: (s.inflection as Inflection | null | undefined) ?? null,
		template: typeof s.template === 'string' ? s.template : null,
		at: typeof s.at === 'string' ? s.at : '',
	}
}

/** A speak run in flight for a line: `metadata.spoken.pending` (the host writes it when the run is enqueued, clears it when the run ends). */
export interface SpokenPending {
	runId: string
	at: string
}

/**
 * `metadata.spoken.pending` when it has its shape; otherwise null. Read apart from
 * `spokenOf`: a `spoken` holding only `pending` is not a spoken line.
 */
export function spokenPendingOf(metadata: unknown): SpokenPending | null {
	const s = (metadata as { spoken?: unknown } | null | undefined)?.spoken as { pending?: unknown } | null | undefined
	const p = s && typeof s === 'object' ? (s.pending as Partial<SpokenPending> | null | undefined) : null
	if (!p || typeof p !== 'object' || typeof p.runId !== 'string' || !p.runId) return null
	return { runId: p.runId, at: typeof p.at === 'string' ? p.at : '' }
}

/**
 * Whether the line reads *Speaking…*: its run is pending, and has not been seen
 * to end. `seenLive` is the run id this view last saw in `liveRunIds`: a run seen
 * live and gone since is over (a stale marker must not say Speaking… forever); a
 * run never seen (queued, or the push not yet heard) is taken at the marker's word.
 */
export function isSpeaking(
	pending: SpokenPending | null,
	liveRunIds: readonly string[] | undefined,
	seenLive: string | null,
): boolean {
	if (!pending) return false
	if (liveRunIds?.includes(pending.runId)) return true
	return seenLive !== pending.runId
}

/** The label that reads as no inflection at all. */
const NEUTRAL = new Set(['', 'neutral', 'none'])

/** The inflection label of a spoken line when it is worth a chip (not neutral), else null. */
export function moodOf(spoken: SpokenMeta): string | null {
	const label = spoken.inflection?.label?.trim()
	return label && !NEUTRAL.has(label.toLowerCase()) ? label : null
}

/**
 * *Spoken as Bruno · Qwen3-TTS 1.7B · said with sadness.* `voiceName` is the
 * display name when the host can resolve the recorded voice id (the record's own
 * `spokenAs.voiceName` first); the id otherwise. Parts that are absent are left
 * out, never blanked.
 */
export function spokenAsLine(spoken: SpokenMeta, voiceName?: string | null): string {
	const parts = [`Spoken as ${voiceNameOf(spoken, voiceName)}`]
	if (spoken.spokenAs.model) parts.push(spoken.spokenAs.model)
	const mood = moodOf(spoken)
	if (mood) parts.push(`said with ${mood}`)
	return parts.join(' · ')
}

/** The voice's display name: the one passed, else the record's, else the id. */
export function voiceNameOf(spoken: SpokenMeta, voiceName?: string | null): string {
	return voiceName?.trim() || spoken.spokenAs.voiceName?.trim() || spoken.spokenAs.voice
}

/** Whether the voice is the speaker's own (their card's, or their envoy's) rather than a default. */
export function isOwnVoice(from: SpokenVoiceFrom | undefined): boolean {
	return from === 'timbre' || from === 'envoy' || from === 'narration-timbre' || from === 'envoy-narration'
}

/** What a host `audio` event raises (seconds). */
export interface Playback {
	currentTime: number
	duration: number
	paused: boolean
}

/** The `{ currentTime, duration, paused }` an `audio` event carries; a misshapen detail reads as none. */
export function playbackOf(detail: unknown): Playback | null {
	const d = (detail as { detail?: unknown } | null | undefined)?.detail ?? detail
	const p = d as Partial<Playback> | null | undefined
	if (!p || typeof p !== 'object') return null
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
	return { currentTime: num(p.currentTime), duration: num(p.duration), paused: p.paused !== false }
}

/** `m:ss` for a count of seconds (a negative, NaN or infinite count reads `0:00`). */
export function formatClock(seconds: number): string {
	const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * The words of the cue(s) speaking at `seconds` into the audio: the spans whose
 * `[startMs, endMs)` hold the moment (the last span holds its end), their text
 * joined once each. Null when nothing is known there (no map, a gap, older
 * records without cue text).
 */
export function cueCaptionAt(cueMap: CueMap, seconds: number): string | null {
	if (!cueMap.spans.length || !Number.isFinite(seconds) || seconds < 0) return null
	const ms = seconds * 1000
	const lastEnd = Math.max(...cueMap.spans.map((s) => s.endMs))
	const seen: string[] = []
	for (const span of cueMap.spans) {
		const inside = ms >= span.startMs && (ms < span.endMs || (ms === span.endMs && span.endMs === lastEnd))
		if (inside && span.text && !seen.includes(span.text)) seen.push(span.text)
	}
	return seen.length ? seen.join(' ') : null
}

/** The row's spoken audio: the newest audio file the strip found, else null. */
export function spokenAudioItem(items: readonly MediaStripItem[]): MediaStripItem | null {
	for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'audio') return items[i]
	return null
}

/** A spoken line made within this window counts as arriving now, not as history. */
export const AUTOPLAY_FRESH_MS = 60_000

/** Whether the line's audio just arrived (its `at` is recent). */
export function isFresh(spoken: SpokenMeta, now = Date.now()): boolean {
	const t = Date.parse(spoken.at)
	return Number.isFinite(t) && now - t >= -5_000 && now - t <= AUTOPLAY_FRESH_MS
}

/** When this page (the widget's module) loaded — what "already there" is measured against. */
export const PAGE_LOADED_AT = Date.now()

/**
 * The line was spoken while this page was open — an arrival, not history.
 * The spoken line mounts only once a line HAS audio, so "it appeared while
 * mounted" cannot be seen from inside it; the record's own time can. A
 * second of slack for the server's clock against this one.
 */
export function spokenSinceLoad(spoken: SpokenMeta, loadedAt = PAGE_LOADED_AT): boolean {
	const t = Date.parse(spoken.at)
	return Number.isFinite(t) && t >= loadedAt - 1_000
}
