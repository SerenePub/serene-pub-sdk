/**
 * 🚧 Sheet latitude (owner rulings 2026-11-05, plan §25 ★1 and ★7): the levels, the causes, and
 * the one pure judge (`sheetLatitudeAllows`) the host's write gate and the sheet's edit controls
 * share — so a table that loosens or closes hand editing is judged the same on both sides.
 *
 * The matrices are written out by hand, row by row: a test that re-derived the verdict with the
 * judge's own rules would pass whatever the judge did.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	HAND_EDIT_CAUSES,
	HAND_EDIT_SENTENCES,
	ITEM_MOVE_LATITUDES,
	SHEET_LATITUDES,
	itemMoveLatitudeOf,
	sheetLatitudeAllows,
	sheetLatitudeOf,
	type AttributeChanger,
	type HandEditAct,
	type HandEditCause,
	type HandEditorRole,
	type ItemMoveLatitude,
	type SheetLatitude,
	type SheetLatitudeQuestion,
} from '@serene-pub/sdk'

type Whose = 'own' | 'other'
const OK = { ok: true } as const
const no = (cause: HandEditCause) => ({ ok: false, cause }) as const

const ask = (q: Partial<SheetLatitudeQuestion>) =>
	sheetLatitudeAllows({ role: 'owner', act: 'set', whose: 'own', latitude: 'as-ruled', ...q })

const CHANGED_BY: ReadonlyArray<readonly AttributeChanger[] | undefined> = [
	undefined,
	['everyone'],
	['holder'],
	['gm'],
	['rules'],
]
const label = (cb: readonly AttributeChanger[] | undefined) => (cb ? cb.join('+') : 'absent')

describe('the vocabulary', () => {
	test('levels and causes, in order', () => {
		assert.deepEqual([...SHEET_LATITUDES], ['as-ruled', 'no-edits', 'all-own', 'all-any'])
		assert.deepEqual(
			[...ITEM_MOVE_LATITUDES],
			['follow-sheet', 'no-moves', 'own-items', 'any-items'],
		)
		assert.deepEqual(
			[...HAND_EDIT_CAUSES],
			[
				'watching',
				'owner-locks',
				'unheard',
				'locked',
				'no-edits',
				'not-theirs',
				'changed-by',
				'no-moves',
			],
		)
		assert.ok(
			Object.isFrozen(SHEET_LATITUDES) &&
				Object.isFrozen(ITEM_MOVE_LATITUDES) &&
				Object.isFrozen(HAND_EDIT_CAUSES),
		)
	})
})

describe('watchers and configure', () => {
	const acts: HandEditAct[] = ['set', 'configure', 'take-from', 'put-on']
	test('a watcher is refused every act, whatever the latitude', () => {
		for (const act of acts)
			for (const latitude of SHEET_LATITUDES)
				for (const whose of ['own', 'other'] as const)
					assert.deepEqual(
						ask({ role: 'watcher', act, latitude, whose, itemMoves: 'any-items' }),
						no('watching'),
						`${act} ${latitude} ${whose}`,
					)
	})

	test('configure: the session owner may, a player may not — whatever the latitude and lock', () => {
		for (const latitude of SHEET_LATITUDES)
			for (const lock of [undefined, 'none', 'people', 'all'] as const)
				for (const heard of [undefined, false]) {
					assert.deepEqual(
						ask({
							role: 'owner',
							act: 'configure',
							latitude,
							lock,
							heard,
							whose: 'other',
						}),
						OK,
						`owner ${latitude} ${lock}`,
					)
					assert.deepEqual(
						ask({
							role: 'player',
							act: 'configure',
							latitude,
							lock,
							heard,
							whose: 'own',
						}),
						no('owner-locks'),
						`player ${latitude} ${lock}`,
					)
				}
	})
})

describe('the sheet matrix (set)', () => {
	type Row = [
		role: HandEditorRole,
		whose: Whose,
		changedBy: readonly AttributeChanger[] | undefined,
		expected: ReturnType<typeof no> | typeof OK,
	]
	const [ABSENT, EVERYONE, HOLDER, GM, RULES] = CHANGED_BY

	const asRuled: Row[] = [
		['owner', 'own', ABSENT, OK],
		['owner', 'own', EVERYONE, OK],
		['owner', 'own', HOLDER, OK],
		['owner', 'own', GM, OK],
		['owner', 'own', RULES, no('changed-by')],
		['owner', 'other', ABSENT, OK],
		['owner', 'other', EVERYONE, OK],
		['owner', 'other', HOLDER, OK],
		['owner', 'other', GM, OK],
		['owner', 'other', RULES, no('changed-by')],
		['player', 'own', ABSENT, OK],
		['player', 'own', EVERYONE, OK],
		['player', 'own', HOLDER, OK],
		['player', 'own', GM, no('changed-by')],
		['player', 'own', RULES, no('changed-by')],
		['player', 'other', ABSENT, no('not-theirs')],
		['player', 'other', EVERYONE, no('not-theirs')],
		['player', 'other', HOLDER, no('not-theirs')],
		['player', 'other', GM, no('not-theirs')],
		['player', 'other', RULES, no('not-theirs')],
	]

	test('as-ruled', () => {
		for (const [role, whose, changedBy, expected] of asRuled)
			assert.deepEqual(
				ask({ role, whose, changedBy, latitude: 'as-ruled' }),
				expected,
				`${role} ${whose} ${label(changedBy)}`,
			)
	})

	test('an empty changedBy list means anyone', () => {
		assert.deepEqual(ask({ role: 'player', whose: 'own', changedBy: [] }), OK)
		assert.deepEqual(ask({ role: 'owner', whose: 'other', changedBy: [] }), OK)
	})

	test('a changedBy that names several writers passes when one fits', () => {
		assert.deepEqual(ask({ role: 'player', whose: 'own', changedBy: ['rules', 'holder'] }), OK)
		assert.deepEqual(ask({ role: 'owner', whose: 'own', changedBy: ['rules', 'gm'] }), OK)
		assert.deepEqual(
			ask({ role: 'player', whose: 'own', changedBy: ['rules', 'gm'] }),
			no('changed-by'),
		)
	})

	// The levels that set `changedBy` aside answer the same for every changedBy.
	const byRoleWhose: Record<
		Exclude<SheetLatitude, 'as-ruled'>,
		Array<[HandEditorRole, Whose, ReturnType<typeof no> | typeof OK]>
	> = {
		'no-edits': [
			['owner', 'own', no('no-edits')],
			['owner', 'other', no('no-edits')],
			['player', 'own', no('no-edits')],
			['player', 'other', no('no-edits')],
		],
		'all-own': [
			['owner', 'own', OK],
			['owner', 'other', no('not-theirs')],
			['player', 'own', OK],
			['player', 'other', no('not-theirs')],
		],
		'all-any': [
			['owner', 'own', OK],
			['owner', 'other', OK],
			['player', 'own', OK],
			['player', 'other', OK],
		],
	}
	for (const [latitude, rows] of Object.entries(byRoleWhose) as Array<
		[Exclude<SheetLatitude, 'as-ruled'>, (typeof byRoleWhose)['all-own']]
	>) {
		test(latitude, () => {
			for (const [role, whose, expected] of rows)
				for (const changedBy of CHANGED_BY)
					assert.deepEqual(
						ask({ role, whose, latitude, changedBy }),
						expected,
						`${role} ${whose} ${label(changedBy)}`,
					)
		})
	}

	test('all-own and all-any pass a rules-only attribute', () => {
		assert.deepEqual(
			ask({ role: 'player', whose: 'own', latitude: 'all-own', changedBy: ['rules'] }),
			OK,
		)
		assert.deepEqual(
			ask({ role: 'player', whose: 'other', latitude: 'all-any', changedBy: ['rules'] }),
			OK,
		)
	})
})

describe('locks and earshot are never passed', () => {
	test('lock all refuses every level, the session owner included', () => {
		for (const latitude of SHEET_LATITUDES)
			for (const role of ['owner', 'player'] as const)
				assert.deepEqual(
					ask({ role, latitude, lock: 'all', whose: 'own' }),
					no('locked'),
					`${role} ${latitude}`,
				)
		for (const itemMoves of ITEM_MOVE_LATITUDES)
			assert.deepEqual(
				ask({ role: 'owner', act: 'put-on', itemMoves, latitude: 'all-any', lock: 'all' }),
				no('locked'),
				itemMoves,
			)
	})

	test('lock people refuses a player at all-any and passes the session owner', () => {
		assert.deepEqual(
			ask({ role: 'player', latitude: 'all-any', lock: 'people', whose: 'own' }),
			no('locked'),
		)
		assert.deepEqual(
			ask({ role: 'player', latitude: 'as-ruled', lock: 'people', whose: 'own' }),
			no('locked'),
		)
		assert.deepEqual(
			ask({ role: 'owner', latitude: 'all-any', lock: 'people', whose: 'other' }),
			OK,
		)
		assert.deepEqual(
			ask({ role: 'owner', latitude: 'as-ruled', lock: 'people', whose: 'other' }),
			OK,
		)
	})

	test('lock none (or absent) locks nothing', () => {
		assert.deepEqual(ask({ role: 'player', latitude: 'all-own', lock: 'none' }), OK)
		assert.deepEqual(ask({ role: 'player', latitude: 'all-own' }), OK)
	})

	test('an unheard value refuses the session owner at all-any, and at the move levels', () => {
		assert.deepEqual(
			ask({ role: 'owner', latitude: 'all-any', whose: 'other', heard: false }),
			no('unheard'),
		)
		assert.deepEqual(
			ask({ role: 'player', latitude: 'all-own', whose: 'own', heard: false }),
			no('unheard'),
		)
		assert.deepEqual(
			ask({ role: 'owner', act: 'take-from', itemMoves: 'any-items', heard: false }),
			no('unheard'),
		)
		assert.deepEqual(
			ask({ role: 'owner', latitude: 'all-any', whose: 'other', heard: true }),
			OK,
		)
	})

	test('an unheard value is reported before a lock', () => {
		assert.deepEqual(ask({ role: 'owner', heard: false, lock: 'all' }), no('unheard'))
	})
})

describe('item moves', () => {
	const sides: HandEditAct[] = ['take-from', 'put-on']

	test('no-moves refuses every side, whatever the sheet latitude', () => {
		for (const act of sides)
			for (const role of ['owner', 'player'] as const)
				for (const whose of ['own', 'other'] as const)
					assert.deepEqual(
						ask({ role, act, whose, itemMoves: 'no-moves', latitude: 'all-any' }),
						no('no-moves'),
						`${act} ${role} ${whose}`,
					)
	})

	test("own-items: the role's own side passes (changedBy set aside), another's is not theirs", () => {
		for (const act of sides)
			for (const role of ['owner', 'player'] as const)
				for (const changedBy of CHANGED_BY) {
					assert.deepEqual(
						ask({
							role,
							act,
							whose: 'own',
							itemMoves: 'own-items',
							latitude: 'no-edits',
							changedBy,
						}),
						OK,
						`${act} ${role} ${label(changedBy)}`,
					)
					assert.deepEqual(
						ask({
							role,
							act,
							whose: 'other',
							itemMoves: 'own-items',
							latitude: 'all-any',
							changedBy,
						}),
						no('not-theirs'),
						`${act} ${role} ${label(changedBy)}`,
					)
				}
	})

	test('own-items passes a rules-only attribute on own', () => {
		assert.deepEqual(
			ask({
				role: 'player',
				act: 'take-from',
				whose: 'own',
				itemMoves: 'own-items',
				changedBy: ['rules'],
			}),
			OK,
		)
	})

	test("any-items passes anyone's, whatever the sheet latitude", () => {
		for (const act of sides)
			for (const role of ['owner', 'player'] as const)
				for (const whose of ['own', 'other'] as const)
					assert.deepEqual(
						ask({
							role,
							act,
							whose,
							itemMoves: 'any-items',
							latitude: 'no-edits',
							changedBy: ['rules'],
						}),
						OK,
						`${act} ${role} ${whose}`,
					)
	})

	test('follow-sheet is judged as a set under the same latitude', () => {
		const expected: Array<
			[
				SheetLatitude,
				HandEditorRole,
				Whose,
				readonly AttributeChanger[] | undefined,
				ReturnType<typeof no> | typeof OK,
			]
		> = [
			['as-ruled', 'player', 'own', ['holder'], OK],
			['as-ruled', 'player', 'own', ['rules'], no('changed-by')],
			['as-ruled', 'player', 'other', undefined, no('not-theirs')],
			['as-ruled', 'owner', 'other', ['holder'], OK],
			['no-edits', 'owner', 'own', undefined, no('no-edits')],
			['all-own', 'player', 'own', ['rules'], OK],
			['all-own', 'player', 'other', undefined, no('not-theirs')],
			['all-any', 'player', 'other', ['rules'], OK],
		]
		for (const act of sides)
			for (const [latitude, role, whose, changedBy, want] of expected) {
				assert.deepEqual(
					ask({ role, act, whose, latitude, changedBy, itemMoves: 'follow-sheet' }),
					want,
					`${act} ${latitude} ${role} ${whose} ${label(changedBy)}`,
				)
				assert.deepEqual(
					ask({ role, act: 'set', whose, latitude, changedBy }),
					want,
					`set ${latitude} ${role} ${whose} ${label(changedBy)}`,
				)
			}
	})

	test('follow-sheet equals the set verdict across the whole matrix', () => {
		for (const latitude of SHEET_LATITUDES)
			for (const role of ['owner', 'player'] as const)
				for (const whose of ['own', 'other'] as const)
					for (const changedBy of CHANGED_BY)
						for (const act of sides)
							assert.deepEqual(
								ask({
									role,
									act,
									whose,
									latitude,
									changedBy,
									itemMoves: 'follow-sheet',
								}),
								ask({ role, act: 'set', whose, latitude, changedBy }),
								`${act} ${latitude} ${role} ${whose} ${label(changedBy)}`,
							)
	})

	test('an absent itemMoves behaves as follow-sheet', () => {
		for (const latitude of SHEET_LATITUDES)
			for (const whose of ['own', 'other'] as const)
				for (const act of sides)
					assert.deepEqual(
						ask({ role: 'player', act, whose, latitude, changedBy: ['gm'] }),
						ask({
							role: 'player',
							act,
							whose,
							latitude,
							changedBy: ['gm'],
							itemMoves: 'follow-sheet',
						}),
						`${act} ${latitude} ${whose}`,
					)
		assert.deepEqual(
			ask({ role: 'player', act: 'put-on', whose: 'own', latitude: 'no-edits' }),
			no('no-edits'),
		)
	})

	test('a give is two sides: a player at own-items gives own to another; the receiver accepts as their own put-on', () => {
		const itemMoves: ItemMoveLatitude = 'own-items'
		// The giver's side, seen from the giver.
		assert.deepEqual(
			ask({
				role: 'player',
				act: 'take-from',
				whose: 'own',
				itemMoves,
				changedBy: ['rules'],
			}),
			OK,
		)
		// The receiver's side, seen from the giver: not theirs — an offer, not a write.
		assert.deepEqual(
			ask({ role: 'player', act: 'put-on', whose: 'other', itemMoves, changedBy: ['rules'] }),
			no('not-theirs'),
		)
		// The receiver accepting it on their own sheet.
		assert.deepEqual(
			ask({ role: 'player', act: 'put-on', whose: 'own', itemMoves, changedBy: ['rules'] }),
			OK,
		)
	})

	test("a drop is the giver's side only; a pick-up the receiver's side only", () => {
		assert.deepEqual(
			ask({ role: 'player', act: 'take-from', whose: 'own', itemMoves: 'own-items' }),
			OK,
		)
		assert.deepEqual(
			ask({ role: 'player', act: 'put-on', whose: 'own', itemMoves: 'own-items' }),
			OK,
		)
		assert.deepEqual(
			ask({ role: 'player', act: 'take-from', whose: 'other', itemMoves: 'own-items' }),
			no('not-theirs'),
		)
	})
})

describe('reading a stored value', () => {
	test('sheetLatitudeOf', () => {
		for (const level of SHEET_LATITUDES) assert.equal(sheetLatitudeOf(level), level)
		assert.equal(sheetLatitudeOf(undefined), 'as-ruled')
		assert.equal(sheetLatitudeOf('none'), 'as-ruled')
		assert.equal(sheetLatitudeOf(42), 'as-ruled')
		assert.equal(sheetLatitudeOf(null), 'as-ruled')
		assert.equal(sheetLatitudeOf('follow-sheet'), 'as-ruled')
	})

	test('itemMoveLatitudeOf', () => {
		for (const level of ITEM_MOVE_LATITUDES) assert.equal(itemMoveLatitudeOf(level), level)
		assert.equal(itemMoveLatitudeOf(undefined), 'follow-sheet')
		assert.equal(itemMoveLatitudeOf('none'), 'follow-sheet')
		assert.equal(itemMoveLatitudeOf(42), 'follow-sheet')
		assert.equal(itemMoveLatitudeOf('all-any'), 'follow-sheet')
	})
})

describe('the default sentence per cause (owner ruling ★sl-5, 2026-11-05)', () => {
	test('one sentence for every cause, and no other', () => {
		assert.deepEqual(Object.keys(HAND_EDIT_SENTENCES).sort(), [...HAND_EDIT_CAUSES].sort())
		assert.ok(Object.isFrozen(HAND_EDIT_SENTENCES))
	})

	test('each reads as a sentence; those that name the value fill it in', () => {
		for (const cause of HAND_EDIT_CAUSES) {
			const said = HAND_EDIT_SENTENCES[cause]({ attribute: 'Health' })
			assert.match(said, /^[A-Z].*\.$/, cause)
			assert.equal(said.includes('{'), false, cause)
		}
		for (const cause of ['unheard', 'locked', 'not-theirs', 'changed-by'] as const)
			assert.ok(HAND_EDIT_SENTENCES[cause]({ attribute: 'Health' }).includes('Health'), cause)
	})

	test('the words, as written', () => {
		const w = { attribute: 'Health' }
		assert.equal(HAND_EDIT_SENTENCES.watching(w), "You're watching this session; only its players and owner change sheets.")
		assert.equal(HAND_EDIT_SENTENCES['owner-locks'](w), 'Only the session owner locks or unlocks a stat.')
		assert.equal(HAND_EDIT_SENTENCES.unheard(w), 'Only whoever hears Health can change it.')
		assert.equal(HAND_EDIT_SENTENCES.locked(w), 'Health is locked.')
		assert.equal(
			HAND_EDIT_SENTENCES['no-edits'](w),
			"Sheets aren't changed by hand in this session. The session owner can change that in the session's settings, under Players.",
		)
		assert.equal(HAND_EDIT_SENTENCES['not-theirs'](w), "You can change only your own characters' Health.")
		assert.equal(HAND_EDIT_SENTENCES['changed-by'](w), 'Only the game master or the rules change Health.')
		assert.equal(
			HAND_EDIT_SENTENCES['no-moves'](w),
			"Items aren't moved by hand in this session. The session owner can change that in the session's settings, under Players.",
		)
	})
})
