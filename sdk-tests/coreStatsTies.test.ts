/**
 * 🚧 Screen 2 of "Ties on the graph" (lane T2, 2026-10-23): the stock Stats
 * widget draws an owner's tie sides — whom each is towards, the relationship's
 * name and this side's words as chips, this side's number as a bar where the
 * host sent it, the other person's side as words (its number once shown),
 * and the holder's switch that shows this side's number: ONE
 * `set-tie-shown` request. The game master's sheet carries both sides'
 * numbers, as the host sends them. A ruleset never ships a widget.
 *
 * Mounted from source, as `coreStatsPieces` mounts it.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionStateV1 } from '@serene-pub/sdk'
import { mountComponent, type MountedComponent } from '../cli/src/testing.js'
import { tieBarPercent, tieRowsOf } from '../core-catalog/src/shared/ui/session-state/index.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const SESSION_STATE_SOURCE = resolve(CORE_CATALOG, 'src', 'shared', 'ui', 'session-state', 'index.ts')

const bond = (over: Record<string, unknown> = {}) => ({
	entryType: 'bond',
	label: 'Bond',
	towards: 'player-seat:2',
	towardsLabel: 'Mara',
	name: 'crush',
	words: [{ field: 'standing', label: 'Standing', value: 'warm', onto: true }],
	numbers: [{ field: 'affection', label: 'Affection', value: 7, min: 0, max: 10 }],
	shown: false,
	mayShow: true,
	other: { words: [{ field: 'standing', label: 'Standing', value: 'close', onto: true }], shown: false },
	...over,
})

const state = (wren: Record<string, unknown>, mara: Record<string, unknown> = {}): SessionStateV1 =>
	({
		sessionId: 1,
		loaded: true,
		error: null,
		resolved: { world: {}, cast: { 'player_seat:1': { 'core.mood': 'giddy' }, 'player_seat:2': { 'core.mood': 'warm' } } },
		slots: [{ slotId: 'core:slot/mood@1', key: 'mood', qualifiedKey: 'core.mood', label: 'Mood', type: 'text', appliesTo: ['cast'] }],
		owners: [
			{ key: 'world', kind: 'session', id: 1, label: 'World', configs: {} },
			{ key: 'player_seat:1', kind: 'player_seat', id: 1, label: 'Wren', seat: true, configs: { 'core:slot/mood@1': {} }, ...wren },
			{ key: 'player_seat:2', kind: 'player_seat', id: 2, label: 'Mara', seat: true, configs: { 'core:slot/mood@1': {} }, ...mara },
		],
	}) as unknown as SessionStateV1

async function mount(s: SessionStateV1, settings: Record<string, unknown> = {}): Promise<MountedComponent> {
	return mountComponent({
		root: CORE_CATALOG,
		entry: 'components/shared/stats/stats.ts',
		alias: { '@serene-pub/core-catalog/session-state': SESSION_STATE_SOURCE },
		owner: 'core',
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'The pier' },
			settings: { trail: false, ...settings },
			viewer: { userId: 2, isAdmin: false, isGuest: true },
			scoped: { session_state: s },
		},
	} as never)
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()

describe('ties, read (session-state)', () => {
	test('a tie row is read defensively; a bar is its share of its bounds', () => {
		const rows = tieRowsOf({ key: 'x', kind: 'player_seat', id: 1, label: 'Wren', configs: {}, ties: [bond(), { towards: 3 }, null] } as never)
		assert.equal(rows.length, 1)
		assert.equal(rows[0]!.towardsLabel, 'Mara')
		assert.deepEqual(rows[0]!.other?.words.map((w) => w.value), ['close'])
		assert.equal(tieBarPercent({ value: 7, min: 0, max: 10 }), 70)
		assert.equal(tieBarPercent({ value: 'warm' }), 0)
		assert.deepEqual(tieRowsOf({ key: 'x', kind: 'player_seat', id: 1, label: 'Wren', configs: {} } as never), [])
	})
})

describe('the Stats widget draws ties (screen 2)', () => {
	test("the viewer's own side: its words, its number, the other side as words, and the switch — one set-tie-shown", async () => {
		const view = await mount(state({ mine: true, ties: [bond()] }), { owners: 'mine' })
		try {
			const row = '[data-widget-part~="stats.tie"][data-tie-towards="player-seat:2"]'
			assert.ok(view.query(row), 'the tie is drawn')
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.tie-name"]`)), 'Mara')
			assert.deepEqual(view.queryAll(`${row} [data-widget-part~="stats.tie-chip"]`).map((c) => text(c)), ['crush', 'warm'])
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.tie-number-label"]`)), 'Your affection')
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.tie-number-value"]`)), '7 of 10')
			assert.equal(view.query(`${row} [data-widget-part~="stats.tie-bar"]`)?.getAttribute('aria-label'), 'Affection 7 of 10')
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.tie-other"]`)), 'How Mara feels close')
			await view.click(view.query(`${row} [data-widget-part~="stats.tie-show"] input`)!)
			const asked = view.requested.find((r) => r.kind === 'set-tie-shown')
			assert.ok(asked, 'set-tie-shown was asked')
			assert.deepEqual(asked!.params, { owner: { kind: 'player_seat', id: 1 }, entryType: 'bond', towards: 'player-seat:2', shown: true })
		} finally {
			await view.unmount()
		}
	})

	test("another's sheet: no switch, no number the host withheld; the other side's number once shown", async () => {
		const shownBack = bond({ numbers: undefined, mayShow: false, other: { words: [{ field: 'standing', label: 'Standing', value: 'wary' }], numbers: [{ field: 'affection', label: 'Affection', value: 2, min: 0, max: 10 }], shown: true } })
		const view = await mount(state({}, { ties: [{ ...shownBack, towards: 'player-seat:1', towardsLabel: 'Wren' }] }), { owners: 'seats' })
		try {
			const row = '[data-widget-part~="stats.tie"][data-tie-towards="player-seat:1"]'
			assert.ok(view.query(row))
			assert.equal(view.query(`${row} [data-widget-part~="stats.tie-show"]`), null)
			assert.equal(view.query(`${row} [data-widget-part~="stats.tie-number"]`), null)
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.tie-other-words"]`)), 'wary · affection 2 of 10')
			assert.equal(text(view.query(`${row} [data-widget-part~="stats.tie-other-note"]`)), 'Wren showed their side.')
		} finally {
			await view.unmount()
		}
	})
})
