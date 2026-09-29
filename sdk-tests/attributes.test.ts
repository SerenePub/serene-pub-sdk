/**
 * Attribute slots — the declaration registry and what a value has to satisfy.
 *
 * Core owns the five types and nobody adds one; a genre composes definitions
 * from them. These are the two halves that make that safe: a declaration that
 * cannot describe itself is refused at the author, and a value is checked
 * against the configuration in force for *its own owner* rather than against
 * the declaration's base.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	applyListOp,
	attributeSheets,
	attributeSlots,
	checkSlotValue,
	declarationHash,
	defineAttributeSheet,
	defineAttributeSlot,
	definePluginAttributeSheet,
	definePluginAttributeSlot,
	defineStoredAttributeSheet,
	defineStoredAttributeSlot,
	derivations,
	genre,
	genreAllowsCustomAttributes,
	genreSlots,
	getAttributeSheet,
	getAttributeSlot,
	isAnchorOpen,
	isReservedAttributeOwner,
	openAnchorFor,
	reserveAttributeOwner,
	resolveSlotConfig,
	retireAttributeSheet,
	retireAttributeSlot,
	reviveAttributeSlot,
	genreSheets,
	slotAppliesTo,
	slotDerivation,
	slotPickable,
	slotEarshot,
	slotOwner,
	slotSlug,
	slotVersion,
	SLOT_DISPLAY_KEYS,
	_clearAttributeSheets,
	_clearAttributeSlots,
	_clearGenres,
	_clearReservedAttributeOwners,
	type AttributeSlotProps,
	type SlotValue,
	type TurnMessage,
} from '@serene-pub/sdk'

const fresh = () => {
	_clearAttributeSlots()
	_clearAttributeSheets()
	_clearReservedAttributeOwners()
	_clearGenres()
}

const hp = () =>
	defineAttributeSlot('core:slot/hp@1', {
		type: 'integer',
		label: { en: 'Health' },
		descriptor: 'How much punishment they can still take.',
		appliesTo: ['cast'],
		config: { min: 0, max: 20 },
		default: 20,
	})

const mood = () =>
	defineAttributeSlot('core:slot/mood@1', {
		type: 'enum',
		descriptor: 'How they are feeling right now.',
		appliesTo: ['cast'],
		config: { of: ['calm', 'wary', 'furious'] },
	})

describe('the registry', () => {
	test('declares, reads back, and lists', () => {
		_clearAttributeSlots()
		const decl = hp()
		assert.equal(getAttributeSlot('core:slot/hp@1'), decl)
		assert.deepEqual(
			attributeSlots().map((d) => d.id),
			['core:slot/hp@1'],
		)
	})

	test('refuses an id that is not an address', () => {
		_clearAttributeSlots()
		assert.throws(
			() =>
				defineAttributeSlot('hp', {
					type: 'integer',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/not a valid attribute slot id/,
		)
	})

	test('an identical re-declaration is a no-op; a different one throws', () => {
		_clearAttributeSlots()
		hp()
		assert.doesNotThrow(hp)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/hp@1', {
					type: 'integer',
					descriptor: 'Something else entirely.',
					appliesTo: ['cast'],
					config: { min: 0, max: 20 },
					default: 20,
				}),
			/duplicate attribute slot id/,
		)
	})

	test('copyediting the label is free; editing the descriptor is not', () => {
		_clearAttributeSlots()
		hp()
		assert.doesNotThrow(() =>
			defineAttributeSlot('core:slot/hp@1', {
				type: 'integer',
				label: { en: 'Hit points' },
				descriptor: 'How much punishment they can still take.',
				appliesTo: ['cast'],
				config: { min: 0, max: 20 },
				default: 20,
			}),
		)
	})

	test("a plugin may not claim core's namespace", () => {
		_clearAttributeSlots()
		assert.throws(
			() =>
				definePluginAttributeSlot('acme/rp', 'core:slot/hp@1', {
					type: 'integer',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/reserved/,
		)
	})

	test('a declaration that cannot describe itself is refused', () => {
		_clearAttributeSlots()
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/hp@1', {
					type: 'integer',
					descriptor: '  ',
					appliesTo: ['cast'],
				}),
			/declares no descriptor/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/mood@1', {
					type: 'enum',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/enum with no options/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/age@1', {
					type: 'derived',
					descriptor: 'x',
					appliesTo: ['cast'],
					config: { derivation: 'core:derive/vibes@1' },
				}),
			/not one of core's/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/age@1', {
					type: 'derived',
					descriptor: 'x',
					appliesTo: ['cast'],
					config: { derivation: derivations.age.id },
				}),
			/declare config\.from/,
		)
	})
})

describe('validation', () => {
	test('an integer is checked against the config in force, not the declaration', () => {
		_clearAttributeSlots()
		const decl = hp()
		assert.equal(checkSlotValue(decl, 12), null)
		assert.match(String(checkSlotValue(decl, 35)), /does not go above 20/)
		// This character's cap is 40 — the whole point of attaching a slot.
		const attached = resolveSlotConfig(decl, { max: 40 })
		assert.equal(checkSlotValue(decl, 35, attached), null)
	})

	test('an enum takes only what its owner declares', () => {
		_clearAttributeSlots()
		const decl = mood()
		assert.equal(checkSlotValue(decl, 'wary'), null)
		assert.match(String(checkSlotValue(decl, 'smug')), /is not/)
	})

	test('null is always legal — it is how a layer says "inherit again"', () => {
		_clearAttributeSlots()
		assert.equal(checkSlotValue(hp(), null), null)
	})

	test('a derived slot has no value to set', () => {
		_clearAttributeSlots()
		hp()
		const age = defineAttributeSlot('core:slot/age@1', {
			type: 'derived',
			descriptor: 'How old they are.',
			appliesTo: ['cast'],
			config: { derivation: derivations.age.id, from: 'core:slot/hp@1' },
		})
		assert.match(String(checkSlotValue(age, 30)), /is derived/)
	})

	test('deviations merge; a later layer does not drop an earlier key', () => {
		_clearAttributeSlots()
		const decl = hp()
		assert.deepEqual(resolveSlotConfig(decl, { max: 40 }, { min: -5 }), {
			min: -5,
			max: 40,
		})
	})

	test('appliesTo collapses the five owner kinds to the two a declaration knows', () => {
		_clearAttributeSlots()
		assert.equal(slotAppliesTo(hp(), 'cast'), true)
		assert.equal(slotAppliesTo(hp(), 'world'), false)
	})
})

/* ── The list type (R18) ────────────────────────────────────────────────── */

const inventory = (config: Record<string, unknown> = {}) =>
	defineAttributeSlot('core:slot/inventory@1', {
		type: 'list',
		label: { en: 'Carrying' },
		descriptor: 'What they have on them right now.',
		appliesTo: ['cast'],
		config: { maxLength: 40, ...config },
	})

const conditions = () =>
	defineAttributeSlot('core:slot/conditions@1', {
		type: 'list',
		descriptor: 'What is currently true of their body.',
		appliesTo: ['cast'],
		config: { of: ['bleeding', 'poisoned', 'blessed'] },
	})

describe('a list holds several of something', () => {
	test('it is a list, and one thing is not one', () => {
		fresh()
		const decl = inventory()
		assert.equal(checkSlotValue(decl, ['rope', 'lantern']), null)
		assert.equal(checkSlotValue(decl, []), null)
		assert.match(String(checkSlotValue(decl, 'rope')), /is one thing/)
	})

	test('with config.of the items are enum items; without it they are text', () => {
		fresh()
		assert.equal(checkSlotValue(conditions(), ['bleeding']), null)
		assert.match(String(checkSlotValue(conditions(), ['smug'])), /is not one of them/)
		// Free text respects maxLength per ITEM, not over the whole list.
		const free = inventory()
		assert.equal(checkSlotValue(free, ['rope', 'lantern', 'chalk']), null)
		assert.match(String(checkSlotValue(free, ['x'.repeat(41)])), /at most 40 characters/)
	})

	test('items are unique unless the declaration says otherwise', () => {
		fresh()
		assert.match(String(checkSlotValue(inventory(), ['rope', 'rope'])), /in it twice/)
		fresh()
		assert.equal(checkSlotValue(inventory({ unique: false }), ['ration', 'ration']), null)
	})

	test('maxItems is a ceiling on the whole list', () => {
		fresh()
		const decl = inventory({ maxItems: 2 })
		assert.equal(checkSlotValue(decl, ['rope', 'lantern']), null)
		assert.match(
			String(checkSlotValue(decl, ['rope', 'lantern', 'chalk'])),
			/at most 2 items; this is 3/,
		)
	})

	test('clearing a list is still legal — it is how a layer says "inherit again"', () => {
		fresh()
		assert.equal(checkSlotValue(inventory(), null), null)
	})
})

describe('changing a list', () => {
	test('set replaces, add appends, remove takes out', () => {
		assert.deepEqual(applyListOp(['rope'], 'set', ['chalk']), {
			value: ['chalk'],
			refusal: null,
		})
		assert.deepEqual(applyListOp(['rope'], 'add', ['chalk']), {
			value: ['rope', 'chalk'],
			refusal: null,
		})
		assert.deepEqual(applyListOp(['rope', 'chalk'], 'remove', ['rope']), {
			value: ['chalk'],
			refusal: null,
		})
	})

	test('nothing there yet is an empty list, not an error', () => {
		assert.deepEqual(applyListOp(null, 'add', ['rope']).value, ['rope'])
		assert.deepEqual(applyListOp(undefined, 'add', ['rope']).value, ['rope'])
	})

	test('add dedups when unique, and does not when it is not', () => {
		assert.deepEqual(applyListOp(['rope'], 'add', ['rope', 'chalk']).value, ['rope', 'chalk'])
		assert.deepEqual(
			applyListOp(['rope'], 'add', ['rope'], { unique: false }).value,
			['rope', 'rope'],
		)
		// Deduping keeps the FIRST position — a chip row must not jump about.
		assert.deepEqual(applyListOp([], 'set', ['a', 'b', 'a']).value, ['a', 'b'])
	})

	test('removing something that is not there is a no-op, not a refusal', () => {
		const out = applyListOp(['rope'], 'remove', ['sword'])
		assert.deepEqual(out.value, ['rope'])
		assert.equal(out.refusal, null)
	})

	test('maxItems refuses with a sentence and drops nothing to make room', () => {
		const out = applyListOp(['rope', 'chalk'], 'add', ['sword'], { maxItems: 2 })
		assert.match(String(out.refusal), /at most 2 items.*would make it 3/s)
		assert.deepEqual(out.value, ['rope', 'chalk'])
	})

	test('the result is frozen — a caller cannot edit the list it was handed', () => {
		assert.equal(Object.isFrozen(applyListOp([], 'add', ['rope']).value), true)
	})
})

/* ── Logic on the declaration (R11) ─────────────────────────────────────── */

describe('derive, rules and scripts', () => {
	test('an expression is legal only on a derived slot', () => {
		fresh()
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/threat@1', {
					type: 'integer',
					descriptor: 'x',
					appliesTo: ['world'],
					derive: '1 | plus: 1',
				}),
			/is a 'integer' slot and declares 'derive'/,
		)
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/threat@1', {
					type: 'derived',
					descriptor: 'x',
					appliesTo: ['world'],
					derive: '   ',
				}),
			/empty 'derive'/,
		)
	})

	test('an expression needs no `from`, and names the liquid derivation', () => {
		fresh()
		const decl = defineAttributeSlot('core:slot/threat@1', {
			type: 'derived',
			descriptor: 'How much trouble the party is in.',
			appliesTo: ['world'],
			derive: 'state.world.alarm | plus: state.world.pursuit',
		})
		assert.equal(slotDerivation(decl), derivations.liquid.id)
		assert.equal(derivations.liquid.requiresFrom, false)
	})

	test('an expression and a named derivation are two answers, so both are refused', () => {
		fresh()
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/threat@1', {
					type: 'derived',
					descriptor: 'x',
					appliesTo: ['world'],
					derive: 'a',
					config: { derivation: derivations.age.id, from: 'core:slot/hp@1' },
				}),
			/two answers to how one number is computed/,
		)
	})

	test("core's own derivations keep working, and name themselves", () => {
		fresh()
		hp()
		const age = defineAttributeSlot('core:slot/age@1', {
			type: 'derived',
			descriptor: 'How old they are.',
			appliesTo: ['cast'],
			config: { derivation: derivations.age.id, from: 'core:slot/hp@1' },
		})
		assert.equal(slotDerivation(age), derivations.age.id)
		assert.equal(slotDerivation(hp()), undefined)
	})

	test('the core derivations are the two, by id', () => {
		assert.deepEqual(
			Object.values(derivations).map((d) => d.id),
			['core:derive/age@1', 'core:derive/liquid@1'],
		)
	})

	test('a rule does exactly one thing', () => {
		fresh()
		const rule = (rules: AttributeSlotProps['rules']) =>
			defineAttributeSlot('core:slot/hp@1', {
				type: 'integer',
				descriptor: 'x',
				appliesTo: ['cast'],
				rules,
			})
		assert.throws(() => rule([{ when: 'a' }]), /declares no operation/)
		assert.throws(() => rule([{ set: '1', add: '1' }]), /declares set and add/)
		assert.doesNotThrow(() => rule([{ when: 'a', set: '1' }]))
	})

	test('add and remove need a value with parts or arithmetic', () => {
		fresh()
		assert.throws(
			() =>
				defineAttributeSlot('core:slot/location@1', {
					type: 'text',
					descriptor: 'x',
					appliesTo: ['world'],
					rules: [{ add: "'north'" }],
				}),
			/is a 'text' slot and rule 0 declares 'add'/,
		)
		fresh()
		// An integer's `add` is a signed delta; a list's is an item.
		assert.doesNotThrow(() =>
			defineAttributeSlot('core:slot/hp@1', {
				type: 'integer',
				descriptor: 'x',
				appliesTo: ['cast'],
				rules: [{ when: 'state.world.weather == "storm"', add: '-1' }],
			}),
		)
		fresh()
		assert.doesNotThrow(() =>
			defineAttributeSlot('core:slot/inventory@1', {
				type: 'list',
				descriptor: 'x',
				appliesTo: ['cast'],
				rules: [{ when: 'state.world.weather == "storm"', remove: "'torch'" }],
			}),
		)
	})

	test('scripts and rules are carried as declared; a list holds one for now', () => {
		fresh()
		const decl = defineAttributeSlot('core:slot/hp@1', {
			type: 'integer',
			descriptor: 'x',
			appliesTo: ['cast'],
			rules: [{ when: 'a', add: '-1' }],
			scripts: ['core:script:changes/extract@1'],
		})
		assert.deepEqual(decl.rules, [{ when: 'a', add: '-1' }])
		assert.deepEqual(decl.scripts, ['core:script:changes/extract@1'])
	})

	test('behaviour is hashed; examples are not', () => {
		const base: AttributeSlotProps = {
			type: 'integer',
			descriptor: 'x',
			appliesTo: ['cast'],
			rules: [{ set: '1' }],
		}
		const hash = (props: AttributeSlotProps) => declarationHash(props, SLOT_DISPLAY_KEYS)
		// An example is the test OF the declaration, so writing one is free.
		assert.equal(
			hash(base),
			hash({ ...base, examples: [{ state: { hp: 3 }, expect: 3 as SlotValue }] }),
		)
		// A rule is what the number does to itself, so editing one is not.
		assert.notEqual(hash(base), hash({ ...base, rules: [{ set: '2' }] }))
		assert.notEqual(hash(base), hash({ ...base, derive: 'x' }))
		assert.notEqual(hash(base), hash({ ...base, scripts: ['s'] }))
		// A label still is.
		assert.equal(hash(base), hash({ ...base, label: { en: 'Renamed' } }))
	})
})

/* ── Origins, reserved owners, retirement (R1, R2, R3) ──────────────────── */

const stored = (id = 'jody:slot/curses@1', props: Partial<AttributeSlotProps> = {}) =>
	defineStoredAttributeSlot(
		id,
		{
			type: 'integer',
			label: { en: 'Curses' },
			descriptor: 'How many times they have been cursed.',
			appliesTo: ['cast'],
			...props,
		} as AttributeSlotProps,
		{ userId: 7 },
	)

describe('one registry, two sources', () => {
	test('a code declaration says so, and so does an authored one', () => {
		fresh()
		assert.equal(hp().origin, 'code')
		assert.equal(hp().authorUserId, undefined)
		const mine = stored()
		assert.equal(mine.origin, 'stored')
		assert.equal(mine.authorUserId, 7)
		// One door, whichever source it came through.
		assert.equal(getAttributeSlot('jody:slot/curses@1'), mine)
		assert.equal(attributeSlots().length, 2)
	})

	test('a stored declaration REPLACES — one author, no hash to argue with', () => {
		fresh()
		stored()
		const edited = stored('jody:slot/curses@1', {
			descriptor: 'Rewritten after a night of thinking about it.',
		})
		assert.equal(getAttributeSlot('jody:slot/curses@1'), edited)
		assert.equal(edited.descriptor, 'Rewritten after a night of thinking about it.')
	})

	test('the two sources may not take each other’s ids', () => {
		fresh()
		defineAttributeSlot('acme.rp:slot/tension@1', {
			type: 'integer',
			descriptor: 'x',
			appliesTo: ['world'],
		})
		assert.throws(
			() => stored('acme.rp:slot/tension@1'),
			/declared in code by the package that owns it/,
		)
		fresh()
		stored()
		assert.throws(
			() =>
				defineAttributeSlot('jody:slot/curses@1', {
					type: 'integer',
					descriptor: 'x',
					appliesTo: ['cast'],
				}),
			/already held by a slot somebody authored/,
		)
	})

	test('core is reserved always; a plugin id is reserved when the host says so', () => {
		fresh()
		assert.equal(isReservedAttributeOwner('core'), true)
		assert.equal(isReservedAttributeOwner('acme.rp'), false)
		assert.throws(() => stored('core:slot/curses@1'), /reserved owner 'core'/)
		reserveAttributeOwner('acme.rp')
		assert.equal(isReservedAttributeOwner('acme.rp'), true)
		assert.throws(() => stored('acme.rp:slot/curses@1'), /reserved owner 'acme.rp'/)
		assert.throws(() => reserveAttributeOwner('  '), /empty segment/)
	})

	test('an id comes apart into owner, slug and version', () => {
		assert.equal(slotOwner('acme.rp:slot/tension@2'), 'acme.rp')
		assert.equal(slotSlug('acme.rp:slot/tension@2'), 'tension')
		assert.equal(slotVersion('acme.rp:slot/tension@2'), 2)
		assert.equal(slotOwner('core:sheet/adventure@1'), 'core')
		// A stale id has to render, not crash.
		assert.equal(slotOwner('nonsense'), '')
		assert.equal(slotVersion('nonsense'), 0)
	})
})

describe('retiring a slot', () => {
	test('retired refuses new writes and keeps everything already written', () => {
		fresh()
		const decl = stored()
		assert.equal(checkSlotValue(decl, 3), null)
		const gone = retireAttributeSlot(decl.id)
		assert.equal(gone.retired, true)
		assert.match(String(checkSlotValue(gone, 3)), /is retired/)
		assert.match(String(checkSlotValue(gone, 3)), /already stored is kept/)
		// The refusal is about the slot, so even clearing it is refused.
		assert.match(String(checkSlotValue(gone, null)), /is retired/)
	})

	test('reviving takes writes again', () => {
		fresh()
		retireAttributeSlot(stored().id)
		const back = reviveAttributeSlot('jody:slot/curses@1')
		assert.ok(!back.retired)
		assert.equal(checkSlotValue(back, 3), null)
	})

	test('a code slot is never retired by hand', () => {
		fresh()
		hp()
		assert.throws(
			() => retireAttributeSlot('core:slot/hp@1'),
			/declared in code, and code declarations are never retired by hand/,
		)
	})

	test('retiring something nothing declares says so', () => {
		fresh()
		assert.throws(() => retireAttributeSlot('jody:slot/nothing@1'), /no slot is declared/)
	})
})

/* ── Sheets (R6, R7) ────────────────────────────────────────────────────── */

const adventurers = (id = 'core:sheet/adventurer@1') =>
	defineAttributeSheet(id, {
		label: { en: 'Adventurer' },
		slots: [{ id: 'core:slot/mood@1' }, { id: 'core:slot/hp@1', required: true, default: 20 }],
	})

describe('a sheet is an ordered bundle of slots', () => {
	test('it keeps the order it was written in — order is what a panel draws', () => {
		fresh()
		hp()
		mood()
		const sheet = adventurers()
		assert.deepEqual(
			sheet.slots.map((e) => e.id),
			['core:slot/mood@1', 'core:slot/hp@1'],
		)
		assert.equal(getAttributeSheet('core:sheet/adventurer@1'), sheet)
		assert.deepEqual(
			attributeSheets().map((s) => s.id),
			['core:sheet/adventurer@1'],
		)
	})

	test('naming a slot nothing declares is refused, and the id is said', () => {
		fresh()
		hp()
		assert.throws(
			() =>
				defineAttributeSheet('core:sheet/adventurer@1', {
					label: { en: 'Adventurer' },
					slots: [{ id: 'core:slot/hp@1' }, { id: 'core:slot/vibes@1' }],
				}),
			/names 'core:slot\/vibes@1' at position 1, and nothing declares it/,
		)
	})

	test('naming one twice has no reading, so it is refused', () => {
		fresh()
		hp()
		assert.throws(
			() =>
				defineAttributeSheet('core:sheet/adventurer@1', {
					label: { en: 'Adventurer' },
					slots: [{ id: 'core:slot/hp@1' }, { id: 'core:slot/hp@1' }],
				}),
			/names 'core:slot\/hp@1' twice/,
		)
	})

	test('a default the sheet’s own configuration refuses is refused here', () => {
		fresh()
		hp()
		assert.throws(
			() =>
				defineAttributeSheet('core:sheet/adventurer@1', {
					label: { en: 'Adventurer' },
					slots: [{ id: 'core:slot/hp@1', default: 99 }],
				}),
			/a default its own configuration refuses/,
		)
		// …and a deviation that makes room for it is accepted.
		assert.doesNotThrow(() =>
			defineAttributeSheet('core:sheet/adventurer@1', {
				label: { en: 'Adventurer' },
				slots: [{ id: 'core:slot/hp@1', default: 99, config: { max: 100 } }],
			}),
		)
	})

	test('an id that is not an address is refused', () => {
		fresh()
		assert.throws(
			() => defineAttributeSheet('adventurer', { label: { en: 'x' }, slots: [] }),
			/not a valid attribute sheet id/,
		)
	})

	test("a plugin may not claim core's namespace; a person may not claim a reserved owner", () => {
		fresh()
		hp()
		assert.throws(
			() =>
				definePluginAttributeSheet('acme/rp', 'core:sheet/adventurer@1', {
					label: { en: 'x' },
					slots: [{ id: 'core:slot/hp@1' }],
				}),
			/reserved/,
		)
		assert.throws(
			() =>
				defineStoredAttributeSheet(
					'core:sheet/mine@1',
					{ label: { en: 'x' }, slots: [{ id: 'core:slot/hp@1' }] },
					{ userId: 7 },
				),
			/reserved owner 'core'/,
		)
	})

	test('an identical re-declaration is a no-op; a different one throws; a stored one replaces', () => {
		fresh()
		hp()
		mood()
		adventurers()
		assert.doesNotThrow(adventurers)
		assert.throws(
			() =>
				defineAttributeSheet('core:sheet/adventurer@1', {
					label: { en: 'Adventurer' },
					slots: [{ id: 'core:slot/hp@1' }],
				}),
			/duplicate attribute sheet id/,
		)
		const mine = () =>
			defineStoredAttributeSheet(
				'jody:sheet/mine@1',
				{ label: { en: 'Mine' }, slots: [{ id: 'core:slot/hp@1' }] },
				{ userId: 7 },
			)
		mine()
		assert.doesNotThrow(() =>
			defineStoredAttributeSheet(
				'jody:sheet/mine@1',
				{ label: { en: 'Mine' }, slots: [{ id: 'core:slot/mood@1' }] },
				{ userId: 7 },
			),
		)
		assert.deepEqual(
			getAttributeSheet('jody:sheet/mine@1')?.slots.map((e) => e.id),
			['core:slot/mood@1'],
		)
	})

	test('only a stored sheet is retired by hand', () => {
		fresh()
		hp()
		mood()
		adventurers()
		assert.throws(() => retireAttributeSheet('core:sheet/adventurer@1'), /never retired by hand/)
		assert.throws(() => retireAttributeSheet('jody:sheet/nothing@1'), /no sheet is declared/)
		defineStoredAttributeSheet(
			'jody:sheet/mine@1',
			{ label: { en: 'Mine' }, slots: [{ id: 'core:slot/hp@1' }] },
			{ userId: 7 },
		)
		assert.equal(retireAttributeSheet('jody:sheet/mine@1').retired, true)
	})
})

/* ── A genre's vocabulary (R6) ──────────────────────────────────────────── */

describe("the slots a session of a genre carries", () => {
	test('sheets and the loose list are one vocabulary, deduped by id', () => {
		fresh()
		hp()
		mood()
		const sheet = adventurers()
		const g = genre('acme.rp:genre/crawl', {
			name: { en: 'Crawl' },
			family: 'adventure',
			slots: [hp(), inventory()],
			sheets: [sheet],
		})
		// Sheet order first (mood, hp), then what the loose list adds and no more.
		assert.deepEqual(genreSlots(g.id).map((d) => d.id), [
			'core:slot/mood@1',
			'core:slot/hp@1',
			'core:slot/inventory@1',
		])
		assert.deepEqual(genreSheets(g).map((s) => s.id), ['core:sheet/adventurer@1'])
		assert.deepEqual(genreSheets(g.id), genreSheets(g))
	})

	test('a genre with only a loose list is unchanged', () => {
		fresh()
		const g = genre('acme.rp:genre/crawl', {
			name: { en: 'Crawl' },
			family: 'adventure',
			slots: [hp()],
		})
		assert.deepEqual(genreSlots(g.id).map((d) => d.id), ['core:slot/hp@1'])
		assert.deepEqual(genreSheets(g), [])
	})

	test('a genre that declares neither carries nothing — the one-call rule at the surface', () => {
		fresh()
		const g = genre('acme.rp:genre/plain', { name: { en: 'Plain' }, family: 'chat' })
		assert.deepEqual(genreSlots(g.id), [])
		assert.deepEqual(genreSheets(g), [])
		assert.deepEqual(genreSlots('acme.rp:genre/never-declared'), [])
		assert.deepEqual(genreSheets('acme.rp:genre/never-declared'), [])
	})

	test('a genre denies custom attributes unless it says otherwise, and says so in its hash only when it allows', () => {
		fresh()
		const plain = genre('acme.rp:genre/plain-deny', { name: { en: 'Plain' }, family: 'chat' })
		assert.equal(genreAllowsCustomAttributes(plain), false)
		assert.equal('customAttributes' in plain, false, 'unstated is absent, so an existing genre hashes as it did')
		const denied = genre('acme.rp:genre/said-deny', { name: { en: 'Denied' }, family: 'chat', customAttributes: 'deny' })
		assert.equal('customAttributes' in denied, false, "'deny' is the default, and stored as the default is")
		const open = genre('acme.rp:genre/open', { name: { en: 'Open' }, family: 'rp', customAttributes: 'allow' })
		assert.equal(genreAllowsCustomAttributes(open), true)
		assert.equal(genreAllowsCustomAttributes('acme.rp:genre/open'), true)
		assert.equal(genreAllowsCustomAttributes('acme.rp:genre/never-declared'), false)
		assert.throws(
			() => genre('acme.rp:genre/bad', { name: { en: 'Bad' }, family: 'rp', customAttributes: 'yes' as never }),
			/customAttributes: 'allow' or 'deny'/,
		)
	})

	test('a slot is pickable unless it says `pickable: false`, and says nothing else', () => {
		fresh()
		const stat = defineAttributeSlot('acme.rp:slot/grit@1', { type: 'integer', descriptor: 'Grit.', appliesTo: ['cast'] })
		const kept = defineAttributeSlot('acme.rp:slot/outfit@1', {
			type: 'text',
			descriptor: 'The outfit shown.',
			appliesTo: ['cast'],
			pickable: false,
		})
		assert.equal(slotPickable(stat), true)
		assert.equal(slotPickable(kept), false)
		assert.throws(
			() =>
				defineAttributeSlot('acme.rp:slot/odd@1', {
					type: 'text',
					descriptor: 'Odd.',
					appliesTo: ['cast'],
					pickable: true as never,
				}),
			/pickable: only `false` is said/,
		)
	})

	test("earshot (R1): 'holder' only on a cast-only slot, and 'all' said aloud is the default", () => {
		fresh()
		const heard = defineAttributeSlot('acme.rp:slot/grit@1', { type: 'integer', descriptor: 'Grit.', appliesTo: ['cast'] })
		const secret = defineAttributeSlot('acme.rp:slot/secret@1', {
			type: 'text',
			descriptor: 'What this one was told.',
			appliesTo: ['cast'],
			earshot: 'holder',
		})
		assert.equal(slotEarshot(heard), 'all')
		assert.equal(slotEarshot(secret), 'holder')
		// A world, a place, or cast-and-world: no voice holds it there.
		for (const appliesTo of [['world'], ['location'], ['cast', 'world']] as const)
			assert.throws(
				() =>
					defineAttributeSlot('acme.rp:slot/aside@1', {
						type: 'text',
						descriptor: 'An aside.',
						appliesTo,
						earshot: 'holder',
					}),
				/earshot 'holder'.*Only a cast member has a voice/s,
			)
		assert.throws(
			() =>
				defineAttributeSlot('acme.rp:slot/odd@1', {
					type: 'text',
					descriptor: 'Odd.',
					appliesTo: ['cast'],
					earshot: 'party' as never,
				}),
			/earshot is 'party'/,
		)
		// The default said aloud is one declaration with saying nothing: no key, one hash.
		const plain: AttributeSlotProps = { type: 'text', descriptor: 'Plain.', appliesTo: ['world'] }
		const said = defineAttributeSlot('acme.rp:slot/plain@1', { ...plain, earshot: 'all' })
		assert.equal('earshot' in said, false)
		assert.doesNotThrow(() => defineAttributeSlot('acme.rp:slot/plain@1', plain))
		// 'holder' is content: it changes the hash.
		const { earshot: _earshot, ...unsaid } = secret
		assert.notEqual(
			declarationHash(secret, SLOT_DISPLAY_KEYS),
			declarationHash(unsaid, SLOT_DISPLAY_KEYS),
		)
	})

	test('a sheet entry whose slot this build no longer declares is skipped, not guessed at', () => {
		fresh()
		hp()
		mood()
		const g = genre('acme.rp:genre/crawl', {
			name: { en: 'Crawl' },
			family: 'adventure',
			sheets: [adventurers()],
		})
		_clearAttributeSlots()
		mood()
		assert.deepEqual(genreSlots(g.id).map((d) => d.id), ['core:slot/mood@1'])
	})
})

/* ── The turn lock (R9) ─────────────────────────────────────────────────── */

const log: readonly TurnMessage[] = [
	{ id: 1, speakerId: null }, // the player typing
	{ id: 2, speakerId: 10 }, // Ash
	{ id: 3, speakerId: 11 }, // Bram
	{ id: 4, speakerId: 10 }, // Ash again
	{ id: 5, speakerId: 11 }, // Bram again
]

describe('the turn lock', () => {
	test("a character's open anchor is their own latest message", () => {
		assert.equal(openAnchorFor(log, { kind: 'session_cast', id: 10 }), 4)
		assert.equal(openAnchorFor(log, { kind: 'session_cast', id: 11 }), 5)
	})

	test('a character who has not spoken has no anchor, and no anchor is open', () => {
		assert.equal(openAnchorFor(log, { kind: 'session_cast', id: 99 }), null)
		assert.equal(isAnchorOpen(log, { kind: 'session_cast', id: 99 }, null), true)
		assert.equal(isAnchorOpen([], { kind: 'session_cast', id: 10 }, null), true)
	})

	test('another speaker in between does not seal the older reply', () => {
		// Ash speaks at 2, Bram at 3. Ash's 2 stays open until Ash speaks again.
		const upTo3 = log.slice(0, 3)
		assert.equal(isAnchorOpen(upTo3, { kind: 'session_cast', id: 10 }, 2), true)
		// …and 4 is Ash speaking again, which seals 2.
		assert.equal(isAnchorOpen(log, { kind: 'session_cast', id: 10 }, 2), false)
		assert.equal(isAnchorOpen(log, { kind: 'session_cast', id: 10 }, 4), true)
	})

	/**
	 * R8 (lair pass, 2026-09-28): a turn may write several rows — the Lair's
	 * Castellan posts its beats, then the party speak — and the world's
	 * changes are filed at the beats row. For the world, every row of the
	 * newest TURN is open; a caller that supplies no `turn` sees the old rule.
	 */
	test("the world's newest turn is open whole, and only when the asker says which rows are one turn", () => {
		const turn = [
			{ id: 1, speakerId: null, turn: null },
			{ id: 2, speakerId: null, turn: 'run-7' },
			{ id: 3, speakerId: 10, turn: 'run-7' },
			{ id: 4, speakerId: 11, turn: 'run-7' },
		]
		const world = { kind: 'session' as const, id: 1 }
		assert.equal(openAnchorFor(turn, world), 4)
		assert.equal(isAnchorOpen(turn, world, 2), true)
		assert.equal(isAnchorOpen(turn, world, 1), false)
		// A person's line after the turn seals it.
		const after = [...turn, { id: 5, speakerId: null, turn: null }]
		assert.equal(isAnchorOpen(after, world, 2), false)
		assert.equal(isAnchorOpen(after, world, 5), true)
		// No turn supplied: the newest message alone, as before.
		const bare = turn.map(({ id, speakerId }) => ({ id, speakerId }))
		assert.equal(isAnchorOpen(bare, world, 2), false)
		// A cast owner's rule is unchanged: their own latest line.
		assert.equal(isAnchorOpen(turn, { kind: 'session_cast', id: 10 }, 2), false)
	})

	test('the world moves on every turn, whoever spoke', () => {
		assert.equal(openAnchorFor(log, { kind: 'session', id: 1 }), 5)
		assert.equal(isAnchorOpen(log, { kind: 'session', id: 1 }, 5), true)
		assert.equal(isAnchorOpen(log, { kind: 'session', id: 1 }, 4), false)
		assert.equal(openAnchorFor([], { kind: 'session', id: 1 }), null)
		assert.equal(isAnchorOpen([], { kind: 'session', id: 1 }, null), true)
	})

	test('a message with no speaker anchors nothing to anybody', () => {
		assert.equal(openAnchorFor([{ id: 1, speakerId: null }], { kind: 'session_cast', id: 10 }), null)
		// It is still the world's newest.
		assert.equal(openAnchorFor([{ id: 1, speakerId: null }], { kind: 'session', id: 1 }), 1)
	})
})
