/**
 * 🚧 The ruleset document (PLAN-ruleset-editor §3): a ruleset as data.
 *
 *  - a shipped declaration round-trips through a document and back into the
 *    registry under a new owner, with its slots copied beside it;
 *  - a stored ruleset's derived entry types, repertoires and stat listings
 *    arrive with it and leave with `_withdrawRuleset`;
 *  - a stored id republished REPLACES the held declaration; a code id must
 *    be identical; neither origin may claim the other's id;
 *  - reserved owners (`core`, an installed plugin) are refused;
 *  - the upgrade gate wants the version moved forward and nothing dropped.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	_clearReservedAttributeOwners,
	_withdrawRuleset,
	allEntryTypes,
	bumpRulesetVersion,
	compareRulesetVersions,
	defineStoredAttributeSlot,
	defineStoredRuleset,
	defineStoredRulesetDocument,
	getAttributeSlot,
	getRepertoire,
	getRuleset,
	parseRulesetId,
	reidRulesetDocument,
	repertoireAddress,
	reserveAttributeOwner,
	rulesetDocumentFindings,
	rulesetDocumentOf,
	rulesetDocumentOwnSlots,
	rulesetDocumentProps,
	rulesetDocumentUpgradeFindings,
	rulesetEntryTypeId,
	rulesetEntryable,
	type RulesetDocument,
	type SlotId,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const OWNER = 'acme.lab'
const MINE = `${OWNER}:ruleset/mine@1`

/** Copy the slots a document owns under the new owner, as the app's copy does. */
function copySlots(doc: RulesetDocument, owner: string): Record<string, SlotId> {
	const out: Record<string, SlotId> = {}
	for (const id of rulesetDocumentOwnSlots(doc)) {
		const decl = getAttributeSlot(id)
		if (!decl) continue
		const name = id.slice(id.indexOf('/') + 1, id.lastIndexOf('@'))
		const next = `${owner}:slot/${name}@1` as SlotId
		if (!getAttributeSlot(next)) {
			const { id: _i, origin: _o, authorUserId: _a, ...props } = decl as typeof decl & { authorUserId?: unknown }
			defineStoredAttributeSlot(next, props, { userId: 7 })
		}
		out[id] = next
	}
	return out
}

describe('ruleset document', () => {
	test('parseRulesetId reads the parts', () => {
		assert.deepEqual(parseRulesetId('core:ruleset/freeform@1'), { owner: 'core', name: 'freeform', major: 1 })
		assert.equal(parseRulesetId('freeform'), undefined)
	})

	test('a shipped ruleset round-trips into a stored copy under a new owner', () => {
		const doc = rulesetDocumentOf(cat.visItinerisRuleset)
		assert.equal(doc.version, '1.0.0')
		assert.equal((doc as { origin?: unknown }).origin, undefined)
		assert.equal(rulesetDocumentFindings(doc).length, 0, rulesetDocumentFindings(doc).join('\n'))

		const slots = copySlots(doc, OWNER)
		assert.ok(Object.keys(slots).length > 0, 'Vis Itineris owns slots to copy')
		const mine = reidRulesetDocument(doc, MINE, slots)
		assert.equal(mine.id, MINE)
		// Every own attribute now names a copied slot; borrowed ones are marked (in the sections since 2026-10-23).
		for (const a of mine.attributes!) {
			if (!a.slot) continue
			if (a.borrowed) assert.notEqual(a.slot.slice(0, a.slot.indexOf(':')), OWNER)
			else assert.equal(a.slot.slice(0, a.slot.indexOf(':')), OWNER, a.slot)
		}
		assert.ok(mine.options?.conversions?.length)
		for (const c of mine.options?.conversions ?? []) assert.equal(c.to, MINE)
		assert.equal(rulesetDocumentFindings(mine).length, 0, rulesetDocumentFindings(mine).join('\n'))

		const decl = defineStoredRulesetDocument(mine, { userId: 7 })
		assert.equal(decl.origin, 'stored')
		assert.equal(decl.authorUserId, 7)
		assert.equal(getRuleset(MINE), decl)
		const rep = cat.visItinerisRuleset.entryTypes![0]!
		assert.ok(getRepertoire(repertoireAddress(MINE, rep.id)), 'its repertoires are registered under it')
		// Derived entry types arrive once the host derives them, as core-catalog does for its own.
		const derived = cat.deriveEntryTypes(decl)
		assert.ok(derived.length > 0)
		assert.ok(allEntryTypes().some((t) => t.id === derived[0]!.id))
		assert.ok(derived.some((t) => t.id === rulesetEntryTypeId(MINE, rulesetEntryable(decl)[0]!)))

		// The original is untouched.
		assert.equal(getRuleset(cat.visItinerisRuleset.id), cat.visItinerisRuleset)

		// Withdraw takes everything with it.
		assert.equal(_withdrawRuleset(MINE), true)
		assert.equal(getRuleset(MINE), undefined)
		assert.equal(getRepertoire(repertoireAddress(MINE, rep.id)), undefined)
		assert.ok(!allEntryTypes().some((t) => t.id.startsWith(`${OWNER}:entry/mine.`)))
		assert.equal(_withdrawRuleset('core:ruleset/freeform@1'), false, "core's are never withdrawn")
	})

	test('a stored id republished replaces what was held; a code id may not be claimed', () => {
		const doc = rulesetDocumentOf(cat.freeformRuleset)
		const a = reidRulesetDocument(doc, `${OWNER}:ruleset/again@1`)
		const first = defineStoredRulesetDocument(a, { userId: 7 })
		const second = defineStoredRulesetDocument(
			{ ...a, version: '1.0.1', name: { en: 'Again, renamed' } },
			{ userId: 7 },
		)
		assert.notEqual(first, second)
		assert.equal(getRuleset(a.id), second)
		assert.throws(
			() => defineStoredRuleset('core:ruleset/freeform@1', rulesetDocumentProps(rulesetDocumentOf(cat.freeformRuleset)), { userId: 7 }),
			/reserved owner 'core'/,
		)
		_withdrawRuleset(a.id)
	})

	test('an installed plugin owner is reserved', () => {
		reserveAttributeOwner('vendor.pack')
		try {
			const doc = reidRulesetDocument(rulesetDocumentOf(cat.freeformRuleset), 'vendor.pack:ruleset/x@1')
			assert.throws(() => defineStoredRulesetDocument(doc, { userId: 7 }), /reserved owner 'vendor.pack'/)
		} finally {
			_clearReservedAttributeOwners()
		}
	})

	test('findings name a bad version and the declaration inside', () => {
		assert.match(rulesetDocumentFindings(null)[0]!, /not-a-document/)
		const doc = rulesetDocumentOf(cat.freeformRuleset)
		const bad = { ...doc, version: 'v1', voice: {} } as unknown as RulesetDocument
		const found = rulesetDocumentFindings(bad)
		assert.ok(found.some((f) => f.startsWith('[bad-version]')), found.join('\n'))
		assert.ok(found.some((f) => f.startsWith('[missing-voice]')), found.join('\n'))
	})

	test('the upgrade gate wants the version moved forward', () => {
		const prev = reidRulesetDocument(rulesetDocumentOf(cat.freeformRuleset), MINE)
		assert.ok(rulesetDocumentUpgradeFindings(prev, prev).some((f) => f.startsWith('[version-not-bumped]')))
		assert.ok(rulesetDocumentUpgradeFindings({ ...prev, version: '2.0.0' }, prev).some((f) => f.startsWith('[version-backwards]')))
		assert.equal(rulesetDocumentUpgradeFindings(prev, { ...prev, version: bumpRulesetVersion(prev.version) }).length, 0)
		assert.equal(bumpRulesetVersion('1.2.3'), '1.2.4')
		assert.equal(bumpRulesetVersion('1.2.3', 'minor'), '1.3.0')
		assert.equal(bumpRulesetVersion('1.2.3', 'major'), '2.0.0')
		assert.ok(compareRulesetVersions('1.10.0', '1.9.9') > 0)
	})
})
