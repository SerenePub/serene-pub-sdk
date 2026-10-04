/**
 * `@serene-pub/core-catalog/core-widgets` — core's widget declarations without
 * the rest of the catalogue.
 *
 * The app's client reads `CORE_WIDGETS` (titles, presets, settings schemas) to
 * draw the layout editor and the tray. Through the package root it imported
 * every genre, pipeline, prompt and preset core ships as well, and the client
 * bundle carried all of them (~300 kB) to read one list. The subpath reaches
 * the one module that declares the widgets, and this holds it to that: same
 * declarations as the root, and no path back to the root's entry.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const PKG_DIR = path.dirname(require.resolve('@serene-pub/core-catalog/package.json'))
const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8')) as {
	main: string
	exports: Record<string, { import?: string } | string>
}

/** Every package-local module a built module reaches through static imports. */
function reachable(entry: string, seen = new Set<string>()): Set<string> {
	if (seen.has(entry)) return seen
	seen.add(entry)
	const src = readFileSync(entry, 'utf8')
	for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?['"](\.{1,2}\/[^'"]+)['"]/g))
		reachable(path.resolve(path.dirname(entry), m[1]!), seen)
	return seen
}

describe('core-catalog/core-widgets', () => {
	test('is exported, and declares the same widgets as the package root', async () => {
		const sub = pkg.exports['./core-widgets']
		assert.ok(
			sub && typeof sub === 'object' && sub.import,
			'package.json exports ./core-widgets',
		)
		const narrow = await import('@serene-pub/core-catalog/core-widgets')
		const root = await import('@serene-pub/core-catalog')
		assert.deepEqual(
			narrow.CORE_WIDGETS.map((w) => w.id),
			root.CORE_WIDGETS.map((w) => w.id),
		)
		assert.equal(typeof narrow.systemStyleSlug, 'function')
	})

	test('never reaches the package entry, so a client importing it does not carry the catalogue', () => {
		const sub = pkg.exports['./core-widgets'] as { import: string }
		const graph = reachable(path.join(PKG_DIR, sub.import))
		assert.equal(
			graph.has(path.join(PKG_DIR, pkg.main)),
			false,
			'core-widgets imports the package entry',
		)
		assert.ok(
			graph.size < 5,
			`core-widgets reaches ${graph.size} package modules: ${[...graph].join(', ')}`,
		)
	})
})
