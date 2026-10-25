/**
 * 🚧 **Back · Forward** in core's conversation (RF fix 5, owner ruling
 * 2026-10-23): the strip's state — Back and Forward greyed with the host's
 * reason when there is nothing to take back or bring back, and greyed while a
 * reply is being written — and the composer's one-line note while rewound,
 * with Forward beside it for the owner; a member shown the note alone. Since
 * polish parity L1 (2026-10-24) the two presses are the session header's,
 * which reads the same `rewindStripState`; the widget draws no strip of its
 * own, only the note, from the dossier's `rewind` alone: the genre pins
 * nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
	REWIND_STRIP_REASONS,
	rewindStripState,
	turnsAheadText,
	type ConversationDossierV1,
} from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const part = (name: string) => `[data-widget-part~="${name}"]`

const row = (id: number, role: string, content: string, extra: Record<string, unknown> = {}) => ({
	id,
	role,
	content,
	channel: 'main',
	characterId: role === 'assistant' ? 3 : null,
	personaId: role === 'user' ? 9 : null,
	createdAt: '2026-10-23T10:00:00Z',
	...extra,
})
const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
const dossierWith = (rewind: ConversationDossierV1['rewind'], isOwner = true): ConversationDossierV1 => ({
	sessionId: 1,
	lines: { 1: line('You'), 2: line('Mira') },
	scenes: [],
	scened: [],
	hasOlder: false,
	loadingOlder: false,
	isOwner,
	cast: { sessionPersonas: [], sessionCharacters: [] },
	writes: { scenes: true, lore: true },
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
	...(rewind ? { rewind } : {}),
})

async function mount(opts: {
	rewind: ConversationDossierV1['rewind']
	isOwner?: boolean
	generating?: boolean
	settings?: Record<string, unknown>
}) {
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [
				row(1, 'user', 'Hello there'),
				row(2, 'assistant', 'Hi.', opts.generating ? { isGenerating: true } : {}),
			],
			settings: opts.settings ?? {},
			actions: { message: { primary: [], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: opts.isOwner === false },
			scoped: { session_full: dossierWith(opts.rewind, opts.isOwner ?? true) },
		},
	})
}

const textOf = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()

test('the strip state: the host’s reasons, the owner rule, a reply being written', () => {
	const none = rewindStripState({ rewind: null, isOwner: true, generating: false, story: true })
	assert.equal(none.shown, false, 'a host that sends no state draws no strip')
	const fresh = rewindStripState({
		rewind: { ahead: 0, back: null, forward: 'There is nothing ahead to bring back.' },
		isOwner: true,
		generating: false,
		story: true,
	})
	assert.equal(fresh.shown, true)
	assert.deepEqual(fresh.back, { disabled: false })
	assert.deepEqual(fresh.forward, { disabled: true, reason: 'There is nothing ahead to bring back.' })
	assert.equal(fresh.replaceText, null)
	const rewound = rewindStripState({ rewind: { ahead: 2, back: null, forward: null }, isOwner: true, generating: false, story: true })
	assert.equal(rewound.aheadText, '2 turns ahead')
	assert.equal(rewound.replaceText, '2 turns ahead will be replaced if you write now.')
	const busy = rewindStripState({ rewind: { ahead: 2, back: null, forward: null }, isOwner: true, generating: true, story: true })
	assert.deepEqual(busy.back, { disabled: true, reason: REWIND_STRIP_REASONS.generating })
	assert.deepEqual(busy.forward, { disabled: true, reason: REWIND_STRIP_REASONS.generating })
	const guest = rewindStripState({ rewind: { ahead: 1, back: null, forward: null }, isOwner: false, generating: false, story: true })
	assert.equal(guest.shown, false, 'a member presses neither: no strip')
	assert.equal(guest.replaceText, '1 turn ahead will be replaced if you write now.', 'but is told what writing does')
	const side = rewindStripState({ rewind: { ahead: 1, back: null, forward: null }, isOwner: true, generating: false, story: false })
	assert.equal(side.shown, false, 'a copy pinned to another channel is no story')
	assert.equal(side.replaceText, null)
	assert.equal(turnsAheadText(0), '')
	assert.equal(turnsAheadText(1), '1 turn ahead')
})

test('the widget draws no strip — Back and Forward are the header’s — and no note with nothing ahead', { timeout: 120_000 }, async () => {
	const view = await mount({ rewind: { ahead: 0, back: null, forward: 'There is nothing ahead to bring back.' } })
	try {
		assert.deepEqual(view.refused, [])
		assert.equal(view.query(part('messages.rewind')), null)
		assert.equal(view.query(part('messages.rewind-back')), null)
		assert.equal(view.query(part('messages.rewind-forward')), null)
		assert.equal(view.query(part('messages.rewind-replace')), null, 'no note while nothing is ahead')
	} finally {
		await view.unmount()
	}
})

test('rewound: the composer’s note says what a new line does, with Forward beside it', { timeout: 120_000 }, async () => {
	const view = await mount({ rewind: { ahead: 2, back: 'There is nothing to go back to yet.', forward: null } })
	try {
		const note = view.query(part('messages.rewind-replace'))!
		assert.ok(note, 'the composer says what a new line does')
		assert.equal(note.getAttribute('role'), 'status')
		assert.equal(textOf(note.querySelector(part('messages.rewind-replace-text'))), '2 turns ahead will be replaced if you write now.')
		const beside = note.querySelector(part('messages.rewind-replace-forward'))!
		assert.equal(textOf(beside), 'Forward')
		assert.equal(beside.getAttribute('aria-disabled'), 'false')
		await view.click(beside)
		assert.equal(view.requested.filter((r) => r.kind === 'forward-turn').length, 1)
		assert.deepEqual(view.requested.filter((r) => r.kind === 'rewind-turn'), [])
	} finally {
		await view.unmount()
	}
})

test('while a reply is being written the note’s Forward is grey and says why', { timeout: 120_000 }, async () => {
	const view = await mount({ rewind: { ahead: 1, back: null, forward: null }, generating: true })
	try {
		const beside = view.query(part('messages.rewind-replace-forward'))!
		assert.equal(beside.getAttribute('aria-disabled'), 'true')
		assert.match(beside.getAttribute('title') ?? '', /Wait for the reply to finish\./)
		await view.click(beside)
		assert.deepEqual(view.requested.filter((r) => r.kind === 'forward-turn'), [])
	} finally {
		await view.unmount()
	}
})

test('a member: no strip, and the note without Forward', { timeout: 120_000 }, async () => {
	const view = await mount({ rewind: { ahead: 1, back: null, forward: null }, isOwner: false })
	try {
		assert.equal(view.query(part('messages.rewind')), null)
		const note = view.query(part('messages.rewind-replace'))!
		assert.equal(textOf(note.querySelector(part('messages.rewind-replace-text'))), '1 turn ahead will be replaced if you write now.')
		assert.equal(note.querySelector(part('messages.rewind-replace-forward')), null)
	} finally {
		await view.unmount()
	}
})

test('a host that sends no rewind state draws no strip and no note; a copy pinned off the story none either', { timeout: 120_000 }, async () => {
	const bare = await mount({ rewind: undefined })
	try {
		assert.equal(bare.query(part('messages.rewind')), null)
		assert.equal(bare.query(part('messages.rewind-replace')), null)
	} finally {
		await bare.unmount()
	}
	const pinned = await mount({ rewind: { ahead: 1, back: null, forward: null }, settings: { channel: 'sanctum' } })
	try {
		assert.equal(pinned.query(part('messages.rewind')), null)
	} finally {
		await pinned.unmount()
	}
})
