/**
 * 🚧 M0, lane T4: a ruleset document's `upgrades` chain, the upgrade
 * gate's reading of declared moves, `upgrades` surviving the sections, and a
 * genre's `rulesets.autoConvert`.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	genre,
	genreRulesetFindings,
	reidRulesetDocument,
	rulesetAttributeSlots,
	rulesetDocumentFindings,
	rulesetDocumentOf,
	rulesetDocumentUpgradeFindings,
	rulesetInSections,
	type RulesetDocument,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

const ID = 'acme.lab:ruleset/upgrades@1' as const
const A = 'acme.lab:slot/old-a@1'
const B = 'acme.lab:slot/new-a@1'
const base = () => reidRulesetDocument(rulesetDocumentOf(cat.visItinerisRuleset), ID)
const chain = (upgrades: unknown, version = '2.0.0') => ({ ...base(), version, upgrades }) as unknown as RulesetDocument
const bad = (doc: RulesetDocument) => rulesetDocumentFindings(doc).filter((f) => f.startsWith('[bad-version]'))

describe('the upgrades chain', () => {
	test('a sound chain says nothing', () => {
		assert.deepEqual(bad(chain([{ from: '1.0.0', to: '1.1.0' }, { from: '1.1.0', to: '2.0.0', slots: { renamed: { [A]: B }, removed: [A], added: { [B]: 3 } } }])), [])
	})

	test('each sentence', () => {
		assert.ok(bad(chain([{ from: '1.0', to: '2.0.0' }])).some((f) => f.includes(`${ID}.upgrades[0].from is '1.0'; a version reads major.minor.patch — '1.0.0'.`)))
		assert.ok(bad(chain([{ from: '1.0.0', to: 'two' }])).some((f) => f.includes(`${ID}.upgrades[0].to is 'two'; a version reads major.minor.patch — '1.0.0'.`)))
		assert.ok(bad(chain([{ from: '2.0.0', to: '1.0.0' }])).some((f) => f.includes(`${ID}.upgrades[0] goes from 2.0.0 to 1.0.0; an upgrade moves forward.`)))
		assert.ok(bad(chain([{ from: '1.0.0', to: '1.1.0' }, { from: '1.2.0', to: '2.0.0' }])).some((f) => f.includes(`${ID}.upgrades[1] starts at 1.2.0, but the step before ends at 1.1.0; the chain must not skip.`)))
		assert.ok(bad(chain([{ from: '1.0.0', to: '1.5.0' }])).some((f) => f.includes(`${ID}.upgrades ends at 1.5.0, but the document is version 2.0.0; the last step ends at it.`)))
		assert.ok(bad(chain([{ from: '1.0.0', to: '2.0.0', slots: { removed: ['hp'] } }])).some((f) => f.includes(`${ID}.upgrades[0].slots names 'hp', which is not a slot id.`)))
	})
})

describe('the upgrade gate', () => {
	const prev = () => base()
	const slotOf = (doc: RulesetDocument) => [...rulesetAttributeSlots(doc as never).entries()][0]!
	const without = (doc: RulesetDocument) => ({ ...doc, version: '2.0.0', attributes: doc.attributes!.filter((a) => a.id !== slotOf(doc)[0]) }) as RulesetDocument

	test('an undeclared drop still fails', () => {
		assert.ok(rulesetDocumentUpgradeFindings(prev(), without(prev())).some((f) => f.startsWith('[dropped-stat]')))
	})

	test('a declared removal or rename passes', () => {
		const slot = slotOf(prev())[1]
		for (const slots of [{ removed: [slot] }, { renamed: { [slot]: B } }]) {
			const next = { ...without(prev()), upgrades: [{ from: '1.0.0', to: '2.0.0', slots }] } as RulesetDocument
			assert.ok(!rulesetDocumentUpgradeFindings(prev(), next).some((f) => f.startsWith('[dropped-stat]')), JSON.stringify(slots))
		}
	})
})

describe('upgrades and autoConvert are kept', () => {
	test('upgrades survive rulesetInSections', () => {
		const upgrades = [{ from: '1.0.0', to: '2.0.0', slots: { removed: [A] } }]
		assert.deepEqual((rulesetInSections({ name: { en: 'X' }, attributes: [], upgrades }) as { upgrades?: unknown }).upgrades, upgrades)
	})

	test('autoConvert survives the genre, and a non-boolean is refused', () => {
		const g = genre('test:genre/auto-convert', { name: { en: 'Auto' }, family: 'test', events: {}, rulesets: { only: ['acme.lab:ruleset/x@1'], autoConvert: true } } as never)
		assert.equal((g.rulesets as { autoConvert?: boolean }).autoConvert, true)
		const found = genreRulesetFindings('test:genre/x', { rulesets: { only: ['acme.lab:ruleset/x@1'], autoConvert: 'yes' } as never })
		assert.ok(found.some((f) => f.startsWith('[bad-rulesets]') && f.includes("test:genre/x.rulesets.autoConvert is 'yes'; say true or false.")))
	})
})
