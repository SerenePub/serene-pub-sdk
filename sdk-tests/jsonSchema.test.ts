/**
 * 🚧 `jsonSchemaOf` / `validateAgainst` (Lair rewrite D1, 2026-10-21).
 *
 * A declared shape — an entry type (core's or a ruleset's derived one), an
 * attribute sheet or a ruleset's stats, a repertoire's piece, a form — as the
 * JSON Schema `generate-json@1` takes, and the answer checked on the way back
 * against the same declaration. The claims:
 *
 *  1. Strict output is the subset every structured-output door carries — the
 *     app's grammar compiler's contract: every property required,
 *     `additionalProperties: false`, no null, no `const`, no `maxLength`, no
 *     empty enum, no member-less object. Walked over every core declaration.
 *  2. What a model could not write is left out (secret, media, a JSON map);
 *     what it should not invent is left out on request (`omit`), by path.
 *  3. What was asked is what is accepted: a fitting answer validates clean,
 *     and each kind of misfit is named.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	defineAttributeSlot,
	getAttributeSlot,
	jsonSchemaOf,
	sheetSchemaKeys,
	validateAgainst,
	type FormBlock,
	type JsonSchema,
	type SettingsSchema,
} from '@serene-pub/sdk'
import * as cat from '../core-catalog/src/index.js'

/** Every way a schema could fall outside what the grammar compiler accepts, by path. */
function grammarUnsafe(node: any, at = 'root'): string[] {
	if (!node || typeof node !== 'object') return [`${at}: not a schema node`]
	const out: string[] = []
	for (const k of ['const', 'maxLength', 'oneOf', 'anyOf', 'allOf', 'nullable'])
		if (k in node) out.push(`${at}: '${k}'`)
	if (Array.isArray(node.type)) return [...out, `${at}: a type union`]
	switch (node.type) {
		case 'object': {
			const keys = Object.keys(node.properties ?? {})
			if (at !== 'root' && !keys.length) out.push(`${at}: an object with no properties`)
			if (node.additionalProperties !== false) out.push(`${at}: additionalProperties is not false`)
			const req = new Set(node.required ?? [])
			for (const k of keys) if (!req.has(k)) out.push(`${at}.${k}: optional`)
			for (const k of keys) out.push(...grammarUnsafe(node.properties[k], `${at}.${k}`))
			break
		}
		case 'array':
			out.push(...grammarUnsafe(node.items, `${at}[]`))
			break
		case 'string':
			if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.length)) out.push(`${at}: empty enum`)
			break
		case 'number':
		case 'integer':
		case 'boolean':
			break
		default:
			out.push(`${at}: type '${String(node.type)}'`)
	}
	return out
}

const props = (s: JsonSchema) => Object.keys(s.properties as object)

describe('strict output is what every door carries', () => {
	test("core's entry types, every derived entry type", () => {
		for (const t of [...cat.CORE_ENTRY_TYPES, ...cat.RULESET_ENTRY_TYPES])
			assert.deepEqual(grammarUnsafe(jsonSchemaOf(t)), [], t.id)
	})

	test("every core ruleset's stats, read as its sheet, on each owner", () => {
		for (const r of [cat.freeformRuleset, cat.visItinerisRuleset])
			for (const owner of [undefined, 'cast', 'world', 'location'] as const)
				assert.deepEqual(grammarUnsafe(jsonSchemaOf(r, { appliesTo: owner })), [], `${r.id} ${owner}`)
	})

	test("every core ruleset's repertoires, as one piece each", () => {
		for (const r of [cat.freeformRuleset, cat.visItinerisRuleset])
			for (const rep of r.repertoires) {
				const s = jsonSchemaOf(rep)
				assert.deepEqual(grammarUnsafe(s), [], `${r.id}#${rep.id}`)
				for (const k of ['name', 'description', 'prose', 'traits']) assert.ok(props(s).includes(k), `${rep.id} ${k}`)
			}
	})

	test('the host keeps a duration — the model says how long, never when it started', () => {
		const things = cat.freeformRuleset.repertoires.find((r) => r.id === 'things')!
		const duration = (jsonSchemaOf(things).properties as any).duration
		assert.deepEqual(Object.keys(duration.properties), ['units', 'value', 'expiry'])
		const weapons = cat.RULESET_ENTRY_TYPES.find((t) => t.id === 'core:entry/vis-itineris.weapons@1')!
		assert.deepEqual(Object.keys((jsonSchemaOf(weapons).properties as any).duration.properties), ['units', 'value', 'expiry'])
	})
})

describe('an entry type asks for its typed fields', () => {
	test("a place: its category and priority — and `omit` by role, derived from the declaration", () => {
		const place = cat.locationEntryType
		const s = jsonSchemaOf(place)
		assert.deepEqual(props(s), ['category', 'priority'])
		assert.deepEqual(s.required, ['category', 'priority'])
		assert.equal(s.additionalProperties, false)
		const asked = jsonSchemaOf(place, { omit: [place.entryShape.roles.priority!] })
		assert.deepEqual(props(asked), ['category'])
	})

	test("a derived entry type: the piece's fields, the title's left to the `name` port", () => {
		const weapons = cat.RULESET_ENTRY_TYPES.find((t) => t.id === 'core:entry/vis-itineris.weapons@1')!
		const s = jsonSchemaOf(weapons)
		assert.ok(!props(s).includes('name'), 'the title is the name port, never a second copy')
		for (const k of ['description', 'traits', 'priority', 'supply']) assert.ok(props(s).includes(k), k)
		const supply = (s.properties as any).supply
		assert.deepEqual(supply.enum, ['unique', 'limited', 'unlimited'])
	})

	test('the declaration and the registered descriptor ask the same', () => {
		const decls = cat.RULESET_ENTRY_TYPES.map((t) => ({ id: t.id, ...t.entryShape, i18n: t.i18n }))
		for (const [i, d] of decls.entries())
			assert.deepEqual(jsonSchemaOf(d as any), jsonSchemaOf(cat.RULESET_ENTRY_TYPES[i]!), d.id)
	})

	test('strict: false keeps an optional field optional', () => {
		const s = jsonSchemaOf(cat.locationEntryType, { strict: false })
		assert.deepEqual(s.required, [])
	})
})

describe('the one field language, mapped', () => {
	const fields: SettingsSchema = {
		title: { type: 'string', required: true, description: 'What it is called.' },
		key: { type: 'secret' },
		picture: { type: 'media' },
		blob: { type: 'text', format: 'json' },
		when: { type: 'string', format: 'story-time', label: { en: 'When' } },
		mood: { type: 'enum', members: [{ key: 'calm' }, { key: 'wary' }] },
		voices: { type: 'enum', from: 'connection.voices' },
		dice: { type: 'integer', min: 1, max: 6 },
		tags: { type: 'list', item: { type: 'string' }, max: 3 },
		odds: { type: 'strengths', members: [{ key: 'fight' }, { key: 'flee' }] },
		where: { type: 'object', fields: { room: { type: 'string' }, shelf: { type: 'object', fields: {} } } },
	}
	const form = { kind: 'form', fn: 'answer', fields } as FormBlock

	test('what a model could not write is left out; the rest maps', () => {
		const s = jsonSchemaOf(form)
		assert.deepEqual(props(s), ['title', 'when', 'mood', 'dice', 'tags', 'odds', 'where'])
		assert.deepEqual(grammarUnsafe(s), [])
		const p = s.properties as any
		assert.equal(p.title.description, 'What it is called.')
		assert.match(p.when.description, /^When A story time/)
		assert.deepEqual(p.mood.enum, ['calm', 'wary'])
		assert.deepEqual([p.dice.minimum, p.dice.maximum], [1, 6])
		assert.equal(p.tags.maxItems, 3)
		assert.deepEqual(p.odds.properties.fight, { type: 'number', minimum: 0, maximum: 1 })
		assert.deepEqual(Object.keys(p.where.properties), ['room'], 'a member-less object is nothing to ask for')
	})

	test('omit reaches into an object by path', () => {
		assert.deepEqual(Object.keys((jsonSchemaOf(form, { omit: ['where.room'] }).properties as any).where?.properties ?? {}), [])
		assert.ok(!props(jsonSchemaOf(form, { omit: ['where.room'] })).includes('where'), 'an object emptied by omit goes too')
	})

	test('the answer is checked against the same fields', () => {
		const ok = { title: 'The Gate', when: '412-03-05', mood: 'calm', dice: 3, tags: ['a'], odds: { fight: 1, flee: 0 }, where: { room: 'hall' } }
		assert.deepEqual(validateAgainst(form, ok), [])
		const bad = validateAgainst(form, { ...ok, mood: 'angry', dice: 9, extra: 1, where: { room: 'hall', cellar: true } })
		assert.deepEqual(bad.map((f) => f.field).sort(), ['dice', 'extra', 'mood', 'where.cellar'])
		assert.deepEqual(validateAgainst(form, { ...ok, odds: { fight: 2, flee: 0 } }).map((f) => f.field), ['odds.fight'])
		assert.ok(bad.every((f) => f.fix && f.severity === 'error'))
		assert.deepEqual(validateAgainst(form, { dice: 2 }).map((f) => f.field), ['title'], 'whole: required is required')
		assert.deepEqual(validateAgainst(form, { dice: 2 }, { partial: true }), [], 'partial: only what it names')
	})
})

describe('a sheet asks for its slots by slug', () => {
	test("Vis Itineris's stats: one key per askable slot, bounded by the ruleset's configuration", () => {
		const r = cat.visItinerisRuleset
		const keys = sheetSchemaKeys(r)
		const askable = r.stats.filter((e) => {
			const d = getAttributeSlot(e.id)!
			return d.type !== 'derived' && !d.retired
		})
		assert.deepEqual([...keys.values()], askable.map((e) => e.id))
		assert.equal(keys.get('hp'), 'core:slot/hp@1')
		const hp = (jsonSchemaOf(r).properties as any).hp
		assert.deepEqual([hp.type, hp.minimum, hp.maximum], ['integer', 0, 999])
		assert.ok(hp.description.startsWith('Health'), "the slot's descriptor is what the model reads")
	})

	test('two slots sharing a slug are keyed by their full ids', () => {
		defineAttributeSlot('test.l1:slot/hp@1', { type: 'integer', descriptor: 'Shield points.', appliesTo: ['cast'] })
		const keys = sheetSchemaKeys({ slots: [{ id: 'core:slot/hp@1' }, { id: 'test.l1:slot/hp@1' }, { id: 'core:slot/level@1' }] })
		assert.deepEqual([...keys.keys()], ['core:slot/hp@1', 'test.l1:slot/hp@1', 'level'])
	})

	test('a sheet answer is checked slot by slot', () => {
		const r = cat.visItinerisRuleset
		assert.deepEqual(validateAgainst(r, { hp: 12, level: 3 }, { partial: true }), [])
		const bad = validateAgainst(r, { hp: 1000, level: 0, wings: 2 }, { partial: true })
		assert.deepEqual(bad.map((f) => f.field), ['hp', 'level', 'wings'])
		assert.match(bad[0]!.message, /does not go above 999/)
	})

	test('appliesTo narrows to the slots a sheet puts on that owner', () => {
		const sheet = { slots: [{ id: cat.hpSlot.id }, { id: cat.locationSlot.id }] }
		assert.deepEqual([...sheetSchemaKeys(sheet, { appliesTo: 'cast' }).keys()], ['hp', 'location'])
		assert.deepEqual([...sheetSchemaKeys(sheet, { appliesTo: 'world' }).keys()], ['location'])
		assert.deepEqual(props(jsonSchemaOf(sheet, { appliesTo: 'world' })), ['location'])
	})
})

describe('a repertoire asks for one piece', () => {
	const weapons = cat.VIS_ITINERIS_REPERTOIRES.find((r) => r.id === 'weapons')!

	test('a fitting piece validates, kind or none', () => {
		const row = cat.visItinerisRuleset.library!.rows.weapons![0]!.piece
		assert.deepEqual(validateAgainst(weapons, row), [])
		assert.deepEqual(validateAgainst(weapons, { kind: 'inline', ...row }), [])
	})

	test('a misfit is named, never trimmed', () => {
		const f = validateAgainst(weapons, { description: 'A blade.', sharpness: 3 })
		assert.equal(f.length, 1)
		assert.match(f[0]!.message, /sharpness/)
		assert.equal(validateAgainst(weapons, { kind: 'lore' }).length, 1)
	})
})

describe('what it reads', () => {
	test('anything else is refused with what it takes', () => {
		// 🚧 2026-10-22: a check method kind's options too (CHECK_METHOD_KINDS).
		assert.throws(() => jsonSchemaOf({ nothing: true } as any), /entry type, an attribute sheet, a ruleset, a repertoire, a form block or a check method kind/)
	})
})
