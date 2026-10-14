/**
 * The card dowry — the stats a card carries between installs — and the pure
 * planner that imports it (§B.6 of DESIGN-card-strokes-and-dowry, one test
 * per row of its table).
 *
 * The dowry is not a style pack and not a lorebook export; the planner is
 * not an importer. These tests hand it a fake install and read the plan.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	DOWRY_LIMITS,
	dowryDeclarationHash,
	planDowryImport,
	validateDowry,
	type AttributeSheetProps,
	type AttributeSlotProps,
	type CardDowry,
	type DowryDeclarationKind,
	type DowryLocalView,
} from '@serene-pub/sdk'

const sanity: AttributeSlotProps = {
	type: 'integer',
	label: { en: 'Sanity' },
	appliesTo: ['cast'],
	descriptor: 'How much of their mind is left.',
} as AttributeSlotProps
const sanityEdited: AttributeSlotProps = { ...sanity, descriptor: 'Something else entirely.' } as AttributeSlotProps

const slotDecl = (id: string, props: AttributeSlotProps, origin?: 'stored' | 'plugin') => ({
	id,
	hash: dowryDeclarationHash('slot', props),
	props,
	...(origin ? { origin } : {}),
})
const sheetProps = (...ids: string[]): AttributeSheetProps => ({
	label: { en: 'Kit' },
	slots: ids.map((id) => ({ id })),
})
const sheetDecl = (id: string, props: AttributeSheetProps) => ({ id, hash: dowryDeclarationHash('sheet', props), props })

const dowryOf = (over: Partial<CardDowry> = {}): CardDowry => ({
	format: 1,
	sheets: [],
	rows: [],
	declarations: { slots: [], sheets: [] },
	refs: [],
	...over,
})

/** A fake install: held declarations by id, reserved owners, installed plugins, earlier imports. */
function install(opts: {
	slots?: Record<string, string>
	sheets?: Record<string, string>
	plugins?: string[]
	earlier?: Record<string, string>
}): DowryLocalView {
	const plugins = new Set(opts.plugins ?? [])
	return {
		slot: (id) => (opts.slots?.[id] ? { hash: opts.slots[id]!, origin: 'stored' } : undefined),
		sheet: (id) => (opts.sheets?.[id] ? { hash: opts.sheets[id]!, origin: 'stored' } : undefined),
		isReservedOwner: (seg) => seg === 'core' || plugins.has(seg),
		installedPlugin: (seg) => plugins.has(seg),
		existingByNameAndHash: (kind: DowryDeclarationKind, name: string, hash: string) =>
			opts.earlier?.[`${kind}:${name}:${hash}`],
	}
}
const me = { ownerSegment: 'jody' }
const H = dowryDeclarationHash('slot', sanity)

describe('dowryDeclarationHash', () => {
	test('display text, registry fields and importedFrom are not content', () => {
		const relabelled = { ...sanity, label: { en: 'Mind' } } as AttributeSlotProps
		assert.equal(dowryDeclarationHash('slot', relabelled), H)
		const asDecl = { ...sanity, id: 'x:slot/sanity@1', origin: 'stored', importedFrom: 'bob:slot/sanity@1' }
		assert.equal(dowryDeclarationHash('slot', asDecl as AttributeSlotProps), H)
	})

	test("the descriptor is content; earshot 'all' hashes as absent", () => {
		assert.notEqual(dowryDeclarationHash('slot', sanityEdited), H)
		assert.equal(dowryDeclarationHash('slot', { ...sanity, earshot: 'all' }), H)
		assert.notEqual(dowryDeclarationHash('slot', { ...sanity, earshot: 'holder' }), H)
	})
})

describe('planDowryImport — §B.6, one row each', () => {
	test('same id, same hash → use local; nothing written', () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('bob:slot/sanity@1', sanity)], sheets: [] } }),
			install({ slots: { 'bob:slot/sanity@1': H } }),
			me,
		)
		assert.equal(plan.declarations.slots[0]!.action, 'use-local')
		assert.deepEqual(plan.idMap, {})
		assert.deepEqual(plan.summary, [])
	})

	test('same id, different hash → rename to the importer with a -2 suffix, reported', () => {
		const plan = planDowryImport(
			dowryOf({
				declarations: { slots: [slotDecl('bob:slot/sanity@1', sanityEdited)], sheets: [] },
				rows: [{ slotId: 'bob:slot/sanity@1', value: { v: 3 } }],
			}),
			install({ slots: { 'bob:slot/sanity@1': H } }),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'rename')
		assert.equal(s.action === 'rename' && s.id, 'jody:slot/sanity-2@1')
		assert.equal(s.action === 'rename' && s.from, 'bob:slot/sanity@1')
		assert.deepEqual(plan.idMap, { 'bob:slot/sanity@1': 'jody:slot/sanity-2@1' })
		assert.equal(plan.rows[0]!.slotId, 'jody:slot/sanity-2@1')
		assert.match(plan.summary[0]!, /"Sanity".*jody:slot\/sanity-2@1/)
	})

	test('rename suffix search: -2 taken by other content → -3', () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('jody:slot/sanity@1', sanityEdited)], sheets: [] } }),
			install({ slots: { 'jody:slot/sanity@1': H, 'jody:slot/sanity-2@1': 'other' } }),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action === 'rename' && s.id, 'jody:slot/sanity-3@1')
	})

	test('rename dedupe: the suffixed copy already holds this content → use it', () => {
		const H2 = dowryDeclarationHash('slot', sanityEdited)
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('bob:slot/sanity@1', sanityEdited)], sheets: [] } }),
			install({ slots: { 'bob:slot/sanity@1': H, 'jody:slot/sanity-2@1': H2 } }),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'use-local')
		assert.equal(s.action === 'use-local' && s.id, 'jody:slot/sanity-2@1')
		assert.deepEqual(plan.summary, [])
	})

	test('id unknown, owner a username → re-own to the importer, from kept', () => {
		const plan = planDowryImport(
			dowryOf({
				sheets: ['bob:sheet/kit@1'],
				declarations: {
					slots: [slotDecl('bob:slot/sanity@1', sanity)],
					sheets: [sheetDecl('bob:sheet/kit@1', sheetProps('bob:slot/sanity@1', 'core:slot/hp@1'))],
				},
				rows: [{ slotId: 'bob:slot/sanity@1', value: { v: 7 } }, { slotId: 'core:slot/hp@1', value: { v: 10 } }],
			}),
			install({}),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'reown')
		assert.equal(s.action === 'reown' && s.id, 'jody:slot/sanity@1')
		assert.equal(s.action === 'reown' && s.from, 'bob:slot/sanity@1')
		// Dependency order: the sheet's entries are rewritten through the slot map.
		const sh = plan.declarations.sheets[0]!
		assert.equal(sh.action === 'reown' && sh.id, 'jody:sheet/kit@1')
		assert.deepEqual(
			sh.props.slots.map((e) => e.id),
			['jody:slot/sanity@1', 'core:slot/hp@1'],
		)
		assert.equal(sh.hash, dowryDeclarationHash('sheet', sh.props))
		assert.deepEqual(plan.sheets, ['jody:sheet/kit@1'])
		assert.deepEqual(
			plan.rows.map((r) => r.slotId),
			['jody:slot/sanity@1', 'core:slot/hp@1'],
		)
	})

	test('re-own dedupe by (name, hash): the same card twice makes one declaration', () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('bob:slot/sanity@1', sanity)], sheets: [] } }),
			install({ earlier: { [`slot:sanity:${H}`]: 'jody:slot/sanity-4@1' } }),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'use-local')
		assert.equal(s.action === 'use-local' && s.id, 'jody:slot/sanity-4@1')
		assert.deepEqual(plan.idMap, { 'bob:slot/sanity@1': 'jody:slot/sanity-4@1' })
	})

	test('re-own when the importer already holds that name with other content → suffixed', () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('bob:slot/sanity@1', sanity)], sheets: [] } }),
			install({ slots: { 'jody:slot/sanity@1': 'mine' } }),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action === 'reown' && s.id, 'jody:slot/sanity-2@1')
	})

	test("id unknown, owner the importer → registered as is", () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('jody:slot/sanity@1', sanity)], sheets: [] } }),
			install({}),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'register')
		assert.deepEqual(plan.idMap, {})
	})

	test('id unknown, owner an installed plugin → refused; its rows and sheet entries dropped', () => {
		const plan = planDowryImport(
			dowryOf({
				declarations: {
					slots: [slotDecl('acme:slot/tension@1', sanity, 'plugin')],
					sheets: [sheetDecl('bob:sheet/kit@1', sheetProps('acme:slot/tension@1'))],
				},
				rows: [{ slotId: 'acme:slot/tension@1', value: { v: 1 } }],
			}),
			install({ plugins: ['acme'] }),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'refuse')
		assert.deepEqual(plan.dropped, ['acme:slot/tension@1'])
		assert.deepEqual(plan.rows, [])
		assert.deepEqual(plan.declarations.sheets[0]!.props.slots, [])
		assert.ok(plan.summary.some((l) => /installed plugin "acme" does not declare it/.test(l)))
		assert.ok(plan.summary.some((l) => /1 stat value was left out/.test(l)))
	})

	test("owner an installed plugin that has the id → the plugin's live one, even when it differs", () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('acme:slot/tension@1', sanityEdited, 'plugin')], sheets: [] } }),
			install({ plugins: ['acme'], slots: { 'acme:slot/tension@1': H } }),
			me,
		)
		assert.equal(plan.declarations.slots[0]!.action, 'use-local')
		assert.match(plan.summary[0]!, /the plugin's is used/)
	})

	test('id unknown, owner a plugin not installed → opaque, values kept', () => {
		const plan = planDowryImport(
			dowryOf({
				declarations: { slots: [slotDecl('gone:slot/tension@1', sanity, 'plugin')], sheets: [] },
				rows: [{ slotId: 'gone:slot/tension@1', value: { v: 2 } }],
			}),
			install({}),
			me,
		)
		const s = plan.declarations.slots[0]!
		assert.equal(s.action, 'opaque')
		assert.equal(s.action === 'opaque' && s.id, 'gone:slot/tension@1')
		assert.equal(plan.rows.length, 1)
		assert.match(plan.summary[0]!, /not installed/)
	})

	test('refs: a core id with a different hash → import proceeds, one summary line', () => {
		const plan = planDowryImport(
			dowryOf({
				refs: [
					{ id: 'core:slot/hp@1', hash: 'theirs' },
					{ id: 'core:slot/mp@1', hash: 'same' },
				],
				rows: [{ slotId: 'core:slot/hp@1', value: { v: 5 } }],
			}),
			install({ slots: { 'core:slot/hp@1': 'ours', 'core:slot/mp@1': 'same' } }),
			me,
		)
		assert.equal(plan.rows.length, 1)
		assert.equal(plan.summary.length, 1)
		assert.match(plan.summary[0]!, /"hp" is a newer or older version here/)
	})

	test('an embedded core declaration is never taken from the card', () => {
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('core:slot/hp@1', sanityEdited)], sheets: [] } }),
			install({ slots: { 'core:slot/hp@1': H } }),
			me,
		)
		assert.equal(plan.declarations.slots[0]!.action, 'use-local')
		const missing = planDowryImport(
			dowryOf({ declarations: { slots: [slotDecl('core:slot/zz@1', sanity)], sheets: [] } }),
			install({}),
			me,
		)
		assert.equal(missing.declarations.slots[0]!.action, 'refuse')
	})

	test('the plan trusts the content, not the file\'s hash', () => {
		const forged = { ...slotDecl('bob:slot/sanity@1', sanityEdited), hash: H }
		const plan = planDowryImport(
			dowryOf({ declarations: { slots: [forged], sheets: [] } }),
			install({ slots: { 'bob:slot/sanity@1': H } }),
			me,
		)
		assert.equal(plan.declarations.slots[0]!.action, 'rename')
	})
})

describe('validateDowry', () => {
	test('a good dowry is clean', () => {
		const dowry = dowryOf({
			sheets: ['bob:sheet/kit@1'],
			declarations: {
				slots: [slotDecl('bob:slot/sanity@1', sanity)],
				sheets: [sheetDecl('bob:sheet/kit@1', sheetProps('bob:slot/sanity@1'))],
			},
			rows: [{ slotId: 'bob:slot/sanity@1', value: { v: 1 } }, { slotId: 'bob:slot/sanity@1', config: { max: 9 } }],
			refs: [{ id: 'core:slot/hp@1', hash: 'h' }],
		})
		assert.deepEqual(validateDowry(dowry), [])
	})

	test('format, row shape, row size, row count', () => {
		assert.equal(validateDowry({ ...dowryOf(), format: 2 })[0]!.path, 'format')
		assert.equal(validateDowry(dowryOf({ rows: [{ slotId: 'bob:slot/a@1' }] }))[0]!.path, 'rows[0]')
		assert.equal(
			validateDowry(dowryOf({ rows: [{ slotId: 'bob:slot/a@1', value: { v: 'x'.repeat(DOWRY_LIMITS.maxRowJsonBytes) } }] }))[0]!
				.path,
			'rows[0].value',
		)
		const many = Array.from({ length: DOWRY_LIMITS.maxRows + 1 }, () => ({ slotId: 'bob:slot/a@1', value: { v: 1 } }))
		assert.equal(validateDowry(dowryOf({ rows: many }))[0]!.path, 'rows')
		assert.equal(validateDowry(dowryOf({ rows: [{ slotId: 'nope', value: { v: 1 } }] }))[0]!.path, 'rows[0].slotId')
	})

	test('declarations: hash mismatch, core embedded, too many, wrong kind', () => {
		const forged = { ...slotDecl('bob:slot/sanity@1', sanity), hash: 'x' }
		assert.equal(validateDowry(dowryOf({ declarations: { slots: [forged], sheets: [] } }))[0]!.path, 'declarations.slots[0].hash')
		assert.match(
			validateDowry(dowryOf({ declarations: { slots: [slotDecl('core:slot/hp@1', sanity)], sheets: [] } }))[0]!.message,
			/referenced, never embedded/,
		)
		const many = Array.from({ length: DOWRY_LIMITS.maxDeclarations + 1 }, (_, i) => slotDecl(`bob:slot/s${i}@1`, sanity))
		assert.ok(validateDowry(dowryOf({ declarations: { slots: many, sheets: [] } })).some((f) => f.path === 'declarations'))
		assert.equal(
			validateDowry(dowryOf({ declarations: { slots: [slotDecl('bob:sheet/kit@1', sanity)], sheets: [] } }))[0]!.path,
			'declarations.slots[0].id',
		)
	})

	test('not an object; refs shape', () => {
		assert.equal(validateDowry(null)[0]!.path, 'dowry')
		assert.equal(validateDowry({ ...dowryOf(), refs: [{ id: 'x' }] })[0]!.path, 'refs[0]')
	})
})
