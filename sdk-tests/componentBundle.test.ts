/**
 * The component build (§3.5, C3): `create component` writes a component
 * that `serene-pub build` compiles into one module, and the build holds
 * imports to `COMPONENT_IMPORTS` — the renderer and anything absolute are
 * refused, a component's `<style>` is dropped with a warning.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { bundleComponent } from '../cli/src/componentBundle.js'
import { writeComponentScaffold } from '../cli/src/scaffoldComponent.js'

const dirs: string[] = []
async function pkg(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'sp-component-'))
	dirs.push(dir)
	// Resolve svelte and the component client the way an author's package would.
	await symlink(resolve(import.meta.dirname, '..', 'node_modules'), join(dir, 'node_modules'))
	return dir
}
after(async () => {
	for (const d of dirs) await rm(d, { recursive: true, force: true })
})

test('a scaffolded Svelte component builds into one module with no renderer in it', async () => {
	const dir = await pkg()
	await writeComponentScaffold(dir, { slug: 'who-next', widget: true, embedDocument: true })
	const outfile = join(dir, 'out', 'who-next.js')
	const b = await bundleComponent({ entry: join(dir, 'components/who-next.ts'), outfile })
	const js = await readFile(outfile, 'utf8')
	assert.match(js, /export\s*\{/)
	assert.doesNotMatch(js, /@remote-dom/)
	assert.deepEqual(b.bundled, [])
})

test('a vanilla scaffold builds too', async () => {
	const dir = await pkg()
	await writeComponentScaffold(dir, { slug: 'tally', vanilla: true })
	const b = await bundleComponent({ entry: join(dir, 'components/tally.ts'), outfile: join(dir, 'out', 'tally.js') })
	assert.deepEqual(b.warnings, [])
	// The component client's own imports are its business, not the author's.
	assert.deepEqual(b.bundled, [])
})

test('the renderer and absolute imports are refused at build', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(join(dir, 'src/bad.js'), `import '@remote-dom/core'\nexport default () => {}\n`)
	await assert.rejects(bundleComponent({ entry: join(dir, 'src/bad.js'), outfile: join(dir, 'out/bad.js') }), /host's renderer/)
	await writeFile(join(dir, 'src/url.js'), `import 'https://cdn.example/x.js'\nexport default () => {}\n`)
	await assert.rejects(bundleComponent({ entry: join(dir, 'src/url.js'), outfile: join(dir, 'out/url.js') }), /absolute path or URL/)
})

test("a component's <style> is dropped, and said", async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(join(dir, 'src/Styled.svelte'), `<p>hi</p>\n<style>p { color: red; }</style>\n`)
	await writeFile(
		join(dir, 'src/styled.ts'),
		`import { svelteComponent } from '@serene-pub/component-client/svelte'\nimport S from './Styled.svelte'\nexport default svelteComponent(S)\n`,
	)
	const b = await bundleComponent({ entry: join(dir, 'src/styled.ts'), outfile: join(dir, 'out/styled.js') })
	assert.match(b.warnings.join(' '), /<style> is dropped/)
})

test('an alias that LANDS in the renderer is refused, whatever it is called', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	// A stand-in renderer where a vendored copy would sit.
	await mkdir(join(dir, 'vendor/@remote-dom/core'), { recursive: true })
	await writeFile(join(dir, 'vendor/@remote-dom/core/index.js'), `export const r = 1\n`)
	await writeFile(
		join(dir, 'tsconfig.json'),
		JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { 'svelte/x': ['vendor/@remote-dom/core/index.js'] } } }),
	)
	await writeFile(join(dir, 'src/alias.js'), `import 'svelte/x'\nexport default () => {}\n`)
	await assert.rejects(
		bundleComponent({ entry: join(dir, 'src/alias.js'), outfile: join(dir, 'out/alias.js'), root: dir }),
		/resolves into @remote-dom/,
	)
})

test('a rune module is compiled, not shipped as a call to nothing', async () => {
	const dir = await pkg()
	await mkdir(join(dir, 'src'), { recursive: true })
	await writeFile(join(dir, 'src/count.svelte.ts'), `export const count = $state({ n: 0 as number })\n`)
	await writeFile(join(dir, 'src/entry.ts'), `import { count } from './count.svelte.ts'\nexport default () => { count.n++ }\n`)
	await bundleComponent({ entry: join(dir, 'src/entry.ts'), outfile: join(dir, 'out/entry.js'), root: dir })
	const js = await readFile(join(dir, 'out/entry.js'), 'utf8')
	assert.doesNotMatch(js, /count = \$state\(/)
})
