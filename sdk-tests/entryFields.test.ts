/**
 * 🚧 Typed entry fields through a pipeline (Lair rewrite D2, 2026-10-21).
 *
 * `core:outlet/create-lore-entry@1` takes the entry type's typed fields on a
 * `fields` in-port (evolved in place); `core:outlet/update-lore-entry@1` is
 * the change of an entry the session already has, its `fields` a patch. Both
 * hold the fields to the entry's type with the SDK's one checker,
 * `fieldsFindings` — the call a host makes at the review gate and the commit.
 * A pipeline asks a model for them with `jsonSchemaOf(type)`, so what is
 * asked and what is checked are one declaration.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
	compile,
	definitionContractHash,
	fieldsFindings,
	getDefinition,
	jsonSchemaOf,
	S,
	slot,
	spec,
	validate,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import * as cat from '../core-catalog/src/index.js'

const weapons = () => cat.RULESET_ENTRY_TYPES.find((t) => t.id === 'core:entry/vis-itineris.weapons@1')!

describe('the outlets', () => {
	test('create-lore-entry takes the typed fields as json, and a reviewer may retype them', () => {
		const d = getDefinition('core:outlet/create-lore-entry@1')!
		// pr-6 (2026-10-25, §C-1): `sources`, `match`, `bind` — the placement ports.
		assert.deepEqual(Object.keys(d.ports.in!).sort(), ['bind', 'content', 'fields', 'links', 'match', 'name', 'sources'])
		assert.equal((d.ports.in as any).fields, S.json)
		assert.deepEqual(d.review?.fields, ['name', 'content', 'fields'])
		assert.equal(d.causesEvent, 'core:event/lore-entry-created@1')
	})

	test('update-lore-entry changes an entry the session has: which entry is not the reviewer’s', () => {
		const d = getDefinition('core:outlet/update-lore-entry@1')!
		assert.equal(d.kind, 'outlet')
		assert.equal(d.effects, 'write')
		// pr-6 (2026-10-25, §C-1): `sources`.
		assert.deepEqual(Object.keys(d.ports.in!).sort(), ['content', 'entry', 'fields', 'name', 'sources'])
		assert.equal((d.ports.in as any).entry, S.json)
		assert.equal((d.ports.in as any).fields, S.json)
		assert.deepEqual(Object.keys(d.ports.out!).sort(), ['entryId', 'main'])
		assert.deepEqual(d.review?.fields, ['name', 'content', 'fields'])
		assert.equal(d.causesEvent, undefined, 'no event of its own yet — lore-entry-created means a new row')
	})

	test('the contracts, pinned (create moved with its port; update is new)', () => {
		const hash = (id: string) => definitionContractHash(getDefinition(id)! as any)
		assert.equal(hash('core:outlet/create-lore-entry@1'), CREATE_PIN)
		assert.equal(hash('core:outlet/update-lore-entry@1'), UPDATE_PIN)
	})
})

describe('fieldsFindings', () => {
	test('reads the type by declaration, descriptor, versioned or bare id', () => {
		const ok = { category: 'Upper floor', priority: 2 }
		for (const t of [cat.locationEntryType, 'core:entry/location@1', 'core:entry/location'])
			assert.deepEqual(fieldsFindings(t as any, ok), [], String(t))
		const decl = { ...cat.locationEntryType.entryShape, id: 'core:entry/location@1' }
		assert.deepEqual(fieldsFindings(decl, ok), [])
	})

	test('an unknown type is a finding naming the declared ones', () => {
		const [f] = fieldsFindings('core:entry/dragons', {})
		assert.match(f!.message, /not a declared entry type/)
		assert.match(f!.fix, /core:entry\/location/)
	})

	test('a misfit is refused with the field named, never trimmed', () => {
		const f = fieldsFindings('core:entry/location', { category: 3, terrain: 'swamp' })
		assert.deepEqual(f.map((x) => x.field).sort(), ['category', 'terrain'])
		assert.ok(f.every((x) => x.severity === 'error' && x.fix))
	})

	test("a derived entry type: whole needs the piece's description; a patch only what it names", () => {
		const t = weapons()
		const row = cat.visItinerisRuleset.library!.rows.weapons![0]!.piece
		const { name: _n, ...fields } = row as Record<string, unknown>
		assert.deepEqual(fieldsFindings(t, fields), [])
		const required = Object.entries(t.entryShape.fields!)
			.filter(([k, d]) => k !== 'name' && d.required && d.default === undefined)
			.map(([k]) => k)
		assert.ok(required.includes('description'))
		assert.deepEqual(fieldsFindings(t, {}).map((x) => x.field), required)
		assert.deepEqual(fieldsFindings(t, { supply: 'limited', supplyLimit: 3 }, { partial: true }), [])
		assert.deepEqual(fieldsFindings(t, { supply: 'bottomless' }, { partial: true }).map((x) => x.field), ['supply'])
		assert.deepEqual(fieldsFindings(t, { description: null }, { partial: true }), [], 'a patch clears with null')
	})

	test("the title is the name port, never a field", () => {
		assert.deepEqual(fieldsFindings(weapons(), { name: 'Longsword' }, { partial: true }).map((x) => x.field), ['name'])
	})

	test('a duration is held to what a piece’s is', () => {
		const f = fieldsFindings(weapons(), { duration: { units: 'hour', expiry: 'elapsed' } }, { partial: true })
		assert.deepEqual(f.map((x) => x.field), ['duration'])
		assert.match(f[0]!.message, /elapsed/)
	})
})

describe('a pipeline asks for them and saves them', () => {
	test('jsonSchemaOf(type) → generate-json → create-lore-entry fields, and update-lore-entry by name', () => {
		const place = cat.locationEntryType
		const doc = compile(
			spec('test:spec/room-draft', { version: '1.0.0' })
				.inlet('input', C.userMessage.v1())
				.task('prompt', () =>
					C.assemble.v2({ candidates: [], template: slot.template(), connection: slot.connectionOf('draft') }),
				)
				.oracle('draft', ($: any) =>
					C.generateJson.v1({
						context: $.prompt.context,
						schema: jsonSchemaOf(place, { omit: [place.entryShape.roles.priority!] }) as any,
						connection: slot.connection(),
						params: slot.params(),
					}),
				)
				.outlet('save', ($: any) =>
					C.createLoreEntry.v1({ name: $.input.text, content: $.input.text, fields: $.draft.json, params: slot.params() }),
				)
				.outlet('refile', ($: any) =>
					C.updateLoreEntry.v1({ entry: $.input.text, fields: $.draft.json }),
				)
				.build(),
		)
		assert.deepEqual(
			validate(doc).filter((f) => f.severity === 'error'),
			[],
		)
	})
})

// Moved 2026-10-21 (Lair L1, D2): the `fields` in-port and `fields` in review
// (the app's registryHashes pinned '15401f006df68c').
// Moved 2026-10-25 (pr-6 §C-1): `sources`, `match`, `bind`.
const CREATE_PIN = '4906326bc8f09'
// New 2026-10-21 (Lair L1, D2).
// Moved 2026-10-25 (pr-6 §C-1): `sources`.
const UPDATE_PIN = '1b8f899b227ba2'
