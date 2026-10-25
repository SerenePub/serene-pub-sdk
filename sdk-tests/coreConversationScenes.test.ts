/**
 * 🚧 Live scenes in core's conversation (PROPOSAL-live-scenes §7, §14 C), as
 * the component it ships as: a scene divider where each scene begins (its
 * name, its day, its count, its faces; the open one *since …* with the open
 * mark), day marks off the lines' story clock stamps, the message menu's
 * *Start scene here* / *End scene here* only where the host would take them,
 * the divider's rename and menu, and the selection bar's *Mark as scene*
 * first — each press one widget request, each refusal said where it was
 * asked.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { ConversationDossierV1 } from '../core-catalog/src/shared/ui/conversation/index.js'
import { mountComponent } from './harnessGuard.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

const stamp = (day: number) => ({ storyClockYear: 1, storyClockMonth: 3, storyClockDay: day })
const row = (id: number, role: string, content: string, extra: Record<string, unknown> = {}) => ({
	id,
	role,
	content,
	channel: 'main',
	characterId: role === 'assistant' ? 3 : null,
	personaId: role === 'user' ? 9 : null,
	createdAt: '2026-10-13T10:00:00Z',
	...extra,
})
const line = (name: string, ref: string | null = null) => ({
	controllable: true,
	speaker: { name, ref, face: null, sprite: null },
	swipes: { show: false, right: false },
	embedding: 'hidden' as const,
})
const rows = [
	row(1, 'user', 'We enter the inn.', stamp(5)),
	row(2, 'assistant', 'The keeper nods.', stamp(5)),
	row(3, 'user', 'We sleep.', stamp(5)),
	row(4, 'assistant', 'Morning comes.', stamp(6)),
	row(5, 'user', 'We set out.', stamp(6)),
]
type Scene = ConversationDossierV1['scenes'][number]
const scene = (over: Partial<Scene> & { id: number }): Scene => ({
	name: `Scene ${over.id}`,
	lorebookId: 8,
	historyEntryId: 30,
	selectedMessageIds: [],
	historyEntry: null,
	channel: 'main',
	...over,
})
/** Scene 1 holds lines 1–2 (closed, summarized); Scene 2 is open from line 4. */
const scenes: Scene[] = [
	scene({
		id: 1,
		name: 'The inn',
		openedAtMessageId: 1,
		closedAtMessageId: 2,
		selectedMessageIds: [1, 2],
		openedAt: { year: 1, month: 3, day: 5 },
		summaryStatus: 'done',
	}),
	scene({ id: 2, openedAtMessageId: 4, closedAtMessageId: null, openedAt: { year: 1, month: 3, day: 6 } }),
]
const dossier = (over: Partial<ConversationDossierV1> = {}): ConversationDossierV1 => ({
	sessionId: 1,
	lines: {
		1: line('You', 'character:9'),
		2: line('Mira', 'character:3'),
		3: line('You', 'character:9'),
		4: line('Mira', 'character:3'),
		5: line('You', 'character:9'),
	},
	scenes,
	scened: [1, 2, 4, 5],
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

const mount = (
	d: ConversationDossierV1,
	requests: (kind: string, params: Record<string, unknown>) => unknown = () => undefined,
	settings: Record<string, unknown> = {},
) =>
	mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/messages/messages.ts',
		owner: 'core',
		coreConversation: true,
		timeoutMs: 60_000,
		requests: requests as never,
		context: {
			session: { id: 1, name: 'Proof' },
			messages: rows,
			settings,
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: { session_full: d },
		},
	})

/** The log's items in order, as their parts and text read. */
const logItems = (view: Awaited<ReturnType<typeof mount>>) =>
	view
		.queryAll('[data-widget-part~="messages.message-list"] > li')
		.map((li) => {
			const part = li.getAttribute('data-widget-part') ?? ''
			if (part.includes('messages.scene-divider'))
				return `divider ${li.querySelector('[data-widget-part~="messages.scene-title"]')?.textContent?.trim()} | ${li
					.querySelector('[data-widget-part~="messages.scene-facts"]')
					?.textContent?.trim()}${li.hasAttribute('data-open') ? ' | open' : ''}`
			if (li.querySelector('[data-widget-part~="messages.day-mark"]'))
				return `day ${li.textContent?.trim()}`
			if (part.includes('messages.message-row')) return `line ${li.querySelector('sp-message-body')?.getAttribute('text')}`
			return part
		})

/** A line's menu rows, by their text. */
const menuOf = (view: Awaited<ReturnType<typeof mount>>, index: number) =>
	[...view.queryAll('[data-widget-part~="messages.message"]')[index]!.querySelectorAll('[data-widget-part~="messages.message-option"]')].map(
		(b) => b.textContent?.trim(),
	)


/**
 * The newest ask a test made. The composer saves its draft on its own clock
 * (`draft`), so it can land after the press under test; it is left out.
 */
const lastAsk = (v: { requested: Array<{ kind: string; params?: unknown }> }) =>
	v.requested.filter((r) => r.kind !== 'draft').at(-1)

test('a divider where each scene begins and a day mark where the story day turns; the open scene reads since', { timeout: 120_000 }, async () => {
	const view = await mount(dossier())
	try {
		assert.deepEqual(view.refused, [])
		assert.deepEqual(logItems(view), [
			'day Year 1, Mo. 3, Day 5',
			'divider The inn | Year 1, Mo. 3, Day 5 · 2 lines',
			'line We enter the inn.',
			'line The keeper nods.',
			'line We sleep.',
			'day Year 1, Mo. 3, Day 6',
			'divider Scene 2 | since Year 1, Mo. 3, Day 6 · 2 lines | open',
			'line Morning comes.',
			'line We set out.',
		])
		const inn = view.query('[data-widget-part~="messages.scene-divider"][data-scene="1"]')!
		assert.equal(inn.querySelector('[data-widget-part~="messages.scene-summary"]')?.textContent?.trim(), 'Summarized')
		assert.equal(inn.querySelectorAll('[data-widget-part~="messages.scene-face"]').length, 2, 'who speaks in it')
		// The open scene's divider carries the open mark.
		assert.equal(
			view.query('[data-scene="2"] [data-widget-part~="messages.scene-title-state"]')?.textContent?.trim(),
			'open',
		)
		// Its lines carry its colour, and the line between scenes none.
		const rowsDrawn = view.queryAll('[data-widget-part~="messages.message-row"]')
		assert.deepEqual(
			rowsDrawn.map((r) => r.getAttribute('data-scene')),
			['1', '1', null, '2', '2'],
		)
	} finally {
		await view.unmount()
	}
})

test('🚧 the settle line: rows at or below it are marked, and one mark follows the newest (sprint 2)', { timeout: 120_000 }, async () => {
	const settled = (over: Record<string, unknown>) => dossier(over as never)
	const MARK = '[data-widget-part~="messages.settled-mark"]'
	/** Document-order position of the mark among the log's items, by the ids of the rows around it. */
	const order = (view: Awaited<ReturnType<typeof mount>>) =>
		view.queryAll('[data-widget-part~="messages.message-list"] > li').map((li) =>
			li.querySelector(MARK) ? 'mark' : li.getAttribute('data-widget-part')?.includes('messages.message-row') ? (li.hasAttribute('data-history-settled') ? 's' : 'u') : '',
		).filter(Boolean).join(',')
	for (const [dir, expected] of [
		['oldest-first', 's,s,s,mark,u,u'],
		['newest-first', 'u,u,mark,s,s,s'],
	] as const) {
		const view = await mount(settled({ settledThrough: 3 }), undefined, { order: dir, showScenes: false })
		try {
			assert.equal(view.queryAll(MARK).length, 1)
			assert.equal(view.query(MARK)?.textContent?.trim(), 'In the lorebook up to here')
			assert.equal(order(view), expected, dir)
		} finally {
			await view.unmount()
		}
	}
	for (const over of [{}, { settledThrough: null }]) {
		const view = await mount(settled(over), undefined, {})
		try {
			assert.equal(view.queryAll(MARK).length, 0)
			assert.equal(view.queryAll('[data-widget-part~="messages.message-row"][data-history-settled]').length, 0)
		} finally {
			await view.unmount()
		}
	}
})

test('newest-first draws what opens at a line below it, in reverse', { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), undefined, { order: 'newest-first' })
	try {
		assert.deepEqual(logItems(view).slice(0, 4), [
			'line We set out.',
			'line Morning comes.',
			'divider Scene 2 | since Year 1, Mo. 3, Day 6 · 2 lines | open',
			'day Year 1, Mo. 3, Day 6',
		])
	} finally {
		await view.unmount()
	}
})

test("Show scenes and dates off draws no divider, no day mark and no scene's colour", { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), undefined, { showSceneMarkers: false })
	try {
		assert.deepEqual(logItems(view), rows.map((r) => `line ${r.content}`))
	} finally {
		await view.unmount()
	}
})

test('the message menu offers Start and End scene here only where the host would take them', { timeout: 120_000 }, async () => {
	const view = await mount(dossier())
	try {
		const scenes = (i: number) => menuOf(view, i).filter((t) => /scene here/.test(t ?? ''))
		assert.deepEqual(scenes(0), [], 'inside a closed scene: neither')
		assert.deepEqual(scenes(2), [], 'before the open scene: neither')
		assert.deepEqual(scenes(3), ['End scene here'], "at the open scene's opening: end only")
		assert.deepEqual(scenes(4), ['Start scene here', 'End scene here'])
	} finally {
		await view.unmount()
	}
	// Not the owner's to place (a guest, a genre that writes no scenes, no lorebook): none at all.
	const guest = await mount(dossier({ sceneBoundaries: false }))
	try {
		assert.deepEqual(menuOf(guest, 4).filter((t) => /scene/i.test(t ?? '')), [])
		assert.equal(guest.query('[data-widget-part~="messages.scene-menu"]'), null, 'and no divider menu')
		assert.equal(guest.query('[data-widget-part~="messages.scene-name"]'), null, 'and no rename')
	} finally {
		await guest.unmount()
	}
})

test('Start and End scene here ask the host; a refusal is said under the line', { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), (kind) => {
		if (kind === 'scene-open') throw new Error('That would overlap Scene 2. A message belongs to one scene.')
		if (kind === 'scene-close') return { sceneId: 2 }
		return undefined
	})
	try {
		const last = view.queryAll('[data-widget-part~="messages.message"]')[4]!
		await view.click(last.querySelector('[data-widget-part~="messages.scene-end"]')!)
		assert.deepEqual(lastAsk(view), { kind: 'scene-close', params: { sceneId: 2, messageId: 5 } })
		// One boundary write at a time: the next press waits for this answer.
		await view.settle()
		await view.click(last.querySelector('[data-widget-part~="messages.scene-start"]')!)
		assert.deepEqual(lastAsk(view), { kind: 'scene-open', params: { messageId: 5, channel: 'main' } })
		await view.settle()
		const said = view.query('li[data-widget-part~="messages.scene-refusal"]')
		assert.match(said?.textContent ?? '', /overlap Scene 2/)
		await view.click(said!.querySelector('[data-widget-part~="messages.scene-refusal-dismiss"]')!)
		assert.equal(view.query('li[data-widget-part~="messages.scene-refusal"]'), null)
	} finally {
		await view.unmount()
	}
})

test("a divider's name renames it; its menu summarizes, opens the lorebook, ends the open scene and removes a boundary", { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), (kind) => (kind === 'scene-remove' ? { removed: true } : undefined))
	try {
		const inn = '[data-widget-part~="messages.scene-divider"][data-scene="1"]'
		await view.click(`${inn} [data-widget-part~="messages.scene-name"]`)
		const field = `${inn} [data-widget-part~="messages.scene-name-field"]`
		assert.ok(view.query(field), 'the name opens as a field')
		await view.input(field, '  The Prancing Pony ')
		await view.pressKey(field, 'Enter')
		assert.deepEqual(lastAsk(view), { kind: 'scene-rename', params: { sceneId: 1, name: 'The Prancing Pony' } })

		const option = (sel: string, text: string) =>
			view.queryAll(`${sel} [data-widget-part~="messages.scene-option"]`).find((b) => b.textContent?.trim() === text)!
		assert.deepEqual(
			view.queryAll(`${inn} [data-widget-part~="messages.scene-option"]`).map((b) => b.textContent?.trim()),
			['Summarize', 'Open in lorebook', 'Move start down one line', 'Remove boundary'],
		)
		await view.click(option(inn, 'Summarize'))
		assert.deepEqual(lastAsk(view), { kind: 'summarize', params: { kind: 'scene', sceneId: 1 } })
		await view.click(option(inn, 'Open in lorebook'))
		assert.deepEqual(lastAsk(view), {
			kind: 'open-lore',
			params: { scope: 'scenes', sceneId: 1, entryId: 30, lorebookId: 8 },
		})
		await view.click(option(inn, 'Remove boundary'))
		assert.deepEqual(lastAsk(view), { kind: 'scene-remove', params: { sceneId: 1 } })
		await view.settle()

		const open = '[data-widget-part~="messages.scene-divider"][data-scene="2"]'
		assert.deepEqual(
			view.queryAll(`${open} [data-widget-part~="messages.scene-option"]`).map((b) => b.textContent?.trim()),
			['End scene', 'Open in lorebook', 'Move start up one line', 'Move start down one line', 'Remove boundary'],
		)
		await view.click(option(open, 'End scene'))
		assert.deepEqual(lastAsk(view), { kind: 'scene-close', params: { sceneId: 2 } })
	} finally {
		await view.unmount()
	}
})

test('selecting lines, Mark as scene comes first: the run becomes one closed live scene, in one write', { timeout: 120_000 }, async () => {
	// No scene yet: every line is free.
	const view = await mount(dossier({ scenes: [], scened: [] }), (kind) =>
		kind === 'scene-open' ? { sceneId: 7 } : undefined,
	)
	try {
		const second = view.queryAll('[data-widget-part~="messages.message"]')[1]!
		const options = [...second.querySelectorAll('[data-widget-part~="messages.message-option"]')]
		await view.click(options.find((b) => b.textContent?.trim() === 'Select for summary')!)
		const fourth = view.queryAll('[data-widget-part~="messages.message"]')[3]!
		await view.click(fourth.querySelector('[data-widget-part~="messages.message-select"]')!)
		const bar = view.queryAll('[data-widget-part~="messages.selection-finish"] button').map((b) => b.textContent?.trim())
		assert.deepEqual(bar.slice(0, 3), ['Cancel', 'Mark as scene', 'Scene summary'])
		await view.click('[data-widget-part~="messages.mark-scene"]')
		await view.settle()
		assert.deepEqual(
			view.requested.filter((r) => r.kind.startsWith('scene-')),
			[{ kind: 'scene-open', params: { messageId: 2, channel: 'main', closeAt: 4 } }],
		)
		assert.equal(view.query('[data-widget-part~="messages.selection-bar"]'), null, 'the selection ends')
	} finally {
		await view.unmount()
	}
})

test('Mark as scene takes an earlier run, before the open scene (lane E)', { timeout: 120_000 }, async () => {
	// The open scene runs from line 4; lines 1–3 are in no scene.
	const late = [scene({ id: 2, openedAtMessageId: 4, closedAtMessageId: null, openedAt: { year: 1, month: 3, day: 6 } })]
	const view = await mount(dossier({ scenes: late, scened: [4, 5] }), (kind) => (kind === 'scene-open' ? { sceneId: 8 } : undefined))
	try {
		const first = view.queryAll('[data-widget-part~="messages.message"]')[0]!
		const options = [...first.querySelectorAll('[data-widget-part~="messages.message-option"]')]
		await view.click(options.find((b) => b.textContent?.trim() === 'Select for summary')!)
		const third = view.queryAll('[data-widget-part~="messages.message"]')[2]!
		await view.click(third.querySelector('[data-widget-part~="messages.message-select"]')!)
		const mark = view.query<HTMLButtonElement>('[data-widget-part~="messages.mark-scene"]')!
		assert.equal(mark.hasAttribute('disabled'), false, 'an earlier run is offered')
		await view.click(mark)
		await view.settle()
		assert.deepEqual(view.requested.filter((r) => r.kind === 'scene-open').at(-1), {
			kind: 'scene-open',
			params: { messageId: 1, channel: 'main', closeAt: 3 },
		})
	} finally {
		await view.unmount()
	}
})

test("Suggested mode's chip: New scene? with Yes and Not here, before its line, the owner's alone (lane E)", { timeout: 120_000 }, async () => {
	const cues = [{ id: 41, channel: 'main', messageId: 3, triggers: ['dayCrossed'], reason: 'the day changed' }]
	const view = await mount(dossier({ sceneCues: cues }), (kind, params) => {
		if (kind === 'decide-scene-cue' && params.accept === false) throw new Error('That suggestion was already set aside.')
		return kind === 'decide-scene-cue' ? { sceneId: 9 } : undefined
	})
	try {
		const items = logItems(view)
		const at = items.indexOf('line We sleep.')
		assert.equal(items[at - 1], 'messages.log-item messages.scene-cue', 'the chip sits in the divider slot before its line')
		const chip = view.query('[data-widget-part~="messages.scene-cue"]')!
		assert.match(chip.textContent ?? '', /New scene\?\s*— the day changed/)
		await view.click(chip.querySelector('[data-widget-part~="messages.scene-cue-accept"]')!)
		assert.deepEqual(lastAsk(view), { kind: 'decide-scene-cue', params: { cueId: 41, accept: true } })
		await view.settle()
		await view.click(chip.querySelector('[data-widget-part~="messages.scene-cue-decline"]')!)
		assert.deepEqual(lastAsk(view), { kind: 'decide-scene-cue', params: { cueId: 41, accept: false } })
		await view.settle()
		assert.match(
			view.query('[data-widget-part~="messages.scene-cue"] [data-widget-part~="messages.scene-refusal"]')?.textContent ?? '',
			/already set aside/,
			'the refusal is said in the chip',
		)
	} finally {
		await view.unmount()
	}
	const guest = await mount(dossier({ sceneCues: cues, sceneBoundaries: false }))
	try {
		assert.equal(guest.query('[data-widget-part~="messages.scene-cue"]'), null, 'no chip where boundaries are not the viewer\'s')
	} finally {
		await guest.unmount()
	}
})

test("a divider: Summarize hidden under Never, a moved scene's summary out of date, its cast's faces (lane E)", { timeout: 120_000 }, async () => {
	const stale = [
		scene({
			id: 1,
			name: 'The inn',
			openedAtMessageId: 1,
			closedAtMessageId: 2,
			selectedMessageIds: [1, 2],
			openedAt: { year: 1, month: 3, day: 5 },
			summaryStatus: 'none',
			hasSummary: true,
			cast: [
				{ ref: 'character:3', name: 'Mira', face: null },
				{ ref: null, name: 'The innkeeper', face: null },
				{ ref: 'character:12', name: 'Oswin', face: null },
			],
		} as Partial<Scene> & { id: number }),
		scenes[1]!,
	]
	const view = await mount(dossier({ scenes: stale, sceneSummaryMode: 'never' }))
	try {
		const inn = '[data-widget-part~="messages.scene-divider"][data-scene="1"]'
		assert.equal(view.query(`${inn} [data-widget-part~="messages.scene-summary-stale"]`)?.textContent?.trim(), 'Summary out of date')
		assert.deepEqual(
			view.queryAll(`${inn} [data-widget-part~="messages.scene-option"]`).map((b) => b.textContent?.trim()),
			['Open in lorebook', 'Move start down one line', 'Remove boundary'],
			'no Summarize under Never',
		)
		assert.deepEqual(
			view.queryAll(`${inn} [data-widget-part~="messages.scene-face"]`).map((f) => f.getAttribute('aria-label') ?? f.getAttribute('alt')),
			['Mira', 'The innkeeper', 'Oswin'],
			'the cast, not only who spoke in its loaded lines',
		)
	} finally {
		await view.unmount()
	}
})

test('🚧 a divider whose run waits for review says Ready to review, and opens it (§15 G8)', { timeout: 120_000 }, async () => {
	const reviewing = [scene({ ...scenes[0]!, id: 1, summaryStatus: 'review' }), scenes[1]!]
	const view = await mount(dossier({ scenes: reviewing }))
	try {
		const inn = '[data-widget-part~="messages.scene-divider"][data-scene="1"]'
		const ready = view.query(`${inn} [data-widget-part~="messages.scene-summary-review"]`)!
		assert.equal(ready.textContent?.trim(), 'Ready to review')
		assert.equal(view.query(inn)?.getAttribute('data-summary'), 'review')
		await view.click(ready)
		assert.deepEqual(lastAsk(view), { kind: 'summarize', params: { kind: 'scene', sceneId: 1 } })
		assert.ok(
			view.queryAll(`${inn} [data-widget-part~="messages.scene-option"]`).some((b) => b.textContent?.trim() === 'Review summary'),
			'its menu opens the review too',
		)
	} finally {
		await view.unmount()
	}
	// A guest reads it, and presses nothing.
	const guest = await mount(dossier({ scenes: reviewing, sceneBoundaries: false, isOwner: false }))
	try {
		const inn = '[data-widget-part~="messages.scene-divider"][data-scene="1"]'
		assert.equal(guest.query(`${inn} [data-widget-part~="messages.scene-summary-review"]`), null)
		assert.equal(guest.query(`${inn} [data-widget-part~="messages.scene-summary"]`)?.textContent?.trim(), 'Ready to review')
	} finally {
		await guest.unmount()
	}
})

test("🚧 the log's dates through the book's calendar the dossier carries (§15 G9)", { timeout: 120_000 }, async () => {
	const storyCalendar = {
		months: [
			{ name: 'Deepwinter', days: 30 },
			{ name: 'Thaw', days: 30 },
			{ name: 'Bloom', days: 30 },
		],
	}
	const view = await mount(dossier({ storyCalendar }))
	try {
		assert.deepEqual(logItems(view), [
			'day 5 Bloom, Year 1',
			'divider The inn | 5 Bloom, Year 1 · 2 lines',
			'line We enter the inn.',
			'line The keeper nods.',
			'line We sleep.',
			'day 6 Bloom, Year 1',
			'divider Scene 2 | since 6 Bloom, Year 1 · 2 lines | open',
			'line Morning comes.',
			'line We set out.',
		])
	} finally {
		await view.unmount()
	}
})

test('a divider moves its start: dragged between lines, or a line up or down from its menu; a closed last scene reopens (lane E)', { timeout: 120_000 }, async () => {
	const view = await mount(dossier(), (kind) => (kind === 'scene-move' ? { sceneId: 2 } : undefined))
	try {
		const open = '[data-widget-part~="messages.scene-divider"][data-scene="2"]'
		const handle = view.query(`${open} sp-drag-handle`)!
		assert.equal(handle.getAttribute('along'), 'messages.message-row')
		// Dropped between lines 2 and 3 (document order, oldest first): it starts at 3.
		await view.dispatch(handle, 'move', { prev: '2', next: '3' })
		assert.deepEqual(lastAsk(view), { kind: 'scene-move', params: { sceneId: 2, openedAt: 3 } })
		await view.settle()
		const before = view.requested.length
		await view.dispatch(handle, 'move', { prev: '3', next: '4' })
		assert.equal(view.requested.length, before, 'a drop where it already starts asks nothing')

		const option = (text: string) =>
			view.queryAll(`${open} [data-widget-part~="messages.scene-option"]`).find((b) => b.textContent?.trim() === text)!
		await view.click(option('Move start up one line'))
		assert.deepEqual(lastAsk(view), { kind: 'scene-move', params: { sceneId: 2, openedAt: 3 } })
		await view.settle()
		await view.click(option('Move start down one line'))
		assert.deepEqual(lastAsk(view), { kind: 'scene-move', params: { sceneId: 2, openedAt: 5 } })
	} finally {
		await view.unmount()
	}
	// A closed scene with nothing after it on its lane may run on again.
	const ended = [scenes[0]!, scene({ id: 2, openedAtMessageId: 4, closedAtMessageId: 5, openedAt: { year: 1, month: 3, day: 6 } })]
	const later = await mount(dossier({ scenes: ended }), (kind) => (kind === 'scene-move' ? { sceneId: 2 } : undefined))
	try {
		const options = (id: number) =>
			later.queryAll(`[data-scene="${id}"] [data-widget-part~="messages.scene-option"]`).map((b) => b.textContent?.trim())
		assert.ok(!options(1).includes('Reopen scene'), 'not with a scene after it')
		assert.ok(options(2).includes('Reopen scene'))
		const reopen = later
			.queryAll('[data-scene="2"] [data-widget-part~="messages.scene-option"]')
			.find((b) => b.textContent?.trim() === 'Reopen scene')!
		await later.click(reopen)
		assert.deepEqual(lastAsk(later), { kind: 'scene-move', params: { sceneId: 2, closedAt: null } })
	} finally {
		await later.unmount()
	}
})
