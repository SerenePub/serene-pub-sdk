/**
 * Core's World State and Stats as the components they ship as (R21): built
 * by the CLI's component bundler from `core-catalog/components/sessions/`,
 * run in a worker in core's box, reading the `session_state` section and
 * their settings, and writing through `set-attribute-value` — Enter commits
 * and Escape cancels on the plain field (R80), an enum picks from an
 * `sp-menu` on its chip, and a refused write is the widget's own line (R77).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import type { SessionStateV1, WidgetScope } from '@serene-pub/sdk'
import { mountComponent, type MountedComponent } from '../cli/src/testing.js'
import { coreComponentEntry } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')

const slot = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
	slotId: `core:slot/${key}@1`,
	key,
	qualifiedKey: `core.${key}`,
	label: key[0]!.toUpperCase() + key.slice(1),
	type,
	appliesTo: [],
	...extra,
})
const id = (key: string) => `core:slot/${key}@1`

/** An Adventure-shaped session: a world with weather, light and a mood line; a cast with hit points. */
const sessionState = (over: Partial<SessionStateV1> = {}): SessionStateV1 =>
	({
		sessionId: 1,
		loaded: true,
		error: null,
		resolved: {
			world: { 'core.weather': 'rain', 'core.lit': true, 'core.omen': 'grey sky', 'core.danger': 3 },
			cast: { mira: { 'core.hp': 14, 'core.gold': 30 }, bram: {} },
		},
		slots: [
			slot('weather', 'enum', { required: true }),
			slot('lit', 'boolean'),
			slot('omen', 'text'),
			slot('danger', 'integer'),
			slot('tension', 'derived'),
			slot('hp', 'integer', { description: 'Hit points' }),
			slot('gold', 'integer', { retired: true }),
		],
		owners: [
			{
				key: 'world',
				kind: 'session',
				id: 1,
				label: 'World',
				configs: {
					[id('weather')]: { of: ['clear', 'rain', 'storm'] },
					[id('lit')]: {},
					[id('omen')]: { maxLength: 8 },
					[id('danger')]: { min: 0, max: 5 },
					[id('tension')]: {},
				},
			},
			{ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira', configs: { [id('hp')]: { min: 0, max: 20 }, [id('gold')]: {} } },
			{ key: 'bram', kind: 'session_cast', id: 12, label: 'Bram', configs: { [id('hp')]: { min: 0, max: 20 } } },
		],
		...over,
	}) as SessionStateV1

async function mount(
	slug: 'world-state' | 'stats',
	opts: {
		state?: SessionStateV1 | null
		settings?: Record<string, unknown>
		requests?: (kind: string, params: Record<string, unknown>) => unknown
		/** Whose box: core's unless a plugin's clone is being mounted. */
		owner?: string
		grants?: WidgetScope[]
	} = {},
): Promise<MountedComponent> {
	const state = opts.state === undefined ? sessionState() : opts.state
	return mountComponent({
		...(await coreComponentEntry(slug, { root: CORE_CATALOG, entry: `components/sessions/${slug}/${slug}.ts` })),
		owner: opts.owner ?? 'core',
		...(opts.grants ? { grants: opts.grants } : {}),
		timeoutMs: 60_000,
		context: {
			session: { id: 1, name: 'Proof' },
			settings: opts.settings ?? {},
			viewer: { userId: 1, isAdmin: false, isGuest: false },
			scoped: state ? { session_state: state } : {},
		},
		requests: opts.requests as never,
	})
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim()
const slotEl = (view: MountedComponent, key: string) => view.query(`[data-slot-id="${id(key)}"]`)!

describe("core's World State component", { timeout: 180_000 }, () => {
	test('draws the world, one control per slot type, in core vocabulary', async () => {
		const view = await mount('world-state')
		try {
			assert.deepEqual(view.refused, [])
			const root = view.query('[data-state-widget="world-state"]')!
			assert.equal(root.getAttribute('data-owner-key'), 'world')
			assert.equal(root.getAttribute('data-layout'), 'strip')
			assert.deepEqual(
				view.queryAll('[data-widget-part~="stat-slot.root"]').map((s) => s.getAttribute('data-slot-type')),
				['enum', 'boolean', 'text', 'integer', 'derived'],
			)
			// The enum is an sp-menu on its chip, its closed set the items.
			const weather = slotEl(view, 'weather')
			assert.equal(text(weather.querySelector('button[slot="trigger"]')), 'rain')
			assert.deepEqual(
				[...weather.querySelectorAll('sp-menu-item')].map((i) => i.getAttribute('value')),
				['clear', 'opt:clear', 'opt:rain', 'opt:storm'],
			)
			// A required slot says so; a boolean is pressed; a bar's fill is a custom property.
			assert.equal(weather.querySelector('[data-widget-part~="stat-slot.required"]')?.getAttribute('aria-label'), 'required')
			assert.equal(slotEl(view, 'lit').querySelector('button')?.getAttribute('aria-pressed'), 'true')
			assert.equal(slotEl(view, 'danger').querySelector('[data-widget-part~="stat-slot.fill"]')?.getAttribute('style'), '--sp-fill: 60%')
			assert.equal(text(slotEl(view, 'danger').querySelector('[data-widget-part~="stat-slot.bar-value"]')), '3/5')
			// A derived slot is shown and never offered.
			const tension = slotEl(view, 'tension')
			assert.equal(tension.querySelector('sp-icon')?.getAttribute('name'), 'sigma')
			assert.equal(tension.querySelector('button')?.hasAttribute('disabled'), true)
		} finally {
			await view.unmount()
		}
	})

	test('loading, its two empty states, the list layout, and a scoped push re-draws', async () => {
		const view = await mount('world-state', { state: null, settings: { layout: 'list' } })
		try {
			assert.match(text(view.query('[role="status"]'))!, /Loading the world's stats/)
			assert.equal(view.query('[data-state-widget]')!.getAttribute('data-layout'), 'list')
			await view.push('scoped', { session_state: sessionState({ slots: [] }) })
			assert.match(text(view.root)!, /Nothing in this session declares world stats/)
			await view.push('scoped', {
				session_state: sessionState({ owners: sessionState().owners.filter((o) => o.key !== 'world') }),
			})
			assert.match(text(view.root)!, /This session's world declares no stats to show here/)
			const next = sessionState()
			next.resolved.world['core.weather'] = 'storm'
			await view.push('scoped', { session_state: next })
			assert.equal(text(slotEl(view, 'weather').querySelector('button[slot="trigger"]')), 'storm')
			// A failed READ is said, in the widget.
			await view.push('scoped', { session_state: sessionState({ error: 'state:get failed' }) })
			assert.equal(text(view.query('[role="alert"]')), 'state:get failed')
			assert.deepEqual(view.refused, [])
		} finally {
			await view.unmount()
		}
	})

	test('a FIRST read that fails is said once — no loading line left spinning beside it', async () => {
		for (const slug of ['world-state', 'stats'] as const) {
			const view = await mount(slug, { state: sessionState({ loaded: false, error: 'state:get failed', slots: [], owners: [] }) })
			try {
				assert.equal(text(view.query('[role="alert"]')), 'state:get failed', slug)
				// Compared as text, never as a node: a failed assert on a happy-dom
				// node inspects the whole document and can exhaust memory.
				assert.equal(text(view.query('[role="status"]')), undefined, slug)
				assert.doesNotMatch(text(view.root)!, /Loading/, slug)
				assert.deepEqual(view.refused, [])
			} finally {
				await view.unmount()
			}
		}
	})

	test('pickSlots narrows by key or label', async () => {
		const view = await mount('world-state', { settings: { slots: 'pick', pickSlots: ['Omen', 'lit'] } })
		try {
			assert.deepEqual(
				view.queryAll('[data-widget-part~="stat-slot.root"]').map((s) => s.getAttribute('data-slot-id')),
				[id('lit'), id('omen')],
			)
		} finally {
			await view.unmount()
		}
	})

	test('every edit is a set-attribute-value: toggle, menu, Enter commits, Escape cancels, leaving commits', async () => {
		const view = await mount('world-state', { requests: () => undefined })
		const world = { kind: 'session', id: 1 }
		const asked = () => view.requested.map((r) => [r.params.slotId, r.params.value])
		try {
			assert.equal(view.requested.length, 0)
			await view.click(slotEl(view, 'lit').querySelector('button')!)
			assert.deepEqual(view.requested[0], { kind: 'set-attribute-value', params: { owner: world, slotId: id('lit'), value: false } })

			// The enum's menu: an option writes it, "not set" clears.
			await view.dispatch(`[data-slot-id="${id('weather')}"] sp-menu`, 'select', { value: 'opt:storm' })
			await view.dispatch(`[data-slot-id="${id('weather')}"] sp-menu`, 'select', { value: 'clear' })

			// The bar opens a number field; Enter commits, held in its bounds.
			await view.click(slotEl(view, 'danger').querySelector('button')!)
			const field = () => slotEl(view, 'danger').querySelector('input')
			assert.equal(field()?.getAttribute('type'), 'number')
			assert.equal(field()?.getAttribute('keys'), 'Escape Enter')
			await view.input(`[data-slot-id="${id('danger')}"] input`, '9')
			assert.equal(await view.pressKey(field()!, 'Enter'), true)
			assert.equal(field() === null, true, 'Enter closes the field')

			// Escape puts the stored value back: nothing is written.
			await view.click(slotEl(view, 'danger').querySelector('button')!)
			await view.input(`[data-slot-id="${id('danger')}"] input`, '1')
			assert.equal(await view.pressKey(field()!, 'Escape'), true)
			assert.equal(field() === null, true, 'Escape closes the field')

			// A number field's `change` (a spinner step) only moves the draft;
			// leaving the field commits it — emptied, it clears.
			await view.click(slotEl(view, 'danger').querySelector('button')!)
			await view.input(`[data-slot-id="${id('danger')}"] input`, '')
			await view.dispatch(`[data-slot-id="${id('danger')}"] input`, 'change')
			assert.equal(field() !== null, true, 'a spinner step leaves the field open')
			await view.dispatch(`[data-slot-id="${id('danger')}"] input`, 'blur')
			assert.equal(field() === null, true, 'leaving closes the field')

			// Left untouched, the field closes and writes nothing.
			await view.click(slotEl(view, 'omen').querySelector('button')!)
			await view.dispatch(`[data-slot-id="${id('omen')}"] input`, 'blur')
			assert.equal(slotEl(view, 'omen').querySelector('input') === null, true, 'an untouched field closes on leaving')

			// Text: cut to the configured maxLength on Enter.
			await view.click(slotEl(view, 'omen').querySelector('button')!)
			await view.input(`[data-slot-id="${id('omen')}"] input`, 'a long dark omen')
			await view.pressKey(`[data-slot-id="${id('omen')}"] input`, 'Enter')

			assert.deepEqual(asked(), [
				[id('lit'), false],
				[id('weather'), 'storm'],
				[id('weather'), null],
				[id('danger'), 5],
				[id('danger'), null],
				[id('omen'), 'a long d'],
			])
			assert.ok(view.requested.every((r) => r.kind === 'set-attribute-value' && JSON.stringify(r.params.owner) === JSON.stringify(world)))
			assert.deepEqual(view.refused, [])
		} finally {
			await view.unmount()
		}
	})

	test("a refused write is this widget's own line (R77), cleared by the next write", async () => {
		let refuse = true
		const view = await mount('world-state', {
			requests: () => {
				if (refuse) throw new Error("'core:slot/lit@1' is not a slot World carries")
			},
		})
		try {
			assert.equal(view.query('[role="alert"]') === null, true)
			await view.click(slotEl(view, 'lit').querySelector('button')!)
			assert.equal(text(view.query('[role="alert"]')), "'core:slot/lit@1' is not a slot World carries")
			refuse = false
			await view.click(slotEl(view, 'lit').querySelector('button')!)
			assert.equal(view.query('[role="alert"]') === null, true)
		} finally {
			await view.unmount()
		}
	})
})

describe("core's Stats component", { timeout: 180_000 }, () => {
	test('scene: a card per cast member in play, a retired slot greyed and not editable', async () => {
		const view = await mount('stats')
		try {
			assert.deepEqual(view.refused, [])
			assert.deepEqual(
				view.queryAll('[data-widget-part~="stats.card"]').map((c) => c.getAttribute('data-owner-key')),
				['mira'],
			)
			const card = view.query('[data-owner-key="mira"]')!
			assert.equal(text(card.querySelector('[data-widget-part~="stats.card-head"]')), 'Mira')
			assert.equal(text(card.querySelector(`[data-slot-id="${id('hp')}"] [data-widget-part~="stat-slot.bar-value"]`)), '14/20')
			assert.equal(card.querySelector(`[data-slot-id="${id('hp')}"] [data-widget-part~="stat-slot.fill"]`)?.getAttribute('style'), '--sp-fill: 70%')
			const gold = card.querySelector(`[data-slot-id="${id('gold')}"]`)!
			assert.equal(gold.hasAttribute('data-retired'), true)
			assert.equal(gold.querySelector('button')?.hasAttribute('disabled'), true)
			assert.equal(gold.querySelector('sp-icon')?.getAttribute('label'), 'retired')
		} finally {
			await view.unmount()
		}
	})

	test('all, pick, compact, the empty states, and a push', async () => {
		const view = await mount('stats', { settings: { members: 'all', density: 'compact' } })
		try {
			assert.deepEqual(view.queryAll('[data-widget-part~="stats.card"]').map((c) => c.getAttribute('data-owner-key')), ['mira', 'bram'])
			assert.equal(view.queryAll('[data-widget-part~="stats.card-body"][data-density="compact"]').length, 2)
			await view.push('settings', { members: 'pick', pickMembers: ['nobody'] })
			assert.match(text(view.root)!, /No cast member matches the names in this widget's settings/)
			await view.push('settings', {})
			await view.push('scoped', { session_state: sessionState({ resolved: { world: {}, cast: {} } }) })
			assert.match(text(view.root)!, /No one in the cast has a stat in play yet/)
			await view.push('scoped', { session_state: sessionState({ slots: [] }) })
			assert.match(text(view.root)!, /Nothing in this session declares stats/)
			await view.push('scoped', { session_state: sessionState({ loaded: false }) })
			assert.match(text(view.query('[role="status"]'))!, /Loading the cast's stats/)
		} finally {
			await view.unmount()
		}
	})

	test("a cast member's bar writes their value, as the cast owner", async () => {
		const view = await mount('stats', { requests: () => undefined })
		try {
			await view.click(`[data-owner-key="mira"] [data-slot-id="${id('hp')}"] button`)
			await view.input(`[data-owner-key="mira"] [data-slot-id="${id('hp')}"] input`, '25')
			await view.pressKey(`[data-owner-key="mira"] [data-slot-id="${id('hp')}"] input`, 'Enter')
			assert.deepEqual(view.requested, [
				{ kind: 'set-attribute-value', params: { owner: { kind: 'session_cast', id: 11 }, slotId: id('hp'), value: 20 } },
			])
		} finally {
			await view.unmount()
		}
	})
})

describe('a clone of World State or Stats in a box not granted `session:state`', { timeout: 180_000 }, () => {
	test('says the scope was not granted — never a loading line that waits forever', async () => {
		for (const slug of ['world-state', 'stats'] as const) {
			// A plugin's box an admin granted nothing: the page posts no section, and says so.
			const view = await mount(slug, { owner: 'plugin', grants: [], state: sessionState() })
			try {
				const notice = view.query('[data-scope-not-granted]')
				assert.equal(notice?.getAttribute('data-scope-not-granted'), 'session:state', slug)
				assert.match(text(notice)!, /not been granted/, slug)
				assert.doesNotMatch(text(view.root)!, /Loading/, slug)
				assert.deepEqual(view.refused, [], slug)
				// Granted later (an admin's review): it waits for, then draws, the section.
				await view.setGrants(['session:state'])
				assert.equal(view.query('[data-scope-not-granted]'), null, slug)
				await view.push('scoped', { session_state: sessionState() })
				assert.ok(view.queryAll('[data-widget-part~="stat-slot.root"]').length > 0, slug)
				// Withdrawn at runtime: the section goes, and the notice is back.
				await view.setGrants([])
				assert.equal(view.query('[data-scope-not-granted]')?.getAttribute('data-scope-not-granted'), 'session:state', slug)
				assert.equal(view.queryAll('[data-widget-part~="stat-slot.root"]').length, 0, slug)
			} finally {
				await view.unmount()
			}
		}
	})

	test('granted it, the same clone draws as core does', async () => {
		const view = await mount('stats', { owner: 'plugin', grants: ['session:state'] })
		try {
			assert.equal(view.query('[data-scope-not-granted]'), null)
			assert.deepEqual(view.queryAll('[data-widget-part~="stats.card"]').map((c) => c.getAttribute('data-owner-key')), ['mira'])
		} finally {
			await view.unmount()
		}
	})
})

// ─── Phase 2: every catalogue stat shape, drawn and edited ──────────────────

/** A world carrying one slot of each catalogue shape, as a host with shapes sends them. */
const shapedState = (): SessionStateV1 =>
	sessionState({
		resolved: {
			world: {
				'core.bag': ['rope', { entryId: 7, name: 'The Sword' }, 'lamp'],
				'core.clock': '412-03-05 22:30',
				'core.mood': 'calm',
				'core.ratio': 0.5,
			},
			cast: {},
		},
		slots: [
			slot('bag', 'list', { shape: 'core:stat-shape/list@1', field: { type: 'list', item: { type: 'string' } } }),
			slot('clock', 'text', { shape: 'core:stat-shape/story-time@1', field: { type: 'string', format: 'story-time' } }),
			slot('mood', 'enum', { shape: 'core:stat-shape/choice@1', field: { type: 'enum' } }),
			slot('ratio', 'integer', { field: { type: 'number', min: 0, max: 1 } }),
		] as SessionStateV1['slots'],
		owners: [
			{
				key: 'world',
				kind: 'session',
				id: 1,
				label: 'World',
				configs: {
					[id('bag')]: { maxItems: 4 },
					[id('clock')]: {},
					[id('mood')]: { of: ['calm', 'wary'] },
					[id('ratio')]: { min: 0, max: 1 },
				},
			},
		],
	})

describe("core's state widgets draw and edit every catalogue shape", { timeout: 180_000 }, () => {
	test('each shape is drawn as what it is, read through its field', async () => {
		const view = await mount('world-state', { state: shapedState(), settings: { layout: 'list' } })
		try {
			assert.deepEqual(view.refused, [])
			assert.deepEqual(
				view.queryAll('[data-widget-part~="stat-slot.root"]').map((s) => s.getAttribute('data-slot-shape')),
				['list', 'story-time', 'choice', 'number'],
			)
			// A list reads as its items — a lore reference by the title the host filled in.
			assert.equal(text(slotEl(view, 'bag').querySelector('button')), 'rope, The Sword, lamp')
			// A story time reads through the calendar, never as its stored line.
			assert.equal(text(slotEl(view, 'clock').querySelector('button')), 'Year 412, Mo. 3, Day 5, 22:30')
			// A choice is a chip over its menu; a bounded fractional number is a bar.
			assert.equal(text(slotEl(view, 'mood').querySelector('button[slot="trigger"]')), 'calm')
			assert.equal(text(slotEl(view, 'ratio').querySelector('[data-widget-part~="stat-slot.bar-value"]')), '0.5/1')
		} finally {
			await view.unmount()
		}
	})

	test('a list: remove, move, add on Enter — each writes the whole list, references by id', async () => {
		const view = await mount('world-state', { state: shapedState(), requests: () => undefined })
		const values = () => view.requested.map((r) => r.params.value)
		try {
			await view.click(slotEl(view, 'bag').querySelector('button')!)
			assert.deepEqual(
				view.queryAll(`[data-slot-id="${id('bag')}"] [data-widget-part~="stat-slot.item-text"]`).map((i) => text(i)),
				['rope', 'The Sword', 'lamp'],
			)
			const add = `[data-slot-id="${id('bag')}"] input[data-widget-part~="stat-slot.add"]`
			assert.equal(view.query(add)?.getAttribute('keys'), 'Escape Enter')
			await view.click(`[data-slot-id="${id('bag')}"] [data-item-index="0"] [data-widget-part~="stat-slot.item-remove"]`)
			await view.click(`[data-slot-id="${id('bag')}"] [data-item-index="1"] button[aria-label="Move The Sword up"]`)
			await view.input(add, 'torch')
			await view.pressKey(add, 'Enter')
			assert.deepEqual(values(), [
				[{ entryId: 7 }, 'lamp'],
				[{ entryId: 7 }, 'rope', 'lamp'],
				['rope', { entryId: 7 }, 'lamp', 'torch'],
			])
			// Over the limit: said in the editor, nothing written.
			await view.push('scoped', {
				session_state: (() => {
					const next = shapedState()
					next.resolved.world['core.bag'] = ['a', 'b', 'c', 'd']
					return next
				})(),
			})
			await view.input(add, 'e')
			await view.pressKey(add, 'Enter')
			assert.match(text(view.query(`[data-slot-id="${id('bag')}"] [role="alert"]`))!, /at most 4 items/)
			assert.equal(view.requested.length, 3)
			// Escape closes the editor.
			await view.pressKey(add, 'Escape')
			assert.equal(view.query(add) === null, true)
			assert.ok(view.requested.every((r) => r.kind === 'set-attribute-value' && r.params.slotId === id('bag')))
		} finally {
			await view.unmount()
		}
	})

	test('a story time: fields saved on Enter as the canonical line; a bad time writes nothing; a blank year clears', async () => {
		const view = await mount('world-state', { state: shapedState(), requests: () => undefined })
		const field = (part: string) => `[data-slot-id="${id('clock')}"] input[data-widget-part~="${part}"]`
		try {
			await view.click(slotEl(view, 'clock').querySelector('button')!)
			assert.equal(view.query(field('stat-slot.clock'))?.getAttribute('keys'), 'Escape Enter')
			await view.input(field('stat-slot.year'), '413')
			await view.input(field('stat-slot.clock'), '6:05')
			await view.pressKey(field('stat-slot.year'), 'Enter')
			assert.equal(view.query(field('stat-slot.year')) === null, true, 'Enter saves and closes')

			await view.click(slotEl(view, 'clock').querySelector('button')!)
			await view.input(field('stat-slot.clock'), '25:00')
			await view.pressKey(field('stat-slot.clock'), 'Enter')
			assert.match(text(view.query(`[data-slot-id="${id('clock')}"] [role="alert"]`))!, /not a story time/)
			// Escape leaves it as it was.
			await view.pressKey(field('stat-slot.clock'), 'Escape')
			assert.equal(view.query(field('stat-slot.year')) === null, true)

			await view.click(slotEl(view, 'clock').querySelector('button')!)
			await view.input(field('stat-slot.year'), '')
			await view.click(`[data-slot-id="${id('clock')}"] [data-widget-part~="stat-slot.save"]`)
			assert.deepEqual(
				view.requested.map((r) => r.params.value),
				['413-03-05 06:05', null],
			)
		} finally {
			await view.unmount()
		}
	})

	test('a choice picks from its menu; a fractional number keeps its fraction', async () => {
		const view = await mount('world-state', { state: shapedState(), requests: () => undefined })
		try {
			await view.dispatch(`[data-slot-id="${id('mood')}"] sp-menu`, 'select', { value: 'opt:wary' })
			await view.click(slotEl(view, 'ratio').querySelector('button')!)
			assert.equal(slotEl(view, 'ratio').querySelector('input')?.getAttribute('step'), 'any')
			await view.input(`[data-slot-id="${id('ratio')}"] input`, '0.25')
			await view.pressKey(`[data-slot-id="${id('ratio')}"] input`, 'Enter')
			assert.deepEqual(
				view.requested.map((r) => [r.params.slotId, r.params.value]),
				[
					[id('mood'), 'wary'],
					[id('ratio'), 0.25],
				],
			)
		} finally {
			await view.unmount()
		}
	})

	test("Stats edits a cast member's list the same way", async () => {
		const state = shapedState()
		state.slots = [slot('bag', 'list', { field: { type: 'list', item: { type: 'string' } } })] as SessionStateV1['slots']
		state.resolved.cast = { mira: { 'core.bag': [] } }
		state.owners = [{ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira', configs: { [id('bag')]: {} } }]
		const view = await mount('stats', { state, settings: { members: 'all' }, requests: () => undefined })
		try {
			const bag = `[data-owner-key="mira"] [data-slot-id="${id('bag')}"]`
			assert.equal(text(view.query(`${bag} button`)), 'none')
			await view.click(`${bag} button`)
			assert.match(text(view.query(bag))!, /Nothing in the list yet/)
			await view.input(`${bag} input[data-widget-part~="stat-slot.add"]`, 'a lantern')
			await view.pressKey(`${bag} input[data-widget-part~="stat-slot.add"]`, 'Enter')
			assert.deepEqual(view.requested, [
				{ kind: 'set-attribute-value', params: { owner: { kind: 'session_cast', id: 11 }, slotId: id('bag'), value: ['a lantern'] } },
			])
		} finally {
			await view.unmount()
		}
	})
})

// ─── Items (attributes phase 3c): the lorebook picker and held counts ────────

const ITEM = 'core:entry/item'
/** A world whose bag holds a word and two of an item entry, the host having named it. */
const itemState = (bag: unknown[] = ['rope', { entryId: 7, count: 2, name: 'The Sword' }], config: Record<string, unknown> = {}) =>
	sessionState({
		resolved: { world: { 'core.bag': bag }, cast: {} },
		slots: [slot('bag', 'list', { shape: 'core:stat-shape/list@1', field: { type: 'list', item: { type: 'string' } } })] as SessionStateV1['slots'],
		owners: [{ key: 'world', kind: 'session', id: 1, label: 'World', configs: { [id('bag')]: config } }],
	})

/** The page's answers: a book with two items and a city; `write` answers `set-attribute-value`. */
const lorebook =
	(opts: { ownerOnly?: boolean; write?: (params: Record<string, unknown>) => unknown } = {}) =>
	(kind: string, params: Record<string, unknown>) => {
		if (kind === 'session-entries') {
			const row = (id: number, typeId: string, title: string) => ({
				id, typeId, title, keys: [], off: false, pinned: false, timesJudged: 0, timesIncluded: 0,
				lastJudgedAt: null, lastIncluded: null, lastReason: null, lastRank: null,
			})
			const items = [row(7, ITEM, 'The Sword'), row(8, ITEM, 'Rusty key')]
			const rows = opts.ownerOnly ? [] : params.typeIds ? items : [row(9, 'core:entry/world-lore', 'Umber City'), items[1]!]
			return { lorebookId: 1, ownerOnly: !!opts.ownerOnly, rows, total: rows.length, offset: 0 }
		}
		if (kind === 'set-attribute-value') return opts.write?.(params)
		return undefined
	}

describe("core's state widgets hold items from the lorebook, with counts (phase 3c)", { timeout: 180_000 }, () => {
	const bag = `[data-slot-id="${id('bag')}"]`
	const writes = (view: MountedComponent) =>
		view.requested.filter((r) => r.kind === 'set-attribute-value').map((r) => r.params.value)
	const searches = (view: MountedComponent) => view.requested.filter((r) => r.kind === 'session-entries').map((r) => r.params)

	test('pick an item from the lorebook with a count: items first, what is held said, the whole list written', async () => {
		const view = await mount('world-state', { state: itemState(), requests: lorebook() })
		try {
			await view.click(`${bag} button`)
			// Opening the editor asks nothing: the book is searched only when the picker opens.
			assert.deepEqual(searches(view), [])
			assert.equal(text(view.query(`${bag} [data-item-index="1"] [data-widget-part~="stat-slot.item-text"]`)), 'The Sword ×2')
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-open"]`)
			assert.deepEqual(searches(view), [
				{ sort: 'name', typeIds: [ITEM], limit: 25 },
				{ sort: 'name', limit: 25 },
			])
			assert.deepEqual(
				view.queryAll(`${bag} [data-pick-group="items"] [data-widget-part~="stat-slot.pick-entry"]`).map((b) => text(b)),
				['The Sword held ×2', 'Rusty key'],
			)
			assert.deepEqual(
				view.queryAll(`${bag} [data-pick-group="others"] [data-widget-part~="stat-slot.pick-entry"]`).map((b) => text(b)),
				['Umber City'],
			)
			const key = `${bag} [data-widget-part~="stat-slot.pick-entry"][data-entry-id="8"]`
			await view.click(key)
			assert.equal(view.query(key)?.getAttribute('aria-pressed'), 'true')
			const count = `${bag} input[data-widget-part~="stat-slot.pick-count"]`
			assert.equal(view.query(count)?.getAttribute('keys'), 'Escape Enter')
			assert.equal(view.query(count)?.getAttribute('aria-label'), 'How many Rusty key to add')
			await view.input(count, '3')
			await view.pressKey(count, 'Enter')
			// More of what is held sums onto it; the host's name never rides back.
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-entry"][data-entry-id="7"]`)
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-confirm"]`)
			assert.deepEqual(writes(view), [
				['rope', { entryId: 7, count: 2 }, { entryId: 8, count: 3 }],
				['rope', { entryId: 7, count: 3 }],
			])
			// A search asks again with its words; Escape closes the picker, not the editor.
			await view.input(`${bag} input[data-widget-part~="stat-slot.pick-search"]`, 'key')
			await view.pressKey(`${bag} input[data-widget-part~="stat-slot.pick-search"]`, 'Enter')
			assert.deepEqual(searches(view).at(-2), { titleOrKey: 'key', sort: 'name', typeIds: [ITEM], limit: 25 })
			await view.pressKey(count, 'Escape')
			assert.match(text(view.query(bag))!, /Add from the lorebook/)
			assert.match(text(view.query(bag))!, /Done/)
		} finally {
			await view.unmount()
		}
	})

	test('a held item steps up and down; one fewer than one takes it out; words keep no stepper', async () => {
		const view = await mount('world-state', { state: itemState(), requests: lorebook() })
		try {
			await view.click(`${bag} button`)
			await view.click(`${bag} button[aria-label="One more The Sword ×2"]`)
			await view.click(`${bag} button[aria-label="One fewer The Sword ×2"]`)
			assert.deepEqual(
				view.queryAll(`${bag} [data-item-index="0"] button`).map((b) => b.getAttribute('aria-label')),
				['Move rope up', 'Move rope down', 'Remove rope'],
			)
			await view.push('scoped', { session_state: itemState(['rope', { entryId: 7, name: 'The Sword' }]) })
			assert.equal(text(view.query(`${bag} [data-item-index="1"] [data-widget-part~="stat-slot.item-text"]`)), 'The Sword')
			await view.click(`${bag} button[aria-label="One fewer The Sword"]`)
			assert.deepEqual(writes(view), [
				['rope', { entryId: 7, count: 3 }],
				['rope', { entryId: 7 }],
				['rope'],
			])
		} finally {
			await view.unmount()
		}
	})

	test("refusals are said in the widget: a full list, a count that is not one, the page's own refusal", async () => {
		let refuse = false
		const view = await mount('world-state', {
			state: itemState(['rope', 'lamp'], { maxItems: 2 }),
			requests: lorebook({
				write: () => {
					if (refuse) throw new Error("The Sword is not an entry of this session's lorebook.")
				},
			}),
		})
		try {
			await view.click(`${bag} button`)
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-open"]`)
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-entry"][data-entry-id="7"]`)
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-confirm"]`)
			assert.match(text(view.query(`${bag} [role="alert"]`))!, /at most 2 items/)
			await view.input(`${bag} input[data-widget-part~="stat-slot.pick-count"]`, '0')
			await view.pressKey(`${bag} input[data-widget-part~="stat-slot.pick-count"]`, 'Enter')
			assert.match(text(view.query(`${bag} [role="alert"]`))!, /whole number, 1 or more/)
			assert.deepEqual(writes(view), [])

			await view.push('scoped', { session_state: itemState(['rope'], { maxItems: 2 }) })
			refuse = true
			await view.input(`${bag} input[data-widget-part~="stat-slot.pick-count"]`, '1')
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-confirm"]`)
			assert.deepEqual(writes(view), [['rope', { entryId: 7 }]])
			assert.ok(
				view.queryAll('[role="alert"]').some((a) => /not an entry of this session's lorebook/.test(text(a) ?? '')),
				'the refusal is the widget’s own line',
			)
		} finally {
			await view.unmount()
		}
	})

	test("a viewer who does not own the book is told so; a list closed over words offers no picker", async () => {
		const view = await mount('world-state', { state: itemState(), requests: lorebook({ ownerOnly: true }) })
		try {
			await view.click(`${bag} button`)
			await view.click(`${bag} [data-widget-part~="stat-slot.pick-open"]`)
			assert.match(text(view.query(`${bag} [data-widget-part~="stat-slot.picker"]`))!, /Only the lorebook's owner can pick from it/)
			assert.equal(searches(view).length, 1, 'the rest of the book is not asked for')
		} finally {
			await view.unmount()
		}
		const closed = await mount('world-state', { state: itemState(['a'], { of: ['a', 'b'] }), requests: lorebook() })
		try {
			await closed.click(`${bag} button`)
			assert.doesNotMatch(text(closed.query(bag))!, /Add from the lorebook/)
		} finally {
			await closed.unmount()
		}
	})

	test("Stats picks an item into a cast member's list the same way", async () => {
		const state = itemState([])
		state.resolved.world = {}
		state.resolved.cast = { mira: { 'core.bag': [] } }
		state.owners = [{ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira', configs: { [id('bag')]: {} } }]
		const view = await mount('stats', { state, settings: { members: 'all' }, requests: lorebook() })
		const mira = `[data-owner-key="mira"] ${bag}`
		try {
			await view.click(`${mira} button`)
			await view.click(`${mira} [data-widget-part~="stat-slot.pick-open"]`)
			await view.click(`${mira} [data-widget-part~="stat-slot.pick-entry"][data-entry-id="8"]`)
			await view.input(`${mira} input[data-widget-part~="stat-slot.pick-count"]`, '2')
			await view.pressKey(`${mira} input[data-widget-part~="stat-slot.pick-count"]`, 'Enter')
			assert.deepEqual(
				view.requested.filter((r) => r.kind === 'set-attribute-value'),
				[{ kind: 'set-attribute-value', params: { owner: { kind: 'session_cast', id: 11 }, slotId: id('bag'), value: [{ entryId: 8, count: 2 }] } }],
			)
		} finally {
			await view.unmount()
		}
	})
})
