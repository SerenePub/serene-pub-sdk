/**
 * The in-memory component compiler (C6 P0): one build for the CLI and the
 * app. In-app mode refuses every way out of the component's own files and
 * the allowlisted packages — each refusal naming the list — keeps to its
 * limits, maps errors to the AUTHORED file and line, and is deterministic.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as esbuild from 'esbuild'
import * as svelte from 'svelte/compiler'
import { COMPONENT_IMPORTS, componentImportFinding } from '@serene-pub/sdk'
import {
	COMPONENT_COMPILE_LIMITS,
	compileComponentSource,
	isSafeComponentPath,
	toolchainFingerprint,
	type CompileComponentSourceOptions,
} from '../cli/src/componentCompile.js'
import { componentFiles } from '../cli/src/scaffoldComponent.js'

const HERE = import.meta.dirname
const SDK = resolve(HERE, '..')
const LIST = COMPONENT_IMPORTS.map((p) => `'${p}'`).join(', ')

const compile = (files: Record<string, string>, more: Partial<CompileComponentSourceOptions> = {}) =>
	compileComponentSource({
		files,
		entry: 'entry.ts',
		framework: 'svelte',
		mode: 'in-app',
		esbuild,
		svelte,
		resolveFrom: HERE,
		...more,
	})

const scaffold = (o: { slug: string; vanilla?: boolean; widget?: boolean }) => {
	const { files } = componentFiles(o)
	return Object.fromEntries(files.filter((f) => f.path.startsWith('components/')).map((f) => [f.path, f.text]))
}

const dirs: string[] = []
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

test('a scaffolded Svelte component compiles in-app from memory, with no renderer in it', async () => {
	const files = scaffold({ slug: 'who-next', widget: true })
	const r = await compile(files, { entry: 'components/who-next.ts' })
	assert.deepEqual(r.errors, [])
	assert.match(r.code, /export\s*\{/)
	assert.doesNotMatch(r.code, /@remote-dom/)
	assert.match(r.hash, /^[0-9a-f]{64}$/)
})

test('every allowlisted import passes in-app', async () => {
	const r = await compile({
		'entry.ts': [
			`import { svelteComponent } from '@serene-pub/component-client/svelte'`,
			`import { defineComponent } from '@serene-pub/component-client'`,
			`import { CONTROL_REGISTRY } from '@serene-pub/controls'`,
			`import { writable } from 'svelte/store'`,
			`import { tick } from 'svelte'`,
			`import View from './View.svelte'`,
			`export const extras = [defineComponent, CONTROL_REGISTRY, writable, tick]`,
			`export default svelteComponent(View)`,
		].join('\n'),
		'View.svelte': `<script lang="ts">let n: number = $state(1)</script>\n<p>{n}</p>\n`,
	})
	assert.deepEqual(r.errors, [])
	assert.ok(r.code.length > 0)
})

test('a vanilla component compiles, and a Svelte file under vanilla is refused', async () => {
	const files = scaffold({ slug: 'tally', vanilla: true })
	const r = await compile(files, { entry: 'components/tally.ts', framework: 'vanilla' })
	assert.deepEqual(r.errors, [])
	assert.deepEqual(r.warnings, [])
	const bad = await compile({ 'entry.ts': `export default 1\n`, 'V.svelte': `<p/>` }, { framework: 'vanilla' })
	assert.match(bad.errors.map((e) => e.text).join(' '), /framework is vanilla/)
})

/** Each refusal: the specifier as written, and what the refusal says besides the list. */
const REFUSED: Array<[name: string, source: string, says: RegExp]> = [
	['svelte/../../package.json', `import 'svelte/../../package.json'`, /'\.' or '\.\.' segment/],
	['svelte/./index.js', `import 'svelte/./index.js'`, /'\.' or '\.\.' segment/],
	['/etc/passwd', `import '/etc/passwd'`, /absolute path or URL/],
	['../../../x past the root', `import '../../../x'`, /reaches past the component's own files/],
	['./a/../../b mid-path traversal', `import './a/../../b.ts'`, /'\.' or '\.\.' segment/],
	['https:', `import 'https://cdn.example/x.js'`, /absolute path or URL/],
	['data:', `import 'data:text/javascript,export default 1'`, /absolute path or URL/],
	['node:', `import 'node:fs'`, /absolute path or URL/],
	['@remote-dom/core', `import '@remote-dom/core'`, /host's renderer/],
	['the worker runtime', `import '@serene-pub/component-client/worker-runtime'`, /worker runtime/],
	['an import attribute', `import t from './b.ts' with { type: 'text' }\nexport const x = t`, /import attribute/],
	['a json attribute on a listed package', `import p from 'svelte/package.json' with { type: 'json' }\nexport const x = p`, /import attribute/],
	['a backslash', `import './sub\\\\b.ts'`, /NUL or a backslash/],
	['a NUL', `import './b\\0.ts'`, /NUL or a backslash/],
	['%2e%2e relative', `import './%2e%2e/%2e%2e/x.ts'`, /not a plain import path/],
	['%2e%2e under a listed package', `import 'svelte/%2e%2e/package.json'`, /not a plain import path/],
	['an unlisted package', `import 'esm-env'`, /not something a component may import/],
	['a file that is not the component\'s', `import './missing.ts'`, /not one of the component's files/],
	['a listed package\'s non-module file', `import 'svelte/package.json'`, /not a module a component may load/],
]

for (const [name, source, says] of REFUSED)
	test(`in-app refuses ${name}, naming the list`, async () => {
		const r = await compile({ 'entry.ts': `${source}\nexport default 1\n`, 'b.ts': `export default 'b'\n` })
		assert.equal(r.code, '')
		assert.equal(r.hash, '')
		assert.ok(r.errors.length > 0, 'refused')
		const text = r.errors.map((e) => e.text).join('\n')
		assert.match(text, says)
		assert.ok(text.includes(LIST), `names the list: ${text}`)
		// Said once: the list's lead-in never repeats a clause the finding already said.
		const said = text.split('\n')[0]!.split('a component imports its own files relatively').length - 1
		assert.ok(said <= 1, `the lead-in is said ${said} times: ${text}`)
		// Reported where the author wrote it.
		assert.equal(r.errors[0]!.file, 'entry.ts')
		assert.equal(r.errors[0]!.line, 1)
	})

test('a listed name that RESOLVES outside its package is refused (realpath confinement)', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'sp-compile-'))
	dirs.push(dir)
	await symlink(join(SDK, 'node_modules'), join(dir, 'node_modules'))
	await writeFile(join(dir, 'secret.js'), `export default 'server secret'\n`)
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'host-app', type: 'module' }))
	await writeFile(
		join(dir, 'tsconfig.json'),
		JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { 'svelte/evil': ['secret.js'] } } }),
	)
	const r = await compile({ 'entry.ts': `import s from 'svelte/evil'\nexport default s\n` }, { resolveFrom: dir })
	assert.equal(r.code, '')
	const text = r.errors.map((e) => e.text).join('\n')
	assert.match(text, /resolves outside the package 'svelte'/)
	assert.ok(text.includes(LIST))
	// Package mode is the CLI's: a package's own tsconfig is its business.
	const p = await compile({ 'entry.ts': `import s from 'svelte/evil'\nexport default s\n` }, { resolveFrom: dir, mode: 'package' })
	assert.deepEqual(p.errors, [])
})

test('an alias that LANDS on the worker runtime is refused in every mode, whatever it is called', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'sp-compile-'))
	dirs.push(dir)
	await symlink(join(SDK, 'node_modules'), join(dir, 'node_modules'))
	await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'host-app', type: 'module' }))
	await writeFile(
		join(dir, 'tsconfig.json'),
		JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { 'svelte/wr': [join(SDK, 'component-client/src/workerRuntime.ts')] } } }),
	)
	for (const mode of ['in-app', 'package'] as const) {
		const r = await compile({ 'entry.ts': `import 'svelte/wr'\nexport default 1\n` }, { resolveFrom: dir, mode })
		assert.equal(r.code, '', mode)
		assert.match(r.errors.map((e) => e.text).join('\n'), /resolves into the component client's worker runtime/, mode)
	}
})

test('package mode bundles an unlisted package, and says so; in-app refuses it', async () => {
	const files = { 'entry.ts': `import { BROWSER } from 'esm-env'\nexport default BROWSER\n` }
	const p = await compile(files, { mode: 'package' })
	assert.deepEqual(p.errors, [])
	assert.match(p.warnings.join(' '), /bundles esm-env/)
	const a = await compile(files)
	assert.match(a.errors[0]!.text, /not something a component may import/)
})

test('traversal is refused in EVERY mode, the CLI package step included', () => {
	for (const bundled of [false, true]) {
		assert.match(componentImportFinding('svelte/../../package.json', { bundled })!, /'\.' or '\.\.' segment/)
		assert.match(componentImportFinding('@serene-pub/controls/../../x', { bundled })!, /'\.' or '\.\.' segment/)
		assert.match(componentImportFinding('lodash/./x', { bundled })!, /'\.' or '\.\.' segment/)
		assert.match(componentImportFinding('./a\\b', { bundled })!, /NUL or a backslash/)
		assert.equal(componentImportFinding('../shared/context', { bundled }), undefined)
		assert.equal(componentImportFinding('./Card.svelte', { bundled }), undefined)
	}
})

test('authored paths follow the UI-path grammar and the loaders', async () => {
	for (const ok of ['entry.ts', 'a/b.svelte', 'a/b.svelte.ts', 'x.js', 'shared/widgetRef.svelte.js']) assert.ok(isSafeComponentPath(ok), ok)
	for (const bad of ['../x.ts', './x.ts', 'a/../b.ts', '/abs.ts', 'a\\b.ts', 'x.json', 'x.css', 'a//b.ts', 'x\0.ts', '.hidden.ts', 'a/%2e%2e/b.ts'])
		assert.ok(!isSafeComponentPath(bad), bad)
	const r = await compile({ 'entry.ts': `export default 1\n`, '../escape.ts': `x`, 'data.json': `{}` })
	assert.deepEqual(r.errors.map((e) => e.file).sort(), ['../escape.ts', 'data.json'])
	const missing = await compile({ 'other.ts': `export default 1\n` })
	assert.match(missing.errors[0]!.text, /entry 'entry\.ts' is not one of the component's files/)
})

test('the limits refuse', async () => {
	const L = COMPONENT_COMPILE_LIMITS
	assert.deepEqual({ ...L }, { files: 64, fileBytes: 262144, sourceBytes: 1048576, outputBytes: 3145728 })
	const many = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}.ts`, `export default ${i}\n`]))
	many['entry.ts'] = `export default 0\n`
	assert.match((await compile(many)).errors[0]!.text, /at most 64/)
	const big = `export default '${'x'.repeat(L.fileBytes)}'\n`
	assert.match((await compile({ 'entry.ts': big })).errors.map((e) => e.text).join(' '), /a file is at most 262144/)
	const quarter = `export default '${'x'.repeat(L.fileBytes - 64)}'\n`
	const total = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.ts`, quarter]))
	total['entry.ts'] = `export default 0\n`
	assert.match((await compile(total)).errors.map((e) => e.text).join(' '), /a component is at most 1048576/)
	// Output: a host may lower a limit (never raise it) — the check is the same one.
	const out = await compile({ 'entry.ts': `export default '${'y'.repeat(4000)}'\n` }, { limits: { outputBytes: 1000 } })
	assert.match(out.errors[0]!.text, /built module is \d+ bytes — a component is at most 1000/)
	const raised = await compile(many, { limits: { files: 1000 } })
	assert.match(raised.errors[0]!.text, /at most 64/)
})

test('an error in file B line N is reported as B:N', async () => {
	const svelteErr = await compile({
		'entry.ts': `import B from './B.svelte'\nexport default B\n`,
		'B.svelte': `<script>\n\tlet a = 1\n</script>\n<p>{a</p>\n`,
	})
	assert.equal(svelteErr.errors.length, 1)
	assert.equal(svelteErr.errors[0]!.file, 'B.svelte')
	assert.equal(svelteErr.errors[0]!.line, 4)

	const tsErr = await compile({
		'entry.ts': `import b from './lib/b'\nexport default b\n`,
		'lib/b.ts': `const ok = 1\n\nexport default ok +\n`,
	})
	assert.equal(tsErr.errors[0]!.file, 'lib/b.ts')
	assert.equal(tsErr.errors[0]!.line, 4)

	const runeErr = await compile({
		'entry.ts': `import { s } from './s.svelte'\nexport default s\n`,
		's.svelte.ts': `export const s = $state(1)\nconst x: = 2\n`,
	})
	assert.equal(runeErr.errors[0]!.file, 's.svelte.ts')
	assert.equal(runeErr.errors[0]!.line, 2)

	const refused = await compile({
		'entry.ts': `import b from './b'\nexport default b\n`,
		'b.ts': `// fine\n// fine\nimport '@remote-dom/core'\nexport default 1\n`,
	})
	assert.deepEqual([refused.errors[0]!.file, refused.errors[0]!.line], ['b.ts', 3])
})

test("a component's <style> is dropped with a warning; a run-time import() warns", async () => {
	const r = await compile({
		'entry.ts': [
			`import { svelteComponent } from '@serene-pub/component-client/svelte'`,
			`import S from './Styled.svelte'`,
			`const at = 'x'`,
			`export const later = () => import(at)`,
			`export default svelteComponent(S)`,
		].join('\n'),
		'Styled.svelte': `<p>hi</p>\n<style>p { color: red; }</style>\n`,
	})
	assert.deepEqual(r.errors, [])
	assert.match(r.warnings.join('\n'), /Styled\.svelte: its <style> is dropped/)
	assert.match(r.warnings.join('\n'), /imports at run time/)
	assert.doesNotMatch(r.code, /color: red/)
})

test('the output is deterministic: same input, same code and hash', async () => {
	const files = scaffold({ slug: 'who-next', widget: true })
	const a = await compile(files, { entry: 'components/who-next.ts' })
	const b = await compile({ ...files }, { entry: 'components/who-next.ts' })
	assert.equal(a.hash, b.hash)
	assert.equal(a.code, b.code)
	assert.equal(a.fingerprint, b.fingerprint)
	const c = await compile({ ...files, 'components/who-next.ts': files['components/who-next.ts'] + '\n// changed\n' }, { entry: 'components/who-next.ts' })
	assert.equal(c.errors.length, 0)
	assert.equal(a.code === c.code, a.hash === c.hash)
})

test('the toolchain fingerprint names the compiler, bundler, Svelte and the inlined packages', async () => {
	const f = toolchainFingerprint({ esbuild, svelte, resolveFrom: HERE })
	assert.match(f, /^compiler@\d+ /)
	assert.ok(f.includes(`esbuild@${esbuild.version}`), f)
	assert.ok(f.includes(`svelte-compiler@${svelte.VERSION}`), f)
	for (const name of ['svelte', 'sdk', 'component-client', 'controls']) assert.match(f, new RegExp(` ${name}@\\d`), f)
	assert.equal((await compile({ 'entry.ts': `export default 1\n` })).fingerprint, f)
})
