/**
 * Core's composer as the widget it ships as (owner R8 2026-11-05, PLAN-
 * session-layout-simplify D7/D8): split from the log, it follows the Messages
 * copy it belongs to. The host gives it that copy's dossier plus, under
 * `composer`, the copy it follows (`target`) and — when that panel shows a tab
 * that is not a Messages tab — `writingTo`. Built by the CLI's component
 * bundler from `core-catalog/components/shared/composer/`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { NO_LANE_CHANNEL, type ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const part = (name: string) => `[data-widget-part~="${name}"]`

const row = (id: number, role: string, content: string, channel = 'main') => ({
	id,
	role,
	content,
	channel,
	characterId: role === 'assistant' ? 3 : null,
	personaId: role === 'user' ? 9 : null,
	createdAt: '2026-11-05T10:00:00Z',
})
const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
type Target = {
	instance: string
	channel: string
	label: string
	lineWidth?: 'column' | 'full' | 'comfortable'
	presentation?: 'rows' | 'folio'
}
const dossier = (
	channels: string[],
	target?: Target,
	writingTo?: { channel: string; label: string },
): ConversationDossierV1 =>
	({
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
			channels,
			channelLabels: { main: 'Story', sanctum: 'Sanctum' },
			usage: null,
			tabs: [],
			actions: false,
			notice: false,
			overflow: [],
			palette: [],
			newest: null,
			sendTonal: false,
			...(target ? { target } : {}),
			...(writingTo ? { writingTo } : {}),
		},
		turn: { order: [], candidates: [], show: false, canChoose: false },
		readOnly: null,
		state: { ledgers: {}, pending: {}, waiting: [] },
		appBackground: false,
	}) as ConversationDossierV1

const mountComposer = (settings: Record<string, unknown>, d: ConversationDossierV1) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/composer/composer.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: [row(1, 'user', 'We go north.')],
			settings,
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})

const sanctum: Target = { instance: 'messages#sanctum', channel: 'sanctum', label: 'Sanctum' }
const send = async (view: Awaited<ReturnType<typeof mountComposer>>, value: string) => {
	await view.dispatch('sp-composer-field', 'input', { value })
	await view.click(part('messages.composer-send'))
	return view.requested.filter((r) => r.kind === 'send').at(-1)?.params
}

test('a line sent goes to the channel the target copy shows', { timeout: 120_000 }, async () => {
	const view = await mountComposer({}, dossier(['main', 'sanctum'], sanctum))
	try {
		assert.deepEqual(view.refused, [])
		assert.equal((await send(view, 'Build me a vault.'))?.channel, 'sanctum')
		// The target moves to the story: the next line follows it.
		await view.push('scoped', { session_full: dossier(['main', 'sanctum'], { instance: 'messages', channel: 'main', label: 'Story' }) })
		assert.equal((await send(view, 'Back to the road.'))?.channel, 'main')
	} finally {
		await view.unmount()
	}
})

test('with no target the lane is the first writable channel, as it always was', { timeout: 120_000 }, async () => {
	const view = await mountComposer({}, dossier(['main', 'sanctum']))
	try {
		assert.equal((await send(view, 'Hello.'))?.channel, 'main')
		assert.equal(view.query(part('composer.writing-to')) === null, true)
		assert.equal(view.query(part('composer.root'))?.getAttribute('data-line-width'), 'full', 'Full unless the target says')
		assert.equal(view.query(part('composer.root'))?.hasAttribute('data-presentation'), false)
	} finally {
		await view.unmount()
	}
})

test('a target panel on a tab that is not a Messages tab says where a line goes: Writing to ‹label›', { timeout: 120_000 }, async () => {
	const view = await mountComposer({}, dossier(['main', 'sanctum'], sanctum, { channel: 'sanctum', label: 'Sanctum' }))
	try {
		const note = view.query(part('composer.writing-to'))
		assert.equal(note?.localName, 'p')
		assert.equal(note?.getAttribute('role'), 'status')
		assert.equal(note?.textContent?.trim(), 'Writing to Sanctum')
		// Said above the field.
		assert.ok(note!.compareDocumentPosition(view.query(part('messages.composer'))!) & 4 /* FOLLOWING */, 'above the field')
		// The target comes back to a Messages tab: the line goes.
		await view.push('scoped', { session_full: dossier(['main', 'sanctum'], sanctum) })
		assert.equal(view.query(part('composer.writing-to')) === null, true)
	} finally {
		await view.unmount()
	}
})

test('otherTabsComposer applies when the target shows a tab other than the first', { timeout: 120_000 }, async () => {
	const both = ['main', 'sanctum']
	const view = await mountComposer({ otherTabsComposer: 'minimal' }, dossier(both, sanctum))
	try {
		assert.equal(view.query(part('composer.root'))?.getAttribute('data-composer-skin'), 'minimal')
		assert.equal(view.query(part('messages.composer'))?.getAttribute('data-composer-skin'), 'minimal')
		await view.push('scoped', { session_full: dossier(both, { instance: 'messages', channel: 'main', label: 'Story' }) })
		assert.equal(view.query(part('composer.root'))?.getAttribute('data-composer-skin'), 'classic')
	} finally {
		await view.unmount()
	}
	// One channel is no tab: the setting has nothing to apply to.
	const single = await mountComposer({ otherTabsComposer: 'minimal' }, dossier(['sanctum'], sanctum))
	try {
		assert.equal(single.query(part('composer.root'))?.getAttribute('data-composer-skin'), 'classic')
	} finally {
		await single.unmount()
	}
})

test('the root is the compose block: composer.root with its old messages.compose name, the target’s Line width and presentation', { timeout: 120_000 }, async () => {
	const view = await mountComposer(
		{ composer: 'writer' },
		dossier(['main'], { instance: 'messages', channel: 'main', label: 'Story', lineWidth: 'column', presentation: 'rows' }),
	)
	try {
		const root = view.query(part('composer.root'))!
		assert.ok(root.matches(part('messages.compose')), 'the old name rides on the same element')
		assert.ok(root.matches(part('composer.compose')))
		assert.equal(root.getAttribute('data-line-width'), 'column')
		assert.equal(root.getAttribute('data-presentation'), 'rows')
		assert.equal(root.getAttribute('data-composer-skin'), 'writer')
		// The area and the field sit inside it, each with both names.
		const area = root.querySelector(part('messages.compose-area'))!
		assert.ok(area.matches(part('composer.compose-area')))
		assert.ok(area.querySelector(part('composer.field')))
		assert.ok(area.querySelector(part('messages.composer-field')))
		// The root never asks to fill the panel: the host measures its content.
		assert.equal(root.getAttribute('style'), null)
		// Beside the log, never inside it.
		assert.equal(view.query(part('messages.root')) === null, true)
		assert.equal(view.query(part('messages.turn-line')) === null, true)
	} finally {
		await view.unmount()
	}
})

test('a session whose mode is gone is read-only: the banner replaces the field, under the same parts', { timeout: 120_000 }, async () => {
	const d = { ...dossier(['main']), readOnly: { genreId: 'gone-genre' } } as unknown as ConversationDossierV1
	const view = await mountComposer({}, d)
	try {
		const banner = view.query(part('composer.read-only'))
		assert.ok(banner?.matches(part('messages.read-only')))
		assert.match(banner?.textContent ?? '', /This session is read-only\./)
		assert.match(banner?.textContent ?? '', /gone-genre/)
		assert.equal(view.query(part('messages.composer-field')) === null, true)
	} finally {
		await view.unmount()
	}
})

test('a viewer in no lane of the channel has no composer', { timeout: 120_000 }, async () => {
	const view = await mountComposer({}, dossier([NO_LANE_CHANNEL]))
	try {
		assert.equal(view.query(part('composer.root')) === null, true)
	} finally {
		await view.unmount()
	}
})
