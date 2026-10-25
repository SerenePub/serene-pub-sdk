/**
 * 🚧 RF fix 8 (owner, 2026-10-23: "make sure the stats widget also properly
 * pulls from the ruleset and can display all types"): the stock Stats
 * widget draws ONLY the session's rules' attributes, each by its kind and
 * shown-as hint — a number as a bar, a count or a badge; a pool as pips or a
 * bar; a tally as a count; a word as a badge or words; a list; free text over
 * several lines — what an owner holds zone by zone (a list, a fan), and the
 * host's place and time in a **Where and when** row of their own; a genre's
 * tool state only where a copy shows it. A hint the widget does not know is
 * the kind's default. Rules that declare no attributes say so. A holder
 * switches an optional attribute from the sheet too: ONE `set-attribute-carry`.
 *
 * Mounted from source, as `coreStatsTies` mounts it.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
// ⚠ Never hand a DOM node to an assertion (2026-10-18): presence is `assert.ok(…)`, absence `assert.ok(!…)`.
import { resolve } from 'node:path'
import type { SessionStateV1 } from '@serene-pub/sdk'
import { mountComponent, type MountedComponent } from '../cli/src/testing.js'
import { carryRowsOf, drawnAs, pipsOf, zoneRowsOf } from '../core-catalog/src/shared/ui/session-state/index.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const SESSION_STATE_SOURCE = resolve(CORE_CATALOG, 'src', 'shared', 'ui', 'session-state', 'index.ts')

const id = (key: string) => `acme:slot/${key}@1`
const slot = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
	slotId: id(key),
	key,
	qualifiedKey: `acme.${key}`,
	label: key[0]!.toUpperCase() + key.slice(1),
	type,
	appliesTo: ['cast'],
	...extra,
})

/** One fixture rules declaring every kind and every hint — and one hint nobody knows. */
const EVERY_KIND = [
	slot('vigour', 'integer', { kind: 'number', shownAs: 'bar' }),
	slot('coin', 'integer', { kind: 'number', shownAs: 'count' }),
	slot('rank', 'integer', { kind: 'number', shownAs: 'badge' }),
	slot('nerve', 'integer', { kind: 'pool', shownAs: 'pips' }),
	slot('favour', 'integer', { kind: 'pool', shownAs: 'bar' }),
	slot('marks', 'integer', { kind: 'tally' }),
	slot('humour', 'enum', { kind: 'label', shownAs: 'badge' }),
	slot('oath', 'enum', { kind: 'label', shownAs: 'words' }),
	slot('traits', 'list', { kind: 'list', shownAs: 'list' }),
	slot('vow', 'text', { kind: 'text' }),
	// A package's own hint: the kind's default (a bar).
	slot('luck', 'integer', { kind: 'number', shownAs: 'sparkle' }),
]
const HOST = [
	slot('location', 'text', { hostState: 'place', appliesTo: ['cast', 'world'] }),
	slot('fate', 'enum', { hostState: 'tool' }),
]
const CONFIGS: Record<string, Record<string, unknown>> = {
	[id('vigour')]: { min: 0, max: 10 },
	[id('coin')]: { min: 0 },
	[id('rank')]: { min: 1, max: 5 },
	[id('nerve')]: { min: 0, max: 5 },
	[id('favour')]: { min: 0, max: 6 },
	[id('marks')]: { min: 0 },
	[id('humour')]: { of: ['bright', 'sour'] },
	[id('oath')]: { of: ['sworn', 'broken'] },
	[id('traits')]: {},
	[id('vow')]: {},
	[id('luck')]: { min: 0, max: 3 },
	[id('location')]: {},
	[id('fate')]: { of: ['alive', 'dead'] },
}
const VALUES = {
	'acme.vigour': 7,
	'acme.coin': 42,
	'acme.rank': 3,
	'acme.nerve': 3,
	'acme.favour': 4,
	'acme.marks': 2,
	'acme.humour': 'bright',
	'acme.oath': 'sworn',
	'acme.traits': ['patient', 'loud'],
	'acme.vow': 'Never again.\nNot for anyone.',
	'acme.luck': 1,
	'acme.location': 'The pier',
	'acme.fate': 'alive',
}

const owner = (over: Record<string, unknown> = {}) => ({
	key: 'player_seat:1',
	kind: 'player_seat',
	id: 1,
	label: 'Wren',
	seat: true,
	mine: true,
	configs: CONFIGS,
	zones: [
		{ zoneType: 'carried', label: 'Carried', shownAs: 'list', entries: [{ name: 'Rope', entryType: 'gear', typeLabel: 'Gear', count: 2 }, { name: 'Lamp', entryType: 'gear', typeLabel: 'Gear' }] },
		{ zoneType: 'hand', label: 'Hand', shownAs: 'fan', entries: [{ name: 'Queen of cups', entryType: 'card', exposed: true }] },
	],
	carries: [{ slotId: id('vow'), label: 'Vow', carries: true, mayChange: true }],
	...over,
})

const state = (over: Partial<SessionStateV1> & Record<string, unknown> = {}): SessionStateV1 =>
	({
		sessionId: 1,
		loaded: true,
		error: null,
		resolved: { world: {}, cast: { 'player_seat:1': VALUES } },
		slots: [...EVERY_KIND, ...HOST],
		owners: [{ key: 'world', kind: 'session', id: 1, label: 'World', configs: {} }, owner()],
		storyTime: 'Day 3, 14:00',
		...over,
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
			settings: { trail: false, owners: 'mine', ...settings },
			viewer: { userId: 2, isAdmin: false, isGuest: true },
			scoped: { session_state: s },
		},
	} as never)
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()
const row = (key: string) => `[data-widget-part~="stat-slot.root"][data-slot-id="${id(key)}"]`

describe('every kind, drawn by its hint (read)', () => {
	test('drawnAs: each kind by its hint, a hint it does not take or nobody knows is its default, host state by its shape', () => {
		const as = (key: string) => {
			const s = [...EVERY_KIND, ...HOST].find((x) => x.key === key)!
			return drawnAs(s as never, CONFIGS[id(key)])
		}
		assert.deepEqual(
			['vigour', 'coin', 'rank', 'nerve', 'favour', 'marks', 'humour', 'oath', 'traits', 'vow', 'luck', 'location', 'fate'].map(as),
			['bar', 'count', 'badge', 'pips', 'bar', 'count', 'badge', 'words', 'list', 'words', 'bar', 'words', 'badge'],
		)
		// A pool too large to count at a glance is a bar; a bar with no most is a count.
		assert.equal(drawnAs({ type: 'integer', kind: 'pool', shownAs: 'pips' } as never, { min: 0, max: 20 }), 'bar')
		assert.equal(drawnAs({ type: 'integer', kind: 'number', shownAs: 'bar' } as never, { min: 0 }), 'count')
		// A tally takes no bar; a word no pips.
		assert.equal(drawnAs({ type: 'integer', kind: 'tally', shownAs: 'bar' } as never, { min: 0, max: 5 }), 'count')
		assert.equal(drawnAs({ type: 'enum', kind: 'label', shownAs: 'pips' } as never, {}), 'badge')
		assert.deepEqual(pipsOf(3, { min: 0, max: 5 }), { filled: 3, total: 5 })
		assert.equal(pipsOf(3, { min: 0, max: 50 }), null)
	})

	test('zones and carries are read defensively', () => {
		const rows = zoneRowsOf(owner({ zones: [...(owner().zones as unknown[]), { zoneType: 'empty', entries: [] }, { entries: 3 }, null] }) as never)
		assert.deepEqual(rows.map((z) => [z.zoneType, z.shownAs, z.entries.map((e) => `${e.name}×${e.count}`)]), [
			['carried', 'list', ['Rope×2', 'Lamp×1']],
			['hand', 'fan', ['Queen of cups×1']],
		])
		assert.deepEqual(carryRowsOf(owner({ carries: [{ slotId: 'x', label: '' }, null, ...(owner().carries as unknown[])] }) as never).map((c) => [c.label, c.carries, c.mayChange]), [['Vow', true, true]])
	})
})

describe('the Stats widget draws every kind from the rules (RF fix 8)', () => {
	test('each attribute by its kind and hint; Where and when apart; zones as a list and a fan; tool state hidden where a copy hides it', async () => {
		const view = await mount(state(), { toolState: 'hidden' })
		try {
			const shownAs = (key: string) => view.query(row(key))?.getAttribute('data-shown-as')
			assert.deepEqual(
				['vigour', 'coin', 'rank', 'nerve', 'favour', 'marks', 'humour', 'oath', 'traits', 'vow', 'luck'].map(shownAs),
				['bar', 'count', 'badge', 'pips', 'bar', 'count', 'badge', 'words', 'list', 'words', 'bar'],
			)
			// A bar is its meter; pips are counted; a badge is a chip; words a line.
			assert.ok(view.query(`${row('vigour')} [data-widget-part~="stat-slot.fill"]`))
			assert.equal(view.queryAll(`${row('nerve')} [data-widget-part~="stat-slot.pip"]`).length, 5)
			assert.equal(view.queryAll(`${row('nerve')} [data-widget-part~="stat-slot.pip"][data-filled]`).length, 3)
			assert.equal(text(view.query(`${row('rank')} [data-widget-part~="stat-slot.chip"]`)), '3')
			assert.equal(text(view.query(`${row('coin')} [data-widget-part~="stat-slot.line"]`)), '42')
			assert.ok(!view.query(`${row('coin')} [data-widget-part~="stat-slot.fill"]`), 'a count draws no meter')
			assert.equal(text(view.query(`${row('humour')} [data-widget-part~="stat-slot.chip"]`)), 'bright')
			assert.equal(text(view.query(`${row('oath')} [data-widget-part~="stat-slot.line"]`)), 'sworn')
			assert.ok(view.query(`${row('luck')} [data-widget-part~="stat-slot.fill"]`), 'an unknown hint is the kind\'s default')
			assert.equal(view.query(`${row('vow')} [data-widget-part~="stat-slot.line"]`)?.innerHTML.includes('<br'), true, 'free text over several lines')
			// Where and when: the host's place and the story clock, never among the attributes.
			const where = '[data-widget-part~="stats.where"]'
			assert.ok(view.query(`${where} ${row('location')}`), 'the place is in Where and when')
			assert.ok(!view.query(`[data-widget-part~="stats.card-body"] ${row('location')}`), 'never among the attributes')
			assert.ok(!view.query(`${where} [data-widget-part~="stats.where-clock"]`), 'a character’s sheet carries no clock — the world’s does')
			// Zones: a list and a fan, each entry by name, ×N, its kind's words.
			assert.deepEqual(view.queryAll('[data-widget-part~="stats.zone"]').map((z) => [z.getAttribute('data-zone-type'), z.getAttribute('data-shown-as')]), [['carried', 'list'], ['hand', 'fan']])
			assert.deepEqual(view.queryAll('[data-widget-part~="stats.zone-name"]').map((e) => text(e)), ['Rope ×2', 'Lamp', 'Queen of cups'])
			// A genre's tool state: hidden where the copy hides it.
			assert.ok(!view.query(row('fate')))
		} finally {
			await view.unmount()
		}
	})

	test("the game's own state is drawn under the attributes, apart from them — by default", async () => {
		const view = await mount(state())
		try {
			assert.ok(view.query(`[data-widget-part~="stats.tools"] ${row('fate')}`))
			assert.ok(!view.query(`[data-widget-part~="stats.card-body"] ${row('fate')}`))
		} finally {
			await view.unmount()
		}
	})

	test('the world draws its place and the story clock as Where and when', async () => {
		const world = { key: 'world', kind: 'session', id: 1, label: 'World', configs: { [id('location')]: {} } }
		const view = await mount(state({ resolved: { world: { 'acme.location': 'The harbour' }, cast: {} }, owners: [world] } as never), { owners: 'world', arrangement: 'strip' })
		try {
			const where = '[data-widget-part~="stats.where"]'
			assert.match(text(view.query(where)) ?? '', /Where and when.*The harbour.*When.*Day 3, 14:00/)
		} finally {
			await view.unmount()
		}
	})

	test('a holder switches an optional attribute from the sheet: ONE set-attribute-carry', async () => {
		const view = await mount(state())
		try {
			const input = view.query('[data-widget-part~="stats.carry"][data-carry="acme:slot/vow@1"] input')
			assert.ok(input, 'the switch is offered')
			await view.click(input!)
			const asked = view.requested.find((r) => r.kind === 'set-attribute-carry')
			assert.ok(asked, 'set-attribute-carry was asked')
			assert.deepEqual(asked!.params, { owner: { kind: 'player_seat', id: 1 }, slotId: id('vow'), carries: false })
		} finally {
			await view.unmount()
		}
	})

	test("rules that declare no attributes (Freeform, From scratch) say so — the place, the clock and ⏳ what someone carries still drawn", async () => {
		// ⏳ What someone carries, kept by the host as a list (Story, the Lair): never one of the rules' attributes.
		const carried = slot('inventory', 'list', { hostState: 'carried', appliesTo: ['cast', 'world', 'location'] })
		const freeform = state({
			slots: [HOST[0]!, carried] as never,
			resolved: { world: { 'acme.location': 'The pier' }, cast: { 'player_seat:1': { 'acme.inventory': ['Rusty key'] } } },
			owners: [
				{ key: 'world', kind: 'session', id: 1, label: 'World', configs: { [id('location')]: {} } },
				owner({ configs: { [id('inventory')]: {} }, zones: undefined, carries: undefined }),
			] as never,
		})
		const mine = await mount(freeform)
		try {
			assert.equal(text(mine.query('[data-widget-part~="stats.card-note"][data-declares-none]')), "This session's rules declare no attributes.")
			assert.match(text(mine.query(`[data-widget-part~="stats.carried"] ${row('inventory')}`)) ?? '', /Rusty key/)
			assert.equal(mine.queryAll(`[data-widget-part~="stats.card-body"]`).length, 0, 'no attribute is drawn')
		} finally {
			await mine.unmount()
		}
		const all = await mount(freeform, { owners: 'all' })
		try {
			assert.match(text(all.query('[data-widget-part~="stats.where"]')) ?? '', /The pier.*Day 3, 14:00/)
		} finally {
			await all.unmount()
		}
	})
})
