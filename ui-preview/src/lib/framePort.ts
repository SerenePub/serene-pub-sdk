/**
 * The host half of **frame protocol 2**, with no DOM in it.
 *
 * `FrameStage.svelte` owns the iframe, the `MessageChannel` and the chrome;
 * everything it *decides* lives here, for the reason `playground/src/runner.ts`
 * has no `document` in it: the decisions are what a test can pin, and a harness
 * whose protocol half could only be checked by driving a browser is a harness
 * whose protocol half is never checked. If someone puts DOM in this file, the
 * SDK suite stops compiling, which is the intended alarm.
 *
 * ## What protocol 2 added, and why the harness had to catch up (G11)
 *
 * The SDK has declared `FRAME_PROTOCOL = 2` since the three frame → host
 * messages landed, and this harness went on posting `{ protocol: 1 }` and
 * logging all three as *"not a protocol v1 message — the host ignores it"*.
 * A surface author building against `error`, `request` or `save-state` here
 * saw nothing happen and had no way to tell a harness that ignored them from a
 * surface that never sent them. The three are:
 *
 *   · **`error`** — a frame that failed to boot was indistinguishable from one
 *     that was merely slow. Now it is surfaced in the chrome, and `fatal` says
 *     the surface has given up rather than merely complained.
 *   · **`request`** — a frame showing a long channel could not page. Now the
 *     host answers with `page`, echoing the `requestId`.
 *   · **`save-state`** — a frame with any view state lost it on every remount.
 *     Now the host holds it for the harness session and returns it as `state`.
 *
 * A **v1 frame keeps working unchanged**: it never sends the three, and `init`
 * carries a version number it is free to ignore.
 *
 * ## Where this harness is not production
 *
 * Core answers none of the three yet — `PluginFrame.svelte` is still a
 * protocol-1 host. So a surface must treat `page` and `state` as things that
 * may never arrive, exactly as it already treats `theme` and declared props.
 * The paging rules below (the default and maximum page, the offset cursor) are
 * the **harness's** choice, not a published contract: core will make its own,
 * and a surface that depends on the cursor's spelling is depending on this
 * file. Read `nextCursor` and hand it back; never parse it.
 */

import { FRAME_PROTOCOL, type FrameHostMessage, type FramePoint, type HostFrameMessage } from '@serene-pub/sdk'

/** The rows the host pages over — the fixtures, as the stage holds them. */
export type FrameRow = Record<string, unknown>

/** What a page request is answered from. */
export interface FramePortSource {
	messages: FrameRow[]
	/** The lanes this surface declared, when it declared any (a panel's scoping). */
	channels?: string[]
}

/** The default page a `request` gets when it asks for no size. */
export const FRAME_PAGE_DEFAULT = 50
/** The most rows one page may carry, whatever a frame asks for. */
export const FRAME_PAGE_MAX = 200
/**
 * The most view state the host will hold for a surface. `save-state` is not
 * storage — the declaration says the host may cap or drop it — so it does,
 * loudly, rather than quietly becoming a database a surface comes to rely on.
 */
export const FRAME_STATE_MAX_BYTES = 16 * 1024

/** `init`, as a protocol-2 host sends it. */
export const initMessage = (surface: FramePoint): Extract<HostFrameMessage, { t: 'init' }> => ({
	t: 'init',
	protocol: FRAME_PROTOCOL,
	surface,
})

// ── Saved view state ────────────────────────────────────────────────────────

export interface FrameStateStore {
	get(surfaceId: string): Record<string, unknown> | undefined
	/** Returns what the host did: kept it, or dropped it and why. */
	set(surfaceId: string, state: unknown): { kept: boolean; reason?: string; bytes: number }
	clear(surfaceId?: string): void
}

export function frameStateStore(): FrameStateStore {
	const held = new Map<string, Record<string, unknown>>()
	return {
		get: (surfaceId) => held.get(surfaceId),
		set: (surfaceId, state) => {
			if (!state || typeof state !== 'object' || Array.isArray(state))
				return { kept: false, reason: 'state is an object of small values', bytes: 0 }
			let json: string
			try {
				json = JSON.stringify(state)
			} catch {
				return { kept: false, reason: 'state must be JSON a host can store', bytes: 0 }
			}
			const bytes = new TextEncoder().encode(json).length
			if (bytes > FRAME_STATE_MAX_BYTES)
				return {
					kept: false,
					bytes,
					reason: `state is ${bytes} bytes, over the host's ${FRAME_STATE_MAX_BYTES} — the host may cap or drop it`,
				}
			held.set(surfaceId, JSON.parse(json) as Record<string, unknown>)
			return { kept: true, bytes }
		},
		clear: (surfaceId) => {
			if (surfaceId === undefined) held.clear()
			else held.delete(surfaceId)
		},
	}
}

/**
 * The harness's own store, module-level on purpose: a surface's state has to
 * survive the remount that a document reload is, which is the whole point of
 * `save-state`, and a store owned by the component would die with it.
 */
export const savedFrameState: FrameStateStore = frameStateStore()

// ── Paging ──────────────────────────────────────────────────────────────────

/** An offset cursor. Opaque to the frame by contract; this is the harness's spelling. */
const CURSOR = /^o:([0-9]+)$/

/**
 * One page of a channel's messages.
 *
 * Scoped before it is cut: a panel that declared lanes is answered out of those
 * lanes only, here as in core, so a surface cannot discover that the harness
 * was the lenient one. A request naming a channel the surface did not declare
 * is answered with an empty page rather than with somebody else's lane.
 */
export function pageOf(
	source: FramePortSource,
	req: { channel?: string; cursor?: string; limit?: number },
): { rows: FrameRow[]; nextCursor?: string; refused?: string } {
	const declared = source.channels ?? []
	if (req.channel !== undefined && declared.length && !declared.includes(req.channel))
		return { rows: [], refused: `'${req.channel}' is not a lane this surface declared` }
	const lanes = req.channel !== undefined ? [req.channel] : declared
	const rows = lanes.length
		? source.messages.filter((m) => lanes.includes(String(m.channel ?? 'main')))
		: source.messages

	let start = 0
	if (req.cursor !== undefined) {
		const m = CURSOR.exec(String(req.cursor))
		if (!m) return { rows: [], refused: `cursor '${req.cursor}' is not one this host issued` }
		start = Number(m[1])
	}
	const want = Math.floor(Number(req.limit))
	const limit = Math.max(1, Math.min(FRAME_PAGE_MAX, Number.isFinite(want) && want > 0 ? want : FRAME_PAGE_DEFAULT))
	const slice = rows.slice(start, start + limit)
	return start + limit < rows.length ? { rows: slice, nextCursor: `o:${start + limit}` } : { rows: slice }
}

// ── The reducer ─────────────────────────────────────────────────────────────

/** One line for the channel log, as the stage renders it. */
export interface FramePortLog {
	t: string
	detail: string
	/** An `error` the frame reported. `fatal` means it has given up. */
	level?: 'error' | 'fatal'
}

/** What the host does about one frame → host message. */
export interface FramePortReply {
	/** Posts to send back down the port, in order. */
	post: HostFrameMessage[]
	log: FramePortLog
	/** The frame announced itself — the stage starts pushing. */
	ready?: boolean
	/** The frame reported a failure; `fatal` means it is not coming back. */
	error?: { message: string; fatal: boolean }
}

export interface FramePortContext {
	/** The stage's id for this surface — what saved state is keyed on. */
	surfaceId: string
	source: FramePortSource
	state?: FrameStateStore
}

const detailOf = (v: unknown): string => {
	if (typeof v === 'string') return v
	try {
		return JSON.stringify(v) ?? ''
	} catch {
		return '[unserializable]'
	}
}

/**
 * Answer one message from the frame. Pure but for the state store — a frame
 * that says nothing the protocol declares is *told* it was ignored, because
 * "the host ignored it" and "the frame never sent it" have to be
 * distinguishable in the log.
 */
export function answerFrameMessage(raw: unknown, ctx: FramePortContext): FramePortReply | null {
	if (!raw || typeof raw !== 'object') return null
	const m = raw as FrameHostMessage

	if (m.t === 'ready') {
		// The one place saved state is returned: a remount is exactly when a
		// frame has forgotten, and the host answers before the first push so a
		// surface can restore its tab before it has any rows to put in it.
		const held = (ctx.state ?? savedFrameState).get(ctx.surfaceId)
		return {
			post: held ? [{ t: 'state', state: held }] : [],
			log: { t: 'ready', detail: held ? `restored ${Object.keys(held).length} saved key(s)` : '' },
			ready: true,
		}
	}

	if (m.t === 'invoke' && typeof m.key === 'string') {
		return {
			post: [],
			log: {
				t: 'invoke',
				detail: `← invoke ${m.key}${m.blockId ? ` blockId=${m.blockId}` : ''}${
					typeof m.messageId === 'number' ? ` #${m.messageId}` : ''
				}${m.payload ? ` ${detailOf(m.payload)}` : ''}`,
			},
		}
	}

	if (m.t === 'action' && typeof m.fn === 'string') {
		const base = `${m.fn}${typeof m.messageId === 'number' ? ` #${m.messageId}` : ''} ${
			m.payload ? detailOf(m.payload) : ''
		}`.trim()
		return {
			post: [],
			log: {
				t: 'action',
				detail: `${base} — deprecated, send 'invoke' instead`,
			},
		}
	}

	if (m.t === 'error' && typeof m.message === 'string') {
		const fatal = m.fatal === true
		return {
			post: [],
			log: {
				t: 'error',
				level: fatal ? 'fatal' : 'error',
				detail: `${fatal ? 'FATAL — ' : ''}${m.message}${m.detail !== undefined ? ` ${detailOf(m.detail)}` : ''}`,
			},
			error: { message: m.message, fatal },
		}
	}

	if (m.t === 'request' && typeof m.requestId === 'string') {
		if (m.what !== 'messages')
			return {
				post: [],
				log: { t: 'request', detail: `declined: '${String(m.what)}' is not something a host answers` },
			}
		const page = pageOf(ctx.source, m)
		if (page.refused)
			// Declined silently down the port — a request is not a grant — but
			// never silently in the log, or an author cannot tell a refusal from
			// a host that dropped the message.
			return { post: [], log: { t: 'request', detail: `declined: ${page.refused}` } }
		return {
			post: [{ t: 'page', requestId: m.requestId, rows: page.rows, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) }],
			log: {
				t: 'request',
				detail:
					`${m.channel ?? 'every declared lane'} → ${page.rows.length} row(s)` +
					(page.nextCursor ? ', more to come' : ''),
			},
		}
	}

	if (m.t === 'save-state') {
		const outcome = (ctx.state ?? savedFrameState).set(ctx.surfaceId, m.state)
		return {
			post: [],
			log: {
				t: 'save-state',
				detail: outcome.kept
					? `held ${outcome.bytes} bytes for this surface — returned as 'state' on the next mount`
					: `DROPPED — ${outcome.reason}`,
			},
		}
	}

	return {
		post: [],
		log: {
			t: String((m as { t?: unknown }).t ?? '?'),
			detail: `not a protocol ${FRAME_PROTOCOL} message — the host ignores it`,
		},
	}
}
