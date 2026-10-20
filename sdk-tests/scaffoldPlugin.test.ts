/**
 * `serene-pub scaffold plugin` (24 §7, D-5) — the package it writes, held to the
 * same bar a shipped one is.
 *
 * A scaffold is the first thing an author runs, and a scaffold that does not
 * compile is worse than none: the first thing they learn is that the tool lies,
 * and every finding afterwards is one they suspect. So nothing here asserts on
 * the *text* of a template. Each test takes what the scaffold wrote, hands it to
 * the packager the command line hands a real package to, and refuses a single
 * finding — error or warning.
 *
 * The flags compose, and the combinations are where a generator actually breaks:
 * a field emitted for one flag and referenced by another, an import kept when
 * its section was dropped. Every combination is compiled, not a sample.
 *
 * ⚠ The tree is written **inside this workspace**, not `tmpdir()`. A package
 * outside it resolves `@serene-pub/sdk` to the built dist rather than the sources
 * under test — two SDK instances, two definition registries, and a failure that
 * has nothing to do with what is being tested. `fixtures/unified-plugin` says the
 * same thing in its own docblock and for the same reason.
 */

import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

import { main } from '@serene-pub/cli/bin'
import {
	compilePlugin,
	declaredFrameEntries,
	frameEntriesIn,
	matchesGlob,
	renderExampleDocs,
	renderFindings,
	scaffoldPlugin,
	DEFAULT_PERMISSION_IGNORES,
	type CompileResult,
	type SourceFile,
} from '@serene-pub/cli'

/** Everything this suite writes, removed however it ends. */
const ROOT = join(import.meta.dirname, '.scaffolded')

after(async () => {
	await rm(ROOT, { recursive: true, force: true })
})

/* ── Driving the command line ───────────────────────────────────────────── */

/** Scaffold one package under a name of its own, so no two share a slug. */
async function scaffold(name: string, flags: readonly string[]): Promise<string> {
	const dir = join(ROOT, name)
	await rm(dir, { recursive: true, force: true })
	// `--json` for the quiet path: sixteen packages' worth of file listings is
	// not what a failing assertion should be buried under.
	const code = await main([
		'scaffold',
		'plugin',
		dir,
		'--slug',
		`demo.${name}`,
		...flags,
		'--json',
	])
	assert.equal(code, 0, `scaffold ${flags.join(' ')} exited ${code}`)
	return dir
}

/**
 * The source files the packager reads, gathered the way `bin.ts` gathers them —
 * including the default permission mutes, so a stand-in host's `ctx.commit` in
 * `examples/fixtures.ts` is linted without being counted as this plugin's reach.
 */
async function sourcesIn(dir: string): Promise<SourceFile[]> {
	const out: SourceFile[] = []
	const walk = async (d: string) => {
		for (const entry of await readdir(d)) {
			if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
			const full = join(d, entry)
			if ((await stat(full)).isDirectory()) await walk(full)
			else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
				const path = relative(dir, full)
				const muted = DEFAULT_PERMISSION_IGNORES.some((g) => matchesGlob(g, path))
				out.push({
					path,
					text: await readFile(full, 'utf8'),
					...(muted ? { permissions: false } : {}),
				})
			}
		}
	}
	await walk(dir)
	return out
}

/** The packager's own answer about a scaffolded directory — both halves, plus the frames. */
async function compileScaffolded(dir: string): Promise<CompileResult> {
	const sources = await sourcesIn(dir)
	const mod = (await import(pathToFileURL(join(dir, 'src', 'index.ts')).href)) as {
		default: import('@serene-pub/sdk').Extension
	}
	const extension = mod.default
	const frameDocuments = await Promise.all(
		[...new Set([...declaredFrameEntries(extension.surfaces), ...frameEntriesIn(sources)])].map(async (entry) => ({
			path: entry,
			text: await readFile(join(dir, entry), 'utf8'),
		})),
	)
	return compilePlugin({ sources, extension, frameDocuments })
}

/** Nothing at all — not an error, and not a warning either. */
const assertClean = (name: string, r: CompileResult) => {
	assert.equal(r.findings.length, 0, `${name} is not clean:\n${renderFindings(r.findings)}`)
	assert.equal(r.ok, true, `${name} did not compile`)
}

/* ── 105 · what the scaffold writes ─────────────────────────────────────── */

describe('105 · scaffold plugin writes a package the packager accepts', () => {
	/**
	 * Every combination, because a generator breaks between flags rather than
	 * inside one. Sixteen packages is cheap; the bug it catches — an import kept
	 * when its section was dropped — is a scaffold nobody can build.
	 */
	const FLAGS = ['genre', 'action', 'panel', 'storage'] as const
	const combinations = Array.from({ length: 1 << FLAGS.length }, (_, mask) =>
		FLAGS.filter((_f, i) => mask & (1 << i)),
	)

	for (const combination of combinations) {
		const name = combination.length ? combination.join('-') : 'base'
		test(`${name} compiles with no findings`, async () => {
			const dir = await scaffold(
				name,
				combination.map((f) => `--${f}`),
			)
			assertClean(name, await compileScaffolded(dir))
		})
	}

	test('the base scaffold is the file list it promises, and nothing else', async () => {
		const files = (await scaffoldPlugin({ slug: 'demo.base-list' })).map((f) => f.path)
		assert.deepEqual(files, [
			'.gitignore',
			'README.md',
			'examples/first-run.example.ts',
			'examples/fixtures.ts',
			'examples/goldens/.gitkeep',
			'package.json',
			'src/index.ts',
			'test/announcement.test.ts',
			'test/conformance.test.ts',
			'test/example.test.ts',
			'tsconfig.check.json',
			'tsconfig.json',
			'vitest.config.ts',
		])
	})

	test('the engines range includes the release the SDK ships with', async () => {
		// F3 docs gate, stall 7: a 0.6 SDK scaffolded `>=0.7 <0.8`. The floor is
		// the CLI's own minor, with `-0` when it is a prerelease — npm ranges
		// admit a prerelease only through a comparator naming one.
		const version: string = JSON.parse(
			await readFile(join(import.meta.dirname, '..', 'cli', 'package.json'), 'utf8'),
		).version
		const [major, minor] = version.split('.').map(Number) as [number, number]
		const index = (await scaffoldPlugin({ slug: 'demo.engines' })).find((f) => f.path === 'src/index.ts')!
		const range = index.text.match(/engines: \{ 'serene-pub': '([^']+)' \}/)?.[1]
		const floor = `>=${major}.${minor}.0${version.includes('-') ? '-0' : ''}`
		assert.ok(range?.startsWith(`${floor} <`), `${range} does not start at ${floor} (CLI ${version})`)
	})

	test('each flag adds its own files and takes none away', async () => {
		const base = new Set((await scaffoldPlugin({ slug: 'demo.f-base' })).map((f) => f.path))
		const added = async (flag: 'genre' | 'action' | 'panel' | 'storage') => {
			const files = (await scaffoldPlugin({ slug: `demo.f-${flag}`, [flag]: true })).map(
				(f) => f.path,
			)
			for (const b of base) assert.ok(files.includes(b), `--${flag} dropped ${b}`)
			return files.filter((f) => !base.has(f))
		}
		assert.deepEqual(await added('genre'), [
			'src/genre.ts',
			'src/specs/create.ts',
			'src/specs/respond.ts',
		])
		assert.deepEqual(await added('action'), ['src/specs/answer.ts', 'src/specs/ask.ts'])
		assert.deepEqual(await added('panel'), ['components/panel.ts', 'ui/panel.html', 'ui/panel.js'])
		assert.deepEqual(await added('storage'), ['src/storage.ts'])
	})
})

/* ── 105 · what the scaffold writes typechecks ──────────────────────────── */

/**
 * The packager reads syntax and announcements; it never asks TypeScript whether
 * the template's code is *typed* right. A template that passed every test above
 * once failed the author's first `npm run typecheck` — so this runs that script,
 * as written: `tsc --noEmit -p tsconfig.check.json`, in the scaffolded directory,
 * over the same `src`, `test` and `examples` the author's run covers.
 *
 * Which compiler: the scaffold pins `typescript` ^5 in its own devDependencies,
 * and the repo's root TypeScript is 7. This borrows the TypeScript 5 copy nested
 * under api-docs (the same copy `surface.test.ts` uses) and refuses to run if its
 * major differs from the one the scaffold pins.
 *
 * What it resolves against: the scaffold is not npm-installed. Written inside
 * this workspace, its `@serene-pub/*` imports and `@types/node` resolve through
 * the workspace's root `node_modules` — to each package's **built `dist`** types,
 * exactly as an installed copy would. (So an SDK source change shows here only
 * after `npm run sdk:build`, as it does for an author.)
 *
 * ⚠ The one stand-in: `vitest` is not installed anywhere in this workspace, and
 * the scaffold's `test/*.test.ts` import it. A minimal, typed `vitest` stub is
 * written into the scaffold's own `node_modules` — the API surface the template
 * tests use, nothing looser than `unknown`. A template that reaches for a matcher
 * the stub lacks fails here loudly; extend the stub, it is not a finding.
 */

const TS5_TSC = join(import.meta.dirname, '..', 'api-docs', 'node_modules', 'typescript', 'bin', 'tsc')

const VITEST_STUB = `// Stand-in written by sdk-tests/scaffoldPlugin.test.ts — see its comment.
export interface Assertion<T = unknown> {
	not: Assertion<T>
	resolves: Assertion<Awaited<T>>
	rejects: Assertion<unknown>
	toBe(expected: unknown): void
	toEqual(expected: unknown): void
	toStrictEqual(expected: unknown): void
	toMatchObject(expected: object): void
	toMatch(expected: string | RegExp): void
	toContain(expected: unknown): void
	toHaveLength(length: number): void
	toHaveProperty(path: string | readonly string[], value?: unknown): void
	toBeTruthy(): void
	toBeFalsy(): void
	toBeDefined(): void
	toBeUndefined(): void
	toBeNull(): void
	toBeGreaterThan(n: number | bigint): void
	toBeGreaterThanOrEqual(n: number | bigint): void
	toBeLessThan(n: number | bigint): void
	toBeLessThanOrEqual(n: number | bigint): void
	toThrow(expected?: string | RegExp | Error): void
}
type Body = () => void | Promise<void>
export declare function describe(name: string, body: () => void): void
export declare function it(name: string, body: Body, timeout?: number): void
export declare const test: typeof it
export declare function expect<T>(actual: T, message?: string): Assertion<T>
export declare function beforeAll(body: Body): void
export declare function afterAll(body: Body): void
export declare function beforeEach(body: Body): void
export declare function afterEach(body: Body): void
`

/** Run the scaffold's own `typecheck` script, with vitest stubbed; the compiler's output on failure. */
async function typecheckScaffolded(dir: string): Promise<{ code: number; output: string }> {
	const stub = join(dir, 'node_modules', 'vitest')
	await mkdir(stub, { recursive: true })
	await writeFile(join(stub, 'package.json'), JSON.stringify({ name: 'vitest', type: 'module', types: 'index.d.ts' }))
	await writeFile(join(stub, 'index.d.ts'), VITEST_STUB)

	// The script the author runs, not a paraphrase of it.
	const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
	assert.equal(pkg.scripts.typecheck, 'tsc --noEmit -p tsconfig.check.json', 'the typecheck script moved; follow it here')
	const args = pkg.scripts.typecheck.split(' ').slice(1) as string[]

	try {
		const { stdout, stderr } = await promisify(execFile)(process.execPath, [TS5_TSC, ...args], { cwd: dir })
		return { code: 0, output: stdout + stderr }
	} catch (e) {
		const err = e as { code?: number; stdout?: string; stderr?: string }
		return { code: typeof err.code === 'number' ? err.code : 1, output: `${err.stdout ?? ''}${err.stderr ?? ''}` }
	}
}

describe('105 · scaffold plugin writes a package that typechecks', () => {
	test('the borrowed compiler is the major the scaffold pins', async () => {
		const { stdout } = await promisify(execFile)(process.execPath, [TS5_TSC, '--version'])
		const pinned = (await scaffoldPlugin({ slug: 'demo.tc-pin' })).find((f) => f.path === 'package.json')!
		const range: string = JSON.parse(pinned.text).devDependencies.typescript
		assert.equal(stdout.match(/Version (\d+)\./)?.[1], range.match(/(\d+)/)?.[1], `tsc ${stdout.trim()} vs scaffold's ${range}`)
	})

	// Every combination, for the reason the packager tests give.
	const FLAGS = ['genre', 'action', 'panel', 'storage'] as const
	for (let mask = 0; mask < 1 << FLAGS.length; mask++) {
		const combination = FLAGS.filter((_f, i) => mask & (1 << i))
		const name = `tc-${combination.length ? combination.join('-') : 'base'}`
		test(`${name} passes its own npm run typecheck`, async () => {
			const dir = await scaffold(name, combination.map((f) => `--${f}`))
			const { code, output } = await typecheckScaffolded(dir)
			assert.equal(code, 0, `${name} does not typecheck:\n${output}`)
		})
	}

	test('the check is real: a type error in the scaffold fails it', async () => {
		const dir = await scaffold('tc-broken', [])
		const index = join(dir, 'src', 'index.ts')
		await writeFile(index, `${await readFile(index, 'utf8')}\nexport const notANumber: number = 'text'\n`)
		const { code, output } = await typecheckScaffolded(dir)
		assert.notEqual(code, 0)
		assert.match(output, /src\/index\.ts\(\d+,\d+\): error TS2322/)
	})
})

/**
 * A stored-entry zip, read through its central directory — enough to check
 * what `serene-pub build` wrote (it writes no compressed entries). Each CRC is
 * checked, so a corrupt archive fails here rather than at an install.
 */
function readStoredZip(zip: Uint8Array): Map<string, Uint8Array> {
	const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
	let end = zip.length - 22
	while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--
	assert.ok(end >= 0, 'no end-of-central-directory record')
	const count = v.getUint16(end + 10, true)
	let at = v.getUint32(end + 16, true)
	const crc = (d: Uint8Array) => {
		let c = 0xffffffff
		for (const b of d) {
			c ^= b
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		}
		return (c ^ 0xffffffff) >>> 0
	}
	const out = new Map<string, Uint8Array>()
	for (let i = 0; i < count; i++) {
		assert.equal(v.getUint32(at, true), 0x02014b50, 'central directory entry')
		assert.equal(v.getUint16(at + 10, true), 0, 'a stored entry')
		const size = v.getUint32(at + 24, true)
		const nameLen = v.getUint16(at + 28, true)
		const extraLen = v.getUint16(at + 30, true)
		const commentLen = v.getUint16(at + 32, true)
		const local = v.getUint32(at + 42, true)
		const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen))
		const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
		const data = zip.subarray(start, start + size)
		assert.equal(crc(data), v.getUint32(at + 16, true), `${name}: crc`)
		out.set(name, new Uint8Array(data))
		at += 46 + nameLen + extraLen + commentLen
	}
	return out
}

describe('105 · what the built manifest carries', () => {
	test('the whole scaffold builds to one manifest holding every half', async () => {
		const dir = await scaffold('whole', ['--genre', '--action', '--panel', '--storage'])
		const out = join(dir, 'dist', 'plugin')
		assert.equal(await main(['build', dir, '--out', out]), 0)

		// `bundle.js` beside them: the scaffold declares handlers, so the build
		// packages the code that implements them (D-6b).
		assert.deepEqual((await readdir(out)).sort(), ['bundle.js', 'components', 'manifest.json', 'pipelines'])
		const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))

		// the code half
		assert.equal(m.slug, 'demo.whole')
		assert.deepEqual(
			m.nodeDefinitions.map((d: { id: string }) => d.id),
			[
				'demo.whole:task/echo@1',
				'demo.whole:outlet/save-note@1',
				'demo.whole:outlet/read-note@1',
			],
		)

		// the declaration half
		assert.deepEqual(
			m.genres.map((g: { id: string }) => g.id),
			['demo.whole:genre/whole'],
		)
		assert.deepEqual(
			m.presets.map((p: { slug: string }) => p.slug),
			['whole'],
		)
		assert.deepEqual(
			m.prompts.map((p: { slug: string }) => p.slug),
			['whole-default'],
		)
		assert.deepEqual(m.widgets, [{ id: 'panel', title: 'Whole', component: 'panel', channels: ['main'] }])
		assert.deepEqual(
			m.components.map((c: { slug: string; entry: string }) => [c.slug, c.entry]),
			[['panel', 'dist/plugin/components/panel.js']],
		)
		// A quota is declared, because no call site carries one.
		assert.ok(m.permissions.includes('storage:1048576'))
		// The inlet lock is the only subscription a pipeline has, and it is a
		// permission: a pipeline that runs on every message is a side effect.
		assert.ok(m.permissions.includes('event:core:event/message-respond@1'))

		// one document per declared pipeline, and every one under the slug
		assert.deepEqual((await readdir(join(out, 'pipelines'))).sort(), [
			'demo.whole_spec_answer.json',
			'demo.whole_spec_ask.json',
			'demo.whole_spec_create-session.json',
			'demo.whole_spec_respond.json',
		])
	})

	test('it also writes the zip an administrator installs, in the layout the installer reads', async () => {
		const dir = await scaffold('zipped', ['--genre', '--panel'])
		assert.equal(await main(['build', dir]), 0)
		// `dist/<slug>-<version>.zip`, beside the build folder (F3 docs gate,
		// stall 8): Admin › Plugins › Install a package… takes a zip and
		// refuses one with no `dist/plugin/manifest.json`.
		const zip = await readFile(join(dir, 'dist', 'demo.zipped-0.1.0.zip'))
		const entries = readStoredZip(zip)
		assert.deepEqual([...entries.keys()].sort(), [
			'dist/plugin/bundle.js',
			'dist/plugin/components/panel.js',
			'dist/plugin/manifest.json',
			'dist/plugin/pipelines/demo.zipped_spec_create-session.json',
			'dist/plugin/pipelines/demo.zipped_spec_respond.json',
			'ui/panel.html',
			'ui/panel.js',
		])
		// The bytes are the build's, not a re-serialisation.
		assert.deepEqual(
			entries.get('dist/plugin/manifest.json'),
			new Uint8Array(await readFile(join(dir, 'dist', 'plugin', 'manifest.json'))),
		)
	})

	test('an action with no genre of its own requires the genre it serves', async () => {
		const dir = await scaffold('borrowed', ['--action'])
		const out = join(dir, 'dist', 'plugin')
		assert.equal(await main(['build', dir, '--out', out]), 0)
		const m = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'))
		// Never bundled: an id this package references and does not declare is
		// enforced at install.
		assert.deepEqual(m.requires, ['core:event/session-action@1', 'core:genre/story'])
	})
})

describe('105 · the example the scaffold ships really runs', () => {
	test('it builds, validates, runs on the fixture host, and records its first golden', async () => {
		const dir = await scaffold('runnable', ['--genre', '--panel'])
		const goldens = await mkdtemp(join(tmpdir(), 'sp-scaffold-goldens-'))
		try {
			const { pages, report } = await renderExampleDocs({
				dir: join(dir, 'examples'),
				goldensDir: goldens,
				// The scaffold ships an empty `goldens/`, and says so: the first
				// run is a deliberate `UPDATE_GOLDENS=1 npm test`.
				update: true,
				load: (path) => import(pathToFileURL(path).href),
			})
			assert.deepEqual(
				report.map((r) => r.slug),
				['first-run'],
			)
			assert.ok(report[0]!.recorded, 'the first run records the golden')
			assert.match(pages[0]!.markdown, /outcome ok/)
			// The package's own node really ran; the stand-ins are core's.
			assert.match(
				pages[0]!.markdown,
				/▸ input[\s\S]*▸ history[\s\S]*▸ echo[\s\S]*▸ speak[\s\S]*▸ save/,
			)
		} finally {
			await rm(goldens, { recursive: true, force: true })
		}
	})
})

describe('105 · what the scaffold refuses', () => {
	test('a slug that is not a slug, in the words defineExtension uses', async () => {
		await assert.rejects(
			() => scaffoldPlugin({ slug: 'Not A Slug' }),
			/is not a valid plugin slug/,
		)
	})

	test('a directory that already holds one of the files, rather than overwriting it', async () => {
		const dir = await scaffold('twice', [])
		assert.equal(
			await main(['scaffold', 'plugin', dir, '--slug', 'demo.twice']),
			1,
			'a second scaffold over the same directory is refused',
		)
		// And the first one is still there, unchanged.
		assert.match(await readFile(join(dir, 'src', 'index.ts'), 'utf8'), /demo\.twice/)
	})

	test('a call with no slug at all', async () => {
		assert.equal(await main(['scaffold', 'plugin', join(ROOT, 'no-slug')]), 1)
	})
})
