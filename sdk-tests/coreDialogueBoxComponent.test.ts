/**
 * Core's Dialogue box (PLAN-visual-novel-layout §1): the one line being read,
 * with the reading bar under it. The pure rules (the reading place, the queue
 * text, the pace) are held in `readingPlace.test.ts` and `readingPace.test.ts`;
 * this holds the widget: what it draws, holds, queues, sends and waits for.
 * Built by the CLI's component bundler from
 * `core-catalog/components/shared/dialogue-box/`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import {
	CORE_COMPONENTS,
	CORE_VIEW_ONLY_COMPONENTS,
	CORE_WIDGETS,
} from '../core-catalog/src/index.js'
import { readDialogueBoxSettings } from '../core-catalog/components/shared/dialogue-box/settings.js'
import { mountComponent, type MountedComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const part = (name: string) => `[data-widget-part~="${name}"]`
const decl = CORE_WIDGETS.find((w) => w.id === 'dialogue-box')!
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const row = (
	id: number,
	who: 'user' | 'osk' | 'bren',
	content: string,
	extra: Record<string, unknown> = {},
) => ({
	id,
	role: who === 'user' ? 'user' : 'assistant',
	content,
	channel: 'main',
	characterId: who === 'osk' ? 3 : who === 'bren' ? 4 : null,
	personaId: who === 'user' ? 9 : null,
	createdAt: `2026-11-11T10:00:${String(id).padStart(2, '0')}Z`,
	...extra,
})
const NAMES: Record<number, string> = {
	1: 'You',
	2: 'Osk',
	3: 'Bren',
	4: 'Osk',
	5: 'You',
	6: 'Osk',
	7: 'Bren',
}
const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
const dossier = (extra: Record<string, unknown> = {}): ConversationDossierV1 =>
	({
		sessionId: 1,
		lines: Object.fromEntries(Object.entries(NAMES).map(([id, n]) => [id, line(n)])),
		scenes: [],
		scened: [],
		hasOlder: false,
		loadingOlder: false,
		isOwner: true,
		cast: { sessionPersonas: [], sessionCharacters: [] },
		writes: { scenes: true, lore: false },
		debugPrompts: false,
		selectForSummary: 0,
		summaryEnded: 0,
		composer: {
			draft: { content: '', write: 0 },
			personas: [{ personaId: 9, name: 'You' }],
			personaId: 9,
			addPersona: false,
			hidden: false,
			channels: ['main'],
			usage: null,
			tabs: [],
			actions: false,
			notice: false,
			overflow: [],
			palette: [],
			newest: null,
			sendTonal: false,
		},
		turn: { order: [], candidates: [], show: false, canChoose: false },
		readOnly: null,
		state: { ledgers: {}, pending: {}, waiting: [] },
		appBackground: false,
		...extra,
	}) as ConversationDossierV1

const base = [row(1, 'user', 'We go north.'), row(2, 'osk', 'The road narrows.')]
const alias = {
	'@serene-pub/core-catalog/conversation': resolve(
		CORE_CATALOG,
		'src',
		'shared',
		'ui',
		'conversation',
		'index.ts',
	),
}

function mountBox(
	messages: unknown[],
	d: ConversationDossierV1 | null,
	opts: { settings?: Record<string, unknown>; grants?: string[] } = {},
) {
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/dialogue-box/dialogue-box.ts',
		// The built dist has not the reading place yet: the plain half from source.
		alias,
		owner: 'core',
		grants: opts.grants ?? ['session:full'],
		reads: [...decl.reads!],
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages,
			settings: opts.settings ?? {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: d ? { session_full: d } : {},
		},
	} as never)
}

const shownTexts = (view: MountedComponent) =>
	view.queryAll(`${part('dialogue-box.line')} sp-message-body`).map((b) => b.getAttribute('text'))
/** The id of the shown message (its element is `<prefix>message-<id>`). */
const shownId = (view: MountedComponent) =>
	Number(
		/message-(\d+)$/.exec(
			view.query(`${part('dialogue-box.line')} ${part('messages.message')}`)?.id ?? '',
		)?.[1],
	)
const showLines = (view: MountedComponent) =>
	view.requested.filter((r) => r.kind === 'show-line').map((r) => r.params)
const hasBar = (view: MountedComponent) => view.query(part('dialogue-box.bar')) !== null

async function until(view: MountedComponent, ok: () => boolean, ms = 6_000): Promise<boolean> {
	const end = Date.now() + ms
	while (Date.now() < end) {
		await view.settle()
		if (ok()) return true
		await sleep(150)
	}
	await view.settle()
	return ok()
}
/** True when `ok` stays true for the whole of `ms`. */
async function holds(view: MountedComponent, ok: () => boolean, ms: number): Promise<boolean> {
	const end = Date.now() + ms
	while (Date.now() < end) {
		await view.settle()
		if (!ok()) return false
		await sleep(150)
	}
	return ok()
}

const T = { timeout: 120_000 }

test('the dialogue box is declared one panel on the session scope with two settings', () => {
	assert.equal(decl.title, 'Dialogue box')
	assert.equal(decl.component, 'dialogue-box')
	assert.equal(decl.maxInstances, 1)
	assert.deepEqual(decl.scopes, ['session:full'])
	assert.deepEqual(decl.reads, ['layout', 'messages', 'actions', 'settings', 'viewer', 'locale'])
	assert.deepEqual(Object.keys(decl.settings ?? {}), ['autoRead', 'readingSpeed'])
	const s = decl.settings as unknown as Record<string, Record<string, unknown>>
	assert.equal(s.autoRead!.default, false)
	assert.deepEqual(
		{
			min: s.readingSpeed!.min,
			max: s.readingSpeed!.max,
			default: s.readingSpeed!.default,
			showIf: s.readingSpeed!.showIf,
		},
		{ min: 80, max: 600, default: 220, showIf: { field: 'autoRead', equals: true } },
	)
	assert.ok(CORE_COMPONENTS.some((c) => c.slug === 'dialogue-box'))
	assert.ok(CORE_VIEW_ONLY_COMPONENTS.includes('dialogue-box'))
	assert.deepEqual(readDialogueBoxSettings(undefined), { autoRead: false, readingSpeed: 220 })
	assert.deepEqual(readDialogueBoxSettings({ autoRead: 'yes', readingSpeed: 'fast' }), {
		autoRead: false,
		readingSpeed: 220,
	})
	assert.deepEqual(readDialogueBoxSettings({ autoRead: true, readingSpeed: NaN }), {
		autoRead: true,
		readingSpeed: 220,
	})
	assert.equal(readDialogueBoxSettings({ readingSpeed: 10 }).readingSpeed, 80)
	assert.equal(readDialogueBoxSettings({ readingSpeed: 9000 }).readingSpeed, 600)
	assert.equal(readDialogueBoxSettings({ readingSpeed: 200.6 }).readingSpeed, 201)
})

test("it draws exactly one line, the newest, with the log's own row", T, async () => {
	const view = await mountBox(
		[
			row(1, 'user', 'We go north.'),
			row(2, 'osk', 'The road narrows.'),
			row(3, 'osk', 'A gate.'),
		],
		dossier(),
	)
	try {
		assert.deepEqual(view.refused, [])
		assert.notEqual(view.idPrefix, '')
		assert.ok(view.query(part('dialogue-box.root')))
		assert.equal(
			view.queryAll(`${part('dialogue-box.line')} ${part('messages.message')}`).length,
			1,
		)
		assert.equal(view.queryAll(part('messages.message')).length, 1)
		assert.deepEqual(shownTexts(view), ['A gate.'])
		assert.equal(hasBar(view), false)
	} finally {
		await view.unmount()
	}
})

test('it draws nothing with no lines, and nothing without the grant', T, async () => {
	const empty = await mountBox([], dossier())
	try {
		assert.equal(empty.query(part('dialogue-box.root')), null)
		assert.equal(empty.root.textContent?.trim(), '')
	} finally {
		await empty.unmount()
	}
	const ungranted = await mountBox(base, dossier(), { grants: [] })
	try {
		assert.equal(ungranted.query(part('dialogue-box.root')), null)
		assert.equal(ungranted.root.textContent?.trim(), '')
	} finally {
		await ungranted.unmount()
	}
})

test('it holds its line, counts what queues, and Next line moves on', T, async () => {
	const view = await mountBox(base, dossier())
	try {
		assert.deepEqual(shownTexts(view), ['The road narrows.'])
		await view.push('messages', [...base, row(3, 'bren', 'Hello.')] as never)
		await view.settle()
		assert.deepEqual(shownTexts(view), ['The road narrows.'], 'the place holds')
		assert.equal(
			view.query(part('dialogue-box.queued'))?.textContent?.trim(),
			'Bren has replied',
		)
		assert.equal(view.query(part('dialogue-box.queued'))?.getAttribute('role'), 'status')
		await view.push('messages', [
			...base,
			row(3, 'bren', 'Hello.'),
			row(4, 'osk', 'Well.'),
		] as never)
		await view.settle()
		// Two distinct speakers for two lines read as names; a third line reads as a count.
		assert.equal(
			view.query(part('dialogue-box.queued'))?.textContent?.trim(),
			'Bren and Osk have replied',
		)
		await view.push('messages', [
			...base,
			row(3, 'bren', 'Hello.'),
			row(4, 'osk', 'Well.'),
			row(5, 'bren', 'So.'),
		] as never)
		await view.settle()
		assert.equal(view.query(part('dialogue-box.queued'))?.textContent?.trim(), '3 more lines')
		await view.click(part('dialogue-box.next'))
		assert.deepEqual(shownTexts(view), ['Hello.'])
		await view.click(part('dialogue-box.next'))
		assert.deepEqual(shownTexts(view), ['Well.'])
		await view.click(part('dialogue-box.next'))
		assert.deepEqual(shownTexts(view), ['So.'])
		assert.equal(hasBar(view), false, 'nothing queued, no bar')
	} finally {
		await view.unmount()
	}
})

test('Try again is only on the true newest row', T, async () => {
	const view = await mountBox(base, dossier())
	try {
		const newest = () =>
			view
				.query(`${part('dialogue-box.line')} ${part('messages.message')}`)
				?.hasAttribute('data-msg-newest')
		assert.equal(newest(), true)
		await view.push('messages', [...base, row(3, 'bren', 'Hello.')] as never)
		await view.settle()
		assert.equal(newest(), false, 'behind: not the newest')
		await view.click(part('dialogue-box.next'))
		assert.equal(newest(), true)
	} finally {
		await view.unmount()
	}
})

test('the box offers no Select for summary; Messages still does', T, async () => {
	const d = dossier({ writes: { scenes: true, lore: true } })
	const offered = (v: MountedComponent) =>
		v
			.queryAll(part('messages.message-option'))
			.some((b) => b.textContent?.trim() === 'Select for summary')
	const box = await mountBox(base, d)
	try {
		assert.ok(box.queryAll(part('messages.message-option')).length > 0, 'the menu is there')
		assert.equal(offered(box), false)
	} finally {
		await box.unmount()
	}
	const log = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		alias,
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: base,
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	} as never)
	try {
		assert.equal(offered(log), true)
	} finally {
		await log.unmount()
	}
})

test("sending catches you up; an own id outside the box's rows moves nothing", T, async () => {
	const view = await mountBox(base, dossier())
	try {
		const queue = [...base, row(3, 'bren', 'Hello.'), row(4, 'osk', 'Well.')]
		await view.push('messages', queue as never)
		await view.settle()
		assert.deepEqual(shownTexts(view), ['The road narrows.'])
		// An id that is not one of the box's rows (another channel's) moves nothing.
		await view.push('messages', [
			...queue,
			row(5, 'user', 'Whisper.', { channel: 'sanctum' }),
		] as never)
		await view.push('scoped', { session_full: dossier({ ownNewestMessageId: 5 }) } as never)
		await view.settle()
		assert.deepEqual(shownTexts(view), ['The road narrows.'])
		// The viewer's own line, then a reply: the box shows the reply.
		await view.push('messages', [
			...queue,
			row(5, 'user', 'I charge.'),
			row(6, 'osk', 'Steel rings.'),
		] as never)
		await view.push('scoped', { session_full: dossier({ ownNewestMessageId: 5 }) } as never)
		await view.settle()
		assert.deepEqual(shownTexts(view), ['Steel rings.'])
	} finally {
		await view.unmount()
	}
})

test('show-line is sent at mount and on change only', T, async () => {
	const view = await mountBox(base, dossier())
	try {
		await view.settle()
		assert.deepEqual(showLines(view), [{ messageId: null }])
		await view.push('messages', [...base, row(3, 'bren', 'Hello.')] as never)
		await view.settle()
		assert.deepEqual(showLines(view), [{ messageId: null }, { messageId: 2 }])
		// A streamed update of the queued row: same ids, new content.
		await view.push('messages', [
			...base,
			row(3, 'bren', 'Hello, there.', { isGenerating: true }),
		] as never)
		await view.push('messages', [
			...base,
			row(3, 'bren', 'Hello, there, friend.', { isGenerating: true }),
		] as never)
		await view.settle()
		assert.equal(showLines(view).length, 2, 'nothing new while it streams')
		await view.click(part('dialogue-box.next'))
		assert.deepEqual(showLines(view).at(-1), { messageId: null })
		assert.equal(showLines(view).length, 3)
	} finally {
		await view.unmount()
	}
})

const TIMED = { autoRead: true, readingSpeed: 600 }
/** Mounted on the first two lines (so the place is line 2), then `rest` queue behind it. */
async function mountHeld(
	rest: unknown[],
	d: ConversationDossierV1,
	settings: Record<string, unknown>,
	first: unknown[] = base,
) {
	const view = await mountBox(first, d, { settings })
	await view.push('messages', [...first, ...rest] as never)
	await view.settle()
	return view
}

test('read on by itself with no voice: a timed bar, then the next line', T, async () => {
	const view = await mountHeld([row(3, 'bren', 'Hello.')], dossier(), TIMED)
	try {
		await view.settle()
		assert.deepEqual(shownTexts(view), ['The road narrows.'])
		assert.ok(
			await until(view, () => view.query(part('dialogue-box.progress')) !== null, 2_000),
			'a progress bar',
		)
		assert.ok(Number(view.query(part('dialogue-box.progress'))?.getAttribute('max')) > 0)
		assert.ok(view.query(part('dialogue-box.pause')))
		assert.ok(
			await until(view, () => shownTexts(view)[0] === 'Hello.', 5_000),
			'moved on by itself',
		)
	} finally {
		await view.unmount()
	}
})

test('Pause holds the line until released', T, async () => {
	const view = await mountHeld([row(3, 'bren', 'Hello.')], dossier(), TIMED)
	try {
		await view.settle()
		await view.click(part('dialogue-box.pause'))
		assert.equal(view.query(part('dialogue-box.pause'))?.getAttribute('aria-pressed'), 'true')
		assert.equal(view.query(part('dialogue-box.progress')), null)
		assert.ok(
			await holds(view, () => shownTexts(view)[0] === 'The road narrows.', 3_000),
			'still on the line',
		)
		await view.click(part('dialogue-box.pause'))
		assert.equal(view.query(part('dialogue-box.pause'))?.getAttribute('aria-pressed'), 'false')
		assert.ok(
			await until(view, () => shownTexts(view)[0] === 'Hello.', 5_000),
			'moves on after the reading time',
		)
	} finally {
		await view.unmount()
	}
})

const audioPart = (messageId: number) => ({
	id: 30 + messageId,
	messageId,
	step: 0,
	revision: 0,
	ordinal: 1,
	type: 'core:audio',
	content: null,
	data: { assetId: 77, name: 'line.wav', mime: 'audio/wav' },
})
const spokenMeta = (at: string) => ({
	spoken: {
		spokenAs: { voice: 'bruno', model: 'Qwen3-TTS' },
		cueMap: { source: 'none', spans: [] },
		inflection: null,
		template: null,
		at,
	},
})

test(
	'with a voice it waits while speaking, moves on when the line ends and not when it pauses',
	T,
	async () => {
		const talking = dossier({ readAloud: 'play', liveRunIds: ['run-1'] })
		const pendingRow = row(2, 'osk', 'The road narrows.', {
			metadata: { spoken: { pending: { runId: 'run-1', at: new Date().toISOString() } } },
		})
		const waiting = await mountHeld([row(3, 'bren', 'Hello.')], talking, TIMED, [
			row(1, 'user', 'We go north.'),
			pendingRow,
		])
		try {
			assert.equal(shownId(waiting), 2)
			assert.ok(
				await holds(waiting, () => shownId(waiting) === 2, 3_500),
				'waits on the voice',
			)
			assert.equal(waiting.query(part('dialogue-box.progress')), null)
		} finally {
			await waiting.unmount()
		}

		const voiced = row(2, 'osk', 'The road narrows.', {
			activeRevisions: { '0': 0 },
			parts: [audioPart(2)],
			metadata: spokenMeta(new Date().toISOString()),
		})
		// Two queued: `ended` steps exactly one line, never two.
		const view = await mountHeld(
			[row(3, 'bren', 'Hello.'), row(4, 'osk', 'Quiet now.')],
			dossier({ readAloud: 'play' }),
			TIMED,
			[row(1, 'user', 'We go north.'), voiced],
		)
		try {
			await view.settle()
			const audio = view.query(part('messages.spoken-audio'))!
			assert.ok(audio, "the line's player")
			audio.setAttribute('data-proof', 'dialogue-audio')
			const here = () => shownId(view) === 2
			await view.dispatch('[data-proof="dialogue-audio"]', 'play', {
				currentTime: 0,
				duration: 3,
				paused: false,
			})
			assert.ok(await holds(view, here, 3_000), 'playing: stays')
			await view.dispatch('[data-proof="dialogue-audio"]', 'pause', {
				currentTime: 1,
				duration: 3,
				paused: true,
			})
			assert.ok(await holds(view, here, 3_000), 'paused: stays past the reading time')
			await view.dispatch('[data-proof="dialogue-audio"]', 'ended', {
				currentTime: 3,
				duration: 3,
				paused: true,
			})
			assert.ok(await until(view, () => shownId(view) === 3, 3_000), 'ended: moves on')
			await view.settle()
			assert.equal(shownId(view), 3, 'one line, not two')
		} finally {
			await view.unmount()
		}
	},
)

test('the shown line is eligible to play on its own, though not the newest', T, async () => {
	const view = await mountBox(base, dossier({ readAloud: 'play' }))
	try {
		await view.settle()
		const voiced = row(3, 'bren', 'Hello.', {
			activeRevisions: { '0': 0 },
			parts: [audioPart(3)],
			metadata: spokenMeta(new Date().toISOString()),
		})
		await view.push('messages', [...base, voiced, row(4, 'osk', 'Well.')] as never)
		await view.settle()
		assert.equal(view.query(part('messages.spoken-audio')), null, 'the held line has none')
		await view.click(part('dialogue-box.next'))
		assert.equal(shownId(view), 3)
		const audio = view.query(part('messages.spoken-audio'))!
		assert.ok(audio, "line 3's player")
		assert.equal(audio.hasAttribute('autoplay'), true)
	} finally {
		await view.unmount()
	}
})
