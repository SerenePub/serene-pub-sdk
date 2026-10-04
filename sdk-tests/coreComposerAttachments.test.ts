/**
 * Core's composer, attaching (composer attachments §3.3; owner D1, D5, D6,
 * 2026-10-02): built from `core-catalog/components/sessions/messages/` and
 * mirrored through the host-element vocabulary, as the page mounts it.
 *
 *  - what this reply reads is out of the composer's body (note 41,
 *    2026-10-03): More › What can be attached opens it in a dialog — a kind
 *    nothing reads is listed with its reason as text — and the picker offers
 *    only what may be attached;
 *  - a dropped SVG (or a kind nothing reads) is refused before any upload —
 *    no `attach-files` — and the refusal is a tile and said aloud;
 *  - a paste stages; a file past the ten-file cap is refused;
 *  - ✕ asks `remove-tray-item`; Send waits for uploading tiles, then goes with
 *    `trayItemIds`; an empty line with tiles is a line;
 *  - a tile turning ready is announced;
 *  - a dossier without a tray offers no attachments.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type {
	AttachmentReadersV1,
	ConversationDossierV1,
	TrayItemV1,
} from '../core-catalog/src/ui/sessions/conversation/index.js'
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

const tile = (id: string, over: Partial<TrayItemV1> = {}): TrayItemV1 => ({
	id,
	status: 'ready',
	progress: 1,
	refusal: null,
	filename: `${id}.png`,
	bytes: 2048,
	kind: 'image',
	thumbSrc: `/media/${id.length}?v=thumb`,
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
	backdrop: false,
})

const mount = (d: ConversationDossierV1) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/sessions/messages/messages.ts',
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
const text = (el: Element | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()
const DROP = '[data-widget-part~="messages.composer-drop"]'
const png = (name = 'cat.png') => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], name, { type: 'image/png' })
const svg = () => new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'cat.svg', { type: 'image/svg+xml' })
/** Lets the composer's sniff (an awaited read of each file's first bytes) finish. */
const sniffed = async (view: View) => {
	await new Promise((r) => setTimeout(r, 150))
	await view.settle()
}
const asked = (view: View, kind: string) => view.requested.filter((r) => r.kind === kind).map((r) => r.params)
async function press(view: View, part: string, index = 0) {
	const el = parts(view, part)[index]
	assert.ok(el, `${part} is drawn`)
	el.setAttribute('data-proof', 'press')
	await view.click('[data-proof="press"]')
	el.removeAttribute('data-proof')
}

test('More › What can be attached opens a dialog of what the reply reads; a kind it cannot read is listed with its reason as text', { timeout: 120_000 }, async () => {
	const view = await mount(dossierWith())
	try {
		assert.deepEqual(view.refused, [])
		// Nothing about readers in the composer's body (note 41): it lives in
		// a dialog, closed until More's item opens it — no session panes needed.
		const card = parts(view, 'messages.composer-card')[0]!
		assert.equal(card.querySelector('[data-widget-part~="messages.composer-readers"]'), null)
		const dialog = view.query('sp-dialog')!
		assert.equal(dialog.getAttribute('label'), 'What can be attached')
		assert.equal(dialog.hasAttribute('open'), false)
		assert.ok(parts(view, 'messages.composer-readers')[0]?.closest('sp-dialog'))
		assert.equal(parts(view, 'messages.composer-more').length, 1)
		// The picker offers only what may be attached; its tooltip says what.
		assert.equal(parts(view, 'messages.composer-attach')[0]?.getAttribute('accept'), readers().accept)
		assert.equal(parts(view, 'messages.composer-attach-button')[0]?.getAttribute('aria-label'), 'Attach files')
		assert.equal(
			parts(view, 'messages.composer-attach-button')[0]?.getAttribute('title'),
			'Attach files. This reply can read: images · text files',
		)
		assert.equal(parts(view, 'messages.composer-attach')[0]?.hasAttribute('multiple'), true)
		assert.equal(view.query(DROP)?.hasAttribute('disabled'), false)
		assert.equal(text(parts(view, 'messages.composer-readers-button')[0]), 'What can be attached')
		await press(view, 'messages.composer-readers-button')
		assert.equal(view.query('sp-dialog')?.hasAttribute('open'), true)
		assert.equal(text(parts(view, 'messages.composer-readers-line')[0]), 'This reply can read: images · text files')
		const kinds = parts(view, 'messages.composer-readers-kind')
		assert.deepEqual(kinds.map((k) => k.hasAttribute('data-allowed')), [true, true, false])
		assert.equal(
			text(kinds[2]),
			"PDFs (.pdf) — can't be attached. No model in this reply can read PDFs. This connection type doesn't take PDFs.",
		)
	} finally {
		await view.unmount()
	}
})

test('with several reading calls the dialog names each, and what each gets as a name (D1)', { timeout: 120_000 }, async () => {
	const view = await mount(
		dossierWith({
			attachments: readers({
				calls: [
					{ key: 'scene', label: 'Narrator', reads: ['image', 'text'], placeholderFor: ['pdf'], model: 'Claude Sonnet' },
					{ key: 'plan', label: 'Planner', reads: ['text'], placeholderFor: ['image', 'pdf'] },
				],
			}),
		}),
	)
	try {
		await press(view, 'messages.composer-readers-button')
		assert.equal(text(parts(view, 'messages.composer-readers-line')[0]), 'Can read: images · text files')
		assert.deepEqual(
			parts(view, 'messages.composer-readers-calls')[0]?.querySelectorAll('li') &&
				[...parts(view, 'messages.composer-readers-calls')[0]!.querySelectorAll('li')].map((li) => text(li)),
			[
				'Narrator (Claude Sonnet): images, text files (PDFs appear to it as a name)',
				'Planner: text files (images and PDFs appear to it as a name)',
			],
		)
	} finally {
		await view.unmount()
	}
})

test('a dropped SVG, or a kind nothing reads, is refused before any upload — a tile, and said aloud', { timeout: 120_000 }, async () => {
	const view = await mount(dossierWith())
	try {
		await view.dispatch(DROP, 'files', { files: [svg()], via: 'drop' })
		await sniffed(view)
		const pdf = new File(['%PDF-1.7\n'], 'deed.pdf', { type: 'application/pdf' })
		await view.dispatch(DROP, 'files', { files: [pdf], via: 'drop' })
		await sniffed(view)
		assert.deepEqual(asked(view, 'attach-files'), [])
		const refused = parts(view, 'messages.composer-tray-item').filter((t) => t.getAttribute('data-status') === 'refused')
		assert.deepEqual(
			refused.map((t) => text(t.querySelector('[data-widget-part~="messages.composer-tray-name"]')!)),
			['cat.svg', 'deed.pdf'],
		)
		assert.match(text(refused[0]) ?? '', /An SVG can't be attached/)
		assert.match(text(refused[1]) ?? '', /No model in this reply can read PDFs/)
		const live = parts(view, 'messages.composer-announce')[0]!
		assert.equal(live.getAttribute('aria-live'), 'polite')
		assert.match(text(live) ?? '', /^Can't attach deed\.pdf: No model in this reply can read PDFs/)
	} finally {
		await view.unmount()
	}
})

test('a pick through the Attach picker attaches its files once, though the picker sits inside the drop zone', { timeout: 120_000 }, async () => {
	// The picker's `files` bubbles (every sp element's event does), and the
	// drop zone around the card listens for `files` too: one pick used to
	// attach every file twice (2026-10-02 live check).
	const view = await mount(dossierWith())
	try {
		await view.dispatch('[data-widget-part~="messages.composer-attach"]', 'files', { files: [png('one.png')] })
		await sniffed(view)
		const staged = asked(view, 'attach-files') as Array<{ files: File[] }>
		assert.equal(staged.length, 1)
		assert.deepEqual(staged[0]!.files.map((f) => f.name), ['one.png'])
	} finally {
		await view.unmount()
	}
})

test('a paste attaches its files; a file past the ten-file cap is refused', { timeout: 120_000 }, async () => {
	const nine = Array.from({ length: 9 }, (_, i) => tile(`t-${i}`))
	const view = await mount(dossierWith({ tray: nine }))
	try {
		await view.dispatch(DROP, 'files', { files: [png('one.png'), png('two.png')], via: 'paste' })
		await sniffed(view)
		const staged = asked(view, 'attach-files') as Array<{ files: File[] }>
		assert.equal(staged.length, 1)
		assert.deepEqual(staged[0]!.files.map((f) => f.name), ['one.png'])
		const refusal = parts(view, 'messages.composer-tray-refusal').map((r) => text(r))
		assert.deepEqual(refusal, ['A message can carry at most 10 files.'])
	} finally {
		await view.unmount()
	}
})

test('✕ takes a tile out of the tray; Send waits for the tiles still uploading, then goes with them', { timeout: 120_000 }, async () => {
	const uploading = dossierWith({
		tray: [tile('t-1'), tile('t-2', { status: 'uploading', progress: 0.5, thumbSrc: null, kind: null }), tile('t-3')],
	})
	const view = await mount(uploading)
	try {
		const progress = parts(view, 'messages.composer-tray-progress')
		assert.equal(progress.length, 1)
		assert.equal(progress[0]?.getAttribute('aria-valuenow'), '50')
		assert.equal(progress[0]?.getAttribute('aria-label'), 'Uploading t-2.png')
		assert.deepEqual(
			parts(view, 'messages.composer-tray-remove').map((b) => b.getAttribute('aria-label')),
			['Remove t-1.png', 'Remove t-2.png', 'Remove t-3.png'],
		)
		await press(view, 'messages.composer-tray-remove', 2)
		assert.deepEqual(asked(view, 'remove-tray-item'), [{ trayItemId: 't-3' }])

		// No words, but files: Send is on. Pressed while one uploads, it waits.
		const send = parts(view, 'messages.composer-send')[0]!
		assert.equal(send.hasAttribute('disabled'), false)
		await press(view, 'messages.composer-send')
		assert.deepEqual(asked(view, 'send'), [])
		assert.match(view.html(), /Uploading 1 of 3… Sends when done\./)

		// The host's tray says the upload finished (and the removal took): Send goes.
		await view.push('scoped', { session_full: dossierWith({ tray: [tile('t-1'), tile('t-2')] }) })
		await view.settle()
		assert.deepEqual(asked(view, 'send'), [
			{ content: '', personaId: 9, channel: 'main', trayItemIds: ['t-1', 't-2'] },
		])
	} finally {
		await view.unmount()
	}
})

test('Send is off with no words and no tiles; a tile turning ready is announced', { timeout: 120_000 }, async () => {
	const view = await mount(dossierWith({ tray: [] }))
	try {
		assert.equal(parts(view, 'messages.composer-send')[0]?.hasAttribute('disabled'), true)
		await view.push('scoped', {
			session_full: dossierWith({ tray: [tile('cat', { status: 'uploading', progress: 0.2, thumbSrc: null })] }),
		})
		await view.push('scoped', { session_full: dossierWith({ tray: [tile('cat')] }) })
		assert.equal(text(parts(view, 'messages.composer-announce')[0]), 'cat.png attached')
		assert.equal(parts(view, 'messages.composer-tray-thumb')[0]?.getAttribute('src'), '/media/3?v=thumb')
		assert.equal(parts(view, 'messages.composer-send')[0]?.hasAttribute('disabled'), false)
	} finally {
		await view.unmount()
	}
})

test('a dossier with no tray offers no attachments: no Attach, no What can be attached, the drop zone off', { timeout: 120_000 }, async () => {
	const d = dossierWith()
	delete (d.composer as Partial<ConversationDossierV1['composer']>).tray
	const view = await mount(d)
	try {
		assert.deepEqual(parts(view, 'messages.composer-attach'), [])
		assert.deepEqual(parts(view, 'messages.composer-readers'), [])
		assert.deepEqual(parts(view, 'messages.composer-readers-button'), [])
		// No panes and nothing to say about files: no More at all.
		assert.deepEqual(parts(view, 'messages.composer-more'), [])
		assert.equal(view.query(DROP)?.hasAttribute('disabled'), true)
	} finally {
		await view.unmount()
	}
})
