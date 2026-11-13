/**
 * Core's turn line as the widget it ships as (owner R8 2026-11-05): split from
 * the log, it follows the Messages copy it belongs to and carries one setting,
 * `nextUp`. The behaviours of the line itself (the pill, Continue, Try again,
 * Review) are held in `coreConversationComponent.test.ts`; this holds the
 * widget's own shape. Built by the CLI's component bundler from
 * `core-catalog/components/shared/turn-line/`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { NO_LANE_CHANNEL, type ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS } from '../core-catalog/src/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const part = (name: string) => `[data-widget-part~="${name}"]`

const line = (name: string) => ({
	controllable: true,
	speaker: { name, ref: null, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
const dossier = (channels: string[], target?: { instance: string; channel: string; label: string }): ConversationDossierV1 =>
	({
		sessionId: 1,
		lines: { 1: line('You'), 2: line('Wren') },
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
			usage: null,
			tabs: [],
			actions: false,
			notice: false,
			overflow: [],
			palette: [],
			newest: null,
			sendTonal: false,
			...(target ? { target } : {}),
		},
		turn: {
			// Each channel has its own order: the story's, and the Sanctum's.
			order: [{ ref: 'character:3' }, { ref: 'character:3', channel: 'sanctum' }] as ConversationDossierV1['turn']['order'],
			candidates: [{ ref: 'character:3', kind: 'character', name: 'Wren' }],
			show: true,
			canChoose: true,
		},
		readOnly: null,
		state: { ledgers: {}, pending: {}, waiting: [] },
		appBackground: false,
	}) as ConversationDossierV1

const rows = [
	{ id: 1, role: 'user', content: 'We go north.', channel: 'main', characterId: null, personaId: 9, createdAt: '2026-11-05T10:00:00Z' },
	{ id: 2, role: 'assistant', content: 'The road narrows.', channel: 'main', characterId: 3, personaId: null, createdAt: '2026-11-05T10:00:01Z' },
]
const mountTurn = (settings: Record<string, unknown>, d: ConversationDossierV1) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/turn-line/turn-line.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: () => undefined,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: rows,
			settings,
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})

test('the turn line is declared a core widget of its own, with nextUp as its one setting', () => {
	const decl = CORE_WIDGETS.find((w) => w.id === 'turn-line')
	assert.equal(decl?.title, 'Turn line')
	assert.equal(decl?.component, 'turn-line')
	assert.deepEqual(Object.keys(decl?.settings ?? {}), ['nextUp'])
	const nextUp = decl?.settings?.nextUp as { default?: string; of?: string[] }
	assert.equal(nextUp.default, 'head')
	assert.deepEqual(nextUp.of, ['head', 'list', 'hidden'])
	assert.ok(CORE_COMPONENTS.some((c) => c.slug === 'turn-line'))
	// The log no longer carries it.
	assert.equal((CORE_WIDGETS.find((w) => w.id === 'messages')?.settings as Record<string, unknown>).nextUp, undefined)
})

test('it mounts under turn-line.root and draws the line in its parts', { timeout: 120_000 }, async () => {
	const view = await mountTurn({}, dossier(['main']))
	try {
		assert.deepEqual(view.refused, [])
		const root = view.query(part('turn-line.root'))!
		assert.ok(root, 'the root')
		const turn = root.querySelector(part('messages.turn-line'))!
		assert.ok(turn, 'the old part name, inside the root')
		assert.ok(turn.matches(part('turn-line.turn-line')), 'and the new one on the same element')
		const next = turn.querySelector(part('turn-line.next'))!
		assert.ok(next.matches(part('messages.turn-line-next')))
		assert.ok(next.querySelector(part('turn-line.next-up-continue')))
		// Beside the log, never inside it.
		assert.equal(view.query(part('messages.root')) === null, true)
		assert.equal(view.query(part('messages.composer')) === null, true)
	} finally {
		await view.unmount()
	}
})

test('nextUp: hidden drops the next half, and the legacy showNudge: false reads as hidden', { timeout: 120_000 }, async () => {
	for (const settings of [{ nextUp: 'hidden' }, { showNudge: false }]) {
		const view = await mountTurn(settings, dossier(['main']))
		try {
			assert.ok(view.query(part('turn-line.root')))
			assert.equal(view.query(part('turn-line.next')) === null, true)
			assert.equal(view.query(part('turn-line.continue')) === null, true)
		} finally {
			await view.unmount()
		}
	}
})

test('Continue fires the channel the target copy shows, followed live', { timeout: 120_000 }, async () => {
	const both = ['main', 'sanctum']
	const view = await mountTurn({}, dossier(both, { instance: 'messages#sanctum', channel: 'sanctum', label: 'Sanctum' }))
	try {
		await view.click(part('turn-line.continue'))
		assert.deepEqual(view.requested.filter((r) => r.kind === 'fire-turn').at(-1)?.params, { channel: 'sanctum' })
		await view.push('scoped', { session_full: dossier(both, { instance: 'messages', channel: 'main', label: 'Story' }) })
		await view.click(part('turn-line.continue'))
		assert.deepEqual(view.requested.filter((r) => r.kind === 'fire-turn').at(-1)?.params, { channel: 'main' })
	} finally {
		await view.unmount()
	}
})

test('a viewer in no lane of the channel has no turn line', { timeout: 120_000 }, async () => {
	const view = await mountTurn({}, dossier([NO_LANE_CHANNEL]))
	try {
		assert.equal(view.query(part('turn-line.root')) === null, true)
	} finally {
		await view.unmount()
	}
})
