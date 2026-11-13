/**
 * 🚧 The narrator's own turn in core's conversation (★T-1, 2026-11-04): a
 * line the host stamped `metadata.turnCause` draws the
 * `messages.message-badge-cause` badge, *Narrator's turn (every 2nd round)*;
 * pressing it asks for the turn picker. Members see it too.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const BADGE = '[data-widget-part~="messages.message-badge-cause"]'

const row = (id: number, metadata?: Record<string, unknown>) => ({
	id,
	role: 'assistant',
	content: 'The wind turns.',
	channel: 'main',
	characterId: null,
	personaId: null,
	isNarratorResponse: true,
	createdAt: '2026-10-13T10:00:00Z',
	...(metadata ? { metadata } : {}),
})
const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
const dossier = (over: Partial<ConversationDossierV1> = {}): ConversationDossierV1 => ({
	sessionId: 1,
	lines: { 1: line('Narrator') },
	scenes: [],
	scened: [],
	hasOlder: false,
	loadingOlder: false,
	isOwner: true,
	cast: { sessionPersonas: [], sessionCharacters: [] },
	writes: { scenes: true, lore: true },
	sceneBoundaries: true,
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
	...over,
})

const mount = (d: ConversationDossierV1, metadata?: Record<string, unknown>) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: (() => undefined) as never,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, metadata)],
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})

test("the narrator's own line wears the cause badge, and pressing it asks for the turn picker", { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), { turnCause: { via: 'unprompted', every: 2 } })
	try {
		assert.deepEqual(view.refused, [])
		const badge = view.query(BADGE)!
		assert.equal(badge.textContent?.trim(), "Narrator's turn (every 2nd round)")
		await view.click(badge)
		const asks = view.requested.filter((r) => r.kind === 'pick-turn')
		assert.equal(asks.length, 1)
		assert.deepEqual(asks[0]!.params, {})
	} finally {
		await view.unmount()
	}
})

test('every round reads without an ordinal', { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), { turnCause: { via: 'unprompted', every: 1 } })
	try {
		assert.equal(view.query(BADGE)?.textContent?.trim(), "Narrator's turn (every round)")
	} finally {
		await view.unmount()
	}
})

test('a line without the cause, or with another cause, wears no badge', { timeout: 120_000 }, async () => {
	for (const metadata of [undefined, { turnCause: { via: 'something-else', every: 2 } }]) {
		const view = await mount(dossier(), metadata)
		try {
			assert.equal(view.queryAll(BADGE).length, 0)
		} finally {
			await view.unmount()
		}
	}
})

test('a member sees the badge too — as words, not a button (the press is the owner\'s alone)', { timeout: 120_000 }, async () => {
	const view = await mount(dossier({ isOwner: false }), { turnCause: { via: 'unprompted', every: 3 } })
	try {
		assert.equal(view.query(BADGE)?.textContent?.trim(), "Narrator's turn (every 3rd round)")
		assert.notEqual(view.query(BADGE)?.tagName, 'BUTTON')
	} finally {
		await view.unmount()
	}
})
