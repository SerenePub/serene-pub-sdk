/**
 * Use cases 77–81 — the plugin settings schema.
 *
 * 12 §6 promises "the same schema strategy as node config and review steps — one renderer,
 * three uses." These tests hold that promise to four: the form, validation, the manifest
 * entry, and typed access from the author's own code.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	defineSettings,
	secret,
	isSecret,
	checkSchema,
	checkValues,
	reconcile,
	configState,
	isVisible,
	SettingsError,
	jsonFieldFindings,
	jsonFieldByteCap,
	undescribedSettingParts,
	settingsSchemaFindings,
	JSON_FIELD_MAX_BYTES,
	JSON_FIELD_MAX_BYTES_CEILING,
	type FieldDecl,
	type SettingsValues,
} from '@serene-pub/sdk'

const S = defineSettings({
	endpoint: {
		type: 'string',
		label: 'API endpoint',
		required: true,
		scope: 'pub',
		side: 'extension',
		group: 'Connection',
	},
	apiKey: {
		type: 'secret',
		label: 'API key',
		required: true,
		scope: 'pub',
		side: 'extension',
		group: 'Connection',
	},
	mode: {
		type: 'enum',
		of: ['simple', 'advanced'] as const,
		default: 'simple',
		group: 'Behaviour',
	},
	retries: {
		type: 'integer',
		default: 2,
		min: 0,
		max: 10,
		group: 'Behaviour',
		showIf: { field: 'mode', equals: 'advanced' },
	},
	showBadge: {
		type: 'boolean',
		default: true,
		scope: 'user',
		side: 'component',
		group: 'Display',
	},
})

const configured = {
	endpoint: 'https://example.test',
	apiKey: secret('cipher:abc'),
	mode: 'simple',
	retries: 2,
	showBadge: true,
}

// ── 77 · One declaration, four uses ─────────────────────────────────────────
describe('77 · the schema drives the form, validation, the manifest and the types', () => {
	test('the form layout groups in declaration order', () => {
		assert.deepEqual(
			S.layout().map((g) => g.group),
			['Connection', 'Behaviour', 'Display'],
		)
		assert.deepEqual(
			S.layout()[0]!.fields.map((f) => f.key),
			['endpoint', 'apiKey'],
		)
	})

	test('conditional fields are one level, not a rules engine', () => {
		const decl = S.schema.retries
		assert.equal(isVisible(decl, { mode: 'simple' }), false)
		assert.equal(isVisible(decl, { mode: 'advanced' }), true)
		assert.equal(
			isVisible(S.schema.endpoint, {}),
			true,
			'a field with no showIf is always shown',
		)
	})

	test('defaults come from the declaration, and required fields have none', () => {
		assert.deepEqual(S.defaults(), { mode: 'simple', retries: 2, showBadge: true })
	})

	test('the value type is inferred, so the author’s own code is checked', () => {
		// Compile-time: `mode` narrows to the enum, `apiKey` is a SecretValue.
		const v: SettingsValues<typeof S.schema> = {
			endpoint: 'https://example.test',
			apiKey: secret('cipher:abc'),
			mode: 'advanced',
		}
		assert.equal(v.mode, 'advanced')
		const bad: SettingsValues<typeof S.schema> = {
			endpoint: 'x',
			apiKey: secret('y'),
			// @ts-expect-error — 'aggressive' is not one of the declared options.
			// The directive sits on the property, not on the declaration: the
			// error is reported where the bad value is, so a reformat that
			// splits the literal must not move the suppression off it.
			mode: 'aggressive',
		}
		void bad
	})
})

// ── 78 · Values are validated, and every error says what to do ──────────────
describe('78 · value validation', () => {
	test('type, range and enum membership are checked', () => {
		const f = checkValues(S.schema, { ...configured, retries: 99, mode: 'turbo' })
		assert.equal(f.length, 2)
		assert.ok(f.some((x) => x.field === 'retries' && /above the maximum 10/.test(x.message)))
		assert.ok(
			f.some((x) => x.field === 'mode' && /not one of simple, advanced/.test(x.message)),
		)
		for (const x of f) assert.ok(x.fix, 'every finding names what to do instead (15 §1.3)')
	})

	test('a secret set as a plain string is refused', () => {
		const f = checkValues(S.schema, { ...configured, apiKey: 'sk-live-oops' })
		assert.match(f[0]!.message, /is not a secret value/)
		assert.match(f[0]!.fix, /never set as plain strings/)
	})

	test('a fully configured plugin has nothing to report', () => {
		assert.deepEqual(checkValues(S.schema, configured), [])
	})
})

// ── 79 · A schema that would leak cannot be constructed ─────────────────────
describe('79 · declaration-time refusals', () => {
	test('a component-side secret throws, because a component runs in the browser', () => {
		assert.throws(
			() => defineSettings({ k: { type: 'secret', side: 'component' } }),
			(e: Error) => e instanceof SettingsError && /runs in the browser/.test(e.message),
		)
	})

	test('a shipped default credential is not a credential', () => {
		assert.throws(
			() => defineSettings({ k: { type: 'secret', default: 'sk-live' } }),
			/not a credential/,
		)
	})

	test('a named blank (unset) on a number field is refused at both doors', () => {
		const n = { type: 'number', unset: { label: 'Default', other: 'Another' } } as const
		assert.throws(
			() => defineSettings({ n }),
			/'unset', which only a string field has/,
		)
		const f = checkSchema({ n })
		assert.equal(f.length, 1)
		assert.equal(f[0].severity, 'error')
		const w = settingsSchemaFindings({ n }, 'w')
		assert.equal(w.length, 1)
		assert.match(w[0], /w\.n\.unset/)
	})

	test('a string field with a named blank passes both finders', () => {
		const c = { type: 'string', unset: { label: 'Default (main)', other: 'Another channel' } } as const
		assert.deepEqual(checkSchema({ c }), [])
		assert.deepEqual(settingsSchemaFindings({ c }, 'w'), [])
	})

	test('a blank unset.label is a finding that names it', () => {
		const w = settingsSchemaFindings(
			{ c: { type: 'string', unset: { label: '', other: 'Another' } } },
			'w',
		)
		assert.ok(w.some((m) => /\.unset\.label/.test(m)), w.join('\n'))
	})

	test('an enum with no options is a dead form field', () => {
		assert.throws(() => defineSettings({ k: { type: 'enum' } }), /enum with no options/)
	})

	test('a showIf naming a field that does not exist is refused, and lists what does', () => {
		assert.throws(
			() =>
				defineSettings({
					a: { type: 'string' },
					b: { type: 'string', showIf: { field: 'c', equals: 1 } },
				}),
			/name a field this schema declares \(a, b\)/,
		)
	})

	test('required plus a default is a warning, not an error — it can just never be unset', () => {
		const f = checkSchema({ k: { type: 'string', required: true, default: 'x' } })
		assert.equal(f[0]!.severity, 'warning')
	})

	test('an enum declared by members (key + label) has its options; one with neither is refused', () => {
		// Core's genre fields declare choices as `members[]` so each option has
		// display text; `of` is the bare form. Both are options.
		assert.deepEqual(
			checkSchema({
				detail: { type: 'enum', members: [{ key: 'full', label: 'Everything' }, { key: 'brief', label: 'Brief' }] },
			} as never),
			[],
		)
		const f = checkSchema({ detail: { type: 'enum' } } as never)
		assert.match(f[0]!.message, /is an enum with no options/)
	})
})

// ── 80 · What an update does to values that already exist ──────────────────
describe('80 · reconcile on update', () => {
	test('a removed field is orphaned, never deleted', () => {
		// Same rule 12 §5 applies to an orphaned slot after a node swap: unmigrated
		// values land in diagnostics rather than disappearing, so a downgrade can
		// still get them back.
		const r = reconcile(S.schema, { ...configured, legacyTimeout: 30 })
		assert.deepEqual(r.orphaned, [
			{
				field: 'legacyTimeout',
				value: 30,
				reason: 'the updated schema no longer declares this field',
			},
		])
		assert.equal(r.values.endpoint, 'https://example.test')
	})

	test('an orphaned secret is reported without its value', () => {
		const r = reconcile(S.schema, { ...configured, oldKey: secret('cipher:old') })
		assert.equal(r.orphaned[0]!.value, '[secret]')
	})

	test('a newly added field takes its default', () => {
		const r = reconcile(S.schema, { endpoint: 'x', apiKey: secret('y') })
		assert.equal(r.values.retries, 2)
	})

	test('reconcile reports what is now invalid rather than silently coercing', () => {
		const r = reconcile(S.schema, { endpoint: 'x', apiKey: secret('y'), retries: 'two' })
		assert.ok(r.findings.some((x) => x.field === 'retries'))
	})
})

// ── 81 · Unconfigured is not broken ────────────────────────────────────────
describe('81 · needs-configuration', () => {
	test('a required field with no value blocks activation and names itself', () => {
		const s = configState(S.schema, { mode: 'simple' })
		assert.equal(s.state, 'needs-configuration')
		assert.deepEqual((s as any).missing, ['endpoint', 'apiKey'])
		assert.match((s as any).message, /waiting on endpoint, apiKey/)
	})

	test('"needs configuration" is a distinct state from "broken"', () => {
		// One means file a bug against the author; the other means type an API key. A
		// plugin that silently does nothing is the worst of both.
		assert.equal(configState(S.schema, configured).state, 'ready')
		assert.notEqual(configState(S.schema, {}).state, 'broken' as never)
	})
})

// ── 82 · The three audiences, and what each is allowed to see ──────────────
describe('82 · audiences', () => {
	test('the client learns whether a secret is set, never what it is', () => {
		const c = S.forClient(configured)
		assert.deepEqual(c.apiKey, { $secretSet: true })
		assert.equal(JSON.stringify(c).includes('cipher:abc'), false)
	})

	test('an export drops secrets entirely', () => {
		assert.equal('apiKey' in S.forExport(configured), false)
		assert.equal(S.forExport(configured).endpoint, 'https://example.test')
	})

	test('a component receives only component-side fields', () => {
		assert.deepEqual(S.forComponent(configured), { showBadge: true })
	})
})

describe('the json field type', () => {
	const layout: FieldDecl = {
		type: 'json',
		jsonSchema: {
			type: 'object',
			required: ['columns'],
			properties: { columns: { type: 'array', items: { type: 'string' }, maxItems: 3 }, gap: { type: 'integer', minimum: 0 } },
			additionalProperties: false,
		},
	}

	test('checkSchema refuses a bad maxBytes, an unknown keyword, maxBytes on a string and a bad default', () => {
		const msgs = (s: Parameters<typeof checkSchema>[0]) => checkSchema(s).map((x) => x.message).join('\n')
		assert.match(msgs({ j: { type: 'json', maxBytes: 0 } }), /maxBytes 0/)
		assert.match(msgs({ j: { type: 'json', maxBytes: JSON_FIELD_MAX_BYTES_CEILING + 1 } }), /maxBytes/)
		assert.match(msgs({ j: { type: 'json', maxBytes: 1.5 } }), /maxBytes/)
		assert.match(msgs({ j: { type: 'json', jsonSchema: { oneOf: [] } } }), /'oneOf'/)
		assert.match(msgs({ j: { type: 'json', jsonSchema: { properties: { a: { $ref: '#/x' } } } } }), /\$ref/)
		assert.match(msgs({ s: { type: 'string', maxBytes: 10 } }), /only a json field has/)
		assert.match(msgs({ s: { type: 'string', jsonSchema: {} } }), /only a json field has/)
		assert.match(msgs({ j: { ...layout, default: { columns: [1] } } }), /default of 'j\.default\.columns\[0\]'/)
		assert.deepEqual(checkSchema({ j: { ...layout, default: { columns: ['a'] } } }), [])
		assert.match(msgs({ l: { type: 'list', item: { type: 'json', maxBytes: -1 } } }), /l\[\]/)
		// an invalid cap is the one finding: its default is not judged against it as well
		assert.equal(checkSchema({ j: { type: 'json', maxBytes: -1, default: { a: 1 } } }).length, 1)
	})

	test('values: not JSON, over the cap, the default cap', () => {
		const d: FieldDecl = { type: 'json' }
		assert.deepEqual(jsonFieldFindings(d, { a: [1, 'x', null, true] }, 'j'), [])
		assert.deepEqual(jsonFieldFindings(d, ['root', 'array'], 'j'), [])
		assert.match(jsonFieldFindings(d, { a: undefined }, 'j')[0].message, /'j\.a' is undefined/)
		assert.match(jsonFieldFindings(d, { a: NaN }, 'j')[0].message, /NaN/)
		assert.match(jsonFieldFindings(d, { a: () => 1 }, 'j')[0].message, /function/)
		assert.match(jsonFieldFindings(d, new Date(), 'j')[0].message, /plain object/)
		const cyc: Record<string, unknown> = {}
		cyc.self = cyc
		assert.match(jsonFieldFindings(d, cyc, 'j')[0].message, /itself/)
		assert.equal(jsonFieldFindings(d, 'x'.repeat(JSON_FIELD_MAX_BYTES), 'j').length, 1) // + 2 quotes > cap
		assert.deepEqual(jsonFieldFindings(d, 'x'.repeat(JSON_FIELD_MAX_BYTES - 2), 'j'), [])
		// bytes, not characters
		assert.equal(jsonFieldFindings({ type: 'json', maxBytes: 8 }, '\u00e9\u00e9\u00e9\u00e9', 'j').length, 1)
		assert.equal(jsonFieldFindings({ type: 'json', maxBytes: 8 }, '\u00e9\u00e9\u00e9', 'j').length, 0)
		assert.equal(checkValues({ j: d }, { j: { a: undefined } }).length, 1)
	})

	test('jsonSchema misfits are findings at their JSON paths; a fitting value passes', () => {
		assert.deepEqual(jsonFieldFindings(layout, { columns: ['a', 'b'], gap: 2 }, 'layout'), [])
		const f = jsonFieldFindings(layout, { columns: ['a', 'b', 3, 'd'], gap: -1, extra: true }, 'layout')
		const at = f.map((x) => x.field)
		assert.ok(at.includes('layout.columns[2]'))
		assert.ok(at.includes('layout.columns'))
		assert.ok(at.includes('layout.gap'))
		assert.ok(at.includes('layout.extra'))
		assert.ok(f.every((x) => x.fix))
		assert.equal(jsonFieldFindings(layout, {}, 'layout')[0].field, 'layout.columns')
		assert.equal(jsonFieldFindings(layout, [], 'layout')[0].field, 'layout')
		const arr: FieldDecl = { type: 'json', jsonSchema: { type: ['array', 'null'], items: { type: 'number' } } }
		assert.deepEqual(jsonFieldFindings(arr, [1, 2.5], 'a'), [])
		assert.deepEqual(jsonFieldFindings(arr, null, 'a'), [])
		assert.equal(jsonFieldFindings(arr, [1, 'x'], 'a')[0].field, 'a[1]')
		assert.equal(jsonFieldFindings({ type: 'json', jsonSchema: { enum: ['a', 'b'] } }, 'c', 'e').length, 1)
		assert.equal(jsonFieldFindings({ type: 'json', jsonSchema: { const: { k: 1 } } }, { k: 1 }, 'e').length, 0)
	})

	test('jsonFieldByteCap clamps a hostile declaration', () => {
		assert.equal(jsonFieldByteCap({}), JSON_FIELD_MAX_BYTES)
		assert.equal(jsonFieldByteCap({ maxBytes: 10 * 1024 ** 3 }), JSON_FIELD_MAX_BYTES_CEILING)
		assert.equal(jsonFieldByteCap({ maxBytes: Infinity }), JSON_FIELD_MAX_BYTES_CEILING)
		assert.equal(jsonFieldByteCap({ maxBytes: -5 }), 1)
		assert.equal(jsonFieldByteCap({ maxBytes: NaN }), JSON_FIELD_MAX_BYTES)
		assert.equal(jsonFieldByteCap({ maxBytes: '9' as unknown as number }), JSON_FIELD_MAX_BYTES)
	})

	test('values are inferred as JSON and the form round-trips parsed', async () => {
		const { valuesForForm, applyFormValues } = await import('@serene-pub/sdk')
		const sch = { j: { type: 'json' } } as const
		const v: SettingsValues<typeof sch> = {}
		v.j = { a: [1] }
		assert.deepEqual(valuesForForm(sch, { j: { a: 1 } }), { j: '{\n  "a": 1\n}' })
		assert.deepEqual(applyFormValues(sch, { j: null }, { j: '[1,2]' }), { j: [1, 2] })
		assert.throws(() => applyFormValues(sch, {}, { j: '{nope' }), SettingsError)
	})
})

describe('undescribedSettingParts (P5, ★E-2): what a user-facing setting lacks', () => {
	const base = { type: 'boolean' } as FieldDecl
	test('names every missing part, in order', () => {
		assert.deepEqual(undescribedSettingParts(base), ['description', 'group', 'reach'])
		assert.deepEqual(undescribedSettingParts({ ...base, description: { en: 'Does a thing.' } }), ['group', 'reach'])
	})
	test('a blank or non-English description is no description', () => {
		assert.deepEqual(undescribedSettingParts({ ...base, description: '  ', group: 'G', reach: 'owner' }), ['description'])
		assert.deepEqual(undescribedSettingParts({ ...base, description: { fr: 'Oui' } as any, group: 'G', reach: 'owner' }), ['description'])
	})
	test('described is empty; admin reach is not user-facing', () => {
		assert.deepEqual(undescribedSettingParts({ ...base, description: 'Does it.', group: 'G', reach: 'owner' }), [])
		assert.deepEqual(undescribedSettingParts({ ...base, reach: 'admin' }), [])
	})
	test('a kind with no reach (a plugin setting) is not asked for one', () => {
		assert.deepEqual(undescribedSettingParts(base, { reach: false }), ['description', 'group'])
	})
})
