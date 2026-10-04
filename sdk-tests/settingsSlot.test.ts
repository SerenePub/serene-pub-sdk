/**
 * R-9 (ruled 2026-09-15, built 2026-09-16): `settings` is a slot kind the
 * substrate declares — `enabled` on an optional definition, `review` on a
 * gated one, `mode` on a gather clause — projected onto the registry row and
 * left out of the content hash.
 *
 * What is pinned: the projection puts the slot on exactly the rows that carry
 * a switch; the defaults are the declaration's (an author's `reviewDefault:
 * 'on'` reaches the panel as `on`, which the hand-synthesised control got
 * wrong); an author may not claim the name; the hash does not move for a
 * slot nobody authored; and the clause's declaration comes from the SDK's
 * wording rather than a column.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	snapshotRegistry,
	settingsSlotFor,
	clauseSettingsSlotFor,
	authoredSlots,
	declarationHash,
	describeTaskDefinition,
	describeQueryDefinition,
	pin,
	S,
	spec,
	slot,
	getFacet,
	DESCRIPTOR_DISPLAY_KEYS,
	CLAUSE_MODE_DECL,
	ENABLED_FIELD,
	type SlotDecl,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { compile, run, validate, ok, $ref, type SpecDocument } from '@serene-pub/sdk'
import { bindings, findings, world } from './helpers.js'

describe('R-9 · the substrate declares the settings slot', () => {
	test('an optional definition carries `enabled`, defaulting on and quick', () => {
		const slotDecl = settingsSlotFor(C.worldLore.descriptor)
		assert.ok(slotDecl)
		assert.equal(slotDecl.kind, 'settings')
		assert.equal(slotDecl.facet, 'settings')
		assert.equal(slotDecl.schema?.enabled?.type, 'boolean')
		assert.equal(slotDecl.schema?.enabled?.default, true)
		assert.equal(slotDecl.schema?.enabled?.quick, true)
		assert.equal('review' in (slotDecl.schema ?? {}), false)
		// One shared declaration reaches every optional definition's slot, so
		// it is frozen — a projection that mutated it would change all of them.
		assert.ok(Object.isFrozen(ENABLED_FIELD))
		assert.equal(slotDecl.schema?.enabled, ENABLED_FIELD)
	})

	test("a gated definition carries `review` at the author's default, folded like the gate folds it", () => {
		// `attach-image` is the one shipped definition defaulting review ON —
		// the control the panel synthesised by hand said `off` for it.
		const on = settingsSlotFor(C.attachImage.descriptor)!
		assert.equal(on.schema?.review?.type, 'enum')
		assert.deepEqual(on.schema?.review?.of, ['off', 'on'])
		assert.equal(on.schema?.review?.default, 'on')
		// Its own heading, beside `enabled`'s — the field says so.
		assert.equal(on.schema?.review?.facet, 'review')
		assert.equal('enabled' in (on.schema ?? {}), false)

		const off = settingsSlotFor(C.createMessage.descriptor)!
		assert.equal(off.schema?.review?.default, 'off')
		// A retired spelling on a plugin's declaration reads as the gate reads it.
		assert.equal(settingsSlotFor({ effects: 'write', reviewDefault: 'sync' as never })!.schema?.review?.default, 'on')
		assert.equal(settingsSlotFor({ effects: 'write' })!.schema?.review?.default, 'off')
	})

	test('the switch reads by what it turns off: a source, or a step that calls a model', () => {
		const en = (t: unknown) => (t as { en?: string } | undefined)?.en
		// A query is a source the turn can do without.
		assert.equal(en(settingsSlotFor(C.worldLore.descriptor)!.schema?.enabled?.label), 'Use this source')
		// The planner and the state keeper are model calls, not sources: the
		// switch says the step does not run.
		const call = settingsSlotFor(C.generateJson.descriptor)!.schema?.enabled
		assert.ok(call)
		assert.equal(en(call.label), 'Run this step')
		assert.equal(call.default, true)
		assert.equal(call.quick, true)
		assert.doesNotMatch(String(en(call.description)), /fetch/)
		assert.equal(settingsSlotFor(C.embedText.descriptor)!.schema?.enabled, call)
		assert.ok(Object.isFrozen(call))
		// Only the words differ: the address and the value are the same switch.
		assert.equal(settingsSlotFor({ kind: 'task', optional: true })!.schema?.enabled, call)
		assert.equal(settingsSlotFor({ optional: true })!.schema?.enabled, call)
	})

	test('a definition that is both optional and gated carries both on one slot', () => {
		const both = settingsSlotFor(C.embedText.descriptor)!
		assert.deepEqual(Object.keys(both.schema ?? {}), ['enabled', 'review'])
	})

	test('a definition with no switch carries no slot at all', () => {
		assert.equal(settingsSlotFor(C.assemble.descriptor), undefined)
		assert.equal(settingsSlotFor({ effects: 'emit' }), undefined)
		assert.equal(settingsSlotFor({ effects: 'none', optional: false }), undefined)
	})

	test('the projection puts the slot on the row, after the authored ones', () => {
		const [lore] = snapshotRegistry([C.worldLore.descriptor], { release: 'test' })
		assert.equal(lore!.slots.settings?.kind, 'settings')
		assert.equal(Object.keys(lore!.slots).at(-1), 'settings')
		// And only there: a task with nothing to switch gets no slot.
		const [assemble] = snapshotRegistry([C.assemble.descriptor], { release: 'test' })
		assert.equal('settings' in assemble!.slots, false)
	})

	test('the projected slot is not the descriptor — editing the row cannot reach the declaration', () => {
		const [row] = snapshotRegistry([C.worldLore.descriptor], { release: 'test' })
		assert.equal('settings' in (C.worldLore.descriptor.slots ?? {}), false)
		assert.notEqual(row!.slots, C.worldLore.descriptor.slots)
	})

	test('`authoredSlots` strips exactly the substrate slot, so the hash does not move for it', () => {
		const [row] = snapshotRegistry([C.worldLore.descriptor], { release: 'test' })
		const authored = authoredSlots(row!.slots)
		assert.equal('settings' in authored, false)
		assert.deepEqual(Object.keys(authored), Object.keys(C.worldLore.descriptor.slots ?? {}))
		// The same declaration with and without the projected slot digests
		// the same — the fact core's `definitionContentHash` relies on.
		const withSlot = declarationHash(row!.slots, DESCRIPTOR_DISPLAY_KEYS)
		const without = declarationHash(authored, DESCRIPTOR_DISPLAY_KEYS)
		assert.notEqual(withSlot, without)
		assert.equal(
			without,
			declarationHash(C.worldLore.descriptor.slots ?? {}, DESCRIPTOR_DISPLAY_KEYS),
		)
		// Nothing to strip is a no-op, not an empty object.
		assert.deepEqual(authoredSlots(undefined), {})
		const plain = { params: { kind: 'parameters' } as SlotDecl }
		assert.deepEqual(authoredSlots(plain), plain)
	})

	test('an author may not claim the name', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'test:task/claims-settings@1',
					ports: { in: { main: S.text }, out: { main: S.text } },
					slots: { settings: { kind: 'parameters', schema: {} } },
				}),
			/reserved for the substrate/,
		)
	})

	test('nor the kind, under any name (U4 residual)', () => {
		assert.throws(
			() =>
				describeTaskDefinition({
					id: 'test:task/claims-settings-kind@1',
					ports: { in: { main: S.text }, out: { main: S.text } },
					slots: { switches: { kind: 'settings', schema: {} } },
				}),
			/slot 'switches' with kind 'settings'/,
		)
	})

	test('nor an out-port of the name, or a path under it (F39; U7 review, S2)', () => {
		// `<node>.settings[.…]` is what the F39 edge rule reads as the
		// substrate's address: a definition publishing a port there could
		// never be wired from it. Refused at the declaration, so the edge
		// rule can never false-positive on a declared port.
		for (const port of ['settings', 'settings.review'])
			assert.throws(
				() =>
					describeTaskDefinition({
						id: 'test:task/claims-settings-port@1',
						ports: { in: { main: S.text }, out: { main: S.text, [port]: S.text } },
					}),
				(e: Error) =>
					e.message.includes(`out-port named '${port}'`) &&
					/F39: settings never travel/.test(e.message) &&
					/name the port for what it publishes/.test(e.message),
				port,
			)
		// A port that merely starts with the word is a port ('settingsApplied').
		assert.doesNotThrow(() =>
			describeTaskDefinition({
				id: 'test:task/claims-settings-port-ok@1',
				ports: { in: { main: S.text }, out: { main: S.text, settingsApplied: S.text } },
			}),
		)
	})

	test('validate mirrors the refusal for a descriptor that reached the registry by another door', () => {
		// `register` never lets this through, so the slot is put on the
		// descriptor AFTER registration — the shape an adopted row or a
		// patched declaration would have.
		const patched = pin(
			describeTaskDefinition({
				id: 'test:task/patched-settings@1',
				ports: { in: { main: S.json }, out: { main: S.json } },
			}),
		)
		;(patched.descriptor as { slots?: Record<string, SlotDecl> }).slots = {
			settings: { kind: 'parameters', schema: {} },
			switches: { kind: 'settings', schema: {} },
		}
		const f = findings(
			spec('test:spec/patched-settings', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('t', ($: any) => patched.v1({ main: $.input.main })) as any,
		).filter((x) => x.law === 'R-9')
		assert.equal(f.length, 2)
		assert.ok(f.every((x) => x.severity === 'error' && x.nodeKey === 't'))
		assert.match(f[0]!.message, /authors slot 'settings'/)
		assert.match(f[1]!.message, /authors slot 'switches' with kind 'settings'/)
	})

	test('a preset may write `settings` where the substrate declares it, and nowhere else', () => {
		const optionalQuery = pin(
			describeQueryDefinition({
				id: 'test:query/switchable@1',
				optional: true,
				ports: { out: { main: S.json } },
			}),
		)
		const plainTask = pin(
			describeTaskDefinition({
				id: 'test:task/unswitchable@1',
				ports: { in: { main: S.json }, out: { main: S.json } },
			}),
		)
		const build = (nodeKey: string) =>
			spec('test:spec/settings-preset', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('enrich', () => optionalQuery.v1())
				.task('after', ($: any) => plainTask.v1({ main: $.enrich.main }))
				.preset('quiet', { label: 'Quiet' }, (p: any) =>
					p.settings(nodeKey, { enabled: false }),
				)
		const onOptional = findings(build('enrich') as any).filter(
			(f) => f.law === '12 §3a' && f.severity === 'error',
		)
		assert.deepEqual(onOptional, [])
		const onPlain = findings(build('after') as any).filter(
			(f) => f.law === '12 §3a' && f.severity === 'error',
		)
		assert.equal(onPlain.length, 1)
		assert.match(onPlain[0]!.message, /sets slot 'settings' on 'after'/)
	})

	test('the facet is declared, not invented by the screen', () => {
		assert.equal((getFacet('settings')?.i18n as { en: string }).en, 'Settings')
		assert.equal((getFacet('review')?.i18n as { en: string }).en, 'Review')
	})
})

describe('R-9 · a gather clause declares its mode the same way', () => {
	test("only a gather carries one, at the author's declared mode", () => {
		const parallel = clauseSettingsSlotFor({ kind: 'gather', mode: 'parallel' })!
		assert.equal(parallel.kind, 'settings')
		assert.equal(parallel.facet, 'settings')
		assert.equal(parallel.schema?.mode?.type, 'enum')
		assert.deepEqual(parallel.schema?.mode?.of, CLAUSE_MODE_DECL.of)
		assert.equal(parallel.schema?.mode?.default, 'parallel')
		assert.deepEqual(parallel.schema?.mode?.label, CLAUSE_MODE_DECL.i18n)

		assert.equal(clauseSettingsSlotFor({ kind: 'gather', mode: 'sequential' })!.schema?.mode?.default, 'sequential')
		// An unknown or absent mode is the author's default, parallel — as
		// `resolveClauseMode` reads it.
		assert.equal(clauseSettingsSlotFor({ kind: 'gather' })!.schema?.mode?.default, 'parallel')
		assert.equal(clauseSettingsSlotFor({ kind: 'gather', mode: null })!.schema?.mode?.default, 'parallel')

		for (const kind of ['each', 'loop', 'junction'])
			assert.equal(clauseSettingsSlotFor({ kind, mode: 'parallel' }), undefined, kind)
	})

	test('the executor still reads the same address the declaration names', async () => {
		// The addresses are unchanged by declaring them: `<clauseId>.settings.mode`
		// is what `runClause` resolves, and `<nodeKey>.settings.enabled` what
		// the optional skip reads. Pinned through the slot's own path so the
		// two cannot drift apart silently.
		const { run, ok } = await import('@serene-pub/sdk')
		const { world } = await import('./helpers.js')
		const switchable = pin(
			describeQueryDefinition({
				id: 'test:query/switchable-address@1',
				optional: true,
				ports: { out: { main: S.json } },
			}),
		)
		const doc = (await import('@serene-pub/sdk')).compile(
			spec('test:spec/settings-address', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.query('enrich', () => switchable.v1())
				.build(),
		)
		const decl = settingsSlotFor(switchable.descriptor)!
		const path = Object.keys(decl.schema!)[0]!
		let ran = 0
		const receipt: any = await run(doc, {
			world: {
				...world,
				overrides: [
					{ nodeKey: 'enrich', slot: 'settings', path, value: false, scopeKind: 'session' as const },
				],
			},
			input: { text: 'hi' },
			seed: 'settings-address',
			triggerSource: 'ui',
			bindings: {
				'core:inlet/user-message@1': async (i: any) => ok(i),
				[switchable.id]: async () => {
					ran++
					return ok({ main: {} })
				},
			},
		})
		assert.equal(ran, 0)
		const node = receipt.nodes.find((n: any) => n.nodeKey === 'enrich')
		assert.ok(node.notes.includes('skipped: switched off'))
	})

	test('an outlet gated at the declared address parks the run', async () => {
		const { run, ok, halt } = await import('@serene-pub/sdk')
		const { world } = await import('./helpers.js')
		const doc = (await import('@serene-pub/sdk')).compile(
			spec('test:spec/settings-review-address', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.oracle('generate', C.generateText.v1({ connection: slot.connection() }))
				.outlet('save', ($: any) => C.createMessage.v1({ text: $.generate.text }))
				.build(),
		)
		const decl = settingsSlotFor(C.createMessage.descriptor)!
		assert.ok('review' in decl.schema!)
		const receipt: any = await run(doc, {
			world: {
				...world,
				overrides: [
					{ nodeKey: 'save', slot: 'settings', path: 'review', value: 'on', scopeKind: 'session' as const },
				],
			},
			input: { text: 'hi' },
			seed: 'settings-review-address',
			triggerSource: 'ui',
			reviewer: async () => ({ action: 'reject', by: 'test', at: 1 }),
			bindings: {
				'core:inlet/user-message@1': async (i: any) => ok(i),
				'core:oracle/generate-text@1': async () => ok({ text: 'draft' }),
				'core:outlet/create-message@1': async () => halt('should not run'),
			},
		})
		assert.equal(receipt.outcome, 'halt')
		assert.equal(receipt.nodes.find((n: any) => n.nodeKey === 'save')?.reason, 'rejected at review')
	})
})

describe('F39 · settings never travel; only data does (12 §2 P3, plans/30 U7)', () => {
	/** inlet → a gated write (so `save` carries `settings`) → a task that tries to read it. */
	const probing = (main: unknown): SpecDocument =>
		compile(
			spec('demo:settings-travel', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
				.task('probe', () => C.gate.v1({ main: main as any }))
				.build(),
		)

	/** The other door: a hand-written config reference naming the substrate's slot. */
	const settingsRef = (ofNode: string) => ({ __ref: 'slot', slot: 'settings', ofNode }) as const

	/** A setting planted at `save`'s address — what must never arrive anywhere else. */
	const planted = {
		...world,
		overrides: [
			...world.overrides,
			{ scopeKind: 'config' as const, nodeKey: 'save', slot: 'settings', path: 'review', value: 'off' },
			{ scopeKind: 'config' as const, nodeKey: 'save', slot: 'settings', path: 'probe', value: 'F39-sentinel' },
		],
	}

	test('a data edge from a settings address is refused as the law, with the fix', () => {
		for (const port of ['settings', 'settings.review']) {
			const errs = validate(probing($ref('save', port))).filter((f) => f.law === 'F39')
			assert.equal(errs.length, 1, port)
			assert.match(errs[0]!.message, /a setting, not a port/)
			assert.match(errs[0]!.fix, /slot\.params\(\{ node: 'save' \}\)/)
		}
	})

	test('a config reference naming another node\'s settings is refused the same way', () => {
		const errs = validate(probing(settingsRef('save'))).filter((f) => f.law === 'F39')
		assert.equal(errs.length, 1)
		assert.match(errs[0]!.message, /'probe\.main' references 'save\.settings'/)
		assert.match(errs[0]!.fix, /read a port 'save' publishes/)
	})

	test('a hand-written reference naming no slot at all is a finding, not a crash (U7 delta review, 3)', () => {
		// `{ __ref: 'slot' }` with no `slot`: before the guard, `validate()`
		// threw a TypeError out of the F39 pass, so a publish crashed instead
		// of refusing. A shape fault, said as one, with the fix.
		for (const slot of [undefined, '', 7]) {
			const doc = probing({ __ref: 'slot', ...(slot === undefined ? {} : { slot }) })
			let findings: ReturnType<typeof validate> = []
			assert.doesNotThrow(() => {
				findings = validate(doc)
			}, `slot: ${JSON.stringify(slot)}`)
			const shape = findings.filter((f) => f.severity === 'error' && f.law === '12 §2')
			assert.equal(shape.length, 1, `slot: ${JSON.stringify(slot)}`)
			assert.match(shape[0]!.message, /'probe\.main' is a slot reference that names no slot/)
			assert.match(shape[0]!.fix, /slot\.params\(\)/)
			assert.equal(findings.filter((f) => f.law === 'F39').length, 0, 'not mistaken for the settings address')
		}
	})

	test('an unvalidated document that tries the reference gets nothing, and the row says why', async () => {
		// Before the guard, `resolveSlot`'s generic fallthrough returned
		// `config['save'].settings` — the other node's switches, sentinel and
		// all — to the probe's binding.
		let received: unknown = 'never called'
		const r = await run(probing(settingsRef('save')), {
			input: {},
			world: planted,
			bindings: bindings({
				'test:task/gate@1': async (i: any) => {
					received = i.main
					return ok({ main: 'probed' })
				},
			}),
		})
		assert.equal(r.outcome, 'ok', r.haltReason)
		assert.deepEqual(received, {}, 'the reference resolved to nothing')
		assert.equal(JSON.stringify(r).includes('F39-sentinel'), false, 'the planted setting reached no row of the receipt')
		const probe = r.nodes.find((n) => n.nodeKey === 'probe')!
		assert.ok(
			probe.notes?.some((n) => /^F39: 'probe\.main' references 'save\.settings'/.test(n)),
			`the row says why: ${JSON.stringify(probe.notes)}`,
		)
		assert.ok(probe.notes?.some((n) => /slot\.params\(\{ node: 'save' \}\)/.test(n)), 'and what to do instead')
	})

	test('a data edge from the address carries nothing either — settings are not on any port', async () => {
		let received: unknown = 'never called'
		const r = await run(probing($ref('save', 'settings')), {
			input: {},
			world: planted,
			bindings: bindings({
				'test:task/gate@1': async (i: any) => {
					received = i.main
					return ok({ main: 'probed' })
				},
			}),
		})
		assert.equal(r.outcome, 'ok', r.haltReason)
		assert.equal(received, undefined)
		assert.equal(JSON.stringify(r).includes('F39-sentinel'), false)
	})
})
