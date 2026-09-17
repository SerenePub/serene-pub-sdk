/**
 * The frame's half of the host protocol — the message shapes, and nothing else.
 *
 * The host embeds this document as
 * `<iframe src="/docs/playground/index.html" sandbox="allow-scripts">`, with no
 * `allow-same-origin`. That is deliberate and it is the security boundary: the
 * frame is an **opaque origin**, so it shares no cookies, no storage and no DOM
 * with the page that embedded it, and code a reader pastes in cannot reach
 * anything of the site's.
 *
 * It also decides how messages are addressed. An opaque origin serialises to
 * the string `"null"`, which is not a valid `targetOrigin`, so both sides post
 * with `"*"` and neither can usefully check `event.origin`. Nothing sensitive
 * travels either way — source text in, a height and a running flag out — and
 * anything unrecognised is ignored rather than guessed at.
 *
 * ⚠ These shapes are the contract with the host and are versioned (`v: 1`).
 * Changing one is changing both sides.
 */

/** Sent once, when the frame is listening. The host waits for it before loading code. */
export interface ReadyMessage {
	t: 'playground:ready'
	v: 1
}

/** The frame's content height, so the host can size the iframe to it. */
export interface HeightMessage {
	t: 'playground:height'
	px: number
}

/** Whether a run is in flight, so the host can show its own busy state. */
export interface StateMessage {
	t: 'playground:state'
	running: boolean
}

export type FrameMessage = ReadyMessage | HeightMessage | StateMessage

/** The code to edit, the theme to wear, and whether to run it immediately. */
export interface LoadMessage {
	t: 'playground:load'
	v: 1
	lang: PlaygroundLang
	code: string
	theme: PlaygroundTheme
	autorun?: boolean
}

/** A later theme change, without reloading the code. */
export interface ThemeMessage {
	t: 'playground:theme'
	theme: PlaygroundTheme
}

export type HostMessage = LoadMessage | ThemeMessage

export type PlaygroundTheme = 'light' | 'dark'

/** What the fence declared. Only the editor's highlighting reads it. */
export type PlaygroundLang = 'ts' | 'js'

const isRecord = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v)

const isTheme = (v: unknown): v is PlaygroundTheme => v === 'light' || v === 'dark'

/**
 * A `MessageEvent`'s data as a host message, or undefined.
 *
 * Validated field by field rather than cast, because this is the one thing that
 * crosses the boundary: the frame has no idea what else is posting into it, and
 * a message it half-understood would be worse than one it ignored.
 */
export function parseHostMessage(data: unknown): HostMessage | undefined {
	if (!isRecord(data)) return undefined
	if (data.t === 'playground:load') {
		if (data.v !== 1 || typeof data.code !== 'string') return undefined
		if (!isTheme(data.theme)) return undefined
		const lang = data.lang === 'js' ? 'js' : 'ts'
		return {
			t: 'playground:load',
			v: 1,
			lang,
			code: data.code,
			theme: data.theme,
			autorun: data.autorun === true,
		}
	}
	if (data.t === 'playground:theme' && isTheme(data.theme))
		return { t: 'playground:theme', theme: data.theme }
	return undefined
}
