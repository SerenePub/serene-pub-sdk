/**
 * Display text (plans/29 R-20; plans/30 U5i, ruled 2026-09-17): one type,
 * one check, one resolver — enforced at every publish door.
 *
 * What is pinned: `'Title'` and `{ en: 'Title' }` are one value and every
 * door accepts both; `''`, `'   '`, `{ en: '' }`, `{ en: ' ' }`, `{ fr: 'x' }`,
 * `7`, `[]` and `null` are refused at every door with a sentence that names
 * the field and says what to write instead; `i18nText` resolves the two
 * spellings identically and answers a requested locale from a map; the
 * enabled-when and action emptiness cases keep their own sentences.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	i18nFindings,
	i18nText,
	isI18n,
	isLocaleMap,
	localeMapOf,
	settingsSchemaFindings,
	widgetDeclsFindings,
	describeTaskDefinition,
	describeInletDefinition,
	genre,
	envoyFindings,
	defineAttributeSlot,
	defineAttributeSheet,
	defineStoredAttributeSlot,
	defineStoredAttributeSheet,
	attributeSlotDisplayFindings,
	attributeSheetDisplayFindings,
	defineScriptKind,
	defineExtension,
	announce,
	config,
	preset,
	actionFindings,
	enabledWhenFindings,
	isStatusText,
	renderStatusText,
	sameStatus,
	statusVarsMentioned,
	fieldLabel,
	validate,
	compile,
	spec,
	run,
	ok,
	sessionEvents,
	i18nVerdict,
	v,
	S,
	type Extension,
	type ScriptKindDecl,
	type SpecDocument,
	use,
} from '@serene-pub/sdk'
import { compilePlugin } from '@serene-pub/cli'
import * as C from '@serene-pub/contracts'
import { chatGenre } from '@serene-pub/core-catalog'
import { bindings, world } from './helpers.js'

/** Every spelling a publish refuses, with the fragment its sentence must carry. */
const REFUSED: Array<[unknown, RegExp]> = [
	['', /is empty/],
	['   ', /is empty/],
	[{ en: '' }, /\.en is empty/],
	[{ en: ' ' }, /\.en is empty/],
	[{ fr: 'x' }, /a locale map with a required 'en' \(R-20\) — got an object without 'en'/],
	[7, /a locale map with a required 'en' \(R-20\) — got a number/],
	[[], /a locale map with a required 'en' \(R-20\) — got an array/],
	[null, /a locale map with a required 'en' \(R-20\) — got null/],
]

/** The two spellings a publish accepts as one value. */
const ACCEPTED: unknown[] = ['Title', { en: 'Title' }]

let n = 0
const fresh = (prefix: string) => `${prefix}${n++}`

/** A door: given one display-text value, throw when it is refused, return when accepted. */
type Door = (value: unknown) => unknown

/**
 * Every door refuses each malformed spelling with a sentence that names the
 * field (`field`) and carries the fix, and accepts both sound spellings.
 */
function itIsADoor(name: string, door: Door, field: RegExp) {
	test(`${name}: refuses every malformed spelling, naming the field and the fix`, () => {
		for (const [value, sentence] of REFUSED) {
			assert.throws(
				() => door(value),
				(e: Error) => {
					assert.match(e.message, field, `${name} ${JSON.stringify(value)}: field not named`)
					assert.match(e.message, sentence, `${name} ${JSON.stringify(value)}`)
					assert.match(e.message, /Title/, `${name} ${JSON.stringify(value)}: no fix stated`)
					return true
				},
				`${name} accepted ${JSON.stringify(value)}`,
			)
		}
	})
	test(`${name}: accepts 'Title' and { en: 'Title' } alike`, () => {
		for (const value of ACCEPTED) assert.doesNotThrow(() => door(value), JSON.stringify(value))
	})
}

/** A door that returns findings instead of throwing, lifted to the throwing shape. */
const throwing =
	(findings: (value: unknown) => string[]): Door =>
	(value) => {
		const out = findings(value)
		if (out.length) throw new Error(out.join('\n'))
	}

describe('R-20 · one check', () => {
	test('a bare string is en; blank and mis-shaped values are findings; absence is only a finding when required', () => {
		assert.deepEqual(i18nFindings('Title', 'x'), [])
		assert.deepEqual(i18nFindings({ en: 'Title', fr: 'Titre' }, 'x'), [])
		assert.deepEqual(i18nFindings(undefined, 'x'), [])
		assert.match(i18nFindings(undefined, 'x', { required: true })[0]!, /^x is required — display text/)
		for (const [value, sentence] of REFUSED) {
			const f = i18nFindings(value, 'label')
			assert.equal(f.length, 1, JSON.stringify(value))
			assert.match(f[0]!, /^label/)
			assert.match(f[0]!, sentence)
			assert.match(f[0]!, /R-20/)
		}
	})

	test('the shape guards read the same rule', () => {
		assert.ok(isI18n('Title'))
		assert.ok(isI18n({ en: 'Title' }))
		assert.ok(!isI18n(''))
		assert.ok(!isI18n({ en: ' ' }))
		assert.ok(!isI18n({ fr: 'Titre' }), 'a map with only fr has no en to fall back to')
		assert.ok(!isI18n(7))
		assert.ok(isLocaleMap({ en: '' }), 'the shape is a map; blankness is the other rule')
		assert.ok(!isLocaleMap('x'))
		assert.deepEqual(localeMapOf('Title'), { en: 'Title' })
	})

	test('core:verdict/i18n refuses iff i18nFindings does, quoting its first sentence, over REFUSED and ACCEPTED', () => {
		for (const [value] of REFUSED) {
			const findings = i18nFindings(value, 'label')
			const heard = i18nVerdict.judge({ value, where: 'label' })
			assert.equal(findings.length > 0, true, JSON.stringify(value))
			assert.equal(heard.ok, false, JSON.stringify(value))
			assert.equal(!heard.ok && heard.sentence, findings[0], JSON.stringify(value))
		}
		for (const value of ACCEPTED) {
			assert.deepEqual(i18nFindings(value, 'label'), [], JSON.stringify(value))
			assert.equal(i18nVerdict.judge({ value, where: 'label' }).ok, true, JSON.stringify(value))
		}
	})
})

describe('R-20 · one resolver', () => {
	test("'Title' and { en: 'Title' } resolve identically; a map answers the locale asked for", () => {
		assert.equal(i18nText('Title'), 'Title')
		assert.equal(i18nText({ en: 'Title' }), 'Title')
		assert.equal(i18nText('Title', 'fr'), 'Title')
		assert.equal(i18nText({ en: 'Title' }, 'fr'), 'Title')
		assert.equal(i18nText({ en: 'Title', fr: 'Titre' }, 'fr'), 'Titre')
		assert.equal(i18nText({ en: 'Title', fr: 'Titre' }), 'Title')
		assert.equal(i18nText({ en: 'Title', fr: '' }, 'fr'), 'Title', 'a blank locale is absent')
	})

	test('a malformed value answers undefined — nothing papers over one', () => {
		assert.equal(i18nText(undefined), undefined)
		assert.equal(i18nText({ fr: 'x' } as never), undefined)
		assert.equal(i18nText(7 as never), undefined)
	})

	test('fieldLabel and renderStatusText read through it', () => {
		assert.equal(fieldLabel({ label: 'Depth' }), 'Depth')
		assert.equal(fieldLabel({ label: { en: 'Depth', fr: 'Profondeur' } }, 'fr'), 'Profondeur')
		assert.equal(fieldLabel({}), undefined)
		assert.equal(renderStatusText({ i18n: 'thinking' }), 'thinking')
		assert.equal(renderStatusText({ i18n: { en: 'thinking', fr: 'réfléchit' } }, 'fr'), 'réfléchit')
		assert.equal(
			renderStatusText({ i18n: '{speaker} is typing', vars: { speaker: 'Aria' } }),
			'Aria is typing',
		)
		assert.deepEqual(statusVarsMentioned({ i18n: '{speaker} is {doing}' }).sort(), ['doing', 'speaker'])
		assert.ok(sameStatus({ i18n: 'thinking' }, { i18n: { en: 'thinking' } }), 'one value, two spellings')
	})
})

describe('R-20 · every door', () => {
	itIsADoor(
		'register (i18n.name)',
		(value) =>
			describeTaskDefinition({
				id: fresh('test.i18n:task/name'),
				i18n: { name: value as never },
				ports: { in: { main: S.text }, out: { main: S.text } },
			}),
		/i18n\.name/,
	)

	itIsADoor(
		'register (slot description)',
		(value) =>
			describeTaskDefinition({
				id: fresh('test.i18n:task/slot'),
				slots: { params: { kind: 'parameters', description: value as never, schema: {} } },
				ports: { in: { main: S.text }, out: { main: S.text } },
			}),
		/slots\.params\.description/,
	)

	itIsADoor(
		'register (params schema label)',
		(value) =>
			describeTaskDefinition({
				id: fresh('test.i18n:task/schema'),
				slots: {
					params: {
						kind: 'parameters',
						schema: { depth: { type: 'integer', label: value as never, default: 1 } },
					},
				},
				ports: { in: { main: S.text }, out: { main: S.text } },
			}),
		/slots\.params\.schema\.depth\.label/,
	)

	itIsADoor(
		'register (script point label)',
		(value) =>
			describeTaskDefinition({
				id: fresh('test.i18n:task/point'),
				scriptPoints: [{ key: 'after', accepts: ['core:script:text/transform@1'], label: value as never }],
				ports: { in: { main: S.text }, out: { main: S.text } },
			}),
		/scriptPoints\[after\]\.label/,
	)

	test('register: a session mode keeps its own strictness — a mode must have a name', () => {
		assert.throws(
			() =>
				describeInletDefinition({
					id: fresh('test.i18n:inlet/mode'),
					sessionShape: {},
					i18n: { name: { fr: 'Mode' } as never },
					ports: { in: {}, out: { text: S.text } },
				}),
			/declares a sessionShape but no i18n\.name/,
		)
		assert.doesNotThrow(() =>
			describeInletDefinition({
				id: fresh('test.i18n:inlet/mode'),
				sessionShape: {},
				i18n: { name: 'Mode' },
				ports: { in: {}, out: { text: S.text } },
			}),
		)
	})

	itIsADoor(
		'genre (name)',
		(value) => genre(fresh('test.i18n:genre/g'), { name: value as never, family: 'chat' }),
		/\.name/,
	)

	itIsADoor(
		'genre (shape.fields label)',
		(value) =>
			genre(fresh('test.i18n:genre/f'), {
				name: 'G',
				family: 'chat',
				shape: { fields: { tone: { type: 'string', label: value as never } } },
			}),
		/shape\.fields\.tone\.label/,
	)

	itIsADoor(
		'envoy (name)',
		throwing((value) => envoyFindings({ key: 'guide', name: value }, 'envoys')),
		/envoys\[guide\]\.name/,
	)

	itIsADoor(
		'attribute slot (label)',
		(value) =>
			defineAttributeSlot(`test.i18n:slot/hp${n++}@1` as never, {
				type: 'integer',
				label: value as never,
				descriptor: 'Health.',
				appliesTo: ['cast'],
			}),
		/label/,
	)

	itIsADoor(
		'attribute sheet (label)',
		(value) => defineAttributeSheet(`test.i18n:sheet/s${n++}@1` as never, { label: value as never, slots: [] }),
		/label/,
	)

	itIsADoor(
		'script kind (blastRadius)',
		(value) =>
			defineScriptKind({
				id: `test.i18n:script:text/transform-${n++}@1`,
				blastRadius: value as never,
				semantics: 'transform',
				ports: { in: { text: 'core:shape/text@1' }, out: { text: 'core:shape/text@1' } },
			} as ScriptKindDecl),
		/blastRadius/,
	)

	itIsADoor(
		'widget (title)',
		throwing((value) =>
			widgetDeclsFindings([{ id: 'map', title: value, component: 'map' }], 'panels'),
		),
		/panels\[map\]\.title/,
	)

	itIsADoor(
		'value declaration (label)',
		(value) => v.integer({ label: value as never }),
		/integer@1 label/,
	)

	itIsADoor(
		'select option (label)',
		(value) => v.select([{ value: 'a', label: value as never }]),
		/select@1 options\[a\]\.label/,
	)

	itIsADoor(
		'settings schema (member label)',
		throwing((value) =>
			settingsSchemaFindings(
				{ share: { type: 'share', members: [{ key: 'lore', label: value }] } },
				'settings',
			),
		),
		/settings\.share\.members\[lore\]\.label/,
	)

	itIsADoor(
		'preset (label)',
		(value) =>
			preset({
				slug: 'p',
				genre: chatGenre,
				label: value as never,
				bindings: [{ spec: use('core:spec/create-chat'), events: [sessionEvents.sessionCreated] }],
			}),
		/preset 'p'\.label/,
	)

	itIsADoor(
		'config (label)',
		(value) => config(use('core:spec/respond'), 'c', { label: value as never }, {}),
		/config 'c'\.label/,
	)

	itIsADoor(
		'announce.build (prompt label, package title)',
		(value) =>
			announce({ ns: 'test.i18n', author: 'a', title: value as never })
				.prompts({
					nodeType: 'core:task/build-template-context',
					slot: 'prompts',
					slug: 'pr',
					label: value as never,
					fields: {},
				})
				.build(),
		/identity\.title/,
	)

	itIsADoor(
		'action (label)',
		throwing((value) =>
			actionFindings(
				{ key: 'roll', genre: chatGenre.id, venue: { kind: 'composer' }, label: value, description: 'Roll the dice.' },
				'acme:spec/dice',
			),
		),
		/label/,
	)

	test('enabled-when (reason): every spelling gets the one R-20 sentence, the field named', () => {
		for (const [value, sentence] of REFUSED) {
			const f = enabledWhenFindings({ on: 'a', truthy: true, reason: value })
			assert.equal(f.length, 1, JSON.stringify(value))
			assert.match(f[0]!, /^enabledWhen\.reason/)
			assert.match(f[0]!, sentence)
		}
		for (const value of ACCEPTED)
			assert.deepEqual(enabledWhenFindings({ on: 'a', truthy: true, reason: value }), [])
	})

	test('status: a malformed status is a receipt note and is dropped; a bare string is en', async () => {
		for (const [value] of REFUSED) assert.ok(!isStatusText({ i18n: value }), JSON.stringify(value))
		for (const value of ACCEPTED) assert.ok(isStatusText({ i18n: value }), JSON.stringify(value))
		const seen: string[] = []
		const doc = compile(
			spec('test.i18n:spec/status', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('probe', ($) => C.passthrough.v1({ main: $.input.text }))
				.build(),
		)
		const r = await run(doc, {
			input: { text: 'hi', sessionScope: 'session:1' },
			bindings: bindings({
				'test:task/passthrough@1': async (i: any, ctx: any) => {
					ctx.status({ i18n: '' })
					ctx.status({ i18n: { fr: 'réfléchit' } })
					ctx.status({ i18n: 'thinking' })
					return ok({ main: i.main })
				},
			}),
			world,
			onStatus: (_node, text) => seen.push(renderStatusText(text)),
		})
		assert.equal(r.outcome, 'ok')
		assert.deepEqual(seen, ['thinking'])
		const notes = r.nodes.find((x) => x.nodeKey === 'probe')!.notes ?? []
		assert.equal(notes.filter((x) => x.startsWith('status ignored')).length, 2)
		assert.match(notes[0]!, /R-20/)
	})

	itIsADoor(
		'defineExtension (name)',
		(value) => defineExtension({ slug: 'acme.dice', name: value as never, version: '1.0.0' }),
		/name/,
	)

	test('the packager refuses a manifest whose name has no en, with a fix (E_MANIFEST_DISPLAY_TEXT)', () => {
		const sources = [{ path: 'index.ts', text: "export default defineExtension({ slug: 'acme.dice' })" }]
		const older = (name: unknown): Extension =>
			({ __extension: true, slug: 'acme.dice', name: name as never, version: '1.0.0' }) as Extension
		for (const [value, sentence] of REFUSED) {
			const r = compilePlugin({ sources, extension: older(value) })
			assert.equal(r.ok, false, JSON.stringify(value))
			const f = r.findings.find((x) => x.code === 'E_MANIFEST_DISPLAY_TEXT')!
			assert.ok(f, `no manifest finding for ${JSON.stringify(value)}`)
			assert.match(f.message, /^name/)
			assert.match(f.message, sentence)
			assert.ok(f.fix.length > 10)
		}
		for (const value of ACCEPTED) {
			const r = compilePlugin({ sources, extension: older(value) })
			assert.ok(!r.findings.some((x) => x.code === 'E_MANIFEST_DISPLAY_TEXT'), JSON.stringify(value))
		}
	})

	test('validate(): a stored document with a blank preset label or genre name is refused under R-20, with a fix', () => {
		const base = compile(
			spec('test.i18n:spec/doc', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
				.preset('lore', { label: 'Lore-heavy' }, () => {})
				.build(),
		)
		assert.deepEqual(validate(base).filter((f) => f.law === 'R-20'), [])
		for (const [value, sentence] of REFUSED) {
			const doc: SpecDocument = { ...base, presets: [{ ...base.presets[0]!, label: value as never }] }
			const errs = validate(doc).filter((f) => f.law === 'R-20')
			assert.equal(errs.length, 1, JSON.stringify(value))
			assert.equal(errs[0]!.severity, 'error')
			assert.match(errs[0]!.message, /^presets\[lore\]\.label/)
			assert.match(errs[0]!.message, sentence)
			assert.ok(errs[0]!.fix.length > 10)
		}
		const withGenre: SpecDocument = {
			...base,
			genre: { name: { fr: 'Chat' }, family: 'chat', shape: { fields: { tone: { type: 'string', label: '' } } } },
		}
		const messages = validate(withGenre)
			.filter((f) => f.law === 'R-20')
			.map((f) => f.message)
		assert.equal(messages.length, 2, messages.join('\n'))
		assert.match(messages[0]!, /^genre\.name: a locale map with a required 'en'/)
		assert.match(messages[1]!, /^genre\.shape\.fields\.tone\.label is empty/)
	})

	test('door-level: register() refuses a panel title with no en; genre() a blank envoy name and a blank field label; defineExtension a numeric description', () => {
		assert.throws(
			() =>
				describeInletDefinition({
					id: fresh('test.i18n:inlet/panels'),
					sessionShape: {
						panels: [{ id: 'map', title: { fr: 'Carte' } as never, component: 'map' }],
					},
					i18n: { name: 'Mode' },
					ports: { in: {}, out: { text: S.text } },
				}),
			/sessionShape\.panels\[map\]\.title: a locale map with a required 'en' \(R-20\) — got an object without 'en'; write 'Title'/,
		)
		assert.throws(
			() =>
				genre(fresh('test.i18n:genre/envoy'), {
					name: 'G',
					family: 'chat',
					envoys: [{ key: 'guide', name: '' }],
				}),
			/envoys\[guide\]\.name is empty — give it text a person reads, 'Title' or \{ en: 'Title' \} \(R-20\)/,
		)
		assert.throws(
			() =>
				genre(fresh('test.i18n:genre/field'), {
					name: 'G',
					family: 'chat',
					shape: { fields: { tone: { type: 'string', label: '  ' } } },
				}),
			/shape\.fields\.tone\.label is empty — give it text a person reads/,
		)
		assert.throws(
			() => defineExtension({ slug: 'acme.dice', name: 'Dice', version: '1.0.0', description: 7 as never }),
			/description: a locale map with a required 'en' \(R-20\) — got a number; write 'Title'/,
		)
	})

	test("the spec builder's .preset() refuses a blank label at authoring, with the same sentence validate() gives", () => {
		const chain = (label: unknown, description?: unknown) =>
			spec(`test.i18n:spec/preset-${n++}`, { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.outlet('save', ($) => C.createMessage.v1({ text: $.input.text }))
				.preset('lore', { label: label as never, description: description as never }, () => {})
		for (const [value, sentence] of REFUSED) {
			assert.throws(
				() => chain(value),
				(e: Error) => {
					assert.match(e.message, /^preset 'lore' declares display text a publish refuses \(R-20\)/)
					assert.match(e.message, /presets\[lore\]\.label/)
					assert.match(e.message, sentence)
					return true
				},
				JSON.stringify(value),
			)
		}
		assert.throws(() => chain('Lore', '  '), /presets\[lore\]\.description is empty/)
		for (const value of ACCEPTED) assert.doesNotThrow(() => chain(value))
		const built = chain({ en: 'Lore-heavy', fr: 'Riche en lore' }).build()
		assert.equal(i18nText(built.presets[0]!.label, 'fr'), 'Riche en lore')
		assert.deepEqual(validate(compile(built)).filter((f) => f.law === 'R-20'), [])
	})

	test('a stored attribute slot or sheet reloads with a blank description dropped and a warning naming the row — never a throw (the write door is the gate)', () => {
		const warned: string[] = []
		const original = console.warn
		console.warn = (...args: unknown[]) => warned.push(args.map(String).join(' '))
		try {
			const slotId = `test.i18n:slot/stored${n++}@1` as never
			const decl = defineStoredAttributeSlot(
				slotId,
				{ type: 'integer', label: 'Health', description: '', descriptor: 'Health.', appliesTo: ['cast'] },
				{ userId: 1 },
			)
			assert.equal(decl.description, undefined)
			assert.equal(decl.label, 'Health')
			assert.equal(warned.length, 1)
			assert.match(warned[0]!, new RegExp(`stored slot '${slotId}' carries display text a publish refuses`))
			assert.match(warned[0]!, /description is empty/)
			const sheetId = `test.i18n:sheet/stored${n++}@1` as never
			const sheet = defineStoredAttributeSheet(sheetId, { label: 'Adventurer', description: '   ', slots: [] }, { userId: 1 })
			assert.equal(sheet.description, undefined)
			assert.equal(sheet.label, 'Adventurer')
			assert.equal(warned.length, 2)
			// A sound row reloads silently.
			defineStoredAttributeSlot(
				`test.i18n:slot/stored${n++}@1` as never,
				{ type: 'integer', label: { en: 'Gold' }, descriptor: 'Gold.', appliesTo: ['cast'] },
				{ userId: 1 },
			)
			assert.equal(warned.length, 2)
		} finally {
			console.warn = original
		}
		// The write door's check, which the host runs before it stores a row.
		const slotFindings = attributeSlotDisplayFindings('test.i18n:slot/x@1' as never, {
			type: 'integer', label: { fr: 'Santé' } as never, descriptor: 'd', appliesTo: ['cast'],
		})
		assert.equal(slotFindings.length, 1)
		assert.match(slotFindings[0]!, /label: a locale map with a required 'en'/)
		const sheetFindings = attributeSheetDisplayFindings('test.i18n:sheet/x@1' as never, { label: '', slots: [] })
		assert.equal(sheetFindings.length, 1)
		assert.match(sheetFindings[0]!, /label is empty/)
		// The code door still refuses.
		assert.throws(
			() => defineAttributeSlot(`test.i18n:slot/code${n++}@1` as never, { type: 'integer', description: '', descriptor: 'd', appliesTo: ['cast'] }),
			/description is empty/,
		)
	})
})
