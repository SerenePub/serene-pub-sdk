/**
 * 🚧 Entry types and zone types (PLAN-rulesets-functions D5, 2026-10-23).
 *
 * A ruleset's entry types ARE lorebook entry types; a held entry is a copy
 * stamped from its entry (its id kept); a zone type is declared once and
 * instanced per owner, and who sees an entry is its zone's visibility. The
 * `carried` zone type is the host's default, present whatever the ruleset.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	CARRIED_ZONE_TYPE,
	CORE_FUNCTION_IDS,
	entryTypeFields,
	rulesetEntryTypeDecls,
	rulesetEntryTypeFindings,
	rulesetSectionFindings,
	rulesetZoneTypes,
	RulesetError,
	stampHeldEntry,
	ZONE_HOLDS_ANY,
	zoneTypeFindings,
	type RulesetEntryTypeDecl,
	type ZoneTypeDecl,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const reasons = (findings: readonly string[]): string[] => findings.map((f) => /^\[([a-z-]+)\]/.exec(f)?.[1] ?? f)
const has = (findings: readonly string[], reason: string) =>
	assert.ok(reasons(findings).includes(reason), `expected [${reason}] in:\n${findings.join('\n')}`)

const CARDS: RulesetEntryTypeDecl = {
	id: 'cards',
	name: 'Cards',
	fields: { suit: { type: 'enum', of: ['hearts', 'spades'], label: 'Suit' }, rank: { type: 'integer', min: 1, max: 13, label: 'Rank' } },
	tags: ['card'],
	prose: 'A playing card.',
	shownAs: 'fan',
}
const HAND: ZoneTypeDecl = { id: 'hand', name: 'Hand', owners: ['cast'], holds: ['cards'], limit: 7, visibility: 'holder', prose: 'The cards someone holds.', shownAs: 'fan' }
const DECK: ZoneTypeDecl = { id: 'deck', name: 'Deck', owners: ['world'], holds: ['cards'], ordered: true, visibility: 'gm', prose: 'The cards left to draw.' }

describe('zone types', () => {
	test('the carried zone type is the host default: present unless a ruleset says its own', () => {
		assert.deepEqual([CARRIED_ZONE_TYPE.id, CARRIED_ZONE_TYPE.holds, CARRIED_ZONE_TYPE.owners], ['carried', ZONE_HOLDS_ANY, ['cast', 'location']])
		assert.deepEqual(zoneTypeFindings(CARRIED_ZONE_TYPE, 'carried'), [])
		assert.deepEqual(rulesetZoneTypes({ name: 'Cards', zoneTypes: [HAND, DECK] }).map((z) => z.id), ['hand', 'deck', 'carried'])
		const mine = { ...CARRIED_ZONE_TYPE, owners: ['cast'] as const, prose: 'Only what is on them.' }
		assert.deepEqual(rulesetZoneTypes({ name: 'Cards', zoneTypes: [mine] }), [mine])
		// The shape before the sections declares none: its carried list is the host's.
		assert.deepEqual(rulesetZoneTypes(cat.visItinerisRuleset), [CARRIED_ZONE_TYPE])
	})

	test('declared once per owner, holding entry types, with a limit and who sees what sits in it', () => {
		const ctx = { entryTypes: new Set(['cards']), attributes: new Set(['grip']) }
		assert.deepEqual(zoneTypeFindings(HAND, 'hand', ctx), [])
		assert.deepEqual(zoneTypeFindings(DECK, 'deck', ctx), [])
		assert.deepEqual(zoneTypeFindings({ ...HAND, limit: { attribute: 'grip' } }, 'hand', ctx), [])
		has(zoneTypeFindings({ ...HAND, owners: undefined as never }, 'hand', ctx), 'bad-owners')
		has(zoneTypeFindings({ ...HAND, owners: ['party' as never] }, 'hand', ctx), 'bad-owners')
		has(zoneTypeFindings({ ...HAND, holds: ['coins'] }, 'hand', ctx), 'bad-holds')
		has(zoneTypeFindings({ ...HAND, holds: [] }, 'hand', ctx), 'bad-holds')
		has(zoneTypeFindings({ ...HAND, limit: 0 }, 'hand', ctx), 'bad-limit')
		has(zoneTypeFindings({ ...HAND, limit: { attribute: 'strength' } }, 'hand', ctx), 'bad-limit')
		has(zoneTypeFindings({ ...HAND, ordered: false as never }, 'hand', ctx), 'bad-zone-type')
		has(zoneTypeFindings({ ...HAND, prose: '' }, 'hand', ctx), 'missing-prose')
		has(zoneTypeFindings({ ...HAND, id: 'Hand' }, 'hand', ctx), 'bad-zone-type')
		// Visibility by a scope: a scope function, never another kind.
		assert.deepEqual(zoneTypeFindings({ ...HAND, visibility: CORE_FUNCTION_IDS.samePlace }, 'hand', ctx), [])
		has(zoneTypeFindings({ ...HAND, visibility: CORE_FUNCTION_IDS.cardDraw }, 'hand', ctx), 'bad-visibility')
	})

	test('in a ruleset: what a zone holds is its entry types; zone types a function adds count as its own', () => {
		const base = { name: 'Cards', entryTypes: [CARDS], zoneTypes: [HAND, DECK] }
		assert.deepEqual(rulesetSectionFindings('acme.zone:ruleset/cards@1', base), [])
		has(rulesetSectionFindings('acme.zone:ruleset/cards@1', { ...base, zoneTypes: [HAND, HAND] }), 'duplicate-zone-type')
		const discard = {
			ref: 'acme.zone:function/discard@1',
			module: {
				id: 'acme.zone:function/discard@1',
				name: 'Discard',
				meaning: 'A discard pile beside the deck.',
				kind: 'zones' as const,
				adds: { zoneTypes: [{ id: 'discard', name: 'Discard', owners: ['world' as const], holds: ['cards'], prose: 'Played cards.' }] },
				prose: 'Played cards go to the discard.',
			},
		}
		assert.deepEqual(rulesetSectionFindings('acme.zone:ruleset/cards@1', { ...base, functions: [discard] }), [])
		has(rulesetSectionFindings('acme.zone:ruleset/cards@1', { ...base, zoneTypes: [HAND, DECK, { ...DECK, id: 'discard' }], functions: [discard] }), 'duplicate-zone-type')
	})
})

describe('entry types', () => {
	test('an entry type is name, description, traits when it says so, ties when relational, then its own fields', () => {
		assert.deepEqual(Object.keys(entryTypeFields(CARDS)), ['name', 'description', 'suit', 'rank'])
		assert.deepEqual(Object.keys(entryTypeFields({ ...CARDS, traits: true, relational: true })), ['name', 'description', 'traits', 'towards', 'edge', 'suit', 'rank'])
		assert.deepEqual(rulesetEntryTypeFindings(CARDS, 'cards'), [])
		has(rulesetEntryTypeFindings({ ...CARDS, fields: { name: { type: 'string', label: 'Name' } } }, 'cards'), 'bad-entry-type')
		has(rulesetEntryTypeFindings({ ...CARDS, prose: '' }, 'cards'), 'missing-prose')
		has(rulesetEntryTypeFindings({ ...CARDS, holders: [] }, 'cards'), 'bad-holders')
		has(rulesetEntryTypeFindings({ ...CARDS, visibility: 'nobody' as never }, 'cards'), 'bad-visibility')
		has(rulesetEntryTypeFindings({ ...CARDS, entryable: true as never }, 'cards'), 'bad-entry-type')
		has(rulesetEntryTypeFindings({ ...CARDS, tags: ['Card'] }, 'cards'), 'bad-tags')
	})

	test('they derive lorebook entry types, refused where an own field is a universal one', () => {
		const rs = { id: 'acme.zone:ruleset/cards@1', entryTypes: [CARDS, { ...CARDS, id: 'jokers', entryable: false as const }] }
		const decls = rulesetEntryTypeDecls(rs, cat.ENTRY_UNIVERSAL_PARTS)
		assert.deepEqual(decls.map((d) => d.id), ['acme.zone:entry/cards.cards@1'])
		assert.ok('priority' in decls[0]!.fields! && 'suit' in decls[0]!.fields!)
		assert.throws(
			() => rulesetEntryTypeDecls({ ...rs, entryTypes: [{ ...CARDS, fields: { priority: { type: 'integer', label: 'Priority' } } }] }, cat.ENTRY_UNIVERSAL_PARTS),
			(e: unknown) => e instanceof RulesetError && reasons(e.findings).includes('entry-field-collision'),
		)
	})

	test('a held entry is a copy stamped from its entry — its id kept, overrides laid over', () => {
		const entry = { id: 41, entryType: 'acme.zone:entry/cards.cards@1', name: 'Queen of hearts', fields: { suit: 'hearts', rank: 12 } }
		const held = stampHeldEntry(entry, { rank: 13 })
		assert.deepEqual(held, { entryId: 41, entryType: entry.entryType, name: 'Queen of hearts', fields: { suit: 'hearts', rank: 13 } })
		entry.fields.suit = 'spades'
		assert.equal(held.fields.suit, 'hearts', 'a copy, never a reference')
		assert.ok(Object.isFrozen(held) && Object.isFrozen(held.fields))
		assert.equal(stampHeldEntry(entry, {}, { count: 3 }).count, 3)
		assert.equal(stampHeldEntry({ id: null, entryType: entry.entryType, name: 'A joker' }).entryId, null)
	})
})
