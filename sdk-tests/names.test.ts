/**
 * The name rule (lair pass R7, 2026-09-28) — `normalizeName`, `sameName`,
 * `namesName`, `passageNaming` in `sdk/src/names.ts`.
 *
 * `core:task/undescribed-name@1` decides whether the party knock at a door or
 * walk through it, and it decides it on this rule: an entry "answers to" a room
 * when the two names normalize equal, and a paragraph "describes" it when it
 * names it and says enough besides. A second, drifted copy of the rule would
 * not fail; it would knock at an open door. So the edges are pinned here:
 * articles, punctuation, case, NFKC, possessives, whole equality (never a
 * substring), and the word count that separates a description from a mention.
 * The definition's own shape (ports and tunable params) is pinned at the end.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
	getDefinition,
	LEADING_ARTICLES,
	nameWords,
	namesName,
	normalizeName,
	passageNaming,
	sameName,
} from '@serene-pub/sdk'
import * as C from '@serene-pub/contracts'

describe('normalizeName', () => {
	test('case, surrounding whitespace and inner runs of whitespace', () => {
		assert.equal(normalizeName('  Sunken   VAULT \n'), 'sunken vault')
	})

	test('one leading article is dropped: the, a, an', () => {
		assert.deepEqual([...LEADING_ARTICLES], ['the', 'a', 'an'])
		assert.equal(normalizeName('The Vault'), 'vault')
		assert.equal(normalizeName('a vault'), 'vault')
		assert.equal(normalizeName('An Armory'), 'armory')
	})

	test('only ONE article, and only at the front', () => {
		assert.equal(normalizeName('The The'), 'the')
		assert.equal(normalizeName('Hall of the Kings'), 'hall of the kings')
	})

	test('an article alone is a name, not nothing', () => {
		assert.equal(normalizeName('The'), 'the')
		assert.equal(normalizeName('A'), 'a')
	})

	test('an article must be a whole word ("Theatre" keeps its "the")', () => {
		assert.equal(normalizeName('Theatre of Bones'), 'theatre of bones')
		assert.equal(normalizeName('Anvil Hall'), 'anvil hall')
	})

	test('surrounding quotes and punctuation go', () => {
		assert.equal(normalizeName('"The Vault."'), 'vault')
		assert.equal(normalizeName('‘The Vault’!'), 'vault')
		assert.equal(normalizeName('*The Vault*'), 'vault')
		assert.equal(normalizeName('(the vault)'), 'vault')
	})

	test('inner punctuation separates words; apostrophes and possessives join', () => {
		assert.equal(normalizeName('Hall-of-Mirrors'), 'hall of mirrors')
		assert.equal(normalizeName("Dragon's Den"), 'dragon den')
		assert.equal(normalizeName('Dragon’s Den'), 'dragon den')
		assert.equal(normalizeName("O'Brien's Rest"), 'obrien rest')
	})

	test('NFKC: compatibility forms fold (full-width, ligatures)', () => {
		assert.equal(normalizeName('ＴＨＥ ＶＡＵＬＴ'), 'vault')
		assert.equal(normalizeName('The ﬁre pit'), 'fire pit')
	})

	test('letters beyond ASCII are letters, not separators', () => {
		assert.equal(normalizeName('The Café Crypt'), 'café crypt')
		assert.equal(normalizeName('Die Höhle'), 'die höhle')
	})

	test('anything but a string, and an empty string, is no name', () => {
		assert.equal(normalizeName(undefined), '')
		assert.equal(normalizeName(null), '')
		assert.equal(normalizeName(42), '')
		assert.equal(normalizeName({ name: 'x' }), '')
		assert.equal(normalizeName('  ...  '), '')
	})
})

describe('sameName', () => {
	test('equal after normalizing', () => {
		assert.ok(sameName('The Sunken Vault', 'sunken vault'))
		assert.ok(sameName('"the sunken vault."', 'A Sunken Vault'))
	})

	test('whole equality, never a substring', () => {
		assert.ok(!sameName('the vault', 'the sunken vault'))
		assert.ok(!sameName('Cellar', 'The Wine Cellars'))
	})

	test('two empty names are not the same name', () => {
		assert.ok(!sameName('', ''))
		assert.ok(!sameName(undefined, '   '))
	})
})

describe('namesName (prose)', () => {
	test('whole words, a contiguous run, punctuation around it ignored', () => {
		assert.ok(namesName('They reach the sunken vault, dark and cold.', 'The Sunken Vault'))
		assert.ok(namesName("The Sunken Vault's door is iron.", 'Sunken Vault'))
		assert.ok(!namesName('The sunken vaults stretch on.', 'Sunken Vault'))
		assert.ok(!namesName('The vaulted ceiling.', 'Vault'))
		assert.ok(!namesName('A sunken, broken vault.', 'Sunken Vault'))
	})

	test('the text keeps its article; only the name loses it', () => {
		assert.deepEqual(nameWords('The Vault'), ['the', 'vault'])
		assert.ok(namesName('the vault', 'The Vault'))
	})
})

describe('passageNaming', () => {
	const twelve = 'one two three four five six seven eight nine ten eleven twelve'

	test('a paragraph with the name and >= minWords other words is the passage', () => {
		const text = `The Sunken Vault: ${twelve}.`
		assert.equal(passageNaming(text, 'the sunken vault', 12), text)
	})

	test('a paragraph one word short is a mention, not a description', () => {
		const eleven = twelve.split(' ').slice(0, 11).join(' ')
		assert.equal(passageNaming(`Sunken Vault ${eleven}`, 'The Sunken Vault', 12), null)
		assert.equal(
			passageNaming(`Sunken Vault ${eleven}`, 'The Sunken Vault', 11),
			`Sunken Vault ${eleven}`,
		)
		// "the" before the name in the prose is a word besides it.
		assert.equal(
			passageNaming(`The Sunken Vault ${eleven}`, 'Sunken Vault', 12),
			`The Sunken Vault ${eleven}`,
		)
	})

	test('a 10-word paragraph does not describe at the default of 12', () => {
		const text = 'The Sunken Vault is cold, wet and smells of old rusted iron.'
		assert.equal(nameWords(text).length - 2, 10)
		assert.equal(passageNaming(text, 'Sunken Vault', 12), null)
	})

	test('every occurrence of the name is subtracted', () => {
		const text = 'Vault vault vault vault vault vault vault vault vault vault vault vault vault'
		assert.equal(passageNaming(text, 'vault', 1), null)
	})

	test('paragraphs split on blank lines, whitespace-only ones included; only the naming paragraph counts', () => {
		const text = `A short line about the Sunken Vault.\n   \n${twelve} and more words than needed here.\n\nNothing.`
		assert.equal(passageNaming(text, 'Sunken Vault', 12), null)
		const long = `Intro.\n\nThe Sunken Vault ${twelve}.\n\nOutro.`
		assert.equal(passageNaming(long, 'Sunken Vault', 12), `The Sunken Vault ${twelve}.`)
	})

	test('a single newline does not split a paragraph', () => {
		const text = `The Sunken Vault.\n${twelve}.`
		assert.equal(passageNaming(text, 'Sunken Vault', 12), text)
	})

	test('no name, or no text, is no passage', () => {
		assert.equal(passageNaming(`The ${twelve}`, '', 0), null)
		assert.equal(passageNaming(undefined, 'Vault', 0), null)
	})
})

describe('core:task/undescribed-name@1 (the definition)', () => {
	const d = getDefinition('core:task/undescribed-name@1') as any

	test('is a task with the four in-ports R7 names, A27\'s fallback, and five out-ports', () => {
		assert.ok(C.undescribedName, 'not exported by contracts')
		assert.ok(d, 'not registered')
		assert.equal(d.kind, 'task')
		assert.deepEqual(Object.keys(d.ports.in).sort(), [
			'entries',
			'fallbackName',
			'locationEntries',
			'messages',
			'name',
		])
		assert.deepEqual(Object.keys(d.ports.out).sort(), [
			'describedBy',
			'entryId',
			'main',
			'passage',
			'undescribed',
		])
	})

	test('channels, window and minWords are declared, tunable parameters', () => {
		const schema = (d.slots as any).params.schema
		assert.deepEqual(schema.channels.default, ['main'])
		assert.equal(schema.window.default, 40)
		assert.equal(schema.minWords.default, 12)
	})

	test('unlisted-name@1 is gone, with no alias', () => {
		assert.equal(getDefinition('core:task/unlisted-name@1'), undefined)
	})
})
