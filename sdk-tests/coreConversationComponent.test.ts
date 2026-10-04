/**
 * Core's conversation as the component it ships as (C7): built by the CLI's
 * component bundler from `core-catalog/components/sessions/messages/`, run in
 * a worker and mirrored through the host-element vocabulary — rendering the
 * log, following a streamed reply, editing a line through the `edit` verb —
 * and its block renderer's three form states (plans/29 R-15 *Forms*;
 * plans/30 U5d, U5f). Moved from the app with the source.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { ConversationDossierV1 } from '../core-catalog/src/ui/sessions/conversation/index.js'
import { CORE_WIDGETS } from '@serene-pub/core-catalog'
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
	backdrop: false,
}
const edit = {
	key: 'edit',
	specSlug: 'core',
	name: 'Edit',
	icon: 'pencil',
	slash: 'edit',
	audience: { see: ['participant'], act: ['item'] },
	venue: 'message',
	origin: 'core',
	canAct: true,
	itemGated: true,
	isNew: false,
	enabled: true,
	quick: true,
}

test("core's conversation component renders, streams and edits", { timeout: 120_000 }, async () => {
	const view = await mountComponent({
		root: CORE_CATALOG,
		entry: 'components/sessions/messages/messages.ts',
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
		entry: 'components/sessions/messages/messages.ts',
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
		entry: 'components/sessions/messages/messages.ts',
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
		entry: 'components/sessions/messages/messages.ts',
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
		entry: 'components/sessions/messages/messages.ts',
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
			entry: 'components/sessions/messages/messages.ts',
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
			entry: 'components/sessions/messages/messages.ts',
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
		entry: 'components/sessions/messages/messages.ts',
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
		entry: 'components/sessions/messages/messages.ts',
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
