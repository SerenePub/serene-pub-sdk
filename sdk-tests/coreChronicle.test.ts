/**
 * The plain-TypeScript half of core's Chronicle widget
 * (`@serene-pub/core-catalog/chronicle`, PLAN-core-widgets W3): its
 * declaration, its settings, the clock's step and *Move the clock…* form,
 * and the one view it draws from a `history-entries` answer — the clock
 * head, Now, the scenes, Earlier — with the owner's writes and a guest's
 * reading.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
	WIDGET_EVENT_SCOPES,
	WIDGET_REQUEST_ASKERS,
	widgetEventHeard,
	type HistoryEntriesV1,
	type HistoryEntryV1,
	type ViewerV1,
} from '@serene-pub/sdk'
import {
	CHRONICLE_DEFAULTS,
	CHRONICLE_SWATCHES,
	chronicleClockDraft,
	chronicleClockFromDraft,
	chronicleStep,
	chronicleView,
	readChronicleSettings,
} from '../core-catalog/src/shared/ui/chronicle/index.js'
import { CORE_COMPONENTS, CORE_WIDGETS, coreWidgets } from '../core-catalog/src/index.js'

const OWNER: ViewerV1 = { userId: 10, isAdmin: false, isGuest: false }
const GUEST: ViewerV1 = { userId: 11, isAdmin: false, isGuest: true }
const t = (s: string) => s

const entry = (id: number, year: number, over: Partial<HistoryEntryV1> = {}): HistoryEntryV1 => ({
	id,
	date: { year, month: 3, day: 5 },
	label: `5 March, Year ${year}`,
	firstLine: `What happened in ${year}`,
	sceneCount: 0,
	...over,
})

const answer = (over: Partial<HistoryEntriesV1> = {}): HistoryEntriesV1 => ({
	lorebookId: 4,
	ownerOnly: false,
	clock: {
		present: { year: 412, month: 3, day: 5 },
		label: '5 March, Year 412',
		own: false,
		linePresent: { year: 412, month: 3, day: 5 },
		linePresentLabel: '5 March, Year 412',
		behind: false,
	},
	current: entry(9, 412, { sceneCount: 2 }),
	scenes: [
		{ id: 1, name: 'The duel', lineCount: 6, order: 0, summarized: true, graphed: false },
		{ id: 2, name: null, lineCount: 1, order: 9, summarized: false, graphed: false },
	],
	earlier: [entry(8, 411), entry(7, 410, { firstLine: '' })],
	earlierTotal: 2,
	ungraphedScenes: 2,
	opensScenes: true,
	...over,
})

describe('the declaration', () => {
	test('chronicle: the lore grant, the four sections it reads, a span of one', () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'chronicle')!
		assert.ok(decl)
		assert.equal(coreWidgets.chronicle, decl)
		assert.equal(decl.title, 'Chronicle')
		assert.equal(decl.icon, 'Calendar', "the history door's glyph (NOMENCLATURE §22)")
		assert.equal(decl.genres, undefined)
		assert.deepEqual(decl.scopes, ['lore'])
		assert.deepEqual(decl.reads, ['settings', 'viewer', 'session'])
		assert.deepEqual(decl.layout, { span: { ideal: 1 }, minInline: 260 })
		assert.ok(
			CORE_COMPONENTS.some(
				(c) =>
					c.slug === 'chronicle' &&
					c.entry === 'components/shared/chronicle/chronicle.ts',
			),
		)
	})

	test("the declared defaults and bounds are the reader's", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'chronicle')!
		const s = decl.settings as Record<
			string,
			{ type: string; default: unknown; min?: number; max?: number; group?: string }
		>
		assert.equal(s.clock!.type, 'boolean')
		assert.equal(s.earlierCount!.type, 'integer')
		assert.equal(s.earlierCount!.group, undefined, 'a section of one field is no section')
		assert.deepEqual(CHRONICLE_DEFAULTS, {
			clock: s.clock!.default,
			earlierCount: s.earlierCount!.default,
		})
		assert.deepEqual([s.earlierCount!.min, s.earlierCount!.max], [5, 50])
		assert.deepEqual(readChronicleSettings(undefined), CHRONICLE_DEFAULTS)
		assert.deepEqual(
			readChronicleSettings({ clock: 'no', earlierCount: 7.5 }),
			CHRONICLE_DEFAULTS,
		)
		assert.deepEqual(readChronicleSettings({ clock: false, earlierCount: 2 }), {
			clock: false,
			earlierCount: 5,
		})
		assert.deepEqual(readChronicleSettings({ earlierCount: 99 }).earlierCount, 50)
	})

	test('its requests: the read is the lore scope’s, the writes core’s; story:moved is scoped like lore:ranked', () => {
		assert.deepEqual(WIDGET_REQUEST_ASKERS['history-entries'], { scope: 'lore' })
		for (const kind of [
			'set-story-clock',
			'start-history-entry',
			'extend-graph',
			'summarize',
		] as const)
			assert.equal(WIDGET_REQUEST_ASKERS[kind], 'core', kind)
		assert.equal(WIDGET_EVENT_SCOPES['story:moved'], 'lore')
		assert.equal(widgetEventHeard('story:moved', { owner: 'acme.dice' }), false)
		assert.equal(
			widgetEventHeard('story:moved', { owner: 'acme.dice', grants: ['lore'] }),
			true,
		)
		assert.equal(widgetEventHeard('story:moved', { owner: 'core' }), true)
	})
})

describe('the clock', () => {
	test('Next steps as precisely as the date: a day, a month, else a year; nothing with no present', () => {
		assert.deepEqual(chronicleStep({ year: 3, month: 2, day: 9 }), {
			by: 1,
			unit: 'days',
			label: 'Next day',
		})
		assert.deepEqual(chronicleStep({ year: 3, month: 2 }), {
			by: 1,
			unit: 'months',
			label: 'Next month',
		})
		assert.deepEqual(chronicleStep({ year: 3 }), { by: 1, unit: 'years', label: 'Next year' })
		assert.equal(chronicleStep(null), null)
	})

	test('Move the clock… starts from the present and reads back its shape, never the calendar', () => {
		const draft = chronicleClockDraft({ year: 412, month: 3, day: 5, hour: 22, minute: 30 })
		assert.deepEqual(draft, { year: '412', month: '3', day: '5', hour: '22', minute: '30' })
		assert.deepEqual(chronicleClockFromDraft(draft), {
			to: { year: 412, month: 3, day: 5, hour: 22, minute: 30 },
		})
		assert.deepEqual(chronicleClockDraft(null), {
			year: '',
			month: '',
			day: '',
			hour: '',
			minute: '',
		})
		assert.deepEqual(chronicleClockFromDraft({ ...draft, minute: '' }).to, {
			year: 412,
			month: 3,
			day: 5,
			hour: 22,
			minute: 0,
		})
		assert.deepEqual(
			chronicleClockFromDraft({ year: '-12', month: '', day: '', hour: '', minute: '' }),
			{ to: { year: -12 } },
		)
		assert.equal(
			chronicleClockFromDraft({ ...draft, year: ' ' }).problem,
			'Give the clock a year.',
		)
		assert.equal(
			chronicleClockFromDraft({ ...draft, month: '3.5' }).problem,
			'Write each part as a whole number.',
		)
		assert.equal(
			chronicleClockFromDraft({ ...draft, month: '' }).problem,
			'A day needs a month.',
		)
		assert.equal(
			chronicleClockFromDraft({ ...draft, hour: '' }).problem,
			'A minute needs an hour.',
		)
		// Month 13 is the calendar's to refuse (the page's), not the form's.
		assert.deepEqual(
			chronicleClockFromDraft({ year: '1', month: '13', day: '', hour: '', minute: '' }),
			{ to: { year: 1, month: 13 } },
		)
	})
})

describe('the view', () => {
	test('before an answer it waits; with no lorebook it says so in one line', () => {
		assert.equal(chronicleView(null, CHRONICLE_DEFAULTS, OWNER, t).state, 'loading')
		const none = chronicleView(answer({ lorebookId: null }), CHRONICLE_DEFAULTS, OWNER, t)
		assert.equal(none.state, 'no-book')
		assert.equal(none.empty, 'This session reads no lorebook.')
		assert.equal(none.clock, null)
	})

	test("the owner's clock head: following the line, with Next and Move, no Follow", () => {
		const v = chronicleView(answer(), CHRONICLE_DEFAULTS, OWNER, t)
		assert.equal(v.clock!.date, '5 March, Year 412')
		assert.equal(v.clock!.note, "Following the line's present")
		assert.equal(v.clock!.behind, null)
		assert.deepEqual(v.clock!.step, { by: 1, unit: 'days', label: 'Next day' })
		assert.equal(v.clock!.canMove, true)
		assert.equal(v.clock!.canFollow, false)
	})

	test("an own clock before the line's present: the chip names where the line is, and Follow is offered", () => {
		const v = chronicleView(
			answer({
				clock: {
					present: { year: 410 },
					label: 'Year 410',
					own: true,
					linePresent: { year: 412, month: 3, day: 5 },
					linePresentLabel: '5 March, Year 412',
					behind: true,
				},
			}),
			CHRONICLE_DEFAULTS,
			OWNER,
			t,
		)
		assert.equal(v.clock!.note, "This session's own clock")
		assert.equal(v.clock!.behind, 'The line is at 5 March, Year 412')
		assert.ok(v.clock!.behindTitle)
		assert.deepEqual(v.clock!.step, { by: 1, unit: 'years', label: 'Next year' })
		assert.equal(v.clock!.canFollow, true)
	})

	test('no present at all: no date, no step, still Move', () => {
		const v = chronicleView(
			answer({
				clock: {
					present: null,
					label: '',
					own: false,
					linePresent: null,
					linePresentLabel: '',
					behind: false,
				},
				current: null,
				scenes: [],
				earlier: [],
				earlierTotal: 0,
			}),
			CHRONICLE_DEFAULTS,
			OWNER,
			t,
		)
		assert.equal(v.clock!.date, 'No date yet')
		assert.equal(v.clock!.step, null)
		assert.equal(v.clock!.canMove, true)
		assert.equal(v.now, null)
		assert.equal(v.nowEmpty, 'No history entries yet. Open the lorebook to write the first.')
		assert.equal(v.earlierHead, null)
	})

	test('Now, its scenes in colour order, Summarize and Extend graph — the owner’s', () => {
		const v = chronicleView(answer(), CHRONICLE_DEFAULTS, OWNER, t)
		assert.deepEqual(v.now, {
			id: 9,
			date: '5 March, Year 412',
			firstLine: 'What happened in 412',
			blank: false,
			scenes: '2 scenes',
		})
		assert.deepEqual(
			v.scenes.map((s) => [s.name, s.span, s.swatch]),
			[
				['The duel', '6 lines', 0],
				['Untitled scene', '1 line', 9 % CHRONICLE_SWATCHES],
			],
		)
		assert.equal(v.canWrite, true)
		assert.equal(v.canSummarize, true)
		assert.deepEqual(v.extend && [v.extend.count, v.extend.label], [2, 'Extend graph (2)'])
		assert.equal(
			chronicleView(answer({ ungraphedScenes: 0 }), CHRONICLE_DEFAULTS, OWNER, t).extend,
			null,
		)
		assert.equal(
			chronicleView(answer({ opensScenes: false }), CHRONICLE_DEFAULTS, OWNER, t)
				.canSummarize,
			false,
		)
		assert.equal(
			chronicleView(answer({ scenes: [] }), CHRONICLE_DEFAULTS, OWNER, t).scenesEmpty,
			'No scenes from this session under it yet.',
		)
	})

	test('Earlier: newest first, cut at earlierCount, with how many more the lorebook holds', () => {
		const many = Array.from({ length: 12 }, (_, i) => entry(100 - i, 411 - i))
		const v = chronicleView(
			answer({ earlier: many, earlierTotal: 30 }),
			{ clock: true, earlierCount: 5 },
			OWNER,
			t,
		)
		assert.equal(v.earlierHead, 'Earlier (30)')
		assert.deepEqual(
			v.earlier.map((e) => e.id),
			[100, 99, 98, 97, 96],
		)
		assert.equal(v.earlierMore, '25 more in the lorebook')
		const blank = chronicleView(answer(), CHRONICLE_DEFAULTS, OWNER, t).earlier[1]!
		assert.deepEqual(
			[blank.firstLine, blank.blank, blank.scenes],
			['Nothing written yet', true, '0 scenes'],
		)
		assert.equal(chronicleView(answer(), CHRONICLE_DEFAULTS, OWNER, t).earlierMore, null)
	})

	test('a guest seat reads, never writes: no step, no Move, no Start, no Summarize, no Extend', () => {
		const v = chronicleView(answer(), CHRONICLE_DEFAULTS, GUEST, t)
		assert.equal(v.clock!.date, '5 March, Year 412')
		assert.equal(v.clock!.step, null)
		assert.equal(v.clock!.canMove, false)
		assert.equal(v.canWrite, false)
		assert.equal(v.canSummarize, false)
		assert.equal(v.extend, null)
	})

	test("not the lorebook's owner: the clock alone, and one line where the history would be", () => {
		const v = chronicleView(
			answer({
				ownerOnly: true,
				current: null,
				scenes: [],
				earlier: [],
				earlierTotal: 0,
				ungraphedScenes: 0,
			}),
			CHRONICLE_DEFAULTS,
			OWNER,
			t,
		)
		assert.equal(v.state, 'ready')
		assert.equal(v.clock!.canMove, false)
		assert.match(v.ownerOnly!, /lorebook owner's/)
		assert.equal(v.now, null)
		assert.equal(v.nowEmpty, null)
	})

	test('clock off: no head, the rest as before', () => {
		const v = chronicleView(answer(), { clock: false, earlierCount: 10 }, OWNER, t)
		assert.equal(v.clock, null)
		assert.equal(v.now!.id, 9)
	})
})

describe('🚧 live scenes (PROPOSAL-live-scenes §7, lane D)', () => {
	const open = {
		id: 3,
		name: 'Scene 3 · Day 12',
		channel: 'main',
		since: 'Day 12',
		lineCount: 9,
		order: 2,
		cast: [
			{ name: 'Vell', evidence: 'spoke 4 times' },
			{ name: 'Mara', evidence: 'named twice' },
		],
	}
	const live = (over: Partial<HistoryEntriesV1> = {}) =>
		answer({
			scenes: [
				{ id: 1, name: 'The duel', lineCount: 6, order: 0, summarized: true, graphed: false, summaryStatus: 'done' },
				{ id: 2, name: 'Scene 2', lineCount: 4, order: 1, summarized: false, graphed: false, summaryStatus: 'failed' },
				{ id: 3, name: 'Scene 3 · Day 12', lineCount: 9, order: 2, summarized: false, graphed: false, summaryStatus: 'none' },
			],
			openScene: open,
			summaryMode: 'onRequest',
			unsummarizedScenes: 1,
			...over,
		})

	test('the Open scene card: name, since when, its lines, the proposed cast with evidence, Close and Close and summarize', () => {
		const v = chronicleView(live(), CHRONICLE_DEFAULTS, OWNER, t)
		assert.deepEqual(v.openScene, {
			id: 3,
			name: 'Scene 3 · Day 12',
			since: 'since Day 12',
			span: '9 lines',
			swatch: 2,
			cast: open.cast,
			canClose: true,
			canCloseAndSummarize: true,
			note: null,
		})
		assert.equal(chronicleView(live({ openScene: null }), CHRONICLE_DEFAULTS, OWNER, t).openScene, null)
		assert.equal(chronicleView(answer(), CHRONICLE_DEFAULTS, OWNER, t).openScene, null, 'a host from before the field')
	})

	test('each row: its dot, and Summarize only where the summary is not written, not running and the scene is closed', () => {
		const v = chronicleView(live(), CHRONICLE_DEFAULTS, OWNER, t)
		assert.deepEqual(
			v.scenes.map((s) => [s.id, s.status, s.statusLabel, s.open, s.canSummarize]),
			[
				[1, 'done', 'Summarized', false, false],
				[2, 'failed', 'The summary failed', false, true],
				[3, 'none', 'Not summarized', true, false],
			],
		)
		assert.equal(
			chronicleView(answer(), CHRONICLE_DEFAULTS, OWNER, t).scenes[0]!.status,
			'done',
			'a summary written before the status existed reads done',
		)
		assert.deepEqual(v.summarizeAll && [v.summarizeAll.count, v.summarizeAll.label], [1, 'Summarize all (1)'])
		assert.equal(chronicleView(live({ unsummarizedScenes: 0 }), CHRONICLE_DEFAULTS, OWNER, t).summarizeAll, null)
	})

	test('🚧 a finished run waiting for review (§15 G8): its own dot and Ready to review, never Summarize', () => {
		const reviewing = live({
			scenes: [
				{ id: 4, name: 'Scene 4', lineCount: 3, order: 0, summarized: true, graphed: false, summaryStatus: 'review' },
				{ id: 5, name: 'Scene 5', lineCount: 2, order: 1, summarized: false, graphed: false, summaryStatus: 'failed' },
			],
			openScene: null,
		})
		const v = chronicleView(reviewing, CHRONICLE_DEFAULTS, OWNER, t)
		assert.deepEqual(
			v.scenes.map((s) => [s.id, s.status, s.statusLabel, s.canSummarize, s.canReview]),
			[
				[4, 'review', 'Ready to review', false, true],
				[5, 'failed', 'The summary failed', true, false],
			],
		)
	})

	test('On close: Close summarizes by itself, so no Close and summarize — and the card says so', () => {
		const v = chronicleView(live({ summaryMode: 'onClose' }), CHRONICLE_DEFAULTS, OWNER, t)
		assert.equal(v.openScene!.canClose, true)
		assert.equal(v.openScene!.canCloseAndSummarize, false)
		assert.equal(v.openScene!.note, 'Its summary runs when it closes.')
	})

	test('Never: no Summarize anywhere — not on a row, not all, not with the close', () => {
		const v = chronicleView(live({ summaryMode: 'never' }), CHRONICLE_DEFAULTS, OWNER, t)
		assert.equal(v.summarizeAll, null)
		assert.ok(v.scenes.every((s) => !s.canSummarize))
		assert.equal(v.openScene!.canCloseAndSummarize, false)
		assert.equal(v.openScene!.note, null)
		assert.equal(v.openScene!.canClose, true)
	})

	test('a guest reads the card and the dots, and presses nothing', () => {
		const v = chronicleView(live(), CHRONICLE_DEFAULTS, GUEST, t)
		assert.equal(v.openScene!.canClose, false)
		assert.equal(v.openScene!.canCloseAndSummarize, false)
		assert.equal(v.summarizeAll, null)
		assert.ok(v.scenes.every((s) => !s.canSummarize))
	})

	test('its two new requests are core’s alone', () => {
		assert.equal(WIDGET_REQUEST_ASKERS['summarize-scenes'], 'core')
		assert.equal(WIDGET_REQUEST_ASKERS['decide-scene-cue'], 'core')
	})
})
