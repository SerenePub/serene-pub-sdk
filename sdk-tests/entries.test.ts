/**
 * Entry types (Part 1) — the declaration shape, and the two guards that keep it
 * a vocabulary rather than a bag.
 *
 * The design claim under test is narrow and checkable: a lorebook row's *kind*
 * is a declared, versioned type; the engine asks that type which field plays
 * which part; and both halves of the field role vocabulary are watched, so a
 * field role nothing declares gets deleted rather than sitting there looking
 * supported.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	ENTRY_ROLES,
	ENTRY_SOURCE_KINDS,
	ENTRY_EXPORT_KEYS,
	ENTRY_ANCHOR_POLICIES,
	allEntryTypes,
	checkEntryTypes,
	describeEntryType,
	snapshotRegistry,
	type EntryShape,
} from '@serene-pub/sdk'
import {
	CORE_ENTRY_TYPES,
	worldLoreEntryType,
	characterLoreEntryType,
	historyEntryType,
} from '@serene-pub/core-catalog'

/** A declaration as data — never registered, so a doctored one claims no id. */
const asType = (id: string, entryShape: EntryShape) => ({ id, entryShape })

describe('the shapes a lorebook row can be', () => {
	test('all five are declared, registered, and the only entry types core ships', () => {
		// Places (L3, 2026-09-17) and items (attributes phase 3a, 2026-09-26)
		// joined the original three; both are world lore's shape with a
		// reason of their own — a place's exits, an item's supply.
		assert.deepEqual(
			allEntryTypes().map((t) => t.id),
			[
				'core:entry/world-lore@1',
				'core:entry/character-lore@1',
				'core:entry/history@1',
				'core:entry/location@1',
				'core:entry/item@1',
			],
		)
		assert.equal(CORE_ENTRY_TYPES.length, 5)
		for (const t of allEntryTypes()) assert.equal(t.kind, 'entry')
	})

	test('each competes in a band the weight maps are total over', () => {
		for (const t of allEntryTypes())
			assert.ok(
				(ENTRY_SOURCE_KINDS as readonly string[]).includes(t.entryShape.sourceKind),
				t.id,
			)
		assert.equal(worldLoreEntryType.entryShape.sourceKind, 'worldLore')
		assert.equal(characterLoreEntryType.entryShape.sourceKind, 'characterLore')
		assert.equal(historyEntryType.entryShape.sourceKind, 'history')
	})

	test('the wire names stay short — a type id is never written into a file', () => {
		// A place and an item declare none: no marker is honest, where a
		// marker no importer reads round-trips into the wrong shape. Both
		// export as world lore and read back as world lore.
		assert.deepEqual(
			allEntryTypes().map((t) => t.entryShape.exportKey),
			['world', 'character', 'history', undefined, undefined],
		)
		for (const t of allEntryTypes())
			if (t.entryShape.exportKey !== undefined)
				assert.ok((ENTRY_EXPORT_KEYS as readonly string[]).includes(t.entryShape.exportKey))
	})

	test('character lore is the one with an anchor, under a core-owned policy', () => {
		assert.equal(worldLoreEntryType.entryShape.roles.anchor, undefined)
		assert.equal(historyEntryType.entryShape.roles.anchor, undefined)
		assert.deepEqual(characterLoreEntryType.entryShape.roles.anchor, {
			column: 'anchorBindingId',
			policy: 'core:policy/binding-visibility@1',
		})
		assert.ok(
			ENTRY_ANCHOR_POLICIES.includes(characterLoreEntryType.entryShape.roles.anchor!.policy),
		)
	})

	test('history declares no priority — absent means no bonus, not a default of 1', () => {
		// The semantic ranker excludes history from the priority boost because
		// the column did not exist. Under one table it would exist for
		// everybody, so the rule has to be carried by the missing field role instead.
		assert.equal(historyEntryType.entryShape.roles.priority, undefined)
		assert.equal(historyEntryType.entryShape.fields?.priority, undefined)
		assert.equal(worldLoreEntryType.entryShape.roles.priority, 'priority')
		assert.equal(characterLoreEntryType.entryShape.roles.priority, 'priority')
	})

	test('order is structured data, never a mini-DSL', () => {
		// `"date:year,month,day"` would be a parser the engine has to ship and
		// every new calendar has to teach. This is the whole difference.
		assert.deepEqual(historyEntryType.entryShape.roles.order, [
			{ field: 'year', dir: 'desc', nulls: 'last' },
			{ field: 'month', dir: 'desc', nulls: 'last' },
			{ field: 'day', dir: 'desc', nulls: 'last' },
		])
		for (const t of allEntryTypes())
			assert.notEqual(typeof t.entryShape.roles.order, 'string', t.id)
	})

	test('render is a variable id or a destination, and both are closed', () => {
		assert.equal(worldLoreEntryType.entryShape.render, 'core:var/world-lore@1')
		assert.equal(historyEntryType.entryShape.render, 'core:var/history@1')
		// Character lore renders into the bound character's own object rather
		// than as a variable of its own, which is why no layout exists for it.
		assert.deepEqual(characterLoreEntryType.entryShape.render, {
			into: 'character-card',
		})
	})

	test('the four field flags are four decisions, not one', () => {
		const priority = worldLoreEntryType.entryShape.fields!.priority!
		assert.equal(priority.queryable, true)
		assert.equal(priority.sortable, true)
		// A "1" contributes nothing to a cosine and dilutes what does.
		assert.equal(priority.embedded, false)
		assert.equal(priority.injected, true)
	})
})

describe('the conformance canary — both directions of the vocabulary', () => {
	test('what core ships is clean', () => {
		assert.deepEqual(checkEntryTypes(allEntryTypes()), [])
	})

	test('a field role the engine does not read is caught', () => {
		// The door refuses this at the author's line; the canary is the
		// backstop for a declaration that did not come through it — a row from
		// another build, a type read back out of the registry.
		const findings = checkEntryTypes([
			...allEntryTypes(),
			asType('core:entry/doctored@1', {
				roles: { title: 'title', colour: 'hue' } as never,
				sourceKind: 'worldLore',
			}),
		])
		assert.equal(findings.length, 1)
		assert.equal(findings[0]!.code, 'E_UNKNOWN_ROLE')
		assert.match(findings[0]!.message, /'colour'/)
		assert.match(findings[0]!.fix, /a field with a longer name/)
	})

	test('a field role nothing declares is caught, so dead ones get deleted', () => {
		// Character lore is the only type that answers `anchor`. Drop it and
		// the question is one the engine asks and nobody hears.
		const findings = checkEntryTypes(
			allEntryTypes().filter((t) => t.id !== 'core:entry/character-lore@1'),
		)
		assert.deepEqual(
			findings.map((f) => f.where),
			['anchor'],
		)
		assert.equal(findings[0]!.code, 'E_DEAD_ROLE')
		assert.match(findings[0]!.fix, /or delete the field role/)
	})

	test('every field role in the frozen vocabulary is answered by somebody', () => {
		const declared = new Set(allEntryTypes().flatMap((t) => Object.keys(t.entryShape.roles)))
		for (const role of ENTRY_ROLES) assert.ok(declared.has(role), role)
	})
})

describe('projection into the one registry', () => {
	test('an entry type is a registry row like any other, with kind entry', () => {
		const [row] = snapshotRegistry([worldLoreEntryType], { release: 'test' })
		assert.equal(row!.id, 'core:entry/world-lore')
		assert.equal(row!.version, 1)
		assert.equal(row!.kind, 'entry')
		// It is not in the graph, so it publishes nothing.
		assert.deepEqual(row!.ports, { in: {}, out: {} })
		assert.deepEqual(row!.slots, {})
	})

	test('the declared fields land in configSchema, the facets in entryShape', () => {
		const [row] = snapshotRegistry([historyEntryType], { release: 'test' })
		assert.deepEqual(Object.keys(row!.configSchema!), [
			'year',
			'month',
			'day',
			'isCompleted',
			'graphed',
		])
		assert.equal(row!.configSchema!.year!.required, true)
		// The half with its own column does not ride inside the blob as well.
		assert.equal('fields' in (row!.entryShape as object), false)
		assert.equal(row!.entryShape!.sourceKind, 'history')
		assert.equal(row!.entryShape!.exportKey, 'history')
	})

	test('a node type carries neither, so nothing else re-hashes by their existing', () => {
		const [row] = snapshotRegistry([{ id: 'x:task/y@1', kind: 'task', ports: {} } as never], {
			release: 'test',
		})
		assert.equal(row!.entryShape, undefined)
		assert.equal(row!.configSchema, undefined)
	})
})

/**
 * Last in the file on purpose: the retry test below registers a type, and a
 * registered type is visible to `allEntryTypes()` for the rest of the process.
 */
describe('what a declaration is refused for', () => {
	const refuses = (decl: unknown, pattern: RegExp) =>
		assert.throws(() => describeEntryType(decl as never), pattern)

	test('a field role the engine does not read', () => {
		refuses(
			{
				id: 'core:entry/refused-role@1',
				roles: { sparkle: 'x' },
				sourceKind: 'worldLore',
			},
			/no engine behaviour reads/,
		)
	})

	test('a source kind outside the five budget bands', () => {
		// The failure this prevents is silent: candidates scored against
		// `undefined` and dropped, with a green suite. It has happened.
		refuses(
			{
				id: 'core:entry/refused-band@1',
				roles: { title: 'title' },
				sourceKind: 'spells',
			},
			/not a budget band/,
		)
	})

	test('a visibility policy core does not implement', () => {
		refuses(
			{
				id: 'core:entry/refused-policy@1',
				roles: { anchor: { column: 'x', policy: 'acme:policy/mine@1' } },
				sourceKind: 'worldLore',
			},
			/never author them/,
		)
	})

	test('a render destination that is neither a variable nor a known target', () => {
		refuses(
			{
				id: 'core:entry/refused-render@1',
				roles: { title: 'title' },
				render: { into: 'sidebar' },
				sourceKind: 'worldLore',
			},
			/not a destination/,
		)
		refuses(
			{
				id: 'core:entry/refused-render-id@1',
				roles: { title: 'title' },
				render: 'world lore',
				sourceKind: 'worldLore',
			},
			/not a variable id/,
		)
	})

	test('an export key no importer reads', () => {
		refuses(
			{
				id: 'core:entry/refused-export@1',
				roles: { title: 'title' },
				sourceKind: 'worldLore',
				exportKey: 'spell',
			},
			/no importer reads/,
		)
	})

	test('an id that is not an entry type id', () => {
		refuses(
			{ id: 'core:query/world-lore@1', roles: {}, sourceKind: 'worldLore' },
			/not a valid entry type id/,
		)
	})

	test('a namespace that is not core — the switch, and it is off', () => {
		refuses(
			{ id: 'acme:entry/spell@1', roles: {}, sourceKind: 'worldLore' },
			/core-authored in this release/,
		)
	})

	test('a refused declaration claims no id, so it can be fixed and retried', () => {
		assert.throws(() =>
			describeEntryType({
				id: 'core:entry/retryable@1',
				roles: { nope: 'x' },
				sourceKind: 'worldLore',
			} as never),
		)
		const fixed = describeEntryType({
			id: 'core:entry/retryable@1',
			roles: { title: 'title' },
			sourceKind: 'worldLore',
		})
		assert.equal(fixed.kind, 'entry')
		assert.equal(fixed.entryShape.sourceKind, 'worldLore')
	})
})
