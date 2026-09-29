/**
 * One annex declaration per owner (owner ruling 2026-09-26): every key an
 * owner keeps in the session annex is declared once — shape, who may see it,
 * who (if anyone) may set it — and every write is held to it. Here, the SDK's
 * half: the declaration and its registry, the schema a template reads, the
 * one write judge, `validate()`, the package pass, and core's own keys.
 * The host's half is `src/lib/server/sessions/annexDeclaration.int.test.ts`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
	annexDeclarationOf,
	annexField,
	annexSchemaOf,
	annexVarFieldOf,
	annexWriteKeysOf,
	annexWriteRefusals,
	compile,
	declareAnnex,
	defineExtension,
	isSettableAnnexField,
	spec,
	use,
	validate,
	_withdrawAnnex,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import { CORE_ANNEX_FIELDS, CORE_SPECS } from '@serene-pub/core-catalog'

const FIELDS = [
	annexField({ key: 'clock', shape: { type: 'integer', min: 0 }, see: ['person'] }),
	annexField({ key: 'culprit', shape: { type: 'string' } }),
	annexField({ key: 'last-roll', shape: { type: 'integer' }, see: ['participant'], act: ['participant'] }),
	annexField({ key: 'map', shape: { type: 'string' }, genre: 'core:genre/adventure' }),
]

describe('the declaration', () => {
	test('act present is settable; absent is pipeline-written only', () => {
		assert.equal(isSettableAnnexField(FIELDS[2]!), true)
		assert.equal(isSettableAnnexField(FIELDS[0]!), false)
	})

	test('registered per owner; the schema and the template variable come from it', () => {
		declareAnnex('acme.rp', FIELDS)
		try {
			assert.equal(annexDeclarationOf('acme.rp')?.length, 4)
			assert.equal(annexSchemaOf('nobody.here'), undefined)
			assert.deepEqual(Object.keys(annexSchemaOf('acme.rp', 'core:genre/chat')!), ['clock', 'culprit', 'last-roll'])
			assert.deepEqual(Object.keys(annexSchemaOf('acme.rp')!), ['clock', 'culprit', 'last-roll', 'map'])
			assert.deepEqual(annexSchemaOf('acme.rp')!.clock, { type: 'integer', min: 0 })
			const v = annexVarFieldOf('acme.rp', 'core:genre/chat')!
			assert.equal(v.type, 'object')
			assert.deepEqual(v.fields!.clock, { type: 'number', optional: true })
			assert.deepEqual(v.fields!.culprit, { type: 'string', optional: true })
			// A stored entry an older SDK built is normalised; a bad one throws.
			assert.throws(() => declareAnnex('acme.bad', [{ key: 'X', shape: { type: 'string' } }]), /lowercase kebab/)
		} finally {
			_withdrawAnnex('acme.rp')
		}
		assert.equal(annexDeclarationOf('acme.rp'), undefined)
	})
})

describe('the write judge', () => {
	test('an undeclared key is refused by name', () => {
		const r = annexWriteRefusals(FIELDS, { owner: 'acme.rp', keys: ['clock', 'secret-plan'] })
		assert.equal(r.length, 1)
		assert.match(r[0]!, /'secret-plan' is not a key 'acme.rp' declares in its annex/)
		// Another genre's field is not this session's.
		assert.match(
			annexWriteRefusals(FIELDS, { owner: 'acme.rp', keys: ['map'], genre: 'core:genre/chat' })[0]!,
			/declared for 'core:genre\/adventure'/,
		)
		// An owner that declares nothing: every key is refused.
		assert.equal(annexWriteRefusals(undefined, { owner: 'x', keys: ['a'] }).length, 1)
	})

	test('a value is held to its declared shape', () => {
		assert.deepEqual(annexWriteRefusals(FIELDS, { owner: 'acme.rp', keys: ['clock'], values: { clock: 3 } }), [])
		assert.match(
			annexWriteRefusals(FIELDS, { owner: 'acme.rp', keys: ['clock'], values: { clock: 'three' } })[0]!,
			/should be a number/,
		)
	})

	test("the keys a step writes are read off its config; a wired value is known only at the write", () => {
		assert.deepEqual(annexWriteKeysOf({ value: { a: 1, b: 2 } }), ['a', 'b'])
		assert.deepEqual(annexWriteKeysOf({}, ['value.a']), ['a'])
		assert.equal(annexWriteKeysOf({}, ['value']), null)
		assert.deepEqual(annexWriteKeysOf({}), [])
	})
})

describe('validate() and the package pass', () => {
	const base = (id = 'acme.rp:spec/keep') =>
		spec(id, { version: '1.0.0' }).inlet('input', C.userMessage.v1(), {
			genre: use('core:genre/chat'),
			event: 'core:event/message-respond@1',
		})

	test('a step naming an undeclared key is refused by name; a declared one passes', () => {
		declareAnnex('acme.rp', FIELDS)
		try {
			const bad = compile(base().outlet('keep', () => C.setSessionAnnex.v1({ value: { plot: 'x' } as never })).build())
			const found = validate(bad).filter((f) => f.law === 'R57')
			assert.equal(found.length, 1)
			assert.match(found[0]!.message, /'plot' is not a key 'acme.rp' declares/)
			const good = compile(base().outlet('keep', () => C.setSessionAnnex.v1({ value: { clock: 1 } as never })).build())
			assert.deepEqual(validate(good).filter((f) => f.law === 'R57'), [])
			// A literal value its shape refuses.
			const wrong = compile(base().outlet('keep', () => C.setSessionAnnex.v1({ value: { clock: -1 } as never })).build())
			assert.match(validate(wrong).find((f) => f.law === 'R57')!.message, /below the minimum 0/)
			// A wired value: known only at the write, which the host judges.
			const wired = compile(
				base().outlet('keep', ($) => C.setSessionAnnex.v1({ value: $.input.payload as never })).build(),
			)
			assert.deepEqual(validate(wired).filter((f) => f.law === 'R57'), [])
		} finally {
			_withdrawAnnex('acme.rp')
		}
	})

	test('an owner not known here is left to the package pass and the host', () => {
		const doc = compile(base('far.away:spec/keep').outlet('keep', () => C.setSessionAnnex.v1({ value: { plot: 1 } as never })).build())
		assert.deepEqual(validate(doc).filter((f) => f.law === 'R57'), [])
	})

	test("defineExtension refuses a pipeline writing a key its annexFields do not declare", () => {
		const pipe = base('acme.pass:spec/keep')
			.outlet('keep', () => C.setSessionAnnex.v1({ value: { clock: 2, plot: 'x' } as never }))
			.build()
		assert.throws(
			() => defineExtension({ slug: 'acme.pass', name: 'Pass', version: '1.0.0', pipelines: [pipe] }),
			/'clock' is not a key 'acme.pass' declares[\s\S]*'plot' is not a key/,
		)
		const ok = defineExtension({
			slug: 'acme.pass',
			name: 'Pass',
			version: '1.0.0',
			pipelines: [pipe],
			annexFields: [annexField({ key: 'clock', shape: { type: 'integer' } }), annexField({ key: 'plot', shape: { type: 'string' } })],
		})
		assert.equal(ok.annexFields?.length, 2)
	})
})

describe("core's annex declaration", () => {
	test('is registered under core, and covers every core set-session-annex writer', () => {
		assert.deepEqual(annexDeclarationOf('core'), CORE_ANNEX_FIELDS)
		const declared = new Set(CORE_ANNEX_FIELDS.map((f) => f.key))
		const writers: string[] = []
		for (const entry of CORE_SPECS) {
			const doc = entry.build()
			for (const n of doc.nodes as Array<{ key: string; definitionId: string; config: Record<string, unknown> }>) {
				if (n.definitionId !== 'core:outlet/set-session-annex') continue
				const into = doc.edges.filter((e: { to: string }) => e.to === n.key).map((e: { toPort: string }) => e.toPort)
				const keys = annexWriteKeysOf(n.config, into)
				// A core writer names its keys, so this test can hold them to the list.
				assert.ok(keys, `${doc.id} at '${n.key}' wires its value whole — name the keys it writes`)
				for (const k of keys!) {
					writers.push(`${doc.id}#${n.key}:${k}`)
					assert.ok(declared.has(k), `${doc.id} at '${n.key}' writes '${k}', which CORE_ANNEX_FIELDS does not declare`)
				}
			}
		}
		// One (lair re-plan R13, 2026-09-28): the Lair Castellan rewrites its
		// scratchpad after a Sanctum reply. Every other core pipeline keeps its
		// state in core's own columns.
		assert.deepEqual(writers, [
			'core:spec/lair-respond#via.turn.channel.sanctum.padKeep.kept.write:castellan-scratchpad',
		])
	})

	test("declares retake's \"don't ask again\" — the person's, settable, in every genre (lair pass R2)", () => {
		assert.deepEqual(
			CORE_ANNEX_FIELDS.map((f) => f.key),
			['retake-quietly', 'castellan-scratchpad'],
		)
		const [f] = CORE_ANNEX_FIELDS
		assert.deepEqual(f!.shape, { type: 'boolean', default: false })
		assert.deepEqual(f!.see, ['owner'])
		assert.deepEqual(f!.act, ['owner'])
		// Retake is core: no genre scopes the field.
		assert.equal(f!.genre, undefined)
		assert.equal(typeof (f!.label as { en?: string } | undefined)?.en, 'string')
	})

	test("declares the Castellan's scratchpad — the Castellan's alone to see, the owner's to set, the Lair's only (lair re-plan R13)", () => {
		const f = CORE_ANNEX_FIELDS.find((x) => x.key === 'castellan-scratchpad')!
		assert.deepEqual(f.shape, { type: 'text', default: '' })
		// Hidden from every person's view; only the Castellan's own AI view holds it.
		assert.deepEqual(f.see, ['envoy:castellan'])
		// Editable by the session owner, through its ready-made action.
		assert.deepEqual(f.act, ['owner'])
		assert.equal(f.genre, 'core:genre/lair')
		assert.equal((f.label as { en?: string } | undefined)?.en, "Castellan's scratchpad")
	})
})
