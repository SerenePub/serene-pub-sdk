/**
 * Lore links — the SDK side of a relationship with an entry at either end
 * (places plan B2, 2026-09-29).
 *
 * `core:outlet/link-lore-entries@1` and `core:outlet/create-lore-entry@1`'s
 * `links` write one; `core:query/lorebook-entries@1` with `withLinks` reads
 * them back, said from each listed entry. What is pinned here is the contract
 * a modder writes against:
 *
 *  · a link carries the relationship's whole descriptor — its **name**, its
 *    **description** (the port that was `label`, renamed with no alias: one
 *    column, one word), its relationship type (`linkType`) and the wording
 *    read from the far end (`reverseLinkType`, empty = one way);
 *  · what you write is what you read — `LoreLinkInput` and `LoreLinkRow` use
 *    the same four words.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { compile, getDefinition, S, slot, spec, validate } from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'
import type { LoreLinkInput, LoreLinkRow } from '@serene-pub/contracts'

const link = () => getDefinition('core:outlet/link-lore-entries@1') as any
const save = () => getDefinition('core:outlet/create-lore-entry@1') as any

test('link-lore-entries takes the ends, the name and the description as ports', () => {
	const d = link()
	assert.deepEqual(Object.keys(d.ports.in).sort(), ['description', 'from', 'name', 'to'])
	assert.equal(d.ports.in.name, S.text)
	assert.equal(d.ports.in.description, S.text)
	// `label` wrote the row's description under a second name (R1). Gone, not aliased.
	assert.equal(d.ports.in.label, undefined)
})

test('the wording both ways is a parameter: leads to, one way, unless told', () => {
	const schema = link().slots.params.schema
	assert.deepEqual(Object.keys(schema).sort(), ['linkType', 'reverseLinkType'])
	assert.equal(schema.linkType.default, 'leads to')
	assert.equal(schema.reverseLinkType.type, 'string')
	// Empty is one way — a reverse wording is something a spec says, never a
	// guess the host makes from the forward one.
	assert.equal(schema.reverseLinkType.default, '')
})

test('a reviewer may retype the words and the name, never the ends', () => {
	assert.deepEqual(link().review.fields, ['linkType', 'reverseLinkType', 'name', 'description'])
	// create-lore-entry's `links` stays out of its review form: a list of
	// references is not a value a reader can retype.
	assert.deepEqual(save().review.fields, ['name', 'content'])
})

test('LoreLinkInput and LoreLinkRow speak the same four words', () => {
	const input: LoreLinkInput = {
		to: 'The Drowned Hall',
		linkType: 'leads north to',
		reverseLinkType: 'leads south to',
		name: 'the rusted iron door',
		description: 'Hinges scream.',
	}
	const byId: LoreLinkInput = { to: 12 }
	const row: LoreLinkRow = {
		id: 7,
		to: { entryId: 12, name: 'The Drowned Hall' },
		linkType: 'leads north to',
		reverseLinkType: 'leads south to',
		name: 'the rusted iron door',
		description: 'Hinges scream.',
	}
	// @ts-expect-error — `label` is retired (now `description`), with no alias.
	const retired: LoreLinkInput = { to: 12, label: 'a stair down' }
	assert.equal(row.linkType, input.linkType)
	assert.equal(row.name, input.name)
	assert.ok(byId && retired)
})

test('a create followed by a link builds and validates, the name and description wired', () => {
	const doc = compile(
		spec('test:spec/lore-links', { version: '1.0.0' })
			.inlet('input', C.userMessage.v1())
			.outlet('save', ($: any) =>
				C.createLoreEntry.v1({ name: $.input.text, content: $.input.text }),
			)
			.outlet('link', ($: any) =>
				C.linkLoreEntries.v1({
					from: $.save.entryId,
					to: $.input.text,
					name: $.input.text,
					description: $.input.text,
					params: slot.params(),
				}),
			)
			.build(),
	)
	assert.deepEqual(
		validate(doc).filter((f) => f.severity === 'error'),
		[],
	)
})
