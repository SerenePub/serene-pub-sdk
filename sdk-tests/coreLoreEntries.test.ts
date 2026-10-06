/**
 * The plain-TypeScript half of core's Lore entries widget
 * (`@serene-pub/core-catalog/lore-entries`, R21): its settings, the line
 * under an entry, the page span and the latest-ask guard.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionEntryV1 } from '@serene-pub/sdk'
import {
	LORE_ENTRIES_DEFAULTS,
	createLatestAsk,
	loreEntriesEmptyLine,
	loreEntriesSpan,
	loreEntryAgo,
	loreEntryName,
	loreEntryReadLine,
	readLoreEntriesSettings,
} from '../core-catalog/src/shared/ui/lore-entries/index.js'
import { CORE_WIDGETS } from '../core-catalog/src/index.js'

const en = (s: string) => s
const NOW = Date.parse('2026-09-25T12:00:00Z')
const row = (over: Partial<SessionEntryV1> = {}): SessionEntryV1 => ({
	id: 4,
	typeId: 'core:lore',
	title: 'Mira',
	keys: [],
	off: false,
	pinned: false,
	timesJudged: 0,
	timesIncluded: 0,
	lastJudgedAt: null,
	lastIncluded: null,
	lastReason: null,
	lastRank: null,
	...over,
})

describe('readLoreEntriesSettings', () => {
	test("the declared defaults are the widget's declaration's", () => {
		const decl = CORE_WIDGETS.find((w) => w.id === 'lore-entries')!
		const s = decl.settings as Record<string, { default: unknown }>
		assert.deepEqual(LORE_ENTRIES_DEFAULTS, { sort: s.sort!.default, pageSize: s.pageSize!.default })
		assert.deepEqual(readLoreEntriesSettings(undefined), LORE_ENTRIES_DEFAULTS)
	})
	test('an unknown sort or a page size that is not a whole count falls back', () => {
		assert.deepEqual(readLoreEntriesSettings({ sort: 'rank', pageSize: 10 }), { sort: 'rank', pageSize: 10 })
		assert.deepEqual(readLoreEntriesSettings({ sort: 'loudness', pageSize: 0 }), LORE_ENTRIES_DEFAULTS)
		assert.deepEqual(readLoreEntriesSettings({ pageSize: 2.5 }), LORE_ENTRIES_DEFAULTS)
	})
})

describe('the line under an entry', () => {
	test('how long ago, from now', () => {
		const ago = (ms: number) => loreEntryAgo(new Date(NOW - ms).toISOString(), NOW, en)
		assert.equal(ago(10_000), 'just now')
		assert.equal(ago(5 * 60_000), '5m ago')
		assert.equal(ago(3 * 3600_000), '3h ago')
		assert.equal(ago(2 * 86400_000), '2d ago')
		assert.equal(loreEntryAgo(null, NOW, en), null)
		assert.equal(loreEntryAgo('not a date', NOW, en), null)
	})
	test('never read, read at a rank, left out — through the translation', () => {
		assert.equal(loreEntryReadLine(row(), NOW, en), 'Not read in this session yet')
		assert.equal(
			loreEntryReadLine(
				row({ timesJudged: 4, timesIncluded: 3, lastIncluded: true, lastRank: 2, lastJudgedAt: new Date(NOW - 7200_000).toISOString() }),
				NOW,
				en,
			),
			'read 3 of 4 · last at rank 2 · 2h ago',
		)
		assert.equal(loreEntryReadLine(row({ timesJudged: 2, lastIncluded: false }), NOW, en), 'read 0 of 2 · left out last time')
		const fr = (s: string) => ({ 'read {included} of {judged}': 'lu {included} sur {judged}' })[s] ?? s
		assert.equal(loreEntryReadLine(row({ timesJudged: 2, timesIncluded: 1 }), NOW, fr), 'lu 1 sur 2')
	})
	test("an untitled entry is named by its id; an empty page says why", () => {
		assert.equal(loreEntryName(row({ title: '' }), en), 'Entry #4')
		assert.equal(loreEntryName(row(), en), 'Mira')
		assert.equal(loreEntriesEmptyLine('', 'all', en), 'This lorebook has no entries yet.')
		assert.equal(loreEntriesEmptyLine(' mi ', 'all', en), 'Nothing matches.')
		assert.equal(loreEntriesEmptyLine('', 'off', en), 'Nothing matches.')
	})
})

test('the page span', () => {
	assert.deepEqual(loreEntriesSpan(0, 25, 3), {
		from: 1,
		to: 3,
		total: 3,
		paged: false,
		hasPrevious: false,
		hasNext: false,
		previousOffset: 0,
		nextOffset: 25,
	})
	const mid = loreEntriesSpan(2, 2, 5)
	assert.deepEqual([mid.from, mid.to, mid.paged, mid.hasPrevious, mid.hasNext, mid.previousOffset, mid.nextOffset], [3, 4, true, true, true, 0, 4])
	assert.equal(loreEntriesSpan(4, 2, 5).hasNext, false)
})

test('the latest-ask guard: only the newest ticket is current', () => {
	const g = createLatestAsk()
	const a = g.next()
	assert.equal(g.isLatest(a), true)
	const b = g.next()
	assert.equal(g.isLatest(a), false)
	assert.equal(g.isLatest(b), true)
	// Two guards never share tickets' currency.
	const h = createLatestAsk()
	h.next()
	h.next()
	assert.equal(g.isLatest(b), true)
})
