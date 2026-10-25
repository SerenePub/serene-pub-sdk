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
	derivedRowsAt,
	derivedRowsOf,
	enumValues,
	formatSlotValue,
	isBarSlot,
	numberDraftValue,
	pickedNames,
	slotValueText,
	slotWritable,
	statsSettingsOf,
	statsView,
	statTrailByText,
	statTrailRows,
	textDraftValue,
} from '../core-catalog/src/shared/ui/session-state/index.js'

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

/** Every owner a shown Stats view draws, in order. */
const keys = (v: { groups: Array<{ owners: Array<{ owner: { key: string } }> }> }) =>
	v.groups.flatMap((g) => g.owners.map((o) => o.owner.key))

// ⏳ `worldStateView` went with the World State wrapper (AUDIT B, 2026-10-17):
// the world as a strip and its places are `statsView` with `owners: world`,
// covered below.


describe('statsView', () => {
	test('scene: only the cast members with a value in play', () => {
		const v = statsView(state(), {})
		assert.equal(v.status, 'shown')
		if (v.status === 'shown')
			assert.deepEqual(v.groups.flatMap((g) => g.owners.map((m) => [m.owner.label, m.slots.map((s) => s.value)])), [['Mira', [14]]])
	})
	test('all: every cast member, the world never', () => {
		const v = statsView(state(), { castScope: 'all', density: 'compact' })
		assert.equal(v.density, 'compact')
		if (v.status === 'shown') assert.deepEqual(keys(v), ['mira', 'bram'])
	})
	test('🚧 a card-less player seat (`player_seat`) is a cast member: its values ride in `resolved.cast`', () => {
		const withSeat = state({
			resolved: { world: {}, cast: { mira: { 'core.hp': 14 }, bram: {}, ash: { 'core.hp': 9 } } },
			owners: [
				...state().owners,
				{ key: 'ash', kind: 'player_seat', id: 4, label: 'Ash', configs: { 'core:slot/hp@1': { min: 0, max: 20 } } },
			],
		})
		const v = statsView(withSeat, {})
		if (v.status === 'shown')
			assert.deepEqual(v.groups.flatMap((g) => g.owners.map((m) => [m.owner.key, m.group, m.slots.map((s) => s.value)])), [
				['mira', 'cast', [14]],
				['ash', 'cast', [9]],
			])
		else assert.fail(v.status)
		const picked = statsView(withSeat, { owners: 'pick', pickOwners: ['Ash'] })
		if (picked.status === 'shown') assert.deepEqual(keys(picked), ['ash'])
		else assert.fail(picked.status)
	})
	test('pick: by label or key; nobody matching says so', () => {
		const v = statsView(state(), { owners: 'pick', pickOwners: ['bram'] })
		if (v.status === 'shown') assert.deepEqual(keys(v), ['bram'])
		assert.deepEqual(statsView(state(), { owners: 'pick', pickOwners: ['nobody'] }), {
			status: 'nothing-shown',
			density: 'full',
			arrangement: 'cards',
			owners: 'pick',
			castScope: 'scene',
			// 🚧 RF fix 8: whether the session's rules declare any attribute (a card says so when none).
			declaresAttributes: true,
		})
	})
	test('loading, and nothing declared', () => {
		assert.equal(statsView(state({ loaded: false }), {}).status, 'loading')
		assert.equal(statsView(state({ slots: [] }), {}).status, 'none-declared')
		assert.deepEqual(statsView(state({ resolved: { world: {}, cast: {} } }), {}), {
			status: 'nothing-shown',
			density: 'full',
			arrangement: 'cards',
			owners: 'cast',
			castScope: 'scene',
			declaresAttributes: true,
		})
	})
})

// The Stats uplift (W7, 2026-10-11): owners × slots × arrangement, and the
// settings written before it, read as today's.
describe('statsView — slots: bars, arrangements, and the settings before W7', () => {
	test('bars keeps the numbers with a floor and a ceiling above it, nothing else', () => {
		const s = state({
			slots: [slot('weather', 'enum'), slot('hp', 'integer'), slot('gold', 'integer'), slot('flat', 'integer')] as SessionStateV1['slots'],
			resolved: { world: { 'core.weather': 'rain' }, cast: { mira: { 'core.hp': 14, 'core.gold': 3, 'core.flat': 1 } } },
			owners: [
				state().owners[0]!,
				{
					key: 'mira',
					kind: 'session_cast',
					id: 11,
					label: 'Mira',
					configs: { 'core:slot/hp@1': { min: 0, max: 20 }, 'core:slot/gold@1': { min: 0 }, 'core:slot/flat@1': { min: 5, max: 5 } },
				},
			],
		})
		const v = statsView(s, { owners: 'all', slots: 'bars' })
		assert.equal(v.status, 'shown')
		// The world's enum is not a bar, so the world has nothing to show and is left out.
		if (v.status === 'shown') assert.deepEqual(v.groups.map((g) => [g.kind, g.owners.map((o) => o.slots.map((x) => x.slot.key))]), [['cast', [['hp']]]])
	})
	test('a list or a strip leaves out an owner with nothing to show; cards keep its card', () => {
		const cards = statsView(state(), { castScope: 'all', slots: 'pick', pickSlots: ['weather'] })
		if (cards.status === 'shown') assert.deepEqual(keys(cards), ['mira', 'bram'])
		assert.equal(statsView(state(), { castScope: 'all', slots: 'pick', pickSlots: ['weather'], arrangement: 'strip' }).status, 'nothing-shown')
	})
	test('⏳ members, pickMembers and World State’s layout read as castScope, owners/pickOwners and arrangement', () => {
		assert.deepEqual(statsSettingsOf({ members: 'all' }), statsSettingsOf({ castScope: 'all' }))
		assert.deepEqual(statsSettingsOf({ members: 'pick', pickMembers: ['Bram'] }), statsSettingsOf({ owners: 'pick', pickOwners: ['bram'] }))
		// World State's stored `layout` is translated by the app's settings reader alone
		// (AUDIT B, 2026-10-17): here it is not a setting, and the arrangement stays its default.
		assert.equal(statsSettingsOf({ layout: 'list' }).arrangement, 'cards')
		// Written the new way, the new key wins.
		assert.equal(statsSettingsOf({ members: 'all', castScope: 'scene' }).castScope, 'scene')
		assert.equal(statsSettingsOf({ layout: 'list', arrangement: 'strip' }).arrangement, 'strip')
		assert.deepEqual(statsSettingsOf({}), {
			owners: 'cast',
			castScope: 'scene',
			slots: 'all',
			arrangement: 'cards',
			density: 'full',
			pickOwners: [],
			pickSlots: [],
			// 🚧 2026-10-17 (DC walk 5): the stats a copy leaves out.
			hideSlots: [],
			trail: true,
			emptyState: null,
			timeFormat: null,
			// 🚧 RF fix 8: a genre's tool state is a block of its own, shown unless a copy hides it.
			toolState: 'shown',
		})
		assert.equal(statsSettingsOf({ trail: false }).trail, false)
	})
	test('isBarSlot: a number with both bounds, the ceiling above the floor', () => {
		const hp = slot('hp', 'integer') as SessionStateV1['slots'][number]
		assert.equal(isBarSlot(hp, { min: 0, max: 20 }), true)
		assert.equal(isBarSlot(hp, { min: 0 }), false)
		assert.equal(isBarSlot(hp, { min: 4, max: 4 }), false)
		assert.equal(isBarSlot(slot('mood', 'enum') as SessionStateV1['slots'][number], { min: 0, max: 20 }), false)
	})
})

describe('the stat trail (F2)', () => {
	const hp = { type: 'integer', field: undefined } as unknown as SessionStateV1['slots'][number]
	test('rows newest first, each value spelled as the slot draws it; nothing before reads empty', () => {
		const rows = statTrailRows(
			hp,
			[
				{ messageId: 4, at: 10, from: null, to: 18, by: 'model' },
				{ messageId: null, at: 20, from: 18, to: null, by: 'user' },
				{ messageId: 9, at: 30, from: null, to: 3, by: 'nobody' },
				'not a change',
			],
			(s) => s,
		)
		assert.deepEqual(
			rows.map((r) => [r.messageId, r.at, r.from, r.to, r.by]),
			[
				[9, 30, '', '3', 'pipeline'],
				[null, 20, '18', 'cleared', 'user'],
				[4, 10, '', '18', 'model'],
			],
		)
		assert.equal(new Set(rows.map((r) => r.key)).size, 3)
	})
	test('an answer that is not a list is an empty trail; who changed it, in words', () => {
		assert.deepEqual(statTrailRows(hp, undefined, (s) => s), [])
		assert.deepEqual(statTrailRows(hp, { changes: [] }, (s) => s), [])
		assert.deepEqual(
			(['user', 'model', 'pipeline'] as const).map((by) => statTrailByText(by, (s) => s)),
			['Edited', 'From the story', 'Automatic'],
		)
	})
})

describe('a scope not granted', () => {
	test('is its own state — never loading — and only a definite `false` means it', () => {
		assert.deepEqual(statsView(undefined, { density: 'compact' }, false), {
			status: 'not-granted',
			density: 'compact',
			arrangement: 'cards',
			owners: 'cast',
			declaresAttributes: false,
		})
		// Not said yet (`undefined`) is still loading; granted draws as ever.
		assert.equal(statsView(undefined, {}, undefined).status, 'loading')
		assert.equal(statsView(state(), {}, true).status, 'shown')
	})
})

// ─── Phase 2: drawing and editing by stat shape ─────────────────────────────

describe('a slot is drawn by its stat shape', async () => {
	const s = await import('../core-catalog/src/shared/ui/session-state/index.js')
	const { statBarsOf } = await import('../core-catalog/src/shared/ui/scene-portraits/index.js')
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

	test('a choice reads as its option\'s label; one with no label reads as it always did', () => {
		const order = {
			type: 'enum' as const,
			field: { type: 'enum' as const, of: ['hold', 'taken-out'], members: [{ key: 'hold', label: { en: 'Hold your ground' } }] },
		}
		assert.equal(s.shownValueText(order, 'hold', t), 'Hold your ground')
		assert.equal(s.shownValueText(order, 'taken-out', t), 'taken-out')
		assert.equal(s.choiceOptionText(order, 'hold'), 'Hold your ground')
		assert.equal(s.choiceOptionText({ type: 'enum' as const, field: { type: 'enum' as const } }, 'follow'), 'follow')
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

describe('🚧 the sheet: player seats and worked-out values (2026-10-18)', () => {
	test('owners: seats — every player seat (card-less or a card seated), the viewer\'s own first; never a companion', () => {
		const s = state({
			resolved: { world: {}, cast: { mira: { 'core.hp': 14 }, bram: { 'core.hp': 3 }, ash: { 'core.hp': 9 } } },
			owners: [
				{ key: 'mira', kind: 'session_cast', id: 1, label: 'Mira', seat: true, configs: { 'core:slot/hp@1': { min: 0, max: 20 } } } as never,
				{ key: 'bram', kind: 'session_cast', id: 2, label: 'Bram', configs: { 'core:slot/hp@1': { min: 0, max: 20 } } },
				{ key: 'ash', kind: 'player_seat', id: 4, label: 'Ash', mine: true, seat: true, configs: { 'core:slot/hp@1': { min: 0, max: 20 } } } as never,
			],
		})
		const v = statsView(s, { owners: 'seats', arrangement: 'faces' })
		if (v.status === 'shown') assert.deepEqual(keys(v), ['ash', 'mira'])
		else assert.fail(v.status)
		assert.equal(statsSettingsOf({ owners: 'seats' }).owners, 'seats')
	})
	test('derived values read as rows after the leading bars; anything malformed is left out', () => {
		const owner = {
			key: 'ash', kind: 'player_seat', id: 4, label: 'Ash', configs: {},
			derived: [
				{ key: 'armour-class', label: 'Armour class', value: 16 },
				{ key: 'broken', label: '', value: 3 },
				{ key: 'nan', label: 'Nothing', value: Number.NaN },
			],
		} as never
		assert.deepEqual(derivedRowsOf(owner), [{ key: 'armour-class', label: 'Armour class', value: '16' }])
		assert.deepEqual(derivedRowsOf({ key: 'x', kind: 'session', id: 1, label: 'World', configs: {} }), [])
		const hp = { slot: { slotId: 'core:slot/hp@1', key: 'hp', qualifiedKey: 'core.hp', label: 'Health', type: 'integer', appliesTo: ['cast'] }, config: { min: 0, max: 20 }, value: 9 }
		const cls = { slot: { slotId: 'core:slot/character-class@1', key: 'character-class', qualifiedKey: 'core.character-class', label: 'Class', type: 'string', appliesTo: ['cast'] }, config: {}, value: 'Wizard' }
		assert.equal(derivedRowsAt([hp, cls] as never), 1)
		assert.equal(derivedRowsAt([cls, hp] as never), 0)
	})
})
