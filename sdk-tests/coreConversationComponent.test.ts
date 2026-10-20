/**
 * Core's conversation as the component it ships as (C7): built by the CLI's
 * component bundler from `core-catalog/components/shared/messages/`, run in
 * a worker and mirrored through the host-element vocabulary — rendering the
 * log, following a streamed reply, editing a line through the `edit` verb —
 * and its block renderer's three form states (plans/29 R-15 *Forms*;
 * plans/30 U5d, U5f). Moved from the app with the source.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import { CORE_WIDGETS } from '@serene-pub/core-catalog'
import type { WidgetAction } from '@serene-pub/sdk'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

const row = (id: number, role: string, content: string, extra: Record<string, unknown> = {}) => ({
	id,
	role,
	content,
	channel: 'main',
	characterId: role === 'assistant' ? 3 : null,
	personaId: role === 'user' ? 9 : null,
	createdAt: '2026-09-24T10:00:00Z',
	...extra,
})
const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
const dossier: ConversationDossierV1 = {
	sessionId: 1,
	lines: { 1: line('You'), 2: line('Mira'), 3: line('Mira') },
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
	},
	turn: { order: [], candidates: [], show: false, canChoose: false },
	readOnly: null,
	state: { ledgers: {}, pending: {}, waiting: [] },
	appBackground: false,
}
const edit: WidgetAction = {
	key: 'edit',
	specSlug: 'core',
	name: 'Edit',
	icon: 'pencil',
	slash: 'edit',
	audience: { see: ['participant'], act: ['item'] },
	venue: 'message',
	origin: 'core',
	floor: false,
	canAct: true,
	itemGated: true,
	isNew: false,
	enabled: true,
	quick: true,
}

test("core's conversation component renders, streams and edits", { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		// Core's box, as the page mounts it: its host views and its focus are core's to place,
		// and its ids its native copy's (the page navigates by `#message-<id>`).
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'Hello there'), row(2, 'assistant', 'Hi! *waves*')],
			settings: {},
			actions: { message: { primary: [edit], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier },
		},
	})
	try {
		assert.deepEqual(view.refused, [])
		assert.deepEqual(
			view.queryAll('[data-widget-part~="messages.message-name"]').map((n) => n.textContent?.trim()),
			['You', 'Mira'],
		)
		assert.deepEqual(
			view.queryAll('sp-message-body').map((b) => b.getAttribute('text')),
			['Hello there', 'Hi! *waves*'],
		)

		// A reply streaming in: it arrives generating, grows, and settles.
		await view.push('messages', [
			row(1, 'user', 'Hello there'),
			row(2, 'assistant', 'Hi! *waves*'),
			row(3, 'assistant', 'Once upon', { isGenerating: true }),
		])
		const last = () => view.queryAll('sp-message-body').at(-1)!
		assert.equal(last().getAttribute('text'), 'Once upon')
		assert.equal(last().hasAttribute('streaming'), true)
		await view.push('messages', [
			row(1, 'user', 'Hello there'),
			row(2, 'assistant', 'Hi! *waves*'),
			row(3, 'assistant', 'Once upon a time.'),
		])
		assert.equal(last().getAttribute('text'), 'Once upon a time.')
		assert.equal(last().hasAttribute('streaming'), false)

		// Editing a line: its quick Edit, change the text, Save — the widget's
		// own edit mode, committed through the `edit` verb.
		const second = view.queryAll('[data-widget-part~="messages.message"]')[1]!
		/** Open the line's editor by its quick Edit; its field, marked for the harness. */
		const openEdit = async () => {
			await view.click(second.querySelector('button[aria-label="Edit"]')!)
			const field = second.querySelector('sp-composer-field')
			assert.ok(field, 'the editor opens with its field')
			field.setAttribute('data-proof', 'field')
			return field
		}
		const editing = () => second.querySelector('sp-composer-field') !== null
		const key = (k: string, held: { ctrl?: boolean; meta?: boolean } = {}) =>
			view.dispatch('[data-proof="field"]', 'key', { key: k, shift: false, ctrl: false, meta: false, ...held })
		// The page's field: it opens holding the line, takes the caret, and keeps
		// the edit's keys — Esc, and Ctrl/Cmd+Enter (Enter itself is a newline).
		const field = await openEdit()
		assert.equal(field.getAttribute('value'), 'Hi! *waves*')
		assert.equal(field.hasAttribute('autofocus'), true)
		assert.equal(field.getAttribute('keys'), 'Escape Control+Enter Meta+Enter')
		assert.equal(field.getAttribute('submit-on'), 'none')
		// Esc cancels, saving nothing.
		await key('Escape')
		assert.equal(editing(), false)
		assert.deepEqual(view.invoked, [])
		// Save, by the button…
		await openEdit()
		await view.dispatch('[data-proof="field"]', 'input', { value: 'Hi, friend!' })
		const save = view.queryAll('button').find((b) => /save/i.test(b.textContent ?? ''))!
		save.setAttribute('data-proof', 'save')
		await view.click('[data-proof="save"]')
		assert.deepEqual(view.invoked, [{ key: 'edit', messageId: 2, payload: { content: 'Hi, friend!' } }])
		assert.equal(editing(), false)
		// …and by Ctrl+Enter or Cmd+Enter; a bare Enter never saves.
		for (const held of [{ ctrl: true }, { meta: true }]) {
			await openEdit()
			await view.dispatch('[data-proof="field"]', 'input', { value: 'Hi, pal!' })
			await key('Enter')
			assert.equal(editing(), true)
			await key('Enter', held)
			assert.deepEqual(view.invoked.at(-1), { key: 'edit', messageId: 2, payload: { content: 'Hi, pal!' } })
			assert.equal(editing(), false)
		}
		assert.equal(view.invoked.length, 3)
	} finally {
		await view.unmount()
	}
})

/* ── 🚧 a copy's emptyState and timeFormat (owner ruling 2026-10-15) ─── */

test("a copy's emptyState is its empty log's words, and its timeFormat spells the change lines' story times", { timeout: 120_000 }, async () => {
	const head = [
		{
			ownerKey: 'world',
			ownerLabel: 'Proof',
			lines: [
				{
					key: 'c7',
					text: 'Time passes: 30 minutes (Year 1, Mo. 1, Day 1, 08:00 → Year 1, Mo. 1, Day 1, 08:30)',
					updatedBy: 'run:1',
					// The parts beside the words (core-catalog's `LedgerStoryTime`).
					storyTime: {
						kind: 'clock',
						head: 'Time passes: 30 minutes',
						from: { year: 1, month: 1, day: 1, hour: 8, minute: 0 },
						to: { year: 1, month: 1, day: 1, hour: 8, minute: 30 },
					},
				},
			],
		},
	]
	const mount = (settings: Record<string, unknown>) =>
		mountComponent({
			root: CORE_CATALOG,
			entry: 'components/shared/messages/messages.ts',
			owner: 'core',
			coreConversation: true,
			timeoutMs: 60_000,
			context: {
				session: { id: 1, name: 'Proof' },
				messages: [],
				settings,
				viewer: { userId: 1, isAdmin: false, isGuest: false },
				scoped: { session_full: { ...dossier, state: { ...dossier.state, head } } as ConversationDossierV1 },
			},
		})
	const floor = (view: { queryAll(s: string): Element[] }) =>
		view.queryAll('[data-widget-part~="messages.log-floor-text"]')[0]?.textContent?.trim()
	const headText = (view: { queryAll(s: string): Element[] }) =>
		view.queryAll('[data-widget-part~="messages.ledger-change"]').map((n) => n.textContent?.replace(/\s+/g, ' ').trim())

	const plain = await mount({})
	try {
		assert.equal(floor(plain), 'Send a message to start')
		assert.deepEqual(headText(plain), ['Time passes: 30 minutes (Year 1, Mo. 1, Day 1, 08:00 → Year 1, Mo. 1, Day 1, 08:30)'])
	} finally {
		await plain.unmount()
	}
	const pinned = await mount({
		emptyState: 'Your journal fills as the story unfolds.',
		timeFormat: 'Day {day}, {hh}:{mm}',
	})
	try {
		assert.equal(floor(pinned), 'Your journal fills as the story unfolds.')
		assert.deepEqual(headText(pinned), ['Time passes: 30 minutes (Day 1, 08:00 → Day 1, 08:30)'])
	} finally {
		await pinned.unmount()
	}
})

/* ── the ledger head (live scenes §15 G13) ───────────────────────────── */

test('time moved before anything was said is the ledger head: drawn on the empty log, then above the first line', { timeout: 120_000 }, async () => {
	const head = [
		{
			ownerKey: 'world',
			ownerLabel: 'Proof',
			lines: [{ key: 'c7', text: 'Time passes: 3 hours (Day 4, 09:00 → Day 4, 12:00)', updatedBy: 'run:1' }],
		},
	]
	const withHead = { ...dossier, state: { ...dossier.state, head } }
	const mount = (messages: ReturnType<typeof row>[], d: ConversationDossierV1) =>
		mountComponent({
			root: CORE_CATALOG,
			entry: 'components/shared/messages/messages.ts',
			owner: 'core',
			coreConversation: true,
			timeoutMs: 60_000,
			context: {
				session: { id: 1, name: 'Proof' },
				messages,
				settings: {},
				viewer: { userId: 1, isAdmin: false, isGuest: false },
				scoped: { session_full: d },
			},
		})
	const headText = (view: { queryAll(s: string): Element[] }) =>
		view.queryAll('[data-ledger-head]').map((n) => n.textContent?.replace(/\s+/g, ' ').trim())

	const empty = await mount([], withHead)
	try {
		assert.deepEqual(empty.refused, [])
		assert.deepEqual(headText(empty), ['Proof Time passes: 3 hours (Day 4, 09:00 → Day 4, 12:00)'])
		assert.ok(empty.queryAll('[data-ledger-head]')[0]!.closest('[data-widget-part~="messages.log-empty"]'))
	} finally {
		await empty.unmount()
	}

	const talking = await mount([row(1, 'user', 'Hello there'), row(2, 'assistant', 'Hi!')], withHead)
	try {
		const [drawn] = talking.queryAll('[data-ledger-head]')
		assert.ok(drawn, 'the head stays above the first line once there is one')
		const list = talking.queryAll('[data-widget-part~="messages.message-list"]')[0]!
		assert.equal(drawn!.compareDocumentPosition(list) & 4, 4, 'before the list (oldest first)')
		// Nothing waits on a line that does not exist: no proposals, no Review.
		assert.equal(drawn!.querySelector('[data-widget-part~="messages.ledger-review"]'), null)
	} finally {
		await talking.unmount()
	}

	// Older lines still to load: the head is not the conversation's head yet.
	const paged = await mount([row(5, 'user', 'Later')], { ...withHead, hasOlder: true })
	try {
		assert.deepEqual(headText(paged), [])
	} finally {
		await paged.unmount()
	}

	// No head sent — a host that predates it — draws nothing.
	const none = await mount([], dossier)
	try {
		assert.deepEqual(headText(none), [])
	} finally {
		await none.unmount()
	}
})

/* ── folded sections (B4; D5, 2026-09-27) ─────────────────────────────── */

test('a reply\'s folded sections render collapsed above the body, and expand', { timeout: 120_000 }, async () => {
	const part = (id: number, ordinal: number, type: string, content: string, data: Record<string, unknown> | null = null) => ({
		id,
		messageId: 2,
		step: 0,
		revision: 0,
		ordinal,
		type,
		content,
		data,
	})
	const reply = row(2, 'assistant', 'The goblin bolts.', {
		activeRevisions: { '0': 0 },
		parts: [
			part(21, 1, 'core:section', '- Wren — draws her blade\n- The goblin — flees', {
				title: 'Plan',
				kind: 'plan',
				items: ['Wren — draws her blade', 'The goblin — flees'],
			}),
			part(22, 2, 'core:reasoning', 'It is cornered.'),
			part(23, 3, 'core:markdown', 'The goblin bolts.'),
		],
	})
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'Hello there'), reply],
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier },
		},
	})
	try {
		assert.deepEqual(view.refused, [])
		const msg = view.queryAll('[data-widget-part~="messages.message"]')[1]!
		const toggles = () =>
			[...msg.querySelectorAll('button[aria-expanded]')].map((b) => [
				b.textContent?.replace(/\s+/g, ' ').trim(),
				b.getAttribute('aria-expanded'),
			])
		// Both folds, Plan first, both collapsed; the body is the reply alone.
		assert.deepEqual(toggles(), [
			['Plan', 'false'],
			['Reasoning', 'false'],
		])
		const bodies = [...msg.querySelectorAll('sp-message-body')].map((b) => b.getAttribute('text'))
		assert.equal(bodies.at(-1), 'The goblin bolts.')
		// A collapsed fold's panel is not expanded, and is named by its button.
		const planButton = msg.querySelector('button[aria-expanded]')!
		const panelId = planButton.getAttribute('aria-controls')!
		const panel = () => view.root.querySelector(`[id="${panelId}"]`)!
		assert.equal(panel().hasAttribute('data-expanded'), false)
		// The plan is a list, item by item — never raw JSON.
		assert.deepEqual(
			[...panel().querySelectorAll('li')].map((li) => li.textContent?.trim()),
			['Wren — draws her blade', 'The goblin — flees'],
		)
		assert.doesNotMatch(panel().textContent ?? '', /[{[]/)
		// Expanding the Plan leaves Reasoning folded.
		planButton.setAttribute('data-proof', 'plan')
		await view.click('[data-proof="plan"]')
		assert.deepEqual(toggles(), [
			['Plan', 'true'],
			['Reasoning', 'false'],
		])
		assert.equal(panel().hasAttribute('data-expanded'), true)
	} finally {
		await view.unmount()
	}
})

const assetPart = (id: number, ordinal: number, type: string, content: string | null, data: Record<string, unknown> | null = null) => ({
	id,
	messageId: 2,
	step: 0,
	revision: 0,
	ordinal,
	type,
	content,
	data,
})

/** Core's conversation with one reply carrying `parts`; `editing` opens it in the editor. */
async function mountWithParts(parts: unknown[], opts: { requests?: (kind: string) => unknown; editable?: boolean } = {}) {
	const reply = row(2, 'assistant', 'The map.', { activeRevisions: { '0': 0 }, parts })
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: (opts.requests ?? (() => undefined)) as never,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'Hello there'), reply],
			settings: {},
			...(opts.editable ? { actions: { message: { primary: [edit], overflow: [] } } } : {}),
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier },
		},
	})
}

const parts = (view: { queryAll(s: string): Element[] }, part: string) => view.queryAll(`[data-widget-part~="${part}"]`)

test("a reply's media draw in core's box: the media strip below the card as square tiles, a block's image where its plugin put it", { timeout: 120_000 }, async () => {
	const view = await mountWithParts([
		assetPart(21, 1, 'core:image', null, { assetId: 41, alt: 'A map of the Undercroft', width: 1600, height: 900 }),
		assetPart(22, 2, 'core:file', null, { assetId: 42, name: 'notes.txt', mime: 'text/plain', bytes: 2048 }),
		assetPart(23, 3, 'acme:card', null, { blocks: [{ kind: 'image', assetId: 43, alt: 'A sketch' }] }),
		assetPart(24, 4, 'core:markdown', 'The map.'),
	])
	try {
		// Nothing refused: the receiver takes the strip's media as the app's own files.
		assert.deepEqual(view.refused, [])
		const src = (part: string) => parts(view, part).map((n) => n.getAttribute('src'))
		// One image is a square tile too (note 40, 2026-10-03): the `thumb`
		// variant, cropped to fill the card — never a full-width preview.
		assert.deepEqual(src('messages.media-tile-img'), ['/media/41?v=thumb'])
		const [img] = parts(view, 'messages.media-tile-img')
		assert.equal(img?.getAttribute('alt'), 'A map of the Undercroft')
		assert.equal(img?.getAttribute('loading'), 'lazy')
		assert.equal(parts(view, 'messages.media-tile')[0]?.getAttribute('aria-label'), 'Open image A map of the Undercroft')
		assert.deepEqual(parts(view, 'messages.media-preview'), [])
		// Not drawn inline any more, and never as the unknown-type fold.
		assert.deepEqual(parts(view, 'messages.part-image-img'), [])
		assert.doesNotMatch(view.html(), /core:image|core:file/)
		// The block tree's image stays where its plugin put it.
		assert.deepEqual(src('messages.block-image'), ['/session-assets/43'])
		// A file is a square tile: its name, its size, a download link.
		const [file] = parts(view, 'messages.media-file')
		assert.equal(file?.getAttribute('href'), '/media/42?download=1')
		assert.equal(file?.getAttribute('download'), 'notes.txt')
		assert.equal(file?.getAttribute('rel'), 'noopener noreferrer')
		assert.equal(parts(view, 'messages.media-file-size')[0]?.textContent?.trim(), '2 KB')
		// BELOW the card, not in it (note 40): a cell of the message itself,
		// after its content — outside the body and the content a pack draws
		// its card on.
		const [strip] = parts(view, 'messages.media-strip')
		assert.equal(strip?.closest('[data-widget-part~="messages.message-content"]'), null)
		assert.ok(strip?.parentElement?.matches('[data-widget-part~="messages.message"]'))
		assert.ok(strip?.previousElementSibling?.matches('[data-widget-part~="messages.message-content"]'))
	} finally {
		await view.unmount()
	}
})

test('three images are square tiles, each named by its place, and a tile opens the lightbox on the message\'s images', { timeout: 120_000 }, async () => {
	const view = await mountWithParts([
		assetPart(21, 10, 'core:image', null, { assetId: 41, filename: 'a.png' }),
		assetPart(22, 11, 'core:image', null, { assetId: 42, filename: 'b.png' }),
		assetPart(23, 12, 'core:image', null, { assetId: 43, alt: 'The third' }),
	])
	try {
		assert.deepEqual(view.refused, [])
		assert.deepEqual(
			parts(view, 'messages.media-tile-img').map((n) => n.getAttribute('src')),
			['/media/41?v=thumb', '/media/42?v=thumb', '/media/43?v=thumb'],
		)
		assert.deepEqual(
			parts(view, 'messages.media-tile').map((n) => n.getAttribute('aria-label')),
			['Open image a.png, 1 of 3', 'Open image b.png, 2 of 3', 'Open image The third, 3 of 3'],
		)
		parts(view, 'messages.media-tile')[1]!.setAttribute('data-proof', 'tile')
		await view.click('[data-proof="tile"]')
		const asked = view.requested.filter((r) => r.kind === 'view-image')
		assert.deepEqual(asked.at(-1)?.params, {
			src: '/media/42',
			gallery: { srcs: ['/media/41', '/media/42', '/media/43'], index: 1, captions: ['a.png', 'b.png', 'The third'] },
		})
	} finally {
		await view.unmount()
	}
})

test('past six images the rest fold into a count chip that opens where the tiles stop', { timeout: 120_000 }, async () => {
	const view = await mountWithParts(
		Array.from({ length: 8 }, (_, i) => assetPart(30 + i, 10 + i, 'core:image', null, { assetId: 60 + i, filename: `p${i}.png` })),
	)
	try {
		assert.equal(parts(view, 'messages.media-tile').length, 5)
		const [more] = parts(view, 'messages.media-more')
		assert.equal(more?.textContent?.trim(), '+3')
		assert.equal(more?.getAttribute('aria-label'), 'Show 3 more images')
		more!.setAttribute('data-proof', 'more')
		await view.click('[data-proof="more"]')
		const asked = view.requested.filter((r) => r.kind === 'view-image').at(-1)
		assert.equal((asked?.params as { src: string }).src, '/media/65')
		assert.equal((asked?.params as { gallery: { index: number } }).gallery.index, 5)
	} finally {
		await view.unmount()
	}
})

test('an image whose file is gone says so instead of a broken image, and leaves the gallery', { timeout: 120_000 }, async () => {
	const view = await mountWithParts([
		assetPart(21, 10, 'core:image', null, { assetId: 41, filename: 'a.png' }),
		assetPart(22, 11, 'core:image', null, { assetId: 42, filename: 'gone.png' }),
	])
	try {
		parts(view, 'messages.media-tile-img')[1]!.setAttribute('data-proof', 'gone')
		await view.dispatch('[data-proof="gone"]', 'error')
		const [missing] = parts(view, 'messages.media-missing')
		assert.equal(missing?.textContent?.replace(/\s+/g, ' ').trim(), 'File no longer available')
		assert.equal(missing?.getAttribute('aria-label'), 'gone.png: file no longer available')
		assert.deepEqual(
			parts(view, 'messages.media-tile').map((n) => n.getAttribute('aria-label')),
			['Open image a.png'],
		)
	} finally {
		await view.unmount()
	}
})

test('the strip stays under a line being edited, and its ✕ asks the host to take that attachment off (D9)', { timeout: 120_000 }, async () => {
	const view = await mountWithParts([assetPart(21, 10, 'core:image', null, { assetId: 41, filename: 'a.png' })], { editable: true })
	try {
		// Read, not edited: no ✕.
		assert.deepEqual(parts(view, 'messages.media-remove'), [])
		const msg = parts(view, 'messages.message')[1]!
		await view.click(msg.querySelector('button[aria-label="Edit"]')!)
		assert.ok(msg.querySelector('sp-composer-field'), 'the line is in its editor')
		assert.equal(parts(view, 'messages.media-tile').length, 1)
		// D9 is remove-only: a line its viewer may edit offers ✕ on each attachment.
		const [remove] = parts(view, 'messages.media-remove')
		assert.equal(remove?.getAttribute('aria-label'), 'Remove a.png')
		remove!.setAttribute('data-proof', 'remove')
		await view.click('[data-proof="remove"]')
		assert.deepEqual(
			view.requested.filter((r) => r.kind === 'remove-attachment').map((r) => r.params),
			[{ messageId: 2, partId: 21 }],
		)
	} finally {
		await view.unmount()
	}
})

test('a row that arrives without its parts still folds its sections, from metadata', { timeout: 120_000 }, async () => {
	const reply = row(2, 'assistant', 'The goblin bolts.', {
		metadata: {
			reasoning: 'It is cornered.',
			swipes: {
				currentIdx: 1,
				history: ['First.', 'The goblin bolts.'],
				sectionsHistory: [null, [{ kind: 'plan', label: 'Plan', items: ['Wren — draws her blade'] }]],
			},
		},
	})
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'Hello there'), reply],
			settings: {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier },
		},
	})
	try {
		const msg = view.queryAll('[data-widget-part~="messages.message"]')[1]!
		const toggles = () =>
			[...msg.querySelectorAll('button[aria-expanded]')].map((b) => [
				b.textContent?.replace(/\s+/g, ' ').trim(),
				b.getAttribute('aria-expanded'),
			])
		assert.deepEqual(toggles(), [
			['Plan', 'false'],
			['Reasoning', 'false'],
		])
		const button = msg.querySelector('button[aria-expanded]')!
		const panel = () => view.root.querySelector(`[id="${button.getAttribute('aria-controls')}"]`)!
		assert.deepEqual(
			[...panel().querySelectorAll('li')].map((li) => li.textContent?.trim()),
			['Wren — draws her blade'],
		)
		button.setAttribute('data-proof', 'plan')
		await view.click('[data-proof="plan"]')
		assert.equal(panel().hasAttribute('data-expanded'), true)
		assert.deepEqual(toggles()[0], ['Plan', 'true'])
	} finally {
		await view.unmount()
	}
})

/* ── the block renderer's form states ─────────────────────────────────── */

const choices = (over: Record<string, unknown> = {}) => ({
	kind: 'choices',
	id: 'q1',
	head: 47,
	addressee: 'character:12',
	question: 'Will you come to the festival?',
	actions: [
		{ fn: 'answer', action: 'core:spec/ask#answer', label: 'Yes', choice: 'yes' },
		{ fn: 'answer', action: 'core:spec/ask#answer', label: 'No', choice: 'no' },
	],
	...over,
})
const form = (over: Record<string, unknown> = {}) => ({
	kind: 'form',
	id: 'f1',
	head: 47,
	fn: 'rsvp',
	action: 'core:spec/ask#rsvp',
	addressee: 'character:12',
	question: 'How many are coming?',
	fields: { count: { type: 'integer', min: 0 } },
	...over,
})

/**
 * The renderer alone, drawn from `blocks`; `stale` names the blocks a verdict
 * calls superseded, and `asked` is every id the verdict was asked about, in order.
 */
async function drawBlocks(blocks: unknown[], stale?: string[]): Promise<{ html: string; asked: string[] }> {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: resolve(import.meta.dirname, 'fixtures', 'core-blocks-view', 'blocks-view.ts'),
		owner: 'core',
		timeoutMs: 60_000,
		context: { props: { blocks, ...(stale ? { stale } : {}) } },
	})
	try {
		assert.deepEqual(view.refused, [])
		return { html: view.html(), asked: JSON.parse(view.query('.asked')?.textContent ?? 'null') }
	} finally {
		await view.unmount()
	}
}
const blocksHtml = async (blocks: unknown[], stale?: string[]) => (await drawBlocks(blocks, stale)).html

test('a live form shows its buttons', { timeout: 120_000 }, async () => {
	const out = await blocksHtml([choices()])
	assert.match(out, /Yes/)
	assert.match(out, /<button/)
	assert.doesNotMatch(out, /data-superseded="true"/)
	assert.doesNotMatch(out, /Superseded/)
})

test('a superseded form collapses to one quiet line, with no question and no buttons', { timeout: 120_000 }, async () => {
	const out = await blocksHtml([choices()], ['q1'])
	assert.match(out, /data-superseded="true"/)
	assert.match(out, /Superseded — the conversation moved on/)
	assert.doesNotMatch(out, /Will you come to the festival\?/)
	assert.doesNotMatch(out, /<button/)
	assert.doesNotMatch(out, /role="group"/)
	// The same for a `form` block.
	const f = await blocksHtml([form()], ['f1'])
	assert.match(f, /data-superseded="true"/)
	assert.match(f, /Superseded — the conversation moved on/)
	assert.doesNotMatch(f, /How many are coming\?/)
	assert.doesNotMatch(f, /<button/)
	assert.doesNotMatch(f, /<input/)
})

test('answered beats stale: an answered form stays answered when the channel has moved on', { timeout: 120_000 }, async () => {
	const out = await blocksHtml(
		[choices({ answered: { by: 'character:12', at: '2026-09-17T00:00:00Z', choice: 'yes' } })],
		['q1'],
	)
	assert.match(out, /data-answered="true"/)
	assert.match(out, /Answered/)
	assert.doesNotMatch(out, /data-superseded="true"/)
	assert.doesNotMatch(out, /<button/)
})

test('an answered text form shows its answer beside Answered, as a choice shows its option', { timeout: 120_000 }, async () => {
	const out = await blocksHtml([
		form({ answered: { by: 'character:12', at: '2026-10-15T00:00:00Z', value: 'Ann' } }),
	])
	assert.match(out, /data-answered="true"/)
	assert.match(out, /Answered<\/span>[^·]{0,40}· Ann/)
	assert.doesNotMatch(out, /<input/)
	// Answered before the value was stamped: the bare word, no dangling dot.
	const bare = await blocksHtml([form({ answered: { by: 'character:12', at: '2026-10-15T00:00:00Z' } })])
	assert.match(bare, /Answered/)
	assert.doesNotMatch(bare, /· /)
})

test('the verdict is asked per block, a block inside a group too', { timeout: 120_000 }, async () => {
	const { html: out, asked } = await drawBlocks(
		[
			choices({ id: 'a' }),
			{ kind: 'group', blocks: [choices({ id: 'b' })] },
			{ kind: 'kv', rows: [{ label: 'Where', value: 'the square' }] },
		],
		['b'],
	)
	// Once for each form block, the grouped one too, and never for the kv block.
	assert.deepEqual(asked, ['a', 'b'])
	// Only the grouped block is superseded; the first keeps its buttons.
	assert.equal(out.split('data-superseded="true"').length, 2)
	assert.match(out, /<button/)
})

test('with no verdict handed down, nothing is superseded', { timeout: 120_000 }, async () => {
	const out = await blocksHtml([choices()])
	assert.doesNotMatch(out, /Superseded/)
})

/* ── the view state the conversation keeps across mounts ──────────────── */

test('what the conversation saves comes back as its state on the next mount', { timeout: 120_000 }, async () => {
	const entry = resolve(import.meta.dirname, 'fixtures', 'core-widget-ref', 'saved.ts')
	const first = await mountComponent({ root: CORE_CATALOG, entry, owner: 'core', timeoutMs: 60_000, context: {} })
	let saved: unknown
	try {
		assert.equal(first.query('.held')?.textContent, 'null')
		await first.click('.save')
		assert.deepEqual(first.saved, [{ enterHint: 'seen' }])
		saved = first.saved.at(-1)
	} finally {
		await first.unmount()
	}
	const second = await mountComponent({ root: CORE_CATALOG, entry, owner: 'core', timeoutMs: 60_000, context: { state: saved } })
	try {
		assert.equal(second.query('.held')?.textContent, JSON.stringify({ enterHint: 'seen' }))
	} finally {
		await second.unmount()
	}
})

test("a clone of the conversation in a box not granted `session:full` says so — never 'Loading session…' forever", { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		timeoutMs: 60_000,
		grants: [],
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'Hello there')],
			settings: {},
			scoped: { session_full: dossier },
		},
	})
	try {
		assert.equal(view.query('[data-scope-not-granted]')?.getAttribute('data-scope-not-granted'), 'session:full')
		assert.match(view.query('[data-scope-not-granted]')?.textContent ?? '', /not been granted/)
		assert.doesNotMatch(view.root.textContent ?? '', /Loading session/)
		// Granted at runtime: the notice goes; the dossier, once posted, draws the log.
		await view.setGrants(['session:full'])
		assert.equal(view.query('[data-scope-not-granted]'), null)
		await view.push('scoped', { session_full: dossier })
		assert.deepEqual(view.queryAll('sp-message-body').map((b) => b.getAttribute('text')), ['Hello there'])
	} finally {
		await view.unmount()
	}
})

/* ── a request in flight at unmount is declined, and that is not a failure ─ */

/**
 * Mount the conversation, let the composer's debounced `draft` go out, and
 * unmount — returning what reached stderr meanwhile (the worker's console
 * rides the parent's `process.stderr`).
 */
async function stderrAcrossDraft(requests: (kind: string) => unknown): Promise<string> {
	const written: string[] = []
	const write = process.stderr.write.bind(process.stderr)
	process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
		written.push(String(chunk))
		return (write as (...a: unknown[]) => boolean)(chunk, ...rest)
	}) as typeof process.stderr.write
	try {
		const view = await mountComponent({
			root: CORE_CATALOG,
			entry: 'components/shared/messages/messages.ts',
			owner: 'core',
			coreConversation: true,
			timeoutMs: 60_000,
			requests: requests as never,
			context: {
				session: { id: 1, name: 'Proof' },
				messages: [row(1, 'user', 'Hello there')],
				settings: {},
				viewer: { userId: 1, isAdmin: false, isGuest: false },
				scoped: { session_full: dossier },
			},
		})
		try {
			// The composer tells the host its draft 150ms after it settles.
			const deadline = Date.now() + 10_000
			while (!view.requested.some((r) => r.kind === 'draft') && Date.now() < deadline)
				await new Promise((r) => setTimeout(r, 50))
			assert.ok(view.requested.some((r) => r.kind === 'draft'), 'the composer sent its draft')
			await view.settle()
		} finally {
			await view.unmount()
		}
		// The worker's stderr is forwarded asynchronously.
		await new Promise((r) => setTimeout(r, 300))
	} finally {
		process.stderr.write = write
	}
	return written.join('')
}

test('a draft still pending at unmount is declined quietly — nothing on stderr', { timeout: 120_000 }, async () => {
	const out = await stderrAcrossDraft(() => new Promise(() => {}))
	assert.doesNotMatch(out, /conversation: draft/)
	assert.doesNotMatch(out, /unmounted before it answered/)
})

test('a draft the host really declines is still logged', { timeout: 120_000 }, async () => {
	const out = await stderrAcrossDraft((kind) => {
		if (kind === 'draft') throw new Error('the draft store is full')
		return new Promise(() => {})
	})
	assert.match(out, /conversation: draft — the draft store is full/)
})

/* ── the host's draft writes (lair pass D1) ─────────────────────────────── */

/**
 * The composer owns the draft between the host's writes, and takes every
 * write — whatever its field holds — once: a spent action's clear reaches a
 * field that still says what was sent, and a dossier re-posted for anything
 * else leaves the person's typing alone. Compared as text: the field's
 * written value and the draft the composer reports (`draft`), which is what
 * the host saves and a reload opens with.
 */
test("a host write replaces the composer's draft; the same write re-posted does not", { timeout: 120_000 }, async () => {
	const withDraft = (content: string, write: number) => ({ ...dossier, composer: { ...dossier.composer, draft: { content, write } } })
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
				messages: [row(1, 'user', 'Hello there')],
				settings: {},
				viewer: { userId: 1, isAdmin: false, isGuest: false },
				scoped: { session_full: d },
			},
		})
	const FIELD = '[data-widget-part~="messages.composer"] sp-composer-field, sp-composer-field'
	/** The draft the composer last reported, once its 150ms debounce has gone out. */
	const reported = async (view: Awaited<ReturnType<typeof mount>>) => {
		await new Promise((r) => setTimeout(r, 400))
		await view.settle()
		return view.requested.filter((r) => r.kind === 'draft').at(-1)?.params.content
	}
	const view = await mount(withDraft('go north', 1))
	let saved: unknown
	try {
		const field = () => view.query(FIELD)!.getAttribute('value')
		// Opened with the kept draft.
		assert.equal(field(), 'go north')
		assert.equal(await reported(view), 'go north')
		// The person types on; the dossier is re-posted with the same write (a run erred: nothing spent).
		await view.dispatch(FIELD, 'input', { value: 'sneak past' })
		await view.push('scoped', { session_full: withDraft('go north', 1) })
		assert.equal(await reported(view), 'sneak past')
		// A spent action: the host writes an empty draft, and the field empties.
		await view.push('scoped', { session_full: withDraft('', 2) })
		assert.equal(field(), '')
		assert.equal(await reported(view), '')
		saved = await reported(view)
	} finally {
		await view.unmount()
	}
	// A reload opens with what the host saved: the same empty field.
	const again = await mount(withDraft(String(saved), 1))
	try {
		assert.equal(again.query(FIELD)!.getAttribute('value'), '')
		assert.equal(await reported(again), '')
	} finally {
		await again.unmount()
	}
})

/* ── the legend's half on a message (2026-09-28) ──────────────────────── */

test("a message's icon-only quick actions are named: iconAlt, else the name; the tooltip says what it does", { timeout: 120_000 }, async () => {
	const retry = {
		...edit,
		key: 'retry',
		name: 'Regenerate',
		icon: 'refresh-cw',
		slash: 'retry',
		description: 'Write the newest reply again, in place of the one there.',
		iconAlt: 'Regenerate this reply',
	}
	const described = { ...edit, description: 'Change the text of this message.' }
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'Hello there'), row(2, 'assistant', 'Hi! *waves*')],
			settings: {},
			actions: { message: { primary: [described, retry], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier },
		},
	})
	try {
		const reply = view.queryAll('[data-widget-part~="messages.message"]')[1]!
		const quick = [...reply.querySelectorAll('[data-widget-part~="messages.message-actions"] button')].map((b) => ({
			name: b.getAttribute('aria-label'),
			title: b.getAttribute('title'),
			text: b.textContent?.trim() ?? '',
		}))
		assert.deepEqual(quick, [
			{ name: 'Edit', title: 'Edit — Change the text of this message.', text: '' },
			{
				name: 'Regenerate this reply',
				title: 'Regenerate — Write the newest reply again, in place of the one there.',
				text: '',
			},
		])
	} finally {
		await view.unmount()
	}
})

/* ── a copy pinned to one channel (lair re-plan S1) ──────────────────────── */

/**
 * The Lair's Sanctum panel is a second copy of this component, pinned to the
 * `sanctum` channel by its `channel` setting; the host narrows each copy's
 * dossier (`composer.channels`) to the channels it shows. A copy draws its own
 * channels' rows and no others — never merely hidden, so two copies never hold
 * one line — writes on its channel, names it by its declared label, and its
 * host views and ready line say which channel they are for.
 */
const sanctumRows = [
	row(1, 'user', 'We go north.'),
	row(4, 'assistant', 'I am the Castellan, steward of this dungeon.', { channel: 'sanctum', characterId: null }),
	row(5, 'user', 'What waits in the vault?', { channel: 'sanctum' }),
]
const channelDossier = (
	channels: string[],
	turn: Partial<ConversationDossierV1['turn']> = {},
): ConversationDossierV1 => ({
	...dossier,
	lines: { 1: line('You'), 4: line('Castellan'), 5: line('You') },
	composer: {
		...dossier.composer,
		channels,
		channelLabels: { sanctum: 'Sanctum' },
		tabs: [{ view: 'session-controls', title: 'Turn controls', icon: 'message-square' }],
	},
	turn: { ...dossier.turn, ...turn },
})
const mountCopy = (settings: Record<string, unknown>, d: ConversationDossierV1) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: sanctumRows,
			settings,
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})
const bodies = (view: Awaited<ReturnType<typeof mountCopy>>) =>
	view.queryAll('sp-message-body').map((b) => b.getAttribute('text'))

test('a copy pinned to the Sanctum draws the Sanctum alone, names it, and writes, continues and lists there', { timeout: 120_000 }, async () => {
	const view = await mountCopy(
		{ channel: 'sanctum', composer: 'minimal' },
		channelDossier(['sanctum'], {
			order: [{ ref: null, channel: 'sanctum' }] as ConversationDossierV1['turn']['order'],
			show: true,
			canChoose: false,
			ownVoiceName: 'Castellan',
		}),
	)
	try {
		assert.deepEqual(view.refused, [])
		// Its head names the channel by its declared label, never the slug.
		assert.equal(view.query('[data-widget-part~="messages.channel-title"]')?.textContent?.trim(), 'Sanctum')
		assert.equal(view.query('[data-widget-part~="messages.root"]')?.getAttribute('data-channel'), 'sanctum')
		// Only the Sanctum's rows, and none of the story's — not even hidden.
		assert.deepEqual(bodies(view), ['I am the Castellan, steward of this dungeon.', 'What waits in the vault?'])
		assert.equal(view.queryAll('[data-widget-part~="messages.message"]').length, 2)
		// One channel: no strip to choose from.
		assert.equal(view.query('[data-widget-part~="messages.composer-channels"]'), null)

		// The ready line's Continue fires ITS log's channel (R5's follow-up).
		await view.click('[data-widget-part~="messages.next-up-continue"]')
		assert.deepEqual(view.requested.filter((r) => r.kind === 'fire-turn').at(-1)?.params, { channel: 'sanctum' })

		// The turn controls and the chips are the Sanctum's listing.
		await view.click('[data-widget-part~="messages.composer-actions-toggle"]')
		assert.equal(view.query('sp-host-view[name="session-controls"]')?.getAttribute('channel'), 'sanctum')

		// A line sent here is sent on the Sanctum.
		const FIELD = 'sp-composer-field'
		await view.dispatch(FIELD, 'input', { value: 'Build me a vault.' })
		await view.click('[data-widget-part~="messages.composer-send"]')
		assert.equal(view.requested.filter((r) => r.kind === 'send').at(-1)?.params.channel, 'sanctum')
	} finally {
		await view.unmount()
	}
})

test('the primary log draws the channels no copy claims; the strip names a channel by its label', { timeout: 120_000 }, async () => {
	// The Lair's story log: the Sanctum is claimed, so only `main` is left.
	const story = await mountCopy(
		{},
		channelDossier(['main'], {
			order: [{ ref: null }] as ConversationDossierV1['turn']['order'],
			show: true,
			canChoose: false,
			ownVoiceName: 'Castellan',
		}),
	)
	try {
		assert.deepEqual(bodies(story), ['We go north.'])
		assert.equal(story.query('[data-widget-part~="messages.channel-head"]'), null)
		assert.equal(story.query('[data-widget-part~="messages.composer-channels"]'), null)
		await story.click('[data-widget-part~="messages.next-up-continue"]')
		assert.deepEqual(story.requested.filter((r) => r.kind === 'fire-turn').at(-1)?.params, { channel: 'main' })
	} finally {
		await story.unmount()
	}
	// Nothing claimed: one log over both, the strip choosing between them by label.
	const whole = await mountCopy({}, channelDossier(['main', 'sanctum']))
	try {
		const strip = whole.queryAll('[data-widget-part~="messages.composer-channel"]').map((b) => b.textContent?.trim())
		assert.deepEqual(strip, ['Main', 'Sanctum'])
		// The log shows the lane it writes on; the other lane's rows stay hidden, as before.
		assert.equal(whole.queryAll('[data-widget-part~="messages.message"]').length, 3)
		// 🚧 A line's accessible name counts the lines on its lane, never every
		// channel's rows (PLAN-dc-after-walk2 Q3-6, the walk's #49).
		const main = whole.query('#message-1')
		assert.match(main?.getAttribute('aria-label') ?? '', /^Message 1 of 1 from /)
	} finally {
		await whole.unmount()
	}
})

test('Line width is a declared setting, Full by default — never a hidden cap', async () => {
	const decl = CORE_WIDGETS.find((w) => w.id === 'messages')?.settings?.lineWidth as
		| { type: string; label: string; of: string[]; default: string }
		| undefined
	assert.ok(decl, 'messages declares lineWidth')
	assert.equal(decl.type, 'enum')
	assert.equal(decl.label, 'Line width')
	assert.deepEqual(decl.of, ['full', 'comfortable'])
	assert.equal(decl.default, 'full')
})

test('the widget root carries its Line width: Full unless the settings say Comfortable', { timeout: 120_000 }, async () => {
	const lineWidthOf = async (settings: Record<string, unknown>) => {
		const view = await mountCopy(settings, dossier)
		try {
			assert.deepEqual(view.refused, [])
			return view.query('[data-widget-part~="messages.root"]')?.getAttribute('data-line-width')
		} finally {
			await view.unmount()
		}
	}
	assert.equal(await lineWidthOf({}), 'full')
	assert.equal(await lineWidthOf({ lineWidth: 'comfortable' }), 'comfortable')
	// An unknown value reads as the default, never as no width at all.
	assert.equal(await lineWidthOf({ lineWidth: 'narrow' }), 'full')
})

/* ── Folio (PLAN-core-widgets §3.7) ─────────────────────────────────────── */

/**
 * A copy whose Presentation is Folio reads its lines as one block of prose:
 * each line's body a paragraph in reading order, a thin rule naming the
 * speaker where the speaker changes, no avatar, name row, time or swipes —
 * not rendered, never merely hidden — while every line keeps its row and its
 * `#message-<id>`, so packs, j/k and anchors hold. Unset, it follows the
 * claimed channel's role; a stored value wins.
 */
const manuscriptRows = [
	row(10, 'user', 'The rain had not stopped for three days.', { channel: 'manuscript' }),
	row(11, 'user', 'Nobody in the village remembered why.', { channel: 'manuscript' }),
	row(12, 'assistant', 'Except the miller.', { channel: 'manuscript' }),
	row(13, 'user', 'And he was not talking.', { channel: 'manuscript' }),
]
const speakerLine = (name: string, ref: string) => ({
	...line(name),
	speaker: { name, ref, face: null, sprite: null },
	swipes: { show: true, right: true },
})
const manuscriptDossier = (roles: Record<string, 'conversation' | 'folio'> | undefined): ConversationDossierV1 => ({
	...dossier,
	lines: {
		10: speakerLine('Ada', 'persona:9'),
		11: speakerLine('Ada', 'persona:9'),
		12: speakerLine('Scribe', 'character:3'),
		13: speakerLine('Ada', 'persona:9'),
	},
	composer: {
		...dossier.composer,
		channels: ['manuscript'],
		channelLabels: { manuscript: 'Manuscript' },
		...(roles ? { channelRoles: roles } : {}),
	},
})
const mountManuscript = (settings: Record<string, unknown>, d: ConversationDossierV1) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: manuscriptRows,
			settings,
			actions: { message: { primary: [edit], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})
type Manuscript = Awaited<ReturnType<typeof mountManuscript>>
const part = (name: string) => `[data-widget-part~="${name}"]`
/** The log's items in the order drawn: a rule by its name, a line by its anchor. */
const folioSequence = (view: Manuscript) =>
	view
		.queryAll(`${part('messages.message-list')} > li`)
		.map((li) =>
			li.matches(part('messages.folio-rule'))
				? `rule:${li.querySelector(part('messages.folio-rule-name'))?.textContent?.trim()}`
				: `line:${li.querySelector(part('messages.message'))?.id}`,
		)
const presentationOf = (view: Manuscript) =>
	view.query(part('messages.root'))?.getAttribute('data-presentation')

test('Presentation is a declared setting whose default is Follow the channel (`auto`)', () => {
	const decl = CORE_WIDGETS.find((w) => w.id === 'messages')?.settings?.presentation as
		| { type: string; label: string; of: string[]; members: Array<{ key: string; label: string }>; default?: unknown; group?: string }
		| undefined
	assert.ok(decl, 'messages declares presentation')
	assert.equal(decl.type, 'enum')
	assert.equal(decl.label, 'Presentation')
	assert.deepEqual(decl.of, ['auto', 'rows', 'folio'])
	assert.deepEqual(
		decl.members.map((m) => m.label),
		['Follow the channel', 'Rows', 'Folio'],
	)
	// Settings arrive complete, so the default must not be one of the two
	// drawings: `auto` says "unset" out loud, and the select is never empty.
	assert.equal(decl.default, 'auto')
	assert.equal(decl.group, undefined)
})

test('a Folio copy reads its lines as one block of prose, a rule wherever the speaker changes', { timeout: 120_000 }, async () => {
	const view = await mountManuscript({ channel: 'manuscript', presentation: 'folio' }, manuscriptDossier(undefined))
	try {
		assert.deepEqual(view.refused, [])
		assert.equal(presentationOf(view), 'folio')
		assert.ok(view.query(`${part('messages.stage')}${part('messages.folio')}`), 'the stage says Folio')
		// One paragraph per line, in reading order, each its own row and anchor.
		assert.deepEqual(bodies(view), manuscriptRows.map((r) => r.content))
		assert.deepEqual(folioSequence(view), [
			'rule:Ada',
			'line:message-10',
			'line:message-11',
			'rule:Scribe',
			'line:message-12',
			'rule:Ada',
			'line:message-13',
		])
		assert.equal(view.queryAll(part('messages.message-row')).length, 4)
		// No avatar, name row, controls cell, time or swipes — not rendered at all.
		for (const gone of [
			'messages.message-avatar',
			'messages.message-identity',
			'messages.message-name',
			'messages.message-controls',
			'messages.message-time',
			'messages.message-swipes',
		])
			assert.equal(view.queryAll(part(gone)).length, 0, `${gone} is not drawn`)
		// Each paragraph keeps its menu, at its edge.
		assert.equal(view.queryAll(`${part('messages.folio-controls')} ${part('messages.message-menu')}`).length, 4)
		// Scene markers off; the composer on the page line.
		const root = view.query(part('messages.root'))!
		assert.equal(root.getAttribute('data-show-scene-markers'), 'false')
		assert.equal(root.getAttribute('data-composer-skin'), 'quill')
	} finally {
		await view.unmount()
	}
})

test('a Folio paragraph is still the line: its Edit opens the editor, Save and Cancel at its edge', { timeout: 120_000 }, async () => {
	const view = await mountManuscript({ channel: 'manuscript', presentation: 'folio' }, manuscriptDossier(undefined))
	try {
		const third = view.query('#message-12')!
		await view.click(third.querySelector('button[aria-label="Edit"]')!)
		assert.ok(third.querySelector('sp-composer-field'), 'the editor opens in the paragraph')
		const controls = third.querySelector(part('messages.folio-controls'))!
		assert.ok(controls.querySelector(part('messages.message-save')))
		assert.ok(controls.querySelector(part('messages.message-cancel')))
		assert.equal(third.getAttribute('data-msg-state'), 'editing')
	} finally {
		await view.unmount()
	}
})

test('a Folio copy read newest-first keeps the order, and its rules follow the reading order', { timeout: 120_000 }, async () => {
	const view = await mountManuscript(
		{ channel: 'manuscript', presentation: 'folio', order: 'newest-first' },
		manuscriptDossier(undefined),
	)
	try {
		assert.deepEqual(bodies(view), [...manuscriptRows].reverse().map((r) => r.content))
		assert.deepEqual(folioSequence(view), [
			'rule:Ada',
			'line:message-13',
			'rule:Scribe',
			'line:message-12',
			'rule:Ada',
			'line:message-11',
			'line:message-10',
		])
	} finally {
		await view.unmount()
	}
})

test("a Folio page announces no envoy either: the Dungeon Crawler's Journal opens on its prose, no NARRATOR rule", { timeout: 120_000 }, async () => {
	// The genre's Narrator writes the journal as an envoy (\`envoy:narrator\`):
	// a reply with no card and no narrator flag, which the page names with no
	// reference. Round 2's screenshot had it open under a NARRATOR rule.
	const envoy = { channel: 'travelogue', characterId: null, metadata: { speaker: 'envoy:narrator' } }
	const journal = [
		row(30, 'assistant', 'Ann went up the wall.', envoy),
		row(31, 'assistant', 'The party rests. Day 1, 16:30 → Day 2, 00:30.', envoy),
	]
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: journal,
			settings: { channel: 'travelogue', presentation: 'auto' },
			actions: { message: { primary: [edit], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: {
				session_full: {
					...dossier,
					lines: { 30: line('Narrator'), 31: line('Narrator') },
					composer: {
						...dossier.composer,
						channels: ['main', 'travelogue'],
						channelLabels: { travelogue: 'Journal' },
						channelRoles: { travelogue: 'folio' },
					},
				},
			},
		},
	})
	try {
		assert.deepEqual(view.refused, [])
		assert.equal(presentationOf(view), 'folio', 'the folio channel reads as Folio under auto')
		assert.deepEqual(folioSequence(view), ['line:message-30', 'line:message-31'])
		assert.equal(view.queryAll(part('messages.folio-rule')).length, 0)
	} finally {
		await view.unmount()
	}
})

test('a Folio page announces no narrator: its lines open no rule, but end the run before them', { timeout: 120_000 }, async () => {
	const journal = [
		row(20, 'assistant', 'You wake in the dark.', { channel: 'manuscript', isNarratorResponse: true }),
		row(21, 'assistant', 'Water drips somewhere.', { channel: 'manuscript', isNarratorResponse: true }),
		row(22, 'user', 'I listen.', { channel: 'manuscript' }),
		row(23, 'assistant', 'Silence answers.', { channel: 'manuscript', isNarratorResponse: true }),
		row(24, 'user', 'I listen again.', { channel: 'manuscript' }),
	]
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: journal,
			settings: { channel: 'manuscript' },
			actions: { message: { primary: [edit], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: {
				session_full: {
					...manuscriptDossier({ manuscript: 'folio' }),
					lines: {
						20: line('Narrator'),
						21: line('Narrator'),
						22: speakerLine('Ann', 'persona:9'),
						23: line('Narrator'),
						24: speakerLine('Ann', 'persona:9'),
					},
				},
			},
		},
	})
	try {
		assert.deepEqual(view.refused, [])
		assert.equal(presentationOf(view), 'folio')
		assert.deepEqual(folioSequence(view), [
			'line:message-20',
			'line:message-21',
			'rule:Ann',
			'line:message-22',
			'line:message-23',
			'rule:Ann',
			'line:message-24',
		])
	} finally {
		await view.unmount()
	}
})

test('unset, Presentation follows the claimed channel; a stored value wins', { timeout: 120_000 }, async () => {
	const drawn = async (settings: Record<string, unknown>, roles?: Record<string, 'conversation' | 'folio'>) => {
		const view = await mountManuscript(settings, manuscriptDossier(roles))
		try {
			assert.deepEqual(view.refused, [])
			return {
				presentation: presentationOf(view),
				rules: view.queryAll(part('messages.folio-rule')).length,
				avatars: view.queryAll(part('messages.message-avatar')).length,
				skin: view.query(part('messages.root'))?.getAttribute('data-composer-skin'),
			}
		} finally {
			await view.unmount()
		}
	}
	// A folio channel, nothing stored: Folio.
	assert.deepEqual(await drawn({ channel: 'manuscript' }, { manuscript: 'folio' }), {
		presentation: 'folio',
		rules: 3,
		avatars: 0,
		skin: 'quill',
	})
	// A stored Rows wins over the channel.
	assert.deepEqual(await drawn({ channel: 'manuscript', presentation: 'rows' }, { manuscript: 'folio' }), {
		presentation: 'rows',
		rules: 0,
		avatars: 4,
		skin: 'classic',
	})
	// The host says nothing of roles, or the channel is a conversation: Rows.
	assert.equal((await drawn({ channel: 'manuscript' })).presentation, 'rows')
	assert.equal((await drawn({ channel: 'manuscript' }, { manuscript: 'conversation' })).presentation, 'rows')
	// A Folio copy that chose a composer skin keeps it.
	assert.equal((await drawn({ channel: 'manuscript', composer: 'writer' }, { manuscript: 'folio' })).skin, 'writer')
	// `auto` — the declared default, Follow the channel — is unset said out loud.
	assert.equal((await drawn({ channel: 'manuscript', presentation: 'auto' }, { manuscript: 'folio' })).presentation, 'folio')
	assert.equal((await drawn({ channel: 'manuscript', presentation: 'auto' }, { manuscript: 'conversation' })).presentation, 'rows')
})

/* ── the turn line (PLAN-core-widgets §3.16) ────────────────────────────── */

/**
 * Between the log and the composer, ONE row: what the last run did on the
 * left (a status pill read off the newest reply, Review N changes when
 * proposals wait, Inspect run for an administrator), who is next on the
 * right (who is typing, then the order's head with Someone else and
 * Continue — or Stop while the reply streams, or Try again after it failed).
 * `nextUp: hidden` drops the right half only.
 */
const turnRows = (reply: Record<string, unknown> = {}) => [
	row(1, 'user', 'We go north.'),
	row(2, 'assistant', 'The road narrows.', reply),
]
const turnDossier = (extra: Partial<ConversationDossierV1> = {}): ConversationDossierV1 => ({
	...dossier,
	lines: { 1: line('You'), 2: line('Wren') },
	turn: {
		order: [{ ref: 'character:3' }] as ConversationDossierV1['turn']['order'],
		candidates: [{ ref: 'character:3', kind: 'character', name: 'Wren' }],
		show: true,
		canChoose: true,
	},
	...extra,
})
const mountTurnLine = (
	opts: { reply?: Record<string, unknown>; settings?: Record<string, unknown>; d?: ConversationDossierV1; admin?: boolean } = {},
) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: turnRows(opts.reply),
			settings: opts.settings ?? {},
			viewer: { userId: 1, isAdmin: !!opts.admin, isGuest: false },
			scoped: { session_full: opts.d ?? turnDossier() },
		},
	})
type TurnView = Awaited<ReturnType<typeof mountTurnLine>>
const text = (view: TurnView, name: string) => view.query(part(name))?.textContent?.replace(/\s+/g, ' ').trim()

test('the turn line is one row: what the last run did beside who is next', { timeout: 120_000 }, async () => {
	const view = await mountTurnLine()
	try {
		assert.deepEqual(view.refused, [])
		assert.equal(view.queryAll(part('messages.turn-line')).length, 1)
		const line = view.query(part('messages.turn-line'))!
		const run = line.querySelector(part('messages.turn-line-run'))
		const next = line.querySelector(part('messages.turn-line-next'))
		assert.ok(run && next, 'both halves')
		assert.equal(text(view, 'messages.turn-line-status'), 'Wren replied')
		// The right half: who is typing (the page's view, placed once), then who is due.
		assert.ok(next.querySelector(`${part('messages.turn-line-typing')} sp-host-view[name="session-banners"]`))
		assert.equal(view.queryAll('sp-host-view[name="session-banners"]').length, 1)
		assert.equal(text(view, 'messages.turn-line-text'), 'Wren is ready to continue')
		// The ⏳ aliases ride on the same elements.
		const go = next.querySelector(part('messages.turn-line-continue'))!
		assert.ok(go.matches(part('messages.next-up-continue')))
		assert.ok(next.querySelector(part('messages.turn-line-pick')))
		// A member is offered no Inspect run, and nothing waits: no links.
		assert.equal(view.query(part('messages.turn-line-links')), null)
		await view.click(go)
		assert.deepEqual(view.requested.filter((r) => r.kind === 'fire-turn').at(-1)?.params, { channel: 'main' })
	} finally {
		await view.unmount()
	}
})

test('while the reply streams the pill is live, and the one Stop is the composer\'s', { timeout: 120_000 }, async () => {
	const view = await mountTurnLine({ reply: { isGenerating: true, content: '' } })
	try {
		assert.equal(text(view, 'messages.turn-line-status'), 'Wren is thinking')
		assert.equal(view.query(part('messages.turn-line-status'))?.getAttribute('data-turn-state'), 'live')
		assert.ok(!view.query(part('messages.turn-line-continue')), 'no Continue while the reply streams')
		// 🚧 One Stop per run (2026-10-18, the 100-turn walk #28): the composer
		// right under the line already offers it, so the line does not.
		assert.ok(!view.query(part('messages.turn-line-stop')), 'no second Stop on the turn line')
		await view.click(part('messages.composer-stop'))
		assert.equal(view.invoked.at(-1)?.key, 'stop')
	} finally {
		await view.unmount()
	}
})

test('after a failure the pill says why and the right half is Try again', { timeout: 120_000 }, async () => {
	const view = await mountTurnLine({ reply: { error: { message: 'connection timed out' }, content: '' } })
	try {
		assert.equal(text(view, 'messages.turn-line-status'), 'Last run failed · connection timed out')
		assert.equal(view.query(part('messages.turn-line-status'))?.getAttribute('data-turn-state'), 'failed')
		assert.equal(text(view, 'messages.turn-line-retry'), 'Try again')
		assert.equal(view.query(part('messages.turn-line-continue')), null)
		await view.click(part('messages.turn-line-retry'))
		const last = view.invoked.at(-1) as { key: string; messageId?: number }
		assert.equal(last.key, 'retry')
		assert.equal(last.messageId, 2)
	} finally {
		await view.unmount()
	}
})

test('Who is due next: Nothing hides the right half only', { timeout: 120_000 }, async () => {
	const view = await mountTurnLine({ settings: { nextUp: 'hidden' } })
	try {
		assert.equal(view.query(part('messages.turn-line-next')), null)
		assert.equal(view.query(part('messages.turn-line-continue')), null)
		assert.equal(text(view, 'messages.turn-line-status'), 'Wren replied')
		// Who is typing still has its place.
		assert.ok(view.query(`${part('messages.turn-line-typing')} sp-host-view[name="session-banners"]`))
	} finally {
		await view.unmount()
	}
})

test('Review N changes appears when proposals wait; an administrator gets Inspect run', { timeout: 120_000 }, async () => {
	const proposal = (id: number) => ({ id, status: 'pending', messageId: 2, text: `hp 20 → ${id}`, proposedBy: 'Wren', moved: null })
	const view = await mountTurnLine({
		admin: true,
		d: turnDossier({ state: { ledgers: {}, pending: {}, waiting: [proposal(14), proposal(12)] } }),
	})
	try {
		assert.equal(text(view, 'messages.turn-line-review'), 'Review 2 changes')
		// The pill opens a panel holding the same links (all a narrow box shows).
		assert.equal(view.query(part('messages.turn-line-status'))?.tagName.toLowerCase(), 'button')
		await view.click(`${part('messages.turn-line-links')} ${part('messages.turn-line-inspect')}`)
		assert.deepEqual(view.requested.filter((r) => r.kind === 'inspect-run').at(-1)?.params, { messageId: 2 })
	} finally {
		await view.unmount()
	}
})

test('one proposal is ONE Review on screen: none under each ledger, none beside a pill that already says it (DC walk 6)', { timeout: 120_000 }, async () => {
	const proposal = { id: 14, status: 'pending', messageId: 2, text: 'Ann Health → -2', proposedBy: 'Narrator', moved: null }
	const ledger = [{ ownerKey: 'seat:1', ownerLabel: 'Ann', lines: [{ key: 'h', text: 'Health 12 → 10', updatedBy: 'run:1' }] }]
	const reviews = (view: TurnView) =>
		view.queryAll('button').filter((b) => /^Review \d+ changes?$/.test(b.textContent?.replace(/\s+/g, ' ').trim() ?? ''))
	const d = turnDossier({ state: { ledgers: { 1: ledger, 2: ledger }, pending: { 2: [proposal] }, waiting: [proposal] } })
	const replied = await mountTurnLine({ d })
	try {
		assert.equal(view_count(replied, 'messages.ledger'), 2, 'both ledgers drawn')
		assert.equal(replied.query(part('messages.ledger-review')), null, 'no Review under a ledger')
		assert.equal(reviews(replied).length, 1)
		assert.equal(text(replied, 'messages.turn-line-review'), 'Review 1 change')
	} finally {
		await replied.unmount()
	}
	// No reply yet: the pill itself says it, and nothing repeats it beside.
	const quiet = await mountTurnLine({ d, reply: { metadata: { isGreeting: true } } })
	try {
		assert.equal(reviews(quiet).length, 1)
		assert.equal(text(quiet, 'messages.turn-line-status'), 'Review 1 change')
		assert.equal(quiet.query(part('messages.turn-line-review')), null)
	} finally {
		await quiet.unmount()
	}
})
const view_count = (view: TurnView, name: string) => view.queryAll(part(name)).length

test('a greeting is no run: a log with only one has no left half', { timeout: 120_000 }, async () => {
	const view = await mountTurnLine({ reply: { metadata: { isGreeting: true } } })
	try {
		assert.equal(view.query(part('messages.turn-line-run')), null)
		assert.equal(text(view, 'messages.turn-line-text'), 'Wren is ready to continue')
	} finally {
		await view.unmount()
	}
})

test('a run this view saw start and end is timed on the pill', { timeout: 120_000 }, async () => {
	const view = await mountTurnLine()
	try {
		await view.event({ kind: 'generation:start', messageId: 2 })
		await view.event({ kind: 'generation:end', messageId: 2, aborted: false })
		assert.match(text(view, 'messages.turn-line-status') ?? '', /^Wren replied · \d+(\.\d)? s$/)
	} finally {
		await view.unmount()
	}
})

/* ── 🚧 a table line (owner screenshot 2026-10-15) ───────────────────────── */

test('a table line — a roll line — is drawn in no voice: no face, no name, no controls; its own glyph the marker', { timeout: 120_000 }, async () => {
	const ROLL = '⚄ Jandir, Speak to the ghost: d20 9 + 0 = 9 vs DC 5 — success'
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [
				row(1, 'user', 'I greet the ghost.'),
				row(2, 'assistant', ROLL, { characterId: null, metadata: { speaker: 'envoy:narrator', tableLine: true } }),
				row(3, 'assistant', 'The ghost bows.'),
			],
			settings: {},
			actions: { message: { primary: [edit], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: dossier },
		},
	})
	try {
		assert.deepEqual(view.refused, [])
		const lines = view.queryAll('[data-widget-part~="messages.message"]')
		assert.equal(lines.length, 3)
		const roll = lines[1]!
		assert.equal(roll.hasAttribute('data-msg-table-line'), true)
		assert.equal(lines[2]!.hasAttribute('data-msg-table-line'), false)
		// Content alone: no face, no name, no controls cell.
		for (const part of ['messages.message-avatar', 'messages.message-identity', 'messages.message-controls', 'messages.message-name'])
			assert.equal(roll.querySelector(`[data-widget-part~="${part}"]`), null, part)
		assert.equal(roll.querySelector('sp-message-body')?.getAttribute('text'), ROLL)
		assert.match(roll.getAttribute('aria-label') ?? '', /from the table: ⚄ Jandir/)
		// The other lines keep their speakers.
		assert.deepEqual(
			view.queryAll('[data-widget-part~="messages.message-name"]').map((n) => n.textContent?.trim()),
			['You', 'Mira'],
		)
	} finally {
		await view.unmount()
	}
})

/* ── 🚧 interleave: the table channel under its anchors (PLAN-rulesets §30) ── */

test('interleave: the table channel’s rows are drawn under the line each belongs to, faceless; the composer never offers the channel', { timeout: 120_000 }, async () => {
	const ROLL = '⚄ Ann, climb the wall: d20 9 + 0 = 9 vs DC 10 — failure'
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			// The roll is written after the Narrator's row — and after the next
			// person's line here — yet it reads under the row it belongs to.
			messages: [
				row(1, 'user', 'I climb the wall.'),
				row(2, 'assistant', 'Loose stone bites your hands.'),
				row(3, 'user', 'I try again.'),
				row(4, 'assistant', ROLL, { channel: 'table', characterId: null, metadata: { anchorMessageId: 2 } }),
			],
			// Drawn open, a line as any line (`interleaveAs: open`); the fold is below.
			settings: { interleave: 'table', interleaveAs: 'open' },
			actions: { message: { primary: [edit], overflow: [] } },
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			// The primary log: no copy claims `table`, so it is listed.
			scoped: {
				session_full: {
					...dossier,
					lines: { ...dossier.lines, 4: line('') },
					composer: { ...dossier.composer, channels: ['main', 'table'], channelRoles: { table: 'folio' } },
				},
			},
		},
	})
	try {
		assert.deepEqual(view.refused, [])
		assert.deepEqual(
			view.queryAll('sp-message-body').map((b) => b.getAttribute('text')),
			['I climb the wall.', 'Loose stone bites your hands.', ROLL, 'I try again.'],
		)
		const lines = view.queryAll('[data-widget-part~="messages.message"]')
		const roll = lines[2]!
		// Faceless, as a table line is drawn, and shown on the anchor's lane.
		assert.equal(roll.hasAttribute('data-msg-table-line'), true)
		for (const part of ['messages.message-avatar', 'messages.message-name'])
			assert.equal(roll.querySelector(`[data-widget-part~="${part}"]`), null, part)
		assert.equal(roll.closest('[data-widget-part~="messages.message-row"]')?.hasAttribute('hidden'), false)
		// The channel is drawn inline, never a lane to write on: no channel strip.
		assert.equal(view.queryAll('[data-widget-part~="messages.composer-channels"]').length, 0)

		// 🚧 As a fold (the default): one head line under its anchor, and opened, only the lines
		// after the head, one a line — never the head again (PLAN-dc-after-walk2 Q3-2, N14).
		await view.push('settings', { interleave: 'table' })
		assert.deepEqual(
			view.queryAll('sp-message-body').map((b) => b.getAttribute('text')),
			['I climb the wall.', 'Loose stone bites your hands.', 'I try again.'],
		)
		const rows = view.queryAll('[data-widget-part~="messages.message-row"]')
		assert.equal(rows[2]!.querySelector('[data-widget-part~="messages.table-fold-head"]')?.textContent?.trim(), ROLL)
		await view.click('[data-widget-part~="messages.table-fold-toggle"]')
		assert.equal(view.queryAll('[data-widget-part~="messages.table-fold-body"] li').length, 0)

		// Without the setting the row keeps its own place — and its own lane.
		await view.push('settings', {})
		assert.deepEqual(
			view.queryAll('sp-message-body').map((b) => b.getAttribute('text')),
			['I climb the wall.', 'Loose stone bites your hands.', 'I try again.', ROLL],
		)
	} finally {
		await view.unmount()
	}
})
