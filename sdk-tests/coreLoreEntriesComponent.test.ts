/**
 * Core's Lore entries as the component it ships as (R21): the BUILT module
 * (`core-catalog/dist/components/lore-entries.js`), run in a worker and
 * mirrored through the host-element vocabulary as core's box. It reads its
 * settings alone and asks the page for everything else — every flow here is
 * a `session-entries` or a `set-entry-marks` the harness answers as the page
 * does, with the page's own refusals.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionEntryV1, WidgetRequests } from '@serene-pub/sdk'
import { mountComponent, type MountedComponent } from '../cli/src/testing.js'
import { coreComponentEntry } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const BUILT = 'dist/components/lore-entries.js'

type Ask = WidgetRequests['session-entries']['params']
type Answer = WidgetRequests['session-entries']['result']

const HOUR = 3600_000
const entry = (id: number, title: string, over: Partial<SessionEntryV1> = {}): SessionEntryV1 => ({
	id,
	typeId: 'core:lore',
	title,
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

/** A small book, as the page would page it. */
function book() {
	const rows: SessionEntryV1[] = [
		entry(1, 'Mira', {
			keys: ['mira', 'the smith'],
			timesJudged: 4,
			timesIncluded: 3,
			lastJudgedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
			lastIncluded: true,
			lastRank: 2,
		}),
		entry(2, 'The Old Mill', { timesJudged: 2, timesIncluded: 0, lastIncluded: false }),
		entry(3, '', { pinned: true }),
	]
	const page = (p: Ask): Answer => {
		const matched = rows.filter(
			(r) =>
				(!p.titleOrKey || `${r.title} ${r.keys.join(' ')}`.toLowerCase().includes(p.titleOrKey.toLowerCase())) &&
				(p.filter === 'pinned' ? r.pinned : p.filter === 'off' ? r.off : p.filter === 'fired' ? r.timesIncluded > 0 : true),
		)
		const offset = p.offset ?? 0
		const limit = p.limit ?? 25
		return { lorebookId: 7, bookName: 'Vale', ownerOnly: false, rows: matched.slice(offset, offset + limit), total: matched.length, offset }
	}
	const mark = (p: WidgetRequests['set-entry-marks']['params']) => {
		const r = rows.find((x) => x.id === p.entryId)!
		if (p.off !== undefined) r.off = p.off
		if (p.pinned !== undefined) r.pinned = p.pinned
		return { off: r.off, pinned: r.pinned }
	}
	return { rows, page, mark }
}

const asks = (view: MountedComponent) => view.requested.filter((r) => r.kind === 'session-entries').map((r) => r.params)
const titles = (view: MountedComponent) => view.queryAll('li[data-entry-id] [data-widget-part~="lore-entries.entry-title"]').map((n) => n.textContent?.trim())
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function mountBook(over: { settings?: Record<string, unknown>; requests?: (kind: string, params: Record<string, unknown>) => unknown } = {}) {
	const b = book()
	const view = await mountComponent({
		...(await coreComponentEntry('lore-entries', { root: CORE_CATALOG, entry: BUILT })),
		owner: 'core',
		timeoutMs: 60_000,
		context: { session: { id: 1, name: 'Proof' }, settings: over.settings ?? {}, viewer: { userId: 1, isAdmin: false, isGuest: false } },
		requests:
			(over.requests as never) ??
			((kind, params) => {
				if (kind === 'session-entries') return b.page(params as Ask)
				if (kind === 'set-entry-marks') return b.mark(params as never)
				throw new Error(`not asked: ${kind}`)
			}),
	})
	await view.settle()
	return { view, b }
}

test("core's Lore entries pages the book through 'session-entries' and draws what the page answered", { timeout: 120_000 }, async () => {
	const { view } = await mountBook({ settings: { sort: 'rank', pageSize: 2 } })
	try {
		assert.deepEqual(view.refused, [])
		// One ask, with the widget's settings, and nothing it did not choose.
		assert.deepEqual(asks(view), [{ sort: 'rank', filter: 'all', offset: 0, limit: 2 }])
		assert.deepEqual(titles(view), ['Mira', 'The Old Mill'])
		const text = view.root.textContent ?? ''
		assert.match(text, /mira, the smith/)
		assert.match(text, /read 3 of 4 · last at rank 2 · 2h ago/)
		assert.match(text, /read 0 of 2 · left out last time/)
		assert.equal(view.query('input[type="text"]')?.getAttribute('placeholder'), 'Search 3 entries')
		assert.match(text, /1–2 of 3/)

		// The four filters are one radio group — one name, unique to this mount,
		// and the box's own: core's widgets' names are prefixed per box, as the page does.
		const radios = view.queryAll('input[type="radio"]')
		assert.equal(radios.length, 4)
		const names = new Set(radios.map((r) => r.getAttribute('name')))
		assert.equal(names.size, 1)
		assert.ok(view.idPrefix.length > 0)
		assert.match([...names][0]!, new RegExp(`^${view.idPrefix}sp-lore-filter-[a-z0-9]+$`))
		assert.equal(view.query('[role="radiogroup"]')?.getAttribute('aria-label'), 'Show')
		// The sort is the host's combobox, holding the settled sort.
		const sort = view.query('sp-combobox')!
		assert.equal(sort.getAttribute('value'), 'rank')
		assert.deepEqual(
			view.queryAll('sp-option').map((o) => [o.getAttribute('value'), o.textContent?.trim()]),
			[
				['lastRead', 'Last read'],
				['timesRead', 'Times read'],
				['rank', 'Rank'],
				['name', 'Name'],
			],
		)

		// Next page: the untitled entry is `Entry #3`, and Pin shows it pinned.
		const next = view.queryAll('button').find((b) => b.textContent?.trim() === 'Next')!
		await view.click(next)
		await view.settle()
		assert.deepEqual(asks(view).at(-1), { sort: 'rank', filter: 'all', offset: 2, limit: 2 })
		assert.deepEqual(titles(view), ['Entry #3'])
		assert.equal(view.query('button[aria-label="Pin entry 3"]')?.getAttribute('aria-pressed'), 'true')

		// A filter asks from the first page.
		await view.check(`input[type="radio"][value="pinned"]`)
		await view.settle()
		assert.deepEqual(asks(view).at(-1), { sort: 'rank', filter: 'pinned', offset: 0, limit: 2 })
		// The combobox's `label` is the one "Sort": the host draws it visibly,
		// so the widget draws no second one beside it.
		assert.equal(view.query('sp-combobox')?.getAttribute('label'), 'Sort')
		assert.equal(
			[...view.root.querySelectorAll('*')].some((el) => el.localName !== 'sp-option' && el.childElementCount === 0 && el.textContent?.trim() === 'Sort'),
			false,
		)
		// The markup carries parts, never a class (P3d): the sheet draws them.
		assert.equal(view.query('sp-combobox')?.getAttribute('data-widget-part'), 'lore-entries.sort-field')
		assert.equal(view.query('[class]:not(sp-icon):not(sp-combobox):not(sp-option)'), null)
		// The sort, by the combobox's own `change`.
		await view.dispatch('sp-combobox', 'change', { value: 'name' })
		await view.settle()
		assert.deepEqual(asks(view).at(-1), { sort: 'name', filter: 'pinned', offset: 0, limit: 2 })
		assert.equal(view.query('sp-combobox')?.getAttribute('value'), 'name')
		await view.check(`input[type="radio"][value="all"]`)
		await view.settle()

		// The search asks once typing pauses, as `titleOrKey` — never `query`.
		const before = asks(view).length
		await view.input('input[type="text"]', 'smi')
		await view.settle()
		assert.equal(asks(view).length, before)
		await pause(350)
		await view.settle()
		assert.deepEqual(asks(view).at(-1), { titleOrKey: 'smi', sort: 'name', filter: 'all', offset: 0, limit: 2 })
		assert.deepEqual(titles(view), ['Mira'])
		assert.equal(view.requested.some((r) => 'query' in r.params), false)
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
})

test('a mark goes through set-entry-marks, shows as it now stands, and the page is asked again', { timeout: 120_000 }, async () => {
	const { view } = await mountBook()
	try {
		const pin = view.query('button[aria-label="Pin Mira"]')!
		assert.equal(pin.getAttribute('aria-pressed'), 'false')
		const asked = asks(view).length
		await view.click(pin)
		await view.settle()
		assert.deepEqual(view.requested.filter((r) => r.kind === 'set-entry-marks').map((r) => r.params), [{ entryId: 1, pinned: true }])
		assert.equal(view.query('button[aria-label="Pin Mira"]')?.getAttribute('aria-pressed'), 'true')
		assert.equal(asks(view).length, asked + 1)
		await view.click('button[aria-label="Turn Mira off"]')
		await view.settle()
		assert.deepEqual(view.requested.filter((r) => r.kind === 'set-entry-marks').at(-1)?.params, { entryId: 1, off: true })
		assert.equal(view.query('button[aria-label="Turn Mira off"]')?.getAttribute('aria-pressed'), 'true')
		// Off is the entry's own state, for the sheet to strike its title through.
		assert.equal(view.query('li[data-entry-id="1"]')?.getAttribute('data-off'), '')
		assert.equal(view.query('li[data-entry-id="2"]')?.hasAttribute('data-off'), false)
		assert.equal(view.query('[role="alert"]') === null, true)
	} finally {
		await view.unmount()
	}
})

test("a refused mark is said in this widget, in words — never the host's error channel", { timeout: 120_000 }, async () => {
	const b = book()
	const { view } = await mountBook({
		requests: (kind, params) => {
			if (kind === 'session-entries') return b.page(params as Ask)
			throw new Error('only the book’s owner may mark its entries')
		},
	})
	try {
		await view.click('button[aria-label="Pin Mira"]')
		await view.settle()
		assert.equal(view.query('[role="alert"]')?.textContent?.trim(), 'Not changed: only the book’s owner may mark its entries')
		assert.equal(view.query('button[aria-label="Pin Mira"]')?.getAttribute('aria-pressed'), 'false')
		assert.deepEqual(view.errors, [])
		// The line goes with the view it was said over: another filter drops it.
		await view.check(`input[type="radio"][value="pinned"]`)
		await view.settle()
		assert.equal(view.query('[role="alert"]') === null, true)
	} finally {
		await view.unmount()
	}
})

test("'lore:marked' on an entry shown asks the page again; on one not shown it does not", { timeout: 120_000 }, async () => {
	const { view, b } = await mountBook()
	try {
		const before = asks(view).length
		// Marked elsewhere (another tab): the row changes under this widget.
		b.rows[0]!.pinned = true
		await view.event({ kind: 'lore:marked', entryId: 99 })
		await view.settle()
		assert.equal(asks(view).length, before, 'an entry not on screen asks nothing')
		await view.event({ kind: 'lore:marked', entryId: 1 })
		await view.settle()
		assert.equal(asks(view).length, before + 1)
		assert.equal(view.query('button[aria-label="Pin Mira"]')?.getAttribute('aria-pressed'), 'true')
	} finally {
		await view.unmount()
	}
})

test("'lore:ranked' asks the page again (R81); the refresh button does too", { timeout: 120_000 }, async () => {
	const { view } = await mountBook()
	try {
		const n = asks(view).length
		await view.event({ kind: 'lore:ranked' })
		await view.settle()
		assert.equal(asks(view).length, n + 1)
		await view.event({ kind: 'message:created', messageId: 9 })
		await view.settle()
		assert.equal(asks(view).length, n + 1)
		await view.click('button[aria-label="Refresh"]')
		await view.settle()
		assert.equal(asks(view).length, n + 2)
		assert.deepEqual(asks(view).at(-1), asks(view)[0])
	} finally {
		await view.unmount()
	}
})

test('a settings push re-asks with the new page size; a push that changes nothing it reads asks nothing', { timeout: 120_000 }, async () => {
	const { view } = await mountBook({ settings: { pageSize: 2 } })
	try {
		const n = asks(view).length
		await view.push('messages', [])
		await view.push('settings', { pageSize: 2 })
		await view.settle()
		assert.equal(asks(view).length, n)
		await view.push('settings', { pageSize: 5 })
		await view.settle()
		assert.equal(asks(view).length, n + 1)
		assert.equal(asks(view).at(-1)?.limit, 5)
		assert.deepEqual(titles(view), ['Mira', 'The Old Mill', 'Entry #3'])
		assert.equal(view.root.textContent?.includes('of 3'), false)
	} finally {
		await view.unmount()
	}
})

test('only the newest ask is shown: an older answer that lands last is dropped (its own guard)', { timeout: 120_000 }, async () => {
	const b = book()
	const pending: Array<{ params: Ask; settle: () => void }> = []
	const { view } = await mountBook({
		requests: (kind, params) => {
			if (kind !== 'session-entries') return b.mark(params as never)
			return new Promise((res) => pending.push({ params: params as Ask, settle: () => res(b.page(params as Ask)) }))
		},
	})
	try {
		assert.equal(pending.length, 1)
		await view.check('input[type="radio"][value="pinned"]')
		await view.settle()
		assert.equal(pending.length, 2)
		// The newer answers first, then the older one lands.
		pending[1]!.settle()
		await view.settle()
		assert.deepEqual(titles(view), ['Entry #3'])
		pending[0]!.settle()
		await view.settle()
		assert.deepEqual(titles(view), ['Entry #3'])
	} finally {
		await view.unmount()
	}
})

test('the three answers that are not a list: owner only, no lorebook, and a read the page refused', { timeout: 120_000 }, async () => {
	const answers: Array<[unknown, RegExp]> = [
		[{ lorebookId: 7, ownerOnly: true, rows: [], total: 0, offset: 0 }, /These entries are the lorebook owner's to manage\./],
		[{ lorebookId: null, ownerOnly: false, rows: [], total: 0, offset: 0 }, /This session reads no lorebook\./],
	]
	for (const [answer, says] of answers) {
		const { view } = await mountBook({ requests: () => answer })
		try {
			assert.match(view.root.textContent ?? '', says)
			assert.equal(view.query('input') === null, true)
		} finally {
			await view.unmount()
		}
	}
	const { view } = await mountBook({
		requests: () => {
			throw new Error('the lore entries did not arrive: the server did not answer')
		},
	})
	try {
		assert.equal(view.query('[role="alert"]')?.textContent?.trim(), 'the lore entries did not arrive: the server did not answer')
		assert.deepEqual(view.errors, [])
	} finally {
		await view.unmount()
	}
	// An empty book, and an empty search, say different things.
	const empty = await mountBook({ requests: () => ({ lorebookId: 7, ownerOnly: false, rows: [], total: 0, offset: 0 }) })
	try {
		assert.match(empty.view.root.textContent ?? '', /This lorebook has no entries yet\./)
		await empty.view.check('input[type="radio"][value="off"]')
		await empty.view.settle()
		assert.match(empty.view.root.textContent ?? '', /Nothing matches\./)
	} finally {
		await empty.view.unmount()
	}
})

test("a plugin's box without 'lore' is not answered 'session-entries', nor told 'lore:ranked'", { timeout: 120_000 }, async () => {
	let answered = 0
	const view = await mountComponent({
		...(await coreComponentEntry('lore-entries', { root: CORE_CATALOG, entry: BUILT })),
		owner: 'acme.game',
		grants: [],
		timeoutMs: 60_000,
		context: { settings: {} },
		requests: () => {
			answered++
			return { lorebookId: 7, ownerOnly: false, rows: [], total: 0, offset: 0 }
		},
	})
	try {
		await view.settle()
		assert.equal(answered, 0)
		assert.equal(asks(view).length, 1)
		assert.ok(view.query('[role="alert"]'), 'the refusal is said in the widget')
		await view.event({ kind: 'lore:ranked' })
		await view.settle()
		assert.equal(asks(view).length, 1)
	} finally {
		await view.unmount()
	}
})
