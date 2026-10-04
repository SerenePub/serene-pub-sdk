/**
 * core-catalog's `sideEffects` names every module whose import registers
 * something — and the package entry.
 *
 * Declaring a core entry type, slot, stat shape, genre, annex field list or
 * widget set REGISTERS it, and core reaches them with a bare
 * `import "@serene-pub/core-catalog"` before reading the SDK's registries. A
 * bundler honours `sideEffects`: a module it believes pure, imported for
 * nothing, is dropped — with the registrations in it. A release build did
 * exactly that (the entry was pure, so the bare import went), and the server
 * booted with "entry type 'core:entry/world-lore' is declared by no module in
 * this build". The app's `scripts/coreCatalogRegistrations.int.test.ts` builds
 * that shape for real; this is the package-side half, so a new registering
 * module fails here, at the author, rather than in somebody's production boot.
 *
 * The check is behavioural rather than a list of registering functions: two
 * fresh processes, one importing the whole package and one importing only the
 * modules `sideEffects` names, must end with identical registries.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const PKG_DIR = path.dirname(require.resolve('@serene-pub/core-catalog/package.json'))
const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')) as {
	sideEffects: string[] | boolean
	main: string
}

/** Every registry a catalog module can write, as sorted ids. */
const SNAPSHOT = `
import * as sdk from '@serene-pub/sdk'
const ids = (xs) => xs.map((x) => (typeof x === 'string' ? x : x.id)).sort()
process.stdout.write(JSON.stringify({
	definitions: ids(sdk.allDefinitions()),
	slots: ids(sdk.attributeSlots()),
	statShapes: ids(sdk.statShapes()),
	sheets: ids(sdk.attributeSheets()),
	genres: ids(sdk.genres()),
	annexOwners: [...sdk.annexOwners()].sort(),
	coreWidgets: [...sdk.coreWidgetIds()].sort(),
}))
`

function registriesAfter(modules: string[]): Record<string, string[]> {
	const imports = modules.map((m) => `await import(${JSON.stringify(pathToFileURL(m).href)})`).join('\n')
	const out = execFileSync(process.execPath, ['--input-type=module', '-e', `${imports}\n${SNAPSHOT}`], {
		cwd: import.meta.dirname,
		encoding: 'utf8',
	})
	return JSON.parse(out)
}

describe('core-catalog sideEffects', () => {
	const listed = Array.isArray(pkg.sideEffects) ? pkg.sideEffects : []

	test('names the package entry, so a bare import of the package is never dropped', () => {
		assert.ok(Array.isArray(pkg.sideEffects), 'sideEffects is a list')
		assert.ok(
			listed.includes(`./${path.posix.normalize(pkg.main)}`),
			`sideEffects must name ${pkg.main}: core reaches the registrations with a bare import of the package`,
		)
	})

	test('the listed modules alone register everything the whole package does', () => {
		const whole = registriesAfter([path.join(PKG_DIR, pkg.main)])
		const onlyListed = registriesAfter(
			listed.filter((p) => path.posix.normalize(p) !== path.posix.normalize(pkg.main)).map((p) => path.join(PKG_DIR, p)),
		)
		assert.ok(whole.slots.length && whole.genres.length, 'the whole package registers something')
		assert.deepEqual(
			onlyListed,
			whole,
			'a module that registers on import is missing from core-catalog package.json `sideEffects` — a bundler will drop it',
		)
	})
})
