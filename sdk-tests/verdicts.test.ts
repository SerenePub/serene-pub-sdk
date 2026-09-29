/**
 * One verdict per law (01 §13; plans/31 V4).
 *
 * A rule has exactly one verdict function; every door calls it and quotes
 * its sentence. This file pins the registry — what `defineVerdict` refuses,
 * what a redeclaration does, what `verdicts()` lists — and the seven core
 * verdicts' own coherence: each declares at least one door, and the failing
 * input it hands the kit for every door does fail. C27 (`conformance.test.ts`)
 * is where the doors are held to the sentences.
 */

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	DOORS,
	audienceVerdict,
	defineVerdict,
	effectsLineVerdict,
	enablementVerdict,
	i18nText,
	i18nVerdict,
	provisionalVerdict,
	refusalText,
	settingsTravelVerdict,
	stalenessVerdict,
	verdictById,
	verdicts,
	type VerdictDecl,
} from '@serene-pub/sdk'

const CORE = [
	'core:verdict/i18n',
	'core:verdict/enablement',
	'core:verdict/audience',
	'core:verdict/settings-travel',
	'core:verdict/provisional',
	'core:verdict/effects-line',
	'core:verdict/staleness',
]

describe('01 §13 · the registry', () => {
	test('the seven core verdicts are registered, each with a law and at least one door', () => {
		const ids = verdicts().map((v) => v.id)
		for (const id of CORE) assert.ok(ids.includes(id), `${id} is not registered`)
		for (const v of verdicts()) {
			assert.ok(v.law.trim().length > 0, `${v.id} names no law`)
			assert.ok(v.doors.length >= 1, `${v.id} declares no door`)
			assert.equal(verdictById(v.id), v)
		}
		assert.equal(verdictById('core:verdict/no-such'), undefined)
	})

	test("every declared door's failing input fails, with a sentence in en", () => {
		for (const v of verdicts())
			for (const door of v.doors) {
				const heard = v.judge(v.failing(door))
				assert.equal(heard.ok, false, `${v.id}: failing('${door}') does not fail`)
				if (heard.ok) continue
				assert.ok((i18nText(heard.sentence, 'en') ?? '').length > 0, `${v.id} at '${door}': no sentence`)
			}
	})

	test('an id outside the grammar, no law, no door, an unknown door, no judge — each refused with the fix', () => {
		const sound: VerdictDecl<number> = {
			id: 'acme:verdict/even',
			law: 'ACME-1',
			doors: ['validate'],
			judge: (n) => (n % 2 === 0 ? { ok: true } : { ok: false, sentence: `${n} is odd` }),
			failing: () => 3,
		}
		assert.throws(() => defineVerdict({ ...sound, id: 'acme:verdict/Even' }), /is not a verdict id/)
		assert.throws(() => defineVerdict({ ...sound, id: 'acme:rule/even' }), /'<owner>:verdict\/<slug>'/)
		assert.throws(() => defineVerdict({ ...sound, law: ' ' }), /names no law/)
		assert.throws(() => defineVerdict({ ...sound, doors: [] }), /declares no door/)
		assert.throws(
			() => defineVerdict({ ...sound, doors: ['validate', 'render' as never] }),
			/declares the door 'render', which is not one — a door is one of construction, registry/,
		)
		assert.throws(() => defineVerdict({ ...sound, judge: undefined as never }), /declares no judge/)
		assert.equal(verdictById('acme:verdict/even'), undefined, 'nothing refused was registered')
	})

	test('an identical redeclaration is a no-op; a different one under the id throws naming both hashes', () => {
		const decl = (): VerdictDecl<number> => ({
			id: 'acme:verdict/positive',
			law: 'ACME-2',
			doors: ['validate', 'run'],
			judge: (n) => (n > 0 ? { ok: true } : { ok: false, sentence: `${n} is not positive`, fix: 'pass a positive number' }),
			failing: () => -1,
		})
		const first = defineVerdict(decl())
		assert.ok(Object.isFrozen(first))
		assert.ok(Object.isFrozen(first.doors))
		const again = defineVerdict(decl())
		assert.deepEqual(again.doors, ['validate', 'run'])
		assert.equal(verdicts().filter((v) => v.id === 'acme:verdict/positive').length, 1, 'registered once')
		assert.throws(
			() => defineVerdict({ ...decl(), doors: ['validate'] }),
			/duplicate verdict id: acme:verdict\/positive \(registered [0-9a-f]+, redeclared [0-9a-f]+\)/,
		)
		assert.equal(refusalText(first.judge(-4) as never), '-4 is not positive — pass a positive number')
		assert.equal(refusalText({ ok: false, sentence: 'no' }), 'no')
	})

	test('the door list is closed and documented in one place', () => {
		assert.deepEqual(
			[...DOORS],
			['construction', 'registry', 'validate', 'publish', 'run', 'fire', 'write', 'list'],
		)
	})
})

describe('01 §13 · the seven, judged', () => {
	test('i18n wraps the one check and names the field', () => {
		assert.deepEqual(i18nVerdict.judge({ value: 'Title', where: 'x' }), { ok: true })
		assert.deepEqual(i18nVerdict.judge({ value: undefined, where: 'x' }), { ok: true })
		const heard = i18nVerdict.judge({ value: { fr: 'Titre' }, where: 'presets[lore].label' })
		assert.equal(heard.ok, false)
		assert.match(i18nText((heard as { sentence: string }).sentence)!, /^presets\[lore\]\.label: a locale map with a required 'en' \(R-20\)/)
		const absent = i18nVerdict.judge({ value: undefined, where: 'x', required: true })
		assert.match((absent as { sentence: string }).sentence, /^x is required/)
	})

	test("enablement's sentence is the author's reason on the first failing predicate", () => {
		const preds = [
			{ on: 'state.world.location', truthy: true, reason: { en: 'Set a location first', fr: 'Choisissez un lieu' } },
			{ on: 'session.generating', equals: false, reason: 'wait for the reply to finish' },
		]
		assert.deepEqual(enablementVerdict.judge({ preds, doc: { state: { world: { location: 'inn' } }, session: { generating: false } } }), { ok: true })
		const heard = enablementVerdict.judge({ preds, doc: { session: { generating: true } } })
		assert.deepEqual(heard, { ok: false, sentence: { en: 'Set a location first', fr: 'Choisissez un lieu' } })
		assert.deepEqual(enablementVerdict.judge({ preds: undefined, doc: {} }), { ok: true })
	})

	test('audience holds for a portrayal naming the viewer, defers item at a listing, reads it at a fire', () => {
		const portrayals = { owner: { by: 'person', userId: '7' }, participant: { by: 'person', userId: '7' } } as const
		const mine = { name: 'bow', refs: ['owner'] as const, portrayals, viewer: { userId: 7 } }
		assert.deepEqual(audienceVerdict.judge(mine), { ok: true })
		const theirs = audienceVerdict.judge({ ...mine, viewer: { userId: 8 } })
		assert.deepEqual(theirs, { ok: false, sentence: "'bow' is not yours to use here — its audience is owner." })
		// `item` ahead of a message holds (the listing reports itemGated); at a fire it is the item rule's answer.
		assert.equal(audienceVerdict.judge({ name: 'edit', refs: ['item'], portrayals: {}, viewer: { userId: 8 } }).ok, true)
		assert.equal(audienceVerdict.judge({ name: 'edit', refs: ['item'], portrayals: {}, viewer: { userId: 8 }, item: true }).ok, true)
		const notMine = audienceVerdict.judge({ name: 'edit', refs: ['owner', 'item'], portrayals: {}, viewer: { userId: 8 }, item: false })
		assert.deepEqual(notMine, { ok: false, sentence: "'edit' is not yours to use here — its audience is owner, item." })
		assert.match((audienceVerdict.judge({ name: 'x', refs: [], portrayals: {}, viewer: { userId: 1 } }) as { sentence: string }).sentence, /its audience is nobody\.$/)
	})

	test('settings-travel: an edge, a reference and a port, each refused with the fix; anything else passes', () => {
		const edge = settingsTravelVerdict.judge({ kind: 'edge', from: 'save', fromPort: 'settings.review', to: 'probe', toPort: 'main' })
		assert.equal(edge.ok, false)
		assert.match(refusalText(edge as never), /^'probe\.main' reads 'save\.settings\.review' — a setting, not a port; settings never travel, only data does — wire a port 'save' publishes/)
		assert.deepEqual(settingsTravelVerdict.judge({ kind: 'edge', from: 'save', fromPort: 'settingsApplied', to: 'probe', toPort: 'main' }), { ok: true })
		const ref = settingsTravelVerdict.judge({ kind: 'reference', node: 'probe', key: 'main', slot: 'settings', target: 'save' })
		assert.match(refusalText(ref as never), /^'probe\.main' references 'save\.settings' — .*— read a port 'save' publishes/)
		assert.deepEqual(settingsTravelVerdict.judge({ kind: 'reference', node: 'probe', key: 'main', slot: 'params', target: 'save' }), { ok: true })
		assert.deepEqual(settingsTravelVerdict.judge({ kind: 'reference', node: 'probe', key: 'main', slot: undefined, target: 'save' }), { ok: true })
		const port = settingsTravelVerdict.judge({ kind: 'port', definitionId: 'acme:task/x@1', port: 'settings' })
		assert.match(refusalText(port as never), /^acme:task\/x@1 declares an out-port named 'settings'\..*\(F39: settings never travel\).*— name the port for what it publishes/)
		assert.deepEqual(settingsTravelVerdict.judge({ kind: 'port', definitionId: 'acme:task/x@1', port: 'settingsApplied' }), { ok: true })
	})

	test('provisional: a placement of a flagged definition, and a publication with no handler and no flag', () => {
		const placed = provisionalVerdict.judge({ kind: 'placement', nodeKey: 'pending', definitionId: 'acme:oracle/x', definitionVersion: 1, provisional: true })
		assert.deepEqual(placed, {
			ok: false,
			sentence: "'pending' places acme:oracle/x@1, which is provisional — declared, not bound: no handler runs it in this release (R-2)",
			fix: 'bind it or remove the node',
		})
		assert.deepEqual(provisionalVerdict.judge({ kind: 'placement', nodeKey: 'pending', definitionId: 'acme:oracle/x', definitionVersion: 1, provisional: false }), { ok: true })
		const published = provisionalVerdict.judge({ kind: 'publication', definitionId: 'core:task/stray@1', provisional: false, bound: false })
		assert.match(refusalText(published as never), /^core:task\/stray@1 is published with no handler behind it and no plan claiming it — declared, not bound \(R-2\) — bind it in bindings\.ts, mark it `provisional: true`/)
		assert.deepEqual(provisionalVerdict.judge({ kind: 'publication', definitionId: 'core:task/x@1', provisional: true, bound: false }), { ok: true })
		assert.deepEqual(provisionalVerdict.judge({ kind: 'publication', definitionId: 'core:task/x@1', provisional: false, bound: true }), { ok: true })
	})

	test('the effects line: five shapes of crossing, one verdict, the owner-addressed exception both ways', () => {
		const venue = effectsLineVerdict.judge({ kind: 'venue', where: 'contributes.actions[grant]', effects: 'world', venue: 'widget' })
		assert.match((venue as { sentence: string }).sentence, /^contributes\.actions\[grant\]: a 'world' action may not appear in the 'widget' venue/)
		assert.match((venue as { fix: string }).fix, /effects: 'fiction'/)
		assert.deepEqual(effectsLineVerdict.judge({ kind: 'venue', where: 'w', effects: 'world', venue: 'composer' }), { ok: true })
		// A message's own ⋮ is the owner's side since 2026-09-28 (lair re-plan R11).
		assert.deepEqual(effectsLineVerdict.judge({ kind: 'venue', where: 'w', effects: 'world', venue: 'message' }), { ok: true })
		assert.deepEqual(effectsLineVerdict.judge({ kind: 'venue', where: 'w', effects: 'fiction', venue: 'message' }), { ok: true })
		const actor = effectsLineVerdict.judge({ kind: 'actor', where: 'w', effects: 'world', ref: 'participant' })
		assert.match((actor as { sentence: string }).sentence, /^w: a 'world' action's audience\.act names 'participant'/)
		assert.deepEqual(effectsLineVerdict.judge({ kind: 'actor', where: 'w', effects: 'world', ref: 'admin' }), { ok: true })

		const spec = {
			id: 'acme:spec/keys',
			contributes: {
				actions: [{ key: 'grant', genre: 'core:genre/chat', venue: { kind: 'composer' }, label: 'Grant', effects: 'world' }],
			},
		}
		const choices = (addressee?: string) =>
			[{ kind: 'choices', question: 'Keys?', ...(addressee ? { addressee } : {}), actions: [{ fn: 'grant', label: 'Yes', choice: 'yes' }] }] as never
		const block = effectsLineVerdict.judge({ kind: 'block', blocks: choices(), spec })
		assert.match((block as { sentence: string }).sentence, /^the blocks name 'grant', whose action changes something outside the story \(effects: 'world'\)/)
		assert.deepEqual(effectsLineVerdict.judge({ kind: 'block', blocks: choices('owner'), spec }), { ok: true })
		assert.equal(effectsLineVerdict.judge({ kind: 'block', blocks: choices('character:3'), spec }).ok, false)

		assert.deepEqual(effectsLineVerdict.judge({ kind: 'identity', identity: 'acme:spec/keys#grant', effects: 'world', addressees: ['owner', 'owner'] }), { ok: true })
		const identity = effectsLineVerdict.judge({ kind: 'identity', identity: 'acme:spec/keys#grant', effects: 'world', addressees: ['owner', undefined] })
		assert.match((identity as { sentence: string }).sentence, /^the blocks name 'acme:spec\/keys#grant', whose action changes something outside the story/)
		assert.deepEqual(effectsLineVerdict.judge({ kind: 'identity', identity: 'x', effects: 'fiction', addressees: [undefined] }), { ok: true })
		assert.equal(effectsLineVerdict.judge({ kind: 'identity', identity: 'x', effects: 'world', addressees: [] }).ok, false, 'put to nobody known: not the owner\'s')

		const press = (over: Partial<{ as: boolean; onBlock: boolean; blockAddressee: unknown; effects: string }>) =>
			effectsLineVerdict.judge({ kind: 'press', name: 'Grant', effects: 'world', as: false, onBlock: false, blockAddressee: undefined, ...over })
		assert.deepEqual(press({}), { ok: true }, "the composer's own button")
		assert.deepEqual(press({ onBlock: true, blockAddressee: 'owner' }), { ok: true }, 'a question put to the owner')
		assert.match((press({ onBlock: true, blockAddressee: 'character:3' }) as { sentence: string }).sentence, /^'Grant' changes something outside the story, so it is the owner's to invoke from the composer, or from a question put to them — never a question put to anybody else\.$/)
		assert.equal(press({ onBlock: true }).ok, false, 'a question put to nobody in particular')
		assert.equal(press({ as: true, onBlock: true, blockAddressee: 'owner' }).ok, false, 'answered as a participant: no exception')
		assert.deepEqual(press({ effects: 'fiction', as: true, onBlock: true }), { ok: true })
	})

	test('staleness: unanswered, a head, and the channel past it; the one sentence', () => {
		assert.deepEqual(stalenessVerdict.judge({ block: { head: 3 }, headNow: 4 }), {
			ok: false,
			sentence: 'That question was overtaken — the conversation moved on before it was answered.',
		})
		assert.deepEqual(stalenessVerdict.judge({ block: { head: 4 }, headNow: 4 }), { ok: true })
		assert.deepEqual(stalenessVerdict.judge({ block: { head: 3, answered: { by: 'owner', at: 't' } }, headNow: 4 }), { ok: true })
		assert.deepEqual(stalenessVerdict.judge({ block: {}, headNow: 4 }), { ok: true })
		assert.deepEqual(stalenessVerdict.judge({ block: { head: 3 }, headNow: null }), { ok: true })
	})
})
