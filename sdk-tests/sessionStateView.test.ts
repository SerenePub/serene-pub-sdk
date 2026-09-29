/**
 * The plain half of core's state widgets (R21), `@serene-pub/core-catalog/session-state`:
 * when a number is a bar (moved from the app with `barMath`), what a value
 * reads as, and what World State and Stats draw from the `session_state`
 * section and their settings.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionStateV1 } from '@serene-pub/sdk'
import {
	barView,
	clampToBounds,
	enumValues,
	formatSlotValue,
	numberDraftValue,
	pickedNames,
	slotValueText,
	slotWritable,
	statsView,
	textDraftValue,
	worldStateView,
} from '../core-catalog/src/ui/sessions/session-state/index.js'

describe('barView', () => {
	test('a bounded integer is a percentage and a label', () => {
		assert.deepEqual(barView(14, { min: 0, max: 20 }), { min: 0, max: 20, value: 14, percent: 70, label: '14/20' })
	})
	test('a floor that is not zero is where the bar starts', () => {
		assert.equal(barView(5, { min: 5, max: 25 })?.percent, 0)
		assert.equal(barView(15, { min: 5, max: 25 })?.percent, 50)
	})
	test('only the drawing is clamped; the label keeps the real number', () => {
		assert.deepEqual([barView(35, { min: 0, max: 20 })?.percent, barView(35, { min: 0, max: 20 })?.label], [100, '35/20'])
		assert.deepEqual([barView(-3, { min: 0, max: 20 })?.percent, barView(-3, { min: 0, max: 20 })?.label], [0, '-3/20'])
	})
	test('a slot with one bound, no bounds, or no number is not a bar', () => {
		assert.equal(barView(14, { min: 0 }), null)
		assert.equal(barView(14, { max: 20 }), null)
		assert.equal(barView(14, {}), null)
		assert.equal(barView('wary', { min: 0, max: 20 }), null)
		assert.equal(barView(null, { min: 0, max: 20 }), null)
		assert.equal(barView(undefined, { min: 0, max: 20 }), null)
	})
	test('a ceiling that is not above the floor is not a bar', () => {
		assert.equal(barView(3, { min: 5, max: 5 }), null)
		assert.equal(barView(3, { min: 9, max: 4 }), null)
	})
})

describe('clampToBounds', () => {
	test('holds a value inside whichever bounds are declared', () => {
		assert.equal(clampToBounds(25, { min: 0, max: 20 }), 20)
		assert.equal(clampToBounds(-1, { min: 0, max: 20 }), 0)
		assert.equal(clampToBounds(-1, { max: 20 }), -1)
		assert.equal(clampToBounds(99, { min: 0 }), 99)
	})
})

describe('formatSlotValue / slotValueText', () => {
	test('a boolean reads as a state; everything else is itself; cleared and absent in words', () => {
		assert.deepEqual([true, false, 14, 'wary', null, undefined].map(formatSlotValue), ['on', 'off', '14', 'wary', 'cleared', ''])
	})
	test('the words go through the widget language; a value never does', () => {
		const t = (s: string) => `«${s}»`
		assert.deepEqual([true, null, 14, 'on'].map((v) => slotValueText(v, t)), ['«on»', '«cleared»', '14', 'on'])
	})
})

describe('editing one slot', () => {
	test('an integer draft: empty clears, a number is truncated into its bounds, junk writes nothing', () => {
		assert.equal(numberDraftValue(null, { min: 0, max: 20 }), null)
		assert.equal(numberDraftValue('  ', {}), null)
		assert.equal(numberDraftValue(25, { min: 0, max: 20 }), 20)
		assert.equal(numberDraftValue(7.9, { min: 0, max: 20 }), 7)
		assert.equal(numberDraftValue('-4', { min: 0 }), 0)
		assert.equal(numberDraftValue('abc', {}), undefined)
	})
	test('a text draft: blank clears; otherwise cut to the configured maxLength (a remote field carries none)', () => {
		assert.equal(textDraftValue('   ', {}), null)
		assert.equal(textDraftValue('restless', { maxLength: 4 }), 'rest')
		assert.equal(textDraftValue('restless', {}), 'restless')
	})
	test('derived and retired slots are not written', () => {
		const slot = { slotId: 's', key: 'k', qualifiedKey: 'k', label: 'K', type: 'integer' as const, appliesTo: [] }
		assert.equal(slotWritable(slot), true)
		assert.equal(slotWritable({ ...slot, type: 'derived' }), false)
		assert.equal(slotWritable({ ...slot, retired: true }), false)
	})
	test("an enum's values are its configuration's closed set", () => {
		assert.deepEqual(enumValues({ of: ['clear', 'rain'] }), ['clear', 'rain'])
		assert.deepEqual(enumValues({}), [])
	})
	test('picked names are trimmed, lower-cased, and blanks dropped', () => {
		assert.deepEqual(pickedNames([' HP ', '', 'Mood']), ['hp', 'mood'])
		assert.deepEqual(pickedNames('hp'), [])
	})
})

const slot = (key: string, type: 'integer' | 'enum', extra: Record<string, unknown> = {}) => ({
	slotId: `core:slot/${key}@1`,
	key,
	qualifiedKey: `core.${key}`,
	label: key.toUpperCase(),
	type,
	appliesTo: [],
	...extra,
})
const state = (over: Partial<SessionStateV1> = {}): SessionStateV1 => ({
	sessionId: 1,
	loaded: true,
	error: null,
	resolved: { world: { 'core.weather': 'rain' }, cast: { mira: { 'core.hp': 14 }, bram: {} } },
	slots: [slot('weather', 'enum'), slot('hp', 'integer')] as SessionStateV1['slots'],
	owners: [
		{ key: 'world', kind: 'session', id: 1, label: 'World', configs: { 'core:slot/weather@1': { of: ['clear', 'rain'] } } },
		{ key: 'mira', kind: 'session_cast', id: 11, label: 'Mira', configs: { 'core:slot/hp@1': { min: 0, max: 20 } } },
		{ key: 'bram', kind: 'session_cast', id: 12, label: 'Bram', configs: { 'core:slot/hp@1': { min: 0, max: 20 } } },
	],
	...over,
})

describe('worldStateView', () => {
	test('loading before the first read — never "nothing"', () => {
		assert.equal(worldStateView(undefined, {}).status, 'loading')
		assert.equal(worldStateView(state({ loaded: false, slots: [] }), {}).status, 'loading')
	})
	test('a FIRST read that failed is failed, not loading forever', () => {
		assert.deepEqual(worldStateView(state({ loaded: false, error: 'Could not read', slots: [] }), {}), {
			status: 'failed',
			layout: 'strip',
		})
		assert.deepEqual(statsView(state({ loaded: false, error: 'Could not read', slots: [] }), { density: 'compact' }), {
			status: 'failed',
			density: 'compact',
		})
	})
	test("the world's slots, with its values and configs, laid out as a strip by default", () => {
		const v = worldStateView(state(), {})
		assert.equal(v.status, 'shown')
		assert.equal(v.layout, 'strip')
		if (v.status !== 'shown') return
		assert.deepEqual(
			v.slots.map((s) => [s.slot.key, s.value, s.config]),
			[['weather', 'rain', { of: ['clear', 'rain'] }]],
		)
	})
	test('two empties: nothing declared at all, or nothing of the world picked', () => {
		assert.deepEqual(worldStateView(state({ slots: [] }), { layout: 'list' }), { status: 'empty', layout: 'list', reason: 'none-declared' })
		assert.deepEqual(worldStateView(state(), { slots: 'pick', pickSlots: ['hp'] }), { status: 'empty', layout: 'strip', reason: 'none-shown' })
		assert.equal(worldStateView(state(), { slots: 'pick', pickSlots: ['WEATHER'] }).status, 'shown')
	})
})

// Attributes phase 4 (2026-09-26): a location holds state of its own. World
// State draws each location in play as a place under the world's own slots;
// Stats is the cast's and never draws one.
describe('worldStateView — locations', () => {
	const inv = { ...slot('inventory', 'enum'), type: 'list' as const }
	const withPlaces = (): SessionStateV1 =>
		state({
			slots: [slot('weather', 'enum'), slot('hp', 'integer'), inv] as SessionStateV1['slots'],
			resolved: {
				world: { 'core.weather': 'rain' },
				cast: { mira: { 'core.hp': 14 }, bram: {} },
				locations: { 'location:harbor': { 'core.inventory': [{ entryId: 5, name: 'Rope' }] }, 'location:crypt': {} },
			},
			owners: [
				...state().owners,
				{ key: 'location:harbor', kind: 'session_location', id: 41, label: 'Harbor', configs: { 'core:slot/inventory@1': {} } },
				{ key: 'location:crypt', kind: 'session_location', id: 42, label: 'Crypt', configs: { 'core:slot/inventory@1': {} } },
			],
		})
	test('each location with a value in play is a place under the world; one with none is not drawn', () => {
		const v = worldStateView(withPlaces(), {})
		assert.equal(v.status, 'shown')
		if (v.status !== 'shown') return
		assert.deepEqual(
			v.places.map((p) => [p.owner.label, p.slots.map((s) => s.value)]),
			[['Harbor', [[{ entryId: 5, name: 'Rope' }]]]],
		)
		assert.deepEqual(worldStateView(state(), {}).status === 'shown' && (worldStateView(state(), {}) as { places: unknown[] }).places, [])
	})
	test('a place alone is enough to show; a pick narrows the places too', () => {
		const v = worldStateView(withPlaces(), { slots: 'pick', pickSlots: ['inventory'] })
		assert.equal(v.status, 'shown')
		if (v.status === 'shown') {
			assert.deepEqual(v.slots, [])
			assert.deepEqual(v.places.map((p) => p.owner.key), ['location:harbor'])
		}
		assert.equal(worldStateView(withPlaces(), { slots: 'pick', pickSlots: ['hp'] }).status, 'empty')
	})
	test('Stats never draws a location', () => {
		const v = statsView(withPlaces(), { members: 'all' })
		if (v.status === 'shown') assert.deepEqual(v.members.map((m) => m.owner.key), ['mira', 'bram'])
	})
})

describe('statsView', () => {
	test('scene: only the cast members with a value in play', () => {
		const v = statsView(state(), {})
		assert.equal(v.status, 'shown')
		if (v.status === 'shown') assert.deepEqual(v.members.map((m) => [m.owner.label, m.slots.map((s) => s.value)]), [['Mira', [14]]])
	})
	test('all: every cast member, the world never', () => {
		const v = statsView(state(), { members: 'all', density: 'compact' })
		assert.equal(v.density, 'compact')
		if (v.status === 'shown') assert.deepEqual(v.members.map((m) => m.owner.key), ['mira', 'bram'])
	})
	test('pick: by label or key; nobody matching says so', () => {
		const v = statsView(state(), { members: 'pick', pickMembers: ['bram'] })
		if (v.status === 'shown') assert.deepEqual(v.members.map((m) => m.owner.key), ['bram'])
		assert.deepEqual(statsView(state(), { members: 'pick', pickMembers: ['nobody'] }), { status: 'no-members', density: 'full', members: 'pick' })
	})
	test('loading, and nothing declared', () => {
		assert.equal(statsView(state({ loaded: false }), {}).status, 'loading')
		assert.equal(statsView(state({ slots: [] }), {}).status, 'none-declared')
		assert.deepEqual(statsView(state({ resolved: { world: {}, cast: {} } }), {}), {
			status: 'no-members',
			density: 'full',
			members: 'scene',
		})
	})
})

describe('a scope not granted', () => {
	test('is its own state — never loading — and only a definite `false` means it', () => {
		assert.deepEqual(worldStateView(undefined, {}, false), { status: 'not-granted', layout: 'strip' })
		assert.deepEqual(statsView(undefined, { density: 'compact' }, false), { status: 'not-granted', density: 'compact' })
		// Not said yet (`undefined`) is still loading; granted draws as ever.
		assert.equal(worldStateView(undefined, {}, undefined).status, 'loading')
		assert.equal(statsView(state(), {}, true).status, 'shown')
	})
})

// ─── Phase 2: drawing and editing by stat shape ─────────────────────────────

describe('a slot is drawn by its stat shape', async () => {
	const s = await import('../core-catalog/src/ui/sessions/session-state/index.js')
	const { statBarsOf } = await import('../core-catalog/src/ui/sessions/scene-portraits/index.js')
	const t = (x: string) => x

	test('the kind comes from the field, or the type when a host sent none', () => {
		assert.equal(s.slotKind({ type: 'integer' }), 'number')
		assert.equal(s.slotKind({ type: 'list' }), 'list')
		assert.equal(s.slotKind({ type: 'derived' }), 'derived')
		assert.equal(s.slotKind({ type: 'text', field: { type: 'string', format: 'story-time' } }), 'story-time')
		assert.equal(s.slotKind({ type: 'enum', field: { type: 'enum' } }), 'choice')
		// A field this build cannot keep is shown as a line, never refused.
		assert.equal(s.slotKind({ type: 'text', field: { type: 'media' } }), 'text')
		assert.equal(s.slotIsWhole({ type: 'integer', field: { type: 'number' } }), false)
		assert.equal(s.slotIsWhole({ type: 'integer' }), true)
	})

	test('values read by kind: a list as its items, a story time through the calendar', () => {
		const list = { type: 'list' as const }
		assert.equal(s.shownValueText(list, ['rope', { entryId: 7, name: 'The Sword' }, { entryId: 9 }], t), 'rope, The Sword, Lore entry 9')
		const clock = { type: 'text' as const, field: { type: 'string' as const, format: 'story-time' as const } }
		assert.equal(s.shownValueText(clock, '412-03-05 22:30', t), 'Year 412, Mo. 3, Day 5, 22:30')
		// Through the book's declared calendar when one is given (DESIGN-story-time P5).
		assert.equal(
			s.shownValueText(clock, '412-02-05', t, { months: [{ name: 'Thaw', days: 30 }, { name: 'Bloom', days: 30 }], yearLabel: 'Year' }),
			'5 Bloom, Year 412',
		)
		assert.equal(s.shownValueText(clock, 'not a date', t), 'not a date')
		assert.equal(s.shownValueText(clock, null, t), 'cleared')
		assert.equal(s.shownValueText(clock, undefined, t), '')
	})

	test('a list edit writes the whole list: add through the list op, remove, move', () => {
		assert.deepEqual(s.listWithAdded(['rope'], '  lamp ', {}), { value: ['rope', 'lamp'], refusal: null })
		assert.equal(s.listWithAdded(['rope'], '   ', {}), null)
		assert.match(s.listWithAdded(['rope'], 'lamp', { maxItems: 1 })!.refusal!, /at most 1 item/)
		assert.deepEqual(s.listWithAdded(['rope'], 'rope', {})!.value, ['rope'])
		assert.deepEqual(s.listWithAdded([], 'a very long word', { maxLength: 6 })!.value, ['a very'])
		const held = ['rope', { entryId: 7, name: 'Sword' }, 'lamp']
		assert.deepEqual(s.listWithout(held, 0), [{ entryId: 7 }, 'lamp'])
		assert.deepEqual(s.listMoved(held, 2, -1), ['rope', 'lamp', { entryId: 7 }])
		assert.deepEqual(s.listMoved(held, 0, -1), ['rope', { entryId: 7 }, 'lamp'])
		assert.deepEqual(s.listItemsOf(undefined), [])
	})

	test("a story time's fields as a write: blank year clears, bad fields write nothing", () => {
		assert.deepEqual(s.storyTimeDraftOf('412-03-05 22:30'), { year: '412', month: '3', day: '5', time: '22:30' })
		assert.deepEqual(s.storyTimeDraftOf(undefined), { year: '', month: '', day: '', time: '' })
		assert.equal(s.storyTimeDraftValue({ year: '412', month: '3', day: '5', time: '9:05' }), '412-03-05 09:05')
		// A number input's bound value is a number (or null when emptied).
		assert.equal(s.storyTimeDraftValue({ year: 412 as never, month: null as never, day: '', time: '' }), '412')
		assert.equal(s.storyTimeDraftValue({ year: '', month: '3', day: '', time: '' }), null)
		assert.equal(s.storyTimeDraftValue({ year: '412', month: '', day: '5', time: '' }), undefined)
		assert.equal(s.storyTimeDraftValue({ year: '412', month: '1', day: '1', time: '25:00' }), undefined)
		assert.equal(s.numberDraftFor('0.25', { min: 0, max: 1 }, false), 0.25)
		assert.equal(s.numberDraftFor('3.7', { min: 0, max: 10 }, true), 3)
	})

	test("the portraits' bars draw number stats only", () => {
		const state = {
			sessionId: 1,
			loaded: true,
			error: null,
			resolved: { world: {}, cast: { mira: { 'core.hp': 5, 'core.bag': ['a'], 'core.odd': 3 } } },
			slots: [
				{ slotId: 'core:slot/hp@1', key: 'hp', qualifiedKey: 'core.hp', label: 'Hp', type: 'integer', appliesTo: ['cast'] },
				{ slotId: 'core:slot/bag@1', key: 'bag', qualifiedKey: 'core.bag', label: 'Bag', type: 'list', appliesTo: ['cast'] },
				// Bounds in its config, but a choice: not a bar.
				{ slotId: 'core:slot/odd@1', key: 'odd', qualifiedKey: 'core.odd', label: 'Odd', type: 'enum', appliesTo: ['cast'] },
			],
			owners: [
				{
					key: 'mira',
					kind: 'session_cast',
					id: 1,
					label: 'Mira',
					configs: { 'core:slot/hp@1': { min: 0, max: 10 }, 'core:slot/bag@1': { min: 0, max: 4 }, 'core:slot/odd@1': { min: 0, max: 4 } },
				},
			],
		} as unknown as SessionStateV1
		assert.deepEqual(statBarsOf(state, 'mira').map((r) => r.slotId), ['core:slot/hp@1'])
	})
})
