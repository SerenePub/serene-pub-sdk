/**
 * 🚧 Rulesets programme P1-B — the SDK declarations: rulesets, repertoires
 * and their pieces, bridges, conversions, a genre's rigour and rulesets, the
 * handler's contract stub, and core's Story ruleset.
 *
 * Every refusal is a finding opened by its reason's name (`[reason] …`), so
 * these tests assert the reason, not the sentence.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	bridgeFindings,
	bridgesFor,
	checkPiece,
	checkSlotValue,
	conversionFindings,
	defineBridge,
	definePluginAttributeSlot,
	definePluginRuleset,
	defineRepertoire,
	defineRuleset,
	genre,
	genreRulesetFindings,
	getDefinition,
	getRepertoire,
	getRuleset,
	isSlotLoreRef,
	isSlotPiece,
	parseRepertoireAddress,
	pieceDurationProblem,
	registerBridge,
	repertoireAddress,
	repertoireFindings,
	rulesetEntryable,
	rulesetEntryTypeId,
	rulesetFindings,
	rulesets,
	rulesetSelectorFamily,
	rulesetSelectors,
	rulesetUpgradeFindings,
	RulesetError,
	slotListItemText,
	slotStatShapeKind,
	slotValueForStorage,
	statShapeKindOf,
	type RepertoireDecl,
	type RulesetProps,
	type SlotValue,
} from '@serene-pub/sdk'
import { rulesetResolve } from '@serene-pub/contracts'
import { freeformRuleset } from '../core-catalog/src/registry/rulesets.js'

/** The reasons a list of findings names, in order. */
const reasons = (findings: readonly string[]): string[] => findings.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1] ?? f)
const has = (findings: readonly string[], reason: string) =>
	assert.ok(reasons(findings).includes(reason), `expected [${reason}] in:\n${findings.join('\n')}`)
const throwsReason = (fn: () => unknown, reason: string) =>
	assert.throws(fn, (e: unknown) => e instanceof RulesetError && reasons(e.findings).includes(reason))

// ── Fixtures ────────────────────────────────────────────────────────────────

const might = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/might@1', {
	type: 'integer',
	label: 'Might',
	descriptor: 'How strong they are.',
	appliesTo: ['cast'],
	config: { min: 0, max: 10 },
	default: 2,
})
const foreign = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/luck@1', {
	type: 'integer',
	label: 'Luck',
	descriptor: 'How lucky they are.',
	appliesTo: ['cast'],
})

const gear = defineRepertoire('gear', {
	label: 'Gear',
	prose: 'What a character carries into trouble.',
	piece: { type: 'object', fields: { weight: { type: 'integer', min: 0, label: 'Weight' } } },
	mechanics: [{ verb: 'modify', target: 'attack', value: 1, bonusType: 'item', on: 'hit' }],
	entryable: true,
})
const doors = defineRepertoire('doors', {
	label: 'Doors',
	prose: 'Ways out of a place.',
	relational: true,
	appliesTo: ['location'],
	mechanics: [{ verb: 'rider', text: 'It creaks.', on: 'traverse' }],
})

const conventions: RulesetProps['conventions'] = {
	dice: { sides: 20, modifierOf: 'might' },
	degrees: {
		bands: [
			{ id: 'miss', label: 'Miss', five: 'fail', from: -99 },
			{ id: 'hit', label: 'Hit', five: 'success', from: 0 },
			{ id: 'great', label: 'Great hit', five: 'crit', from: 10 },
		],
		naturalShift: { high: 20, low: 1 },
	},
	time: { unit: 'round', roundSeconds: 6 },
}

const baseProps = (over: Partial<RulesetProps> = {}): RulesetProps => ({
	name: 'Test',
	voice: { prose: 'Short and plain.', mechanics: 'Numbers matter.' },
	conventions,
	stats: [{ id: might.id }],
	selectors: { attack: { kind: 'check', base: 'might' }, luck: { kind: 'stat', slot: foreign.id } },
	repertoires: [gear, doors],
	compendium: {
		source: { document: 'Test rules', licence: 'CC-BY-4.0' },
		rows: { gear: [{ id: 'rope', version: '1.0.0', piece: { name: 'Rope', description: 'Fifty feet of it.', weight: 1 } }] },
	},
	scripts: [{ phase: 'derived', priority: 0, seedKey: 'acme.rs/derive' }],
	...over,
})

const RS = definePluginRuleset('acme.rs', 'acme.rs:ruleset/test@1', baseProps())

const pieceSlot = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/pack@1', {
	shape: { type: 'list', item: { type: 'object', fields: {} } },
	label: 'Pack',
	descriptor: 'What they carry.',
	appliesTo: ['cast'],
	config: { repertoire: repertoireAddress(RS.id, 'gear') },
})
const plainList = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/words@1', {
	type: 'list',
	label: 'Words',
	descriptor: 'Some words.',
	appliesTo: ['cast'],
})

// ── Repertoires ─────────────────────────────────────────────────────────────

describe('repertoires', () => {
	test('a repertoire round-trips with the universal piece parts always present', () => {
		assert.deepEqual(Object.keys(gear.piece.fields ?? {}), ['name', 'description', 'prose', 'traits', 'equipped', 'duration', 'weight'])
		assert.equal(gear.piece.fields?.name?.required, true)
		assert.deepEqual(Object.keys(doors.piece.fields ?? {}), ['name', 'description', 'prose', 'traits', 'equipped', 'duration', 'towards', 'edge'])
		assert.ok(Object.isFrozen(gear))
		assert.deepEqual(repertoireFindings(gear), [])
	})

	test('own findings refuse at defineRepertoire, by name', () => {
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: '' }), 'missing-prose')
		throwsReason(() => defineRepertoire('Bad Name', { label: 'X', prose: 'p' }), 'invalid-id')
		throwsReason(
			() => defineRepertoire('x', { label: 'X', prose: 'p', piece: { type: 'object', fields: { name: { type: 'string' } } } }),
			'piece-redeclares-universal',
		)
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', piece: { type: 'list' } }), 'piece-not-object')
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'grant' } as never] }), 'unknown-verb')
		throwsReason(
			() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'adjustDegree', target: 'attack', by: 1, on: 'rest' }] }),
			'inert-pairing',
		)
		throwsReason(
			() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'rider', text: 'Creak.', on: 'traverse' }] }),
			'inert-pairing',
		)
		throwsReason(
			() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'modify', target: 'a', value: 1, on: 'elapsed' }] }),
			'inert-pairing',
		)
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'rider', text: 'Loose.' }] }), 'inert-pairing')
		throwsReason(
			() =>
				defineRepertoire('x', {
					label: 'X',
					prose: 'p',
					mechanics: [{ verb: 'modify', target: 'a', value: 1, predicate: { traits: {} } }],
				}),
			'bad-predicate',
		)
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', renames: { name: 'title' } }), 'rename-still-declared')
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', retired: ['traits'] }), 'retired-still-declared')
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', earshot: 'gm' as never }), 'bad-earshot')
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', earshot: 'holder', gmOnly: true }), 'bad-earshot')
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', gmOnly: 'yes' as never }), 'bad-gm-only')
		throwsReason(
			() => defineRepertoire('x', { label: 'X', prose: 'p', piece: { type: 'object', fields: { duration: { type: 'string' } } } }),
			'piece-redeclares-universal',
		)
	})

	test('cut verbs and keys are refused by name (2026-10-17)', () => {
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'bestow' } as never] }), 'unknown-verb')
		throwsReason(() => defineRepertoire('x', { label: 'X', prose: 'p', mechanics: [{ verb: 'situational' } as never] }), 'unknown-verb')
		throwsReason(
			() =>
				defineRepertoire('x', {
					label: 'X',
					prose: 'p',
					mechanics: [{ verb: 'modify', target: 'a', value: 1, duration: { units: 'round', value: 1, expiry: 'elapsed' } } as never],
				}),
			'mechanic-duration',
		)
		// `set`, `adjustDegree` and the timed events stay.
		assert.ok(
			defineRepertoire('kept', {
				label: 'K',
				prose: 'p',
				mechanics: [
					{ verb: 'set', target: 'might', value: 1 },
					{ verb: 'adjustDegree', target: 'attack', by: 1, on: 'hit' },
					{ verb: 'modify', target: 'might', value: -1, on: 'elapsed', every: 1 },
					{ verb: 'rider', text: 'At dawn.', on: 'at', at: '412-03-05 06:00' },
				],
			}),
		)
	})

	test('🚧 the piece-use verbs (2026-10-18): rollWith, harm, heal, cure and consume fire when a piece is used', () => {
		const potions = defineRepertoire('potions', {
			label: 'Potions',
			prose: 'Things drunk or thrown.',
			piece: { type: 'object', fields: { heals: { type: 'string', label: 'Heals' }, damage: { type: 'string', label: 'Damage' } } },
			mechanics: [
				{ verb: 'rollWith', on: 'hit', target: 'attack', from: ['might'] },
				{ verb: 'harm', on: 'hit', dice: 'piece.damage', plus: 'check', stat: 'might' },
				{ verb: 'heal', on: 'use', dice: 'piece.heals', plus: ['might'], stat: 'might' },
				{ verb: 'cure', on: 'use', traits: ['poisoned'] },
				{ verb: 'consume', on: 'use' },
			],
		})
		assert.deepEqual(rulesetFindings('acme.rs:ruleset/use@1', baseProps({ repertoires: [gear, potions] })), [])
		const f = (m: unknown) => {
			try {
				defineRepertoire('p2', {
					label: 'P',
					prose: 'p',
					piece: { type: 'object', fields: { heals: { type: 'string', label: 'Heals' } } },
					mechanics: [m as never],
				})
				return []
			} catch (e) {
				return reasons((e as { findings: string[] }).findings)
			}
		}
		// Only when a piece is used: never passive, never on a rest.
		assert.ok(f({ verb: 'consume' }).includes('inert-pairing'))
		assert.ok(f({ verb: 'cure', on: 'rest', traits: ['x'] }).includes('inert-pairing'))
		// Each says what it needs; dice come from a field the piece declares.
		assert.ok(f({ verb: 'heal', on: 'use', stat: 'might' }).includes('malformed-mechanic'))
		assert.ok(f({ verb: 'heal', on: 'use', dice: 'piece.cures', stat: 'might' }).includes('unknown-selector'))
		assert.ok(f({ verb: 'cure', on: 'use', traits: [] }).includes('malformed-mechanic'))
		assert.ok(f({ verb: 'rollWith', on: 'hit', target: 'attack', from: [] }).includes('malformed-mechanic'))
		// `plus: 'check'` is a hit's: only a hit's check rolls with a modifier.
		assert.ok(f({ verb: 'harm', on: 'use', dice: 'piece.heals', stat: 'might', plus: 'check' }).includes('inert-pairing'))
		assert.ok(f({ verb: 'heal', on: 'use', dice: 'piece.heals', stat: 'might', plus: 'check' }).includes('malformed-mechanic'))
		// In the ruleset's context the selectors they name must be its.
		const loose = defineRepertoire('loose', {
			label: 'L',
			prose: 'p',
			piece: { type: 'object', fields: { heals: { type: 'string', label: 'Heals' } } },
			mechanics: [
				{ verb: 'heal', on: 'use', dice: 'piece.heals', stat: 'vigour', plus: ['wits'] },
				{ verb: 'rollWith', on: 'hit', target: 'attack', from: ['grace'] },
			],
		})
		assert.equal(reasons(rulesetFindings('acme.rs:ruleset/loose@1', baseProps({ repertoires: [gear, loose] }))).filter((r) => r === 'unknown-selector').length, 3)
	})

	test('🚧 a derived selector may stand on the sheet, under a label (2026-10-18)', () => {
		const sel = (guard: unknown) => ({ attack: { kind: 'check', base: 'might' }, guard }) as never
		assert.deepEqual(rulesetFindings('acme.rs:ruleset/sheet@1', baseProps({ selectors: sel({ kind: 'derived', from: ['might'], onSheet: true, label: { en: 'Guard' } }) })), [])
		has(rulesetFindings('acme.rs:ruleset/sheet@1', baseProps({ selectors: sel({ kind: 'derived', from: ['might'], onSheet: 'yes' }) })), 'bad-selector')
	})

	test('earshot and gmOnly are carried; the old audience word is not a key', () => {
		const held = defineRepertoire('secrets', { label: 'S', prose: 'p', earshot: 'holder' })
		const gm = defineRepertoire('foes', { label: 'F', prose: 'p', gmOnly: true })
		assert.equal(held.earshot, 'holder')
		assert.equal(gm.gmOnly, true)
		assert.equal('audience' in gm, false)
	})

	test('a piece-field predicate path is legal; an unknown selector is refused in the ruleset context', () => {
		const ok = defineRepertoire('latches', {
			label: 'Latches',
			prose: 'p',
			mechanics: [{ verb: 'modify', target: 'attack', value: -1, predicate: { path: 'piece.name', equals: 'rusty' } }],
		})
		assert.ok(ok)
		const bad = defineRepertoire('latches2', {
			label: 'L',
			prose: 'p',
			mechanics: [{ verb: 'modify', target: 'atack', value: 1, predicate: { path: 'nope', truthy: true } }],
		})
		const found = rulesetFindings('acme.rs:ruleset/bad@1', baseProps({ repertoires: [bad] }))
		assert.equal(reasons(found).filter((r) => r === 'unknown-selector').length, 2)
	})
})

// ── Rulesets ────────────────────────────────────────────────────────────────

describe('rulesets', () => {
	test('a ruleset registers, round-trips and is reached by address', () => {
		assert.equal(getRuleset(RS.id), RS)
		assert.ok(rulesets().includes(RS))
		assert.equal(getRepertoire(repertoireAddress(RS.id, 'gear')), gear)
		assert.deepEqual(parseRepertoireAddress('acme.rs:ruleset/test@1#gear'), { ruleset: RS.id, repertoire: 'gear' })
		assert.equal(parseRepertoireAddress('gear'), undefined)
		assert.deepEqual([...rulesetSelectors(RS).keys()], ['might', 'attack', 'luck'])
		assert.deepEqual(rulesetEntryable(RS), ['gear'])
		assert.equal(rulesetEntryTypeId(RS.id, 'gear'), 'acme.rs:entry/test.gear@1')
		// Identical redeclaration is a no-op; a different one throws with both hashes.
		assert.doesNotThrow(() => definePluginRuleset('acme.rs', RS.id, baseProps()))
		assert.throws(() => definePluginRuleset('acme.rs', RS.id, baseProps({ voice: { prose: 'Different.' } })), /duplicate ruleset id/)
		assert.throws(() => definePluginRuleset('acme.rs', 'core:ruleset/mine@1', baseProps()), /reserved/)
	})

	test('ruleset findings are named', () => {
		const f = (over: Partial<RulesetProps>, id = 'acme.rs:ruleset/f@1') => rulesetFindings(id, baseProps(over))
		assert.deepEqual(f({}), [])
		has(rulesetFindings('nope', baseProps()), 'invalid-id')
		has(f({ voice: { mechanics: 'x' } }), 'missing-voice')
		has(f({ voice: { prose: 'x'.repeat(241) } }), 'voice-too-long')
		has(f({ voice: { prose: 'x', laws: 'y' } as never }), 'unknown-rigour')
		has(f({ stats: [{ id: 'acme.rs:slot/ghost@1' }] }), 'unknown-stat')
		has(f({ stats: [{ id: might.id }, { id: might.id }] }), 'duplicate-stat')
		has(f({ stats: [{ id: might.id, default: 99 }] }), 'bad-stat-default')
		has(f({ conventions: { ...conventions, degrees: { bands: [{ id: 'm', label: 'M', five: 'fail' }] } } }), 'no-success-band')
		has(f({ conventions: { ...conventions, time: { unit: 'minute', roundSeconds: 6 } } }), 'bad-time-unit')
		has(f({ conventions: { ...conventions, dice: { sides: 1 } } }), 'bad-dice')
		has(f({ selectors: { a: { kind: 'derived', from: ['b'] }, b: { kind: 'derived', from: ['a'] } } }), 'derived-cycle')
		has(f({ selectors: { might: { kind: 'check' } } }), 'duplicate-selector')
		has(f({ repertoires: [gear, gear] }), 'duplicate-repertoire')
		has(f({ entryable: ['nothing'] }), 'unknown-repertoire')
		has(f({ compendium: { rows: { gear: [{ id: 'rope', version: '1', piece: { name: 'Rope', description: 'd' } }] } } }), 'missing-source')
		has(f({ compendium: { source: { document: 'd', licence: 'l' }, rows: { gear: [{ id: 'rope', version: '1', piece: { name: 'Rope' } } as never] } } }), 'bad-row')
		has(
			f({
				compendium: {
					source: { document: 'd', licence: 'l' },
					rows: {
						gear: [
							{ id: 'a', version: '1', piece: { name: 'A', description: 'd' } },
							{ id: 'a', version: '1', piece: { name: 'A', description: 'd' } },
						],
					},
				},
			}),
			'duplicate-row',
		)
		has(f({ compendium: { source: { document: 'd', licence: 'l' }, rows: { spells: [] } } }), 'unknown-repertoire')
		has(f({ scripts: [{ phase: 'whenever' as never, priority: 0, seedKey: 'k' }] }), 'bad-script-phase')
		has(f({ scripts: [{ phase: 'render', priority: 0, seedKey: 'k' }, { phase: 'render', priority: 1, seedKey: 'k' }] }), 'duplicate-script')
		has(f({ conversions: [{ from: 'core:ruleset/freeform@1', to: 'acme.rs:ruleset/other@1', idMap: [] }] }), 'conversion-not-ours')
		const setter = defineRepertoire('boons', {
			label: 'Boons',
			prose: 'p',
			mechanics: [{ verb: 'set', target: 'luck', value: 3 }],
		})
		has(f({ repertoires: [setter] }), 'set-outside-owner')
		const ownSet = defineRepertoire('boons2', { label: 'B', prose: 'p', mechanics: [{ verb: 'set', target: 'might', value: 3 }] })
		assert.deepEqual(f({ repertoires: [ownSet], compendium: undefined }), [])
		has(f({ stats: [{ id: might.id, borrowed: 'yes' as never }] }), 'bad-borrowed')
	})

	test('defineRuleset refuses with a RulesetError joining every finding', () => {
		throwsReason(() => defineRuleset('acme.rs:ruleset/broken@1', baseProps({ voice: {} })), 'missing-voice')
		assert.equal(getRuleset('acme.rs:ruleset/broken@1'), undefined)
	})
})

// ── Pieces in a list slot ───────────────────────────────────────────────────

describe('pieces', () => {
	const check = (value: SlotValue) => checkSlotValue(pieceSlot, value)

	test('the three piece forms validate against the repertoire', () => {
		assert.equal(check([{ kind: 'inline', name: 'Lantern', description: 'Hooded.', weight: 2, traits: ['light'] }]), null)
		assert.equal(check([{ kind: 'lore', entryId: 7, count: 2, overrides: { name: 'Old lantern' } }]), null)
		assert.equal(check([{ kind: 'compendium', compendiumId: RS.id, pieceId: 'rope', version: '1.0.0', overrides: { weight: 0 } }]), null)
		// A compendium of a ruleset that is not installed parks: kept, not refused.
		assert.equal(check([{ kind: 'compendium', compendiumId: 'acme.gone:ruleset/old@1', pieceId: 'x', version: '2' }]), null)
		// Bare words are legal forever, so old lists still validate.
		assert.equal(check(['torch', { kind: 'inline', name: 'Rope', description: 'Hemp.' }]), null)
	})

	test('a piece that does not fit is refused with a sentence', () => {
		assert.match(check([{ kind: 'inline', name: 'Rope' } as never]) ?? '', /description/)
		assert.match(check([{ kind: 'inline', name: 'Rope', description: 'd', colour: 'red' }]) ?? '', /no 'colour'/)
		assert.match(check([{ kind: 'inline', name: 'Rope', description: 'd', weight: -1 }]) ?? '', /minimum/)
		assert.match(check([{ kind: 'lore', entryId: 7, overrides: { weight: 'heavy' } }]) ?? '', /number/)
		assert.match(check([{ kind: 'lore', entryId: 7, count: 0 }]) ?? '', /count/)
		assert.match(check([{ kind: 'compendium', compendiumId: RS.id, pieceId: 'sword', version: '1' }]) ?? '', /no 'sword'/)
		assert.match(check([{ kind: 'compendium', compendiumId: 'nope', pieceId: 'rope', version: '1' } as never]) ?? '', /compendium piece is/)
		assert.match(
			check([
				{ kind: 'compendium', compendiumId: RS.id, pieceId: 'rope', version: '1' },
				{ kind: 'compendium', compendiumId: RS.id, pieceId: 'rope', version: '1' },
			]) ?? '',
			/twice/,
		)
		assert.match(checkSlotValue(plainList, [{ kind: 'inline', name: 'Rope', description: 'd' }]) ?? '', /names a repertoire/)
	})

	test('pieces are told apart from lore references, stored lean and read as text', () => {
		const lore = { kind: 'lore', entryId: 3, count: 1, name: 'Host-filled' } as const
		assert.equal(isSlotPiece(lore), true)
		assert.equal(isSlotLoreRef(lore), false)
		assert.equal(isSlotLoreRef({ entryId: 3 }), true)
		assert.deepEqual(slotValueForStorage([lore]), [{ kind: 'lore', entryId: 3 }])
		assert.equal(slotListItemText({ kind: 'inline', name: 'Ration', description: 'd', count: 3 }), 'Ration ×3')
		assert.equal(slotListItemText({ kind: 'compendium', compendiumId: RS.id, pieceId: 'rope', version: '1', overrides: { name: 'Lucky rope' } }), 'Lucky rope')
	})

	test('a list of objects is a stat only when a repertoire is named', () => {
		const field = { type: 'list', item: { type: 'object', fields: {} } } as const
		assert.equal(statShapeKindOf(field), undefined)
		assert.equal(statShapeKindOf(field, { repertoire: 'acme.rs:ruleset/test@1#gear' }), 'list')
		assert.equal(slotStatShapeKind(pieceSlot), 'list')
		assert.equal(pieceSlot.type, 'list')
	})
})

// ── Upgrades ────────────────────────────────────────────────────────────────

describe('ruleset upgrades', () => {
	const withGear = (g: RepertoireDecl) => ({ ...RS, repertoires: [g, doors] })
	test('a dropped field needs a rename or a retirement', () => {
		const dropped = defineRepertoire('gear', { label: 'Gear', prose: 'p' })
		has(rulesetUpgradeFindings(RS, withGear(dropped)), 'dropped-field')
		const renamed = defineRepertoire('gear', {
			label: 'Gear',
			prose: 'p',
			piece: { type: 'object', fields: { mass: { type: 'integer' } } },
			renames: { weight: 'mass' },
		})
		assert.deepEqual(rulesetUpgradeFindings(RS, withGear(renamed)), [])
		const retired = defineRepertoire('gear', { label: 'Gear', prose: 'p', retired: ['weight'] })
		assert.deepEqual(rulesetUpgradeFindings(RS, withGear(retired)), [])
		has(rulesetUpgradeFindings(RS, { ...RS, repertoires: [gear] }), 'dropped-repertoire')
		has(rulesetUpgradeFindings(RS, { ...RS, stats: [] }), 'dropped-stat')
		has(rulesetUpgradeFindings(RS, { ...RS, id: 'acme.rs:ruleset/else@1' }), 'not-same-ruleset')
	})

	test('a changed field type or a newly required field is refused (2026-10-17)', () => {
		const field = (fields: Record<string, unknown>, extra: object = {}) =>
			defineRepertoire('gear', { label: 'Gear', prose: 'p', piece: { type: 'object', fields: fields as never }, ...extra })
		has(rulesetUpgradeFindings(RS, withGear(field({ weight: { type: 'string' } }))), 'changed-field-type')
		has(rulesetUpgradeFindings(RS, withGear(field({ mass: { type: 'string' } }, { renames: { weight: 'mass' } }))), 'changed-field-type')
		has(rulesetUpgradeFindings(RS, withGear(field({ weight: { type: 'integer', required: true } }))), 'newly-required')
		has(rulesetUpgradeFindings(RS, withGear(field({ weight: { type: 'integer' }, colour: { type: 'string', required: true } }))), 'newly-required')
		assert.deepEqual(rulesetUpgradeFindings(RS, withGear(field({ weight: { type: 'integer' }, colour: { type: 'string', required: true, default: 'grey' } }))), [])
		assert.deepEqual(rulesetUpgradeFindings(RS, withGear(field({ weight: { type: 'integer' }, colour: { type: 'string' } }))), [])
	})

	test('a renamed field still reads through on a stored piece', () => {
		const renamed = defineRepertoire('gear', {
			label: 'Gear',
			prose: 'p',
			piece: { type: 'object', fields: { mass: { type: 'integer' } } },
			renames: { weight: 'mass' },
		})
		definePluginRuleset('acme.rs', 'acme.rs:ruleset/test2@1', baseProps({ repertoires: [renamed], compendium: undefined }))
		const slot = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/pack2@1', {
			shape: { type: 'list', item: { type: 'object', fields: {} } },
			label: 'Pack',
			descriptor: 'What they carry.',
			appliesTo: ['cast'],
			config: { repertoire: 'acme.rs:ruleset/test2@1#gear' },
		})
		assert.equal(checkSlotValue(slot, [{ kind: 'inline', name: 'Rope', description: 'd', weight: 1 }]), null)
	})
})

// ── Bridges and conversions ─────────────────────────────────────────────────

describe('bridges', () => {
	const derivedRs = definePluginRuleset(
		'acme.rs',
		'acme.rs:ruleset/derived@1',
		baseProps({ selectors: { attack: { kind: 'check', base: 'might' }, defence: { kind: 'derived', from: ['might'] } }, compendium: undefined }),
	)

	test('an additive bridge is accepted', () => {
		const b = defineBridge({
			field: foreign.id,
			ruleset: RS.id,
			effects: [
				{ verb: 'modify', target: 'attack', value: 1, predicate: { path: 'luck', truthy: true } },
				{ verb: 'rider', text: 'Lucky.', target: 'attack' },
			],
		})
		assert.ok(Object.isFrozen(b))
	})

	test('a registered bridge is read back by its ruleset; a different one for the same field throws', () => {
		const shaky = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/shaky@1', {
			type: 'boolean',
			label: 'Shaky',
			descriptor: 'Whether their hands shake.',
			appliesTo: ['cast'],
		})
		assert.deepEqual(bridgesFor(RS.id).filter((b) => b.field === shaky.id), [])
		const decl = { field: shaky.id, ruleset: RS.id, effects: [{ verb: 'modify', target: 'attack', value: -1, predicate: { path: 'shaky', truthy: true } }] } as const
		const b = registerBridge(decl)
		assert.ok(Object.isFrozen(b))
		assert.deepEqual(bridgesFor(RS.id).filter((x) => x.field === shaky.id), [b])
		assert.doesNotThrow(() => registerBridge(decl))
		assert.equal(bridgesFor(RS.id).filter((x) => x.field === shaky.id).length, 1)
		assert.throws(() => registerBridge({ ...decl, effects: [{ verb: 'modify', target: 'attack', value: -2 }] }), /duplicate bridge/)
		assert.deepEqual(bridgesFor('acme.rs:ruleset/none@1'), [])
		throwsReason(() => registerBridge({ ...decl, effects: [{ verb: 'set', target: 'might', value: 1 }] }), 'bridge-set')
	})

	test("a bridge's predicates may name its own field, never target it (2026-10-17)", () => {
		// A field the ruleset has no selector for — the host reads it beside
		// the ruleset's values by its bare key and its id.
		const mood = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/mood@1', {
			type: 'text',
			label: 'Mood',
			descriptor: 'How they feel.',
			appliesTo: ['cast'],
		})
		const f = (effects: unknown[]) => bridgeFindings({ field: mood.id, ruleset: RS.id, effects: effects as never })
		for (const path of ['mood', mood.id, 'mood.tone'])
			assert.deepEqual(f([{ verb: 'modify', target: 'attack', value: 1, predicate: { path, equals: 'hopeful' } }]), [], path)
		assert.ok(defineBridge({ field: mood.id, ruleset: RS.id, effects: [{ verb: 'modify', target: 'attack', value: 1, predicate: { path: 'mood', equals: 'hopeful' } }] }))
		has(f([{ verb: 'modify', target: 'attack', value: 1, predicate: { path: 'moody', equals: 'x' } }]), 'unknown-selector')
		has(f([{ verb: 'modify', target: 'mood', value: 1 }]), 'unknown-selector')
	})

	test('listings, sets, cut verbs and derived targets are refused by name', () => {
		const f = (effects: unknown[], ruleset = RS.id) => bridgeFindings({ field: foreign.id, ruleset, effects: effects as never })
		has(f([{ verb: 'modify', target: 'attack', value: 1, listing: 'instead' }]), 'bridge-listing')
		has(f([{ verb: 'modify', target: 'attack', value: 1, listing: 'after', seam: 'attack' }]), 'bridge-listing')
		has(f([{ verb: 'set', target: 'might', value: 1 }]), 'bridge-set')
		has(f([{ verb: 'bestow', repertoire: 'gear', piece: {} }]), 'unknown-verb')
		// 🚧 A bridge has no piece to use (2026-10-18).
		has(f([{ verb: 'consume', on: 'use' }]), 'bridge-piece-verb')
		has(f([{ verb: 'cure', on: 'use', traits: ['x'] }]), 'bridge-piece-verb')
		has(f([{ verb: 'modify', target: 'atk', value: 1 }]), 'unknown-selector')
		has(f([{ verb: 'modify', target: 'defence', value: 1 }], derivedRs.id), 'derived-target')
		has(f([{ verb: 'modify', target: 'attack', value: 1 }], 'acme.rs:ruleset/absent@1'), 'unknown-ruleset')
		has(f([]), 'no-effects')
		has(bridgeFindings({ field: 'acme.rs:slot/ghost@1', ruleset: RS.id, effects: [{ verb: 'modify', target: 'attack', value: 1 }] }), 'unknown-field')
		throwsReason(() => defineBridge({ field: foreign.id, ruleset: RS.id, effects: [{ verb: 'set', target: 'might', value: 1 }] }), 'bridge-set')
	})
})

describe('conversions', () => {
	test('a conversion is { from, to, idMap }; ids are checked', () => {
		const ok = { from: 'core:ruleset/freeform@1', to: RS.id, idMap: [{ from: 'things/rope', to: 'gear/rope' }] } as const
		assert.deepEqual(conversionFindings(ok, { ruleset: RS.id }), [])
		has(conversionFindings({ ...ok, to: ok.from }), 'converts-to-itself')
		has(conversionFindings({ ...ok, from: 'story' }), 'bad-ruleset-id')
		has(conversionFindings({ ...ok, idMap: [ok.idMap[0], ok.idMap[0]] }), 'duplicate-id-map')
		has(conversionFindings({ ...ok, idMap: [{ from: '', to: 'x' }] }), 'bad-id-map')
		// The cut tiers are refused, not silently carried.
		has(conversionFindings({ ...ok, tier3: 'prose' } as never), 'bad-id-map')
	})
})

// ── Selector families, universal piece parts, nested rows (2026-10-17) ─────

describe('selector families', () => {
	const fam = baseProps({
		selectors: {
			attack: { kind: 'check', base: 'might' },
			'attack.melee': { kind: 'check', base: 'might' },
			'skill.climb': { kind: 'check', base: 'might', within: 'check' },
			'save.might': { kind: 'check', base: 'might' },
			damage: { kind: 'tally' },
		},
		compendium: undefined,
	})
	const mod = (target: string, verb: 'modify' | 'adjustDegree' | 'set' = 'modify') =>
		defineRepertoire('boons', {
			label: 'B',
			prose: 'p',
			mechanics: [verb === 'set' ? { verb, target, value: 1 } : verb === 'adjustDegree' ? { verb, target, by: 1 } : { verb, target, value: 1 }],
		})
	const findingsFor = (target: string, verb?: 'modify' | 'adjustDegree' | 'set') =>
		rulesetFindings('acme.rs:ruleset/fam@1', { ...fam, repertoires: [mod(target, verb)] })

	test("a dotted selector's parents and a check's `within` are its family", () => {
		assert.deepEqual(rulesetSelectorFamily(fam, 'attack.melee'), ['attack.melee', 'attack'])
		assert.deepEqual(rulesetSelectorFamily(fam, 'skill.climb'), ['skill.climb', 'skill', 'check'])
		assert.deepEqual(rulesetSelectorFamily(fam, 'save.might'), ['save.might', 'save'])
		assert.deepEqual(rulesetSelectorFamily(fam, 'nothing'), ['nothing'])
	})

	test('modify and adjustDegree may target a family; set may not; an unknown name is refused', () => {
		for (const t of ['attack', 'skill', 'check', 'save', 'attack.melee', 'damage']) assert.deepEqual(findingsFor(t), [], t)
		assert.deepEqual(findingsFor('check', 'adjustDegree'), [])
		has(findingsFor('saves'), 'unknown-selector')
		has(findingsFor('skill.swim'), 'unknown-selector')
		has(findingsFor('check', 'set'), 'unknown-selector')
	})

	test('within names a check or a free family name, never itself, its parent or a cycle', () => {
		// `attack` stays declared: the fixture's gear modifies it.
		const f = (selectors: RulesetProps['selectors']) =>
			rulesetFindings('acme.rs:ruleset/w@1', baseProps({ selectors: { attack: { kind: 'check', base: 'might' }, ...selectors }, compendium: undefined }))
		assert.deepEqual(f({ 'skill.climb': { kind: 'check', within: 'check' } }), [])
		has(f({ 'skill.climb': { kind: 'check', within: 'luck' }, luck: { kind: 'stat', slot: foreign.id } }), 'bad-selector')
		has(f({ 'skill.climb': { kind: 'check', within: 'skill' } }), 'bad-selector')
		has(f({ 'Bad Name': { kind: 'tally' } }), 'bad-selector')
		has(f({ a: { kind: 'check', within: 'b' }, b: { kind: 'check', within: 'a' } }), 'derived-cycle')
		has(f({ x: { kind: 'roll' } as never }), 'bad-selector')
	})
})

describe('universal piece parts: equipped and duration', () => {
	const check = (value: SlotValue) => checkSlotValue(pieceSlot, value)
	test('an inline piece may be equipped and timed, in the units its ruleset counts', () => {
		assert.equal(check([{ kind: 'inline', name: 'Rope', description: 'd', equipped: true }]), null)
		assert.equal(check([{ kind: 'inline', name: 'Rope', description: 'd', duration: { units: 'round', value: 3, expiry: 'elapsed' } }]), null)
		assert.equal(check([{ kind: 'inline', name: 'Rope', description: 'd', duration: { units: 'minute', value: 10 } }]), null)
		assert.equal(check([{ kind: 'lore', entryId: 7, overrides: { equipped: false, duration: { units: 'until-removed', expiry: 'never' } } }]), null)
		assert.match(check([{ kind: 'inline', name: 'Rope', description: 'd', equipped: 'yes' } as never]) ?? '', /boolean/)
		assert.match(check([{ kind: 'inline', name: 'Rope', description: 'd', duration: { units: 'fortnight', value: 1 } } as never]) ?? '', /fortnight|one of/)
		assert.match(check([{ kind: 'inline', name: 'Rope', description: 'd', duration: { units: 'round', expiry: 'elapsed' } }]) ?? '', /runs out|how many/)
	})

	test('a duration the ruleset cannot count is named', () => {
		assert.equal(pieceDurationProblem({ units: 'round', value: 1 }, 'round'), null)
		assert.equal(pieceDurationProblem({ units: 'scene' }, 'scene'), null)
		assert.equal(pieceDurationProblem(undefined, 'scene'), null)
		assert.match(pieceDurationProblem({ units: 'round', value: 1 }, 'minute') ?? '', /rounds/)
		assert.match(pieceDurationProblem({ units: 'hour', value: 1 }, 'scene') ?? '', /clock/)
		assert.match(pieceDurationProblem({ units: 'turn', expiry: 'elapsed' }) ?? '', /runs out/)
		assert.match(checkPiece(gear, { kind: 'inline', name: 'R', description: 'd', duration: { units: 'day', value: 1 } }, { timeUnit: 'scene' }) ?? '', /clock/)
	})

	test("a write through a slot judges the duration by the slot's ruleset", () => {
		const tale = defineRepertoire('marks', { label: 'Marks', prose: 'What marks someone.' })
		const scenes = definePluginRuleset(
			'acme.rs',
			'acme.rs:ruleset/scenes@1',
			baseProps({ conventions: { ...conventions, dice: undefined, time: { unit: 'scene' } }, repertoires: [tale], compendium: undefined, selectors: undefined }),
		)
		const marks = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/marks@1', {
			shape: { type: 'list', item: { type: 'object', fields: {} } },
			label: 'Marks',
			descriptor: 'What marks them.',
			appliesTo: ['cast'],
			config: { repertoire: repertoireAddress(scenes.id, 'marks') },
		})
		assert.equal(checkSlotValue(marks, [{ kind: 'inline', name: 'Scar', description: 'd', duration: { units: 'scene' } }]), null)
		assert.match(checkSlotValue(marks, [{ kind: 'inline', name: 'Scar', description: 'd', duration: { units: 'round', value: 2 } }]) ?? '', /rounds/)
	})
})

describe('compendium rows are nested', () => {
	const f = (rows: unknown[]) =>
		rulesetFindings('acme.rs:ruleset/rows@1', baseProps({ compendium: { source: { document: 'd', licence: 'l' }, rows: { gear: rows as never } } }))
	test("a row's piece is nested under `piece`, so a field may be called `source`", () => {
		assert.deepEqual(f([{ id: 'rope', version: '1', piece: { name: 'Rope', description: 'd' } }]), [])
		has(f([{ id: 'rope', version: '1', name: 'Rope', description: 'd' }]), 'bad-row')
		has(f([{ id: 'rope', version: '1' }]), 'bad-row')
		// A scene is counted by play, in any ruleset.
		assert.deepEqual(f([{ id: 'rope', version: '1', piece: { name: 'Rope', description: 'd', duration: { units: 'scene' } } }]), [])
	})
	test("a row's duration is judged by the ruleset's time", () => {
		const scenes = rulesetFindings(
			'acme.rs:ruleset/rows2@1',
			baseProps({
				conventions: { ...conventions, time: { unit: 'scene' } },
				compendium: { source: { document: 'd', licence: 'l' }, rows: { gear: [{ id: 'rope', version: '1', piece: { name: 'Rope', description: 'd', duration: { units: 'round', value: 1 } } }] } },
			}),
		)
		has(scenes, 'bad-row')
	})
})

// ── Genres ──────────────────────────────────────────────────────────────────

describe('genre rigour and rulesets', () => {
	test('valid declarations are carried on the genre', () => {
		const g = genre('acme.rs:genre/table', {
			name: 'Table',
			family: 'chat',
			rigour: { options: ['prose', 'mechanics'], default: 'mechanics' },
			rulesets: { recommended: [RS.id, 'acme.other:ruleset/elsewhere@1'], default: RS.id },
		})
		assert.deepEqual(g.rigour, { options: ['prose', 'mechanics'], default: 'mechanics' })
		assert.deepEqual(g.rulesets, { recommended: [RS.id, 'acme.other:ruleset/elsewhere@1'], default: RS.id })
		const plain = genre('acme.rs:genre/plain', { name: 'Plain', family: 'chat' })
		assert.equal('rigour' in plain, false)
		assert.equal('rulesets' in plain, false)
	})

	test('refusals are named', () => {
		const f = (p: Parameters<typeof genreRulesetFindings>[1]) => genreRulesetFindings('acme.rs:genre/t', p)
		has(f({ rigour: { options: ['prose'], default: 'scripts' } }), 'bad-rigour')
		has(f({ rigour: { options: [], default: 'prose' } }), 'bad-rigour')
		has(f({ rigour: { options: ['laws' as never], default: 'laws' as never } }), 'bad-rigour')
		has(f({ rulesets: { only: [] } }), 'bad-rulesets')
		has(f({ rulesets: { recommended: [RS.id], default: 'acme.rs:ruleset/other@1' } }), 'bad-rulesets')
		has(f({ rulesets: { only: ['story'] } }), 'bad-ruleset-id')
		has(f({ rulesets: { only: ['core:ruleset/nonesuch@1'] } }), 'unknown-ruleset')
		has(f({ rulesets: { only: ['acme.rs:ruleset/unregistered@1'] } }), 'unknown-ruleset')
		// Another package's ruleset is that package's `requires`, resolved at install.
		assert.deepEqual(f({ rulesets: { only: ['acme.other:ruleset/x@1'] } }), [])
		// `strict` was renamed `only` (2026-10-17): refused with the new word.
		const renamed = f({ rulesets: { strict: [RS.id] } as never })
		has(renamed, 'bad-rulesets')
		assert.match(renamed.join('\n'), /only/)
		assert.deepEqual(genre('acme.rs:genre/one', { name: 'One', family: 'chat', rulesets: { only: [RS.id] } }).rulesets, { only: [RS.id] })
		throwsReason(() => genre('acme.rs:genre/bad', { name: 'Bad', family: 'chat', rigour: { options: ['prose'], default: 'mechanics' } }), 'bad-rigour')
	})
})

// ── Core's Story, and the handler stub ──────────────────────────────────────

describe("core's Story ruleset", () => {
	test('is registered with its repertoires, stat and voice', () => {
		assert.equal(freeformRuleset.id, 'core:ruleset/freeform@1')
		assert.equal(getRuleset('core:ruleset/freeform@1'), freeformRuleset)
		assert.deepEqual(freeformRuleset.repertoires.map((r) => r.id), ['things', 'conditions', 'exits', 'notes'])
		assert.deepEqual(freeformRuleset.stats.map((s) => s.id), ['core:slot/mood@1'])
		assert.deepEqual(rulesetEntryable(freeformRuleset), ['things', 'conditions'])
		const exits = getRepertoire('core:ruleset/freeform@1#exits')!
		assert.equal(exits.relational, true)
		assert.deepEqual(exits.appliesTo, ['location'])
		assert.equal(freeformRuleset.compendium, undefined)
		assert.equal(freeformRuleset.conventions.dice, undefined)
		for (const r of ['prose', 'mechanics', 'scripts'] as const) assert.ok(freeformRuleset.voice[r]!.length <= 240, r)
		assert.deepEqual(rulesetFindings(freeformRuleset.id, freeformRuleset), [])
		assert.equal(rulesetEntryTypeId(freeformRuleset.id, 'things'), 'core:entry/freeform.things@1')
	})
})

describe('core:task/ruleset-resolve@1 (contract stub)', () => {
	test('is published provisional, seeded, with the declared ports', () => {
		assert.equal(rulesetResolve.id, 'core:task/ruleset-resolve@1')
		const d = getDefinition('core:task/ruleset-resolve@1') as unknown as {
			declaresRandomness?: boolean
			provisional?: boolean
			ports: { in: object; out: object }
		}
		assert.equal(d.declaresRandomness, true)
		// 2026-10-17: bound by the app — no longer provisional (test name kept).
		assert.equal(d.provisional, undefined)
		// 2026-10-16 (W3-S): + `scope`, so a call not handed owners still knows its session.
		assert.deepEqual(Object.keys(d.ports.in), ['scope', 'owners', 'rigour', 'mode', 'actions', 'deltas', 'elapsed', 'viewer'])
		assert.deepEqual(Object.keys(d.ports.out), ['blocks', 'facts', 'outcomes', 'explain', 'rejected'])
	})
})

describe('core:task/context-budget@1 takes blocks (W3-S)', () => {
	test('an optional blocks in-port and a fittedBlocks out-port, beside the budget it always gave', async () => {
		const { contextBudget } = await import('@serene-pub/contracts')
		const d = getDefinition(contextBudget.id) as unknown as { ports: { in?: object; out: object } }
		assert.deepEqual(Object.keys(d.ports.in ?? {}), ['blocks'])
		assert.deepEqual(Object.keys(d.ports.out), ['main', 'available', 'fittedBlocks'])
	})
})

describe('ruleset-owned slots (W3-S; derived 2026-10-17)', () => {
	test('pickable only in the owning ruleset\'s sessions', async () => {
		const { slotPickableIn, slotRulesetOwners, getAttributeSlot } = await import('@serene-pub/sdk')
		await import('../core-catalog/src/index.js')
		const str = getAttributeSlot('core:slot/itineris-strength@1')!
		// Owned by being listed under Vis Itineris's stats, not by saying so.
		assert.equal(str.rulesetOwned, undefined)
		assert.deepEqual(slotRulesetOwners(str), ['core:ruleset/vis-itineris@1'])
		assert.equal(slotPickableIn(str, 'core:ruleset/vis-itineris@1'), true)
		assert.equal(slotPickableIn(str, 'core:ruleset/freeform@1'), false)
		assert.equal(slotPickableIn(str, null), false)
		const mood = getAttributeSlot('core:slot/mood@1')!
		assert.equal(slotPickableIn(mood, 'core:ruleset/vis-itineris@1'), true, 'a shared core slot is no ruleset\'s — Story borrows it')
		for (const shared of ['core:slot/hp@1', 'core:slot/level@1', 'core:slot/character-class@1']) {
			assert.deepEqual(slotRulesetOwners(getAttributeSlot(shared)!), [], `${shared} is borrowed`)
			assert.equal(slotPickableIn(getAttributeSlot(shared)!, 'core:ruleset/freeform@1'), true, shared)
		}
		assert.equal(slotPickableIn({ pickable: false, rulesetOwned: 'core:ruleset/vis-itineris@1' }, 'core:ruleset/vis-itineris@1'), false)
	})

	test('a spelled rulesetOwned is still read, beside the derived owners', async () => {
		const { slotPickableIn, slotRulesetOwners } = await import('@serene-pub/sdk')
		const spelled = definePluginAttributeSlot('acme.rs', 'acme.rs:slot/spelled@1', {
			type: 'integer',
			label: 'Spelled',
			descriptor: 'A number.',
			appliesTo: ['cast'],
			rulesetOwned: RS.id,
		})
		assert.deepEqual(slotRulesetOwners(spelled), [RS.id])
		assert.equal(slotPickableIn(spelled, RS.id), true)
		assert.equal(slotPickableIn(spelled, 'core:ruleset/freeform@1'), false)
		// `might` is listed by the fixture ruleset, so derived; a declaration
		// passed without its id reads only what it spells.
		assert.ok(slotRulesetOwners(might).includes(RS.id))
		assert.equal(slotPickableIn({ type: might.type } as never, 'core:ruleset/freeform@1'), true)
	})

	test('rulesetOwned names a ruleset id', async () => {
		const { defineAttributeSlot } = await import('@serene-pub/sdk')
		assert.throws(
			() => defineAttributeSlot('test:slot/owned-badly@1', { type: 'integer', label: { en: 'X' }, descriptor: 'A number.', appliesTo: ['cast'], rulesetOwned: 'vis-itineris' }),
			/rulesetOwned/,
		)
	})
})
