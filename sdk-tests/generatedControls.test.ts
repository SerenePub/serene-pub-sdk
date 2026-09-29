/**
 * Generated controls: the path from a declared surface to an editor.
 *
 * A surface declares a `SettingsSchema`; the host renders forms from schemas;
 * so the editor is derived rather than written. That only holds if the whole
 * field vocabulary lands somewhere — every `FieldType` must reach either a
 * value type with a control, or a fallback the form renderer states out loud.
 * A type that reaches neither renders as nothing at all, which looks like a
 * broken surface rather than a missing bridge.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	announce,
	component,
	previewManifest,
	valueDeclOf,
	valueKind,
	validateValue,
	formLayout,
	isVisible,
	defineSettings,
	type FieldType,
	type SettingsSchema,
} from '@serene-pub/sdk'

/** Every FieldType the settings vocabulary has, with a minimal declaration. */
const ONE_OF_EACH: Record<FieldType, Record<string, unknown>> = {
	string: { type: 'string', label: 'S' },
	text: { type: 'text', label: 'T' },
	number: { type: 'number', label: 'N' },
	integer: { type: 'integer', label: 'I' },
	boolean: { type: 'boolean', label: 'B' },
	enum: { type: 'enum', label: 'E', of: ['a', 'b'] },
	'string[]': { type: 'string[]', label: 'L' },
	secret: { type: 'secret', label: 'K' },
	// The three multi-band controls, which the node-params half of the field
	// language always had and the settings half did not — they are one
	// language now, so they belong in this exhaustive map.
	share: {
		type: 'share',
		label: 'Sh',
		members: [{ key: 'a' }, { key: 'b' }],
	},
	perMember: {
		type: 'perMember',
		label: 'Pm',
		members: [{ key: 'a' }, { key: 'b' }],
	},
	strengths: {
		type: 'strengths',
		label: 'St',
		members: [{ key: 'a' }, { key: 'b' }],
	},
	media: { type: 'media', label: 'M', accepts: ['image'] },
	// The two nesting kinds. They bridge to nothing on purpose: a tree's
	// gestures are reorder, add and remove, which belong to the surface that
	// owns the write — `FieldControl` says so out loud rather than putting a
	// text box over an array.
	list: {
		type: 'list',
		label: 'Li',
		item: { type: 'string' },
	},
	object: {
		type: 'object',
		label: 'Ob',
		fields: { a: { type: 'string' } },
	},
}

/**
 * The types that deliberately have no value declaration. `FieldControl` renders
 * each explicitly — a one-per-line list, a write-only box, and a host-integrated
 * notice for the two nesting kinds — so this list is the contract between the
 * bridge and the renderer, not a shrug.
 */
const RENDERED_WITHOUT_A_VALUE_DECL = new Set([
	'string[]',
	'secret',
	'list',
	'object',
])

describe('the field vocabulary reaches a control (24 §8 · 12 §6)', () => {
	test('every FieldType either bridges to a value type or is handled by name', async () => {
		const { CONTROL_REGISTRY } = await import('@serene-pub/controls/registry')
		for (const [type, decl] of Object.entries(ONE_OF_EACH)) {
			const vd = valueDeclOf(decl)
			if (RENDERED_WITHOUT_A_VALUE_DECL.has(type)) {
				assert.equal(vd, null, `${type} is expected to have no value declaration`)
				continue
			}
			assert.ok(vd, `'${type}' bridges to nothing — a generated form would render it blank`)
			assert.ok(
				CONTROL_REGISTRY[valueKind(vd)],
				`'${type}' bridges to '${valueKind(vd)}', which has no control`,
			)
		}
	})

	test('the three multi-band types stay three, and say so in the declaration', () => {
		// They all bridge to `weights@1`, and what separates them is what that
		// declaration carries. Collapsing any two would put the wrong
		// arithmetic in front of a reader: a `share` divides one budget so
		// raising a member lowers the others, `strengths` are independent so
		// raising one takes nothing from anything, and `perMember` is a count
		// with no range at all. They sit within a few rows of each other on
		// core's ranking step.
		const of = (type: string) =>
			valueDeclOf({
				type,
				members: [{ key: 'a' }, { key: 'b' }],
				default: { a: 1, b: 1 },
			})!['weights@1'] as Record<string, unknown>

		assert.equal(of('share').normalize, true)
		assert.equal(of('share').control, 'stacked-bar')

		assert.equal(of('strengths').normalize, undefined)
		assert.equal(of('strengths').control, 'sliders')
		assert.equal(of('strengths').min, 0)
		assert.equal(of('strengths').max, 1)

		assert.equal(of('perMember').normalize, undefined)
		assert.equal(of('perMember').control, undefined)
		assert.equal(of('perMember').max, undefined)
	})

	test('a multiline `text` field is a text box that wants rows, not a one-liner', () => {
		const vd = valueDeclOf({ type: 'text', label: 'Notes' })!
		assert.equal(valueKind(vd), 'text@1')
		assert.equal((vd['text@1'] as Record<string, unknown>).multiline, true)
	})

	test('a `format: json` default arrives as the text the box will show', () => {
		const vd = valueDeclOf({ type: 'text', format: 'json', default: { a: 1 } })!
		assert.equal((vd['text@1'] as Record<string, unknown>).default, '{\n  "a": 1\n}')
	})

	test('the node-slot vocabulary is untouched by the field-vocabulary case', () => {
		// The config panel normalises its own `control: 'text'` to `'string'`
		// before it gets here, so a single-line node slot stays single-line.
		const vd = valueDeclOf({ type: 'string', default: 'x' })!
		assert.equal(valueKind(vd), 'text@1')
		assert.equal((vd['text@1'] as Record<string, unknown>).multiline, undefined)
	})

	test('a bridged declaration validates the values its control produces', () => {
		const vd = valueDeclOf({ type: 'integer', min: 2, max: 20 })!
		assert.deepEqual(validateValue(vd, 8), [])
		assert.ok(validateValue(vd, 40).length, '40 is out of range and should be refused')
	})
})

describe('a surface declares its props, and the harness reads them', () => {
	const schema: SettingsSchema = {
		sides: { type: 'integer', label: 'Sides', default: 20, min: 2 },
		style: { type: 'enum', label: 'Style', of: ['pips', 'numerals'], default: 'pips' },
		bias: {
			type: 'number',
			label: 'Bias',
			group: 'Advanced',
			showIf: { field: 'style', equals: 'numerals' },
		},
	}

	const pkg = () =>
		announce({ ns: 'acme.dice', author: 'acme', title: 'Dice' })
			.surfaces({
				page: { entry: 'ui/index.html', title: 'Dash' },
				panels: [{ id: 'tray', entry: 'ui/tray.html', title: 'Tray', settings: schema }],
			})
			.components(
				component({
					slug: 'dice-settings',
					label: 'Dice settings',
					framework: 'svelte',
					entry: 'src/Settings.svelte',
					settings: { loud: { type: 'boolean', label: 'Loud' } },
				}),
			)

	test('declared props ride the announcement and reach the preview target', () => {
		const { document } = pkg().build()
		assert.equal(document.surfaces?.panels?.[0]?.settings?.sides?.type, 'integer')

		const m = previewManifest(pkg())
		const tray = m.targets.find((t) => t.id === 'panel-tray')
		assert.equal(tray?.settings?.style?.type, 'enum')
		// A surface that declares nothing carries nothing — `undefined`, not
		// an empty object, so "declares no props" is a question with an answer.
		assert.equal(m.targets.find((t) => t.id === 'page')?.settings, undefined)
		assert.equal(
			m.targets.find((t) => t.id === 'dice-settings')?.settings?.loud?.type,
			'boolean',
		)
	})

	test('the generated form groups, orders and hides exactly as the SDK says', () => {
		const groups = formLayout(schema)
		assert.deepEqual(
			groups.map((g) => [g.group, g.fields.map((f) => f.key)]),
			[
				['General', ['sides', 'style']],
				['Advanced', ['bias']],
			],
		)
		assert.equal(isVisible(schema.bias!, { style: 'pips' }), false)
		assert.equal(isVisible(schema.bias!, { style: 'numerals' }), true)
	})

	test('every group is named, which is why a renderer cannot use emptiness to hide one', () => {
		// The premise behind `SchemaForm`'s heading rule, pinned here because
		// getting it wrong is invisible: `formLayout` gives ungrouped fields
		// the name `General`, so `g.group` is *never* falsy. A renderer that
		// wrote `{#if g.group && groups.length > 1}` would therefore hide an
		// author's own single declared group — the one case where they asked
		// for a heading. The question is whether the author chose the name,
		// not how many groups there are.
		const [only] = formLayout({ a: { type: 'string' } })
		assert.equal(only?.group, 'General')
		const [declared] = formLayout({ a: { type: 'string', group: 'Advanced' } })
		assert.equal(declared?.group, 'Advanced')
		assert.equal(formLayout({ a: { type: 'string', group: 'Advanced' } }).length, 1)
	})

	test('the form seeds from the schema, so unset means the shipped default', () => {
		const defaults = defineSettings(schema as never).defaults()
		assert.equal(defaults.sides, 20)
		assert.equal(defaults.style, 'pips')
		// No default declared and not required: absent, not null. A form that
		// seeded null would turn "inherit" into "explicitly nothing".
		assert.equal('bias' in defaults, false)
	})
})
