/**
 * The `/` palette meeting a newcomer (a row the host marks `isNew`): the
 * composer holds its key so the "New" chip survives being seen, and tells
 * the page ONCE (`actions-seen`). Regression: the effect read the held set
 * and wrote a fresh one, so it re-ran itself without end — the UI worker's
 * stack blew (`RangeError … at #process`) and the `actions-seen` asks it
 * fired each pass starved the socket (Dungeon Crawler walkthrough, `/reveal`,
 * 2026-10-15).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { actionIdentity, type WidgetAction } from '@serene-pub/sdk/component'
import type { ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

const reveal: WidgetAction = {
	key: 'reveal',
	specSlug: 'core:spec/dungeon-crawler-reveal',
	name: 'Reveal the planning notes',
	slash: 'reveal',
	audience: { see: ['owner'], act: ['owner'] },
	venue: 'composer',
	origin: 'core',
	floor: false,
	canAct: true,
	itemGated: false,
	isNew: true,
	enabled: true,
	quick: false,
}

const dossier = (draft: string, write: number): ConversationDossierV1 => ({
	sessionId: 1,
	lines: {},
	scenes: [],
	scened: [],
	hasOlder: false,
	loadingOlder: false,
	isOwner: true,
	cast: { sessionPersonas: [], sessionCharacters: [] },
	writes: { scenes: true, lore: true },
	debugPrompts: false,
	selectForSummary: 0,
	summaryEnded: 0,
	composer: {
		draft: { content: draft, write },
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
		palette: [reveal],
		newest: null,
		sendTonal: false,
	},
	turn: { order: [], candidates: [], show: false, canChoose: false },
	readOnly: null,
	state: { ledgers: {}, pending: {}, waiting: [] },
	appBackground: false,
})

test('the palette tells the page of a newcomer once, and keeps its New chip', { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [],
			settings: {},
			actions: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier('/rev', 1) },
		},
	})
	try {
		const seen = () => view.requested.filter((r) => r.kind === 'actions-seen')
		assert.equal(seen().length, 1, 'one actions-seen for the newcomer, not one per pass')
		assert.deepEqual(seen()[0]!.params, { keys: [actionIdentity(reveal)] })
		assert.deepEqual(view.errors, [])
		// The host has heard: the row arrives no longer new, and its chip stays while the palette is open.
		await view.push('scoped', { session_full: { ...dossier('/rev', 1), composer: { ...dossier('/rev', 1).composer, palette: [{ ...reveal, isNew: false }] } } } as never)
		assert.equal(seen().length, 1, 'nothing new: no second ask')
		assert.ok(view.root.textContent?.includes('New') || view.root.innerHTML.includes('New'), 'the New chip survives being seen')
	} finally {
		await view.unmount()
	}
})
