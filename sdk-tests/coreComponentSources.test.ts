/**
 * Core's components as sources (C6 P1): declared through the public API
 * (`CORE_COMPONENTS`, R26), each written beside its module as
 * `dist/components/<slug>.source.json` — files under `components/` only —
 * and each compiling in the in-app compiler's strict mode from that file as
 * it stands, on the grown import list. The cloneable four then run their
 * whole behaviour drivers again, mounted from that in-app build (below).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as esbuild from 'esbuild'
import {
	COMPONENT_IMPORTS,
	component,
	componentFindings,
	componentImportFinding,
	componentModuleFindings,
} from '@serene-pub/sdk'
import { CORE_COMPONENTS, CORE_VIEW_ONLY_COMPONENTS, CORE_WIDGETS } from '@serene-pub/core-catalog'
import { COMPONENT_CHUNK_FILE, compileComponentSource, componentSourceHash, isSafeComponentPath } from '../cli/src/componentCompile.js'
import { compileCoreSource, coreComponentSource } from './componentMount.js'

const CORE_CATALOG = resolve(import.meta.dirname, '..', 'core-catalog')
const DIST = join(CORE_CATALOG, 'dist', 'components')
const SLUGS = CORE_COMPONENTS.map((c) => c.slug)
const CLONEABLE = SLUGS.filter((s) => !CORE_VIEW_ONLY_COMPONENTS.includes(s))
const HASH = 'a'.repeat(64)

test('CORE_COMPONENTS validates, and names every core widget component — messages view-only', () => {
	assert.deepEqual(componentFindings(CORE_COMPONENTS), [])
	assert.deepEqual(
		[...SLUGS].sort(),
		[...new Set(CORE_WIDGETS.map((w) => w.component).filter((c): c is string => !!c))].sort(),
	)
	assert.ok(CORE_COMPONENTS.every((c) => c.__decl === 'component' && c.framework === 'svelte' && !c.basedOn))
	assert.deepEqual([...CORE_VIEW_ONLY_COMPONENTS], ['messages'])
	assert.deepEqual(CLONEABLE, ['world-state', 'stats', 'lore-entries', 'scene-portraits', 'authors-note'])
})

test("a clone's basedOn carries the upstream's sourceHash — optional, and SHA-256 hex when given", () => {
	const clone = (basedOn: unknown) =>
		componentFindings([
			component({ slug: 'my-stats', label: 'My stats', entry: 'dist/my-stats.js', framework: 'svelte', basedOn: basedOn as never }),
		])
	assert.deepEqual(clone({ component: 'stats', version: '0.6.0' }), [])
	assert.deepEqual(clone({ component: 'stats', version: '0.6.0', sourceHash: HASH }), [])
	assert.match(clone({ component: 'stats', version: '0.6.0', sourceHash: 'abc' }).join(' '), /sourceHash is the upstream source's SHA-256/)
	assert.match(clone({ component: 'stats', version: '0.6.0', sourceHash: HASH.toUpperCase() }).join(' '), /64 lowercase hex/)
	assert.match(clone({ component: 'stats', version: '0.6.0', sourceHash: 7 }).join(' '), /sourceHash/)
	assert.match(clone({ component: 'stats' }).join(' '), /basedOn is \{ component, version, sourceHash\? \}/)
})

test('componentSourceHash is order-free and moves with any path or byte', () => {
	const a = componentSourceHash({ 'x.ts': '1', 'y.svelte': '2' })
	assert.match(a, /^[0-9a-f]{64}$/)
	assert.equal(componentSourceHash({ 'y.svelte': '2', 'x.ts': '1' }), a)
	assert.notEqual(componentSourceHash({ 'x.ts': '1', 'y.svelte': '2 ' }), a)
	assert.notEqual(componentSourceHash({ 'z.ts': '1', 'y.svelte': '2' }), a)
	// A path and its content cannot be traded across the boundary.
	assert.notEqual(componentSourceHash({ 'x.ts': '1\ny.svelte' }), componentSourceHash({ 'x.ts': '1', 'y.svelte': '' }))
})

describe('dist/components/<slug>.source.json', () => {
	for (const decl of CORE_COMPONENTS)
		test(`${decl.slug}: files under components/ only, as they are on disk, hashed and versioned`, async () => {
			const doc = await coreComponentSource(decl.slug)
			const version = JSON.parse(await readFile(join(CORE_CATALOG, 'package.json'), 'utf8')).version
			assert.deepEqual(Object.keys(doc).sort(), ['catalogVersion', 'entry', 'files', 'framework', 'slug', 'sourceHash'])
			assert.equal(doc.slug, decl.slug)
			assert.equal(doc.framework, decl.framework)
			assert.equal(doc.catalogVersion, version)
			assert.equal(`components/${doc.entry}`, decl.entry)
			const paths = Object.keys(doc.files)
			assert.ok(paths.includes(doc.entry))
			assert.deepEqual(paths, [...paths].sort())
			for (const path of paths) {
				assert.ok(isSafeComponentPath(path), path)
				assert.ok(!path.split('/').includes('..') && !path.startsWith('/') && !path.includes('node_modules'), path)
				assert.equal(doc.files[path], await readFile(join(CORE_CATALOG, 'components', path), 'utf8'), path)
			}
			assert.equal(doc.sourceHash, componentSourceHash(doc.files))
			// The shared helpers a component reaches ride along with its own files.
			if (decl.slug !== 'messages') assert.ok(paths.includes('sessions/shared/widgetRef.svelte.ts'))
		})

	test('every relative import in every included file — type-only ones too — resolves to an included file', async () => {
		const posix = (from: string, spec: string) => {
			const parts = from.split('/').slice(0, -1)
			for (const seg of spec.split('/')) {
				if (seg === '..') parts.pop()
				else if (seg !== '.') parts.push(seg)
			}
			return parts.join('/')
		}
		for (const slug of SLUGS) {
			const { files } = await coreComponentSource(slug)
			for (const [path, text] of Object.entries(files)) {
				const specs = [
					...text.matchAll(/(?:^|[\s;{}])(?:import|export)\s+(?:type\s+)?[^'";]*?\bfrom\s*['"](\.[^'"]*)['"]/g),
					...text.matchAll(/(?:^|[\s;{}])import\s*['"](\.[^'"]*)['"]/g),
				].map((m) => m[1]!)
				for (const spec of specs) {
					const base = posix(path, spec)
					const hit = [base, `${base}.ts`, `${base}.js`, `${base}.svelte`, `${base}/index.ts`].some((c) => Object.hasOwn(files, c))
					assert.ok(hit, `${slug}: '${spec}' in ${path} resolves to no included file`)
				}
			}
		}
		// A file reached only by `import type` — erased before the bundle
		// resolves it — is held to the same rule by the loop above (the
		// pattern reads `import type` too). Core's messages kept one such file,
		// `types.ts`, until F1 moved its shapes into the SDK's public types.
	})

	test('nothing in dist/components is a source.json but the five, and /core-ui serves none of them', async () => {
		const files = await readdir(DIST)
		assert.deepEqual(
			files.filter((f) => f.endsWith('.source.json')).sort(),
			SLUGS.map((s) => `${s}.source.json`).sort(),
		)
		const served = Object.keys(JSON.parse(await readFile(join(DIST, 'core-ui.json'), 'utf8')))
		assert.deepEqual(served.filter((n) => !COMPONENT_CHUNK_FILE.test(n)).sort(), [...SLUGS].sort())
		assert.ok(served.every((n) => !n.includes('source')))
	})
})

test("core's sources import the SDK only through '@serene-pub/sdk/component'", async () => {
	const all = new Set<string>()
	for (const slug of SLUGS) for (const [path, text] of Object.entries((await coreComponentSource(slug)).files)) {
		for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) all.add(m[1]!)
		assert.doesNotMatch(text, /from\s+["']@serene-pub\/sdk["']/, path)
	}
	const bare = [...all].filter((s) => !s.startsWith('.')).sort()
	for (const s of bare) assert.equal(componentImportFinding(s), undefined, s)
	assert.ok(bare.includes('@serene-pub/sdk/component'))
})

test('the import list grew additively by exactly the component kit — and nothing else of either package is admitted', async () => {
	assert.deepEqual(
		COMPONENT_IMPORTS.slice(0, 5),
		['svelte', 'svelte/*', '@serene-pub/component-client', '@serene-pub/component-client/*', '@serene-pub/controls'],
		'the list grows; it never shrinks or reorders',
	)
	const kit = [
		'@serene-pub/sdk/component',
		'@serene-pub/core-catalog/conversation',
		'@serene-pub/core-catalog/lore-entries',
		'@serene-pub/core-catalog/scene-portraits',
		'@serene-pub/core-catalog/session-state',
		'@serene-pub/core-catalog/widgets',
		'@serene-pub/core-catalog/authors-note',
	]
	assert.deepEqual(COMPONENT_IMPORTS.slice(5), kit)
	for (const s of kit) assert.equal(componentImportFinding(s), undefined, s)
	for (const s of ['@serene-pub/sdk', '@serene-pub/sdk/testing', '@serene-pub/core-catalog', '@serene-pub/core-catalog/components/core-ui.json', '@serene-pub/sdk/component/x'])
		assert.match(componentImportFinding(s)!, /not something a component may import/, s)

	// In-app, each kit subpath compiles as an author writes it; the SDK's root still does not.
	const inApp = (text: string) =>
		compileComponentSource({ files: { 'entry.ts': text }, entry: 'entry.ts', framework: 'vanilla', mode: 'in-app', esbuild, resolveFrom: CORE_CATALOG })
	const ok = await inApp(
		[
			`import { actionIdentity, i18nText, EMPTY_TURN_ORDER, WIDGET_PROTOCOL } from '@serene-pub/sdk/component'`,
			`import { staleOf } from '@serene-pub/core-catalog/conversation'`,
			`import { WIDGET_CONTEXT_KEY } from '@serene-pub/core-catalog/widgets'`,
			`import { statsView } from '@serene-pub/core-catalog/session-state'`,
			`import * as lore from '@serene-pub/core-catalog/lore-entries'`,
			`import * as portraits from '@serene-pub/core-catalog/scene-portraits'`,
			`export const all = [actionIdentity, i18nText, EMPTY_TURN_ORDER, WIDGET_PROTOCOL, staleOf, WIDGET_CONTEXT_KEY, statsView, lore, portraits]`,
		].join('\n'),
	)
	assert.deepEqual(ok.errors, [])
	const root = await inApp(`import { actionIdentity } from '@serene-pub/sdk'\nexport const a = actionIdentity`)
	assert.match(root.errors.map((e) => e.text).join(' '), /'@serene-pub\/sdk' is not something a component may import/)
})

describe('every core component compiles in-app from its source.json', { timeout: 180_000 }, () => {
	for (const slug of SLUGS)
		test(slug, async () => {
			const built = await compileCoreSource(slug)
			assert.deepEqual(built.errors, [])
			assert.match(built.hash, /^[0-9a-f]{64}$/)
			assert.deepEqual(componentModuleFindings(built.code).errors, [])
			assert.doesNotMatch(built.code, /\bimport\s*\(/)
			assert.doesNotMatch(built.code, /^\s*import\s[^;]*from\s*["']/m, 'self-contained: no import left')
			// Nothing bundled beyond the listed kit, and no warning but Svelte's own a11y note.
			assert.deepEqual(
				built.warnings.filter((w) => !/Avoid using autofocus/.test(w)),
				[],
			)
		})
})

/**
 * The cloneable five, mounted from the in-app build and put through the
 * SAME drivers the shipped modules pass: every behaviour test those files
 * hold runs again here (`SP_CORE_COMPONENT_BUILD=in-app` switches their
 * mount; `componentMount.ts`).
 */
describe('the cloneable five, built in-app from source.json, behave as shipped', { timeout: 900_000 }, async () => {
	process.env.SP_CORE_COMPONENT_BUILD = 'in-app'
	assert.deepEqual(CLONEABLE, ['world-state', 'stats', 'lore-entries', 'scene-portraits', 'authors-note'])
	await import('./coreStateWidgets.test.js')
	await import('./coreLoreEntriesComponent.test.js')
	await import('./coreScenePortraitsComponent.test.js')
	await import('./coreAuthorsNoteComponent.test.js')
})
