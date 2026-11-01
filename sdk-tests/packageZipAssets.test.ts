import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writePackageZip } from '../cli/src/bin.js'

test('writePackageZip carries the declared assets folder and lang/', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'zip-assets-'))
	const out = join(dir, 'dist', 'plugin')
	await mkdir(out, { recursive: true })
	await writeFile(join(out, 'index.js'), 'x')
	await mkdir(join(dir, 'assets'))
	await writeFile(join(dir, 'assets', 'a.png'), 'png')
	await mkdir(join(dir, 'lang'))
	await writeFile(join(dir, 'lang', 'es.json'), '{}')
	const zip = await writePackageZip(dir, out, { slug: 'acme.lab', version: '0.1.0', assets: { dir: 'assets' } })
	const bytes = await readFile(zip)
	assert.ok(bytes.includes('assets/a.png'))
	assert.ok(bytes.includes('lang/es.json'))
})

// Dated 2026-10-29 (M1 gate): the build's `--ignore` globs reach the zip as
// well as the source scan — a frame's sources beside its built bundle (ui/src) do
// not ship.
test('writePackageZip leaves out what the build ignores', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'zip-ignore-'))
	const out = join(dir, 'dist', 'plugin')
	await mkdir(out, { recursive: true })
	await writeFile(join(out, 'manifest.json'), '{}')
	await mkdir(join(dir, 'ui', 'src'), { recursive: true })
	await writeFile(join(dir, 'ui', 'session.html'), '<html></html>')
	await writeFile(join(dir, 'ui', 'frame.js'), 'x')
	await writeFile(join(dir, 'ui', 'src', 'app.ts'), 'export {}')
	await writeFile(join(dir, 'ui', 'build.mjs'), 'x')
	const zip = await writePackageZip(dir, out, { slug: 'acme.lab', version: '0.1.0' }, ['ui/src/**', 'ui/build.mjs'])
	const bytes = await readFile(zip)
	assert.ok(bytes.includes('ui/session.html'))
	assert.ok(bytes.includes('ui/frame.js'))
	assert.ok(!bytes.includes('ui/src/app.ts'))
	assert.ok(!bytes.includes('ui/build.mjs'))
})
