/**
 * Core's components, built (C7): each entry under `components/` becomes one
 * module in `dist/components/<slug>.js`. Runs after `tsc`: the components
 * import this package's own UI kit (`@serene-pub/core-catalog/conversation`,
 * `…/widgets`, …), which resolves to `dist/`.
 *
 * ONE pipeline (C6 P1): the CLI's component compiler (`buildComponentSet`,
 * `@serene-pub/cli/component-compile`) builds all five entries in one run
 * with code splitting — the same guard, loaders and imports every other
 * component is held to — so what they share (Svelte's runtime, the
 * component client, the SDK and core-catalog helpers) lands once, in
 * `shared-<hash>.js` chunks the entries import relatively. Core's UI worker
 * loads them once for every core widget on the page instead of once per
 * widget (unit M). The compiler judges every served module as a host would
 * and serves only what an entry reaches by a static `import`.
 *
 * The split is core's alone: a plugin's components stay self-contained, and
 * nothing here is ever loaded by another owner's worker (one worker per
 * owner, R35).
 *
 * `dist/components/core-ui.json` lists what `/core-ui` serves — every entry
 * by slug, every chunk by file name — with its code, so the app's route
 * imports one file whatever the chunk hashes are.
 */
import * as esbuild from 'esbuild'
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildComponentSet, COMPONENT_CHUNK_FILE, componentSourceHash, isSafeComponentPath } from '@serene-pub/cli/component-compile'
import { CORE_COMPONENTS } from '../dist/registry/widgets.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = join(root, 'dist', 'components')
const sources = join(root, 'components')
const catalogVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version

/** Core component slug → its entry: `CORE_COMPONENTS`, as core declares them. A widget names one by `component: '<slug>'`. */
const COMPONENTS = Object.fromEntries(CORE_COMPONENTS.map((c) => [c.slug, c.entry]))

const built = await buildComponentSet({
	root,
	entries: Object.fromEntries(Object.entries(COMPONENTS).map(([slug, entry]) => [slug, join(root, entry)])),
	outdir,
	esbuild,
})
for (const w of built.warnings) console.warn(`core components: ${w}`)
if (built.bundled.length) console.log(`core components bundle ${built.bundled.join(', ')}`)

await mkdir(outdir, { recursive: true })
// Last build's chunks go: their hashes are not this build's.
for (const f of await readdir(outdir)) if (COMPONENT_CHUNK_FILE.test(f)) await rm(join(outdir, f))
const served = built.modules
for (const [name, code] of Object.entries(served))
	await writeFile(join(outdir, COMPONENT_CHUNK_FILE.test(name) ? name : `${name}.js`), code)
await writeFile(join(outdir, 'core-ui.json'), JSON.stringify(served))

/**
 * Each component's source beside its module (C6 P1): `<slug>.source.json`,
 * the files under `components/` its source graph reaches — relative to it,
 * never a path outside it or into `node_modules` — for an admin to read,
 * clone and diff. Never served by `/core-ui` (its route serves
 * `core-ui.json` only).
 *
 * The bundle's inputs are where the walk STARTS, not all it finds: esbuild
 * erases a type-only import (`import type { … } from './types'`) before it
 * resolves it, so a file only types reach (a local `types.ts`)
 * is never an input, and a clone without it does not typecheck. So every
 * relative `import` / `import type` / `export … from` in every file the
 * walk holds is read statically and followed, within `components/` only.
 */
const realSources = await realpath(sources)

/** Relative specifiers a file imports or re-exports — values and types alike. */
const IMPORT_SPECIFIERS = [
	/(?:^|[\s;{}])(?:import|export)\s+(?:type\s+)?[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
	/(?:^|[\s;{}])import\s*['"]([^'"]+)['"]/g,
	/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]
const relativeSpecifiers = (text) => {
	const out = new Set()
	for (const re of IMPORT_SPECIFIERS) for (const m of text.matchAll(re)) if (m[1].startsWith('.')) out.add(m[1])
	return [...out]
}

/** A relative specifier, resolved as the compiler resolves one (`./types` → `types.ts`, `./x.svelte` → `x.svelte.ts`). */
async function resolveSpecifier(fromFile, specifier) {
	const base = resolve(dirname(fromFile), specifier)
	const candidates = [base, `${base}.ts`, `${base}.js`, `${base}.svelte`, join(base, 'index.ts'), join(base, 'index.js')]
	if (base.endsWith('.js')) candidates.splice(1, 0, `${base.slice(0, -3)}.ts`)
	for (const c of candidates) {
		try {
			if ((await stat(c)).isFile()) return await realpath(c)
		} catch {}
	}
	return undefined
}

/** The component files a component reaches from its bundle inputs, by a static walk of its imports. */
async function sourceGraph(slug, inputs) {
	const seen = new Map() // component path → real file
	const queue = []
	const admit = (real) => {
		const rel = relative(realSources, real)
		if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('node_modules')) return
		const path = rel.split(sep).join('/')
		if (seen.has(path)) return
		if (!isSafeComponentPath(path)) throw new Error(`core component ${slug}: '${path}' is not a component file path`)
		seen.set(path, real)
		queue.push(real)
	}
	for (const input of inputs) admit(await realpath(input))
	while (queue.length) {
		const file = queue.shift()
		for (const specifier of relativeSpecifiers(await readFile(file, 'utf8'))) {
			const real = await resolveSpecifier(file, specifier)
			if (!real) throw new Error(`core component ${slug}: '${specifier}' in ${relative(realSources, file)} resolves to no file`)
			admit(real)
		}
	}
	return seen
}

for (const decl of CORE_COMPONENTS) {
	const files = {}
	for (const [path, real] of await sourceGraph(decl.slug, built.inputs[decl.slug] ?? [])) files[path] = await readFile(real, 'utf8')
	const entry = relative(sources, join(root, decl.entry)).split(sep).join('/')
	if (!Object.hasOwn(files, entry)) throw new Error(`core component ${decl.slug}: its entry ${entry} is not among its sources`)
	const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]))
	const doc = { slug: decl.slug, framework: decl.framework, entry, files: sorted, sourceHash: componentSourceHash(sorted), catalogVersion }
	await writeFile(join(outdir, `${decl.slug}.source.json`), JSON.stringify(doc))
	console.log(`core component ${decl.slug} source → dist/components/${decl.slug}.source.json (${Object.keys(sorted).length} files)`)
}

const bytes = (names) => names.reduce((n, k) => n + Buffer.byteLength(served[k]), 0)
const chunks = Object.keys(served).filter((k) => COMPONENT_CHUNK_FILE.test(k))
for (const slug of Object.keys(COMPONENTS)) console.log(`core component ${slug} → dist/components/${slug}.js (${bytes([slug])} B)`)
console.log(`core components share ${chunks.length} chunk(s), ${bytes(chunks)} B; all modules ${bytes(Object.keys(served))} B`)
