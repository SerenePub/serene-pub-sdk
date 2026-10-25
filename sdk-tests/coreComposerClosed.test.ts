/**
 * 🚧 Core's composer, closed by the genre (owner ruling 2026-10-15): the
 * dossier's `composer.closed` names the lanes the viewer may not write on,
 * each with what it waits on. On a closed lane the field and Send grey, the
 * reason stands where the placeholder was, and the composer is marked
 * `data-closed`; on any other lane it is the composer as ever.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type {
	AttachmentReadersV1,
	ConversationDossierV1,
} from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const MiB = 1024 * 1024

const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})

const readers = (over: Partial<AttachmentReadersV1> = {}): AttachmentReadersV1 => ({
	kinds: {
		image: { allowed: true },
		text: { allowed: true },
		pdf: { allowed: false, reason: "No model in this reply can read PDFs. This connection type doesn't take PDFs." },
	},
	calls: [{ key: 'respond', label: 'Reply', reads: ['image', 'text'], placeholderFor: ['pdf'] }],
	accept: 'image/png,image/jpeg,.png,.jpg,text/plain,.txt,.md',
	filesPerMessage: 10,
	bytesPerKind: { image: 20 * MiB, text: MiB, pdf: 32 * MiB },
	...over,
})


const dossierWith = (composer: Partial<ConversationDossierV1['composer']> = {}): ConversationDossierV1 => ({
	sessionId: 1,
	lines: { 1: line('You') },
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
		tray: [],
		attachments: readers(),
		...composer,
	},
	turn: { order: [], candidates: [], show: false, canChoose: false },
	readOnly: null,
	state: { ledgers: {}, pending: {}, waiting: [] },
	appBackground: false,
})

const mount = (d: ConversationDossierV1) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [{ id: 1, role: 'user', content: 'Hello', channel: 'main', personaId: 9, characterId: null, createdAt: '2026-10-02T10:00:00Z' }],
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})

type View = Awaited<ReturnType<typeof mount>>
const parts = (view: View, part: string) => view.queryAll(`[data-widget-part~="${part}"]`)
const asked = (view: View, kind: string) => view.requested.filter((r) => r.kind === kind).map((r) => r.params)


const FIELD = 'messages.composer-field'
const SEND = 'messages.composer-send'

test('a closed lane: the field and Send grey, the reason is the placeholder, the composer is marked closed', { timeout: 120_000 }, async () => {
	const view = await mount(dossierWith({ closed: { main: { reason: 'Make your character on the Planner tab first.' } } }))
	try {
		const field = parts(view, FIELD)[0]
		assert.ok(field, 'the field is drawn')
		assert.equal(field.getAttribute('placeholder'), 'Waiting: Make your character on the Planner tab first.')
		assert.equal(field.hasAttribute('disabled'), true)
		const send = parts(view, SEND)[0]
		assert.equal(send?.hasAttribute('disabled'), true)
		assert.equal(send?.getAttribute('title'), 'Waiting: Make your character on the Planner tab first.')
		assert.equal(parts(view, 'messages.composer')[0]?.hasAttribute('data-closed'), true)
		assert.deepEqual(asked(view, 'send'), [])
	} finally {
		await view.unmount()
	}
})

test('every channel closed (*) with no reason: the plain sentence; another lane closed: this one writes as ever', { timeout: 120_000 }, async () => {
	const all = await mount(dossierWith({ closed: { '*': {} } }))
	try {
		assert.equal(parts(all, FIELD)[0]?.getAttribute('placeholder'), "You can't send here yet.")
		assert.equal(parts(all, FIELD)[0]?.hasAttribute('disabled'), true)
	} finally {
		await all.unmount()
	}
	const other = await mount(dossierWith({ closed: { 'parley:2': { reason: 'Not yet.' } } }))
	try {
		const field = parts(other, FIELD)[0]
		assert.equal(field?.getAttribute('placeholder'), 'Write as You…')
		assert.equal(field?.hasAttribute('disabled'), false)
		assert.equal(parts(other, 'messages.composer')[0]?.hasAttribute('data-closed'), false)
	} finally {
		await other.unmount()
	}
})

test('🚧 an archived session: the composer reads its sentence alone, no Waiting: (sprint 2)', { timeout: 120_000 }, async () => {
	const sentence = 'This session is archived. Its owner can unarchive it to play on.'
	const view = await mount(dossierWith({ closed: { '*': { reason: sentence, waits: false } } }))
	try {
		const field = parts(view, FIELD)[0]
		assert.equal(field?.getAttribute('placeholder'), sentence)
		assert.equal(field?.hasAttribute('disabled'), true)
		const send = parts(view, SEND)[0]
		assert.equal(send?.hasAttribute('disabled'), true)
		assert.equal(send?.getAttribute('title'), sentence)
		assert.deepEqual(asked(view, 'send'), [])
	} finally {
		await view.unmount()
	}
})
