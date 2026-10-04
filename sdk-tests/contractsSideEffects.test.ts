/**
 * contracts' `sideEffects` names every module whose import registers something.
 *
 * Every `describe*Definition` in `@serene-pub/contracts` REGISTERS the node
 * definition it describes, so importing the package is what fills the SDK's
 * definition registry. A package that declares `sideEffects: false` tells a
 * bundler the opposite: a module imported for nothing — `import
 * "@serene-pub/contracts"`, or a chunk that only reads the registry — is
 * dropped with its registrations. core-catalog shipped exactly that once
 * (`coreCatalogSideEffects.test.ts`); this is the same check for contracts.
 *
 * Behavioural, not a list: every built module is imported alone in a fresh
 * process, and any one that leaves a registry non-empty must be named.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const PKG_DIR = path.dirname(require.resolve('@serene-pub/contracts/package.json'))
const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')) as {
	sideEffects: string[] | boolean
	main: string
}

/** Every registry a module can write, as sorted ids. */
const SNAPSHOT = `
import * as sdk from '@serene-pub/sdk'
const ids = (xs) => xs.map((x) => (typeof x === 'string' ? x : x.id)).sort()
process.stdout.write(JSON.stringify({
	definitions: ids(sdk.allDefinitions()),
	slots: ids(sdk.attributeSlots()),
	statShapes: ids(sdk.statShapes()),
	genres: ids(sdk.genres()),
}))
`

function registriesAfter(modules: string[]): Record<string, string[]> {
	const imports = modules
		.map((m) => `await import(${JSON.stringify(pathToFileURL(m).href)})`)
		.join('\n')
	const out = execFileSync(
		process.execPath,
		['--input-type=module', '-e', `${imports}\n${SNAPSHOT}`],
		{
			cwd: import.meta.dirname,
			encoding: 'utf8',
		},
	)
	return JSON.parse(out)
}

/** Every built module, as the `./dist/…` path `sideEffects` spells it. */
function builtModules(dir = path.join(PKG_DIR, 'dist')): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory()
			? builtModules(path.join(dir, e.name))
			: e.name.endsWith('.js')
				? [
						`./${path.posix.relative(PKG_DIR, path.join(dir, e.name)).split(path.sep).join('/')}`,
					]
				: [],
	)
}

const registers = (r: Record<string, string[]>) => Object.values(r).some((ids) => ids.length > 0)

describe('contracts sideEffects', () => {
	const listed = Array.isArray(pkg.sideEffects)
		? pkg.sideEffects.map((p) => path.posix.normalize(p))
		: []

	test('names the package entry, so a bare import of the package is never dropped', () => {
		assert.ok(
			Array.isArray(pkg.sideEffects),
			'sideEffects is a list, not `false`: the package registers on import',
		)
		assert.ok(
			listed.includes(path.posix.normalize(`./${pkg.main}`)),
			`sideEffects must name ${pkg.main}: importing the package registers its node definitions`,
		)
	})

	test('every module that registers on import alone is listed', () => {
		const modules = builtModules()
		assert.ok(modules.length, 'the package is built')
		const unlisted = modules.filter(
			(m) =>
				!listed.includes(path.posix.normalize(m)) &&
				registers(registriesAfter([path.join(PKG_DIR, m)])),
		)
		assert.deepEqual(
			unlisted,
			[],
			'these modules register on import but are missing from contracts package.json `sideEffects` — a bundler will drop them',
		)
	})

	test('the listed modules alone register everything the whole package does', () => {
		const whole = registriesAfter([path.join(PKG_DIR, pkg.main)])
		assert.ok(whole.definitions.length, 'the whole package registers its node definitions')
		assert.deepEqual(registriesAfter(listed.map((p) => path.join(PKG_DIR, p))), whole)
	})
})
