/**
 * G11 — **`serene-pub ui` is a protocol-2 host.**
 *
 * The SDK has declared `FRAME_PROTOCOL = 2` since the three frame → host
 * messages landed, and the preview harness went on posting `{ protocol: 1 }`
 * and logging `error`, `request` and `save-state` as *"not a protocol v1
 * message — the host ignores it"*. Battleship found it the only way it could:
 * by building a surface against all three and watching nothing happen.
 *
 * The harness's *decisions* live in `ui-preview/src/lib/framePort.ts`, which
 * carries no `document` — for the same reason `playground/src/runner.ts` does
 * not, and this file imports it directly for the same reason
 * `playground.test.ts` imports that. If someone puts DOM in it, this suite
 * stops compiling, which is the intended alarm.
 *
 * What is pinned: `init` says 2; each of the three is answered rather than
 * ignored; a v1 frame — one that only ever says `ready` and `action` — is
 * answered exactly as it always was; and a surface's declared lanes scope a
 * page, here as in core, so a surface cannot discover that the harness was the
 * lenient one.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { FRAME_PROTOCOL } from '@serene-pub/sdk'

import {
	FRAME_PAGE_DEFAULT,
	FRAME_PAGE_MAX,
	FRAME_STATE_MAX_BYTES,
	answerFrameMessage,
	frameStateStore,
	initMessage,
	pageOf,
	savedFrameState,
	type FramePortContext,
} from '../ui-preview/src/lib/framePort.js'

const rows = (n: number, channel = 'main') =>
	Array.from({ length: n }, (_, i) => ({ id: i + 1, channel, content: `m${i + 1}` }))

const ctxFor = (over: Partial<FramePortContext> = {}): FramePortContext => ({
	surfaceId: 'session-view',
	source: { messages: rows(3) },
	state: frameStateStore(),
	...over,
})

describe('G11 · init says which protocol the host speaks', () => {
	test('protocol 2, and the surface point — not a hardcoded 1', () => {
		assert.deepEqual(initMessage('panel'), { t: 'init', protocol: 2, surface: 'panel' })
		assert.equal(initMessage('page').protocol, FRAME_PROTOCOL)
	})
})

describe('G11 · a v1 frame keeps working, unchanged', () => {
	test('ready still means ready, with nothing to restore', () => {
		const r = answerFrameMessage({ t: 'ready' }, ctxFor())!
		assert.equal(r.ready, true)
		assert.deepEqual(r.post, [])
		assert.equal(r.log.t, 'ready')
	})

	test('an action is logged with its function, its message and its payload, and noted deprecated', () => {
		const r = answerFrameMessage({ t: 'action', fn: 'fire', messageId: 12, payload: { cell: 'a1' } }, ctxFor())!
		assert.deepEqual(r.post, [])
		assert.match(r.log.detail, /fire #12 \{"cell":"a1"\}/)
		assert.match(r.log.detail, /deprecated/)
	})

	test('an invoke is logged with its key, message and blockId', () => {
		const r = answerFrameMessage(
			{ t: 'invoke', key: 'conformance#roll', messageId: 12, payload: { cell: 'a1' }, blockId: 'b1' },
			ctxFor(),
		)!
		assert.deepEqual(r.post, [])
		assert.match(r.log.detail, /← invoke conformance#roll/)
		assert.match(r.log.detail, /blockId=b1/)
		assert.match(r.log.detail, /#12/)
		assert.match(r.log.detail, /\{"cell":"a1"\}/)
	})

	test('a message the protocol does not declare is still told it was ignored', () => {
		const r = answerFrameMessage({ t: 'shout' }, ctxFor())!
		assert.match(r.log.detail, /not a protocol 2 message/)
		assert.deepEqual(r.post, [])
		// Not an object at all is not a message; the host says nothing.
		assert.equal(answerFrameMessage('hello', ctxFor()), null)
		assert.equal(answerFrameMessage(null, ctxFor()), null)
	})
})

describe('G11 · error reaches the chrome, and fatal says the surface gave up', () => {
	test('a complaint is surfaced, not swallowed', () => {
		const r = answerFrameMessage({ t: 'error', message: 'board failed to draw' }, ctxFor())!
		assert.deepEqual(r.error, { message: 'board failed to draw', fatal: false })
		assert.equal(r.log.level, 'error')
		assert.match(r.log.detail, /board failed to draw/)
	})

	test('fatal is carried through, and the detail rides with it', () => {
		const r = answerFrameMessage(
			{ t: 'error', message: 'no board in the first post', detail: { got: null }, fatal: true },
			ctxFor(),
		)!
		assert.deepEqual(r.error, { message: 'no board in the first post', fatal: true })
		assert.equal(r.log.level, 'fatal')
		assert.match(r.log.detail, /FATAL — no board in the first post \{"got":null\}/)
	})
})

describe('G11 · request messages is answered with a page', () => {
	test('the page echoes the requestId and carries the fixtures', () => {
		const r = answerFrameMessage({ t: 'request', requestId: 'r1', what: 'messages' }, ctxFor())!
		assert.equal(r.post.length, 1)
		assert.deepEqual(r.post[0], { t: 'page', requestId: 'r1', rows: rows(3) })
	})

	test('a cursor pages, and the last page carries none', () => {
		const ctx = ctxFor({ source: { messages: rows(5) } })
		const first = answerFrameMessage({ t: 'request', requestId: 'a', what: 'messages', limit: 2 }, ctx)!
		const page = first.post[0] as { rows: unknown[]; nextCursor?: string }
		assert.equal(page.rows.length, 2)
		assert.equal(page.nextCursor, 'o:2')
		const last = answerFrameMessage(
			{ t: 'request', requestId: 'b', what: 'messages', limit: 10, cursor: page.nextCursor },
			ctx,
		)!
		const tail = last.post[0] as { rows: unknown[]; nextCursor?: string }
		assert.equal(tail.rows.length, 3)
		assert.equal(tail.nextCursor, undefined)
	})

	test('a cursor this host did not issue is declined, out loud in the log', () => {
		const r = answerFrameMessage({ t: 'request', requestId: 'a', what: 'messages', cursor: 'page-2' }, ctxFor())!
		assert.deepEqual(r.post, [])
		assert.match(r.log.detail, /declined: cursor 'page-2' is not one this host issued/)
	})

	test('a request for something a host does not answer is declined by name', () => {
		const r = answerFrameMessage({ t: 'request', requestId: 'a', what: 'everything' }, ctxFor())!
		assert.deepEqual(r.post, [])
		assert.match(r.log.detail, /'everything' is not something a host answers/)
	})

	test('a panel is paged out of the lanes it declared, and never out of another', () => {
		const source = { messages: [...rows(2, 'main'), ...rows(2, 'board')], channels: ['board'] }
		const mine = answerFrameMessage({ t: 'request', requestId: 'a', what: 'messages' }, ctxFor({ source }))!
		assert.deepEqual(
			(mine.post[0] as { rows: Array<{ channel: string }> }).rows.map((m) => m.channel),
			['board', 'board'],
		)
		const theirs = answerFrameMessage(
			{ t: 'request', requestId: 'b', what: 'messages', channel: 'main' },
			ctxFor({ source }),
		)!
		assert.deepEqual(theirs.post, [])
		assert.match(theirs.log.detail, /not a lane this surface declared/)
	})

	test('the page size is the harness’s, clamped at both ends', () => {
		const source = { messages: rows(FRAME_PAGE_MAX + 20) }
		const asked = pageOf(source, { limit: FRAME_PAGE_MAX + 100 })
		assert.equal(asked.rows.length, FRAME_PAGE_MAX)
		assert.equal(pageOf(source, { limit: 0 }).rows.length, FRAME_PAGE_DEFAULT)
		assert.equal(pageOf(source, {}).rows.length, FRAME_PAGE_DEFAULT)
		assert.equal(pageOf(source, { limit: -3 }).rows.length, FRAME_PAGE_DEFAULT)
	})
})

describe('G11 · save-state survives the remount, which is the whole point', () => {
	test('what a surface saves comes back as state on the next ready', () => {
		const ctx = ctxFor()
		const saved = answerFrameMessage({ t: 'save-state', state: { tab: 'fleet', scroll: 120 } }, ctx)!
		assert.deepEqual(saved.post, [])
		assert.match(saved.log.detail, /held \d+ bytes/)
		// The remount.
		const remount = answerFrameMessage({ t: 'ready' }, ctx)!
		assert.deepEqual(remount.post, [{ t: 'state', state: { tab: 'fleet', scroll: 120 } }])
		assert.equal(remount.ready, true)
	})

	test('state is held per surface — two panels do not read each other’s', () => {
		const state = frameStateStore()
		answerFrameMessage({ t: 'save-state', state: { tab: 'a' } }, ctxFor({ surfaceId: 'panel-one', state }))
		const other = answerFrameMessage({ t: 'ready' }, ctxFor({ surfaceId: 'panel-two', state }))!
		assert.deepEqual(other.post, [])
	})

	test('it is not storage: the host caps it, and says so rather than dropping it quietly', () => {
		const ctx = ctxFor()
		const big = answerFrameMessage({ t: 'save-state', state: { blob: 'x'.repeat(FRAME_STATE_MAX_BYTES) } }, ctx)!
		assert.match(big.log.detail, /DROPPED — state is \d+ bytes, over the host's 16384/)
		assert.deepEqual(answerFrameMessage({ t: 'ready' }, ctx)!.post, [])
	})

	test('state that is not an object of small values is refused by name', () => {
		const ctx = ctxFor()
		assert.match(answerFrameMessage({ t: 'save-state', state: [1, 2] }, ctx)!.log.detail, /an object of small values/)
		const circular: Record<string, unknown> = {}
		circular.self = circular
		assert.match(answerFrameMessage({ t: 'save-state', state: circular }, ctx)!.log.detail, /JSON a host can store/)
	})

	test('the store holds a copy — a surface mutating what it saved changes nothing', () => {
		const state = frameStateStore()
		const held = { tab: 'a' }
		state.set('s', held)
		held.tab = 'b'
		assert.deepEqual(state.get('s'), { tab: 'a' })
	})

	test('the harness’s own store is module-level, because a remount is a new component', () => {
		savedFrameState.clear()
		savedFrameState.set('session-view', { scroll: 9 })
		assert.deepEqual(answerFrameMessage({ t: 'ready' }, { surfaceId: 'session-view', source: { messages: [] } })!.post, [
			{ t: 'state', state: { scroll: 9 } },
		])
		savedFrameState.clear()
	})
})
